/**
 * Text Chunking Utilities
 * Implements RFC-IDX-001: Text chunking with semantic awareness
 */

import type { TextChunk, ChunkingConfig, SupportedLanguage } from '../types.js';
import { detectLanguageFromContent, getLanguageCommentPatterns } from './languageDetection.js';

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxChunkSize: 1500,        // ~1500 characters per chunk
  chunkOverlap: 200,         // 200 character overlap
  maxLinesPerChunk: 75,      // Max 75 lines per chunk
  preserveCodeBlocks: true   // Try to keep code blocks intact
};

/**
 * Generates text chunks from file content
 */
export async function generateChunksForFile(
  filePath: string,
  fileContent: string,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): Promise<TextChunk[]> {
  // Detect language
  const language = detectLanguageFromContent(fileContent, filePath);
  
  // Choose chunking strategy based on language and content
  if (shouldUseLanguageAwareChunking(language, fileContent)) {
    return generateLanguageAwareChunks(fileContent, language, config);
  } else {
    return generateGenericTextChunks(fileContent, language, config);
  }
}

/**
 * Determines if language-aware chunking should be used
 */
function shouldUseLanguageAwareChunking(language: SupportedLanguage, content: string): boolean {
  // Use language-aware chunking for programming languages with clear structure
  const structuredLanguages: SupportedLanguage[] = [
    'javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'csharp', 'go', 'rust', 'php', 'ruby'
  ];
  
  if (!structuredLanguages.includes(language)) {
    return false;
  }
  
  // For small files, generic chunking is sufficient
  if (content.length < 500) {
    return false;
  }
  
  return true;
}

/**
 * Language-aware chunking that tries to preserve semantic boundaries
 */
function generateLanguageAwareChunks(
  content: string,
  language: SupportedLanguage,
  config: ChunkingConfig
): TextChunk[] {
  const lines = content.split('\n');
  const chunks: TextChunk[] = [];
  
  // Get language-specific patterns
  const commentPatterns = getLanguageCommentPatterns(language);
  
  let currentChunk: string[] = [];
  let currentStartLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // Skip undefined lines
    
    const lineNumber = i + 1;
    
    // Check if we should start a new chunk
    if (shouldStartNewChunk(currentChunk, line, language, config)) {
      // Finalize current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.join('\n'),
          startLine: currentStartLine,
          endLine: currentStartLine + currentChunk.length - 1,
          language
        });
        
        // Start new chunk with overlap
        const overlapLines = calculateOverlapLines(currentChunk, config);
        currentChunk = overlapLines;
        currentStartLine = lineNumber - overlapLines.length;
      }
    }
    
    currentChunk.push(line);
  }
  
  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n'),
      startLine: currentStartLine,
      endLine: currentStartLine + currentChunk.length - 1,
      language
    });
  }
  
  return chunks;
}

/**
 * Generic text chunking based on lines and character count
 */
function generateGenericTextChunks(
  content: string,
  language: SupportedLanguage,
  config: ChunkingConfig
): TextChunk[] {
  const lines = content.split('\n');
  const chunks: TextChunk[] = [];
  
  let currentChunk: string[] = [];
  let currentStartLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue; // Skip undefined lines
    
    const lineNumber = i + 1;
    
    // Check if adding this line would exceed limits
    const potentialChunk = [...currentChunk, line];
    const potentialText = potentialChunk.join('\n');
    
    if (potentialText.length > config.maxChunkSize || 
        potentialChunk.length > config.maxLinesPerChunk) {
      
      // Finalize current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.join('\n'),
          startLine: currentStartLine,
          endLine: currentStartLine + currentChunk.length - 1,
          language
        });
        
        // Start new chunk with overlap
        const overlapLines = calculateOverlapLines(currentChunk, config);
        currentChunk = [...overlapLines, line];
        currentStartLine = lineNumber - overlapLines.length;
      } else {
        // Single line exceeds limits, include it anyway
        currentChunk = [line];
      }
    } else {
      currentChunk.push(line);
    }
  }
  
  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n'),
      startLine: currentStartLine,
      endLine: currentStartLine + currentChunk.length - 1,
      language
    });
  }
  
  return chunks;
}

/**
 * Determines if a new chunk should be started based on language-specific patterns
 */
function shouldStartNewChunk(
  currentChunk: string[],
  line: string,
  language: SupportedLanguage,
  config: ChunkingConfig
): boolean {
  const currentText = currentChunk.join('\n');
  
  // Check size limits first
  if (currentText.length > config.maxChunkSize || 
      currentChunk.length > config.maxLinesPerChunk) {
    return true;
  }
  
  // Language-specific semantic boundaries
  const trimmedLine = line.trim();
  
  switch (language) {
    case 'javascript':
    case 'typescript':
      // Start new chunk at function/class declarations
      if (trimmedLine.startsWith('function ') ||
          trimmedLine.startsWith('class ') ||
          trimmedLine.startsWith('export function ') ||
          trimmedLine.startsWith('export class ') ||
          trimmedLine.startsWith('const ') && trimmedLine.includes(' = ') ||
          trimmedLine.startsWith('let ') && trimmedLine.includes(' = ')) {
        return currentChunk.length > 10; // Only if chunk has some content
      }
      break;
      
    case 'python':
      // Start new chunk at function/class definitions
      if (trimmedLine.startsWith('def ') ||
          trimmedLine.startsWith('class ') ||
          trimmedLine.startsWith('async def ')) {
        return currentChunk.length > 10;
      }
      break;
      
    case 'java':
    case 'csharp':
      // Start new chunk at method/class declarations
      if (trimmedLine.includes('class ') ||
          trimmedLine.includes('interface ') ||
          (trimmedLine.includes('public ') || trimmedLine.includes('private ') || trimmedLine.includes('protected ')) &&
          (trimmedLine.includes('void ') || trimmedLine.includes('int ') || trimmedLine.includes('string '))) {
        return currentChunk.length > 10;
      }
      break;
      
    case 'markdown':
      // Start new chunk at headers
      if (trimmedLine.startsWith('#')) {
        return currentChunk.length > 5;
      }
      break;
  }
  
  return false;
}

/**
 * Calculates overlap lines for context preservation
 */
function calculateOverlapLines(chunk: string[], config: ChunkingConfig): string[] {
  if (chunk.length === 0) return [];
  
  // Calculate overlap based on character count
  const chunkText = chunk.join('\n');
  const targetOverlapChars = Math.min(config.chunkOverlap, chunkText.length * 0.2);
  
  let overlapLines: string[] = [];
  let overlapChars = 0;
  
  // Take lines from the end until we reach target overlap
  for (let i = chunk.length - 1; i >= 0 && overlapChars < targetOverlapChars; i--) {
    const line = chunk[i];
    if (line === undefined) continue; // Skip undefined lines
    
    overlapLines.unshift(line);
    overlapChars += line.length + 1; // +1 for newline
    
    // Limit overlap to reasonable number of lines
    if (overlapLines.length >= 10) break;
  }
  
  return overlapLines;
}

/**
 * Validates and cleans chunk content
 */
export function validateChunk(chunk: TextChunk): TextChunk {
  // Ensure chunk has content
  if (!chunk.text.trim()) {
    throw new Error('Chunk cannot be empty');
  }
  
  // Ensure line numbers are valid
  if (chunk.startLine < 1 || chunk.endLine < chunk.startLine) {
    throw new Error('Invalid line numbers in chunk');
  }
  
  // Clean up excessive whitespace while preserving structure
  const cleanedText = chunk.text
    .replace(/\n{4,}/g, '\n\n\n') // Limit consecutive newlines to 3
    .replace(/[ \t]+$/gm, '');    // Remove trailing whitespace
  
  return {
    ...chunk,
    text: cleanedText
  };
} 