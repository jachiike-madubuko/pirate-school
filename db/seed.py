#!/usr/bin/env python3
"""Seed the Pirate School Neon database from the live site's JSON files.

Usage:
  DATABASE_URL=<direct connection string> python3 seed.py [--verify]

Reads DATABASE_URL from the environment only. Never prints it.
Idempotent: re-running the seed inserts zero duplicate rows
(ON CONFLICT DO NOTHING everywhere; import twice = zero new reels).

What it seeds:
  reels          from data/reels.json      (transcript_status = 'pending' for all)
  clusters       distinct (domain, module) pairs found on reels
  reel_clusters  the reels' cluster memberships
  domains        from data/curricula.json
  modules        from data/curricula.json (ordered, 1-based)
  items          from data/curricula.json (reel items + check items)

Left empty by design (filled by later layers):
  tags, reel_tags   (need transcripts; every tag traces to a sentence)
  skills, sources, checks, progress
"""
import json
import os
import sys

import psycopg

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")


def load_json(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def seed(conn):
    reels = load_json("reels.json")
    curricula = load_json("curricula.json")

    with conn.cursor() as cur:
        # Schema first (safe to re-run).
        with open(SCHEMA_PATH, encoding="utf-8") as f:
            cur.execute(f.read())

        # --- reels: every reel starts transcript_status = 'pending' ---
        cur.executemany(
            """INSERT INTO reels (id, platform, creator, url, shortcode, collection,
                                  note, confidence, gated, transcript_status)
               VALUES (%s, 'instagram', %s, %s, %s, %s, %s, %s, %s, 'pending')
               ON CONFLICT (id) DO NOTHING""",
            [(r.get("id"), r.get("creator"), r.get("url"), r.get("shortcode"),
              r.get("collection"), r.get("note"), r.get("confidence"),
              bool(r.get("gated"))) for r in reels],
        )

        # --- domains / modules / items ---
        module_titles = {}
        for d in curricula["domains"]:
            cur.execute(
                """INSERT INTO domains (id, title, description, check_based)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (id) DO NOTHING""",
                (d["id"], d.get("title"), d.get("description"),
                 bool(d.get("check_based", False))),
            )
            for i, m in enumerate(d["modules"], start=1):
                mid = f"{d['id']}:{m['id']}"
                module_titles[mid] = m.get("title")
                cur.execute(
                    """INSERT INTO modules (id, curriculum, module_code, title, ord)
                       VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT (id) DO NOTHING""",
                    (mid, d["id"], m["id"], m.get("title"), i),
                )
                cur.executemany(
                    """INSERT INTO items (module_id, n, item_type, creator, url, shortcode,
                                          title, gated, gate, reel_id, collection,
                                          code, description, sources)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (module_id, n) DO NOTHING""",
                    [(mid, it.get("n"), it.get("type", "reel"),
                      it.get("creator"), it.get("url"), it.get("shortcode"),
                      it.get("title"), bool(it.get("gated")),
                      it.get("gate"), it.get("reel_id"), it.get("collection"),
                      it.get("code"), it.get("description"), it.get("sources"))
                     for it in m["items"]],
                )

        # --- clusters + reel_clusters, derived from the reels' cluster lists ---
        pairs = {}
        links = []
        for r in reels:
            for cl in r.get("clusters") or []:
                cid = f"{cl['d']}:{cl['m']}"
                pairs[cid] = (cl["d"], cl["m"])
                links.append((r["id"], cid))
        for cid, (dom, mod) in pairs.items():
            cur.execute(
                """INSERT INTO clusters (id, name, domain, inventory_ref)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (id) DO NOTHING""",
                (cid, module_titles.get(cid, mod), dom, mod),
            )
        cur.executemany(
            """INSERT INTO reel_clusters (reel_id, cluster_id)
               VALUES (%s, %s) ON CONFLICT DO NOTHING""",
            links,
        )

    conn.commit()
    return {"reels": len(reels)}


def verify(conn):
    out = {}
    with conn.cursor() as cur:
        for table in ("reels", "clusters", "reel_clusters", "tags", "reel_tags",
                      "domains", "skills", "modules", "items", "sources",
                      "checks", "progress"):
            cur.execute(f"SELECT count(*) FROM {table}")
            out[table] = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM reels WHERE transcript_status = 'pending'")
        out["reels_pending"] = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM reels WHERE transcript_status <> 'pending'")
        out["reels_not_pending"] = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM reels WHERE transcript IS NOT NULL")
        out["reels_with_transcript"] = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM items WHERE item_type = 'reel'")
        out["items_reel"] = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM items WHERE item_type = 'check'")
        out["items_check"] = cur.fetchone()[0]
        # Spot checks
        cur.execute("SELECT id, title FROM domains WHERE id = 'tattoo'")
        out["spot_tattoo_domain"] = cur.fetchone()
        cur.execute(
            "SELECT count(*) FROM items i JOIN modules m ON m.id = i.module_id "
            "WHERE m.curriculum = 'tattoo'")
        out["spot_tattoo_items"] = cur.fetchone()[0]
        cur.execute(
            "SELECT count(*) FROM reels WHERE gated = TRUE")
        out["spot_gated_reels"] = cur.fetchone()[0]
        cur.execute(
            "SELECT id, creator, collection FROM reels "
            "WHERE url = 'https://www.instagram.com/reel/Crb9Pa2JmP_/'")
        out["spot_first_reel"] = cur.fetchone()
    return out


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("error: DATABASE_URL is not set (direct string only, never -pooler)",
              file=sys.stderr)
        return 2
    do_verify = "--verify" in sys.argv
    with psycopg.connect(dsn, connect_timeout=30) as conn:
        if not do_verify:
            seeded = seed(conn)
            print(f"seeded from JSON: {seeded['reels']} reels in source file")
        result = verify(conn)
    for key, value in result.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
