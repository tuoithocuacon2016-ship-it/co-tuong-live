import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONCESSION_LINE_VI,
  EVEN_CONCESSION,
  HANDICAP_IDS,
  HANDICAP_LADDER,
  afterOwnerPly,
  applyHandicap,
  concessionBlock,
  concessionLegalMoves,
  createConcessionState,
  flankForRung,
  handicapFor,
  offersFlankChoice,
  openConcession,
  parseConcession,
  pickGuestMove,
  readConcessionFromSearch,
  resolveHandicap,
  serializeConcession,
  takesBothFlanks,
} from './handicap';
import type { ConcessionChoice, Flank, HandicapId } from './handicap';
import {
  cloneGrid,
  createInitialBoard,
  generateLegalMoves,
  isInCheck,
  makeMove,
} from './xiangqi';
import type { BoardState, Move, Piece, Side } from './xiangqi';
import { analyzePosition } from './ai';
import { COMMENTARY_TOKENS } from './commentaryBank';
import { NIGHT_THEMES, nightBookFavour } from './nightThemes';

type Square = [row: number, col: number];
type Edit = [from: Square, to: Square];

/**
 * A board with stones relocated, so each rule can be shown on the square it is about instead of on
 * a contrived full game. `moveCount` stays 0, which is what `applyHandicap` insists on.
 */
function relocate(base: BoardState, edits: Edit[]): BoardState {
  const grid = cloneGrid(base.grid);
  for (const [[fr, fc], [tr, tc]] of edits) {
    const piece = grid[fr][fc];
    assert.ok(piece, `relocation source ${fr},${fc} is empty`);
    assert.equal(grid[tr][tc], null, `relocation target ${tr},${tc} is occupied`);
    grid[tr][tc] = piece;
    grid[fr][fc] = null;
  }
  return { ...base, grid };
}

const edited = (edits: Edit[]): BoardState => relocate(createInitialBoard(), edits);

function setup(board: BoardState, id: HandicapId, flank?: Flank) {
  const result = applyHandicap(board, id, flank);
  assert.ok(result.ok, 'the concession must be applicable before the first ply');
  assert.deepEqual(result.absent, [], 'every conceded square was expected to hold a stone');
  return result;
}

function pieceAt(board: BoardState, at: Square): Piece {
  const piece = board.grid[at[0]][at[1]];
  assert.ok(piece, `expected a piece at ${at[0]},${at[1]}`);
  return piece;
}

/** A ply the side to move really has, so a test cannot invent an impossible capture. */
function plyFor(board: BoardState, side: Side, from: Square, to: Square): Move {
  const move = generateLegalMoves(board.grid, side).find(
    (m) => m.from.row === from[0] && m.from.col === from[1] && m.to.row === to[0] && m.to.col === to[1],
  );
  assert.ok(move, `${side} was expected to have ${from}->${to} here`);
  return move;
}

const guest = (board: BoardState, from: Square, to: Square): Move => plyFor(board, 'red', from, to);

/**
 * A bride ply on an already-relocated board: the stone is read where it ended up, because these
 * positions are set directly rather than played out.
 */
function ownerPly(board: BoardState, from: Square, to: Square): Move {
  const piece = pieceAt(board, to);
  assert.equal(piece.side, 'black', 'the concession shields the bride stones only');
  return { from: { row: from[0], col: from[1] }, to: { row: to[0], col: to[1] }, piece };
}

function countPieces(grid: BoardState['grid']) {
  const out = { red: {} as Record<string, number>, black: {} as Record<string, number>, total: 0 };
  for (const row of grid) {
    for (const piece of row) {
      if (!piece) continue;
      out[piece.side][piece.type] = (out[piece.side][piece.type] ?? 0) + 1;
      out.total += 1;
    }
  }
  return out;
}

test('the ladder is the folk 让子 ladder, ordered by what the engine itself charges for the stones', () => {
  assert.deepEqual(HANDICAP_IDS, [
    'khong_chap',
    'chap_mot_ma',
    'chap_hai_ma',
    'chap_mot_phao',
    'chap_mot_xe',
  ]);
  assert.deepEqual(
    HANDICAP_LADDER.map((handicap) => handicap.id),
    ['khong_chap', 'chap_mot_ma', 'chap_mot_phao', 'chap_hai_ma', 'chap_mot_xe'],
    'severity follows the tapered material table, not a guess about which stone hurts more',
  );
  assert.deepEqual(HANDICAP_LADDER.map((handicap) => handicap.rank), [0, 1, 2, 3, 4]);

  const costs = HANDICAP_LADDER.map((handicap) => handicap.costMg);
  assert.equal(costs[0], 0);
  for (let i = 1; i < costs.length; i++) {
    assert.ok(costs[i] > costs[i - 1], `rung ${i} must cost more than the rung below it`);
  }
  assert.equal(
    handicapFor('chap_hai_ma').costMg,
    handicapFor('chap_mot_ma').costMg * 2,
    'the two-horse rung is exactly twice the one-horse rung',
  );

  assert.equal(HANDICAP_LADDER[0].nameVi, 'Đi Thuận Cờ');
  assert.deepEqual(HANDICAP_LADDER[0].shields, []);
  // The default flank is Black's file 2: the horse fewest nights' book lines are written from.
  assert.equal(handicapFor('chap_mot_ma').nameVi, 'Chấp Một Mã 2');
  assert.equal(handicapFor('chap_mot_ma', 'ben_phai').nameVi, 'Chấp Một Mã 8');
  assert.equal(handicapFor('chap_hai_ma').nameVi, 'Chấp Hai Mã');
  assert.equal(handicapFor('chap_mot_phao').nameVi, 'Chấp Một Pháo 2');
  assert.equal(handicapFor('chap_mot_xe', 'ben_phai').nameVi, 'Chấp Một Xe 9');
});

test('every conceded square really holds the stone the rules say is given away', () => {
  const opening = createInitialBoard();
  for (const id of HANDICAP_IDS) {
    for (const flank of ['ben_trai', 'ben_phai', 'ca_hai'] as const) {
      for (const target of handicapFor(id, flank).removed) {
        const piece = opening.grid[target.at.row][target.at.col];
        assert.ok(
          piece && piece.side === 'black' && piece.type === target.type,
          `${id}/${flank} claims to give away a ${target.type} at ${target.at.row},${target.at.col}`,
        );
      }
    }
  }
});

test('applying a concession takes exactly one stone and re-signs the opening position', () => {
  const opening = createInitialBoard();
  const { board, handicap } = setup(opening, 'chap_mot_ma', 'ben_phai');

  assert.equal(handicap.removed.length, 1);
  const before = countPieces(opening.grid);
  const after = countPieces(board.grid);
  assert.equal(after.black.horse, before.black.horse - 1);
  assert.equal(after.total, before.total - 1, 'nothing else may leave the board');
  assert.equal(board.grid[0][7], null);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      if (row === 0 && col === 7) continue;
      assert.deepEqual(board.grid[row][col], opening.grid[row][col], `${row},${col} moved on its own`);
    }
  }

  assert.equal(board.turn, 'red');
  assert.equal(board.moveCount, 0);
  assert.equal(board.status, 'playing');

  // The referee has to start from the array the game is really played from, or every later position
  // key is compared against a phantom 32-stone opening.
  assert.equal(board.refereeHistory?.length, 1);
  assert.notEqual(board.refereeHistory![0].key, opening.refereeHistory![0].key);
  assert.equal(makeMove(board, guest(board, [9, 7], [7, 6])).refereeHistory?.length, 2);
});

test('a game already under way is never re-hobbled', () => {
  const opening = createInitialBoard();
  const started = makeMove(opening, guest(opening, [7, 7], [7, 4]));
  const result = applyHandicap(started, 'chap_mot_ma');
  assert.equal(result.ok, false);
  assert.equal(result.board, started, 'the board must come back untouched');
  assert.equal(countPieces(result.board.grid).total, 32);
});

test('conceding twice reports the empty square instead of silently taking nothing', () => {
  const once = setup(createInitialBoard(), 'chap_hai_ma');
  const twice = applyHandicap(once.board, 'chap_hai_ma');
  assert.equal(twice.ok, true);
  assert.deepEqual(twice.absent, [
    { row: 0, col: 1 },
    { row: 0, col: 7 },
  ]);
  assert.deepEqual(twice.board.grid, once.board.grid, 'the second apply must change nothing');
});

test('铁兵: the centre soldier the given horse was guarding cannot be taken', () => {
  // A Red chariot on each of files 5 and 3, so one legal list offers a forbidden grab and an
  // ordinary one; Black's own cannon at 1,4 keeps the file-5 grab from being a check, which is the
  // single exception the source allows.
  const { board: conceded, state } = setup(
    edited([
      [
        [9, 0],
        [4, 4],
      ],
      [
        [9, 8],
        [4, 2],
      ],
      [
        [2, 1],
        [1, 4],
      ],
    ]),
    'chap_mot_ma',
    'ben_phai',
  );
  const centre = guest(conceded, [4, 4], [3, 4]);
  const flank = guest(conceded, [4, 2], [3, 2]);
  assert.equal(centre.captured?.type, 'soldier');
  assert.equal(flank.captured?.type, 'soldier');

  assert.equal(concessionBlock(conceded, state, centre)?.rule, 'thiet_binh');
  assert.equal(concessionBlock(conceded, state, flank), null, 'only file 5 is the iron soldier');

  const all = generateLegalMoves(conceded.grid, 'red');
  const allowed = concessionLegalMoves(conceded, state, all);
  assert.equal(allowed.length, all.length - 1, 'one refusal, and only the one that was due');
  assert.ok(!allowed.some((m) => m.to.row === 3 && m.to.col === 4));

  const blackAll = generateLegalMoves(conceded.grid, 'black');
  assert.equal(
    concessionLegalMoves(conceded, state, blackAll).length,
    blackAll.length,
    'a shield protects the bride from the guest, never the bride from herself',
  );

  // Without the rung the same capture is simply chess: the filter is the concession, not the board.
  const even = createConcessionState(handicapFor('khong_chap'));
  assert.equal(concessionBlock(conceded, even, centre), null);
});

test('铁兵 lets the capture through when taking it checks the king', () => {
  // Nothing shielding Black's king on file 5 now: "只有在叫将时才能吃".
  const { board: conceded, state } = setup(
    edited([
      [
        [9, 0],
        [4, 4],
      ],
    ]),
    'chap_mot_ma',
    'ben_phai',
  );
  assert.equal(concessionBlock(conceded, state, guest(conceded, [4, 4], [3, 4])), null);
});

test('铁兵 ends the moment the soldier leaves its rank', () => {
  const { board: conceded, state } = setup(
    edited([
      [
        [3, 4],
        [4, 4],
      ],
      [
        [9, 8],
        [4, 2],
      ],
    ]),
    'chap_mot_ma',
    'ben_phai',
  );
  const taken = guest(conceded, [4, 2], [4, 4]);
  assert.equal(taken.captured?.type, 'soldier');
  assert.equal(
    concessionBlock(conceded, state, taken),
    null,
    'a moved iron soldier is an ordinary soldier, so the guest must be able to take it',
  );
});

test('铁炮: the cannon left at home is not for sale', () => {
  const { board: conceded, state } = setup(
    edited([
      [
        [9, 0],
        [2, 0],
      ],
    ]),
    'chap_mot_phao',
  );
  assert.equal(conceded.grid[2][1], null, 'the given cannon is off the board');
  const idle = guest(conceded, [2, 0], [2, 7]);
  assert.equal(idle.captured?.type, 'cannon');
  assert.equal(concessionBlock(conceded, state, idle)?.rule, 'thiet_phao');

  const { board: stirred, state: stirredState } = setup(
    edited([
      [
        [9, 0],
        [2, 0],
      ],
      [
        [2, 7],
        [2, 6],
      ],
    ]),
    'chap_mot_phao',
  );
  assert.equal(concessionBlock(stirred, stirredState, guest(stirred, [2, 0], [2, 6])), null);
});

test('铁马: only the horse sitting beside the given chariot is a fortress', () => {
  const { board: conceded, state } = setup(
    edited([
      [
        [9, 0],
        [1, 7],
      ],
      [
        [9, 8],
        [1, 1],
      ],
    ]),
    'chap_mot_xe',
    'ben_phai',
  );
  assert.equal(conceded.grid[0][8], null, 'the given chariot is off the board');
  assert.deepEqual(handicapFor('chap_mot_xe', 'ben_phai').sittingHorseCols, [7]);

  const sitting = guest(conceded, [1, 7], [0, 7]);
  assert.equal(sitting.captured?.type, 'horse');
  assert.equal(concessionBlock(conceded, state, sitting)?.rule, 'thiet_ma');

  const far = guest(conceded, [1, 1], [0, 1]);
  assert.equal(concessionBlock(conceded, state, far), null, '一座宫 covers one flank only');

  const { board: unseated, state: unseatedState } = setup(
    edited([
      [
        [9, 0],
        [1, 7],
      ],
      [
        [0, 7],
        [1, 5],
      ],
    ]),
    'chap_mot_xe',
    'ben_phai',
  );
  assert.equal(concessionBlock(unseated, unseatedState, guest(unseated, [1, 7], [1, 5])), null);
});

test('不出林车: a chariot whose first move is a straight slide is safe, even in the cannon mouth', () => {
  // Red's cannon on file 2 has Black's own cannon at 2,1 for a screen, so the developed chariot on
  // 0,1 is a real cannon capture - the position the folk rule was written for. Played out for real,
  // because only the bride's own move order can create the immunity.
  const { board: conceded, state } = setup(
    edited([
      [
        [7, 1],
        [3, 1],
      ],
      [
        [9, 0],
        [1, 0],
      ],
    ]),
    'chap_hai_ma',
  );
  assert.deepEqual(handicapFor('chap_hai_ma').vacatedHorseCols, [1, 7]);

  const developed = afterOwnerPly(state, plyFor(conceded, 'black', [0, 0], [0, 1]));
  assert.equal(developed.straightChariots.length, 1);
  const afterSlide = makeMove(conceded, plyFor(conceded, 'black', [0, 0], [0, 1]));

  const inMouth = guest(afterSlide, [3, 1], [0, 1]);
  assert.equal(inMouth.captured?.type, 'chariot');
  assert.equal(concessionBlock(afterSlide, developed, inMouth)?.rule, 'xuat_lin_xe');

  // The immunity is that square and that one move only: send the same chariot home and it is due.
  const back = plyFor(afterSlide, 'black', [0, 1], [0, 0]);
  const retreated = afterOwnerPly(developed, back);
  assert.deepEqual(retreated.straightChariots, [], 'a second move is no longer the first move');
  const afterBack = makeMove(afterSlide, back);
  assert.equal(concessionBlock(afterBack, retreated, guest(afterBack, [1, 0], [0, 0])), null);
});

test('出林车 belongs to each flank on its own, and a chariot that merely advances earns nothing', () => {
  const { board: conceded, state } = setup(createInitialBoard(), 'chap_hai_ma');

  const both = relocate(conceded, [
    [
      [9, 0],
      [1, 1],
    ],
    [
      [9, 8],
      [1, 7],
    ],
    [
      [0, 0],
      [0, 1],
    ],
    [
      [0, 8],
      [0, 7],
    ],
  ]);
  const developed = afterOwnerPly(
    afterOwnerPly(state, ownerPly(both, [0, 0], [0, 1])),
    ownerPly(both, [0, 8], [0, 7]),
  );
  assert.equal(developed.straightChariots.length, 2, '让双马 opens both horse files, so both count');
  assert.equal(concessionBlock(both, developed, guest(both, [1, 1], [0, 1]))?.rule, 'xuat_lin_xe');
  assert.equal(concessionBlock(both, developed, guest(both, [1, 7], [0, 7]))?.rule, 'xuat_lin_xe');

  const advanced = relocate(conceded, [
    [
      [9, 0],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
    ],
  ]);
  const noSlide = afterOwnerPly(state, ownerPly(advanced, [0, 0], [1, 0]));
  assert.deepEqual(noSlide.straightChariots, [], 'a chariot that simply advances is not 出林车');
  assert.equal(concessionBlock(advanced, noSlide, guest(advanced, [1, 1], [1, 0])), null);
});

test('a conceded night never scripts a ply from a square the concession emptied', () => {
  // Nights 1 and 5 write Black's first book ply from a horse file and nights 2, 3, 4, 6 from a cannon
  // file, so a concession that empties one of those squares must silence that night's nudge instead
  // of pushing the search toward a stone that is not on the board.
  const flanks: Flank[] = ['ben_trai', 'ben_phai', 'ca_hai'];
  let guarded = 0;
  let offered = 0;

  for (const id of HANDICAP_IDS) {
    for (const flank of flanks) {
      const { board: conceded } = setup(createInitialBoard(), id, flank);
      for (const theme of NIGHT_THEMES) {
        const invite = generateLegalMoves(conceded.grid, 'red').find(
          (m) =>
            m.from.row === theme.invite.from.row &&
            m.from.col === theme.invite.from.col &&
            m.to.row === theme.invite.to.row &&
            m.to.col === theme.invite.to.col,
        );
        assert.ok(invite, `${id}/${flank}: night ${theme.index} cannot even be invited`);
        const position = makeMove(conceded, invite);
        const occupant = position.grid[theme.answer.from.row][theme.answer.from.col];
        const favour = nightBookFavour(theme, position);

        if (!occupant || occupant.type !== theme.answer.type) {
          assert.deepEqual(
            favour,
            [],
            `${id}/${flank} scripted ${theme.answer.notation} from a square holding ` +
              `${occupant ? occupant.type : 'nothing'}`,
          );
          guarded += 1;
        } else if (id === 'khong_chap') {
          assert.deepEqual(favour, [{ from: theme.answer.from, to: theme.answer.to }]);
          offered += 1;
        }
      }
    }
  }

  assert.ok(guarded > 0, 'the guard needs a conceded night to actually bite on');
  assert.ok(offered > 0, 'the guard must not switch the book off on an even board');
});

test('a conceded array still searches, so the overlay costs the bride no strength', () => {
  const { board, handicap } = setup(createInitialBoard(), 'chap_hai_ma');
  assert.equal(handicap.removed.length, 2);
  assert.ok(generateLegalMoves(board.grid, 'red').length > 30);
  const analysis = analyzePosition(board, 'cao_thu', { mode: 'preview' });
  assert.ok(analysis.bestMove, 'the bride must still have a move');
  assert.ok(Number.isFinite(analysis.score));
});

test('the concession is spoken, tokenised, and never in the banned register', () => {
  const known = new Set<string>([...COMMENTARY_TOKENS]);
  const cjk = /[\u3400-\u9FFF\u3040-\u30FF]/;
  const claims = new Set<string>();

  for (const handicap of HANDICAP_LADDER) {
    assert.ok(handicap.nameVi.length > 4);
    assert.ok(!cjk.test(`${handicap.nameVi} ${handicap.claimVi}`), `${handicap.id} leaked a Chinese glyph`);
    assert.ok(!/\b(chàng|thiếp)\b|hai họ/i.test(handicap.claimVi), `${handicap.id} assumed a groom`);
    assert.ok(!/thắng thì được|được nàng/i.test(handicap.claimVi), `${handicap.id} priced the bride`);
    claims.add(handicap.claimVi);
    for (const token of handicap.claimVi.match(/\{(\w+)\}/g) ?? []) {
      assert.ok(known.has(token.slice(1, -1)), `${handicap.id} uses unknown token ${token}`);
    }
  }
  assert.equal(claims.size, HANDICAP_LADDER.length, 'every rung must announce itself differently');

  const shielded = new Set(HANDICAP_LADDER.flatMap((handicap) => handicap.shields));
  assert.deepEqual([...shielded].sort(), ['thiet_binh', 'thiet_ma', 'thiet_phao', 'xuat_lin_xe']);
  for (const rule of shielded) {
    const line = CONCESSION_LINE_VI[rule];
    assert.ok(line.length > 20, `${rule} has no spoken refusal`);
    assert.ok(!cjk.test(line), `${rule} refusal leaked a Chinese glyph`);
    assert.ok(!/\b(chàng|thiếp)\b|hai họ/i.test(line), `${rule} refusal assumed a groom`);
    for (const token of line.match(/\{(\w+)\}/g) ?? []) {
      assert.ok(known.has(token.slice(1, -1)), `${rule} refusal uses unknown token ${token}`);
    }
  }
});

test('the URL only ever selects a rung the ladder offers', () => {
  assert.deepEqual(resolveHandicap('chap_mot_ma', '8'), { id: 'chap_mot_ma', flank: 'ben_phai' });
  assert.deepEqual(resolveHandicap('chap_mot_ma', '2'), { id: 'chap_mot_ma', flank: 'ben_trai' });
  assert.deepEqual(resolveHandicap('chap_hai_ma', 'both'), { id: 'chap_hai_ma', flank: 'ca_hai' });
  assert.deepEqual(resolveHandicap('chap_mot_xe', 'ben_phai'), {
    id: 'chap_mot_xe',
    flank: 'ben_phai',
  });
  // A viewer who asks for 让双车 - which nobody plays - gets the even game, not a broken board.
  assert.deepEqual(resolveHandicap('chap_hai_xe', undefined), { id: 'khong_chap', flank: 'ben_trai' });
  assert.deepEqual(resolveHandicap(undefined, 'ben_khong_ai'), {
    id: 'khong_chap',
    flank: 'ben_trai',
  });
});

test('a shield blocks greed, never survival', () => {
  // The position that looks able to strand the clock: Black's cannon checking down file 5 over the
  // iron soldier. The engine refuses that capture on its own - the piece that takes the soldier just
  // becomes the screen - so the concession costs a checked guest nothing at all.
  const { board: conceded, state } = setup(
    edited([
      [
        [2, 7],
        [1, 4],
      ],
      [
        [6, 4],
        [6, 3],
      ],
      [
        [9, 1],
        [4, 2],
      ],
    ]),
    'chap_mot_ma',
    'ben_phai',
  );
  assert.ok(isInCheck(conceded.grid, 'red'), 'the fixture is meant to be a cannon check through the soldier');
  const all = generateLegalMoves(conceded.grid, 'red');
  assert.ok(all.length > 0, 'a guest in check still has an answer to find');
  assert.ok(
    !all.some((m) => m.captured && m.to.row === 3 && m.to.col === 4),
    'taking the iron soldier may not even be legal here',
  );
  assert.equal(
    concessionLegalMoves(conceded, state, all).length,
    all.length,
    'under check the concession refuses nothing that was playable',
  );

  // The same horse, the same soldier, no check: now it is the shield doing the work.
  const { board: calm, state: calmState } = setup(
    edited([
      [
        [6, 4],
        [6, 3],
      ],
      [
        [9, 1],
        [4, 2],
      ],
    ]),
    'chap_mot_ma',
    'ben_phai',
  );
  assert.ok(!isInCheck(calm.grid, 'red'));
  assert.equal(concessionBlock(calm, calmState, guest(calm, [4, 2], [3, 4]))?.rule, 'thiet_binh');
});

test('the move played for the guest is always one the concession allows', () => {
  const { board: conceded, state } = setup(
    edited([
      [
        [9, 0],
        [4, 4],
      ],
      [
        [9, 8],
        [4, 2],
      ],
      [
        [2, 1],
        [1, 4],
      ],
    ]),
    'chap_mot_ma',
    'ben_phai',
  );
  const centre = guest(conceded, [4, 4], [3, 4]);
  const flank = guest(conceded, [4, 2], [3, 2]);

  assert.equal(pickGuestMove(conceded, state, [centre, flank], centre)?.to.col, 2, 'a blocked favourite falls to the next playable move');
  assert.equal(pickGuestMove(conceded, state, [flank, centre], flank), flank, 'an allowed favourite is kept');
  assert.equal(pickGuestMove(conceded, state, [flank]), flank, 'no favourite is still a move');
  assert.equal(
    pickGuestMove(conceded, state, [centre], centre),
    null,
    'nothing playable is reported as nothing, never played anyway',
  );
  assert.equal(pickGuestMove(conceded, state, [], null), null);
});

test('the rung comes from the link or from storage, and nothing else can break it', () => {
  assert.deepEqual(readConcessionFromSearch('?chap=chap_mot_xe&flank=9', null), {
    id: 'chap_mot_xe',
    flank: 'ben_phai',
  });
  assert.deepEqual(readConcessionFromSearch('chap=chap_mot_ma&flank=ca_hai', null), {
    id: 'chap_mot_ma',
    flank: 'ca_hai',
  });
  assert.deepEqual(readConcessionFromSearch('', 'chap_hai_ma|ben_phai'), {
    id: 'chap_hai_ma',
    flank: 'ben_phai',
  });
  // The link wins, but only when it names a rung the ladder offers.
  assert.deepEqual(readConcessionFromSearch('?chap=chap_hai_xe', 'chap_mot_ma|ben_phai'), {
    id: 'chap_mot_ma',
    flank: 'ben_phai',
  });
  // An unreadable link and an unreadable store together are the even game, never a broken board.
  assert.deepEqual(readConcessionFromSearch('?chap=chap_mot_phao', 'not-a-rung'), {
    id: 'chap_mot_phao',
    flank: 'ben_trai',
  });
  assert.deepEqual(readConcessionFromSearch('', 'junk|junk'), EVEN_CONCESSION);
  assert.deepEqual(readConcessionFromSearch('', null), EVEN_CONCESSION);
  assert.deepEqual(
    parseConcession(serializeConcession({ id: 'chap_mot_ma', flank: 'ben_phai' })),
    { id: 'chap_mot_ma', flank: 'ben_phai' },
  );
});

test('the opening is laid once, board and ledger together', () => {
  const laid = openConcession({ id: 'chap_mot_xe', flank: 'ben_phai' });
  assert.ok(laid.ok);
  assert.equal(laid.board.grid[0][8], null, 'the conceded chariot is off the array');
  assert.deepEqual(
    laid.state.handicap.removed.map((target) => target.at),
    [{ row: 0, col: 8 }],
  );
  assert.equal(laid.board.moveCount, 0);
  assert.deepEqual(laid.state.straightChariots, [], 'the ledger starts with nothing earned');
  assert.equal(laid.board.refereeHistory?.length, 1);

  const even = openConcession(EVEN_CONCESSION);
  assert.equal(countPieces(even.board.grid).total, 32);
  assert.deepEqual(even.state.handicap.shields, []);
  assert.equal(even.state.handicap.rank, 0);
});

test('让双马 is the only rung taken from both flanks, and it carries 不出林车 with it', () => {
  const both = handicapFor('chap_mot_ma', 'ca_hai');
  assert.equal(both.removed.length, 2);
  assert.equal(both.nameVi, 'Chấp Hai Mã');
  assert.deepEqual(both.shields, ['thiet_binh', 'xuat_lin_xe'], 'the protection follows the empty files');
  assert.deepEqual(both.vacatedHorseCols, [1, 7]);
  assert.equal(both.costMg, handicapFor('chap_hai_ma').costMg);
  assert.ok(takesBothFlanks('chap_mot_ma'));

  // 让双车 and 让双炮 are on nobody's ladder, so "both" cannot ask for them.
  for (const id of ['chap_mot_phao', 'chap_mot_xe'] as const) {
    assert.equal(handicapFor(id, 'ca_hai').removed.length, 1, `${id} stays a single stone`);
    assert.ok(!takesBothFlanks(id));
  }
  assert.ok(!takesBothFlanks('khong_chap'));
});

test('every rung fits the control bar chip it is chosen from', () => {
  assert.deepEqual(
    HANDICAP_LADDER.map((handicap) => handicap.shortVi),
    ['Không chấp', '1 Mã', '1 Pháo', '2 Mã', '1 Xe'],
  );
  for (const handicap of HANDICAP_LADDER) {
    assert.ok(handicap.shortVi.length <= 12, `${handicap.id} is too long for a chip`);
    assert.ok(!/[{}`]/.test(handicap.shortVi), `${handicap.id} leaked a token into a chip`);
  }
});

test('a rung chip never keeps a flank the new rung cannot take', () => {
  // The control bar carries the flank choice across when the operator changes rung. That is only
  // honest while the pairing exists: 让双炮 and 让双车 are not folk rules, so "both" has to fall
  // back to the left flank rather than light up a chip for an array the ladder does not offer.
  assert.deepEqual(
    HANDICAP_IDS.map((id) => flankForRung(id, 'ca_hai')),
    ['ben_trai', 'ca_hai', 'ca_hai', 'ben_trai', 'ben_trai'],
  );
  assert.equal(flankForRung('chap_mot_xe', 'ben_phai'), 'ben_phai');
  assert.deepEqual(
    HANDICAP_IDS.filter(offersFlankChoice),
    ['chap_mot_ma', 'chap_mot_phao', 'chap_mot_xe'],
  );
  for (const id of HANDICAP_IDS) {
    for (const flank of ['ben_trai', 'ben_phai', 'ca_hai'] as Flank[]) {
      const rung = handicapFor(id, flankForRung(id, flank));
      if (rung.gives && rung.gives !== 'horse') {
        assert.equal(rung.removed.length, 1, `${id} asked for ${flank} took ${rung.removed.length}`);
      }
      // A flank row that is hidden must also be a row nothing can be misread from.
      assert.equal(offersFlankChoice(id), rung.removed.length === 1 || id === 'chap_mot_ma', id);
    }
  }
});

test('the evening proposes a rung and the operator can still overrule it', () => {
  const night: ConcessionChoice = { id: 'chap_mot_ma', flank: 'ben_trai' };
  // Link first: the broadcast is steered from the URL, and an unreadable value there must fall
  // through to the night rather than to a broken board.
  assert.deepEqual(readConcessionFromSearch('?chap=chap_mot_xe&flank=9', 'chap_hai_ma|ben_phai', night), {
    id: 'chap_mot_xe',
    flank: 'ben_phai',
  });
  // Then the saved pick, because an explicit choice should not vanish between reloads.
  assert.deepEqual(readConcessionFromSearch('', 'chap_mot_phao|ben_phai', night), {
    id: 'chap_mot_phao',
    flank: 'ben_phai',
  });
  // An explicit even game on the link cancels the night's rung - that is the operator's call too.
  assert.deepEqual(readConcessionFromSearch('?chap=khong_chap', 'junk', night), EVEN_CONCESSION);
  assert.deepEqual(readConcessionFromSearch('?chap=chap_hai_xe', 'junk', night), night);
  assert.deepEqual(readConcessionFromSearch('', undefined, undefined), EVEN_CONCESSION);
});
