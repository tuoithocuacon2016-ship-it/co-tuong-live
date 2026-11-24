import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BoardState,
  Piece,
  PieceType,
  Side,
  createEmptyGrid,
  createInitialBoard,
  generateLegalMoves,
  isInCheck,
  makeMove,
} from './xiangqi';
import { analyzePosition, detectMoveMotif } from './ai';
import { createFastBoard, isSideInCheckFast, SIDE_BLACK, SIDE_RED } from './xiangqiFast';

function buildBoard(
  pieces: Array<{ r: number; c: number; side: Side; type: PieceType }>,
  turn: Side,
  moveCount = 20,
): BoardState {
  const grid = createEmptyGrid();
  pieces.forEach((p, idx) => {
    const piece: Piece = {
      id: `${p.side}_${p.type}_${idx}`,
      side: p.side,
      type: p.type,
    };
    grid[p.r][p.c] = piece;
  });
  return {
    grid,
    turn,
    moveCount,
    lastMove: null,
    status: 'playing',
    inCheck: isInCheck(grid, turn) ? turn : null,
  };
}

test('Kỳ Ma (all levels) NEVER misses immediate Mate-in-1 even with a bait Chariot', () => {
  // Classic double-chariot back-rank checkmate:
  // Black Chariot (8,1) cuts off row 8, Black Chariot (4,0)->(9,0) is immediate checkmate!
  // Bait: undefended Red Chariot at (5,7) to ensure mate beats greedy capture.
  const state = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 0, c: 4, side: 'black', type: 'advisor' },
      { r: 4, c: 0, side: 'black', type: 'chariot' },
      { r: 8, c: 1, side: 'black', type: 'chariot' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 5, c: 7, side: 'red', type: 'chariot' },
    ],
    'black',
  );

  for (const diff of ['nhap_mon', 'cao_thu', 'tong_su'] as const) {
    const res = analyzePosition(state, diff, { mode: 'play' });
    assert.ok(res.bestMove, `${diff} should return a move`);
    const after = makeMove(state, res.bestMove!);
    assert.equal(
      after.status,
      'black_win',
      `${diff} MUST find immediate Mate-in-1 (got ${res.bestNotation}, score ${res.score})`,
    );
  }
});

test('Kỳ Ma finds forced Mate-in-2 (Song Xa Quải Giác + Bạch Kiểm Tướng)', () => {
  // Black King (0,3) controls col 3. Red King (8,4), Red Advisor (8,5).
  // Black Chariots (7,0) & (6,1).
  // Forced Mate-in-2: (6,1)->(8,1) check -> Red King forced to (9,4) -> (7,0)->(9,0) MATE!
  const state = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 7, c: 0, side: 'black', type: 'chariot' },
      { r: 6, c: 1, side: 'black', type: 'chariot' },
      { r: 8, c: 4, side: 'red', type: 'king' },
      { r: 8, c: 5, side: 'red', type: 'advisor' },
      { r: 5, c: 7, side: 'red', type: 'chariot' }, // bait piece!
    ],
    'black',
  );

  const res = analyzePosition(state, 'cao_thu', { mode: 'play' });
  assert.ok(res.bestMove);
  const after1 = makeMove(state, res.bestMove!);
  assert.equal(after1.inCheck, 'red', `Expected forcing check toward mate-in-2, got ${res.bestNotation}`);
  const redReplies = generateLegalMoves(after1.grid, 'red');
  assert.ok(redReplies.length > 0);
  for (const rMove of redReplies) {
    const afterRed = makeMove(after1, rMove);
    const blackFinish = analyzePosition(afterRed, 'cao_thu', { mode: 'play' });
    assert.ok(blackFinish.bestMove);
    const afterMate = makeMove(afterRed, blackFinish.bestMove!);
    assert.equal(
      afterMate.status,
      'black_win',
      `After ${res.bestNotation} -> red reply, Black must mate immediately (got ${blackFinish.bestNotation})`,
    );
  }
});

test('Kỳ Ma executes classic Ngọa Tào Mã + Xe forced Mate-in-2 sát cục', () => {
  // Black King (0,3) controls col 3 (Flying General). Red King (9,4), Red Advisor (9,5).
  // Black Horse (5,6) -> (7,5) Ngọa Tào check -> Red King forced to (8,4) ->
  // Black Chariot (4,2) -> (8,2) MATE (Black Soldier at (6,4) guards (7,4), Horse guards (9,4))!
  const state = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 5, c: 6, side: 'black', type: 'horse' },
      { r: 4, c: 2, side: 'black', type: 'chariot' },
      { r: 6, c: 4, side: 'black', type: 'soldier' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
      { r: 4, c: 8, side: 'red', type: 'chariot' }, // huge bait on row 4!
    ],
    'black',
  );

  const res = analyzePosition(state, 'cao_thu', { mode: 'play' });
  assert.ok(res.bestMove);
  assert.equal(
    res.bestMove!.piece.type === 'horse' &&
      res.bestMove!.to.row === 7 &&
      res.bestMove!.to.col === 5,
    true,
    `Expected Ngọa Tào Mã (5,6)->(7,5) checkmate-in-2, got ${res.bestNotation}`,
  );
  const after1 = makeMove(state, res.bestMove!);
  const redReplies = generateLegalMoves(after1.grid, 'red');
  assert.equal(redReplies.length, 1);
  const afterRed = makeMove(after1, redReplies[0]);
  const finish = analyzePosition(afterRed, 'cao_thu', { mode: 'play' });
  assert.equal(makeMove(afterRed, finish.bestMove!).status, 'black_win');
});

test('Kỳ Ma defends against opponent Mate-in-1 threat instead of grabbing a bait piece', () => {
  // Red threatens immediate mate-in-1: Red Chariot (4,0)->(0,0) while Red Chariot (1,8) cuts row 1!
  // Black Chariot (3,7) MUST defend instead of capturing the bait Red Cannon at (3,2).
  const state = buildBoard(
    [
      { r: 0, c: 4, side: 'black', type: 'king' },
      { r: 3, c: 7, side: 'black', type: 'chariot' },
      { r: 0, c: 3, side: 'black', type: 'advisor' },
      { r: 9, c: 5, side: 'red', type: 'king' },
      { r: 4, c: 0, side: 'red', type: 'chariot' },
      { r: 1, c: 8, side: 'red', type: 'chariot' },
      { r: 3, c: 2, side: 'red', type: 'cannon' },
    ],
    'black',
  );

  const res = analyzePosition(state, 'cao_thu', { mode: 'play' });
  assert.ok(res.bestMove);
  const afterBlack = makeMove(state, res.bestMove!);
  const redMoves = generateLegalMoves(afterBlack.grid, 'red');
  const redCanMateIn1 = redMoves.some((m) => makeMove(afterBlack, m).status === 'red_win');
  assert.equal(
    redCanMateIn1,
    false,
    `Kỳ Ma MUST block Red's Mate-in-1 threat! Played ${res.bestNotation} which allows immediate mate.`,
  );
});

test('Kỳ Ma captures a hanging undefended Red Chariot immediately', () => {
  // Kings are on different files (0,3 vs 9,4) so Black is not in flying-general check.
  const state = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 1, c: 4, side: 'black', type: 'advisor' },
      { r: 2, c: 1, side: 'black', type: 'chariot' },
      { r: 2, c: 6, side: 'black', type: 'horse' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 3, side: 'red', type: 'advisor' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
      { r: 5, c: 1, side: 'red', type: 'chariot' }, // completely hanging!
      { r: 7, c: 7, side: 'red', type: 'cannon' },
      { r: 6, c: 6, side: 'red', type: 'soldier' },
    ],
    'black',
  );

  const res = analyzePosition(state, 'cao_thu', { mode: 'play' });
  assert.ok(res.bestMove);
  assert.equal(
    res.bestMove!.captured?.type,
    'chariot',
    `Expected Black to capture hanging Red Chariot, got ${res.bestNotation}`,
  );
});

test('Kỳ Ma rescues her own attacked Chariot instead of ignoring the threat', () => {
  // Red Horse at (7,3) attacks Black Chariot at (5,4) (on col 4 separating kings too — put Black King at (0,3) so Chariot is free to move anywhere!).
  const state = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 1, c: 4, side: 'black', type: 'advisor' },
      { r: 5, c: 4, side: 'black', type: 'chariot' }, // attacked by Red Horse at (7,3)!
      { r: 2, c: 7, side: 'black', type: 'cannon' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 3, side: 'red', type: 'advisor' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
      { r: 7, c: 3, side: 'red', type: 'horse' }, // attacks (5,4)!
      { r: 8, c: 8, side: 'red', type: 'chariot' },
      { r: 6, c: 0, side: 'red', type: 'soldier' },
    ],
    'black',
  );

  const res = analyzePosition(state, 'cao_thu', { mode: 'play' });
  assert.ok(res.bestMove);
  const movedChariot = res.bestMove!.from.row === 5 && res.bestMove!.from.col === 4;
  const capturedHorse = res.bestMove!.to.row === 7 && res.bestMove!.to.col === 3;
  const blockedHorseLeg = res.bestMove!.to.row === 6 && res.bestMove!.to.col === 3;
  assert.ok(
    movedChariot || capturedHorse || blockedHorseLeg,
    `Kỳ Ma MUST save attacked Chariot at (5,4), got ${res.bestNotation}`,
  );
});

test('Kỳ Ma punishes an early opening blunder instead of blindly playing opening book', () => {
  const b0 = createInitialBoard();
  const legal0 = generateLegalMoves(b0.grid, 'red');
  // Red plays blunder P2 tiến 7 capturing Black Horse at (0,7), leaving Cannon hanging to Black Chariot (0,8)!
  const p2t7 = legal0.find(
    (m) => m.from.row === 7 && m.from.col === 7 && m.to.row === 0 && m.to.col === 7,
  );
  assert.ok(p2t7, 'P2 tiến 7 should be legal');
  const afterRedBlunder = makeMove(b0, p2t7!);

  // Black MUST recapture Red's Cannon at (0,7) with Chariot (0,8)->(0,7) (X9 bình 8)!
  const blackReply = analyzePosition(afterRedBlunder, 'cao_thu', { mode: 'play' });
  assert.ok(blackReply.bestMove);
  assert.equal(
    blackReply.bestMove!.to.row === 0 && blackReply.bestMove!.to.col === 7,
    true,
    `Black MUST recapture Red's Cannon at (0,7) instead of playing book move! Got ${blackReply.bestNotation}`,
  );
});

test('Fast engine check detection matches reference isInCheck and meets real-time speed budget', () => {
  const initial = createInitialBoard();
  const fb = createFastBoard(initial.grid, 'red');
  assert.equal(isSideInCheckFast(fb, SIDE_RED), isInCheck(initial.grid, 'red'));
  assert.equal(isSideInCheckFast(fb, SIDE_BLACK), isInCheck(initial.grid, 'black'));

  const t0 = Date.now();
  const resCaoThu = analyzePosition(initial, 'cao_thu', { mode: 'play' });
  const elapsedCaoThu = Date.now() - t0;
  assert.ok(resCaoThu.bestMove !== null);
  assert.ok(
    (resCaoThu.searchDepth ?? 0) >= 4,
    `Expected cao_thu to reach at least depth 4, got ${resCaoThu.searchDepth}`,
  );
  assert.ok(
    elapsedCaoThu < 450,
    `Expected cao_thu to stay snappy (<450ms), took ${elapsedCaoThu}ms`,
  );

  const t1 = Date.now();
  const resTongSu = analyzePosition(initial, 'tong_su', { mode: 'play' });
  const elapsedTongSu = Date.now() - t1;
  assert.ok(resTongSu.bestMove !== null);
  assert.ok(
    (resTongSu.searchDepth ?? 0) >= 4,
    `Expected tong_su to reach at least depth 4+, got ${resTongSu.searchDepth}`,
  );
  assert.ok(
    elapsedTongSu < 650,
    `Expected tong_su to stay responsive (<650ms), took ${elapsedTongSu}ms`,
  );
});

test('Zero-blunder 10-ply Grandmaster opening & early-midgame self-play stays balanced', () => {
  let state = createInitialBoard();
  const recentKeys: string[] = [];

  for (let ply = 1; ply <= 10; ply++) {
    const res = analyzePosition(state, 'cao_thu', {
      mode: 'play',
      recentPositionKeys: recentKeys,
    });
    assert.ok(res.bestMove, `Ply ${ply} should produce a legal move`);
    assert.ok(
      Math.abs(res.score) < 250,
      `Ply ${ply} (${state.turn} ${res.bestNotation}) should not blunder major material (score=${res.score})`,
    );
    if (res.positionKey) {
      recentKeys.push(res.positionKey);
    }
    state = makeMove(state, res.bestMove!);
  }
});

test('Core AI upgrades: Aspiration Windows + Countermove + Principal Variation (pvLine) & telemetry', () => {
  // Rich midgame tactical board (out of opening book!) so Aspiration Windows & TT PV extraction execute fully
  const midgame = buildBoard(
    [
      { r: 0, c: 4, side: 'black', type: 'king' },
      { r: 0, c: 3, side: 'black', type: 'advisor' },
      { r: 1, c: 4, side: 'black', type: 'advisor' },
      { r: 2, c: 2, side: 'black', type: 'horse' },
      { r: 2, c: 6, side: 'black', type: 'horse' },
      { r: 0, c: 1, side: 'black', type: 'chariot' },
      { r: 3, c: 8, side: 'black', type: 'chariot' },
      { r: 2, c: 4, side: 'black', type: 'cannon' },
      { r: 3, c: 4, side: 'black', type: 'soldier' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
      { r: 8, c: 4, side: 'red', type: 'advisor' },
      { r: 7, c: 2, side: 'red', type: 'horse' },
      { r: 7, c: 6, side: 'red', type: 'horse' },
      { r: 8, c: 0, side: 'red', type: 'chariot' },
      { r: 6, c: 7, side: 'red', type: 'chariot' },
      { r: 7, c: 4, side: 'red', type: 'cannon' },
      { r: 6, c: 4, side: 'red', type: 'soldier' },
    ],
    'black',
    18,
  );

  const res = analyzePosition(midgame, 'cao_thu', { mode: 'play' });
  assert.ok(res.bestMove, 'Midgame search should find a legal move');
  assert.ok((res.searchDepth ?? 0) >= 4, `Expected depth >= 4, got ${res.searchDepth}`);
  assert.ok(
    Array.isArray(res.pvLine) && res.pvLine.length >= 2,
    `Expected multi-ply Principal Variation (pvLine), got ${JSON.stringify(res.pvLine)}`,
  );
  assert.equal(res.pvLine[0], res.bestNotation, 'PV line must start with the best move notation');
  assert.ok(
    (res.nodesSearched ?? 0) > 100,
    `Expected nodesSearched telemetry > 100, got ${res.nodesSearched}`,
  );
  assert.ok(typeof res.elapsedMs === 'number' && res.elapsedMs >= 0);
});

test('detectMoveMotif surfaces authentic Xiangqi kill patterns (Điếu Ngư Mã & Song Xa Thác)', () => {
  // 1. Horse landing on (7,2) is Điếu Ngư Mã (NOT the legacy mislabel Ngọa Tào Mã)
  const dieuNgu = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 5, c: 1, side: 'black', type: 'horse' },
      { r: 9, c: 4, side: 'red', type: 'king' },
      { r: 9, c: 3, side: 'red', type: 'advisor' },
      { r: 9, c: 5, side: 'red', type: 'advisor' },
    ],
    'black',
  );
  const moveHorse = generateLegalMoves(dieuNgu.grid, 'black').find(
    (m) => m.from.row === 5 && m.from.col === 1 && m.to.row === 7 && m.to.col === 2,
  )!;
  const afterHorse = makeMove(dieuNgu, moveHorse);
  assert.equal(detectMoveMotif(dieuNgu.grid, moveHorse, afterHorse.grid), 'Điếu Ngư Mã');

  // 2. Double chariot back-rank check surfaces Song Xa Thác
  const songXa = buildBoard(
    [
      { r: 0, c: 3, side: 'black', type: 'king' },
      { r: 4, c: 0, side: 'black', type: 'chariot' },
      { r: 8, c: 1, side: 'black', type: 'chariot' },
      { r: 9, c: 4, side: 'red', type: 'king' },
    ],
    'black',
  );
  const moveRook = generateLegalMoves(songXa.grid, 'black').find(
    (m) => m.from.row === 4 && m.from.col === 0 && m.to.row === 9 && m.to.col === 0,
  )!;
  const afterRook = makeMove(songXa, moveRook);
  assert.equal(detectMoveMotif(songXa.grid, moveRook, afterRook.grid), 'Song Xa Thác');
});



