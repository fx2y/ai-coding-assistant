/**
 * Configuration Service - Model Preferences Management
 * Implements RFC-MOD-001: User-Configurable Model Routing
 * Implements RFC-MOD-002: Heuristic Task-Complexity Hinting
 */

import type {
  Env,
  ModelPreferences,
  ValidatedModelPreferences,
  TaskType,
  ModelConfig,
  TaskComplexityHint,
  ComplexityTier
} from '../types.js';
import { DEFAULT_MODEL_PREFERENCES } from '../types.js';

/**
 * Gets model preferences for a project from KV storage
 * Falls back to defaults if not found
 */
export async function getModelPreferences(
  env: Env,
  projectId: string
): Promise<ModelPreferences> {
  try {
    const kvKey = `project_config:${projectId}:model_prefs`;
    const storedPrefs = await env.METADATA_KV.get(kvKey);
    
    if (!storedPrefs) {
      console.log(`[ConfigService] No model preferences found for project ${projectId}, using defaults`);
      return DEFAULT_MODEL_PREFERENCES;
    }

    const parsedPrefs = JSON.parse(storedPrefs) as ModelPreferences;
    
    // Validate and merge with defaults to ensure all task types are covered
    const mergedPrefs: ModelPreferences = {
      ...DEFAULT_MODEL_PREFERENCES,
      ...parsedPrefs
    };

    console.log(`[ConfigService] Retrieved model preferences for project ${projectId}`, {
      embedding: mergedPrefs.embedding_config.modelName,
      chatGeneral: mergedPrefs.chat_general_config.modelName,
      codeGeneration: mergedPrefs.code_generation_config.modelName,
      reRanking: mergedPrefs.re_ranking_config.modelName,
      agentReasoning: mergedPrefs.agent_reasoning_config.modelName
    });

    return mergedPrefs;
  } catch (error) {
    console.error(`[ConfigService] Error retrieving model preferences for project ${projectId}:`, error);
    return DEFAULT_MODEL_PREFERENCES;
  }
}

/**
 * Saves model preferences for a project to KV storage
 */
export async function saveModelPreferences(
  env: Env,
  projectId: string,
  preferences: ValidatedModelPreferences
): Promise<void> {
  try {
    const kvKey = `project_config:${projectId}:model_prefs`;
    await env.METADATA_KV.put(kvKey, JSON.stringify(preferences));
    
    console.log(`[ConfigService] Saved model preferences for project ${projectId}`, {
      embedding: preferences.embedding_config.modelName,
      chatGeneral: preferences.chat_general_config.modelName,
      codeGeneration: preferences.code_generation_config.modelName,
      reRanking: preferences.re_ranking_config.modelName,
      agentReasoning: preferences.agent_reasoning_config.modelName
    });
  } catch (error) {
    console.error(`[ConfigService] Error saving model preferences for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Gets model configuration for a specific task type
 */
export async function getModelConfigForTask(
  env: Env,
  projectId: string,
  taskType: TaskType
): Promise<ModelConfig> {
  const preferences = await getModelPreferences(env, projectId);
  
  const configKey = `${taskType}_config` as keyof ModelPreferences;
  const config = preferences[configKey];
  
  console.log(`[ConfigService] Retrieved model config for task ${taskType}:`, {
    service: config.service,
    modelName: config.modelName
  });
  
  return config;
}

/**
 * Generates task complexity hints based on simple heuristics (RFC-MOD-002)
 */
export function generateTaskComplexityHint(
  taskType: TaskType,
  context: {
    queryLength?: number;
    contextSize?: number;
    keywords?: string[];
  }
): TaskComplexityHint {
  const { queryLength = 0, contextSize = 0, keywords = [] } = context;
  
  // Simple heuristics for complexity assessment
  const complexityIndicators = {
    longQuery: queryLength > 500,
    largeContext: contextSize > 10000,
    complexKeywords: keywords.some(keyword => 
      ['refactor', 'architecture', 'design', 'complex', 'entire', 'system'].includes(keyword.toLowerCase())
    ),
    simpleKeywords: keywords.some(keyword =>
      ['find', 'search', 'show', 'list', 'simple', 'quick'].includes(keyword.toLowerCase())
    )
  };

  let suggestedTier: ComplexityTier;
  let reasoning: string;

  // Task-specific complexity rules
  switch (taskType) {
    case 'embedding':
      // Embeddings are generally consistent in complexity
      suggestedTier = 'small_fast';
      reasoning = 'Embedding tasks have consistent computational requirements';
      break;
      
    case 'code_generation':
      if (complexityIndicators.complexKeywords || complexityIndicators.largeContext) {
        suggestedTier = 'large_context_aware';
        reasoning = 'Complex code generation benefits from larger, more capable models';
      } else {
        suggestedTier = 'small_fast';
        reasoning = 'Simple code generation can use faster models';
      }
      break;
      
    case 'agent_reasoning':
      if (complexityIndicators.longQuery || complexityIndicators.largeContext) {
        suggestedTier = 'large_context_aware';
        reasoning = 'Complex reasoning tasks require larger context windows and capabilities';
      } else {
        suggestedTier = 'small_fast';
        reasoning = 'Simple reasoning tasks can use faster models';
      }
      break;
      
    case 're_ranking':
      suggestedTier = 'small_fast';
      reasoning = 'Re-ranking tasks are typically straightforward and benefit from speed';
      break;
      
    case 'chat_general':
    default:
      if (complexityIndicators.simpleKeywords) {
        suggestedTier = 'small_fast';
        reasoning = 'Simple queries can use faster models for better response time';
      } else if (complexityIndicators.complexKeywords || complexityIndicators.longQuery) {
        suggestedTier = 'large_context_aware';
        reasoning = 'Complex queries benefit from more capable models';
      } else {
        suggestedTier = 'small_fast';
        reasoning = 'Default to faster models for general chat';
      }
      break;
  }

  return {
    taskType,
    suggestedTier,
    reasoning
  };
}

/**
 * Gets suggested model names based on complexity tier and service
 */
export function getSuggestedModelsForTier(
  service: string,
  tier: ComplexityTier
): string[] {
  const modelSuggestions: Record<string, Record<ComplexityTier, string[]>> = {
    'openai_chat': {
      'small_fast': ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k'],
      'large_context_aware': ['gpt-4', 'gpt-4-turbo', 'gpt-4-32k']
    },
    'openai_embedding': {
      'small_fast': ['text-embedding-ada-002'],
      'large_context_aware': ['text-embedding-ada-002']
    },
    'anthropic_claude': {
      'small_fast': ['claude-3-haiku-20240307'],
      'large_context_aware': ['claude-3-sonnet-20240229', 'claude-3-opus-20240229']
    },
    'jina_embedding': {
      'small_fast': ['jina-embeddings-v2-base-en'],
      'large_context_aware': ['jina-embeddings-v2-base-en']
    },
    'cohere_generate': {
      'small_fast': ['command-light'],
      'large_context_aware': ['command', 'command-nightly']
    },
    'cohere_embed': {
      'small_fast': ['embed-english-light-v2.0'],
      'large_context_aware': ['embed-english-v2.0']
    }
  };

  return modelSuggestions[service]?.[tier] || [];
} 