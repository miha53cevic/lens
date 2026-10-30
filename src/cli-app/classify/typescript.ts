import type { Node } from '@vscode/tree-sitter-wasm';
import type { FoldCategory, FoldRegion, LensConfig } from '../model.ts';
import { escapeRegExp, plural, truncate } from '../text.ts';

// Works for typescript, tsx, and javascript grammars — they share these node types.
// The rule DATA (receivers, methods, scores, markers) comes from LensConfig;
// only the structural analysis lives here.

interface CompiledPattern {
  category: FoldCategory;
  score: number;
  receiver: RegExp;
  /** null = any method name */
  methods: Set<string> | null;
}

interface RuleContext {
  lines: string[];
  patterns: CompiledPattern[];
  keepMarkers: RegExp | null;
  score: (category: FoldCategory) => number;
}

// Priority when regions overlap: the more specific/structural rule wins.
// Custom pattern categories rank alongside logging/telemetry.
const CATEGORY_PRIORITY: FoldCategory[] = ['barrel', 'guard', 'error-boilerplate', 'accessor', 'import', 'data'];
function priorityOf(category: FoldCategory): number {
  const index = CATEGORY_PRIORITY.indexOf(category);
  if (index !== -1) return index;
  return category === 'comment' ? CATEGORY_PRIORITY.length + 1 : CATEGORY_PRIORITY.length;
}

/** Glob-ish receiver name → regex fragment ("*Logger" matches requestLogger). */
function compileReceivers(receivers: string[]): RegExp {
  const alternatives = receivers.map((r) => escapeRegExp(r).replace(/\\\*/g, '[\\w$]*')).join('|');
  return new RegExp(`(^|\\.)(?:${alternatives})$`);
}

function compilePatterns(config: LensConfig): CompiledPattern[] {
  return config.callPatterns.map((p) => ({
    category: p.category,
    score: p.score ?? config.scores[p.category] ?? 1,
    receiver: compileReceivers(p.receivers),
    methods: p.methods && !p.methods.includes('*') ? new Set(p.methods) : null,
  }));
}

export function classify(root: Node, source: string, config: LensConfig): FoldRegion[] {
  const lines = source.split('\n');
  const ctx: RuleContext = {
    lines,
    patterns: compilePatterns(config),
    // Lookarounds instead of \b: markers like "@ts-ignore" start with a
    // non-word character, where \b can never match.
    keepMarkers:
      config.keepCommentMarkers.length > 0
        ? new RegExp(`(?<!\\w)(${config.keepCommentMarkers.map(escapeRegExp).join('|')})(?!\\w)`)
        : null,
    score: (category) => config.scores[category] ?? 1,
  };

  const candidates: FoldRegion[] = [
    ...barrelRegions(root, ctx),
    ...importRegions(root, ctx),
    ...guardRegions(root, ctx),
    ...catchRegions(root, ctx),
    ...accessorRegions(root, ctx),
    ...dataRegions(root, ctx),
    ...patternRegions(root, ctx),
    ...commentRegions(root, ctx),
  ].filter((r) => config.categories[r.category] !== false);

  // Resolve overlaps by category priority, then by position.
  candidates.sort((a, b) => priorityOf(a.category) - priorityOf(b.category) || a.startLine - b.startLine);
  const accepted: FoldRegion[] = [];
  for (const region of candidates) {
    if (accepted.some((a) => region.startLine <= a.endLine && a.startLine <= region.endLine)) continue;
    accepted.push(region);
  }
  accepted.sort((a, b) => a.startLine - b.startLine);

  // The keep directive pins a region open: a region never folds when it
  // contains the directive, or when the directive sits on the line above it.
  // Score 4 is above the slider's maximum threshold of 3.
  if (config.keepDirective) {
    for (const region of accepted) {
      for (let l = region.startLine - 1; l <= region.endLine; l++) {
        if ((lines[l - 1] ?? '').includes(config.keepDirective)) {
          region.score = 4;
          break;
        }
      }
    }
  }
  // A keep-marker comment (TODO, @ts-ignore, …) pins whatever region took it
  // in — a guard's leading comment, a catch body, an object literal.
  const keep = ctx.keepMarkers;
  if (keep) {
    const markers: Node[] = [];
    walk(root, (n) => {
      if (n.type === 'comment' && keep.test(n.text)) markers.push(n);
    });
    for (const region of accepted) {
      if (markers.some((c) => startLine(c) <= region.endLine && region.startLine <= endLine(c))) region.score = 4;
    }
  }
  return accepted;
}

// ---------- helpers ----------

function startLine(n: Node): number {
  return n.startPosition.row + 1;
}
function endLine(n: Node): number {
  return n.endPosition.row + 1;
}

function namedChildren(n: Node): Node[] {
  return n.namedChildren.filter((c): c is Node => c !== null);
}

function walk(node: Node, fn: (n: Node) => void): void {
  fn(node);
  for (const child of namedChildren(node)) walk(child, fn);
}

/** True when nothing but whitespace surrounds the node on its start and end lines. */
function ownsWholeLines(n: Node, lines: string[]): boolean {
  const before = (lines[n.startPosition.row] ?? '').slice(0, n.startPosition.column);
  const after = (lines[n.endPosition.row] ?? '').slice(n.endPosition.column);
  return before.trim() === '' && after.trim() === '';
}

/**
 * True when no code shares the lines `first` starts and `last` ends on (a trailing comment
 * is fine): `import "./polyfill"; main();` keeps main() in view.
 */
function ownsLines(lines: string[], first: Node, last: Node = first): boolean {
  const before = (lines[first.startPosition.row] ?? '').slice(0, first.startPosition.column);
  const after = (lines[last.endPosition.row] ?? '').slice(last.endPosition.column).trim();
  return before.trim() === '' && /^(\/\/.*|\/\*(?:(?!\*\/).)*\*\/)?$/.test(after);
}

const EFFECTS = new Set([
  'await_expression',
  'assignment_expression',
  'augmented_assignment_expression',
  'update_expression',
  'yield_expression',
]);
const FUNCTIONS = new Set(['arrow_function', 'function_expression', 'function', 'generator_function']);

/**
 * The expression does work beyond computing a value: await, assignment, ++/--, yield —
 * callbacks included, since `list.forEach((i) => { seen[i] = true; })` runs them now.
 */
function hasEffects(n: Node): boolean {
  return EFFECTS.has(n.type) || namedChildren(n).some(hasEffects);
}

function onlyBlankBetween(a: Node, b: Node, lines: string[]): boolean {
  for (let row = a.endPosition.row + 1; row < b.startPosition.row; row++) {
    if ((lines[row] ?? '').trim() !== '') return false;
  }
  return true;
}

/** The first `max` names, then "…" if there are more. */
function listNames(names: string[], max: number): string {
  return names.slice(0, max).join(', ') + (names.length > max ? ', …' : '');
}

function lineSpan(startL: number, endL: number): string {
  const n = endL - startL + 1;
  return n > 1 ? ` (${n} lines)` : '';
}

// ---------- rule: imports ----------

function importRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  // Re-exports (`export { x } from "y"`) group with imports rather than
  // breaking up the run; whole-file barrels are handled by the barrel rule.
  // only ones no code shares a line with
  const importish = namedChildren(root).filter(
    (c) =>
      (c.type === 'import_statement' || (c.type === 'export_statement' && c.childForFieldName('source') !== null)) &&
      ownsLines(ctx.lines, c),
  );
  const groups: Node[][] = [];
  for (const stmt of importish) {
    const lastGroup = groups[groups.length - 1];
    const last = lastGroup?.[lastGroup.length - 1];
    if (last && onlyBlankBetween(last, stmt, ctx.lines)) lastGroup.push(stmt);
    else groups.push([stmt]);
  }
  return groups.map((group) => {
    const names = group.map(shortModuleName).filter(Boolean);
    const reexports = group.filter((s) => s.type === 'export_statement').length;
    const imports = group.length - reexports;
    const label =
      imports > 0 && reexports > 0
        ? `${plural(imports, 'import')} + ${plural(reexports, 're-export')}`
        : reexports > 0
          ? plural(reexports, 're-export')
          : plural(imports, 'import');
    return {
      startLine: startLine(group[0]),
      endLine: endLine(group[group.length - 1]),
      category: 'import' as const,
      score: ctx.score('import'),
      summary: `${label} — ${listNames(names, 5)}`,
    };
  });
}

function shortModuleName(imp: Node): string {
  const src = imp.childForFieldName('source');
  if (!src) return '';
  const raw = src.text.replace(/^['"`]|['"`]$/g, '').replace(/^node:/, '');
  const segment = raw.split('/').filter(Boolean).pop() ?? raw;
  return segment.replace(/\.(ts|js|mjs|cjs|tsx|jsx)$/, '');
}

// ---------- rule: comments ----------

function commentRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  const comments: Node[] = [];
  walk(root, (n) => {
    if (n.type === 'comment' && ownsWholeLines(n, ctx.lines)) comments.push(n);
  });

  const runs: Node[][] = [];
  for (const c of comments) {
    const lastRun = runs[runs.length - 1];
    const last = lastRun?.[lastRun.length - 1];
    if (last && startLine(c) === endLine(last) + 1) lastRun.push(c);
    else runs.push([c]);
  }

  return runs.map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    const text = run.map((c) => c.text).join('\n');
    const isMarker = ctx.keepMarkers !== null && ctx.keepMarkers.test(text);
    return {
      startLine: startLine(first),
      endLine: endLine(last),
      category: 'comment' as const,
      // keep-marker comments carry review signal — score 4 never folds at any threshold
      score: isMarker ? 4 : ctx.score('comment'),
      summary: commentSummary(text, startLine(first), endLine(last)),
    };
  });
}

function commentSummary(text: string, startL: number, endL: number): string {
  const isDoc = text.startsWith('/**');
  const content = text
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*(\/\*\*?|\*\/|\*|\/\/)\s?/, '')
        .replace(/\*\/\s*$/, '')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
  const label = isDoc ? 'doc' : '//';
  return `${label} "${truncate(content, 56)}"${lineSpan(startL, endL)}`;
}

// ---------- rule: guards ----------

/**
 * A guard is any else-less `if` whose body does nothing but exit early
 * (throw, return, continue, break), optionally with a log line. lens flags
 * them anywhere in the code; judging whether a guard matters is the
 * reviewer's job — the pill is one click from the real code.
 */
function guardRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  const regions: FoldRegion[] = [];
  walk(root, (node) => {
    if (node.type !== 'statement_block' && node.type !== 'program') return;

    // Merge consecutive guards (and the comments directly above them) into
    // one region per run.
    let run: { first: Node; last: Node; count: number; exits: string[]; logged: boolean } | null = null;
    let pendingComments: Node[] = [];
    const flush = () => {
      if (run) {
        const unique = [...new Set(run.exits)];
        const logNote = run.logged ? ' + log' : '';
        regions.push({
          startLine: startLine(run.first),
          endLine: endLine(run.last),
          category: 'guard',
          score: ctx.score('guard'),
          summary: `${plural(run.count, 'guard')} \u2192 ${unique.join(', ')}${logNote}${lineSpan(startLine(run.first), endLine(run.last))}`,
        });
      }
      run = null;
    };

    for (const stmt of namedChildren(node)) {
      if (stmt.type === 'comment') {
        // a trailing comment (`const a = f(x); // why`) belongs to its line, not to the guard below
        if (ownsWholeLines(stmt, ctx.lines)) pendingComments.push(stmt);
        continue;
      }
      // `const a = f(x); if (!a) return null;`: the fold would take the other statement with it
      const guard = ownsLines(ctx.lines, stmt) ? asGuard(stmt, ctx) : null;
      if (guard) {
        if (!run) run = { first: pendingComments[0] ?? stmt, last: stmt, count: 0, exits: [], logged: false };
        run.last = stmt;
        run.count++;
        run.exits.push(...guard.exits);
        run.logged ||= guard.logged;
      } else {
        flush();
      }
      pendingComments = [];
    }
    flush();
  });
  return regions;
}

function asGuard(stmt: Node, ctx: RuleContext): { exits: string[]; logged: boolean } | null {
  if (stmt.type !== 'if_statement') return null;
  if (stmt.childForFieldName('alternative')) return null;
  // `if (await limiter.consume(id))`, `if (attempts++ > max)`: the check itself does work
  const condition = stmt.childForFieldName('condition');
  if (condition && hasEffects(condition)) return null;
  const consequence = stmt.childForFieldName('consequence');
  if (!consequence) return null;
  const statements =
    consequence.type === 'statement_block'
      ? namedChildren(consequence).filter((c) => c.type !== 'comment')
      : [consequence];
  if (statements.length === 0) return null;

  const exits: string[] = [];
  let logged = false;
  for (const s of statements) {
    const exit = exitDescription(s);
    if (exit) {
      exits.push(exit);
      continue;
    }
    if (asNoiseCall(s, ctx)) {
      logged = true;
      continue;
    }
    return null; // anything else is real logic, not a guard
  }
  if (exits.length === 0) return null;
  return { exits, logged };
}

function exitDescription(s: Node): string | null {
  // `throw await rollback(tx)`, `return (cache = load())`: the exit does real work
  // (returning a function only creates it: `return async () => { await cleanup(); }` runs later)
  const value = namedChildren(s)[0];
  if (
    (s.type === 'throw_statement' || s.type === 'return_statement') &&
    value &&
    !FUNCTIONS.has(value.type) &&
    hasEffects(value)
  )
    return null;
  if (s.type === 'throw_statement') {
    const arg = namedChildren(s)[0];
    if (arg?.type === 'new_expression') {
      const ctor = arg.childForFieldName('constructor');
      if (ctor) return `throw ${ctor.text}`;
    }
    return 'throw';
  }
  if (s.type === 'return_statement') {
    const arg = namedChildren(s)[0];
    return arg ? `return ${truncate(arg.text, 24)}` : 'return';
  }
  // with its label: `continue outer` skips more than the inner loop's rest
  if (s.type === 'continue_statement' || s.type === 'break_statement') return s.text.replace(/;$/, '');
  return null;
}

// ---------- rule: logging ----------

interface LogCall {
  receiver: string;
  method: string;
  firstStringArg: string | null;
}

/** One rule pass per configured call pattern (logging, telemetry, custom...). */
function patternRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  return ctx.patterns.flatMap((pattern) =>
    callStatementRegions(
      root,
      ctx,
      pattern.category,
      `${pattern.category} call`,
      (stmt) => asCallTo(stmt, pattern.receiver, pattern.methods),
      pattern.score,
    ),
  );
}

function callStatementRegions(
  root: Node,
  ctx: RuleContext,
  category: FoldCategory,
  noun: string,
  match: (stmt: Node) => LogCall | null,
  score: number,
): FoldRegion[] {
  const calls: { node: Node; call: LogCall }[] = [];
  walk(root, (n) => {
    if (n.type !== 'expression_statement' || !ownsWholeLines(n, ctx.lines)) return;
    const call = match(n);
    if (call) calls.push({ node: n, call });
  });

  const runs: { node: Node; call: LogCall }[][] = [];
  for (const entry of calls) {
    const lastRun = runs[runs.length - 1];
    const last = lastRun?.[lastRun.length - 1];
    if (last && startLine(entry.node) === endLine(last.node) + 1) lastRun.push(entry);
    else runs.push([entry]);
  }

  return runs.map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    let summary: string;
    if (run.length === 1) {
      const { receiver, method, firstStringArg } = first.call;
      const preview = firstStringArg ? ` — "${truncate(firstStringArg, 44)}"` : '';
      summary = `${receiver}.${method}${preview}`;
    } else {
      summary = `${plural(run.length, noun)}`;
    }
    return {
      startLine: startLine(first.node),
      endLine: endLine(last.node),
      category,
      score,
      summary,
    };
  });
}

/** Matches any configured noise-call pattern (used by the guard and catch rules). */
function asNoiseCall(stmt: Node, ctx: RuleContext): LogCall | null {
  // `return logger.error(err)` exits as well: not only a log
  if (stmt.type !== 'expression_statement') return null;
  for (const pattern of ctx.patterns) {
    const call = asCallTo(stmt, pattern.receiver, pattern.methods);
    if (call) return call;
  }
  return null;
}

function asCallTo(stmt: Node, receiverPattern: RegExp, methods: Set<string> | null): LogCall | null {
  const expr = namedChildren(stmt)[0];
  if (!expr || expr.type !== 'call_expression') return null;
  const fn = expr.childForFieldName('function');
  if (!fn || fn.type !== 'member_expression') return null;
  const method = fn.childForFieldName('property')?.text ?? '';
  if (methods !== null && !methods.has(method)) return null;
  const receiver = fn.childForFieldName('object')?.text ?? '';
  if (!receiverPattern.test(receiver)) return null;

  let firstStringArg: string | null = null;
  const args = expr.childForFieldName('arguments');
  // `logger.info(await save())`, `console.log(i++)`: the arguments do the work
  if (args && hasEffects(args)) return null;
  const firstArg = args ? namedChildren(args)[0] : undefined;
  if (firstArg) {
    // Use the first string literal in the first argument, so previews survive
    // concatenations like `"no config at " + file`.
    walk(firstArg, (n) => {
      if (firstStringArg === null && (n.type === 'string' || n.type === 'template_string')) {
        firstStringArg = n.text.replace(/^['"`]|['"`]$/g, '');
      }
    });
  }
  return { receiver, method, firstStringArg };
}

// ---------- rule: error boilerplate ----------

function catchRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  const regions: FoldRegion[] = [];
  walk(root, (node) => {
    if (node.type !== 'catch_clause') return;
    const body = node.childForFieldName('body');
    if (!body || body.type !== 'statement_block') return;
    const param = node.childForFieldName('parameter')?.text ?? '';
    const statements = namedChildren(body).filter((c) => c.type !== 'comment');
    if (statements.length === 0) return;

    let logs = 0;
    let rethrows = 0;
    for (const s of statements) {
      if (asNoiseCall(s, ctx)) {
        logs++;
        continue;
      }
      if (
        s.type === 'throw_statement' &&
        namedChildren(s)[0]?.type === 'identifier' &&
        namedChildren(s)[0].text === param
      ) {
        rethrows++;
        continue;
      }
      return; // anything else means the catch has behavior — keep it visible
    }

    const inner = namedChildren(body);
    const first = inner[0];
    const last = inner[inner.length - 1];
    // `try { await save(); } catch (e) { logger.error(e); }`: the fold would hide the try too
    if (!ownsLines(ctx.lines, first, last)) return;
    const parts = [logs > 0 ? 'log' : '', rethrows > 0 ? 'rethrow' : ''].filter(Boolean);
    regions.push({
      startLine: startLine(first),
      endLine: endLine(last),
      category: 'error-boilerplate',
      score: ctx.score('error-boilerplate'),
      summary: `catch${param ? ` (${param})` : ''}: ${parts.join(' + ')}${lineSpan(startLine(first), endLine(last))}`,
    });
  });
  return regions;
}

// ---------- rule: constant data ----------

const PURE_LITERAL_TYPES = new Set(['string', 'number', 'true', 'false', 'null', 'undefined', 'regex']);

/** Unwraps `as const`, `satisfies T`, and parentheses down to the value node. */
function unwrapValue(node: Node): Node {
  let n = node;
  while (n.type === 'as_expression' || n.type === 'satisfies_expression' || n.type === 'parenthesized_expression') {
    const inner = namedChildren(n)[0];
    if (!inner) break;
    n = inner;
  }
  return n;
}

/** Literals all the way down — no calls, identifiers, spreads, or substitutions. */
function isPureLiteral(node: Node): boolean {
  const n = unwrapValue(node);
  if (PURE_LITERAL_TYPES.has(n.type)) return true;
  if (n.type === 'template_string') {
    return !namedChildren(n).some((c) => c.type === 'template_substitution');
  }
  if (n.type === 'unary_expression') return namedChildren(n)[0]?.type === 'number';
  if (n.type === 'array') {
    return namedChildren(n)
      .filter((c) => c.type !== 'comment')
      .every(isPureLiteral);
  }
  if (n.type === 'object') {
    return namedChildren(n).every((prop) => {
      if (prop.type === 'comment') return true;
      if (prop.type !== 'pair') return false; // shorthand/spread/method = behavior
      // a computed key is code too: `[makeKey()]: 1`
      const key = prop.childForFieldName('key');
      if (key?.type === 'computed_property_name' && !namedChildren(key).every(isPureLiteral)) return false;
      const value = prop.childForFieldName('value');
      return value !== null && isPureLiteral(value);
    });
  }
  return false;
}

interface ConstData {
  names: string[];
  singleDesc: string;
}

/** Matches `const X = <pure literal>` (optionally exported) and literal enums. */
function asConstData(stmt: Node): ConstData | null {
  let decl = stmt;
  if (decl.type === 'export_statement') {
    decl = decl.childForFieldName('declaration') ?? decl;
  }

  if (decl.type === 'enum_declaration') {
    const name = decl.childForFieldName('name')?.text ?? 'enum';
    const body = decl.childForFieldName('body');
    const members = body ? namedChildren(body).filter((c) => c.type !== 'comment') : [];
    if (members.length === 0) return null;
    const allLiteral = members.every((m) => {
      if (m.type === 'property_identifier' || m.type === 'string') return true;
      if (m.type !== 'enum_assignment') return false;
      const value = m.childForFieldName('value');
      return value !== null && isPureLiteral(value);
    });
    if (!allLiteral) return null;
    return { names: [name], singleDesc: `enum ${name} — ${plural(members.length, 'member')}` };
  }

  if (decl.type !== 'lexical_declaration') return null;
  if (!decl.children.some((c) => c?.type === 'const')) return null;
  const declarators = namedChildren(decl).filter((c) => c.type === 'variable_declarator');
  if (declarators.length === 0) return null;

  const names: string[] = [];
  let singleDesc = '';
  for (const declarator of declarators) {
    const value = declarator.childForFieldName('value');
    if (!value || !isPureLiteral(value)) return null;
    const name = declarator.childForFieldName('name')?.text ?? '?';
    names.push(name);
    singleDesc = describeLiteral(name, value);
  }
  return { names, singleDesc };
}

function describeLiteral(name: string, valueNode: Node): string {
  const v = unwrapValue(valueNode);
  if (v.type === 'object') {
    const keys = namedChildren(v).filter((c) => c.type === 'pair').length;
    return `const ${name} — object, ${plural(keys, 'key')}`;
  }
  if (v.type === 'array') {
    const items = namedChildren(v).filter((c) => c.type !== 'comment').length;
    return `const ${name} — array, ${plural(items, 'item')}`;
  }
  return `const ${name} = ${truncate(v.text, 24)}`;
}

/**
 * Pure-literal constants fold as data: a multi-line literal (lookup maps,
 * option objects, enums) on its own, and runs of adjacent one-liner constants
 * together. Groups spanning fewer than 3 lines stay visible — inline
 * constants are more readable than a pill.
 */
function dataRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  const regions: FoldRegion[] = [];
  walk(root, (container) => {
    if (container.type !== 'statement_block' && container.type !== 'program') return;

    let run: { first: Node; last: Node; entries: ConstData[] } | null = null;
    const flush = () => {
      if (run) {
        const span = endLine(run.last) - startLine(run.first) + 1;
        if (span >= 3) {
          const names = run.entries.flatMap((e) => e.names);
          const summary =
            (names.length === 1
              ? run.entries[0].singleDesc
              : `${plural(names.length, 'constant')} — ${listNames(names, 4)}`) +
            lineSpan(startLine(run.first), endLine(run.last));
          regions.push({
            startLine: startLine(run.first),
            endLine: endLine(run.last),
            category: 'data',
            score: ctx.score('data'),
            summary,
          });
        }
      }
      run = null;
    };

    for (const stmt of namedChildren(container)) {
      if (stmt.type === 'comment') continue; // don't absorb, don't break the run check below
      const data = ownsWholeLines(stmt, ctx.lines) ? asConstData(stmt) : null;
      if (data) {
        // only merge directly adjacent statements into one run
        if (run && startLine(stmt) > endLine(run.last) + 1) flush();
        if (!run) run = { first: stmt, last: stmt, entries: [] };
        run.last = stmt;
        run.entries.push(data);
      } else {
        flush();
      }
    }
    flush();
  });
  return regions;
}

// ---------- rule: trivial accessors ----------

function accessorRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  const regions: FoldRegion[] = [];
  walk(root, (node) => {
    if (node.type !== 'class_body') return;
    let run: { first: Node; last: Node; names: string[] } | null = null;
    const flush = () => {
      if (run) {
        regions.push({
          startLine: startLine(run.first),
          endLine: endLine(run.last),
          category: 'accessor',
          score: ctx.score('accessor'),
          summary: `${plural(run.names.length, 'accessor')} — ${listNames(run.names, 4)}${lineSpan(startLine(run.first), endLine(run.last))}`,
        });
      }
      run = null;
    };
    for (const member of namedChildren(node)) {
      // `class Box { get x() { return this._x; } }`: the fold would hide the class's line
      const name = ownsLines(ctx.lines, member) ? asAccessor(member) : null;
      if (name) {
        if (!run) run = { first: member, last: member, names: [] };
        run.last = member;
        run.names.push(name);
      } else {
        flush();
      }
    }
    flush();
  });
  return regions;
}

/**
 * Getters/setters that only return or store a value, trivial property returns, and
 * genuine delegation — a one-call body that forwards to a same-named callee or
 * passes the method's own parameters through verbatim. Constructors, static
 * members (usually factories: fromEntity, of, parse), one-liners with real
 * logic (assertions, mapping), and multi-statement methods never match.
 */
function asAccessor(member: Node): string | null {
  if (member.type !== 'method_definition') return null;
  const name = member.childForFieldName('name')?.text ?? '';
  if (name === 'constructor') return null;
  const keywords = member.children.filter((c): c is Node => c !== null).map((c) => c.type);
  if (keywords.includes('static')) return null;
  const body = member.childForFieldName('body');
  if (!body || body.type !== 'statement_block') return null;
  const statements = namedChildren(body).filter((c) => c.type !== 'comment');
  if (statements.length !== 1) return null;
  const stmt = statements[0];
  const expr = namedChildren(stmt)[0];

  // trivial property return: `return this._x`
  const plainReturn =
    stmt.type === 'return_statement' && (expr?.type === 'member_expression' || expr?.type === 'identifier');
  if (keywords.includes('get')) return plainReturn ? `get ${name}` : null;
  // trivial store of its own parameter: `this._x = v`
  if (keywords.includes('set')) {
    const first = namedChildren(member.childForFieldName('parameters') ?? body)[0];
    const param = first && paramName(first);
    return expr?.type === 'assignment_expression' &&
      param !== undefined &&
      expr.childForFieldName('right')?.text === param
      ? `set ${name}`
      : null;
  }
  if (plainReturn) return `${name}()`;
  // delegation: the whole method is one forwarding call, returned or bare
  if (
    (stmt.type === 'return_statement' || stmt.type === 'expression_statement') &&
    expr?.type === 'call_expression' &&
    isForwardingCall(expr, member, name)
  )
    return `${name}()`;
  return null;
}

// A parameter is wrapped in typescript (`pattern`, and `value` for its default) and bare in
// javascript (`msg`, or an assignment_pattern for `retries = 3`).
function paramName(param: Node): string {
  return (param.childForFieldName('pattern') ?? param).text;
}
function hasDefault(param: Node): boolean {
  return param.type === 'assignment_pattern' || param.childForFieldName('value') !== null;
}

/**
 * A call forwards when its arguments are exactly the method's own parameters,
 * verbatim and in order, and either the callee shares the method's name
 * (`close() { this.socket.close(); }`) or there is at least one parameter
 * (`send(msg) { this.bus.send(msg); }`).
 */
function isForwardingCall(call: Node, member: Node, methodName: string): boolean {
  const fn = call.childForFieldName('function');
  const calleeName =
    fn?.type === 'member_expression'
      ? fn.childForFieldName('property')?.text
      : fn?.type === 'identifier'
        ? fn.text
        : undefined;

  // either way the arguments are the parameters, verbatim: `save(e) { this.db.save(e, { force: true }) }`
  // or `load(id, retries = 3) { this.repo.load(id) }` adds or drops something the pill wouldn't show
  const paramsNode = member.childForFieldName('parameters');
  const argsNode = call.childForFieldName('arguments');
  if (!paramsNode || !argsNode) return false;
  const paramNodes = namedChildren(paramsNode);
  // a default (`retries = 3`) is a value the pill wouldn't show
  if (paramNodes.some(hasDefault)) return false;
  const params = paramNodes.map(paramName);
  const args = namedChildren(argsNode);
  // `...args` passes through as `...args`
  const verbatim =
    params.length === args.length &&
    args.every((a, i) => (a.type === 'identifier' || a.type === 'spread_element') && a.text === params[i]);
  return verbatim && (calleeName === methodName || params.length > 0);
}

// ---------- rule: barrel files ----------

/** A file whose every statement is an import or a re-export folds to one pill. */
function barrelRegions(root: Node, ctx: RuleContext): FoldRegion[] {
  const all = namedChildren(root);
  const statements = all.filter((c) => c.type !== 'comment');
  if (statements.length === 0) return [];

  let reexports = 0;
  const names: string[] = [];
  const sideEffects: string[] = [];
  for (const stmt of statements) {
    if (stmt.type === 'import_statement') {
      // a side-effect import (`import "reflect-metadata"`) runs code: the pill names it
      if (!namedChildren(stmt).some((c) => c.type === 'import_clause')) sideEffects.push(shortModuleName(stmt));
      continue;
    }
    if (stmt.type === 'export_statement' && stmt.childForFieldName('source')) {
      reexports++;
      const name = shortModuleName(stmt);
      if (name) names.push(name);
      continue;
    }
    return [];
  }
  if (reexports === 0) return [];

  return [
    {
      startLine: 1,
      endLine: endLine(all[all.length - 1]),
      category: 'barrel',
      score: ctx.score('barrel'),
      summary:
        `barrel file — re-exports ${plural(reexports, 'module')}: ${listNames(names, 5)}` +
        (sideEffects.length > 0 ? `; runs ${listNames(sideEffects, 3)}` : ''),
    },
  ];
}
