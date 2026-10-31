import type { ReactNode } from 'react';
import { useLens } from '../store.ts';
import { catColor } from '../shared.ts';
import { CODE_SIZE_DEFAULT } from '../codeSize.ts';
import { UI_ZOOM_DEFAULT } from '../../cli-app/zoom.ts';
import { ModalHead } from './ModalHead.tsx';
import './SettingsRows.css';
import './SettingsDialog.css';

function CodeList({ items }: { items: readonly (string | number)[] | undefined }) {
  if (!items || items.length === 0) return <span className='set-none'>none</span>;
  return (
    <span className='set-list'>
      {items.map((item, itemIndex) => (
        <code key={itemIndex}>{String(item)}</code>
      ))}
    </span>
  );
}

function CategoryName({ category, disabled }: { category: string; disabled?: boolean }) {
  return (
    <span className={disabled ? 'set-cat set-off' : 'set-cat'}>
      <span className='dot' style={{ background: catColor(category) }} />
      {category}
    </span>
  );
}

/** A titled section of label · value rows; every section lines its values up at the same column. */
function Section({ title, hint, rows }: { title: string; hint?: string; rows: [ReactNode, ReactNode][] }) {
  return (
    <section className='set-section'>
      <h3 className='eyebrow'>{title}</h3>
      {hint && <p className='set-hint'>{hint}</p>}
      <dl className='set-rows'>
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
    <dialog id='settings-modal'>
      <ModalHead title='Settings' />
      <div className='modal-body' id='settings-body'>
        <Section
          title='This session'
          rows={[
            [
              'Fold level',
              <>
                {threshold < 0 ? 'off' : threshold}
                {threshold !== config.threshold && <span className='set-aside'>config: {config.threshold}</span>}
              </>,
            ],
            [
              'Code size',
              <>
                {codeSize}px
                {codeSize !== CODE_SIZE_DEFAULT && <span className='set-aside'>default: {CODE_SIZE_DEFAULT}px</span>}
              </>,
            ],
            [
              'UI size',
              <>
                {uiZoom}%{uiZoom !== UI_ZOOM_DEFAULT && <span className='set-aside'>default: {UI_ZOOM_DEFAULT}%</span>}
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
                  <span className='set-aside'>config: {onOff(config.buildPreviews)}</span>
                )}
              </>,
            ],
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
                <span className='set-score'>
                  <span className='set-num'>score {score}</span>
                  <span className={score <= threshold ? 'set-state folds' : 'set-state'}>
                    {score <= threshold ? 'folds' : 'shown'}
                  </span>
                </span>
              ) : (
                <span className='set-none'>disabled</span>
              ),
            ];
          })}
        />
        <Section
          title='Call patterns'
          hint="Calls on these receivers count as the category's code."
          rows={(config.callPatterns || []).map((pattern) => [
            <CategoryName category={pattern.category} />,
            <div className='set-pattern'>
              <span className='set-key'>receivers</span>
              <CodeList items={pattern.receivers} />
              <span className='set-key'>methods</span>
              {pattern.methods ? <CodeList items={pattern.methods} /> : <span className='set-none'>any</span>}
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
      <div className='set-foot'>
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
