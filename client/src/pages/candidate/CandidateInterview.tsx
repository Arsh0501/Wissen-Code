import AnswerInput from '../../components/questions/AnswerInput';
import RoomTools from '../../components/interview/RoomTools';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import CollaborativeEditor from '../../components/interview/CollaborativeEditor';
import QuestionDescription from '../../components/questions/QuestionDescription';
import ExecutionResults from '../../components/interview/ExecutionResults';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
import { Question } from '../../types';
import { Spinner } from '../../components/ui';
import { RotateCcw } from 'lucide-react';
import { getStarterCodeForLanguage, getAvailableQuestionLanguages } from '../../services/starterCodes';
interface Room {
  currentCandidateAnswer: string;
  id: number;
  title: string;
  candidateName: string;
  status: string;
  currentQuestionId: number | null;
  currentQuestion: Question | null;
  currentCode: string;
  currentLanguageId: number;
  questions: { questionId: number }[];
}
export default function CandidateInterview() {
  const token = useParams().token!;
  const room = useQuery({
    queryKey: ['candidate-room', token],
    queryFn: () => apiData<Room>(`/public/interview/${token}`),
    refetchInterval: 5000,
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [code, setCode] = useState('');
  const [languageId, setLanguage] = useState(71);
  const [answer, setAnswer] = useState('');
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [status, setStatus] = useState('scheduled');
  const [error, setError] = useState('');
  const [output, setOutput] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const hydratedQuestion = useRef('');
  const [resetStarterCode, setResetStarterCode] = useState<{
    text: string;
    languageId: number;
    timestamp: number;
  } | null>(null);
  useEffect(() => {
    const connection = io(
      import.meta.env.VITE_SOCKET_URL || window.location.origin,
      { auth: { roomToken: token } },
    );
    setSocket(connection);
    connection.on('connect', () => {
      connection.emit('JOIN_INTERVIEW', { roomToken: token }, (response: any) => {
        if (response?.error || response?.success === false) {
          setConnectionStatus('disconnected'); setError(response.error || 'Could not join interview');
        } else { setConnectionStatus('connected'); setError(''); }
      });
    });
    connection.on('connect_error', (e) => { setConnectionStatus('disconnected'); setError(e.message); });
    connection.on('disconnect', () => { setConnectionStatus('disconnected'); setBusy(false); });
    const sync = (payload: any) => {
      setConnectionStatus('connected');
      setError('');
      hydratedQuestion.current = `${token}:${payload.currentQuestionId ?? 'none'}`;
      setCode(payload.currentCode ?? '');
      setLanguage(payload.currentLanguageId ?? 71);
      setQuestion(payload.currentQuestion ?? null);
      setQuestionId(payload.currentQuestionId ?? null);
      setStatus(payload.status ?? 'scheduled');
      setAnswer(
        payload.currentCandidateAnswer ??
          room.data?.currentCandidateAnswer ??
          '',
      );
    };
    connection.on('SYNC_STATE', sync);
    connection.on('QUESTION_CHANGED', (payload) => {
      hydratedQuestion.current = `${token}:${payload.questionId ?? payload.currentQuestionId ?? 'none'}`;
      setQuestion(payload.question ?? payload.currentQuestion ?? null);
      setQuestionId(payload.questionId ?? payload.currentQuestionId ?? null);
      setCode(payload.code ?? payload.starterCode ?? '');
      setLanguage(payload.languageId ?? 71);
      setAnswer(payload.candidateAnswer ?? '');
      setOutput(null);
    });
    connection.on('QUESTIONS_UPDATED', (payload) => {
      if (hydratedQuestion.current === `${token}:${payload.questionId ?? 'none'}`) setQuestion(payload.question ?? null);
      void room.refetch();
    });
    connection.on('CODE_CHANGED', (payload) => {
      if (Number.isInteger(payload.languageId)) setLanguage(payload.languageId);
    });
    connection.on('INTERVIEW_STARTED', () => { setStatus('in_progress'); void room.refetch(); });
    connection.on('INTERVIEW_ENDED', () => setStatus('completed'));
    connection.on('ERROR', (payload) => {
      setError(payload.message);
      setBusy(false);
    });
    connection.on('CODE_EXECUTED', (payload) => {
      setOutput(payload);
      setBusy(false);
    });
    connection.on('CODE_SUBMITTED', (payload) => {
      setOutput(payload);
      setBusy(false);
    });
    return () => {
      connection.disconnect();
    };
  }, [token]);
  useEffect(() => {
    const data = room.data;
    if (!data) return;
    const key = `${token}:${data.currentQuestionId ?? 'none'}`;
    // Polling should hydrate saved state without replacing the candidate's unsaved draft.
    if (hydratedQuestion.current === key) return;
    hydratedQuestion.current = key;
    setCode(data.currentCode || '');
    setLanguage(data.currentLanguageId);
    setQuestion(data.currentQuestion);
    setQuestionId(data.currentQuestionId);
    setAnswer(data.currentCandidateAnswer || '');
  }, [room.data, token]);
  useEffect(() => {
    if (!room.data) return;
    setStatus(room.data.status);
  }, [room.data?.status]);
  const saveAnswer = useMutation({
    mutationFn: () =>
      apiData(`/public/interview/${token}/answer`, 'put', {
        questionId,
        answer,
      }),
  });
  const run = (event: string) => {
    setBusy(true);
    setError('');
    setOutput(null);
    socket?.emit(event, { code, languageId, questionId }, (response: any) => {
      if (response?.error) setError(response.error);
      if (response) setOutput(response);
      setBusy(false);
    });
  };
  if (room.isLoading) return <Spinner />;
  if (room.error)
    return (
      <main className="p-8">
        <p role="alert">{apiError(room.error)}</p>
      </main>
    );
  const r = room.data!;
  if (status !== 'in_progress') return (
    <main className="min-h-screen flex items-center justify-center p-5 bg-surface-950 text-surface-100">
      <section className="card w-full max-w-lg text-center space-y-3" role="status">
        <h1 className="text-xl font-semibold">{status === 'scheduled' ? 'Waiting for interviewer to start the interview' : 'This interview has ended'}</h1>
        {status === 'scheduled' && <p className="text-sm text-surface-400">Please keep this page open. Your interview will appear automatically when the interviewer starts it.</p>}
      </section>
    </main>
  );
  const activeQuestion = questionId === null ? null : question ?? r.currentQuestion;
  const writtenQuestion = activeQuestion?.questionType === 'written';
  const manualAnswer =
    !!activeQuestion &&
    ['mcq', 'project'].includes(activeQuestion.questionType ?? '');
  const codeAnswer = !!activeQuestion && ['coding', 'debugging', 'sql'].includes(activeQuestion.questionType || 'coding');

  const handleApplyStarterCode = (targetLangId: number) => {
    const starter = getStarterCodeForLanguage(activeQuestion, targetLangId);
    setLanguage(targetLangId);
    setCode(starter);
    setResetStarterCode({
      text: starter,
      languageId: targetLangId,
      timestamp: Date.now(),
    });
  };

  return (
    <main className="min-h-screen min-w-0 max-w-full p-3 sm:p-5 bg-surface-950 text-surface-100">
      <header className="flex justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">{r.title}</h1>
          <p className="text-surface-500">Welcome, {r.candidateName}</p>
        </div>
        <span className="badge">{status.replace(/_/g, ' ')}</span>
      </header>
      {connectionStatus !== 'connected' && <div className="card mb-5 space-y-2">
        <p>{connectionStatus === 'connecting' ? 'Connecting to the live interview…' : 'Live connection unavailable. Saved interview data remains visible.'}</p>
        <button className="btn-outline" onClick={() => { socket?.disconnect(); setConnectionStatus('connecting'); setError(''); socket?.connect(); }}>Reconnect</button>
      </div>}
      {!writtenQuestion && <div className="grid lg:grid-cols-2 gap-5 min-w-0">
        <section className="card space-y-4 min-w-0 max-w-full overflow-hidden">
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">
            {activeQuestion?.title || 'Waiting for a question'}
          </h2>
          {activeQuestion && <QuestionDescription question={activeQuestion} />}
          {manualAnswer && activeQuestion && <>
          {(
            status === 'in_progress' ? (
              <AnswerInput
                question={activeQuestion}
                value={answer}
                onChange={setAnswer}
              />
            ) : (
              <pre className="sample-box">{answer}</pre>
            )
          )}
          <button
            className="btn-outline"
            disabled={
              status !== 'in_progress' || saveAnswer.isPending || !questionId
            }
            onClick={() => saveAnswer.mutate()}
          >
            Save answer for interviewer
          </button>
          {saveAnswer.isSuccess && <p role="status">Answer saved.</p>}
          {saveAnswer.error && <p role="alert">{apiError(saveAnswer.error)}</p>}
          </>}
        </section>
        {codeAnswer && (
          <section className="card space-y-4 min-w-0 max-w-full overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <label className="label flex-1">
                Code language
                <select
                  className="input mt-2"
                  value={languageId}
                  disabled={status !== 'in_progress'}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    handleApplyStarterCode(next);
                  }}
                >
                  {getAvailableQuestionLanguages(activeQuestion).map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="btn-outline flex items-center justify-center gap-1.5 py-2.5 px-3.5 text-xs sm:mb-0.5 whitespace-nowrap"
                disabled={status !== 'in_progress'}
                onClick={() => handleApplyStarterCode(languageId)}
                title="Reset editor to question starter code for the selected language"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Set to starter code
              </button>
            </div>
            <CollaborativeEditor
              key={questionId}
              socket={socket}
              initialCode={code}
              languageId={languageId}
              readOnly={status !== 'in_progress'}
              onCode={setCode}
              resetStarterCode={resetStarterCode}
            />
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-outline"
                disabled={
                  status !== 'in_progress' || busy || !socket?.connected
                }
                onClick={() => run('EXECUTE_CODE')}
              >
                Run code
              </button>
              <button
                className="btn-primary"
                disabled={
                  status !== 'in_progress' || busy || !socket?.connected
                }
                onClick={() => run('SUBMIT_CODE')}
              >
                {busy ? 'Running…' : 'Submit code'}
              </button>
            </div>
            {output !== null && <ExecutionResults value={output} />}
          </section>
        )}
      </div>}
      {error && (
        <p role="alert" className="text-red-600 mt-5">
          {error}
        </p>
      )}
      {!['completed', 'cancelled'].includes(status) && (
        <RoomTools socket={socket} />
      )}
    </main>
  );
}
