// TypeScript on the code (behind `typescriptLsp`): resting the pointer on a name shows what it is
// (components/LspHover.tsx), and ⌘-click (Ctrl elsewhere) goes to where it's declared. Only a line
// of the new side is asked about: the server reads the files on disk, which are the new side.

import { getState, update, type LensState } from '../store.ts';
import { askContext } from '../model/askContext.ts';
import { codeRowAt } from '../ask/selection.ts';
import type { CodePlace } from '../../cli-app/api/contract.ts';
import type { HoverAnchor } from '../../ui/HoverCard.tsx';
import { api, noteDone, noteFailure, tracked } from './status.ts';
import { jumpToLine } from './views.ts';

/** ms the pointer rests on a name before it's asked about, and stays off one before its card goes */
const HOVER_DELAY = 350;
const HIDE_DELAY = 200;

const WORD_CHAR = /[\p{L}\p{N}_$]/u;

// the timers' handles, and the name asked about last: an answer for any other is dropped
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let asking: string | null = null;

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** A name of the new side's code under the pointer: where it is, and where it's drawn */
interface PointedName {
  key: string;
  place: CodePlace;
  anchor: HoverAnchor;
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    return position && { node: position.offsetNode, offset: position.offset };
  }
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function nameAt(state: LensState, event: MouseEvent): PointedName | null {
  const row = codeRowAt(event.target);
  const context = askContext(state);
  if (!row || !context || row.classList.contains('removed') || !row.dataset.line) return null;
  const code = row.lastElementChild;
  const caret = caretAt(event.clientX, event.clientY);
  if (!code || !caret || caret.node.nodeType !== Node.TEXT_NODE || !code.contains(caret.node)) return null;
  const text = caret.node.textContent ?? '';
  let start = caret.offset;
  let end = caret.offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  if (start === end) return null;
  const word = document.createRange();
  word.setStart(caret.node, start);
  word.setEnd(caret.node, end);
  // the caret is the nearest one: past a line's end or between names, the pointer isn't on this name
  const rect = word.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    return null;
  const before = document.createRange();
  before.setStart(code, 0);
  before.setEnd(caret.node, start);
  // the LSP counts UTF-16 units, as a JS string does
  const character = before.toString().length;
  const line = Number(row.dataset.line);
  return {
    key: context.file + ':' + line + ':' + character,
    place: { file: context.file, line, character },
    anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
  };
}

export function hideLspHover(): void {
  if (showTimer) clearTimeout(showTimer);
  if (hideTimer) clearTimeout(hideTimer);
  showTimer = hideTimer = null;
  asking = null;
  if (getState().lspHover) update({ lspHover: null });
}

/** The code scrolled: the card no longer sits by its name (a scroll in the card itself is reading it) */
export function onScrollHide(event: Event): void {
  if (event.target instanceof Element && event.target.closest('[data-part="hover-card"]')) return;
  if (getState().lspHover || showTimer) hideLspHover();
}

export function onCodePointerMove(event: PointerEvent): void {
  const state = getState();
  if (!state.data.typescriptLsp || event.buttons !== 0) return;
  // on the card: it stays, to be read or selected
  if (event.target instanceof Element && event.target.closest('[data-part="hover-card"]')) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    return;
  }
  const name = nameAt(state, event);
  if (name && (name.key === asking || name.key === state.lspHover?.key)) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    return;
  }
  if (showTimer) clearTimeout(showTimer);
  showTimer = null;
  asking = null;
  if (state.lspHover && !hideTimer) hideTimer = setTimeout(hideLspHover, HIDE_DELAY);
  if (!name) return;
  asking = name.key;
  showTimer = setTimeout(() => void showHover(name), HOVER_DELAY);
}

async function showHover(name: PointedName): Promise<void> {
  showTimer = null;
  try {
    const answer = await api('POST /api/lsp/hover', { body: name.place, query: { theme: getState().data.theme } });
    if (asking !== name.key) return;
    asking = null;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    // nothing to say of it (a keyword, a string's word): no card
    if (!answer.hover && !answer.unavailable) return update({ lspHover: null });
    update({
      lspHover: {
        key: name.key,
        anchor: name.anchor,
        info: answer.hover,
        tokens: answer.tokens,
        unavailable: answer.unavailable,
      },
    });
  } catch {
    // a server that stopped is the status bar's to say (api); a hover isn't worth a notice of its own
    asking = null;
  }
}

/** ⌘-click (Ctrl elsewhere) on a name: to where TypeScript says it's declared. */
export function onCodeClick(event: MouseEvent): void {
  const state = getState();
  if (!state.data.typescriptLsp || !(isMac() ? event.metaKey : event.ctrlKey)) return;
  const name = nameAt(state, event);
  if (!name) return;
  event.preventDefault();
  hideLspHover();
  void tracked(
    { id: 'lsp-definition', label: 'Finding the definition…', failed: "Couldn't find the definition" },
    async () => {
      const { places, unavailable } = await api('POST /api/lsp/definition', { body: name.place });
      if (unavailable) return noteFailure("Couldn't ask TypeScript", unavailable);
      const [place] = places;
      if (!place) return noteDone('No definition found');
      const fileIndex = getState().data.files.findIndex((file) => file.file === place.file);
      if (fileIndex < 0) return noteDone('Defined outside this review', place.file + ':' + place.line);
      jumpToLine(fileIndex, place.line, true);
    },
  );
}
