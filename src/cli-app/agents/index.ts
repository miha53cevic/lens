import { claude } from './claude.ts';
import type { AgentId, AgentRunner } from './types.ts';

// The runners, by the config's `agent` value. The only file outside a runner's own that knows
// any of them (test/layers.test.ts): everything else goes through AgentRunner.

const RUNNERS: Record<AgentId, AgentRunner> = { claude };

/** The runner the config picks; null for the user's own agent, through the skills */
export const agentRunner = (id: AgentId | null): AgentRunner | null => (id ? RUNNERS[id] : null);

/** Every runner, for the Settings menu */
export const allRunners = (): AgentRunner[] => Object.values(RUNNERS);

export { agentRuns, runAgent, stopAll, stopRun, STOPPED } from './run.ts';
export * from './types.ts';
