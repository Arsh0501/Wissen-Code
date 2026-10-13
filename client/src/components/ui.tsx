import React from 'react';
import type { Availability } from '../types';
import { AVAILABILITY_LABELS } from '../constants';
import { CheckCircle, XCircle } from 'lucide-react';
import styles from './ui.module.css';

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
  if (pct >= 70) return styles.scoreTextStyle;
  if (pct >= 40) return styles.scoreTextStyle2;
  return styles.scoreTextStyle3;
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
  open: { label: AVAILABILITY_LABELS.open, className: styles.liveClassName },
  upcoming: { label: AVAILABILITY_LABELS.upcoming, className: styles.scheduledClassName },
  closed: { label: AVAILABILITY_LABELS.closed, className: styles.closedClassName },
  draft: { label: AVAILABILITY_LABELS.draft, className: styles.draftClassName },
  archived: { label: AVAILABILITY_LABELS.archived, className: styles.archivedClassName },
};

export function AvailabilityBadge({ value }: { value?: Availability }) {
  const style = AVAILABILITY_STYLES[value || 'draft'];
  return (
    <span className={`${styles.label} ${style.className}`}>
      {value === 'open' && <span className={styles.label2} />}
      {style.label}
    </span>
  );
}

export function PassFailBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className={styles.passedLabel}>
      <CheckCircle className={styles.checkCircleIcon} /> Passed
    </span>
  ) : (
    <span className={styles.failedLabel}>
      <XCircle className={styles.checkCircleIcon} /> Failed
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = styles.box4,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  // Tailwind classes for the icon tile (background + text colour)
  tone?: string;
}) {
  return (
    <div className={styles.labelBox}>
      <div className={styles.labelBox2}>
        <div>
          <p className={styles.labelText}>{label}</p>
          <p className={styles.valueText}>{value}</p>
        </div>
        <div className={`${styles.box} ${tone}`}>
          <Icon className={styles.icon} />
        </div>
      </div>
      {hint && <p className={styles.hintText}>{hint}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className={styles.box2}>
      <div className={styles.box3} />
      {label && <p className={styles.labelText2}>{label}</p>}
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
    <div className={styles.actionBox}>
      <Icon className={styles.icon2} />
      <h3 className={styles.title}>{title}</h3>
      {body && <p className={styles.bodyText}>{body}</p>}
      {action}
    </div>
  );
}
