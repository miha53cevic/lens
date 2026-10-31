// bun run app:smoke [-- --packed]: runs the desktop app through its own scripted tour
// (src/desktop/main/smoke.ts) on a small repository, and reports what the tour found.
// Twice, on the same data: the second run checks that the app reopens as the first left it.
// From the checkout by default, as `electron-forge start` runs it; --packed tours the app
// `bun run app:dist` made. It opens the app's window on screen.

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { api } from '@electron-forge/core';
import { makeViewerRepo } from '../test/fixtures/viewerRepo.ts';

const root = resolve(import.meta.dirname, '..');
/** The folder Forge packs the app into on this machine (forge.config.ts). */
const packedFolder = join(root, 'release', `Lens-${process.platform}-${process.arch}`);

function packedApp(): string {
  const app =
    process.platform === 'darwin'
      ? join(packedFolder, 'Lens.app', 'Contents', 'MacOS', 'Lens')
      : join(packedFolder, 'Lens.exe');
  if (!existsSync(app)) throw new Error('no packed app in release/: run `bun run app:dist` first');
  return app;
}

const usePacked = process.argv.includes('--packed');
const repo = makeViewerRepo();
const data = mkdtempSync(join(tmpdir(), 'lens-app-data-'));
const out = join(root, 'dist', 'smoke');
// The runs write here: each start bundles the app into dist/ afresh, which would take the first
// run's pictures with it. They are copied to dist/smoke at the end.
const shots = mkdtempSync(join(tmpdir(), 'lens-app-smoke-'));
// how the app knows it is on the tour, and where its pictures and its own data go
Object.assign(process.env, { LENS_APP_SMOKE: repo, LENS_APP_SMOKE_OUT: shots, LENS_APP_DATA: data });
// a shell inside an Electron app (an editor's terminal, its agent) may carry this: it would make
// the packed app start as plain Node instead of as the app (Forge's start drops it itself)
delete process.env.ELECTRON_RUN_AS_NODE;

/** Runs the app to its end and returns what it reported. */
async function tour(reportName: string): Promise<{ ok: boolean }> {
  const app = usePacked
    ? spawn(packedApp(), [], { cwd: root, stdio: 'inherit' })
    : await api.start({ dir: root, interactive: false });
  await new Promise((done) => app.on('close', done));
  const report = join(shots, reportName);
  if (!existsSync(report)) throw new Error("the app left no report: it didn't start");
  const result = JSON.parse(readFileSync(report, 'utf8'));
  console.log(JSON.stringify(result, null, 2));
  return result;
}

let ok = false;
try {
  ok = (await tour('report.json')).ok;
  if (ok) {
    process.env.LENS_APP_SMOKE_PHASE = 'reopen';
    ok = (await tour('reopen.json')).ok;
  }
} finally {
  rmSync(out, { recursive: true, force: true });
  cpSync(shots, out, { recursive: true });
  console.log(`pictures of each step: ${out}`);
  rmSync(shots, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
