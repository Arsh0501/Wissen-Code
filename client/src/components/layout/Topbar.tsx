import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNavItemsForRole } from './navItems';
import UserAvatar from './UserAvatar';
import ThemeToggle from '../ThemeToggle';
import styles from './Topbar.module.css';

// Back goes one level up the page hierarchy rather than through browser history,
// so it never lands on a form the user just submitted.
export function getParentPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'admin') {
    const [, section, id] = parts;
    if (section === 'reports' && parts[3]) return `/admin/submissions/${parts[3]}`;
    if (section === 'submissions') return '/admin/assessments';
    if ((section === 'questions' || section === 'assessments' || section === 'interviews') && id) return `/admin/${section}`;
  }
  return '/';
}

export default function Topbar() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = getNavItemsForRole(role);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  function handleBack() {
    navigate(getParentPath(location.pathname));
  }

  return (
    <header className={styles.primaryMobileHeader}>
      <div className={styles.primaryMobileBox}>
        {location.pathname !== '/' && (
          <button
            type="button"
            onClick={handleBack}
            className={styles.goBackButton}
            aria-label="Go back"
          >
            <ArrowLeft className={styles.arrowLeftIcon} />
            <span className={styles.backLabel}>Back</span>
          </button>
        )}
        <nav aria-label="Primary mobile" className={styles.primaryMobileNav}>
          {items.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `${styles.label} ${isActive ? styles.labelActive : styles.labelInactive}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.chevronDownBox}>
          <ThemeToggle />
        <div className={styles.chevronDownBox2}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={styles.chevronDownButton}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <UserAvatar user={user} />
            <span className={styles.nameLabel}>{user?.name}</span>
            <ChevronDown className={styles.chevronDownIcon} />
          </button>

          {menuOpen && (
            <div className={styles.menuBox} role="menu">
              <NavLink
                to="/profile"
                className={styles.viewProfile}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                View Profile
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className={styles.logoutButton}
                role="menuitem"
              >
                <LogOut className={styles.arrowLeftIcon} /> Sign out
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}
