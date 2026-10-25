import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
type Stroke = { id: string; color: string; points: { x: number; y: number }[] };
type Chat = { id: number; name: string; text: string; timestamp: string };
export default function RoomTools({
  socket,
  interviewer = false,
}: {
  socket: Socket | null;
  interviewer?: boolean;
}) {
  const [tab, setTab] = useState('chat');
  const [messages, setMessages] = useState<Chat[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [color, setColor] = useState('#2563eb');
  const [videoStatus, setVideoStatus] = useState(
    'Camera and microphone are off.',
  );
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const incoming = useRef<RTCSessionDescriptionInit | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const candidates = useRef<RTCIceCandidateInit[]>([]);
  const [hasOffer, setHasOffer] = useState(false);
  const cleanup = () => {
    peer.current?.close();
    peer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    candidates.current = [];
    incoming.current = null;
    setHasOffer(false);
  };
  const buildPeer = async () => {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        'Camera access requires HTTPS or localhost and a supported browser.',
      );
    const media = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    stream.current = media;
    if (localVideo.current) localVideo.current.srcObject = media;
    const rtc = new RTCPeerConnection({ iceServers: ice.current });
    peer.current = rtc;
    media.getTracks().forEach((track) => rtc.addTrack(track, media));
    rtc.ontrack = (event) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
    };
    rtc.onicecandidate = (event) => {
      if (event.candidate)
        socket?.emit('RTC_SIGNAL', {
          type: 'ice',
          data: event.candidate.toJSON(),
        });
    };
    rtc.onconnectionstatechange = () =>
      setVideoStatus(
        rtc.connectionState === 'failed'
          ? 'Video connection failed. Configure TURN for connections across restrictive networks.'
          : `Video: ${rtc.connectionState}`,
      );
    return rtc;
  };
  useEffect(() => {
    if (!socket) return;
    const sync = () =>
      socket.emit('ROOM_TOOLS', {}, (response: any) => {
        if (!response?.success) return;
        ice.current = Array.isArray(response.iceServers)
          ? response.iceServers
          : [];
        const chat: Chat[] = [];
        let board: Stroke[] = [];
        for (const e of response.events) {
          if (e.eventType === 'CHAT_MESSAGE')
            chat.push({ id: e.id, ...e.payload });
          if (e.eventType === 'WHITEBOARD_STROKE') board.push(e.payload);
          if (e.eventType === 'WHITEBOARD_CLEARED') board = [];
        }
        setMessages(chat);
        setStrokes(board);
      });
    const onChat = (message: Chat) =>
      setMessages((v) =>
        v.some((m) => m.id === message.id) ? v : [...v, message],
      );
    const onStroke = (stroke: Stroke) =>
      setStrokes((v) => [...v.filter((s) => s.id !== stroke.id), stroke]);
    const clear = () => setStrokes([]);
    const signal = async (signal: any) => {
      try {
        if (signal.type === 'offer') {
          incoming.current = signal.data;
          setHasOffer(true);
          setVideoStatus(
            'Incoming video call. Accept to enable your camera and microphone.',
          );
        }
        if (signal.type === 'answer' && peer.current) {
          await peer.current.setRemoteDescription(signal.data);
          for (const c of candidates.current.splice(0))
            await peer.current.addIceCandidate(c);
        }
        if (signal.type === 'ice') {
          if (peer.current?.remoteDescription)
            await peer.current.addIceCandidate(signal.data);
          else candidates.current.push(signal.data);
        }
        if (signal.type === 'hangup') {
          cleanup();
          setVideoStatus('Call ended.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Video signaling failed');
      }
    };
    socket.on('SYNC_STATE', sync);
    socket.on('CHAT_MESSAGE', onChat);
    socket.on('WHITEBOARD_STROKE', onStroke);
    socket.on('WHITEBOARD_CLEARED', clear);
    socket.on('RTC_SIGNAL', signal);
    socket.on('connect', sync);
    const timer = setTimeout(sync, 500);
    return () => {
      clearTimeout(timer);
      socket.off('SYNC_STATE', sync);
      socket.off('CHAT_MESSAGE', onChat);
      socket.off('WHITEBOARD_STROKE', onStroke);
      socket.off('WHITEBOARD_CLEARED', clear);
      socket.off('RTC_SIGNAL', signal);
      socket.off('connect', sync);
      cleanup();
    };
  }, [socket]);
  const startCall = async (accept: boolean) => {
    try {
      setError('');
      const offer = incoming.current;
      const rtc = await buildPeer();
      if (accept && offer) {
        await rtc.setRemoteDescription(offer);
        for (const c of candidates.current.splice(0))
          await rtc.addIceCandidate(c);
        const answer = await rtc.createAnswer();
        await rtc.setLocalDescription(answer);
        socket?.emit('RTC_SIGNAL', { type: 'answer', data: answer });
        setHasOffer(false);
      } else {
        const offer = await rtc.createOffer();
        await rtc.setLocalDescription(offer);
        socket?.emit('RTC_SIGNAL', { type: 'offer', data: offer });
      }
      setVideoStatus('Connecting video…');
    } catch (e) {
      cleanup();
      setError(e instanceof Error ? e.message : 'Could not start video');
    }
  };
  const point = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(1000, ((event.clientX - box.left) / box.width) * 1000),
      ),
      y: Math.max(
        0,
        Math.min(600, ((event.clientY - box.top) / box.height) * 600),
      ),
    };
  };
  return (
    <section className="card mt-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        {['chat', 'whiteboard', 'video'].map((t) => (
          <button
            className={t === tab ? 'btn-primary' : 'btn-outline'}
            key={t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {tab === 'chat' && (
        <>
          <div className="max-h-64 overflow-auto space-y-3" aria-live="polite">
            {messages.length === 0 && (
              <p className="text-surface-500 text-sm">
                Messages are shared with interview participants and retained in
                the interview history.
              </p>
            )}
            {messages.map((m) => (
              <p key={m.id} className="text-sm">
                <strong>{m.name}</strong>{' '}
                <span className="text-xs text-surface-500">
                  {new Date(m.timestamp).toLocaleTimeString()}
                </span>
                <span className="block whitespace-pre-wrap">{m.text}</span>
              </p>
            ))}
          </div>
          <form
            className="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              socket
                ?.timeout(10000)
                .emit(
                  'CHAT_MESSAGE',
                  { text },
                  (err: Error | null, result: any) => {
                    if (err || !result?.success)
                      setError(
                        'Message could not be sent. Reconnect and retry.',
                      );
                    else setText('');
                  },
                );
            }}
          >
            <input
              aria-label="Chat message"
              className="input"
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!socket?.connected || !text.trim()}
            >
              Send
            </button>
          </form>
        </>
      )}
      {tab === 'whiteboard' && (
        <>
          <div className="flex gap-2 items-center">
            <label>
              Pen color
              <select
                aria-label="Pen color"
                className="input"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              >
                {[
                  ['#2563eb', 'Blue'],
                  ['#16a34a', 'Green'],
                  ['#ef4444', 'Red'],
                  ['#f59e0b', 'Amber'],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {interviewer && (
              <button
                className="btn-outline"
                onClick={() => socket?.emit('WHITEBOARD_CLEARED', {})}
              >
                Clear whiteboard
              </button>
            )}
          </div>
          <svg
            role="img"
            aria-label="Shared drawing whiteboard"
            viewBox="0 0 1000 600"
            className="w-full bg-on-accent rounded-lg border border-surface-700 touch-none"
            onPointerDown={(e) => {
              if (!socket?.connected) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrawing({
                id: crypto.randomUUID(),
                color,
                points: [point(e)],
              });
            }}
            onPointerMove={(e) => {
              if (drawing && drawing.points.length < 1000)
                setDrawing({
                  ...drawing,
                  points: [...drawing.points, point(e)],
                });
            }}
            onPointerUp={() => {
              if (drawing && drawing.points.length >= 2) {
                const stroke = drawing;
                setStrokes((v) => [...v, stroke]);
                socket
                  ?.timeout(10000)
                  .emit(
                    'WHITEBOARD_STROKE',
                    stroke,
                    (err: Error | null, response: any) => {
                      if (err || !response?.success) {
                        setError('Drawing could not be saved.');
                        setStrokes((v) => v.filter((s) => s.id !== stroke.id));
                      }
                    },
                  );
              }
              setDrawing(null);
            }}
            onPointerCancel={() => setDrawing(null)}
          >
            {[...strokes, ...(drawing ? [drawing] : [])].map((s) => (
              <polyline
                key={s.id}
                points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          <p className="text-xs text-surface-500">
            Use chat or the code editor for a keyboard-accessible alternative to
            drawing.
          </p>
        </>
      )}
      <div className={tab === 'video' ? 'space-y-3' : 'hidden'}>
        <p className="text-sm">{videoStatus}</p>
        <p className="text-xs text-surface-500">
          Camera and microphone start only when you join. Calls are not
          recorded. Cross-network calls require configured STUN/TURN servers.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <video
            aria-label="Your camera"
            className="w-full bg-black rounded-lg"
            ref={localVideo}
            muted
            playsInline
            autoPlay
          />
          <video
            aria-label="Participant camera"
            className="w-full bg-black rounded-lg"
            ref={remoteVideo}
            playsInline
            autoPlay
          />
        </div>
        <div className="flex gap-3">
          <button
            className="btn-primary"
            disabled={!socket?.connected || !!stream.current}
            onClick={() => void startCall(hasOffer)}
          >
            {hasOffer ? 'Accept call' : 'Start video call'}
          </button>
          <button
            className="btn-outline"
            onClick={() => {
              socket?.emit('RTC_SIGNAL', { type: 'hangup', data: null });
              cleanup();
              setVideoStatus('Camera and microphone are off.');
            }}
          >
            Leave call
          </button>
          <button
            className="btn-outline"
            onClick={() =>
              stream.current?.getAudioTracks().forEach((t) => {
                t.enabled = !t.enabled;
              })
            }
          >
            Toggle microphone
          </button>
          <button
            className="btn-outline"
            onClick={() =>
              stream.current?.getVideoTracks().forEach((t) => {
                t.enabled = !t.enabled;
              })
            }
          >
            Toggle camera
          </button>
        </div>
      </div>
    </section>
  );
}
