/**
 * Pure, decoupled Studio-Grade Live2D Portrait Kinematics & Expression Solver:
 * Uses 2nd-order critically-damped spring physics (position + velocity) for
 * butter-smooth, zero-jitter 60fps broadcast motion synced directly to:
 *   1. Active Xiangqi board square coordinates (col 0..8, row 0..9)
 *   2. Real-time Gemini TTS voice amplitude (0..1)
 *   3. Expressive emotional state (calm, amused, thinking, surprised, fierce, check, victory)
 */

export type HostEmotion =
  | 'calm'
  | 'amused'
  | 'thinking'
  | 'surprised'
  | 'fierce'
  | 'check'
  | 'victory';

export interface BoardFocusSignal {
  row: number; // 0 (Black back rank) .. 9 (Red back rank)
  col: number; // 0 (left file) .. 8 (right file)
  side: 'red' | 'black';
  captured?: boolean;
  inCheck?: boolean;
  notation?: string;
  seq: number;
}

export interface PortraitKinematicsInput {
  dt: number;
  elapsed: number;
  isSpeaking: boolean;
  voiceLevel: number; // 0..1 live RMS or syllable amplitude
  botThinking: boolean;
  inCheck: boolean;
  isFierce: boolean;
  emotion?: HostEmotion;
  boardFocus: BoardFocusSignal | null;
}

export interface PortraitKinematicsState {
  // Primary studio pose (2nd-order spring position + velocity)
  headYaw: number; // -1 (left) .. +1 (right)
  headYawVel: number;
  headPitch: number; // -1 (up) .. +1 (down toward board)
  headPitchVel: number;
  headRoll: number; // -1 .. +1 expressive tilt
  headRollVel: number;

  // Eye gaze tracking
  eyeGazeX: number; // -1 .. +1
  eyeGazeXVel: number;
  eyeGazeY: number; // -1 .. +1
  eyeGazeYVel: number;

  // Lip-sync articulation
  mouthOpen: number; // 0 .. 1
  mouthWidth: number; // -0.3 .. +0.3

  // Real-time GLSL facial expression morphs on ONE consistent identity
  browFurrow: number; // 0 .. 1 (intense / fierce / thinking)
  browRaise: number; // 0 .. 1 (surprised / intrigued / amused)
  smile: number; // 0 .. 1 (warm smile / playful smirk / victory)
  eyeNarrow: number; // 0 .. 1 (focused squint / sultry glance)
  dramaLight: number; // 0 .. 1 (dynamic crimson-gold studio battle key light)

  // Secondary organic life
  blink: number; // 0 (open) .. 1 (closed)
  breath: number; // 0 .. 1
  leanZoom: number; // 0 .. 1
  leanZoomVel: number;
  impactPulse: number; // 0 .. 1
  voiceEnergy: number; // 0 .. 1

  lastFocusSeq: number;
  nextBlinkAt: number;
  blinkTimer: number;
}

export function createInitialPortraitKinematics(): PortraitKinematicsState {
  return {
    headYaw: 0,
    headYawVel: 0,
    headPitch: 0,
    headPitchVel: 0,
    headRoll: 0,
    headRollVel: 0,
    eyeGazeX: 0,
    eyeGazeXVel: 0,
    eyeGazeY: 0,
    eyeGazeYVel: 0,
    mouthOpen: 0,
    mouthWidth: 0,
    browFurrow: 0,
    browRaise: 0,
    smile: 0.14,
    eyeNarrow: 0,
    dramaLight: 0,
    blink: 0,
    breath: 0.5,
    leanZoom: 0,
    leanZoomVel: 0,
    impactPulse: 0,
    voiceEnergy: 0,
    lastFocusSeq: -1,
    nextBlinkAt: 2.6,
    blinkTimer: 0,
  };
}

/**
 * Critically-damped 2nd-order spring integrator (Game Programming Gems 4).
 * Guarantees smooth C^2 acceleration with zero overshoot jitter at any frame rate.
 */
function stepDampedSpring(
  pos: number,
  vel: number,
  target: number,
  omega: number,
  dt: number,
): [number, number] {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const detX = f * pos + dt * vel + hhoo * target;
  const detV = vel + hoo * (target - pos);
  return [detX * detInv, detV * detInv];
}

function expLerp(current: number, target: number, speed: number, dt: number): number {
  const alpha = 1 - Math.exp(-speed * dt);
  return current + (target - current) * alpha;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function resolveEmotion(input: PortraitKinematicsInput): HostEmotion {
  if (input.inCheck) return 'check';
  if (input.emotion) return input.emotion;
  if (input.botThinking) return 'thinking';
  if (input.isFierce) return 'fierce';
  return 'calm';
}

export function stepPortraitKinematics(
  state: PortraitKinematicsState,
  input: PortraitKinematicsInput,
): PortraitKinematicsState {
  const dt = clamp(input.dt, 0.001, 0.05);
  const t = input.elapsed;
  const emotion = resolveEmotion(input);

  // Detect brand-new move / square focus event on the Xiangqi board
  let impactPulse = Math.max(0, state.impactPulse - dt * 1.15);
  let lastFocusSeq = state.lastFocusSeq;
  let blinkTimer = state.blinkTimer;
  let nextBlinkAt = state.nextBlinkAt;

  if (input.boardFocus && input.boardFocus.seq !== state.lastFocusSeq) {
    lastFocusSeq = input.boardFocus.seq;
    const isHeavy = Boolean(input.boardFocus.captured || input.boardFocus.inCheck);
    impactPulse = isHeavy ? 1.0 : 0.42;
    if (isHeavy && blinkTimer <= 0) {
      blinkTimer = 0.16;
    }
  }

  // 1. Voice energy & silky syllable articulation
  let rawVoice = input.isSpeaking ? clamp(input.voiceLevel, 0, 1) : 0;
  if (input.isSpeaking && rawVoice < 0.04) {
    rawVoice = 0.12 + 0.14 * Math.abs(Math.sin(t * 9.6));
  }
  const voiceSpeed = rawVoice > state.voiceEnergy ? 22 : 12;
  const voiceEnergy = expLerp(state.voiceEnergy, rawVoice, voiceSpeed, dt);

  const targetMouthOpen = input.isSpeaking
    ? clamp(voiceEnergy * 1.08, 0.03, 0.96)
    : 0;
  const mouthOpen = expLerp(
    state.mouthOpen,
    targetMouthOpen,
    targetMouthOpen > state.mouthOpen ? 24 : 15,
    dt,
  );
  const targetMouthWidth = input.isSpeaking
    ? Math.sin(t * 7.2) * 0.2 * voiceEnergy
    : emotion === 'amused' || emotion === 'victory'
      ? 0.18
      : emotion === 'fierce' || emotion === 'check'
        ? 0.08
        : 0.04;
  const mouthWidth = expLerp(state.mouthWidth, targetMouthWidth, 10, dt);

  // 2. Expressive Facial Morph Targets (driven on ONE consistent identity!)
  let targetBrowFurrow = 0.0;
  let targetBrowRaise = 0.0;
  let targetSmile = 0.14;
  let targetEyeNarrow = 0.0;
  let targetDramaLight = 0.0;

  switch (emotion) {
    case 'amused':
      targetSmile = 0.72;
      targetBrowRaise = 0.26;
      targetEyeNarrow = 0.18;
      targetDramaLight = 0.12;
      break;
    case 'surprised':
      targetBrowRaise = 0.85;
      targetSmile = 0.16;
      targetEyeNarrow = 0.0;
      targetDramaLight = 0.24;
      break;
    case 'thinking':
      targetBrowFurrow = 0.36;
      targetBrowRaise = 0.22;
      targetSmile = 0.06;
      targetEyeNarrow = 0.16;
      targetDramaLight = 0.15;
      break;
    case 'fierce':
      targetBrowFurrow = 0.74;
      targetSmile = 0.34; // Confident imperial smirk
      targetEyeNarrow = 0.38;
      targetDramaLight = 0.68;
      break;
    case 'check':
      targetBrowFurrow = 0.92;
      targetSmile = 0.22;
      targetEyeNarrow = 0.52;
      targetDramaLight = 0.95;
      break;
    case 'victory':
      targetSmile = 0.86;
      targetBrowRaise = 0.3;
      targetEyeNarrow = 0.22;
      targetDramaLight = 0.45;
      break;
    case 'calm':
    default:
      targetSmile = 0.16 + 0.06 * Math.sin(t * 0.7);
      targetBrowRaise = 0.05;
      targetDramaLight = 0.0;
      break;
  }

  // Slight expressive brow lift on vocal emphasis peaks
  if (input.isSpeaking) {
    targetBrowRaise = clamp(targetBrowRaise + voiceEnergy * 0.24, 0, 1);
  }

  const browFurrow = expLerp(state.browFurrow, targetBrowFurrow, 5.5, dt);
  const browRaise = expLerp(state.browRaise, targetBrowRaise, 6.2, dt);
  const smile = expLerp(state.smile, targetSmile, 5.2, dt);
  const eyeNarrow = expLerp(state.eyeNarrow, targetEyeNarrow, 5.8, dt);
  const dramaLight = expLerp(state.dramaLight, targetDramaLight, 3.6, dt);

  // 3. Studio-Smooth Board-Tracking Gaze & Head Pose
  let targetYaw = Math.sin(t * 0.48) * 0.09;
  let targetPitch = Math.sin(t * 0.36) * 0.04;
  let targetRoll = Math.sin(t * 0.52) * 0.06;
  let targetLean = 0.04;

  if (input.boardFocus) {
    const normCol = clamp((input.boardFocus.col - 4) / 4, -1, 1);
    const normRow = clamp(input.boardFocus.row / 9, 0, 1);

    // Gracefully alternate between glancing at the active square and connecting with Live viewers
    const viewerEngagement = input.isSpeaking
      ? 0.5 + 0.5 * Math.sin(t * 1.15)
      : 0.16;
    const boardWeight = clamp(1 - viewerEngagement * 0.5 + impactPulse * 0.42, 0.38, 1.0);

    targetYaw = normCol * 0.82 * boardWeight;
    targetPitch = (0.1 + normRow * 0.48) * boardWeight;
    targetRoll = -normCol * 0.2 * boardWeight;
    targetLean = 0.1 + impactPulse * 0.32;
  }

  if (input.botThinking) {
    targetYaw = Math.sin(t * 1.75) * 0.52;
    targetPitch = 0.36 + Math.cos(t * 1.35) * 0.1;
    targetRoll = Math.sin(t * 1.15) * 0.18;
    targetLean = 0.24;
  }

  if (input.isSpeaking) {
    const nod = (voiceEnergy - 0.22) * 0.28;
    targetPitch += nod + Math.sin(t * 4.2) * 0.06 * voiceEnergy;
    targetYaw += Math.sin(t * 2.1) * 0.16 * (0.3 + voiceEnergy * 0.7);
    targetRoll += Math.cos(t * 2.4) * 0.2 * (0.3 + voiceEnergy * 0.7);
    targetLean = Math.max(targetLean, 0.2 + voiceEnergy * 0.18);
  }

  if (emotion === 'amused') {
    targetRoll += 0.16;
  } else if (emotion === 'fierce' || emotion === 'check') {
    targetLean = Math.max(targetLean, 0.38);
    targetPitch -= 0.06;
  } else if (emotion === 'surprised') {
    targetLean = Math.max(targetLean, 0.28);
    targetPitch -= 0.08;
  }

  // Integrate via critically-damped 2nd-order springs (zero stutter, silky studio feel!)
  const [eyeGazeX, eyeGazeXVel] = stepDampedSpring(
    state.eyeGazeX,
    state.eyeGazeXVel,
    clamp(targetYaw * 1.12, -1, 1),
    9.5,
    dt,
  );
  const [eyeGazeY, eyeGazeYVel] = stepDampedSpring(
    state.eyeGazeY,
    state.eyeGazeYVel,
    clamp(targetPitch * 1.12, -1, 1),
    9.5,
    dt,
  );
  const [headYaw, headYawVel] = stepDampedSpring(
    state.headYaw,
    state.headYawVel,
    clamp(targetYaw, -1, 1),
    4.6,
    dt,
  );
  const [headPitch, headPitchVel] = stepDampedSpring(
    state.headPitch,
    state.headPitchVel,
    clamp(targetPitch, -1, 1),
    4.8,
    dt,
  );
  const [headRoll, headRollVel] = stepDampedSpring(
    state.headRoll,
    state.headRollVel,
    clamp(targetRoll, -1, 1),
    4.2,
    dt,
  );
  const [leanZoom, leanZoomVel] = stepDampedSpring(
    state.leanZoom,
    state.leanZoomVel,
    clamp(targetLean, 0, 1),
    3.8,
    dt,
  );

  // 4. Natural Stochastic Eyelid Blink
  let blink = 0;
  if (blinkTimer > 0) {
    blinkTimer = Math.max(0, blinkTimer - dt);
    const phase = 1 - blinkTimer / 0.16;
    blink = Math.sin(phase * Math.PI);
  } else if (t >= nextBlinkAt) {
    blinkTimer = 0.16;
    const jitter = ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1;
    nextBlinkAt = t + 3.0 + jitter * 1.9;
  }

  // 5. Organic Breathing Cycle
  const breathFreq = input.isSpeaking ? 2.05 : emotion === 'check' ? 1.9 : 1.38;
  const breath = 0.5 + 0.5 * Math.sin(t * breathFreq);

  return {
    headYaw,
    headYawVel,
    headPitch,
    headPitchVel,
    headRoll,
    headRollVel,
    eyeGazeX,
    eyeGazeXVel,
    eyeGazeY,
    eyeGazeYVel,
    mouthOpen,
    mouthWidth,
    browFurrow,
    browRaise,
    smile,
    eyeNarrow,
    dramaLight,
    blink,
    breath,
    leanZoom,
    leanZoomVel,
    impactPulse,
    voiceEnergy,
    lastFocusSeq,
    nextBlinkAt,
    blinkTimer,
  };
}
