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

const TRIAL_LIMIT = 5;

// Helper function to get current tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Function to load and display receipts
async function loadReceipts() {
  try {
    const receiptsList = document.getElementById('receiptsList');
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipts = storage.capturedReceipts || [];
    
    if (receipts.length === 0) {
      receiptsList.innerHTML = '<div class="no-receipts">No receipts captured yet</div>';
      return;
    }

    receiptsList.innerHTML = receipts.map((receipt, index) => `
      <div class="receipt-item">
        <div class="receipt-row">
          <div class="image-preview" data-image="${receipt.image}">
            <img src="${receipt.image}" alt="Receipt ${index + 1}">
          </div>
          <div class="actions">
            <button class="analyze-btn" data-index="${index}">
              ${receipt.analysis ? 'Re-Analyze' : 'Analyze'}
            </button>
            <button class="${receipt.filed ? 'archive-btn' : 'delete-btn'}" data-index="${index}">
              ${receipt.filed ? 'Archive' : 'Delete'}
            </button>
          </div>
        </div>
        ${receipt.analysis ? `
          <div class="analysis">
            <div class="analysis-row">
              <span class="analysis-label">Amount Paid:</span>
              <span class="analysis-value">${receipt.analysis.total}</span>
            </div>
            <div class="analysis-row">
              <span class="analysis-label">Date:</span>
              <span class="analysis-value">${receipt.analysis.date}</span>
            </div>
            <div class="analysis-row">
              <span class="analysis-label">Vendor:</span>
              <span class="analysis-value">${receipt.analysis.vendor}</span>
            </div>
            <div class="analysis-row">
              <span class="analysis-label">Taxes:</span>
              <span class="analysis-value">${receipt.analysis.taxes}</span>
            </div>
            <div class="analysis-row">
              <span class="analysis-label">Payment Method:</span>
              <span class="analysis-value">${receipt.analysis.payment_method}</span>
            </div>
            <div class="analysis-row category-selector">
              <span class="analysis-label">Category:</span>
              <select class="category-select" data-index="${index}">
                ${DEFAULT_CATEGORIES.map(cat => `
                  <option value="${cat}" ${receipt.analysis.category === cat ? 'selected' : ''}>
                    ${cat}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="file-receipt-action">
              <button class="file-btn" data-index="${index}" 
                ${receipt.filed ? 'disabled style="background-color: #059669; cursor: default; opacity: 0.9;"' : ''}>
                <svg class="file-icon" viewBox="0 0 20 20">
                  ${receipt.filed ? 
                    `<path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fill="currentColor"/>` :
                    `<path d="M10 12V4M10 12l-3-3M10 12l3-3M3 15v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" fill="none" stroke-width="2"/>`
                  }
                </svg>
                ${receipt.filed ? 'Receipt Filed' : 'File Receipt'}
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

    // Update delete/archive button handlers
    document.querySelectorAll('.delete-btn, .archive-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const isArchive = btn.classList.contains('archive-btn');
        const message = isArchive ? 'Are you sure you want to archive this receipt?' : 'Are you sure you want to delete this receipt?';
        if (confirm(message)) {
          deleteReceipt(index);
        }
      });
    });

    document.querySelectorAll('.image-preview').forEach(preview => {
      preview.addEventListener('click', () => {
        viewReceipt(preview.dataset.image);
      });
    });

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

// Function to handle receipt deletion
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

// Function to view receipt in modal
function viewReceipt(imageUrl) {
  const modal = document.getElementById('imageModal');
  const modalImage = modal.querySelector('.modal-image');
  modalImage.src = imageUrl;
  modal.classList.add('active');
}

// Add this function for receipt analysis
async function analyzeReceipt(index) {
  try {
    // Get the receipt data
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipt = storage.capturedReceipts[index];
    
    if (!receipt) {
      throw new Error('Receipt not found');
    }

    logDebug('Starting receipt analysis...');
    
    // Single request to Cloud Function
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/api-handler/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: receipt.image.split(',')[1],
        extensionId: chrome.runtime.id,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Analysis response error:', {
        status: response.status,
        text: errorText
      });
      throw new Error(`Analysis request failed with status: ${response.status}`);
    }

    const analysisResult = await response.json();
    logDebug('Received analysis result');
    
    // Update receipt with analysis results
    receipt.analysis = {
      total: analysisResult.data.total_amount,
      date: analysisResult.data.date,
      vendor: analysisResult.data.vendor_name,
      category: analysisResult.data.expense_category,
      taxes: analysisResult.data.taxes || '$0.00',
      payment_method: analysisResult.data.payment_method || 'N/A'
    };
    storage.capturedReceipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: storage.capturedReceipts });
    
    // Reload the receipts display
    await loadReceipts();

  } catch (error) {
    console.error('Analysis failed:', error);
    let errorMessage = 'Failed to analyze receipt. ';
    if (error.message.includes('403')) {
      errorMessage += 'Authentication error - please try again.';
    } else {
      errorMessage += error.message;
    }
    alert(errorMessage);
    logDebug(`Analysis error: ${error.message}`, 'error');
  }
}

// Add this function for debug logging
function logDebug(message, type = 'info') {
  const debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) return;
  
  chrome.storage.sync.get(['showDebug'], (result) => {
    if (!result.showDebug && type !== 'error') return;
    
    const timestamp = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = type;

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
    
    const firstChild = debugPanel.firstChild;
    if (firstChild) {
      debugPanel.insertBefore(div, firstChild);
    } else {
      debugPanel.appendChild(div);
    }
    
    while (debugPanel.children.length > 10) {
      debugPanel.removeChild(debugPanel.lastChild);
    }

    if (type === 'error') {
      debugPanel.style.display = 'block';
    } else {
      debugPanel.style.display = result.showDebug ? 'block' : 'none';
    }
  });
}

// Update the fileReceipt function to use selected category
async function fileReceipt(index) {
  const fileBtn = document.querySelector(`[data-index="${index}"].file-btn`);
  const deleteBtn = document.querySelector(`[data-index="${index}"].delete-btn`);
  
  // Get the currently selected category from the dropdown
  const categorySelect = document.querySelector(`[data-index="${index}"].category-select`);
  const selectedCategory = categorySelect ? categorySelect.value : receipt.analysis.category;
  
  // Check if receipt was already filed
  const storage = await chrome.storage.local.get(['capturedReceipts']);
  const receipts = storage.capturedReceipts || [];
  const receipt = receipts[index];
  
  if (receipt.filed) {
    return; // Already filed, do nothing
  }

  if (fileBtn) {
    fileBtn.innerHTML = `
      <svg class="file-icon loading-spinner" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"
          stroke="currentColor" fill="none" stroke-width="2"/>
      </svg>
      Filing Receipt...
    `;
    fileBtn.disabled = true;
    fileBtn.style.backgroundColor = '#93c5fd';
  }

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

    // Create PDF
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
    const imgRatio = img.width / img.height;
    let imgWidth = pageWidth - 40;
    let imgHeight = imgWidth / imgRatio;
    
    // Add receipt image and metadata
    doc.addImage(receipt.image, 'PNG', 20, 20, imgWidth, imgHeight);
    
    let y = imgHeight + 40;
    doc.setFontSize(12);
    doc.text(`Vendor: ${receipt.analysis.vendor}`, 20, y);
    doc.text(`Amount: ${receipt.analysis.total}`, 20, y + 10);
    doc.text(`Date: ${receipt.analysis.date}`, 20, y + 20);
    doc.text(`Category: ${receipt.analysis.category}`, 20, y + 30);

    // Convert PDF to base64
    const pdfBase64 = doc.output('datauristring').split(',')[1];

    // Send as JSON with updated category
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: settings.expenseEmail,
        subject: `Expense Receipt - ${receipt.analysis.vendor} - ${receipt.analysis.total}`,
        body: `Receipt Details:
Vendor: ${receipt.analysis.vendor}
Amount: ${receipt.analysis.total}
Date: ${receipt.analysis.date}
Category: ${selectedCategory}
${receipt.analysis.payment_method ? `Payment Method: ${receipt.analysis.payment_method}` : ''}`,
        attachment: {
          filename: 'receipt.pdf',
          content: pdfBase64,
          encoding: 'base64'
        }
      })
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(responseData.error?.message || 'Failed to send email');
    }

    // After successful filing, update both buttons
    if (fileBtn) {
      fileBtn.innerHTML = `
        <svg class="file-icon" viewBox="0 0 20 20">
          <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            fill="currentColor"/>
        </svg>
        Receipt Filed
      `;
      fileBtn.style.backgroundColor = '#059669';
      fileBtn.disabled = true;
      fileBtn.style.cursor = 'default';
      fileBtn.style.opacity = '0.9';
    }

    // Update Delete button to Archive
    if (deleteBtn) {
      deleteBtn.textContent = 'Archive';
      deleteBtn.classList.remove('delete-btn');
      deleteBtn.classList.add('archive-btn');
    }

    // Update storage to mark receipt as filed
    receipt.filed = true;
    receipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: receipts });

    // Update the receipt in storage with the selected category
    receipt.analysis.category = selectedCategory;
    receipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: receipts });

    // Show success message
    const receiptItem = document.querySelector(`[data-index="${index}"]`).closest('.receipt-item');
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    successMsg.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
        <img src="/images/icon48.png" alt="Espensivo" style="width: 24px; height: 24px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 2px;">Receipt Filed Successfully!</div>
          <div style="font-size: 12px; color: #166534;">
            Email sent to ${settings.expenseEmail}
          </div>
        </div>
        <svg viewBox="0 0 20 20" style="width: 20px; height: 20px; fill: currentColor;">
          <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
        </svg>
      </div>
    `;
    receiptItem.insertBefore(successMsg, receiptItem.firstChild);

    setTimeout(() => {
      successMsg.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => successMsg.remove(), 300);
    }, 5000);

  } catch (error) {
    // On error, restore both buttons to original state
    if (fileBtn) {
      fileBtn.innerHTML = `
        <svg class="file-icon" viewBox="0 0 20 20">
          <path d="M10 12V4M10 12l-3-3M10 12l3-3M3 15v2a2 2 0 002 2h10a2 2 0 002-2v-2" 
            stroke="currentColor" fill="none" stroke-width="2"/>
        </svg>
        File Receipt
      `;
      fileBtn.style.backgroundColor = '#2563eb';
      fileBtn.disabled = false;
      fileBtn.style.cursor = 'pointer';
      fileBtn.style.opacity = '1';
    }
    if (deleteBtn && deleteBtn.classList.contains('archive-btn')) {
      deleteBtn.textContent = 'Delete';
      deleteBtn.classList.remove('archive-btn');
      deleteBtn.classList.add('delete-btn');
    }
    logDebug(`Error filing receipt: ${error.message}`, 'error');
    alert(`Failed to file receipt: ${error.message}\n\nPlease check your email settings and try again.`);
  }
}

// Add these functions to handle purchases
async function handlePurchaseCredits() {
  try {
    const response = await fetch('https://api-gifcbjbv2q-uc.a.run.app/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productType: 'capture_pack',
        extensionId: chrome.runtime.id
      })
    });

    const { sessionId } = await response.json();
    
    // Redirect to Stripe Checkout
    const stripe = Stripe('your_stripe_public_key'); // Replace with your public key
    const { error } = await stripe.redirectToCheckout({ sessionId });
    
    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Purchase error:', error);
    alert('Failed to start purchase process. Please try again.');
  }
}

async function handleSubscribe() {
  try {
    const response = await fetch('https://api-gifcbjbv2q-uc.a.run.app/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productType: 'unlimited_sub',
        extensionId: chrome.runtime.id
      })
    });

    const { sessionId } = await response.json();
    
    // Redirect to Stripe Checkout
    const stripe = Stripe('your_stripe_public_key'); // Replace with your public key
    const { error } = await stripe.redirectToCheckout({ sessionId });
    
    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Subscription error:', error);
    alert('Failed to start subscription process. Please try again.');
  }
}

// Main event listener
document.addEventListener('DOMContentLoaded', async () => {
  // Attach event listeners
  document.getElementById('captureBtn').addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
      
      console.log('Sending startCapture message...'); // Debug log
      
      // Check if extension is available
      if (!chrome.runtime?.id) {
        throw new Error('Extension context invalid');
      }
      
      chrome.runtime.sendMessage({
        action: 'startCapture',
        tabId: tab.id,
        settings: settings
      }, response => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          alert('Failed to start capture. Please try reloading the page.');
          return;
        }
        
        if (response?.error) {
          console.error('Capture error:', response.error);
          alert(response.error);
        }
      });

    } catch (error) {
      console.error('Error during capture:', error);
      alert('Failed to start capture. Please try again.');
    }
  });

  // Set up modal close functionality
  const imageModal = document.getElementById('imageModal');
  const modalClose = imageModal.querySelector('.modal-close');
  
  modalClose.addEventListener('click', () => {
    imageModal.classList.remove('active');
  });

  // Close modal when clicking outside the image
  imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) {
      imageModal.classList.remove('active');
    }
  });

  // Close modal with escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && imageModal.classList.contains('active')) {
      imageModal.classList.remove('active');
    }
  });

  // Load any existing receipts
  loadReceipts();

  // Add this to the DOMContentLoaded event listener in popup.js
  document.getElementById('settingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Add event listeners for upgrade buttons
  document.getElementById('buyCreditsBtn').addEventListener('click', handlePurchaseCredits);
  document.getElementById('subscribeBtn').addEventListener('click', handleSubscribe);
});