/**
 * Built-in categories: import, comment, guard, logging, telemetry,
 * error-boilerplate, accessor, barrel, data. Custom callPatterns in
 * .lens.json may introduce their own names, so regions carry plain strings.
 */
export type FoldCategory = string;

export type LanguageId = "typescript" | "tsx" | "javascript";

export interface FoldRegion {
  /** 1-based, inclusive */
  startLine: number;
  /** 1-based, inclusive */
  endLine: number;
  category: FoldCategory;
  /** 0-3; a region folds when score <= threshold. 4 = never folds (keep markers/directive). */
  score: number;
  /** Honest one-line pill text shown in place of the folded lines */
  summary: string;
}

export interface FileFoldModel {
  file: string;
  /** null = shown but not classified (diff mode includes unsupported file types) */
  language: LanguageId | null;
  lineCount: number;
  /** Sorted by startLine, non-overlapping */
  regions: FoldRegion[];
  /** The file has syntax errors — folding is disabled so nothing is misclassified */
  parseError?: boolean;
  /** Diff mode: new-side line numbers touched by the diff */
  changedLines?: number[];
  /** Diff mode: how the diff produced this file */
  status?: "added" | "modified";
  /** Diff mode: old-side lines the diff removed, anchored to new-side positions */
  removals?: RemovedBlock[];
}

export interface RemovedBlock {
  /** New-side line number this block sits after (0 = before the first line) */
  afterLine: number;
  /** Old-side line number of the first removed line */
  oldStart: number;
  lines: string[];
}

/**
 * One fire-and-forget call rule: expression statements calling
 * `<receiver>.<method>(...)` fold under `category`. Receivers are glob-ish
 * names matched against the call receiver's trailing segment (`*` = any
 * identifier characters, so "*Logger" matches `requestLogger` via
 * `this.requestLogger.info(...)`).
 */
export interface CallPattern {
  category: FoldCategory;
  receivers: string[];
  /** Omitted = any method name */
  methods?: string[];
  /** Region score; defaults to scores[category] ?? 1 */
  score?: number;
}

/**
 * The full rule set. lens ships its own rules as lens.defaults.json in this
 * same shape — the base rules are just a config file a project's .lens.json
 * merges over (or replaces entirely with "base": false).
 */
export interface LensConfig {
  /** Regions with score <= threshold fold. */
  threshold: number;
  /** Shiki theme for the web viewer */
  theme: string;
  /** Categories that may fold; a disabled category is never folded. */
  categories: Record<FoldCategory, boolean>;
  /** Region score per category (0-3); rules fall back to 1 when absent. */
  scores: Record<FoldCategory, number>;
  callPatterns: CallPattern[];
  /** Comment keywords that keep a comment visible (scored above threshold) */
  keepCommentMarkers: string[];
  /** A directive string; regions containing it (or starting right below it) never fold */
  keepDirective: string;
  /** Legacy alias: extra receivers appended to the "logging" call pattern */
  loggerNames: string[];
  /** Glob-ish path patterns the viewer's "hide tests" toggle matches against */
  testFilePatterns: string[];
  /** Glob-ish path patterns never read or tokenized in diff mode (lockfiles, minified) */
  exclude: string[];
}
