import { useState } from 'react';
import type { PreviewView } from '../../../../cli-app/summary/view.ts';
import { BeforeNow, type Moment } from './BeforeNow.tsx';
import { UnitChips } from './UnitChips.tsx';
import { openUnitFromPreview } from '../../../actions/previews.ts';

/**
 * A screen as the agent drew it, in the project's own look, alone in a sandboxed frame: its script
 * is lens's (it outlines the unit after the #, and posts its height: actions/previews.ts). On the
 * overview a unit's chip outlines it here and the page stays; on a unit's page it opens that unit.
 */
export function PreviewCard({ preview, unitId }: { preview: PreviewView; unitId: string | null }) {
  const [moment, setMoment] = useState<Moment>('now');
  const [outlined, setOutlined] = useState<string | null>(null);
  const shown = moment === 'before' && preview.before ? preview.before : preview.now;
  const picked = unitId ?? outlined;
  const pick = (id: string) => {
    if (unitId === null) setOutlined(outlined === id ? null : id);
    else if (id !== unitId) openUnitFromPreview(id, preview.title);
  };
  return (
    <section className='drawing-card preview-card' data-preview={preview.title}>
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
          src={shown + (picked ? '#' + encodeURIComponent(picked) : '')}
          sandbox='allow-scripts'
          referrerPolicy='no-referrer'
        />
      </div>
      <footer className='drawing-foot'>
        <UnitChips units={preview.units} picked={picked} onPick={pick} />
      </footer>
    </section>
  );
}
