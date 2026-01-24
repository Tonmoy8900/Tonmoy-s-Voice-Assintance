import { exec } from 'child_process';

/* =========================
   APP REGISTRY
   (SAFE + CONTROLLED)
========================= */
const APP_COMMANDS: Record<string, string> = {
  chrome: 'start chrome',
  whatsapp: 'start whatsapp:',
  notepad: 'notepad',
  calculator: 'calc'
};

/* =========================
   OPEN APP ACTION
========================= */
export async function openApp(app: string) {
  const key = app.toLowerCase();
  const command = APP_COMMANDS[key];

  if (!command) {
    console.log(`❌ App not supported: ${app}`);
    return;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`❌ Failed to open ${app}:`, error.message);
    } else {
      console.log(`🚀 Opened ${app}`);
    }
  });
}
