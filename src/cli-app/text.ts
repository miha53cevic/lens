// Small text helpers the server and the viewer share. Pure: the viewer bundles this file too.

/** The text on one line, cut to `max` characters with "…". */
export function truncate(text: string, max = 60): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? collapsed.slice(0, max - 1) + '…' : collapsed;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "1 review", "3 marks": a count in a unit whose plural isn't always an "s" away. */
export function countText(unit: readonly [string, string], count: number): string {
  return count + ' ' + unit[count === 1 ? 0 : 1];
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Quotes too: the result also goes into attributes (data-id="…", title="…").
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
