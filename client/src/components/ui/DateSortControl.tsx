import { ArrowDownWideNarrow } from 'lucide-react';
import type { DateSortOrder } from '../../services/listSort';

export default function DateSortControl({
  value,
  onChange,
  label,
}: {
  value: DateSortOrder;
  onChange: (value: DateSortOrder) => void;
  label: string;
}) {
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
