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
}

/**
 * Every match in the loaded files (up to SEARCH_LIMIT); "hide tests" leaves the test files out.
 * Memoized: ↑ / ↓ re-render the palette without searching again.
 */
export const findHits = memo(
  (query: string, word: boolean, matchCase: boolean, files: ViewerPayload['files'], hideTests: boolean) => {
    const hits: SearchHit[] = [];
    if (query.trim().length < 2) return hits;
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
          hits.push({ fileIndex, line: lineIndex + 1, column: match.index, length: match[0].length });
          if (hits.length >= SEARCH_LIMIT) return hits;
        }
      }
    }
    return hits;
  },
);
