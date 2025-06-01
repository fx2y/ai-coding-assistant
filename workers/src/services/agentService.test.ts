/**
 * Agent Service Tests
 * Tests for RFC-AGT-001: ReAct Agent Core Loop
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performReActStep } from './agentService.js';
import type { Env, ValidatedReactStepRequest } from '../types.js';

// Mock dependencies
vi.mock('./contextBuilderService.js', () => ({
  buildManagedPromptContext: vi.fn()
}));

vi.mock('../lib/byokProxyClient.js', () => ({
  getChatCompletionViaProxy: vi.fn(),
  isChatCompletionError: vi.fn()
}));

vi.mock('../lib/tokenizer.js', () => ({
  getModelConfig: vi.fn()
}));

describe('Agent Service', () => {
  let mockEnv: Env;
  let mockRequest: ValidatedReactStepRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEnv = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: {} as R2Bucket,
      METADATA_KV: {} as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex
    };

    mockRequest = {
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      session_id: '123e4567-e89b-12d3-a456-426614174001',
      user_query: 'How do I implement authentication?',
      conversation_history: [],
      explicit_context_paths: [],
      pinned_item_ids_to_include: [],
      implicit_context: {},
      vector_search_results_to_include: [],
      available_tools_prompt_segment: 'You have access to: code_search(query), read_file(path)',
      llm_config: {
        modelName: 'gpt-4',
        tokenLimit: 8192,
        reservedOutputTokens: 1000,
        temperature: 0.2
      },
      user_api_keys: {
        llmKey: 'test-api-key'
      },
      max_iterations_left: 3
    };
  });

  it('should handle successful ReAct step with action', async () => {
    // Mock successful context building
    const { buildManagedPromptContext } = await import('./contextBuilderService.js');
    vi.mocked(buildManagedPromptContext).mockResolvedValue({
      finalPrompt: 'Test prompt with context',
      usedTokens: 500,
      includedSources: ['test-source'],
      warnings: [],
      tokenCountMethod: 'heuristic',
      tokenCountConfidence: 'medium'
    });

    // Mock successful LLM response with action
    const { getChatCompletionViaProxy, isChatCompletionError } = await import('../lib/byokProxyClient.js');
    vi.mocked(getChatCompletionViaProxy).mockResolvedValue({
      id: 'test-completion',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Thought: I need to search for authentication code.\nAction: code_search(query="authentication")'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 500,
        completion_tokens: 50,
        total_tokens: 550
      }
    });
    vi.mocked(isChatCompletionError).mockReturnValue(false);

    // Mock model config
    const { getModelConfig } = await import('../lib/tokenizer.js');
    vi.mocked(getModelConfig).mockReturnValue({
      modelName: 'gpt-4',
      tokenLimit: 8192,
      reservedOutputTokens: 1000,
      encoding: 'cl100k_base',
      provider: 'openai'
    });

    const result = await performReActStep(mockEnv, mockRequest);

    expect(result.status).toBe('action_proposed');
    expect(result.thought).toBe('I need to search for authentication code.');
    expect(result.action_details).toEqual({
      tool_name: 'code_search',
      tool_args: { query: 'authentication' },
      raw_action_string: 'Action: code_search(query="authentication")'
    });
    expect(result.direct_response).toBeNull();
    expect(result.iterations_remaining).toBe(2);
    expect(result.updated_conversation_history).toHaveLength(2); // user query + assistant response
  });

  it('should handle successful ReAct step with direct response', async () => {
    // Mock successful context building
    const { buildManagedPromptContext } = await import('./contextBuilderService.js');
    vi.mocked(buildManagedPromptContext).mockResolvedValue({
      finalPrompt: 'Test prompt with context',
      usedTokens: 500,
      includedSources: ['test-source'],
      warnings: [],
      tokenCountMethod: 'heuristic',
      tokenCountConfidence: 'medium'
    });

    // Mock successful LLM response with direct answer
    const { getChatCompletionViaProxy, isChatCompletionError } = await import('../lib/byokProxyClient.js');
    vi.mocked(getChatCompletionViaProxy).mockResolvedValue({
      id: 'test-completion',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Thought: I can answer this directly based on the context.\n\nTo implement authentication, you should use a secure authentication library like Passport.js for Node.js applications.'
        },
        finish_reason: 'stop'
      }]
    });
    vi.mocked(isChatCompletionError).mockReturnValue(false);

    // Mock model config
    const { getModelConfig } = await import('../lib/tokenizer.js');
    vi.mocked(getModelConfig).mockReturnValue({
      modelName: 'gpt-4',
      tokenLimit: 8192,
      reservedOutputTokens: 1000,
      encoding: 'cl100k_base',
      provider: 'openai'
    });

    const result = await performReActStep(mockEnv, mockRequest);

    expect(result.status).toBe('direct_response_provided');
    expect(result.thought).toBe('I can answer this directly based on the context.');
    expect(result.action_details).toBeNull();
    expect(result.direct_response).toContain('To implement authentication');
    expect(result.iterations_remaining).toBe(2);
  });

  it('should handle LLM errors gracefully', async () => {
    // Mock successful context building
    const { buildManagedPromptContext } = await import('./contextBuilderService.js');
    vi.mocked(buildManagedPromptContext).mockResolvedValue({
      finalPrompt: 'Test prompt with context',
      usedTokens: 500,
      includedSources: ['test-source'],
      warnings: [],
      tokenCountMethod: 'heuristic',
      tokenCountConfidence: 'medium'
    });

    // Mock LLM error
    const { getChatCompletionViaProxy, isChatCompletionError } = await import('../lib/byokProxyClient.js');
    vi.mocked(getChatCompletionViaProxy).mockResolvedValue({
      error: {
        status: 500,
        message: 'LLM service unavailable',
        data: {}
      }
    });
    vi.mocked(isChatCompletionError).mockReturnValue(true);

    // Mock model config
    const { getModelConfig } = await import('../lib/tokenizer.js');
    vi.mocked(getModelConfig).mockReturnValue({
      modelName: 'gpt-4',
      tokenLimit: 8192,
      reservedOutputTokens: 1000,
      encoding: 'cl100k_base',
      provider: 'openai'
    });

    const result = await performReActStep(mockEnv, mockRequest);

    expect(result.status).toBe('error');
    expect(result.thought).toBe('');
    expect(result.action_details).toBeNull();
    expect(result.direct_response).toBeNull();
    expect(result.iterations_remaining).toBe(3); // Should remain unchanged on error
  });
}); 