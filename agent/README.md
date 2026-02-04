# CCUsage Agent

A lightweight monitoring agent that collects Claude Code usage data and reports it to the CCUsage Web server.

**Supports both Python 3 and Node.js** - The setup script automatically detects and uses Python 3 (preferred) or Node.js.

## Requirements

One of the following:
- **Python 3.6+** (recommended, uses only standard library)
- Node.js 18+

## Quick Setup

Run the setup script for automatic installation:

```bash
./setup.sh install
```

This will:
1. Auto-detect runtime (Python 3 preferred, falls back to Node.js)
2. Prompt for your server URL and API key
3. Prompt for report interval (1-1440 minutes, default: 5)
4. Detect your OS (macOS/Linux)
5. Install as a background service (launchd/systemd/cron)

Other commands:
```bash
./setup.sh status     # Check agent status
./setup.sh uninstall  # Remove agent
./setup.sh run        # Run once for testing
./setup.sh update     # Update agent to latest version and restart
./setup.sh restart    # Restart the background service
./setup.sh config     # Edit configuration file
```

### Non-interactive Installation

You can also install with environment variables:

```bash
CCUSAGE_SERVER=http://your-server:3000 \
CCUSAGE_API_KEY=your-key \
REPORT_INTERVAL=1 \
./setup.sh install
```

Or via pipe:

```bash
curl -sL https://raw.githubusercontent.com/jx453331958/ccusage-web/main/agent/setup.sh | \
  CCUSAGE_SERVER=http://your-server:3000 \
  CCUSAGE_API_KEY=your-key \
  REPORT_INTERVAL=1 \
  bash -s install
```

## Manual Usage

### Basic Usage

```bash
node agent.js --server http://your-server:3000 --api-key YOUR_API_KEY
```

### One-shot Mode (for cron)

```bash
node agent.js --server http://your-server:3000 --api-key YOUR_API_KEY --once
```

### Environment Variables

```bash
export CCUSAGE_SERVER=http://your-server:3000
export CCUSAGE_API_KEY=your_api_key_here
export CLAUDE_PROJECTS_DIR=~/.claude/projects  # Optional
export REPORT_INTERVAL=1  # Minutes (1-1440), optional (default: 5)

node agent.js
```

### Command Line Options

```bash
# Run with custom interval (1 minute)
node agent.js --server http://your-server:3000 --api-key KEY --interval 1

# Run once and exit (for cron)
node agent.js --once

# Show help
node agent.js --help
```

## Running as a Background Service

### macOS (launchd)

Create `~/Library/LaunchAgents/com.ccusage.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ccusage.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/agent.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CCUSAGE_SERVER</key>
        <string>http://your-server:3000</string>
        <key>CCUSAGE_API_KEY</key>
        <string>your_api_key</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ccusage-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ccusage-agent.error.log</string>
</dict>
</plist>
```

Load and start:
```bash
launchctl load ~/Library/LaunchAgents/com.ccusage.agent.plist
launchctl start com.ccusage.agent
```

### Linux (systemd)

Create `/etc/systemd/system/ccusage-agent.service`:

```ini
[Unit]
Description=CCUsage Agent
After=network.target

[Service]
Type=simple
User=your-username
Environment="CCUSAGE_SERVER=http://your-server:3000"
Environment="CCUSAGE_API_KEY=your_api_key"
ExecStart=/usr/bin/node /path/to/agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ccusage-agent
sudo systemctl start ccusage-agent
sudo systemctl status ccusage-agent
```

### Windows (NSSM)

1. Download NSSM from https://nssm.cc/
2. Run as administrator:

```cmd
nssm install CCUsageAgent
```

3. Configure:
   - Path: `C:\Program Files\nodejs\node.exe`
   - Startup directory: `C:\path\to\agent`
   - Arguments: `agent.js`
   - Environment:
     ```
     CCUSAGE_SERVER=http://your-server:3000
     CCUSAGE_API_KEY=your_api_key
     ```

4. Start the service:
```cmd
nssm start CCUsageAgent
```

## How It Works

1. The agent scans `~/.claude/projects/` for JSONL log files
2. Parses usage records (input/output tokens) from the logs
3. Reports new records to the server via API
4. Maintains state to avoid duplicate reports
5. Repeats at the configured interval (1-1440 minutes, default: 5)

## Report Interval

The report interval controls how often the agent collects and reports usage data:

- **Minimum**: 1 minute (for real-time monitoring)
- **Maximum**: 1440 minutes (24 hours)
- **Default**: 5 minutes

For high-frequency monitoring, set `REPORT_INTERVAL=1` to report every minute.

## Configuration File

The agent reads configuration from `~/.ccusage-agent.conf`. You can edit this file to change settings without modifying environment variables or service files.

```bash
# Edit configuration
./setup.sh config

# Or manually edit
nano ~/.ccusage-agent.conf
```

Example configuration:
```bash
# CCUsage Agent Configuration
# Edit this file and run './setup.sh restart' to apply changes

# Server URL (required)
CCUSAGE_SERVER="http://your-server:3000"

# API Key (required)
CCUSAGE_API_KEY="your_api_key"

# Report interval in minutes (1-1440, default: 5)
REPORT_INTERVAL="5"

# Claude projects directory (optional, default: ~/.claude/projects)
# CLAUDE_PROJECTS_DIR=""
```

Configuration priority: command line args > environment variables > config file > defaults

After editing the config file, restart the service to apply changes:
```bash
./setup.sh restart
```

## State File

The agent stores its state in `~/.ccusage-agent-state.json` to track which records have been reported. This file is automatically managed.
