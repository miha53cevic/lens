#!/bin/sh
# Installs or updates the lens macOS app:
#
#   curl -fsSL https://raw.githubusercontent.com/miha53cevic/lens/main/install.sh | sh
#
# What it does:
#   1. Picks /Applications, or ~/Applications if /Applications isn't writable.
#   2. Downloads Lens.app from the latest GitHub release of miha53cevic/lens and unpacks it
#      in a temporary folder, deleted when the script ends.
#   3. Quits Lens if it's open.
#   4. Moves the new Lens.app into the folder. An older one there is replaced, and put back
#      if the move fails.
#
# What it doesn't do: use sudo, touch anything outside those two folders, or run the app.
#
# LENS_INSTALL_URL and LENS_INSTALL_DIR override the download and the folder (used by the tests).

set -eu

URL="${LENS_INSTALL_URL:-https://github.com/miha53cevic/lens/releases/latest/download/Lens-darwin-arm64.zip}"

fail() {
  echo "lens: $1" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] || fail "the lens app is macOS-only for now"
[ "$(uname -m)" = arm64 ] || fail "the lens app needs Apple silicon (arm64)"

# 1. Pick the folder
if [ -n "${LENS_INSTALL_DIR:-}" ]; then
  DEST="$LENS_INSTALL_DIR"
elif [ -w /Applications ]; then
  DEST=/Applications
else
  DEST="$HOME/Applications"
fi
mkdir -p "$DEST"

# 2. Download and unpack into a temporary folder
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading lens…"
curl -fL --progress-bar "$URL" -o "$TMP/lens.zip" || fail "couldn't download $URL"
ditto -x -k "$TMP/lens.zip" "$TMP/new" || fail "couldn't unpack the download"
[ -f "$TMP/new/Lens.app/Contents/Info.plist" ] || fail "the download has no Lens.app"
VERSION=$(defaults read "$TMP/new/Lens.app/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo "?")

# 3. Quit Lens if it's open, so it isn't replaced while running
if pgrep -f "$DEST/Lens.app/Contents/MacOS/" >/dev/null 2>&1; then
  echo "Quitting the open Lens…"
  osascript -e 'quit app "Lens"' >/dev/null 2>&1 || true
  while pgrep -f "$DEST/Lens.app/Contents/MacOS/" >/dev/null 2>&1; do sleep 1; done
fi

# 4. Replace the old app; put it back if that fails
if [ -e "$DEST/Lens.app" ]; then
  mv "$DEST/Lens.app" "$TMP/old.app" || fail "couldn't move the old $DEST/Lens.app aside"
fi
if ! mv "$TMP/new/Lens.app" "$DEST/Lens.app"; then
  [ -e "$TMP/old.app" ] && mv "$TMP/old.app" "$DEST/Lens.app"
  fail "couldn't put Lens.app in $DEST"
fi

echo "lens $VERSION is in $DEST/Lens.app."
echo "Open it, then App (the plug in the tab strip) installs the lens command and the agent skills."
