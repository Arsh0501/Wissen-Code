import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/layout/UserAvatar';
import { Save, Check } from 'lucide-react';
import styles from './ProfilePage.module.css';
import { EMAIL_RE, PROFILE_PAGE_MESSAGES as MSG } from '../constants';

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
      setFormError(MSG.nameEmailRequired);
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setFormError(MSG.enterValidEmailAddress);
      return;
    }

    setFormError(null);
    updateProfile({ name: name.trim(), email: email.trim() });
    setSaved(true);
  }

  return (
    <div className={styles.profileBox}>
      <div className={styles.profileBox2}>
        <h2 className={styles.profileTitle}>Profile</h2>
        <p className={styles.manageYourAccountText}>{MSG.manageAccountInformation}</p>
      </div>

      <div className="card">
        <div className={styles.nameBox}>
          <UserAvatar user={user} size="lg" />
          <div>
            <p className={styles.nameText}>{user.name}</p>
            <span className={styles.roleLabel}>
              {role}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.profileNameForm} noValidate>
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
            <input id="profile-role" className={styles.profileRoleInput} value={role} disabled readOnly />
          </div>

          {formError && (
            <p role="alert" className={styles.formErrorText}>
              {formError}
            </p>
          )}

          <button type="submit" className="btn-primary">
            {saved ? <Check className={styles.checkIcon} /> : <Save className={styles.checkIcon} />}
            {saved ? 'Saved' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
