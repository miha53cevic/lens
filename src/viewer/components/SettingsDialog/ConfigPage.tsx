import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useLens } from '../../store.ts';
import { catColor } from '../../shared.ts';
import { tipAttrs } from '../../../ui/Tip.tsx';

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
    <section className='mb-5 last:mb-0'>
      <h3 className='eyebrow mt-0 mb-1'>{title}</h3>
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

/** The config in effect, read-only: what was skipped from it, every rule, where it came from. */
export function ConfigPage({ shown }: { shown: boolean }) {
  const { config, configProblems, threshold } = useLens((state) => ({
    config: state.data.config,
    configProblems: state.data.configProblems,
    threshold: state.threshold,
  }));
  const categories = Object.keys(config.folds);
  for (const pattern of config.callPatterns || []) {
    if (!categories.includes(pattern.category)) categories.push(pattern.category);
  }

  return (
    <section data-part='settings-page' data-page='config' hidden={!shown}>
      {configProblems.length > 0 && (
        <Section
          title='Skipped from the config'
          hint='These values were left out; the rest of the file applies.'
          rows={configProblems.map((problem) => [
            <code data-part='config-problem' className='text-sm [overflow-wrap:anywhere] text-text'>
              {problem.path || problem.file}
            </code>,
            <span className='text-mod'>{problem.path ? problem.message : problem.file + ' ' + problem.message}</span>,
          ])}
        />
      )}
      <Section
        title='Categories'
        hint={
          threshold < 0
            ? 'The fold level is off: nothing folds.'
            : 'A category folds when its score is at or below the fold level (' + threshold + ').'
        }
        rows={categories.map((category) => {
          const fold = config.folds[category];
          const enabled = fold !== false;
          const score = typeof fold === 'number' ? fold : 1;
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
    </section>
  );
}

/** Where the config comes from, and how to change it. */
export function ConfigFoot() {
  const configSource = useLens((state) => state.data.configSource);
  return (
    <>
      {configSource ? (
        <>
          Built-in defaults +{' '}
          <code
            data-part='config-source'
            className='inline-block max-w-[360px] overflow-hidden align-bottom text-ellipsis whitespace-nowrap'
            {...tipAttrs(configSource, { cut: true })}
          >
            {configSource}
          </code>
          .
        </>
      ) : (
        'Built-in defaults (no .lens.json found).'
      )}{' '}
      Edit .lens.json and press reload (r) to apply it. <code>lens config</code> shows where each value comes from.
    </>
  );
}
