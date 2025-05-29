/**
 * Tests for External API Service
 * Tests RFC-SEC-001 client-side integration with P0-E1-S2 proxy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callExternalApi, callOpenAIChat, checkProxyHealth, getSupportedServices } from './externalApiService.js';
import * as apiKeyService from './apiKeyService.js';

// Mock the API key service
vi.mock('./apiKeyService.js', () => ({
  getApiKeys: vi.fn()
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('externalApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock return for API keys
    vi.mocked(apiKeyService.getApiKeys).mockReturnValue({
      llmKey: 'sk-test-llm-key',
      embeddingKey: 'sk-test-embedding-key'
    });
  });

  describe('callExternalApi', () => {
    it('should use LLM key for chat services', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { choices: [{ message: { content: 'Hello!' } }] },
          requestId: 'req-123'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await callExternalApi({
        target_service: 'openai_chat',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/proxy/external',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_service: 'openai_chat',
            api_key: 'sk-test-llm-key',
            payload: { model: 'gpt-3.5-turbo', messages: [] }
          })
        })
      );
    });

    it('should use embedding key for embedding services', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { data: [{ embedding: [0.1, 0.2] }] },
          requestId: 'req-124'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await callExternalApi({
        target_service: 'openai_embedding',
        payload: { model: 'text-embedding-ada-002', input: 'test' }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/proxy/external',
        expect.objectContaining({
          body: JSON.stringify({
            target_service: 'openai_embedding',
            api_key: 'sk-test-embedding-key',
            payload: { model: 'text-embedding-ada-002', input: 'test' }
          })
        })
      );
    });

    it('should handle missing API keys gracefully', async () => {
      vi.mocked(apiKeyService.getApiKeys).mockReturnValue({
        llmKey: null,
        embeddingKey: null
      });

      const result = await callExternalApi({
        target_service: 'openai_chat',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_API_KEY');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle proxy errors correctly', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          error: 'ExternalServiceError',
          message: 'Invalid API key',
          requestId: 'req-125'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callExternalApi({
        target_service: 'openai_chat',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      });

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe('ExternalServiceError');
      expect(result.requestId).toBe('req-125');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network connection failed'));

      const result = await callExternalApi({
        target_service: 'openai_chat',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.details).toBe('Network connection failed');
    });
  });

  describe('callOpenAIChat', () => {
    it('should format OpenAI chat request correctly', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { choices: [{ message: { content: 'Hello!' } }] }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Hello' }];
      await callOpenAIChat(messages, 'gpt-4', { temperature: 0.7 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/proxy/external',
        expect.objectContaining({
          body: JSON.stringify({
            target_service: 'openai_chat',
            api_key: 'sk-test-llm-key',
            payload: {
              model: 'gpt-4',
              messages,
              temperature: 0.7
            }
          })
        })
      );
    });
  });

  describe('getSupportedServices', () => {
    it('should fetch supported services from proxy', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            services: ['openai_chat', 'openai_embedding'],
            count: 2
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await getSupportedServices();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/api/proxy/services');
      expect(result.success).toBe(true);
      expect(result.data?.services).toEqual(['openai_chat', 'openai_embedding']);
    });

    it('should handle service list fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      const result = await getSupportedServices();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });
  });

  describe('checkProxyHealth', () => {
    it('should check proxy health status', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            status: 'healthy',
            timestamp: '2024-01-15T10:00:00Z'
          }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await checkProxyHealth();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/api/proxy/health');
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('healthy');
    });

    it('should handle proxy health check failures', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await checkProxyHealth();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });
  });
}); 