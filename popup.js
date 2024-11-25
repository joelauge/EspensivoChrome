// Default expense categories
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

document.addEventListener('DOMContentLoaded', async () => {
  const captureBtn = document.getElementById('captureBtn');
  const debugPanel = document.getElementById('debugPanel');
  const receiptsList = document.getElementById('receiptsList');
  const settingsLink = document.getElementById('settingsLink');
  
  // Get debug panel and check settings
  chrome.storage.sync.get(['showDebug'], (result) => {
    if (debugPanel) {
      debugPanel.style.display = result.showDebug ? 'block' : 'none';
    }
  });

  // Add settings link handler
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: 'settings.html'
    });
  });

  // Setup capture button handler
  captureBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
        throw new Error('Cannot capture from browser system pages');
      }
      
      logDebug('Starting capture...', 'info');
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['selection.js']
      });
      
      window.close(); // Close popup after initiating capture
    } catch (error) {
      logDebug(error, 'error');
    }
  });

  // Load existing receipts
  loadReceipts();

  // Setup image modal
  setupImageModal();
});

function logDebug(message, type = 'info') {
  const debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) return;
  
  chrome.storage.sync.get(['showDebug'], (result) => {
    if (!result.showDebug) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = type;

    // Format error objects
    if (message instanceof Error) {
      div.textContent = `${timestamp}: ${message.name}: ${message.message}`;
      if (message.stack) {
        console.error(message.stack); // Log stack trace to console
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

    // Make sure debug panel is visible
    debugPanel.style.display = 'block';
  });
}

// Add error handlers for various operations
window.onerror = function(msg, url, lineNo, columnNo, error) {
  logDebug(`Global Error: ${msg}`, 'error');
  return false;
};

// Add error handlers for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  logDebug(`Unhandled Promise Rejection: ${event.reason}`, 'error');
});

async function loadReceipts() {
  try {
    const receiptsList = document.getElementById('receiptsList');
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const categoryStorage = await chrome.storage.sync.get(['expenseCategories']);
    const receipts = storage.capturedReceipts || [];
    const categories = categoryStorage.expenseCategories || DEFAULT_CATEGORIES;

    if (receipts.length === 0) {
      receiptsList.innerHTML = '<div class="no-receipts">No receipts captured yet</div>';
      return;
    }

    receiptsList.innerHTML = receipts.map((receipt, index) => `
      <div class="receipt-item">
        <div class="image-preview" data-image="${receipt.image}">
          <img src="${receipt.image}" alt="Receipt ${index + 1}">
        </div>
        <div class="actions">
          <button class="analyze-btn" data-index="${index}">Analyze</button>
          <button class="delete-btn" data-index="${index}">Delete</button>
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
                <svg class="file-icon" viewBox="0 0 20 20" width="20" height="20">
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

    // Add event listener for file buttons
    document.querySelectorAll('.file-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
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

function setupImageModal() {
  const modal = document.getElementById('imageModal');
  const modalImage = modal.querySelector('.modal-image');
  const closeBtn = modal.querySelector('.modal-close');

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

function viewReceipt(imageUrl) {
  const modal = document.getElementById('imageModal');
  const modalImage = modal.querySelector('.modal-image');
  modalImage.src = imageUrl;
  modal.classList.add('active');
}

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

// Update the analyze function to log API responses
async function analyzeReceipt(index) {
  try {
    logDebug('Starting receipt analysis...', 'info');
    
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const apiKeyStorage = await chrome.storage.sync.get(['anthropicKey']);
    const receipts = storage.capturedReceipts || [];
    const receipt = receipts[index];
    const anthropicKey = apiKeyStorage.anthropicKey;

    if (!anthropicKey) {
      throw new Error('Please add your Anthropic API key in settings');
    }

    if (!anthropicKey.startsWith('sk-ant-')) {
      throw new Error('Invalid API key format. Should start with "sk-ant-"');
    }

    // Update UI to show processing
    const analyzeBtn = document.querySelector(`[data-index="${index}"].analyze-btn`);
    if (analyzeBtn) {
      analyzeBtn.textContent = 'Analyzing...';
      analyzeBtn.disabled = true;
    }

    // Properly format the image data
    let base64Data = receipt.image;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: "You are a receipt analysis expert. Extract key information from receipts and format it as JSON. For expense_category, choose from these exact options only: Meals & Entertainment, Travel, Office Supplies, Software & Subscriptions, Professional Services, Utilities, Marketing, Equipment, Training & Education, Other",
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please analyze this receipt image and extract the following information in JSON format: total_amount (with currency), date (in YYYY-MM-DD format), vendor_name, and expense_category (must be one of the predefined categories).'
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Data
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Unknown API error';
      logDebug(`API Error (${response.status}): ${errorMessage}`, 'error');
      throw new Error(`API error: ${response.status} - ${errorMessage}`);
    }

    const analysisResult = await response.json();
    logDebug('Analysis completed successfully', 'success');
    logDebug(`Claude response: ${JSON.stringify(analysisResult, null, 2)}`, 'info');

    // Parse the response and update receipt
    let analysis;
    try {
      const responseText = analysisResult.content[0].text;
      // Try to extract JSON from the response text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    } catch (error) {
      console.error('Parse error:', error);
      throw new Error('Failed to parse Claude\'s response');
    }

    // Update receipt with analysis
    receipt.analysis = {
      total: analysis.total_amount,
      date: analysis.date,
      vendor: analysis.vendor_name,
      category: analysis.expense_category,
      taxes: analysis.taxes || '$0.00',
      payment_method: analysis.payment_method || 'N/A'
    };

    // Save updated receipt
    receipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: receipts });

    // Refresh the list
    loadReceipts();
    logDebug('Receipt analyzed successfully', 'success');

  } catch (error) {
    logDebug(error, 'error');
    const analyzeBtn = document.querySelector(`[data-index="${index}"].analyze-btn`);
    if (analyzeBtn) {
      analyzeBtn.textContent = 'Retry Analysis';
      analyzeBtn.disabled = false;
    }
  }
}

async function fileReceipt(index) {
  try {
    logDebug('Starting receipt filing process...', 'info');
    
    const btn = document.querySelector(`[data-index="${index}"].file-btn`);
    const originalText = btn.innerHTML;
    
    // Show loading state
    btn.innerHTML = `
      <div class="loading-spinner"></div>
      Sending...
    `;
    btn.disabled = true;

    // Get receipt and settings
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
    const receipt = storage.capturedReceipts[index];

    if (!receipt.analysis) {
      throw new Error('Please analyze the receipt first');
    }

    if (!settings.expenseEmail) {
      throw new Error('Please configure email settings first');
    }

    logDebug(`Preparing email with receipt from ${receipt.analysis.vendor}...`, 'info');

    // Prepare email data with PNG image
    const emailData = {
      to: settings.expenseEmail,
      subject: `Expense Receipt - ${receipt.analysis.vendor} - ${receipt.analysis.total}`,
      body: `
Receipt Details:
--------------
Vendor: ${receipt.analysis.vendor}
Amount: ${receipt.analysis.total}
Date: ${receipt.analysis.date}
Category: ${receipt.analysis.category}
${receipt.analysis.payment_method ? `Payment Method: ${receipt.analysis.payment_method}` : ''}
Taxes: ${receipt.analysis.taxes || '$0.00'}

This receipt was filed with Espensivo's Expense Receipt Chrome plugin. Get yours at https://espensivo.com
      `,
      attachments: [{
        filename: 'receipt.png',
        content: receipt.image.split(',')[1], // Remove the data:image/png;base64 prefix
        contentType: 'image/png'
      }]
    };

    logDebug(`Sending email to ${settings.expenseEmail} (${settings.serviceType})...`, 'info');

    // Send the email
    try {
      const response = await sendEmail(emailData);
      logDebug('Email sent successfully', 'success');
    } catch (error) {
      logDebug(`Email sending failed: ${error.message}`, 'error');
      throw new Error(`Failed to send email: ${error.message}`);
    }

    // Show success message
    btn.innerHTML = `
      <svg class="file-icon" viewBox="0 0 20 20">
        <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
      </svg>
      Filed!
    `;
    
    // Reset button after 3 seconds
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 3000);

  } catch (error) {
    logDebug(error.message, 'error');
    const btn = document.querySelector(`[data-index="${index}"].file-btn`);
    btn.innerHTML = `
      <svg class="file-icon" viewBox="0 0 20 20">
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
      </svg>
      Retry
    `;
    btn.disabled = false;
  }
} 