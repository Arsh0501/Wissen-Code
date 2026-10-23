import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import LiveTranscript from './LiveTranscript';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneCall,
  PhoneOff,
  MessagesSquare,
  PenTool,
} from 'lucide-react';
type Stroke = { id: string; color: string; points: { x: number; y: number }[] };
type Chat = { id: number; name: string; text: string; timestamp: string };
export default function RoomTools({
  socket,
  interviewer = false,
}: {
  socket: Socket | null;
  interviewer?: boolean;
}) {
  const [tab, setTab] = useState(interviewer ? 'video' : 'chat');
  const [candidateAudio, setCandidateAudio] = useState<MediaStream | null>(null);
  const [transcriptionActive, setTranscriptionActive] = useState(false);
  const [messages, setMessages] = useState<Chat[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [color, setColor] = useState('#2563eb');
  const [videoStatus, setVideoStatus] = useState(
    'Camera and microphone are off.',
  );
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const [remoteMediaState, setRemoteMediaState] = useState<{
    mic: boolean;
    camera: boolean;
  }>({ mic: true, camera: true });
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const incoming = useRef<RTCSessionDescriptionInit | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const candidates = useRef<RTCIceCandidateInit[]>([]);
  const [hasOffer, setHasOffer] = useState(false);
  const cleanup = () => {
    setCandidateAudio(null);
    peer.current?.close();
    peer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    candidates.current = [];
    incoming.current = null;
    setHasOffer(false);
    setIsCallActive(false);
    setIsMicOn(true);
    setIsCameraOn(true);
    setRemoteMediaState({ mic: true, camera: true });
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
      if (interviewer && event.track.kind === 'audio') setCandidateAudio(new MediaStream([event.track]));
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
          setTab('video');
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
        if (signal.type === 'media-state' && signal.data) {
          setRemoteMediaState({
            mic: Boolean(signal.data.mic),
            camera: Boolean(signal.data.camera),
          });
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
    const captureStatus = (value: { active: boolean }) => setTranscriptionActive(value.active);
    socket.on('TRANSCRIPT_CAPTURE_STATUS', captureStatus);
    const ended = () => { cleanup(); setTranscriptionActive(false); };
    socket.on('INTERVIEW_ENDED', ended);
    const participantJoined = () => {
      const rtc = peer.current;
      if (rtc?.localDescription?.type === 'offer' && !rtc.remoteDescription)
        socket.emit('RTC_SIGNAL', { type: 'offer', data: { type: rtc.localDescription.type, sdp: rtc.localDescription.sdp } });
    };
    socket.on('CANDIDATE_JOINED', participantJoined);
    socket.on('INTERVIEWER_JOINED', participantJoined);
    socket.on('connect', sync);
    const timer = setTimeout(sync, 500);
    return () => {
      clearTimeout(timer);
      socket.off('SYNC_STATE', sync);
      socket.off('CHAT_MESSAGE', onChat);
      socket.off('WHITEBOARD_STROKE', onStroke);
      socket.off('WHITEBOARD_CLEARED', clear);
      socket.off('RTC_SIGNAL', signal);
      socket.off('TRANSCRIPT_CAPTURE_STATUS', captureStatus);
      socket.off('INTERVIEW_ENDED', ended);
      socket.off('CANDIDATE_JOINED', participantJoined);
      socket.off('INTERVIEWER_JOINED', participantJoined);
      socket.off('connect', sync);
      cleanup();
    };
  }, [socket]);
  const startCall = async (accept: boolean) => {
    try {
      setError('');
      const offer = incoming.current;
      const rtc = await buildPeer();
      setIsCallActive(true);
      setIsMicOn(true);
      setIsCameraOn(true);
      if (accept && offer) {
        await rtc.setRemoteDescription(offer);
        for (const c of candidates.current.splice(0))
          await rtc.addIceCandidate(c);
        const answer = await rtc.createAnswer();
        await rtc.setLocalDescription(answer);
        socket?.emit('RTC_SIGNAL', { type: 'answer', data: answer });
        socket?.emit('RTC_SIGNAL', {
          type: 'media-state',
          data: { mic: true, camera: true },
        });
        setHasOffer(false);
      } else {
        const offer = await rtc.createOffer();
        await rtc.setLocalDescription(offer);
        socket?.emit('RTC_SIGNAL', { type: 'offer', data: offer });
        socket?.emit('RTC_SIGNAL', {
          type: 'media-state',
          data: { mic: true, camera: true },
        });
      }
      setVideoStatus('Connecting video…');
    } catch (e) {
      cleanup();
      setError(e instanceof Error ? e.message : 'Could not start video');
    }
  };
  const toggleMicrophone = () => {
    if (!stream.current) return;
    const tracks = stream.current.getAudioTracks();
    const next = !isMicOn;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setIsMicOn(next);
    socket?.emit('RTC_SIGNAL', {
      type: 'media-state',
      data: { mic: next, camera: isCameraOn },
    });
  };
  const toggleCamera = () => {
    if (!stream.current) return;
    const tracks = stream.current.getVideoTracks();
    const next = !isCameraOn;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setIsCameraOn(next);
    socket?.emit('RTC_SIGNAL', {
      type: 'media-state',
      data: { mic: isMicOn, camera: next },
    });
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
      {!interviewer && transcriptionActive && <p role="status" className="text-sm text-amber-400">The interviewer is transcribing candidate audio for this interview.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-800 pb-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'chat', label: 'Chat', icon: MessagesSquare },
            { id: 'whiteboard', label: 'Whiteboard', icon: PenTool },
            { id: 'video', label: 'Video', icon: Video },
          ].map(({ id, label, icon: Icon }) => (
            <button
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                tab === id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-surface-800/80 hover:bg-surface-800 text-surface-300'
              }`}
              key={id}
              onClick={() => setTab(id)}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {id === 'video' && isCallActive && (
                <span
                  className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse"
                  title="Call in progress"
                />
              )}
            </button>
          ))}
        </div>

        {/* Global call quick indicators when call is active (accessible from any tab) */}
        {isCallActive && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-400 hidden sm:inline">Call Status:</span>
            <button
              type="button"
              onClick={toggleMicrophone}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                isMicOn
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25 animate-pulse'
              }`}
              title={isMicOn ? 'Microphone is ON (click to mute)' : 'Microphone is OFF (click to unmute)'}
              aria-label={isMicOn ? 'Quick mute microphone' : 'Quick unmute microphone'}
            >
              {isMicOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-rose-400" />}
              <span>{isMicOn ? 'Mic ON' : 'Mic OFF'}</span>
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                isCameraOn
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
              }`}
              title={isCameraOn ? 'Camera is ON (click to turn off)' : 'Camera is OFF (click to turn on)'}
              aria-label={isCameraOn ? 'Quick turn off camera' : 'Quick turn on camera'}
            >
              {isCameraOn ? <Video className="w-3.5 h-3.5 text-emerald-400" /> : <VideoOff className="w-3.5 h-3.5 text-rose-400" />}
              <span>{isCameraOn ? 'Cam ON' : 'Cam OFF'}</span>
            </button>
          </div>
        )}
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
            className="w-full bg-white rounded-lg border border-surface-700 touch-none"
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
      <div className={tab === 'video' ? 'space-y-4' : 'hidden'}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-surface-900/60 rounded-xl border border-surface-800">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isCallActive
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                  : hasOffer
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-surface-600'
              }`}
            />
            <p className="text-sm font-medium text-surface-200">{videoStatus}</p>
          </div>
          <p className="text-xs text-surface-400">
            Encrypted WebRTC • Calls are not recorded
          </p>
        </div>

        {/* Video stream tiles with status badges */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Local User Camera */}
          <div className="relative rounded-xl overflow-hidden bg-surface-950 border border-surface-800 shadow-md aspect-video flex items-center justify-center group">
            <video
              aria-label="Your camera"
              className={`w-full h-full object-cover ${!isCameraOn || !isCallActive ? 'opacity-0' : 'opacity-100'}`}
              ref={localVideo}
              muted
              playsInline
              autoPlay
            />

            {/* Inactive or Camera OFF Overlays */}
            {(!isCallActive || !isCameraOn) && (
              <div className="absolute inset-0 bg-surface-950/90 flex flex-col items-center justify-center text-center p-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border ${
                    isCallActive
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-surface-900 border-surface-800 text-surface-500'
                  }`}
                >
                  {isCallActive ? (
                    <VideoOff className="w-6 h-6 text-rose-400" />
                  ) : (
                    <Video className="w-6 h-6 text-surface-500" />
                  )}
                </div>
                <p className="text-xs font-semibold text-surface-200">
                  {isCallActive ? 'Your Camera is OFF' : 'Camera is Inactive'}
                </p>
                <p className="text-[11px] text-surface-400 mt-0.5">
                  {isCallActive
                    ? 'Other participants cannot see your video feed'
                    : 'Start or join video call to activate your feed'}
                </p>
              </div>
            )}

            {/* Overlaid Badges on Local Video */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-surface-900/85 text-surface-200 border border-surface-700/60 backdrop-blur-md shadow-sm">
                You ({interviewer ? 'Interviewer' : 'Candidate'})
              </span>
            </div>

            {/* Audio & Video symbols / status badges */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
              {/* Mic Symbol Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold backdrop-blur-md border shadow-sm transition-all ${
                  !isCallActive
                    ? 'bg-surface-900/80 text-surface-400 border-surface-700/50'
                    : isMicOn
                    ? 'bg-emerald-950/85 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-950/85 text-rose-300 border-rose-500/50 animate-pulse'
                }`}
                title={isMicOn ? 'Microphone is ON' : 'Microphone is MUTED'}
              >
                {isMicOn && isCallActive ? (
                  <Mic className="w-3 h-3 text-emerald-400" />
                ) : (
                  <MicOff className="w-3 h-3 text-rose-400" />
                )}
                <span>{isCallActive ? (isMicOn ? 'Mic ON' : 'Mic MUTED') : 'Mic Off'}</span>
              </span>

              {/* Camera Symbol Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold backdrop-blur-md border shadow-sm transition-all ${
                  !isCallActive
                    ? 'bg-surface-900/80 text-surface-400 border-surface-700/50'
                    : isCameraOn
                    ? 'bg-emerald-950/85 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-950/85 text-rose-300 border-rose-500/50'
                }`}
                title={isCameraOn ? 'Camera is ON' : 'Camera is OFF'}
              >
                {isCameraOn && isCallActive ? (
                  <Video className="w-3 h-3 text-emerald-400" />
                ) : (
                  <VideoOff className="w-3 h-3 text-rose-400" />
                )}
                <span>{isCallActive ? (isCameraOn ? 'Cam ON' : 'Cam OFF') : 'Cam Off'}</span>
              </span>
            </div>
          </div>

          {/* Participant Remote Camera */}
          <div className="relative rounded-xl overflow-hidden bg-surface-950 border border-surface-800 shadow-md aspect-video flex items-center justify-center group">
            <video
              aria-label="Participant camera"
              className={`w-full h-full object-cover ${!remoteMediaState.camera || !isCallActive ? 'opacity-0' : 'opacity-100'}`}
              ref={remoteVideo}
              playsInline
              autoPlay
            />

            {/* Inactive or Remote Camera OFF Overlays */}
            {(!isCallActive || !remoteMediaState.camera) && (
              <div className="absolute inset-0 bg-surface-950/90 flex flex-col items-center justify-center text-center p-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border ${
                    isCallActive && !remoteMediaState.camera
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-surface-900 border-surface-800 text-surface-500'
                  }`}
                >
                  {isCallActive && !remoteMediaState.camera ? (
                    <VideoOff className="w-6 h-6 text-amber-400" />
                  ) : (
                    <Video className="w-6 h-6 text-surface-500" />
                  )}
                </div>
                <p className="text-xs font-semibold text-surface-200">
                  {isCallActive
                    ? !remoteMediaState.camera
                      ? 'Participant turned camera OFF'
                      : 'Connecting to participant video…'
                    : 'Participant video waiting'}
                </p>
                <p className="text-[11px] text-surface-400 mt-0.5">
                  {isCallActive
                    ? 'Video will resume when camera is active'
                    : 'When participant joins the call, their camera feed will appear here'}
                </p>
              </div>
            )}

            {/* Overlaid Badges on Remote Video */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-surface-900/85 text-surface-200 border border-surface-700/60 backdrop-blur-md shadow-sm">
                {interviewer ? 'Candidate' : 'Interviewer'}
              </span>
            </div>

            {/* Remote Peer Audio & Video symbols / status badges */}
            {isCallActive && (
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold backdrop-blur-md border shadow-sm transition-all ${
                    remoteMediaState.mic
                      ? 'bg-emerald-950/85 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-950/85 text-rose-300 border-rose-500/50'
                  }`}
                  title={remoteMediaState.mic ? 'Participant mic is ON' : 'Participant mic is MUTED'}
                >
                  {remoteMediaState.mic ? (
                    <Mic className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <MicOff className="w-3 h-3 text-rose-400" />
                  )}
                  <span>{remoteMediaState.mic ? 'Mic ON' : 'Mic MUTED'}</span>
                </span>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold backdrop-blur-md border shadow-sm transition-all ${
                    remoteMediaState.camera
                      ? 'bg-emerald-950/85 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-950/85 text-rose-300 border-rose-500/50'
                  }`}
                  title={remoteMediaState.camera ? 'Participant camera is ON' : 'Participant camera is OFF'}
                >
                  {remoteMediaState.camera ? (
                    <Video className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <VideoOff className="w-3 h-3 text-rose-400" />
                  )}
                  <span>{remoteMediaState.camera ? 'Cam ON' : 'Cam OFF'}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!isCallActive ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={!socket?.connected}
              onClick={() => void startCall(hasOffer)}
            >
              {hasOffer ? (
                <>
                  <PhoneCall className="w-4 h-4 text-emerald-300 animate-bounce" />
                  <span>Accept Video Call</span>
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  <span>Start Video Call</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="btn-outline inline-flex items-center gap-2 border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:border-rose-500"
              onClick={() => {
                socket?.emit('RTC_SIGNAL', { type: 'hangup', data: null });
                cleanup();
                setVideoStatus('Camera and microphone are off.');
              }}
            >
              <PhoneOff className="w-4 h-4 text-rose-400" />
              <span>Leave Call</span>
            </button>
          )}

          {/* Toggle Microphone Button */}
          <button
            type="button"
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all border ${
              !isCallActive
                ? 'opacity-50 cursor-not-allowed bg-surface-900 border-surface-800 text-surface-500'
                : isMicOn
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25 hover:border-rose-500'
            }`}
            disabled={!isCallActive}
            onClick={toggleMicrophone}
            aria-label={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
            title={
              !isCallActive
                ? 'Start call to toggle microphone'
                : isMicOn
                ? 'Microphone is ON. Click to mute.'
                : 'Microphone is MUTED. Click to unmute.'
            }
          >
            {isMicOn ? (
              <>
                <Mic className="w-4 h-4 text-emerald-400" />
                <span>Microphone: <strong className="text-emerald-400">ON</strong></span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4 text-rose-400" />
                <span>Microphone: <strong className="text-rose-400">OFF</strong></span>
                <span className="w-2 h-2 rounded-full bg-rose-400" />
              </>
            )}
          </button>

          {/* Toggle Camera Button */}
          <button
            type="button"
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all border ${
              !isCallActive
                ? 'opacity-50 cursor-not-allowed bg-surface-900 border-surface-800 text-surface-500'
                : isCameraOn
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25 hover:border-rose-500'
            }`}
            disabled={!isCallActive}
            onClick={toggleCamera}
            aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            title={
              !isCallActive
                ? 'Start call to toggle camera'
                : isCameraOn
                ? 'Camera is ON. Click to turn off.'
                : 'Camera is OFF. Click to turn on.'
            }
          >
            {isCameraOn ? (
              <>
                <Video className="w-4 h-4 text-emerald-400" />
                <span>Camera: <strong className="text-emerald-400">ON</strong></span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
              </>
            ) : (
              <>
                <VideoOff className="w-4 h-4 text-rose-400" />
                <span>Camera: <strong className="text-rose-400">OFF</strong></span>
                <span className="w-2 h-2 rounded-full bg-rose-400" />
              </>
            )}
          </button>
        </div>
      </div>
      {interviewer && <LiveTranscript socket={socket} audio={candidateAudio} />}
    </section>
  );
}
