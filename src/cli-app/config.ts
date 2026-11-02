import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CallPattern, LensConfig } from './model.ts';
// The base rules are themselves just a config file (lens.defaults.json) in
// the same shape as a project's .lens.json — the "base game" is a mod too.
// Imported, so the compiled `lens` carries it.
import defaults from '../../lens.defaults.json' with { type: 'json' };

/** An intentionally empty rule set, used when .lens.json sets "base": false. */
const EMPTY_CONFIG: LensConfig = {
  threshold: 1,
  theme: 'vesper',
  categories: {},
  scores: {},
  callPatterns: [],
  keepCommentMarkers: [],
  keepDirective: 'lens:keep',
  testFilePatterns: [],
  exclude: [],
  buildPreviews: true,
  selfChecks: false,
};

const strings = (v: unknown[]) => v.filter((x): x is string => typeof x === 'string');

const KNOWN_FIELDS = new Set([...Object.keys(EMPTY_CONFIG), 'base', '$comment']);

function sanitize(raw: unknown, from: string): Partial<LensConfig> & { base?: boolean } {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  for (const field of Object.keys(r)) {
    if (!KNOWN_FIELDS.has(field)) console.error(`lens: ignoring unknown field "${field}" in ${from}`);
  }
  const out: Partial<LensConfig> & { base?: boolean } = {};
  if (typeof r.base === 'boolean') out.base = r.base;
  if (typeof r.threshold === 'number') out.threshold = r.threshold;
  if (typeof r.theme === 'string') out.theme = r.theme;
  if (typeof r.categories === 'object' && r.categories !== null) {
    out.categories = Object.fromEntries(
      Object.entries(r.categories).filter(([, v]) => typeof v === 'boolean'),
    ) as Record<string, boolean>;
  }
  if (typeof r.scores === 'object' && r.scores !== null) {
    out.scores = Object.fromEntries(Object.entries(r.scores).filter(([, v]) => typeof v === 'number')) as Record<
      string,
      number
    >;
  }
  if (typeof r.keepDirective === 'string') out.keepDirective = r.keepDirective;
  if (Array.isArray(r.keepCommentMarkers)) out.keepCommentMarkers = strings(r.keepCommentMarkers);
  if (Array.isArray(r.testFilePatterns)) out.testFilePatterns = strings(r.testFilePatterns);
  if (Array.isArray(r.exclude)) out.exclude = strings(r.exclude);
  if (typeof r.buildPreviews === 'boolean') out.buildPreviews = r.buildPreviews;
  if (typeof r.selfChecks === 'boolean') out.selfChecks = r.selfChecks;
  if (Array.isArray(r.callPatterns)) {
    out.callPatterns = r.callPatterns.filter((p): p is CallPattern => {
      const ok =
        typeof p === 'object' &&
        p !== null &&
        typeof p.category === 'string' &&
        Array.isArray(p.receivers) &&
        p.receivers.length > 0 &&
        p.receivers.every((r: unknown) => typeof r === 'string') &&
        (p.methods === undefined ||
          (Array.isArray(p.methods) && p.methods.every((m: unknown) => typeof m === 'string')));
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
    testFilePatterns: [...base.testFilePatterns, ...(over.testFilePatterns ?? [])],
    exclude: [...base.exclude, ...(over.exclude ?? [])],
    buildPreviews: over.buildPreviews ?? base.buildPreviews,
    selfChecks: over.selfChecks ?? base.selfChecks,
  };
}

function loadDefaults(): LensConfig {
  return merge(EMPTY_CONFIG, sanitize(defaults, 'lens.defaults.json'));
}

export const DEFAULT_CONFIG: LensConfig = loadDefaults();

/** Finds the nearest .lens.json walking upward from `from`. */
export function findConfigPath(from: string): string | null {
  let dir = from;
  while (true) {
    const candidate = join(dir, '.lens.json');
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
    const user = sanitize(JSON.parse(readFileSync(path, 'utf8')), path);
    const base = user.base === false ? EMPTY_CONFIG : DEFAULT_CONFIG;
    return merge(base, user);
  } catch (err) {
    console.error(`lens: ignoring invalid ${path}: ${(err as Error).message}`);
    return merge(EMPTY_CONFIG, DEFAULT_CONFIG);
  }
}
