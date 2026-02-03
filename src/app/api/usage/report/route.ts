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
    // Insert records in a transaction
    const insert = db.prepare(`
      INSERT INTO usage_records (api_key_id, device_name, input_tokens, output_tokens, total_tokens, session_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((records: any[]) => {
      for (const record of records) {
        insert.run(
          keyInfo.id,
          keyInfo.device_name,
          record.input_tokens || 0,
          record.output_tokens || 0,
          record.total_tokens || 0,
          record.session_id || null,
          record.timestamp
        );
      }
    });

    insertMany(records);

    return NextResponse.json({
      success: true,
      inserted: records.length,
    });
  } catch (error) {
    console.error('Error reporting usage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
