/**
 * Unit tests for Read File Tool
 * Tests RFC-AGT-002: Tool Definition & Execution Framework
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeReadFile } from './readFileTool.js';
import type { Env } from '../types.js';

describe('Read File Tool', () => {
  let mockEnv: Env;
  let mockR2Bucket: R2Bucket;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockR2Bucket = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      head: vi.fn(),
      list: vi.fn()
    } as unknown as R2Bucket;

    mockEnv = {
      ENVIRONMENT: 'test',
      CODE_UPLOADS_BUCKET: mockR2Bucket,
      METADATA_KV: {} as KVNamespace,
      VECTORIZE_INDEX: {} as VectorizeIndex
    };
  });

  it('should successfully read a TypeScript file', async () => {
    const fileContent = `import { User } from './types';

export function createUser(name: string): User {
  return {
    id: generateId(),
    name,
    createdAt: new Date()
  };
}`;

    const mockR2Object = {
      text: vi.fn().mockResolvedValue(fileContent)
    } as unknown as R2ObjectBody;

    vi.mocked(mockR2Bucket.get).mockResolvedValue(mockR2Object);

    const result = await executeReadFile(
      mockEnv,
      'test-project-id',
      { file_path: 'src/utils/user.ts' }
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toContain('Content of file: **src/utils/user.ts**');
    expect(result.tool_output).toContain('```typescript');
    expect(result.tool_output).toContain('export function createUser');
    expect(result.tool_output).toContain('import { User }');

    expect(mockR2Bucket.get).toHaveBeenCalledWith('projects/test-project-id/original/src/utils/user.ts');
  });

  it('should handle file not found', async () => {
    vi.mocked(mockR2Bucket.get).mockResolvedValue(null);

    const result = await executeReadFile(
      mockEnv,
      'test-project-id',
      { file_path: 'nonexistent/file.ts' }
    );

    expect(result.error).toBe('File not found: nonexistent/file.ts');
    expect(result.tool_output).toBe('');
  });

  it('should handle R2 errors', async () => {
    vi.mocked(mockR2Bucket.get).mockRejectedValue(new Error('R2 access denied'));

    const result = await executeReadFile(
      mockEnv,
      'test-project-id',
      { file_path: 'src/config.ts' }
    );

    expect(result.error).toBe('Failed to read file src/config.ts: R2 access denied');
    expect(result.tool_output).toBe('');
  });

  it('should detect language from file extension correctly', async () => {
    const testCases = [
      { filePath: 'script.py', expectedLang: 'python', content: 'def hello():\n    print("Hello")' },
      { filePath: 'component.jsx', expectedLang: 'javascript', content: 'export const Component = () => <div />;' },
      { filePath: 'styles.css', expectedLang: 'css', content: '.container { margin: 0; }' },
      { filePath: 'README.md', expectedLang: 'markdown', content: '# Project Title\n\nDescription here.' },
      { filePath: 'config.json', expectedLang: 'json', content: '{"key": "value"}' },
      { filePath: 'unknown.xyz', expectedLang: 'text', content: 'Unknown file type content' }
    ];

    for (const testCase of testCases) {
      const mockR2Object = {
        text: vi.fn().mockResolvedValue(testCase.content)
      } as unknown as R2ObjectBody;

      vi.mocked(mockR2Bucket.get).mockResolvedValue(mockR2Object);

      const result = await executeReadFile(
        mockEnv,
        'test-project-id',
        { file_path: testCase.filePath }
      );

      expect(result.error).toBeUndefined();
      expect(result.tool_output).toContain(`\`\`\`${testCase.expectedLang}`);
      expect(result.tool_output).toContain(testCase.content);
    }
  });

  it('should handle empty files', async () => {
    const mockR2Object = {
      text: vi.fn().mockResolvedValue('')
    } as unknown as R2ObjectBody;

    vi.mocked(mockR2Bucket.get).mockResolvedValue(mockR2Object);

    const result = await executeReadFile(
      mockEnv,
      'test-project-id',
      { file_path: 'empty.txt' }
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toContain('Content of file: **empty.txt**');
    expect(result.tool_output).toContain('```text\n\n```'); // Empty content between code blocks
  });

  it('should handle large files', async () => {
    const largeContent = 'x'.repeat(10000); // 10KB file
    
    const mockR2Object = {
      text: vi.fn().mockResolvedValue(largeContent)
    } as unknown as R2ObjectBody;

    vi.mocked(mockR2Bucket.get).mockResolvedValue(mockR2Object);

    const result = await executeReadFile(
      mockEnv,
      'test-project-id',
      { file_path: 'large.txt' }
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toContain(largeContent);
    expect(result.tool_output.length).toBeGreaterThan(10000);
  });

  it('should handle files with special characters in path', async () => {
    const fileContent = 'console.log("Hello, world!");';
    
    const mockR2Object = {
      text: vi.fn().mockResolvedValue(fileContent)
    } as unknown as R2ObjectBody;

    vi.mocked(mockR2Bucket.get).mockResolvedValue(mockR2Object);

    const result = await executeReadFile(
      mockEnv,
      'test-project-id',
      { file_path: 'src/components/user-profile/UserProfile.component.ts' }
    );

    expect(result.error).toBeUndefined();
    expect(result.tool_output).toContain('Content of file: **src/components/user-profile/UserProfile.component.ts**');
    expect(mockR2Bucket.get).toHaveBeenCalledWith('projects/test-project-id/original/src/components/user-profile/UserProfile.component.ts');
  });

  it('should handle text() method errors', async () => {
    const mockR2Object = {
      text: vi.fn().mockRejectedValue(new Error('Failed to read text'))
    } as unknown as R2ObjectBody;

    vi.mocked(mockR2Bucket.get).mockResolvedValue(mockR2Object);

    const result = await executeReadFile(
      mockEnv,
      'test-project-id',
      { file_path: 'corrupted.txt' }
    );

    expect(result.error).toBe('Failed to read file corrupted.txt: Failed to read text');
    expect(result.tool_output).toBe('');
  });
}); 