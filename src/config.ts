import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CallPattern, LensConfig } from "./model.ts";

// The base rules are themselves just a config file (lens.defaults.json) in
// the same shape as a project's .lens.json — the "base game" is a mod too.
const defaultsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "lens.defaults.json");

/** An intentionally empty rule set, used when .lens.json sets "base": false. */
const EMPTY_CONFIG: LensConfig = {
  threshold: 1,
  theme: "vesper",
  categories: {},
  scores: {},
  callPatterns: [],
  keepCommentMarkers: [],
  keepDirective: "lens:keep",
  loggerNames: [],
  testFilePatterns: [],
  exclude: [],
};

function sanitize(raw: unknown, from: string): Partial<LensConfig> & { base?: boolean } {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<LensConfig> & { base?: boolean } = {};
  if (typeof r.base === "boolean") out.base = r.base;
  if (typeof r.threshold === "number") out.threshold = r.threshold;
  if (typeof r.theme === "string") out.theme = r.theme;
  if (typeof r.categories === "object" && r.categories !== null) {
    out.categories = Object.fromEntries(
      Object.entries(r.categories).filter(([, v]) => typeof v === "boolean"),
    ) as Record<string, boolean>;
  }
  if (typeof r.scores === "object" && r.scores !== null) {
    out.scores = Object.fromEntries(
      Object.entries(r.scores).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>;
  }
  if (typeof r.keepDirective === "string") out.keepDirective = r.keepDirective;
  if (Array.isArray(r.keepCommentMarkers)) {
    out.keepCommentMarkers = r.keepCommentMarkers.filter((m) => typeof m === "string");
  }
  if (Array.isArray(r.loggerNames)) {
    out.loggerNames = r.loggerNames.filter((n) => typeof n === "string");
  }
  if (Array.isArray(r.testFilePatterns)) {
    out.testFilePatterns = r.testFilePatterns.filter((p) => typeof p === "string");
  }
  if (Array.isArray(r.exclude)) {
    out.exclude = r.exclude.filter((p) => typeof p === "string");
  }
  if (Array.isArray(r.callPatterns)) {
    out.callPatterns = r.callPatterns.filter((p): p is CallPattern => {
      const ok = typeof p === "object" && p !== null &&
        typeof p.category === "string" &&
        Array.isArray(p.receivers) && p.receivers.length > 0;
      if (!ok) console.error(`lens: ignoring invalid callPatterns entry in ${from}`);
      return ok;
    });
  }
  return out;
}

/** Merge semantics: scalars override, maps merge, lists extend. */
function merge(base: LensConfig, over: Partial<LensConfig>): LensConfig {
  return {
    threshold: over.threshold ?? base.threshold,
    theme: over.theme ?? base.theme,
    categories: { ...base.categories, ...over.categories },
    scores: { ...base.scores, ...over.scores },
    callPatterns: [...base.callPatterns, ...(over.callPatterns ?? [])],
    keepCommentMarkers: [...base.keepCommentMarkers, ...(over.keepCommentMarkers ?? [])],
    keepDirective: over.keepDirective ?? base.keepDirective,
    loggerNames: [...base.loggerNames, ...(over.loggerNames ?? [])],
    testFilePatterns: [...base.testFilePatterns, ...(over.testFilePatterns ?? [])],
    exclude: [...base.exclude, ...(over.exclude ?? [])],
  };
}

function loadDefaults(): LensConfig {
  const raw = JSON.parse(readFileSync(defaultsPath, "utf8"));
  return merge(EMPTY_CONFIG, sanitize(raw, defaultsPath));
}

export const DEFAULT_CONFIG: LensConfig = loadDefaults();

/** Finds the nearest .lens.json walking upward from `from`. */
export function findConfigPath(from: string): string | null {
  let dir = from;
  while (true) {
    const candidate = join(dir, ".lens.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Finds .lens.json upward from `from` and merges it over lens.defaults.json.
 * With "base": false in .lens.json, the project config replaces the defaults
 * instead of extending them.
 */
export function loadConfig(from: string): LensConfig {
  const path = findConfigPath(from);
  if (path === null) return merge(EMPTY_CONFIG, DEFAULT_CONFIG);
  try {
    const user = sanitize(JSON.parse(readFileSync(path, "utf8")), path);
    const base = user.base === false ? EMPTY_CONFIG : DEFAULT_CONFIG;
    return merge(base, user);
  } catch (err) {
    console.error(`lens: ignoring invalid ${path}: ${(err as Error).message}`);
    return merge(EMPTY_CONFIG, DEFAULT_CONFIG);
  }
}

/**
 * Seeds <dir>/.lens.json with a standalone copy of the built-in defaults.
 * The copy sets "base": false — it IS the full rule set, not an extension —
 * otherwise its lists would double up with the base they duplicate.
 */
export function initConfig(dir: string): string {
  const target = join(dir, ".lens.json");
  if (existsSync(target)) {
    throw new Error(`${target} already exists — edit it, or run "lens config reset" to restore the defaults`);
  }
  const defaults = JSON.parse(readFileSync(defaultsPath, "utf8"));
  delete defaults.$comment;
  const seeded = {
    $comment: "Standalone copy of lens's built-in rules (base: false = the full rule set, not an extension). Field docs: CONFIG.md in the lens repo. Run 'lens config reset' to restore the defaults.",
    base: false,
    ...defaults,
  };
  writeFileSync(target, JSON.stringify(seeded, null, 2) + "\n");
  return target;
}

/**
 * Restores default behavior by moving the nearest .lens.json aside to
 * .lens.json.bak (overwriting any previous backup), so the custom config can
 * be brought back by renaming the backup.
 */
export function resetConfig(from: string): { reset: string; backup: string } | null {
  const path = findConfigPath(from);
  if (path === null) return null;
  const backup = path + ".bak";
  renameSync(path, backup);
  return { reset: path, backup };
}
