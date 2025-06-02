/**
 * Self-Correction Service Tests
 * Tests for RFC-AGT-005: Agent Self-Correction Loop for Errors
 */

import { describe, it, expect } from 'vitest';
import type { AgentTurn } from '../types.js';
import {
  analyzeSelfCorrectionTrigger,
  shouldLimitCorrectionAttempts,
  type ErrorContext,
  type SelfCorrectionContext
} from './selfCorrectionService.js';

describe('Self-Correction Service', () => {
  describe('analyzeSelfCorrectionTrigger', () => {
    describe('tool execution errors', () => {
      it('should detect tool execution error from failed tool result', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'user',
            content: 'Read the file config.ts',
            timestamp: '2024-01-01T10:00:00Z'
          },
          {
            role: 'assistant',
            content: 'I need to read the config.ts file to help you.',
            toolCall: {
              name: 'read_file',
              parameters: { file_path: 'config.ts' }
            },
            timestamp: '2024-01-01T10:00:01Z'
          },
          {
            role: 'tool_observation',
            content: 'Error in read_file: File not found: config.ts',
            toolCall: {
              name: 'read_file',
              parameters: { file_path: 'config.ts' }
            },
            toolResult: {
              success: false,
              result: 'Error in read_file: File not found: config.ts',
              error: 'File not found: config.ts'
            },
            timestamp: '2024-01-01T10:00:02Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(conversationHistory, 'What does it contain?');

        expect(result.shouldTriggerCorrection).toBe(true);
        expect(result.errorContext?.type).toBe('tool_error');
        expect(result.errorContext?.errorMessage).toBe('File not found: config.ts');
        expect(result.errorContext?.failedAction?.toolName).toBe('read_file');
        expect(result.errorContext?.failedAction?.toolArgs).toEqual({ file_path: 'config.ts' });
        expect(result.correctionPromptSegment).toContain('PREVIOUS ACTION FAILED');
        expect(result.correctionPromptSegment).toContain('File not found: config.ts');
      });

      it('should detect tool execution error from tool result without explicit error field', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'assistant',
            content: 'Let me search for authentication code.',
            toolCall: {
              name: 'code_search',
              parameters: { query: 'auth' }
            },
            timestamp: '2024-01-01T10:00:01Z'
          },
          {
            role: 'tool_observation',
            content: 'Search failed due to missing API key',
            toolCall: {
              name: 'code_search',
              parameters: { query: 'auth' }
            },
            toolResult: {
              success: false,
              result: 'Search failed due to missing API key'
            },
            timestamp: '2024-01-01T10:00:02Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(conversationHistory, 'Continue');

        expect(result.shouldTriggerCorrection).toBe(true);
        expect(result.errorContext?.type).toBe('tool_error');
        expect(result.errorContext?.errorMessage).toBe('Search failed due to missing API key');
        expect(result.errorContext?.failedAction?.toolName).toBe('code_search');
      });

      it('should not trigger correction for successful tool execution', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'assistant',
            content: 'Let me read the file.',
            toolCall: {
              name: 'read_file',
              parameters: { file_path: 'src/index.ts' }
            },
            timestamp: '2024-01-01T10:00:01Z'
          },
          {
            role: 'tool_observation',
            content: 'File content: export function main() { ... }',
            toolCall: {
              name: 'read_file',
              parameters: { file_path: 'src/index.ts' }
            },
            toolResult: {
              success: true,
              result: 'File content: export function main() { ... }'
            },
            timestamp: '2024-01-01T10:00:02Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(conversationHistory, 'What does it do?');

        expect(result.shouldTriggerCorrection).toBe(false);
        expect(result.errorContext).toBeUndefined();
      });

      it('should handle tool observation without corresponding tool call', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'tool_observation',
            content: 'Error: Tool execution failed',
            toolResult: {
              success: false,
              result: 'Tool execution failed',
              error: 'Tool execution failed'
            },
            timestamp: '2024-01-01T10:00:02Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(conversationHistory, 'Continue');

        expect(result.shouldTriggerCorrection).toBe(true);
        expect(result.errorContext?.type).toBe('tool_error');
        expect(result.errorContext?.failedAction).toBeUndefined();
      });
    });

    describe('user feedback errors', () => {
      it('should detect user feedback error with direct reference', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'user',
            content: 'Generate a function to validate email',
            timestamp: '2024-01-01T10:00:00Z'
          },
          {
            role: 'assistant',
            content: 'Here\'s a function to validate email:\n\nfunction validateEmail(email) {\n  return email.includes("@");\n}',
            timestamp: '2024-01-01T10:00:01Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(
          conversationHistory, 
          'That code has a bug - it doesn\'t properly validate email format'
        );

        expect(result.shouldTriggerCorrection).toBe(true);
        expect(result.errorContext?.type).toBe('user_feedback_error');
        expect(result.errorContext?.userFeedback).toBe('That code has a bug - it doesn\'t properly validate email format');
        expect(result.errorContext?.previousAgentOutput).toContain('function validateEmail');
        expect(result.correctionPromptSegment).toContain('USER FEEDBACK INDICATES ERROR');
      });

      it('should detect various error keywords', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'assistant',
            content: 'The function should work correctly.',
            timestamp: '2024-01-01T10:00:01Z'
          }
        ];

        const errorKeywords = [
          'That\'s wrong',
          'The code failed',
          'Your code didn\'t work',
          'There\'s a bug in that',
          'Your solution is broken',
          'There\'s an issue with your code',
          'That\'s a mistake',
          'Please fix that',
          'Your code crashes when I run it'
        ];

        for (const feedback of errorKeywords) {
          const result = analyzeSelfCorrectionTrigger(conversationHistory, feedback);
          expect(result.shouldTriggerCorrection).toBe(true);
          expect(result.errorContext?.type).toBe('user_feedback_error');
        }
      });

      it('should not trigger for general mentions of errors without direct feedback', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'assistant',
            content: 'Here\'s the code you requested.',
            timestamp: '2024-01-01T10:00:01Z'
          }
        ];

        const nonErrorFeedback = [
          'How do I handle errors in this code?',
          'What if there\'s an error in the input?',
          'Can you add error handling?',
          'I want to prevent bugs in general'
        ];

        for (const feedback of nonErrorFeedback) {
          const result = analyzeSelfCorrectionTrigger(conversationHistory, feedback);
          expect(result.shouldTriggerCorrection).toBe(false);
        }
      });

      it('should require direct feedback indicators', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'assistant',
            content: 'Here\'s the solution.',
            timestamp: '2024-01-01T10:00:01Z'
          }
        ];

        // Has error keyword but no direct feedback indicator
        const result1 = analyzeSelfCorrectionTrigger(conversationHistory, 'There might be an error somewhere');
        expect(result1.shouldTriggerCorrection).toBe(false);

        // Has both error keyword and direct feedback indicator
        const result2 = analyzeSelfCorrectionTrigger(conversationHistory, 'Your solution has an error');
        expect(result2.shouldTriggerCorrection).toBe(true);
      });

      it('should not trigger when no previous assistant turn exists', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'user',
            content: 'Hello',
            timestamp: '2024-01-01T10:00:00Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(conversationHistory, 'That\'s wrong');

        expect(result.shouldTriggerCorrection).toBe(false);
      });
    });

    describe('priority handling', () => {
      it('should prioritize tool errors over user feedback errors', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'assistant',
            content: 'Let me read the file.',
            toolCall: {
              name: 'read_file',
              parameters: { file_path: 'missing.ts' }
            },
            timestamp: '2024-01-01T10:00:01Z'
          },
          {
            role: 'tool_observation',
            content: 'Error: File not found',
            toolResult: {
              success: false,
              result: 'File not found',
              error: 'File not found'
            },
            timestamp: '2024-01-01T10:00:02Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(
          conversationHistory, 
          'That previous code was wrong'
        );

        expect(result.shouldTriggerCorrection).toBe(true);
        expect(result.errorContext?.type).toBe('tool_error');
        expect(result.correctionPromptSegment).toContain('PREVIOUS ACTION FAILED');
      });
    });

    describe('no correction needed', () => {
      it('should not trigger correction for normal conversation', () => {
        const conversationHistory: AgentTurn[] = [
          {
            role: 'user',
            content: 'How does authentication work?',
            timestamp: '2024-01-01T10:00:00Z'
          },
          {
            role: 'assistant',
            content: 'Authentication typically involves verifying user credentials...',
            timestamp: '2024-01-01T10:00:01Z'
          }
        ];

        const result = analyzeSelfCorrectionTrigger(conversationHistory, 'Can you give me an example?');

        expect(result.shouldTriggerCorrection).toBe(false);
        expect(result.errorContext).toBeUndefined();
        expect(result.correctionPromptSegment).toBeUndefined();
      });
    });
  });

  describe('shouldLimitCorrectionAttempts', () => {
    it('should not limit when no correction attempts have been made', () => {
      const conversationHistory: AgentTurn[] = [
        {
          role: 'user',
          content: 'Hello',
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          role: 'assistant',
          content: 'Hi there!',
          timestamp: '2024-01-01T10:00:01Z'
        }
      ];

      const result = shouldLimitCorrectionAttempts(conversationHistory, 3);
      expect(result).toBe(false);
    });

    it('should limit when maximum correction attempts reached', () => {
      const conversationHistory: AgentTurn[] = [
        {
          role: 'assistant',
          content: 'PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED: Error...',
          timestamp: '2024-01-01T10:00:01Z'
        },
        {
          role: 'assistant',
          content: 'PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED: Error...',
          timestamp: '2024-01-01T10:00:02Z'
        },
        {
          role: 'assistant',
          content: 'USER FEEDBACK INDICATES ERROR IN PREVIOUS RESPONSE - SELF-CORRECTION REQUIRED...',
          timestamp: '2024-01-01T10:00:03Z'
        }
      ];

      const result = shouldLimitCorrectionAttempts(conversationHistory, 3);
      expect(result).toBe(true);
    });

    it('should not limit when under the threshold', () => {
      const conversationHistory: AgentTurn[] = [
        {
          role: 'assistant',
          content: 'PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED: Error...',
          timestamp: '2024-01-01T10:00:01Z'
        },
        {
          role: 'assistant',
          content: 'Normal response without correction',
          timestamp: '2024-01-01T10:00:02Z'
        }
      ];

      const result = shouldLimitCorrectionAttempts(conversationHistory, 3);
      expect(result).toBe(false);
    });

    it('should only count recent correction attempts', () => {
      // Create a long conversation history with old correction attempts
      const conversationHistory: AgentTurn[] = [];
      
      // Add 15 old turns (beyond the 10-turn window)
      for (let i = 0; i < 15; i++) {
        conversationHistory.push({
          role: 'assistant',
          content: i < 5 ? 'PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED: Error...' : 'Normal response',
          timestamp: `2024-01-01T09:${i.toString().padStart(2, '0')}:00Z`
        });
      }

      // Add recent turns with only 2 correction attempts
      conversationHistory.push(
        {
          role: 'assistant',
          content: 'PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED: Error...',
          timestamp: '2024-01-01T10:00:01Z'
        },
        {
          role: 'assistant',
          content: 'Normal response',
          timestamp: '2024-01-01T10:00:02Z'
        },
        {
          role: 'assistant',
          content: 'USER FEEDBACK INDICATES ERROR IN PREVIOUS RESPONSE - SELF-CORRECTION REQUIRED...',
          timestamp: '2024-01-01T10:00:03Z'
        }
      );

      const result = shouldLimitCorrectionAttempts(conversationHistory, 3);
      expect(result).toBe(false); // Should not limit because only 2 recent attempts
    });

    it('should use custom max attempts parameter', () => {
      const conversationHistory: AgentTurn[] = [
        {
          role: 'assistant',
          content: 'PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED: Error...',
          timestamp: '2024-01-01T10:00:01Z'
        },
        {
          role: 'assistant',
          content: 'PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED: Error...',
          timestamp: '2024-01-01T10:00:02Z'
        }
      ];

      // Should limit with maxAttempts = 2
      const result1 = shouldLimitCorrectionAttempts(conversationHistory, 2);
      expect(result1).toBe(true);

      // Should not limit with maxAttempts = 5
      const result2 = shouldLimitCorrectionAttempts(conversationHistory, 5);
      expect(result2).toBe(false);
    });
  });

  describe('correction prompt generation', () => {
    it('should generate appropriate tool error correction prompt', () => {
      const conversationHistory: AgentTurn[] = [
        {
          role: 'assistant',
          content: 'Let me search for the function.',
          toolCall: {
            name: 'code_search',
            parameters: { query: 'validateUser' }
          },
          timestamp: '2024-01-01T10:00:01Z'
        },
        {
          role: 'tool_observation',
          content: 'Error: Invalid API key',
          toolResult: {
            success: false,
            result: 'Invalid API key',
            error: 'Invalid API key'
          },
          timestamp: '2024-01-01T10:00:02Z'
        }
      ];

      const result = analyzeSelfCorrectionTrigger(conversationHistory, 'Continue');

      expect(result.correctionPromptSegment).toContain('PREVIOUS ACTION FAILED - SELF-CORRECTION REQUIRED');
      expect(result.correctionPromptSegment).toContain('Error Details: Invalid API key');
      expect(result.correctionPromptSegment).toContain('Failed Tool: code_search');
      expect(result.correctionPromptSegment).toContain('Tool Arguments:');
      expect(result.correctionPromptSegment).toContain('validateUser');
      expect(result.correctionPromptSegment).toContain('INSTRUCTIONS FOR CORRECTION');
      expect(result.correctionPromptSegment).toContain('Do not repeat the same action with identical parameters');
    });

    it('should generate appropriate user feedback correction prompt', () => {
      const conversationHistory: AgentTurn[] = [
        {
          role: 'assistant',
          content: 'Here\'s a simple email validation function:\n\nfunction isValidEmail(email) {\n  return email.includes("@");\n}',
          timestamp: '2024-01-01T10:00:01Z'
        }
      ];

      const userFeedback = 'That code has a bug - it doesn\'t properly validate email format';
      const result = analyzeSelfCorrectionTrigger(conversationHistory, userFeedback);

      expect(result.shouldTriggerCorrection).toBe(true);
      expect(result.correctionPromptSegment).toBeDefined();
      expect(result.correctionPromptSegment).toContain('USER FEEDBACK INDICATES ERROR IN PREVIOUS RESPONSE - SELF-CORRECTION REQUIRED');
      expect(result.correctionPromptSegment).toContain(`User Feedback: "${userFeedback}"`);
      expect(result.correctionPromptSegment).toContain('Previous Agent Response:');
      expect(result.correctionPromptSegment).toContain('function isValidEmail');
      expect(result.correctionPromptSegment).toContain('INSTRUCTIONS FOR CORRECTION');
      expect(result.correctionPromptSegment).toContain('Provide a corrected version that addresses the user\'s concerns');
    });

    it('should truncate long previous agent output', () => {
      const longContent = 'A'.repeat(600); // Longer than 500 char limit
      const conversationHistory: AgentTurn[] = [
        {
          role: 'assistant',
          content: longContent,
          timestamp: '2024-01-01T10:00:01Z'
        }
      ];

      const result = analyzeSelfCorrectionTrigger(conversationHistory, 'That\'s wrong');

      expect(result.correctionPromptSegment).toContain('Previous Agent Response:');
      expect(result.correctionPromptSegment).toContain('A'.repeat(500) + '...');
      expect(result.correctionPromptSegment).not.toContain('A'.repeat(600));
    });
  });
}); 