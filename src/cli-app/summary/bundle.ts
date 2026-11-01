import { writeFileSync, readdirSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { relPath } from '../paths.ts';
import { citeableLabels, removalAnchors, type Unit } from './units.ts';
import { PREVIEW_MAX_BYTES } from './previews.ts';
import { fitStored } from './fit.ts';
import { MAX_USAGES, usagesOutside, type Usages } from './usages.ts';
import {
  bundleDir,
  HOUSEKEEPING,
  isHousekeeping,
  needsFlows,
  PREVIEWS_DIR,
  readStored,
  summaryArgs,
  unitSetHash,
  writeStored,
  type Bundle,
  type BundleUnit,
  type StoredSummary,
  type UnitSummary,
} from './store.ts';

// `lens summary prepare` output: a folder the user's agent reads (tasks,
// instructions, schema) plus bundle.json, which `submit` validates against.

export const LIMITS = {
  headline: 80,
  gist: 40,
  cell: 60,
  breakSummary: 160,
  concern: 300,
  flowTitle: 40,
  flowPath: 60,
  layer: 12,
  why: 100,
  overview: 2000,
  overviewTitle: 60,
  previewTitle: 40,
  lane: 20,
  lanes: 6,
  stepLabel: 40,
  steps: 16,
  planItems: 40,
  planText: 120,
  planQuote: 200,
  planNote: 160,
  checksPerFlow: 3,
  checkQuestion: 160,
  checkAnswer: 300,
  sentHow: 120,
};

/** The biggest preview file, as the instructions say it */
const PREVIEW_KB = PREVIEW_MAX_BYTES / 1000;

/** Rendered lines per tasks file before splitting into tasks-2.md, … */
const TASK_FILE_BUDGET = 1500;

export interface PrepareInput {
  root: string;
  cwd: string;
  key: string;
  command: 'diff' | 'pr';
  args: string[];
  label: string | null;
  commits: string;
  units: Unit[];
  /** New-side sources by repo-relative path */
  sources: Map<string, string>;
  /** Build previews is on: the whole-diff pass asks for previews of changed screens and sequences */
  drawings?: boolean;
  /** The plan the build followed, repo-relative (`--plan`, or the last prepare's): the whole-diff pass measures the diff against it */
  plan?: string;
  /** Self-checks are on: the whole-diff pass asks for them */
  checks?: boolean;
  /** The findings the reader last sent back, and the code they were sent on (rounds/) */
  sent?: { key: string; text: string; place: string }[];
}

/** Files that draw UI without being a component or a hook lens can name */
const UI_FILE = /\.(css|scss|sass|less|html|vue|svelte|astro)$/i;

/** A unit that changes what a screen looks like: a component, a hook, or a style or markup file. */
export function isUiUnit(unit: { kind: string; file: string }): boolean {
  return unit.kind === 'component' || unit.kind === 'hook' || UI_FILE.test(unit.file);
}

export interface PrepareResult {
  dir: string;
  taskFiles: string[];
  todo: number;
  done: number;
  instructions: string;
}

export function prepareBundle(input: PrepareInput): PrepareResult {
  const dir = bundleDir(input.root, input.key);
  const stored = readStored(input.root, input.key);
  const fileCache = new Map<string, string[] | null>();
  const bundleUnits: BundleUnit[] = input.units.map((u) => {
    const unit = {
      id: u.id,
      file: u.file,
      name: u.name,
      kind: u.kind,
      status: u.status,
      hash: u.hash,
      anchor: u.anchor,
      labels: [...citeableLabels(u)],
      ranges: u.ranges,
      ...(u.formattingOnly ? { formattingOnly: true } : {}),
      ...(u.importsOnly ? { importsOnly: true } : {}),
    };
    return { ...unit, done: fitStored(stored?.units[u.id], unit, input.root, fileCache) !== null };
  });
  // a summary for this very code that no longer checks out (a caller moved) goes: then every
  // "is it summarized" check agrees with this pass, which asks for it again
  const unfit = bundleUnits.filter((u) => !u.done && stored?.units[u.id]?.hash === u.hash);
  if (stored && unfit.length > 0) {
    for (const u of unfit) delete stored.units[u.id];
    writeStored(input.root, input.key, stored);
  }
  // import-only and formatting-only units say nothing an agent would add to: lens writes them itself
  const filed = bundleUnits.filter((u) => !u.done && isHousekeeping(u));
  // what the agent summarized before: lens's own units don't make this pass a partial one
  const prior = bundleUnits.filter((u) => u.done && !isHousekeeping(u)).length;
  const housekeeping = bundleUnits.filter(isHousekeeping).length;
  let summaries = stored;
  if (filed.length > 0) {
    summaries = stored ?? { version: 1, updatedAt: '', units: {}, flows: [] };
    for (const u of filed) {
      summaries.units[u.id] = { ...housekeepingSummary(u), hash: u.hash, anchor: u.anchor };
      u.done = true;
    }
    summaries.updatedAt = new Date().toISOString();
    writeStored(input.root, input.key, summaries);
  }
  const bundle: Bundle = {
    version: 1,
    key: input.key,
    command: input.command,
    args: input.args,
    createdAt: new Date().toISOString(),
    units: bundleUnits,
    ...(input.drawings ? { drawings: true } : {}),
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.checks ? { checks: true } : {}),
    ...(input.sent?.length ? { sent: input.sent.map((finding) => finding.key) } : {}),
  };

  // Stale task files from a bigger earlier diff must not linger, nor an earlier pass's preview files.
  for (const f of readdirSync(dir)) {
    if (/^tasks(-\d+)?\.md$/.test(f) || f === 'result.json') unlinkSync(join(dir, f));
  }
  rmSync(join(dir, PREVIEWS_DIR), { recursive: true, force: true });
  if (input.drawings) mkdirSync(join(dir, PREVIEWS_DIR));

  const todo = input.units.filter((_, i) => !bundleUnits[i].done);
  const usages = todo.length > 0 ? usagesOutside(input.root, input.units) : new Map<string, Usages>();
  const header = contextHeader(input);
  const chunks: string[][] = [[]];
  let used = 0;
  for (const unit of todo) {
    const rendered = renderUnit(unit, input.sources.get(unit.file), usages.get(unit.id));
    const size = rendered.split('\n').length;
    if (used > 0 && used + size > TASK_FILE_BUDGET) {
      chunks.push([]);
      used = 0;
    }
    chunks[chunks.length - 1].push(rendered);
    used += size;
  }
  const taskFiles: string[] = [];
  // every unit is done but the overview is missing or was written for other code:
  // the final pass — flows and the overview, from every unit's stored summary.
  // A diff split into parts gets its flows here, where one context sees all units.
  // the whole-diff work is done once the overview fits this diff and flows exist (a flow needs 2+ units)
  const storyDone =
    summaries?.overview?.hash === unitSetHash(bundleUnits) && (summaries.flows.length > 0 || !needsFlows(bundleUnits));
  // with Build previews on, the whole-diff pass also draws: done once a pass that asked was submitted for this diff
  const drawingsDone = !input.drawings || summaries?.drawn === unitSetHash(bundleUnits);
  const planDone =
    !input.plan || (summaries?.plan?.hash === unitSetHash(bundleUnits) && summaries.plan.file === input.plan);
  const checksDone = !input.checks || summaries?.checked === unitSetHash(bundleUnits);
  const wholeDone = storyDone && drawingsDone && planDone && checksDone;
  const finalPass = todo.length === 0 && summaries !== null && !wholeDone;
  if (finalPass && summaries) {
    const name = join(dir, 'tasks.md');
    writeFileSync(
      name,
      `# lens summary tasks (final pass: flows and overview)\n\n${header}\n${renderHeadlines(input.units, summaries, input.sources)}`,
    );
    taskFiles.push(name);
  }
  if (todo.length > 0) {
    chunks.forEach((chunk, i) => {
      const name = chunks.length === 1 ? 'tasks.md' : `tasks-${i + 1}.md`;
      const part = chunks.length === 1 ? '' : ` (part ${i + 1} of ${chunks.length})`;
      writeFileSync(join(dir, name), `# lens summary tasks${part}\n\n${header}\n${chunk.join('\n')}`);
      taskFiles.push(join(dir, name));
    });
  }

  // a fresh run in one part sees every unit: the ones lens filed itself don't need seeing
  if (finalPass || (prior === 0 && taskFiles.length === 1)) bundle.wholeDiff = true;
  writeFileSync(join(dir, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n');
  writeFileSync(join(dir, 'schema.json'), JSON.stringify(RESULT_SCHEMA, null, 2) + '\n');
  const doneCount = bundleUnits.filter((u) => u.done).length;
  const instructions = finalPass
    ? renderFinalPassInstructions(input, dir, taskFiles[0], storyDone, drawingsDone, planDone, checksDone)
    : renderInstructions(input, dir, taskFiles, todo.length, prior, housekeeping, wholeDone);
  writeFileSync(join(dir, 'instructions.md'), instructions);
  return { dir, taskFiles, todo: todo.length, done: doneCount, instructions };
}

/** The summary lens writes for a unit it files under Housekeeping. */
export function housekeepingSummary(unit: { importsOnly?: boolean }): UnitSummary {
  const [headline, gist] = unit.importsOnly
    ? ['Changes only its imports', 'imports only']
    : ['Changes only whitespace', 'formatting only'];
  return { headline, gist, needsLook: false, changes: [], breaks: [], concerns: [] };
}

/**
 * The final pass's map of the diff: the units by file, each with its size, its headline and
 * the other changed units its code names (a plain text match), so the agent sees what goes
 * together. The units lens files under Housekeeping are named once, at the end.
 */
function renderHeadlines(units: Unit[], stored: StoredSummary, sources: Map<string, string>): string {
  const mentions = mentionsOf(units, sources);
  const byFile = new Map<string, Unit[]>();
  for (const u of units.filter((u) => !isHousekeeping(u))) byFile.set(u.file, [...(byFile.get(u.file) ?? []), u]);
  const out: string[] = [];
  for (const [file, fileUnits] of byFile) {
    out.push(`### ${file}`);
    for (const u of fileUnits) {
      const s = stored.units[u.id];
      const removed = u.removals.reduce((n, b) => n + b.lines.length, 0);
      const size = [u.changedLines.length > 0 ? `+${u.changedLines.length}` : '', removed > 0 ? `−${removed}` : '']
        .filter(Boolean)
        .join(' ');
      const marks = [u.kind, u.status, size, ...(s?.breaks.length ? ['may break callers'] : [])].filter(Boolean);
      out.push(`- \`${u.id}\` (${marks.join(', ')}): ${s ? `${s.headline} — ${s.gist}` : 'no summary'}`);
      const names = mentions.get(u.id) ?? [];
      if (names.length > 0) out.push(`  names: ${names.map((id) => `\`${id}\``).join(', ')}`);
      for (const c of s?.concerns ?? []) out.push(`  - ${c.kind}: ${c.text}`);
    }
    out.push('');
  }
  const filed = units.filter(isHousekeeping);
  if (filed.length > 0) {
    out.push(
      `Lens files these under "${HOUSEKEEPING}" itself (import-only or formatting-only): leave them out of your flows.`,
    );
    out.push(...filed.map((u) => `- \`${u.id}\``), '');
  }
  return out.join('\n');
}

/** Most names listed per unit: past that, the list stops helping */
const MAX_MENTIONS = 6;

/** For each unit, the other changed units whose name appears in its shown or removed code. */
function mentionsOf(units: Unit[], sources: Map<string, string>): Map<string, string[]> {
  const named = units
    .map((u) => ({ id: u.id, name: u.name.split('.').pop() ?? u.name }))
    .filter((u) => /^[A-Za-z_$][\w$]{2,}$/.test(u.name))
    .map((u) => ({ id: u.id, pattern: new RegExp(`(^|[^\\w$])${u.name.replace(/\$/g, '\\$')}([^\\w$]|$)`) }));
  const fileLines = new Map<string, string[]>();
  const out = new Map<string, string[]>();
  for (const u of units) {
    let lines = fileLines.get(u.file);
    if (!lines) fileLines.set(u.file, (lines = sources.get(u.file)?.split('\n') ?? []));
    const code = [
      ...u.ranges.flatMap((r) => lines.slice(r.start - 1, r.end)),
      ...u.removals.flatMap((b) => b.lines),
    ].join('\n');
    const found = named.filter((other) => other.id !== u.id && other.pattern.test(code)).map((other) => other.id);
    if (found.length > 0) out.set(u.id, found.slice(0, MAX_MENTIONS));
  }
  return out;
}

function contextHeader(input: PrepareInput): string {
  const parts = [`Diff: \`lens ${input.command} ${input.args.join(' ')}\`${input.label ? ` (${input.label})` : ''}`];
  if (input.commits) parts.push(`Commits:\n${input.commits}`);
  return parts.join('\n\n') + '\n';
}

/**
 * One unit as the agent sees it: `N14 + code` for changed new lines (citeable),
 * `O16 - code` for removed old lines (citeable), `  15   code` for context.
 */
export function renderUnit(unit: Unit, source: string | undefined, usages?: Usages): string {
  const lines = source?.split('\n') ?? [];
  const width = Math.max(
    4,
    ...unit.ranges.map((r) => String(r.end).length + 1),
    ...unit.removals.map((b) => String(b.oldStart + b.lines.length).length + 1),
  );
  const changed = new Set(unit.changedLines);
  const out: string[] = [];
  const removedAt = removalAnchors(unit);
  const emitRemovals = (after: number) => {
    for (const b of removedAt.get(after) ?? []) {
      b.lines.forEach((text, i) => out.push(`${('O' + (b.oldStart + i)).padStart(width)} - ${text}`));
    }
  };
  if (unit.ranges.length === 0) emitRemovals(0);
  unit.ranges.forEach((r, ri) => {
    if (ri > 0) out.push(`${''.padStart(width)}   ⋯`);
    emitRemovals(r.start - 1);
    for (let l = r.start; l <= r.end; l++) {
      const text = lines[l - 1] ?? '';
      out.push(changed.has(l) ? `${('N' + l).padStart(width)} + ${text}` : `${String(l).padStart(width)}   ${text}`);
      emitRemovals(l);
    }
  });

  const meta: string[] = [unit.kind, unit.status];
  if (unit.formattingOnly) meta.push(`formatting only (whitespace): lens files it under "${HOUSEKEEPING}"`);
  if (unit.importsOnly) meta.push(`imports only: lens files it under "${HOUSEKEEPING}"`);
  const where =
    unit.ranges.length > 0 ? ` · lines ${unit.ranges[0].start}–${unit.ranges[unit.ranges.length - 1].end}` : '';
  const code = out.join('\n');
  // a fence longer than any run of backticks in the code: a changed README's own fences don't end it
  const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map((run) => run[0].length + 1)));
  return `## ${unit.id}\n${meta.join(' · ')}${where}\n\n${fence}\n${code}\n${fence}\n${usages ? renderUsages(usages) : ''}`;
}

/** The lines outside the diff that name the unit, under its code. */
function renderUsages(usages: Usages): string {
  if (usages.lines.length === 0) return `\nOutside the diff, no line names \`${usages.name}\`.\n`;
  const more = usages.more > 0 ? [`- … and ${usages.more} more: \`git grep -nw ${usages.name}\``] : [];
  return `\nOutside the diff, \`${usages.name}\` is named at:\n${[...usages.lines.map((line) => `- ${line}`), ...more].join('\n')}\n`;
}

function renderInstructions(
  input: PrepareInput,
  dir: string,
  taskFiles: string[],
  todo: number,
  done: number,
  filed: number,
  wholeDone: boolean,
): string {
  const rel = (p: string) => relPath(input.cwd, p);
  const resultPath = rel(join(dir, 'result.json'));
  const files = taskFiles.map((f) => `\`${rel(f)}\``).join(', ');
  if (todo === 0) {
    return (
      `# lens summary\n\nNothing to do: all ${done + filed} units already have a summary for their current code.\n` +
      `Tell the user to open the Summary tab in the lens viewer (refresh with ↻).\n`
    );
  }
  // flows need every unit in view: split or partial runs leave them to the final pass —
  // unless this diff's flows and overview are already written (units left over from a rejected submit)
  const deferred = !wholeDone && (taskFiles.length > 1 || done > 0);
  return `# lens summary — instructions for the agent

You are writing a review summary of a code diff for the lens viewer. Lens split the
diff into ${todo} units (functions, components, hooks, methods, types, …)${done > 0 ? `; ${done} more are already summarized and skipped` : ''}${filed > 0 ? `; lens summarizes the ${filed} import-only or formatting-only ${filed === 1 ? 'one' : 'ones'} itself` : ''}.
Tasks: ${files}

If you can, do this in a fresh context or a subagent, not in the session that wrote
the code — reviewing your own work hides its blind spots. Use one subagent at most, for
the whole run: it reads every task file in turn and does its own searching. Don't
spawn a subagent per part, per unit or per search.

## Steps
1. Read the task file(s). Each unit shows its code: \`N14 + …\` is a changed new line,
   \`O16 - …\` a removed old line, \`  15   …\` unchanged context.
2. For each unit, understand what changed in behavior. Use the repository freely.
   Under a named unit's code, the tasks list the lines outside the diff that name it (a
   plain text match over the working tree, up to ${MAX_USAGES}): those are its likely callers. Read
   them rather than searching again. Search yourself only when the list is cut off, or the
   unit is reached another way (an alias, a re-export under another name, a string key).
3. Write \`${resultPath}\` following \`${rel(join(dir, 'schema.json'))}\`.
4. Run \`lens summary submit ${rel(dir)}\`. It prints what it rejected and why: fix those
   entries and submit once more. Submits merge, so for multi-part tasks you may submit
   after each part.
${
  deferred
    ? `5. Once every unit is submitted, run \`${prepareCommand(input)}\` again: it writes the final
   pass — flows and the overview, from all units at once.
`
    : ''
}
## Per unit
- \`headline\` (≤${LIMITS.headline} chars): what the unit does now, in plain words.
- \`gist\` (≤${LIMITS.gist} chars): the key change, e.g. "returns max 50 by default".
- \`changes\`: behavior differences as rows {when, before, now, line}, each ≤${LIMITS.cell} chars:
  "Called without a limit" | "returns all orders" | "returns the first 50" | "N18".
  \`when\` is a situation (an input, a state, a caller); \`before\` and \`now\` are what
  observably happens in it. \`line\` must be one of the unit's changed (N…) or removed (O…)
  labels — the line that causes the difference. \`before\` is null for new behavior. An
  empty list is fine: don't invent differences.
- \`concerns\`: bugs that matter, as {kind, text (≤${LIMITS.concern}), line}. \`kind\` is "bug"
  (wrong behavior likely in normal use), "risk" (data loss, a security hole or silent
  corruption, even if rarer) or "question" (the intent is unclear and decides whether it's
  a bug). \`line\` may be any line shown for the unit — N… (changed or not) or O….
  The rules:
  - Internal callers and the project's own services are trusted. Flag missing validation
    only at a system boundary (user input, the network, files, external APIs).
  - \`text\` names a concrete input or sequence that triggers it and how it's reachable
    here, then the smallest fix — prefer removing code or tightening a type over adding
    a branch. E.g. "Empty \`ids\` from the search box → \`ids[0].trim()\` throws. Fix: type
    \`ids\` as a non-empty tuple at the route." If you can't name the trigger, drop it.
  - End your chat reply with the findings you dropped as unlikely, one line each.
  Concerns and breaks are the only way to mark a unit for a close look. Routine changes
  (renames, types, formatting) get neither.
- \`breaks\`: callers outside the diff that this change breaks: {summary (≤${LIMITS.breakSummary}),
  callers: ["path/from/repo/root.ts:31", …]}. Each caller line must exist and contain
  the unit's name. Hold a break to the same bar as a concern:
  - Read each caller first. List it only if you can say what wrong thing happens there:
    the change, then the call that goes wrong. E.g. "Returns \`null\` for a missing user
    now; the call reads \`.name\` on it and throws." If you can't, drop it.
  - Not a break: a caller that still works, one that only mentions the name (an import,
    a re-export, a test of the old shape), one that's in the diff, or a mismatch the type
    checker or compiler reports (changed parameters, a removed export).
  - Don't mention the breaks you dropped.
- \`renamedFrom\`: for a new unit that is a renamed/moved deleted unit, the deleted unit's id.

${
  wholeDone
    ? `## Flows and overview
Already written for this diff — leave them out.
`
    : deferred
      ? `## Flows and overview
Not in this pass — the final pass (step 5) asks for them, once every unit is summarized.
`
      : `## Flows
${FLOWS_RULE}

## Overview
${OVERVIEW_RULE}
${drawingRules(input, dir)}${planRules(input)}${checkRules(input)}`
}${sentRules(input)}
Keep everything terse: the viewer shows it in a small table next to the code.
`;
}

const FLOWS_RULE = `Flows are how the reviewer reads the diff: they open a flow and walk its units in order.
- A flow is one story: one thing the diff sets out to do, named the way you'd name it in a
  commit or a PR description ("Agent writes a whole-diff overview"). Not how the code calls
  itself ("validateResult → checkUnit"), and not a file or folder: the viewer's map already
  groups by those. The commits are a strong hint; a commit that fixes an earlier one in the
  same diff belongs to that one's story.
- Most diffs tell 1–5 stories. Before splitting one in two, ask whether a reviewer would
  read the halves apart; a flow of one file's functions is usually part of a bigger story.
- Every unit goes in exactly one flow, including the types, schema, config, tests, styles
  and docs a story needs: they are that story's later steps, not a flow of their own.
- What no story needs (a move, a rename, a formatting pass) goes in one flow titled
  "${HOUSEKEEPING}", priority 3. Lens files import-only and formatting-only units there
  itself: leave those out.
- {title (≤${LIMITS.flowTitle}), path (≤${LIMITS.flowPath}), units: {"<unit id>": "<step ≤${LIMITS.layer}>"}, priority, why (≤${LIMITS.why})}.
- \`path\` names the story's reading steps, e.g. "contract → logic → page → tests", and each
  unit's value is its step. List \`units\` in reading order: what the rest builds on first
  (types, schema), then the logic, then its callers and UI, then tests and docs.
- \`priority\`: 1 = review first (behavior changes, risks, possible bugs), 2 = normal,
  3 = mechanical (renames, moves, types, tests). The viewer sorts by it and folds the 3s.
- \`why\`: why a reviewer should care, e.g. "default page size changes every caller".`;

const OVERVIEW_RULE = `\`overview\`: {title (≤${LIMITS.overviewTitle} chars), what (≤${LIMITS.overview} chars)}. \`title\` names the change the way
you'd title a PR, "The Summary list becomes an inbox": the viewer's biggest text. \`what\`: what the whole diff does and why, for a
reviewer seeing it for the first time. Size it to what the diff does, not to its
line count: a sentence or two for one focused change; a short paragraph per distinct
change when it does several things (blank line between paragraphs). Name behavior,
not files; don't repeat unit headlines or walk through the diff file by file.`;

function renderFinalPassInstructions(
  input: PrepareInput,
  dir: string,
  tasks: string,
  storyDone: boolean,
  drawingsDone: boolean,
  planDone: boolean,
  checksDone: boolean,
): string {
  const rel = (p: string) => relPath(input.cwd, p);
  const asked = [
    ...(storyDone ? [] : ['"flows": [ … ]', '"overview": {"title": "…", "what": "…"}']),
    ...(drawingsDone ? [] : drawingFields(input)),
    ...(planDone ? [] : ['"plan": { … }']),
    ...(checksDone ? [] : ['"checks": [ … ]']),
  ];
  const what = storyDone
    ? `${planDone && checksDone ? 'the drawings' : 'the rest of the work'} of the whole diff (its flows and overview are written)`
    : 'the flows and\nthe overview of the whole diff';
  return `# lens summary — instructions for the agent

Every unit of this diff already has a summary. This is the final pass: ${what}. Tasks: \`${rel(tasks)}\` lists each unit with its headline,
gist, and any concerns, by file.

1. Read the task file. Look at the diff itself if the headlines aren't enough.
2. Write \`${rel(join(dir, 'result.json'))}\` as
   \`{"units": {}, ${asked.join(', ')}}\`, following \`${rel(join(dir, 'schema.json'))}\`.
3. Run \`lens summary submit ${rel(dir)}\`. It names the units your flows leave out and the
   flows that look split up: fix those and submit again.
${
  storyDone
    ? ''
    : `
## Flows
${FLOWS_RULE}

## Overview
${OVERVIEW_RULE}
`
}${drawingsDone ? '' : drawingRules(input, dir)}${planDone ? '' : planRules(input)}${checksDone ? '' : checkRules(input)}${sentRules(input)}`;
}

/** The diff against the plan, while the review knows one. */
function planRules(input: PrepareInput): string {
  if (!input.plan) return '';
  return `
## Plan
The build followed \`${input.plan}\`. Read it, then measure the diff against it.
- \`plan.items\`: one per thing the plan asks for, up to ${LIMITS.planItems}, in its order: {text (≤${LIMITS.planText}), quote
  (≤${LIMITS.planQuote}), status, units, note}. \`quote\` is copied word for word from the plan's text, and submit checks it's
  there: it's how the reader finds the item. \`text\` says it in plain words.
- \`status\`: "done", "partly" or "missing", as you read the code, not as commits say. \`units\` lists the units that do
  it (none for a missing item). \`note\` (≤${LIMITS.planNote}), required unless it's done: what's left, and why if you can tell.
- \`plan.unplanned\`: {unit, note (≤${LIMITS.planNote})} for each unit no plan item needs: what it does beyond the plan.
- Every unit goes in an item or in unplanned, but for the ones lens files itself. A helper an item needs is part of
  that item, not unplanned. Don't soften this list: it's what the reader reads this for.
`;
}

/** Questions the reader can check their understanding with, while they've turned them on. */
function checkRules(input: PrepareInput): string {
  if (!input.checks) return '';
  return `
## Check yourself
\`checks\`: up to ${LIMITS.checksPerFlow} per flow, for flows a reviewer must understand (not "${HOUSEKEEPING}"): {flow (its title), question
(≤${LIMITS.checkQuestion}), answer (≤${LIMITS.checkAnswer}), unit, line}. Ask what someone who read the change can answer and someone who
skimmed it can't: what happens in a concrete situation, what would break if a line went. Not trivia about names, and
not a quiz on the plan. \`line\` is a line of \`unit\` (N… or O…) where the answer shows.
`;
}

/** The findings the reader sent back: the agent says whether the code fixes each now. */
function sentRules(input: PrepareInput): string {
  if (!input.sent?.length) return '';
  const list = input.sent.map((finding, i) => `${i + 1}. ${finding.place}: ${finding.text}`).join('\n');
  return `
## What the reviewer sent back
The reviewer sent these for fixing. Lens sees only whether their lines changed; you say whether each is really fixed.
${list}
\`sent\`: {"<number above>": {fixed (true or false), how (≤${LIMITS.sentHow}), unit, line}}: \`how\` says what fixes it or what's still
wrong, \`unit\` and \`line\` (N… or O…) where that shows. Leave out one that the code doesn't touch.
`;
}

/** The result fields the drawings add, for the final pass's one-line shape */
function drawingFields(input: PrepareInput): string[] {
  if (!input.drawings) return [];
  return [...(input.units.some(isUiUnit) ? ['"previews": [ … ]'] : []), '"sequences": [ … ]'];
}

/** Previews of changed screens (a diff with UI units) and sequence diagrams, while Build previews is on. */
function drawingRules(input: PrepareInput, dir: string): string {
  if (!input.drawings) return '';
  const ui = input.units.filter(isUiUnit);
  const folder = relPath(input.cwd, join(dir, PREVIEWS_DIR));
  const names =
    ui
      .slice(0, 8)
      .map((u) => `\`${u.id}\``)
      .join(', ') + (ui.length > 8 ? ', …' : '');
  const previews =
    ui.length === 0
      ? ''
      : `
## Previews
This diff changes UI (${names}). Draw the screens it changes, so the reviewer sees what the
change looks like without running the app.
- One preview per screen the diff visibly changes (a page, a dialog, a panel): 1–4 for most
  diffs, none when nothing visible changes. \`units\` lists every unit the screen shows changed.
- A preview is a screen, never a component: components that render on the same screen share
  its one preview, each marked where it sits. A diff that changes a checkout page's code
  field, its summary line and its total is one preview, "Checkout", with all three units.
  Only a component that shows on two screens the reviewer would look at apart gets two.
- Find the project's design system first: its theme or Tailwind config, CSS variables and
  design tokens, the component library, the global styles; then the components these units
  render. Draw with those colors, type, spacing and radii, so it looks like the app.
- A skeleton: what the diff doesn't touch is plain grey blocks the size of what's there; only
  the changed parts are drawn for real, with realistic content.
- Mark each changed element with \`data-lens-unit="<unit id>"\` and \`data-lens-change="added"\`
  (or "changed", "removed"). The viewer outlines them.
- One self-contained HTML file per state, in \`${folder}/\`: inline \`<style>\` only, ≤${PREVIEW_KB} KB.
  No scripts, \`<link>\`, forms or event handlers, and nothing from outside: system fonts, and an
  image is a grey box or a data: URL. Lay it out fluid for a frame about 800px wide.
- \`before\`: a second file for the screen before the change, only when something visible was
  removed or moved; mark what goes with data-lens-change="removed". A new screen has none.
- {title (≤${LIMITS.previewTitle}), units: ["<unit id>", …], now: "${PREVIEWS_DIR}/<name>.html", before: "${PREVIEWS_DIR}/<name>.before.html"}.
`;
  return `${previews}
## Sequences
Draw what now happens at run time where the diff changes it: a request, a command, a job or an
event walking through the code.
- One per story whose behavior changes across 2+ parts (a route and a service, a service and
  the database, a queue, an outside API). None for a change inside one function, or one with
  no run-time effect.
- \`lanes\`: the parts, 2–${LIMITS.lanes}, left to right in the order they're first called (≤${LIMITS.lane} chars each:
  "client", "orders route", "db").
- \`steps\`: the calls, returns and messages in order, 1–${LIMITS.steps}: {from, to, label (≤${LIMITS.stepLabel}), change, was,
  unit, line}. Leave \`change\` out for a step the diff keeps; "added", "removed", or "changed"
  with \`was\`, what it said before. A step with a change names the \`unit\` that makes it and a
  \`line\` of that unit (N… or O…, as in the tasks); any step may.
- The reader switches Before (every step but the added ones) and Now (every step but the
  removed ones), and opens a step's unit with a click.
`;
}

/** The prepare command for this diff, as the agent runs it. */
export function prepareCommand(input: { command: 'diff' | 'pr'; args: string[] }): string {
  const args = summaryArgs(input.command, input.args);
  return 'lens summary prepare' + (args ? ' ' + args : '');
}

export const RESULT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'lens summary result',
  type: 'object',
  required: ['units'],
  properties: {
    units: {
      type: 'object',
      description: 'unit id (from the tasks) → summary',
      additionalProperties: {
        type: 'object',
        required: ['headline', 'gist', 'changes', 'breaks', 'concerns'],
        properties: {
          headline: { type: 'string', maxLength: LIMITS.headline },
          gist: { type: 'string', maxLength: LIMITS.gist },
          changes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['when', 'before', 'now', 'line'],
              properties: {
                when: { type: 'string', maxLength: LIMITS.cell },
                before: { type: ['string', 'null'], maxLength: LIMITS.cell },
                now: { type: 'string', maxLength: LIMITS.cell },
                line: { type: 'string', pattern: '^[NO][0-9]+$' },
              },
            },
          },
          breaks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['summary', 'callers'],
              properties: {
                summary: { type: 'string', maxLength: LIMITS.breakSummary },
                callers: { type: 'array', items: { type: 'string', pattern: '^.+:[0-9]+$' }, minItems: 1 },
              },
            },
          },
          concerns: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind', 'text', 'line'],
              properties: {
                kind: { enum: ['bug', 'risk', 'question'] },
                text: { type: 'string', maxLength: LIMITS.concern },
                line: { type: 'string', pattern: '^[NO][0-9]+$' },
              },
            },
          },
          renamedFrom: { type: 'string' },
        },
      },
    },
    overview: {
      type: 'object',
      required: ['what'],
      properties: {
        title: { type: 'string', maxLength: LIMITS.overviewTitle },
        what: { type: 'string', maxLength: LIMITS.overview },
      },
    },
    previews: {
      type: 'array',
      description: 'only while the instructions ask for previews',
      items: {
        type: 'object',
        required: ['title', 'units', 'now'],
        properties: {
          title: { type: 'string', maxLength: LIMITS.previewTitle },
          units: { type: 'array', items: { type: 'string' }, minItems: 1 },
          now: { type: 'string', pattern: `^${PREVIEWS_DIR}/[\\w.-]+\\.html$` },
          before: { type: 'string', pattern: `^${PREVIEWS_DIR}/[\\w.-]+\\.html$` },
        },
      },
    },
    sequences: {
      type: 'array',
      description: 'only while the instructions ask for sequences',
      items: {
        type: 'object',
        required: ['title', 'lanes', 'steps'],
        properties: {
          title: { type: 'string', maxLength: LIMITS.previewTitle },
          lanes: {
            type: 'array',
            items: { type: 'string', maxLength: LIMITS.lane },
            minItems: 2,
            maxItems: LIMITS.lanes,
          },
          steps: {
            type: 'array',
            minItems: 1,
            maxItems: LIMITS.steps,
            items: {
              type: 'object',
              required: ['from', 'to', 'label'],
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                label: { type: 'string', maxLength: LIMITS.stepLabel },
                change: { enum: ['added', 'changed', 'removed'] },
                was: { type: 'string', maxLength: LIMITS.stepLabel },
                unit: { type: 'string' },
                line: { type: 'string', pattern: '^[NO][0-9]+$' },
              },
            },
          },
        },
      },
    },
    plan: {
      type: 'object',
      description: 'only while the instructions ask for it',
      required: ['items', 'unplanned'],
      properties: {
        items: {
          type: 'array',
          maxItems: LIMITS.planItems,
          items: {
            type: 'object',
            required: ['text', 'quote', 'status', 'units'],
            properties: {
              text: { type: 'string', maxLength: LIMITS.planText },
              quote: { type: 'string', maxLength: LIMITS.planQuote },
              status: { enum: ['done', 'partly', 'missing'] },
              units: { type: 'array', items: { type: 'string' } },
              note: { type: 'string', maxLength: LIMITS.planNote },
            },
          },
        },
        unplanned: {
          type: 'array',
          items: {
            type: 'object',
            required: ['unit', 'note'],
            properties: {
              unit: { type: 'string' },
              note: { type: 'string', maxLength: LIMITS.planNote },
            },
          },
        },
      },
    },
    checks: {
      type: 'array',
      description: 'only while the instructions ask for them',
      items: {
        type: 'object',
        required: ['flow', 'question', 'answer', 'unit', 'line'],
        properties: {
          flow: { type: 'string' },
          question: { type: 'string', maxLength: LIMITS.checkQuestion },
          answer: { type: 'string', maxLength: LIMITS.checkAnswer },
          unit: { type: 'string' },
          line: { type: 'string', pattern: '^[NO][0-9]+$' },
        },
      },
    },
    sent: {
      type: 'object',
      description:
        'only while the instructions list findings the reviewer sent back: their number → what the code does now',
      additionalProperties: {
        type: 'object',
        required: ['fixed', 'how', 'unit', 'line'],
        properties: {
          fixed: { type: 'boolean' },
          how: { type: 'string', maxLength: LIMITS.sentHow },
          unit: { type: 'string' },
          line: { type: 'string', pattern: '^[NO][0-9]+$' },
        },
      },
    },
    flows: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'path', 'units', 'priority', 'why'],
        properties: {
          title: { type: 'string', maxLength: LIMITS.flowTitle },
          path: { type: 'string', maxLength: LIMITS.flowPath },
          units: {
            type: 'object',
            description: 'unit id → its step in path, in reading order; a unit goes in one flow only',
            additionalProperties: { type: 'string', maxLength: LIMITS.layer },
          },
          priority: { enum: [1, 2, 3] },
          why: { type: 'string', maxLength: LIMITS.why },
        },
      },
    },
  },
};
