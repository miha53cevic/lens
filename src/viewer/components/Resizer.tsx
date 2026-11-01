import type { PointerEvent as ReactPointerEvent } from 'react';
import { hiddenStyle } from '../shared.ts';

interface ResizerProps {
  id: string;
  label: string;
  /** The id of the panel the drag resizes */
  panelId: string;
  hidden: boolean;
  /** The panel's width for the pointer's position */
  widthAt: (event: PointerEvent, panel: HTMLElement) => number;
  /** The drag ended: the final width */
  onResized: (width: number) => void;
}

/** A drag handle between panels. The width is set on the panel as the pointer moves (no re-render per move). */
export function Resizer({ id, label, panelId, hidden, widthAt, onResized }: ResizerProps) {
  const startDrag = (down: ReactPointerEvent<HTMLDivElement>) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    down.preventDefault();
    const handle = down.currentTarget;
    handle.setPointerCapture(down.pointerId);
    handle.dataset.dragging = '';
    document.body.style.userSelect = 'none';
    const move = (event: PointerEvent) => {
      panel.style.width = widthAt(event, panel) + 'px';
    };
    const up = () => {
      delete handle.dataset.dragging;
      document.body.style.userSelect = '';
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      // a click without a drag set no width: there's nothing to keep
      const width = parseInt(panel.style.width, 10);
      if (width) onResized(width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  return (
    <div
      className='w-[9px] flex-none cursor-col-resize bg-line bg-clip-content px-1 [transition:background-color_var(--motion)] hover:bg-accent data-dragging:bg-accent'
      id={id}
      role='separator'
      aria-label={label}
      style={hiddenStyle(hidden)}
      onPointerDown={startDrag}
    />
  );
}
