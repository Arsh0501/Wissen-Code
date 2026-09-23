import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAssessmentSubmissions } from '../../services/api';
import type { AssessmentSubmissionsResponse, CandidateSubmissionSummary } from '../../services/api';
import {
  ArrowLeft, Code2, Users, Clock, FileText, BarChart3, Search
} from 'lucide-react';

export default function SubmissionsViewer() {
  const { assessmentId } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<AssessmentSubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Route guard: admin only
  useEffect(() => {
    if (role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    if (!assessmentId || role !== 'admin') return;
    loadData();
  }, [assessmentId, role]);

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      const result = await getAssessmentSubmissions(parseInt(assessmentId!));
      setData(result);
    } catch (err: any) {
      console.error('Failed to load submissions:', err);
      setError(err?.response?.status === 403
        ? 'Access denied. Admin role required.'
        : 'Failed to load submissions.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (role !== 'admin') return null;

  const filteredCandidates = data?.candidates.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  function scoreColor(pct: number): string {
    if (pct >= 70) return 'text-emerald-400';
    if (pct >= 40) return 'text-amber-400';
    return 'text-red-400';
  }

  function scoreBg(pct: number): string {
    if (pct >= 70) return 'bg-emerald-500/10 ring-emerald-500/20';
    if (pct >= 40) return 'bg-amber-500/10 ring-amber-500/20';
    return 'bg-red-500/10 ring-red-500/20';
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-surface-800">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/assessments" className="btn-ghost p-2">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary-400" />
              <div>
                <h1 className="text-lg font-bold text-white">Candidate Submissions</h1>
                {data?.assessment && (
                  <p className="text-xs text-surface-500">{data.assessment.name}</p>
                )}
              </div>
            </div>
          </div>
          {data && (
            <div className="flex items-center gap-4 text-sm text-surface-400">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {data.candidates.length} candidate{data.candidates.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {data.assessment.timeLimitMinutes} min
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-surface-400">Loading submissions...</p>
          </div>
        ) : error ? (
          <div className="card text-center py-12">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={loadData} className="btn-outline">Retry</button>
          </div>
        ) : !data || data.candidates.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-16 h-16 text-surface-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-400 mb-2">No submissions yet</h3>
            <p className="text-surface-500 text-sm">No candidates have submitted this assessment.</p>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                type="text"
                className="input pl-10"
                placeholder="Search by candidate name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Candidates List */}
            <div className="space-y-3">
              {filteredCandidates.map((candidate) => (
                <div
                  key={candidate.name}
                  className="card p-4 flex items-center justify-between hover:border-surface-600 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500/20 to-primary-700/20 border border-primary-500/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-400">
                        {candidate.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{candidate.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-surface-500">
                        <span>{candidate.totalQuestions} question{candidate.totalQuestions !== 1 ? 's' : ''} answered</span>
                        <span>•</span>
                        <span>
                          {candidate.session?.finishedAt
                            ? `Submitted ${formatDate(candidate.session.finishedAt)}`
                            : `Last activity ${formatDate(candidate.submittedAt)}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Score badge */}
                    <div className={`px-3 py-1.5 rounded-lg ring-1 ${scoreBg(candidate.overallScore)}`}>
                      <span className={`text-lg font-bold ${scoreColor(candidate.overallScore)}`}>
                        {candidate.overallScore.toFixed(1)}%
                      </span>
                    </div>

                    {/* View Report button */}
                    <Link
                      to={`/admin/reports/${encodeURIComponent(candidate.name)}/${assessmentId}`}
                      className="btn-outline text-sm"
                      id={`view-report-${candidate.name.replace(/\s+/g, '-')}`}
                    >
                      <FileText className="w-4 h-4" />
                      View Report
                    </Link>
                  </div>
                </div>
              ))}

              {filteredCandidates.length === 0 && searchTerm && (
                <div className="text-center py-8 text-surface-500">
                  No candidates matching "{searchTerm}"
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
