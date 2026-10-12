import { create } from 'zustand';
import type { MenuState } from '../shared/api.ts';

/** What the main process last said the menu shows; null until its first answer. */
export const useMenu = create<{ menu: MenuState | null }>(() => ({ menu: null }));
