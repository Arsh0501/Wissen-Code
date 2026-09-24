import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Code2, LayoutDashboard, ClipboardList, Library, LogOut, FlaskConical } from 'lucide-react';
import api from '../services/api';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/assessments', label: 'Assessments', icon: ClipboardList, end: false },
  { to: '/admin/questions', label: 'Question Bank', icon: Library, end: false },
];

export default function AdminLayout({
  title,
  subtitle,
  actions,
  children,
  maxWidth = 'max-w-7xl',
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const { candidateName, logout, role } = useAuth();
  const navigate = useNavigate();
  const [judgeMode, setJudgeMode] = useState<'mock' | 'live' | null>(null);

  useEffect(() => {
    if (role !== 'admin') navigate('/', { replace: true });
  }, [role, navigate]);

  useEffect(() => {
    api.get('/health').then(({ data }) => setJudgeMode(data.judgeMode)).catch(() => setJudgeMode(null));
  }, []);

  if (role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-surface-950">
      <header className="sticky top-0 z-40 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className={`${maxWidth} mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-6 min-w-0">
            <NavLink to="/admin" className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                <Code2 className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-bold text-white hidden sm:inline">WissenCode</span>
            </NavLink>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive ? 'bg-surface-800 text-white' : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {judgeMode === 'mock' && (
              <span
                className="badge bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25 gap-1"
                title="Code is not really executed. Set JUDGE_MODE=live in server/.env to use Judge0."
              >
                <FlaskConical className="w-3 h-3" /> Mock judge
              </span>
            )}
            <span className="text-sm text-surface-400 hidden sm:inline">{candidateName}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost p-2" title="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className={`${maxWidth} mx-auto px-4 sm:px-6 py-8`}>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-surface-400 text-sm mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
