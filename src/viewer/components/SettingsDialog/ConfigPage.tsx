import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import { useLens } from '../../store.ts';
import { catColor } from '../../shared.ts';
import { isBusy } from '../../model/status.ts';
import { revealConfigFile } from '../../actions/viewSettings.ts';
import { Button } from '../../../ui/Button.tsx';
import { Kbd } from '../../../ui/Kbd.tsx';
import { Tag } from '../../../ui/Tag.tsx';
import { tipAttrs } from '../../../ui/Tip.tsx';
import { CATEGORY_WHAT, LIST_SHOWN } from './const.ts';

/** Values as code chips; a long list shows its first few and "+N more", which opens the rest in place. */
function Chips({ items, cut }: { items: readonly (string | number)[] | undefined; cut?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return <span className='text-muted'>none</span>;
  const shown = cut && !open ? items.slice(0, LIST_SHOWN) : items;
  return (
    <span
      data-part='config-chips'
      className='flex flex-wrap items-center gap-1 [&_code]:rounded-sm [&_code]:border [&_code]:border-line [&_code]:bg-surface [&_code]:px-2 [&_code]:text-xs [&_code]:text-text'
    >
      {shown.map((item, itemIndex) => (
        <code key={itemIndex}>{String(item)}</code>
      ))}
      {shown.length < items.length && (
        <Button data-part='config-more' variant='ghost' size='xs' onClick={() => setOpen(true)}>
          +{items.length - shown.length} more
        </Button>
      )}
    </span>
  );
}

/** A titled group of rows. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='mb-5 last:mb-0'>
      <h3 className='mt-0 mb-1 eyebrow'>{title}</h3>
      {children}
    </section>
  );
}

/** A setting and what it holds; `what` says what it's for, under its name. */
function Row({ name, what, children }: { name: ReactNode; what?: string; children: ReactNode }) {
  return (
    <div className='grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-baseline gap-3 border-b border-line py-2 last:border-b-0'>
      <span className='min-w-0 text-text'>
        {name}
        {what && <span className='block text-xs text-faint'>{what}</span>}
      </span>
      <span className='min-w-0 text-muted'>{children}</span>
    </div>
  );
}

/**
 * The config in effect, read-only, as an answer: what folds in this review and why, what never does,
 * which files are tests or left out. Each category carries its own call patterns and markers.
 */
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
  const scoreOf = (category: string) => {
    const fold = config.folds[category];
    return fold === false ? null : typeof fold === 'number' ? fold : 1;
  };
  const folding = categories.filter((category) => {
    const score = scoreOf(category);
    return score !== null && score <= threshold;
  }).length;

  return (
    <section data-part='settings-page' data-page='config' hidden={!shown}>
      {configProblems.length > 0 && (
        <Group title='Skipped from the config'>
          <p className='mt-0 mb-2 text-sm text-faint'>These values were left out; the rest of the file applies.</p>
          {configProblems.map((problem, problemIndex) => (
            <Row
              key={problemIndex}
              name={
                <code data-part='config-problem' className='text-sm [overflow-wrap:anywhere] text-text'>
                  {problem.path || problem.file}
                </code>
              }
            >
              <span className='text-mod'>{problem.path ? problem.message : problem.file + ' ' + problem.message}</span>
            </Row>
          ))}
        </Group>
      )}
      <div data-part='config-lead' className='mb-5 rounded-md border border-line bg-surface p-3'>
        <div className='text-lg font-semibold'>{threshold < 0 ? 'Folding is off' : 'Fold level ' + threshold}</div>
        <div className='text-sm text-muted'>
          {threshold < 0
            ? 'Nothing folds.'
            : `${folding} of ${categories.length} categories fold: those scored ${threshold} or lower.`}
        </div>
      </div>
      <Group title='What folds'>
        {categories.map((category) => {
          const score = scoreOf(category);
          const patterns = (config.callPatterns || []).filter((pattern) => pattern.category === category);
          const state = score === null ? 'off' : score <= threshold ? 'folds' : 'shown';
          return (
            <div
              key={category}
              data-part='config-category'
              data-category={category}
              data-state={state}
              className='grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-start gap-3 border-b border-line py-2 last:border-b-0'
            >
              <span
                className={clsx(
                  'inline-flex min-w-0 items-center gap-2 text-text',
                  state === 'off' && 'text-faint line-through',
                )}
              >
                <span className='dot' style={{ background: catColor(category) }} />
                {category}
              </span>
              <span className='grid min-w-0 gap-1 text-sm text-muted'>
                {CATEGORY_WHAT[category] && <span>{CATEGORY_WHAT[category]}</span>}
                {category === 'comment' && <Chips items={config.keepCommentMarkers} cut />}
                {patterns.map((pattern, patternIndex) => (
                  <span key={patternIndex} className='grid gap-1'>
                    <span className='flex flex-wrap items-baseline gap-2'>
                      calls on <Chips items={pattern.receivers} />
                    </span>
                    <span className='flex flex-wrap items-baseline gap-2'>
                      {pattern.methods ? (
                        <>
                          methods <Chips items={pattern.methods} cut />
                        </>
                      ) : (
                        'any method'
                      )}
                    </span>
                  </span>
                ))}
              </span>
              <span className='flex items-center gap-2 justify-self-end'>
                {score !== null && <span className='text-xs text-faint tabular-nums'>score {score}</span>}
                <Tag data-part='config-state' color={state === 'folds' ? 'var(--accent)' : undefined}>
                  {state === 'folds' ? 'Folds' : state === 'shown' ? 'Shown' : 'Off'}
                </Tag>
              </span>
            </div>
          );
        })}
      </Group>
      <Group title='Never folded'>
        <Row name='Keep directive' what='a region marked with it'>
          <Chips items={[config.keepDirective]} />
        </Row>
      </Group>
      <Group title='Files'>
        <Row name='Test files' what='what Hide tests hides'>
          <Chips items={config.testFilePatterns} cut />
        </Row>
        <Row name='Left out' what='listed but never read'>
          <Chips items={config.exclude} cut />
        </Row>
      </Group>
    </section>
  );
}

/** Where the config comes from and how to change it, in one line. */
export function ConfigFoot() {
  const { configSource, revealing } = useLens((state) => ({
    configSource: state.data.configSource,
    revealing: isBusy(state, 'reveal-config'),
  }));
  if (!configSource) {
    return (
      <div data-part='config-foot' className='flex min-w-0 items-center gap-2 whitespace-nowrap'>
        Built-in defaults · no <code>.lens.json</code> here
      </div>
    );
  }
  return (
    <div data-part='config-foot' className='flex min-w-0 items-center gap-2 whitespace-nowrap'>
      Defaults +
      <Button
        id='config-source'
        variant='ghost'
        size='xs'
        className='min-w-0 font-mono text-text'
        // the name is enough to know it; where it is, in the tooltip
        {...tipAttrs(configSource)}
        disabled={revealing}
        onClick={() => void revealConfigFile()}
      >
        <FolderOpen size={13} className='flex-none' />
        .lens.json
      </Button>
      <span className='text-line-strong'>·</span>
      edit it, then <Kbd combo='r' size='sm' /> to reload
    </div>
  );
}
