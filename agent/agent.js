#!/usr/bin/env node

/**
 * CCUsage Agent
 *
 * This script monitors Claude Code usage by reading JSONL log files
 * and reporting token usage to the CCUsage Web server.
 *
 * Usage:
 *   node agent.js --server http://localhost:3000 --api-key YOUR_API_KEY
 *
 * Configuration via environment variables:
 *   CCUSAGE_SERVER - Server URL (default: http://localhost:3000)
 *   CCUSAGE_API_KEY - API key for authentication
 *   CLAUDE_PROJECTS_DIR - Claude projects directory (default: ~/.claude/projects)
 *   REPORT_INTERVAL - Report interval in minutes (default: 5)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const config = {
  server: process.env.CCUSAGE_SERVER || 'http://localhost:3000',
  apiKey: process.env.CCUSAGE_API_KEY || '',
  claudeProjectsDir: process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects'),
  reportInterval: parseInt(process.env.REPORT_INTERVAL || '5', 10) * 60 * 1000, // Convert to ms
  stateFile: path.join(os.homedir(), '.ccusage-agent-state.json'),
};

// Parse command line arguments
process.argv.slice(2).forEach((arg, i, args) => {
  if (arg === '--server' && args[i + 1]) {
    config.server = args[i + 1];
  } else if (arg === '--api-key' && args[i + 1]) {
    config.apiKey = args[i + 1];
  } else if (arg === '--help') {
    console.log(`
CCUsage Agent - Claude Code Usage Monitor

Usage:
  node agent.js [options]

Options:
  --server URL      Server URL (default: http://localhost:3000)
  --api-key KEY     API key for authentication
  --help            Show this help message

Environment Variables:
  CCUSAGE_SERVER        Server URL
  CCUSAGE_API_KEY       API key for authentication
  CLAUDE_PROJECTS_DIR   Claude projects directory
  REPORT_INTERVAL       Report interval in minutes (default: 5)
    `);
    process.exit(0);
  }
});

// Validate configuration
if (!config.apiKey) {
  console.error('Error: API key is required. Use --api-key or set CCUSAGE_API_KEY environment variable.');
  process.exit(1);
}

// Load state (to track which records have been reported)
let state = {
  lastReportedTimestamp: 0,
  reportedRecords: new Set(),
};

function loadState() {
  try {
    if (fs.existsSync(config.stateFile)) {
      const data = JSON.parse(fs.readFileSync(config.stateFile, 'utf8'));
      state.lastReportedTimestamp = data.lastReportedTimestamp || 0;
      state.reportedRecords = new Set(data.reportedRecords || []);
    }
  } catch (error) {
    console.error('Error loading state:', error.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(
      config.stateFile,
      JSON.stringify({
        lastReportedTimestamp: state.lastReportedTimestamp,
        reportedRecords: Array.from(state.reportedRecords).slice(-10000), // Keep last 10k records
      })
    );
  } catch (error) {
    console.error('Error saving state:', error.message);
  }
}

// Find all JSONL files in Claude projects directory
function findJsonlFiles() {
  const files = [];

  if (!fs.existsSync(config.claudeProjectsDir)) {
    console.error(`Claude projects directory not found: ${config.claudeProjectsDir}`);
    return files;
  }

  function walkDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
  }

  walkDir(config.claudeProjectsDir);
  return files;
}

// Parse JSONL file and extract usage records
function parseJsonlFile(filePath) {
  const records = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Look for usage data in different formats
        if (entry.type === 'usage' && entry.usage) {
          const recordId = `${filePath}:${entry.timestamp}:${entry.usage.input_tokens}`;

          // Skip if already reported
          if (state.reportedRecords.has(recordId)) {
            continue;
          }

          const timestamp = entry.timestamp ? Math.floor(new Date(entry.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);

          records.push({
            input_tokens: entry.usage.input_tokens || 0,
            output_tokens: entry.usage.output_tokens || 0,
            total_tokens: (entry.usage.input_tokens || 0) + (entry.usage.output_tokens || 0),
            session_id: entry.session_id || null,
            timestamp: timestamp,
            _recordId: recordId,
          });
        }
      } catch (err) {
        // Skip invalid JSON lines
      }
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
  }

  return records;
}

// Report usage to server
async function reportUsage(records) {
  if (records.length === 0) {
    console.log('No new records to report');
    return;
  }

  try {
    const response = await fetch(`${config.server}/api/usage/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        records: records.map((r) => ({
          input_tokens: r.input_tokens,
          output_tokens: r.output_tokens,
          total_tokens: r.total_tokens,
          session_id: r.session_id,
          timestamp: r.timestamp,
        })),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Reported ${data.inserted} records successfully`);

      // Mark records as reported
      records.forEach((r) => {
        state.reportedRecords.add(r._recordId);
      });
      state.lastReportedTimestamp = Math.floor(Date.now() / 1000);
      saveState();
    } else {
      const error = await response.text();
      console.error(`✗ Failed to report usage: ${response.status} ${error}`);
    }
  } catch (error) {
    console.error(`✗ Network error:`, error.message);
  }
}

// Main monitoring loop
async function run() {
  console.log('CCUsage Agent started');
  console.log(`Server: ${config.server}`);
  console.log(`Claude projects: ${config.claudeProjectsDir}`);
  console.log(`Report interval: ${config.reportInterval / 60000} minutes`);
  console.log('---');

  loadState();

  async function collect() {
    console.log(`[${new Date().toLocaleTimeString()}] Collecting usage data...`);

    const files = findJsonlFiles();
    console.log(`Found ${files.length} JSONL files`);

    let allRecords = [];
    for (const file of files) {
      const records = parseJsonlFile(file);
      allRecords = allRecords.concat(records);
    }

    console.log(`Collected ${allRecords.length} new records`);
    await reportUsage(allRecords);
    console.log('---');
  }

  // Initial collection
  await collect();

  // Schedule periodic collection
  setInterval(collect, config.reportInterval);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  saveState();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  saveState();
  process.exit(0);
});

// Start the agent
run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
