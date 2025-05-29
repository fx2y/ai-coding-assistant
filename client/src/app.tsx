import { h } from 'preact';
import { ApiKeyManager } from './components/ApiKeyManager';
import './app.css';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Cloudflare AI Coding Assistant</h1>
        <p>Secure BYOK (Bring Your Own Key) AI Coding Assistant</p>
      </header>
      
      <main className="app-main">
        <section className="configuration-section">
          <ApiKeyManager />
        </section>
        
        <section className="status-section">
          <div className="info-card">
            <h3>Getting Started</h3>
            <ol>
              <li>Enter your LLM API key (OpenAI, Anthropic, Cohere, etc.)</li>
              <li>Enter your Embedding API key (Jina, OpenAI, etc.)</li>
              <li>Click "Save Keys" to store them securely in your browser</li>
              <li>Start using the AI coding assistant</li>
            </ol>
          </div>
        </section>
      </main>
      
      <footer className="app-footer">
        <p>
          Built on Cloudflare Platform • 
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            View Source
          </a>
        </p>
      </footer>
    </div>
  );
}
