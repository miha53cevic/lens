// A doc comment as TypeScript's hover sends it, as HTML for the hover card. It is the reviewed
// code's own text: html stays off (its <tags> show as text), and links and images aren't drawn,
// so a comment can't make the page fetch or go anywhere.

import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ breaks: true }).disable(['image', 'link', 'autolink']);

const cache = new Map<string, string>();

export function lspDocHtml(doc: string): string {
  let html = cache.get(doc);
  if (html === undefined) {
    html = parser.render(doc);
    // a hover is one card at a time: a few kept is plenty
    if (cache.size > 50) cache.clear();
    cache.set(doc, html);
  }
  return html;
}
