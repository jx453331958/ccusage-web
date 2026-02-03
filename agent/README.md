# CCUsage Agent

A lightweight monitoring agent that collects Claude Code usage data and reports it to the CCUsage Web server.

## Installation

The agent is a standalone Node.js script with no dependencies. Simply copy `agent.js` to your device.

## Usage

### Basic Usage

```bash
node agent.js --server http://your-server:3000 --api-key YOUR_API_KEY
```

### Environment Variables

```bash
export CCUSAGE_SERVER=http://your-server:3000
export CCUSAGE_API_KEY=your_api_key_here
export CLAUDE_PROJECTS_DIR=~/.claude/projects  # Optional
export REPORT_INTERVAL=5  # Minutes, optional (default: 5)

node agent.js
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
5. Repeats every 5 minutes (configurable)

## State File

The agent stores its state in `~/.ccusage-agent-state.json` to track which records have been reported. This file is automatically managed.
