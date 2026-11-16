import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CodePlace, HoverInfo } from '../api/contract.ts';
import type { LanguageId } from '../model.ts';
import { relPath } from '../paths.ts';
import { startLsp, type LspClient, type LspPosition, type LspRange } from './client.ts';
import { findTsc, type FoundTsc } from './find.ts';

// What the viewer's hover and click ask of TypeScript, for one repository: the server is started on
// the first question (or `start`), and again after one that stopped. It reads the files on disk, so it answers
// only about a file whose text on disk is the text the viewer shows (routes.ts checks that).

const LANGUAGE_IDS: Record<LanguageId, string> = {
  typescript: 'typescript',
  tsx: 'typescriptreact',
  javascript: 'javascript',
};

export interface TsService {
  hover(place: CodePlace, language: LanguageId, text: string): Promise<HoverInfo | null>;
  /** Where the name at `place` is declared; a place outside `cwd` keeps its absolute path */
  definition(place: CodePlace, language: LanguageId, text: string): Promise<CodePlace[]>;
  /** Starts the server ahead of the first question */
  start(): void;
  state(): 'starting' | 'running' | 'stopped';
  tsc: FoundTsc;
  stop(): void;
}

/** null when lens's own TypeScript 7 isn't installed (find.ts) */
export function createTsService(root: string, cwd: string): TsService | null {
  const tsc = findTsc();
  if (!tsc) return null;
  let client: Promise<LspClient> | null = null;
  let started: LspClient | null = null;
  let failed = false;

  // one that failed to start, or stopped since, is started again on the next question
  const ready = (): Promise<LspClient> => {
    client ??= startLsp(tsc.exe, ['--lsp', '--stdio'], root).then(
      (lsp) => {
        started = lsp;
        failed = false;
        return lsp;
      },
      (error: unknown) => {
        client = null;
        failed = true;
        throw error;
      },
    );
    return client.then((lsp) => {
      if (lsp.alive()) return lsp;
      client = null;
      started = null;
      return ready();
    });
  };

  const at = async (place: CodePlace, language: LanguageId, text: string) => {
    const lsp = await ready();
    const path = join(cwd, place.file);
    lsp.sync(path, LANGUAGE_IDS[language], text);
    const position: LspPosition = { line: place.line - 1, character: place.character };
    return { lsp, params: { textDocument: { uri: pathToFileURL(path).href }, position } };
  };

  return {
    async hover(place, language, text) {
      const { lsp, params } = await at(place, language, text);
      return hoverInfo(await lsp.request('textDocument/hover', params));
    },
    async definition(place, language, text) {
      const { lsp, params } = await at(place, language, text);
      return locations(await lsp.request('textDocument/definition', params)).map((location) => {
        const path = fileURLToPath(location.uri);
        const file = relPath(cwd, path);
        return {
          file: file.startsWith('../') ? path : file,
          line: location.range.start.line + 1,
          character: location.range.start.character,
        };
      });
    },
    start() {
      ready().catch(() => {});
    },
    state() {
      if (started?.alive()) return 'running';
      return client && !started && !failed ? 'starting' : 'stopped';
    },
    tsc,
    stop() {
      void client?.then((lsp) => lsp.stop()).catch(() => {});
      client = null;
      started = null;
    },
  };
}

/** A hover's contents split into the declaration's code and its doc: TypeScript sends one markdown string */
export function hoverInfo(result: unknown): HoverInfo | null {
  const contents = (result as { contents?: unknown } | null)?.contents;
  const parts = (Array.isArray(contents) ? contents : [contents]).map((part) =>
    typeof part === 'string'
      ? part
      : typeof (part as { value?: unknown })?.value === 'string'
        ? (part as { value: string }).value
        : '',
  );
  const markdown = parts.join('\n\n').trim();
  if (!markdown) return null;
  const fence = /^```[\w-]*\n([\s\S]*?)\n```\s*/.exec(markdown);
  if (!fence) return { code: '', doc: markdown };
  return { code: fence[1], doc: markdown.slice(fence[0].length).trim() };
}

/** Location | Location[] | LocationLink[], as one list */
function locations(result: unknown): { uri: string; range: LspRange }[] {
  const list = Array.isArray(result) ? result : result ? [result] : [];
  return list.flatMap((item) => {
    const entry = item as { uri?: string; range?: LspRange; targetUri?: string; targetSelectionRange?: LspRange };
    if (entry.targetUri && entry.targetSelectionRange)
      return [{ uri: entry.targetUri, range: entry.targetSelectionRange }];
    if (entry.uri && entry.range) return [{ uri: entry.uri, range: entry.range }];
    return [];
  });
}
