import { ArrowRight, Sparkles } from "lucide-react";
import BrandScene from "../brand/BrandScene";

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
  return (
    <section className="studio-welcome" aria-label="Assessment command center">
      <div>
        <p className="brand-eyebrow">
          <Sparkles size={13} /> YOUR HIRING STUDIO
        </p>
        <h2>
          Good people.
          <br />
          <span>Great possibilities.</span>
        </h2>
        <p>Your assessments, interviews and next great teammates.</p>
        <button type="button" className="studio-link" onClick={onExplore}>
          Explore active assessments <ArrowRight size={16} />
        </button>
        <div className="studio-live-stats" aria-label="Assessment activity">
          <span>
            {active} active assessment{active === 1 ? "" : "s"}
          </span>
          <span>{inProgress} in progress</span>
          <span>{completed} completed</span>
        </div>
      </div>
      <BrandScene compact />
    </section>
  );
}
