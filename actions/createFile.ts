
import fs from 'fs';
import path from 'path';

/**
 * Creates a file with the specified name and content.
 */
export function createFile(fileName: string, content: string) {
  try {
    // Resolve to current working directory
    const filePath = path.resolve(fileName);
    
    // Create directory if it doesn't exist (though resolve usually points to root)
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`📄 File successfully created at: ${filePath}`);
    return { success: true, path: filePath };
  } catch (err) {
    console.error('❌ Error creating file:', err);
    return { success: false, error: err };
  }
}
