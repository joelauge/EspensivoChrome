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

  // Load categories
  loadCategories();
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

// Load categories
async function loadCategories() {
  const defaultList = document.querySelector('.default-categories .category-list');
  const customList = document.querySelector('.custom-categories .category-list');
  
  // Load default categories
  defaultList.innerHTML = DEFAULT_CATEGORIES.map(cat => `
    <div class="category-item default">
      ${cat}
    </div>
  `).join('');
  
  // Load custom categories
  const { customCategories = [] } = await chrome.storage.sync.get(['customCategories']);
  
  customList.innerHTML = customCategories.map(cat => `
    <div class="category-item">
      <input type="text" value="${cat}" data-original="${cat}">
      <button class="delete-category" title="Delete category">x</button>
    </div>
  `).join('');
  
  // Add event listeners for editing and deleting
  customList.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', async () => {
      const original = input.dataset.original;
      const newValue = input.value.trim();
      
      if (newValue && newValue !== original) {
        const { customCategories = [] } = await chrome.storage.sync.get(['customCategories']);
        const index = customCategories.indexOf(original);
        if (index !== -1) {
          customCategories[index] = newValue;
          await chrome.storage.sync.set({ customCategories });
          input.dataset.original = newValue;
        }
      }
    });
  });
  
  customList.querySelectorAll('.delete-category').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.parentElement;
      const value = item.querySelector('input').dataset.original;
      
      const { customCategories = [] } = await chrome.storage.sync.get(['customCategories']);
      const newCategories = customCategories.filter(cat => cat !== value);
      await chrome.storage.sync.set({ customCategories: newCategories });
      
      item.remove();
    });
  });
}

// Add new category
document.getElementById('addCategoryBtn').addEventListener('click', async () => {
  const input = document.getElementById('newCategory');
  const value = input.value.trim();
  
  if (value) {
    const { customCategories = [] } = await chrome.storage.sync.get(['customCategories']);
    if (!customCategories.includes(value) && !DEFAULT_CATEGORIES.includes(value)) {
      customCategories.push(value);
      await chrome.storage.sync.set({ customCategories });
      await loadCategories();
      input.value = '';
    }
  }
}); 