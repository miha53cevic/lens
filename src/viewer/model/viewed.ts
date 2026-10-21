// Viewed, then changed: a file or change the reader ticked whose code has moved since. Its mark is
// keyed by content (`path@hash`, `unitId@hash`), so the old mark is still in the set under the
// same path or unit with another hash: that is how it's told apart from one never viewed.

import { toggled } from '../store.ts';

/** What a mark is of: `src/a.ts@1x9` → `src/a.ts`. A path may hold an @, the hash never does. */
function markSubject(key: string): string {
  return key.slice(0, key.lastIndexOf('@'));
}

// a set's subjects, once per set (the sets are replaced on every change, never changed in place)
const subjectsOf = new WeakMap<ReadonlySet<string>, ReadonlySet<string>>();
function markSubjects(viewed: ReadonlySet<string>): ReadonlySet<string> {
  let subjects = subjectsOf.get(viewed);
  if (!subjects) {
    subjects = new Set([...viewed].map(markSubject));
    subjectsOf.set(viewed, subjects);
  }
  return subjects;
}

/** Ticked once, changed since: not marked under `key`, but under an older key of the same file or change. */
export function changedSinceViewed(viewed: ReadonlySet<string>, key: string): boolean {
  return !viewed.has(key) && markSubjects(viewed).has(markSubject(key));
}

/** `key` toggled; ticking it drops the older marks of the same file or change, so unticking doesn't bring them back. */
export function toggledMark(viewed: ReadonlySet<string>, key: string): Set<string> {
  const next = toggled(viewed, key);
  if (!next.has(key)) return next;
  const subject = markSubject(key);
  for (const other of viewed) if (other !== key && markSubject(other) === subject) next.delete(other);
  return next;
}
