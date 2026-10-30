// The Housekeeping flow: no Node here, so the viewer imports it too.

/** The P3 flow for what no story needs: the agent's moves and renames, and the units lens files there itself */
export const HOUSEKEEPING = 'Housekeeping';

/** Units lens files under Housekeeping without the agent: import-only and formatting-only changes. */
export function isHousekeeping(unit: { formattingOnly?: boolean; importsOnly?: boolean }): boolean {
  return !!unit.formattingOnly || !!unit.importsOnly;
}
