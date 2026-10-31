// The Ask rail: open or not, its width, the poll and the send. lens never calls an AI: the
// reader's agent answers through `lens ask listen` / `lens ask reply`.

import { commit, getState, type LensState, update } from '../store.ts';
import { askContext, askFindings, askSelection } from '../model/askContext.ts';
import { isBreak, isConcern } from '../model/signals.ts';
import { waitingQuestion } from '../model/status.ts';
import { writePref } from '../shared.ts';
import type { AskRequest } from '../../cli-app/api/contract.ts';
import { api, endActivity, noteDone, noteFailure, reach, ServerGone, startActivity } from '../actions/status.ts';
import { check, type Watcher } from '../../ui/poll.ts';
import { slideIn, slideOut, stay } from '../../ui/motion.ts';

const ASK_POLL_MS = 1000;
export const ASK_MAX_LINES = 400;
const ASK_MAX_INPUT_ROWS = 8;
const ASK_GONE = "the lens viewer isn't running anymore";

export function setAsk(patch: Partial<LensState['ask']>) {
  update((state) => ({ ask: { ...state.ask, ...patch } }));
}

export function askSetOpen(open: boolean): void {
  const rail = document.getElementById('ask-rail');
  const set = () => {
    writePref('lens.askOpen', open ? '1' : '0');
    commit((state) => ({ ask: { ...state.ask, open } }));
  };
  // opened again while it slides out: it stays
  if (open && stay(rail)) return;
  if (!open && getState().ask.open) return slideOut(rail, 'right', set);
  const opening = open && !getState().ask.open;
  set();
  if (opening) slideIn(rail, 'right');
  if (open) void check(askWatcher.id);
}

/** The header's button and its key: pressed while the rail slides out, it stays. */
export function askToggle(): void {
  if (stay(document.getElementById('ask-rail'))) return;
  askSetOpen(!getState().ask.open);
}

/** `a` on a closed rail: it opens and its input takes the keys. */
export function askOpenAndFocus(): void {
  stay(document.getElementById('ask-rail'));
  if (!getState().ask.open) {
    writePref('lens.askOpen', '1');
    commit((state) => ({ ask: { ...state.ask, open: true } }));
    slideIn(document.getElementById('ask-rail'), 'right');
    void check(askWatcher.id);
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

/** Reads the chat once: the questions, their answers, whether an agent listens. */
async function askPoll(): Promise<void> {
  const patch: Partial<LensState['ask']> = {};
  const waitedFor = waitingQuestion(getState());
  try {
    const response = await reach('/api/ask');
    if (response.ok) {
      if (getState().ask.error === ASK_GONE) patch.error = null; // it's back (restarted on the same port)
      const json = await response.text();
      if (json !== JSON.stringify(getState().ask.data)) patch.data = JSON.parse(json);
    }
  } catch {
    // the server is gone (ctrl-c): no agent can answer, and sending would fail
    patch.data = { ...getState().ask.data, listening: false };
    patch.error = ASK_GONE;
  }
  // a thread scrolled to its end follows new messages; one scrolled up stays put, unless the
  // reader just asked something (only the reader adds questions): then it goes to their question
  const thread = document.getElementById('ask-thread');
  const atEnd = !thread || thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40;
  const asked = !!patch.data && patch.data.questions.length > getState().ask.data.questions.length;
  commit((state) => ({ ask: { ...state.ask, ...patch, tick: state.ask.tick + 1 } })); // the wait times tick
  if (patch.data && thread && (atEnd || asked)) thread.scrollTop = thread.scrollHeight;
  const state = getState();
  // the answer came with the rail closed: the status bar says so
  const answered = waitedFor && state.ask.data.questions.find((question) => question.id === waitedFor.id)?.answer;
  if (answered && !state.ask.open) noteDone('Your agent answered');
}

/** The chat is polled while the rail is open or a question waits for its answer (the loop is poll.ts). */
export const askWatcher: Watcher = {
  id: 'ask',
  every: ASK_POLL_MS,
  when: () => getState().ask.open || waitingQuestion(getState()) !== null,
  run: askPoll,
};

/**
 * Sends the question to the listening agent, or puts it on the clipboard as a prompt.
 * A failure shows in the composer (`ask.error`) until the reader types again.
 */
export async function askSend(text: string): Promise<'sent' | 'copied' | null> {
  const state = getState();
  const context = askContext(state);
  if (!context) return null;
  const selection = askSelection(state);
  const findings = askFindings(state);
  const body: AskRequest = {
    text,
    file: context.file,
    unitId: context.unitId,
    label: context.label,
    selection: selection ? { file: selection.file, lines: selection.lines } : null,
    concerns: findings.filter(isConcern).map((finding) => finding.concern),
    // named by what they say: the server sends the unit's own along
    breaks: findings.filter(isBreak).map((finding) => finding.text),
  };
  let result: 'sent' | 'copied' | null = null;
  startActivity('ask-send', 'Sending your question…');
  try {
    if (state.ask.data.listening) {
      await api('POST /api/ask', { body });
      setAsk({ error: null, selection: null });
      result = 'sent';
    } else {
      const { text: prompt } = await api('POST /api/ask/prompt', { body });
      await navigator.clipboard.writeText(prompt);
      result = 'copied';
    }
  } catch (error) {
    setAsk({ error: "couldn't send: " + (error as Error).message });
    // a stopped server shows in the status bar as that
    if (!(error instanceof ServerGone)) noteFailure("Couldn't send your question", (error as Error).message);
  } finally {
    endActivity('ask-send');
  }
  void check(askWatcher.id);
  return result;
}
