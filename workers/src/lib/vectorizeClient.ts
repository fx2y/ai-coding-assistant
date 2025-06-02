/**
 * Vectorize Client - Helper functions for Cloudflare Vectorize operations
 * Implements RFC-IDX-001: Embedding storage in Vectorize (P1-E2-S2)
 */

import type { VectorMetadata } from '../types.js';

/**
 * Insert a single vector into Vectorize index
 */
export async function insertVector(
  index: VectorizeIndex,
  id: string,
  values: number[],
  metadata: VectorMetadata
): Promise<VectorizeVectorMutation> {
  // Ensure metadata is compatible with Vectorize constraints
  const preparedMetadata: Record<string, string | number | boolean> = {
    projectId: metadata.projectId,
    chunkId: metadata.chunkId,
    originalFilePath: metadata.originalFilePath,
    ...(metadata.startLine !== undefined && { startLine: metadata.startLine })
  };

  return index.upsert([{
    id,
    values,
    metadata: preparedMetadata
  }]);
}

/**
 * Insert multiple vectors in batch for better performance
 */
export async function insertVectorsBatch(
  index: VectorizeIndex,
  vectors: Array<{
    id: string;
    values: number[];
    metadata: VectorMetadata;
  }>
): Promise<VectorizeVectorMutation> {
  const preparedVectors = vectors.map(vector => ({
    id: vector.id,
    values: vector.values,
    metadata: {
      projectId: vector.metadata.projectId,
      chunkId: vector.metadata.chunkId,
      originalFilePath: vector.metadata.originalFilePath,
      ...(vector.metadata.startLine !== undefined && { startLine: vector.metadata.startLine })
    } as Record<string, string | number | boolean>
  }));

  return index.upsert(preparedVectors);
}

/**
 * Query vectors by similarity (will be used in P1-E3-S1)
 */
export async function queryVectors(
  index: VectorizeIndex,
  queryVector: number[],
  topK: number = 10,
  filter?: Record<string, any>
): Promise<VectorizeMatches> {
  return index.query(queryVector, {
    topK,
    returnMetadata: true,
    returnValues: false,
    ...(filter && { filter })
  });
}

/**
 * Query vectors with project filtering for search operations (P1-E3-S1)
 */
export async function queryVectorsForProject(
  index: VectorizeIndex,
  queryVector: number[],
  projectId: string,
  topK: number = 10
): Promise<VectorizeMatches> {
  return index.query(queryVector, {
    topK,
    returnMetadata: true,
    returnValues: false,
    filter: { projectId }
  });
}

/**
 * Get index statistics (for debugging and monitoring)
 */
export async function getIndexInfo(index: VectorizeIndex): Promise<VectorizeIndexDetails> {
  return index.describe();
}