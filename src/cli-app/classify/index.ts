import { parseSource, languageForFile, type ParseCache } from '../parse/parser.ts';
import { classify } from './typescript.ts';
import { declarationsOf } from '../parse/declarations.ts';
import type { FileFoldModel, LensConfig } from '../model.ts';

export async function analyzeSource(
  file: string,
  source: string,
  config: LensConfig,
  parses?: ParseCache,
): Promise<FileFoldModel | null> {
  const language = languageForFile(file);
  if (!language) return null;
  const tree = await parseSource(source, language, parses);
  try {
    // Tree-sitter recovers from syntax errors with ERROR nodes the rules
    // could misread — a broken file is shown in full instead.
    const parseError = tree.rootNode.hasError;
    return {
      file,
      language,
      lineCount: source.split('\n').length,
      regions: parseError ? [] : classify(tree.rootNode, source, config),
      ...(parseError ? { parseError } : { declarations: declarationsOf(tree.rootNode) }),
    };
  } finally {
    tree.delete();
  }
}
