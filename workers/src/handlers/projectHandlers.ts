/**
 * Project Handlers - Code Upload & Management
 * Implements RFC-IDX-001: Codebase Indexing Pipeline (P1-E1-S1)
 */

import type { Context } from 'hono';
import type { Env, ProjectUploadResponse, ChunkingResult } from '../types.js';
import { processAndStoreZip, generateProjectId, chunkFilesInProject } from '../services/indexingService.js';

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