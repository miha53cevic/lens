// lens viewer: keyboard shortcuts (listed in the ? help, components/Dialogs.tsx).

import { commit, getState, update } from "./store.ts";
import { activeFile, currentUnit, treeModel } from "./model.ts";
import { isDiffMode } from "./shared.ts";
import {
  closeTab, collapseAll, expandAll, openSearch, openUnitInCode, pinTab, refresh, setHideTests, setHunksOnly,
  setShowRemoved, setView, showOverview, stepFile, stepSummary, stepThreshold, toggleFileViewed, toggleNav,
  toggleUnitViewed,
} from "./actions.ts";
import { askOpenAndFocus, askSetOpen } from "./ask.ts";

/** The keys that also work on the Summary tab: the toolbar's act on the open unit's code. */
const SUMMARY_KEYS = ["?", "x", "s", "r", "e", "c", "[", "]", "h", "t", "a", "\\"];

/** Shows the nav (if it's collapsed) and focuses one of its filters. */
function focusFilter(selector: string) {
  if (getState().navCollapsed) commit((s) => ({ navCollapsed: !s.navCollapsed }));
  document.querySelector<HTMLInputElement>(selector)?.focus();
}

export function onKeyDown(ev: KeyboardEvent): void {
  // ⌘P / Ctrl+P opens the search palette from anywhere (and suppresses print)
  if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "p") {
    ev.preventDefault();
    openSearch();
    return;
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  // keys go to text fields and selects; a clicked checkbox (viewed, a fold chip) keeps focus but takes no letters
  const target = ev.target;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (target instanceof HTMLInputElement && target.type !== "checkbox") return;
  if (document.querySelector("dialog[open]")) return; // Esc closes natively

  const s = getState();
  if (ev.key === "v" && s.data.summary) { setView(s.view === "summary" ? "code" : "summary"); return; }
  if (s.view === "summary") {
    if (ev.key === "j") { stepSummary(1); return; }
    if (ev.key === "k") { stepSummary(-1); return; }
    if (ev.key === "o") { openUnitInCode(currentUnit(s)); return; }
    if (ev.key === "m") { toggleUnitViewed(currentUnit(s)); return; }
    if (ev.key === "g") { showOverview(); return; }
    if (ev.key === "/") { focusFilter("#sum-filter input"); ev.preventDefault(); return; }
    if (!SUMMARY_KEYS.includes(ev.key)) return;
  }
  // the file tree's keys only when there's a tree (the Summary tab always has its list)
  const hasNav = s.view === "summary" || treeModel(s).hasTree;
  const diff = isDiffMode(s.data);
  switch (ev.key) {
    case "?": update({ keysOpen: true }); ev.preventDefault(); break;
    case "j": stepFile(1); break;
    case "k": stepFile(-1); break;
    case "w": if (s.active >= 0) closeTab(s.active); break;
    case "m": toggleFileViewed(s.active); break;
    case "o": if (activeFile(s)) pinTab(s.active); break;
    case "/": if (hasNav) { focusFilter("#file-filter"); ev.preventDefault(); } break;
    case "s": if (hasNav) toggleNav(); break;
    case "e": expandAll(); break;
    case "c": collapseAll(); break;
    case "[": stepThreshold(-1); break;
    case "]": stepThreshold(1); break;
    case "h": if (diff) setHunksOnly(!s.hunksOnly); break;
    case "x": if (diff) setShowRemoved(!s.showRemoved); break;
    case "t": if (treeModel(s).testsPresent) setHideTests(!s.hideTests); break;
    case "r": if (s.data.canRefresh && !s.refreshing) refresh(); break;
    case "a": askOpenAndFocus(); ev.preventDefault(); break; // the "a" mustn't land in the textarea
    case "\\": askSetOpen(!s.ask.open); break;
  }
}
