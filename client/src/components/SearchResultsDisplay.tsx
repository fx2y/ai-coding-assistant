/**
 * Search Results Display Component
 * Implements P1-E3-S2: Client display of hydrated search results
 * Implements P2-E1-S3: Implicit context tracking on result interactions
 */

import { useEffect, useRef } from 'preact/hooks';
import type { VectorSearchResult } from '../services/searchApiService';
import { useActiveFile } from '../contexts/ActiveFileContext';
import './SearchResultsDisplay.css';

interface SearchResultsDisplayProps {
  results: VectorSearchResult[];
  isLoading: boolean;
  error?: string;
  searchQuery?: string;
  timings?: {
    query_embedding_time_ms: number;
    vector_search_time_ms: number;
    total_time_ms: number;
  };
}

export function SearchResultsDisplay({
  results,
  isLoading,
  error,
  searchQuery,
  timings
}: SearchResultsDisplayProps) {
  const codeBlocksRef = useRef<HTMLElement[]>([]);
  const { setActiveFilePath } = useActiveFile();

  // Apply syntax highlighting after results are rendered
  useEffect(() => {
    // Simple syntax highlighting using CSS classes
    // In a production app, you might use Prism.js or highlight.js
    codeBlocksRef.current.forEach((block) => {
      if (block) {
        // Basic syntax highlighting for common patterns
        applySyntaxHighlighting(block);
      }
    });
  }, [results]);

  const applySyntaxHighlighting = (element: HTMLElement) => {
    const code = element.textContent || '';
    const language = element.getAttribute('data-language') || 'text';
    
    // Simple regex-based highlighting for demonstration
    let highlightedCode = code;
    
    if (language === 'javascript' || language === 'typescript') {
      highlightedCode = highlightedCode
        .replace(/\b(function|const|let|var|if|else|for|while|return|import|export|class|interface|type)\b/g, '<span class="keyword">$1</span>')
        .replace(/\/\/.*$/gm, '<span class="comment">$&</span>')
        .replace(/\/\*[\s\S]*?\*\//g, '<span class="comment">$&</span>')
        .replace(/"([^"\\]|\\.)*"/g, '<span class="string">$&</span>')
        .replace(/'([^'\\]|\\.)*'/g, '<span class="string">$&</span>')
        .replace(/`([^`\\]|\\.)*`/g, '<span class="string">$&</span>');
    } else if (language === 'python') {
      highlightedCode = highlightedCode
        .replace(/\b(def|class|if|elif|else|for|while|return|import|from|try|except|finally|with|as)\b/g, '<span class="keyword">$1</span>')
        .replace(/#.*$/gm, '<span class="comment">$&</span>')
        .replace(/"([^"\\]|\\.)*"/g, '<span class="string">$&</span>')
        .replace(/'([^'\\]|\\.)*'/g, '<span class="string">$&</span>');
    }
    
    element.innerHTML = highlightedCode;
  };

  const formatScore = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };

  const formatFilePath = (filePath: string): string => {
    // Show only the last 2-3 path segments for readability
    const segments = filePath.split('/');
    if (segments.length > 3) {
      return `.../${segments.slice(-3).join('/')}`;
    }
    return filePath;
  };

  const highlightSearchTerms = (text: string, query: string): string => {
    if (!query) return text;
    
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    let highlightedText = text;
    
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    
    return highlightedText;
  };

  // Handle result item click for implicit context tracking
  const handleResultClick = (result: VectorSearchResult) => {
    setActiveFilePath(result.original_file_path);
  };

  if (isLoading) {
    return (
      <div className="search-results-container">
        <div className="search-loading">
          <div className="loading-spinner"></div>
          <p>Searching code...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="search-results-container">
        <div className="search-error">
          <h3>Search Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="search-results-container">
        <div className="search-empty">
          <h3>No Results Found</h3>
          <p>Try adjusting your search query or check if the project has been indexed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="search-results-container">
      <div className="search-results-header">
        <h3>Search Results</h3>
        <div className="search-meta">
          <span className="result-count">{results.length} results</span>
          {timings && (
            <span className="search-timing">
              in {timings.total_time_ms}ms
            </span>
          )}
        </div>
      </div>

      {timings && (
        <div className="search-timings">
          <span>Embedding: {timings.query_embedding_time_ms}ms</span>
          <span>Search: {timings.vector_search_time_ms}ms</span>
          <span>Total: {timings.total_time_ms}ms</span>
        </div>
      )}

      <div className="search-results-list">
        {results.map((result, index) => (
          <div 
            key={result.chunk_id} 
            className="search-result-item"
            onClick={() => handleResultClick(result)}
            style={{ cursor: 'pointer' }}
            title="Click to set as active file for implicit context"
          >
            <div className="result-header">
              <div className="result-file-info">
                <span className="file-path" title={result.original_file_path}>
                  {formatFilePath(result.original_file_path)}
                </span>
                <span className="line-info">
                  Lines {result.start_line}
                  {result.end_line && result.end_line !== result.start_line && `-${result.end_line}`}
                </span>
                {result.language && (
                  <span className="language-tag">{result.language}</span>
                )}
              </div>
              <div className="result-score">
                <span className="score-label">Relevance:</span>
                <span className="score-value">{formatScore(result.score)}</span>
              </div>
            </div>

            {result.text_snippet && (
              <div className="result-code">
                <pre>
                  <code
                    ref={(el) => {
                      if (el) codeBlocksRef.current[index] = el;
                    }}
                    data-language={result.language || 'text'}
                    dangerouslySetInnerHTML={{
                      __html: highlightSearchTerms(result.text_snippet, searchQuery || '')
                    }}
                  />
                </pre>
              </div>
            )}

            <div className="result-actions">
              <button
                className="action-button"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering the result click
                  navigator.clipboard?.writeText(result.original_file_path);
                }}
                title="Copy file path"
              >
                📋 Copy Path
              </button>
              <button
                className="action-button"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering the result click
                  navigator.clipboard?.writeText(result.text_snippet || '');
                }}
                title="Copy code snippet"
              >
                📄 Copy Code
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 