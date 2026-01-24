import fs from 'fs';
import path from 'path';

export function createFolder(folderName: string) {
  const folderPath = path.join(process.cwd(), folderName);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
    console.log(`📁 Folder created: ${folderName}`);
  } else {
    console.log('⚠️ Folder already exists');
  }
}
