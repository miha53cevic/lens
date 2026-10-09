// The view settings (the header's ⋯ menu): hunks only, removed lines, hide tests, the fold level.

import { getState, update } from '../store.ts';
import { writePref } from '../shared.ts';
import { visibleActive } from './tabs.ts';

export function setHunksOnly(on: boolean): void {
  writePref('lens.hunksOnly', on ? '1' : '0');
  update({ hunksOnly: on, expandedGaps: new Set() }); // toggling starts fresh — no stale expansions
}

export function setHideTests(on: boolean): void {
  writePref('lens.hideTests', on ? '1' : '0');
  update((state) => ({
    hideTests: on,
    ...(state.view === 'code' ? visibleActive({ ...state, hideTests: on }) : {}),
  }));
}

export function setShowRemoved(on: boolean): void {
  update({ showRemoved: on });
}

export function setThreshold(threshold: number): void {
  update({ threshold });
}

export function stepThreshold(delta: number): void {
  setThreshold(Math.max(-1, Math.min(3, getState().threshold + delta)));
}
