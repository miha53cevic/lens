import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cliEnv, cliReason, lensCli, lensInfo } from "../src/desktop/main/cli.ts";
import { freePort, isPortInUse, startReview } from "../src/desktop/main/session.ts";
import { openStore } from "../src/desktop/main/store.ts";
import { makeViewerRepo } from "./fixtures/viewerRepo.ts";

// the CLI as the tests run it: this Node on the sources (the app uses its own executable instead)
const cli = { ...lensCli(join(import.meta.dirname, ".."), process.execPath), env: process.env };

test("a review starts on the line the CLI prints, serves its viewer, and stops clean", async () => {
  const dir = makeViewerRepo();
  try {
    const port = await freePort();
    const session = await startReview(cli, dir, ["diff"], port).ready;
    assert.equal(session.url, `http://127.0.0.1:${port}/`);
    assert.equal(session.port, port);
    const page = await fetch(session.url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
    assert.equal(JSON.parse(readFileSync(join(dir, ".lens", "server.json"), "utf8")).port, port, "lens ask can find it");

    // a second lens on the same port gives up: the app then picks another port
    const clash = await startReview(cli, dir, ["diff"], port).ready.catch((error) => error);
    assert.ok(isPortInUse(clash), String(clash));

    await session.stop();
    await session.exited;
    assert.ok(!existsSync(join(dir, ".lens", "server.json")), "the CLI cleaned up after itself");
    await assert.rejects(fetch(session.url), "nothing answers anymore");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("a review that can't start fails with the CLI's own reason", async () => {
  const dir = makeViewerRepo();
  try {
    execFileSync("git", ["checkout", "-q", "--", "."], { cwd: dir }); // nothing changed anymore
    await assert.rejects(startReview(cli, dir, ["diff"], await freePort()).ready, {
      message: "no changed supported files in this diff",
    });
    await assert.rejects(startReview(cli, dir, ["pr", "nope"], await freePort()).ready, /"nope" is not a PR reference/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("a review ended from the viewer is noticed, and cancelling one that is starting ends it", async () => {
  const dir = makeViewerRepo();
  try {
    const session = await startReview(cli, dir, ["diff"], await freePort()).ready;
    await fetch(session.url + "api/shutdown", { method: "POST" }); // End session in the viewer
    await session.exited;
    await session.stop(); // stopping what is already gone is fine

    const starting = startReview(cli, dir, ["diff"], await freePort());
    starting.cancel();
    await assert.rejects(starting.ready, { message: "cancelled" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("lens info through the CLI, as the picker reads it", async () => {
  const dir = makeViewerRepo();
  try {
    const info = await lensInfo(cli, dir, { themes: true });
    assert.equal(info.repo?.changed, 2);
    assert.equal(info.repo?.staged, 0);
    assert.equal(info.themes?.[0].name, "vesper");
    await assert.rejects(lensInfo(cli, dir, { base: "nope" }), { message: '"nope" is not a branch or commit here' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("cliReason and cliEnv: the CLI's last word, and an environment that runs it", () => {
  assert.equal(cliReason("warning: something\nlens: first\nlens: the reason\n"), "the reason");
  assert.equal(cliReason("a stack trace\n"), null);
  const env = cliEnv({ Path: "C:\\Windows" }, "win32");
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(env.Path, "C:\\Windows", "the PATH keeps its own spelling, and gets no folder that isn't there");
});

test("the store keeps recent repositories and each one's port, and drops folders that are gone", () => {
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), "lens-store-")));
  try {
    const file = join(home, "data", "state.json");
    const first = join(home, "first");
    const second = join(home, "second");
    for (const dir of [first, second]) execFileSync("git", ["init", "-q", dir]);

    const store = openStore(file);
    assert.deepEqual(store.recents(), []);
    store.touch(first);
    store.touch(second);
    store.touch(first);
    store.setPort(first, 5001);
    store.setPort(second, 5002);
    assert.deepEqual(store.recents(), [first, second], "most recent first, each once");

    const reopened = openStore(file);
    assert.deepEqual(reopened.recents(), [first, second]);
    assert.equal(reopened.port(first), 5001);

    rmSync(second, { recursive: true, force: true });
    assert.deepEqual(reopened.recents(), [first]);
    assert.equal(openStore(file).port(second), null, "its port goes with it");

    reopened.forget(first);
    assert.deepEqual(openStore(file).recents(), []);

    writeFileSync(file, "not json");
    assert.deepEqual(openStore(file).recents(), [], "a file the app didn't write is ignored");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
