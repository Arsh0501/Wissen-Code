import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FlaskConical } from 'lucide-react';
import api from '../services/api';

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
  const { role } = useAuth();
  const canAccess = role === 'admin' || role === 'interviewer';
  const navigate = useNavigate();
  const [judgeMode, setJudgeMode] = useState<'mock' | 'live' | null>(null);

  useEffect(() => {
    if (!canAccess) navigate('/', { replace: true });
  }, [canAccess, navigate]);

  useEffect(() => {
    api
      .get('/health')
      .then(({ data }) => setJudgeMode(data.judgeMode))
      .catch(() => setJudgeMode(null));
  }, []);

  if (!canAccess) return null;

  return (
    <div className={`${maxWidth} mx-auto`}>
      <div className="page-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Team workspace</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{title}</h1>{' '}
            {judgeMode === 'mock' && (
              <span
                className="badge bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/25 gap-1"
                title="Code is not really executed. Set JUDGE_MODE=live in server/.env to use Judge0."
              >
                <FlaskConical className="w-3 h-3" /> Mock judge
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-surface-400 text-sm mt-1">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
