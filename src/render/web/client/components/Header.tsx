// The header: the top bar (view switch, stats, session buttons) and the toolbar (folds, toggles).

import type { CSSProperties } from "react";
import type { LensState } from "../store.ts";
import { update } from "../store.ts";
import { activeFile, filePlan, foldedCount, planRegions, summaryPage, currentUnit, treeModel, unitPlan } from "../model.ts";
import { catColor, fileViewKey, isDiffMode, listedOnlyCount, writePref } from "../shared.ts";
import {
  collapseAll, endSession, expandAll, openSearch, refresh, setCategoryOpen, setHideTests, setHunksOnly,
  setShowRemoved, setThreshold, setView, switchTheme, toggleFileViewed, toggleNav,
} from "../actions.ts";
import { askSetOpen } from "../ask.ts";

const hidden = (hide: boolean): CSSProperties | undefined => (hide ? { display: "none" } : undefined);

export function Header({ s }: { s: LensState }) {
  return (
    <header>
      <TopBar s={s} />
      <Toolbar s={s} />
    </header>
  );
}

function TopBar({ s }: { s: LensState }) {
  const { data } = s;
  const summary = s.view === "summary";
  const showToggle = summary || treeModel(s).hasTree;
  return (
    <div className="bar">
      <button id="nav-toggle" className="icon" title="toggle the file tree" style={hidden(!showToggle)} onClick={toggleNav}>&#9776;</button>
      <div className="brand">lens</div>
      {/* PR mode: "owner/repo#N — title" */}
      <span className="pr-label" id="pr-label" style={hidden(!data.label)} title={data.label || ""}>{data.label || ""}</span>
      <div className="view-switch" id="view-switch" style={hidden(!data.summary)} role="group" aria-label="view">
        <button id="view-code" aria-pressed={!summary} title="the diff, folded (v)" onClick={() => setView("code")}>Code</button>
        <button id="view-summary" aria-pressed={summary} title="one changed function at a time, summarized by your agent (v)" onClick={() => setView("summary")}>
          Summary<span className="new-dot" id="summary-dot" style={hidden(!s.summaryDot)} title="a new summary is available" />
        </button>
      </div>
      <span className="stats" id="stats" style={summary ? { visibility: "hidden" } : undefined}>{statsText(s)}</span>
      <span className="spacer" />
      <button id="ask-btn" aria-pressed={s.ask.open} title="ask your agent about the code (a · hide with \)" onClick={() => askSetOpen(!s.ask.open)}>Ask</button>
      <button id="search-btn" className="icon" title="search in files (⌘P)" onClick={() => openSearch()}>⌕</button>
      <select
        id="theme-select" title="color theme" value={data.theme} disabled={s.themeBusy}
        onChange={async (ev) => { if (await switchTheme(ev.target.value)) writePref("lens.theme", ev.target.value); }}
      >
        {data.themes.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <button id="settings-btn" className="icon" title="current settings" onClick={() => update({ settingsOpen: true })}>⚙</button>
      <button id="keys-btn" className="icon" title="keyboard shortcuts (?)" onClick={() => update({ keysOpen: true })}>?</button>
      <button id="refresh" title="re-run the analysis" style={hidden(!data.canRefresh)} disabled={s.refreshing} onClick={refresh}>
        {s.refreshing ? "…" : "↻ refresh"}
      </button>
      <button id="end-session" title="stop the lens server" onClick={(ev) => { ev.currentTarget.disabled = true; endSession(); }}>⏻ end</button>
    </div>
  );
}

function statsText(s: LensState): string {
  const file = activeFile(s);
  if (!file) return "";
  const changed = isDiffMode(s.data) ? s.data.files.length + listedOnlyCount(s.data) : 0;
  const folded = foldedCount(file, s.threshold);
  const pct = file.lineCount ? Math.round((folded / file.lineCount) * 100) : 0;
  const hiddenLines = filePlan(s, file).hidden;
  return (changed > 0 ? changed + (changed === 1 ? " file" : " files") + " changed · " : "") +
    file.file + " — " + file.lineCount + " lines, " + folded + " folded (−" + pct + "%)" +
    (hiddenLines > 0 ? " · " + hiddenLines + " unchanged hidden" : "");
}

/** The categories that fold in the code on screen: the file's, or the open unit's code's. */
function chipCategories(s: LensState): string[] {
  if (s.view === "code") {
    const file = activeFile(s);
    return file ? [...new Set(file.regions.map((r) => r.category))] : [];
  }
  const u = summaryPage(s) === "unit" ? currentUnit(s) : null;
  return u ? [...new Set(planRegions(unitPlan(s, u).items).map((r) => r.category))] : [];
}

function Toolbar({ s }: { s: LensState }) {
  const categories = chipCategories(s);
  const diff = isDiffMode(s.data);
  const file = activeFile(s);
  const showViewed = s.view === "code" && !!file;
  return (
    <div className="bar toolbar">
      <div className="toggles" id="toggles">
        {categories.length > 0 && <span className="show-label">FOLDS</span>}
        {categories.map((cat) => (
          <label key={cat} className="chip" style={{ "--cat": catColor(cat) } as CSSProperties} title={"toggle " + cat + " regions expanded"}>
            <input type="checkbox" checked={s.openCats.has(cat)} onChange={(ev) => setCategoryOpen(cat, ev.target.checked)} />
            <span className="dot" />
            {cat}
          </label>
        ))}
      </div>
      <span className="spacer" />
      <label className="control" id="tests-wrap" style={hidden(!treeModel(s).testsPresent)} title="hide files matching the configured test patterns (*.spec.*, *.test.*, ...)">
        <input type="checkbox" id="hide-tests" checked={s.hideTests} onChange={(ev) => setHideTests(ev.target.checked)} /> hide tests
      </label>
      <label className="control" id="hunks-wrap" style={hidden(!diff)} title="show only changed hunks with 3 lines of context, like a PR diff">
        <input type="checkbox" id="hunks-only" checked={s.hunksOnly} onChange={(ev) => setHunksOnly(ev.target.checked)} /> hunks only
      </label>
      <label className="control" id="removed-wrap" style={hidden(!diff)}>
        <input type="checkbox" id="show-removed" checked={s.showRemoved} onChange={(ev) => setShowRemoved(ev.target.checked)} /> removed lines
      </label>
      <label className="control" id="threshold-control">
        fold ≤{" "}
        <select id="threshold" title="fold regions scored at or below this level" value={String(s.threshold)} onChange={(ev) => setThreshold(Number(ev.target.value))}>
          <option value="-1">off</option>
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
        <span className="info" id="threshold-info" aria-label="what each fold level shows">&#9432;{" "}
          <ThresholdTip s={s} />
        </span>
      </label>
      <div className="vdivider" />
      <button id="expand-all" onClick={expandAll}>expand all</button>
      <button id="collapse-all" onClick={collapseAll}>collapse all</button>
      <div className="vdivider" id="viewed-divider" style={hidden(!showViewed)} />
      <label className="control" id="viewed-wrap" style={hidden(!showViewed)} title="mark this file as viewed (m)">
        <input type="checkbox" id="viewed" checked={!!file && s.viewedFiles.has(fileViewKey(file))} onChange={() => toggleFileViewed(s.active)} /> viewed
      </label>
    </div>
  );
}

// What each fold level folds in THIS run: the lowest score seen per category across all files.
function ThresholdTip({ s }: { s: LensState }) {
  const scores = new Map<string, number>();
  for (const f of s.data.files) {
    for (const r of f.regions) scores.set(r.category, Math.min(scores.get(r.category) ?? 99, r.score));
  }
  const rows = [{ level: -1, label: "off", text: "nothing folds — the plain file" }];
  for (let t = 0; t <= 3; t++) {
    const added = [...scores].filter(([, sc]) => sc === t).map(([c]) => c);
    rows.push({ level: t, label: String(t), text: added.length ? (t > 0 ? "also " : "") + added.join(", ") : "nothing new at this level" });
  }
  return (
    <span className="tip" id="threshold-tip">
      <div className="tip-title">what folds at each level</div>
      {rows.map((r) => (
        <div key={r.level} className={"tip-row" + (r.level === s.threshold ? " current" : "")}>
          <span className="lvl">{r.label}</span><span>{r.text}</span>
        </div>
      ))}
      <div className="tip-note">TODO/FIXME comments and lens:keep regions never fold</div>
    </span>
  );
}

