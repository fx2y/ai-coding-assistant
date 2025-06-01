/**
 * Unit tests for Search Handlers
 * Tests RFC-RET-001: Basic Vector Search Retrieval API (P1-E3-S1)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../types.js';
import { handleVectorQuery } from './searchHandlers.js';
import * as retrievalService from '../services/retrievalService.js';

// Mock the retrieval service
vi.mock('../services/retrievalService.js');
const mockPerformVectorSearch = vi.mocked(retrievalService.performVectorSearch);

describe('searchHandlers', () => {
  let app: Hono<{ Bindings: Env; Variables: { requestId: string } }>;
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    
    app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'test-request-123');
      await next();
    });
    app.post('/api/search/vector_query', handleVectorQuery);

    mockEnv = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: {} as R2Bucket,
      METADATA_KV: {} as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex
    };
  });

  describe('handleVectorQuery', () => {
    const validRequestBody = {
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      query_text: 'function to handle user authentication',
      user_api_keys: {
        embeddingKey: 'test-embedding-key'
      },
      embedding_model_config: {
        service: 'openai_embedding',
        modelName: 'text-embedding-ada-002'
      },
      top_k: 5
    };

    it('should successfully handle valid vector query request', async () => {
      // Mock successful service response
      const mockServiceResult = {
        results: [
          {
            chunk_id: 'chunk-1',
            original_file_path: 'src/auth.js',
            start_line: 10,
            score: 0.95,
            metadata: { projectId: validRequestBody.project_id }
          }
        ],
        timings: {
          queryEmbeddingMs: 150,
          vectorSearchMs: 25,
          totalMs: 175
        }
      };

      mockPerformVectorSearch.mockResolvedValue(mockServiceResult);

      // Make request
      const response = await app.request('/api/search/vector_query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody)
      }, mockEnv);

      // Verify response
      expect(response.status).toBe(200);
      
      const responseData = await response.json() as any;
      expect(responseData).toEqual({
        results: mockServiceResult.results,
        query_embedding_time_ms: 150,
        vector_search_time_ms: 25,
        total_time_ms: 175,
        context: expect.objectContaining({
          context_string: expect.any(String),
          included_sources: expect.any(Array),
          total_characters: expect.any(Number)
        })
      });

      // Verify service was called correctly
      expect(mockPerformVectorSearch).toHaveBeenCalledWith(
        mockEnv,
        validRequestBody.project_id,
        validRequestBody.query_text,
        validRequestBody.user_api_keys.embeddingKey,
        validRequestBody.embedding_model_config,
        validRequestBody.top_k
      );
    });

    it('should return 400 for invalid request body', async () => {
      const invalidRequestBody = {
        project_id: 'invalid-uuid',
        query_text: '',
        user_api_keys: {
          embeddingKey: ''
        },
        embedding_model_config: {
          service: 'invalid_service'
        }
      };

      const response = await app.request('/api/search/vector_query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidRequestBody)
      }, mockEnv);

      expect(response.status).toBe(400);
      
      const responseData = await response.json() as any;
      expect(responseData.error).toBe('ValidationError');
      expect(responseData.message).toBe('Invalid request body');
      expect(responseData.details).toBeDefined();
      expect(responseData.requestId).toBe('test-request-123');
    });

    it('should return 502 for embedding generation failures', async () => {
      const mockServiceError = {
        error: {
          code: 'EMBEDDING_GENERATION_FAILED',
          message: 'Failed to generate query embedding: Invalid API key',
          details: { status: 401 }
        },
        timings: {
          queryEmbeddingMs: 50,
          vectorSearchMs: 0,
          totalMs: 50
        }
      };

      mockPerformVectorSearch.mockResolvedValue(mockServiceError);

      const response = await app.request('/api/search/vector_query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequestBody)
      }, mockEnv);

      expect(response.status).toBe(502);
      
      const responseData = await response.json() as any;
      expect(responseData.error).toBe('EMBEDDING_GENERATION_FAILED');
      expect(responseData.message).toContain('Failed to generate query embedding');
      expect(responseData.timings).toEqual(mockServiceError.timings);
      expect(responseData.requestId).toBe('test-request-123');
    });
  });
}); 