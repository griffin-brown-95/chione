import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get events starting in the next 30 days
  const events = await sql`
    SELECT title, sport, event_type, start_date, end_date, city, country, source_url
    FROM events
    WHERE start_date >= CURRENT_DATE
      AND start_date <= CURRENT_DATE + INTERVAL '30 days'
    ORDER BY start_date ASC
  `;

  if (events.length === 0) {
    return NextResponse.json({ message: 'No upcoming events, digest skipped' });
  }

  const subscribers = await sql`
    SELECT email, token FROM subscribers WHERE confirmed = true
  `;

  if (subscribers.length === 0) {
    return NextResponse.json({ message: 'No subscribers' });
  }

  const eventRows = events.map(e => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #1e293b;">
        <div style="font-weight: 600; color: #e2e8f0;">${e.title}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
          ${formatDate(e.start_date, e.end_date)} · ${[e.city, e.country].filter(Boolean).join(', ')}
        </div>
        <div style="font-size: 12px; color: #475569; margin-top: 2px;">${e.sport} · ${e.event_type}</div>
      </td>
    </tr>
  `).join('');

  let sent = 0;
  for (const sub of subscribers) {
    // hard coded for now
    const unsubUrl = process.env.BASE_URL + '/api/unsubscribe?token=' + (sub.token as string);
    await resend.emails.send({
      from: 'Chione <onboarding@resend.dev>',
      to: sub.email,
      subject: `Chione · Upcoming Events`,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background: #0a0f1e; color: #e2e8f0; padding: 32px; border-radius: 8px;">
          <div style="font-size: 20px; font-weight: 700; letter-spacing: 0.15em; margin-bottom: 8px;">CHIONE</div>
          <div style="font-size: 13px; color: #475569; margin-bottom: 32px;">WINTER OLYMPIC EVENTS · WEEKLY DIGEST</div>
          <table style="width: 100%; border-collapse: collapse;">
            ${eventRows}
          </table>
          <div style="margin-top: 32px; text-align: center;">
            <a href="${process.env.BASE_URL}" style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
              View full calendar →
            </a>
          </div>
          <div style="margin-top: 32px; font-size: 11px; color: #334155; text-align: center;">
            <a href="${process.env.BASE_URL}" style="color: #475569;">Unsubscribe</a>
          </div>
        </div>
      `,
    });
    sent++;
  }

  return NextResponse.json({ message: `Digest sent to ${sent} subscribers` });
}

function formatDate(start: string, end: string | null): string {
  const s = new Date(start);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!end || end === start) return s.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}