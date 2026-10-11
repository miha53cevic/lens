import { create } from 'zustand';
import type { StripState } from '../shared/api.ts';

/** What the main process last said the strip shows; null until its first answer. */
export const useStrip = create<{ strip: StripState | null }>(() => ({ strip: null }));
