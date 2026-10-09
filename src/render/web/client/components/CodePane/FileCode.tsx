import { useMemo } from 'react';
import { useLens } from '../../store.ts';
import { activeFile, filePlan } from '../../model/plans.ts';
import { askSelLabels } from '../../ask/selection.ts';
import { askSelection } from '../../model/askContext.ts';
import { isTestFile, linesFromTokens, listedOnlyCount } from '../../shared.ts';
import { CodeRows } from '../CodeRows/index.tsx';

/** The open file's rows, or why there are none. */
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

  if (!file || !plan) {
    return (
      <div className='empty'>
        {fileCount > 0
          ? 'no file open — pick one from the tree'
          : listedOnly > 0
            ? 'nothing to analyze — this diff only renamed, deleted, or excluded files (see the tree)'
            : 'no supported files found'}
      </div>
    );
  }
  if (hiddenAsTest) {
    return <div className='empty'>every file here is a test file — untick "hide tests" to see them</div>;
  }
  return (
    <>
      {file.parseError && <div className='notice'>⚠ folding disabled — this file has syntax errors</div>}
      <CodeRows
        path={file.file}
        items={plan.items}
        lines={linesFromTokens(file)}
        changedLines={changedLines}
        gutter={String(file.lineCount).length}
        marks={marks}
      />
    </>
  );
}
