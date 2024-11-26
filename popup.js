// Add these at the top of popup.js
const DEFAULT_CATEGORIES = [
  'Meals & Entertainment',
  'Travel',
  'Office Supplies',
  'Software & Subscriptions',
  'Professional Services',
  'Utilities',
  'Marketing',
  'Equipment',
  'Training & Education',
  'Other'
];

function logDebug(message, type = 'info') {
  const debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) return;
  
  chrome.storage.sync.get(['showDebug'], (result) => {
    if (!result.showDebug && type !== 'error') return;
    
    const timestamp = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = type;

    // Format error objects
    if (message instanceof Error) {
      div.textContent = `${timestamp}: ${message.name}: ${message.message}`;
      if (message.stack) {
        console.error(message.stack);
      }
    } else if (typeof message === 'object') {
      div.textContent = `${timestamp}: ${JSON.stringify(message, null, 2)}`;
    } else {
      div.textContent = `${timestamp}: ${message}`;
    }
    
    // Add to debug panel
    const firstChild = debugPanel.firstChild;
    if (firstChild) {
      debugPanel.insertBefore(div, firstChild);
    } else {
      debugPanel.appendChild(div);
    }
    
    // Keep only last 10 messages
    while (debugPanel.children.length > 10) {
      debugPanel.removeChild(debugPanel.lastChild);
    }

    // Make sure debug panel is visible for errors
    if (type === 'error') {
      debugPanel.style.display = 'block';
    } else {
      debugPanel.style.display = result.showDebug ? 'block' : 'none';
    }
  });
}

// Add this function to handle receipt deletion
async function deleteReceipt(index) {
  if (!confirm('Are you sure you want to delete this receipt?')) return;

  try {
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipts = storage.capturedReceipts || [];
    receipts.splice(index, 1);
    await chrome.storage.local.set({ capturedReceipts: receipts });
    loadReceipts();
  } catch (error) {
    console.error('Failed to delete receipt:', error);
  }
}

// Add this function to handle receipt viewing
function viewReceipt(imageUrl) {
  const modal = document.getElementById('imageModal');
  const modalImage = modal.querySelector('.modal-image');
  modalImage.src = imageUrl;
  modal.classList.add('active');
}

// Add this function before the DOMContentLoaded event listener
async function loadReceipts() {
  try {
    const receiptsList = document.getElementById('receiptsList');
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipts = storage.capturedReceipts || [];

    // Get categories for the dropdown
    const categoryStorage = await chrome.storage.sync.get(['expenseCategories']);
    const categories = categoryStorage.expenseCategories || DEFAULT_CATEGORIES;

    if (receipts.length === 0) {
      receiptsList.innerHTML = '<div class="no-receipts">No receipts captured yet</div>';
      return;
    }

    receiptsList.innerHTML = receipts.map((receipt, index) => `
      <div class="receipt-item">
        <div class="receipt-row">
          <div class="image-preview" data-image="${receipt.image}">
            <img src="${receipt.image}" alt="Receipt ${index + 1}" style="object-fit: cover; border-radius: 4px; cursor: pointer;">
          </div>
          <div class="actions">
            <button class="analyze-btn" data-index="${index}">Analyze</button>
            <button class="delete-btn" data-index="${index}">Delete</button>
          </div>
        </div>
        ${receipt.analysis ? `
          <div class="analysis">
            <div class="analysis-row">
              <span class="analysis-label">Amount Paid:</span>
              <span class="analysis-value">${receipt.analysis.total}</span>
            </div>
            <div class="analysis-row">
              <span class="analysis-label">Taxes:</span>
              <span class="analysis-value">${receipt.analysis.taxes || '$0.00'}</span>
            </div>
            <div class="analysis-row">
              <span class="analysis-label">Payment Method:</span>
              <span class="analysis-value">${receipt.analysis.payment_method || 'N/A'}</span>
            </div>
            <div class="analysis-row">
              <span class="analysis-label">Vendor:</span>
              <span class="analysis-value">${receipt.analysis.vendor}</span>
            </div>
            <div class="analysis-row category-selector">
              <span class="analysis-label">Category:</span>
              <select class="category-select" data-index="${index}">
                ${categories.map(cat => `
                  <option value="${cat}" ${receipt.analysis.category === cat ? 'selected' : ''}>
                    ${cat}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="file-receipt-action">
              <button class="file-btn" data-index="${index}">
                <svg class="file-icon" viewBox="0 0 20 20">
                  <path d="M10 12V4M10 12l-3-3M10 12l3-3M3 15v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" fill="none" stroke-width="2"/>
                </svg>
                File Receipt
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `).join('');

    // Add event listeners after creating elements
    document.querySelectorAll('.analyze-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        analyzeReceipt(index);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        deleteReceipt(index);
      });
    });

    // Add click handlers for image previews
    document.querySelectorAll('.image-preview').forEach(preview => {
      preview.addEventListener('click', () => {
        viewReceipt(preview.dataset.image);
      });
    });

    // Add event listeners for file buttons
    document.querySelectorAll('.file-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.dataset.index);
        await fileReceipt(index);
      });
    });
  } catch (error) {
    console.error('Error loading receipts:', error);
    const receiptsList = document.getElementById('receiptsList');
    receiptsList.innerHTML = '<div class="error">Error loading receipts</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Attach event listeners
  document.getElementById('captureBtn').addEventListener('click', async () => {
    const tab = await getCurrentTab();
    const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
    
    chrome.runtime.sendMessage({
      action: 'startCapture',
      tabId: tab.id,
      settings: settings
    });
  });

  document.getElementById('settingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Load any existing receipts
  loadReceipts();
});

// Helper function to get current tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function analyzeReceipt(index) {
  try {
    logDebug('Starting receipt analysis...', 'info');
    
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipts = storage.capturedReceipts || [];
    const receipt = receipts[index];

    // Update UI to show processing
    const analyzeBtn = document.querySelector(`[data-index="${index}"].analyze-btn`);
    if (analyzeBtn) {
      analyzeBtn.textContent = 'Analyzing...';
      analyzeBtn.disabled = true;
    }

    logDebug('Sending request to Espensivo API...', 'info');

    // Update the URL to use the correct Firebase Functions endpoint
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0'
      },
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify({
        image: receipt.image.split(',')[1],
        timestamp: new Date().toISOString(),
        metadata: {
          imageSize: receipt.image.length,
          userAgent: navigator.userAgent,
          screenResolution: `${window.screen.width}x${window.screen.height}`
        }
      })
    });

    // Log the raw response for debugging
    const responseText = await response.text();
    logDebug(`Raw API Response: ${responseText}`, 'info');
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${responseText}`);
    }

    // Try to parse the response as JSON
    let analysisResult;
    try {
      analysisResult = JSON.parse(responseText);
    } catch (parseError) {
      logDebug(`JSON Parse Error: ${parseError}`, 'error');
      throw new Error('Failed to parse API response');
    }

    logDebug('Analysis completed successfully', 'success');

    // Update receipt with analysis
    receipt.analysis = {
      total: analysisResult.total_amount,
      date: analysisResult.date,
      vendor: analysisResult.vendor_name,
      category: analysisResult.expense_category,
      taxes: analysisResult.taxes || '$0.00',
      payment_method: analysisResult.payment_method || 'N/A'
    };

    // Save updated receipt
    receipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: receipts });

    // Refresh the list
    loadReceipts();
    logDebug('Receipt analyzed and saved successfully', 'success');

  } catch (error) {
    logDebug(`Analysis failed: ${error.message}`, 'error');
    if (error.stack) {
      logDebug(`Stack trace: ${error.stack}`, 'error');
    }
    const analyzeBtn = document.querySelector(`[data-index="${index}"].analyze-btn`);
    if (analyzeBtn) {
      analyzeBtn.textContent = 'Retry Analysis';
      analyzeBtn.disabled = false;
    }
  }
} 

console.log('Popup initialized');
document.querySelectorAll('button, a').forEach(element => {
  console.log('Found clickable element:', element.id || element.className || element.tagName);
});

async function fileReceipt(index) {
  try {
    logDebug('Starting receipt filing process...', 'info');
    
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipt = storage.capturedReceipts[index];
    
    if (!receipt || !receipt.analysis) {
      throw new Error('Receipt or analysis not found');
    }

    // Get email settings
    const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
    if (!settings.expenseEmail) {
      throw new Error('Email not configured. Please check settings.');
    }

    // Create PDF using jsPDF global object
    if (typeof window.jspdf === 'undefined') {
      throw new Error('PDF library not loaded. Please refresh the page.');
    }

    const doc = new window.jspdf.jsPDF();
    
    // Add receipt image
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = receipt.image;
    });
    
    // Calculate dimensions to fit the page
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgRatio = img.width / img.height;
    let imgWidth = pageWidth - 40; // 20px margin on each side
    let imgHeight = imgWidth / imgRatio;
    
    // Add receipt image
    doc.addImage(receipt.image, 'PNG', 20, 20, imgWidth, imgHeight);
    
    // Add metadata below image
    let y = imgHeight + 40;
    doc.setFontSize(12);
    doc.text(`Vendor: ${receipt.analysis.vendor}`, 20, y);
    doc.text(`Amount: ${receipt.analysis.total}`, 20, y + 10);
    doc.text(`Date: ${receipt.analysis.date}`, 20, y + 20);
    doc.text(`Category: ${receipt.analysis.category}`, 20, y + 30);
    if (receipt.analysis.payment_method) {
      doc.text(`Payment Method: ${receipt.analysis.payment_method}`, 20, y + 40);
    }
    
    // Convert PDF to blob
    const pdfBlob = doc.output('blob');

    // Prepare email data
    const formData = new FormData();
    formData.append('to', settings.expenseEmail);
    formData.append('subject', `Expense Receipt - ${receipt.analysis.vendor} - ${receipt.analysis.total}`);
    formData.append('body', `
Receipt Details:
Vendor: ${receipt.analysis.vendor}
Amount: ${receipt.analysis.total}
Date: ${receipt.analysis.date}
Category: ${receipt.analysis.category}
${receipt.analysis.payment_method ? `Payment Method: ${receipt.analysis.payment_method}` : ''}
    `);
    formData.append('attachment', pdfBlob, 'receipt.pdf');

    // Send email
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/api/send-email', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }

    // Show success message
    const receiptItem = document.querySelector(`[data-index="${index}"]`).closest('.receipt-item');
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    successMsg.innerHTML = `
      <svg viewBox="0 0 20 20">
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
      </svg>
      Receipt filed successfully
    `;
    receiptItem.insertBefore(successMsg, receiptItem.firstChild);

    // Remove success message after 3 seconds
    setTimeout(() => {
      successMsg.remove();
    }, 3000);

  } catch (error) {
    logDebug(`Error filing receipt: ${error.message}`, 'error');
    alert(`Failed to file receipt: ${error.message}`);
  }
}