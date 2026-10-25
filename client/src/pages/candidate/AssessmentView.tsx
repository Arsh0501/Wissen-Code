import BrandLogo from '../../components/landing/BrandLogo';
import AnswerInput from '../../components/questions/AnswerInput';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '../../components/CodeEditor';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ThemeToggle from '../../components/ThemeToggle';
import {
  getAssessment,
  runCode,
  runTests,
  startSession,
  getSessionStatus,
  saveAllDrafts,
  finishSession,
  recordTabSwitch,
  recordPaste,
  apiError,
} from '../../services/api';
import { useTabSwitchDetection } from '../../hooks/useTabSwitchDetection';
import {
  TabSwitchWarning,
  TabSwitchStatus,
} from '../../components/exam/TabSwitchWarning';
import type {
  Assessment,
  QuestionState,
  AssessmentQuestion,
  TestCaseVerdict,
} from '../../types';
import {
  Code2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Flag,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Play,
  Check,
  Menu,
  X,
  CheckCircle,
  XCircle,
  AlertOctagon,
  Timer,
  BookOpen,
  Zap,
  FileText,
  Shield,
  Target,
  Award,
  Lock,
  ArrowLeft,
} from 'lucide-react';

const LANGUAGES = [
  { id: 82, name: 'SQL (SQLite)', monacoLang: 'sql' },
  { id: 71, name: 'Python', monacoLang: 'python' },
  { id: 62, name: 'Java', monacoLang: 'java' },
  { id: 54, name: 'C++', monacoLang: 'cpp' },
  { id: 63, name: 'JavaScript', monacoLang: 'javascript' },
];

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

// Verdict rendering helpers

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
  if (verdict.passed)
    return <CheckCircle className="w-4 h-4 text-emerald-600" />;
  if (verdict.statusId === 5)
    return <Timer className="w-4 h-4 text-amber-600" />;
  if (verdict.statusId === 6)
    return <AlertOctagon className="w-4 h-4 text-red-600" />;
  if (verdict.statusId >= 7 && verdict.statusId <= 12)
    return <AlertOctagon className="w-4 h-4 text-red-600" />;
  return <XCircle className="w-4 h-4 text-red-600" />;
}

function VerdictCard({
  verdict,
  index,
}: {
  verdict: TestCaseVerdict;
  index: number;
}) {
  const color = getVerdictColor(verdict);
  const label = getVerdictLabel(verdict);
  const [expanded, setExpanded] = useState(!verdict.passed);

  const borderClass =
    color === 'emerald'
      ? 'border-emerald-500/30'
      : color === 'amber'
        ? 'border-amber-500/30'
        : 'border-red-500/30';
  const bgClass =
    color === 'emerald'
      ? 'bg-emerald-500/5'
      : color === 'amber'
        ? 'bg-amber-500/5'
        : 'bg-red-500/5';
  const labelClass =
    color === 'emerald'
      ? 'text-emerald-600'
      : color === 'amber'
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <div
      className={`border rounded-lg ${borderClass} ${bgClass} overflow-hidden`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <VerdictIcon verdict={verdict} />
          <span className="text-sm font-medium text-surface-200">
            Test Case {index + 1}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${labelClass} bg-white/5`}
          >
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {verdict.executionTime && (
            <span className="text-xs text-surface-500">
              {verdict.executionTime}s
            </span>
          )}
          <ChevronRight
            className={`w-3.5 h-3.5 text-surface-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-xs font-mono">
          {verdict.statusId === 6 &&
            (verdict.compileOutput || verdict.stderr) && (
              <div>
                <span className="text-red-600 font-sans text-xs font-semibold uppercase tracking-wider">
                  Compiler Output
                </span>
                <pre className="mt-1 p-2 rounded bg-red-500/10 text-red-700 whitespace-pre-wrap overflow-x-auto border border-red-500/20">
                  {verdict.compileOutput || verdict.stderr}
                </pre>
              </div>
            )}
          {verdict.statusId >= 7 &&
            verdict.statusId <= 12 &&
            verdict.stderr && (
              <div>
                <span className="text-red-600 font-sans text-xs font-semibold uppercase tracking-wider">
                  Error Output
                </span>
                <pre className="mt-1 p-2 rounded bg-red-500/10 text-red-700 whitespace-pre-wrap overflow-x-auto border border-red-500/20">
                  {verdict.stderr}
                </pre>
              </div>
            )}
          {verdict.statusId === 5 && (
            <div className="p-2 rounded bg-amber-500/10 text-amber-700 font-sans border border-amber-500/20">
              Your code exceeded the time limit. Optimize your solution and try
              again.
            </div>
          )}
          {(verdict.statusId === 3 || verdict.statusId === 4) &&
            !verdict.passed && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-surface-400 font-sans text-xs font-semibold uppercase tracking-wider">
                    Expected
                  </span>
                  <pre className="mt-1 p-2 rounded bg-surface-800 text-emerald-700 whitespace-pre-wrap overflow-x-auto border border-surface-700">
                    {verdict.expectedOutput}
                  </pre>
                </div>
                <div>
                  <span className="text-surface-400 font-sans text-xs font-semibold uppercase tracking-wider">
                    Actual
                  </span>
                  <pre className="mt-1 p-2 rounded bg-surface-800 text-red-700 whitespace-pre-wrap overflow-x-auto border border-surface-700">
                    {verdict.actualOutput || '(no output)'}
                  </pre>
                </div>
              </div>
            )}
          {verdict.passed && (
            <div className="flex items-center gap-2 text-emerald-600 font-sans">
              <CheckCircle className="w-3.5 h-3.5" />
              <span className="text-xs">Output matches expected</span>
            </div>
          )}
          {verdict.statusId === -1 && (
            <div>
              <span className="text-red-600 font-sans text-xs font-semibold uppercase tracking-wider">
                Error
              </span>
              <pre className="mt-1 p-2 rounded bg-red-500/10 text-red-700 whitespace-pre-wrap overflow-x-auto border border-red-500/20">
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

  // Phase: 'pre-test' | 'in-progress' | 'review' | 'submitted'
  const [phase, setPhase] = useState<
    | 'loading'
    | 'pre-test'
    | 'in-progress'
    | 'review'
    | 'submitted'
    | 'submission-error'
  >('loading');

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentQuestions, setAssessmentQuestions] = useState<
    AssessmentQuestion[]
  >([]);
  const [questionStates, setQuestionStates] = useState<
    Map<number, QuestionState>
  >(new Map());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOutputTab, setActiveOutputTab] = useState<'output' | 'input'>(
    'output',
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [unavailableKind, setUnavailableKind] = useState<
    'unavailable' | 'expired'
  >('unavailable');
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle');
  const [saveError, setSaveError] = useState('');
  const [submissionNotice, setSubmissionNotice] = useState('');
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [timeWarning, setTimeWarning] = useState('');
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchLimit, setTabSwitchLimit] = useState(3);
  const [autoSubmitReason, setAutoSubmitReason] = useState<'tab-switch' | null>(
    null,
  );
  const [tabWarning, setTabWarning] = useState<{
    count: number;
    awayMs: number;
  } | null>(null);

  // Session state
  const [sessionId, setSessionId] = useState<number | null>(null);
  const sessionIdRef = useRef<number | null>(null);

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const deadlineRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (!assessmentId || !candidateName) return;
    const key = `wissen-exam-draft:${assessmentId}:${candidateName}`;
    if (phase === 'submitted') {
      try {
        localStorage.removeItem(key);
      } catch {}
      return;
    }
    if (
      !sessionIdRef.current ||
      !['in-progress', 'review', 'submission-error'].includes(phase)
    )
      return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            sessionId: sessionIdRef.current,
            updatedAt: Date.now(),
            states: [...questionStates.values()],
          }),
        );
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [assessmentId, candidateName, questionStates, phase]);

  // Load assessment data (without starting timer)
  useEffect(() => {
    if (!assessmentId) return;
    loadAssessment(parseInt(assessmentId));
  }, [assessmentId]);

  // Derive remaining time from the deadline, including while reviewing answers.
  useEffect(() => {
    if ((phase !== 'in-progress' && phase !== 'review') || submitting) return;
    const tick = () => {
      const remaining = deadlineRef.current
        ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
        : 0;
      setTimeLeft(remaining);
      if (!remaining && !hasSubmittedRef.current && !isSubmittingRef.current)
        void handleAutoSubmit();
    };
    tick();
    const timer = setInterval(tick, 1000);
    timerRef.current = timer;
    return () => clearInterval(timer);
  }, [phase, submitting]);

  // One-off warnings as the deadline approaches
  useEffect(() => {
    if (phase !== 'in-progress' && phase !== 'review') return;
    const message =
      timeLeft === 300
        ? '5 minutes left — make sure your answers are confirmed.'
        : timeLeft === 60
          ? '1 minute left — your test will be submitted automatically.'
          : '';
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
    },
  );

  // Auto-save interval (every 12 seconds)
  useEffect(() => {
    if (
      (phase !== 'in-progress' && phase !== 'review') ||
      !sessionIdRef.current
    )
      return;

    autoSaveRef.current = setInterval(() => {
      doAutoSave();
    }, 12000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [phase, sessionId]);

  // Serialize saves and submit only after outstanding saves finish.
  useEffect(() => {
    if (phase !== 'in-progress' || !sessionIdRef.current) return;
    if (prevQuestionIndexRef.current !== currentQuestionIndex)
      void doAutoSave();
    prevQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  async function doAutoSave() {
    const sid = sessionIdRef.current;
    if (!sid || hasSubmittedRef.current || isSubmittingRef.current) return;
    const save = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        if (
          sid !== sessionIdRef.current ||
          hasSubmittedRef.current ||
          isSubmittingRef.current
        )
          return;
        setSaveState('saving');
        setSaveError('');
        const drafts = [...questionStatesRef.current.values()].map((state) => ({
          questionId: state.questionId,
          languageId: state.languageId,
          languageName: state.languageName,
          code: state.code,
          isFlagged: state.isFlagged,
          isAnswered: state.isAnswered,
        }));
        await saveAllDrafts(sid, drafts);
        setSaveState('saved');
      });
    saveQueueRef.current = save;
    try {
      await save;
    } catch (error) {
      setSaveState('failed');
      setSaveError(apiError(error, 'Your latest changes have not been saved.'));
    }
  }

  async function loadAssessment(id: number) {
    hasSubmittedRef.current = false;
    isSubmittingRef.current = false;
    sessionIdRef.current = null;
    deadlineRef.current = null;
    setCurrentQuestionIndex(0);
    setAlreadyCompleted(false);
    setStartError('');
    setSubmitError('');
    setLoadError('');
    setUnavailableKind('unavailable');
    setPhase('loading');
    try {
      const data = await getAssessment(id);
      setAssessment(data);
      setAssessmentQuestions(data.questions);

      // Initialize question states
      const states = new Map<number, QuestionState>();
      data.questions.forEach((aq: AssessmentQuestion) => {
        const q = aq.question;
        // Prefer the first allowed language (Python unless restricted) when it has a starter
        const allowed = allowedLanguagesFor(data);
        const starterCode =
          q.questionType === 'sql'
            ? q.starterCodes?.find((sc) => sc.languageId === 82)
            : (allowed
                .map((l) =>
                  q.starterCodes?.find((sc) => sc.languageId === l.id),
                )
                .find(Boolean) ?? q.starterCodes?.[0]);
        const defaultLang =
          q.questionType === 'sql'
            ? LANGUAGES.find((l) => l.id === 82)!
            : (allowed.find((l) => l.id !== 82) ?? allowed[0]);

        states.set(q.id, {
          questionId: q.id,
          code:
            q.questionType === 'mcq'
              ? '[]'
              : q.questionType === 'written'
                ? ''
                : q.questionType === 'project'
                  ? JSON.stringify(q.settings?.files ?? [])
                  : starterCode?.code ||
                    (q.questionType === 'sql'
                      ? '-- Write your query here\n'
                      : '# Write your solution here\n'),
          languageId:
            q.questionType === 'sql'
              ? 82
              : starterCode?.languageId || defaultLang.id,
          languageName: starterCode?.languageName || defaultLang.name,
          monacoLang:
            LANGUAGES.find(
              (l) => l.id === (starterCode?.languageId || defaultLang.id),
            )?.monacoLang || 'python',
          isAnswered: false,
          isFlagged: false,
          output: '',
          isError: false,
          customInput: '',
          runMode: 'none',
          testVerdicts: [],
        });
      });
      setQuestionStates(states);

      // Resume an existing session if there is one. This never creates a session,
      // so the timer only starts when the candidate clicks "Start Assessment".
      const status = await getSessionStatus(id);
      if (!status.exists) {
        setPhase('pre-test');
        return;
      }
      if (status.isFinished) {
        setAlreadyCompleted(true);
        setPhase('submitted');
        return;
      }
      setSessionId(status.sessionId);
      sessionIdRef.current = status.sessionId;

      if (status.remainingSeconds <= 0) {
        // Time ran out while the candidate was away — grade the saved drafts
        hasSubmittedRef.current = true;
        isSubmittingRef.current = true;
        await finishSession(status.sessionId);
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
            monacoLang:
              LANGUAGES.find((l) => l.id === draft.languageId)?.monacoLang ||
              existing.monacoLang,
            isFlagged: draft.isFlagged,
            isAnswered: draft.isAnswered,
          });
        }
      }
      try {
        const backup = JSON.parse(
          localStorage.getItem(`wissen-exam-draft:${id}:${candidateName}`) ||
            'null',
        );
        if (
          backup?.sessionId === status.sessionId &&
          Array.isArray(backup.states)
        ) {
          for (const saved of backup.states) {
            const server = status.drafts.find(
              (d) => d.questionId === saved.questionId,
            ) as
              | ((typeof status.drafts)[number] & { updatedAt?: string })
              | undefined;
            const state = updatedStates.get(saved.questionId);
            if (
              state &&
              typeof saved.code === 'string' &&
              (!server?.updatedAt ||
                backup.updatedAt > Date.parse(server.updatedAt)) &&
              saved.languageId === state.languageId
            )
              updatedStates.set(saved.questionId, {
                ...state,
                code: saved.code,
                isFlagged: !!saved.isFlagged,
                isAnswered: !!saved.isAnswered,
              });
          }
        }
      } catch {}
      setQuestionStates(updatedStates);
      setTabSwitchCount(status.tabSwitchCount ?? 0);
      if (status.tabSwitchLimit) setTabSwitchLimit(status.tabSwitchLimit);
      deadlineRef.current = Date.now() + status.remainingSeconds * 1000;
      setTimeLeft(status.remainingSeconds);
      setPhase('in-progress');
    } catch (err) {
      console.error('Failed to load assessment:', err);
      if (
        (err as any).response?.data?.availability === 'closed' ||
        /assessment has closed/i.test(apiError(err))
      )
        setUnavailableKind('expired');
      setLoadError(apiError(err, 'Failed to load assessment'));
      setPhase('pre-test');
    }
  }

  // Start assessment (called from pre-test screen)
  async function handleStartAssessment() {
    if (
      !assessment ||
      !assessmentId ||
      starting ||
      !assessment.questions.length
    )
      return;
    setStarting(true);
    setStartError('');
    try {
      const sessionData = await startSession(parseInt(assessmentId));
      if (assessment.questionsLocked && !sessionData.isFinished) {
        await loadAssessment(parseInt(assessmentId));
        return;
      }
      setSessionId(sessionData.sessionId);
      sessionIdRef.current = sessionData.sessionId;
      setTabSwitchCount(sessionData.tabSwitchCount ?? 0);
      if (sessionData.tabSwitchLimit)
        setTabSwitchLimit(sessionData.tabSwitchLimit);
      if (sessionData.isFinished) {
        setAlreadyCompleted(true);
        setPhase('submitted');
        return;
      }
      deadlineRef.current = Date.now() + sessionData.remainingSeconds * 1000;
      setTimeLeft(sessionData.remainingSeconds);
      setPhase('in-progress');
    } catch (err) {
      console.error('Failed to start session:', err);
      setStartError(
        apiError(err, 'Failed to start assessment. Please try again.'),
      );
    } finally {
      setStarting(false);
    }
  }

  // Current question helpers
  const currentAQ = assessmentQuestions[currentQuestionIndex];
  const currentQuestion = currentAQ?.question;
  // Read by the editor's paste listener, which is registered once on mount
  const currentQuestionIdRef = useRef<number | null>(null);
  currentQuestionIdRef.current = currentQuestion?.id ?? null;
  const currentState = currentQuestion
    ? questionStates.get(currentQuestion.id)
    : undefined;
  const sampleTestCases =
    currentQuestion?.testCases?.filter((tc) => tc.isSample) || [];

  // Stats
  const answered = Array.from(questionStates.values()).filter(
    (s) => s.isAnswered,
  ).length;
  const flagged = Array.from(questionStates.values()).filter(
    (s) => s.isFlagged,
  ).length;
  const unanswered = questionStates.size - answered;
  const totalMarks = assessmentQuestions.reduce(
    (acc, aq) => acc + (aq.marks ?? 0),
    0,
  );

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min} min ${sec.toString().padStart(2, '0')} sec`;
  };

  const updateState = useCallback(
    (qId: number, updates: Partial<QuestionState>) => {
      setQuestionStates((prev) => {
        const next = new Map(prev);
        const current = next.get(qId);
        if (current) {
          next.set(qId, { ...current, ...updates });
        }
        return next;
      });
    },
    [],
  );

  function handleLanguageChange(langId: number) {
    if (!currentQuestion) return;
    const lang = LANGUAGES.find((l) => l.id === langId);
    if (!lang) return;

    const starterCode = currentQuestion.starterCodes?.find(
      (sc) => sc.languageId === langId,
    );
    const currentCode = currentState?.code || '';
    const isDefault = currentQuestion.starterCodes?.some(
      (sc) => sc.code === currentCode,
    );

    updateState(currentQuestion.id, {
      languageId: langId,
      languageName: lang.name,
      monacoLang: lang.monacoLang,
      code: isDefault && starterCode ? starterCode.code : currentCode,
    });
  }

  // Run Code
  async function handleRunCode() {
    if (
      ['mcq', 'written', 'project'].includes(
        currentQuestion?.questionType ?? '',
      )
    )
      return;
    if (!currentQuestion || !currentState) return;
    setRunning(true);
    setActiveOutputTab('output');

    const hasCustomInput =
      activeOutputTab === 'input' && currentState.customInput.trim().length > 0;

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
          else
            output = `${result.statusDescription}${result.message ? ': ' + result.message : ''}`;
        } else {
          output = result.stdout || '(No output)';
          if (result.executionTime) {
            output += `\n\n--- Execution Time: ${result.executionTime}s | Memory: ${result.memoryUsed ? (result.memoryUsed / 1024).toFixed(1) + 'MB' : 'N/A'} ---`;
          }
        }

        updateState(currentQuestion.id, {
          output,
          isError: result.isError,
          runMode: 'custom',
          testVerdicts: [],
        });
      } catch (err: any) {
        updateState(currentQuestion.id, {
          output: `Error: ${err.message || 'Failed to execute code'}`,
          isError: true,
          runMode: 'custom',
          testVerdicts: [],
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
          output: '',
          isError: !result.allPassed,
          runMode: 'testcases',
          testVerdicts: result.verdicts,
        });
      } catch (err: any) {
        updateState(currentQuestion.id, {
          output: `Error: ${err.message || 'Failed to run test cases'}`,
          isError: true,
          runMode: 'testcases',
          testVerdicts: [],
        });
      }
    }

    setRunning(false);
  }

  function handleConfirm() {
    if (!currentQuestion) return;
    updateState(currentQuestion.id, { isAnswered: true });

    const nextUnanswered = assessmentQuestions.findIndex(
      (aq, idx) =>
        idx > currentQuestionIndex &&
        !questionStates.get(aq.question.id)?.isAnswered,
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
  async function submitAnswers(beforeFinish?: () => Promise<void>) {
    if (isSubmittingRef.current || hasSubmittedRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const sid = sessionIdRef.current;
      if (!sid)
        throw new Error(
          'The assessment session is unavailable. Reload to resume your saved work.',
        );
      await saveQueueRef.current.catch(() => {});
      const drafts = assessmentQuestions.map((aq) => {
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
      try {
        await saveAllDrafts(sid, drafts);
      } catch (error) {
        if (
          (error as any).response?.status !== 400 ||
          !/time is up|already finished/i.test(apiError(error))
        )
          throw error;
        setSubmissionNotice(
          /already finished/i.test(apiError(error))
            ? 'Your answers were already received. Checking submission status.'
            : 'The deadline passed. Only answers saved before the deadline could be evaluated.',
        );
      }
      if (beforeFinish) await beforeFinish();
      await finishSession(sid);
      hasSubmittedRef.current = true;
      setPhase('submitted');
    } catch (error) {
      hasSubmittedRef.current = false;
      setSubmitError(
        apiError(
          error,
          'Submission could not be confirmed. Your answers remain in this page; retry when connected.',
        ),
      );
      setPhase('submission-error');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }
  async function handleConfirmSubmit() {
    await submitAnswers();
  }
  async function handleAutoSubmit(beforeFinish?: () => Promise<void>) {
    await submitAnswers(beforeFinish);
  }

  // Render output panel
  const isConsolidatedCompileError =
    currentState?.runMode === 'testcases' &&
    currentState.testVerdicts.length > 0 &&
    currentState.testVerdicts.every((v) => v.statusId === 6);

  function renderOutputContent() {
    if (!currentState) return null;

    if (running) {
      return (
        <div className="flex items-center gap-2 text-surface-400 p-3">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          Running...
        </div>
      );
    }

    if (currentState.runMode === 'none') {
      return (
        <div className="p-3">
          <span className="text-surface-600 italic">
            Click "Run code" to see output here
          </span>
        </div>
      );
    }

    if (currentState.runMode === 'custom') {
      return (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-surface-500 bg-surface-800 px-2 py-0.5 rounded">
              Custom Input
            </span>
          </div>
          <pre
            className={
              currentState.isError
                ? 'text-red-600 text-sm font-mono'
                : 'text-emerald-700 text-sm font-mono'
            }
          >
            {currentState.output}
          </pre>
        </div>
      );
    }

    if (currentState.runMode === 'testcases') {
      if (currentState.testVerdicts.length === 0 && currentState.output) {
        return (
          <div className="p-3">
            <pre className="text-red-600 text-sm font-mono">
              {currentState.output}
            </pre>
          </div>
        );
      }

      if (isConsolidatedCompileError) {
        const firstVerdict = currentState.testVerdicts[0];
        return (
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-surface-500 bg-surface-800 px-2 py-0.5 rounded">
                Sample Test Cases
              </span>
              <span className="text-xs font-semibold text-red-600">
                0/{currentState.testVerdicts.length} passed
              </span>
            </div>
            <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-600">
                  Compilation Failed
                </span>
              </div>
              <pre className="text-xs font-mono p-2 rounded bg-red-500/10 text-red-700 whitespace-pre-wrap overflow-x-auto border border-red-500/20">
                {firstVerdict.compileOutput || firstVerdict.stderr}
              </pre>
            </div>
          </div>
        );
      }

      const passedCount = currentState.testVerdicts.filter(
        (v) => v.passed,
      ).length;
      const total = currentState.testVerdicts.length;
      const allPassed = passedCount === total;

      return (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-surface-500 bg-surface-800 px-2 py-0.5 rounded">
              Sample Test Cases
            </span>
            <span
              className={`text-xs font-semibold ${allPassed ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {passedCount}/{total} passed
            </span>
          </div>
          <div className="space-y-1.5">
            {currentState.testVerdicts.map((verdict, idx) => (
              <VerdictCard key={idx} verdict={verdict} index={idx} />
            ))}
          </div>
        </div>
      );
    }

    return null;
  }

  const availableLangs = assessment
    ? currentQuestion?.questionType === 'sql'
      ? LANGUAGES.filter((l) => l.id === 82)
      : allowedLanguagesFor(assessment).filter((l) => l.id !== 82)
    : LANGUAGES;

  // RENDER: LOADING
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-400">Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (loadError || !assessment) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <Lock className="w-12 h-12 text-surface-600 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">
            {unavailableKind === 'expired'
              ? 'Assessment expired'
              : 'This assessment is unavailable'}
          </h2>
          <p className="text-sm text-surface-400 mb-6">
            {loadError || 'Assessment not found.'}
          </p>
          {unavailableKind !== 'expired' && (
            <button
              className="btn-primary mb-3"
              onClick={() => loadAssessment(Number(assessmentId))}
            >
              Retry loading assessment
            </button>
          )}
          <button onClick={() => navigate('/')} className="btn-outline">
            <ArrowLeft className="w-4 h-4" /> Back to my assessments
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'submission-error')
    return (
      <main className="min-h-screen bg-surface-950 flex items-center justify-center p-5">
        <section className="card max-w-xl space-y-4">
          <h1 className="text-xl font-semibold">Submission not confirmed</h1>
          <p role="alert" className="text-red-600">
            {submitError}
          </p>
          <p className="text-sm text-surface-400">
            Keep this page open so your answers remain available. Retry the
            submission when your connection returns.
          </p>
          <button
            className="btn-primary"
            disabled={submitting}
            onClick={() => submitAnswers()}
          >
            {submitting ? 'Submitting…' : 'Retry submission'}
          </button>
        </section>
      </main>
    );
  if (!assessmentQuestions.length && phase !== 'submitted')
    return (
      <main className="min-h-screen bg-surface-950 flex items-center justify-center p-5">
        <section className="card max-w-xl space-y-4">
          <h1 className="text-xl font-semibold">No questions available</h1>
          <p className="text-surface-400">
            This assessment has no questions yet. Contact the organizer or check
            back later.
          </p>
          <button className="btn-outline" onClick={() => navigate('/')}>
            Back to my assessments
          </button>
        </section>
      </main>
    );

  // RENDER: PRE-TEST SCREEN
  if (phase === 'pre-test' && assessment) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary-400/5 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-xl animate-fade-in">
          <div className="card">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/30">
                <Code2 className="w-6 h-6 text-on-accent" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {assessment.name}
                </h1>
                <p className="text-sm text-surface-400">Coding Assessment</p>
              </div>
            </div>
            {assessment.description && (
              <p className="text-sm text-surface-300 -mt-2 mb-6">
                {assessment.description}
              </p>
            )}

            {/* Assessment details */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-surface-800 rounded-lg p-4 flex items-center gap-3">
                <Award className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="text-xs text-surface-500 uppercase tracking-wider">
                    Total marks
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {totalMarks} marks
                  </p>
                </div>
              </div>
              <div className="bg-surface-800 rounded-lg p-4 flex items-center gap-3">
                <Target className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="text-xs text-surface-500 uppercase tracking-wider">
                    To pass
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {assessment.passingScore}% of marks
                  </p>
                </div>
              </div>
              <div className="bg-surface-800 rounded-lg p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="text-xs text-surface-500 uppercase tracking-wider">
                    Duration
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {assessment.timeLimitMinutes} minutes
                  </p>
                </div>
              </div>
              <div className="bg-surface-800 rounded-lg p-4 flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="text-xs text-surface-500 uppercase tracking-wider">
                    Questions
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {assessmentQuestions.length} questions
                  </p>
                </div>
              </div>
            </div>

            {/* Languages */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                Allowed Languages
              </p>
              <div className="flex flex-wrap gap-2">
                {availableLangs.map((lang) => (
                  <span
                    key={lang.id}
                    className="badge bg-primary-500/15 text-primary-700 ring-1 ring-primary-500/25"
                  >
                    {lang.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-surface-800/50 rounded-lg p-4 mb-6 border border-surface-700">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-semibold text-white">
                  Instructions
                </h3>
              </div>
              {assessment.instructions && (
                <div className="text-sm text-surface-300 space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-white mb-3">
                  <ReactMarkdown>{assessment.instructions}</ReactMarkdown>
                </div>
              )}
              <ul className="space-y-1.5 text-sm text-surface-300 pl-5 list-disc">
                <li>
                  The timer starts once you click "Start Assessment" and cannot
                  be paused.
                </li>
                <li className="text-amber-700">
                  Stay on this tab. Leaving it (switching tabs, minimising, or
                  opening another app) is recorded. You get{' '}
                  <span className="font-semibold">
                    {tabSwitchLimit - 1} warnings
                  </span>
                  . Leaving {tabSwitchLimit} times submits your test
                  automatically. Pasting code into the editor is also recorded.
                </li>
                <li className="text-amber-700">
                  Final grading runs against hidden test cases, not just the
                  samples shown.
                </li>
              </ul>
            </div>

            {startError && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700"
              >
                {startError}
              </div>
            )}

            {/* Start button */}
            <button
              disabled={starting}
              onClick={handleStartAssessment}
              className="btn-primary w-full py-3.5 text-base font-semibold shadow-lg shadow-primary-600/30"
            >
              <Zap className="w-5 h-5" />
              {starting ? 'Starting assessment…' : 'Start Assessment'}
            </button>

            <p className="text-center text-surface-600 text-xs mt-4">
              Welcome, <span className="text-surface-400">{candidateName}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: REVIEW SCREEN
  if (phase === 'review' && assessment) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-amber-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-lg animate-fade-in">
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Review & Submit
                </h2>
                <p className="text-sm text-surface-400">{assessment.name}</p>
              </div>
            </div>

            {/* Time remaining */}
            <div className="bg-surface-800 rounded-lg p-3 mb-6 flex items-center justify-between">
              <span className="text-sm text-surface-400">Time remaining</span>
              <span
                className={`text-sm font-mono font-semibold ${timeLeft < 300 ? 'text-red-600' : 'text-surface-200'}`}
              >
                {formatTime(timeLeft)}
              </span>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {answered}
                </p>
                <p className="text-xs text-emerald-700/70 mt-1">Answered</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{flagged}</p>
                <p className="text-xs text-amber-700/70 mt-1">Flagged</p>
              </div>
              <div className="bg-surface-800 border border-surface-700 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-surface-300">
                  {unanswered}
                </p>
                <p className="text-xs text-surface-500 mt-1">Unanswered</p>
              </div>
            </div>

            {/* Per-question status */}
            <div className="space-y-2 mb-6 max-h-[200px] overflow-y-auto">
              {assessmentQuestions.map((aq, idx) => {
                const state = questionStates.get(aq.question.id);
                const isAnswered = state?.isAnswered;
                const isFlagged = state?.isFlagged;
                return (
                  <div
                    key={aq.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-300">
                        Q{idx + 1}
                      </span>
                      <span className="text-sm text-surface-400 truncate max-w-[200px]">
                        {aq.question.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isFlagged && (
                        <Flag className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      {isAnswered ? (
                        <span className="badge bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/25">
                          Answered
                        </span>
                      ) : (
                        <span className="badge bg-surface-700 text-surface-400">
                          Unanswered
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Warning */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6">
              <p className="text-sm text-amber-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Are you sure you want to submit? You cannot make changes after
                submission.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setPhase('in-progress')}
                className="btn-outline flex-1"
                disabled={submitting}
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-accent border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirm Submit
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        {tabWarning && !submitting && (
          <TabSwitchWarning
            count={tabWarning.count}
            limit={tabSwitchLimit}
            awayMs={tabWarning.awayMs}
            onDismiss={() => setTabWarning(null)}
          />
        )}
      </div>
    );
  }

  // RENDER: SUBMITTED SCREEN
  if (phase === 'submitted') {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md animate-fade-in">
          <div className="card text-center">
            {autoSubmitReason === 'tab-switch' ? (
              <>
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertOctagon className="w-11 h-11 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Test Auto-Submitted
                </h2>
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-700 text-left">
                  You left the test window {tabSwitchLimit} times. Your saved
                  answers were submitted automatically, and the reviewer can see
                  every tab switch.
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  {alreadyCompleted
                    ? 'Assessment completed'
                    : 'Assessment Submitted'}
                </h2>
                <p className="text-surface-400 mb-1">
                  Your assessment submission has been confirmed.
                </p>
              </>
            )}
            <p className="text-surface-500 text-sm mb-8">
              Thank you,{' '}
              <span className="text-surface-300 font-medium">
                {candidateName}
              </span>
              . Your responses are being evaluated.
            </p>

            {submissionNotice && (
              <p className="text-sm text-amber-700 mb-4">{submissionNotice}</p>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate(`/exam/${assessmentId}/result`)}
                className="btn-primary w-full py-3"
              >
                View Results
              </button>
              <button
                onClick={() => navigate('/')}
                className="btn-outline w-full"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: IN-PROGRESS (Main Assessment UI)
  if (!assessment || !currentQuestion || !currentState) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-400">Assessment not found.</p>
      </div>
    );
  }

  const isTimeLow = timeLeft < 300;
  const timeFraction =
    assessment.timeLimitMinutes > 0
      ? timeLeft / (assessment.timeLimitMinutes * 60)
      : 0;

  return (
    <div className="exam-shell h-screen flex flex-col bg-surface-950 overflow-hidden">
      {/* TOP HEADER BAR */}
      <header className="exam-header flex-none h-14 bg-surface-900 border-b border-surface-800 flex items-center px-4 z-30">
        <div className="exam-brand flex items-center gap-2.5 min-w-[180px]">
          <BrandLogo />
        </div>

        <div className="exam-title flex-1 text-center">
          <span className="text-sm font-semibold text-surface-200">
            {assessment.name}
          </span>
        </div>

        <div className="exam-actions flex items-center gap-3 min-w-[280px] justify-end">
          <ThemeToggle />
          <TabSwitchStatus count={tabSwitchCount} limit={tabSwitchLimit} />
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              isTimeLow
                ? 'bg-red-500/15 text-red-600 animate-pulse-dot'
                : 'bg-surface-800 text-surface-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span
              role="timer"
              aria-label="Assessment time remaining"
              className="text-sm font-mono font-medium"
            >
              {formatTime(timeLeft)}
            </span>
          </div>
          <button
            onClick={handleSubmitTest}
            disabled={submitting}
            className="btn-primary px-5 py-2"
          >
            {submitting ? 'Submitting...' : 'Submit Test'}
          </button>
        </div>
      </header>
      <div
        className="px-5 py-2 border-b border-surface-800 text-xs flex items-center gap-3"
        role={saveState === 'failed' ? 'alert' : 'status'}
      >
        <span>
          {saveState === 'saving'
            ? 'Saving changes…'
            : saveState === 'saved'
              ? 'Changes saved'
              : saveState === 'failed'
                ? saveError
                : 'Changes save automatically'}
        </span>
        {saveState === 'failed' && (
          <button className="btn-outline text-xs" onClick={doAutoSave}>
            Retry save
          </button>
        )}
      </div>

      {/* Time remaining */}
      <div
        className="flex-none h-1 bg-surface-800"
        role="progressbar"
        aria-label="Time remaining"
        aria-valuemin={0}
        aria-valuemax={assessment.timeLimitMinutes * 60}
        aria-valuenow={timeLeft}
      >
        <div
          className={`h-full transition-all duration-1000 ease-linear ${isTimeLow ? 'bg-red-500' : timeFraction < 0.25 ? 'bg-amber-500' : 'bg-primary-500'}`}
          style={{ width: `${Math.max(0, Math.min(1, timeFraction)) * 100}%` }}
        />
      </div>
      {timeWarning && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/90 text-on-accent text-sm font-medium shadow-xl animate-fade-in"
        >
          <Clock className="w-4 h-4" /> {timeWarning}
          <button
            onClick={() => setTimeWarning('')}
            className="ml-2 opacity-80 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* NAVIGATION BAR */}
      <nav className="exam-nav flex-none h-12 bg-surface-900/60 border-b border-surface-800 flex items-center px-4 gap-4 z-20">
        <div className="flex items-center gap-2 text-sm min-w-[160px]">
          <span className="text-surface-500">Section 1 of 1</span>
          <span className="text-surface-300 font-medium">Coding</span>
        </div>

        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            onClick={() =>
              setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))
            }
            disabled={currentQuestionIndex === 0}
            className="btn-ghost p-1.5 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex gap-1.5">
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
                  aria-label={`Go to question ${idx + 1}`}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={pillClass}
                >
                  {idx + 1}
                  {(isAnswered || isFlagged) && (
                    <span
                      className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${
                        isAnswered ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() =>
              setCurrentQuestionIndex(
                Math.min(
                  assessmentQuestions.length - 1,
                  currentQuestionIndex + 1,
                ),
              )
            }
            disabled={currentQuestionIndex === assessmentQuestions.length - 1}
            className="btn-ghost p-1.5 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-4 min-w-[240px] justify-end">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-surface-400">Answered</span>
              <span className="font-semibold text-surface-200">{answered}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-surface-400">Flag</span>
              <span className="font-semibold text-surface-200">{flagged}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-surface-500" />
              <span className="text-surface-400">Unanswered</span>
              <span className="font-semibold text-surface-200">
                {unanswered}
              </span>
            </span>
          </div>
          <button
            onClick={() => setShowOverview(!showOverview)}
            className="btn-ghost p-1.5"
          >
            {showOverview ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>
        </div>
      </nav>

      {/* MAIN CONTENT (SPLIT PANEL) */}
      <div className="exam-workspace flex-1 flex overflow-hidden relative">
        {/* LEFT PANEL: Question */}
        <div
          className={`exam-question flex flex-col border-r border-surface-800 overflow-hidden transition-all duration-300 ${
            isFullscreen ? 'w-0 min-w-0' : 'w-[42%] min-w-[350px]'
          }`}
        >
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-surface-500 uppercase tracking-wider">
                  Question {currentQuestionIndex + 1} of{' '}
                  {assessmentQuestions.length}
                </p>
                <h2 className="text-lg font-bold text-white">
                  {currentQuestion.title}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`badge-${currentQuestion.difficulty}`}>
                    {currentQuestion.difficulty}
                  </span>
                  <span className="text-xs text-surface-400">
                    {currentAQ.marks} marks
                  </span>
                </div>
              </div>
              <button className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 transition-colors">
                <AlertTriangle className="w-3.5 h-3.5" />
                Report a problem
              </button>
            </div>

            <div className="prose prose-invert prose-sm max-w-none mb-6">
              <div className="text-surface-200 leading-relaxed space-y-3 [&_code]:text-primary-700 [&_code]:bg-surface-800 [&_code]:px-1 [&_code]:rounded [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-white">
                <ReactMarkdown>{currentQuestion.statement}</ReactMarkdown>
              </div>
            </div>

            {currentQuestion.settings?.sqlSchema && (
              <section className="sample-box mb-4">
                <h3 className="font-semibold">Database schema</h3>
                <pre className="whitespace-pre-wrap mt-2">
                  {currentQuestion.settings.sqlSchema}
                </pre>
              </section>
            )}
            {currentQuestion.settings?.rubric && (
              <section className="sample-box mb-4">
                <h3 className="font-semibold">Scoring rubric</h3>
                <p className="whitespace-pre-wrap mt-2">
                  {currentQuestion.settings.rubric}
                </p>
              </section>
            )}
            {sampleTestCases.map((tc, idx) => (
              <div key={tc.id} className="mb-4">
                <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                  Sample Input {sampleTestCases.length > 1 ? idx + 1 : ''}
                </h4>
                <div className="sample-box mb-3">{tc.input || '(empty)'}</div>
                <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                  Sample Output {sampleTestCases.length > 1 ? idx + 1 : ''}
                </h4>
                <div className="sample-box">{tc.expectedOutput}</div>
              </div>
            ))}
          </div>

          <div className="flex-none border-t border-surface-800 px-6 py-3 flex items-center justify-between bg-surface-900/50">
            <button
              onClick={handleToggleFlag}
              className={`btn-outline text-sm ${
                currentState.isFlagged
                  ? 'border-amber-500/50 text-amber-600 bg-amber-500/10'
                  : ''
              }`}
            >
              <Flag className="w-4 h-4" />
              {currentState.isFlagged ? 'Flagged' : 'Flag'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))
                }
                disabled={currentQuestionIndex === 0}
                className="btn-outline text-sm disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentQuestionIndex(
                    Math.min(
                      assessmentQuestions.length - 1,
                      currentQuestionIndex + 1,
                    ),
                  )
                }
                disabled={
                  currentQuestionIndex === assessmentQuestions.length - 1
                }
                className="btn-outline text-sm disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Code Editor */}
        {currentQuestion &&
        currentState &&
        ['mcq', 'written', 'project'].includes(
          currentQuestion.questionType ?? '',
        ) ? (
          <section className="exam-editor flex-1 min-w-0 overflow-auto">
            <AnswerInput
              key={currentQuestion.id}
              question={currentQuestion}
              value={currentState.code}
              onChange={(code) =>
                updateState(currentQuestion.id, {
                  code,
                  isAnswered:
                    currentQuestion.questionType === 'mcq'
                      ? code !== '[]'
                      : !!code.trim(),
                })
              }
            />
          </section>
        ) : (
          <>
            <div className="exam-editor flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="flex-none h-11 border-b border-surface-800 flex items-center justify-between px-4 bg-surface-900/50">
                <span className="text-sm font-medium text-surface-300">
                  Code editor
                </span>
                <div className="flex items-center gap-3">
                  <select
                    value={currentState.languageId}
                    onChange={(e) =>
                      handleLanguageChange(parseInt(e.target.value))
                    }
                    className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1 text-sm text-surface-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {availableLangs.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="btn-ghost p-1.5"
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <Editor
                  loading={
                    <p role="status" className="p-5">
                      Loading code editor…
                    </p>
                  }
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
                      const text =
                        editor.getModel()?.getValueInRange(range) ?? '';
                      const sid = sessionIdRef.current;
                      const questionId = currentQuestionIdRef.current;
                      if (
                        !text ||
                        !sid ||
                        !questionId ||
                        hasSubmittedRef.current
                      )
                        return;
                      recordPaste(sid, {
                        questionId,
                        charCount: text.length,
                        lineCount: text.split('\n').length,
                      }).catch((err) =>
                        console.error('Failed to record paste:', err),
                      );
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
              <div className="flex-none border-t border-surface-800">
                <div className="flex items-center gap-0 px-4 bg-surface-900/50">
                  <button
                    onClick={() => setActiveOutputTab('input')}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeOutputTab === 'input'
                        ? 'tab-active'
                        : 'tab-inactive'
                    }`}
                  >
                    Enter Custom input
                  </button>
                  <button
                    onClick={() => setActiveOutputTab('output')}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeOutputTab === 'output'
                        ? 'tab-active'
                        : 'tab-inactive'
                    }`}
                  >
                    Output
                  </button>
                </div>

                <div className="h-[200px] overflow-auto">
                  {activeOutputTab === 'input' ? (
                    <textarea
                      className="w-full h-full bg-surface-950 p-3 font-mono text-sm text-surface-200 resize-none focus:outline-none border-none"
                      placeholder={
                        "Enter custom input here (stdin)...\n\nWhen you click 'Run code' with this tab active and input provided, your code will run against this custom input instead of the sample test cases."
                      }
                      value={currentState.customInput}
                      onChange={(e) =>
                        updateState(currentQuestion.id, {
                          customInput: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <div className="output-panel h-full rounded-none border-0">
                      {renderOutputContent()}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-4 py-3 border-t border-surface-800 bg-surface-900/50">
                  <button
                    onClick={handleRunCode}
                    disabled={running}
                    className="btn-outline"
                  >
                    <Play className="w-4 h-4" />
                    {running
                      ? 'Running...'
                      : activeOutputTab === 'input' &&
                          currentState.customInput.trim()
                        ? 'Run with Custom Input'
                        : 'Run code'}
                  </button>
                  <button onClick={handleConfirm} className="btn-success">
                    <Check className="w-4 h-4" />
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        {/* QUESTION OVERVIEW PANEL */}
        {showOverview && (
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-surface-900 border-l border-surface-800 z-10 overflow-y-auto animate-slide-in">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white mb-4">
                Question Overview
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {assessmentQuestions.map((aq, idx) => {
                  const state = questionStates.get(aq.question.id);
                  const isActive = idx === currentQuestionIndex;
                  const isAnswered = state?.isAnswered;
                  const isFlagged = state?.isFlagged;

                  let bg = 'bg-surface-800 text-surface-400';
                  if (isActive) bg = 'bg-primary-600 text-on-accent';
                  else if (isAnswered)
                    bg =
                      'bg-emerald-600/30 text-emerald-600 ring-1 ring-emerald-500/40';
                  else if (isFlagged)
                    bg =
                      'bg-amber-600/30 text-amber-600 ring-1 ring-amber-500/40';

                  return (
                    <button
                      key={aq.id}
                      onClick={() => {
                        setCurrentQuestionIndex(idx);
                        setShowOverview(false);
                      }}
                      className={`w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all hover:scale-105 ${bg}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-emerald-600/30 ring-1 ring-emerald-500/40" />
                  <span className="text-surface-400">
                    Answered ({answered})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-amber-600/30 ring-1 ring-amber-500/40" />
                  <span className="text-surface-400">Flagged ({flagged})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-surface-800" />
                  <span className="text-surface-400">
                    Unanswered ({unanswered})
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {tabWarning && !submitting && (
        <TabSwitchWarning
          count={tabWarning.count}
          limit={tabSwitchLimit}
          awayMs={tabWarning.awayMs}
          onDismiss={() => setTabWarning(null)}
        />
      )}

      {/* Submitting overlay */}
      {submitting && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="card text-center max-w-sm">
            <div className="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">
              Submitting Test
            </h3>
            <p className="text-surface-400 text-sm">
              Running your code against all test cases. This may take a
              moment...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
