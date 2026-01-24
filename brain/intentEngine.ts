
import {
  matchesAny,
  extractNumber,
  extractAppName,
  extractContact,
  extractMessage,
  removeWakeWord,
  extractFileName,
  extractFileContent
} from './localBrain';

/* =========================
   INTENT TYPES
========================= */
export type Intent =
  | { type: 'OPEN_APP'; app: string }
  | { type: 'VOLUME'; value: number }
  | { type: 'SEND_MESSAGE'; to: string; text: string }
  | { type: 'CREATE_FILE'; name: string; content: string }
  | { type: 'CHAT'; text: string }
  | { type: 'WAKE_UP'; raw: string }
  | { type: 'AI_FALLBACK'; raw: string };

/* =========================
   MAIN INTENT DETECTOR
========================= */
export function detectIntent(rawText: string): Intent {
  if (!rawText) return { type: 'CHAT', text: '' };

  const text = rawText.toLowerCase().trim();

  // -------------------------
  // WAKE WORD CHECK
  // -------------------------
  const wakeWords = ['assistance', 'bumba', 'hey bumba', 'ok bumba'];
  if (!matchesAny(text, wakeWords)) {
    return { type: 'CHAT', text: rawText };
  }

  const clean = removeWakeWord(text);
  
  // If only the wake word was said
  if (!clean || clean.length < 2) {
    return { type: 'WAKE_UP', raw: rawText };
  }

  // -------------------------
  // CREATE FILE
  // -------------------------
  if (matchesAny(clean, ['create file', 'new file', 'text file', 'document'])) {
    return {
      type: 'CREATE_FILE',
      name: extractFileName(clean),
      content: extractFileContent(clean)
    };
  }

  // -------------------------
  // OPEN APP
  // -------------------------
  if (matchesAny(clean, ['open', 'launch', 'start'])) {
    const app = extractAppName(clean);
    if (app) {
      return { type: 'OPEN_APP', app };
    }
  }

  // -------------------------
  // VOLUME CONTROL
  // -------------------------
  if (matchesAny(clean, ['volume', 'sound', 'voice'])) {
    return {
      type: 'VOLUME',
      value: extractNumber(clean, 50)
    };
  }

  // -------------------------
  // SEND MESSAGE
  // -------------------------
  if (matchesAny(clean, ['send', 'message', 'text', 'whatsapp'])) {
    const to = extractContact(clean);
    const msg = extractMessage(clean);
    if (to && msg) {
      return {
        type: 'SEND_MESSAGE',
        to,
        text: msg
      };
    }
  }

  // -------------------------
  // AI FALLBACK
  // -------------------------
  return {
    type: 'AI_FALLBACK',
    raw: clean
  };
}
