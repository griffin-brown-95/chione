import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { enrichEvent } from '@/lib/enrich';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Process in batches of 10 to avoid timeout
  const batch = await sql`
    SELECT id, title, sport, city, country, event_type
    FROM events
    WHERE airports IS NULL
    LIMIT 10
  `;

  if (batch.length === 0) {
    return NextResponse.json({ message: 'All events enriched' });
  }

  let enriched = 0;
  for (const event of batch) {
    const result = await enrichEvent(event as any);
    if (result) {
      await sql`
        UPDATE events SET
          airports = ${result.airports},
          city_description = ${result.city_description},
          travel_tips = ${result.travel_tips},
          updated_at = now()
        WHERE id = ${event.id}
      `;
      enriched++;
    }
  }

  const remaining = await sql`SELECT COUNT(*) FROM events WHERE airports IS NULL`;

  return NextResponse.json({
    message: `Enriched ${enriched} events`,
    remaining: Number(remaining[0].count),
  });
}