// The agent's answers: the little markdown agents write, and the cites in it.

import type { AskCite, AskQuestion } from '../../../../ask/session.ts';
import { getState } from '../store.ts';
import { currentUnit } from '../model/summaryList.ts';
import { unitById } from '../model/signals.ts';
import { escapeHtml } from '../shared.ts';
import { citedRow, flashCited, openSummaryUnit } from '../actions/summary.ts';
import { jumpToLine, setView } from '../actions/views.ts';
import { openFile } from '../actions/tabs.ts';

/**
 * The little markdown agents write: fenced code, paragraphs, - / 1. lists,
 * `code` and **bold**. Escaped first; valid cites become buttons.
 */
export function askMarkdown(markdown: string, cites: AskCite[], files: { file: string }[]): string {
  const inline = (text: string) => {
    let html = escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    // a cite into a file the viewer doesn't have (outside the diff) has nowhere to go: it stays text
    for (const cite of cites.filter((candidate) => files.some((file) => file.file === candidate.file))) {
      // refs are plain path characters, so the escaped text holds them as is
      const ref = cite.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  };
  const out: string[] = [];
  const parts = markdown.split(/^```[^\n]*\n([\s\S]*?)^```\s*$/m);
  parts.forEach((part, partIndex) => {
    if (partIndex % 2 === 1) {
      out.push('<pre><code>' + escapeHtml(part.replace(/\n$/, '')) + '</code></pre>');
      return;
    }
    for (const block of part.split(/\n\s*\n/)) {
      const lines = block.split('\n').filter((line) => line.trim());
      if (lines.length === 0) continue;
      if (lines.every((line) => /^\s*[-*] /.test(line))) {
        out.push(
          '<ul>' + lines.map((line) => '<li>' + inline(line.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>',
        );
      } else if (lines.every((line) => /^\s*\d+\. /.test(line))) {
        out.push(
          '<ol>' + lines.map((line) => '<li>' + inline(line.replace(/^\s*\d+\. /, '')) + '</li>').join('') + '</ol>',
        );
      } else {
        out.push('<p>' + lines.map(inline).join('<br>') + '</p>');
      }
    }
  });
  return out.join('');
}

/** A cite: flash it in the open unit's code when it's there, else jump to it in the code view. */
export function askOpenCite(file: string, line: number): void {
  const state = getState();
  if (state.view === 'summary') {
    const unit = currentUnit(state);
    if (unit && unit.displayFile === file && citedRow('N' + line) && flashCited('N' + line)) return;
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
