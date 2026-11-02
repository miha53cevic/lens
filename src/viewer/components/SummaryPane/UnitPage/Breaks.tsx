import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { toggled, useLens } from '../../../store.ts';
import { hiddenStyle } from '../../../shared.ts';
import { findingMark, findings, isBreak, type Unit } from '../../../model/signals.ts';
import { Verdict } from './Verdict.tsx';
import { Disclosure } from '../../../../ui/Disclosure.tsx';
import { AgentText } from '../../AgentText.tsx';

/**
 * Callers outside the diff the change may break: each opens its callers, each caller a peek at the
 * call, and each gets the reader's verdict, as a concern does.
 */
export function Breaks({ unit }: { unit: Unit }) {
  const marks = useLens((state) => state.concernMarks);
  /** What's open: a break's callers ("b<break>"), a caller's peek ("p<break>-<caller>") */
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const isOpen = (key: string) => openKeys.has(key);
  const toggleBreak = (key: string) => setOpenKeys((keys) => toggled(keys, key));

  return (
    <div data-part='breaks' className='flex flex-col gap-1 border-l-2 border-breaks pl-4'>
      <div data-part='section-label' className='eyebrow mb-1'>
        Callers it may break
      </div>
      {findings(unit)
        .filter(isBreak)
        .flatMap((finding, breakIndex) => {
          const { possibleBreak } = finding;
          const mark = findingMark(marks, finding);
          // a dismissed break is one quiet line: its callers stay shut
          const open = mark !== 'dismissed' && isOpen('b' + breakIndex);
          return [
            <div
              key={'head' + breakIndex}
              data-part='brk'
              data-mark={mark ?? undefined}
              className='group/brk flex flex-wrap items-center gap-x-3 gap-y-2 data-[mark=real]:rounded-md data-[mark=real]:bg-[color-mix(in_oklab,var(--breaks)_var(--tint),transparent)] data-[mark=real]:px-2 data-[mark=real]:py-1 data-[mark=dismissed]:flex-nowrap data-[mark=dismissed]:opacity-60 data-[mark=dismissed]:hover:opacity-100'
              data-brk={breakIndex}
            >
              <Disclosure
                open={open}
                data-part='brk-head'
                className='-ml-2 text-base font-semibold text-text [&_.lucide-arrow-up-right]:text-breaks group-data-[mark=dismissed]/brk:flex-1 group-data-[mark=dismissed]/brk:overflow-hidden group-data-[mark=dismissed]/brk:text-sm group-data-[mark=dismissed]/brk:font-normal group-data-[mark=dismissed]/brk:text-muted group-data-[mark=dismissed]/brk:[&_.lucide-arrow-up-right]:text-muted'
                disabled={mark === 'dismissed'}
                onClick={() => toggleBreak('b' + breakIndex)}
              >
                <ArrowUpRight size={12} />{' '}
                <span className='group-data-[mark=dismissed]/brk:overflow-hidden group-data-[mark=dismissed]/brk:text-ellipsis group-data-[mark=dismissed]/brk:whitespace-nowrap group-data-[mark=dismissed]/brk:line-through'>
                  <AgentText text={possibleBreak.summary} />
                </span>
              </Disclosure>
              <Verdict finding={finding} mark={mark} />
            </div>,
            <div
              key={'callers' + breakIndex}
              className='flex flex-col gap-1 pl-4'
              data-brk={breakIndex}
              style={hiddenStyle(!open)}
            >
              {possibleBreak.callers.flatMap((caller, callerIndex) => {
                const peekKey = breakIndex + '-' + callerIndex;
                const peekOpen = isOpen('p' + peekKey);
                return [
                  <Disclosure
                    key={'caller' + callerIndex}
                    open={peekOpen}
                    className='-ml-2 font-mono text-sm text-muted'
                    data-peek={peekKey}
                    onClick={() => toggleBreak('p' + peekKey)}
                  >
                    {caller.file + ':' + caller.line}
                  </Disclosure>,
                  <div
                    key={'peek' + callerIndex}
                    className='mb-1 overflow-x-auto rounded-md border border-line bg-surface py-1 font-mono text-sm/[1.6] text-code-fg'
                    data-peek={peekKey}
                    style={hiddenStyle(!peekOpen)}
                  >
                    {caller.lines.map((peekLine) => (
                      <div key={peekLine.n} className={clsx('row', peekLine.n === caller.line && 'call')}>
                        <span className='num'>{peekLine.n}</span>
                        <span className='mark' />
                        <span>{peekLine.text || ' '}</span>
                      </div>
                    ))}
                  </div>,
                ];
              })}
            </div>,
          ];
        })}
    </div>
  );
}
