/**
 * Generate Code Edit Tool - Generates semantic diffs for code modifications
 * Implements RFC-AGT-003: Semantic Diff Generation & Application
 * Implements RFC-AGT-002: Tool Definition & Execution Framework
 */

import type { Env, ChatCompletionRequest, SupportedExternalService } from '../types.js';
import { getChatCompletionViaProxy, isChatCompletionError } from '../lib/byokProxyClient.js';

export interface GenerateEditArgs {
  file_path: string;
  edit_instructions: string;
  original_code_snippet?: string;
}

export interface GenerateEditResult {
  tool_output: {
    diff_string: string;
    file_path: string;
  } | null;
  error?: string;
}

export interface LLMConfig {
  modelName: string;
  tokenLimit: number;
  reservedOutputTokens: number;
  temperature?: number;
}

/**
 * Executes code edit generation using LLM via BYOK proxy
 * @param env - Cloudflare Worker environment bindings
 * @param projectId - Project ID containing the file
 * @param args - Tool arguments containing file path, instructions, and optional code snippet
 * @param userApiKeys - User's API keys for external services
 * @param llmConfig - LLM configuration for the request
 * @returns Promise resolving to diff string or error
 */
export async function executeGenerateCodeEdit(
  env: Env,
  projectId: string,
  args: GenerateEditArgs,
  userApiKeys: { llmKey: string },
  llmConfig: LLMConfig
): Promise<GenerateEditResult> {
  try {
    console.log(`[GenerateEditTool] Generating code edit for project ${projectId}`, {
      filePath: args.file_path,
      hasCodeSnippet: !!args.original_code_snippet,
      instructionsLength: args.edit_instructions.length
    });

    // 1. Obtain original code
    let originalCode: string;
    if (args.original_code_snippet) {
      originalCode = args.original_code_snippet;
      console.log(`[GenerateEditTool] Using provided code snippet (${originalCode.length} chars)`);
    } else {
      // Fetch full file content from R2
      const r2Key = `projects/${projectId}/original/${args.file_path}`;
      const r2Object = await env.CODE_UPLOADS_BUCKET.get(r2Key);

      if (!r2Object) {
        console.warn(`[GenerateEditTool] File not found in R2: ${r2Key}`);
        return {
          tool_output: null,
          error: `File not found: ${args.file_path}`
        };
      }

      originalCode = await r2Object.text();
      console.log(`[GenerateEditTool] Fetched full file content (${originalCode.length} chars)`);
    }

    // 2. Construct prompt for LLM diff generation
    const prompt = constructDiffGenerationPrompt(args.file_path, originalCode, args.edit_instructions);

    // 3. Call LLM via BYOK proxy
    const chatRequest: ChatCompletionRequest = {
      model: llmConfig.modelName,
      messages: prompt.messages,
      temperature: llmConfig.temperature || 0.1, // Lower temperature for precision
      max_tokens: llmConfig.reservedOutputTokens
    };

    // Determine target service based on model name
    const targetService = determineTargetService(llmConfig.modelName);
    const proxyUrl = `${env.ENVIRONMENT === 'production' ? 'https://byok-proxy.your-domain.com' : 'http://localhost:8787'}/api/proxy/external`;

    const llmResult = await getChatCompletionViaProxy(
      fetch,
      targetService,
      userApiKeys.llmKey,
      chatRequest,
      proxyUrl
    );

    if (isChatCompletionError(llmResult)) {
      console.error(`[GenerateEditTool] LLM request failed:`, llmResult.error);
      return {
        tool_output: null,
        error: `LLM request failed: ${llmResult.error.message}`
      };
    }

    // 4. Process LLM response
    const rawResponse = llmResult.choices[0]?.message?.content;
    if (!rawResponse) {
      return {
        tool_output: null,
        error: 'LLM returned empty response'
      };
    }

    console.log(`[GenerateEditTool] Raw LLM response length: ${rawResponse.length}`);

    // Validate and clean the diff
    const cleanedDiff = validateAndCleanDiff(rawResponse);
    if (!cleanedDiff) {
      console.warn(`[GenerateEditTool] LLM did not produce valid diff format`);
      return {
        tool_output: null,
        error: 'LLM did not produce a valid diff format. Please try rephrasing your edit instructions.'
      };
    }

    console.log(`[GenerateEditTool] Successfully generated diff (${cleanedDiff.length} chars)`);

    return {
      tool_output: {
        diff_string: cleanedDiff,
        file_path: args.file_path
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GenerateEditTool] Failed to generate code edit:`, error);

    return {
      tool_output: null,
      error: `Failed to generate code edit: ${errorMessage}`
    };
  }
}

/**
 * Constructs the prompt for LLM diff generation with few-shot examples
 */
function constructDiffGenerationPrompt(filePath: string, originalCode: string, editInstructions: string) {
  const language = detectLanguageFromPath(filePath);

  return {
    messages: [
      {
        role: 'system' as const,
        content: `You are an expert code editing assistant. Your task is to generate a diff in the unified format.

IMPORTANT: Output ONLY the diff. Do not include explanations before or after the diff.
The diff should apply to the provided 'Original Code'.
User will provide 'Original Code' and 'Edit Instructions'.

--- Example 1 ---
Original Code:
function greet(name) {
  return "Hello " + name;
}

Edit Instructions:
Change the function name to "sayHello" and make the greeting "Hi" instead of "Hello".

Expected Diff Output:
--- a/original_code
+++ b/modified_code
@@ -1,3 +1,3 @@
-function greet(name) {
-  return "Hello " + name;
+function sayHello(name) {
+  return "Hi " + name;
 }
--- End Example 1 ---

--- Example 2 ---
Original Code:
const users = [];

function addUser(user) {
  users.push(user);
}

Edit Instructions:
Add null check before pushing user to array.

Expected Diff Output:
--- a/original_code
+++ b/modified_code
@@ -2,3 +2,5 @@
 
 function addUser(user) {
+  if (!user) return;
   users.push(user);
 }
--- End Example 2 ---`
      },
      {
        role: 'user' as const,
        content: `Original Code (\`${filePath}\`):
\`\`\`${language}
${originalCode}
\`\`\`

Edit Instructions:
${editInstructions}

Please provide the diff in unified format to achieve these edits.
Output ONLY the diff.`
      }
    ]
  };
}

/**
 * Validates and cleans the diff output from LLM
 */
function validateAndCleanDiff(rawResponse: string): string | null {
  let cleaned = rawResponse.trim();

  // Remove common LLM boilerplate text
  const boilerplatePatterns = [
    /^Here is the diff:?\s*/i,
    /^The diff is:?\s*/i,
    /^```diff\s*/,
    /\s*```$/,
    /^Diff:?\s*/i
  ];

  for (const pattern of boilerplatePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.trim();

  // Validate that it looks like a unified diff
  const diffPatterns = [
    /^--- a\//,           // Standard unified diff header
    /^diff --git/,       // Git diff header
    /^@@.*@@/m,          // Hunk header
    /^[-+]/m             // At least one line addition/deletion
  ];

  const hasValidDiffPattern = diffPatterns.some(pattern => pattern.test(cleaned));

  if (!hasValidDiffPattern) {
    console.warn(`[GenerateEditTool] Response doesn't match diff patterns:`, cleaned.substring(0, 200));
    return null;
  }

  return cleaned;
}

/**
 * Determines target service based on model name
 */
function determineTargetService(modelName: string): SupportedExternalService {
  const lowerModel = modelName.toLowerCase();

  if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
    return 'openai_chat';
  } else if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
    return 'anthropic_claude';
  } else if (lowerModel.includes('cohere')) {
    return 'cohere_generate';
  }

  // Default to OpenAI for unknown models
  return 'openai_chat';
}

/**
 * Simple language detection based on file extension
 */
function detectLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml',
    'json': 'json',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'fish': 'shell',
    'sql': 'sql',
    'xml': 'xml',
    'toml': 'toml',
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'ini'
  };

  return languageMap[extension || ''] || 'text';
}