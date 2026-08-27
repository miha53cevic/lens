import { createRequire } from "node:module";
import { extname } from "node:path";
import type {
  Parser as ParserType,
  Language as LanguageType,
  Tree,
} from "@vscode/tree-sitter-wasm";
import type { LanguageId } from "../model.ts";

// The package is a UMD/CJS bundle; require() is the reliable way to load it from ESM.
const require = createRequire(import.meta.url);
const { Parser, Language } = require("@vscode/tree-sitter-wasm") as {
  Parser: typeof ParserType;
  Language: typeof LanguageType;
};

let initialized = false;
const languages = new Map<LanguageId, LanguageType>();

const EXTENSION_LANGUAGE: Record<string, LanguageId> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".jsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
};

export function languageForFile(file: string): LanguageId | null {
  return EXTENSION_LANGUAGE[extname(file).toLowerCase()] ?? null;
}

export async function parseSource(source: string, lang: LanguageId): Promise<Tree> {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
  let language = languages.get(lang);
  if (!language) {
    const wasmPath = require.resolve(`@vscode/tree-sitter-wasm/wasm/tree-sitter-${lang}.wasm`);
    language = await Language.load(wasmPath);
    languages.set(lang, language);
  }
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  parser.delete();
  if (!tree) throw new Error(`tree-sitter failed to parse (${lang})`);
  return tree;
}
