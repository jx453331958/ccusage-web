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

let runOnce = false;

// Parse command line arguments
process.argv.slice(2).forEach((arg, i, args) => {
  if (arg === '--server' && args[i + 1]) {
    config.server = args[i + 1];
  } else if (arg === '--api-key' && args[i + 1]) {
    config.apiKey = args[i + 1];
  } else if (arg === '--once') {
    runOnce = true;
  } else if (arg === '--help') {
    console.log(`
CCUsage Agent - Claude Code Usage Monitor

Usage:
  node agent.js [options]

Options:
  --server URL      Server URL (default: http://localhost:3000)
  --api-key KEY     API key for authentication
  --once            Run once and exit (for cron scheduling)
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

// Extract usage from an entry (supports multiple formats)
function extractUsage(entry) {
  // Format 1: Direct usage object (type: "usage")
  if (entry.type === 'usage' && entry.usage) {
    return entry.usage;
  }
  
  // Format 2: Assistant message with usage (type: "assistant")
  if (entry.type === 'assistant' && entry.message?.usage) {
    return entry.message.usage;
  }
  
  // Format 3: Top-level usage field
  if (entry.usage && (entry.usage.input_tokens || entry.usage.output_tokens)) {
    return entry.usage;
  }
  
  // Format 4: costUSD with inputTokens/outputTokens (ccusage format)
  if (entry.inputTokens !== undefined || entry.outputTokens !== undefined) {
    return {
      input_tokens: entry.inputTokens || 0,
      output_tokens: entry.outputTokens || 0,
    };
  }
  
  // Format 5: Nested in response
  if (entry.response?.usage) {
    return entry.response.usage;
  }
  
  return null;
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
        const usage = extractUsage(entry);
        
        if (!usage) continue;
        
        const inputTokens = usage.input_tokens || usage.inputTokens || 0;
        const outputTokens = usage.output_tokens || usage.outputTokens || 0;
        
        // Skip empty usage
        if (inputTokens === 0 && outputTokens === 0) continue;
        
        // Create unique record ID
        const timestamp = entry.timestamp 
          ? Math.floor(new Date(entry.timestamp).getTime() / 1000) 
          : Math.floor(Date.now() / 1000);
        const recordId = `${filePath}:${timestamp}:${inputTokens}:${outputTokens}`;

        // Skip if already reported
        if (state.reportedRecords.has(recordId)) {
          continue;
        }

        records.push({
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          session_id: entry.sessionId || entry.session_id || null,
          timestamp: timestamp,
          _recordId: recordId,
        });
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
  if (!runOnce) {
    console.log('CCUsage Agent started');
    console.log(`Server: ${config.server}`);
    console.log(`Claude projects: ${config.claudeProjectsDir}`);
    console.log(`Report interval: ${config.reportInterval / 60000} minutes`);
    console.log('---');
  }

  loadState();

  async function collect() {
    if (!runOnce) {
      console.log(`[${new Date().toLocaleTimeString()}] Collecting usage data...`);
    }

    const files = findJsonlFiles();
    if (!runOnce) {
      console.log(`Found ${files.length} JSONL files`);
    }

    let allRecords = [];
    for (const file of files) {
      const records = parseJsonlFile(file);
      allRecords = allRecords.concat(records);
    }

    if (!runOnce) {
      console.log(`Collected ${allRecords.length} new records`);
    }
    
    await reportUsage(allRecords);
    
    if (!runOnce) {
      console.log('---');
    }
  }

  // Initial collection
  await collect();

  // If --once, exit after first run
  if (runOnce) {
    saveState();
    process.exit(0);
  }

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
