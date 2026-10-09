import type { ChangeRow } from '../../../../../../summary/store.ts';
import type { Unit } from '../../../model/signals.ts';
import { hoverCite } from '../../../actions/summary.ts';
import { Cite } from './Cite.tsx';

/** What behaves differently: When / Before / Now, each pointing at the line that causes it. */
export function Changes({ unit, changes }: { unit: Unit; changes: ChangeRow[] }) {
  return (
    <div className='chg'>
      <div className='chg-label'>
        <span className='t'>What behaves differently</span>
        <span className='cap'>situations where the code now does something else</span>
      </div>
      {changes.map((change, changeIndex) => (
        <div
          key={changeIndex}
          className='scn'
          data-line={change.line}
          onMouseEnter={() => hoverCite(unit, change.line)}
          onMouseLeave={() => hoverCite(unit, null)}
        >
          <div className='scn-h'>
            <span className='w'>when</span>
            <span className='sit'>{change.when}</span>
            <Cite label={change.line} />
          </div>
          {change.before && (
            <div className='scn-l was'>
              <span className='s'>−</span>
              <span className='tx'>{change.before}</span>
            </div>
          )}
          <div className='scn-l is'>
            <span className='s'>+</span>
            <span>
              {!change.before && (
                <span className='new-b' title="behavior that didn't exist before">
                  new
                </span>
              )}
              {change.now}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
