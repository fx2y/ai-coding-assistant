/**
 * Retrieval Service - Core logic for vector search and retrieval
 * Implements RFC-RET-001: Basic Vector Search Retrieval (P1-E3-S1)
 * Extended for P1-E3-S2: Result Hydration & Client Display
 * Extended for RFC-RET-002: LLM-based Re-ranking (P3-E2-S1)
 */

import type { Env, VectorSearchResult, EmbeddingModelConfig, CodeChunk, LlmRerankingConfig, RerankingResult, ChatCompletionRequest } from '../types.js';
import { getEmbeddingsViaProxy, isEmbeddingError, getChatCompletionViaProxy, isChatCompletionError } from '../lib/byokProxyClient.js';
import { queryVectorsForProject } from '../lib/vectorizeClient.js';

export interface VectorSearchServiceResult {
  results?: VectorSearchResult[];
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
  timings: {
    queryEmbeddingMs: number;
    vectorSearchMs: number;
    totalMs: number;
  };
}

/**
 * Perform vector search for a user query within a specific project
 * Extended for P1-E3-S2: Includes result hydration with chunk text from R2
 *
 * @param env - Cloudflare Worker environment bindings
 * @param projectId - Project ID to search within
 * @param queryText - User's natural language search query
 * @param userEmbeddingApiKey - User's embedding API key
 * @param embeddingModelConfig - Configuration for embedding model
 * @param topK - Number of results to return (default: 10)
 * @returns Promise resolving to hydrated search results or error
 */
export async function performVectorSearch(
  env: Env,
  projectId: string,
  queryText: string,
  userEmbeddingApiKey: string,
  embeddingModelConfig: EmbeddingModelConfig,
  topK: number = 10
): Promise<VectorSearchServiceResult> {
  const startTime = Date.now();
  let queryEmbeddingStartTime = 0;
  let vectorSearchStartTime = 0;
  let hydrationStartTime = 0;

  try {
    // Step 1: Generate query embedding
    console.log(`Starting vector search for project ${projectId}`, {
      queryText: queryText.substring(0, 100) + (queryText.length > 100 ? '...' : ''),
      embeddingService: embeddingModelConfig.service,
      model: embeddingModelConfig.modelName,
      topK
    });

    queryEmbeddingStartTime = Date.now();

    // Prepare embedding payload
    const embeddingPayload = {
      input: queryText,
      ...(embeddingModelConfig.modelName && { model: embeddingModelConfig.modelName })
    };

    // Get proxy URL from environment or construct relative URL
    const proxyUrl = (env.PROXY_WORKER_URL as string) || '/api/proxy/external';

    // Generate query embedding via BYOK proxy
    const embeddingResult = await getEmbeddingsViaProxy(
      fetch,
      embeddingModelConfig.service,
      userEmbeddingApiKey,
      embeddingPayload,
      proxyUrl
    );

    const queryEmbeddingTime = Date.now() - queryEmbeddingStartTime;

    // Check for embedding errors
    if (isEmbeddingError(embeddingResult)) {
      console.error(`Failed to generate query embedding for project ${projectId}:`, embeddingResult.error);
      return {
        error: {
          message: `Failed to generate query embedding: ${embeddingResult.error.message}`,
          code: 'EMBEDDING_GENERATION_FAILED',
          details: embeddingResult.error
        },
        timings: {
          queryEmbeddingMs: queryEmbeddingTime,
          vectorSearchMs: 0,
          totalMs: Date.now() - startTime
        }
      };
    }

    // Extract query vector from embedding response
    if (!embeddingResult.data || embeddingResult.data.length === 0) {
      console.error(`Empty embedding response for project ${projectId}`);
      return {
        error: {
          message: 'Empty embedding response from external service',
          code: 'EMPTY_EMBEDDING_RESPONSE'
        },
        timings: {
          queryEmbeddingMs: queryEmbeddingTime,
          vectorSearchMs: 0,
          totalMs: Date.now() - startTime
        }
      };
    }

    const queryVector = embeddingResult.data[0]?.embedding;
    if (!queryVector) {
      console.error(`Invalid embedding data structure for project ${projectId}`);
      return {
        error: {
          message: 'Invalid embedding data structure from external service',
          code: 'INVALID_EMBEDDING_DATA'
        },
        timings: {
          queryEmbeddingMs: queryEmbeddingTime,
          vectorSearchMs: 0,
          totalMs: Date.now() - startTime
        }
      };
    }

    console.log(`Query embedding generated successfully`, {
      projectId,
      embeddingDimensions: queryVector.length,
      model: embeddingResult.model,
      usage: embeddingResult.usage
    });

    // Step 2: Query Vectorize index
    vectorSearchStartTime = Date.now();

    try {
      const vectorizeResults = await queryVectorsForProject(
        env.VECTORIZE_INDEX,
        queryVector,
        projectId,
        topK
      );

      const vectorSearchTime = Date.now() - vectorSearchStartTime;

      console.log(`Vector search completed for project ${projectId}`, {
        matchCount: vectorizeResults.matches.length,
        topScore: vectorizeResults.matches[0]?.score || 0,
        searchTimeMs: vectorSearchTime
      });

      // Step 3: Hydrate results with chunk metadata and text content (P1-E3-S2)
      hydrationStartTime = Date.now();

      const hydrationPromises = vectorizeResults.matches.map(async (match) => {
        try {
          // Get chunk ID from match (stored as match.id or in metadata)
          const chunkId = match.id;
          if (!chunkId) {
            console.warn('Vector match missing chunk ID:', match);
            return null;
          }

          // Construct KV key for chunk metadata
          const chunkMetaKey = `project:${projectId}:chunk:${chunkId}`;

          // Fetch chunk metadata from KV
          let chunkMetaJson: string | null;
          try {
            chunkMetaJson = await env.METADATA_KV.get(chunkMetaKey);
          } catch (error) {
            console.warn(`Failed to fetch chunk metadata for chunkId: ${chunkId}:`, error);
            // KV call failed - filter out this result due to error
            return null;
          }

          if (chunkMetaJson === null) {
            console.warn(`Chunk metadata explicitly missing in KV for chunkId: ${chunkId}`);
            // Explicitly missing metadata - filter out this result
            return null;
          }

          if (!chunkMetaJson) {
            console.warn(`Chunk metadata unavailable in KV for chunkId: ${chunkId}`);
            // Metadata unavailable (undefined) - provide default result for graceful degradation
            const defaultResult: VectorSearchResult = {
              chunk_id: chunkId,
              original_file_path: 'unknown',
              start_line: 0,
              score: match.score,
              metadata: match.metadata || undefined
            };
            return defaultResult;
          }

          const chunkMeta = JSON.parse(chunkMetaJson) as CodeChunk;

          // Fetch chunk text from R2
          const chunkTextR2Object = await env.CODE_UPLOADS_BUCKET.get(chunkMeta.r2ChunkPath);
          if (!chunkTextR2Object) {
            console.warn(`Chunk text not found in R2 for path: ${chunkMeta.r2ChunkPath}`);
            return null;
          }

          const textSnippet = await chunkTextR2Object.text();

          // Construct hydrated result
          const hydratedResult: VectorSearchResult = {
            chunk_id: chunkMeta.id,
            original_file_path: chunkMeta.filePath,
            start_line: chunkMeta.startLine,
            end_line: chunkMeta.endLine,
            score: match.score,
            text_snippet: textSnippet,
            ...(match.metadata?.language && { language: match.metadata.language as string }),
            metadata: match.metadata || undefined
          };

          return hydratedResult;

        } catch (error) {
          console.error(`Failed to hydrate result for match ${match.id}:`, error);
          return null;
        }
      });

      // Execute hydration in parallel and filter out failed results
      const resolvedHydratedResults = (await Promise.all(hydrationPromises))
        .filter((result): result is VectorSearchResult => result !== null);

      const hydrationTime = Date.now() - hydrationStartTime;

      console.log(`Result hydration completed for project ${projectId}`, {
        originalMatchCount: vectorizeResults.matches.length,
        hydratedResultCount: resolvedHydratedResults.length,
        hydrationTimeMs: hydrationTime
      });

      return {
        results: resolvedHydratedResults,
        timings: {
          queryEmbeddingMs: queryEmbeddingTime,
          vectorSearchMs: vectorSearchTime,
          totalMs: Date.now() - startTime
        }
      };

    } catch (vectorizeError) {
      const vectorSearchTime = Date.now() - vectorSearchStartTime;
      const errorMessage = vectorizeError instanceof Error ? vectorizeError.message : 'Unknown Vectorize error';

      console.error(`Vectorize query failed for project ${projectId}:`, vectorizeError);

      return {
        error: {
          message: `Vector search failed: ${errorMessage}`,
          code: 'VECTORIZE_QUERY_FAILED',
          details: vectorizeError
        },
        timings: {
          queryEmbeddingMs: queryEmbeddingTime,
          vectorSearchMs: vectorSearchTime,
          totalMs: Date.now() - startTime
        }
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Vector search failed for project ${projectId}:`, error);

    return {
      error: {
        message: `Vector search failed: ${errorMessage}`,
        code: 'VECTOR_SEARCH_FAILED',
        details: error
      },
      timings: {
        queryEmbeddingMs: queryEmbeddingStartTime ? Date.now() - queryEmbeddingStartTime : 0,
        vectorSearchMs: vectorSearchStartTime ? Date.now() - vectorSearchStartTime : 0,
        totalMs: Date.now() - startTime
      }
    };
  }
}

/**
 * Re-rank search results using an LLM for improved relevance
 * Implements RFC-RET-002: Two-Stage Re-ranking (P3-E2-S1)
 *
 * @param env - Cloudflare Worker environment bindings
 * @param originalQuery - The original user search query
 * @param searchResults - Initial vector search results to re-rank
 * @param userLlmApiKey - User's LLM API key
 * @param rerankingConfig - Configuration for the re-ranking LLM
 * @returns Promise resolving to re-ranking result with reordered results or error
 */
export async function rerankSearchResultsWithLLM(
  env: Env,
  originalQuery: string,
  searchResults: VectorSearchResult[],
  userLlmApiKey: string,
  rerankingConfig: LlmRerankingConfig
): Promise<RerankingResult> {
  const startTime = Date.now();
  const maxResultsToRerank = rerankingConfig.maxResultsToRerank || 10;

  try {
    // Handle edge cases
    if (searchResults.length === 0) {
      console.log('No search results to re-rank');
      return {
        rerankedResults: [],
        originalResultCount: 0,
        rerankedResultCount: 0,
        llmCallTimeMs: 0,
        success: true
      };
    }

    if (searchResults.length < 2) {
      console.log('Insufficient results for re-ranking, returning original results');
      return {
        rerankedResults: searchResults,
        originalResultCount: searchResults.length,
        rerankedResultCount: searchResults.length,
        llmCallTimeMs: 0,
        success: true
      };
    }

    // Limit results sent to LLM for cost control
    const resultsToRerank = searchResults.slice(0, maxResultsToRerank);

    console.log(`Starting LLM re-ranking`, {
      originalQuery: originalQuery.substring(0, 100) + (originalQuery.length > 100 ? '...' : ''),
      originalResultCount: searchResults.length,
      resultsToRerankCount: resultsToRerank.length,
      llmService: rerankingConfig.service,
      model: rerankingConfig.modelName
    });

    // Construct prompt for LLM re-ranking
    const systemPrompt = `You are an expert relevance ranking assistant. Your task is to re-rank the provided search results based on their relevance to the original user query.

The user query is: "${originalQuery}"

You will be given a list of search results, each with an ID, file path, and a snippet of code/text.
Your output should be a JSON array containing ONLY the IDs of the search results, sorted from most relevant to least relevant.
Do not include explanations or any other text outside the JSON array.
Example Output: ["id3", "id1", "id2"]`;

    const userMessage = `Please re-rank the following search results for the query "${originalQuery}":

${resultsToRerank.map((result) => `
--- Search Result ID: ${result.chunk_id} ---
File: ${result.original_file_path}
Lines: ${result.start_line}-${result.end_line || result.start_line}
Snippet:
\`\`\`${result.language || ''}
${result.text_snippet || ''}
\`\`\`
--- End Result ID: ${result.chunk_id} ---
`).join('\n\n')}

Output a JSON array of the search result IDs, ordered from most relevant to least relevant.`;

    // Prepare chat completion request
    const chatRequest: ChatCompletionRequest = {
      model: rerankingConfig.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: rerankingConfig.temperature || 0.1,
      max_tokens: rerankingConfig.maxTokens || 500
    };

    // Get proxy URL from environment
    const proxyUrl = (env.PROXY_WORKER_URL as string) || '/api/proxy/external';

    // Call LLM via BYOK proxy
    const llmCallStartTime = Date.now();
    const llmResult = await getChatCompletionViaProxy(
      fetch,
      rerankingConfig.service,
      userLlmApiKey,
      chatRequest,
      proxyUrl
    );

    const llmCallTime = Date.now() - llmCallStartTime;

    // Check for LLM errors
    if (isChatCompletionError(llmResult)) {
      console.error(`LLM re-ranking failed:`, llmResult.error);
      return {
        rerankedResults: searchResults,
        originalResultCount: searchResults.length,
        rerankedResultCount: searchResults.length,
        llmCallTimeMs: llmCallTime,
        success: false,
        error: `LLM call failed: ${llmResult.error.message}`
      };
    }

    // Extract and parse LLM response
    const llmResponse = llmResult.choices?.[0]?.message?.content;
    if (!llmResponse) {
      console.error('Empty response from LLM for re-ranking');
      return {
        rerankedResults: searchResults,
        originalResultCount: searchResults.length,
        rerankedResultCount: searchResults.length,
        llmCallTimeMs: llmCallTime,
        success: false,
        error: 'Empty response from LLM'
      };
    }

    // Parse JSON response
    let rerankedIds: string[];
    try {
      rerankedIds = JSON.parse(llmResponse.trim());
    } catch (parseError) {
      console.error('Failed to parse LLM re-ranking response as JSON:', llmResponse);
      return {
        rerankedResults: searchResults,
        originalResultCount: searchResults.length,
        rerankedResultCount: searchResults.length,
        llmCallTimeMs: llmCallTime,
        success: false,
        error: 'Invalid JSON response from LLM'
      };
    }

    // Validate response format
    if (!Array.isArray(rerankedIds) || !rerankedIds.every(id => typeof id === 'string')) {
      console.error('LLM response is not an array of strings:', rerankedIds);
      return {
        rerankedResults: searchResults,
        originalResultCount: searchResults.length,
        rerankedResultCount: searchResults.length,
        llmCallTimeMs: llmCallTime,
        success: false,
        error: 'LLM response is not an array of strings'
      };
    }

    // Create lookup map for original results
    const resultMap = new Map<string, VectorSearchResult>();
    resultsToRerank.forEach(result => {
      resultMap.set(result.chunk_id, result);
    });

    // Validate that all returned IDs exist in original results
    const validIds = rerankedIds.filter(id => resultMap.has(id));
    if (validIds.length === 0) {
      console.error('No valid IDs returned by LLM:', rerankedIds);
      return {
        rerankedResults: searchResults,
        originalResultCount: searchResults.length,
        rerankedResultCount: searchResults.length,
        llmCallTimeMs: llmCallTime,
        success: false,
        error: 'No valid result IDs returned by LLM'
      };
    }

    // Re-order results based on LLM ranking
    const rerankedResults: VectorSearchResult[] = [];

    // Add results in LLM-specified order
    validIds.forEach(id => {
      const result = resultMap.get(id);
      if (result) {
        rerankedResults.push(result);
      }
    });

    // Add any results that weren't included in LLM response (maintain original order)
    resultsToRerank.forEach(result => {
      if (!validIds.includes(result.chunk_id)) {
        rerankedResults.push(result);
      }
    });

    // Add any remaining results that weren't sent to LLM (beyond maxResultsToRerank)
    if (searchResults.length > maxResultsToRerank) {
      rerankedResults.push(...searchResults.slice(maxResultsToRerank));
    }

    console.log(`LLM re-ranking completed successfully`, {
      originalResultCount: searchResults.length,
      rerankedResultCount: rerankedResults.length,
      validIdsCount: validIds.length,
      llmCallTimeMs: llmCallTime,
      totalTimeMs: Date.now() - startTime
    });

    return {
      rerankedResults,
      originalResultCount: searchResults.length,
      rerankedResultCount: rerankedResults.length,
      llmCallTimeMs: llmCallTime,
      success: true
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Unexpected error during LLM re-ranking:`, error);

    return {
      rerankedResults: searchResults,
      originalResultCount: searchResults.length,
      rerankedResultCount: searchResults.length,
      llmCallTimeMs: Date.now() - startTime,
      success: false,
      error: `Unexpected error: ${errorMessage}`
    };
  }
}