/**
 * Model Preferences Component
 * Implements RFC-MOD-001: User-Configurable Model Routing UI
 * Implements RFC-MOD-002: Heuristic Task-Complexity Hinting UI
 */

import { useState, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import './ModelPreferences.css';
import type {
  ModelPreferences as ModelPreferencesType,
  ModelConfig,
  TaskComplexityHint
} from '../services/modelPreferencesService.js';
import {
  getModelPreferences,
  saveModelPreferences,
  getDefaultModelPreferences,
  generateComplexityHint,
  getSuggestedModels
} from '../services/modelPreferencesService.js';

interface ModelPreferencesProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (preferences: ModelPreferencesType) => void;
}

interface TaskConfigState {
  config: ModelConfig;
  hint?: TaskComplexityHint;
  suggestions: string[];
  loadingSuggestions: boolean;
}

const TASK_DESCRIPTIONS = {
  embedding: 'Used for code search, similarity matching, and semantic indexing of your codebase.',
  chat_general: 'Used for general conversations and simple question-answering tasks.',
  code_generation: 'Used for generating, editing, and refactoring code based on your requests.',
  re_ranking: 'Used for improving search result relevance and context prioritization.',
  agent_reasoning: 'Used for complex reasoning, planning, and multi-step problem solving.'
} as const;

const SERVICE_OPTIONS = [
  { value: 'openai_chat', label: 'OpenAI Chat' },
  { value: 'openai_embedding', label: 'OpenAI Embeddings' },
  { value: 'anthropic_claude', label: 'Anthropic Claude' },
  { value: 'jina_embedding', label: 'Jina Embeddings' },
  { value: 'cohere_generate', label: 'Cohere Generate' },
  { value: 'cohere_embed', label: 'Cohere Embed' }
] as const;

export default function ModelPreferences({ 
  projectId, 
  isOpen, 
  onClose, 
  onSave 
}: ModelPreferencesProps): JSX.Element | null {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [taskConfigs, setTaskConfigs] = useState<Record<string, TaskConfigState>>({
    embedding: { config: { service: '', modelName: '' }, suggestions: [], loadingSuggestions: false },
    chat_general: { config: { service: '', modelName: '' }, suggestions: [], loadingSuggestions: false },
    code_generation: { config: { service: '', modelName: '' }, suggestions: [], loadingSuggestions: false },
    re_ranking: { config: { service: '', modelName: '' }, suggestions: [], loadingSuggestions: false },
    agent_reasoning: { config: { service: '', modelName: '' }, suggestions: [], loadingSuggestions: false }
  });

  // Load preferences on mount
  useEffect(() => {
    if (isOpen && projectId) {
      loadPreferences();
    }
  }, [isOpen, projectId]);

  const loadPreferences = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const preferences = await getModelPreferences(projectId);
      
      setTaskConfigs({
        embedding: { 
          config: preferences.embedding_config, 
          suggestions: [], 
          loadingSuggestions: false 
        },
        chat_general: { 
          config: preferences.chat_general_config, 
          suggestions: [], 
          loadingSuggestions: false 
        },
        code_generation: { 
          config: preferences.code_generation_config, 
          suggestions: [], 
          loadingSuggestions: false 
        },
        re_ranking: { 
          config: preferences.re_ranking_config, 
          suggestions: [], 
          loadingSuggestions: false 
        },
        agent_reasoning: { 
          config: preferences.agent_reasoning_config, 
          suggestions: [], 
          loadingSuggestions: false 
        }
      });
    } catch (err) {
      console.error('Failed to load model preferences:', err);
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (
    taskType: string, 
    field: keyof ModelConfig, 
    value: string | number | undefined
  ): void => {
    setTaskConfigs(prev => ({
      ...prev,
      [taskType]: {
        ...prev[taskType],
        config: {
          ...prev[taskType].config,
          [field]: value
        }
      }
    }));
  };

  const generateHint = async (taskType: string): Promise<void> => {
    try {
      const hint = await generateComplexityHint(taskType, {
        queryLength: 100, // Default context
        contextSize: 1000
      });
      
      setTaskConfigs(prev => ({
        ...prev,
        [taskType]: {
          ...prev[taskType],
          hint
        }
      }));
    } catch (err) {
      console.error(`Failed to generate hint for ${taskType}:`, err);
    }
  };

  const loadSuggestions = async (taskType: string, tier: 'small_fast' | 'large_context_aware'): Promise<void> => {
    const currentConfig = taskConfigs[taskType];
    if (!currentConfig.config.service) return;

    try {
      setTaskConfigs(prev => ({
        ...prev,
        [taskType]: {
          ...prev[taskType],
          loadingSuggestions: true
        }
      }));

      const suggestions = await getSuggestedModels(currentConfig.config.service, tier);
      
      setTaskConfigs(prev => ({
        ...prev,
        [taskType]: {
          ...prev[taskType],
          suggestions,
          loadingSuggestions: false
        }
      }));
    } catch (err) {
      console.error(`Failed to load suggestions for ${taskType}:`, err);
      setTaskConfigs(prev => ({
        ...prev,
        [taskType]: {
          ...prev[taskType],
          loadingSuggestions: false
        }
      }));
    }
  };

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true);
      setError(null);

      const preferences: ModelPreferencesType = {
        embedding_config: taskConfigs.embedding.config,
        chat_general_config: taskConfigs.chat_general.config,
        code_generation_config: taskConfigs.code_generation.config,
        re_ranking_config: taskConfigs.re_ranking.config,
        agent_reasoning_config: taskConfigs.agent_reasoning.config
      };

      await saveModelPreferences(projectId, preferences);
      
      if (onSave) {
        onSave(preferences);
      }
      
      onClose();
    } catch (err) {
      console.error('Failed to save model preferences:', err);
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (): Promise<void> => {
    try {
      const defaults = await getDefaultModelPreferences();
      
      setTaskConfigs({
        embedding: { config: defaults.embedding_config, suggestions: [], loadingSuggestions: false },
        chat_general: { config: defaults.chat_general_config, suggestions: [], loadingSuggestions: false },
        code_generation: { config: defaults.code_generation_config, suggestions: [], loadingSuggestions: false },
        re_ranking: { config: defaults.re_ranking_config, suggestions: [], loadingSuggestions: false },
        agent_reasoning: { config: defaults.agent_reasoning_config, suggestions: [], loadingSuggestions: false }
      });
    } catch (err) {
      console.error('Failed to load defaults:', err);
      setError('Failed to reset to defaults');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="model-preferences-overlay" onClick={onClose}>
      <div className="model-preferences-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Model Preferences</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {loading ? (
            <div className="loading">Loading preferences...</div>
          ) : (
            <form className="preferences-form" onSubmit={(e) => e.preventDefault()}>
              {Object.entries(taskConfigs).map(([taskType, taskConfig]) => (
                <div key={taskType} className="task-config">
                  <div className="task-header">
                    <h3>{taskType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
                    <p className="task-description">
                      {TASK_DESCRIPTIONS[taskType as keyof typeof TASK_DESCRIPTIONS]}
                    </p>
                    <button
                      type="button"
                      className="hint-button"
                      onClick={() => generateHint(taskType)}
                    >
                      Get Suggestion
                    </button>
                  </div>

                  {taskConfig.hint && (
                    <div className="complexity-hint">
                      <strong>Suggested Tier:</strong> {taskConfig.hint.suggestedTier}<br />
                      <em>{taskConfig.hint.reasoning}</em>
                    </div>
                  )}

                  <div className="config-fields">
                    <div className="field">
                      <label>Service</label>
                      <select
                        value={taskConfig.config.service}
                        onChange={(e) => handleConfigChange(taskType, 'service', e.currentTarget.value)}
                      >
                        <option value="">Select a service...</option>
                        {SERVICE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Model Name</label>
                      <input
                        type="text"
                        value={taskConfig.config.modelName}
                        onChange={(e) => handleConfigChange(taskType, 'modelName', e.currentTarget.value)}
                        placeholder="e.g., gpt-4, claude-3-sonnet"
                      />
                    </div>

                    {(taskConfig.config.service.includes('embedding')) && (
                      <div className="field">
                        <label>Dimensions (optional)</label>
                        <input
                          type="number"
                          value={taskConfig.config.dimensions || ''}
                          onChange={(e) => {
                            const val = e.currentTarget.value;
                            handleConfigChange(taskType, 'dimensions', val ? parseInt(val) : undefined);
                          }}
                          placeholder="e.g., 1536"
                        />
                      </div>
                    )}

                    {taskConfig.config.service && taskConfig.hint && (
                      <div className="suggested-models">
                        <label>Suggested Models for {taskConfig.hint.suggestedTier}:</label>
                        <div className="model-suggestions">
                          {taskConfig.loadingSuggestions ? (
                            <span>Loading...</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="hint-button"
                                onClick={() => loadSuggestions(taskType, taskConfig.hint!.suggestedTier)}
                              >
                                Load Suggestions
                              </button>
                              {taskConfig.suggestions.map(model => (
                                <button
                                  key={model}
                                  type="button"
                                  className="suggestion-button"
                                  onClick={() => handleConfigChange(taskType, 'modelName', model)}
                                >
                                  {model}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </form>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
} 