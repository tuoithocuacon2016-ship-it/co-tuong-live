import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BoardState,
  Coord,
  Piece,
  PieceType,
  Side,
  createEmptyGrid,
  createInitialBoard,
  generateLegalMoves,
  isInCheck,
  makeMove,
} from './xiangqi';
import { KillPatternId, detectKillPattern } from './patterns';

interface Spec {
  r: number;
  c: number;
  side: Side;
  type: PieceType;
}

function buildBoard(pieces: Spec[], turn: Side): BoardState {
  const grid = createEmptyGrid();
  pieces.forEach((p, idx) => {
    const piece: Piece = { id: `${p.side}_${p.type}_${idx}`, side: p.side, type: p.type };
    grid[p.r][p.c] = piece;
  });
  return { grid, turn, moveCount: 20, lastMove: null, status: 'playing', inCheck: null };
}

function play(state: BoardState, from: Coord, to: Coord) {
  const move = generateLegalMoves(state.grid, state.turn).find(
    (m) => m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col,
  );
  assert.ok(move, `Move (${from.row},${from.col})->(${to.row},${to.col}) must be legal`);
  const after = makeMove(state, move!);
  const hit = detectKillPattern(state.grid, after.grid, move!);
  return { move: move!, after, hit };
}

function expectPattern(
  label: string,
  pieces: Spec[],
  from: Coord,
  to: Coord,
  want: KillPatternId,
): void {
  const { hit } = play(buildBoard(pieces, 'black'), from, to);
  assert.ok(hit, `${label}: expected ${want}, got no pattern`);
  assert.equal(hit!.id, want, `${label}: expected ${want}, got ${hit!.id}`);
}

test('Ngọa Tào Mã is the horse on the defender 2nd rank x files 3/7', () => {
  expectPattern(
    'ngoa_tao_ma',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 6, c: 1, side: 'black', type: 'horse' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 3, side: 'red', type: 'advisor' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 6, col: 1 },
    { row: 8, col: 2 },
    'ngo_tao_ma',
  );
});

test('A horse on the defender 3rd rank x files 3/7 is Điếu Ngư Mã, NOT Ngọa Tào Mã', () => {
  // Regression: the shipped engine labels (7,2)/(7,6) as Ngọa Tào Mã.
  expectPattern(
    'dieu_ngu_ma',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 5, c: 1, side: 'black', type: 'horse' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 3, side: 'red', type: 'advisor' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 5, col: 1 },
    { row: 7, col: 2 },
    'dieu_ngu_ma',
  );
});

test('A horse parked on the defender advisor-corner is Quải Giác Mã', () => {
  // Black horse lands on (7,5): the repo's own mate-in-2 fixture calls this "Ngọa Tào".
  expectPattern(
    'qua_giac_ma',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 5, c: 6, side: 'black', type: 'horse' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
      { r: 4, c: 2, side: 'black', type: 'chariot' },
      { r: 6, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 5, col: 6 },
    { row: 7, col: 5 },
    'qua_giac_ma',
  );
});

test('Mã Hậu Pháo: cannon checks through the horse that sits beside the king', () => {
  expectPattern(
    'ma_hau_phao',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 5, c: 2, side: 'black', type: 'cannon' },
      { r: 9, c: 3, side: 'black', type: 'horse' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 8, c: 4, side: 'red', type: 'advisor' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 5, col: 2 },
    { row: 9, col: 2 },
    'ma_hau_phao',
  );
});

test('Trùng Pháo: rear cannon fires over the friendly front cannon', () => {
  expectPattern(
    'trong_phao',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 5, c: 1, side: 'black', type: 'cannon' },
      { r: 9, c: 3, side: 'black', type: 'cannon' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 8, c: 4, side: 'red', type: 'advisor' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 5, col: 1 },
    { row: 9, col: 1 },
    'trong_phao',
  );
});

test('Bế Cung: one cannon mates a home king smothered by its own advisors', () => {
  expectPattern(
    'be_cung',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 4, c: 0, side: 'black', type: 'cannon' },
      { r: 0, c: 5, side: 'black', type: 'chariot' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 3, side: 'red', type: 'advisor' },
      { r: 8, c: 4, side: 'red', type: 'advisor' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 4, col: 0 },
    { row: 9, col: 0 },
    'be_cung',
  );
});

test('Bát Hoàng Mã: vacating the horse leg unbrings a hidden check', () => {
  expectPattern(
    'bat_hoang_ma',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 7, c: 5, side: 'black', type: 'horse' },
      { r: 8, c: 5, side: 'black', type: 'chariot' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 3, side: 'red', type: 'advisor' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 8, col: 5 },
    { row: 2, col: 5 },
    'bat_hoang_ma',
  );
});

test('Thiết Môn Thuyên: middle-file cannon pin plus a piece sealed on the 肋 gate', () => {
  expectPattern(
    'thiet_mon_thuyen',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 4, c: 8, side: 'black', type: 'cannon' },
      { r: 8, c: 3, side: 'black', type: 'soldier' },
      { r: 7, c: 4, side: 'red', type: 'advisor' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 4, col: 8 },
    { row: 4, col: 4 },
    'thiet_mon_thuyen',
  );
});

test('Đại Đao Hoạch Tâm: supported chariot carving the centre advisor', () => {
  expectPattern(
    'dai_dao_hoach_tam',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 8, c: 0, side: 'black', type: 'chariot' },
      { r: 6, c: 3, side: 'black', type: 'horse' },
      { r: 8, c: 4, side: 'red', type: 'advisor' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    { row: 8, col: 0 },
    { row: 8, col: 4 },
    'dai_dao_hoach_tam',
  );
});

test('Song Xa Thác: second chariot covers the escape of a chariot check', () => {
  // Same geometry as the shipped mate-in-1 fixture, which is labelled "Song Xa Quải Giác".
  expectPattern(
    'song_xa_thac',
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 0, c: 4, side: 'black', type: 'advisor' },
      { r: 4, c: 0, side: 'black', type: 'chariot' },
      { r: 8, c: 1, side: 'black', type: 'chariot' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 5, c: 7, side: 'red', type: 'chariot' },
    ],
    { row: 4, col: 0 },
    { row: 9, col: 0 },
    'song_xa_thac',
  );
});

test('Không Đầu Pháo labels a live threat without ever claiming check', () => {
  const { hit } = play(
    buildBoard(
      [
        { r: 0, c: 3, side: 'black', type: 'king' },
        { r: 4, c: 4, side: 'black', type: 'cannon' },
        { r: 0, c: 0, side: 'black', type: 'chariot' },
        { r: 9, c: 4, side: 'red', type: 'king' },
        { r: 3, c: 8, side: 'red', type: 'chariot' },
      ],
      'black',
    ),
    { row: 0, col: 0 },
    { row: 1, col: 0 },
  );
  assert.ok(hit, '空头 facing should be named');
  assert.equal(hit!.id, 'khong_dau_phao');
  assert.equal(hit!.forcing, false, 'a facing cannon is a threat, not a check');
});

test('The opening never fabricates a forcing kill pattern', () => {
  const state = createInitialBoard();
  for (const move of generateLegalMoves(state.grid, 'red')) {
    const after = makeMove(state, move);
    const hit = detectKillPattern(state.grid, after.grid, move);
    if (!hit) continue;
    assert.equal(hit.forcing, false, `${hit.id} must not claim check on move ${move.piece.type}`);
    assert.notEqual(hit.id, 'dai_dao_hoach_tam', 'no centre-advisor carve exists on ply 1');
    assert.ok(isInCheck(after.grid, 'black') === false, 'opening moves cannot check the king');
  }
});

test('Pattern names are always Vietnamese-script, never raw Chinese glyphs', () => {
  const ids: KillPatternId[] = ['ngo_tao_ma', 'phao_nan_dan_sa', 'dai_dao_hoach_tam'];
  const state = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 6, c: 1, side: 'black', type: 'horse' },
      { r: 3, c: 0, side: 'red', type: 'soldier' },
    ],
    'black',
  );
  const { hit } = play(state, { row: 6, col: 1 }, { row: 8, col: 2 });
  assert.ok(hit && ids.includes(hit.id));
  assert.match(hit!.nameVi, /^[A-ZÀ-Ỹ]/, 'nameVi must be the Sino-Vietnamese reading shown to viewers');
  assert.equal(hit!.nameZh, '卧槽马');
});
