// npm run gallery: the design system's gallery (src/ui/gallery), bundled into one page at
// dist/gallery.html. Open it in a browser: every primitive of src/ui, in both code themes.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundlePage } from "../src/cli-app/render/web/bundle.ts";

const root = resolve(import.meta.dirname, "..");
const { script, css } = await bundlePage(join(root, "src", "ui", "gallery", "main.tsx"));
const page = `<!doctype html>
<html lang="en" data-appearance="dark">
<head>
<meta charset="utf-8">
<title>lens design system</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${script}</script>
</body>
</html>
`;
mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", "gallery.html");
writeFileSync(out, page);
console.log(out);
