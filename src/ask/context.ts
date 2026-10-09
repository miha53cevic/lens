import { join } from "node:path";
import { relPath, toPosix } from "../paths.ts";
import type { ViewerInput } from "../render/web/server.ts";
import type { ViewUnit } from "../summary/view.ts";
import type { AskQuestion, AskSelection } from "./session.ts";

// The text an agent gets for a question — `lens ask listen` prints it, and the
// rail's "Copy as prompt" copies it (without the rules and the reply command).
// This file is the source of truth for that wording; the lens-ask skill only
// points here.

export const RULES = `RULES — read-only. Answer the question; do not change anything.
- Never edit, create or delete files. Never run commands that change the repo or the
  working tree (git commit/checkout/stash/reset, formatters, installs, writing builds).
- Reading is fine: open any file, search, git log/show/blame/diff.
- Asked for a fix? Describe it in the answer; don't apply it.
- If you can, answer from a read-only subagent (e.g. Claude Code's Explore agent).`;

/** Past this many lines the change is cut short — the agent can read the file. */
const MAX_CHANGE_LINES = 400;

interface ChangeRow {
  n: number | null;
  side: "new" | "old";
  text: string;
  changed: boolean;
}

/** What the question was asked about, ready to print. */
export interface ChangeContext {
  /** Repo-relative path */
  file: string;
  label: string;
  /** A unit's lines (removed ones included); null for a whole file */
  rows: ChangeRow[] | null;
  /** Whole-file questions in diff mode: the changed new-side lines */
  changedLines: number[];
  /** The shown code's git blob (PR, ref ranges): the agent reads that, not the working tree */
  blob: string | null;
}

export function changeContext(input: ViewerInput, q: Pick<AskQuestion, "file" | "unitId" | "label">): ChangeContext {
  const file = relPath(input.root, join(input.cwd, q.file));
  const source = input.files.find((f) => f.file === q.file);
  const blob = source?.blob ?? null;
  const unit = q.unitId ? input.summary?.units.find((u) => u.id === q.unitId) : undefined;
  if (unit) return { file, label: q.label, rows: unitRows(unit, source ? source.source.split("\n") : []), changedLines: [], blob };
  return { file, label: q.label, rows: null, changedLines: source?.changedLines ?? [], blob };
}

function unitRows(u: ViewUnit, lines: string[]): ChangeRow[] {
  const changed = new Set(u.changedLines);
  const rows: ChangeRow[] = [];
  const removedAfter = (anchor: number) => {
    for (const b of u.removals.filter((r) => r.anchor === anchor)) {
      b.lines.forEach((text, i) => rows.push({ n: b.oldStart + i, side: "old", text, changed: true }));
    }
  };
  if (u.ranges.length === 0) {
    for (const b of u.removals) b.lines.forEach((text, i) => rows.push({ n: b.oldStart + i, side: "old", text, changed: true }));
    return rows;
  }
  for (const r of u.ranges) {
    removedAfter(r.start - 1);
    for (let l = r.start; l <= r.end; l++) {
      rows.push({ n: l, side: "new", text: lines[l - 1] ?? "", changed: changed.has(l) });
      removedAfter(l);
    }
  }
  return rows;
}

/** "src/a.ts:43–44" for the rail and the prompt. */
export function selectionLabel(sel: AskSelection): string {
  const nums = (side: "new" | "old") => sel.lines.filter((l) => l.side === side && l.n !== null).map((l) => l.n as number);
  const fresh = nums("new");
  const old = nums("old");
  const span = (ns: number[]) => (ns[0] === ns.at(-1) ? String(ns[0]) : ns[0] + "–" + ns.at(-1));
  if (fresh.length > 0) return sel.file + ":" + span(fresh);
  if (old.length > 0) return sel.file + " (removed lines " + span(old) + ")";
  return sel.file + " (removed lines)";
}

function rowText(r: { n: number | null; side: "new" | "old"; text: string }, mark: string, width: number): string {
  return "  " + (r.n === null ? "" : String(r.n)).padStart(width) + mark + " " + r.text;
}

function ranges(nums: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? String(nums[i]) : nums[i] + "–" + nums[j]);
    i = j;
  }
  return out.join(", ");
}

export interface QuestionTextOptions {
  /** For a chat paste: no rules, no reply command */
  forCopy?: boolean;
  /** Repo root, printed so the agent knows what paths are relative to */
  root: string;
  /** Where lens runs: display paths are relative to it */
  cwd: string;
  port: number;
}

export function questionText(
  q: Pick<AskQuestion, "id" | "text" | "selection">,
  change: ChangeContext,
  opts: QuestionTextOptions,
): string {
  const out: string[] = [];
  // a whole-file question (or a whole-file unit: json, md, …) is labeled with the file's name
  const about = change.rows && change.label !== change.file.split("/").pop() ? `${change.label} (${change.file})` : change.file;
  out.push(opts.forCopy
    ? `Question about ${about}, from the lens code viewer:`
    : `lens ask · ${q.id} · ${about}\nrepo: ${toPosix(opts.root)} — paths below are relative to it`);
  if (!opts.forCopy) out.push(RULES);
  out.push("QUESTION\n" + q.text.trim());

  if (q.selection && q.selection.lines.length > 0) {
    const sel = q.selection;
    const file = relPath(opts.root, join(opts.cwd, sel.file));
    const width = Math.max(...sel.lines.map((l) => String(l.n ?? "").length), 1);
    const sides = new Set(sel.lines.map((l) => l.side));
    const what = sides.size === 2 ? "removed lines marked −" : sides.has("old") ? "removed lines" : "new side";
    out.push(`SELECTION  ${selectionLabel({ ...sel, file })} (${what})\n` +
      sel.lines.map((l) => rowText(l, l.side === "old" ? "−" : " ", width)).join("\n"));
  }

  // the viewer shows a commit's code (PR, ref range): the working tree may hold other code
  const readIt = change.blob ? `read it with \`git show ${change.blob}\` — not from disk, which may differ` : "read it from disk";
  if (change.rows) {
    const rows = change.rows.slice(0, MAX_CHANGE_LINES);
    const width = Math.max(...rows.map((r) => String(r.n ?? "").length), 1);
    const more = change.rows.length - rows.length;
    out.push(`THE CHANGE  ${change.label} — changed lines marked +, removed lines marked −\n` +
      rows.map((r) => rowText(r, r.side === "old" ? "−" : r.changed ? "+" : " ", width)).join("\n") +
      (more > 0 ? `\n  … ${more} more lines — ${readIt}` : ""));
  } else {
    out.push(`THE FILE  ${change.file}` +
      (change.changedLines.length > 0 ? ` — changed lines ${ranges(change.changedLines)}` : "") +
      `\n  (${readIt})`);
  }

  if (!opts.forCopy) {
    // straight in .lens/, which the server already made (it holds server.json)
    const answerFile = toPosix(join(opts.root, ".lens", "answer.md"));
    out.push(`ANSWER
Lead with the answer; about 120 words unless more is needed. Markdown. Cite code as
path:line (repo-relative) — lens turns valid ones into links.
Write it to ${answerFile}, then run:
  lens ask reply ${q.id} "${answerFile}" --port ${opts.port}
Then run \`lens ask listen --port ${opts.port}\` again for the next question.`);
  }
  return out.join("\n\n") + "\n";
}
