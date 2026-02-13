import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import getDb from '@/lib/db';

export async function DELETE() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = getDb();

    const count = db.prepare('SELECT COUNT(*) as count FROM usage_records').get() as { count: number };
    db.exec('DELETE FROM usage_records');
    db.exec('VACUUM');

    return NextResponse.json({
      message: 'Usage data cleared successfully',
      deletedCount: count.count,
    });
  } catch (error) {
    console.error('Clear usage data error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
