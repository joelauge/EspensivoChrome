async function createReceiptPDF(receipt) {
  // Import jsPDF dynamically
  const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const doc = new jsPDF();
  
  // Add receipt image
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = receipt.image;
  });
  
  // Calculate dimensions to fit the page
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const imgRatio = img.width / img.height;
  let imgWidth = pageWidth - 40; // 20px margin on each side
  let imgHeight = imgWidth / imgRatio;
  
  // Add receipt image
  doc.addImage(receipt.image, 'PNG', 20, 20, imgWidth, imgHeight);
  
  // Add metadata below image
  let y = imgHeight + 40;
  doc.setFontSize(12);
  doc.text(`Vendor: ${receipt.analysis.vendor}`, 20, y);
  doc.text(`Amount: ${receipt.analysis.total}`, 20, y + 10);
  doc.text(`Date: ${receipt.analysis.date}`, 20, y + 20);
  doc.text(`Category: ${receipt.analysis.category}`, 20, y + 30);
  if (receipt.analysis.payment_method) {
    doc.text(`Payment Method: ${receipt.analysis.payment_method}`, 20, y + 40);
  }
  
  return doc.output('blob');
}

async function sendEmail(emailData) {
  // Get email service settings
  const settings = await chrome.storage.sync.get(['serviceType', 'expenseEmail']);
  
  // Create form data for the email
  const formData = new FormData();
  formData.append('to', settings.expenseEmail);
  formData.append('subject', emailData.subject);
  formData.append('body', emailData.body);
  formData.append('attachment', emailData.attachments[0].content, 'receipt.pdf');
  
  // Send to your email service endpoint
  const response = await fetch('https://espensivo.com/api/send-email', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    throw new Error('Failed to send email');
  }
  
  return response.json();
}

// Export functions
window.createReceiptPDF = createReceiptPDF;
window.sendEmail = sendEmail; 