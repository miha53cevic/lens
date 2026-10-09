// lens viewer: the Ask rail's logic (the rail itself is components/AskRail.tsx).

// One chat per lens session, answered by the reader's own agent through
// `lens ask listen` / `lens ask reply` — lens never calls an AI. A question is
// about the open change (the Summary tab's unit, or the Code tab's file) plus
// the reader's current code selection, if any.

import type { AskCite, AskQuestion, AskSelection } from "../../../ask/session.ts";
import { commit, getState, update, type KeptSelection, type LensState } from "./store.ts";
import { askContext, askSelection, currentUnit, unitById } from "./model.ts";
import { escapeHtml, writePref } from "./shared.ts";
import { citedRow, flashCited, jumpToLine, openFile, openSummaryUnit, setView } from "./actions.ts";

const ASK_POLL_MS = 1000;
const ASK_MAX_LINES = 400;
const ASK_GONE = "the lens viewer isn't running anymore";

let timer: ReturnType<typeof setTimeout> | null = null;
let dataJson = "";

function setAsk(patch: Partial<LensState["ask"]>) {
  update((s) => ({ ask: { ...s.ask, ...patch } }));
}

// ---- the rail ----

export function askSetOpen(open: boolean): void {
  writePref("lens.askOpen", open ? "1" : "0");
  setAsk({ open });
  if (open) askPoll();
}

/** `a`: the rail opens and its input takes the keys. */
export function askOpenAndFocus(): void {
  if (!getState().ask.open) {
    commit((s) => ({ ask: { ...s.ask, open: true } }));
    writePref("lens.askOpen", "1");
    askPoll();
  }
  document.getElementById("ask-input")?.focus();
}

export function askSetWidth(width: number): void {
  writePref("lens.askWidth", width);
  setAsk({ width });
}

export function askClearError(): void {
  if (getState().ask.error) setAsk({ error: null });
}

// ---- talking to the server ----

export function askWaiting(s: LensState): AskQuestion | null {
  const qs = s.ask.data.questions;
  const last = qs[qs.length - 1];
  return last && !last.answer ? last : null;
}

/** Polls the chat while the rail is open or a question waits for its answer. */
export async function askPoll(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const patch: Partial<LensState["ask"]> = {};
  try {
    const res = await fetch("/api/ask");
    if (res.ok) {
      if (getState().ask.error === ASK_GONE) patch.error = null; // it's back (restarted on the same port)
      const json = await res.text();
      if (json !== dataJson) {
        dataJson = json;
        patch.data = JSON.parse(json);
      }
    }
  } catch {
    // the server is gone (ctrl-c): no agent can answer, and sending would fail
    patch.data = { ...getState().ask.data, listening: false };
    patch.error = ASK_GONE;
  }
  setAsk({ ...patch, tick: getState().ask.tick + 1 }); // the wait times tick
  const s = getState();
  if (s.ask.open || askWaiting(s)) timer = setTimeout(askPoll, ASK_POLL_MS);
}

/** Sends the question to the listening agent, or puts it on the clipboard as a prompt. */
export async function askSend(text: string): Promise<"sent" | "copied" | "failed"> {
  const s = getState();
  const ctx = askContext(s)!;
  const sel = askSelection(s);
  const body = JSON.stringify({ text, file: ctx.file, unitId: ctx.unitId, label: ctx.label, selection: sel ? { file: sel.file, lines: sel.lines } : null });
  let outcome: "sent" | "copied" | "failed";
  try {
    if (s.ask.data.listening) {
      const res = await fetch("/api/ask", { method: "POST", body });
      if (!res.ok) throw new Error((await res.json()).error || "http " + res.status);
      setAsk({ error: null, sel: null });
      outcome = "sent";
    } else {
      const res = await fetch("/api/ask/prompt", { method: "POST", body });
      if (!res.ok) throw new Error((await res.json()).error || "http " + res.status);
      await navigator.clipboard.writeText((await res.json()).text);
      outcome = "copied";
    }
  } catch (err) {
    setAsk({ error: "couldn't send: " + (err as Error).message });
    outcome = "failed";
  }
  askPoll();
  return outcome;
}

// ---- the selection a question is about ----

/** "src/a.ts:43–44" — the same wording as the agent's text (src/ask/context.ts). */
export function askSelLabel(sel: AskSelection): string {
  const nums = (side: "new" | "old") => sel.lines.filter((l) => l.side === side && l.n !== null).map((l) => l.n!);
  const span = (ns: number[]) => (ns[0] === ns[ns.length - 1] ? String(ns[0]) : ns[0] + "–" + ns[ns.length - 1]);
  const fresh = nums("new"), old = nums("old");
  if (fresh.length > 0) return sel.file + ":" + span(fresh);
  if (old.length > 0) return sel.file + " (removed lines " + span(old) + ")";
  return sel.file + " (removed lines)";
}

function askSetSel(sel: KeptSelection | null) {
  if (sel === null && getState().ask.sel === null) return;
  setAsk({ sel });
}

/** The code the selection can come from in the current view. */
function askCodeRoot(s: LensState): Element | null {
  return s.view === "summary" ? document.querySelector(".summary-pane .unit-code") : document.getElementById("code");
}

// A selection that ends in the code is taken whole-line; one that moves elsewhere
// (the textarea taking focus) leaves the kept selection alone.
export function onSelectionChange(): void {
  const s = getState();
  const sel = document.getSelection();
  const root = askCodeRoot(s);
  const ctx = askContext(s);
  if (!sel || sel.rangeCount === 0 || !root || !ctx) return;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return;
  if (sel.isCollapsed) { askSetSel(null); return; }
  const rowOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(".row");
  const rows = [...root.querySelectorAll<HTMLElement>(".row")].filter((r) => !r.matches(".pill-row, .gap, .unit-gap"));
  // [first, last] row index an end of the selection covers: an end on a fold's pill takes in its
  // region; one off the rows (a ⋯ row, blank space under the code) counts as the gap between the
  // rows around it — the first row after it when it starts the range, the last before when it ends it
  const span = (node: Node, offset: number): [number, number] => {
    const row = rowOf(node);
    const i = rows.indexOf(row as HTMLElement);
    if (i >= 0) return [i, i];
    const inRegion = [...(row?.closest(".region")?.querySelectorAll<HTMLElement>(".row") ?? [])].map((r) => rows.indexOf(r)).filter((x) => x >= 0);
    if (inRegion.length > 0) return [Math.min(...inRegion), Math.max(...inRegion)];
    const at = document.createRange();
    at.setStart(node, offset);
    const after = rows.filter((r) => at.comparePoint(r, 0) < 0).length;
    return [after, after - 1];
  };
  const a = span(sel.anchorNode!, sel.anchorOffset), b = span(sel.focusNode!, sel.focusOffset);
  const from = Math.min(a[0], b[0]), to = Math.max(a[1], b[1]);
  if (from > to) { askSetSel(null); return; } // nothing but ⋯ rows and blank space
  const lines = rows.slice(from, to + 1).slice(0, ASK_MAX_LINES).map((el) => {
    const n = el.dataset.line ?? el.dataset.old;
    const text = el.lastElementChild ? el.lastElementChild.textContent ?? "" : "";
    return { n: n ? Number(n) : null, side: el.classList.contains("removed") ? "old" as const : "new" as const, text: text === " " ? "" : text };
  });
  askSetSel({ key: ctx.key, file: ctx.file, lines });
}

/** A selection from another change goes once the reader opens a different one. */
export function dropForeignSelection(): void {
  const s = getState();
  const ctx = askContext(s);
  if (s.ask.sel && (!ctx || s.ask.sel.key !== ctx.key)) setAsk({ sel: null });
}

/** The labels ("N12" / "O5") of the kept selection's rows, for the rows to tint. */
export function askSelLabels(s: LensState): Set<string> {
  const sel = askSelection(s);
  const out = new Set<string>();
  for (const l of sel ? sel.lines : []) if (l.n !== null) out.add((l.side === "old" ? "O" : "N") + l.n);
  return out;
}

// ---- answers ----

/**
 * The little markdown agents write: fenced code, paragraphs, - / 1. lists,
 * `code` and **bold**. Escaped first; valid cites become buttons.
 */
export function askMarkdown(md: string, cites: AskCite[], files: { file: string }[]): string {
  const inline = (s: string) => {
    let h = escapeHtml(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    // a cite into a file the viewer doesn't have (outside the diff) has nowhere to go: it stays text
    for (const c of cites.filter((x) => files.some((f) => f.file === x.file))) {
      // refs are plain path characters, so the escaped text holds them as is
      const ref = c.ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      h = h.replace(new RegExp("(?<![\\w./-])" + ref + "(?!\\d)", "g"),
        '<button class="cite ask-cite" data-file="' + escapeHtml(c.file) + '" data-line="' + c.line + '">' + escapeHtml(c.ref) + "</button>");
    }
    return h;
  };
  const out: string[] = [];
  const parts = md.split(/^```[^\n]*\n([\s\S]*?)^```\s*$/m);
  parts.forEach((part, i) => {
    if (i % 2 === 1) { out.push("<pre><code>" + escapeHtml(part.replace(/\n$/, "")) + "</code></pre>"); return; }
    for (const block of part.split(/\n\s*\n/)) {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length === 0) continue;
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        out.push("<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*[-*] /, "")) + "</li>").join("") + "</ul>");
      } else if (lines.every((l) => /^\s*\d+\. /.test(l))) {
        out.push("<ol>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*\d+\. /, "")) + "</li>").join("") + "</ol>");
      } else {
        out.push("<p>" + lines.map(inline).join("<br>") + "</p>");
      }
    }
  });
  return out.join("");
}

/** A cite: flash it in the open unit's code when it's there, else jump to it in the code view. */
export function askOpenCite(file: string, line: number): void {
  const s = getState();
  if (s.view === "summary") {
    const u = currentUnit(s);
    if (u && u.displayFile === file && citedRow("N" + line) && flashCited("N" + line)) return;
  }
  const index = s.data.files.findIndex((f) => f.file === file);
  if (index >= 0) jumpToLine(index, line);
}

/** A question's change chip: back to that unit, or that file. */
export function askGoto(q: AskQuestion): void {
  const s = getState();
  if (q.unitId && unitById(s.data.summary, q.unitId)) {
    setView("summary");
    openSummaryUnit(q.unitId);
    return;
  }
  const index = s.data.files.findIndex((f) => f.file === q.file);
  if (index < 0) return;
  setView("code");
  openFile(index);
}
