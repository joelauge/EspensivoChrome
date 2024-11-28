// Save settings
document.getElementById('saveBtn').addEventListener('click', async () => {
  const expenseEmail = document.getElementById('expenseEmail').value;
  const serviceType = document.getElementById('serviceType').value;
  const status = document.getElementById('status');

  if (!expenseEmail) {
    status.textContent = 'Please enter an email address';
    status.className = 'error';
    return;
  }

  try {
    await chrome.storage.sync.set({
      expenseEmail: expenseEmail,
      serviceType: serviceType
    });

    status.textContent = 'Settings saved successfully!';
    status.className = 'success';
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
  } catch (error) {
    status.textContent = 'Error saving settings: ' + error.message;
    status.className = 'error';
  }
});

// Load existing settings
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
  
  if (settings.expenseEmail) {
    document.getElementById('expenseEmail').value = settings.expenseEmail;
  }
  if (settings.serviceType) {
    document.getElementById('serviceType').value = settings.serviceType;
  }
}); 