import { sql } from '@/lib/db';
import { transformISUEvents } from '@/lib/transformers/isu';
import { enrichEvent } from '@/lib/enrich';

// Map your Browse.ai robot IDs to transformer functions
const ROBOT_TRANSFORMERS: Record<string, (payload: any) => any[]> = {
  [process.env.BROWSE_AI_ROBOT_ISU ?? '']: transformISUEvents,
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const robotId = payload?.task?.robotId ?? payload?.result?.robotId;

    const transformer = ROBOT_TRANSFORMERS[robotId];
    if (!transformer) {
      console.warn(`Unknown robot ID: ${robotId}`);
      return Response.json({ error: 'Unknown robot' }, { status: 400 });
    }

    const events = transformer(payload);

    // Upsert each event — update if source_url already exists
    for (const event of events) {
      // Check if event already exists
      const existing = await sql`
        SELECT id FROM events WHERE source_url = ${event.source_url}
      `;

      const isNew = existing.length === 0;

      // Upsert the event
      await sql`
        insert into events (
          title, start_date, end_date, source_url, source_name,
          sport, event_type, city, country, flag_image_url
        ) values (
          ${event.title}, ${event.start_date}, ${event.end_date},
          ${event.source_url}, ${event.source_name}, ${event.sport},
          ${event.event_type}, ${event.city}, ${event.country},
          ${event.flag_image_url}
        )
        on conflict (source_url) do update set
          title = excluded.title,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          sport = excluded.sport,
          event_type = excluded.event_type,
          city = excluded.city,
          country = excluded.country,
          flag_image_url = excluded.flag_image_url,
          updated_at = now()
      `;
      

      // Only enrich brand new events
      if (isNew) {
        console.log(`[webhook] Starting enrichment for: ${event.title}`);
        const enrichment = await enrichEvent(event);
        console.log(`[webhook] Enrichment result:`, enrichment);
        if (enrichment) {
          await sql`
            UPDATE events SET
              airports = ${enrichment.airports},
              city_description = ${enrichment.city_description},
              travel_tips = ${enrichment.travel_tips}
            WHERE source_url = ${event.source_url}
          `;
        }
      }
    }

    // ← ADD THIS
    return Response.json({ success: true, count: events.length });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
