/**
 * Search API Service for vector search functionality
 * Implements P1-E3-S2: Client-side search API communication
 */

import { getApiKeys } from './apiKeyService.js';

export interface VectorSearchRequest {
  project_id: string;
  query_text: string;
  embedding_model_config: {
    service: 'openai_embedding' | 'jina_embedding' | 'cohere_embed';
    modelName?: string;
  };
  top_k?: number;
  // RFC-CTX-001: Explicit context support
  explicit_context_paths?: string[];
  pinned_item_ids?: string[];
  include_pinned?: boolean;
}

export interface VectorSearchResult {
  chunk_id: string;
  original_file_path: string;
  start_line: number;
  end_line?: number;
  score: number;
  text_snippet?: string;
  language?: string;
  metadata?: Record<string, any>;
}

export interface VectorSearchResponse {
  results: VectorSearchResult[];
  query_embedding_time_ms: number;
  vector_search_time_ms: number;
  total_time_ms: number;
}

export interface SearchApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    error: string;
    message: string;
    code?: string;
    details?: unknown;
    requestId?: string;
  };
  requestId?: string;
}

// Configuration
const WORKER_BASE_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

/**
 * Perform vector search for code snippets
 */
export async function performVectorSearch(
  request: VectorSearchRequest
): Promise<SearchApiResponse<VectorSearchResponse>> {
  const { embeddingKey } = getApiKeys();

  if (!embeddingKey) {
    return {
      success: false,
      error: {
        error: 'MissingApiKey',
        message: 'No embedding API key available. Please configure your API keys first.',
        code: 'MISSING_EMBEDDING_KEY'
      }
    };
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/search/vector_query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...request,
        user_api_keys: {
          embeddingKey
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result,
        requestId: result.requestId
      };
    }

    return {
      success: true,
      data: result,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('Vector search request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the search service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Parse @file and @folder tags from query text
 * Implements RFC-CTX-001: Explicit Context Management
 */
export function parseExplicitTags(queryText: string): {
  explicitPaths: string[];
  cleanedQuery: string;
} {
  // Regex to match @file or @folder tags: @path/to/file.js or @src/components/
  const tagRegex = /@([\w\/\.-]+)/g;
  const explicitPaths: string[] = [];
  let match;
  
  while ((match = tagRegex.exec(queryText)) !== null) {
    if (match[1]) {
      explicitPaths.push(match[1]);
    }
  }
  
  // Remove tags from query text for cleaner LLM input
  const cleanedQuery = queryText.replace(tagRegex, '').trim();
  
  return {
    explicitPaths: [...new Set(explicitPaths)], // Remove duplicates
    cleanedQuery
  };
}

/**
 * Perform context-aware vector search with explicit file/folder references
 * Automatically parses @tags from query and includes them in the request
 */
export async function performContextAwareVectorSearch(
  request: VectorSearchRequest & {
    auto_parse_tags?: boolean;
  }
): Promise<SearchApiResponse<VectorSearchResponse>> {
  const { auto_parse_tags = true, explicit_context_paths = [], ...baseRequest } = request;
  
  let explicitPaths: string[] = [...explicit_context_paths];
  let queryText = request.query_text;
  
  // Parse @tags if enabled and merge with existing paths
  if (auto_parse_tags) {
    const parsed = parseExplicitTags(request.query_text);
    explicitPaths = [...explicitPaths, ...parsed.explicitPaths];
    queryText = parsed.cleanedQuery;
  }
  
  // Remove duplicates
  explicitPaths = [...new Set(explicitPaths)];
  
  // Perform search with explicit context
  return performVectorSearch({
    ...baseRequest,
    query_text: queryText,
    explicit_context_paths: explicitPaths
  });
}

/**
 * Get available embedding models for search
 */
export function getAvailableEmbeddingModels(): Array<{
  service: 'openai_embedding' | 'jina_embedding' | 'cohere_embed';
  modelName?: string;
  displayName: string;
}> {
  return [
    {
      service: 'openai_embedding',
      modelName: 'text-embedding-ada-002',
      displayName: 'OpenAI Ada 002'
    },
    {
      service: 'openai_embedding',
      modelName: 'text-embedding-3-small',
      displayName: 'OpenAI Embedding 3 Small'
    },
    {
      service: 'openai_embedding',
      modelName: 'text-embedding-3-large',
      displayName: 'OpenAI Embedding 3 Large'
    },
    {
      service: 'jina_embedding',
      modelName: 'jina-embeddings-v2-base-en',
      displayName: 'Jina v2 Base EN'
    },
    {
      service: 'jina_embedding',
      modelName: 'jina-embeddings-v2-small-en',
      displayName: 'Jina v2 Small EN'
    },
    {
      service: 'cohere_embed',
      modelName: 'embed-english-v3.0',
      displayName: 'Cohere Embed English v3'
    }
  ];
} 