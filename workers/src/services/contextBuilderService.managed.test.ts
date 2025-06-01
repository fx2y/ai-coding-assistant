/**
 * Managed Context Builder Service Tests
 * Tests RFC-CTX-003: Dynamic Context Window Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildManagedPromptContext } from './contextBuilderService.js';
import type { 
  Env, 
  VectorSearchResult, 
  AgentTurn, 
  PinnedContextItem 
} from '../types.js';
import { getModelConfig } from '../lib/tokenizer.js';
import type { LLMModelConfig } from '../lib/tokenizer.js';

// Mock the dependencies
vi.mock('../lib/kvStore.js', () => ({
  getPinnedItemsForProject: vi.fn()
}));

vi.mock('../lib/tokenizer.js', async () => {
  const actual = await vi.importActual('../lib/tokenizer.js');
  return {
    ...actual,
    countTokens: vi.fn()
  };
});

import { getPinnedItemsForProject } from '../lib/kvStore.js';
import { countTokens } from '../lib/tokenizer.js';

// Mock environment
const createMockEnv = (): Env => ({
  ENVIRONMENT: 'test',
  CODE_UPLOADS_BUCKET: {
    get: vi.fn(),
    list: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    head: vi.fn()
  } as any,
  METADATA_KV: {} as any,
  VECTORIZE_INDEX: {} as any
});

describe('buildManagedPromptContext', () => {
  let mockEnv: Env;
  const projectId = 'test-project-123';
  const llmConfig = getModelConfig('gpt-4');

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
    
    // Default mock for token counting - simple character-based estimation
    vi.mocked(countTokens).mockImplementation(async (text: string) => ({
      tokenCount: Math.ceil(text.length / 4), // Rough estimate: 4 chars per token
      method: 'heuristic' as const,
      confidence: 'medium' as const
    }));
  });

  it('should build basic context with system prompt and user query', async () => {
    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'How does authentication work?',
      [], // explicitPaths
      [], // pinnedItemIds
      {}, // implicitContext
      [], // vectorSearchResults
      [], // conversationHistory
      llmConfig
    );

    expect(result.finalPrompt).toContain('System: You are an AI coding assistant');
    expect(result.finalPrompt).toContain('User Query: How does authentication work?');
    expect(result.includedSources).toContain('System Prompt');
    expect(result.includedSources).toContain('User Query');
    expect(result.usedTokens).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should include explicit file content with high priority', async () => {
    const mockFileContent = 'export function authenticate() { return true; }';
    
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      text: () => Promise.resolve(mockFileContent),
      size: mockFileContent.length
    } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'How does auth.js work?',
      ['auth.js'], // explicitPaths
      [],
      {},
      [],
      [],
      llmConfig
    );

    expect(result.finalPrompt).toContain('--- FILE: AUTH.JS ---');
    expect(result.finalPrompt).toContain(mockFileContent);
    expect(result.includedSources).toContain('File: auth.js');
    expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(
      'projects/test-project-123/original/auth.js'
    );
  });

  it('should include pinned context items', async () => {
    const mockPinnedItems: PinnedContextItem[] = [
      {
        id: 'pin-1',
        projectId,
        type: 'text_snippet',
        content: 'Important security note: Always validate JWT tokens',
        description: 'Security Note',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    vi.mocked(getPinnedItemsForProject).mockResolvedValue(mockPinnedItems);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Security question',
      [],
      ['pin-1'], // pinnedItemIds
      {},
      [],
      [],
      llmConfig
    );

    expect(result.finalPrompt).toContain('--- PINNED SNIPPET: SECURITY NOTE ---');
    expect(result.finalPrompt).toContain('Important security note: Always validate JWT tokens');
    expect(result.includedSources).toContain('Pinned Snippet: Security Note');
  });

  it('should include conversation history with proper formatting', async () => {
    const conversationHistory: AgentTurn[] = [
      {
        role: 'user',
        content: 'What is authentication?',
        timestamp: '2024-01-01T10:00:00Z'
      },
      {
        role: 'assistant',
        content: 'Authentication is the process of verifying identity.',
        timestamp: '2024-01-01T10:01:00Z'
      }
    ];

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Follow-up question',
      [],
      [],
      {},
      [],
      conversationHistory,
      llmConfig
    );

    expect(result.finalPrompt).toContain('--- CONVERSATION HISTORY ---');
    expect(result.finalPrompt).toContain('USER: What is authentication?');
    expect(result.finalPrompt).toContain('ASSISTANT: Authentication is the process');
    expect(result.includedSources.some(s => s.includes('Conversation Turn'))).toBe(true);
  });

  it('should include vector search results', async () => {
    const vectorResults: VectorSearchResult[] = [
      {
        chunk_id: 'chunk-1',
        original_file_path: 'utils/auth.js',
        start_line: 10,
        end_line: 20,
        score: 0.95,
        text_snippet: 'function validateToken(token) { return jwt.verify(token); }'
      }
    ];

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Token validation',
      [],
      [],
      {},
      vectorResults,
      [],
      llmConfig
    );

    expect(result.finalPrompt).toContain('--- RETRIEVED CODE SNIPPET ---');
    expect(result.finalPrompt).toContain('utils/auth.js');
    expect(result.finalPrompt).toContain('function validateToken');
    expect(result.includedSources).toContain('Vector Result: utils/auth.js L10');
  });

  it('should respect token limits and truncate when necessary', async () => {
    // Create a very large file content that will exceed token limits
    const largeFileContent = 'x'.repeat(10000); // Very large content
    
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      text: () => Promise.resolve(largeFileContent),
      size: largeFileContent.length
    } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    // Mock token counting to simulate hitting limits
    vi.mocked(countTokens).mockImplementation(async (text: string) => {
      if (text.includes('x'.repeat(100))) {
        return { tokenCount: 5000, method: 'heuristic' as const, confidence: 'medium' as const }; // Very high token count
      }
      return { tokenCount: Math.ceil(text.length / 4), method: 'heuristic' as const, confidence: 'medium' as const };
    });

    // Use a model with small token limit for testing
    const smallLlmConfig = {
      modelName: 'test-small',
      tokenLimit: 1000,
      reservedOutputTokens: 200,
      provider: 'openai' as const
    };

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Test large file',
      ['large-file.js'],
      [],
      {},
      [],
      [],
      smallLlmConfig
    );

    // Should have warnings about truncation or skipping
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Truncated') || w.includes('Skipped'))).toBe(true);
  });

  it('should prioritize sources correctly', async () => {
    // Setup multiple sources to test prioritization
    const explicitFileContent = 'explicit file content';
    const pinnedContent = 'pinned content';
    
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      text: () => Promise.resolve(explicitFileContent),
      size: explicitFileContent.length
    } as any);

    const mockPinnedItems: PinnedContextItem[] = [
      {
        id: 'pin-1',
        projectId,
        type: 'text_snippet',
        content: pinnedContent,
        description: 'Pinned',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    vi.mocked(getPinnedItemsForProject).mockResolvedValue(mockPinnedItems);

    const vectorResults: VectorSearchResult[] = [
      {
        chunk_id: 'chunk-1',
        original_file_path: 'search-result.js',
        start_line: 1,
        score: 0.8,
        text_snippet: 'search result content'
      }
    ];

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Test prioritization',
      ['explicit.js'], // Priority 3
      ['pin-1'], // Priority 4
      {},
      vectorResults, // Priority 6
      [],
      llmConfig
    );

    // Check that sources appear in priority order in the final prompt
    const promptLines = result.finalPrompt.split('\n');
    const systemPromptIndex = promptLines.findIndex(line => line.includes('System:'));
    const userQueryIndex = promptLines.findIndex(line => line.includes('User Query:'));
    const explicitFileIndex = promptLines.findIndex(line => line.includes('--- FILE: EXPLICIT.JS ---'));
    const pinnedIndex = promptLines.findIndex(line => line.includes('--- PINNED SNIPPET: PINNED ---'));
    const vectorIndex = promptLines.findIndex(line => line.includes('--- RETRIEVED CODE SNIPPET ---'));

    // Verify priority order (lower index = higher priority = appears first)
    expect(systemPromptIndex).toBeLessThan(userQueryIndex);
    expect(userQueryIndex).toBeLessThan(explicitFileIndex);
    expect(explicitFileIndex).toBeLessThan(pinnedIndex);
    expect(pinnedIndex).toBeLessThan(vectorIndex);
  });

  it('should handle implicit context when not already included', async () => {
    const implicitFileContent = 'implicit file content';
    
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      text: () => Promise.resolve(implicitFileContent),
      size: implicitFileContent.length
    } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Test implicit context',
      [], // No explicit paths
      [],
      { last_focused_file_path: 'implicit.js' }, // implicitContext
      [],
      [],
      llmConfig
    );

    expect(result.finalPrompt).toContain('--- IMPLICIT CONTEXT: IMPLICIT.JS ---');
    expect(result.finalPrompt).toContain(implicitFileContent);
    expect(result.includedSources).toContain('Implicit Context: implicit.js');
  });

  it('should not duplicate implicit context if already explicit', async () => {
    const fileContent = 'shared file content';
    
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      text: () => Promise.resolve(fileContent),
      size: fileContent.length
    } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Test no duplication',
      ['shared.js'], // Explicit path
      [],
      { last_focused_file_path: 'shared.js' }, // Same as implicit
      [],
      [],
      llmConfig
    );

    // Should only appear once as explicit file, not as implicit
    expect(result.finalPrompt).toContain('--- FILE: SHARED.JS ---');
    expect(result.finalPrompt).not.toContain('--- IMPLICIT CONTEXT');
    expect(result.includedSources).toContain('File: shared.js');
    expect(result.includedSources.filter(s => s.includes('shared.js')).length).toBe(1);
  });

  it('should handle errors gracefully', async () => {
    // Mock an error in the token counting function to trigger main error handling
    // We need to mock it to succeed initially for the error context, then fail for the main logic
    let callCount = 0;
    vi.mocked(countTokens).mockImplementation(async (text: string, config: LLMModelConfig) => {
      callCount++;
      if (callCount === 1) {
        // First call for error context should succeed
        return { tokenCount: 50, method: 'heuristic' as const, confidence: 'medium' as const };
      }
      // Subsequent calls should fail to trigger error handling
      throw new Error('Token counting failed');
    });
    
    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Test error handling',
      [],
      [],
      {},
      [],
      [],
      llmConfig
    );

    // Should still return a valid result with error context
    expect(result.finalPrompt).toContain('System: You are an AI coding assistant');
    expect(result.finalPrompt).toContain('User Query: Test error handling');
    expect(result.finalPrompt).toContain('[ERROR: Failed to build full context]');
    expect(result.warnings).toContain('Failed to build managed context due to error');
  });

  it('should limit conversation history to recent turns', async () => {
    // Create more than 6 conversation turns
    const manyTurns: AgentTurn[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Turn ${i}`,
      timestamp: `2024-01-01T10:${i.toString().padStart(2, '0')}:00Z`
    }));

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Test history limit',
      [],
      [],
      {},
      [],
      manyTurns,
      llmConfig
    );

    // Should only include last 6 turns (newest first)
    const conversationSources = result.includedSources.filter(s => s.includes('Conversation Turn'));
    expect(conversationSources.length).toBeLessThanOrEqual(6);
    
    // Should include the most recent turns
    expect(result.finalPrompt).toContain('Turn 9'); // Most recent
    expect(result.finalPrompt).not.toContain('Turn 0'); // Oldest should be excluded
  });

  it('should limit vector search results to top 10', async () => {
    // Create more than 10 vector results
    const manyResults: VectorSearchResult[] = Array.from({ length: 15 }, (_, i) => ({
      chunk_id: `chunk-${i}`,
      original_file_path: `file-${i}.js`,
      start_line: i * 10,
      score: 0.9 - (i * 0.05), // Decreasing scores
      text_snippet: `content ${i}`
    }));

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildManagedPromptContext(
      mockEnv,
      projectId,
      'Test vector limit',
      [],
      [],
      {},
      manyResults,
      [],
      llmConfig
    );

    // Should only include top 10 results
    const vectorSources = result.includedSources.filter(s => s.includes('Vector Result'));
    expect(vectorSources.length).toBeLessThanOrEqual(10);
    
    // Should include highest scoring results
    expect(result.finalPrompt).toContain('file-0.js'); // Highest score
    expect(result.finalPrompt).not.toContain('file-14.js'); // Lowest score should be excluded
  });
}); 