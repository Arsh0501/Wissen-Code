import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import {
  AvailabilityBadge, PassFailBadge, StatCard, Spinner, EmptyState,
  formatDate, formatPercent, scoreTextClass,
} from '../../components/ui';
import { getDashboard, apiError } from '../../services/api';
import type { DashboardData } from '../../types';
import {
  ClipboardList, Users, Target, Award, Plus, Library, Activity, ChevronRight, Clock, BarChart3, Sparkles,
} from 'lucide-react';

function ScoreDistribution({ buckets }: { buckets: DashboardData['scoreDistribution'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const peak = buckets.findIndex((b) => b.count === max);
  // Round the axis up to a tidy tick so gridlines land on whole numbers
  const step = Math.max(1, Math.ceil(max / 4));
  const axisMax = step * Math.ceil(max / step);
  const ticks = Array.from({ length: axisMax / step + 1 }, (_, i) => i * step);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-white">Score distribution</h2>
        <span className="text-xs text-surface-500">{total} completed attempts</span>
      </div>
      <p className="text-xs text-surface-500 mb-6">Candidates by overall score, all assessments</p>

      <div className="relative h-44 flex">
        {/* Y axis */}
        <div className="relative w-6 shrink-0 text-[10px] text-surface-500 tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-1 translate-y-1/2 leading-none" style={{ bottom: `${(t / axisMax) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${t === 0 ? 'border-surface-600' : 'border-surface-800'}`}
              style={{ bottom: `${(t / axisMax) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px] px-1">
            {buckets.map((b, i) => (
              <div
                key={b.range}
                className="relative flex-1 h-full flex items-end justify-center cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`w-full max-w-[44px] rounded-t transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                  style={{ height: `${(b.count / axisMax) * 100}%`, minHeight: b.count ? 2 : 0, background: '#8b5cf6' }}
                />
                {i === peak && hover === null && b.count > 0 && (
                  <span
                    className="absolute text-xs font-semibold text-surface-200 tabular-nums"
                    style={{ bottom: `calc(${(b.count / axisMax) * 100}% + 4px)` }}
                  >
                    {b.count}
                  </span>
                )}
                {hover === i && (
                  <div
                    className="absolute z-10 px-2.5 py-1.5 rounded-lg bg-surface-800 border border-surface-700 shadow-xl text-xs whitespace-nowrap pointer-events-none"
                    style={{ bottom: `calc(${(b.count / axisMax) * 100}% + 6px)` }}
                  >
                    <div className="text-surface-400">Score {b.range}</div>
                    <div className="text-white font-semibold tabular-nums">
                      {b.count} candidate{b.count === 1 ? '' : 's'}
                      {total > 0 && <span className="text-surface-400 font-normal"> · {Math.round((b.count / total) * 100)}%</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-[2px] pl-7 pr-1 mt-2">
        {buckets.map((b) => (
          <span key={b.range} className="flex-1 text-center text-[10px] text-surface-500">{b.range}</span>
        ))}
      </div>
    </div>
  );
}

export default function AssessmentDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setData).catch((err) => setError(apiError(err, 'Failed to load dashboard')));
  }, []);

  return (
    <AdminLayout
      title="Assessment Dashboard"
      subtitle="Overview of your assessments and candidate performance"
      actions={
        <>
          <Link to="/admin/questions/new" className="btn-outline text-sm">
            <Library className="w-4 h-4" /> Add Question
          </Link>
          <Link to="/admin/assessments/new" className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Create Assessment
          </Link>
        </>
      }
    >
      {error ? (
        <div className="card text-center text-red-600">{error}</div>
      ) : !data ? (
        <Spinner label="Loading dashboard..." />
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Assessments"
              tone="bg-primary-500/10 text-primary-700"
              icon={ClipboardList}
              value={data.totals.assessments}
              hint={`${data.totals.published} published · ${data.totals.drafts} draft · ${data.totals.questions} questions`}
            />
            <StatCard
              label="Candidates"
              tone="bg-sky-500/10 text-sky-700"
              icon={Users}
              value={data.totals.candidatesStarted}
              hint={`${data.totals.candidatesCompleted} completed · ${data.totals.inProgress} in progress`}
            />
            <StatCard
              label="Average score"
              tone="bg-amber-500/10 text-amber-700"
              icon={Target}
              value={formatPercent(data.totals.averageScore)}
              hint={data.totals.highestScore !== null ? `Highest ${formatPercent(data.totals.highestScore, 0)}` : 'No attempts yet'}
            />
            <StatCard
              label="Pass rate"
              tone="bg-emerald-500/10 text-emerald-700"
              icon={Award}
              value={formatPercent(data.totals.passRate, 0)}
              hint="Of completed attempts"
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <ScoreDistribution buckets={data.scoreDistribution} />
            </div>

            {/* Recent activity */}
            <div className="card lg:col-span-2 p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary-600" /> Recent activity
                </h2>
              </div>
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-surface-500 text-center py-10">No candidate activity yet.</p>
              ) : (
                <ul className="divide-y divide-surface-800/60 max-h-[260px] overflow-y-auto">
                  {data.recentActivity.map((r) => (
                    <li key={`${r.assessmentId}-${r.candidateName}`} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm text-surface-100 truncate">
                          <span className="font-medium">{r.candidateName}</span>
                          <span className="text-surface-500"> {r.status === 'completed' ? 'completed' : 'is taking'} </span>
                          {r.assessmentName}
                        </p>
                        <p className="text-xs text-surface-500">{formatDate(r.finishedAt || r.startedAt)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {r.status === 'completed' && r.overallScore !== null ? (
                          <>
                            <span className={`text-sm font-semibold tabular-nums ${scoreTextClass(r.overallScore)}`}>
                              {r.overallScore.toFixed(0)}%
                            </span>
                            <PassFailBadge passed={!!r.passed} />
                            <Link
                              to={`/admin/reports/${encodeURIComponent(r.candidateName)}/${r.assessmentId}`}
                              className="btn-ghost p-1.5"
                              title="View evaluation"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          </>
                        ) : (
                          <span className="badge bg-sky-500/15 text-sky-600 ring-1 ring-sky-500/25 gap-1">
                            <Clock className="w-3 h-3" /> In progress
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Assessments table */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary-600" /> Assessments
              </h2>
              <Link to="/admin/assessments" className="text-xs text-primary-600 hover:text-primary-700">
                Manage all →
              </Link>
            </div>
            {data.assessments.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No assessments yet"
                body="Create an assessment to start inviting candidates."
                action={<Link to="/admin/assessments/new" className="btn-primary"><Plus className="w-4 h-4" /> Create Assessment</Link>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-800 text-xs text-surface-500 uppercase tracking-wider">
                      <th className="text-left font-medium px-5 py-3">Assessment</th>
                      <th className="text-left font-medium px-3 py-3">Status</th>
                      <th className="text-right font-medium px-3 py-3">Questions</th>
                      <th className="text-right font-medium px-3 py-3">Candidates</th>
                      <th className="text-right font-medium px-3 py-3">Avg score</th>
                      <th className="text-right font-medium px-3 py-3">Pass rate</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/60">
                    {data.assessments.map((a) => (
                      <tr key={a.id} className="hover:bg-surface-800/30">
                        <td className="px-5 py-3">
                          <Link to={`/admin/assessments/${a.id}/edit`} className="font-medium text-surface-100 hover:text-primary-700">
                            {a.name}
                          </Link>
                          <p className="text-xs text-surface-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {a.timeLimitMinutes} min · pass at {a.passingScore}%
                            {a.endAt && <> · closes {formatDate(a.endAt, false)}</>}
                          </p>
                        </td>
                        <td className="px-3 py-3"><AvailabilityBadge value={a.availability} /></td>
                        <td className="px-3 py-3 text-right tabular-nums text-surface-300">{a._count?.questions ?? 0}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-surface-300">
                          {a.stats?.candidatesCompleted ?? 0}
                          {!!a.stats?.inProgress && <span className="text-surface-500"> +{a.stats.inProgress}</span>}
                        </td>
                        <td className={`px-3 py-3 text-right tabular-nums ${a.stats?.averageScore != null ? scoreTextClass(a.stats.averageScore) : 'text-surface-500'}`}>
                          {formatPercent(a.stats?.averageScore)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-surface-300">{formatPercent(a.stats?.passRate, 0)}</td>
                        <td className="px-5 py-3 text-right">
                          <Link to={`/admin/submissions/${a.id}`} className="btn-ghost text-xs px-2 py-1">
                            <Users className="w-3.5 h-3.5" /> Results
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
