/* Pirate School MVP — Layers 0–2.
   Static, no build step, no server. Data lives in data/reels.json and
   data/curricula.json. Progress lives in localStorage on this device only.
   Search covers creator, collection, note, and inventory cluster —
   there are no transcripts yet, so there is no transcript search. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  var PROGRESS_KEY = "pirate-school-progress-v1";
  var MAX_RESULTS = 100;

  var reels = null, curricula = null, loadError = null;
  var query = "", collectionFilter = "", domainFilter = "";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function shortcodeOf(url) {
    var m = /instagram\.com\/(?:reel|p|tv)\/([^/?#]+)/.exec(url || "");
    return m ? m[1] : "";
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
    render();
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
    }).catch(function (e) { loadError = e; });
  }

  /* ---------------- search ---------------- */
  function searchReels() {
    var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < reels.length; i++) {
      var r = reels[i];
      if (collectionFilter && (r.collection || "") !== collectionFilter) continue;
      if (domainFilter && !(r.clusters || []).some(function (c) { return c.d === domainFilter; })) continue;
      if (tokens.length) {
        var ok = true;
        for (var t = 0; t < tokens.length; t++) {
          if (r._h.indexOf(tokens[t]) === -1) { ok = false; break; }
        }
        if (!ok) continue;
      }
      out.push(r);
      if (out.length >= 5000) break; // safety cap; UI shows first MAX_RESULTS
    }
    return out;
  }

  /* ---------------- views ---------------- */
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

  function reelCard(r) {
    var chips = [];
    if (r.collection) chips.push('<span class="chip collection">' + esc(r.collection) + "</span>");
    (r.clusters || []).forEach(function (c) {
      chips.push('<span class="chip">' + esc(c.d) + " · " + esc(c.m) + "</span>");
    });
    if (r.gated) chips.push('<span class="chip gated">🔒 gated — method behind a comment keyword</span>');
    return '<article class="card">' +
      "<h3>@" + esc(r.creator || "unknown creator") + "</h3>" +
      (r.note ? "<p>" + esc(r.note) + "</p>" : '<p class="sub">No note on file.</p>') +
      '<div class="meta">' + chips.join("") + "</div>" +
      '<a class="watch" href="' + esc(r.url) + '" target="_blank" rel="noopener">▶ Watch on Instagram</a>' +
      "</article>";
  }

  function libraryView() {
    var results = searchReels();
    var shown = results.slice(0, MAX_RESULTS);
    var collOpts = ['<option value="">All collections</option>'].concat(
      collections().map(function (c) {
        return '<option value="' + esc(c) + '"' + (collectionFilter === c ? " selected" : "") + ">" + esc(c) + "</option>";
      })).join("");
    var domOpts = ['<option value="">All domains</option>'].concat(
      domains().map(function (d) {
        return '<option value="' + esc(d.id) + '"' + (domainFilter === d.id ? " selected" : "") + ">" + esc(d.title) + "</option>";
      })).join("");
    var html =
      '<div class="searchbox"><label for="q" class="sub">Search the library</label>' +
      '<input type="search" id="q" placeholder="Try: windmill, Claude Code, mobility…" value="' + esc(query) + '" autocomplete="off"></div>' +
      '<div class="filters"><select id="f-coll" aria-label="Filter by collection">' + collOpts + "</select>" +
      '<select id="f-dom" aria-label="Filter by domain">' + domOpts + "</select></div>" +
      '<p class="countline"><strong>' + results.length.toLocaleString() + "</strong> reel" + (results.length === 1 ? "" : "s") +
      (results.length > MAX_RESULTS ? " — showing first " + MAX_RESULTS : "") +
      " · " + reels.length.toLocaleString() + " indexed in total</p>";
    if (!shown.length) {
      html += '<p class="empty">Nothing matches. Try fewer words, or clear a filter.<br>' +
        "Search covers creator, collection, notes and inventory clusters — not transcripts (none exist yet).</p>";
    } else {
      html += shown.map(reelCard).join("");
      if (results.length > MAX_RESULTS)
        html += '<p class="empty">Refine your search to see more — results are capped at ' + MAX_RESULTS + " per page.</p>";
    }
    return html;
  }

  function curriculaView() {
    var html = "<h2>Curricula</h2>" +
      '<p class="sub">One curriculum per domain. Modules are the inventory clusters, in order. ' +
      "Progress is stored on this device only.</p>" +
      '<div class="notice">🎓 <strong>Quizzes aren’t built yet.</strong> Each module shows where a mastery check (default 80% pass) will gate the next one. For now, mark a module done when you’ve worked through its reels.</div>';
    html += domains().map(function (d) {
      var total = d.modules.length;
      var done = d.modules.filter(function (m) { return isDone(d.id, m.id); }).length;
      var items = d.modules.reduce(function (a, m) { return a + m.items.length; }, 0);
      var pct = total ? Math.round(done / total * 100) : 0;
      return '<a class="card domcard" href="#/curriculum/' + esc(d.id) + '">' +
        "<h3>" + esc(d.title) + "</h3><p>" + esc(d.description) + "</p>" +
        '<div class="progress" role="img" aria-label="' + done + " of " + total + ' modules done"><span style="width:' + pct + '%"></span></div>' +
        '<span class="proglabel">' + done + " / " + total + " modules · " + items + " items</span></a>";
    }).join("");
    return html;
  }

  function curriculumView(d) {
    var html = '<a class="back" href="#/curricula">← All curricula</a>' +
      "<h2>" + esc(d.title) + "</h2>" + '<p class="sub">' + esc(d.description) + "</p>";
    if (d.check_based)
      html += '<div class="notice">✅ This curriculum is a checklist, not videos: each item is one audit check from the live skill. Mark a module done when you’ve run its checks.</div>';
    html += d.modules.map(function (m) {
      var done = isDone(d.id, m.id);
      var items = m.items.map(function (it) {
        var inner = '<div class="item"><span class="who">#' + it.n + " — @" + esc(it.creator || "—") + "</span>";
        if (it.title) inner += '<div class="what">' + esc(it.title) + "</div>";
        if (it.url) inner += '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">▶ Watch on Instagram</a>';
        else if (it.type === "check") inner += '<div class="what">Check from the live skill — no reel attached.</div>';
        if (it.gated) inner += ' <span class="chip gated">🔒 gated' + (it.gate ? " — comment “" + esc(it.gate) + "”" : "") + "</span>";
        return inner + "</div>";
      }).join("");
      return '<section class="card module" id="mod-' + esc(m.id) + '">' +
        '<div class="module-head"><h3>' + esc(m.id) + " — " + esc(m.title) + "</h3>" +
        '<button class="done-btn" data-domain="' + esc(d.id) + '" data-module="' + esc(m.id) + '" aria-pressed="' + done + '">' +
        (done ? "✓ Done" : "Mark done") + "</button></div>" +
        '<p class="proglabel">' + m.items.length + ' item' + (m.items.length === 1 ? "" : "s") +
        ' · <span class="chip quiz">Quiz check coming</span></p>' + items + "</section>";
    }).join("");
    return html;
  }

  function aboutView() {
    var totalItems = domains().reduce(function (a, d) {
      return a + d.modules.reduce(function (b, m) { return b + m.items.length; }, 0);
    }, 0);
    return "<h2>About this MVP</h2>" +
      "<p><strong>Pirate School</strong> turns saved Instagram reels into a searchable library with a mastery-gated curriculum on top — the method from @angus.sewell’s “pirate a $40k private school” reel, and the searchable-app idea from @ariacodez’s “Recall” reel.</p>" +
      "<h2>What’s in here</h2>" +
      "<p><strong>" + reels.length.toLocaleString() + "</strong> saved reels indexed, across " +
      collections().length + " collections. <strong>" + totalItems + "</strong> curriculum items across " +
      domains().length + " domains.</p>" +
      "<h2>What search covers — and what it doesn’t</h2>" +
      "<p>Search matches <strong>creator, collection, the filing note, and inventory cluster</strong>. It does <strong>not</strong> search transcripts, because no transcripts exist at scale yet — that’s the next layer (transcription + Neon database). A reel with no usable transcript is never filled in with invented content.</p>" +
      "<h2>What the LMS shell does — and doesn’t</h2>" +
      "<p>Each domain is a curriculum of ordered modules (the inventory clusters). You can mark modules done; progress is stored in this browser’s localStorage and survives reload on this device. <strong>Mastery quizzes are not built yet</strong> — modules are marked “quiz check coming” where an 80%-pass gate will eventually lock the next module.</p>" +
      "<h2>Next layers</h2>" +
      "<p>1) Transcription of the reels, so search covers what was actually said. 2) Neon Postgres as the live store, synced daily from new saves. 3) Real mastery quizzes generated from module sources only, with the 80% gate enforced. 4) Gap analysis and public supplements per module.</p>" +
      "<h2>Honesty notes</h2>" +
      "<p>Some inventory entries reference reels with no filing record in the batch files (mostly recent daily-watch items) — they still appear in curricula with their inventory title and Instagram link, just without a collection or note. Gated reels are flagged, never reconstructed. Videos are never hosted here.</p>";
  }

  /* ---------------- router ---------------- */
  function render() {
    var hash = location.hash || "#/library";
    var parts = hash.replace(/^#\//, "").split("/");
    var view = parts[0] || "library";
    ["library", "curricula", "about"].forEach(function (t) {
      var el = document.getElementById("tab-" + t);
      if (el) el.setAttribute("aria-current", t === view ? "page" : "false");
    });
    var html;
    if (loadError) {
      html = '<p class="empty">The library data failed to load. Check your connection and reload.</p>';
    } else if (!reels) {
      html = '<p class="loading">Loading the library…</p>';
    } else if (view === "curricula") {
      html = curriculaView();
    } else if (view === "curriculum" && parts[1]) {
      var d = domainById(parts[1]);
      html = d ? curriculumView(d) : '<p class="empty">Unknown curriculum. <a href="#/curricula">Back to curricula</a></p>';
    } else if (view === "about") {
      html = aboutView();
    } else {
      html = libraryView();
    }
    app.innerHTML = html;
    bind();
  }

  function bind() {
    var q = document.getElementById("q");
    if (q) {
      q.addEventListener("input", function () {
        query = q.value;
        clearTimeout(q._t);
        q._t = setTimeout(function () {
          var pos = q.selectionStart;
          render();
          var q2 = document.getElementById("q");
          if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); }
        }, 150);
      });
    }
    var fc = document.getElementById("f-coll");
    if (fc) fc.addEventListener("change", function () { collectionFilter = fc.value; render(); });
    var fd = document.getElementById("f-dom");
    if (fd) fd.addEventListener("change", function () { domainFilter = fd.value; render(); });
    Array.prototype.forEach.call(document.querySelectorAll(".done-btn"), function (b) {
      b.addEventListener("click", function () {
        toggleDone(b.getAttribute("data-domain"), b.getAttribute("data-module"));
      });
    });
  }

  window.addEventListener("hashchange", render);
  loadData().then(render);
})();
