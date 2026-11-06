import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { LIMITS } from './bundle.ts';
import { checkCaller, isShownLine } from './fit.ts';
import { placedHash } from './units.ts';
import { assetName, CHANGE_MARKS, PREVIEW_MAX_BYTES, previewProblems } from './previews.ts';
import {
  HOUSEKEEPING,
  isHousekeeping,
  PREVIEWS_DIR,
  unitSetHash,
  type Break,
  type Bundle,
  type BundleUnit,
  type ChangeRow,
  type Concern,
  type ConcernKind,
  type Flow,
  type SelfCheck,
  type SequenceStep,
  type StepChange,
  type StoredPreview,
  type StoredSequence,
  type StoredSummary,
  type UnitSummary,
} from './store.ts';

// `lens summary submit`: every claim in the agent's result must point at real
// code — a changed/removed line of the unit, or a caller line that exists and
// mentions the unit. What doesn't is dropped with a reason the agent can act on.

export interface SubmitOutcome {
  stored: StoredSummary;
  accepted: string[];
  acceptedFlows: number;
  acceptedOverview: boolean;
  acceptedPreviews: number;
  acceptedSequences: number;
  /** Previews that look like parts of one screen, as advice the agent can act on (never enforced) */
  previewAdvice: string[];
  acceptedChecks: number;
  /** The accepted previews' files, by the asset name the stored previews give them: for writeAssets */
  assets: Map<string, string>;
  dropped: string[];
  coverage: Coverage;
}

/** How well the stored flows tell the diff — reported, never enforced. */
export interface Coverage {
  /** units of this bundle with a current summary */
  summarized: number;
  /** of those, how many sit in a flow (the ones lens files under Housekeeping count) */
  inFlows: number;
  /** summarized units in no flow, the flagged ones (a concern or a break) first */
  outside: string[];
  /** flows that look like part of a bigger story, as advice the agent can act on */
  advice: string[];
}

/** More stories than this, and some of them are probably one */
const MAX_STORIES = 6;
/** Fewer changes per story on average than this, and the stories are probably split up */
const MIN_STORY_SIZE = 3;

const CONCERN_KINDS: ConcernKind[] = ['bug', 'risk', 'question'];

/** A preview file the result names: in the bundle's previews/ folder */
const PREVIEW_FILE = new RegExp(`^${PREVIEWS_DIR}/[\\w.-]+\\.html$`);

/** The one shape check every submit needs: an object with a "units" object. */
export function hasUnits(result: unknown): result is {
  units: Record<string, unknown>;
  flows?: unknown;
  overview?: unknown;
  previews?: unknown;
  sequences?: unknown;
  checks?: unknown;
} {
  if (typeof result !== 'object' || result === null) return false;
  const units = (result as { units?: unknown }).units;
  return typeof units === 'object' && units !== null && !Array.isArray(units);
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
    : { version: 1, updatedAt: '', units: {}, flows: [] };
  const byId = new Map(bundle.units.map((u) => [u.id, u]));
  const fileCache = new Map<string, string[] | null>();

  if (!hasUnits(result)) {
    return {
      stored,
      accepted,
      acceptedFlows: 0,
      acceptedOverview: false,
      acceptedPreviews: 0,
      acceptedSequences: 0,
      acceptedChecks: 0,
      previewAdvice: [],
      assets: new Map(),
      dropped: ['result must be an object with a "units" object'],
      coverage: coverageOf(bundle, stored),
    };
  }
  const raw = result;

  for (const [id, entry] of Object.entries(raw.units)) {
    const unit = byId.get(id);
    if (!unit) {
      dropped.push(`${id}: unknown unit id (copy ids from the tasks file)`);
      continue;
    }
    const summary = checkUnit(id, unit, entry, byId, root, fileCache, dropped);
    if (!summary) continue;
    stored.units[id] = { ...summary, hash: unit.hash, anchor: unit.anchor };
    accepted.push(id);
  }

  let acceptedFlows = 0;
  if (raw.flows !== undefined) {
    if (!Array.isArray(raw.flows)) dropped.push('flows: must be an array');
    else {
      // a unit goes in one flow: the first that lists it keeps it
      const claimed = new Map<string, string>();
      const valid = raw.flows
        .map((f, i) => checkFlow(f, i, byId, claimed, dropped))
        .filter((f): f is Flow => f !== null);
      // written with every unit in view: the earlier flows (other code, other parts) go —
      // once per pass, so resubmitting a fix or an added flow keeps the rest, and only
      // for valid replacements, so a fully rejected submit can't leave none
      if (bundle.wholeDiff && stored.flowsPass !== bundle.createdAt && valid.length > 0) {
        stored.flows = [];
        stored.flowsPass = bundle.createdAt;
      }
      // the new flows take their units from the stored ones, which go once they hold too few
      const replaced = new Set(valid.map((f) => f.title));
      stored.flows = stored.flows
        .filter((existing) => !replaced.has(existing.title))
        .map((existing) => ({
          ...existing,
          units: Object.fromEntries(Object.entries(existing.units).filter(([id]) => !claimed.has(id))),
        }))
        .filter((existing) => Object.keys(existing.units).length >= minUnits(existing.title));
      stored.flows.push(...new Map(valid.map((f) => [f.title, f])).values()); // a title twice: the last one
      acceptedFlows = new Set(valid.map((f) => f.title)).size;
    }
  }
  let acceptedOverview = false;
  if (raw.overview !== undefined) {
    const entry = (raw.overview ?? {}) as { what?: unknown; title?: unknown };
    const what = paragraphs(entry.what, LIMITS.overview);
    if (!what) dropped.push(`overview: what ${describe(entry.what, LIMITS.overview)}`);
    else {
      const title = text(entry.title, LIMITS.overviewTitle);
      if (!title && entry.title !== undefined && entry.title !== null) {
        dropped.push(`overview: title ${describe(entry.title, LIMITS.overviewTitle)} — left out`);
      }
      stored.overview = { what, hash: unitSetHash(bundle.units), ...(title ? { title } : {}) };
      acceptedOverview = true;
    }
  }
  // previews and sequences: like flows, a whole-diff pass's first valid ones replace the stored ones,
  // and later submits replace by title
  const assets = new Map<string, string>();
  const dir = join(root, '.lens', 'summary', bundle.key);
  const previews = listOf(raw.previews, 'previews', dropped)
    .map((p, i) => checkPreview(p, i, byId, dir, assets, dropped))
    .filter((p): p is StoredPreview => p !== null);
  const sequences = listOf(raw.sequences, 'sequences', dropped)
    .map((q, i) => checkSequence(q, i, byId, dropped))
    .filter((q): q is StoredSequence => q !== null);
  if (bundle.wholeDiff && stored.drawingsPass !== bundle.createdAt && previews.length + sequences.length > 0) {
    stored.previews = [];
    stored.sequences = [];
    stored.drawingsPass = bundle.createdAt;
  }
  if (previews.length > 0) stored.previews = byTitle(stored.previews ?? [], previews);
  // a pass that asked for drawings, answered: none is an answer too, so the final pass isn't asked again
  if (bundle.wholeDiff && bundle.drawings) stored.drawn = unitSetHash(bundle.units);
  if (sequences.length > 0) stored.sequences = byTitle(stored.sequences ?? [], sequences);
  const acceptedChecks = keepChecks(listOf(raw.checks, 'checks', dropped), stored, byId, dropped);
  if (bundle.wholeDiff && bundle.checks) stored.checked = unitSetHash(bundle.units);
  stored.updatedAt = new Date().toISOString();
  return {
    stored,
    accepted,
    acceptedFlows,
    acceptedOverview,
    acceptedPreviews: new Set(previews.map((p) => p.title)).size,
    acceptedSequences: new Set(sequences.map((q) => q.title)).size,
    acceptedChecks,
    previewAdvice: previewAdvice(stored),
    assets,
    dropped,
    coverage: coverageOf(bundle, stored),
  };
}

/** The self-checks of this submit, in place of the stored ones. Returns how many were kept. */
function keepChecks(raw: unknown[], stored: StoredSummary, byId: Map<string, BundleUnit>, dropped: string[]): number {
  const titles = new Set(stored.flows.map((flow) => flow.title));
  const perFlow = new Map<string, number>();
  const checks: SelfCheck[] = [];
  raw.forEach((entry, i) => {
    const where = `checks[${i}]`;
    const check = (entry ?? {}) as Record<string, unknown>;
    const flow = typeof check.flow === 'string' ? check.flow.trim() : '';
    if (!titles.has(flow))
      return void dropped.push(`${where}: flow ${JSON.stringify(check.flow)} isn't one of the flows`);
    if ((perFlow.get(flow) ?? 0) >= LIMITS.checksPerFlow) {
      return void dropped.push(`${where}: "${flow}" has its ${LIMITS.checksPerFlow} already`);
    }
    const question = text(check.question, LIMITS.checkQuestion);
    if (!question) return void dropped.push(`${where}: question ${describe(check.question, LIMITS.checkQuestion)}`);
    const answer = text(check.answer, LIMITS.checkAnswer);
    if (!answer) return void dropped.push(`${where}: answer ${describe(check.answer, LIMITS.checkAnswer)}`);
    const unit = typeof check.unit === 'string' ? byId.get(check.unit) : undefined;
    if (!unit) return void dropped.push(`${where}: unknown unit ${JSON.stringify(check.unit)}`);
    const line = typeof check.line === 'string' ? check.line.trim().toUpperCase() : '';
    if (!isShownLine(unit, line))
      return void dropped.push(`${where}: line "${check.line}" is not a line of ${unit.id}`);
    perFlow.set(flow, (perFlow.get(flow) ?? 0) + 1);
    checks.push({ flow, question, answer, unit: unit.id, line, hash: placedHash(unit) });
  });
  if (checks.length > 0) stored.checks = checks;
  return checks.length;
}

/**
 * Previews of one component each, whose components tell the same story (flow): most likely one
 * screen drawn piece by piece. Advice only: two components can sit on two screens.
 */
function previewAdvice(stored: StoredSummary): string[] {
  const flowOf = new Map(
    stored.flows.flatMap((flow) => Object.keys(flow.units).map((id) => [id, flow.title] as const)),
  );
  const byFlow = new Map<string, string[]>();
  for (const preview of stored.previews ?? []) {
    const ids = Object.keys(preview.units);
    const flow = ids.length === 1 ? flowOf.get(ids[0]) : undefined;
    if (flow !== undefined) byFlow.set(flow, [...(byFlow.get(flow) ?? []), preview.title]);
  }
  return [...byFlow]
    .filter(([, titles]) => titles.length > 1)
    .map(
      ([flow, titles]) =>
        `${titles.map((t) => `"${t}"`).join(', ')} each show one unit of "${flow}": if they're on one screen, ` +
        `draw it once with all their units and drop the others`,
    );
}

/** The stored entries with these in their place: one of the same title is replaced, a title twice is the last one. */
function byTitle<T extends { title: string }>(stored: T[], added: T[]): T[] {
  const titles = new Set(added.map((entry) => entry.title));
  return [
    ...stored.filter((entry) => !titles.has(entry.title)),
    ...new Map(added.map((entry) => [entry.title, entry])).values(),
  ];
}

/** An optional list field of the result: absent is none, anything but an array is reported. */
function listOf(value: unknown, field: string, dropped: string[]): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  dropped.push(`${field}: must be an array`);
  return [];
}

/** unit ids → their placed hashes when this was drawn (a moved unit's lines are elsewhere); null (reported) when one isn't a unit of the diff */
function hashesOf(
  ids: unknown,
  byId: Map<string, BundleUnit>,
  where: string,
  dropped: string[],
): Record<string, string> | null {
  if (!Array.isArray(ids) || ids.length === 0) {
    dropped.push(`${where}: units must list the unit ids it shows`);
    return null;
  }
  const out: Record<string, string> = {};
  for (const id of ids) {
    const unit = typeof id === 'string' ? byId.get(id) : undefined;
    if (!unit) {
      dropped.push(`${where}: unknown unit ${JSON.stringify(id)} (copy ids from the tasks file)`);
      return null;
    }
    out[unit.id] = placedHash(unit);
  }
  return out;
}

function checkPreview(
  p: unknown,
  i: number,
  byId: Map<string, BundleUnit>,
  dir: string,
  assets: Map<string, string>,
  dropped: string[],
): StoredPreview | null {
  const r = (p ?? {}) as Record<string, unknown>;
  const title = text(r.title, LIMITS.previewTitle);
  const where = `previews[${i}]${title ? ` "${title}"` : ''}`;
  if (!title) {
    dropped.push(`${where}: title ${describe(r.title, LIMITS.previewTitle)}`);
    return null;
  }
  const units = hashesOf(r.units, byId, where, dropped);
  if (!units) return null;
  const file = (field: 'now' | 'before'): string | null | undefined => {
    const value = r[field];
    if (field === 'before' && (value === undefined || value === null)) return undefined;
    if (typeof value !== 'string' || !PREVIEW_FILE.test(value)) {
      dropped.push(
        `${where}: ${field} must be a file in the bundle's ${PREVIEWS_DIR}/ folder, like "${PREVIEWS_DIR}/checkout.html"`,
      );
      return null;
    }
    const path = join(dir, value);
    if (!existsSync(path) || !statSync(path).isFile()) {
      dropped.push(`${where}: ${field} "${value}" not found`);
      return null;
    }
    if (statSync(path).size > PREVIEW_MAX_BYTES) {
      dropped.push(`${where}: ${field} "${value}" is over ${PREVIEW_MAX_BYTES / 1000} KB — keep only the CSS it uses`);
      return null;
    }
    const html = readFileSync(path, 'utf8');
    const problems = previewProblems(html, new Set(Object.keys(units)));
    if (problems.length > 0) {
      dropped.push(`${where}: ${field} "${value}" ${problems.join('; ')}`);
      return null;
    }
    const name = assetName(html);
    assets.set(name, html);
    return name;
  };
  const now = file('now');
  const before = file('before');
  if (!now || before === null) return null;
  return { title, units, now, ...(before ? { before } : {}) };
}

function checkSequence(q: unknown, i: number, byId: Map<string, BundleUnit>, dropped: string[]): StoredSequence | null {
  const r = (q ?? {}) as Record<string, unknown>;
  const title = text(r.title, LIMITS.previewTitle);
  const where = `sequences[${i}]${title ? ` "${title}"` : ''}`;
  if (!title) {
    dropped.push(`${where}: title ${describe(r.title, LIMITS.previewTitle)}`);
    return null;
  }
  const lanes = Array.isArray(r.lanes) ? r.lanes.map((lane) => text(lane, LIMITS.lane)) : [];
  if (
    lanes.length < 2 ||
    lanes.length > LIMITS.lanes ||
    lanes.some((lane) => lane === null) ||
    new Set(lanes).size !== lanes.length
  ) {
    dropped.push(`${where}: lanes must be 2–${LIMITS.lanes} different names of ≤${LIMITS.lane} chars`);
    return null;
  }
  const laneSet = new Set(lanes as string[]);
  const rawSteps = Array.isArray(r.steps) ? r.steps : [];
  if (rawSteps.length === 0 || rawSteps.length > LIMITS.steps) {
    dropped.push(`${where}: steps must hold 1–${LIMITS.steps} steps`);
    return null;
  }
  const steps: SequenceStep[] = [];
  const units: Record<string, string> = {};
  for (const [stepIndex, rawStep] of rawSteps.entries()) {
    const at = `${where} steps[${stepIndex}]`;
    const s = (rawStep ?? {}) as Record<string, unknown>;
    const from = typeof s.from === 'string' ? s.from.trim() : '';
    const to = typeof s.to === 'string' ? s.to.trim() : '';
    if (!laneSet.has(from) || !laneSet.has(to)) {
      dropped.push(`${at}: from and to must be lanes of the sequence — diagram dropped`);
      return null;
    }
    const label = text(s.label, LIMITS.stepLabel);
    if (!label) {
      dropped.push(`${at}: label ${describe(s.label, LIMITS.stepLabel)} — diagram dropped`);
      return null;
    }
    const step: SequenceStep = { from, to, label };
    if (s.change !== undefined && s.change !== null) {
      if (!(CHANGE_MARKS as readonly unknown[]).includes(s.change)) {
        dropped.push(`${at}: change must be one of ${CHANGE_MARKS.join(', ')} — diagram dropped`);
        return null;
      }
      step.change = s.change as StepChange;
    }
    if (s.was !== undefined && s.was !== null) {
      const was = text(s.was, LIMITS.stepLabel);
      if (step.change !== 'changed' || !was) {
        dropped.push(`${at}: was is what a changed step said before (≤${LIMITS.stepLabel}) — diagram dropped`);
        return null;
      }
      step.was = was;
    }
    if (s.unit !== undefined && s.unit !== null) {
      const unit = typeof s.unit === 'string' ? byId.get(s.unit) : undefined;
      if (!unit) {
        dropped.push(`${at}: unknown unit ${JSON.stringify(s.unit)} — diagram dropped`);
        return null;
      }
      const line = typeof s.line === 'string' ? s.line.trim().toUpperCase() : '';
      if (!isShownLine(unit, line)) {
        dropped.push(
          `${at}: line "${s.line}" is not a line of ${unit.id} (N… for a shown line, O… for a removed one) — diagram dropped`,
        );
        return null;
      }
      step.unit = unit.id;
      step.line = line;
      units[unit.id] = placedHash(unit);
    } else if (step.change) {
      dropped.push(`${at}: a ${step.change} step needs the unit and line that make it — diagram dropped`);
      return null;
    }
    steps.push(step);
  }
  if (!steps.some((step) => step.change)) {
    dropped.push(`${where}: no step is added, changed or removed — a sequence shows what the diff changes`);
    return null;
  }
  return { title, lanes: lanes as string[], steps, units };
}

function coverageOf(bundle: Bundle, stored: StoredSummary): Coverage {
  const flowed = new Set(stored.flows.flatMap((f) => Object.keys(f.units)));
  const current = bundle.units.filter((u) => stored.units[u.id]?.hash === u.hash);
  const covered = (u: BundleUnit) => flowed.has(u.id) || isHousekeeping(u);
  const outside = current.filter((u) => !covered(u));
  const flagged = (u: BundleUnit) => stored.units[u.id].needsLook;
  return {
    summarized: current.length,
    inFlows: current.length - outside.length,
    outside: [...outside.filter(flagged), ...outside.filter((u) => !flagged(u))].map((u) => u.id),
    advice: flowAdvice(bundle, stored.flows),
  };
}

/** Flows that look like parts of one story: a flow inside one file, or more and smaller stories than a diff tells. */
function flowAdvice(bundle: Bundle, flows: Flow[]): string[] {
  const fileOf = new Map(bundle.units.map((u) => [u.id, u.file]));
  const stories = flows.filter((f) => f.title !== HOUSEKEEPING);
  const advice: string[] = [];
  if (new Set(bundle.units.map((u) => u.file)).size > 1) {
    for (const flow of stories) {
      const files = new Set(Object.keys(flow.units).map((id) => fileOf.get(id)));
      if (files.size === 1) {
        advice.push(
          `"${flow.title}" is all ${[...files][0]}: a flow of one file's functions is usually part of a bigger story — fold it into the one that needs it`,
        );
      }
    }
  }
  const storyUnits = stories.reduce((n, f) => n + Object.keys(f.units).length, 0);
  if (stories.length > MAX_STORIES) {
    advice.push(
      `${stories.length} stories is a lot: most diffs tell 1–5 — merge the ones a reviewer would read together`,
    );
  } else if (stories.length > 2 && storyUnits < MIN_STORY_SIZE * stories.length) {
    advice.push(
      `${stories.length} stories hold ${storyUnits} units between them: they're probably parts of fewer stories — merge them`,
    );
  }
  return advice;
}

/** A story needs 2+ units; Housekeeping may hold one */
function minUnits(title: string): number {
  return title === HOUSEKEEPING ? 1 : 2;
}

/** Like text(), but keeps blank-line paragraph breaks. */
function paragraphs(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
  return t.length > 0 && t.length <= max ? t : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t.length > 0 && t.length <= max ? t : null;
}

function describe(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') return 'missing';
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
  if (typeof entry !== 'object' || entry === null) {
    dropped.push(`${id}: entry must be an object`);
    return null;
  }
  const e = entry as Record<string, unknown>;
  const headline = text(e.headline, LIMITS.headline);
  const gist = text(e.gist, LIMITS.gist);
  if (!headline) {
    dropped.push(`${id}: headline ${describe(e.headline, LIMITS.headline)} — unit dropped`);
    return null;
  }
  if (!gist) {
    dropped.push(`${id}: gist ${describe(e.gist, LIMITS.gist)} — unit dropped`);
    return null;
  }

  /** A list field: absent is empty; anything but an array is reported, not silently emptied. */
  const list = (field: 'changes' | 'breaks' | 'concerns'): unknown[] => {
    const v = e[field];
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v;
    dropped.push(`${id}: ${field} must be an array — none kept`);
    return [];
  };

  const labels = new Set(unit.labels);
  const changes: ChangeRow[] = [];
  list('changes').forEach((row: unknown, i: number) => {
    const where = `${id} changes[${i}]`;
    const r = (row ?? {}) as Record<string, unknown>;
    const when = text(r.when, LIMITS.cell);
    const now = text(r.now, LIMITS.cell);
    const before = r.before === null || r.before === undefined || r.before === '' ? null : text(r.before, LIMITS.cell);
    if (!when || !now) {
      dropped.push(`${where}: when/now must be 1–${LIMITS.cell} chars`);
      return;
    }
    if (before === null && r.before !== null && r.before !== undefined && r.before !== '') {
      dropped.push(`${where}: before ${describe(r.before, LIMITS.cell)}`);
      return;
    }
    const line = typeof r.line === 'string' ? r.line.trim().toUpperCase() : '';
    if (!labels.has(line)) {
      const sample = unit.labels.slice(0, 12).join(', ') + (unit.labels.length > 12 ? ', …' : '');
      dropped.push(`${where}: line "${r.line}" is not a changed or removed line of this unit (citeable: ${sample})`);
      return;
    }
    changes.push({ when, before, now, line });
  });

  const breaks: Break[] = [];
  list('breaks').forEach((b: unknown, i: number) => {
    const where = `${id} breaks[${i}]`;
    const br = (b ?? {}) as Record<string, unknown>;
    const summary = text(br.summary, LIMITS.breakSummary);
    if (!summary) {
      dropped.push(`${where}: summary ${describe(br.summary, LIMITS.breakSummary)}`);
      return;
    }
    const callers: string[] = [];
    for (const c of Array.isArray(br.callers) ? br.callers : []) {
      const problem = checkCaller(c, unit, root, fileCache);
      if (problem) dropped.push(`${where}: caller ${JSON.stringify(c)} ${problem}`);
      else callers.push(normalizeCaller(c as string));
    }
    if (callers.length === 0) {
      dropped.push(`${where}: no valid callers left — break dropped`);
      return;
    }
    breaks.push({ summary, callers });
  });

  const concerns: Concern[] = [];
  list('concerns').forEach((c: unknown, i: number) => {
    const where = `${id} concerns[${i}]`;
    const r = (c ?? {}) as Record<string, unknown>;
    const kind = typeof r.kind === 'string' ? (r.kind.trim().toLowerCase() as ConcernKind) : null;
    if (!kind || !CONCERN_KINDS.includes(kind)) {
      dropped.push(`${where}: kind must be one of ${CONCERN_KINDS.join(', ')}`);
      return;
    }
    const t = text(r.text, LIMITS.concern);
    if (!t) {
      dropped.push(`${where}: text ${describe(r.text, LIMITS.concern)}`);
      return;
    }
    const line = typeof r.line === 'string' ? r.line.trim().toUpperCase() : '';
    if (!isShownLine(unit, line)) {
      dropped.push(`${where}: line "${r.line}" is not a line of this unit (N… for a shown line, O… for a removed one)`);
      return;
    }
    concerns.push({ kind, text: t, line });
  });

  // not the agent's call: a unit needs a look exactly when there's a reason on record
  const needsLook = concerns.length > 0 || breaks.length > 0;
  const out: UnitSummary = { headline, gist, needsLook, changes, breaks, concerns };
  if (e.renamedFrom !== undefined) {
    const from = typeof e.renamedFrom === 'string' ? byId.get(e.renamedFrom) : undefined;
    if (!from || from.status !== 'deleted') dropped.push(`${id}: renamedFrom must be the id of a deleted unit`);
    else if (unit.status !== 'new') dropped.push(`${id}: renamedFrom is only for new units`);
    else out.renamedFrom = from.id;
  }
  return out;
}

function normalizeCaller(raw: string): string {
  const c = raw.trim();
  const at = c.lastIndexOf(':');
  return normalize(c.slice(0, at)).split(sep).join('/') + ':' + Number(c.slice(at + 1));
}

function checkFlow(
  f: unknown,
  i: number,
  byId: Map<string, BundleUnit>,
  claimed: Map<string, string>,
  dropped: string[],
): Flow | null {
  const where = `flows[${i}]`;
  const r = (f ?? {}) as Record<string, unknown>;
  const title = text(r.title, LIMITS.flowTitle);
  // Housekeeping has no steps to walk
  const path = text(r.path, LIMITS.flowPath) ?? (title === HOUSEKEEPING && !r.path ? '' : null);
  if (!title || path === null) {
    // name each bad field and by how much, and what went with it: its units now read as in no flow
    const problems = [
      ...(title ? [] : [`title ${describe(r.title, LIMITS.flowTitle)}`]),
      ...(path === null ? [`path ${describe(r.path, LIMITS.flowPath)}`] : []),
    ];
    const named = typeof r.title === 'string' && r.title.trim() !== '' ? ` ${JSON.stringify(r.title.trim())}` : '';
    const held = typeof r.units === 'object' && r.units !== null ? Object.keys(r.units).length : 0;
    dropped.push(`${where}${named}: ${problems.join(', ')} — dropped with its ${held} unit${held === 1 ? '' : 's'}`);
    return null;
  }
  const units: Record<string, string> = {};
  for (const [id, layer] of Object.entries(typeof r.units === 'object' && r.units !== null ? r.units : {})) {
    if (!byId.has(id)) {
      dropped.push(`${where}: unknown unit ${id}`);
      continue;
    }
    const owner = claimed.get(id);
    if (owner !== undefined && owner !== title) {
      dropped.push(`${where} "${title}": ${id} is already in "${owner}" — a unit goes in one flow, left out here`);
      continue;
    }
    const label = text(layer, LIMITS.layer);
    if (label === null && typeof layer === 'string' && layer.trim() !== '') {
      dropped.push(`${where}: layer for ${id} ${describe(layer, LIMITS.layer)} — left blank`);
    }
    units[id] = label ?? '';
  }
  if (Object.keys(units).length < minUnits(title)) {
    dropped.push(`${where} "${title}": a flow needs 2+ known units — dropped`);
    return null;
  }
  for (const id of Object.keys(units)) claimed.set(id, title);
  const flow: Flow = { title, path, units };
  if (r.priority !== undefined) {
    if (r.priority === 1 || r.priority === 2 || r.priority === 3) flow.priority = r.priority;
    else dropped.push(`${where} "${title}": priority must be 1, 2 or 3 — left unset`);
  }
  if (r.why !== undefined) {
    const why = text(r.why, LIMITS.why);
    if (why) flow.why = why;
    else dropped.push(`${where} "${title}": why ${describe(r.why, LIMITS.why)} — left out`);
  }
  return flow;
}
