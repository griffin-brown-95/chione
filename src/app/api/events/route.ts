import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const events = await sql`
    SELECT * FROM events 
    ORDER BY start_date ASC
  `;
  return NextResponse.json(events);
}