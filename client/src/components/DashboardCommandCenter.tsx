import {
  Activity,
  ArrowRight,
  CircuitBoard,
  ClipboardCheck,
  Users,
} from 'lucide-react';
import type { PointerEvent } from 'react';
export default function DashboardCommandCenter({
  active,
  inProgress,
  completed,
  onExplore,
}: {
  active: number;
  inProgress: number;
  completed: number;
  onExplore: () => void;
}) {
  function spotlight(event: PointerEvent<HTMLElement>) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      '--spotlight-x',
      `${event.clientX - bounds.left}px`,
    );
    event.currentTarget.style.setProperty(
      '--spotlight-y',
      `${event.clientY - bounds.top}px`,
    );
  }
  return (
    <section
      className="command-center"
      aria-label="Assessment command center"
      onPointerMove={spotlight}
    >
      <div className="command-center-grid" aria-hidden="true" />
      <div className="relative z-10 max-w-xl">
        <p className="command-kicker">
          <CircuitBoard className="w-4 h-4" aria-hidden="true" /> Assessment
          command center
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold mt-4 text-white">
          Every assessment.
          <br />
          <span className="text-primary-600">One clear view.</span>
        </h2>
        <p className="text-sm text-surface-400 mt-4 max-w-md">
          Manage assessments, check candidate progress and review results.
        </p>
        <button className="command-link" onClick={onExplore}>
          Explore active assessments <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <div className="command-orbit" aria-hidden="true">
        <div className="orbit-ring orbit-ring-outer">
          <span className="orbit-dot" />
        </div>
        <div className="orbit-ring orbit-ring-inner">
          <span className="orbit-dot" />
        </div>
        <div className="orbit-core">
          <CircuitBoard className="w-10 h-10" />
        </div>
        <div className="orbit-signal signal-top">
          <Activity className="w-4 h-4" /> {active} active assessment
          {active === 1 ? '' : 's'}
        </div>
        <div className="orbit-signal signal-bottom">
          <Users className="w-4 h-4" /> {inProgress} candidate
          {inProgress === 1 ? '' : 's'} in progress
        </div>
        <div className="orbit-signal signal-right">
          <ClipboardCheck className="w-4 h-4" /> {completed} completed attempt
          {completed === 1 ? '' : 's'}
        </div>
      </div>
      <div className="command-mobile-stats">
        <span>
          {active} active assessment{active === 1 ? '' : 's'}
        </span>
        <span>{inProgress} in progress</span>
        <span>{completed} completed</span>
      </div>
    </section>
  );
}
