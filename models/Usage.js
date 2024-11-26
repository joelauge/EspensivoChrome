const mongoose = require('mongoose');

const UsageSchema = new mongoose.Schema({
  extensionId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  action: {
    type: String,
    enum: ['analyze', 'email', 'capture'],
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'error'],
    required: true
  },
  metadata: {
    imageSize: Number,
    processingTime: Number,
    errorMessage: String,
    userAgent: String,
    clientVersion: String
  },
  apiResponse: {
    statusCode: Number,
    responseTime: Number,
    tokensUsed: Number
  }
});

// Add indexes for common queries
UsageSchema.index({ timestamp: -1 });
UsageSchema.index({ action: 1, status: 1 });

module.exports = mongoose.model('Usage', UsageSchema); 