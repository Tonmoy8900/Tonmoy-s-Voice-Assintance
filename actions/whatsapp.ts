
import { chromium, BrowserContext, Page } from 'playwright';

// Fix: Change type from Browser to BrowserContext because launchPersistentContext returns a context
let browser: BrowserContext | null = null;
let page: Page | null = null;
let lastUnreadCount: number = 0;

/**
 * Message info passed to watcher
 */
export interface WhatsAppMessageInfo {
  from?: string;
  unreadCount: number;
  timestamp: number;
}

/**
 * Start WhatsApp Web (persistent login)
 */
export async function startWhatsApp(): Promise<void> {
  if (browser) return;

  // Fix: changed browser type from Browser to BrowserContext because launchPersistentContext returns a context
  browser = await chromium.launchPersistentContext('./whatsapp-session', {
    headless: false,
  });

  page = await browser.newPage();
  await page.goto('https://web.whatsapp.com');

  console.log('🟢 WhatsApp Web opened. Please scan QR if needed.');
}

/**
 * Send WhatsApp message
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<void> {
  if (!page) await startWhatsApp();

  const searchBox = 'div[contenteditable="true"][data-tab="3"]';
  await page!.waitForSelector(searchBox, { timeout: 60000 });

  await page!.click(searchBox);
  await page!.keyboard.type(to);
  await page!.keyboard.press('Enter');

  const messageBox = 'div[contenteditable="true"][data-tab="10"]';
  await page!.waitForSelector(messageBox);

  await page!.click(messageBox);
  await page!.keyboard.type(message);
  await page!.keyboard.press('Enter');

  console.log(`📨 Message sent to ${to}`);
}

/**
 * Get unread messages count
 */
export async function checkNewMessages(): Promise<number> {
  if (!page) await startWhatsApp();

  const unreadBadges = await page!.$$(
    'span[aria-label*="unread"]'
  );

  return unreadBadges.length;
}

/**
 * Try to detect sender name of latest unread message
 */
async function getLatestSender(): Promise<string | undefined> {
  try {
    const chat = await page!.$(
      'div[aria-label*="unread message"] span[dir="auto"]'
    );

    if (!chat) return undefined;

    return await chat.innerText();
  } catch {
    return undefined;
  }
}

/**
 * Watch WhatsApp for new messages (background)
 */
export async function watchWhatsApp(
  onNewMessage: (info: WhatsAppMessageInfo) => void
): Promise<void> {

  setInterval(async () => {
    try {
      const unread = await checkNewMessages();

      if (unread > lastUnreadCount) {
        lastUnreadCount = unread;

        const from = await getLatestSender();

        onNewMessage({
          from,
          unreadCount: unread,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('⚠️ WhatsApp watcher error:', error);
    }
  }, 15000); // check every 15 seconds
}
