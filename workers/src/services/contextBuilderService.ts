/**
 * Context Builder Service
 * Implements RFC-CTX-001: Explicit Context Management
 * Implements RFC-MEM-001: Session & Project Memory Store (Pinned Items)
 * Implements RFC-CTX-003: Dynamic Context Window Management
 */

import type { 
  Env, 
  VectorSearchResult, 
  AgentTurn,
  ManagedPromptContextResult,
  ContextSourceItem,
  TruncationResult
} from '../types.js';
import { getPinnedItemsForProject } from '../lib/kvStore.js';
import { 
  countTokens, 
  getModelConfig, 
  getAvailablePromptTokens, 
  estimateCharsForTokens,
  type LLMModelConfig 
} from '../lib/tokenizer.js';

export interface ContextSource {
  type: 'file' | 'folder' | 'pinned_file' | 'pinned_snippet' | 'vector_result' | 'implicit_file';
  path?: string;
  description?: string;
  content: string;
}

export interface ContextBuildResult {
  contextString: string;
  includedSources: string[];
  sources: ContextSource[];
  totalCharacters: number;
}

export interface ContextBuildOptions {
  explicitPaths?: string[];
  pinnedItemIds?: string[];
  includePinned?: boolean;
  vectorSearchResults?: VectorSearchResult[];
  maxFolderFiles?: number;
  maxFileSize?: number;
  // RFC-CTX-002: Implicit context support
  implicitContext?: {
    last_focused_file_path?: string;
  };
}

/**
 * Build comprehensive context for LLM prompts by aggregating:
 * - Explicitly tagged files/folders (@file/@folder)
 * - Pinned context items (files and text snippets)
 * - Implicit context (last focused file)
 * - Vector search results (optional)
 * 
 * Implements RFC-CTX-001: Explicit Context Management
 * Implements RFC-CTX-002: Implicit Context Aggregation
 */
export async function buildPromptContext(
  env: Env,
  projectId: string,
  options: ContextBuildOptions = {}
): Promise<ContextBuildResult> {
  const {
    explicitPaths = [],
    pinnedItemIds = [],
    includePinned = true,
    vectorSearchResults = [],
    maxFolderFiles = 10,
    maxFileSize = 50000, // 50KB max per file
    implicitContext
  } = options;

  const contextSources: ContextSource[] = [];
  const includedSources: string[] = [];
  let totalCharacters = 0;

  try {
    // A. Fetch Pinned Context Items
    if (includePinned) {
      const pinnedItems = await getPinnedItemsForProject(env.METADATA_KV, projectId);
      
      // Filter by specific IDs if provided
      const targetPinnedItems = pinnedItemIds.length > 0 
        ? pinnedItems.filter(item => pinnedItemIds.includes(item.id))
        : pinnedItems;

      for (const item of targetPinnedItems) {
        if (item.type === 'text_snippet') {
          const source: ContextSource = {
            type: 'pinned_snippet',
            description: item.description || item.id,
            content: item.content
          };
          contextSources.push(source);
          includedSources.push(`Pinned Snippet: ${item.description || item.id}`);
          totalCharacters += item.content.length;
        } else if (item.type === 'file_path') {
          // Add pinned file paths to explicit paths for processing
          if (!explicitPaths.includes(item.content)) {
            explicitPaths.push(item.content);
          }
        }
      }
    }

    // B. Fetch Content for Explicit Paths (including pinned file paths)
    const uniquePaths = [...new Set(explicitPaths)];
    
    for (const path of uniquePaths) {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      
      if (isLikelyFolder(normalizedPath)) {
        // Handle folder paths
        const folderSources = await fetchFolderContent(
          env,
          projectId,
          normalizedPath,
          maxFolderFiles,
          maxFileSize
        );
        
        contextSources.push(...folderSources);
        folderSources.forEach(source => {
          includedSources.push(`Folder File: ${source.path}`);
          totalCharacters += source.content.length;
        });
      } else {
        // Handle individual file paths
        const fileSource = await fetchFileContent(
          env,
          projectId,
          normalizedPath,
          maxFileSize
        );
        
        if (fileSource) {
          contextSources.push(fileSource);
          includedSources.push(`File: ${normalizedPath}`);
          totalCharacters += fileSource.content.length;
        } else {
          // Add note about missing file
          const notFoundSource: ContextSource = {
            type: 'file',
            path: normalizedPath,
            content: `[File not found: ${normalizedPath}]`
          };
          contextSources.push(notFoundSource);
          includedSources.push(`File (not found): ${normalizedPath}`);
          totalCharacters += notFoundSource.content.length;
        }
      }
    }

    // C. Handle Implicit Context (RFC-CTX-002)
    if (implicitContext?.last_focused_file_path) {
      const implicitFilePath = implicitContext.last_focused_file_path;
      const normalizedImplicitPath = implicitFilePath.startsWith('/') ? implicitFilePath.slice(1) : implicitFilePath;
      
      // Check if this file is already included via explicit paths or pinned items
      const alreadyIncluded = uniquePaths.some(path => {
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        return normalizedPath === normalizedImplicitPath;
      });
      
      if (!alreadyIncluded) {
        const implicitFileSource = await fetchFileContent(
          env,
          projectId,
          normalizedImplicitPath,
          maxFileSize
        );
        
        if (implicitFileSource) {
          // Mark as implicit context source
          const implicitSource: ContextSource = {
            type: 'implicit_file',
            path: normalizedImplicitPath,
            content: implicitFileSource.content
          };
          contextSources.push(implicitSource);
          includedSources.push(`Implicit Context File: ${normalizedImplicitPath}`);
          totalCharacters += implicitSource.content.length;
          
          console.log(`[ContextBuilder] Included implicit context file: ${normalizedImplicitPath}`);
        } else {
          console.log(`[ContextBuilder] Implicit context file not found: ${normalizedImplicitPath}`);
        }
      } else {
        console.log(`[ContextBuilder] Implicit context file already included explicitly: ${normalizedImplicitPath}`);
      }
    }

    // D. Add Vector Search Results
    for (const result of vectorSearchResults) {
      const source: ContextSource = {
        type: 'vector_result',
        path: result.original_file_path,
        description: `L${result.start_line}, Score: ${result.score.toFixed(2)}`,
        content: result.text_snippet || ''
      };
      contextSources.push(source);
      includedSources.push(`Retrieved: ${result.original_file_path} L${result.start_line}`);
      totalCharacters += source.content.length;
    }

    // E. Build final context string
    const contextString = buildContextString(contextSources);

    return {
      contextString,
      includedSources,
      sources: contextSources,
      totalCharacters
    };

  } catch (error) {
    console.error('Error building prompt context:', {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error',
      explicitPaths,
      pinnedItemIds,
      implicitContext
    });

    // Return minimal context on error
    return {
      contextString: '--- ERROR: Failed to build context ---\n',
      includedSources: ['Error: Context build failed'],
      sources: [],
      totalCharacters: 0
    };
  }
}

/**
 * Determine if a path is likely a folder based on heuristics
 */
function isLikelyFolder(path: string): boolean {
  // Ends with slash
  if (path.endsWith('/')) return true;
  
  // No file extension and doesn't look like a filename
  const lastSegment = path.split('/').pop() || '';
  const hasExtension = lastSegment.includes('.');
  
  // Common folder patterns
  const folderPatterns = [
    'src', 'lib', 'components', 'utils', 'services', 'handlers',
    'test', 'tests', '__tests__', 'spec', 'docs', 'assets'
  ];
  
  return !hasExtension || folderPatterns.includes(lastSegment.toLowerCase());
}

/**
 * Fetch content for all files in a folder
 */
async function fetchFolderContent(
  env: Env,
  projectId: string,
  folderPath: string,
  maxFiles: number,
  maxFileSize: number
): Promise<ContextSource[]> {
  const sources: ContextSource[] = [];
  
  try {
    const prefix = `projects/${projectId}/original/${folderPath}`;
    const listResult = await env.CODE_UPLOADS_BUCKET.list({ prefix, limit: maxFiles });
    
    for (const object of listResult.objects) {
      // Extract relative path from the full R2 key
      const prefixToRemove = `projects/${projectId}/original/`;
      if (!object.key.startsWith(prefixToRemove)) continue;
      
      const relativePath = object.key.slice(prefixToRemove.length);
      
      // Skip if it's a folder (ends with /)
      if (object.key.endsWith('/')) continue;
      
      const fileSource = await fetchFileContent(env, projectId, relativePath, maxFileSize);
      if (fileSource) {
        sources.push(fileSource);
      }
    }
    
    if (listResult.truncated) {
      sources.push({
        type: 'folder',
        path: folderPath,
        content: `[Note: Folder contains more than ${maxFiles} files. Only first ${maxFiles} shown.]`
      });
    }
    
  } catch (error) {
    console.error(`Error fetching folder content for ${folderPath}:`, error);
    sources.push({
      type: 'folder',
      path: folderPath,
      content: `[Error reading folder: ${folderPath}]`
    });
  }
  
  return sources;
}

/**
 * Fetch content for a single file from R2
 */
async function fetchFileContent(
  env: Env,
  projectId: string,
  filePath: string,
  maxFileSize: number
): Promise<ContextSource | null> {
  try {
    const r2Key = `projects/${projectId}/original/${filePath}`;
    const r2Object = await env.CODE_UPLOADS_BUCKET.get(r2Key);
    
    if (!r2Object) {
      return null;
    }
    
    // Check file size
    if (r2Object.size > maxFileSize) {
      return {
        type: 'file',
        path: filePath,
        content: `[File too large: ${filePath} (${r2Object.size} bytes, max ${maxFileSize})]`
      };
    }
    
    const content = await r2Object.text();
    
    return {
      type: 'file',
      path: filePath,
      content
    };
    
  } catch (error) {
    console.error(`Error fetching file content for ${filePath}:`, error);
    return {
      type: 'file',
      path: filePath,
      content: `[Error reading file: ${filePath}]`
    };
  }
}

/**
 * Build the final context string from sources
 */
function buildContextString(sources: ContextSource[]): string {
  const segments: string[] = [];
  
  for (const source of sources) {
    switch (source.type) {
      case 'pinned_snippet':
        segments.push(`--- PINNED SNIPPET: ${source.description} ---\n${source.content}\n---`);
        break;
        
      case 'file':
      case 'pinned_file':
        segments.push(`--- FILE: ${source.path} ---\n${source.content}\n---`);
        break;
        
      case 'implicit_file':
        segments.push(`--- CURRENTLY FOCUSED FILE (Implicit): ${source.path} ---\n${source.content}\n---`);
        break;
        
      case 'folder':
        segments.push(`--- FOLDER INFO: ${source.path} ---\n${source.content}\n---`);
        break;
        
      case 'vector_result':
        segments.push(`--- RETRIEVED CODE SNIPPET (${source.path} ${source.description}) ---\n${source.content}\n---`);
        break;
        
      default:
        segments.push(`--- CONTEXT ---\n${source.content}\n---`);
    }
  }
  
  return segments.join('\n\n');
}

/**
 * Parse @file and @folder tags from query text
 */
export function parseExplicitTags(queryText: string): {
  explicitPaths: string[];
  cleanedQuery: string;
} {
  // Regex to match @file or @folder tags: @path/to/file.js or @src/components/
  const tagRegex = /@([\w\/\.-]+)/g;
  const explicitPaths: string[] = [];
  let match;
  
  while ((match = tagRegex.exec(queryText)) !== null) {
    if (match[1]) {
      explicitPaths.push(match[1]);
    }
  }
  
  // Remove tags from query text for cleaner LLM input
  const cleanedQuery = queryText.replace(tagRegex, '').trim();
  
  return {
    explicitPaths: [...new Set(explicitPaths)], // Remove duplicates
    cleanedQuery
  };
}

/**
 * Build managed prompt context with token-aware prioritization and truncation
 * Implements RFC-CTX-003: Dynamic Context Window Management
 */
export async function buildManagedPromptContext(
  env: Env,
  projectId: string,
  userQuery: string,
  explicitPaths: string[],
  pinnedItemIdsToInclude: string[],
  implicitContext: { last_focused_file_path?: string },
  vectorSearchResults: VectorSearchResult[],
  conversationHistory: AgentTurn[],
  llmConfig: LLMModelConfig
): Promise<ManagedPromptContextResult> {
  const availablePromptTokens = getAvailablePromptTokens(llmConfig);
  const warnings: string[] = [];
  const includedSources: string[] = [];
  
  console.log(`[ManagedContext] Starting context assembly`, {
    projectId,
    availablePromptTokens,
    modelName: llmConfig.modelName,
    explicitPathsCount: explicitPaths.length,
    pinnedItemsCount: pinnedItemIdsToInclude.length,
    vectorResultsCount: vectorSearchResults.length,
    historyTurnsCount: conversationHistory.length
  });

  try {
    // 1. Gather all context sources with priorities
    const contextSources = await gatherContextSources(
      env,
      projectId,
      userQuery,
      explicitPaths,
      pinnedItemIdsToInclude,
      implicitContext,
      vectorSearchResults,
      conversationHistory
    );

    // 2. Sort by priority (lower number = higher priority)
    contextSources.sort((a, b) => a.priority - b.priority);

    // 3. Assemble prompt within token budget
    const assemblyResult = await assemblePromptWithinBudget(
      contextSources,
      availablePromptTokens,
      llmConfig
    );

    return {
      finalPrompt: assemblyResult.finalPrompt,
      usedTokens: assemblyResult.usedTokens,
      includedSources: assemblyResult.includedSources,
      warnings: assemblyResult.warnings,
      tokenCountMethod: assemblyResult.tokenCountMethod,
      tokenCountConfidence: assemblyResult.tokenCountConfidence
    };

  } catch (error) {
    console.error('[ManagedContext] Error building managed context:', {
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Return minimal context on error
    const errorPrompt = `System: You are an AI coding assistant.\n\nUser Query: ${userQuery}\n\n[ERROR: Failed to build full context]`;
    
    let errorTokenCount;
    try {
      errorTokenCount = await countTokens(errorPrompt, llmConfig);
    } catch (tokenError) {
      // If token counting also fails, use a fallback
      errorTokenCount = {
        tokenCount: Math.ceil(errorPrompt.length / 4), // Rough estimate
        method: 'heuristic' as const,
        confidence: 'low' as const
      };
    }
    
    return {
      finalPrompt: errorPrompt,
      usedTokens: errorTokenCount.tokenCount,
      includedSources: ['Error: Context build failed'],
      warnings: ['Failed to build managed context due to error'],
      tokenCountMethod: errorTokenCount.method,
      tokenCountConfidence: errorTokenCount.confidence
    };
  }
}

/**
 * Gather all context sources with their priorities
 */
async function gatherContextSources(
  env: Env,
  projectId: string,
  userQuery: string,
  explicitPaths: string[],
  pinnedItemIdsToInclude: string[],
  implicitContext: { last_focused_file_path?: string },
  vectorSearchResults: VectorSearchResult[],
  conversationHistory: AgentTurn[]
): Promise<ContextSourceItem[]> {
  const sources: ContextSourceItem[] = [];

  // Priority 1: System prompt (always included)
  const systemPrompt = buildSystemPrompt();
  sources.push({
    text: systemPrompt,
    sourceDesc: 'System Prompt',
    priority: 1,
    type: 'system_prompt'
  });

  // Priority 2: User query (always included)
  sources.push({
    text: `User Query: ${userQuery}`,
    sourceDesc: 'User Query',
    priority: 2,
    type: 'user_query'
  });

  // Priority 3: Explicitly tagged files (@file/@folder)
  for (const path of explicitPaths) {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    
    if (isLikelyFolder(normalizedPath)) {
      const folderSources = await fetchFolderContentForManaged(env, projectId, normalizedPath);
      sources.push(...folderSources.map(source => ({
        ...source,
        priority: 3,
        type: 'explicit_file' as const
      })));
    } else {
      const fileSource = await fetchFileContentForManaged(env, projectId, normalizedPath);
      if (fileSource) {
        sources.push({
          ...fileSource,
          priority: 3,
          type: 'explicit_file'
        });
      }
    }
  }

  // Priority 4: Pinned context items
  if (pinnedItemIdsToInclude.length > 0) {
    const pinnedSources = await fetchPinnedContentForManaged(env, projectId, pinnedItemIdsToInclude);
    sources.push(...pinnedSources.map(source => ({
      ...source,
      priority: 4
    })));
  }

  // Priority 5: Recent conversation history (newest first, limited)
  const recentHistory = conversationHistory
    .slice(-6) // Last 6 turns max
    .reverse(); // Newest first for priority within this group
  
  recentHistory.forEach((turn, index) => {
    const turnText = formatConversationTurn(turn);
    sources.push({
      text: turnText,
      sourceDesc: `Conversation Turn (${turn.role})`,
      priority: 5 + index * 0.1, // Slight sub-priority for ordering
      type: 'conversation_history'
    });
  });

  // Priority 6: Vector search results (highest score first)
  const sortedVectorResults = [...vectorSearchResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // Top 10 results max

  sortedVectorResults.forEach((result, index) => {
    const resultText = `// File: ${result.original_file_path} (Lines ${result.start_line}-${result.end_line || result.start_line}, Score: ${result.score.toFixed(2)})\n${result.text_snippet || ''}`;
    sources.push({
      text: resultText,
      sourceDesc: `Vector Result: ${result.original_file_path} L${result.start_line}`,
      priority: 6 + index * 0.1,
      type: 'vector_result'
    });
  });

  // Priority 7: Implicit context (lowest priority)
  if (implicitContext.last_focused_file_path) {
    const implicitPath = implicitContext.last_focused_file_path.startsWith('/') 
      ? implicitContext.last_focused_file_path.slice(1) 
      : implicitContext.last_focused_file_path;
    
    // Check if already included in explicit paths
    const alreadyIncluded = explicitPaths.some(path => {
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      return normalizedPath === implicitPath;
    });

    if (!alreadyIncluded) {
      const implicitSource = await fetchFileContentForManaged(env, projectId, implicitPath);
      if (implicitSource) {
        sources.push({
          ...implicitSource,
          sourceDesc: `Implicit Context: ${implicitPath}`,
          priority: 7,
          type: 'implicit_file'
        });
      }
    }
  }

  return sources;
}

/**
 * Assemble prompt within token budget with truncation strategies
 */
async function assemblePromptWithinBudget(
  contextSources: ContextSourceItem[],
  availableTokens: number,
  llmConfig: LLMModelConfig
): Promise<{
  finalPrompt: string;
  usedTokens: number;
  includedSources: string[];
  warnings: string[];
  tokenCountMethod: 'tiktoken' | 'heuristic';
  tokenCountConfidence: 'high' | 'medium' | 'low';
}> {
  const promptSegments: string[] = [];
  const includedSources: string[] = [];
  const warnings: string[] = [];
  let currentTokens = 0;
  let tokenCountMethod: 'tiktoken' | 'heuristic' = 'heuristic';
  let tokenCountConfidence: 'high' | 'medium' | 'low' = 'medium';

  for (const source of contextSources) {
    // Count tokens for this source
    const tokenResult = await countTokens(source.text, llmConfig);
    
    // Update method/confidence tracking (prefer higher confidence)
    if (tokenResult.confidence === 'high' || 
        (tokenResult.confidence === 'medium' && tokenCountConfidence !== 'high')) {
      tokenCountMethod = tokenResult.method;
      tokenCountConfidence = tokenResult.confidence;
    }

    const sourceTokens = tokenResult.tokenCount;
    const remainingTokens = availableTokens - currentTokens;

    if (sourceTokens <= remainingTokens) {
      // Source fits completely
      promptSegments.push(formatSourceForPrompt(source));
      includedSources.push(source.sourceDesc);
      currentTokens += sourceTokens;
      
      console.log(`[ManagedContext] Included source: ${source.sourceDesc} (${sourceTokens} tokens)`);
    } else if (remainingTokens > 100) {
      // Try truncation if we have reasonable space left
      const truncationResult = await truncateSource(source, remainingTokens, llmConfig);
      
      if (truncationResult.wasTruncated && truncationResult.usedTokens <= remainingTokens) {
        promptSegments.push(formatSourceForPrompt({
          ...source,
          text: truncationResult.truncatedText
        }));
        includedSources.push(`${source.sourceDesc} (truncated)`);
        warnings.push(`Truncated: ${source.sourceDesc} using ${truncationResult.truncationMethod}`);
        currentTokens += truncationResult.usedTokens;
        
        console.log(`[ManagedContext] Truncated source: ${source.sourceDesc} (${truncationResult.usedTokens} tokens)`);
      } else {
        warnings.push(`Skipped: ${source.sourceDesc} - too large even after truncation`);
        console.log(`[ManagedContext] Skipped source: ${source.sourceDesc} - too large (${sourceTokens} tokens, ${remainingTokens} available)`);
      }
    } else {
      // Not enough space left
      warnings.push(`Skipped: ${source.sourceDesc} - insufficient token budget`);
      console.log(`[ManagedContext] Skipped source: ${source.sourceDesc} - insufficient budget (${remainingTokens} tokens remaining)`);
    }

    // Stop if we're very close to the limit
    if (currentTokens >= availableTokens * 0.95) {
      warnings.push('Stopped adding sources due to token limit');
      break;
    }
  }

  const finalPrompt = promptSegments.join('\n\n');
  
  // Final token count verification
  const finalTokenResult = await countTokens(finalPrompt, llmConfig);
  
  console.log(`[ManagedContext] Final context assembled`, {
    finalTokens: finalTokenResult.tokenCount,
    availableTokens,
    sourcesIncluded: includedSources.length,
    warningsCount: warnings.length
  });

  return {
    finalPrompt,
    usedTokens: finalTokenResult.tokenCount,
    includedSources,
    warnings,
    tokenCountMethod: finalTokenResult.method,
    tokenCountConfidence: finalTokenResult.confidence
  };
}

/**
 * Truncate a source using appropriate strategy based on type
 */
async function truncateSource(
  source: ContextSourceItem,
  maxTokens: number,
  llmConfig: LLMModelConfig
): Promise<TruncationResult> {
  const maxChars = estimateCharsForTokens(maxTokens, llmConfig.provider);
  
  let truncatedText: string;
  let truncationMethod: string;

  switch (source.type) {
    case 'explicit_file':
    case 'implicit_file':
      // For code files, try to preserve structure
      truncatedText = truncateCodeFile(source.text, maxChars);
      truncationMethod = 'code-aware truncation';
      break;
      
    case 'conversation_history':
      // For conversation, truncate from the beginning
      truncatedText = truncateFromStart(source.text, maxChars);
      truncationMethod = 'start truncation';
      break;
      
    case 'vector_result':
      // For search results, truncate from end
      truncatedText = truncateFromEnd(source.text, maxChars);
      truncationMethod = 'end truncation';
      break;
      
    default:
      // Generic truncation
      truncatedText = truncateFromEnd(source.text, maxChars);
      truncationMethod = 'generic truncation';
  }

  const tokenResult = await countTokens(truncatedText, llmConfig);
  
  return {
    truncatedText,
    usedTokens: tokenResult.tokenCount,
    wasTruncated: truncatedText.length < source.text.length,
    truncationMethod
  };
}

/**
 * Truncate code file preserving structure when possible
 */
function truncateCodeFile(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  
  const lines = text.split('\n');
  const targetChars = maxChars - 50; // Reserve space for truncation marker
  
  // Try to keep beginning and end of file
  const beginningLines: string[] = [];
  const endingLines: string[] = [];
  let currentChars = 0;
  
  // Take lines from beginning
  for (let i = 0; i < lines.length && currentChars < targetChars / 2; i++) {
    const line = lines[i];
    if (line && currentChars + line.length + 1 <= targetChars / 2) {
      beginningLines.push(line);
      currentChars += line.length + 1;
    } else {
      break;
    }
  }
  
  // Take lines from end
  currentChars = 0;
  for (let i = lines.length - 1; i >= beginningLines.length && currentChars < targetChars / 2; i--) {
    const line = lines[i];
    if (line && currentChars + line.length + 1 <= targetChars / 2) {
      endingLines.unshift(line);
      currentChars += line.length + 1;
    } else {
      break;
    }
  }
  
  if (beginningLines.length + endingLines.length < lines.length) {
    return beginningLines.join('\n') + '\n\n[... TRUNCATED ...]\n\n' + endingLines.join('\n');
  } else {
    return lines.slice(0, beginningLines.length).join('\n');
  }
}

/**
 * Truncate from start (for conversation history)
 */
function truncateFromStart(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  
  const truncated = text.slice(text.length - maxChars + 20);
  return '[... TRUNCATED ...]\n' + truncated;
}

/**
 * Truncate from end (default strategy)
 */
function truncateFromEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  
  const truncated = text.slice(0, maxChars - 20);
  return truncated + '\n[... TRUNCATED ...]';
}

/**
 * Helper functions for managed context building
 */

function buildSystemPrompt(): string {
  return `System: You are an AI coding assistant. You help developers understand, write, and debug code. You have access to the user's codebase context and should provide accurate, helpful responses based on the provided information.`;
}

async function fetchFileContentForManaged(
  env: Env,
  projectId: string,
  filePath: string
): Promise<ContextSourceItem | null> {
  try {
    const r2Key = `projects/${projectId}/original/${filePath}`;
    const fileObject = await env.CODE_UPLOADS_BUCKET.get(r2Key);
    
    if (!fileObject) return null;
    
    const content = await fileObject.text();
    return {
      text: `// File: ${filePath}\n${content}`,
      sourceDesc: `File: ${filePath}`,
      originalLength: content.length,
      priority: 0, // Will be set by caller
      type: 'explicit_file'
    };
  } catch (error) {
    console.warn(`[ManagedContext] Failed to fetch file ${filePath}:`, error);
    return null;
  }
}

async function fetchFolderContentForManaged(
  env: Env,
  projectId: string,
  folderPath: string
): Promise<ContextSourceItem[]> {
  try {
    const prefix = `projects/${projectId}/original/${folderPath}`;
    const listResult = await env.CODE_UPLOADS_BUCKET.list({
      prefix,
      limit: 10 // Limit folder files for managed context
    });
    
    const sources: ContextSourceItem[] = [];
    
    for (const object of listResult.objects) {
      const relativePath = object.key.replace(`projects/${projectId}/original/`, '');
      const fileSource = await fetchFileContentForManaged(env, projectId, relativePath);
      if (fileSource) {
        sources.push(fileSource);
      }
    }
    
    return sources;
  } catch (error) {
    console.warn(`[ManagedContext] Failed to fetch folder ${folderPath}:`, error);
    return [];
  }
}

async function fetchPinnedContentForManaged(
  env: Env,
  projectId: string,
  pinnedItemIds: string[]
): Promise<ContextSourceItem[]> {
  try {
    const allPinnedItems = await getPinnedItemsForProject(env.METADATA_KV, projectId);
    const targetItems = allPinnedItems.filter(item => pinnedItemIds.includes(item.id));
    
    const sources: ContextSourceItem[] = [];
    
    for (const item of targetItems) {
      if (item.type === 'text_snippet') {
        sources.push({
          text: item.content,
          sourceDesc: `Pinned Snippet: ${item.description || item.id}`,
          originalLength: item.content.length,
          priority: 0, // Will be set by caller
          type: 'pinned_snippet'
        });
      } else if (item.type === 'file_path') {
        const fileSource = await fetchFileContentForManaged(env, projectId, item.content);
        if (fileSource) {
          sources.push({
            ...fileSource,
            sourceDesc: `Pinned File: ${item.content}`,
            type: 'pinned_file'
          });
        }
      }
    }
    
    return sources;
  } catch (error) {
    console.warn(`[ManagedContext] Failed to fetch pinned content:`, error);
    return [];
  }
}

function formatConversationTurn(turn: AgentTurn): string {
  const timestamp = new Date(turn.timestamp).toISOString();
  let content = `[${timestamp}] ${turn.role.toUpperCase()}: ${turn.content}`;
  
  if (turn.toolCall) {
    content += `\nTOOL_CALL: ${turn.toolCall.name}(${JSON.stringify(turn.toolCall.parameters)})`;
  }
  
  if (turn.toolResult) {
    content += `\nTOOL_RESULT: ${turn.toolResult.success ? 'SUCCESS' : 'ERROR'} - ${JSON.stringify(turn.toolResult.result)}`;
  }
  
  return content;
}

function formatSourceForPrompt(source: ContextSourceItem): string {
  switch (source.type) {
    case 'system_prompt':
    case 'user_query':
      return source.text;
      
    case 'explicit_file':
    case 'implicit_file':
    case 'pinned_file':
      return `--- ${source.sourceDesc.toUpperCase()} ---\n${source.text}\n---`;
      
    case 'pinned_snippet':
      return `--- ${source.sourceDesc.toUpperCase()} ---\n${source.text}\n---`;
      
    case 'conversation_history':
      return `--- CONVERSATION HISTORY ---\n${source.text}\n---`;
      
    case 'vector_result':
      return `--- RETRIEVED CODE SNIPPET ---\n${source.text}\n---`;
      
    default:
      return `--- CONTEXT ---\n${source.text}\n---`;
  }
} 