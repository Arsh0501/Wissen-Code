import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Video } from 'lucide-react';
import { uploadSnapshot } from '../../services/api';
import { createFaceMonitor, FLAG_MESSAGES, type BehaviourFlag, type FaceStatus } from './faceMonitor';

const FRAME_WIDTH = 320;
const FRAME_QUALITY = 0.6;
const DEFAULT_INTERVAL_MS = 45000;

async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('This browser does not support camera access.');
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
}

function captureFrame(video: HTMLVideoElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  const scale = FRAME_WIDTH / video.videoWidth;
  canvas.width = FRAME_WIDTH;
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', FRAME_QUALITY);
}

/**
 * Pre-test camera check: asks for permission, shows a preview and reports readiness.
 * The stream is released on unmount; the exam tile reopens it without a second prompt.
 */
export function CameraCheck({ onReady }: { onReady: (ready: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'idle' | 'asking' | 'ready' | 'denied'>('idle');
  const [error, setError] = useState('');
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => () => stop(), []);
  async function enable() {
    setState('asking');
    setError('');
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState('ready');
      onReady(true);
    } catch (err: any) {
      setState('denied');
      onReady(false);
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.'
          : err?.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : err?.message || 'Could not start the camera.',
      );
    }
  }
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800/50 p-4 mb-6">
      <div className="flex items-start gap-3">
        <Camera className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Camera check</p>
          <p className="text-xs text-surface-400 mt-0.5">
            This assessment is proctored. Your camera stays on while you work and
            a small photo is saved about every 45 seconds. Nothing is recorded
            before you start.
          </p>
          {state === 'ready' && (
            <p className="text-xs text-emerald-600 mt-2 inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
              Camera is on. You can start.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-red-600 mt-2">
              {error}
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`w-28 h-20 rounded-md object-cover bg-surface-900 ${state === 'ready' ? '' : 'hidden'}`}
          />
          {state !== 'ready' && (
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={enable}
              disabled={state === 'asking'}
            >
              <Video className="w-4 h-4" />
              {state === 'asking' ? 'Starting…' : state === 'denied' ? 'Try again' : 'Turn on camera'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Floating camera tile shown during the attempt. Uploads a frame on start, every
 * `intervalMs`, whenever the candidate returns to the tab, and when the camera is lost.
 */
export function CameraTile({
  sessionId,
  active,
  intervalMs = DEFAULT_INTERVAL_MS,
  monitor = true,
}: {
  sessionId: number | null;
  active: boolean;
  intervalMs?: number;
  /** Run on-device face/gaze analysis and flag sustained misbehaviour. */
  monitor?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'on' | 'off'>('starting');
  const [minimised, setMinimised] = useState(false);
  const [face, setFace] = useState<FaceStatus | null>(null);
  const [warning, setWarning] = useState<BehaviourFlag | null>(null);
  const [flagCount, setFlagCount] = useState(0);

  const send = useCallback(
    async (reason: 'interval' | 'tab-return' | 'camera-lost' | 'start' | BehaviourFlag) => {
      const video = videoRef.current;
      if (!video || !sessionId) return;
      const image = captureFrame(video);
      if (!image) return;
      try {
        await uploadSnapshot(sessionId, image, reason);
      } catch {
        // A missed frame is not worth interrupting the candidate; the next interval retries.
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (!active || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let faceMonitor: { stop: () => void } | null = null;
    (async () => {
      try {
        const stream = await openCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStatus('on');
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            setStatus('off');
            void send('camera-lost');
          };
        });
        setTimeout(() => void send('start'), 1500);
        timer = setInterval(() => void send('interval'), intervalMs);
        if (monitor && videoRef.current) {
          faceMonitor = createFaceMonitor({
            video: videoRef.current,
            onStatus: setFace,
            onFlag: (flag) => {
              setFlagCount((n) => n + 1);
              setWarning(flag);
              setTimeout(() => setWarning((w) => (w === flag ? null : w)), 6000);
              void send(flag);
            },
            onError: () => setFace(null),
          });
        }
      } catch {
        setStatus('off');
      }
    })();
    const onVisible = () => {
      if (!document.hidden) void send('tab-return');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      faceMonitor?.stop();
      document.removeEventListener('visibilitychange', onVisible);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, sessionId, intervalMs, send, monitor]);

  if (!active) return null;
  const attention = status === 'on' && face?.ready ? face.condition : null;
  const label =
    status === 'off'
      ? 'Camera off'
      : status !== 'on'
        ? 'Starting…'
        : !monitor || !face?.ready
          ? 'Camera on'
          : attention === null
            ? 'Face detected'
            : attention === 'no-face'
              ? 'No face in view'
              : attention === 'multiple-faces'
                ? 'More than one person'
                : attention === 'looking-away'
                  ? 'Facing away'
                  : 'Eyes off screen';
  return (
    <div
      className={`fixed bottom-[76px] right-4 z-40 rounded-xl overflow-hidden border shadow-lg bg-surface-900 ${status === 'off' ? 'border-red-500/50' : warning ? 'border-amber-500/70' : 'border-surface-700'}`}
      aria-live="polite"
    >
      {warning && (
        <div className="px-2 py-1.5 text-[11px] font-medium text-amber-800 bg-amber-100 border-b border-amber-200 max-w-[176px]">
          {FLAG_MESSAGES[warning]}
        </div>
      )}
      <video
        ref={videoRef}
        muted
        playsInline
        className={`object-cover bg-surface-950 ${minimised ? 'w-24 h-16' : 'w-44 h-32'}`}
      />
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          {status === 'off' ? (
            <>
              <CameraOff className="w-3.5 h-3.5 text-red-500" />
              <span className="text-red-500 font-medium">Camera off</span>
            </>
          ) : (
            <>
              <span
                className={`w-2 h-2 rounded-full ${attention ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse-dot'}`}
              />
              <span className={attention ? 'text-amber-600' : 'text-surface-300'}>{label}</span>
              {flagCount > 0 && (
                <span className="text-surface-500">· {flagCount} flag{flagCount === 1 ? '' : 's'}</span>
              )}
            </>
          )}
        </span>
        <button
          type="button"
          className="text-surface-500 hover:text-white"
          onClick={() => setMinimised((v) => !v)}
        >
          {minimised ? 'Expand' : 'Shrink'}
        </button>
      </div>
    </div>
  );
}
