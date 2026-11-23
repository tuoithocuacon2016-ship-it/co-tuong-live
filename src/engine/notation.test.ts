import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyGrid, createInitialBoard, makeMove } from './xiangqi';
import {
  classifyChatMessage,
  formatMoveVietnamese,
  parseVietnameseChatMove,
} from './notation';

test('parses classic Red opening P2 bình 5 and formats back identically', () => {
  const board = createInitialBoard();
  const res = parseVietnameseChatMove(board, 'p2 bình 5');
  assert.ok(res.move, 'Expected p2 bình 5 to parse as legal move');
  assert.equal(res.move!.from.row, 7);
  assert.equal(res.move!.from.col, 7); // Red file 2 -> col 7
  assert.equal(res.move!.to.row, 7);
  assert.equal(res.move!.to.col, 4); // Red file 5 -> col 4
  assert.equal(formatMoveVietnamese(board.grid, res.move!), 'P2 bình 5');
});

test('parses diacritic-free and symbol chat moves (m8 tien 7, b7.1, xe 1 tan 1)', () => {
  const board = createInitialBoard();
  const m1 = parseVietnameseChatMove(board, 'm8 tien 7');
  assert.ok(m1.move);
  assert.equal(m1.move!.piece.type, 'horse');
  assert.equal(m1.move!.from.col, 1); // Red file 8 -> col 1
  assert.equal(m1.move!.to.row, 7);
  assert.equal(m1.move!.to.col, 2); // Red file 7 -> col 2

  const m2 = parseVietnameseChatMove(board, 'b7.1');
  assert.ok(m2.move);
  assert.equal(m2.move!.piece.type, 'soldier');
  assert.equal(m2.move!.to.row, 5);

  const m3 = parseVietnameseChatMove(board, 'xe 1 tan 1');
  assert.ok(m3.move);
  assert.equal(m3.move!.piece.type, 'chariot');
  assert.equal(m3.move!.from.col, 8);
  assert.equal(m3.move!.to.row, 8);
});

test('parses x7 bình 3 and shorthand contextual moves (tiến 5, thoái 1)', () => {
  const grid = createEmptyGrid();
  grid[0][3] = { id: 'bk', side: 'black', type: 'king' };
  grid[9][4] = { id: 'rk', side: 'red', type: 'king' };
  grid[6][2] = { id: 'red_chariot_1', side: 'red', type: 'chariot' }; // Red file 7 (col 2)

  const state = {
    grid,
    turn: 'red' as const,
    moveCount: 4,
    lastMove: null,
    status: 'playing' as const,
    inCheck: null,
  };

  // Explicit "x7 bình 3"
  const x7b3 = parseVietnameseChatMove(state, 'x7 bình 3');
  assert.ok(x7b3.move, 'Expected x7 bình 3 to be valid');
  assert.equal(x7b3.move!.to.row, 6);
  assert.equal(x7b3.move!.to.col, 6); // Red file 3 -> col 6

  // Shorthand "tiến 5" using preferred chariot
  const tien5 = parseVietnameseChatMove(state, 'tiến 5', 'red_chariot_1');
  assert.ok(tien5.move, 'Expected shorthand tiến 5 to resolve');
  assert.equal(tien5.move!.from.row, 6);
  assert.equal(tien5.move!.to.row, 1);

  // Move chariot forward then test "thoái 1"
  const after = makeMove(state, tien5.move!);
  const redAgain = { ...after, turn: 'red' as const };
  const thoai1 = parseVietnameseChatMove(redAgain, 'thoái 1', 'red_chariot_1');
  assert.ok(thoai1.move, 'Expected shorthand thoái 1 to resolve');
  assert.equal(thoai1.move!.from.row, 1);
  assert.equal(thoai1.move!.to.row, 2);
});

test('classifies TikTok chat intents (!choi, !nu 24, move candidates, normal chat)', () => {
  assert.equal(classifyChatMessage('!choi').type, 'challenge');
  assert.equal(classifyChatMessage('lên đài đấu với bot').type, 'challenge');

  const prof = classifyChatMessage('!nu 24');
  assert.equal(prof.type, 'guest_profile');
  assert.equal(prof.gender, 'nu');
  assert.equal(prof.age, 24);

  assert.equal(classifyChatMessage('x7 bình 3').type, 'move_candidate');
  assert.equal(classifyChatMessage('Chào mọi người trên live!').type, 'chat');
});
