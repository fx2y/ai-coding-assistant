/**
 * Agent API Service for ReAct agent functionality
 * Implements P2-E2-S3: Client-side agent API communication
 */

import { getApiKeys } from './apiKeyService.js';

// Types matching the worker types
export interface AgentTurn {
  role: 'user' | 'assistant' | 'tool_observation';
  content: string;
  toolCall?: {
    name: string;
    parameters: Record<string, unknown>;
  };
  toolResult?: {
    success: boolean;
    result: unknown;
    error?: string;
  };
  timestamp: string;
}

export interface ActionDetails {
  tool_name: string;
  tool_args: Record<string, unknown>;
  raw_action_string: string;
}

export interface ReactStepRequest {
  project_id: string;
  session_id: string;
  user_query: string;
  conversation_history: AgentTurn[];
  explicit_context_paths?: string[];
  pinned_item_ids_to_include?: string[];
  implicit_context?: {
    last_focused_file_path?: string;
  };
  vector_search_results_to_include?: any[];
  available_tools_prompt_segment: string;
  llm_config: {
    modelName: string;
    tokenLimit: number;
    reservedOutputTokens: number;
    temperature?: number;
  };
  user_api_keys: {
    llmKey: string;
  };
  max_iterations_left: number;
}

export interface ReactStepResponse {
  session_id: string;
  thought: string;
  action_details: ActionDetails | null;
  direct_response: string | null;
  updated_conversation_history: AgentTurn[];
  iterations_remaining: number;
  status: 'action_proposed' | 'direct_response_provided' | 'streaming_response_available' | 'error';
  streaming_session_id?: string; // Available when status is 'streaming_response_available'
}

export interface ToolExecutionRequest {
  project_id: string;
  session_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  user_api_keys: {
    llmKey?: string;
    embeddingKey?: string;
  };
  embedding_model_config?: {
    service: 'openai_embedding' | 'jina_embedding' | 'cohere_embed';
    modelName?: string;
  };
}

export interface ToolExecutionResponse {
  session_id: string;
  tool_name: string;
  observation: string;
  is_error: boolean;
  execution_time_ms: number;
}

export interface AgentApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    error: string;
    message: string;
    code?: string;
    details?: unknown;
    requestId?: string;
  };
  requestId?: string;
}

// Configuration
const WORKER_BASE_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

/**
 * Default tools available to the agent
 */
const DEFAULT_TOOLS_PROMPT = `Available tools:
- code_search(query: string): Search through code using semantic similarity
- read_file(file_path: string): Read the contents of a specific file`;

/**
 * Perform a ReAct step with the agent
 */
export async function performReactStep(
  request: Omit<ReactStepRequest, 'user_api_keys' | 'available_tools_prompt_segment'>
): Promise<AgentApiResponse<ReactStepResponse>> {
  const { llmKey } = getApiKeys();

  if (!llmKey) {
    return {
      success: false,
      error: {
        error: 'MissingApiKey',
        message: 'No LLM API key available. Please configure your API keys first.',
        code: 'MISSING_LLM_KEY'
      }
    };
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/agent/react_step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...request,
        user_api_keys: {
          llmKey
        },
        available_tools_prompt_segment: DEFAULT_TOOLS_PROMPT
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result,
        requestId: result.requestId
      };
    }

    return {
      success: true,
      data: result,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('ReAct step request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the agent service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Execute a tool action
 */
export async function executeToolAction(
  request: Omit<ToolExecutionRequest, 'user_api_keys'>
): Promise<AgentApiResponse<ToolExecutionResponse>> {
  const { llmKey, embeddingKey } = getApiKeys();

  if (!llmKey) {
    return {
      success: false,
      error: {
        error: 'MissingApiKey',
        message: 'No LLM API key available. Please configure your API keys first.',
        code: 'MISSING_LLM_KEY'
      }
    };
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/agent/execute_action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...request,
        user_api_keys: {
          llmKey,
          ...(embeddingKey && { embeddingKey })
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result,
        requestId: result.requestId
      };
    }

    return {
      success: true,
      data: result,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('Tool execution request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the agent service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Apply a diff to a file in the project
 * Implements P3-E1-S2: Diff application API
 * Implements RFC-AGT-003: Semantic Diff Generation & Application
 */
export interface ApplyDiffRequest {
  project_id: string;
  file_path: string;
  diff_string: string;
}

export interface ApplyDiffResponse {
  success: boolean;
  message: string;
  new_content?: string;
}

export async function applyDiff(
  request: ApplyDiffRequest
): Promise<AgentApiResponse<ApplyDiffResponse>> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/project/${request.project_id}/apply_diff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_path: request.file_path,
        diff_string: request.diff_string
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result,
        requestId: result.requestId
      };
    }

    return {
      success: true,
      data: result,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('Apply diff request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the project service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Generate a unique session ID for agent interactions
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new agent turn
 */
export function createAgentTurn(
  role: AgentTurn['role'],
  content: string,
  toolCall?: AgentTurn['toolCall'],
  toolResult?: AgentTurn['toolResult']
): AgentTurn {
  return {
    role,
    content,
    ...(toolCall && { toolCall }),
    ...(toolResult && { toolResult }),
    timestamp: new Date().toISOString()
  };
}

/**
 * Get default LLM configuration
 */
export function getDefaultLLMConfig() {
  return {
    modelName: 'gpt-4',
    tokenLimit: 8000,
    reservedOutputTokens: 1000,
    temperature: 0.1
  };
}

// Streaming types (P3-E2-S2, RFC-SYNC-001)
export interface StreamSessionRequest {
  session_id: string;
  project_id: string;
  user_query: string;
  conversation_history: AgentTurn[];
  explicit_context_paths?: string[];
  pinned_item_ids_to_include?: string[];
  implicit_context?: {
    last_focused_file_path?: string;
  };
  vector_search_results_to_include?: any[];
  available_tools_prompt_segment: string;
  llm_config: {
    modelName: string;
    tokenLimit: number;
    reservedOutputTokens: number;
    temperature?: number;
  };
  user_api_keys: {
    llmKey: string;
  };
}

/**
 * Create a streaming agent response connection
 * Returns an EventSource for receiving streaming tokens
 * Implements P3-E2-S2: Client SSE consumption
 */
export function createStreamingAgentResponse(
  request: Omit<StreamSessionRequest, 'user_api_keys'>
): EventSource | null {
  const { llmKey } = getApiKeys();

  if (!llmKey) {
    console.error('No LLM API key available for streaming');
    return null;
  }

  try {
    // Create the streaming request payload
    const streamRequest: StreamSessionRequest = {
      ...request,
      user_api_keys: {
        llmKey
      }
    };

    // Create EventSource with POST data
    // Note: EventSource doesn't support POST directly, so we'll use a different approach
    // We'll make a POST request to initiate the stream and then connect to the stream endpoint
    
    const eventSource = new EventSource(`${WORKER_BASE_URL}/api/agent/stream/${request.session_id}`);
    
    // Send the POST data separately to initiate the stream
    fetch(`${WORKER_BASE_URL}/api/agent/stream/${request.session_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(streamRequest)
    }).catch(error => {
      console.error('Failed to initiate streaming request:', error);
    });

    return eventSource;

  } catch (error) {
    console.error('Failed to create streaming connection:', error);
    return null;
  }
}

/**
 * Create a streaming agent response with fetch-based SSE
 * This is an alternative approach that uses fetch with ReadableStream
 */
export async function createStreamingAgentResponseWithFetch(
  request: Omit<StreamSessionRequest, 'user_api_keys'>
): Promise<ReadableStream<string> | null> {
  const { llmKey } = getApiKeys();

  if (!llmKey) {
    console.error('No LLM API key available for streaming');
    return null;
  }

  try {
    const streamRequest: StreamSessionRequest = {
      ...request,
      user_api_keys: {
        llmKey
      }
    };

    const response = await fetch(`${WORKER_BASE_URL}/api/agent/stream/${request.session_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(streamRequest)
    });

    if (!response.ok) {
      throw new Error(`Streaming request failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body received');
    }

    // Parse SSE stream and extract content
    return new ReadableStream<string>({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.substring(6).trim();
                
                try {
                  const parsed = JSON.parse(data);
                  if (typeof parsed === 'string') {
                    controller.enqueue(parsed);
                  }
                } catch {
                  // Skip malformed JSON
                }
              } else if (line.startsWith('event: done')) {
                controller.close();
                return;
              } else if (line.startsWith('event: error')) {
                controller.error(new Error('Stream error'));
                return;
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });

  } catch (error) {
    console.error('Failed to create streaming connection:', error);
    return null;
  }
} 