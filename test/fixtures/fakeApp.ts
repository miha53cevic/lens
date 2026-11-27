// A Lens.app with nothing in it but its Info.plist, zipped as the release workflow zips the real one
// (ditto, the app at the archive's top). For install.sh and the app's updater. macOS only (ditto).

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Writes `<dir>/Lens-<version>.zip` and gives its path. */
export function fakeAppZip(dir: string, version: string): string {
  const stage = join(dir, 'stage-' + version);
  const contents = join(stage, 'Lens.app', 'Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  writeFileSync(
    join(contents, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Lens</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
</dict></plist>
`,
  );
  const zip = join(dir, `Lens-${version}.zip`);
  execFileSync('ditto', ['-c', '-k', '--keepParent', join(stage, 'Lens.app'), zip]);
  return zip;
}
