/**
 * Context Management Handlers
 * Implements RFC-CTX-003: Dynamic Context Window Management
 */

import type { Context } from 'hono';
import type { Env } from '../types.js';
import { z } from 'zod';
import { buildManagedPromptContext } from '../services/contextBuilderService.js';
import { getModelConfig } from '../lib/tokenizer.js';

// Schema for managed context demo request
const ManagedContextDemoSchema = z.object({
  project_id: z.string().uuid(),
  user_query: z.string().min(1),
  model_name: z.string().optional().default('gpt-4'),
  explicit_context_paths: z.array(z.string()).optional().default([]),
  pinned_item_ids: z.array(z.string()).optional().default([]),
  implicit_context: z.object({
    last_focused_file_path: z.string().optional()
  }).optional().default({}),
  include_mock_vector_results: z.boolean().optional().default(false),
  include_mock_conversation: z.boolean().optional().default(false)
});

type ManagedContextDemoRequest = z.infer<typeof ManagedContextDemoSchema>;

/**
 * Demo endpoint for managed context assembly
 * Shows how the token-aware context building works
 */
export async function handleManagedContextDemo(
  c: Context<{ Bindings: Env; Variables: { requestId: string } }>
): Promise<Response> {
  const requestId = c.get('requestId');

  try {
    const body = await c.req.json();
    const validatedRequest = ManagedContextDemoSchema.parse(body);

    const {
      project_id,
      user_query,
      model_name,
      explicit_context_paths,
      pinned_item_ids,
      implicit_context,
      include_mock_vector_results,
      include_mock_conversation
    } = validatedRequest;

    console.log(`[ContextDemo] Processing managed context demo`, {
      requestId,
      projectId: project_id,
      modelName: model_name,
      userQuery: user_query.substring(0, 100) + (user_query.length > 100 ? '...' : ''),
      explicitPathsCount: explicit_context_paths.length,
      pinnedItemsCount: pinned_item_ids.length
    });

    // Get model configuration
    const llmConfig = getModelConfig(model_name);

    // Create mock vector search results if requested
    const mockVectorResults = include_mock_vector_results ? [
      {
        chunk_id: 'demo-chunk-1',
        original_file_path: 'src/auth/jwt.js',
        start_line: 15,
        end_line: 25,
        score: 0.92,
        text_snippet: `function validateJWT(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { valid: true, user: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}`
      },
      {
        chunk_id: 'demo-chunk-2',
        original_file_path: 'src/middleware/auth.js',
        start_line: 8,
        end_line: 18,
        score: 0.87,
        text_snippet: `const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const validation = validateJWT(token);
  if (!validation.valid) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = validation.user;
  next();
};`
      }
    ] : [];

    // Create mock conversation history if requested
    const mockConversation = include_mock_conversation ? [
      {
        role: 'user' as const,
        content: 'How does JWT authentication work in this codebase?',
        timestamp: '2024-01-01T10:00:00Z'
      },
      {
        role: 'assistant' as const,
        content: 'JWT authentication in this codebase uses a middleware pattern. The auth middleware extracts the token from the Authorization header, validates it using the validateJWT function, and attaches the user information to the request object.',
        timestamp: '2024-01-01T10:01:00Z'
      },
      {
        role: 'user' as const,
        content: 'What happens if the token is invalid?',
        timestamp: '2024-01-01T10:02:00Z'
      },
      {
        role: 'assistant' as const,
        content: 'If the token is invalid, the middleware returns a 401 Unauthorized response with an error message. The validateJWT function catches any JWT verification errors and returns a validation object with valid: false and the error details.',
        timestamp: '2024-01-01T10:03:00Z'
      }
    ] : [];

    // Build managed context
    const implicitContextParam: { last_focused_file_path?: string } =
      implicit_context.last_focused_file_path
        ? { last_focused_file_path: implicit_context.last_focused_file_path }
        : {};

    const contextResult = await buildManagedPromptContext(
      c.env,
      project_id,
      user_query,
      explicit_context_paths,
      pinned_item_ids,
      implicitContextParam,
      mockVectorResults,
      mockConversation,
      llmConfig
    );

    // Calculate context statistics
    const stats = {
      model_config: {
        model_name: llmConfig.modelName,
        token_limit: llmConfig.tokenLimit,
        reserved_output_tokens: llmConfig.reservedOutputTokens,
        available_prompt_tokens: llmConfig.tokenLimit - llmConfig.reservedOutputTokens,
        provider: llmConfig.provider
      },
      context_assembly: {
        final_prompt_length: contextResult.finalPrompt.length,
        used_tokens: contextResult.usedTokens,
        token_utilization_percent: Math.round((contextResult.usedTokens / (llmConfig.tokenLimit - llmConfig.reservedOutputTokens)) * 100),
        token_count_method: contextResult.tokenCountMethod,
        token_count_confidence: contextResult.tokenCountConfidence
      },
      sources: {
        total_sources_included: contextResult.includedSources.length,
        included_sources: contextResult.includedSources,
        warnings_count: contextResult.warnings.length,
        warnings: contextResult.warnings
      }
    };

    console.log(`[ContextDemo] Managed context assembled successfully`, {
      requestId,
      projectId: project_id,
      usedTokens: contextResult.usedTokens,
      availableTokens: llmConfig.tokenLimit - llmConfig.reservedOutputTokens,
      utilizationPercent: stats.context_assembly.token_utilization_percent,
      sourcesIncluded: contextResult.includedSources.length,
      warningsCount: contextResult.warnings.length
    });

    return c.json({
      success: true,
      data: {
        final_prompt: contextResult.finalPrompt,
        statistics: stats,
        debug_info: {
          request_id: requestId,
          processing_timestamp: new Date().toISOString(),
          mock_data_included: {
            vector_results: include_mock_vector_results,
            conversation_history: include_mock_conversation
          }
        }
      }
    });

  } catch (error) {
    console.error(`[ContextDemo] Error in managed context demo`, {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: {
          message: 'Invalid request format',
          details: error.errors,
          requestId
        }
      }, 400);
    }

    return c.json({
      success: false,
      error: {
        message: 'Failed to build managed context',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }
    }, 500);
  }
}

/**
 * Get token counting information for a given text and model
 */
export async function handleTokenCountDemo(
  c: Context<{ Bindings: Env; Variables: { requestId: string } }>
): Promise<Response> {
  const requestId = c.get('requestId');

  try {
    const { text, model_name = 'gpt-4' } = await c.req.json();

    if (!text || typeof text !== 'string') {
      return c.json({
        success: false,
        error: {
          message: 'Text is required and must be a string',
          requestId
        }
      }, 400);
    }

    const { countTokens } = await import('../lib/tokenizer.js');
    const llmConfig = getModelConfig(model_name);
    const tokenResult = await countTokens(text, llmConfig);

    return c.json({
      success: true,
      data: {
        text_length: text.length,
        token_count: tokenResult.tokenCount,
        token_count_method: tokenResult.method,
        confidence: tokenResult.confidence,
        model_config: {
          model_name: llmConfig.modelName,
          provider: llmConfig.provider,
          token_limit: llmConfig.tokenLimit,
          encoding: llmConfig.encoding
        },
        statistics: {
          chars_per_token: Math.round((text.length / tokenResult.tokenCount) * 100) / 100,
          tokens_per_100_chars: Math.round((tokenResult.tokenCount / text.length * 100) * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error(`[TokenCountDemo] Error in token count demo`, {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return c.json({
      success: false,
      error: {
        message: 'Failed to count tokens',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }
    }, 500);
  }
}