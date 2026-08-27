/**
 * The glob-ish pattern dialect used by config lists (exclude,
 * testFilePatterns): `*` matches within a path segment, `**` across segments,
 * and a pattern matches anywhere in the path ("*.min.js" matches
 * "dist/app.min.js"; "__tests__/**" matches "src/__tests__/x.ts").
 */
export function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const body = escaped
      .split("**")
      .map((part) => part.replaceAll("*", "[^/]*"))
      .join(".*");
    return new RegExp("(^|/)" + body + "$");
  });
}

export function matchesAny(path: string, regexes: RegExp[]): boolean {
  return regexes.some((r) => r.test(path));
}
