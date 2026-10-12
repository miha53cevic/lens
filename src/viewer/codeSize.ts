// The code's size: what the reader can set it to, and the cookie that keeps it.

/** In px. The steps widen as the sizes grow. */
export const CODE_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

/** The same as --text-code in ui/styles/tokens.css (test/tokens.test.ts holds them together). */
export const CODE_SIZE_DEFAULT = 12;

/**
 * A cookie rather than localStorage, which is per port: the desktop app gives each repository
 * its own, and a reader who needs larger code needs it in all of them.
 */
export const CODE_SIZE_COOKIE = 'lens-code-size';

/** The size a step away, staying within the sizes. */
export function steppedSize(size: number, delta: number): number {
  const sizeIndex = CODE_SIZES.indexOf(size);
  if (sizeIndex < 0) return CODE_SIZE_DEFAULT;
  return CODE_SIZES[Math.max(0, Math.min(CODE_SIZES.length - 1, sizeIndex + delta))];
}

/** The size a cookie header holds, or the default when it holds none of the sizes. */
export function savedCodeSize(cookies: string): number {
  const match = new RegExp('(?:^|; *)' + CODE_SIZE_COOKIE + '=([0-9.]+)').exec(cookies);
  const size = match ? Number(match[1]) : CODE_SIZE_DEFAULT;
  return CODE_SIZES.includes(size) ? size : CODE_SIZE_DEFAULT;
}
