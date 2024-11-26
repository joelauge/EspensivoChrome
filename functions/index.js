const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { onRequest } = require("firebase-functions/v2/https");

const app = express();

// Configure CORS with your actual extension ID
app.use(cors({
  origin: ["chrome-extension://kaijibinmccffbklpdpfchdmopjmlden"],
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Client-Version"],
  optionsSuccessStatus: 200,
  credentials: false
}));

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Define the API key at the top level
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || functions.config().anthropic.key;

// Your analyze endpoint
app.post("/analyze", async (req, res) => {
  try {
    const { image, timestamp, metadata } = req.body;

    console.log('Starting analysis request:', {
      timestamp,
      metadata
    });

    // Call Anthropic API with secured key
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: "You are a receipt analysis expert. Extract key information from receipts and format it as JSON.",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this receipt image and extract the following information in JSON format: total_amount (with currency), date (in YYYY-MM-DD format), vendor_name, and expense_category.",
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: image,
              },
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const analysisResult = await response.json();
    
    // Log the full Claude response
    console.log('Full Claude Response:', JSON.stringify(analysisResult, null, 2));
    
    // Extract JSON from Claude's response
    const jsonMatch = analysisResult.content[0].text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', analysisResult.content[0].text);
      throw new Error('No JSON found in response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    console.log('Extracted Data:', extractedData);
    
    res.json(extractedData);

  } catch (error) {
    console.error("Analysis failed:", error);
    res.status(500).json({
      error: {
        message: "Analysis failed: " + error.message,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// Export with secrets configuration
exports.api = onRequest({ 
  secrets: ["ANTHROPIC_API_KEY"],
  region: 'us-central1',
  memory: '256MiB'
}, app);
