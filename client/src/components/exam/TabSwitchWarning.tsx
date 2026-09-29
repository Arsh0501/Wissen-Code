import { useEffect, useRef } from 'react';
import { EyeOff, ShieldAlert, ShieldCheck, AlertOctagon } from 'lucide-react';

// Severity escalates towards the limit; the switch just before it is the final warning.
function severity(count: number, limit: number) {
  if (count >= limit - 1) {
    return {
      label: 'Final warning',
      ring: 'ring-red-500/40',
      iconBg: 'bg-red-500/10 text-red-600',
      chip: 'bg-red-500/10 text-red-700 ring-red-500/30',
      bar: 'bg-red-500',
      button: 'bg-red-600 hover:bg-red-500',
    };
  }
  if (count === limit - 2) {
    return {
      label: 'Second warning',
      ring: 'ring-orange-500/40',
      iconBg: 'bg-orange-500/10 text-orange-600',
      chip: 'bg-orange-500/10 text-orange-700 ring-orange-500/30',
      bar: 'bg-orange-500',
      button: 'bg-orange-600 hover:bg-orange-500',
    };
  }
  return {
    label: 'Warning',
    ring: 'ring-amber-500/40',
    iconBg: 'bg-amber-500/10 text-amber-600',
    chip: 'bg-amber-500/10 text-amber-700 ring-amber-500/30',
    bar: 'bg-amber-500',
    button: 'bg-amber-600 hover:bg-amber-500',
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tab-switch-title"
      aria-describedby="tab-switch-desc"
    >
      <div className={`card w-full max-w-md p-0 overflow-hidden shadow-2xl ring-2 ${s.ring} animate-fade-in`}>
        <div className="px-6 pt-7 pb-5 text-center">
          <div className={`w-14 h-14 rounded-2xl ${s.iconBg} flex items-center justify-center mx-auto mb-4`}>
            {isFinal ? <AlertOctagon className="w-7 h-7" /> : <EyeOff className="w-7 h-7" />}
          </div>
          <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ring-1 ${s.chip} mb-3`}>
            {s.label}
          </span>
          <h2 id="tab-switch-title" className="text-lg font-bold text-white">
            You left the test window
          </h2>
          <p id="tab-switch-desc" className="text-sm text-surface-500 mt-2 leading-relaxed">
            You were away for <span className="text-white font-medium">{(awayMs / 1000).toFixed(1)}s</span>. This has been
            recorded and shared with the reviewer.
          </p>
        </div>

        {/* Allowance meter */}
        <div className="px-6 py-4 bg-surface-950 border-y border-surface-800">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Tab switches used</span>
            <span className="text-sm font-bold text-white tabular-nums">
              {count} <span className="text-surface-500 font-medium">of {limit}</span>
            </span>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: limit }, (_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${i < count ? s.bar : 'bg-surface-800'}`} />
            ))}
          </div>
          <p className={`text-xs mt-3 ${isFinal ? 'text-red-700 font-semibold' : 'text-surface-500'}`}>
            {isFinal
              ? 'If you leave the test window again, your test will be submitted automatically.'
              : `Your test will be submitted automatically after ${remaining} more switch${remaining === 1 ? '' : 'es'}.`}
          </p>
        </div>

        <div className="px-6 py-5">
          <button
            ref={buttonRef}
            type="button"
            onClick={onDismiss}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold text-on-accent transition-colors cursor-pointer ${s.button}`}
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
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 text-xs font-medium"
        title={`Tab activity is monitored. Leaving this tab ${limit} times submits your test.`}
      >
        <ShieldCheck className="w-3.5 h-3.5" /> Monitored
      </div>
    );
  }
  const s = severity(count, limit);
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ring-1 text-xs font-medium tabular-nums ${s.chip}`}
      title={`You have left the test window ${count} times. Reaching ${limit} submits your test.`}
    >
      <ShieldAlert className="w-3.5 h-3.5" />
      {count}/{limit} tab switches
    </div>
  );
}
