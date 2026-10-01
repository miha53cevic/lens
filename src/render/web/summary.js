// lens viewer: the Summary view. Inlined after viewer.js (see there).

// One changed unit (function, component, hook, …) at a time: the agent's
// headline, a When / Before / Now table, callers it may break, and the code.
const viewSwitch = document.getElementById("view-switch");
const viewCodeBtn = document.getElementById("view-code");
const viewSummaryBtn = document.getElementById("view-summary");
const summaryDot = document.getElementById("summary-dot");
const summaryListEl = document.getElementById("summary-list");
const summaryPaneEl = document.getElementById("summary-pane");
const toolbarEl = /** @type {HTMLElement} */ (document.querySelector(".bar.toolbar"));
const tabbarWrap = tabbarEl;
let summaryOrder = []; // unit ids in list order (j/k walk this)

function syncViewSwitch() {
  viewSwitch.style.display = DATA.summary ? "" : "none";
  // the summary went away (e.g. a refresh in path mode): leave the Summary view properly
  if (!DATA.summary && state.view === "summary") setView("code");
}

// The tree and the summary list share the sidebar's scroller: each view keeps its own position.
const navScroll = { code: 0, summary: 0 };

function setView(view) {
  if (view === "summary" && !DATA.summary) return;
  if (state.view === "code") rememberScroll();
  navScroll[state.view] = nav.scrollTop;
  state.view = view;
  viewCodeBtn.setAttribute("aria-pressed", String(view === "code"));
  viewSummaryBtn.setAttribute("aria-pressed", String(view === "summary"));
  const summary = view === "summary";
  toolbarEl.style.display = summary ? "none" : "";
  tabbarWrap.style.display = summary ? "none" : "";
  mainEl.style.display = summary ? "none" : "";
  summaryPaneEl.style.display = summary ? "" : "none";
  filterInput.parentElement.style.display = summary ? "none" : "";
  sumFilterEl.style.display = summary ? "" : "none";
  treeEl.style.display = summary ? "none" : "";
  summaryListEl.style.display = summary ? "" : "none";
  statsEl.style.visibility = summary ? "hidden" : "";
  nav.scrollTop = navScroll[view];
  if (summary && summaryDot.style.display !== "none") { loadSummary(); return; }
  render();
}
viewCodeBtn.onclick = () => setView("code");
viewSummaryBtn.onclick = () => setView("summary");

async function loadSummary() {
  try {
    const res = await fetch("/api/summary");
    if (!res.ok) throw new Error("http " + res.status);
    const summary = await res.json();
    if (summary) DATA.summary = summary;
  } catch (err) {
    console.error("loading the summary failed:", err);
  }
  summaryDot.style.display = "none";
  render();
}

// A submit from the agent lands in summary.json; notice it when the reader comes back.
window.addEventListener("focus", async () => {
  if (!DATA.summary) return;
  try {
    const res = await fetch("/api/summary/stamp");
    const { stamp } = await res.json();
    if (stamp !== null && stamp !== DATA.summary.stamp) {
      if (state.view === "summary") loadSummary();
      else summaryDot.style.display = "";
    }
  } catch { /* server gone — nothing to do */ }
});

function unitById(id) { return (DATA.summary?.units || []).find((u) => u.id === id) || null; }
// null on the overview: unit keys (o, m) do nothing there
function currentUnit() { return state.summaryOverview ? null : unitById(state.summaryActive); }

function unitViewKey(u) { return u.id + "@" + u.hash; }
function isUnitViewed(u) { return !!u && viewed.units.has(unitViewKey(u)); }

// Rebuilds the list but patches the pane: re-rendering it would lose its scroll position.
function toggleUnitViewed(u) {
  if (!u) return;
  toggleViewed("units", unitViewKey(u));
  renderSummaryList();
  const box = /** @type {HTMLInputElement | null} */ (summaryPaneEl.querySelector("#sum-viewed"));
  if (box) box.checked = isUnitViewed(currentUnit());
  /** @type {NodeListOf<HTMLElement>} */ (summaryPaneEl.querySelectorAll(".ov-chip")).forEach((c) => {
    c.classList.toggle("viewed", isUnitViewed(unitById(c.dataset.id)));
  });
}

function unitLabel(u) {
  if (u.name === "(module)") return "imports & module-level";
  if (u.name === "(file)") return u.displayFile.split("/").pop();
  return u.name;
}

// ---- list filter: text over name / file / gist ----
const sumFilterEl = document.getElementById("sum-filter");
const sumFilterInput = /** @type {HTMLInputElement} */ (sumFilterEl.querySelector("input"));
const sumFilterClear = /** @type {HTMLElement} */ (sumFilterEl.querySelector("button"));
let sumFilterText = ""; // transient, like the file filter

function matchesSumFilter(u) {
  if (sumFilterText === "") return true;
  const haystack = unitLabel(u) + "\n" + u.displayFile + "\n" + (u.summary ? u.summary.gist : "");
  return haystack.toLowerCase().includes(sumFilterText);
}

function applySumFilter() {
  sumFilterText = sumFilterInput.value.trim().toLowerCase();
  sumFilterClear.style.display = sumFilterText === "" ? "none" : "";
  renderSummaryList();
}
sumFilterInput.oninput = applySumFilter;
sumFilterInput.onkeydown = (ev) => {
  if (ev.key === "Escape") { sumFilterInput.value = ""; applySumFilter(); sumFilterInput.blur(); }
};
sumFilterClear.onclick = () => { sumFilterInput.value = ""; applySumFilter(); };

function renderSummary() {
  const summary = DATA.summary;
  syncNavVisibilitySummary();
  if (!summary) return;
  const summarized = renderSummaryList();
  if (summarized === 0 && !summaryPaneEl.dataset.browsing) {
    renderSummaryEmpty(summary);
  } else if (state.summaryOverview) {
    renderSummaryOverview(summary);
  } else {
    renderSummaryUnit(currentUnit());
  }
  summaryListEl.querySelector(".sum-item.active")?.scrollIntoView({ block: "nearest" });
}

// List order: flows, then needs-a-look, routine, not yet summarized / stale.
// A unit in several flows is listed once, under the first.
function groupUnits(summary, shown) {
  const listed = new Set();
  const sections = summary.flows
    .map((flow) => ({
      flow,
      members: Object.keys(flow.units).map(unitById).filter((u) => u && !listed.has(u.id) && listed.add(u.id)).filter(shown),
    }))
    .filter((section) => section.members.length > 0);
  const rank = (u) => !u.summary ? 3 : u.summary.needsLook ? 0 : 1;
  const others = summary.units.filter((u) => !listed.has(u.id)).filter(shown).sort((a, b) => rank(a) - rank(b));
  return { sections, others };
}

// The list alone — filtering must not rebuild the pane (and lose its scroll).
// Returns how many units have a summary.
function renderSummaryList() {
  const summary = DATA.summary;
  const units = summary.units;
  const { sections, others } = groupUnits(summary, matchesSumFilter);
  summaryOrder = [...sections.flatMap((section) => section.members), ...others].map((u) => u.id);
  // before building the list, so the default unit is highlighted too. A unit
  // the filter hides stays open in the pane.
  if (!state.summaryActive || !unitById(state.summaryActive)) state.summaryActive = summaryOrder[0] || null;
  const itemHtml = (u, side) => {
    const s = u.summary;
    const isViewed = isUnitViewed(u);
    const cls = "sum-item" + (!state.summaryOverview && u.id === state.summaryActive ? " active" : "") +
      (!s ? " pending" : s.needsLook ? "" : " routine") + (isViewed ? " viewed" : "") + " st-" + u.status;
    const gist = u.stale ? '<span class="gist stale">code changed — re-run</span>'
      : '<span class="gist">' + escapeHtml(s ? s.gist : u.kind + " · " + u.status) + "</span>";
    return '<button class="' + cls + '" data-id="' + escapeHtml(u.id) + '" title="' + escapeHtml(u.id + " — " + u.status) + '">' +
      viewedBoxHtml(isViewed, "mark viewed") +
      (s && s.needsLook ? '<span class="attn-dot" title="needs a look"></span>' : "<span></span>") +
      '<span class="name">' + escapeHtml(unitLabel(u)) + '</span><span class="side">' + escapeHtml(side || "") + "</span>" +
      gist + "</button>";
  };
  const summarized = units.filter((u) => u.summary).length;
  const attention = units.filter((u) => u.summary && u.summary.needsLook).length;
  const title = sumFilterText !== ""
    ? summaryOrder.length + " of " + units.length + " changes"
    : units.length + (units.length === 1 ? " change" : " changes");
  let html = '<div class="sum-head"><span class="title">' + title + "</span>" +
    (summarized === 0 ? '<span class="legend">not summarized yet</span>'
      : '<span class="legend"><span class="attn-dot"></span>' + attention + " need a look</span>") + "</div>" +
    '<button class="sum-overview-item' + (state.summaryOverview ? " active" : "") + '" title="the whole diff at a glance (g)">' +
    '<span class="ico"></span>Overview<span class="key">g</span></button>';
  for (const { flow, members } of sections) {
    html += '<div class="sum-section"><div class="sum-section-title"><span class="t">' + escapeHtml(flow.title) +
      '</span><span class="sub">' + escapeHtml(flow.path) + "</span></div>" +
      members.map((u) => itemHtml(u, flow.units[u.id])).join("") + "</div>";
  }
  if (others.length > 0) {
    html += '<div class="sum-section">' + (sections.length > 0 ? '<div class="sum-section-title"><span class="t">Other changes</span></div>' : "") +
      others.map((u) => itemHtml(u, u.displayFile.split("/").pop())).join("") + "</div>";
  }
  if (summaryOrder.length === 0) html += '<div class="no-match">no changes match the filter</div>';
  const scrolled = nav.scrollTop; // rebuilding the list must not move it
  summaryListEl.innerHTML = html;
  nav.scrollTop = scrolled;
  /** @type {NodeListOf<HTMLElement>} */ (summaryListEl.querySelectorAll(".sum-item")).forEach((b) => {
    b.onclick = () => openSummaryUnit(b.dataset.id);
    /** @type {HTMLElement} */ (b.querySelector(".viewed-box")).onclick = (ev) => {
      ev.stopPropagation();
      toggleUnitViewed(unitById(b.dataset.id));
    };
  });
  /** @type {HTMLElement} */ (summaryListEl.querySelector(".sum-overview-item")).onclick = showOverview;
  return summarized;
}

function openSummaryUnit(id) {
  state.summaryOverview = false;
  state.summaryActive = id;
  summaryPaneEl.dataset.browsing = "1";
  renderSummary();
}

function showOverview() {
  state.summaryOverview = true;
  summaryPaneEl.dataset.browsing = "1";
  renderSummary();
}

function syncNavVisibilitySummary() {
  const show = !state.navCollapsed;
  nav.style.display = show ? "" : "none";
  resizerEl.style.display = show ? "" : "none";
  navToggle.style.display = "";
}

function renderSummaryEmpty(summary) {
  summaryPaneEl.innerHTML =
    '<div class="sum-empty"><h2>No summary yet</h2>' +
    "<p>Your coding agent writes the summary. Run this in it:</p>" +
    '<div class="cmd"><span>' + escapeHtml(summary.command) + '</span><button id="copy-cmd">copy</button></div>' +
    "<p>Without the skill, any agent with a shell can follow <code>" + escapeHtml(summary.cli) + "</code>. " +
    "When it's done, come back here: the Summary tab gets a dot, or press ↻ refresh.</p>" +
    '<p><button id="browse-units">browse the ' + summary.units.length + " changes without a summary</button></p></div>";
  document.getElementById("copy-cmd").onclick = async (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target);
    try { await navigator.clipboard.writeText(summary.command); btn.textContent = "copied"; }
    catch { btn.textContent = "select + copy"; }
  };
  // the overview's map and by-file lanes need no summary, so browsing starts there
  document.getElementById("browse-units").onclick = showOverview;
}

// ⓘ with a hover tip, the same widget as the fold-level help in the toolbar
function infoHtml(title, text) {
  return '<span class="info" aria-label="' + title + '">&#9432;<span class="tip"><div class="tip-title">' + title + "</div>" + text + "</span></span>";
}
const STAT_INFO = {
  // worded as bundle.ts asks the agent for needsLook
  look: infoHtml("needs a look", "The agent flags a change (red dot) when a reviewer should look closely: it changes behavior, " +
    "may be a bug, may break callers, or is otherwise risky. Routine changes (renames, types, formatting, tests) aren't flagged." +
    '<div class="tip-note">The agent\'s judgement — lens doesn\'t verify it.</div>'),
  callers: infoHtml("callers outside the diff", "Call sites the diff didn't touch that the agent found may break. " +
    "Each one is checked: the line exists and mentions the changed unit."),
  stale: infoHtml("stale", "Changes whose code moved on since they were summarized. Run the summary again to update them."),
};

// The whole diff at a glance: counts, the agent's overview, each flow by layer.
function renderSummaryOverview(summary) {
  const units = summary.units;
  const files = new Set(units.map((u) => u.displayFile)).size;
  const look = units.filter((u) => u.summary && u.summary.needsLook).length;
  const callers = new Set(units.flatMap((u) => u.summary
    ? u.summary.breaks.flatMap((b) => b.callers.map((c) => c.file + ":" + c.line)) : [])).size;
  const stale = units.filter((u) => u.stale).length;
  const { sections, others } = groupUnits(summary, () => true);
  const stat = (value, label, tone) =>
    '<div class="ov-stat' + (value > 0 && tone ? " " + tone : "") + '"><div class="v">' + value + '</div><div class="l">' + label + "</div></div>";

  let html = '<div class="ov-stats">' +
    stat(units.length, (units.length === 1 ? "change" : "changes") + " in " + plural(files, "file"), "") +
    stat(sections.length, sections.length === 1 ? "flow" : "flows", "") +
    stat(look, "need a look " + STAT_INFO.look, "red") +
    stat(callers, "callers outside the diff " + STAT_INFO.callers, "amber") +
    stat(stale, "stale " + STAT_INFO.stale, "amber") +
    "</div>";

  const o = summary.overview;
  if (o) {
    html += '<div class="ov-what"><div class="ov-what-label">Agent summary</div>' +
      o.what.split("\n\n").map((p) => "<p>" + escapeHtml(p) + "</p>").join("") + "</div>";
    if (o.stale) {
      html += '<div class="sum-note stale">The diff changed since this overview was written. Run <code>' +
        escapeHtml(summary.command) + "</code> again to update it.</div>";
    }
  } else if (units.some((u) => u.summary)) {
    html += '<div class="sum-note">No overview yet — run <code>' + escapeHtml(summary.command) + "</code> again to add one.</div>";
  } else {
    html += '<div class="sum-note">Not summarized yet — run <code>' + escapeHtml(summary.command) + "</code> in your agent.</div>";
  }

  // the lower half flips between the flows and the map
  const lower = state.overviewTab === "map" ? mapHtml(summary) : flowsHtml(sections, others);
  const tab = (id, label) => '<button class="ov-tab" role="tab" data-tab="' + id + '" aria-selected="' + (state.overviewTab === id) + '">' + label + "</button>";
  html += '<div><div class="ov-tabs" role="tablist">' + tab("flows", "Flows") + tab("map", "Map") +
    '<span class="ov-tabs-note">' + lower.note + '</span></div><div class="ov-lanes">' + lower.lanes + "</div></div>";

  summaryPaneEl.innerHTML = '<div class="sum-inner">' + html + "</div>";
  /** @type {NodeListOf<HTMLElement>} */ (summaryPaneEl.querySelectorAll(".ov-chip")).forEach((b) => {
    b.onclick = () => openSummaryUnit(b.dataset.id);
  });
  /** @type {NodeListOf<HTMLElement>} */ (summaryPaneEl.querySelectorAll(".ov-tab")).forEach((b) => {
    b.onclick = () => {
      const top = summaryPaneEl.scrollTop; // flipping tabs keeps the page where it is
      state.overviewTab = b.dataset.tab;
      writePref("lens.overviewTab", state.overviewTab);
      renderSummaryOverview(summary);
      summaryPaneEl.scrollTop = top;
    };
  });
  summaryPaneEl.scrollTop = 0;
}

// Each flow laid out by layer, then the units outside any flow by file.
function flowsHtml(sections, others) {
  let lanes = "";
  for (const { flow, members } of sections) {
    // the path's steps in order, then any layer the path doesn't name
    const layers = flow.path.split("→").map((l) => l.trim()).filter(Boolean);
    for (const u of members) if (!layers.includes(flow.units[u.id])) layers.push(flow.units[u.id]);
    lanes += '<div class="ov-lane">' + ovLaneHeadHtml(flow.title, plural(members.length, "change")) + '<div class="ov-layers">' +
      layers.map((l) => ovColumnHtml(l, members.filter((u) => flow.units[u.id] === l), "")).join("") + "</div></div>";
  }
  if (others.length > 0) {
    lanes += '<div class="ov-lane">' + ovLaneHeadHtml(sections.length > 0 ? "Other changes" : "Changes", plural(others.length, "change"), sections.length > 0) +
      '<div class="ov-layers files">' +
      [...byFile(others)].map(([file, units]) => ovColumnHtml(file.split("/").pop(), units, file)).join("") + "</div></div>";
  }
  return { note: plural(sections.length, "flow"), lanes };
}

// Every change where it lives: a card per folder, a column per file, its units in file order.
function mapHtml(summary) {
  const startOf = (u) => u.ranges.length > 0 ? u.ranges[0].start : (u.removals[0]?.anchor ?? 0);
  const files = byFile([...summary.units].sort((a, b) => a.displayFile.localeCompare(b.displayFile) || startOf(a) - startOf(b)));
  const dirs = new Map(); // folder -> its [file, units] entries, in path order
  for (const entry of files) {
    const dir = entry[0].slice(0, entry[0].lastIndexOf("/") + 1);
    dirs.set(dir, [...(dirs.get(dir) || []), entry]);
  }
  const lanes = [...dirs].map(([dir, entries]) => {
    const count = entries.reduce((n, [, units]) => n + units.length, 0);
    return '<div class="ov-lane">' + ovLaneHeadHtml(dir || "./", plural(count, "change") + " · " + plural(entries.length, "file"), false, true) +
      '<div class="ov-layers files">' + entries.map(([file, units]) => ovColumnHtml(file.slice(dir.length), units, file)).join("") + "</div></div>";
  }).join("");
  return { note: plural(files.size, "file") + " across " + plural(dirs.size, "folder"), lanes };
}

/** @returns {Map<string, any[]>} file -> its units, in the order given */
function byFile(units) {
  const files = new Map();
  for (const u of units) files.set(u.displayFile, [...(files.get(u.displayFile) || []), u]);
  return files;
}

function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

// A unit as a tag (overview and map): status stripe, needs-a-look tint, dimmed once viewed.
function ovChipHtml(u) {
  const look = !!(u.summary && u.summary.needsLook);
  return '<button class="ov-chip st-' + u.status + (look ? " look" : "") + (isUnitViewed(u) ? " viewed" : "") + '" data-id="' + escapeHtml(u.id) +
    '" title="' + escapeHtml(u.summary ? u.summary.headline : u.id) + '">' +
    '<span class="st-bar"></span><span class="cn">' + escapeHtml(unitLabel(u)) + "</span>" +
    (look ? '<span class="attn-dot"></span>' : "") + "</button>";
}

function ovColumnHtml(label, units, title) {
  return '<div class="ov-layer"><div class="ov-layer-l"' + (title ? ' title="' + escapeHtml(title) + '"' : "") + ">" +
    escapeHtml(label) + "</div>" + units.map(ovChipHtml).join("") + "</div>";
}

function ovLaneHeadHtml(title, count, muted, mono) {
  return '<div class="ov-lane-h"><span class="t' + (muted ? " muted" : "") + (mono ? " mono" : "") + '">' + escapeHtml(title) +
    '</span><span class="n">' + count + "</span></div>";
}

function renderSummaryUnit(u) {
  summaryPaneEl.innerHTML = "";
  if (!u) { summaryPaneEl.innerHTML = '<div class="sum-empty">nothing changed</div>'; return; }
  const s = u.summary;
  const inner = document.createElement("div");
  inner.className = "sum-inner";
  let html = s
    ? '<h1 class="sum-headline">' + escapeHtml(s.headline) + "</h1>"
    : '<h1 class="sum-headline pending">' + escapeHtml(unitLabel(u)) + "</h1>";
  if (u.stale) {
    html += '<div class="sum-note stale">The code changed since this was summarized. Run <code>' +
      escapeHtml(DATA.summary.command) + "</code> again to update it.</div>";
  } else if (!s) {
    html += '<div class="sum-note">Not summarized yet — run <code>' + escapeHtml(DATA.summary.command) + "</code> in your agent.</div>";
  }
  if (s && s.changes.length > 0) {
    html += '<div class="changes"><div class="th">When</div><div class="th">Before</div><div class="th">Now</div><div class="th"></div>' +
      s.changes.map((c) =>
        '<div class="td when">' + escapeHtml(c.when) + "</div>" +
        '<div class="td before">' + (c.before ? escapeHtml(c.before) : '<span class="none">—</span>') + "</div>" +
        '<div class="td now">' + escapeHtml(c.now) + "</div>" +
        '<div class="td"><button class="cite" data-line="' + escapeHtml(c.line) + '" title="show this line in the code below">' +
        escapeHtml(c.line.startsWith("O") ? "−" + c.line.slice(1) : "L" + c.line.slice(1)) + "</button></div>",
      ).join("") + "</div>";
  }
  if (s && s.breaks.length > 0) {
    html += '<div class="breaks">' + s.breaks.map((b, bi) =>
      '<button class="brk-head" data-brk="' + bi + '"><span class="pk">▸</span>⚠ ' + escapeHtml(b.summary) + "</button>" +
      '<div class="brk-callers" data-brk="' + bi + '" style="display:none">' +
      b.callers.map((c, ci) =>
        '<button class="caller" data-peek="' + bi + "-" + ci + '">▸ ' + escapeHtml(c.file + ":" + c.line) + "</button>" +
        '<div class="peek" data-peek="' + bi + "-" + ci + '" style="display:none">' +
        c.lines.map((l) =>
          '<div class="row' + (l.n === c.line ? " call" : "") + '"><span class="num">' + l.n + '</span><span class="mark"></span><span>' +
          (escapeHtml(l.text) || " ") + "</span></div>").join("") +
        "</div>").join("") +
      "</div>").join("") + "</div>";
  }
  const fileIndex = DATA.files.findIndex((f) => f.file === u.displayFile);
  html += '<div class="unit-head"><span class="path" title="' + escapeHtml(u.id) + '">' + escapeHtml(u.displayFile) + "</span>" +
    '<span class="status ' + u.status + '">' + u.status + (u.formattingOnly ? " · formatting only" : "") + "</span>" +
    '<label class="control" title="mark this change as viewed (m)"><input type="checkbox" id="sum-viewed"' +
    (isUnitViewed(u) ? " checked" : "") + "> viewed</label>" +
    '<label class="control"><input type="checkbox" id="sum-removed"' + (state.showRemoved ? " checked" : "") + "> removed lines</label>" +
    (fileIndex >= 0 && u.ranges.length > 0 ? '<button id="open-in-code" title="open in the code view (o)">code view ↗</button>' : "") +
    "</div>";
  inner.innerHTML = html;
  inner.appendChild(unitCodeEl(u, fileIndex, s));
  summaryPaneEl.appendChild(inner);

  /** @param {string} selector */
  const all = (selector) => /** @type {NodeListOf<HTMLElement>} */ (inner.querySelectorAll(selector));
  /** @param {string} selector */
  const one = (selector) => /** @type {HTMLElement} */ (inner.querySelector(selector));
  all(".cite").forEach((b) => b.onclick = () => flashCited(inner, b.dataset.line));
  all(".brk-head").forEach((b) => b.onclick = () => {
    const box = one('.brk-callers[data-brk="' + b.dataset.brk + '"]');
    const open = box.style.display === "none";
    box.style.display = open ? "" : "none";
    b.querySelector(".pk").textContent = open ? "▾" : "▸";
  });
  all(".caller").forEach((b) => b.onclick = () => {
    const box = one('.peek[data-peek="' + b.dataset.peek + '"]');
    const open = box.style.display === "none";
    box.style.display = open ? "" : "none";
    b.textContent = (open ? "▾ " : "▸ ") + b.textContent.slice(2);
  });
  const removedBox = /** @type {HTMLInputElement} */ (one("#sum-removed"));
  removedBox.onchange = () => {
    showRemovedBox.checked = state.showRemoved = removedBox.checked; // keep the Code view's toggle in sync
    render();
  };
  /** @type {HTMLInputElement} */ (one("#sum-viewed")).onchange = () => toggleUnitViewed(u);
  const openBtn = one("#open-in-code");
  if (openBtn) openBtn.onclick = () => openUnitInCode(u);
  summaryPaneEl.scrollTop = 0;
}

function unitCodeEl(u, fileIndex, s) {
  const wrap = document.createElement("div");
  wrap.className = "unit-code";
  const code = document.createElement("div");
  code.className = "code";
  wrap.appendChild(code);
  const file = fileIndex >= 0 ? DATA.files[fileIndex] : null;
  const cited = new Set((s ? s.changes : []).map((c) => c.line));
  const gutter = String(Math.max(file ? file.lineCount : 0, ...u.removals.map((b) => b.oldStart + b.lines.length))).length;
  // each removed block carries its display anchor (computed by the server)
  const emitRemoved = (after, container) => {
    if (!state.showRemoved) return;
    for (const b of u.removals.filter((r) => r.anchor === after)) {
      b.lines.forEach((text, i) => {
        const row = removedRowEl(text, gutter);
        row.dataset.old = b.oldStart + i;
        if (cited.has("O" + (b.oldStart + i))) row.classList.add("cited");
        container.appendChild(row);
      });
    }
  };
  if (!file || u.ranges.length === 0) {
    const was = state.showRemoved;
    state.showRemoved = true; // a deleted unit is nothing but removed lines
    emitRemoved(0, code);
    state.showRemoved = was;
  } else {
    const lines = linesFromTokens(file);
    const changed = new Set(u.changedLines);
    const regionAt = new Map();
    for (const r of file.regions) regionAt.set(r.startLine, r);
    u.ranges.forEach((range, ri) => {
      if (ri > 0) {
        const gap = document.createElement("div");
        gap.className = "row unit-gap";
        gap.innerHTML = '<span class="num">' + "⋯".padStart(gutter) + '</span><span class="mark"></span><span></span>';
        code.appendChild(gap);
      }
      emitRemoved(range.start - 1, code);
      let l = range.start;
      while (l <= range.end) {
        const region = regionAt.get(l);
        if (region && region.endLine <= range.end) {
          code.appendChild(regionEl(region, lines, changed, gutter, (after, container) => emitRemoved(after, container)));
          emitRemoved(region.endLine, code);
          l = region.endLine + 1;
          continue;
        }
        const row = rowEl(l, lines[l - 1] ?? "", changed.has(l), gutter);
        if (cited.has("N" + l)) row.classList.add("cited");
        code.appendChild(row);
        emitRemoved(l, code);
        l++;
      }
    });
  }
  // rows built inside folds (regionEl) get their cited mark here
  for (const label of cited) {
    if (label.startsWith("N")) code.querySelector('.row[data-line="' + label.slice(1) + '"]')?.classList.add("cited");
  }
  if (u.renamedFrom) {
    const note = document.createElement("div");
    note.className = "renamed-from";
    note.textContent = "was " + u.renamedFrom.id;
    code.appendChild(note);
    for (const b of u.renamedFrom.removals) for (const text of b.lines) code.appendChild(removedRowEl(text, gutter));
  }
  return wrap;
}

function flashCited(container, label) {
  const selector = label.startsWith("O") ? '.row[data-old="' + label.slice(1) + '"]' : '.row[data-line="' + label.slice(1) + '"]';
  const row = container.querySelector(".unit-code " + selector);
  if (!row) return;
  const region = row.closest(".region");
  if (region) region.classList.add("open");
  row.scrollIntoView({ block: "center", behavior: "smooth" });
  row.classList.remove("flash");
  void row.offsetWidth;
  row.classList.add("flash");
}

function stepSummary(direction) {
  if (summaryOrder.length === 0) return;
  // from the overview, j starts at the top of the list and k at the bottom
  const pos = state.summaryOverview ? -1 : summaryOrder.indexOf(state.summaryActive);
  state.summaryOverview = false;
  state.summaryActive = pos === -1
    ? summaryOrder[direction > 0 ? 0 : summaryOrder.length - 1]
    : summaryOrder[(pos + direction + summaryOrder.length) % summaryOrder.length];
  summaryPaneEl.dataset.browsing = "1";
  renderSummary();
}

function openUnitInCode(u) {
  if (!u) return;
  const fileIndex = DATA.files.findIndex((f) => f.file === u.displayFile);
  if (fileIndex < 0 || u.ranges.length === 0) return;
  jumpToLine(fileIndex, u.changedLines[0] ?? u.ranges[0].start);
}

// Start-up: last, after both files' top-level declarations have run.
openFirstTreeFile();
syncViewSwitch();
render();
if (location.hash === "#summary" && DATA.summary) setView("summary");
