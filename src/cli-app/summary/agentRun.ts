import { join } from 'node:path';
import { runAgent, STOPPED, type AgentRunner } from '../agents/index.ts';
import { lensDir } from './store.ts';
import type { AgentSummaryRun } from '../api/contract.ts';

// The Summary, written by the picked agent (the `agent` config): the same run /lens-review gives
// the user's own agent. It runs `lens summary prepare` and `submit` itself, so the run shows where
// it got to (progress.ts) and is checked (validate.ts) as any agent's is.

/** Past this a run has gone wrong: a big diff's whole run takes minutes, not this */
const SUMMARY_TIMEOUT_MS = 15 * 60 * 1000;

/** The task, as lens-build-review's subagent gets it. `prepare`: the prepare command (SummaryView.cli). */
export function summaryPrompt(prepare: string): string {
  return `Run \`${prepare}\` and follow the instructions it prints exactly: read the tasks, research
callers in the repo, write result.json, run \`lens summary submit\`, fix anything it rejects and
submit once more. If the tasks come in parts, do them one after another yourself, then finish with
the final pass (flows and the overview) the instructions describe. Don't spawn subagents.
Every bug or risk you notice goes into the unit's \`concerns\` — the user reads the viewer, not your reply.
Run each command on its own, as the instructions write it: no pipes, \`&&\`, \`;\` or \`cd\`, which are refused.
Write files only under .lens/summary/.
Reply with only: the concerns you recorded (unit id, kind and one line each), and anything submit still rejected.`;
}

export interface SummaryRunner {
  /** Starts a run of `prepare` (SummaryView.cli) in `cwd`; false when one is going already */
  start(opts: { runner: AgentRunner; cwd: string; root: string; prepare: string; label: string }): boolean;
  state(): AgentSummaryRun;
  /** When the reader last stopped a run (ms since the epoch); null when no run was stopped since one started */
  stoppedAt(): number | null;
}

export function createSummaryRunner(): SummaryRunner {
  let run: AgentSummaryRun = { running: false, error: null };
  let stoppedAt: number | null = null;
  return {
    start({ runner, cwd, root, prepare, label }) {
      if (run.running) return false;
      run = { running: true, error: null };
      stoppedAt = null;
      runAgent(
        runner,
        {
          cwd,
          prompt: summaryPrompt(prepare),
          access: { kind: 'summary', writeUnder: join(lensDir(root), 'summary') },
          timeoutMs: SUMMARY_TIMEOUT_MS,
        },
        { kind: 'summary', label },
      ).then(
        () => (run = { running: false, error: null }),
        (err: Error) => {
          run = { running: false, error: err.message };
          if (err.message === STOPPED) stoppedAt = Date.now();
        },
      );
      return true;
    },
    state: () => run,
    stoppedAt: () => stoppedAt,
  };
}
