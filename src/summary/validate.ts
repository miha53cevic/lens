import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import { LIMITS } from "./bundle.ts";
import { unitSetHash, type Break, type Bundle, type BundleUnit, type ChangeRow, type Flow, type StoredSummary, type UnitSummary } from "./store.ts";

// `lens summary submit`: every claim in the agent's result must point at real
// code — a changed/removed line of the unit, or a caller line that exists and
// mentions the unit. What doesn't is dropped with a reason the agent can act on.

export interface SubmitOutcome {
  stored: StoredSummary;
  accepted: string[];
  acceptedFlows: number;
  acceptedOverview: boolean;
  dropped: string[];
}

/** Names that can't be checked against a caller line (call statements, leftovers, default exports). */
function callerName(unit: BundleUnit): string | null {
  if (["call", "statement", "module", "file"].includes(unit.kind) || unit.name === "default") return null;
  const bare = unit.name.split(".").pop() ?? unit.name;
  return /^[\w$#]+$/.test(bare) ? bare.replace(/^#/, "") : null;
}

export function validateResult(
  bundle: Bundle,
  result: unknown,
  root: string,
  previous: StoredSummary | null,
): SubmitOutcome {
  const dropped: string[] = [];
  const accepted: string[] = [];
  const stored: StoredSummary = previous
    ? { ...previous, units: { ...previous.units }, flows: [...previous.flows] }
    : { version: 1, updatedAt: "", units: {}, flows: [] };
  const byId = new Map(bundle.units.map((u) => [u.id, u]));
  const fileCache = new Map<string, string[] | null>();

  if (typeof result !== "object" || result === null || typeof (result as { units?: unknown }).units !== "object") {
    return { stored, accepted, acceptedFlows: 0, acceptedOverview: false, dropped: ['result must be an object with a "units" object'] };
  }
  const raw = result as { units: Record<string, unknown>; flows?: unknown; overview?: unknown };

  for (const [id, entry] of Object.entries(raw.units ?? {})) {
    const unit = byId.get(id);
    if (!unit) { dropped.push(`${id}: unknown unit id (copy ids from the tasks file)`); continue; }
    const summary = checkUnit(id, unit, entry, byId, root, fileCache, dropped);
    if (!summary) continue;
    stored.units[id] = { ...summary, hash: unit.hash };
    accepted.push(id);
  }

  let acceptedFlows = 0;
  if (raw.flows !== undefined) {
    if (!Array.isArray(raw.flows)) dropped.push("flows: must be an array");
    else raw.flows.forEach((f, i) => {
      const flow = checkFlow(f, i, byId, dropped);
      if (!flow) return;
      stored.flows = stored.flows.filter((existing) => existing.title !== flow.title);
      stored.flows.push(flow);
      acceptedFlows++;
    });
  }
  let acceptedOverview = false;
  if (raw.overview !== undefined) {
    const what = paragraphs((raw.overview as { what?: unknown } | null)?.what, LIMITS.overview);
    if (!what) dropped.push(`overview: what ${describe((raw.overview as { what?: unknown } | null)?.what, LIMITS.overview)}`);
    else {
      stored.overview = { what, hash: unitSetHash(bundle.units) };
      acceptedOverview = true;
    }
  }
  stored.updatedAt = new Date().toISOString();
  return { stored, accepted, acceptedFlows, acceptedOverview, dropped };
}

/** Like text(), but keeps blank-line paragraph breaks. */
function paragraphs(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
  return t.length > 0 && t.length <= max ? t : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= max ? t : null;
}

function describe(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim() === "") return "missing";
  return `${value.trim().length} chars, max ${max}`;
}

function checkUnit(
  id: string,
  unit: BundleUnit,
  entry: unknown,
  byId: Map<string, BundleUnit>,
  root: string,
  fileCache: Map<string, string[] | null>,
  dropped: string[],
): UnitSummary | null {
  if (typeof entry !== "object" || entry === null) { dropped.push(`${id}: entry must be an object`); return null; }
  const e = entry as Record<string, unknown>;
  const headline = text(e.headline, LIMITS.headline);
  const gist = text(e.gist, LIMITS.gist);
  if (!headline) { dropped.push(`${id}: headline ${describe(e.headline, LIMITS.headline)} — unit dropped`); return null; }
  if (!gist) { dropped.push(`${id}: gist ${describe(e.gist, LIMITS.gist)} — unit dropped`); return null; }

  const labels = new Set(unit.labels);
  const changes: ChangeRow[] = [];
  (Array.isArray(e.changes) ? e.changes : []).forEach((row: unknown, i: number) => {
    const where = `${id} changes[${i}]`;
    const r = (row ?? {}) as Record<string, unknown>;
    const when = text(r.when, LIMITS.cell);
    const now = text(r.now, LIMITS.cell);
    const before = r.before === null || r.before === undefined || r.before === "" ? null : text(r.before, LIMITS.cell);
    if (!when || !now) { dropped.push(`${where}: when/now must be 1–${LIMITS.cell} chars`); return; }
    if (before === null && r.before !== null && r.before !== undefined && r.before !== "") {
      dropped.push(`${where}: before ${describe(r.before, LIMITS.cell)}`); return;
    }
    const line = typeof r.line === "string" ? r.line.trim().toUpperCase() : "";
    if (!labels.has(line)) {
      const sample = unit.labels.slice(0, 12).join(", ") + (unit.labels.length > 12 ? ", …" : "");
      dropped.push(`${where}: line "${r.line}" is not a changed or removed line of this unit (citeable: ${sample})`);
      return;
    }
    changes.push({ when, before, now, line });
  });

  const breaks: Break[] = [];
  (Array.isArray(e.breaks) ? e.breaks : []).forEach((b: unknown, i: number) => {
    const where = `${id} breaks[${i}]`;
    const br = (b ?? {}) as Record<string, unknown>;
    const summary = text(br.summary, LIMITS.breakSummary);
    if (!summary) { dropped.push(`${where}: summary ${describe(br.summary, LIMITS.breakSummary)}`); return; }
    const callers: string[] = [];
    for (const c of Array.isArray(br.callers) ? br.callers : []) {
      const problem = checkCaller(c, unit, root, fileCache);
      if (problem) dropped.push(`${where}: caller ${JSON.stringify(c)} ${problem}`);
      else callers.push(normalizeCaller(c as string));
    }
    if (callers.length === 0) { dropped.push(`${where}: no valid callers left — break dropped`); return; }
    breaks.push({ summary, callers });
  });

  const out: UnitSummary = { headline, gist, needsLook: e.needsLook === true, changes, breaks };
  if (e.renamedFrom !== undefined) {
    const from = typeof e.renamedFrom === "string" ? byId.get(e.renamedFrom) : undefined;
    if (!from || from.status !== "deleted") dropped.push(`${id}: renamedFrom must be the id of a deleted unit`);
    else if (unit.status !== "new") dropped.push(`${id}: renamedFrom is only for new units`);
    else out.renamedFrom = from.id;
  }
  return out;
}

function normalizeCaller(raw: string): string {
  const c = raw.trim();
  const at = c.lastIndexOf(":");
  return normalize(c.slice(0, at)).split(sep).join("/") + ":" + Number(c.slice(at + 1));
}

/** null when the caller reference is valid, else why not. */
function checkCaller(c: unknown, unit: BundleUnit, root: string, fileCache: Map<string, string[] | null>): string | null {
  if (typeof c !== "string") return "must be a \"path:line\" string";
  const m = /^(.+):(\d+)$/.exec(c.trim());
  if (!m) return "must look like \"path/to/file.ts:31\"";
  const rel = normalize(m[1]);
  if (isAbsolute(rel) || rel.startsWith("..")) return "must be a path relative to the repository root";
  let lines = fileCache.get(rel);
  if (lines === undefined) {
    const abs = join(root, rel);
    lines = existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, "utf8").split("\n") : null;
    fileCache.set(rel, lines);
  }
  if (!lines) return "— file not found";
  const lineNo = Number(m[2]);
  const line = lines[lineNo - 1];
  if (line === undefined || lineNo < 1) return `— the file has only ${lines.length} lines`;
  const name = callerName(unit);
  if (name && !new RegExp(`(^|[^\\w$])${name.replace(/[$]/g, "\\$")}([^\\w$]|$)`).test(line)) {
    return `— that line doesn't mention ${name}`;
  }
  return null;
}

function checkFlow(f: unknown, i: number, byId: Map<string, BundleUnit>, dropped: string[]): Flow | null {
  const where = `flows[${i}]`;
  const r = (f ?? {}) as Record<string, unknown>;
  const title = text(r.title, LIMITS.flowTitle);
  const path = text(r.path, LIMITS.flowPath);
  if (!title || !path) { dropped.push(`${where}: title (≤${LIMITS.flowTitle}) and path (≤${LIMITS.flowPath}) required`); return null; }
  const units: Record<string, string> = {};
  for (const [id, layer] of Object.entries(typeof r.units === "object" && r.units !== null ? r.units : {})) {
    if (!byId.has(id)) { dropped.push(`${where}: unknown unit ${id}`); continue; }
    const label = text(layer, LIMITS.layer);
    if (label === null && typeof layer === "string" && layer.trim() !== "") {
      dropped.push(`${where}: layer for ${id} ${describe(layer, LIMITS.layer)} — left blank`);
    }
    units[id] = label ?? "";
  }
  if (Object.keys(units).length < 2) { dropped.push(`${where} "${title}": a flow needs 2+ known units — dropped`); return null; }
  return { title, path, units };
}
