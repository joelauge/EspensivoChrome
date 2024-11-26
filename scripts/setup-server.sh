#!/bin/bash

# Install required packages
apt-get update
apt-get install -y nginx docker.io docker-compose

# Setup SSL with Let's Encrypt
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d api.espensivo.com --non-interactive --agree-tos -m your@email.com

# Setup log rotation
cat > /etc/logrotate.d/espensivo << EOF
/var/log/espensivo/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
}
EOF 