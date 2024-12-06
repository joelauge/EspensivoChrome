const { exec } = require('child_process');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const fs = require('fs');

// Create a WebSocket server to receive browser console logs
const wss = new WebSocket.Server({ port: 8080 });

// Store for collected errors
let errors = [];

// WebSocket connection to receive browser logs
wss.on('connection', (ws) => {
  console.log('Browser connected');
  
  ws.on('message', (data) => {
    const log = JSON.parse(data);
    if (log.type === 'error') {
      errors.push(log);
      checkErrorsAndFix();
    }
  });
});

// Function to send errors to Claude and get fixes
async function checkErrorsAndFix() {
  if (errors.length === 0) return;

  // Prepare error context
  const errorContext = errors.map(e => ({
    message: e.message,
    stack: e.stack,
    timestamp: e.timestamp,
    file: e.file
  }));

  // Save current state of files
  const fileStates = {};
  const relevantFiles = ['background.js', 'popup.js', 'manifest.json'];
  relevantFiles.forEach(file => {
    fileStates[file] = fs.readFileSync(file, 'utf8');
  });

  try {
    // Send to Claude API (hypothetical implementation)
    const fixes = await sendToClaudeAPI({
      errors: errorContext,
      fileStates: fileStates
    });

    // Apply fixes
    fixes.forEach(fix => {
      fs.writeFileSync(fix.file, fix.content);
    });

    // Rebuild extension
    exec('npm run build', (error, stdout, stderr) => {
      if (error) {
        console.error(`Build error: ${error}`);
        return;
      }
      console.log('Extension rebuilt with fixes');
      errors = []; // Clear errors after successful fix
    });

  } catch (error) {
    console.error('Failed to get or apply fixes:', error);
  }
}

// Browser-side code to send logs to WebSocket
const browserScript = `
  const ws = new WebSocket('ws://localhost:8080');
  
  // Override console.error
  const originalError = console.error;
  console.error = function(...args) {
    originalError.apply(console, args);
    
    ws.send(JSON.stringify({
      type: 'error',
      message: args.join(' '),
      stack: new Error().stack,
      timestamp: new Date().toISOString(),
      file: window.location.href
    }));
  };

  // Listen for runtime errors
  window.addEventListener('error', (event) => {
    ws.send(JSON.stringify({
      type: 'error',
      message: event.message,
      stack: event.error?.stack,
      timestamp: new Date().toISOString(),
      file: event.filename
    }));
  });
`;

// Watch for file changes
chokidar.watch([
  'background.js',
  'popup.js',
  'manifest.json'
]).on('change', (path) => {
  console.log(`File ${path} changed, rebuilding...`);
  exec('npm run build');
}); 