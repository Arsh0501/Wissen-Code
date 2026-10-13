import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getReportData, getReportDownloadUrl } from '../../services/api';
import { PassFailBadge, formatDuration } from '../../components/ui';
import {
  Code2, Download, CheckCircle, XCircle,
  BarChart3, AlertTriangle, Shield, ShieldCheck, EyeOff, ClipboardPaste, Clock,
  ChevronDown, Copy, Check, Users, Target, ListChecks, FileText,
} from 'lucide-react';
import styles from './CandidateReport.module.css';
import type { ReportDataType, ReportQuestion } from '../../types';
import { FAILED_CASES_PREVIEW, COMMON_MESSAGES, CANDIDATE_REPORT_MESSAGES as MSG } from '../../constants';

export default function CandidateReport() {
  const { candidateName, assessmentId } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [report, setReport] = useState<ReportDataType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Route guard: admin only
  useEffect(() => {
    if (role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    if (!candidateName || !assessmentId || role !== 'admin') return;
    loadReport();
  }, [candidateName, assessmentId, role]);

  async function loadReport() {
    try {
      setLoading(true);
      setError('');
      const data = await getReportData(candidateName!, parseInt(assessmentId!));
      setReport(data);
    } catch (err: any) {
      console.error('Failed to load report:', err);
      setError(
        err?.response?.status === 403
          ? COMMON_MESSAGES.accessDeniedAdminRole
          : err?.response?.status === 404
          ? MSG.noSubmissionsFoundCandidate
          : MSG.failedLoadReportData
      );
    } finally {
      setLoading(false);
    }
  }

  const handleDownload = useCallback(async () => {
    if (!candidateName || !assessmentId) return;
    setDownloading(true);
    try {
      const url = getReportDownloadUrl(candidateName, parseInt(assessmentId));
      const token = localStorage.getItem('wissen-token');
      const response = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `report-${candidateName}-assessment-${assessmentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking immediately can cancel the download in some browsers (e.g. Safari)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      console.error('Download failed:', err);
      alert(MSG.failedDownloadReportPlease);
    } finally {
      setDownloading(false);
    }
  }, [candidateName, assessmentId]);

  if (role !== 'admin') return null;

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return dateStr;
    }
  }

  if (loading) {
    return (
      <div className={styles.loadingReportBox}>
        <div className={styles.routeGuardBox} />
        <p className={styles.loadingReportText}>Loading report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={styles.alertTriangleBox}>
        <AlertTriangle className={styles.alertTriangleIcon} />
        <p className={styles.routeGuardText}>{error || 'Report not available.'}</p>
        <button onClick={loadReport} className="btn-outline">Retry</button>
      </div>
    );
  }

  const { candidate, assessment, marks, overall_score, cohort, questions } = report;
  const resultTone = marks.passed
    ? { text: styles.resultPanelLabelPassed, panel: styles.resultPanel, bar: styles.pastesBoxPassed }
    : { text: styles.resultPanelLabelDefault, panel: styles.resultPanel2, bar: styles.pastesBoxDefault };

  return (
    <div className={styles.proctoringBox}>
      {/* ═══ HERO: candidate + result ═══ */}
      <section className={styles.downloadReportBtnSection}>
        <div className={styles.downloadReportBtnBox}>
          <div className={styles.downloadReportBtnBox2}>
            <div className={styles.downloadReportBtnBox3}>
              <div className={styles.candidateReportBox}>
                <div className={styles.heroCandidateBox}>
                  {initials(candidate.name)}
                </div>
                <div className={styles.candidateReportBox2}>
                  <p className={styles.candidateReportText}>Candidate report</p>
                  <h1 className={styles.nameTitle}>{candidate.name}</h1>
                  {candidate.email ? (
                    <a href={`mailto:${candidate.email}`} className={styles.emailLink}>{candidate.email}</a>
                  ) : (
                    <span className={styles.noEmailOnLabel}>{MSG.noEmailFile}</span>
                  )}
                </div>
              </div>
              <button onClick={handleDownload} disabled={downloading} className={styles.downloadReportBtnButton} id="download-report-btn">
                <Download className={styles.downloadIcon} />
                <span className={styles.heroCandidateLabel}>{downloading ? 'Generating PDF...' : 'Download PDF'}</span>
              </button>
            </div>

            <dl className={styles.heroCandidateList}>
              <Detail label="Assessment" value={assessment.title} wide />
              <Detail label="Submitted" value={formatDate(assessment.submitted_at)} />
              <Detail label="Time limit" value={`${assessment.duration_minutes} minutes`} />
            </dl>
          </div>

          {/* Result panel */}
          <div className={`${styles.passingScoreBox} ${resultTone.panel}`}>
            <PassFailBadge passed={marks.passed} />
            <div className={`${styles.resultPanelBox} ${resultTone.text}`}>
              {marks.percentage.toFixed(1)}<span className={styles.resultPanelLabel}>%</span>
            </div>
            <p className={styles.passingScoreText}>Passing score {marks.passing_score}%</p>
            {cohort?.rank && (
              <p className={styles.rankedText}>
                Ranked <span className={styles.resultPanelLabel2}>{ordinal(cohort.rank)}</span> of {cohort.completed_count}
              </p>
            )}
            {!!report.previous_attempts?.length && (
              <div className={styles.rankedText}>
                <p>Attempt <span className={styles.resultPanelLabel2}>{report.attempt}</span> · earlier:</p>
                <p className={styles.resultPanelText}>
                  {report.previous_attempts.map((p) => (
                    <span key={p.attempt} className={`${styles.resultPanelLabel3} ${p.passed ? styles.resultPanelLabelPassed : styles.resultPanelLabelDefault}`}>#{p.attempt} {p.percentage.toFixed(0)}%</span>
                  ))}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ KEY NUMBERS ═══ */}
      <section className={styles.keyNumbersSection}>
        <StatTile icon={Target} label="Marks" value={`${formatMarks(marks.obtained)} / ${marks.total}`} hint="Marks-weighted score" />
        <StatTile icon={ListChecks} label="Test cases" value={`${overall_score.passed} / ${overall_score.total}`} hint={`${overall_score.percentage.toFixed(0)}% passed`} />
        <StatTile icon={FileText} label="Questions" value={`${marks.questions_attempted} / ${marks.questions_total}`} hint="Attempted" />
        <StatTile icon={Clock} label="Time taken" value={formatDuration(marks.time_taken_seconds)} hint={`of ${assessment.duration_minutes} min allowed`} />
      </section>

      {/* ═══ COMPARISON + INTEGRITY ═══ */}
      <section className={styles.comparisonIntegritySection}>
        <div className={cohort && cohort.completed_count > 0 ? styles.comparisonIntegrityBoxOn : styles.comparisonIntegrityBoxOff}>
          {cohort && cohort.completed_count > 0 && (
            <ComparisonCard score={marks.percentage} passing={marks.passing_score} passed={marks.passed} cohort={cohort} />
          )}
        </div>
        <IntegrityCard report={report} className={cohort && cohort.completed_count > 0 ? '' : styles.integrityCardOff} />
      </section>

      {/* ═══ QUESTION SUMMARY ═══ */}
      <section className={styles.downloadReportBtnSection}>
        <div className={styles.barChartBox}>
          <h2 className={styles.questionSummaryTitle}>
            <BarChart3 className={styles.barChartIcon} /> Question summary
          </h2>
          <span className={styles.clickAQuestionLabel}>{MSG.clickQuestionDetails}</span>
        </div>
        <div className={styles.questionSummaryBox}>
          <table className={styles.questionSummaryTable}>
            <thead>
              <tr className={styles.questionSummaryRow}>
                <th className={styles.questionSummaryTh}>#</th>
                <th className={styles.questionTh}>Question</th>
                <th className={styles.languageTh}>Language</th>
                <th className={styles.testsTh}>Tests</th>
                <th className={styles.marksTh}>Marks</th>
                <th className={styles.scoreTh}>Score</th>
              </tr>
            </thead>
            <tbody className={styles.questionSummaryBody}>
              {questions.map((q, i) => (
                <tr key={q.question_id} className={styles.titleRow} onClick={() => document.getElementById(`q-${q.question_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <td className={styles.questionSummaryCell}>{i + 1}</td>
                  <td className={styles.titleCell}>{q.title}</td>
                  <td className={styles.questionSummaryCell2}>{q.type === 'mcq' ? 'Multiple choice' : q.attempted ? q.language : '—'}</td>
                  <td className={styles.questionSummaryCell3}>{q.attempted && q.type !== 'mcq' ? `${q.testcases_passed}/${q.testcases_total}` : '—'}</td>
                  <td className={styles.questionSummaryCell4}>{formatMarks(q.marks_obtained)} / {q.marks}</td>
                  <td className={styles.questionSummaryCell5}>
                    {q.attempted ? <ScoreBar pct={q.score} /> : <div className={styles.skippedBox}><span className={styles.skippedLabel}>Skipped</span></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══ QUESTION DETAILS ═══ */}
      <section className={styles.questionDetailsSection}>
        <h2 className={styles.questionDetailsTitle}>Question details</h2>
        {questions.map((q, i) => <QuestionCard key={q.question_id} q={q} index={i} />)}
      </section>

      {/* ═══ PROCTORING ACTIVITY ═══ */}
      <section id="proctoring" className={styles.proctoringSection}>
        <ProctoringSection report={report} formatDate={formatDate} />
      </section>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

// Marks can be fractional (partial test-case credit) — show at most one decimal, and none for whole numbers
function formatMarks(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function scoreText(pct: number): string {
  if (pct >= 70) return styles.resultPanelLabelPassed;
  if (pct >= 40) return styles.scoreTextStyle;
  return styles.resultPanelLabelDefault;
}

function scoreFill(pct: number): string {
  if (pct >= 70) return styles.pastesBoxPassed;
  if (pct >= 40) return styles.scoreFillStyle;
  return styles.pastesBoxDefault;
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? styles.labelBoxWide : ''}>
      <dt className={styles.labelTerm}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string }) {
  return (
    <div className={styles.valueBox}>
      <div className={styles.labelBox}>
        <span className={styles.labelTerm}>{label}</span>
        <Icon className={styles.proctoringActivityIcon} />
      </div>
      <div className={styles.valueBox2}>{value}</div>
      <div className={styles.hintBox}>{hint}</div>
    </div>
  );
}

function ScoreBar({ pct }: { pct: number }) {
  return (
    <div className={styles.proctoringActivityBox}>
      <div className={styles.proctoringActivityBox2}>
        <div className={`${styles.proctoringActivityBox3} ${scoreFill(pct)}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className={`${styles.proctoringActivityLabel} ${scoreText(pct)}`}>{pct.toFixed(0)}%</span>
    </div>
  );
}

// Integrity verdict at a glance, linking down to the full proctoring log
function IntegrityCard({ report, className = '' }: { report: ReportDataType; className?: string }) {
  const { tab_switches: tabs, paste_events: pastes } = report;
  const needsReview = tabs.limit_exceeded || pastes.large_count > 0;
  const minor = !needsReview && (tabs.count > 0 || pastes.count > 0);
  const tone = needsReview
    ? { label: 'Review recommended', icon: AlertTriangle, box: styles.reviewRecommendedBox, text: styles.reviewRecommendedText, iconText: styles.resultPanelLabelDefault }
    : minor
      ? { label: 'Minor activity', icon: Shield, box: styles.minorActivityBox, text: styles.minorActivityText, iconText: styles.scoreTextStyle }
      : { label: 'No concerns', icon: ShieldCheck, box: styles.noConcernsBox, text: styles.noConcernsText, iconText: styles.resultPanelLabelPassed };
  const Icon = tone.icon;
  const rows = [
    { label: 'Tab switches', value: `${tabs.count} / ${tabs.limit}`, alert: tabs.limit_exceeded },
    { label: 'Pastes', value: String(pastes.count), alert: false },
    { label: `Large pastes (${pastes.large_threshold}+ chars)`, value: String(pastes.large_count), alert: pastes.large_count > 0 },
  ];
  return (
    <div className={`${styles.viewActivityLogBox} ${tone.box} ${className}`}>
      <div className={styles.labelBox2}>
        <Icon className={`${styles.proctoringActivityIcon2} ${tone.iconText}`} />
        <h3 className={`${styles.labelTitle} ${tone.text}`}>{tone.label}</h3>
      </div>
      {tabs.limit_exceeded && <p className={styles.tabSwitchLimitText}>{MSG.tabSwitchLimitReached}</p>}
      <dl className={styles.proctoringActivityList}>
        {rows.map((r) => (
          <div key={r.label} className={styles.labelBox}>
            <dt className={styles.labelTerm2}>{r.label}</dt>
            <dd className={`${styles.value2} ${r.alert ? styles.resultPanelLabelDefault : styles.valueDefault}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <a href="#proctoring" className={styles.viewActivityLogLink}>View activity log →</a>
    </div>
  );
}

function QuestionCard({ q, index }: { q: ReportQuestion; index: number }) {
  const [showAll, setShowAll] = useState(false);

  if (!q.attempted) {
    return (
      <div id={`q-${q.question_id}`} className={styles.qBox}>
        <div className={styles.titleBox}>
          <QuestionNumber n={index + 1} muted />
          <div className={styles.candidateReportBox2}>
            <h3 className={styles.title}>{q.title}</h3>
            <p className={styles.clickAQuestionLabel}>{MSG.notAttemptedNoCode}</p>
          </div>
        </div>
        <div className={styles.skippedBox2}>
          <span className={styles.skippedLabel}>Skipped</span>
          <div className={styles.proctoringActivityBox4}>0 / {q.marks} marks</div>
        </div>
      </div>
    );
  }

  if (q.type === 'mcq' && q.mcq) {
    const right = q.score >= 100;
    return (
      <div id={`q-${q.question_id}`} className={styles.qBox2}>
        <div className={styles.proctoringActivityBox5}>
          <div className={styles.titleBox2}>
            <QuestionNumber n={index + 1} />
            <div className={styles.candidateReportBox2}>
              <h3 className={styles.resultPanelLabel2}>{q.title}</h3>
              <p className={styles.hintBox}>Multiple choice · {right ? 'answered correctly' : 'answered incorrectly'}</p>
            </div>
          </div>
          <div className={styles.skippedBox2}>
            <div className={`${styles.proctoringActivityBox6} ${right ? styles.resultPanelLabelPassed : styles.resultPanelLabelDefault}`}>{right ? 'Correct' : 'Wrong'}</div>
            <div className={styles.proctoringActivityBox4}>{formatMarks(q.marks_obtained)} / {q.marks} marks</div>
          </div>
        </div>
        <div className={styles.statementBox}>
          <p className={styles.statementText}>{q.mcq.statement}</p>
          {q.mcq.options.map((o, i) => {
            const isCorrect = q.mcq!.correct.includes(o.id);
            const picked = q.mcq!.selected.includes(o.id);
            return (
              <div key={o.id} className={`${styles.textBox} ${isCorrect ? styles.textBoxCorrect : picked ? styles.textBoxPicked : styles.textBoxDefault}`}>
                <span className={styles.textLabel}><b className={styles.proctoringActivityBox7}>{String.fromCharCode(65 + i)}</b>{o.text}</span>
                <span className={styles.proctoringActivityLabel2}>
                  {picked && <span className={`${styles.candidateAposSLabel} ${isCorrect ? styles.candidateAposSLabelCorrect : styles.candidateAposSLabelDefault}`}>Candidate&apos;s answer</span>}
                  {isCorrect && <span className={styles.correctLabel}>Correct</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const failed = showAll ? q.failed_cases : q.failed_cases.slice(0, FAILED_CASES_PREVIEW);
  const hiddenCount = q.failed_cases.length - FAILED_CASES_PREVIEW;

  return (
    <div id={`q-${q.question_id}`} className={styles.qBox2}>
      {/* Header */}
      <div className={styles.proctoringActivityBox5}>
        <div className={styles.titleBox2}>
          <QuestionNumber n={index + 1} />
          <div className={styles.candidateReportBox2}>
            <h3 className={styles.resultPanelLabel2}>{q.title}</h3>
            <p className={styles.hintBox}>
              {q.language} · {q.testcases_passed} of {q.testcases_total} test cases passed
            </p>
          </div>
        </div>
        <div className={styles.skippedBox2}>
          <div className={`${styles.headerBox} ${scoreText(q.score)}`}>{q.score.toFixed(0)}%</div>
          <div className={styles.proctoringActivityBox4}>{formatMarks(q.marks_obtained)} / {q.marks} marks</div>
        </div>
      </div>

      {/* Test-case strip */}
      <div className={styles.testCaseBox} aria-label={MSG.testCasesPassed(q.testcases_passed, q.testcases_total)}>
        {Array.from({ length: q.testcases_total }, (_, i) => {
          const ok = i < q.testcases_passed;
          return (
            <span
              key={i}
              className={`${styles.testCaseLabel} ${ok ? styles.testCaseLabelOk : styles.testCaseLabelDefault}`}
            >
              {ok ? <CheckCircle className={styles.checkCircleIcon} /> : <XCircle className={styles.checkCircleIcon} />}
            </span>
          );
        })}
      </div>

      {/* Failed cases — compact table */}
      {q.failed_cases.length > 0 && (
        <div className={styles.failedTestCasesBox}>
          <div className={styles.failedTestCasesBox2}>
            Failed test cases ({q.failed_cases.length})
          </div>
          <div className={styles.questionSummaryBox}>
            <table className={styles.caseTable}>
              <thead>
                <tr className={styles.caseRow}>
                  <th className={styles.caseTh}>Case</th>
                  <th className={styles.verdictTh}>Verdict</th>
                  <th className={styles.expectedTh}>Expected</th>
                  <th className={styles.actualTh}>Actual</th>
                </tr>
              </thead>
              <tbody className={styles.questionSummaryBody}>
                {failed.map((fc) => (
                  <tr key={fc.testcase_id} className={styles.failedCasesRow}>
                    <td className={styles.failedCasesCell}>#{fc.testcase_id}</td>
                    <td className={styles.failedCasesCell2}>
                      <span className={styles.failedCasesLabel}>{verdictLabel(fc.status)}</span>
                    </td>
                    <td className={styles.failedCasesCell3}>
                      <pre className={styles.failedCasesPre}>{fc.expected_output || '(empty)'}</pre>
                    </td>
                    <td className={styles.failedCasesCell4}>
                      <pre className={styles.failedCasesPre2}>{fc.actual_output || '(no output)'}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className={styles.chevronDownButton}
            >
              {showAll ? 'Show fewer' : MSG.showMoreFailedCase(hiddenCount)}
              <ChevronDown className={`${styles.chevronDownIcon} ${showAll ? styles.chevronDownIconAll : ''}`} />
            </button>
          )}
        </div>
      )}

      <div className={styles.failedCasesBox}>
        <CodeViewer code={q.code} language={q.language} />
      </div>
    </div>
  );
}

function QuestionNumber({ n, muted }: { n: number; muted?: boolean }) {
  return (
    <span className={`${styles.qLabel} ${muted ? styles.qLabelMuted : styles.qLabelDefault}`}>
      Q{n}
    </span>
  );
}

function verdictLabel(status: string): string {
  const s = status.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Tab switches + pastes captured during the exam, with an overall verdict for the reviewer
function ProctoringSection({ report, formatDate }: { report: ReportDataType; formatDate: (d: string) => string }) {
  const { tab_switches: tabs, paste_events: pastes } = report;
  const needsReview = tabs.limit_exceeded || pastes.large_count > 0;
  const minor = !needsReview && (tabs.count > 0 || pastes.count > 0);
  const verdict = needsReview
    ? { label: 'Review recommended', className: styles.candidateAposSLabelDefault, icon: AlertTriangle, iconClass: styles.resultPanelLabelDefault }
    : minor
      ? { label: 'Minor activity', className: styles.minorActivityClassName, icon: Shield, iconClass: styles.scoreTextStyle }
      : { label: 'No concerns', className: styles.candidateAposSLabelCorrect, icon: ShieldCheck, iconClass: styles.resultPanelLabelPassed };
  const VerdictIcon = verdict.icon;

  return (
    <div>
      <div className={styles.proctoringActivityBox8}>
        <h3 className={styles.proctoringActivityTitle}>
          <VerdictIcon className={`${styles.proctoringActivityIcon2} ${verdict.iconClass}`} /> Proctoring activity
        </h3>
        <span className={`${styles.candidateAposSLabel} ${verdict.className}`}>{verdict.label}</span>
      </div>

      <div className={styles.eyeOffBox}>
        {/* Tab switches */}
        <div className={styles.downloadReportBtnSection}>
          <div className={styles.eyeOffBox2}>
            <h4 className={styles.tabSwitchesTitle}>
              <EyeOff className={styles.proctoringActivityIcon} /> Tab switches
            </h4>
            {tabs.limit_exceeded ? (
              <span className={styles.limitReachedAutoLabel}>Limit reached · auto-submitted</span>
            ) : (
              <span className={styles.countLabel}>{tabs.count}/{tabs.limit} allowed</span>
            )}
          </div>
          <div className={styles.tabSwitchesBox}>
            <Metric label="Switches" value={tabs.count} alert={tabs.limit_exceeded} />
            <Metric label="Time away" value={`${(tabs.total_duration_ms / 1000).toFixed(1)}s`} />
          </div>
          <EventList
            empty={MSG.noTabSwitchesDetected}
            rows={tabs.events.map((e, i) => ({
              key: i,
              left: <span className={styles.leftTheTestLabel}>Left the test</span>,
              right: <><span className={styles.sLabel}>{(e.duration_ms / 1000).toFixed(1)}s</span> away</>,
              time: formatDate(e.occurred_at),
            }))}
          />
        </div>

        {/* Pastes */}
        <div className={styles.downloadReportBtnSection}>
          <div className={styles.eyeOffBox2}>
            <h4 className={styles.tabSwitchesTitle}>
              <ClipboardPaste className={styles.proctoringActivityIcon} /> Code pastes
            </h4>
            <span className={styles.clickAQuestionLabel}>Large = {pastes.large_threshold}+ characters</span>
          </div>
          <div className={styles.pastesBox}>
            <Metric label="Pastes" value={pastes.count} />
            <Metric label="Large" value={pastes.large_count} alert={pastes.large_count > 0} />
            <Metric label="Characters" value={pastes.total_chars} />
          </div>
          <EventList
            empty="No pastes detected"
            rows={pastes.events.map((e, i) => {
              const large = e.char_count >= pastes.large_threshold;
              return {
                key: i,
                left: <span className={styles.questionTitleLabel}>{e.question_title}</span>,
                right: (
                  <span className={large ? styles.charsLabelLarge : ''}>
                    <span className={styles.charCountLabel}>{e.char_count}</span> chars · {e.line_count} line{e.line_count === 1 ? '' : 's'}
                    {large && <span className={styles.largeLabel}>Large</span>}
                  </span>
                ),
                time: formatDate(e.occurred_at),
              };
            })}
          />
        </div>
      </div>
      <p className={styles.onlyTheSizeText}>
        {MSG.onlySizeEachPaste}</p>
    </div>
  );
}

function Metric({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <div className={styles.labelBox3}>
      <div className={styles.labelBox4}>{label}</div>
      <div className={`${styles.valueBox3} ${alert ? styles.resultPanelLabelDefault : styles.valueDefault}`}>{value}</div>
    </div>
  );
}

function EventList({ rows, empty }: { rows: { key: number; left: React.ReactNode; right: React.ReactNode; time: string }[]; empty: string }) {
  if (rows.length === 0) {
    return <p className={styles.emptyText}>{empty}</p>;
  }
  return (
    <ul className={styles.pastesList}>
      {rows.map((r) => (
        <li key={r.key} className={styles.leftItem}>
          <div className={styles.leftBox}>
            {r.left}
            <span className={styles.timeLabel}>{r.time}</span>
          </div>
          <div className={styles.rightBox}>{r.right}</div>
        </li>
      ))}
    </ul>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${suffix}`;
}

// Candidate's score on a 0–100 track, with the pass mark and cohort average marked
function ComparisonCard({
  score,
  passing,
  passed,
  cohort,
}: {
  score: number;
  passing: number;
  passed: boolean;
  cohort: NonNullable<ReportDataType['cohort']>;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const pct = (n: number | null, digits = 1) => (n === null ? '—' : `${n.toFixed(digits)}%`);
  return (
    <div className={styles.usersBox}>
      <div className={styles.usersBox2}>
        <div>
          <h3 className={styles.questionSummaryTitle}>
            <Users className={styles.barChartIcon} /> Compared with {cohort.completed_count} candidate{cohort.completed_count === 1 ? '' : 's'}
          </h3>
          {cohort.percentile !== null && (
            <p className={styles.passingScoreText}>Scored higher than {cohort.percentile}{MSG.otherCandidates}</p>
          )}
        </div>
        <div className={styles.pastesBox2}>
          {[
            { label: 'Average', value: pct(cohort.average_score) },
            { label: 'Top score', value: pct(cohort.highest_score) },
            { label: 'Pass rate', value: pct(cohort.pass_rate, 0) },
          ].map((m) => (
            <div key={m.label}>
              <div className={styles.labelBox4}>{m.label}</div>
              <div className={styles.valueBox4}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.pastesBox3}>
        <div
          className={`${styles.proctoringActivityBox3} ${passed ? styles.pastesBoxPassed : styles.pastesBoxDefault}`}
          style={{ width: `${clamp(score)}%` }}
        />
        <Marker at={clamp(passing)} label={`Pass ${passing}%`} className={styles.marker} below />
        {cohort.average_score !== null && (
          <Marker at={clamp(cohort.average_score)} label={`Avg ${cohort.average_score.toFixed(0)}%`} className={styles.marker2} />
        )}
      </div>
    </div>
  );
}

function Marker({ at, label, className, below }: { at: number; label: string; className: string; below?: boolean }) {
  const [bg, text] = className.split(' ');
  // Near either end, anchor the label to that side so it never spills outside the card
  const anchor = at < 12 ? styles.anchorHigh : at > 88 ? styles.anchorHigh2 : styles.anchorLow;
  return (
    <div className={`${styles.labelBox5} ${bg}`} style={{ left: `${at}%` }}>
      <span className={`${styles.label} ${anchor} ${text} ${below ? styles.labelBelow : styles.labelDefault}`}>
        {label}
      </span>
    </div>
  );
}

// Collapsible, line-numbered view of the candidate's submitted code
function CodeViewer({ code, language }: { code: string; language: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!code.trim()) return null;
  const lines = code.replace(/\s+$/, '').split('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context) — nothing useful to do
    }
  }

  return (
    <div className={styles.chevronDownBox}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={styles.chevronDownButton2}
        aria-expanded={open}
      >
        <span className={styles.submittedCodeLabel}>
          <Code2 className={styles.codeIcon} /> Submitted code
          <span className={styles.pastesLabel}>· {language} · {lines.length} line{lines.length === 1 ? '' : 's'}</span>
        </span>
        <ChevronDown className={`${styles.chevronDownIcon2} ${open ? styles.chevronDownIconAll : ''}`} />
      </button>
      {open && (
        <div className={styles.copyCodeBox}>
          <button
            type="button"
            onClick={copy}
            className={styles.copyCodeButton}
            title="Copy code"
          >
            {copied ? <><Check className={styles.checkIcon} /> Copied</> : <><Copy className={styles.checkCircleIcon} /> Copy</>}
          </button>
          <pre className={styles.pastesPre}>
            {lines.map((line, i) => (
              <div key={i} className={styles.pastesBox4}>
                <span className={styles.pastesLabel2}>{i + 1}</span>
                <span className={styles.pastesLabel3}>{line || ' '}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
