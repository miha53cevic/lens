/// <reference types="bun" />
// The app's own pages: the real bundles of the launcher and the tab strip running in happy-dom,
// with window.lensApp (what the preload gives them) stubbed, driven like a reader would.
// Type-checked by tsconfig.desktop.json (it needs the DOM types).

import { test, beforeAll } from 'bun:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { fireEvent } from '@testing-library/dom';
import { bundlePage } from '../src/cli-app/render/web/bundle.ts';
import {
  type LauncherState,
  type MenuState,
  type RepoInfo,
  type StripState,
  type ThemeSwatch,
} from '../src/desktop/shared/api.ts';
import { LAUNCHER_CALLS, MENU_CALLS, STRIP_CALLS } from '../src/desktop/shared/ipc.ts';
import { themeAttributes } from '../src/desktop/shared/page.ts';

const app = join(import.meta.dirname, '..', 'src', 'desktop');
const ui = join(import.meta.dirname, '..', 'src', 'ui');
let launcher = '';
let strip = '';
let menu = '';

beforeAll(async () => {
  launcher = (await bundlePage(join(app, 'launcher', 'main.tsx'))).script;
  strip = (await bundlePage(join(app, 'shell', 'main.tsx'))).script;
  menu = (await bundlePage(join(app, 'menu', 'main.tsx'))).script;
});

const VESPER: ThemeSwatch = { name: 'vesper', bg: '#101010', fg: '#ffffff', accent: '#ffc799' };
const LIGHT: ThemeSwatch = { name: 'github-light', bg: '#ffffff', fg: '#24292e', accent: '#6f42c1' };

const REPO: RepoInfo = {
  root: '/Users/ana/repos/storefront',
  name: 'storefront',
  main: '/Users/ana/repos/storefront',
  worktrees: [{ root: '/Users/ana/repos/storefront', branch: 'feature', head: 'abc1234', missing: false }],
  branch: 'feature',
  head: 'abc1234',
  branches: ['feature', 'main', 'release'],
  base: 'main',
  ahead: 5,
  changed: 0,
  staged: 2,
  github: { remote: 'origin', owner: 'acme', repo: 'storefront' },
  planTab: false,
  commits: [
    commit('d', 'c', 'Show the total', true),
    commit('c', 'b', 'Count the orders', true),
    commit('b', 'a', 'Release 1.2', false),
    commit('a', null, 'First commit', false),
  ],
};

/** A commit whose SHA is its letter, forty times */
function commit(letter: string, parent: string | null, subject: string, onBranch: boolean) {
  const sha = (char: string) => char.repeat(40);
  const date = Math.floor(Date.now() / 1000) - 2 * 3600;
  return { sha: sha(letter), parent: parent && sha(parent), subject, author: 'Ana', date, onBranch };
}

const HOUR = 3_600_000;

const START: LauncherState = {
  screen: 'start',
  canGoBack: false,
  recents: [
    {
      root: '/Users/ana/repos/lens',
      name: 'lens',
      path: '~/repos/lens',
      branch: 'main',
      opened: Date.now() - 2 * HOUR,
      main: null,
    },
    // opened before the app kept when: nothing to say beside it
    {
      root: '/Users/ana/repos/storefront',
      name: 'storefront',
      path: '~/repos/storefront',
      branch: null,
      opened: null,
      main: null,
    },
  ],
  repo: null,
  repoPath: null,
  worktreePaths: {},
  current: null,
  running: null,
  openTabs: {},
  reopening: null,
  opening: false,
  status: { kind: 'idle' },
  git: '2.47.1',
  version: '0.1.0',
  setup: {
    cli: { state: 'installed', where: '~/.local/bin/lens', note: null },
    skills: { state: 'installed', where: '~/.claude/skills', note: null },
  },
  theme: VESPER,
  zoom: 100,
  platform: 'darwin',
};
const PICKER: LauncherState = {
  ...START,
  screen: 'picker',
  canGoBack: true,
  repo: REPO,
  repoPath: '~/repos/storefront',
};

// ---- the page harness ----

interface Page<State> {
  /** Every call the page made to the main process: ["open", { kind: "diff", … }] */
  calls: unknown[][];
  /** The main process says the page shows something else */
  push(state: State): Promise<void>;
}

/** Lets React render. */
async function settle() {
  for (let round = 0; round < 3; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

type Area = 'launcher' | 'strip' | 'menu';
const CALLS: Record<Area, readonly string[]> = { launcher: LAUNCHER_CALLS, strip: STRIP_CALLS, menu: MENU_CALLS };

/** Opens one of the app's pages on a state, with the preload's API in place of the real one. */
async function open<State>(bundle: string, area: Area, state: State): Promise<Page<State>> {
  GlobalRegistrator.register({ url: 'lens-app://app/' + area + '.html', width: 1320, height: 840 });
  const calls: unknown[][] = [];
  let listener: (state: State) => void = () => {};
  const api: Record<string, unknown> = {
    state: async () => state,
    onState: (heard: (state: State) => void) => {
      listener = heard;
    },
  };
  for (const call of CALLS[area]) {
    api[call] = (...args: unknown[]) => void calls.push([call, ...args]);
  }
  (window as unknown as { lensApp: unknown }).lensApp = { [area]: api };
  document.body.innerHTML = '<div id="root"></div>';
  new Function(bundle)();
  await settle();
  return {
    calls,
    async push(next) {
      listener(next);
      await settle();
    },
  };
}

function pageTest<State>(name: string, area: Area, state: State, run: (page: Page<State>) => Promise<void>) {
  test(name, async () => {
    const page = await open({ launcher, strip, menu }[area], area, state);
    try {
      await run(page);
    } finally {
      await GlobalRegistrator.unregister();
    }
  });
}

async function click(element: Element) {
  fireEvent.click(element);
  await settle();
}

async function type(element: Element, text: string) {
  fireEvent.change(element, { target: { value: text } });
  await settle();
}

function $(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  assert.ok(element, 'no element matches ' + selector);
  return element;
}
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const text = (selector: string) => $(selector).textContent!.replace(/\s+/g, ' ').trim();
/** What the status bar says: its label, then its reason when it gives one */
const status = () =>
  $$('#status [data-part="status-label"], #status [data-part="status-detail"]').map((part) => part.textContent);
/** The picker's choices, the picked one marked: ["worktree", "*staged", …] */
const choices = () =>
  $$('[data-part="choice"]').map((row) => (row.hasAttribute('data-checked') ? '*' : '') + row.dataset.range);

// ---- Start ----

pageTest('Start: one button, and the recent folders with none picked for you', 'launcher', START, async (page) => {
  assert.equal(text('[data-part="start-tagline"]'), 'Code review for the agentic era.');
  assert.deepEqual(
    $$('[data-part="recent-open"]').map((row) => row.textContent),
    ['lens~/repos/lensmain · 2h ago', 'storefront~/repos/storefront'],
  );
  assert.equal(text('#open-repository'), 'Open repository ⌘O');
  assert.equal(text('#status'), 'Ready');
  assert.equal($$('#setup-notice').length, 0, 'the command is installed: nothing to say about it');
  assert.equal(document.documentElement.dataset.appearance, 'dark');
  assert.equal(document.documentElement.style.getPropertyValue('--theme-accent'), VESPER.accent);

  await click($('#open-repository'));
  fireEvent.keyDown(document, { key: 'o', metaKey: true });
  await click($$('[data-part="recent-open"]')[1]);
  await click($('[aria-label="Forget lens"]'));
  assert.deepEqual(page.calls, [
    ['openRepository'],
    ['openRepository'],
    ['openRecent', '/Users/ana/repos/storefront'],
    ['forgetRecent', '/Users/ana/repos/lens'],
  ]);

  // while a folder is being read, nothing else can be opened
  await page.push({ ...START, status: { kind: 'working', label: 'Reading storefront…', cancellable: false } });
  assert.equal(text('#status'), 'Reading storefront…');
  assert.equal(($('#open-repository') as HTMLButtonElement).disabled, true);
  assert.equal($$('#status-action').length, 0, 'not something to cancel');

  await page.push({ ...START, theme: LIGHT });
  assert.equal(document.documentElement.dataset.appearance, 'light', 'the page follows the code theme');
});

// the forget button has no text: it is found by its accessible name
pageTest(
  'Start: forgetting a folder, a missing command, and a folder that is no repository',
  'launcher',
  START,
  async (page) => {
    await click($('[aria-label="Forget storefront"]'));
    assert.deepEqual(page.calls, [['forgetRecent', '/Users/ana/repos/storefront']]);

    const missing = { ...START.setup, cli: { state: 'missing' as const, where: '~/.local/bin/lens', note: null } };
    await page.push({ ...START, recents: [], setup: missing });
    assert.equal($$('[data-part="recents"]').length, 0, 'no Recent section without recents');
    await click($('#setup-notice'));
    assert.deepEqual(page.calls.at(-1), ['settings']);

    await page.push({
      ...START,
      status: { kind: 'failed', label: "Couldn't open ~/Downloads/notes", detail: 'not inside a git repository' },
    });
    assert.deepEqual(status(), ["Couldn't open ~/Downloads/notes", 'not inside a git repository']);
    assert.ok($('#status').dataset.kind === 'failed');
    await click($('#status-action'));
    assert.deepEqual(page.calls.at(-1), ['dismiss']);

    await page.push({ ...START, git: null });
    assert.deepEqual(status(), ["git wasn't found", 'lens reads changes and PRs through git']);
    await click($('#status-action'));
    assert.deepEqual(page.calls.at(-1), ['recheck']);
  },
);

pageTest(
  "Start: a repository's linked worktrees under it, named by their branch",
  'launcher',
  {
    ...START,
    recents: [
      {
        root: '/Users/ana/repos/lens-wt/plan',
        name: 'plan',
        path: '~/repos/lens-wt/plan',
        branch: 'features/plan',
        opened: Date.now(),
        main: '/Users/ana/repos/lens',
      },
      START.recents[0],
      {
        root: '/Users/ana/repos/shop-wt/fix',
        name: 'fix',
        path: '~/repos/shop-wt/fix',
        branch: 'fix',
        opened: null,
        main: '/Users/ana/repos/shop',
      },
    ],
  },
  async (page) => {
    assert.deepEqual(
      $$('[data-part="recent-group"]').map((group) =>
        [...group.querySelectorAll('[data-part="recent-open"], [data-part="recent-repo"]')].map(
          (row) => (row.closest('[data-worktree]') ? '  ' : '') + row.textContent,
        ),
      ),
      [
        ['lens~/repos/lensmain · 2h ago', '  features/plan~/repos/lens-wt/planjust now'],
        // only its worktree was opened here: the repository is a heading, not a row to open
        ['shop', '  fix~/repos/shop-wt/fix'],
      ],
    );
    await click($$('[data-part="recent-open"]')[1]);
    await click($('[aria-label="Forget features/plan"]'));
    assert.deepEqual(page.calls, [
      ['openRecent', '/Users/ana/repos/lens-wt/plan'],
      ['forgetRecent', '/Users/ana/repos/lens-wt/plan'],
    ]);
  },
);

// ---- the picker ----

pageTest(
  'the picker: starts on what there is to review, and shows the command it will run',
  'launcher',
  PICKER,
  async (page) => {
    assert.equal(text('[data-part="repo-id"]'), 'storefrontfeature~/repos/storefront');
    // nothing changed in the working tree, two files staged: Staged is where it starts
    assert.deepEqual(choices(), ['worktree', '*staged', 'branch', 'commits', 'custom']);
    assert.deepEqual(
      $$('[data-part="choice-meta"]').map((meta) => meta.textContent),
      ['0 files', '2 files', '5 commits', '', ''],
    );
    assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff --staged');

    // nothing in the working tree: not offered, since the CLI would find nothing to show
    assert.ok($('[data-part="choice"][data-range="worktree"]').hasAttribute('data-disabled'));
    assert.equal(
      text('[data-part="choice"][data-range="worktree"] [data-part="choice-sub"]'),
      'Nothing unstaged right now',
    );

    await page.push({ ...PICKER, repo: { ...REPO, changed: 1 } });
    await click($('[data-part="choice"][data-range="worktree"] input'));
    assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff');
    await click($('#open-review'));
    assert.deepEqual(page.calls, [['open', { kind: 'diff', range: 'worktree' }]]);

    // what was picked emptied since (committed in a terminal): it stays picked, and says why it can't open
    await page.push({ ...PICKER, repo: { ...REPO, changed: 0 } });
    assert.equal(text('[data-part="picker-problem"]'), 'Nothing unstaged to review');
    assert.equal(($('#open-review') as HTMLButtonElement).disabled, true);
  },
);

const WORKTREES: LauncherState = {
  ...PICKER,
  repo: {
    ...REPO,
    root: '/Users/ana/repos/storefront-wt/search',
    name: 'search',
    branch: 'search',
    worktrees: [
      { root: '/Users/ana/repos/storefront', branch: 'main', head: 'abc1234', missing: false },
      { root: '/Users/ana/repos/storefront-wt/search', branch: 'search', head: 'def5678', missing: false },
      { root: '/Users/ana/repos/storefront-wt/perf', branch: 'perf', head: 'abc1234', missing: false },
      { root: '/tmp/bisect', branch: null, head: '0123abc', missing: true },
    ],
  },
  repoPath: '~/repos/storefront-wt/search',
  worktreePaths: {
    '/Users/ana/repos/storefront': '~/repos/storefront',
    '/Users/ana/repos/storefront-wt/search': '~/repos/storefront-wt/search',
    '/Users/ana/repos/storefront-wt/perf': '~/repos/storefront-wt/perf',
    '/tmp/bisect': '/tmp/bisect',
  },
  openTabs: { '/Users/ana/repos/storefront': 1, '/Users/ana/repos/storefront-wt/search': 2 },
};

pageTest('the picker: a repository with no other worktree has no menu of them', 'launcher', PICKER, async () => {
  assert.equal(text('[data-part="repo-id"] [data-part="tag"]'), 'feature');
  assert.equal(document.getElementById('worktrees'), null);
});

pageTest(
  "the picker: the repository's worktrees, each opening in a tab of its own",
  'launcher',
  WORKTREES,
  async (page) => {
    assert.equal(text('#worktrees'), 'search');
    const rows = $$('[data-part="worktree"]');
    assert.deepEqual(
      rows.map((row) => row.textContent),
      [
        'main~/repos/storefrontin tab 1',
        'search~/repos/storefront-wt/searchthis tab',
        'perf~/repos/storefront-wt/perf',
        'detached at 0123abc/tmp/bisect · folder gone',
      ],
    );
    const item = (index: number) => rows[index].closest('button')!;
    assert.deepEqual(
      rows.map((_, index) => item(index).disabled),
      [false, true, false, true],
      'its own is where it is, and a folder that is gone opens nothing',
    );
    await click($('#worktrees'));
    await click(item(2));
    await click(item(0));
    assert.deepEqual(page.calls, [
      ['openWorktree', '/Users/ana/repos/storefront-wt/perf'],
      ['openWorktree', '/Users/ana/repos/storefront'],
    ]);
  },
);

pageTest(
  'the picker on a clean branch with the Plan tab: the working tree opens, to start a feature there',
  'launcher',
  { ...PICKER, repo: { ...REPO, changed: 0, staged: 0, ahead: 0, planTab: true } },
  async (page) => {
    assert.deepEqual(choices(), ['*worktree', 'staged', 'branch', 'commits', 'custom']);
    assert.ok(!$('[data-part="choice"][data-range="worktree"]').hasAttribute('data-disabled'));
    assert.equal(
      text('[data-part="choice"][data-range="worktree"] [data-part="choice-sub"]'),
      'Nothing yet: it opens on the Plan tab, to start a feature',
    );
    assert.equal(document.querySelector('[data-part="picker-problem"]'), null);
    await click($('#open-review'));
    assert.deepEqual(page.calls, [['open', { kind: 'diff', range: 'worktree' }]]);
  },
);

pageTest(
  'the picker: this branch against a base you choose, and custom git diff arguments',
  'launcher',
  PICKER,
  async (page) => {
    // the other branches; the one checked out is not something to compare itself against
    assert.deepEqual(
      $$('#picker-base option').map((option) => option.textContent),
      ['main', 'release'],
    );
    await type($('#picker-base'), 'release');
    assert.deepEqual(
      choices(),
      ['worktree', 'staged', '*branch', 'commits', 'custom'],
      'picking a base picks its choice',
    );
    assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff release...HEAD');
    assert.deepEqual(page.calls, [['setBase', 'release']], 'the commits are recounted against it');
    assert.equal(
      $$('[data-part="choice-meta"]')[2].textContent,
      '',
      'the count shown was against main: gone until the new one arrives',
    );
    await page.push({ ...PICKER, repo: { ...REPO, base: 'release', ahead: 2 } });
    assert.equal($$('[data-part="choice-meta"]')[2].textContent, '2 commits');
    assert.deepEqual(
      choices(),
      ['worktree', 'staged', '*branch', 'commits', 'custom'],
      'the picker keeps what was picked',
    );

    await type($('#picker-custom'), 'HEAD~3 -- "my dir"');
    assert.deepEqual(choices(), ['worktree', 'staged', 'branch', 'commits', '*custom']);
    assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff HEAD~3 -- "my dir"');
    await click($('#open-review'));
    assert.deepEqual(page.calls.at(-1), ['open', { kind: 'diff', range: 'custom', args: 'HEAD~3 -- "my dir"' }]);

    // a lens flag is not a git diff argument: said, and not opened
    await type($('#picker-custom'), 'HEAD~1 --json');
    assert.equal(text('[data-part="picker-problem"]'), '--json is a lens flag, not a git diff argument');
    assert.equal(($('#open-review') as HTMLButtonElement).disabled, true);
  },
);

pageTest('the picker asks for its repository again when it comes back into sight', 'launcher', PICKER, async (page) => {
  const asked = () => page.calls.filter(([call]) => call === 'refresh').length;
  assert.equal(asked(), 0);
  // the window gets the focus back (you staged something in a terminal): the loop runs what is due
  window.dispatchEvent(new Event('focus'));
  await settle();
  assert.equal(asked(), 1);
  // the counts are what the main process says now; the picked choice is the page's own
  await page.push({ ...PICKER, repo: { ...REPO, changed: 3, staged: 0 } });
  await click($('[data-part="choice"][data-range="worktree"]'));
  await page.push({ ...PICKER, repo: { ...REPO, changed: 4, staged: 0 } });
  assert.equal($('[data-part="choice"][data-range="worktree"] [data-part="choice-meta"]').textContent, '4 files');
  assert.ok($('[data-part="choice"][data-range="worktree"]').hasAttribute('data-checked'));
});

pageTest('Start and Settings have nothing to ask again', 'launcher', START, async (page) => {
  window.dispatchEvent(new Event('focus'));
  await settle();
  await page.push({ ...START, screen: 'settings' });
  window.dispatchEvent(new Event('focus'));
  await settle();
  assert.deepEqual(
    page.calls.filter(([call]) => call === 'refresh'),
    [],
  );
});

pageTest('the picker: a pull request by number, on the remote it names', 'launcher', PICKER, async (page) => {
  await click($('#picker-mode [data-value="pr"]'));
  assert.equal($$('[data-part="choice"]').length, 0);
  assert.match(
    text('[data-part="pr-panel"] [data-part="hint"]'),
    /^On origin → github\.com\/acme\/storefront\. Fetched with plain git/,
  );
  assert.equal(text('[data-part="picker-problem"]'), 'Enter a PR number or URL');
  assert.equal(($('#open-review') as HTMLButtonElement).disabled, true);

  await type($('#picker-pr'), '482');
  assert.equal(text('[data-part="copy-cmd-text"]'), 'lens pr 482');
  await click($('#open-review'));
  assert.deepEqual(page.calls, [['open', { kind: 'pr', ref: '482' }]]);

  await page.push({ ...PICKER, repo: { ...REPO, github: null } });
  assert.match(text('[data-part="pr-panel"] [data-part="hint"]'), /^No remote here points at GitHub/);
});

pageTest(
  'the picker: opening, failing, a lens that already runs, and the way back',
  'launcher',
  PICKER,
  async (page) => {
    await page.push({ ...PICKER, status: { kind: 'working', label: 'Fetching PR #482…', cancellable: true } });
    assert.equal(text('#status'), 'Fetching PR #482…');
    assert.equal(($('#open-review') as HTMLButtonElement).disabled, true);
    await click($('#status-action'));
    assert.deepEqual(page.calls.at(-1), ['cancel']);

    const failed = {
      kind: 'failed' as const,
      label: "Couldn't open the review",
      detail: 'no changed supported files in this diff',
    };
    await page.push({ ...PICKER, status: failed });
    assert.deepEqual(status(), ["Couldn't open the review", 'no changed supported files in this diff']);

    await page.push({ ...PICKER, running: { port: 5326 } });
    assert.deepEqual(status(), [
      'lens is already open on port 5326',
      "your agent's answers go to whichever started last",
    ]);
    await click($('#status-action'));
    assert.deepEqual(page.calls.at(-1), ['showRunning']);

    assert.equal($('#picker-back').getAttribute('aria-label'), 'Back to Start');
    await click($('#picker-back'));
    assert.deepEqual(page.calls.at(-1), ['back']);
  },
);

pageTest('the picker: one commit, or a run of them, from the list', 'launcher', PICKER, async (page) => {
  assert.deepEqual($$('[data-part="commits"]'), [], 'the list shows only while Commits is picked');
  await click($('[data-part="choice"][data-range="commits"] input'));
  assert.deepEqual(
    $$('[role="option"]').map((row) => [...row.children].map((part) => part.textContent).join('|')),
    [
      '|ddddddd|Show the totalthis branch|2h ago',
      '|ccccccc|Count the ordersthis branch|2h ago',
      '|bbbbbbb|Release 1.2|2h ago',
      '|aaaaaaa|First commit|2h ago',
    ],
  );
  assert.equal(text('[data-part="commits-bar"]'), 'Pick a commit⇧click for a run');
  assert.equal(text('[data-part="picker-problem"]'), 'Pick a commit');
  assert.equal($$('[data-part="commits-older"]').length, 0, 'the list reaches the first commit: nothing older');

  await click($('[data-sha="' + 'c'.repeat(40) + '"]'));
  assert.equal(text('[data-part="commits-picked"]'), 'ccccccc');
  assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff bbbbbbb ccccccc');
  assert.equal(text('[data-part="choice"][data-range="commits"] [data-part="choice-meta"]'), '1 commit');

  // ⇧ click reaches the first commit: the run is diffed from git's empty tree
  fireEvent.click($('[data-sha="' + 'a'.repeat(40) + '"]'), { shiftKey: true });
  await settle();
  assert.deepEqual(
    $$('[role="option"][aria-selected="true"]').map((row) => row.dataset.sha![0]),
    ['c', 'b', 'a'],
  );
  assert.equal(text('[data-part="commits-picked"]'), 'aaaaaaa → ccccccc');
  assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff 4b825dc ccccccc');
  await click($('#open-review'));
  assert.deepEqual(page.calls.at(-1), [
    'open',
    { kind: 'diff', range: 'commits', from: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', to: 'c'.repeat(40), count: 3 },
  ]);

  // ↑ moves the pick, ⇧↓ extends it
  fireEvent.keyDown($('[role="listbox"]'), { key: 'ArrowUp' });
  await settle();
  assert.equal(text('[data-part="commits-picked"]'), 'bbbbbbb');
  fireEvent.keyDown($('[role="listbox"]'), { key: 'ArrowUp', shiftKey: true });
  await settle();
  assert.equal(text('[data-part="commits-picked"]'), 'bbbbbbb → ccccccc');

  // a new commit on top (the list is polled) keeps the pick on its commits
  await page.push({ ...PICKER, repo: { ...REPO, commits: [commit('e', 'd', 'Later', true), ...REPO.commits] } });
  assert.equal(text('[data-part="commits-picked"]'), 'bbbbbbb → ccccccc');

  await click($('#commits-clear'));
  assert.equal(text('[data-part="picker-problem"]'), 'Pick a commit');
});

pageTest(
  'the picker over a commits review: it starts on that run',
  'launcher',
  {
    ...PICKER,
    current: { kind: 'diff', range: 'commits', from: 'b'.repeat(40), to: 'd'.repeat(40), count: 2 },
  } satisfies LauncherState,
  async () => {
    assert.deepEqual(choices(), ['worktree', 'staged', 'branch', '*commits', 'custom']);
    assert.equal(text('[data-part="commits-picked"]'), 'ccccccc → ddddddd');
    assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff bbbbbbb ddddddd');
  },
);

pageTest(
  'the picker over a review: it starts on what the review shows',
  'launcher',
  { ...PICKER, current: { kind: 'diff', range: 'branch', base: 'release' } } satisfies LauncherState,
  async () => {
    assert.deepEqual(choices(), ['worktree', 'staged', '*branch', 'commits', 'custom']);
    assert.equal(($('#picker-base') as HTMLSelectElement).value, 'release');
    assert.equal(text('[data-part="copy-cmd-text"]'), 'lens diff release...HEAD');
    assert.equal($('#picker-back').getAttribute('aria-label'), 'Back to the review');
  },
);

// ---- a reopened tab ----

const WORKTREE = { kind: 'diff', range: 'worktree' } as const;
const REOPENING: LauncherState = {
  ...PICKER,
  canGoBack: true,
  current: WORKTREE,
  reopening: { name: 'storefront', review: 'working tree' },
  status: { kind: 'working', label: 'Opening working tree…', cancellable: true },
};

/** The loading screen: what it is called, and whether it is the review's shape with nothing to read or press */
const reopening = () => {
  const screen = $('#reopening');
  const shaped = screen.querySelectorAll('[data-part="review-skeleton"] .skeleton').length > 20;
  return [screen.getAttribute('aria-label'), screen.getAttribute('aria-busy'), shaped, $$('#reopening button').length];
};

pageTest(
  'a reopened tab: a loading screen until its review shows, with nothing to pick from',
  'launcher',
  { ...START, reopening: { name: 'storefront', review: null } } as LauncherState,
  async (page) => {
    // its repository is still being read: not Start's button and recents
    assert.deepEqual(reopening(), ['Reading storefront', 'true', true, 0]);
    assert.equal(
      text('#reopening [data-part="brand"]'),
      'lens.',
      'what is known is real: only the rest is a placeholder',
    );
    assert.ok(!$('#reopening').hasAttribute('data-over'), 'the whole screen, at once');
    assert.deepEqual($$('#open-repository, [data-part="recent"], #picker-back, #open-review'), []);

    // read: its review starts, and the picker stays out of sight
    await page.push(REOPENING);
    assert.deepEqual(reopening(), ['Reopening storefront, working tree', 'true', true, 0]);
    assert.deepEqual($$('#picker-back, #open-review, [data-part="picker-header"]'), []);
    assert.deepEqual(status(), ['Opening working tree…']);
    await click($('#status-action'));
    assert.deepEqual(page.calls.at(-1), ['cancel']);

    // it couldn't start: the picker, on the review it showed, with the reason
    await page.push({
      ...REOPENING,
      reopening: null,
      status: { kind: 'failed', label: "Couldn't open the review", detail: 'nothing changed' },
    });
    assert.deepEqual($$('#reopening'), []);
    assert.ok($('#picker-back'));
    assert.deepEqual(status(), ["Couldn't open the review", 'nothing changed']);
  },
);

pageTest(
  'a review the picker started: its shape covers the picker, which keeps its pick underneath',
  'launcher',
  PICKER,
  async (page) => {
    await click($$('[data-part="choice"]')[1]);
    const picked = choices();
    const opening: LauncherState = {
      ...PICKER,
      opening: true,
      status: { kind: 'working', label: 'Opening staged changes…', cancellable: true },
    };
    await page.push(opening);
    assert.deepEqual(reopening(), ['Opening the review', 'true', true, 0]);
    assert.ok($('#reopening').hasAttribute('data-over'), 'over the picker, once the wait is worth showing');
    assert.ok($('#open-review'), 'the picker is still there');
    assert.deepEqual(status(), ['Opening staged changes…']);

    // it couldn't start: the picker as it was left, with the reason
    await page.push({
      ...PICKER,
      status: { kind: 'failed', label: "Couldn't open the review", detail: 'nothing is staged' },
    });
    assert.deepEqual($$('#reopening'), []);
    assert.deepEqual(choices(), picked, 'the pick is intact');
    assert.deepEqual(status(), ["Couldn't open the review", 'nothing is staged']);
  },
);

// ---- Settings ----

const SETTINGS: LauncherState = {
  ...START,
  screen: 'settings',
  setup: {
    cli: { state: 'missing', where: '~/.local/bin/lens', note: null },
    skills: { state: 'installed', where: '~/.claude/skills', note: null },
  },
};

pageTest(
  "Settings: each part installs and uninstalls on its own; one that is not the app's has no button",
  'launcher',
  SETTINGS,
  async (page) => {
    assert.equal(text('[data-part="settings-version"]'), 'lens 0.1.0');
    assert.equal($$('#setup-notice').length, 0, 'the notice leads here: it is not shown here');
    await click($('#setup-cli button'));
    await click($('#setup-skills button'));
    assert.deepEqual(page.calls, [
      ['install', 'cli'],
      ['uninstall', 'skills'],
    ]);
    assert.match(text('#setup-skills'), /Installed\s*Uninstall$/);
    assert.match(text('#setup-git'), /2\.47\.1$/);

    await page.push({ ...SETTINGS, status: { kind: 'done', label: 'Installed the lens command' } });
    assert.equal(text('#status'), 'Installed the lens command');
    assert.ok($('#status').dataset.kind === 'done');

    const external = {
      state: 'external' as const,
      where: '~/.nvm/bin/lens',
      note: 'Not installed by the app, so the app leaves it alone.',
    };
    await page.push({ ...SETTINGS, setup: { ...SETTINGS.setup, cli: external } });
    assert.equal($$('#setup-cli button').length, 0);
    assert.match(
      text('#setup-cli'),
      /~\/\.nvm\/bin\/lens · Not installed by the app, so the app leaves it alone\.\s*Not the app's$/,
    );

    await page.push({ ...SETTINGS, git: null });
    await click($('#setup-git button'));
    assert.deepEqual(page.calls.at(-1), ['recheck']);

    await click($('#setup-sandbox button'));
    assert.deepEqual(page.calls.at(-1), ['sandbox'], 'the way to the sandbox');
  },
);

// ---- the sandbox ----

// The design system's sandbox (ui/sandbox), on the screen Settings opens. It must show every
// primitive of src/ui, so a primitive added without a place there fails.

test('the sandbox imports every primitive of ui/', () => {
  const source = readFileSync(join(ui, 'sandbox', 'Sandbox.tsx'), 'utf8');
  const primitives = readdirSync(ui).filter((name) => /^[A-Z].*\.tsx$/.test(name));
  // Tip is shown through the buttons that carry it
  const missing = primitives.filter((name) => name !== 'Tip.tsx' && !source.includes(`'../${name}'`));
  assert.deepEqual(missing, []);
});

const SANDBOX: LauncherState = { ...START, screen: 'sandbox' };

pageTest(
  'the sandbox: each primitive renders, with the states the design system names',
  'launcher',
  SANDBOX,
  async (page) => {
    const count = (selector: string) => $$(selector).length;
    assert.equal(text('main h1'), 'Sandbox');
    assert.equal(count('[data-part="settings"], [data-part="start"]'), 0, 'the screen is its own');
    assert.equal(count('#g-button [data-part="btn"]'), 9);
    assert.equal(count('#g-button [data-variant="primary"]'), 1);
    assert.equal(count('#g-button [data-part="btn"][data-size="xs"]'), 1, 'the size a card row uses');
    assert.equal(count('#g-kbd [data-part="kbd-combo"][data-size="sm"]'), 1, 'a keycap for a hint');
    assert.equal(count('#g-disclosure [data-part="disclosure"][aria-expanded="true"]'), 1);
    assert.equal(count('#g-disclosure [data-part="disclosure"]:disabled'), 1);
    assert.equal(
      count('#g-button [data-part="btn"][data-tip-key="r"]:not([data-tip-side])'),
      1,
      'a button with a key teaches it',
    );
    assert.equal(count('#g-icon-button [data-part="icon-btn"]'), 4);
    assert.equal(count('#g-icon-button [data-part="icon-btn"][data-size="sm"]'), 1);
    assert.equal(count('#g-icon-button [data-part="icon-btn"][aria-pressed="true"]'), 1);
    assert.equal(count('#g-segmented [data-part="seg"]'), 3);
    assert.equal(count('#g-segmented [data-size="lg"] [aria-checked="true"]'), 1);
    assert.equal(count('#g-stepper [data-part="stepper"]'), 2);
    assert.equal(
      count('#g-stepper [data-part="stepper"] [data-part="icon-btn"][data-size="sm"]:disabled'),
      1,
      'a stepper at its end can only go back',
    );
    assert.equal(count('#g-chip [data-part="chip"]'), 3);
    assert.equal(count('#g-chip [data-part="chip"] .dot'), 2, 'a chip without a color has no dot');
    assert.equal(count('#g-choice [role="radiogroup"] [data-part="choice"] [data-part="choice-radio"]'), 3);
    assert.equal(count('#g-choice [role="group"] [data-part="choice"] [data-part="choice-checkbox"]'), 2);
    assert.equal(count('#g-choice [data-part="choice"][data-checked]'), 2, 'the picked radio and the ticked box');
    assert.equal(count('#g-choice [data-part="choice"][data-disabled] input:disabled'), 1);
    assert.equal(count('#g-tag [data-part="tag"]'), 6);
    assert.equal(count('#g-tag button[data-part="tag"]'), 2, 'a tag that does something is a button');
    assert.equal(count('#g-tag [data-toned]'), 1);
    assert.equal(count('#g-tag [data-part="tag"][aria-pressed="true"]'), 1);
    assert.equal(count('#g-tab [role="tablist"] [data-part="tab"]'), 3);
    assert.equal(count('#g-tab [data-part="tab"][data-active] [role="tab"][aria-selected="true"]'), 1);
    assert.equal(count('#g-tab [data-part="tab"] [data-part="tab-close"]'), 3);
    assert.equal(count('#g-list-row [data-part="list-row"]'), 3);
    assert.equal(count('#g-list-row [data-part="list-row"][data-selected]'), 1);
    assert.equal(count('#g-select [data-part="select"] select'), 2);
    assert.equal(count('#g-select [data-part="select"] select:disabled'), 1);
    assert.equal(count('#g-textarea textarea'), 1);
    assert.equal(count('#g-kbd .spin'), 1);
    assert.equal(count('#g-field [data-part="field"]'), 3);
    assert.equal(
      count('#g-field [data-size="md"] [data-part="icon-btn"][data-size="sm"]'),
      1,
      'a field with text offers to clear it',
    );
    assert.equal(count('#g-menu [role="menu"]:not(:has(#theme-github-light, [id^=theme-])) [role="menuitem"]'), 2);
    assert.equal(
      count('#g-menu [popovertarget] [data-part="swatch"]'),
      1,
      'the theme menu shows the theme on its button',
    );
    assert.equal(count('#g-menu [role="menu"]:has([id^=theme-]) [role="menuitem"] [data-part="swatch"]'), 2);
    assert.equal(
      count('#g-menu [role="menu"]:has([id^=theme-]) [data-part="theme-check"]'),
      1,
      'the theme the menu is given is checked',
    );
    assert.equal(count('[data-part="hover-card"]'), 0, 'a hover card waits for the pointer');
    fireEvent.pointerOver($('#g-hover-card [data-part="hover-target"]'));
    await settle();
    assert.equal(count('[data-part="hover-card"][popover="manual"] pre'), 1, 'it says what the name is');
    fireEvent.pointerOut($('#g-hover-card [data-part="hover-target"]'));
    await settle();
    assert.equal(count('[data-part="hover-card"]'), 0, 'and goes with it');
    assert.equal(count('#g-status [data-part="status-letter"]'), 5);
    assert.equal(count('#g-status [data-part="status-badge"]'), 5);
    assert.equal(count('#g-kbd [data-part="kbd-combo"]'), 5);
    assert.equal(count('#g-kbd [data-variant="primary"] kbd'), 2, 'keycaps on a primary button');
    assert.equal(count('#g-kbd [data-part="copy-cmd"]'), 2);
    assert.equal(count('#g-kbd [data-part="copy-cmd"][data-wrap]'), 1, 'a block that wraps its command');
    assert.equal(count('#g-kbd [data-part="progress"]'), 1);
    assert.equal(count('#g-skeleton .skeleton'), 8);
    assert.equal(count('#g-skeleton [data-round]'), 2);
    assert.equal(count('#g-skeleton .skeleton[aria-hidden="true"]'), 8, 'a placeholder says nothing to a reader');
    assert.equal(count('#g-review-skeleton [data-part="review-skeleton"] header'), 1, 'the name is real');
    assert.equal(count('#g-review-skeleton .font-mono > .h-\\[1\\.75em\\]'), 48);
    assert.equal(
      count('#g-error-boundary [data-part="crash"][role="alert"] [data-part="copy-cmd"]'),
      1,
      'a crash says what broke',
    );
    assert.equal(count('#g-error-boundary [data-part="crash"] [data-variant="primary"]'), 1, 'and offers a reload');
    assert.equal(count('#g-bars [data-part="header"] [data-part="brand"]'), 1);
    assert.equal(count('#g-bars [data-part="header"] [data-part="swatch"]'), 2);
    assert.equal(count('#g-bars #status[data-kind="failed"] #status-action'), 0, 'the action sits beside the status');
    assert.equal(count('#g-bars [data-part="status-bar"] #status-action'), 1);
    assert.equal(count('#g-bars [data-part="status-notices"] > *'), 3);
    assert.equal(count('#g-bars [data-part="status-notices"] [data-part="notice-dot"]'), 2, 'a plain fact has no dot');

    // a field's clear button empties it and goes
    const field = $('#g-field [data-size="md"]');
    await click(field.querySelector('[data-part="icon-btn"][data-size="sm"]')!);
    assert.equal(field.querySelector('input')!.value, '');
    assert.equal(field.querySelector('[data-part="icon-btn"][data-size="sm"]'), null);

    // its theme is the app's: the strip's button switches it, as on every page
    assert.equal(document.documentElement.dataset.appearance, 'dark');
    await page.push({ ...SANDBOX, theme: LIGHT });
    assert.equal(document.documentElement.dataset.appearance, 'light');
    assert.equal(document.documentElement.style.getPropertyValue('--code-bg'), LIGHT.bg);
    assert.deepEqual(page.calls, [], 'nothing here asks the main process for anything');
  },
);

test('a page is served in the theme: its colors on <html>, and nothing for a color that is not a plain one', () => {
  assert.equal(
    themeAttributes(LIGHT),
    ' data-appearance="light" style="--code-fg:#24292e;--code-bg:#ffffff;--theme-accent:#6f42c1"',
  );
  assert.match(themeAttributes(VESPER), /^ data-appearance="dark" /);
  assert.equal(themeAttributes({ ...LIGHT, accent: 'red;background:url(x)"><script>' }), '');
  assert.match(themeAttributes(LIGHT, 125), /--theme-accent:#6f42c1;zoom:1.25;--ui-zoom:1.25"$/, 'the UI size');
  assert.doesNotMatch(themeAttributes(LIGHT, 100), /zoom/, 'nothing at the default');
  assert.doesNotMatch(themeAttributes(LIGHT, 333), /zoom/, 'nor for a size lens has no step for');
});

pageTest("the launcher follows the viewer's UI size, and drops it at the default", 'launcher', START, async (page) => {
  const root = document.documentElement;
  assert.equal(root.style.getPropertyValue('zoom'), '');
  await page.push({ ...START, zoom: 125 });
  assert.equal(root.style.getPropertyValue('zoom'), '1.25');
  assert.equal(root.style.getPropertyValue('--ui-zoom'), '1.25');
  await page.push({ ...START, zoom: 100 });
  assert.equal(root.style.getPropertyValue('zoom'), '');
  assert.equal(root.style.getPropertyValue('--ui-zoom'), '');
});

// ---- the tab strip ----

const STRIP: StripState = {
  tabs: [
    { id: 1, icon: 'folder', title: 'lens', detail: 'staged changes', canChange: true },
    { id: 2, icon: 'folder', title: 'storefront', detail: 'PR #482', canChange: true },
    { id: 3, icon: 'new', title: 'New tab', detail: '', canChange: false },
  ],
  activeId: 1,
  theme: VESPER,
  platform: 'darwin',
  fullscreen: false,
  hints: false,
};

pageTest(
  'the strip: the tabs, the one in front, and what applies to the whole app on the right',
  'strip',
  STRIP,
  async (page) => {
    assert.deepEqual(
      $$('[data-tab]').map((tab) => (tab.hasAttribute('data-active') ? '*' : '') + tab.textContent),
      ['*lensstaged changes', 'storefrontPR #482', 'New tab'],
    );
    assert.equal(document.documentElement.dataset.platform, 'darwin');
    assert.deepEqual(
      $$('[data-tab]').map((tab) => tab.querySelectorAll('[aria-label="Change what\'s reviewed"]').length),
      [1, 1, 0],
      'every tab with a review can change it, in front or not: a tab keeps its width when another comes forward',
    );

    await click($$('[data-tab] [data-part="tab-main"]')[1]);
    await click($('[aria-label="Change what\'s reviewed"]'));
    await click($('[aria-label="Close storefront"]'));
    await click($('#new-tab'));
    await click($('#settings-btn'));
    await click($('#theme-btn'));
    assert.deepEqual(page.calls.slice(0, 5), [['select', 2], ['change', 1], ['close', 2], ['add'], ['settings']]);
    assert.equal(page.calls[5][0], 'themeMenu', 'the themes open in a menu the main process shows, under the button');
    assert.equal($('#theme-btn').dataset.part, 'icon-btn', "the viewer's own theme button");
    assert.equal($$('#theme-btn [data-part="swatch"]').length, 1);
    assert.deepEqual($$('[role=menu]'), [], 'its menu is not in this page: it would open under the tab');

    // more tabs than fit scroll sideways: the one that comes to the front is brought into sight
    const sighted: (string | undefined)[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      sighted.push(this.dataset.tab);
    };
    await page.push({ ...STRIP, activeId: 2, theme: LIGHT, fullscreen: true });
    assert.ok($$('[data-tab]')[1].hasAttribute('data-active'));
    assert.deepEqual(sighted, ['2']);
    assert.equal(document.documentElement.dataset.appearance, 'light');
    assert.ok(document.documentElement.hasAttribute('data-fullscreen'));
  },
);

pageTest('the strip: ⌘ held alone numbers the tabs, the ninth key the last one', 'strip', STRIP, async (page) => {
  const hints = () => $$('[data-tab]').map((tab) => tab.querySelector('[data-part="kbd-combo"]')?.textContent ?? '');
  assert.deepEqual(hints(), ['', '', ''], 'no numbers until the main process says ⌘ is held');

  await page.push({ ...STRIP, hints: true });
  assert.deepEqual(hints(), ['1', '2', '3']);
  assert.ok($('[role=tablist]').hasAttribute('data-hints'));

  const tabs = Array.from({ length: 11 }, (_, index) => ({ ...STRIP.tabs[0], id: index + 1, title: 'tab' + index }));
  await page.push({ ...STRIP, tabs, hints: true });
  assert.deepEqual(hints(), ['1', '2', '3', '4', '5', '6', '7', '8', '', '', '9'], '⌘9 is the last tab, past eight');

  await page.push({ ...STRIP, tabs, hints: false });
  assert.deepEqual(hints(), Array(11).fill(''));
});

// ---- the strip's theme menu ----

const MENU: MenuState = { theme: VESPER, themes: [VESPER, LIGHT], at: null };

pageTest(
  "the theme menu: the viewer's list where the strip's button is, a pick by name, and gone when closed",
  'menu',
  MENU,
  async (page) => {
    assert.deepEqual($$('[role=menu]'), [], 'closed: the page is a clear sheet');

    await page.push({ ...MENU, at: { right: 1100, top: 46 } });
    assert.equal($('#theme-menu').dataset.part, 'menu');
    assert.deepEqual([$('#theme-menu').style.top, $('#theme-menu').style.right], ['46px', '220px']);
    assert.deepEqual(
      $$('#theme-menu [role=menuitem]').map(
        (item) => item.textContent + (item.querySelector('[data-part="theme-check"]') ? ' ✓' : ''),
      ),
      ['vesper ✓', 'github-light'],
    );
    assert.equal(document.documentElement.style.getPropertyValue('--theme-accent'), VESPER.accent);

    await click($('#theme-vesper'));
    assert.deepEqual(page.calls, [], 'the theme it is in is not a pick');
    await click($('#theme-github-light'));
    assert.deepEqual(page.calls.at(-1), ['pick', 'github-light']);

    await page.push({ ...MENU, theme: LIGHT, at: null });
    assert.deepEqual($$('[role=menu]'), []);
    assert.equal(document.documentElement.dataset.appearance, 'light');
  },
);
