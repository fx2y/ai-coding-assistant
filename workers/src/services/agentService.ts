/**
 * Agent Service - ReAct Agent Core Loop Implementation
 * Implements RFC-AGT-001: ReAct Agent Core Loop
 * Implements RFC-AGT-004: Structured Prompting & Agent Control
 * Implements RFC-AGT-005: Agent Self-Correction Loop for Errors
 * Implements RFC-MOD-001: User-Configurable Model Routing
 */

import type {
  Env,
  ValidatedReactStepRequest,
  ReactStepResponse,
  AgentTurn,
  ActionDetails,
  ChatMessage,
  ChatCompletionRequest,
  VectorSearchResult
} from '../types.js';
import { buildManagedPromptContext } from './contextBuilderService.js';
import { getChatCompletionViaProxy, isChatCompletionError } from '../lib/byokProxyClient.js';
import { getModelConfig } from '../lib/tokenizer.js';
import { getModelConfigForTask } from './configService.js';
import { 
  analyzeSelfCorrectionTrigger, 
  shouldLimitCorrectionAttempts 
} from './selfCorrectionService.js';

/**
 * Performs a single ReAct step: Reason (LLM generates thought + action)
 * Implements RFC-AGT-001, RFC-AGT-004, RFC-AGT-005, and RFC-MOD-001
 */
export async function performReActStep(
  env: Env,
  requestPayload: ValidatedReactStepRequest
): Promise<ReactStepResponse> {
  const startTime = Date.now();

  try {
    console.log(`[AgentService] Starting ReAct step for session ${requestPayload.session_id}`, {
      projectId: requestPayload.project_id,
      userQuery: requestPayload.user_query.substring(0, 100) + '...',
      historyLength: requestPayload.conversation_history.length,
      iterationsLeft: requestPayload.max_iterations_left
    });

    // RFC-AGT-005: Analyze if self-correction should be triggered
    const selfCorrectionContext = analyzeSelfCorrectionTrigger(
      requestPayload.conversation_history as AgentTurn[],
      requestPayload.user_query
    );

    // Check if we should limit correction attempts to prevent infinite loops
    if (selfCorrectionContext.shouldTriggerCorrection) {
      const shouldLimit = shouldLimitCorrectionAttempts(
        requestPayload.conversation_history as AgentTurn[],
        3 // Maximum 3 correction attempts per error
      );

      if (shouldLimit) {
        console.warn(`[AgentService] Limiting correction attempts to prevent infinite loop`, {
          sessionId: requestPayload.session_id,
          errorType: selfCorrectionContext.errorContext?.type
        });

        // Return a direct response indicating the agent is stuck
        const stuckResponse = "I've attempted to correct this error multiple times but haven't been successful. Let me try a different approach or ask for your guidance on how to proceed.";
        
        const assistantTurn: AgentTurn = {
          role: 'assistant',
          content: stuckResponse,
          timestamp: new Date().toISOString()
        };

        const updatedHistory = [...(requestPayload.conversation_history as AgentTurn[]), assistantTurn];

        return {
          session_id: requestPayload.session_id,
          thought: '',
          action_details: null,
          direct_response: stuckResponse,
          updated_conversation_history: updatedHistory,
          iterations_remaining: requestPayload.max_iterations_left - 1,
          status: 'direct_response_provided'
        };
      }

      console.log(`[AgentService] Self-correction triggered`, {
        sessionId: requestPayload.session_id,
        errorType: selfCorrectionContext.errorContext?.type,
        errorMessage: selfCorrectionContext.errorContext?.errorMessage?.substring(0, 100)
      });
    }

    // 1. Get model configuration for agent reasoning task (RFC-MOD-001)
    const modelConfig = await getModelConfigForTask(env, requestPayload.project_id, 'agent_reasoning');
    
    // Use configured model instead of the one passed in the request
    const llmConfig = getModelConfig(modelConfig.modelName);

    // Override with user-provided config for token limits
    llmConfig.tokenLimit = requestPayload.llm_config.tokenLimit;
    llmConfig.reservedOutputTokens = requestPayload.llm_config.reservedOutputTokens;

    console.log(`[AgentService] Using model configuration for agent reasoning:`, {
      service: modelConfig.service,
      modelName: modelConfig.modelName
    });

    const systemPrompt = buildReActSystemPrompt(requestPayload.available_tools_prompt_segment);

    // Prepare implicit context with proper typing
    const implicitContext: { last_focused_file_path?: string } = {};
    if (requestPayload.implicit_context?.last_focused_file_path) {
      implicitContext.last_focused_file_path = requestPayload.implicit_context.last_focused_file_path;
    }

    // Fix vector search results type compatibility
    const vectorSearchResults: VectorSearchResult[] = (requestPayload.vector_search_results_to_include || []).map(result => ({
      chunk_id: result.chunk_id,
      original_file_path: result.original_file_path,
      start_line: result.start_line,
      end_line: result.end_line ?? 0, // Provide default value for required field
      score: result.score,
      ...(result.text_snippet !== undefined && { text_snippet: result.text_snippet }),
      ...(result.language !== undefined && { language: result.language }),
      ...(result.metadata !== undefined && { metadata: result.metadata })
    }));

    // RFC-AGT-005: Modify user query to include self-correction context if needed
    let enhancedUserQuery = requestPayload.user_query;
    if (selfCorrectionContext.shouldTriggerCorrection && selfCorrectionContext.correctionPromptSegment) {
      enhancedUserQuery = `${selfCorrectionContext.correctionPromptSegment}\n\nOriginal User Query: ${requestPayload.user_query}`;
      
      console.log(`[AgentService] Enhanced user query with self-correction context`, {
        sessionId: requestPayload.session_id,
        originalQueryLength: requestPayload.user_query.length,
        enhancedQueryLength: enhancedUserQuery.length
      });
    }

    const contextResult = await buildManagedPromptContext(
      env,
      requestPayload.project_id,
      enhancedUserQuery,
      requestPayload.explicit_context_paths || [],
      requestPayload.pinned_item_ids_to_include || [],
      implicitContext,
      vectorSearchResults,
      requestPayload.conversation_history as AgentTurn[],
      llmConfig
    );

    console.log(`[AgentService] Context built`, {
      usedTokens: contextResult.usedTokens,
      includedSources: contextResult.includedSources.length,
      warnings: contextResult.warnings,
      selfCorrectionTriggered: selfCorrectionContext.shouldTriggerCorrection
    });

    // 2. Prepare messages for LLM
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

    // 3. Call LLM via BYOK Proxy using configured model
    const chatRequest: ChatCompletionRequest = {
      model: modelConfig.modelName,
      messages,
      temperature: requestPayload.llm_config.temperature || 0.2,
      max_tokens: requestPayload.llm_config.reservedOutputTokens
    };

    const proxyUrl = '/api/proxy/external'; // Internal worker call

    const llmResult = await getChatCompletionViaProxy(
      fetch,
      modelConfig.service,
      requestPayload.user_api_keys.llmKey,
      chatRequest,
      proxyUrl
    );

    if (isChatCompletionError(llmResult)) {
      console.error(`[AgentService] LLM call failed:`, llmResult.error);
      return {
        session_id: requestPayload.session_id,
        thought: '',
        action_details: null,
        direct_response: null,
        updated_conversation_history: requestPayload.conversation_history as AgentTurn[],
        iterations_remaining: requestPayload.max_iterations_left,
        status: 'error'
      };
    }

    // 4. Parse LLM Response
    const firstChoice = llmResult.choices[0];
    if (!firstChoice?.message?.content) {
      console.error(`[AgentService] No valid response from LLM`);
      return {
        session_id: requestPayload.session_id,
        thought: 'No response received from LLM',
        action_details: null,
        direct_response: null,
        updated_conversation_history: requestPayload.conversation_history as AgentTurn[],
        iterations_remaining: requestPayload.max_iterations_left,
        status: 'error'
      };
    }

    const llmResponseText = firstChoice.message.content;
    console.log(`[AgentService] LLM response received`, {
      responseLength: llmResponseText.length,
      model: llmResult.model,
      usage: llmResult.usage,
      selfCorrectionTriggered: selfCorrectionContext.shouldTriggerCorrection
    });

    const parseResult = parseReActResponse(llmResponseText);

    // 5. Update Conversation History
    const newTurns: AgentTurn[] = [];

    // Add the user query as a turn if it's not empty (use original query, not enhanced)
    if (requestPayload.user_query.trim()) {
      newTurns.push({
        role: 'user',
        content: requestPayload.user_query,
        timestamp: new Date().toISOString()
      });
    }

    // Add the assistant's thought and action/response
    if (parseResult.action_details) {
      // Agent proposed an action
      const assistantTurn: AgentTurn = {
        role: 'assistant',
        content: parseResult.thought,
        toolCall: {
          name: parseResult.action_details.tool_name,
          parameters: parseResult.action_details.tool_args
        },
        timestamp: new Date().toISOString()
      };
      newTurns.push(assistantTurn);
    } else {
      // Agent provided a direct response
      const assistantTurn: AgentTurn = {
        role: 'assistant',
        content: parseResult.thought + (parseResult.direct_response ? '\n\n' + parseResult.direct_response : ''),
        timestamp: new Date().toISOString()
      };
      newTurns.push(assistantTurn);
    }

    const updatedHistory = [...(requestPayload.conversation_history as AgentTurn[]), ...newTurns];

    // 6. Prepare and Return Response
    const response: ReactStepResponse = {
      session_id: requestPayload.session_id,
      thought: parseResult.thought,
      action_details: parseResult.action_details,
      direct_response: parseResult.direct_response,
      updated_conversation_history: updatedHistory,
      iterations_remaining: Math.max(0, requestPayload.max_iterations_left - 1),
      status: parseResult.action_details ? 'action_proposed' : 'direct_response_provided'
    };

    const duration = Date.now() - startTime;
    console.log(`[AgentService] ReAct step completed in ${duration}ms`, {
      status: response.status,
      hasAction: !!response.action_details,
      iterationsRemaining: response.iterations_remaining
    });

    return response;

  } catch (error) {
    console.error(`[AgentService] ReAct step failed:`, error);

    return {
      session_id: requestPayload.session_id,
      thought: '',
      action_details: null,
      direct_response: null,
      updated_conversation_history: requestPayload.conversation_history as AgentTurn[],
      iterations_remaining: requestPayload.max_iterations_left,
      status: 'error'
    };
  }
}

/**
 * Build ReAct system prompt with available tools
 */
export function buildReActSystemPrompt(availableToolsPromptSegment: string): string {
  return `You are a helpful AI coding assistant that uses a Reason-Act approach.

For each user request, you should:
1. Think through the problem step by step (Thought)
2. Either take an action using available tools OR provide a direct answer

${availableToolsPromptSegment}

Format your response as follows:

If you need to use a tool:
Thought: [Your reasoning process here]
Action: tool_name(param1="value1", param2="value2")

If you can answer directly:
Thought: [Your reasoning process here]
[Your direct answer to the user here]

Guidelines:
- Always start with "Thought:" to explain your reasoning
- Use tools when you need to search code, read files, or gather more information
- Provide direct answers when you have sufficient context
- Be concise but thorough in your explanations
- If you're unsure, use tools to gather more information rather than guessing`;
}

/**
 * Parse the LLM's ReAct response to extract thought, action, or direct response
 */
function parseReActResponse(llmResponse: string): {
  thought: string;
  action_details: ActionDetails | null;
  direct_response: string | null;
} {
  let thought = '';
  let actionDetails: ActionDetails | null = null;
  let directResponse: string | null = null;

  // Extract thought
  const thoughtMatch = llmResponse.match(/^Thought:\s*(.+?)(?=\nAction:|$)/ms);
  if (thoughtMatch && thoughtMatch[1]) {
    thought = thoughtMatch[1].trim();
  }

  // Try to extract action
  const actionMatch = llmResponse.match(/^Action:\s*(\w+)\((.*?)\)\s*$/m);
  if (actionMatch && actionMatch[1] && actionMatch[2] !== undefined) {
    const toolName = actionMatch[1];
    const argsString = actionMatch[2];

    try {
      // Parse arguments - simple key=value parser
      const toolArgs = parseActionArguments(argsString);

      actionDetails = {
        tool_name: toolName,
        tool_args: toolArgs,
        raw_action_string: actionMatch[0]
      };
    } catch (error) {
      console.warn(`[AgentService] Failed to parse action arguments: ${argsString}`, error);
      // Treat as malformed action, fall back to direct response
    }
  }

  // If no action found, treat the rest as direct response
  if (!actionDetails) {
    // Remove the thought part and use the rest as direct response
    const thoughtIndex = llmResponse.indexOf('Thought:');
    if (thoughtIndex !== -1) {
      const thoughtEndIndex = thoughtIndex + 'Thought:'.length + thought.length;
      const remainingText = llmResponse.substring(thoughtEndIndex).trim();

      if (remainingText && !remainingText.startsWith('Action:')) {
        directResponse = remainingText;
      }
    }
  }

  return {
    thought: thought || 'No clear thought provided',
    action_details: actionDetails,
    direct_response: directResponse
  };
}

/**
 * Parse action arguments from string format like: param1="value1", param2="value2"
 */
function parseActionArguments(argsString: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  if (!argsString.trim()) {
    return args;
  }

  // Simple regex to match key="value" or key='value' patterns
  const argRegex = /(\w+)\s*=\s*["']([^"']*?)["']/g;
  let match;

  while ((match = argRegex.exec(argsString)) !== null) {
    const key = match[1];
    const value = match[2];

    if (!key || value === undefined) {
      continue;
    }

    // Try to parse as number or boolean, otherwise keep as string
    if (value === 'true') {
      args[key] = true;
    } else if (value === 'false') {
      args[key] = false;
    } else if (/^\d+$/.test(value)) {
      args[key] = parseInt(value, 10);
    } else if (/^\d+\.\d+$/.test(value)) {
      args[key] = parseFloat(value);
    } else {
      args[key] = value;
    }
  }

  return args;
}

/**
 * Determine target service based on model name
 */
export function determineTargetService(modelName: string): 'openai_chat' | 'anthropic_claude' {
  if (modelName.startsWith('gpt-') || modelName.includes('openai')) {
    return 'openai_chat';
  } else if (modelName.startsWith('claude-') || modelName.includes('anthropic')) {
    return 'anthropic_claude';
  }

  // Default to OpenAI for unknown models
  return 'openai_chat';
}