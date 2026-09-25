import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNavItemsForRole } from './navItems';
import UserAvatar from './UserAvatar';

export default function Topbar() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = getNavItemsForRole(role);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
      <div className="flex items-center justify-between px-4 md:px-8 py-3 gap-4">
        <nav aria-label="Primary mobile" className="flex md:hidden gap-1 overflow-x-auto">
          {items.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'bg-primary-500/10 text-primary-300' : 'text-surface-400'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto relative">
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
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 cursor-pointer"
                role="menuitem"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
