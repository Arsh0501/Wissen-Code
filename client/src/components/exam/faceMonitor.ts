/**
 * On-device behaviour monitor for proctored attempts. Runs MediaPipe Face Landmarker on
 * the camera stream a couple of times per second and raises a flag when a condition
 * lasts for a few seconds: nobody in frame, more than one person, head turned away, or
 * eyes off the screen. Only the flag (and a small frame) leaves the device; the model
 * runs in the browser.
 */
export type BehaviourFlag =
  | 'no-face'
  | 'multiple-faces'
  | 'looking-away'
  | 'eyes-off-screen';

export interface FaceStatus {
  ready: boolean;
  faces: number;
  yaw: number; // degrees, 0 = facing the camera
  pitch: number; // degrees, 0 = level
  gazeSide: number; // 0..1 blendshape strength for looking left/right
  gazeDown: number; // 0..1 blendshape strength for looking down
  condition: BehaviourFlag | null; // what is currently true (before the sustain timer)
}

export interface FaceMonitorOptions {
  video: HTMLVideoElement;
  onStatus?: (status: FaceStatus) => void;
  onFlag: (flag: BehaviourFlag) => void;
  onError?: (message: string) => void;
  /** Detections per second. 2 keeps CPU use low on laptops. */
  fps?: number;
  /** How long a condition must hold before it becomes a flag. */
  sustainMs?: number;
  /** Minimum gap between two flags of the same kind. */
  cooldownMs?: number;
}

const WASM_URL =
  (import.meta.env.VITE_PROCTOR_WASM_URL as string | undefined) ||
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_URL =
  (import.meta.env.VITE_PROCTOR_MODEL_URL as string | undefined) ||
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Thresholds tuned to tolerate normal reading posture; glances shorter than sustainMs never flag.
const YAW_LIMIT_DEG = 32;
const PITCH_LIMIT_DEG = 28;
const GAZE_SIDE_LIMIT = 0.55;
const GAZE_DOWN_LIMIT = 0.65;

const toDeg = (rad: number) => (rad * 180) / Math.PI;

function score(categories: { categoryName: string; score: number }[], name: string) {
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}

/** Euler angles from MediaPipe's column-major 4x4 facial transformation matrix. */
function headPose(data: number[]) {
  const yaw = toDeg(Math.atan2(data[8], data[10]));
  const pitch = toDeg(Math.asin(Math.max(-1, Math.min(1, -data[9]))));
  return { yaw, pitch };
}

export function createFaceMonitor(options: FaceMonitorOptions): { stop: () => void } {
  const {
    video,
    onStatus,
    onFlag,
    onError,
    fps = 2,
    sustainMs = 3000,
    cooldownMs = 20000,
  } = options;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => any; close: () => void } | null =
    null;
  const since: Partial<Record<BehaviourFlag, number>> = {};
  const lastFlag: Partial<Record<BehaviourFlag, number>> = {};
  let lastTimestamp = 0;

  (async () => {
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      const build = (delegate: 'GPU' | 'CPU') =>
        vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 3,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      try {
        landmarker = await build('GPU');
      } catch {
        landmarker = await build('CPU');
      }
      if (stopped) {
        landmarker?.close();
        return;
      }
      timer = setInterval(tick, Math.round(1000 / fps));
    } catch (error: any) {
      onError?.(error?.message || 'Behaviour monitoring could not start.');
    }
  })();

  function tick() {
    if (!landmarker || stopped || video.readyState < 2 || !video.videoWidth) return;
    // MediaPipe requires strictly increasing timestamps.
    const now = Math.max(performance.now(), lastTimestamp + 1);
    lastTimestamp = now;
    let result: any;
    try {
      result = landmarker.detectForVideo(video, now);
    } catch {
      return;
    }
    const faces: number = result.faceLandmarks?.length ?? 0;
    let yaw = 0;
    let pitch = 0;
    let gazeSide = 0;
    let gazeDown = 0;
    if (faces >= 1) {
      const matrix = result.facialTransformationMatrixes?.[0]?.data;
      if (matrix?.length >= 16) ({ yaw, pitch } = headPose(matrix));
      const cats = result.faceBlendshapes?.[0]?.categories ?? [];
      gazeSide = Math.max(
        (score(cats, 'eyeLookOutLeft') + score(cats, 'eyeLookInRight')) / 2,
        (score(cats, 'eyeLookInLeft') + score(cats, 'eyeLookOutRight')) / 2,
      );
      gazeDown = (score(cats, 'eyeLookDownLeft') + score(cats, 'eyeLookDownRight')) / 2;
    }
    const condition: BehaviourFlag | null =
      faces === 0
        ? 'no-face'
        : faces > 1
          ? 'multiple-faces'
          : Math.abs(yaw) > YAW_LIMIT_DEG || Math.abs(pitch) > PITCH_LIMIT_DEG
            ? 'looking-away'
            : gazeSide > GAZE_SIDE_LIMIT || gazeDown > GAZE_DOWN_LIMIT
              ? 'eyes-off-screen'
              : null;

    const wall = Date.now();
    for (const flag of ['no-face', 'multiple-faces', 'looking-away', 'eyes-off-screen'] as const) {
      if (condition !== flag) {
        delete since[flag];
        continue;
      }
      since[flag] ??= wall;
      const held = wall - since[flag]!;
      const cooled = wall - (lastFlag[flag] ?? 0) >= cooldownMs;
      if (held >= sustainMs && cooled) {
        lastFlag[flag] = wall;
        onFlag(flag);
      }
    }
    onStatus?.({ ready: true, faces, yaw, pitch, gazeSide, gazeDown, condition });
  }

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      landmarker?.close();
      landmarker = null;
    },
  };
}

export const FLAG_MESSAGES: Record<BehaviourFlag, string> = {
  'no-face': 'We can’t see you. Please stay in front of the camera.',
  'multiple-faces': 'Only you should be visible during the test.',
  'looking-away': 'Please keep facing the screen.',
  'eyes-off-screen': 'Please keep your eyes on the screen.',
};
