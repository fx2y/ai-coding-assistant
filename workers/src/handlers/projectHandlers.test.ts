/**
 * Unit tests for Project Handlers
 * Tests P1-E1-S1: Code Upload & R2 Storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleProjectUpload, handleAddPinnedItem, handleListPinnedItems, handleRemovePinnedItem } from './projectHandlers.js';
import * as indexingService from '../services/indexingService.js';
import type { Env } from '../types.js';

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

describe('handleEmbeddingGeneration', () => {
  const mockEnv = {
    ENVIRONMENT: 'test',
    CODE_UPLOADS_BUCKET: {
      get: vi.fn()
    },
    METADATA_KV: {
      list: vi.fn(),
      get: vi.fn(),
      put: vi.fn()
    },
    PROXY_WORKER_URL: 'http://localhost:8787/api/proxy/external'
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the embedding generation service
    vi.doMock('../services/indexingService.js', () => ({
      generateEmbeddingsForProjectChunks: vi.fn()
    }));
  });

  it('should handle valid embedding generation request', async () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    const requestBody = {
      userEmbeddingApiKey: 'test-api-key'
    };

    const mockResult = {
      processedChunkCount: 10,
      successfulEmbeddingCount: 10,
      errors: [],
      totalProcessingTimeMs: 1500
    };

    // Mock the indexing service
    const indexingService = await import('../services/indexingService.js');
    vi.spyOn(indexingService, 'generateEmbeddingsForProjectChunks').mockResolvedValue(mockResult);

    // Create mock context
    const mockContext = {
      req: {
        param: vi.fn().mockReturnValue(projectId),
        json: vi.fn().mockResolvedValue(requestBody)
      },
      json: vi.fn().mockReturnValue(new Response()),
      env: mockEnv
    };

    const { handleEmbeddingGeneration } = await import('./projectHandlers.js');
    await handleEmbeddingGeneration(mockContext as any);

    expect(mockContext.req.param).toHaveBeenCalledWith('projectId');
    expect(indexingService.generateEmbeddingsForProjectChunks).toHaveBeenCalledWith(
      mockEnv,
      projectId,
      'test-api-key'
    );
    expect(mockContext.json).toHaveBeenCalledWith(mockResult, 200);
  });

  it('should reject invalid project ID format', async () => {
    const invalidProjectId = 'invalid-id';

    const mockContext = {
      req: {
        param: vi.fn().mockReturnValue(invalidProjectId)
      },
      json: vi.fn().mockReturnValue(new Response()),
      env: mockEnv
    };

    const { handleEmbeddingGeneration } = await import('./projectHandlers.js');
    await handleEmbeddingGeneration(mockContext as any);

    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BadRequest',
        message: 'Invalid projectId format. Expected UUID.',
        code: 'INVALID_PROJECT_ID'
      }),
      400
    );
  });

  it('should reject invalid request body', async () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    const invalidRequestBody = {
      userEmbeddingApiKey: '' // Invalid: empty string
    };

    const mockContext = {
      req: {
        param: vi.fn().mockReturnValue(projectId),
        json: vi.fn().mockResolvedValue(invalidRequestBody)
      },
      json: vi.fn().mockReturnValue(new Response()),
      env: mockEnv
    };

    const { handleEmbeddingGeneration } = await import('./projectHandlers.js');
    await handleEmbeddingGeneration(mockContext as any);

    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BadRequest',
        message: 'Missing or invalid userEmbeddingApiKey',
        code: 'MISSING_EMBEDDING_API_KEY'
      }),
      400
    );
  });
});

describe('Pinned Context Handlers', () => {
  describe('handleAddPinnedItem', () => {
    it('should add a pinned item successfully', async () => {
      const mockKV = {
        put: vi.fn().mockResolvedValue(undefined)
      } as unknown as KVNamespace;

      const mockEnv = {
        METADATA_KV: mockKV
      } as Env;

      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000'),
          json: vi.fn().mockResolvedValue({
            type: 'text_snippet',
            content: 'Important note about authentication',
            description: 'Auth reminder'
          })
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      const response = await handleAddPinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'text_snippet',
          content: 'Important note about authentication',
          description: 'Auth reminder',
          createdAt: expect.any(String)
        }),
        201
      );
      expect(mockKV.put).toHaveBeenCalledOnce();
    });

    it('should add a pinned item without description', async () => {
      const mockKV = {
        put: vi.fn().mockResolvedValue(undefined)
      } as unknown as KVNamespace;

      const mockEnv = {
        METADATA_KV: mockKV
      } as Env;

      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000'),
          json: vi.fn().mockResolvedValue({
            type: 'file_path',
            content: 'src/components/auth.tsx'
          })
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      const response = await handleAddPinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_path',
          content: 'src/components/auth.tsx'
        }),
        201
      );
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.not.objectContaining({
          description: expect.anything()
        }),
        201
      );
    });

    it('should return 400 for missing projectId', async () => {
      const mockEnv = {} as Env;

      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue(undefined)
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleAddPinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          code: 'MISSING_PROJECT_ID'
        }),
        400
      );
    });

    it('should return 400 for invalid projectId format', async () => {
      const mockEnv = {} as Env;

      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('invalid-id')
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleAddPinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          code: 'INVALID_PROJECT_ID'
        }),
        400
      );
    });

    it('should return 400 for invalid request body', async () => {
      const mockEnv = {} as Env;

      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000'),
          json: vi.fn().mockResolvedValue({
            type: 'invalid_type',
            content: ''
          })
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleAddPinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          code: 'INVALID_REQUEST_FORMAT'
        }),
        400
      );
    });
  });

  describe('handleListPinnedItems', () => {
    it('should list pinned items successfully', async () => {
      const mockItems = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'text_snippet',
          content: 'Important note',
          description: 'Auth reminder',
          createdAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          type: 'file_path',
          content: 'src/auth.tsx',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      ];

      const mockKV = {
        list: vi.fn().mockResolvedValue({
          keys: [
            { name: 'project:550e8400-e29b-41d4-a716-446655440000:pinned_item:123e4567-e89b-12d3-a456-426614174000' },
            { name: 'project:550e8400-e29b-41d4-a716-446655440000:pinned_item:123e4567-e89b-12d3-a456-426614174001' }
          ]
        }),
        get: vi.fn()
          .mockResolvedValueOnce(JSON.stringify(mockItems[0]))
          .mockResolvedValueOnce(JSON.stringify(mockItems[1]))
      } as unknown as KVNamespace;

      const mockEnv = {
        METADATA_KV: mockKV
      } as Env;

      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000')
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleListPinnedItems(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          items: expect.arrayContaining([
            expect.objectContaining({ id: '123e4567-e89b-12d3-a456-426614174000' }),
            expect.objectContaining({ id: '123e4567-e89b-12d3-a456-426614174001' })
          ]),
          count: 2
        },
        200
      );
    });

    it('should return empty list when no items exist', async () => {
      const mockKV = {
        list: vi.fn().mockResolvedValue({ keys: [] })
      } as unknown as KVNamespace;

      const mockEnv = {
        METADATA_KV: mockKV
      } as Env;

      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000')
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleListPinnedItems(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          items: [],
          count: 0
        },
        200
      );
    });
  });

  describe('handleRemovePinnedItem', () => {
    it('should remove a pinned item successfully', async () => {
      const mockKV = {
        delete: vi.fn().mockResolvedValue(undefined)
      } as unknown as KVNamespace;

      const mockEnv = {
        METADATA_KV: mockKV
      } as Env;

      const mockContext = {
        req: {
          param: vi.fn()
            .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440000')
            .mockReturnValueOnce('123e4567-e89b-12d3-a456-426614174000')
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleRemovePinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          success: true,
          message: 'Pinned item removed successfully'
        },
        200
      );
      expect(mockKV.delete).toHaveBeenCalledWith('project:550e8400-e29b-41d4-a716-446655440000:pinned_item:123e4567-e89b-12d3-a456-426614174000');
    });

    it('should return 400 for missing pinnedItemId', async () => {
      const mockEnv = {} as Env;

      const mockContext = {
        req: {
          param: vi.fn()
            .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440000')
            .mockReturnValueOnce(undefined)
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleRemovePinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          code: 'MISSING_PINNED_ITEM_ID'
        }),
        400
      );
    });

    it('should return 400 for invalid pinnedItemId format', async () => {
      const mockEnv = {} as Env;

      const mockContext = {
        req: {
          param: vi.fn()
            .mockReturnValueOnce('550e8400-e29b-41d4-a716-446655440000')
            .mockReturnValueOnce('invalid-id')
        },
        json: vi.fn().mockReturnValue(new Response()),
        env: mockEnv
      };

      await handleRemovePinnedItem(mockContext as any);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          code: 'INVALID_PINNED_ITEM_ID'
        }),
        400
      );
    });
  });
});