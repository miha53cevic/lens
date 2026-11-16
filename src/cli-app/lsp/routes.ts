import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodePlace, LspStatus } from '../api/contract.ts';
import { highlightSource } from '../render/highlight.ts';
import { createRouter, type Router } from '../api/router.ts';
import type { ViewerFile, ViewerInput } from '../render/web/server.ts';
import { createTsService, type TsService } from './service.ts';

// TypeScript on the viewer server, behind the `typescriptLsp` switch:
//   POST /api/lsp/hover        the declaration and doc of the name at a place
//   POST /api/lsp/definition   where that name is declared
// The server reads the files on disk, so a place is asked about only in a file whose text on disk
// is the code the viewer shows: anything else is answered `unavailable`, never with another
// file's types.

const NO_TSC = "lens's TypeScript 7 isn't installed (run `bun install` in lens's checkout)";

function parsePlace(body: unknown): CodePlace | { error: string } {
  const { file, line, character } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof file !== 'string' || !file) return { error: 'name the file' };
  if (!Number.isInteger(line) || (line as number) < 1) return { error: 'line must be a line number' };
  if (!Number.isInteger(character) || (character as number) < 0) return { error: 'character must be 0 or more' };
  return { file, line: line as number, character: character as number };
}

export interface LspRoutes {
  router: Router;
  /**
   * The TypeScript server for the status bar (/api/stamp); null while the switch is off. While it's
   * on, the server is started here, so it's warm by the first hover and the bar has something true to say.
   */
  status(): LspStatus | null;
  /** Ends the TypeScript server, when one was started */
  stop(): void;
}

/** `themeOf` picks the theme a hover's code is highlighted in, from the request's `?theme=` */
export function createLspRoutes(current: () => ViewerInput, themeOf: (url: URL) => string): LspRoutes {
  // made on the first need; null once no TypeScript 7 is found for the root
  let service: TsService | null | undefined;
  const ensure = () => {
    if (service === undefined) {
      const input = current();
      service = createTsService(input.root, input.cwd);
    }
    return service;
  };

  /** The file to ask about, with TypeScript's service, or why it can't be asked */
  const ask = (place: CodePlace): { file: ViewerFile; ts: TsService } | string => {
    const input = current();
    if (!input.typescriptLsp) return 'TypeScript is off: Settings → Feature flags';
    const file = input.files.find((shown) => shown.file === place.file);
    if (!file || !file.language) return 'not a TypeScript or JavaScript file of this review';
    let onDisk: string | null;
    try {
      onDisk = readFileSync(join(input.cwd, file.file), 'utf8');
    } catch {
      onDisk = null;
    }
    if (onDisk !== file.source) return "the file on disk isn't the code shown (another branch, or changed since: ↻)";
    const ts = ensure();
    return ts ? { file, ts } : NO_TSC;
  };

  const router = createRouter()
    .json('POST /api/lsp/hover', parsePlace, async (place, { url }) => {
      const asked = ask(place);
      if (typeof asked === 'string') return { hover: null, tokens: null, unavailable: asked };
      try {
        const hover = await asked.ts.hover(place, asked.file.language!, asked.file.source);
        // TypeScript prints a declaration as TypeScript, whatever the file's language
        const tokens = hover?.code ? (await highlightSource(hover.code, 'typescript', themeOf(url))).tokens : null;
        return { hover, tokens, unavailable: null };
      } catch (error) {
        return { hover: null, tokens: null, unavailable: (error as Error).message };
      }
    })
    .json('POST /api/lsp/definition', parsePlace, async (place) => {
      const asked = ask(place);
      if (typeof asked === 'string') return { places: [], unavailable: asked };
      try {
        return { places: await asked.ts.definition(place, asked.file.language!, asked.file.source), unavailable: null };
      } catch (error) {
        return { places: [], unavailable: (error as Error).message };
      }
    });

  const status = (): LspStatus | null => {
    if (!current().typescriptLsp) return null;
    const ts = ensure();
    if (!ts) return { state: 'missing', version: null };
    if (ts.state() === 'stopped' && !started) ts.start();
    started = true;
    return { state: ts.state(), version: ts.tsc.version };
  };
  // the bar's first ask starts it; one that stops after is left stopped until the next question
  let started = false;

  return { router, status, stop: () => service?.stop() };
}
