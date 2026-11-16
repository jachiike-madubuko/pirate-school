/* Pirate School — layout overhaul (vanilla JS, no build step, no server).
   Data lives in data/reels.json and data/curricula.json. Progress lives in
   localStorage on this device only. Search covers creator, collection, note,
   and inventory cluster — there are no transcripts yet, so no transcript search.
   Routes (hash): #/home (default), #/library, #/curricula, #/curriculum/<id>, #/about. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  var hero = document.getElementById("hero");
  var PROGRESS_KEY = "pirate-school-progress-v1";
  var PAGE = 100;

  var DOMAIN_COLORS = {
    workflow: "#2ee6ff",
    agents: "#ff4fa3",
    business: "#ffd93b",
    fitness: "#7dff5e",
    video: "#9b5cff",
    security: "#ff6b5e",
    polish: "#5ea8ff",
    tattoo: "#ff8ad8"
  };
  var DOMAIN_EMOJI = {
    workflow: "⚙️",
    agents: "🤖",
    business: "💰",
    fitness: "💪",
    video: "🎬",
    security: "🛡️",
    polish: "✨",
    tattoo: "🖊️"
  };

  var reels = null, curricula = null, loadError = null;
  var query = "", collectionFilter = "", domainFilter = "";
  var resultsCache = [], renderedCount = 0;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------- progress (localStorage only) ---------------- */
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function isDone(domain, module) {
    return !!loadProgress()[domain + ":" + module];
  }
  function toggleDone(domain, module) {
    var p = loadProgress(), k = domain + ":" + module;
    if (p[k]) delete p[k]; else p[k] = new Date().toISOString().slice(0, 10);
    saveProgress(p);
    render(true);
  }
  function overallProgress() {
    var done = 0, total = 0, items = 0;
    domains().forEach(function (d) {
      d.modules.forEach(function (m) {
        total++;
        items += m.items.length;
        if (isDone(d.id, m.id)) done++;
      });
    });
    return { done: done, total: total, items: items, pct: total ? Math.round(done / total * 100) : 0 };
  }

  /* ---------------- data ---------------- */
  function haystack(r) {
    var parts = [r.creator, r.note, r.collection || "", r.confidence || ""];
    (r.clusters || []).forEach(function (c) { parts.push(c.d, c.m); });
    return parts.join(" ").toLowerCase();
  }
  function loadData() {
    return Promise.all([
      fetch("data/reels.json").then(function (r) { return r.json(); }),
      fetch("data/curricula.json").then(function (r) { return r.json(); })
    ]).then(function (both) {
      reels = both[0];
      curricula = both[1];
      reels.forEach(function (r) { r._h = haystack(r); });
      fillHero();
    }).catch(function (e) { loadError = e; });
  }

  /* ---------------- search ---------------- */
  function searchReels(q, coll, dom) {
    var tokens = (q == null ? query : q).toLowerCase().split(/\s+/).filter(Boolean);
    var cf = coll == null ? collectionFilter : coll;
    var df = dom == null ? domainFilter : dom;
    var out = [];
    for (var i = 0; i < reels.length; i++) {
      var r = reels[i];
      if (cf && (r.collection || "") !== cf) continue;
      if (df && !(r.clusters || []).some(function (c) { return c.d === df; })) continue;
      if (tokens.length) {
        var ok = true;
        for (var t = 0; t < tokens.length; t++) {
          if (r._h.indexOf(tokens[t]) === -1) { ok = false; break; }
        }
        if (!ok) continue;
      }
      out.push(r);
      if (out.length >= 5000) break;
    }
    return out;
  }

  /* ---------------- helpers ---------------- */
  function collections() {
    var set = {};
    reels.forEach(function (r) { if (r.collection) set[r.collection] = 1; });
    return Object.keys(set).sort();
  }
  function domains() { return curricula.domains; }
  function domainById(id) {
    for (var i = 0; i < curricula.domains.length; i++)
      if (curricula.domains[i].id === id) return curricula.domains[i];
    return null;
  }
  function domColor(id) { return DOMAIN_COLORS[id] || "#2ee6ff"; }
  function ringSVG(pct, color, size) {
    var r = size === "lg" ? 36 : 26;
    var c = (2 * Math.PI * r).toFixed(1);
    var off = (c * (1 - pct / 100)).toFixed(1);
    var dim = size === "lg" ? 84 : 64;
    return '<span class="ring-wrap' + (size === "lg" ? " lg" : "") + '" style="--dom:' + color + '">' +
      '<svg class="ring" width="' + dim + '" height="' + dim + '" viewBox="0 0 ' + dim + " " + dim + '" aria-hidden="true">' +
      '<circle class="ring-bg" cx="' + dim / 2 + '" cy="' + dim / 2 + '" r="' + r + '"/>' +
      '<circle class="ring-fg" cx="' + dim / 2 + '" cy="' + dim / 2 + '" r="' + r + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '"/>' +
      "</svg>" +
      '<span class="ring-pct">' + pct + "%</span></span>";
  }

  /* ---------------- hero (stats + spotlight) ---------------- */
  function fillHero() {
    var items = overallProgress().items;
    document.getElementById("stat-reels").textContent = reels.length.toLocaleString();
    document.getElementById("stat-items").textContent = items.toLocaleString();
    document.getElementById("stat-domains").textContent = domains().length;
    document.getElementById("stat-collections").textContent = collections().length;
    rollSpotlight();
  }
  function randomReel() {
    return reels[Math.floor(Math.random() * reels.length)];
  }
  function spotlightHTML(r) {
    return '<p class="spotlight-label">🎲 Random reel — feeling lucky?</p>' +
      '<div class="spotlight-body"><p><span class="who">@' + esc(r.creator || "unknown creator") + "</span>" +
      (r.note ? " — " + esc(r.note) : " — no note on file.") + "</p>" +
      '<span class="spotlight-actions">' +
      '<a class="btn btn-primary" href="' + esc(r.url) + '" target="_blank" rel="noopener">▶ Watch on Instagram</a>' +
      '<button class="btn btn-ghost" id="shuffle-btn" type="button">↻ Shuffle</button>' +
      "</span></div>";
  }
  function rollSpotlight() {
    var el = document.getElementById("spotlight");
    if (el && reels) el.innerHTML = spotlightHTML(randomReel());
  }

  /* ---------------- library ---------------- */
  function reelCard(r, i) {
    var chips = [];
    if (r.collection) chips.push('<span class="chip collection">' + esc(r.collection) + "</span>");
    (r.clusters || []).forEach(function (c) {
      chips.push('<span class="chip">' + esc(c.d) + " · " + esc(c.m) + "</span>");
    });
    if (r.gated) chips.push('<span class="chip gated">🔒 gated — method behind a comment keyword</span>');
    return '<article class="card" style="--i:' + (i % 12) + '">' +
      "<h3>@" + esc(r.creator || "unknown creator") + "</h3>" +
      (r.note ? "<p>" + esc(r.note) + "</p>" : '<p class="sub">No note on file.</p>') +
      '<div class="meta">' + chips.join("") + "</div>" +
      '<a class="watch" href="' + esc(r.url) + '" target="_blank" rel="noopener">▶ Watch on Instagram</a>' +
      "</article>";
  }

  function chipRow(kind, options, current) {
    var html = '<div class="chiprow" role="group" aria-label="' + (kind === "coll" ? "Filter by collection" : "Filter by domain") + '">';
    options.forEach(function (o) {
      var val = o.value, label = o.label;
      var pressed = current === val;
      var style = kind === "dom" && val ? ' style="--dom:' + domColor(val) + '"' : "";
      html += '<button type="button" class="fchip' + (kind === "dom" ? " dom" : "") + '" data-' + kind + '="' + esc(val) + '"' + style +
        ' aria-pressed="' + pressed + '">' + esc(label) + "</button>";
    });
    return html + "</div>";
  }

  function libraryShell() {
    var collOpts = [{ value: "", label: "All collections" }].concat(
      collections().map(function (c) { return { value: c, label: c }; }));
    var domOpts = [{ value: "", label: "All domains" }].concat(
      domains().map(function (d) { return { value: d.id, label: d.title }; }));
    return '<div class="view">' +
      '<div class="searchbox"><label for="q">Search the library</label>' +
      '<div class="searchwrap"><span class="search-icon" aria-hidden="true">⌕</span>' +
      '<input type="search" id="q" placeholder="Try: windmill, Claude Code, mobility…" value="' + esc(query) + '" autocomplete="off">' +
      '<button class="search-clear" id="q-clear" type="button" aria-label="Clear search"' + (query ? "" : ' hidden') + ">✕</button></div></div>" +
      '<p class="chiprow-label">Collection</p>' + chipRow("coll", collOpts, collectionFilter) +
      '<p class="chiprow-label">Domain</p>' + chipRow("dom", domOpts, domainFilter) +
      '<p class="countline" id="countline"></p>' +
      '<div class="results" id="results"></div>' +
      '<div class="loadmore-wrap"><button class="btn" id="loadmore" type="button" hidden>Show more</button></div>' +
      "</div>";
  }

  function updateCountline() {
    var el = document.getElementById("countline");
    if (!el) return;
    el.innerHTML = "<strong>" + resultsCache.length.toLocaleString() + "</strong> reel" + (resultsCache.length === 1 ? "" : "s") +
      " — showing first " + Math.min(renderedCount, resultsCache.length).toLocaleString() +
      " · " + reels.length.toLocaleString() + " indexed in total";
    var lm = document.getElementById("loadmore");
    if (lm) lm.hidden = renderedCount >= resultsCache.length;
  }

  function appendNext() {
    var box = document.getElementById("results");
    if (!box) return;
    var slice = resultsCache.slice(renderedCount, renderedCount + PAGE);
    var html = "";
    slice.forEach(function (r, j) { html += reelCard(r, renderedCount + j); });
    if (!slice.length && renderedCount === 0) {
      box.innerHTML = '<p class="empty">Nothing matches. Try fewer words, or clear a filter.<br>' +
        "Search covers creator, collection, notes and inventory clusters — not transcripts (none exist yet).</p>";
    } else {
      box.insertAdjacentHTML("beforeend", html);
    }
    renderedCount += slice.length;
    updateCountline();
  }

  function refreshResults() {
    resultsCache = searchReels();
    renderedCount = 0;
    var box = document.getElementById("results");
    if (box) box.innerHTML = "";
    appendNext();
  }

  /* ---------------- home + curricula (shared bento) ---------------- */
  /* The bento grid (progress summary + one card per domain) is the front
     door on Home and the full list on Curricula — one builder, used twice. */
  function bentoHTML() {
    var ov = overallProgress();
    var html = '<div class="bento">' +
      '<article class="card summary-tile"><div class="summary-body">' +
      ringSVG(ov.pct, "#ffd93b", "lg") +
      "<div><h3>Your progress</h3><p>" + ov.done + " of " + ov.total + " modules done · " + ov.items + " items across " + domains().length + " domains</p></div>" +
      "</div></article>";
    html += domains().map(function (d, di) {
      var total = d.modules.length;
      var done = d.modules.filter(function (m) { return isDone(d.id, m.id); }).length;
      var items = d.modules.reduce(function (a, m) { return a + m.items.length; }, 0);
      var pct = total ? Math.round(done / total * 100) : 0;
      var color = domColor(d.id);
      return '<a class="card domcard" style="--i:' + (di % 8) + '; --dom:' + color + '" href="#/curriculum/' + esc(d.id) + '">' +
        '<div class="domcard-top"><div class="dom-text"><h3><span class="dom-emoji" aria-hidden="true">' + (DOMAIN_EMOJI[d.id] || "📖") + "</span> " + esc(d.title) + "</h3>" +
        "<p>" + esc(d.description) + "</p></div>" +
        '<span role="img" aria-label="' + done + " of " + total + ' modules done">' + ringSVG(pct, color) + "</span></div>" +
        '<div class="domcard-foot"><span class="proglabel">' + done + " / " + total + " modules · " + items + ' items</span>' +
        '<span class="cta">' + (done === total && total ? "Complete ✓" : done ? "Continue →" : "Start →") + "</span></div></a>";
    }).join("");
    return html + "</div>";
  }

  function homeView() {
    return '<div class="view"><h2>Pick a domain</h2>' +
      '<p class="sub">One curriculum per domain — pick one and work through its modules, in order. ' +
      "Progress is stored on this device only.</p>" +
      bentoHTML() + "</div>";
  }

  function curriculaView() {
    return '<div class="view"><h2>Curricula</h2>' +
      '<p class="sub">One curriculum per domain. Modules are the inventory clusters, in order. ' +
      "Progress is stored on this device only.</p>" +
      '<div class="notice">🎓 <strong>Quizzes aren’t built yet.</strong> Each module shows where a mastery check (default 80% pass) will gate the next one. For now, mark a module done when you’ve worked through its reels.</div>' +
      bentoHTML() + "</div>";
  }

  function curriculumView(d) {
    var total = d.modules.length;
    var done = d.modules.filter(function (m) { return isDone(d.id, m.id); }).length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var color = domColor(d.id);
    var html = '<div class="view" style="--dom:' + color + '"><a class="back" href="#/curricula">← All curricula</a>' +
      '<div class="domhead"><h2>' + esc(d.title) + "</h2>" +
      '<span role="img" aria-label="' + done + " of " + total + ' modules done">' + ringSVG(pct, color, "lg") + "</span></div>" +
      '<p class="sub">' + esc(d.description) + "</p>" +
      '<div class="dom-progress" role="img" aria-label="' + done + " of " + total + ' modules done"><span style="width:' + pct + '%"></span></div>' +
      '<p class="proglabel">' + done + " / " + total + " modules done</p>";
    if (d.check_based)
      html += '<div class="notice">✅ This curriculum is a checklist, not videos: each item is one audit check from the live skill. Mark a module done when you’ve run its checks.</div>';
    html += d.modules.map(function (m, mi) {
      var mDone = isDone(d.id, m.id);
      var items = m.items.map(function (it) {
        var inner = '<div class="item"><span class="who">#' + it.n + " — @" + esc(it.creator || "—") + "</span>";
        if (it.title) inner += '<div class="what">' + esc(it.title) + "</div>";
        if (it.url) inner += '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">▶ Watch on Instagram</a>';
        else if (it.type === "check") inner += '<div class="what">Check from the live skill — no reel attached.</div>';
        if (it.gated) inner += ' <span class="chip gated">🔒 gated' + (it.gate ? " — comment “" + esc(it.gate) + "”" : "") + "</span>";
        return inner + "</div>";
      }).join("");
      return '<section class="card module" id="mod-' + esc(m.id) + '" style="--i:' + (mi % 8) + '">' +
        '<div class="module-head"><h3>' + esc(m.id) + " — " + esc(m.title) + "</h3>" +
        '<button class="done-btn" data-domain="' + esc(d.id) + '" data-module="' + esc(m.id) + '" aria-pressed="' + mDone + '">' +
        (mDone ? "✓ Done" : "Mark done") + "</button></div>" +
        '<p class="proglabel">' + m.items.length + ' item' + (m.items.length === 1 ? "" : "s") +
        ' · <span class="chip quiz">Quiz check coming</span></p>' + items + "</section>";
    }).join("");
    return html + "</div>";
  }

  function aboutView() {
    var totalItems = overallProgress().items;
    var sections = [
      ["About this MVP", "<p><strong>Pirate School</strong> turns saved Instagram reels into a searchable library with a mastery-gated curriculum on top — the method from @angus.sewell’s “pirate a $40k private school” reel, and the searchable-app idea from @ariacodez’s “Recall” reel.</p>"],
      ["What’s in here", "<p><strong>" + reels.length.toLocaleString() + "</strong> saved reels indexed, across " +
        collections().length + " collections. <strong>" + totalItems + "</strong> curriculum items across " +
        domains().length + " domains.</p>"],
      ["What search covers — and what it doesn’t", "<p>Search matches <strong>creator, collection, the filing note, and inventory cluster</strong>. It does <strong>not</strong> search transcripts, because no transcripts exist at scale yet — that’s the next layer (transcription + Neon database). A reel with no usable transcript is never filled in with invented content.</p>"],
      ["What the LMS shell does — and doesn’t", "<p>Each domain is a curriculum of ordered modules (the inventory clusters). You can mark modules done; progress is stored in this browser’s localStorage and survives reload on this device. <strong>Mastery quizzes are not built yet</strong> — modules are marked “quiz check coming” where an 80%-pass gate will eventually lock the next module.</p>"],
      ["Next layers", "<p>1) Transcription of the reels, so search covers what was actually said. 2) Neon Postgres as the live store, synced daily from new saves. 3) Real mastery quizzes generated from module sources only, with the 80% gate enforced. 4) Gap analysis and public supplements per module.</p>"],
      ["Honesty notes", "<p>Some inventory entries reference reels with no filing record in the batch files (mostly recent daily-watch items) — they still appear in curricula with their inventory title and Instagram link, just without a collection or note. Gated reels are flagged, never reconstructed. Videos are never hosted here.</p>"]
    ];
    return '<div class="view about">' + sections.map(function (s, i) {
      return '<section style="--i:' + i + '"><h2>' + s[0] + "</h2>" + s[1] + "</section>";
    }).join("") + "</div>";
  }

  /* ---------------- command palette ---------------- */
  var palette = document.getElementById("palette");
  var paletteInput = document.getElementById("palette-input");
  var paletteResults = document.getElementById("palette-results");
  var paletteActive = -1;
  var paletteItems = [];

  function paletteActions() {
    return [
      { label: "Go to Home", sub: "Hero stats, spotlight, and the 8 domains", action: "home" },
      { label: "Go to Library", sub: "Browse all 5,973 saved reels", action: "library" },
      { label: "Go to Curricula", sub: "8 domains, 626 items", action: "curricula" },
      { label: "Go to About", sub: "What’s in here, and what’s next", action: "about" },
      { label: "🎲 Random reel", sub: "Feeling lucky — open a random save", action: "random" }
    ];
  }
  function renderPalette() {
    var q = paletteInput.value.trim();
    var html = "";
    paletteItems = [];
    if (!q) {
      paletteActions().forEach(function (a, i) {
        paletteItems.push({ action: a.action });
        html += '<li><button type="button" class="palette-item" id="pal-item-' + i + '" data-action="' + a.action + '" role="option" aria-selected="false">' +
          '<span class="who">' + esc(a.label) + '</span><span class="what">' + esc(a.sub) + "</span></button></li>";
      });
    } else {
      var hits = searchReels(q, "", "").slice(0, 8);
      if (!hits.length) {
        html = '<li class="palette-empty">Nothing matches “' + esc(q) + "”. Search covers creator, collection, notes and clusters — not transcripts.</li>";
      } else {
        hits.forEach(function (r, i) {
          paletteItems.push({ url: r.url });
          html += '<li><button type="button" class="palette-item" id="pal-item-' + i + '" data-url="' + esc(r.url) + '" role="option" aria-selected="false">' +
            '<span class="who">@' + esc(r.creator || "unknown creator") + "</span>" +
            '<span class="what">' + esc(r.note || "No note on file.") + "</span>" +
            '<span class="meta">' + (r.collection ? '<span class="chip collection">' + esc(r.collection) + "</span>" : "") + "</span></button></li>";
        });
      }
    }
    paletteResults.innerHTML = html;
    setPaletteActive(paletteItems.length ? 0 : -1);
  }
  function setPaletteActive(i) {
    paletteActive = i;
    Array.prototype.forEach.call(paletteResults.querySelectorAll(".palette-item"), function (el, j) {
      var on = j === i;
      el.classList.toggle("active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    paletteInput.setAttribute("aria-activedescendant", i >= 0 ? "pal-item-" + i : "");
  }
  function runPaletteItem(item) {
    if (!item) return;
    if (item.url) { window.open(item.url, "_blank", "noopener"); return; }
    closePalette();
    if (item.action === "random") {
      var r = randomReel();
      if (r) window.open(r.url, "_blank", "noopener");
    } else if (item.action) {
      location.hash = "#/" + item.action;
    }
  }
  function openPalette() {
    palette.hidden = false;
    document.body.style.overflow = "hidden";
    paletteInput.value = "";
    renderPalette();
    paletteInput.focus();
  }
  function closePalette() {
    palette.hidden = true;
    document.body.style.overflow = "";
  }

  /* ---------------- router ---------------- */
  function render(preserveScroll) {
    var y = preserveScroll ? window.scrollY : 0;
    var hash = location.hash || "#/home";
    var parts = hash.replace(/^#\//, "").split("/");
    var view = parts[0] || "home";
    if (["home", "library", "curricula", "curriculum", "about"].indexOf(view) === -1) view = "home";
    ["home", "library", "curricula", "about"].forEach(function (t) {
      ["tab-", "btab-"].forEach(function (p) {
        var el = document.getElementById(p + t);
        if (el) el.setAttribute("aria-current", t === view || (t === "curricula" && view === "curriculum") ? "page" : "false");
      });
    });
    hero.hidden = view !== "home";
    var html;
    if (loadError) {
      html = '<p class="empty">The library data failed to load. Check your connection and reload.</p>';
    } else if (!reels) {
      html = '<div class="skeleton-wrap" aria-hidden="true"><div class="sk sk-search"></div><div class="sk sk-chiprow"></div><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div><p class="loading">Loading Pirate School…</p>';
    } else if (view === "curricula") {
      html = curriculaView();
    } else if (view === "curriculum" && parts[1]) {
      var d = domainById(parts[1]);
      html = d ? curriculumView(d) : '<p class="empty">Unknown curriculum. <a href="#/curricula">Back to curricula</a></p>';
    } else if (view === "about") {
      html = aboutView();
    } else if (view === "library") {
      html = libraryShell();
    } else {
      html = homeView();
    }
    app.innerHTML = html;
    if (view === "library" && reels) refreshResults();
    bindLibrary();
    if (preserveScroll) window.scrollTo(0, y);
    else if (!preserveScroll && view) window.scrollTo(0, 0);
  }

  function bindLibrary() {
    var q = document.getElementById("q");
    if (q) {
      q.addEventListener("input", function () {
        query = q.value;
        var clear = document.getElementById("q-clear");
        if (clear) clear.hidden = !query;
        clearTimeout(q._t);
        q._t = setTimeout(refreshResults, 150);
      });
      q.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { q.value = ""; query = ""; refreshResults(); }
      });
    }
    var clearBtn = document.getElementById("q-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      var q2 = document.getElementById("q");
      if (q2) { q2.value = ""; q2.focus(); }
      query = "";
      refreshResults();
    });
    var lm = document.getElementById("loadmore");
    if (lm) lm.addEventListener("click", appendNext);
  }

  /* delegated clicks inside #app: filter chips + done buttons + shuffle */
  app.addEventListener("click", function (e) {
    var chip = e.target.closest("[data-coll], [data-dom]");
    if (chip) {
      if (chip.hasAttribute("data-coll")) {
        collectionFilter = chip.getAttribute("data-coll");
        app.querySelectorAll("[data-coll]").forEach(function (c) {
          c.setAttribute("aria-pressed", c.getAttribute("data-coll") === collectionFilter ? "true" : "false");
        });
      } else {
        domainFilter = chip.getAttribute("data-dom");
        app.querySelectorAll("[data-dom]").forEach(function (c) {
          c.setAttribute("aria-pressed", c.getAttribute("data-dom") === domainFilter ? "true" : "false");
        });
      }
      refreshResults();
      return;
    }
    var btn = e.target.closest(".done-btn");
    if (btn) {
      toggleDone(btn.getAttribute("data-domain"), btn.getAttribute("data-module"));
    }
  });

  /* shuffle (hero spotlight) — hero is outside #app */
  document.getElementById("spotlight").addEventListener("click", function (e) {
    if (e.target.closest("#shuffle-btn")) rollSpotlight();
  });

  /* ---------------- palette wiring ---------------- */
  document.getElementById("palette-open").addEventListener("click", openPalette);
  document.getElementById("palette-open-mobile").addEventListener("click", openPalette);
  document.getElementById("palette-close").addEventListener("click", closePalette);
  document.getElementById("palette-backdrop").addEventListener("click", closePalette);
  paletteInput.addEventListener("input", function () { renderPalette(); });
  paletteInput.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (paletteItems.length) setPaletteActive((paletteActive + 1) % paletteItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (paletteItems.length) setPaletteActive((paletteActive - 1 + paletteItems.length) % paletteItems.length); }
    else if (e.key === "Enter") { e.preventDefault(); runPaletteItem(paletteItems[paletteActive]); }
    else if (e.key === "Escape") { closePalette(); }
  });
  paletteResults.addEventListener("click", function (e) {
    var item = e.target.closest(".palette-item");
    if (!item) return;
    var idx = Array.prototype.indexOf.call(paletteResults.querySelectorAll(".palette-item"), item);
    runPaletteItem(paletteItems[idx]);
  });
  paletteResults.addEventListener("mousemove", function (e) {
    var item = e.target.closest(".palette-item");
    if (!item) return;
    var idx = Array.prototype.indexOf.call(paletteResults.querySelectorAll(".palette-item"), item);
    if (idx !== paletteActive) setPaletteActive(idx);
  });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (palette.hidden) openPalette(); else closePalette();
    } else if (e.key === "Escape" && !palette.hidden) {
      closePalette();
    }
  });

  window.addEventListener("hashchange", function () { render(false); });
  loadData().then(function () { render(false); });
})();
