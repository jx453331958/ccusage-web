import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey } from '@/lib/auth';
import getDb from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    const keyInfo = verifyApiKey(apiKey);

    if (!keyInfo) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const { records } = await request.json();

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'Records must be a non-empty array' }, { status: 400 });
    }

    const db = getDb();

    // Dedup check: (device_name, timestamp, model, input_tokens, output_tokens, cache_create_tokens, cache_read_tokens)
    const checkExists = db.prepare(`
      SELECT 1 FROM usage_records
      WHERE device_name = ? AND timestamp = ? AND model = ?
        AND input_tokens = ? AND output_tokens = ?
        AND cache_create_tokens = ? AND cache_read_tokens = ?
      LIMIT 1
    `);

    const insert = db.prepare(`
      INSERT INTO usage_records (api_key_id, device_name, input_tokens, output_tokens, total_tokens, cache_create_tokens, cache_read_tokens, session_id, model, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    let skipped = 0;
    let invalid = 0;

    // Process each record individually - don't let one bad record kill the whole batch
    for (const record of records) {
      try {
        const timestamp = record.timestamp ?? null;
        if (timestamp == null) {
          invalid++;
          continue;
        }

        const inputTokens = Number(record.input_tokens) || 0;
        const outputTokens = Number(record.output_tokens) || 0;
        const totalTokens = Number(record.total_tokens) || 0;
        const cacheCreate = Number(record.cache_create_tokens) || 0;
        const cacheRead = Number(record.cache_read_tokens) || 0;
        const model = String(record.model || 'unknown');
        const sessionId = record.session_id != null ? String(record.session_id) : null;

        // Skip if duplicate
        const exists = checkExists.get(
          keyInfo.device_name, timestamp, model,
          inputTokens, outputTokens, cacheCreate, cacheRead
        );
        if (exists) {
          skipped++;
          continue;
        }

        insert.run(
          keyInfo.id,
          keyInfo.device_name,
          inputTokens,
          outputTokens,
          totalTokens,
          cacheCreate,
          cacheRead,
          sessionId,
          model,
          timestamp
        );
        inserted++;
      } catch (recordError) {
        console.error('Skipping bad record:', recordError instanceof Error ? recordError.message : recordError, JSON.stringify(record).slice(0, 200));
        invalid++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      ...(invalid > 0 && { invalid }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error reporting usage:', message);
    return NextResponse.json({ error: `Internal server error: ${message}` }, { status: 500 });
  }
}
