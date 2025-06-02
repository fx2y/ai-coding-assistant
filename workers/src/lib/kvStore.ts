/**
 * KV Store Utilities - Typed helpers for chunk metadata operations
 * Implements RFC-IDX-001: Metadata storage in KV
 */

import type { ChunkMetadata, PinnedContextItem } from '../types.js';

/**
 * Generates KV keys for chunk metadata
 */
export function generateChunkMetadataKey(projectId: string, chunkId: string): string {
  return `project:${projectId}:chunk:${chunkId}`;
}

/**
 * Generates KV keys for file chunk index (maps file path to chunk IDs)
 */
export function generateFileChunksKey(projectId: string, filePath: string): string {
  return `project:${projectId}:filechunks:${filePath}`;
}

/**
 * Saves chunk metadata to KV
 */
export async function saveChunkMetadata(
  kv: KVNamespace,
  metadata: ChunkMetadata
): Promise<void> {
  const key = generateChunkMetadataKey(metadata.projectId, metadata.id);
  await kv.put(key, JSON.stringify(metadata));
}

/**
 * Retrieves chunk metadata from KV
 */
export async function getChunkMetadata(
  kv: KVNamespace,
  projectId: string,
  chunkId: string
): Promise<ChunkMetadata | null> {
  const key = generateChunkMetadataKey(projectId, chunkId);
  const value = await kv.get(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as ChunkMetadata;
  } catch (error) {
    console.error(`Failed to parse chunk metadata for ${key}:`, error);
    return null;
  }
}

/**
 * Saves file chunk index (list of chunk IDs for a file)
 */
export async function saveFileChunkIndex(
  kv: KVNamespace,
  projectId: string,
  filePath: string,
  chunkIds: string[]
): Promise<void> {
  const key = generateFileChunksKey(projectId, filePath);
  await kv.put(key, JSON.stringify(chunkIds));
}

/**
 * Retrieves file chunk index from KV
 */
export async function getFileChunkIndex(
  kv: KVNamespace,
  projectId: string,
  filePath: string
): Promise<string[] | null> {
  const key = generateFileChunksKey(projectId, filePath);
  const value = await kv.get(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as string[];
  } catch (error) {
    console.error(`Failed to parse file chunk index for ${key}:`, error);
    return null;
  }
}

/**
 * Lists all chunk metadata for a project
 */
export async function listProjectChunks(
  kv: KVNamespace,
  projectId: string
): Promise<ChunkMetadata[]> {
  const prefix = `project:${projectId}:chunk:`;
  const chunks: ChunkMetadata[] = [];

  try {
    const list = await kv.list({ prefix });

    for (const key of list.keys) {
      const value = await kv.get(key.name);
      if (value) {
        try {
          const metadata = JSON.parse(value) as ChunkMetadata;
          chunks.push(metadata);
        } catch (error) {
          console.error(`Failed to parse chunk metadata for ${key.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Failed to list chunks for project ${projectId}:`, error);
  }

  return chunks;
}

/**
 * Deletes all chunks and metadata for a project (cleanup utility)
 */
export async function deleteProjectChunks(
  kv: KVNamespace,
  projectId: string
): Promise<void> {
  const prefix = `project:${projectId}:`;

  try {
    const list = await kv.list({ prefix });

    for (const key of list.keys) {
      await kv.delete(key.name);
    }

    console.log(`Deleted ${list.keys.length} KV entries for project ${projectId}`);
  } catch (error) {
    console.error(`Failed to delete chunks for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Pinned Context KV Operations
 * Implements RFC-CTX-001, RFC-MEM-001
 */

/**
 * Generates KV keys for pinned context items
 */
export function generatePinnedItemKey(projectId: string, pinnedItemId: string): string {
  return `project:${projectId}:pinned_item:${pinnedItemId}`;
}

/**
 * Saves pinned context item to KV
 */
export async function savePinnedItem(
  kv: KVNamespace,
  item: PinnedContextItem
): Promise<void> {
  const key = generatePinnedItemKey(item.projectId, item.id);
  await kv.put(key, JSON.stringify(item));
}

/**
 * Retrieves pinned context item from KV
 */
export async function getPinnedItem(
  kv: KVNamespace,
  projectId: string,
  pinnedItemId: string
): Promise<PinnedContextItem | null> {
  const key = generatePinnedItemKey(projectId, pinnedItemId);
  const value = await kv.get(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as PinnedContextItem;
  } catch (error) {
    console.error(`Failed to parse pinned item for ${key}:`, error);
    return null;
  }
}

/**
 * Lists all pinned context items for a project
 */
export async function getPinnedItemsForProject(
  kv: KVNamespace,
  projectId: string
): Promise<PinnedContextItem[]> {
  const prefix = `project:${projectId}:pinned_item:`;
  const items: PinnedContextItem[] = [];

  try {
    const list = await kv.list({ prefix });

    for (const key of list.keys) {
      const value = await kv.get(key.name);
      if (value) {
        try {
          const item = JSON.parse(value) as PinnedContextItem;
          items.push(item);
        } catch (error) {
          console.error(`Failed to parse pinned item for ${key.name}:`, error);
        }
      }
    }

    // Sort by creation date (newest first)
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error(`Failed to list pinned items for project ${projectId}:`, error);
  }

  return items;
}

/**
 * Deletes a pinned context item from KV
 */
export async function deletePinnedItem(
  kv: KVNamespace,
  projectId: string,
  pinnedItemId: string
): Promise<void> {
  const key = generatePinnedItemKey(projectId, pinnedItemId);
  await kv.delete(key);
}