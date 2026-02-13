import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import getDb from '@/lib/db';
import { fetchPricing, calculateCostWithPricing } from '@/lib/pricing';

// Supported intervals in minutes
type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d';

function getIntervalMinutes(interval: Interval): number {
  switch (interval) {
    case '1m': return 1;
    case '5m': return 5;
    case '15m': return 15;
    case '30m': return 30;
    case '1h': return 60;
    case '2h': return 120;
    case '4h': return 240;
    case '6h': return 360;
    case '12h': return 720;
    case '1d': return 1440;
    default: return 60;
  }
}

function buildTrendQuery(interval: Interval, deviceCount: number): string {
  const minutes = getIntervalMinutes(interval);
  const intervalSeconds = minutes * 60;
  const deviceFilter = deviceCount > 0 ? `AND device_name IN (${Array(deviceCount).fill('?').join(',')})` : '';

  return `
    SELECT
      (timestamp / ${intervalSeconds}) * ${intervalSeconds} as timestamp,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cache_create_tokens) as cache_create_tokens,
      SUM(cache_read_tokens) as cache_read_tokens
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ? ${deviceFilter}
    GROUP BY (timestamp / ${intervalSeconds})
    ORDER BY timestamp ASC
  `;
}

// Generate complete time series with empty data points filled
function generateCompleteTimeSeries(
  trendData: { timestamp: number; input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }[],
  startTime: number,
  endTime: number,
  interval: Interval
): { timestamp: number; input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }[] {
  const intervalSeconds = getIntervalMinutes(interval) * 60;

  const alignedStart = Math.floor(startTime / intervalSeconds) * intervalSeconds;
  const alignedEnd = Math.floor(endTime / intervalSeconds) * intervalSeconds;

  const dataMap = new Map<number, { input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }>();
  for (const item of trendData) {
    dataMap.set(item.timestamp, {
      input_tokens: item.input_tokens,
      output_tokens: item.output_tokens,
      total_tokens: item.total_tokens,
      cache_create_tokens: item.cache_create_tokens,
      cache_read_tokens: item.cache_read_tokens,
    });
  }

  const result: { timestamp: number; input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }[] = [];
  for (let ts = alignedStart; ts <= alignedEnd; ts += intervalSeconds) {
    const data = dataMap.get(ts);
    result.push({
      timestamp: ts,
      input_tokens: data?.input_tokens || 0,
      output_tokens: data?.output_tokens || 0,
      total_tokens: data?.total_tokens || 0,
      cache_create_tokens: data?.cache_create_tokens || 0,
      cache_read_tokens: data?.cache_read_tokens || 0,
    });
  }

  return result;
}

// Generate complete time series for model trend data
function generateCompleteModelTimeSeries(
  modelTrendData: { timestamp: number; model: string; input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }[],
  startTime: number,
  endTime: number,
  interval: Interval
): { timestamp: number; model: string; input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }[] {
  const intervalSeconds = getIntervalMinutes(interval) * 60;

  const alignedStart = Math.floor(startTime / intervalSeconds) * intervalSeconds;
  const alignedEnd = Math.floor(endTime / intervalSeconds) * intervalSeconds;

  const models = [...new Set(modelTrendData.map(d => d.model))];

  const dataMap = new Map<string, { input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }>();
  for (const item of modelTrendData) {
    const key = `${item.timestamp}-${item.model}`;
    dataMap.set(key, {
      input_tokens: item.input_tokens,
      output_tokens: item.output_tokens,
      total_tokens: item.total_tokens,
      cache_create_tokens: item.cache_create_tokens,
      cache_read_tokens: item.cache_read_tokens,
    });
  }

  const result: { timestamp: number; model: string; input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number }[] = [];
  for (let ts = alignedStart; ts <= alignedEnd; ts += intervalSeconds) {
    for (const model of models) {
      const key = `${ts}-${model}`;
      const data = dataMap.get(key);
      result.push({
        timestamp: ts,
        model,
        input_tokens: data?.input_tokens || 0,
        output_tokens: data?.output_tokens || 0,
        total_tokens: data?.total_tokens || 0,
        cache_create_tokens: data?.cache_create_tokens || 0,
        cache_read_tokens: data?.cache_read_tokens || 0,
      });
    }
  }

  return result;
}

function buildModelTrendQuery(interval: Interval, deviceCount: number): string {
  const minutes = getIntervalMinutes(interval);
  const intervalSeconds = minutes * 60;
  const deviceFilter = deviceCount > 0 ? `AND device_name IN (${Array(deviceCount).fill('?').join(',')})` : '';

  return `
    SELECT
      (timestamp / ${intervalSeconds}) * ${intervalSeconds} as timestamp,
      model,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cache_create_tokens) as cache_create_tokens,
      SUM(cache_read_tokens) as cache_read_tokens
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
  const devicesParam = searchParams.get('devices'); // Optional device filter (comma-separated)

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
    // Auto-select interval to produce ~20-50 data points
    if (rangeSpanDays <= 1) effectiveInterval = '1h';       // ≤1d: hourly (≤24 pts)
    else if (rangeSpanDays <= 3) effectiveInterval = '2h';   // 2-3d: 2-hour (24-36 pts)
    else if (rangeSpanDays <= 7) effectiveInterval = '6h';   // 4-7d: 6-hour (16-28 pts)
    else if (rangeSpanDays <= 14) effectiveInterval = '12h';  // 1-2w: 12-hour (14-28 pts)
    else effectiveInterval = '1d';                            // >2w: daily
  } else {
    effectiveInterval = interval;
  }

  const granularity = effectiveInterval === '1d' ? 'daily' : 'minute';
  const intervalSeconds = getIntervalMinutes(effectiveInterval) * 60;

  const db = getDb();
  const devices = devicesParam ? devicesParam.split(',').filter(Boolean) : [];
  const deviceCount = devices.length;
  const deviceFilter = deviceCount > 0 ? `AND device_name IN (${Array(deviceCount).fill('?').join(',')})` : '';

  // Get list of all available devices (unfiltered by time range and device selection)
  const availableDevices = db.prepare(`
    SELECT DISTINCT device_name
    FROM usage_records
    ORDER BY device_name ASC
  `).all() as { device_name: string }[];

  // Base query params
  const baseParams = deviceCount > 0 ? [startTime, endTime, ...devices] : [startTime, endTime];

  // Get total stats (filtered by device if specified)
  const totalStats = db.prepare(`
    SELECT
      SUM(input_tokens) as total_input,
      SUM(output_tokens) as total_output,
      SUM(total_tokens) as total_tokens,
      SUM(cache_create_tokens) as total_cache_create,
      SUM(cache_read_tokens) as total_cache_read,
      COUNT(*) as total_records
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ? ${deviceFilter}
  `).get(...baseParams) as { total_input: number; total_output: number; total_tokens: number; total_cache_create: number; total_cache_read: number; total_records: number };

  // Get per-device stats (always show all devices for the selector)
  const deviceStats = db.prepare(`
    SELECT
      device_name,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cache_create_tokens) as cache_create_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      COUNT(*) as record_count,
      MAX(timestamp) as last_report
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ?
    GROUP BY device_name
    ORDER BY total_tokens DESC
  `).all(startTime, endTime);

  // Get trend data with selected interval (filtered by device if specified)
  const trendQuery = buildTrendQuery(effectiveInterval, deviceCount);
  const trendDataRaw = db.prepare(trendQuery).all(...baseParams) as {
    timestamp: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cache_create_tokens: number;
    cache_read_tokens: number;
  }[];

  // Fill in missing time points with zero values
  const trendData = generateCompleteTimeSeries(trendDataRaw, startTime, endTime, effectiveInterval);

  // Get model trend data (for per-model charts, filtered by device if specified)
  const modelTrendQuery = buildModelTrendQuery(effectiveInterval, deviceCount);
  const modelTrendRawData = db.prepare(modelTrendQuery).all(...baseParams) as {
    timestamp: number;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cache_create_tokens: number;
    cache_read_tokens: number;
  }[];

  // Fill in missing time points for model trend data
  const modelTrendRaw = generateCompleteModelTimeSeries(modelTrendRawData, startTime, endTime, effectiveInterval);

  // Get per-model stats (filtered by device if specified, exclude unknown models)
  const modelStats = db.prepare(`
    SELECT
      model,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cache_create_tokens) as cache_create_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      COUNT(*) as record_count
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ? ${deviceFilter}
      AND model IS NOT NULL AND model != '' AND LOWER(model) != 'unknown'
    GROUP BY model
    ORDER BY total_tokens DESC
  `).all(...baseParams) as { model: string; input_tokens: number; output_tokens: number; total_tokens: number; cache_create_tokens: number; cache_read_tokens: number; record_count: number }[];

  // ---- Cost calculation: per-record to match ccusage CLI behavior ----
  // Fetch pricing once, then calculate cost per individual record
  const pricing = await fetchPricing();

  // Query all individual records for cost calculation (with bucket timestamp for trend cost)
  const costRecords = db.prepare(`
    SELECT
      model, device_name, input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
      (timestamp / ${intervalSeconds}) * ${intervalSeconds} as bucket_ts
    FROM usage_records
    WHERE timestamp >= ? AND timestamp <= ?
      AND model IS NOT NULL AND model != '' AND LOWER(model) != 'unknown'
  `).all(startTime, endTime) as {
    model: string; device_name: string;
    input_tokens: number; output_tokens: number;
    cache_create_tokens: number; cache_read_tokens: number;
    bucket_ts: number;
  }[];

  // Calculate per-record cost and aggregate into different views
  let totalCost = 0;
  const deviceCostMap = new Map<string, number>();
  const modelCostMap = new Map<string, number>();
  const trendCostMap = new Map<number, number>();
  const modelTrendCostMap = new Map<string, number>(); // "bucket_ts-model" -> cost

  for (const r of costRecords) {
    const cost = calculateCostWithPricing(pricing, r.model, r.input_tokens, r.output_tokens, r.cache_create_tokens, r.cache_read_tokens);

    // Per-device cost (unfiltered by device)
    deviceCostMap.set(r.device_name, (deviceCostMap.get(r.device_name) || 0) + cost);

    // Apply device filter for total, per-model, trend costs
    if (deviceCount > 0 && !devices.includes(r.device_name)) continue;

    totalCost += cost;
    modelCostMap.set(r.model, (modelCostMap.get(r.model) || 0) + cost);
    trendCostMap.set(r.bucket_ts, (trendCostMap.get(r.bucket_ts) || 0) + cost);

    const mtKey = `${r.bucket_ts}-${r.model}`;
    modelTrendCostMap.set(mtKey, (modelTrendCostMap.get(mtKey) || 0) + cost);
  }

  // Attach costs to device stats
  const deviceStatsWithCost = (deviceStats as any[]).map(d => ({
    ...d,
    cost: deviceCostMap.get(d.device_name) || 0,
  }));

  // Attach costs to model stats
  const modelStatsWithCost = modelStats.map(m => ({
    ...m,
    cost: modelCostMap.get(m.model) || 0,
  }));

  // Attach costs to trend data
  const trendDataWithCost = trendData.map(d => ({
    ...d,
    cost: trendCostMap.get(d.timestamp) || 0,
  }));

  // Attach costs to model trend data
  const modelTrendWithCost = modelTrendRaw.map(d => ({
    ...d,
    cost: modelTrendCostMap.get(`${d.timestamp}-${d.model}`) || 0,
  }));

  return NextResponse.json({
    totalStats: {
      totalInput: totalStats.total_input || 0,
      totalOutput: totalStats.total_output || 0,
      totalTokens: totalStats.total_tokens || 0,
      totalCacheCreate: totalStats.total_cache_create || 0,
      totalCacheRead: totalStats.total_cache_read || 0,
      totalRecords: totalStats.total_records || 0,
      totalCost,
    },
    deviceStats: deviceStatsWithCost,
    availableDevices: availableDevices.map(d => d.device_name),
    trendData: trendDataWithCost,
    modelTrendData: modelTrendWithCost,
    modelStats: modelStatsWithCost,
    granularity,
    interval: effectiveInterval,
  });
}
