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
const https = require('https');

// Version
const VERSION = '1.1.0';

// User agent string
const USER_AGENT = `CCUsage-Agent/${VERSION} (Node.js)`;

// Configuration file path
const CONFIG_FILE = path.join(os.homedir(), '.ccusage-agent.conf');

// Parse and validate report interval (1-1440 minutes)
function parseReportInterval(value, defaultValue = 5) {
  const interval = parseInt(value, 10);
  if (isNaN(interval) || interval < 1 || interval > 1440) {
    return defaultValue;
  }
  return interval;
}

// Load configuration from file (shell format: KEY="value")
function loadConfigFile() {
  const fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        // Skip comments and empty lines
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Parse KEY="value" or KEY=value format
        const match = trimmed.match(/^([A-Z_]+)=["']?(.*)["']?$/);
        if (match) {
          const key = match[1];
          let value = match[2];
          // Remove trailing quotes if present
          value = value.replace(/["']$/, '');
          if (value) {
            fileConfig[key] = value;
          }
        }
      }
    }
  } catch (error) {
    // Ignore config file errors
  }
  return fileConfig;
}

// Load config from file first, then override with env vars
const fileConfig = loadConfigFile();

// Parse insecure flag from env or config
function parseInsecure(value) {
  if (!value) return false;
  return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

// Configuration (priority: env vars > config file > defaults)
const config = {
  server: process.env.CCUSAGE_SERVER || fileConfig.CCUSAGE_SERVER || 'http://localhost:3000',
  apiKey: process.env.CCUSAGE_API_KEY || fileConfig.CCUSAGE_API_KEY || '',
  claudeProjectsDir: process.env.CLAUDE_PROJECTS_DIR || fileConfig.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects'),
  reportIntervalMinutes: parseReportInterval(process.env.REPORT_INTERVAL || fileConfig.REPORT_INTERVAL, 5),
  insecure: parseInsecure(process.env.CCUSAGE_INSECURE || fileConfig.CCUSAGE_INSECURE),
  stateFile: path.join(os.homedir(), '.ccusage-agent-state.json'),
  configFile: CONFIG_FILE,
};

// Convert to milliseconds
config.reportInterval = config.reportIntervalMinutes * 60 * 1000;

let runOnce = false;

// Parse command line arguments
process.argv.slice(2).forEach((arg, i, args) => {
  if (arg === '--server' && args[i + 1]) {
    config.server = args[i + 1];
  } else if (arg === '--api-key' && args[i + 1]) {
    config.apiKey = args[i + 1];
  } else if (arg === '--interval' && args[i + 1]) {
    config.reportIntervalMinutes = parseReportInterval(args[i + 1], 5);
    config.reportInterval = config.reportIntervalMinutes * 60 * 1000;
  } else if (arg === '--once') {
    runOnce = true;
  } else if (arg === '--insecure' || arg === '-k') {
    config.insecure = true;
  } else if (arg === '--help') {
    console.log(`
CCUsage Agent v${VERSION} - Claude Code Usage Monitor

Usage:
  node agent.js [options]

Options:
  --server URL      Server URL (default: http://localhost:3000)
  --api-key KEY     API key for authentication
  --interval MIN    Report interval in minutes, 1-1440 (default: 5)
  --once            Run once and exit (for cron scheduling)
  --insecure, -k    Skip SSL certificate verification (for self-signed certs)
  --help            Show this help message

Configuration File:
  ${CONFIG_FILE}

  The agent reads configuration from this file if it exists.
  Priority: command line args > environment variables > config file > defaults

Environment Variables:
  CCUSAGE_SERVER        Server URL
  CCUSAGE_API_KEY       API key for authentication
  CLAUDE_PROJECTS_DIR   Claude projects directory
  REPORT_INTERVAL       Report interval in minutes, 1-1440 (default: 5)
  CCUSAGE_INSECURE      Skip SSL certificate verification (true/false)

Examples:
  # Run with 1-minute interval
  node agent.js --server http://localhost:3000 --api-key KEY --interval 1

  # Run once (for cron)
  node agent.js --once

  # Run with self-signed certificate (skip SSL verification)
  node agent.js --server https://my-server.com --api-key KEY --insecure
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

// Extract model from an entry (supports multiple formats)
function extractModel(entry) {
  // Format 1: Assistant message with model
  if (entry.message?.model) {
    return entry.message.model;
  }

  // Format 2: Direct model field
  if (entry.model) {
    return entry.model;
  }

  // Format 3: Nested in response
  if (entry.response?.model) {
    return entry.response.model;
  }

  return null;
}

// Extract usage from an entry (supports multiple formats)
function extractUsage(entry) {
  let usage = null;

  // Format 1: Direct usage object (type: "usage")
  if (entry.type === 'usage' && entry.usage) {
    usage = entry.usage;
  }
  // Format 2: Assistant message with usage (type: "assistant")
  else if (entry.type === 'assistant' && entry.message?.usage) {
    usage = entry.message.usage;
  }
  // Format 3: Top-level usage field
  else if (entry.usage && (entry.usage.input_tokens || entry.usage.output_tokens)) {
    usage = entry.usage;
  }
  // Format 4: costUSD with inputTokens/outputTokens (ccusage format)
  else if (entry.inputTokens !== undefined || entry.outputTokens !== undefined) {
    usage = {
      input_tokens: entry.inputTokens || 0,
      output_tokens: entry.outputTokens || 0,
    };
  }
  // Format 5: Nested in response
  else if (entry.response?.usage) {
    usage = entry.response.usage;
  }

  if (!usage) return null;

  // Attach model to usage object
  const model = extractModel(entry);
  if (model) {
    usage.model = model;
  }

  return usage;
}

// Parse timestamp to unix epoch seconds
function parseTimestamp(ts) {
  if (!ts) return Math.floor(Date.now() / 1000);
  if (typeof ts === 'string') {
    const ms = new Date(ts).getTime();
    return isNaN(ms) ? Math.floor(Date.now() / 1000) : Math.floor(ms / 1000);
  }
  return Math.floor(ts);
}

// Parse JSONL file and extract usage records
// Deduplicates by message ID: each API request may have multiple JSONL entries
// (streaming chunks), but we only keep the last entry per message ID.
function parseJsonlFile(filePath) {
  // First pass: collect entries grouped by message ID
  const msgMap = new Map(); // msgId -> best record data

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
        const cacheCreateTokens = usage.cache_creation_input_tokens || usage.cache_creation || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || usage.cache_read || 0;

        // Skip empty usage
        if (inputTokens === 0 && outputTokens === 0) continue;

        const timestamp = parseTimestamp(entry.timestamp);

        // Use message ID for dedup; fall back to content-based key
        const msgId = entry.message?.id || `${filePath}:${timestamp}:${inputTokens}:${outputTokens}:${cacheCreateTokens}:${cacheReadTokens}`;

        const recordData = {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          cache_create_tokens: cacheCreateTokens,
          cache_read_tokens: cacheReadTokens,
          session_id: entry.sessionId || entry.session_id || null,
          model: usage.model || null,
          timestamp: timestamp,
          _msgId: msgId,
        };

        // Keep the entry with the largest output_tokens per message ID
        const existing = msgMap.get(msgId);
        if (!existing || outputTokens >= existing.output_tokens) {
          msgMap.set(msgId, recordData);
        }
      } catch (err) {
        // Skip invalid JSON lines
      }
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
  }

  // Second pass: filter already-reported and build final records
  const records = [];
  for (const record of msgMap.values()) {
    const recordId = `${filePath}:${record._msgId}`;
    if (state.reportedRecords.has(recordId)) continue;
    record._recordId = recordId;
    delete record._msgId;
    records.push(record);
  }

  return records;
}

// Create fetch options with optional SSL bypass
function createFetchOptions(options) {
  const fetchOptions = { ...options };

  // Add User-Agent header
  fetchOptions.headers = {
    ...fetchOptions.headers,
    'User-Agent': USER_AGENT,
  };

  // If insecure mode, create a custom HTTPS agent that ignores certificate errors
  if (config.insecure && config.server.startsWith('https://')) {
    fetchOptions.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  return fetchOptions;
}

const BATCH_SIZE = 500;

// Send a single batch of records to the server
async function sendBatch(batch, url) {
  try {
    const fetchOptions = createFetchOptions({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        records: batch.map((r) => ({
          input_tokens: r.input_tokens,
          output_tokens: r.output_tokens,
          total_tokens: r.total_tokens,
          cache_create_tokens: r.cache_create_tokens,
          cache_read_tokens: r.cache_read_tokens,
          session_id: r.session_id,
          model: r.model,
          timestamp: r.timestamp,
        })),
      }),
    });

    const response = await fetch(url, fetchOptions);

    if (response.ok) {
      const data = await response.json();
      console.log(`  ✓ Batch OK: ${data.inserted} inserted, ${data.skipped} skipped`);

      // Mark records as reported
      batch.forEach((r) => {
        state.reportedRecords.add(r._recordId);
      });
      state.lastReportedTimestamp = Math.floor(Date.now() / 1000);
      saveState();
      return true;
    } else {
      const error = await response.text();
      console.error(`  ✗ Batch failed: ${response.status} ${error}`);
      return false;
    }
  } catch (error) {
    console.error(`  ✗ Network error:`, error.message);
    return false;
  }
}

// Report usage to server in batches
async function reportUsage(records) {
  if (records.length === 0) {
    console.log('No new records to report');
    return true;
  }

  const url = `${config.server}/api/usage/report`;
  const total = records.length;
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  let allOk = true;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`Reporting batch ${batchNum}/${totalBatches} (${batch.length} records)...`);
    if (!await sendBatch(batch, url)) {
      allOk = false;
      console.log('  Stopping due to error (remaining records will be retried next run)');
      break;
    }
  }

  if (allOk) {
    console.log(`✓ All ${total} records reported successfully`);
  }

  return allOk;
}

// Main monitoring loop
async function run() {
  if (!runOnce) {
    console.log(`CCUsage Agent v${VERSION} started`);
    console.log(`Server: ${config.server}`);
    console.log(`Claude projects: ${config.claudeProjectsDir}`);
    console.log(`Report interval: ${config.reportIntervalMinutes} minute(s)`);
    if (config.insecure) {
      console.log('WARNING: SSL certificate verification is disabled');
    }
    if (fs.existsSync(config.configFile)) {
      console.log(`Config file: ${config.configFile}`);
    }
    console.log('---');
  }

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

    const success = await reportUsage(allRecords);

    console.log('---');
    return success;
  }

  // Initial collection
  const success = await collect();

  // If --once, exit after first run
  if (runOnce) {
    saveState();
    process.exit(success ? 0 : 1);
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
