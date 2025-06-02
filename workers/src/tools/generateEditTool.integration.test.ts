/**
 * Integration tests for Generate Code Edit Tool with Tool Executor
 * Tests RFC-AGT-003 and RFC-AGT-002 integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolByName, type ToolExecutionContext } from '../services/toolExecutor.js';
import type { Env, ChatCompletionResponse } from '../types.js';
import * as byokProxyClient from '../lib/byokProxyClient.js';

// Mock the BYOK proxy client
vi.mock('../lib/byokProxyClient.js');

describe('generateEditTool integration', () => {
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock environment
    const mockEnv: Env = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: {
        get: vi.fn()
      } as any,
      METADATA_KV: {} as any,
      VECTORIZE_INDEX: {} as any
    };

    mockContext = {
      env: mockEnv,
      projectId: 'test-project-id',
      userApiKeys: {
        llmKey: 'test-llm-key'
      },
      llmConfig: {
        modelName: 'gpt-4',
        tokenLimit: 4000,
        reservedOutputTokens: 1000,
        temperature: 0.1
      }
    };
  });

  describe('executeToolByName with generate_code_edit', () => {
    it('should execute generate_code_edit tool successfully', async () => {
      const toolArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function foo to bar',
        original_code_snippet: 'function foo() { return "hello"; }'
      };

      const mockLLMResponse: ChatCompletionResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: `--- a/original_code
+++ b/modified_code
@@ -1,1 +1,1 @@
-function foo() { return "hello"; }
+function bar() { return "hello"; }`
          },
          finish_reason: 'stop'
        }]
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockLLMResponse);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(false);

      const result = await executeToolByName(mockContext, 'generate_code_edit', toolArgs);

      expect(result.isError).toBe(false);
      expect(result.observation).toContain('Diff generated for file "src/utils.js"');
      expect(result.observation).toContain('```diff');
      expect(result.observation).toContain('-function foo()');
      expect(result.observation).toContain('+function bar()');
      expect(result.observation).toContain('You can now propose to apply this diff');
    });

    it('should return error when LLM key is missing', async () => {
      const contextWithoutLLMKey = {
        ...mockContext,
        userApiKeys: {}
      };

      const toolArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function foo to bar'
      };

      const result = await executeToolByName(contextWithoutLLMKey, 'generate_code_edit', toolArgs);

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: LLM API key is required for generate_code_edit');
    });

    it('should return error when LLM config is missing', async () => {
      const contextWithoutLLMConfig: ToolExecutionContext = {
        env: mockContext.env,
        projectId: mockContext.projectId,
        userApiKeys: mockContext.userApiKeys
        // llmConfig is intentionally omitted
      };

      const toolArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function foo to bar'
      };

      const result = await executeToolByName(contextWithoutLLMConfig, 'generate_code_edit', toolArgs);

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: LLM configuration is required for generate_code_edit');
    });

    it('should return error for invalid arguments', async () => {
      const invalidToolArgs = {
        file_path: '', // Empty file path
        edit_instructions: 'rename function foo to bar'
      };

      const result = await executeToolByName(mockContext, 'generate_code_edit', invalidToolArgs);

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Invalid arguments for generate_code_edit. Expected: { file_path: string, edit_instructions: string, original_code_snippet?: string }');
    });

    it('should return error when tool execution fails', async () => {
      const toolArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function foo to bar',
        original_code_snippet: 'function foo() { return "hello"; }'
      };

      const mockError = {
        error: {
          status: 401,
          message: 'Invalid API key'
        }
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockError);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(true);

      const result = await executeToolByName(mockContext, 'generate_code_edit', toolArgs);

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error in generate_code_edit: LLM request failed: Invalid API key');
    });

    it('should handle missing original_code_snippet by fetching from R2', async () => {
      const toolArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'add error handling'
      };

      const fileContent = 'function processData(data) { return data.map(x => x.value); }';

      const mockR2Object = {
        text: vi.fn().mockResolvedValue(fileContent)
      };

      vi.mocked(mockContext.env.CODE_UPLOADS_BUCKET.get).mockResolvedValue(mockR2Object as any);

      const mockLLMResponse: ChatCompletionResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: `--- a/original_code
+++ b/modified_code
@@ -1,1 +1,3 @@
 function processData(data) {
+  if (!data) throw new Error('Data is required');
   return data.map(x => x.value);
 }`
          },
          finish_reason: 'stop'
        }]
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockLLMResponse);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(false);

      const result = await executeToolByName(mockContext, 'generate_code_edit', toolArgs);

      expect(result.isError).toBe(false);
      expect(result.observation).toContain('Diff generated for file "src/utils.js"');

      // Verify R2 was called
      expect(mockContext.env.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(
        'projects/test-project-id/original/src/utils.js'
      );
    });

    it('should validate all required arguments', async () => {
      // Test missing file_path
      let result = await executeToolByName(mockContext, 'generate_code_edit', {
        edit_instructions: 'rename function'
      });
      expect(result.isError).toBe(true);

      // Test missing edit_instructions
      result = await executeToolByName(mockContext, 'generate_code_edit', {
        file_path: 'src/utils.js'
      });
      expect(result.isError).toBe(true);

      // Test invalid original_code_snippet type
      result = await executeToolByName(mockContext, 'generate_code_edit', {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function',
        original_code_snippet: 123 // Should be string
      });
      expect(result.isError).toBe(true);
    });
  });
});