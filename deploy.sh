#!/bin/bash

# Build the Docker image
docker build -t espensivo-server .

# Run the container
docker run -d \
  --name espensivo-server \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  espensivo-server 