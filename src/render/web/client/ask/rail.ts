// The Ask rail: open or not, its width, the poll and the send. lens never calls an AI: the
// reader's agent answers through `lens ask listen` / `lens ask reply`.

import type { AskQuestion } from '../../../../ask/session.ts';
import { commit, getState, type LensState, update } from '../store.ts';
import { askContext, askSelection } from '../model/askContext.ts';
import { writePref } from '../shared.ts';

const ASK_POLL_MS = 1000;
export const ASK_MAX_LINES = 400;
const ASK_MAX_INPUT_ROWS = 8;
const ASK_GONE = "the lens viewer isn't running anymore";

let pollTimer: ReturnType<typeof setTimeout> | null = null;

export function setAsk(patch: Partial<LensState['ask']>) {
  update((state) => ({ ask: { ...state.ask, ...patch } }));
}

export function askSetOpen(open: boolean): void {
  writePref('lens.askOpen', open ? '1' : '0');
  setAsk({ open });
  if (open) askPoll();
}

/** `a`: the rail opens and its input takes the keys. */
export function askOpenAndFocus(): void {
  if (!getState().ask.open) {
    writePref('lens.askOpen', '1');
    commit((state) => ({ ask: { ...state.ask, open: true } }));
    askPoll();
  }
  document.getElementById('ask-input')?.focus();
}

export function askSetWidth(width: number): void {
  writePref('lens.askWidth', width);
  setAsk({ width });
}

/** The textarea grows with its text, up to ASK_MAX_INPUT_ROWS lines. */
export function growInput(input: HTMLTextAreaElement) {
  input.style.height = 'auto';
  const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 18;
  input.style.height = Math.min(input.scrollHeight, lineHeight * ASK_MAX_INPUT_ROWS + 12) + 'px';
}

export function askWaiting(state: LensState): AskQuestion | null {
  const questions = state.ask.data.questions;
  const last = questions[questions.length - 1];
  return last && !last.answer ? last : null;
}

/** Polls the chat while the rail is open or a question waits for its answer. */
export async function askPoll(): Promise<void> {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  const patch: Partial<LensState['ask']> = {};
  try {
    const response = await fetch('/api/ask');
    if (response.ok) {
      if (getState().ask.error === ASK_GONE) patch.error = null; // it's back (restarted on the same port)
      const json = await response.text();
      if (json !== getState().ask.dataJson) {
        patch.dataJson = json;
        patch.data = JSON.parse(json);
      }
    }
  } catch {
    // the server is gone (ctrl-c): no agent can answer, and sending would fail
    patch.data = { ...getState().ask.data, listening: false };
    patch.error = ASK_GONE;
  }
  // a thread scrolled to its end follows new messages; one scrolled up stays put
  const thread = document.getElementById('ask-thread');
  const atEnd = !thread || thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40;
  commit((state) => ({ ask: { ...state.ask, ...patch, tick: state.ask.tick + 1 } })); // the wait times tick
  if (patch.data && thread && atEnd) thread.scrollTop = thread.scrollHeight;
  const state = getState();
  if (state.ask.open || askWaiting(state)) pollTimer = setTimeout(askPoll, ASK_POLL_MS);
}

/**
 * Sends the question to the listening agent, or puts it on the clipboard as a prompt.
 * A failure shows in the composer (`ask.error`) until the reader types again.
 */
export async function askSend(text: string): Promise<'sent' | 'copied' | null> {
  const state = getState();
  const context = askContext(state);
  if (!context) return null;
  const selection = askSelection(state);
  const body = JSON.stringify({
    text,
    file: context.file,
    unitId: context.unitId,
    label: context.label,
    selection: selection ? { file: selection.file, lines: selection.lines } : null,
  });
  let result: 'sent' | 'copied' | null = null;
  try {
    if (state.ask.data.listening) {
      const response = await fetch('/api/ask', { method: 'POST', body });
      if (!response.ok) throw new Error((await response.json()).error || 'http ' + response.status);
      setAsk({ error: null, selection: null });
      result = 'sent';
    } else {
      const response = await fetch('/api/ask/prompt', { method: 'POST', body });
      if (!response.ok) throw new Error((await response.json()).error || 'http ' + response.status);
      await navigator.clipboard.writeText((await response.json()).text);
      result = 'copied';
    }
  } catch (error) {
    setAsk({ error: "couldn't send: " + (error as Error).message });
  }
  askPoll();
  return result;
}
