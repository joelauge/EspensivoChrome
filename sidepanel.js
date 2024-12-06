document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI
  loadReceipts();
  
  // Set up event listeners
  document.getElementById('captureBtn').addEventListener('click', async () => {
    const tab = await getCurrentTab();
    const settings = await chrome.storage.sync.get(['expenseEmail', 'serviceType']);
    
    chrome.runtime.sendMessage({
      action: 'startCapture',
      tabId: tab.id,
      settings: settings
    });
  });

  // ... rest of the event listeners
}); 