// A theme's workbench colors, as VS Code takes them, and the CSS properties the page reads them from
// (tokens.css). Shared by the server's first paint, the viewer and the app's pages, so no Shiki here.

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

/**
 * The chrome's tokens a theme paints, and the VS Code key each is read from. tokens.css reads each as
 * `--<token>-src`, its own mix where that's unset.
 */
export const CHROME_KEYS = {
  bg: 'sideBar.background',
  raised: 'editorWidget.background',
  'selected-bg': 'list.activeSelectionBackground',
  'hover-bg': 'list.hoverBackground',
  shadow: 'widget.shadow',
  line: 'panel.border',
  muted: 'descriptionForeground',
  focus: 'focusBorder',
  danger: 'editorError.foreground',
  risk: 'editorWarning.foreground',
  mod: 'gitDecoration.modifiedResourceForeground',
} as const;

export type ChromeToken = keyof typeof CHROME_KEYS;

/** The theme's colors for the chrome as `#rrggbbaa`; null where it sets none, or one lens can't use (`themeChromeColors`). */
export type ChromeColors = Record<ChromeToken, string | null>;

/** Each CSS property and its value; null: the property is unset and tokens.css's mix rules. */
export function chromeColorProperties(chrome: ChromeColors | null): [string, string | null][] {
  return (Object.keys(CHROME_KEYS) as ChromeToken[]).map((token) => [`--${token}-src`, chrome?.[token] ?? null]);
}
