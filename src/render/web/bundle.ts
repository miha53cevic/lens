import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const entry = join(dirname(fileURLToPath(import.meta.url)), "client", "main.tsx");

export interface ViewerBundle {
  /** The viewer's code, safe to inline in a <script> element */
  script: string;
  /** Every stylesheet the code imports (tokens, base, the components'), in import order */
  css: string;
}

/**
 * The viewer's browser code (client/), bundled when the server starts — lens has no build
 * step. Components import their own .css files; esbuild collects them into one stylesheet.
 */
export async function bundleViewer(): Promise<ViewerBundle> {
  const result = await build({
    entryPoints: [entry],
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
