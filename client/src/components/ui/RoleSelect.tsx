import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ShieldCheck, UserRound, UsersRound } from 'lucide-react';

const roles = [
  {
    value: 'candidate',
    label: 'Candidate',
    description: 'Take assessments and interviews',
    icon: UserRound,
  },
  {
    value: 'interviewer',
    label: 'Interviewer',
    description: 'Conduct assigned interviews',
    icon: UsersRound,
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Manage the platform and access',
    icon: ShieldCheck,
  },
];

export default function RoleSelect({
  value,
  onChange,
  disabled = false,
  label,
  options = ['candidate', 'interviewer', 'admin'],
}: {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  label: string;
  options?: string[];
}) {
  const choices = roles.filter((role) => options.includes(role.value));
  const selected = choices.find((role) => role.value === value) ?? choices[0];
  const Icon = selected.icon;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280 });
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  function show() {
    setActive(
      Math.max(
        0,
        choices.findIndex((role) => role.value === value),
      ),
    );
    setOpen(true);
  }
  function choose(index: number) {
    close(true);
    if (choices[index].value !== value) onChange(choices[index].value);
  }
  useLayoutEffect(() => {
    if (!open) return;
    const bounds = trigger.current!.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 16);
    const height = choices.length * 68 + 12;
    setPosition({
      top: Math.max(
        8,
        bounds.bottom + height + 8 > window.innerHeight
          ? bounds.top - height - 6
          : bounds.bottom + 6,
      ),
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
      width,
    });
    menu.current?.focus();
  }, [open, choices.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const dismiss = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) dismiss();
    };
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  function navigate(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(
        (index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length,
      );
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : choices.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
        className={`inline-flex min-w-[170px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 ${open ? 'border-primary-500 bg-primary-500/10' : 'border-surface-700 bg-surface-950 hover:border-primary-500/60 hover:bg-primary-500/5'}`}
      >
        <Icon className="h-4 w-4 text-primary-600" aria-hidden="true" />
        <span className="flex-1 text-left">{selected.label}</span>
        <ChevronDown
          className={`h-4 w-4 text-surface-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            tabIndex={-1}
            onKeyDown={navigate}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget as Node) &&
                event.relatedTarget !== trigger.current
              )
                close();
            }}
            style={position}
            className="fixed z-[90] max-h-[80vh] overflow-y-auto rounded-2xl border border-surface-700 bg-surface-900 p-1.5 shadow-2xl outline-none"
          >
            {choices.map((role, index) => {
              const RoleIcon = role.icon;
              return (
                <div
                  key={role.value}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={value === role.value}
                  onPointerMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-colors ${active === index ? 'bg-primary-500/10 text-primary-600' : 'text-surface-200'}`}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary-500/10 text-primary-600">
                    <RoleIcon className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{role.label}</span>
                    <span className="block text-xs text-surface-500">{role.description}</span>
                  </span>
                  {value === role.value && (
                    <Check className="h-4 w-4 flex-none text-primary-600" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
