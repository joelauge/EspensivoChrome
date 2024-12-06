document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('archivedReceipts');
  const receiptModal = document.getElementById('receiptModal');
  const reportModal = document.getElementById('reportModal');
  
  try {
    const storage = await chrome.storage.local.get(['archivedReceipts']);
    const receipts = storage.archivedReceipts || [];
    
    if (receipts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Archived Receipts</h3>
          <p>Archived receipts will appear here</p>
        </div>
      `;
      return;
    }

    // Group receipts by month and year
    const grouped = receipts.reduce((acc, receipt) => {
      const date = new Date(receipt.analysis.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(receipt);
      return acc;
    }, {});

    // Sort months in reverse chronological order
    const sortedMonths = Object.keys(grouped).sort().reverse();

    container.innerHTML = sortedMonths.map(month => {
      const [year, monthNum] = month.split('-');
      const monthName = new Date(year, monthNum - 1).toLocaleString('default', { month: 'long' });
      
      return `
        <div class="month-section">
          <div class="month-header">
            <h2>${monthName} ${year}</h2>
            <button class="generate-report-btn" data-month="${month}">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z"/>
              </svg>
              Generate Report
            </button>
          </div>
          <div class="receipt-grid">
            ${grouped[month].map(receipt => `
              <div class="receipt-card" data-receipt='${JSON.stringify(receipt)}'>
                <img src="${receipt.image}" alt="Receipt" class="receipt-image">
                <div class="receipt-details">
                  <div class="receipt-amount">${receipt.analysis.total}</div>
                  <div class="receipt-info">
                    <div>${receipt.analysis.vendor}</div>
                    <div>${receipt.analysis.category}</div>
                    <div>${new Date(receipt.analysis.date).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers for receipt cards
    document.querySelectorAll('.receipt-card').forEach(card => {
      card.addEventListener('click', () => {
        const receipt = JSON.parse(card.dataset.receipt);
        showReceiptDetails(receipt);
      });
    });

    // Add click handlers for generate report buttons
    document.querySelectorAll('.generate-report-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const month = btn.dataset.month;
        generateMonthlyReport(grouped[month], month);
      });
    });

  } catch (error) {
    console.error('Failed to load archived receipts:', error);
    container.innerHTML = `
      <div class="empty-state">
        <h3>Error Loading Receipts</h3>
        <p>Failed to load archived receipts. Please try again.</p>
      </div>
    `;
  }

  // Function to show receipt details
  function showReceiptDetails(receipt) {
    const details = document.getElementById('receiptDetails');
    details.innerHTML = `
      <div class="receipt-details-grid">
        <div class="detail-label">Amount:</div>
        <div class="detail-value">${receipt.analysis.total}</div>
        
        <div class="detail-label">Date:</div>
        <div class="detail-value">${new Date(receipt.analysis.date).toLocaleDateString()}</div>
        
        <div class="detail-label">Vendor:</div>
        <div class="detail-value">${receipt.analysis.vendor}</div>
        
        <div class="detail-label">Category:</div>
        <div class="detail-value">${receipt.analysis.category}</div>
        
        <div class="detail-label">Taxes:</div>
        <div class="detail-value">${receipt.analysis.taxes}</div>
        
        <div class="detail-label">Payment Method:</div>
        <div class="detail-value">${receipt.analysis.payment_method}</div>
      </div>
      <img src="${receipt.image}" alt="Receipt" style="max-width: 100%; border-radius: 4px;">
    `;
    receiptModal.classList.add('active');
  }

  // Function to generate monthly report
  function generateMonthlyReport(receipts, monthKey) {
    const [year, month] = monthKey.split('-');
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    
    // Calculate totals by category
    const categoryTotals = receipts.reduce((acc, receipt) => {
      const category = receipt.analysis.category || 'Uncategorized';
      const amount = parseFloat(receipt.analysis.total.replace(/[^0-9.-]+/g, ''));
      acc[category] = (acc[category] || 0) + amount;
      return acc;
    }, {});

    // Calculate grand total
    const grandTotal = Object.values(categoryTotals).reduce((sum, amount) => sum + amount, 0);

    const reportContent = document.getElementById('reportContent');
    reportContent.innerHTML = `
      <h3>${monthName} ${year} Expense Summary</h3>
      <div class="category-summary">
        ${Object.entries(categoryTotals).map(([category, total]) => `
          <div class="category-row">
            <div>${category}</div>
            <div>$${total.toFixed(2)}</div>
          </div>
        `).join('')}
        <div class="category-row total-row">
          <div>Total</div>
          <div>$${grandTotal.toFixed(2)}</div>
        </div>
      </div>
    `;
    reportModal.classList.add('active');
  }

  // Add modal close handlers
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      receiptModal.classList.remove('active');
      reportModal.classList.remove('active');
    });
  });

  // Close modals when clicking outside
  [receiptModal, reportModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });
}); 