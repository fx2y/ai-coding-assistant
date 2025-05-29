import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { saveApiKeys, getApiKeys, clearApiKeys, hasValidApiKeys } from '../services/apiKeyService';
import './ApiKeyManager.css';

interface ApiKeyManagerProps {
  className?: string;
}

export function ApiKeyManager({ className = '' }: ApiKeyManagerProps) {
  const [llmKey, setLlmKey] = useState('');
  const [embeddingKey, setEmbeddingKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isKeysLoaded, setIsKeysLoaded] = useState(false);

  // Load existing keys on component mount
  useEffect(() => {
    const existingKeys = getApiKeys();
    if (existingKeys.llmKey) {
      setLlmKey(existingKeys.llmKey);
    }
    if (existingKeys.embeddingKey) {
      setEmbeddingKey(existingKeys.embeddingKey);
    }
    setIsKeysLoaded(true);
  }, []);

  const handleSaveKeys = async () => {
    if (!llmKey.trim() || !embeddingKey.trim()) {
      setStatus('error');
      setErrorMessage('Both API keys are required');
      return;
    }

    setStatus('saving');
    setErrorMessage('');

    try {
      saveApiKeys(llmKey.trim(), embeddingKey.trim());
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000); // Reset status after 3 seconds
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save keys');
    }
  };

  const handleClearKeys = () => {
    try {
      clearApiKeys();
      setLlmKey('');
      setEmbeddingKey('');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to clear keys');
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'saving':
        return 'Saving keys...';
      case 'success':
        return 'Keys saved successfully';
      case 'error':
        return errorMessage || 'An error occurred';
      default:
        return '';
    }
  };

  const getStatusClass = () => {
    switch (status) {
      case 'success':
        return 'status-message status-success';
      case 'error':
        return 'status-message status-error';
      case 'saving':
        return 'status-message status-info';
      default:
        return 'status-message';
    }
  };

  return (
    <div className={`api-key-manager ${className}`}>
      <div className="api-key-form">
        <h2>API Key Configuration</h2>
        
        <div className="security-notice">
          <p>
            <strong>🔒 Security Notice:</strong> Your API keys are stored <em>only</em> in your browser's 
            local storage and are <em>never</em> sent to our servers for storage. Keys are transmitted 
            per-request only for proxying to the respective AI services.
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="llm-key">
            LLM API Key
            <span className="provider-hint">(OpenAI, Anthropic, Cohere, etc.)</span>
          </label>
          <input
            id="llm-key"
            type="password"
            value={llmKey}
            onInput={(e) => setLlmKey((e.target as HTMLInputElement).value)}
            placeholder="Enter your LLM API key"
            disabled={status === 'saving'}
            className="api-key-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="embedding-key">
            Embedding API Key
            <span className="provider-hint">(Jina, OpenAI, etc.)</span>
          </label>
          <input
            id="embedding-key"
            type="password"
            value={embeddingKey}
            onInput={(e) => setEmbeddingKey((e.target as HTMLInputElement).value)}
            placeholder="Enter your embedding API key"
            disabled={status === 'saving'}
            className="api-key-input"
          />
        </div>

        <div className="button-group">
          <button
            onClick={handleSaveKeys}
            disabled={status === 'saving' || (!llmKey.trim() && !embeddingKey.trim())}
            className="btn btn-primary"
          >
            {status === 'saving' ? 'Saving...' : 'Save Keys'}
          </button>
          
          <button
            onClick={handleClearKeys}
            disabled={status === 'saving'}
            className="btn btn-secondary"
          >
            Clear Saved Keys
          </button>
        </div>

        {status !== 'idle' && (
          <div className={getStatusClass()}>
            {getStatusMessage()}
          </div>
        )}

        {isKeysLoaded && hasValidApiKeys() && (
          <div className="keys-status">
            ✅ Valid API keys are configured and ready to use
          </div>
        )}
      </div>
    </div>
  );
} 