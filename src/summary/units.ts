import { createHash } from "node:crypto";
import type { Node } from "@vscode/tree-sitter-wasm";
import { parseSource, languageForFile } from "../parse/parser.ts";
import type { LanguageId, RemovedBlock } from "../model.ts";

// A "unit" is the thing summary mode summarizes: one changed declaration
// (function, component, hook, method, class, type, constant, top-level call),
// or a per-file leftover for changes outside any declaration. Every changed
// and removed line of the diff belongs to exactly one unit.

export type UnitKind =
  | "function" | "component" | "hook" | "method" | "property" | "class" | "type"
  | "constant" | "call" | "namespace" | "statement" | "module" | "file";

export type UnitStatus = "new" | "modified" | "deleted";

export interface LineRange {
  /** 1-based, inclusive */
  start: number;
  end: number;
}

export interface Unit {
  /** "path#qualifiedName" — "path#(module)" for leftovers, "path#(file)" for whole-file units */
  id: string;
  file: string;
  name: string;
  kind: UnitKind;
  status: UnitStatus;
  /** New-side lines to show, sorted and non-overlapping; empty for deleted units */
  ranges: LineRange[];
  /** New-side lines of this unit the diff touched */
  changedLines: number[];
  /** Removed old-side lines of this unit, anchored like FileFoldModel.removals */
  removals: RemovedBlock[];
  /** Old and new declaration differ only in whitespace */
  formattingOnly?: boolean;
  /** Content + position hash; a summary written for another hash is stale */
  hash: string;
}

export interface UnitFileInput {
  /** Repo-relative path (for deleted files: the old path) */
  file: string;
  /** null for deleted files */
  newSource: string | null;
  /** null for added files */
  oldSource: string | null;
  changedLines: number[];
  removals: RemovedBlock[];
  /** Test files are summarized as a whole */
  isTest: boolean;
}

export const MODULE_NAME = "(module)";
export const FILE_NAME = "(file)";

/** Leaf declarations longer than this show only the changed windows. */
const MAX_FULL_UNIT_LINES = 200;
const CONTEXT = 3;

interface Decl {
  name: string;
  kind: UnitKind;
  ranges: LineRange[];
  /** Classes and namespaces: members own their own lines; show only windows */
  container: boolean;
  text: string;
}

export async function extractUnits(input: UnitFileInput): Promise<Unit[]> {
  const { file, newSource, oldSource } = input;
  const newLines = newSource === null ? [] : newSource.split("\n");

  if (newSource === null) {
    const removals = oldSource === null ? [] : [{ afterLine: 0, oldStart: 1, lines: oldSource.split("\n") }];
    return [finish(fileUnit(input, "deleted", [], removals), newLines)];
  }
  const wholeFile = () =>
    [finish(fileUnit(input, oldSource === null ? "new" : "modified", input.changedLines, input.removals), newLines)];
  const lang = languageForFile(file);
  if (!lang || input.isTest) return wholeFile();

  const newIndex = await indexSource(newSource, lang);
  const oldIndex = oldSource === null ? new Map<string, Decl>() : await indexSource(oldSource, lang);
  // A side that doesn't parse cleanly can't be split reliably.
  if (newIndex === null || oldIndex === null) return wholeFile();

  const oldLines = oldSource === null ? [] : oldSource.split("\n");
  // A blank line between declarations joins its neighbour instead of making
  // a "module-level" unit of its own.
  const withBlanks = (lookup: (line: number) => string | null, lines: string[]) => (line: number) =>
    lookup(line) ?? ((lines[line - 1] ?? "").trim() === "" ? lookup(line + 1) ?? lookup(line - 1) : null);
  const ownerNew = withBlanks(ownerLookup(newIndex), newLines);
  const ownerOld = withBlanks(ownerLookup(oldIndex), oldLines);
  const touched = new Map<string, { changed: number[]; removals: RemovedBlock[] }>();
  const slot = (name: string) => {
    let s = touched.get(name);
    if (!s) touched.set(name, (s = { changed: [], removals: [] }));
    return s;
  };

  for (const line of input.changedLines) slot(ownerNew(line) ?? MODULE_NAME).changed.push(line);
  for (const block of input.removals) {
    // A removed block can span several old declarations: split it so each
    // piece goes to the declaration it was removed from.
    let piece: RemovedBlock | null = null;
    let pieceOwner = "";
    for (let i = 0; i < block.lines.length; i++) {
      const owner = ownerOld(block.oldStart + i) ?? MODULE_NAME;
      if (!piece || owner !== pieceOwner) {
        piece = { afterLine: block.afterLine, oldStart: block.oldStart + i, lines: [] };
        pieceOwner = owner;
        slot(owner).removals.push(piece);
      }
      piece.lines.push(block.lines[i]);
    }
  }

  const lineCount = newLines.length;
  const units: Unit[] = [];
  for (const [name, t] of touched) {
    const newDecl = name === MODULE_NAME ? undefined : newIndex.get(name);
    const oldDecl = name === MODULE_NAME ? undefined : oldIndex.get(name);
    const status: UnitStatus = name === MODULE_NAME
      ? (oldSource === null ? "new" : "modified")
      : newDecl && oldDecl ? "modified" : newDecl ? "new" : "deleted";
    const decl = newDecl ?? oldDecl;
    let ranges: LineRange[];
    if (status === "deleted") ranges = [];
    else if (!newDecl || newDecl.container || span(newDecl.ranges) > MAX_FULL_UNIT_LINES) {
      ranges = windowsAround(t.changed, t.removals, lineCount);
    } else {
      // with its changed lines: a blank line added next to it joined it, but isn't in its ranges
      ranges = mergeRanges([...newDecl.ranges, ...t.changed.map((l) => ({ start: l, end: l }))]);
    }
    const unit: Unit = {
      id: `${file}#${name}`,
      file,
      name,
      kind: decl?.kind ?? "module",
      status,
      ranges,
      changedLines: t.changed.sort((a, b) => a - b),
      removals: t.removals,
      hash: "",
    };
    if (newDecl && oldDecl && squash(newDecl.text) === squash(oldDecl.text)) unit.formattingOnly = true;
    units.push(finish(unit, newLines));
  }
  return units.sort((a, b) => firstLine(a) - firstLine(b));
}

function fileUnit(input: UnitFileInput, status: UnitStatus, changed: number[], removals: RemovedBlock[]): Unit {
  const lineCount = input.newSource === null ? 0 : input.newSource.split("\n").length;
  return {
    id: `${input.file}#${FILE_NAME}`,
    file: input.file,
    name: FILE_NAME,
    kind: "file",
    status,
    ranges: status === "deleted" ? [] : windowsAround(changed, removals, lineCount),
    changedLines: [...changed].sort((a, b) => a - b),
    removals,
    hash: "",
  };
}

function finish(unit: Unit, newLines: string[]): Unit {
  const shown = unit.ranges.map((r) => [r.start, newLines.slice(r.start - 1, r.end)]);
  unit.hash = createHash("sha256")
    .update(JSON.stringify([unit.kind, unit.status, shown, unit.changedLines, unit.removals]))
    .digest("hex")
    .slice(0, 16);
  return unit;
}

function firstLine(u: Unit): number {
  return u.ranges[0]?.start ?? u.removals[0]?.afterLine ?? 0;
}

function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

function span(ranges: LineRange[]): number {
  return Math.max(...ranges.map((r) => r.end)) - Math.min(...ranges.map((r) => r.start)) + 1;
}

export function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: LineRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** ±CONTEXT windows around changed lines and removal anchors, merged. */
function windowsAround(changed: number[], removals: RemovedBlock[], lineCount: number): LineRange[] {
  if (lineCount === 0) return [];
  const anchors = [...changed];
  for (const b of removals) anchors.push(Math.max(1, b.afterLine), Math.min(lineCount, b.afterLine + 1));
  return mergeRanges(anchors.map((l) => ({
    start: Math.max(1, l - CONTEXT),
    end: Math.min(lineCount, l + CONTEXT),
  })));
}

/** Line → owning declaration name; the smallest (most specific) range wins. */
function ownerLookup(index: Map<string, Decl>): (line: number) => string | null {
  const entries = [...index.values()].flatMap((d) => d.ranges.map((r) => ({ name: d.name, r })));
  return (line) => {
    let best: { name: string; size: number } | null = null;
    for (const { name, r } of entries) {
      if (line < r.start || line > r.end) continue;
      const size = r.end - r.start;
      if (!best || size < best.size) best = { name, size };
    }
    return best?.name ?? null;
  };
}

// ---------- declaration index ----------

/** null when the source has syntax errors. */
async function indexSource(source: string, lang: LanguageId): Promise<Map<string, Decl> | null> {
  const tree = await parseSource(source, lang);
  try {
    if (tree.rootNode.hasError) return null;
    const index = new Map<string, Decl>();
    const lines = source.split("\n");
    const add = (name: string, kind: UnitKind, start: number, node: Node, container = false) => {
      const range = { start, end: node.endPosition.row + 1 };
      // Source lines, not node.text: the range includes attached doc comments.
      const text = lines.slice(range.start - 1, range.end).join("\n");
      const existing = index.get(name);
      // Same name twice (overloads, getter + setter): one unit, several ranges.
      if (existing) {
        existing.ranges.push(range);
        existing.text += "\n" + text;
      } else {
        index.set(name, { name, kind, ranges: [range], container, text });
      }
    };
    forEachWithComments(tree.rootNode, (stmt, start) => indexTopLevel(stmt, start, lang, add));
    return index;
  } finally {
    tree.delete();
  }
}

type AddDecl = (name: string, kind: UnitKind, start: number, node: Node, container?: boolean) => void;

/**
 * Calls fn for every non-comment named child, with the start line extended
 * over the comments directly above it (no blank line between), so doc
 * comment edits belong to the declaration they document. A trailing comment
 * (`foo(); // note`) belongs to the line it ends, not to what follows.
 */
function forEachWithComments(parent: Node, fn: (node: Node, start: number) => void): void {
  let comments: Node[] = [];
  let previousEnd = -1; // row where the last non-comment child ended
  for (const child of parent.namedChildren) {
    if (!child) continue;
    if (child.type === "comment") {
      if (child.startPosition.row !== previousEnd) comments.push(child);
      continue;
    }
    previousEnd = child.endPosition.row;
    let start = child.startPosition.row + 1;
    for (let i = comments.length - 1; i >= 0; i--) {
      if (comments[i].endPosition.row + 1 < start - 1) break;
      start = comments[i].startPosition.row + 1;
    }
    comments = [];
    fn(child, start);
  }
}

function indexTopLevel(stmt: Node, start: number, lang: LanguageId, add: AddDecl): void {
  let node = stmt;
  if (node.type === "export_statement") {
    const declaration = node.childForFieldName("declaration");
    const value = node.childForFieldName("value");
    if (declaration) node = declaration;
    else if (value) { add("default", valueKind("default", value, lang), start, stmt); return; }
    else return; // export { a } / export * from — module-level
  }
  if (node.type === "ambient_declaration") node = node.namedChildren.find((c) => c !== null) ?? node;
  if (node.type === "expression_statement") {
    const inner = node.namedChildren[0];
    if (inner?.type === "internal_module") node = inner;
  }

  switch (node.type) {
    case "function_declaration":
    case "generator_function_declaration":
    case "function_signature": {
      const name = node.childForFieldName("name")?.text ?? "default";
      add(name, functionKind(name, lang), start, stmt);
      return;
    }
    case "class_declaration":
    case "abstract_class_declaration": {
      const name = node.childForFieldName("name")?.text ?? "default";
      add(name, "class", start, stmt, true);
      const body = node.childForFieldName("body");
      if (body) forEachWithComments(body, (member, memberStart) => indexMember(name, member, memberStart, add));
      return;
    }
    case "lexical_declaration":
    case "variable_declaration": {
      const declarators = node.namedChildren.filter((c): c is Node => c?.type === "variable_declarator");
      if (declarators.length === 0) return;
      const names = declarators.map((d) => oneLine(d.childForFieldName("name")?.text ?? "?", 40));
      const name = names.join(", ");
      const value = declarators.length === 1 ? declarators[0].childForFieldName("value") : null;
      add(name, value ? valueKind(name, value, lang) : "constant", start, stmt);
      return;
    }
    case "interface_declaration":
    case "type_alias_declaration":
    case "enum_declaration": {
      const name = node.childForFieldName("name")?.text;
      if (name) add(name, "type", start, stmt);
      return;
    }
    case "internal_module":
    case "module": {
      const name = node.childForFieldName("name")?.text;
      if (name) add(oneLine(name, 60), "namespace", start, stmt, true);
      return;
    }
    case "expression_statement": {
      let expr = node.namedChildren[0];
      if (expr?.type === "await_expression") expr = expr.namedChildren[0];
      if (expr?.type === "call_expression") {
        add(callName(expr), "call", start, stmt);
      } else if (expr?.type === "assignment_expression") {
        const left = expr.childForFieldName("left");
        if (left) add(oneLine(left.text, 60), "statement", start, stmt);
      }
      return;
    }
    default:
      return; // imports, control flow at top level, … — module-level
  }
}

function indexMember(className: string, member: Node, start: number, add: AddDecl): void {
  const MEMBER_KINDS: Record<string, UnitKind> = {
    method_definition: "method",
    abstract_method_signature: "method",
    method_signature: "method",
    public_field_definition: "property",
    property_signature: "property",
    index_signature: "property",
  };
  const kind = MEMBER_KINDS[member.type];
  if (!kind) return;
  let name = member.childForFieldName("name")?.text ?? "?";
  if (member.type === "index_signature") name = `[${name}]`;
  const value = member.childForFieldName("value");
  const isFunction = value?.type === "arrow_function" || value?.type === "function_expression";
  add(`${className}.${name}`, isFunction ? "method" : kind, start, member);
}

/** `router.get("/orders")`, `describe("parser")`, `app.listen()` */
function callName(call: Node): string {
  const callee = oneLine(call.childForFieldName("function")?.text ?? "call", 40);
  const first = call.childForFieldName("arguments")?.namedChildren[0];
  const literal = first && (first.type === "string" || first.type === "template_string") ? oneLine(first.text, 40) : "";
  return `${callee}(${literal})`;
}

const COMPONENT_WRAPPERS = /^(React\.)?(memo|forwardRef|lazy)$|^observer$|^styled\b/;

function valueKind(name: string, value: Node, lang: LanguageId): UnitKind {
  if (value.type === "arrow_function" || value.type === "function_expression" || value.type === "function") {
    return functionKind(name, lang);
  }
  if (value.type === "class") return "class";
  if (value.type === "call_expression") {
    const callee = value.childForFieldName("function")?.text ?? "";
    if (COMPONENT_WRAPPERS.test(callee) && /^[A-Z]/.test(name)) return "component";
    if (/^use[A-Z0-9]/.test(name)) return "hook";
  }
  return "constant";
}

function functionKind(name: string, lang: LanguageId): UnitKind {
  if (/^use[A-Z0-9]/.test(name)) return "hook";
  // Capitalized functions are components in JSX-capable files; in .ts they're
  // usually factories or constructors-by-convention.
  if (/^[A-Z]/.test(name) && lang !== "typescript") return "component";
  return "function";
}

function oneLine(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max - 1) + "…" : collapsed;
}

// ---------- invariant + labels ----------

/**
 * Checks that every changed line and every removed old line belongs to
 * exactly one unit. Returns human-readable problems; empty means OK.
 */
export function checkCoverage(input: UnitFileInput, units: Unit[]): string[] {
  const problems: string[] = [];
  const changed = new Map<number, number>();
  const removed = new Map<number, number>();
  for (const u of units) {
    for (const l of u.changedLines) changed.set(l, (changed.get(l) ?? 0) + 1);
    for (const b of u.removals) b.lines.forEach((_, i) => removed.set(b.oldStart + i, (removed.get(b.oldStart + i) ?? 0) + 1));
  }
  for (const l of input.changedLines) {
    const n = changed.get(l) ?? 0;
    if (n !== 1) problems.push(`${input.file}: changed line ${l} is in ${n} units`);
  }
  for (const b of input.removals) {
    b.lines.forEach((_, i) => {
      const n = removed.get(b.oldStart + i) ?? 0;
      if (n !== 1) problems.push(`${input.file}: removed old line ${b.oldStart + i} is in ${n} units`);
    });
  }
  return problems;
}

/** The line labels a summary may cite for this unit: N<line> changed, O<line> removed. */
export function citeableLabels(unit: Unit): Set<string> {
  const labels = new Set(unit.changedLines.map((l) => `N${l}`));
  for (const b of unit.removals) b.lines.forEach((_, i) => labels.add(`O${b.oldStart + i}`));
  return labels;
}

/**
 * Where each removed block shows: after the new-side line it's anchored to,
 * snapped into the shown ranges — before the first range when anchored above
 * it, after the last shown line at or before the anchor otherwise.
 */
export function removalAnchors(unit: Unit): Map<number, Unit["removals"]> {
  const at = new Map<number, Unit["removals"]>();
  const shown: number[] = [];
  for (const r of unit.ranges) for (let l = r.start; l <= r.end; l++) shown.push(l);
  for (const b of unit.removals) {
    let anchor = 0;
    if (shown.length > 0) {
      if (b.afterLine < shown[0]) anchor = shown[0] - 1;
      else anchor = shown.filter((l) => l <= b.afterLine).pop() ?? shown[0] - 1;
      // exactly the line before a later range start: show it at that range's top
      const next = unit.ranges.find((r) => r.start - 1 === b.afterLine);
      if (next) anchor = b.afterLine;
    }
    at.set(anchor, [...(at.get(anchor) ?? []), b]);
  }
  return at;
}
