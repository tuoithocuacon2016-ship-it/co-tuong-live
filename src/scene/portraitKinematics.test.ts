import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialPortraitKinematics,
  stepPortraitKinematics,
} from './portraitKinematics';

test('character turns head & eye gaze left vs right following Xiangqi board columns', () => {
  let leftState = createInitialPortraitKinematics();
  for (let i = 0; i < 45; i++) {
    leftState = stepPortraitKinematics(leftState, {
      dt: 0.03,
      elapsed: i * 0.03,
      isSpeaking: false,
      voiceLevel: 0,
      botThinking: false,
      inCheck: false,
      isFierce: false,
      boardFocus: { row: 7, col: 0, side: 'red', seq: 1 },
    });
  }
  assert.ok(leftState.headYaw < -0.35, `Expected negative left yaw, got ${leftState.headYaw}`);
  assert.ok(leftState.eyeGazeX < -0.4, `Expected negative left eye gaze, got ${leftState.eyeGazeX}`);

  let rightState = createInitialPortraitKinematics();
  for (let i = 0; i < 45; i++) {
    rightState = stepPortraitKinematics(rightState, {
      dt: 0.03,
      elapsed: i * 0.03,
      isSpeaking: false,
      voiceLevel: 0,
      botThinking: false,
      inCheck: false,
      isFierce: false,
      boardFocus: { row: 7, col: 8, side: 'red', seq: 2 },
    });
  }
  assert.ok(rightState.headYaw > 0.35, `Expected positive right yaw, got ${rightState.headYaw}`);
  assert.ok(rightState.eyeGazeX > 0.4, `Expected positive right eye gaze, got ${rightState.eyeGazeX}`);
});

test('lip-sync mouth opens dynamically with voice amplitude and closes cleanly when silent', () => {
  let state = createInitialPortraitKinematics();
  for (let i = 0; i < 22; i++) {
    state = stepPortraitKinematics(state, {
      dt: 0.025,
      elapsed: i * 0.025,
      isSpeaking: true,
      voiceLevel: 0.78,
      botThinking: false,
      inCheck: false,
      isFierce: false,
      boardFocus: { row: 7, col: 4, side: 'red', seq: 1 },
    });
  }
  assert.ok(state.mouthOpen > 0.55, `Expected mouth open > 0.55 while speaking, got ${state.mouthOpen}`);
  assert.ok(state.leanZoom > 0.16, `Expected forward speaking engagement lean, got ${state.leanZoom}`);

  for (let i = 0; i < 38; i++) {
    state = stepPortraitKinematics(state, {
      dt: 0.025,
      elapsed: 1 + i * 0.025,
      isSpeaking: false,
      voiceLevel: 0,
      botThinking: false,
      inCheck: false,
      isFierce: false,
      boardFocus: { row: 7, col: 4, side: 'red', seq: 1 },
    });
  }
  assert.ok(state.mouthOpen < 0.03, `Expected mouth closed < 0.03 when silent, got ${state.mouthOpen}`);
});

test('heavy capture/check board move triggers immediate impact impulse and reactive blink', () => {
  let state = createInitialPortraitKinematics();
  state = stepPortraitKinematics(state, {
    dt: 0.016,
    elapsed: 0.5,
    isSpeaking: true,
    voiceLevel: 0.6,
    botThinking: false,
    inCheck: true,
    isFierce: true,
    boardFocus: { row: 2, col: 4, side: 'black', captured: true, inCheck: true, seq: 5 },
  });
  assert.ok(state.impactPulse >= 0.9, `Expected strong impact pulse on check/capture, got ${state.impactPulse}`);
  assert.ok(state.blinkTimer > 0, 'Expected reactive blink triggered on heavy move');
});

test('facial expression morphs transition smoothly between amused, surprised, and fierce on one identity', () => {
  let amused = createInitialPortraitKinematics();
  for (let i = 0; i < 35; i++) {
    amused = stepPortraitKinematics(amused, {
      dt: 0.03,
      elapsed: i * 0.03,
      isSpeaking: false,
      voiceLevel: 0,
      botThinking: false,
      inCheck: false,
      isFierce: false,
      emotion: 'amused',
      boardFocus: null,
    });
  }
  assert.ok(amused.smile > 0.55, `Expected amused smile > 0.55, got ${amused.smile}`);

  let fierce = createInitialPortraitKinematics();
  for (let i = 0; i < 35; i++) {
    fierce = stepPortraitKinematics(fierce, {
      dt: 0.03,
      elapsed: i * 0.03,
      isSpeaking: false,
      voiceLevel: 0,
      botThinking: false,
      inCheck: false,
      isFierce: true,
      emotion: 'fierce',
      boardFocus: null,
    });
  }
  assert.ok(fierce.browFurrow > 0.55, `Expected fierce browFurrow > 0.55, got ${fierce.browFurrow}`);
  assert.ok(fierce.dramaLight > 0.5, `Expected fierce dramaLight > 0.5, got ${fierce.dramaLight}`);

  let surprised = createInitialPortraitKinematics();
  for (let i = 0; i < 35; i++) {
    surprised = stepPortraitKinematics(surprised, {
      dt: 0.03,
      elapsed: i * 0.03,
      isSpeaking: false,
      voiceLevel: 0,
      botThinking: false,
      inCheck: false,
      isFierce: false,
      emotion: 'surprised',
      boardFocus: null,
    });
  }
  assert.ok(surprised.browRaise > 0.65, `Expected surprised browRaise > 0.65, got ${surprised.browRaise}`);
});

test('critically-damped spring prevents sudden single-frame head snaps when board focus switches sides', () => {
  let state = createInitialPortraitKinematics();
  for (let i = 0; i < 40; i++) {
    state = stepPortraitKinematics(state, {
      dt: 0.016,
      elapsed: i * 0.016,
      isSpeaking: false,
      voiceLevel: 0,
      botThinking: false,
      inCheck: false,
      isFierce: false,
      boardFocus: { row: 7, col: 0, side: 'red', seq: 1 },
    });
  }
  const prevYaw = state.headYaw;
  const next = stepPortraitKinematics(state, {
    dt: 0.016,
    elapsed: 0.656,
    isSpeaking: false,
    voiceLevel: 0,
    botThinking: false,
    inCheck: false,
    isFierce: false,
    boardFocus: { row: 7, col: 8, side: 'red', seq: 2 },
  });
  assert.ok(
    Math.abs(next.headYaw - prevYaw) < 0.08,
    `Expected butter-smooth spring delta < 0.08 per frame, got ${Math.abs(next.headYaw - prevYaw)}`,
  );
});
