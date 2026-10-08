// lens viewer: the Summary view. Inlined after viewer.js (see there).

// One changed unit (function, component, hook, …) at a time: the agent's
// headline, a When / Before / Now table, callers it may break, and the code.
const viewSwitch = document.getElementById("view-switch");
const viewCodeBtn = document.getElementById("view-code");
const viewSummaryBtn = document.getElementById("view-summary");
const summaryDot = document.getElementById("summary-dot");
const summaryListEl = document.getElementById("summary-list");
const summaryPaneEl = document.getElementById("summary-pane");
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
  // the toolbar stays: its folds, hunks, removed lines and hide-tests act on the open unit.
  // Only the file's viewed box goes — a unit has its own. The code view's render restores it.
  if (summary) viewedWrap.style.display = viewedDivider.style.display = "none";
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

// ---- concern marks ----
// The agent's concerns are suspicions; the reader decides: "real" or "dismissed",
// per browser. Keyed by the unit's hash and the concern itself, so a re-summarized
// unit starts fresh and a reordered list keeps its marks.
const CONCERN_PREF = "lens.concernMarks";
const concernMarks = (() => {
  try { return new Map(Object.entries(JSON.parse(readPref(CONCERN_PREF) || "{}"))); } catch { return new Map(); }
})();
function concernKey(u, c) { return u.id + "@" + u.hash + "#" + c.kind + ":" + c.text; }
function concernMark(u, c) { return concernMarks.get(concernKey(u, c)) || null; }
function setConcernMark(u, c, mark) {
  const key = concernKey(u, c);
  if (concernMarks.get(key) === mark) concernMarks.delete(key);
  else { concernMarks.delete(key); concernMarks.set(key, mark); } // re-insert: the oldest marks drop first
  writePref(CONCERN_PREF, JSON.stringify(Object.fromEntries([...concernMarks].slice(-VIEWED_CAP))));
}
/** The unit's concerns the reader hasn't dismissed. */
function openConcerns(u) {
  if (!u.summary) return [];
  return u.summary.concerns.filter((c) => concernMark(u, c) !== "dismissed");
}

// ---- signals: why a unit is flagged ----
// Only for a reason on record: an open concern (by kind) or callers it may break.
// Older summaries can carry the agent's bare flag: "look", reason unknown.
const SIGNALS = {
  bug: { icon: "⚠", one: "possible bug", many: "possible bugs" },
  risk: { icon: "!", one: "possible risk", many: "risks" },
  question: { icon: "?", one: "question", many: "questions" },
  breaks: { icon: "↗", one: "may break callers", many: "may break callers" },
  look: { icon: "●", one: "flagged, no reason given", many: "no reason given" },
};

/** The unit's signal ids, most serious first. */
function unitSignals(u) {
  const s = u.summary;
  if (!s) return [];
  const kinds = new Set(openConcerns(u).map((c) => c.kind));
  const out = ["bug", "risk", "question"].filter((k) => kinds.has(k));
  if (s.breaks.length > 0) out.push("breaks");
  if (s.unexplainedLook) out.push("look");
  return out;
}
function isFlagged(u) { return unitSignals(u).length > 0; }

/** "possible bug", or "confirmed bug" once the reader marked it real */
function concernLabel(c, mark) { return mark === "real" ? "confirmed " + c.kind : SIGNALS[c.kind].one; }

function signalTip(u, id) {
  if (id === "breaks") return "may break callers: " + u.summary.breaks[0].summary;
  if (id === "look") return SIGNALS.look.one;
  return SIGNALS[id].one + ": " + openConcerns(u).find((c) => c.kind === id).text;
}

// The marker before a unit's name: its most serious signal, or nothing.
function attnHtml(u) {
  const top = unitSignals(u)[0];
  if (!top) return "<span></span>";
  return '<span class="sig sig-' + top + '" title="' + escapeHtml(signalTip(u, top)) + '">' + SIGNALS[top].icon + "</span>";
}

function flowPriority(flow) { return flow.priority || 2; }
function prioHtml(flow) {
  const p = flowPriority(flow);
  const tip = p === 1 ? "review first" : p === 3 ? "mechanical — folded by default" : "normal priority";
  return '<span class="prio p' + p + '" title="P' + p + ": " + tip + '">P' + p + "</span>";
}

// ---- list filter: text over name / file / gist ----
const sumFilterEl = document.getElementById("sum-filter");
const sumFilterInput = /** @type {HTMLInputElement} */ (sumFilterEl.querySelector("input"));
const sumFilterClear = /** @type {HTMLElement} */ (sumFilterEl.querySelector("button"));
let sumFilterText = ""; // transient, like the file filter
let sumSignal = null; // a signal id or "any": the list shows only units flagged that way

/** Hide tests applies to the summary as to the file tree. */
function isUnitShown(u) { return !(state.hideTests && isTestFile(u.displayFile)); }

function matchesSumFilter(u) {
  if (!isUnitShown(u)) return false;
  if (sumSignal === "any" ? !isFlagged(u) : sumSignal !== null && !unitSignals(u).includes(sumSignal)) return false;
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

// List order: flows by priority (then by how many of their units are flagged),
// then the units in no flow: flagged, routine, not yet summarized / stale.
// A unit in several flows is listed under each.
function groupUnits(summary, shown) {
  const rank = (u) => !u.summary ? 3 : isFlagged(u) ? 0 : 1;
  const looks = (members) => members.filter(isFlagged).length;
  const inFlow = new Set();
  const sections = summary.flows
    .map((flow, order) => {
      const all = Object.keys(flow.units).map(unitById).filter(Boolean);
      for (const u of all) inFlow.add(u.id);
      return { flow, order, members: all.filter(shown) };
    })
    .filter((section) => section.members.length > 0)
    .sort((a, b) => flowPriority(a.flow) - flowPriority(b.flow) || looks(b.members) - looks(a.members) || a.order - b.order);
  const others = summary.units.filter((u) => !inFlow.has(u.id)).filter(shown).sort((a, b) => rank(a) - rank(b));
  return { sections, others };
}

// P3 flows start folded; a click on the flow's title flips it. A filter, or the
// open unit sitting inside, unfolds it.
const flowOpen = new Map(); // flow title -> open, once the reader toggled it
function isFlowFolded(section) {
  if (sumFilterText !== "" || sumSignal !== null) return false;
  const explicit = flowOpen.get(section.flow.title);
  if (explicit !== undefined) return !explicit;
  return flowPriority(section.flow) === 3 &&
    !(!state.summaryOverview && section.members.some((u) => u.id === state.summaryActive));
}

// The list alone — filtering must not rebuild the pane (and lose its scroll).
// Returns how many units have a summary.
function renderSummaryList() {
  const summary = DATA.summary;
  const units = summary.units.filter(isUnitShown); // hide tests: the counts follow the list
  // how many units carry each signal; a filter whose last unit went away (dismissed) lifts
  const counts = { any: 0 };
  for (const id of Object.keys(SIGNALS)) counts[id] = 0;
  for (const u of units) {
    const signals = unitSignals(u);
    if (signals.length > 0) counts.any++;
    for (const id of signals) counts[id]++;
  }
  if (sumSignal !== null && counts[sumSignal] === 0) sumSignal = null;
  const { sections, others } = groupUnits(summary, matchesSumFilter);
  const folded = new Set(sections.filter(isFlowFolded).map((section) => section.flow.title));
  // j/k walks what's visible, each unit once
  summaryOrder = [...new Set([
    ...sections.filter((section) => !folded.has(section.flow.title)).flatMap((section) => section.members),
    ...others,
  ].map((u) => u.id))];
  // before building the list, so the default unit is highlighted too. A unit
  // the filter hides stays open in the pane.
  if (!state.summaryActive || !unitById(state.summaryActive)) state.summaryActive = summaryOrder[0] || null;
  const itemHtml = (u, side) => {
    const s = u.summary;
    const isViewed = isUnitViewed(u);
    const cls = "sum-item" + (!state.summaryOverview && u.id === state.summaryActive ? " active" : "") +
      (!s ? " pending" : isFlagged(u) ? "" : " routine") + (isViewed ? " viewed" : "") + " st-" + u.status;
    const gist = u.stale ? '<span class="gist stale">code changed — re-run</span>'
      : '<span class="gist">' + escapeHtml(s ? s.gist : u.kind + " · " + u.status) + "</span>";
    return '<button class="' + cls + '" data-id="' + escapeHtml(u.id) + '" title="' + escapeHtml(u.id + " — " + u.status) + '">' +
      viewedBoxHtml(isViewed, "mark viewed") + attnHtml(u) +
      '<span class="name">' + escapeHtml(unitLabel(u)) + '</span><span class="side">' + escapeHtml(side || "") + "</span>" +
      gist + "</button>";
  };
  const summarized = units.filter((u) => u.summary).length;
  const filtered = sumFilterText !== "" || sumSignal !== null;
  const shownCount = new Set([...sections.flatMap((section) => section.members), ...others].map((u) => u.id)).size;
  const title = filtered
    ? shownCount + " of " + units.length + " changes"
    : units.length + (units.length === 1 ? " change" : " changes");
  let html = '<div class="sum-head"><span class="title">' + title + "</span>" +
    (summarized === 0 ? '<span class="legend">not summarized yet</span>'
      : '<span class="legend">' + counts.any + " flagged</span>") + "</div>" +
    '<button class="sum-overview-item' + (state.summaryOverview ? " active" : "") + '" title="the whole diff at a glance (g)">' +
    '<span class="ico"></span>Overview<span class="key">g</span></button>' + signalChipsHtml(counts);
  for (const { flow, members } of sections) {
    const isFolded = folded.has(flow.title);
    html += '<div class="sum-section' + (isFolded ? " folded" : "") + '">' +
      '<button class="sum-section-title flow" data-flow="' + escapeHtml(flow.title) + '" aria-expanded="' + !isFolded + '">' +
      '<span class="caret">' + (isFolded ? "▸" : "▾") + "</span>" + prioHtml(flow) +
      '<span class="t">' + escapeHtml(flow.title) + '</span><span class="sub">' +
      escapeHtml(isFolded ? plural(members.length, "change") : flow.path) + "</span></button>" +
      (flow.why && !isFolded ? '<div class="sum-why">' + escapeHtml(flow.why) + "</div>" : "") +
      (isFolded ? "" : members.map((u) => itemHtml(u, flow.units[u.id])).join("")) + "</div>";
  }
  if (others.length > 0) {
    html += '<div class="sum-section">' + (sections.length > 0 ? '<div class="sum-section-title"><span class="t">Other changes</span></div>' : "") +
      others.map((u) => itemHtml(u, u.displayFile.split("/").pop())).join("") + "</div>";
  }
  if (shownCount === 0) html += '<div class="no-match">no changes match the filter</div>';
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
  /** @type {NodeListOf<HTMLElement>} */ (summaryListEl.querySelectorAll(".sum-section-title.flow")).forEach((b) => {
    b.onclick = () => {
      flowOpen.set(b.dataset.flow, b.getAttribute("aria-expanded") !== "true");
      renderSummaryList();
    };
  });
  /** @type {HTMLElement} */ (summaryListEl.querySelector(".sum-overview-item")).onclick = showOverview;
  /** @type {NodeListOf<HTMLElement>} */ (summaryListEl.querySelectorAll(".sig-chip")).forEach((b) => {
    b.onclick = () => setSignalFilter(b.dataset.sig);
  });
  return summarized;
}

// One toggle per signal present in the diff, plus "all flagged"
function signalChipsHtml(counts) {
  if (counts.any === 0) return "";
  const chip = (id, icon, label) => '<button class="sig-chip' + (id === "any" ? "" : " sig-" + id) + '" data-sig="' + id +
    '" aria-pressed="' + (sumSignal === id) + '" title="list only these (click again for all)"><span class="si">' + icon + "</span>" +
    label + '<span class="n">' + counts[id] + "</span></button>";
  return '<div class="sig-chips">' + chip("any", "", "all flagged") +
    Object.entries(SIGNALS).filter(([id]) => counts[id] > 0).map(([id, sig]) => chip(id, sig.icon, sig.many)).join("") + "</div>";
}

function setSignalFilter(id) {
  sumSignal = sumSignal === id ? null : id;
  renderSummaryList();
  if (state.summaryOverview) renderSummaryOverview(DATA.summary); // its stat buttons show the filter too
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
  togglesEl.innerHTML = "";
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
  flagged: infoHtml("flagged", "Changes with a reason to look closely: a possible bug (⚠), a risk (!), a question (?) the agent " +
    "raised, or callers outside the diff it may break (↗). Dismissed concerns don't count. Click the number to list only these." +
    '<div class="tip-note">The agent\'s judgement — lens doesn\'t verify it.</div>'),
  callers: infoHtml("callers outside the diff", "Call sites the diff didn't touch that the agent found may break. " +
    "Each one is checked: the line exists and mentions the changed unit."),
  stale: infoHtml("stale", "Changes whose code moved on since they were summarized. Run the summary again to update them."),
  bugs: infoHtml("possible bugs", "What the agent suspects is wrong. You decide: mark each one real or dismiss it on the change's page. " +
    "Dismissed ones don't count here. Click the number to list only the changes that have one." +
    '<div class="tip-note">The agent\'s judgement — lens doesn\'t verify it.</div>'),
};

// The whole diff at a glance: counts, the agent's overview, each flow by layer.
function renderSummaryOverview(summary) {
  const units = summary.units.filter(isUnitShown); // hide tests: the stats follow the lanes
  const files = new Set(units.map((u) => u.displayFile)).size;
  const flagged = units.filter(isFlagged).length;
  const callers = new Set(units.flatMap((u) => u.summary
    ? u.summary.breaks.flatMap((b) => b.callers.map((c) => c.file + ":" + c.line)) : [])).size;
  const stale = units.filter((u) => u.stale).length;
  const bugs = units.reduce((n, u) => n + openConcerns(u).filter((c) => c.kind === "bug").length, 0);
  const { sections, others } = groupUnits(summary, isUnitShown);
  const stat = (value, label, tone) =>
    '<div class="ov-stat' + (value > 0 && tone ? " " + tone : "") + '"><div class="v">' + value + '</div><div class="l">' + label + "</div></div>";
  // a stat whose number filters the list by a signal
  const filterStat = (value, label, tone, sig) =>
    '<div class="ov-stat' + (value > 0 && tone ? " " + tone : "") + '"><button class="v ov-filter" data-sig="' + sig + '" aria-pressed="' +
    (sumSignal === sig) + '" title="list only these"' + (value > 0 ? "" : " disabled") + ">" + value + '</button><div class="l">' + label + "</div></div>";

  let html = '<div class="ov-stats">' +
    stat(units.length, (units.length === 1 ? "change" : "changes") + " in " + plural(files, "file"), "") +
    stat(sections.length, sections.length === 1 ? "flow" : "flows", "") +
    filterStat(bugs, "possible " + (bugs === 1 ? "bug " : "bugs ") + STAT_INFO.bugs, "red", "bug") +
    filterStat(flagged, "flagged " + STAT_INFO.flagged, "amber", "any") +
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

  togglesEl.innerHTML = ""; // fold chips belong to a unit's code
  delete summaryPaneEl.dataset.unit;
  summaryPaneEl.innerHTML = '<div class="sum-inner">' + html + "</div>";
  /** @type {NodeListOf<HTMLElement>} */ (summaryPaneEl.querySelectorAll(".ov-chip")).forEach((b) => {
    b.onclick = () => openSummaryUnit(b.dataset.id);
  });
  /** @type {NodeListOf<HTMLElement>} */ (summaryPaneEl.querySelectorAll(".ov-filter")).forEach((b) => {
    b.onclick = () => setSignalFilter(b.dataset.sig);
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
    lanes += '<div class="ov-lane p' + flowPriority(flow) + '">' + ovLaneHeadHtml(flow.title, plural(members.length, "change"), false, false, flow) + '<div class="ov-layers">' +
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
  const files = byFile(summary.units.filter(isUnitShown).sort((a, b) => a.displayFile.localeCompare(b.displayFile) || startOf(a) - startOf(b)));
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

// A unit as a tag (overview and map): status stripe, tinted by its top signal, dimmed once viewed.
function ovChipHtml(u) {
  const top = unitSignals(u)[0];
  return '<button class="ov-chip st-' + u.status + (top ? " look sig-" + top : "") + (isUnitViewed(u) ? " viewed" : "") + '" data-id="' + escapeHtml(u.id) +
    '" title="' + escapeHtml(u.summary ? u.summary.headline : u.id) + '">' +
    '<span class="st-bar"></span><span class="cn">' + escapeHtml(unitLabel(u)) + "</span>" +
    (top ? attnHtml(u) : "") + "</button>";
}

function ovColumnHtml(label, units, title) {
  return '<div class="ov-layer"><div class="ov-layer-l"' + (title ? ' title="' + escapeHtml(title) + '"' : "") + ">" +
    escapeHtml(label) + "</div>" + units.map(ovChipHtml).join("") + "</div>";
}

function ovLaneHeadHtml(title, count, muted, mono, flow) {
  return '<div class="ov-lane-h">' + (flow ? prioHtml(flow) : "") +
    '<span class="t' + (muted ? " muted" : "") + (mono ? " mono" : "") + '">' + escapeHtml(title) + "</span>" +
    (flow && flow.why ? '<span class="why">' + escapeHtml(flow.why) + "</span>" : "") +
    '<span class="n">' + count + "</span></div>";
}

function renderSummaryUnit(u) {
  // the same unit again (a toolbar toggle, a verdict): keep the reader's place
  const top = u && summaryPaneEl.dataset.unit === u.id ? summaryPaneEl.scrollTop : 0;
  summaryPaneEl.innerHTML = "";
  if (!u) {
    delete summaryPaneEl.dataset.unit;
    togglesEl.innerHTML = "";
    summaryPaneEl.innerHTML = '<div class="sum-empty">nothing changed</div>';
    return;
  }
  summaryPaneEl.dataset.unit = u.id;
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
  if (s && s.concerns.length > 0) {
    html += '<div class="concerns">' + s.concerns.map((c, i) => {
      const mark = concernMark(u, c);
      return '<div class="concern k-' + c.kind + (mark ? " " + mark : "") + '">' +
        '<span class="ic">' + SIGNALS[c.kind].icon + '</span><span class="kind">' + concernLabel(c, mark) + "</span>" + citeHtml(c.line) +
        verdictHtml(i, mark) + '<div class="text">' + escapeHtml(c.text) + "</div></div>";
    }).join("") + "</div>";
  }
  if (s && s.changes.length > 0) {
    html += '<div class="chg"><div class="chg-label"><span class="t">What behaves differently</span>' +
      '<span class="cap">situations where the code now does something else</span></div>' +
      s.changes.map((c) =>
        '<div class="scn" data-line="' + escapeHtml(c.line) + '"><div class="scn-h"><span class="w">when</span><span class="sit">' +
        escapeHtml(c.when) + "</span>" + citeHtml(c.line) + "</div>" +
        (c.before ? '<div class="scn-l was"><span class="s">−</span><span class="tx">' + escapeHtml(c.before) + "</span></div>" : "") +
        '<div class="scn-l is"><span class="s">+</span><span>' + (c.before ? "" : '<span class="new-b" title="behavior that didn\'t exist before">new</span>') +
        escapeHtml(c.now) + "</span></div></div>",
      ).join("") + "</div>";
  }
  if (s && s.breaks.length > 0) {
    html += '<div class="breaks">' + s.breaks.map((b, bi) =>
      '<button class="brk-head" data-brk="' + bi + '"><span class="pk">▸</span>↗ ' + escapeHtml(b.summary) + "</button>" +
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
  // hovering a scenario points at the line that causes it
  all(".scn").forEach((el) => {
    el.onmouseenter = () => citedRow(inner, el.dataset.line)?.classList.add("hover-cite");
    el.onmouseleave = () => citedRow(inner, el.dataset.line)?.classList.remove("hover-cite");
  });
  // the verdict buttons, on the cards and on the notes in the code alike
  all(".vbtn").forEach((b) => b.onclick = () => {
    setConcernMark(u, s.concerns[Number(b.dataset.ci)], b.dataset.mark);
    renderSummaryUnit(u);
    renderSummaryList(); // the markers in the list follow the open concerns
  });
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
  /** @type {HTMLInputElement} */ (one("#sum-viewed")).onchange = () => toggleUnitViewed(u);
  const openBtn = one("#open-in-code");
  if (openBtn) openBtn.onclick = () => openUnitInCode(u);
  // the toolbar's fold chips: the categories that fold in this unit's code
  const regions = [...inner.querySelectorAll(".unit-code .region")].map((el) => ({ category: /** @type {HTMLElement} */ (el).dataset.cat }));
  renderToggles({ regions });
  summaryPaneEl.scrollTop = top;
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
    const { ranges, gaps } = unitHunks(u);
    // a hidden stretch (hunks only) is a row that expands on click; where the unit's own
    // ranges break, a plain ⋯
    // shown ranges and hidden stretches in line order; a jump between them is a plain ⋯
    const segments = [...ranges.map((r) => ({ ...r, gap: null })), ...gaps.map((g) => ({ start: g.start, end: g.end, gap: g }))]
      .sort((a, b) => a.start - b.start);
    segments.forEach((range, si) => {
      if (si > 0 && segments[si - 1].end + 1 !== range.start) {
        const gap = document.createElement("div");
        gap.className = "row unit-gap";
        gap.innerHTML = '<span class="num">' + "⋯".padStart(gutter) + '</span><span class="mark"></span><span></span>';
        code.appendChild(gap);
      }
      if (range.gap) { code.appendChild(gapRowEl(range.end - range.start + 1, range.gap.key, gutter)); return; }
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
  // each open concern as a note under its line, like a review comment
  (s ? s.concerns : []).forEach((c, i) => {
    const mark = concernMark(u, c);
    if (mark === "dismissed") return;
    const row = citedRow(wrap, c.line);
    if (!row) return; // a removed line while removed lines are hidden
    row.classList.add("flagged", "k-" + c.kind);
    row.closest(".region")?.classList.add("has-note");
    const note = document.createElement("div");
    note.className = "inline-note k-" + c.kind + (mark ? " " + mark : "");
    note.innerHTML = '<div class="n-top"><b>' + SIGNALS[c.kind].icon + " " + concernLabel(c, mark) + "</b>" + verdictHtml(i, mark) + '</div><div class="n-text">' + escapeHtml(c.text) + "</div>";
    let at = row; // after any note already on this line, so they keep their order
    while (at.nextElementSibling?.classList.contains("inline-note")) at = /** @type {HTMLElement} */ (at.nextElementSibling);
    at.after(note);
  });
  if (u.renamedFrom) {
    const note = document.createElement("div");
    note.className = "renamed-from";
    note.textContent = "was " + u.renamedFrom.id;
    code.appendChild(note);
    for (const b of u.renamedFrom.removals) for (const text of b.lines) code.appendChild(removedRowEl(text, gutter));
  }
  return wrap;
}

// The reader's call on one concern: real, or dismiss (which hides it from counts and the code)
function verdictHtml(i, mark) {
  const btn = (value, label, tip) => '<button class="vbtn v-' + value + '" data-ci="' + i + '" data-mark="' + value +
    '" aria-pressed="' + (mark === value) + '" title="' + tip + '">' + label + "</button>";
  if (mark === "dismissed") return '<span class="verdict">' + btn("dismissed", "↺ Restore", "bring it back") + "</span>";
  return '<span class="verdict" role="group" aria-label="your call">' +
    btn("real", "✓ Real", mark === "real" ? "undo: back to unreviewed" : "you checked: it's a real problem") +
    btn("dismissed", "✕ Dismiss", "not a problem: hides it from the code and the counts") + "</span>";
}

function citeHtml(label) {
  return '<button class="cite" data-line="' + escapeHtml(label) + '" title="show this line in the code below">' +
    escapeHtml(label.startsWith("O") ? "−" + label.slice(1) : "L" + label.slice(1)) + "</button>";
}

/** The code row a label ("N31" / "O16") points at, in the unit's code. */
function citedRow(container, label) {
  const selector = label.startsWith("O") ? '.row[data-old="' + label.slice(1) + '"]' : '.row[data-line="' + label.slice(1) + '"]';
  return /** @type {HTMLElement | null} */ (container.querySelector(".unit-code " + selector));
}

// Hunks only: the unit's lines within HUNK_CONTEXT of a change or a removed block, as in the
// code view, plus the hidden stretches in between — each expands on click (expandedGaps).
function unitHunks(u) {
  if (!state.hunksOnly) return { ranges: u.ranges, gaps: [] };
  const near = new Set();
  const around = (from, to) => { for (let l = from; l <= to; l++) near.add(l); };
  for (const l of u.changedLines) around(l - HUNK_CONTEXT, l + HUNK_CONTEXT);
  // a removed block shows after its anchor line: keep the lines on both sides
  for (const b of u.removals) around(b.anchor - HUNK_CONTEXT + 1, b.anchor + HUNK_CONTEXT);
  // lines the summary points at stay in view — a concern's note hangs off its line
  const s = u.summary;
  for (const c of s ? [...s.concerns, ...s.changes] : []) {
    if (c.line.startsWith("N")) { const l = Number(c.line.slice(1)); around(l - 1, l + 1); }
  }
  // runs of hidden lines within each of the unit's ranges; an expanded one shows again
  const gaps = [];
  for (const r of u.ranges) {
    for (let l = r.start; l <= r.end; l++) {
      if (near.has(l)) continue;
      const last = gaps[gaps.length - 1];
      if (last && last.end === l - 1) last.end = l; else gaps.push({ start: l, end: l, key: "" });
    }
  }
  for (const g of gaps) g.key = "unit:" + u.id + ":" + g.start;
  const hidden = gaps.filter((g) => !expandedGaps.has(g.key));
  const ranges = [];
  for (const r of u.ranges) {
    for (let l = r.start; l <= r.end; l++) {
      if (hidden.some((g) => l >= g.start && l <= g.end)) continue;
      const last = ranges[ranges.length - 1];
      if (last && last.end === l - 1) last.end = l; else ranges.push({ start: l, end: l });
    }
  }
  return { ranges, gaps: hidden };
}

function flashCited(container, label) {
  const row = citedRow(container, label);
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
