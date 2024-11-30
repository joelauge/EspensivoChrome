window.logDebug = logDebug;

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

// Add this near the top of your popup.js file
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshReceipts') {
    loadReceipts(); // Refresh the receipts list
  }
});

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

    // Wait for all receipts to be rendered
    const renderedReceipts = await Promise.all(
      receipts.map((receipt, index) => renderReceipt(receipt, index))
    );
    receiptsList.innerHTML = renderedReceipts.join('');

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

    document.querySelectorAll('.category-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const index = parseInt(e.target.dataset.index);
        const newCategory = e.target.value;
        
        try {
          // Get current receipts
          const storage = await chrome.storage.local.get(['capturedReceipts']);
          const receipts = storage.capturedReceipts || [];
          
          // Update the category in the receipt's analysis
          if (receipts[index] && receipts[index].analysis) {
            receipts[index].analysis.category = newCategory;
            
            // Save back to storage
            await chrome.storage.local.set({ capturedReceipts: receipts });
            
            // Optional: Show a brief success indicator
            const select = e.target;
            const originalBg = select.style.backgroundColor;
            select.style.backgroundColor = '#dcfce7';
            setTimeout(() => {
              select.style.backgroundColor = originalBg;
            }, 500);
          }
        } catch (error) {
          console.error('Failed to update category:', error);
          // Optionally revert the select to previous value
          e.target.value = receipts[index].analysis.category;
        }
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
  const analyzeBtn = document.querySelector(`.analyze-btn[data-index="${index}"]`);
  const originalText = analyzeBtn.textContent;
  
  try {
    // Add loading state
    analyzeBtn.disabled = true;
    analyzeBtn.classList.add('button-loading');

    // Get the receipt data
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipt = storage.capturedReceipts[index];
    
    if (!receipt) {
      throw new Error('Receipt not found');
    }

    logDebug('Starting receipt analysis...');
    
    // Single request to Cloud Function
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/analyze/analyze', {
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
    
    // Get all available categories
    const availableCategories = await getAllCategories();
    
    // Find best matching category
    let matchedCategory = findBestMatchingCategory(
      analysisResult.data.expense_category, 
      availableCategories
    );
    
    // Update receipt with analysis results
    receipt.analysis = {
      total: analysisResult.data.total_amount,
      date: analysisResult.data.date,
      vendor: analysisResult.data.vendor_name,
      category: matchedCategory, // Use the matched category
      taxes: analysisResult.data.taxes || '$0.00',
      payment_method: analysisResult.data.payment_method || 'N/A'
    };
    storage.capturedReceipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: storage.capturedReceipts });
    
    // Reload the receipts display
    await loadReceipts();

    // After successful analysis, update button text
    analyzeBtn.classList.remove('button-loading');
    analyzeBtn.textContent = 'Re-Analyze';
    analyzeBtn.disabled = false;

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

    // Reset button on error
    analyzeBtn.classList.remove('button-loading');
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = originalText;
  }
}

// Add this helper function
function findBestMatchingCategory(aiCategory, availableCategories) {
  // Convert both to lowercase for comparison
  aiCategory = aiCategory.toLowerCase();
  
  // Direct match
  const directMatch = availableCategories.find(
    cat => cat.toLowerCase() === aiCategory
  );
  if (directMatch) return directMatch;
  
  // Partial match
  const partialMatch = availableCategories.find(
    cat => aiCategory.includes(cat.toLowerCase()) || 
           cat.toLowerCase().includes(aiCategory)
  );
  if (partialMatch) return partialMatch;
  
  // Mapping of common variations
  const categoryMappings = {
    'food': 'Meals & Entertainment',
    'restaurant': 'Meals & Entertainment',
    'dining': 'Meals & Entertainment',
    'transportation': 'Travel',
    'hotel': 'Travel',
    'flight': 'Travel',
    'software': 'Software & Subscriptions',
    'subscription': 'Software & Subscriptions',
    'consulting': 'Professional Services',
    'legal': 'Professional Services',
    'advertising': 'Marketing',
    'promotion': 'Marketing',
    'hardware': 'Equipment',
    'device': 'Equipment',
    'training': 'Training & Education',
    'course': 'Training & Education',
    'education': 'Training & Education'
  };
  
  for (const [key, value] of Object.entries(categoryMappings)) {
    if (aiCategory.includes(key)) {
      return value;
    }
  }
  
  // Default to 'Other' if no match found
  return 'Other';
}

// Add this function for debug logging
function logDebug(message, type = 'info') {
  const debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = type;

  let formattedMessage = '';
  if (typeof message === 'object') {
    try {
      formattedMessage = JSON.stringify(message, null, 2);
    } catch (e) {
      formattedMessage = message.toString();
    }
  } else {
    formattedMessage = message;
  }

  div.textContent = `${timestamp}: ${formattedMessage}`;
  
  // Append at bottom for chronological order
  debugPanel.appendChild(div);
  
  // Keep only last 50 messages
  while (debugPanel.children.length > 50) {
    debugPanel.removeChild(debugPanel.firstChild); // Remove oldest messages
  }

  // Always show debug panel when logging
  debugPanel.style.display = 'block';
  
  // Scroll to bottom to show newest messages
  debugPanel.scrollTop = debugPanel.scrollHeight;
}

// Update the fileReceipt function to use selected category
async function fileReceipt(index) {
  const fileBtn = document.querySelector(`.file-btn[data-index="${index}"]`);
  const originalText = fileBtn.textContent;
  
  try {
    fileBtn.disabled = true;
    fileBtn.innerHTML = '<span class="button-loading"></span>';

    // Get receipt data
    const storage = await chrome.storage.local.get(['capturedReceipts']);
    const receipt = storage.capturedReceipts[index];
    
    if (!receipt || !receipt.analysis) {
      throw new Error('Receipt or analysis not found');
    }

    logDebug('Creating PDF for receipt...');
    
    // Create PDF
    const pdfData = await window.createReceiptPDF(receipt);
    
    logDebug('PDF created, preparing email...');

    // Prepare email data
    const emailData = {
      subject: `Receipt: ${receipt.analysis.vendor} - ${receipt.analysis.total}`,
      body: `Receipt details:
Vendor: ${receipt.analysis.vendor}
Amount: ${receipt.analysis.total}
Date: ${receipt.analysis.date}
Category: ${receipt.analysis.category}`,
      attachments: [pdfData]
    };

    logDebug('Sending email with receipt...');

    // Send email
    await window.sendEmail(emailData);
    
    logDebug('Email sent successfully');

    // Update receipt status
    receipt.filed = true;
    storage.capturedReceipts[index] = receipt;
    await chrome.storage.local.set({ capturedReceipts: storage.capturedReceipts });

    // Update UI
    fileBtn.innerHTML = 'Receipt Filed';
    fileBtn.disabled = true;
    fileBtn.style.backgroundColor = '#059669';
    fileBtn.style.cursor = 'default';
    fileBtn.style.opacity = '0.9';

    // Convert delete button to archive
    const deleteBtn = document.querySelector(`.delete-btn[data-index="${index}"]`);
    if (deleteBtn) {
      deleteBtn.className = 'archive-btn';
      deleteBtn.textContent = 'Archive';
    }

  } catch (error) {
    console.error('Filing error:', error);
    logDebug('Filing error: ' + error.message, 'error');
    fileBtn.innerHTML = originalText;
    fileBtn.disabled = false;
    alert(`Failed to file receipt: ${error.message}`);
  }
}

// Add these functions to handle purchases
async function handlePurchaseCredits(packSize) {
  const button = document.getElementById(`pack${packSize}Btn`);
  const originalText = button.textContent;
  const originalClass = button.className;
  
  try {
    button.disabled = true;
    button.classList.add('button-loading');

    // Create checkout session
    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/createCheckoutSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productType: packSize === 10 ? 'capture_pack10' : 'capture_pack100',
        extensionId: chrome.runtime.id
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { sessionId, checkoutUrl } = await response.json();
    
    // Show brief success animation before redirect
    button.classList.remove('button-loading');
    button.classList.add('button-success');
    button.textContent = 'Redirecting...';
    
    // Open checkout in new tab
    chrome.tabs.create({ url: checkoutUrl });

  } catch (error) {
    console.error('Purchase error:', error);
    
    // Show error animation
    button.classList.remove('button-loading');
    button.classList.add('button-error');
    button.textContent = 'Failed!';
    
    // Reset after animation
    setTimeout(() => {
      button.disabled = false;
      button.className = originalClass;
      button.textContent = originalText;
    }, 2000);

    alert('Failed to start purchase process. Please try again.');
  }
}

async function handleSubscribe() {
  const button = document.getElementById('subscribeBtn');
  const originalText = button.textContent;
  const originalClass = button.className;
  
  try {
    button.disabled = true;
    button.classList.add('button-loading');

    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/createCheckoutSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productType: 'unlimited_sub',
        extensionId: chrome.runtime.id
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { sessionId } = await response.json();
    
    // Show brief success animation before redirect
    button.classList.remove('button-loading');
    button.classList.add('button-success');
    button.textContent = 'Redirecting...';
    
    // Redirect to Stripe Checkout after brief delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const stripe = Stripe('pk_test_51QPa562SWDYVKZGEbXXXXXXX');
    const { error } = await stripe.redirectToCheckout({ sessionId });
    
    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Subscription error:', error);
    
    // Show error animation
    button.classList.remove('button-loading');
    button.classList.add('button-error');
    button.textContent = 'Failed!';
    
    // Reset after animation
    setTimeout(() => {
      button.disabled = false;
      button.className = originalClass;
      button.textContent = originalText;
    }, 2000);

    alert('Failed to start subscription process. Please try again.');
  }
}

// Add this function to handle adding test captures
async function addTestCapture() {
  const status = await chrome.storage.sync.get(['trialCaptures']);
  const newCount = (status.trialCaptures || 0) + 1;
  await chrome.storage.sync.set({ trialCaptures: newCount });
  updateCaptureUI(newCount);
}

// Update the updateCaptureUI function
async function updateCaptureUI(captures) {
  const counter = document.getElementById('remainingCaptures');
  const counterText = document.querySelector('.trial-counter');
  const upgradeOptions = document.querySelector('.upgrade-options');
  const captureBtn = document.getElementById('captureBtn');
  
  counter.textContent = captures;
  
  // Update text based on whether they're using trial or paid captures
  const status = await chrome.storage.sync.get(['trialCaptures', 'paidCaptures']);
  if (status.paidCaptures > 0) {
    counterText.textContent = `${status.paidCaptures} captures remaining`;
  } else {
    counterText.textContent = `${status.trialCaptures || 0} free captures remaining`;
  }
  
  if (captures <= 0) {
    upgradeOptions.style.display = 'flex';
    captureBtn.disabled = true;
  } else {
    upgradeOptions.style.display = 'none';
    captureBtn.disabled = false;
  }
}

// Add function to check total available captures
async function getTotalCaptures() {
  const status = await chrome.storage.sync.get(['trialCaptures', 'paidCaptures']);
  return (status.trialCaptures || 0) + (status.paidCaptures || 0);
}

// Update decrementCaptures to handle both trial and paid captures
async function decrementCaptures() {
  const status = await chrome.storage.sync.get(['trialCaptures', 'paidCaptures']);
  
  // If user has paid captures, use those first
  if (status.paidCaptures > 0) {
    const newCount = status.paidCaptures - 1;
    await chrome.storage.sync.set({ paidCaptures: newCount });
    updateCaptureUI(newCount + (status.trialCaptures || 0));
    return;
  }
  
  // Otherwise use trial captures
  if (!status.trialCaptures && status.trialCaptures !== 0) {
    // First time user
    await chrome.storage.sync.set({ trialCaptures: TRIAL_LIMIT });
    updateCaptureUI(TRIAL_LIMIT);
    return;
  }
  
  const newCount = Math.max(0, status.trialCaptures - 1);
  await chrome.storage.sync.set({ trialCaptures: newCount });
  updateCaptureUI(newCount);
}

// Add function to handle successful purchase
async function handlePurchaseSuccess(captureCount) {
  // Wait for DOM to be ready
  if (document.readyState !== 'complete') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }

  // Try multiple times to find the elements
  let retries = 0;
  const maxRetries = 5;
  
  while (retries < maxRetries) {
    const counter = document.getElementById('remainingCaptures');
    const counterText = document.querySelector('.trial-counter');
    
    if (counter && counterText) {
      const status = await chrome.storage.sync.get(['paidCaptures', 'trialCaptures']);
      const newCount = (status.paidCaptures || 0) + captureCount;
      await chrome.storage.sync.set({ paidCaptures: newCount });
      
      // Add animation class
      counterText.classList.add('capture-added');
      
      // Start counting animation after 500ms
      setTimeout(() => {
        // Get the starting number
        const startNum = parseInt(counter.textContent);
        const endNum = newCount + (status.trialCaptures || 0);
        const duration = 1500; // Animation duration in ms
        const steps = 30; // Number of steps in animation
        const stepValue = (endNum - startNum) / steps;
        let currentStep = 0;
        
        // Create counting animation
        const countInterval = setInterval(() => {
          currentStep++;
          const currentValue = Math.round(startNum + (stepValue * currentStep));
          counter.textContent = currentValue;
          
          // Update text while counting
          counterText.textContent = `${currentValue} captures remaining`;
          
          // Add bouncy effect during count
          counter.style.transform = `scale(${1 + Math.sin(currentStep * 0.2) * 0.1})`;
          
          if (currentStep >= steps) {
            clearInterval(countInterval);
            counter.style.transform = '';
            counterText.classList.remove('capture-added');
            
            // Update the rest of the UI
            updateCaptureUI(endNum);
          }
        }, duration / steps);
      }, 500);

      return; // Success!
    }

    // Wait 100ms before trying again
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }

  console.error('Could not find counter elements after', maxRetries, 'attempts');
}

// Add function to check for updates
async function checkForUpdates() {
  const result = await chrome.storage.sync.get(['lastCheck', 'pendingCredits']);
  const now = Date.now();
  
  // Only check every 5 seconds
  if (result.lastCheck && now - result.lastCheck < 5000) {
    return;
  }
  
  await chrome.storage.sync.set({ lastCheck: now });
  
  // Check Firestore for updates
  const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/checkUserStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extensionId: chrome.runtime.id })
  });
  
  if (response.ok) {
    const data = await response.json();
    if (data.credits) {
      // Store credits for when popup opens
      await chrome.storage.sync.set({ pendingCredits: data.credits });
    }
    if (data.subscription) {
      // Handle subscription updates
      window.location.reload();
    }
  }
}

// Only start polling after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Start polling when payment flow begins
  setInterval(checkForUpdates, 5000);
});

// Main event listener
document.addEventListener('DOMContentLoaded', async () => {
  // Attach event listeners
  document.getElementById('captureBtn').addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
      
      // Add fade-out animation to popup
      document.body.style.transition = 'opacity 0.3s ease-out';
      document.body.style.opacity = '0';
      
      // Wait for animation to complete before starting capture
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check if extension is available
      if (!chrome.runtime?.id) {
        throw new Error('Extension context invalid');
      }

      // Send message to start capture
      chrome.runtime.sendMessage({
        action: 'startCapture',
        tabId: tab.id,
        settings: settings,
        hideUI: true
      }, async response => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          alert('Failed to start capture. Please try reloading the page.');
          return;
        }
        
        if (response?.error) {
          console.error('Capture error:', response.error);
          alert(response.error);
        } else if (response?.success) {
          // Close the popup
          window.close();
          // Decrement will happen when capture is successful
          await decrementCaptures();
        }
      });

    } catch (error) {
      console.error('Error during capture:', error);
      alert('Failed to start capture. Please try again.');
      // Reset opacity if there's an error
      document.body.style.opacity = '1';
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
  document.getElementById('pack10Btn').addEventListener('click', () => {
    handlePurchaseCredits(10);
  });
  
  document.getElementById('pack100Btn').addEventListener('click', () => {
    handlePurchaseCredits(100);
  });
  
  document.getElementById('subscribeBtn').addEventListener('click', handleSubscribe);

  // Add this near the top of your DOMContentLoaded event handler
  console.log('jsPDF availability:', {
    hasWindow: !!window,
    hasJsPDF: !!window.jspdf,
    hasConstructor: !!(window.jspdf && window.jspdf.jsPDF)
  });

  // Initialize capture count
  const status = await chrome.storage.sync.get(['trialCaptures']);
  if (!status.trialCaptures && status.trialCaptures !== 0) {
    await chrome.storage.sync.set({ trialCaptures: TRIAL_LIMIT });
    updateCaptureUI(TRIAL_LIMIT);
  } else {
    updateCaptureUI(status.trialCaptures);
  }

  // Add debug button for testing
  const debugPanel = document.getElementById('debugPanel');
  const addCaptureBtn = document.createElement('button');
  addCaptureBtn.textContent = 'Add Test Capture';
  addCaptureBtn.className = 'debug-btn';
  addCaptureBtn.addEventListener('click', addTestCapture);
  debugPanel.appendChild(addCaptureBtn);

  // Check for pending credits
  const { pendingCredits } = await chrome.storage.sync.get(['pendingCredits']);
  if (pendingCredits) {
    // Clear pending credits first to prevent double-counting
    await chrome.storage.sync.remove(['pendingCredits']);
    // Handle the purchase success animation
    await handlePurchaseSuccess(pendingCredits);
  }

  // Start polling
  setInterval(checkForUpdates, 5000);
});

// Update renderReceipt to be async
async function renderReceipt(receipt, index) {
  const receiptDiv = document.createElement('div');
  receiptDiv.className = `receipt-item${receipt.isNew ? ' receipt-new' : ''}`;
  
  // Get categories before building HTML
  const allCategories = await getAllCategories();
  
  // Add the receipt HTML content
  receiptDiv.innerHTML = `
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
            ${receipt.filed ? 'Receipt Filed' : 'File Receipt'}
          </button>
        </div>
      </div>
    ` : ''}
  `;

  // Remove the 'new' status after animation
  if (receipt.isNew) {
    setTimeout(() => {
      chrome.storage.local.get(['capturedReceipts'], (storage) => {
        const receipts = storage.capturedReceipts;
        receipts[index].isNew = false;
        chrome.storage.local.set({ capturedReceipts: receipts });
      });
    }, 2000);
  }

  return receiptDiv.outerHTML;
}

async function getAllCategories() {
  const { customCategories = [] } = await chrome.storage.sync.get(['customCategories']);
  return [...DEFAULT_CATEGORIES, ...customCategories];
}