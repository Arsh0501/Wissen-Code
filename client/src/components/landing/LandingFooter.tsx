import { ArrowUpRight, Code2, MessageCircle, Sparkles } from 'lucide-react';
import './LandingFooter.css';

export default function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="hs-container">
        <div className="landing-footer-card">
          <div className="landing-footer-copy">
            <h2>
              GOOD PEOPLE.
              <br />
              <span>GREAT CONNECTIONS.</span>
            </h2>
            <ul className="landing-footer-journey" aria-label="The hiring journey">
              <li>
                <MessageCircle size={14} aria-hidden="true" /> Meet
              </li>
              <li>
                <Code2 size={15} aria-hidden="true" /> Code
              </li>
              <li>
                <Sparkles size={14} aria-hidden="true" /> Connect
              </li>
            </ul>
          </div>
          <div className="landing-footer-art" aria-hidden="true">
            <span className="landing-footer-orbit" />
            <span className="landing-footer-star">✳</span>
            <img src="/images/wissen-mascot.png" alt="" width="1153" height="1364" loading="lazy" />
            <span className="landing-footer-sticker">
              See you on the other side <ArrowUpRight size={14} />
            </span>
          </div>
        </div>
        <div className="landing-footer-meta">
          <span>© {new Date().getFullYear()} · Made for real connections.</span>
          <a href="#hero-title">
            Back to top <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
