import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const entry = join(dirname(fileURLToPath(import.meta.url)), "client", "main.tsx");

/**
 * The viewer's browser code (client/), bundled into one script when the server
 * starts — lens has no build step. Safe to inline in a <script> element.
 */
export async function bundleViewer(): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    charset: "utf8",
    legalComments: "none",
    jsx: "automatic",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  // "</script" anywhere in the code would end the inline script early; "<\/" means the same in
  // strings, template literals and regexes alike
  return result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
}
