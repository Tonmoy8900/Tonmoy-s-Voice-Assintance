export function matchesAny(text: string, words: string[]) {
  return words.some(w => text.includes(w));
}

export function removeWakeWord(text: string) {
  return text
    .replace('hey bumba', '')
    .replace('ok bumba', '')
    .replace('bumba', '')
    .trim();
}

export function extractNumber(text: string, fallback = 50) {
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : fallback;
}

export function extractAppName(text: string) {
  const apps = ['whatsapp', 'chrome', 'notepad', 'calculator'];
  return apps.find(a => text.includes(a)) || null;
}

export function extractContact(text: string) {
  const m = text.match(/to\s+([a-z]+)/i);
  return m ? m[1] : null;
}

export function extractMessage(text: string) {
  const m =
    text.match(/message\s+(.*)/i) ||
    text.match(/text\s+(.*)/i);
  return m ? m[1].trim() : null;
}
