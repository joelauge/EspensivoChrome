#!/bin/bash

# Create backup directory
BACKUP_DIR="backups/$(date +%Y-%m-%d)"
mkdir -p $BACKUP_DIR

# Backup logs
cp logs/*.log $BACKUP_DIR/

# Compress backup
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR

# Clean up old backups (keep last 7 days)
find backups/ -type f -name '*.tar.gz' -mtime +7 -delete 