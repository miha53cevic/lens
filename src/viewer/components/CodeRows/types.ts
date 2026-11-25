import type { ReactNode } from 'react';

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
  /** The removed lines, highlighted as HTML (with word diff's marks), by old-side line */
  removed: ReadonlyMap<number, string>;
  /**
   * Lines word diff paired with the line they replaced (new side, and old side by old line): their row
   * takes only the diff's line color, their changed words the stronger one. Absent: every change is whole
   */
  replaced?: { lines: ReadonlySet<number>; old: ReadonlySet<number> };
  /** The line-number column's width */
  gutter: number;
  marks?: RowMarks;
}
