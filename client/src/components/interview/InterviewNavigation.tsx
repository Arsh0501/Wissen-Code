import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function InterviewNavigation() {
  const { role } = useAuth();
  if (role !== 'admin') return null;
  return (
    <nav
      aria-label="Interview sections"
      className="flex gap-2 overflow-x-auto mb-6 border-b border-surface-800 pb-3"
    >
      {[
        { to: '/admin/interviews', label: 'Interviews', end: true },
        { to: '/admin/interviews/question-sets', label: 'Question Sets', end: false },
      ].map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${isActive ? 'bg-primary-500/10 text-primary-500 ring-1 ring-primary-500/30' : 'text-surface-400 hover:text-white hover:bg-surface-800'}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
