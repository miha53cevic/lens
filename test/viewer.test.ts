import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleViewer } from '../src/render/web/bundle.ts';
import {
  fileSpans,
  hiddenCount,
  planCode,
  unitSpans,
  type CodeItem,
  type RemovedLine,
} from '../src/render/web/client/rows.ts';
import { lineHtml, pairWordDiffs, splitAt, wordDiff } from '../src/render/web/client/wordDiff.ts';
import type { FileFoldModel, RemovedBlock } from '../src/model.ts';
import type { ViewUnit } from '../src/summary/view.ts';

test("the viewer's browser code bundles into one script and one stylesheet, both safe to inline", async () => {
  const { script, css } = await bundleViewer();
  assert.ok(script.length > 1000, 'the bundle has the viewer in it');
  assert.doesNotMatch(script, /<\/script/i, 'nothing in it ends the inline <script> early');
  assert.doesNotMatch(script, /\bimport\s*\(|^import /m, 'no imports are left for the browser to resolve');
  assert.match(css, /--surface:/, 'the stylesheet has the design tokens');
  assert.doesNotMatch(css, /@import/, 'every stylesheet is bundled in');
  assert.doesNotMatch(css, /<\/style/i, 'nothing in it ends the inline <style> early');
});

// "L3" a line, "-5" a removed line (its old-side number), "R2-4[…]" a fold, "gap:14-20", "⋯" a break
function show(items: CodeItem[]): string[] {
  return items.map((item) => {
    switch (item.kind) {
      case 'line':
        return 'L' + item.line;
      case 'removed':
        return '-' + item.old;
      case 'gap':
        return 'gap:' + item.start + '-' + item.end;
      case 'break':
        return '⋯';
      case 'region':
        return 'R' + item.region.startLine + '-' + item.region.endLine + '[' + show(item.body).join(',') + ']';
    }
  });
}

const lines = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, offset) => 'L' + (from + offset));

const file: FileFoldModel = {
  file: 'src/a.ts',
  language: 'typescript',
  lineCount: 20,
  regions: [{ startLine: 2, endLine: 4, category: 'import', score: 0, summary: '3 imports' }],
  changedLines: [10],
  removals: [
    { afterLine: 3, oldStart: 5, lines: ['old a'] },
    { afterLine: 10, oldStart: 12, lines: ['old b'] },
  ],
};
const removedAfter =
  (blocks: RemovedBlock[]) =>
  (after: number): RemovedLine[] =>
    blocks
      .filter((block) => block.afterLine === after)
      .flatMap((block) => block.lines.map((text, offset) => ({ text, old: block.oldStart + offset })));

test('planCode: a fold keeps the removed lines inside it; removals after its last line follow it', () => {
  const items = planCode(fileSpans(file, false, new Set()), file.regions, removedAfter(file.removals!));
  assert.deepEqual(show(items), ['L1', 'R2-4[L2,L3,-5,L4]', ...lines(5, 10), '-12', ...lines(11, 20)]);
  assert.equal(hiddenCount(items), 0);
});

test('fileSpans: hunks only hides the unchanged stretch behind a gap until its key is expanded', () => {
  const spans = fileSpans(file, true, new Set());
  // the change at 10 (7–13) and the removal after 3 (1–6) touch: one window
  assert.deepEqual(spans, [
    { start: 1, end: 13 },
    { start: 14, end: 20, gap: 'src/a.ts:14' },
  ]);
  const items = planCode(spans, file.regions, removedAfter(file.removals!));
  assert.deepEqual(show(items).slice(-3), ['L12', 'L13', 'gap:14-20']);
  assert.equal(hiddenCount(items), 7);
  assert.deepEqual(fileSpans(file, true, new Set(['src/a.ts:14'])), [{ start: 1, end: 20 }]);
});

test('planCode: no lines to show still shows the removed lines (a deleted file or unit)', () => {
  const removed = [{ text: 'gone', old: 1 }];
  assert.deepEqual(show(planCode([], [], (after) => (after === 0 ? removed : []))), ['-1']);
});

test("unitSpans + planCode: a unit's ranges break with ⋯; removed lines anchored before a range open it", () => {
  const unit = {
    id: 'src/a.ts#f',
    ranges: [
      { start: 1, end: 5 },
      { start: 12, end: 15 },
    ],
    changedLines: [13],
    removals: [{ anchor: 11, afterLine: 11, oldStart: 3, lines: ['gone'] }],
    summary: null,
  } as unknown as ViewUnit;
  const removedAt = (after: number) =>
    unit.removals
      .filter((block) => block.anchor === after)
      .map((block) => ({ text: block.lines[0], old: block.oldStart }));

  const whole = planCode(unitSpans(unit, file.regions, false, new Set()), file.regions, removedAt);
  assert.deepEqual(show(whole), ['L1', 'R2-4[L2,L3,L4]', 'L5', '⋯', '-3', 'L12', 'L13', 'L14', 'L15']);

  // hunks only: 1–5 is far from the change and the removal, so it hides (the fold inside it too)
  const spans = unitSpans(unit, file.regions, true, new Set());
  assert.deepEqual(spans, [
    { start: 1, end: 5, gap: 'unit:src/a.ts#f:1' },
    { start: 12, end: 15 },
  ]);
  assert.deepEqual(show(planCode(spans, file.regions, removedAt)), ['gap:1-5', '⋯', '-3', 'L12', 'L13', 'L14', 'L15']);
});

// "[changed]" around each marked range
function marked(line: string, ranges: readonly (readonly [number, number])[]): string {
  return splitAt(line, 0, ranges)
    .map((part) => (part.marked ? '[' + part.text + ']' : part.text))
    .join('');
}

test('wordDiff: marks only the words a replaced line changed, on both sides', () => {
  const before = 'const ref = `refs/pull/${n}/head`;';
  const after = 'const ref = `refs/pull/${Number(n)}/head`;';
  const diff = wordDiff(before, after)!;
  assert.equal(marked(before, diff.before), before, 'nothing was removed from the old line');
  assert.equal(marked(after, diff.after), 'const ref = `refs/pull/${[Number(]n[)]}/head`;');

  const renamed = wordDiff('  return total + tax;', '  return subtotal + tax;')!;
  assert.equal(marked('  return total + tax;', renamed.before), '  return [total] + tax;');
  assert.equal(marked('  return subtotal + tax;', renamed.after), '  return [subtotal] + tax;');
});

test('wordDiff: words split only by spaces mark as one stretch; whitespace alone is never marked', () => {
  const diff = wordDiff('a = foo bar;', 'a = baz qux;')!;
  assert.equal(marked('a = baz qux;', diff.after), 'a = [baz qux];');
  const spaces = wordDiff('if (a)  return;', 'if (a) return;')!;
  assert.deepEqual(spaces.after, [], 'a changed indent or spacing marks nothing');
});

test('wordDiff: a rewrite is too different to mark', () => {
  assert.equal(wordDiff('return rows.map(toOrder);', 'log.info("finding orders", { userId });'), null);
});

test('pairWordDiffs: a removed line pairs with the first close-enough added line, past inserted ones', () => {
  const newLines = [
    'export async function findOrders(userId) {',
    '  log.info("finding orders", { userId });',
    '  const rows = await db.query("select * from orders where user = ? and deleted = 0", [userId]);',
    '  return rows;',
  ];
  const diffs = pairWordDiffs(
    [
      {
        afterLine: 1,
        oldStart: 2,
        lines: ['  const rows = await db.query("select * from orders where user = ?", [userId]);'],
      },
    ],
    [2, 3],
    newLines,
  );
  assert.deepEqual([...diffs.added.keys()], [3], 'the log line was inserted: the query pairs with line 3');
  assert.deepEqual([...diffs.removed.keys()], [], 'the old query only gained words: nothing on it to mark');
  assert.equal(
    marked(newLines[2], diffs.added.get(3)!),
    '  const rows = await db.query("select * from orders where user = ? [and deleted = 0]", [userId]);',
  );
});

test('lineHtml: marks cut across highlighted tokens, and the text stays escaped', () => {
  const html = lineHtml(
    [
      ['a <', '#f00'],
      ['b', null],
    ],
    [[2, 3]],
  );
  assert.equal(html, '<span style="color:#f00">a <span class="w-add">&lt;</span></span>b');
});
