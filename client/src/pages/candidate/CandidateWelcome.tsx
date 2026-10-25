import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Code2,
  Link2,
  Sparkles,
} from "lucide-react";
import BrandLogo from "../../components/landing/BrandLogo";
import BrandScene from "../../components/BrandScene";
import ThemeToggle from "../../components/ThemeToggle";
import { useAuth } from "../../context/AuthContext";

// Only accept this application's public invitation routes. Never follow arbitrary pasted URLs.
export function invitationPath(value: string, origin: string): string | null {
  try {
    const url = new URL(value.trim(), origin);
    if (
      url.origin !== origin ||
      !/^\/(invite|interview)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
    )
      return null;
    return url.pathname;
  } catch {
    return null;
  }
}

export default function CandidateWelcome() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [invitation, setInvitation] = useState("");
  const [error, setError] = useState("");
  function openInvitation(event: FormEvent) {
    event.preventDefault();
    const path = invitationPath(invitation, window.location.origin);
    if (!path) {
      setError(
        "Paste the full Wissen Code assessment or interview link shared by your hiring team.",
      );
      return;
    }
    navigate(path);
  }
  return (
    <div className="candidate-welcome">
      <a className="skip-link" href="#candidate-content">
        Skip to content
      </a>
      <header className="public-header">
        <Link to="/welcome" aria-label="Wissen Code home">
          <BrandLogo />
        </Link>
        <div className="public-header-actions">
          <ThemeToggle />
          <Link
            to={isLoggedIn ? "/" : "/candidate/login"}
            className="btn-primary"
          >
            {isLoggedIn ? "My workspace" : "Log in"} <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main id="candidate-content" className="candidate-welcome-main">
        <section className="candidate-intro">
          <div>
            <p className="brand-eyebrow">
              <Sparkles size={15} /> YOUR NEXT CHAPTER
            </p>
            <h1>
              BIG TALENT.
              <br />
              <span>MEET YOUR</span>
              <br />
              NEXT MOVE
              <span className="candidate-title-star" aria-hidden="true">
                ✳
              </span>
            </h1>
            <p className="candidate-intro-copy">
              Your interview. Your skills. Your moment.
            </p>
            <Link
              className="btn-primary candidate-main-cta"
              to={isLoggedIn ? "/" : "/candidate/login"}
            >
              {isLoggedIn ? "Open my workspace" : "Enter candidate space"}{" "}
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <BrandScene candidate />
        </section>
        <section
          className="candidate-invitation"
          aria-labelledby="invitation-heading"
        >
          <div>
            <span className="candidate-invitation-icon">
              <Link2 size={24} />
            </span>
            <h2 id="invitation-heading">Got an invite?</h2>
            <p>Paste your hiring team’s link. We’ll take you there.</p>
          </div>
          <form onSubmit={openInvitation}>
            <label className="label" htmlFor="candidate-invite">
              Interview or assessment link
            </label>
            <div className="candidate-invitation-fields">
              <input
                id="candidate-invite"
                className="input"
                value={invitation}
                onChange={(e) => {
                  setInvitation(e.target.value);
                  setError("");
                }}
                placeholder="Paste your invitation link"
                autoComplete="off"
                required
                aria-invalid={!!error}
                aria-describedby={error ? "invite-error" : undefined}
              />
              <button type="submit" className="btn-primary">
                Let’s go <ArrowRight size={17} />
              </button>
            </div>
            {error && (
              <p
                id="invite-error"
                role="alert"
                className="text-sm text-red-600 mt-3"
              >
                {error}
              </p>
            )}
          </form>
        </section>
        <section className="candidate-steps" aria-label="Your hiring journey">
          {[
            {
              icon: CalendarDays,
              title: "Know what’s next.",
              text: "Find your schedule and assessment details.",
              label: "01 / GET READY",
            },
            {
              icon: Code2,
              title: "Show your thinking.",
              text: "Code, collaborate and meet your interviewers.",
              label: "02 / BE YOURSELF",
            },
            {
              icon: Sparkles,
              title: "Keep moving.",
              text: "See your submitted assessments and results.",
              label: "03 / YOUR NEXT STEP",
            },
          ].map(({ icon: Icon, title, text, label }) => (
            <article key={title}>
              <span>
                {label}
                <Icon size={20} />
              </span>
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="public-footer">
        <span>A little less pressure. A lot more possibility.</span>
        <Link to="/welcome">
          Hiring a team? <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
