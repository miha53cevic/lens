import { useState } from 'react';
import clsx from 'clsx';
import type { PreviewView } from '../../../../cli-app/summary/view.ts';
import { BeforeNow, type Moment } from './BeforeNow.tsx';
import { DrawingDialog, ExpandButton } from './DrawingDialog.tsx';
import { UnitChips } from './UnitChips.tsx';
import { openUnitFromPreview } from '../../../actions/previews.ts';

/**
 * The preview's sandboxed frame. In the card its screen sets its height (actions/previews.ts); one
 * that fills (the dialog) keeps the dialog's.
 */
function PreviewFrame({ title, src, fill = false }: { title: string; src: string; fill?: boolean }) {
  return (
    <iframe
      className={clsx('block w-full rounded-sm border-0 shadow-1', fill ? 'min-h-0 flex-1' : 'h-[360px]')}
      data-fill={fill || undefined}
      title={title}
      src={src}
      sandbox='allow-scripts'
      referrerPolicy='no-referrer'
    />
  );
}

/**
 * A screen as the agent drew it, in the project's own look, alone in a sandboxed frame: its script
 * is lens's (it outlines the unit after the #, and posts its height: actions/previews.ts). On the
 * overview a unit's chip outlines it here and the page stays; on a unit's page it opens that unit.
 * Expanded, the same screen fills a dialog; it shares the card's moment and outline.
 */
export function PreviewCard({ preview, unitId }: { preview: PreviewView; unitId: string | null }) {
  const [moment, setMoment] = useState<Moment>('now');
  const [outlined, setOutlined] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = moment === 'before' && preview.before ? preview.before : preview.now;
  const picked = unitId ?? outlined;
  const src = shown + (picked ? '#' + encodeURIComponent(picked) : '');
  const pick = (id: string) => {
    if (unitId === null) setOutlined(outlined === id ? null : id);
    else if (id !== unitId) {
      setExpanded(false);
      openUnitFromPreview(id, preview.title);
    }
  };
  const beforeNow = preview.before && <BeforeNow value={moment} onChange={setMoment} />;
  const chips = <UnitChips units={preview.units} picked={picked} onPick={pick} />;
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
        {beforeNow}
        <ExpandButton onExpand={() => setExpanded(true)} />
      </header>
      <div className='bg-bg p-4'>
        <PreviewFrame title={preview.title} src={src} />
      </div>
      <footer className='flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2'>{chips}</footer>
      {expanded && (
        <DrawingDialog
          title={preview.title}
          stale={preview.stale}
          controls={beforeNow}
          footer={chips}
          onClose={() => setExpanded(false)}
        >
          <PreviewFrame title={preview.title} src={src} fill />
        </DrawingDialog>
      )}
    </section>
  );
}
