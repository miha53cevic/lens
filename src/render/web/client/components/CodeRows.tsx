// The rows of a code plan (rows.ts) — the Code view's file and a summary unit's code alike.

import { memo, type CSSProperties, type ReactNode } from "react";
import type { FoldRegion } from "../../../../model.ts";
import type { CodeItem } from "../rows.ts";
import { catColor } from "../shared.ts";
import { expandGap, toggleRegion } from "../actions.ts";
import { isRegionOpen } from "../model.ts";
import type { LensState } from "../store.ts";

/** What a view adds to its rows, by label ("N12" a new-side line, "O5" a removed one). */
export interface RowMarks {
  /** extra classes per row */
  classes?: ReadonlyMap<string, string>;
  /** notes under a row, like review comments */
  notes?: ReadonlyMap<string, ReactNode[]>;
}

interface Props {
  s: LensState;
  /** The file the rows are from: folds open and close by its path */
  path: string;
  items: CodeItem[];
  lines: string[];
  changed: ReadonlySet<number>;
  gutter: number;
  marks?: RowMarks;
}

export function CodeRows({ s, path, items, lines, changed, gutter, marks }: Props) {
  const rows: ReactNode[] = [];
  items.forEach((it, i) => rows.push(...itemNodes(it, i, { s, path, lines, changed, gutter, marks })));
  return <>{rows}</>;
}

type Ctx = Omit<Props, "items">;

function itemNodes(it: CodeItem, i: number, ctx: Ctx): ReactNode[] {
  const { lines, changed, gutter, marks } = ctx;
  if (it.kind === "line") {
    const label = "N" + it.line;
    return withNotes(label, marks, <Line key={label} line={it.line} html={lines[it.line - 1] ?? ""} changed={changed.has(it.line)} gutter={gutter} extra={marks?.classes?.get(label)} />);
  }
  if (it.kind === "removed") {
    const label = "O" + it.old;
    return withNotes(label, marks, <Removed key={label} text={it.text} old={it.old} gutter={gutter} extra={marks?.classes?.get(label)} />);
  }
  if (it.kind === "gap") return [<Gap key={it.key} count={it.end - it.start + 1} gapKey={it.key} gutter={gutter} />];
  if (it.kind === "break") {
    return [
      <div key={"break" + i} className="row unit-gap">
        <span className="num">{"⋯".padStart(gutter)}</span><span className="mark" /><span />
      </div>,
    ];
  }
  return [<Region key={"R" + it.region.startLine} region={it.region} body={it.body} ctx={ctx} />];
}

function withNotes(label: string, marks: RowMarks | undefined, row: ReactNode): ReactNode[] {
  return [row, ...(marks?.notes?.get(label) ?? [])];
}

function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// Rows re-render only when their own props change: a fold level or a selection change
// touches a few rows, not the whole file.
const Line = memo(function Line({ line, html, changed, gutter, extra }: { line: number; html: string; changed: boolean; gutter: number; extra?: string }) {
  return (
    <div className={cls("row", extra)} data-line={line}>
      <span className="num">{String(line).padStart(gutter)}</span>
      <span className={cls("mark", changed && "changed")} />
      <span dangerouslySetInnerHTML={{ __html: html || " " }} />
    </div>
  );
});

const Removed = memo(function Removed({ text, old, gutter, extra }: { text: string; old: number; gutter: number; extra?: string }) {
  return (
    // its old-side line: cites and the Ask rail point at it
    <div className={cls("row removed", extra)} data-old={old}>
      <span className="num">{"−".padStart(gutter)}</span>
      <span className="mark" />
      <span>{text || " "}</span>
    </div>
  );
});

/** A removed line with nothing to point at (a renamed unit's old code). */
export function RemovedRow({ text, gutter }: { text: string; gutter: number }) {
  return (
    <div className="row removed">
      <span className="num">{"−".padStart(gutter)}</span>
      <span className="mark" />
      <span>{text || " "}</span>
    </div>
  );
}

function Gap({ count, gapKey, gutter }: { count: number; gapKey: string; gutter: number }) {
  return (
    <div className="row gap" title="click to expand" onClick={() => expandGap(gapKey)}>
      <span className="num">{"⋯".padStart(gutter)}</span>
      <span className="mark" />
      <span>{"⋯ " + count + " unchanged line" + (count === 1 ? "" : "s")}</span>
    </div>
  );
}

function Region({ region, body, ctx }: { region: FoldRegion; body: CodeItem[]; ctx: Ctx }) {
  const { s, path, changed, gutter, marks } = ctx;
  let touchesChange = false;
  for (let l = region.startLine; l <= region.endLine; l++) if (changed.has(l)) touchesChange = true;
  const rows: ReactNode[] = [];
  body.forEach((it, i) => rows.push(...itemNodes(it, i, ctx)));
  const hasNote = !!marks?.notes && body.some((it) =>
    (it.kind === "line" && marks.notes!.has("N" + it.line)) || (it.kind === "removed" && marks.notes!.has("O" + it.old)));
  return (
    <div
      className={cls("region", isRegionOpen(s, path, region) && "open", region.score > s.threshold && "pinned", hasNote && "has-note")}
      data-cat={region.category}
      data-score={region.score}
    >
      <div className="row pill-row" onClick={() => toggleRegion(path, region)}>
        <span className="num">{String(region.startLine).padStart(gutter)}</span>
        {/* the changed-lines gutter bar shows on the pill too, so collapsed changes stay scannable in the margin */}
        <span className={cls("mark", touchesChange && "changed")} />
        <span className="pill" style={{ "--cat": catColor(region.category) } as CSSProperties}>
          <span className="caret">▸</span><span className="cat">{region.category}</span>{region.summary}
        </span>
      </div>
      <div className="body">{rows}</div>
    </div>
  );
}
