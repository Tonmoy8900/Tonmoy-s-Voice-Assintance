import { Intent } from './brain/detectIntent';
import { openApp } from './actions/openApp';
import { setVolume } from './actions/volume';
import { sendMessage } from './actions/sendMessage';

/* =========================
   CENTRAL INTENT DISPATCHER
========================= */
export async function dispatch(intent: Intent) {
  try {
    switch (intent.type) {
      case 'OPEN_APP':
        // Example: open chrome, open whatsapp
        await openApp(intent.app);
        break;

      case 'VOLUME':
        // Example: set volume to 40
        await setVolume(intent.value);
        break;

      case 'SEND_MESSAGE':
        // Example: send message to gopi hello
        await sendMessage(intent.to, intent.text);
        break;

      case 'CHAT':
      default:
        // Normal conversation / AI reply
        console.log('💬 ZAVIS:', intent.text);
        break;
    }
  } catch (error) {
    console.error('❌ Dispatcher error:', error);
  }
}
