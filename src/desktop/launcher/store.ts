import { create } from 'zustand';
import type { LauncherState } from '../shared/api.ts';

/** What the main process last said this tab shows; null until its first answer. */
export const useLauncher = create<{ state: LauncherState | null }>(() => ({ state: null }));

/** A slice of the tab's state, for a component that is only rendered once there is one. */
export function useApp<T>(pick: (state: LauncherState) => T): T {
  return useLauncher((store) => pick(store.state!));
}
