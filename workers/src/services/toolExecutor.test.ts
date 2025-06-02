/**
 * Unit tests for Tool Executor Service
 * Tests RFC-AGT-002: Tool Definition & Execution Framework
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolByName, generateToolManifestPrompt, type ToolExecutionContext } from './toolExecutor.js';
import type { Env, EmbeddingModelConfig } from '../types.js';
import * as codeSearchTool from '../tools/codeSearchTool.js';
import * as readFileTool from '../tools/readFileTool.js';

// Mock the tool implementations
vi.mock('../tools/codeSearchTool.js');
vi.mock('../tools/readFileTool.js');

describe('Tool Executor Service', () => {
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      env: {
        ENVIRONMENT: 'test',
        CODE_UPLOADS_BUCKET: {} as R2Bucket,
        METADATA_KV: {} as KVNamespace,
        VECTORIZE_INDEX: {} as VectorizeIndex
      },
      projectId: 'test-project-id',
      userApiKeys: {
        embeddingKey: 'test-embedding-key',
        llmKey: 'test-llm-key'
      },
      embeddingModelConfig: {
        service: 'openai_embedding',
        modelName: 'text-embedding-ada-002'
      }
    };
  });

  describe('executeToolByName', () => {
    it('should successfully execute code_search tool', async () => {
      const mockSearchResult = {
        tool_output: 'Found 2 code snippets for query: "authentication"'
      };

      vi.mocked(codeSearchTool.executeCodeSearch).mockResolvedValue(mockSearchResult);

      const result = await executeToolByName(
        mockContext,
        'code_search',
        { query: 'authentication functions' }
      );

      expect(result.isError).toBe(false);
      expect(result.observation).toBe('Found 2 code snippets for query: "authentication"');

      expect(codeSearchTool.executeCodeSearch).toHaveBeenCalledWith(
        mockContext.env,
        'test-project-id',
        { query: 'authentication functions' },
        { embeddingKey: 'test-embedding-key' },
        mockContext.embeddingModelConfig
      );
    });

    it('should handle code_search tool errors', async () => {
      const mockSearchResult = {
        tool_output: '',
        error: 'Embedding generation failed'
      };

      vi.mocked(codeSearchTool.executeCodeSearch).mockResolvedValue(mockSearchResult);

      const result = await executeToolByName(
        mockContext,
        'code_search',
        { query: 'test query' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error in code_search: Embedding generation failed');
    });

    it('should reject code_search without embedding key', async () => {
      const contextWithoutEmbeddingKey = {
        ...mockContext,
        userApiKeys: { llmKey: 'test-llm-key' }
      };

      const result = await executeToolByName(
        contextWithoutEmbeddingKey,
        'code_search',
        { query: 'test query' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Embedding API key is required for code search');
      expect(codeSearchTool.executeCodeSearch).not.toHaveBeenCalled();
    });

    it('should reject code_search without embedding model config', async () => {
      const contextWithoutEmbeddingConfig = {
        ...mockContext
      };
      delete contextWithoutEmbeddingConfig.embeddingModelConfig;

      const result = await executeToolByName(
        contextWithoutEmbeddingConfig,
        'code_search',
        { query: 'test query' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Embedding model configuration is required for code search');
      expect(codeSearchTool.executeCodeSearch).not.toHaveBeenCalled();
    });

    it('should reject code_search with invalid arguments', async () => {
      const result = await executeToolByName(
        mockContext,
        'code_search',
        { invalid_param: 'value' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Invalid arguments for code_search. Expected: { query: string }');
      expect(codeSearchTool.executeCodeSearch).not.toHaveBeenCalled();
    });

    it('should successfully execute read_file tool', async () => {
      const mockReadResult = {
        tool_output: 'Content of file: **src/utils/auth.ts**\n\n```typescript\nexport function authenticate() {}\n```'
      };

      vi.mocked(readFileTool.executeReadFile).mockResolvedValue(mockReadResult);

      const result = await executeToolByName(
        mockContext,
        'read_file',
        { file_path: 'src/utils/auth.ts' }
      );

      expect(result.isError).toBe(false);
      expect(result.observation).toContain('Content of file: **src/utils/auth.ts**');

      expect(readFileTool.executeReadFile).toHaveBeenCalledWith(
        mockContext.env,
        'test-project-id',
        { file_path: 'src/utils/auth.ts' }
      );
    });

    it('should handle read_file tool errors', async () => {
      const mockReadResult = {
        tool_output: '',
        error: 'File not found: nonexistent.ts'
      };

      vi.mocked(readFileTool.executeReadFile).mockResolvedValue(mockReadResult);

      const result = await executeToolByName(
        mockContext,
        'read_file',
        { file_path: 'nonexistent.ts' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error in read_file: File not found: nonexistent.ts');
    });

    it('should reject read_file with invalid arguments', async () => {
      const result = await executeToolByName(
        mockContext,
        'read_file',
        { invalid_param: 'value' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Invalid arguments for read_file. Expected: { file_path: string }');
      expect(readFileTool.executeReadFile).not.toHaveBeenCalled();
    });

    it('should handle unknown tools', async () => {
      const result = await executeToolByName(
        mockContext,
        'unknown_tool',
        { param: 'value' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Unknown tool \'unknown_tool\'. Available tools: code_search, read_file');
    });

    it('should handle unexpected errors during tool execution', async () => {
      vi.mocked(codeSearchTool.executeCodeSearch).mockRejectedValue(new Error('Unexpected error'));

      const result = await executeToolByName(
        mockContext,
        'code_search',
        { query: 'test query' }
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Tool execution failed: Unexpected error');
    });

    it('should validate empty query for code_search', async () => {
      const result = await executeToolByName(
        mockContext,
        'code_search',
        { query: '   ' } // Empty/whitespace query
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Invalid arguments for code_search. Expected: { query: string }');
    });

    it('should validate empty file_path for read_file', async () => {
      const result = await executeToolByName(
        mockContext,
        'read_file',
        { file_path: '' } // Empty file path
      );

      expect(result.isError).toBe(true);
      expect(result.observation).toBe('Error: Invalid arguments for read_file. Expected: { file_path: string }');
    });
  });

  describe('generateToolManifestPrompt', () => {
    it('should generate comprehensive tool manifest', () => {
      const manifest = generateToolManifestPrompt();

      expect(manifest).toContain('You have access to the following tools:');
      expect(manifest).toContain('code_search(query: string)');
      expect(manifest).toContain('read_file(file_path: string)');
      expect(manifest).toContain('Action: tool_name(param1="value1", param2="value2")');
      expect(manifest).toContain('Example: code_search(query="user authentication functions")');
      expect(manifest).toContain('Example: read_file(file_path="src/models/user.py")');
      expect(manifest).toContain('After using a tool, you will receive an observation');
    });

    it('should include usage instructions', () => {
      const manifest = generateToolManifestPrompt();

      expect(manifest).toContain('To use a tool, output on a new line:');
      expect(manifest).toContain('Action: code_search(query="error handling middleware")');
      expect(manifest).toContain('Action: read_file(file_path="workers/src/index.ts")');
    });

    it('should describe tool purposes clearly', () => {
      const manifest = generateToolManifestPrompt();

      expect(manifest).toContain('Searches the codebase for code snippets relevant to the query');
      expect(manifest).toContain('Reads the full content of the specified file from the project');
      expect(manifest).toContain('Use this when you need to find specific functions, classes, patterns');
      expect(manifest).toContain('Use this when you need to see the complete implementation');
    });
  });
});