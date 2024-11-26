# Deployment Guide

## Server Requirements
- Node.js 18+
- MongoDB 6.0+
- Docker
- Nginx

## Environment Setup
1. Clone repository
2. Copy `.env.example` to `.env`
3. Configure environment variables:
   ```env
   PORT=3000
   ANTHROPIC_API_KEY=your-api-key
   MONGODB_URI=mongodb://localhost:27017/espensivo
   ```

## Deployment Steps
1. Build Docker image:
   ```bash
   docker-compose build
   ```

2. Start services:
   ```bash
   docker-compose up -d
   ```

3. Monitor logs:
   ```bash
   docker-compose logs -f
   ```

## Monitoring
- Health check endpoint: `/health`
- Usage statistics: `/api/usage/stats`
- Error logs: `/api/usage/errors`

## Backup
Daily backups configured in `backup-logs.sh` 