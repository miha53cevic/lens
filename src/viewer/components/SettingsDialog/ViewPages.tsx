import type { ReactNode } from 'react';
import { useLens, type SettingsPage } from '../../store.ts';
import { treeModel } from '../../model/tree.ts';
import {
  setFullUnits,
  setHideTests,
  setHunksOnly,
  setShowRemoved,
  setSideBySide,
  setThreshold,
  setWordDiff,
  stepCodeSize,
  stepUiZoom,
} from '../../actions/prefs.ts';
import { setBuildPreviews, setPlanTab, setSelfChecks } from '../../actions/previews.ts';
import { setTimings } from '../../actions/timings.ts';
import { CODE_SIZE_DEFAULT, CODE_SIZES } from '../../codeSize.ts';
import { UI_ZOOM_DEFAULT, UI_ZOOMS } from '../../../cli-app/zoom.ts';
import { isDiffMode } from '../../shared.ts';
import { isSplit } from '../../model/plans.ts';
import { Kbd } from '../../../ui/Kbd.tsx';
import { Segmented } from '../../../ui/Segmented.tsx';
import { Stepper } from '../../../ui/Stepper.tsx';
import { Switch } from '../../../ui/Switch.tsx';
import { LEVELS } from './const.ts';
import { PageTitle, SettingRow } from './SettingRow.tsx';
import { foldLevelHint } from './util.ts';

/**
 * The view settings, a page per section of the rail. Every page is drawn and only the open one
 * shows, so each control keeps its id (and its state) whichever page is open.
 */
export function ViewPages({ page }: { page: SettingsPage }) {
  const view = useLens((state) => ({
    threshold: state.threshold,
    levelHint: foldLevelHint(state),
    diffMode: isDiffMode(state.data),
    testsPresent: treeModel(state).testsPresent,
    hunksOnly: state.hunksOnly,
    showRemoved: state.showRemoved,
    wordDiff: state.wordDiff,
    split: isSplit(state),
    hideTests: state.hideTests,
    codeSize: state.codeSize,
    uiZoom: state.uiZoom,
    hasSummary: state.data.summary !== null,
    buildPreviews: state.data.buildPreviews,
    selfChecks: state.data.selfChecks,
    planTab: state.data.planTab,
    timings: state.data.timings,
    fullUnits: state.fullUnits,
  }));
  const shown = (id: SettingsPage, title: string, children: ReactNode) => (
    <section data-part='settings-page' data-page={id} hidden={page !== id}>
      <PageTitle>{title}</PageTitle>
      {children}
    </section>
  );

  return (
    <>
      {shown(
        'code',
        'Code',
        <>
          <SettingRow label='Code size' hint={'default ' + CODE_SIZE_DEFAULT + 'px'} hintId='code-size-hint'>
            <Stepper
              id='code-size'
              label='code size'
              value={view.codeSize + 'px'}
              lessLabel='Smaller'
              moreLabel='Larger'
              atMin={view.codeSize === CODE_SIZES[0]}
              atMax={view.codeSize === CODE_SIZES[CODE_SIZES.length - 1]}
              onStep={stepCodeSize}
            />
          </SettingRow>
          <SettingRow label='UI size' hint={'default ' + UI_ZOOM_DEFAULT + '%'} hintId='ui-zoom-hint'>
            <Stepper
              id='ui-zoom'
              label='UI size'
              value={view.uiZoom + '%'}
              lessLabel='Smaller'
              moreLabel='Larger'
              atMin={view.uiZoom === UI_ZOOMS[0]}
              atMax={view.uiZoom === UI_ZOOMS[UI_ZOOMS.length - 1]}
              onStep={stepUiZoom}
            />
          </SettingRow>
        </>,
      )}
      {shown(
        'folding',
        'Folding',
        <SettingRow label='Fold level' hint={view.levelHint} hintId='threshold-hint'>
          <Segmented
            id='threshold'
            label='fold level'
            options={LEVELS}
            value={view.threshold}
            onChange={setThreshold}
          />
        </SettingRow>,
      )}
      {shown(
        'show',
        'Show',
        <>
          {view.diffMode && (
            <SettingRow label='Hunks only' htmlFor='hunks-only' hint='only the changed lines and a few around them'>
              <Kbd combo='h' />
              <Switch id='hunks-only' checked={view.hunksOnly} onChange={setHunksOnly} />
            </SettingRow>
          )}
          {view.diffMode && (
            <SettingRow
              label='Removed lines'
              htmlFor='show-removed'
              hint={view.split ? 'always shown side by side' : undefined}
              disabled={view.split}
            >
              <Kbd combo='x' />
              <Switch
                id='show-removed'
                disabled={view.split}
                checked={view.showRemoved || view.split}
                onChange={setShowRemoved}
              />
            </SettingRow>
          )}
          {view.diffMode && (
            <SettingRow label='Word diff' htmlFor='word-diff' hint='the words a replaced line changed'>
              <Kbd combo='d' />
              <Switch id='word-diff' checked={view.wordDiff} onChange={setWordDiff} />
            </SettingRow>
          )}
          {view.diffMode && (
            <SettingRow
              label='Side by side'
              htmlFor='side-by-side'
              hint='the old side on the left, the new on the right'
            >
              <Kbd combo='l' />
              <Switch id='side-by-side' checked={view.split} onChange={setSideBySide} />
            </SettingRow>
          )}
          {view.testsPresent && (
            <SettingRow label='Hide tests' htmlFor='hide-tests'>
              <Kbd combo='t' />
              <Switch id='hide-tests' checked={view.hideTests} onChange={setHideTests} />
            </SettingRow>
          )}
        </>,
      )}
      {view.hasSummary &&
        shown(
          'summary',
          'Summary',
          <>
            <SettingRow label='Build previews' htmlFor='build-previews' hint="the agent also draws a UI diff's screens">
              <Switch id='build-previews' checked={view.buildPreviews} onChange={setBuildPreviews} />
            </SettingRow>
            <SettingRow
              label='Check yourself'
              htmlFor='self-checks'
              hint='a few questions per flow, answer behind a click'
            >
              <Switch id='self-checks' checked={view.selfChecks} onChange={setSelfChecks} />
            </SettingRow>
            <SettingRow label='Full units' htmlFor='full-units' hint="the rest of a unit's file above and below it">
              <Switch id='full-units' checked={view.fullUnits} onChange={setFullUnits} />
            </SettingRow>
          </>,
        )}
      {shown(
        'tabs',
        'Tabs',
        <SettingRow label='Plan tab' htmlFor='plan-tab' hint='your Lavish plans, beside Code and Summary'>
          <Switch id='plan-tab' checked={view.planTab} onChange={setPlanTab} />
        </SettingRow>,
      )}
      {shown(
        'debug',
        'Debug',
        <SettingRow
          label='Timings'
          htmlFor='timings'
          hint={
            <>
              how long each step takes; <code>lens timings</code> lists them
            </>
          }
        >
          <Switch id='timings' checked={view.timings} onChange={setTimings} />
        </SettingRow>,
      )}
    </>
  );
}
