import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANKED_KILL_PATTERNS,
  COMMENTARY_TIERS,
  CommentaryTier,
  COMMENTARY_TOKENS,
  TIERED_BANK,
  bankedPools,
  commentaryTier,
  killPatternPool,
  tierPool,
} from './commentaryBank';
import type { KillPatternId } from './patterns';
import { NIGHT_THEMES } from './nightThemes';
import {
  buildMovePerformanceScript,
  resolvePronounProfile,
  renderSpeechTokens,
  shouldVoiceCommentary,
  TacticalEventType,
} from './livePerformance';
import { analyzePosition } from './ai';
import { createInitialBoard, generateLegalMoves, makeMove } from './xiangqi';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TIERS: CommentaryTier[] = COMMENTARY_TIERS;

function openingPosition() {
  const board0 = createInitialBoard();
  const move = generateLegalMoves(board0.grid, 'red').find(
    (m) => m.piece.type === 'cannon' && m.from.col === 7 && m.to.col === 4,
  );
  assert.ok(move);
  return { board0, move, boardAfter: makeMove(board0, move) };
}

test('commentaryTier escalates with the dowry ladder, otherwise reads the moment', () => {
  assert.equal(
    commentaryTier({ ladderStep: 3, phase: 'khai_cuoc', moveCount: 2, scoreDeltaForRed: 400 }),
    'khong_mu_phuong',
  );
  assert.equal(
    commentaryTier({ ladderStep: 2, phase: 'khai_cuoc', moveCount: 6, scoreDeltaForRed: 0 }),
    'do_dai',
  );
  assert.equal(
    commentaryTier({ ladderStep: 2, phase: 'khai_cuoc', moveCount: 7, scoreDeltaForRed: -200 }),
    'soc',
  );
  assert.equal(
    commentaryTier({ ladderStep: 0, phase: 'trung_cuoc', moveCount: 24, scoreDeltaForRed: 199 }),
    null,
  );

  // The tier is a delivery choice only: an out-of-ladder position still gets a line, and with no
  // tier to speak there is nothing to substitute, so the legacy pool answers instead of throwing.
  assert.equal(tierPool('check_bot', null).length, 0);
});

test('every ruling the referee can hand down has a tiered delivery', () => {
  // The three endings used to be legacy-only, so a draw sounded identical whether the dowry was
  // intact or gone. The scan above only walks what is already in the bank; this is the half that
  // notices when an event the engine can emit is missing from it.
  for (const event of [
    'perpetual_check_ruling',
    'repetition_draw',
    'sixty_move_draw',
  ] as TacticalEventType[]) {
    for (const tier of TIERS) {
      assert.equal(tierPool(event, tier).length, 3, `${event}/${tier} is not banked`);
    }
  }
});

test('every banked pool carries three fresh lines per tier', () => {
  const events = Object.keys(TIERED_BANK) as TacticalEventType[];
  assert.ok(events.length >= 19, `every event the referee and the engine can name should be banked, got ${events.length}`);

  // One walk over `bankedPools` instead of a loop per bank: a pattern bank added tomorrow inherits
  // every invariant below the moment it exists, and cannot quietly skip the quota check.
  const seenPerPool = new Map<string, Set<string>>();
  for (const { id, tier, entries } of bankedPools()) {
    const label = `${id}/${tier}`;
    const seen = seenPerPool.get(id) ?? new Set<string>();
    assert.equal(entries.length, 3, `${label} needs its own three deliveries`);
    for (const entry of entries) {
      assert.ok(entry.line.length > 30, `${label} line is too thin to broadcast`);
      assert.ok(entry.stageDirection.length > 10, `${label} has no stage business`);
      assert.ok(entry.gesture.length > 2, `${label} has no gesture`);
      assert.ok(entry.emotion.length > 2, `${label} has no emotion`);
      assert.ok(!seen.has(entry.line), `${label} repeats a line`);
      seen.add(entry.line);
    }
    seenPerPool.set(id, seen);
  }
  for (const [id, seen] of seenPerPool) {
    assert.equal(seen.size, 9, `${id} must hold nine distinct lines`);
  }
});

test('the sát pháp the rotation advertises are exactly the ones the bank can speak', () => {
  // A night that advertises a pattern with no copy of its own would fall back to generic check
  // lines while the banner names something specific - the mismatch the whole bank exists to kill.
  const advertised = NIGHT_THEMES.map((theme) => theme.focusPattern).sort();
  assert.deepEqual(
    [...BANKED_KILL_PATTERNS].sort(),
    advertised,
    'every advertised pattern needs a voice, and no voice may be spent on a night nobody claims',
  );
  assert.equal(killPatternPool('ma_hau_phao', 'soc').length, 0, 'unbanked pattern must fall back');
  assert.equal(killPatternPool('ngo_tao_ma', null).length, 0, 'no tier means no tiered delivery');
});

test('every banked pattern speaks for both sides of the shape', () => {
  // Copy that only ever means "she did it" would misattribute half the tactics the room watches, and
  // copy that only concedes would have her apologise for her own good moves. The opening tier is the
  // one deliberate exception: she does not concede a shape inside the first six plies of the night.
  for (const id of BANKED_KILL_PATTERNS) {
    const all = COMMENTARY_TIERS.flatMap((tier) => killPatternPool(id, tier));
    assert.equal(all.length, 9, `${id} must hold three lines per tier`);
    assert.equal(all.filter((entry) => (entry.by ?? 'self') === 'guest').length >= 2, true, `${id} never concedes`);

    for (const tier of COMMENTARY_TIERS) {
      const pool = killPatternPool(id, tier);
      const hers = killPatternPool(id, tier, 'self').length;
      const theirs = pool.length - hers;
      assert.ok(hers >= 1, `${id}/${tier} has nothing for her own shape`);
      if (tier === 'do_dai') assert.equal(theirs, 0, `${id}/${tier} concedes too early`);
      else assert.ok(theirs >= 1, `${id}/${tier} has nothing to concede`);
    }
  }
});

test('the bank talks through tokens the renderer actually substitutes', () => {
  const known = new Set<string>(COMMENTARY_TOKENS);
  for (const { id, tier, entries } of bankedPools()) {
    for (const entry of entries) {
      for (const field of [entry.line, entry.stageDirection]) {
        for (const token of field.match(/\{(\w+)\}/g) ?? []) {
          assert.ok(known.has(token.slice(1, -1)), `${id}/${tier} uses unknown token ${token}`);
        }
      }
    }
  }
});

test('the bank never hardcodes an honorific, only the profile token that carries it', () => {
  // 'chàng/thiếp' is the bridal register; an elder gets 'tiền bối' and a sister gets 'muội'.
  // A literal in the data silently breaks the xưng hô rule the whole stream is built on.
  const literalRegister = /\b(chàng|thiếp)\b|hai họ/i;
  for (const { id, tier, entries } of bankedPools()) {
    for (const entry of entries) {
      assert.ok(!literalRegister.test(entry.line), `${id}/${tier} hardcodes a register: ${entry.line}`);
      assert.ok(
        !literalRegister.test(entry.stageDirection),
        `${id}/${tier} hardcodes a register on stage: ${entry.stageDirection}`,
      );
    }
  }
});

test('no broadcast copy makes the bride the prize of a bet', () => {
  // NĐ 174/2026: the show may concede dowry layers on the board, never a person - and it stays
  // clear of gambling wording, because a live room that "bets" on a match is a different audit.
  const banned: RegExp[] = [
    /\bvợ\b/i,
    /thắng thì (được|có|nhận|em|nàng|cô)/i,
    /(nàng|cô dâu) là của (chàng|anh|bạn)/i,
    /(cá cược|đặt cược|ăn cược|\bcược\b)/i,
    /(trao|tặng|giao) (nàng|cô dâu)/i,
  ];

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
    });

  const files = walk(SRC_DIR).map((file) => path.relative(SRC_DIR, file));
  // Counting files would break the moment someone adds a module; what the guard actually needs
  // is proof that the walk reached every place broadcast copy can hide - the UI strings, the
  // tactical bank, and the six-night script are where a line slips in without anyone noticing.
  for (const required of [
    'App.tsx',
    path.join('engine', 'commentaryBank.ts'),
    path.join('engine', 'nightThemes.ts'),
  ]) {
    assert.ok(files.includes(required), `the wording scan never read ${required}`);
  }
  for (const file of files) {
    const text = readFileSync(path.join(SRC_DIR, file), 'utf8');
    for (const pattern of banned) {
      assert.ok(!pattern.test(text), `${file} matches the banned wording ${pattern}`);
    }
  }
});

test('commentary ships Vietnamese copy, not engine-internal Chinese labels', () => {
  const cjk = /[\u3400-\u9FFF\u3040-\u30FF]/;
  for (const { id, tier, entries } of bankedPools()) {
    for (const entry of entries) {
      assert.ok(!cjk.test(entry.line), `${id}/${tier} leaked a Chinese glyph into a spoken line`);
      assert.ok(
        !cjk.test(entry.stageDirection),
        `${id}/${tier} leaked a Chinese glyph into stage text`,
      );
    }
  }
});

test('the crown-gone tier takes over delivery once three dowry layers are lost', () => {
  const { move, boardAfter } = openingPosition();
  const analysis = analyzePosition(boardAfter, 'nhap_mon');
  const base = {
    boardAfter,
    move,
    playedMotif: 'Trung pháo',
    analysis,
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam' as const,
    guestAge: 26,
    scoreDeltaForRed: 20,
    recentLines: [],
  };

  const bold = buildMovePerformanceScript({ ...base, ladderStep: 0 });
  const stripped = buildMovePerformanceScript({ ...base, ladderStep: 3 });

  assert.notEqual(bold.line, stripped.line);
  assert.ok(
    !/hồi môn|mũ phượng/.test(bold.line),
    'before the ladder breaks she must not reference it',
  );
  assert.ok(
    /hồi môn|mũ phượng/.test(stripped.line),
    `after three layers the defiance tier should name what is gone: ${stripped.line}`,
  );
});

test('a ruling the room has already heard names the side that broke the rule', () => {
  // The banked ruling lines never say who was punished, because the event does not carry that.
  // The legacy pool does, so once the tier's three deliveries are all in the room's ear the
  // fallback must still be reachable - otherwise a repeated ruling is announced with no offender.
  const { boardAfter } = openingPosition();
  const punished = { ...boardAfter, statusReason: 'perpetual_check' as const };
  const blackPly = generateLegalMoves(boardAfter.grid, 'black')[0];
  assert.ok(blackPly, 'Black always has a reply in the opening');
  const profile = resolvePronounProfile('nam', 26);
  const base = {
    boardAfter: punished,
    move: blackPly,
    playedMotif: 'Trường Chiếu',
    analysis: analyzePosition(punished, 'nhap_mon'),
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam' as const,
    guestAge: 26,
    scoreDeltaForRed: 0,
    ladderStep: 3,
  };

  const heard: string[] = [];
  for (let i = 0; i < 4; i++) {
    heard.push(buildMovePerformanceScript({ ...base, recentLines: [...heard] }).line);
  }
  assert.equal(new Set(heard).size, 4, `a ruling repeated itself: ${heard.join(' | ')}`);

  // Black made the punishing ply, so the fourth hearing - out of tier lines - is the legacy one,
  // and it is the only delivery that can name the bride as the side the referee punished.
  const fallback = heard[3];
  assert.ok(fallback.includes(profile.self), `expected ${profile.self} to be named: ${fallback}`);
  assert.ok(!fallback.includes(profile.guest), `the wrong side was named: ${fallback}`);
  for (const line of heard.slice(0, 3)) {
    assert.notEqual(line, fallback, 'the tier should be spent before the legacy line is used');
  }
});

test('quiet plies only move the banner, loud plies get her voice', () => {
  assert.equal(
    shouldVoiceCommentary({
      tacticalEvent: 'balanced_duel',
      killPattern: false,
      phaseChanged: false,
      moveCount: 10,
    }),
    false,
  );
  assert.equal(
    shouldVoiceCommentary({
      tacticalEvent: 'balanced_duel',
      killPattern: false,
      phaseChanged: false,
      moveCount: 14,
    }),
    true,
    'every seventh ply she checks in with the audience',
  );
  for (const event of [
    'check_player',
    'light_capture_bot',
    'heavy_capture_player',
    'blunder_player',
    'repetition_draw',
  ] as TacticalEventType[]) {
    assert.equal(
      shouldVoiceCommentary({
        tacticalEvent: event,
        killPattern: false,
        phaseChanged: false,
        moveCount: 10,
      }),
      true,
      `${event} is a crowd beat`,
    );
  }
  assert.equal(
    shouldVoiceCommentary({
      tacticalEvent: 'balanced_duel',
      killPattern: true,
      phaseChanged: false,
      moveCount: 10,
    }),
    true,
  );
  assert.equal(
    shouldVoiceCommentary({
      tacticalEvent: 'balanced_duel',
      killPattern: false,
      phaseChanged: true,
      moveCount: 10,
    }),
    true,
  );
});

test('a named sát pháp gets copy that takes sides, and never the wrong side', () => {
  // Pattern lines are written in her voice and they claim who owns the shape: she taunts with her own
  // horse, and she concedes a horse the challenger planted. Both readings have to be reachable, and
  // neither may be spoken when the banner shows a different name than the line does.
  const board0 = createInitialBoard();
  let mid = board0;
  for (let i = 0; i < 16 && mid.status === 'playing'; i++) {
    const ms = generateLegalMoves(mid.grid, mid.turn);
    assert.ok(ms.length > 0);
    mid = makeMove(mid, ms[i % ms.length]);
  }
  const blackPly = generateLegalMoves(mid.grid, 'black')[0];
  const redPly = generateLegalMoves(mid.grid, 'red')[0];
  assert.ok(blackPly && redPly, 'both sides still have moves to speak about');
  const blackAfter = makeMove(mid, blackPly);
  const redAfter = makeMove(mid, redPly);
  const base = {
    boardAfter: blackAfter,
    move: blackPly,
    playedMotif: 'Ngọa Tào Mã',
    analysis: analyzePosition(blackAfter, 'nhap_mon'),
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam' as const,
    guestAge: 26,
    scoreDeltaForRed: 0,
    recentLines: [] as string[],
    ladderStep: 3,
    killPatternId: 'ngo_tao_ma' as KillPatternId | null,
  };
  const spoken = (over: Partial<typeof base>) =>
    buildMovePerformanceScript({ ...base, ...over }).line;
  const render = (line: string) =>
    renderSpeechTokens(line, {
      guestGender: 'nam',
      guestAge: 26,
      challengerName: '@KiemKhach_VN',
    });

  const hers = killPatternPool('ngo_tao_ma', 'khong_mu_phuong', 'self').map((entry) => render(entry.line));
  const admitted = killPatternPool('ngo_tao_ma', 'soc', 'guest').map((entry) => render(entry.line));
  assert.ok(hers.length > 0 && admitted.length > 0, 'both readings of one pattern need copy');

  const byHer = spoken({});
  assert.ok(hers.includes(byHer), `she did not get her own pattern: ${byHer}`);
  assert.ok(!admitted.includes(byHer), `she conceded a shape she actually holds: ${byHer}`);

  // A 400-centipawn swing against her and no dowry lost: the shaken tier, and the guest owns it.
  const byGuest = spoken({
    move: redPly,
    boardAfter: redAfter,
    analysis: analyzePosition(redAfter, 'nhap_mon'),
    ladderStep: 0,
    scoreDeltaForRed: 400,
  });
  assert.ok(admitted.includes(byGuest), `she would not name the tactic that beat her: ${byGuest}`);
  assert.ok(!hers.includes(byGuest), `she claimed the challenger's shape: ${byGuest}`);

  // The banner named something else, so the line may not smuggle a second tactic into the same ply.
  const mislabelled = spoken({ playedMotif: 'Bát Hoàng Mã' });
  assert.ok(!hers.includes(mislabelled) && !admitted.includes(mislabelled), `two tactics on one ply: ${mislabelled}`);

  // A real pattern the bank never got copy for falls back, instead of reciting an empty pool.
  const unbanked = spoken({ killPatternId: 'khong_dau_phao', playedMotif: 'Không Đầu Pháo' });
  assert.ok(unbanked.length > 30, 'an unbanked pattern still has to be answered out loud');
  assert.ok(!hers.includes(unbanked) && !admitted.includes(unbanked), 'a pattern with no copy borrowed someone else');

  // Three deliveries spent: the tier pool takes over, the show does not repeat itself.
  const exhausted = spoken({ recentLines: hers });
  assert.ok(!hers.includes(exhausted), `the pattern pool repeated itself: ${exhausted}`);
  assert.ok(exhausted.length > 30, 'the tier fallback still says something');

  // The bold opening tier has no concession copy: an early tactic from the challenger is answered by
  // the event pool, which is honest - she does not concede in the sixth ply of the opening.
  assert.equal(killPatternPool('ngo_tao_ma', 'do_dai', 'guest').length, 0);
});
