import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import ShareLinksModal from '../../components/ShareLinksModal';
import {
  AvailabilityBadge, Spinner, EmptyState, formatDate, formatPercent, scoreTextClass, parseJsonArray,
} from '../../components/ui';
import {
  getAssessments, deleteAssessment, updateAssessment, duplicateAssessment, apiError,
} from '../../services/api';
import type { Assessment, Availability, AssessmentStatus } from '../../types';
import {
  Plus, Trash2, Clock, Users, Search, Copy, Edit, Rocket, EyeOff, Archive, CheckSquare,
  Target, Calendar, Shuffle, Code2, MoreHorizontal, Sparkles, Link2,
} from 'lucide-react';
import styles from './AssessmentManager.module.css';
import { ASSESSMENT_FILTERS, LANGUAGE_NAMES, COMMON_MESSAGES, ASSESSMENT_MANAGER_MESSAGES as MSG } from '../../constants';

export default function AssessmentManager() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [shareFor, setShareFor] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Availability>('all');
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setAssessments(await getAssessments());
    } catch (err) {
      setError(apiError(err, COMMON_MESSAGES.failedLoadAssessments));
    } finally {
      setLoading(false);
    }
  }

  async function run(id: number, action: () => Promise<unknown>) {
    setMenuFor(null);
    setBusyId(id);
    setError('');
    try {
      await action();
      await loadData();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  const setStatus = (a: Assessment, status: AssessmentStatus) => run(a.id, () => updateAssessment(a.id, { status }));

  function handleDelete(a: Assessment) {
    const taken = a.stats?.candidatesStarted ?? 0;
    const warning = taken
      ? MSG.deleteTakenAssessmentConfirm(a.name, taken)
      : MSG.deleteAssessmentConfirm(a.name);
    if (!confirm(warning)) return;
    run(a.id, () => deleteAssessment(a.id));
  }

  const counts = Object.fromEntries(
    ASSESSMENT_FILTERS.map((f) => [f.key, f.key === 'all' ? assessments.length : assessments.filter((a) => a.availability === f.key).length])
  );
  const visible = assessments.filter(
    (a) => (filter === 'all' || a.availability === filter) && a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout
      title="Assessments"
      subtitle={MSG.createConfigurePublishCoding}
      actions={
        <>
          <Link to="/admin/questions/ai" className={styles.generateWithAiLink}>
            <Sparkles className={styles.sparklesIcon} /> Generate with AI
          </Link>
          <Link to="/admin/assessments/new" className={styles.newAssessmentLink}>
            <Plus className={styles.plusIcon} /> New Assessment
          </Link>
        </>
      }
    >
      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.searchBox}>
        <div className={styles.box}>
          {ASSESSMENT_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`${styles.labelButton} ${filter === f.key ? styles.labelButtonSelected : styles.labelButtonDefault}`}
            >
              {f.label} <span className={styles.label}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className={styles.searchBox2}>
          <Search className={styles.searchIcon} />
          <input className={styles.searchAssessmentsInput} placeholder="Search assessments..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading assessments..." />
      ) : assessments.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No assessments yet"
          body={MSG.createFirstAssessmentQuestion}
          action={<Link to="/admin/assessments/new" className="btn-primary"><Plus className={styles.plusIcon} /> Create Assessment</Link>}
        />
      ) : visible.length === 0 ? (
        <p className={styles.noAssessmentsMatchText}>{MSG.noAssessmentsMatchFilter}</p>
      ) : (
        <div className={styles.box2}>
          {visible.map((a) => {
            const langs = parseJsonArray<number>(a.allowedLanguages);
            const totalMarks = a.questions.reduce((acc, q) => acc + (q.marks ?? 0), 0);
            return (
              <div key={a.id} className={`${styles.createALinkBox} ${busyId === a.id ? styles.createALinkBoxSelected : ''}`}>
                <div className={styles.nameBox}>
                  <div className={styles.nameBox2}>
                    <div className={styles.nameBox3}>
                      <Link to={`/admin/assessments/${a.id}/edit`} className={styles.nameLink}>
                        {a.name}
                      </Link>
                      <AvailabilityBadge value={a.availability} />
                    </div>
                    {a.description && <p className={styles.descriptionText}>{a.description}</p>}
                    <div className={styles.clockBox}>
                      <span className={styles.timeLimitMinutesLabel}><Clock className={styles.clockIcon} /> {a.timeLimitMinutes} min</span>
                      <span className={styles.timeLimitMinutesLabel}><Target className={styles.clockIcon} /> {a._count?.questions ?? 0} questions · {totalMarks} marks · pass {a.passingScore}%</span>
                      {(a.startAt || a.endAt) && (
                        <span className={styles.timeLimitMinutesLabel}>
                          <Calendar className={styles.clockIcon} />
                          {a.startAt ? formatDate(a.startAt) : 'Now'} → {a.endAt ? formatDate(a.endAt) : 'no deadline'}
                        </span>
                      )}
                      {a.shuffleQuestions && <span className={styles.timeLimitMinutesLabel}><Shuffle className={styles.clockIcon} /> Shuffled</span>}
                      {langs.length > 0 && (
                        <span className={styles.timeLimitMinutesLabel}><Code2 className={styles.clockIcon} /> {langs.map((l) => LANGUAGE_NAMES[l]).join(', ')}</span>
                      )}
                      {!a.showResults && <span className={styles.timeLimitMinutesLabel}><EyeOff className={styles.clockIcon} /> Results hidden</span>}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className={styles.completedBox}>
                    <div>
                      <p className={styles.statsText}>{a.stats?.candidatesCompleted ?? 0}</p>
                      <p className={styles.completedText}>Completed</p>
                    </div>
                    <div>
                      <p className={`${styles.statsText2} ${a.stats?.averageScore != null ? scoreTextClass(a.stats.averageScore) : styles.statsTextDefault}`}>
                        {formatPercent(a.stats?.averageScore, 0)}
                      </p>
                      <p className={styles.completedText}>Avg score</p>
                    </div>
                    <div>
                      <p className={styles.statsText}>{formatPercent(a.stats?.passRate, 0)}</p>
                      <p className={styles.completedText}>Pass rate</p>
                    </div>
                  </div>
                </div>

                <div className={styles.createALinkBox2}>
                  <div className={styles.statsBox}>
                    {a.questions.map((aq) => (
                      <span key={aq.id} className={styles.titleLabel}>
                        {aq.question.title} <span className={styles.marksLabel}>{aq.marks}</span>
                      </span>
                    ))}
                  </div>
                  <div className={styles.createALinkBox3}>
                    <Link to={`/admin/submissions/${a.id}`} className={styles.generateWithAiLink}>
                      <Users className={styles.plusIcon} /> Results
                      {!!a.stats?.inProgress && <span className={styles.statsLabel}>+{a.stats.inProgress} live</span>}
                    </Link>
                    <button onClick={() => setShareFor(a)} className={styles.generateWithAiLink} title={MSG.createLinkAnyoneUse}>
                      <Link2 className={styles.plusIcon} /> Share link
                    </button>
                    <button onClick={() => navigate(`/admin/assessments/${a.id}/edit`)} className={styles.generateWithAiLink}>
                      <Edit className={styles.plusIcon} /> Edit
                    </button>
                    {a.status === 'draft' && (
                      <button onClick={() => setStatus(a, 'published')} className={styles.newAssessmentLink} disabled={!a._count?.questions}
                        title={a._count?.questions ? MSG.makeVisibleCandidates : 'Add questions first'}>
                        <Rocket className={styles.plusIcon} /> Publish
                      </button>
                    )}
                    <div className={styles.moreActionsBox}>
                      <button onClick={() => setMenuFor(menuFor === a.id ? null : a.id)} className={styles.moreActionsButton} aria-label="More actions">
                        <MoreHorizontal className={styles.plusIcon} />
                      </button>
                      {menuFor === a.id && (
                        <>
                          <div className={styles.statsBox2} onClick={() => setMenuFor(null)} />
                          <div className={styles.copyBox}>
                            <button onClick={() => run(a.id, () => duplicateAssessment(a.id))} className={styles.duplicateButton}>
                              <Copy className={styles.plusIcon} /> Duplicate
                            </button>
                            {a.status === 'published' && (
                              <button onClick={() => setStatus(a, 'draft')} className={styles.duplicateButton}>
                                <EyeOff className={styles.plusIcon} /> Unpublish
                              </button>
                            )}
                            {a.status !== 'archived' ? (
                              <button onClick={() => setStatus(a, 'archived')} className={styles.duplicateButton}>
                                <Archive className={styles.plusIcon} /> Archive
                              </button>
                            ) : (
                              <button onClick={() => setStatus(a, 'draft')} className={styles.duplicateButton}>
                                <Archive className={styles.plusIcon} /> Restore as draft
                              </button>
                            )}
                            <button onClick={() => handleDelete(a)} className={styles.deleteButton}>
                              <Trash2 className={styles.plusIcon} /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {shareFor && (
        <ShareLinksModal assessment={{ id: shareFor.id, name: shareFor.name, status: shareFor.status }} onClose={() => setShareFor(null)} />
      )}
    </AdminLayout>
  );
}
