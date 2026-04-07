import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { scrapeAllFIS, buildFeedUrls, getDefaultSeasonCodes } from '@/lib/scrapers/fis';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional ?seasons=2026,2027 override — defaults to current + next season
  const seasonsParam = req.nextUrl.searchParams.get('seasons');
  const seasonCodes = seasonsParam
    ? seasonsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 2000)
    : getDefaultSeasonCodes();

  // Build and log the full URL matrix so you can see exactly what will be fetched
  const feedUrls = buildFeedUrls(seasonCodes);
  console.log(`[cron/fis] Fetching ${feedUrls.length} feeds for seasons: ${seasonCodes.join(', ')}`);

  const events = await scrapeAllFIS(seasonCodes);
  console.log(`[cron/fis] Total events fetched: ${events.length}`);

  let upserted = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await sql`
        INSERT INTO events (
          title, sport, source_name, source_url,
          start_date, end_date, city, country, event_type, metadata
        ) VALUES (
          ${event.title},
          ${event.sport},
          ${event.source_name},
          ${event.source_url},
          ${event.start_date},
          ${event.end_date ?? null},
          ${event.city ?? null},
          ${event.country ?? null},
          ${event.event_type ?? null},
          ${JSON.stringify(event.metadata)}::jsonb
        )
        ON CONFLICT (source_url) DO UPDATE SET
          title      = excluded.title,
          start_date = excluded.start_date,
          end_date   = excluded.end_date,
          city       = excluded.city,
          country    = excluded.country,
          event_type = excluded.event_type,
          metadata   = excluded.metadata,
          updated_at = now()
      `;
      upserted++;
    } catch (err) {
      console.error(`[cron/fis] Failed to upsert: ${event.source_url}`, err);
      failed++;
    }
  }

  return NextResponse.json({
    seasons:   seasonCodes,
    feeds:     feedUrls.length,
    total:     events.length,
    upserted,
    failed,
    feed_urls: feedUrls,
  });
}
