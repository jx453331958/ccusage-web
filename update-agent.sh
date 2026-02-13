#!/bin/bash
set -e

# CCUsage Web - Agent Update Script
# Run this on each device where the agent is deployed

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${GREEN}[1/3]${NC} Pulling latest code..."
git pull

echo -e "${GREEN}[2/3]${NC} Clearing agent state (will re-scan all data with cache tokens)..."
STATE_FILE="$HOME/.ccusage-agent-state.json"
if [ -f "$STATE_FILE" ]; then
    rm "$STATE_FILE"
    echo -e "  ${YELLOW}Removed $STATE_FILE${NC}"
else
    echo -e "  ${YELLOW}No state file found, fresh start.${NC}"
fi

echo -e "${GREEN}[3/3]${NC} Restarting agent..."
# Try common process managers
if command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q ccusage-agent; then
    pm2 restart ccusage-agent
    echo -e "${GREEN}✅ Restarted via PM2${NC}"
elif command -v systemctl &>/dev/null && systemctl is-active --quiet ccusage-agent 2>/dev/null; then
    sudo systemctl restart ccusage-agent
    echo -e "${GREEN}✅ Restarted via systemd${NC}"
else
    # Kill existing agent and restart
    pkill -f "agent.py.*ccusage" 2>/dev/null && echo -e "  ${YELLOW}Killed old agent process${NC}" || true
    pkill -f "agent.js.*ccusage" 2>/dev/null || true
    
    # Auto-detect runtime and start
    if command -v python3 &>/dev/null; then
        echo -e "  Starting agent with Python..."
        nohup python3 agent/agent.py > /tmp/ccusage-agent.log 2>&1 &
    elif command -v node &>/dev/null; then
        echo -e "  Starting agent with Node.js..."
        nohup node agent/agent.js > /tmp/ccusage-agent.log 2>&1 &
    else
        echo -e "${YELLOW}⚠️  No Python or Node.js found. Please start the agent manually.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Agent started (PID: $!, log: /tmp/ccusage-agent.log)${NC}"
fi

echo -e "${GREEN}✅ Agent update complete! It will re-scan and upload all data with cache tokens.${NC}"
