async handleCapture() {
  try {
    // Hide UI elements before capture 
    this.selectionDiv.style.display = 'none';
    this.captureButton.style.display = 'none';
    this.overlay.style.background = 'transparent';

    // Take screenshot
    const response = await chrome.runtime.sendMessage({ 
      action: 'takeScreenshot' 
    });

    if (!response?.dataUrl) {
      throw new Error('Failed to capture screenshot');
    }

    // Process the screenshot
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = response.dataUrl;
    });

    // Crop the image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio;
    canvas.width = this.captureArea.width * dpr;
    canvas.height = this.captureArea.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.drawImage(
      img,
      this.captureArea.x * dpr,
      this.captureArea.y * dpr,
      this.captureArea.width * dpr,
      this.captureArea.height * dpr,
      0,
      0,
      this.captureArea.width,
      this.captureArea.height
    );

    // Save the cropped image
    const croppedDataUrl = canvas.toDataURL('image/png');
    const saveResponse = await chrome.runtime.sendMessage({
      action: 'saveCapture',
      imageData: croppedDataUrl
    });

    if (!saveResponse?.success) {
      throw new Error('Failed to save capture');
    }

    this.cleanup();
  } catch (error) {
    logDebug(`Capture failed: ${error.message}`, 'error');
    
    // Send error to background for tracking
    await chrome.runtime.sendMessage({
      action: 'logError',
      error: {
        message: error.message,
        stack: error.stack,
        context: 'capture'
      }
    });
    
    alert('Failed to capture receipt. Please try again.');
    this.cleanup();
  }
} 
