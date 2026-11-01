import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Classes for a primitive that takes a `className`: a later class beats the earlier one it conflicts
 * with, so a page overrides a primitive by naming what differs. It has to know lens's scales: by
 * default it reads `text-code` as a color, and `text-code text-accent` would lose the size. Not for
 * code rows, which are the hot path: those classes are constants.
 */
export const cn = extendTailwindMerge({
  extend: {
    theme: {
      text: ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', 'code'],
      spacing: ['control-xs', 'control-sm', 'control', 'control-lg', 'screen-w', 'screen-h'],
      shadow: ['1', '2', '3'],
    },
    classGroups: {
      transition: [{ motion: ['bg', 'colors'] }],
    },
  },
});
