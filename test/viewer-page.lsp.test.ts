/// <reference types="bun" />
// The viewer page: TypeScript on the code (behind `typescriptLsp`), a name's card on hover and
// ⌘-click to its definition. The harness is test/fixtures/viewerPage.ts.

import assert from 'node:assert/strict';
import { fireEvent } from '@testing-library/dom';
import { $, $$, LINE_10, pageTest, payload, settle, status, usePage } from './fixtures/viewerPage.ts';

/** The page's polls run now, as when its window gets the focus (poll.ts): the stamp among them */
async function pollNow() {
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  await settle();
}

usePage();

const withTypescript = () => ({ ...payload, typescriptLsp: true });

/** ms past the hover's delay (actions/lsp.ts) */
const rest = () => new Promise((resolve) => setTimeout(resolve, 400));

/**
 * The pointer on `word` of line 10. happy-dom lays nothing out: the caret is where the word starts
 * (as a browser's would be, under the pointer), and every box is at 0,0, where the pointer is too.
 */
function pointAt(word: string): Element {
  const code = $('#code .row[data-line="10"]').lastElementChild!;
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const offset = node.textContent!.indexOf(word);
    if (offset < 0) continue;
    document.caretPositionFromPoint = () => ({ offsetNode: node, offset }) as CaretPosition;
    return node.parentElement!;
  }
  throw new Error(word + ' is not on line 10');
}

const lspRequests = (page: { requests: { path: string; body: unknown }[] }, path: string) =>
  page.requests.filter((request) => request.path === path).map((request) => request.body);

pageTest('TypeScript off: the pointer asks nothing', async (page) => {
  fireEvent.pointerMove(pointAt('userId'), { clientX: 0, clientY: 0 });
  await rest();
  assert.deepEqual(lspRequests(page, '/api/lsp/hover'), []);
  assert.equal($$('[data-part="hover-card"]').length, 0);
});

pageTest(
  'TypeScript on: resting on a name shows its card, which goes once the pointer leaves',
  async (page) => {
    page.lsp.hover = {
      hover: { code: 'const userId: string', doc: 'Who asks, as `id`.' },
      tokens: [
        [
          ['const ', '#d73a49'],
          ['userId: string', null],
        ],
      ],
      unavailable: null,
    };
    fireEvent.pointerMove(pointAt('userId'), { clientX: 0, clientY: 0 });
    assert.equal($$('[data-part="hover-card"]').length, 0, 'not before the pointer rests');
    await rest();
    const file = payload.files.find((shown) => shown.source.split('\n')[9] === LINE_10)!.file;
    assert.deepEqual(lspRequests(page, '/api/lsp/hover'), [{ file, line: 10, character: LINE_10.indexOf('userId') }]);
    assert.equal($('#lsp-hover pre').textContent, 'const userId: string');
    assert.equal(
      $('#lsp-hover pre span').getAttribute('style'),
      'color:#d73a49',
      "the declaration in the code's own colors",
    );
    assert.equal($('#lsp-hover [data-part="hover-doc"] code').textContent, 'id', 'the doc is markdown');

    fireEvent.pointerMove(pointAt('userId'), { clientX: 0, clientY: 0 });
    await rest();
    assert.equal(lspRequests(page, '/api/lsp/hover').length, 1, 'the same name is asked about once');

    fireEvent.pointerMove($('#code'), { clientX: 0, clientY: 0 });
    await rest();
    assert.equal($$('[data-part="hover-card"]').length, 0);
  },
  undefined,
  undefined,
  withTypescript,
);

pageTest(
  "TypeScript on: a file that can't be asked about says why in the card",
  async (page) => {
    page.lsp.hover = { hover: null, tokens: null, unavailable: "the file on disk isn't the code shown" };
    fireEvent.pointerMove(pointAt('userId'), { clientX: 0, clientY: 0 });
    await rest();
    assert.match($('#lsp-hover').textContent!, /isn't the code shown/);
  },
  undefined,
  undefined,
  withTypescript,
);

pageTest(
  '⌘-click on a name goes to its definition: a file of the review opens at the line, another is named',
  async (page) => {
    const activeTab = () => $('[data-part="tab"][data-active] [data-part="tab-name"]').textContent;
    assert.equal(activeTab(), 'orders.ts');
    const target = payload.files.find((shown) => shown.file.endsWith('orders.test.ts'))!;
    page.lsp.definition = { places: [{ file: target.file, line: 3, character: 0 }], unavailable: null };
    fireEvent.click(pointAt('userId'), { metaKey: true, ctrlKey: true, clientX: 0, clientY: 0 });
    await settle();
    assert.equal(lspRequests(page, '/api/lsp/definition').length, 1);
    assert.equal(activeTab(), 'orders.test.ts', 'the file it is declared in opens');
    assert.ok($('#code .row[data-line="3"]'), 'at the line');

    const back = $$('[data-part="tab-name"]').find((name) => name.textContent === 'orders.ts')!;
    fireEvent.click(back);
    await settle();
    page.lsp.definition = { places: [{ file: '/elsewhere/lib.d.ts', line: 7, character: 2 }], unavailable: null };
    fireEvent.click(pointAt('userId'), { metaKey: true, ctrlKey: true, clientX: 0, clientY: 0 });
    await settle();
    assert.deepEqual(status(), { kind: 'done', label: 'Defined outside this review', detail: '/elsewhere/lib.d.ts:7' });
  },
  undefined,
  undefined,
  withTypescript,
);

pageTest(
  'a plain click on a name asks nothing',
  async (page) => {
    fireEvent.click(pointAt('userId'), { clientX: 0, clientY: 0 });
    await settle();
    assert.deepEqual(lspRequests(page, '/api/lsp/definition'), []);
  },
  undefined,
  undefined,
  withTypescript,
);

pageTest(
  "the status bar says whether TypeScript's server runs, while the switch is on",
  async (page) => {
    const notice = () => $$('[data-part="status-notices"] > *').find((item) => /TypeScript/.test(item.textContent!));
    assert.equal(notice(), undefined, 'nothing is claimed before the server is asked');
    page.lsp.status = { state: 'running', version: '7.0.2', source: 'repository' };
    await pollNow();
    assert.equal(notice()!.textContent, 'TypeScript 7.0.2');
    assert.match(notice()!.title, /the repository's TypeScript 7\.0\.2/);
    page.lsp.status = { state: 'missing', version: null, source: null };
    await pollNow();
    assert.equal(notice()!.textContent, 'No TypeScript 7');
    assert.equal(notice()!.dataset.tone, 'warn');
  },
  undefined,
  undefined,
  withTypescript,
);
