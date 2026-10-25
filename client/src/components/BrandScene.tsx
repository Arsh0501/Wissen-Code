import { CalendarDays, Check, Code2, Sparkles } from "lucide-react";

/** Decorative, shared hiring illustration. Motion is CSS-only and respects reduced motion. */
export default function BrandScene({
  candidate = false,
  compact = false,
}: {
  candidate?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`brand-scene${compact ? " brand-scene-compact" : ""}${candidate ? " brand-scene-candidate" : ""}`}
      aria-hidden="true"
    >
      <div className="brand-scene-orbit" />
      <span className="brand-scene-star">✳</span>
      <span className="brand-scene-note">
        <CalendarDays size={16} />{" "}
        {candidate ? "Your next chapter" : "Meet your next teammate"}
      </span>
      <img
        className="brand-scene-mascot"
        src="/images/wissen-mascot.png"
        alt=""
        width="1153"
        height="1364"
      />
      <span className="brand-scene-code">
        <Code2 size={18} />
        <span>
          skills.meet
          <br />
          <b>opportunity()</b>
        </span>
      </span>
      <span className="brand-scene-check">
        <Check size={16} />{" "}
        {candidate ? "You’ve got this." : "Good things ahead."}{" "}
        <Sparkles size={13} />
      </span>
    </div>
  );
}
