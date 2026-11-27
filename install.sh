#!/bin/sh
# Installs (or updates) the lens macOS app from its latest GitHub release:
#
#   curl -fsSL https://raw.githubusercontent.com/miha53cevic/lens/main/install.sh | sh
#
# Nothing here asks for the quarantine flag (only browsers and the like set it), so the unsigned app
# opens without Gatekeeper's prompt and without `xattr`. The app's own updater (src/desktop/main/update.ts)
# takes the same steps. Never sudo: an /Applications it can't write to means ~/Applications.
#
# LENS_INSTALL_URL and LENS_INSTALL_DIR replace the download and the folder (test/install.test.ts).

set -eu

URL="${LENS_INSTALL_URL:-https://github.com/miha53cevic/lens/releases/latest/download/Lens-darwin-arm64.zip}"

fail() {
  echo "lens: $1" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] || fail "the lens app is macOS-only for now"
[ "$(uname -m)" = arm64 ] || fail "the lens app needs Apple silicon (arm64)"

if [ -n "${LENS_INSTALL_DIR:-}" ]; then
  DEST="$LENS_INSTALL_DIR"
elif [ -w /Applications ]; then
  DEST=/Applications
else
  DEST="$HOME/Applications"
fi
mkdir -p "$DEST"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading lens…"
curl -fL --progress-bar "$URL" -o "$TMP/lens.zip" || fail "couldn't download $URL"
ditto -x -k "$TMP/lens.zip" "$TMP/new" || fail "couldn't unpack the download"
[ -f "$TMP/new/Lens.app/Contents/Info.plist" ] || fail "the download has no Lens.app"
VERSION=$(defaults read "$TMP/new/Lens.app/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo "?")

# an open copy of this very app is quit first, so it isn't replaced under itself
if pgrep -f "$DEST/Lens.app/Contents/MacOS/" >/dev/null 2>&1; then
  echo "Quitting the open Lens…"
  osascript -e 'quit app "Lens"' >/dev/null 2>&1 || true
  while pgrep -f "$DEST/Lens.app/Contents/MacOS/" >/dev/null 2>&1; do sleep 1; done
fi

# the old app moves aside until the new one is in place, and comes back if that fails
if [ -e "$DEST/Lens.app" ]; then
  mv "$DEST/Lens.app" "$TMP/old.app" || fail "couldn't move the old $DEST/Lens.app aside"
fi
if ! mv "$TMP/new/Lens.app" "$DEST/Lens.app"; then
  [ -e "$TMP/old.app" ] && mv "$TMP/old.app" "$DEST/Lens.app"
  fail "couldn't put Lens.app in $DEST"
fi

echo "lens $VERSION is in $DEST/Lens.app."
echo "Open it, then App (the plug in the tab strip) installs the lens command and the agent skills."
