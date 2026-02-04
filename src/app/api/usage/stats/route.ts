import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import getDb from '@/lib/db';

// Supported intervals in minutes
type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d';

function getIntervalMinutes(interval: Interval): number {
  switch (interval) {
    case '1m': return 1;
    case '5m': return 5;
    case '15m': return 15;
    case '30m': return 30;
    case '1h': return 60;
    case '1d': return 1440;
    default: return 60;
  }
}

function buildTrendQuery(interval: Interval, hasDevice: boolean): string {
  const minutes = getIntervalMinutes(interval);
  const intervalSeconds = minutes * 60;
  const deviceFilter = hasDevice ? 'AND device_name = ?' : '';

  return `
    SELECT
      (timestamp / ${intervalSeconds}) * ${intervalSeconds} as timestamp,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ? ${deviceFilter}
    GROUP BY (timestamp / ${intervalSeconds})
    ORDER BY timestamp ASC
  `;
}

function buildModelTrendQuery(interval: Interval, hasDevice: boolean): string {
  const minutes = getIntervalMinutes(interval);
  const intervalSeconds = minutes * 60;
  const deviceFilter = hasDevice ? 'AND device_name = ?' : '';

  return `
    SELECT
      (timestamp / ${intervalSeconds}) * ${intervalSeconds} as timestamp,
      model,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ? ${deviceFilter}
      AND model IS NOT NULL AND model != '' AND LOWER(model) != 'unknown'
    GROUP BY (timestamp / ${intervalSeconds}), model
    ORDER BY timestamp ASC, model ASC
  `;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || 'today';
  const interval = (searchParams.get('interval') || 'auto') as Interval | 'auto';
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const deviceParam = searchParams.get('device'); // Optional device filter

  // Calculate timestamp range
  const now = Math.floor(Date.now() / 1000);
  let startTime: number;
  let endTime: number = now;

  if (fromParam && toParam) {
    // Custom date range
    startTime = parseInt(fromParam, 10);
    endTime = parseInt(toParam, 10);
  } else if (range === 'today') {
    // Today: from midnight local time
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startTime = Math.floor(today.getTime() / 1000);
  } else if (range === '7d') {
    startTime = now - 7 * 24 * 60 * 60;
  } else if (range === '30d') {
    startTime = now - 30 * 24 * 60 * 60;
  } else if (range === 'all') {
    startTime = 0;
  } else {
    // Default to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startTime = Math.floor(today.getTime() / 1000);
  }

  // Calculate date range span to determine auto interval
  const rangeSpanDays = (endTime - startTime) / (24 * 60 * 60);

  // Determine granularity based on interval or auto-select based on range
  let effectiveInterval: Interval;
  if (interval === 'auto') {
    // Auto-select reasonable interval based on date span
    if (rangeSpanDays <= 1) effectiveInterval = '1h';
    else if (rangeSpanDays <= 7) effectiveInterval = '1d';
    else effectiveInterval = '1d';
  } else {
    effectiveInterval = interval;
  }

  const granularity = effectiveInterval === '1d' ? 'daily' : 'minute';

  const db = getDb();
  const hasDevice = !!deviceParam;
  const deviceFilter = hasDevice ? 'AND device_name = ?' : '';

  // Get list of all available devices (unfiltered by device selection)
  const availableDevices = db.prepare(`
    SELECT DISTINCT device_name
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY device_name ASC
  `).all(startTime, endTime) as { device_name: string }[];

  // Base query params
  const baseParams = hasDevice ? [startTime, endTime, deviceParam] : [startTime, endTime];

  // Get total stats (filtered by device if specified)
  const totalStats = db.prepare(`
    SELECT
      SUM(input_tokens) as total_input,
      SUM(output_tokens) as total_output,
      SUM(total_tokens) as total_tokens,
      COUNT(*) as total_records
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ? ${deviceFilter}
  `).get(...baseParams) as { total_input: number; total_output: number; total_tokens: number; total_records: number };

  // Get per-device stats (always show all devices for the selector)
  const deviceStats = db.prepare(`
    SELECT
      device_name,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      COUNT(*) as record_count,
      MAX(timestamp) as last_report
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ?
    GROUP BY device_name
    ORDER BY total_tokens DESC
  `).all(startTime, endTime);

  // Get trend data with selected interval (filtered by device if specified)
  const trendQuery = buildTrendQuery(effectiveInterval, hasDevice);
  const trendData = db.prepare(trendQuery).all(...baseParams);

  // Get model trend data (for per-model charts, filtered by device if specified)
  const modelTrendQuery = buildModelTrendQuery(effectiveInterval, hasDevice);
  const modelTrendRaw = db.prepare(modelTrendQuery).all(...baseParams) as {
    timestamp: number;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }[];

  // Get per-model stats (filtered by device if specified, exclude unknown models)
  const modelStats = db.prepare(`
    SELECT
      model,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      COUNT(*) as record_count
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ? ${deviceFilter}
      AND model IS NOT NULL AND model != '' AND LOWER(model) != 'unknown'
    GROUP BY model
    ORDER BY total_tokens DESC
  `).all(...baseParams) as { model: string; input_tokens: number; output_tokens: number; total_tokens: number; record_count: number }[];

  return NextResponse.json({
    totalStats: {
      totalInput: totalStats.total_input || 0,
      totalOutput: totalStats.total_output || 0,
      totalTokens: totalStats.total_tokens || 0,
      totalRecords: totalStats.total_records || 0,
    },
    deviceStats,
    availableDevices: availableDevices.map(d => d.device_name),
    trendData,
    modelTrendData: modelTrendRaw,
    modelStats,
    granularity,
    interval: effectiveInterval,
  });
}
