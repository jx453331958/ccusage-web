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

function buildTrendQuery(interval: Interval): string {
  const minutes = getIntervalMinutes(interval);
  const intervalSeconds = minutes * 60;

  // Return the floored timestamp for frontend to format in user's timezone
  return `
    SELECT
      (timestamp / ${intervalSeconds}) * ${intervalSeconds} as timestamp,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens
    FROM usage_records
    WHERE timestamp >= ?
    GROUP BY (timestamp / ${intervalSeconds})
    ORDER BY timestamp ASC
  `;
}

function buildModelTrendQuery(interval: Interval): string {
  const minutes = getIntervalMinutes(interval);
  const intervalSeconds = minutes * 60;

  // Return trend data grouped by model
  return `
    SELECT
      (timestamp / ${intervalSeconds}) * ${intervalSeconds} as timestamp,
      model,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens
    FROM usage_records
    WHERE timestamp >= ?
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
  const range = searchParams.get('range') || '7d';
  const interval = (searchParams.get('interval') || 'auto') as Interval | 'auto';

  // Calculate timestamp range
  const now = Math.floor(Date.now() / 1000);
  let startTime = now - 7 * 24 * 60 * 60; // default 7 days

  if (range === '1d') startTime = now - 24 * 60 * 60;
  else if (range === '7d') startTime = now - 7 * 24 * 60 * 60;
  else if (range === '30d') startTime = now - 30 * 24 * 60 * 60;
  else if (range === 'all') startTime = 0;

  // Determine granularity based on interval or auto-select based on range
  let effectiveInterval: Interval;
  if (interval === 'auto') {
    // Auto-select reasonable interval based on range
    if (range === '1d') effectiveInterval = '1h';
    else if (range === '7d') effectiveInterval = '1d';
    else effectiveInterval = '1d';
  } else {
    effectiveInterval = interval;
  }

  const granularity = effectiveInterval === '1d' ? 'daily' : 'minute';

  const db = getDb();
  // Get total stats
  const totalStats = db.prepare(`
    SELECT
      SUM(input_tokens) as total_input,
      SUM(output_tokens) as total_output,
      SUM(total_tokens) as total_tokens,
      COUNT(*) as total_records
    FROM usage_records
    WHERE timestamp >= ?
  `).get(startTime) as { total_input: number; total_output: number; total_tokens: number; total_records: number };

  // Get per-device stats
  const deviceStats = db.prepare(`
    SELECT
      device_name,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      COUNT(*) as record_count,
      MAX(timestamp) as last_report
    FROM usage_records
    WHERE timestamp >= ?
    GROUP BY device_name
    ORDER BY total_tokens DESC
  `).all(startTime);

  // Get trend data with selected interval
  const trendQuery = buildTrendQuery(effectiveInterval);
  const trendData = db.prepare(trendQuery).all(startTime);

  // Get model trend data (for per-model charts)
  const modelTrendQuery = buildModelTrendQuery(effectiveInterval);
  const modelTrendRaw = db.prepare(modelTrendQuery).all(startTime) as {
    timestamp: number;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }[];

  // Get per-model stats
  const modelStats = db.prepare(`
    SELECT
      model,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      COUNT(*) as record_count
    FROM usage_records
    WHERE timestamp >= ?
    GROUP BY model
    ORDER BY total_tokens DESC
  `).all(startTime) as { model: string; input_tokens: number; output_tokens: number; total_tokens: number; record_count: number }[];

  return NextResponse.json({
    totalStats: {
      totalInput: totalStats.total_input || 0,
      totalOutput: totalStats.total_output || 0,
      totalTokens: totalStats.total_tokens || 0,
      totalRecords: totalStats.total_records || 0,
    },
    deviceStats,
    trendData,
    modelTrendData: modelTrendRaw,
    modelStats,
    granularity,
    interval: effectiveInterval,
  });
}
