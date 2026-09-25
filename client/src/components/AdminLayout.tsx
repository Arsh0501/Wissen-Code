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
    <div className={`${maxWidth} mx-auto`}>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-surface-400 text-sm mt-1">{subtitle}</p>}
          </div>
          {judgeMode === 'mock' && (
            <span
              className="badge bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25 gap-1"
              title="Code is not really executed. Set JUDGE_MODE=live in server/.env to use Judge0."
            >
              <FlaskConical className="w-3 h-3" /> Mock judge
            </span>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
    </div>
  );
}
