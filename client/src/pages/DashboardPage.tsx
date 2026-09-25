import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getQuestions, getAssessments } from '../services/api';
import type { Question, Assessment } from '../types';
import { FileText, ClipboardList, Zap, Clock, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const { user, role } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        if (role === 'admin') {
          const data = await getQuestions();
          if (!cancelled) setQuestions(data);
        } else {
          const data = await getAssessments();
          if (!cancelled) setAssessments(data);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        if (!cancelled) setLoadError('Failed to load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Welcome back, {firstName}</h2>
        <p className="text-surface-400 text-sm mt-1">
          {role === 'admin'
            ? "Here's what's happening in your question bank."
            : 'Here are your available assessments.'}
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-6">
          {loadError}
        </p>
      )}

      {role === 'admin' ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{loading ? '—' : questions.length}</p>
                <p className="text-xs text-surface-500">Questions in bank</p>
              </div>
            </div>
            <Link
              to="/admin"
              className="text-sm text-primary-400 hover:text-primary-300 inline-flex items-center gap-1"
            >
              Manage question bank <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">Assessments</p>
                <p className="text-xs text-surface-500">Build and manage test collections</p>
              </div>
            </div>
            <Link
              to="/admin/assessments"
              className="text-sm text-primary-400 hover:text-primary-300 inline-flex items-center gap-1"
            >
              Manage assessments <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div>
          {loading ? (
            <p className="text-surface-500">Loading assessments…</p>
          ) : assessments.length === 0 ? (
            <div className="card text-center py-12">
              <ClipboardList className="w-12 h-12 text-surface-700 mx-auto mb-3" />
              <p className="text-surface-400">No assessments available yet.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {assessments.slice(0, 3).map((a) => (
                <div key={a.id} className="card flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{a.name}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-surface-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {a.timeLimitMinutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> {a._count?.questions ?? a.questions?.length ?? 0} questions
                      </span>
                    </div>
                  </div>
                  <Link to={`/exam/${a.id}`} className="btn-primary">
                    <Zap className="w-4 h-4" /> Start
                  </Link>
                </div>
              ))}
              {assessments.length > 3 && (
                <Link
                  to="/exam"
                  className="text-sm text-primary-400 hover:text-primary-300 inline-flex items-center gap-1"
                >
                  View all assessments <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
