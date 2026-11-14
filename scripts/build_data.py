#!/usr/bin/env python3
"""Pirate School — Layer 0 data seed.

Reads the Instagram filing records (batch*_plan.json, plus pilot_plan.json
and seed_*.json which hold saves the batch plans never covered) and the
seven topic inventories, and emits:
  data/reels.json     — one record per unique saved reel
  data/curricula.json — one curriculum per domain, modules = clusters,
                        items = inventory entries with reel URLs
  build-report.json   — exact counts for the build report

Read-only on all sources. Run from ~/workspace/pirate-school/:
  python3 scripts/build_data.py
"""
import json, glob, os, re, sys
from collections import Counter, OrderedDict

WS = os.path.expanduser("~/workspace")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(OUT, exist_ok=True)

SHORTCODE = re.compile(r"instagram\.com/(?:reel|p|tv)/([^/?#]+)/?")
MDLINK = re.compile(r"\[([^\]]*)\]\((https://www\.instagram\.com/[^)]+)\)")
BAREURL = re.compile(r"https://www\.instagram\.com/(?:reel|p|tv)/[^)\s\"'<>]+")
GATE_KW = re.compile(r'comment\s*[“"\']([^”"\']+)[”"\']', re.I)


def shortcode(url):
    m = SHORTCODE.search(url or "")
    return m.group(1) if m else None


def clean(s):
    return re.sub(r"\s+", " ", (s or "").strip())


# ---------------------------------------------------------------- reels
def load_rows():
    rows, sources = [], Counter()
    for pat, label in [("instagram-organize/batch*_plan.json", "batch"),
                       ("instagram-organize/pilot_plan.json", "pilot"),
                       ("instagram-organize/seed_*.json", "seed")]:
        for f in sorted(glob.glob(os.path.join(WS, pat))):
            try:
                d = json.load(open(f))
            except Exception as e:
                print(f"WARN skip {f}: {e}", file=sys.stderr)
                continue
            items = d if isinstance(d, list) else d.get("rows") or d.get("items") or []
            for r in items:
                if not isinstance(r, dict) or not r.get("url"):
                    continue
                rows.append(r)
                sources[label] += 1
    return rows, sources


def build_reels():
    raw, sources = load_rows()
    reels, seen_id, seen_url = OrderedDict(), set(), set()
    dup_id = dup_url = 0
    for r in raw:
        mid = (r.get("media_id") or "").strip()
        url = (r.get("url") or "").strip()
        if mid and mid in seen_id:
            dup_id += 1
            continue
        if url in seen_url:
            dup_url += 1
            continue
        if mid:
            seen_id.add(mid)
        seen_url.add(url)
        sc = shortcode(url)
        reels[mid or f"url:{sc or url}"] = {
            "id": mid or f"url:{sc or url}",
            "creator": (r.get("username") or "").lstrip("@"),
            "url": url,
            "shortcode": sc,
            "collection": r.get("collection"),
            "note": clean(r.get("note")),
            "confidence": r.get("confidence"),
            "clusters": [],
            "gated": False,
        }
    return list(reels.values()), {
        "rows_read": len(raw), "by_source": dict(sources),
        "dup_media_id_skipped": dup_id, "dup_url_skipped": dup_url,
        "indexed": len(reels),
        "unfiled_collection_null": sum(1 for x in reels.values() if not x["collection"]),
        "missing_media_id": sum(1 for x in reels.values() if x["id"].startswith("url:")),
    }


# ------------------------------------------------------- table parsing
def split_row(line):
    cells = [clean(c) for c in line.strip().strip("|").split("|")]
    return cells


def parse_table(lines):
    """Yield cell-lists for markdown table rows (skip header + separator)."""
    out = []
    for ln in lines:
        if not ln.strip().startswith("|"):
            continue
        cells = split_row(ln)
        if not cells or cells[0].startswith("---") or set(cells[0]) <= {"-", ":"}:
            continue
        if cells[0] == "#" or cells[0].lower() in ("#", "no."):
            continue
        if all(set(c) <= {"-", ":", " "} for c in cells):
            continue
        out.append(cells)
    return out


def first_url(text):
    m = MDLINK.search(text or "")
    if m:
        return m.group(2)
    m = BAREURL.search(text or "")
    return m.group(0) if m else None


def gate_info(text):
    t = text or ""
    if "GATED" not in t.upper() and "GATE:" not in t.upper():
        return False, None
    m = GATE_KW.search(t)
    return True, (m.group(1) if m else None)


# ------------------------------------------------------------- workflow
def parse_workflow(path):
    text = open(path).read().splitlines()
    clusters, cur_cluster = OrderedDict(), None
    seen = set()
    dups = 0
    i = 0
    while i < len(text):
        ln = text[i]
        hm = re.match(r"^###\s+(?:Merged into|NEW cluster)?\s*(C\d+)\b", ln)
        if hm:
            cur_cluster = hm.group(1)
            title = re.sub(r"^###\s+(?:Merged into|NEW cluster)?\s*C\d+\s*[—–-]\s*", "", ln)
            title = re.sub(r"\s*\(\d+[^)]*\)\s*$", "", title).strip()
            clusters.setdefault(cur_cluster, {"id": cur_cluster, "title": title or cur_cluster, "items": []})
            i += 1
            continue
        if ln.startswith("###"):
            cur_cluster = None
            i += 1
            continue
        if cur_cluster and ln.strip().startswith("|"):
            block = []
            while i < len(text) and text[i].strip().startswith("|"):
                block.append(text[i])
                i += 1
            for cells in parse_table(block):
                if len(cells) < 3 or not cells[0].isdigit():
                    continue
                n = int(cells[0])
                if n in seen:
                    dups += 1
                    continue
                seen.add(n)
                url = first_url(cells[2])
                gated, kw = gate_info(" | ".join(cells[3:]))
                clusters[cur_cluster]["items"].append({
                    "n": n, "creator": cells[1].lstrip("@"),
                    "url": url, "shortcode": shortcode(url),
                    "title": clean(cells[3])[:280] if len(cells) > 3 else "",
                    "gated": gated, "gate": kw,
                })
            continue
        i += 1
    return list(clusters.values()), {"entries": len(seen), "dup_rows_skipped": dups}


# --------------------------------------------------------------- agents
def parse_agents(path):
    text = open(path).read().splitlines()
    clusters, seen = OrderedDict(), set()
    dups = 0
    for ln in text:
        if not ln.strip().startswith("|"):
            continue
        cells = split_row(ln)
        if len(cells) < 6 or not cells[0].isdigit():
            continue
        n = int(cells[0])
        if n in seen:
            dups += 1
            continue
        seen.add(n)
        url = first_url(cells[2])
        cluster_raw = cells[4]
        cm = re.match(r"([A-F])\.\s*([^(\n]+)", cluster_raw)
        cid = cm.group(1) if cm else "?"
        cname = clean(cm.group(2)) if cm else cluster_raw[:60]
        gated, kw = gate_info(cells[5])
        clusters.setdefault(cid, {"id": cid, "title": cname, "items": []})
        clusters[cid]["items"].append({
            "n": n, "creator": cells[1].lstrip("@"),
            "url": url, "shortcode": shortcode(url),
            "title": clean(re.sub(r"https://www\.instagram\.com/\S+", "", cells[2]))[:280],
            "gated": gated, "gate": kw,
        })
    return list(clusters.values()), {"entries": len(seen), "dup_rows_skipped": dups}


# ------------------------------------------- fitness / business (tables +
# OUTLINE cluster maps)
def parse_outline_clusters(path):
    """Return {entry_number: (cluster_id, cluster_title)} from OUTLINE.md.

    Scans every line inside a `### X. ...` cluster section for `#N`
    references (bullets, prose, batch notes); first mention wins as the
    entry's home cluster. Cross-refs inside a section can mis-assign an
    entry that is only mentioned there — best-effort, reported honestly.
    """
    mapping = {}
    cur = None
    for ln in open(path).read().splitlines():
        hm = re.match(r"^###\s+([A-J])\.\s*(.+?)\s*(?:—\s*\d+.*)?$", ln)
        if hm:
            cur = (hm.group(1), clean(hm.group(2)).split(" — ")[0])
            continue
        if ln.startswith("## "):
            cur = None
            continue
        if cur:
            for m in re.finditer(r"#(\d+)\b", ln):
                mapping.setdefault(int(m.group(1)), cur)
    return mapping


def parse_generic_tables(path, cluster_map, domain):
    text = open(path).read().splitlines()
    clusters, seen = OrderedDict(), set()
    dups = 0
    for ln in text:
        if not ln.strip().startswith("|"):
            continue
        cells = split_row(ln)
        if len(cells) < 4 or not cells[0].isdigit():
            continue
        n = int(cells[0])
        if n in seen:
            dups += 1
            continue
        seen.add(n)
        url = first_url(cells[2])
        cid, cname = cluster_map.get(n, ("?", "Unclustered"))
        gated, kw = gate_info(cells[4] if len(cells) > 4 else "")
        clusters.setdefault(cid, {"id": cid, "title": cname, "items": []})
        clusters[cid]["items"].append({
            "n": n, "creator": cells[1].lstrip("@"),
            "url": url, "shortcode": shortcode(url),
            "title": clean(cells[3])[:280] if len(cells) > 3 else "",
            "gated": gated, "gate": kw,
        })
    return list(clusters.values()), {"entries": len(seen), "dup_rows_skipped": dups,
                                     "unclustered": sum(1 for c in clusters.values()
                                                        if c["id"] == "?" for _ in c["items"])}


# ---------------------------------------------------------------- video
def parse_video(path):
    text = open(path).read()
    sections = re.split(r"(?m)^##\s+", text)
    modules, seen_codes = OrderedDict(), set()
    n_items = 0
    for sec in sections[1:]:
        parent = clean(sec.split("\n", 1)[0])
        if parent.lower().startswith(("counts", "cumulative", "molding", "hypit")):
            continue
        for m in re.finditer(
                r"(?m)^###\s+([A-Z]\d+)\s+—\s+@?([^\s—]+)\s+—\s*(.+?)\n(.*?)(?=^###\s|\Z)",
                sec, re.S):
            code, creator, title, body = m.group(1), m.group(2), clean(m.group(3)), m.group(4)
            if code in seen_codes:
                continue
            seen_codes.add(code)
            url = first_url(body)
            gated, kw = gate_info(body)
            desc = ""
            vm = re.search(r"-\s*(?:Verified[^:]*|URL[^:]*):\s*(.+)", body)
            if vm:
                desc = clean(vm.group(1))[:280]
            mod_id = re.sub(r"\s*\(.*$", "", parent)
            modules.setdefault(mod_id, {"id": mod_id, "title": mod_id, "items": []})
            modules[mod_id]["items"].append({
                "n": len(modules[mod_id]["items"]) + 1, "code": code,
                "creator": creator, "url": url, "shortcode": shortcode(url),
                "title": title[:280], "description": desc,
                "gated": gated, "gate": kw,
            })
            n_items += 1
    return list(modules.values()), {"entries": n_items}


# ------------------------------------------------------- security/polish
def parse_skill_checks(path, start_marker, end_markers):
    text = open(path).read().splitlines()
    groups, cur = OrderedDict(), None
    started = False
    for ln in text:
        if not started:
            if ln.startswith("## ") and start_marker in ln:
                started = True
            continue
        if ln.startswith("## "):
            break
        hm = re.match(r"^###\s+(.+)$", ln)
        if hm:
            cur = clean(hm.group(1))
            groups.setdefault(cur, {"id": cur, "title": cur, "items": []})
            continue
        if cur:
            m = re.match(r"^(\d+)\.\s+\*\*(.+?)\*\*\s*(\[[^\]]*\])?", ln)
            if m:
                groups[cur]["items"].append({
                    "n": int(m.group(1)), "title": clean(m.group(2)),
                    "sources": m.group(3) or "", "url": None, "type": "check",
                })
    return list(groups.values()), {"entries": sum(len(g["items"]) for g in groups.values())}


# ------------------------------------------------------------------ main
def main():
    reels, reel_stats = build_reels()
    by_shortcode = {r["shortcode"]: r for r in reels if r["shortcode"]}

    domains = []
    stats = {}
    specs = [
        ("workflow", "Claude Code Workflow",
         "Vibe-coding workflow: how to start, clone, ship, and tool up with Claude Code.",
         parse_workflow, os.path.join(WS, "claude-code-workflow/INVENTORY.md")),
        ("agents", "AI Agents & Employees",
         "Building, employing, and running AI agents — architecture, delegation, memory, Jarvis builds.",
         parse_agents, os.path.join(WS, "skill-aggregation/ai-agents-employees/INVENTORY.md")),
        ("business", "AI Business & Money",
         "Decompiling expensive expertise into AI workflows, marketing, trading systems, and income plays.",
         None, os.path.join(WS, "skill-aggregation/ai-business-money/INVENTORY.md")),
        ("fitness", "Fitness & Training",
         "Mobility, strength, conditioning, skill progressions, and fuel — training methods from saved reels.",
         None, os.path.join(WS, "skill-aggregation/fitness/INVENTORY.md")),
        ("video", "AI Video Directing",
         "Directing AI video: Night Shift pipeline, mocap without a suit, format clones, code-built motion.",
         parse_video, os.path.join(WS, "night-shift-directing-aggregation/INVENTORY.md")),
    ]
    for did, title, desc, fn, path in specs:
        if fn is None:
            outline = path.replace("INVENTORY.md", "OUTLINE.md")
            cmap = parse_outline_clusters(outline)
            modules, st = parse_generic_tables(path, cmap, did)
        else:
            modules, st = fn(path)
        # match items to reels
        matched = unmatched = 0
        for mod in modules:
            for it in mod["items"]:
                r = by_shortcode.get(it.get("shortcode"))
                if r:
                    matched += 1
                    it["reel_id"] = r["id"]
                    if r["collection"]:
                        it["collection"] = r["collection"]
                    if not it.get("title") and r["note"]:
                        it["title"] = r["note"][:280]
                    if it.get("gated"):
                        r["gated"] = True
                    r["clusters"].append({"d": did, "m": mod["id"]})
                else:
                    unmatched += 1
        st["matched_to_reels"] = matched
        st["unmatched_no_reel_record"] = unmatched
        stats[did] = st
        domains.append({"id": did, "title": title, "description": desc, "modules": modules})

    # security + polish (check-based, no reel URLs)
    for did, title, desc, path, start in [
        ("security", "Security Audit",
         "Pre-ship security checks: secrets, auth, injection, payments, infra, AI-agent safety.",
         os.path.join(WS, "custom-skills/vibe-security-complete-audit/SKILL.md"), "1. SCAN"),
        ("polish", "Aesthetic Polish",
         "UI polish checks: loading, motion, touch, typography, feedback, accessibility.",
         os.path.join(WS, "custom-skills/ui-details-audit/SKILL.md"), "THE 47 DETAILS"),
    ]:
        modules, st = parse_skill_checks(path, start, None)
        stats[did] = st
        domains.append({"id": did, "title": title, "description": desc, "modules": modules,
                        "check_based": True})

    # reel cluster counts
    clustered = sum(1 for r in reels if r["clusters"])
    stats["reels"] = reel_stats
    stats["reels"]["with_inventory_cluster"] = clustered

    with open(os.path.join(OUT, "reels.json"), "w") as f:
        json.dump(reels, f, separators=(",", ":"))
    with open(os.path.join(OUT, "curricula.json"), "w") as f:
        json.dump({"generated": "2026-11-14", "domains": domains}, f, separators=(",", ":"))
    with open("build-report.json", "w") as f:
        json.dump(stats, f, indent=1)
    print(json.dumps(stats, indent=1))
    for p in ("reels.json", "curricula.json"):
        fp = os.path.join(OUT, p)
        print(p, round(os.path.getsize(fp) / 1024 / 1024, 2), "MB")


if __name__ == "__main__":
    main()
