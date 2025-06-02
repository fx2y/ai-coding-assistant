/**
 * Unit tests for BYOK Proxy Client
 * Tests embedding generation via external API proxy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getEmbeddingsViaProxy,
  getBatchEmbeddingsViaProxy,
  isEmbeddingError,
  type EmbeddingRequestPayload,
  type EmbeddingResponse,
  type ProxyErrorResponse
} from './byokProxyClient.js';

// Mock fetch function
const mockFetch = vi.fn();

describe('BYOK Proxy Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEmbeddingsViaProxy', () => {
    it('should successfully get embeddings from proxy', async () => {
      const mockResponse: EmbeddingResponse = {
        data: [
          { embedding: [0.1, 0.2, 0.3], index: 0 }
        ],
        model: 'text-embedding-ada-002',
        usage: { prompt_tokens: 10, total_tokens: 10 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const payload: EmbeddingRequestPayload = {
        input: 'test text',
        model: 'text-embedding-ada-002'
      };

      const result = await getEmbeddingsViaProxy(
        mockFetch,
        'openai_embedding',
        'test-api-key',
        payload,
        'http://localhost:8787/api/proxy/external'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/proxy/external',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_service: 'openai_embedding',
            api_key: 'test-api-key',
            payload: payload
          })
        }
      );

      expect(result).toEqual(mockResponse);
      expect(isEmbeddingError(result)).toBe(false);
    });

    it('should handle proxy error responses', async () => {
      const errorResponse = {
        error: { message: 'Invalid API key' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve(errorResponse)
      });

      const payload: EmbeddingRequestPayload = {
        input: 'test text'
      };

      const result = await getEmbeddingsViaProxy(
        mockFetch,
        'openai_embedding',
        'invalid-key',
        payload,
        'http://localhost:8787/api/proxy/external'
      );

      expect(isEmbeddingError(result)).toBe(true);
      if (isEmbeddingError(result)) {
        expect(result.error.status).toBe(401);
        expect(result.error.message).toContain('Proxy request failed');
      }
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const payload: EmbeddingRequestPayload = {
        input: 'test text'
      };

      const result = await getEmbeddingsViaProxy(
        mockFetch,
        'openai_embedding',
        'test-api-key',
        payload,
        'http://localhost:8787/api/proxy/external'
      );

      expect(isEmbeddingError(result)).toBe(true);
      if (isEmbeddingError(result)) {
        expect(result.error.message).toContain('Network error');
      }
    });

    it('should handle batch input', async () => {
      const mockResponse: EmbeddingResponse = {
        data: [
          { embedding: [0.1, 0.2, 0.3], index: 0 },
          { embedding: [0.4, 0.5, 0.6], index: 1 }
        ],
        model: 'text-embedding-ada-002',
        usage: { prompt_tokens: 20, total_tokens: 20 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const payload: EmbeddingRequestPayload = {
        input: ['text 1', 'text 2'],
        model: 'text-embedding-ada-002'
      };

      const result = await getEmbeddingsViaProxy(
        mockFetch,
        'openai_embedding',
        'test-api-key',
        payload,
        'http://localhost:8787/api/proxy/external'
      );

      expect(result).toEqual(mockResponse);
      expect(isEmbeddingError(result)).toBe(false);
    });
  });

  describe('getBatchEmbeddingsViaProxy', () => {
    it('should process texts in batches', async () => {
      const mockResponse: EmbeddingResponse = {
        data: [
          { embedding: [0.1, 0.2, 0.3], index: 0 },
          { embedding: [0.4, 0.5, 0.6], index: 1 }
        ],
        model: 'text-embedding-ada-002',
        usage: { prompt_tokens: 20, total_tokens: 20 }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const texts = ['text 1', 'text 2', 'text 3', 'text 4'];
      const result = await getBatchEmbeddingsViaProxy(
        mockFetch,
        'openai_embedding',
        'test-api-key',
        texts,
        'text-embedding-ada-002',
        'http://localhost:8787/api/proxy/external',
        2 // batch size of 2
      );

      expect(mockFetch).toHaveBeenCalledTimes(2); // 4 texts / 2 batch size = 2 calls
      expect(result.embeddings).toHaveLength(4);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle batch errors gracefully', async () => {
      // First batch succeeds, second batch fails
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [
              { embedding: [0.1, 0.2, 0.3], index: 0 },
              { embedding: [0.4, 0.5, 0.6], index: 1 }
            ],
            model: 'text-embedding-ada-002'
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } })
        });

      const texts = ['text 1', 'text 2', 'text 3', 'text 4'];
      const result = await getBatchEmbeddingsViaProxy(
        mockFetch,
        'openai_embedding',
        'test-api-key',
        texts,
        'text-embedding-ada-002',
        'http://localhost:8787/api/proxy/external',
        2
      );

      expect(result.embeddings).toHaveLength(4);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.embeddings[1]).toEqual([0.4, 0.5, 0.6]);
      expect(result.embeddings[2]).toEqual([]); // Empty for failed batch
      expect(result.embeddings[3]).toEqual([]); // Empty for failed batch
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Batch 2 failed');
    });
  });

  describe('isEmbeddingError', () => {
    it('should correctly identify error responses', () => {
      const errorResponse: ProxyErrorResponse = {
        error: { message: 'Test error' }
      };

      const successResponse: EmbeddingResponse = {
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        model: 'test-model'
      };

      expect(isEmbeddingError(errorResponse)).toBe(true);
      expect(isEmbeddingError(successResponse)).toBe(false);
    });
  });
});