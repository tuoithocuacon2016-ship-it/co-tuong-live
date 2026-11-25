import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommentaryTier, TIERED_BANK, commentaryTier, tierPool } from './commentaryBank';
import {
  buildMovePerformanceScript,
  shouldVoiceCommentary,
  TacticalEventType,
} from './livePerformance';
import { analyzePosition } from './ai';
import { createInitialBoard, generateLegalMoves, makeMove } from './xiangqi';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TIERS: CommentaryTier[] = ['do_dai', 'soc', 'khong_mu_phuong'];

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

  // The tier is a delivery choice only: an out-of-ladder position still gets a line,
  // and an event nobody banked degrades to the legacy pool instead of throwing.
  assert.equal(tierPool('check_bot', null).length, 0);
  assert.equal(tierPool('sixty_move_draw', 'soc').length, 0);
});

test('every banked tactical event carries three fresh lines per tier', () => {
  const events = Object.keys(TIERED_BANK) as TacticalEventType[];
  assert.ok(events.length >= 16, `expected the hard beats banked, got ${events.length}`);

  for (const event of events) {
    const seenPerEvent = new Set<string>();
    for (const tier of TIERS) {
      const entries = tierPool(event, tier);
      assert.equal(entries.length, 3, `${event}/${tier} needs its own three deliveries`);
      for (const entry of entries) {
        assert.ok(entry.line.length > 30, `${event}/${tier} line is too thin to broadcast`);
        assert.ok(entry.stageDirection.length > 10, `${event}/${tier} has no stage business`);
        assert.ok(entry.gesture.length > 2, `${event}/${tier} has no gesture`);
        assert.ok(entry.emotion.length > 2, `${event}/${tier} has no emotion`);
        assert.ok(!seenPerEvent.has(entry.line), `${event}/${tier} repeats a line`);
        seenPerEvent.add(entry.line);
      }
    }
    assert.equal(seenPerEvent.size, 9, `${event} must hold nine distinct lines`);
  }
});

test('the bank talks through tokens the renderer actually substitutes', () => {
  const known = new Set([
    'guest',
    'capGuest',
    'self',
    'capSelf',
    'audience',
    'name',
    'piece',
    'motif',
  ]);
  for (const event of Object.keys(TIERED_BANK) as TacticalEventType[]) {
    for (const tier of TIERS) {
      for (const entry of tierPool(event, tier)) {
        for (const field of [entry.line, entry.stageDirection]) {
          for (const token of field.match(/\{(\w+)\}/g) ?? []) {
            assert.ok(
              known.has(token.slice(1, -1)),
              `${event}/${tier} uses unknown token ${token}`,
            );
          }
        }
      }
    }
  }
});

test('the bank never hardcodes an honorific, only the profile token that carries it', () => {
  // 'chàng/thiếp' is the bridal register; an elder gets 'tiền bối' and a sister gets 'muội'.
  // A literal in the data silently breaks the xưng hô rule the whole stream is built on.
  const literalRegister = /\b(chàng|thiếp)\b|hai họ/i;
  for (const event of Object.keys(TIERED_BANK) as TacticalEventType[]) {
    for (const tier of TIERS) {
      for (const entry of tierPool(event, tier)) {
        assert.ok(
          !literalRegister.test(entry.line),
          `${event}/${tier} hardcodes a register: ${entry.line}`,
        );
        assert.ok(
          !literalRegister.test(entry.stageDirection),
          `${event}/${tier} hardcodes a register on stage: ${entry.stageDirection}`,
        );
      }
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
  // is proof that the walk reached the two places broadcast copy can hide.
  for (const required of ['App.tsx', path.join('engine', 'commentaryBank.ts')]) {
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
  for (const event of Object.keys(TIERED_BANK) as TacticalEventType[]) {
    for (const tier of TIERS) {
      for (const entry of tierPool(event, tier)) {
        assert.ok(!cjk.test(entry.line), `${event}/${tier} leaked a Chinese glyph into a spoken line`);
        assert.ok(
          !cjk.test(entry.stageDirection),
          `${event}/${tier} leaked a Chinese glyph into stage text`,
        );
      }
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
