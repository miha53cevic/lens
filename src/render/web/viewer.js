// lens viewer: the Code view (tree, tabs, folds, search, settings, keys).
// Served inlined into viewer.html together with summary.js and ask.js — one
// script, so the three files share top-level names. Start-up runs at the end of ask.js.

/** @type {import("./server.ts").ViewerPayload} */
const DATA = /*__LENS_DATA__*/ null;

// Quotes too: the result also goes into attributes (data-id="…", title="…").
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Tokens come pre-computed from the backend (Shiki): per line, [text, color] pairs.
function linesFromTokens(file) {
  if (Array.isArray(file.tokens) && file.tokens.length > 0) {
    return file.tokens.map((line) =>
      line.map(([text, color]) =>
        color
          ? '<span style="color:' + color + '">' + escapeHtml(text) + "</span>"
          : escapeHtml(text),
      ).join(""),
    );
  }
  return file.source.split("\n").map(escapeHtml);
}

const CAT_COLORS = {
  "import": "#6ea8fe",
  "comment": "#9099ab",
  "guard": "#e9b04d",
  "logging": "#b585f0",
  "telemetry": "#4dd4c6",
  "error-boilerplate": "#f0716e",
  "accessor": "#7bd88f",
  "barrel": "#f28fd0",
  "data": "#e0995a",
};
function catColor(cat) { return CAT_COLORS[cat] || "#e9b04d"; }

const state = {
  active: -1, // set at start-up by openFirstTreeFile
  // Open editor tabs, vscode-style: at most one is unpinned — the "preview"
  // tab, reused by the next single-click open. Double-click pins.
  tabs: [],
  hiddenCategories: new Set(), // categories toggled to "show" (i.e. not folded)
  showRemoved: true,
  view: "code", // "code" | "summary" — Code is always the default
  // reader preferences (the persisted ones are restored from localStorage)
  navCollapsed: readPref("lens.navCollapsed") === "1",
  hideTests: readPref("lens.hideTests") !== "0", // on by default
  hunksOnly: readPref("lens.hunksOnly") !== "0", // on by default
  navFilter: "", // sidebar filter query (transient, not persisted)
  /** @type {string | null} */
  summaryActive: null, // the Summary view's open unit id
  summaryOverview: true, // the Summary view shows the overview instead (it opens there)
  overviewTab: readPref("lens.overviewTab") === "map" ? "map" : "flows", // its lower half: flows or map
};

// PR mode: "owner/repo#N — title" in the header and the tab title
const prLabelEl = document.getElementById("pr-label");
function syncLabel() {
  prLabelEl.style.display = DATA.label ? "" : "none";
  prLabelEl.textContent = DATA.label || "";
  prLabelEl.title = DATA.label || "";
  document.title = DATA.label ? "lens — " + DATA.label : "lens";
}
syncLabel();

const nav = document.getElementById("nav");
const treeEl = document.getElementById("tree");
const filterInput = /** @type {HTMLInputElement} */ (document.getElementById("file-filter"));
const filterClear = document.getElementById("filter-clear");
const resizerEl = document.getElementById("resizer");
const navToggle = document.getElementById("nav-toggle");
const codeEl = document.getElementById("code");
const statsEl = document.getElementById("stats");
const togglesEl = document.getElementById("toggles");
const mainEl = document.querySelector("main");

// ---- editor tabs ----
const tabbarEl = document.getElementById("tabbar");

// Every file shares the one scroll container, so each remembers its own
// reading position, saved and restored by render() — a tab switch comes back
// where the reader left off, an in-place re-render (theme, toggles) stays put.
// Keyed by path so positions survive a refresh.
const scrollMemory = new Map(); // file path -> { top, left }
let renderedPath = null; // the file currently shown in the code pane
function rememberScroll() {
  if (renderedPath !== null) {
    scrollMemory.set(renderedPath, { top: mainEl.scrollTop, left: mainEl.scrollLeft });
  }
}

// Make sure the file has a tab, without rendering. A new file takes over the
// preview tab when one exists; otherwise it opens next to the active tab.
function ensureTab(index, pin) {
  const existing = state.tabs.find((t) => t.index === index);
  if (existing) {
    if (pin) existing.pinned = true;
    return;
  }
  const preview = state.tabs.find((t) => !t.pinned);
  if (!pin && preview) {
    preview.index = index;
    return;
  }
  const at = state.tabs.findIndex((t) => t.index === state.active);
  state.tabs.splice(at + 1, 0, { index, pinned: !!pin });
}

function openFile(index, pin) {
  ensureTab(index, pin);
  state.active = index;
  render();
}

function closeTab(index) {
  const at = state.tabs.findIndex((t) => t.index === index);
  if (at === -1) return;
  state.tabs.splice(at, 1);
  if (state.active === index) {
    const next = state.tabs[Math.min(at, state.tabs.length - 1)];
    state.active = next ? next.index : -1;
  }
  render();
}

function renderTabs() {
  tabbarEl.innerHTML = "";
  tabbarEl.style.display = state.tabs.length === 0 ? "none" : "";
  // basenames shared by several open tabs get their directory as a suffix
  const counts = new Map();
  for (const t of state.tabs) {
    const base = DATA.files[t.index].file.split("/").pop();
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  for (const t of state.tabs) {
    const path = DATA.files[t.index].file;
    const base = path.split("/").pop();
    const dir = path.slice(0, Math.max(0, path.length - base.length - 1));
    const el = document.createElement("div");
    el.className = "tab" + (t.index === state.active ? " active" : "") + (t.pinned ? "" : " preview");
    el.title = path + (t.pinned ? "" : " — preview tab: reused by the next open, double-click to keep");
    el.innerHTML =
      '<span class="tab-name">' + escapeHtml(base) + "</span>" +
      (counts.get(base) > 1 && dir ? '<span class="tab-dir">' + escapeHtml(dir) + "</span>" : "") +
      '<button class="tab-close" title="close (or middle-click)">✕</button>';
    el.onclick = () => openFile(t.index);
    el.ondblclick = () => { t.pinned = true; renderTabs(); };
    el.onauxclick = (ev) => { if (ev.button === 1) closeTab(t.index); };
    /** @type {HTMLElement} */ (el.querySelector(".tab-close")).onclick = (ev) => { ev.stopPropagation(); closeTab(t.index); };
    tabbarEl.appendChild(el);
  }
}

function foldedCount(file) {
  let n = 0;
  for (const r of file.regions) {
    if (r.score <= DATA.threshold) n += r.endLine - r.startLine;
  }
  return n;
}

// ---- file tree sidebar ----
const closedDirs = new Set(); // survives re-renders (theme/file switches)

// Sidebar width + collapsed state persist per browser via localStorage.
function readPref(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writePref(key, value) { try { localStorage.setItem(key, value); } catch {} }

// ---- viewed marks ----
// What the reader ticked as viewed, per browser. Keyed by content, so a file
// or unit that changes after it was ticked comes back unticked.
const VIEWED_CAP = 2000;
const VIEWED_PREF = { files: "lens.viewedFiles", units: "lens.viewedUnits" };
function loadViewed(kind) {
  try { return new Set(JSON.parse(readPref(VIEWED_PREF[kind]) || "[]")); } catch { return new Set(); }
}
const viewed = { files: loadViewed("files"), units: loadViewed("units") };
function toggleViewed(kind, key) {
  const set = viewed[kind];
  if (!set.delete(key)) set.add(key);
  // Sets keep insertion order: the oldest marks drop first
  writePref(VIEWED_PREF[kind], JSON.stringify([...set].slice(-VIEWED_CAP)));
}

const fileViewKeys = new WeakMap(); // file object -> key; a refresh brings new objects
function fileViewKey(file) {
  let key = fileViewKeys.get(file);
  if (!key) {
    // FNV-1a over the source and the removed lines
    const text = file.source + "\0" + JSON.stringify(file.removals || []);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    key = file.file + "@" + (h >>> 0).toString(36);
    fileViewKeys.set(file, key);
  }
  return key;
}
function isFileViewed(index) {
  const file = DATA.files[index];
  return !!file && viewed.files.has(fileViewKey(file));
}
function toggleFileViewed(index) {
  const file = DATA.files[index];
  if (!file) return;
  toggleViewed("files", fileViewKey(file));
  renderNav();
  syncViewedControl();
}

// The tick box in tree and summary list rows: a span, since the rows are buttons.
function viewedBoxHtml(on, title) {
  return '<span class="viewed-box" role="checkbox" aria-checked="' + on + '" title="' + title + '"></span>';
}

const expandedGaps = new Set(); // "path:gapStart" — gaps the reviewer opened

// Glob-ish test-file matcher: "*" = within a path segment, "**" = across
// segments; patterns match anywhere in the path ("*.spec.*", "__tests__/**").
const testRegexes = (DATA.testFilePatterns || []).map((pattern) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.split("**").map((part) => part.replaceAll("*", "[^/]*")).join(".*");
  return new RegExp("(^|/)" + body + "$");
});
function isTestFile(path) {
  return testRegexes.some((r) => r.test(path));
}
const savedWidth = Number(readPref("lens.navWidth"));
if (savedWidth >= 160 && savedWidth <= 600) nav.style.width = savedWidth + "px";

let hasTree = false;
let navOrder = []; // file indices in visual tree order, rebuilt by renderNav
function syncNavVisibility() {
  navToggle.style.display = hasTree ? "" : "none";
  const show = hasTree && !state.navCollapsed;
  nav.style.display = show ? "" : "none";
  resizerEl.style.display = show ? "" : "none";
}

function applyNavFilter() {
  state.navFilter = filterInput.value.trim().toLowerCase();
  filterClear.style.display = state.navFilter === "" ? "none" : "";
  renderNav();
}
filterInput.oninput = applyNavFilter;
filterInput.onkeydown = (ev) => {
  if (ev.key === "Escape") { filterInput.value = ""; applyNavFilter(); filterInput.blur(); }
};
filterClear.onclick = () => { filterInput.value = ""; applyNavFilter(); };

navToggle.onclick = () => {
  state.navCollapsed = !state.navCollapsed;
  writePref("lens.navCollapsed", state.navCollapsed ? "1" : "0");
  syncNavVisibility();
};

resizerEl.addEventListener("pointerdown", (down) => {
  down.preventDefault();
  resizerEl.setPointerCapture(down.pointerId);
  resizerEl.classList.add("dragging");
  document.body.style.userSelect = "none";
  const move = (ev) => {
    const width = Math.min(600, Math.max(160, ev.clientX - nav.getBoundingClientRect().left));
    nav.style.width = width + "px";
  };
  const up = () => {
    resizerEl.classList.remove("dragging");
    document.body.style.userSelect = "";
    resizerEl.removeEventListener("pointermove", move);
    resizerEl.removeEventListener("pointerup", up);
    writePref("lens.navWidth", parseInt(nav.style.width, 10) || 262);
  };
  resizerEl.addEventListener("pointermove", move);
  resizerEl.addEventListener("pointerup", up);
});

function matchesFilter(path) {
  return state.navFilter === "" || path.toLowerCase().includes(state.navFilter);
}

function buildTree() {
  const shown = (path) => visibleFile(path) && matchesFilter(path);
  /** @type {{ path: string, index: number | null, status: string | null, renamedFrom?: string }[]} */
  const entries = DATA.files
    .map((f, index) => ({ path: f.file, index, status: f.status || null }))
    .filter((e) => shown(e.path));
  for (const path of (DATA.deleted || []).filter(shown)) {
    entries.push({ path, index: null, status: "deleted" });
  }
  for (const path of (DATA.excluded || []).filter(shown)) {
    entries.push({ path, index: null, status: "excluded" });
  }
  for (const r of (DATA.renamed || []).filter((x) => shown(x.to))) {
    entries.push({ path: r.to, index: null, status: "renamed", renamedFrom: r.from });
  }

  const root = { name: "", dirs: new Map(), files: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/");
    const name = parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push({ ...entry, name });
  }
  compressChains(root);
  return root;
}

// Merge single-child directory chains ("src" > "render" > "web" → "src/render/web").
function compressChains(node) {
  for (const [key, childStart] of [...node.dirs]) {
    let child = childStart;
    while (child.dirs.size === 1 && child.files.length === 0) {
      const grandchild = [...child.dirs.values()][0];
      child = { name: child.name + "/" + grandchild.name, dirs: grandchild.dirs, files: grandchild.files };
    }
    if (child !== childStart) { node.dirs.delete(key); node.dirs.set(child.name, child); }
    compressChains(child);
  }
}

function visibleFile(path) {
  return !(state.hideTests && isTestFile(path));
}

function renderNav() {
  treeEl.innerHTML = "";
  navOrder = [];
  const paths = [...DATA.files.map((f) => f.file), ...(DATA.deleted || []),
    ...(DATA.excluded || []), ...(DATA.renamed || []).map((r) => r.to)];
  testsWrap.style.display = paths.some(isTestFile) ? "" : "none";
  const visible = paths.filter(visibleFile);
  hasTree = visible.length > 0;
  syncNavVisibility();
  if (!hasTree) return;
  const tree = buildTree();
  if (state.navFilter !== "" && tree.dirs.size === 0 && tree.files.length === 0) {
    treeEl.innerHTML = '<div class="no-match">no files match "' + escapeHtml(state.navFilter) + '"</div>';
    return;
  }
  renderTreeNode(tree, "", 0, treeEl);
}

function renderTreeNode(node, path, depth, container) {
  const indent = 8 + depth * 13;
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const dir of dirs) {
    const dirPath = path + dir.name + "/";
    const closed = state.navFilter === "" && closedDirs.has(dirPath);
    const row = document.createElement("div");
    row.className = "dir";
    row.style.paddingLeft = indent + "px";
    row.title = dirPath;
    row.innerHTML = '<span class="caret' + (closed ? "" : " open") + '">▸</span>' + escapeHtml(dir.name);
    row.onclick = () => {
      if (closed) closedDirs.delete(dirPath); else closedDirs.add(dirPath);
      renderNav();
    };
    container.appendChild(row);
    if (!closed) renderTreeNode(dir, dirPath, depth + 1, container);
  }
  const STATUS_LETTER = { added: "A", modified: "M", deleted: "D", excluded: "⊘", renamed: "R" };
  const STATUS_TITLE = {
    added: "added", modified: "modified", deleted: "deleted in this diff",
    excluded: "changed, but excluded from analysis (exclude patterns in config)",
    renamed: "renamed, content unchanged",
  };
  for (const entry of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
    const letter = STATUS_LETTER[entry.status];
    const isViewed = entry.index !== null && isFileViewed(entry.index);
    const b = document.createElement("button");
    b.className = "file" + (entry.status ? " " + entry.status : "") +
      (entry.index !== null && entry.index === state.active ? " active" : "") + (isViewed ? " viewed" : "");
    b.style.paddingLeft = (indent + 13) + "px";
    b.title = entry.status === "renamed"
      ? entry.renamedFrom + " → " + entry.path + " — " + STATUS_TITLE.renamed
      : entry.path + (entry.status ? " — " + STATUS_TITLE[entry.status] : "");
    b.innerHTML =
      // files that can't be opened keep the box's width, so names stay aligned
      (entry.index !== null ? viewedBoxHtml(isViewed, "mark viewed") : '<span class="viewed-box placeholder"></span>') +
      '<span class="fname">' + highlightName(entry.name) + "</span>" +
      (letter ? '<span class="status st-' + letter + '">' + letter + "</span>" : "");
    if (entry.index !== null) {
      navOrder.push(entry.index);
      b.onclick = () => openFile(entry.index);
      b.ondblclick = () => openFile(entry.index, true);
      const box = /** @type {HTMLElement} */ (b.querySelector(".viewed-box"));
      box.onclick = (ev) => { ev.stopPropagation(); toggleFileViewed(entry.index); };
      box.ondblclick = (ev) => ev.stopPropagation();
    } else {
      b.disabled = true;
    }
    container.appendChild(b);
  }
}

// Wrap the filter match in the filename (matches on full path may not appear here).
function highlightName(name) {
  if (state.navFilter === "") return escapeHtml(name);
  const at = name.toLowerCase().indexOf(state.navFilter);
  if (at === -1) return escapeHtml(name);
  return escapeHtml(name.slice(0, at)) +
    '<span class="hl">' + escapeHtml(name.slice(at, at + state.navFilter.length)) + "</span>" +
    escapeHtml(name.slice(at + state.navFilter.length));
}

/** Where the folds on screen live: the code view's file or the summary's unit. */
function foldScope() {
  return state.view === "summary" ? document.getElementById("summary-pane") : codeEl;
}

/** @param {{ regions: { category: string }[] }} file  a file, or a summary unit's share of one */
function renderToggles(file) {
  const categories = [...new Set(file.regions.map(r => r.category))];
  togglesEl.innerHTML = categories.length ? '<span class="show-label">FOLDS</span>' : "";
  for (const cat of categories) {
    const label = document.createElement("label");
    label.className = "chip";
    label.style.setProperty("--cat", catColor(cat));
    label.title = "toggle " + cat + " regions expanded";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = state.hiddenCategories.has(cat);
    box.onchange = () => {
      if (box.checked) state.hiddenCategories.add(cat); else state.hiddenCategories.delete(cat);
      foldScope().querySelectorAll('.region[data-cat="' + cat + '"]').forEach(el =>
        el.classList.toggle("open", box.checked));
    };
    const dot = document.createElement("span");
    dot.className = "dot";
    label.appendChild(box);
    label.appendChild(dot);
    label.appendChild(document.createTextNode(cat));
    togglesEl.appendChild(label);
  }
}

function render() {
  if (state.view === "summary") { renderSummary(); return; }
  rememberScroll();
  renderedPath = null; // set again at the end, once a file actually renders
  if (state.hideTests) {
    const active = DATA.files[state.active];
    if (active && isTestFile(active.file)) {
      const firstVisible = firstTreeFile();
      if (firstVisible >= 0) { ensureTab(firstVisible); state.active = firstVisible; }
    }
  }
  const file = DATA.files[state.active];
  renderNav();
  renderTabs();
  syncViewedControl();
  lastHiddenTotal = 0;
  if (!file) {
    codeEl.innerHTML = '<div class="empty">' + (DATA.files.length > 0
      ? "no file open — pick one from the tree"
      : listedOnlyCount() > 0
        ? "nothing to analyze — this diff only renamed, deleted, or excluded files (see the tree)"
        : "no supported files found") + "</div>";
    togglesEl.innerHTML = "";
    updateStats();
    askSync();
    return;
  }
  renderToggles(file);
  if (state.hideTests && isTestFile(file.file)) {
    updateStats();
    codeEl.innerHTML = '<div class="empty">every file here is a test file — untick "hide tests" to see them</div>';
    return;
  }

  const lines = linesFromTokens(file);
  const changed = new Set(file.changedLines || []);
  const regionAt = new Map();
  for (const r of file.regions) regionAt.set(r.startLine, r);

  // Old-side lines the diff removed, keyed by the new-side line they follow.
  const removedAfter = new Map();
  if (state.showRemoved) {
    for (const block of file.removals || []) {
      const existing = removedAfter.get(block.afterLine) || [];
      removedAfter.set(block.afterLine, existing.concat(block.lines.map((text, i) => ({ text, old: block.oldStart + i }))));
    }
  }
  const emitRemoved = (afterLine, container, gutter) => {
    for (const { text, old } of removedAfter.get(afterLine) || []) {
      const row = removedRowEl(text, gutter);
      row.dataset.old = old; // its old-side line, as in the Summary view (the Ask rail sends it)
      container.appendChild(row);
    }
  };

  const { windows, hiddenGaps } = computeHunks(file);
  const inWindow = (start, end) =>
    windows === null || windows.some((w) => start <= w.end && w.start <= end);
  const gapAt = (line) => hiddenGaps.find((g) => line >= g.start && line <= g.end);

  const gutter = String(file.lineCount).length;
  codeEl.innerHTML = "";
  if (file.parseError) {
    codeEl.innerHTML = '<div class="notice">⚠ folding disabled — this file has syntax errors</div>';
  }
  emitRemoved(0, codeEl, gutter);
  let lineNo = 1;
  let hiddenTotal = 0;
  while (lineNo <= file.lineCount) {
    const region = regionAt.get(lineNo);
    if (region && inWindow(region.startLine, region.endLine)) {
      codeEl.appendChild(regionEl(region, lines, changed, gutter, emitRemoved));
      emitRemoved(region.endLine, codeEl, gutter);
      lineNo = region.endLine + 1;
      continue;
    }
    const gap = gapAt(lineNo);
    if (gap) {
      const count = gap.end - lineNo + 1;
      hiddenTotal += count;
      codeEl.appendChild(gapRowEl(count, file.file + ":" + gap.start, gutter));
      lineNo = gap.end + 1;
      continue;
    }
    codeEl.appendChild(rowEl(lineNo, lines[lineNo - 1] ?? "", changed.has(lineNo), gutter));
    emitRemoved(lineNo, codeEl, gutter);
    lineNo++;
  }
  lastHiddenTotal = hiddenTotal;
  updateStats();
  renderedPath = file.file;
  const saved = scrollMemory.get(file.file);
  mainEl.scrollTop = saved ? saved.top : 0;
  mainEl.scrollLeft = saved ? saved.left : 0;
  askSync(); // the rows were rebuilt: repaint the kept selection (or drop it for another file)
}

/** Lines of context around each change in hunks-only mode (code view and summary) */
const HUNK_CONTEXT = 3;

// Hunks-only windows: ±HUNK_CONTEXT lines around every change/removal anchor, merged;
// hiddenGaps are the non-expanded stretches in between (ids stable across expansion).
function computeHunks(file) {
  const hasAnchors = (file.changedLines || []).length > 0 || (file.removals || []).length > 0;
  if (!state.hunksOnly || !hasAnchors) return { windows: null, hiddenGaps: [] };

  const anchors = new Set(file.changedLines || []);
  for (const block of file.removals || []) {
    anchors.add(Math.max(1, block.afterLine));
    anchors.add(Math.min(file.lineCount, block.afterLine + 1));
  }
  const windows = [];
  for (const line of [...anchors].sort((a, b) => a - b)) {
    const start = Math.max(1, line - HUNK_CONTEXT);
    const end = Math.min(file.lineCount, line + HUNK_CONTEXT);
    const last = windows[windows.length - 1];
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
    else windows.push({ start, end });
  }
  let cursor = 1;
  const hiddenGaps = [];
  for (const w of [...windows]) {
    if (w.start > cursor) {
      const gap = { start: cursor, end: w.start - 1 };
      if (expandedGaps.has(file.file + ":" + gap.start)) windows.push(gap);
      else hiddenGaps.push(gap);
    }
    cursor = w.end + 1;
  }
  if (cursor <= file.lineCount) {
    const gap = { start: cursor, end: file.lineCount };
    if (expandedGaps.has(file.file + ":" + gap.start)) windows.push(gap);
    else hiddenGaps.push(gap);
  }
  return { windows, hiddenGaps };
}

function gapRowEl(count, key, gutter) {
  const row = document.createElement("div");
  row.className = "row gap";
  row.title = "click to expand";
  row.innerHTML =
    '<span class="num">' + "⋯".padStart(gutter) + "</span>" +
    '<span class="mark"></span>' +
    "<span>⋯ " + count + " unchanged line" + (count === 1 ? "" : "s") + "</span>";
  row.onclick = () => { expandedGaps.add(key); render(); };
  return row;
}

// changed files the diff lists but the viewer can't open: deleted, excluded, renamed
function listedOnlyCount() {
  return (DATA.deleted || []).length + (DATA.excluded || []).length + (DATA.renamed || []).length;
}

function isDiffMode() {
  return listedOnlyCount() > 0 ||
    DATA.files.some((f) => (f.removals || []).length > 0 || f.status);
}

let lastHiddenTotal = 0;
function updateStats() {
  const file = DATA.files[state.active];
  if (!file) { statsEl.textContent = ""; return; }
  const changed = isDiffMode() ? DATA.files.length + listedOnlyCount() : 0;
  const folded = foldedCount(file);
  const pct = file.lineCount ? Math.round((folded / file.lineCount) * 100) : 0;
  statsEl.textContent =
    (changed > 0 ? changed + (changed === 1 ? " file" : " files") + " changed · " : "") +
    file.file + " — " + file.lineCount + " lines, " + folded + " folded (−" + pct + "%)" +
    (lastHiddenTotal > 0 ? " · " + lastHiddenTotal + " unchanged hidden" : "");
}

// Threshold changes only flip classes — no DOM rebuild, no scroll reset.
function applyThreshold() {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".region")).forEach((el) => {
    el.classList.toggle("pinned", Number(el.dataset.score) > DATA.threshold);
  });
  updateStats();
}

function removedRowEl(text, gutter) {
  const row = document.createElement("div");
  row.className = "row removed";
  row.innerHTML =
    '<span class="num">' + "−".padStart(gutter) + "</span>" +
    '<span class="mark"></span>' +
    "<span>" + (escapeHtml(text) || " ") + "</span>";
  return row;
}

function rowEl(lineNo, html, isChanged, gutter) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.line = lineNo;
  row.innerHTML =
    '<span class="num">' + String(lineNo).padStart(gutter) + "</span>" +
    '<span class="mark' + (isChanged ? " changed" : "") + '"></span>' +
    "<span>" + (html || " ") + "</span>";
  return row;
}

function regionEl(region, lines, changed, gutter, emitRemoved) {
  const wrap = document.createElement("div");
  wrap.className = "region" +
    (state.hiddenCategories.has(region.category) ? " open" : "") +
    (region.score > DATA.threshold ? " pinned" : "");
  wrap.dataset.cat = region.category;
  wrap.dataset.score = region.score;

  let touchesChange = false;
  for (let l = region.startLine; l <= region.endLine; l++) if (changed.has(l)) touchesChange = true;

  const head = document.createElement("div");
  head.className = "row pill-row";
  head.innerHTML =
    '<span class="num">' + String(region.startLine).padStart(gutter) + "</span>" +
    // the changed-lines gutter bar shows on the pill too, so collapsed changes
    // stay scannable in the margin
    '<span class="mark' + (touchesChange ? " changed" : "") + '"></span>' +
    '<span class="pill" style="--cat:' + catColor(region.category) + '"><span class="caret">▸</span><span class="cat">' +
    escapeHtml(region.category) + "</span>" + escapeHtml(region.summary) + "</span>";
  head.onclick = () => wrap.classList.toggle("open");

  const body = document.createElement("div");
  body.className = "body";
  for (let l = region.startLine; l <= region.endLine; l++) {
    body.appendChild(rowEl(l, lines[l - 1] ?? "", changed.has(l), gutter));
    // removals anchored at endLine render after the region, in the main flow
    if (l < region.endLine) emitRemoved(l, body, gutter);
  }
  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}

// ---- theme switching ----
const themeSelect = /** @type {HTMLSelectElement} */ (document.getElementById("theme-select"));
for (const name of DATA.themes) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  if (name === DATA.theme) option.selected = true;
  themeSelect.appendChild(option);
}
// A light code theme flips the whole chrome to the light palette, so the
// header/sidebar/modals match instead of boxing a bright pane in dark panels.
function isLightColor(color) {
  // longest-first: themes report #rgb, #rgba, #rrggbb, or #rrggbbaa
  const m = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i.exec((color || "").trim());
  if (!m) return false;
  let hex = m[1];
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}
function applyThemeColors(fg, bg) {
  document.documentElement.style.setProperty("--code-fg", fg);
  document.documentElement.style.setProperty("--code-bg", bg);
  document.documentElement.dataset.appearance = isLightColor(bg) ? "light" : "dark";
}
async function switchTheme(theme) {
  themeSelect.disabled = true;
  try {
    const res = await fetch("/api/tokens?theme=" + encodeURIComponent(theme));
    if (!res.ok) throw new Error("http " + res.status);
    const entry = await res.json();
    DATA.theme = entry.theme;
    DATA.fg = entry.fg;
    DATA.bg = entry.bg;
    DATA.files.forEach((f, i) => { f.tokens = entry.tokens[i]; });
    if (![...themeSelect.options].some((o) => o.value === entry.theme)) {
      const option = document.createElement("option");
      option.value = entry.theme;
      option.textContent = entry.theme;
      themeSelect.appendChild(option);
    }
    themeSelect.value = entry.theme;
    applyThemeColors(entry.fg, entry.bg);
    render();
    return true;
  } catch (err) {
    console.error("theme switch failed:", err);
    themeSelect.value = DATA.theme;
    return false;
  } finally {
    themeSelect.disabled = false;
  }
}

themeSelect.onchange = async () => {
  if (await switchTheme(themeSelect.value)) writePref("lens.theme", DATA.theme);
};
applyThemeColors(DATA.fg, DATA.bg);

// Restore the saved theme choice — unless --theme pinned this run's theme.
const savedTheme = readPref("lens.theme");
if (!DATA.themePinned && savedTheme && savedTheme !== DATA.theme) {
  switchTheme(savedTheme).then((ok) => {
    if (!ok) writePref("lens.theme", DATA.theme); // stale/unknown theme: forget it
  });
}

// ---- fold threshold select ----
const thresholdSelect = /** @type {HTMLSelectElement} */ (document.getElementById("threshold"));
const thresholdTipEl = document.getElementById("threshold-tip");

// Lowest score seen per category across all files — the ground truth for
// what each slider level actually folds in THIS run.
function categoryScores() {
  const scores = new Map();
  for (const f of DATA.files) {
    for (const r of f.regions) {
      scores.set(r.category, Math.min(scores.get(r.category) ?? 99, r.score));
    }
  }
  return scores;
}

function renderThresholdTip() {
  const scores = categoryScores();
  const rows = [{ level: -1, label: "off", text: "nothing folds \u2014 the plain file" }];
  for (let t = 0; t <= 3; t++) {
    const added = [...scores].filter(([, s]) => s === t).map(([c]) => c);
    rows.push({
      level: t,
      label: String(t),
      text: added.length ? (t > 0 ? "also " : "") + added.join(", ") : "nothing new at this level",
    });
  }
  thresholdTipEl.innerHTML =
    '<div class="tip-title">what folds at each level</div>' +
    rows.map((r) =>
      '<div class="tip-row' + (r.level === DATA.threshold ? " current" : "") + '">' +
      '<span class="lvl">' + r.label + "</span><span>" + escapeHtml(r.text) + "</span></div>",
    ).join("") +
    '<div class="tip-note">TODO/FIXME comments and lens:keep regions never fold</div>';
}

thresholdSelect.value = String(DATA.threshold);
renderThresholdTip();
thresholdSelect.onchange = () => {
  DATA.threshold = Number(thresholdSelect.value);
  renderThresholdTip();
  applyThreshold();
};

// ---- hunks-only toggle (diff mode only) ----
const hunksWrap = document.getElementById("hunks-wrap");
const hunksBox = /** @type {HTMLInputElement} */ (document.getElementById("hunks-only"));
hunksBox.checked = state.hunksOnly;
hunksBox.onchange = () => {
  state.hunksOnly = hunksBox.checked;
  writePref("lens.hunksOnly", state.hunksOnly ? "1" : "0");
  expandedGaps.clear(); // toggling starts fresh — no stale expansions
  render();
};

// ---- hide-tests toggle ----
const testsWrap = document.getElementById("tests-wrap");
const hideTestsBox = /** @type {HTMLInputElement} */ (document.getElementById("hide-tests"));
hideTestsBox.checked = state.hideTests;
hideTestsBox.onchange = () => {
  state.hideTests = hideTestsBox.checked;
  writePref("lens.hideTests", state.hideTests ? "1" : "0");
  render();
};

// ---- removed-lines toggle (diff mode only) ----
const removedWrap = document.getElementById("removed-wrap");
const showRemovedBox = /** @type {HTMLInputElement} */ (document.getElementById("show-removed"));
function syncDiffControls() {
  const isDiff = isDiffMode();
  removedWrap.style.display = isDiff ? "" : "none";
  hunksWrap.style.display = isDiff ? "" : "none";
}
showRemovedBox.onchange = () => { state.showRemoved = showRemovedBox.checked; render(); };
syncDiffControls();

// ---- viewed toggle (the active file) ----
const viewedWrap = document.getElementById("viewed-wrap");
const viewedDivider = document.getElementById("viewed-divider");
const viewedBox = /** @type {HTMLInputElement} */ (document.getElementById("viewed"));
function syncViewedControl() {
  const open = !!DATA.files[state.active];
  viewedWrap.style.display = open ? "" : "none";
  viewedDivider.style.display = open ? "" : "none";
  viewedBox.checked = isFileViewed(state.active);
}
viewedBox.onchange = () => toggleFileViewed(state.active);

// ---- settings modal ----
const settingsModal = /** @type {HTMLDialogElement} */ (document.getElementById("settings-modal"));
const settingsBody = document.getElementById("settings-body");
document.getElementById("settings-btn").onclick = () => {
  renderSettings();
  settingsModal.showModal();
};

function codeList(items) {
  if (!items || items.length === 0) return '<span class="set-source">none</span>';
  return '<span class="set-list">' + items.map((i) => "<code>" + escapeHtml(String(i)) + "</code>").join("") + "</span>";
}

function renderSettings() {
  const cfg = DATA.config;
  const categories = Object.keys(cfg.categories || {});
  for (const p of cfg.callPatterns || []) {
    if (!categories.includes(p.category)) categories.push(p.category);
  }

  const categoryRows = categories.map((cat) => {
    const enabled = (cfg.categories || {})[cat] !== false;
    const score = (cfg.scores || {})[cat] ?? 1;
    return "<tr><td><span class=\"set-cat" + (enabled ? "" : " set-off") + "\">" +
      '<span class="dot" style="background:' + catColor(cat) + '"></span>' +
      escapeHtml(cat) + "</span></td><td>" +
      (enabled ? "score " + score + (score <= DATA.threshold ? " — folds now" : " — visible now") : "disabled") +
      "</td></tr>";
  }).join("");

  const patternRows = (cfg.callPatterns || []).map((p) =>
    "<tr><td><span class=\"set-cat\">" +
    '<span class="dot" style="background:' + catColor(p.category) + '"></span>' +
    escapeHtml(p.category) + "</span></td><td>" +
    codeList(p.receivers) +
    (p.methods ? "<br>methods: " + codeList(p.methods) : "<br>methods: any") +
    "</td></tr>",
  ).join("");

  settingsBody.innerHTML =
    '<div class="set-section"><h3>config source</h3><div class="set-source">' +
    (DATA.configSource
      ? "built-in lens.defaults.json + <code>" + escapeHtml(DATA.configSource) + "</code>"
      : "built-in lens.defaults.json (no .lens.json found)") +
    "</div></div>" +

    '<div class="set-section"><h3>this session</h3><table class="set-table">' +
    "<tr><td>fold threshold</td><td>" + (DATA.threshold < 0 ? "off" : DATA.threshold) +
    (DATA.threshold !== cfg.threshold ? " (config: " + cfg.threshold + ")" : "") + "</td></tr>" +
    "<tr><td>theme</td><td>" + escapeHtml(DATA.theme) + "</td></tr>" +
    "<tr><td>hide tests</td><td>" + (state.hideTests ? "on" : "off") + "</td></tr>" +
    "<tr><td>hunks only</td><td>" + (state.hunksOnly ? "on" : "off") + "</td></tr>" +
    "</table></div>" +

    '<div class="set-section"><h3>categories</h3><table class="set-table">' + categoryRows + "</table></div>" +
    '<div class="set-section"><h3>call patterns</h3><table class="set-table">' + patternRows + "</table></div>" +

    '<div class="set-section"><h3>keep visible</h3>' +
    "markers: " + codeList(cfg.keepCommentMarkers) +
    "<br>directive: " + codeList([cfg.keepDirective]) + "</div>" +

    '<div class="set-section"><h3>test file patterns</h3>' + codeList(cfg.testFilePatterns) + "</div>" +
    '<div class="set-section"><h3>excluded from analysis</h3>' + codeList(cfg.exclude) + "</div>" +

    '<div class="set-note">edit .lens.json and press ↻ refresh to apply changes without restarting — see the lens README for every field</div>';
}

// ---- manual refresh ----
const refreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById("refresh"));
refreshBtn.style.display = DATA.canRefresh ? "" : "none";
refreshBtn.onclick = async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "…";
  try {
    const res = await fetch("/api/refresh?theme=" + encodeURIComponent(DATA.theme));
    if (!res.ok) throw new Error("http " + res.status);
    const payload = await res.json();
    const activePath = DATA.files[state.active]?.file;
    // tabs survive a refresh by path; files gone from the new analysis drop out
    const tabPaths = state.tabs.map((t) => ({ path: DATA.files[t.index]?.file, pinned: t.pinned }));
    const userThreshold = DATA.threshold; // slider choice survives a refresh
    Object.assign(DATA, payload);
    DATA.threshold = userThreshold;
    sourceLineCache.clear(); // sources may have changed
    state.tabs = tabPaths
      .map((t) => ({ index: DATA.files.findIndex((f) => f.file === t.path), pinned: t.pinned }))
      .filter((t) => t.index >= 0);
    let idx = DATA.files.findIndex((f) => f.file === activePath);
    if (idx === -1) idx = state.tabs[0]?.index ?? firstTreeFile();
    if (idx >= 0) ensureTab(idx);
    state.active = idx;
    applyThemeColors(DATA.fg, DATA.bg);
    themeSelect.value = DATA.theme;
    thresholdSelect.value = String(DATA.threshold);
    renderThresholdTip();
    syncDiffControls();
    syncLabel();
    syncViewSwitch();
    render();
  } catch (err) {
    console.error("refresh failed:", err);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "↻ refresh";
  }
};

// ---- end session: stop the server and leave a farewell page ----
document.getElementById("end-session").onclick = async (ev) => {
  /** @type {HTMLButtonElement} */ (ev.target).disabled = true;
  try {
    await fetch("/api/shutdown", { method: "POST" });
  } catch { /* the server may drop the connection while dying — that's success */ }
  document.body.innerHTML =
    '<div class="ended">session ended — the lens server has stopped, you can close this tab</div>';
};

// expand/collapse all keep the category chips in sync with the regions — the
// folds on screen, in the code view or a summary unit alike
document.getElementById("expand-all").onclick = () => {
  // the code view's whole file, folds inside collapsed hunk gaps included; a summary unit's folds on screen
  const file = state.view === "code" ? DATA.files[state.active] : null;
  if (file) for (const r of file.regions) state.hiddenCategories.add(r.category);
  /** @type {NodeListOf<HTMLElement>} */ (foldScope().querySelectorAll(".region")).forEach((el) => {
    state.hiddenCategories.add(el.dataset.cat);
    el.classList.add("open");
  });
  togglesEl.querySelectorAll("input").forEach(b => (b.checked = true));
};
document.getElementById("collapse-all").onclick = () => {
  state.hiddenCategories.clear();
  togglesEl.querySelectorAll("input").forEach(b => (b.checked = false));
  foldScope().querySelectorAll(".region").forEach(el => el.classList.remove("open"));
};

// ---- global search (⌘P) ----
const searchModal = /** @type {HTMLDialogElement} */ (document.getElementById("search-modal"));
const searchInput = /** @type {HTMLInputElement} */ (document.getElementById("search-input"));
const searchResultsEl = document.getElementById("search-results");
const searchWordBox = /** @type {HTMLInputElement} */ (document.getElementById("search-word"));
const searchCaseBox = /** @type {HTMLInputElement} */ (document.getElementById("search-case"));
const SEARCH_LIMIT = 500;

// Plain-text lines per file, split lazily once — sources never change between refreshes.
const sourceLineCache = new Map();
function sourceLines(fileIndex) {
  let lines = sourceLineCache.get(fileIndex);
  if (!lines) {
    lines = (DATA.files[fileIndex].source || "").split("\n");
    sourceLineCache.set(fileIndex, lines);
  }
  return lines;
}

let searchHits = []; // { fileIndex, line (1-based), col, len }
let searchSel = 0;
// Find-usages (alt-click) jumps pin the tab being read — that search is a
// detour the reader returns from. Plain ⌘P search keeps the preview behavior.
let searchPinsOrigin = false;

function openSearch(query, opts) {
  searchPinsOrigin = !!opts?.pinOrigin;
  if (typeof query === "string") searchInput.value = query;
  if (opts) {
    searchWordBox.checked = !!opts.word;
    searchCaseBox.checked = !!opts.matchCase;
  }
  if (!searchModal.open) searchModal.showModal();
  searchInput.focus();
  searchInput.select();
  runSearch();
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function runSearch() {
  const query = searchInput.value;
  searchHits = [];
  searchSel = 0;
  if (query.trim().length < 2) {
    searchResultsEl.innerHTML = '<div class="search-empty">' + (query.trim()
      ? "keep typing — at least 2 characters"
      : "search across all " + DATA.files.length + " loaded files") + "</div>";
    return;
  }
  let body = escapeRegExp(query);
  if (searchWordBox.checked) body = "\\b" + body + "\\b";
  const re = new RegExp(body, searchCaseBox.checked ? "g" : "gi");

  outer:
  for (let i = 0; i < DATA.files.length; i++) {
    if (!visibleFile(DATA.files[i].file)) continue; // respect "hide tests"
    const lines = sourceLines(i);
    for (let ln = 0; ln < lines.length; ln++) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(lines[ln])) !== null) {
        if (m[0].length === 0) break;
        searchHits.push({ fileIndex: i, line: ln + 1, col: m.index, len: m[0].length });
        if (searchHits.length >= SEARCH_LIMIT) break outer;
      }
    }
  }
  renderSearchResults();
}

function renderSearchResults() {
  searchResultsEl.innerHTML = "";
  if (searchHits.length === 0) {
    searchResultsEl.innerHTML = '<div class="search-empty">no matches</div>';
    return;
  }
  let lastFile = -1;
  searchHits.forEach((hit, idx) => {
    if (hit.fileIndex !== lastFile) {
      lastFile = hit.fileIndex;
      const count = searchHits.filter((h) => h.fileIndex === hit.fileIndex).length;
      const head = document.createElement("div");
      head.className = "search-file";
      head.innerHTML = escapeHtml(DATA.files[hit.fileIndex].file) +
        ' <span class="count">· ' + count + "</span>";
      searchResultsEl.appendChild(head);
    }
    const text = sourceLines(hit.fileIndex)[hit.line - 1] ?? "";
    const from = hit.col > 80 ? hit.col - 60 : 0;
    const before = ((from > 0 ? "…" : "") + text.slice(from, hit.col)).replace(/^\s+/, "");
    const after = text.slice(hit.col + hit.len, hit.col + hit.len + 160);
    const row = document.createElement("div");
    row.className = "search-hit" + (idx === searchSel ? " selected" : "");
    row.dataset.idx = String(idx);
    row.innerHTML =
      '<span class="ln">' + hit.line + "</span>" +
      '<span class="preview">' + escapeHtml(before) +
      '<span class="match">' + escapeHtml(text.substr(hit.col, hit.len)) + "</span>" +
      escapeHtml(after) + "</span>";
    row.onclick = () => { searchModal.close(); jumpToLine(hit.fileIndex, hit.line); };
    searchResultsEl.appendChild(row);
  });
  if (searchHits.length >= SEARCH_LIMIT) {
    const note = document.createElement("div");
    note.className = "search-empty";
    note.textContent = "stopped at " + SEARCH_LIMIT + " matches — refine the query";
    searchResultsEl.appendChild(note);
  }
}

function moveSearchSel(delta) {
  if (searchHits.length === 0) return;
  searchSel = (searchSel + delta + searchHits.length) % searchHits.length;
  /** @type {NodeListOf<HTMLElement>} */ (searchResultsEl.querySelectorAll(".search-hit")).forEach((el) => {
    const selected = Number(el.dataset.idx) === searchSel;
    el.classList.toggle("selected", selected);
    if (selected) el.scrollIntoView({ block: "nearest" });
  });
}

searchInput.oninput = runSearch;
searchWordBox.onchange = runSearch;
searchCaseBox.onchange = runSearch;
searchInput.onkeydown = (ev) => {
  if (ev.key === "ArrowDown") { moveSearchSel(1); ev.preventDefault(); }
  else if (ev.key === "ArrowUp") { moveSearchSel(-1); ev.preventDefault(); }
  else if (ev.key === "Enter") {
    const hit = searchHits[searchSel];
    if (hit) { searchModal.close(); jumpToLine(hit.fileIndex, hit.line); }
  }
};
document.getElementById("search-btn").onclick = () => openSearch();

// Show the target line: expand a hidden hunks-gap or a fold covering it,
// scroll it centered, and flash it.
function jumpToLine(fileIndex, line) {
  // search hits and "code view ↗" can come from the Summary view
  if (state.view !== "code") setView("code");
  // Pin the preview tab being read before a find-usages jump replaces it,
  // so the target opens beside it and the reader can come back.
  if (searchPinsOrigin && fileIndex !== state.active) {
    const current = state.tabs.find((t) => t.index === state.active);
    if (current && !current.pinned) current.pinned = true;
  }
  ensureTab(fileIndex);
  state.active = fileIndex;
  const file = DATA.files[fileIndex];
  if (state.hunksOnly) {
    const { hiddenGaps } = computeHunks(file);
    const gap = hiddenGaps.find((g) => line >= g.start && line <= g.end);
    if (gap) expandedGaps.add(file.file + ":" + gap.start);
  }
  render();
  const row = codeEl.querySelector('.row[data-line="' + line + '"]');
  if (!row) return;
  const region = row.closest(".region");
  if (region) region.classList.add("open");
  row.scrollIntoView({ block: "center" });
  row.classList.remove("flash");
  void (/** @type {HTMLElement} */ (row)).offsetWidth; // restart the animation on repeated jumps to the same line
  row.classList.add("flash");
}

// ---- find usages: alt-click an identifier in the code ----
codeEl.addEventListener("click", (ev) => {
  if (!ev.altKey) return;
  if (ev.target instanceof Element && ev.target.closest(".pill-row, .row.gap, .num")) return;
  let node = null, offset = 0;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(ev.clientX, ev.clientY);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
    if (range) { node = range.startContainer; offset = range.startOffset; }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent;
  const WORD = /[A-Za-z0-9_$]/;
  let start = offset, end = offset;
  while (start > 0 && WORD.test(text[start - 1])) start--;
  while (end < text.length && WORD.test(text[end])) end++;
  const word = text.slice(start, end);
  if (!word || /^\d+$/.test(word)) return;
  ev.preventDefault();
  openSearch(word, { word: true, matchCase: true, pinOrigin: true });
});

// ---- keyboard shortcuts ----
const keysModal = /** @type {HTMLDialogElement} */ (document.getElementById("keys-modal"));
document.getElementById("keys-btn").onclick = () => keysModal.showModal();

/**
 * The top file of the tree as displayed (dirs first, sorted). When the tree
 * hides every file (all tests, "hide tests" on) it's still the first file, so
 * the code pane can say why nothing shows; -1 only when there are no files.
 */
function firstTreeFile() {
  renderNav(); // rebuilds navOrder
  if (navOrder.length > 0) return navOrder[0];
  const visible = DATA.files.findIndex((f) => visibleFile(f.file));
  return visible >= 0 ? visible : DATA.files.length > 0 ? 0 : -1;
}

function openFirstTreeFile() {
  const first = firstTreeFile();
  if (first < 0) return;
  state.tabs = [{ index: first, pinned: false }];
  state.active = first;
}

function stepFile(direction) {
  // Walk the tree exactly as displayed (dirs-first, sorted, collapsed dirs
  // skipped); when the tree is hidden, fall back to plain file order.
  const order = navOrder.length > 0
    ? navOrder
    : DATA.files
        .map((f, index) => ({ index, path: f.file }))
        .filter((e) => visibleFile(e.path) && matchesFilter(e.path))
        .map((e) => e.index);
  if (order.length === 0) return;
  const pos = order.indexOf(state.active);
  openFile(pos === -1
    ? (direction > 0 ? order[0] : order[order.length - 1])
    : order[(pos + direction + order.length) % order.length]);
}

function stepThreshold(delta) {
  const next = Math.max(-1, Math.min(3, DATA.threshold + delta));
  if (next === DATA.threshold) return;
  thresholdSelect.value = String(next);
  thresholdSelect.dispatchEvent(new Event("change"));
}

document.addEventListener("keydown", (ev) => {
  // ⌘P / Ctrl+P opens the search palette from anywhere (and suppresses print)
  if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "p") {
    ev.preventDefault();
    openSearch();
    return;
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tag = ev.target instanceof Element ? ev.target.tagName : "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (document.querySelector("dialog[open]")) return; // Esc closes natively

  if (ev.key === "v" && DATA.summary) { setView(state.view === "summary" ? "code" : "summary"); return; }
  if (state.view === "summary") {
    if (ev.key === "j") { stepSummary(1); return; }
    if (ev.key === "k") { stepSummary(-1); return; }
    if (ev.key === "o") { openUnitInCode(currentUnit()); return; }
    if (ev.key === "m") { toggleUnitViewed(currentUnit()); return; }
    if (ev.key === "g") { showOverview(); return; }
    if (ev.key === "/") {
      if (state.navCollapsed) navToggle.click();
      sumFilterInput.focus();
      ev.preventDefault();
      return;
    }
    // the toolbar's keys act on the open unit's code; file and tab keys don't apply here
    if (!["?", "x", "s", "r", "e", "c", "[", "]", "h", "t", "a", "\\"].includes(ev.key)) return;
  }
  switch (ev.key) {
    case "?": keysModal.showModal(); ev.preventDefault(); break;
    case "j": stepFile(1); break;
    case "k": stepFile(-1); break;
    case "w": if (state.active >= 0) closeTab(state.active); break;
    case "m": toggleFileViewed(state.active); break;
    case "o": {
      const tab = state.tabs.find((t) => t.index === state.active);
      if (tab && !tab.pinned) { tab.pinned = true; renderTabs(); }
      break;
    }
    case "/":
      if (hasTree) {
        if (state.navCollapsed) navToggle.click();
        filterInput.focus();
        ev.preventDefault();
      }
      break;
    case "s": if (hasTree) navToggle.click(); break;
    case "e": document.getElementById("expand-all").click(); break;
    case "c": document.getElementById("collapse-all").click(); break;
    case "[": stepThreshold(-1); break;
    case "]": stepThreshold(1); break;
    case "h": if (hunksWrap.style.display !== "none") hunksBox.click(); break;
    case "x": if (removedWrap.style.display !== "none") showRemovedBox.click(); break;
    case "t": if (testsWrap.style.display !== "none") hideTestsBox.click(); break;
    case "r": if (refreshBtn.style.display !== "none") refreshBtn.click(); break;
    case "a": askOpenAndFocus(); ev.preventDefault(); break; // the "a" mustn't land in the textarea
    case "\\": askSetOpen(!askState.open); break;
  }
});
