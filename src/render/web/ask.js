// lens viewer: the Ask rail. Inlined after viewer.js and summary.js (see there).

// One chat per lens session, answered by the reader's own agent through
// `lens ask listen` / `lens ask reply` — lens never calls an AI. A question is
// about the open change (the Summary tab's unit, or the Code tab's file) plus
// the reader's current code selection, if any.

const askBtn = document.getElementById("ask-btn");
const askRail = document.getElementById("ask-rail");
const askResizer = document.getElementById("ask-resizer");
const askThreadEl = document.getElementById("ask-thread");
const askChipsEl = document.getElementById("ask-chips");
const askInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("ask-input"));
const askSendBtn = /** @type {HTMLButtonElement} */ (document.getElementById("ask-send"));
const askStatusEl = document.getElementById("ask-status");
const askHintEl = document.getElementById("ask-hint");

const ASK_POLL_MS = 1000;
const ASK_MAX_LINES = 400;
const ASK_MAX_INPUT_ROWS = 8;
const ASK_GONE = "the lens viewer isn't running anymore";

const askState = {
  open: readPref("lens.askOpen") === "1",
  /** @type {{ listening: boolean, questions: any[] }} */
  data: { listening: false, questions: [] },
  dataJson: "",
  /** The reader's last code selection: kept while they type, dropped on a plain click in the code or a new change */
  /** @type {{ key: string, file: string, lines: { n: number | null, side: "new" | "old", text: string }[] } | null} */
  sel: null,
  /** @type {ReturnType<typeof setTimeout> | null} */
  timer: null,
  busy: false, // a send or copy in flight
  copied: false,
  /** The last send failed (or the server is gone): shown in the hint line until the reader types again */
  /** @type {string | null} */
  error: null,
};

// ---- what a question is about ----

/** The open change: the Summary tab's unit, or the Code tab's file; null on the overview. */
function askContext() {
  if (state.view === "summary") {
    const u = currentUnit();
    return u ? { key: "u:" + u.id, file: u.displayFile, unitId: u.id, label: unitLabel(u) } : null;
  }
  const f = DATA.files[state.active];
  // the file's name: the selection chip next to it carries the full path
  return f ? { key: "f:" + f.file, file: f.file, unitId: null, label: f.file.split("/").pop() } : null;
}

/** The code the selection can come from in the current view. */
function askCodeRoot() {
  return state.view === "summary" ? summaryPaneEl.querySelector(".unit-code") : codeEl;
}

/** "src/a.ts:43–44" — the same wording as the agent's text (src/ask/context.ts). */
function askSelLabel(sel) {
  const nums = (side) => sel.lines.filter((l) => l.side === side && l.n !== null).map((l) => l.n);
  const span = (ns) => (ns[0] === ns[ns.length - 1] ? String(ns[0]) : ns[0] + "–" + ns[ns.length - 1]);
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
  const rowOf = (node) => (node instanceof Element ? node : node.parentElement)?.closest(".row");
  const rows = [...root.querySelectorAll(".row")].filter((r) => !r.matches(".pill-row, .gap, .unit-gap"));
  const a = rows.indexOf(rowOf(sel.anchorNode)), b = rows.indexOf(rowOf(sel.focusNode));
  if (a < 0 || b < 0) return;
  const picked = rows.slice(Math.min(a, b), Math.max(a, b) + 1).slice(0, ASK_MAX_LINES);
  const lines = picked.map((r) => {
    const el = /** @type {HTMLElement} */ (r);
    const n = el.dataset.line ?? el.dataset.old;
    const text = el.lastElementChild ? el.lastElementChild.textContent : "";
    return { n: n ? Number(n) : null, side: el.classList.contains("removed") ? "old" : "new", text: text === " " ? "" : text };
  });
  askSetSel({ key: ctx.key, file: ctx.file, lines });
});

function askSetSel(sel) {
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
function askSync() {
  const ctx = askContext();
  if (askState.sel && (!ctx || askState.sel.key !== ctx.key)) askState.sel = null;
  askPaintSel();
  askRenderComposer();
}

// ---- the rail ----

function askSetOpen(open) {
  askState.open = open;
  writePref("lens.askOpen", open ? "1" : "0");
  askRail.style.display = askResizer.style.display = open ? "" : "none";
  askBtn.setAttribute("aria-pressed", String(open));
  if (open) {
    askRenderComposer();
    askPoll();
  }
}

function askOpenAndFocus() {
  if (!askState.open) askSetOpen(true);
  askInput.focus();
}

askBtn.onclick = () => askSetOpen(!askState.open);
document.getElementById("ask-close").onclick = () => askSetOpen(false);

askResizer.addEventListener("pointerdown", (down) => {
  down.preventDefault();
  askResizer.setPointerCapture(down.pointerId);
  askResizer.classList.add("dragging");
  document.body.style.userSelect = "none";
  const move = (ev) => {
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
  const ctx = askContext();
  const sel = askState.sel && ctx && askState.sel.key === ctx.key ? { file: askState.sel.file, lines: askState.sel.lines } : null;
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
    askState.error = "couldn't send: " + err.message;
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
  askSendBtn.textContent = askState.copied ? "Copied ✓" : listening || waiting ? "Ask" : "Copy as prompt";
  askSendBtn.disabled = !ctx || !askInput.value.trim() || !!waiting || askState.busy;
}

function askRenderThread() {
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
  askThreadEl.querySelectorAll(".ask-goto").forEach((b) => {
    /** @type {HTMLElement} */ (b).onclick = () => askGoto(qs[Number(/** @type {HTMLElement} */ (b).dataset.q)]);
  });
  askThreadEl.querySelectorAll(".ask-cite").forEach((b) => {
    const el = /** @type {HTMLElement} */ (b);
    el.onclick = () => askOpenCite(el.dataset.file, Number(el.dataset.line));
  });
  if (nearBottom) askThreadEl.scrollTop = askThreadEl.scrollHeight;
}

/** "waiting for agent · 6s", ticking with the poll. */
function askRenderWaitTimes() {
  askThreadEl.querySelectorAll(".ask-wait").forEach((el) => {
    const secs = Math.round((Date.now() - Number(/** @type {HTMLElement} */ (el).dataset.asked)) / 1000);
    el.lastChild.textContent = "waiting for agent · " + secs + "s";
  });
}

/**
 * The little markdown agents write: fenced code, paragraphs, - / 1. lists,
 * `code` and **bold**. Escaped first; valid cites become buttons.
 */
function askMarkdown(md, cites) {
  const inline = (s) => {
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
  const out = [];
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
function askOpenCite(file, line) {
  if (state.view === "summary") {
    const u = currentUnit();
    if (u && u.displayFile === file && citedRow(summaryPaneEl, "N" + line)) { flashCited(summaryPaneEl, "N" + line); return; }
  }
  const index = DATA.files.findIndex((f) => f.file === file);
  if (index >= 0) jumpToLine(index, line);
}

/** A question's change chip: back to that unit, or that file. */
function askGoto(q) {
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

// ---- start-up: last, after all three files' top-level declarations have run ----

askRail.style.width = (Number(readPref("lens.askWidth")) || 360) + "px";
askSetOpen(askState.open);
askRenderThread();
openFirstTreeFile();
syncViewSwitch();
render();
if (location.hash === "#summary" && DATA.summary) setView("summary");
