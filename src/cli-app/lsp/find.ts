import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Which TypeScript language server lens runs: TypeScript 7's native `tsc --lsp`. The reviewed
// repository's own install comes first, so its code is read with the TypeScript it is built with;
// else the one in lens's own checkout. The compiled lens carries none: there, only the repository's.

/** A TypeScript 7 found: its native `tsc`, its version, and whose install it is */
export interface FoundTsc {
  exe: string;
  version: string;
  source: 'repository' | 'lens';
}

/** `tsc` of a TypeScript 7 install whose package is at `dir`, or null when it isn't one */
function nativeTsc(dir: string, source: FoundTsc['source']): FoundTsc | null {
  let version: string;
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: unknown };
    if (typeof pkg.version !== 'string' || Number(pkg.version.split('.')[0]) < 7) return null;
    version = pkg.version;
  } catch {
    return null;
  }
  // the native binary is in a package of its own per platform, next to `typescript` (lib/getExePath.js)
  const exe = join(
    dirname(dir),
    '@typescript',
    `typescript-${process.platform}-${process.arch}`,
    'lib',
    process.platform === 'win32' ? 'tsc.exe' : 'tsc',
  );
  return existsSync(exe) ? { exe, version, source } : null;
}

/** The repository's TypeScript 7 (its node_modules, or a folder above: a workspace hoists it), else lens's own. */
export function findTsc(root: string): FoundTsc | null {
  for (let dir = root; ; dir = dirname(dir)) {
    const found = nativeTsc(join(dir, 'node_modules', 'typescript'), 'repository');
    if (found) return found;
    if (dirname(dir) === dir) break;
  }
  const own = fileURLToPath(new URL('../../../node_modules/typescript', import.meta.url));
  return nativeTsc(own, 'lens');
}
