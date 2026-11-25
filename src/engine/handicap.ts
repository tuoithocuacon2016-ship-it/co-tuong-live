/**
 * The concession ladder (让子): what the bride gives away before the first stone is touched.
 *
 * Decision 1 of the project is that the search is never weakened. The show's answer to "the Kỳ Ma
 * is too strong" is the one a vỉa hè club uses: start her down real material, keep her full
 * strength, and let the audience watch her claw it back. Every rule here is the attested folk rule
 * from zh.wikibooks 中国象棋/让棋规则 (retrieved 2026-11-25), in the Vietnamese names the club says:
 *
 *   让子 takes a stone off the STRONGER side, and each kind protects what that removal exposes:
 *     让单马 one horse, plus 铁兵 - the centre soldier has lost both horse guards, so while it has
 *           not stirred it may not be taken ("中卒不走不吃"), with the one exception the source
 *           names: a capture that gives check is fair. Once it moves, the limit is gone.
 *     让双马 both horses, 铁兵 still applies, plus 不打 出林车 - a chariot whose FIRST move slides
 *           one step into a vacated horse file may not be taken even sitting in the cannon's mouth.
 *     让单炮 one cannon, plus 铁炮 - the surviving cannon may not be taken while it has not moved.
 *     让单车 one chariot, plus 铁马 (一座宫) - the horse beside the missing chariot may not be taken
 *           while it has not moved. The dearer 三座宫 variant (that flank's horse, cannon and edge
 *           soldier too) is not offered yet.
 *   双车 / 双炮 are rare in play, so they are not on this ladder either.
 *
 * 让先 (让一先/让二先/让三先: free opening plies, no repeating a piece, no captures, and for three
 * plies nothing may cross the river) is deliberately absent. 让一先 is attested as a concession for
 * a whole multi-game match, which the show does not model, and 让二先 means two Red plies in a row -
 * which breaks the "ply parity tells you whose turn it is" reading that ai.ts's opening book and
 * nightBookFavour both rely on. Both need a per-side ply count on the board first.
 *
 * The bride concedes and the challenger is always Red, so the owner below is Black. Only captures
 * of Black pieces can be refused, so the bride's own move lists pass through untouched - and every
 * door a Red move comes in through (board click, chat notation, NLU candidate list, crowd-vote
 * tally, timeout auto-move) has to be filtered, not just the one the guest types into.
 *
 * The search never sees a shield: the bride evaluates as if her iron soldier could be taken, which
 * makes her a shade cautious and costs her nothing on the board.
 */

import { recordForPosition } from './repetitionReferee';
import type { BoardState, Coord, Move, PieceType } from './xiangqi';
import { PIECE_NAME_VI, applyMoveOnGrid, cloneGrid, isInCheck } from './xiangqi';
import {
  MG_VAL,
  P_ADVISOR,
  P_CANNON,
  P_CHARIOT,
  P_ELEPHANT,
  P_HORSE,
  P_KING,
  P_SOLDIER,
} from './xiangqiFast';

export type HandicapId =
  | 'khong_chap'
  | 'chap_mot_ma'
  | 'chap_hai_ma'
  | 'chap_mot_phao'
  | 'chap_mot_xe';

/** Which flank the given stone comes off: col 0/1 (Black's file 1-2) or col 7/8 (file 8-9). */
export type Flank = 'ben_trai' | 'ben_phai' | 'ca_hai';

/** The protected-piece rules, named by the folk term the show says out loud. */
export type ShieldKind = 'thiet_binh' | 'thiet_phao' | 'thiet_ma' | 'xuat_lin_xe';

/** The bride gives the stones; she is Black, so the shields are always hers. */
const OWNER: 'black' = 'black';

/** Black's opening array, as `createInitialBoard` lays it out (xiangqi.ts:129-145). */
const BLACK_HOME_ROW: Record<PieceType, number> = {
  king: 0,
  advisor: 0,
  elephant: 0,
  horse: 0,
  chariot: 0,
  cannon: 2,
  soldier: 3,
};

/** Every file each kind of stone occupies in Black's opening array, so "at home" is per-square. */
const BLACK_HOME_COLS: Record<PieceType, readonly number[]> = {
  king: [4],
  advisor: [3, 5],
  elephant: [2, 6],
  horse: [1, 7],
  chariot: [0, 8],
  cannon: [1, 7],
  soldier: [0, 2, 4, 6, 8],
};

const CENTRE_COL = 4;

/** Midgame values the engine itself plays with, so the ladder order is the repo's, not a guess. */
const MG_VALUE: Record<PieceType, number> = {
  king: MG_VAL[P_KING],
  advisor: MG_VAL[P_ADVISOR],
  elephant: MG_VAL[P_ELEPHANT],
  horse: MG_VAL[P_HORSE],
  chariot: MG_VAL[P_CHARIOT],
  cannon: MG_VAL[P_CANNON],
  soldier: MG_VAL[P_SOLDIER],
};

const COUNT_WORD = ['Không', 'Một', 'Hai', 'Ba'] as const;

interface HandicapDef {
  id: HandicapId;
  /** The stone given away; null for the even game. */
  gives: PieceType | null;
  /** 让双马 takes both flanks whatever the guest asked for. */
  everyFlank: boolean;
  shields: ShieldKind[];
  /** Spoken when the rung is announced; {guest}/{self}/{audience} tokens only. */
  claimVi: string;
}

const HANDICAP_DEFS: readonly HandicapDef[] = [
  {
    id: 'khong_chap',
    gives: null,
    everyFlank: false,
    shields: [],
    claimVi: '{self} đi thuận cờ, không chấp một quân nào - {guest} chịu đủ áp lực nhé {audience} ơi.',
  },
  {
    id: 'chap_mot_ma',
    gives: 'horse',
    everyFlank: false,
    shields: ['thiet_binh'],
    claimVi:
      '{self} rút một mã. Coi kỹ: tốt giữa chưa nhúc nhích thì chưa ăn được đâu - đó là thiết binh.',
  },
  {
    id: 'chap_hai_ma',
    gives: 'horse',
    everyFlank: true,
    shields: ['thiet_binh', 'xuat_lin_xe'],
    claimVi: 'Rút cả hai mã. Tốt giữa còn nguyên, xe thẳng đã ra khỏi rừng thì chưa ai bắt được.',
  },
  {
    id: 'chap_mot_phao',
    gives: 'cannon',
    everyFlank: false,
    shields: ['thiet_phao'],
    claimVi: '{self} bớt một pháo. Khẩu pháo còn lại chưa đi thì chưa ăn được - thiết pháo đó {guest}.',
  },
  {
    id: 'chap_mot_xe',
    gives: 'chariot',
    everyFlank: false,
    shields: ['thiet_ma'],
    claimVi: '{self} cho một chiếc xe. Con ngựa ngồi cạnh chưa đi thì chưa bắt được - một tòa cung đó.',
  },
];

const DEF_BY_ID = new Map(HANDICAP_DEFS.map((def) => [def.id, def]));

/** What a refused move costs the guest, in the words the bride says back on air. */
export const CONCESSION_LINE_VI: Record<ShieldKind, string> = {
  thiet_binh: 'Tốt giữa chưa đi là thiết binh - {guest} ăn không được đâu, trừ khi nước đó chiếu tướng.',
  thiet_phao: 'Khẩu pháo ấy chưa nhúc nhích, thiết pháo mà - {guest} đổi nước khác đi.',
  thiet_ma: 'Ngựa ngồi cạnh chiếc xe đã rút: một tòa cung, {guest} bắt không được đâu.',
  xuat_lin_xe: 'Xe đã ra khỏi rừng thì người ta không đánh xe ấy - lệ chấp hai mã đó {guest} ơi.',
};

export interface Handicap {
  id: HandicapId;
  /** Position in `HANDICAP_LADDER`, 0 = the even game. */
  rank: number;
  /** Banner text: "Chấp Một Mã 2". */
  nameVi: string;
  claimVi: string;
  gives: PieceType | null;
  removed: { type: PieceType; at: Coord }[];
  shields: ShieldKind[];
  /** Horse files sitting beside a chariot that was given away (铁马). */
  sittingHorseCols: number[];
  /** Horse files emptied by the concession, which a chariot may slide into to become 出林车. */
  vacatedHorseCols: number[];
  /** What the conceded stones are worth on the engine's own midgame scale. */
  costMg: number;
}

function flankCols(def: HandicapDef, flank: Flank): number[] {
  if (def.gives === null) return [];
  // The outer files of whatever set this kind of stone occupies: for 马/炮/车 that is cols 1 and 7,
  // or 0 and 8. Solders have five home files, which is why the choice is the ends, not index 1.
  const files = BLACK_HOME_COLS[def.gives];
  const left = files[0];
  const right = files[files.length - 1];
  if (def.everyFlank || flank === 'ca_hai') return [left, right];
  return [flank === 'ben_phai' ? right : left];
}

export function handicapFor(id: HandicapId, flank: Flank = 'ben_trai'): Handicap {
  const def = DEF_BY_ID.get(id) ?? DEF_BY_ID.get('khong_chap')!;
  const removed = flankCols(def, flank).map((col) => ({
    type: def.gives as PieceType,
    at: { row: BLACK_HOME_ROW[def.gives as PieceType], col },
  }));

  const nameVi = def.gives
    ? `Chấp ${COUNT_WORD[removed.length]} ${PIECE_NAME_VI[OWNER][def.gives]}${
        removed.length === 1 ? ` ${removed[0].at.col + 1}` : ''
      }`
    : 'Đi Thuận Cờ';

  return {
    id: def.id,
    rank: HANDICAP_DEFS.findIndex((d) => d.id === def.id),
    nameVi,
    claimVi: def.claimVi,
    gives: def.gives,
    removed,
    shields: def.shields,
    sittingHorseCols: removed
      .filter((r) => r.type === 'chariot')
      .map((r) => (r.at.col === 0 ? BLACK_HOME_COLS.horse[0] : BLACK_HOME_COLS.horse[1])),
    vacatedHorseCols: removed.filter((r) => r.type === 'horse').map((r) => r.at.col),
    costMg: removed.reduce((sum, r) => sum + MG_VALUE[r.type], 0),
  };
}

/** Mildest first, ordered by what the engine's own material table says the stones are worth. */
export const HANDICAP_LADDER: readonly Handicap[] = HANDICAP_DEFS.map((def) => handicapFor(def.id))
  .sort((a, b) => a.costMg - b.costMg)
  .map((handicap, rank) => ({ ...handicap, rank }));

export const HANDICAP_IDS: readonly HandicapId[] = HANDICAP_DEFS.map((def) => def.id);

/** URL/env reading: anything unreadable falls back to the even game, never to a broken board. */
export function resolveHandicap(
  rawId: string | undefined,
  rawFlank: string | undefined,
): { id: HandicapId; flank: Flank } {
  const id = HANDICAP_IDS.includes(rawId as HandicapId) ? (rawId as HandicapId) : 'khong_chap';
  const byName: Record<string, Flank> = {
    ben_trai: 'ben_trai',
    ben_phai: 'ben_phai',
    ca_hai: 'ca_hai',
    trai: 'ben_trai',
    phai: 'ben_phai',
    both: 'ca_hai',
  };
  // Files as a viewer types them are Black's own: file 1-2 is the left flank, 8-9 the right.
  const byFile: Record<string, Flank> = { '1': 'ben_trai', '2': 'ben_trai', '8': 'ben_phai', '9': 'ben_phai' };
  const flank = byName[rawFlank ?? ''] ?? byFile[rawFlank ?? ''] ?? 'ben_trai';
  return { id, flank };
}

export interface ConcessionState {
  handicap: Handicap;
  /** Owner chariots that have left their opening square, so only a first move can be 出林车. */
  chariotsMoved: string[];
  /** Each 出林车 and the square it is shielded on; an entry dies the moment that chariot moves again. */
  straightChariots: { id: string; row: number; col: number }[];
}

export function createConcessionState(handicap: Handicap): ConcessionState {
  return { handicap, chariotsMoved: [], straightChariots: [] };
}

export interface HandicapSetup {
  ok: boolean;
  /** The array to play on: conceded when ok, untouched otherwise. */
  board: BoardState;
  handicap: Handicap;
  state: ConcessionState;
  /** Target squares that held nothing to take - a double apply, or an array that is not the opening. */
  absent: Coord[];
}

/**
 * Take the conceded stones off. Only legal before the first ply: removing pieces mid-game would
 * contradict the position ledger the repetition referee has already recorded.
 */
export function applyHandicap(
  board: BoardState,
  id: HandicapId,
  flank: Flank = 'ben_trai',
): HandicapSetup {
  const handicap = handicapFor(id, flank);
  const state = createConcessionState(handicap);
  if (board.moveCount > 0) {
    return { ok: false, board, handicap, state, absent: [] };
  }

  const grid = cloneGrid(board.grid);
  const absent: Coord[] = [];
  for (const target of handicap.removed) {
    const piece = grid[target.at.row][target.at.col];
    if (!piece || piece.side !== OWNER || piece.type !== target.type) {
      absent.push(target.at);
      continue;
    }
    grid[target.at.row][target.at.col] = null;
  }

  const next: BoardState = {
    ...board,
    grid,
    // The referee's opening signature has to describe the array the game is really played from.
    refereeHistory: [
      recordForPosition({
        grid,
        turn: board.turn,
        ply: board.moveCount,
        mover: null,
        gaveCheck: false,
        captured: false,
      }),
    ],
  };
  return { ok: true, board: next, handicap, state, absent };
}

/** "未动过": still standing on the square the opening array put it on. */
function isIdleAtHome(type: PieceType, at: Coord): boolean {
  return at.row === BLACK_HOME_ROW[type] && BLACK_HOME_COLS[type].includes(at.col);
}

/** The folk protection covering this capture, or null when the guest may take. */
export function shieldOfCapture(
  board: BoardState,
  state: ConcessionState,
  move: Move,
): ShieldKind | null {
  const victim = move.captured;
  if (!victim || victim.side !== OWNER) return null;
  const at = move.to;
  const { shields } = state.handicap;

  if (shields.includes('thiet_binh') && victim.type === 'soldier' && at.col === CENTRE_COL) {
    if (!isIdleAtHome('soldier', at)) return null;
    // 中卒不走不吃, and the exception the source names: a capture that gives check is fair.
    return isInCheck(applyMoveOnGrid(board.grid, move), OWNER) ? null : 'thiet_binh';
  }

  if (shields.includes('thiet_phao') && victim.type === 'cannon' && isIdleAtHome('cannon', at)) {
    return 'thiet_phao';
  }

  if (
    shields.includes('thiet_ma') &&
    victim.type === 'horse' &&
    isIdleAtHome('horse', at) &&
    state.handicap.sittingHorseCols.includes(at.col)
  ) {
    return 'thiet_ma';
  }

  if (shields.includes('xuat_lin_xe') && victim.type === 'chariot') {
    const shielded = state.straightChariots.find((c) => c.id === victim.id);
    if (shielded && shielded.row === at.row && shielded.col === at.col) return 'xuat_lin_xe';
  }

  return null;
}

/** Why this move is refused under tonight's concession, or null when it may be played. */
export function concessionBlock(
  board: BoardState,
  state: ConcessionState,
  move: Move,
): { rule: ShieldKind; lineVi: string } | null {
  const rule = shieldOfCapture(board, state, move);
  if (!rule) return null;
  return { rule, lineVi: CONCESSION_LINE_VI[rule] };
}

/** What the guest may actually play: the legal list minus the stones the concession protects. */
export function concessionLegalMoves(
  board: BoardState,
  state: ConcessionState,
  moves: Move[],
): Move[] {
  return moves.filter((move) => concessionBlock(board, state, move) === null);
}

/**
 * Track the bride's own plies, because 出林车 is only ever a chariot's FIRST move: one step
 * sideways along the back rank into a horse file the concession emptied.
 */
export function afterOwnerPly(state: ConcessionState, move: Move): ConcessionState {
  const piece = move.piece;
  if (piece.side !== OWNER || piece.type !== 'chariot') return state;

  const hadMoved = state.chariotsMoved.includes(piece.id);
  // 出林车 is only ever the chariot's first move: once this one stirs again its own shield dies,
  // and the other flank keeps whatever it earned.
  const kept = state.straightChariots.filter((c) => c.id !== piece.id);
  const developed =
    !hadMoved &&
    state.handicap.shields.includes('xuat_lin_xe') &&
    move.from.row === BLACK_HOME_ROW.chariot &&
    move.to.row === BLACK_HOME_ROW.chariot &&
    Math.abs(move.to.col - move.from.col) === 1 &&
    state.handicap.vacatedHorseCols.includes(move.to.col);

  return {
    ...state,
    chariotsMoved: [...state.chariotsMoved, piece.id],
    straightChariots: developed ? [...kept, { id: piece.id, row: move.to.row, col: move.to.col }] : kept,
  };
}
