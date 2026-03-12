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
  event_type: string | null;
  event_level: string | null;  // ← add
  discipline: string | null;   // ← add
}

const FIS_DISCIPLINES = [
  { url: 'https://www.fis-ski.com/DB/alpine-skiing/calendar-results.html?noselection=true', sport: 'Alpine Skiing' },
  { url: 'https://www.fis-ski.com/DB/cross-country/calendar-results.html?noselection=true', sport: 'Cross Country' },
  { url: 'https://www.fis-ski.com/DB/ski-jumping/calendar-results.html?noselection=true', sport: 'Ski Jumping' },
  { url: 'https://www.fis-ski.com/DB/freestyle-freeski/moguls-aerials/calendar-results.html?noselection=true', sport: 'Freestyle' },
  { url: 'https://www.fis-ski.com/DB/freestyle-freeski/freeski/calendar-results.html?noselection=true', sport: 'Freeski Park and Pipe' },
  { url: 'https://www.fis-ski.com/DB/snowboard/calendar-results.html?noselection=true', sport: 'Snowboard' },
  { url: 'https://www.fis-ski.com/DB/nordic-combined/calendar-results.html?noselection=true', sport: 'Nordic Combined' },
  { url: 'https://www.fis-ski.com/DB/freeride/calendar-results.html?noselection=true', sport: 'Freeride' },
  { url: 'https://www.fis-ski.com/DB/para-snowsports/para-cross-country/calendar-results.html?noselection=true', sport: 'Para Cross Country' },
  { url: 'https://www.fis-ski.com/DB/para-snowsports/para-alpine/calendar-results.html?noselection=true', sport: 'Para Alpine' },
  { url: 'https://www.fis-ski.com/DB/para-snowsports/para-snowboard/calendar-results.html?noselection=true', sport: 'Para Snowboard' },
];

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function parseDate(raw: string, year: string): string | null {
  const match = raw.trim().match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = MONTH_MAP[match[2]];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function inferEventType(raw: string): string {
  const c = raw.toUpperCase();
  if (c.includes('OWG')) return 'Olympics';
  if (c.includes('WSC')) return 'World Championships';
  if (c.includes('WJC')) return 'Junior World Championships';
  if (c.includes('WC')) return 'World Cup';
  if (c.includes('COC')) return 'Continental Cup';
  if (c.includes('EC')) return 'European Cup';
  if (c.includes('NC')) return 'National Championships';
  if (c.includes('FC') || c.includes('4H')) return 'World Cup';
  if (c.includes('GP')) return 'Grand Prix';
  if (c.includes('IC') || c.includes('ICOC')) return 'Intercontinental Cup';
  return 'FIS';
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

  // Group all links by eventid
  const eventMap = new Map<string, {
    sourceUrl: string;
    year: string;
    texts: string[];
  }>();

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

  function cleanCity(raw: string | null): string | null {
        if (!raw) return null;
        return raw
            .replace(/\b(CIT|NJR|ENL|QUA|SOV|STL|TRA)\b/gi, '')
            .replace(/\d+x[A-Z]+/gi, '') // removes "4xGS", "2xSL" etc
            .replace(/[•\-\/]+\s*$/, '')  // trailing punctuation
            .replace(/\s{2,}/g, ' ')
            .trim();
        }

  for (const [, { sourceUrl, year, texts }] of eventMap) {
    // Find the text fragment containing the date — range OR single date
    const dateText = texts.find(t => /\d{1,2}\s+[A-Za-z]{3}/.test(t)) ?? '';
    const rangeMatch = dateText.match(/(\d{1,2}\s+[A-Za-z]{3})\s*[-–]\s*(\d{1,2}\s+[A-Za-z]{3})/);
    const singleMatch = dateText.match(/(\d{1,2}\s+[A-Za-z]{3})/);

    const startDate = parseDate(rangeMatch?.[1] ?? singleMatch?.[1] ?? '', year);
    let endDate = rangeMatch ? parseDate(rangeMatch[2], year) : null;
    if (!startDate) continue;

    // Handle year rollover
    if (endDate && endDate < startDate) {
    endDate = parseDate(rangeMatch![2], (parseInt(year) + 1).toString());
    }

    // Country code: exactly 3 uppercase letters, standalone text fragment
    const countryText = texts.find(t => /^[A-Z]{3}$/.test(t.trim()));
    const country = countryText?.trim() ?? null;

    // Category text — may contain "WC • QUA", "WJC", "FIS" etc.
    const categoryText = texts.find(t =>
    /\b(WC|WSC|WJC|OWG|EC|NC|FIS|SWC|AC|COC|FC|GP|QUA|SOV|4H|FESA|ICOC|IC|COC)\b/.test(t)
    );

    // Event level = first recognized code from category text
    const levelMatch = categoryText?.match(/\b(WC|WSC|WJC|OWG|EC|NC|FIS|SWC|AC|COC|FC|GP|FESA|ICOC)\b/);
    const eventLevel = levelMatch?.[1] ?? null;
    const eventType = eventLevel ? inferEventType(eventLevel) : 'FIS';

    // Discipline = the race format codes like "2xLH", "4xNH", "3xDH", "2xSL 4xGS"
    const disciplineText = categoryText?.match(/(\d+x[A-Z]+(?:\s+\d+x[A-Z]+)*)/)?.[1]?.trim() ?? null;
    const disciplineCode = disciplineText?.trim() ?? null;

    const city = texts.find(t => {
        const clean = t.trim();
        if (/^\d{1,2}[\s-]/.test(clean)) return false;        // ← catches "01-02 Mar", "25 Feb" etc.
        if (/[A-Za-z]{3}\s*$/.test(clean) && /^\d/.test(clean)) return false; // ← "01 Jan" style
        if (/\d{4}/.test(clean)) return false;
        if (/^[A-Z]{2,3}$/.test(clean)) return false;
        if (/^[DPC\s]+$/.test(clean)) return false;
        if (/^[WM\s]+$/.test(clean)) return false;
        if (/\b(WC|WSC|WJC|OWG|EC|NC|FIS|SWC|AC|COC|FC|GP|QUA|SOV|4H|FESA|ICOC|IC)\b/.test(clean)) return false;
        if (/\d+x[A-Z]+/.test(clean)) return false;
        if (clean.length < 2) return false;
        return true;
    }) ?? null;

    const title = [
        'FIS',
        discipline.sport,
        eventType,
        country ?? '',
        year,
    ].filter(Boolean).join(' ');

   events.push({
    title,
    sport: discipline.sport,
    source_name: 'FIS',
    source_url: sourceUrl,
    start_date: startDate,
    end_date: endDate !== startDate ? endDate : null,
    city: cleanCity(city),
    country,
    event_type: eventType,
    event_level: eventLevel,   // ← add
    discipline: disciplineCode,    // ← add (note: shadowing issue — rename variable)
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