// What the status bar says. On the left, one status: the strongest thing going on. On the
// right, the standing notices: conditions that last and that the reader can act on.
// Both are lists of sources, so a new feature adds a source here and the bar shows it.

import type { LensState } from '../store.ts';
import { plural } from '../shared.ts';
import { truncate } from '../../cli-app/text.ts';
import { listModel } from './summaryList.ts';

export type StatusKind = 'gone' | 'failed' | 'working' | 'waiting' | 'done' | 'idle';
/** What the status's button does (the handlers are in components/StatusBar/const.ts) */
export type StatusActionId = 'retry' | 'dismiss' | 'openAsk';

export interface Status {
  kind: StatusKind;
  /** The short, strong part: "Refresh failed" */
  label: string;
  /** The rest, in muted text: the reason, the count, the wait */
  detail: string | null;
  action: StatusActionId | null;
}

type StatusSource = (state: LensState) => Status | null;

/** The slow action `id` ('theme', 'refresh' …) is under way: its control waits for it. */
export function isBusy(state: LensState, id: string): boolean {
  return state.activities.some((activity) => activity.id === id);
}

/** The newest question, while it waits for its answer. */
export function waitingQuestion(state: LensState) {
  const questions = state.ask.data.questions;
  const last = questions[questions.length - 1];
  return last && !last.answer ? last : null;
}

const serverStopped: StatusSource = (state) =>
  state.serverGone
    ? { kind: 'gone', label: 'Server stopped', detail: "This page can't refresh or load anything", action: 'retry' }
    : null;

const failure: StatusSource = (state) =>
  state.notice?.kind === 'failed'
    ? { kind: 'failed', label: state.notice.label, detail: state.notice.detail ?? null, action: 'dismiss' }
    : null;

const working: StatusSource = (state) => {
  // the newest action that has run long enough to say so
  const activity = state.activities.findLast((candidate) => candidate.shown);
  return activity ? { kind: 'working', label: activity.label, detail: null, action: null } : null;
};

const waitingForAgent: StatusSource = (state) => {
  const question = waitingQuestion(state);
  if (!question) return null;
  const action = state.ask.open ? null : 'openAsk';
  // nobody will answer it: say that instead of counting the wait
  if (!state.ask.data.listening) {
    return { kind: 'waiting', label: 'No agent for your question', detail: 'run /lens-ask in your agent', action };
  }
  const seconds = Math.max(0, Math.round((Date.now() - question.askedAt) / 1000));
  return {
    kind: 'waiting',
    label: 'Waiting for your agent',
    detail: seconds + ' s',
    action,
  };
};

const doneNote: StatusSource = (state) =>
  state.notice?.kind === 'done'
    ? { kind: 'done', label: state.notice.label, detail: state.notice.detail ?? null, action: null }
    : null;

/** Strongest first: the first source with something to say is the bar's status. */
const STATUS_SOURCES: StatusSource[] = [serverStopped, failure, working, waitingForAgent, doneNote];

/** The bar's status. Its fields are plain values, so a selector can return it as it is. */
export function barStatus(state: LensState): Status {
  for (const source of STATUS_SOURCES) {
    const status = source(state);
    if (status) return status;
  }
  return { kind: 'idle', label: 'Ready', detail: null, action: null };
}

export type NoticeTone = 'warn' | 'accent' | 'live';
export type NoticeActionId = 'openOverview' | 'openSummary' | 'refresh';

export interface Notice {
  id: string;
  text: string;
  tone: NoticeTone;
  /** null: a fact, with nothing to click */
  action: NoticeActionId | null;
}

type NoticeSource = (state: LensState) => Notice | null;

const staleSummaries: NoticeSource = (state) => {
  // hide tests: the count follows the list
  const stale = listModel(state)?.units.filter((unit) => unit.stale).length ?? 0;
  if (stale === 0) return null;
  const text = stale === 1 ? '1 summary out of date' : stale + ' summaries out of date';
  return { id: 'stale-summaries', text, tone: 'warn', action: 'openOverview' };
};

const changedOnDisk: NoticeSource = (state) =>
  // known only from the stamp poll, which sets it and takes it back (see stampWatcher)
  state.changedOnDisk && state.data.canRefresh && !state.serverGone
    ? { id: 'changed-on-disk', text: 'Code changed on disk · Refresh', tone: 'warn', action: 'refresh' }
    : null;

const newSummary: NoticeSource = (state) =>
  state.summaryDot ? { id: 'new-summary', text: 'New summary waiting', tone: 'accent', action: 'openSummary' } : null;

const agentListening: NoticeSource = (state) => {
  // only while the chat is polled (the rail is open, or a question waits): otherwise it's a guess
  const live = state.ask.open || waitingQuestion(state) !== null;
  return live && state.ask.data.listening && !state.serverGone
    ? { id: 'agent', text: 'Agent listening', tone: 'live', action: null }
    : null;
};

const summaryBuilding: NoticeSource = (state) => {
  // known only from the stamp poll, which sets it and takes it back once the run is done (an agent that stopped leaves it shown)
  const build = state.summaryBuild;
  if (!build || state.serverGone) return null;
  const progress = build.finalPass ? 'final pass' : build.done + ' of ' + plural(build.total, 'unit');
  return { id: 'summary-build', text: 'Agent writing summary · ' + progress, tone: 'live', action: null };
};

const summaryElsewhere: NoticeSource = (state) =>
  // known only from the stamp poll, which takes it back once this review's own run moves
  state.summaryElsewhere && !state.serverGone
    ? {
        id: 'summary-elsewhere',
        text: 'Agent summarized another review · ' + truncate(state.summaryElsewhere.command, 40),
        tone: 'warn',
        action: null,
      }
    : null;

const NOTICE_SOURCES: NoticeSource[] = [
  changedOnDisk,
  staleSummaries,
  newSummary,
  summaryBuilding,
  summaryElsewhere,
  agentListening,
];

// The last list: the same array comes back while what it says stays the same, so the bar's
// selector doesn't re-render it on every change.
let lastNotices: Notice[] = [];

export function barNotices(state: LensState): Notice[] {
  const notices = NOTICE_SOURCES.flatMap((source) => source(state) ?? []);
  if (JSON.stringify(notices) !== JSON.stringify(lastNotices)) lastNotices = notices;
  return lastNotices;
}

/** "3 files changed", or "nothing changed": what a refresh did, from each file's content key before and after. */
export function changeNote(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string {
  let changed = 0;
  for (const [path, key] of after) if (before.get(path) !== key) changed++;
  for (const path of before.keys()) if (!after.has(path)) changed++;
  return changed === 0 ? 'nothing changed' : plural(changed, 'file') + ' changed';
}
