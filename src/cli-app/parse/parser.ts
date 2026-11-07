/// <reference path="./wasm.d.ts" />
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { Parser, Language, type Tree } from '@vscode/tree-sitter-wasm';
// Imported as files, so the compiled `lens` carries tree-sitter and the three grammars lens
// parses with, and none of the dozen others the package ships.
import coreWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter.wasm' with { type: 'file' };
import typescriptWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm' with { type: 'file' };
import tsxWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-tsx.wasm' with { type: 'file' };
import javascriptWasm from '@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm' with { type: 'file' };
import type { LanguageId } from '../model.ts';

const GRAMMARS: Record<LanguageId, string> = {
  typescript: typescriptWasm,
  tsx: tsxWasm,
  javascript: javascriptWasm,
};

let initialized = false;
const languages = new Map<LanguageId, Language>();

const EXTENSION_LANGUAGE: Record<string, LanguageId> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.jsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
};

export function languageForFile(file: string): LanguageId | null {
  return EXTENSION_LANGUAGE[extname(file).toLowerCase()] ?? null;
}

/**
 * Trees parsed during one analysis, by language and text: the fold rules and the summary's units
 * read the same new side of each file. Each hit is a copy (cheap: copies share their nodes), which
 * the caller deletes as it would a tree of its own; `dropParses` deletes the kept ones.
 */
export type ParseCache = Map<string, Tree>;

export function dropParses(cache: ParseCache): void {
  for (const tree of cache.values()) tree.delete();
  cache.clear();
}

export async function parseSource(source: string, lang: LanguageId, cache?: ParseCache): Promise<Tree> {
  const key = lang + '\0' + source;
  const kept = cache?.get(key);
  if (kept) return kept.copy();
  if (!initialized) {
    await Parser.init({ locateFile: () => coreWasm });
    initialized = true;
  }
  let language = languages.get(lang);
  if (!language) {
    language = await Language.load(readFileSync(GRAMMARS[lang]));
    languages.set(lang, language);
  }
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  parser.delete();
  if (!tree) throw new Error(`tree-sitter failed to parse (${lang})`);
  cache?.set(key, tree.copy());
  return tree;
}
