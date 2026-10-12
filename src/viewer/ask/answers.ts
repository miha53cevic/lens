// The agent's answers: the markdown agents write, and the cites in it.

import MarkdownIt from 'markdown-it';
import type { AskCite, AskQuestion } from '../../cli-app/ask/session.ts';
import { getState } from '../store.ts';
import { currentUnit } from '../model/summaryList.ts';
import { unitById } from '../model/signals.ts';
import { escapeHtml } from '../shared.ts';
import { flashCited, openSummaryUnit } from '../actions/summary.ts';
import { jumpToLine, setView } from '../actions/views.ts';
import { openFile } from '../actions/tabs.ts';

/** What a render is given: the cites that become buttons. */
interface AskEnv {
  cites: AskCite[];
}

// html stays off (the default), so an answer's <tags> are shown and never run. No images: a
// review fetches nothing an answer names. A line break in the answer is one in the rail.
const parser = new MarkdownIt({ breaks: true }).disable('image');

/** Valid cites become buttons, in the escaped text of a text or `code` token. */
function linkCites(html: string, cites: AskCite[]): string {
  for (const cite of cites) {
    // the ref as the escaped text holds it: `R&D.ts:12` is `R&amp;D.ts:12` there
    const ref = escapeHtml(cite.ref).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(
      new RegExp('(?<![\\w./-])' + ref + '(?!\\d)', 'g'),
      '<button class="cite ask-cite" data-file="' +
        escapeHtml(cite.file) +
        '" data-line="' +
        cite.line +
        '">' +
        escapeHtml(cite.ref) +
        '</button>',
    );
  }
  return html;
}

// markdown-it hands a rule the env of its render untyped: askMarkdown below always passes an AskEnv
const citesOf = (env: unknown) => (env as AskEnv).cites;
parser.renderer.rules.text = (tokens, index, _options, env) =>
  linkCites(escapeHtml(tokens[index].content), citesOf(env));
parser.renderer.rules.code_inline = (tokens, index, _options, env) =>
  '<code>' + linkCites(escapeHtml(tokens[index].content), citesOf(env)) + '</code>';
// a link is its text and then its address, as text: nothing in an answer leaves the review
parser.renderer.rules.link_open = () => '';
parser.renderer.rules.link_close = (tokens, index) => {
  // <https://…> already reads as its address
  if (tokens[index].markup === 'autolink') return '';
  let openIndex = index - 1;
  while (tokens[openIndex].type !== 'link_open' || tokens[openIndex].level !== tokens[index].level) openIndex--;
  return ' (' + escapeHtml(String(tokens[openIndex].attrGet('href') ?? '')) + ')';
};

/** The agent's markdown as HTML (markdown-it: CommonMark and tables). Valid cites become buttons. */
export function askMarkdown(markdown: string, cites: AskCite[], files: { file: string }[]): string {
  // a cite into a file the viewer doesn't have (outside the diff) has nowhere to go: it stays text
  const shown = cites.filter((candidate) => files.some((file) => file.file === candidate.file));
  return parser.render(markdown, { cites: shown } satisfies AskEnv);
}

/** A cite: flash it in the open unit's code when it's there, else jump to it in the code view. */
export function askOpenCite(file: string, line: number): void {
  const state = getState();
  if (state.view === 'summary') {
    const unit = currentUnit(state);
    if (unit && unit.displayFile === file && flashCited('N' + line)) return;
  }
  const fileIndex = state.data.files.findIndex((candidate) => candidate.file === file);
  if (fileIndex >= 0) jumpToLine(fileIndex, line);
}

/** A question's change chip: back to that unit, or that file. */
export function askGoto(question: AskQuestion): void {
  const state = getState();
  if (question.unitId && unitById(state.data.summary, question.unitId)) {
    setView('summary');
    openSummaryUnit(question.unitId);
    return;
  }
  const fileIndex = state.data.files.findIndex((file) => file.file === question.file);
  if (fileIndex < 0) return;
  setView('code');
  openFile(fileIndex);
}
