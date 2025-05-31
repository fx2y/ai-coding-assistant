/**
 * Unit tests for Vectorize Client
 * Tests RFC-IDX-001: Vectorize operations (P1-E2-S2)
 */

import { describe, it, expect, vi } from 'vitest';
import { insertVector, insertVectorsBatch, queryVectors, getIndexInfo } from './vectorizeClient.js';
import type { VectorMetadata } from '../types.js';

// Mock VectorizeIndex
const mockVectorizeIndex = {
  upsert: vi.fn(),
  query: vi.fn(),
  describe: vi.fn()
} as unknown as VectorizeIndex;

describe('VectorizeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('insertVector', () => {
    it('should insert a single vector with metadata', async () => {
      const mockResult = { count: 1, mutationId: 'test-mutation' };
      (mockVectorizeIndex.upsert as any).mockResolvedValue(mockResult);

      const metadata: VectorMetadata = {
        projectId: 'test-project',
        chunkId: 'test-chunk',
        originalFilePath: 'test.ts',
        startLine: 1
      };

      const result = await insertVector(
        mockVectorizeIndex,
        'test-id',
        [0.1, 0.2, 0.3],
        metadata
      );

      expect(mockVectorizeIndex.upsert).toHaveBeenCalledWith([{
        id: 'test-id',
        values: [0.1, 0.2, 0.3],
        metadata: {
          projectId: 'test-project',
          chunkId: 'test-chunk',
          originalFilePath: 'test.ts',
          startLine: 1
        }
      }]);

      expect(result).toEqual(mockResult);
    });

    it('should handle metadata without startLine', async () => {
      const mockResult = { count: 1, mutationId: 'test-mutation' };
      (mockVectorizeIndex.upsert as any).mockResolvedValue(mockResult);

      const metadata: VectorMetadata = {
        projectId: 'test-project',
        chunkId: 'test-chunk',
        originalFilePath: 'test.ts'
      };

      await insertVector(
        mockVectorizeIndex,
        'test-id',
        [0.1, 0.2, 0.3],
        metadata
      );

      expect(mockVectorizeIndex.upsert).toHaveBeenCalledWith([{
        id: 'test-id',
        values: [0.1, 0.2, 0.3],
        metadata: {
          projectId: 'test-project',
          chunkId: 'test-chunk',
          originalFilePath: 'test.ts'
        }
      }]);
    });
  });

  describe('insertVectorsBatch', () => {
    it('should insert multiple vectors in batch', async () => {
      const mockResult = { count: 2, mutationId: 'test-batch-mutation' };
      (mockVectorizeIndex.upsert as any).mockResolvedValue(mockResult);

      const vectors = [
        {
          id: 'test-id-1',
          values: [0.1, 0.2, 0.3],
          metadata: {
            projectId: 'test-project',
            chunkId: 'test-chunk-1',
            originalFilePath: 'test1.ts',
            startLine: 1
          }
        },
        {
          id: 'test-id-2',
          values: [0.4, 0.5, 0.6],
          metadata: {
            projectId: 'test-project',
            chunkId: 'test-chunk-2',
            originalFilePath: 'test2.ts',
            startLine: 10
          }
        }
      ];

      const result = await insertVectorsBatch(mockVectorizeIndex, vectors);

      expect(mockVectorizeIndex.upsert).toHaveBeenCalledWith([
        {
          id: 'test-id-1',
          values: [0.1, 0.2, 0.3],
          metadata: {
            projectId: 'test-project',
            chunkId: 'test-chunk-1',
            originalFilePath: 'test1.ts',
            startLine: 1
          }
        },
        {
          id: 'test-id-2',
          values: [0.4, 0.5, 0.6],
          metadata: {
            projectId: 'test-project',
            chunkId: 'test-chunk-2',
            originalFilePath: 'test2.ts',
            startLine: 10
          }
        }
      ]);

      expect(result).toEqual(mockResult);
    });
  });

  describe('queryVectors', () => {
    it('should query vectors with default parameters', async () => {
      const mockResult = {
        matches: [
          { id: 'test-id-1', score: 0.95, metadata: { projectId: 'test-project' } }
        ]
      };
      (mockVectorizeIndex.query as any).mockResolvedValue(mockResult);

      const result = await queryVectors(
        mockVectorizeIndex,
        [0.1, 0.2, 0.3]
      );

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        { topK: 10, returnMetadata: true, returnValues: false }
      );

      expect(result).toEqual(mockResult);
    });

    it('should query vectors with custom parameters', async () => {
      const mockResult = {
        matches: [
          { id: 'test-id-1', score: 0.95, metadata: { projectId: 'test-project' } }
        ]
      };
      (mockVectorizeIndex.query as any).mockResolvedValue(mockResult);

      const result = await queryVectors(
        mockVectorizeIndex,
        [0.1, 0.2, 0.3],
        5,
        { projectId: 'test-project' }
      );

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        { 
          topK: 5,
          returnMetadata: true,
          returnValues: false,
          filter: { projectId: 'test-project' }
        }
      );

      expect(result).toEqual(mockResult);
    });
  });

  describe('getIndexInfo', () => {
    it('should get index information', async () => {
      const mockIndexInfo = {
        name: 'ai-assistant-code-embeddings',
        dimensions: 1536,
        metric: 'cosine',
        vectorCount: 100
      };
      (mockVectorizeIndex.describe as any).mockResolvedValue(mockIndexInfo);

      const result = await getIndexInfo(mockVectorizeIndex);

      expect(mockVectorizeIndex.describe).toHaveBeenCalled();
      expect(result).toEqual(mockIndexInfo);
    });
  });
}); 