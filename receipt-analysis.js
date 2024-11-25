async function analyzeReceipt(imageData) {
  try {
    const response = await fetch('https://espensivo.com/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageData,
        model: 'claude-3-haiku'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to analyze receipt');
    }

    const analysis = await response.json();
    showAnalysisResults(analysis);
  } catch (error) {
    console.error('Error analyzing receipt:', error);
    showError(error.message);
  }
}

function showAnalysisResults(analysis) {
  const resultsDiv = document.createElement('div');
  resultsDiv.className = 'analysis-results';
  resultsDiv.innerHTML = `
    <div class="receipt-summary">
      <h3>Receipt Analysis</h3>
      <div class="receipt-details">
        <div class="detail">
          <span class="label">Total Amount:</span>
          <span class="value">${analysis.total}</span>
        </div>
        <div class="detail">
          <span class="label">Date:</span>
          <span class="value">${analysis.date}</span>
        </div>
        <div class="detail">
          <span class="label">Vendor:</span>
          <span class="value">${analysis.vendor}</span>
        </div>
        <div class="detail">
          <span class="label">Category:</span>
          <span class="value">${analysis.category}</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(resultsDiv);
} 