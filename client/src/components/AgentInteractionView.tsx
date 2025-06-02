/**
 * Agent Interaction View Component
 * Implements P2-E2-S3: Client UI for displaying agent thoughts, actions, and observations
 * Implements RFC-UI-001: Thin client architecture with backend-driven logic
 * Implements P3-E1-S2: Client & Worker: Diff Display & Approval Workflow
 */

import { useState, useRef, useEffect } from 'preact/hooks';
import { useActiveFile, getImplicitContext } from '../contexts/ActiveFileContext';
import {
  performReactStep,
  executeToolAction,
  generateSessionId,
  createAgentTurn,
  getDefaultLLMConfig,
  applyDiff,
  type AgentTurn,
  type ActionDetails,
  type ReactStepResponse
} from '../services/agentApiService';
import { DiffViewer } from './DiffViewer';
import './AgentInteractionView.css';

interface AgentInteractionViewProps {
  defaultProjectId?: string;
}

interface PendingAction {
  actionDetails: ActionDetails;
  turnIndex: number;
}

interface PendingDiff {
  diffString: string;
  filePath: string;
  turnIndex: number;
}

interface ConversationTurn {
  agentTurn: AgentTurn;
  reactResponse?: ReactStepResponse;
}

export function AgentInteractionView({ defaultProjectId = '' }: AgentInteractionViewProps) {
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [userQuery, setUserQuery] = useState('');
  const [sessionId, setSessionId] = useState(generateSessionId());
  const [conversationTurns, setConversationTurns] = useState<ConversationTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);
  const [collapsedThoughts, setCollapsedThoughts] = useState<Set<number>>(new Set());
  
  const conversationRef = useRef<HTMLDivElement>(null);
  const { activeFilePath } = useActiveFile();

  // Auto-scroll to bottom when conversation updates
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversationTurns, isLoading]);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    if (!userQuery.trim()) {
      setError('Please enter a query');
      return;
    }

    if (!projectId.trim()) {
      setError('Please enter a project ID');
      return;
    }

    setError('');
    setIsLoading(true);
    setLoadingMessage('Agent is thinking...');

    try {
      // Add user query to conversation
      const userTurn = createAgentTurn('user', userQuery.trim());
      const newUserTurn: ConversationTurn = { agentTurn: userTurn };
      const updatedTurns = [...conversationTurns, newUserTurn];
      setConversationTurns(updatedTurns);

      // Clear the input
      setUserQuery('');

      // Perform ReAct step
      await performReactStepWithTurns(updatedTurns);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  const performReactStepWithTurns = async (turns: ConversationTurn[]) => {
    try {
      const implicitContext = getImplicitContext(activeFilePath);
      const conversationHistory = turns.map(turn => turn.agentTurn);
      
      const response = await performReactStep({
        project_id: projectId.trim(),
        session_id: sessionId,
        user_query: conversationHistory[conversationHistory.length - 1]?.content || '',
        conversation_history: conversationHistory,
        llm_config: getDefaultLLMConfig(),
        max_iterations_left: 5,
        ...(implicitContext.last_focused_file_path && {
          implicit_context: implicitContext
        })
      });

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'ReAct step failed');
      }

      const reactResponse = response.data;
      
      // Create assistant turn with the response data
      const assistantTurn = createAgentTurn('assistant', reactResponse.thought || reactResponse.direct_response || '');
      const newAssistantTurn: ConversationTurn = { 
        agentTurn: assistantTurn, 
        reactResponse 
      };
      
      const updatedTurns = [...turns, newAssistantTurn];
      setConversationTurns(updatedTurns);

      // Handle the response based on status
      if (reactResponse.status === 'action_proposed' && reactResponse.action_details) {
        // Store pending action for user confirmation
        setPendingAction({
          actionDetails: reactResponse.action_details,
          turnIndex: updatedTurns.length - 1
        });
        setLoadingMessage('');
        setIsLoading(false);
      } else if (reactResponse.status === 'direct_response_provided') {
        // Agent provided a direct response, conversation turn complete
        setLoadingMessage('');
        setIsLoading(false);
        setPendingAction(null);
      } else if (reactResponse.status === 'error') {
        throw new Error('Agent encountered an error during reasoning');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'ReAct step failed');
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleExecuteAction = async (actionDetails: ActionDetails) => {
    if (!pendingAction) return;

    setIsLoading(true);
    setLoadingMessage(`Executing ${actionDetails.tool_name}...`);
    setPendingAction(null);

    try {
      // Execute the tool
      const response = await executeToolAction({
        project_id: projectId.trim(),
        session_id: sessionId,
        tool_name: actionDetails.tool_name,
        tool_args: actionDetails.tool_args,
        ...(actionDetails.tool_name === 'code_search' && {
          embedding_model_config: {
            service: 'openai_embedding',
            modelName: 'text-embedding-ada-002'
          }
        })
      });

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Tool execution failed');
      }

      const toolResponse = response.data;

      // Add tool observation to conversation
      const observationTurn = createAgentTurn('tool_observation', toolResponse.observation);
      observationTurn.toolCall = { name: toolResponse.tool_name, parameters: actionDetails.tool_args };
      observationTurn.toolResult = { 
        success: !toolResponse.is_error, 
        result: toolResponse.observation,
        ...(toolResponse.is_error && { error: 'Tool execution failed' })
      };
      
      const newObservationTurn: ConversationTurn = { agentTurn: observationTurn };
      const updatedTurns = [...conversationTurns, newObservationTurn];
      setConversationTurns(updatedTurns);

      // Continue with next ReAct step
      setLoadingMessage('Agent is processing the results...');
      await performReactStepWithTurns(updatedTurns);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tool execution failed');
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleCancelAction = () => {
    setPendingAction(null);
    setIsLoading(false);
    setLoadingMessage('');
  };

  const handleClearConversation = () => {
    setConversationTurns([]);
    setSessionId(generateSessionId());
    setPendingAction(null);
    setPendingDiff(null);
    setError('');
    setCollapsedThoughts(new Set());
  };

  const toggleThought = (index: number) => {
    const newCollapsed = new Set(collapsedThoughts);
    if (newCollapsed.has(index)) {
      newCollapsed.delete(index);
    } else {
      newCollapsed.add(index);
    }
    setCollapsedThoughts(newCollapsed);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  /**
   * Parse a diff observation to extract diff string and file path
   * Implements P3-E1-S2: Diff observation parsing
   */
  const parseDiffObservation = (content: string): { diffString: string; filePath: string } | null => {
    // Look for pattern: 'Diff generated for file "path/to/file.js":'
    const filePathMatch = content.match(/Diff generated for file "([^"]+)":/);
    if (!filePathMatch) return null;

    const filePath = filePathMatch[1];

    // Extract diff content between ```diff and ```
    const diffMatch = content.match(/```diff\n([\s\S]*?)\n```/);
    if (!diffMatch) return null;

    const diffString = diffMatch[1];

    return { diffString, filePath };
  };

  /**
   * Handle diff approval - apply the diff and continue the conversation
   */
  const handleApproveDiff = async () => {
    if (!pendingDiff) return;

    setIsLoading(true);
    setLoadingMessage('Applying diff...');

    try {
      const response = await applyDiff({
        project_id: projectId.trim(),
        file_path: pendingDiff.filePath,
        diff_string: pendingDiff.diffString
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to apply diff');
      }

      // Create observation about successful diff application
      const observationContent = `Diff for "${pendingDiff.filePath}" was approved and applied successfully.`;
      const observationTurn = createAgentTurn('tool_observation', observationContent);
      
      const newObservationTurn: ConversationTurn = { agentTurn: observationTurn };
      const updatedTurns = [...conversationTurns, newObservationTurn];
      setConversationTurns(updatedTurns);

      // Clear pending diff
      setPendingDiff(null);

      // Continue with next ReAct step
      setLoadingMessage('Agent is processing the results...');
      await performReactStepWithTurns(updatedTurns);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply diff');
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  /**
   * Handle diff rejection - continue the conversation with rejection observation
   */
  const handleRejectDiff = async () => {
    if (!pendingDiff) return;

    setIsLoading(true);
    setLoadingMessage('Processing rejection...');

    try {
      // Create observation about diff rejection
      const observationContent = `User rejected the proposed diff for "${pendingDiff.filePath}".`;
      const observationTurn = createAgentTurn('tool_observation', observationContent);
      
      const newObservationTurn: ConversationTurn = { agentTurn: observationTurn };
      const updatedTurns = [...conversationTurns, newObservationTurn];
      setConversationTurns(updatedTurns);

      // Clear pending diff
      setPendingDiff(null);

      // Continue with next ReAct step
      setLoadingMessage('Agent is processing the results...');
      await performReactStepWithTurns(updatedTurns);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process rejection');
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const renderConversationTurn = (turn: ConversationTurn, index: number) => {
    const { agentTurn, reactResponse } = turn;
    const isThoughtCollapsed = collapsedThoughts.has(index);

    if (agentTurn.role === 'user') {
      return (
        <div key={index} className="agent-turn user">
          <div className="agent-turn-header">
            <div className="agent-turn-icon">U</div>
            <span className="agent-turn-role">You</span>
            <span className="agent-turn-timestamp">{formatTimestamp(agentTurn.timestamp)}</span>
          </div>
          <div className="agent-turn-content">{agentTurn.content}</div>
        </div>
      );
    }

    if (agentTurn.role === 'assistant') {
      const isLatestTurn = index === conversationTurns.length - 1;
      const hasThought = reactResponse?.thought;
      const hasAction = reactResponse?.action_details;
      const hasDirectResponse = reactResponse?.direct_response;
      const showPendingAction = isLatestTurn && pendingAction && hasAction;

      return (
        <div key={index} className="agent-turn assistant">
          <div className="agent-turn-header">
            <div className="agent-turn-icon">A</div>
            <span className="agent-turn-role">Assistant</span>
            <span className="agent-turn-timestamp">{formatTimestamp(agentTurn.timestamp)}</span>
          </div>

          {hasThought && (
            <div className="agent-thought-section">
              <div className="agent-thought-header" onClick={() => toggleThought(index)}>
                <span className="agent-thought-label">💭 Thought</span>
                <span className="agent-thought-toggle">
                  {isThoughtCollapsed ? '▶ Show' : '▼ Hide'}
                </span>
              </div>
              <div className={`agent-thought-content ${isThoughtCollapsed ? 'collapsed' : ''}`}>
                {reactResponse.thought}
              </div>
            </div>
          )}

          {hasAction && reactResponse?.action_details && (
            <div className="agent-action-section">
              <div className="agent-action-header">
                <span className="agent-action-label">🔧 Proposed Action</span>
              </div>
              <div className="agent-action-content">
                <div className="agent-action-tool">{reactResponse.action_details.tool_name}</div>
                <div className="agent-action-args">
                  {JSON.stringify(reactResponse.action_details.tool_args, null, 2)}
                </div>
                {showPendingAction && (
                  <div className="agent-action-buttons">
                    <button
                      className="agent-execute-btn"
                      onClick={() => handleExecuteAction(reactResponse.action_details!)}
                      disabled={isLoading}
                    >
                      Execute {reactResponse.action_details.tool_name}
                    </button>
                    <button
                      className="agent-cancel-btn"
                      onClick={handleCancelAction}
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {hasDirectResponse && (
            <div className="agent-direct-response">
              {reactResponse.direct_response}
            </div>
          )}

          {!hasThought && !hasAction && !hasDirectResponse && (
            <div className="agent-turn-content">{agentTurn.content}</div>
          )}
        </div>
      );
    }

    if (agentTurn.role === 'tool_observation') {
      const toolName = agentTurn.toolCall?.name || 'unknown';
      const isError = !agentTurn.toolResult?.success || !!agentTurn.toolResult?.error;
      
      // Check if this is a diff observation from generate_code_edit tool
      const diffData = toolName === 'generate_code_edit' ? parseDiffObservation(agentTurn.content) : null;
      const isLatestTurn = index === conversationTurns.length - 1;
      const showDiffActions = isLatestTurn && diffData && !pendingDiff;

      // Set pending diff if this is the latest diff observation
      if (showDiffActions && diffData) {
        // Use setTimeout to avoid state update during render
        setTimeout(() => {
          setPendingDiff({
            diffString: diffData.diffString,
            filePath: diffData.filePath,
            turnIndex: index
          });
        }, 0);
      }

      return (
        <div key={index} className="agent-turn tool_observation">
          <div className="agent-turn-header">
            <div className="agent-turn-icon">T</div>
            <span className="agent-turn-role">Tool Result</span>
            <span className="agent-turn-timestamp">{formatTimestamp(agentTurn.timestamp)}</span>
          </div>
          <div className="agent-observation-header">
            <span className="agent-observation-label">📊 Observation from</span>
            <span className="agent-observation-tool">{toolName}</span>
          </div>
          
          {diffData ? (
            // Render diff viewer for generate_code_edit observations
            <div className="agent-diff-section">
              <DiffViewer
                diffString={diffData.diffString}
                filePath={diffData.filePath}
                onApprove={showDiffActions ? handleApproveDiff : undefined}
                onReject={showDiffActions ? handleRejectDiff : undefined}
                isLoading={isLoading}
                showActions={!!showDiffActions}
              />
            </div>
          ) : (
            // Render normal observation content
            <div className={`agent-observation-content ${isError ? 'error' : ''}`}>
              {agentTurn.content}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="agent-interaction-container">
      <div className="agent-header">
        <h2>🤖 AI Coding Assistant</h2>
        <p>Ask questions about your code and watch the agent think through the problem</p>
      </div>

      <div className="agent-input-section">
        <form onSubmit={handleSubmit} className="agent-input-form">
          <div className="agent-input-row">
            <div className="agent-input-group">
              <label htmlFor="agent-project-id">Project ID</label>
              <input
                id="agent-project-id"
                type="text"
                value={projectId}
                onChange={(e) => setProjectId((e.target as HTMLInputElement).value)}
                placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                className="agent-input"
                required
              />
            </div>
          </div>
          
          <div className="agent-input-group">
            <label htmlFor="agent-query">Your Question</label>
            <textarea
              id="agent-query"
              value={userQuery}
              onChange={(e) => setUserQuery((e.target as HTMLTextAreaElement).value)}
              placeholder="e.g., How does user authentication work in this codebase? Find functions related to login validation."
              className="agent-textarea"
              rows={3}
              required
            />
            {activeFilePath && (
              <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                💡 Active file ({activeFilePath}) will be included as context
              </small>
            )}
          </div>

          <div className="agent-input-row">
            <button
              type="submit"
              className="agent-submit-btn"
              disabled={isLoading || !userQuery.trim() || !projectId.trim()}
            >
              {isLoading ? 'Processing...' : 'Ask Agent'}
            </button>
            <button
              type="button"
              className="agent-clear-btn"
              onClick={handleClearConversation}
              disabled={isLoading}
            >
              Clear Chat
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="agent-error">
          <div className="agent-error-title">Error</div>
          <div className="agent-error-message">{error}</div>
        </div>
      )}

      <div className="agent-conversation" ref={conversationRef}>
        {conversationTurns.length === 0 && !isLoading ? (
          <div className="agent-empty-state">
            <h3>Start a conversation</h3>
            <p>Ask the agent about your code and watch it think through the problem step by step.</p>
          </div>
        ) : (
          conversationTurns.map((turn, index) => renderConversationTurn(turn, index))
        )}

        {isLoading && (
          <div className="agent-loading">
            <div className="agent-loading-spinner"></div>
            <span className="agent-loading-text">{loadingMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
} 