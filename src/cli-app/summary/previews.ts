import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ASSETS_DIR, bundleDir, type StoredSummary } from "./store.ts";

// A preview is HTML the agent wrote: a sketch of a screen the change affects, in the reviewed
// project's own design system. lens checks it on submit, keeps it by content hash, and serves it
// alone in a sandboxed frame: no script but lens's own, no request out, no way back to /api.

/** The biggest preview file lens keeps */
export const PREVIEW_MAX_BYTES = 300_000;

export const CHANGE_MARKS = ["added", "changed", "removed"] as const;

/** An accepted preview file's name in the assets folder */
const ASSET_NAME = /^[0-9a-f]{16}\.html$/;

/** What a preview may not hold, each with the reason the agent gets */
const FORBIDDEN: [RegExp, string][] = [
  [/<script\b/i, "has a <script>: previews are static, lens adds the only script"],
  [/<(iframe|frame|object|embed|portal)\b/i, "embeds another document"],
  [/<(link|base)\b/i, "has a <link> or <base>: inline the CSS it needs"],
  [/<meta\b[^>]*http-equiv/i, "has a <meta http-equiv>"],
  [/<form\b/i, "has a <form>: draw the fields without one"],
  [/<[^>]*\son[a-z]+\s*=/i, "has an inline event handler (on…=)"],
  [/javascript:/i, "has a javascript: URL"],
  [/@import\b/i, "has a CSS @import: inline the CSS it needs"],
];

/** src / href / srcset / poster / action values, and CSS url()s: only data: and #fragments may stay */
const URL_ATTRIBUTE = /\s(?:src|href|srcset|poster|action|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;

function external(value: string): boolean {
  const v = value.trim();
  return v !== "" && !v.startsWith("#") && !/^data:/i.test(v);
}

/** Why a preview can't be kept, or [] when it can. `units` are the ids the entry lists. */
export function previewProblems(html: string, units: Set<string>): string[] {
  const problems: string[] = [];
  for (const [pattern, reason] of FORBIDDEN) if (pattern.test(html)) problems.push(reason);
  for (const pattern of [URL_ATTRIBUTE, CSS_URL]) {
    for (const match of html.matchAll(pattern)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      if (external(value)) {
        problems.push(`loads ${JSON.stringify(value.slice(0, 60))}: only data: URLs, nothing from outside`);
        break;
      }
    }
  }
  for (const match of html.matchAll(/data-lens-unit\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const id = match[1] ?? match[2] ?? "";
    if (!units.has(id)) problems.push(`marks data-lens-unit="${id}", which isn't one of the entry's units`);
  }
  for (const match of html.matchAll(/data-lens-change\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const mark = match[1] ?? match[2] ?? "";
    if (!(CHANGE_MARKS as readonly string[]).includes(mark)) {
      problems.push(`data-lens-change="${mark}" must be one of ${CHANGE_MARKS.join(", ")}`);
    }
  }
  return [...new Set(problems)];
}

/** The name an accepted preview is kept under: its content's hash. */
export function assetName(html: string): string {
  return createHash("sha256").update(html).digest("hex").slice(0, 16) + ".html";
}

/** Keeps the accepted previews' files, and drops the ones no stored preview names any more. */
export function writeAssets(root: string, key: string, stored: StoredSummary, assets: Map<string, string>): void {
  const dir = join(bundleDir(root, key), ASSETS_DIR);
  mkdirSync(dir, { recursive: true });
  for (const [name, html] of assets) writeFileSync(join(dir, name), html);
  const kept = new Set((stored.previews ?? []).flatMap((preview) => [preview.now, ...(preview.before ? [preview.before] : [])]));
  for (const name of readdirSync(dir)) if (ASSET_NAME.test(name) && !kept.has(name)) unlinkSync(join(dir, name));
}

/** The marks' look, the same in every preview: lens's, not the agent's. */
const MARKS_CSS = `
[data-lens-unit]{cursor:pointer}
[data-lens-change]{outline:2px dashed var(--lens-mark);outline-offset:3px;border-radius:4px}
[data-lens-change=added]{--lens-mark:#16a34a}
[data-lens-change=changed]{--lens-mark:#d97706}
[data-lens-change=removed]{--lens-mark:#dc2626;opacity:.6}
.lens-focus [data-lens-change]:not(.lens-on){outline-color:transparent}
.lens-dim{opacity:.45}`;

/**
 * lens's script in the frame: outlines the unit the page names (the frame URL's #fragment), tells
 * the page which unit a click is on and how tall the preview is. It runs in an opaque origin.
 */
const BRIDGE = `(() => {
  const post = (message) => parent.postMessage(Object.assign({ lens: true }, message), '*');
  // Dims the units around the named one, but not what holds it or what it holds, and only the
  // outermost of them: opacity multiplies down nested units, and would fade the named one too.
  const focus = () => {
    const unit = decodeURIComponent(location.hash.slice(1));
    const all = [...document.querySelectorAll('[data-lens-unit]')];
    const on = all.filter((el) => el.getAttribute('data-lens-unit') === unit);
    for (const el of all) {
      el.classList.toggle('lens-on', on.includes(el));
      const near = on.some((mine) => mine.contains(el) || el.contains(mine));
      el.classList.toggle('lens-dim', on.length > 0 && !near);
    }
    for (const el of all) {
      if (el.classList.contains('lens-dim') && el.parentElement?.closest('.lens-dim')) el.classList.remove('lens-dim');
    }
    document.documentElement.classList.toggle('lens-focus', on.length > 0);
  };
  const size = () => post({ type: 'size', height: document.documentElement.scrollHeight });
  focus();
  addEventListener('hashchange', focus);
  addEventListener('load', size);
  if (typeof ResizeObserver === 'function') new ResizeObserver(size).observe(document.documentElement);
  document.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target.closest('[data-lens-unit]') : null;
    event.preventDefault();
    if (el) post({ type: 'open-unit', unit: el.getAttribute('data-lens-unit') });
  }, true);
})();`;

export interface PreviewResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** GET /api/preview/<asset>: the preview, with lens's marks and script, under a CSP that lets nothing else in. */
export function previewResponse(root: string, key: string | null, asset: string): PreviewResponse {
  const path = key && ASSET_NAME.test(asset) ? join(root, ".lens", "summary", key, ASSETS_DIR, asset) : null;
  if (!path || !existsSync(path)) {
    return { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "no such preview" };
  }
  const nonce = randomBytes(16).toString("base64");
  const html = readFileSync(path, "utf8");
  const page = (/^\s*<!doctype/i.test(html) ? "" : "<!doctype html>\n") + html +
    `\n<style>${MARKS_CSS}</style>\n<script nonce="${nonce}">${BRIDGE}</script>\n`;
  return {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": [
        "default-src 'none'", "style-src 'unsafe-inline'", "img-src data:", "font-src data:",
        `script-src 'nonce-${nonce}'`, "base-uri 'none'", "form-action 'none'",
      ].join("; "),
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
    body: page,
  };
}
