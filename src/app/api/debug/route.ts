import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const result = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'events'
    ORDER BY column_name
  `;
  return NextResponse.json({ columns: result.map(r => r.column_name) });
}