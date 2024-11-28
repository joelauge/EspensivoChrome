const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const nodemailer = require('nodemailer');
const multer = require('multer');
const Stripe = require('stripe');
const upload = multer({ storage: multer.memoryStorage() });
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

// Initialize Firebase Admin
try {
  admin.initializeApp();
  console.log('Firebase Admin initialized');
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

// Initialize the api object
exports.api = {};

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

exports.email = onRequest(async (req, res) => {
  try {
    const { to, subject, body, attachment } = req.body;

    // Prepare the email data for Elastic Email API
    const emailData = {
      Recipients: [{ Email: to }],
      Subject: subject,
      Body: [{
        ContentType: "HTML",
        Content: body
      }],
      Attachments: [{
        BinaryContent: attachment.content,
        Name: "receipt.png",
        ContentType: "image/png"
      }]
    };

    // Send via Elastic Email API
    const response = await fetch('https://api.elasticemail.com/v4/emails/transactional', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ElasticEmail-ApiKey': process.env.ELASTIC_EMAIL_API_KEY || '9832415EEE54D602A0E80C860017668295C2'
      },
      body: JSON.stringify(emailData)
    });

    // Log response for debugging
    const responseText = await response.text();
    console.log('Elastic Email API response:', responseText);

    if (!response.ok) {
      throw new Error(`Elastic Email API error: ${response.statusText} - ${responseText}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Email sending failed:', error);
    res.status(500).json({ 
      success: false, 
      error: { message: error.message } 
    });
  }
});
