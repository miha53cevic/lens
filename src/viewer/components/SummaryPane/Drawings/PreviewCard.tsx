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
    <section
      data-part='preview-card'
      className='flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1'
      data-preview={preview.title}
    >
      <header className='flex min-h-control-lg items-center gap-2 border-b border-line px-4 py-2 text-sm text-muted'>
        <span className='overflow-hidden font-semibold text-ellipsis whitespace-nowrap text-text'>{preview.title}</span>
        {preview.stale && (
          <span data-part='drawing-stale' className='text-mod'>
            code changed since
          </span>
        )}
        <span className='flex-1' />
        {preview.before && <BeforeNow value={moment} onChange={setMoment} />}
      </header>
      <div className='bg-bg p-4'>
        <iframe
          className='block h-[360px] w-full rounded-sm border-0 shadow-1'
          title={preview.title}
          src={shown + (picked ? '#' + encodeURIComponent(picked) : '')}
          sandbox='allow-scripts'
          referrerPolicy='no-referrer'
        />
      </div>
      <footer className='flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2'>
        <UnitChips units={preview.units} picked={picked} onPick={pick} />
      </footer>
    </section>
  );
}
