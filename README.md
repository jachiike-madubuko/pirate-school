# Pirate School — MVP

A mobile-first static site: a **searchable library** of ~6,000 saved Instagram
reels plus **curricula** (an LMS shell) built from the seven topic inventories.

Live: GitHub Pages (see repo settings) · Source: this repo.

## What it is

- **Layer 0 — data seed.** `data/reels.json` (one record per unique saved reel:
  creator, URL, collection, filing note, inventory clusters) and
  `data/curricula.json` (one curriculum per domain; modules = inventory
  clusters; items = entries with reel URLs). Built by `scripts/build_data.py`
  from the filing records in `~/workspace/instagram-organize/` and the seven
  inventories. See `build-report.json` for exact counts.
- **Layer 1 — searchable library.** Client-side search over creator,
  collection, notes and inventory clusters, with collection/domain filters.
  Every reel links out to Instagram for playback — the site hosts no videos.
- **Layer 2 — curricula (LMS shell).** One curriculum per domain, ordered
  modules, mark-done progress stored in `localStorage` (this device only).
  Mastery quizzes are **not** in this MVP: modules are marked “quiz check
  coming” where an 80%-pass gate will eventually lock the next module.

## What search does NOT cover yet

No transcripts exist at scale, so search does **not** cover what was said
inside the videos (that is the next layer: transcription + Neon Postgres).
A reel with no usable transcript is never filled in with invented content.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

No build step, no server, no external assets — plain HTML/CSS/JS.

## Rebuild the data

```sh
python3 scripts/build_data.py   # regenerates data/*.json + build-report.json
```

Read-only on all sources. Do not edit `data/*.json` by hand.

## Deploy

GitHub Pages serves `main` branch root. Push to `main` and the site is live.

## Next layers (not in this MVP)

1. Transcription — search what was actually said, with clip timestamps.
2. Neon Postgres — live store, synced daily from new saves (+ on-demand refresh).
3. Real mastery quizzes, generated from module sources only, 80% gate enforced.
4. Gap analysis + public supplements per module.
