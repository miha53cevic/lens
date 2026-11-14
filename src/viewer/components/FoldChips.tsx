import { useLens } from '../store.ts';
import { foldCategories } from '../model/plans.ts';
import { setCategoryOpen } from '../actions/folds.ts';
import { catColor } from '../shared.ts';
import { Chip } from '../../ui/Chip.tsx';

/**
 * The fold chips in a code card's header: one per category that folds in this code, opening them all.
 * Quiet until one is on (no border, a hover tint), so they read as controls, not as the header's tags.
 */
export function FoldChips() {
  const { categories, openCats } = useLens((state) => ({
    categories: foldCategories(state),
    openCats: state.openCats,
  }));
  if (categories.length === 0) return null;

  return (
    <div className='flex flex-wrap gap-1' id='toggles'>
      {categories.map((category) => (
        <Chip
          key={category}
          color={catColor(category)}
          checked={openCats.has(category)}
          onChange={(open) => setCategoryOpen(category, open)}
          className='border-transparent hover:bg-hover-bg has-checked:hover:bg-tone-tint'
        >
          {category}
        </Chip>
      ))}
    </div>
  );
}
