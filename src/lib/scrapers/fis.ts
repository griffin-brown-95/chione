// FIS iCalendar feed scraper
//
// FIS publishes per-discipline, per-category iCal feeds at:
//   https://data.fis-ski.com/services/public/icalendar-feed-fis-events.html
//     ?seasoncode=2026&sectorcode=CC&categorycode=WC
//
// Both sectorcode and categorycode are required.
// Each VEVENT represents a single race (not a multi-day event stop),
// so a World Cup weekend generates multiple rows — one per race.
// The UID field is stable across fetches and used to build a canonical source_url.

export interface FISEvent {
  title: string;
  sport: string;
  source_name: 'FIS';
  source_url: string;
  start_date: string;
  end_date: string | null;
  city: string | null;
  country: string | null;
  event_type: string | null;
  metadata: Record<string, unknown>;
}

// ─── Feed matrix ─────────────────────────────────────────────────────────────

const FIS_FEEDS: { sectorcode: string; sport: string; categorycodes: string[] }[] = [
  { sectorcode: 'AL', sport: 'Alpine Skiing',    categorycodes: ['WC', 'WSC', 'OWG'] },
  { sectorcode: 'CC', sport: 'Cross Country',    categorycodes: ['WC', 'WSC', 'OWG'] },
  { sectorcode: 'JP', sport: 'Ski Jumping',      categorycodes: ['WC', 'WSC', 'OWG'] },
  { sectorcode: 'FS', sport: 'Freestyle',        categorycodes: ['WC', 'WSC', 'OWG'] },
  { sectorcode: 'SB', sport: 'Snowboard',        categorycodes: ['WC', 'WSC', 'OWG'] },
  { sectorcode: 'NK', sport: 'Nordic Combined',  categorycodes: ['WC', 'WSC', 'OWG'] },
  { sectorcode: 'FR', sport: 'Freeride',         categorycodes: ['WC', 'WSC'] },
];

// Maps the "Category:" line in DESCRIPTION to our event_type values
const CATEGORY_TYPE_MAP: [string, string][] = [
  ['olympic winter games',       'Olympics'],
  ['world championships',        'World Championships'],
  ['world junior championships', 'Junior World Championships'],
  ['world cup',                  'World Cup'],
  ['europa cup',                 'European Cup'],
  ['continental cup',            'Continental Cup'],
];

// ─── Season codes ─────────────────────────────────────────────────────────────

// FIS season code = the year the season ends.
// e.g. the 2025/26 season has code 2026.
// If the current month is August or later, the new season has started.
function getCurrentSeasonCode(): number {
  const now = new Date();
  return now.getMonth() + 1 >= 8 ? now.getFullYear() + 1 : now.getFullYear();
}

// By default fetch both the current season and the next one —
// FIS often publishes next-season schedules months in advance.
export function getDefaultSeasonCodes(): number[] {
  const current = getCurrentSeasonCode();
  return [current, current + 1];
}

// Build the full URL matrix for a given set of season codes.
// Useful for debugging or displaying what the scraper will fetch.
export function buildFeedUrls(seasonCodes?: number[]): { url: string; sport: string; season: number; category: string }[] {
  const codes = seasonCodes ?? getDefaultSeasonCodes();
  const base = 'https://data.fis-ski.com/services/public/icalendar-feed-fis-events.html';
  return codes.flatMap(season =>
    FIS_FEEDS.flatMap(({ sectorcode, sport, categorycodes }) =>
      categorycodes.map(categorycode => ({
        url: `${base}?seasoncode=${season}&sectorcode=${sectorcode}&categorycode=${categorycode}`,
        sport,
        season,
        category: categorycode,
      }))
    )
  );
}

// ─── iCal parser ──────────────────────────────────────────────────────────────

interface RawVEvent {
  uid: string;
  dtstart: string;
  dtend: string;
  summary: string;
  location: string;
  description: string;
}

// iCal lines longer than 75 chars are folded with a CRLF + space/tab continuation.
// Unfold them back into single logical lines before parsing.
function unfoldLines(icsText: string): string[] {
  return icsText
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter(l => l.length > 0);
}

function parseICalFeed(icsText: string): RawVEvent[] {
  const lines = unfoldLines(icsText);
  const events: RawVEvent[] = [];
  let cur: Partial<RawVEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.uid && cur.dtstart && cur.summary) events.push(cur as RawVEvent);
      cur = null; continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    // Strip property parameters (e.g. DTSTART;TZID=Europe/Zurich → DTSTART)
    const key = line.slice(0, colon).split(';')[0].toUpperCase();
    const val = line.slice(colon + 1);

    switch (key) {
      case 'UID':         cur.uid         = val; break;
      case 'DTSTART':     cur.dtstart     = val; break;
      case 'DTEND':       cur.dtend       = val; break;
      case 'SUMMARY':     cur.summary     = val; break;
      case 'LOCATION':    cur.location    = val; break;
      // iCal encodes literal newlines as \n in DESCRIPTION
      case 'DESCRIPTION': cur.description = val.replace(/\\n/g, '\n'); break;
    }
  }

  return events;
}

// ─── Field parsers ────────────────────────────────────────────────────────────

// "20251128T121500Z" or "20251128T121500" or "20251128" → "2025-11-28"
function parseICalDate(value: string): string | null {
  const dateStr = value.replace(/T.*$/, '');
  if (!/^\d{8}$/.test(dateStr)) return null;
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

// Extract a labelled field from DESCRIPTION, e.g. "Category: World Cup"
function descField(description: string, fieldName: string): string | null {
  const m = description.match(new RegExp(`^${fieldName}:\\s*(.+)$`, 'im'));
  return m ? m[1].trim() : null;
}

function mapEventType(categoryText: string | null): string | null {
  if (!categoryText) return null;
  const lower = categoryText.toLowerCase();
  for (const [key, val] of CATEGORY_TYPE_MAP) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// ─── Feed fetcher ─────────────────────────────────────────────────────────────

async function fetchFISFeed(
  sectorcode: string,
  categorycode: string,
  seasoncode: number,
): Promise<string | null> {
  const url =
    `https://data.fis-ski.com/services/public/icalendar-feed-fis-events.html` +
    `?seasoncode=${seasoncode}&sectorcode=${sectorcode}&categorycode=${categorycode}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Chione/1.0)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Sanity check: must be a real iCal response, not an HTML error page
    if (!text.includes('BEGIN:VCALENDAR')) return null;
    return text;
  } catch (err) {
    console.error(`[fis-ical] Fetch failed ${sectorcode}/${categorycode}:`, err);
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scrapeAllFIS(seasonCodes?: number[]): Promise<FISEvent[]> {
  const codes = seasonCodes ?? getDefaultSeasonCodes();
  const allEvents: FISEvent[] = [];
  const seen = new Set<string>(); // deduplicate by source_url within this run

  for (const seasoncode of codes) {
  for (const { sectorcode, sport, categorycodes } of FIS_FEEDS) {
    for (const categorycode of categorycodes) {
      const icsText = await fetchFISFeed(sectorcode, categorycode, seasoncode);
      if (!icsText) {
        console.log(`[fis-ical] Empty/error: ${sectorcode}/${categorycode}`);
        continue;
      }

      const vevents = parseICalFeed(icsText);
      console.log(`[fis-ical] ${sport} ${categorycode}: ${vevents.length} races`);

      for (const ve of vevents) {
        const startDate = parseICalDate(ve.dtstart);
        if (!startDate) continue;

        const endDate = parseICalDate(ve.dtend);

        // Country: SUMMARY is "Ruka (FIN) - ..." so extract 3-letter code in parens
        const countryMatch = ve.summary.match(/\(([A-Z]{3})\)/);
        const country = countryMatch?.[1] ?? null;

        // City from LOCATION (already plain city name)
        const city = ve.location?.trim() || null;

        // Event type from DESCRIPTION "Category:" line
        const categoryText = descField(ve.description, 'Category');
        const eventType = mapEventType(categoryText);

        // Additional metadata from DESCRIPTION
        const gender      = descField(ve.description, 'Gender');
        const eventDetail = descField(ve.description, 'Event');

        // Source URL: prefer the "Result/Startlist:" link in DESCRIPTION —
        // it's a stable, unique, clickable FIS URL per race.
        // Fall back to a constructed URL using the UID if not found.
        const resultUrlMatch = ve.description.match(/Result\/Startlist:\s*(https?:\/\/\S+)/);
        const sourceUrl = resultUrlMatch
          ? resultUrlMatch[1].trim()
          : `https://www.fis-ski.com/DB/general/event-details.html?sectorcode=${sectorcode}&uid=${ve.uid}`;

        if (seen.has(sourceUrl)) continue;
        seen.add(sourceUrl);

        allEvents.push({
          title:       ve.summary,
          sport,
          source_name: 'FIS',
          source_url:  sourceUrl,
          start_date:  startDate,
          end_date:    endDate && endDate !== startDate ? endDate : null,
          city,
          country,
          event_type:  eventType,
          metadata: {
            gender,
            event_detail: eventDetail,
            fis_uid:      ve.uid,
            category_code: categorycode,
            sector_code:   sectorcode,
          },
        });
      }
    }
  }

  } // end season loop

  console.log(`[fis-ical] Total: ${allEvents.length} events across all disciplines and seasons`);
  return allEvents;
}
