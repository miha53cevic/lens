import type { PointerEvent as ReactPointerEvent } from 'react';

interface ResizerProps {
  id: string;
  title: string;
  /** The id of the panel the drag resizes */
  panelId: string;
  hidden: boolean;
  /** The panel's width for the pointer's position */
  widthAt: (event: PointerEvent, panel: HTMLElement) => number;
  /** The drag ended: the final width */
  onResized: (width: number) => void;
}

/** A drag handle between panels. The width is set on the panel as the pointer moves (no re-render per move). */
export function Resizer({ id, title, panelId, hidden, widthAt, onResized }: ResizerProps) {
  const startDrag = (down: ReactPointerEvent<HTMLDivElement>) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    down.preventDefault();
    const handle = down.currentTarget;
    handle.setPointerCapture(down.pointerId);
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    const move = (event: PointerEvent) => {
      panel.style.width = widthAt(event, panel) + 'px';
    };
    const up = () => {
      handle.classList.remove('dragging');
      document.body.style.userSelect = '';
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      onResized(parseInt(panel.style.width, 10));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  return (
    <div
      className='resizer'
      id={id}
      title={title}
      style={hidden ? { display: 'none' } : undefined}
      onPointerDown={startDrag}
    />
  );
}
