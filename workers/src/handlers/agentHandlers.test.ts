/**
 * Unit tests for Agent Handlers - Tool Execution
 * Tests RFC-AGT-002: Tool Definition & Execution Framework
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleToolExecution } from './agentHandlers.js';
import type { Context } from 'hono';
import type { Env } from '../types.js';
import * as toolExecutor from '../services/toolExecutor.js';

// Mock the tool executor
vi.mock('../services/toolExecutor.js');

describe('Agent Handlers - Tool Execution', () => {
  let mockContext: Partial<Context<{ Bindings: Env }>>;
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: {} as R2Bucket,
      METADATA_KV: {} as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex
    };

    mockContext = {
      env: mockEnv,
      req: {
        json: vi.fn()
      } as any,
      json: vi.fn().mockReturnValue(new Response())
    };
  });

  describe('handleToolExecution', () => {
    it('should successfully execute code_search tool', async () => {
      const mockRequest = {
        project_id: '123e4567-e89b-12d3-a456-426614174000',
        session_id: '123e4567-e89b-12d3-a456-426614174001',
        tool_name: 'code_search',
        tool_args: { query: 'authentication functions' },
        user_api_keys: {
          embeddingKey: 'test-embedding-key'
        },
        embedding_model_config: {
          service: 'openai_embedding' as const,
          modelName: 'text-embedding-ada-002'
        }
      };

      const mockToolResult = {
        observation: 'Found 3 code snippets for query: "authentication functions"',
        isError: false
      };

      vi.mocked(mockContext.req!.json).mockResolvedValue(mockRequest);
      vi.mocked(toolExecutor.executeToolByName).mockResolvedValue(mockToolResult);

      await handleToolExecution(mockContext as Context<{ Bindings: Env }>);

      expect(toolExecutor.executeToolByName).toHaveBeenCalledWith(
        expect.objectContaining({
          env: mockEnv,
          projectId: mockRequest.project_id,
          userApiKeys: {
            embeddingKey: 'test-embedding-key'
          },
          embeddingModelConfig: mockRequest.embedding_model_config
        }),
        'code_search',
        { query: 'authentication functions' }
      );

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: mockRequest.session_id,
          tool_name: 'code_search',
          observation: 'Found 3 code snippets for query: "authentication functions"',
          is_error: false,
          execution_time_ms: expect.any(Number)
        }),
        200
      );
    });

    it('should successfully execute read_file tool', async () => {
      const mockRequest = {
        project_id: '123e4567-e89b-12d3-a456-426614174000',
        session_id: '123e4567-e89b-12d3-a456-426614174001',
        tool_name: 'read_file',
        tool_args: { file_path: 'src/auth.ts' },
        user_api_keys: {}
      };

      const mockToolResult = {
        observation: 'Content of file: **src/auth.ts**\n\n```typescript\nexport function authenticate() {}\n```',
        isError: false
      };

      vi.mocked(mockContext.req!.json).mockResolvedValue(mockRequest);
      vi.mocked(toolExecutor.executeToolByName).mockResolvedValue(mockToolResult);

      await handleToolExecution(mockContext as Context<{ Bindings: Env }>);

      expect(toolExecutor.executeToolByName).toHaveBeenCalledWith(
        expect.objectContaining({
          env: mockEnv,
          projectId: mockRequest.project_id,
          userApiKeys: {}
        }),
        'read_file',
        { file_path: 'src/auth.ts' }
      );

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: mockRequest.session_id,
          tool_name: 'read_file',
          observation: expect.stringContaining('Content of file: **src/auth.ts**'),
          is_error: false
        }),
        200
      );
    });

    it('should handle tool execution errors', async () => {
      const mockRequest = {
        project_id: '123e4567-e89b-12d3-a456-426614174000',
        session_id: '123e4567-e89b-12d3-a456-426614174001',
        tool_name: 'read_file',
        tool_args: { file_path: 'nonexistent.ts' },
        user_api_keys: {}
      };

      const mockToolResult = {
        observation: 'Error in read_file: File not found: nonexistent.ts',
        isError: true
      };

      vi.mocked(mockContext.req!.json).mockResolvedValue(mockRequest);
      vi.mocked(toolExecutor.executeToolByName).mockResolvedValue(mockToolResult);

      await handleToolExecution(mockContext as Context<{ Bindings: Env }>);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: mockRequest.session_id,
          tool_name: 'read_file',
          observation: 'Error in read_file: File not found: nonexistent.ts',
          is_error: true
        }),
        200
      );
    });

    it('should handle validation errors', async () => {
      const invalidRequest = {
        project_id: 'invalid-uuid',
        tool_name: ''
        // Missing required fields
      };

      vi.mocked(mockContext.req!.json).mockResolvedValue(invalidRequest);

      await handleToolExecution(mockContext as Context<{ Bindings: Env }>);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'BadRequest',
          message: 'Invalid tool execution request format',
          code: 'INVALID_TOOL_REQUEST_FORMAT'
        }),
        400
      );
    });

    it('should handle unexpected errors', async () => {
      const mockRequest = {
        project_id: '123e4567-e89b-12d3-a456-426614174000',
        session_id: '123e4567-e89b-12d3-a456-426614174001',
        tool_name: 'code_search',
        tool_args: { query: 'test' },
        user_api_keys: { embeddingKey: 'test-key' },
        embedding_model_config: {
          service: 'openai_embedding' as const
        }
      };

      vi.mocked(mockContext.req!.json).mockResolvedValue(mockRequest);
      vi.mocked(toolExecutor.executeToolByName).mockRejectedValue(new Error('Unexpected error'));

      await handleToolExecution(mockContext as Context<{ Bindings: Env }>);

      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'InternalServerError',
          message: 'Failed to execute tool',
          code: 'TOOL_EXECUTION_FAILED'
        }),
        500
      );
    });
  });
});