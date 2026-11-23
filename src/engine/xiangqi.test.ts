import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areKingsFacing,
  createEmptyGrid,
  createInitialBoard,
  generateLegalMoves,
  generateLegalMovesForSquare,
  isInCheck,
  makeMove,
} from './xiangqi';
import { analyzePosition } from './ai';
import { matchGuestCharacter } from '../data/characters';

test('initial Xiangqi board has 32 pieces and 44 legal opening moves for Red', () => {
  const board = createInitialBoard();
  let count = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board.grid[r][c]) count++;
    }
  }
  assert.equal(count, 32);
  assert.equal(board.turn, 'red');
  const legal = generateLegalMoves(board.grid, 'red');
  assert.equal(legal.length, 44);
});

test('horse leg blocking prevents jumping over adjacent piece', () => {
  const grid = createEmptyGrid();
  grid[0][4] = { id: 'bk', side: 'black', type: 'king' };
  grid[9][4] = { id: 'rk', side: 'red', type: 'king' };
  grid[5][4] = { id: 'rh', side: 'red', type: 'horse' };
  // Block upward horse leg at (4,4)
  grid[4][4] = { id: 'rs', side: 'red', type: 'soldier' };

  const moves = generateLegalMovesForSquare(grid, 5, 4);
  const targets = moves.map((m) => `${m.to.row},${m.to.col}`);
  assert.equal(targets.includes('3,3'), false);
  assert.equal(targets.includes('3,5'), false);
  assert.equal(targets.includes('7,3'), true);
});

test('cannon requires exactly one screen piece to capture', () => {
  const grid = createEmptyGrid();
  grid[0][3] = { id: 'bk', side: 'black', type: 'king' };
  grid[9][4] = { id: 'rk', side: 'red', type: 'king' };
  grid[7][1] = { id: 'rc', side: 'red', type: 'cannon' };
  grid[2][1] = { id: 'bc', side: 'black', type: 'cannon' };
  grid[0][1] = { id: 'bh', side: 'black', type: 'horse' };

  const moves = generateLegalMovesForSquare(grid, 7, 1);
  const targets = moves.map((m) => `${m.to.row},${m.to.col}`);
  // Cannot capture bc directly at (2,1), MUST jump over bc to capture bh at (0,1)
  assert.equal(targets.includes('2,1'), false);
  assert.equal(targets.includes('0,1'), true);
});

test('flying general rule forbids exposing kings on an empty file', () => {
  const grid = createEmptyGrid();
  grid[0][4] = { id: 'bk', side: 'black', type: 'king' };
  grid[9][4] = { id: 'rk', side: 'red', type: 'king' };
  grid[5][4] = { id: 'rr', side: 'red', type: 'chariot' };

  assert.equal(areKingsFacing(grid), false);
  // Red chariot on file 4 cannot move sideways off col 4 because kings would face each other
  const moves = generateLegalMovesForSquare(grid, 5, 4);
  assert.ok(moves.every((m) => m.to.col === 4));
});

test('AI analyzer returns a valid legal move and variations', () => {
  const initial = createInitialBoard();
  const analysis = analyzePosition(initial, 'cao_thu');
  assert.ok(analysis.bestMove !== null);
  assert.ok(analysis.variations.length >= 1);
  assert.ok(analysis.winProbRed >= 4 && analysis.winProbRed <= 96);

  const next = makeMove(initial, analysis.bestMove!);
  assert.equal(next.turn, 'black');
  assert.equal(isInCheck(next.grid, 'red'), false);
});

test('quick guest character matcher picks matching gender and age tier', () => {
  const youngMale = matchGuestCharacter('nam', 18);
  assert.equal(youngMale.gender, 'nam');
  assert.ok(18 >= youngMale.ageMin && 18 <= youngMale.ageMax);

  const femaleHero = matchGuestCharacter('nu', 25);
  assert.equal(femaleHero.gender, 'nu');
  assert.equal(femaleHero.id, 'nu_hong_y_nu_hiep');

  const elderMale = matchGuestCharacter('nam', 68);
  assert.equal(elderMale.gender, 'nam');
  assert.equal(elderMale.beardStyle, 'longWhite');

  const elderFemale = matchGuestCharacter('nu', 65);
  assert.equal(elderFemale.gender, 'nu');
  assert.equal(elderFemale.hairStyle, 'elderBun');
});

test('Grandmaster AI recommends authentic opening on Move 0 without horizon-effect blunder', () => {
  const initial = createInitialBoard();
  const analysis = analyzePosition(initial, 'cao_thu');
  assert.ok(analysis.bestMove !== null);
  const validOpenings = [
    'P2 bình 5',
    'P8 bình 5',
    'B7 tiến 1',
    'B3 tiến 1',
    'T3 tiến 5',
    'M2 tiến 3',
  ];
  assert.ok(
    validOpenings.includes(analysis.bestNotation),
    `Expected classical opening, got ${analysis.bestNotation}`,
  );
  // Quiescence must keep opening evaluation balanced (never -4.0!)
  assert.ok(
    analysis.score > -120 && analysis.score < 160,
    `Expected balanced opening score, got ${analysis.score}`,
  );
  // Top variation must have a genuine classical Black reply (never bogus P8 tiến 7)
  assert.ok(analysis.variations[0].replyNotation !== 'P8 tiến 7');
  assert.ok(analysis.variations[0].replyNotation !== 'P2 tiến 7');
});

test('Grandmaster AI replies to Pháo Đầu (P2 bình 5) with classical defense (Bình Phong Mã / Thuận Pháo)', () => {
  const initial = createInitialBoard();
  const legal = generateLegalMoves(initial.grid, 'red');
  const phaoDau = legal.find(
    (m) => m.from.row === 7 && m.from.col === 7 && m.to.row === 7 && m.to.col === 4,
  );
  assert.ok(phaoDau, 'P2 bình 5 should be legal');
  const afterRed = makeMove(initial, phaoDau!);

  const blackAnalysis = analyzePosition(afterRed, 'cao_thu');
  const validDefenses = ['M8 tiến 7', 'M2 tiến 3', 'P8 bình 5', 'P2 bình 5'];
  assert.ok(
    validDefenses.includes(blackAnalysis.bestNotation),
    `Expected classical defense against Pháo Đầu, got ${blackAnalysis.bestNotation}`,
  );
  // Score after P2 bình 5 should remain balanced (quiescence resolves cannon-horse exchanges)
  assert.ok(
    Math.abs(blackAnalysis.score) < 160,
    `Expected balanced score after P2 bình 5, got ${blackAnalysis.score}`,
  );
});

