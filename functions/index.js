const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const nodemailer = require('nodemailer');
const { onRequest } = require("firebase-functions/v2/https");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();

// Enable trust proxy to work with Firebase Functions
app.set('trust proxy', 1);

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.error('Rate limit exceeded:', {
      ip: req.ip,
      realIP: req.headers['x-real-ip'],
      forwardedFor: req.headers['x-forwarded-for'],
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later',
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.use(limiter);

// Define the API key at the top level
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || functions.config().anthropic.key;

// Create SMTP transporter with ElasticEmail settings
const transporter = nodemailer.createTransport({
  host: 'smtp.elasticemail.com',
  port: 2525,
  secure: false,
  auth: {
    user: 'updateemailserver@espensivo.com',
    pass: '9832415EEE54D602A0E80C860017668295C2'
  }
});

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

// Update the send-email endpoint to use multer
app.post("/send-email", upload.single('attachment'), async (req, res) => {
  const startTime = Date.now();
  console.log('Email request received at:', new Date().toISOString());
  
  try {
    console.log('Parsing form data...');
    const { to, subject, body } = req.body;
    const attachment = req.file;

    console.log('Email request details:', {
      to: to,
      subject: subject,
      bodyLength: body?.length,
      hasAttachment: !!attachment,
      attachmentSize: attachment?.size || 'no attachment',
      contentType: attachment?.mimetype,
      headers: req.headers
    });

    // Validate inputs
    if (!to || !subject || !body || !attachment) {
      console.error('Missing required fields:', {
        hasTo: !!to,
        hasSubject: !!subject,
        hasBody: !!body,
        hasAttachment: !!attachment
      });
      throw new Error('Missing required email fields');
    }

    console.log('Creating email with attachment...');
    
    // Log SMTP configuration
    console.log('SMTP Configuration:', {
      host: 'smtp.elasticemail.com',
      port: 2525,
      secure: false,
      hasAuth: !!(process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD)
    });

    // Send email using SMTP with detailed logging
    console.log('Attempting to send email via SMTP...');
    const info = await transporter.sendMail({
      from: '"Espensivo Receipts" <receipts@espensivo.com>',
      to: to,
      subject: subject,
      text: body,
      attachments: [{
        filename: 'receipt.pdf',
        content: attachment.buffer,
        contentType: 'application/pdf'
      }]
    });

    const endTime = Date.now();
    console.log('Email sent successfully:', {
      messageId: info.messageId,
      response: info.response,
      processingTime: endTime - startTime + 'ms',
      timestamp: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      messageId: info.messageId,
      processingTime: endTime - startTime
    });

  } catch (error) {
    console.error('Email sending failed:', {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        response: error.response
      },
      requestInfo: {
        headers: req.headers,
        url: req.url,
        method: req.method
      }
    });

    res.status(500).json({
      error: {
        message: 'Failed to send email: ' + error.message,
        details: error.stack,
        code: error.code,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Export with secrets configuration
exports.api = onRequest({ 
  secrets: ["ANTHROPIC_API_KEY"],
  region: 'us-central1',
  memory: '256MiB'
}, app);
