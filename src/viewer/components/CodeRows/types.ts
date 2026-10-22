import type { ReactNode } from 'react';
import type { WordRange } from '../../wordDiff.ts';

/** What a view adds to its rows, by label ("N12" a new-side line, "O5" a removed one). */
export interface RowMarks {
  /** Extra classes per row */
  classes?: ReadonlyMap<string, string>;
  /**
   * Side by side: classes for the left half of an unchanged line, by its label (an Ask selection made
   * in the left column). The other marks show on the right half, the new code.
   */
  left?: ReadonlyMap<string, string>;
  /** Notes under a row, like review comments */
  notes?: ReadonlyMap<string, ReactNode[]>;
}

/** What every row of one plan shares. */
export interface RowContext {
  /** The file the rows are from: folds open and close by its path */
  path: string;
  /** The file's highlighted lines, as HTML */
  lines: string[];
  changedLines: ReadonlySet<number>;
  /** The changed words of each removed line that was replaced, by old-side line (wordDiff.ts) */
  removedWords?: ReadonlyMap<number, WordRange[]>;
  /** The line-number column's width */
  gutter: number;
  marks?: RowMarks;
}
