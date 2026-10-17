import { writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { relPath } from "../paths.ts";
import { citeableLabels, removalAnchors, type Unit } from "./units.ts";
import {
  bundleDir, HOUSEKEEPING, isHousekeeping, readStored, summaryArgs, unitSetHash,
  type Bundle, type BundleUnit, type StoredSummary,
} from "./store.ts";

// `lens summary prepare` output: a folder the user's agent reads (tasks,
// instructions, schema) plus bundle.json, which `submit` validates against.

export const LIMITS = {
  headline: 80, gist: 40, cell: 60, breakSummary: 80, concern: 300,
  flowTitle: 40, flowPath: 60, layer: 12, why: 100, overview: 2000,
};

/** Rendered lines per tasks file before splitting into tasks-2.md, … */
const TASK_FILE_BUDGET = 1500;

export interface PrepareInput {
  root: string;
  cwd: string;
  key: string;
  command: "diff" | "pr";
  args: string[];
  label: string | null;
  commits: string;
  units: Unit[];
  /** New-side sources by repo-relative path */
  sources: Map<string, string>;
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
  const bundleUnits: BundleUnit[] = input.units.map((u) => ({
    id: u.id,
    file: u.file,
    name: u.name,
    kind: u.kind,
    status: u.status,
    hash: u.hash,
    labels: [...citeableLabels(u)],
    ranges: u.ranges,
    ...(u.formattingOnly ? { formattingOnly: true } : {}),
    ...(u.importsOnly ? { importsOnly: true } : {}),
    done: stored?.units[u.id]?.hash === u.hash,
  }));
  const bundle: Bundle = {
    version: 1,
    key: input.key,
    command: input.command,
    args: input.args,
    createdAt: new Date().toISOString(),
    units: bundleUnits,
  };

  // Stale task files from a bigger earlier diff must not linger.
  for (const f of readdirSync(dir)) {
    if (/^tasks(-\d+)?\.md$/.test(f) || f === "result.json") unlinkSync(join(dir, f));
  }

  const todo = input.units.filter((_, i) => !bundleUnits[i].done);
  const header = contextHeader(input);
  const chunks: string[][] = [[]];
  let used = 0;
  for (const unit of todo) {
    const rendered = renderUnit(unit, input.sources.get(unit.file));
    const size = rendered.split("\n").length;
    if (used > 0 && used + size > TASK_FILE_BUDGET) { chunks.push([]); used = 0; }
    chunks[chunks.length - 1].push(rendered);
    used += size;
  }
  const taskFiles: string[] = [];
  // every unit is done but the overview is missing or was written for other code:
  // the final pass — flows and the overview, from every unit's stored summary.
  // A diff split into parts gets its flows here, where one context sees all units.
  // the whole-diff work is done once the overview fits this diff and flows exist (a flow needs 2+ units)
  const wholeDone = stored?.overview?.hash === unitSetHash(bundleUnits) &&
    (stored.flows.length > 0 || bundleUnits.length < 2);
  const finalPass = todo.length === 0 && stored !== null && !wholeDone;
  if (finalPass) {
    const name = join(dir, "tasks.md");
    writeFileSync(name, `# lens summary tasks (final pass: flows and overview)\n\n${header}\n${renderHeadlines(input.units, stored, input.sources)}`);
    taskFiles.push(name);
  }
  if (todo.length > 0) {
    chunks.forEach((chunk, i) => {
      const name = chunks.length === 1 ? "tasks.md" : `tasks-${i + 1}.md`;
      const part = chunks.length === 1 ? "" : ` (part ${i + 1} of ${chunks.length})`;
      writeFileSync(join(dir, name), `# lens summary tasks${part}\n\n${header}\n${chunk.join("\n")}`);
      taskFiles.push(join(dir, name));
    });
  }

  if (finalPass || (todo.length === input.units.length && taskFiles.length === 1)) bundle.wholeDiff = true;
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(bundle, null, 2) + "\n");
  writeFileSync(join(dir, "schema.json"), JSON.stringify(RESULT_SCHEMA, null, 2) + "\n");
  const doneCount = bundleUnits.filter((u) => u.done).length;
  const instructions = finalPass
    ? renderFinalPassInstructions(input, dir, taskFiles[0])
    : renderInstructions(input, dir, taskFiles, todo.length, doneCount, wholeDone);
  writeFileSync(join(dir, "instructions.md"), instructions);
  return { dir, taskFiles, todo: todo.length, done: doneCount, instructions };
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
      const size = [u.changedLines.length > 0 ? `+${u.changedLines.length}` : "", removed > 0 ? `−${removed}` : ""].filter(Boolean).join(" ");
      const marks = [u.kind, u.status, size, ...(s?.breaks.length ? ["may break callers"] : [])].filter(Boolean);
      out.push(`- \`${u.id}\` (${marks.join(", ")}): ${s ? `${s.headline} — ${s.gist}` : "no summary"}`);
      const names = mentions.get(u.id) ?? [];
      if (names.length > 0) out.push(`  names: ${names.map((id) => `\`${id}\``).join(", ")}`);
      for (const c of s?.concerns ?? []) out.push(`  - ${c.kind}: ${c.text}`);
    }
    out.push("");
  }
  const filed = units.filter(isHousekeeping);
  if (filed.length > 0) {
    out.push(`Lens files these under "${HOUSEKEEPING}" itself (import-only or formatting-only): leave them out of your flows.`);
    out.push(...filed.map((u) => `- \`${u.id}\``), "");
  }
  return out.join("\n");
}

/** Most names listed per unit: past that, the list stops helping */
const MAX_MENTIONS = 6;

/** For each unit, the other changed units whose name appears in its shown or removed code. */
function mentionsOf(units: Unit[], sources: Map<string, string>): Map<string, string[]> {
  const named = units
    .map((u) => ({ id: u.id, name: u.name.split(".").pop() ?? u.name }))
    .filter((u) => /^[A-Za-z_$][\w$]{2,}$/.test(u.name))
    .map((u) => ({ id: u.id, pattern: new RegExp(`(^|[^\\w$])${u.name.replace(/\$/g, "\\$")}([^\\w$]|$)`) }));
  const fileLines = new Map<string, string[]>();
  const out = new Map<string, string[]>();
  for (const u of units) {
    let lines = fileLines.get(u.file);
    if (!lines) fileLines.set(u.file, (lines = sources.get(u.file)?.split("\n") ?? []));
    const code = [
      ...u.ranges.flatMap((r) => lines.slice(r.start - 1, r.end)),
      ...u.removals.flatMap((b) => b.lines),
    ].join("\n");
    const found = named
      .filter((other) => other.id !== u.id && other.pattern.test(code))
      .map((other) => other.id);
    if (found.length > 0) out.set(u.id, found.slice(0, MAX_MENTIONS));
  }
  return out;
}

function contextHeader(input: PrepareInput): string {
  const parts = [`Diff: \`lens ${input.command} ${input.args.join(" ")}\`${input.label ? ` (${input.label})` : ""}`];
  if (input.commits) parts.push(`Commits:\n${input.commits}`);
  return parts.join("\n\n") + "\n";
}

/**
 * One unit as the agent sees it: `N14 + code` for changed new lines (citeable),
 * `O16 - code` for removed old lines (citeable), `  15   code` for context.
 */
export function renderUnit(unit: Unit, source: string | undefined): string {
  const lines = source?.split("\n") ?? [];
  const width = Math.max(4, ...unit.ranges.map((r) => String(r.end).length + 1),
    ...unit.removals.map((b) => String(b.oldStart + b.lines.length).length + 1));
  const changed = new Set(unit.changedLines);
  const out: string[] = [];
  const removedAt = removalAnchors(unit);
  const emitRemovals = (after: number) => {
    for (const b of removedAt.get(after) ?? []) {
      b.lines.forEach((text, i) => out.push(`${("O" + (b.oldStart + i)).padStart(width)} - ${text}`));
    }
  };
  if (unit.ranges.length === 0) emitRemovals(0);
  unit.ranges.forEach((r, ri) => {
    if (ri > 0) out.push(`${"".padStart(width)}   ⋯`);
    emitRemovals(r.start - 1);
    for (let l = r.start; l <= r.end; l++) {
      const text = lines[l - 1] ?? "";
      out.push(changed.has(l) ? `${("N" + l).padStart(width)} + ${text}` : `${String(l).padStart(width)}   ${text}`);
      emitRemovals(l);
    }
  });

  const meta: string[] = [unit.kind, unit.status];
  if (unit.formattingOnly) meta.push(`formatting only (whitespace): lens files it under "${HOUSEKEEPING}"`);
  if (unit.importsOnly) meta.push(`imports only: lens files it under "${HOUSEKEEPING}"`);
  const where = unit.ranges.length > 0 ? ` · lines ${unit.ranges[0].start}–${unit.ranges[unit.ranges.length - 1].end}` : "";
  const code = out.join("\n");
  // a fence longer than any run of backticks in the code: a changed README's own fences don't end it
  const fence = "`".repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map((run) => run[0].length + 1)));
  return `## ${unit.id}\n${meta.join(" · ")}${where}\n\n${fence}\n${code}\n${fence}\n`;
}

function renderInstructions(
  input: PrepareInput, dir: string, taskFiles: string[], todo: number, done: number, wholeDone: boolean,
): string {
  const rel = (p: string) => relPath(input.cwd, p);
  const resultPath = rel(join(dir, "result.json"));
  const files = taskFiles.map((f) => `\`${rel(f)}\``).join(", ");
  if (todo === 0) {
    return `# lens summary\n\nNothing to do: all ${done} units already have a summary for their current code.\n` +
      `Tell the user to open the Summary tab in the lens viewer (refresh with ↻).\n`;
  }
  // flows need every unit in view: split or partial runs leave them to the final pass —
  // unless this diff's flows and overview are already written (units left over from a rejected submit)
  const deferred = !wholeDone && (taskFiles.length > 1 || done > 0);
  return `# lens summary — instructions for the agent

You are writing a review summary of a code diff for the lens viewer. Lens split the
diff into ${todo} units (functions, components, hooks, methods, types, …)${done > 0 ? `; ${done} more are already summarized and skipped` : ""}.
Tasks: ${files}

If you can, do this in a fresh context or a subagent, not in the session that wrote
the code — reviewing your own work hides its blind spots.

## Steps
1. Read the task file(s). Each unit shows its code: \`N14 + …\` is a changed new line,
   \`O16 - …\` a removed old line, \`  15   …\` unchanged context.
2. For each unit, understand what changed in behavior. Use the repository freely: open
   files, search for callers of changed functions (their usages are NOT in the tasks).
3. Write \`${resultPath}\` following \`${rel(join(dir, "schema.json"))}\`.
4. Run \`lens summary submit ${rel(dir)}\`. It prints what it rejected and why: fix those
   entries and submit once more. Submits merge, so for multi-part tasks you may submit
   after each part.
${deferred ? `5. Once every unit is submitted, run \`${prepareCommand(input)}\` again: it writes the final
   pass — flows and the overview, from all units at once.
` : ""}
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
- \`breaks\`: callers outside the diff that the change may break: {summary (≤${LIMITS.breakSummary}),
  callers: ["path/from/repo/root.ts:31", …]}. Each caller line must exist and contain
  the unit's name. Only list callers you actually found.
- \`renamedFrom\`: for a new unit that is a renamed/moved deleted unit, the deleted unit's id.

${wholeDone
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
`}
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

const OVERVIEW_RULE = `\`overview\`: {what (≤${LIMITS.overview} chars)} — what the whole diff does and why, for a
reviewer seeing it for the first time. Size it to what the diff does, not to its
line count: a sentence or two for one focused change; a short paragraph per distinct
change when it does several things (blank line between paragraphs). Name behavior,
not files; don't repeat unit headlines or walk through the diff file by file.`;

function renderFinalPassInstructions(input: PrepareInput, dir: string, tasks: string): string {
  const rel = (p: string) => relPath(input.cwd, p);
  return `# lens summary — instructions for the agent

Every unit of this diff already has a summary. This is the final pass: the flows and
the overview of the whole diff. Tasks: \`${rel(tasks)}\` lists each unit with its headline,
gist, and any concerns, by file.

1. Read the task file. Look at the diff itself if the headlines aren't enough.
2. Write \`${rel(join(dir, "result.json"))}\` as
   \`{"units": {}, "flows": [ … ], "overview": {"what": "…"}}\`, following \`${rel(join(dir, "schema.json"))}\`.
3. Run \`lens summary submit ${rel(dir)}\`. It names the units your flows leave out and the
   flows that look split up: fix those and submit again.

## Flows
${FLOWS_RULE}

## Overview
${OVERVIEW_RULE}
`;
}

/** The prepare command for this diff, as the agent runs it. */
export function prepareCommand(input: { command: "diff" | "pr"; args: string[] }): string {
  const args = summaryArgs(input.command, input.args);
  return "lens summary prepare" + (args ? " " + args : "");
}

export const RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "lens summary result",
  type: "object",
  required: ["units"],
  properties: {
    units: {
      type: "object",
      description: "unit id (from the tasks) → summary",
      additionalProperties: {
        type: "object",
        required: ["headline", "gist", "changes", "breaks", "concerns"],
        properties: {
          headline: { type: "string", maxLength: LIMITS.headline },
          gist: { type: "string", maxLength: LIMITS.gist },
          changes: {
            type: "array",
            items: {
              type: "object",
              required: ["when", "before", "now", "line"],
              properties: {
                when: { type: "string", maxLength: LIMITS.cell },
                before: { type: ["string", "null"], maxLength: LIMITS.cell },
                now: { type: "string", maxLength: LIMITS.cell },
                line: { type: "string", pattern: "^[NO][0-9]+$" },
              },
            },
          },
          breaks: {
            type: "array",
            items: {
              type: "object",
              required: ["summary", "callers"],
              properties: {
                summary: { type: "string", maxLength: LIMITS.breakSummary },
                callers: { type: "array", items: { type: "string", pattern: "^.+:[0-9]+$" }, minItems: 1 },
              },
            },
          },
          concerns: {
            type: "array",
            items: {
              type: "object",
              required: ["kind", "text", "line"],
              properties: {
                kind: { enum: ["bug", "risk", "question"] },
                text: { type: "string", maxLength: LIMITS.concern },
                line: { type: "string", pattern: "^[NO][0-9]+$" },
              },
            },
          },
          renamedFrom: { type: "string" },
        },
      },
    },
    overview: {
      type: "object",
      required: ["what"],
      properties: { what: { type: "string", maxLength: LIMITS.overview } },
    },
    flows: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "path", "units", "priority", "why"],
        properties: {
          title: { type: "string", maxLength: LIMITS.flowTitle },
          path: { type: "string", maxLength: LIMITS.flowPath },
          units: {
            type: "object",
            description: "unit id → its step in path, in reading order; a unit goes in one flow only",
            additionalProperties: { type: "string", maxLength: LIMITS.layer },
          },
          priority: { enum: [1, 2, 3] },
          why: { type: "string", maxLength: LIMITS.why },
        },
      },
    },
  },
};
