// The desktop app's build, as Electron Forge hooks: `electron-forge start` (npm run app) runs it from
// the checkout, `electron-forge package` (npm run app:dist) packs it into a folder you run it from
// (release/Lens-<platform>-<arch>). No installer, and unsigned: these are builds for your own machines.
//
// The app is the CLI plus a shell around it (src/desktop). Nothing here compiles the CLI: the packed
// app carries src/cli-app as it is, and Electron's Node runs the .ts files like the `lens` command's does.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { build as bundle } from "esbuild";
import { bundlePage, bundleViewer } from "./src/cli-app/render/web/bundle.ts";

const root = dirname(fileURLToPath(import.meta.url));
/** The app's own code, bundled; what package.json's "main" points into. */
const dist = join(root, "dist");
const desktop = join(root, "src", "desktop");
/** The packed app's copy of lens, as built here before Forge packs it. */
const packed = join(dist, "lens");
/** The packages the CLI loads when it runs (the viewer's own, like React, are bundled into its page). */
const CLI_PACKAGES = ["shiki", "@vscode/tree-sitter-wasm"];
/** The grammars lens parses with: the package ships a dozen more. */
const GRAMMARS = /tree-sitter(-typescript|-tsx|-javascript)?\.wasm$/;
/** What goes into the app itself: the few files buildApp makes, and no node_modules. */
const APP_FILES = /^(|\/package\.json|\/dist|\/dist\/[^/]+\.(mjs|cjs|js|css|html))$/;

/** The app's own code: the main process, the preload, and its pages. */
async function buildApp(): Promise<void> {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const node = { bundle: true, platform: "node" as const, target: "node22", external: ["electron"], logLevel: "warning" as const };
  await bundle({ ...node, entryPoints: [join(desktop, "main", "index.ts")], outfile: join(dist, "main.mjs"), format: "esm" });
  // a sandboxed preload is CommonJS
  await bundle({ ...node, entryPoints: [join(desktop, "preload.ts")], outfile: join(dist, "preload.cjs"), format: "cjs" });
  for (const page of ["shell", "launcher", "menu"]) {
    const { script, css } = await bundlePage(join(desktop, page, "main.tsx"));
    writeFileSync(join(dist, page + ".js"), script);
    writeFileSync(join(dist, page + ".css"), css);
    cpSync(join(desktop, page, page + ".html"), join(dist, page + ".html"));
  }
}

/** `name` and everything it depends on, as folders under node_modules. */
function withDependencies(name: string, seen = new Set<string>()): Set<string> {
  if (seen.has(name)) return seen;
  const manifest = join(root, "node_modules", name, "package.json");
  if (!existsSync(manifest)) throw new Error(`${name} is not installed: run npm install`);
  seen.add(name);
  const { dependencies = {} } = JSON.parse(readFileSync(manifest, "utf8")) as { dependencies?: Record<string, string> };
  for (const dependency of Object.keys(dependencies)) withDependencies(dependency, seen);
  return seen;
}

/**
 * The packed app's copy of lens: the CLI's sources, the packages it loads, the skills, and the
 * viewer bundled ahead of time (so neither esbuild nor the viewer's sources go along).
 */
async function packLens(): Promise<void> {
  // laid out as in the checkout, so the CLI finds package.json and its defaults the same way
  cpSync(join(root, "src", "cli-app"), join(packed, "src", "cli-app"), { recursive: true });
  writeFileSync(join(packed, "src", "cli-app", "render", "web", "viewer-bundle.json"), JSON.stringify(await bundleViewer()));
  for (const file of ["lens.defaults.json", "package.json"]) cpSync(join(root, file), join(packed, file));
  cpSync(join(root, "skills"), join(packed, "skills"), { recursive: true });

  const packages = new Set<string>();
  for (const name of CLI_PACKAGES) withDependencies(name, packages);
  for (const name of packages) {
    cpSync(join(root, "node_modules", name), join(packed, "node_modules", name), {
      recursive: true,
      filter: (source) => !source.endsWith(".wasm") || !source.includes("tree-sitter-wasm") || GRAMMARS.test(source),
    });
  }
}

const config: ForgeConfig = {
  outDir: "release",
  packagerConfig: {
    name: "Lens",
    appBundleId: "dev.lens.app",
    appCategoryType: "public.app-category.developer-tools",
    // icon.icns on macOS, icon.ico on Windows: `npm run app:icons` makes both from icon.png
    icon: "src/desktop/icons/icon",
    asar: true,
    prune: false,
    ignore: (path) => !APP_FILES.test(path),
    // its copy of lens, as plain files beside the app: the CLI's sources, the packages it loads, the skills
    extraResource: ["dist/lens"],
  },
  makers: [],
  hooks: {
    // before a start and before a pack
    generateAssets: buildApp,
    // before a pack only: running from the checkout uses the checkout's own CLI
    prePackage: packLens,
  },
  plugins: [
    // The fuses change the executable. On Apple silicon, which refuses to run one whose signature
    // doesn't match, the plugin signs it again ad hoc (no certificate) by itself.
    new FusesPlugin({
      version: FuseVersion.V1,
      // how the app runs the CLI: its own executable in Node mode. This one has to stay on.
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // cookie encryption stays off: on macOS it asks the Keychain for a key, which makes an app
      // without a certificate prompt for the login password. The one cookie is the theme's name.
      [FuseV1Options.EnableCookieEncryption]: false,
    }),
  ],
};

export default config;
