import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ThemeToggle from '../../components/ThemeToggle';
import {
  getAssessment, runCode, runTests,
  startSession, getSessionStatus, saveDraft, saveAllDrafts, finishSession, recordTabSwitch, recordPaste, apiError,
} from '../../services/api';
import { useTabSwitchDetection } from '../../hooks/useTabSwitchDetection';
import { TabSwitchWarning, TabSwitchStatus } from '../../components/exam/TabSwitchWarning';
import type { Assessment, QuestionState, AssessmentQuestion, TestCaseVerdict } from '../../types';
import {
  Code2, Clock, ChevronLeft, ChevronRight, Flag,
  AlertTriangle, Maximize2, Minimize2, Play, Check,
  Menu, X, CheckCircle, XCircle, AlertOctagon, Timer,
  BookOpen, Zap, FileText, Shield, ChevronDown, Target, Award, Lock, ArrowLeft,
} from 'lucide-react';
import styles from './AssessmentView.module.css';
import { LANGUAGES, ASSESSMENT_VIEW_MESSAGES as MSG } from '../../constants';

// Languages the assessment allows (all when not restricted)
function allowedLanguagesFor(assessment: Assessment) {
  let ids: number[] = [];
  try {
    ids = JSON.parse(assessment.allowedLanguages || '[]');
  } catch {
    ids = [];
  }
  const allowed = LANGUAGES.filter((l) => ids.includes(l.id));
  return allowed.length ? allowed : LANGUAGES;
}

// Fresh per-question state; MCQ answers are kept as a JSON list of option ids in `code`
function initialStates(data: Assessment): Map<number, QuestionState> {
  const states = new Map<number, QuestionState>();
  const allowed = allowedLanguagesFor(data);
  data.questions.forEach((aq: AssessmentQuestion) => {
    const q = aq.question;
    if (q.type === 'mcq') {
      states.set(q.id, {
        questionId: q.id, code: '[]', languageId: 0, languageName: 'MCQ', monacoLang: 'plaintext',
        isAnswered: false, isFlagged: false, output: '', isError: false, customInput: '', runMode: 'none', testVerdicts: [],
      });
      return;
    }
    // Prefer the first allowed language (Python unless restricted) when it has a starter
    const starterCode =
      allowed.map((l) => q.starterCodes?.find((sc) => sc.languageId === l.id)).find(Boolean) ?? q.starterCodes?.[0];
    const defaultLang = allowed[0];
    states.set(q.id, {
      questionId: q.id,
      code: starterCode?.code || `# Write your solution here\n`,
      languageId: starterCode?.languageId || defaultLang.id,
      languageName: starterCode?.languageName || defaultLang.name,
      monacoLang: LANGUAGES.find((l) => l.id === (starterCode?.languageId || defaultLang.id))?.monacoLang || 'python',
      isAnswered: false,
      isFlagged: false,
      output: '',
      isError: false,
      customInput: '',
      runMode: 'none',
      testVerdicts: [],
    });
  });
  return states;
}

function parseOptions(json: string | undefined): { id: string; text: string }[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseSelection(code: string): string[] {
  try {
    const v = JSON.parse(code || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// ── Verdict rendering helpers ──

function getVerdictColor(verdict: TestCaseVerdict) {
  if (verdict.passed) return 'emerald';
  if (verdict.statusId === 6) return 'red';
  if (verdict.statusId === 5) return 'amber';
  if (verdict.statusId >= 7 && verdict.statusId <= 12) return 'red';
  if (verdict.statusId === 3 || verdict.statusId === 4) return 'red';
  return 'red';
}

function getVerdictLabel(verdict: TestCaseVerdict) {
  if (verdict.passed) return 'Passed';
  if (verdict.statusId === 6) return 'Compilation Failed';
  if (verdict.statusId === 5) return 'Time Limit Exceeded';
  if (verdict.statusId >= 7 && verdict.statusId <= 12) return 'Runtime Error';
  if (verdict.statusId === 3) return 'Wrong Answer';
  if (verdict.statusId === 4) return 'Wrong Answer';
  if (verdict.statusId === -1) return 'Execution Error';
  return verdict.statusDescription || 'Error';
}

function VerdictIcon({ verdict }: { verdict: TestCaseVerdict }) {
  if (verdict.passed) return <CheckCircle className={styles.checkCircleIcon} />;
  if (verdict.statusId === 5) return <Timer className={styles.timerIcon} />;
  if (verdict.statusId === 6) return <AlertOctagon className={styles.alertOctagonIcon} />;
  if (verdict.statusId >= 7 && verdict.statusId <= 12) return <AlertOctagon className={styles.alertOctagonIcon} />;
  return <XCircle className={styles.alertOctagonIcon} />;
}

function VerdictCard({ verdict, index }: { verdict: TestCaseVerdict; index: number }) {
  const color = getVerdictColor(verdict);
  const label = getVerdictLabel(verdict);
  const [expanded, setExpanded] = useState(!verdict.passed);

  const borderClass =
    color === 'emerald' ? styles.borderEmerald :
    color === 'amber' ? styles.borderAmber : styles.borderDefault;
  const bgClass =
    color === 'emerald' ? styles.bgEmerald :
    color === 'amber' ? styles.bgAmber : styles.bgDefault;
  const labelClass =
    color === 'emerald' ? styles.passedCountLabelAllPassed :
    color === 'amber' ? styles.labelAmber : styles.passedCountLabelDefault;

  return (
    <div className={`${styles.chevronRightBox} ${borderClass} ${bgClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={styles.chevronRightButton}
      >
        <div className={styles.testCaseBox}>
          <VerdictIcon verdict={verdict} />
          <span className={styles.testCaseLabel}>Test Case {index + 1}</span>
          <span className={`${styles.label} ${labelClass}`}>{label}</span>
        </div>
        <div className={styles.testCaseBox}>
          {verdict.executionTime && <span className={styles.executionTimeLabel}>{verdict.executionTime}s</span>}
          <ChevronRight className={`${styles.chevronRightIcon} ${expanded ? styles.chevronRightIconExpanded : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className={styles.verdictRenderingBox}>
          {verdict.statusId === 6 && (verdict.compileOutput || verdict.stderr) && (
            <div>
              <span className={styles.compilerOutputLabel}>Compiler Output</span>
              <pre className={styles.verdictRenderingPre}>
                {verdict.compileOutput || verdict.stderr}
              </pre>
            </div>
          )}
          {verdict.statusId >= 7 && verdict.statusId <= 12 && verdict.stderr && (
            <div>
              <span className={styles.compilerOutputLabel}>Error Output</span>
              <pre className={styles.verdictRenderingPre}>
                {verdict.stderr}
              </pre>
            </div>
          )}
          {verdict.statusId === 5 && (
            <div className={styles.yourCodeExceededBox}>
              {MSG.codeExceededTimeLimit}</div>
          )}
          {(verdict.statusId === 3 || verdict.statusId === 4) && !verdict.passed && (
            <div className={styles.expectedBox}>
              <div>
                <span className={styles.expectedLabel}>Expected</span>
                <pre className={styles.expectedOutputPre}>
                  {verdict.expectedOutput}
                </pre>
              </div>
              <div>
                <span className={styles.expectedLabel}>Actual</span>
                <pre className={styles.verdictRenderingPre2}>
                  {verdict.actualOutput || '(no output)'}
                </pre>
              </div>
            </div>
          )}
          {verdict.passed && (
            <div className={styles.checkCircleBox}>
              <CheckCircle className={styles.checkCircleIcon2} />
              <span className={styles.outputMatchesExpectedLabel}>Output matches expected</span>
            </div>
          )}
          {verdict.statusId === -1 && (
            <div>
              <span className={styles.compilerOutputLabel}>Error</span>
              <pre className={styles.verdictRenderingPre}>
                {verdict.stderr || verdict.message || 'Unknown error'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function AssessmentView() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { candidateName } = useAuth();
  const { theme } = useTheme();

  // ── Phase: 'pre-test' | 'in-progress' | 'review' | 'submitted' ──
  const [phase, setPhase] = useState<'loading' | 'pre-test' | 'in-progress' | 'review' | 'submitted'>('loading');

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[]>([]);
  const [questionStates, setQuestionStates] = useState<Map<number, QuestionState>>(new Map());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOutputTab, setActiveOutputTab] = useState<'output' | 'input'>('output');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [startError, setStartError] = useState('');
  const [timeWarning, setTimeWarning] = useState('');
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchLimit, setTabSwitchLimit] = useState(3);
  const [autoSubmitReason, setAutoSubmitReason] = useState<'tab-switch' | null>(null);
  const [tabWarning, setTabWarning] = useState<{ count: number; awayMs: number } | null>(null);

  // Session state
  const [sessionId, setSessionId] = useState<number | null>(null);
  const sessionIdRef = useRef<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSubmittedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const questionStatesRef = useRef(questionStates);
  const prevQuestionIndexRef = useRef(0);

  // Keep ref in sync with state
  useEffect(() => {
    questionStatesRef.current = questionStates;
  }, [questionStates]);

  // Load assessment data (without starting timer)
  useEffect(() => {
    if (!assessmentId) return;
    loadAssessment(parseInt(assessmentId));
  }, [assessmentId]);

  // Timer countdown — only active during 'in-progress' phase
  useEffect(() => {
    if (phase !== 'in-progress') return;

    if (timeLeft <= 0 && !hasSubmittedRef.current && !isSubmittingRef.current) {
      // Auto-submit when timer runs out
      if (timerRef.current) clearInterval(timerRef.current);
      handleAutoSubmit();
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (!hasSubmittedRef.current && !isSubmittingRef.current) {
            handleAutoSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, timeLeft > 0]);

  // One-off warnings as the deadline approaches
  useEffect(() => {
    if (phase !== 'in-progress') return;
    const message =
      timeLeft === 300 ? MSG.fiveMinutesLeftWarning :
      timeLeft === 60 ? MSG.oneMinuteLeftWarning : '';
    if (!message) return;
    setTimeWarning(message);
    const t = setTimeout(() => setTimeWarning(''), 8000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  // Tab-switch detection — runs for the whole live session (answering + review), stops once submitting.
  // Switches before the limit show a warning; reaching the limit auto-submits the test.
  useTabSwitchDetection(
    (phase === 'in-progress' || phase === 'review') && !submitting,
    ({ leftAt, durationMs }) => {
      const sid = sessionIdRef.current;
      const event = { leftAt: leftAt.toISOString(), durationMs };
      const count = tabSwitchCount + 1;
      setTabSwitchCount(count);

      if (count >= tabSwitchLimit) {
        setTabWarning(null);
        setAutoSubmitReason('tab-switch');
        // Drafts are saved first; recording the limit-reaching switch then makes the server finish the session
        handleAutoSubmit(async () => {
          if (sid) await recordTabSwitch(sid, event);
        });
        return;
      }

      setTabWarning({ count, awayMs: durationMs });
      if (sid) {
        recordTabSwitch(sid, event)
          .then((res) => {
            setTabSwitchCount(res.count);
            if (res.autoSubmitted) {
              // Server's count had already reached the limit (e.g. switches from another device)
              setTabWarning(null);
              setAutoSubmitReason('tab-switch');
              hasSubmittedRef.current = true;
              setPhase('submitted');
            }
          })
          .catch((err) => console.error('Failed to record tab switch:', err));
      }
    }
  );

  // Auto-save interval (every 12 seconds)
  useEffect(() => {
    if (phase !== 'in-progress' || !sessionIdRef.current) return;

    autoSaveRef.current = setInterval(() => {
      doAutoSave();
    }, 12000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [phase, sessionId]);

  // Save draft on question switch
  useEffect(() => {
    if (phase !== 'in-progress' || !sessionIdRef.current) return;
    const prevIdx = prevQuestionIndexRef.current;
    if (prevIdx !== currentQuestionIndex && assessmentQuestions[prevIdx]) {
      const prevQ = assessmentQuestions[prevIdx].question;
      const prevState = questionStatesRef.current.get(prevQ.id);
      if (prevState) {
        saveDraft(sessionIdRef.current, {
          questionId: prevState.questionId,
          languageId: prevState.languageId,
          languageName: prevState.languageName,
          code: prevState.code,
          isFlagged: prevState.isFlagged,
          isAnswered: prevState.isAnswered,
        }).catch(console.error);
      }
    }
    prevQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  async function doAutoSave() {
    const sid = sessionIdRef.current;
    if (!sid || hasSubmittedRef.current) return;

    // Save current question's draft
    const currentQ = assessmentQuestions[currentQuestionIndex]?.question;
    if (currentQ) {
      const state = questionStatesRef.current.get(currentQ.id);
      if (state) {
        try {
          await saveDraft(sid, {
            questionId: state.questionId,
            languageId: state.languageId,
            languageName: state.languageName,
            code: state.code,
            isFlagged: state.isFlagged,
            isAnswered: state.isAnswered,
          });
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
      }
    }
  }

  async function loadAssessment(id: number) {
    try {
      const data = await getAssessment(id);
      setAssessment(data);
      setAssessmentQuestions(data.questions);

      // Questions arrive only once a session exists; before Start this is empty
      const states = initialStates(data);
      setQuestionStates(states);

      // Resume an existing session if there is one. This never creates a session,
      // so the timer only starts when the candidate clicks "Start Assessment".
      const status = await getSessionStatus(id);
      if (!status.exists) {
        setPhase('pre-test');
        return;
      }
      if (status.isFinished) {
        setPhase('submitted');
        return;
      }
      setSessionId(status.sessionId);
      sessionIdRef.current = status.sessionId;

      if (status.remainingSeconds <= 0) {
        // Time ran out while the candidate was away — grade the saved drafts
        hasSubmittedRef.current = true;
        isSubmittingRef.current = true;
        await finishSession(status.sessionId).catch(console.error);
        setPhase('submitted');
        return;
      }

      const updatedStates = new Map(states);
      for (const draft of status.drafts) {
        const existing = updatedStates.get(draft.questionId);
        if (existing) {
          updatedStates.set(draft.questionId, {
            ...existing,
            code: draft.code,
            languageId: draft.languageId,
            languageName: draft.languageName,
            monacoLang: LANGUAGES.find(l => l.id === draft.languageId)?.monacoLang || existing.monacoLang,
            isFlagged: draft.isFlagged,
            isAnswered: draft.isAnswered,
          });
        }
      }
      setQuestionStates(updatedStates);
      setTabSwitchCount(status.tabSwitchCount ?? 0);
      if (status.tabSwitchLimit) setTabSwitchLimit(status.tabSwitchLimit);
      setTimeLeft(status.remainingSeconds);
      setPhase('in-progress');
    } catch (err) {
      console.error('Failed to load assessment:', err);
      setLoadError(apiError(err, MSG.failedLoadAssessment));
      setPhase('pre-test');
    }
  }

  // Start assessment (called from pre-test screen)
  async function handleStartAssessment() {
    if (!assessment || !assessmentId) return;
    try {
      const sessionData = await startSession(parseInt(assessmentId));
      setSessionId(sessionData.sessionId);
      sessionIdRef.current = sessionData.sessionId;
      setTabSwitchCount(sessionData.tabSwitchCount ?? 0);
      if (sessionData.tabSwitchLimit) setTabSwitchLimit(sessionData.tabSwitchLimit);
      setTimeLeft(sessionData.remainingSeconds);
      // The server withholds questions until the timer starts — fetch this candidate's set now
      const fresh = await getAssessment(parseInt(assessmentId));
      setAssessment(fresh);
      setAssessmentQuestions(fresh.questions);
      setQuestionStates(initialStates(fresh));
      setCurrentQuestionIndex(0);
      setPhase('in-progress');
    } catch (err) {
      console.error('Failed to start session:', err);
      setStartError(apiError(err, MSG.failedStartAssessmentPlease));
    }
  }

  // Current question helpers
  const currentAQ = assessmentQuestions[currentQuestionIndex];
  const currentQuestion = currentAQ?.question;
  // Read by the editor's paste listener, which is registered once on mount
  const currentQuestionIdRef = useRef<number | null>(null);
  currentQuestionIdRef.current = currentQuestion?.id ?? null;
  const currentState = currentQuestion ? questionStates.get(currentQuestion.id) : undefined;
  const sampleTestCases = currentQuestion?.testCases?.filter((tc) => tc.isSample) || [];

  // Stats
  const answered = Array.from(questionStates.values()).filter((s) => s.isAnswered).length;
  const flagged = Array.from(questionStates.values()).filter((s) => s.isFlagged).length;
  const unanswered = questionStates.size - answered;
  const totalMarks = assessmentQuestions.reduce((acc, aq) => acc + (aq.marks ?? 0), 0);

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min} min ${sec.toString().padStart(2, '0')} sec`;
  };

  const updateState = useCallback((qId: number, updates: Partial<QuestionState>) => {
    setQuestionStates((prev) => {
      const next = new Map(prev);
      const current = next.get(qId);
      if (current) {
        next.set(qId, { ...current, ...updates });
      }
      return next;
    });
  }, []);

  function handleLanguageChange(langId: number) {
    if (!currentQuestion) return;
    const lang = LANGUAGES.find((l) => l.id === langId);
    if (!lang) return;

    const starterCode = currentQuestion.starterCodes?.find((sc) => sc.languageId === langId);
    const currentCode = currentState?.code || '';
    const isDefault = currentQuestion.starterCodes?.some((sc) => sc.code === currentCode);

    updateState(currentQuestion.id, {
      languageId: langId,
      languageName: lang.name,
      monacoLang: lang.monacoLang,
      code: isDefault && starterCode ? starterCode.code : currentCode,
    });
  }

  // Run Code
  async function handleRunCode() {
    if (!currentQuestion || !currentState) return;
    setRunning(true);
    setActiveOutputTab('output');

    const hasCustomInput = activeOutputTab === 'input' && currentState.customInput.trim().length > 0;

    if (hasCustomInput) {
      try {
        const result = await runCode({
          sourceCode: currentState.code,
          languageId: currentState.languageId,
          stdin: currentState.customInput,
        });

        let output = '';
        if (result.isError) {
          if (result.compileOutput) output = result.compileOutput;
          else if (result.stderr) output = result.stderr;
          else output = `${result.statusDescription}${result.message ? ': ' + result.message : ''}`;
        } else {
          output = result.stdout || '(No output)';
          if (result.executionTime) {
            output += MSG.executionStats(result.executionTime, result.memoryUsed ? (result.memoryUsed / 1024).toFixed(1) : null);
          }
        }

        updateState(currentQuestion.id, {
          output, isError: result.isError, runMode: 'custom', testVerdicts: [],
        });
      } catch (err: any) {
        updateState(currentQuestion.id, {
          output: `Error: ${err.message || MSG.failedExecuteCode}`,
          isError: true, runMode: 'custom', testVerdicts: [],
        });
      }
    } else {
      try {
        const result = await runTests({
          sourceCode: currentState.code,
          languageId: currentState.languageId,
          questionId: currentQuestion.id,
        });

        updateState(currentQuestion.id, {
          output: '', isError: !result.allPassed, runMode: 'testcases', testVerdicts: result.verdicts,
        });
      } catch (err: any) {
        updateState(currentQuestion.id, {
          output: `Error: ${err.message || MSG.failedRunTestCases}`,
          isError: true, runMode: 'testcases', testVerdicts: [],
        });
      }
    }

    setRunning(false);
  }

  function handleConfirm() {
    if (!currentQuestion) return;
    updateState(currentQuestion.id, { isAnswered: true });

    const nextUnanswered = assessmentQuestions.findIndex(
      (aq, idx) => idx > currentQuestionIndex && !questionStates.get(aq.question.id)?.isAnswered
    );
    if (nextUnanswered !== -1) {
      setCurrentQuestionIndex(nextUnanswered);
    }
  }

  function handleToggleFlag() {
    if (!currentQuestion) return;
    updateState(currentQuestion.id, { isFlagged: !currentState?.isFlagged });
  }

  // Submit Test — shows review screen first
  function handleSubmitTest() {
    if (submitting || hasSubmittedRef.current) return;
    setPhase('review');
  }

  // Confirm submission from review screen
  async function handleConfirmSubmit() {
    if (submitting || hasSubmittedRef.current || isSubmittingRef.current) return;
    hasSubmittedRef.current = true;
    isSubmittingRef.current = true;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);

    try {
      // Save all drafts first
      if (sessionIdRef.current) {
        const allDrafts = assessmentQuestions.map(aq => {
          const state = questionStatesRef.current.get(aq.question.id);
          return {
            questionId: aq.question.id,
            languageId: state?.languageId || 71,
            languageName: state?.languageName || 'Python',
            code: state?.code || '',
            isFlagged: state?.isFlagged || false,
            isAnswered: state?.isAnswered || false,
          };
        });
        await saveAllDrafts(sessionIdRef.current, allDrafts);

        // Finish session — grades against ALL test cases
        await finishSession(sessionIdRef.current);
      }

      setPhase('submitted');
    } catch (err) {
      console.error('Failed to submit:', err);
      alert(MSG.failedSubmitTestPlease);
      hasSubmittedRef.current = false;
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  // Auto-submit on timeout or tab-switch limit (skips review/confirmation).
  // `beforeFinish` runs after drafts are saved and before the session is finalised.
  async function handleAutoSubmit(beforeFinish?: () => Promise<void>) {
    if (hasSubmittedRef.current || isSubmittingRef.current || submitting) return;
    hasSubmittedRef.current = true;
    isSubmittingRef.current = true;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);

    try {
      if (sessionIdRef.current) {
        const allDrafts = assessmentQuestions.map(aq => {
          const state = questionStatesRef.current.get(aq.question.id);
          return {
            questionId: aq.question.id,
            languageId: state?.languageId || 71,
            languageName: state?.languageName || 'Python',
            code: state?.code || '',
            isFlagged: state?.isFlagged || false,
            isAnswered: state?.isAnswered || false,
          };
        });
        await saveAllDrafts(sessionIdRef.current, allDrafts);
        if (beforeFinish) await beforeFinish().catch((err) => console.error('Pre-submit step failed:', err));
        await finishSession(sessionIdRef.current);
      }
      setPhase('submitted');
    } catch (err) {
      console.error('Auto-submit failed:', err);
      // Still show submitted — the drafts are saved
      setPhase('submitted');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render output panel ──
  const isConsolidatedCompileError =
    currentState?.runMode === 'testcases' &&
    currentState.testVerdicts.length > 0 &&
    currentState.testVerdicts.every(v => v.statusId === 6);

  function renderOutputContent() {
    if (!currentState) return null;

    if (running) {
      return (
        <div className={styles.runningBox}>
          <div className={styles.renderOutputBox} />
          Running...
        </div>
      );
    }

    if (currentState.runMode === 'none') {
      return (
        <div className={styles.clickRunCodeBox}>
          <span className={styles.clickRunCodeLabel}>{MSG.clickRunCodeSee}</span>
        </div>
      );
    }

    if (currentState.runMode === 'custom') {
      return (
        <div className={styles.outputBox}>
          <div className={styles.customInputBox}>
            <span className={styles.customInputLabel}>
              Custom Input
            </span>
          </div>
          <pre className={currentState.isError ? styles.outputPreError : styles.outputPreDefault}>
            {currentState.output}
          </pre>
        </div>
      );
    }

    if (currentState.runMode === 'testcases') {
      if (currentState.testVerdicts.length === 0 && currentState.output) {
        return (
          <div className={styles.clickRunCodeBox}>
            <pre className={styles.outputPreError}>{currentState.output}</pre>
          </div>
        );
      }

      if (isConsolidatedCompileError) {
        const firstVerdict = currentState.testVerdicts[0];
        return (
          <div className={styles.outputBox}>
            <div className={styles.customInputBox}>
              <span className={styles.customInputLabel}>
                Sample Test Cases
              </span>
              <span className={styles.renderOutputLabel}>0/{currentState.testVerdicts.length} passed</span>
            </div>
            <div className={styles.alertOctagonBox}>
              <div className={styles.customInputBox}>
                <AlertOctagon className={styles.alertOctagonIcon} />
                <span className={styles.compilationFailedLabel}>Compilation Failed</span>
              </div>
              <pre className={styles.renderOutputPre}>
                {firstVerdict.compileOutput || firstVerdict.stderr}
              </pre>
            </div>
          </div>
        );
      }

      const passedCount = currentState.testVerdicts.filter(v => v.passed).length;
      const total = currentState.testVerdicts.length;
      const allPassed = passedCount === total;

      return (
        <div className={styles.outputBox}>
          <div className={styles.customInputBox}>
            <span className={styles.customInputLabel}>
              Sample Test Cases
            </span>
            <span className={`${styles.passedCountLabel} ${allPassed ? styles.passedCountLabelAllPassed : styles.passedCountLabelDefault}`}>
              {passedCount}/{total} passed
            </span>
          </div>
          <div className={styles.renderOutputBox2}>
            {currentState.testVerdicts.map((verdict, idx) => (
              <VerdictCard key={idx} verdict={verdict} index={idx} />
            ))}
          </div>
        </div>
      );
    }

    return null;
  }

  const availableLangs = assessment ? allowedLanguagesFor(assessment) : LANGUAGES;

  // ═══════════════════════════════════════════
  // ── RENDER: LOADING ──
  // ═══════════════════════════════════════════
  if (phase === 'loading') {
    return (
      <div className={styles.loadingAssessmentBox}>
        <div className={styles.loadingAssessmentBox2}>
          <div className={styles.box} />
          <p className={styles.loadingAssessmentText}>Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (loadError || !assessment) {
    return (
      <div className={styles.lockBox}>
        <div className={styles.lockBox2}>
          <Lock className={styles.lockIcon} />
          <h2 className={styles.thisAssessmentIsnTitle}>{MSG.assessmentIsntAvailable}</h2>
          <p className={styles.pText}>{loadError || 'Assessment not found.'}</p>
          <button onClick={() => navigate('/exam')} className="btn-outline">
            <ArrowLeft className={styles.arrowLeftIcon} /> {MSG.backMyAssessments}</button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ── RENDER: PRE-TEST SCREEN ──
  // ═══════════════════════════════════════════
  if (phase === 'pre-test' && assessment) {
    return (
      <div className={styles.lockBox}>
        <div className={styles.box2}>
          <div className={styles.box3} />
          <div className={styles.box4} />
        </div>

        <div className={styles.zapBox}>
          <div className="card">
            {/* Header */}
            <div className={styles.codeBox}>
              <div className={styles.codeBox2}>
                <Code2 className={styles.codeIcon} />
              </div>
              <div>
                <h1 className={styles.nameTitle}>{assessment.name}</h1>
                <p className={styles.codingAssessmentText}>Coding Assessment</p>
              </div>
            </div>
            {assessment.description && <p className={styles.descriptionText}>{assessment.description}</p>}

            {/* Assessment details */}
            <div className={styles.awardBox}>
              <div className={styles.awardBox2}>
                <Award className={styles.awardIcon} />
                <div>
                  <p className={styles.totalMarksText}>Total marks</p>
                  <p className={styles.totalMarksText2}>{totalMarks} marks</p>
                </div>
              </div>
              <div className={styles.awardBox2}>
                <Target className={styles.awardIcon} />
                <div>
                  <p className={styles.totalMarksText}>To pass</p>
                  <p className={styles.totalMarksText2}>{assessment.passingScore}% of marks</p>
                </div>
              </div>
              <div className={styles.awardBox2}>
                <Clock className={styles.awardIcon} />
                <div>
                  <p className={styles.totalMarksText}>Duration</p>
                  <p className={styles.totalMarksText2}>{assessment.timeLimitMinutes} minutes</p>
                </div>
              </div>
              <div className={styles.awardBox2}>
                <FileText className={styles.awardIcon} />
                <div>
                  <p className={styles.totalMarksText}>Questions</p>
                  <p className={styles.totalMarksText2}>{assessment.questionTotal ?? assessmentQuestions.length} questions</p>
                </div>
              </div>
            </div>

            {/* Languages */}
            <div className={styles.allowedLanguagesBox}>
              <p className={styles.allowedLanguagesText}>Allowed Languages</p>
              <div className={styles.languagesBox}>
                {availableLangs.map(lang => (
                  <span key={lang.id} className={styles.nameLabel}>
                    {lang.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className={styles.bookOpenBox}>
              <div className={styles.bookOpenBox2}>
                <BookOpen className={styles.bookOpenIcon} />
                <h3 className={styles.totalMarksText2}>Instructions</h3>
              </div>
              {assessment.instructions && (
                <div className={styles.instructionsBox}>
                  <ReactMarkdown>{assessment.instructions}</ReactMarkdown>
                </div>
              )}
              <ul className={styles.theTimerStartsList}>
                <li>{MSG.timerStartsOnceClick}</li>
                <li className={styles.stayOnThisItem}>
                  {MSG.stayTabLeavingSwitching}{' '}
                  <span className={styles.warningsLabel}>{tabSwitchLimit - 1} warnings</span>. Leaving {tabSwitchLimit} {MSG.timesSubmitsTestAutomatically}</li>
                <li className={styles.stayOnThisItem}>{MSG.finalGradingRunsAgainst}</li>
              </ul>
            </div>

            {startError && (
              <div className={styles.startErrorBox}>{startError}</div>
            )}

            {/* Start button */}
            <button
              onClick={handleStartAssessment}
              className={styles.startAssessmentButton}
            >
              <Zap className={styles.zapIcon} />
              Start Assessment
            </button>

            <p className={styles.welcomeText}>
              Welcome, <span className={styles.loadingAssessmentText}>{candidateName}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ── RENDER: REVIEW SCREEN ──
  // ═══════════════════════════════════════════
  if (phase === 'review' && assessment) {
    return (
      <div className={styles.lockBox}>
        <div className={styles.box2}>
          <div className={styles.box5} />
        </div>

        <div className={styles.shieldBox}>
          <div className="card">
            <div className={styles.codeBox}>
              <div className={styles.shieldBox2}>
                <Shield className={styles.shieldIcon} />
              </div>
              <div>
                <h2 className={styles.reviewSubmitTitle}>Review & Submit</h2>
                <p className={styles.codingAssessmentText}>{assessment.name}</p>
              </div>
            </div>

            {/* Time remaining */}
            <div className={styles.timeRemainingBox}>
              <span className={styles.codingAssessmentText}>Time remaining</span>
              <span className={`${styles.timeRemainingLabel} ${timeLeft < 300 ? styles.passedCountLabelDefault : styles.timeRemainingLabelLow}`}>
                {formatTime(timeLeft)}
              </span>
            </div>

            {/* Summary */}
            <div className={styles.answeredBox}>
              <div className={styles.answeredBox2}>
                <p className={styles.answeredText}>{answered}</p>
                <p className={styles.answeredText2}>Answered</p>
              </div>
              <div className={styles.flaggedBox}>
                <p className={styles.flaggedText}>{flagged}</p>
                <p className={styles.flaggedText2}>Flagged</p>
              </div>
              <div className={styles.unansweredBox}>
                <p className={styles.unansweredText}>{unanswered}</p>
                <p className={styles.unansweredText2}>Unanswered</p>
              </div>
            </div>

            {/* Per-question status */}
            <div className={styles.perQuestionBox}>
              {assessmentQuestions.map((aq, idx) => {
                const state = questionStates.get(aq.question.id);
                const isAnswered = state?.isAnswered;
                const isFlagged = state?.isFlagged;
                return (
                  <div key={aq.id} className={styles.qBox}>
                    <div className={styles.testCaseBox}>
                      <span className={styles.qLabel}>Q{idx + 1}</span>
                      <span className={styles.titleLabel}>{aq.question.title}</span>
                    </div>
                    <div className={styles.perQuestionBox2}>
                      {isFlagged && <Flag className={styles.flagIcon} />}
                      {isAnswered ? (
                        <span className={styles.answeredLabel}>Answered</span>
                      ) : (
                        <span className={styles.unansweredLabel}>Unanswered</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Warning */}
            <div className={styles.alertTriangleBox}>
              <p className={styles.areYouSureText}>
                <AlertTriangle className={styles.alertTriangleIcon} />
                {MSG.sureWantSubmitCannot}</p>
            </div>

            {/* Actions */}
            <div className={styles.goBackBox}>
              <button
                onClick={() => setPhase('in-progress')}
                className={styles.goBackButton}
                disabled={submitting}
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className={styles.confirmSubmitButton}
              >
                {submitting ? (
                  <>
                    <div className={styles.actionsBox} />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className={styles.arrowLeftIcon} />
                    Confirm Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        {tabWarning && !submitting && (
          <TabSwitchWarning count={tabWarning.count} limit={tabSwitchLimit} awayMs={tabWarning.awayMs} onDismiss={() => setTabWarning(null)} />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ── RENDER: SUBMITTED SCREEN ──
  // ═══════════════════════════════════════════
  if (phase === 'submitted') {
    return (
      <div className={styles.lockBox}>
        <div className={styles.box2}>
          <div className={styles.box6} />
        </div>

        <div className={styles.thankYouBox}>
          <div className={styles.thankYouBox2}>
            {autoSubmitReason === 'tab-switch' ? (
              <>
                <div className={styles.alertOctagonBox2}>
                  <AlertOctagon className={styles.alertOctagonIcon2} />
                </div>
                <h2 className={styles.testAutoSubmittedTitle}>Test Auto-Submitted</h2>
                <div className={styles.youLeftTheBox}>
                  {MSG.leftTestWindow}{tabSwitchLimit} {MSG.timesSavedAnswersWere}</div>
              </>
            ) : (
              <>
                <div className={styles.checkCircleBox2}>
                  <CheckCircle className={styles.checkCircleIcon3} />
                </div>
                <h2 className={styles.testAutoSubmittedTitle}>Assessment Submitted</h2>
                <p className={styles.yourAssessmentHasText}>
                  {MSG.assessmentHasBeenSubmitted}</p>
              </>
            )}
            <p className={styles.thankYouText}>
              Thank you, <span className={styles.candidateNameLabel}>{candidateName}</span>{MSG.responsesBeingEvaluated}</p>

            <div className={styles.viewResultsBox}>
              <button
                onClick={() => navigate(`/exam/${assessmentId}/result`)}
                className={styles.viewResultsButton}
              >
                View Results
              </button>
              <button
                onClick={() => navigate('/exam')}
                className={styles.backToDashboardButton}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // ── RENDER: IN-PROGRESS (Main Assessment UI) ──
  // ═══════════════════════════════════════════
  if (!assessment || !currentQuestion || !currentState) {
    return (
      <div className={styles.loadingAssessmentBox}>
        <p className={styles.loadingAssessmentText}>Assessment not found.</p>
      </div>
    );
  }

  const isTimeLow = timeLeft < 300;
  const timeFraction = assessment.timeLimitMinutes > 0 ? timeLeft / (assessment.timeLimitMinutes * 60) : 0;

  return (
    <div className={styles.timeRemainingBox2}>
      {/* ─── TOP HEADER BAR ─── */}
      <header className={styles.codeHeader}>
        <div className={styles.codeBox3}>
          <div className={styles.codeBox4}>
            <Code2 className={styles.codeIcon2} />
          </div>
          <span className={styles.wissenCodeLabel}>WissenCode</span>
        </div>

        <div className={styles.nameBox}>
          <span className={styles.nameLabel2}>{assessment.name}</span>
        </div>

        <div className={styles.clockBox}>
          <ThemeToggle />
          <TabSwitchStatus count={tabSwitchCount} limit={tabSwitchLimit} />
          <div className={`${styles.clockBox2} ${isTimeLow ? styles.clockBoxTimeLow : styles.clockBoxDefault}`}>
            <Clock className={styles.arrowLeftIcon} />
            <span className={styles.topHeaderLabel}>{formatTime(timeLeft)}</span>
          </div>
          <button
            onClick={handleSubmitTest}
            disabled={submitting}
            className={styles.submitTestButton}
          >
            {submitting ? 'Submitting...' : 'Submit Test'}
          </button>
        </div>
      </header>

      {/* Time remaining */}
      <div
        className={styles.timeRemainingBox3}
        role="progressbar"
        aria-label="Time remaining"
        aria-valuemin={0}
        aria-valuemax={assessment.timeLimitMinutes * 60}
        aria-valuenow={timeLeft}
      >
        <div
          className={`${styles.timeRemainingBox4} ${isTimeLow ? styles.timeRemainingBoxTimeLow : timeFraction < 0.25 ? styles.timeRemainingBoxHigh : styles.timeRemainingBoxLow}`}
          style={{ width: `${Math.max(0, Math.min(1, timeFraction)) * 100}%` }}
        />
      </div>
      {timeWarning && (
        <div role="alert" className={styles.timeWarningBox}>
          <Clock className={styles.arrowLeftIcon} /> {timeWarning}
          <button onClick={() => setTimeWarning('')} className={styles.dismissButton} aria-label="Dismiss"><X className={styles.arrowLeftIcon} /></button>
        </div>
      )}

      {/* ─── NAVIGATION BAR ─── */}
      <nav className={styles.sectionOfNav}>
        <div className={styles.sectionOfBox}>
          <span className={styles.sectionOfLabel}>Section 1 of 1</span>
          <span className={styles.candidateNameLabel}>{currentQuestion.type === 'mcq' ? 'Multiple choice' : 'Coding'}</span>
        </div>

        <div className={styles.chevronLeftBox}>
          <button
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
            disabled={currentQuestionIndex === 0}
            className={styles.chevronLeftButton}
          >
            <ChevronLeft className={styles.arrowLeftIcon} />
          </button>

          <div className={styles.navigationBarBox}>
            {assessmentQuestions.map((aq, idx) => {
              const state = questionStates.get(aq.question.id);
              const isActive = idx === currentQuestionIndex;
              const isAnswered = state?.isAnswered;
              const isFlagged = state?.isFlagged;

              let pillClass = 'question-pill-default';
              if (isActive) pillClass = 'question-pill-active';
              else if (isAnswered) pillClass = 'question-pill-answered';
              else if (isFlagged) pillClass = 'question-pill-flagged';

              return (
                <button
                  key={aq.id}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={pillClass}
                >
                  {idx + 1}
                  {(isAnswered || isFlagged) && (
                    <span
                      className={`${styles.navigationBarLabel} ${isAnswered ? styles.navigationBarLabelAnswered : styles.navigationBarLabelDefault}`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() =>
              setCurrentQuestionIndex(
                Math.min(assessmentQuestions.length - 1, currentQuestionIndex + 1)
              )
            }
            disabled={currentQuestionIndex === assessmentQuestions.length - 1}
            className={styles.chevronLeftButton}
          >
            <ChevronRight className={styles.arrowLeftIcon} />
          </button>
        </div>

        <div className={styles.answeredBox3}>
          <div className={styles.answeredBox4}>
            <span className={styles.perQuestionBox2}>
              <span className={styles.navigationBarLabel2} />
              <span className={styles.loadingAssessmentText}>Answered</span>
              <span className={styles.answeredLabel2}>{answered}</span>
            </span>
            <span className={styles.perQuestionBox2}>
              <span className={styles.navigationBarLabel3} />
              <span className={styles.loadingAssessmentText}>Flag</span>
              <span className={styles.answeredLabel2}>{flagged}</span>
            </span>
            <span className={styles.perQuestionBox2}>
              <span className={styles.navigationBarLabel4} />
              <span className={styles.loadingAssessmentText}>Unanswered</span>
              <span className={styles.answeredLabel2}>{unanswered}</span>
            </span>
          </div>
          <button
            onClick={() => setShowOverview(!showOverview)}
            className={styles.navigationBarButton}
          >
            {showOverview ? <X className={styles.arrowLeftIcon} /> : <Menu className={styles.arrowLeftIcon} />}
          </button>
        </div>
      </nav>

      {/* ─── MAIN CONTENT (SPLIT PANEL) ─── */}
      <div className={styles.flagBox}>
        {/* ── LEFT PANEL: Question ── */}
        <div className={`${styles.flagBox2} ${isFullscreen ? styles.flagBoxFullscreen : styles.flagBoxDefault}`}>
          <div className={styles.alertTriangleBox2}>
            <div className={styles.alertTriangleBox3}>
              <div>
                <p className={styles.totalMarksText}>Question {currentQuestionIndex + 1} of {assessmentQuestions.length}</p>
                <h2 className={styles.reviewSubmitTitle}>{currentQuestion.title}</h2>
                <div className={styles.difficultyBox}>
                  <span className={`badge-${currentQuestion.difficulty}`}>{currentQuestion.difficulty}</span>
                  <span className={styles.marksLabel}>{currentAQ.marks} marks</span>
                </div>
              </div>
              <button className={styles.reportAProblemButton}>
                <AlertTriangle className={styles.checkCircleIcon2} />
                Report a problem
              </button>
            </div>

            <div className={styles.questionStatement}>
              <div className={styles.statementBox}>
                <ReactMarkdown>{currentQuestion.statement}</ReactMarkdown>
              </div>
            </div>

            {sampleTestCases.map((tc, idx) => (
              <div key={tc.id} className={styles.sampleInputBox}>
                <h4 className={styles.allowedLanguagesText}>
                  Sample Input {sampleTestCases.length > 1 ? idx + 1 : ''}
                </h4>
                <div className={styles.leftPanelBox}>{tc.input || '(empty)'}</div>
                <h4 className={styles.allowedLanguagesText}>
                  Sample Output {sampleTestCases.length > 1 ? idx + 1 : ''}
                </h4>
                <div className="sample-box">{tc.expectedOutput}</div>
              </div>
            ))}
          </div>

          <div className={styles.flagBox3}>
            <button
              onClick={handleToggleFlag}
              className={`${styles.toggleFlagButton} ${currentState.isFlagged ? styles.toggleFlagButtonFlagged : ''}`}
            >
              <Flag className={styles.arrowLeftIcon} />
              {currentState.isFlagged ? 'Flagged' : 'Flag'}
            </button>
            <div className={styles.previousBox}>
              <button
                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
                className={styles.previousButton}
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentQuestionIndex(
                    Math.min(assessmentQuestions.length - 1, currentQuestionIndex + 1)
                  )
                }
                disabled={currentQuestionIndex === assessmentQuestions.length - 1}
                className={styles.previousButton}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Code Editor (or answer options for multiple choice) ── */}
        <div className={styles.leftPanelBox2}>
          {currentQuestion.type === 'mcq' ? (
            <McqAnswerPanel
              options={parseOptions(currentQuestion.options)}
              multiple={!!currentQuestion.multipleCorrect}
              selected={parseSelection(currentState.code)}
              onChange={(ids) => updateState(currentQuestion.id, { code: JSON.stringify(ids), isAnswered: ids.length > 0 })}
              onConfirm={handleConfirm}
            />
          ) : (<>
          <div className={styles.codeEditorBox}>
            <span className={styles.qLabel}>Code editor</span>
            <div className={styles.leftPanelBox3}>
              <select
                value={currentState.languageId}
                onChange={(e) => handleLanguageChange(parseInt(e.target.value))}
                className={styles.leftPanelSelect}
              >
                {availableLangs.map((lang) => (
                  <option key={lang.id} value={lang.id}>{lang.name}</option>
                ))}
              </select>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={styles.navigationBarButton}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className={styles.arrowLeftIcon} /> : <Maximize2 className={styles.arrowLeftIcon} />}
              </button>
            </div>
          </div>

          <div className={styles.leftPanelBox4}>
            <Editor
              height="100%"
              language={currentState.monacoLang}
              value={currentState.code}
              onChange={(value) => {
                if (currentQuestion) {
                  updateState(currentQuestion.id, { code: value || '' });
                }
              }}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              onMount={(editor) => {
                // Record every paste (size only, never the content) for the proctoring report
                editor.onDidPaste(({ range }) => {
                  const text = editor.getModel()?.getValueInRange(range) ?? '';
                  const sid = sessionIdRef.current;
                  const questionId = currentQuestionIdRef.current;
                  if (!text || !sid || !questionId || hasSubmittedRef.current) return;
                  recordPaste(sid, { questionId, charCount: text.length, lineCount: text.split('\n').length })
                    .catch((err) => console.error('Failed to record paste:', err));
                });
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'gutter',
                folding: true,
                tabSize: 4,
              }}
            />
          </div>

          {/* Output tabs */}
          <div className={styles.enterCustomInputBox}>
            <div className={styles.enterCustomInputBox2}>
              <button
                onClick={() => setActiveOutputTab('input')}
                className={`${styles.enterCustomInputButton} ${activeOutputTab === 'input' ? 'tab-active' : 'tab-inactive'}`}
              >
                Enter Custom input
              </button>
              <button
                onClick={() => setActiveOutputTab('output')}
                className={`${styles.enterCustomInputButton} ${activeOutputTab === 'output' ? 'tab-active' : 'tab-inactive'}`}
              >
                Output
              </button>
            </div>

            <div className={styles.outputTabsBox}>
              {activeOutputTab === 'input' ? (
                <textarea
                  className={styles.enterCustomInputTextarea}
                  placeholder={MSG.enterCustomInputHere}
                  value={currentState.customInput}
                  onChange={(e) =>
                    updateState(currentQuestion.id, { customInput: e.target.value })
                  }
                />
              ) : (
                <div className={styles.outputTabsBox2}>
                  {renderOutputContent()}
                </div>
              )}
            </div>

            <div className={styles.playBox}>
              <button
                onClick={handleRunCode}
                disabled={running}
                className="btn-outline"
              >
                <Play className={styles.arrowLeftIcon} />
                {running ? 'Running...' : (
                  activeOutputTab === 'input' && currentState.customInput.trim()
                    ? MSG.runCustomInput
                    : 'Run code'
                )}
              </button>
              <button onClick={handleConfirm} className="btn-success">
                <Check className={styles.arrowLeftIcon} />
                Confirm
              </button>
            </div>
          </div>
          </>)}
        </div>

        {/* ── QUESTION OVERVIEW PANEL ── */}
        {showOverview && (
          <div className={styles.questionOverviewBox}>
            <div className={styles.questionOverviewBox2}>
              <h3 className={styles.questionOverviewTitle}>Question Overview</h3>
              <div className={styles.questionOverviewBox3}>
                {assessmentQuestions.map((aq, idx) => {
                  const state = questionStates.get(aq.question.id);
                  const isActive = idx === currentQuestionIndex;
                  const isAnswered = state?.isAnswered;
                  const isFlagged = state?.isFlagged;

                  let bg = styles.submittingOverlayLabelDefault2;
                  if (isActive) bg = styles.overviewActive;
                  else if (isAnswered) bg = styles.overviewAnswered;
                  else if (isFlagged) bg = styles.overviewFlagged;

                  return (
                    <button
                      key={aq.id}
                      onClick={() => {
                        setCurrentQuestionIndex(idx);
                        setShowOverview(false);
                      }}
                      className={`${styles.questionOverviewButton} ${bg}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className={styles.answeredBox5}>
                <div className={styles.testCaseBox}>
                  <span className={styles.questionOverviewLabel} />
                  <span className={styles.loadingAssessmentText}>Answered ({answered})</span>
                </div>
                <div className={styles.testCaseBox}>
                  <span className={styles.questionOverviewLabel2} />
                  <span className={styles.loadingAssessmentText}>Flagged ({flagged})</span>
                </div>
                <div className={styles.testCaseBox}>
                  <span className={styles.questionOverviewLabel3} />
                  <span className={styles.loadingAssessmentText}>Unanswered ({unanswered})</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {tabWarning && !submitting && (
        <TabSwitchWarning count={tabWarning.count} limit={tabSwitchLimit} awayMs={tabWarning.awayMs} onDismiss={() => setTabWarning(null)} />
      )}

      {/* Submitting overlay */}
      {submitting && (
        <div className={styles.submittingTestBox}>
          <div className={styles.submittingTestBox2}>
            <div className={styles.submittingOverlayBox} />
            <h3 className={styles.thisAssessmentIsnTitle}>Submitting Test</h3>
            <p className={styles.runningYourCodeText}>
              {MSG.runningCodeAgainstAll}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function McqAnswerPanel({ options, multiple, selected, onChange, onConfirm }: {
  options: { id: string; text: string }[];
  multiple: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  onConfirm: () => void;
}) {
  function toggle(id: string) {
    if (multiple) onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else onChange(selected[0] === id ? [] : [id]);
  }
  return (
    <div className={styles.leftPanelBox2}>
      <div className={styles.codeEditorBox}>
        <span className={styles.qLabel}>Your answer</span>
        <span className={styles.executionTimeLabel}>{multiple ? MSG.selectAllApply : 'Select one answer'}</span>
      </div>
      <div className={styles.alertTriangleBox2}>
        <div role={multiple ? 'group' : 'radiogroup'} aria-label="Answer options" className={styles.answerOptionsBox}>
          {options.map((o, i) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role={multiple ? 'checkbox' : 'radio'}
                aria-checked={on}
                onClick={() => toggle(o.id)}
                className={`${styles.textButton} ${on ? styles.textButtonOn : styles.textButtonDefault}`}
              >
                <span className={`${styles.submittingOverlayLabel} ${multiple ? styles.submittingOverlayLabelMultiple : styles.submittingOverlayLabelDefault} ${on ? styles.submittingOverlayLabelOn : styles.submittingOverlayLabelDefault2}`}>
                  {on ? <Check className={styles.arrowLeftIcon} /> : String.fromCharCode(65 + i)}
                </span>
                <span className={styles.textLabel}>{o.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.clearSelectionBox}>
        <button onClick={() => onChange([])} disabled={!selected.length} className={styles.clearSelectionButton}>Clear selection</button>
        <button onClick={onConfirm} disabled={!selected.length} className="btn-success">
          <Check className={styles.arrowLeftIcon} /> Confirm
        </button>
      </div>
    </div>
  );
}
