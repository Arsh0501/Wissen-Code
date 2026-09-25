import React from 'react';
import type { Availability } from '../types';
import { CheckCircle, XCircle } from 'lucide-react';

export function formatDate(value: string | null | undefined, withTime = true): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`;
}

export function scoreTextClass(pct: number): string {
  if (pct >= 70) return 'text-emerald-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-600';
}

// <input type="datetime-local"> works in local time without a zone suffix
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseJsonArray<T = string>(value: string | null | undefined): T[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const AVAILABILITY_STYLES: Record<Availability, { label: string; className: string }> = {
  open: { label: 'Live', className: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/25' },
  upcoming: { label: 'Scheduled', className: 'bg-sky-500/15 text-sky-600 ring-sky-500/25' },
  closed: { label: 'Closed', className: 'bg-surface-700/50 text-surface-300 ring-surface-600' },
  draft: { label: 'Draft', className: 'bg-amber-500/15 text-amber-600 ring-amber-500/25' },
  archived: { label: 'Archived', className: 'bg-surface-800 text-surface-500 ring-surface-700' },
};

export function AvailabilityBadge({ value }: { value?: Availability }) {
  const style = AVAILABILITY_STYLES[value || 'draft'];
  return (
    <span className={`badge ring-1 ${style.className}`}>
      {value === 'open' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse-dot" />}
      {style.label}
    </span>
  );
}

export function PassFailBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="badge bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/25 gap-1">
      <CheckCircle className="w-3 h-3" /> Passed
    </span>
  ) : (
    <span className="badge bg-red-500/15 text-red-600 ring-1 ring-red-500/25 gap-1">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'bg-primary-500/10 text-primary-700',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  // Tailwind classes for the icon tile (background + text colour)
  tone?: string;
}) {
  return (
    <div className="card p-5 transition-shadow hover:shadow-md hover:shadow-surface-700/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-white mt-2 tabular-nums tracking-tight">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {hint && <p className="text-xs text-surface-500 mt-3 pt-3 border-t border-surface-800">{hint}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-surface-500">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16">
      <Icon className="w-14 h-14 text-surface-700 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-surface-300 mb-1">{title}</h3>
      {body && <p className="text-surface-500 text-sm mb-6">{body}</p>}
      {action}
    </div>
  );
}
