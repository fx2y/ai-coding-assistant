/**
 * Unit tests for Retrieval Service Hydration (P1-E3-S2)
 * Tests the result hydration functionality specifically
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

describe('retrievalService - Hydration (P1-E3-S2)', () => {
  const projectId = 'test-project-123';
  const queryText = 'function to handle user authentication';
  const userApiKey = 'test-api-key';
  const embeddingConfig: EmbeddingModelConfig = {
    service: 'openai_embedding',
    modelName: 'text-embedding-ada-002'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully hydrate search results with chunk text from R2', async () => {
    // Setup mocks for successful embedding and vector search
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
          metadata: {
            projectId: projectId,
            chunkId: 'chunk-1',
            originalFilePath: 'src/auth.js',
            startLine: 10,
            language: 'javascript'
          }
        }
      ],
      count: 1
    };
    
    mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

    // Setup mock environment with proper hydration data
    const mockChunkMeta: CodeChunk = {
      id: 'chunk-1',
      projectId: projectId,
      filePath: 'src/auth.js',
      r2ChunkPath: 'projects/test-project-123/chunks/chunk-1.txt',
      startLine: 10,
      endLine: 25
    };

    const mockChunkText = 'function authenticateUser(username, password) {\n  return validateCredentials(username, password);\n}';

    const mockKVGet = vi.fn().mockResolvedValue(JSON.stringify(mockChunkMeta));
    const mockR2Get = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(mockChunkText)
    });

    const mockEnv: Env = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: { get: mockR2Get } as unknown as R2Bucket,
      METADATA_KV: { get: mockKVGet } as unknown as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex,
      PROXY_WORKER_URL: 'http://localhost:8787/api/proxy/external'
    };

    // Execute the function
    const result = await performVectorSearch(
      mockEnv,
      projectId,
      queryText,
      userApiKey,
      embeddingConfig,
      10
    );

    // Verify hydrated results
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(1);
    
    const hydratedResult = result.results![0]!;
    expect(hydratedResult).toEqual({
      chunk_id: 'chunk-1',
      original_file_path: 'src/auth.js',
      start_line: 10,
      end_line: 25,
      score: 0.95,
      text_snippet: mockChunkText,
      language: 'javascript',
      metadata: mockVectorizeResults.matches[0]!.metadata
    });

    // Verify hydration calls
    expect(mockKVGet).toHaveBeenCalledWith(`project:${projectId}:chunk:chunk-1`);
    expect(mockR2Get).toHaveBeenCalledWith(mockChunkMeta.r2ChunkPath);
  });

  it('should handle missing chunk metadata gracefully', async () => {
    // Setup successful embedding and vector search
    const mockEmbeddingResponse = {
      data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
      model: 'text-embedding-ada-002'
    };
    
    mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
    mockIsEmbeddingError.mockReturnValue(false);

    const mockVectorizeResults = {
      matches: [
        {
          id: 'chunk-missing',
          score: 0.95,
          metadata: { projectId: projectId, chunkId: 'chunk-missing' }
        }
      ],
      count: 1
    };
    
    mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

    // Mock missing KV metadata
    const mockKVGet = vi.fn().mockResolvedValue(null);
    const mockR2Get = vi.fn();

    const mockEnv: Env = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: { get: mockR2Get } as unknown as R2Bucket,
      METADATA_KV: { get: mockKVGet } as unknown as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex,
      PROXY_WORKER_URL: 'http://localhost:8787/api/proxy/external'
    };

    // Execute the function
    const result = await performVectorSearch(
      mockEnv,
      projectId,
      queryText,
      userApiKey,
      embeddingConfig,
      10
    );

    // Should return empty results due to missing metadata
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(0);
    
    // Verify KV was called but R2 was not
    expect(mockKVGet).toHaveBeenCalledWith(`project:${projectId}:chunk:chunk-missing`);
    expect(mockR2Get).not.toHaveBeenCalled();
  });

  it('should handle missing R2 chunk text gracefully', async () => {
    // Setup successful embedding and vector search
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

    // Mock successful KV but missing R2
    const mockChunkMeta: CodeChunk = {
      id: 'chunk-1',
      projectId: projectId,
      filePath: 'src/auth.js',
      r2ChunkPath: 'projects/test-project-123/chunks/chunk-1.txt',
      startLine: 10,
      endLine: 25
    };

    const mockKVGet = vi.fn().mockResolvedValue(JSON.stringify(mockChunkMeta));
    const mockR2Get = vi.fn().mockResolvedValue(null); // Missing R2 object

    const mockEnv: Env = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: { get: mockR2Get } as unknown as R2Bucket,
      METADATA_KV: { get: mockKVGet } as unknown as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex,
      PROXY_WORKER_URL: 'http://localhost:8787/api/proxy/external'
    };

    // Execute the function
    const result = await performVectorSearch(
      mockEnv,
      projectId,
      queryText,
      userApiKey,
      embeddingConfig,
      10
    );

    // Should return empty results due to missing R2 text
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(0);
    
    // Verify both KV and R2 were called
    expect(mockKVGet).toHaveBeenCalledWith(`project:${projectId}:chunk:chunk-1`);
    expect(mockR2Get).toHaveBeenCalledWith(mockChunkMeta.r2ChunkPath);
  });

  it('should process multiple results with partial hydration failures', async () => {
    // Setup successful embedding and vector search
    const mockEmbeddingResponse = {
      data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
      model: 'text-embedding-ada-002'
    };
    
    mockGetEmbeddingsViaProxy.mockResolvedValue(mockEmbeddingResponse);
    mockIsEmbeddingError.mockReturnValue(false);

    const mockVectorizeResults = {
      matches: [
        {
          id: 'chunk-success',
          score: 0.95,
          metadata: { projectId: projectId, chunkId: 'chunk-success', language: 'typescript' }
        },
        {
          id: 'chunk-fail',
          score: 0.87,
          metadata: { projectId: projectId, chunkId: 'chunk-fail' }
        }
      ],
      count: 2
    };
    
    mockQueryVectorsForProject.mockResolvedValue(mockVectorizeResults);

    // Mock successful hydration for first chunk, failure for second
    const mockChunkMeta1: CodeChunk = {
      id: 'chunk-success',
      projectId: projectId,
      filePath: 'src/utils.ts',
      r2ChunkPath: 'projects/test-project-123/chunks/chunk-success.txt',
      startLine: 5,
      endLine: 20
    };

    const mockChunkText1 = 'export function utilityFunction() {\n  return "success";\n}';

    const mockKVGet = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(mockChunkMeta1))
      .mockResolvedValueOnce(null); // Second chunk metadata missing

    const mockR2Get = vi.fn()
      .mockResolvedValueOnce({ text: () => Promise.resolve(mockChunkText1) });

    const mockEnv: Env = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: { get: mockR2Get } as unknown as R2Bucket,
      METADATA_KV: { get: mockKVGet } as unknown as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex,
      PROXY_WORKER_URL: 'http://localhost:8787/api/proxy/external'
    };

    // Execute the function
    const result = await performVectorSearch(
      mockEnv,
      projectId,
      queryText,
      userApiKey,
      embeddingConfig,
      10
    );

    // Should return only the successfully hydrated result
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(1);
    
    const hydratedResult = result.results![0]!;
    expect(hydratedResult.chunk_id).toBe('chunk-success');
    expect(hydratedResult.text_snippet).toBe(mockChunkText1);
    expect(hydratedResult.language).toBe('typescript');
    
    // Verify both chunks were attempted
    expect(mockKVGet).toHaveBeenCalledTimes(2);
    expect(mockR2Get).toHaveBeenCalledTimes(1);
  });
}); 