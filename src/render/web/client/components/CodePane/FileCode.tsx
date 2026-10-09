import { TriangleAlert } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useLens } from '../../store.ts';
import { activeFile, filePlan } from '../../model/plans.ts';
import { askSelLabels } from '../../ask/selection.ts';
import { askSelection } from '../../model/askContext.ts';
import { isTestFile, linesFromTokens, listedOnlyCount } from '../../shared.ts';
import { CodeRows } from '../CodeRows/index.tsx';
import { CodeCard, removedCount } from '../CodeCard.tsx';
import { fileStatus } from '../../ui/FileStatus.tsx';
import { findUsages, restoreFileScroll, saveFileScroll } from './util.ts';

/** The open file's code card, or why there's none. */
export function FileCode() {
  const { file, plan, hiddenAsTest, fileCount, listedOnly, selection } = useLens((state) => {
    const file = activeFile(state);
    return {
      file,
      plan: file ? filePlan(state, file) : null,
      hiddenAsTest: !!file && state.hideTests && isTestFile(file.file),
      fileCount: state.data.files.length,
      listedOnly: listedOnlyCount(state.data),
      selection: askSelection(state),
    };
  });
  // the kept Ask selection's rows are tinted: the browser's own highlight goes once the rail's input has focus
  const marks = useMemo(
    () => ({ classes: new Map(askSelLabels(selection).map((label) => [label, 'ask-sel'])) }),
    [selection],
  );
  const changedLines = useMemo(() => new Set(file?.changedLines || []), [file]);
  const path = file?.file ?? null;
  // stable per file: a new callback would run again on every render and reset the scroll
  const restoreScroll = useCallback((body: HTMLDivElement | null) => restoreFileScroll(body, path), [path]);

  if (!file || !plan) {
    return (
      <div className='empty'>
        {fileCount > 0
          ? 'No file open: pick one from the tree.'
          : listedOnly > 0
            ? 'Nothing to analyze: this diff only renamed, deleted or excluded files (see the tree).'
            : 'No supported files found.'}
      </div>
    );
  }
  if (hiddenAsTest) {
    return <div className='empty'>Every file here is a test file. Turn off "Hide tests" in ⋯ to see them.</div>;
  }
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
      bodyRef={restoreScroll}
      onBodyScroll={(event) => saveFileScroll(event.currentTarget, file.file)}
    >
      <div className='code' id='code' onClick={findUsages}>
        <CodeRows
          path={file.file}
          items={plan.items}
          lines={linesFromTokens(file)}
          changedLines={changedLines}
          gutter={String(file.lineCount).length}
          marks={marks}
        />
      </div>
    </CodeCard>
  );
}
