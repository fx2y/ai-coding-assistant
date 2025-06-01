/**
 * Tool Executor Service - Dispatches tool calls to appropriate implementations
 * Implements RFC-AGT-002: Tool Definition & Execution Framework
 */

import type { Env, EmbeddingModelConfig } from '../types.js';
import { executeCodeSearch, type CodeSearchArgs } from '../tools/codeSearchTool.js';
import { executeReadFile, type ReadFileArgs } from '../tools/readFileTool.js';

export interface ToolExecutionContext {
  env: Env;
  projectId: string;
  userApiKeys: {
    embeddingKey?: string;
    llmKey?: string;
  };
  embeddingModelConfig?: EmbeddingModelConfig;
}

export interface ToolExecutionResult {
  observation: string;
  isError: boolean;
}

/**
 * Executes a tool by name with the provided arguments
 * @param context - Execution context containing environment and user keys
 * @param toolName - Name of the tool to execute
 * @param toolArgs - Arguments to pass to the tool
 * @returns Promise resolving to tool observation and error status
 */
export async function executeToolByName(
  context: ToolExecutionContext,
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    console.log(`[ToolExecutor] Executing tool: ${toolName}`, {
      projectId: context.projectId,
      toolArgs: Object.keys(toolArgs)
    });

    switch (toolName) {
      case 'code_search': {
        // Validate required context for code search
        if (!context.userApiKeys.embeddingKey) {
          return {
            observation: 'Error: Embedding API key is required for code search',
            isError: true
          };
        }

        if (!context.embeddingModelConfig) {
          return {
            observation: 'Error: Embedding model configuration is required for code search',
            isError: true
          };
        }

        // Validate and cast tool arguments
        const searchArgs = validateCodeSearchArgs(toolArgs);
        if (!searchArgs) {
          return {
            observation: 'Error: Invalid arguments for code_search. Expected: { query: string }',
            isError: true
          };
        }

        const searchResult = await executeCodeSearch(
          context.env,
          context.projectId,
          searchArgs,
          { embeddingKey: context.userApiKeys.embeddingKey },
          context.embeddingModelConfig
        );

        if (searchResult.error) {
          return {
            observation: `Error in code_search: ${searchResult.error}`,
            isError: true
          };
        }

        return {
          observation: searchResult.tool_output,
          isError: false
        };
      }

      case 'read_file': {
        // Validate and cast tool arguments
        const readFileArgs = validateReadFileArgs(toolArgs);
        if (!readFileArgs) {
          return {
            observation: 'Error: Invalid arguments for read_file. Expected: { file_path: string }',
            isError: true
          };
        }

        const readFileResult = await executeReadFile(
          context.env,
          context.projectId,
          readFileArgs
        );

        if (readFileResult.error) {
          return {
            observation: `Error in read_file: ${readFileResult.error}`,
            isError: true
          };
        }

        return {
          observation: readFileResult.tool_output,
          isError: false
        };
      }

      default:
        console.warn(`[ToolExecutor] Unknown tool: ${toolName}`);
        return {
          observation: `Error: Unknown tool '${toolName}'. Available tools: code_search, read_file`,
          isError: true
        };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ToolExecutor] Tool execution failed:`, error);
    
    return {
      observation: `Error: Tool execution failed: ${errorMessage}`,
      isError: true
    };
  }
}

/**
 * Validates and casts arguments for code_search tool
 */
function validateCodeSearchArgs(args: Record<string, unknown>): CodeSearchArgs | null {
  if (typeof args.query !== 'string' || !args.query.trim()) {
    return null;
  }

  return {
    query: args.query.trim()
  };
}

/**
 * Validates and casts arguments for read_file tool
 */
function validateReadFileArgs(args: Record<string, unknown>): ReadFileArgs | null {
  if (typeof args.file_path !== 'string' || !args.file_path.trim()) {
    return null;
  }

  return {
    file_path: args.file_path.trim()
  };
}

/**
 * Generates the tool manifest prompt segment for available tools
 * This describes the tools available to the LLM
 */
export function generateToolManifestPrompt(): string {
  return `You have access to the following tools:

1. **code_search(query: string)**: Searches the codebase for code snippets relevant to the query. Returns a list of code snippets with file paths, line numbers, and relevance scores.
   - Use this when you need to find specific functions, classes, patterns, or understand how something is implemented
   - Example: code_search(query="user authentication functions")

2. **read_file(file_path: string)**: Reads the full content of the specified file from the project. Returns the complete file content.
   - Use this when you need to see the complete implementation of a file or understand the full context
   - Example: read_file(file_path="src/models/user.py")

To use a tool, output on a new line:
Action: tool_name(param1="value1", param2="value2")

Examples:
Action: code_search(query="error handling middleware")
Action: read_file(file_path="workers/src/index.ts")

After using a tool, you will receive an observation with the tool's output. Use this information to continue your reasoning and provide helpful responses.`;
} 