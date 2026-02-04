#!/bin/bash
set -e

# CCUsage Agent Setup Script
# Automatically configures the agent as a background service

# Installation directory
INSTALL_DIR="$HOME/.ccusage-agent"
CONFIG_FILE="$HOME/.ccusage-agent.conf"
SERVICE_NAME="ccusage-agent"

# Agent URLs
AGENT_PY_URL="https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/agent.py"
AGENT_JS_URL="https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/agent.js"

# Will be set by detect_runtime
AGENT_SCRIPT=""
AGENT_RUNTIME=""
RUNTIME_PATH=""

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

detect_runtime() {
    # Prefer Python 3 over Node.js
    if command -v python3 &> /dev/null; then
        AGENT_RUNTIME="python"
        RUNTIME_PATH=$(which python3)
        AGENT_SCRIPT="$INSTALL_DIR/agent.py"
        log_info "Using Python: $($RUNTIME_PATH --version)"
        return 0
    elif command -v node &> /dev/null; then
        AGENT_RUNTIME="node"
        RUNTIME_PATH=$(which node)
        AGENT_SCRIPT="$INSTALL_DIR/agent.js"
        log_info "Using Node.js: $(node --version)"
        return 0
    else
        log_error "Neither Python 3 nor Node.js is installed."
        log_error "Please install Python 3 (recommended) or Node.js."
        exit 1
    fi
}

download_agent() {
    mkdir -p "$INSTALL_DIR"

    if [[ "$AGENT_RUNTIME" == "python" ]]; then
        log_info "Downloading agent.py..."
        if command -v curl &> /dev/null; then
            curl -sL "$AGENT_PY_URL" -o "$AGENT_SCRIPT"
        elif command -v wget &> /dev/null; then
            wget -q "$AGENT_PY_URL" -O "$AGENT_SCRIPT"
        else
            log_error "curl or wget is required"
            exit 1
        fi
    else
        log_info "Downloading agent.js..."
        if command -v curl &> /dev/null; then
            curl -sL "$AGENT_JS_URL" -o "$AGENT_SCRIPT"
        elif command -v wget &> /dev/null; then
            wget -q "$AGENT_JS_URL" -O "$AGENT_SCRIPT"
        else
            log_error "curl or wget is required"
            exit 1
        fi
    fi

    chmod +x "$AGENT_SCRIPT"
    log_info "Agent installed to $AGENT_SCRIPT"
}

load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        source "$CONFIG_FILE"
    fi
}

save_config() {
    cat > "$CONFIG_FILE" << EOF
# CCUsage Agent Configuration
# Edit this file and run './setup.sh restart' to apply changes

# Server URL (required)
CCUSAGE_SERVER="$CCUSAGE_SERVER"

# API Key (required)
CCUSAGE_API_KEY="$CCUSAGE_API_KEY"

# Report interval in minutes (1-1440, default: 5)
REPORT_INTERVAL="$REPORT_INTERVAL"

# Claude projects directory (optional, default: ~/.claude/projects)
# CLAUDE_PROJECTS_DIR=""
EOF
    chmod 600 "$CONFIG_FILE"
}

# Validate report interval (1-1440 minutes)
validate_interval() {
    local interval="$1"
    if [[ ! "$interval" =~ ^[0-9]+$ ]]; then
        return 1
    fi
    if [[ "$interval" -lt 1 ]] || [[ "$interval" -gt 1440 ]]; then
        return 1
    fi
    return 0
}

prompt_config() {
    load_config

    # Set default report interval if not set
    REPORT_INTERVAL="${REPORT_INTERVAL:-5}"

    # Check if we already have config from environment or file
    if [[ -n "$CCUSAGE_SERVER" ]] && [[ -n "$CCUSAGE_API_KEY" ]]; then
        log_info "Using existing configuration"
        log_info "Server: $CCUSAGE_SERVER"
        log_info "Report interval: ${REPORT_INTERVAL} minutes"
        save_config
        return
    fi

    # Try to get interactive input
    local can_prompt=false
    if [[ -t 0 ]]; then
        can_prompt=true
    elif [[ -e /dev/tty ]]; then
        # Try to open /dev/tty
        if exec 3</dev/tty 2>/dev/null; then
            exec 0<&3
            can_prompt=true
        fi
    fi

    if [[ "$can_prompt" == "false" ]]; then
        echo ""
        log_error "Cannot read input in pipe mode."
        echo ""
        echo "Please use one of these methods instead:"
        echo ""
        echo "  Method 1: Set environment variables"
        echo "    curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh | \\"
        echo "      CCUSAGE_SERVER=http://your-server:3000 CCUSAGE_API_KEY=your-key REPORT_INTERVAL=5 bash -s install"
        echo ""
        echo "  Method 2: Download and run"
        echo "    curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh -o setup.sh"
        echo "    chmod +x setup.sh"
        echo "    ./setup.sh install"
        echo ""
        exit 1
    fi

    echo ""
    echo "=== CCUsage Agent Configuration ==="
    echo ""

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

    printf "Report interval in minutes (1-1440) [%s]: " "$REPORT_INTERVAL"
    read -r input_interval || true
    input_interval="${input_interval:-$REPORT_INTERVAL}"

    if ! validate_interval "$input_interval"; then
        log_error "Report interval must be between 1 and 1440 minutes"
        exit 1
    fi
    REPORT_INTERVAL="$input_interval"

    save_config
    log_info "Configuration saved to $CONFIG_FILE"
}

# macOS launchd setup
install_macos() {
    local plist_path="$HOME/Library/LaunchAgents/com.ccusage.agent.plist"

    cat > "$plist_path" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ccusage.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$RUNTIME_PATH</string>
        <string>$AGENT_SCRIPT</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CCUSAGE_SERVER</key>
        <string>$CCUSAGE_SERVER</string>
        <key>CCUSAGE_API_KEY</key>
        <string>$CCUSAGE_API_KEY</string>
        <key>REPORT_INTERVAL</key>
        <string>$REPORT_INTERVAL</string>
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
    log_info "Report interval: ${REPORT_INTERVAL} minutes"
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

restart_macos() {
    local plist_path="$HOME/Library/LaunchAgents/com.ccusage.agent.plist"

    if [[ -f "$plist_path" ]]; then
        log_info "Restarting service..."
        launchctl unload "$plist_path" 2>/dev/null || true
        sleep 1
        launchctl load "$plist_path"
        log_info "Service restarted"
    else
        log_error "Service not installed. Run 'install' first."
        exit 1
    fi
}

# Linux systemd setup
install_linux() {
    local service_path="$HOME/.config/systemd/user/$SERVICE_NAME.service"

    mkdir -p "$(dirname "$service_path")"

    cat > "$service_path" << EOF
[Unit]
Description=CCUsage Agent - Claude Code Usage Monitor
After=network.target

[Service]
Type=simple
Environment="CCUSAGE_SERVER=$CCUSAGE_SERVER"
Environment="CCUSAGE_API_KEY=$CCUSAGE_API_KEY"
Environment="REPORT_INTERVAL=$REPORT_INTERVAL"
ExecStart=$RUNTIME_PATH $AGENT_SCRIPT
Restart=always
RestartSec=60

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable "$SERVICE_NAME"
    systemctl --user start "$SERVICE_NAME"

    log_info "Systemd service installed: $service_path"
    log_info "Report interval: ${REPORT_INTERVAL} minutes"
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

restart_linux() {
    local service_path="$HOME/.config/systemd/user/$SERVICE_NAME.service"

    if [[ -f "$service_path" ]]; then
        log_info "Restarting service..."
        systemctl --user restart "$SERVICE_NAME"
        log_info "Service restarted"
    else
        log_error "Service not installed. Run 'install' first."
        exit 1
    fi
}

# Cron fallback
install_cron() {
    local cron_schedule
    local interval="${REPORT_INTERVAL:-5}"

    # Generate cron schedule based on interval
    if [[ "$interval" -eq 1 ]]; then
        cron_schedule="* * * * *"
    elif [[ "$interval" -lt 60 ]]; then
        cron_schedule="*/$interval * * * *"
    else
        # For intervals >= 60 minutes, use hourly cron
        local hours=$((interval / 60))
        if [[ "$hours" -eq 1 ]]; then
            cron_schedule="0 * * * *"
        else
            cron_schedule="0 */$hours * * *"
        fi
    fi

    local cron_cmd="$cron_schedule CCUSAGE_SERVER=\"$CCUSAGE_SERVER\" CCUSAGE_API_KEY=\"$CCUSAGE_API_KEY\" $RUNTIME_PATH $AGENT_SCRIPT --once >> /tmp/ccusage-agent.log 2>&1"

    # Remove existing entry and add new one
    (crontab -l 2>/dev/null | grep -v "ccusage-agent\|$AGENT_SCRIPT"; echo "$cron_cmd") | crontab -

    log_info "Cron job installed (runs every $interval minutes)"
    log_info "Cron schedule: $cron_schedule"
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

restart_cron() {
    log_info "Cron jobs don't need restart - they run on schedule"
    log_info "Next execution will use the updated agent"
}

# Main commands
cmd_install() {
    detect_runtime
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
    log_info "The agent will now run in the background and report usage every ${REPORT_INTERVAL} minute(s)."
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
    echo "  Report Interval: ${REPORT_INTERVAL:-5} minutes"
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
    detect_runtime

    if [[ ! -f "$AGENT_SCRIPT" ]]; then
        download_agent
    fi

    load_config

    if [[ -z "$CCUSAGE_SERVER" ]] || [[ -z "$CCUSAGE_API_KEY" ]]; then
        prompt_config
    fi

    log_info "Running agent once..."
    CCUSAGE_SERVER="$CCUSAGE_SERVER" CCUSAGE_API_KEY="$CCUSAGE_API_KEY" "$RUNTIME_PATH" "$AGENT_SCRIPT" --once
}

cmd_restart() {
    local os=$(detect_os)

    case "$os" in
        macos)
            restart_macos
            ;;
        linux)
            if systemctl --user status >/dev/null 2>&1; then
                restart_linux
            else
                restart_cron
            fi
            ;;
        *)
            restart_cron
            ;;
    esac
}

cmd_update() {
    detect_runtime
    log_info "Updating agent..."
    download_agent
    log_info "Update complete."

    # Check if service is running and restart it
    local os=$(detect_os)
    local should_restart=false

    case "$os" in
        macos)
            if launchctl list 2>/dev/null | grep -q "com.ccusage.agent"; then
                should_restart=true
            fi
            ;;
        linux)
            if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
                should_restart=true
            fi
            ;;
    esac

    if [[ "$should_restart" == "true" ]]; then
        log_info "Restarting service to apply changes..."
        cmd_restart
    else
        log_info "Service not running, no restart needed."
    fi
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
    echo "  update     Update agent.js to latest version and restart"
    echo "  restart    Restart the background service"
    echo "  config     Edit configuration file"
    echo "  help       Show this help message"
    echo ""
    echo "Configuration File:"
    echo "  $CONFIG_FILE"
    echo ""
    echo "Environment Variables:"
    echo "  CCUSAGE_SERVER      Server URL (e.g., http://localhost:3000)"
    echo "  CCUSAGE_API_KEY     API key for authentication"
    echo "  REPORT_INTERVAL     Report interval in minutes (1-1440, default: 5)"
    echo ""
    echo "Examples:"
    echo "  # Interactive installation"
    echo "  ./setup.sh install"
    echo ""
    echo "  # Non-interactive installation with 1-minute interval"
    echo "  CCUSAGE_SERVER=http://server:3000 CCUSAGE_API_KEY=key REPORT_INTERVAL=1 ./setup.sh install"
    echo ""
    echo "  # Update and restart"
    echo "  ./setup.sh update"
    echo ""
    echo "  # Edit configuration"
    echo "  ./setup.sh config"
    echo ""
}

cmd_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_warn "Configuration file not found, creating one..."
        cat > "$CONFIG_FILE" << 'EOF'
# CCUsage Agent Configuration
# Edit this file and run './setup.sh restart' to apply changes

# Server URL (required)
CCUSAGE_SERVER=""

# API Key (required)
CCUSAGE_API_KEY=""

# Report interval in minutes (1-1440, default: 5)
REPORT_INTERVAL="5"

# Claude projects directory (optional, default: ~/.claude/projects)
# CLAUDE_PROJECTS_DIR=""
EOF
        chmod 600 "$CONFIG_FILE"
    fi

    # Determine editor
    local editor="${EDITOR:-${VISUAL:-nano}}"
    if ! command -v "$editor" &> /dev/null; then
        if command -v vim &> /dev/null; then
            editor="vim"
        elif command -v vi &> /dev/null; then
            editor="vi"
        else
            log_error "No editor found. Please set EDITOR environment variable."
            log_info "You can manually edit: $CONFIG_FILE"
            exit 1
        fi
    fi

    log_info "Opening configuration file with $editor..."
    log_info "After editing, run './setup.sh restart' to apply changes."
    echo ""
    "$editor" "$CONFIG_FILE"

    # Validate config after editing
    load_config
    if [[ -z "$CCUSAGE_SERVER" ]] || [[ -z "$CCUSAGE_API_KEY" ]]; then
        log_warn "Configuration incomplete. Server and API key are required."
    else
        log_info "Configuration saved."
    fi
}

# Main entry point
case "${1:-help}" in
    install)   cmd_install ;;
    uninstall) cmd_uninstall ;;
    status)    cmd_status ;;
    run)       cmd_run ;;
    update)    cmd_update ;;
    restart)   cmd_restart ;;
    config)    cmd_config ;;
    help|--help|-h) cmd_help ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
