/**
 * A Summary page's column (`sum-inner`, the Overview's and a unit's): one reading width that the
 * text, cards and drawings share, so on a wide window text doesn't stop short of the card under it.
 * A unit's code card keeps the pane's width: code reads better unwrapped.
 */
export const SUMMARY_COLUMN =
  'flex flex-col gap-5 px-6 pt-6 pb-[104px] [&>*]:min-w-0 [&>*]:max-w-[880px] [&>[data-part=code-card]]:max-w-none';
