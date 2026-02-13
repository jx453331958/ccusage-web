#!/bin/bash
set -e

# CCUsage Web - Server Update Script
# Run this on your VPS where the server is deployed

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}[1/5]${NC} Pulling latest code..."
git pull

echo -e "${GREEN}[2/5]${NC} Installing dependencies..."
npm install

echo -e "${GREEN}[3/5]${NC} Building..."
npm run build

echo -e "${GREEN}[4/5]${NC} Clearing old usage data (cache tokens were missing)..."
if [ -f data/ccusage.db ]; then
    sqlite3 data/ccusage.db "DELETE FROM usage_records;" 2>/dev/null && \
        echo -e "  ${YELLOW}Cleared usage_records. API keys preserved.${NC}" || \
        echo -e "  ${YELLOW}sqlite3 not found, skipping DB cleanup. Run manually if needed.${NC}"
else
    echo -e "  ${YELLOW}No database found, will be created on first run.${NC}"
fi

echo -e "${GREEN}[5/5]${NC} Restarting service..."
if command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q ccusage; then
    pm2 restart ccusage-web
    echo -e "${GREEN}✅ Restarted via PM2${NC}"
elif [ -f docker-compose.yml ] && command -v docker &>/dev/null; then
    docker compose up -d --build
    echo -e "${GREEN}✅ Restarted via Docker${NC}"
else
    echo -e "${YELLOW}⚠️  Could not auto-restart. Please restart the service manually.${NC}"
fi

echo -e "${GREEN}✅ Server update complete!${NC}"
