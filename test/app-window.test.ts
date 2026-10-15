import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_SIZE, MIN_SIZE, placeWindow } from "../src/desktop/main/bounds.ts";
import { openStore } from "../src/desktop/main/store.ts";

// a laptop's screen, and a monitor to its right
const LAPTOP = { x: 0, y: 25, width: 1512, height: 920 };
const MONITOR = { x: 1512, y: 0, width: 2560, height: 1440 };

test("placeWindow: the saved place while a display still shows it, else its size centered on the main display", () => {
  assert.deepEqual(placeWindow(null, [LAPTOP]), DEFAULT_SIZE, "the first run");

  const onMonitor = { x: 1700, y: 80, width: 1600, height: 1000 };
  assert.deepEqual(placeWindow(onMonitor, [LAPTOP, MONITOR]), onMonitor);
  // the monitor is unplugged: no x and y, so the system centers it; its size fits the laptop
  assert.deepEqual(placeWindow(onMonitor, [LAPTOP]), { width: 1512, height: 920 });

  // half off the left edge is fine, as long as the strip can be grabbed
  const halfOff = { x: -700, y: 100, width: 900, height: 600 };
  assert.deepEqual(placeWindow(halfOff, [LAPTOP]), halfOff);
  // a sliver of it isn't, nor its top under the screen's bottom edge
  assert.deepEqual(placeWindow({ ...halfOff, x: -850 }, [LAPTOP]), { width: 900, height: 600 });
  assert.deepEqual(placeWindow({ x: 100, y: 940, width: 900, height: 600 }, [LAPTOP]), { width: 900, height: 600 });

  // a saved size under the window's minimum is the minimum; fractions (a scaled display) are rounded
  assert.deepEqual(placeWindow({ x: 10.4, y: 30.6, width: 200, height: 100 }, [LAPTOP]), { x: 10, y: 31, ...MIN_SIZE });
  assert.deepEqual(placeWindow(onMonitor, []), { width: 1600, height: 1000 }, "no display known: its size, at least");
});

test("the store keeps the window's place and the tabs, and reads back only what it could have written", () => {
  const dir = mkdtempSync(join(tmpdir(), "lens-app-"));
  const file = join(dir, "state.json");
  try {
    const store = openStore(file);
    assert.equal(store.window(), null);
    assert.equal(store.session(), null);
    const place = { x: 40, y: 60, width: 1400, height: 900, maximized: true };
    const session = {
      tabs: [
        { root: "/repos/lens", choice: { kind: "diff" as const, range: "staged" as const } },
        { root: "/repos/api", choice: { kind: "pr" as const, ref: "482" } },
        { root: "/repos/site", choice: null },
      ],
      active: 1,
    };
    store.setWindow(place);
    store.setSession(session);
    store.setPort("/repos/lens", 5400);
    const again = openStore(file);
    assert.deepEqual(again.window(), place);
    assert.deepEqual(again.session(), session);

    // the same again isn't written again
    const written = readFileSync(file, "utf8");
    writeFileSync(file, written + " ");
    store.setWindow({ ...place });
    store.setSession(structuredClone(session));
    assert.equal(readFileSync(file, "utf8"), written + " ");
    // and what else is stored stays when one part changes
    again.touch("/repos/lens");
    again.forget("/repos/api");
    assert.deepEqual(openStore(file).session(), session);
    assert.equal(openStore(file).port("/repos/lens"), 5400);

    // a file someone edited: a review that isn't one leaves its tab on the picker, the rest is dropped
    writeFileSync(file, JSON.stringify({
      recents: [],
      ports: {},
      window: { x: "left", y: 0, width: 800, height: 600 },
      session: {
        active: 7,
        tabs: [
          { root: "/repos/lens", choice: { kind: "diff", range: "everything" } },
          { root: 42, choice: null },
          { choice: null },
          { root: "/repos/api", choice: { kind: "pr", ref: "482", extra: "--json" } },
        ],
      },
    }));
    const edited = openStore(file);
    assert.equal(edited.window(), null);
    assert.deepEqual(edited.session(), {
      tabs: [
        { root: "/repos/lens", choice: null },
        { root: "/repos/api", choice: { kind: "pr", ref: "482" } },
      ],
      active: -1,
    });
    writeFileSync(file, JSON.stringify({ recents: ["/repos/lens"], ports: {}, session: { tabs: "all of them" } }));
    assert.equal(openStore(file).session(), null, "an older or broken file: the app opens as it did before");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
