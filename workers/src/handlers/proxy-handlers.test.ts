/**
 * Unit tests for proxy handlers
 * Tests RFC-SEC-001, P0-E1-S2: Secure External API Proxy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Context } from 'hono';
import { proxyExternalApiHandler } from './proxy-handlers.js';

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// Mock console methods
(globalThis as any).console = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn()
};

// Helper to create mock Hono context
function createMockContext(requestBody: any): Context {
  return {
    req: {
      json: vi.fn().mockResolvedValue(requestBody)
    },
    get: vi.fn().mockReturnValue('test-request-id')
  } as any;
}

interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

describe('proxyExternalApiHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should reject invalid request body', async () => {
      const invalidBody = {
        target_service: 'invalid_service',
        api_key: '',
        payload: {}
      };

      const mockContext = createMockContext(invalidBody);
      const response = await proxyExternalApiHandler(mockContext);

      expect(response).toBeInstanceOf(Response);
      const responseData = await response.json() as ErrorResponse;
      expect(responseData.error).toBe('ValidationError');
      expect(response.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const invalidBody = {
        target_service: 'openai_chat'
        // missing api_key and payload
      };

      const mockContext = createMockContext(invalidBody);
      const response = await proxyExternalApiHandler(mockContext);

      expect(response).toBeInstanceOf(Response);
      const responseData = await response.json() as ErrorResponse;
      expect(responseData.error).toBe('ValidationError');
      expect(response.status).toBe(400);
    });

    it('should accept valid request body', async () => {
      const validBody = {
        target_service: 'openai_chat',
        api_key: 'sk-test123',
        payload: {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      };

      // Mock successful external API response
      const mockExternalResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello there!' } }]
        })
      };
      mockFetch.mockResolvedValue(mockExternalResponse);

      const mockContext = createMockContext(validBody);
      const response = await proxyExternalApiHandler(mockContext);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });
  });

  describe('External Service Routing', () => {
    it('should route OpenAI chat request correctly', async () => {
      const requestBody = {
        target_service: 'openai_chat',
        api_key: 'sk-test123',
        payload: {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      };

      const mockExternalResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ choices: [] })
      };
      mockFetch.mockResolvedValue(mockExternalResponse);

      const mockContext = createMockContext(requestBody);
      await proxyExternalApiHandler(mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test123',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(requestBody.payload)
        })
      );
    });

    it('should route Anthropic request correctly', async () => {
      const requestBody = {
        target_service: 'anthropic_claude',
        api_key: 'ant-test123',
        payload: {
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      };

      const mockExternalResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ content: [] })
      };
      mockFetch.mockResolvedValue(mockExternalResponse);

      const mockContext = createMockContext(requestBody);
      await proxyExternalApiHandler(mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'ant-test123',
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          }),
          body: JSON.stringify(requestBody.payload)
        })
      );
    });

    it('should route embedding request correctly', async () => {
      const requestBody = {
        target_service: 'openai_embedding',
        api_key: 'sk-test123',
        payload: {
          model: 'text-embedding-ada-002',
          input: 'Test text'
        }
      };

      const mockExternalResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] })
      };
      mockFetch.mockResolvedValue(mockExternalResponse);

      const mockContext = createMockContext(requestBody);
      await proxyExternalApiHandler(mockContext);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test123',
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle external service authentication errors', async () => {
      const requestBody = {
        target_service: 'openai_chat',
        api_key: 'invalid-key',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      };

      const mockExternalResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({
          error: { message: 'Invalid API key' }
        })
      };
      mockFetch.mockResolvedValue(mockExternalResponse);

      const mockContext = createMockContext(requestBody);
      const response = await proxyExternalApiHandler(mockContext);

      expect(response.status).toBe(401);
      const responseData = await response.json() as ErrorResponse;
      expect(responseData.error).toBe('ExternalServiceError');
    });

    it('should handle external service rate limits', async () => {
      const requestBody = {
        target_service: 'openai_chat',
        api_key: 'sk-test123',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      };

      const mockExternalResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({
          error: { message: 'Rate limit exceeded' }
        })
      };
      mockFetch.mockResolvedValue(mockExternalResponse);

      const mockContext = createMockContext(requestBody);
      const response = await proxyExternalApiHandler(mockContext);

      expect(response.status).toBe(429);
      const responseData = await response.json() as ErrorResponse;
      expect(responseData.error).toBe('ExternalServiceError');
    });

    it('should handle network errors', async () => {
      const requestBody = {
        target_service: 'openai_chat',
        api_key: 'sk-test123',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      };

      mockFetch.mockRejectedValue(new Error('Network error'));

      const mockContext = createMockContext(requestBody);
      const response = await proxyExternalApiHandler(mockContext);

      expect(response.status).toBe(502);
      const responseData = await response.json() as ErrorResponse;
      expect(responseData.error).toBe('ExternalServiceError');
    });
  });

  describe('Security', () => {
    it('should not log API keys', async () => {
      const requestBody = {
        target_service: 'openai_chat',
        api_key: 'sk-secret123',
        payload: { model: 'gpt-3.5-turbo', messages: [] }
      };

      const mockExternalResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ choices: [] })
      };
      mockFetch.mockResolvedValue(mockExternalResponse);

      const mockContext = createMockContext(requestBody);
      await proxyExternalApiHandler(mockContext);

      // Check that console.info was called but didn't include the API key
      const mockConsole = (globalThis as any).console;
      expect(mockConsole.info).toHaveBeenCalled();
      const logCalls = mockConsole.info.mock.calls;
      logCalls.forEach((call: any[]) => {
        const logMessage = JSON.stringify(call);
        expect(logMessage).not.toContain('sk-secret123');
      });
    });

    it('should reject unsupported services', async () => {
      const requestBody = {
        target_service: 'malicious_service',
        api_key: 'test123',
        payload: {}
      };

      const mockContext = createMockContext(requestBody);
      const response = await proxyExternalApiHandler(mockContext);

      expect(response.status).toBe(400);
      const responseData = await response.json() as ErrorResponse;
      expect(responseData.error).toBe('ValidationError');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});