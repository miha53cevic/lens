// The app's own pages: the real bundles of the launcher and the tab strip running in happy-dom,
// with window.lensApp (what the preload gives them) stubbed, driven like a reader would.
// Type-checked by tsconfig.desktop.json (it needs the DOM types).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { fireEvent } from '@testing-library/dom';
import { bundlePage } from '../src/cli-app/render/web/bundle.ts';
import {
  LAUNCHER_CALLS,
  STRIP_CALLS,
  type LauncherState,
  type RepoInfo,
  type StripState,
  type ThemeSwatch,
} from '../src/desktop/shared/api.ts';
import { themeAttributes } from '../src/desktop/shared/page.ts';

const app = join(import.meta.dirname, '..', 'src', 'desktop');
let launcher = '';
let strip = '';

before(async () => {
  launcher = (await bundlePage(join(app, 'launcher', 'main.tsx'))).script;
  strip = (await bundlePage(join(app, 'shell', 'main.tsx'))).script;
});

const VESPER: ThemeSwatch = { name: 'vesper', bg: '#101010', fg: '#ffffff', accent: '#ffc799' };
const LIGHT: ThemeSwatch = { name: 'github-light', bg: '#ffffff', fg: '#24292e', accent: '#6f42c1' };

const REPO: RepoInfo = {
  root: '/Users/ana/repos/storefront',
  name: 'storefront',
  branch: 'feature',
  head: 'abc1234',
  branches: ['feature', 'main', 'release'],
  base: 'main',
  ahead: 5,
  changed: 0,
  staged: 2,
  github: { remote: 'origin', owner: 'acme', repo: 'storefront' },
};

const START: LauncherState = {
  screen: 'start',
  canGoBack: false,
  recents: [
    { root: '/Users/ana/repos/lens', name: 'lens', path: '~/repos/lens' },
    { root: '/Users/ana/repos/storefront', name: 'storefront', path: '~/repos/storefront' },
  ],
  repo: null,
  repoPath: null,
  current: null,
  running: null,
  status: { kind: 'idle' },
  git: '2.47.1',
  version: '0.1.0',
  setup: {
    cli: { state: 'installed', where: '~/.local/bin/lens', note: null },
    skills: { state: 'installed', where: '~/.claude/skills', note: null },
  },
  theme: VESPER,
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

/** Opens one of the app's pages on a state, with the preload's API in place of the real one. */
async function open<State>(bundle: string, area: 'launcher' | 'strip', state: State): Promise<Page<State>> {
  GlobalRegistrator.register({ url: 'lens-app://app/' + area + '.html', width: 1320, height: 840 });
  const calls: unknown[][] = [];
  let listener: (state: State) => void = () => {};
  const api: Record<string, unknown> = {
    state: async () => state,
    onState: (heard: (state: State) => void) => {
      listener = heard;
    },
  };
  for (const call of area === 'launcher' ? LAUNCHER_CALLS : STRIP_CALLS) {
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

function pageTest<State>(
  name: string,
  area: 'launcher' | 'strip',
  state: State,
  run: (page: Page<State>) => Promise<void>,
) {
  test(name, async () => {
    const page = await open(area === 'launcher' ? launcher : strip, area, state);
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
const status = () => $$('#status .status-label, #status .status-detail').map((part) => part.textContent);
/** The picker's choices, the picked one marked: ["worktree", "*staged", …] */
const choices = () => $$('.choice').map((row) => (row.classList.contains('checked') ? '*' : '') + row.dataset.range);

// ---- Start ----

pageTest('Start: one button, and the recent folders with none picked for you', 'launcher', START, async (page) => {
  assert.equal(text('.start-tagline'), 'Code review for the agentic era.');
  assert.deepEqual(
    $$('.recent-open').map((row) => row.textContent),
    ['lens~/repos/lens', 'storefront~/repos/storefront'],
  );
  assert.equal(text('#status'), 'Ready');
  assert.equal($$('#setup-notice').length, 0, 'the command is installed: nothing to say about it');
  assert.equal(document.documentElement.dataset.appearance, 'dark');
  assert.equal(document.documentElement.style.getPropertyValue('--theme-accent'), VESPER.accent);

  await click($('#open-repository'));
  await click($$('.recent-open')[1]);
  await click($('[aria-label="Forget lens"]'));
  assert.deepEqual(page.calls, [
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
    assert.equal($$('.recents').length, 0, 'no Recent section without recents');
    await click($('#setup-notice'));
    assert.deepEqual(page.calls.at(-1), ['settings']);

    await page.push({
      ...START,
      status: { kind: 'failed', label: "Couldn't open ~/Downloads/notes", detail: 'not inside a git repository' },
    });
    assert.deepEqual(status(), ["Couldn't open ~/Downloads/notes", 'not inside a git repository']);
    assert.ok($('#status').classList.contains('status-failed'));
    await click($('#status-action'));
    assert.deepEqual(page.calls.at(-1), ['dismiss']);

    await page.push({ ...START, git: null });
    assert.deepEqual(status(), ["git wasn't found", 'lens reads changes and PRs through git']);
    await click($('#status-action'));
    assert.deepEqual(page.calls.at(-1), ['recheck']);
  },
);

// ---- the picker ----

pageTest(
  'the picker: starts on what there is to review, and shows the command it will run',
  'launcher',
  PICKER,
  async (page) => {
    assert.equal(text('.repo-id'), 'storefrontfeature~/repos/storefront');
    // nothing changed in the working tree, two files staged: Staged is where it starts
    assert.deepEqual(choices(), ['worktree', '*staged', 'branch', 'custom']);
    assert.deepEqual(
      $$('.choice-meta').map((meta) => meta.textContent),
      ['0 files', '2 files', '5 commits', ''],
    );
    assert.equal(text('.copy-cmd-text'), 'lens diff --staged');

    await click($('.choice[data-range="worktree"] input'));
    assert.equal(text('.copy-cmd-text'), 'lens diff');
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
    assert.deepEqual(choices(), ['worktree', 'staged', '*branch', 'custom'], 'picking a base picks its choice');
    assert.equal(text('.copy-cmd-text'), 'lens diff release...HEAD');
    assert.deepEqual(page.calls, [['setBase', 'release']], 'the commits are recounted against it');
    assert.equal(
      $$('.choice-meta')[2].textContent,
      '',
      'the count shown was against main: gone until the new one arrives',
    );
    await page.push({ ...PICKER, repo: { ...REPO, base: 'release', ahead: 2 } });
    assert.equal($$('.choice-meta')[2].textContent, '2 commits');
    assert.deepEqual(choices(), ['worktree', 'staged', '*branch', 'custom'], 'the picker keeps what was picked');

    await type($('#picker-custom'), 'HEAD~3 -- "my dir"');
    assert.deepEqual(choices(), ['worktree', 'staged', 'branch', '*custom']);
    assert.equal(text('.copy-cmd-text'), 'lens diff HEAD~3 -- "my dir"');
    await click($('#open-review'));
    assert.deepEqual(page.calls.at(-1), ['open', { kind: 'diff', range: 'custom', args: 'HEAD~3 -- "my dir"' }]);

    // a lens flag is not a git diff argument: said, and not opened
    await type($('#picker-custom'), 'HEAD~1 --json');
    assert.equal(text('.picker-problem'), '--json is a lens flag, not a git diff argument');
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
  await click($('.choice[data-range="worktree"]'));
  await page.push({ ...PICKER, repo: { ...REPO, changed: 3, staged: 0 } });
  assert.equal($('.choice[data-range="worktree"] .choice-meta').textContent, '3 files');
  assert.ok($('.choice[data-range="worktree"]').classList.contains('checked'));
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
  assert.equal($$('.choice').length, 0);
  assert.match(text('.pr-panel .hint'), /^On origin → github\.com\/acme\/storefront\. Fetched with plain git/);
  assert.equal(text('.picker-problem'), 'Enter a PR number or URL');
  assert.equal(($('#open-review') as HTMLButtonElement).disabled, true);

  await type($('#picker-pr'), '482');
  assert.equal(text('.copy-cmd-text'), 'lens pr 482');
  await click($('#open-review'));
  assert.deepEqual(page.calls, [['open', { kind: 'pr', ref: '482' }]]);

  await page.push({ ...PICKER, repo: { ...REPO, github: null } });
  assert.match(text('.pr-panel .hint'), /^No remote here points at GitHub/);
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

pageTest(
  'the picker over a review: it starts on what the review shows',
  'launcher',
  { ...PICKER, current: { kind: 'diff', range: 'branch', base: 'release' } } satisfies LauncherState,
  async () => {
    assert.deepEqual(choices(), ['worktree', 'staged', '*branch', 'custom']);
    assert.equal(($('#picker-base') as HTMLSelectElement).value, 'release');
    assert.equal(text('.copy-cmd-text'), 'lens diff release...HEAD');
    assert.equal($('#picker-back').getAttribute('aria-label'), 'Back to the review');
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
    assert.equal(text('.settings-version'), 'lens 0.1.0');
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
    assert.ok($('#status').classList.contains('status-done'));

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
  },
);

test('a page is served in the theme: its colors on <html>, and nothing for a color that is not a plain one', () => {
  assert.equal(
    themeAttributes(LIGHT),
    ' data-appearance="light" style="--code-fg:#24292e;--code-bg:#ffffff;--theme-accent:#6f42c1"',
  );
  assert.match(themeAttributes(VESPER), /^ data-appearance="dark" /);
  assert.equal(themeAttributes({ ...LIGHT, accent: 'red;background:url(x)"><script>' }), '');
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
};

pageTest(
  'the strip: the tabs, the one in front, and what applies to the whole app on the right',
  'strip',
  STRIP,
  async (page) => {
    assert.deepEqual(
      $$('.rtab').map((tab) => (tab.classList.contains('active') ? '*' : '') + tab.textContent),
      ['*lensstaged changes', 'storefrontPR #482', 'New tab'],
    );
    assert.equal(document.documentElement.dataset.platform, 'darwin');
    assert.deepEqual(
      $$('.rtab').map((tab) => tab.querySelectorAll('[aria-label="Change what\'s reviewed"]').length),
      [1, 1, 0],
      'every tab with a review can change it, in front or not: a tab keeps its width when another comes forward',
    );

    await click($$('.rtab-main')[1]);
    await click($('[aria-label="Change what\'s reviewed"]'));
    await click($('[aria-label="Close storefront"]'));
    await click($('#new-tab'));
    await click($('#settings-btn'));
    await click($('#theme-btn'));
    assert.deepEqual(page.calls.slice(0, 5), [['select', 2], ['change', 1], ['close', 2], ['add'], ['settings']]);
    assert.equal(page.calls[5][0], 'themeMenu', "the themes open as the system's menu, under the button");

    // more tabs than fit scroll sideways: the one that comes to the front is brought into sight
    const sighted: (string | undefined)[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      sighted.push(this.dataset.tab);
    };
    await page.push({ ...STRIP, activeId: 2, theme: LIGHT, fullscreen: true });
    assert.ok($$('.rtab')[1].classList.contains('active'));
    assert.deepEqual(sighted, ['2']);
    assert.equal(document.documentElement.dataset.appearance, 'light');
    assert.ok(document.documentElement.hasAttribute('data-fullscreen'));
  },
);
