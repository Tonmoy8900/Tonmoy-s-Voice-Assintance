import {
  matchesAny,
  extractNumber,
  extractAppName,
  extractContact,
  extractMessage,
  removeWakeWord
} from './nlpHelpers';

/* =========================
   INTENT TYPES
========================= */
export type Intent =
  | { type: 'OPEN_APP'; app: string }
  | { type: 'VOLUME'; value: number }
  | { type: 'SEND_MESSAGE'; to: string; text: string }
  | { type: 'CHAT'; text: string }
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
  if (!matchesAny(text, ['bumba', 'hey bumba', 'ok bumba'])) {
    return { type: 'CHAT', text: rawText };
  }

  const clean = removeWakeWord(text);

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
  // AI FALLBACK (SMART PART)
  // -------------------------
  return {
    type: 'AI_FALLBACK',
    raw: clean
  };
}
