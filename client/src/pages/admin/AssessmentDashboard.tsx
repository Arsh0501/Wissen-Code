import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import {
  AvailabilityBadge, PassFailBadge, StatCard, Spinner, EmptyState,
  formatDate, formatPercent, scoreTextClass,
} from '../../components/ui';
import { getDashboard, updateAssessment, apiError } from '../../services/api';
import type { DashboardData, Lifecycle, DashboardTab } from '../../types';
import { LIFECYCLE_LABELS, ASSESSMENT_DASHBOARD_MESSAGES as MSG } from '../../constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Users, Target, Award, Plus, Library, Activity, ChevronRight, Clock, BarChart3, Sparkles,
  FileEdit, PlayCircle, CheckCircle2, CalendarX, Edit, Archive,
} from 'lucide-react';
import styles from './AssessmentDashboard.module.css';

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
      <div className={styles.scoreDistributionBox}>
        <h2 className={styles.scoreDistributionTitle}>Score distribution</h2>
        <span className={styles.totalLabel}>{total} completed attempts</span>
      </div>
      <p className={styles.candidatesByOverallText}>{MSG.candidatesOverallScoreAll}</p>

      <div className={styles.box}>
        {/* Y axis */}
        <div className={styles.yAxisBox}>
          {ticks.map((t) => (
            <span key={t} className={styles.tLabel} style={{ bottom: `${(t / axisMax) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className={styles.yAxisBox2}>
          {ticks.map((t) => (
            <div
              key={t}
              className={`${styles.yAxisBox3} ${t === 0 ? styles.yAxisBoxSelected : styles.yAxisBoxDefault}`}
              style={{ bottom: `${(t / axisMax) * 100}%` }}
            />
          ))}
          <div className={styles.yAxisBox4}>
            {buckets.map((b, i) => (
              <div
                key={b.range}
                className={styles.yAxisBox5}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`${styles.yAxisBox6} ${hover !== null && hover !== i ? styles.yAxisBoxI : ''}`}
                  style={{ height: `${(b.count / axisMax) * 100}%`, minHeight: b.count ? 2 : 0, background: '#8b5cf6' }}
                />
                {i === peak && hover === null && b.count > 0 && (
                  <span
                    className={styles.countLabel}
                    style={{ bottom: `calc(${(b.count / axisMax) * 100}% + 4px)` }}
                  >
                    {b.count}
                  </span>
                )}
                {hover === i && (
                  <div
                    className={styles.scoreBox}
                    style={{ bottom: `calc(${(b.count / axisMax) * 100}% + 6px)` }}
                  >
                    <div className={styles.scoreBox2}>Score {b.range}</div>
                    <div className={styles.countBox}>
                      {b.count} candidate{b.count === 1 ? '' : 's'}
                      {total > 0 && <span className={styles.yAxisLabel}> · {Math.round((b.count / total) * 100)}%</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.yAxisBox7}>
        {buckets.map((b) => (
          <span key={b.range} className={styles.rangeLabel}>{b.range}</span>
        ))}
      </div>
    </div>
  );
}

const LIFECYCLE: Record<Lifecycle, { label: string; className: string }> = {
  draft: { label: LIFECYCLE_LABELS.draft, className: styles.draftClassName },
  scheduled: { label: LIFECYCLE_LABELS.scheduled, className: styles.scheduledClassName },
  active: { label: LIFECYCLE_LABELS.active, className: styles.activeClassName },
  expired: { label: LIFECYCLE_LABELS.expired, className: styles.expiredClassName },
  completed: { label: LIFECYCLE_LABELS.completed, className: styles.completedClassName },
};

export default function AssessmentDashboard() {
  const qc = useQueryClient();
  const { data, error: queryError } = useQuery<DashboardData>({ queryKey: ['dashboard'], queryFn: getDashboard });
  const error = queryError ? apiError(queryError, MSG.failedLoadDashboard) : '';
  const [tab, setTab] = useState<DashboardTab>('all');
  // "Close" marks an assessment completed: it stops accepting candidates and moves to the Completed group
  const close = useMutation({
    mutationFn: (id: number) => updateAssessment(id, { status: 'archived' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  return (
    <AdminLayout
      title="Assessment Dashboard"
      subtitle={MSG.overviewAssessmentsCandidatePerformance}
      actions={
        <>
          <Link to="/admin/questions/new" className={styles.addQuestionLink}>
            <Library className={styles.libraryIcon} /> Add Question
          </Link>
          <Link to="/admin/questions/ai" className={styles.addQuestionLink}>
            <Sparkles className={styles.sparklesIcon} /> Generate with AI
          </Link>
          <Link to="/admin/assessments/new" className={styles.createAssessmentLink}>
            <Plus className={styles.libraryIcon} /> Create Assessment
          </Link>
        </>
      }
    >
      {error ? (
        <div className={styles.errorBox}>{error}</div>
      ) : !data ? (
        <Spinner label="Loading dashboard..." />
      ) : (
        <div className={styles.assessmentTableBox}>
          {/* Lifecycle overview */}
          <div className={styles.lifecycleOverviewBox}>
            {([
              ['draft', 'Draft', data.lifecycleTotals.draft, FileEdit, styles.assessmentAmber, MSG.notVisibleCandidates],
              ['active', 'Active', data.lifecycleTotals.active, PlayCircle, styles.assessmentEmerald, 'Open or scheduled'],
              ['completed', 'Completed', data.lifecycleTotals.completed, CheckCircle2, styles.assessmentSurface, MSG.closedAdmin],
              ['expired', 'Expired', data.lifecycleTotals.expired, CalendarX, styles.assessmentRed, MSG.endDateHasPassed],
            ] as const).map(([key, label, n, Icon, tone, hint]) => (
              <button
                key={key}
                onClick={() => { setTab(tab === key ? 'all' : key); document.getElementById('assessment-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className={`${styles.nButton} ${tab === key ? styles.nButtonSelected : ''}`}
              >
                <div className={styles.labelBox}>
                  <span className={styles.label}>{label}</span>
                  <span className={`${styles.lifecycleOverviewLabel} ${tone}`}><Icon className={styles.libraryIcon} /></span>
                </div>
                <p className={styles.nText}>{n}</p>
                <p className={styles.totalLabel}>{hint}</p>
              </button>
            ))}
          </div>

          {/* KPI row */}
          <div className={styles.lifecycleOverviewBox}>
            <StatCard
              label="Assessments"
              tone={styles.statCardTone}
              icon={ClipboardList}
              value={data.totals.assessments}
              hint={`${data.totals.published} published · ${data.totals.drafts} draft · ${data.totals.questions} questions`}
            />
            <StatCard
              label="Candidates"
              tone={styles.statCardTone2}
              icon={Users}
              value={data.totals.candidatesStarted}
              hint={`${data.totals.candidatesCompleted} completed · ${data.totals.inProgress} in progress`}
            />
            <StatCard
              label="Average score"
              tone={styles.assessmentAmber}
              icon={Target}
              value={formatPercent(data.totals.averageScore)}
              hint={data.totals.highestScore !== null ? `Highest ${formatPercent(data.totals.highestScore, 0)}` : 'No attempts yet'}
            />
            <StatCard
              label="Pass rate"
              tone={styles.assessmentEmerald}
              icon={Award}
              value={formatPercent(data.totals.passRate, 0)}
              hint="Of completed attempts"
            />
          </div>

          <div className={styles.activityBox}>
            <div className={styles.kpiRowBox}>
              <ScoreDistribution buckets={data.scoreDistribution} />
            </div>

            {/* Recent activity */}
            <div className={styles.activityBox2}>
              <div className={styles.activityBox3}>
                <h2 className={styles.recentActivityTitle}>
                  <Activity className={styles.sparklesIcon} /> Recent activity
                </h2>
              </div>
              {data.recentActivity.length === 0 ? (
                <p className={styles.noCandidateActivityText}>{MSG.noCandidateActivityYet}</p>
              ) : (
                <ul className={styles.recentActivityList}>
                  {data.recentActivity.map((r) => (
                    <li key={`${r.assessmentId}-${r.candidateName}`} className={styles.assessmentNameItem}>
                      <div className={styles.assessmentNameBox}>
                        <p className={styles.assessmentNameText}>
                          <span className={styles.candidateNameLabel}>{r.candidateName}</span>
                          <span className={styles.recentActivityLabel}> {r.status === 'completed' ? 'completed' : 'is taking'} </span>
                          {r.assessmentName}
                        </p>
                        <p className={styles.totalLabel}>{formatDate(r.finishedAt || r.startedAt)}</p>
                      </div>
                      <div className={styles.recentActivityBox}>
                        {r.status === 'completed' && r.overallScore !== null ? (
                          <>
                            <span className={`${styles.recentActivityLabel2} ${scoreTextClass(r.overallScore)}`}>
                              {r.overallScore.toFixed(0)}%
                            </span>
                            <PassFailBadge passed={!!r.passed} />
                            <Link
                              to={`/admin/reports/${encodeURIComponent(r.candidateName)}/${r.assessmentId}`}
                              className={styles.viewEvaluationLink}
                              title="View evaluation"
                            >
                              <ChevronRight className={styles.libraryIcon} />
                            </Link>
                          </>
                        ) : (
                          <span className={styles.inProgressLabel}>
                            <Clock className={styles.clockIcon} /> In progress
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
          <div id="assessment-table" className={styles.assessmentTableBox2}>
            <div className={styles.barChartBox}>
              <h2 className={styles.recentActivityTitle}>
                <BarChart3 className={styles.sparklesIcon} /> Assessments
              </h2>
              <div className={styles.assessmentsTableBox}>
                {(['all', 'draft', 'active', 'completed', 'expired'] as const).map((t) => {
                  const n = t === 'all' ? data.assessments.length : data.lifecycleTotals[t];
                  return (
                    <button key={t} onClick={() => setTab(t)} className={`${styles.tButton} ${tab === t ? styles.tButtonSelected : styles.tButtonDefault}`}>
                      {t} <span className={styles.nLabel}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <Link to="/admin/assessments" className={styles.manageAllLink}>
                Manage all →
              </Link>
            </div>
            {data.assessments.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No assessments yet"
                body={MSG.createAssessmentStartInviting}
                action={<Link to="/admin/assessments/new" className="btn-primary"><Plus className={styles.libraryIcon} /> Create Assessment</Link>}
              />
            ) : (
              <div className={styles.assessmentBox}>
                <table className={styles.assessmentTable}>
                  <thead>
                    <tr className={styles.assessmentRow}>
                      <th className={styles.assessmentTh}>Assessment</th>
                      <th className={styles.statusTh}>Status</th>
                      <th className={styles.questionsTh}>Questions</th>
                      <th className={styles.questionsTh}>Candidates</th>
                      <th className={styles.questionsTh}>Started</th>
                      <th className={styles.questionsTh}>Completed</th>
                      <th className={styles.questionsTh}>Avg score</th>
                      <th className={styles.questionsTh}>Pass rate</th>
                      <th className={styles.assessmentsTableTh} />
                    </tr>
                  </thead>
                  <tbody className={styles.assessmentsTableBody}>
                    {data.assessments
                      .filter((a) => tab === 'all' || (tab === 'active' ? a.lifecycle === 'active' || a.lifecycle === 'scheduled' : a.lifecycle === tab))
                      .map((a) => (
                      <tr key={a.id} className={styles.editRow}>
                        <td className={styles.assessmentsTableTh}>
                          <Link to={`/admin/assessments/${a.id}/edit`} className={styles.nameLink}>
                            {a.name}
                          </Link>
                          <p className={styles.timeLimitMinutesText}>
                            <Clock className={styles.clockIcon} /> {a.timeLimitMinutes} min · pass at {a.passingScore}%
                            {a.endAt && <> · closes {formatDate(a.endAt, false)}</>}
                          </p>
                        </td>
                        <td className={styles.assessmentsTableCell}>
                          {a.lifecycle ? <span className={`${styles.label2} ${LIFECYCLE[a.lifecycle].className}`}>{LIFECYCLE[a.lifecycle].label}</span> : <AvailabilityBadge value={a.availability} />}
                        </td>
                        <td className={styles.assessmentsTableCell2}>
                          {a.questionCount && a.questionCount < (a._count?.questions ?? 0) ? <span title={MSG.randomSubsetPerCandidate}>{a.questionCount}/{a._count?.questions}</span> : a._count?.questions ?? 0}
                        </td>
                        <td className={styles.assessmentsTableCell2}>{a.counts?.candidates ?? 0}</td>
                        <td className={styles.assessmentsTableCell2}>{a.counts?.started ?? 0}</td>
                        <td className={styles.assessmentsTableCell2}>
                          {a.counts?.completed ?? 0}
                          {!!a.stats?.inProgress && <span className={styles.assessmentsTableLabel}> +{a.stats.inProgress} live</span>}
                        </td>
                        <td className={`${styles.assessmentsTableCell3} ${a.stats?.averageScore != null ? scoreTextClass(a.stats.averageScore) : styles.recentActivityLabel}`}>
                          {formatPercent(a.stats?.averageScore)}
                        </td>
                        <td className={styles.assessmentsTableCell2}>{formatPercent(a.stats?.passRate, 0)}</td>
                        <td className={styles.editCell}>
                          <Link to={`/admin/submissions/${a.id}`} className={styles.resultsLink}>
                            <Users className={styles.usersIcon} /> Results
                          </Link>
                          <Link to={`/admin/assessments/${a.id}/edit`} className={styles.resultsLink} title="Edit">
                            <Edit className={styles.usersIcon} />
                          </Link>
                          {(a.lifecycle === 'active' || a.lifecycle === 'expired') && (
                            <button onClick={() => close.mutate(a.id)} disabled={close.isPending} className={styles.resultsLink} title={MSG.closeStopAcceptingCandidates}>
                              <Archive className={styles.usersIcon} />
                            </button>
                          )}
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
