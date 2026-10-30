// The page's payload, by shape: every path in it and the kinds of value found there, on the viewer
// fixture. A field added, renamed or dropped changes the snapshot (__snapshots__/payload.test.ts.snap),
// so the change to what the page gets shows in review, as a diff of its own.

import { afterAll, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { themeSwatch } from '../src/cli-app/render/highlight.ts';
import { highlightFiles, viewerPayload } from '../src/cli-app/render/web/server.ts';
import { analyzeViewerRepo, makeViewerRepo } from './fixtures/viewerRepo.ts';

const repo = makeViewerRepo();
afterAll(() => rmSync(repo, { recursive: true, force: true }));

/** Objects whose keys are data, not fields: a finding's key, a category's name */
const DATA_KEYS = new Set(['concerns', 'scores']);

/** Each path in the value and the kinds found there, as `path: kind | kind` lines. */
function shape(value: unknown): string[] {
  const kinds = new Map<string, Set<string>>();
  const walk = (at: string, item: unknown) => {
    const kind = item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item;
    if (!kinds.has(at)) kinds.set(at, new Set());
    kinds.get(at)!.add(kind);
    if (Array.isArray(item)) for (const element of item) walk(at + '[]', element);
    else if (kind === 'object') {
      const record = DATA_KEYS.has(at.split('.').pop()!);
      for (const [key, child] of Object.entries(item as object)) walk(at + (record ? '{}' : '.' + key), child);
    }
  };
  walk('payload', value);
  return [...kinds].map(([at, found]) => at + ': ' + [...found].sort().join(' | ')).sort();
}

test("the page's payload keeps its shape", async () => {
  const input = await analyzeViewerRepo(repo);
  const payload = viewerPayload(
    input,
    await highlightFiles(input.files, 'github-dark'),
    [await themeSwatch('github-dark')],
    {
      themePinned: false,
      canRefresh: true,
      analysis: 'run:1',
    },
  );
  expect(shape(payload).join('\n')).toMatchSnapshot();
});
