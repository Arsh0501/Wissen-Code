import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Code2, LogOut, FlaskConical } from 'lucide-react';
import api from '../services/api';
import styles from './AdminLayout.module.css';
import { ADMIN_LAYOUT_MESSAGES as MSG } from '../constants';

export default function AdminLayout({
  title,
  subtitle,
  actions,
  children,
  maxWidth = styles.box,
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
    <div className={`${styles.childrenBox} ${maxWidth}`}>
        <div className={styles.titleBox}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitleText}>{subtitle}</p>}
          </div>
          {judgeMode === 'mock' && (
            <span
              className={styles.codeIsNotLabel}
              title={MSG.codeNotReallyExecuted}
            >
              <FlaskConical className={styles.flaskConicalIcon} /> Mock judge
            </span>
          )}
          {actions && <div className={styles.actionsBox}>{actions}</div>}
        </div>
        {children}
    </div>
  );
}
