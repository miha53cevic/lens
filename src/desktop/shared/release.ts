// Where lens is published (main process and pages alike): its source (the About panel names it, as the AGPL asks of every copy) and
// the releases the app updates from. install.sh names the same repository and asset.

export const REPOSITORY = 'miha53cevic/lens';
export const SOURCE_URL = `https://github.com/${REPOSITORY}`;
/** The macOS app, zipped, as .github/workflows/macos-app.yml attaches it to each release */
export const APP_ASSET = 'Lens-darwin-arm64.zip';
/** The README's one-line install: it also updates an app the app itself can't replace */
export const INSTALL_COMMAND = `curl -fsSL https://raw.githubusercontent.com/${REPOSITORY}/main/install.sh | sh`;

/** A release's page on GitHub, its notes; null for anything but x.y.z, so no other address is ever built. */
export function releaseUrl(version: string): string | null {
  return /^\d+\.\d+\.\d+$/.test(version) ? `${SOURCE_URL}/releases/tag/v${version}` : null;
}

/** More than any release's notes: a body past it is cut, not shown whole */
const MAX_NOTES = 20_000;

/**
 * Release notes as release-please writes them (a GitHub release's body, or a CHANGELOG section),
 * made for reading in the app: without the version's own heading (the page names it) and the commit
 * links after each line. Markdown still; empty when nothing is left.
 */
export function cleanNotes(markdown: string): string {
  return markdown
    .slice(0, MAX_NOTES)
    .split(/\r?\n/)
    .filter((line) => !/^##? \[?v?\d+\.\d+\.\d+/.test(line))
    .join('\n')
    .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)\s]*\)\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One version's section of CHANGELOG.md, cleaned; null when it has none. */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split(/\r?\n/);
  const heading = (line: string) => /^## \[?v?(\d+\.\d+\.\d+)/.exec(line)?.[1] ?? null;
  const start = lines.findIndex((line) => heading(line) === version);
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && heading(line) !== null);
  return cleanNotes(lines.slice(start + 1, end < 0 ? undefined : end).join('\n')) || null;
}
