import { Keyboard, MoreHorizontal, Power, Settings } from 'lucide-react';
import { useLens } from '../../store.ts';
import { treeModel } from '../../model/tree.ts';
import { collapseAll, expandAll } from '../../actions/folds.ts';
import { setHideTests, setHunksOnly, setShowRemoved, setThreshold } from '../../actions/viewSettings.ts';
import { openDialog } from '../../actions/dialogs.ts';
import { endSession } from '../../actions/session.ts';
import { isDiffMode } from '../../shared.ts';
import { Menu, MenuItem, MenuSection, MenuSeparator, MenuSwitch } from '../../ui/Menu.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { foldLevelHint, viewSettingsChanged } from './util.ts';

const LEVELS = [
  { value: -1, label: 'off', title: 'nothing folds' },
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
];

/**
 * ⋯: the view settings first (they act on the Code tab's file and the Summary tab's change
 * alike), then the shortcuts and the settings, then end session.
 */
export function MoreMenu() {
  const more = useLens((state) => ({
    threshold: state.threshold,
    levelHint: foldLevelHint(state),
    diffMode: isDiffMode(state.data),
    testsPresent: treeModel(state).testsPresent,
    hunksOnly: state.hunksOnly,
    showRemoved: state.showRemoved,
    hideTests: state.hideTests,
    changed: viewSettingsChanged(state),
  }));

  return (
    <Menu
      id='more-btn'
      label='View settings and more'
      trigger={
        <>
          <MoreHorizontal size={17} />
          {more.changed && <span className='trigger-dot' title='a view setting is changed' />}
        </>
      }
    >
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
