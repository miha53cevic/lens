// The desktop app's build, as Electron Forge hooks: `electron-forge start` (bun run app) runs it
// from the checkout, `electron-forge package` (bun run app:dist) packs it into a folder you run it
// from (release/Lens-<platform>-<arch>). No installer, and unsigned: these are builds for your own
// machines. Forge runs under Bun (the scripts pass --bun), since the hooks bundle with Bun.build.
//
// The app is the CLI plus a shell around it (src/desktop). From the checkout the app runs the
// CLI's sources with bun; packed, it carries the same sources compiled into one executable.

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { compileLens } from "./scripts/compile.ts";
import { bundlePage } from "./src/cli-app/render/web/bundle.ts";

const root = dirname(fileURLToPath(import.meta.url));
/** The app's own code, bundled; what package.json's "main" points into. */
const dist = join(root, "dist");
const desktop = join(root, "src", "desktop");
/** The packed app's copy of lens, as built here before Forge packs it. */
const packed = join(dist, "lens");
/** What goes into the app itself: the few files buildApp makes, and no node_modules. */
const APP_FILES = /^(|\/package\.json|\/dist|\/dist\/[^/]+\.(mjs|cjs|js|css|html))$/;

/** The app's own code: the main process, the preload, and its pages. */
async function buildApp(): Promise<void> {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const node = { target: "node" as const, external: ["electron"], throw: true };
  await Bun.build({ ...node, entrypoints: [join(desktop, "main", "index.ts")], format: "esm", naming: "main.mjs", outdir: dist });
  // a sandboxed preload is CommonJS
  await Bun.build({ ...node, entrypoints: [join(desktop, "preload.ts")], format: "cjs", naming: "preload.cjs", outdir: dist });
  for (const page of ["shell", "launcher", "menu"]) {
    const { script, css } = await bundlePage(join(desktop, page, "main.tsx"));
    writeFileSync(join(dist, page + ".js"), script);
    writeFileSync(join(dist, page + ".css"), css);
    cpSync(join(desktop, page, page + ".html"), join(dist, page + ".html"));
  }
}

/** The packed app's copy of lens: the compiled lens (scripts/compile.ts), and the skills. */
async function packLens(): Promise<void> {
  await compileLens(join(packed, process.platform === "win32" ? "lens.exe" : "lens"));
  cpSync(join(root, "skills"), join(packed, "skills"), { recursive: true });
}

const config: ForgeConfig = {
  outDir: "release",
  packagerConfig: {
    name: "Lens",
    appBundleId: "dev.lens.app",
    appCategoryType: "public.app-category.developer-tools",
    // icon.icns on macOS, icon.ico on Windows: `bun run app:icons` makes both from icon.png
    icon: "src/desktop/icons/icon",
    asar: true,
    prune: false,
    ignore: (path) => !APP_FILES.test(path),
    // its copy of lens, beside the app: the compiled lens and the skills
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
      // the app runs the compiled lens, never itself as Node
      [FuseV1Options.RunAsNode]: false,
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
