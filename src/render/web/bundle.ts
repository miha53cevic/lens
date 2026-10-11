import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const webDir = dirname(fileURLToPath(import.meta.url));
const entry = join(webDir, "client", "main.tsx");

/**
 * A bundle made ahead of time. The desktop app's build writes one next to its copy of this
 * file, so the installed app needs neither esbuild nor the client's sources. It is
 * never written into src/: from source, the viewer is always bundled fresh.
 */
export const PREBUILT_BUNDLE = join(webDir, "viewer-bundle.json");

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
  // imported only when it's needed: the installed app ships without esbuild
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    // never written: esbuild only needs a directory to name the .js and .css outputs
    outdir: "viewer-bundle",
    format: "iife",
    target: "es2022",
    charset: "utf8",
    legalComments: "none",
    jsx: "automatic",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const output = (extension: string) =>
    result.outputFiles.find((file) => file.path.endsWith(extension))?.text ?? "";
  return {
    // "</script" anywhere in the code would end the inline script early; "<\/" means the same in
    // strings, template literals and regexes alike
    script: output(".js").replace(/<\/script/gi, "<\\/script"),
    // the same for the inline <style>
    css: output(".css").replace(/<\/style/gi, "<\\/style"),
  };
}

/**
 * The viewer's browser code (client/), bundled when the server starts — lens has no build
 * step. Components import their own .css files; esbuild collects them into one stylesheet.
 */
export async function bundleViewer(prebuilt = PREBUILT_BUNDLE): Promise<ViewerBundle> {
  if (existsSync(prebuilt)) return JSON.parse(readFileSync(prebuilt, "utf8")) as ViewerBundle;
  return bundlePage(entry);
}
