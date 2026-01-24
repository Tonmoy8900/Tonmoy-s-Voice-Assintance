import { exec } from 'child_process';
import path from 'path';

export function openFolder(folderName: string) {
  const folderPath = path.join(process.cwd(), folderName);

  exec(`start "" "${folderPath}"`, (err) => {
    if (err) console.error(err);
  });
}
