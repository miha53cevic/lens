import { parseSource, languageForFile } from "../parse/parser.ts";
import { classify } from "./typescript.ts";
import type { FileFoldModel, LensConfig } from "../model.ts";

export async function analyzeSource(
  file: string,
  source: string,
  config: LensConfig,
): Promise<FileFoldModel | null> {
  const language = languageForFile(file);
  if (!language) return null;
  const tree = await parseSource(source, language);
  try {
    const regions = classify(tree.rootNode, source, config);
    return {
      file,
      language,
      lineCount: source.split("\n").length,
      regions,
    };
  } finally {
    tree.delete();
  }
}
