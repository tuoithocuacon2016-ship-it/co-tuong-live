import {
  BOARD_COLS,
  BOARD_ROWS,
  BoardState,
  Coord,
  Move,
  PIECE_NAME_VI,
  PieceType,
  Side,
  applyMoveOnGrid,
  generatePseudoMovesForPiece,
  isInCheck,
  oppositeSide,
} from './xiangqi';
import {
  FastBoard,
  MG_VAL,
  SIDE_RED,
  createFastBoard,
  evaluateFast,
  fastBoardHashKey,
  generatePseudoMovesFast,
  hasHeavyMaterial,
  isSideInCheckFast,
  makeMoveFast,
  makeNullMoveFast,
  moveCaptured,
  moveFrom,
  moveTo,
  unpackMoveToBoardMove,
  unmakeMoveFast,
  unmakeNullMoveFast,
} from './xiangqiFast';
import { colToFile, formatMoveVietnamese } from './notation';
import { detectKillPattern } from './patterns';
import { ledgerForBoard, losesByPerpetualCheck, recordForPosition } from './repetitionReferee';

export type BotDifficulty = 'nhap_mon' | 'cao_thu' | 'tong_su';

export interface AnalyzeOptions {
  /** 'play' gives full tactical thinking budget; 'preview' keeps HUD arrows ultra-snappy */
  mode?: 'play' | 'preview';
  /** Recent Zobrist board hash keys to discourage pointless repetitions when winning */
  recentPositionKeys?: string[];
}

export interface TacticalVariation {
  move: Move;
  notation: string;
  score: number; // Centipawns from Red's POV (+ favors Red, - favors Black)
  replyNotation?: string;
}

export interface TacticalThreat {
  from: Coord;
  to: Coord;
  attackerSide: Side;
  description: string;
}

export interface DeepAnalysisResult {
  bestMove: Move | null;
  bestNotation: string;
  score: number; // Red-relative centipawns
  winProbRed: number; // 4..96
  variations: TacticalVariation[];
  threats: TacticalThreat[];
  motif: string;
  tacticalSummary: string;
  /** Depth actually completed by Iterative Deepening (for diagnostics / tests) */
  searchDepth?: number;
  /** Position Zobrist key of the analyzed state */
  positionKey?: string;
  /** Multi-ply Principal Variation tactical continuation in Vietnamese notation */
  pvLine?: string[];
  /** Total nodes searched in this analysis call */
  nodesSearched?: number;
  /** Wall-clock time spent searching in milliseconds */
  elapsedMs?: number;
}

const PIECE_VALUE: Record<PieceType, number> = {
  king: 10000,
  chariot: 960,
  cannon: 485,
  horse: 435,
  elephant: 225,
  advisor: 225,
  soldier: 105,
};

export function evaluateGrid(grid: BoardState['grid']): number {
  const fb = createFastBoard(grid, 'red');
  return evaluateFast(fb);
}

// ============================================================================
// TRANSPOSITION TABLE (Fixed-Size Typed Arrays — Zero GC Overhead)
// ============================================================================

const TT_SIZE = 1 << 16; // 65,536 entries
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const MATE_SCORE = 90000;
const MATE_THRESHOLD = 80000;
const INF = 120000;
const MAX_PLY = 48;

const ttKeyLo = new Uint32Array(TT_SIZE);
const ttKeyHi = new Uint32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttGen = new Uint16Array(TT_SIZE);
let currentSearchGen = 1;

function toTTScore(score: number, ply: number): number {
  if (score > MATE_THRESHOLD) return score + ply;
  if (score < -MATE_THRESHOLD) return score - ply;
  return score;
}

function fromTTScore(score: number, ply: number): number {
  if (score > MATE_THRESHOLD) return score - ply;
  if (score < -MATE_THRESHOLD) return score + ply;
  return score;
}

function storeTT(
  b: FastBoard,
  depth: number,
  flag: number,
  score: number,
  bestMove: number,
  ply: number,
): void {
  const idx = b.hashLo & TT_MASK;
  // Replace if older search gen, deeper search, or exact bound
  if (
    ttGen[idx] !== currentSearchGen ||
    depth >= ttDepth[idx] ||
    flag === TT_EXACT
  ) {
    ttKeyLo[idx] = b.hashLo;
    ttKeyHi[idx] = b.hashHi;
    ttDepth[idx] = depth;
    ttFlag[idx] = flag;
    ttScore[idx] = toTTScore(score, ply);
    if (bestMove !== 0) ttMove[idx] = bestMove;
    ttGen[idx] = currentSearchGen;
  }
}

// ============================================================================
// REUSABLE SEARCH BUFFERS (Zero Allocation Per Node!)
// ============================================================================

const MOVE_BUF = new Int32Array(MAX_PLY * 128);
const SCORE_BUF = new Int32Array(MAX_PLY * 128);
const KILLER_1 = new Int32Array(MAX_PLY);
const KILLER_2 = new Int32Array(MAX_PLY);
// History heuristic & Countermove table indexed by (from * 90 + to)
const HISTORY = new Int32Array(90 * 90);
const COUNTERMOVE = new Int32Array(90 * 90);

interface SearchCtx {
  nodes: number;
  maxNodes: number;
  deadlineMs: number;
  aborted: boolean;
  pathHashesLo: Uint32Array;
  pathHashesHi: Uint32Array;
  pathLen: number;
}

function scoreMoveFast(
  b: FastBoard,
  mv: number,
  ply: number,
  pvMove: number,
  counterMove = 0,
): number {
  if (mv === pvMove) return 2_000_000;

  const cap = moveCaptured(mv);
  const from = moveFrom(mv);
  const to = moveTo(mv);
  const piece = b.cells[from];
  const absPiece = piece > 0 ? piece : -piece;

  if (cap !== 0) {
    const absCap = cap > 0 ? cap : -cap;
    // MVV-LVA: strongly prioritize capturing high-value pieces with lower-value attackers
    return 1_000_000 + MG_VAL[absCap] * 16 - MG_VAL[absPiece];
  }

  if (mv === KILLER_1[ply]) return 900_000;
  if (mv === KILLER_2[ply]) return 850_000;
  if (counterMove !== 0 && mv === counterMove) return 820_000;

  return HISTORY[from * 90 + to];
}

/** In-place selection of next best-scored move (partial sort avoids sorting pruned tail!) */
function pickBestMove(start: number, end: number): void {
  let bestIdx = start;
  let bestScore = SCORE_BUF[start];
  for (let i = start + 1; i < end; i++) {
    if (SCORE_BUF[i] > bestScore) {
      bestScore = SCORE_BUF[i];
      bestIdx = i;
    }
  }
  if (bestIdx !== start) {
    const tmpM = MOVE_BUF[start];
    MOVE_BUF[start] = MOVE_BUF[bestIdx];
    MOVE_BUF[bestIdx] = tmpM;
    const tmpS = SCORE_BUF[start];
    SCORE_BUF[start] = SCORE_BUF[bestIdx];
    SCORE_BUF[bestIdx] = tmpS;
  }
}

function isRepetitionInPath(b: FastBoard, ctx: SearchCtx): boolean {
  const lo = b.hashLo;
  const hi = b.hashHi;
  for (let i = ctx.pathLen - 2; i >= 0; i -= 2) {
    if (ctx.pathHashesLo[i] === lo && ctx.pathHashesHi[i] === hi) {
      return true;
    }
  }
  return false;
}

/**
 * True Legal Quiescence Search (Negamax, Side-to-Move POV):
 * - When IN CHECK: NO stand-pat allowed! Searches ALL legal evasions so checkmates
 *   and forced tactical lines at the horizon are NEVER missed!
 * - When NOT in check: Stand-pat + ALL legal captures (MVV-LVA ordered) to eliminate
 *   horizon-effect hanging-piece blunders completely!
 */
function quiesce(
  b: FastBoard,
  alpha: number,
  beta: number,
  ply: number,
  qDepth: number,
  ctx: SearchCtx,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 1023) === 0) {
    if (ctx.nodes >= ctx.maxNodes || Date.now() >= ctx.deadlineMs) {
      ctx.aborted = true;
      return 0;
    }
  }

  const side = b.side;
  const inCheck = isSideInCheckFast(b, side);

  if (!inCheck) {
    const rawEval = evaluateFast(b);
    const standPat = side === SIDE_RED ? rawEval : -rawEval;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    if (qDepth <= 0 || ply >= MAX_PLY - 1) return alpha;

    const start = ply * 128;
    const end = generatePseudoMovesFast(b, MOVE_BUF, start, true);
    for (let i = start; i < end; i++) {
      SCORE_BUF[i] = scoreMoveFast(b, MOVE_BUF[i], ply, 0);
    }

    for (let i = start; i < end; i++) {
      pickBestMove(i, end);
      const mv = MOVE_BUF[i];
      const cap = moveCaptured(mv);
      const absCap = cap > 0 ? cap : -cap;

      // Safe delta pruning: skip hopeless minor capture when far below alpha
      if (absCap !== 1 && standPat + MG_VAL[absCap] + 220 < alpha) continue;

      makeMoveFast(b, mv);
      if (isSideInCheckFast(b, side)) {
        unmakeMoveFast(b, mv);
        continue;
      }

      const score = -quiesce(b, -beta, -alpha, ply + 1, qDepth - 1, ctx);
      unmakeMoveFast(b, mv);
      if (ctx.aborted) return 0;

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  // IN CHECK in quiescence: must search ALL legal evasions!
  if (ply >= MAX_PLY - 1) {
    const rawEval = evaluateFast(b);
    return side === SIDE_RED ? rawEval : -rawEval;
  }

  const start = ply * 128;
  const end = generatePseudoMovesFast(b, MOVE_BUF, start, false);
  for (let i = start; i < end; i++) {
    SCORE_BUF[i] = scoreMoveFast(b, MOVE_BUF[i], ply, 0);
  }

  let legalCount = 0;
  for (let i = start; i < end; i++) {
    pickBestMove(i, end);
    const mv = MOVE_BUF[i];

    makeMoveFast(b, mv);
    if (isSideInCheckFast(b, side)) {
      unmakeMoveFast(b, mv);
      continue;
    }
    legalCount++;

    const score = -quiesce(b, -beta, -alpha, ply + 1, Math.max(0, qDepth - 1), ctx);
    unmakeMoveFast(b, mv);
    if (ctx.aborted) return 0;

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  if (legalCount === 0) {
    return -MATE_SCORE + ply;
  }
  return alpha;
}

/**
 * Principal Variation Search (PVS) with:
 * - Transposition Table lookup & storage
 * - Check Extensions (never drops forcing mating sequences!)
 * - Null-Move Pruning (R = 2)
 * - Late Move Reductions (LMR) with full re-search on fail-high
 * - Killer & History Heuristic move ordering
 */
function negamax(
  b: FastBoard,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  extensions: number,
  allowNull: boolean,
  ctx: SearchCtx,
  prevMove = 0,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 1023) === 0) {
    if (ctx.nodes >= ctx.maxNodes || Date.now() >= ctx.deadlineMs) {
      ctx.aborted = true;
      return 0;
    }
  }

  if (ply >= MAX_PLY - 1) {
    const raw = evaluateFast(b);
    return b.side === SIDE_RED ? raw : -raw;
  }

  // Detect repetition inside search path
  if (ply > 0 && isRepetitionInPath(b, ctx)) {
    return 0;
  }

  const side = b.side;
  const inCheck = isSideInCheckFast(b, side);

  // Check Extension: extend forcing checks so mating nets are seen cleanly!
  let nextDepth = depth;
  let nextExt = extensions;
  if (inCheck && nextExt < 4) {
    nextDepth++;
    nextExt++;
  }

  if (nextDepth <= 0) {
    return quiesce(b, alpha, beta, ply, 6, ctx);
  }

  const origAlpha = alpha;
  const isPv = beta - alpha > 1;

  // 1. Transposition Table Probe
  let ttBestMove = 0;
  const ttIdx = b.hashLo & TT_MASK;
  if (
    ttGen[ttIdx] === currentSearchGen &&
    ttKeyLo[ttIdx] === b.hashLo &&
    ttKeyHi[ttIdx] === b.hashHi
  ) {
    ttBestMove = ttMove[ttIdx];
    if (!isPv && ttDepth[ttIdx] >= nextDepth) {
      const cached = fromTTScore(ttScore[ttIdx], ply);
      const flag = ttFlag[ttIdx];
      if (flag === TT_EXACT) return cached;
      if (flag === TT_LOWER && cached >= beta) return cached;
      if (flag === TT_UPPER && cached <= alpha) return cached;
    }
  }

  // 2. Null-Move Pruning (skip in check, PV, shallow depth, or endgame without heavy pieces)
  if (
    allowNull &&
    !isPv &&
    !inCheck &&
    nextDepth >= 3 &&
    hasHeavyMaterial(b, side)
  ) {
    const R = nextDepth >= 6 ? 3 : 2;
    makeNullMoveFast(b);
    const nullScore = -negamax(
      b,
      nextDepth - 1 - R,
      -beta,
      -beta + 1,
      ply + 1,
      nextExt,
      false,
      ctx,
    );
    unmakeNullMoveFast(b);
    if (ctx.aborted) return 0;
    if (nullScore >= beta && nullScore < MATE_THRESHOLD) {
      return beta;
    }
  }

  // 3. Move Generation & Ordering (PV -> MVV-LVA Captures -> Killers -> Countermove -> History)
  const start = ply * 128;
  const end = generatePseudoMovesFast(b, MOVE_BUF, start, false);
  const counterMv = prevMove !== 0 ? COUNTERMOVE[moveFrom(prevMove) * 90 + moveTo(prevMove)] : 0;
  for (let i = start; i < end; i++) {
    SCORE_BUF[i] = scoreMoveFast(b, MOVE_BUF[i], ply, ttBestMove, counterMv);
  }

  let bestScore = -INF;
  let bestMove = 0;
  let legalCount = 0;

  // Record current hash on path for repetition checks
  const pathPos = ctx.pathLen++;
  ctx.pathHashesLo[pathPos] = b.hashLo;
  ctx.pathHashesHi[pathPos] = b.hashHi;

  for (let i = start; i < end; i++) {
    pickBestMove(i, end);
    const mv = MOVE_BUF[i];

    makeMoveFast(b, mv);
    if (isSideInCheckFast(b, side)) {
      unmakeMoveFast(b, mv);
      continue;
    }
    legalCount++;

    const isCapture = moveCaptured(mv) !== 0;
    const givesCheck = isSideInCheckFast(b, -side);

    let score: number;
    if (legalCount === 1) {
      // Full-window search for Principal Variation move
      score = -negamax(b, nextDepth - 1, -beta, -alpha, ply + 1, nextExt, true, ctx, mv);
    } else {
      // Late Move Reductions (LMR) for quiet, non-checking, non-killer late moves
      const canReduce =
        legalCount >= 5 &&
        nextDepth >= 3 &&
        !inCheck &&
        !givesCheck &&
        !isCapture &&
        mv !== KILLER_1[ply] &&
        mv !== KILLER_2[ply] &&
        mv !== counterMv;

      if (canReduce) {
        const reduction = legalCount >= 14 && nextDepth >= 4 ? 2 : 1;
        score = -negamax(
          b,
          nextDepth - 1 - reduction,
          -alpha - 1,
          -alpha,
          ply + 1,
          nextExt,
          true,
          ctx,
          mv,
        );
      } else {
        // Zero-window PVS scout
        score = -negamax(
          b,
          nextDepth - 1,
          -alpha - 1,
          -alpha,
          ply + 1,
          nextExt,
          true,
          ctx,
          mv,
        );
      }

      // Full-window re-search if scout beat alpha
      if (!ctx.aborted && score > alpha && (canReduce || score < beta)) {
        score = -negamax(b, nextDepth - 1, -beta, -alpha, ply + 1, nextExt, true, ctx, mv);
      }
    }

    unmakeMoveFast(b, mv);
    if (ctx.aborted) {
      ctx.pathLen = pathPos;
      return 0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = mv;
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          // Beta cutoff -> update Killer, Countermove & History heuristics for quiet moves
          if (!isCapture) {
            if (KILLER_1[ply] !== mv) {
              KILLER_2[ply] = KILLER_1[ply];
              KILLER_1[ply] = mv;
            }
            if (prevMove !== 0) {
              COUNTERMOVE[moveFrom(prevMove) * 90 + moveTo(prevMove)] = mv;
            }
            const hIdx = moveFrom(mv) * 90 + moveTo(mv);
            const bonus = nextDepth * nextDepth;
            HISTORY[hIdx] = Math.min(400_000, HISTORY[hIdx] + bonus);
          }
          break;
        }
      }
    }
  }

  ctx.pathLen = pathPos;

  if (legalCount === 0) {
    // Checkmate OR Stalemate — in Xiangqi BOTH are an immediate loss for side to move!
    return -MATE_SCORE + ply;
  }

  const flag =
    bestScore <= origAlpha
      ? TT_UPPER
      : bestScore >= beta
        ? TT_LOWER
        : TT_EXACT;
  storeTT(b, nextDepth, flag, bestScore, bestMove, ply);

  return bestScore;
}

// ============================================================================
// CLASSICAL GRANDMASTER OPENING BOOK (Subtle Tie-Breaker, Never Overrides Tactics!)
// ============================================================================

interface BookCandidate {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  bonus: number;
}

function moveKey(fromRow: number, fromCol: number, toRow: number, toCol: number): string {
  return `${fromRow},${fromCol}->${toRow},${toCol}`;
}

function getOpeningBookBonuses(
  grid: BoardState['grid'],
  side: Side,
  moveCount: number,
): Map<string, number> {
  const bonuses = new Map<string, number>();
  if (moveCount > 5) return bonuses;

  const add = (list: BookCandidate[]) => {
    for (const c of list) {
      bonuses.set(moveKey(c.fromRow, c.fromCol, c.toRow, c.toCol), c.bonus);
    }
  };

  if (side === 'red') {
    if (moveCount === 0) {
      add([
        { fromRow: 7, fromCol: 7, toRow: 7, toCol: 4, bonus: 38 }, // P2 bình 5 (Pháo Đầu)
        { fromRow: 7, fromCol: 1, toRow: 7, toCol: 4, bonus: 34 }, // P8 bình 5
        { fromRow: 6, fromCol: 2, toRow: 5, toCol: 2, bonus: 30 }, // B7 tiến 1 (Tiên Nhân Chỉ Lộ)
        { fromRow: 9, fromCol: 6, toRow: 7, toCol: 4, bonus: 26 }, // T3 tiến 5 (Phi Tượng Cuộc)
        { fromRow: 9, fromCol: 7, toRow: 7, toCol: 6, bonus: 26 }, // M2 tiến 3 (Khởi Mã Cuộc)
        { fromRow: 6, fromCol: 6, toRow: 5, toCol: 6, bonus: 24 }, // B3 tiến 1
      ]);
    } else {
      add([
        { fromRow: 9, fromCol: 7, toRow: 7, toCol: 6, bonus: 24 }, // M2 tiến 3
        { fromRow: 9, fromCol: 1, toRow: 7, toCol: 2, bonus: 24 }, // M8 tiến 7
        { fromRow: 9, fromCol: 8, toRow: 9, toCol: 7, bonus: 22 }, // X1 bình 2
        { fromRow: 9, fromCol: 0, toRow: 9, toCol: 1, bonus: 20 }, // X9 bình 8
        { fromRow: 6, fromCol: 2, toRow: 5, toCol: 2, bonus: 18 }, // B7 tiến 1
        { fromRow: 6, fromCol: 6, toRow: 5, toCol: 6, bonus: 18 }, // B3 tiến 1
        { fromRow: 7, fromCol: 7, toRow: 7, toCol: 4, bonus: 20 }, // P2 bình 5
        { fromRow: 7, fromCol: 1, toRow: 7, toCol: 4, bonus: 18 }, // P8 bình 5
      ]);
    }
  } else {
    const redHasCentralCannon =
      grid[7][4]?.side === 'red' && grid[7][4]?.type === 'cannon';
    const redPushedPawn7 = grid[5][2]?.side === 'red' && grid[5][2]?.type === 'soldier';
    const redPushedPawn3 = grid[5][6]?.side === 'red' && grid[5][6]?.type === 'soldier';

    if (moveCount === 1) {
      if (redHasCentralCannon) {
        add([
          { fromRow: 0, fromCol: 7, toRow: 2, toCol: 6, bonus: 38 }, // M8 tiến 7 (Bình Phong Mã)
          { fromRow: 2, fromCol: 7, toRow: 2, toCol: 4, bonus: 32 }, // P8 bình 5 (Thuận Pháo)
          { fromRow: 0, fromCol: 1, toRow: 2, toCol: 2, bonus: 32 }, // M2 tiến 3
          { fromRow: 2, fromCol: 1, toRow: 2, toCol: 4, bonus: 28 }, // P2 bình 5 (Nghịch Pháo)
        ]);
      } else if (redPushedPawn7) {
        add([
          { fromRow: 2, fromCol: 1, toRow: 2, toCol: 2, bonus: 34 }, // P2 bình 3 (Tốt Để Pháo)
          { fromRow: 3, fromCol: 2, toRow: 4, toCol: 2, bonus: 28 }, // B3 tiến 1
          { fromRow: 0, fromCol: 6, toRow: 2, toCol: 4, bonus: 26 }, // T7 tiến 5
        ]);
      } else if (redPushedPawn3) {
        add([
          { fromRow: 2, fromCol: 7, toRow: 2, toCol: 6, bonus: 34 }, // P8 bình 7
          { fromRow: 3, fromCol: 6, toRow: 4, toCol: 6, bonus: 28 }, // B7 tiến 1
          { fromRow: 0, fromCol: 2, toRow: 2, toCol: 4, bonus: 26 }, // T3 tiến 5
        ]);
      } else {
        add([
          { fromRow: 2, fromCol: 1, toRow: 2, toCol: 4, bonus: 30 }, // P2 bình 5
          { fromRow: 0, fromCol: 7, toRow: 2, toCol: 6, bonus: 30 }, // M8 tiến 7
          { fromRow: 3, fromCol: 6, toRow: 4, toCol: 6, bonus: 24 }, // B7 tiến 1
        ]);
      }
    } else {
      add([
        { fromRow: 0, fromCol: 1, toRow: 2, toCol: 2, bonus: 24 }, // M2 tiến 3
        { fromRow: 0, fromCol: 7, toRow: 2, toCol: 6, bonus: 24 }, // M8 tiến 7
        { fromRow: 0, fromCol: 8, toRow: 0, toCol: 7, bonus: 22 }, // X9 bình 8
        { fromRow: 0, fromCol: 0, toRow: 0, toCol: 1, bonus: 22 }, // X1 bình 2
        { fromRow: 3, fromCol: 6, toRow: 4, toCol: 6, bonus: 18 }, // B7 tiến 1
        { fromRow: 3, fromCol: 2, toRow: 4, toCol: 2, bonus: 18 }, // B3 tiến 1
        { fromRow: 0, fromCol: 2, toRow: 2, toCol: 4, bonus: 16 }, // T3 tiến 5
        { fromRow: 0, fromCol: 3, toRow: 1, toCol: 4, bonus: 14 }, // S4 tiến 5
      ]);
    }
  }

  return bonuses;
}

/** Extract the true opponent best reply from Transposition Table (or fast 2-ply fallback) */
function extractBestReplyMove(
  bAfterMove: FastBoard,
  gridAfterMove: BoardState['grid'],
  ctx: SearchCtx,
): Move | null {
  const ttIdx = bAfterMove.hashLo & TT_MASK;
  if (
    ttGen[ttIdx] === currentSearchGen &&
    ttKeyLo[ttIdx] === bAfterMove.hashLo &&
    ttKeyHi[ttIdx] === bAfterMove.hashHi &&
    ttMove[ttIdx] !== 0
  ) {
    const candidate = ttMove[ttIdx];
    const side = bAfterMove.side;
    makeMoveFast(bAfterMove, candidate);
    const legal = !isSideInCheckFast(bAfterMove, side);
    unmakeMoveFast(bAfterMove, candidate);
    if (legal) {
      const unpacked = unpackMoveToBoardMove(gridAfterMove, candidate);
      if (unpacked) return unpacked;
    }
  }

  // Fallback: pick best legal 1-ply reply via quiescence
  const start = 0;
  const end = generatePseudoMovesFast(bAfterMove, MOVE_BUF, start, false);
  const side = bAfterMove.side;
  let bestPacked = 0;
  let bestScore = -INF;

  for (let i = start; i < end; i++) {
    const mv = MOVE_BUF[i];
    makeMoveFast(bAfterMove, mv);
    if (isSideInCheckFast(bAfterMove, side)) {
      unmakeMoveFast(bAfterMove, mv);
      continue;
    }
    const sc = -quiesce(bAfterMove, -INF, INF, 1, 2, ctx);
    unmakeMoveFast(bAfterMove, mv);
    if (sc > bestScore) {
      bestScore = sc;
      bestPacked = mv;
    }
  }

  return bestPacked !== 0 ? unpackMoveToBoardMove(gridAfterMove, bestPacked) : null;
}

/** Walks the Transposition Table to extract a clean multi-ply Principal Variation line */
function extractPvLine(
  rootBoard: FastBoard,
  rootGrid: BoardState['grid'],
  firstPacked: number,
  maxPlies = 4,
): string[] {
  const line: string[] = [];
  const visited = new Set<string>();
  const played: number[] = [];
  let curGrid = rootGrid;
  let nextPacked = firstPacked;

  for (let step = 0; step < maxPlies && nextPacked !== 0; step++) {
    const key = fastBoardHashKey(rootBoard);
    if (visited.has(key)) break;
    visited.add(key);

    const side = rootBoard.side;
    const unpacked = unpackMoveToBoardMove(curGrid, nextPacked);
    if (!unpacked) break;

    makeMoveFast(rootBoard, nextPacked);
    if (isSideInCheckFast(rootBoard, side)) {
      unmakeMoveFast(rootBoard, nextPacked);
      break;
    }
    played.push(nextPacked);
    line.push(formatMoveVietnamese(curGrid, unpacked));
    curGrid = applyMoveOnGrid(curGrid, unpacked);

    const ttIdx = rootBoard.hashLo & TT_MASK;
    if (
      ttGen[ttIdx] === currentSearchGen &&
      ttKeyLo[ttIdx] === rootBoard.hashLo &&
      ttKeyHi[ttIdx] === rootBoard.hashHi &&
      ttMove[ttIdx] !== 0
    ) {
      nextPacked = ttMove[ttIdx];
    } else {
      nextPacked = 0;
    }
  }

  for (let i = played.length - 1; i >= 0; i--) {
    unmakeMoveFast(rootBoard, played[i]);
  }
  return line;
}

// ============================================================================
// MOTIF, THREATS & WIN PROBABILITY
// ============================================================================

export function detectMoveMotif(
  prevGrid: BoardState['grid'],
  move: Move,
  afterGrid: BoardState['grid'],
): string {
  const opp = oppositeSide(move.piece.side);
  const givesCheck = isInCheck(afterGrid, opp);
  const toFile = colToFile(move.to.col, move.piece.side);
  const pattern = detectKillPattern(prevGrid, afterGrid, move);

  // Authentic classical Xiangqi kill/tactical patterns take priority on forcing checks
  // and signature tactical strikes (Đại Đao Hoạch Tâm, Pháo Niễn Đan Sa, Mã Hậu Pháo, etc.)
  if (pattern) {
    if (
      pattern.forcing ||
      pattern.id === 'dai_dao_hoach_tam' ||
      pattern.id === 'phao_nan_dan_sa'
    ) {
      return pattern.nameVi;
    }
    if (!move.captured && pattern.priority >= 60) {
      return pattern.nameVi;
    }
  }

  if (givesCheck && move.captured) return 'Sát Chiêu Đoạt Mệnh';
  if (givesCheck) return 'Kiếm Khí Chiếu Tướng';

  if (move.captured) {
    if (move.captured.type === 'chariot') return 'Trảm Xe Phá Trận';
    if (move.captured.type === 'cannon') return 'Đoạt Pháo Khai Lộ';
    if (move.captured.type === 'horse') return 'Chém Mã Đoạn Cước';
    return 'Ra Chiêu Ăn Quân';
  }

  if (pattern) {
    return pattern.nameVi;
  }

  if (move.piece.type === 'cannon' && toFile === 5 && move.from.row === move.to.row) {
    return 'Pháo Đầu Trấn Trung';
  }
  if (move.piece.type === 'horse') {
    if (toFile === 3 || toFile === 7) return 'Bình Phong Khởi Mã';
    return 'Phi Mã Xuất Trận';
  }
  if (move.piece.type === 'chariot') {
    const crossed =
      move.piece.side === 'red' ? move.to.row <= 4 : move.to.row >= 5;
    if (crossed) return 'Xa Khí Quá Hà';
    return 'Hoành Xa Tranh Lộ';
  }
  if (move.piece.type === 'soldier') {
    const crossed =
      move.piece.side === 'red' ? move.to.row <= 4 : move.to.row >= 5;
    if (crossed) return 'Tiên Phong Quá Hà';
    if (toFile === 7 || toFile === 3) return 'Tiên Nhân Chỉ Lộ';
    return 'Binh Tốt Khai Thông';
  }
  if (move.piece.type === 'elephant' && toFile === 5) {
    return 'Phi Tượng Trấn Trung';
  }
  if (move.piece.type === 'elephant' || move.piece.type === 'advisor') {
    return 'Cố Thủ Liên Hoàn';
  }

  void prevGrid;
  return 'Nội Lực Chuyển Hóa';
}

export function findTacticalThreats(grid: BoardState['grid']): TacticalThreat[] {
  const threats: TacticalThreat[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = grid[r][c];
      if (!p) continue;
      const pseudo = generatePseudoMovesForPiece(grid, r, c);
      for (const mv of pseudo) {
        if (!mv.captured) continue;
        const isOpeningBattery =
          p.type === 'cannon' &&
          mv.captured.type === 'horse' &&
          ((p.side === 'red' && r === 7 && mv.to.row === 0) ||
            (p.side === 'black' && r === 2 && mv.to.row === 9));
        if (isOpeningBattery) continue;

        const capVal = PIECE_VALUE[mv.captured.type];
        if (capVal >= 400 || mv.captured.type === 'king') {
          const attackerName = PIECE_NAME_VI[p.side][p.type];
          const targetName = PIECE_NAME_VI[mv.captured.side][mv.captured.type];
          threats.push({
            from: mv.from,
            to: mv.to,
            attackerSide: p.side,
            description: `${attackerName} (${p.side === 'red' ? 'Đỏ' : 'Đen'}) uy hiếp ${targetName}`,
          });
        }
      }
    }
  }
  return threats.slice(0, 5);
}

export function scoreToWinProbRed(score: number): number {
  const clamped = Math.max(-1800, Math.min(1800, score));
  const prob = 100 / (1 + Math.exp(-clamped / 360));
  return Math.round(Math.max(4, Math.min(96, prob)));
}

// ============================================================================
// MAIN GRANDMASTER ITERATIVE-DEEPENING ANALYSIS ENTRYPOINT
// ============================================================================

export function analyzePosition(
  state: BoardState,
  difficulty: BotDifficulty = 'cao_thu',
  options?: AnalyzeOptions,
): DeepAnalysisResult {
  const startedAt = Date.now();
  const side = state.turn;
  const fb = createFastBoard(state.grid, side);
  const positionKey = fastBoardHashKey(fb);

  // Increment TT generation (wraps cleanly at 65535)
  currentSearchGen = (currentSearchGen + 1) & 0xffff;
  if (currentSearchGen === 0) {
    ttGen.fill(0);
    currentSearchGen = 1;
  }
  KILLER_1.fill(0);
  KILLER_2.fill(0);
  // Decay history table gently instead of wiping so move ordering stays warm
  for (let i = 0; i < HISTORY.length; i++) {
    HISTORY[i] >>= 2;
  }

  // Generate ALL legal root moves — ZERO moves dropped!
  const rawEnd = generatePseudoMovesFast(fb, MOVE_BUF, 0, false);
  const rootMoves: number[] = [];
  for (let i = 0; i < rawEnd; i++) {
    const mv = MOVE_BUF[i];
    makeMoveFast(fb, mv);
    if (!isSideInCheckFast(fb, fb.side * -1)) {
      rootMoves.push(mv);
    }
    unmakeMoveFast(fb, mv);
  }

  if (rootMoves.length === 0) {
    const score = evaluateFast(fb);
    return {
      bestMove: null,
      bestNotation: 'Tuyệt Sát',
      score,
      winProbRed: side === 'red' ? 0 : 100,
      variations: [],
      threats: findTacticalThreats(state.grid),
      motif: 'Vạn Kiếm Quy Tông',
      tacticalSummary: 'Thế cục đã định, không còn đường lui.',
      searchDepth: 0,
      positionKey,
    };
  }

  const bookBonuses = getOpeningBookBonuses(state.grid, side, state.moveCount);
  const recentSet = new Set(options?.recentPositionKeys ?? []);
  const refereeLedger = ledgerForBoard(state);
  const refereeActive = refereeLedger.length >= 3;

  // Pre-compute static bonus (opening book + repetition check) for every root move
  interface RootEntry {
    packed: number;
    boardMove: Move;
    bookBonus: number;
    isRepeat: boolean;
    /** Playing this ply would be the 3rd occurrence with this side as the perpetual checker. */
    isLethal: boolean;
    scoreSide: number; // Side-to-move POV
    sortScore: number;
    isExact: boolean;
  }

  const entries: RootEntry[] = [];
  for (let i = 0; i < rootMoves.length; i++) {
    const packed = rootMoves[i];
    const boardMove = unpackMoveToBoardMove(state.grid, packed);
    if (!boardMove) continue;
    const bookBonus =
      bookBonuses.get(
        moveKey(
          boardMove.from.row,
          boardMove.from.col,
          boardMove.to.row,
          boardMove.to.col,
        ),
      ) ?? 0;

    let isRepeat = false;
    if (recentSet.size > 0) {
      makeMoveFast(fb, packed);
      isRepeat = recentSet.has(fastBoardHashKey(fb));
      unmakeMoveFast(fb, packed);
    }

    let isLethal = false;
    if (refereeActive) {
      const afterGrid = applyMoveOnGrid(state.grid, boardMove);
      isLethal = losesByPerpetualCheck(
        refereeLedger,
        recordForPosition({
          grid: afterGrid,
          turn: oppositeSide(side),
          ply: state.moveCount + 1,
          mover: side,
          gaveCheck: isInCheck(afterGrid, oppositeSide(side)),
          captured: boardMove.captured != null,
        }),
        side,
      );
    }

    const initOrder = scoreMoveFast(fb, packed, 0, 0) + bookBonus * 80;
    entries.push({
      packed,
      boardMove,
      bookBonus,
      isRepeat,
      isLethal,
      scoreSide: 0,
      sortScore: initOrder,
      isExact: false,
    });
  }

  // Only dodge the losing repetition while an alternative exists; when every legal move is the
  // losing one the result is already forced and best chess keeps playing the position cleanly.
  const perpetualLossIsAvoidable = entries.some((entry) => !entry.isLethal);

  // Initial root ordering: rule-losing shuffles last, then captures & classical opening candidates
  entries.sort(
    (a, b) =>
      Number(perpetualLossIsAvoidable && a.isLethal) -
        Number(perpetualLossIsAvoidable && b.isLethal) || b.sortScore - a.sortScore,
  );

  const isPreview = options?.mode === 'preview';
  const maxDepth = isPreview
    ? 4
    : difficulty === 'nhap_mon'
      ? 3
      : difficulty === 'cao_thu'
        ? 5
        : 6;
  const timeBudgetMs = isPreview
    ? 55
    : difficulty === 'nhap_mon'
      ? 45
      : difficulty === 'cao_thu'
        ? 160
        : 310;
  const maxNodes = isPreview
    ? 45_000
    : difficulty === 'nhap_mon'
      ? 24_000
      : difficulty === 'cao_thu'
        ? 130_000
        : 290_000;

  const ctx: SearchCtx = {
    nodes: 0,
    maxNodes,
    deadlineMs: Date.now() + timeBudgetMs,
    aborted: false,
    pathHashesLo: new Uint32Array(MAX_PLY + 4),
    pathHashesHi: new Uint32Array(MAX_PLY + 4),
    pathLen: 1,
  };
  ctx.pathHashesLo[0] = fb.hashLo;
  ctx.pathHashesHi[0] = fb.hashHi;

  // Snapshot of the last FULLY completed iteration so partial/aborted depths never lose a move
  let completedOrder: RootEntry[] = entries;
  let completedDepth = 0;
  let prevBestRawScore = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    ctx.aborted = false;
    const iterResults: RootEntry[] = [];
    let bestSortScore = -INF;
    let bestRawScore = -INF;
    const beta = INF;

    // True PVS + Aspiration Window at root: narrow window on PV move at depth >= 4, widen immediately on fail!
    for (let i = 0; i < completedOrder.length; i++) {
      const entry = completedOrder[i];
      const jitter =
        difficulty === 'nhap_mon'
          ? ((entry.boardMove.from.row * 7 + entry.boardMove.to.col * 13) % 24) - 12
          : 0;
      const maxPositiveAdj = entry.bookBonus + Math.max(0, jitter);

      makeMoveFast(fb, entry.packed);

      let scoreSide: number;
      let isExact = true;

      if (i === 0) {
        if (depth >= 4 && Math.abs(prevBestRawScore) < MATE_THRESHOLD) {
          const aspDelta = 85;
          const aspAlpha = prevBestRawScore - aspDelta;
          const aspBeta = prevBestRawScore + aspDelta;
          scoreSide = -negamax(fb, depth - 1, -aspBeta, -aspAlpha, 1, 0, true, ctx, entry.packed);
          if (!ctx.aborted && (scoreSide <= aspAlpha || scoreSide >= aspBeta)) {
            scoreSide = -negamax(fb, depth - 1, -INF, INF, 1, 0, true, ctx, entry.packed);
          }
        } else {
          scoreSide = -negamax(fb, depth - 1, -INF, INF, 1, 0, true, ctx, entry.packed);
        }
      } else {
        // Compute exact lower threshold needed to beat bestSortScore even with book/jitter tie-breakers.
        // Also widen moves 1..2 slightly so Top-3 variations display accurate scores.
        const neededToBeat = bestSortScore - maxPositiveAdj - 1;
        const scoutTarget =
          i < 3 ? Math.min(neededToBeat, bestRawScore - 55) : neededToBeat;
        const scoutAlpha = Math.max(-INF + 100, Math.min(INF - 100, scoutTarget));

        scoreSide = -negamax(fb, depth - 1, -scoutAlpha - 1, -scoutAlpha, 1, 0, true, ctx, entry.packed);
        if (!ctx.aborted && scoreSide > scoutAlpha) {
          scoreSide = -negamax(fb, depth - 1, -beta, -scoutAlpha, 1, 0, true, ctx, entry.packed);
          isExact = true;
        } else {
          // Fail-low upper bound: strictly worse than bestSortScore even after any static bonus!
          isExact = false;
        }
      }

      unmakeMoveFast(fb, entry.packed);

      if (ctx.aborted) {
        // Keep Depth 1 guaranteed complete even if budget somehow hits early
        if (depth > 1) break;
        ctx.aborted = false;
        const fallbackRaw = evaluateFast(fb);
        scoreSide = side === 'red' ? fallbackRaw : -fallbackRaw;
        isExact = true;
      }

      // Apply subtle book/repetition tie-breaker ONLY to exact (non-fail-low, non-mate) scores!
      let sortScore: number;
      if (!isExact) {
        // Strictly rank fail-low moves below all exact moves while preserving prior-depth ordering
        sortScore = -MATE_SCORE - 5000 - i;
      } else {
        sortScore = scoreSide;
        if (Math.abs(scoreSide) < MATE_THRESHOLD) {
          sortScore += entry.bookBonus + jitter;
          if (entry.isRepeat && scoreSide >= -40) {
            sortScore -= 55; // Avoid shuffling/repeating when equal or winning!
          }
        }
      }
      // A repeated position that this side loses by Trường chiếu is not a draw: the search reports
      // it as 0.00, so rank it below every safe alternative or Kỳ Ma happily "repeats to hold".
      if (entry.isLethal && perpetualLossIsAvoidable) {
        sortScore = -INF + i;
      }

      iterResults.push({
        ...entry,
        scoreSide,
        sortScore,
        isExact,
      });

      if (isExact && sortScore > bestSortScore) {
        bestSortScore = sortScore;
        bestRawScore = scoreSide;
      }
    }

    if (!ctx.aborted && iterResults.length === completedOrder.length) {
      iterResults.sort((a, b) => b.sortScore - a.sortScore);
      completedOrder = iterResults;
      completedDepth = depth;
      prevBestRawScore = completedOrder[0].scoreSide;

      // Immediate stop if we already found a forced checkmate!
      if (completedOrder[0].isExact && completedOrder[0].scoreSide >= MATE_THRESHOLD) {
        break;
      }
    } else {
      // Partial deeper iteration — if it discovered a strictly forced checkmate on an exact move,
      // promote it safely; otherwise retain the complete previous iteration!
      const forcedMate = iterResults.find(
        (r) => r.isExact && r.scoreSide >= MATE_THRESHOLD,
      );
      if (forcedMate) {
        completedOrder = [
          forcedMate,
          ...completedOrder.filter((r) => r.packed !== forcedMate.packed),
        ];
        completedDepth = depth;
      }
      break;
    }

    // Stop early if over 65% of time budget spent (next ply costs ~3-4x more)
    if (Date.now() + timeBudgetMs * 0.35 >= ctx.deadlineMs && depth >= 3) {
      break;
    }
  }

  // Convert side-to-move scores back to Red-relative centipawns
  const toRedScore = (s: number) => (side === 'red' ? s : -s);

  const top3 = completedOrder.slice(0, 3);
  const replyCtx: SearchCtx = {
    nodes: 0,
    maxNodes: 4000,
    deadlineMs: Date.now() + 25,
    aborted: false,
    pathHashesLo: new Uint32Array(12),
    pathHashesHi: new Uint32Array(12),
    pathLen: 0,
  };

  const variations: TacticalVariation[] = top3.map((entry) => {
    const notation = formatMoveVietnamese(state.grid, entry.boardMove);
    const nextGrid = applyMoveOnGrid(state.grid, entry.boardMove);
    makeMoveFast(fb, entry.packed);
    const bestReply = extractBestReplyMove(fb, nextGrid, replyCtx);
    unmakeMoveFast(fb, entry.packed);
    const replyNotation = bestReply
      ? formatMoveVietnamese(nextGrid, bestReply)
      : undefined;

    return {
      move: entry.boardMove,
      notation,
      score: toRedScore(entry.scoreSide),
      replyNotation,
    };
  });

  const best = top3[0];
  const bestRedScore = toRedScore(best.scoreSide);
  const afterBest = applyMoveOnGrid(state.grid, best.boardMove);
  const bestNotation = formatMoveVietnamese(state.grid, best.boardMove);
  const pvLine = extractPvLine(fb, state.grid, best.packed, 4);
  const motif = detectMoveMotif(state.grid, best.boardMove, afterBest);
  const threats = findTacticalThreats(state.grid);
  const winProbRed = scoreToWinProbRed(bestRedScore);

  const advantageText =
    Math.abs(bestRedScore) >= MATE_THRESHOLD
      ? bestRedScore > 0
        ? 'Hồng phương (Khách mời) đã nhìn ra đường sát cục!'
        : 'Hắc phương (Kỳ Ma Bot) đã tung sát chiêu tuyệt định!'
      : Math.abs(bestRedScore) < 85
        ? 'Thế trận cân bằng, đôi bên giằng co nội lực.'
        : bestRedScore > 0
          ? `Hồng phương (Khách mời) chiếm tiên cơ (+${(bestRedScore / 100).toFixed(1)}).`
          : `Hắc phương (Kỳ Ma Bot) áp đảo thế công (${(bestRedScore / 100).toFixed(1)}).`;

  return {
    bestMove: best.boardMove,
    bestNotation,
    score: bestRedScore,
    winProbRed,
    variations,
    threats,
    motif,
    tacticalSummary: `${motif} · ${advantageText}`,
    searchDepth: completedDepth,
    positionKey,
    pvLine,
    nodesSearched: ctx.nodes,
    elapsedMs: Math.max(1, Date.now() - startedAt),
  };
}
