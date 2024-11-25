(function() {
  let isSelecting = false;
  let startX, startY;
  let selectionDiv = null;
  let overlay = null;
  let captureBtn = null;

  function createOverlay() {
    // Create overlay
    overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      z-index: 999999;
      cursor: crosshair;
    `;

    // Create selection div
    selectionDiv = document.createElement('div');
    selectionDiv.style.cssText = `
      position: fixed;
      border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.1);
      display: none;
      z-index: 1000000;
    `;

    // Create capture button
    captureBtn = document.createElement('button');
    captureBtn.textContent = 'Capture';
    captureBtn.style.cssText = `
      position: fixed;
      display: none;
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      z-index: 1000001;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(selectionDiv);
    document.body.appendChild(captureBtn);

    // Add event listeners
    overlay.addEventListener('mousedown', startSelection);
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
    captureBtn.addEventListener('click', captureSelection);
  }

  function startSelection(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionDiv.style.display = 'block';
  }

  function updateSelection(e) {
    if (!isSelecting) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionDiv.style.left = left + 'px';
    selectionDiv.style.top = top + 'px';
    selectionDiv.style.width = width + 'px';
    selectionDiv.style.height = height + 'px';
  }

  function endSelection(e) {
    if (!isSelecting) return;
    isSelecting = false;

    const width = parseInt(selectionDiv.style.width);
    const height = parseInt(selectionDiv.style.height);

    if (width > 10 && height > 10) {
      captureBtn.style.display = 'block';
      captureBtn.style.left = selectionDiv.style.left;
      captureBtn.style.top = (parseInt(selectionDiv.style.top) + height + 10) + 'px';
    }
  }

  async function captureSelection() {
    try {
      // Store the dimensions before hiding elements
      const rect = selectionDiv.getBoundingClientRect();
      const dimensions = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };

      // Temporarily hide ALL UI elements
      selectionDiv.style.display = 'none';
      captureBtn.style.display = 'none';
      overlay.style.background = 'transparent';
      
      // Give the browser a moment to repaint without the UI elements
      await new Promise(resolve => setTimeout(resolve, 100));

      // Take screenshot
      const response = await chrome.runtime.sendMessage({
        action: 'takeScreenshot'
      });

      if (!response || !response.dataUrl) {
        throw new Error('Failed to capture screenshot');
      }

      // Create canvas for cropping
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = response.dataUrl;
      });

      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      ctx.drawImage(
        img,
        dimensions.left * window.devicePixelRatio,
        dimensions.top * window.devicePixelRatio,
        dimensions.width * window.devicePixelRatio,
        dimensions.height * window.devicePixelRatio,
        0,
        0,
        dimensions.width,
        dimensions.height
      );

      const imageData = canvas.toDataURL('image/png');

      // Send to background script
      await chrome.runtime.sendMessage({
        action: 'captureRegion',
        imageData: imageData
      });

      // Clean up
      cleanup();
    } catch (error) {
      console.error('Capture error:', error);
      cleanup();
    }
  }

  function cleanup() {
    document.body.removeChild(overlay);
    document.body.removeChild(selectionDiv);
    document.body.removeChild(captureBtn);
  }

  createOverlay();
})(); 