const { onRequest } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const cors = require('cors')({ origin: true });
const nodemailer = require('nodemailer');

// Initialize Firebase Admin
try {
  admin.initializeApp();
  console.log('Firebase Admin initialized');
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

// Export the webhook function
exports.stripeWebhook = onRequest({
  secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
}, async (req, res) => {
  const webhook = require('./webhook');
  return webhook.stripeWebhook(req, res);
});

// Add new checkout endpoint
exports.createCheckoutSession = onRequest({
  secrets: ["STRIPE_SECRET_KEY"]
}, async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  
  try {
    console.log('Creating checkout session with body:', req.body);
    const { productType, extensionId } = req.body;
    
    if (!productType || !extensionId) {
      throw new Error('Missing required fields: productType or extensionId');
    }

    // Set price based on product type
    let priceId;
    switch(productType) {
      case 'capture_pack10':
        priceId = 'price_1QQZJ52SWDYVKZGEiEFAINf5';
        break;
      case 'capture_pack100':
        priceId = 'price_1QQZNz2SWDYVKZGEZ3ZbBvcq';
        break;
      case 'unlimited_sub':
        priceId = 'price_1QQZOy2SWDYVKZGEDWdis8tx';
        break;
      default:
        throw new Error(`Invalid product type: ${productType}`);
    }

    console.log('Creating Stripe session with:', {
      priceId,
      extensionId,
      mode: productType === 'unlimited_sub' ? 'subscription' : 'payment'
    });

    // Create Checkout Session with web URLs
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: productType === 'unlimited_sub' ? 'subscription' : 'payment',
      success_url: `https://espensivo.com/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://espensivo.com/cancel`,
      metadata: {
        extensionId: extensionId
      }
    });

    console.log('Session created successfully:', session.id);
    res.json({ 
      sessionId: session.id,
      checkoutUrl: session.url // Stripe provides a hosted checkout URL
    });
  } catch (error) {
    console.error('Checkout session creation failed:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add new endpoint to check user status
exports.checkUserStatus = onRequest({
  secrets: ["STRIPE_SECRET_KEY"]
}, async (req, res) => {
  console.log('CheckUserStatus called with body:', req.body);
  
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { extensionId } = req.body;
    
    if (!extensionId) {
      console.error('Missing extensionId in request');
      throw new Error('Missing extensionId');
    }

    console.log('Checking Firestore for user:', extensionId);
    
    // Get user data from Firestore
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(extensionId)
      .get();

    if (!userDoc.exists) {
      console.log('No user document found for:', extensionId);
      return res.json({ credits: 0 });
    }

    const userData = userDoc.data();
    console.log('Found user data:', userData);
    
    // Return credits and subscription status
    const response = {
      credits: userData.trialCaptures || 0,
      subscription: userData.hasUnlimitedSubscription || null
    };
    
    console.log('Sending response:', response);
    res.json(response);

  } catch (error) {
    console.error('Error checking user status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new email endpoint
exports.email = onRequest({
  secrets: [
    "ELASTIC_EMAIL_USERNAME",
    "ELASTIC_EMAIL_SMTP_PASSWORD",
    "ELASTIC_EMAIL_FROM_ADDRESS"
  ]
}, async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Create logger
  const logger = {
    level: 'debug', // Set to debug for maximum logging
    debug: (...args) => console.log('[NODEMAILER DEBUG]', ...args),
    info: (...args) => console.log('[NODEMAILER INFO]', ...args),
    warn: (...args) => console.warn('[NODEMAILER WARN]', ...args),
    error: (...args) => console.error('[NODEMAILER ERROR]', ...args)
  };

  try {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const { to, subject, body, attachment } = req.body;
    
    // Create Nodemailer transporter with debug logging
    const transporter = nodemailer.createTransport({
      host: 'smtp.elasticemail.com',  // ElasticMail SMTP server
      port: 2525,                     // ElasticMail port
      secure: false,                  // ElasticMail uses TLS
      auth: {
        user: process.env.ELASTIC_EMAIL_USERNAME,
        pass: process.env.ELASTIC_EMAIL_SMTP_PASSWORD
      },
      debug: true,
      logger: logger
    });

    // Log transport creation
    logger.info('Transporter created');

    // Build email
    const mailOptions = {
      from: process.env.ELASTIC_EMAIL_FROM_ADDRESS,  // Use configured from address
      to: to,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>')
    };

    // Add attachment if present
    if (attachment) {
      logger.debug('Adding attachment:', {
        filename: attachment.filename,
        contentLength: attachment.content.length,
        contentType: attachment.contentType
      });

      mailOptions.attachments = [{
        filename: attachment.filename,
        content: Buffer.from(attachment.content, 'base64'),
        contentType: attachment.contentType
      }];
    }

    // Log email attempt
    logger.info('Attempting to send email:', {
      to: to,
      subject: subject,
      hasAttachment: !!attachment
    });

    // Send mail with detailed error handling
    try {
      const info = await transporter.sendMail(mailOptions);
      logger.info('Email sent successfully:', info);
      res.json({ 
        success: true,
        messageId: info.messageId,
        response: info.response
      });
    } catch (sendError) {
      logger.error('Send error:', {
        error: sendError.message,
        code: sendError.code,
        command: sendError.command,
        response: sendError.response
      });
      throw sendError;
    }

  } catch (error) {
    logger.error('Function error:', error);
    res.status(500).json({ 
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ... rest of your functions ...
