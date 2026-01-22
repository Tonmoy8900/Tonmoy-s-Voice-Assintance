export function matchesAny(text: string, keywords: string[]) {
  return keywords.some(k => text.includes(k));
}

export function extractNumber(text: string, fallback = 50): number {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

export function extractAppName(text: string): string | null {
  const apps = ['whatsapp', 'chrome', 'notepad', 'calculator', 'edge'];

  for (const app of apps) {
    if (text.includes(app)) return app;
  }
  return null;
}

export function extractContact(text: string): string | null {
  // Examples:
  // "send message to ram"
  // "text ram hello"

  const match = text.match(/to\s+([a-z]+)/i);
  return match ? match[1] : null;
}

export function extractMessage(text: string): string | null {
  // Everything after "message" or "text"
  const match = text.match(/message\s+(.*)/i) || text.match(/text\s+(.*)/i);
  return match ? match[1].trim() : null;
}
