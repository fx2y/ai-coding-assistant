/**
 * Project Handlers - Code Upload & Management
 * Implements RFC-IDX-001: Codebase Indexing Pipeline (P1-E1-S1)
 */

import type { Context } from 'hono';
import type { Env, ProjectUploadResponse, PinnedContextItem, CreatePinnedItemRequest } from '../types.js';
import { processAndStoreZip, generateProjectId, chunkFilesInProject } from '../services/indexingService.js';
import {
  savePinnedItem,
  getPinnedItemsForProject,
  deletePinnedItem
} from '../lib/kvStore.js';
import { CreatePinnedItemSchema } from '../types.js';

/**
 * Handles project code upload via ZIP file
 * POST /api/project/upload
 */
export async function handleProjectUpload(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get('codeZipFile');

    // Validate file exists and is a File object
    if (!file) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing codeZipFile in form data. Expected a ZIP file.',
        code: 'MISSING_ZIP_FILE'
      }, 400);
    }

    // Check if it's a File object by checking for File-specific properties
    if (typeof file === 'string' || !('size' in file) || !('name' in file) || !('type' in file)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid codeZipFile in form data. Expected a ZIP file.',
        code: 'INVALID_ZIP_FILE'
      }, 400);
    }

    // At this point, file should be a File object
    const zipFile = file as File;

    // Validate file type
    if (!zipFile.type.includes('zip') && !zipFile.name.toLowerCase().endsWith('.zip')) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid file type. Expected a ZIP file.',
        code: 'INVALID_FILE_TYPE'
      }, 400);
    }

    // Check file size (limit to 50MB to prevent abuse)
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB
    if (zipFile.size > maxSizeBytes) {
      return c.json({
        error: 'BadRequest',
        message: `File too large. Maximum size is ${maxSizeBytes / (1024 * 1024)}MB.`,
        code: 'FILE_TOO_LARGE'
      }, 400);
    }

    // Generate unique project ID
    const projectId = generateProjectId();

    console.log(`Starting upload for project ${projectId}, file: ${zipFile.name} (${zipFile.size} bytes)`);

    // Process ZIP and store files in R2
    const { uploadedFiles, errors } = await processAndStoreZip(
      c.env.CODE_UPLOADS_BUCKET,
      projectId,
      zipFile
    );

    // Prepare response
    const response: ProjectUploadResponse = {
      project_id: projectId,
      uploaded_files_count: uploadedFiles.length,
      uploaded_file_paths: uploadedFiles.map(f => f.path),
      errors
    };

    // Log completion
    console.log(`Upload complete for project ${projectId}: ${uploadedFiles.length} files uploaded, ${errors.length} errors`);

    // Return success response (200 even if some files failed)
    return c.json(response, 200);

  } catch (error) {
    console.error('Project upload failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to process project upload',
      code: 'UPLOAD_PROCESSING_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Handles project file chunking
 * POST /api/project/:projectId/process_chunks
 */
export async function handleProjectChunking(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Extract project ID from URL parameters
    const projectId = c.req.param('projectId');

    if (!projectId) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing projectId parameter',
        code: 'MISSING_PROJECT_ID'
      }, 400);
    }

    // Validate project ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid projectId format. Expected UUID.',
        code: 'INVALID_PROJECT_ID'
      }, 400);
    }

    console.log(`Starting chunking process for project ${projectId}`);

    // Process chunks for the project
    const result = await chunkFilesInProject(c.env, projectId);

    // Log completion
    console.log(`Chunking complete for project ${projectId}: ${result.chunkedFileCount} files processed, ${result.totalChunksCreated} chunks created, ${result.errors.length} errors`);

    // Return success response (200 even if some files failed)
    return c.json(result, 200);

  } catch (error) {
    console.error('Project chunking failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to process project chunking',
      code: 'CHUNKING_PROCESSING_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Handles project embedding generation
 * POST /api/project/:projectId/generate_embeddings
 * Implements RFC-IDX-001: Embedding generation step (P1-E2-S1)
 * Implements RFC-MOD-001: User-Configurable Model Routing
 */
export async function handleEmbeddingGeneration(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Extract project ID from URL parameters
    const projectId = c.req.param('projectId');

    if (!projectId) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing projectId parameter',
        code: 'MISSING_PROJECT_ID'
      }, 400);
    }

    // Validate project ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid projectId format. Expected UUID.',
        code: 'INVALID_PROJECT_ID'
      }, 400);
    }

    // Parse and validate request body - now only requires the API key
    const body = await c.req.json();
    
    if (!body.userEmbeddingApiKey || typeof body.userEmbeddingApiKey !== 'string') {
      return c.json({
        error: 'BadRequest',
        message: 'Missing or invalid userEmbeddingApiKey',
        code: 'MISSING_EMBEDDING_API_KEY'
      }, 400);
    }

    const { userEmbeddingApiKey } = body;

    console.log(`Starting embedding generation for project ${projectId} using model preferences`);

    // Import and call the embedding generation service
    const { generateEmbeddingsForProjectChunks } = await import('../services/indexingService.js');

    const result = await generateEmbeddingsForProjectChunks(
      c.env,
      projectId,
      userEmbeddingApiKey
    );

    // Log completion
    console.log(`Embedding generation complete for project ${projectId}`, {
      processedChunkCount: result.processedChunkCount,
      successfulEmbeddingCount: result.successfulEmbeddingCount,
      errorCount: result.errors.length,
      totalProcessingTimeMs: result.totalProcessingTimeMs
    });

    // Return success response (200 even if some embeddings failed)
    return c.json(result, 200);

  } catch (error) {
    console.error('Embedding generation failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to generate embeddings',
      code: 'EMBEDDING_GENERATION_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Pinned Context Management Handlers
 * Implements RFC-CTX-001, RFC-MEM-001
 */

/**
 * Handles adding a pinned context item
 * POST /api/project/:projectId/pinned_context
 */
export async function handleAddPinnedItem(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Extract project ID from URL parameters
    const projectId = c.req.param('projectId');

    if (!projectId) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing projectId parameter',
        code: 'MISSING_PROJECT_ID'
      }, 400);
    }

    // Validate project ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid projectId format. Expected UUID.',
        code: 'INVALID_PROJECT_ID'
      }, 400);
    }

    // Parse and validate request body
    const body = await c.req.json();
    const validationResult = CreatePinnedItemSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid request format',
        code: 'INVALID_REQUEST_FORMAT',
        details: validationResult.error.flatten()
      }, 400);
    }

    const { type, content, description } = validationResult.data;

    // Generate unique ID for the pinned item
    const pinnedItemId = crypto.randomUUID();

    // Create pinned context item
    const pinnedItem: PinnedContextItem = {
      id: pinnedItemId,
      projectId,
      type,
      content,
      ...(description && { description }),
      createdAt: new Date().toISOString()
    };

    // Save to KV
    await savePinnedItem(c.env.METADATA_KV, pinnedItem);

    console.log(`Added pinned item ${pinnedItemId} for project ${projectId}`, {
      type,
      contentLength: content.length,
      hasDescription: !!description
    });

    return c.json(pinnedItem, 201);

  } catch (error) {
    console.error('Add pinned item failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to add pinned item',
      code: 'ADD_PINNED_ITEM_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Handles listing pinned context items for a project
 * GET /api/project/:projectId/pinned_context
 */
export async function handleListPinnedItems(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Extract project ID from URL parameters
    const projectId = c.req.param('projectId');

    if (!projectId) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing projectId parameter',
        code: 'MISSING_PROJECT_ID'
      }, 400);
    }

    // Validate project ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid projectId format. Expected UUID.',
        code: 'INVALID_PROJECT_ID'
      }, 400);
    }

    // Retrieve pinned items from KV
    const pinnedItems = await getPinnedItemsForProject(c.env.METADATA_KV, projectId);

    console.log(`Retrieved ${pinnedItems.length} pinned items for project ${projectId}`);

    return c.json({
      items: pinnedItems,
      count: pinnedItems.length
    }, 200);

  } catch (error) {
    console.error('List pinned items failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to list pinned items',
      code: 'LIST_PINNED_ITEMS_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Handles removing a pinned context item
 * DELETE /api/project/:projectId/pinned_context/:pinnedItemId
 */
export async function handleRemovePinnedItem(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Extract parameters from URL
    const projectId = c.req.param('projectId');
    const pinnedItemId = c.req.param('pinnedItemId');

    if (!projectId) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing projectId parameter',
        code: 'MISSING_PROJECT_ID'
      }, 400);
    }

    if (!pinnedItemId) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing pinnedItemId parameter',
        code: 'MISSING_PINNED_ITEM_ID'
      }, 400);
    }

    // Validate project ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid projectId format. Expected UUID.',
        code: 'INVALID_PROJECT_ID'
      }, 400);
    }

    if (!uuidRegex.test(pinnedItemId)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid pinnedItemId format. Expected UUID.',
        code: 'INVALID_PINNED_ITEM_ID'
      }, 400);
    }

    // Delete from KV
    await deletePinnedItem(c.env.METADATA_KV, projectId, pinnedItemId);

    console.log(`Removed pinned item ${pinnedItemId} from project ${projectId}`);

    return c.json({
      success: true,
      message: 'Pinned item removed successfully'
    }, 200);

  } catch (error) {
    console.error('Remove pinned item failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to remove pinned item',
      code: 'REMOVE_PINNED_ITEM_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Handles applying a diff to a file in the project
 * POST /api/project/:projectId/apply_diff
 * Implements P3-E1-S2: Diff application API
 * Implements RFC-AGT-003: Semantic Diff Generation & Application
 */
export async function handleApplyDiff(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    // Extract project ID from URL parameters
    const projectId = c.req.param('projectId');

    if (!projectId) {
      return c.json({
        error: 'BadRequest',
        message: 'Missing projectId parameter',
        code: 'MISSING_PROJECT_ID'
      }, 400);
    }

    // Validate project ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid projectId format. Expected UUID.',
        code: 'INVALID_PROJECT_ID'
      }, 400);
    }

    // Parse and validate request body
    const body = await c.req.json();
    const { ApplyDiffRequestSchema } = await import('../types.js');
    const validationResult = ApplyDiffRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json({
        error: 'BadRequest',
        message: 'Invalid request format',
        code: 'INVALID_REQUEST_FORMAT',
        details: validationResult.error.flatten()
      }, 400);
    }

    const { file_path, diff_string } = validationResult.data;

    console.log(`Applying diff to file ${file_path} in project ${projectId}`);

    // Apply diff using the indexing service
    const { applyDiffToR2File } = await import('../services/indexingService.js');
    const result = await applyDiffToR2File(c.env, projectId, file_path, diff_string);

    if (!result.success) {
      return c.json({
        error: 'DiffApplicationFailed',
        message: result.error || 'Failed to apply diff',
        code: 'DIFF_APPLICATION_FAILED'
      }, 400);
    }

    // Return success response
    const response: import('../types.js').ApplyDiffResponse = {
      success: true,
      message: `Diff successfully applied to ${file_path}`,
      ...(result.newContent && { new_content: result.newContent })
    };

    console.log(`Diff application complete for ${file_path} in project ${projectId}`);

    return c.json(response, 200);

  } catch (error) {
    console.error('Apply diff failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to apply diff',
      code: 'DIFF_APPLICATION_ERROR',
      details: errorMessage
    }, 500);
  }
}