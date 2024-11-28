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
  if (!isSelecting) return;
  
  const width = Math.abs(e.clientX - startX);
  const height = Math.abs(e.clientY - startY);
  
  if (width < 10 || height < 10) {
    resetCapture();
    return;
  }
  
  // Store the bounds
  const bounds = {
    x: parseInt(selectionBox.style.left),
    y: parseInt(selectionBox.style.top),
    width: parseInt(selectionBox.style.width),
    height: parseInt(selectionBox.style.height)
  };

  // Remove ALL selection UI elements
  const container = selectionBox.parentElement;
  if (container) {
    // Remove all child elements first
    while (container.firstChild) {
      container.firstChild.remove();
    }
    // Then remove the container itself
    container.remove();
  }

  // Reset cursor and selection state
  document.body.style.cursor = 'default';
  isSelecting = false;
  selectionBox = null;

  // Small delay to ensure UI is completely gone
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Now take the screenshot
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

  // Show notification
  showNotification('Receipt captured! Opening Espensivo...');
}

function resetCapture() {
  // Clean up selection box if it exists
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }
  
  // Reset selection state
  isSelecting = false;
  startX = null;
  startY = null;
  
  // Remove event listeners
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  
  // Log debug info
  console.log('Selection reset via Escape key');
}

function showNotification(message, type = 'success') {
  // ... existing notification code ...

  // Open sidepanel instead of popup
  chrome.runtime.sendMessage({ 
    action: 'captureSuccess'
  });
} 