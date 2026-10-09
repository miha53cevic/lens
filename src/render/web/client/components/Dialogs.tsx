// The modals: current settings, keyboard shortcuts (the ? help), and search in files (⌘P).

import clsx from "clsx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getState, update, type LensState } from "../store.ts";
import { visibleFile } from "../model.ts";
import { catColor, sourceLines } from "../shared.ts";
import { jumpToLine } from "../actions.ts";
import { Dialog } from "./widgets.tsx";

function ModalHead({ title }: { title: string }) {
  return (
    <div className="modal-head">
      <span className="modal-title">{title}</span>
      <span className="spacer" />
      <form method="dialog"><button>close</button></form>
    </div>
  );
}

// ---- settings ----

function CodeList({ items }: { items: readonly (string | number)[] | undefined }) {
  if (!items || items.length === 0) return <span className="set-source">none</span>;
  return <span className="set-list">{items.map((i, n) => <code key={n}>{String(i)}</code>)}</span>;
}

function CatName({ cat, off }: { cat: string; off?: boolean }) {
  return <span className={"set-cat" + (off ? " set-off" : "")}><span className="dot" style={{ background: catColor(cat) }} />{cat}</span>;
}

export function SettingsDialog({ s }: { s: LensState }) {
  const { data, threshold } = s;
  const cfg = data.config;
  const categories = Object.keys(cfg.categories || {});
  for (const p of cfg.callPatterns || []) if (!categories.includes(p.category)) categories.push(p.category);
  return (
    <Dialog id="settings-modal" open={s.settingsOpen} onClose={() => update({ settingsOpen: false })}>
      <ModalHead title="settings" />
      <div className="modal-body" id="settings-body">
        {s.settingsOpen && (
          <>
            <div className="set-section">
              <h3>config source</h3>
              <div className="set-source">
                {data.configSource
                  ? <>built-in lens.defaults.json + <code>{data.configSource}</code></>
                  : "built-in lens.defaults.json (no .lens.json found)"}
              </div>
            </div>
            <div className="set-section">
              <h3>this session</h3>
              <table className="set-table"><tbody>
                <tr><td>fold threshold</td><td>{(threshold < 0 ? "off" : threshold) + (threshold !== cfg.threshold ? " (config: " + cfg.threshold + ")" : "")}</td></tr>
                <tr><td>theme</td><td>{data.theme}</td></tr>
                <tr><td>hide tests</td><td>{s.hideTests ? "on" : "off"}</td></tr>
                <tr><td>hunks only</td><td>{s.hunksOnly ? "on" : "off"}</td></tr>
              </tbody></table>
            </div>
            <div className="set-section">
              <h3>categories</h3>
              <table className="set-table"><tbody>
                {categories.map((cat) => {
                  const enabled = (cfg.categories || {})[cat] !== false;
                  const score = (cfg.scores || {})[cat] ?? 1;
                  return (
                    <tr key={cat}>
                      <td><CatName cat={cat} off={!enabled} /></td>
                      <td>{enabled ? "score " + score + (score <= threshold ? " — folds now" : " — visible now") : "disabled"}</td>
                    </tr>
                  );
                })}
              </tbody></table>
            </div>
            <div className="set-section">
              <h3>call patterns</h3>
              <table className="set-table"><tbody>
                {(cfg.callPatterns || []).map((p, i) => (
                  <tr key={i}>
                    <td><CatName cat={p.category} /></td>
                    <td><CodeList items={p.receivers} /><br />methods: {p.methods ? <CodeList items={p.methods} /> : "any"}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div className="set-section">
              <h3>keep visible</h3>
              markers: <CodeList items={cfg.keepCommentMarkers} /><br />directive: <CodeList items={[cfg.keepDirective]} />
            </div>
            <div className="set-section"><h3>test file patterns</h3><CodeList items={cfg.testFilePatterns} /></div>
            <div className="set-section"><h3>excluded from analysis</h3><CodeList items={cfg.exclude} /></div>
            <div className="set-note">edit .lens.json and press ↻ refresh to apply changes without restarting — see the lens README for every field</div>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---- keyboard shortcuts ----

/** A new key goes here, and in keys.ts (in the summary's list too when it acts on a unit). */
const KEYS: [ReactNode, ReactNode][] = [
  [<><kbd>j</kbd> / <kbd>k</kbd></>, "next / previous file"],
  [<kbd>w</kbd>, "close the active tab"],
  [<kbd>o</kbd>, "keep the preview tab open (pin it)"],
  [<kbd>m</kbd>, "mark the file / change as viewed"],
  [<><kbd>⌘P</kbd> / <kbd>Ctrl P</kbd></>, "search in files"],
  [<kbd>⌥ click</kbd>, "find usages of the clicked identifier"],
  [<kbd>/</kbd>, "focus the file filter"],
  [<kbd>s</kbd>, "toggle the file tree"],
  [<><kbd>e</kbd> / <kbd>c</kbd></>, "expand / collapse all folds"],
  [<><kbd>[</kbd> / <kbd>]</kbd></>, "fold threshold down / up"],
  [<kbd>h</kbd>, <>toggle hunks only <span className="set-source">(diff mode)</span></>],
  [<kbd>x</kbd>, <>toggle removed lines <span className="set-source">(diff mode)</span></>],
  [<kbd>t</kbd>, "toggle hide tests"],
  [<kbd>r</kbd>, "refresh the analysis"],
  [<kbd>v</kbd>, <>switch Code / Summary <span className="set-source">(diff mode)</span></>],
  [<kbd>a</kbd>, "ask your agent about the open change (and your selection)"],
  [<kbd>\</kbd>, "show / hide the Ask rail"],
];

export function KeysDialog({ s }: { s: LensState }) {
  return (
    <Dialog id="keys-modal" open={s.keysOpen} onClose={() => update({ keysOpen: false })}>
      <ModalHead title="keyboard shortcuts" />
      <div className="modal-body">
        <table className="set-table"><tbody>
          {KEYS.map(([k, what], i) => <tr key={i}><td>{k}</td><td>{what}</td></tr>)}
          <tr>
            <td colSpan={2} className="set-source">
              in Summary: <kbd>g</kbd> overview · <kbd>j</kbd> / <kbd>k</kbd> next / previous change · <kbd>o</kbd> open it in the code view
              · <kbd>/</kbd> filter the changes · the toolbar's keys (<kbd>e</kbd> <kbd>c</kbd> <kbd>[</kbd> <kbd>]</kbd> <kbd>h</kbd> <kbd>x</kbd> <kbd>t</kbd>) act
              on the open change · <kbd>a</kbd> <kbd>\</kbd> work as in the code view
            </td>
          </tr>
          <tr><td><kbd>?</kbd></td><td>this help</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>close dialogs · clear the filter · leave the Ask input</td></tr>
        </tbody></table>
      </div>
    </Dialog>
  );
}

// ---- search in files ----

const SEARCH_LIMIT = 500;
interface Hit { fileIndex: number; line: number; col: number; len: number }

function escapeRegExp(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function findHits(s: LensState): Hit[] {
  const { query, word, matchCase } = s.search;
  if (query.trim().length < 2) return [];
  let body = escapeRegExp(query);
  // not \b: identifiers can start or end with $ ($scope, el$)
  if (word) body = "(?<![\\w$])" + body + "(?![\\w$])";
  const re = new RegExp(body, matchCase ? "g" : "gi");
  const hits: Hit[] = [];
  for (let i = 0; i < s.data.files.length; i++) {
    if (!visibleFile(s, s.data.files[i].file)) continue; // respect "hide tests"
    const lines = sourceLines(s.data.files[i]);
    for (let ln = 0; ln < lines.length; ln++) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(lines[ln])) !== null) {
        if (m[0].length === 0) break;
        hits.push({ fileIndex: i, line: ln + 1, col: m.index, len: m[0].length });
        if (hits.length >= SEARCH_LIMIT) return hits;
      }
    }
  }
  return hits;
}

export function SearchDialog({ s }: { s: LensState }) {
  const search = s.search;
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => findHits(s), [search.query, search.word, search.matchCase, s.data.files, s.hideTests]);
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [hits]);
  // every open (⌘P, an alt-click) puts the cursor in the query, selected
  useLayoutEffect(() => {
    if (!search.open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [search.seq]);
  useEffect(() => {
    resultsRef.current?.querySelector(".search-hit.selected")?.scrollIntoView({ block: "nearest" });
  }, [sel]);
  const setSearch = (patch: Partial<LensState["search"]>) => update((st) => ({ search: { ...st.search, ...patch } }));
  const jump = (hit: Hit) => {
    const pinOrigin = getState().search.pinOrigin;
    setSearch({ open: false });
    jumpToLine(hit.fileIndex, hit.line, pinOrigin);
  };
  return (
    <Dialog id="search-modal" className="palette" open={search.open} onClose={() => setSearch({ open: false })}>
      <div className="palette-head">
        <input
          ref={inputRef} id="search-input" type="text" placeholder="search in files…" spellCheck={false} autoComplete="off"
          value={search.query}
          onChange={(ev) => setSearch({ query: ev.target.value })}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowDown") { if (hits.length) setSel((sel + 1) % hits.length); ev.preventDefault(); }
            else if (ev.key === "ArrowUp") { if (hits.length) setSel((sel - 1 + hits.length) % hits.length); ev.preventDefault(); }
            else if (ev.key === "Enter" && hits[sel]) jump(hits[sel]);
          }}
        />
        <label className="control" title="match whole words only">
          <input type="checkbox" id="search-word" checked={search.word} onChange={(ev) => setSearch({ word: ev.target.checked })} /> word
        </label>
        <label className="control" title="match case">
          <input type="checkbox" id="search-case" checked={search.matchCase} onChange={(ev) => setSearch({ matchCase: ev.target.checked })} /> case
        </label>
      </div>
      <div className="search-results" id="search-results" ref={resultsRef}>
        <Results s={s} hits={hits} sel={sel} onJump={jump} />
      </div>
      <div className="palette-foot">
        <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> jump</span>
        <span><kbd>Esc</kbd> close</span>
        <span className="spacer" />
        <span>tip: <kbd>⌥ click</kbd> an identifier in the code finds its usages</span>
      </div>
    </Dialog>
  );
}

function Results({ s, hits, sel, onJump }: { s: LensState; hits: Hit[]; sel: number; onJump: (hit: Hit) => void }) {
  const query = s.search.query.trim();
  if (query.length < 2) {
    return <div className="search-empty">{query ? "keep typing — at least 2 characters" : "search across all " + s.data.files.length + " loaded files"}</div>;
  }
  if (hits.length === 0) return <div className="search-empty">no matches</div>;
  const rows: ReactNode[] = [];
  let lastFile = -1;
  hits.forEach((hit, idx) => {
    const file = s.data.files[hit.fileIndex];
    if (hit.fileIndex !== lastFile) {
      lastFile = hit.fileIndex;
      const count = hits.filter((h) => h.fileIndex === hit.fileIndex).length;
      rows.push(<div key={"f" + hit.fileIndex} className="search-file">{file.file + " "}<span className="count">· {count}</span></div>);
    }
    const text = sourceLines(file)[hit.line - 1] ?? "";
    const from = hit.col > 80 ? hit.col - 60 : 0;
    const before = ((from > 0 ? "…" : "") + text.slice(from, hit.col)).replace(/^\s+/, "");
    const after = text.slice(hit.col + hit.len, hit.col + hit.len + 160);
    rows.push(
      <div key={idx} className={clsx("search-hit", idx === sel && "selected")} data-idx={idx} onClick={() => onJump(hit)}>
        <span className="ln">{hit.line}</span>
        <span className="preview">{before}<span className="match">{text.substr(hit.col, hit.len)}</span>{after}</span>
      </div>,
    );
  });
  if (hits.length >= SEARCH_LIMIT) rows.push(<div key="limit" className="search-empty">stopped at {SEARCH_LIMIT} matches — refine the query</div>);
  return <>{rows}</>;
}
