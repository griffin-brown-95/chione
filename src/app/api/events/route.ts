import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const events = await sql`
  SELECT id, title, sport, event_type, start_date, end_date,
         city, country, source_url, flag_image_url,
         airports, city_description, travel_tips
  FROM events
  ORDER BY start_date ASC
`;
  return NextResponse.json(events);
}