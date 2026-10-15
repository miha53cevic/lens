// bun run version:bump [patch|minor|major]: steps package.json's version and prints the new one.
// The macOS app's workflow runs it on every merge to main (a patch, unless a manual run picks
// minor or major) and commits the result; run it by hand to step the version yourself.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PARTS = ["major", "minor", "patch"] as const;
type Part = (typeof PARTS)[number];

/** The version after stepping `part`: the parts after it start again at 0. */
export function bump(version: string, part: Part): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`not a major.minor.patch version: ${version}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

if (import.meta.main) {
  const part = process.argv[2] ?? "patch";
  if (!PARTS.includes(part as Part)) throw new Error(`usage: bun run version:bump [${PARTS.join("|")}]`);
  const file = join(import.meta.dirname, "..", "package.json");
  const text = readFileSync(file, "utf8");
  const pkg = JSON.parse(text) as { version: string };
  const next = bump(pkg.version, part as Part);
  // only the version line changes: the rest of the file stays as written
  writeFileSync(file, text.replace(`"version": "${pkg.version}"`, `"version": "${next}"`));
  console.log(next);
}
