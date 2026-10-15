// bun run app:icons: the desktop app's icon files, made from src/desktop/icons/icon.png.
// Forge wants an .icns (macOS) and an .ico (Windows) ready-made. macOS only (sips and iconutil
// ship with it); the results are checked in, so this runs when the icon changes.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** The sizes an icon is drawn at: Finder and Explorer pick the nearest. */
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

if (process.platform !== "darwin") throw new Error("the icons are made on macOS (sips, iconutil)");
const icons = resolve(import.meta.dirname, "..", "src", "desktop", "icons");
const source = join(icons, "icon.png");
const work = mkdtempSync(join(tmpdir(), "lens-icons-"));
const iconset = join(work, "icon.iconset");
mkdirSync(iconset);
const sized = (size: number) => join(work, `${size}.png`);
for (const size of ICON_SIZES) execFileSync("sips", ["-z", `${size}`, `${size}`, source, "--out", sized(size)]);
// an iconset names each size, and its double-density twin
for (const size of [16, 32, 128, 256, 512]) {
  cpSync(sized(size), join(iconset, `icon_${size}x${size}.png`));
  cpSync(sized(size * 2), join(iconset, `icon_${size}x${size}@2x.png`));
}
execFileSync("iconutil", ["--convert", "icns", iconset, "--output", join(icons, "icon.icns")]);

// an .ico is a directory of images, which may be PNGs: 6 bytes, 16 per image, then the files
const images = [16, 32, 48, 64, 256].map((size) => ({ size, png: readFileSync(sized(size)) }));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, png }, index) => {
  const entry = 6 + 16 * index;
  header.writeUInt8(size % 256, entry); // 0 stands for 256
  header.writeUInt8(size % 256, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
writeFileSync(join(icons, "icon.ico"), Buffer.concat([header, ...images.map((image) => image.png)]));
rmSync(work, { recursive: true, force: true });
console.log(`made ${join(icons, "icon.icns")} and icon.ico`);
