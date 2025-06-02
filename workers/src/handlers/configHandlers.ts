/**
 * Configuration Handlers - Model Preferences API
 * Implements RFC-MOD-001: User-Configurable Model Routing
 * Implements RFC-MOD-002: Heuristic Task-Complexity Hinting
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
  Env,
  ApiResponse,
  ModelPreferences,
  TaskComplexityHint,
  TaskType
} from '../types.js';
import {
  ModelPreferencesSchema,
  DEFAULT_MODEL_PREFERENCES
} from '../types.js';
import {
  getModelPreferences,
  saveModelPreferences,
  generateTaskComplexityHint,
  getSuggestedModelsForTier
} from '../services/configService.js';

const configApp = new Hono<{ Bindings: Env }>();

/**
 * GET /api/project/:projectId/model_preferences
 * Retrieves model preferences for a project
 */
configApp.get('/project/:projectId/model_preferences', async (c: Context<{ Bindings: Env }>) => {
  try {
    const projectId = c.req.param('projectId');
    
    if (!projectId) {
      return c.json<ApiResponse>({
        success: false,
        error: {
          error: 'validation_error',
          message: 'Project ID is required'
        }
      }, 400);
    }

    const preferences = await getModelPreferences(c.env, projectId);

    return c.json<ApiResponse<ModelPreferences>>({
      success: true,
      data: preferences
    });

  } catch (error) {
    console.error('[ConfigHandlers] Error retrieving model preferences:', error);
    
    return c.json<ApiResponse>({
      success: false,
      error: {
        error: 'internal_error',
        message: 'Failed to retrieve model preferences'
      }
    }, 500);
  }
});

/**
 * POST /api/project/:projectId/model_preferences
 * Saves model preferences for a project
 */
configApp.post('/project/:projectId/model_preferences', async (c: Context<{ Bindings: Env }>) => {
  try {
    const projectId = c.req.param('projectId');
    
    if (!projectId) {
      return c.json<ApiResponse>({
        success: false,
        error: {
          error: 'validation_error',
          message: 'Project ID is required'
        }
      }, 400);
    }

    // Parse and validate request body
    const body = await c.req.json();
    const validationResult = ModelPreferencesSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json<ApiResponse>({
        success: false,
        error: {
          error: 'validation_error',
          message: 'Invalid model preferences format',
          details: validationResult.error.flatten()
        }
      }, 400);
    }

    const preferences = validationResult.data;
    await saveModelPreferences(c.env, projectId, preferences);

    return c.json<ApiResponse<{ message: string }>>({
      success: true,
      data: {
        message: 'Model preferences saved successfully'
      }
    });

  } catch (error) {
    console.error('[ConfigHandlers] Error saving model preferences:', error);
    
    return c.json<ApiResponse>({
      success: false,
      error: {
        error: 'internal_error',
        message: 'Failed to save model preferences'
      }
    }, 500);
  }
});

/**
 * GET /api/config/default_preferences
 * Returns default model preferences
 */
configApp.get('/config/default_preferences', async (c: Context<{ Bindings: Env }>) => {
  return c.json<ApiResponse<ModelPreferences>>({
    success: true,
    data: DEFAULT_MODEL_PREFERENCES
  });
});

/**
 * POST /api/config/complexity_hint
 * Generates task complexity hints based on context
 */
configApp.post('/config/complexity_hint', async (c: Context<{ Bindings: Env }>) => {
  try {
    const body = await c.req.json();
    const { taskType, context } = body as {
      taskType: TaskType;
      context: {
        queryLength?: number;
        contextSize?: number;
        keywords?: string[];
      };
    };

    if (!taskType) {
      return c.json<ApiResponse>({
        success: false,
        error: {
          error: 'validation_error',
          message: 'Task type is required'
        }
      }, 400);
    }

    const hint = generateTaskComplexityHint(taskType, context || {});

    return c.json<ApiResponse<TaskComplexityHint>>({
      success: true,
      data: hint
    });

  } catch (error) {
    console.error('[ConfigHandlers] Error generating complexity hint:', error);
    
    return c.json<ApiResponse>({
      success: false,
      error: {
        error: 'internal_error',
        message: 'Failed to generate complexity hint'
      }
    }, 500);
  }
});

/**
 * GET /api/config/suggested_models/:service/:tier
 * Returns suggested models for a service and complexity tier
 */
configApp.get('/config/suggested_models/:service/:tier', async (c: Context<{ Bindings: Env }>) => {
  try {
    const service = c.req.param('service');
    const tier = c.req.param('tier') as 'small_fast' | 'large_context_aware';
    
    if (!service || !tier) {
      return c.json<ApiResponse>({
        success: false,
        error: {
          error: 'validation_error',
          message: 'Service and tier are required'
        }
      }, 400);
    }

    if (!['small_fast', 'large_context_aware'].includes(tier)) {
      return c.json<ApiResponse>({
        success: false,
        error: {
          error: 'validation_error',
          message: 'Invalid complexity tier'
        }
      }, 400);
    }

    const suggestedModels = getSuggestedModelsForTier(service, tier);

    return c.json<ApiResponse<{ models: string[] }>>({
      success: true,
      data: {
        models: suggestedModels
      }
    });

  } catch (error) {
    console.error('[ConfigHandlers] Error getting suggested models:', error);
    
    return c.json<ApiResponse>({
      success: false,
      error: {
        error: 'internal_error',
        message: 'Failed to get suggested models'
      }
    }, 500);
  }
});

export { configApp }; 