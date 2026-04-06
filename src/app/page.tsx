import { sql } from '@/lib/db';
import ChioneCalendar from '@/components/ChioneCalendar';

export const revalidate = 3600; // refresh every hour

export default async function Home() {
  const events = await sql`
    SELECT id, title, sport, event_type, start_date, end_date,
           city, country, source_url, flag_image_url, source_name,
           metadata
    FROM events
    ORDER BY start_date ASC
  `;

  return <ChioneCalendar events={JSON.parse(JSON.stringify(events))} />;
}