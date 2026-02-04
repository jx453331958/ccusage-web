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
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from typing import Dict, List, Set, Optional, Any

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

    return {
        'server': get_value('CCUSAGE_SERVER', 'http://localhost:3000'),
        'api_key': get_value('CCUSAGE_API_KEY', ''),
        'claude_projects_dir': Path(get_value(
            'CLAUDE_PROJECTS_DIR',
            str(Path.home() / '.claude' / 'projects')
        )),
        'report_interval': interval,
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


def find_jsonl_files(directory: Path) -> List[Path]:
    """Recursively find all .jsonl files in directory."""
    files = []
    if not directory.exists():
        return files

    try:
        for item in directory.rglob('*.jsonl'):
            if item.is_file():
                files.append(item)
    except PermissionError:
        pass

    return files


def extract_model(entry: Dict) -> Optional[str]:
    """Extract model from an entry (supports multiple formats)."""
    if entry.get('message', {}).get('model'):
        return entry['message']['model']
    if entry.get('model'):
        return entry['model']
    if entry.get('response', {}).get('model'):
        return entry['response']['model']
    return None


def extract_usage(entry: Dict) -> Optional[Dict]:
    """Extract usage from an entry (supports multiple formats)."""
    usage = None

    # Format 1: Direct usage object (type: "usage")
    if entry.get('type') == 'usage' and entry.get('usage'):
        usage = entry['usage']
    # Format 2: Assistant message with usage
    elif entry.get('type') == 'assistant' and entry.get('message', {}).get('usage'):
        usage = entry['message']['usage']
    # Format 3: Top-level usage field
    elif entry.get('usage') and (entry['usage'].get('input_tokens') or entry['usage'].get('output_tokens')):
        usage = entry['usage']
    # Format 4: ccusage format (inputTokens/outputTokens)
    elif entry.get('inputTokens') is not None or entry.get('outputTokens') is not None:
        usage = {
            'input_tokens': entry.get('inputTokens', 0),
            'output_tokens': entry.get('outputTokens', 0),
        }
    # Format 5: Nested in response
    elif entry.get('response', {}).get('usage'):
        usage = entry['response']['usage']

    if usage:
        model = extract_model(entry)
        if model:
            usage['model'] = model

    return usage


def parse_jsonl_file(file_path: Path, state: State) -> List[Dict]:
    """Parse a JSONL file and extract usage records."""
    records = []

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                    usage = extract_usage(entry)

                    if not usage:
                        continue

                    input_tokens = usage.get('input_tokens') or usage.get('inputTokens') or 0
                    output_tokens = usage.get('output_tokens') or usage.get('outputTokens') or 0

                    # Skip empty usage
                    if input_tokens == 0 and output_tokens == 0:
                        continue

                    # Get timestamp
                    timestamp = entry.get('timestamp')
                    if timestamp:
                        if isinstance(timestamp, str):
                            # Try to parse ISO format
                            try:
                                from datetime import datetime
                                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                                timestamp = int(dt.timestamp())
                            except Exception:
                                timestamp = int(time.time())
                        else:
                            timestamp = int(timestamp)
                    else:
                        timestamp = int(time.time())

                    # Create unique record ID
                    record_id = f'{file_path}:{timestamp}:{input_tokens}:{output_tokens}'

                    # Skip if already reported
                    if state.is_reported(record_id):
                        continue

                    records.append({
                        'input_tokens': input_tokens,
                        'output_tokens': output_tokens,
                        'total_tokens': input_tokens + output_tokens,
                        'session_id': entry.get('sessionId') or entry.get('session_id'),
                        'model': usage.get('model'),
                        'timestamp': timestamp,
                        '_record_id': record_id,
                    })

                except json.JSONDecodeError:
                    continue

    except Exception as e:
        print(f'Error reading {file_path}: {e}', file=sys.stderr)

    return records


def report_usage(records: List[Dict], config: Dict, state: State) -> bool:
    """Report usage records to the server."""
    if not records:
        print('No new records to report')
        return True

    server = config['server'].rstrip('/')
    url = f"{server}/api/usage/report"

    payload = {
        'records': [
            {
                'input_tokens': r['input_tokens'],
                'output_tokens': r['output_tokens'],
                'total_tokens': r['total_tokens'],
                'session_id': r['session_id'],
                'model': r['model'],
                'timestamp': r['timestamp'],
            }
            for r in records
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
            },
            method='POST',
        )

        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"✓ Reported {result.get('inserted', len(records))} records successfully")

            # Mark records as reported
            for r in records:
                state.mark_reported(r['_record_id'])
            state.save()
            return True

    except HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ''
        print(f'✗ Failed to report usage: {e.code} {error_body}', file=sys.stderr)
        return False
    except URLError as e:
        print(f'✗ Network error: {e.reason}', file=sys.stderr)
        return False
    except Exception as e:
        print(f'✗ Error: {e}', file=sys.stderr)
        return False


def collect_and_report(config: Dict, state: State, quiet: bool = False):
    """Collect usage data and report to server."""
    if not quiet:
        print(f'[{time.strftime("%H:%M:%S")}] Collecting usage data...')

    files = find_jsonl_files(config['claude_projects_dir'])
    if not quiet:
        print(f'Found {len(files)} JSONL files')

    all_records = []
    for file_path in files:
        records = parse_jsonl_file(file_path, state)
        all_records.extend(records)

    if not quiet:
        print(f'Collected {len(all_records)} new records')

    report_usage(all_records, config, state)

    if not quiet:
        print('---')


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

Examples:
  # Run with 1-minute interval
  python3 agent.py --server http://localhost:3000 --api-key KEY --interval 1

  # Run once (for cron)
  python3 agent.py --once
        '''
    )
    parser.add_argument('--server', help='Server URL (default: http://localhost:3000)')
    parser.add_argument('--api-key', help='API key for authentication')
    parser.add_argument('--interval', type=int, help='Report interval in minutes (1-1440)')
    parser.add_argument('--once', action='store_true', help='Run once and exit')

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

    # Validate API key
    if not config['api_key']:
        print('Error: API key is required. Use --api-key or set CCUSAGE_API_KEY.', file=sys.stderr)
        sys.exit(1)

    state = State(config['state_file'])

    if not args.once:
        print('CCUsage Agent started')
        print(f"Server: {config['server']}")
        print(f"Claude projects: {config['claude_projects_dir']}")
        print(f"Report interval: {config['report_interval']} minute(s)")
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
    collect_and_report(config, state, quiet=args.once)

    if args.once:
        state.save()
        sys.exit(0)

    # Periodic collection
    interval_seconds = config['report_interval'] * 60
    while True:
        time.sleep(interval_seconds)
        collect_and_report(config, state)


if __name__ == '__main__':
    main()
