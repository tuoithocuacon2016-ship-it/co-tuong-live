/**
 * Pure, decoupled Movie Film Director & Full-Body Character Action Choreography Engine
 * for the Moonlit Lotus-Lake Ancient Pavilion 3D Stage.
 *
 * Zero Three.js / DOM dependencies so every camera cut, piece-lift trajectory,
 * tea-sip cup handoff, and playful teasing gesture can be unit-tested deterministically.
 */

import { Coord, Side } from '../engine/xiangqi';
import { HostEmotion } from './portraitKinematics';

export type CinemaCameraAngle =
  | 'auto'
  | 'wide_pavilion'
  | 'medium_bride'
  | 'over_shoulder'
  | 'table_hands'
  | 'dramatic_orbit'
  | 'closeup_cgi';

export type ResolvedCinemaShot = Exclude<CinemaCameraAngle, 'auto' | 'closeup_cgi'>;

export type CharacterActionType =
  | 'idle'
  | 'move_piece'
  | 'sip_tea'
  | 'tease'
  | 'think_fan'
  | 'check_dramatic'
  | 'react_amused';

export interface MoveChoreoPayload {
  side: Side;
  from: Coord;
  to: Coord;
  captured: boolean;
  inCheck: boolean;
  pieceId: string;
  seq: number;
}

export interface ActionCuePayload {
  type: 'sip_tea' | 'tease' | 'think_fan' | 'closeup_talk' | 'groom_react';
  actor: 'bride' | 'groom';
  stageDirectionVi?: string;
  seq: number;
}

export interface CharacterActionState {
  type: CharacterActionType;
  elapsed: number;
  duration: number;
  fromCoord: Coord | null;
  toCoord: Coord | null;
  pieceId: string | null;
}

export interface CharacterPoseSample {
  action: CharacterActionType;
  actionProgress: number; // 0..1
  torsoLeanForward: number; // radians (+ leans toward table)
  torsoTwistY: number; // radians
  headYaw: number; // radians
  headPitch: number; // radians
  headRoll: number; // radians
  rightReachWeight: number; // 0..1 (reaches to chess board target)
  rightReachTargetX: number; // world X on table
  rightReachTargetY: number; // world Y above table
  rightReachTargetZ: number; // world Z on table
  teaSipPhase: number; // 0..1 (cup lifted -> sip -> placed back)
  cupAttachedToHand: boolean;
  teaseFanPhase: number; // 0..1 (left fan raised playfully + right beckon)
  fanOpenAmount: number; // 0..1
  legSway: number; // subtle seated knee/foot life motion
  pieceLiftedProgress: number; // -1 if not carrying, else 0..1 along arc
}

export interface CameraShotSample {
  shot: ResolvedCinemaShot;
  shotLabelVi: string;
  actionLabelVi: string;
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  cutSharp: boolean;
}

export interface CinemaDirectorState {
  elapsed: number;
  activeShot: ResolvedCinemaShot;
  shotTimer: number;
  autoCycleIdx: number;
  lastMoveSeq: number;
  lastCueSeq: number;
  nextAmbientActionAt: number;
  brideAction: CharacterActionState;
  groomAction: CharacterActionState;
  activeStageDirectionVi: string | null;
  stageDirectionExpiresAt: number;
  lastCutWasSharp: boolean;
}

export const CINEMA_SHOT_LABELS_VI: Record<CinemaCameraAngle, string> = {
  auto: 'Đạo Diễn',
  wide_pavilion: 'Toàn Cảnh Hồ Sen',
  medium_bride: 'Thưởng Trà Hồ Sen',
  over_shoulder: 'Qua Vai Chọc Ghẹo',
  table_hands: 'Cận Tay Nhấc Quân',
  dramatic_orbit: 'Góc Tân Lang',
  closeup_cgi: 'Cận Mặt Live2D',
};

export const ACTION_LABELS_VI: Record<CharacterActionType, string> = {
  idle: 'Thưởng trăng đánh cờ',
  move_piece: 'Đang nhấc quân đi cờ',
  sip_tea: 'Đang thưởng trà hoa sen',
  tease: 'Đang chọc ghẹo đối phương',
  think_fan: 'Phe phẩy quạt suy tính',
  check_dramatic: 'Ra đòn chiếu tướng!',
  react_amused: 'Cười duyên đối đáp',
};

// Table grid metrics in PavilionCinemaStage world space
export const CINEMA_TABLE_Y = 0.78;
export const CINEMA_BOARD_TOP_Y = CINEMA_TABLE_Y + 0.055;
export const CINEMA_CELL_W = 0.165;
export const CINEMA_CELL_D = 0.165;

export function boardCoordToCinemaWorld(coord: Coord): [number, number, number] {
  const x = (coord.col - 4) * CINEMA_CELL_W;
  const z = (coord.row - 4.5) * CINEMA_CELL_D;
  return [x, CINEMA_BOARD_TOP_Y, z];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function createInitialCinemaDirector(): CinemaDirectorState {
  return {
    elapsed: 0,
    activeShot: 'wide_pavilion',
    shotTimer: 0,
    autoCycleIdx: 0,
    lastMoveSeq: 0,
    lastCueSeq: 0,
    nextAmbientActionAt: 5.2,
    brideAction: {
      type: 'idle',
      elapsed: 0,
      duration: 0,
      fromCoord: null,
      toCoord: null,
      pieceId: null,
    },
    groomAction: {
      type: 'idle',
      elapsed: 0,
      duration: 0,
      fromCoord: null,
      toCoord: null,
      pieceId: null,
    },
    activeStageDirectionVi: null,
    stageDirectionExpiresAt: 0,
    lastCutWasSharp: false,
  };
}

function startAction(
  target: CharacterActionState,
  type: CharacterActionType,
  duration: number,
  extra?: { fromCoord?: Coord | null; toCoord?: Coord | null; pieceId?: string | null },
) {
  target.type = type;
  target.elapsed = 0;
  target.duration = duration;
  target.fromCoord = extra?.fromCoord ?? null;
  target.toCoord = extra?.toCoord ?? null;
  target.pieceId = extra?.pieceId ?? null;
}

const AUTO_CALM_ROTATION: ResolvedCinemaShot[] = [
  'wide_pavilion',
  'medium_bride',
  'over_shoulder',
  'wide_pavilion',
  'dramatic_orbit',
];

export interface CinemaStepInput {
  dt: number;
  requestedAngle: CinemaCameraAngle;
  emotion: HostEmotion;
  isSpeaking: boolean;
  botThinking: boolean;
  inCheck: boolean;
  moveEvent: MoveChoreoPayload | null;
  actionCue: ActionCuePayload | null;
}

export interface CinemaStepResult {
  camera: CameraShotSample;
  bridePose: CharacterPoseSample;
  groomPose: CharacterPoseSample;
}

function evaluateCharacterPose(
  state: CharacterActionState,
  elapsed: number,
  isBride: boolean,
  emotion: HostEmotion,
  isSpeaking: boolean,
  botThinking: boolean,
): CharacterPoseSample {
  const sideSign = isBride ? 1 : -1;
  const p = state.duration > 0 ? clamp01(state.elapsed / state.duration) : 0;

  let torsoLeanForward = 0.05 + Math.sin(elapsed * 1.45 + (isBride ? 0 : 1.7)) * 0.015;
  let torsoTwistY = Math.sin(elapsed * 0.65 + (isBride ? 0 : 2.1)) * 0.03;
  let headYaw = Math.sin(elapsed * 0.72 + (isBride ? 0.3 : 2.4)) * 0.06;
  let headPitch = 0.14 + Math.cos(elapsed * 1.1) * 0.02;
  let headRoll = Math.sin(elapsed * 0.8 + (isBride ? 0 : 1.3)) * 0.025;

  let rightReachWeight = 0;
  let rightReachTargetX = 0;
  let rightReachTargetY = CINEMA_BOARD_TOP_Y + 0.12;
  let rightReachTargetZ = 0;
  let teaSipPhase = 0;
  let cupAttachedToHand = false;
  let teaseFanPhase = 0;
  let fanOpenAmount = isBride ? 0.25 : 0;
  let pieceLiftedProgress = -1;

  if (isBride && isSpeaking) {
    headPitch += Math.sin(elapsed * 5.2) * 0.035;
    headRoll += Math.sin(elapsed * 2.5) * 0.04;
    torsoLeanForward += 0.04;
  }

  if (state.type === 'move_piece' && state.fromCoord && state.toCoord) {
    // 0..0.28 reach to source piece -> 0.28..0.72 lift & arc to destination -> 0.72..1.0 withdraw gracefully
    const [fx, fy, fz] = boardCoordToCinemaWorld(state.fromCoord);
    const [tx, ty, tz] = boardCoordToCinemaWorld(state.toCoord);

    if (p < 0.28) {
      const k = smoothstep(0, 0.28, p);
      rightReachWeight = k;
      rightReachTargetX = fx;
      rightReachTargetY = fy + 0.06 + (1 - k) * 0.18;
      rightReachTargetZ = fz;
      torsoLeanForward += k * 0.22;
      headPitch = 0.34 * k + headPitch * (1 - k);
    } else if (p < 0.74) {
      const moveT = smoothstep(0.28, 0.72, p);
      rightReachWeight = 1;
      pieceLiftedProgress = moveT;
      rightReachTargetX = fx + (tx - fx) * moveT;
      rightReachTargetZ = fz + (tz - fz) * moveT;
      rightReachTargetY = fy + 0.05 + Math.sin(moveT * Math.PI) * 0.24;
      torsoLeanForward += 0.24;
      torsoTwistY += (rightReachTargetX * sideSign) * 0.25;
      headPitch = 0.36;
      headYaw = -rightReachTargetX * sideSign * 0.28;
    } else {
      const ret = smoothstep(0.74, 1.0, p);
      rightReachWeight = 1 - ret;
      rightReachTargetX = tx;
      rightReachTargetY = ty + 0.05 + ret * 0.18;
      rightReachTargetZ = tz;
      torsoLeanForward += (1 - ret) * 0.2;
      headPitch = 0.32 * (1 - ret) + 0.12 * ret;
    }
  } else if (state.type === 'sip_tea') {
    // 0..0.24 reach cup -> 0.24..0.52 bring to lips -> 0.52..0.72 savor sip -> 0.72..1.0 set cup back on saucer
    if (p < 0.24) {
      teaSipPhase = smoothstep(0, 0.24, p) * 0.35;
      cupAttachedToHand = p > 0.18;
      torsoLeanForward += 0.08 * smoothstep(0, 0.24, p);
    } else if (p < 0.52) {
      teaSipPhase = 0.35 + smoothstep(0.24, 0.52, p) * 0.65;
      cupAttachedToHand = true;
      headPitch = 0.04;
      torsoLeanForward += 0.05;
    } else if (p < 0.72) {
      teaSipPhase = 1.0;
      cupAttachedToHand = true;
      headPitch = -0.11; // gentle upward tilt while sipping warm lotus tea!
      headRoll = isBride ? 0.06 : -0.05;
    } else {
      const back = smoothstep(0.72, 1.0, p);
      teaSipPhase = 1.0 - back;
      cupAttachedToHand = p < 0.86;
      headPitch = 0.08 * back;
      torsoLeanForward += 0.06 * (1 - back);
    }
    fanOpenAmount = isBride ? 0.45 : 0;
  } else if (state.type === 'tease') {
    // Playful bridal teasing: lean forward coyly, unfurl crimson silk fan near cheek, tilt head & beckon!
    const env = Math.sin(p * Math.PI);
    teaseFanPhase = env;
    fanOpenAmount = isBride ? 0.35 + env * 0.65 : 0;
    torsoLeanForward += env * 0.24;
    headPitch = 0.04 - env * 0.08;
    headRoll = (isBride ? 1 : -1) * (0.14 * env + Math.sin(elapsed * 4.5) * 0.05 * env);
    headYaw = Math.sin(elapsed * 3.2) * 0.12 * env;
  } else if (state.type === 'check_dramatic') {
    const env = Math.sin(p * Math.PI);
    torsoLeanForward += env * 0.16;
    headPitch = -0.04 * env;
    fanOpenAmount = isBride ? 0.85 : 0;
    teaseFanPhase = env * 0.55;
  } else if (state.type === 'react_amused') {
    // Opponent reacts amusedly to being teased: leans back slightly, shakes head gently with a grin
    const env = Math.sin(p * Math.PI);
    torsoLeanForward -= env * 0.11;
    headYaw = Math.sin(p * Math.PI * 3.0) * 0.16 * env;
    headPitch = -0.05 * env;
  } else if (state.type === 'think_fan' || (isBride && botThinking)) {
    fanOpenAmount = isBride ? 0.82 : 0;
    teaseFanPhase = 0.32 + Math.sin(elapsed * 4.8) * 0.12;
    torsoLeanForward += 0.09;
    headPitch = 0.25;
    headRoll = 0.06;
  } else if (isBride && emotion === 'amused') {
    fanOpenAmount = 0.55;
    headRoll += 0.05;
  }

  const legSway = Math.sin(elapsed * 1.15 + (isBride ? 0.4 : 2.2)) * 0.022;

  return {
    action: state.type,
    actionProgress: p,
    torsoLeanForward,
    torsoTwistY,
    headYaw,
    headPitch,
    headRoll,
    rightReachWeight,
    rightReachTargetX,
    rightReachTargetY,
    rightReachTargetZ,
    teaSipPhase,
    cupAttachedToHand,
    teaseFanPhase,
    fanOpenAmount,
    legSway,
    pieceLiftedProgress,
  };
}

function getShotCameraTransform(
  shot: ResolvedCinemaShot,
  elapsed: number,
  brideMoving: boolean,
): { pos: [number, number, number]; target: [number, number, number]; fov: number } {
  switch (shot) {
    case 'wide_pavilion': {
      // Iconic establishing movie shot: Luminous Full Moon + Lotus Lake + Ancient Pavilion + BOTH unobstructed full-body seated players!
      const driftX = Math.sin(elapsed * 0.22) * 0.28;
      const driftY = Math.cos(elapsed * 0.18) * 0.06;
      return {
        pos: [3.45 + driftX, 1.98 + driftY, 2.75],
        target: [-0.25, 1.24, -0.35],
        fov: 44,
      };
    }
    case 'medium_bride': {
      // Romantic film medium-shot of Tân Nương Áo Đỏ seated in full bridal robes with glowing moon & lotus lanterns behind
      const swayX = Math.sin(elapsed * 0.34) * 0.14;
      return {
        pos: [0.68 + swayX, 1.62, 0.78],
        target: [-0.08, 1.28, -1.72],
        fov: 38,
      };
    }
    case 'over_shoulder': {
      // Classic cinema over-the-shoulder duel framing from behind Tân Lang looking across table to Tân Nương & moonlit lotus pond
      const sideBias = brideMoving ? -1.12 : 1.18;
      const breathe = Math.sin(elapsed * 0.35) * 0.06;
      return {
        pos: [sideBias, 1.78 + breathe, 2.52],
        target: [-0.12, 1.22, -1.55],
        fov: 40,
      };
    }
    case 'table_hands': {
      // Dramatic low table-level cinema shot showcasing articulated hands lifting Xiangqi pieces & porcelain teacups
      const pan = Math.sin(elapsed * 0.45) * 0.18;
      return {
        pos: [1.75, 1.42, 0.38 + pan],
        target: [0, 0.96, -0.15],
        fov: 38,
      };
    }
    case 'dramatic_orbit': {
      // Sweeping cinema crane around the moonlit pavilion over the lotus pond
      const angle = 0.62 + elapsed * 0.22;
      const radius = 4.35;
      return {
        pos: [Math.sin(angle) * radius, 2.05 + Math.sin(elapsed * 0.5) * 0.14, Math.cos(angle) * radius],
        target: [0, 1.18, -0.2],
        fov: 42,
      };
    }
  }
}

export function stepCinemaDirector(
  state: CinemaDirectorState,
  input: CinemaStepInput,
): CinemaStepResult {
  const dt = Math.min(0.1, Math.max(0.001, input.dt));
  state.elapsed += dt;
  state.shotTimer += dt;
  state.lastCutWasSharp = false;

  // 1. Advance active character actions and reset to idle on completion
  for (const act of [state.brideAction, state.groomAction]) {
    if (act.type !== 'idle') {
      act.elapsed += dt;
      if (act.elapsed >= act.duration) {
        act.type = 'idle';
        act.elapsed = 0;
        act.duration = 0;
        act.fromCoord = null;
        act.toCoord = null;
        act.pieceId = null;
      }
    }
  }

  // 2. React to newly committed chess move (articulated arm picks up & moves the real 3D piece!)
  if (input.moveEvent && input.moveEvent.seq !== state.lastMoveSeq) {
    state.lastMoveSeq = input.moveEvent.seq;
    state.activeStageDirectionVi = null;
    const isBrideMove = input.moveEvent.side === 'black';
    const actor = isBrideMove ? state.brideAction : state.groomAction;
    startAction(actor, 'move_piece', 1.55, {
      fromCoord: input.moveEvent.from,
      toCoord: input.moveEvent.to,
      pieceId: input.moveEvent.pieceId,
    });

    if (input.moveEvent.inCheck) {
      if (isBrideMove) {
        startAction(state.groomAction, 'react_amused', 1.8);
      } else {
        startAction(state.brideAction, 'tease', 2.0);
      }
    }

    if (input.requestedAngle === 'auto') {
      state.activeShot = input.moveEvent.inCheck
        ? 'dramatic_orbit'
        : isBrideMove
          ? 'over_shoulder'
          : 'table_hands';
      state.shotTimer = 0;
      state.lastCutWasSharp = true;
    }
  }

  // 3. React to explicit movie action cue buttons & choreographed dialogue gestures
  if (input.actionCue && input.actionCue.seq !== state.lastCueSeq) {
    state.lastCueSeq = input.actionCue.seq;
    const isBride = input.actionCue.actor === 'bride';
    const actor = isBride ? state.brideAction : state.groomAction;
    const other = isBride ? state.groomAction : state.brideAction;

    if (input.actionCue.stageDirectionVi) {
      state.activeStageDirectionVi = input.actionCue.stageDirectionVi;
      state.stageDirectionExpiresAt = state.elapsed + 4.8;
    }

    if (input.actionCue.type === 'sip_tea') {
      startAction(actor, 'sip_tea', 3.8);
      if (input.requestedAngle === 'auto') {
        state.activeShot = isBride ? 'medium_bride' : 'wide_pavilion';
        state.shotTimer = 0;
        state.lastCutWasSharp = true;
      }
    } else if (input.actionCue.type === 'tease') {
      startAction(actor, 'tease', 3.6);
      startAction(other, 'react_amused', 3.0);
      if (input.requestedAngle === 'auto') {
        state.activeShot = 'over_shoulder';
        state.shotTimer = 0;
        state.lastCutWasSharp = true;
      }
    } else if (input.actionCue.type === 'groom_react') {
      startAction(state.groomAction, 'react_amused', 3.2);
      state.brideAction.type = 'idle';
      state.brideAction.elapsed = 0;
      state.brideAction.duration = 0;
      if (input.requestedAngle === 'auto') {
        state.activeShot = 'dramatic_orbit';
        state.shotTimer = 0;
        state.lastCutWasSharp = true;
      }
    } else if (input.actionCue.type === 'closeup_talk') {
      // Clear blocking gesture so Live2D lip-sync close-up takes center stage cleanly!
      state.brideAction.type = 'idle';
      state.brideAction.elapsed = 0;
      state.brideAction.duration = 0;
      state.groomAction.type = 'idle';
      state.groomAction.elapsed = 0;
      state.groomAction.duration = 0;
    } else {
      startAction(actor, 'think_fan', 3.2);
    }
    state.nextAmbientActionAt = state.elapsed + 8.5;
  }

  if (state.activeStageDirectionVi && state.elapsed >= state.stageDirectionExpiresAt) {
    state.activeStageDirectionVi = null;
  }

  // 4. Organic movie ambient life: alternate graceful tea-sips & playful teasing during calm beats!
  if (
    state.elapsed >= state.nextAmbientActionAt &&
    state.brideAction.type === 'idle' &&
    state.groomAction.type === 'idle' &&
    !input.botThinking
  ) {
    const cycle = Math.floor(state.elapsed / 7) % 3;
    if (cycle === 0) {
      startAction(state.brideAction, 'sip_tea', 3.5);
    } else if (cycle === 1) {
      startAction(state.brideAction, 'tease', 3.0);
      startAction(state.groomAction, 'react_amused', 2.6);
    } else {
      startAction(state.groomAction, 'sip_tea', 3.4);
    }
    state.nextAmbientActionAt = state.elapsed + 8.2;
  }

  // 5. Resolve Camera Angle (manual selection or Film Director AI auto-cutting)
  let resolvedShot: ResolvedCinemaShot;
  if (input.requestedAngle !== 'auto' && input.requestedAngle !== 'closeup_cgi') {
    if (state.activeShot !== input.requestedAngle) {
      state.activeShot = input.requestedAngle;
      state.shotTimer = 0;
      state.lastCutWasSharp = true;
    }
    resolvedShot = input.requestedAngle;
  } else {
    // Auto director gently cuts between establishing moonlit lake, bride medium, over-shoulder & orbit
    if (input.inCheck && state.shotTimer > 5.0) {
      state.activeShot = 'dramatic_orbit';
      state.shotTimer = 0;
      state.lastCutWasSharp = true;
    } else if (state.shotTimer >= 7.8) {
      state.autoCycleIdx = (state.autoCycleIdx + 1) % AUTO_CALM_ROTATION.length;
      state.activeShot = AUTO_CALM_ROTATION[state.autoCycleIdx];
      state.shotTimer = 0;
      state.lastCutWasSharp = true;
    }
    resolvedShot = state.activeShot;
  }

  const cam = getShotCameraTransform(
    resolvedShot,
    state.elapsed,
    state.brideAction.type === 'move_piece',
  );

  const bridePose = evaluateCharacterPose(
    state.brideAction,
    state.elapsed,
    true,
    input.emotion,
    input.isSpeaking,
    input.botThinking,
  );

  const groomPose = evaluateCharacterPose(
    state.groomAction,
    state.elapsed,
    false,
    'calm',
    false,
    false,
  );

  const primaryAction: CharacterActionType =
    state.brideAction.type !== 'idle'
      ? state.brideAction.type
      : state.groomAction.type !== 'idle'
        ? state.groomAction.type
        : input.botThinking
          ? 'think_fan'
          : 'idle';

  return {
    camera: {
      shot: resolvedShot,
      shotLabelVi: CINEMA_SHOT_LABELS_VI[resolvedShot],
      actionLabelVi: state.activeStageDirectionVi ?? ACTION_LABELS_VI[primaryAction],
      pos: cam.pos,
      target: cam.target,
      fov: cam.fov,
      cutSharp: state.lastCutWasSharp,
    },
    bridePose,
    groomPose,
  };
}

export type CinemaVisualPlate = Exclude<CinemaCameraAngle, 'auto'>;

/**
 * Resolves which AAA CGI cinema visual plate (5 moonlit lotus-lake pavilion film shots
 * OR the real-time WebGL Live2D close-up) should be on-air right now.
 */
export function resolveCinemaVisualPlate(params: {
  requestedAngle: CinemaCameraAngle;
  directorShot: ResolvedCinemaShot;
  brideAction: CharacterActionType;
  groomAction: CharacterActionType;
  isSpeaking: boolean;
}): CinemaVisualPlate {
  if (params.requestedAngle !== 'auto') {
    return params.requestedAngle;
  }
  if (params.brideAction === 'move_piece' || params.groomAction === 'move_piece') {
    return 'table_hands';
  }
  if (params.brideAction === 'sip_tea') {
    return 'medium_bride';
  }
  if (params.brideAction === 'tease') {
    return 'over_shoulder';
  }
  if (params.groomAction === 'react_amused' || params.groomAction === 'sip_tea') {
    return 'dramatic_orbit';
  }
  if (params.isSpeaking) {
    return 'closeup_cgi';
  }
  return params.directorShot;
}

