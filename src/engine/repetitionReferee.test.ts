import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BoardState,
  Move,
  Piece,
  PieceType,
  Side,
  createEmptyGrid,
  generateLegalMoves,
  isInCheck,
  makeMove,
} from './xiangqi';
import { analyzePosition } from './ai';
import {
  NO_CAPTURE_DRAW_PLIES,
  PositionRecord,
  losesByPerpetualCheck,
  noCapturePlies,
  positionSignature,
  refereeForBoard,
  refereeVerdict,
} from './repetitionReferee';

interface Spec {
  r: number;
  c: number;
  side: Side;
  type: PieceType;
}

/** fromRow, fromCol, toRow, toCol — resolved through generateLegalMoves so an illegal step fails loudly. */
type Step = [number, number, number, number];

/**
 * Hand-built boards deliberately carry no `refereeHistory`: fixtures and saved games written before
 * the referee existed must still be adjudicated (ledgerForBoard bootstraps the current position).
 */
function buildBoard(pieces: Spec[], turn: Side): BoardState {
  const grid = createEmptyGrid();
  pieces.forEach((p, idx) => {
    const piece: Piece = { id: `${p.side}_${p.type}_${idx}`, side: p.side, type: p.type };
    grid[p.r][p.c] = piece;
  });
  return {
    grid,
    turn,
    moveCount: 0,
    lastMove: null,
    status: 'playing',
    inCheck: isInCheck(grid, turn) ? turn : null,
  };
}

function step(state: BoardState, moveStep: Step): BoardState {
  return makeMove(state, findMove(state, moveStep));
}

function play(state: BoardState, steps: Step[]): BoardState {
  return steps.reduce((acc, s) => step(acc, s), state);
}

// Red horse checks on every red ply while the black king only shuffles between (0,3) and (0,4).
const RED_PERPETUAL: Spec[] = [
  { r: 9, c: 3, side: 'red', type: 'king' },
  { r: 7, c: 3, side: 'red', type: 'soldier' },
  { r: 1, c: 1, side: 'red', type: 'horse' },
  { r: 0, c: 4, side: 'black', type: 'king' },
];
const RED_PERPETUAL_CYCLE: Step[] = [
  [1, 1, 2, 3],
  [0, 4, 0, 3],
  [2, 3, 1, 1],
  [0, 3, 0, 4],
];

// The same shape with the colours swapped: Black's horse, Red's king shuffling on the bottom rank.
const BLACK_PERPETUAL: Spec[] = [
  { r: 9, c: 4, side: 'red', type: 'king' },
  { r: 0, c: 5, side: 'black', type: 'king' },
  { r: 2, c: 5, side: 'black', type: 'soldier' },
  { r: 8, c: 7, side: 'black', type: 'horse' },
];
const BLACK_PERPETUAL_CYCLE: Step[] = [
  [8, 7, 7, 5],
  [9, 4, 9, 5],
  [7, 5, 8, 7],
  [9, 5, 9, 4],
];

// Two chariots shuffling home: a repetition with no check on either side.
const NEUTRAL_SHUFFLE: Spec[] = [
  { r: 9, c: 3, side: 'red', type: 'king' },
  { r: 5, c: 2, side: 'red', type: 'chariot' },
  { r: 0, c: 5, side: 'black', type: 'king' },
  { r: 4, c: 7, side: 'black', type: 'chariot' },
];
const NEUTRAL_SHUFFLE_CYCLE: Step[] = [
  [5, 2, 6, 2],
  [4, 7, 3, 7],
  [6, 2, 5, 2],
  [3, 7, 4, 7],
];

// Red is a chariot up, so the 0.00 a repeated position promises Black is the best score on offer.
// Red to move, already in check by the horse: the 7-ply walk back opens on Red's king step.
const TRAP: Spec[] = [
  { r: 9, c: 4, side: 'red', type: 'king' },
  { r: 5, c: 0, side: 'red', type: 'chariot' },
  { r: 0, c: 5, side: 'black', type: 'king' },
  { r: 2, c: 5, side: 'black', type: 'soldier' },
  { r: 7, c: 5, side: 'black', type: 'horse' },
];
const TRAP_OPENING: Step[] = [[9, 4, 9, 5]];
const TRAP_CYCLE: Step[] = [
  [7, 5, 8, 7],
  [9, 5, 9, 4],
  [8, 7, 7, 5],
  [9, 4, 9, 5],
];
/** Ply 8: Black's own horse return completes the third trip — that ply is the losing move. */
const TRAP_DECISION: Step[] = [...TRAP_OPENING, ...TRAP_CYCLE, TRAP_CYCLE[0], TRAP_CYCLE[1]];
const TRAP_MOVE: Step = [8, 7, 7, 5];

function findMove(state: BoardState, [fr, fc, tr, tc]: Step): Move {
  const move = generateLegalMoves(state.grid, state.turn).find(
    (m) => m.from.row === fr && m.from.col === fc && m.to.row === tr && m.to.col === tc,
  );
  assert.ok(move, `Move (${fr},${fc})->(${tr},${tc}) must be legal`);
  return move!;
}

/**
 * Would this ply be the third trip through the position with `side` as the perpetual checker?
 * The candidate record is the one makeMove itself appended, so the engine and the referee are
 * checked against exactly the same projection.
 */
function losesInOne(state: BoardState, move: Move, side: Side): boolean {
  const history = makeMove(state, move).refereeHistory!;
  return losesByPerpetualCheck(history.slice(0, -1), history[history.length - 1], side);
}

function quietLedger(plies: number, captureAt = -1): PositionRecord[] {
  const records: PositionRecord[] = [
    { ply: 0, key: 'ledger:0', mover: null, gaveCheck: false, captured: false },
  ];
  for (let ply = 1; ply <= plies; ply++) {
    records.push({
      ply,
      key: `ledger:${ply}`,
      mover: ply % 2 === 1 ? 'red' : 'black',
      gaveCheck: false,
      captured: ply === captureAt,
    });
  }
  return records;
}

test('Two chariots shuffling home repeats the position: the third trip is a draw', () => {
  const start = buildBoard(NEUTRAL_SHUFFLE, 'red');
  const half = play(start, NEUTRAL_SHUFFLE_CYCLE);
  const midway = refereeForBoard(half);
  assert.equal(midway.status, 'playing', 'the second trip must not end the game');
  assert.equal(midway.occurrences, 2);
  assert.equal(midway.warning, null, 'a cycle with no check on either side earns no warning');

  const full = play(half, NEUTRAL_SHUFFLE_CYCLE);
  const verdict = refereeForBoard(full);
  assert.equal(full.status, 'draw');
  assert.equal(full.statusReason, 'repetition_draw');
  assert.equal(verdict.reason, 'repetition_draw');
  assert.equal(verdict.occurrences, 3);
  assert.equal(verdict.offender, null, 'nobody is blamed when neither side checks');
  assert.equal(verdict.noCapturePlies, 8);
});

test('Red that checks on every move of the cycle loses on the third trip', () => {
  const start = buildBoard(RED_PERPETUAL, 'red');
  const warned = refereeForBoard(play(start, RED_PERPETUAL_CYCLE));
  assert.equal(warned.warning, 'perpetual_check_warning');
  assert.equal(warned.offender, 'red');

  const decided = play(buildBoard(RED_PERPETUAL, 'red'), [
    ...RED_PERPETUAL_CYCLE,
    ...RED_PERPETUAL_CYCLE,
  ]);
  const verdict = refereeForBoard(decided);
  assert.equal(decided.status, 'black_win', 'the checker loses, not the victim');
  assert.equal(decided.statusReason, 'perpetual_check');
  assert.equal(verdict.reason, 'perpetual_check');
  assert.equal(verdict.offender, 'red');
  assert.equal(verdict.occurrences, 3);
});

test('Black that checks on every move of the cycle loses on the third trip', () => {
  const decided = play(buildBoard(BLACK_PERPETUAL, 'black'), [
    ...BLACK_PERPETUAL_CYCLE,
    ...BLACK_PERPETUAL_CYCLE,
  ]);
  const verdict = refereeForBoard(decided);
  assert.equal(decided.status, 'red_win');
  assert.equal(decided.statusReason, 'perpetual_check');
  assert.equal(verdict.reason, 'perpetual_check');
  assert.equal(verdict.offender, 'black');
});

test('The warning lands on the second trip while the game is still playable', () => {
  const afterFour = play(buildBoard(RED_PERPETUAL, 'red'), RED_PERPETUAL_CYCLE);
  assert.equal(afterFour.status, 'playing');
  assert.equal(afterFour.moveCount, 4);
  const verdict = refereeForBoard(afterFour);
  assert.deepEqual(
    { warning: verdict.warning, offender: verdict.offender, occurrences: verdict.occurrences,
      noCapturePlies: verdict.noCapturePlies },
    { warning: 'perpetual_check_warning', offender: 'red', occurrences: 2, noCapturePlies: 4 },
  );
});

test('120 half-moves without a capture draw; a capture restarts the count', () => {
  assert.equal(NO_CAPTURE_DRAW_PLIES, 120, '60 hiệp = 120 nửa nước');

  const almost = refereeVerdict(quietLedger(119));
  assert.equal(almost.status, 'playing');
  assert.equal(almost.noCapturePlies, 119);

  const reached = refereeVerdict(quietLedger(120));
  assert.equal(reached.status, 'draw');
  assert.equal(reached.reason, 'sixty_move_draw');
  assert.equal(reached.noCapturePlies, 120);

  const capturedAtPly119 = quietLedger(120, 119);
  assert.equal(noCapturePlies(capturedAtPly119), 1, 'only the capture resets the counter');
  assert.equal(refereeVerdict(capturedAtPly119).status, 'playing');

  // The same through the real move generator: a pawn push must not reset anything, a capture must.
  const grab = step(buildBoard([
    { r: 9, c: 3, side: 'red', type: 'king' },
    { r: 4, c: 0, side: 'red', type: 'chariot' },
    { r: 0, c: 5, side: 'black', type: 'king' },
    { r: 4, c: 4, side: 'black', type: 'soldier' },
  ], 'red'), [4, 0, 4, 4]);
  assert.equal(refereeForBoard(grab).noCapturePlies, 0);
  const quietReply = step(grab, [0, 5, 1, 5]);
  assert.equal(refereeForBoard(quietReply).noCapturePlies, 1);
});

test('Kỳ Ma refuses the horse return that would be ruled a losing perpetual check', () => {
  const decision = play(buildBoard(TRAP, 'red'), TRAP_DECISION);
  assert.equal(decision.turn, 'black');
  assert.equal(decision.status, 'playing');
  const before = refereeForBoard(decision);
  assert.equal(before.warning, 'perpetual_check_warning');
  assert.equal(before.offender, 'black');

  const trap = findMove(decision, TRAP_MOVE);
  assert.equal(losesInOne(decision, trap, 'black'), true);

  // The search scores the repetition 0.00, and Black is a whole chariot down, so without the
  // referee filter it would happily repeat its way into the ruling.
  const analysis = analyzePosition(decision, 'cao_thu', { mode: 'play' });
  const best = analysis.bestMove!;
  assert.notDeepEqual(
    [best.from.row, best.from.col, best.to.row, best.to.col],
    TRAP_MOVE,
    `Kỳ Ma must not play the lethal repetition (score ${Math.round(analysis.score)})`,
  );
  for (const move of generateLegalMoves(decision.grid, 'black')) {
    const after = makeMove(decision, move);
    if (move.from.row === trap.from.row && move.from.col === trap.from.col &&
      move.to.row === trap.to.row && move.to.col === trap.to.col) {
      assert.equal(after.status, 'red_win', 'the trap ply really is an immediate loss');
      assert.equal(after.statusReason, 'perpetual_check');
      continue;
    }
    assert.equal(losesInOne(decision, move, 'black'), false, 'only the trap ply loses');
    assert.equal(after.status, 'playing', 'no other legal move ends the game');
  }
});

test('The position key is placement plus side to move, never piece instance ids', () => {
  const a = buildBoard(NEUTRAL_SHUFFLE, 'red');
  const b = buildBoard(NEUTRAL_SHUFFLE, 'red');
  b.grid[5][2]!.id = 'whatever_the_relay_called_it';
  assert.equal(positionSignature(a.grid, 'red'), positionSignature(b.grid, 'red'));
  assert.notEqual(positionSignature(a.grid, 'red'), positionSignature(a.grid, 'black'));

  const shifted = buildBoard([
    { r: 9, c: 3, side: 'red', type: 'king' },
    { r: 6, c: 2, side: 'red', type: 'chariot' },
    { r: 0, c: 5, side: 'black', type: 'king' },
    { r: 4, c: 7, side: 'black', type: 'chariot' },
  ], 'red');
  assert.notEqual(
    positionSignature(a.grid, 'red'),
    positionSignature(shifted.grid, 'red'),
    'the same material one rank down is a different position',
  );
});

test('makeMove labels the terminal reasons the UI reads', () => {
  const mated = step(buildBoard([
    { r: 9, c: 3, side: 'red', type: 'king' },
    { r: 2, c: 0, side: 'red', type: 'chariot' },
    { r: 1, c: 8, side: 'red', type: 'chariot' },
    { r: 2, c: 6, side: 'red', type: 'horse' },
    { r: 0, c: 4, side: 'black', type: 'king' },
  ], 'red'), [2, 0, 0, 0]);
  assert.equal(mated.status, 'red_win');
  assert.equal(mated.statusReason, 'checkmate');

  // Black's king keeps two free-looking squares, and every one of them is covered: the row-1
  // chariot owns rank 1, the two soldiers on rank 0 take (0,3) and (0,5) without touching (0,4).
  const stale = step(buildBoard([
    { r: 9, c: 3, side: 'red', type: 'king' },
    { r: 6, c: 6, side: 'red', type: 'soldier' },
    { r: 1, c: 8, side: 'red', type: 'chariot' },
    { r: 0, c: 2, side: 'red', type: 'soldier' },
    { r: 0, c: 6, side: 'red', type: 'soldier' },
    { r: 0, c: 4, side: 'black', type: 'king' },
  ], 'red'), [6, 6, 5, 6]);
  assert.equal(stale.status, 'red_win');
  assert.equal(stale.statusReason, 'stalemate', 'no check and no legal reply is a stalemate');
});
