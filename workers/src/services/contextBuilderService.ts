/**
 * Context Builder Service
 * Implements RFC-CTX-001: Explicit Context Management
 * Implements RFC-MEM-001: Session & Project Memory Store (Pinned Items)
 */

import type { Env, VectorSearchResult } from '../types.js';
import { getPinnedItemsForProject } from '../lib/kvStore.js';

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