import { Intent } from './brain/detectIntent';
import { openApp } from './actions/openApp';
import { setVolume } from './actions/volume';
import { sendMessage } from './actions/sendMessage';

export function dispatch(intent: Intent) {
  switch (intent.type) {
    case 'OPEN_APP':
      openApp(intent.app);
      break;

    case 'VOLUME':
      setVolume(intent.value);
      break;

    case 'SEND_MESSAGE':
      sendMessage(intent.to, intent.text);
      break;

    default:
      console.log('💬 Chat:', intent.text);
  }
}
