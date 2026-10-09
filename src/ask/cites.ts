import { join } from "node:path";
import { relPath, resolveLineRef } from "../paths.ts";
import type { AskCite } from "./session.ts";

// `path:line` references in an agent's answer. The ones that point at a real
// line become links in the rail; the rest stay plain text, and `lens ask reply`
// lists them so the agent can fix them.

// a path with a file extension, then :line, optionally a range (":43-44" / ":43–44");
// the extension starts with a letter, so "127.0.0.1:5326" isn't one
const CITE = /(?<![\w./\\-])((?:[\w.@-]+[/\\])*[\w@-][\w.@-]*\.[A-Za-z][A-Za-z0-9]*):(\d+)(?:[-–]\d+)?/g;

export interface FoundCites {
  cites: AskCite[];
  /** References that look like `path:line` but don't resolve, with why */
  unresolved: string[];
}

/**
 * root: what the agent's paths are relative to (the repo root).
 * cwd: where lens runs — cites carry the viewer's display path, relative to it.
 */
export function findCites(markdown: string, root: string, cwd: string): FoundCites {
  const cache = new Map<string, string[] | null>();
  const cites: AskCite[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(CITE)) {
    const ref = m[0];
    if (seen.has(ref)) continue;
    seen.add(ref);
    const resolved = resolveLineRef(root, m[1] + ":" + m[2], cache);
    if ("error" in resolved) unresolved.push(`${ref} ${resolved.error}`);
    else cites.push({ ref, file: relPath(cwd, join(root, resolved.file)), line: resolved.line });
  }
  return { cites, unresolved };
}
