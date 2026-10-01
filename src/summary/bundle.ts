import { writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { citeableLabels, removalAnchors, type Unit } from "./units.ts";
import { bundleDir, readStored, unitSetHash, type Bundle, type BundleUnit, type StoredSummary } from "./store.ts";

// `lens summary prepare` output: a folder the user's agent reads (tasks,
// instructions, schema) plus bundle.json, which `submit` validates against.

export const LIMITS = { headline: 80, gist: 40, cell: 60, breakSummary: 80, flowTitle: 40, flowPath: 60, layer: 12, overview: 2000 };

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
    ...(u.formattingOnly ? { formattingOnly: true } : {}),
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
  // ask for the overview alone, from the headlines already stored
  const overviewOnly = todo.length === 0 && stored !== null &&
    stored.overview?.hash !== unitSetHash(bundleUnits);
  if (overviewOnly) {
    const name = join(dir, "tasks.md");
    writeFileSync(name, `# lens summary tasks (overview only)\n\n${header}\n${renderHeadlines(input.units, stored)}`);
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

  writeFileSync(join(dir, "bundle.json"), JSON.stringify(bundle, null, 2) + "\n");
  writeFileSync(join(dir, "schema.json"), JSON.stringify(RESULT_SCHEMA, null, 2) + "\n");
  const doneCount = bundleUnits.filter((u) => u.done).length;
  const instructions = overviewOnly
    ? renderOverviewInstructions(input, dir, taskFiles[0])
    : renderInstructions(input, dir, taskFiles, todo.length, doneCount);
  writeFileSync(join(dir, "instructions.md"), instructions);
  return { dir, taskFiles, todo: todo.length, done: doneCount, instructions };
}

function renderHeadlines(units: Unit[], stored: StoredSummary): string {
  return units.map((u) => {
    const s = stored.units[u.id];
    return `- \`${u.id}\` (${u.status}): ${s ? s.headline : "no summary"}`;
  }).join("\n") + "\n";
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
  if (unit.formattingOnly) meta.push("formatting only (whitespace)");
  const where = unit.ranges.length > 0 ? ` · lines ${unit.ranges[0].start}–${unit.ranges[unit.ranges.length - 1].end}` : "";
  return `## ${unit.id}\n${meta.join(" · ")}${where}\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`;
}

function renderInstructions(input: PrepareInput, dir: string, taskFiles: string[], todo: number, done: number): string {
  const rel = (p: string) => relative(input.cwd, p) || p;
  const resultPath = rel(join(dir, "result.json"));
  const files = taskFiles.map((f) => `\`${rel(f)}\``).join(", ");
  if (todo === 0) {
    return `# lens summary\n\nNothing to do: all ${done} units already have a summary for their current code.\n` +
      `Tell the user to open the Summary tab in the lens viewer (refresh with ↻).\n`;
  }
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

## Per unit
- \`headline\` (≤${LIMITS.headline} chars): what the unit does now, in plain words.
- \`gist\` (≤${LIMITS.gist} chars): the key change, e.g. "returns max 50 by default".
- \`needsLook\`: true if a reviewer should look closely (behavior change, possible bug,
  breaks callers, risky); false for routine changes (renames, types, formatting, tests).
- \`changes\`: behavior differences as rows {when, before, now, line}, each ≤${LIMITS.cell} chars:
  "Called without a limit" | "returns all orders" | "returns the first 50" | "N18".
  \`line\` must be one of the unit's changed (N…) or removed (O…) labels — the line that
  causes the difference. \`before\` is null for new behavior. An empty list is fine:
  don't invent differences.
- \`breaks\`: callers outside the diff that the change may break: {summary (≤${LIMITS.breakSummary}),
  callers: ["path/from/repo/root.ts:31", …]}. Each caller line must exist and contain
  the unit's name. Only list callers you actually found.
- \`renamedFrom\`: for a new unit that is a renamed/moved deleted unit, the deleted unit's id.

## Flows (optional)
Group units that form one change across layers: {title (≤${LIMITS.flowTitle}), path (≤${LIMITS.flowPath}),
e.g. "repo → route → client", units: {"<unit id>": "<layer ≤${LIMITS.layer}>"}}. Only for 2+ units.

## Overview
${OVERVIEW_RULE}
With several task files, write it in your last submit, once you've seen every unit.

Keep everything terse: the viewer shows it in a small table next to the code.
`;
}

const OVERVIEW_RULE = `\`overview\`: {what (≤${LIMITS.overview} chars)} — what the whole diff does and why, for a
reviewer seeing it for the first time. Size it to what the diff does, not to its
line count: a sentence or two for one focused change; a short paragraph per distinct
change when it does several things (blank line between paragraphs). Name behavior,
not files; don't repeat unit headlines or walk through the diff file by file.`;

function renderOverviewInstructions(input: PrepareInput, dir: string, tasks: string): string {
  const rel = (p: string) => relative(input.cwd, p) || p;
  return `# lens summary — instructions for the agent

Every unit of this diff already has a summary; only the overview of the whole diff
is missing or out of date. Tasks: \`${rel(tasks)}\` lists each unit with its headline.

1. Read the task file. Look at the diff itself if the headlines aren't enough.
2. Write \`${rel(join(dir, "result.json"))}\` as \`{"units": {}, "overview": {"what": "…"}}\`.
3. Run \`lens summary submit ${rel(dir)}\`.

${OVERVIEW_RULE}
`;
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
        required: ["headline", "gist", "needsLook", "changes", "breaks"],
        properties: {
          headline: { type: "string", maxLength: LIMITS.headline },
          gist: { type: "string", maxLength: LIMITS.gist },
          needsLook: { type: "boolean" },
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
        required: ["title", "path", "units"],
        properties: {
          title: { type: "string", maxLength: LIMITS.flowTitle },
          path: { type: "string", maxLength: LIMITS.flowPath },
          units: { type: "object", additionalProperties: { type: "string", maxLength: LIMITS.layer } },
        },
      },
    },
  },
};
