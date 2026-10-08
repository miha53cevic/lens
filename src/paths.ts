import { relative, sep } from "node:path";

// Paths lens shows, matches config patterns against, and keys summary units by
// always use "/", whatever the OS: patterns are written with "/" ("**/*.test.*"),
// and a unit id must not depend on where lens runs.

/** `p` with the OS separator replaced by "/" — a no-op on POSIX. */
export function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

/** `to` relative to `from`, "/"-separated; `to` itself when the two are the same path. */
export function relPath(from: string, to: string): string {
  return toPosix(relative(from, to) || to);
}
