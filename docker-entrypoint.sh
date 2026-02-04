#!/bin/sh
set -e

# Fix permissions on data directory if running as root
if [ "$(id -u)" = "0" ]; then
  chown -R nextjs:nodejs /app/data 2>/dev/null || true
  exec su-exec nextjs:nodejs node server.js
else
  exec node server.js
fi
