// What the app's pages may send the main process: each call's arguments are checked by its parser
// (src/desktop/shared/ipc.ts) before its handler runs (src/desktop/main/ipc.ts).

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { dispatch, type Handlers } from '../src/desktop/main/ipc.ts';
import type { StripApi } from '../src/desktop/shared/api.ts';
import { LAUNCHER_ARGS, MENU_ARGS, STRIP_ARGS, STRIP_CALLS } from '../src/desktop/shared/ipc.ts';

test('each parser takes its own arguments and drops anything else', () => {
  assert.deepEqual(STRIP_ARGS.select([3]), [3]);
  assert.equal(STRIP_ARGS.select(['3']), null, 'an id is a number');
  assert.equal(STRIP_ARGS.select([1.5]), null, 'a whole one');
  assert.deepEqual(STRIP_ARGS.themeMenu([120, 40]), [120, 40]);
  assert.equal(STRIP_ARGS.themeMenu([120]), null);
  assert.equal(STRIP_ARGS.themeMenu([Infinity, 40]), null);
  assert.deepEqual(STRIP_ARGS.chrome(['#101010', '#FFFFFF']), ['#101010', '#FFFFFF']);
  assert.equal(STRIP_ARGS.chrome(['red', '#ffffff']), null, 'a color is six hex digits');
  assert.equal(STRIP_ARGS.chrome(['#101010; x', '#ffffff']), null);

  assert.deepEqual(LAUNCHER_ARGS.openRecent(['/repo']), ['/repo']);
  assert.equal(LAUNCHER_ARGS.openRecent([{ root: '/repo' }]), null);
  assert.deepEqual(LAUNCHER_ARGS.openWorktree(['/repo-feature']), ['/repo-feature']);
  assert.equal(LAUNCHER_ARGS.openWorktree([['/repo-feature']]), null);
  assert.deepEqual(LAUNCHER_ARGS.setCommitCount([40]), [40]);
  assert.equal(LAUNCHER_ARGS.setCommitCount([41]), null, 'only the counts the picker offers');
  assert.equal(LAUNCHER_ARGS.setCommitCount(['40']), null);
  assert.deepEqual(
    LAUNCHER_ARGS.applyUpdate(['https://example.com/other.zip']),
    [],
    "what's downloaded is never a page's",
  );
  assert.deepEqual(LAUNCHER_ARGS.install(['skills']), ['skills']);
  assert.equal(LAUNCHER_ARGS.install(['everything']), null);
  assert.deepEqual(LAUNCHER_ARGS.open([{ kind: 'diff', range: 'staged', extra: 1 }]), [
    { kind: 'diff', range: 'staged' },
  ]);
  assert.equal(LAUNCHER_ARGS.open([{ kind: 'diff', range: 'everything' }]), null, 'a review is what parseChoice takes');
  assert.equal(LAUNCHER_ARGS.open(['diff']), null);

  assert.deepEqual(MENU_ARGS.pick(['vesper']), ['vesper']);
  assert.equal(MENU_ARGS.pick([42]), null);
});

test('a call runs only once its parser took it, with what the parser gave', async () => {
  const ran: unknown[][] = [];
  const handlers: Handlers<StripApi> = Object.fromEntries(
    STRIP_CALLS.map((call) => [call, (...args: unknown[]) => void ran.push([call, ...args])]),
  ) as unknown as Handlers<StripApi>;

  assert.equal(await dispatch(STRIP_ARGS, handlers, 'select', [2]), true);
  assert.equal(await dispatch(STRIP_ARGS, handlers, 'select', ['two']), false);
  assert.equal(await dispatch(STRIP_ARGS, handlers, 'chrome', ['#000000', '#ffffff', 'extra']), true);
  assert.equal(await dispatch(STRIP_ARGS, handlers, 'quit', []), false, 'no such call');
  assert.equal(await dispatch(STRIP_ARGS, handlers, 'toString', []), false, "not a parser's inherited name");
  assert.deepEqual(ran, [
    ['select', 2],
    ['chrome', '#000000', '#ffffff'],
  ]);
});
