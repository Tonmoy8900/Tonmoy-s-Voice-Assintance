
/* =========================
   BASIC MATCHING
========================= */
export function matchesAny(text: string, words: string[]) {
  return words.some(w => text.includes(w.toLowerCase()));
}

/* =========================
   WAKE WORD HANDLING
========================= */
const WAKE_WORDS = ['assistance', 'bumba', 'hey bumba', 'ok bumba'];

export function removeWakeWord(text: string) {
  let clean = text.toLowerCase();
  for (const word of WAKE_WORDS) {
    clean = clean.replace(word, '');
  }
  return clean.trim();
}

/* =========================
   EXTRACTION HELPERS
========================= */
export function extractNumber(text: string, fallback = 50) {
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : fallback;
}

export function extractFileName(text: string) {
  // Matches "file named example.txt" or "create example.txt"
  const m = text.match(/named\s+([a-zA-Z0-9._-]+)/i) || 
            text.match(/file\s+([a-zA-Z0-9._-]+)/i) ||
            text.match(/create\s+([a-zA-Z0-9._-]+)/i);
  return m ? m[1] : 'new_file.txt';
}

export function extractFileContent(text: string) {
  // Matches "content hello world" or "saying hello world"
  const m = text.match(/content\s+(.*)/i) || 
            text.match(/saying\s+(.*)/i) ||
            text.match(/with\s+text\s+(.*)/i);
  return m ? m[1].trim() : 'Created by Myra Assistant';
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
  const lowerText = text.toLowerCase();
  for (const app in APP_ALIASES) {
    if (APP_ALIASES[app].some(alias => lowerText.includes(alias))) {
      return app;
    }
  }
  return null;
}

/* =========================
   CONTACT EXTRACTION
========================= */
export function extractContact(text: string) {
  const m =
    text.match(/to\s+([a-z]+)/i) ||
    text.match(/whatsapp\s+([a-z]+)/i);

  return m ? m[1] : null;
}

/* =========================
   MESSAGE EXTRACTION
========================= */
export function extractMessage(text: string) {
  const m =
    text.match(/message\s+to\s+[a-z]+\s+(.*)/i) ||
    text.match(/message\s+(.*)/i) ||
    text.match(/text\s+(.*)/i);

  return m ? m[1].trim() : null;
}
