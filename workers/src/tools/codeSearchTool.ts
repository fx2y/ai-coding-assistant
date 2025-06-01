/**
 * Code Search Tool - Searches codebase for relevant snippets
 * Implements RFC-AGT-002: Tool Definition & Execution Framework
 */

import type { Env, EmbeddingModelConfig, VectorSearchResult } from '../types.js';
import { performVectorSearch } from '../services/retrievalService.js';

export interface CodeSearchArgs {
  query: string;
}

export interface CodeSearchResult {
  tool_output: string;
  error?: string;
}

/**
 * Executes code search using vector similarity
 * @param env - Cloudflare Worker environment bindings
 * @param projectId - Project ID to search within
 * @param args - Tool arguments containing search query
 * @param userApiKeys - User's API keys for external services
 * @param embeddingModelConfig - Configuration for embedding model
 * @returns Promise resolving to formatted search results or error
 */
export async function executeCodeSearch(
  env: Env,
  projectId: string,
  args: CodeSearchArgs,
  userApiKeys: { embeddingKey: string },
  embeddingModelConfig: EmbeddingModelConfig
): Promise<CodeSearchResult> {
  try {
    console.log(`[CodeSearchTool] Executing search for project ${projectId}`, {
      query: args.query.substring(0, 100) + (args.query.length > 100 ? '...' : ''),
      embeddingService: embeddingModelConfig.service
    });

    // Use default topK of 5 for tool calls to keep results manageable
    const topK = 5;

    const searchResult = await performVectorSearch(
      env,
      projectId,
      args.query,
      userApiKeys.embeddingKey,
      embeddingModelConfig,
      topK
    );

    if (searchResult.error) {
      console.error(`[CodeSearchTool] Search failed:`, searchResult.error);
      return {
        tool_output: '',
        error: `Code search failed: ${searchResult.error.message}`
      };
    }

    if (!searchResult.results || searchResult.results.length === 0) {
      console.log(`[CodeSearchTool] No results found for query: ${args.query}`);
      return {
        tool_output: `No code snippets found for query: "${args.query}"`
      };
    }

    // Format results for LLM consumption
    const formattedOutput = formatSearchResults(args.query, searchResult.results);

    console.log(`[CodeSearchTool] Search completed`, {
      resultCount: searchResult.results.length,
      timings: searchResult.timings
    });

    return {
      tool_output: formattedOutput
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[CodeSearchTool] Unexpected error:`, error);
    
    return {
      tool_output: '',
      error: `Code search tool failed: ${errorMessage}`
    };
  }
}

/**
 * Formats search results into a readable string for the LLM
 */
function formatSearchResults(query: string, results: VectorSearchResult[]): string {
  const header = `Found ${results.length} code snippet${results.length === 1 ? '' : 's'} for query: "${query}"\n\n`;
  
  const formattedResults = results.map((result, index) => {
    const lineInfo = result.end_line 
      ? `Lines ${result.start_line}-${result.end_line}`
      : `Line ${result.start_line}`;
    
    const scoreInfo = `Score: ${result.score.toFixed(3)}`;
    
    const languageTag = result.language || 'text';
    
    return [
      `${index + 1}. **${result.original_file_path}** (${lineInfo}, ${scoreInfo})`,
      '```' + languageTag,
      result.text_snippet || '[Content not available]',
      '```'
    ].join('\n');
  }).join('\n\n');

  return header + formattedResults;
} 