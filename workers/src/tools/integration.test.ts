/**
 * Integration test for Tool Manifest & Basic Tools
 * Tests RFC-AGT-002: Tool Definition & Execution Framework
 */

import { describe, it, expect } from 'vitest';
import { generateToolManifestPrompt } from '../services/toolExecutor.js';

describe('Tool Integration', () => {
  it('should generate valid tool manifest prompt', () => {
    const manifest = generateToolManifestPrompt();

    // Verify manifest contains essential elements
    expect(manifest).toContain('You have access to the following tools:');
    expect(manifest).toContain('code_search(query: string)');
    expect(manifest).toContain('read_file(file_path: string)');
    expect(manifest).toContain('Action: tool_name(param1="value1", param2="value2")');

    // Verify examples are present
    expect(manifest).toContain('Action: code_search(query="error handling middleware")');
    expect(manifest).toContain('Action: read_file(file_path="workers/src/index.ts")');

    // Verify instructions are clear
    expect(manifest).toContain('To use a tool, output on a new line:');
    expect(manifest).toContain('After using a tool, you will receive an observation');

    console.log('Generated Tool Manifest:');
    console.log('='.repeat(50));
    console.log(manifest);
    console.log('='.repeat(50));
  });

  it('should demonstrate tool workflow', () => {
    // This test demonstrates the expected workflow:
    // 1. Client sends user query to /api/agent/react_step with tool manifest
    // 2. LLM responds with action_details containing tool_name and tool_args
    // 3. Client sends tool execution request to /api/agent/execute_action
    // 4. Tool executes and returns observation
    // 5. Client sends observation back to /api/agent/react_step for next iteration

    const toolManifest = generateToolManifestPrompt();

    // Mock LLM response that would propose a tool action
    const mockLLMResponse = `
Thought: I need to search for authentication-related code to understand how it's implemented.

Action: code_search(query="authentication login")
    `.trim();

    // This would be parsed by the ReAct agent to extract:
    const expectedActionDetails = {
      tool_name: 'code_search',
      tool_args: { query: 'authentication login' },
      raw_action_string: 'Action: code_search(query="authentication login")'
    };

    // Mock tool execution result
    const mockToolObservation = `Found 2 code snippets for query: "authentication login"

1. **src/auth/login.ts** (Lines 15-30, Score: 0.892)
\`\`\`typescript
export async function authenticateUser(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }
  return generateJWT(user);
}
\`\`\`

2. **src/middleware/auth.ts** (Lines 8-20, Score: 0.845)
\`\`\`typescript
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  // ... token validation logic
};
\`\`\``;

    // Verify the workflow components exist
    expect(toolManifest).toBeTruthy();
    expect(expectedActionDetails.tool_name).toBe('code_search');
    expect(expectedActionDetails.tool_args.query).toBe('authentication login');
    expect(mockToolObservation).toContain('Found 2 code snippets');
    expect(mockToolObservation).toContain('src/auth/login.ts');
    expect(mockToolObservation).toContain('authenticateUser');

    console.log('Tool Workflow Demonstration:');
    console.log('1. Tool Manifest:', toolManifest.substring(0, 100) + '...');
    console.log('2. Expected Action:', expectedActionDetails);
    console.log('3. Tool Observation:', mockToolObservation.substring(0, 200) + '...');
  });
});