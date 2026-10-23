import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { toggled, useLens } from '../../../store.ts';
import { hiddenStyle } from '../../../shared.ts';
import { findingMark, findings, isBreak, type Unit } from '../../../model/signals.ts';
import { Verdict } from './Verdict.tsx';
import { Disclosure } from '../../../../ui/Disclosure.tsx';

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
    <div className='breaks'>
      <div className='section-label eyebrow'>Callers it may break</div>
      {findings(unit)
        .filter(isBreak)
        .flatMap((finding, breakIndex) => {
          const { possibleBreak } = finding;
          const mark = findingMark(marks, finding);
          // a dismissed break is one quiet line: its callers stay shut
          const open = mark !== 'dismissed' && isOpen('b' + breakIndex);
          return [
            <div key={'head' + breakIndex} className={clsx('brk', mark)} data-brk={breakIndex}>
              <Disclosure
                open={open}
                className='brk-head'
                disabled={mark === 'dismissed'}
                onClick={() => toggleBreak('b' + breakIndex)}
              >
                <ArrowUpRight size={12} /> <span className='brk-text'>{possibleBreak.summary}</span>
              </Disclosure>
              <Verdict finding={finding} mark={mark} />
            </div>,
            <div key={'callers' + breakIndex} className='brk-callers' data-brk={breakIndex} style={hiddenStyle(!open)}>
              {possibleBreak.callers.flatMap((caller, callerIndex) => {
                const peekKey = breakIndex + '-' + callerIndex;
                const peekOpen = isOpen('p' + peekKey);
                return [
                  <Disclosure
                    key={'caller' + callerIndex}
                    open={peekOpen}
                    className='caller'
                    data-peek={peekKey}
                    onClick={() => toggleBreak('p' + peekKey)}
                  >
                    {caller.file + ':' + caller.line}
                  </Disclosure>,
                  <div key={'peek' + callerIndex} className='peek' data-peek={peekKey} style={hiddenStyle(!peekOpen)}>
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
