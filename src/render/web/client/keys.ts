// lens viewer: keyboard shortcuts (listed in the ? help in viewer.html).

import { DATA, byId, state } from "./shared.ts";
import {
  closeTab, collapseAll, expandAll, filterInput, hideTestsBox, hunksBox, hunksWrap, navToggle, openSearch, pinActiveTab,
  refreshBtn, removedWrap, showRemovedBox, stepFile, stepThreshold, testsWrap, toggleFileViewed, treeShown,
} from "./code.ts";
import { currentUnit, openUnitInCode, setView, showOverview, stepSummary, sumFilterInput, toggleUnitViewed } from "./summary.ts";
import { askOpenAndFocus, askSetOpen, askState } from "./ask.ts";

const keysModal = byId<HTMLDialogElement>("keys-modal");
byId("keys-btn").onclick = () => keysModal.showModal();

document.addEventListener("keydown", (ev) => {
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

  if (ev.key === "v" && DATA.summary) { setView(state.view === "summary" ? "code" : "summary"); return; }
  if (state.view === "summary") {
    if (ev.key === "j") { stepSummary(1); return; }
    if (ev.key === "k") { stepSummary(-1); return; }
    if (ev.key === "o") { openUnitInCode(currentUnit()); return; }
    if (ev.key === "m") { toggleUnitViewed(currentUnit()); return; }
    if (ev.key === "g") { showOverview(); return; }
    if (ev.key === "/") {
      if (state.navCollapsed) navToggle.click();
      sumFilterInput.focus();
      ev.preventDefault();
      return;
    }
    // the toolbar's keys act on the open unit's code; file and tab keys don't apply here
    if (!["?", "x", "s", "r", "e", "c", "[", "]", "h", "t", "a", "\\"].includes(ev.key)) return;
  }
  switch (ev.key) {
    case "?": keysModal.showModal(); ev.preventDefault(); break;
    case "j": stepFile(1); break;
    case "k": stepFile(-1); break;
    case "w": if (state.active >= 0) closeTab(state.active); break;
    case "m": toggleFileViewed(state.active); break;
    case "o": pinActiveTab(); break;
    case "/":
      if (treeShown()) {
        if (state.navCollapsed) navToggle.click();
        filterInput.focus();
        ev.preventDefault();
      }
      break;
    case "s": if (treeShown()) navToggle.click(); break;
    case "e": expandAll(); break;
    case "c": collapseAll(); break;
    case "[": stepThreshold(-1); break;
    case "]": stepThreshold(1); break;
    case "h": if (hunksWrap.style.display !== "none") hunksBox.click(); break;
    case "x": if (removedWrap.style.display !== "none") showRemovedBox.click(); break;
    case "t": if (testsWrap.style.display !== "none") hideTestsBox.click(); break;
    case "r": if (refreshBtn.style.display !== "none") refreshBtn.click(); break;
    case "a": askOpenAndFocus(); ev.preventDefault(); break; // the "a" mustn't land in the textarea
    case "\\": askSetOpen(!askState.open); break;
  }
});
