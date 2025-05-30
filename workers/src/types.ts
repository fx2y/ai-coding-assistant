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