import type { DeclarationKind } from '../../../../../model.ts';
import type { ViewerPayload } from '../../../server.ts';
import { isTestFile, memo, sourceLines } from '../../shared.ts';
import { escapeRegExp } from '../../../../../text.ts';

export const SEARCH_LIMIT = 500;

export interface SearchHit {
  fileIndex: number;
  /** 1-based */
  line: number;
  column: number;
  length: number;
  /** A place the name is declared ("defined at"), not a usage */
  declares?: DeclarationKind;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Every match in the loaded files (up to SEARCH_LIMIT), after the places an identifier query is
 * declared (by name: `declarations` from the server); "hide tests" leaves the test files out.
 * Memoized: ↑ / ↓ re-render the palette without searching again.
 */
export const findHits = memo(
  (query: string, word: boolean, matchCase: boolean, files: ViewerPayload['files'], hideTests: boolean) => {
    const hits: SearchHit[] = [];
    if (query.trim().length < 2) return hits;
    const definitions = findDefinitions(query.trim(), matchCase, files, hideTests);
    hits.push(...definitions);
    const declared = new Set(definitions.map((hit) => hit.fileIndex + ':' + hit.line));
    let pattern = escapeRegExp(query);
    // not \b: identifiers can start or end with $ ($scope, el$)
    if (word) pattern = '(?<![\\w$])' + pattern + '(?![\\w$])';
    const matcher = new RegExp(pattern, matchCase ? 'g' : 'gi');
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (hideTests && isTestFile(files[fileIndex].file)) continue;
      const lines = sourceLines(files[fileIndex]);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        matcher.lastIndex = 0;
        let match;
        while ((match = matcher.exec(lines[lineIndex])) !== null) {
          if (match[0].length === 0) break;
          if (declared.has(fileIndex + ':' + (lineIndex + 1))) continue; // listed above, as a definition
          hits.push({ fileIndex, line: lineIndex + 1, column: match.index, length: match[0].length });
          if (hits.length >= SEARCH_LIMIT) return hits;
        }
      }
    }
    return hits;
  },
);

/** Where the files declare `name`, as hits on the name. */
function findDefinitions(
  name: string,
  matchCase: boolean,
  files: ViewerPayload['files'],
  hideTests: boolean,
): SearchHit[] {
  if (!IDENTIFIER.test(name)) return [];
  const wanted = matchCase ? name : name.toLowerCase();
  const hits: SearchHit[] = [];
  files.forEach((file, fileIndex) => {
    if (hideTests && isTestFile(file.file)) return;
    for (const declaration of file.declarations ?? []) {
      if ((matchCase ? declaration.name : declaration.name.toLowerCase()) !== wanted) continue;
      const text = sourceLines(file)[declaration.line - 1] ?? '';
      const column = new RegExp('(?<![\\w$])' + escapeRegExp(declaration.name) + '(?![\\w$])').exec(text)?.index ?? 0;
      hits.push({
        fileIndex,
        line: declaration.line,
        column,
        length: declaration.name.length,
        declares: declaration.kind,
      });
    }
  });
  return hits;
}
