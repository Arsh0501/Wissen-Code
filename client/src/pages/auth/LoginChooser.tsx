import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Link2 } from "lucide-react";
import { AdminMascot, CandidateMascot } from "../components/RoleMascots";
import { useAuth } from "../context/AuthContext";
import BrandLogo from "../components/landing/BrandLogo";
import ThemeToggle from "../components/ThemeToggle";
import "./LoginChooser.css";

/** First stop after "Log in": pick the candidate door or the hiring-team door. */
export default function LoginChooser() {
  const { isLoggedIn } = useAuth();
  const [params] = useSearchParams();
  if (isLoggedIn) return <Navigate to="/" replace />;
  // Old links: /login?audience=candidate went straight to the candidate door.
  if (params.get("audience") === "candidate")
    return <Navigate to="/candidate/login" replace />;
  return (
    <div className="login-chooser">
      <header className="public-header">
        <Link to="/welcome" aria-label="Wissen Code home">
          <BrandLogo />
        </Link>
        <div className="public-header-actions">
          <ThemeToggle />
        </div>
      </header>
      <main className="login-chooser-main">
        <h1 className="sr-only">Log in</h1>
        <div className="login-chooser-options">
          <Link to="/admin/login" className="login-option login-option-admin">
            <span className="login-option-icon">
              <AdminMascot />
            </span>
            <span className="login-option-body">
              <strong>Login for admin</strong>
              <span>Assessments, interviews and your hiring team.</span>
            </span>
            <ArrowRight size={26} className="login-option-arrow" />
          </Link>
          <Link
            to="/candidate/login"
            className="login-option login-option-candidate"
          >
            <span className="login-option-icon">
              <CandidateMascot />
            </span>
            <span className="login-option-body">
              <strong>Login for candidate</strong>
              <span>Take your tests, join interviews and see your results.</span>
            </span>
            <ArrowRight size={26} className="login-option-arrow" />
          </Link>
        </div>
        <p className="login-chooser-note">
          <Link2 size={14} aria-hidden="true" /> Got an invitation link?{" "}
          <Link to="/candidates">Paste it here</Link> — no account needed.
        </p>
      </main>
    </div>
  );
}
