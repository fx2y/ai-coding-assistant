/**
 * Agent Handlers Integration Tests
 * Tests for RFC-AGT-001: ReAct Agent API Endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAgentReactStep } from './agentHandlers.js';
import type { Context } from 'hono';
import type { Env } from '../types.js';

// Mock the agent service
vi.mock('../services/agentService.js', () => ({
  performReActStep: vi.fn()
}));

describe('Agent Handlers', () => {
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
      json: vi.fn().mockImplementation((data, status) => 
        new Response(JSON.stringify(data), { status })
      )
    };
  });

  it('should handle valid ReAct step request', async () => {
    const validRequest = {
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

    const expectedResponse = {
      session_id: '123e4567-e89b-12d3-a456-426614174001',
      thought: 'I need to search for authentication code.',
      action_details: {
        tool_name: 'code_search',
        tool_args: { query: 'authentication' },
        raw_action_string: 'Action: code_search(query="authentication")'
      },
      direct_response: null,
      updated_conversation_history: [
        {
          role: 'user',
          content: 'How do I implement authentication?',
          timestamp: expect.any(String)
        },
        {
          role: 'assistant',
          content: 'I need to search for authentication code.',
          toolCall: {
            name: 'code_search',
            parameters: { query: 'authentication' }
          },
          timestamp: expect.any(String)
        }
      ],
      iterations_remaining: 2,
      status: 'action_proposed'
    };

    // Mock request parsing
    vi.mocked(mockContext.req!.json).mockResolvedValue(validRequest);

    // Mock agent service response
    const { performReActStep } = await import('../services/agentService.js');
    vi.mocked(performReActStep).mockResolvedValue(expectedResponse);

    const response = await handleAgentReactStep(mockContext as Context<{ Bindings: Env }>);

    expect(response.status).toBe(200);
    expect(performReActStep).toHaveBeenCalledWith(mockEnv, validRequest);
    expect(mockContext.json).toHaveBeenCalledWith(expectedResponse, 200);
  });

  it('should handle invalid request format', async () => {
    const invalidRequest = {
      project_id: 'invalid-uuid',
      // Missing required fields
      user_query: 'test'
    };

    // Mock request parsing
    vi.mocked(mockContext.req!.json).mockResolvedValue(invalidRequest);

    const response = await handleAgentReactStep(mockContext as Context<{ Bindings: Env }>);

    expect(response.status).toBe(400);
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BadRequest',
        message: 'Invalid request format',
        code: 'INVALID_REQUEST_FORMAT'
      }),
      400
    );
  });

  it('should handle service errors gracefully', async () => {
    const validRequest = {
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      session_id: '123e4567-e89b-12d3-a456-426614174001',
      user_query: 'How do I implement authentication?',
      conversation_history: [],
      available_tools_prompt_segment: 'You have access to: code_search(query), read_file(path)',
      llm_config: {
        modelName: 'gpt-4',
        tokenLimit: 8192,
        reservedOutputTokens: 1000
      },
      user_api_keys: {
        llmKey: 'test-api-key'
      },
      max_iterations_left: 3
    };

    // Mock request parsing
    vi.mocked(mockContext.req!.json).mockResolvedValue(validRequest);

    // Mock agent service error
    const { performReActStep } = await import('../services/agentService.js');
    vi.mocked(performReActStep).mockRejectedValue(new Error('Service unavailable'));

    const response = await handleAgentReactStep(mockContext as Context<{ Bindings: Env }>);

    expect(response.status).toBe(500);
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'InternalServerError',
        message: 'Failed to process ReAct step',
        code: 'REACT_STEP_FAILED',
        details: 'Service unavailable'
      }),
      500
    );
  });

  it('should demonstrate complete ReAct workflow', async () => {
    // This test demonstrates a complete ReAct workflow:
    // 1. User asks a question
    // 2. Agent proposes an action (tool call)
    // 3. Client would execute the tool and send observation back
    // 4. Agent provides final answer

    const initialRequest = {
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      session_id: '123e4567-e89b-12d3-a456-426614174001',
      user_query: 'How is user authentication implemented in this codebase?',
      conversation_history: [],
      available_tools_prompt_segment: 'You have access to: code_search(query="search terms"), read_file(path="file/path")',
      llm_config: {
        modelName: 'gpt-4',
        tokenLimit: 8192,
        reservedOutputTokens: 1000
      },
      user_api_keys: {
        llmKey: 'test-api-key'
      },
      max_iterations_left: 3
    };

    // Step 1: Agent proposes to search for authentication code
    const step1Response = {
      session_id: '123e4567-e89b-12d3-a456-426614174001',
      thought: 'I need to search for authentication-related code to understand how it\'s implemented.',
      action_details: {
        tool_name: 'code_search',
        tool_args: { query: 'authentication login' },
        raw_action_string: 'Action: code_search(query="authentication login")'
      },
      direct_response: null,
      updated_conversation_history: [
        {
          role: 'user',
          content: 'How is user authentication implemented in this codebase?',
          timestamp: '2024-01-01T00:00:00.000Z'
        },
        {
          role: 'assistant',
          content: 'I need to search for authentication-related code to understand how it\'s implemented.',
          toolCall: {
            name: 'code_search',
            parameters: { query: 'authentication login' }
          },
          timestamp: '2024-01-01T00:00:01.000Z'
        }
      ],
      iterations_remaining: 2,
      status: 'action_proposed' as const
    };

    // Mock first request
    vi.mocked(mockContext.req!.json).mockResolvedValueOnce(initialRequest);
    const { performReActStep } = await import('../services/agentService.js');
    vi.mocked(performReActStep).mockResolvedValueOnce(step1Response);

    const response1 = await handleAgentReactStep(mockContext as Context<{ Bindings: Env }>);
    expect(response1.status).toBe(200);

    // At this point, the client would:
    // 1. Execute the code_search tool
    // 2. Get search results
    // 3. Send those results back as an observation in the next request

    const followupRequest = {
      ...initialRequest,
      user_query: '', // Empty since this is an observation turn
      conversation_history: [
        ...step1Response.updated_conversation_history,
        {
          role: 'tool_observation' as const,
          content: 'Search results: Found authentication.js with login() function, auth middleware in middleware/auth.js',
          toolResult: {
            success: true,
            result: 'Found authentication.js with login() function, auth middleware in middleware/auth.js'
          },
          timestamp: '2024-01-01T00:00:02.000Z'
        }
      ],
      max_iterations_left: 2
    };

    // Step 2: Agent provides final answer based on search results
    const step2Response = {
      session_id: '123e4567-e89b-12d3-a456-426614174001',
      thought: 'Based on the search results, I can now explain the authentication implementation.',
      action_details: null,
      direct_response: 'The authentication in this codebase is implemented using:\n\n1. **authentication.js** - Contains the main login() function\n2. **middleware/auth.js** - Provides authentication middleware\n\nThis suggests a typical Express.js authentication pattern with middleware-based protection.',
      updated_conversation_history: [
        ...followupRequest.conversation_history,
        {
          role: 'assistant',
          content: 'Based on the search results, I can now explain the authentication implementation.\n\nThe authentication in this codebase is implemented using:\n\n1. **authentication.js** - Contains the main login() function\n2. **middleware/auth.js** - Provides authentication middleware\n\nThis suggests a typical Express.js authentication pattern with middleware-based protection.',
          timestamp: '2024-01-01T00:00:03.000Z'
        }
      ],
      iterations_remaining: 1,
      status: 'direct_response_provided' as const
    };

    // Mock second request
    vi.mocked(mockContext.req!.json).mockResolvedValueOnce(followupRequest);
    vi.mocked(performReActStep).mockResolvedValueOnce(step2Response);

    const response2 = await handleAgentReactStep(mockContext as Context<{ Bindings: Env }>);
    expect(response2.status).toBe(200);

    // Verify the complete workflow
    expect(step1Response.status).toBe('action_proposed');
    expect(step1Response.action_details?.tool_name).toBe('code_search');
    expect(step2Response.status).toBe('direct_response_provided');
    expect(step2Response.direct_response).toContain('authentication.js');
  });
}); 