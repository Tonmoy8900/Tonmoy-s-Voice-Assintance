/* =========================
   BASIC MATCHING
========================= */
export function matchesAny(text: string, words: string[]) {
  return words.some(w => text.includes(w));
}

/* =========================
   WAKE WORD HANDLING
========================= */
const WAKE_WORDS = ['bumba', 'hey bumba', 'ok bumba'];

export function removeWakeWord(text: string) {
  let clean = text;
  for (const word of WAKE_WORDS) {
    clean = clean.replace(word, '');
  }
  return clean.trim();
}

/* =========================
   NUMBER EXTRACTION
========================= */
export function extractNumber(text: string, fallback = 50) {
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : fallback;
}

/* =========================
   APP NAME EXTRACTION
========================= */
const APP_ALIASES: Record<string, string[]> = {
  chrome: ['chrome', 'browser', 'google'],
  whatsapp: ['whatsapp', 'whats app', 'chat'],
  notepad: ['notepad', 'editor', 'note'],
  calculator: ['calculator', 'calc']
};

export function extractAppName(text: string) {
  for (const app in APP_ALIASES) {
    if (APP_ALIASES[app].some(alias => text.includes(alias))) {
      return app;
    }
  }
  return null;
}

/* =========================
   CONTACT EXTRACTION
========================= */
export function extractContact(text: string) {
  // Examples:
  // send message to gopi
  // whatsapp rahul hello
  const m =
    text.match(/to\s+([a-z]+)/i) ||
    text.match(/whatsapp\s+([a-z]+)/i);

  return m ? m[1] : null;
}

/* =========================
   MESSAGE EXTRACTION
========================= */
export function extractMessage(text: string) {
  // Examples:
  // send message to gopi hello
  // text rahul I am coming
  const m =
    text.match(/message\s+to\s+[a-z]+\s+(.*)/i) ||
    text.match(/message\s+(.*)/i) ||
    text.match(/text\s+(.*)/i);

  return m ? m[1].trim() : null;
}

