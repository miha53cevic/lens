import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleViewer } from "../src/render/web/bundle.ts";

test("the viewer's browser code bundles into one script that is safe to inline", async () => {
  const script = await bundleViewer();
  assert.ok(script.length > 1000, "the bundle has the viewer in it");
  assert.doesNotMatch(script, /<\/script/i, "nothing in it ends the inline <script> early");
  assert.doesNotMatch(script, /\bimport\s*\(|^import /m, "no imports are left for the browser to resolve");
});
