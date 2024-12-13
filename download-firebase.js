import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIREBASE_VERSION = '10.7.1';
const OUTPUT_DIR = path.join(__dirname, 'lib');
const BUNDLE_FILE = path.join(OUTPUT_DIR, 'firebase-bundle.js');

// Ensure lib directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

// Download the Firebase bundles we need in correct order
const files = [
  'firebase-app-compat',
  'firebase-auth-compat'
];

async function downloadFile(filename) {
  const url = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/${filename}.js`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve(data);
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    let bundleContent = '';
    
    // Download and concatenate files in order
    for (const file of files) {
      console.log(`Downloading ${file}...`);
      const content = await downloadFile(file);
      bundleContent += content + '\n';
    }

    // Write the combined bundle
    fs.writeFileSync(BUNDLE_FILE, bundleContent);
    console.log(`Firebase bundle created successfully at ${BUNDLE_FILE}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 