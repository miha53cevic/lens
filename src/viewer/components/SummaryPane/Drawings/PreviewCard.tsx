import { useState } from 'react';
import type { PreviewView } from '../../../../cli-app/summary/view.ts';
import { BeforeNow, type Moment } from './BeforeNow.tsx';
import { UnitChips } from './UnitChips.tsx';

/**
 * A screen as the agent drew it, in the project's own look, alone in a sandboxed frame: its script
 * is lens's (it outlines the unit after the #, and posts clicks and its height: actions/previews.ts).
 */
export function PreviewCard({ preview, unitId }: { preview: PreviewView; unitId: string | null }) {
  const [moment, setMoment] = useState<Moment>('now');
  const shown = moment === 'before' && preview.before ? preview.before : preview.now;
  return (
    <section className='drawing-card preview-card'>
      <header className='drawing-head'>
        <span className='drawing-title'>{preview.title}</span>
        {preview.stale && <span className='drawing-stale'>code changed since</span>}
        <span className='spacer' />
        {preview.before && <BeforeNow value={moment} onChange={setMoment} />}
      </header>
      <div className='preview-stage'>
        <iframe
          className='preview-frame'
          title={preview.title}
          src={shown + (unitId ? '#' + encodeURIComponent(unitId) : '')}
          sandbox='allow-scripts'
          referrerPolicy='no-referrer'
          data-units={preview.units.join('\n')}
        />
      </div>
      <footer className='drawing-foot'>
        <UnitChips units={preview.units} unitId={unitId} />
      </footer>
    </section>
  );
}
