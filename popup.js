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
const TRIAL_CAPTURES = 5;
const CAPTURE_PACK_PRICE = 1000; // $10.00 in cents
const SUBSCRIPTION_PRICE = 495;   // $4.95 in cents
const STRIPE_PUBLIC_KEY = 'your_stripe_public_key';

// Add this function near the top of popup.js
function showCustomAlert(message) {
  // Create modal container
  const alertModal = document.createElement('div');
  alertModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 320px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  `;

  // Add logo
  const logo = document.createElement('img');
  logo.src = 'images/icon48.png';
  logo.alt = 'Espensivo Logo';
  logo.style.cssText = `
    width: 48px;
    height: 48px;
    margin-bottom: 16px;
  `;

  // Add title
  const title = document.createElement('h2');
  title.textContent = 'Espensivo Alert';
  title.style.cssText = `
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 12px 0;
  `;

  // Add message
  const messageText = document.createElement('p');
  messageText.textContent = message;
  messageText.style.cssText = `
    margin: 0 0 20px 0;
    color: #4b5563;
    font-size: 14px;
    line-height: 1.5;
  `;

  // Add OK button
  const okButton = document.createElement('button');
  okButton.textContent = 'OK';
  okButton.style.cssText = `
    background: #2563eb;
    color: white;
    border: none;
    padding: 8px 32px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  `;
  okButton.addEventListener('mouseover', () => {
    okButton.style.background = '#1d4ed8';
  });
  okButton.addEventListener('mouseout', () => {
    okButton.style.background = '#2563eb';
  });
  okButton.addEventListener('click', () => {
    document.body.removeChild(alertModal);
  });

  // Assemble modal
  modalContent.appendChild(logo);
  modalContent.appendChild(title);
  modalContent.appendChild(messageText);
  modalContent.appendChild(okButton);
  alertModal.appendChild(modalContent);
  document.body.appendChild(alertModal);
}

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
    const settings = await chrome.storage.sync.get(['customCategories']);
    const receipts = storage.capturedReceipts || [];
    
    // Get the timestamp of the most recent receipt
    const latestReceipt = receipts[0];
    const isNewReceipt = latestReceipt && 
      (Date.now() - new Date(latestReceipt.timestamp).getTime() < 5000);
    
    // Combine default and custom categories
    const allCategories = [...DEFAULT_CATEGORIES];
    if (settings.customCategories) {
      allCategories.push(...settings.customCategories);
    }
    
    if (receipts.length === 0) {
      receiptsList.innerHTML = '<div class="no-receipts">No receipts captured yet</div>';
      return;
    }

    receiptsList.innerHTML = receipts.map((receipt, index) => `
      <div class="receipt-item${isNewReceipt && index === 0 ? ' new-receipt' : ''}">
        ${isNewReceipt && index === 0 ? '<div class="new-tag">New</div>' : ''}
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
                ${allCategories.map(cat => `
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

    // If this is a new receipt, scroll it into view
    if (isNewReceipt) {
      const newReceipt = receiptsList.querySelector('.new-receipt');
      if (newReceipt) {
        newReceipt.scrollIntoView({ behavior: 'smooth' });
      }
    }

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
        if (window.confirm(message)) {
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
  const storage = await chrome.storage.local.get(['capturedReceipts']);
  const receipt = storage.capturedReceipts[index];
  
  if (receipt.filed) {
    // Handle archiving
    try {
      // Get existing archived receipts
      const archiveStorage = await chrome.storage.local.get(['archivedReceipts']);
      const archivedReceipts = archiveStorage.archivedReceipts || [];
      
      // Get the currently selected category before archiving
      const selectedCategory = document.querySelector(`.category-select[data-index="${index}"]`).value;
      // Update the receipt's category to the user-selected one
      receipt.analysis.category = selectedCategory;
      
      // Add archive date and move to archived receipts
      receipt.archivedDate = new Date().toISOString();
      archivedReceipts.push(receipt);
      
      // Remove from active receipts
      const receipts = storage.capturedReceipts;
      receipts.splice(index, 1);
      
      // Save both changes
      await chrome.storage.local.set({ 
        capturedReceipts: receipts,
        archivedReceipts: archivedReceipts
      });
      
      loadReceipts();
    } catch (error) {
      console.error('Failed to archive receipt:', error);
      alert('Failed to archive receipt. Please try again.');
    }
  } else {
    // Handle deletion
    if (!confirm('Are you sure you want to delete this receipt?')) return;
    
    try {
      const receipts = storage.capturedReceipts;
      receipts.splice(index, 1);
      await chrome.storage.local.set({ capturedReceipts: receipts });
      loadReceipts();
    } catch (error) {
      console.error('Failed to delete receipt:', error);
    }
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
  const analyzeBtn = document.querySelector(`.analyze-btn[data-index="${index}"]`);
  try {
    // Check and decrement captures
    const status = await chrome.storage.sync.get(['trialCaptures', 'subscription']);
    if (!status.subscription?.active) {
      if (!status.trialCaptures || status.trialCaptures <= 0) {
        showCustomAlert('You have no captures remaining. Please purchase more captures or subscribe.');
        return;
      }
      // Decrement captures
      await chrome.storage.sync.set({ 
        trialCaptures: status.trialCaptures - 1 
      });
      updateTrialUI();
    }
    
    // Show loading state
    analyzeBtn.innerHTML = '<div class="loading-spinner"></div><span>Analyzing...</span>';
    analyzeBtn.disabled = true;
    
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const settings = await chrome.storage.sync.get(['customCategories']);
    const receipt = storage.capturedReceipts[index];
    
    if (!receipt) {
      throw new Error('Receipt not found');
    }

    logDebug('Starting receipt analysis...');
    
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/analyze/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: receipt.image.split(',')[1],
        extensionId: chrome.runtime.id,
        timestamp: new Date().toISOString(),
        customCategories: settings.customCategories || []
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
    logDebug(`Raw Anthropic Response: ${JSON.stringify(analysisResult, null, 2)}`);
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

    // Update the category dropdown to include custom categories
    const categorySelect = document.querySelector(`.category-select[data-index="${index}"]`);
    if (categorySelect) {
      const allCategories = [...DEFAULT_CATEGORIES];
      if (settings.customCategories) {
        allCategories.push(...settings.customCategories);
      }
      
      categorySelect.innerHTML = allCategories.map(cat => `
        <option value="${cat}" ${receipt.analysis.category === cat ? 'selected' : ''}>
          ${cat}
        </option>
      `).join('');
    }

  } catch (error) {
    console.error('Analysis failed:', error);
    let errorMessage = 'Failed to analyze receipt. ';
    if (error.message.includes('403')) {
      errorMessage += 'Authentication error - please try again.';
    } else {
      errorMessage += error.message;
    }
    showCustomAlert(errorMessage);
    logDebug(`Analysis error: ${error.message}`, 'error');
    // Reset button state on error
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Re-Analyze';
  }
}

// Add this function for debug logging
function logDebug(message, type = 'info') {
  const debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = type;

  // Format the message
  let formattedMessage = '';
  if (message instanceof Error) {
    formattedMessage = `${message.name}: ${message.message}`;
    if (message.stack) {
      console.error(message.stack);
    }
  } else if (typeof message === 'object') {
    formattedMessage = JSON.stringify(message, null, 2);
  } else {
    formattedMessage = message;
  }
  
  div.textContent = `${timestamp}: ${formattedMessage}`;
  
  const firstChild = debugPanel.firstChild;
  if (firstChild) {
    debugPanel.insertBefore(div, firstChild);
  } else {
    debugPanel.appendChild(div);
  }
  
  while (debugPanel.children.length > 10) {
    debugPanel.removeChild(debugPanel.lastChild);
  }

  // Always show debug panel
  debugPanel.style.display = 'block';
}

// Update the fileReceipt function to use selected category
async function fileReceipt(index) {
  const fileBtn = document.querySelector(`.file-btn[data-index="${index}"]`);
  
  try {
    // Get settings and receipt data
    const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipt = storage.capturedReceipts[index];
    const selectedCategory = document.querySelector(`.category-select[data-index="${index}"]`).value;

    if (!settings.expenseEmail) {
      throw new Error('Email not configured. Please check settings.');
    }

    // Show loading state
    fileBtn.innerHTML = '<div class="loading-spinner"></div> Filing...';
    fileBtn.disabled = true;

    // Prepare email data
    const emailData = {
      to: settings.expenseEmail,
      subject: `Expense Receipt - ${receipt.analysis.vendor} - ${receipt.analysis.total}`,
      body: `
        <h2>Expense Receipt Details</h2>
        <p>Amount: ${receipt.analysis.total}</p>
        <p>Date: ${receipt.analysis.date}</p>
        <p>Vendor: ${receipt.analysis.vendor}</p>
        <p>Category: ${selectedCategory}</p>
        <p>Taxes: ${receipt.analysis.taxes}</p>
        <p>Payment Method: ${receipt.analysis.payment_method}</p>
      `,
      attachment: {
        filename: `receipt-${Date.now()}.png`,
        content: receipt.image.split(',')[1],
        contentType: 'image/png'
      }
    };

    // Send to email function
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || 'Failed to send email');
    }

    // Update receipt status in storage
    receipt.filed = true;
    storage.capturedReceipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: storage.capturedReceipts });

    // Update UI to show success
    fileBtn.innerHTML = `
      <svg class="file-icon" viewBox="0 0 20 20">
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fill="currentColor"/>
      </svg>
      Receipt Filed
    `;
    fileBtn.disabled = true;
    fileBtn.style.backgroundColor = '#059669';
    fileBtn.style.cursor = 'default';
    fileBtn.style.opacity = '0.9';

    // Convert delete button to archive button
    const deleteBtn = document.querySelector(`.delete-btn[data-index="${index}"]`);
    if (deleteBtn) {
      deleteBtn.className = 'archive-btn';
      deleteBtn.textContent = 'Archive';
    }

  } catch (error) {
    console.error('Filing error:', error);
    fileBtn.disabled = false;
    fileBtn.innerHTML = `
      <svg class="file-icon" viewBox="0 0 20 20">
        <path d="M10 12V4M10 12l-3-3M10 12l3-3M3 15v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" fill="none" stroke-width="2"/>
      </svg>
      File Receipt
    `;
    alert(`Failed to file receipt: ${error.message}`);
  }
}

// Add these functions to handle purchases
async function handlePurchaseCredits() {
  try {
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId: 'price_captures_10',
        quantity: 1,
        mode: 'payment',
        amount: CAPTURE_PACK_PRICE,
        currency: 'usd',
        extensionId: chrome.runtime.id
      })
    });

    const { sessionId } = await response.json();
    const stripe = Stripe(STRIPE_PUBLIC_KEY);
    await stripe.redirectToCheckout({ sessionId });
  } catch (error) {
    console.error('Purchase error:', error);
    alert('Failed to start purchase process. Please try again.');
  }
}

async function handleSubscribe() {
  try {
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId: 'price_subscription_monthly',
        mode: 'subscription',
        amount: SUBSCRIPTION_PRICE,
        currency: 'usd',
        extensionId: chrome.runtime.id
      })
    });

    const { sessionId } = await response.json();
    const stripe = Stripe(STRIPE_PUBLIC_KEY);
    await stripe.redirectToCheckout({ sessionId });
  } catch (error) {
    console.error('Subscription error:', error);
    alert('Failed to start subscription process. Please try again.');
  }
}

// Main event listener
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize trial captures if not set
  const status = await chrome.storage.sync.get(['trialCaptures']);
  if (typeof status.trialCaptures === 'undefined') {
    await chrome.storage.sync.set({ trialCaptures: TRIAL_CAPTURES });
  }

  // Update trial UI
  updateTrialUI();

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

  // Add purchase button handlers
  document.getElementById('buyCreditsBtn').addEventListener('click', handlePurchaseCredits);
  document.getElementById('subscribeBtn').addEventListener('click', handleSubscribe);

  // Add debug button for testing if in development
  if (chrome.runtime.getManifest().version_name === 'development' || 
      location.hostname === 'localhost') {
    const debugBtn = document.getElementById('addCapturesBtn');
    debugBtn.style.display = 'inline-block';
    debugBtn.addEventListener('click', async () => {
      const status = await chrome.storage.sync.get(['trialCaptures']);
      const currentCaptures = status.trialCaptures || 0;
      await chrome.storage.sync.set({ 
        trialCaptures: currentCaptures + 5 
      });
      updateTrialUI();
    });
  }
});

// Update the captureSelection function to check trial status
async function captureSelection() {
  try {
    // Check trial/subscription status
    const status = await chrome.storage.sync.get(['trialCaptures', 'subscription']);
    
    if (!status.subscription?.active && (!status.trialCaptures || status.trialCaptures <= 0)) {
      showCustomAlert('You have no captures remaining. Please purchase more captures or subscribe to our monthly plan for unlimited captures.');
      return;
    }

    // ... existing capture code ...

    // If successful capture, decrement trial captures if not subscribed
    if (!status.subscription?.active && status.trialCaptures > 0) {
      await chrome.storage.sync.set({ 
        trialCaptures: status.trialCaptures - 1 
      });
      updateTrialUI();
    }
  } catch (error) {
    console.error('Capture failed:', error);
  }
}

// Function to update trial UI
async function updateTrialUI() {
  const status = await chrome.storage.sync.get(['trialCaptures', 'subscription']);
  const trialSection = document.getElementById('trialSection');
  const capturesLeft = document.getElementById('capturesLeft');
  
  if (status.subscription?.active) {
    trialSection.style.display = 'none';
  } else {
    trialSection.style.display = 'block';
    capturesLeft.textContent = status.trialCaptures || 0;
    
    // Disable capture button if no captures left
    const captureBtn = document.getElementById('captureBtn');
    if (captureBtn) {
      captureBtn.disabled = status.trialCaptures <= 0;
    }
  }
}