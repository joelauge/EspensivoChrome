(function() {
  let isSelecting = false;
  let startX, startY;
  let selectionDiv = null;
  let overlay = null;
  let captureBtn = null;
  let container = null;

  function createOverlay() {
    // Create container for all UI elements
    container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999999;
      pointer-events: none;
    `;

    // Create overlay
    overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      cursor: crosshair;
      pointer-events: auto;
    `;

    // Create selection div
    selectionDiv = document.createElement('div');
    selectionDiv.style.cssText = `
      position: absolute;
      border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.1);
      display: none;
      pointer-events: auto;
    `;

    // Create capture button
    captureBtn = document.createElement('button');
    captureBtn.textContent = 'Capture';
    captureBtn.style.cssText = `
      position: absolute;
      display: none;
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      pointer-events: auto;
    `;

    // Add all elements to container
    container.appendChild(overlay);
    container.appendChild(selectionDiv);
    container.appendChild(captureBtn);
    document.body.appendChild(container);

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
      // 1. Store the dimensions and remove all UI elements
      const dimensions = {
        left: parseInt(selectionDiv.style.left) + window.scrollX,
        top: parseInt(selectionDiv.style.top) + window.scrollY,
        width: parseInt(selectionDiv.style.width),
        height: parseInt(selectionDiv.style.height)
      };

      // 2. Important: Remove ALL UI elements from DOM before capture
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }

      // 3. Wait for three animation frames to ensure complete DOM update
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
          });
        });
      });

      // 4. Take the screenshot
      const response = await chrome.runtime.sendMessage({
        action: 'takeScreenshot'
      });

      if (!response || !response.dataUrl) {
        throw new Error('Failed to capture screenshot');
      }

      // 5. Create canvas and crop image
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = response.dataUrl;
      });

      // 6. Set canvas dimensions and draw cropped image
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      ctx.drawImage(
        img,
        dimensions.left,
        dimensions.top,
        dimensions.width,
        dimensions.height,
        0,
        0,
        dimensions.width,
        dimensions.height
      );

      // 7. Get final image and send to background
      const croppedDataUrl = canvas.toDataURL('image/png');
      await chrome.runtime.sendMessage({
        action: 'captureRegion',
        imageData: croppedDataUrl
      });

    } catch (error) {
      console.error('Capture failed:', error);
      // Don't restore UI - let user start fresh if there's an error
    }
  }

  createOverlay();
})(); 