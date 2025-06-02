/**
 * Language Detection Utilities
 * Determines programming language from file extensions and content patterns
 */

import type { SupportedLanguage } from '../types.js';

/**
 * Maps file extensions to programming languages
 */
const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  // JavaScript/TypeScript
  'js': 'javascript',
  'mjs': 'javascript',
  'jsx': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',

  // Python
  'py': 'python',
  'pyw': 'python',
  'pyi': 'python',

  // Java
  'java': 'java',

  // C/C++
  'c': 'c',
  'h': 'c',
  'cpp': 'cpp',
  'cxx': 'cpp',
  'cc': 'cpp',
  'hpp': 'cpp',
  'hxx': 'cpp',

  // C#
  'cs': 'csharp',

  // Go
  'go': 'go',

  // Rust
  'rs': 'rust',

  // PHP
  'php': 'php',
  'phtml': 'php',

  // Ruby
  'rb': 'ruby',
  'rbw': 'ruby',

  // Web technologies
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'scss': 'css',
  'sass': 'css',
  'less': 'css',

  // Data formats
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',

  // Documentation
  'md': 'markdown',
  'markdown': 'markdown',

  // Shell scripts
  'sh': 'shell',
  'bash': 'shell',
  'zsh': 'shell',
  'fish': 'shell',
  'ps1': 'shell',

  // SQL
  'sql': 'sql',

  // Plain text
  'txt': 'text',
  'log': 'text',
  'conf': 'text',
  'config': 'text',
  'ini': 'text'
};

/**
 * Detects programming language from file path
 */
export function detectLanguageFromPath(filePath: string): SupportedLanguage {
  const extension = filePath.split('.').pop()?.toLowerCase();

  if (!extension) {
    return 'text';
  }

  return EXTENSION_TO_LANGUAGE[extension] || 'text';
}

/**
 * Detects language from file content patterns (fallback/validation)
 */
export function detectLanguageFromContent(content: string, filePath: string): SupportedLanguage {
  // Start with extension-based detection
  const extensionLanguage = detectLanguageFromPath(filePath);

  // For ambiguous cases, use content patterns
  const firstLine = content.split('\n')[0]?.trim() || '';

  // Shebang detection
  if (firstLine.startsWith('#!')) {
    if (firstLine.includes('python')) return 'python';
    if (firstLine.includes('node') || firstLine.includes('javascript')) return 'javascript';
    if (firstLine.includes('bash') || firstLine.includes('sh')) return 'shell';
    if (firstLine.includes('php')) return 'php';
    if (firstLine.includes('ruby')) return 'ruby';
  }

  // Content-based patterns for common languages
  const contentLower = content.toLowerCase();

  // JavaScript/TypeScript patterns
  if (extensionLanguage === 'text' && (
    content.includes('function ') ||
    content.includes('const ') ||
    content.includes('let ') ||
    content.includes('var ') ||
    content.includes('import ') ||
    content.includes('export ') ||
    content.includes('require(')
  )) {
    return 'javascript';
  }

  // Python patterns
  if (extensionLanguage === 'text' && (
    content.includes('def ') ||
    content.includes('import ') ||
    content.includes('from ') ||
    content.includes('class ') ||
    content.includes('if __name__')
  )) {
    return 'python';
  }

  // HTML patterns
  if (extensionLanguage === 'text' && (
    contentLower.includes('<!doctype html>') ||
    contentLower.includes('<html') ||
    contentLower.includes('<head>') ||
    contentLower.includes('<body>')
  )) {
    return 'html';
  }

  // CSS patterns
  if (extensionLanguage === 'text' && (
    content.includes('{') && content.includes('}') && content.includes(':')
  )) {
    return 'css';
  }

  // JSON patterns
  if (extensionLanguage === 'text' && (
    (content.trim().startsWith('{') && content.trim().endsWith('}')) ||
    (content.trim().startsWith('[') && content.trim().endsWith(']'))
  )) {
    try {
      JSON.parse(content);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // YAML patterns
  if (extensionLanguage === 'text' && (
    content.includes('---') ||
    /^[a-zA-Z_][a-zA-Z0-9_]*:\s/.test(content)
  )) {
    return 'yaml';
  }

  return extensionLanguage;
}

/**
 * Gets language-specific comment patterns for better chunking
 */
export function getLanguageCommentPatterns(language: SupportedLanguage): {
  singleLine: string[];
  multiLineStart: string[];
  multiLineEnd: string[];
} {
  switch (language) {
    case 'javascript':
    case 'typescript':
    case 'java':
    case 'cpp':
    case 'c':
    case 'csharp':
    case 'go':
    case 'rust':
    case 'php':
    case 'css':
      return {
        singleLine: ['//'],
        multiLineStart: ['/*'],
        multiLineEnd: ['*/']
      };

    case 'python':
    case 'shell':
    case 'yaml':
      return {
        singleLine: ['#'],
        multiLineStart: ['"""', '\'\'\''],
        multiLineEnd: ['"""', '\'\'\'']
      };

    case 'ruby':
      return {
        singleLine: ['#'],
        multiLineStart: ['=begin'],
        multiLineEnd: ['=end']
      };

    case 'html':
      return {
        singleLine: [],
        multiLineStart: ['<!--'],
        multiLineEnd: ['-->']
      };

    case 'sql':
      return {
        singleLine: ['--'],
        multiLineStart: ['/*'],
        multiLineEnd: ['*/']
      };

    default:
      return {
        singleLine: [],
        multiLineStart: [],
        multiLineEnd: []
      };
  }
}