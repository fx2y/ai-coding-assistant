/**
 * Code Search Component
 * Implements P1-E3-S2: Main search interface with form and results
 * Implements P2-E1-S3: Implicit context integration
 */

import { useState } from 'preact/hooks';
import { SearchResultsDisplay } from './SearchResultsDisplay';
import { 
  performVectorSearchWithImplicitContext, 
  getAvailableEmbeddingModels,
  type VectorSearchRequest,
  type VectorSearchResult
} from '../services/searchApiService';
import { useActiveFile, getImplicitContext } from '../contexts/ActiveFileContext';
import './CodeSearch.css';

interface CodeSearchProps {
  defaultProjectId?: string;
}

export function CodeSearch({ defaultProjectId = '' }: CodeSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [selectedModel, setSelectedModel] = useState('openai_embedding|text-embedding-ada-002');
  const [topK, setTopK] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<VectorSearchResult[]>([]);
  const [error, setError] = useState<string>('');
  const [timings, setTimings] = useState<{
    query_embedding_time_ms: number;
    vector_search_time_ms: number;
    total_time_ms: number;
  } | undefined>(undefined);

  const { activeFilePath } = useActiveFile();
  const availableModels = getAvailableEmbeddingModels();

  const handleSearch = async (e: Event) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    if (!projectId.trim()) {
      setError('Please enter a project ID');
      return;
    }

    setIsLoading(true);
    setError('');
    setResults([]);
    setTimings(undefined);

    try {
      // Parse selected model
      const [service, modelName] = selectedModel.split('|');
      
      const searchRequest: VectorSearchRequest = {
        project_id: projectId.trim(),
        query_text: searchQuery.trim(),
        embedding_model_config: {
          service: service as 'openai_embedding' | 'jina_embedding' | 'cohere_embed',
          ...(modelName && { modelName })
        },
        top_k: topK
      };

      // Get implicit context from active file
      const implicitContext = getImplicitContext(activeFilePath);

      // Log implicit context for debugging
      if (implicitContext.last_focused_file_path) {
        console.log(`[Search] Including implicit context: ${implicitContext.last_focused_file_path}`);
      }

      const response = await performVectorSearchWithImplicitContext(searchRequest, implicitContext);

      if (response.success && response.data) {
        setResults(response.data.results);
        setTimings({
          query_embedding_time_ms: response.data.query_embedding_time_ms,
          vector_search_time_ms: response.data.vector_search_time_ms,
          total_time_ms: response.data.total_time_ms
        });
      } else {
        setError(response.error?.message || 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearResults = () => {
    setResults([]);
    setError('');
    setTimings(undefined);
  };

  return (
    <div className="code-search-container">
      <div className="search-form-section">
        <h2>Code Search</h2>
        <p className="search-description">
          Search through your indexed code using natural language or code snippets. 
          Use <code>@filename.js</code> or <code>@folder/</code> to include specific files or folders in your search context.
          {activeFilePath && (
            <span className="implicit-context-info">
              <br />
              <strong>Active file:</strong> <code>{activeFilePath}</code> (will be included as implicit context)
            </span>
          )}
        </p>

        <form onSubmit={handleSearch} className="search-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="project-id">Project ID</label>
              <input
                id="project-id"
                type="text"
                value={projectId}
                onChange={(e) => setProjectId((e.target as HTMLInputElement).value)}
                placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                className="form-input"
                required
              />
              <small className="form-help">
                The UUID of the project you want to search in
              </small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="search-query">Search Query</label>
              <textarea
                id="search-query"
                value={searchQuery}
                onChange={(e) => setSearchQuery((e.target as HTMLTextAreaElement).value)}
                placeholder="e.g., function to handle user authentication @auth.js, React component for file upload @components/, error handling in async functions"
                className="form-textarea"
                rows={3}
                required
              />
              <small className="form-help">
                Describe what you're looking for in natural language. Use @filename.js or @folder/ to include specific files or folders in context.
                {activeFilePath && (
                  <span className="implicit-context-note">
                    <br />💡 The active file ({activeFilePath}) will be automatically included as context.
                  </span>
                )}
              </small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="embedding-model">Embedding Model</label>
              <select
                id="embedding-model"
                value={selectedModel}
                onChange={(e) => setSelectedModel((e.target as HTMLSelectElement).value)}
                className="form-select"
              >
                {availableModels.map((model) => (
                  <option 
                    key={`${model.service}|${model.modelName || ''}`}
                    value={`${model.service}|${model.modelName || ''}`}
                  >
                    {model.displayName}
                  </option>
                ))}
              </select>
              <small className="form-help">
                Choose the embedding model for semantic search
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="top-k">Max Results</label>
              <select
                id="top-k"
                value={topK}
                onChange={(e) => setTopK(parseInt((e.target as HTMLSelectElement).value))}
                className="form-select"
              >
                <option value={5}>5 results</option>
                <option value={10}>10 results</option>
                <option value={20}>20 results</option>
                <option value={50}>50 results</option>
              </select>
              <small className="form-help">
                Maximum number of results to return
              </small>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              disabled={isLoading || !searchQuery.trim() || !projectId.trim()}
              className="search-button"
            >
              {isLoading ? (
                <>
                  <span className="button-spinner"></span>
                  Searching...
                </>
              ) : (
                <>
                  🔍 Search Code
                </>
              )}
            </button>

            {(results.length > 0 || error) && (
              <button
                type="button"
                onClick={handleClearResults}
                className="clear-button"
              >
                Clear Results
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="search-results-section">
        <SearchResultsDisplay
          results={results}
          isLoading={isLoading}
          error={error}
          searchQuery={searchQuery}
          timings={timings}
        />
      </div>
    </div>
  );
} 