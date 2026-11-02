import { useRef, type RefObject } from 'react';

interface ResizeHandleProps {
  containerRef: RefObject<HTMLDivElement>;
  orientation: 'vertical' | 'horizontal';
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export default function ResizeHandle({
  containerRef,
  orientation,
  label,
  value,
  onChange,
  min = 20,
  max = 75,
  className = '',
}: ResizeHandleProps) {
  const drag = useRef<{ pointerId: number; start: number; value: number; size: number } | null>(
    null,
  );
  const vertical = orientation === 'vertical';
  const update = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      title={`${label}. Drag or use arrow keys; double-click to reset.`}
      className={`group flex-none touch-none select-none bg-surface-800 hover:bg-primary-500 focus-visible:bg-primary-500 focus-visible:outline-none z-10 flex items-center justify-center ${vertical ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'} ${className}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          start: vertical ? event.clientX : event.clientY,
          value,
          size: vertical ? bounds.width : bounds.height,
        };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId || !current.size) return;
        const position = vertical ? event.clientX : event.clientY;
        update(current.value + ((position - current.start) / current.size) * 100);
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onChange(vertical ? 42 : 60)}
      onKeyDown={(event) => {
        const decrease = vertical ? 'ArrowLeft' : 'ArrowUp';
        const increase = vertical ? 'ArrowRight' : 'ArrowDown';
        if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        update(
          event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : value + (event.key === decrease ? -1 : 1) * (event.shiftKey ? 10 : 2),
        );
      }}
    >
      <span
        className={`rounded-full bg-surface-500 group-hover:bg-white ${vertical ? 'h-8 w-0.5' : 'w-8 h-0.5'}`}
      />
    </div>
  );
}
