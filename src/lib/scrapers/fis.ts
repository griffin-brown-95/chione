import * as cheerio from 'cheerio';

export interface FISEvent {
  title: string;
  sport: string;
  source_name: string;
  source_url: string;
  start_date: string;
  end_date: string | null;
  city: string | null;
  country: string | null;
  event_type: string;
}

const FIS_DISCIPLINES = [
  { url: 'https://www.fis-ski.com/DB/alpine-skiing/calendar-results.html?noselection=true',                     sport: 'Alpine Skiing' },
  { url: 'https://www.fis-ski.com/DB/cross-country/calendar-results.html?noselection=true',                    sport: 'Cross Country' },
  { url: 'https://www.fis-ski.com/DB/ski-jumping/calendar-results.html?noselection=true',                      sport: 'Ski Jumping' },
  { url: 'https://www.fis-ski.com/DB/freestyle-freeski/moguls-aerials/calendar-results.html?noselection=true', sport: 'Freestyle' },
  { url: 'https://www.fis-ski.com/DB/freestyle-freeski/freeski/calendar-results.html?noselection=true',        sport: 'Freeski Park and Pipe' },
  { url: 'https://www.fis-ski.com/DB/snowboard/calendar-results.html?noselection=true',                        sport: 'Snowboard' },
  { url: 'https://www.fis-ski.com/DB/nordic-combined/calendar-results.html?noselection=true',                  sport: 'Nordic Combined' },
  { url: 'https://www.fis-ski.com/DB/freeride/calendar-results.html?noselection=true',                         sport: 'Freeride' },
  { url: 'https://www.fis-ski.com/DB/para-snowsports/para-cross-country/calendar-results.html?noselection=true', sport: 'Para Cross Country' },
  { url: 'https://www.fis-ski.com/DB/para-snowsports/para-alpine/calendar-results.html?noselection=true',      sport: 'Para Alpine' },
  { url: 'https://www.fis-ski.com/DB/para-snowsports/para-snowboard/calendar-results.html?noselection=true',   sport: 'Para Snowboard' },
];

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

// Maps FIS category codes to our event types. Only the 4 we care about.
const EVENT_TYPE_MAP: Record<string, string> = {
  OWG: 'Olympics',
  WSC: 'World Championships',
  WC:  'World Cup',
  NAC: 'Nor-Am Cup',
};

// Returns the event type string, or null if we don't want this event.
function classifyEventType(categoryText: string): string | null {
  const c = categoryText.toUpperCase();
  for (const [code, type] of Object.entries(EVENT_TYPE_MAP)) {
    if (new RegExp(`\\b${code}\\b`).test(c)) return type;
  }
  return null;
}

function parseDate(raw: string, year: string): string | null {
  const match = raw.trim().match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = MONTH_MAP[match[2]];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function parseDateRange(dateText: string, year: string): { startDate: string | null; endDate: string | null } {
  // Format: "05-15 Mar" (same-month range)
  const sameMonth = dateText.match(/(\d{1,2})-(\d{1,2})\s+([A-Za-z]{3})/);
  if (sameMonth) {
    const month = MONTH_MAP[sameMonth[3]];
    if (!month) return { startDate: null, endDate: null };
    return {
      startDate: `${year}-${month}-${sameMonth[1].padStart(2, '0')}`,
      endDate:   `${year}-${month}-${sameMonth[2].padStart(2, '0')}`,
    };
  }

  // Format: "25 Feb- 01 Mar" (cross-month range)
  const crossMonth = dateText.match(/(\d{1,2}\s+[A-Za-z]{3})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]{3})/);
  if (crossMonth) {
    const startDate = parseDate(crossMonth[1], year);
    let endDate     = parseDate(crossMonth[2], year);
    // Handle year rollover (e.g. Dec → Jan)
    if (startDate && endDate && endDate < startDate) {
      endDate = parseDate(crossMonth[2], (parseInt(year) + 1).toString());
    }
    return { startDate, endDate };
  }

  // Format: "03 Mar" (single day)
  const single = dateText.match(/(\d{1,2}\s+[A-Za-z]{3})/);
  if (single) return { startDate: parseDate(single[1], year), endDate: null };

  return { startDate: null, endDate: null };
}

function cleanCity(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .replace(/\b(CIT|NJR|ENL|QUA|SOV|STL|TRA)\b/gi, '')
    .replace(/\d+x[A-Z]+/gi, '')
    .replace(/[•\-\/]+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
}

export async function scrapeFISDiscipline(discipline: { url: string; sport: string }): Promise<FISEvent[]> {
  const res = await fetch(discipline.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Chione/1.0)' },
  });
  if (!res.ok) {
    console.error(`[fis] Failed to fetch ${discipline.url}: ${res.status}`);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Group all link text fragments by eventid
  const eventMap = new Map<string, { sourceUrl: string; year: string; texts: string[] }>();

  $('a[href*="event-details.html"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const eventIdMatch = href.match(/eventid=(\d+)/);
    const yearMatch = href.match(/seasoncode=(\d{4})/);
    if (!eventIdMatch) return;

    const eventId = eventIdMatch[1];
    const year = yearMatch?.[1] ?? new Date().getFullYear().toString();
    const sourceUrl = 'https://www.fis-ski.com/DB/general/event-details.html?' + href.split('?')[1];
    const text = $(el).text().replace(/\s+/g, ' ').trim();

    if (!eventMap.has(eventId)) {
      eventMap.set(eventId, { sourceUrl, year, texts: [] });
    }
    if (text) eventMap.get(eventId)!.texts.push(text);
  });

  const events: FISEvent[] = [];

  for (const [, { sourceUrl, year, texts }] of eventMap) {
    // Category text — contains codes like "WC", "OWG", "NAC", etc.
    const categoryText = texts.find(t =>
      /\b(WC|WSC|OWG|NAC|WJC|EC|NC|FIS|COC|FC|GP|ICOC|IC)\b/.test(t)
    ) ?? '';

    // Skip events we don't care about
    const eventType = classifyEventType(categoryText);
    if (!eventType) continue;

    // Dates — handles "05-15 Mar", "25 Feb- 01 Mar", or "03 Mar"
    const dateText = texts.find(t => /\d{1,2}[-\s][A-Za-z\d]/.test(t) && /[A-Za-z]{3}/.test(t)) ?? '';
    const { startDate, endDate } = parseDateRange(dateText, year);
    if (!startDate) continue;

    // Country: exactly 3 uppercase letters as its own text fragment
    const country = texts.find(t => /^[A-Z]{3}$/.test(t.trim()))?.trim() ?? null;

    // City: text fragment that isn't a date, country, code, or gender marker
    const cityRaw = texts.find(t => {
      const s = t.trim();
      if (/^\d{1,2}[\s-]/.test(s)) return false;
      if (/\d{4}/.test(s)) return false;
      if (/^[A-Z]{2,3}$/.test(s)) return false;
      if (/^[DPC\s]+$/.test(s)) return false;
      if (/^[WM\s]+$/.test(s)) return false;
      if (/\b(WC|WSC|WJC|OWG|EC|NC|FIS|COC|FC|GP|NAC|ICOC|IC)\b/.test(s)) return false;
      if (/\d+x[A-Z]+/.test(s)) return false;
      if (s.length < 2) return false;
      return true;
    }) ?? null;

    const title = `FIS ${discipline.sport} ${eventType} ${country ?? ''} ${year}`.replace(/\s+/g, ' ').trim();

    events.push({
      title,
      sport: discipline.sport,
      source_name: 'FIS',
      source_url: sourceUrl,
      start_date: startDate,
      end_date: endDate !== startDate ? endDate : null,
      city: cleanCity(cityRaw),
      country,
      event_type: eventType,
    });
  }

  console.log(`[fis] ${discipline.sport}: ${events.length} events`);
  return events;
}

export async function scrapeAllFIS(): Promise<FISEvent[]> {
  const results = await Promise.allSettled(
    FIS_DISCIPLINES.map(d => scrapeFISDiscipline(d))
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}