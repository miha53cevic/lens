// The Plan tab's findings: what the reader marked real on what's off plan, as text for the agent.

import type { SentFinding } from '../../cli-app/rounds/store.ts';
import type { PlanView } from '../../cli-app/summary/view.ts';
import { memo, plural } from '../shared.ts';
import type { Marks } from './signals.ts';

/** A verdict on a plan item or an off-plan unit, kept with the review's other verdicts */
export const planMarkKey = (what: string) => 'plan#' + what;

export interface PlanHandoff {
  findings: SentFinding[];
  text: string;
}

export const planForAgent = memo((plan: PlanView | null, marks: Marks): PlanHandoff => {
  if (!plan) return { findings: [], text: '' };
  const findings: SentFinding[] = [];
  for (const item of plan.items) {
    if (marks.get(planMarkKey(item.text)) !== 'real') continue;
    const text = item.status + ' in the plan: ' + item.text + (item.note ? ' — ' + item.note : '');
    findings.push({
      key: planMarkKey(item.text),
      kind: 'plan',
      text,
      unit: item.units[0] ?? null,
      file: plan.file,
      line: null,
    });
  }
  for (const entry of plan.unplanned) {
    const key = planMarkKey(entry.unit + ':' + entry.note);
    if (marks.get(key) !== 'real') continue;
    const file = entry.unit.split('#')[0];
    findings.push({ key, kind: 'unplanned', text: entry.unit + ': ' + entry.note, unit: entry.unit, file, line: null });
  }
  const list = findings.map((finding, index) => `\n${index + 1}. [${finding.kind}] ${finding.text}`).join('\n');
  const text = `Deal with these: ${plural(findings.length, 'way')} the build differs from ${plan.file}, confirmed by the reviewer.\n${list}\n`;
  return { findings, text };
});
