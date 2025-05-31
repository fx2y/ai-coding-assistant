/**
 * Unit tests for Retrieval Service
 * Tests RFC-RET-001: Basic Vector Search Retrieval (P1-E3-S1)
 * Extended for P1-E3-S2: Result Hydration & Client Display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performVectorSearch } from './retrievalService.js';
import type { Env, EmbeddingModelConfig, CodeChunk } from '../types.js';
import * as byokProxyClient from '../lib/byokProxyClient.js';
import * as vectorizeClient from '../lib/vectorizeClient.js';

// Mock the dependencies
vi.mock('../lib/byokProxyClient.js');
vi.mock('../lib/vectorizeClient.js');

const mockGetEmbeddingsViaProxy = vi.mocked(byokProxyClient.getEmbeddingsViaProxy);
const mockIsEmbeddingError = vi.mocked(byokProxyClient.isEmbeddingError);
const mockQueryVectorsForProject = vi.mocked(vectorizeClient.queryVectorsForProject);

describe('retrievalService', () => {
  let mockEnv: Env;
  const projectId = 'test-project-123';
  const queryText = 'function to handle user authentication';
  const userApiKey = 'test-api-key';
  const embeddingConfig: EmbeddingModelConfig = {
    service: 'openai_embedding',
    modelName: 'text-embedding-ada-002'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEnv = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: {
        get: vi.fn()
      } as unknown as R2Bucket,
      METADATA_KV: {
        get: vi.fn()
      } as unknown as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex,
      PROXY_WORKER_URL: 'http://localhost:8787/api/proxy/external'
    };
  });

  describe('performVectorSearch', () => {
    it('should successfully perform vector search with hydrated results (P1-E3-S2)', async () => {
      // Mock successful embedding generation
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002',
        usage: { prompt_tokens: 10, total_tokens: 10 }
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      // Mock successful Vectorize query
      const mockVectorizeResults = {
        matches: [
          {
            id: 'chunk-1',
            score: 0.95,
            metadata: {
              projectId: projectId,
              chunkId: 'chunk-1',
              originalFilePath: 'src/auth.js',
              startLine: 10,
              language: 'javascript'
            }
          },
          {
            id: 'chunk-2',
            score: 0.87,
            metadata: {
              projectId: projectId,
              chunkId: 'chunk-2',
              originalFilePath: 'src/login.js',
              startLine: 25,
              language: 'javascript'
            }
          }
        ],
        count: 2
      };
      
      mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

      // Mock chunk metadata from KV
      const mockChunkMeta1: CodeChunk = {
        id: 'chunk-1',
        projectId: projectId,
        filePath: 'src/auth.js',
        r2ChunkPath: 'projects/test-project-123/chunks/chunk-1.txt',
        startLine: 10,
        endLine: 25
      };

      const mockChunkMeta2: CodeChunk = {
        id: 'chunk-2',
        projectId: projectId,
        filePath: 'src/login.js',
        r2ChunkPath: 'projects/test-project-123/chunks/chunk-2.txt',
        startLine: 25,
        endLine: 40
      };

      (mockEnv.METADATA_KV.get as any)
        .mockResolvedValueOnce(JSON.stringify(mockChunkMeta1))
        .mockResolvedValueOnce(JSON.stringify(mockChunkMeta2));

      // Mock chunk text from R2
      const mockChunkText1 = 'function authenticateUser(username, password) {\n  // Authentication logic\n  return validateCredentials(username, password);\n}';
      const mockChunkText2 = 'function handleLogin(req, res) {\n  const { username, password } = req.body;\n  // Login handling\n}';

      (mockEnv.CODE_UPLOADS_BUCKET.get as any)
        .mockResolvedValueOnce({ text: () => Promise.resolve(mockChunkText1) })
        .mockResolvedValueOnce({ text: () => Promise.resolve(mockChunkText2) });

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig,
        10
      );

      // Verify the hydrated results
      expect(result.error).toBeUndefined();
      expect(result.results).toHaveLength(2);
      
      expect(result.results![0]).toEqual({
        chunk_id: 'chunk-1',
        original_file_path: 'src/auth.js',
        start_line: 10,
        end_line: 25,
        score: 0.95,
        text_snippet: mockChunkText1,
        language: 'javascript',
        metadata: mockVectorizeResults.matches[0].metadata
      });

      expect(result.results![1]).toEqual({
        chunk_id: 'chunk-2',
        original_file_path: 'src/login.js',
        start_line: 25,
        end_line: 40,
        score: 0.87,
        text_snippet: mockChunkText2,
        language: 'javascript',
        metadata: mockVectorizeResults.matches[1].metadata
      });

      expect(result.timings.queryEmbeddingMs).toBeGreaterThanOrEqual(0);
      expect(result.timings.vectorSearchMs).toBeGreaterThanOrEqual(0);
      expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);

      // Verify KV and R2 calls
      expect(mockEnv.METADATA_KV.get).toHaveBeenCalledWith(`project:${projectId}:chunk:chunk-1`);
      expect(mockEnv.METADATA_KV.get).toHaveBeenCalledWith(`project:${projectId}:chunk:chunk-2`);
      expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(mockChunkMeta1.r2ChunkPath);
      expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(mockChunkMeta2.r2ChunkPath);
    });

    it('should handle missing chunk metadata gracefully during hydration', async () => {
      // Mock successful embedding and vector search
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      const mockVectorizeResults = {
        matches: [
          {
            id: 'chunk-1',
            score: 0.95,
            metadata: { projectId: projectId, chunkId: 'chunk-1' }
          },
          {
            id: 'chunk-missing',
            score: 0.87,
            metadata: { projectId: projectId, chunkId: 'chunk-missing' }
          }
        ],
        count: 2
      };
      
      mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

      // Mock KV responses - first succeeds, second fails
      const mockChunkMeta1: CodeChunk = {
        id: 'chunk-1',
        projectId: projectId,
        filePath: 'src/auth.js',
        r2ChunkPath: 'projects/test-project-123/chunks/chunk-1.txt',
        startLine: 10,
        endLine: 25
      };

      (mockEnv.METADATA_KV.get as any)
        .mockResolvedValueOnce(JSON.stringify(mockChunkMeta1))
        .mockResolvedValueOnce(null); // Missing metadata

      // Mock R2 response for the successful chunk
      const mockChunkText1 = 'function authenticateUser() { /* code */ }';
      (mockEnv.CODE_UPLOADS_BUCKET.get as any)
        .mockResolvedValueOnce({ text: () => Promise.resolve(mockChunkText1) });

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig,
        10
      );

      // Should only return the successfully hydrated result
      expect(result.error).toBeUndefined();
      expect(result.results).toHaveLength(1);
      expect(result.results![0].chunk_id).toBe('chunk-1');
      expect(result.results![0].text_snippet).toBe(mockChunkText1);
    });

    it('should handle missing R2 chunk text gracefully during hydration', async () => {
      // Mock successful embedding and vector search
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      const mockVectorizeResults = {
        matches: [
          {
            id: 'chunk-1',
            score: 0.95,
            metadata: { projectId: projectId, chunkId: 'chunk-1' }
          }
        ],
        count: 1
      };
      
      mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

      // Mock successful KV response
      const mockChunkMeta1: CodeChunk = {
        id: 'chunk-1',
        projectId: projectId,
        filePath: 'src/auth.js',
        r2ChunkPath: 'projects/test-project-123/chunks/chunk-1.txt',
        startLine: 10,
        endLine: 25
      };

      (mockEnv.METADATA_KV.get as any)
        .mockResolvedValueOnce(JSON.stringify(mockChunkMeta1));

      // Mock missing R2 object
      (mockEnv.CODE_UPLOADS_BUCKET.get as any)
        .mockResolvedValueOnce(null);

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig,
        10
      );

      // Should return empty results due to failed hydration
      expect(result.error).toBeUndefined();
      expect(result.results).toHaveLength(0);
    });

    it('should handle hydration errors gracefully and continue with other results', async () => {
      // Mock successful embedding and vector search
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      const mockVectorizeResults = {
        matches: [
          {
            id: 'chunk-1',
            score: 0.95,
            metadata: { projectId: projectId, chunkId: 'chunk-1' }
          },
          {
            id: 'chunk-2',
            score: 0.87,
            metadata: { projectId: projectId, chunkId: 'chunk-2' }
          }
        ],
        count: 2
      };
      
      mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

      // Mock KV responses - first throws error, second succeeds
      const mockChunkMeta2: CodeChunk = {
        id: 'chunk-2',
        projectId: projectId,
        filePath: 'src/login.js',
        r2ChunkPath: 'projects/test-project-123/chunks/chunk-2.txt',
        startLine: 25,
        endLine: 40
      };

      (mockEnv.METADATA_KV.get as any)
        .mockRejectedValueOnce(new Error('KV error'))
        .mockResolvedValueOnce(JSON.stringify(mockChunkMeta2));

      // Mock R2 response for the successful chunk
      const mockChunkText2 = 'function handleLogin() { /* code */ }';
      (mockEnv.CODE_UPLOADS_BUCKET.get as any)
        .mockResolvedValueOnce({ text: () => Promise.resolve(mockChunkText2) });

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig,
        10
      );

      // Should only return the successfully hydrated result
      expect(result.error).toBeUndefined();
      expect(result.results).toHaveLength(1);
      expect(result.results![0].chunk_id).toBe('chunk-2');
      expect(result.results![0].text_snippet).toBe(mockChunkText2);
    });

    it('should successfully perform vector search with valid inputs', async () => {
      // Mock successful embedding generation
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002',
        usage: { prompt_tokens: 10, total_tokens: 10 }
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      // Mock successful Vectorize query
      const mockVectorizeResults = {
        matches: [
          {
            id: 'chunk-1',
            score: 0.95,
            metadata: {
              projectId: projectId,
              chunkId: 'chunk-1',
              originalFilePath: 'src/auth.js',
              startLine: 10
            }
          }
        ],
        count: 1
      };
      
      mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

      // Mock hydration data
      const mockChunkMeta: CodeChunk = {
        id: 'chunk-1',
        projectId: projectId,
        filePath: 'src/auth.js',
        r2ChunkPath: 'projects/test-project-123/chunks/chunk-1.txt',
        startLine: 10,
        endLine: 25
      };

      (mockEnv.METADATA_KV.get as any)
        .mockResolvedValueOnce(JSON.stringify(mockChunkMeta));

      const mockChunkText = 'function authenticateUser() { /* code */ }';
      (mockEnv.CODE_UPLOADS_BUCKET.get as any)
        .mockResolvedValueOnce({ text: () => Promise.resolve(mockChunkText) });

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig,
        10
      );

      // Verify the result
      expect(result.error).toBeUndefined();
      expect(result.results).toHaveLength(1);
      expect(result.results?.[0]).toEqual({
        chunk_id: 'chunk-1',
        original_file_path: 'src/auth.js',
        start_line: 10,
        end_line: 25,
        score: 0.95,
        text_snippet: mockChunkText,
        metadata: mockVectorizeResults.matches[0].metadata
      });
      expect(result.timings.queryEmbeddingMs).toBeGreaterThanOrEqual(0);
      expect(result.timings.vectorSearchMs).toBeGreaterThanOrEqual(0);
      expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);

      // Verify function calls
      expect(mockGetEmbeddingsViaProxy).toHaveBeenCalledWith(
        fetch,
        'openai_embedding',
        userApiKey,
        { input: queryText, model: 'text-embedding-ada-002' },
        'http://localhost:8787/api/proxy/external'
      );
      
      expect(mockQueryVectorsForProject).toHaveBeenCalledWith(
        mockEnv.VECTORIZE_INDEX,
        [0.1, 0.2, 0.3],
        projectId,
        10
      );
    });

    it('should handle embedding generation errors', async () => {
      // Mock embedding error
      const mockErrorResponse = {
        error: {
          status: 401,
          message: 'Invalid API key',
          data: { code: 'invalid_api_key' }
        }
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockErrorResponse);
      mockIsEmbeddingError.mockReturnValue(true);

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig
      );

      // Verify error handling
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('EMBEDDING_GENERATION_FAILED');
      expect(result.error!.message).toContain('Failed to generate query embedding');
      expect(result.results).toBeUndefined();
      expect(result.timings.queryEmbeddingMs).toBeGreaterThanOrEqual(0);
      expect(result.timings.vectorSearchMs).toBe(0);
    });

    it('should handle empty embedding response', async () => {
      // Mock empty embedding response
      const mockEmptyResponse = {
        data: [],
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmptyResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig
      );

      // Verify error handling
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('EMPTY_EMBEDDING_RESPONSE');
      expect(result.error!.message).toBe('Empty embedding response from external service');
    });

    it('should handle invalid embedding data structure', async () => {
      // Mock response with missing embedding
      const mockInvalidResponse = {
        data: [{ index: 0 }], // Missing embedding field
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockInvalidResponse as any);
      mockIsEmbeddingError.mockReturnValue(false);

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig
      );

      // Verify error handling
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('INVALID_EMBEDDING_DATA');
      expect(result.error!.message).toBe('Invalid embedding data structure from external service');
    });

    it('should handle Vectorize query errors', async () => {
      // Mock successful embedding generation
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      // Mock Vectorize error
      const vectorizeError = new Error('Vectorize index not found');
      mockQueryVectorsForProject.mockRejectedValue(vectorizeError);

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig
      );

      // Verify error handling
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('VECTORIZE_QUERY_FAILED');
      expect(result.error!.message).toContain('Vector search failed');
      expect(result.timings.queryEmbeddingMs).toBeGreaterThanOrEqual(0);
      expect(result.timings.vectorSearchMs).toBeGreaterThanOrEqual(0);
    });

    it('should use default proxy URL when not provided in environment', async () => {
      // Remove proxy URL from environment
      delete mockEnv.PROXY_WORKER_URL;

      // Mock successful embedding generation
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      // Mock successful Vectorize query
      mockQueryVectorsForProject.mockResolvedValue({ matches: [], count: 0 });

      // Execute the function
      await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig
      );

      // Verify default proxy URL is used
      expect(mockGetEmbeddingsViaProxy).toHaveBeenCalledWith(
        fetch,
        'openai_embedding',
        userApiKey,
        { input: queryText, model: 'text-embedding-ada-002' },
        '/api/proxy/external'
      );
    });

    it('should handle embedding config without model name', async () => {
      const configWithoutModel: EmbeddingModelConfig = {
        service: 'jina_embedding'
      };

      // Mock successful embedding generation
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'jina-embeddings-v2-base-en'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);
      mockQueryVectorsForProject.mockResolvedValue({ matches: [], count: 0 });

      // Execute the function
      await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        configWithoutModel
      );

      // Verify payload doesn't include model field
      expect(mockGetEmbeddingsViaProxy).toHaveBeenCalledWith(
        fetch,
        'jina_embedding',
        userApiKey,
        { input: queryText },
        mockEnv.PROXY_WORKER_URL
      );
    });

    it('should handle results with missing metadata gracefully', async () => {
      // Mock successful embedding generation
      const mockEmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-ada-002'
      };
      
      mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
      mockIsEmbeddingError.mockReturnValue(false);

      // Mock Vectorize results with missing metadata
      const mockVectorizeResults = {
        matches: [
          {
            id: 'chunk-1',
            score: 0.95
            // metadata is omitted to simulate missing metadata
          }
        ],
        count: 1
      } as any; // Type assertion to bypass strict typing for test
      
      mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

      // Execute the function
      const result = await performVectorSearch(
        mockEnv,
        projectId,
        queryText,
        userApiKey,
        embeddingConfig
      );

      // Verify graceful handling of missing metadata
      expect(result.error).toBeUndefined();
      expect(result.results).toHaveLength(1);
      expect(result.results![0]).toEqual({
        chunk_id: 'chunk-1',
        original_file_path: 'unknown',
        start_line: 0,
        score: 0.95,
        metadata: undefined
      });
    });
  });
}); 