import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useLens } from '../store.ts';
import { catColor } from '../shared.ts';
import { CODE_SIZE_DEFAULT } from '../codeSize.ts';
import { UI_ZOOM_DEFAULT } from '../../cli-app/zoom.ts';
import { DIALOG, ModalHead } from './ModalHead.tsx';

function CodeList({ items }: { items: readonly (string | number)[] | undefined }) {
  if (!items || items.length === 0) return <span className='text-muted'>none</span>;
  return (
    <span className='flex flex-wrap gap-1 [&_code]:rounded-sm [&_code]:border [&_code]:border-line [&_code]:bg-surface [&_code]:px-2 [&_code]:text-xs [&_code]:text-text'>
      {items.map((item, itemIndex) => (
        <code key={itemIndex}>{String(item)}</code>
      ))}
    </span>
  );
}

function CategoryName({ category, disabled }: { category: string; disabled?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', disabled && 'line-through opacity-60')}>
      <span className='dot' style={{ background: catColor(category) }} />
      {category}
    </span>
  );
}

/** A titled section of label · value rows; every section lines its values up at the same column. */
function Section({ title, hint, rows }: { title: string; hint?: string; rows: [ReactNode, ReactNode][] }) {
  return (
    <section className='mb-5 last:mb-0 [&_h3]:mt-0 [&_h3]:mb-1'>
      <h3 className='eyebrow'>{title}</h3>
      {hint && <p className='mt-0 mb-2 text-sm text-faint'>{hint}</p>}
      <dl className='m-0 [&>div]:grid [&>div]:grid-cols-[9.5rem_minmax(0,1fr)] [&>div]:items-baseline [&>div]:gap-3 [&>div]:border-b [&>div]:border-line [&>div]:py-2 [&>div:last-child]:border-b-0 [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-muted [&_dt]:min-w-0 [&_dt]:text-text'>
        {rows.map(([label, value], rowIndex) => (
          <div key={rowIndex}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The settings in effect: where they come from, this session's choices, every rule. */
export function SettingsDialog() {
  const { data, threshold, hideTests, hunksOnly, wordDiff, sideBySide, codeSize, uiZoom } = useLens((state) => ({
    data: state.data,
    threshold: state.threshold,
    hideTests: state.hideTests,
    hunksOnly: state.hunksOnly,
    wordDiff: state.wordDiff,
    sideBySide: state.sideBySide,
    codeSize: state.codeSize,
    uiZoom: state.uiZoom,
  }));
  const config = data.config;
  const categories = Object.keys(config.categories || {});
  for (const pattern of config.callPatterns || []) {
    if (!categories.includes(pattern.category)) categories.push(pattern.category);
  }
  const onOff = (on: boolean) => (on ? 'on' : 'off');

  return (
    <dialog id='settings-modal' className={DIALOG}>
      <ModalHead title='Settings' />
      <div data-part='modal-body' className='min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-5 text-md' id='settings-body'>
        <Section
          title='This session'
          rows={[
            [
              'Fold level',
              <>
                {threshold < 0 ? 'off' : threshold}
                {threshold !== config.threshold && <span className='ml-2 text-faint'>config: {config.threshold}</span>}
              </>,
            ],
            [
              'Code size',
              <>
                {codeSize}px
                {codeSize !== CODE_SIZE_DEFAULT && (
                  <span className='ml-2 text-faint'>default: {CODE_SIZE_DEFAULT}px</span>
                )}
              </>,
            ],
            [
              'UI size',
              <>
                {uiZoom}%
                {uiZoom !== UI_ZOOM_DEFAULT && <span className='ml-2 text-faint'>default: {UI_ZOOM_DEFAULT}%</span>}
              </>,
            ],
            ['Theme', data.theme],
            ['Hunks only', onOff(hunksOnly)],
            ['Word diff', onOff(wordDiff)],
            ['Side by side', onOff(sideBySide)],
            ['Hide tests', onOff(hideTests)],
            [
              'Build previews',
              <>
                {onOff(data.buildPreviews)}
                {data.buildPreviews !== config.buildPreviews && (
                  <span className='ml-2 text-faint'>config: {onOff(config.buildPreviews)}</span>
                )}
              </>,
            ],
            ['Check yourself', onOff(data.selfChecks)],
          ]}
        />
        <Section
          title='Categories'
          hint={
            threshold < 0
              ? 'The fold level is off: nothing folds.'
              : 'A category folds when its score is at or below the fold level (' + threshold + ').'
          }
          rows={categories.map((category) => {
            const enabled = (config.categories || {})[category] !== false;
            const score = (config.scores || {})[category] ?? 1;
            return [
              <CategoryName category={category} disabled={!enabled} />,
              enabled ? (
                <span className='inline-flex items-baseline gap-3'>
                  <span className='min-w-[4.5em] tabular-nums'>score {score}</span>
                  <span className={score <= threshold ? 'text-text' : 'text-faint'}>
                    {score <= threshold ? 'folds' : 'shown'}
                  </span>
                </span>
              ) : (
                <span className='text-muted'>disabled</span>
              ),
            ];
          })}
        />
        <Section
          title='Call patterns'
          hint="Calls on these receivers count as the category's code."
          rows={(config.callPatterns || []).map((pattern) => [
            <CategoryName category={pattern.category} />,
            <div className='grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1'>
              <span className='text-sm text-faint'>receivers</span>
              <CodeList items={pattern.receivers} />
              <span className='text-sm text-faint'>methods</span>
              {pattern.methods ? <CodeList items={pattern.methods} /> : <span className='text-muted'>any</span>}
            </div>,
          ])}
        />
        <Section
          title='Files and markers'
          rows={[
            ['Never fold', <CodeList items={config.keepCommentMarkers} />],
            ['Keep directive', <CodeList items={[config.keepDirective]} />],
            ['Test files', <CodeList items={config.testFilePatterns} />],
            ['Excluded', <CodeList items={config.exclude} />],
          ]}
        />
      </div>
      <div className='flex-none border-t border-line px-4 py-3 text-sm [overflow-wrap:anywhere] text-faint [&_code]:text-text'>
        {data.configSource ? (
          <>
            Built-in defaults + <code>{data.configSource}</code>.
          </>
        ) : (
          'Built-in defaults (no .lens.json found).'
        )}{' '}
        Edit .lens.json and press reload (r) to apply it. The README lists every field.
      </div>
    </dialog>
  );
}
