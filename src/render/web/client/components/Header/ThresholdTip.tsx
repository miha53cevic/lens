import clsx from 'clsx';
import { useLens } from '../../store.ts';

/** What each fold level folds in THIS run: the lowest score seen per category across all files. */
export function ThresholdTip() {
  const { files, threshold } = useLens((state) => ({ files: state.data.files, threshold: state.threshold }));
  const lowestScores = new Map<string, number>();
  for (const file of files) {
    for (const region of file.regions) {
      lowestScores.set(region.category, Math.min(lowestScores.get(region.category) ?? 99, region.score));
    }
  }
  const levels = [{ level: -1, label: 'off', text: 'nothing folds — the plain file' }];
  for (let level = 0; level <= 3; level++) {
    const added = [...lowestScores].filter(([, score]) => score === level).map(([category]) => category);
    levels.push({
      level,
      label: String(level),
      text: added.length ? (level > 0 ? 'also ' : '') + added.join(', ') : 'nothing new at this level',
    });
  }

  return (
    <span className='tip' id='threshold-tip'>
      <div className='tip-title'>what folds at each level</div>
      {levels.map((row) => (
        <div key={row.level} className={clsx('tip-row', row.level === threshold && 'current')}>
          <span className='lvl'>{row.label}</span>
          <span>{row.text}</span>
        </div>
      ))}
      <div className='tip-note'>TODO/FIXME comments and lens:keep regions never fold</div>
    </span>
  );
}
