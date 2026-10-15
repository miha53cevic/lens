// bun run install-cli / uninstall-cli: puts a global `lens` command that runs this checkout's
// source (it follows the source), next to the bun that runs it. That folder is on the PATH,
// since bun was just run from it. On macOS and Linux the command is a link to cli.ts, whose
// shebang is bun; on Windows it is a lens.cmd that runs bun on cli.ts.
// It only ever removes a command that points at this checkout.

import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const cli = resolve(import.meta.dirname, "..", "src", "cli-app", "cli.ts");
const bin = dirname(process.execPath);
const windows = process.platform === "win32";
const target = join(bin, windows ? "lens.cmd" : "lens");
const action = process.argv[2];

/** What lens.cmd says: bun, on this checkout's cli.ts. */
const commandFile = `@echo off\r\nrem lens-checkout: ${cli}\r\n"${process.execPath}" "${cli}" %*\r\n`;

/** Whether the command at `target` is this checkout's. */
function isOurs(): boolean {
  try {
    if (windows) return readFileSync(target, "utf8").includes(`lens-checkout: ${cli}`);
    return lstatSync(target).isSymbolicLink() && realpathSync(target) === realpathSync(cli);
  } catch {
    return false;
  }
}

function isLink(): boolean {
  try {
    return lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

if (action === "install") {
  if (existsSync(target) && !isOurs()) {
    console.log(`left ${target} alone (not this checkout's lens — remove it to install this one)`);
    process.exit(1);
  }
  if (windows) writeFileSync(target, commandFile);
  else {
    if (isLink()) rmSync(target);
    symlinkSync(cli, target);
  }
  console.log(`linked ${target} → ${cli}`);
} else if (action === "uninstall") {
  if (!existsSync(target) && !isLink()) console.log(`not installed: ${target}`);
  else if (!isOurs()) console.log(`left ${target} alone (not this checkout's lens)`);
  else {
    rmSync(target);
    console.log(`removed ${target}`);
  }
} else {
  console.error("usage: bun scripts/cli.ts install | uninstall");
  process.exit(1);
}
