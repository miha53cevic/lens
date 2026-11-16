// bun run compile: lens as one executable for this machine, at dist/lens/lens (lens.exe on
// Windows), which needs neither Bun nor node_modules to run. The desktop app's build makes it
// (forge.config.ts) and runs it instead of the sources.
//
// What the CLI reads at run time comes along inside it: lens.defaults.json and package.json
// (imported as JSON), the tree-sitter grammars (imported as files, parser.ts), the highlighter's
// worker thread (an entrypoint beside cli.ts), and the viewer, bundled here ahead of time and
// handed to bundle.ts as the module VIEWER_MODULE names. TypeScript 7's native tsc can't go inside
// (it is run, so it must be a file on disk): it is copied beside the executable (find.ts).

import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { BunPlugin } from 'bun';
import { VIEWER_MODULE, bundleViewer } from '../src/cli-app/render/web/bundle.ts';
import { BUNDLED_TSC, TSC_PACKAGE } from '../src/cli-app/lsp/find.ts';

const root = resolve(import.meta.dirname, '..');

export async function compileLens(outfile: string): Promise<void> {
  const viewer = await bundleViewer(async () => null);
  const viewerModule: BunPlugin = {
    name: 'lens-viewer-bundle',
    setup(build) {
      const filter = new RegExp(`^${VIEWER_MODULE}$`);
      build.onResolve({ filter }, () => ({ path: VIEWER_MODULE, namespace: 'lens' }));
      build.onLoad({ filter, namespace: 'lens' }, () => ({ contents: JSON.stringify(viewer), loader: 'json' }));
    },
  };
  await Bun.build({
    // the highlighter's thread is an entrypoint of its own: highlightPool.ts starts it by its path
    entrypoints: [join(root, 'src', 'cli-app', 'cli.ts'), join(root, 'src', 'cli-app', 'render', 'highlightWorker.ts')],
    compile: { outfile },
    target: 'bun',
    plugins: [viewerModule],
    throw: true,
  });
  const tsc = join(root, 'node_modules', TSC_PACKAGE);
  if (!existsSync(tsc)) throw new Error(`${TSC_PACKAGE} isn't installed: run bun install`);
  const bundled = join(dirname(outfile), BUNDLED_TSC);
  rmSync(bundled, { recursive: true, force: true });
  for (const name of ['package.json', 'lib', 'LICENSE', 'NOTICE.txt'])
    cpSync(join(tsc, name), join(bundled, name), { recursive: true });
}

if (import.meta.main) {
  const outfile = join(root, 'dist', 'lens', process.platform === 'win32' ? 'lens.exe' : 'lens');
  await compileLens(outfile);
  console.log(`compiled ${outfile}`);
}
