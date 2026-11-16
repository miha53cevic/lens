import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { bundleViewer } from '../src/cli-app/render/web/bundle.ts';
import {
  fileSpans,
  contextSpans,
  declaredIn,
  hiddenCount,
  oldLineNumbers,
  oldStretch,
  pairRows,
  planCode,
  unitSpans,
  type CodeItem,
  type RemovedLine,
  type SplitItem,
} from '../src/viewer/rows.ts';
import { lineHtml, pairWordDiffs, splitAt, wordDiff } from '../src/viewer/wordDiff.ts';
import { railEntries } from '../src/viewer/model/steps.ts';
import type { FileFoldModel, RemovedBlock } from '../src/cli-app/model.ts';
import type { ViewUnit } from '../src/cli-app/summary/view.ts';

test("the viewer's browser code bundles into one script and one stylesheet, both safe to inline", async () => {
  const { script, css } = await bundleViewer();
  assert.ok(script.length > 1000, 'the bundle has the viewer in it');
  assert.doesNotMatch(script, /<\/script/i, 'nothing in it ends the inline <script> early');
  assert.doesNotMatch(script, /\bimport\s*\(|^import /m, 'no imports are left for the browser to resolve');
  assert.match(css, /--surface:/, 'the stylesheet has the design tokens');
  assert.doesNotMatch(css, /@import/, 'every stylesheet is bundled in');
  assert.doesNotMatch(css, /<\/style/i, 'nothing in it ends the inline <style> early');
});

test('a bundle made ahead of time is used as it is, instead of bundling again', async () => {
  const made = { script: 'made();', css: '.made{}' };
  assert.deepEqual(await bundleViewer(async () => made), made);
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
      case 'context':
        return item.side + (item.open ? '[' + show(item.body).join(',') + ']' : '');
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

// side by side: "6=5" an unchanged line (old=new), "-3|3" a removed line beside a changed one ("·" none)
function showSplit(items: SplitItem[]): string[] {
  return items.map((item) => {
    switch (item.kind) {
      case 'same':
        return item.old + '=' + item.line;
      case 'pair':
        return (item.removed ? '-' + item.removed.old : '·') + '|' + (item.line ?? '·');
      case 'gap':
        return 'gap:' + item.start + '-' + item.end;
      case 'break':
        return '⋯';
      case 'region':
        return 'R' + item.region.startLine + '-' + item.region.endLine + '[' + showSplit(item.body).join(',') + ']';
      case 'context':
        return item.side + '[' + showSplit(item.body).join(',') + ']';
    }
  });
}

// old: A B oa ob oc C D E oz F · new: A B na nb C D + E F (oa–oc replaced by two lines, a line added, oz removed)
const replaced: FileFoldModel = {
  file: 'src/b.ts',
  language: 'typescript',
  lineCount: 9,
  regions: [],
  changedLines: [3, 4, 7],
  removals: [
    { afterLine: 2, oldStart: 3, lines: ['oa', 'ob', 'oc'] },
    { afterLine: 8, oldStart: 9, lines: ['oz'] },
  ],
};

test('oldLineNumbers: an unchanged line is numbered past the lines removed and added above it', () => {
  assert.deepEqual(oldLineNumbers(replaced), [0, 1, 2, 0, 0, 6, 7, 0, 8, 10]);
});

test('pairRows: a removed run sits beside the changed lines after it, the longer run beside nothing', () => {
  const items = planCode(fileSpans(replaced, false, new Set()), [], removedAfter(replaced.removals!));
  const split = pairRows(items, new Set(replaced.changedLines), oldLineNumbers(replaced));
  assert.deepEqual(showSplit(split), [
    '1=1',
    '2=2',
    '-3|3',
    '-4|4',
    '-5|·',
    '6=5',
    '7=6',
    '·|7',
    '8=8',
    '-9|·',
    '10=9',
  ]);
});

test("pairRows: a fold's body is paired on its own; a run doesn't pair across the fold's edge", () => {
  const region = { startLine: 1, endLine: 3, category: 'import', score: 0, summary: '3 imports' };
  const items = planCode(fileSpans(replaced, false, new Set()), [region], removedAfter(replaced.removals!));
  const split = pairRows(items, new Set(replaced.changedLines), oldLineNumbers(replaced));
  assert.deepEqual(showSplit(split).slice(0, 2), ['R1-3[1=1,2=2,-3|3,-4|·,-5|·]', '·|4']);
});

test("pairRows: a fold knows the old lines it hides, and a gap its old-side numbers, for their rows' left halves", () => {
  const changed = new Set(file.changedLines);
  const unhidden = pairRows(
    planCode(fileSpans(file, false, new Set()), file.regions, removedAfter(file.removals!)),
    changed,
    oldLineNumbers(file),
  );
  // the import fold (2–4) holds old 2, 3 and 5, and the removed old 5
  const fold = unhidden.find((item) => item.kind === 'region');
  assert.deepEqual(fold?.kind === 'region' && fold.old, { start: 2, end: 5, removed: 1 });
  // hunks only: 14–20 is past one added line (10) and two removed ones (old 5 and 12), so old 15–21
  const hunks = pairRows(
    planCode(fileSpans(file, true, new Set()), file.regions, removedAfter(file.removals!)),
    changed,
    oldLineNumbers(file),
  );
  const gap = hunks.at(-1)!;
  assert.deepEqual(gap.kind === 'gap' && [gap.start, gap.end, gap.oldStart, gap.oldEnd], [14, 20, 15, 21]);
});

test('oldStretch: a fold of new lines only has no old side', () => {
  assert.equal(oldStretch([{ kind: 'pair', removed: null, line: 3 }]), null);
  assert.deepEqual(
    oldStretch([
      { kind: 'same', line: 4, old: 2 },
      { kind: 'pair', removed: { text: 'gone', old: 3 }, line: 5 },
    ]),
    { start: 2, end: 3, removed: 1 },
  );
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

  // whole, though 1–5 is far from the change and the removal: the Summary tab doesn't follow hunks only
  const spans = unitSpans(unit);
  assert.deepEqual(spans, [
    { start: 1, end: 5 },
    { start: 12, end: 15 },
  ]);
  assert.deepEqual(show(planCode(spans, file.regions, removedAt)), [
    ...['L1', 'R2-4[L2,L3,L4]', 'L5', '⋯', '-3', 'L12', 'L13', 'L14', 'L15'],
  ]);
});

test("contextSpans: the file above the unit's first line and below its last, whole", () => {
  const unit = {
    id: 'src/a.ts#f',
    ranges: [
      { start: 8, end: 9 },
      { start: 11, end: 12 },
    ],
    changedLines: [10],
    removals: [{ anchor: 10, afterLine: 10, oldStart: 12, lines: ['old b'] }],
    summary: null,
  } as unknown as ViewUnit;
  assert.deepEqual(contextSpans(unit, file), {
    above: { key: 'unit:src/a.ts#f:above', start: 1, end: 7, spans: [{ start: 1, end: 7 }] },
    below: { key: 'unit:src/a.ts#f:below', start: 13, end: 20, spans: [{ start: 13, end: 20 }] },
  });
  const atTop = contextSpans({ ...unit, ranges: [{ start: 1, end: 12 }] }, file)!;
  assert.deepEqual(atTop.above.spans, [], 'a unit on the first line has nothing above it');
  assert.equal(contextSpans({ ...unit, ranges: [] }, file), null, 'a deleted unit has no place');
});

test("declaredIn: a stretch's top-level names, in order, without a class's members", () => {
  const declared: FileFoldModel = {
    ...file,
    declarations: [
      { name: 'a', line: 2, kind: 'function' },
      { name: 'Box', line: 5, kind: 'class' },
      { name: 'open', line: 6, kind: 'method' },
      { name: 'b', line: 9, kind: 'variable' },
      { name: 'a', line: 12, kind: 'function' },
    ],
  };
  assert.deepEqual(declaredIn(declared, 1, 10), ['a', 'Box', 'b']);
  assert.deepEqual(declaredIn(declared, 10, 20), ['a']);
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

test("railEntries: a flow's cards to read on its steps, a done step's node where it falls in the flow", () => {
  const unit = (id: string) => ({ id });
  const flow = {
    title: 'Checkout',
    path: 'repo → service → route',
    units: { a: 'repo', b: 'service', c: 'service', d: 'route' },
  };
  const entries = (toRead: string[], read: string[]) =>
    railEntries({ flow, toRead: toRead.map(unit), read: read.map(unit) }).map((entry) =>
      entry.kind === 'unit' ? entry.unit.id : `[${entry.name}${entry.done ? ' ✓' : ''}]`,
    );
  assert.deepEqual(entries(['a', 'b', 'c', 'd'], []), ['[repo]', 'a', '[service]', 'b', 'c', '[route]', 'd']);
  assert.deepEqual(
    entries(['a', 'd'], ['b', 'c']),
    ['[repo]', 'a', '[service ✓]', '[route]', 'd'],
    'between the steps around it',
  );
  assert.deepEqual(entries(['d'], ['a', 'b', 'c']), ['[repo ✓]', '[service ✓]', '[route]', 'd']);
  assert.deepEqual(
    entries(['a'], ['b', 'c', 'd']),
    ['[repo]', 'a', '[service ✓]', '[route ✓]'],
    'and after the last card',
  );
  assert.deepEqual(entries(['b', 'c'], []), ['b', 'c'], 'one step present: no rail');
});
