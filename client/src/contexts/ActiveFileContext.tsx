/**
 * Active File Context Provider
 * Implements P2-E1-S3: Client-side implicit context tracking
 * Tracks the last file path the user interacted with for implicit context
 */

import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface ActiveFileContextValue {
  activeFilePath: string | null;
  setActiveFilePath: (path: string | null) => void;
  lastInteractionTime: number | null;
}

const ActiveFileContext = createContext<ActiveFileContextValue | undefined>(undefined);

export interface ActiveFileProviderProps {
  children: ComponentChildren;
}

export function ActiveFileProvider({ children }: ActiveFileProviderProps) {
  const [activeFilePath, setActiveFilePathState] = useState<string | null>(null);
  const [lastInteractionTime, setLastInteractionTime] = useState<number | null>(null);

  const setActiveFilePath = (path: string | null) => {
    setActiveFilePathState(path);
    setLastInteractionTime(path ? Date.now() : null);
    
    // Log for debugging/development
    if (path) {
      console.log(`[ImplicitContext] Active file set to: ${path}`);
    } else {
      console.log(`[ImplicitContext] Active file cleared`);
    }
  };

  const value: ActiveFileContextValue = {
    activeFilePath,
    setActiveFilePath,
    lastInteractionTime
  };

  return (
    <ActiveFileContext.Provider value={value}>
      {children}
    </ActiveFileContext.Provider>
  );
}

export function useActiveFile(): ActiveFileContextValue {
  const context = useContext(ActiveFileContext);
  if (context === undefined) {
    throw new Error('useActiveFile must be used within an ActiveFileProvider');
  }
  return context;
}

/**
 * Get implicit context data for API requests
 */
export function getImplicitContext(activeFilePath: string | null): { last_focused_file_path?: string } {
  if (!activeFilePath) {
    return {};
  }

  return {
    last_focused_file_path: activeFilePath
  };
} 