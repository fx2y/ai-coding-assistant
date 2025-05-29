/**
 * Shared TypeScript types for AI Coding Assistant Workers
 * Implements RFC-SEC-001, RFC-API-001
 */

import { z } from 'zod';

// Environment bindings for Cloudflare Workers
export interface Env {
  ENVIRONMENT: string;
  // KV, R2, Vectorize bindings will be added here when needed
  [key: string]: any;
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

// Common API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId?: string;
} 