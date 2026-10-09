/**
 * The glob-ish pattern dialect used by config lists (exclude,
 * testFilePatterns): `*` matches within a path segment, `**` across segments
 * (`**​/` also matches no directory at all), and a pattern matches anywhere in
 * the path ("*.min.js" matches "dist/app.min.js"; "__tests__/**" matches
 * "src/__tests__/x.ts").
 */
export function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => {
    const body = pattern
      .split(/(\*\*\/|\*\*|\*)/)
      .map((part) =>
        part === "**/" ? "(?:.*/)?"
        : part === "**" ? ".*"
        : part === "*" ? "[^/]*"
        : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("");
    return new RegExp("(^|/)" + body + "$");
  });
}

export function matchesAny(path: string, regexes: RegExp[]): boolean {
  return regexes.some((r) => r.test(path));
}
