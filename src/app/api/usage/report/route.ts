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

    const insertMany = db.transaction((records: any[]) => {
      for (const record of records) {
        const inputTokens = record.input_tokens || 0;
        const outputTokens = record.output_tokens || 0;
        const cacheCreate = record.cache_create_tokens || 0;
        const cacheRead = record.cache_read_tokens || 0;
        const model = record.model || 'unknown';
        const timestamp = record.timestamp;

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
          record.total_tokens || 0,
          cacheCreate,
          cacheRead,
          record.session_id || null,
          model,
          timestamp
        );
        inserted++;
      }
    });

    insertMany(records);

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
    });
  } catch (error) {
    console.error('Error reporting usage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
