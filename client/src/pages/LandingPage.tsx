import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  Check,
  CheckCheck,
  Code2,
  FileCheck2,
  Menu,
  Play,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import BrandLogo from "../components/landing/BrandLogo";
import HiringExperience, {
  type HiringExperienceHandle,
} from "../components/landing/HiringExperience";
import TalentCharacters from "../components/landing/TalentCharacters";
import LandingFooter from "../components/landing/LandingFooter";
import "./LandingPage.css";
import "./LandingMotion.css";

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const experience = useRef<HiringExperienceHandle>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menuOpen]);
  useEffect(() => {
    if (!page.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    page.current
      .querySelectorAll("[data-reveal]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div className="hiring-site genz-site" ref={page}>
      <a className="hs-skip" href="#main-content">
        Skip to content
      </a>
      <header className="hs-header">
        <div className="hs-container hs-header-inner">
          <Link to="/" className="hs-brand-link" aria-label="Wissen Code home">
            <BrandLogo />
          </Link>
          <button
            ref={menuButton}
            type="button"
            className="hs-menu"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-controls="site-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav
            id="site-navigation"
            className={`hs-navigation${menuOpen ? " is-open" : ""}`}
            aria-label="Main navigation"
          >
            <a href="#experience" onClick={closeMenu}>
              The experience
            </a>
            <a href="#platform" onClick={closeMenu}>
              Platform
            </a>
            <Link to="/candidates" onClick={closeMenu}>
              For candidates
            </Link>
          </nav>
          <div className="hs-nav-actions">
            <ThemeToggle />
            <Link to="/login" className="hs-login">
              Log in <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content">
        <section className="hs-hero hs-container" aria-labelledby="hero-title">
          <div className="hs-hero-copy">
            <p className="hs-eyebrow">
              <span className="hs-status-dot" /> GOOD PEOPLE. GREAT
              POSSIBILITIES.
            </p>
            <h1 id="hero-title">
              YOUR NEXT
              <br />
              <span>GREAT HIRE.</span>
              <br />
              STARTS HERE<span className="gz-heading-period">✳</span>
            </h1>
            <p className="hs-hero-subtitle">
              Schedule interviews. Meet talent. Make the call.
            </p>
            <a href="#experience" className="gz-see-it">
              <span>
                <Play size={11} fill="currentColor" />
              </span>{" "}
              See how it all connects <ArrowDown size={13} />
            </a>
          </div>
          <TalentCharacters />
        </section>
        <div
          className="gz-ticker"
          aria-label="Real skills. Real people. Really good hires."
        >
          <div>
            {[0, 1].map((copy) => (
              <span
                className="gz-ticker-copy"
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
              >
                <span>REAL SKILLS.</span>
                <i>✳</i>
                <span>REAL PEOPLE.</span>
                <i>✳</i>
                <span>REALLY GOOD HIRES.</span>
                <i>✳</i>
              </span>
            ))}
          </div>
        </div>
        <section id="experience" className="gz-process hs-container">
          <div className="gz-process-heading" data-reveal>
            <div>
              <p className="hs-eyebrow">WATCH THE GOOD STUFF HAPPEN</p>
              <h2>
                One flow.
                <br />
                <span>All the right moves.</span>
              </h2>
            </div>
            <p>From the first invite to the final “yes.”</p>
          </div>
          <HiringExperience ref={experience} />
        </section>
        <section
          id="platform"
          className="hs-platform hs-container"
          aria-labelledby="platform-heading"
        >
          <div className="hs-section-heading" data-reveal>
            <div>
              <p className="hs-eyebrow">EVERY MOMENT, CONNECTED</p>
              <h2 id="platform-heading">
                Less coordination.
                <br />
                <span>More connection.</span>
              </h2>
            </div>
            <p>
              Everything your next interview needs.
              <br />
              Already in the room.
            </p>
          </div>
          <div className="hs-feature-grid">
            <article className="hs-feature hs-feature-schedule" data-reveal>
              <div className="hs-feature-heading">
                <span className="hs-feature-icon">
                  <CalendarCheck2 size={22} />
                </span>
                <span>01 / PLAN</span>
                <ArrowUpRight size={19} />
              </div>
              <h3>
                A time. A team.
                <br />
                One invitation.
              </h3>
              <div className="hs-mini-invite">
                <div>
                  <span className="hx-avatar hx-purple">RS</span>
                  <span>
                    <strong>Technical interview</strong>
                    <small>Riya Sharma · Frontend engineer</small>
                  </span>
                </div>
                <div className="hs-invite-date">
                  <span>
                    WED<strong>21</strong>
                  </span>
                  <p>
                    October 2026<small>10:30 – 11:15 · Online</small>
                  </p>
                  <Video size={17} />
                </div>
                <div className="hs-invite-confirmed">
                  <CheckCheck size={15} /> Everyone’s on the same page.
                </div>
              </div>
              <a
                href="#experience"
                onClick={() => experience.current?.selectStage(0)}
              >
                Explore scheduling <ArrowRight size={15} />
              </a>
            </article>
            <article className="hs-feature hs-feature-room" data-reveal>
              <div className="hs-feature-heading">
                <span className="hs-feature-icon">
                  <Code2 size={22} />
                </span>
                <span>02 / CONNECT</span>
                <ArrowUpRight size={19} />
              </div>
              <h3>
                Real code.
                <br />
                Real conversation.
              </h3>
              <div className="hs-mini-room">
                <div className="hs-room-person">
                  <img
                    src="/images/interview-editorial.jpg"
                    alt=""
                    width="1122"
                    height="1402"
                    loading="lazy"
                  />
                  <span>
                    <span /> Interview in progress
                  </span>
                </div>
                <div className="hs-room-code">
                  <span>
                    <Code2 size={13} /> solution.js
                  </span>
                  <code>
                    <em>const</em> nextHire =<br />
                    &nbsp;team.<b>connect</b>();
                  </code>
                  <div>
                    <MessageSquare size={13} />
                    <Video size={13} />
                    <span>
                      <Check size={11} /> Synced
                    </span>
                  </div>
                </div>
              </div>
              <a
                href="#experience"
                onClick={() => experience.current?.selectStage(2)}
              >
                Explore live interviews <ArrowRight size={15} />
              </a>
            </article>
            <article className="hs-feature hs-feature-review" data-reveal>
              <div className="hs-feature-heading">
                <span className="hs-feature-icon">
                  <FileCheck2 size={22} />
                </span>
                <span>03 / UNDERSTAND</span>
                <ArrowUpRight size={19} />
              </div>
              <h3>
                See the skills.
                <br />
                Know the person.
              </h3>
              <div className="hs-mini-score">
                <div>
                  <span className="hx-avatar hx-purple">RS</span>
                  <strong>
                    Candidate scorecard<small>Ready for your review</small>
                  </strong>
                  <CheckCheck size={16} />
                </div>
                {[
                  { label: "Problem solving", width: "86%" },
                  { label: "Code quality", width: "76%" },
                  { label: "Communication", width: "92%" },
                ].map((item) => (
                  <div className="hs-mini-skill" key={item.label}>
                    <span>{item.label}</span>
                    <div>
                      <i style={{ width: item.width }} />
                    </div>
                  </div>
                ))}
                <p>
                  <ShieldCheck size={13} /> Your team. Your decision.
                </p>
              </div>
              <a
                href="#experience"
                onClick={() => experience.current?.selectStage(3)}
              >
                Explore evaluations <ArrowRight size={15} />
              </a>
            </article>
          </div>
        </section>
        <section
          id="your-workspace"
          className="hs-audiences hs-container"
          aria-labelledby="workspace-heading"
        >
          <div className="hs-audience-heading" data-reveal>
            <p className="hs-eyebrow">TWO SIDES. ONE GREAT EXPERIENCE.</p>
            <h2 id="workspace-heading">Your next move starts here.</h2>
          </div>
          <div className="hs-audience-grid">
            <article className="hs-team-entry" data-reveal>
              <div className="hs-audience-top">
                <span>
                  <Users size={21} /> FOR HIRING TEAMS
                </span>
                <span className="hs-orbit-symbol" aria-hidden="true">
                  ↗
                </span>
              </div>
              <h3>
                Build your
                <br />
                next great team.
              </h3>
              <p>Bring your interviews, people and decisions together.</p>
              <div className="hs-team-orbits" aria-hidden="true">
                <i>AK</i>
                <i>RS</i>
                <i>JT</i>
                <span>
                  <BrandLogo inverse />
                </span>
              </div>
            </article>
            <article className="hs-candidate-entry" data-reveal>
              <div className="hs-audience-top">
                <span>
                  <Sparkles size={21} /> FOR CANDIDATES
                </span>
                <span className="hs-candidate-spark" aria-hidden="true">
                  ✳
                </span>
              </div>
              <h3>
                Your skills.
                <br />
                Your next chapter.
              </h3>
              <p>Have an invitation? Open your hiring team’s link.</p>
              <div className="hs-candidate-chip">
                <span className="hs-status-dot" />
                <span>Make a little room for your potential.</span>
              </div>
            </article>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
