#!/bin/bash

# Check server health
curl -f http://localhost:3000/health || echo "Server is down!"

# Check logs for errors
docker-compose logs --tail=100 | grep -i error

# Check memory usage
docker stats --no-stream espensivo-server 