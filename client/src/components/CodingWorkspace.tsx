import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../context/ThemeContext';
import { runCode, type RunCodeResponse } from '../services/api';
import {
  fetchJudgeLanguages,
  getMonacoLanguage,
  getDefaultComment,
  FALLBACK_LANGUAGES,
  type AppLanguage,
} from '../services/languages';
import LanguageLogo from './LanguageLogo';
import type { Question } from '../types';
import {
  Play, Check, ChevronDown, Maximize2, Minimize2, Terminal, HelpCircle,
  Clock, Cpu, AlertTriangle, CheckCircle2, BookmarkCheck,
} from 'lucide-react';

export interface CodingWorkspaceProps {
  mode: 'assessment' | 'interview';
  question: Question | null;
  initialCode?: string;
  initialLanguageId?: number;
  onCodeChange?: (code: string) => void;
  onSubmitSnapshot?: (code: string, languageId: number, languageName: string) => Promise<void>;
  onRunExecuted?: (result: RunCodeResponse, languageId: number) => void;
  readOnly?: boolean;
}

export default function CodingWorkspace({
  mode = 'interview',
  question,
  initialCode,
  initialLanguageId,
  onCodeChange,
  onSubmitSnapshot,
  onRunExecuted,
  readOnly = false,
}: CodingWorkspaceProps) {
  const { theme } = useTheme();

  // Languages
  const [languages, setLanguages] = useState<AppLanguage[]>(FALLBACK_LANGUAGES);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(FALLBACK_LANGUAGES[0]);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);

  // Editor code
  const [code, setCode] = useState<string>('');
  const lastEmittedCodeRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Console / Execution
  const [customInput, setCustomInput] = useState<string>('');
  const [activeConsoleTab, setActiveConsoleTab] = useState<'output' | 'input'>('output');
  const [running, setRunning] = useState<boolean>(false);
  const [submittingSnapshot, setSubmittingSnapshot] = useState<boolean>(false);
  const [lastSnapshotTime, setLastSnapshotTime] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunCodeResponse | null>(null);

  // Panel Split & Resizing
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [leftPanelPercent, setLeftPanelPercent] = useState<number>(42);
  const [isResizingH, setIsResizingH] = useState(false);
  const [outputHeight, setOutputHeight] = useState<number>(200);
  const [isResizingV, setIsResizingV] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(200);

  // Load active Judge0 languages
  useEffect(() => {
    fetchJudgeLanguages().then((langs) => {
      setLanguages(langs);
      if (initialLanguageId) {
        const found = langs.find((l) => l.id === initialLanguageId);
        if (found) setSelectedLanguage(found);
      }
    });
  }, [initialLanguageId]);

  // Sync initial code & sample inputs when question changes
  useEffect(() => {
    if (!question) return;

    // Pick starter code or default comment
    if (initialCode !== undefined && initialCode !== '') {
      setCode(initialCode);
      lastEmittedCodeRef.current = initialCode;
    } else {
      const match = question.starterCodes?.find((sc) => sc.languageId === selectedLanguage.id);
      const defaultText = match?.code || getDefaultComment(selectedLanguage.monacoLang);
      setCode(defaultText);
      lastEmittedCodeRef.current = defaultText;
    }

    // Pre-populate custom input with first sample test case
    const firstSample = question.testCases?.find((tc) => tc.isSample);
    if (firstSample && firstSample.input) {
      setCustomInput(firstSample.input);
    } else {
      setCustomInput('');
    }

    setRunResult(null);
  }, [question?.id, selectedLanguage.id]);

  // Click outside language dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced code change emission
  const handleEditorChange = (newVal: string | undefined) => {
    const val = newVal ?? '';
    setCode(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (val !== lastEmittedCodeRef.current) {
        lastEmittedCodeRef.current = val;
        onCodeChange?.(val);
      }
    }, 600);
  };

  // Run Code via /api/judge/run
  const handleRunCode = async () => {
    if (running || !code.trim()) return;
    setRunning(true);
    setActiveConsoleTab('output');

    try {
      const res = await runCode({
        sourceCode: code,
        languageId: selectedLanguage.id,
        stdin: customInput,
      });

      setRunResult(res);
      onRunExecuted?.(res, selectedLanguage.id);
    } catch (err: any) {
      setRunResult({
        stdout: '',
        stderr: err?.message || 'Execution failed',
        compileOutput: '',
        message: '',
        statusId: -1,
        statusDescription: 'Execution Error',
        executionTime: null,
        memoryUsed: null,
        isError: true,
      });
    } finally {
      setRunning(false);
    }
  };

  // Submit Snapshot (interview mode — no grading)
  const handleSubmitSnapshot = async () => {
    if (submittingSnapshot || !onSubmitSnapshot) return;
    try {
      setSubmittingSnapshot(true);
      await onSubmitSnapshot(code, selectedLanguage.id, selectedLanguage.name);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSnapshotTime(timeStr);
    } catch (err) {
      console.error('Failed to submit snapshot:', err);
    } finally {
      setSubmittingSnapshot(false);
    }
  };

  // Switch Language
  const handleLanguageChange = (lang: AppLanguage) => {
    setSelectedLanguage(lang);
    setIsLangMenuOpen(false);

    // If starter code exists for this language, load it if current code is untouched
    const match = question?.starterCodes?.find((sc) => sc.languageId === lang.id);
    if (match?.code) {
      setCode(match.code);
      handleEditorChange(match.code);
    }
  };

  // Horizontal Resize (Question vs Editor)
  const startResizingH = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingH(true);
  }, []);

  const stopResizingH = useCallback(() => {
    setIsResizingH(false);
  }, []);

  const resizeH = useCallback(
    (e: MouseEvent) => {
      if (!isResizingH || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const mouseX = e.clientX - rect.left;
      const minPx = 280;
      const maxPx = rect.width - 320;
      const clampedPx = Math.max(minPx, Math.min(mouseX, maxPx));
      setLeftPanelPercent((clampedPx / rect.width) * 100);
    },
    [isResizingH]
  );

  useEffect(() => {
    if (isResizingH) {
      window.addEventListener('mousemove', resizeH);
      window.addEventListener('mouseup', stopResizingH);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resizeH);
      window.removeEventListener('mouseup', stopResizingH);
    };
  }, [isResizingH, resizeH, stopResizingH]);

  // Vertical Resize (Editor vs Console)
  const startResizingV = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartYRef.current = e.clientY;
      startHeightRef.current = outputHeight;
      setIsResizingV(true);
    },
    [outputHeight]
  );

  const stopResizingV = useCallback(() => {
    setIsResizingV(false);
  }, []);

  const resizeV = useCallback(
    (e: MouseEvent) => {
      if (!isResizingV || !rightPanelRef.current) return;
      const deltaY = dragStartYRef.current - e.clientY;
      const panelHeight = rightPanelRef.current.getBoundingClientRect().height;
      const maxHeight = Math.max(120, panelHeight - 160);
      const minHeight = 60;
      setOutputHeight(Math.max(minHeight, Math.min(maxHeight, startHeightRef.current + deltaY)));
    },
    [isResizingV]
  );

  useEffect(() => {
    if (isResizingV) {
      window.addEventListener('mousemove', resizeV);
      window.addEventListener('mouseup', stopResizingV);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resizeV);
      window.removeEventListener('mouseup', stopResizingV);
    };
  }, [isResizingV, resizeV, stopResizingV]);

  const sampleTestCases = question?.testCases?.filter((tc) => tc.isSample) || [];

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden relative bg-surface-950">
      {/* ─── LEFT PANEL: Question Statement & Reference Samples ─── */}
      <div
        style={{ width: isFullscreen ? '0px' : `${leftPanelPercent}%` }}
        className={`flex flex-col overflow-hidden bg-surface-900/40 border-r border-surface-800 ${
          isResizingH ? '' : 'transition-[width] duration-200 ease-out'
        } ${isFullscreen ? 'w-0 min-w-0 hidden' : 'min-w-[280px]'}`}
      >
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {question ? (
            <>
              {/* Question Header */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`badge-${question.difficulty || 'medium'}`}>
                    {question.difficulty || 'Medium'}
                  </span>
                  {mode === 'interview' && (
                    <span className="text-[11px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 rounded-full">
                      Interview Question
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">{question.title}</h2>
              </div>

              {/* Statement */}
              <div className="prose prose-invert prose-sm max-w-none text-surface-200 leading-relaxed space-y-3 [&_code]:text-primary-400 [&_code]:bg-surface-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-white">
                <ReactMarkdown>{question.statement}</ReactMarkdown>
              </div>

              {/* Sample Test Cases (Reference Text ONLY — Never Graded) */}
              {sampleTestCases.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-surface-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-primary-400" /> Reference Sample Cases
                    </h3>
                    <span className="text-[11px] text-surface-500 italic">For reference only</span>
                  </div>

                  {sampleTestCases.map((tc, idx) => (
                    <div key={tc.id || idx} className="rounded-xl bg-surface-900 border border-surface-800 overflow-hidden text-xs">
                      <div className="px-3 py-1.5 bg-surface-800/60 border-b border-surface-800 text-surface-400 font-medium">
                        Example {idx + 1}
                      </div>
                      <div className="p-3 space-y-2">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-surface-500 tracking-wider">Input</span>
                          <pre className="mt-1 p-2 rounded bg-surface-950 font-mono text-surface-200 overflow-x-auto border border-surface-800/80">
                            {tc.input || '(empty input)'}
                          </pre>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-surface-500 tracking-wider">Expected Output</span>
                          <pre className="mt-1 p-2 rounded bg-surface-950 font-mono text-surface-200 overflow-x-auto border border-surface-800/80">
                            {tc.expectedOutput}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-surface-500">
              <Terminal className="w-10 h-10 mb-3 text-surface-600 animate-pulse" />
              <p className="text-sm font-medium text-surface-400">Waiting for interviewer to share a problem</p>
              <p className="text-xs text-surface-600 mt-1">Once a question is opened, its details will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── SPLITTER (Horizontal) ─── */}
      {!isFullscreen && (
        <div
          role="separator"
          onMouseDown={startResizingH}
          title="Drag to resize panels"
          className={`relative flex-none w-1.5 cursor-col-resize select-none bg-surface-800 hover:bg-primary-500/60 transition-colors flex items-center justify-center z-20 group ${
            isResizingH ? 'bg-primary-500' : ''
          }`}
        >
          <div className="absolute -inset-x-2 inset-y-0 cursor-col-resize" />
          <div className={`w-0.5 h-8 rounded-full ${isResizingH ? 'bg-white' : 'bg-surface-600 group-hover:bg-primary-300'}`} />
        </div>
      )}

      {/* ─── RIGHT PANEL: CoderPad Editor & Raw Console ─── */}
      <div ref={rightPanelRef} className="flex-1 flex flex-col overflow-hidden bg-surface-950 min-w-[320px]">
        {/* IDE Chrome Top Bar */}
        <div className="flex-none h-11 border-b border-surface-800 flex items-center justify-between px-3.5 bg-surface-900/90 select-none relative z-30">
          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <div className="relative" ref={langMenuRef}>
              <button
                type="button"
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                disabled={readOnly}
                className="flex items-center gap-2 bg-surface-800 hover:bg-surface-750 text-surface-100 border border-surface-700 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm transition-all focus:outline-none cursor-pointer disabled:opacity-50"
              >
                <LanguageLogo languageId={selectedLanguage.id} name={selectedLanguage.name} className="w-4 h-4 shrink-0" />
                <span className="font-mono">{selectedLanguage.name}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-surface-400 transition-transform ${isLangMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isLangMenuOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-48 bg-surface-900 border border-surface-700 rounded-lg shadow-2xl py-1 z-50 animate-fade-in ring-1 ring-white/10">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-surface-400 tracking-wider border-b border-surface-800 mb-1">
                    Select Language
                  </div>
                  {languages.map((lang) => {
                    const isSelected = lang.id === selectedLanguage.id;
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => handleLanguageChange(lang)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left transition-colors ${
                          isSelected
                            ? 'bg-primary-600/15 text-primary-300 font-semibold'
                            : 'text-surface-200 hover:bg-surface-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <LanguageLogo languageId={lang.id} name={lang.name} className="w-4 h-4 shrink-0" />
                          <span>{lang.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {lastSnapshotTime && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3" /> Saved at {lastSnapshotTime}
              </span>
            )}
          </div>

          {/* Action Buttons: Run + Submit Solution Snapshot */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunCode}
              disabled={running || readOnly || !code.trim()}
              title="Execute code with input"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-surface-200 hover:text-white border border-surface-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3 h-3 text-primary-400 fill-current" />
              <span>{running ? 'Running...' : 'Run Code'}</span>
            </button>

            {onSubmitSnapshot && (
              <button
                onClick={handleSubmitSnapshot}
                disabled={submittingSnapshot || readOnly || !code.trim()}
                title="Save solution snapshot for interviewer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-primary-600 hover:bg-primary-500 text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submittingSnapshot ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <BookmarkCheck className="w-3.5 h-3.5" />
                )}
                <span>{submittingSnapshot ? 'Saving...' : 'Submit Code'}</span>
              </button>
            )}

            <div className="h-4 w-px bg-surface-800 mx-1" />

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-md text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen editor'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="flex-1 min-h-[120px] bg-surface-950 relative z-0">
          <Editor
            height="100%"
            language={selectedLanguage.monacoLang || getMonacoLanguage(selectedLanguage.name)}
            value={code}
            onChange={handleEditorChange}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 14,
              lineHeight: 22,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
              tabSize: 4,
              fontFamily: "JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace",
              fontLigatures: true,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
            }}
          />
        </div>

        {/* ─── SPLITTER (Vertical — Editor vs Console) ─── */}
        <div
          role="separator"
          onMouseDown={startResizingV}
          title="Drag to resize editor and console"
          className={`relative flex-none h-1.5 cursor-row-resize select-none bg-surface-800 hover:bg-primary-500/60 transition-colors flex items-center justify-center z-20 group ${
            isResizingV ? 'bg-primary-500' : ''
          }`}
        >
          <div className="absolute inset-x-0 -inset-y-2 cursor-row-resize" />
          <div className={`h-0.5 w-10 rounded-full ${isResizingV ? 'bg-white' : 'bg-surface-600 group-hover:bg-primary-300'}`} />
        </div>

        {/* ─── CONSOLE / OUTPUT PANEL ─── */}
        <div style={{ height: `${outputHeight}px` }} className="flex-none flex flex-col bg-surface-900 border-t border-surface-800 overflow-hidden">
          {/* Console Tab Header */}
          <div className="flex-none h-9 px-3 flex items-center justify-between bg-surface-950/80 border-b border-surface-800 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveConsoleTab('output')}
                className={`px-3 py-1 rounded font-medium flex items-center gap-1.5 transition-colors ${
                  activeConsoleTab === 'output' ? 'bg-surface-800 text-white' : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" /> Output
              </button>
              <button
                type="button"
                onClick={() => setActiveConsoleTab('input')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeConsoleTab === 'input' ? 'bg-surface-800 text-white' : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                Custom Input
              </button>
            </div>

            {runResult && (
              <div className="flex items-center gap-3 text-surface-400 font-mono text-[11px]">
                {runResult.executionTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-surface-500" /> {runResult.executionTime}s
                  </span>
                )}
                {runResult.memoryUsed && (
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-surface-500" /> {Math.round(runResult.memoryUsed / 1024)}MB
                  </span>
                )}
                <span className={runResult.isError ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                  {runResult.statusDescription}
                </span>
              </div>
            )}
          </div>

          {/* Console Tab Body */}
          <div className="flex-1 overflow-auto p-3 text-xs font-mono">
            {activeConsoleTab === 'output' ? (
              running ? (
                <div className="flex items-center gap-2 text-surface-400">
                  <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span>Compiling and executing via Judge0...</span>
                </div>
              ) : runResult ? (
                <div className="space-y-2">
                  {runResult.compileOutput && (
                    <div>
                      <div className="text-red-400 font-semibold uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Compiler Output
                      </div>
                      <pre className="p-2 rounded bg-red-950/30 text-red-300 border border-red-900/40 whitespace-pre-wrap">
                        {runResult.compileOutput}
                      </pre>
                    </div>
                  )}

                  {runResult.stderr && (
                    <div>
                      <div className="text-amber-400 font-semibold uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Standard Error
                      </div>
                      <pre className="p-2 rounded bg-amber-950/30 text-amber-300 border border-amber-900/40 whitespace-pre-wrap">
                        {runResult.stderr}
                      </pre>
                    </div>
                  )}

                  <div>
                    <div className="text-surface-500 uppercase text-[10px] tracking-wider mb-1 font-semibold">Standard Output</div>
                    <pre className="p-2 rounded bg-surface-950 text-surface-200 border border-surface-800 whitespace-pre-wrap">
                      {runResult.stdout || '(no standard output)'}
                    </pre>
                  </div>
                </div>
              ) : (
                <span className="text-surface-500 italic">Click &quot;Run Code&quot; to execute your solution.</span>
              )
            ) : (
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Enter standard input (stdin) for your program..."
                className="w-full h-full bg-surface-950 border border-surface-800 rounded p-2 text-surface-200 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            )}
          </div>
        </div>
      </div>

      {/* Resize Overlays */}
      {isResizingH && <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto" />}
      {isResizingV && <div className="fixed inset-0 z-50 cursor-row-resize select-none pointer-events-auto" />}
    </div>
  );
}
