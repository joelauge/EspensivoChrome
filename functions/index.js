const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const nodemailer = require('nodemailer');
const multer = require('multer');
const Stripe = require('stripe');
const upload = multer({ storage: multer.memoryStorage() });
const admin = require('firebase-admin');
const { OAuth2Client } = require('google-auth-library');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

// Initialize Firebase Admin
try {
  admin.initializeApp();
  console.log('Firebase Admin initialized');
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

// Initialize the api object
exports.api = {};

// Add Firebase token exchange endpoint
exports.createFirebaseToken = onRequest({
  cors: true,
}, async (req, res) => {
  console.log('Received token exchange request');

  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { token } = req.body;
    if (!token) {
      throw new Error('No token provided');
    }

    // Create OAuth2 client
    const oAuth2Client = new OAuth2Client();

    // Verify the Google OAuth token
    const ticket = await oAuth2Client.verifyIdToken({
      idToken: token,
      audience: '282331992610-aqvvs0u2kk0d9jk0s7g9f1p3jtqm4l7q.apps.googleusercontent.com' // Your client ID
    });

    const payload = ticket.getPayload();
    const userId = payload.sub; // Google User ID
    const email = payload.email;

    // Create or update Firebase user
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        firebaseUser = await admin.auth().createUser({
          email: email,
          emailVerified: payload.email_verified,
          uid: userId
        });
      } else {
        throw error;
      }
    }

    // Create a custom token
    const firebaseToken = await admin.auth().createCustomToken(userId);

    console.log('Successfully created Firebase token for user:', email);
    res.json({ firebaseToken });
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(400).json({
      error: error.message
    });
  }
});

// Add the handler
exports.analyze = onRequest({
  environmentVariables: ['ANTHROPIC_API_KEY'],
  memory: '256MB',
  timeoutSeconds: 60,
  cors: true
}, async (req, res) => {
  console.log('Received request:', {
    path: req.path,
    method: req.method,
    headers: req.headers,
    bodyLength: req.body ? JSON.stringify(req.body).length : 0
  });

  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    res.status(204).send('');
    return;
  }

  // Handle token request
  if (req.path === '/token' && req.method === 'POST') {
    try {
      const { extensionId, timestamp } = req.body;
      
      if (!extensionId) {
        throw new Error('Extension ID is required');
      }
      
      // Generate a temporary token (valid for 5 minutes)
      const token = Buffer.from(`${extensionId}:${Date.now()}`).toString('base64');
      
      res.json({
        token,
        anthropicEndpoint: 'https://api.anthropic.com/v1/messages'
      });
      return;
    } catch (error) {
      console.error('Token generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
      return;
    }
  }

  // Only handle POST requests to /analyze
  if (req.method !== 'POST') {
    console.log('Invalid path or method:', { path: req.path, method: req.method });
    res.status(404).json({
      success: false,
      error: 'Not found'
    });
    return;
  }

  try {
    const { image } = req.body;
    console.log('Request body keys:', Object.keys(req.body));
    if (!image) {
      console.log('No image data in request body:', req.body);
      throw new Error('No image data provided');
    }

    console.log('Calling Anthropic API with image data length:', image.length);

    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('Environment variables:', {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : 'not set',
      NODE_ENV: process.env.NODE_ENV,
      FUNCTION_TARGET: process.env.FUNCTION_TARGET
    });

    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY environment variable not set');
      throw new Error('Anthropic API key not configured');
    }
    console.log('API Key available:', !!apiKey);

    console.log('Making Anthropic API request...');
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    console.log('Request headers:', headers);

    // Call Anthropic API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: `You are a receipt analysis expert. Extract key information from receipts and format it as JSON. 
        CRITICAL INSTRUCTIONS FOR TAX EXTRACTION:
        1. Look for tax information in this exact order:
          a) First look for explicit tax amounts with labels like:
             - "Tax:" or "Tax Amount:"
             - "GST:" or "GST Amount:"
             - "HST:" or "HST Amount:"
             - "VAT:" or "Sales Tax:"
          b) If a GST/HST number is present (e.g., "GST# R103382461") but no explicit tax amount,
             calculate tax based on standard rates:
             - For Canadian GST: 5% of subtotal
             - For Canadian HST: 13% of subtotal
          c) Only return "$0.00" if you've thoroughly checked and confirmed no tax information exists
          d) Always include the proper currency symbol (e.g., "$", "C$", "£")
        
        2. CATEGORY DETERMINATION:
          Use these exact categories only:
          - "Software & Subscriptions" for software/digital services
          - "Equipment" for music stores/instruments
          - "Meals & Entertainment" for restaurants/cafes
          - Other categories as provided
          
        3. RESPONSE FORMAT:
          Always return this exact JSON structure:
          {
            "total_amount": "amount with currency symbol",
            "date": "YYYY-MM-DD",
            "vendor_name": "exact vendor name",
            "expense_category": "matching category from list above",
            "taxes": "tax amount with currency symbol (calculate if GST/HST number present)"
          }
          Never omit any fields. Calculate tax if GST/HST number exists.`,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this receipt and return a JSON object with these EXACT fields:
              {
                "total_amount": "Include currency symbol",
                "date": "YYYY-MM-DD format",
                "vendor_name": "Exact vendor name",
                "expense_category": "Must match provided categories",
                "taxes": "Exact tax amount with currency symbol"
              }
              DO NOT OMIT TAX IF PRESENT. DO NOT DEFAULT TO MEALS CATEGORY.
              ${req.body.customCategories ? `Also consider these custom categories: ${req.body.customCategories.join(', ')}` : ''}`
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: image
              }
            }
          ]
        }]
      })
    });

    console.log('Anthropic API response status:', anthropicResponse.status);
    console.log('Anthropic API response headers:', Object.fromEntries(anthropicResponse.headers));

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('Anthropic API error details:', errorText);
      throw new Error(`Anthropic API error: ${anthropicResponse.status} - ${errorText}`);
    }

    const analysisResult = await anthropicResponse.json();
    console.log('Successfully received Anthropic analysis');

    // Extract the JSON from Anthropic's text response
    const jsonText = analysisResult.content[0].text;
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not find JSON in Anthropic response');
    }
    
    const extractedData = JSON.parse(jsonMatch[0]);

    res.json({
      success: true,
      data: extractedData
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

exports.email = onRequest({
  secrets: [
    "ELASTIC_EMAIL_USERNAME",
    "ELASTIC_EMAIL_SMTP_PASSWORD",
    "ELASTIC_EMAIL_FROM_ADDRESS"
  ]
}, async (req, res) => {
  console.log('email: Starting email function...');
  
  try {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Check environment variables
    if (!process.env.ELASTIC_EMAIL_USERNAME || 
        !process.env.ELASTIC_EMAIL_SMTP_PASSWORD || 
        !process.env.ELASTIC_EMAIL_FROM_ADDRESS) {
      throw new Error('Missing email configuration');
    }

    const { to, subject, body, attachment } = req.body;
    
    if (!to || !subject || !body) {
      throw new Error('Missing required email fields');
    }

    const transportConfig = {
      host: 'smtp.elasticemail.com',
      port: 2525,
      secure: false,
      auth: {
        user: process.env.ELASTIC_EMAIL_USERNAME,
        pass: process.env.ELASTIC_EMAIL_SMTP_PASSWORD
      }
    };

    const transporter = nodemailer.createTransport(transportConfig);
    await transporter.verify();

    // Create email options
    const mailOptions = {
      from: process.env.ELASTIC_EMAIL_FROM_ADDRESS,
      to,
      subject,
      html: body
    };

    // Add attachment if present
    if (attachment) {
      mailOptions.attachments = [{
        filename: attachment.filename,
        content: Buffer.from(attachment.content, 'base64'),
        contentType: attachment.contentType
      }];
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('email: Message sent successfully:', info.messageId);
    
    res.json({ 
      success: true, 
      messageId: info.messageId 
    });

  } catch (error) {
    console.error('email: Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message,
      code: error.code
    });
  }
});

// Create checkout session endpoint
exports.createCheckoutSession = onRequest({
  cors: true,
  secrets: ["STRIPE_SECRET_KEY"]
}, async (req, res) => {
  console.log('Received checkout request');

  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { priceId, mode, extensionId, userId } = req.body;

    if (!priceId || !mode || !extensionId || !userId) {
      throw new Error('Missing required fields');
    }

    // Create success and cancel URLs for Chrome extension
    const successUrl = `chrome-extension://${extensionId}/checkout-complete.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `chrome-extension://${extensionId}/popup.html`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        extensionId: extensionId
      },
      line_items: [{
        price: priceId,
        quantity: 1
      }]
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Stripe webhook endpoint
exports.stripeWebhook = onRequest({
  cors: false
}, async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        
        // Update user's subscription status
        await admin.firestore().collection('users').doc(session.client_reference_id).set({
          subscription: {
            active: true,
            type: session.mode === 'subscription' ? 'unlimited' : 'credits',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }
        }, { merge: true });

        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});
