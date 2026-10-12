// The design system's gallery: its real bundle in happy-dom. It must show every primitive of
// src/ui, so a primitive added without a place here fails, and its theme switch must
// set the tokens' inputs as the viewer does.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { fireEvent } from '@testing-library/dom';
import { bundlePage } from '../src/cli-app/render/web/bundle.ts';

const ui = join(import.meta.dirname, '..', 'src', 'ui');

async function settle() {
  for (let round = 0; round < 3; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

before(async () => {
  const { script } = await bundlePage(join(ui, 'gallery', 'main.tsx'));
  GlobalRegistrator.register({ url: 'http://localhost/' });
  document.body.innerHTML = '<div id="root"></div>';
  new Function(script)();
  await settle();
});

after(async () => {
  await GlobalRegistrator.unregister();
});

test('the gallery imports every primitive of ui/', () => {
  const source = readFileSync(join(ui, 'gallery', 'Gallery.tsx'), 'utf8');
  const primitives = readdirSync(ui).filter((name) => /^[A-Z].*\.tsx$/.test(name));
  // Tip is shown through the buttons that carry it
  const missing = primitives.filter((name) => name !== 'Tip.tsx' && !source.includes(`'../${name}'`));
  assert.deepEqual(missing, []);
});

test('each primitive renders, with the states the design system names', () => {
  const count = (selector: string) => document.querySelectorAll(selector).length;
  assert.equal(count('#g-button .btn'), 7);
  assert.equal(count('#g-button .btn-primary'), 1);
  assert.equal(count('#g-button .btn .tip.tip-start kbd'), 1, 'a button with a key teaches it');
  assert.equal(count('#g-icon-button .icon-btn'), 4);
  assert.equal(count('#g-icon-button .icon-btn-sm'), 1);
  assert.equal(count('#g-icon-button .icon-btn[aria-pressed="true"]'), 1);
  assert.equal(count('#g-segmented .seg'), 2);
  assert.equal(count('#g-segmented .seg-lg [aria-checked="true"]'), 1);
  assert.equal(count('#g-chip .chip'), 3);
  assert.equal(count('#g-chip .chip .dot'), 2, 'a chip without a color has no dot');
  assert.equal(count('#g-field .field'), 3);
  assert.equal(count('#g-field .field-md .icon-btn-sm'), 1, 'a field with text offers to clear it');
  assert.equal(count('#g-menu [role="menu"] [role="menuitem"]'), 2);
  assert.equal(count('#g-status .status-letter'), 5);
  assert.equal(count('#g-status .status-badge'), 5);
  assert.equal(count('#g-kbd .kbd-combo'), 3);
  assert.equal(count('#g-kbd .copy-cmd'), 1);
  assert.equal(count('#g-kbd .progress'), 1);
  assert.equal(count('#g-bars .header .brand'), 1);
  assert.equal(count('#g-bars .header .swatch'), 2);
  assert.equal(count('#g-bars .status-bar .status-failed #status-action'), 0, 'the action sits beside the status');
  assert.equal(count('#g-bars .status-bar #status-action'), 1);
  assert.equal(count('#g-bars .status-notices > *'), 3);
  assert.equal(count('#g-bars .status-notices .notice-dot'), 2, 'a plain fact has no dot');
});

test("the theme switch sets the tokens' inputs and the appearance", async () => {
  const root = document.documentElement;
  fireEvent.click(document.querySelector('#gallery-theme [data-value="github-light"]')!);
  await settle();
  assert.equal(root.dataset.appearance, 'light');
  assert.equal(root.style.getPropertyValue('--code-bg'), '#ffffff');
  assert.equal(root.style.getPropertyValue('--theme-accent'), '#6f42c1');
  assert.equal(document.querySelector('#gallery-theme [aria-checked="true"]')!.textContent, 'github-light');
});

test("a field's clear button empties it and goes", async () => {
  const field = document.querySelector('#g-field .field-md')!;
  fireEvent.click(field.querySelector('.icon-btn-sm')!);
  await settle();
  assert.equal(field.querySelector('input')!.value, '');
  assert.equal(field.querySelector('.icon-btn-sm'), null);
});
