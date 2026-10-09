// lens viewer: the Ask rail.

// One chat per lens session, answered by the reader's own agent through
// `lens ask listen` / `lens ask reply` — lens never calls an AI. A question is
// about the open change (the Summary tab's unit, or the Code tab's file) plus
// the reader's current code selection, if any.

import type { AskCite, AskQuestion, AskSelection, AskState } from "../../../ask/session.ts";
import { DATA, byId, escapeHtml, readPref, state, writePref } from "./shared.ts";
import { codeEl, jumpToLine, openFile } from "./code.ts";
import { citedRow, currentUnit, flashCited, openSummaryUnit, setView, summaryPaneEl, unitById, unitLabel } from "./summary.ts";

const askBtn = byId("ask-btn");
const askRail = byId("ask-rail");
const askResizer = byId("ask-resizer");
const askThreadEl = byId("ask-thread");
const askChipsEl = byId("ask-chips");
const askInput = byId<HTMLTextAreaElement>("ask-input");
const askSendBtn = byId<HTMLButtonElement>("ask-send");
const askStatusEl = byId("ask-status");
const askHintEl = byId("ask-hint");

const ASK_POLL_MS = 1000;
const ASK_MAX_LINES = 400;
const ASK_MAX_INPUT_ROWS = 8;
const ASK_GONE = "the lens viewer isn't running anymore";

/** The reader's kept selection, tied to the change it was made in. */
type KeptSelection = AskSelection & { key: string };

export const askState = {
  open: readPref("lens.askOpen") === "1",
  data: { listening: false, questions: [] } as AskState,
  dataJson: "",
  /** The reader's last code selection: kept while they type, dropped on a plain click in the code or a new change */
  sel: null as KeptSelection | null,
  timer: null as ReturnType<typeof setTimeout> | null,
  busy: false, // a send or copy in flight
  copied: false,
  /** The last send failed (or the server is gone): shown in the hint line until the reader types again */
  error: null as string | null,
};

// ---- what a question is about ----

/** The open change: the Summary tab's unit, or the Code tab's file; null on the overview. */
function askContext() {
  if (state.view === "summary") {
    const u = currentUnit();
    return u ? { key: "u:" + u.id, file: u.displayFile, unitId: u.id as string | null, label: unitLabel(u) } : null;
  }
  const f = DATA.files[state.active];
  // the file's name: the selection chip next to it carries the full path
  return f ? { key: "f:" + f.file, file: f.file, unitId: null, label: f.file.split("/").pop()! } : null;
}

/** The code the selection can come from in the current view. */
function askCodeRoot(): Element | null {
  return state.view === "summary" ? summaryPaneEl.querySelector(".unit-code") : codeEl;
}

/** "src/a.ts:43–44" — the same wording as the agent's text (src/ask/context.ts). */
function askSelLabel(sel: AskSelection) {
  const nums = (side: "new" | "old") => sel.lines.filter((l) => l.side === side && l.n !== null).map((l) => l.n!);
  const span = (ns: number[]) => (ns[0] === ns[ns.length - 1] ? String(ns[0]) : ns[0] + "–" + ns[ns.length - 1]);
  const fresh = nums("new"), old = nums("old");
  if (fresh.length > 0) return sel.file + ":" + span(fresh);
  if (old.length > 0) return sel.file + " (removed lines " + span(old) + ")";
  return sel.file + " (removed lines)";
}

// A selection that ends in the code is taken whole-line; one that moves elsewhere
// (the textarea taking focus) leaves the kept selection alone.
document.addEventListener("selectionchange", () => {
  const sel = document.getSelection();
  const root = askCodeRoot();
  const ctx = askContext();
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
  const picked = rows.slice(from, to + 1).slice(0, ASK_MAX_LINES);
  const lines = picked.map((el) => {
    const n = el.dataset.line ?? el.dataset.old;
    const text = el.lastElementChild ? el.lastElementChild.textContent ?? "" : "";
    return { n: n ? Number(n) : null, side: el.classList.contains("removed") ? "old" as const : "new" as const, text: text === " " ? "" : text };
  });
  askSetSel({ key: ctx.key, file: ctx.file, lines });
});

function askSetSel(sel: KeptSelection | null) {
  askState.sel = sel;
  askPaintSel();
  askRenderComposer();
}

/** Tints the kept selection's rows — the browser's own highlight goes once the textarea has focus. */
function askPaintSel() {
  document.querySelectorAll(".row.ask-sel").forEach((r) => r.classList.remove("ask-sel"));
  const root = askCodeRoot();
  const ctx = askContext();
  if (!askState.sel || !root || !ctx || askState.sel.key !== ctx.key) return;
  for (const l of askState.sel.lines) {
    if (l.n === null) continue;
    const attr = l.side === "old" ? "data-old" : "data-line";
    root.querySelector(".row[" + attr + '="' + l.n + '"]')?.classList.add("ask-sel");
  }
}

/** After every render of either view: drop a selection from another change, repaint, update the chips. */
export function askSync(): void {
  const ctx = askContext();
  if (askState.sel && (!ctx || askState.sel.key !== ctx.key)) askState.sel = null;
  askPaintSel();
  askRenderComposer();
}

// ---- the rail ----

export function askSetOpen(open: boolean): void {
  askState.open = open;
  writePref("lens.askOpen", open ? "1" : "0");
  askRail.style.display = askResizer.style.display = open ? "" : "none";
  askBtn.setAttribute("aria-pressed", String(open));
  if (open) {
    askRenderComposer();
    askPoll();
  }
}

export function askOpenAndFocus(): void {
  if (!askState.open) askSetOpen(true);
  askInput.focus();
}

askBtn.onclick = () => askSetOpen(!askState.open);
byId("ask-close").onclick = () => askSetOpen(false);

askResizer.addEventListener("pointerdown", (down) => {
  down.preventDefault();
  askResizer.setPointerCapture(down.pointerId);
  askResizer.classList.add("dragging");
  document.body.style.userSelect = "none";
  const move = (ev: PointerEvent) => {
    const width = Math.min(720, Math.max(280, askRail.getBoundingClientRect().right - ev.clientX));
    askRail.style.width = width + "px";
  };
  const up = () => {
    askResizer.classList.remove("dragging");
    document.body.style.userSelect = "";
    askResizer.removeEventListener("pointermove", move);
    askResizer.removeEventListener("pointerup", up);
    writePref("lens.askWidth", parseInt(askRail.style.width, 10) || 360);
  };
  askResizer.addEventListener("pointermove", move);
  askResizer.addEventListener("pointerup", up);
});

// ---- talking to the server ----

function askWaiting() {
  const last = askState.data.questions[askState.data.questions.length - 1];
  return last && !last.answer ? last : null;
}

/** Polls the chat while the rail is open or a question waits for its answer. */
async function askPoll() {
  if (askState.timer) { clearTimeout(askState.timer); askState.timer = null; }
  try {
    const res = await fetch("/api/ask");
    if (res.ok) {
      if (askState.error === ASK_GONE) askState.error = null; // it's back (restarted on the same port)
      const json = await res.text();
      if (json !== askState.dataJson) {
        askState.dataJson = json;
        askState.data = JSON.parse(json);
        askRenderThread();
      }
    }
  } catch {
    // the server is gone (ctrl-c): no agent can answer, and sending would fail
    askState.data = { ...askState.data, listening: false };
    askState.error = ASK_GONE;
  }
  askRenderWaitTimes();
  askRenderComposer();
  if (askState.open || askWaiting()) askState.timer = setTimeout(askPoll, ASK_POLL_MS);
}

function askBody() {
  const ctx = askContext()!;
  const sel = askState.sel && askState.sel.key === ctx.key ? { file: askState.sel.file, lines: askState.sel.lines } : null;
  return { text: askInput.value, file: ctx.file, unitId: ctx.unitId, label: ctx.label, selection: sel };
}

async function askSend() {
  if (askSendBtn.disabled) return;
  askState.busy = true;
  askRenderComposer();
  try {
    if (askState.data.listening) {
      const res = await fetch("/api/ask", { method: "POST", body: JSON.stringify(askBody()) });
      if (!res.ok) throw new Error((await res.json()).error || "http " + res.status);
      askInput.value = "";
      askState.error = null;
      askGrow();
      askState.sel = null;
      askPaintSel();
    } else {
      const res = await fetch("/api/ask/prompt", { method: "POST", body: JSON.stringify(askBody()) });
      if (!res.ok) throw new Error((await res.json()).error || "http " + res.status);
      await navigator.clipboard.writeText((await res.json()).text);
      askState.copied = true;
      setTimeout(() => { askState.copied = false; askRenderComposer(); }, 1500);
    }
  } catch (err) {
    askState.error = "couldn't send: " + (err as Error).message;
  } finally {
    askState.busy = false;
  }
  askPoll();
}

askSendBtn.onclick = () => askSend();
askInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    askSend();
  } else if (ev.key === "Escape") {
    askInput.blur(); // back to the code: j/k and the toolbar keys work again
  }
});
askInput.addEventListener("input", () => { askState.error = null; askGrow(); askRenderComposer(); });

/** The textarea grows with its text, up to ASK_MAX_INPUT_ROWS lines. */
function askGrow() {
  askInput.style.height = "auto";
  const line = parseFloat(getComputedStyle(askInput).lineHeight) || 18;
  askInput.style.height = Math.min(askInput.scrollHeight, line * ASK_MAX_INPUT_ROWS + 12) + "px";
}

// ---- rendering ----

function askRenderComposer() {
  if (!askState.open) return;
  const ctx = askContext();
  const listening = askState.data.listening;
  const waiting = askWaiting();
  askStatusEl.innerHTML = '<span class="ask-dot' + (listening ? " on" : "") + '"></span>' + (listening ? "agent listening" : "no agent");
  const sel = askState.sel && ctx && askState.sel.key === ctx.key ? askState.sel : null;
  askChipsEl.innerHTML = ctx
    ? '<span class="ask-chip unit" title="the open change goes along with every question">' + escapeHtml(ctx.label) + "</span>" +
      (sel ? '<span class="ask-chip" title="your selection in the code">' + escapeHtml(askSelLabel(sel)) + "</span>" : "")
    : "";
  askInput.disabled = !ctx;
  askInput.placeholder = ctx ? "Ask about " + ctx.label + "…" : "Open a change to ask about it";
  askHintEl.textContent = askState.error || "↵ ask · ⇧↵ newline · Esc back to the code";
  askHintEl.classList.toggle("error", !!askState.error);
  askSendBtn.textContent = askState.copied ? "Copied ✓" : listening ? "Ask" : "Copy as prompt";
  // one question at a time for the agent; with none listening, copying still works
  askSendBtn.disabled = !ctx || !askInput.value.trim() || (listening && !!waiting) || askState.busy;
}

export function askRenderThread(): void {
  const nearBottom = askThreadEl.scrollHeight - askThreadEl.scrollTop - askThreadEl.clientHeight < 40;
  const qs = askState.data.questions;
  if (qs.length === 0) {
    askThreadEl.innerHTML = '<div class="ask-empty">' + (askState.data.listening
      ? "Ask about the open change. Select code first to ask about those lines."
      : "Run <code>/lens-ask</code> in your agent to get answers here. Until then, <b>Copy as prompt</b> puts your question and the code on the clipboard.") +
      "</div>";
    return;
  }
  askThreadEl.innerHTML = qs.map((q, i) => {
    const sel = q.selection ? '<span class="ask-chip">' + escapeHtml(askSelLabel(q.selection)) + "</span>" : "";
    let html = '<div class="ask-q' + (q.stale ? " stale" : "") + '">' +
      '<div class="ask-chips"><button class="ask-chip unit ask-goto" data-q="' + i + '" title="open this change">' + escapeHtml(q.label) + "</button>" + sel + "</div>" +
      '<div class="ask-text">' + escapeHtml(q.text) + "</div></div>";
    if (q.answer) {
      const secs = Math.max(1, Math.round((q.answer.at - q.askedAt) / 1000));
      html += '<div class="ask-a' + (q.stale ? " stale" : "") + '"><div class="ask-who">agent · ' + secs + "s</div>" +
        askMarkdown(q.answer.markdown, q.stale ? [] : q.answer.cites) + "</div>";
    } else {
      html += '<div class="ask-a"><div class="ask-who ask-wait" data-asked="' + q.askedAt + '"><span class="ask-spin"></span>waiting for agent</div></div>';
    }
    if (q.stale) html += '<div class="ask-stale">↻ the code changed since this was asked</div>';
    return html;
  }).join("");
  askThreadEl.querySelectorAll<HTMLElement>(".ask-goto").forEach((b) => {
    b.onclick = () => askGoto(qs[Number(b.dataset.q)]);
  });
  askThreadEl.querySelectorAll<HTMLElement>(".ask-cite").forEach((el) => {
    el.onclick = () => askOpenCite(el.dataset.file!, Number(el.dataset.line));
  });
  if (nearBottom) askThreadEl.scrollTop = askThreadEl.scrollHeight;
}

/** "waiting for agent · 6s", ticking with the poll. */
function askRenderWaitTimes() {
  askThreadEl.querySelectorAll<HTMLElement>(".ask-wait").forEach((el) => {
    const secs = Math.round((Date.now() - Number(el.dataset.asked)) / 1000);
    el.lastChild!.textContent = "waiting for agent · " + secs + "s";
  });
}

/**
 * The little markdown agents write: fenced code, paragraphs, - / 1. lists,
 * `code` and **bold**. Escaped first; valid cites become buttons.
 */
function askMarkdown(md: string, cites: AskCite[]) {
  const inline = (s: string) => {
    let h = escapeHtml(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    // a cite into a file the viewer doesn't have (outside the diff) has nowhere to go: it stays text
    for (const c of cites.filter((x) => DATA.files.some((f) => f.file === x.file))) {
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
function askOpenCite(file: string, line: number) {
  if (state.view === "summary") {
    const u = currentUnit();
    if (u && u.displayFile === file && citedRow(summaryPaneEl, "N" + line)) { flashCited(summaryPaneEl, "N" + line); return; }
  }
  const index = DATA.files.findIndex((f) => f.file === file);
  if (index >= 0) jumpToLine(index, line);
}

/** A question's change chip: back to that unit, or that file. */
function askGoto(q: AskQuestion) {
  if (q.unitId && unitById(q.unitId)) {
    if (state.view !== "summary") setView("summary");
    openSummaryUnit(q.unitId);
    return;
  }
  const index = DATA.files.findIndex((f) => f.file === q.file);
  if (index < 0) return;
  if (state.view !== "code") setView("code");
  openFile(index);
}

/** Start-up: the rail as the reader left it. */
export function initAsk(): void {
  askRail.style.width = (Number(readPref("lens.askWidth")) || 360) + "px";
  askSetOpen(askState.open);
  askRenderThread();
}
