import type { BoardState, Piece, PieceType, Side } from './xiangqi';

/**
 * Repetition referee for the live show, adjudicating the Asian (AXF/WXF) code — the one engines
 * and servers implement — rather than the mainland CXA code. Deliberately out of scope, because a
 * wrong ruling on air is worse than no ruling:
 * - 长捉 perpetual chase (and mixed 一将一捉, a loss under CXA but a draw under AXF);
 * - discounting checking plies from the 60-move count;
 * - the CXA opening clause that makes RED change inside the first 25 rounds.
 */

export type GameStatus = BoardState['status'];

export type StatusReason =
  | 'checkmate'
  | 'stalemate'
  | 'perpetual_check'
  | 'repetition_draw'
  | 'sixty_move_draw'
  | 'resign'
  | 'draw_agreement';

export type RefereeWarning = 'perpetual_check_warning';

/** The position has appeared this many times -> the referee rules on it. */
export const REPETITION_DECISION_OCCURRENCES = 3;

/** Half-moves without any capture that end the game as a draw (60 full moves). */
export const NO_CAPTURE_DRAW_PLIES = 120;

export interface PositionRecord {
  /** Half-moves played to reach this position (0 = the opening array). */
  ply: number;
  /** Canonical board + side-to-move signature, independent of piece instance ids. */
  key: string;
  /** Side that moved into this position; null for the opening array. */
  mover: Side | null;
  /** The move into this position delivered check. */
  gaveCheck: boolean;
  captured: boolean;
}

export interface RefereeVerdict {
  status: GameStatus;
  reason: StatusReason | null;
  /** Side that broke the rule; only set for `perpetual_check` rulings and warnings. */
  offender: Side | null;
  occurrences: number;
  warning: RefereeWarning | null;
  noCapturePlies: number;
}

const PIECE_LETTER: Record<PieceType, string> = {
  king: 'k',
  advisor: 'a',
  elephant: 'e',
  horse: 'h',
  chariot: 'r',
  cannon: 'c',
  soldier: 'p',
};

export function positionSignature(
  grid: (Piece | null)[][],
  turn: Side,
): string {
  let out = turn === 'red' ? 'R' : 'B';
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const p = row[c];
      if (!p) {
        out += '.';
        continue;
      }
      const letter = PIECE_LETTER[p.type];
      out += p.side === 'red' ? letter.toUpperCase() : letter;
    }
  }
  return out;
}

export function recordForPosition(args: {
  grid: (Piece | null)[][];
  turn: Side;
  ply: number;
  mover: Side | null;
  gaveCheck: boolean;
  captured: boolean;
}): PositionRecord {
  return {
    ply: args.ply,
    key: positionSignature(args.grid, args.turn),
    mover: args.mover,
    gaveCheck: args.gaveCheck,
    captured: args.captured,
  };
}

/**
 * States built by hand (fixtures, saved games written before the referee existed) carry no
 * ledger, so the current position is recorded on demand from the fields every BoardState has.
 */
export function ledgerForBoard(board: BoardState): PositionRecord[] {
  const stored = board.refereeHistory;
  const current = recordForPosition({
    grid: board.grid,
    turn: board.turn,
    ply: board.moveCount,
    mover: board.moveCount > 0 ? (board.turn === 'red' ? 'black' : 'red') : null,
    gaveCheck: board.inCheck !== null,
    captured: board.lastMove ? board.lastMove.captured != null : false,
  });
  if (!stored || stored.length === 0) return [current];
  if (stored[stored.length - 1].key === current.key) return stored;
  return [...stored, current];
}

export function noCapturePlies(ledger: PositionRecord[]): number {
  if (ledger.length === 0) return 0;
  const last = ledger[ledger.length - 1];
  for (let i = ledger.length - 1; i >= 0; i--) {
    if (ledger[i].captured) return Math.max(0, last.ply - ledger[i].ply);
  }
  return Math.max(0, last.ply - ledger[0].ply);
}

function checksEveryOwnMove(cycle: PositionRecord[], side: Side): boolean {
  let own = 0;
  for (const record of cycle) {
    if (record.mover !== side) continue;
    own += 1;
    if (!record.gaveCheck) return false;
  }
  return own > 0;
}

/**
 * The side whose every move inside the repeated cycle is a check. Mutual checking cycles
 * (both sides) return null: nobody can be blamed, so it falls back to a plain repetition draw.
 */
export function perpetualChecker(cycle: PositionRecord[]): Side | null {
  const red = checksEveryOwnMove(cycle, 'red');
  const black = checksEveryOwnMove(cycle, 'black');
  if (red && black) return null;
  if (red) return 'red';
  if (black) return 'black';
  return null;
}

/**
 * AXF/WXF-style "循环反复": the two most recent trips back to this position must have the same
 * length and the same plies. Scattered visits to a position are not a repeating cycle, and only an
 * identical cycle can ever justify handing out a loss.
 */
function samePlies(a: PositionRecord[], b: PositionRecord[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].key !== b[i].key ||
      a[i].mover !== b[i].mover ||
      a[i].gaveCheck !== b[i].gaveCheck ||
      a[i].captured !== b[i].captured
    ) {
      return false;
    }
  }
  return true;
}

export function refereeVerdict(ledger: PositionRecord[]): RefereeVerdict {
  const last = ledger.length > 0 ? ledger[ledger.length - 1] : null;
  const quietPlies = noCapturePlies(ledger);
  const base: RefereeVerdict = {
    status: 'playing',
    reason: null,
    offender: null,
    occurrences: last && last.mover !== null ? 1 : 0,
    warning: null,
    noCapturePlies: quietPlies,
  };
  if (!last || last.mover === null) return base;

  const occurrencesAt: number[] = [];
  for (let i = 0; i < ledger.length; i++) {
    if (ledger[i].key === last.key) occurrencesAt.push(i);
  }
  const occurrences = occurrencesAt.length;
  base.occurrences = occurrences;
  if (occurrences >= REPETITION_DECISION_OCCURRENCES) {
    // The cycle being repeated is the run of plies after the previous occurrence of this position.
    const previous = occurrencesAt[occurrences - 2];
    const beforePrevious = occurrencesAt[occurrences - 3];
    const cycle = ledger.slice(previous + 1);
    const repeating =
      previous - beforePrevious === cycle.length &&
      samePlies(ledger.slice(beforePrevious + 1, previous + 1), cycle);
    const checker = perpetualChecker(cycle);
    // 从重裁处: a check on every move of the cycle outranks everything else and the checker loses
    // the game immediately — even when it has no alternative move (AXF rule 6/8).
    if (repeating && checker === 'red') {
      return { ...base, status: 'black_win', reason: 'perpetual_check', offender: 'red' };
    }
    if (repeating && checker === 'black') {
      return { ...base, status: 'red_win', reason: 'perpetual_check', offender: 'black' };
    }
    return { ...base, status: 'draw', reason: 'repetition_draw' };
  }

  if (quietPlies >= NO_CAPTURE_DRAW_PLIES) {
    return { ...base, status: 'draw', reason: 'sixty_move_draw' };
  }

  if (occurrences < 2) return base;

  // Second trip: the checking cycle is already visible, so the stream can warn the checker early.
  // Two occurrences cannot prove periodicity yet (a third trip might turn out to be a
  // transposition, which only draws), hence this is advice, not a promised ruling.
  const checker = perpetualChecker(ledger.slice(occurrencesAt[occurrences - 2] + 1));
  if (checker) {
    return { ...base, warning: 'perpetual_check_warning', offender: checker };
  }
  return base;
}

export function refereeForBoard(board: BoardState): RefereeVerdict {
  return refereeVerdict(ledgerForBoard(board));
}

/**
 * Root-move filter for the engine: would this ply be the third occurrence of the position with
 * `side` as the perpetual checker? That is a loss, not a draw, so the search must not treat it as 0.
 */
export function losesByPerpetualCheck(
  ledger: PositionRecord[],
  candidate: PositionRecord,
  side: Side,
): boolean {
  const verdict = refereeVerdict([...ledger, candidate]);
  return verdict.reason === 'perpetual_check' && verdict.offender === side;
}
