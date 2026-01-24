import fs from 'fs';
import path from 'path';

export function createFolder(folderName: string, basePath = '.') {
  try {
    const fullPath = path.join(basePath, folderName);
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`📁 Folder created: ${fullPath}`);
  } catch (err) {
    console.error('❌ Folder creation failed:', err);
  }
}
