import { Keyboard, MoreHorizontal, Power, Settings } from 'lucide-react';
import { useLens } from '../../store.ts';
import { treeModel } from '../../model/tree.ts';
import { collapseAll, expandAll } from '../../actions/folds.ts';
import {
  setHideTests,
  setHunksOnly,
  setShowRemoved,
  setThreshold,
  setWordDiff,
  stepCodeSize,
} from '../../actions/prefs.ts';
import { CODE_SIZE_DEFAULT, CODE_SIZES } from '../../codeSize.ts';
import { openDialog } from '../../actions/dialogs.ts';
import { endSession } from '../../actions/session.ts';
import { isDiffMode } from '../../shared.ts';
import { Menu, MenuItem, MenuSection, MenuSeparator, MenuSwitch } from '../../../ui/Menu.tsx';
import { Segmented } from '../../../ui/Segmented.tsx';
import { Stepper } from '../../../ui/Stepper.tsx';
import { foldLevelHint } from './util.ts';
import { setBuildPreviews } from '../../actions/previews.ts';

const LEVELS = [
  { value: -1, label: 'off', title: 'nothing folds' },
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];

/**
 * ⋯: the code's size and the view settings first (they act on the Code tab's file and the
 * Summary tab's change alike), then the summary's own switch, the shortcuts and the settings, then end session.
 */
export function MoreMenu() {
  const more = useLens((state) => ({
    threshold: state.threshold,
    levelHint: foldLevelHint(state),
    diffMode: isDiffMode(state.data),
    testsPresent: treeModel(state).testsPresent,
    hunksOnly: state.hunksOnly,
    showRemoved: state.showRemoved,
    wordDiff: state.wordDiff,
    hideTests: state.hideTests,
    codeSize: state.codeSize,
    hasSummary: state.data.summary !== null,
    buildPreviews: state.data.buildPreviews,
  }));

  return (
    <Menu id='more-btn' label='View settings and more' trigger={<MoreHorizontal size={17} />}>
      <MenuSection title='Code'>
        <div className='menu-row'>
          <span className='menu-label'>
            Code size
            <span className='menu-aside' id='code-size-hint'>
              default {CODE_SIZE_DEFAULT}px
            </span>
          </span>
          <Stepper
            id='code-size'
            label='code size'
            value={more.codeSize + 'px'}
            lessLabel='Smaller'
            moreLabel='Larger'
            atMin={more.codeSize === CODE_SIZES[0]}
            atMax={more.codeSize === CODE_SIZES[CODE_SIZES.length - 1]}
            onStep={stepCodeSize}
          />
        </div>
      </MenuSection>
      <MenuSeparator />
      <MenuSection title='Folding'>
        <div className='menu-row'>
          <span className='menu-label'>Fold level</span>
          <Segmented
            id='threshold'
            label='fold level'
            options={LEVELS}
            value={more.threshold}
            onChange={setThreshold}
          />
        </div>
        <div className='menu-hint' id='threshold-hint'>
          {more.levelHint} <kbd>[</kbd> <kbd>]</kbd>
        </div>
        <MenuItem id='expand-all' shortcut='e' onSelect={expandAll}>
          Expand all
        </MenuItem>
        <MenuItem id='collapse-all' shortcut='c' onSelect={collapseAll}>
          Collapse all
        </MenuItem>
      </MenuSection>
      {(more.diffMode || more.testsPresent) && (
        <>
          <MenuSeparator />
          <MenuSection title='Show'>
            {more.diffMode && (
              <MenuSwitch
                id='hunks-only'
                shortcut='h'
                title='only the changed hunks, with 3 lines of context, like a PR diff'
                checked={more.hunksOnly}
                onChange={setHunksOnly}
              >
                Hunks only
              </MenuSwitch>
            )}
            {more.diffMode && (
              <MenuSwitch id='show-removed' shortcut='x' checked={more.showRemoved} onChange={setShowRemoved}>
                Removed lines
              </MenuSwitch>
            )}
            {more.diffMode && (
              <MenuSwitch
                id='word-diff'
                shortcut='d'
                title='mark the words a replaced line changed, on both sides'
                checked={more.wordDiff}
                onChange={setWordDiff}
              >
                Word diff
              </MenuSwitch>
            )}
            {more.testsPresent && (
              <MenuSwitch
                id='hide-tests'
                shortcut='t'
                title='hide files matching the configured test patterns (*.spec.*, *.test.*, ...)'
                checked={more.hideTests}
                onChange={setHideTests}
              >
                Hide tests
              </MenuSwitch>
            )}
          </MenuSection>
        </>
      )}
      {more.hasSummary && (
        <>
          <MenuSeparator />
          <MenuSection title='Summary'>
            <MenuSwitch id='build-previews' checked={more.buildPreviews} onChange={setBuildPreviews}>
              Build previews
            </MenuSwitch>
          </MenuSection>
        </>
      )}
      <MenuSeparator />
      <MenuItem id='keys-btn' icon={<Keyboard size={14} />} shortcut='?' onSelect={() => openDialog('keys-modal')}>
        Keyboard shortcuts
      </MenuItem>
      <MenuItem id='settings-btn' icon={<Settings size={14} />} onSelect={() => openDialog('settings-modal')}>
        Settings
      </MenuItem>
      <MenuSeparator />
      <MenuItem id='end-session' danger icon={<Power size={14} />} onSelect={endSession}>
        End session
      </MenuItem>
    </Menu>
  );
}
