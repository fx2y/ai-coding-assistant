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
  query_text: z.string().min(1, 'Query text is required'),
  user_api_keys: z.object({
    embeddingKey: z.string().min(1, 'Embedding API key is required')
  }),
  embedding_model_config: z.object({
    service: z.enum([
      'openai_embedding',
      'jina_embedding',
      'cohere_embed'
    ]),
    modelName: z.string().optional()
  }),
  top_k: z.number().int().min(1).max(50).optional().default(10),
  // RFC-CTX-001: Explicit context support
  explicit_context_paths: z.array(z.string()).optional().default([]),
  pinned_item_ids: z.array(z.string()).optional().default([]),
  include_pinned: z.boolean().optional().default(true),
  // RFC-CTX-002: Implicit context support
  implicit_context: z.object({
    last_focused_file_path: z.string().optional()
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