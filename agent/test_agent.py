"""Tests for agent.py's Codex CLI usage collection support."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import agent  # noqa: E402


# ---------------------------------------------------------------------------
# Config resolution
# ---------------------------------------------------------------------------

def test_get_config_codex_home_defaults_to_dot_codex(tmp_path, monkeypatch):
    monkeypatch.setattr(agent, 'CONFIG_FILE', tmp_path / 'none.conf')
    monkeypatch.delenv('CODEX_HOME', raising=False)
    monkeypatch.delenv('CODEX_DISABLED', raising=False)

    config = agent.get_config()

    assert config['codex_home_dir'] == Path.home() / '.codex'
    assert config['codex_disabled'] is False
    assert config['codex_state_file'] == agent.CODEX_STATE_FILE


def test_get_config_codex_home_env_override(tmp_path, monkeypatch):
    monkeypatch.setattr(agent, 'CONFIG_FILE', tmp_path / 'none.conf')
    monkeypatch.setenv('CODEX_HOME', '/custom/codex')

    config = agent.get_config()

    assert config['codex_home_dir'] == Path('/custom/codex')


def test_get_config_codex_disabled_env_override(tmp_path, monkeypatch):
    monkeypatch.setattr(agent, 'CONFIG_FILE', tmp_path / 'none.conf')
    monkeypatch.setenv('CODEX_DISABLED', 'true')

    config = agent.get_config()

    assert config['codex_disabled'] is True


def test_get_config_codex_home_config_file_fallback(tmp_path, monkeypatch):
    conf = tmp_path / 'agent.conf'
    conf.write_text('CODEX_HOME="/from/config/file"\n')
    monkeypatch.setattr(agent, 'CONFIG_FILE', conf)
    monkeypatch.delenv('CODEX_HOME', raising=False)

    config = agent.get_config()

    assert config['codex_home_dir'] == Path('/from/config/file')


def test_build_parser_accepts_codex_flags():
    parser = agent.build_parser()

    args = parser.parse_args(['--api-key', 'k', '--codex-home', '/tmp/x', '--no-codex'])

    assert args.codex_home == '/tmp/x'
    assert args.no_codex is True


def test_build_parser_codex_flags_default_to_falsy():
    parser = agent.build_parser()

    args = parser.parse_args(['--api-key', 'k'])

    assert args.codex_home is None
    assert args.no_codex is False


# ---------------------------------------------------------------------------
# Codex file discovery
# ---------------------------------------------------------------------------

def test_find_codex_jsonl_files_scans_sessions_and_archived(tmp_path):
    codex_home = tmp_path / '.codex'
    sessions = codex_home / 'sessions' / '2026' / '06' / '21'
    sessions.mkdir(parents=True)
    archived = codex_home / 'archived_sessions'
    archived.mkdir(parents=True)
    (sessions / 'a.jsonl').write_text('{}\n')
    (archived / 'b.jsonl').write_text('{}\n')
    (codex_home / 'stray.jsonl').write_text('{}\n')  # not under sessions/archived_sessions

    files = agent.find_codex_jsonl_files(codex_home)

    assert sorted(f.name for f in files) == ['a.jsonl', 'b.jsonl']


def test_find_codex_jsonl_files_falls_back_to_home_dir(tmp_path):
    codex_home = tmp_path / '.codex'
    codex_home.mkdir()
    (codex_home / 'loose.jsonl').write_text('{}\n')

    files = agent.find_codex_jsonl_files(codex_home)

    assert [f.name for f in files] == ['loose.jsonl']


def test_find_codex_jsonl_files_missing_home_returns_empty(tmp_path):
    assert agent.find_codex_jsonl_files(tmp_path / 'does-not-exist') == []


def test_find_codex_jsonl_files_sorted_by_path(tmp_path):
    codex_home = tmp_path / '.codex'
    sessions = codex_home / 'sessions'
    sessions.mkdir(parents=True)
    (sessions / 'z.jsonl').write_text('{}\n')
    (sessions / 'a.jsonl').write_text('{}\n')

    files = agent.find_codex_jsonl_files(codex_home)

    assert [f.name for f in files] == ['a.jsonl', 'z.jsonl']


# ---------------------------------------------------------------------------
# Codex JSONL parsing
# ---------------------------------------------------------------------------

def _write_session(path: Path, lines):
    path.write_text('\n'.join(json.dumps(line) for line in lines) + '\n')


def _token_count_event(ts, last=None, total=None, session_id=None):
    info = {}
    if last is not None:
        info['last_token_usage'] = last
    if total is not None:
        info['total_token_usage'] = total
    entry = {'timestamp': ts, 'type': 'event_msg', 'payload': {'type': 'token_count', 'info': info}}
    if session_id is not None:
        entry['session_id'] = session_id
    return entry


def _turn_context(model, ts='2026-06-22T02:25:53.138Z', session_id=None):
    entry = {'timestamp': ts, 'type': 'turn_context', 'payload': {'model': model}}
    if session_id is not None:
        entry['session_id'] = session_id
    return entry


class _FakeState:
    """Minimal duck-typed stand-in for agent.State, used where a real state file isn't needed."""

    def __init__(self):
        self.reported = set()

    def is_reported(self, record_id):
        return record_id in self.reported

    def mark_reported(self, record_id):
        self.reported.add(record_id)

    def save(self):
        pass


def test_collect_codex_records_uses_total_usage_delta_when_last_usage_present(tmp_path):
    session = tmp_path / 'session.jsonl'
    _write_session(session, [
        _turn_context('gpt-5.5'),
        _token_count_event(
            '2026-06-22T02:25:58.000Z',
            last={'input_tokens': 11782, 'cached_input_tokens': 2432, 'output_tokens': 221, 'total_tokens': 12003},
            total={'input_tokens': 11782, 'cached_input_tokens': 2432, 'output_tokens': 221, 'total_tokens': 12003},
        ),
        _token_count_event(
            '2026-06-22T02:26:04.000Z',
            # Codex logs can include this field, but ccusage computes the turn
            # from cumulative total_token_usage instead.
            last={'input_tokens': 999999, 'cached_input_tokens': 999999, 'output_tokens': 999999, 'total_tokens': 999999},
            total={'input_tokens': 13000, 'cached_input_tokens': 2500, 'output_tokens': 300, 'total_tokens': 13300},
        ),
    ])

    records = agent.collect_codex_records([session], _FakeState())

    assert len(records) == 2
    first, second = records
    assert first['model'] == 'codex/gpt-5.5'
    assert first['cache_read_tokens'] == 2432
    assert first['cache_create_tokens'] == 0
    assert first['input_tokens'] == 11782 - 2432
    assert first['output_tokens'] == 221
    assert first['total_tokens'] == 11782 + 221
    assert first['session_id'] == 'session'
    assert second['cache_read_tokens'] == 68
    assert second['input_tokens'] == (13000 - 11782) - 68
    assert second['output_tokens'] == 79


def test_collect_codex_records_falls_back_to_total_usage_delta(tmp_path):
    session = tmp_path / 'session.jsonl'
    _write_session(session, [
        _turn_context('gpt-5.5'),
        _token_count_event('2026-06-22T02:25:58.000Z',
                            total={'input_tokens': 1000, 'cached_input_tokens': 100, 'output_tokens': 50, 'total_tokens': 1050}),
        _token_count_event('2026-06-22T02:26:04.000Z',
                            total={'input_tokens': 2500, 'cached_input_tokens': 400, 'output_tokens': 120, 'total_tokens': 2620}),
    ])

    records = agent.collect_codex_records([session], _FakeState())

    assert len(records) == 2
    first, second = records
    assert first['output_tokens'] == 50
    assert first['cache_read_tokens'] == 100
    # Delta of running totals: input 2500-1000=1500, cached 400-100=300, output 120-50=70
    assert second['cache_read_tokens'] == 300
    assert second['input_tokens'] == 1500 - 300
    assert second['output_tokens'] == 70


def test_collect_codex_records_skips_zero_usage_events(tmp_path):
    session = tmp_path / 'session.jsonl'
    _write_session(session, [
        _turn_context('gpt-5.5'),
        _token_count_event('2026-06-22T02:25:58.000Z',
                            total={'input_tokens': 0, 'output_tokens': 0, 'cached_input_tokens': 0, 'total_tokens': 0}),
    ])

    records = agent.collect_codex_records([session], _FakeState())

    assert records == []


def test_collect_codex_records_defaults_model_when_missing(tmp_path):
    session = tmp_path / 'session.jsonl'
    _write_session(session, [
        _token_count_event('2026-06-22T02:25:58.000Z',
                            total={'input_tokens': 10, 'output_tokens': 5, 'cached_input_tokens': 0, 'total_tokens': 15}),
    ])

    records = agent.collect_codex_records([session], _FakeState())

    assert records[0]['model'] == 'codex/unknown'


def test_collect_codex_records_ignores_non_token_count_event_msgs(tmp_path):
    session = tmp_path / 'session.jsonl'
    _write_session(session, [
        _turn_context('gpt-5.5'),
        {'timestamp': '2026-06-22T02:25:55.000Z', 'type': 'event_msg', 'payload': {'type': 'agent_message', 'message': 'hi'}},
        {'timestamp': '2026-06-22T02:25:56.000Z', 'type': 'event_msg', 'payload': {'type': 'task_started'}},
    ])

    records = agent.collect_codex_records([session], _FakeState())

    assert records == []


def test_collect_codex_records_ignores_malformed_lines(tmp_path):
    session = tmp_path / 'session.jsonl'
    session.write_text('not json\n' + json.dumps(_turn_context('gpt-5.5')) + '\n')

    records = agent.collect_codex_records([session], _FakeState())

    assert records == []  # no token_count event present, but no crash either


def test_collect_codex_records_dedups_via_state(tmp_path):
    session = tmp_path / 'session.jsonl'
    _write_session(session, [
        _turn_context('gpt-5.5'),
        _token_count_event('2026-06-22T02:25:58.000Z',
                            total={'input_tokens': 10, 'output_tokens': 5, 'cached_input_tokens': 0, 'total_tokens': 15}),
    ])
    state = _FakeState()

    first_pass = agent.collect_codex_records([session], state)
    assert len(first_pass) == 1
    for r in first_pass:
        state.mark_reported(r['_record_id'])

    second_pass = agent.collect_codex_records([session], state)
    assert second_pass == []


def test_collect_codex_records_dedup_key_survives_session_file_move(tmp_path):
    sessions = tmp_path / 'sessions'
    archived = tmp_path / 'archived_sessions'
    sessions.mkdir()
    archived.mkdir()
    active_session = sessions / 'session.jsonl'
    archived_session = archived / 'session.jsonl'
    entries = [
        _turn_context('gpt-5.5', session_id='codex-session-1'),
        _token_count_event('2026-06-22T02:25:58.000Z',
                            total={'input_tokens': 10, 'output_tokens': 5, 'cached_input_tokens': 0, 'total_tokens': 15},
                            session_id='codex-session-1'),
    ]
    _write_session(active_session, entries)
    _write_session(archived_session, entries)
    state = _FakeState()

    first_pass = agent.collect_codex_records([active_session], state)
    assert len(first_pass) == 1
    assert first_pass[0]['session_id'] == 'codex-session-1'
    for r in first_pass:
        state.mark_reported(r['_record_id'])

    second_pass = agent.collect_codex_records([archived_session], state)
    assert second_pass == []


# ---------------------------------------------------------------------------
# State isolation and report wiring
# ---------------------------------------------------------------------------

def test_codex_state_file_is_independent_of_claude_state_file(tmp_path):
    claude_state_path = tmp_path / 'claude-state.json'
    codex_state_path = tmp_path / 'codex-state.json'
    claude_state_path.write_text(json.dumps({'lastReportedTimestamp': 111, 'reportedRecords': ['claude-1']}))

    claude_state = agent.State(claude_state_path)
    codex_state = agent.State(codex_state_path)
    codex_state.mark_reported('codex-1')
    codex_state.save()

    assert claude_state.is_reported('claude-1')
    assert not claude_state.is_reported('codex-1')
    reloaded_claude = agent.State(claude_state_path)
    assert reloaded_claude.reported_records == {'claude-1'}
    reloaded_codex = agent.State(codex_state_path)
    assert reloaded_codex.reported_records == {'codex-1'}


def _make_record(record_id, state, model='codex/gpt-5.5', session_id='s1', timestamp=1000):
    return {
        'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2,
        'cache_create_tokens': 0, 'cache_read_tokens': 0,
        'session_id': session_id, 'model': model, 'timestamp': timestamp,
        '_record_id': record_id, '_state': state,
    }


def test_send_batch_marks_reported_state_per_record_origin():
    claude_state = _FakeState()
    codex_state = _FakeState()
    claude_record = _make_record('claude-rec-1', claude_state, model='claude-3-5-sonnet')
    codex_record = _make_record('codex-rec-1', codex_state, model='codex/gpt-5.5')

    mock_response = MagicMock()
    mock_response.__enter__.return_value = mock_response
    mock_response.read.return_value = json.dumps({'inserted': 2, 'skipped': 0}).encode()

    with patch.object(agent, 'urlopen', return_value=mock_response):
        ok = agent._send_batch(
            [claude_record, codex_record],
            'http://example.test/api/usage/report',
            {'api_key': 'k'},
        )

    assert ok is True
    assert claude_state.is_reported('claude-rec-1')
    assert codex_state.is_reported('codex-rec-1')
    assert not claude_state.is_reported('codex-rec-1')
    assert not codex_state.is_reported('claude-rec-1')


def test_report_usage_saves_both_states_after_successful_batch():
    claude_state = MagicMock()
    codex_state = MagicMock()
    record = _make_record('codex-rec-1', codex_state, model='codex/gpt-5.5')

    mock_response = MagicMock()
    mock_response.__enter__.return_value = mock_response
    mock_response.read.return_value = json.dumps({'inserted': 1, 'skipped': 0}).encode()

    with patch.object(agent, 'urlopen', return_value=mock_response):
        ok = agent.report_usage([record], {'server': 'http://example.test', 'api_key': 'k'}, claude_state, codex_state)

    assert ok is True
    claude_state.save.assert_called_once()
    codex_state.save.assert_called_once()


def test_collect_and_report_skips_codex_when_disabled(tmp_path):
    config = {
        'server': 'http://example.test',
        'api_key': 'k',
        'claude_projects_dir': tmp_path / 'no-claude-here',
        'codex_home_dir': tmp_path / '.codex',
        'codex_disabled': True,
    }
    (config['codex_home_dir']).mkdir()
    (config['codex_home_dir'] / 'sessions').mkdir()
    (config['codex_home_dir'] / 'sessions' / 'session.jsonl').write_text(
        json.dumps(_token_count_event('2026-06-22T02:25:58.000Z',
                                       total={'input_tokens': 10, 'output_tokens': 5, 'cached_input_tokens': 0, 'total_tokens': 15})) + '\n'
    )
    claude_state = agent.State(tmp_path / 'claude.json')
    codex_state = agent.State(tmp_path / 'codex.json')

    with patch.object(agent, 'report_usage', return_value=True) as mock_report:
        agent.collect_and_report(config, claude_state, codex_state)

    reported_records = mock_report.call_args[0][0]
    assert reported_records == []  # codex_disabled=True means no codex records collected


def test_collect_and_report_includes_codex_records_when_enabled(tmp_path):
    config = {
        'server': 'http://example.test',
        'api_key': 'k',
        'claude_projects_dir': tmp_path / 'no-claude-here',
        'codex_home_dir': tmp_path / '.codex',
        'codex_disabled': False,
    }
    sessions = config['codex_home_dir'] / 'sessions'
    sessions.mkdir(parents=True)
    (sessions / 'session.jsonl').write_text(
        json.dumps(_turn_context('gpt-5.5')) + '\n' +
        json.dumps(_token_count_event('2026-06-22T02:25:58.000Z',
                                       total={'input_tokens': 10, 'output_tokens': 5, 'cached_input_tokens': 0, 'total_tokens': 15})) + '\n'
    )
    claude_state = agent.State(tmp_path / 'claude.json')
    codex_state = agent.State(tmp_path / 'codex.json')

    with patch.object(agent, 'report_usage', return_value=True) as mock_report:
        agent.collect_and_report(config, claude_state, codex_state)

    reported_records = mock_report.call_args[0][0]
    assert len(reported_records) == 1
    assert reported_records[0]['model'] == 'codex/gpt-5.5'
    assert reported_records[0]['_state'] is codex_state
