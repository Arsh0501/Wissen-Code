import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import {
  StatCard, Spinner, EmptyState, PassFailBadge, formatDate, formatDuration, formatPercent, scoreTextClass,
} from '../../components/ui';
import { getAssessmentSubmissions, downloadAssessmentCsv, apiError } from '../../services/api';
import { Users, Target, Award, Search, FileText, Clock, ArrowLeft, Edit, FileSpreadsheet } from 'lucide-react';
import styles from './SubmissionsViewer.module.css';
import type { SubmissionSortKey, AssessmentSubmissionsResponse } from '../../types';
import { COMMON_MESSAGES, SUBMISSIONS_VIEWER_MESSAGES as MSG } from '../../constants';

export default function SubmissionsViewer() {
  const { assessmentId } = useParams();
  const [data, setData] = useState<AssessmentSubmissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [result, setResult] = useState<'all' | 'passed' | 'failed' | 'in-progress'>('all');
  const [sort, setSort] = useState<SubmissionSortKey>('score');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  async function handleExport() {
    if (!assessmentId) return;
    setExporting(true);
    setExportError('');
    try {
      const { blob, filename } = await downloadAssessmentCsv(parseInt(assessmentId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking immediately can cancel the download in some browsers (e.g. Safari)
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setExportError(apiError(err, MSG.failedExportResults));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (assessmentId) loadData();
  }, [assessmentId]);

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      setData(await getAssessmentSubmissions(parseInt(assessmentId!)));
    } catch (err: any) {
      setError(err?.response?.status === 403 ? COMMON_MESSAGES.accessDeniedAdminRole : apiError(err, MSG.failedLoadSubmissions));
    } finally {
      setLoading(false);
    }
  }

  const candidates = (data?.candidates ?? [])
    .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((c) =>
      result === 'all' ? true :
      result === 'in-progress' ? c.status === 'in-progress' :
      c.status === 'completed' && (result === 'passed' ? c.passed : !c.passed)
    )
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'submitted') return (b.submittedAt || '').localeCompare(a.submittedAt || '');
      // Completed first, then by score
      if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
      return b.overallScore - a.overallScore;
    });

  const timeTaken = (c: AssessmentSubmissionsResponse['candidates'][number]) =>
    c.session?.finishedAt && c.session.startedAt
      ? Math.round((new Date(c.session.finishedAt).getTime() - new Date(c.session.startedAt).getTime()) / 1000)
      : null;

  return (
    <AdminLayout
      title={data?.assessment.name ?? 'Results'}
      subtitle={data && `${data.assessment.timeLimitMinutes} min · pass at ${data.assessment.passingScore}%`}
      actions={
        <>
          <Link to="/admin/assessments" className={styles.assessmentsLink}><ArrowLeft className={styles.arrowLeftIcon} /> Assessments</Link>
          <Link to={`/admin/assessments/${assessmentId}/edit`} className={styles.editAssessmentLink}><Edit className={styles.arrowLeftIcon} /> Edit assessment</Link>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !data || data.candidates.length === 0}
            className={styles.downloadEveryCandidateButton}
            title={MSG.downloadEveryCandidatesResult}
          >
            <FileSpreadsheet className={styles.arrowLeftIcon} /> {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </>
      }
    >
      {exportError && (
        <div className={styles.exportErrorBox}>{exportError}</div>
      )}
      {loading ? (
        <Spinner label="Loading submissions..." />
      ) : error ? (
        <div className={styles.errorBox}>
          <p className={styles.errorText}>{error}</p>
          <button onClick={loadData} className="btn-outline">Retry</button>
        </div>
      ) : !data || data.candidates.length === 0 ? (
        <EmptyState icon={Users} title="No submissions yet" body={MSG.noCandidatesHaveTaken} />
      ) : (
        <div className={styles.resultBox}>
          <div className={styles.completedFirstBox}>
            <StatCard label="Completed" icon={Users} value={data.stats.candidatesCompleted} hint={`${data.stats.inProgress} in progress`} />
            <StatCard label="Average score" icon={Target} value={formatPercent(data.stats.averageScore)} />
            <StatCard label="Pass rate" icon={Award} value={formatPercent(data.stats.passRate, 0)} />
            <StatCard label="Highest score" icon={Award} value={formatPercent(data.stats.highestScore, 0)} />
          </div>

          <div className={styles.resultBox2}>
            <div className={styles.searchBox}>
              <Search className={styles.searchIcon} />
              <input className={styles.searchByCandidateInput} placeholder={MSG.searchCandidateName} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select className={styles.resultSelect} value={result} onChange={(e) => setResult(e.target.value as typeof result)} aria-label="Result">
              <option value="all">All results</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="in-progress">In progress</option>
            </select>
            <select className={styles.resultSelect} value={sort} onChange={(e) => setSort(e.target.value as SubmissionSortKey)} aria-label="Sort by">
              <option value="score">Sort: score</option>
              <option value="submitted">Sort: most recent</option>
              <option value="name">Sort: name</option>
            </select>
          </div>

          <div className={styles.candidateBox}>
            <div className={styles.candidateBox2}>
              <table className={styles.candidateTable}>
                <thead>
                  <tr className={styles.candidateRow}>
                    <th className={styles.candidateTh}>Candidate</th>
                    <th className={styles.submittedTh}>Submitted</th>
                    <th className={styles.timeTakenTh}>Time taken</th>
                    <th className={styles.timeTakenTh}>Attempted</th>
                    <th className={styles.timeTakenTh}>Marks</th>
                    <th className={styles.timeTakenTh}>Score</th>
                    <th className={styles.submittedTh}>Result</th>
                    <th className={styles.completedFirstTh} />
                  </tr>
                </thead>
                <tbody className={styles.completedFirstBody}>
                  {candidates.map((c) => (
                    <tr key={c.name} className={styles.attemptedQuestionsRow}>
                      <td className={styles.completedFirstTh}>
                        <div className={styles.nameBox}>
                          <div className={styles.completedFirstBox2}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className={styles.nameLabel}>{c.name}</span>
                        </div>
                      </td>
                      <td className={styles.completedFirstCell}>{c.status === 'completed' ? formatDate(c.submittedAt) : `Started ${formatDate(c.startedAt)}`}</td>
                      <td className={styles.completedFirstCell2}>{formatDuration(timeTaken(c))}</td>
                      <td className={styles.completedFirstCell2}>{c.attemptedQuestions}/{c.totalQuestions}</td>
                      <td className={styles.completedFirstCell3}>{c.status === 'completed' ? `${c.marksObtained}/${c.totalMarks}` : '—'}</td>
                      <td className={`${styles.completedFirstCell4} ${c.status === 'completed' ? scoreTextClass(c.overallScore) : styles.completedFirstCellDefault}`}>
                        {c.status === 'completed' ? `${c.overallScore.toFixed(1)}%` : '—'}
                      </td>
                      <td className={styles.completedFirstCell5}>
                        {c.status === 'completed' ? (
                          <PassFailBadge passed={c.passed} />
                        ) : (
                          <span className={styles.inProgressLabel}><Clock className={styles.clockIcon} /> In progress</span>
                        )}
                      </td>
                      <td className={styles.completedFirstCell6}>
                        {c.status === 'completed' && (
                          <Link to={`/admin/reports/${encodeURIComponent(c.name)}/${assessmentId}`} className={styles.evaluationLink}>
                            <FileText className={styles.fileTextIcon} /> Evaluation
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                  {candidates.length === 0 && (
                    <tr><td colSpan={8} className={styles.noCandidatesMatchCell}>{MSG.noCandidatesMatchThese}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
