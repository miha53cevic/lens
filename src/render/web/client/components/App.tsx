// The whole page: header, sidebar, editor (code or summary), Ask rail, and the modals.

import { useEffect, useRef } from "react";
import { update, useLens } from "../store.ts";
import { askContext, navShown } from "../model.ts";
import { readPref, writePref } from "../shared.ts";
import { checkSummaryStamp, switchTheme } from "../actions.ts";
import { dropForeignSelection, onSelectionChange } from "../ask.ts";
import { onKeyDown } from "../keys.ts";
import { Header } from "./Header.tsx";
import { Nav } from "./Nav.tsx";
import { CodePane, Tabs } from "./CodePane.tsx";
import { SummaryPane } from "./SummaryPane.tsx";
import { AskRail, AskResizer } from "./AskRail.tsx";
import { KeysDialog, SearchDialog, SettingsDialog } from "./Dialogs.tsx";
import { startDrag } from "./widgets.tsx";

// A light code theme flips the whole chrome to the light palette, so the
// header/sidebar/modals match instead of boxing a bright pane in dark panels.
function isLightColor(color: string) {
  // longest-first: themes report #rgb, #rgba, #rrggbb, or #rrggbbaa
  const m = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i.exec((color || "").trim());
  if (!m) return false;
  let hex = m[1];
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

export function App() {
  const s = useLens();
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("focus", checkSummaryStamp);
    // Restore the saved theme choice — unless --theme pinned this run's theme.
    const saved = readPref("lens.theme");
    const data = s.data;
    if (!data.themePinned && saved && saved !== data.theme) {
      switchTheme(saved).then((ok) => { if (!ok) writePref("lens.theme", data.theme); }); // stale/unknown theme: forget it
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("focus", checkSummaryStamp);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--code-fg", s.data.fg);
    root.style.setProperty("--code-bg", s.data.bg);
    root.dataset.appearance = isLightColor(s.data.bg) ? "light" : "dark";
  }, [s.data.fg, s.data.bg]);

  // PR mode: "owner/repo#N — title" in the tab title too
  useEffect(() => { document.title = s.data.label ? "lens — " + s.data.label : "lens"; }, [s.data.label]);

  // a selection from another change goes when the reader opens a different one
  const ctxKey = askContext(s)?.key ?? null;
  useEffect(dropForeignSelection, [ctxKey]);

  if (s.ended) return <div className="ended">session ended — the lens server has stopped, you can close this tab</div>;

  return (
    <>
      <Header s={s} />
      <SettingsDialog s={s} />
      <KeysDialog s={s} />
      <SearchDialog s={s} />
      <div className="layout">
        <Nav ref={nav} s={s} />
        <div
          className="resizer" id="resizer" title="drag to resize the file tree" style={navShown(s) ? undefined : { display: "none" }}
          onPointerDown={(down) => startDrag(down, nav.current,
            (ev) => Math.min(600, Math.max(160, ev.clientX - nav.current!.getBoundingClientRect().left)),
            (w) => { writePref("lens.navWidth", w || 262); update({ navWidth: w || 262 }); })}
        />
        <div className="editor">
          <Tabs s={s} />
          <CodePane s={s} />
          <SummaryPane s={s} />
        </div>
        <AskResizer s={s} />
        <AskRail s={s} />
      </div>
    </>
  );
}
