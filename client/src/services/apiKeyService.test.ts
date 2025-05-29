import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  saveApiKeys, 
  getApiKeys, 
  clearApiKeys, 
  hasValidApiKeys, 
  getUserAPIKeys 
} from './apiKeyService';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Replace global localStorage with mock
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('API Key Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('saveApiKeys', () => {
    it('should save both keys to localStorage', () => {
      const llmKey = 'test-llm-key-12345';
      const embeddingKey = 'test-embedding-key-67890';

      saveApiKeys(llmKey, embeddingKey);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('llmApiKey', llmKey);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('embeddingApiKey', embeddingKey);
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(2);
    });

    it('should throw error when localStorage fails', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage is full');
      });

      expect(() => saveApiKeys('key1', 'key2')).toThrow(
        'Failed to save API keys. Please check if localStorage is available and not full.'
      );
    });
  });

  describe('getApiKeys', () => {
    it('should retrieve both keys from localStorage', () => {
      const expectedLlmKey = 'stored-llm-key';
      const expectedEmbeddingKey = 'stored-embedding-key';

      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'llmApiKey') return expectedLlmKey;
        if (key === 'embeddingApiKey') return expectedEmbeddingKey;
        return null;
      });

      const result = getApiKeys();

      expect(result).toEqual({
        llmKey: expectedLlmKey,
        embeddingKey: expectedEmbeddingKey
      });
      expect(localStorageMock.getItem).toHaveBeenCalledWith('llmApiKey');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('embeddingApiKey');
    });

    it('should return null values when keys are not stored', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = getApiKeys();

      expect(result).toEqual({
        llmKey: null,
        embeddingKey: null
      });
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      const result = getApiKeys();

      expect(result).toEqual({
        llmKey: null,
        embeddingKey: null
      });
    });
  });

  describe('clearApiKeys', () => {
    it('should remove both keys from localStorage', () => {
      clearApiKeys();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('llmApiKey');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('embeddingApiKey');
      expect(localStorageMock.removeItem).toHaveBeenCalledTimes(2);
    });

    it('should throw error when localStorage fails', () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      expect(() => clearApiKeys()).toThrow('Failed to clear API keys from storage.');
    });
  });

  describe('hasValidApiKeys', () => {
    it('should return true when both keys are valid', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'llmApiKey') return 'valid-llm-key';
        if (key === 'embeddingApiKey') return 'valid-embedding-key';
        return null;
      });

      expect(hasValidApiKeys()).toBe(true);
    });

    it('should return false when llmKey is missing', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'llmApiKey') return null;
        if (key === 'embeddingApiKey') return 'valid-embedding-key';
        return null;
      });

      expect(hasValidApiKeys()).toBe(false);
    });

    it('should return false when embeddingKey is missing', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'llmApiKey') return 'valid-llm-key';
        if (key === 'embeddingApiKey') return null;
        return null;
      });

      expect(hasValidApiKeys()).toBe(false);
    });

    it('should return false when keys are empty strings', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'llmApiKey') return '';
        if (key === 'embeddingApiKey') return '';
        return null;
      });

      expect(hasValidApiKeys()).toBe(false);
    });

    it('should return false when keys are whitespace only', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'llmApiKey') return '   ';
        if (key === 'embeddingApiKey') return '\t\n';
        return null;
      });

      expect(hasValidApiKeys()).toBe(false);
    });
  });

  describe('getUserAPIKeys (legacy interface)', () => {
    it('should return same result as getApiKeys', () => {
      const expectedResult = {
        llmKey: 'test-llm',
        embeddingKey: 'test-embedding'
      };

      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'llmApiKey') return expectedResult.llmKey;
        if (key === 'embeddingApiKey') return expectedResult.embeddingKey;
        return null;
      });

      expect(getUserAPIKeys()).toEqual(expectedResult);
      expect(getUserAPIKeys()).toEqual(getApiKeys());
    });
  });
}); 