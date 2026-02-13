#!/usr/bin/env python3
"""
CCUsage Agent (Python)

A lightweight monitoring agent that collects Claude Code usage data
and reports it to the CCUsage Web server.

Usage:
    python3 agent.py --server http://localhost:3000 --api-key YOUR_API_KEY

Configuration via environment variables:
    CCUSAGE_SERVER - Server URL (default: http://localhost:3000)
    CCUSAGE_API_KEY - API key for authentication
    CLAUDE_PROJECTS_DIR - Claude projects directory (default: ~/.claude/projects)
    REPORT_INTERVAL - Report interval in minutes (default: 5)

Requirements: Python 3.6+ (uses only standard library)
"""

import os
import sys
import json
import time
import signal
import argparse
import ssl
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from typing import Dict, List, Set, Optional, Any

# Version
VERSION = '1.1.0'

# User agent string
USER_AGENT = f'CCUsage-Agent/{VERSION} (Python)'

# Configuration file path
CONFIG_FILE = Path.home() / '.ccusage-agent.conf'
STATE_FILE = Path.home() / '.ccusage-agent-state.json'


def parse_config_file() -> Dict[str, str]:
    """Parse shell-style config file (KEY="value")."""
    config = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip('"\'')
                        if value:
                            config[key] = value
        except Exception:
            pass
    return config


def get_config() -> Dict[str, Any]:
    """Get configuration from file, environment, and defaults."""
    file_config = parse_config_file()

    def get_value(key: str, default: str) -> str:
        return os.environ.get(key) or file_config.get(key) or default

    interval_str = get_value('REPORT_INTERVAL', '5')
    try:
        interval = int(interval_str)
        if interval < 1 or interval > 1440:
            interval = 5
    except ValueError:
        interval = 5

    # Parse insecure flag
    insecure_str = get_value('CCUSAGE_INSECURE', 'false').lower()
    insecure = insecure_str in ('true', '1', 'yes')

    return {
        'server': get_value('CCUSAGE_SERVER', 'http://localhost:3000'),
        'api_key': get_value('CCUSAGE_API_KEY', ''),
        'claude_projects_dir': Path(get_value(
            'CLAUDE_PROJECTS_DIR',
            str(Path.home() / '.claude' / 'projects')
        )),
        'report_interval': interval,
        'insecure': insecure,
        'state_file': STATE_FILE,
        'config_file': CONFIG_FILE,
    }


class State:
    """Manages reported records state to avoid duplicates."""

    def __init__(self, state_file: Path):
        self.state_file = state_file
        self.last_reported_timestamp = 0
        self.reported_records: Set[str] = set()
        self.load()

    def load(self):
        """Load state from file."""
        try:
            if self.state_file.exists():
                with open(self.state_file, 'r') as f:
                    data = json.load(f)
                    self.last_reported_timestamp = data.get('lastReportedTimestamp', 0)
                    self.reported_records = set(data.get('reportedRecords', []))
        except Exception as e:
            print(f'Error loading state: {e}', file=sys.stderr)

    def save(self):
        """Save state to file."""
        try:
            # Keep last 10000 records
            records_list = list(self.reported_records)[-10000:]
            with open(self.state_file, 'w') as f:
                json.dump({
                    'lastReportedTimestamp': self.last_reported_timestamp,
                    'reportedRecords': records_list,
                }, f)
        except Exception as e:
            print(f'Error saving state: {e}', file=sys.stderr)

    def is_reported(self, record_id: str) -> bool:
        return record_id in self.reported_records

    def mark_reported(self, record_id: str):
        self.reported_records.add(record_id)
        self.last_reported_timestamp = int(time.time())


def _get_earliest_timestamp(filepath: Path) -> str:
    """Get earliest ISO timestamp from a JSONL file (for sorting, matching ccusage)."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    ts = entry.get('timestamp', '')
                    if isinstance(ts, str) and len(ts) > 10 and ts[4] == '-':
                        return ts
                except (json.JSONDecodeError, Exception):
                    continue
    except Exception:
        pass
    return 'z'  # Sort files with no valid timestamp last


def find_jsonl_files(directory: Path) -> List[Path]:
    """Recursively find all .jsonl files, sorted by earliest timestamp.

    Matches ccusage CLI file ordering: files are sorted by their earliest
    timestamp so that parent session files are processed before subagent
    files. This ensures consistent deduplication results.
    """
    files = []
    if not directory.exists():
        return files

    try:
        for item in directory.rglob('*.jsonl'):
            if item.is_file():
                files.append(item)
    except PermissionError:
        pass

    # Sort by earliest timestamp (matching ccusage CLI behavior)
    files.sort(key=_get_earliest_timestamp)
    return files


_ISO_TS_RE = __import__('re').compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$')


def _validate_entry(entry: Dict) -> bool:
    """Validate entry matches ccusage CLI's usageDataSchema."""
    # timestamp: required ISO 8601 format
    ts = entry.get('timestamp')
    if not isinstance(ts, str) or not _ISO_TS_RE.match(ts):
        return False
    # message: required object with usage sub-object
    msg = entry.get('message')
    if not isinstance(msg, dict):
        return False
    usage = msg.get('usage')
    if not isinstance(usage, dict):
        return False
    # input_tokens and output_tokens: required numbers
    if not isinstance(usage.get('input_tokens'), (int, float)):
        return False
    if not isinstance(usage.get('output_tokens'), (int, float)):
        return False
    return True


def _parse_timestamp(timestamp_str: str) -> int:
    """Parse ISO timestamp string to unix epoch seconds."""
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        return int(dt.timestamp())
    except Exception:
        return int(time.time())


def collect_records(files: List[Path], state: 'State') -> List[Dict]:
    """Parse all JSONL files and collect usage records.

    Replicates ccusage CLI logic exactly:
    1. Validate each entry against usageDataSchema
    2. Create dedup hash: message.id:requestId (null if either missing)
    3. null hash → always include (no dedup)
    4. Existing hash → skip (duplicate)
    5. New hash → include and mark as processed
    6. Global processedHashes across ALL files
    """
    processed_hashes: Set[str] = set()
    records: List[Dict] = []

    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)

                        # Step 1: Schema validation (matching ccusage)
                        if not _validate_entry(entry):
                            continue

                        msg = entry['message']
                        usage = msg['usage']

                        input_tokens = usage['input_tokens']
                        output_tokens = usage['output_tokens']
                        cache_create = usage.get('cache_creation_input_tokens') or 0
                        cache_read = usage.get('cache_read_input_tokens') or 0

                        # Step 2: Create dedup hash (matching ccusage's createUniqueHash)
                        message_id = msg.get('id')
                        request_id = entry.get('requestId')
                        if message_id is not None and request_id is not None:
                            unique_hash = f'{message_id}:{request_id}'
                        else:
                            unique_hash = None

                        # Step 3-4: Dedup check (matching ccusage's isDuplicateEntry)
                        if unique_hash is not None:
                            if unique_hash in processed_hashes:
                                continue
                            processed_hashes.add(unique_hash)

                        # Step 5: Build record
                        timestamp = _parse_timestamp(entry['timestamp'])
                        record_id = f"{file_path}:{unique_hash or f'{timestamp}:{input_tokens}:{output_tokens}:{cache_create}:{cache_read}'}"

                        if state.is_reported(record_id):
                            continue

                        records.append({
                            'input_tokens': input_tokens,
                            'output_tokens': output_tokens,
                            'total_tokens': input_tokens + output_tokens,
                            'cache_create_tokens': cache_create,
                            'cache_read_tokens': cache_read,
                            'session_id': entry.get('sessionId') or entry.get('session_id'),
                            'model': msg.get('model'),
                            'timestamp': timestamp,
                            '_record_id': record_id,
                        })

                    except (json.JSONDecodeError, KeyError):
                        continue
        except Exception as e:
            print(f'Error reading {file_path}: {e}', file=sys.stderr)

    return records


def _send_batch(batch: List[Dict], url: str, config: Dict, state: State) -> bool:
    """Send a single batch of records to the server."""
    payload = {
        'records': [
            {
                'input_tokens': r['input_tokens'],
                'output_tokens': r['output_tokens'],
                'total_tokens': r['total_tokens'],
                'cache_create_tokens': r['cache_create_tokens'],
                'cache_read_tokens': r['cache_read_tokens'],
                'session_id': r['session_id'],
                'model': r['model'],
                'timestamp': r['timestamp'],
            }
            for r in batch
        ]
    }

    try:
        data = json.dumps(payload).encode('utf-8')
        request = Request(
            url,
            data=data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {config['api_key']}",
                'User-Agent': USER_AGENT,
            },
            method='POST',
        )

        # Create SSL context
        ssl_context = None
        if config.get('insecure'):
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

        with urlopen(request, timeout=30, context=ssl_context) as response:
            result = json.loads(response.read().decode('utf-8'))
            inserted = result.get('inserted', len(batch))
            skipped = result.get('skipped', 0)
            print(f"  ✓ Batch OK: {inserted} inserted, {skipped} skipped")

            # Mark records as reported
            for r in batch:
                state.mark_reported(r['_record_id'])
            state.save()
            return True

    except HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ''
        print(f'  ✗ Batch failed: {e.code} {error_body}', file=sys.stderr)
        return False
    except URLError as e:
        print(f'  ✗ Network error: {e.reason}', file=sys.stderr)
        return False
    except Exception as e:
        print(f'  ✗ Error: {e}', file=sys.stderr)
        return False


BATCH_SIZE = 500


def report_usage(records: List[Dict], config: Dict, state: State) -> bool:
    """Report usage records to the server in batches."""
    if not records:
        print('No new records to report')
        return True

    server = config['server'].rstrip('/')
    url = f"{server}/api/usage/report"

    total = len(records)
    all_ok = True

    for i in range(0, total, BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(f'Reporting batch {batch_num}/{total_batches} ({len(batch)} records)...')
        if not _send_batch(batch, url, config, state):
            all_ok = False
            print(f'  Stopping due to error (remaining records will be retried next run)')
            break

    if all_ok:
        print(f'✓ All {total} records reported successfully')

    return all_ok


def collect_and_report(config: Dict, state: State) -> bool:
    """Collect usage data and report to server. Returns True on success."""
    print(f'[{time.strftime("%H:%M:%S")}] Collecting usage data...')

    files = find_jsonl_files(config['claude_projects_dir'])
    print(f'Found {len(files)} JSONL files')

    all_records = collect_records(files, state)
    print(f'Collected {len(all_records)} new records')

    success = report_usage(all_records, config, state)

    print('---')
    return success


def main():
    parser = argparse.ArgumentParser(
        description='CCUsage Agent - Claude Code Usage Monitor',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Configuration File:
  ~/.ccusage-agent.conf

  The agent reads configuration from this file if it exists.
  Priority: command line args > environment variables > config file > defaults

Environment Variables:
  CCUSAGE_SERVER        Server URL
  CCUSAGE_API_KEY       API key for authentication
  CLAUDE_PROJECTS_DIR   Claude projects directory
  REPORT_INTERVAL       Report interval in minutes (1-1440)
  CCUSAGE_INSECURE      Skip SSL certificate verification (true/false)

Examples:
  # Run with 1-minute interval
  python3 agent.py --server http://localhost:3000 --api-key KEY --interval 1

  # Run once (for cron)
  python3 agent.py --once

  # Run with self-signed certificate (skip SSL verification)
  python3 agent.py --server https://my-server.com --api-key KEY --insecure
        '''
    )
    parser.add_argument('--server', help='Server URL (default: http://localhost:3000)')
    parser.add_argument('--api-key', help='API key for authentication')
    parser.add_argument('--interval', type=int, help='Report interval in minutes (1-1440)')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    parser.add_argument('--insecure', '-k', action='store_true',
                        help='Skip SSL certificate verification (for self-signed certs)')

    args = parser.parse_args()

    # Get configuration
    config = get_config()

    # Override with command line args
    if args.server:
        config['server'] = args.server
    if args.api_key:
        config['api_key'] = args.api_key
    if args.interval:
        if 1 <= args.interval <= 1440:
            config['report_interval'] = args.interval
    if args.insecure:
        config['insecure'] = True

    # Validate API key
    if not config['api_key']:
        print('Error: API key is required. Use --api-key or set CCUSAGE_API_KEY.', file=sys.stderr)
        sys.exit(1)

    state = State(config['state_file'])

    if not args.once:
        print(f'CCUsage Agent v{VERSION} started')
        print(f"Server: {config['server']}")
        print(f"Claude projects: {config['claude_projects_dir']}")
        print(f"Report interval: {config['report_interval']} minute(s)")
        if config.get('insecure'):
            print('WARNING: SSL certificate verification is disabled')
        if config['config_file'].exists():
            print(f"Config file: {config['config_file']}")
        print('---')

    # Handle graceful shutdown
    def signal_handler(signum, frame):
        print('\nShutting down...')
        state.save()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Initial collection
    success = collect_and_report(config, state)

    if args.once:
        state.save()
        sys.exit(0 if success else 1)

    # Periodic collection
    interval_seconds = config['report_interval'] * 60
    while True:
        time.sleep(interval_seconds)
        collect_and_report(config, state)


if __name__ == '__main__':
    main()
