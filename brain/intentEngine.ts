export type Intent =
  | { type: 'OPEN_APP'; app: string }
  | { type: 'VOLUME'; value: number }
  | { type: 'SEND_MESSAGE'; to: string; text: string }
  | { type: 'CHAT'; text: string };

export function detectIntent(rawText: string): Intent {
  if (!rawText) return { type: 'CHAT', text: '' };

  const text = rawText.toLowerCase().trim();

  // 1️⃣ Wake word check (human-style)
  const wakeWords = ['bumba', 'hey bumba', 'ok bumba'];
  const isAwake = wakeWords.some(w => text.includes(w));

  if (!isAwake) {
    return { type: 'CHAT', text: rawText };
  }

  // Remove wake words
  const cleanedText = wakeWords.reduce(
    (t, w) => t.replace(w, ''),
    text
  ).trim();

  // 2️⃣ OPEN APP INTENT
  if (matchesAny(cleanedText, ['open', 'launch', 'start'])) {
    const app = extractAppName(cleanedText);
    if (app) {
      return { type: 'OPEN_APP', app };
    }
  }

  // 3️⃣ VOLUME INTENT
  if (matchesAny(cleanedText, ['volume', 'sound', 'voice'])) {
    const value = extractNumber(cleanedText, 50);
    return { type: 'VOLUME', value };
  }

  // 4️⃣ SEND MESSAGE INTENT
  if (matchesAny(cleanedText, ['send message', 'send msg', 'text'])) {
    const to = extractContact(cleanedText);
    const message = extractMessage(cleanedText);

    if (to && message) {
      return {
        type: 'SEND_MESSAGE',
        to,
        text: message
      };
    }
  }

  // 5️⃣ Fallback → Chat
  return { type: 'CHAT', text: rawText };
}
