
/**
 * Transcription interface for tracking communication history.
 */
export interface Transcription {
  text: string;
  sender: 'user' | 'assistant';
  timestamp: number;
}

/**
 * Task interface for the task management system.
 */
export interface Task {
  id: string;
  title: string;
  completed: boolean;
  timestamp: number;
  reminderAt?: number; // Timestamp for reminder
}

/**
 * SystemStatus interface for device and application state management.
 */
export interface SystemStatus {
  volume: number;
  brightness: number;
  theme: 'dark' | 'light';
  isConnected: boolean;
  isListening: boolean;
  isSharingScreen: boolean;
}

/**
 * SearchResult interface for grounding chunks.
 */
export interface SearchResult {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri: string;
    title: string;
  };
}
