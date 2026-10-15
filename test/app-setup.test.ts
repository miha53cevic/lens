import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { install, setupState, terminalPath, uninstall, type SetupEnv } from "../src/desktop/main/setup.ts";

const lensRoot = join(import.meta.dirname, "..");

/** A made-up home with a bin folder on the PATH, and the real checkout as the app's lens. */
function withHome(fn: (env: SetupEnv, home: string, bin: string) => Promise<void>, platform: NodeJS.Platform = process.platform) {
  return async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "lens-setup-")));
    const bin = join(home, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    const pathChanges: string[] = [];
    const env: SetupEnv & { pathChanges: string[] } = {
      execPath: process.execPath,
      lensRoot,
      home,
      platform,
      env: { LOCALAPPDATA: join(home, "AppData", "Local") },
      pathDirs: [bin],
      setUserPath: async (dir, change) => void pathChanges.push(change + " " + dir),
      pathChanges,
    };
    try {
      await fn(env, home, bin);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  };
}

test.skipIf(process.platform === "win32")("the lens command: installed where terminals look, runs the real CLI, and is removed again",
  withHome(async (env, _home, bin) => {
    assert.deepEqual(setupState(env).cli, { state: "missing", where: "~/.local/bin/lens", note: null });

    assert.equal(await install(env, "cli"), "Installed the lens command");
    assert.deepEqual(setupState(env).cli, { state: "installed", where: "~/.local/bin/lens", note: null });
    // the command is this Node on the checkout here (the app: its own executable in Node mode)
    const out = execFileSync(join(bin, "lens"), ["info", "--json"], { cwd: lensRoot, encoding: "utf8" });
    assert.match(JSON.parse(out).version, /^\d+\.\d+\.\d+/);

    // the app moved: the file points somewhere else, and installing again fixes it
    const moved = { ...env, execPath: "/Applications/It's Lens.app/Contents/MacOS/Lens" };
    assert.equal(setupState(moved).cli.state, "missing");
    assert.match(setupState(moved).cli.note ?? "", /points at another copy/);
    await install(moved, "cli");
    assert.match(readFileSync(join(bin, "lens"), "utf8"), /exec '\/Applications\/It'\\''s Lens\.app/, "a quote in the path is escaped");
    assert.equal(setupState(moved).cli.state, "installed");

    assert.equal(await uninstall(env, "cli"), "Removed the lens command");
    assert.ok(!existsSync(join(bin, "lens")));
    assert.equal(await uninstall(env, "cli"), "The lens command was not installed by the app");
  }));

test.skipIf(process.platform === "win32")("the lens command: one that isn't the app's is left alone, and one off the PATH says so",
  withHome(async (env, home, bin) => {
    writeFileSync(join(bin, "lens"), "#!/usr/bin/env node\n// npm link put this here\n");
    const state = setupState(env).cli;
    assert.equal(state.state, "external");
    assert.equal(state.where, "~/.local/bin/lens");
    await assert.rejects(install(env, "cli"), /is not the app's: left alone/);
    await uninstall(env, "cli");
    assert.ok(existsSync(join(bin, "lens")), "uninstall never touches it");

    // nothing writable on the PATH: the app's own folder, with a note
    const elsewhere = { ...env, home: join(home, "other"), pathDirs: ["/usr/bin"] };
    await install(elsewhere, "cli");
    const off = setupState(elsewhere).cli;
    assert.equal(off.state, "installed");
    assert.equal(off.note, "~/.local/bin isn't on your PATH: add it in your shell's profile.");
  }));

test("the lens command on Windows: a .cmd in the app's folder, which joins and leaves the user's PATH",
  withHome(async (env, home) => {
    const dir = join(home, "AppData", "Local", "lens", "bin");
    assert.equal(await install(env, "cli"), "Installed the lens command");
    const text = readFileSync(join(dir, "lens.cmd"), "utf8");
    assert.match(text, /^@echo off\r\nrem lens-app-shim/);
    assert.ok(text.includes(`set ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${join(lensRoot, "src", "cli-app", "cli.ts")}" %*`));
    const state = setupState(env).cli;
    assert.equal(state.state, "installed");
    assert.equal(state.note, "Open a new terminal to use it.");

    await uninstall(env, "cli");
    assert.ok(!existsSync(join(dir, "lens.cmd")));
    assert.deepEqual((env as SetupEnv & { pathChanges: string[] }).pathChanges, ["add " + dir, "remove " + dir]);
  }, "win32"));

test("the agent skills: copied with a marker, removed by it, and a linked one is never touched",
  withHome(async (env, home) => {
    const skills = join(home, ".claude", "skills");
    assert.deepEqual(setupState(env).skills, { state: "missing", where: "~/.claude/skills", note: null });

    assert.equal(await install(env, "skills"), "Installed the agent skills");
    assert.equal(setupState(env).skills.state, "installed");
    assert.match(readFileSync(join(skills, "lens-review", "SKILL.md"), "utf8"), /lens/);

    // one of them is a link from a checkout (npm run install-skill): the app's hands stay off it
    rmSync(join(skills, "lens-ask"), { recursive: true });
    symlinkSync(join(lensRoot, "skills", "lens-ask"), join(skills, "lens-ask"), "junction");
    assert.equal(setupState(env).skills.state, "external");
    await install(env, "skills");
    assert.equal(await uninstall(env, "skills"), "Removed the agent skills");
    assert.ok(existsSync(join(skills, "lens-ask", "SKILL.md")), "the link is still there");
    assert.ok(existsSync(join(lensRoot, "skills", "lens-ask", "SKILL.md")), "and so is what it points at");
    assert.ok(!existsSync(join(skills, "lens-review")), "the copies are gone");
    assert.ok(!existsSync(join(lensRoot, "skills", "lens-ask", ".lens-app")), "no marker was written through the link");
    assert.equal(await uninstall(env, "skills"), "The skills were not installed by the app");
  }));

test("terminalPath: the PATH as a list, each folder once", async () => {
  // "win32": no shell is asked, the variable is read whatever its spelling
  assert.deepEqual(await terminalPath({ Path: ["/a", "/b", "/a"].join(delimiter) }, "win32"), ["/a", "/b"]);
  const fromShell = await terminalPath({ PATH: "/usr/bin", SHELL: "/bin/sh" }, "linux");
  assert.ok(fromShell.length > 0);
});
