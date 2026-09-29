import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, MinusCircle, ChevronDown, ShieldCheck } from 'lucide-react';
import type { CheckKey, CheckStatus, ValidationReport } from '../services/ai';

const CHECK_LABEL: Record<CheckKey, string> = {
  duplicate: 'Duplicate question',
  correctness: 'Correctness',
  ambiguity: 'Clear wording',
  difficulty: 'Difficulty',
  test_cases: 'Test cases / options',
  solution: 'Expected solution',
  edge_cases: 'Edge cases',
};

const STATUS_STYLE: Record<CheckStatus, { icon: typeof CheckCircle; className: string; label: string }> = {
  pass: { icon: CheckCircle, className: 'text-emerald-600', label: 'Passed' },
  warn: { icon: AlertTriangle, className: 'text-amber-600', label: 'Warning' },
  fail: { icon: XCircle, className: 'text-red-600', label: 'Failed' },
  skipped: { icon: MinusCircle, className: 'text-surface-500', label: 'Skipped' },
};

export function VerdictBadge({ report }: { report: ValidationReport | null | undefined }) {
  if (!report) return <span className="badge bg-surface-800 text-surface-500 ring-1 ring-surface-700">Not validated</span>;
  const fails = report.checks.filter((c) => c.status === 'fail').length;
  const warns = report.checks.filter((c) => c.status === 'warn').length;
  if (report.verdict === 'fail') return <span className="badge bg-red-500/10 text-red-700 ring-1 ring-red-500/25 gap-1"><XCircle className="w-3 h-3" /> {fails} failed</span>;
  if (report.verdict === 'warn') return <span className="badge bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/25 gap-1"><AlertTriangle className="w-3 h-3" /> {warns} warning{warns === 1 ? '' : 's'}</span>;
  return <span className="badge bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25 gap-1"><ShieldCheck className="w-3 h-3" /> Passed</span>;
}

// All seven checks with their status; warnings/failures expand to show details
export default function ValidationPanel({ report }: { report: ValidationReport }) {
  const [open, setOpen] = useState<CheckKey | null>(null);
  return (
    <ul className="divide-y divide-surface-800 rounded-lg border border-surface-800 overflow-hidden">
      {report.checks.map((c) => {
        const style = STATUS_STYLE[c.status];
        const Icon = style.icon;
        const expandable = !!c.details?.length;
        const isOpen = open === c.key;
        return (
          <li key={c.key} className="bg-surface-900">
            <button
              type="button"
              disabled={!expandable}
              onClick={() => setOpen(isOpen ? null : c.key)}
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left disabled:cursor-default"
              aria-expanded={expandable ? isOpen : undefined}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.className}`} aria-label={style.label} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white">{CHECK_LABEL[c.key]}</span>
                <span className="block text-xs text-surface-400">{c.message}</span>
              </span>
              {expandable && <ChevronDown className={`w-4 h-4 text-surface-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
            </button>
            {isOpen && (
              <ul className="px-10 pb-3 space-y-1 list-disc text-xs text-surface-300">
                {c.details!.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
