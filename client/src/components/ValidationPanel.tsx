import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, MinusCircle, ChevronDown, ShieldCheck } from 'lucide-react';
import styles from './ValidationPanel.module.css';
import type { CheckKey, CheckStatus, ValidationReport } from '../types';
import { CHECK_LABELS, CHECK_STATUS_LABELS } from '../constants';

const STATUS_STYLE: Record<CheckStatus, { icon: typeof CheckCircle; className: string; label: string }> = {
  pass: { icon: CheckCircle, className: styles.passedClassName, label: CHECK_STATUS_LABELS.pass },
  warn: { icon: AlertTriangle, className: styles.warningClassName, label: CHECK_STATUS_LABELS.warn },
  fail: { icon: XCircle, className: styles.failedClassName, label: CHECK_STATUS_LABELS.fail },
  skipped: { icon: MinusCircle, className: styles.skippedClassName, label: CHECK_STATUS_LABELS.skipped },
};

export function VerdictBadge({ report }: { report: ValidationReport | null | undefined }) {
  if (!report) return <span className={styles.notValidatedLabel}>Not validated</span>;
  const fails = report.checks.filter((c) => c.status === 'fail').length;
  const warns = report.checks.filter((c) => c.status === 'warn').length;
  if (report.verdict === 'fail') return <span className={styles.failsLabel}><XCircle className={styles.xcircleIcon} /> {fails} failed</span>;
  if (report.verdict === 'warn') return <span className={styles.warnsLabel}><AlertTriangle className={styles.xcircleIcon} /> {warns} warning{warns === 1 ? '' : 's'}</span>;
  return <span className={styles.passedLabel}><ShieldCheck className={styles.xcircleIcon} /> Passed</span>;
}

// All seven checks with their status; warnings/failures expand to show details
export default function ValidationPanel({ report }: { report: ValidationReport }) {
  const [open, setOpen] = useState<CheckKey | null>(null);
  return (
    <ul className={styles.ulList}>
      {report.checks.map((c) => {
        const style = STATUS_STYLE[c.status];
        const Icon = style.icon;
        const expandable = !!c.details?.length;
        const isOpen = open === c.key;
        return (
          <li key={c.key} className={styles.messageItem}>
            <button
              type="button"
              disabled={!expandable}
              onClick={() => setOpen(isOpen ? null : c.key)}
              className={styles.messageButton}
              aria-expanded={expandable ? isOpen : undefined}
            >
              <Icon className={`${styles.labelIcon} ${style.className}`} aria-label={style.label} />
              <span className={styles.messageLabel}>
                <span className={styles.label}>{CHECK_LABELS[c.key]}</span>
                <span className={styles.messageLabel2}>{c.message}</span>
              </span>
              {expandable && <ChevronDown className={`${styles.chevronDownIcon} ${isOpen ? styles.chevronDownIconOpen : ''}`} />}
            </button>
            {isOpen && (
              <ul className={styles.ulList2}>
                {c.details!.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
