import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNavItemsForRole } from './navItems';
import UserAvatar from './UserAvatar';
import ThemeToggle from '../ThemeToggle';

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
    <header className="sticky top-0 z-40 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
      <div className="flex items-center justify-between px-4 md:px-8 py-3 gap-4">
        {location.pathname !== '/' && (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm text-surface-400 hover:bg-surface-800 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
        )}
        <nav aria-label="Primary mobile" className="flex md:hidden gap-1 overflow-x-auto">
          {items.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'bg-primary-500/10 text-primary-700' : 'text-surface-400'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-800 transition-colors cursor-pointer"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <UserAvatar user={user} />
            <span className="hidden sm:block text-sm text-surface-200">{user?.name}</span>
            <ChevronDown className="w-4 h-4 text-surface-500" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 card p-1.5 shadow-xl" role="menu">
              <NavLink
                to="/profile"
                className="block px-3 py-2 rounded-lg text-sm text-surface-300 hover:bg-surface-800 hover:text-white"
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                View Profile
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-500/10 cursor-pointer"
                role="menuitem"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}
