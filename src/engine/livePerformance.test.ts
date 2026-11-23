import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBoard, generateLegalMoves, makeMove } from './xiangqi';
import { analyzePosition, detectMoveMotif } from './ai';
import {
  buildLiveSessionBeat,
  buildMovePerformanceScript,
  detectMatchPhase,
  resolvePronounProfile,
} from './livePerformance';

test('resolvePronounProfile adapts honorifics cleanly for young male, elder male, and female guests', () => {
  const youngMale = resolvePronounProfile('nam', 26);
  assert.equal(youngMale.self, 'thiếp');
  assert.equal(youngMale.guest, 'chàng');
  assert.equal(youngMale.storyMode, 'bridal_duel');

  const elderMale = resolvePronounProfile('nam', 62);
  assert.equal(elderMale.self, 'tiểu nữ');
  assert.equal(elderMale.guest, 'tiền bối');
  assert.equal(elderMale.storyMode, 'elder_respect');

  const youngFemale = resolvePronounProfile('nu', 24);
  assert.equal(youngFemale.self, 'tỷ');
  assert.equal(youngFemale.guest, 'muội');
  assert.equal(youngFemale.storyMode, 'sister_duel');

  const seniorFemale = resolvePronounProfile('nu', 38);
  assert.equal(seniorFemale.self, 'Điêu Nguyệt');
  assert.equal(seniorFemale.guest, 'tỷ tỷ');
});

test('buildMovePerformanceScript choreographs distinct gesture, emotion, and phase for opening vs blunder vs comeback', () => {
  const board0 = createInitialBoard();
  assert.equal(detectMatchPhase(board0), 'khai_cuoc');

  // Red plays classic P2 bình 5
  const moves = generateLegalMoves(board0.grid, 'red');
  const p2b5 = moves.find(
    (m) => m.piece.type === 'cannon' && m.from.col === 7 && m.to.col === 4,
  );
  assert.ok(p2b5);
  const board1 = makeMove(board0, p2b5);
  const analysis1 = analyzePosition(board1, 'nhap_mon');
  const motif1 = detectMoveMotif(board0.grid, p2b5, board1.grid);

  const openingScript = buildMovePerformanceScript({
    boardAfter: board1,
    move: p2b5,
    playedMotif: motif1,
    analysis: analysis1,
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam',
    guestAge: 26,
    scoreDeltaForRed: 20,
    recentLines: [],
  });
  assert.equal(openingScript.phase, 'khai_cuoc');
  assert.ok(openingScript.line.toLowerCase().includes('chàng'));
  assert.ok(openingScript.stageDirection.length > 10);
  assert.ok(['sip_tea', 'tease', 'closeup_talk'].includes(openingScript.gesture));

  // Blunder swing triggers amused teasing gesture
  const blunderScript = buildMovePerformanceScript({
    boardAfter: { ...board1, moveCount: 12 },
    move: p2b5,
    playedMotif: motif1,
    analysis: { ...analysis1, winProbRed: 34 },
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam',
    guestAge: 26,
    scoreDeltaForRed: -160,
    recentLines: [],
  });
  assert.equal(blunderScript.tacticalEvent, 'blunder_player');
  assert.equal(blunderScript.emotion, 'amused');
  assert.ok(['tease', 'sip_tea'].includes(blunderScript.gesture));

  // Comeback swing triggers surprised admiration
  const comebackScript = buildMovePerformanceScript({
    boardAfter: { ...board1, moveCount: 14 },
    move: p2b5,
    playedMotif: motif1,
    analysis: { ...analysis1, winProbRed: 55 },
    challengerName: '@TieuYenNhi_99',
    guestGender: 'nu',
    guestAge: 24,
    scoreDeltaForRed: 140,
    prevWinProbRed: 32,
    recentLines: [],
  });
  assert.equal(comebackScript.tacticalEvent, 'comeback_player');
  assert.equal(comebackScript.emotion, 'surprised');
  assert.ok(comebackScript.line.includes('muội'));
  assert.ok(!comebackScript.line.includes('chàng'));
});

test('buildLiveSessionBeat generates rich non-repeating lines with synced gestures and pause punctuation', () => {
  const teaBeat = buildLiveSessionBeat({
    beat: 'gesture_sip_tea',
    challengerName: '@KiemKhach_VN',
    guestTitle: 'Bạch Y Kỳ Sinh',
    guestGender: 'nam',
    guestAge: 26,
    winProbRed: 38,
    moveCount: 10,
  });
  assert.equal(teaBeat.gesture, 'sip_tea');
  assert.ok(teaBeat.line.includes('...'));

  const teaseBeat1 = buildLiveSessionBeat({
    beat: 'gesture_tease',
    challengerName: '@KiemKhach_VN',
    guestTitle: 'Bạch Y Kỳ Sinh',
    guestGender: 'nam',
    guestAge: 26,
    winProbRed: 50,
    moveCount: 10,
    recentLines: [],
    seed: 1,
  });
  const teaseBeat2 = buildLiveSessionBeat({
    beat: 'gesture_tease',
    challengerName: '@KiemKhach_VN',
    guestTitle: 'Bạch Y Kỳ Sinh',
    guestGender: 'nam',
    guestAge: 26,
    winProbRed: 50,
    moveCount: 10,
    recentLines: [teaseBeat1.line],
    seed: 1,
  });
  assert.equal(teaseBeat1.gesture, 'tease');
  assert.notEqual(teaseBeat1.line, teaseBeat2.line);

  const giftBeat = buildLiveSessionBeat({
    beat: 'gift_reaction',
    challengerName: '@KiemKhach_VN',
    guestTitle: 'Bạch Y Kỳ Sinh',
    guestGender: 'nam',
    guestAge: 26,
    winProbRed: 50,
    moveCount: 8,
    viewerName: '@HoaHong_VIP',
    giftName: 'Hoa Hồng Đỏ',
  });
  assert.ok(giftBeat.line.includes('HoaHong_VIP'));
  assert.ok(giftBeat.line.includes('Hoa Hồng Đỏ'));
});
