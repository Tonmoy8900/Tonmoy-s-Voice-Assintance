
import { Intent } from './brain/intentEngine';
import { openApp } from './actions/openApp';
import { createFile } from './actions/createFile';

/* =========================
   CENTRAL INTENT DISPATCHER
========================= */
export async function dispatch(intent: Intent) {
  try {
    switch (intent.type) {
      case 'CREATE_FILE':
        console.log(`📄 Creating file: ${intent.name}`);
        const result = await createFile(intent.name, intent.content);
        return result;

      case 'OPEN_APP':
        await openApp(intent.app);
        break;

      case 'VOLUME':
        console.log('Setting volume to:', intent.value);
        break;

      case 'SEND_MESSAGE':
        console.log(`Sending message to ${intent.to}: ${intent.text}`);
        break;

      case 'CHAT':
      default:
        console.log('💬 ZAVIS:', intent.type === 'AI_FALLBACK' ? intent.raw : (intent as any).text);
        break;
    }
  } catch (error) {
    console.error('❌ Dispatcher error:', error);
  }
}
