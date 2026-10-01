import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import AdminLayout from '../../components/AdminLayout';
import ReviewQueue from '../../components/ReviewQueue';
import { useQuery } from '@tanstack/react-query';
import { Spinner, EmptyState, parseJsonArray } from '../../components/ui';
import { getQuestions, getQuestion, deleteQuestion, importQuestionFromMd, getExportMdUrl, apiError } from '../../services/api';
import type { Question } from '../../types';
import {
  Plus, Edit, Trash2, FileText, Search, ChevronDown, Upload, Eye, X, Download, EyeOff, Sparkles,
} from 'lucide-react';
import styles from './QuestionBank.module.css';
import { STORAGE_KEYS, QUESTION_BANK_MESSAGES as MSG } from '../../constants';

export default function QuestionBank() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tag, setTag] = useState('');
  const [type, setType] = useState('');
  const [view, setView] = useState<'bank' | 'review'>(() => (new URLSearchParams(window.location.search).get('tab') === 'review' ? 'review' : 'bank'));
  const pendingQuery = useQuery({ queryKey: ['questions', 'pending_review'], queryFn: () => getQuestions({ status: 'pending_review' }) });
  const pendingCount = pendingQuery.data?.length ?? 0;
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Question | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    try {
      setLoading(true);
      setQuestions(await getQuestions());
    } catch (err) {
      setError(apiError(err, MSG.failedLoadQuestions));
    } finally {
      setLoading(false);
    }
  }

  // The export endpoint needs the auth header, so fetch it and save the file instead of linking to it
  async function exportMarkdown(id: number) {
    const token = localStorage.getItem(STORAGE_KEYS.token);
    try {
      const res = await fetch(getExportMdUrl(id), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `question-${id}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(MSG.failedExportMarkdown);
    }
  }

  async function handleDelete(q: Question) {
    const used = q._count?.assessments ?? 0;
    const msg = used
      ? MSG.deleteUsedQuestionConfirm(q.title, used)
      : MSG.deleteQuestionConfirm(q.title);
    if (!confirm(msg)) return;
    try {
      await deleteQuestion(q.id);
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
      if (preview?.id === q.id) setPreview(null);
    } catch (err) {
      setError(apiError(err, MSG.failedDeleteQuestion));
    }
  }

  async function openPreview(id: number) {
    try {
      setPreview(await getQuestion(id));
    } catch (err) {
      setError(apiError(err, MSG.failedLoadQuestion));
    }
  }

  const allTags = useMemo(() => Array.from(new Set(questions.flatMap((q) => parseJsonArray(q.tags)))).sort(), [questions]);
  const counts = useMemo(
    () => ({
      easy: questions.filter((q) => q.difficulty === 'easy').length,
      medium: questions.filter((q) => q.difficulty === 'medium').length,
      hard: questions.filter((q) => q.difficulty === 'hard').length,
    }),
    [questions]
  );

  const filteredQuestions = questions.filter(
    (q) =>
      q.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (!difficulty || q.difficulty === difficulty) &&
      (!type || q.type === type) &&
      (!tag || parseJsonArray(q.tags).includes(tag))
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      alert(MSG.pleaseSelectMarkdownMd);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert(MSG.fileTooLargeMaximum);
      return;
    }

    setImporting(true);
    setShowNewDropdown(false);

    try {
      const text = await file.text();
      const data = await importQuestionFromMd(text);
      if (data.warnings && data.warnings.length > 0) {
        alert('Import warnings:\n' + data.warnings.join('\n'));
      }
      navigate('/admin/questions/new', { state: { prefill: data } });
    } catch (err: any) {
      alert('Import failed: ' + apiError(err, MSG.failedImportMdFile));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <AdminLayout
      title="Question Bank"
      subtitle={MSG.questionsEasyMediumHard(questions.length, counts.easy, counts.medium, counts.hard)}
      actions={
        <div className={styles.plusBox}>
          <button onClick={() => setShowNewDropdown(!showNewDropdown)} disabled={importing} className={styles.plusButton}>
            <Plus className={styles.plusIcon} />
            {importing ? 'Importing...' : 'New Question'}
            <ChevronDown className={styles.chevronDownIcon} />
          </button>
          {showNewDropdown && (
            <>
              <div className={styles.box} onClick={() => setShowNewDropdown(false)} />
              <div className={styles.manualBox}>
                <div className={styles.manualBox2}>
                  <Link to="/admin/questions/new" className={styles.manualLink}>
                    Manual
                  </Link>
                  <Link to="/admin/questions/ai" className={styles.sparklesLink}>
                    <span>Generate with AI</span>
                    <Sparkles className={styles.sparklesIcon} />
                  </Link>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={styles.uploadButton}
                  >
                    <span>{MSG.importMdFile}</span>
                    <Upload className={styles.uploadIcon} />
                  </button>
                </div>
              </div>
            </>
          )}
          <input type="file" ref={fileInputRef} className={styles.input} accept=".md,text/markdown" onChange={handleFileUpload} />
        </div>
      }
    >
      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Bank vs AI review queue */}
      <div className={styles.bankVsBox}>
        {([['bank', 'Question bank', questions.length], ['review', 'Pending review', pendingCount]] as const).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => { setView(key); if (key === 'bank') loadQuestions(); }}
            className={`${styles.labelButton} ${view === key ? styles.labelButtonSelected : styles.labelButtonDefault}`}
          >
            {label}
            <span className={`${styles.nLabel} ${key === 'review' && n > 0 ? styles.nLabelOn : styles.nLabelOff}`}>{n}</span>
          </button>
        ))}
      </div>

      {view === 'review' ? <ReviewQueue /> : <>
      {/* Filters */}
      <div className={styles.difficultyBox}>
        <div className={styles.searchBox}>
          <Search className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchQuestionsByInput}
            placeholder={MSG.searchQuestionsTitle}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select className={styles.difficultySelect} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select className={styles.difficultySelect} value={type} onChange={(e) => setType(e.target.value)} aria-label="Question type">
          <option value="">All types</option>
          <option value="coding">Coding</option>
          <option value="mcq">Multiple choice</option>
        </select>
        <select className={styles.difficultySelect} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Topic">
          <option value="">All topics</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {(searchTerm || difficulty || tag || type) && (
          <button onClick={() => { setSearchTerm(''); setDifficulty(''); setTag(''); setType(''); }} className={styles.clearButton}>
            <X className={styles.plusIcon} /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading questions..." />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No questions yet"
          body={MSG.createFirstQuestionGet}
          action={<Link to="/admin/questions/new" className="btn-primary"><Plus className={styles.plusIcon} /> Create Question</Link>}
        />
      ) : filteredQuestions.length === 0 ? (
        <p className={styles.noQuestionsMatchText}>{MSG.noQuestionsMatchThese}</p>
      ) : (
        <div className={styles.titleBox}>
          <div className={styles.titleBox2}>
            <table className={styles.titleTable}>
              <thead>
                <tr className={styles.titleRow}>
                  <th className={styles.titleTh}>Title</th>
                  <th className={styles.typeTh}>Type</th>
                  <th className={styles.typeTh}>Difficulty</th>
                  <th className={styles.typeTh}>Topics</th>
                  <th className={styles.testCasesTh}>Test cases</th>
                  <th className={styles.testCasesTh}>Languages</th>
                  <th className={styles.testCasesTh}>Used in</th>
                  <th className={styles.actionsTh}>Actions</th>
                </tr>
              </thead>
              <tbody className={styles.filtersBody}>
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className={styles.titleRow2}>
                    <td className={styles.titleCell}>
                      <button onClick={() => openPreview(q.id)} className={styles.titleButton}>
                        {q.title}
                      </button>
                    </td>
                    <td className={styles.filtersCell}>
                      <span className={styles.filtersLabel}>{q.type === 'mcq' ? 'MCQ' : 'Coding'}</span>
                      {q.source === 'ai' && <span className={styles.generatedByAiLabel} title={MSG.generatedAiApproved}><Sparkles className={styles.sparklesIcon2} /> AI</span>}
                    </td>
                    <td className={styles.difficultyCell}><span className={`badge-${q.difficulty}`}>{q.difficulty}</span></td>
                    <td className={styles.difficultyCell}>
                      <div className={styles.filtersBox}>
                        {parseJsonArray(q.tags).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTag(t)}
                            className={styles.tButton}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className={styles.filtersCell2}>{q.type === 'mcq' ? '—' : q._count?.testCases ?? 0}</td>
                    <td className={styles.filtersCell2}>{q._count?.starterCodes ?? 0}</td>
                    <td className={styles.filtersCell3}>
                      {q._count?.assessments ? (
                        <span className={styles.assessmentsLabel}>{q._count.assessments} assessment{q._count.assessments === 1 ? '' : 's'}</span>
                      ) : (
                        <span className={styles.filtersLabel2}>—</span>
                      )}
                    </td>
                    <td className={styles.titleCell}>
                      <div className={styles.previewBox}>
                        <button onClick={() => openPreview(q.id)} className={styles.previewButton} title="Preview">
                          <Eye className={styles.plusIcon} />
                        </button>
                        <Link to={`/admin/questions/${q.id}/edit`} className={styles.previewButton} title="Edit">
                          <Edit className={styles.plusIcon} />
                        </Link>
                        <button
                          onClick={() => handleDelete(q)}
                          className={styles.deleteButton}
                          title="Delete"
                        >
                          <Trash2 className={styles.plusIcon} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>}

      {/* Preview drawer */}
      {preview && (
        <div className={styles.exportAsMarkdownBox}>
          <div className={styles.previewDrawerBox} onClick={() => setPreview(null)} />
          <aside className={styles.exportAsMarkdownAside}>
            <div className={styles.exportAsMarkdownBox2}>
              <div>
                <h2 className={styles.title}>{preview.title}</h2>
                <div className={styles.difficultyBox2}>
                  <span className={`badge-${preview.difficulty}`}>{preview.difficulty}</span>
                  {parseJsonArray(preview.tags).map((t) => <span key={t}>#{t}</span>)}
                  <span>· {preview.timeLimit}s · {Math.round(preview.memoryLimit / 1024)} MB</span>
                </div>
              </div>
              <div className={styles.exportAsMarkdownBox3}>
                <button onClick={() => exportMarkdown(preview.id)} className={styles.previewButton} title="Export as Markdown"><Download className={styles.plusIcon} /></button>
                <Link to={`/admin/questions/${preview.id}/edit`} className={styles.previewButton} title="Edit"><Edit className={styles.plusIcon} /></Link>
                <button onClick={() => setPreview(null)} className={styles.previewButton} aria-label="Close"><X className={styles.xIcon} /></button>
              </div>
            </div>
            <div className={styles.statementBox}>
              <div className={styles.previewStatement}>
                <ReactMarkdown>{preview.statement}</ReactMarkdown>
              </div>
              <div>
                <h3 className={styles.testCasesTitle}>Test cases ({preview.testCases?.length ?? 0})</h3>
                <div className={styles.previewDrawerBox2}>
                  {preview.testCases?.map((tc, i) => (
                    <div key={tc.id} className={styles.testBox}>
                      <div className={styles.testBox2}>
                        <span className={styles.assessmentsLabel}>Test {i + 1}</span>
                        {tc.isSample ? (
                          <span className={styles.sampleLabel}><Eye className={styles.sparklesIcon2} /> Sample</span>
                        ) : (
                          <span className={styles.hiddenLabel}><EyeOff className={styles.sparklesIcon2} /> Hidden</span>
                        )}
                      </div>
                      <div className={styles.inputBox}>
                        <pre className={styles.inputPre}>{tc.input}</pre>
                        <pre className={styles.expectedOutputPre}>{tc.expectedOutput}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className={styles.testCasesTitle}>Starter code</h3>
                <p className={styles.previewDrawerText}>
                  {preview.starterCodes?.length ? preview.starterCodes.map((s) => s.languageName).join(', ') : 'None'}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </AdminLayout>
  );
}
