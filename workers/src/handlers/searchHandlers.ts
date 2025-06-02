/**
 * Search Handlers - API handlers for search operations
 * Implements RFC-RET-001: Basic Vector Search Retrieval (P1-E3-S1)
 * Implements RFC-CTX-001: Explicit Context Management
 * Implements RFC-CTX-002: Implicit Context Integration
 * Implements RFC-RET-002: LLM-based Re-ranking (P3-E2-S1)
 */

import type { Context } from 'hono';
import type { Env, VectorSearchResponse } from '../types.js';
import { VectorSearchRequestSchema } from '../types.js';
import { performVectorSearch, rerankSearchResultsWithLLM } from '../services/retrievalService.js';
import { buildPromptContext, parseExplicitTags } from '../services/contextBuilderService.js';

/**
 * Handle vector query search requests with explicit and implicit context support
 * POST /api/search/vector_query
 *
 * Implements RFC-RET-001: Basic Vector Search Retrieval
 * Implements RFC-CTX-001: Explicit Context Management
 * Implements RFC-CTX-002: Implicit Context Integration
 */
export async function handleVectorQuery(c: Context<{ Bindings: Env; Variables: { requestId: string } }>): Promise<Response> {
  const requestId = c.get('requestId');

  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validationResult = VectorSearchRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error(`Vector query validation failed`, {
        requestId,
        errors: validationResult.error.errors,
        body: JSON.stringify(body, null, 2)
      });

      return c.json({
        error: 'ValidationError',
        message: 'Invalid request body',
        details: validationResult.error.errors,
        requestId
      }, 400);
    }

    const {
      project_id,
      query_text,
      user_api_keys,
      embedding_model_config,
      top_k,
      explicit_context_paths = [],
      pinned_item_ids = [],
      include_pinned = true,
      implicit_context,
      enable_reranking = false,
      reranking_config
    } = validationResult.data;

    console.log(`Processing vector query request with explicit and implicit context`, {
      requestId,
      projectId: project_id,
      queryLength: query_text.length,
      embeddingService: embedding_model_config.service,
      topK: top_k,
      explicitPaths: explicit_context_paths,
      pinnedItemIds: pinned_item_ids,
      includePinned: include_pinned,
      implicitContext: implicit_context?.last_focused_file_path || 'none',
      enableReranking: enable_reranking,
      rerankingService: reranking_config?.service || 'none'
    });

    // Validate re-ranking configuration if enabled
    if (enable_reranking) {
      if (!reranking_config) {
        return c.json({
          error: 'ValidationError',
          message: 'Re-ranking configuration is required when enable_reranking is true',
          requestId
        }, 400);
      }

      if (!user_api_keys.llmKey) {
        return c.json({
          error: 'ValidationError',
          message: 'LLM API key is required for re-ranking',
          requestId
        }, 400);
      }
    }

    // Parse @tags from query if explicit_context_paths is empty
    let finalExplicitPaths = explicit_context_paths;
    let finalQueryText = query_text;

    if (explicit_context_paths.length === 0) {
      const parsed = parseExplicitTags(query_text);
      finalExplicitPaths = parsed.explicitPaths;
      finalQueryText = parsed.cleanedQuery || query_text; // Keep original if cleaned is empty
    }

    // Perform vector search
    const searchResult = await performVectorSearch(
      c.env,
      project_id,
      finalQueryText,
      user_api_keys.embeddingKey,
      embedding_model_config,
      top_k
    );

    // Handle service errors
    if (searchResult.error) {
      console.error(`Vector search service error`, {
        requestId,
        projectId: project_id,
        error: searchResult.error,
        timings: searchResult.timings
      });

      const statusCode = searchResult.error.code === 'EMBEDDING_GENERATION_FAILED' ? 502 : 500;

      return c.json({
        error: searchResult.error.code || 'VectorSearchError',
        message: searchResult.error.message,
        details: searchResult.error.details,
        timings: searchResult.timings,
        requestId
      }, statusCode);
    }

    // Step 2: Optional LLM Re-ranking (RFC-RET-002)
    let finalResults = searchResult.results || [];
    let rerankingInfo = undefined;

    if (enable_reranking && reranking_config && user_api_keys.llmKey && finalResults.length > 1) {
      console.log(`Starting LLM re-ranking for project ${project_id}`, {
        requestId,
        originalResultCount: finalResults.length,
        rerankingService: reranking_config.service,
        model: reranking_config.modelName
      });

      try {
        const rerankingResult = await rerankSearchResultsWithLLM(
          c.env,
          finalQueryText,
          finalResults,
          user_api_keys.llmKey,
          reranking_config
        );

        if (rerankingResult.success) {
          finalResults = rerankingResult.rerankedResults;
          rerankingInfo = {
            enabled: true,
            success: true,
            original_count: rerankingResult.originalResultCount,
            reranked_count: rerankingResult.rerankedResultCount,
            llm_call_time_ms: rerankingResult.llmCallTimeMs
          };

          console.log(`LLM re-ranking completed successfully`, {
            requestId,
            projectId: project_id,
            originalCount: rerankingResult.originalResultCount,
            rerankedCount: rerankingResult.rerankedResultCount,
            llmCallTimeMs: rerankingResult.llmCallTimeMs
          });
        } else {
          rerankingInfo = {
            enabled: true,
            success: false,
            error: rerankingResult.error,
            llm_call_time_ms: rerankingResult.llmCallTimeMs
          };

          console.warn(`LLM re-ranking failed, using original results`, {
            requestId,
            projectId: project_id,
            error: rerankingResult.error,
            llmCallTimeMs: rerankingResult.llmCallTimeMs
          });
        }
      } catch (rerankingError) {
        const errorMessage = rerankingError instanceof Error ? rerankingError.message : 'Unknown re-ranking error';
        rerankingInfo = {
          enabled: true,
          success: false,
          error: `Re-ranking failed: ${errorMessage}`
        };

        console.error(`Unexpected error during re-ranking`, {
          requestId,
          projectId: project_id,
          error: errorMessage
        });
      }
    } else if (enable_reranking) {
      rerankingInfo = {
        enabled: true,
        success: false,
        error: 'Re-ranking skipped: insufficient results or missing configuration'
      };
    }

    // Build context if requested (explicit, pinned, or implicit)
    let contextInfo = undefined;
    if (finalExplicitPaths.length > 0 || include_pinned || implicit_context?.last_focused_file_path) {
      try {
        const contextOptions: any = {
          explicitPaths: finalExplicitPaths,
          pinnedItemIds: pinned_item_ids,
          includePinned: include_pinned,
          vectorSearchResults: finalResults
        };

        if (implicit_context?.last_focused_file_path) {
          contextOptions.implicitContext = {
            last_focused_file_path: implicit_context.last_focused_file_path
          };
        }

        const contextResult = await buildPromptContext(c.env, project_id, contextOptions);

        contextInfo = {
          context_string: contextResult.contextString,
          included_sources: contextResult.includedSources,
          total_characters: contextResult.totalCharacters
        };

        console.log(`Built context with implicit support`, {
          requestId,
          projectId: project_id,
          sourcesCount: contextResult.includedSources.length,
          totalCharacters: contextResult.totalCharacters,
          hasImplicitContext: !!implicit_context?.last_focused_file_path
        });
      } catch (contextError) {
        console.error(`Failed to build context`, {
          requestId,
          projectId: project_id,
          error: contextError instanceof Error ? contextError.message : 'Unknown error'
        });
        // Continue without context rather than failing the entire request
      }
    }

    // Return successful results with optional context and re-ranking info
    const response: VectorSearchResponse & { context?: any; reranking?: any } = {
      results: finalResults,
      query_embedding_time_ms: searchResult.timings.queryEmbeddingMs,
      vector_search_time_ms: searchResult.timings.vectorSearchMs,
      total_time_ms: searchResult.timings.totalMs,
      ...(contextInfo && { context: contextInfo }),
      ...(rerankingInfo && { reranking: rerankingInfo })
    };

    console.log(`Vector query completed successfully`, {
      requestId,
      projectId: project_id,
      resultCount: response.results.length,
      timings: searchResult.timings,
      topScore: response.results[0]?.score || 0,
      hasContext: !!contextInfo,
      hasReranking: !!rerankingInfo
    });

    return c.json(response);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Unexpected error in vector query handler`, {
      requestId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    return c.json({
      error: 'InternalServerError',
      message: 'An unexpected error occurred during vector search',
      details: errorMessage,
      requestId
    }, 500);
  }
}