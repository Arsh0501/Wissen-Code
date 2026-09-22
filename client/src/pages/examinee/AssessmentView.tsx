import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useAuth } from '../../context/AuthContext';
import { getAssessment, runCode, submitAssessment } from '../../services/api';
import type { Assessment, QuestionState, AssessmentQuestion } from '../../types';
import {
  Code2, Clock, ChevronLeft, ChevronRight, Flag,
  AlertTriangle, Maximize2, Minimize2, Play, Check,
  Menu, X
} from 'lucide-react';

const LANGUAGES = [
  { id: 71, name: 'Python', monacoLang: 'python' },
  { id: 62, name: 'Java', monacoLang: 'java' },
  { id: 54, name: 'C++', monacoLang: 'cpp' },
  { id: 63, name: 'JavaScript', monacoLang: 'javascript' },
];

export default function AssessmentView() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { candidateName } = useAuth();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[]>([]);
  const [questionStates, setQuestionStates] = useState<Map<number, QuestionState>>(new Map());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0); // seconds
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOutputTab, setActiveOutputTab] = useState<'output' | 'input'>('output');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverview, setShowOverview] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load assessment data
  useEffect(() => {
    if (!assessmentId) return;
    loadAssessment(parseInt(assessmentId));
  }, [assessmentId]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0 && assessment) {
      // Auto-submit when timer runs out
      if (timerRef.current) clearInterval(timerRef.current);
      handleSubmitTest();
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft > 0]);

  async function loadAssessment(id: number) {
    try {
      setLoading(true);
      const data = await getAssessment(id);
      setAssessment(data);
      setAssessmentQuestions(data.questions);
      setTimeLeft(data.timeLimitMinutes * 60);

      // Initialize question states
      const states = new Map<number, QuestionState>();
      data.questions.forEach((aq: AssessmentQuestion) => {
        const q = aq.question;
        const starterCode = q.starterCodes?.[0];
        const defaultLang = LANGUAGES[0];

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
        });
      });
      setQuestionStates(states);
    } catch (err) {
      console.error('Failed to load assessment:', err);
    } finally {
      setLoading(false);
    }
  }

  // Current question helpers
  const currentAQ = assessmentQuestions[currentQuestionIndex];
  const currentQuestion = currentAQ?.question;
  const currentState = currentQuestion ? questionStates.get(currentQuestion.id) : undefined;
  const sampleTestCases = currentQuestion?.testCases?.filter((tc) => tc.isSample) || [];

  // Stats
  const answered = Array.from(questionStates.values()).filter((s) => s.isAnswered).length;
  const flagged = Array.from(questionStates.values()).filter((s) => s.isFlagged).length;
  const unanswered = questionStates.size - answered;

  // Format time
  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min} min ${sec.toString().padStart(2, '0')} sec`;
  };

  // Update question state
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

  // Handle language change
  function handleLanguageChange(langId: number) {
    if (!currentQuestion) return;
    const lang = LANGUAGES.find((l) => l.id === langId);
    if (!lang) return;

    const starterCode = currentQuestion.starterCodes?.find((sc) => sc.languageId === langId);
    const currentCode = currentState?.code || '';

    // Only replace code if current code matches a starter code (user hasn't edited)
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

    try {
      const stdin = currentState.customInput || sampleTestCases[0]?.input || '';
      const result = await runCode({
        sourceCode: currentState.code,
        languageId: currentState.languageId,
        stdin,
      });

      let output = '';
      if (result.isError) {
        if (result.compileOutput) output = result.compileOutput;
        else if (result.stderr) output = result.stderr;
        else output = `${result.statusDescription}${result.message ? ': ' + result.message : ''}`;
      } else {
        output = result.stdout || '(No output)';
        if (result.executionTime) {
          output += `\n\n--- Execution Time: ${result.executionTime}s | Memory: ${result.memoryUsed ? (result.memoryUsed / 1024).toFixed(1) + 'MB' : 'N/A'} ---`;
        }
      }

      updateState(currentQuestion.id, {
        output,
        isError: result.isError,
      });
    } catch (err: any) {
      updateState(currentQuestion.id, {
        output: `Error: ${err.message || 'Failed to execute code'}`,
        isError: true,
      });
    } finally {
      setRunning(false);
    }
  }

  // Confirm answer (mark as answered)
  function handleConfirm() {
    if (!currentQuestion) return;
    updateState(currentQuestion.id, { isAnswered: true });

    // Move to next unanswered question
    const nextUnanswered = assessmentQuestions.findIndex(
      (aq, idx) => idx > currentQuestionIndex && !questionStates.get(aq.question.id)?.isAnswered
    );
    if (nextUnanswered !== -1) {
      setCurrentQuestionIndex(nextUnanswered);
    }
  }

  // Toggle flag
  function handleToggleFlag() {
    if (!currentQuestion) return;
    updateState(currentQuestion.id, { isFlagged: !currentState?.isFlagged });
  }

  // Submit entire test
  async function handleSubmitTest() {
    if (submitting) return;

    const hasAnswered = Array.from(questionStates.values()).some((s) => s.isAnswered || s.code.trim());
    if (!hasAnswered && timeLeft > 0) {
      if (!confirm('You have not answered any questions. Submit anyway?')) return;
    } else if (timeLeft > 0) {
      if (!confirm(`Submit test? You have ${formatTime(timeLeft)} remaining.`)) return;
    }

    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const answers = assessmentQuestions.map((aq) => {
        const state = questionStates.get(aq.question.id);
        return {
          questionId: aq.question.id,
          languageId: state?.languageId || 71,
          languageName: state?.languageName || 'Python',
          code: state?.code || '',
        };
      });

      await submitAssessment({
        assessmentId: parseInt(assessmentId!),
        candidateName,
        answers,
      });

      navigate(`/exam/${assessmentId}/result`);
    } catch (err) {
      console.error('Failed to submit:', err);
      alert('Failed to submit test. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-400">Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (!assessment || !currentQuestion || !currentState) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-400">Assessment not found.</p>
      </div>
    );
  }

  const isTimeLow = timeLeft < 300; // Less than 5 minutes

  return (
    <div className="h-screen flex flex-col bg-surface-950 overflow-hidden">
      {/* ─── TOP HEADER BAR ─── */}
      <header className="flex-none h-14 bg-surface-900 border-b border-surface-800 flex items-center px-4 z-30">
        {/* Left: Logo */}
        <div className="flex items-center gap-2.5 min-w-[180px]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Wissen Code</span>
        </div>

        {/* Center: Assessment title */}
        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-surface-200">{assessment.name}</span>
        </div>

        {/* Right: Timer + Submit */}
        <div className="flex items-center gap-4 min-w-[280px] justify-end">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
            isTimeLow ? 'bg-red-500/15 text-red-400 animate-pulse-dot' : 'bg-surface-800 text-surface-300'
          }`}>
            <Clock className="w-4 h-4" />
            <span className="text-sm font-mono font-medium">{formatTime(timeLeft)}</span>
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

      {/* ─── NAVIGATION BAR ─── */}
      <nav className="flex-none h-12 bg-surface-900/60 border-b border-surface-800 flex items-center px-4 gap-4 z-20">
        {/* Left: Section */}
        <div className="flex items-center gap-2 text-sm min-w-[160px]">
          <span className="text-surface-500">Section 1 of 1</span>
          <span className="text-surface-300 font-medium">Coding</span>
        </div>

        {/* Center: Question pills */}
        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
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
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={pillClass}
                >
                  {idx + 1}
                  {/* Status dot */}
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
                Math.min(assessmentQuestions.length - 1, currentQuestionIndex + 1)
              )
            }
            disabled={currentQuestionIndex === assessmentQuestions.length - 1}
            className="btn-ghost p-1.5 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Stats + Overview */}
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
              <span className="font-semibold text-surface-200">{unanswered}</span>
            </span>
          </div>
          <button
            onClick={() => setShowOverview(!showOverview)}
            className="btn-ghost p-1.5"
          >
            {showOverview ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* ─── MAIN CONTENT (SPLIT PANEL) ─── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── LEFT PANEL: Question ── */}
        <div className={`flex flex-col border-r border-surface-800 overflow-hidden transition-all duration-300 ${
          isFullscreen ? 'w-0 min-w-0' : 'w-[42%] min-w-[350px]'
        }`}>
          <div className="flex-1 overflow-y-auto p-6">
            {/* Question header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">
                Question {currentQuestionIndex + 1}
              </h2>
              <button className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                <AlertTriangle className="w-3.5 h-3.5" />
                Report a problem
              </button>
            </div>

            {/* Problem statement */}
            <div className="prose prose-invert prose-sm max-w-none mb-6">
              <div className="text-surface-200 leading-relaxed whitespace-pre-wrap">
                {currentQuestion.statement}
              </div>
            </div>

            {/* Sample test cases */}
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

          {/* Bottom: Flag + Navigation */}
          <div className="flex-none border-t border-surface-800 px-6 py-3 flex items-center justify-between bg-surface-900/50">
            <button
              onClick={handleToggleFlag}
              className={`btn-outline text-sm ${
                currentState.isFlagged
                  ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                  : ''
              }`}
            >
              <Flag className="w-4 h-4" />
              {currentState.isFlagged ? 'Flagged' : 'Flag'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
                className="btn-outline text-sm disabled:opacity-30"
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
                className="btn-outline text-sm disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Code Editor ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor header */}
          <div className="flex-none h-11 border-b border-surface-800 flex items-center justify-between px-4 bg-surface-900/50">
            <span className="text-sm font-medium text-surface-300">Code editor</span>
            <div className="flex items-center gap-3">
              <select
                value={currentState.languageId}
                onChange={(e) => handleLanguageChange(parseInt(e.target.value))}
                className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1 text-sm text-surface-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {LANGUAGES.map((lang) => (
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

          {/* Monaco Editor */}
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={currentState.monacoLang}
              value={currentState.code}
              onChange={(value) => {
                if (currentQuestion) {
                  updateState(currentQuestion.id, { code: value || '' });
                }
              }}
              theme="vs-dark"
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
                  activeOutputTab === 'input' ? 'tab-active' : 'tab-inactive'
                }`}
              >
                Enter Custom input
              </button>
              <button
                onClick={() => setActiveOutputTab('output')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeOutputTab === 'output' ? 'tab-active' : 'tab-inactive'
                }`}
              >
                Output
              </button>
            </div>

            {/* Output/Input area */}
            <div className="h-[140px] overflow-auto">
              {activeOutputTab === 'input' ? (
                <textarea
                  className="w-full h-full bg-surface-950 p-3 font-mono text-sm text-surface-200 resize-none focus:outline-none border-none"
                  placeholder="Enter custom input here (stdin)..."
                  value={currentState.customInput}
                  onChange={(e) =>
                    updateState(currentQuestion.id, { customInput: e.target.value })
                  }
                />
              ) : (
                <div className="output-panel h-full rounded-none border-0">
                  {running ? (
                    <div className="flex items-center gap-2 text-surface-400">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      Running...
                    </div>
                  ) : currentState.output ? (
                    <pre
                      className={
                        currentState.isError ? 'text-red-400' : 'text-emerald-300'
                      }
                    >
                      {currentState.output}
                    </pre>
                  ) : (
                    <span className="text-surface-600 italic">
                      Click "Run code" to see output here
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Bottom: Run + Confirm */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-800 bg-surface-900/50">
              <button
                onClick={handleRunCode}
                disabled={running}
                className="btn-outline"
              >
                <Play className="w-4 h-4" />
                {running ? 'Running...' : 'Run code'}
              </button>
              <button onClick={handleConfirm} className="btn-success">
                <Check className="w-4 h-4" />
                Confirm
              </button>
            </div>
          </div>
        </div>

        {/* ── QUESTION OVERVIEW PANEL ── */}
        {showOverview && (
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-surface-900 border-l border-surface-800 z-10 overflow-y-auto animate-slide-in">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Question Overview</h3>
              <div className="grid grid-cols-5 gap-2">
                {assessmentQuestions.map((aq, idx) => {
                  const state = questionStates.get(aq.question.id);
                  const isActive = idx === currentQuestionIndex;
                  const isAnswered = state?.isAnswered;
                  const isFlagged = state?.isFlagged;

                  let bg = 'bg-surface-800 text-surface-400';
                  if (isActive) bg = 'bg-primary-600 text-white';
                  else if (isAnswered) bg = 'bg-emerald-600/30 text-emerald-400 ring-1 ring-emerald-500/40';
                  else if (isFlagged) bg = 'bg-amber-600/30 text-amber-400 ring-1 ring-amber-500/40';

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
                  <span className="text-surface-400">Answered ({answered})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-amber-600/30 ring-1 ring-amber-500/40" />
                  <span className="text-surface-400">Flagged ({flagged})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-surface-800" />
                  <span className="text-surface-400">Unanswered ({unanswered})</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submitting overlay */}
      {submitting && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="card text-center max-w-sm">
            <div className="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Submitting Test</h3>
            <p className="text-surface-400 text-sm">
              Running your code against all test cases. This may take a moment...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
