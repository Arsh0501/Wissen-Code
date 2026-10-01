import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Code2 } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import styles from './LoginPage.module.css';
import { LOGIN_PAGE_MESSAGES as MSG } from '../constants';

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

  return (
    <div className={styles.signInToBox}>
      <ThemeToggle className={styles.themeToggle} />
      {/* Background gradient */}
      <div className={styles.backgroundGradientBox}>
        <div className={styles.backgroundGradientBox2} />
        <div className={styles.backgroundGradientBox3} />
      </div>

      <div className={styles.signInToBox2}>
        {/* Logo */}
        <div className={styles.signInToBox3}>
          <div className={styles.codeBox}>
            <div className={styles.codeBox2}>
              <Code2 className={styles.codeIcon} />
            </div>
            <div>
              <h1 className={styles.wissenCodeTitle}>WissenCode</h1>
              <p className={styles.assessmentPlatformText}>Assessment Platform</p>
            </div>
          </div>
          <p className={styles.signInToText}>{MSG.signContinuePlatform}</p>
        </div>

        {/* Login Card */}
        <div className="card">
          <form onSubmit={handleSubmit} className={styles.loginEmailForm} noValidate>
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
              <p role="alert" className={styles.authErrorText}>
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={!email.trim() || !password}
              className={styles.signInButton}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

