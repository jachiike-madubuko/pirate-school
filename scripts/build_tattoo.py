#!/usr/bin/env python3
"""Pirate School — add the Tattoo domain (8th) to data/curricula.json.

Reads the 149 collection == "tatt" rows from data/reels.json and clusters
them into modules using ONLY what the filing notes actually say. No invented
modules, titles, or techniques; item titles come from the filing note,
trimmed to 280 chars like the other domains.

Module rules (first match wins):
  A  Irezumi & Japanese-inspired — notes naming irezumi / neooriental /
     samurai / Japanese style / oriental / porcelain / Neo Japanese / Hanok
  B  Pokémon — notes naming Pokemon or a Pokemon character
  C  One Piece — notes naming One Piece or its characters
  D  Naruto, Dragon Ball & other anime — named anime franchises + generic
     anime pieces
  E  Games, cartoons & pop culture — games, cartoons, movies, comics
  F  Styles & formats — style/format-led pieces with no franchise subject
  ?  Unclustered — notes with no usable subject or style signal (genuine
     singletons, same as the business domain)

Does NOT touch reels.json or the existing 7 domains. Aborts if a tattoo
domain already exists. Run from ~/workspace/pirate-school/:
  python3 scripts/build_tattoo.py
"""
import json, sys

BASE = "/home/hatch/workspace/pirate-school"
DATA = BASE + "/data"

POKEMON_NAMES = [
    "pokemon", "pokémon", "poke ball", "pikachu", "gengar", "snorlax",
    "charizard", "mewtwo", "golurk", "hitmonchan", "magneton", "rayquaza",
    "typhlosion", "tyranitar", "cubone", "togepi", "charmander",
    "charmeleon", "bellsprout", "gyarados", "dratini", "cyndaquil",
    "kyogre", "groudon", "squirtle", "meowth", "eevee", "blastoise",
    "lapras", "totodile", "ash ketchum", "team rocket", "mew ",
    "mew x", "legendary birds", "starter trio", "gen 1",
]


def has(note, *kws):
    n = note.lower()
    return any(k.lower() in n for k in kws)


def module_of(r):
    note = r.get("note") or ""
    if has(note, "irezumi", "neooriental", "samurai", "japanese style",
           "oriental", "porcelain", "neo japanese", "hanok"):
        return "A"
    if has(note, *POKEMON_NAMES):
        return "B"
    if has(note, "one piece", "jinbe", "zoro", "luffy", "sanji", "zeff",
           "kaido", "devil fruit", "thousand sunny", "going merry",
           "gear 5"):
        return "C"
    if has(note, "kirby", "digimon", "agumon", "zelda", "master sword",
           "galaga", "spongebob", "adventure time", "bobs burgers",
           "simpsons", "family guy", "rick and morty", "spider-man",
           "spiderman", "tupac", "toon town", "ghostbusters", "matrix",
           "mickey", "jerry", "tweety"):
        return "E"
    if has(note, "naruto", "itachi", "sasuke", "jutsu", "dbz",
           "dragon ball", "shenron", "frieza", "gohan", "master roshi",
           "soul eater", "anime"):
        return "D"
    if has(note, "blackwork", "lettering", "traditional", "pixel",
           "realistic", "3d tattoo", "dotwork", "stipple", "glitch",
           "embroidery", "origami", "flash", "linocut", "minimal",
           "botanical", "flower", "cover-up", "fresh vs healed",
           "timelapse", "process video", "studio", "promo",
           "guest artist", "small tattoo"):
        return "F"
    return "?"


TITLES = {
    "A": "Irezumi & Japanese-inspired",
    "B": "Pokémon",
    "C": "One Piece",
    "D": "Naruto, Dragon Ball & other anime",
    "E": "Games, cartoons & pop culture",
    "F": "Styles & formats: lettering, blackwork, traditional, flash, 3D, dotwork & studio work",
    "?": "Unclustered",
}
ORDER = ["A", "B", "C", "D", "E", "F", "?"]


def main():
    reels = json.load(open(DATA + "/reels.json"))
    rows = reels if isinstance(reels, list) else reels.get("reels", reels)
    tatt = [r for r in rows if (r.get("collection") or "") == "tatt"]
    assert len(tatt) == 149, f"expected 149 tatt rows, got {len(tatt)}"

    cur = json.load(open(DATA + "/curricula.json"))
    if any(d["id"] == "tattoo" for d in cur["domains"]):
        print("ABORT: tattoo domain already exists", file=sys.stderr)
        sys.exit(1)
    before = json.dumps(cur["domains"], separators=(",", ":"))

    grouped = {mid: [] for mid in ORDER}
    for r in tatt:
        grouped[module_of(r)].append(r)

    modules = []
    total = 0
    for mid in ORDER:
        items = grouped[mid]
        if not items:
            continue
        total += len(items)
        modules.append({
            "id": mid, "title": TITLES[mid],
            "items": [{
                "n": i + 1,
                "creator": (r.get("creator") or "").lstrip("@"),
                "url": r["url"],
                "shortcode": r.get("shortcode"),
                "title": (r.get("note") or "")[:280],
                "gated": bool(r.get("gated")),
                "gate": None,
                "reel_id": r["id"],
                "collection": "tatt",
            } for i, r in enumerate(items)],
        })
    assert total == 149, f"module counts add to {total}, not 149"

    domain = {
        "id": "tattoo",
        "title": "Tattoo",
        "description": "Tattoo inspiration from saved reels: Pokémon and anime pieces, Japanese-inspired work, games and cartoons, styles, flash and studio pieces.",
        "modules": modules,
    }
    cur["domains"].append(domain)

    # the existing 7 domains must be byte-identical after the round-trip
    after = json.dumps(cur["domains"][:7], separators=(",", ":"))
    assert before == after, "existing domains changed during round-trip!"

    with open(DATA + "/curricula.json", "w") as f:
        json.dump(cur, f, separators=(",", ":"))
    for m in modules:
        print(f"{m['id']} {m['title']}: {len(m['items'])}")
    print(f"tattoo domain total: {total}")
    print(f"grand total: {sum(len(m['items']) for d in cur['domains'] for m in d['modules'])}")


if __name__ == "__main__":
    main()
