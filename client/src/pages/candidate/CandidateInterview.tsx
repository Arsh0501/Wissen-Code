import BrandLogo from "../../components/landing/BrandLogo";
import ThemeToggle from "../../components/ThemeToggle";
import { useTheme } from "../../context/ThemeContext";
import AnswerInput from "../../components/questions/AnswerInput";
import RoomTools from "../../components/interview/RoomTools";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import CollaborativeEditor from "../../components/interview/CollaborativeEditor";
import ReactMarkdown from "react-markdown";
import { apiData } from "../../services/workflows";
import { apiError } from "../../services/api";
import { Question } from "../../types";
import { Spinner } from "../../components/ui";
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
  const { theme } = useTheme();
  const room = useQuery({
    queryKey: ["candidate-room", token],
    queryFn: () => apiData<Room>(`/public/interview/${token}`),
    refetchInterval: 5000,
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [code, setCode] = useState("");
  const [languageId, setLanguage] = useState(71);
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [status, setStatus] = useState("scheduled");
  const [error, setError] = useState("");
  const [output, setOutput] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const connection = io(
      import.meta.env.VITE_SOCKET_URL || window.location.origin,
      { auth: { roomToken: token } },
    );
    setSocket(connection);
    connection.on("connect", () =>
      connection.emit("JOIN_INTERVIEW", { roomToken: token }),
    );
    connection.on("connect_error", (e) => setError(e.message));
    const sync = (payload: any) => {
      setCode(payload.currentCode ?? "");
      setLanguage(payload.currentLanguageId ?? 71);
      setQuestion(payload.currentQuestion ?? null);
      setQuestionId(payload.currentQuestionId ?? null);
      setStatus(payload.status ?? "scheduled");
      setAnswer(
        payload.currentCandidateAnswer ??
          room.data?.currentCandidateAnswer ??
          "",
      );
    };
    connection.on("SYNC_STATE", sync);
    connection.on("QUESTION_CHANGED", (payload) => {
      setQuestion(payload.question ?? payload.currentQuestion ?? null);
      setQuestionId(payload.questionId ?? payload.currentQuestionId ?? null);
      setCode(payload.code ?? payload.starterCode ?? "");
      setLanguage(payload.languageId ?? 71);
      setAnswer("");
      setOutput(null);
    });
    connection.on("INTERVIEW_STARTED", () => setStatus("in_progress"));
    connection.on("INTERVIEW_ENDED", () => setStatus("completed"));
    connection.on("ERROR", (payload) => {
      setError(payload.message);
      setBusy(false);
    });
    connection.on("CODE_EXECUTED", (payload) => {
      setOutput(payload);
      setBusy(false);
    });
    connection.on("CODE_SUBMITTED", (payload) => {
      setOutput(payload);
      setBusy(false);
    });
    return () => {
      connection.disconnect();
    };
  }, [token]);
  useEffect(() => {
    if (!room.data) return;
    setStatus(room.data.status);
  }, [room.data?.status]);
  const saveAnswer = useMutation({
    mutationFn: () =>
      apiData(`/public/interview/${token}/answer`, "put", {
        questionId,
        answer,
      }),
  });
  const run = (event: string) => {
    setBusy(true);
    setError("");
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
  const activeQuestion = question ?? r.currentQuestion;
  const manualAnswer =
    !!activeQuestion &&
    ["mcq", "written", "project"].includes(activeQuestion.questionType ?? "");
  return (
    <main className="min-h-screen p-5 bg-surface-950 text-surface-100">
      <div className="interview-brand-bar">
        <BrandLogo />
        <ThemeToggle />
      </div>
      <header className="flex flex-wrap gap-3 justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">{r.title}</h1>
          <p className="text-surface-500">Welcome, {r.candidateName}</p>
        </div>
        <span className="badge">{status.replace(/_/g, " ")}</span>
      </header>
      {status !== "in_progress" && (
        <p className="card mb-5">
          {status === "scheduled"
            ? "Waiting for your interviewer to start the session."
            : "This interview has ended."}
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-5">
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">
            {question?.title ||
              r.currentQuestion?.title ||
              "Waiting for a question"}
          </h2>
          <div className="prose prose-invert max-w-none text-sm">
            <ReactMarkdown>
              {question?.statement || r.currentQuestion?.statement || ""}
            </ReactMarkdown>
          </div>
          {manualAnswer && activeQuestion ? (
            status === "in_progress" ? (
              <AnswerInput
                question={activeQuestion}
                value={answer}
                onChange={setAnswer}
              />
            ) : (
              <pre className="sample-box">{answer}</pre>
            )
          ) : (
            <label className="label">
              Your answer
              <textarea
                rows={6}
                className="input mt-2"
                value={answer}
                disabled={status !== "in_progress"}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </label>
          )}
          <button
            className="btn-outline"
            disabled={
              status !== "in_progress" || saveAnswer.isPending || !questionId
            }
            onClick={() => saveAnswer.mutate()}
          >
            Save answer for interviewer
          </button>
          {saveAnswer.isSuccess && <p role="status">Answer saved.</p>}
          {saveAnswer.error && <p role="alert">{apiError(saveAnswer.error)}</p>}
        </section>
        {!manualAnswer && (
          <section className="card space-y-4">
            <label className="label">
              Code language
              <select
                className="input mt-2"
                value={languageId}
                disabled={status !== "in_progress"}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setLanguage(next);
                }}
              >
                {activeQuestion?.questionType === "sql" ? (
                  <option value={82}>SQL (SQLite)</option>
                ) : (
                  <>
                    <option value={71}>Python</option>
                    <option value={63}>JavaScript</option>
                    <option value={62}>Java</option>
                    <option value={54}>C++</option>
                  </>
                )}
              </select>
            </label>
            <CollaborativeEditor
              theme={theme === "dark" ? "vs-dark" : "light"}
              key={questionId}
              socket={socket}
              initialCode={code}
              languageId={languageId}
              readOnly={status !== "in_progress"}
              onCode={setCode}
            />
            <div className="flex gap-3">
              <button
                className="btn-outline"
                disabled={
                  status !== "in_progress" || busy || !socket?.connected
                }
                onClick={() => run("EXECUTE_CODE")}
              >
                Run code
              </button>
              <button
                className="btn-primary"
                disabled={
                  status !== "in_progress" || busy || !socket?.connected
                }
                onClick={() => run("SUBMIT_CODE")}
              >
                {busy ? "Running…" : "Submit code"}
              </button>
            </div>
            {output !== null && (
              <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-60">
                {JSON.stringify(output, null, 2)}
              </pre>
            )}
          </section>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-600 mt-5">
          {error}
        </p>
      )}
      {!["completed", "cancelled"].includes(status) && (
        <RoomTools socket={socket} />
      )}
    </main>
  );
}
