import { TriangleAlert } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { useLens } from '../../store.ts';
import { activeFile, filePlan, isSplit, showsRemoved, splitRows } from '../../model/plans.ts';
import { askSelLabels } from '../../ask/selection.ts';
import { askSelection } from '../../model/askContext.ts';
import { codeLines, isTestFile, listedOnlyCount } from '../../shared.ts';
import { CodeRows, holdSelectionSide, SplitRows } from '../CodeRows/index.tsx';
import { CodeCard, removedCount } from '../CodeCard.tsx';
import { OverviewRuler } from '../OverviewRuler.tsx';
import { fileStatus } from '../../../ui/FileStatus.tsx';
import { findUsages, restoreFileScroll, saveFileScroll } from './util.ts';

/** The Code view has no concerns: only changes tick the ruler. */
const NO_FLAGS: ReadonlyMap<string, string> = new Map();

/** The open file's code card, or why there's none. */
export function FileCode() {
  const { file, plan, hiddenAsTest, fileCount, listedOnly, selection, showRemoved, wordDiff, split, landed } = useLens(
    (state) => {
      const file = activeFile(state);
      return {
        file,
        plan: file ? filePlan(state, file) : null,
        hiddenAsTest: !!file && state.hideTests && isTestFile(file.file),
        fileCount: state.data.files.length,
        listedOnly: listedOnlyCount(state.data),
        selection: askSelection(state),
        showRemoved: showsRemoved(state),
        wordDiff: state.wordDiff,
        split: isSplit(state),
        landed: state.landed,
      };
    },
  );
  // the kept Ask selection's rows are tinted (the browser's own highlight goes once the rail's input
  // has focus), and the row the last jump landed on stays marked
  const path = file?.file ?? null;
  const marks = useMemo(() => {
    const classes = new Map(askSelLabels(selection).map((label) => [label, 'ask-sel']));
    if (landed && landed.path === path) classes.set(landed.label, clsx(classes.get(landed.label), 'landed'));
    return { classes };
  }, [selection, landed, path]);
  const changedLines = useMemo(() => new Set(file?.changedLines || []), [file]);
  const items = plan?.items;
  const pairs = useMemo(
    () => (split && items ? splitRows(items, file, changedLines) : null),
    [split, items, file, changedLines],
  );
  // stable per file: a new callback would run again on every render and reset the scroll
  const restoreScroll = useCallback((body: HTMLDivElement | null) => restoreFileScroll(body, path), [path]);

  if (!file || !plan) {
    return (
      <div className='empty'>
        {fileCount > 0
          ? 'No file open: pick one from the tree.'
          : listedOnly > 0
            ? 'Nothing to analyze: this diff only renamed, deleted or excluded files, or changed binary ones (see the tree).'
            : 'No supported files found.'}
      </div>
    );
  }
  if (hiddenAsTest) {
    return <div className='empty'>Every file here is a test file. Turn off "Hide tests" in ⋯ to see them.</div>;
  }
  const { lines, removedWords } = codeLines(file, wordDiff, showRemoved);
  // side by side numbers the old side too, which may be the longer one
  const oldLineCount = file.lineCount - (file.changedLines?.length ?? 0) + removedCount(file.removals || []);
  const gutter = String(pairs ? Math.max(file.lineCount, oldLineCount) : file.lineCount).length;
  return (
    // keyed by the file: another file mounts afresh, back where the reader left it (scrollStore), even after a refresh
    <CodeCard
      key={file.file}
      status={file.status ? fileStatus(file.status) : undefined}
      path={file.file}
      added={file.changedLines?.length ?? 0}
      removed={removedCount(file.removals || [])}
      notice={
        file.parseError && (
          <>
            <TriangleAlert size={13} /> Folding is off: this file has syntax errors.
          </>
        )
      }
      ruler={<OverviewRuler path={file.file} items={plan.items} changedLines={changedLines} flagged={NO_FLAGS} />}
      bodyRef={restoreScroll}
      onBodyScroll={(event) => saveFileScroll(event.currentTarget, file.file)}
    >
      <div
        className={clsx('code', pairs && 'split')}
        id='code'
        onClick={findUsages}
        onMouseDown={pairs ? holdSelectionSide : undefined}
      >
        {pairs ? (
          <SplitRows
            path={file.file}
            items={pairs}
            lines={lines}
            changedLines={changedLines}
            removedWords={removedWords}
            gutter={gutter}
            marks={marks}
          />
        ) : (
          <CodeRows
            path={file.file}
            items={plan.items}
            lines={lines}
            changedLines={changedLines}
            removedWords={removedWords}
            gutter={gutter}
            marks={marks}
          />
        )}
      </div>
    </CodeCard>
  );
}
