import { Info } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useLens } from '../../store.ts';
import { activeFile } from '../../model/plans.ts';
import { treeModel } from '../../model/tree.ts';
import { collapseAll, expandAll, setCategoryOpen } from '../../actions/folds.ts';
import { setHideTests, setHunksOnly, setShowRemoved, setThreshold } from '../../actions/toolbar.ts';
import { toggleFileViewed } from '../../actions/viewed.ts';
import { catColor, fileViewKey, hiddenStyle, isDiffMode } from '../../shared.ts';
import { ThresholdTip } from './ThresholdTip.tsx';
import { chipCategories } from './util.ts';

export function Toolbar() {
  const categories = useLens(chipCategories);
  const toolbar = useLens((state) => {
    const file = activeFile(state);
    return {
      openCats: state.openCats,
      testsPresent: treeModel(state).testsPresent,
      hideTests: state.hideTests,
      diffMode: isDiffMode(state.data),
      hunksOnly: state.hunksOnly,
      showRemoved: state.showRemoved,
      threshold: state.threshold,
      // the file's viewed box: a unit on the Summary tab has its own
      viewedShown: state.view === 'code' && !!file,
      viewed: !!file && state.viewedFiles.has(fileViewKey(file)),
      active: state.active,
    };
  });

  return (
    <div className='bar toolbar'>
      <div className='toggles' id='toggles'>
        {categories.length > 0 && <span className='show-label'>FOLDS</span>}
        {categories.map((category) => (
          <label
            key={category}
            className='chip'
            style={{ '--cat': catColor(category) } as CSSProperties}
            title={'toggle ' + category + ' regions expanded'}
          >
            <input
              type='checkbox'
              checked={toolbar.openCats.has(category)}
              onChange={(event) => setCategoryOpen(category, event.target.checked)}
            />
            <span className='dot' />
            {category}
          </label>
        ))}
      </div>
      <span className='spacer' />
      <label
        className='control'
        id='tests-wrap'
        style={hiddenStyle(!toolbar.testsPresent)}
        title='hide files matching the configured test patterns (*.spec.*, *.test.*, ...)'
      >
        <input
          type='checkbox'
          id='hide-tests'
          checked={toolbar.hideTests}
          onChange={(event) => setHideTests(event.target.checked)}
        />{' '}
        hide tests
      </label>
      <label
        className='control'
        id='hunks-wrap'
        style={hiddenStyle(!toolbar.diffMode)}
        title='show only changed hunks with 3 lines of context, like a PR diff'
      >
        <input
          type='checkbox'
          id='hunks-only'
          checked={toolbar.hunksOnly}
          onChange={(event) => setHunksOnly(event.target.checked)}
        />{' '}
        hunks only
      </label>
      <label className='control' id='removed-wrap' style={hiddenStyle(!toolbar.diffMode)}>
        <input
          type='checkbox'
          id='show-removed'
          checked={toolbar.showRemoved}
          onChange={(event) => setShowRemoved(event.target.checked)}
        />{' '}
        removed lines
      </label>
      <label className='control' id='threshold-control'>
        fold ≤{' '}
        <select
          id='threshold'
          title='fold regions scored at or below this level'
          value={String(toolbar.threshold)}
          onChange={(event) => setThreshold(Number(event.target.value))}
        >
          <option value='-1'>off</option>
          <option value='0'>0</option>
          <option value='1'>1</option>
          <option value='2'>2</option>
          <option value='3'>3</option>
        </select>
        <span className='info' id='threshold-info' aria-label='what each fold level shows'>
          <Info size={12} /> <ThresholdTip />
        </span>
      </label>
      <div className='vdivider' />
      <button id='expand-all' onClick={expandAll}>
        expand all
      </button>
      <button id='collapse-all' onClick={collapseAll}>
        collapse all
      </button>
      <div className='vdivider' id='viewed-divider' style={hiddenStyle(!toolbar.viewedShown)} />
      <label
        className='control'
        id='viewed-wrap'
        style={hiddenStyle(!toolbar.viewedShown)}
        title='mark this file as viewed (m)'
      >
        <input type='checkbox' id='viewed' checked={toolbar.viewed} onChange={() => toggleFileViewed(toolbar.active)} />{' '}
        viewed
      </label>
    </div>
  );
}
