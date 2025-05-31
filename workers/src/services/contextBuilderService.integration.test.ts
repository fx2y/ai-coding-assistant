/**
 * Context Builder Service Integration Tests
 * Demonstrates P2-E1-S1: Complete @tag parsing and context building workflow
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

describe('P2-E1-S1 Integration: @tag parsing and context building', () => {
  let mockEnv: Env;
  const projectId = 'test-project-123';

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  it('should demonstrate complete workflow: @tags + pinned items + vector results', async () => {
    // 1. Setup: User query with @tags
    const userQuery = 'How does authentication work in @auth.js? Also check @utils/security.js for helpers.';
    
    // 2. Parse @tags from query
    const { explicitPaths, cleanedQuery } = parseExplicitTags(userQuery);
    expect(explicitPaths).toEqual(['auth.js', 'utils/security.js']);
    expect(cleanedQuery).toBe('How does authentication work in ? Also check  for helpers.');

    // 3. Setup pinned items (both file path and text snippet)
    const mockPinnedItems: PinnedContextItem[] = [
      {
        id: 'pin-1',
        projectId,
        type: 'file_path',
        content: 'config/auth-config.js',
        description: 'Auth Configuration',
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'pin-2',
        projectId,
        type: 'text_snippet',
        content: 'Remember: Always validate JWT tokens on server side',
        description: 'Security Note',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    // 4. Setup vector search results
    const mockVectorResults: VectorSearchResult[] = [
      {
        chunk_id: 'chunk-1',
        original_file_path: 'middleware/auth.js',
        start_line: 15,
        end_line: 25,
        score: 0.92,
        text_snippet: 'function validateToken(token) {\n  // JWT validation logic\n  return jwt.verify(token, secret);\n}'
      }
    ];

    // 5. Setup file content mocks
    const authFileContent = `
export function authenticate(req, res, next) {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  // Validate token logic here
  next();
}`;

    const securityUtilsContent = `
export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET);
}`;

    const authConfigContent = `
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET,
  tokenExpiry: '24h',
  refreshTokenExpiry: '7d'
};`;

    // 6. Mock R2 responses
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get)
      .mockResolvedValueOnce({
        text: () => Promise.resolve(authFileContent),
        size: authFileContent.length
      } as any)
      .mockResolvedValueOnce({
        text: () => Promise.resolve(securityUtilsContent),
        size: securityUtilsContent.length
      } as any)
      .mockResolvedValueOnce({
        text: () => Promise.resolve(authConfigContent),
        size: authConfigContent.length
      } as any);

    // 7. Mock KV response
    vi.mocked(getPinnedItemsForProject).mockResolvedValue(mockPinnedItems);

    // 8. Build complete context
    const contextResult = await buildPromptContext(mockEnv, projectId, {
      explicitPaths,
      includePinned: true,
      vectorSearchResults: mockVectorResults
    });

    // 9. Verify complete context includes all sources
    expect(contextResult.contextString).toContain('--- FILE: auth.js ---');
    expect(contextResult.contextString).toContain('export function authenticate');
    
    expect(contextResult.contextString).toContain('--- FILE: utils/security.js ---');
    expect(contextResult.contextString).toContain('export function hashPassword');
    
    expect(contextResult.contextString).toContain('--- FILE: config/auth-config.js ---');
    expect(contextResult.contextString).toContain('export const authConfig');
    
    expect(contextResult.contextString).toContain('--- PINNED SNIPPET: Security Note ---');
    expect(contextResult.contextString).toContain('Always validate JWT tokens');
    
    expect(contextResult.contextString).toContain('--- RETRIEVED CODE SNIPPET (middleware/auth.js L15, Score: 0.92) ---');
    expect(contextResult.contextString).toContain('function validateToken');

    // 10. Verify included sources tracking
    expect(contextResult.includedSources).toContain('File: auth.js');
    expect(contextResult.includedSources).toContain('File: utils/security.js');
    expect(contextResult.includedSources).toContain('File: config/auth-config.js');
    expect(contextResult.includedSources).toContain('Pinned Snippet: Security Note');
    expect(contextResult.includedSources).toContain('Retrieved: middleware/auth.js L15');

    // 11. Verify R2 calls were made correctly
    expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith('projects/test-project-123/original/auth.js');
    expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith('projects/test-project-123/original/utils/security.js');
    expect(mockEnv.CODE_UPLOADS_BUCKET.get).toHaveBeenCalledWith('projects/test-project-123/original/config/auth-config.js');

    // 12. Verify total character count
    expect(contextResult.totalCharacters).toBeGreaterThan(0);
    
    console.log('✅ P2-E1-S1 Integration Test: Complete context building workflow verified');
    console.log(`📊 Context includes ${contextResult.includedSources.length} sources with ${contextResult.totalCharacters} characters`);
  });

  it('should handle @folder tags and combine with pinned items', async () => {
    // 1. User query with folder tag
    const userQuery = 'Analyze the structure of @src/components/ folder';
    const { explicitPaths, cleanedQuery } = parseExplicitTags(userQuery);
    
    expect(explicitPaths).toEqual(['src/components/']);
    expect(cleanedQuery).toBe('Analyze the structure of  folder');

    // 2. Setup folder listing
    const mockListResult = {
      objects: [
        { key: 'projects/test-project-123/original/src/components/Button.tsx' },
        { key: 'projects/test-project-123/original/src/components/Input.tsx' }
      ],
      truncated: false
    };

    const buttonContent = 'export const Button = ({ children, onClick }) => <button onClick={onClick}>{children}</button>';
    const inputContent = 'export const Input = ({ value, onChange }) => <input value={value} onChange={onChange} />';

    // 3. Setup pinned text snippet
    const mockPinnedItems: PinnedContextItem[] = [
      {
        id: 'pin-1',
        projectId,
        type: 'text_snippet',
        content: 'Components should follow atomic design principles',
        description: 'Design System Notes',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ];

    // 4. Mock responses
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.list).mockResolvedValue(mockListResult as any);
    vi.mocked(mockEnv.CODE_UPLOADS_BUCKET.get)
      .mockResolvedValueOnce({
        text: () => Promise.resolve(buttonContent),
        size: buttonContent.length
      } as any)
      .mockResolvedValueOnce({
        text: () => Promise.resolve(inputContent),
        size: inputContent.length
      } as any);

    vi.mocked(getPinnedItemsForProject).mockResolvedValue(mockPinnedItems);

    // 5. Build context
    const contextResult = await buildPromptContext(mockEnv, projectId, {
      explicitPaths,
      includePinned: true
    });

    // 6. Verify folder files and pinned content are included
    expect(contextResult.contextString).toContain('--- FILE: src/components/Button.tsx ---');
    expect(contextResult.contextString).toContain('--- FILE: src/components/Input.tsx ---');
    expect(contextResult.contextString).toContain('--- PINNED SNIPPET: Design System Notes ---');
    expect(contextResult.contextString).toContain('atomic design principles');

    expect(contextResult.includedSources).toContain('Folder File: src/components/Button.tsx');
    expect(contextResult.includedSources).toContain('Folder File: src/components/Input.tsx');
    expect(contextResult.includedSources).toContain('Pinned Snippet: Design System Notes');

    console.log('✅ P2-E1-S1 Integration Test: @folder + pinned items workflow verified');
  });
}); 