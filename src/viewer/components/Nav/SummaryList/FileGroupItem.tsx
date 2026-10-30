import { baseName, dirName } from '../../../shared.ts';
import type { FileGroup } from '../../../model/summaryList.ts';
import { unitLabel } from '../../../model/signals.ts';
import { toggleUnitFile } from '../../../actions/summary.ts';
import { Disclosure } from '../../../../ui/Disclosure.tsx';
import { UnitItem } from './UnitItem.tsx';

interface FileGroupItemProps {
  group: FileGroup;
  folded: boolean;
  isActive: (unitId: string) => boolean;
}

/**
 * One file's changes in no flow: the file's name, which folds them, then the changes. A file with
 * one change is that change's row, the file named beside it unless the change is named after it.
 */
export function FileGroupItem({ group, folded, isActive }: FileGroupItemProps) {
  const dir = dirName(group.file);
  if (group.members.length === 1) {
    const [unit] = group.members;
    const base = baseName(group.file);
    return <UnitItem unit={unit} side={unitLabel(unit) === base ? undefined : base} active={isActive(unit.id)} />;
  }
  return (
    <div className='sum-file'>
      <Disclosure
        open={!folded}
        className='sum-file-title'
        title={group.file}
        onClick={() => toggleUnitFile(group.file)}
      >
        <span className='path'>
          {dir && <span className='sum-file-dir'>{dir}/</span>}
          <span className='sum-file-name'>{baseName(group.file)}</span>
        </span>
        <span className='n'>{group.members.length}</span>
      </Disclosure>
      {!folded && group.members.map((unit) => <UnitItem key={unit.id} unit={unit} active={isActive(unit.id)} />)}
    </div>
  );
}
