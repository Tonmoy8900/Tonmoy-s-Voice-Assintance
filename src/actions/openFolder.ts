
import { exec } from 'child_process';
import path from 'path';

export function openFolder(folderName: string) {
  // Use path.resolve() to get the absolute path, which internally uses the current working directory.
  // This avoids direct access to process.cwd() which was causing a TypeScript error.
  const folderPath = path.resolve(folderName);

  exec(`start "" "${folderPath}"`, (err) => {
    if (err) console.error(err);
  });
}
