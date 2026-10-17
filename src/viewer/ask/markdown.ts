// The agent's answers as HTML: the markdown agents write, its cites as numbered markers, and
// its ```flow blocks as lanes of steps. HOW_TO_ANSWER (cli-app/ask/context.ts) asks for both.

import MarkdownIt from 'markdown-it';
import type { AskCite } from '../../cli-app/ask/session.ts';
import { escapeHtml, plural } from '../shared.ts';

// a type, not an interface: markdown-it takes it as its untyped env, which an interface is not assignable to
/** What a render is given: the cites that become markers, and the ones drawn so far. */
type AskEnv = {
  cites: AskCite[];
  /** The cites in the order the answer first shows them: a marker's number is its place here */
  used: AskCite[];
};

// html stays off (the default), so an answer's <tags> are shown and never run. No images: a
// review fetches nothing an answer names. A line break in the answer is one in the rail.
const parser = new MarkdownIt({ breaks: true }).disable('image');

const citeData = (cite: AskCite) => 'data-file="' + escapeHtml(cite.file) + '" data-line="' + cite.line + '"';

/** A cite in the answer's text: a small numbered marker, its path on hover, that jumps to the line. */
function citeMarker(cite: AskCite, env: AskEnv): string {
  let index = env.used.indexOf(cite);
  if (index < 0) index = env.used.push(cite) - 1;
  const ref = escapeHtml(cite.ref);
  return (
    '<button class="ask-cite ask-mark" ' +
    citeData(cite) +
    ' title="' +
    ref +
    '" aria-label="' +
    ref +
    '">' +
    (index + 1) +
    '</button>'
  );
}

/** Valid cites become markers, in the escaped text of a text or `code` token. */
function linkCites(html: string, env: AskEnv): string {
  if (env.cites.length === 0) return html;
  // the ref as the escaped text holds it: `R&D.ts:12` is `R&amp;D.ts:12` there
  const byRef = new Map(env.cites.map((cite) => [escapeHtml(cite.ref), cite]));
  // one pass, longest ref first, so `a.ts:1` never takes a bite of `a.ts:12` or of a marker drawn already
  const refs = [...byRef.keys()]
    .sort((a, b) => b.length - a.length)
    .map((ref) => ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return html.replace(new RegExp('(?<![\\w./-])(?:' + refs.join('|') + ')(?!\\d)', 'g'), (ref) =>
    citeMarker(byRef.get(ref)!, env),
  );
}

/** The cites the answer showed, folded under it: each with its number and its whole path. */
function citeSources(used: AskCite[]): string {
  if (used.length === 0) return '';
  const items = used.map(
    (cite) => '<li><button class="cite ask-cite" ' + citeData(cite) + '>' + escapeHtml(cite.ref) + '</button></li>',
  );
  return (
    '<details class="ask-sources"><summary>' +
    plural(used.length, 'source') +
    '</summary><ol>' +
    items.join('') +
    '</ol></details>'
  );
}

/** A step of a ```flow block: "Layer: what happens", the layer a short name (CLI, API, FE…). */
const FLOW_STEP = /^([A-Za-z][\w .-]{0,23}?):\s+(\S.*)$/;

/** A ```flow block as a lane of steps under their layers; null when a line isn't a step, and it stays a code block. */
function flowLane(content: string, env: AskEnv): string | null {
  const steps: { layer: string; text: string }[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const match = FLOW_STEP.exec(line.trim());
    if (!match) return null;
    steps.push({ layer: match[1].trim(), text: match[2] });
  }
  if (steps.length === 0) return null;
  let html = '<ol class="ask-flow">';
  // a layer is named once over its run of steps, so a hop to another one stands out
  steps.forEach((step, index) => {
    if (index === 0 || steps[index - 1].layer !== step.layer) {
      html += '<li class="ask-flow-layer">' + escapeHtml(step.layer) + '</li>';
    }
    html += '<li class="ask-flow-step">' + linkCites(escapeHtml(step.text), env) + '</li>';
  });
  return html + '</ol>\n';
}

// markdown-it hands a rule the env of its render untyped: askMarkdown below always passes an AskEnv
const envOf = (env: unknown) => env as AskEnv;
parser.renderer.rules.text = (tokens, index, _options, env) => linkCites(escapeHtml(tokens[index].content), envOf(env));
parser.renderer.rules.code_inline = (tokens, index, _options, env) => {
  const content = tokens[index].content;
  // a cite written as `code` is the marker alone: a number in a code box reads as code
  const cite = envOf(env).cites.find((candidate) => candidate.ref === content.trim());
  if (cite) return citeMarker(cite, envOf(env));
  return '<code>' + linkCites(escapeHtml(content), envOf(env)) + '</code>';
};
const fence = parser.renderer.rules.fence!;
parser.renderer.rules.fence = (tokens, index, options, env, self) =>
  (tokens[index].info.trim() === 'flow' && flowLane(tokens[index].content, envOf(env))) ||
  fence(tokens, index, options, env, self);
// a link is its text and then its address, as text: nothing in an answer leaves the review
parser.renderer.rules.link_open = () => '';
parser.renderer.rules.link_close = (tokens, index) => {
  // <https://…> already reads as its address
  if (tokens[index].markup === 'autolink') return '';
  let openIndex = index - 1;
  while (tokens[openIndex].type !== 'link_open' || tokens[openIndex].level !== tokens[index].level) openIndex--;
  return ' (' + escapeHtml(String(tokens[openIndex].attrGet('href') ?? '')) + ')';
};

/** The answer's last paragraph when it says what the agent read (HOW_TO_ANSWER asks for one). */
const READ_LINE = /<p>Read: (?:(?!<p>)[^])*<\/p>\n$/;

/**
 * The agent's markdown as HTML (markdown-it: CommonMark and tables). Valid cites become numbered
 * markers, listed folded under the answer, above its "Read:" line.
 */
export function askMarkdown(markdown: string, cites: AskCite[], files: { file: string }[]): string {
  // a cite into a file the viewer doesn't have (outside the diff) has nowhere to go: it stays text
  const shown = cites.filter((candidate) => files.some((file) => file.file === candidate.file));
  const env: AskEnv = { cites: shown, used: [] };
  const html = parser.render(markdown, env);
  const read = READ_LINE.exec(html);
  if (!read) return html + citeSources(env.used);
  return html.slice(0, read.index) + citeSources(env.used) + read[0].replace('<p>', '<p class="ask-read">');
}
