// A small git repo with uncommitted changes, for the viewer page tests: a TS file with
// imports, a guard and logging to fold, a changed function, a removed one and a long
// unchanged tail (hunks only hides it), plus a changed test file, and an unchanged file that
// still calls the removed function (a caller the change breaks).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '../../src/cli-app/analyze.ts';
import { loadConfig } from '../../src/cli-app/config.ts';
import type { ViewerInput } from '../../src/cli-app/render/web/server.ts';
import { writeStored, type StoredSummary } from '../../src/cli-app/summary/store.ts';

export const OLD_ORDERS = `import { db } from "./db";
import { log } from "./log";
import type { Order } from "./types";

export async function findOrders(userId: string): Promise<Order[]> {
  if (!userId) {
    throw new Error("userId required");
  }
  const rows = await db.query("select * from orders where user = ?", [userId]);
  return rows.map(toOrder);
}

function toOrder(row: any): Order {
  return { id: row.id, total: row.total };
}

export function legacyTotal(rows: Order[]): number {
  return rows.reduce((n, r) => n + r.total, 0);
}

export function formatTotal(total: number): string {
  const whole = Math.floor(total);
  const cents = Math.round((total - whole) * 100);
  const padded = String(cents).padStart(2, "0");
  const grouped = String(whole).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
  const sign = total < 0 ? "-" : "";
  const result = sign + grouped + "." + padded;
  return result;
}
`;

export const NEW_ORDERS = OLD_ORDERS.replace(
  `  const rows = await db.query("select * from orders where user = ?", [userId]);`,
  `  log.info("finding orders", { userId });\n  const rows = await db.query("select * from orders where user = ? and deleted = 0", [userId]);`,
).replace(
  `export function legacyTotal(rows: Order[]): number {\n  return rows.reduce((n, r) => n + r.total, 0);\n}\n\n`,
  '',
);

const OLD_TEST = `import { formatTotal } from "./orders";

test("formats", () => {
  expect(formatTotal(1)).toBe("1.00");
});
`;
const NEW_TEST =
  OLD_TEST +
  `
test("negative", () => {
  expect(formatTotal(-1)).toBe("-1.00");
});
`;

const REPORT = `import { legacyTotal } from "./orders";

export const total = legacyTotal([]);
`;

/** The repo's root: the old files committed, the new ones in the working tree. */
export function makeViewerRepo(): string {
  // the real path: Windows' temp dir can come as a short 8.3 name, which git resolves differently
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'lens-viewer-')));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/orders.ts'), OLD_ORDERS);
  writeFileSync(join(dir, 'src/orders.test.ts'), OLD_TEST);
  writeFileSync(join(dir, 'src/report.ts'), REPORT);
  // the tests were written against these off: a clean tree fails to open instead of showing the Plan tab
  writeFileSync(join(dir, '.lens.json'), JSON.stringify({ planTab: false, timings: false }));
  git('add', '-A');
  git('-c', 'user.email=lens@test', '-c', 'user.name=lens', 'commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'src/orders.ts'), NEW_ORDERS);
  writeFileSync(join(dir, 'src/orders.test.ts'), NEW_TEST);
  return dir;
}

/** `lens diff` on the repo, with a summary of two of its units stored: what the viewer is opened on. */
export async function analyzeViewerRepo(repo: string): Promise<ViewerInput> {
  const input = await analyze('diff', [], repo, loadConfig(repo));
  const unit = (name: string) => input.summary!.units.find((candidate) => candidate.name === name)!;
  const findOrders = unit('findOrders'),
    legacy = unit('legacyTotal');
  const stored: StoredSummary = {
    version: 1,
    updatedAt: '',
    flows: [],
    units: {
      [findOrders.id]: {
        hash: findOrders.hash,
        anchor: findOrders.anchor,
        headline: 'findOrders skips deleted orders',
        gist: 'skips deleted orders',
        needsLook: true,
        changes: [{ when: 'an order is deleted', before: 'it was returned', now: "it's skipped", line: 'N10' }],
        breaks: [],
        concerns: [{ kind: 'bug', text: 'deleted is a string column', line: 'N10' }],
      },
      [legacy.id]: {
        hash: legacy.hash,
        anchor: legacy.anchor,
        headline: 'legacyTotal is gone',
        gist: 'removed',
        needsLook: false,
        changes: [],
        breaks: [{ summary: 'callers of legacyTotal no longer compile', callers: ['src/report.ts:3'] }],
        concerns: [{ kind: 'question', text: 'did anything still call it?', line: 'O17' }],
      },
    },
  };
  writeStored(repo, 'diff@main', stored);
  input.summary = input.latestSummary!();
  return input;
}
