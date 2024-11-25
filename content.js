// This file is required as specified in manifest.json
// It can be used later for page interaction if needed
console.log('Espensivo content script loaded'); 

let isSelecting = false;
let startX, startY;
let selectionBox = null;

function createSelectionBox() {
  selectionBox = document.createElement('div');
  selectionBox.style.cssText = `
    position: fixed;
    border: 2px solid #0066ff;
    background: rgba(0, 102, 255, 0.1);
    z-index: 10000;
    pointer-events: none;
  `;
  document.body.appendChild(selectionBox);
}

function updateSelectionBox(e) {
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

function handleMouseDown(e) {
  if (!isSelecting) return;
  startX = e.clientX;
  startY = e.clientY;
  createSelectionBox();
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
  if (!isSelecting || !selectionBox) return;
  updateSelectionBox(e);
}

async function handleMouseUp(e) {
  if (!isSelecting || !selectionBox) return;
  
  // Calculate final dimensions
  const bounds = selectionBox.getBoundingClientRect();
  
  // Capture the screen
  chrome.runtime.sendMessage({
    action: 'captureArea',
    area: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      devicePixelRatio: window.devicePixelRatio
    }
  });

  // Clean up
  cleanupSelection();
}

function cleanupSelection() {
  isSelecting = false;
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.body.style.cursor = 'default';
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    isSelecting = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mousedown', handleMouseDown);
  }
}); 