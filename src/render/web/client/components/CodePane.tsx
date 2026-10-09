// The Code view: the editor tabs and the open file's code.

import { useLayoutEffect, useMemo, useRef, type MouseEvent } from "react";
import type { LensState } from "../store.ts";
import { activeFile, filePlan } from "../model.ts";
import { baseName, isTestFile, linesFromTokens, listedOnlyCount } from "../shared.ts";
import { closeTab, openFile, openSearch, pinTab } from "../actions.ts";
import { askSelLabels } from "../ask.ts";
import { CodeRows } from "./CodeRows.tsx";

export function Tabs({ s }: { s: LensState }) {
  const files = s.data.files;
  // basenames shared by several open tabs get their directory as a suffix
  const counts = new Map<string, number>();
  for (const t of s.tabs) {
    const base = baseName(files[t.index].file);
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  return (
    <div className="tabbar" id="tabbar" style={s.tabs.length === 0 || s.view === "summary" ? { display: "none" } : undefined}>
      {s.tabs.map((t) => {
        const path = files[t.index].file;
        const base = baseName(path);
        const dir = path.slice(0, Math.max(0, path.length - base.length - 1));
        return (
          <div
            key={t.index}
            className={"tab" + (t.index === s.active ? " active" : "") + (t.pinned ? "" : " preview")}
            title={path + (t.pinned ? "" : " — preview tab: reused by the next open, double-click to keep")}
            onClick={() => openFile(t.index)}
            onDoubleClick={() => pinTab(t.index)}
            onAuxClick={(ev) => { if (ev.button === 1) closeTab(t.index); }}
          >
            <span className="tab-name">{base}</span>
            {counts.get(base)! > 1 && dir && <span className="tab-dir">{dir}</span>}
            <button className="tab-close" title="close (or middle-click)" onClick={(ev) => { ev.stopPropagation(); closeTab(t.index); }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

// Every file shares the one scroll container, so each remembers its own reading
// position — a tab switch comes back where the reader left off. Keyed by path, so
// positions survive a refresh.
const scrollMemory = new Map<string, { top: number; left: number }>();

export function CodePane({ s }: { s: LensState }) {
  const main = useRef<HTMLElement>(null);
  const file = activeFile(s);
  const shown = s.view === "code";
  const path = shown && file ? file.file : null;
  // a layout effect: it runs before a jump scrolls to its line
  useLayoutEffect(() => {
    if (!path || !main.current) return;
    const saved = scrollMemory.get(path);
    main.current.scrollTop = saved ? saved.top : 0;
    main.current.scrollLeft = saved ? saved.left : 0;
  }, [path]);
  return (
    <main
      ref={main}
      style={shown ? undefined : { display: "none" }}
      onScroll={(ev) => { if (path) scrollMemory.set(path, { top: ev.currentTarget.scrollTop, left: ev.currentTarget.scrollLeft }); }}
    >
      <div className="code" id="code" onClick={findUsages}>{shown && <FileCode s={s} />}</div>
    </main>
  );
}

function FileCode({ s }: { s: LensState }) {
  const file = activeFile(s);
  // the kept Ask selection's rows are tinted: the browser's own highlight goes once the rail's input has focus
  const selKey = [...askSelLabels(s)].join(",");
  const marks = useMemo(() => ({ classes: new Map(selKey ? selKey.split(",").map((l) => [l, "ask-sel"]) : []) }), [selKey]);
  if (!file) {
    return (
      <div className="empty">
        {s.data.files.length > 0
          ? "no file open — pick one from the tree"
          : listedOnlyCount(s.data) > 0
            ? "nothing to analyze — this diff only renamed, deleted, or excluded files (see the tree)"
            : "no supported files found"}
      </div>
    );
  }
  if (s.hideTests && isTestFile(file.file)) {
    return <div className="empty">every file here is a test file — untick "hide tests" to see them</div>;
  }
  return (
    <>
      {file.parseError && <div className="notice">⚠ folding disabled — this file has syntax errors</div>}
      <CodeRows
        s={s} path={file.file} items={filePlan(s, file).items} lines={linesFromTokens(file)}
        changed={new Set(file.changedLines || [])} gutter={String(file.lineCount).length} marks={marks}
      />
    </>
  );
}

// ---- find usages: alt-click an identifier in the code ----
function findUsages(ev: MouseEvent) {
  if (!ev.altKey) return;
  if (ev.target instanceof Element && ev.target.closest(".pill-row, .row.gap, .num")) return;
  let node: Node | null = null, offset = 0;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(ev.clientX, ev.clientY);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
    if (range) { node = range.startContainer; offset = range.startOffset; }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent ?? "";
  const WORD = /[A-Za-z0-9_$]/;
  let start = offset, end = offset;
  while (start > 0 && WORD.test(text[start - 1])) start--;
  while (end < text.length && WORD.test(text[end])) end++;
  const word = text.slice(start, end);
  if (!word || /^\d+$/.test(word)) return;
  ev.preventDefault();
  openSearch(word, { word: true, matchCase: true, pinOrigin: true });
}
