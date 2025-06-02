/**
 * Indexing Service - Code Upload & Storage
 * Implements RFC-IDX-001: Codebase Indexing Pipeline (Step 1: Ingestion & Storage)
 */

import JSZip from 'jszip';
import type { ProcessZipResult, UploadedFile, ChunkingResult, ChunkMetadata, Env } from '../types.js';
import { generateChunksForFile, validateChunk, DEFAULT_CHUNKING_CONFIG } from '../lib/textChunker.js';
import { saveChunkMetadata, saveFileChunkIndex } from '../lib/kvStore.js';

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

/**
 * Chunks all files in a project and stores chunks in R2 and metadata in KV
 * Implements RFC-IDX-001: Parsing & Chunking step
 */
export async function chunkFilesInProject(
  env: Env,
  projectId: string
): Promise<ChunkingResult> {
  const errors: Array<{ filePath: string; error: string }> = [];
  let chunkedFileCount = 0;
  let totalChunksCreated = 0;

  try {
    console.log(`Starting chunking process for project ${projectId}`);

    // List all original files for the project
    const prefix = `projects/${projectId}/original/`;
    const fileList = await env.CODE_UPLOADS_BUCKET.list({ prefix });

    console.log(`Found ${fileList.objects.length} files to process for project ${projectId}`);

    // Process each file
    for (const r2Object of fileList.objects) {
      const originalRelativePath = r2Object.key.substring(prefix.length);

      try {
        console.log(`Processing file: ${originalRelativePath}`);

        // Retrieve file content from R2
        const fileObject = await env.CODE_UPLOADS_BUCKET.get(r2Object.key);
        if (!fileObject) {
          errors.push({
            filePath: originalRelativePath,
            error: 'File not found in R2'
          });
          continue;
        }

        const fileContentText = await fileObject.text();

        // Generate chunks for the file
        const chunks = await generateChunksForFile(
          originalRelativePath,
          fileContentText,
          DEFAULT_CHUNKING_CONFIG
        );

        console.log(`Generated ${chunks.length} chunks for ${originalRelativePath}`);

        // Store each chunk and its metadata
        const chunkIds: string[] = [];

        for (const chunk of chunks) {
          try {
            // Validate chunk
            const validatedChunk = validateChunk(chunk);

            // Generate unique chunk ID
            const chunkId = crypto.randomUUID();

            // Store chunk text in R2
            const chunkR2Key = `projects/${projectId}/chunks/${chunkId}.txt`;
            await env.CODE_UPLOADS_BUCKET.put(chunkR2Key, validatedChunk.text, {
              httpMetadata: {
                contentType: 'text/plain'
              },
              customMetadata: {
                projectId,
                originalFilePath: originalRelativePath,
                chunkId,
                ...(validatedChunk.language && { language: validatedChunk.language })
              }
            });

            // Create chunk metadata
            const chunkMetadata: ChunkMetadata = {
              id: chunkId,
              projectId,
              originalFilePath: originalRelativePath,
              r2ChunkPath: chunkR2Key,
              startLine: validatedChunk.startLine,
              endLine: validatedChunk.endLine,
              charCount: validatedChunk.text.length,
              ...(validatedChunk.language && { language: validatedChunk.language }),
              createdAt: new Date().toISOString()
            };

            // Store chunk metadata in KV
            await saveChunkMetadata(env.METADATA_KV, chunkMetadata);

            chunkIds.push(chunkId);
            totalChunksCreated++;

          } catch (chunkError) {
            const errorMessage = chunkError instanceof Error ? chunkError.message : 'Unknown chunk error';
            console.error(`Failed to store chunk for ${originalRelativePath}:`, chunkError);
            errors.push({
              filePath: `${originalRelativePath} (chunk)`,
              error: errorMessage
            });
          }
        }

        // Store file chunk index in KV
        if (chunkIds.length > 0) {
          await saveFileChunkIndex(env.METADATA_KV, projectId, originalRelativePath, chunkIds);
          chunkedFileCount++;
        }

        console.log(`Successfully processed ${originalRelativePath}: ${chunkIds.length} chunks created`);

      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : 'Unknown file error';
        console.error(`Failed to process file ${originalRelativePath}:`, fileError);
        errors.push({
          filePath: originalRelativePath,
          error: errorMessage
        });
      }
    }

    console.log(`Chunking complete for project ${projectId}: ${chunkedFileCount} files processed, ${totalChunksCreated} chunks created, ${errors.length} errors`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to chunk files for project ${projectId}:`, error);
    errors.push({
      filePath: 'PROJECT_CHUNKING',
      error: `Failed to chunk project files: ${errorMessage}`
    });
  }

  return {
    chunkedFileCount,
    totalChunksCreated,
    errors
  };
}

/**
 * Generates embeddings for all chunks in a project
 * Implements RFC-IDX-001: Embedding generation step (P1-E2-S1)
 */
export async function generateEmbeddingsForProjectChunks(
  env: Env,
  projectId: string,
  userEmbeddingApiKey: string,
  embeddingModelConfig: import('../types.js').EmbeddingModelConfig
): Promise<import('../types.js').EmbeddingGenerationResult> {
  const startTime = Date.now();
  const errors: Array<{ chunkId: string; filePath: string; error: string }> = [];
  let processedChunkCount = 0;
  let successfulEmbeddingCount = 0;

  // Import the BYOK proxy client
  const { getEmbeddingsViaProxy, isEmbeddingError } = await import('../lib/byokProxyClient.js');
  const { saveChunkMetadata } = await import('../lib/kvStore.js');

  try {
    console.log(`Starting embedding generation for project ${projectId}`, {
      service: embeddingModelConfig.service,
      model: embeddingModelConfig.modelName,
      batchSize: embeddingModelConfig.batchSize
    });

    // Get proxy URL from environment or use default for local development
    const proxyUrl = (env.PROXY_WORKER_URL as string) || 'http://127.0.0.1:8787/api/proxy/external';

    // List all chunk metadata for the project
    const prefix = `project:${projectId}:chunk:`;
    const chunkMetadataKeys = await env.METADATA_KV.list({ prefix });

    console.log(`Found ${chunkMetadataKeys.keys.length} chunks to process for project ${projectId}`);

    // Process chunks individually or in batches
    const batchSize = embeddingModelConfig.batchSize || 20;
    const chunks: Array<{ metadata: import('../types.js').ChunkMetadata; text: string }> = [];

    // First, collect all chunk data
    for (const kvKey of chunkMetadataKeys.keys) {
      try {
        // Get chunk metadata from KV
        const metadataJson = await env.METADATA_KV.get(kvKey.name);
        if (!metadataJson) {
          console.warn(`No metadata found for key: ${kvKey.name}`);
          continue;
        }

        const chunkMetadata = JSON.parse(metadataJson) as import('../types.js').ChunkMetadata;

        // Skip if already has embedding (idempotency)
        if (chunkMetadata.tempEmbeddingVector && chunkMetadata.tempEmbeddingVector.length > 0) {
          console.log(`Skipping chunk ${chunkMetadata.id} - already has embedding`);
          processedChunkCount++;
          successfulEmbeddingCount++;
          continue;
        }

        // Get chunk text from R2
        const chunkTextR2Object = await env.CODE_UPLOADS_BUCKET.get(chunkMetadata.r2ChunkPath);
        if (!chunkTextR2Object) {
          errors.push({
            chunkId: chunkMetadata.id,
            filePath: chunkMetadata.originalFilePath,
            error: `Chunk text not found in R2: ${chunkMetadata.r2ChunkPath}`
          });
          continue;
        }

        const chunkText = await chunkTextR2Object.text();
        chunks.push({ metadata: chunkMetadata, text: chunkText });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to load chunk data for ${kvKey.name}:`, error);
        errors.push({
          chunkId: kvKey.name.split(':').pop() || 'unknown',
          filePath: 'unknown',
          error: `Failed to load chunk data: ${errorMessage}`
        });
      }
    }

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchTexts = batch.map(chunk => chunk.text);
      const batchNumber = Math.floor(i / batchSize) + 1;

      console.log(`Processing batch ${batchNumber}/${Math.ceil(chunks.length / batchSize)} with ${batch.length} chunks`);

      try {
        // Prepare embedding payload
        const embeddingPayload = {
          input: batchTexts,
          ...(embeddingModelConfig.modelName && { model: embeddingModelConfig.modelName }),
          ...(embeddingModelConfig.dimensions && { dimensions: embeddingModelConfig.dimensions })
        };

        // Call BYOK proxy for embeddings
        const embeddingResult = await getEmbeddingsViaProxy(
          fetch,
          embeddingModelConfig.service,
          userEmbeddingApiKey,
          embeddingPayload,
          proxyUrl
        );

        if (isEmbeddingError(embeddingResult)) {
          const errorMsg = `Batch ${batchNumber} failed: ${embeddingResult.error.message}`;
          console.error(errorMsg, embeddingResult.error);

          // Add errors for all chunks in this batch
          for (const chunk of batch) {
            errors.push({
              chunkId: chunk.metadata.id,
              filePath: chunk.metadata.originalFilePath,
              error: errorMsg
            });
          }
          processedChunkCount += batch.length;
          continue;
        }

        // Process successful embeddings
        const embeddings = embeddingResult.data
          .sort((a, b) => a.index - b.index) // Ensure correct order
          .map(item => item.embedding);

        if (embeddings.length !== batch.length) {
          const errorMsg = `Embedding count mismatch: expected ${batch.length}, got ${embeddings.length}`;
          console.error(errorMsg);

          for (const chunk of batch) {
            errors.push({
              chunkId: chunk.metadata.id,
              filePath: chunk.metadata.originalFilePath,
              error: errorMsg
            });
          }
          processedChunkCount += batch.length;
          continue;
        }

        // Store embeddings in chunk metadata (temporarily for P1-E2-S1)
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];

          if (!chunk || !embedding) {
            console.error(`Missing chunk or embedding at index ${j}`);
            continue;
          }

          try {
            // Update chunk metadata with embedding
            const updatedMetadata: import('../types.js').ChunkMetadata = {
              ...chunk.metadata,
              tempEmbeddingVector: embedding
            };

            // Save updated metadata to KV
            await saveChunkMetadata(env.METADATA_KV, updatedMetadata);

            successfulEmbeddingCount++;
            console.log(`Successfully generated embedding for chunk ${chunk.metadata.id} (${embedding.length} dimensions)`);

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to save embedding for chunk ${chunk.metadata.id}:`, error);
            errors.push({
              chunkId: chunk.metadata.id,
              filePath: chunk.metadata.originalFilePath,
              error: `Failed to save embedding: ${errorMessage}`
            });
          }
        }

        // P1-E2-S2: Insert embeddings into Vectorize in batch
        try {
          const { insertVectorsBatch } = await import('../lib/vectorizeClient.js');

          const vectorsToInsert = batch.map((chunk, index) => {
            const embedding = embeddings[index];
            if (!embedding) {
              throw new Error(`Missing embedding for chunk ${chunk.metadata.id} at index ${index}`);
            }

            return {
              id: chunk.metadata.id,
              values: embedding,
              metadata: {
                projectId: chunk.metadata.projectId,
                chunkId: chunk.metadata.id,
                originalFilePath: chunk.metadata.originalFilePath,
                startLine: chunk.metadata.startLine
              } as import('../types.js').VectorMetadata
            };
          });

          const vectorizeResult = await insertVectorsBatch(env.VECTORIZE_INDEX, vectorsToInsert);

          console.log(`Successfully inserted ${vectorsToInsert.length} vectors into Vectorize for batch ${batchNumber}`, {
            count: vectorizeResult.count
          });

          // Update chunk metadata to mark as indexed and remove temporary embedding
          for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];

            if (!chunk) {
              console.error(`Missing chunk at index ${j}`);
              continue;
            }

            try {
              const { tempEmbeddingVector, ...updatedMetadata } = chunk.metadata;

              await saveChunkMetadata(env.METADATA_KV, updatedMetadata);
              successfulEmbeddingCount++;

            } catch (kvError) {
              const errorMessage = kvError instanceof Error ? kvError.message : 'Unknown error';
              console.error(`Failed to update KV metadata for chunk ${chunk.metadata.id}:`, kvError);
              errors.push({
                chunkId: chunk.metadata.id,
                filePath: chunk.metadata.originalFilePath,
                error: `Failed to update KV metadata: ${errorMessage}`
              });
            }
          }

        } catch (vectorizeError) {
          const errorMessage = vectorizeError instanceof Error ? vectorizeError.message : 'Unknown error';
          console.error(`Failed to insert batch ${batchNumber} into Vectorize:`, vectorizeError);

          // Add errors for all chunks in this batch
          for (const chunk of batch) {
            if (chunk) {
              errors.push({
                chunkId: chunk.metadata.id,
                filePath: chunk.metadata.originalFilePath,
                error: `Vectorize insertion failed: ${errorMessage}`
              });
            }
          }
        }

        processedChunkCount += batch.length;

        // Add small delay between batches to be respectful to external APIs
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to process batch ${batchNumber}:`, error);

        for (const chunk of batch) {
          errors.push({
            chunkId: chunk.metadata.id,
            filePath: chunk.metadata.originalFilePath,
            error: `Batch processing failed: ${errorMessage}`
          });
        }
        processedChunkCount += batch.length;
      }
    }

    const totalProcessingTimeMs = Date.now() - startTime;

    console.log(`Embedding generation complete for project ${projectId}`, {
      processedChunkCount,
      successfulEmbeddingCount,
      errorCount: errors.length,
      totalProcessingTimeMs
    });

    return {
      processedChunkCount,
      successfulEmbeddingCount,
      errors,
      totalProcessingTimeMs
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to generate embeddings for project ${projectId}:`, error);

    const totalProcessingTimeMs = Date.now() - startTime;

    return {
      processedChunkCount,
      successfulEmbeddingCount,
      errors: [
        ...errors,
        {
          chunkId: 'PROJECT_EMBEDDING_GENERATION',
          filePath: 'PROJECT_LEVEL',
          error: `Failed to generate embeddings: ${errorMessage}`
        }
      ],
      totalProcessingTimeMs
    };
  }
}

/**
 * Apply a diff to a file in R2
 * Implements P3-E1-S2: Diff application to R2 files
 * Implements RFC-AGT-003: Semantic Diff Generation & Application
 */
export async function applyDiffToR2File(
  env: Env,
  projectId: string,
  filePath: string,
  diffString: string
): Promise<{ success: boolean; error?: string; newContent?: string }> {
  try {
    // Import diff-match-patch
    const { diff_match_patch } = await import('diff-match-patch');
    
    // Construct R2 key for the original file
    const r2Key = `projects/${projectId}/original/${filePath}`;
    
    // Fetch original file content from R2
    const r2Object = await env.CODE_UPLOADS_BUCKET.get(r2Key);
    
    if (!r2Object) {
      return {
        success: false,
        error: `Original file not found: ${filePath}`
      };
    }
    
    const originalContent = await r2Object.text();
    
    // Apply diff using diff-match-patch
    const dmp = new diff_match_patch();
    
    try {
      // Parse the unified diff into patches
      const patches = dmp.patch_fromText(diffString);
      
      if (patches.length === 0) {
        return {
          success: false,
          error: 'Invalid diff format: no patches found'
        };
      }
      
      // Apply patches to original content
      const [patchedText, results] = dmp.patch_apply(patches, originalContent);
      
      // Check if all patches applied successfully
      const allApplied = results.every(result => result === true);
      
      if (!allApplied) {
        return {
          success: false,
          error: 'Diff could not be applied cleanly. The file may have been modified since the diff was generated.'
        };
      }
      
      // Write new content back to R2
      await env.CODE_UPLOADS_BUCKET.put(r2Key, patchedText, {
        httpMetadata: {
          contentType: determineContentType(filePath)
        }
      });
      
      console.log(`Successfully applied diff to ${filePath} in project ${projectId}`);
      
      return {
        success: true,
        newContent: patchedText
      };
      
    } catch (diffError) {
      console.error('Error applying diff:', diffError);
      return {
        success: false,
        error: `Failed to apply diff: ${diffError instanceof Error ? diffError.message : 'Unknown error'}`
      };
    }
    
  } catch (error) {
    console.error('Error in applyDiffToR2File:', error);
    return {
      success: false,
      error: `Failed to process diff application: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}