# Pirate School — database

Postgres schema + seed for the Neon project (`cool-credit-12397695`,
"Pyr8 sqewl"). Source of truth for the model:
`~/workspace/your_files/pirate-school-prompts/pirate-school-prompts.md`
(Prompt 1 + Prompt 2 DATA MODEL sections).

## Files

- `schema.sql` — all tables (Layer 1: reels/tags/reel_tags/clusters;
  Layer 2: domains/skills/modules/items/sources/checks/progress).
  Safe to re-run (`IF NOT EXISTS`).
- `seed.py` — seeds from `../data/reels.json` (5,973 reels) and
  `../data/curricula.json` (626 items, 8 domains). Every reel starts
  `transcript_status = 'pending'`; no transcripts are seeded.
  Idempotent: re-running inserts zero duplicates.
- `.venv/` — local Python venv with `psycopg[binary]` (not committed).

## Run (from a machine that can reach Postgres directly)

```bash
cd pirate-school/db
python3 -m venv .venv && .venv/bin/pip install "psycopg[binary]"
DATABASE_URL=$(neon connection-string --profile agent --project-id cool-credit-12397695) \
  .venv/bin/python seed.py --verify
```

Use the DIRECT connection string (default from `neon connection-string`).
Never use a `-pooler` string for migrations/seeds, and never print or
store the connection string anywhere.

Note: the Muse VM blocks outbound Postgres connections (port 5432), so
the seed cannot run from that VM — run it from a Mac, CI, or any host
with direct Postgres access. The Neon console SQL Editor can run
`schema.sql`, but the data load needs this script (or equivalent).
