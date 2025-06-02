/**
 * Shared TypeScript types for AI Coding Assistant Workers
 * Implements RFC-SEC-001, RFC-API-001
 */

import { z } from 'zod';

// Environment bindings for Cloudflare Workers
export interface Env {
  ENVIRONMENT: string;
  // R2 bucket for code uploads (P1-E1-S1)
  CODE_UPLOADS_BUCKET: R2Bucket;
  // KV namespace for chunk metadata (P1-E1-S2)
  METADATA_KV: KVNamespace;
  // Vectorize bindings will be added here when needed
  // Vectorize index for code embeddings (P1-E2-S2)
  VECTORIZE_INDEX: VectorizeIndex;
  [key: string]: unknown;
}

// API Error structure for consistent error responses
export interface ApiError {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

// Project-related types (RFC-CORE-001)
export interface Project {
  id: string;
  name: string;
  userId: string;
  r2BucketPath: string;
  kvPrefix: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodeChunk {
  id: string;
  projectId: string;
  filePath: string;
  r2ChunkPath: string;
  startLine: number;
  endLine: number;
  embeddingId?: string;
  content?: string;
}

// Agent conversation types (RFC-AGT-001)
export type AgentRole = 'user' | 'assistant' | 'tool_observation';

export interface AgentTurn {
  role: AgentRole;
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: string;
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  result: unknown;
  error?: string;
}

// External API Proxy types (RFC-SEC-001, P0-E1-S2)
export type SupportedExternalService =
  | 'openai_chat'
  | 'openai_embedding'
  | 'anthropic_claude'
  | 'jina_embedding'
  | 'cohere_generate'
  | 'cohere_embed';

// Zod schema for external API proxy request validation
export const ExternalApiProxyRequestSchema = z.object({
  target_service: z.enum([
    'openai_chat',
    'openai_embedding',
    'anthropic_claude',
    'jina_embedding',
    'cohere_generate',
    'cohere_embed'
  ]),
  api_key: z.string().min(1, 'API key is required'),
  payload: z.record(z.unknown()) // Service-specific payload as generic object
});

export type ExternalApiProxyRequest = z.infer<typeof ExternalApiProxyRequestSchema>;

// External service configuration for proxy routing
export interface ExternalServiceConfig {
  baseUrl: string;
  authHeader: 'Authorization' | 'x-api-key' | 'api-key';
  authPrefix?: string; // e.g., 'Bearer ' for OpenAI
  defaultHeaders?: Record<string, string>;
}

// Vector query types (RFC-IDX-001)
export const VectorQuerySchema = z.object({
  query: z.string().min(1),
  projectId: z.string().uuid(),
  topK: z.number().int().min(1).max(50).optional().default(10),
  filters: z.record(z.unknown()).optional()
});

export type VectorQuery = z.infer<typeof VectorQuerySchema>;

// Project upload types (P1-E1-S1)
export interface ProjectUploadResponse {
  project_id: string;
  uploaded_files_count: number;
  uploaded_file_paths: string[];
  errors: Array<{
    path: string;
    error: string;
  }>;
}

export interface UploadedFile {
  path: string;
  r2Key: string;
}

export interface ProcessZipResult {
  uploadedFiles: UploadedFile[];
  errors: Array<{
    path: string;
    error: string;
  }>;
}

// Common API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId?: string;
}

// Chunking types (P1-E1-S2)
export interface ChunkMetadata {
  id: string;
  projectId: string;
  originalFilePath: string;
  r2ChunkPath: string;
  startLine: number;
  endLine: number;
  charCount: number;
  language?: string;
  createdAt: string;
  // Temporary field for P1-E2-S1 verification (will be replaced by Vectorize storage in P1-E2-S2)
  tempEmbeddingVector?: number[];
}

// Vectorize metadata structure (P1-E2-S2)
export interface VectorMetadata {
  projectId: string;
  chunkId: string;
  originalFilePath: string;
  startLine?: number;
}

export interface TextChunk {
  text: string;
  startLine: number;
  endLine: number;
  language?: string;
}

export interface ChunkingConfig {
  maxChunkSize: number; // Maximum characters per chunk
  chunkOverlap: number; // Overlap characters between chunks
  maxLinesPerChunk: number; // Maximum lines per chunk
  preserveCodeBlocks: boolean; // Try to keep code blocks intact
}

export interface ChunkingResult {
  chunkedFileCount: number;
  totalChunksCreated: number;
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}

// Language detection types
export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'cpp'
  | 'c'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'markdown'
  | 'yaml'
  | 'json'
  | 'html'
  | 'css'
  | 'shell'
  | 'sql'
  | 'text';

// Embedding generation types (P1-E2-S1)
export interface EmbeddingModelConfig {
  service: SupportedExternalService; // e.g., 'openai_embedding', 'jina_embedding'
  modelName?: string | undefined; // e.g., 'text-embedding-ada-002', 'jina-embeddings-v2-base-en'
  dimensions?: number | undefined; // Optional dimensions for some models
  batchSize?: number | undefined; // Batch size for processing multiple chunks
}

export interface EmbeddingGenerationResult {
  processedChunkCount: number;
  successfulEmbeddingCount: number;
  errors: Array<{
    chunkId: string;
    filePath: string;
    error: string;
  }>;
  totalProcessingTimeMs: number;
}

// Zod schema for embedding generation request validation
export const EmbeddingGenerationRequestSchema = z.object({
  userEmbeddingApiKey: z.string().min(1, 'Embedding API key is required'),
  embeddingModelConfig: z.object({
    service: z.enum([
      'openai_embedding',
      'jina_embedding',
      'cohere_embed'
    ]),
    modelName: z.string().optional(),
    dimensions: z.number().int().positive().optional(),
    batchSize: z.number().int().min(1).max(100).optional().default(20)
  })
});

export type EmbeddingGenerationRequest = z.infer<typeof EmbeddingGenerationRequestSchema>;

// Vector search types (P1-E3-S1, RFC-CTX-001, RFC-CTX-002)
export const VectorSearchRequestSchema = z.object({
  project_id: z.string().uuid('Invalid project ID format'),
  query_text: z.string().min(1, 'Query text cannot be empty'),
  user_api_keys: z.object({
    embeddingKey: z.string().min(1, 'Embedding API key is required'),
    llmKey: z.string().min(1, 'LLM API key is required').optional() // Optional for re-ranking
  }),
  embedding_model_config: z.object({
    service: z.enum(['openai_embedding', 'jina_embedding', 'cohere_embed']),
    modelName: z.string().optional(),
    dimensions: z.number().int().positive().optional(),
    batchSize: z.number().int().positive().optional()
  }),
  top_k: z.number().int().min(1).max(50).optional().default(10),
  // Context-related fields (RFC-CTX-001, RFC-CTX-002)
  explicit_context_paths: z.array(z.string()).optional().default([]),
  pinned_item_ids: z.array(z.string()).optional().default([]),
  include_pinned: z.boolean().optional().default(true),
  implicit_context: z.object({
    last_focused_file_path: z.string().optional()
  }).optional(),
  // Re-ranking configuration (RFC-RET-002)
  enable_reranking: z.boolean().optional().default(false),
  reranking_config: z.object({
    service: z.enum(['openai_chat', 'anthropic_claude', 'cohere_generate']),
    modelName: z.string(),
    temperature: z.number().min(0).max(2).optional().default(0.1),
    maxTokens: z.number().int().positive().optional().default(500),
    maxResultsToRerank: z.number().int().min(2).max(20).optional().default(10)
  }).optional()
});

export type VectorSearchRequest = z.infer<typeof VectorSearchRequestSchema>;

export interface VectorSearchResult {
  chunk_id: string;
  original_file_path: string;
  start_line: number;
  end_line?: number;
  score: number;
  text_snippet?: string; // Hydrated content from R2 (P1-E3-S2)
  language?: string; // Language detected from chunk metadata
  metadata?: Record<string, any> | undefined;
}

export interface VectorSearchResponse {
  results: VectorSearchResult[];
  query_embedding_time_ms: number;
  vector_search_time_ms: number;
  total_time_ms: number;
}

// Pinned Context types (RFC-CTX-001, RFC-MEM-001)
export interface PinnedContextItem {
  id: string;
  projectId: string;
  type: 'file_path' | 'text_snippet';
  content: string;
  description?: string;
  createdAt: string;
}

export const CreatePinnedItemSchema = z.object({
  type: z.enum(['file_path', 'text_snippet']),
  content: z.string().min(1, 'Content is required'),
  description: z.string().optional()
});

export type CreatePinnedItemRequest = z.infer<typeof CreatePinnedItemSchema>;

// Context-aware query types (RFC-CTX-001, RFC-CTX-002)
export const ContextAwareQuerySchema = z.object({
  project_id: z.string().uuid('Invalid project ID format'),
  query_text: z.string().min(1, 'Query text is required'),
  user_api_keys: z.object({
    llmKey: z.string().min(1, 'LLM API key is required'),
    embeddingKey: z.string().optional() // Optional for context-only queries
  }),
  // RFC-CTX-001: Explicit context support
  explicit_context_paths: z.array(z.string()).optional().default([]),
  pinned_item_ids: z.array(z.string()).optional().default([]),
  include_pinned: z.boolean().optional().default(true),
  // RFC-CTX-002: Implicit context support
  implicit_context: z.object({
    last_focused_file_path: z.string().optional()
  }).optional(),
  // Optional vector search for additional context
  vector_search_config: z.object({
    enabled: z.boolean().default(false),
    embedding_model_config: z.object({
      service: z.enum([
        'openai_embedding',
        'jina_embedding',
        'cohere_embed'
      ]),
      modelName: z.string().optional()
    }),
    top_k: z.number().int().min(1).max(50).optional().default(5)
  }).optional()
});

export type ContextAwareQueryRequest = z.infer<typeof ContextAwareQuerySchema>;

// Dynamic Context Window Management types (RFC-CTX-003)
export interface ManagedPromptContextResult {
  finalPrompt: string;
  usedTokens: number;
  includedSources: string[];
  warnings: string[];
  tokenCountMethod: 'tiktoken' | 'heuristic';
  tokenCountConfidence: 'high' | 'medium' | 'low';
}

export interface ContextSourceItem {
  text: string;
  sourceDesc: string;
  originalLength?: number;
  priority: number;
  type: 'system_prompt' | 'user_query' | 'explicit_file' | 'pinned_snippet' | 'pinned_file' | 'conversation_history' | 'vector_result' | 'implicit_file';
}

export interface TruncationResult {
  truncatedText: string;
  usedTokens: number;
  wasTruncated: boolean;
  truncationMethod: string;
}

// ReAct Agent types (RFC-AGT-001, RFC-AGT-004)
export interface ReactStepRequest {
  project_id: string;
  session_id: string;
  user_query: string;
  conversation_history: AgentTurn[];
  explicit_context_paths?: string[];
  pinned_item_ids_to_include?: string[];
  implicit_context?: {
    last_focused_file_path?: string;
  };
  vector_search_results_to_include?: VectorSearchResult[];
  available_tools_prompt_segment: string;
  llm_config: {
    modelName: string;
    tokenLimit: number;
    reservedOutputTokens: number;
    temperature?: number;
  };
  user_api_keys: {
    llmKey: string;
  };
  max_iterations_left: number;
}

export interface ActionDetails {
  tool_name: string;
  tool_args: Record<string, unknown>;
  raw_action_string: string;
}

export interface ReactStepResponse {
  session_id: string;
  thought: string;
  action_details: ActionDetails | null;
  direct_response: string | null;
  updated_conversation_history: AgentTurn[];
  iterations_remaining: number;
  status: 'action_proposed' | 'direct_response_provided' | 'error';
}

// Zod schemas for ReAct agent validation
export const ReactStepRequestSchema = z.object({
  project_id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_query: z.string(),
  conversation_history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'tool_observation']),
    content: z.string(),
    toolCall: z.object({
      name: z.string(),
      parameters: z.record(z.unknown())
    }).optional(),
    toolResult: z.object({
      success: z.boolean(),
      result: z.unknown(),
      error: z.string().optional()
    }).optional(),
    timestamp: z.string()
  })),
  explicit_context_paths: z.array(z.string()).optional(),
  pinned_item_ids_to_include: z.array(z.string()).optional(),
  implicit_context: z.object({
    last_focused_file_path: z.string().optional()
  }).optional(),
  vector_search_results_to_include: z.array(z.object({
    chunk_id: z.string(),
    original_file_path: z.string(),
    start_line: z.number(),
    end_line: z.number().optional(),
    score: z.number(),
    text_snippet: z.string().optional(),
    language: z.string().optional(),
    metadata: z.record(z.any()).optional()
  })).optional(),
  available_tools_prompt_segment: z.string(),
  llm_config: z.object({
    modelName: z.string(),
    tokenLimit: z.number().int().positive(),
    reservedOutputTokens: z.number().int().positive(),
    temperature: z.number().min(0).max(2).optional()
  }),
  user_api_keys: z.object({
    llmKey: z.string().min(1)
  }),
  max_iterations_left: z.number().int().min(0)
});

export type ValidatedReactStepRequest = z.infer<typeof ReactStepRequestSchema>;

// Chat completion types for BYOK proxy
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ProxyErrorResponse {
  error: {
    status?: number;
    message: string;
    data?: unknown;
  };
}

export type ChatCompletionResult = ChatCompletionResponse | ProxyErrorResponse;

// Tool execution types (RFC-AGT-002)
export interface ToolExecutionRequest {
  project_id: string;
  session_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  user_api_keys: {
    llmKey?: string;
    embeddingKey?: string;
  };
  embedding_model_config?: EmbeddingModelConfig;
}

export interface ToolExecutionResponse {
  session_id: string;
  tool_name: string;
  observation: string;
  is_error: boolean;
  execution_time_ms: number;
}

// Zod schema for tool execution validation
export const ToolExecutionRequestSchema = z.object({
  project_id: z.string().uuid(),
  session_id: z.string().uuid(),
  tool_name: z.string().min(1),
  tool_args: z.record(z.unknown()),
  user_api_keys: z.object({
    llmKey: z.string().optional(),
    embeddingKey: z.string().optional()
  }),
  embedding_model_config: z.object({
    service: z.enum([
      'openai_embedding',
      'jina_embedding',
      'cohere_embed'
    ]),
    modelName: z.string().optional(),
    dimensions: z.number().optional(),
    batchSize: z.number().optional()
  }).optional()
});

export type ValidatedToolExecutionRequest = z.infer<typeof ToolExecutionRequestSchema>;

/**
 * Apply Diff API types (P3-E1-S2)
 * Implements RFC-AGT-003: Semantic Diff Generation & Application
 */
export const ApplyDiffRequestSchema = z.object({
  file_path: z.string().min(1, 'File path is required'),
  diff_string: z.string().min(1, 'Diff string is required')
});

export type ApplyDiffRequest = z.infer<typeof ApplyDiffRequestSchema>;

export interface ApplyDiffResponse {
  success: boolean;
  message: string;
  new_content?: string;
}

// LLM Re-ranking types (RFC-RET-002)
export interface LlmRerankingConfig {
  service: SupportedExternalService; // e.g., 'openai_chat', 'anthropic_claude'
  modelName: string; // e.g., 'gpt-3.5-turbo', 'claude-3-haiku-20240307'
  temperature?: number;
  maxTokens?: number;
  maxResultsToRerank?: number; // Limit results sent to LLM for cost control
}

export interface RerankingResult {
  rerankedResults: VectorSearchResult[];
  originalResultCount: number;
  rerankedResultCount: number;
  llmCallTimeMs: number;
  success: boolean;
  error?: string;
}