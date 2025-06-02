/**
 * Model Preferences Service
 * Implements RFC-MOD-001: User-Configurable Model Routing (Client-side)
 */

// Types matching the worker types
export interface ModelConfig {
  service: string;
  modelName: string;
  dimensions?: number;
}

export interface ModelPreferences {
  embedding_config: ModelConfig;
  chat_general_config: ModelConfig;
  code_generation_config: ModelConfig;
  re_ranking_config: ModelConfig;
  agent_reasoning_config: ModelConfig;
}

export interface TaskComplexityHint {
  taskType: string;
  suggestedTier: 'small_fast' | 'large_context_aware';
  reasoning: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    error: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Fetches model preferences for a project
 */
export async function getModelPreferences(projectId: string): Promise<ModelPreferences> {
  const response = await fetch(`/api/project/${projectId}/model_preferences`);
  const result: ApiResponse<ModelPreferences> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch model preferences');
  }

  return result.data;
}

/**
 * Saves model preferences for a project
 */
export async function saveModelPreferences(
  projectId: string, 
  preferences: ModelPreferences
): Promise<void> {
  const response = await fetch(`/api/project/${projectId}/model_preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(preferences)
  });

  const result: ApiResponse = await response.json();

  if (!result.success) {
    throw new Error(result.error?.message || 'Failed to save model preferences');
  }
}

/**
 * Gets default model preferences
 */
export async function getDefaultModelPreferences(): Promise<ModelPreferences> {
  const response = await fetch('/api/config/default_preferences');
  const result: ApiResponse<ModelPreferences> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch default preferences');
  }

  return result.data;
}

/**
 * Generates a task complexity hint
 */
export async function generateComplexityHint(
  taskType: string,
  context: {
    queryLength?: number;
    contextSize?: number;
    keywords?: string[];
  } = {}
): Promise<TaskComplexityHint> {
  const response = await fetch('/api/config/complexity_hint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      taskType,
      context
    })
  });

  const result: ApiResponse<TaskComplexityHint> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to generate complexity hint');
  }

  return result.data;
}

/**
 * Gets suggested models for a service and complexity tier
 */
export async function getSuggestedModels(
  service: string,
  tier: 'small_fast' | 'large_context_aware'
): Promise<string[]> {
  const response = await fetch(`/api/config/suggested_models/${service}/${tier}`);
  const result: ApiResponse<{ models: string[] }> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to get suggested models');
  }

  return result.data.models;
} 