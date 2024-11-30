function log(message, type = 'info') {
  console.log(message); // Still log to console
  if (window.logDebug) {
    window.logDebug(message, type);
  }
}

async function createReceiptPDF(receipt) {
  try {
    log('Starting PDF creation...');
    
    if (!receipt || !receipt.image) {
      throw new Error('Invalid receipt data');
    }

    // Create standard A4 PDF
    const doc = new window.jspdf.jsPDF();
    log('PDF document created');

    // Load and verify image
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = receipt.image;
    });
    log('Image loaded:', { width: img.width, height: img.height });

    // Calculate dimensions
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - (2 * margin);
    const maxHeight = pageHeight - (2 * margin) - 100;

    // Calculate image dimensions maintaining aspect ratio
    let imgWidth = maxWidth;
    let imgHeight = (img.height * maxWidth) / img.width;

    if (imgHeight > maxHeight) {
      imgHeight = maxHeight;
      imgWidth = (img.width * maxHeight) / img.height;
    }

    // Center the image horizontally
    const x = margin + (maxWidth - imgWidth) / 2;

    // Clean up image data
    const imageData = receipt.image.startsWith('data:') 
      ? receipt.image 
      : `data:image/png;base64,${receipt.image}`;

    try {
      // Add the image using the same format for both versions
      doc.addImage(
        imageData,
        'PNG',
        x,
        margin,
        imgWidth,
        imgHeight
      );
      log('Image added to PDF');
    } catch (imgError) {
      log('Error adding image:', imgError);
      throw new Error('Failed to add image: ' + imgError.message);
    }

    // Add metadata
    const textY = margin + imgHeight + 20;
    doc.setFontSize(12);
    doc.setTextColor(0);

    const metadata = [
      { label: 'Vendor', value: receipt.analysis.vendor },
      { label: 'Amount', value: receipt.analysis.total },
      { label: 'Date', value: receipt.analysis.date },
      { label: 'Category', value: receipt.analysis.category },
      { label: 'Payment Method', value: receipt.analysis.payment_method }
    ];

    metadata.forEach((item, index) => {
      if (item.value) {
        doc.text(`${item.label}: ${item.value}`, margin, textY + (index * 10));
      }
    });
    log('Metadata added');

    // Create a Blob from the PDF and convert to base64
    const pdfBlob = doc.output('blob');
    const base64Data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(pdfBlob);
    });

    log('Generated PDF data for email');

    return {
      content: base64Data,
      filename: `receipt-${Date.now()}.pdf`,
      contentType: 'application/pdf'
    };

  } catch (error) {
    log('Error creating PDF:', error, 'error');
    throw error;
  }
}

// Helper function to verify blob content
async function verifyBlob(blob) {
  try {
    const base64 = await blobToBase64(blob);
    return {
      isValid: base64.length > 0,
      size: blob.size,
      base64Length: base64.length
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    };
  }
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function sendEmail(emailData) {
  try {
    const settings = await chrome.storage.sync.get(['serviceType', 'expenseEmail']);
    
    if (!settings.expenseEmail) {
      throw new Error('Email settings not configured');
    }

    const requestBody = {
      to: settings.expenseEmail,
      subject: emailData.subject,
      body: emailData.body
    };

    if (emailData.attachments?.[0]) {
      const attachment = emailData.attachments[0];
      
      // Log attachment data for debugging
      log('Attachment data:', {
        hasContent: !!attachment.content,
        contentType: typeof attachment.content,
        filename: attachment.filename
      });

      // Verify content is a string
      if (typeof attachment.content !== 'string') {
        throw new Error('PDF content must be a string, got: ' + typeof attachment.content);
      }

      requestBody.attachment = {
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType
      };
      
      log('Added attachment to request:', {
        filename: attachment.filename,
        contentLength: attachment.content.length
      });
    }

    // Log final request body structure
    log('Final request body:', {
      to: requestBody.to,
      subject: requestBody.subject,
      hasBody: !!requestBody.body,
      hasAttachment: !!requestBody.attachment,
      attachmentType: requestBody.attachment ? typeof requestBody.attachment.content : null
    });

    const response = await fetch('https://us-central1-espensivo.cloudfunctions.net/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to send email: ${errorData.details || errorData.error || response.statusText}`);
    }
    
    return response.json();

  } catch (error) {
    log('Email sending error:', error, 'error');
    throw error;
  }
}

// Export functions
window.createReceiptPDF = createReceiptPDF;
window.sendEmail = sendEmail; 