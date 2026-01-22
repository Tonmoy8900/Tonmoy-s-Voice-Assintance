
/**
 * Transcription interface for tracking communication history.
 */
export interface Transcription {
  text: string;
  sender: 'user' | 'assistant';
  timestamp: number;
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
