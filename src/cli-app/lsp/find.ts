import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Which TypeScript language server lens runs: always its own TypeScript 7's native `tsc --lsp`, never
// the reviewed repository's, so a repository on TypeScript 5 (or none) gets the same one. It still
// reads the repository's tsconfig. The compiled lens carries it beside itself (scripts/compile.ts);
// from the checkout it is in lens's node_modules.

/** The package holding TypeScript 7's native `tsc` and its lib files, for this machine */
export const TSC_PACKAGE = `@typescript/typescript-${process.platform}-${process.arch}`;
/** The folder beside the compiled lens that holds its copy of TSC_PACKAGE */
export const BUNDLED_TSC = 'typescript';

/** TypeScript 7's native `tsc` and its version */
export interface FoundTsc {
  exe: string;
  version: string;
}

/** `tsc` of a TSC_PACKAGE at `dir`, or null when there is none */
function nativeTsc(dir: string): FoundTsc | null {
  const exe = join(dir, 'lib', process.platform === 'win32' ? 'tsc.exe' : 'tsc');
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: unknown };
    if (typeof pkg.version !== 'string' || !existsSync(exe)) return null;
    return { exe, version: pkg.version };
  } catch {
    return null;
  }
}

/** lens's own TypeScript 7: the compiled lens's copy, else the checkout's */
export function findTsc(): FoundTsc | null {
  return (
    nativeTsc(join(dirname(process.execPath), BUNDLED_TSC)) ??
    nativeTsc(fileURLToPath(new URL(`../../../node_modules/${TSC_PACKAGE}`, import.meta.url)))
  );
}
