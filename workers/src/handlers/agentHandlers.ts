/**
 * Agent Handlers - ReAct Agent API Endpoints
 * Implements RFC-AGT-001: ReAct Agent Core Loop
 * Implements RFC-AGT-004: Structured Prompting & Agent Control
 * Implements RFC-AGT-002: Tool Definition & Execution Framework
 */

import type { Context } from 'hono';
import type { Env, ToolExecutionResponse } from '../types.js';
import { ReactStepRequestSchema, ToolExecutionRequestSchema, StreamSessionRequestSchema } from '../types.js';
import { performReActStep } from '../services/agentService.js';
import { executeToolByName, type ToolExecutionContext } from '../services/toolExecutor.js';
import { generateStreamingAgentResponse, createSSEResponseStream } from '../services/streamingService.js';

/**
 * Handles ReAct agent step execution
 * POST /api/agent/react_step
 * Implements RFC-AGT-001: ReAct Agent Core Loop
 */
export async function handleAgentReactStep(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    console.log(`[AgentHandlers] Starting ReAct step request`);

    // Parse and validate request body
    const body = await c.req.json();
    const validationResult = ReactStepRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error(`[AgentHandlers] Request validation failed:`, validationResult.error.flatten());
      return c.json({
        error: 'BadRequest',
        message: 'Invalid request format',
        code: 'INVALID_REQUEST_FORMAT',
        details: validationResult.error.flatten()
      }, 400);
    }

    const requestPayload = validationResult.data;

    console.log(`[AgentHandlers] Request validated`, {
      projectId: requestPayload.project_id,
      sessionId: requestPayload.session_id,
      userQuery: requestPayload.user_query.substring(0, 100) + '...',
      historyLength: requestPayload.conversation_history.length,
      iterationsLeft: requestPayload.max_iterations_left,
      modelName: requestPayload.llm_config.modelName
    });

    // Perform ReAct step
    const result = await performReActStep(c.env, requestPayload);

    console.log(`[AgentHandlers] ReAct step completed`, {
      sessionId: result.session_id,
      status: result.status,
      hasAction: !!result.action_details,
      iterationsRemaining: result.iterations_remaining
    });

    // Return success response
    return c.json(result, 200);

  } catch (error) {
    console.error('[AgentHandlers] ReAct step failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to process ReAct step',
      code: 'REACT_STEP_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Handles tool execution for ReAct agent
 * POST /api/agent/execute_action
 * Implements RFC-AGT-002: Tool Definition & Execution Framework
 */
export async function handleToolExecution(c: Context<{ Bindings: Env }>): Promise<Response> {
  const startTime = Date.now();

  try {
    console.log(`[AgentHandlers] Starting tool execution request`);

    // Parse and validate request body
    const body = await c.req.json();
    const validationResult = ToolExecutionRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error(`[AgentHandlers] Tool execution validation failed:`, validationResult.error.flatten());
      return c.json({
        error: 'BadRequest',
        message: 'Invalid tool execution request format',
        code: 'INVALID_TOOL_REQUEST_FORMAT',
        details: validationResult.error.flatten()
      }, 400);
    }

    const requestPayload = validationResult.data;

    console.log(`[AgentHandlers] Tool execution request validated`, {
      projectId: requestPayload.project_id,
      sessionId: requestPayload.session_id,
      toolName: requestPayload.tool_name,
      toolArgs: Object.keys(requestPayload.tool_args)
    });

    // Prepare tool execution context
    const context: ToolExecutionContext = {
      env: c.env,
      projectId: requestPayload.project_id,
      userApiKeys: {
        ...(requestPayload.user_api_keys.embeddingKey && { embeddingKey: requestPayload.user_api_keys.embeddingKey }),
        ...(requestPayload.user_api_keys.llmKey && { llmKey: requestPayload.user_api_keys.llmKey })
      },
      ...(requestPayload.embedding_model_config && { embeddingModelConfig: requestPayload.embedding_model_config })
    };

    // Execute the tool
    const toolResult = await executeToolByName(
      context,
      requestPayload.tool_name,
      requestPayload.tool_args
    );

    const executionTime = Date.now() - startTime;

    console.log(`[AgentHandlers] Tool execution completed`, {
      sessionId: requestPayload.session_id,
      toolName: requestPayload.tool_name,
      isError: toolResult.isError,
      executionTimeMs: executionTime
    });

    // Prepare response
    const response: ToolExecutionResponse = {
      session_id: requestPayload.session_id,
      tool_name: requestPayload.tool_name,
      observation: toolResult.observation,
      is_error: toolResult.isError,
      execution_time_ms: executionTime
    };

    return c.json(response, 200);

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('[AgentHandlers] Tool execution failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return c.json({
      error: 'InternalServerError',
      message: 'Failed to execute tool',
      code: 'TOOL_EXECUTION_FAILED',
      details: errorMessage
    }, 500);
  }
}

/**
 * Handles streaming agent responses via Server-Sent Events
 * GET /api/agent/stream/:sessionId
 * Implements RFC-SYNC-001: Real-Time Response Streaming (SSE)
 * Implements P3-E2-S2: Worker & Client: SSE for Streaming LLM Responses
 */
export async function handleAgentResponseStream(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const sessionId = c.req.param('sessionId');
    console.log(`[AgentHandlers] Starting streaming response for session ${sessionId}`);

    // Parse and validate request body from POST data
    const body = await c.req.json();
    const validationResult = StreamSessionRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error(`[AgentHandlers] Stream request validation failed:`, validationResult.error.flatten());

      // Return SSE error response
      const errorStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const errorEvent = `event: error\ndata: ${JSON.stringify({
            error: 'Invalid request format',
            details: validationResult.error.flatten()
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      });

      return new Response(errorStream, {
        status: 200, // SSE should return 200 even for errors
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const requestPayload = validationResult.data;

    console.log(`[AgentHandlers] Stream request validated`, {
      projectId: requestPayload.project_id,
      sessionId: requestPayload.session_id,
      userQuery: requestPayload.user_query.substring(0, 100) + '...',
      historyLength: requestPayload.conversation_history.length,
      modelName: requestPayload.llm_config.modelName
    });

    // Generate streaming response
    const contentStream = await generateStreamingAgentResponse(c.env, requestPayload);

    if (!contentStream) {
      console.error(`[AgentHandlers] Failed to generate streaming response`);

      // Return SSE error response
      const errorStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const errorEvent = `event: error\ndata: ${JSON.stringify({
            error: 'Failed to generate streaming response'
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      });

      return new Response(errorStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Create SSE response stream
    const sseStream = createSSEResponseStream(contentStream);

    console.log(`[AgentHandlers] Streaming response initiated for session ${sessionId}`);

    return new Response(sseStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('[AgentHandlers] Stream handler failed:', error);

    // Return SSE error response
    const errorStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const errorEvent = `event: error\ndata: ${JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    });

    return new Response(errorStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}