// A theme's diff colors, as VS Code's diff editor takes them, and the CSS properties the page reads
// them from (tokens.css). Shared by the server's first paint and the viewer, so no Shiki here.

/** The theme's `diffEditor.*` colors as `#rrggbbaa`, alpha kept; null where it sets none (VS Code's default shows). */
export interface DiffColors {
  /** Over a whole added line, and over a replaced line's changed words */
  addText: string | null;
  delText: string | null;
  /** Under every added (removed) row */
  addLine: string | null;
  delLine: string | null;
}

/** Each CSS property and its value; null: the property is unset and tokens.css's default rules. */
export function diffColorProperties(diff: DiffColors | null): [string, string | null][] {
  return [
    ['--diff-add-text-src', diff?.addText ?? null],
    ['--diff-del-text-src', diff?.delText ?? null],
    ['--diff-add-line-src', diff?.addLine ?? null],
    ['--diff-del-line-src', diff?.delLine ?? null],
  ];
}
