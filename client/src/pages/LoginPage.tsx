import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MOCK_USERS } from '../data/mockUsers';
import { Code2 } from 'lucide-react';

export default function LoginPage() {
  const { login, isLoggedIn, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await login(email.trim(), password);
  }

  function fillDemoAccount(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary-400/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/30">
              <Code2 className="w-7 h-7 text-on-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">WissenCode</h1>
              <p className="text-xs text-surface-500 uppercase tracking-widest">Assessment Platform</p>
            </div>
          </div>
          <p className="text-surface-400 text-sm">Sign in to continue to the platform</p>
        </div>

        {/* Login Card */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label className="label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                className="input"
                placeholder="you@wissen.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                className="input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {authError && (
              <p role="alert" className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={!email.trim() || !password}
              className="btn-primary w-full py-3 text-base"
            >
              Sign In
            </button>
          </form>
        </div>

        {/* Demo accounts for the mock auth layer */}
        <div className="card mt-4">
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">Demo Accounts</p>
          <div className="space-y-2">
            {MOCK_USERS.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => fillDemoAccount(u.email, u.password)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-surface-800 hover:border-surface-600 text-left transition-colors cursor-pointer"
              >
                <span className="text-sm text-surface-300">{u.name}</span>
                <span className="badge bg-surface-800 text-surface-400 ring-1 ring-surface-700 capitalize">
                  {u.role === 'examinee' ? 'candidate' : u.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

