// The UI's size (src/cli-app/zoom.ts): its steps, and the cookie that keeps it.

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { parsedZoom, savedZoom, steppedZoom, UI_ZOOM_DEFAULT, UI_ZOOMS, zoomStyle } from '../src/cli-app/zoom.ts';

test('a step stays within the sizes, and an unknown size steps back to the default', () => {
  assert.equal(steppedZoom(100, 1), 110);
  assert.equal(steppedZoom(110, 1), 125);
  assert.equal(steppedZoom(UI_ZOOMS[UI_ZOOMS.length - 1], 1), UI_ZOOMS[UI_ZOOMS.length - 1]);
  assert.equal(steppedZoom(UI_ZOOMS[0], -1), UI_ZOOMS[0]);
  assert.equal(steppedZoom(105, 1), UI_ZOOM_DEFAULT);
});

test('the cookie gives one of the sizes, or the default', () => {
  assert.equal(savedZoom('lens-theme=vesper; lens-ui-zoom=125'), 125);
  assert.equal(savedZoom('lens-ui-zoom=133'), UI_ZOOM_DEFAULT, 'not a step');
  assert.equal(savedZoom('my-lens-ui-zoom=125'), UI_ZOOM_DEFAULT, 'the whole name, not its end');
  assert.equal(savedZoom(''), UI_ZOOM_DEFAULT);
  assert.equal(parsedZoom('90'), 90);
  assert.equal(parsedZoom('90;zoom:9'), UI_ZOOM_DEFAULT);
  assert.equal(parsedZoom(null), UI_ZOOM_DEFAULT);
});

test("<html>'s style: the zoom and --ui-zoom, nothing at the default", () => {
  assert.equal(zoomStyle(80), ';zoom:0.8;--ui-zoom:0.8');
  assert.equal(zoomStyle(100), '');
  assert.equal(zoomStyle(4000), '');
});
