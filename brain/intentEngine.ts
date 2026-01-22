import {
  matchesAny,
  extractNumber,
  extractAppName,
  extractContact,
  extractMessage,
  removeWakeWord
} from './nlpHelpers';

export type Intent =
  | { type: 'OPEN_APP'; app: string }
  | { type: 'VOLUME'; value: number }
  | { type: 'SEND_MESSAGE'; to: string; text: string }
  | { type: 'CHAT'; text: string };

export function detectIntent(rawText: string): Intent {
  if (!rawText) return { type: 'CHAT', text: '' };

  const text = rawText.toLowerCase().trim();

  // Wake word (brain attention)
  if (!matchesAny(text, ['bumba', 'hey bumba', 'ok bumba'])) {
    return { type: 'CHAT', text: rawText };
  }

  const clean = removeWakeWord(text);

  // OPEN APP
  if (matchesAny(clean, ['open', 'launch', 'start'])) {
    const app = extractAppName(clean);
    if (app) return { type: 'OPEN_APP', app };
  }

  // VOLUME
  if (matchesAny(clean, ['volume', 'sound', 'voice'])) {
    return { type: 'VOLUME', value: extractNumber(clean, 50) };
  }

  // SEND MESSAGE
  if (matchesAny(clean, ['send', 'message', 'text'])) {
    const to = extractContact(clean);
    const msg = extractMessage(clean);
    if (to && msg) {
      return { type: 'SEND_MESSAGE', to, text: msg };
    }
  }

  return { type: 'CHAT', text: rawText };
}
