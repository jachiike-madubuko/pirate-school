-- Pirate School — Postgres schema (Neon, database neondb)
-- Source of truth: ~/workspace/your_files/pirate-school-prompts/pirate-school-prompts.md
--   Prompt 1 DATA MODEL (Layer 1): reels, tags, reel_tags, clusters
--   Prompt 2 DATA MODEL (Layer 2): skills, modules, sources, checks, progress
-- Plus the glue the live site's JSON actually carries: domains, items, reel_clusters.
-- Run with the DIRECT connection string only (never -pooler for migrations).
-- Safe to re-run: all DDL uses IF NOT EXISTS.

-- ================= Layer 1: searchable reel library =================

CREATE TABLE IF NOT EXISTS reels (
  id                TEXT PRIMARY KEY,  -- Instagram media_id
  platform          TEXT NOT NULL DEFAULT 'instagram',
  creator           TEXT,
  url               TEXT NOT NULL UNIQUE,
  shortcode         TEXT,
  collection        TEXT,
  note              TEXT,
  confidence        TEXT,
  gated             BOOLEAN NOT NULL DEFAULT FALSE,
  transcript        TEXT,              -- NULL until transcribed; never invented
  transcript_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcript_status IN ('pending', 'done', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reels_collection_idx ON reels (collection);
CREATE INDEX IF NOT EXISTS reels_creator_idx ON reels (creator);
CREATE INDEX IF NOT EXISTS reels_transcript_status_idx ON reels (transcript_status);

CREATE TABLE IF NOT EXISTS tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT,
  UNIQUE (name, kind)
);

CREATE TABLE IF NOT EXISTS reel_tags (
  reel_id         TEXT NOT NULL REFERENCES reels (id) ON DELETE CASCADE,
  tag_id          INT  NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  source_sentence TEXT,  -- every auto-tag must trace to a transcript sentence
  PRIMARY KEY (reel_id, tag_id)
);

-- Inventory clusters: one row per (domain, module) pair, e.g. id 'fitness:A'.
-- The inventory's cluster labels are the canonical tags.
CREATE TABLE IF NOT EXISTS clusters (
  id            TEXT PRIMARY KEY,  -- 'domain:module'
  name          TEXT NOT NULL,     -- module title
  domain        TEXT NOT NULL,
  inventory_ref TEXT NOT NULL      -- module id within the domain, e.g. 'A'
);

CREATE TABLE IF NOT EXISTS reel_clusters (
  reel_id    TEXT NOT NULL REFERENCES reels (id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES clusters (id) ON DELETE CASCADE,
  PRIMARY KEY (reel_id, cluster_id)
);

-- ================= Layer 2: pirate school LMS =================

CREATE TABLE IF NOT EXISTS domains (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  check_based BOOLEAN NOT NULL DEFAULT FALSE  -- security/polish: checklist, not videos
);

CREATE TABLE IF NOT EXISTS skills (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  domain          TEXT NOT NULL REFERENCES domains (id),
  cluster_notes   TEXT,
  source_reel_ids TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS modules (
  id                      TEXT PRIMARY KEY,  -- 'domain:module', e.g. 'workflow:C1'
  curriculum              TEXT NOT NULL REFERENCES domains (id),
  module_code             TEXT NOT NULL,     -- 'C1'
  title                   TEXT NOT NULL,
  ord                     INT NOT NULL,      -- position in the domain, 1-based
  prerequisite_module_ids TEXT[] NOT NULL DEFAULT '{}',
  gap_list                JSONB NOT NULL DEFAULT '[]'::jsonb  -- sourced / unsourced gaps
);

-- One row per curriculum item (516 reel items + 110 check items at seed time).
CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  module_id   TEXT NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  n           INT NOT NULL,
  item_type   TEXT NOT NULL DEFAULT 'reel' CHECK (item_type IN ('reel', 'check')),
  creator     TEXT,
  url         TEXT,
  shortcode   TEXT,
  title       TEXT,
  gated       BOOLEAN NOT NULL DEFAULT FALSE,
  gate        TEXT,   -- comment keyword the method sits behind, if gated
  reel_id     TEXT REFERENCES reels (id) ON DELETE SET NULL,
  collection  TEXT,
  code        TEXT,
  description TEXT,
  sources     TEXT,   -- check items: source letters, e.g. '[M, Q, T, V]'
  UNIQUE (module_id, n)
);

CREATE TABLE IF NOT EXISTS sources (
  id       SERIAL PRIMARY KEY,
  kind     TEXT NOT NULL CHECK (kind IN ('reel', 'supplement')),
  url      TEXT,
  creator  TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS checks (
  id          SERIAL PRIMARY KEY,
  module_id   TEXT NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  quiz        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- questions + source refs
  flashcards  JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- One row per (user, module); this is the state that must survive across devices.
CREATE TABLE IF NOT EXISTS progress (
  "user"      TEXT NOT NULL,
  module_id   TEXT NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'not_started',
  pass_date   DATE,
  attempts    INT NOT NULL DEFAULT 0,
  quiz_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY ("user", module_id)
);
