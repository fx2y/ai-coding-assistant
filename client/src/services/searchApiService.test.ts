/**
 * Search API Service Tests
 * Tests RFC-CTX-001: Client-side @tag parsing and context-aware search
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  parseExplicitTags, 
  performContextAwareVectorSearch,
  performVectorSearch 
} from './searchApiService.js';

// Mock the API key service
vi.mock('./apiKeyService.js', () => ({
  getApiKeys: vi.fn(() => ({ embeddingKey: 'test-embedding-key' }))
}));

// Mock fetch globally
vi.stubGlobal('fetch', vi.fn());

describe('parseExplicitTags', () => {
  it('should parse single @file tag', () => {
    const result = parseExplicitTags('What does @src/main.ts do?');
    expect(result.explicitPaths).toEqual(['src/main.ts']);
    expect(result.cleanedQuery).toBe('What does  do?');
  });

  it('should parse multiple @tags', () => {
    const result = parseExplicitTags('Compare @auth.js and @utils/helpers.js functionality');
    expect(result.explicitPaths).toEqual(['auth.js', 'utils/helpers.js']);
    expect(result.cleanedQuery).toBe('Compare  and  functionality');
  });

  it('should parse @folder tags', () => {
    const result = parseExplicitTags('Analyze @src/components/ structure');
    expect(result.explicitPaths).toEqual(['src/components/']);
    expect(result.cleanedQuery).toBe('Analyze  structure');
  });

  it('should handle complex paths with dots and dashes', () => {
    const result = parseExplicitTags('Check @config/app.config.js and @test-utils/mock-data.json');
    expect(result.explicitPaths).toEqual(['config/app.config.js', 'test-utils/mock-data.json']);
  });

  it('should remove duplicates', () => {
    const result = parseExplicitTags('Compare @auth.js with @auth.js again');
    expect(result.explicitPaths).toEqual(['auth.js']);
  });

  it('should handle query with no tags', () => {
    const result = parseExplicitTags('Simple search query');
    expect(result.explicitPaths).toEqual([]);
    expect(result.cleanedQuery).toBe('Simple search query');
  });

  it('should handle empty query', () => {
    const result = parseExplicitTags('');
    expect(result.explicitPaths).toEqual([]);
    expect(result.cleanedQuery).toBe('');
  });

  it('should handle tags at different positions', () => {
    const result = parseExplicitTags('@start.js middle content @end.js');
    expect(result.explicitPaths).toEqual(['start.js', 'end.js']);
    expect(result.cleanedQuery).toBe('middle content');
  });

  it('should handle nested folder paths', () => {
    const result = parseExplicitTags('Check @src/components/ui/Button.tsx');
    expect(result.explicitPaths).toEqual(['src/components/ui/Button.tsx']);
    expect(result.cleanedQuery).toBe('Check');
  });
});

describe('performContextAwareVectorSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should automatically parse @tags and include them in explicit_context_paths', async () => {
    const mockResponse = {
      results: [],
      query_embedding_time_ms: 100,
      vector_search_time_ms: 50,
      total_time_ms: 150
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    } as any);

    const request = {
      project_id: 'test-project-123',
      query_text: 'How does authentication work in @auth.js and @utils/security.js?',
      embedding_model_config: {
        service: 'openai_embedding' as const,
        modelName: 'text-embedding-ada-002'
      },
      top_k: 10
    };

    await performContextAwareVectorSearch(request);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/search/vector_query'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"explicit_context_paths":["auth.js","utils/security.js"]')
      })
    );

    // Verify the cleaned query is sent
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);
    expect(requestBody.query_text).toBe('How does authentication work in  and ?');
    expect(requestBody.explicit_context_paths).toEqual(['auth.js', 'utils/security.js']);
  });

  it('should not parse @tags when auto_parse_tags is false', async () => {
    const mockResponse = {
      results: [],
      query_embedding_time_ms: 100,
      vector_search_time_ms: 50,
      total_time_ms: 150
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    } as any);

    const request = {
      project_id: 'test-project-123',
      query_text: 'How does authentication work in @auth.js?',
      embedding_model_config: {
        service: 'openai_embedding' as const,
        modelName: 'text-embedding-ada-002'
      },
      top_k: 10,
      auto_parse_tags: false
    };

    await performContextAwareVectorSearch(request);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);
    expect(requestBody.query_text).toBe('How does authentication work in @auth.js?');
    expect(requestBody.explicit_context_paths).toEqual([]);
  });

  it('should preserve existing explicit_context_paths when provided', async () => {
    const mockResponse = {
      results: [],
      query_embedding_time_ms: 100,
      vector_search_time_ms: 50,
      total_time_ms: 150
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    } as any);

    const request = {
      project_id: 'test-project-123',
      query_text: 'Simple query without tags',
      embedding_model_config: {
        service: 'openai_embedding' as const,
        modelName: 'text-embedding-ada-002'
      },
      top_k: 10,
      explicit_context_paths: ['predefined/file.js']
    };

    await performContextAwareVectorSearch(request);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);
    expect(requestBody.explicit_context_paths).toEqual(['predefined/file.js']);
  });

  it('should handle API errors gracefully', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({
        error: 'ValidationError',
        message: 'Invalid request'
      })
    } as any);

    const request = {
      project_id: 'test-project-123',
      query_text: 'Test query @file.js',
      embedding_model_config: {
        service: 'openai_embedding' as const
      }
    };

    const result = await performContextAwareVectorSearch(request);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe('ValidationError');
  });

  it('should handle network errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const request = {
      project_id: 'test-project-123',
      query_text: 'Test query @file.js',
      embedding_model_config: {
        service: 'openai_embedding' as const
      }
    };

    const result = await performContextAwareVectorSearch(request);

    expect(result.success).toBe(false);
    expect(result.error?.error).toBe('NetworkError');
    expect(result.error?.details).toBe('Network error');
  });

  it('should include pinned_item_ids and include_pinned in request', async () => {
    const mockResponse = {
      results: [],
      query_embedding_time_ms: 100,
      vector_search_time_ms: 50,
      total_time_ms: 150
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    } as any);

    const request = {
      project_id: 'test-project-123',
      query_text: 'Test query',
      embedding_model_config: {
        service: 'openai_embedding' as const
      },
      pinned_item_ids: ['pin-1', 'pin-2'],
      include_pinned: false
    };

    await performContextAwareVectorSearch(request);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);
    expect(requestBody.pinned_item_ids).toEqual(['pin-1', 'pin-2']);
    expect(requestBody.include_pinned).toBe(false);
  });
}); 