document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings when page opens
  loadSettings();

  // Add event listeners
  document.getElementById('saveSettings').addEventListener('click', saveAllSettings);
  document.getElementById('addCategory').addEventListener('click', addCategory);
});

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

async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'expenseEmail',
      'serviceType',
      'expenseCategories',
      'showDebug'
    ]);

    document.getElementById('expenseEmail').value = settings.expenseEmail || '';
    document.getElementById('serviceType').value = settings.serviceType || 'quickbooks';
    document.getElementById('debugToggle').checked = settings.showDebug || false;

    const categories = settings.expenseCategories || DEFAULT_CATEGORIES;
    renderCategories(categories);
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

async function saveAllSettings() {
  const settings = {
    expenseEmail: document.getElementById('expenseEmail').value.trim(),
    serviceType: document.getElementById('serviceType').value,
    showDebug: document.getElementById('debugToggle').checked,
    expenseCategories: Array.from(document.querySelectorAll('.category-input'))
      .map(input => input.value.trim())
      .filter(Boolean)
  };


  // Validate email if using custom service type
  if (settings.serviceType === 'custom' && !settings.expenseEmail) {
    showStatus('Please provide an email address for custom email destination', 'error');
    return;
  }

  try {
    await chrome.storage.sync.set(settings);
    showStatus('Settings saved successfully', 'success');
    console.log('Settings saved:', {
      hasAnthropicKey: !!settings.anthropicKey,
      keyFormat: settings.anthropicKey ? settings.anthropicKey.substring(0, 7) + '...' : 'none',
      serviceType: settings.serviceType
    });
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

function renderCategories(categories) {
  const container = document.getElementById('categoriesList');
  container.innerHTML = categories.map((category, index) => `
    <div class="category-item">
      <input type="text" class="category-input" value="${category}">
      <button class="delete" onclick="deleteCategory(${index})">Delete</button>
    </div>
  `).join('');
}

function addCategory() {
  const newCategoryInput = document.getElementById('newCategory');
  const category = newCategoryInput.value.trim();
  
  if (!category) return;

  const container = document.getElementById('categoriesList');
  const newItem = document.createElement('div');
  newItem.className = 'category-item';
  newItem.innerHTML = `
    <input type="text" class="category-input" value="${category}">
    <button class="delete" onclick="deleteCategory(${container.children.length})">Delete</button>
  `;
  
  container.appendChild(newItem);
  newCategoryInput.value = '';
}

function deleteCategory(index) {
  const container = document.getElementById('categoriesList');
  container.children[index].remove();
}

function showStatus(message, type) {
  const notificationBar = document.getElementById('notificationBar');
  const notificationText = document.getElementById('notificationText');
  
  notificationText.textContent = message;
  notificationBar.style.background = type === 'error' ? '#fee2e2' : '#dcfce7';
  notificationBar.style.color = type === 'error' ? '#991b1b' : '#166534';
  
  // Show notification
  notificationBar.classList.add('show');
  
  // Hide after 3 seconds
  setTimeout(() => {
    notificationBar.classList.remove('show');
  }, 3000);
} 