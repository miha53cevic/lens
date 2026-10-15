import { test } from "bun:test";
import assert from "node:assert/strict";
import { bump } from "../scripts/version.ts";

test("a bump steps one part and starts the later ones again at 0", () => {
  assert.equal(bump("0.1.9", "patch"), "0.1.10");
  assert.equal(bump("0.1.9", "minor"), "0.2.0");
  assert.equal(bump("0.1.9", "major"), "1.0.0");
  assert.throws(() => bump("0.1", "patch"), /major\.minor\.patch/);
});
