
export interface Transcription {
  text: string;
  sender: 'user' | 'assistant';
  timestamp: number;
}

export interface SystemStatus {
  volume: number;
  brightness: number;
  theme: 'light' | 'dark';
  isConnected: boolean;
  isListening: boolean;
}

export interface VoiceMessage {
  type: 'transcription' | 'audio';
  content: string;
  sender: 'user' | 'assistant';
}
