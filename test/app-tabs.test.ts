import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lensCli } from "../src/desktop/main/cli.ts";
import { tildePath } from "../src/desktop/main/display.ts";
import { openStore } from "../src/desktop/main/store.ts";
import { Tab, type TabHost } from "../src/desktop/main/tab.ts";
import { TabList } from "../src/desktop/main/tabs.ts";
import { toPosix } from "../src/cli-app/paths.ts";
import { makeViewerRepo } from "./fixtures/viewerRepo.ts";

// the CLI as the tests run it: this Node on the sources (the app uses its own executable instead)
const cli = { ...lensCli(join(import.meta.dirname, ".."), process.execPath), env: process.env };

/** A host that records what a tab asks of the window, and lets a test wait for it. */
function fakeHost() {
  const log: string[] = [];
  let waiting: { until: (tab: Tab) => boolean; done: () => void } | null = null;
  const host: TabHost & { log: string[]; other: Tab | null; until(tab: Tab, check: (tab: Tab) => boolean): Promise<void> } = {
    log,
    other: null,
    changed(tab) {
      if (waiting?.until(tab)) {
        waiting.done();
        waiting = null;
      }
    },
    review(_tab, url) {
      log.push(url ? "review shown" : "review gone");
    },
    goTo(root) {
      return host.other?.repo?.root === root;
    },
    until(tab, check) {
      if (check(tab)) return Promise.resolve();
      return new Promise((done) => {
        waiting = { until: check, done };
      });
    },
  };
  return host;
}

async function withApp(fn: (dir: string, tab: Tab, host: ReturnType<typeof fakeHost>, data: string) => Promise<void>) {
  const dir = makeViewerRepo();
  const data = realpathSync.native(mkdtempSync(join(tmpdir(), "lens-app-")));
  const host = fakeHost();
  const tab = new Tab(1, "start", cli, openStore(join(data, "state.json")), host);
  try {
    await fn(dir, tab, host, data);
  } finally {
    await tab.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
}

test("a tab: from Start to a repository's picker, to its review, and back when the review ends", { timeout: 90_000 }, async () => {
  await withApp(async (dir, tab, host, data) => {
    assert.deepEqual(tab.strip(), { id: 1, icon: "new", title: "New tab", detail: "", canChange: false });

    await tab.openFolder(join(dir, "src")); // any folder inside the repository
    assert.equal(tab.screen, "picker");
    assert.equal(tab.repo?.root, toPosix(dir));
    assert.equal(tab.repo?.changed, 2);
    assert.equal(tab.strip().detail, "choose a review");
    assert.deepEqual(openStore(join(data, "state.json")).recents(), [toPosix(dir)], "it joins the recents");

    await tab.open({ kind: "diff", range: "worktree" });
    assert.deepEqual(tab.status, { kind: "idle" });
    assert.equal(tab.showing, "review");
    assert.deepEqual(tab.strip(), { id: 1, icon: "folder", title: tab.repo!.name, detail: "working tree", canChange: true });
    const url = tab.reviewUrl!;
    assert.equal((await fetch(url)).status, 200);
    assert.equal(openStore(join(data, "state.json")).port(toPosix(dir)), Number(new URL(url).port), "the repository keeps its port");

    // ▾: the picker over the review, on what the review shows; back returns to it untouched
    tab.change();
    assert.equal(tab.showing, "launcher");
    assert.deepEqual(tab.state().current, { kind: "diff", range: "worktree" });
    assert.equal(tab.state().canGoBack, true);
    tab.back();
    assert.equal(tab.showing, "review");
    assert.equal((await fetch(url)).status, 200, "the review kept running");

    // End session in the viewer: the tab falls back to the picker
    await fetch(url + "api/shutdown", { method: "POST" });
    await host.until(tab, (it) => it.reviewUrl === null);
    assert.equal(tab.showing, "launcher");
    assert.equal(tab.screen, "picker");
    assert.deepEqual(host.log, ["review shown", "review gone"]);

    tab.back();
    assert.equal(tab.screen, "start", "with no review behind it, the picker's back goes to Start");
    assert.equal(tab.repo, null);
  });
});

test("a tab: a new review replaces the running one on the same port, and a failure says why", { timeout: 90_000 }, async () => {
  await withApp(async (dir, tab) => {
    await tab.openFolder(dir);
    await tab.open({ kind: "diff", range: "worktree" });
    const first = tab.reviewUrl!;

    await tab.open({ kind: "diff", range: "custom", args: "-- src/orders.ts" });
    assert.equal(tab.reviewUrl, first, "the same address: the viewer's marks stay");
    assert.equal(tab.strip().detail, "diff -- src/orders.ts");

    await tab.open({ kind: "diff", range: "staged" }); // nothing is staged
    assert.deepEqual(tab.status, { kind: "failed", label: "Couldn't open the review", detail: "no changed supported files in this diff" });
    assert.equal(tab.reviewUrl, null, "the review it replaced is gone");
    assert.equal(tab.showing, "launcher");
    tab.dismiss();
    assert.deepEqual(tab.status, { kind: "idle" });

    await tab.open({ kind: "pr", ref: " " });
    assert.deepEqual(tab.status, { kind: "failed", label: "Couldn't open the review", detail: "Enter a PR number or URL" });
  });
});

test("a tab: a folder outside a repository, a repository another tab has, and a lens already running", { timeout: 90_000 }, async () => {
  await withApp(async (dir, tab, host, data) => {
    await tab.openFolder(data);
    assert.deepEqual(tab.status, { kind: "failed", label: `Couldn't open ${tildePath(data)}`, detail: "not inside a git repository" });
    assert.equal(tab.screen, "start");
    tab.dismiss();

    // a lens from a terminal runs for the repository: the picker says so, and can show it
    const terminal = new Tab(2, "start", cli, openStore(join(data, "other.json")), fakeHost());
    await terminal.openFolder(dir);
    await terminal.open({ kind: "diff", range: "worktree" });
    try {
      await tab.openFolder(dir);
      const port = Number(new URL(terminal.reviewUrl!).port);
      assert.deepEqual(tab.state().running, { port });
      tab.showRunning();
      assert.equal(tab.reviewUrl, terminal.reviewUrl);
      assert.equal(tab.strip().detail, "from a terminal");
      await tab.close();
      assert.equal((await fetch(terminal.reviewUrl!)).status, 200, "closing the tab leaves a lens it didn't start alone");

      // a second tab asked for the same repository goes to the first instead
      const second = new Tab(3, "start", cli, openStore(join(data, "state.json")), host);
      host.other = tab;
      await second.openFolder(dir);
      assert.equal(second.screen, "start", "it stays what it was");
    } finally {
      await terminal.close();
    }
  });
});

test("a tab's picker follows the repository: a quiet poll reports what changed, once, and a folder that is gone", { timeout: 90_000 }, async () => {
  await withApp(async (dir, tab, host) => {
    await tab.poll();
    assert.equal(tab.screen, "start", "nothing to read before a repository is open");
    await tab.openFolder(dir);
    assert.deepEqual([tab.repo!.changed, tab.repo!.staged], [2, 0]);
    let reported = 0;
    const changed = host.changed;
    host.changed = (changedTab) => {
      reported++;
      changed(changedTab);
    };

    await tab.poll();
    assert.equal(reported, 0, "the repository is as shown: the page is told nothing");
    execFileSync("git", ["add", "src/orders.ts"], { cwd: dir });
    await tab.poll();
    assert.deepEqual([tab.repo!.changed, tab.repo!.staged, reported], [1, 1, 1], "a git add done elsewhere shows");
    // two at once: the second leaves it to the first
    await Promise.all([tab.poll(), tab.poll()]);
    assert.equal(reported, 1);

    rmSync(dir, { recursive: true, force: true });
    await tab.poll();
    assert.equal(tab.screen, "start");
    assert.equal(tab.repo, null);
    assert.deepEqual(tab.status, { kind: "failed", label: `${tildePath(dir)} is gone`, detail: "the folder was deleted or moved" });
    reported = 0;
    await tab.poll();
    assert.equal(reported, 0, "Start has nothing to poll");
  });
});

test("the tab list: a new tab goes after the one in front, and closing brings a neighbor forward", () => {
  const host = fakeHost();
  const store = openStore(join(tmpdir(), "lens-never-written.json"));
  const tabs = new TabList();
  const make = (screen: "start" | "settings" = "start") => new Tab(tabs.newId(), screen, cli, store, host);
  const [a, b, c] = [make(), make(), make()];
  tabs.add(a);
  tabs.add(b);
  tabs.select(a.id);
  tabs.add(c); // after a, which is in front
  assert.deepEqual(tabs.all.map((tab) => tab.id), [a.id, c.id, b.id]);
  assert.equal(tabs.active, c);

  tabs.remove(c.id);
  assert.equal(tabs.active, b, "its right neighbor");
  tabs.remove(b.id);
  assert.equal(tabs.active, a, "or the left one, at the end");
  assert.equal(tabs.select(a.id), false, "already in front");

  const settings = make("settings");
  tabs.add(settings);
  assert.equal(tabs.settings(), settings);
  assert.deepEqual(tabs.strip(), {
    tabs: [
      { id: a.id, icon: "new", title: "New tab", detail: "", canChange: false },
      { id: settings.id, icon: "settings", title: "Settings", detail: "", canChange: false },
    ],
    activeId: settings.id,
  });
  tabs.remove(settings.id);
  tabs.remove(a.id);
  assert.equal(tabs.active, null);
});

test("tildePath: the home folder as ~", () => {
  assert.equal(tildePath("/Users/ana/repos/lens", "/Users/ana"), "~/repos/lens");
  assert.equal(tildePath("/Users/ana/repos/lens", "/Users/ana/"), "~/repos/lens");
  assert.equal(tildePath("/Users/anabel/x", "/Users/ana"), "/Users/anabel/x");
  assert.equal(tildePath("/Users/ana", "/Users/ana"), "~");
});
