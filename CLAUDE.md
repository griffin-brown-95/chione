# Chione

## Project Overview
Chione is a Winter Olympic sports event calendar and discovery platform. The name comes from the ancient Greek word for snow (χιών), connecting to the Olympic heritage of winter sports.

The goal is to aggregate events across **all Winter Olympic sports** from multiple data sources, display them on a filterable calendar and interactive map, and provide a Claude-powered chat interface for event discovery and travel planning.

**Primary users:** OCOG (Organising Committee for the Olympic Games) staff and UOLF (Utah Olympic Legacy Foundation) staff. May eventually go public-facing.

## Tech Stack
- **Frontend/Backend:** Next.js (deployed on Vercel)
- **Database:** Vercel Postgres (Neon)
- **Scraping:** Browse.ai (robots scrape event websites on a schedule, push via webhook) + a custom FIS iCal scraper
- **Data pipeline:** Browse.ai → webhook → Next.js API route → Postgres
- **Calendar UI:** FullCalendar
- **Map UI:** `react-simple-maps` v3.0.0 (no bundled types — manual `.d.ts` at `src/types/react-simple-maps.d.ts`); added to `transpilePackages` in `next.config.ts` to prevent ESM bundling issues
- **Chat interface:** Claude API via `@anthropic-ai/sdk` (claude-sonnet-4-20250514), with tool use for live DB queries

## What It Does
1. Scrapes event data from multiple Winter Olympic sport websites
2. Normalizes and stores events in Postgres
3. Displays events on a filterable calendar **and** an interactive world map
4. Allows users to download .ics files for events
5. Provides a Claude-powered chat — users can ask about events, travel, logistics, etc. Claude queries the live database via tool use rather than receiving a static context dump

## Data Sources
Each sport/federation gets its own Browse.ai robot and its own transformer function. Sources added so far:

| Source | Sport(s) | Method | Status |
|--------|----------|--------|--------|
| ISU (isu.org/events) | Figure Skating, Speed Skating, Short Track, Synchronized Skating | Browse.ai robot → webhook | ✅ Active |
| FIS (data.fis-ski.com) | Alpine, Cross Country, Ski Jumping, Freestyle, Snowboard, Nordic Combined, Freeride | Official iCal feed (`src/lib/scrapers/fis.ts`) via daily cron | ✅ Active |

More sources to add: IBU (biathlon), IBSF (bobsled/luge/skeleton).

**On adding new sources:** Before building a scraper, check the federation's network traffic (DevTools) for an internal JSON API, and check for a published `.ics` calendar feed. Either is more stable than HTML scraping. If scraping is unavoidable, prefer a Browse.ai robot over a hand-rolled cheerio scraper.

### FIS iCal Feed Notes
FIS publishes official iCalendar feeds at:
```
https://data.fis-ski.com/services/public/icalendar-feed-fis-events.html
  ?seasoncode=2026&sectorcode=CC&categorycode=WC
```
Both `sectorcode` and `categorycode` are required. The season code is the year the season ends (e.g. 2025/26 → `2026`). The scraper iterates a matrix of sector codes × category codes (`WC`, `WSC`, `OWG`) and fetches all.

Each VEVENT represents a single race, not a multi-day event stop — so a World Cup weekend produces multiple rows (one per race). The `Result/Startlist` URL embedded in the DESCRIPTION field is used as `source_url` for deduplication. Race-level metadata (gender, event detail, FIS UID, sector/category codes) is stored in the `metadata` JSONB column.

## Database Design Philosophy
**The schema must stay flexible.** As new data sources are added, the fields available will vary. Design decisions:

- The core `events` table holds fields common across all sources
- `metadata JSONB` holds any source-specific or extended fields — no new columns needed per source
- Optional core fields are nullable — never assume a field will always exist
- UI features like tabs per sport or filters per event type should only appear when the underlying data supports them reliably across sources

## Core Events Table
```sql
create table events (
  id uuid default gen_random_uuid() primary key,

  -- Core fields (required, all sources should provide these)
  title text not null,
  start_date date not null,
  source_url text unique not null,  -- used for deduplication on upsert
  source_name text not null,        -- e.g. "ISU", "FIS"

  -- Common optional fields (most sources will have these)
  sport text,                       -- e.g. "Figure Skating", "Biathlon"
  event_type text,                  -- e.g. "World Cup", "World Championships"
  end_date date,
  city text,
  country text,                     -- ISO/IOC country code e.g. "USA", "CAN"

  -- Extended optional fields (source-dependent)
  venue text,
  discipline text,                  -- e.g. "Ice Dance", "Downhill", "500m"
  event_level text,                 -- e.g. "Senior", "Junior"
  flag_image_url text,

  -- Flexible source-specific data (replaces flat enrichment columns)
  metadata jsonb not null default '{}',

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- GIN index for efficient JSON queries on metadata
create index events_metadata_gin on events using gin (metadata);
```

## Chat Tables
```sql
create table chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata   jsonb not null default '{}'
);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now(),
  metadata   jsonb not null default '{}'
);

create index messages_session_id_idx on messages (session_id, created_at asc);
```

## Webhook Endpoint
Browse.ai POSTs task results to: `/api/webhooks/browse-ai`

Each robot sends a payload with `capturedLists` containing the scraped data. The webhook handler:
1. Identifies the source by robot ID (`BROWSE_AI_ROBOT_ISU` env var)
2. Routes to the correct transformer function
3. Normalizes the data to the common schema
4. Upserts into Postgres using `source_url` as the unique key (handles deduplication and updates)

There is no enrichment step on ingest — the chat interface handles travel/logistics questions dynamically.

## ISU Transformer Notes
The ISU payload (`capturedLists["ISU Events"]`) contains duplicate entries — deduplicate on `Event Link` before inserting.

Sport is inferred from event name:
- "SYNCHRONIZED SKATING" → Synchronized Skating
- "SHORT TRACK" → Short Track Speed Skating
- "SPEED SKATING" → Speed Skating
- "FIGURE SKATING" → Figure Skating

Event type is inferred from event name:
- "WORLD CHAMPIONSHIP(S)" → World Championships
- "EUROPEAN CHAMPIONSHIP" → European Championships
- "FOUR CONTINENTS" → Four Continents
- "GRAND PRIX FINAL" → Grand Prix Final
- "GRAND PRIX" / "GP " → Grand Prix
- "JUNIOR GRAND PRIX" / "JGP" → Junior Grand Prix
- "CHALLENGER SERIES" → Challenger Series
- "WORLD CUP" → World Cup
- "OLYMPIC" → Olympics

Date format: `"7 Aug - 10 Aug, 2025"` or `"31 Oct - 2 Nov, 2025"`

## Chat Interface
`/api/chat` — streaming endpoint using `@anthropic-ai/sdk` with an agentic tool-use loop.

**Tools available to Claude:**
- `search_events` — fetches all events from DB and filters in JS (sport, event_type, country, date range). Avoids Neon's limitations with parameterized conditional SQL.
- `get_event_detail` — returns full event row including metadata for a specific event ID.

**Pattern:** Claude calls tools, results are injected back, loop continues until Claude produces a final text response. Text is streamed to the client.

**UI:** `ChatPanel.tsx` — fixed right-side panel (480px). Opens from "Ask Chione ↗" in the sidebar, or "Ask Chione about this event ↗" inside the event detail panel (which auto-sends a context message). Suggested prompts shown when empty.

## Three-Tab Layout (`ChioneCalendar.tsx`)
The main UI has three tabs in the header: **Ask Chione**, **Calendar**, **Map**.

- **Ask Chione** — embedded full-page chat with suggested prompts; shares session state with the slide-out `ChatPanel`
- **Calendar** — FullCalendar (dayGrid + list views) with sport/type/country filters in a left sidebar
- **Map** — interactive world map (`MapView.tsx`) with the same filter sidebar as the calendar

All three tabs share the same filter state (`sportFilters`, `typeFilter`, `countryFilter`) and the same `filtered` events array. The event detail panel is a shared overlay (`zIndex: 150`) that sits above all tabs.

## Map View (`src/components/MapView.tsx`)
`MapView` is loaded via `dynamic(() => import('@/components/MapView'), { ssr: false })` because `react-simple-maps` accesses browser APIs at import time.

**Key implementation details:**
- Projection: `geoNaturalEarth1`, scale 155, 800×420 viewport
- World topology: `countries-110m.json` from jsDelivr CDN (World Atlas TopoJSON)
- Events with the same city resolve to exactly one pin; multi-event pins show a popover on click listing all events sorted by date
- Pin radius and font sizes are divided by `zoom` inside `ZoomableGroup` to stay constant screen size as you zoom
- `CITY_COORDS` table (~130 venues, keyed by lowercased/diacritic-stripped city name) resolves event locations; falls back to `COUNTRY_COORDS` (~45 IOC centroids) if city not found
- Clicking a country calls `computeCountryFit` (walks GeoJSON coordinate tree → bounding box → center + zoom) and animates the map to fit that country
- Hovering a country shows a tooltip with the full country name and count of filtered events in that country (uses `ISO_TO_IOC` to map numeric geo IDs to IOC codes)
- Country labels rendered as `Marker` components at `COUNTRY_LABEL_KEYS` positions, opacity ~0.4, font size divided by zoom

## NGB-Family Colour System
Event colours are assigned by NGB (federation), with each sport getting a distinct shade within the NGB's colour family. There is **no dynamic colour mode** — colour is always by sport.

```typescript
// NGB base colours (used for fallback and the sidebar legend)
const SOURCE_COLORS = { FIS: '#2563eb', ISU: '#7c3aed', IBU: '#b45309', IBSF: '#059669' };

// Per-sport shades
const NGB_SPORT_COLORS = {
  // FIS — blues (deep → light)
  'Alpine Skiing':          '#1e3a8a',
  'Nordic Combined':        '#1e40af',
  'Cross Country':          '#1d4ed8',
  'Ski Jumping':            '#2563eb',
  'Snowboard':              '#3b82f6',
  'Freestyle':              '#60a5fa',
  'Freeski Park and Pipe':  '#38bdf8',
  'Freeride':               '#0ea5e9',
  'Para Alpine':            '#1e3a8a',
  'Para Cross Country':     '#1d4ed8',
  'Para Snowboard':         '#3b82f6',
  // ISU — violets
  'Figure Skating':             '#5b21b6',
  'Speed Skating':              '#7c3aed',
  'Short Track Speed Skating':  '#8b5cf6',
  'Synchronized Skating':       '#a78bfa',
  // IBU — amber
  'Biathlon':               '#b45309',
  // IBSF — emerald
  'Bobsled':                '#065f46',
  'Luge':                   '#047857',
  'Skeleton':               '#059669',
};
```

`getEventColor(e: Event): string` looks up `NGB_SPORT_COLORS[e.sport]` first, then falls back to `SOURCE_COLORS[source_name]`. **No `colorMode` parameter anywhere.**

The sidebar shows a simple 4-dot "COLOUR KEY" legend (FIS / ISU / IBU / IBSF) in both the Calendar and Map sidebars. There is no "by sport" or "by event type" dynamic legend.

## FullCalendar Colour Fix
Tailwind v4's preflight CSS reset conflicts with FullCalendar's CSS variable colour system. Fixed by:
1. Pre-building a `EVENT_COLOR_CSS` string with one `!important` rule per unique colour (derived from `NGB_SPORT_COLORS` + `SOURCE_COLORS`)
2. Injecting it into the `<style>` block inside the calendar pane
3. Using `eventClassNames` to apply a stable CSS class (`chione-evt-{hex}`) to each event
4. Setting `textColor: '#ffffff'` on all calendar events

## Cron Jobs (vercel.json)
- `/api/cron/digest` — Monday 15:00 UTC — weekly email digest to confirmed subscribers via Resend
- `/api/cron/fis` — Daily 06:00 UTC — scrapes FIS iCal feeds, upserts new/updated events

The enrichment cron (`/api/cron/enrich`) has been removed. Pre-baked enrichment fields (`airports`, `city_description`, `travel_tips`) were replaced by the chat interface.

## Frontend Philosophy
- Calendar and Map are the primary visualizations; chat is the primary discovery interface
- Add tabs, grouped views, or additional filters **only when the data from multiple sources supports it**
- Don't build UI for fields that only one source provides
- `ChioneCalendar.tsx` and `MapView.tsx` use inline styles throughout (not Tailwind classes) — match this pattern in any new components
- `MapView.tsx` must always be loaded with `ssr: false` via `next/dynamic`

## Environment Variables
```
POSTGRES_URL=
ANTHROPIC_API_KEY=
BROWSE_AI_API_KEY=        # for any direct API calls if needed
BROWSE_AI_ROBOT_ISU=      # robot ID for ISU Browse.ai robot
RESEND_API_KEY=
NEXT_PUBLIC_BASE_URL=
BASE_URL=
CRON_SECRET=              # Bearer token for cron route auth
```

## Migrations
Migration files live in `/migrations`. Run them in order against Neon.

- `001_metadata_and_chat.sql` — adds `metadata` JSONB column, drops flat enrichment columns, creates chat tables and indexes

## Key Design Decisions
- **No Airtable/Softr** — previous attempt used these and hit limitations
- **Vercel Postgres over Supabase** — simpler setup, already in Vercel ecosystem; revisit if auth or realtime is needed later
- **Browse.ai for scraping** — already set up and working; may migrate to work account later
- **Webhook over polling** — Browse.ai pushes data on task completion
- **Flexible schema** — `metadata JSONB` means adding new sources doesn't require schema migrations
- **No pre-baked enrichment** — static travel info fields (airports, city description, travel tips) were removed; Claude answers these questions dynamically via the chat interface with live DB tool use
- **Chat tool use over context stuffing** — Claude queries the DB via tools rather than receiving all events in the prompt, keeping context lean and responses current
- **NGB colour families over dynamic colour mode** — event colours are fixed per sport (within an NGB's colour family); no switching between "by sport" / "by event type" modes simplifies the codebase and produces a more consistent visual identity
- **react-simple-maps for the map tab** — lightweight SVG-based world map; installed with `--legacy-peer-deps` and added to `transpilePackages`; manual type declarations in `src/types/react-simple-maps.d.ts`

## Project Name Origin
Chione (Χιόνη) — Greek nymph whose name derives from χιών (khiōn), the ancient Greek word for snow. Daughter of Boreas, god of the north wind. Connects to the Olympic heritage of winter sports and the first Winter Olympic Games held in Chamonix, 1924.

Internal dev/staging environment nickname: **Certamen** (a nod to Centaman, the org's POS system).
