import { NavLink } from 'react-router-dom';
import { Code2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNavItemsForRole } from './navItems';

export default function Sidebar() {
  const { role } = useAuth();
  const items = getNavItemsForRole(role);

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-surface-800 bg-surface-900/60">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-surface-800">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
          <Code2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-tight">Wissen Code</h1>
          <p className="text-xs text-surface-500">Assessment Platform</p>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3 py-4 space-y-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-500/10 text-primary-300 ring-1 ring-primary-500/30'
                  : 'text-surface-400 hover:text-white hover:bg-surface-800'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
