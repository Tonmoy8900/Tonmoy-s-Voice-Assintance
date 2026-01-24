import { exec } from 'child_process';
import path from 'path';

export function openFolder(folderPath: string) {
  try {
    const resolvedPath = path.resolve(folderPath);
    exec(`explorer "${resolvedPath}"`);
    console.log(`📂 Opened folder: ${resolvedPath}`);
  } catch (err) {
    console.error('❌ Failed to open folder:', err);
  }
}
