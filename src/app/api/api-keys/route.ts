import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, generateApiKey } from '@/lib/auth';
import getDb, { type ApiKey } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = getDb();
  const apiKeys = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as ApiKey[];

  return NextResponse.json({ apiKeys });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { device_name } = await request.json();

    if (!device_name) {
      return NextResponse.json({ error: 'Device name is required' }, { status: 400 });
    }

    const db = getDb();
    const key = generateApiKey();
    const result = db.prepare('INSERT INTO api_keys (key, device_name) VALUES (?, ?)').run(key, device_name);

    return NextResponse.json({
      apiKey: {
        id: result.lastInsertRowid,
        key,
        device_name,
        created_at: Math.floor(Date.now() / 1000),
        last_used_at: null,
      },
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
