import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { CallPattern, LensConfig } from './model.ts';
import { AGENT_IDS, isAgentId } from './agents/types.ts';
// The base rules are themselves just a config file (lens.defaults.json) in
// the same shape as a project's .lens.json — the "base game" is a mod too.
// Imported, so the compiled `lens` carries it.
import defaults from '../../lens.defaults.json' with { type: 'json' };

/** Something wrong in a config file: lens skips that value, keeps the rest, and says so. */
export interface ConfigProblem {
  /** The file's name as the reader knows it: `.lens.json`, `lens.defaults.json` */
  file: string;
  /** Where in it: `folds.logging`, `exclude[2]`, or '' for the whole file */
  path: string;
  message: string;
}

/** Where a value in effect came from: lens's defaults, or the project's .lens.json */
export type ConfigSource = 'defaults' | 'project';

export interface LoadedConfig {
  config: LensConfig;
  /** The .lens.json merged over the defaults, or null when there's none */
  path: string | null;
  problems: ConfigProblem[];
  /** The defaults' entries a `!entry` took out of each string list */
  removed: Partial<Record<StringList, string[]>>;
  /** Keyed by field (`theme`), map entry (`folds.logging`) or list entry (`exclude.3`); a list's index is its place in the merged list */
  sources: Record<string, ConfigSource>;
}

/** What a field holds when nothing sets it: "base": false starts from this. */
const EMPTY_CONFIG: LensConfig = {
  foldLevel: 1,
  theme: 'vesper',
  folds: {},
  callPatterns: [],
  keepCommentMarkers: [],
  keepDirective: 'lens:keep',
  testFilePatterns: [],
  exclude: [],
  buildPreviews: true,
  selfChecks: false,
  planTab: false,
  typescriptLsp: false,
  timings: false,
  agent: null,
};

type Field = keyof LensConfig;
const STRING_LISTS = ['keepCommentMarkers', 'testFilePatterns', 'exclude'] as const;
type StringList = (typeof STRING_LISTS)[number];
const BOOLEANS = ['buildPreviews', 'selfChecks', 'planTab', 'typescriptLsp', 'timings'] as const;
const STRINGS = ['theme', 'keepDirective'] as const;
const META_FIELDS = ['$comment', 'base'];
const CONFIG_FIELDS: readonly string[] = [...Object.keys(EMPTY_CONFIG), ...META_FIELDS];

/** The categories lens's own rules produce; a project's callPatterns may add more */
export const BUILT_IN_CATEGORIES: readonly string[] = Object.keys(defaults.folds);
const CALL_PATTERN_FIELDS = new Set(['category', 'receivers', 'methods', 'score']);

/** One file as read: the values that passed, and the `!` removals its string lists ask for */
interface Parsed {
  base: boolean;
  values: Partial<LensConfig>;
  removals: Partial<Record<StringList, string[]>>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isScore = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 3;
const describe = (value: unknown) =>
  Array.isArray(value)
    ? 'a list'
    : value === null
      ? 'null'
      : typeof value === 'object'
        ? 'an object'
        : JSON.stringify(value);

function parse(raw: unknown, file: string, problems: ConfigProblem[]): Parsed {
  const out: Parsed = { base: true, values: {}, removals: {} };
  const problem = (path: string, message: string) => problems.push({ file, path, message });
  if (!isObject(raw)) {
    problem('', 'must be a JSON object');
    return out;
  }
  for (const field of Object.keys(raw)) {
    if (!CONFIG_FIELDS.includes(field)) problem(field, 'is not a config field');
  }
  if ('base' in raw) {
    if (typeof raw.base === 'boolean') out.base = raw.base;
    else problem('base', 'must be true or false');
  }

  if ('foldLevel' in raw) {
    const level = raw.foldLevel;
    if (Number.isInteger(level) && (level as number) >= -1 && (level as number) <= 3)
      out.values.foldLevel = level as number;
    else problem('foldLevel', `must be a whole number from -1 (fold nothing) to 3, not ${describe(level)}`);
  }

  for (const field of STRINGS) {
    if (!(field in raw)) continue;
    if (typeof raw[field] === 'string' && raw[field] !== '') out.values[field] = raw[field];
    else problem(field, `must be a text, not ${describe(raw[field])}`);
  }
  for (const field of BOOLEANS) {
    if (!(field in raw)) continue;
    if (typeof raw[field] === 'boolean') out.values[field] = raw[field];
    else problem(field, `must be true or false, not ${describe(raw[field])}`);
  }

  if ('agent' in raw) {
    if (raw.agent === null || isAgentId(raw.agent)) out.values.agent = raw.agent;
    else
      problem(
        'agent',
        `must be null or one of ${AGENT_IDS.map((id) => JSON.stringify(id)).join(', ')}, not ${describe(raw.agent)}`,
      );
  }

  const folds: Record<string, number | false> = {};
  if ('folds' in raw) {
    const map = raw.folds;
    if (!isObject(map))
      problem('folds', `must be an object of category → a score from 0 to 3, or false, not ${describe(map)}`);
    else
      for (const [category, value] of Object.entries(map)) {
        if (value === false || isScore(value)) folds[category] = value;
        else problem('folds.' + category, `must be a score from 0 to 3, or false, not ${describe(value)}`);
      }
  }
  if (Object.keys(folds).length > 0 || 'folds' in raw) out.values.folds = folds;

  for (const field of STRING_LISTS) {
    if (!(field in raw)) continue;
    const list = raw[field];
    if (!Array.isArray(list)) {
      problem(field, `must be a list of texts, not ${describe(list)}`);
      continue;
    }
    const kept: string[] = [];
    const removed: string[] = [];
    list.forEach((entry, index) => {
      if (typeof entry !== 'string' || entry === '' || entry === '!') {
        problem(`${field}[${index}]`, `must be a text, not ${describe(entry)}`);
      } else if (entry.startsWith('!')) removed.push(entry.slice(1));
      else kept.push(entry);
    });
    out.values[field] = kept;
    if (removed.length > 0) out.removals[field] = removed;
  }

  if ('callPatterns' in raw) {
    const list = raw.callPatterns;
    if (!Array.isArray(list)) problem('callPatterns', `must be a list, not ${describe(list)}`);
    else
      out.values.callPatterns = list.flatMap((entry, index) => callPattern(entry, `callPatterns[${index}]`, problem));
  }
  return out;
}

function callPattern(entry: unknown, at: string, problem: (path: string, message: string) => void): CallPattern[] {
  if (!isObject(entry)) {
    problem(at, 'must be an object: { category, receivers, methods?, score? }');
    return [];
  }
  // a pattern with any problem is dropped whole
  let ok = true;
  const fail = (path: string, message: string) => {
    ok = false;
    problem(at + path, message);
  };
  for (const key of Object.keys(entry))
    if (!CALL_PATTERN_FIELDS.has(key)) fail('.' + key, 'is not a call pattern field');
  const texts = (value: unknown) =>
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item !== '');
  if (typeof entry.category !== 'string' || entry.category === '') fail('.category', 'must be a text');
  if (!texts(entry.receivers)) fail('.receivers', 'must be a list of at least one text');
  if (entry.methods !== undefined && !texts(entry.methods)) fail('.methods', 'must be a list of at least one text');
  if (entry.score !== undefined && !isScore(entry.score)) fail('.score', 'must be a score from 0 to 3');
  if (!ok) return [];
  const pattern: CallPattern = { category: entry.category as string, receivers: entry.receivers as string[] };
  if (entry.methods !== undefined) pattern.methods = entry.methods as string[];
  if (entry.score !== undefined) pattern.score = entry.score as number;
  return [pattern];
}

/**
 * Merges `over` onto `base`: scalars override, maps merge, lists extend, and a list's `!entry` takes that entry
 * out of `base`'s. Records where each value came from.
 */
function merge(base: LensConfig, over: Parsed, file: string, problems: ConfigProblem[]) {
  const config: LensConfig = { ...base, ...over.values, folds: { ...base.folds, ...over.values.folds } };
  const sources: Record<string, ConfigSource> = {};
  for (const field of Object.keys(EMPTY_CONFIG) as Field[])
    sources[field] = field in over.values ? 'project' : 'defaults';
  for (const category of Object.keys(config.folds)) {
    sources['folds.' + category] = over.values.folds && category in over.values.folds ? 'project' : 'defaults';
  }
  config.callPatterns = [...base.callPatterns, ...(over.values.callPatterns ?? [])];
  config.callPatterns.forEach(
    (_, index) => (sources['callPatterns.' + index] = index < base.callPatterns.length ? 'defaults' : 'project'),
  );
  const removed: LoadedConfig['removed'] = {};
  for (const field of STRING_LISTS) {
    const removals = over.removals[field] ?? [];
    removals.forEach((entry) => {
      if (!base[field].includes(entry)) {
        problems.push({
          file,
          path: field,
          message: `"!${entry}" takes out nothing: "${entry}" isn't in the defaults`,
        });
      }
    });
    const kept = base[field].filter((entry) => !removals.includes(entry));
    if (kept.length < base[field].length) removed[field] = base[field].filter((entry) => removals.includes(entry));
    config[field] = [...kept, ...(over.values[field] ?? [])];
    config[field].forEach((_, index) => (sources[field + '.' + index] = index < kept.length ? 'defaults' : 'project'));
  }
  // a fold set for a category nothing produces never applies: likely a typo, skipped like any other problem
  const known = new Set([...BUILT_IN_CATEGORIES, ...config.callPatterns.map((pattern) => pattern.category)]);
  for (const category of Object.keys(over.values.folds ?? {})) {
    if (!known.has(category)) {
      delete config.folds[category];
      delete sources['folds.' + category];
      problems.push({
        file,
        path: 'folds.' + category,
        message: `no rule makes "${category}" regions: the categories are ${[...known].join(', ')}`,
      });
    }
  }
  return { config, sources, removed };
}

function loadDefaults(): LensConfig {
  const problems: ConfigProblem[] = [];
  const { config } = merge(
    EMPTY_CONFIG,
    parse(defaults, 'lens.defaults.json', problems),
    'lens.defaults.json',
    problems,
  );
  // lens's own file: a problem in it is lens's bug, which test/config.test.ts catches
  if (problems.length > 0)
    throw new Error('lens.defaults.json: ' + problems.map((p) => p.path + ' ' + p.message).join('; '));
  return config;
}

export const DEFAULT_CONFIG: LensConfig = loadDefaults();
const NOTHING: Parsed = { base: true, values: {}, removals: {} };

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
 * Finds .lens.json upward from `from` and merges it over lens.defaults.json. With "base": false the project's
 * file replaces the defaults instead of extending them. A value that doesn't check is skipped and reported, never
 * fatal: the rest of the file still applies.
 */
export function readConfig(from: string): LoadedConfig {
  const path = findConfigPath(from);
  const problems: ConfigProblem[] = [];
  const fallback = (): LoadedConfig => ({ path, problems, ...merge(DEFAULT_CONFIG, NOTHING, '', []) });
  if (path === null) return fallback();
  const file = basename(path);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    problems.push({ file, path: '', message: `isn't valid JSON, so none of it applies: ${(err as Error).message}` });
    return fallback();
  }
  const parsed = parse(raw, file, problems);
  return { path, problems, ...merge(parsed.base ? DEFAULT_CONFIG : EMPTY_CONFIG, parsed, file, problems) };
}

/** The config in effect, for what doesn't report problems itself. */
export function loadConfig(from: string): LensConfig {
  return readConfig(from).config;
}

/** A problem as one line: `.lens.json: folds.loging no rule makes …` */
export function problemLine(problem: ConfigProblem): string {
  return problem.file + ': ' + (problem.path ? problem.path + ' ' : '') + problem.message;
}
