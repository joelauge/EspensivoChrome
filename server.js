const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const connectDB = require('./db/connection');
const Usage = require('./models/Usage');
require('dotenv').config();

// Connect to MongoDB
connectDB();

const app = express();

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: {
      message: 'Too many requests, please try again later.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Use extension ID as key for rate limiting
    return req.headers['x-extension-id'] || req.ip;
  },
  handler: (req, res) => {
    console.error('Rate limit exceeded:', {
      timestamp: new Date().toISOString(),
      extensionId: req.headers['x-extension-id'],
      ip: req.ip
    });
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later.',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Apply rate limiting to all routes
app.use(limiter);

// Configure CORS to accept requests from your extension
app.use(cors({
  origin: [
    'chrome-extension://kaijibinmccffbklpdpfchdmopjmlden',  // Your extension ID
    'chrome-extension://localhost'  // For local development
  ],
  methods: ['POST', 'OPTIONS'],  // Add OPTIONS for preflight
  allowedHeaders: [
    'Content-Type',
    'x-client-version',
    'x-extension-id'
  ],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Add preflight handler
app.options('*', cors());  // Enable preflight for all routes

app.use(bodyParser.json({ limit: '10mb' })); // Increase limit for base64 images

// Error logging middleware
app.use((err, req, res, next) => {
  console.error('Error:', {
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
    requestBody: req.body,
    clientVersion: req.headers['x-client-version'],
    userAgent: req.headers['user-agent']
  });
  next(err);
});

app.post('/analyze', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { image, timestamp, metadata } = req.body;
    const extensionId = req.headers['x-extension-id'];

    // Create usage record
    const usage = new Usage({
      extensionId,
      action: 'analyze',
      metadata: {
        imageSize: image.length,
        userAgent: req.headers['user-agent'],
        clientVersion: req.headers['x-client-version']
      }
    });

    console.log('Received analysis request:', {
      timestamp,
      imageSize: image.length,
      metadata
    });

    // Call Anthropic API with your secured API key
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
                data: image
              }
            }
          ]
        }]
      })
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
    console.log('Analysis successful:', {
      timestamp,
      responseLength: JSON.stringify(analysisResult).length
    });

    // Update usage record with success
    usage.status = 'success';
    usage.metadata.processingTime = Date.now() - startTime;
    usage.apiResponse = {
      statusCode: response.status,
      responseTime: Date.now() - startTime,
      tokensUsed: analysisResult.usage?.total_tokens
    };
    await usage.save();

    res.json(analysisResult);

  } catch (error) {
    console.error('Analysis failed:', {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: {
        message: 'Analysis failed: ' + error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Add these endpoints after your existing routes

// Get usage statistics
app.get('/api/usage/stats', async (req, res) => {
  try {
    const stats = await Usage.aggregate([
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          successfulRequests: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          averageProcessingTime: { $avg: '$metadata.processingTime' },
          totalTokensUsed: { $sum: '$apiResponse.tokensUsed' }
        }
      }
    ]);

    res.json(stats[0] || {
      totalRequests: 0,
      successfulRequests: 0,
      averageProcessingTime: 0,
      totalTokensUsed: 0
    });
  } catch (error) {
    logger.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

// Get recent usage
app.get('/api/usage/recent', async (req, res) => {
  try {
    const recentUsage = await Usage.find()
      .sort({ timestamp: -1 })
      .limit(100)
      .select('-__v');

    res.json(recentUsage);
  } catch (error) {
    logger.error('Error fetching recent usage:', error);
    res.status(500).json({ error: 'Failed to fetch recent usage' });
  }
});

// Get usage by extension ID
app.get('/api/usage/extension/:id', async (req, res) => {
  try {
    const extensionUsage = await Usage.find({ extensionId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(50)
      .select('-__v');

    res.json(extensionUsage);
  } catch (error) {
    logger.error('Error fetching extension usage:', error);
    res.status(500).json({ error: 'Failed to fetch extension usage' });
  }
});

// Get error reports
app.get('/api/usage/errors', async (req, res) => {
  try {
    const errors = await Usage.find({ status: 'error' })
      .sort({ timestamp: -1 })
      .limit(100)
      .select('timestamp extensionId metadata.errorMessage metadata.userAgent');

    res.json(errors);
  } catch (error) {
    logger.error('Error fetching error reports:', error);
    res.status(500).json({ error: 'Failed to fetch error reports' });
  }
});

// Get daily usage summary
app.get('/api/usage/daily', async (req, res) => {
  try {
    const dailyStats = await Usage.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          requests: { $sum: 1 },
          successfulRequests: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          tokensUsed: { $sum: '$apiResponse.tokensUsed' },
          averageProcessingTime: { $avg: '$metadata.processingTime' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
      { $limit: 30 }
    ]);

    res.json(dailyStats);
  } catch (error) {
    logger.error('Error fetching daily usage:', error);
    res.status(500).json({ error: 'Failed to fetch daily usage' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 