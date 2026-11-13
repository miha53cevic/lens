import type { ReactNode } from 'react';

interface SettingRowProps {
  label: ReactNode;
  /** The control's id, when clicking the label should work it (a switch) */
  htmlFor?: string;
  hint?: ReactNode;
  hintId?: string;
  disabled?: boolean;
  /** The control, and a keycap before it when it has a key */
  children: ReactNode;
}

/** One setting: its name and a line on what it does, its control at the end. */
export function SettingRow({ label, htmlFor, hint, hintId, disabled, children }: SettingRowProps) {
  return (
    <div
      data-part='setting'
      data-disabled={disabled || undefined}
      className='flex items-center gap-3 border-b border-line py-2 last:border-b-0 data-disabled:opacity-60'
    >
      <div className='min-w-0 flex-1'>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <div>{label}</div>}
        {hint && (
          <div id={hintId} className='text-xs/[1.45] text-faint [&_code]:text-muted'>
            {hint}
          </div>
        )}
      </div>
      <div className='flex flex-none items-center gap-2 [&_kbd]:text-muted'>{children}</div>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h3 className='eyebrow mt-0 mb-1'>{children}</h3>;
}
