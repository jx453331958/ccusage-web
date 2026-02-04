#!/bin/bash
set -e

# CCUsage Agent Setup Script
# Automatically configures the agent as a background service

# Installation directory
INSTALL_DIR="$HOME/.ccusage-agent"
AGENT_SCRIPT="$INSTALL_DIR/agent.js"
CONFIG_FILE="$HOME/.ccusage-agent.conf"
SERVICE_NAME="ccusage-agent"
AGENT_URL="https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/agent.js"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

detect_os() {
    case "$(uname -s)" in
        Darwin*) echo "macos" ;;
        Linux*)  echo "linux" ;;
        *)       echo "unknown" ;;
    esac
}

download_agent() {
    mkdir -p "$INSTALL_DIR"

    log_info "Downloading agent.js..."
    if command -v curl &> /dev/null; then
        curl -sL "$AGENT_URL" -o "$AGENT_SCRIPT"
    elif command -v wget &> /dev/null; then
        wget -q "$AGENT_URL" -O "$AGENT_SCRIPT"
    else
        log_error "curl or wget is required"
        exit 1
    fi

    chmod +x "$AGENT_SCRIPT"
    log_info "Agent installed to $AGENT_SCRIPT"
}

check_node() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    log_info "Node.js found: $(node --version)"
}

load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        source "$CONFIG_FILE"
    fi
}

save_config() {
    cat > "$CONFIG_FILE" << EOF
CCUSAGE_SERVER="$CCUSAGE_SERVER"
CCUSAGE_API_KEY="$CCUSAGE_API_KEY"
EOF
    chmod 600 "$CONFIG_FILE"
}

prompt_config() {
    load_config

    echo ""
    echo "=== CCUsage Agent Configuration ==="
    echo ""

    # Read from /dev/tty to support curl | bash execution
    if [[ ! -t 0 ]] && [[ -e /dev/tty ]]; then
        exec < /dev/tty
    fi

    printf "Server URL [%s]: " "$CCUSAGE_SERVER"
    read -r input_server || true
    CCUSAGE_SERVER="${input_server:-$CCUSAGE_SERVER}"

    if [[ -z "$CCUSAGE_SERVER" ]]; then
        log_error "Server URL is required"
        exit 1
    fi

    printf "API Key [%s]: " "${CCUSAGE_API_KEY:+****}"
    read -r input_key || true
    CCUSAGE_API_KEY="${input_key:-$CCUSAGE_API_KEY}"

    if [[ -z "$CCUSAGE_API_KEY" ]]; then
        log_error "API Key is required"
        exit 1
    fi

    save_config
    log_info "Configuration saved to $CONFIG_FILE"
}

# macOS launchd setup
install_macos() {
    local plist_path="$HOME/Library/LaunchAgents/com.ccusage.agent.plist"
    local node_path=$(which node)
    
    cat > "$plist_path" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ccusage.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$node_path</string>
        <string>$AGENT_SCRIPT</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CCUSAGE_SERVER</key>
        <string>$CCUSAGE_SERVER</string>
        <key>CCUSAGE_API_KEY</key>
        <string>$CCUSAGE_API_KEY</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ccusage-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ccusage-agent.error.log</string>
    <key>ThrottleInterval</key>
    <integer>60</integer>
</dict>
</plist>
EOF
    
    launchctl unload "$plist_path" 2>/dev/null || true
    launchctl load "$plist_path"
    
    log_info "LaunchAgent installed: $plist_path"
    log_info "Logs: /tmp/ccusage-agent.log"
}

uninstall_macos() {
    local plist_path="$HOME/Library/LaunchAgents/com.ccusage.agent.plist"
    
    if [[ -f "$plist_path" ]]; then
        launchctl unload "$plist_path" 2>/dev/null || true
        rm -f "$plist_path"
        log_info "LaunchAgent uninstalled"
    else
        log_warn "LaunchAgent not found"
    fi
}

status_macos() {
    if launchctl list | grep -q "com.ccusage.agent"; then
        log_info "Service is running"
        launchctl list | grep "com.ccusage.agent"
    else
        log_warn "Service is not running"
    fi
}

# Linux systemd setup
install_linux() {
    local service_path="$HOME/.config/systemd/user/$SERVICE_NAME.service"
    local node_path=$(which node)
    
    mkdir -p "$(dirname "$service_path")"
    
    cat > "$service_path" << EOF
[Unit]
Description=CCUsage Agent - Claude Code Usage Monitor
After=network.target

[Service]
Type=simple
Environment="CCUSAGE_SERVER=$CCUSAGE_SERVER"
Environment="CCUSAGE_API_KEY=$CCUSAGE_API_KEY"
ExecStart=$node_path $AGENT_SCRIPT
Restart=always
RestartSec=60

[Install]
WantedBy=default.target
EOF
    
    systemctl --user daemon-reload
    systemctl --user enable "$SERVICE_NAME"
    systemctl --user start "$SERVICE_NAME"
    
    log_info "Systemd service installed: $service_path"
    log_info "Check status: systemctl --user status $SERVICE_NAME"
}

uninstall_linux() {
    local service_path="$HOME/.config/systemd/user/$SERVICE_NAME.service"
    
    if [[ -f "$service_path" ]]; then
        systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
        systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "$service_path"
        systemctl --user daemon-reload
        log_info "Systemd service uninstalled"
    else
        log_warn "Systemd service not found"
    fi
}

status_linux() {
    if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "Service is running"
        systemctl --user status "$SERVICE_NAME" --no-pager
    else
        log_warn "Service is not running"
    fi
}

# Cron fallback
install_cron() {
    local cron_cmd="*/5 * * * * CCUSAGE_SERVER=\"$CCUSAGE_SERVER\" CCUSAGE_API_KEY=\"$CCUSAGE_API_KEY\" $(which node) $AGENT_SCRIPT --once >> /tmp/ccusage-agent.log 2>&1"
    
    # Remove existing entry and add new one
    (crontab -l 2>/dev/null | grep -v "ccusage-agent\|$AGENT_SCRIPT"; echo "$cron_cmd") | crontab -
    
    log_info "Cron job installed (runs every 5 minutes)"
    log_info "Logs: /tmp/ccusage-agent.log"
}

uninstall_cron() {
    crontab -l 2>/dev/null | grep -v "ccusage-agent\|$AGENT_SCRIPT" | crontab -
    log_info "Cron job removed"
}

status_cron() {
    if crontab -l 2>/dev/null | grep -q "$AGENT_SCRIPT"; then
        log_info "Cron job is installed:"
        crontab -l | grep "$AGENT_SCRIPT"
    else
        log_warn "Cron job not found"
    fi
}

# Main commands
cmd_install() {
    check_node
    download_agent
    prompt_config

    local os=$(detect_os)
    log_info "Detected OS: $os"
    
    case "$os" in
        macos)
            install_macos
            ;;
        linux)
            if systemctl --user status >/dev/null 2>&1; then
                install_linux
            else
                log_warn "systemd user session not available, falling back to cron"
                install_cron
            fi
            ;;
        *)
            log_warn "Unknown OS, falling back to cron"
            install_cron
            ;;
    esac
    
    echo ""
    log_info "Installation complete!"
    log_info "The agent will now run in the background and report usage every 5 minutes."
}

cmd_uninstall() {
    local os=$(detect_os)
    
    case "$os" in
        macos)
            uninstall_macos
            ;;
        linux)
            uninstall_linux
            ;;
    esac
    
    uninstall_cron
    rm -f "$CONFIG_FILE"
    rm -f "$HOME/.ccusage-agent-state.json"
    rm -rf "$INSTALL_DIR"

    log_info "Uninstall complete"
}

cmd_status() {
    load_config
    
    echo "=== CCUsage Agent Status ==="
    echo ""
    echo "Configuration:"
    echo "  Server: ${CCUSAGE_SERVER:-<not set>}"
    echo "  API Key: ${CCUSAGE_API_KEY:+<configured>}${CCUSAGE_API_KEY:-<not set>}"
    echo ""
    
    local os=$(detect_os)
    case "$os" in
        macos)
            status_macos
            ;;
        linux)
            status_linux
            ;;
    esac
    
    status_cron
}

cmd_run() {
    check_node

    if [[ ! -f "$AGENT_SCRIPT" ]]; then
        download_agent
    fi

    load_config

    if [[ -z "$CCUSAGE_SERVER" ]] || [[ -z "$CCUSAGE_API_KEY" ]]; then
        prompt_config
    fi

    log_info "Running agent once..."
    CCUSAGE_SERVER="$CCUSAGE_SERVER" CCUSAGE_API_KEY="$CCUSAGE_API_KEY" node "$AGENT_SCRIPT" --once
}

cmd_update() {
    log_info "Updating agent..."
    download_agent
    log_info "Update complete. Restart the service to apply changes."
}

cmd_help() {
    echo "CCUsage Agent Setup Script"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  install    Configure and install as background service"
    echo "  uninstall  Remove background service and configuration"
    echo "  status     Show current status"
    echo "  run        Run once (for testing)"
    echo "  update     Update agent.js to latest version"
    echo "  help       Show this help message"
    echo ""
}

# Main entry point
case "${1:-help}" in
    install)   cmd_install ;;
    uninstall) cmd_uninstall ;;
    status)    cmd_status ;;
    run)       cmd_run ;;
    update)    cmd_update ;;
    help|--help|-h) cmd_help ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
