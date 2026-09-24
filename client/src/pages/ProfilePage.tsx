import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/layout/UserAvatar';
import { Save, Check } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfilePage() {
  const { user, role, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  function handleSubmit(e: FormEvent) {
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
    updateProfile({ name: name.trim(), email: email.trim() });
    setSaved(true);
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Profile</h2>
        <p className="text-surface-400 text-sm mt-1">Manage your account information.</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-6">
          <UserAvatar user={user} size="lg" />
          <div>
            <p className="text-lg font-semibold text-white">{user.name}</p>
            <span className="badge bg-primary-500/15 text-primary-400 ring-1 ring-primary-500/25 capitalize">
              {role}
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
            <input id="profile-role" className="input opacity-60 cursor-not-allowed" value={role} disabled readOnly />
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <button type="submit" className="btn-primary">
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
