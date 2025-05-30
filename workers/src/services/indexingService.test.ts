/**
 * Unit tests for Indexing Service
 * Tests P1-E1-S1: ZIP Processing & R2 Storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processAndStoreZip, generateProjectId } from './indexingService.js';

// Mock JSZip
vi.mock('jszip', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      loadAsync: vi.fn(),
      files: {}
    }))
  };
});

// Mock R2 bucket
const createMockR2Bucket = () => ({
  put: vi.fn().mockResolvedValue(undefined)
});

// Mock File object
const createMockFile = (content: string, name: string) => ({
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(content.length)),
  name,
  size: content.length,
  type: 'application/zip'
});

describe('indexingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateProjectId', () => {
    it('should generate a valid UUID', () => {
      // Mock crypto.randomUUID
      const mockUUID = 'test-uuid-123';
      vi.stubGlobal('crypto', {
        randomUUID: vi.fn(() => mockUUID)
      });

      const projectId = generateProjectId();
      expect(projectId).toBe(mockUUID);
      expect(crypto.randomUUID).toHaveBeenCalled();
    });
  });

  describe('processAndStoreZip', () => {
    it('should process a ZIP file and store files in R2', async () => {
      const mockBucket = createMockR2Bucket();
      const projectId = 'test-project-123';
      const mockFile = createMockFile('test content', 'test.zip') as any;

      // Mock JSZip behavior
      const JSZip = await import('jszip');
      const mockZip = {
        files: {
          'src/main.js': {
            dir: false,
            async: vi.fn().mockResolvedValue(new ArrayBuffer(10))
          },
          'README.md': {
            dir: false,
            async: vi.fn().mockResolvedValue(new ArrayBuffer(20))
          },
          'src/': {
            dir: true
          }
        }
      };

      const mockJSZipInstance = {
        loadAsync: vi.fn().mockResolvedValue(mockZip)
      };

      vi.mocked(JSZip.default).mockReturnValue(mockJSZipInstance as any);

      const result = await processAndStoreZip(mockBucket as any, projectId, mockFile);

      // Verify files were processed
      expect(result.uploadedFiles).toHaveLength(2);
      expect(result.uploadedFiles[0]?.path).toBe('src/main.js');
      expect(result.uploadedFiles[0]?.r2Key).toBe('projects/test-project-123/original/src/main.js');
      expect(result.uploadedFiles[1]?.path).toBe('README.md');
      expect(result.uploadedFiles[1]?.r2Key).toBe('projects/test-project-123/original/README.md');

      // Verify R2 put was called correctly
      expect(mockBucket.put).toHaveBeenCalledTimes(2);
      expect(mockBucket.put).toHaveBeenCalledWith(
        'projects/test-project-123/original/src/main.js',
        expect.any(ArrayBuffer),
        expect.objectContaining({
          httpMetadata: {
            contentType: 'application/javascript'
          },
          customMetadata: expect.objectContaining({
            projectId: 'test-project-123',
            originalPath: 'src/main.js'
          })
        })
      );
    });

    it('should skip directories and filtered files', async () => {
      const mockBucket = createMockR2Bucket();
      const projectId = 'test-project-123';
      const mockFile = createMockFile('test content', 'test.zip') as any;

      // Mock JSZip with files that should be skipped
      const JSZip = await import('jszip');
      const mockZip = {
        files: {
          'src/': { dir: true },
          'node_modules/package.json': { dir: false, async: vi.fn() },
          '.git/config': { dir: false, async: vi.fn() },
          'image.png': { dir: false, async: vi.fn() },
          'src/main.js': {
            dir: false,
            async: vi.fn().mockResolvedValue(new ArrayBuffer(10))
          }
        }
      };

      const mockJSZipInstance = {
        loadAsync: vi.fn().mockResolvedValue(mockZip)
      };

      vi.mocked(JSZip.default).mockReturnValue(mockJSZipInstance as any);

      const result = await processAndStoreZip(mockBucket as any, projectId, mockFile);

      // Only src/main.js should be processed
      expect(result.uploadedFiles).toHaveLength(1);
      expect(result.uploadedFiles[0]?.path).toBe('src/main.js');
      expect(mockBucket.put).toHaveBeenCalledTimes(1);
    });

    it('should handle R2 upload errors gracefully', async () => {
      const mockBucket = {
        put: vi.fn()
          .mockResolvedValueOnce(undefined) // First file succeeds
          .mockRejectedValueOnce(new Error('R2 error')) // Second file fails
      };
      const projectId = 'test-project-123';
      const mockFile = createMockFile('test content', 'test.zip') as any;

      // Mock JSZip
      const JSZip = await import('jszip');
      const mockZip = {
        files: {
          'src/main.js': {
            dir: false,
            async: vi.fn().mockResolvedValue(new ArrayBuffer(10))
          },
          'src/utils.js': {
            dir: false,
            async: vi.fn().mockResolvedValue(new ArrayBuffer(15))
          }
        }
      };

      const mockJSZipInstance = {
        loadAsync: vi.fn().mockResolvedValue(mockZip)
      };

      vi.mocked(JSZip.default).mockReturnValue(mockJSZipInstance as any);

      const result = await processAndStoreZip(mockBucket as any, projectId, mockFile);

      // One file should succeed, one should fail
      expect(result.uploadedFiles).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe('src/utils.js');
      expect(result.errors[0]?.error).toBe('R2 error');
    });

    it('should handle ZIP loading errors', async () => {
      const mockBucket = createMockR2Bucket();
      const projectId = 'test-project-123';
      const mockFile = createMockFile('invalid zip content', 'test.zip') as any;

      // Mock JSZip to throw error
      const JSZip = await import('jszip');
      const mockJSZipInstance = {
        loadAsync: vi.fn().mockRejectedValue(new Error('Invalid ZIP file'))
      };

      vi.mocked(JSZip.default).mockReturnValue(mockJSZipInstance as any);

      const result = await processAndStoreZip(mockBucket as any, projectId, mockFile);

      expect(result.uploadedFiles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe('ZIP_FILE');
      expect(result.errors[0]?.error).toContain('Invalid ZIP file');
    });
  });
});