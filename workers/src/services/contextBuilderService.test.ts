/**
 * Context Builder Service Tests
 * Tests RFC-CTX-001: Explicit Context Management
 * Tests RFC-MEM-001: Session & Project Memory Store (Pinned Items)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  buildPromptContext, 
  parseExplicitTags
} from './contextBuilderService.js';
import type { Env, PinnedContextItem, VectorSearchResult } from '../types.js';

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

// Mock KV store functions
vi.mock('../lib/kvStore.js', () => ({
  getPinnedItemsForProject: vi.fn()
}));

import { getPinnedItemsForProject } from '../lib/kvStore.js';

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
});

describe('buildPromptContext', () => {
  let mockEnv: Env;
  const projectId = 'test-project-123';

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  it('should build context with pinned text snippets', async () => {
    const mockPinnedItems: PinnedContextItem[] = [
      {
        id: 'pin-1',
        projectId,
        type: 'text_snippet',
        content: 'Important note about authentication',
        description: 'Auth Notes',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    vi.mocked(getPinnedItemsForProject).mockResolvedValue(mockPinnedItems);

    const result = await buildPromptContext(mockEnv, projectId, {
      includePinned: true
    });

    expect(result.contextString).toContain('--- PINNED SNIPPET: Auth Notes ---');
    expect(result.contextString).toContain('Important note about authentication');
    expect(result.includedSources).toContain('Pinned Snippet: Auth Notes');
    expect(result.totalCharacters).toBeGreaterThan(0);
  });

  it('should build context with explicit file paths', async () => {
    const mockFileContent = 'export function authenticate() { /* auth logic */ }';
    
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      text: () => Promise.resolve(mockFileContent),
      size: mockFileContent.length
    } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildPromptContext(mockEnv, projectId, {
      explicitPaths: ['src/auth.js'],
      includePinned: false
    });

    expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(
      'projects/test-project-123/original/src/auth.js'
    );
    expect(result.contextString).toContain('--- FILE: src/auth.js ---');
    expect(result.contextString).toContain(mockFileContent);
    expect(result.includedSources).toContain('File: src/auth.js');
  });

  it('should handle missing files gracefully', async () => {
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue(null);
    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildPromptContext(mockEnv, projectId, {
      explicitPaths: ['nonexistent.js'],
      includePinned: false
    });

    expect(result.contextString).toContain('[File not found: nonexistent.js]');
    expect(result.includedSources).toContain('File (not found): nonexistent.js');
  });

  it('should handle large files by showing size warning', async () => {
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      size: 100000, // 100KB, larger than default 50KB limit
      text: () => Promise.resolve('large file content')
    } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildPromptContext(mockEnv, projectId, {
      explicitPaths: ['large-file.js'],
      includePinned: false
    });

    expect(result.contextString).toContain('[File too large: large-file.js (100000 bytes, max 50000)]');
  });

  it('should build context with folder paths', async () => {
    const mockListResult = {
      objects: [
        { key: 'projects/test-project-123/original/src/components/Button.tsx' },
        { key: 'projects/test-project-123/original/src/components/Input.tsx' }
      ],
      truncated: false
    };

    const mockFileContent1 = 'export const Button = () => <button />';
    const mockFileContent2 = 'export const Input = () => <input />';

    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.list).mockResolvedValue(mockListResult as any);
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get)
      .mockResolvedValueOnce({
        text: () => Promise.resolve(mockFileContent1),
        size: mockFileContent1.length
      } as any)
      .mockResolvedValueOnce({
        text: () => Promise.resolve(mockFileContent2),
        size: mockFileContent2.length
      } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildPromptContext(mockEnv, projectId, {
      explicitPaths: ['src/components/'],
      includePinned: false
    });

    expect(mockEnv.CODE_UPLOADS_BUCKET.list).toHaveBeenCalledWith({
      prefix: 'projects/test-project-123/original/src/components/',
      limit: 10
    });
    expect(result.contextString).toContain('--- FILE: src/components/Button.tsx ---');
    expect(result.contextString).toContain('--- FILE: src/components/Input.tsx ---');
    expect(result.includedSources).toContain('Folder File: src/components/Button.tsx');
    expect(result.includedSources).toContain('Folder File: src/components/Input.tsx');
  });

  it('should include vector search results', async () => {
    const mockVectorResults: VectorSearchResult[] = [
      {
        chunk_id: 'chunk-1',
        original_file_path: 'src/utils.js',
        start_line: 10,
        end_line: 20,
        score: 0.95,
        text_snippet: 'function helper() { return true; }'
      }
    ];

    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    const result = await buildPromptContext(mockEnv, projectId, {
      vectorSearchResults: mockVectorResults,
      includePinned: false
    });

    expect(result.contextString).toContain('--- RETRIEVED CODE SNIPPET (src/utils.js L10, Score: 0.95) ---');
    expect(result.contextString).toContain('function helper() { return true; }');
    expect(result.includedSources).toContain('Retrieved: src/utils.js L10');
  });

  it('should combine pinned file paths with explicit paths', async () => {
    const mockPinnedItems: PinnedContextItem[] = [
      {
        id: 'pin-1',
        projectId,
        type: 'file_path',
        content: 'src/config.js',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    const mockFileContent = 'export const config = { api: "localhost" };';

    vi.mocked(getPinnedItemsForProject).mockResolvedValue(mockPinnedItems);
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValue({
      text: () => Promise.resolve(mockFileContent),
      size: mockFileContent.length
    } as any);

    const result = await buildPromptContext(mockEnv, projectId, {
      explicitPaths: ['src/auth.js'], // This should be combined with pinned file path
      includePinned: true
    });

    // Should fetch both the explicit path and the pinned file path
    expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(
      'projects/test-project-123/original/src/config.js'
    );
    expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith(
      'projects/test-project-123/original/src/auth.js'
    );
  });

  it('should filter pinned items by specific IDs when provided', async () => {
    const mockPinnedItems: PinnedContextItem[] = [
      {
        id: 'pin-1',
        projectId,
        type: 'text_snippet',
        content: 'First snippet',
        description: 'First',
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'pin-2',
        projectId,
        type: 'text_snippet',
        content: 'Second snippet',
        description: 'Second',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    vi.mocked(getPinnedItemsForProject).mockResolvedValue(mockPinnedItems);

    const result = await buildPromptContext(mockEnv, projectId, {
      pinnedItemIds: ['pin-1'], // Only include first pinned item
      includePinned: true
    });

    expect(result.contextString).toContain('First snippet');
    expect(result.contextString).not.toContain('Second snippet');
    expect(result.includedSources).toContain('Pinned Snippet: First');
    expect(result.includedSources).not.toContain('Pinned Snippet: Second');
  });

  it('should handle errors gracefully and return error context', async () => {
    vi.mocked(getPinnedItemsForProject).mockRejectedValue(new Error('KV error'));

    const result = await buildPromptContext(mockEnv, projectId, {
      includePinned: true
    });

    expect(result.contextString).toBe('--- ERROR: Failed to build context ---\n');
    expect(result.includedSources).toEqual(['Error: Context build failed']);
    expect(result.totalCharacters).toBe(0);
  });

  it('should respect maxFolderFiles limit', async () => {
    const mockListResult = {
      objects: Array.from({ length: 15 }, (_, i) => ({
        key: `projects/test-project-123/original/src/file${i}.js`
      })),
      truncated: true
    };

    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.list).mockResolvedValue(mockListResult as any);
    vi.mocked(getPinnedItemsForProject).mockResolvedValue([]);

    // Mock file content for each file
    for (let i = 0; i < 5; i++) {
      vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get).mockResolvedValueOnce({
        text: () => Promise.resolve(`content ${i}`),
        size: 10
      } as any);
    }

    await buildPromptContext(mockEnv, projectId, {
      explicitPaths: ['src/'],
      includePinned: false,
      maxFolderFiles: 5
    });

    expect(mockEnv.CODE_UPLOADS_BUCKET.list).toHaveBeenCalledWith({
      prefix: 'projects/test-project-123/original/src/',
      limit: 5
    });
  });
}); 