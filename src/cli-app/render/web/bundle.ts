/// <reference path="./viewer-bundle.d.ts" />
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const webDir = dirname(fileURLToPath(import.meta.url));
/** The viewer's page: src/viewer, beside src/cli-app. */
const entry = join(webDir, "..", "..", "..", "viewer", "main.tsx");

/**
 * The module the compiled `lens` (scripts/compile.ts) carries the viewer in, bundled ahead of
 * time, so the binary needs neither the viewer's sources nor a bundler run on each start. It
 * exists only in the binary: from source, the import fails and the viewer is bundled fresh.
 */
export const VIEWER_MODULE = "lens:viewer-bundle";

export interface ViewerBundle {
  /** The viewer's code, safe to inline in a <script> element */
  script: string;
  /** Every stylesheet the code imports (tokens, base, the components'), in import order */
  css: string;
}

/**
 * A browser page's code, bundled from its entry: one script and one stylesheet, collected
 * from the .css files the code imports. The desktop app's own pages are bundled this way too.
 */
export async function bundlePage(entryPoint: string): Promise<ViewerBundle> {
  const result = await Bun.build({
    entrypoints: [entryPoint],
    format: "iife",
    target: "browser",
    jsx: { runtime: "automatic" },
    define: { "process.env.NODE_ENV": '"production"' },
    throw: true,
  });
  const output = (extension: string) => result.outputs.find((file) => file.path.endsWith(extension))?.text() ?? "";
  const [script, css] = await Promise.all([output(".js"), output(".css")]);
  return {
    // "</script" anywhere in the code would end the inline script early; "<\/" means the same in
    // strings, template literals and regexes alike
    script: script.replace(/<\/script/gi, "<\\/script"),
    // the same for the inline <style>
    css: css.replace(/<\/style/gi, "<\\/style"),
  };
}

/** The viewer bundled ahead of time, when this is the compiled `lens`. */
async function prebuiltViewer(): Promise<ViewerBundle | null> {
  try {
    // VIEWER_MODULE, spelled out: the bundler only follows an import it can read
    return (await import("lens:viewer-bundle")).default;
  } catch {
    return null;
  }
}

/**
 * The viewer's browser code (src/viewer), bundled when the server starts — lens has no build
 * step. Components import their own .css files; Bun.build collects them into one stylesheet.
 */
export async function bundleViewer(prebuilt = prebuiltViewer): Promise<ViewerBundle> {
  return (await prebuilt()) ?? bundlePage(entry);
}
