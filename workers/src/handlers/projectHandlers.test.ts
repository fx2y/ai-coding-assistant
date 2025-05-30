/**
 * Unit tests for Project Handlers
 * Tests P1-E1-S1: Code Upload & R2 Storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleProjectUpload } from './projectHandlers.js';
import * as indexingService from '../services/indexingService.js';

// Mock the indexing service
vi.mock('../services/indexingService.js', () => ({
  processAndStoreZip: vi.fn(),
  generateProjectId: vi.fn(() => 'test-project-id-123')
}));

// Mock Hono context
const createMockContext = (formData: FormData) => ({
  req: {
    formData: vi.fn().mockResolvedValue(formData)
  },
  env: {
    CODE_UPLOADS_BUCKET: {
      put: vi.fn()
    }
  },
  json: vi.fn((data, status) => ({
    status,
    data
  }))
});

describe('handleProjectUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully upload a ZIP file', async () => {
    // Create mock file
    const mockFile = new File(['test content'], 'test.zip', {
      type: 'application/zip'
    });

    const formData = new FormData();
    formData.append('codeZipFile', mockFile);

    const mockContext = createMockContext(formData);

    // Mock successful processing
    const mockProcessResult = {
      uploadedFiles: [
        { path: 'src/main.js', r2Key: 'projects/test-project-id-123/original/src/main.js' },
        { path: 'README.md', r2Key: 'projects/test-project-id-123/original/README.md' }
      ],
      errors: []
    };

    vi.mocked(indexingService.processAndStoreZip).mockResolvedValue(mockProcessResult);

    // Execute handler
    await handleProjectUpload(mockContext as any);

    // Verify response
    expect(mockContext.json).toHaveBeenCalledWith({
      project_id: 'test-project-id-123',
      uploaded_files_count: 2,
      uploaded_file_paths: ['src/main.js', 'README.md'],
      errors: []
    }, 200);

    // Verify service was called correctly
    expect(indexingService.processAndStoreZip).toHaveBeenCalledWith(
      mockContext.env.CODE_UPLOADS_BUCKET,
      'test-project-id-123',
      mockFile
    );
  });

  it('should return 400 when no file is provided', async () => {
    const formData = new FormData();
    const mockContext = createMockContext(formData);

    await handleProjectUpload(mockContext as any);

    expect(mockContext.json).toHaveBeenCalledWith({
      error: 'BadRequest',
      message: 'Missing codeZipFile in form data. Expected a ZIP file.',
      code: 'MISSING_ZIP_FILE'
    }, 400);
  });

  it('should return 400 when file is not a ZIP', async () => {
    const mockFile = new File(['test content'], 'test.txt', {
      type: 'text/plain'
    });

    const formData = new FormData();
    formData.append('codeZipFile', mockFile);

    const mockContext = createMockContext(formData);

    await handleProjectUpload(mockContext as any);

    expect(mockContext.json).toHaveBeenCalledWith({
      error: 'BadRequest',
      message: 'Invalid file type. Expected a ZIP file.',
      code: 'INVALID_FILE_TYPE'
    }, 400);
  });

  it('should return 400 when file is too large', async () => {
    // Create a mock file that appears to be larger than 50MB
    const mockFile = new File(['test content'], 'large.zip', {
      type: 'application/zip'
    });

    // Override the size property to simulate a large file
    Object.defineProperty(mockFile, 'size', {
      value: 60 * 1024 * 1024, // 60MB
      writable: false
    });

    const formData = new FormData();
    formData.append('codeZipFile', mockFile);

    const mockContext = createMockContext(formData);

    await handleProjectUpload(mockContext as any);

    expect(mockContext.json).toHaveBeenCalledWith({
      error: 'BadRequest',
      message: 'File too large. Maximum size is 50MB.',
      code: 'FILE_TOO_LARGE'
    }, 400);
  });

  it('should handle processing errors gracefully', async () => {
    const mockFile = new File(['test content'], 'test.zip', {
      type: 'application/zip'
    });

    const formData = new FormData();
    formData.append('codeZipFile', mockFile);

    const mockContext = createMockContext(formData);

    // Mock processing error
    vi.mocked(indexingService.processAndStoreZip).mockRejectedValue(
      new Error('R2 connection failed')
    );

    await handleProjectUpload(mockContext as any);

    expect(mockContext.json).toHaveBeenCalledWith({
      error: 'InternalServerError',
      message: 'Failed to process project upload',
      code: 'UPLOAD_PROCESSING_FAILED',
      details: 'R2 connection failed'
    }, 500);
  });

  it('should return partial success when some files fail', async () => {
    const mockFile = new File(['test content'], 'test.zip', {
      type: 'application/zip'
    });

    const formData = new FormData();
    formData.append('codeZipFile', mockFile);

    const mockContext = createMockContext(formData);

    // Mock partial success
    const mockProcessResult = {
      uploadedFiles: [
        { path: 'src/main.js', r2Key: 'projects/test-project-id-123/original/src/main.js' }
      ],
      errors: [
        { path: 'src/broken.js', error: 'Failed to upload to R2' }
      ]
    };

    vi.mocked(indexingService.processAndStoreZip).mockResolvedValue(mockProcessResult);

    await handleProjectUpload(mockContext as any);

    expect(mockContext.json).toHaveBeenCalledWith({
      project_id: 'test-project-id-123',
      uploaded_files_count: 1,
      uploaded_file_paths: ['src/main.js'],
      errors: [{ path: 'src/broken.js', error: 'Failed to upload to R2' }]
    }, 200);
  });
});