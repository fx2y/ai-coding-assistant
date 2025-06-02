/**
 * Demonstration of the generate_code_edit tool
 * Shows how to use the tool for various code modification scenarios
 * 
 * This is an example script demonstrating RFC-AGT-003 implementation
 */

import { executeGenerateCodeEdit, type GenerateEditArgs, type LLMConfig } from '../src/tools/generateEditTool.js';
import type { Env } from '../src/types.js';

// Mock environment for demonstration
const mockEnv: Env = {
  ENVIRONMENT: 'demo',
  CODE_UPLOADS_BUCKET: {} as any,
  METADATA_KV: {} as any,
  VECTORIZE_INDEX: {} as any,
};

const mockUserApiKeys = {
  llmKey: 'your-openai-api-key-here'
};

const mockLLMConfig: LLMConfig = {
  modelName: 'gpt-4',
  tokenLimit: 4000,
  reservedOutputTokens: 1000,
  temperature: 0.1
};

/**
 * Example 1: Simple function rename
 */
async function demoFunctionRename() {
  console.log('\n=== Demo 1: Function Rename ===');
  
  const args: GenerateEditArgs = {
    file_path: 'src/utils.js',
    edit_instructions: 'Rename function "calculateTotal" to "computeSum"',
    original_code_snippet: `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

export { calculateTotal };
    `.trim()
  };

  console.log('Original code:');
  console.log(args.original_code_snippet);
  console.log('\nEdit instructions:', args.edit_instructions);
  
  // In a real scenario, this would call the LLM
  console.log('\nExpected diff output:');
  console.log(`--- a/src/utils.js
+++ b/src/utils.js
@@ -1,5 +1,5 @@
-function calculateTotal(items) {
+function computeSum(items) {
   return items.reduce((sum, item) => sum + item.price, 0);
 }
 
-export { calculateTotal };
+export { computeSum };`);
}

/**
 * Example 2: Add error handling
 */
async function demoAddErrorHandling() {
  console.log('\n=== Demo 2: Add Error Handling ===');
  
  const args: GenerateEditArgs = {
    file_path: 'src/api.ts',
    edit_instructions: 'Add null check and error handling before accessing user.email',
    original_code_snippet: `
function validateUser(user) {
  if (user.email.includes('@')) {
    return true;
  }
  return false;
}
    `.trim()
  };

  console.log('Original code:');
  console.log(args.original_code_snippet);
  console.log('\nEdit instructions:', args.edit_instructions);
  
  console.log('\nExpected diff output:');
  console.log(`--- a/src/api.ts
+++ b/src/api.ts
@@ -1,5 +1,8 @@
 function validateUser(user) {
+  if (!user || !user.email) {
+    throw new Error('User or email is missing');
+  }
   if (user.email.includes('@')) {
     return true;
   }
   return false;
 }`);
}

/**
 * Example 3: TypeScript type annotation
 */
async function demoAddTypeAnnotations() {
  console.log('\n=== Demo 3: Add TypeScript Types ===');
  
  const args: GenerateEditArgs = {
    file_path: 'src/components/Button.tsx',
    edit_instructions: 'Add proper TypeScript interface for props with onClick handler and children',
    original_code_snippet: `
export function Button(props) {
  return (
    <button onClick={props.onClick}>
      {props.children}
    </button>
  );
}
    `.trim()
  };

  console.log('Original code:');
  console.log(args.original_code_snippet);
  console.log('\nEdit instructions:', args.edit_instructions);
  
  console.log('\nExpected diff output:');
  console.log(`--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,6 +1,11 @@
-export function Button(props) {
+interface ButtonProps {
+  onClick: () => void;
+  children: React.ReactNode;
+}
+
+export function Button(props: ButtonProps) {
   return (
     <button onClick={props.onClick}>
       {props.children}
     </button>
   );
 }`);
}

/**
 * Example 4: Refactor to use modern syntax
 */
async function demoModernizeSyntax() {
  console.log('\n=== Demo 4: Modernize JavaScript Syntax ===');
  
  const args: GenerateEditArgs = {
    file_path: 'src/legacy.js',
    edit_instructions: 'Convert to arrow function and use destructuring for the parameter',
    original_code_snippet: `
function processUser(userObj) {
  var name = userObj.name;
  var email = userObj.email;
  return name + ' <' + email + '>';
}
    `.trim()
  };

  console.log('Original code:');
  console.log(args.original_code_snippet);
  console.log('\nEdit instructions:', args.edit_instructions);
  
  console.log('\nExpected diff output:');
  console.log(`--- a/src/legacy.js
+++ b/src/legacy.js
@@ -1,5 +1,3 @@
-function processUser(userObj) {
-  var name = userObj.name;
-  var email = userObj.email;
-  return name + ' <' + email + '>';
-}
+const processUser = ({ name, email }) => {
+  return \`\${name} <\${email}>\`;
+};`);
}

/**
 * Tool usage in ReAct agent context
 */
function demoReActUsage() {
  console.log('\n=== Demo 5: ReAct Agent Usage ===');
  
  console.log('User: "In src/utils.js, rename the function foo to bar"');
  console.log('');
  console.log('Agent Thought: I need to modify a file. I should use the generate_code_edit tool to create a diff.');
  console.log('');
  console.log('Agent Action: generate_code_edit(file_path="src/utils.js", edit_instructions="rename function foo to bar")');
  console.log('');
  console.log('Tool Observation: Diff generated for file "src/utils.js":');
  console.log('```diff');
  console.log('--- a/src/utils.js');
  console.log('+++ b/src/utils.js');
  console.log('@@ -1,3 +1,3 @@');
  console.log('-function foo() {');
  console.log('+function bar() {');
  console.log('   return "hello world";');
  console.log(' }');
  console.log('```');
  console.log('You can now propose to apply this diff using another tool, or ask the user for confirmation.');
  console.log('');
  console.log('Agent Thought: The diff looks correct. I should ask the user to confirm before applying it.');
  console.log('');
  console.log('Agent Response: I\'ve generated a diff to rename the function `foo` to `bar` in `src/utils.js`. The change looks correct - it will rename the function while preserving all the existing functionality. Would you like me to apply this change?');
}

/**
 * Run all demonstrations
 */
async function runDemos() {
  console.log('🚀 Generate Code Edit Tool Demonstration');
  console.log('==========================================');
  console.log('');
  console.log('This tool implements RFC-AGT-003: Semantic Diff Generation & Application');
  console.log('It uses LLMs to generate unified diffs for code modifications based on natural language instructions.');
  
  await demoFunctionRename();
  await demoAddErrorHandling();
  await demoAddTypeAnnotations();
  await demoModernizeSyntax();
  demoReActUsage();
  
  console.log('\n=== Key Features ===');
  console.log('✅ Generates unified diff format output');
  console.log('✅ Supports both code snippets and full file context');
  console.log('✅ Language detection for proper syntax highlighting');
  console.log('✅ Robust LLM response validation and cleaning');
  console.log('✅ Integration with BYOK proxy for secure API calls');
  console.log('✅ Comprehensive error handling');
  console.log('✅ Support for multiple LLM providers (OpenAI, Anthropic, Cohere)');
  
  console.log('\n=== Usage in Tool Executor ===');
  console.log('The tool is registered in toolExecutor.ts and can be called via:');
  console.log('executeToolByName(context, "generate_code_edit", args)');
  
  console.log('\n=== Next Steps ===');
  console.log('- Implement diff application tool (RFC-AGT-003 part 2)');
  console.log('- Add user confirmation workflow');
  console.log('- Integrate with client-side diff preview');
}

// Run demos if this file is executed directly
// Note: In a Cloudflare Workers environment, you would call runDemos() manually
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runDemos().catch(console.error);
// }

export {
  demoFunctionRename,
  demoAddErrorHandling,
  demoAddTypeAnnotations,
  demoModernizeSyntax,
  demoReActUsage,
  runDemos
}; 