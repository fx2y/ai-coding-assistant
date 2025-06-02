/**
 * Streaming Service - Handles streaming LLM responses
 * Implements RFC-SYNC-001: Real-Time Response Streaming (SSE)
 * Implements P3-E2-S2: Worker & Client: SSE for Streaming LLM Responses
 */

import type {
  Env,
  ValidatedStreamSessionRequest,
  ChatMessage,
  StreamingChatCompletionRequest,
  AgentTurn,
  VectorSearchResult
} from '../types.js';
import { buildManagedPromptContext } from './contextBuilderService.js';
import {
  getStreamingChatCompletionViaProxy,
  isStreamingError,
  parseSSEContentStream
} from '../lib/byokProxyClient.js';
import { getModelConfig } from '../lib/tokenizer.js';
import { buildReActSystemPrompt, determineTargetService } from './agentService.js';

/**
 * Generate a streaming LLM response for agent direct responses
 * This function builds context, makes a streaming LLM call, and returns a ReadableStream of content tokens
 *
 * @param env - Cloudflare Worker environment
 * @param requestPayload - Validated stream session request
 * @returns ReadableStream of content tokens or null if error
 */
export async function generateStreamingAgentResponse(
  env: Env,
  requestPayload: ValidatedStreamSessionRequest
): Promise<ReadableStream<string> | null> {
  try {
    console.log(`[StreamingService] Starting streaming response for session ${requestPayload.session_id}`, {
      projectId: requestPayload.project_id,
      userQuery: requestPayload.user_query.substring(0, 100) + '...',
      historyLength: requestPayload.conversation_history.length,
      modelName: requestPayload.llm_config.modelName
    });

    // 1. Build Context-Rich Prompt for LLM
    const llmConfig = getModelConfig(requestPayload.llm_config.modelName);

    // Override with user-provided config
    llmConfig.tokenLimit = requestPayload.llm_config.tokenLimit;
    llmConfig.reservedOutputTokens = requestPayload.llm_config.reservedOutputTokens;

    const systemPrompt = buildReActSystemPrompt(requestPayload.available_tools_prompt_segment);

    // Prepare implicit context with proper typing
    const implicitContext: { last_focused_file_path?: string } = {};
    if (requestPayload.implicit_context?.last_focused_file_path) {
      implicitContext.last_focused_file_path = requestPayload.implicit_context.last_focused_file_path;
    }

    // Use type assertions to handle the complex optional property types
    const conversationHistory = requestPayload.conversation_history as AgentTurn[];
    const vectorSearchResults = (requestPayload.vector_search_results_to_include || []) as VectorSearchResult[];

    const contextResult = await buildManagedPromptContext(
      env,
      requestPayload.project_id,
      requestPayload.user_query,
      requestPayload.explicit_context_paths || [],
      requestPayload.pinned_item_ids_to_include || [],
      implicitContext,
      vectorSearchResults,
      conversationHistory,
      llmConfig
    );

    console.log(`[StreamingService] Context built`, {
      usedTokens: contextResult.usedTokens,
      includedSources: contextResult.includedSources.length,
      warnings: contextResult.warnings
    });

    // 2. Prepare messages for streaming LLM call
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: contextResult.finalPrompt
      }
    ];

    // 3. Make streaming LLM call via BYOK Proxy
    const streamingChatRequest: StreamingChatCompletionRequest = {
      model: requestPayload.llm_config.modelName,
      messages,
      temperature: requestPayload.llm_config.temperature || 0.2,
      max_tokens: requestPayload.llm_config.reservedOutputTokens,
      stream: true
    };

    const targetService = determineTargetService(requestPayload.llm_config.modelName);
    const proxyUrl = '/api/proxy/external'; // Internal worker call

    const streamResult = await getStreamingChatCompletionViaProxy(
      fetch,
      targetService,
      requestPayload.user_api_keys.llmKey,
      streamingChatRequest,
      proxyUrl
    );

    if (isStreamingError(streamResult)) {
      console.error(`[StreamingService] Streaming LLM call failed:`, streamResult.error);
      return null;
    }

    console.log(`[StreamingService] Streaming LLM call initiated successfully`);

    // 4. Parse the SSE stream and extract content tokens
    const contentStream = parseSSEContentStream(streamResult);

    return contentStream;

  } catch (error) {
    console.error(`[StreamingService] Failed to generate streaming response:`, error);
    return null;
  }
}

/**
 * Create an SSE response stream from content tokens
 * This function takes a ReadableStream of content tokens and formats them as SSE events
 *
 * @param contentStream - ReadableStream of content tokens
 * @returns ReadableStream formatted as SSE
 */
export function createSSEResponseStream(contentStream: ReadableStream<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = contentStream.getReader();

      try {
        // Send initial connection event
        const initEvent = `event: connected\ndata: Stream connected\n\n`;
        controller.enqueue(encoder.encode(initEvent));

        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;

          if (!done && result.value) {
            // Format as SSE event
            const sseEvent = `data: ${JSON.stringify(result.value)}\n\n`;
            controller.enqueue(encoder.encode(sseEvent));
          }
        }

        // Send completion event
        const doneEvent = `event: done\ndata: Stream complete\n\n`;
        controller.enqueue(encoder.encode(doneEvent));

      } catch (error) {
        console.error('[StreamingService] Error in SSE stream:', error);

        // Send error event
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    }
  });
}