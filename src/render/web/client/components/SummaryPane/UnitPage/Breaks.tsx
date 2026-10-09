import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import type { ViewUnit } from '../../../../../../summary/view.ts';
import { toggled } from '../../../store.ts';
import { hiddenStyle } from '../../../shared.ts';

type PossibleBreak = NonNullable<ViewUnit['summary']>['breaks'][number];

/** Callers outside the diff the change may break: each opens its callers, each caller a peek at the call. */
export function Breaks({ breaks }: { breaks: PossibleBreak[] }) {
  /** What's open: a break's callers ("b<break>"), a caller's peek ("p<break>-<caller>") */
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const isOpen = (key: string) => openKeys.has(key);
  const toggleBreak = (key: string) => setOpenKeys((keys) => toggled(keys, key));

  return (
    <div className='breaks'>
      {breaks.flatMap((possibleBreak, breakIndex) => {
        const open = isOpen('b' + breakIndex);
        return [
          <button
            key={'head' + breakIndex}
            className='brk-head'
            data-brk={breakIndex}
            onClick={() => toggleBreak('b' + breakIndex)}
          >
            <ChevronRight className={clsx('pk', open && 'open')} size={12} />
            <ArrowUpRight size={12} /> {possibleBreak.summary}
          </button>,
          <div key={'callers' + breakIndex} className='brk-callers' data-brk={breakIndex} style={hiddenStyle(!open)}>
            {possibleBreak.callers.flatMap((caller, callerIndex) => {
              const peekKey = breakIndex + '-' + callerIndex;
              const peekOpen = isOpen('p' + peekKey);
              return [
                <button
                  key={'caller' + callerIndex}
                  className='caller'
                  data-peek={peekKey}
                  onClick={() => toggleBreak('p' + peekKey)}
                >
                  <ChevronRight className={clsx('pk', peekOpen && 'open')} size={12} />
                  {caller.file + ':' + caller.line}
                </button>,
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
