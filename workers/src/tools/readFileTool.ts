/**
 * Read File Tool - Reads full content of a file from the project
 * Implements RFC-AGT-002: Tool Definition & Execution Framework
 */

import type { Env } from '../types.js';

export interface ReadFileArgs {
  file_path: string;
}

export interface ReadFileResult {
  tool_output: string;
  error?: string;
}

/**
 * Executes file reading from R2 storage
 * @param env - Cloudflare Worker environment bindings
 * @param projectId - Project ID containing the file
 * @param args - Tool arguments containing file path
 * @returns Promise resolving to file content or error
 */
export async function executeReadFile(
  env: Env,
  projectId: string,
  args: ReadFileArgs
): Promise<ReadFileResult> {
  try {
    console.log(`[ReadFileTool] Reading file for project ${projectId}`, {
      filePath: args.file_path
    });

    // Construct R2 key for original file
    // Based on P1-E1-S1 structure: projects/<projectId>/original/<filePathInZip>
    const r2Key = `projects/${projectId}/original/${args.file_path}`;

    // Fetch file from R2
    const r2Object = await env.CODE_UPLOADS_BUCKET.get(r2Key);

    if (!r2Object) {
      console.warn(`[ReadFileTool] File not found in R2: ${r2Key}`);
      return {
        tool_output: '',
        error: `File not found: ${args.file_path}`
      };
    }

    // Read file content
    const content = await r2Object.text();

    console.log(`[ReadFileTool] File read successfully`, {
      filePath: args.file_path,
      contentLength: content.length,
      r2Key
    });

    // Format output for LLM consumption
    const formattedOutput = formatFileContent(args.file_path, content);

    return {
      tool_output: formattedOutput
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ReadFileTool] Failed to read file:`, error);

    return {
      tool_output: '',
      error: `Failed to read file ${args.file_path}: ${errorMessage}`
    };
  }
}

/**
 * Formats file content for LLM consumption
 */
function formatFileContent(filePath: string, content: string): string {
  // Detect language from file extension for syntax highlighting
  const language = detectLanguageFromPath(filePath);

  const header = `Content of file: **${filePath}**\n\n`;

  const formattedContent = [
    '```' + language,
    content,
    '```'
  ].join('\n');

  return header + formattedContent;
}

/**
 * Simple language detection based on file extension
 */
function detectLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml',
    'json': 'json',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'fish': 'shell',
    'sql': 'sql',
    'xml': 'xml',
    'toml': 'toml',
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'ini'
  };

  return languageMap[extension || ''] || 'text';
}