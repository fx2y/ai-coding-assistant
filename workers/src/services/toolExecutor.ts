/**
 * Tool Executor Service - Dispatches tool calls to appropriate implementations
 * Implements RFC-AGT-002: Tool Definition & Execution Framework
 */

import type { Env, EmbeddingModelConfig } from '../types.js';
import { executeCodeSearch, type CodeSearchArgs } from '../tools/codeSearchTool.js';
import { executeReadFile, type ReadFileArgs } from '../tools/readFileTool.js';
import { executeGenerateCodeEdit, type GenerateEditArgs, type LLMConfig } from '../tools/generateEditTool.js';

export interface ToolExecutionContext {
  env: Env;
  projectId: string;
  userApiKeys: {
    embeddingKey?: string;
    llmKey?: string;
  };
  embeddingModelConfig?: EmbeddingModelConfig;
  llmConfig?: LLMConfig;
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

      case 'generate_code_edit': {
        // Validate required context for code edit generation
        if (!context.userApiKeys.llmKey) {
          return {
            observation: 'Error: LLM API key is required for generate_code_edit',
            isError: true
          };
        }

        if (!context.llmConfig) {
          return {
            observation: 'Error: LLM configuration is required for generate_code_edit',
            isError: true
          };
        }

        // Validate and cast tool arguments
        const generateEditArgs = validateGenerateEditArgs(toolArgs);
        if (!generateEditArgs) {
          return {
            observation: 'Error: Invalid arguments for generate_code_edit. Expected: { file_path: string, edit_instructions: string, original_code_snippet?: string }',
            isError: true
          };
        }

        const generateEditResult = await executeGenerateCodeEdit(
          context.env,
          context.projectId,
          generateEditArgs,
          { llmKey: context.userApiKeys.llmKey },
          context.llmConfig
        );

        if (generateEditResult.error) {
          return {
            observation: `Error in generate_code_edit: ${generateEditResult.error}`,
            isError: true
          };
        }

        if (!generateEditResult.tool_output) {
          return {
            observation: 'Error: generate_code_edit returned no output',
            isError: true
          };
        }

        // Format observation for LLM consumption
        const observation = `Diff generated for file "${generateEditResult.tool_output.file_path}":
\`\`\`diff
${generateEditResult.tool_output.diff_string}
\`\`\`
You can now propose to apply this diff using another tool, or ask the user for confirmation.`;

        return {
          observation,
          isError: false
        };
      }

      default:
        console.warn(`[ToolExecutor] Unknown tool: ${toolName}`);
        return {
          observation: `Error: Unknown tool '${toolName}'. Available tools: code_search, read_file, generate_code_edit`,
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
 * Validates and casts arguments for generate_code_edit tool
 */
function validateGenerateEditArgs(args: Record<string, unknown>): GenerateEditArgs | null {
  if (typeof args.file_path !== 'string' || !args.file_path.trim()) {
    return null;
  }

  if (typeof args.edit_instructions !== 'string' || !args.edit_instructions.trim()) {
    return null;
  }

  const result: GenerateEditArgs = {
    file_path: args.file_path.trim(),
    edit_instructions: args.edit_instructions.trim()
  };

  // Optional original_code_snippet
  if (args.original_code_snippet !== undefined) {
    if (typeof args.original_code_snippet !== 'string') {
      return null;
    }
    result.original_code_snippet = args.original_code_snippet;
  }

  return result;
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

3. **generate_code_edit(file_path: string, edit_instructions: string, original_code_snippet?: string)**: Generates a code modification diff for the specified file based on edit instructions. Optionally, provide original_code_snippet for context; if not, the whole file will be used. Returns a diff string in unified format.
   - Use this when you need to modify existing code based on user requirements
   - Example: generate_code_edit(file_path="src/utils.js", edit_instructions="rename function foo to bar")
   - Example: generate_code_edit(file_path="src/auth.ts", edit_instructions="add null check before user.email access", original_code_snippet="function validateUser(user) { return user.email.includes('@'); }")

To use a tool, output on a new line:
Action: tool_name(param1="value1", param2="value2")

Examples:
Action: code_search(query="error handling middleware")
Action: read_file(file_path="workers/src/index.ts")
Action: generate_code_edit(file_path="src/utils.js", edit_instructions="add error handling to the parseData function")

After using a tool, you will receive an observation with the tool's output. Use this information to continue your reasoning and provide helpful responses.`;
}