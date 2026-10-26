import api from "../../services/api";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  KeyRound,
  Link2,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import BrandScene from "../../components/brand/BrandScene";
import BrandLogo from "../../components/landing/BrandLogo";
import "./LoginPage.css";
import ThemeToggle from "../../components/ThemeToggle";
import OtpVerify from "../../components/auth/OtpVerify";

export type LoginAudience = "hiring" | "candidate";

const COPY = {
  hiring: {
    eyebrow: "GOOD PEOPLE. GREAT POSSIBILITIES.",
    title: ["GREAT TEAMS.", "START HERE."],
    tagline: "A little less admin. A lot more human.",
    formEyebrow: "HIRING WORKSPACE",
    heading: "Welcome back!",
    sub: "Your people, plans and next steps. All right here.",
  },
  candidate: {
    eyebrow: "YOUR NEXT CHAPTER",
    title: ["YOUR SKILLS.", "BIG ENERGY."],
    tagline: "Show up. Be yourself. Make your next move.",
    formEyebrow: "CANDIDATE SPACE",
    heading: "Hey, welcome back",
    sub: "Your tests, interviews and results — all in one place.",
  },
} as const;

/** One component, two clearly separated doors: hiring teams and candidates. */
export default function LoginPage({
  audience = "hiring",
}: {
  audience?: LoginAudience;
}) {
  const { login, signInWithToken, isLoggedIn, authError, wrongPortal } =
    useAuth();
  const [params] = useSearchParams();
  const candidate = audience === "candidate";
  const copy = COPY[audience];
  const [sso, setSso] = useState(false);
  useEffect(() => {
    if (candidate) return;
    void api
      .get("/auth/sso/config")
      .then(({ data }) => setSso(data.configured === true))
      .catch(() => {});
  }, [candidate]);
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [name, setName] = useState("");
  const [isSignup, setIsSignup] = useState(
    candidate && params.get("mode") === "signup",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Holds the new session until the email is verified (or the user chooses to do it later).
  const [pending, setPending] = useState<{
    user: any;
    token: string;
    expiresInSeconds: number;
  } | null>(null);

  if (isLoggedIn) return <Navigate to="/" replace />;
  // Old links used ?audience=candidate on the shared page.
  if (!candidate && params.get("audience") === "candidate")
    return <Navigate to="/candidate/login" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        const { data } = await api.post("/auth/register", {
          name: name.trim(),
          email: email.trim(),
          password,
        });
        const token = data.accessToken ?? data.token;
        if (data.verification?.status === "sent")
          setPending({
            user: data.user,
            token,
            expiresInSeconds: data.verification.expiresInSeconds,
          });
        else signInWithToken(data.user, token);
      } else {
        await login(email.trim(), password, audience);
      }
    } catch (error: any) {
      setFormError(
        error.response?.data?.error ||
          "Unable to create your account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const otherPortal =
    wrongPortal && wrongPortal !== audience ? wrongPortal : null;

  return (
    <div className={`auth-shell login-split login-${audience}`}>
      <ThemeToggle className="fixed top-4 right-4 z-10" />
      <section
        className="login-brand-panel"
        aria-label={candidate ? "Candidate sign-in" : "Hiring team sign-in"}
      >
        <Link
          to="/welcome"
          className="login-brand-link"
          aria-label="Wissen Code home"
        >
          <BrandLogo />
        </Link>
        <div className="login-story-copy">
          <p className="brand-eyebrow">{copy.eyebrow}</p>
          <h1>
            {copy.title[0]}
            <br />
            <span>{copy.title[1]}</span>
          </h1>
          <p>{copy.tagline}</p>
        </div>
        <BrandScene candidate={candidate} />
      </section>
      <main className="auth-form-area">
        <Link to="/login" className="login-back login-back-page" aria-label="Back">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        {pending ? (
          <div className="w-full max-w-md">
            <OtpVerify
              email={pending.user.email}
              expiresInSeconds={pending.expiresInSeconds}
              onVerified={() => signInWithToken(pending.user, pending.token)}
              onSkip={() => signInWithToken(pending.user, pending.token)}
            />
          </div>
        ) : (
          <div className="w-full max-w-md animate-fade-in">
            <p className="login-form-eyebrow login-portal-tag">
              {candidate ? (
                <UserRound size={14} aria-hidden="true" />
              ) : (
                <Building2 size={14} aria-hidden="true" />
              )}
              {copy.formEyebrow}
            </p>
            <h2 className="text-3xl font-semibold text-white">
              {isSignup ? "Create your space" : copy.heading}
            </h2>
            <p className="text-surface-500 text-sm mt-3 mb-6">
              {isSignup
                ? "Takes 30 seconds. We’ll email you a code to confirm it’s you."
                : copy.sub}
            </p>

            {candidate && (
              <div
                className="segmented login-mode"
                role="tablist"
                aria-label="Sign in or sign up"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSignup}
                  className="segmented-item"
                  onClick={() => {
                    setIsSignup(false);
                    setFormError(null);
                  }}
                >
                  Log in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSignup}
                  className="segmented-item"
                  onClick={() => {
                    setIsSignup(true);
                    setFormError(null);
                  }}
                >
                  Sign up
                </button>
              </div>
            )}

            {otherPortal ? (
              <div className="login-wrong-portal" role="alert">
                <span className="login-wrong-portal-icon" aria-hidden="true">
                  {otherPortal === "candidate" ? (
                    <UserRound size={20} />
                  ) : (
                    <Building2 size={20} />
                  )}
                </span>
                <div>
                  <strong>
                    {otherPortal === "candidate"
                      ? "That’s a candidate account."
                      : "That’s a hiring team account."}
                  </strong>
                  <p>
                    {otherPortal === "candidate"
                      ? "Candidates sign in from the candidate space — your tests and interviews live there."
                      : "Team members sign in from the hiring workspace."}
                  </p>
                  <Link
                    to={`${otherPortal === "candidate" ? "/candidate/login" : "/admin/login"}?email=${encodeURIComponent(email.trim())}`}
                    className="btn-primary"
                  >
                    {otherPortal === "candidate"
                      ? "Go to candidate sign-in"
                      : "Go to hiring sign-in"}{" "}
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                {sso && !candidate && (
                  <a
                    href="/api/auth/sso/start"
                    className="btn-outline w-full mb-5"
                  >
                    <ShieldCheck className="w-4 h-4" /> Sign in with your
                    company
                  </a>
                )}
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  {isSignup && (
                    <div>
                      <label className="label" htmlFor="signup-name">
                        Full name
                      </label>
                      <input
                        id="signup-name"
                        type="text"
                        className="input"
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        required
                      />
                    </div>
                  )}
                  <div>
                    <label className="label" htmlFor="login-email">
                      {candidate ? "Email" : "Work email"}
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      className="input"
                      placeholder={
                        candidate ? "you@example.com" : "you@company.com"
                      }
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="login-password">
                      Password
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      autoComplete={
                        isSignup ? "new-password" : "current-password"
                      }
                      className="input"
                      placeholder={
                        isSignup ? "At least 8 characters" : "Your password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {(formError || authError) && (
                    <p
                      role="alert"
                      className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                    >
                      {formError || authError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      !email.trim() ||
                      !password ||
                      (isSignup && !name.trim())
                    }
                    className="btn-primary w-full py-3 text-base"
                  >
                    {submitting
                      ? isSignup
                        ? "Creating your space…"
                        : "Signing in…"
                      : isSignup
                        ? "Create account"
                        : candidate
                          ? "Let’s go"
                          : "Sign In"}
                    {!submitting && (
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                  <div className="login-form-help">
                    <Link to="/account/forgot">Forgot password?</Link>
                  </div>
                </form>
              </div>
            )}

            {candidate ? (
              <div className="login-side-note">
                <Link2 size={15} aria-hidden="true" />
                <span>
                  Got an invitation link?{" "}
                  <Link to="/candidates">Paste it here</Link> — no account
                  needed.
                </span>
              </div>
            ) : (
              <div className="login-side-note">
                <KeyRound size={15} aria-hidden="true" />
                <span>
                  Team access is invite-only. Ask your workspace admin for an
                  invite — it arrives by <Mail size={12} className="inline" />{" "}
                  email.
                </span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
