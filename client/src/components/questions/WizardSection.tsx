import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export default function WizardSection({
  title,
  children,
  defaultOpen = true,
  className = '',
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <section
      className={`min-w-0 self-start rounded-xl border border-surface-700 bg-surface-900 ${className}`}
    >
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-surface-100 hover:bg-primary-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          {title}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-primary-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      <div id={contentId} hidden={!open} className="border-t border-surface-700 p-3 sm:p-4">
        {children}
      </div>
    </section>
  );
}
