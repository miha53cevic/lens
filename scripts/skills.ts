// npm run install-skill / uninstall-skill: links each folder in skills/ into
// ~/.claude/skills. Plain Node, so it works the same from any shell (npm runs
// scripts with cmd.exe on Windows). On Windows the links are junctions, which
// need no admin rights or developer mode.

import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repoSkills = resolve(import.meta.dirname, "..", "skills");
const installed = join(homedir(), ".claude", "skills");
const action = process.argv[2];

const names = readdirSync(repoSkills, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

function isLink(target: string): boolean {
  try {
    return lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Where a link points, or null when it dangles (the repo moved or is gone). */
function linkTarget(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

if (action === "install") {
  mkdirSync(installed, { recursive: true });
  for (const name of names) {
    const source = join(repoSkills, name);
    const target = join(installed, name);
    if (isLink(target)) rmSync(target);
    else if (existsSync(target)) { console.log(`left ${target} alone (not a link — remove it to install this one)`); continue; }
    symlinkSync(source, target, "junction");
    console.log(`linked ${target} → ${source}`);
  }
} else if (action === "uninstall") {
  for (const name of names) {
    const target = join(installed, name);
    if (!isLink(target)) {
      console.log(existsSync(target) ? `left ${target} alone (not a link to this repo)` : `not installed: ${name}`);
      continue;
    }
    const linked = linkTarget(target);
    if (linked !== null && linked !== realpathSync(join(repoSkills, name))) {
      console.log(`left ${target} alone (not a link to this repo)`);
      continue;
    }
    rmSync(target);
    console.log(`removed ${target}${linked === null ? " (a dangling link)" : ""}`);
  }
} else {
  console.error("usage: node scripts/skills.ts install | uninstall");
  process.exit(1);
}
