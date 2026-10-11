import { useLens } from '../../store.ts';
import { fileProgress, unitProgress } from '../../model/progress.ts';
import { listModel } from '../../model/summaryList.ts';
import { ProgressRing } from '../../ui/ProgressRing.tsx';

/** The top of the sidebar: how many files the reader viewed. */
export function FilesProgress() {
  const { done, total } = useLens((state) => fileProgress(state));
  return <ProgressRing done={done} total={total} label={total === 1 ? 'file viewed' : 'files viewed'} />;
}

/** The top of the Summary tab's list: how many changes the reader reviewed, and how many are flagged. */
export function ChangesProgress() {
  const { done, total, legend } = useLens((state) => {
    const list = listModel(state)!;
    const progress = unitProgress(state)!;
    return {
      done: progress.done,
      total: progress.total,
      legend: list.summarized === 0 ? 'not summarized yet' : list.counts.any + ' flagged',
    };
  });
  return (
    <ProgressRing done={done} total={total} label={total === 1 ? 'change reviewed' : 'changes reviewed'}>
      <span className='legend'>{legend}</span>
    </ProgressRing>
  );
}
