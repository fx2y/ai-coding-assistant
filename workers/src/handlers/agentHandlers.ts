/**
 * Agent Handlers - ReAct Agent API Endpoints
 * Implements RFC-AGT-001: ReAct Agent Core Loop
 * Implements RFC-AGT-004: Structured Prompting & Agent Control
 */

import type { Context } from 'hono';
import type { Env } from '../types.js';
import { ReactStepRequestSchema } from '../types.js';
import { performReActStep } from '../services/agentService.js';

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