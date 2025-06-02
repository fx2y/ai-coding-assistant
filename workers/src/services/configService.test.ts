/**
 * Configuration Service Tests
 * Tests for RFC-MOD-001: User-Configurable Model Routing
 * Tests for RFC-MOD-002: Heuristic Task-Complexity Hinting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getModelPreferences,
  saveModelPreferences,
  getModelConfigForTask,
  generateTaskComplexityHint,
  getSuggestedModelsForTier
} from './configService.js';
import { DEFAULT_MODEL_PREFERENCES } from '../types.js';
import type { Env, ModelPreferences, TaskType, ComplexityTier } from '../types.js';

describe('Configuration Service', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test',
      METADATA_KV: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn()
      },
      CODE_UPLOADS_BUCKET: {
        get: vi.fn()
      },
      PROXY_WORKER_URL: 'http://localhost:8787/api/proxy/external'
    } as any;
  });

  describe('getModelPreferences', () => {
    it('should return stored preferences when they exist', async () => {
      const storedPrefs: ModelPreferences = {
        embedding_config: { service: 'jina_embedding', modelName: 'jina-embeddings-v2-base-en' },
        chat_general_config: { service: 'anthropic_claude', modelName: 'claude-3-haiku' },
        code_generation_config: { service: 'openai_chat', modelName: 'gpt-4' },
        re_ranking_config: { service: 'openai_chat', modelName: 'gpt-3.5-turbo' },
        agent_reasoning_config: { service: 'anthropic_claude', modelName: 'claude-3-sonnet' }
      };

      mockEnv.METADATA_KV.get = vi.fn().mockResolvedValue(JSON.stringify(storedPrefs));

      const result = await getModelPreferences(mockEnv, 'test-project-id');

      expect(mockEnv.METADATA_KV.get).toHaveBeenCalledWith('project_config:test-project-id:model_prefs');
      expect(result).toEqual(storedPrefs);
    });

    it('should return defaults when no preferences are stored', async () => {
      mockEnv.METADATA_KV.get = vi.fn().mockResolvedValue(null);

      const result = await getModelPreferences(mockEnv, 'test-project-id');

      expect(result).toEqual(DEFAULT_MODEL_PREFERENCES);
    });

    it('should merge with defaults when stored preferences are incomplete', async () => {
      const partialPrefs = {
        embedding_config: { service: 'jina_embedding', modelName: 'jina-embeddings-v2-base-en' }
      };

      mockEnv.METADATA_KV.get = vi.fn().mockResolvedValue(JSON.stringify(partialPrefs));

      const result = await getModelPreferences(mockEnv, 'test-project-id');

      expect(result.embedding_config).toEqual(partialPrefs.embedding_config);
      expect(result.chat_general_config).toEqual(DEFAULT_MODEL_PREFERENCES.chat_general_config);
    });

    it('should return defaults when KV throws an error', async () => {
      mockEnv.METADATA_KV.get = vi.fn().mockRejectedValue(new Error('KV error'));

      const result = await getModelPreferences(mockEnv, 'test-project-id');

      expect(result).toEqual(DEFAULT_MODEL_PREFERENCES);
    });

    it('should return defaults when stored data is invalid JSON', async () => {
      mockEnv.METADATA_KV.get = vi.fn().mockResolvedValue('invalid json');

      const result = await getModelPreferences(mockEnv, 'test-project-id');

      expect(result).toEqual(DEFAULT_MODEL_PREFERENCES);
    });
  });

  describe('saveModelPreferences', () => {
    it('should save preferences to KV storage', async () => {
      const preferences: ModelPreferences = {
        embedding_config: { service: 'jina_embedding', modelName: 'jina-embeddings-v2-base-en' },
        chat_general_config: { service: 'anthropic_claude', modelName: 'claude-3-haiku' },
        code_generation_config: { service: 'openai_chat', modelName: 'gpt-4' },
        re_ranking_config: { service: 'openai_chat', modelName: 'gpt-3.5-turbo' },
        agent_reasoning_config: { service: 'anthropic_claude', modelName: 'claude-3-sonnet' }
      };

      mockEnv.METADATA_KV.put = vi.fn().mockResolvedValue(undefined);

      await saveModelPreferences(mockEnv, 'test-project-id', preferences);

      expect(mockEnv.METADATA_KV.put).toHaveBeenCalledWith(
        'project_config:test-project-id:model_prefs',
        JSON.stringify(preferences)
      );
    });

    it('should throw error when KV put fails', async () => {
      const preferences = DEFAULT_MODEL_PREFERENCES;
      mockEnv.METADATA_KV.put = vi.fn().mockRejectedValue(new Error('KV put failed'));

      await expect(saveModelPreferences(mockEnv, 'test-project-id', preferences))
        .rejects.toThrow('KV put failed');
    });
  });

  describe('getModelConfigForTask', () => {
    it('should return correct config for each task type', async () => {
      const customPrefs: ModelPreferences = {
        embedding_config: { service: 'jina_embedding', modelName: 'jina-embeddings-v2-base-en' },
        chat_general_config: { service: 'anthropic_claude', modelName: 'claude-3-haiku' },
        code_generation_config: { service: 'openai_chat', modelName: 'gpt-4' },
        re_ranking_config: { service: 'openai_chat', modelName: 'gpt-3.5-turbo' },
        agent_reasoning_config: { service: 'anthropic_claude', modelName: 'claude-3-sonnet' }
      };

      mockEnv.METADATA_KV.get = vi.fn().mockResolvedValue(JSON.stringify(customPrefs));

      const embeddingConfig = await getModelConfigForTask(mockEnv, 'test-project-id', 'embedding');
      expect(embeddingConfig).toEqual(customPrefs.embedding_config);

      const chatConfig = await getModelConfigForTask(mockEnv, 'test-project-id', 'chat_general');
      expect(chatConfig).toEqual(customPrefs.chat_general_config);

      const codeConfig = await getModelConfigForTask(mockEnv, 'test-project-id', 'code_generation');
      expect(codeConfig).toEqual(customPrefs.code_generation_config);

      const rerankConfig = await getModelConfigForTask(mockEnv, 'test-project-id', 're_ranking');
      expect(rerankConfig).toEqual(customPrefs.re_ranking_config);

      const agentConfig = await getModelConfigForTask(mockEnv, 'test-project-id', 'agent_reasoning');
      expect(agentConfig).toEqual(customPrefs.agent_reasoning_config);
    });
  });

  describe('generateTaskComplexityHint', () => {
    it('should suggest small_fast for simple embedding tasks', () => {
      const hint = generateTaskComplexityHint('embedding', {
        queryLength: 50,
        contextSize: 100
      });

      expect(hint.taskType).toBe('embedding');
      expect(hint.suggestedTier).toBe('small_fast');
      expect(hint.reasoning).toContain('consistent');
    });

    it('should suggest large_context_aware for complex code generation tasks', () => {
      const hint = generateTaskComplexityHint('code_generation', {
        queryLength: 200,
        contextSize: 5000,
        keywords: ['refactor', 'architecture', 'complex']
      });

      expect(hint.taskType).toBe('code_generation');
      expect(hint.suggestedTier).toBe('large_context_aware');
      expect(hint.reasoning).toContain('Complex');
    });

    it('should suggest large_context_aware for agent reasoning tasks', () => {
      const hint = generateTaskComplexityHint('agent_reasoning', {
        queryLength: 1000,
        contextSize: 15000
      });

      expect(hint.taskType).toBe('agent_reasoning');
      expect(hint.suggestedTier).toBe('large_context_aware');
      expect(hint.reasoning).toContain('reasoning');
    });

    it('should handle missing context gracefully', () => {
      const hint = generateTaskComplexityHint('chat_general', {});

      expect(hint.taskType).toBe('chat_general');
      expect(hint.suggestedTier).toBe('small_fast');
      expect(hint.reasoning).toBeDefined();
    });
  });

  describe('getSuggestedModelsForTier', () => {
    it('should return appropriate models for openai_chat small_fast', () => {
      const models = getSuggestedModelsForTier('openai_chat', 'small_fast');
      expect(models).toContain('gpt-3.5-turbo');
      expect(models).toContain('gpt-3.5-turbo-16k');
    });

    it('should return appropriate models for openai_chat large_context_aware', () => {
      const models = getSuggestedModelsForTier('openai_chat', 'large_context_aware');
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-4-turbo');
    });

    it('should return appropriate models for anthropic_claude', () => {
      const smallModels = getSuggestedModelsForTier('anthropic_claude', 'small_fast');
      expect(smallModels).toContain('claude-3-haiku-20240307');

      const largeModels = getSuggestedModelsForTier('anthropic_claude', 'large_context_aware');
      expect(largeModels).toContain('claude-3-sonnet-20240229');
      expect(largeModels).toContain('claude-3-opus-20240229');
    });

    it('should return appropriate models for embedding services', () => {
      const openaiModels = getSuggestedModelsForTier('openai_embedding', 'small_fast');
      expect(openaiModels).toContain('text-embedding-ada-002');

      const jinaModels = getSuggestedModelsForTier('jina_embedding', 'small_fast');
      expect(jinaModels).toContain('jina-embeddings-v2-base-en');
    });

    it('should return empty array for unknown services', () => {
      const models = getSuggestedModelsForTier('unknown_service' as any, 'small_fast');
      expect(models).toEqual([]);
    });
  });
}); 