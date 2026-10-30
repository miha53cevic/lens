import { createRouter, type Router } from '../api/router.ts';
import type { ViewerInput } from '../render/web/server.ts';
import { changeMark, CONCERN_MARKS, type ConcernMark, type MarkChange } from './store.ts';

// The reader's marks on the viewer server:
//   POST /api/marks   one mark changed (MarkChange), kept under the review the server shows now

/** A finding's key carries its text: a long one is still a key, a megabyte isn't */
const MAX_KEY = 8000;

/** The change in the viewer's request body, or why it isn't one. */
export function parseMarkChange(raw: unknown): MarkChange | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'not a mark' };
  const { list, key, on, mark } = raw as Record<string, unknown>;
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY) return { error: "key must be a mark's key" };
  if (list === 'files' || list === 'units') {
    // a viewed mark is `subject@hash`
    if (key.lastIndexOf('@') < 1) return { error: "a viewed mark's key is what it marks, @ and its hash" };
    if (typeof on !== 'boolean') return { error: 'on must be true or false' };
    return { list, key, on };
  }
  if (list === 'concerns') {
    if (mark !== null && !(CONCERN_MARKS as readonly unknown[]).includes(mark)) {
      return { error: 'mark must be one of ' + CONCERN_MARKS.join(', ') + ', or null' };
    }
    return { list, key, mark: mark as ConcernMark | null };
  }
  return { error: 'list must be "files", "units" or "concerns"' };
}

export function createMarkRoutes(current: () => ViewerInput, changed: () => void): Router {
  return createRouter().json('POST /api/marks', parseMarkChange, (change) => {
    changeMark(current(), change);
    changed();
    return { ok: true };
  });
}
