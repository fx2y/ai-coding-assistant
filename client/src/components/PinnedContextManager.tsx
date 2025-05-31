/**
 * Pinned Context Manager Component
 * Implements P2-E1-S2: UI for pinned context management
 */

import { useState, useEffect } from 'preact/hooks';
import type { PinnedContextItem, CreatePinnedItemRequest } from '../services/pinnedContextService.js';
import { addPinnedItem, listPinnedItems, removePinnedItem } from '../services/pinnedContextService.js';
import './PinnedContextManager.css';

interface PinnedContextManagerProps {
  projectId: string;
}

interface FormState {
  type: 'file_path' | 'text_snippet';
  content: string;
  description: string;
}

export function PinnedContextManager({ projectId }: PinnedContextManagerProps) {
  const [pinnedItems, setPinnedItems] = useState<PinnedContextItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [formState, setFormState] = useState<FormState>({
    type: 'text_snippet',
    content: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load pinned items on component mount and when projectId changes
  useEffect(() => {
    if (projectId) {
      loadPinnedItems();
    }
  }, [projectId]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const loadPinnedItems = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await listPinnedItems(projectId);
      
      if (response.success && response.data) {
        setPinnedItems(response.data.items);
      } else {
        setError(response.error?.message || 'Failed to load pinned items');
      }
    } catch (err) {
      setError('Failed to load pinned items');
      console.error('Load pinned items error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    if (!formState.content.trim()) {
      setError('Content is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const request: CreatePinnedItemRequest = {
        type: formState.type,
        content: formState.content.trim(),
        ...(formState.description.trim() && { description: formState.description.trim() })
      };

      const response = await addPinnedItem(projectId, request);
      
      if (response.success && response.data) {
        // Add the new item to the list
        setPinnedItems(prev => [response.data!, ...prev]);
        
        // Reset form
        setFormState({
          type: 'text_snippet',
          content: '',
          description: ''
        });
        
        setSuccess('Pinned item added successfully');
      } else {
        setError(response.error?.message || 'Failed to add pinned item');
      }
    } catch (err) {
      setError('Failed to add pinned item');
      console.error('Add pinned item error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (!confirm('Are you sure you want to remove this pinned item?')) {
      return;
    }

    try {
      const response = await removePinnedItem(projectId, itemId);
      
      if (response.success) {
        // Remove the item from the list
        setPinnedItems(prev => prev.filter(item => item.id !== itemId));
        setSuccess('Pinned item removed successfully');
      } else {
        setError(response.error?.message || 'Failed to remove pinned item');
      }
    } catch (err) {
      setError('Failed to remove pinned item');
      console.error('Remove pinned item error:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="pinned-context-manager">
      <div className="pinned-context-header">
        <h2>Pinned Context</h2>
        <p className="pinned-context-description">
          Pin important files or text snippets to keep them easily accessible for your project.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="message message-error">
          <span className="message-icon">⚠️</span>
          {error}
        </div>
      )}
      
      {success && (
        <div className="message message-success">
          <span className="message-icon">✅</span>
          {success}
        </div>
      )}

      {/* Add New Item Form */}
      <div className="add-item-section">
        <h3>Add New Pinned Item</h3>
        <form onSubmit={handleSubmit} className="add-item-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="type">Type:</label>
              <select
                id="type"
                value={formState.type}
                onChange={(e) => setFormState(prev => ({ 
                  ...prev, 
                  type: (e.target as HTMLSelectElement).value as 'file_path' | 'text_snippet'
                }))}
                disabled={isSubmitting}
              >
                <option value="text_snippet">Text Snippet</option>
                <option value="file_path">File Path</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="content">
              {formState.type === 'file_path' ? 'File Path:' : 'Text Content:'}
            </label>
            {formState.type === 'file_path' ? (
              <input
                type="text"
                id="content"
                value={formState.content}
                onChange={(e) => setFormState(prev => ({ 
                  ...prev, 
                  content: (e.target as HTMLInputElement).value 
                }))}
                placeholder="e.g., src/components/auth.tsx"
                disabled={isSubmitting}
                required
              />
            ) : (
              <textarea
                id="content"
                value={formState.content}
                onChange={(e) => setFormState(prev => ({ 
                  ...prev, 
                  content: (e.target as HTMLTextAreaElement).value 
                }))}
                placeholder="Enter important text, notes, or code snippets..."
                rows={4}
                disabled={isSubmitting}
                required
              />
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">Description (optional):</label>
            <input
              type="text"
              id="description"
              value={formState.description}
              onChange={(e) => setFormState(prev => ({ 
                ...prev, 
                description: (e.target as HTMLInputElement).value 
              }))}
              placeholder="Brief description or label for this item"
              disabled={isSubmitting}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isSubmitting || !formState.content.trim()}
          >
            {isSubmitting ? 'Adding...' : 'Pin Item'}
          </button>
        </form>
      </div>

      {/* Pinned Items List */}
      <div className="pinned-items-section">
        <h3>Pinned Items ({pinnedItems.length})</h3>
        
        {loading ? (
          <div className="loading-state">
            <span className="loading-spinner">⏳</span>
            Loading pinned items...
          </div>
        ) : pinnedItems.length === 0 ? (
          <div className="empty-state">
            <p>No pinned items yet. Add your first pinned item above to get started.</p>
          </div>
        ) : (
          <div className="pinned-items-list">
            {pinnedItems.map((item) => (
              <div key={item.id} className="pinned-item">
                <div className="pinned-item-header">
                  <span className={`item-type-badge ${item.type}`}>
                    {item.type === 'file_path' ? '📁' : '📝'} 
                    {item.type === 'file_path' ? 'File' : 'Snippet'}
                  </span>
                  <span className="item-date">{formatDate(item.createdAt)}</span>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="btn btn-danger btn-small"
                    title="Remove pinned item"
                  >
                    ✕
                  </button>
                </div>
                
                {item.description && (
                  <div className="item-description">
                    <strong>{item.description}</strong>
                  </div>
                )}
                
                <div className="item-content">
                  <code>{truncateContent(item.content)}</code>
                  {item.content.length > 100 && (
                    <button 
                      className="btn btn-link btn-small"
                      onClick={() => {
                        // Toggle full content display
                        const element = document.getElementById(`content-${item.id}`);
                        if (element) {
                          element.style.display = element.style.display === 'none' ? 'block' : 'none';
                        }
                      }}
                    >
                      Show full content
                    </button>
                  )}
                  <div id={`content-${item.id}`} style={{ display: 'none' }} className="full-content">
                    <code>{item.content}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 