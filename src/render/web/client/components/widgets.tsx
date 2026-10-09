// Small pieces several components use.

import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** ⓘ with a hover tip, the same widget as the fold-level help in the toolbar. */
export function Info({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <span className="info" aria-label={title}>&#9432;
      <span className="tip">
        <div className="tip-title">{title}</div>
        {children}
        {note && <div className="tip-note">{note}</div>}
      </span>
    </span>
  );
}

// The tick box in tree and summary list rows: a span, since the rows are buttons.
export function ViewedBox({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <span
      className="viewed-box" role="checkbox" aria-checked={on} title="mark viewed"
      onClick={(ev) => { ev.stopPropagation(); onToggle(); }}
      onDoubleClick={(ev) => ev.stopPropagation()}
    />
  );
}

/** A modal <dialog>, open while `open` is; Esc and the close button close it natively. */
export function Dialog({ id, className, open, onClose, children }: {
  id: string; className?: string; open: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} id={id} className={className} onClose={onClose}>{children}</dialog>;
}

/**
 * A resizer drag: `widthAt` turns the pointer into the panel's width, set on `panel` straight
 * away (no re-render per move); `done` gets the final width.
 */
export function startDrag(
  down: ReactPointerEvent<HTMLElement>, panel: HTMLElement | null,
  widthAt: (ev: PointerEvent) => number, done: (width: number) => void,
): void {
  if (!panel) return;
  down.preventDefault();
  const handle = down.currentTarget;
  handle.setPointerCapture(down.pointerId);
  handle.classList.add("dragging");
  document.body.style.userSelect = "none";
  const move = (ev: PointerEvent) => { panel.style.width = widthAt(ev) + "px"; };
  const up = () => {
    handle.classList.remove("dragging");
    document.body.style.userSelect = "";
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    done(parseInt(panel.style.width, 10));
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
}
