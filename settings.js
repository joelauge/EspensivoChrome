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
  try {
    const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
    
    if (settings.expenseEmail) {
      document.getElementById('expenseEmail').value = settings.expenseEmail;
    }
    if (settings.serviceType) {
      document.getElementById('serviceType').value = settings.serviceType;
    }
  } catch (error) {
    showStatus('Error loading settings: ' + error.message, 'error');
  }

  // Add service type change handler
  document.getElementById('serviceType').addEventListener('change', (e) => {
    const emailInput = document.getElementById('expenseEmail');
    const currentEmail = emailInput.value;
    const serviceType = e.target.value;

    // Clear any existing validation messages
    showStatus('', '');

    // Update placeholder and validation based on service type
    switch(serviceType) {
      case 'quickbooks':
        emailInput.placeholder = 'your-id@qbodocs.com';
        if (currentEmail && !currentEmail.endsWith('@qbodocs.com')) {
          showStatus('Quickbooks email must end with @qbodocs.com', 'error');
        }
        break;
      case 'xero':
        emailInput.placeholder = 'your-id@xerofiles.com';
        if (currentEmail && !currentEmail.endsWith('@xerofiles.com')) {
          showStatus('Xero email must end with @xerofiles.com', 'error');
        }
        break;
      default:
        emailInput.placeholder = 'e.g., expenses@company.com';
    }
  });

  // Render default categories
  const defaultCategoriesContainer = document.querySelector('.default-categories');
  defaultCategoriesContainer.innerHTML = DEFAULT_CATEGORIES.map(category => `
    <div class="default-category">${category}</div>
  `).join('');

  // Load custom categories
  const settings = await chrome.storage.sync.get(['customCategories']);
  const categoriesList = document.getElementById('categoriesList');
  
  function renderCategories() {
    const categories = settings.customCategories || [];
    
    if (categories.length === 0) {
      categoriesList.innerHTML = `
        <div class="empty-state">
          No custom categories added yet
        </div>
      `;
      return;
    }
    
    categoriesList.innerHTML = categories.map((category, index) => `
      <div class="category-item">
        <input type="text" 
          value="${category}" 
          data-index="${index}"
          placeholder="Enter category name">
        <button class="remove-category" data-index="${index}" title="Remove category">x</button>
      </div>
    `).join('');
    
    // Add event listeners for remove buttons
    document.querySelectorAll('.remove-category').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.index);
        settings.customCategories.splice(index, 1);
        await chrome.storage.sync.set({ customCategories: settings.customCategories });
        renderCategories();
      });
    });
    
    // Add event listeners for category input changes
    document.querySelectorAll('.category-item input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const index = parseInt(e.target.dataset.index);
        const newValue = e.target.value.trim();
        
        if (!newValue) {
          e.target.value = settings.customCategories[index];
          return;
        }
        
        if (DEFAULT_CATEGORIES.includes(newValue)) {
          showStatus('This category already exists in default categories', 'error');
          e.target.value = settings.customCategories[index];
          return;
        }
        
        settings.customCategories[index] = newValue;
        await chrome.storage.sync.set({ customCategories: settings.customCategories });
      });
    });
  }

  // Add new category button handler
  document.getElementById('addCategoryBtn').addEventListener('click', async () => {
    if (!settings.customCategories) {
      settings.customCategories = [];
    }
    settings.customCategories.push('New Category');
    await chrome.storage.sync.set({ customCategories: settings.customCategories });
    renderCategories();
    
    // Focus the new input
    const inputs = document.querySelectorAll('.category-item input');
    const lastInput = inputs[inputs.length - 1];
    lastInput.select();
  });

  // Initial render
  renderCategories();
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const expenseEmail = document.getElementById('expenseEmail').value.trim();
  const serviceType = document.getElementById('serviceType').value;

  try {
    // Validate email format
    if (!expenseEmail) {
      throw new Error('Please enter an email address');
    }
    if (!isValidEmail(expenseEmail)) {
      throw new Error('Please enter a valid email address');
    }

    // Validate service-specific email domains
    if (serviceType === 'quickbooks' && !expenseEmail.endsWith('@qbodocs.com')) {
      throw new Error('Quickbooks email must end with @qbodocs.com');
    }
    if (serviceType === 'xero' && !expenseEmail.endsWith('@xerofiles.com')) {
      throw new Error('Xero email must end with @xerofiles.com');
    }

    // Save to chrome.storage
    await chrome.storage.sync.set({
      expenseEmail: expenseEmail,
      serviceType: serviceType
    });

    showStatus('Settings saved successfully!', 'success');

  } catch (error) {
    showStatus(error.message, 'error');
  }
});

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  if (!message) {
    status.style.display = 'none';
    return;
  }
  
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
} 