import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownWideNarrow, Check } from 'lucide-react';
import type { DateSortOrder } from '../../services/listSort';

export default function DateSortControl({
  value,
  onChange,
  label,
  compact = false,
  attached = true,
}: {
  value: DateSortOrder;
  onChange: (value: DateSortOrder) => void;
  label: string;
  compact?: boolean;
  attached?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  if (compact) {
    return (
      <div
        ref={root}
        className="relative flex shrink-0"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            trigger.current?.focus();
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            if (!open) return setOpen(true);
            const choices = Array.from(menu.current?.querySelectorAll('button') ?? []);
            const index = choices.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? choices.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
                    choices.length;
            choices[next]?.focus();
          }
        }}
      >
        <button
          ref={trigger}
          type="button"
          aria-label={label}
          title={`Sort by creation date: ${value === 'newest' ? 'Newest' : 'Oldest'}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen(!open)}
          className={`relative inline-flex items-center justify-center border border-surface-700 bg-surface-900 px-3 text-surface-500 hover:bg-primary-500/10 hover:text-primary-600 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${attached ? '-mr-px rounded-l-xl' : 'min-h-10 rounded-xl'}`}
        >
          <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" />
        </button>
        {open && (
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            className={`absolute top-full z-30 mt-2 min-w-[150px] rounded-xl border border-surface-700 bg-surface-900 p-1 shadow-xl ${attached ? 'left-0' : 'right-0'}`}
          >
            {(['newest', 'oldest'] as const).map((order) => (
              <button
                key={order}
                type="button"
                role="menuitemradio"
                aria-checked={value === order}
                onClick={() => {
                  onChange(order);
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm hover:bg-primary-500/10 focus-visible:outline-none focus-visible:bg-primary-500/10 ${value === order ? 'bg-primary-500/10 font-semibold text-primary-600' : 'text-surface-400'}`}
              >
                {order === 'newest' ? 'Newest' : 'Oldest'}
                {value === order && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label={label}
      title="Sort by creation date"
      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-surface-700 bg-surface-900 p-1"
    >
      <ArrowDownWideNarrow className="mx-2 h-4 w-4 text-surface-500" aria-hidden="true" />
      {(['newest', 'oldest'] as const).map((order) => (
        <button
          key={order}
          type="button"
          aria-pressed={value === order}
          onClick={() => onChange(order)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${value === order ? 'bg-primary-500/15 text-primary-600' : 'text-surface-400 hover:bg-surface-800'}`}
        >
          {order === 'newest' ? 'Newest' : 'Oldest'}
        </button>
      ))}
    </div>
  );
}
