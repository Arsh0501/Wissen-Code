import { useEffect, useRef } from 'react';
import { EyeOff, ShieldAlert, ShieldCheck, AlertOctagon } from 'lucide-react';
import styles from './TabSwitchWarning.module.css';
import { TAB_SWITCH_WARNING_MESSAGES as MSG } from '../../constants';

// Severity escalates towards the limit; the switch just before it is the final warning.
function severity(count: number, limit: number) {
  if (count >= limit - 1) {
    return {
      label: 'Final warning',
      ring: styles.finalWarningRing,
      iconBg: styles.finalWarningIconBg,
      chip: styles.finalWarningChip,
      bar: styles.finalWarningBar,
      button: styles.finalWarningButton,
    };
  }
  if (count === limit - 2) {
    return {
      label: 'Second warning',
      ring: styles.secondWarningRing,
      iconBg: styles.secondWarningIconBg,
      chip: styles.secondWarningChip,
      bar: styles.secondWarningBar,
      button: styles.secondWarningButton,
    };
  }
  return {
    label: 'Warning',
    ring: styles.warningRing,
    iconBg: styles.warningIconBg,
    chip: styles.warningChip,
    bar: styles.warningBar,
    button: styles.warningButton,
  };
}

export function TabSwitchWarning({
  count,
  limit,
  awayMs,
  onDismiss,
}: {
  count: number;
  limit: number;
  awayMs: number;
  onDismiss: () => void;
}) {
  const s = severity(count, limit);
  // Switches left before the one that auto-submits
  const remaining = Math.max(0, limit - count);
  const isFinal = remaining <= 1;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.alertdialogBox}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tab-switch-title"
      aria-describedby="tab-switch-desc"
    >
      <div className={`${styles.tabSwitchTitleBox} ${s.ring}`}>
        <div className={styles.tabSwitchTitleBox2}>
          <div className={`${styles.box} ${s.iconBg}`}>
            {isFinal ? <AlertOctagon className={styles.alertOctagonIcon} /> : <EyeOff className={styles.alertOctagonIcon} />}
          </div>
          <span className={`${styles.label} ${s.chip}`}>
            {s.label}
          </span>
          <h2 id="tab-switch-title" className={styles.tabSwitchTitle}>
            {MSG.leftTestWindow}</h2>
          <p id="tab-switch-desc" className={styles.tabSwitchDescText}>
            {MSG.wereAway}<span className={styles.sLabel}>{(awayMs / 1000).toFixed(1)}s</span>{MSG.hasBeenRecordedShared}</p>
        </div>

        {/* Allowance meter */}
        <div className={styles.tabSwitchesUsedBox}>
          <div className={styles.tabSwitchesUsedBox2}>
            <span className={styles.tabSwitchesUsedLabel}>Tab switches used</span>
            <span className={styles.countLabel}>
              {count} <span className={styles.ofLabel}>of {limit}</span>
            </span>
          </div>
          <div className={styles.allowanceMeterBox} aria-hidden="true">
            {Array.from({ length: limit }, (_, i) => (
              <span key={i} className={`${styles.allowanceMeterLabel} ${i < count ? s.bar : styles.allowanceMeterLabelLow}`} />
            ))}
          </div>
          <p className={`${styles.allowanceMeterText} ${isFinal ? styles.allowanceMeterTextFinal : styles.allowanceMeterTextDefault}`}>
            {isFinal
              ? MSG.ifLeaveTestWindow
              : MSG.testSubmittedAutomaticallyAfter(remaining)}
          </p>
        </div>

        <div className={styles.returnToTestBox}>
          <button
            ref={buttonRef}
            type="button"
            onClick={onDismiss}
            className={`${styles.dismissButton} ${s.button}`}
          >
            Return to test
          </button>
        </div>
      </div>
    </div>
  );
}

// Always-visible header chip: reassures when clean, shows the allowance used once switches occur.
export function TabSwitchStatus({ count, limit }: { count: number; limit: number }) {
  if (count === 0) {
    return (
      <div
        className={styles.tabActivityIsBox}
        title={MSG.tabActivityMonitoredLeaving(limit)}
      >
        <ShieldCheck className={styles.shieldCheckIcon} /> Monitored
      </div>
    );
  }
  const s = severity(count, limit);
  return (
    <div
      className={`${styles.youHaveLeftBox} ${s.chip}`}
      title={MSG.haveLeftTestWindow(count, limit)}
    >
      <ShieldAlert className={styles.shieldCheckIcon} />
      {count}/{limit} tab switches
    </div>
  );
}
