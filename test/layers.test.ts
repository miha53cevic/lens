// Which folder of src/ may import which: ui/ is what the pages share and knows neither of them,
// the viewer and the desktop app know ui/ and not each other's pages, and the command knows none.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { relPath } from "../src/cli-app/paths.ts";

const SRC = join(import.meta.dirname, "..", "src");

/** What each folder may import from, besides itself and packages. */
const MAY_IMPORT: Record<string, string[]> = {
  "cli-app": [],
  ui: [],
  viewer: ["ui", "cli-app"],
  desktop: ["ui", "cli-app"],
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(?:tsx?|css)$/.test(name) ? [path] : [];
  });
}

/** The imports that cross into a folder theirs may not use, as `file → folder` lines. */
function crossings(folder: string): string[] {
  const found = new Set<string>();
  for (const file of sources(join(SRC, folder))) {
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = relPath(SRC, resolve(dirname(file), specifier)).split("/")[0];
      if (target !== folder && !MAY_IMPORT[folder].includes(target)) found.add(`${relPath(SRC, file)} → ${target}`);
    }
  }
  return [...found];
}

test("every folder of src/ has its rule", () => {
  assert.deepEqual(readdirSync(SRC).filter((name) => statSync(join(SRC, name)).isDirectory()).sort(), Object.keys(MAY_IMPORT).sort());
});

for (const folder of Object.keys(MAY_IMPORT)) {
  test(`src/${folder} imports only what it may: ${MAY_IMPORT[folder].join(", ") || "nothing of the others"}`, () => {
    assert.deepEqual(crossings(folder), []);
  });
}
