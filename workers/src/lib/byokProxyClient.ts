/**
 * BYOK Proxy Client - Client for external API proxy requests
 * Implements RFC-SEC-001: Secure External API Proxy Client
 */

import type {
  SupportedExternalService,
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatCompletionResponse,
  ProxyErrorResponse as ProxyError
} from '../types.js';

/**
 * Embedding request payload structure for external embedding APIs
 */
export interface EmbeddingRequestPayload {
  input: string | string[]; // Text(s) to embed - some APIs support batching
  model?: string; // Model name (e.g., 'text-embedding-ada-002', 'jina-embeddings-v2-base-en')
  encoding_format?: string; // Optional encoding format
  dimensions?: number; // Optional dimensions for some models
}

/**
 * Embedding response structure from external embedding APIs
 */
export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Error response structure from proxy or external service
 */
export interface ProxyErrorResponse {
  error: {
    status?: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Result type for embedding requests - either success or error
 */
export type EmbeddingResult = EmbeddingResponse | ProxyErrorResponse;

/**
 * Check if the result is an error response
 */
export function isEmbeddingError(result: EmbeddingResult): result is ProxyErrorResponse {
  return 'error' in result;
}

/**
 * Get embeddings via the BYOK proxy worker
 *
 * @param proxyWorkerFetch - Fetch function (global fetch or worker-specific)
 * @param targetService - External service identifier (e.g., 'openai_embedding', 'jina_embedding')
 * @param apiKey - User's API key for the external service
 * @param payload - Embedding request payload
 * @param proxyUrl - URL of the BYOK proxy endpoint
 * @returns Promise resolving to embedding response or error
 */
export async function getEmbeddingsViaProxy(
  proxyWorkerFetch: typeof fetch,
  targetService: SupportedExternalService,
  apiKey: string,
  payload: EmbeddingRequestPayload,
  proxyUrl: string
): Promise<EmbeddingResult> {
  try {
    console.log(`Making embedding request via proxy`, {
      targetService,
      proxyUrl,
      inputType: Array.isArray(payload.input) ? 'array' : 'string',
      inputCount: Array.isArray(payload.input) ? payload.input.length : 1,
      model: payload.model
    });

    const response = await proxyWorkerFetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_service: targetService,
        api_key: apiKey,
        payload: payload
      })
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: 'Failed to parse error response from proxy' };
      }

      console.error(`Error from BYOK proxy for ${targetService}`, {
        status: response.status,
        statusText: response.statusText,
        errorData
      });

      return {
        error: {
          status: response.status,
          message: `Proxy request failed: ${response.status} ${response.statusText}`,
          data: errorData
        }
      };
    }

    const responseData = await response.json() as EmbeddingResponse;

    console.log(`Embedding request successful via proxy`, {
      targetService,
      embeddingCount: responseData.data?.length || 0,
      model: responseData.model,
      usage: responseData.usage
    });

    return responseData;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown network error';
    console.error(`Network error calling BYOK proxy for ${targetService}:`, error);

    return {
      error: {
        message: `Network error: ${errorMessage}`,
        data: error
      }
    };
  }
}

/**
 * Batch embeddings request - splits large arrays into smaller batches
 *
 * @param proxyWorkerFetch - Fetch function
 * @param targetService - External service identifier
 * @param apiKey - User's API key
 * @param texts - Array of texts to embed
 * @param model - Model name
 * @param proxyUrl - URL of the BYOK proxy endpoint
 * @param batchSize - Maximum number of texts per batch (default: 100)
 * @returns Promise resolving to array of embeddings or error
 */
export async function getBatchEmbeddingsViaProxy(
  proxyWorkerFetch: typeof fetch,
  targetService: SupportedExternalService,
  apiKey: string,
  texts: string[],
  model: string | undefined,
  proxyUrl: string,
  batchSize: number = 100
): Promise<{ embeddings: number[][]; errors: string[] }> {
  const embeddings: number[][] = [];
  const errors: string[] = [];

  // Process texts in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const payload: EmbeddingRequestPayload = {
      input: batch,
      ...(model && { model })
    };

    const result = await getEmbeddingsViaProxy(
      proxyWorkerFetch,
      targetService,
      apiKey,
      payload,
      proxyUrl
    );

    if (isEmbeddingError(result)) {
      const errorMsg = `Batch ${Math.floor(i / batchSize) + 1} failed: ${result.error.message}`;
      errors.push(errorMsg);
      // Add empty embeddings for failed batch to maintain index alignment
      for (let j = 0; j < batch.length; j++) {
        embeddings.push([]);
      }
    } else {
      // Extract embeddings from successful response
      const batchEmbeddings = result.data
        .sort((a, b) => a.index - b.index) // Ensure correct order
        .map(item => item.embedding);

      embeddings.push(...batchEmbeddings);
    }
  }

  return { embeddings, errors };
}

/**
 * Check if the result is a chat completion error response
 */
export function isChatCompletionError(result: ChatCompletionResult): result is ProxyError {
  return 'error' in result;
}

/**
 * Get chat completion via the BYOK proxy worker
 *
 * @param proxyWorkerFetch - Fetch function (global fetch or worker-specific)
 * @param targetService - External service identifier (e.g., 'openai_chat', 'anthropic_claude')
 * @param apiKey - User's API key for the external service
 * @param payload - Chat completion request payload
 * @param proxyUrl - URL of the BYOK proxy endpoint
 * @returns Promise resolving to chat completion response or error
 */
export async function getChatCompletionViaProxy(
  proxyWorkerFetch: typeof fetch,
  targetService: SupportedExternalService,
  apiKey: string,
  payload: ChatCompletionRequest,
  proxyUrl: string
): Promise<ChatCompletionResult> {
  try {
    console.log(`Making chat completion request via proxy`, {
      targetService,
      proxyUrl,
      model: payload.model,
      messageCount: payload.messages.length,
      temperature: payload.temperature,
      maxTokens: payload.max_tokens
    });

    const response = await proxyWorkerFetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_service: targetService,
        api_key: apiKey,
        payload: payload
      })
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: 'Failed to parse error response from proxy' };
      }

      console.error(`Error from BYOK proxy for ${targetService}`, {
        status: response.status,
        statusText: response.statusText,
        errorData
      });

      return {
        error: {
          status: response.status,
          message: `Proxy request failed: ${response.status} ${response.statusText}`,
          data: errorData
        }
      };
    }

    const responseData = await response.json() as ChatCompletionResponse;

    console.log(`Chat completion request successful via proxy`, {
      targetService,
      model: responseData.model,
      choicesCount: responseData.choices?.length || 0,
      usage: responseData.usage
    });

    return responseData;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown network error';
    console.error(`Network error calling BYOK proxy for ${targetService}:`, error);

    return {
      error: {
        message: `Network error: ${errorMessage}`,
        data: error
      }
    };
  }
}

/**
 * Streaming chat completion request payload structure
 */
export interface StreamingChatCompletionRequest extends ChatCompletionRequest {
  stream: true;
}

/**
 * Get streaming chat completion via the BYOK proxy worker
 * Returns a ReadableStream of SSE chunks from the external LLM
 *
 * @param proxyWorkerFetch - Fetch function (global fetch or worker-specific)
 * @param targetService - External service identifier (e.g., 'openai_chat', 'anthropic_claude')
 * @param apiKey - User's API key for the external service
 * @param payload - Streaming chat completion request payload
 * @param proxyUrl - URL of the BYOK proxy endpoint
 * @returns Promise resolving to ReadableStream or error
 */
export async function getStreamingChatCompletionViaProxy(
  proxyWorkerFetch: typeof fetch,
  targetService: SupportedExternalService,
  apiKey: string,
  payload: StreamingChatCompletionRequest,
  proxyUrl: string
): Promise<ReadableStream<Uint8Array> | ProxyError> {
  try {
    console.log(`Making streaming chat completion request via proxy`, {
      targetService,
      proxyUrl,
      model: payload.model,
      messageCount: payload.messages.length,
      temperature: payload.temperature,
      maxTokens: payload.max_tokens,
      stream: payload.stream
    });

    const response = await proxyWorkerFetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_service: targetService,
        api_key: apiKey,
        payload: payload
      })
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: 'Failed to parse error response from proxy' };
      }

      console.error(`Error from BYOK proxy for streaming ${targetService}`, {
        status: response.status,
        statusText: response.statusText,
        errorData
      });

      return {
        error: {
          status: response.status,
          message: `Streaming proxy request failed: ${response.status} ${response.statusText}`,
          data: errorData
        }
      };
    }

    if (!response.body) {
      console.error(`No response body from BYOK proxy for streaming ${targetService}`);
      return {
        error: {
          message: 'No response body received from streaming proxy',
          data: null
        }
      };
    }

    console.log(`Streaming chat completion request initiated via proxy`, {
      targetService,
      contentType: response.headers.get('content-type')
    });

    return response.body;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown network error';
    console.error(`Network error calling BYOK proxy for streaming ${targetService}:`, error);

    return {
      error: {
        message: `Network error: ${errorMessage}`,
        data: error
      }
    };
  }
}

/**
 * Check if the streaming result is an error response
 */
export function isStreamingError(result: ReadableStream<Uint8Array> | ProxyError): result is ProxyError {
  return 'error' in result;
}

/**
 * Parse SSE chunks from external LLM stream and extract content tokens
 * This function processes the raw SSE stream from external LLMs (like OpenAI)
 * and extracts just the content tokens for re-transmission
 *
 * @param stream - ReadableStream from external LLM
 * @returns ReadableStream of content tokens as strings
 */
export function parseSSEContentStream(stream: ReadableStream<Uint8Array>): ReadableStream<string> {
  const decoder = new TextDecoder();

  return new ReadableStream<string>({
    async start(controller) {
      const reader = stream.getReader();
      let buffer = '';

      try {
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;

          if (!done && result.value) {
            // Decode the chunk and add to buffer
            const chunk = decoder.decode(result.value, { stream: true });
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonData = line.substring(6).trim();

                // Check for stream end
                if (jsonData === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(jsonData);

                  // Extract content from OpenAI-style response
                  const contentDelta = parsed.choices?.[0]?.delta?.content;
                  if (contentDelta && typeof contentDelta === 'string') {
                    controller.enqueue(contentDelta);
                  }

                  // Handle other LLM providers' response formats as needed
                  // Anthropic, Cohere, etc. may have different structures

                } catch (parseError) {
                  // Skip malformed JSON chunks
                  console.warn('Failed to parse SSE chunk JSON:', jsonData, parseError);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing SSE stream:', error);
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    }
  });
}