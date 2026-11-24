import assert from 'node:assert/strict';
import test from 'node:test';
import { matchGuestCharacter } from '../data/characters';
import {
  applySeatLockedProfileUpdate,
  buildLiveInteractionScript,
  createEmptyCrowdVote,
  enqueueChallengerWithPriority,
  evaluateTurnClockTransition,
  recordCrowdVote,
  tallyCrowdVotes,
  triageLiveComment,
} from './liveInteraction';
import { createChallenger } from './matchmaker';
import { actorIdFor } from './liveIdentity';
import {
  classifyChatMessage,
  normalizeSpokenMoveNumbers,
  parseVietnameseChatMove,
} from './notation';
import { createInitialBoard, generateLegalMoves, makeMove } from './xiangqi';

test('Notation parser understands spoken Vietnamese numbers, live shorthand (p25, m87, p2b5), and natural phrases', () => {
  const b0 = createInitialBoard();

  assert.equal(normalizeSpokenMoveNumbers('pháo hai bình năm'), 'phao 2 binh 5');
  assert.equal(normalizeSpokenMoveNumbers('mã tám tiến bảy'), 'ma 8 tien 7');

  // Spoken voice move
  const spoken = parseVietnameseChatMove(b0, 'pháo hai bình năm');
  assert.equal(spoken.notation, 'P2 bình 5');

  // Ultra-compact live shorthand
  const p25 = parseVietnameseChatMove(b0, 'p25');
  assert.equal(p25.notation, 'P2 bình 5');

  const m87 = parseVietnameseChatMove(b0, 'm87');
  assert.equal(m87.notation, 'M8 tiến 7');

  const p2b5 = parseVietnameseChatMove(b0, 'p2b5');
  assert.equal(p2b5.notation, 'P2 bình 5');

  // Natural conversational phrase inside a sentence
  const natural = parseVietnameseChatMove(b0, 'thiếp ơi cho anh đi pháo 2 vô 5 nha');
  assert.equal(natural.notation, 'P2 bình 5');

  const phaoDau = parseVietnameseChatMove(b0, 'anh đi pháo đầu nhé');
  assert.equal(phaoDau.notation, 'P2 bình 5');

  const lenMa = parseVietnameseChatMove(b0, 'lên mã 8 đi em');
  assert.equal(lenMa.notation, 'M8 tiến 7');

  // Direct capture phrase after Cannon captures opening Horse
  const legal0 = generateLegalMoves(b0.grid, 'red');
  const p2t7 = legal0.find((m) => m.from.row === 7 && m.from.col === 7 && m.to.row === 0 && m.to.col === 7)!;
  const afterBlunder = makeMove(b0, p2t7);
  const capRes = parseVietnameseChatMove(afterBlunder, 'xe ăn pháo');
  assert.ok(capRes.move);
  assert.equal(capRes.move!.captured?.type, 'cannon');
  assert.equal(capRes.notation, 'X9 bình 8');
});

test('Classifier detects challenger live commands (!xinthua, !hoaco, !dilai, !goiy, sẵn sàng)', () => {
  assert.equal(classifyChatMessage('!xinthua').type, 'resign');
  assert.equal(classifyChatMessage('xin hòa').type, 'draw_offer');
  assert.equal(classifyChatMessage('!dilai').type, 'undo_request');
  assert.equal(classifyChatMessage('!goiy').type, 'hint_request');
  assert.equal(classifyChatMessage('sẵn sàng').type, 'ready_check');
  assert.equal(classifyChatMessage('p25').type, 'move_candidate');
  assert.equal(classifyChatMessage('xe ăn pháo').type, 'move_candidate');
});

test('Comment triage detects backseat coaching, filters spam, and prioritizes challenger & gifts', () => {
  const b0 = createInitialBoard();

  // Tier 0: gift
  const gift = triageLiveComment({
    username: '@DaiGia99',
    text: 'tặng hoa hồng',
    isChallenger: false,
    board: b0,
    hasGift: true,
  });
  assert.equal(gift.tier, 0);
  assert.equal(gift.category, 'gift');

  // Tier 1: non-challenger viewer whispers a legal move ("mách nước")
  const coach = triageLiveComment({
    username: '@MinhAnh_99',
    text: 'chú rể đi p2 bình 5 đi kìa!',
    isChallenger: false,
    board: b0,
  });
  assert.equal(coach.tier, 1);
  assert.equal(coach.category, 'backseat_coach');
  assert.equal(coach.suggestedNotation, 'P2 bình 5');

  // Tier 2: engaging viewer question
  const question = triageLiveComment({
    username: '@LanAnh',
    text: 'Cô dâu áo đỏ xinh quá, làm sao để lên đài chơi cùng vậy?',
    isChallenger: false,
    board: b0,
  });
  assert.equal(question.tier, 2);
  assert.equal(question.category, 'viewer_question');

  // Tier 3: spam & profanity filtered cleanly
  const spam = triageLiveComment({
    username: '@Spammer',
    text: 'aaaaaa',
    isChallenger: false,
    board: b0,
  });
  assert.equal(spam.tier, 3);
  assert.equal(spam.category, 'spam_or_low');
});

test('Seat lock prevents viewers and same-name relay lookalikes from hijacking active challenger seat via !nam/!nu and VIP gifts jump queue', () => {
  const active = createChallenger('@TanLang_1', actorIdFor('local', '@TanLang_1'), 'nam', 26);
  const viewerEntry = createChallenger(
    '@ViewerHack',
    actorIdFor('relay', '@ViewerHack'),
    'nu',
    22,
    matchGuestCharacter('nu', 22),
  );

  // Non-challenger sends !nu 22 -> MUST NOT hijack active challenger!
  const locked = applySeatLockedProfileUpdate({
    senderActorId: viewerEntry.actorId,
    activeChallenger: active,
    queue: [],
    updatedEntry: viewerEntry,
  });
  assert.equal(locked.wasSeatLocked, true);
  assert.equal(locked.updatedActive, null);
  assert.equal(locked.updatedQueue.length, 1);
  assert.equal(locked.updatedQueue[0].username, '@ViewerHack');

  // Remote relay lookalike with IDENTICAL handle "@TanLang_1" -> STILL blocked because actorId differs!
  const spoofEntry = createChallenger(
    '@TanLang_1',
    actorIdFor('relay', '@TanLang_1'),
    'nu',
    19,
    matchGuestCharacter('nu', 19),
  );
  const spoofAttempt = applySeatLockedProfileUpdate({
    senderActorId: spoofEntry.actorId,
    activeChallenger: active,
    queue: locked.updatedQueue,
    updatedEntry: spoofEntry,
  });
  assert.equal(spoofAttempt.wasSeatLocked, true);
  assert.equal(spoofAttempt.updatedActive, null);

  // Active challenger updates own profile with matching actorId -> ALLOWED!
  const selfUpdated = applySeatLockedProfileUpdate({
    senderActorId: active.actorId,
    activeChallenger: active,
    queue: locked.updatedQueue,
    updatedEntry: createChallenger(
      '@TanLang_1',
      active.actorId,
      'nam',
      45,
      matchGuestCharacter('nam', 45),
    ),
  });
  assert.equal(selfUpdated.wasSeatLocked, false);
  assert.equal(selfUpdated.updatedActive?.age, 45);

  // VIP gift sender jumps ahead of regular queued player!
  const regular1 = {
    ...createChallenger('@Regular1', actorIdFor('relay', '@Regular1'), 'nam', 24),
    joinedAt: 100,
  };
  const regular2 = {
    ...createChallenger('@Regular2', actorIdFor('relay', '@Regular2'), 'nu', 23),
    joinedAt: 200,
  };
  const vip = {
    ...createChallenger('@VipGift', actorIdFor('relay', '@VipGift'), 'nam', 30),
    joinedAt: 300,
    isVip: true,
    giftCount: 1,
  };
  let q = enqueueChallengerWithPriority([], regular1);
  q = enqueueChallengerWithPriority(q, regular2);
  q = enqueueChallengerWithPriority(q, vip);
  assert.equal(q[0].username, '@VipGift');
  assert.equal(q[1].username, '@Regular1');
  assert.equal(q[2].username, '@Regular2');
});

test('Turn clock state machine handles 10s warning, AFK strike, ready-check rotation, and crowd vote commit', () => {
  assert.equal(
    evaluateTurnClockTransition({
      secondsLeft: 10,
      awaitingReadyCheck: false,
      afkStrikes: 0,
      queueLength: 2,
      mode: 'duel_1v1',
    }).type,
    'warn_10s',
  );

  // First AFK timeout -> auto-move + strike 1
  const strike1 = evaluateTurnClockTransition({
    secondsLeft: 0,
    awaitingReadyCheck: false,
    afkStrikes: 0,
    queueLength: 2,
    mode: 'duel_1v1',
  });
  assert.equal(strike1.type, 'afk_auto_move_warn');

  // Second consecutive AFK timeout with queue -> rotate challenger
  const strike2 = evaluateTurnClockTransition({
    secondsLeft: 0,
    awaitingReadyCheck: false,
    afkStrikes: 1,
    queueLength: 2,
    mode: 'duel_1v1',
  });
  assert.equal(strike2.type, 'afk_rotate_challenger');

  // Ready check timeout with waiting queue -> rotate immediately
  const readyTimeout = evaluateTurnClockTransition({
    secondsLeft: 0,
    awaitingReadyCheck: true,
    afkStrikes: 0,
    queueLength: 1,
    mode: 'duel_1v1',
  });
  assert.equal(readyTimeout.type, 'ready_timeout_rotate');

  // Crowd vote commit at 0s
  const crowdCommit = evaluateTurnClockTransition({
    secondsLeft: 0,
    awaitingReadyCheck: false,
    afkStrikes: 0,
    queueLength: 0,
    mode: 'crowd_vote',
  });
  assert.equal(crowdCommit.type, 'crowd_vote_commit');
});

test('Crowd vote tracker enforces 1 vote per user (latest wins) and tallies Top 3 cleanly', () => {
  const b0 = createInitialBoard();
  const p2b5 = parseVietnameseChatMove(b0, 'p2 bình 5').move!;
  const m8t7 = parseVietnameseChatMove(b0, 'm8 tiến 7').move!;
  const b7t1 = parseVietnameseChatMove(b0, 'b7 tiến 1').move!;

  let votes = createEmptyCrowdVote();
  votes = recordCrowdVote(votes, '@UserA', p2b5, b0.grid);
  votes = recordCrowdVote(votes, '@UserB', m8t7, b0.grid);
  votes = recordCrowdVote(votes, '@UserC', p2b5, b0.grid);
  // UserB changes mind to b7t1 -> total still 3 users!
  votes = recordCrowdVote(votes, '@UserB', b7t1, b0.grid);

  assert.equal(votes.totalVotes, 3);
  const top = tallyCrowdVotes(votes, 3);
  assert.equal(top[0].notation, 'P2 bình 5');
  assert.equal(top[0].count, 2);
  assert.equal(top[0].percent, 67);
  assert.equal(top[1].notation, 'B7 tiến 1');
  assert.equal(top[1].count, 1);

  // Also ensure interaction scripts preserve respectful honorifics and punctuation
  const script = buildLiveInteractionScript({
    kind: 'backseat_coach',
    challengerName: '@KiemKhach',
    guestGender: 'nam',
    guestAge: 26,
    viewerName: '@MinhAnh',
  });
  assert.ok(script.line.includes('MinhAnh'));
  assert.equal(script.gesture, 'tease');
});
