
import fs from 'fs';
import path from 'path';

export function createFolder(folderName: string) {
  // Use path.resolve() to get the absolute path, which internally uses the current working directory.
  // This avoids direct access to process.cwd() which was causing a TypeScript error.
  const folderPath = path.resolve(folderName);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
    console.log(`📁 Folder created: ${folderName}`);
  } else {
    console.log('⚠️ Folder already exists');
  }
}
