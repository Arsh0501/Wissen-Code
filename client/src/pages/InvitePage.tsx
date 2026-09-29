import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPublicInvite, joinInvite, apiError } from '../services/api';
import type { PublicInvite } from '../services/api';
import { formatDate } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { Code2, Clock, FileText, Target, Calendar, ArrowRight, AlertTriangle, ShieldCheck, Link2Off } from 'lucide-react';

// Public landing page for a shared test link: shows the test and asks only for name + email
export default function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { user, signInWithToken } = useAuth();
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [hasAccount, setHasAccount] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getPublicInvite(token).then(setInvite).catch((err) => setLoadError(apiError(err, 'This link could not be opened.')));
  }, [token]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setHasAccount(false);
    setJoining(true);
    try {
      const res = await joinInvite(token, { name, email });
      signInWithToken(res.user, res.token);
      navigate(`/exam/${res.assessmentId}`, { replace: true });
    } catch (err: any) {
      setHasAccount(err?.response?.data?.code === 'HAS_ACCOUNT');
      setError(apiError(err, 'Could not start the test. Please try again.'));
      setJoining(false);
    }
  }

  const a = invite?.assessment;

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-400/10 rounded-full blur-3xl" />

      <ThemeToggle className="absolute top-4 right-4" />
      <div className="relative w-full max-w-lg animate-fade-in">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-on-accent" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">WissenCode</span>
        </div>

        {loadError ? (
          <div className="card text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center mx-auto mb-4">
              <Link2Off className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-semibold text-white">Link not available</h1>
            <p className="text-sm text-surface-500 mt-2">{loadError}</p>
          </div>
        ) : !invite || !a ? (
          <div className="card text-center py-14">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="p-6 border-b border-surface-800">
              <p className="text-[11px] font-semibold text-primary-600 uppercase tracking-wider">You&apos;ve been invited to a coding assessment</p>
              <h1 className="text-2xl font-bold text-white mt-1">{a.name}</h1>
              {a.description && <p className="text-sm text-surface-500 mt-2">{a.description}</p>}
              <div className="grid grid-cols-3 gap-2 mt-5">
                {[
                  { icon: Clock, label: 'Time', value: `${a.timeLimitMinutes} min` },
                  { icon: FileText, label: 'Questions', value: String(a.questionCount) },
                  { icon: Target, label: 'Pass mark', value: `${a.passingScore}%` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-lg bg-surface-950 ring-1 ring-surface-800 px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-surface-500 uppercase tracking-wider"><Icon className="w-3 h-3" /> {label}</div>
                    <div className="text-sm font-semibold text-white mt-0.5 tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
              {a.endAt && (
                <p className="flex items-center gap-1.5 text-xs text-surface-500 mt-3"><Calendar className="w-3.5 h-3.5" /> Available until {formatDate(a.endAt)}</p>
              )}
            </div>

            {invite.canJoin ? (
              <form onSubmit={handleJoin} className="p-6 space-y-4">
                {user && (
                  <p className="text-xs text-surface-500 rounded-lg bg-surface-950 ring-1 ring-surface-800 px-3 py-2">
                    You&apos;re currently signed in as <b className="text-surface-300">{user.name}</b>. Continuing will switch to the details below.
                  </p>
                )}
                <div>
                  <label className="label" htmlFor="inv-name">Full name</label>
                  <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" required minLength={2} maxLength={80} autoFocus />
                </div>
                <div>
                  <label className="label" htmlFor="inv-email">Email</label>
                  <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" required maxLength={200} />
                  <p className="text-xs text-surface-500 mt-1">Use the same email if you need to come back and continue.</p>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">
                    {error}
                    {hasAccount && (
                      <button type="button" onClick={() => navigate('/login')} className="block mt-1 font-semibold underline">Go to sign in</button>
                    )}
                  </div>
                )}

                <div className="rounded-lg bg-surface-950 ring-1 ring-surface-800 p-3 text-xs text-surface-400 flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>The timer starts only when you click <b className="text-surface-200">Start Assessment</b> on the next screen. During the test, leaving the tab 3 times submits it automatically.</span>
                </div>

                <button type="submit" disabled={joining} className="btn-primary w-full py-2.5">
                  {joining ? 'Opening test...' : <>Continue to test <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            ) : (
              <div className="p-6">
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/25 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{invite.problem}</span>
                </div>
                <p className="text-xs text-surface-500 mt-3">If you think this is a mistake, contact the person who sent you the link.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
