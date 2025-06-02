/**
 * Self-Correction Service - Agent Error Detection and Correction Logic
 * Implements RFC-AGT-005: Agent Self-Correction Loop for Errors
 */

import type { AgentTurn } from '../types.js';

export interface ErrorContext {
  type: 'tool_error' | 'user_feedback_error';
  errorMessage: string;
  failedAction?: {
    toolName: string;
    toolArgs: Record<string, unknown>;
  };
  userFeedback?: string;
  previousAgentOutput?: string;
}

export interface SelfCorrectionContext {
  shouldTriggerCorrection: boolean;
  errorContext?: ErrorContext;
  correctionPromptSegment?: string;
}

/**
 * Keywords that indicate user is reporting an error in agent's previous response
 */
const ERROR_FEEDBACK_KEYWORDS = [
  'error', 'wrong', 'incorrect', 'failed', 'didn\'t work', 'not working',
  'bug', 'broken', 'issue', 'problem', 'mistake', 'fix', 'crash', 'exception'
];

/**
 * Analyzes conversation history and current user query to determine if self-correction should be triggered
 * @param conversationHistory - Full conversation history
 * @param currentUserQuery - Current user input
 * @returns Self-correction context with trigger decision and error details
 */
export function analyzeSelfCorrectionTrigger(
  conversationHistory: AgentTurn[],
  currentUserQuery: string
): SelfCorrectionContext {
  // Check for tool execution errors (most recent tool_observation with error)
  const toolErrorContext = detectToolExecutionError(conversationHistory);
  if (toolErrorContext) {
    return {
      shouldTriggerCorrection: true,
      errorContext: toolErrorContext,
      correctionPromptSegment: buildToolErrorCorrectionPrompt(toolErrorContext)
    };
  }

  // Check for user feedback indicating error in agent's previous response
  const userFeedbackContext = detectUserFeedbackError(conversationHistory, currentUserQuery);
  if (userFeedbackContext) {
    return {
      shouldTriggerCorrection: true,
      errorContext: userFeedbackContext,
      correctionPromptSegment: buildUserFeedbackCorrectionPrompt(userFeedbackContext)
    };
  }

  return {
    shouldTriggerCorrection: false
  };
}

/**
 * Detects if the most recent tool execution resulted in an error
 */
function detectToolExecutionError(conversationHistory: AgentTurn[]): ErrorContext | null {
  // Look for the most recent tool_observation turn with an error
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const turn = conversationHistory[i];
    
    if (turn && turn.role === 'tool_observation' && turn.toolResult) {
      // Check if this tool result indicates an error
      if (!turn.toolResult.success || turn.toolResult.error) {
        // Find the corresponding tool call from the assistant
        const toolCall = findCorrespondingToolCall(conversationHistory, i);
        
        const errorContext: ErrorContext = {
          type: 'tool_error',
          errorMessage: turn.toolResult.error || turn.content || 'Tool execution failed'
        };

        if (toolCall) {
          errorContext.failedAction = {
            toolName: toolCall.name,
            toolArgs: toolCall.parameters
          };
        }

        return errorContext;
      }
      
      // If we found a successful tool result, no recent error
      break;
    }
  }

  return null;
}

/**
 * Detects if user feedback indicates an error in agent's previous response
 */
function detectUserFeedbackError(
  conversationHistory: AgentTurn[],
  currentUserQuery: string
): ErrorContext | null {
  const queryLower = currentUserQuery.toLowerCase();
  
  // Check if user query contains error-indicating keywords
  const hasErrorKeywords = ERROR_FEEDBACK_KEYWORDS.some(keyword => 
    queryLower.includes(keyword)
  );

  if (!hasErrorKeywords) {
    return null;
  }

  // Find the most recent assistant response
  const lastAssistantTurn = findLastAssistantTurn(conversationHistory);
  
  if (!lastAssistantTurn) {
    return null;
  }

  // Additional heuristics to confirm this is error feedback
  // (vs. just mentioning errors in general context)
  const isDirectFeedback = (
    queryLower.includes('that') || 
    queryLower.includes('your') || 
    queryLower.includes('the code') ||
    queryLower.includes('previous') ||
    queryLower.includes('last')
  );

  if (!isDirectFeedback) {
    return null;
  }

  return {
    type: 'user_feedback_error',
    errorMessage: currentUserQuery,
    userFeedback: currentUserQuery,
    previousAgentOutput: lastAssistantTurn.content
  };
}

/**
 * Finds the tool call that corresponds to a tool_observation turn
 */
function findCorrespondingToolCall(
  conversationHistory: AgentTurn[],
  observationIndex: number
): { name: string; parameters: Record<string, unknown> } | null {
  // Look backwards from the observation to find the most recent assistant turn with a tool call
  for (let i = observationIndex - 1; i >= 0; i--) {
    const turn = conversationHistory[i];
    if (turn && turn.role === 'assistant' && turn.toolCall) {
      return turn.toolCall;
    }
  }
  return null;
}

/**
 * Finds the most recent assistant turn in conversation history
 */
function findLastAssistantTurn(conversationHistory: AgentTurn[]): AgentTurn | null {
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const turn = conversationHistory[i];
    if (turn && turn.role === 'assistant') {
      return turn;
    }
  }
  return null;
}

/**
 * Builds correction prompt segment for tool execution errors
 */
function buildToolErrorCorrectionPrompt(errorContext: ErrorContext): string {
  const { errorMessage, failedAction } = errorContext;
  
  let prompt = `PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED:

Error Details: ${errorMessage}`;

  if (failedAction) {
    prompt += `
Failed Tool: ${failedAction.toolName}
Tool Arguments: ${JSON.stringify(failedAction.toolArgs, null, 2)}`;
  }

  prompt += `

INSTRUCTIONS FOR CORRECTION:
1. Analyze the error message and understand why the previous action failed
2. Consider alternative approaches or corrected parameters
3. Propose a revised action that addresses the root cause of the failure
4. If the error suggests the request cannot be fulfilled, explain why and suggest alternatives
5. Do not repeat the same action with identical parameters

Your next response should acknowledge the error and provide a corrected approach.`;

  return prompt;
}

/**
 * Builds correction prompt segment for user feedback errors
 */
function buildUserFeedbackCorrectionPrompt(errorContext: ErrorContext): string {
  const { userFeedback, previousAgentOutput } = errorContext;
  
  return `USER FEEDBACK INDICATES ERROR IN PREVIOUS RESPONSE - SELF-CORRECTION REQUIRED:

User Feedback: "${userFeedback}"

Previous Agent Response: "${previousAgentOutput?.substring(0, 500)}${previousAgentOutput && previousAgentOutput.length > 500 ? '...' : ''}"

INSTRUCTIONS FOR CORRECTION:
1. Carefully analyze the user's feedback to understand what went wrong
2. Identify the specific issue or error in your previous response
3. Provide a corrected version that addresses the user's concerns
4. Explain what was wrong and how you've fixed it
5. If you need clarification about the error, ask specific questions

Your next response should acknowledge the feedback and provide a corrected solution.`;
}

/**
 * Validates if a correction attempt should be limited to prevent infinite loops
 * This is a simple implementation that could be enhanced with more sophisticated tracking
 */
export function shouldLimitCorrectionAttempts(
  conversationHistory: AgentTurn[],
  maxAttemptsPerError: number = 3
): boolean {
  // Count recent correction attempts by looking for correction prompt patterns
  let correctionAttempts = 0;
  const recentTurns = conversationHistory.slice(-10); // Look at last 10 turns
  
  for (const turn of recentTurns) {
    if (turn && turn.role === 'assistant' && 
        (turn.content.includes('PREVIOUS ACTION FAILED') || 
         turn.content.includes('USER FEEDBACK INDICATES ERROR'))) {
      correctionAttempts++;
    }
  }
  
  return correctionAttempts >= maxAttemptsPerError;
} 