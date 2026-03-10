# Chione

## Project Overview
Chione is a Winter Olympic sports event calendar and discovery platform. The name comes from the ancient Greek word for snow (χιών), connecting to the Olympic heritage of winter sports.

The goal is to aggregate events across **all Winter Olympic sports** from multiple data sources, display them on a filterable calendar, and provide a Claude-powered chat interface for event discovery and travel planning.

**Primary users:** OCOG (Organising Committee for the Olympic Games) staff and UOLF (Utah Olympic Legacy Foundation) staff. May eventually go public-facing.

## Tech Stack
- **Frontend/Backend:** Next.js (deployed on Vercel)
- **Database:** Vercel Postgres (Neon)
- **Scraping:** Browse.ai (robots scrape event websites on a schedule, push via webhook)
- **Data pipeline:** Browse.ai → webhook → Next.js API route → Postgres
- **Calendar UI:** FullCalendar
- **Chat interface:** Claude API (claude-sonnet-4-20250514)

## What It Does
1. Scrapes event data from multiple Winter Olympic sport websites
2. Normalizes and stores events in Postgres
3. Displays events on a filterable calendar
4. Allows users to download .ics files for events
5. Provides a Claude-powered chat — users can ask about events, where to fly in, nearby hotels, logistics, etc.

## Data Sources
Each sport/federation gets its own Browse.ai robot and its own transformer function. Sources added so far:

| Source | Sport(s) | Status |
|--------|----------|--------|
| ISU (isu.org/events) | Figure Skating, Speed Skating, Short Track, Synchronized Skating | ✅ Active |

More sources will be added over time (e.g. FIS for skiing/snowboard, IBU for biathlon, IBSF for bobsled/luge/skeleton, etc.)

## Database Design Philosophy
**The schema must stay flexible.** As new data sources are added, the fields available will vary. Design decisions:

- The core `events` table holds fields that are common across all sources
- Optional/source-specific fields should be nullable — never assume a field will always exist
- As new sources are added, new nullable columns can be added without breaking existing data
- The frontend should adapt to available data — e.g. if enough sources share a `discipline` field, add a filter for it; if not, omit it
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

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## Webhook Endpoint
Browse.ai POSTs task results to: `/api/webhooks/browse-ai`

Each robot sends a payload with `capturedLists` containing the scraped data. The webhook handler:
1. Identifies the source (by robot ID or a field in the payload)
2. Routes to the correct transformer function
3. Normalizes the data to the common schema
4. Upserts into Postgres using `source_url` as the unique key (handles deduplication and updates)

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

## Frontend Philosophy
- Start simple — a single calendar view with sport filter
- Add tabs, grouped views, or additional filters **only when the data from multiple sources supports it**
- Don't build UI for fields that only one source provides
- The chat interface should have access to full event context so it can answer travel/logistics questions

## Environment Variables
```
POSTGRES_URL=
ANTHROPIC_API_KEY=
BROWSE_AI_API_KEY=        # for any direct API calls if needed
```

## Key Design Decisions
- **No Airtable/Softr** — previous attempt used these and hit limitations
- **Vercel Postgres over Supabase** — simpler setup, already in Vercel ecosystem; revisit if auth or realtime is needed later
- **Browse.ai for scraping** — already set up and working; may migrate to work account later
- **Webhook over polling** — Browse.ai pushes data on task completion
- **Flexible schema** — nullable fields and per-source transformers mean adding new sports doesn't break anything

## Project Name Origin
Chione (Χιόνη) — Greek nymph whose name derives from χιών (khiōn), the ancient Greek word for snow. Daughter of Boreas, god of the north wind. Connects to the Olympic heritage of winter sports and the first Winter Olympic Games held in Chamonix, 1924.

Internal dev/staging environment nickname: **Certamen** (a nod to Centaman, the org's POS system).