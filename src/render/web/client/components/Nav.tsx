// The sidebar: the file tree (Code view) or the list of changes (Summary tab).

import { forwardRef, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Flow } from "../../../../summary/store.ts";
import { update, type LensState, type SignalFilter, type SignalId } from "../store.ts";
import {
  SIGNALS, flowPriority, isFlagged, listModel, navShown, signalTip, treeModel, unitLabel, unitSignals, unitViewKey,
  type Marks, type TreeDir, type TreeStatus, type Unit,
} from "../model.ts";
import { baseName, fileViewKey } from "../shared.ts";
import {
  openFile, openSummaryUnit, setSignalFilter, showOverview, toggleDir, toggleFileViewed, toggleFlow, toggleUnitViewed,
} from "../actions.ts";
import { ViewedBox } from "./widgets.tsx";

// The tree and the summary list share the sidebar's scroller: each view keeps its own position.
const navScroll = { code: 0, summary: 0 };

export const Nav = forwardRef<HTMLElement, { s: LensState }>(function Nav({ s }, ref) {
  const own = useRef<HTMLElement | null>(null);
  const summary = s.view === "summary";
  useLayoutEffect(() => { if (own.current) own.current.scrollTop = navScroll[s.view]; }, [s.view]);
  return (
    <nav
      id="nav"
      ref={(el) => { own.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
      style={{ display: navShown(s) ? undefined : "none", width: s.navWidth ? s.navWidth + "px" : undefined }}
      onScroll={(ev) => { navScroll[s.view] = ev.currentTarget.scrollTop; }}
    >
      <Filter id="file-filter" hidden={summary} placeholder="filter files…" value={s.navQuery} onChange={(navQuery) => update({ navQuery })} />
      <div id="tree" style={summary ? { display: "none" } : undefined}>{!summary && <Tree s={s} />}</div>
      <Filter wrapId="sum-filter" hidden={!summary} placeholder="filter changes…" value={s.sumQuery} onChange={(sumQuery) => update({ sumQuery })} />
      <div id="summary-list" style={summary ? undefined : { display: "none" }}>{summary && <SummaryList s={s} />}</div>
    </nav>
  );
});

function Filter({ id, wrapId, hidden, placeholder, value, onChange }: {
  id?: string; wrapId?: string; hidden: boolean; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="nav-filter" id={wrapId} style={hidden ? { display: "none" } : undefined}>
      <input
        id={id} type="text" placeholder={placeholder} spellCheck={false} autoComplete="off" value={value}
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === "Escape") { onChange(""); ev.currentTarget.blur(); } }}
      />
      <button title="clear filter (Esc)" id={id ? "filter-clear" : undefined} style={value.trim() === "" ? { display: "none" } : undefined} onClick={() => onChange("")}>✕</button>
    </div>
  );
}

// ---- the file tree ----

const STATUS_LETTER: Record<TreeStatus, string> = { added: "A", modified: "M", deleted: "D", excluded: "⊘", renamed: "R" };
const STATUS_TITLE: Record<TreeStatus, string> = {
  added: "added", modified: "modified", deleted: "deleted in this diff",
  excluded: "changed, but excluded from analysis (exclude patterns in config)",
  renamed: "renamed, content unchanged",
};

function Tree({ s }: { s: LensState }) {
  const tree = treeModel(s);
  if (!tree.hasTree) return null;
  if (tree.filter !== "" && tree.root.dirs.size === 0 && tree.root.files.length === 0) {
    return <div className="no-match">no files match "{tree.filter}"</div>;
  }
  const rows: ReactNode[] = [];
  treeRows(s, tree.root, "", 0, tree.filter, rows);
  return <>{rows}</>;
}

function treeRows(s: LensState, node: TreeDir, path: string, depth: number, filter: string, out: ReactNode[]) {
  const indent = 8 + depth * 13;
  for (const dir of node.dirs.values()) {
    const dirPath = path + dir.name + "/";
    const closed = filter === "" && s.closedDirs.has(dirPath);
    out.push(
      <div key={"d:" + dirPath} className="dir" style={{ paddingLeft: indent + "px" }} title={dirPath} onClick={() => toggleDir(dirPath)}>
        <span className={"caret" + (closed ? "" : " open")}>▸</span>{dir.name}
      </div>,
    );
    if (!closed) treeRows(s, dir, dirPath, depth + 1, filter, out);
  }
  for (const entry of node.files) {
    const letter = entry.status ? STATUS_LETTER[entry.status] : undefined;
    const index = entry.index;
    const isViewed = index !== null && s.viewedFiles.has(fileViewKey(s.data.files[index]));
    out.push(
      <button
        key={"f:" + entry.path + ":" + entry.status}
        className={"file" + (entry.status ? " " + entry.status : "") + (index !== null && index === s.active ? " active" : "") + (isViewed ? " viewed" : "")}
        style={{ paddingLeft: (indent + 13) + "px" }}
        title={entry.status === "renamed"
          ? entry.renamedFrom + " → " + entry.path + " — " + STATUS_TITLE.renamed
          : entry.path + (entry.status ? " — " + STATUS_TITLE[entry.status] : "")}
        disabled={index === null}
        onClick={index !== null ? () => openFile(index) : undefined}
        onDoubleClick={index !== null ? () => openFile(index, true) : undefined}
      >
        {/* files that can't be opened keep the box's width, so names stay aligned */}
        {index !== null ? <ViewedBox on={isViewed} onToggle={() => toggleFileViewed(index)} /> : <span className="viewed-box placeholder" />}
        <span className="fname"><Highlight name={entry.name} filter={filter} /></span>
        {letter && <span className={"status st-" + letter}>{letter}</span>}
      </button>,
    );
  }
}

// The filter match in the filename (matches on the full path may not appear here).
function Highlight({ name, filter }: { name: string; filter: string }) {
  const at = filter === "" ? -1 : name.toLowerCase().indexOf(filter);
  if (at === -1) return <>{name}</>;
  return <>{name.slice(0, at)}<span className="hl">{name.slice(at, at + filter.length)}</span>{name.slice(at + filter.length)}</>;
}

// ---- the summary list ----

/** The marker before a unit's name: its most serious signal, or nothing. */
export function Attn({ marks, u }: { marks: Marks; u: Unit }) {
  const top = unitSignals(marks, u)[0];
  if (!top) return <span />;
  return <span className={"sig sig-" + top} title={signalTip(marks, u, top)}>{SIGNALS[top].icon}</span>;
}

export function Prio({ flow }: { flow: Flow }) {
  const p = flowPriority(flow);
  const tip = p === 1 ? "review first" : p === 3 ? "mechanical — folded by default" : "normal priority";
  return <span className={"prio p" + p} title={"P" + p + ": " + tip}>P{p}</span>;
}

function SummaryList({ s }: { s: LensState }) {
  const list = listModel(s)!;
  const marks = s.concernMarks;
  // the open unit stays in sight as the reader steps through the list
  useEffect(() => {
    document.querySelector("#summary-list .sum-item.active")?.scrollIntoView({ block: "nearest" });
  }, [list.activeId, s.summaryOverview]);
  const item = (u: Unit, side: string | undefined) => {
    const sum = u.summary;
    const isViewed = s.viewedUnits.has(unitViewKey(u));
    const cls = "sum-item" + (!s.summaryOverview && u.id === list.activeId ? " active" : "") +
      (!sum ? " pending" : isFlagged(marks, u) ? "" : " routine") + (isViewed ? " viewed" : "") + " st-" + u.status;
    return (
      <button key={u.id} className={cls} data-id={u.id} title={u.id + " — " + u.status} onClick={() => openSummaryUnit(u.id)}>
        <ViewedBox on={isViewed} onToggle={() => toggleUnitViewed(u)} />
        <Attn marks={marks} u={u} />
        <span className="name">{unitLabel(u)}</span><span className="side">{side || ""}</span>
        {u.stale ? <span className="gist stale">code changed — re-run</span> : <span className="gist">{sum ? sum.gist : u.kind + " · " + u.status}</span>}
      </button>
    );
  };
  const filtered = list.text !== "" || list.signal !== null;
  const title = filtered
    ? list.shownCount + " of " + list.units.length + " changes"
    : list.units.length + (list.units.length === 1 ? " change" : " changes");
  return (
    <>
      <div className="sum-head">
        <span className="title">{title}</span>
        <span className="legend">{list.summarized === 0 ? "not summarized yet" : list.counts.any + " flagged"}</span>
      </div>
      <button className={"sum-overview-item" + (s.summaryOverview ? " active" : "")} title="the whole diff at a glance (g)" onClick={showOverview}>
        <span className="ico" />Overview<span className="key">g</span>
      </button>
      <SignalChips counts={list.counts} signal={list.signal} />
      {list.sections.map(({ flow, members }) => {
        const isFolded = list.folded.has(flow.title);
        return (
          <div key={"flow:" + flow.title} className={"sum-section" + (isFolded ? " folded" : "")}>
            <button className="sum-section-title flow" data-flow={flow.title} aria-expanded={!isFolded} onClick={() => toggleFlow(flow.title, isFolded)}>
              <span className="caret">{isFolded ? "▸" : "▾"}</span><Prio flow={flow} />
              <span className="t">{flow.title}</span>
              <span className="sub">{isFolded ? members.length + " change" + (members.length === 1 ? "" : "s") : flow.path}</span>
            </button>
            {flow.why && !isFolded && <div className="sum-why">{flow.why}</div>}
            {!isFolded && members.map((u) => item(u, flow.units[u.id]))}
          </div>
        );
      })}
      {list.others.length > 0 && (
        <div className="sum-section">
          {list.sections.length > 0 && <div className="sum-section-title"><span className="t">Other changes</span></div>}
          {list.others.map((u) => item(u, baseName(u.displayFile)))}
        </div>
      )}
      {list.shownCount === 0 && <div className="no-match">no changes match the filter</div>}
    </>
  );
}

// One toggle per signal present in the diff, plus "all flagged"
function SignalChips({ counts, signal }: { counts: Record<SignalId | "any", number>; signal: SignalFilter }) {
  if (counts.any === 0) return null;
  const chip = (id: SignalId | "any", icon: string, label: string) => (
    <button key={id} className={"sig-chip" + (id === "any" ? "" : " sig-" + id)} data-sig={id} aria-pressed={signal === id}
      title="list only these (click again for all)" onClick={() => setSignalFilter(id)}>
      <span className="si">{icon}</span>{label}<span className="n">{counts[id]}</span>
    </button>
  );
  return (
    <div className="sig-chips">
      {chip("any", "", "all flagged")}
      {(Object.keys(SIGNALS) as SignalId[]).filter((id) => counts[id] > 0).map((id) => chip(id, SIGNALS[id].icon, SIGNALS[id].many))}
    </div>
  );
}
