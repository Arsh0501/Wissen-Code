import api from '../services/api';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight } from 'lucide-react';
import LocationsGlobe from '../components/landing/LocationsGlobe';
import './LoginPage.css';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const { login, signInWithToken, isLoggedIn, authError } = useAuth();
  const [sso, setSso] = useState(false);
  useEffect(() => { void api.get('/auth/sso/config').then(({ data }) => setSso(data.configured === true)).catch(() => {}); }, []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignup) {
        const { data } = await api.post('/auth/register', { name: name.trim(), email: email.trim(), password });
        signInWithToken(data.user, data.accessToken ?? data.token);
      } else {
        await login(email.trim(), password);
      }
    } catch (error: any) {
      setFormError(error.response?.data?.error || 'Unable to create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell login-split">
      <ThemeToggle className="fixed top-4 right-4 z-10" />
      <section className="login-globe-panel" aria-label="Wissen global offices">
        <LocationsGlobe compact />
        <h1 className="login-globe-welcome"><span>Welcome to</span>Wissen Code</h1>
      </section>
      <main className="auth-form-area">
        <div className="w-full max-w-md animate-fade-in">
          <p className="login-form-eyebrow">{isSignup ? 'Create your account' : 'Login to your account'}</p>
          <h2 className="text-3xl font-semibold text-white">{isSignup ? 'Join Wissen Code' : 'Welcome back!'}</h2>
          <p className="text-surface-500 text-sm mt-3 mb-8">
            {isSignup ? 'Create an account to continue.' : 'It’s nice to see you again. Ready to code?'}
          </p>
          <div>
            {sso && !isSignup && <a href="/api/auth/sso/start" className="btn-outline w-full mb-5">Sign in with your company</a>}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {isSignup && <div>
                <label className="label" htmlFor="signup-name">Full name</label>
                <input id="signup-name" type="text" className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </div>}
              <div>
                <label className="label" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  className="input"
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
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
                  autoComplete="current-password"
                  className="input"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {(formError || authError) && (
                <p role="alert" className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {formError || authError}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || !email.trim() || !password || (isSignup && !name.trim())}
                className="btn-primary w-full py-3 text-base"
              >
                {submitting ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign In')}
                {!submitting && (
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <div className="login-form-help"><Link to="/account/forgot">Forgot password?</Link></div>
            </form>
          </div>
          <p className="login-signup-switch">
            {isSignup ? 'Already have an account?' : 'Don’t have an account?'}{' '}
            <button type="button" onClick={() => { setIsSignup(!isSignup); setFormError(null); }}>
              {isSignup ? 'Log in' : 'Sign up'}
            </button>
          </p>
          {!isSignup && <p className="text-xs text-surface-500 mt-6 text-center">Invited to an assessment? Open the invitation link shared with you.</p>}
        </div>
      </main>
    </div>
  );
}
