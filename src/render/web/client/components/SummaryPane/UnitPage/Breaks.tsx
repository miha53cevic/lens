import clsx from 'clsx';
import type { ViewUnit } from '../../../../../../summary/view.ts';
import { useLens } from '../../../store.ts';
import type { Unit } from '../../../model/signals.ts';
import { toggleBreak } from '../../../actions/summary.ts';

type PossibleBreak = NonNullable<ViewUnit['summary']>['breaks'][number];

/** Callers outside the diff the change may break: each opens its callers, each caller a peek at the call. */
export function Breaks({ unit, breaks }: { unit: Unit; breaks: PossibleBreak[] }) {
  const openBreaks = useLens((state) => (state.unitPage.unitId === unit.id ? state.unitPage.openBreaks : null));
  const isOpen = (key: string) => !!openBreaks?.has(key);

  return (
    <div className='breaks'>
      {breaks.flatMap((possibleBreak, breakIndex) => {
        const open = isOpen('b' + breakIndex);
        return [
          <button
            key={'head' + breakIndex}
            className='brk-head'
            data-brk={breakIndex}
            onClick={() => toggleBreak(unit, 'b' + breakIndex)}
          >
            <span className='pk'>{open ? '▾' : '▸'}</span>↗ {possibleBreak.summary}
          </button>,
          <div
            key={'callers' + breakIndex}
            className='brk-callers'
            data-brk={breakIndex}
            style={open ? undefined : { display: 'none' }}
          >
            {possibleBreak.callers.flatMap((caller, callerIndex) => {
              const peekKey = breakIndex + '-' + callerIndex;
              const peekOpen = isOpen('p' + peekKey);
              return [
                <button
                  key={'caller' + callerIndex}
                  className='caller'
                  data-peek={peekKey}
                  onClick={() => toggleBreak(unit, 'p' + peekKey)}
                >
                  {(peekOpen ? '▾ ' : '▸ ') + caller.file + ':' + caller.line}
                </button>,
                <div
                  key={'peek' + callerIndex}
                  className='peek'
                  data-peek={peekKey}
                  style={peekOpen ? undefined : { display: 'none' }}
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
