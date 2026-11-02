import { resolve } from 'node:path';
import { createRouter, type Router } from '../api/router.ts';
import { relPath } from '../paths.ts';
import type { ViewerInput } from '../render/web/server.ts';
import { addRound, type SentFinding } from './store.ts';

// The reader's rounds on the viewer server:
//   POST /api/rounds   findings handed to the agent: keep the code as it is now, and what was sent

/** Findings in one send: past that, it isn't a person's list */
const MAX_FINDINGS = 500;
/** A finding's key carries its text: a long one is still a key, a megabyte isn't */
const MAX_TEXT = 8000;

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT;

function parseFinding(raw: unknown): SentFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const { key, kind, text, unit, file, line, endLine } = raw as Record<string, unknown>;
  if (!isText(key) || !isText(kind) || !isText(text) || !isText(file)) return null;
  if (unit !== null && !isText(unit)) return null;
  if (line !== null && (!Number.isInteger(line) || (line as number) < 1)) return null;
  if (endLine !== undefined && (line === null || !Number.isInteger(endLine) || (endLine as number) < (line as number)))
    return null;
  return {
    key,
    kind,
    text,
    unit,
    file,
    line: line as number | null,
    ...(endLine !== undefined && { endLine: endLine as number }),
  };
}

export function parseRound(raw: unknown): { findings: SentFinding[] } | { error: string } {
  const list = (raw as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_FINDINGS) {
    return { error: `findings must list 1–${MAX_FINDINGS} findings` };
  }
  const findings = list.map(parseFinding);
  if (findings.some((finding) => finding === null))
    return { error: 'a finding needs its key, kind, text, file and line' };
  return { findings: findings as SentFinding[] };
}

export function createRoundRoutes(current: () => ViewerInput, changed: () => void): Router {
  return createRouter().json('POST /api/rounds', parseRound, ({ findings }) => {
    const input = current();
    const fromRoot = (file: string) => relPath(input.root, resolve(input.cwd, file));
    const files = Object.fromEntries(
      input.files.filter((file) => file.status !== 'deleted').map((file) => [fromRoot(file.file), file.source]),
    );
    addRound(
      input.root,
      input.review,
      files,
      findings.map((finding) => ({ ...finding, file: fromRoot(finding.file) })),
    );
    changed();
    return { round: input.latestSummary?.()?.round ?? null };
  });
}
