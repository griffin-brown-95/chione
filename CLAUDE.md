# Chione

## Project Overview
Chione is a Winter Olympic sports event calendar and discovery platform. The name comes from the ancient Greek word for snow (χιών), connecting to the Olympic heritage of winter sports.

The goal is to aggregate events across **all Winter Olympic sports** from multiple data sources, display them on a filterable calendar, and provide a Claude-powered chat interface for event discovery and travel planning.

**Primary users:** OCOG (Organising Committee for the Olympic Games) staff and UOLF (Utah Olympic Legacy Foundation) staff. May eventually go public-facing.

## Tech Stack
- **Frontend/Backend:** Next.js (deployed on Vercel)
- **Database:** Vercel Postgres (Neon)
- **Scraping:** Browse.ai (robots scrape event websites on a schedule, push via webhook) + a custom FIS cheerio scraper
- **Data pipeline:** Browse.ai → webhook → Next.js API route → Postgres
- **Calendar UI:** FullCalendar
- **Chat interface:** Claude API via `@anthropic-ai/sdk` (claude-sonnet-4-20250514), with tool use for live DB queries

## What It Does
1. Scrapes event data from multiple Winter Olympic sport websites
2. Normalizes and stores events in Postgres
3. Displays events on a filterable calendar
4. Allows users to download .ics files for events
5. Provides a Claude-powered chat — users can ask about events, travel, logistics, etc. Claude queries the live database via tool use rather than receiving a static context dump

## Data Sources
Each sport/federation gets its own Browse.ai robot and its own transformer function. Sources added so far:

| Source | Sport(s) | Method | Status |
|--------|----------|--------|--------|
| ISU (isu.org/events) | Figure Skating, Speed Skating, Short Track, Synchronized Skating | Browse.ai robot → webhook | ✅ Active |
| FIS (fis-ski.com) | Alpine, Cross Country, Ski Jumping, Freestyle, Freeski, Snowboard, Nordic Combined, Freeride, Para disciplines | Custom cheerio scraper (`src/lib/scrapers/fis.ts`) via daily cron | ✅ Active |

More sources to add: IBU (biathlon), IBSF (bobsled/luge/skeleton).

**On adding new sources:** Before building a scraper, check the federation's network traffic (DevTools) for an internal JSON API, and check for a published `.ics` calendar feed. Either is more stable than HTML scraping. If scraping is unavoidable, prefer a Browse.ai robot over a hand-rolled cheerio scraper.

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

## Cron Jobs (vercel.json)
- `/api/cron/digest` — Monday 15:00 UTC — weekly email digest to confirmed subscribers via Resend
- `/api/cron/fis` — Daily 06:00 UTC — scrapes FIS discipline pages, inserts new events

The enrichment cron (`/api/cron/enrich`) has been removed. Pre-baked enrichment fields (`airports`, `city_description`, `travel_tips`) were replaced by the chat interface.

## Frontend Philosophy
- Calendar is the primary visualization; chat is the primary discovery interface
- Add tabs, grouped views, or additional filters **only when the data from multiple sources supports it**
- Don't build UI for fields that only one source provides
- `ChioneCalendar.tsx` uses inline styles throughout (not Tailwind classes) — match this pattern in any new components

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

## Project Name Origin
Chione (Χιόνη) — Greek nymph whose name derives from χιών (khiōn), the ancient Greek word for snow. Daughter of Boreas, god of the north wind. Connects to the Olympic heritage of winter sports and the first Winter Olympic Games held in Chamonix, 1924.

Internal dev/staging environment nickname: **Certamen** (a nod to Centaman, the org's POS system).
