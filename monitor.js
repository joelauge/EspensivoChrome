const winston = require('winston');
const logger = require('./logger');

// Monitor API usage and rate limits
function monitorAPIUsage(req, res, next) {
  const start = Date.now();
  
  // Get rate limit info
  const rateLimitRemaining = res.getHeader('RateLimit-Remaining');
  const rateLimitLimit = res.getHeader('RateLimit-Limit');
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('API Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      clientVersion: req.headers['x-client-version'],
      extensionId: req.headers['x-extension-id'],
      rateLimitRemaining,
      rateLimitLimit
    });

    // Log warning if getting close to rate limit
    if (rateLimitRemaining < rateLimitLimit * 0.1) { // Less than 10% remaining
      logger.warn('Rate limit running low', {
        extensionId: req.headers['x-extension-id'],
        remaining: rateLimitRemaining,
        limit: rateLimitLimit
      });
    }
  });
  next();
}

module.exports = { monitorAPIUsage }; 