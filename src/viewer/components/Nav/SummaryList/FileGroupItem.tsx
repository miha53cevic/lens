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
    <div className='mt-0 [&+&]:mt-1'>
      <Disclosure
        open={!folded}
        data-part='sum-file-title'
        className='w-full px-2 py-1 text-xs text-muted'
        title={group.file}
        onClick={() => toggleUnitFile(group.file)}
      >
        <span data-part='path' className='flex min-w-0 flex-1 items-center font-mono whitespace-nowrap text-text'>
          {dir && <span className='min-w-0 overflow-hidden text-ellipsis text-faint'>{dir}/</span>}
          <span className='flex-none'>{baseName(group.file)}</span>
        </span>
        <span data-part='n' className='text-faint tabular-nums'>
          {group.members.length}
        </span>
      </Disclosure>
      {!folded && group.members.map((unit) => <UnitItem key={unit.id} unit={unit} active={isActive(unit.id)} />)}
    </div>
  );
}
