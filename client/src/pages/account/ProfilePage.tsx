import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserAvatar from '../../components/layout/UserAvatar';
import { Save, Check, MessagesSquare, Video, ExternalLink } from 'lucide-react';
import {
  apiError,
  getCandidateInterviews,
  type CandidateInterviewSummary,
} from '../../services/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfilePage() {
  const { user, role, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [interviews, setInterviews] = useState<CandidateInterviewSummary[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(false);

  useEffect(() => {
    if (role === 'candidate') {
      setLoadingInterviews(true);
      getCandidateInterviews()
        .then((res) => {
          if (Array.isArray(res)) setInterviews(res);
        })
        .catch(() => {})
        .finally(() => setLoadingInterviews(false));
    }
  }, [role]);

  if (!user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);

    if (!name.trim() || !email.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setFormError('Enter a valid email address.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      setSaved(true);
    } catch (error) {
      setFormError(apiError(error, 'Failed to save profile'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <div className="page-heading">
        <p className="eyebrow mb-2">Account settings</p>
        <h2 className="text-2xl font-bold text-white">Profile</h2>
        <p className="text-surface-400 text-sm mt-1">Manage your account information.</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-6">
          <UserAvatar user={user} size="lg" />
          <div>
            <p className="text-lg font-semibold text-white">{user.name}</p>
            <span className="badge bg-primary-500/15 text-primary-600 ring-1 ring-primary-500/25 capitalize">
              {user.accessRole ?? role}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="profile-name">
              Full Name
            </label>
            <input
              id="profile-name"
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </div>

          <div>
            <label className="label" htmlFor="profile-email">
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              className="input"
              value={email}
              readOnly
              onChange={(e) => {
                setEmail(e.target.value);
                setSaved(false);
              }}
            />
          </div>

          <div>
            <label className="label" htmlFor="profile-role">
              Role
            </label>
            <input
              id="profile-role"
              className="input opacity-60 cursor-not-allowed"
              value={role}
              disabled
              readOnly
            />
          </div>

          {formError && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
            >
              {formError}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </form>
      </div>

      {role === 'candidate' && (
        <div className="card mt-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessagesSquare className="w-5 h-5 text-primary-400" />
              <h3 className="font-semibold text-white">My Live Technical Interviews</h3>
            </div>
            <span className="badge bg-primary-500/10 text-primary-400 ring-1 ring-primary-500/20 text-xs">
              {interviews.length} Assigned
            </span>
          </div>

          {loadingInterviews ? (
            <p className="text-surface-400 text-sm">Loading interviews…</p>
          ) : interviews.length === 0 ? (
            <p className="text-surface-400 text-sm">
              No live technical interviews assigned yet. Any scheduled technical interviews will
              appear here with direct room access.
            </p>
          ) : (
            <div className="space-y-3">
              {interviews.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    item.status === 'in_progress'
                      ? 'bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/25'
                      : 'bg-surface-900 border-surface-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white text-sm">{item.title}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          item.status === 'in_progress'
                            ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                            : item.status === 'scheduled'
                              ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                              : 'bg-surface-800 text-surface-400'
                        }`}
                      >
                        {item.status === 'in_progress' ? 'Live Now' : item.status}
                      </span>
                    </div>
                    <p className="text-xs text-surface-400">
                      Interviewer: {item.interviewer.name} · {item.timeLimitMinutes} min ·{' '}
                      {item.scheduledAt
                        ? new Date(item.scheduledAt).toLocaleString()
                        : 'Flexible schedule'}
                    </p>
                  </div>
                  <Link
                    to={`/interview/${item.roomToken}`}
                    className={`btn-primary text-xs py-2 px-3.5 flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      item.status === 'in_progress'
                        ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-500/30'
                        : ''
                    }`}
                  >
                    <Video className="w-3.5 h-3.5" />
                    {item.status === 'in_progress' ? 'Join Live Now' : 'Enter Interview Room'}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
