import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { scrapeAllFIS } from '@/lib/scrapers/fis';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron/fis] Starting FIS scrape...');
  const events = await scrapeAllFIS();
  console.log(`[cron/fis] Total events scraped: ${events.length}`);

  let inserted = 0;
  let skipped = 0;

  for (const event of events) {
    const existing = await sql`
      SELECT id FROM events WHERE source_url = ${event.source_url}
    `;

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await sql`
      INSERT INTO events (
        title, sport, source_name, source_url,
        start_date, end_date, city, country, event_type
      ) VALUES (
        ${event.title}, ${event.sport}, ${event.source_name}, ${event.source_url},
        ${event.start_date}, ${event.end_date ?? null}, ${event.city ?? null},
        ${event.country ?? null}, ${event.event_type ?? null}
      )
    `;

    inserted++;
  }

  return NextResponse.json({
    message: `FIS scrape complete`,
    total: events.length,
    inserted,
    skipped,
  });
}