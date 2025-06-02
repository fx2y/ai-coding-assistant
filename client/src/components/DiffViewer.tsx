/**
 * DiffViewer Component
 * Implements P3-E1-S2: Client-side diff display for code changes
 * Implements RFC-AGT-003: Semantic Diff Generation & Application
 */

import { useMemo } from 'preact/hooks';
import { diff_match_patch } from 'diff-match-patch';
import './DiffViewer.css';

interface DiffViewerProps {
  diffString: string;
  filePath: string;
  originalContent?: string;
  onApprove?: () => void;
  onReject?: () => void;
  isLoading?: boolean;
  showActions?: boolean;
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header';
  content: string;
  lineNumber?: number;
  originalLineNumber?: number;
}

export function DiffViewer({
  diffString,
  filePath,
  originalContent,
  onApprove,
  onReject,
  isLoading = false,
  showActions = true
}: DiffViewerProps) {
  const parsedDiff = useMemo(() => {
    return parseUnifiedDiff(diffString);
  }, [diffString]);

  const previewContent = useMemo(() => {
    if (!originalContent) return null;
    
    try {
      const dmp = new diff_match_patch();
      const patches = dmp.patch_fromText(diffString);
      const [patchedText, results] = dmp.patch_apply(patches, originalContent);
      
      // Check if all patches applied successfully
      const allApplied = results.every(result => result === true);
      
      return {
        content: patchedText,
        success: allApplied
      };
    } catch (error) {
      console.error('Error applying diff for preview:', error);
      return {
        content: originalContent,
        success: false
      };
    }
  }, [diffString, originalContent]);

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-header">
        <div className="diff-file-info">
          <span className="diff-file-icon">📄</span>
          <span className="diff-file-path">{filePath}</span>
        </div>
        {previewContent && !previewContent.success && (
          <div className="diff-warning">
            ⚠️ Diff may not apply cleanly
          </div>
        )}
      </div>

      <div className="diff-content">
        <div className="diff-lines">
          {parsedDiff.map((line, index) => (
            <div
              key={index}
              className={`diff-line diff-line-${line.type}`}
            >
              <div className="diff-line-numbers">
                {line.type !== 'header' && (
                  <>
                    <span className="diff-line-number original">
                      {line.originalLineNumber || ''}
                    </span>
                    <span className="diff-line-number new">
                      {line.lineNumber || ''}
                    </span>
                  </>
                )}
              </div>
              <div className="diff-line-content">
                <span className="diff-line-prefix">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className="diff-line-text">{line.content}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showActions && (onApprove || onReject) && (
        <div className="diff-actions">
          <div className="diff-actions-info">
            <span className="diff-actions-label">Review the changes above</span>
            <span className="diff-actions-description">
              Approving will apply these changes to the file in your project
            </span>
          </div>
          <div className="diff-actions-buttons">
            {onReject && (
              <button
                className="diff-action-btn diff-reject-btn"
                onClick={onReject}
                disabled={isLoading}
              >
                Reject Changes
              </button>
            )}
            {onApprove && (
              <button
                className="diff-action-btn diff-approve-btn"
                onClick={onApprove}
                disabled={isLoading}
              >
                {isLoading ? 'Applying...' : 'Approve & Apply'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Parse a unified diff string into structured diff lines
 */
function parseUnifiedDiff(diffString: string): DiffLine[] {
  const lines = diffString.split('\n');
  const diffLines: DiffLine[] = [];
  let originalLineNumber = 0;
  let newLineNumber = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Hunk header - extract line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        originalLineNumber = parseInt(match[1], 10);
        newLineNumber = parseInt(match[2], 10);
      }
      
      diffLines.push({
        type: 'header',
        content: line,
      });
    } else if (line.startsWith('+')) {
      // Added line
      diffLines.push({
        type: 'added',
        content: line.substring(1),
        lineNumber: newLineNumber++,
      });
    } else if (line.startsWith('-')) {
      // Removed line
      diffLines.push({
        type: 'removed',
        content: line.substring(1),
        originalLineNumber: originalLineNumber++,
      });
    } else if (line.startsWith(' ') || line === '') {
      // Context line
      diffLines.push({
        type: 'context',
        content: line.substring(1),
        originalLineNumber: originalLineNumber++,
        lineNumber: newLineNumber++,
      });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      // File headers
      diffLines.push({
        type: 'header',
        content: line,
      });
    }
  }

  return diffLines;
} 