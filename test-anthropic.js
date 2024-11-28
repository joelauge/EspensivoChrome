import 'dotenv/config';
import fetch from 'node-fetch';

async function testAnthropicAPI() {
  try {
    // Sample base64 image - replace with a small test receipt image
    const sampleImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    console.log('Testing Anthropic API...');
    console.log('API Key available:', !!process.env.ANTHROPIC_API_KEY);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: "You are a receipt analysis expert. Extract key information from receipts and format it as JSON.",
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please analyze this receipt image and extract the following information in JSON format: total_amount (with currency), date (in YYYY-MM-DD format), vendor_name, and expense_category.'
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: sampleImage
              }
            }
          ]
        }]
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    const data = await response.text();
    console.log('Raw response:', data);

    if (response.ok) {
      const json = JSON.parse(data);
      console.log('Parsed response:', JSON.stringify(json, null, 2));
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAnthropicAPI(); 