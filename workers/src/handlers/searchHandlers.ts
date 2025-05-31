/**
 * Search Handlers - API handlers for search operations
 * Implements RFC-RET-001: Basic Vector Search Retrieval (P1-E3-S1)
 */

import type { Context } from 'hono';
import type { Env, VectorSearchResponse } from '../types.js';
import { VectorSearchRequestSchema } from '../types.js';
import { performVectorSearch } from '../services/retrievalService.js';

/**
 * Handle vector query search requests
 * POST /api/search/vector_query
 * 
 * Implements RFC-RET-001: Basic Vector Search Retrieval
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
      top_k
    } = validationResult.data;

    console.log(`Processing vector query request`, {
      requestId,
      projectId: project_id,
      queryLength: query_text.length,
      embeddingService: embedding_model_config.service,
      topK: top_k
    });

    // Perform vector search
    const searchResult = await performVectorSearch(
      c.env,
      project_id,
      query_text,
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

    // Return successful results
    const response: VectorSearchResponse = {
      results: searchResult.results || [],
      query_embedding_time_ms: searchResult.timings.queryEmbeddingMs,
      vector_search_time_ms: searchResult.timings.vectorSearchMs,
      total_time_ms: searchResult.timings.totalMs
    };

    console.log(`Vector query completed successfully`, {
      requestId,
      projectId: project_id,
      resultCount: response.results.length,
      timings: searchResult.timings,
      topScore: response.results[0]?.score || 0
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