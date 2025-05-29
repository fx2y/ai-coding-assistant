/**
 * External API Service for communicating with AI services via the proxy worker
 * Implements RFC-SEC-001: Per-request API key transmission
 * Integrates with P0-E1-S2: Secure External API Proxy
 */

import { getApiKeys } from './apiKeyService.js';

export interface ExternalApiRequest {
  target_service: 'openai_chat' | 'openai_embedding' | 'anthropic_claude' | 'jina_embedding' | 'cohere_generate' | 'cohere_embed';
  payload: Record<string, unknown>;
}

export interface ExternalApiResponse<T = unknown> {
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
 * Make a request to an external AI service via the proxy worker
 */
export async function callExternalApi<T = unknown>(
  request: ExternalApiRequest
): Promise<ExternalApiResponse<T>> {
  const { llmKey, embeddingKey } = getApiKeys();
  
  // Determine which API key to use based on service type
  let apiKey: string | null = null;
  
  if (request.target_service.includes('chat') || request.target_service.includes('generate') || request.target_service === 'anthropic_claude') {
    apiKey = llmKey;
  } else if (request.target_service.includes('embedding') || request.target_service.includes('embed')) {
    apiKey = embeddingKey;
  }

  if (!apiKey) {
    return {
      success: false,
      error: {
        error: 'MissingApiKey',
        message: `No API key available for service type: ${request.target_service}`,
        code: 'MISSING_API_KEY'
      }
    };
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/proxy/external`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_service: request.target_service,
        api_key: apiKey,
        payload: request.payload
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
      data: result.data,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('External API request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the proxy service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Specialized function for OpenAI chat completions
 */
export async function callOpenAIChat(
  messages: Array<{ role: string; content: string }>,
  model: string = 'gpt-3.5-turbo',
  options?: Record<string, unknown>
): Promise<ExternalApiResponse> {
  return callExternalApi({
    target_service: 'openai_chat',
    payload: {
      model,
      messages,
      ...options
    }
  });
}

/**
 * Specialized function for OpenAI embeddings
 */
export async function callOpenAIEmbedding(
  input: string | string[],
  model: string = 'text-embedding-ada-002'
): Promise<ExternalApiResponse> {
  return callExternalApi({
    target_service: 'openai_embedding',
    payload: {
      model,
      input
    }
  });
}

/**
 * Specialized function for Anthropic Claude
 */
export async function callAnthropicClaude(
  messages: Array<{ role: string; content: string }>,
  model: string = 'claude-3-sonnet-20240229',
  options?: Record<string, unknown>
): Promise<ExternalApiResponse> {
  return callExternalApi({
    target_service: 'anthropic_claude',
    payload: {
      model,
      messages,
      max_tokens: 1000,
      ...options
    }
  });
}

/**
 * Specialized function for Jina embeddings
 */
export async function callJinaEmbedding(
  input: string | string[],
  model: string = 'jina-embeddings-v2-base-en'
): Promise<ExternalApiResponse> {
  return callExternalApi({
    target_service: 'jina_embedding',
    payload: {
      model,
      input
    }
  });
}

/**
 * Get list of supported services from the proxy
 */
export async function getSupportedServices(): Promise<ExternalApiResponse<{ services: string[]; count: number }>> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/proxy/services`);
    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result
      };
    }

    return {
      success: true,
      data: result.data
    };

  } catch (error) {
    console.error('Failed to get supported services:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to get supported services',
        code: 'NETWORK_ERROR'
      }
    };
  }
}

/**
 * Check proxy health
 */
export async function checkProxyHealth(): Promise<ExternalApiResponse<{ status: string; timestamp?: string }>> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/proxy/health`);
    const result = await response.json();

    return {
      success: response.ok,
      data: result.data,
      error: response.ok ? undefined : result
    };

  } catch (error) {
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Proxy service is unreachable',
        code: 'NETWORK_ERROR'
      }
    };
  }
} 