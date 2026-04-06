-- Migration 001: Add metadata JSONB column, drop pre-baked enrichment columns
-- Run this against your Neon database before deploying the chat interface.
--
-- What this does:
--   - Adds a flexible `metadata` JSONB column to store any source-specific fields
--   - Drops airports, city_description, travel_tips (replaced by the Claude chat interface)
--   - Creates chat_sessions and messages tables for conversation history
--   - Adds a GIN index on metadata for efficient JSON queries

-- ────────────────────────────────────────────────────────────
-- 1. Add metadata column
-- ────────────────────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- ────────────────────────────────────────────────────────────
-- 2. Drop pre-baked enrichment columns
--    (replaced by the Claude chat interface)
-- ────────────────────────────────────────────────────────────
ALTER TABLE events DROP COLUMN IF EXISTS airports;
ALTER TABLE events DROP COLUMN IF EXISTS city_description;
ALTER TABLE events DROP COLUMN IF EXISTS travel_tips;

-- ────────────────────────────────────────────────────────────
-- 3. Chat tables
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata   JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata   JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS messages_session_id_idx
  ON messages (session_id, created_at ASC);

-- ────────────────────────────────────────────────────────────
-- 4. GIN index on metadata for efficient JSON queries
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS events_metadata_gin
  ON events USING GIN (metadata);
