// Add this near the top of your background.js
const MOCK_MODE = false; // Set to false when ready for production

// Store captured data temporarily in background script
let lastCapturedImage = null;

// Make sure the service worker activates immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Handle screenshot capture and processing
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action); // Debug log

  if (request.action === "startCapture") {
    console.log('Starting capture for tab:', request.tabId); // Debug log
    chrome.tabs.get(request.tabId, (tab) => {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
        chrome.runtime.sendMessage({
          action: 'captureError',
          error: 'Cannot capture from browser system pages'
        });
        return;
      }
      
      chrome.storage.local.set({ 
        captureSettings: {
          expenseEmail: request.settings.expenseEmail,
          serviceType: request.settings.serviceType
        }
      }, () => {
        chrome.scripting.executeScript({
          target: { tabId: request.tabId },
          func: injectSelectionUI,
          args: [chrome.runtime.id] // Pass the extension ID to the content script
        });
      });
    });
  }
  
  if (request.action === "captureRegion") {
    console.log('Received capture region request with image data length:', 
      request.imageData ? request.imageData.length : 'no data');
    
    try {
      // Store the captured image data
      chrome.storage.local.get(['capturedReceipts'], (result) => {
        const receipts = result.capturedReceipts || [];
        receipts.unshift({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          image: request.imageData,
          status: 'Processing'
        });
        
        console.log('Saving receipt...'); // Debug log
        chrome.storage.local.set({ capturedReceipts: receipts }, async () => {
          if (chrome.runtime.lastError) {
            console.error('Storage error:', chrome.runtime.lastError);
            return;
          }
          console.log('Receipt saved successfully');
          lastCapturedImage = request.imageData;
          
          try {
            await chrome.runtime.sendMessage({
              action: 'captureSuccess'
            });
          } catch (error) {
            // Popup is closed, that's okay
            console.log('Popup is closed, capture was still successful');
          }
        });
      });
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error processing receipt:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'takeScreenshot') {
    console.log('Taking screenshot...'); // Debug log
    chrome.tabs.captureVisibleTab(null, { 
      format: 'png',
      quality: 100
    }).then(dataUrl => {
      console.log('Screenshot taken successfully'); // Debug log
      sendResponse({ dataUrl });
    }).catch(error => {
      console.error('Screenshot error:', error);
      sendResponse({ error: error.message });
    });
    return true;
  }

  if (request.action === 'getLastCapture') {
    sendResponse({ imageData: lastCapturedImage });
    lastCapturedImage = null; // Clear after sending
    return true;
  }

  if (request.action === 'processScreenshot') {
    // Here you can:
    // 1. Save the screenshot
    // 2. Process it for receipt detection
    // 3. Add it to your receipt list
    
    // Example storage in chrome.storage.local
    chrome.storage.local.get(['receipts'], function(result) {
      const receipts = result.receipts || [];
      receipts.push({
        id: Date.now(),
        image: request.screenshot,
        timestamp: new Date().toISOString(),
        analyzed: false
      });
      
      chrome.storage.local.set({ receipts: receipts }, function() {
        console.log('Screenshot saved');
      });
    });
  }
});

// Define the injection function
function injectSelectionUI(extensionId) {
  let isSelecting = false;
  let startX, startY;
  let container, overlay, selectionDiv, captureButton;
  let resizeHandles = [];
  let isResizing = false;
  let currentHandle = null;
  let initialWidth, initialHeight, initialX, initialY;

  async function captureSelection() {
    const rect = selectionDiv.getBoundingClientRect();
    
    try {
      // Store the selection dimensions
      const selectionRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };

      // Temporarily hide the selection UI
      selectionDiv.style.display = 'none';
      captureButton.style.display = 'none';
      overlay.style.background = 'transparent';

      // Request screenshot from background script
      const response = await chrome.runtime.sendMessage({
        action: 'takeScreenshot'
      });

      if (!response || !response.dataUrl) {
        throw new Error('Failed to capture screenshot');
      }

      // Create a canvas to crop the screenshot
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = response.dataUrl;
      });

      // Set canvas size to selection size
      canvas.width = selectionRect.width;
      canvas.height = selectionRect.height;

      // Draw the cropped region
      ctx.drawImage(
        img,
        selectionRect.left * window.devicePixelRatio,
        selectionRect.top * window.devicePixelRatio,
        selectionRect.width * window.devicePixelRatio,
        selectionRect.height * window.devicePixelRatio,
        0,
        0,
        selectionRect.width,
        selectionRect.height
      );

      // Get the cropped image as base64
      const imageData = canvas.toDataURL('image/png');

      // Send the cropped image data to background script
      await chrome.runtime.sendMessage({
        action: 'captureRegion',
        imageData: imageData
      });

      // Clean up
      document.body.removeChild(container);

    } catch (error) {
      console.error('Capture error:', error);
      chrome.runtime.sendMessage({
        action: 'captureError',
        error: error.message
      });
      // Clean up on error
      document.body.removeChild(container);
    }
  }

  function createSelectionOverlay() {
    // Create container with absolute positioning
    container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${document.documentElement.scrollWidth}px;
      height: ${document.documentElement.scrollHeight}px;
      pointer-events: none;
      z-index: 2147483647;
    `;

    overlay = document.createElement('div');
    overlay.id = 'espensivo-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      cursor: crosshair;
      z-index: 2147483647;
      pointer-events: auto;
    `;

    selectionDiv = document.createElement('div');
    selectionDiv.style.cssText = `
      position: absolute;
      border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.1);
      display: none;
      z-index: 2147483647;
      pointer-events: auto;
    `;

    // Create capture button
    captureButton = document.createElement('button');
    captureButton.textContent = 'Capture Selection';
    captureButton.style.cssText = `
      position: fixed;
      display: none;
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: -apple-system, system-ui, sans-serif;
      font-size: 14px;
      z-index: 2147483648;
      pointer-events: auto;
    `;

    // Add click handler for capture button
    captureButton.addEventListener('click', captureSelection);

    // Create resize handles
    const handlePositions = ['n', 'e', 's', 'w'];
    handlePositions.forEach(pos => {
      const handle = document.createElement('div');
      handle.className = `resize-handle ${pos}`;
      handle.style.cssText = `
        position: absolute;
        background: white;
        border: 2px solid #2563eb;
        z-index: 2147483648;
      `;

      // Set position-specific styles
      switch(pos) {
        case 'n':
        case 's':
          handle.style.width = '20px';
          handle.style.height = '8px';
          handle.style.left = '50%';
          handle.style.transform = 'translateX(-50%)';
          handle.style.cursor = 'ns-resize';
          break;
        case 'e':
        case 'w':
          handle.style.width = '8px';
          handle.style.height = '20px';
          handle.style.top = '50%';
          handle.style.transform = 'translateY(-50%)';
          handle.style.cursor = 'ew-resize';
          break;
      }

      // Position handles
      switch(pos) {
        case 'n': handle.style.top = '-4px'; break;
        case 'e': handle.style.right = '-4px'; break;
        case 's': handle.style.bottom = '-4px'; break;
        case 'w': handle.style.left = '-4px'; break;
      }

      resizeHandles.push(handle);
      selectionDiv.appendChild(handle);

      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isResizing = true;
        currentHandle = pos;
        
        const rect = selectionDiv.getBoundingClientRect();
        initialWidth = rect.width;
        initialHeight = rect.height;
        initialX = rect.left;
        initialY = rect.top;
        
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
      });
    });

    container.appendChild(overlay);
    container.appendChild(selectionDiv);
    container.appendChild(captureButton);
    document.body.appendChild(container);

    overlay.addEventListener('mousedown', startSelection);
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
  }

  function handleResize(e) {
    if (!isResizing) return;

    const rect = selectionDiv.getBoundingClientRect();
    let newWidth = initialWidth;
    let newHeight = initialHeight;
    let newX = initialX;
    let newY = initialY;

    switch(currentHandle) {
      case 'n':
        newHeight = initialHeight - (e.clientY - initialY);
        newY = e.clientY;
        break;
      case 'e':
        newWidth = e.clientX - initialX;
        break;
      case 's':
        newHeight = e.clientY - initialY;
        break;
      case 'w':
        newWidth = initialWidth - (e.clientX - initialX);
        newX = e.clientX;
        break;
    }

    if (newWidth > 0) {
      selectionDiv.style.width = `${newWidth}px`;
      if (currentHandle === 'w') selectionDiv.style.left = `${newX}px`;
    }
    if (newHeight > 0) {
      selectionDiv.style.height = `${newHeight}px`;
      if (currentHandle === 'n') selectionDiv.style.top = `${newY}px`;
    }

    // Update capture button position
    if (captureButton) {
      captureButton.style.left = `${selectionDiv.offsetLeft}px`;
      captureButton.style.top = `${selectionDiv.offsetTop + selectionDiv.offsetHeight + 10}px`;
    }
  }

  function stopResize() {
    isResizing = false;
    currentHandle = null;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }

  function startSelection(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionDiv.style.display = 'block';
    updateSelectionDiv(e);
  }

  function updateSelection(e) {
    if (!isSelecting) return;
    updateSelectionDiv(e);
  }

  function updateSelectionDiv(e) {
    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionDiv.style.left = `${left}px`;
    selectionDiv.style.top = `${top}px`;
    selectionDiv.style.width = `${width}px`;
    selectionDiv.style.height = `${height}px`;
    selectionDiv.style.display = 'block';

    // Update capture button position
    if (captureButton) {
      captureButton.style.left = `${left}px`;
      captureButton.style.top = `${top + height + 10}px`;
    }
  }

  function endSelection() {
    if (!isSelecting) return;
    isSelecting = false;

    // Only show capture button if the selection has a meaningful size
    const width = parseInt(selectionDiv.style.width);
    const height = parseInt(selectionDiv.style.height);
    
    if (width > 10 && height > 10) {
      captureButton.style.display = 'block';
      captureButton.style.left = `${selectionDiv.offsetLeft}px`;
      captureButton.style.top = `${selectionDiv.offsetTop + selectionDiv.offsetHeight + 10}px`;
    } else {
      // Clean up if selection is too small
      document.body.removeChild(container);
    }
  }

  createSelectionOverlay();
}

// Export the injection function for use in chrome.scripting.executeScript
self.injectSelectionUI = injectSelectionUI; 

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'captureArea') {
    try {
      // Capture the entire visible tab first
      const screenshot = await chrome.tabs.captureVisibleTab(null, {
        format: 'png'
      });

      // Create a canvas to crop the screenshot
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = message.area.devicePixelRatio;
        
        // Set canvas size to selection size
        canvas.width = message.area.width * dpr;
        canvas.height = message.area.height * dpr;
        
        // Draw only the selected portion
        ctx.drawImage(img,
          message.area.x * dpr, message.area.y * dpr,
          message.area.width * dpr, message.area.height * dpr,
          0, 0,
          message.area.width * dpr, message.area.height * dpr
        );

        // Get the cropped image
        const croppedImage = canvas.toDataURL('image/png');
        
        // Save to storage
        chrome.storage.local.get(['receipts'], function(result) {
          const receipts = result.receipts || [];
          receipts.push({
            id: Date.now(),
            image: croppedImage,
            timestamp: new Date().toISOString(),
            analyzed: false
          });
          
          chrome.storage.local.set({ receipts: receipts }, function() {
            console.log('Cropped screenshot saved');
          });
        });
      };

      img.src = screenshot;
    } catch (error) {
      console.error('Screenshot failed:', error);
    }
  }
});