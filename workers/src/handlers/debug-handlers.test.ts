/**
 * Unit tests for debug handlers
 * Tests RFC-API-001 echo endpoint implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env, ApiResponse } from '../types.js';
import { echoHandler } from './debug-handlers.js';
import { requestIdMiddleware } from '../lib/error-handler.js';

// Mock environment for testing
const mockEnv: Env = {
  ENVIRONMENT: 'test',
  CODE_UPLOADS_BUCKET: {} as R2Bucket
};

describe('Debug Handlers', () => {
  let app: Hono<{ Bindings: Env; Variables: { requestId: string } }>;

  beforeEach(() => {
    app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();
    app.use('*', requestIdMiddleware());
    app.post('/api/echo', echoHandler);
  });

  describe('POST /api/echo', () => {
    it('should echo back a simple JSON object', async () => {
      const testPayload = { message: 'Hello, World!', timestamp: '2023-10-27T10:00:00Z' };

      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(testPayload);
      expect(body.requestId).toBeDefined();
    });

    it('should echo back a complex nested JSON object', async () => {
      const testPayload = {
        user: {
          id: 123,
          name: 'Test User',
          preferences: {
            theme: 'dark',
            notifications: true,
            features: ['feature1', 'feature2']
          }
        },
        metadata: {
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      };

      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(testPayload);
    });

    it('should echo back an array', async () => {
      const testPayload = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ];

      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(testPayload);
    });

    it('should echo back primitive values', async () => {
      const testCases = [
        'simple string',
        42,
        true,
        null
      ];

      for (const testPayload of testCases) {
        const req = new Request('http://localhost:8787/api/echo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload)
        });

        const res = await app.fetch(req, mockEnv);
        const body = await res.json() as ApiResponse;

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(testPayload);
      }
    });

    it('should handle empty object', async () => {
      const testPayload = {};

      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(testPayload);
    });

    it('should return error for invalid JSON', async () => {
      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"message": "unterminated string'
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error!.error).toBe('InvalidInput');
      expect(body.error!.message).toBe('Invalid JSON payload or processing error');
      expect(body.error!.requestId).toBeDefined();
    });

    it('should return error for empty body', async () => {
      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error!.error).toBe('InvalidInput');
    });

    it('should return error for non-JSON content type', async () => {
      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'plain text body'
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should include requestId in successful response', async () => {
      const testPayload = { test: 'data' };

      const req = new Request('http://localhost:8787/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      const res = await app.fetch(req, mockEnv);
      const body = await res.json() as ApiResponse;

      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
      expect(body.requestId!.length).toBeGreaterThan(0);
    });
  });
});