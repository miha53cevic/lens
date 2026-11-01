import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RemovedBlock } from '../model.ts';
import { lensDir } from '../summary/store.ts';

// A review's rounds: each time the reader sends findings to their agent, lens keeps the text of the
// change's files and what was sent, in .lens/rounds/<review>.json. The next read is then of what
// changed since, measured against that text: not a git ref, so a rebase or a squash doesn't lose it.
// Only the latest round is measured against; earlier ones are kept for their count.

export const ROUNDS_DIR = '.lens/rounds';

/** How many rounds a review keeps the text of: an old round's text is only ever disk */
const KEPT_TEXTS = 1;

/** A finding or a note the reader sent, as the page posts it */
export interface SentFinding {
  /** The finding's key (signals.ts), or `note:<id>` */
  key: string;
  kind: string;
  text: string;
  /** The unit it's on; null for a note */
  unit: string | null;
  /** Repo-relative */
  file: string;
  /** New-side line (1-based) in the text kept with the round; null on a removed line */
  line: number | null;
}

export interface Round {
  /** ms since the epoch */
  at: number;
  /** Repo-relative path → its text when this round was sent; empty on a round whose text was let go */
  files: Record<string, string>;
  findings: SentFinding[];
}

interface StoredRounds {
  version: 1;
  rounds: Round[];
}

function roundsFile(root: string, review: string): string {
  return join(root, ROUNDS_DIR, review + '.json');
}

export function readRounds(root: string, review: string): Round[] {
  const path = roundsFile(root, review);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredRounds;
    return raw?.version === 1 && Array.isArray(raw.rounds) ? raw.rounds : [];
  } catch {
    return [];
  }
}

/**
 * A new round, or the last one again when nothing changed in between: copying twice is one send.
 * Older rounds let their text go.
 */
export function addRound(
  root: string,
  review: string,
  files: Record<string, string>,
  findings: SentFinding[],
): Round[] {
  const rounds = readRounds(root, review);
  const last = rounds[rounds.length - 1];
  const same = !!last && JSON.stringify(last.files) === JSON.stringify(files);
  const kept = same ? rounds.slice(0, -1) : rounds;
  const next = [...kept, { at: Date.now(), files, findings }].map((round, roundIndex, all) =>
    roundIndex < all.length - KEPT_TEXTS ? { ...round, files: {} } : round,
  );
  mkdirSync(join(lensDir(root), 'rounds'), { recursive: true });
  const stored: StoredRounds = { version: 1, rounds: next };
  writeFileSync(roundsFile(root, review), JSON.stringify(stored) + '\n');
  return next;
}

/** The findings last sent, as `lens summary prepare` lists them for the agent. */
export function sentForAgent(root: string, review: string): { key: string; text: string; place: string }[] {
  const last = readRounds(root, review).at(-1);
  return (last?.findings ?? []).map((finding) => ({
    key: finding.key,
    text: finding.text,
    place: `[${finding.kind}] ${finding.file}${finding.line === null ? '' : ':' + finding.line}`,
  }));
}

/** What changed in one file between two texts, in the diff's own terms. */
export interface FileDelta {
  /** New-side lines (1-based) */
  changedLines: number[];
  removals: RemovedBlock[];
  /** Lines (1-based) of the old text that this delta replaced or removed */
  oldLines: Set<number>;
}

/** The two texts' line diff, with git's own algorithm: a temp folder, not the repository, and nothing kept. */
export function fileDelta(before: string, after: string): FileDelta {
  const delta: FileDelta = { changedLines: [], removals: [], oldLines: new Set() };
  if (before === after) return delta;
  const dir = mkdtempSync(join(tmpdir(), 'lens-round-'));
  try {
    writeFileSync(join(dir, 'a'), before);
    writeFileSync(join(dir, 'b'), after);
    let patch = '';
    try {
      execFileSync('git', ['diff', '--no-index', '--no-color', '-U0', 'a', 'b'], {
        cwd: dir,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
    } catch (err) {
      // exit 1 is how --no-index says the files differ
      patch = (err as { stdout?: string }).stdout ?? '';
    }
    let oldLine = 0;
    let newLine = 0;
    let block: RemovedBlock | null = null;
    for (const line of patch.split('\n')) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (hunk) {
        // a side with no lines names the line before where it would be
        oldLine = Number(hunk[1]) + (hunk[2] === '0' ? 1 : 0);
        newLine = Number(hunk[3]) + (hunk[4] === '0' ? 1 : 0);
        block = null;
      } else if (oldLine === 0) {
        continue; // the patch's own header
      } else if (line.startsWith('-')) {
        if (!block) {
          block = { afterLine: newLine - 1, oldStart: oldLine, lines: [] };
          delta.removals.push(block);
        }
        block.lines.push(line.slice(1));
        delta.oldLines.add(oldLine++);
      } else if (line.startsWith('+')) {
        delta.changedLines.push(newLine++);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return delta;
}
