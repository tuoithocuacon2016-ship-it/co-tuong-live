import test from 'node:test';
import assert from 'node:assert/strict';
import type { KillPatternId } from '../engine/patterns';
import {
  boardCoordToCinemaWorld,
  createInitialCinemaDirector,
  killPatternPresentation,
  resolveCinemaVisualPlate,
  resolveKillPatternAudioCue,
  stepCinemaDirector,
} from './cinemaDirector';

test('cinemaDirector starts on wide_pavilion establishing shot and auto-cuts cleanly over time', () => {
  const dir = createInitialCinemaDirector();
  const first = stepCinemaDirector(dir, {
    dt: 0.05,
    requestedAngle: 'auto',
    emotion: 'amused',
    isSpeaking: false,
    botThinking: false,
    inCheck: false,
    moveEvent: null,
    actionCue: null,
  });

  assert.equal(first.camera.shot, 'wide_pavilion');
  assert.ok(first.camera.shotLabelVi.includes('Hồ Sen'));

  // Advance ~8.2s -> auto director should smoothly rotate to next film shot
  let latest = first;
  for (let i = 0; i < 82; i++) {
    latest = stepCinemaDirector(dir, {
      dt: 0.1,
      requestedAngle: 'auto',
      emotion: 'calm',
      isSpeaking: false,
      botThinking: false,
      inCheck: false,
      moveEvent: null,
      actionCue: null,
    });
  }
  assert.notEqual(latest.camera.shot, 'wide_pavilion');
});

test('moveEvent choreographs articulated piece pickup, arc carry, and camera cut to hands/over-shoulder', () => {
  const dir = createInitialCinemaDirector();
  const moveEvent = {
    side: 'black' as const,
    from: { row: 2, col: 7 },
    to: { row: 2, col: 4 },
    captured: false,
    inCheck: false,
    pieceId: 'b_cannon_2',
    seq: 1,
  };

  const onMove = stepCinemaDirector(dir, {
    dt: 0.05,
    requestedAngle: 'auto',
    emotion: 'amused',
    isSpeaking: false,
    botThinking: false,
    inCheck: false,
    moveEvent,
    actionCue: null,
  });

  assert.equal(onMove.camera.shot, 'over_shoulder');
  assert.equal(onMove.bridePose.action, 'move_piece');

  // Mid-move (t ~ 0.75s of 1.55s): bride's arm is fully extended and carrying piece in mid-air
  let mid = onMove;
  for (let i = 0; i < 14; i++) {
    mid = stepCinemaDirector(dir, {
      dt: 0.05,
      requestedAngle: 'auto',
      emotion: 'amused',
      isSpeaking: false,
      botThinking: false,
      inCheck: false,
      moveEvent,
      actionCue: null,
    });
  }
  assert.equal(mid.bridePose.rightReachWeight, 1);
  assert.ok(mid.bridePose.pieceLiftedProgress > 0.2 && mid.bridePose.pieceLiftedProgress < 0.9);
  const [fromX] = boardCoordToCinemaWorld(moveEvent.from);
  const [toX] = boardCoordToCinemaWorld(moveEvent.to);
  assert.ok(
    mid.bridePose.rightReachTargetX < fromX && mid.bridePose.rightReachTargetX > toX,
    'Hand should smoothly arc from source col 7 toward destination col 4',
  );
});

test('sip_tea and tease action cues drive full teacup handoff and playful opponent reaction', () => {
  const dir = createInitialCinemaDirector();

  // Trigger sip_tea for bride
  let res = stepCinemaDirector(dir, {
    dt: 0.05,
    requestedAngle: 'auto',
    emotion: 'calm',
    isSpeaking: false,
    botThinking: false,
    inCheck: false,
    moveEvent: null,
    actionCue: { type: 'sip_tea', actor: 'bride', seq: 1 },
  });
  assert.equal(res.bridePose.action, 'sip_tea');
  assert.equal(res.camera.shot, 'medium_bride');

  // Advance ~2.0s into the sip -> cup must be attached to hand & elevated to lips (teaSipPhase === 1)
  for (let i = 0; i < 40; i++) {
    res = stepCinemaDirector(dir, {
      dt: 0.05,
      requestedAngle: 'auto',
      emotion: 'calm',
      isSpeaking: false,
      botThinking: false,
      inCheck: false,
      moveEvent: null,
      actionCue: { type: 'sip_tea', actor: 'bride', seq: 1 },
    });
  }
  assert.equal(res.bridePose.cupAttachedToHand, true);
  assert.equal(res.bridePose.teaSipPhase, 1);

  // Trigger tease -> bride raises crimson fan & leans forward while groom reacts amusedly!
  let teaseRes = stepCinemaDirector(dir, {
    dt: 0.05,
    requestedAngle: 'auto',
    emotion: 'amused',
    isSpeaking: true,
    botThinking: false,
    inCheck: false,
    moveEvent: null,
    actionCue: { type: 'tease', actor: 'bride', seq: 2 },
  });
  for (let i = 0; i < 28; i++) {
    teaseRes = stepCinemaDirector(dir, {
      dt: 0.05,
      requestedAngle: 'auto',
      emotion: 'amused',
      isSpeaking: true,
      botThinking: false,
      inCheck: false,
      moveEvent: null,
      actionCue: { type: 'tease', actor: 'bride', seq: 2 },
    });
  }
  assert.equal(teaseRes.bridePose.action, 'tease');
  assert.equal(teaseRes.groomPose.action, 'react_amused');
  assert.ok(teaseRes.bridePose.teaseFanPhase > 0.7);
  assert.ok(teaseRes.bridePose.torsoLeanForward > 0.2);
});

test('resolveCinemaVisualPlate routes move_piece, sip_tea, tease, Live2D speaking, and manual overrides', () => {
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'auto',
      directorShot: 'wide_pavilion',
      brideAction: 'move_piece',
      groomAction: 'idle',
      isSpeaking: true,
    }),
    'table_hands',
  );
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'auto',
      directorShot: 'wide_pavilion',
      brideAction: 'sip_tea',
      groomAction: 'idle',
      isSpeaking: false,
    }),
    'medium_bride',
  );
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'auto',
      directorShot: 'wide_pavilion',
      brideAction: 'tease',
      groomAction: 'react_amused',
      isSpeaking: true,
    }),
    'over_shoulder',
  );
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'auto',
      directorShot: 'wide_pavilion',
      brideAction: 'idle',
      groomAction: 'idle',
      isSpeaking: true,
    }),
    'closeup_cgi',
  );
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'wide_pavilion',
      directorShot: 'over_shoulder',
      brideAction: 'tease',
      groomAction: 'idle',
      isSpeaking: true,
    }),
    'wide_pavilion',
  );
});

test('every detected sat phap has a presentation cue, and a quiet shape never sounds a check', () => {
  const ids: KillPatternId[] = [
    'dai_dao_hoach_tam',
    'ma_hau_phao',
    'trong_phao',
    'be_cung',
    'bach_kiem_tuong',
    'bat_hoang_ma',
    'thiet_mon_thuyen',
    'thien_dia_phao',
    'hai_de_lao_nguyet',
    'giap_xa_phao',
    'song_xa_thac',
    'ngo_tao_ma',
    'qua_giac_ma',
    'dieu_ngu_ma',
    'phao_nan_dan_sa',
    'tam_tu_quy_bien',
    'khong_dau_phao',
  ];
  const shots = new Set(['wide_pavilion', 'medium_bride', 'over_shoulder', 'table_hands', 'dramatic_orbit', 'closeup_cgi']);
  const audio = new Set(['check', 'capture', 'guzheng']);
  for (const id of ids) {
    const cue = killPatternPresentation(id);
    assert.ok(shots.has(cue.shot), `${id} has no usable shot`);
    assert.ok(audio.has(cue.audio), `${id} has no usable audio`);
  }
  assert.deepEqual(killPatternPresentation('ngo_tao_ma'), {
    shot: 'dramatic_orbit',
    audio: 'check',
  });
  assert.equal(resolveKillPatternAudioCue('ngo_tao_ma', true), 'check');
  assert.equal(resolveKillPatternAudioCue('ngo_tao_ma', false), null);
  assert.equal(resolveKillPatternAudioCue('tam_tu_quy_bien', false), 'capture');
});

test('a pattern move gets its own auto shot, while a manual camera choice still wins', () => {
  const dir = createInitialCinemaDirector();
  const moveEvent = {
    side: 'black' as const,
    from: { row: 7, col: 0 },
    to: { row: 7, col: 2 },
    captured: false,
    inCheck: false,
    pieceId: 'b_chariot_1',
    killPatternId: 'tam_tu_quy_bien' as KillPatternId,
    seq: 1,
  };
  const onMove = stepCinemaDirector(dir, {
    dt: 0.05,
    requestedAngle: 'auto',
    emotion: 'calm',
    isSpeaking: false,
    botThinking: false,
    inCheck: false,
    moveEvent,
    actionCue: null,
  });
  assert.equal(onMove.camera.shot, 'wide_pavilion');
  assert.equal(onMove.movePresentationShot, 'wide_pavilion');
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'auto',
      directorShot: onMove.camera.shot,
      brideAction: onMove.bridePose.action,
      groomAction: onMove.groomPose.action,
      isSpeaking: false,
      movePresentationShot: onMove.movePresentationShot,
    }),
    'wide_pavilion',
  );
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'table_hands',
      directorShot: onMove.camera.shot,
      brideAction: onMove.bridePose.action,
      groomAction: onMove.groomPose.action,
      isSpeaking: false,
      movePresentationShot: onMove.movePresentationShot,
    }),
    'table_hands',
  );

  const closeupDir = createInitialCinemaDirector();
  const closeup = stepCinemaDirector(closeupDir, {
    dt: 0.05,
    requestedAngle: 'auto',
    emotion: 'fierce',
    isSpeaking: false,
    botThinking: false,
    inCheck: true,
    moveEvent: { ...moveEvent, inCheck: true, killPatternId: 'ma_hau_phao', seq: 1 },
    actionCue: null,
  });
  assert.equal(closeup.movePresentationShot, 'closeup_cgi');
  assert.equal(
    resolveCinemaVisualPlate({
      requestedAngle: 'auto',
      directorShot: closeup.camera.shot,
      brideAction: closeup.bridePose.action,
      groomAction: closeup.groomPose.action,
      isSpeaking: false,
      movePresentationShot: closeup.movePresentationShot,
    }),
    'closeup_cgi',
  );
});

