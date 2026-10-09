// The Summary tab's pane: "No summary yet", the overview, or one unit — its headline, concerns,
// When / Before / Now, callers it may break, and its code (CodeRows, as in the Code view).

import clsx from "clsx";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Concern, Flow } from "../../../../summary/store.ts";
import type { SummaryView } from "../../../../summary/view.ts";
import type { ConcernMark, LensState, SignalFilter } from "../store.ts";
import {
  SIGNALS, concernLabel, concernMark, currentUnit, flowPriority, groupUnits, isFlagged, listModel, openConcerns,
  summaryPage, unitLabel, unitPlan, unitSignals, unitViewKey, type Section, type Unit,
} from "../model.ts";
import { baseName, linesFromTokens, plural } from "../shared.ts";
import {
  flashCited, openSummaryUnit, openUnitInCode, setConcernMark, setOverviewTab, setSignalFilter, showOverview,
  toggleUnitViewed,
} from "../actions.ts";
import { askSelLabels } from "../ask.ts";
import { CodeRows, RemovedRow } from "./CodeRows.tsx";
import { Attn, Prio } from "./Nav.tsx";
import { Info } from "./widgets.tsx";

export function SummaryPane({ s }: { s: LensState }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = s.view === "summary";
  const page = shown ? summaryPage(s) : null;
  const u = page === "unit" ? currentUnit(s) : null;
  // a new page starts at the top; the same one again (a toggle, a verdict) keeps the reader's place
  const pageKey = page === "unit" ? "unit:" + (u?.id ?? "") : page;
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [pageKey]);
  return (
    <div
      ref={ref} className="summary-pane" id="summary-pane" style={shown ? undefined : { display: "none" }}
      data-browsing={s.summaryBrowsing ? "1" : undefined} data-unit={u?.id}
    >
      {page === "empty" && <Empty summary={s.data.summary!} />}
      {page === "overview" && <Overview s={s} summary={s.data.summary!} />}
      {page === "unit" && (u ? <UnitPage key={u.id} s={s} u={u} /> : <div className="sum-empty">nothing changed</div>)}
    </div>
  );
}

function Empty({ summary }: { summary: SummaryView }) {
  const [copy, setCopy] = useState("copy");
  return (
    <div className="sum-empty">
      <h2>No summary yet</h2>
      <p>Your coding agent writes the summary. Run this in it:</p>
      <div className="cmd">
        <span>{summary.command}</span>
        <button id="copy-cmd" onClick={async () => {
          try { await navigator.clipboard.writeText(summary.command); setCopy("copied"); } catch { setCopy("select + copy"); }
        }}>{copy}</button>
      </div>
      <p>
        Without the skill, any agent with a shell can follow <code>{summary.cli}</code>.{" "}
        When it's done, come back here: the Summary tab gets a dot, or press ↻ refresh.
      </p>
      {/* the overview's map and by-file lanes need no summary, so browsing starts there */}
      <p><button id="browse-units" onClick={showOverview}>browse the {summary.units.length} changes without a summary</button></p>
    </div>
  );
}

// ---- the overview: counts, the agent's account of the diff, each flow by layer ----

const AGENT_NOTE = "The agent's judgement — lens doesn't verify it.";

function Overview({ s, summary }: { s: LensState; summary: SummaryView }) {
  const marks = s.concernMarks;
  const list = listModel(s)!;
  const units = list.units; // hide tests: the stats follow the lanes
  const files = new Set(units.map((u) => u.displayFile)).size;
  const flagged = units.filter((u) => isFlagged(marks, u)).length;
  const callers = new Set(units.flatMap((u) => u.summary
    ? u.summary.breaks.flatMap((b) => b.callers.map((c) => c.file + ":" + c.line)) : [])).size;
  const stale = units.filter((u) => u.stale).length;
  const bugs = units.reduce((n, u) => n + openConcerns(marks, u).filter((c) => c.kind === "bug").length, 0);
  const shown = (u: Unit) => units.includes(u);
  const { sections, others } = groupUnits(summary, marks, shown);
  const lower = s.overviewTab === "map" ? mapLanes(s, units) : flowLanes(s, sections, others);
  const o = summary.overview;
  return (
    <div className="sum-inner">
      <div className="ov-stats">
        <Stat value={units.length} tone="">{(units.length === 1 ? "change" : "changes") + " in " + plural(files, "file")}</Stat>
        <Stat value={sections.length} tone="">{sections.length === 1 ? "flow" : "flows"}</Stat>
        <FilterStat value={bugs} tone="red" sig="bug" signal={list.signal}>
          {"possible " + (bugs === 1 ? "bug " : "bugs ")}
          <Info title="possible bugs" note={AGENT_NOTE}>
            What the agent suspects is wrong. You decide: mark each one real or dismiss it on the change's page.
            Dismissed ones don't count here. Click the number to list only the changes that have one.
          </Info>
        </FilterStat>
        <FilterStat value={flagged} tone="amber" sig="any" signal={list.signal}>
          {"flagged "}
          <Info title="flagged" note={AGENT_NOTE}>
            Changes with a reason to look closely: a possible bug (⚠), a risk (!), a question (?) the agent raised, or
            callers outside the diff it may break (↗). Dismissed concerns don't count. Click the number to list only these.
          </Info>
        </FilterStat>
        <Stat value={callers} tone="amber">
          {"callers outside the diff "}
          <Info title="callers outside the diff">
            Call sites the diff didn't touch that the agent found may break. Each one is checked: the line exists and mentions the changed unit.
          </Info>
        </Stat>
        <Stat value={stale} tone="amber">
          {"stale "}
          <Info title="stale">Changes whose code moved on since they were summarized. Run the summary again to update them.</Info>
        </Stat>
      </div>
      {o ? (
        <>
          <div className="ov-what">
            <div className="ov-what-label">Agent summary</div>
            {o.what.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {o.stale && <div className="sum-note stale">The diff changed since this overview was written. Run <code>{summary.command}</code> again to update it.</div>}
        </>
      ) : units.some((u) => u.summary)
        ? <div className="sum-note">No overview yet — run <code>{summary.command}</code> again to add one.</div>
        : <div className="sum-note">Not summarized yet — run <code>{summary.command}</code> in your agent.</div>}
      {/* the lower half flips between the flows and the map */}
      <div>
        <div className="ov-tabs" role="tablist">
          <button className="ov-tab" role="tab" data-tab="flows" aria-selected={s.overviewTab === "flows"} onClick={() => setOverviewTab("flows")}>Flows</button>
          <button className="ov-tab" role="tab" data-tab="map" aria-selected={s.overviewTab === "map"} onClick={() => setOverviewTab("map")}>Map</button>
          <span className="ov-tabs-note">{lower.note}</span>
        </div>
        <div className="ov-lanes">{lower.lanes}</div>
      </div>
    </div>
  );
}

function Stat({ value, tone, children }: { value: number; tone: string; children: ReactNode }) {
  return (
    <div className={clsx("ov-stat", value > 0 && tone)}>
      <div className="v">{value}</div><div className="l">{children}</div>
    </div>
  );
}

// a stat whose number filters the list by a signal
function FilterStat({ value, tone, sig, signal, children }: { value: number; tone: string; sig: "bug" | "any"; signal: SignalFilter; children: ReactNode }) {
  return (
    <div className={clsx("ov-stat", value > 0 && tone)}>
      <button className="v ov-filter" data-sig={sig} aria-pressed={signal === sig} title="list only these" disabled={value === 0} onClick={() => setSignalFilter(sig)}>{value}</button>
      <div className="l">{children}</div>
    </div>
  );
}

// Each flow laid out by layer, then the units outside any flow by file.
function flowLanes(s: LensState, sections: Section[], others: Unit[]) {
  const lanes = sections.map(({ flow, members }) => {
    // the path's steps in order, then any layer the path doesn't name
    const layers = flow.path.split("→").map((l) => l.trim()).filter(Boolean);
    for (const u of members) if (!layers.includes(flow.units[u.id])) layers.push(flow.units[u.id]);
    return (
      <div key={"flow:" + flow.title} className={"ov-lane p" + flowPriority(flow)}>
        <LaneHead title={flow.title} count={plural(members.length, "change")} flow={flow} />
        <div className="ov-layers">
          {layers.map((l) => <Column key={l} s={s} label={l} units={members.filter((u) => flow.units[u.id] === l)} />)}
        </div>
      </div>
    );
  });
  if (others.length > 0) {
    lanes.push(
      <div key="others" className="ov-lane">
        <LaneHead title={sections.length > 0 ? "Other changes" : "Changes"} count={plural(others.length, "change")} muted={sections.length > 0} />
        <div className="ov-layers files">
          {[...byFile(others)].map(([file, units]) => <Column key={file} s={s} label={baseName(file)} units={units} title={file} />)}
        </div>
      </div>,
    );
  }
  return { note: plural(sections.length, "flow"), lanes };
}

// Every change where it lives: a card per folder, a column per file, its units in file order.
function mapLanes(s: LensState, units: Unit[]) {
  const startOf = (u: Unit) => u.ranges.length > 0 ? u.ranges[0].start : (u.removals[0]?.anchor ?? 0);
  const files = byFile([...units].sort((a, b) => a.displayFile.localeCompare(b.displayFile) || startOf(a) - startOf(b)));
  const dirs = new Map<string, [string, Unit[]][]>(); // folder -> its [file, units] entries, in path order
  for (const entry of files) {
    const dir = entry[0].slice(0, entry[0].lastIndexOf("/") + 1);
    dirs.set(dir, [...(dirs.get(dir) || []), entry]);
  }
  const lanes = [...dirs].map(([dir, entries]) => {
    const count = entries.reduce((n, [, us]) => n + us.length, 0);
    return (
      <div key={"dir:" + dir} className="ov-lane">
        <LaneHead title={dir || "./"} count={plural(count, "change") + " · " + plural(entries.length, "file")} mono />
        <div className="ov-layers files">
          {entries.map(([file, us]) => <Column key={file} s={s} label={file.slice(dir.length)} units={us} title={file} />)}
        </div>
      </div>
    );
  });
  return { note: plural(files.size, "file") + " across " + plural(dirs.size, "folder"), lanes };
}

/** file -> its units, in the order given */
function byFile(units: Unit[]): Map<string, Unit[]> {
  const files = new Map<string, Unit[]>();
  for (const u of units) files.set(u.displayFile, [...(files.get(u.displayFile) || []), u]);
  return files;
}

function LaneHead({ title, count, muted, mono, flow }: { title: string; count: string; muted?: boolean; mono?: boolean; flow?: Flow }) {
  return (
    <div className="ov-lane-h">
      {flow && <Prio flow={flow} />}
      <span className={clsx("t", muted && "muted", mono && "mono")}>{title}</span>
      {flow?.why && <span className="why">{flow.why}</span>}
      <span className="n">{count}</span>
    </div>
  );
}

function Column({ s, label, units, title }: { s: LensState; label: string; units: Unit[]; title?: string }) {
  return (
    <div className="ov-layer">
      <div className="ov-layer-l" title={title || undefined}>{label}</div>
      {units.map((u) => <Chip key={u.id} s={s} u={u} />)}
    </div>
  );
}

// A unit as a tag (overview and map): status stripe, tinted by its top signal, dimmed once viewed.
function Chip({ s, u }: { s: LensState; u: Unit }) {
  const top = unitSignals(s.concernMarks, u)[0];
  return (
    <button
      className={clsx("ov-chip", "st-" + u.status, top && "look sig-" + top, s.viewedUnits.has(unitViewKey(u)) && "viewed")}
      data-id={u.id} title={u.summary ? u.summary.headline : u.id} onClick={() => openSummaryUnit(u.id)}
    >
      <span className="st-bar" /><span className="cn">{unitLabel(u)}</span>
      {top && <Attn marks={s.concernMarks} u={u} />}
    </button>
  );
}

// ---- one unit ----

function UnitPage({ s, u }: { s: LensState; u: Unit }) {
  const sum = u.summary;
  const command = s.data.summary!.command;
  const marks = s.concernMarks;
  const [hover, setHover] = useState<string | null>(null);
  const [openBreaks, setOpenBreaks] = useState<ReadonlySet<string>>(new Set());
  const flip = (key: string) => setOpenBreaks((set) => { const next = new Set(set); if (!next.delete(key)) next.add(key); return next; });
  const fileIndex = s.data.files.findIndex((f) => f.file === u.displayFile);
  return (
    <div className="sum-inner">
      {sum ? <h1 className="sum-headline">{sum.headline}</h1> : <h1 className="sum-headline pending">{unitLabel(u)}</h1>}
      {u.stale
        ? <div className="sum-note stale">The code changed since this was summarized. Run <code>{command}</code> again to update it.</div>
        : !sum && <div className="sum-note">Not summarized yet — run <code>{command}</code> in your agent.</div>}
      {sum && sum.concerns.length > 0 && (
        <div className="concerns">
          {sum.concerns.map((c, i) => {
            const mark = concernMark(marks, u, c);
            return (
              <div key={i} className={clsx("concern", "k-" + c.kind, mark)}>
                <span className="ic">{SIGNALS[c.kind].icon}</span><span className="kind">{concernLabel(c, mark)}</span>
                <Cite label={c.line} />
                <Verdict u={u} c={c} i={i} mark={mark} />
                <div className="text">{c.text}</div>
              </div>
            );
          })}
        </div>
      )}
      {sum && sum.changes.length > 0 && (
        <div className="chg">
          <div className="chg-label"><span className="t">What behaves differently</span><span className="cap">situations where the code now does something else</span></div>
          {sum.changes.map((c, i) => (
            // hovering a scenario points at the line that causes it
            <div key={i} className="scn" data-line={c.line} onMouseEnter={() => setHover(c.line)} onMouseLeave={() => setHover(null)}>
              <div className="scn-h"><span className="w">when</span><span className="sit">{c.when}</span><Cite label={c.line} /></div>
              {c.before && <div className="scn-l was"><span className="s">−</span><span className="tx">{c.before}</span></div>}
              <div className="scn-l is">
                <span className="s">+</span>
                <span>{!c.before && <span className="new-b" title="behavior that didn't exist before">new</span>}{c.now}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {sum && sum.breaks.length > 0 && (
        <div className="breaks">
          {sum.breaks.map((b, bi) => {
            const open = openBreaks.has("b" + bi);
            return [
              <button key={"h" + bi} className="brk-head" data-brk={bi} onClick={() => flip("b" + bi)}>
                <span className="pk">{open ? "▾" : "▸"}</span>↗ {b.summary}
              </button>,
              <div key={"c" + bi} className="brk-callers" data-brk={bi} style={open ? undefined : { display: "none" }}>
                {b.callers.map((c, ci) => {
                  const peek = bi + "-" + ci;
                  const peekOpen = openBreaks.has("p" + peek);
                  return [
                    <button key={"c" + ci} className="caller" data-peek={peek} onClick={() => flip("p" + peek)}>{(peekOpen ? "▾ " : "▸ ") + c.file + ":" + c.line}</button>,
                    <div key={"p" + ci} className="peek" data-peek={peek} style={peekOpen ? undefined : { display: "none" }}>
                      {c.lines.map((l) => (
                        <div key={l.n} className={clsx("row", l.n === c.line && "call")}>
                          <span className="num">{l.n}</span><span className="mark" /><span>{l.text || " "}</span>
                        </div>
                      ))}
                    </div>,
                  ];
                })}
              </div>,
            ];
          })}
        </div>
      )}
      <div className="unit-head">
        <span className="path" title={u.id}>{u.displayFile}</span>
        <span className={"status " + u.status}>{u.status + (u.formattingOnly ? " · formatting only" : "")}</span>
        <label className="control" title="mark this change as viewed (m)">
          <input type="checkbox" id="sum-viewed" checked={s.viewedUnits.has(unitViewKey(u))} onChange={() => toggleUnitViewed(u)} /> viewed
        </label>
        {fileIndex >= 0 && u.ranges.length > 0 && <button id="open-in-code" title="open in the code view (o)" onClick={() => openUnitInCode(u)}>code view ↗</button>}
      </div>
      <UnitCode s={s} u={u} hover={hover} />
    </div>
  );
}

function UnitCode({ s, u, hover }: { s: LensState; u: Unit; hover: string | null }) {
  const sum = u.summary;
  const plan = unitPlan(s, u);
  // what the rows carry: the lines the When / Before / Now rows point at, each open concern
  // (its row flagged, a note under it like a review comment), the Ask selection, the hovered cite
  const classes = new Map<string, string>();
  const add = (label: string, cls: string) => classes.set(label, (classes.has(label) ? classes.get(label) + " " : "") + cls);
  for (const c of sum ? sum.changes : []) add(c.line, "cited");
  const notes = new Map<string, ReactNode[]>();
  (sum ? sum.concerns : []).forEach((c, i) => {
    const mark = concernMark(s.concernMarks, u, c);
    if (mark === "dismissed") return;
    add(c.line, "flagged k-" + c.kind);
    notes.set(c.line, [...(notes.get(c.line) ?? []), (
      <div key={"note" + i} className={clsx("inline-note", "k-" + c.kind, mark)}>
        <div className="n-top"><b>{SIGNALS[c.kind].icon + " " + concernLabel(c, mark)}</b><Verdict u={u} c={c} i={i} mark={mark} /></div>
        <div className="n-text">{c.text}</div>
      </div>
    )]);
  });
  for (const label of askSelLabels(s)) add(label, "ask-sel");
  if (hover) add(hover, "hover-cite");
  return (
    <div className="unit-code">
      <div className="code">
        <CodeRows
          s={s} path={u.displayFile} items={plan.items} lines={plan.file ? linesFromTokens(plan.file) : []}
          changed={new Set(u.changedLines)} gutter={plan.gutter} marks={{ classes, notes }}
        />
        {u.renamedFrom && (
          <>
            <div className="renamed-from">was {u.renamedFrom.id}</div>
            {u.renamedFrom.removals.flatMap((b, bi) => b.lines.map((text, i) => <RemovedRow key={bi + ":" + i} text={text} gutter={plan.gutter} />))}
          </>
        )}
      </div>
    </div>
  );
}

// The reader's call on one concern: real, or dismiss (which hides it from counts and the code)
function Verdict({ u, c, i, mark }: { u: Unit; c: Concern; i: number; mark: ConcernMark | null }) {
  const btn = (value: ConcernMark, label: string, tip: string) => (
    <button className={"vbtn v-" + value} data-ci={i} data-mark={value} aria-pressed={mark === value} title={tip} onClick={() => setConcernMark(u, c, value)}>{label}</button>
  );
  if (mark === "dismissed") return <span className="verdict">{btn("dismissed", "↺ Restore", "bring it back")}</span>;
  return (
    <span className="verdict" role="group" aria-label="your call">
      {btn("real", "✓ Real", mark === "real" ? "undo: back to unreviewed" : "you checked: it's a real problem")}
      {btn("dismissed", "✕ Dismiss", "not a problem: hides it from the code and the counts")}
    </span>
  );
}

function Cite({ label }: { label: string }) {
  return (
    <button className="cite" data-line={label} title="show this line in the code below" onClick={() => flashCited(label)}>
      {label.startsWith("O") ? "−" + label.slice(1) : "L" + label.slice(1)}
    </button>
  );
}
