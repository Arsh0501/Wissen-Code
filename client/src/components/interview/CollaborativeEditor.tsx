import type * as Monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import Editor from '../CodeEditor';
import type { Socket } from 'socket.io-client';
export default function CollaborativeEditor({
  socket,
  initialCode,
  languageId,
  readOnly,
  onCode,
  theme = 'vs-dark',
}: {
  socket: Socket | null;
  initialCode: string;
  languageId: number;
  readOnly: boolean;
  onCode: (code: string) => void;
  theme?: string;
}) {
  const socketCurrent = useRef(socket);
  socketCurrent.current = socket;
  const previousLanguage = useRef(languageId);
  const [code, setCode] = useState(initialCode);
  const decorations = useRef<Monaco.editor.IEditorDecorationsCollection | null>(
    null,
  );
  const lastCursor = useRef(0);
  const [peerPosition, setPeerPosition] = useState('');
  const [message, setMessage] = useState('Synchronizing editor…');
  const [conflict, setConflict] = useState<{
    local: string;
    remote: string;
  } | null>(null);
  const state = useRef({
    revision: -1,
    code: initialCode,
    dirty: false,
    sending: false,
    conflicted: false,
  });
  const callback = useRef(onCode);
  callback.current = onCode;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const send = useRef<() => void>(() => {});
  send.current = () => {
    const s = state.current;
    if (
      !socket?.connected ||
      readOnly ||
      !s.dirty ||
      s.sending ||
      s.conflicted ||
      s.revision < 0
    )
      return;
    const pending = s.code;
    s.sending = true;
    s.dirty = false;
    setMessage('Saving…');
    socket
      .timeout(10000)
      .emit(
        'UPDATE_CODE',
        { code: pending, languageId, baseRevision: s.revision },
        (timeout: Error | null, response: any) => {
          s.sending = false;
          if (timeout || response?.success === false) {
            s.conflicted = true;
            if (response?.state) s.revision = response.state.codeRevision;
            setConflict({
              local: s.code,
              remote: response?.state?.currentCode ?? '',
            });
            setMessage(
              timeout
                ? 'Save acknowledgement lost. Reconnect to check the saved version.'
                : (response?.error ?? 'Save failed'),
            );
            return;
          }
          s.revision = Math.max(s.revision, response.revision);
          setMessage('Saved');
          if (s.dirty) send.current();
        },
      );
  };
  useEffect(() => {
    if (!socket) return;
    const sync = (raw: any) => {
      const s = state.current;
      if (!Number.isInteger(raw.codeRevision)) return;
      s.revision = raw.codeRevision;
      if (s.dirty || s.conflicted) {
        s.conflicted = true;
        setConflict({ local: s.code, remote: raw.currentCode ?? '' });
        return;
      }
      s.code = raw.currentCode ?? '';
      setCode(s.code);
      callback.current(s.code);
      setMessage('Saved');
    };
    const remote = (raw: any) => {
      const s = state.current;
      if (!Number.isInteger(raw.revision) || raw.revision <= s.revision) return;
      s.revision = raw.revision;
      if (s.dirty || s.sending) {
        s.conflicted = true;
        setConflict({ local: s.code, remote: raw.code });
        setMessage(
          'Another participant edited this code. Choose which version to continue with.',
        );
      } else {
        s.code = raw.code;
        setCode(raw.code);
        callback.current(raw.code);
        setMessage(`Updated by ${raw.authorName ?? 'participant'}`);
      }
    };
    const reconnect = () => {
      socket.emit('JOIN_INTERVIEW', {});
    };
    const cursor = (raw: any) => {
      setPeerPosition(
        `${raw.name}: line ${raw.lineNumber}, column ${raw.column}`,
      );
      decorations.current?.set([
        {
          range: {
            startLineNumber: raw.lineNumber,
            endLineNumber: raw.lineNumber,
            startColumn: raw.column,
            endColumn: raw.column + 1,
          },
          options: {
            className: 'collaborator-cursor',
            hoverMessage: { value: 'Other participant cursor' },
          },
        },
      ]);
    };
    socket.on('CURSOR_CHANGED', cursor);
    socket.on('SYNC_STATE', sync);
    socket.on('CODE_CHANGED', remote);
    socket.on('connect', reconnect);
    if (socket.connected) reconnect();
    return () => {
      clearTimeout(timer.current);
      socket.off('SYNC_STATE', sync);
      socket.off('CODE_CHANGED', remote);
      socket.off('connect', reconnect);
      socket.off('CURSOR_CHANGED', cursor);
    };
  }, [socket]);
  useEffect(() => {
    if (previousLanguage.current !== languageId) {
      previousLanguage.current = languageId;
      state.current.dirty = true;
      send.current();
    }
  }, [languageId]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div>
      <div
        className="flex flex-wrap gap-2 items-center mb-2 text-xs text-surface-500"
        role="status"
      >
        {message}
        {peerPosition && <span className="ml-3">{peerPosition}</span>}
        {conflict && (
          <>
            <button
              className="btn-outline"
              onClick={() => {
                const s = state.current;
                s.code = conflict.remote;
                s.dirty = false;
                s.conflicted = false;
                setCode(s.code);
                callback.current(s.code);
                setConflict(null);
                setMessage('Remote version restored');
              }}
            >
              Use saved version
            </button>
            <button
              className="btn-outline"
              disabled={state.current.revision < 0 || !socket?.connected}
              onClick={() => {
                state.current.conflicted = false;
                state.current.dirty = true;
                setConflict(null);
                send.current();
              }}
            >
              Save my draft instead
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                const blob = new Blob([conflict.local], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'interview-draft.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download my draft
            </button>
          </>
        )}
      </div>
      <Editor
        onMount={(instance) => {
          decorations.current = instance.createDecorationsCollection();
          instance.onDidChangeCursorPosition((event) => {
            if (Date.now() - lastCursor.current > 100) {
              lastCursor.current = Date.now();
              socketCurrent.current?.emit('CURSOR_CHANGED', event.position);
            }
          });
        }}
        height="360px"
        theme={theme}
        language={
          (
            {
              71: 'python',
              63: 'javascript',
              62: 'java',
              54: 'cpp',
              82: 'sql',
            } as Record<number, string>
          )[languageId] ?? 'plaintext'
        }
        value={code}
        options={{
          readOnly: readOnly || state.current.revision < 0,
          minimap: { enabled: false },
          automaticLayout: true,
        }}
        onChange={(value) => {
          const next = value ?? '';
          if (next === state.current.code) return;
          state.current.code = next;
          state.current.dirty = true;
          setCode(next);
          callback.current(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => send.current(), 300);
        }}
      />
    </div>
  );
}
