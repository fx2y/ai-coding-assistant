/**
 * Unit tests for Code Search Tool
 * Tests RFC-AGT-002: Tool Definition & Execution Framework
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCodeSearch } from './codeSearchTool.js';
import type { Env, EmbeddingModelConfig, VectorSearchResult } from '../types.js';
import * as retrievalService from '../services/retrievalService.js';

// Mock the retrieval service
vi.mock('../services/retrievalService.js');

describe('Code Search Tool', () => {
  let mockEnv: Env;
  let embeddingModelConfig: EmbeddingModelConfig;
  let userApiKeys: { embeddingKey: string };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: {} as R2Bucket,
      METADATA_KV: {} as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex
    };

    embeddingModelConfig = {
      service: 'openai_embedding',
      modelName: 'text-embedding-ada-002'
    };

    userApiKeys = {
      embeddingKey: 'test-embedding-key'
    };
  });

  it('should successfully execute code search and format results', async () => {
    const mockResults: VectorSearchResult[] = [
      {
        chunk_id: 'chunk1',
        original_file_path: 'src/utils/auth.ts',
        start_line: 10,
        end_line: 25,
        score: 0.95,
        text_snippet: 'function authenticateUser(token: string) {\n  // Authentication logic\n  return validateToken(token);\n}',
        language: 'typescript'
      },
      {
        chunk_id: 'chunk2',
        original_file_path: 'src/middleware/auth.ts',
        start_line: 5,
        end_line: 15,
        score: 0.87,
        text_snippet: 'export const authMiddleware = (req, res, next) => {\n  // Middleware logic\n};',
        language: 'typescript'
      }
    ];

    const mockSearchResult = {
      results: mockResults,
      timings: {
        queryEmbeddingMs: 100,
        vectorSearchMs: 50,
        totalMs: 150
      }
    };

    vi.mocked(retrievalService.performVectorSearch).mockResolvedValue(mockSearchResult);

    const result = await executeCodeSearch(
      mockEnv,
      'test-project-id',
      { query: 'authentication functions' },
      userApiKeys,
      embeddingModelConfig
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toContain('Found 2 code snippets for query: "authentication functions"');
    expect(result.tool_output).toContain('src/utils/auth.ts');
    expect(result.tool_output).toContain('Lines 10-25');
    expect(result.tool_output).toContain('Score: 0.950');
    expect(result.tool_output).toContain('```typescript');
    expect(result.tool_output).toContain('function authenticateUser');

    expect(retrievalService.performVectorSearch).toHaveBeenCalledWith(
      mockEnv,
      'test-project-id',
      'authentication functions',
      'test-embedding-key',
      embeddingModelConfig,
      5 // topK default
    );
  });

  it('should handle search errors gracefully', async () => {
    const mockSearchResult = {
      error: {
        message: 'Embedding generation failed',
        code: 'EMBEDDING_GENERATION_FAILED'
      },
      timings: {
        queryEmbeddingMs: 100,
        vectorSearchMs: 0,
        totalMs: 100
      }
    };

    vi.mocked(retrievalService.performVectorSearch).mockResolvedValue(mockSearchResult);

    const result = await executeCodeSearch(
      mockEnv,
      'test-project-id',
      { query: 'test query' },
      userApiKeys,
      embeddingModelConfig
    );

    expect(result.error).toBe('Code search failed: Embedding generation failed');
    expect(result.tool_output).toBe('');
  });

  it('should handle no results found', async () => {
    const mockSearchResult = {
      results: [],
      timings: {
        queryEmbeddingMs: 100,
        vectorSearchMs: 50,
        totalMs: 150
      }
    };

    vi.mocked(retrievalService.performVectorSearch).mockResolvedValue(mockSearchResult);

    const result = await executeCodeSearch(
      mockEnv,
      'test-project-id',
      { query: 'nonexistent function' },
      userApiKeys,
      embeddingModelConfig
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toBe('No code snippets found for query: "nonexistent function"');
  });

  it('should handle unexpected errors', async () => {
    vi.mocked(retrievalService.performVectorSearch).mockRejectedValue(new Error('Network error'));

    const result = await executeCodeSearch(
      mockEnv,
      'test-project-id',
      { query: 'test query' },
      userApiKeys,
      embeddingModelConfig
    );

    expect(result.error).toBe('Code search tool failed: Network error');
    expect(result.tool_output).toBe('');
  });

  it('should format results without end_line correctly', async () => {
    const mockResults: VectorSearchResult[] = [
      {
        chunk_id: 'chunk1',
        original_file_path: 'src/config.ts',
        start_line: 1,
        score: 0.90,
        text_snippet: 'export const API_URL = "https://api.example.com";',
        language: 'typescript'
      }
    ];

    const mockSearchResult = {
      results: mockResults,
      timings: {
        queryEmbeddingMs: 100,
        vectorSearchMs: 50,
        totalMs: 150
      }
    };

    vi.mocked(retrievalService.performVectorSearch).mockResolvedValue(mockSearchResult);

    const result = await executeCodeSearch(
      mockEnv,
      'test-project-id',
      { query: 'API configuration' },
      userApiKeys,
      embeddingModelConfig
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toContain('Line 1'); // Should show "Line 1" not "Lines 1-undefined"
    expect(result.tool_output).toContain('Score: 0.900');
  });

  it('should handle missing language and text_snippet', async () => {
    const mockResults: VectorSearchResult[] = [
      {
        chunk_id: 'chunk1',
        original_file_path: 'unknown.txt',
        start_line: 1,
        end_line: 5,
        score: 0.75
        // No language or text_snippet
      }
    ];

    const mockSearchResult = {
      results: mockResults,
      timings: {
        queryEmbeddingMs: 100,
        vectorSearchMs: 50,
        totalMs: 150
      }
    };

    vi.mocked(retrievalService.performVectorSearch).mockResolvedValue(mockSearchResult);

    const result = await executeCodeSearch(
      mockEnv,
      'test-project-id',
      { query: 'test' },
      userApiKeys,
      embeddingModelConfig
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toContain('```text'); // Default language
    expect(result.tool_output).toContain('[Content not available]'); // Default content
  });
});