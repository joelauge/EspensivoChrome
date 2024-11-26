#!/bin/bash

# Stop and remove existing containers
docker-compose down

# Pull latest changes
git pull origin main

# Build and start containers
docker-compose up -d --build

# Check logs
docker-compose logs -f 