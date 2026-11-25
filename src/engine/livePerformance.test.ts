import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBoard, generateLegalMoves, makeMove } from './xiangqi';
import { analyzePosition, detectMoveMotif } from './ai';
import { initialLadder } from './bridalLadder';
import { NIGHT_THEMES } from './nightThemes';
import {
  buildLiveEntryPlan,
  buildLiveSessionBeat,
  buildMovePerformanceScript,
  buildBlackReplyEvaluation,
  buildRepetitionWarningScript,
  buildVoicePreviewLine,
  classifyTacticalEvent,
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

test('voice previews preserve the bridal copy for a young groom', () => {
  assert.equal(
    buildVoicePreviewLine({ kind: 'select', guestGender: 'nam', guestAge: 26 }),
    'Hì hì... chàng nghe giọng này của thiếp — đã đủ ngọt ngào cho đêm hoa chúc chưa nào?',
  );
  assert.equal(
    buildVoicePreviewLine({ kind: 'test', guestGender: 'nam', guestAge: 26 }),
    'Đêm hoa chúc... ánh trăng in bóng hồ sen đẹp quá! Chàng thắng ván này thì thiếp giao lại một lớp hồi môn, còn thua thì ra hành lang ngắm trăng nha!',
  );
  assert.equal(
    buildVoicePreviewLine({ kind: 'replay', guestGender: 'nam', guestAge: 26 }),
    'Chàng ơi, đèn hoa chúc sáng rực rồi — mời chàng đi nước cờ đầu tiên cho hai họ phòng live cùng chiêm ngưỡng nha!',
  );
});

test('voice previews use the active challenger profile outside the bridal duel', () => {
  const profiles = [
    { gender: 'nu' as const, age: 24 },
    { gender: 'nu' as const, age: 38 },
    { gender: 'nam' as const, age: 62 },
  ];

  for (const profile of profiles) {
    const pronouns = resolvePronounProfile(profile.gender, profile.age);
    for (const kind of ['select', 'test', 'replay'] as const) {
      const line = buildVoicePreviewLine({
        kind,
        guestGender: profile.gender,
        guestAge: profile.age,
      });
      assert.ok(line.toLowerCase().includes(pronouns.guest.toLowerCase()));
      if (kind !== 'replay') assert.ok(line.includes(pronouns.self));
      assert.doesNotMatch(line, /chàng|thiếp|phu thê|hai họ|chú rể|tân lang/i);
    }
  }
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

test('buildBlackReplyEvaluation measures the Red-relative change across Black reply', () => {
  const analysis = analyzePosition(createInitialBoard(), 'nhap_mon');
  const before = { ...analysis, score: 80, winProbRed: 58 };
  const after = { ...analysis, score: -25, winProbRed: 62 };

  assert.deepEqual(buildBlackReplyEvaluation(before, after), {
    scoreDeltaForRed: -105,
    prevWinProbRed: 58,
  });
});

test('tactical praise and blame stay on Red while Black reads the same Red-relative swing correctly', () => {
  const board0 = createInitialBoard();
  const redMove = generateLegalMoves(board0.grid, 'red').find(
    (move) => move.piece.type === 'cannon' && move.from.col === 7 && move.to.col === 4,
  );
  assert.ok(redMove);
  const board1 = makeMove(board0, redMove);
  const blackMove = generateLegalMoves(board1.grid, 'black').find((move) => {
    const after = makeMove(board1, move);
    return !move.captured && after.inCheck === null;
  });
  assert.ok(blackMove);
  const board2 = makeMove(board1, blackMove);
  const analysis = analyzePosition(board1, 'nhap_mon');
  const balanced = { ...analysis, winProbRed: 50 };
  const redAhead = { ...analysis, winProbRed: 70 };
  const blackAhead = { ...analysis, winProbRed: 30 };
  const common = { boardAfter: board2, move: blackMove, phase: 'trung_cuoc' as const };

  assert.equal(
    classifyTacticalEvent({
      ...common,
      analysis: balanced,
      scoreDeltaForRed: 120,
      prevWinProbRed: 30,
    }),
    'balanced_duel',
  );
  assert.equal(
    classifyTacticalEvent({
      ...common,
      analysis: blackAhead,
      scoreDeltaForRed: -120,
      prevWinProbRed: 50,
    }),
    'dominating_bot',
  );
  assert.equal(
    classifyTacticalEvent({
      ...common,
      analysis: redAhead,
      scoreDeltaForRed: 120,
      prevWinProbRed: 50,
    }),
    'under_pressure_bot',
  );

  const redCommon = { boardAfter: board1, move: redMove, phase: 'trung_cuoc' as const };
  assert.equal(
    classifyTacticalEvent({
      ...redCommon,
      analysis: balanced,
      scoreDeltaForRed: 120,
      prevWinProbRed: 50,
    }),
    'brilliant_player',
  );
  assert.equal(
    classifyTacticalEvent({
      ...redCommon,
      analysis: balanced,
      scoreDeltaForRed: -160,
      prevWinProbRed: 50,
    }),
    'blunder_player',
  );
  assert.equal(
    classifyTacticalEvent({
      ...redCommon,
      analysis: balanced,
      scoreDeltaForRed: 140,
      prevWinProbRed: 30,
    }),
    'comeback_player',
  );
});

test('terminal performance copy stays profile-aware for female and elder challengers', () => {
  const board0 = createInitialBoard();
  const move = generateLegalMoves(board0.grid, 'red')[0];
  assert.ok(move);
  const analysis = analyzePosition(board0, 'nhap_mon');
  const profiles = [
    { gender: 'nu' as const, age: 24 },
    { gender: 'nu' as const, age: 38 },
    { gender: 'nam' as const, age: 62 },
  ];
  const endings = [
    { status: 'red_win', statusReason: 'checkmate' },
    { status: 'black_win', statusReason: 'checkmate' },
    { status: 'draw', statusReason: 'repetition_draw' },
    { status: 'draw', statusReason: 'sixty_move_draw' },
    { status: 'red_win', statusReason: 'perpetual_check' },
  ] as const;

  for (const profile of profiles) {
    for (const ending of endings) {
      for (let seed = 0; seed < 6; seed += 1) {
        const script = buildMovePerformanceScript({
          boardAfter: { ...board0, ...ending, moveCount: 30 + seed },
          move,
          playedMotif: '',
          analysis,
          challengerName: '@KiemKhach_VN',
          guestGender: profile.gender,
          guestAge: profile.age,
          scoreDeltaForRed: 0,
          recentLines: [],
        });
        assert.doesNotMatch(script.line, /chàng|thiếp|phu thê|hai họ/i);
      }
    }
  }
});

test('repetition warnings address the challenger without hardcoded bridal honorifics', () => {
  const profiles = [
    { gender: 'nu' as const, age: 24 },
    { gender: 'nu' as const, age: 38 },
    { gender: 'nam' as const, age: 62 },
  ];

  for (const profile of profiles) {
    for (const offender of ['red', 'black'] as const) {
      for (const seed of [0, 1]) {
        const script = buildRepetitionWarningScript({
          offender,
          challengerName: '@KiemKhach_VN',
          guestGender: profile.gender,
          guestAge: profile.age,
          moveCount: 12,
          recentLines: [],
          seed,
        });
        assert.doesNotMatch(script.line, /chàng|thiếp|phu thê|hai họ/i);
      }
    }
  }
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

test('live entry announces an opening only on a fresh playable board', () => {
  const base = {
    night: NIGHT_THEMES[0],
    ladder: initialLadder(),
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam' as const,
    guestAge: 26,
    seed: 1,
  };
  const fresh = buildLiveEntryPlan({ ...base, board: createInitialBoard() });
  assert.equal(fresh.appState, 'playing');
  assert.ok(fresh.opening);
  assert.equal(fresh.opening.phase, 'khai_cuoc');
  assert.equal(fresh.speakConcessionClaim, true);

  const moves = generateLegalMoves(createInitialBoard().grid, 'red');
  const first = moves.find(
    (move) => move.piece.type === 'cannon' && move.from.col === 7 && move.to.col === 4,
  );
  assert.ok(first);
  const resumed = buildLiveEntryPlan({
    ...base,
    board: makeMove(createInitialBoard(), first),
  });
  assert.equal(resumed.appState, 'playing');
  assert.equal(resumed.opening, null);
  assert.equal(resumed.speakConcessionClaim, false);
});

test('live entry reopens the result modal instead of narrating a terminal board as fresh', () => {
  const terminal = buildLiveEntryPlan({
    night: NIGHT_THEMES[0],
    board: { ...createInitialBoard(), status: 'draw' },
    ladder: initialLadder(),
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam',
    guestAge: 26,
    seed: 1,
  });

  assert.equal(terminal.appState, 'gameover');
  assert.equal(terminal.opening, null);
  assert.equal(terminal.speakConcessionClaim, false);
});
