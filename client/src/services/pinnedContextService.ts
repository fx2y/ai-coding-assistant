/**
 * Pinned Context API Service
 * Implements P2-E1-S2: Client-side pinned context management
 */

export interface PinnedContextItem {
  id: string;
  projectId: string;
  type: 'file_path' | 'text_snippet';
  content: string;
  description?: string;
  createdAt: string;
}

export interface CreatePinnedItemRequest {
  type: 'file_path' | 'text_snippet';
  content: string;
  description?: string;
}

export interface PinnedContextListResponse {
  items: PinnedContextItem[];
  count: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    error: string;
    message: string;
    code?: string;
    details?: unknown;
    requestId?: string;
  };
  requestId?: string;
}

// Configuration
const WORKER_BASE_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

/**
 * Add a new pinned context item
 */
export async function addPinnedItem(
  projectId: string,
  request: CreatePinnedItemRequest
): Promise<ApiResponse<PinnedContextItem>> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/project/${projectId}/pinned_context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result,
        requestId: result.requestId
      };
    }

    return {
      success: true,
      data: result,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('Add pinned item request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the pinned context service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * List all pinned context items for a project
 */
export async function listPinnedItems(
  projectId: string
): Promise<ApiResponse<PinnedContextListResponse>> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/project/${projectId}/pinned_context`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result,
        requestId: result.requestId
      };
    }

    return {
      success: true,
      data: result,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('List pinned items request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the pinned context service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Remove a pinned context item
 */
export async function removePinnedItem(
  projectId: string,
  pinnedItemId: string
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/project/${projectId}/pinned_context/${pinnedItemId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result,
        requestId: result.requestId
      };
    }

    return {
      success: true,
      data: result,
      requestId: result.requestId
    };

  } catch (error) {
    console.error('Remove pinned item request failed:', error);
    
    return {
      success: false,
      error: {
        error: 'NetworkError',
        message: 'Failed to communicate with the pinned context service',
        code: 'NETWORK_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
} 