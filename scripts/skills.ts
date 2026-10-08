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

/** The path `target` is a link to, or null when it's not a link (or missing). */
function linkTarget(target: string): string | null {
  try {
    return lstatSync(target).isSymbolicLink() ? realpathSync(target) : null;
  } catch {
    return null;
  }
}

if (action === "install") {
  mkdirSync(installed, { recursive: true });
  for (const name of names) {
    const source = join(repoSkills, name);
    const target = join(installed, name);
    if (existsSync(target) || linkTarget(target) !== null) {
      if (lstatSync(target).isSymbolicLink()) rmSync(target);
      else { console.log(`left ${target} alone (not a link — remove it to install this one)`); continue; }
    }
    symlinkSync(source, target, "junction");
    console.log(`linked ${target} → ${source}`);
  }
} else if (action === "uninstall") {
  for (const name of names) {
    const target = join(installed, name);
    const linked = linkTarget(target);
    if (linked !== null && linked === realpathSync(join(repoSkills, name))) {
      rmSync(target);
      console.log(`removed ${target}`);
    } else if (existsSync(target)) {
      console.log(`left ${target} alone (not a link to this repo)`);
    } else {
      console.log(`not installed: ${name}`);
    }
  }
} else {
  console.error("usage: node scripts/skills.ts install | uninstall");
  process.exit(1);
}
