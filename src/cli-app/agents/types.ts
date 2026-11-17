// An agent runner: an agent CLI lens starts itself, headless, to write the summary and answer Ask
// questions (behind the `agent` config). lens says what a run may do (AgentAccess) and each runner
// turns that into its own CLI's flags; starting, timing out and stopping a run is run.ts's, once.

/** The config's `agent` values: one per runner in index.ts */
export const AGENT_IDS = ['claude'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const isAgentId = (value: unknown): value is AgentId => AGENT_IDS.includes(value as AgentId);

/**
 * What a run may do. A runner that can't hold it to that refuses the run (`command` throws)
 * rather than allow more.
 */
export type AgentAccess =
  /** Ask: read the code and git's history; never write */
  | { kind: 'read' }
  /** The summary: also run `lens summary`, and write only under `writeUnder` (absolute) */
  | { kind: 'summary'; writeUnder: string };

export interface AgentTask {
  cwd: string;
  /** Sent on stdin: a long one would pass Windows' command-line limit as an argument */
  prompt: string;
  access: AgentAccess;
  timeoutMs: number;
}

export interface AgentStatus {
  /** The CLI lens would run; null: not installed */
  path: string | null;
  version: string | null;
  /** null: ready. 'unknown': it answered in a way lens can't read, so neither ready nor a problem to report */
  problem: 'missing' | 'logged-out' | 'unknown' | null;
}

export interface AgentRunner {
  id: AgentId;
  /** Only where the agent is picked or checked (the Settings menu, the app's card): elsewhere it's "the agent" */
  name: string;
  /** What the app's card says to run when it's logged out; null when it has no such step */
  loginCommand: string | null;
  status(): Promise<AgentStatus>;
  /** The program and its arguments for a task; throws when it can't run it (not installed, or the access is more than it can limit) */
  command(task: AgentTask): { file: string; args: string[] };
  /** Its final message, from what it printed; throws with why there is none */
  result(stdout: string, code: number | null, stderr: string): string;
}

/** A run going, as the Running dialog lists it */
export interface AgentRunInfo {
  id: string;
  kind: 'summary' | 'ask';
  /** What it's on: the summary's review, or the question */
  label: string;
  /** ms since the epoch */
  startedAt: number;
}
