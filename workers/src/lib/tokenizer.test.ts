/**
 * Tokenizer Service Tests
 * Tests RFC-CTX-003: Dynamic Context Window Management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  countTokens, 
  getModelConfig, 
  getAvailablePromptTokens, 
  estimateCharsForTokens,
  MODEL_CONFIGS,
  type LLMModelConfig 
} from './tokenizer.js';

describe('Tokenizer Service', () => {
  describe('getModelConfig', () => {
    it('should return correct config for known OpenAI models', () => {
      const gpt4Config = getModelConfig('gpt-4');
      expect(gpt4Config).toEqual({
        modelName: 'gpt-4',
        tokenLimit: 8192,
        reservedOutputTokens: 1500,
        encoding: 'cl100k_base',
        provider: 'openai'
      });
    });

    it('should return correct config for known Anthropic models', () => {
      const claudeConfig = getModelConfig('claude-3-sonnet');
      expect(claudeConfig).toEqual({
        modelName: 'claude-3-sonnet',
        tokenLimit: 200000,
        reservedOutputTokens: 4000,
        provider: 'anthropic'
      });
    });

    it('should return default config for unknown models', () => {
      const unknownConfig = getModelConfig('unknown-model');
      expect(unknownConfig).toEqual({
        modelName: 'unknown-model',
        tokenLimit: 8192,
        reservedOutputTokens: 1500,
        provider: 'other'
      });
    });
  });

  describe('getAvailablePromptTokens', () => {
    it('should calculate available tokens correctly', () => {
      const config: LLMModelConfig = {
        modelName: 'test-model',
        tokenLimit: 4096,
        reservedOutputTokens: 1000,
        provider: 'openai'
      };
      
      expect(getAvailablePromptTokens(config)).toBe(3096);
    });

    it('should return 0 if reserved tokens exceed limit', () => {
      const config: LLMModelConfig = {
        modelName: 'test-model',
        tokenLimit: 1000,
        reservedOutputTokens: 1500,
        provider: 'openai'
      };
      
      expect(getAvailablePromptTokens(config)).toBe(0);
    });
  });

  describe('estimateCharsForTokens', () => {
    it('should estimate characters for OpenAI models', () => {
      const chars = estimateCharsForTokens(100, 'openai');
      expect(chars).toBe(380); // 100 * 3.8
    });

    it('should estimate characters for Anthropic models', () => {
      const chars = estimateCharsForTokens(100, 'anthropic');
      expect(chars).toBe(390); // 100 * 3.9
    });

    it('should estimate characters for unknown providers', () => {
      const chars = estimateCharsForTokens(100, 'unknown');
      expect(chars).toBe(350); // 100 * 3.5
    });
  });

  describe('countTokens', () => {
    it('should count tokens using heuristic for OpenAI models', async () => {
      const config = getModelConfig('gpt-4');
      const text = 'Hello world, this is a test message.';
      
      const result = await countTokens(text, config);
      
      expect(result.method).toBe('heuristic');
      expect(result.confidence).toBe('medium');
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.tokenCount).toBeLessThan(text.length); // Should be less than char count
    });

    it('should count tokens using heuristic for Anthropic models', async () => {
      const config = getModelConfig('claude-3-sonnet');
      const text = 'Hello world, this is a test message for Claude.';
      
      const result = await countTokens(text, config);
      
      expect(result.method).toBe('heuristic');
      expect(result.confidence).toBe('medium');
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('should handle empty text', async () => {
      const config = getModelConfig('gpt-4');
      const result = await countTokens('', config);
      
      expect(result.tokenCount).toBe(0);
    });

    it('should handle very short text', async () => {
      const config = getModelConfig('gpt-4');
      const result = await countTokens('Hi', config);
      
      expect(result.tokenCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle code text appropriately', async () => {
      const config = getModelConfig('gpt-4');
      const codeText = `
function hello() {
  console.log("Hello, world!");
  return true;
}
      `.trim();
      
      const result = await countTokens(codeText, config);
      
      expect(result.tokenCount).toBeGreaterThan(10);
      expect(result.method).toBe('heuristic');
    });

    it('should ensure token count is at least word count', async () => {
      const config = getModelConfig('gpt-4');
      const text = 'one two three four five';
      const wordCount = text.split(/\s+/).length;
      
      const result = await countTokens(text, config);
      
      expect(result.tokenCount).toBeGreaterThanOrEqual(wordCount);
    });
  });

  describe('MODEL_CONFIGS', () => {
    it('should have all required OpenAI models', () => {
      expect(MODEL_CONFIGS['gpt-3.5-turbo']).toBeDefined();
      expect(MODEL_CONFIGS['gpt-4']).toBeDefined();
      expect(MODEL_CONFIGS['gpt-4-turbo']).toBeDefined();
      expect(MODEL_CONFIGS['gpt-4o']).toBeDefined();
    });

    it('should have all required Anthropic models', () => {
      expect(MODEL_CONFIGS['claude-3-haiku']).toBeDefined();
      expect(MODEL_CONFIGS['claude-3-sonnet']).toBeDefined();
      expect(MODEL_CONFIGS['claude-3-opus']).toBeDefined();
    });

    it('should have reasonable token limits', () => {
      Object.values(MODEL_CONFIGS).forEach(config => {
        expect(config.tokenLimit).toBeGreaterThan(1000);
        expect(config.reservedOutputTokens).toBeGreaterThan(0);
        expect(config.reservedOutputTokens).toBeLessThan(config.tokenLimit);
      });
    });

    it('should have correct provider assignments', () => {
      expect(MODEL_CONFIGS['gpt-4']?.provider).toBe('openai');
      expect(MODEL_CONFIGS['claude-3-sonnet']?.provider).toBe('anthropic');
      expect(MODEL_CONFIGS['command']?.provider).toBe('cohere');
    });
  });
}); 