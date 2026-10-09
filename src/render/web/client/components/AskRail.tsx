// The Ask rail: the chat with the reader's agent about the open change.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LensState } from "../store.ts";
import { askContext, askSelection } from "../model.ts";
import { askClearError, askGoto, askMarkdown, askOpenCite, askSelLabel, askSend, askSetOpen, askSetWidth, askWaiting } from "../ask.ts";
import { startDrag } from "./widgets.tsx";

const ASK_MAX_INPUT_ROWS = 8;

export function AskResizer({ s }: { s: LensState }) {
  return (
    <div
      className="resizer" id="ask-resizer" title="drag to resize the Ask rail" style={s.ask.open ? undefined : { display: "none" }}
      onPointerDown={(down) => {
        const rail = document.getElementById("ask-rail");
        startDrag(down, rail, (ev) => Math.min(720, Math.max(280, rail!.getBoundingClientRect().right - ev.clientX)), (w) => askSetWidth(w || 360));
      }}
    />
  );
}

export function AskRail({ s }: { s: LensState }) {
  const listening = s.ask.data.listening;
  return (
    <aside id="ask-rail" style={{ width: s.ask.width + "px", display: s.ask.open ? undefined : "none" }}>
      <div className="ask-head">
        <span className="ask-title">Ask</span>
        <span className="spacer" />
        <span className="ask-status" id="ask-status"><span className={"ask-dot" + (listening ? " on" : "")} />{listening ? "agent listening" : "no agent"}</span>
        <button id="ask-close" className="icon" title="hide the Ask rail (\)" onClick={() => askSetOpen(false)}>✕</button>
      </div>
      <Thread s={s} />
      <Composer s={s} />
    </aside>
  );
}

function Thread({ s }: { s: LensState }) {
  const ref = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const qs = s.ask.data.questions;
  useLayoutEffect(() => {
    if (nearBottom.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [qs]);
  return (
    <div
      ref={ref} className="ask-thread" id="ask-thread"
      onScroll={(ev) => { const t = ev.currentTarget; nearBottom.current = t.scrollHeight - t.scrollTop - t.clientHeight < 40; }}
      onClick={(ev) => {
        // cites live in the answers' markdown
        const cite = ev.target instanceof Element ? ev.target.closest<HTMLElement>(".ask-cite") : null;
        if (cite) askOpenCite(cite.dataset.file!, Number(cite.dataset.line));
      }}
    >
      {qs.length === 0 ? (
        <div className="ask-empty">
          {listening(s)
            ? "Ask about the open change. Select code first to ask about those lines."
            : <>Run <code>/lens-ask</code> in your agent to get answers here. Until then, <b>Copy as prompt</b> puts your question and the code on the clipboard.</>}
        </div>
      ) : qs.map((q) => {
        const nodes = [
          <div key={q.id + "q"} className={"ask-q" + (q.stale ? " stale" : "")}>
            <div className="ask-chips">
              <button className="ask-chip unit ask-goto" title="open this change" onClick={() => askGoto(q)}>{q.label}</button>
              {q.selection && <span className="ask-chip">{askSelLabel(q.selection)}</span>}
            </div>
            <div className="ask-text">{q.text}</div>
          </div>,
        ];
        if (q.answer) {
          const secs = Math.max(1, Math.round((q.answer.at - q.askedAt) / 1000));
          const html = '<div class="ask-who">agent · ' + secs + "s</div>" + askMarkdown(q.answer.markdown, q.stale ? [] : q.answer.cites, s.data.files);
          nodes.push(<div key={q.id + "a"} className={"ask-a" + (q.stale ? " stale" : "")} dangerouslySetInnerHTML={{ __html: html }} />);
        } else {
          // "waiting for agent · 6s", ticking with the poll
          const secs = Math.round((Date.now() - q.askedAt) / 1000);
          nodes.push(
            <div key={q.id + "a"} className="ask-a">
              <div className="ask-who ask-wait" data-asked={q.askedAt}><span className="ask-spin" />{"waiting for agent · " + secs + "s"}</div>
            </div>,
          );
        }
        if (q.stale) nodes.push(<div key={q.id + "s"} className="ask-stale">↻ the code changed since this was asked</div>);
        return nodes;
      })}
    </div>
  );
}

function listening(s: LensState) { return s.ask.data.listening; }

function Composer({ s }: { s: LensState }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false); // a send or copy in flight
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const ctx = askContext(s);
  const sel = askSelection(s);
  const waiting = askWaiting(s);
  const disabled = !ctx || !text.trim() || (listening(s) && !!waiting) || busy;

  // the textarea grows with its text, up to ASK_MAX_INPUT_ROWS lines
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 18;
    el.style.height = Math.min(el.scrollHeight, line * ASK_MAX_INPUT_ROWS + 12) + "px";
  }, [text]);

  const send = async () => {
    if (disabled) return;
    setBusy(true);
    const outcome = await askSend(text);
    setBusy(false);
    if (outcome === "sent") setText("");
    if (outcome === "copied") { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  return (
    <div className="ask-composer">
      <div className="ask-chips" id="ask-chips">
        {ctx && <span className="ask-chip unit" title="the open change goes along with every question">{ctx.label}</span>}
        {ctx && sel && <span className="ask-chip" title="your selection in the code">{askSelLabel(sel)}</span>}
      </div>
      <textarea
        ref={input} id="ask-input" rows={2} spellCheck={false} value={text} disabled={!ctx}
        placeholder={ctx ? "Ask about " + ctx.label + "…" : "Open a change to ask about it"}
        onChange={(ev) => { askClearError(); setText(ev.target.value); }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) { ev.preventDefault(); send(); }
          else if (ev.key === "Escape") ev.currentTarget.blur(); // back to the code: j/k and the toolbar keys work again
        }}
      />
      <div className="ask-row">
        <span className={"ask-hint" + (s.ask.error ? " error" : "")} id="ask-hint">{s.ask.error || "↵ ask · ⇧↵ newline · Esc back to the code"}</span>
        <span className="spacer" />
        <button id="ask-send" disabled={disabled} onClick={send}>{copied ? "Copied ✓" : listening(s) ? "Ask" : "Copy as prompt"}</button>
      </div>
    </div>
  );
}
