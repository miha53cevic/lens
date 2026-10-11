// The desktop app's builds: node scripts/app.ts dev | build | dist | smoke [--packed] | icons.
// Plain Node, as scripts/skills.ts is, so it works the same from any shell.
//
// The app is the CLI plus a shell around it (app/). Nothing here compiles the CLI: the packed
// app carries src/ as it is, and Electron's Node runs the .ts files like the `lens` command's does.

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { build as bundle } from "esbuild";
import { bundlePage, bundleViewer } from "../src/render/web/bundle.ts";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "app", "dist");
/** The packed app's copy of lens, as built here before Forge packs it (forge.config.ts). */
const packed = join(dist, "lens");
/** The packages the CLI loads when it runs (the viewer's own, like React, are bundled into its page). */
const CLI_PACKAGES = ["shiki", "@vscode/tree-sitter-wasm"];
/** The grammars lens parses with: the package ships a dozen more. */
const GRAMMARS = /tree-sitter(-typescript|-tsx|-javascript)?\.wasm$/;

/** The app's own code: the main process, the preload, and its two pages. */
async function buildApp(): Promise<void> {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const node = { bundle: true, platform: "node" as const, target: "node22", external: ["electron"], logLevel: "warning" as const };
  await bundle({ ...node, entryPoints: [join(root, "app/main/index.ts")], outfile: join(dist, "main.mjs"), format: "esm" });
  // a sandboxed preload is CommonJS
  await bundle({ ...node, entryPoints: [join(root, "app/preload.ts")], outfile: join(dist, "preload.cjs"), format: "cjs" });
  for (const page of ["shell", "launcher"]) {
    const { script, css } = await bundlePage(join(root, "app", page, "main.tsx"));
    writeFileSync(join(dist, page + ".js"), script);
    writeFileSync(join(dist, page + ".css"), css);
    cpSync(join(root, "app", page, page + ".html"), join(dist, page + ".html"));
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
  cpSync(join(root, "src"), join(packed, "src"), {
    recursive: true,
    filter: (source) => source !== join(root, "src", "render", "web", "client"),
  });
  writeFileSync(join(packed, "src", "render", "web", "viewer-bundle.json"), JSON.stringify(await bundleViewer()));
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

/** The sizes an icon is drawn at: Finder and Explorer pick the nearest. */
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

/**
 * app/build/icon.icns and icon.ico from icon.png, which Forge wants ready-made. macOS only (sips
 * and iconutil ship with it); the results are checked in, so this runs when the icon changes.
 */
async function buildIcons(): Promise<void> {
  if (process.platform !== "darwin") throw new Error("the icons are made on macOS (sips, iconutil)");
  const source = join(root, "app", "build", "icon.png");
  const work = mkdtempSync(join(tmpdir(), "lens-icons-"));
  const iconset = join(work, "icon.iconset");
  mkdirSync(iconset);
  const sized = (size: number) => join(work, `${size}.png`);
  for (const size of ICON_SIZES) await run("sips", ["-z", `${size}`, `${size}`, source, "--out", sized(size)]);
  // an iconset names each size, and its double-density twin
  for (const size of [16, 32, 128, 256, 512]) {
    cpSync(sized(size), join(iconset, `icon_${size}x${size}.png`));
    cpSync(sized(size * 2), join(iconset, `icon_${size}x${size}@2x.png`));
  }
  await run("iconutil", ["--convert", "icns", iconset, "--output", join(root, "app", "build", "icon.icns")]);

  // an .ico is a directory of images, which may be PNGs: 6 bytes, 16 per image, then the files
  const images = [16, 32, 48, 64, 256].map((size) => ({ size, png: readFileSync(sized(size)) }));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size % 256, entry); // 0 stands for 256
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  writeFileSync(join(root, "app", "build", "icon.ico"), Buffer.concat([header, ...images.map((image) => image.png)]));
  rmSync(work, { recursive: true, force: true });
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  // a shell inside an Electron app (an editor's terminal, its agent) may carry this: it would
  // make the app start as plain Node instead of as the app
  const { ELECTRON_RUN_AS_NODE: _asNode, ...appEnv } = env;
  return new Promise((done) => {
    spawn(command, args, { cwd: root, env: appEnv, stdio: "inherit" }).on("close", (code) => done(code ?? 1));
  });
}

/** The Electron this checkout installed: the package's default export is the binary's path. */
async function electron(): Promise<string> {
  return (await import("electron")).default as unknown as string;
}

/** The folder Forge packs the app into on this machine (forge.config.ts). */
const packedFolder = join(root, "release", `Lens-${process.platform}-${process.arch}`);

/** The app in it. */
function packedApp(): string {
  const app = process.platform === "darwin"
    ? join(packedFolder, "Lens.app", "Contents", "MacOS", "Lens")
    : join(packedFolder, "Lens.exe");
  if (!existsSync(app)) throw new Error("no packed app in release/: run `npm run app:dist` first");
  return app;
}

/** Runs the app through its own scripted tour (app/main/smoke.ts) on a small repository. */
async function smoke(usePacked: boolean): Promise<number> {
  const { makeViewerRepo } = await import("../test/fixtures/viewerRepo.ts");
  const repo = makeViewerRepo();
  const data = mkdtempSync(join(tmpdir(), "lens-app-data-"));
  const out = join(dist, "smoke");
  rmSync(out, { recursive: true, force: true });
  const env = { ...process.env, LENS_APP_SMOKE: repo, LENS_APP_SMOKE_OUT: out, LENS_APP_DATA: data };
  try {
    await (usePacked ? run(packedApp(), [], env) : run(await electron(), [root], env));
    const report = join(out, "report.json");
    if (!existsSync(report)) throw new Error("the app left no report: it didn't start");
    const result = JSON.parse(readFileSync(report, "utf8"));
    console.log(JSON.stringify(result, null, 2));
    console.log(`pictures of each step: ${out}`);
    return result.ok ? 0 : 1;
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  }
}

const [action, ...flags] = process.argv.slice(2);
if (action === "dev") {
  await buildApp();
  process.exit(await run(await electron(), [root]));
} else if (action === "build") {
  await buildApp();
  await packLens();
  console.log(`built ${dirname(packed)}`);
} else if (action === "dist") {
  await buildApp();
  await packLens();
  // Forge packs for the machine it runs on: forge.config.ts says what goes in
  const { api } = await import("@electron-forge/core");
  const made = await api.package({ dir: root, interactive: true });
  console.log(made.map((result) => `packed ${result.packagedPath}`).join("\n"));
} else if (action === "icons") {
  await buildIcons();
} else if (action === "smoke") {
  if (!flags.includes("--packed")) await buildApp();
  process.exit(await smoke(flags.includes("--packed")));
} else {
  console.error("usage: node scripts/app.ts dev | build | dist | smoke [--packed] | icons");
  process.exit(1);
}
