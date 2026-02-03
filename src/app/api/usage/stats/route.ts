import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import getDb from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '7d';

  // Calculate timestamp range
  const now = Math.floor(Date.now() / 1000);
  let startTime = now - 7 * 24 * 60 * 60; // default 7 days

  if (range === '1d') startTime = now - 24 * 60 * 60;
  else if (range === '7d') startTime = now - 7 * 24 * 60 * 60;
  else if (range === '30d') startTime = now - 30 * 24 * 60 * 60;
  else if (range === 'all') startTime = 0;

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

  // Get daily trend data
  const trendData = db.prepare(`
    SELECT
      DATE(timestamp, 'unixepoch') as date,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens
    FROM usage_records
    WHERE timestamp >= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(startTime);

  return NextResponse.json({
    totalStats: {
      totalInput: totalStats.total_input || 0,
      totalOutput: totalStats.total_output || 0,
      totalTokens: totalStats.total_tokens || 0,
      totalRecords: totalStats.total_records || 0,
    },
    deviceStats,
    trendData,
  });
}
