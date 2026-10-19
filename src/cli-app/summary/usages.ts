import { spawnSync } from "node:child_process";
import { truncate } from "../text.ts";
import { callerName } from "./fit.ts";
import type { Unit } from "./units.ts";

// The lines outside the diff that name each unit, so the agent reads the likely callers
// instead of searching for them one grep at a time. A plain text match (`git grep -w`) over
// the working tree, the same tree `submit` checks a break's callers against: no types, no
// imports followed, so a unit reached through an alias or a string key isn't found.

/** Lines listed per unit; past that, the agent is told how many more there are */
export const MAX_USAGES = 8;

/** Shorter names match too much to be worth listing */
const MIN_NAME = 3;

/** Prose, not code: a doc that names a function doesn't call it */
const DOC_FILE = /\.(md|mdx|markdown|txt|rst|adoc)$/i;

export interface Usages {
  /** The name searched for */
  name: string;
  /** "path:line  code", repo-relative, at most MAX_USAGES */
  lines: string[];
  /** How many more lines matched */
  more: number;
}

/**
 * For each unit with a name a caller would use, the lines outside the diff that name it. A unit
 * left out (a statement, a module, a short name) wasn't searched; an empty list means nothing matched.
 */
export function usagesOutside(root: string, units: Unit[]): Map<string, Usages> {
  const unitsByName = new Map<string, Unit[]>();
  for (const unit of units) {
    const name = callerName(unit);
    if (!name || name.length < MIN_NAME) continue;
    unitsByName.set(name, [...(unitsByName.get(name) ?? []), unit]);
  }
  const out = new Map<string, Usages>();
  if (unitsByName.size === 0) return out;
  for (const [name, named] of unitsByName) for (const unit of named) out.set(unit.id, { name, lines: [], more: 0 });

  // the lines the tasks already show: a mention there is in the diff, not outside it
  const shown = new Map<string, { start: number; end: number }[]>();
  for (const unit of units) shown.set(unit.file, [...(shown.get(unit.file) ?? []), ...unit.ranges]);
  const inDiff = (file: string, line: number) => shown.get(file)?.some((r) => line >= r.start && line <= r.end) ?? false;

  // one git process for every name: -z keeps paths with colons whole, -I skips binaries
  const grep = spawnSync("git", ["grep", "-n", "-I", "-w", "-F", "-z", "--untracked", "-f", "-"], {
    cwd: root, input: [...unitsByName.keys()].join("\n") + "\n", encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  // 1 is "nothing matched"; anything else leaves the units unsearched rather than wrongly empty
  if (grep.status === 1) return out;
  if (grep.status !== 0) return new Map();

  for (const row of grep.stdout.split("\n")) {
    const [file, lineText, ...rest] = row.split("\0");
    if (!file || !lineText || DOC_FILE.test(file)) continue;
    const line = Number(lineText);
    if (inDiff(file, line)) continue;
    const text = rest.join("\0");
    const names = new Set(text.match(/[\w$]+/g) ?? []);
    for (const name of names) {
      for (const unit of unitsByName.get(name) ?? []) {
        const usages = out.get(unit.id)!;
        if (usages.lines.length < MAX_USAGES) usages.lines.push(`${file}:${line}  ${truncate(text, 100)}`);
        else usages.more++;
      }
    }
  }
  return out;
}
