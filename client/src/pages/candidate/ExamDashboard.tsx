import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getAssessments, retakeAssessment, apiError } from '../../services/api';
import { formatDate, formatDuration, Spinner } from '../../components/ui';
import type { Assessment, StatusTone } from '../../types';
import {
  Clock, FileText, ChevronRight, Zap, Target, Calendar, CheckCircle, PlayCircle, Lock,
  ShieldCheck, Sparkles, Trophy, Timer, TrendingUp, EyeOff, ClipboardPaste, Save, XCircle, RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import styles from './ExamDashboard.module.css';
import { COMMON_MESSAGES, EXAM_DASHBOARD_MESSAGES as MSG } from '../../constants';

function statusFor(a: Assessment): { label: string } & StatusTone {
  if (a.candidateStatus === 'completed') return { label: 'Completed', pill: styles.completedPill, stripe: styles.sideColumnBoxPassed };
  if (a.candidateStatus === 'in-progress') return { label: 'In progress', pill: styles.inProgressPill, stripe: styles.inProgressStripe };
  if (a.availability === 'open') return { label: 'Open now', pill: styles.openNowPill, stripe: styles.openNowStripe };
  if (a.availability === 'upcoming') return { label: 'Scheduled', pill: styles.scheduledPill, stripe: styles.scheduledStripe };
  return { label: 'Closed', pill: styles.closedPill, stripe: styles.closedStripe };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// "in 3 days", "in 5 hours", "in 12 minutes"
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const units: [number, string][] = [[86400000, 'day'], [3600000, 'hour'], [60000, 'minute']];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      const label = `${n} ${unit}${n === 1 ? '' : 's'}`;
      return ms >= 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return ms >= 0 ? MSG.underMinute : 'just now';
}

function minutesLeft(seconds: number | null | undefined): string {
  if (!seconds) return 'time almost up';
  const m = Math.ceil(seconds / 60);
  return `${m} min left`;
}

function scoreText(pct: number) {
  return pct >= 70 ? styles.ptsLabelHigh : pct >= 40 ? styles.scoreTextHigh : styles.ptsLabelLow;
}

function scoreFill(pct: number) {
  return pct >= 70 ? styles.sideColumnBoxPassed : pct >= 40 ? styles.scoreFillHigh : styles.scoreFillLow;
}

export default function ExamDashboard() {
  const { candidateName } = useAuth();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAssessments()
      .then(setAssessments)
      .catch((err) => setError(apiError(err, COMMON_MESSAGES.failedLoadAssessments)))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => {
    // Actionable tests first: in progress, then open (soonest deadline first), then scheduled, then closed
    const rank = (a: Assessment) =>
      a.candidateStatus === 'in-progress' ? 0 : a.availability === 'open' ? 1 : a.availability === 'upcoming' ? 2 : 3;
    const deadline = (a: Assessment) => (a.endAt ? new Date(a.endAt).getTime() : Infinity);
    const pending = assessments
      .filter((a) => a.candidateStatus !== 'completed')
      .sort((x, y) => rank(x) - rank(y) || deadline(x) - deadline(y));
    const upNext = pending.filter((a) => rank(a) < 3);
    const missed = pending.filter((a) => rank(a) === 3);
    const completed = assessments
      .filter((a) => a.candidateStatus === 'completed')
      .sort((x, y) => (y.finishedAt || y.startedAt || '').localeCompare(x.finishedAt || x.startedAt || ''));

    const scored = completed.filter((a) => a.result);
    const average = scored.length ? scored.reduce((s, a) => s + a.result!.percentage, 0) / scored.length : null;
    const passed = scored.filter((a) => a.result!.passed).length;
    const timeSpent = completed.reduce((s, a) => s + (a.result?.timeTakenSeconds ?? 0), 0);
    const best = scored.length ? Math.max(...scored.map((a) => a.result!.percentage)) : null;
    const inProgress = pending.find((a) => a.candidateStatus === 'in-progress') ?? null;
    const nextOpen = pending.find((a) => a.candidateStatus !== 'in-progress' && a.availability === 'open') ?? null;

    return { upNext, missed, completed, scored, average, passed, timeSpent, best, inProgress, nextOpen };
  }, [assessments]);

  const firstName = candidateName?.split(' ')[0] || 'there';

  if (loading) return <Spinner label="Loading your dashboard..." />;

  return (
    <div className={styles.sparklesBox}>
      {/* ═══ HERO ═══ */}
      <section className={styles.sparklesSection}>
        <div className={styles.heroBox} />
        <div className={styles.sparklesBox2}>
          <div>
            <p className={styles.candidatePortalText}>
              <Sparkles className={styles.sparklesIcon} /> Candidate portal
            </p>
            <h1 className={styles.heroTitle}>{greeting()}, {firstName}</h1>
            <p className={styles.heroText}>
              {data.inProgress
                ? MSG.haveTestProgressTimer
                : data.nextOpen
                  ? MSG.haveTestOpenRight(data.upNext.filter((a) => a.availability === 'open').length)
                  : MSG.youreAllCaughtUp}
            </p>
          </div>
          {data.inProgress ? (
            <NextAction
              title={data.inProgress.name}
              meta={minutesLeft(data.inProgress.remainingSeconds)}
              label="Resume test"
              icon={PlayCircle}
              urgent
              onClick={() => navigate(`/exam/${data.inProgress!.id}`)}
            />
          ) : data.nextOpen ? (
            <NextAction
              title={data.nextOpen.name}
              meta={`${data.nextOpen.timeLimitMinutes} min · ${data.nextOpen._count?.questions ?? 0} questions${data.nextOpen.endAt ? ` · closes ${relativeTime(data.nextOpen.endAt)}` : ''}`}
              label="Start test"
              icon={Zap}
              onClick={() => navigate(`/exam/${data.nextOpen!.id}`)}
            />
          ) : null}
        </div>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* ═══ STATS ═══ */}
      <section className={styles.statsSection}>
        <Stat icon={CheckCircle} tone={styles.statTone} label="Completed" value={String(data.completed.length)} hint={`of ${assessments.length} assessment${assessments.length === 1 ? '' : 's'}`} />
        <Stat icon={Target} tone={styles.statTone2} label="Average score" value={data.average === null ? '—' : `${data.average.toFixed(0)}%`} hint={data.best === null ? 'No results yet' : `Best ${data.best.toFixed(0)}%`} />
        <Stat icon={Trophy} tone={styles.statTone3} label="Passed" value={data.scored.length ? `${data.passed} / ${data.scored.length}` : '—'} hint="Tests with results" />
        <Stat icon={Timer} tone={styles.statTone4} label="Time on tests" value={data.timeSpent ? formatDuration(data.timeSpent) : '—'} hint="Across completed tests" />
      </section>

      {/* ═══ MAIN GRID ═══ */}
      <div className={styles.mainGridBox}>
        <div className={styles.mainGridBox2}>
          {/* Up next */}
          <section>
            <SectionHeader title="Up next" count={data.upNext.length} />
            {data.upNext.length === 0 ? (
              <EmptyCard icon={Calendar} title="Nothing scheduled" body={MSG.whenAdminOpensNew} />
            ) : (
              <div className={styles.upNextBox}>{data.upNext.map((a) => <UpcomingCard key={a.id} a={a} onOpen={() => navigate(`/exam/${a.id}`)} />)}</div>
            )}
          </section>

          {/* Completed */}
          <section>
            <SectionHeader title="Completed" count={data.completed.length} />
            {data.completed.length === 0 ? (
              <EmptyCard icon={FileText} title={MSG.noCompletedTestsYet} body={MSG.resultsAppearHereAfter} />
            ) : (
              <div className={styles.completedBox}>
                {data.completed.map((a) => <CompletedRow key={a.id} a={a} />)}
              </div>
            )}
          </section>

          {data.missed.length > 0 && (
            <section>
              <SectionHeader title="Closed" count={data.missed.length} />
              <div className={styles.completedBox}>
                {data.missed.map((a) => (
                  <div key={a.id} className={styles.lockBox}>
                    <div className={styles.nameBox}>
                      <p className={styles.nameText}>{a.name}</p>
                      <p className={styles.completedText}>{a.endAt ? `Closed ${formatDate(a.endAt, false)}` : 'No longer available'}</p>
                    </div>
                    <span className={styles.closedLabel}><Lock className={styles.lockIcon} /> Closed</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Side column */}
        <aside className={styles.sideColumnAside}>
          <PerformanceCard completed={data.completed} />
          <RulesCard />
        </aside>
      </div>
    </div>
  );
}

function NextAction({ title, meta, label, icon: Icon, urgent, onClick }: {
  title: string; meta: string; label: string; icon: LucideIcon; urgent?: boolean; onClick: () => void;
}) {
  return (
    <div className={styles.titleBox}>
      <p className={`${styles.sideColumnText} ${urgent ? styles.sideColumnTextUrgent : styles.sideColumnTextDefault}`}>
        {urgent ? MSG.continueWhereLeftOff : 'Recommended next'}
      </p>
      <p className={styles.titleText}>{title}</p>
      <p className={`${styles.metaText} ${urgent ? styles.metaTextUrgent : styles.metaTextDefault}`}>{meta}</p>
      <button type="button" onClick={onClick} className={styles.clickButton}>
        <Icon className={styles.sideColumnIcon} /> {label}
      </button>
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: string; label: string; value: string; hint: string }) {
  return (
    <div className={styles.hintBox}>
      <div className={styles.labelBox}>
        <div className={styles.nameBox}>
          <p className={styles.labelText}>{label}</p>
          <p className={styles.valueText}>{value}</p>
        </div>
        <div className={`${styles.sideColumnBox} ${tone}`}>
          <Icon className={styles.sideColumnIcon2} />
        </div>
      </div>
      <p className={styles.hintText}>{hint}</p>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className={styles.titleBox2}>
      <h2 className={styles.title}>{title}</h2>
      <span className={styles.countLabel}>{count}</span>
    </div>
  );
}

function EmptyCard({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className={styles.titleBox3}>
      <div className={styles.sideColumnBox2}>
        <Icon className={styles.sideColumnIcon3} />
      </div>
      <p className={styles.titleText2}>{title}</p>
      <p className={styles.bodyText}>{body}</p>
    </div>
  );
}

function UpcomingCard({ a, onOpen }: { a: Assessment; onOpen: () => void }) {
  const status = statusFor(a);
  const inProgress = a.candidateStatus === 'in-progress';
  const open = inProgress || a.availability === 'open';
  const when = inProgress
    ? { icon: Clock, text: minutesLeft(a.remainingSeconds), className: styles.metaTextUrgent }
    : a.availability === 'upcoming'
      ? { icon: Calendar, text: `Opens ${relativeTime(a.startAt)} · ${formatDate(a.startAt)}`, className: styles.whenClassName }
      : a.endAt
        ? { icon: Calendar, text: `Closes ${relativeTime(a.endAt)} · ${formatDate(a.endAt)}`, className: styles.whenClassName2 }
        : { icon: Calendar, text: 'No deadline', className: styles.metaTextDefault };
  const WhenIcon = when.icon;

  return (
    <div
      className={`${styles.textBox} ${open ? styles.textBoxOpen : ''}`}
      onClick={() => open && onOpen()}
    >
      <span className={`${styles.sideColumnLabel} ${status.stripe}`} aria-hidden="true" />
      <div className={styles.textBox2}>
        <div className={styles.textBox3}>
          <div className={styles.nameBox2}>
            <h3 className={styles.nameTitle}>{a.name}</h3>
            <span className={`${styles.label} ${status.pill}`}>{status.label}</span>
          </div>
          {a.description && <p className={styles.descriptionText}>{a.description}</p>}
          <div className={styles.clockBox}>
            <span className={styles.timeLimitMinutesLabel}><Clock className={styles.sparklesIcon} /> {a.timeLimitMinutes} min</span>
            <span className={styles.timeLimitMinutesLabel}><FileText className={styles.sparklesIcon} /> {a._count?.questions ?? 0} questions</span>
            <span className={styles.timeLimitMinutesLabel}><Target className={styles.sparklesIcon} /> Pass {a.passingScore}%</span>
          </div>
          <p className={`${styles.text} ${when.className}`}><WhenIcon className={styles.sparklesIcon} /> {when.text}</p>
        </div>
        {open ? (
          <button type="button" className={styles.chevronRightButton} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            {inProgress ? <><PlayCircle className={styles.sideColumnIcon} /> Resume</> : <><Zap className={styles.sideColumnIcon} /> Start</>}
            <ChevronRight className={styles.chevronRightIcon} />
          </button>
        ) : (
          <span className={styles.notOpenYetLabel}><Lock className={styles.sideColumnIcon} /> Not open yet</span>
        )}
      </div>
    </div>
  );
}

function CompletedRow({ a }: { a: Assessment }) {
  const r = a.result;
  const navigate = useNavigate();
  const [retaking, setRetaking] = useState(false);
  const [retakeError, setRetakeError] = useState('');
  async function retake() {
    setRetaking(true);
    setRetakeError('');
    try {
      await retakeAssessment(a.id);
      navigate(`/exam/${a.id}`);
    } catch (err) {
      setRetakeError(apiError(err, MSG.couldNotStartAnother));
      setRetaking(false);
    }
  }
  return (
    <div className={styles.nameBox3}>
      <div className={styles.textBox3}>
        <p className={styles.nameText2}>{a.name}</p>
        <p className={styles.submittedText}>
          Submitted {formatDate(a.finishedAt || a.startedAt, false)}
          {r?.timeTakenSeconds ? ` · ${formatDuration(r.timeTakenSeconds)}` : ''}
          {(a.maxAttempts ?? 1) > 1 && ` · attempt ${a.attempt} of ${a.maxAttempts}`}
        </p>
        {retakeError && <p className={styles.retakeErrorText}>{retakeError}</p>}
      </div>
      <div className={styles.viewBox}>
        {r ? (
          <>
            <div className={styles.sideColumnBox3}>
              <div className={styles.sideColumnBox4}>
                <div className={`${styles.sideColumnBox5} ${scoreFill(r.percentage)}`} style={{ width: `${Math.max(2, Math.min(100, r.percentage))}%` }} />
              </div>
              <span className={`${styles.sideColumnLabel2} ${scoreText(r.percentage)}`}>{r.percentage.toFixed(0)}%</span>
            </div>
            {r.passed ? (
              <span className={styles.passLabel}><CheckCircle className={styles.lockIcon} /> Pass</span>
            ) : (
              <span className={styles.failLabel}><XCircle className={styles.lockIcon} /> Fail</span>
            )}
          </>
        ) : (
          <span className={styles.sideColumnLabel3}>
            {a.showResults ? MSG.noAnswersWereSubmitted : MSG.resultsNotSharedOrganiser}
          </span>
        )}
        {a.canRetake && (
          <button onClick={retake} disabled={retaking} className={styles.startAnotherAttemptButton} title={MSG.startAnotherAttemptLatest}>
            <RotateCcw className={styles.sparklesIcon} /> {retaking ? 'Starting...' : 'Retake'}
          </button>
        )}
        <Link to={`/exam/${a.id}/result`} className={styles.viewLink}>
          View <ChevronRight className={styles.sparklesIcon} />
        </Link>
      </div>
    </div>
  );
}

// Score per completed test (oldest → newest), each bar marked with that test's own pass mark
function PerformanceCard({ completed }: { completed: Assessment[] }) {
  const points = [...completed].filter((a) => a.result).reverse().slice(-8);
  const trend = points.length >= 2 ? points[points.length - 1].result!.percentage - points[0].result!.percentage : null;

  return (
    <div className="card">
      <div className={styles.trendingUpBox}>
        <h2 className={styles.yourPerformanceTitle}><TrendingUp className={styles.trendingUpIcon} /> Your performance</h2>
        {trend !== null && (
          <span className={`${styles.ptsLabel} ${trend >= 0 ? styles.ptsLabelHigh : styles.ptsLabelLow}`}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(0)} pts
          </span>
        )}
      </div>
      <p className={styles.scoreInEachText}>{MSG.scoreEachCompletedTest}</p>

      {points.length === 0 ? (
        <p className={styles.completeATestText}>{MSG.completeTestSeeScores}</p>
      ) : (
        <>
          <div className={styles.sideColumnBox6}>
            {[25, 50, 75].map((g) => (
              <div key={g} className={styles.sideColumnBox7} style={{ bottom: `${g}%` }} aria-hidden="true" />
            ))}
            {points.map((a) => {
              const pct = a.result!.percentage;
              return (
                <div key={a.id} className={styles.sideColumnBox8} title={`${a.name}: ${pct.toFixed(0)}% (pass ${a.passingScore}%)`}>
                  <div className={`${styles.sideColumnBox9} ${a.result!.passed ? styles.sideColumnBoxPassed : styles.sideColumnBoxDefault}`} style={{ height: `${Math.max(2, pct)}%` }} />
                  <div className={styles.sideColumnBox10} style={{ bottom: `${a.passingScore}%` }} aria-hidden="true" />
                  <span className={styles.sideColumnLabel4}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
          <div className={styles.sideColumnBox11}>
            {points.map((a) => (
              <span key={a.id} className={styles.nameLabel} title={a.name}>{a.name}</span>
            ))}
          </div>
          <div className={styles.passedBox}>
            <span className={styles.passedLabel}><span className={styles.sideColumnLabel5} /> Passed</span>
            <span className={styles.passedLabel}><span className={styles.sideColumnLabel6} /> Failed</span>
            <span className={styles.passedLabel}><span className={styles.sideColumnLabel7} /> Pass mark</span>
          </div>
        </>
      )}
    </div>
  );
}

function RulesCard() {
  const rules: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Timer, title: MSG.timerKeepsRunning, body: MSG.startsWhenClickStart },
    { icon: EyeOff, title: MSG.stayTestTab, body: MSG.leavingTabRecorded3rd },
    { icon: ClipboardPaste, title: 'Pastes are recorded', body: MSG.pastingCodeIntoEditor },
    { icon: Save, title: MSG.workSaved, body: MSG.answersAutoSaveEvery },
  ];
  return (
    <div className="card">
      <h2 className={styles.beforeYouStartTitle}><ShieldCheck className={styles.shieldCheckIcon} /> Before you start</h2>
      <ul className={styles.sideColumnList}>
        {rules.map(({ icon: Icon, title, body }) => (
          <li key={title} className={styles.titleItem}>
            <div className={styles.sideColumnBox12}>
              <Icon className={styles.sideColumnIcon4} />
            </div>
            <div>
              <p className={styles.titleText3}>{title}</p>
              <p className={styles.bodyText2}>{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
