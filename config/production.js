module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: 'api.espensivo.com'
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-haiku-20240307'
  },
  logging: {
    level: 'info',
    filename: 'logs/espensivo-server.log'
  },
  security: {
    allowedOrigins: [
      'chrome-extension://your-extension-id'
    ]
  }
}; 