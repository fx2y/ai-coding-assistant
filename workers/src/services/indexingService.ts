/**
 * Indexing Service - Code Upload & Storage
 * Implements RFC-IDX-001: Codebase Indexing Pipeline (Step 1: Ingestion & Storage)
 */

import JSZip from 'jszip';
import type { ProcessZipResult, UploadedFile } from '../types.js';

/**
 * Determines content type based on file extension
 */
function determineContentType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();

  const contentTypeMap: Record<string, string> = {
    // JavaScript/TypeScript
    'js': 'application/javascript',
    'mjs': 'application/javascript',
    'ts': 'application/typescript',
    'tsx': 'application/typescript',
    'jsx': 'application/javascript',

    // Web technologies
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'json': 'application/json',
    'xml': 'application/xml',

    // Programming languages
    'py': 'text/x-python',
    'java': 'text/x-java-source',
    'cpp': 'text/x-c++src',
    'c': 'text/x-csrc',
    'h': 'text/x-chdr',
    'hpp': 'text/x-c++hdr',
    'cs': 'text/x-csharp',
    'php': 'text/x-php',
    'rb': 'text/x-ruby',
    'go': 'text/x-go',
    'rs': 'text/x-rust',
    'swift': 'text/x-swift',
    'kt': 'text/x-kotlin',
    'scala': 'text/x-scala',

    // Configuration & markup
    'yaml': 'application/x-yaml',
    'yml': 'application/x-yaml',
    'toml': 'application/toml',
    'ini': 'text/plain',
    'conf': 'text/plain',
    'config': 'text/plain',
    'md': 'text/markdown',
    'markdown': 'text/markdown',
    'txt': 'text/plain',
    'log': 'text/plain',

    // Shell scripts
    'sh': 'application/x-sh',
    'bash': 'application/x-sh',
    'zsh': 'application/x-sh',
    'fish': 'application/x-sh',
    'ps1': 'application/x-powershell',

    // Data formats
    'csv': 'text/csv',
    'sql': 'application/sql',

    // Documentation
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    // Images (for completeness, though less relevant for code)
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',

    // Archives
    'zip': 'application/zip',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    '7z': 'application/x-7z-compressed'
  };

  return contentTypeMap[extension || ''] || 'application/octet-stream';
}

/**
 * Validates if a file should be processed (excludes common non-code files)
 */
function shouldProcessFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  // Skip hidden files and directories
  if (fileName.startsWith('.') && !fileName.startsWith('.env')) {
    return false;
  }

  // Skip common build/dependency directories
  const skipDirectories = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'target',
    'bin',
    'obj',
    '.next',
    '.nuxt',
    'coverage',
    '.nyc_output',
    '__pycache__',
    '.pytest_cache',
    'vendor',
    '.vscode',
    '.idea'
  ];

  for (const skipDir of skipDirectories) {
    if (filePath.includes(`/${skipDir}/`) || filePath.startsWith(`${skipDir}/`)) {
      return false;
    }
  }

  // Skip common binary/media file extensions
  const skipExtensions = [
    'exe', 'dll', 'so', 'dylib', 'bin',
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'svg', 'webp',
    'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'wav', 'ogg',
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'ttf', 'otf', 'woff', 'woff2', 'eot'
  ];

  if (skipExtensions.includes(extension)) {
    return false;
  }

  // Skip very large files (>1MB) to prevent memory issues
  // Note: This check would need file size info from JSZip

  return true;
}

/**
 * Processes a ZIP file and stores extracted files in R2
 * Implements RFC-IDX-001: Ingestion step
 */
export async function processAndStoreZip(
  bucket: R2Bucket,
  projectId: string,
  zipFile: File
): Promise<ProcessZipResult> {
  const uploadedFiles: UploadedFile[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  try {
    // Load ZIP file
    const zipData = await zipFile.arrayBuffer();
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipData);

    console.log(`Processing ZIP file for project ${projectId}, found ${Object.keys(zip.files).length} entries`);

    // Process each file in the ZIP
    for (const relativePath in zip.files) {
      const zipEntry = zip.files[relativePath];

      // Skip directories or undefined entries
      if (!zipEntry || zipEntry.dir) {
        continue;
      }

      // Skip files that shouldn't be processed
      if (!shouldProcessFile(relativePath)) {
        console.log(`Skipping file: ${relativePath} (filtered out)`);
        continue;
      }

      try {
        // Construct R2 key with proper namespacing
        const r2Key = `projects/${projectId}/original/${relativePath}`;

        // Get file content as ArrayBuffer
        const content = await zipEntry.async('arraybuffer');

        // Determine content type
        const contentType = determineContentType(relativePath);

        // Store in R2
        await bucket.put(r2Key, content, {
          httpMetadata: {
            contentType
          },
          customMetadata: {
            projectId,
            originalPath: relativePath,
            uploadedAt: new Date().toISOString()
          }
        });

        uploadedFiles.push({
          path: relativePath,
          r2Key
        });

        console.log(`Successfully uploaded: ${relativePath} -> ${r2Key}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to upload ${relativePath}:`, error);
        errors.push({
          path: relativePath,
          error: errorMessage
        });
      }
    }

    console.log(`ZIP processing complete for project ${projectId}: ${uploadedFiles.length} files uploaded, ${errors.length} errors`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to process ZIP file for project ${projectId}:`, error);
    errors.push({
      path: 'ZIP_FILE',
      error: `Failed to process ZIP file: ${errorMessage}`
    });
  }

  return {
    uploadedFiles,
    errors
  };
}

/**
 * Generates a unique project ID
 */
export function generateProjectId(): string {
  return crypto.randomUUID();
}