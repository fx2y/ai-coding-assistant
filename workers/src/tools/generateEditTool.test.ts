/**
 * Unit tests for Generate Code Edit Tool
 * Tests RFC-AGT-003: Semantic Diff Generation & Application
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGenerateCodeEdit, type GenerateEditArgs, type LLMConfig } from './generateEditTool.js';
import type { Env, ChatCompletionResponse } from '../types.js';
import * as byokProxyClient from '../lib/byokProxyClient.js';

// Mock the BYOK proxy client
vi.mock('../lib/byokProxyClient.js');

describe('generateEditTool', () => {
  let mockEnv: Env;
  let mockUserApiKeys: { llmKey: string };
  let mockLLMConfig: LLMConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock environment
    mockEnv = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: {
        get: vi.fn()
      } as any,
      METADATA_KV: {} as any,
      VECTORIZE_INDEX: {} as any
    };

    mockUserApiKeys = {
      llmKey: 'test-llm-key'
    };

    mockLLMConfig = {
      modelName: 'gpt-4',
      tokenLimit: 4000,
      reservedOutputTokens: 1000,
      temperature: 0.1
    };
  });

  describe('executeGenerateCodeEdit', () => {
    it('should generate diff using provided code snippet', async () => {
      const args: GenerateEditArgs = {
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

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBeUndefined();
      expect(result.tool_output).toBeDefined();
      expect(result.tool_output?.file_path).toBe('src/utils.js');
      expect(result.tool_output?.diff_string).toContain('-function foo()');
      expect(result.tool_output?.diff_string).toContain('+function bar()');

      // Verify LLM was called with correct parameters
      expect(byokProxyClient.getChatCompletionViaProxy).toHaveBeenCalledWith(
        fetch,
        'openai_chat',
        'test-llm-key',
        expect.objectContaining({
          model: 'gpt-4',
          temperature: 0.1,
          max_tokens: 1000,
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('function foo() { return "hello"; }')
            })
          ])
        }),
        expect.stringContaining('/api/proxy/external')
      );
    });

    it('should fetch file content from R2 when no code snippet provided', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'add error handling'
      };

      const fileContent = 'function processData(data) { return data.map(x => x.value); }';

      const mockR2Object = {
        text: vi.fn().mockResolvedValue(fileContent)
      };

      vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue(mockR2Object as any);

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

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBeUndefined();
      expect(result.tool_output).toBeDefined();

      // Verify R2 was called with correct key
      expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(
        'projects/test-project-id/original/src/utils.js'
      );

      // Verify LLM prompt contained the fetched file content
      const llmCall = vi.mocked(byokProxyClient.getChatCompletionViaProxy).mock.calls[0];
      const userMessage = llmCall?.[3]?.messages?.find(m => m.role === 'user');
      expect(userMessage?.content).toContain(fileContent);
    });

    it('should return error when file not found in R2', async () => {
      const args: GenerateEditArgs = {
        file_path: 'nonexistent/file.js',
        edit_instructions: 'add something'
      };

      vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue(null);

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBe('File not found: nonexistent/file.js');
      expect(result.tool_output).toBeNull();
    });

    it('should handle LLM errors gracefully', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function',
        original_code_snippet: 'function test() {}'
      };

      const mockError = {
        error: {
          status: 401,
          message: 'Invalid API key'
        }
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockError);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(true);

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBe('LLM request failed: Invalid API key');
      expect(result.tool_output).toBeNull();
    });

    it('should handle empty LLM response', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function',
        original_code_snippet: 'function test() {}'
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
            content: ''
          },
          finish_reason: 'stop'
        }]
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockLLMResponse);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(false);

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBe('LLM returned empty response');
      expect(result.tool_output).toBeNull();
    });

    it('should clean LLM response with boilerplate text', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function',
        original_code_snippet: 'function test() {}'
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
            content: `Here is the diff:
\`\`\`diff
--- a/original_code
+++ b/modified_code
@@ -1,1 +1,1 @@
-function test() {}
+function newTest() {}
\`\`\``
          },
          finish_reason: 'stop'
        }]
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockLLMResponse);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(false);

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBeUndefined();
      expect(result.tool_output?.diff_string).not.toContain('Here is the diff:');
      expect(result.tool_output?.diff_string).not.toContain('```diff');
      expect(result.tool_output?.diff_string).not.toContain('```');
      expect(result.tool_output?.diff_string).toContain('--- a/original_code');
    });

    it('should reject invalid diff format', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function',
        original_code_snippet: 'function test() {}'
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
            content: 'I cannot generate a diff for this request. The code is too complex.'
          },
          finish_reason: 'stop'
        }]
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockLLMResponse);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(false);

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBe('LLM did not produce a valid diff format. Please try rephrasing your edit instructions.');
      expect(result.tool_output).toBeNull();
    });

    it('should determine correct target service for different models', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function',
        original_code_snippet: 'function test() {}'
      };

      const mockLLMResponse: ChatCompletionResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'claude-3',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: `--- a/original_code
+++ b/modified_code
@@ -1,1 +1,1 @@
-function test() {}
+function newTest() {}`
          },
          finish_reason: 'stop'
        }]
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockLLMResponse);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(false);

      // Test with Claude model
      const claudeConfig = { ...mockLLMConfig, modelName: 'claude-3-sonnet' };

      await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        claudeConfig
      );

      expect(byokProxyClient.getChatCompletionViaProxy).toHaveBeenCalledWith(
        fetch,
        'anthropic_claude',
        'test-llm-key',
        expect.any(Object),
        expect.any(String)
      );
    });

    it('should include proper language detection in prompt', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/component.tsx',
        edit_instructions: 'add prop validation',
        original_code_snippet: 'export function Component() { return <div>Hello</div>; }'
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
-export function Component() { return <div>Hello</div>; }
+export function Component(props: {}) { return <div>Hello</div>; }`
          },
          finish_reason: 'stop'
        }]
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockResolvedValue(mockLLMResponse);
      vi.mocked(byokProxyClient.isChatCompletionError).mockReturnValue(false);

      await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      const llmCall = vi.mocked(byokProxyClient.getChatCompletionViaProxy).mock.calls[0];
      const userMessage = llmCall?.[3]?.messages?.find(m => m.role === 'user');

      // Should detect TypeScript from .tsx extension
      expect(userMessage?.content).toContain('```typescript');
    });

    it('should handle network errors gracefully', async () => {
      const args: GenerateEditArgs = {
        file_path: 'src/utils.js',
        edit_instructions: 'rename function',
        original_code_snippet: 'function test() {}'
      };

      vi.mocked(byokProxyClient.getChatCompletionViaProxy).mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await executeGenerateCodeEdit(
        mockEnv,
        'test-project-id',
        args,
        mockUserApiKeys,
        mockLLMConfig
      );

      expect(result.error).toBe('Failed to generate code edit: Network timeout');
      expect(result.tool_output).toBeNull();
    });
  });
});