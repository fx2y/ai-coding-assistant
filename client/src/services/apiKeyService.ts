/**
 * API Key Service for BYOK (Bring Your Own Key) model
 * Implements RFC-SEC-001: Client-side storage of API keys in localStorage
 * Keys are never stored server-side, only transmitted per-request
 */

export interface ApiKeys {
  llmKey: string | null;
  embeddingKey: string | null;
}

const LLM_KEY_STORAGE_KEY = 'llmApiKey';
const EMBEDDING_KEY_STORAGE_KEY = 'embeddingApiKey';

/**
 * Save API keys to localStorage
 * @param llmKey - API key for LLM providers (OpenAI, Anthropic, etc.)
 * @param embeddingKey - API key for embedding providers (Jina, OpenAI, etc.)
 */
export function saveApiKeys(llmKey: string, embeddingKey: string): void {
  try {
    localStorage.setItem(LLM_KEY_STORAGE_KEY, llmKey);
    localStorage.setItem(EMBEDDING_KEY_STORAGE_KEY, embeddingKey);
  } catch (error) {
    console.error('Failed to save API keys to localStorage:', error);
    throw new Error('Failed to save API keys. Please check if localStorage is available and not full.');
  }
}

/**
 * Retrieve API keys from localStorage
 * @returns Object containing both keys, which may be null if not set
 */
export function getApiKeys(): ApiKeys {
  try {
    const llmKey = localStorage.getItem(LLM_KEY_STORAGE_KEY);
    const embeddingKey = localStorage.getItem(EMBEDDING_KEY_STORAGE_KEY);
    
    return {
      llmKey,
      embeddingKey
    };
  } catch (error) {
    console.error('Failed to retrieve API keys from localStorage:', error);
    return {
      llmKey: null,
      embeddingKey: null
    };
  }
}

/**
 * Clear all stored API keys from localStorage
 * Useful for user logout or key reset scenarios
 */
export function clearApiKeys(): void {
  try {
    localStorage.removeItem(LLM_KEY_STORAGE_KEY);
    localStorage.removeItem(EMBEDDING_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear API keys from localStorage:', error);
    throw new Error('Failed to clear API keys from storage.');
  }
}

/**
 * Check if both API keys are available
 * @returns true if both keys are set and non-empty
 */
export function hasValidApiKeys(): boolean {
  const { llmKey, embeddingKey } = getApiKeys();
  return !!(llmKey && llmKey.trim() && embeddingKey && embeddingKey.trim());
}

/**
 * Legacy function name for interface compatibility
 * Maps to getApiKeys() as specified in the requirements
 */
export function getUserAPIKeys(): ApiKeys {
  return getApiKeys();
} 