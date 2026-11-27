// Where lens is published (main process and pages alike): its source (the About panel names it, as the AGPL asks of every copy) and
// the releases the app updates from. install.sh names the same repository and asset.

export const REPOSITORY = 'miha53cevic/lens';
export const SOURCE_URL = `https://github.com/${REPOSITORY}`;
/** The macOS app, zipped, as .github/workflows/macos-app.yml attaches it to each release */
export const APP_ASSET = 'Lens-darwin-arm64.zip';
/** The README's one-line install: it also updates an app the app itself can't replace */
export const INSTALL_COMMAND = `curl -fsSL https://raw.githubusercontent.com/${REPOSITORY}/main/install.sh | sh`;
