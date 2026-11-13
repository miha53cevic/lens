import clsx from 'clsx';
import { cn } from './cn.ts';

/** The on / off track, drawn alone: a `MenuSwitch` puts it at the end of its row, which is the button. */
export function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span
      data-part='switch-track'
      className={clsx(
        "relative h-[15px] w-[26px] flex-none rounded-full motion-bg after:absolute after:top-[2px] after:size-[11px] after:rounded-full after:bg-surface after:[transition:left_var(--motion)] after:content-['']",
        checked ? 'bg-accent after:left-[13px]' : 'bg-line-strong after:left-[2px]',
      )}
      aria-hidden
    />
  );
}

interface SwitchProps {
  id?: string;
  /** Its name, when no <label> around it gives one */
  label?: string;
  checked: boolean;
  /** Can't be changed now: another setting decides it */
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/** A setting turned on or off, outside a menu (Settings' rows). In a menu it is a `MenuSwitch`. */
export function Switch({ id, label, checked, disabled, onChange, className }: SwitchProps) {
  return (
    <button
      type='button'
      data-part='switch'
      id={id}
      role='switch'
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn('inline-flex flex-none rounded-full p-1 disabled:opacity-50', className)}
      onClick={() => onChange(!checked)}
    >
      <SwitchTrack checked={checked} />
    </button>
  );
}
