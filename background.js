// Add at the top of the file
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  // Initialize any required storage
  chrome.storage.local.get(['capturedReceipts'], (result) => {
    if (!result.capturedReceipts) {
      chrome.storage.local.set({ capturedReceipts: [] });
    }
  });
});

// Initialize background service worker
(() => {
  // Store captured data temporarily in background script
  let lastCapturedImage = null;

  console.log('Background script loading...'); // Debug log

  // Main message handler
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.action);
    
    if (request.action === 'startCapture') {
      // First check if we can capture from this tab
      chrome.tabs.get(request.tabId, async (tab) => {
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
          sendResponse({
            error: 'Cannot capture from browser system pages'
          });
          return;
        }

        try {
          // Inject content script if not already injected
          await chrome.scripting.executeScript({
            target: { tabId: request.tabId },
            files: ['content.js']
          });

          // Then inject the capture UI
          await chrome.scripting.executeScript({
            target: { tabId: request.tabId },
            function: injectSelectionUI,
            args: [request.settings, request.hideUI]
          });

          sendResponse({ success: true });
        } catch (error) {
          console.error('Injection error:', error);
          sendResponse({ error: error.message });
        }
      });

      return true; // Keep message channel open for async response
    }
    else if (request.action === 'takeScreenshot') {
      // Take the full screenshot
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        sendResponse({ dataUrl });
      });
      return true;
    }
    else if (request.action === 'saveCapture') {
      // Save the cropped image
      chrome.storage.local.get(['capturedReceipts'], async (storage) => {
        try {
          const receipts = storage.capturedReceipts || [];
          receipts.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            image: request.imageData,
            status: 'Pending Analysis',
            isNew: true  // Mark as new
          });

          // Remove isNew from other receipts
          receipts.slice(1).forEach(r => r.isNew = false);

          await chrome.storage.local.set({ capturedReceipts: receipts });
          
          // Notify popup to refresh
          chrome.runtime.sendMessage({
            action: 'refreshReceipts'
          });

          sendResponse({ success: true });
        } catch (error) {
          console.error('Storage error:', error);
          sendResponse({ error: error.message });
        }
      });
      return true;
    }
    else if (request.action === 'openPopup') {
      try {
        // Try to open the popup programmatically
        chrome.action.openPopup();
      } catch (error) {
        // If can't open programmatically, show notification to user
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon48.png',
          title: 'Receipt Captured!',
          message: 'Click to view your captured receipt',
          priority: 2
        });
      }
      sendResponse({ success: true });
      return true;
    }
  });

  // Handler functions
  function handleStartCapture(request, sender, sendResponse) {
    chrome.tabs.get(request.tabId, (tab) => {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
        sendResponse({
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
          args: [chrome.runtime.id]
        });
      });
    });
  }

  function handleCaptureRegion(request, sender, sendResponse) {
    chrome.storage.local.get(['capturedReceipts'], (result) => {
      const receipts = result.capturedReceipts || [];
      receipts.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        image: request.imageData,
        status: 'Processing'
      });
      
      chrome.storage.local.set({ capturedReceipts: receipts }, () => {
        lastCapturedImage = request.imageData;
        sendResponse({ success: true });
      });
    });
  }

  function handleTakeScreenshot(sender, sendResponse) {
    chrome.tabs.captureVisibleTab(null, { 
      format: 'png',
      quality: 100
    }).then(dataUrl => {
      sendResponse({ dataUrl });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
  }

  function handleGetLastCapture(sendResponse) {
    sendResponse({ imageData: lastCapturedImage });
    lastCapturedImage = null;
  }
})();

// Near the top of background.js
const KEEP_ALIVE_INTERVAL = 25; // seconds

// Keep service worker alive during important operations
function keepAlive() {
  chrome.runtime.getPlatformInfo(() => {
    setTimeout(keepAlive, KEEP_ALIVE_INTERVAL * 1000);
  });
}

// Make sure the service worker activates immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(async function() {
    // Claim clients
    await clients.claim();
    // Start keep-alive
    keepAlive();
  }());
});

// Add near the top
function logError(error, context = '') {
  console.error(`Background Error ${context}:`, error);
  // Optionally report to your error tracking service
}

// Define the injection function
function injectSelectionUI(settings, hideUI) {
  // Create container for selection UI
  const container = document.createElement('div');
  container.className = 'capture-area';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    cursor: crosshair;
    pointer-events: auto;
  `;

  // Create semi-transparent overlay
  const overlay = document.createElement('div');
  overlay.className = 'capture-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.2);
    z-index: 2147483646;
  `;

  // Create capture button (but don't add it yet)
  const captureButton = document.createElement('button');
  captureButton.className = 'capture-button';
  captureButton.textContent = 'Capture';
  captureButton.style.cssText = `
    position: fixed;
    padding: 8px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 14px;
    z-index: 2147483648;
    display: none;
    pointer-events: auto;
  `;

  // Add to page
  document.body.appendChild(container);
  document.body.appendChild(overlay);
  document.body.appendChild(captureButton);

  // Add debug overlay
  const debugInfo = document.createElement('div');
  debugInfo.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    z-index: 2147483649;
    pointer-events: none;
  `;
  document.body.appendChild(debugInfo);

  // Add pixel grid for testing
  const testGrid = document.createElement('div');
  testGrid.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${document.documentElement.scrollWidth}px;
    height: ${document.documentElement.scrollHeight}px;
    pointer-events: none;
    z-index: 2147483645;
    background-image: 
      linear-gradient(to right, rgba(255,0,0,0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,0,0,0.1) 1px, transparent 1px);
    background-size: 100px 100px;
  `;
  document.body.appendChild(testGrid);

  // Add crosshair cursor
  const cursor = document.createElement('div');
  cursor.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 2147483648;
    width: 20px;
    height: 20px;
  `;
  document.body.appendChild(cursor);

  // Update debug info with more precise coordinates
  function updateDebugInfo(e, bounds) {
    const dpr = window.devicePixelRatio;
    debugInfo.innerHTML = `
      Mouse: (${Math.round(e.pageX)}, ${Math.round(e.pageY)})<br>
      Scroll: (${Math.round(window.scrollX)}, ${Math.round(window.scrollY)})<br>
      Selection: (${Math.round(bounds?.x || 0)}, ${Math.round(bounds?.y || 0)})<br>
      Size: ${Math.round(bounds?.width || 0)}x${Math.round(bounds?.height || 0)}<br>
      DPR: ${dpr}<br>
      Grid Cell: (${Math.floor(e.pageX/100)}, ${Math.floor(e.pageY/100)})<br>
      Offset: (${Math.round(e.pageX % 100)}, ${Math.round(e.pageY % 100)})
    `;

    // Update crosshair
    cursor.style.left = `${e.pageX - 10}px`;
    cursor.style.top = `${e.pageY - 10}px`;
    cursor.innerHTML = `
      <svg width="20" height="20">
        <line x1="0" y1="10" x2="20" y2="10" stroke="red" stroke-width="1"/>
        <line x1="10" y1="0" x2="10" y2="20" stroke="red" stroke-width="1"/>
      </svg>
    `;
  }

  let isSelecting = false;
  let startX, startY;
  let selectionDiv = null;

  // Create a coordinate system overlay
  const coordSystem = document.createElement('div');
  coordSystem.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${document.documentElement.scrollWidth}px;
    height: ${document.documentElement.scrollHeight}px;
    pointer-events: none;
    z-index: 2147483646;
  `;
  document.body.appendChild(coordSystem);

  function getExactCoordinates(e) {
    const rect = coordSystem.getBoundingClientRect();
    return {
      x: e.pageX - rect.left,
      y: e.pageY - rect.top
    };
  }

  container.addEventListener('mousedown', startSelection);
  container.addEventListener('mousemove', updateSelection);
  container.addEventListener('mouseup', endSelection);

  // Add zoom warning overlay
  const zoomWarning = document.createElement('div');
  zoomWarning.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: #ef4444;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 14px;
    z-index: 2147483650;
    display: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;
  document.body.appendChild(zoomWarning);

  // Check zoom level
  function checkZoomLevel() {
    const zoomLevel = Math.round((window.outerWidth / window.innerWidth) * 100);
    const isZoomed = Math.abs(zoomLevel - 100) > 1; // Allow 1% tolerance

    debugInfo.innerHTML += `<br>Zoom: ${zoomLevel}%`;

    if (isZoomed) {
      zoomWarning.style.display = 'block';
      zoomWarning.innerHTML = `
        ⚠️ Browser is zoomed to ${zoomLevel}%<br>
        Please reset zoom to 100% for accurate capture (Cmd/Ctrl + 0)
      `;
      return true;
    }
    
    zoomWarning.style.display = 'none';
    return false;
  }

  function startSelection(e) {
    if (checkZoomLevel()) {
      // Optionally prevent selection when zoomed
      // e.preventDefault();
      // return;
    }
    isSelecting = true;
    const coords = getExactCoordinates(e);
    startX = coords.x;
    startY = coords.y;

    selectionDiv = document.createElement('div');
    selectionDiv.className = 'selection-box';
    selectionDiv.style.cssText = `
      position: absolute;
      border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.1);
      z-index: 2147483647;
    `;
    coordSystem.appendChild(selectionDiv);
  }

  function updateSelection(e) {
    if (!isSelecting || !selectionDiv) return;

    const coords = getExactCoordinates(e);
    const currentX = coords.x;
    const currentY = coords.y;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionDiv.style.left = `${left}px`;
    selectionDiv.style.top = `${top}px`;
    selectionDiv.style.width = `${width}px`;
    selectionDiv.style.height = `${height}px`;

    updateDebugInfo(e, { x: left, y: top, width, height });
  }

  function endSelection(e) {
    if (!isSelecting) return;
    isSelecting = false;

    const width = parseInt(selectionDiv.style.width);
    const height = parseInt(selectionDiv.style.height);

    if (width < 10 || height < 10) {
      cleanup();
      return;
    }

    const captureArea = {
      x: parseInt(selectionDiv.style.left),
      y: parseInt(selectionDiv.style.top),
      width: width,
      height: height
    };

    // Position capture button relative to viewport
    const buttonX = captureArea.x + captureArea.width - 80; // 80px from right edge
    const buttonY = captureArea.y + captureArea.height + 10;
    
    captureButton.style.display = 'block';
    captureButton.style.left = `${buttonX}px`;
    captureButton.style.top = `${buttonY}px`;

    captureButton.onclick = async () => {
      if (checkZoomLevel()) {
        if (!confirm('Browser zoom may affect capture accuracy. Continue anyway?')) {
          return;
        }
      }
      try {
        // Hide all visual overlays before capture
        selectionDiv.style.display = 'none';
        captureButton.style.display = 'none';
        overlay.style.background = 'transparent';
        testGrid.style.display = 'none';  // Hide the grid
        cursor.style.display = 'none';    // Hide the cursor
        debugInfo.style.display = 'none'; // Hide debug info
        zoomWarning.style.display = 'none'; // Hide zoom warning

        await new Promise(resolve => setTimeout(resolve, 50));

        const response = await chrome.runtime.sendMessage({ action: 'takeScreenshot' });
        if (!response?.dataUrl) {
          throw new Error('Failed to capture screenshot');
        }

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = response.dataUrl;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = captureArea.width;
        canvas.height = captureArea.height;

        const dpr = window.devicePixelRatio;
        ctx.drawImage(
          img,
          captureArea.x * dpr,
          captureArea.y * dpr,
          captureArea.width * dpr,
          captureArea.height * dpr,
          0,
          0,
          captureArea.width,
          captureArea.height
        );

        debugInfo.innerHTML += `<br>Capture: (${captureArea.x}, ${captureArea.y})`;

        const croppedDataUrl = canvas.toDataURL('image/png');

        // Save the capture and wait for confirmation
        const saveResponse = await chrome.runtime.sendMessage({
          action: 'saveCapture',
          imageData: croppedDataUrl
        });

        if (saveResponse?.success) {
          cleanup();
          // Wait a brief moment for storage to update
          await new Promise(resolve => setTimeout(resolve, 100));
          // Open the extension popup
          await chrome.runtime.sendMessage({ action: 'openPopup' });
        } else {
          throw new Error('Failed to save capture');
        }

      } catch (error) {
        console.error('Capture error:', error);
        alert('Failed to capture receipt. Please try again.');
        cleanup();
      }
    };
  }

  function cleanup() {
    if (coordSystem) coordSystem.remove();
    if (container) container.remove();
    if (overlay) overlay.remove();
    if (captureButton) captureButton.remove();
    if (debugInfo) debugInfo.remove();
    if (testGrid) testGrid.remove();
    if (cursor) cursor.remove();
    if (hideUI) {
      const uiElements = document.querySelectorAll('.capture-ui, .capture-controls');
      uiElements.forEach(el => {
        el.style.visibility = 'visible';
      });
    }
    if (zoomWarning) zoomWarning.remove();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  });

  // Initial zoom check
  checkZoomLevel();
}

// Export the injection function for use in chrome.scripting.executeScript
self.injectSelectionUI = injectSelectionUI; 

chrome.runtime.onMessageExternal.addListener(
  function(request, sender, sendResponse) {
    if (request.action === 'paymentSuccess') {
      chrome.storage.local.set({
        lastPaymentSession: request.sessionId
      }, function() {
        sendResponse({success: true});
      });
      return true;
    }
    if (request.action === 'openPopup') {
      chrome.action.openPopup();
      sendResponse({ success: true });
    }
    return true;
  }
);