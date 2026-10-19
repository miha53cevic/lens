// The Ask rail's chat: one per lens server, held in memory. The viewer adds
// questions, `lens ask listen` takes them one at a time, `lens ask reply`
// answers them. Lens never answers anything itself.

import type { Break, Concern } from "../summary/store.ts";

/** One selected row: new-side rows carry their line number, removed rows their old-side one when known. */
export interface AskLine {
  n: number | null;
  side: "new" | "old";
  text: string;
}

export interface AskSelection {
  /** Display path of the file the rows are in */
  file: string;
  lines: AskLine[];
}

/** A `path:line` in an answer that points at a real line. */
export interface AskCite {
  ref: string;
  file: string;
  line: number;
}

export interface AskQuestion {
  /** "q1", "q2", … — short, the agent types it */
  id: string;
  text: string;
  /** Display path of the open file or unit */
  file: string;
  /** The open unit on the Summary tab; null on the Code tab */
  unitId: string | null;
  /** What the rail shows for the change: the unit's name, or the file */
  label: string;
  /** The unit's placed hash (its code and where it is), or the file's content hash — a different one later means stale */
  hash: string;
  selection: AskSelection | null;
  /** The unit's concerns the reader hadn't dismissed when asking; none on the Code tab */
  concerns: Concern[];
  /** The unit's possible breaks the reader hadn't dismissed when asking; none on the Code tab */
  breaks: Break[];
  askedAt: number;
  /** When `listen` handed it to an agent */
  handedAt: number | null;
  answer: { markdown: string; cites: AskCite[]; at: number } | null;
  /** The code it was asked about changed (set on ↻ refresh) */
  stale: boolean;
}

export interface AskState {
  /** An agent is waiting for questions, was a moment ago, or is answering one */
  listening: boolean;
  questions: AskQuestion[];
}

export type NewQuestion = Pick<AskQuestion, "text" | "file" | "unitId" | "label" | "hash" | "selection" | "concerns" | "breaks">;

/**
 * A question handed out this long ago without an answer goes to the next listener (its agent likely died).
 * Until then its agent counts as there: while it answers, it has no listen open.
 */
export const REHAND_AFTER_MS = 5 * 60_000;
/** Between `reply` and the next `listen` there's no open request; still count the agent as there. */
export const LISTEN_GRACE_MS = 30_000;

export interface AskSession {
  add(q: NewQuestion): AskQuestion;
  /** The oldest unanswered question no agent is working on, marked as handed out; null if none. */
  next(): AskQuestion | null;
  /** Sets (or replaces) a question's answer; false for an unknown id. */
  answer(id: string, markdown: string, cites: AskCite[]): boolean;
  get(id: string): AskQuestion | null;
  /** The newest question, if it's still waiting for its answer */
  waiting(): AskQuestion | null;
  /** currentHash(q): the hash of what q was asked about now, null when it's gone. */
  refreshStale(currentHash: (q: AskQuestion) => string | null): void;
  listenStart(): void;
  listenEnd(): void;
  state(): AskState;
}

export function createAskSession(now: () => number = Date.now): AskSession {
  const questions: AskQuestion[] = [];
  let openListens = 0;
  let lastListen = -Infinity;
  /** No listen is open, and none was for a while */
  const noListener = () => openListens === 0 && now() - lastListen >= LISTEN_GRACE_MS;
  /** An agent took a question and may still be answering it */
  const answering = () => {
    const t = now();
    return questions.some((q) => !q.answer && q.handedAt !== null && t - q.handedAt < REHAND_AFTER_MS);
  };

  return {
    add(q) {
      const question: AskQuestion = {
        ...q,
        id: "q" + (questions.length + 1),
        askedAt: now(),
        handedAt: null,
        answer: null,
        stale: false,
      };
      questions.push(question);
      return question;
    },
    next() {
      const t = now();
      const q = questions.find((x) => !x.answer && (x.handedAt === null || t - x.handedAt >= REHAND_AFTER_MS));
      if (!q) return null;
      q.handedAt = t;
      return q;
    },
    answer(id, markdown, cites) {
      const q = questions.find((x) => x.id === id);
      if (!q) return false;
      q.answer = { markdown, cites, at: now() };
      return true;
    },
    get(id) {
      return questions.find((x) => x.id === id) ?? null;
    },
    waiting() {
      const last = questions.at(-1);
      return last && !last.answer ? last : null;
    },
    refreshStale(currentHash) {
      for (const q of questions) q.stale = currentHash(q) !== q.hash;
    },
    listenStart() {
      // nobody listened for a while, so the agent that took a question is gone: this one gets it at once
      if (noListener()) for (const q of questions) if (!q.answer) q.handedAt = null;
      openListens++;
    },
    listenEnd() {
      openListens = Math.max(0, openListens - 1);
      lastListen = now();
    },
    state() {
      return { listening: !noListener() || answering(), questions };
    },
  };
}
