/**
 * High-Performance Zero-Allocation 90-Cell Xiangqi Search Engine Core.
 *
 * Uses a flat Int8Array(90) board, packed 32-bit integer moves, O(1) king-centric
 * check/attack detection, dual-32-bit Zobrist hashing, and tapered Grandmaster
 * Xiangqi evaluation (Midgame <-> Endgame phase interpolation).
 */

import { BOARD_COLS, BOARD_ROWS, BoardState, Move, Piece, PieceType, Side } from './xiangqi';

// Signed piece codes: >0 Red, <0 Black, 0 Empty
export const P_EMPTY = 0;
export const P_KING = 1;
export const P_ADVISOR = 2;
export const P_ELEPHANT = 3;
export const P_HORSE = 4;
export const P_CHARIOT = 5;
export const P_CANNON = 6;
export const P_SOLDIER = 7;

// Side codes: 1 = Red, -1 = Black
export const SIDE_RED = 1;
export const SIDE_BLACK = -1;

// Move packing: bits 0..6 = from (0..89), bits 7..13 = to (0..89), bits 14..18 = captured + 8 (0..15)
export function packMove(from: number, to: number, captured: number): number {
  return from | (to << 7) | ((captured + 8) << 14);
}
export function moveFrom(m: number): number {
  return m & 0x7f;
}
export function moveTo(m: number): number {
  return (m >> 7) & 0x7f;
}
export function moveCaptured(m: number): number {
  return ((m >> 14) & 0x1f) - 8;
}

// Deterministic PRNG (xorshift32) for Zobrist keys
function makeZobristTables() {
  let seed = 0x9e3779b9;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  // Index: (piece + 7) * 90 + sq  (piece in -7..7 -> 0..14)
  const pieceLo = new Uint32Array(15 * 90);
  const pieceHi = new Uint32Array(15 * 90);
  for (let i = 0; i < pieceLo.length; i++) {
    pieceLo[i] = next();
    pieceHi[i] = next();
  }
  const sideLo = next();
  const sideHi = next();
  return { pieceLo, pieceHi, sideLo, sideHi };
}

export const ZOBRIST = makeZobristTables();

export interface FastBoard {
  cells: Int8Array; // length 90, idx = row * 9 + col
  redKingSq: number;
  blackKingSq: number;
  hashLo: number;
  hashHi: number;
  side: number; // 1 = Red, -1 = Black
}

const TYPE_TO_CODE: Record<PieceType, number> = {
  king: P_KING,
  advisor: P_ADVISOR,
  elephant: P_ELEPHANT,
  horse: P_HORSE,
  chariot: P_CHARIOT,
  cannon: P_CANNON,
  soldier: P_SOLDIER,
};

export function createFastBoard(grid: BoardState['grid'], turn: Side): FastBoard {
  const cells = new Int8Array(90);
  let redKingSq = -1;
  let blackKingSq = -1;
  let hashLo = 0;
  let hashHi = 0;

  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = grid[r][c];
      if (!p) continue;
      const sq = r * 9 + c;
      const absCode = TYPE_TO_CODE[p.type];
      const code = p.side === 'red' ? absCode : -absCode;
      cells[sq] = code;
      if (code === P_KING) redKingSq = sq;
      else if (code === -P_KING) blackKingSq = sq;
      const zIdx = (code + 7) * 90 + sq;
      hashLo = (hashLo ^ ZOBRIST.pieceLo[zIdx]) >>> 0;
      hashHi = (hashHi ^ ZOBRIST.pieceHi[zIdx]) >>> 0;
    }
  }

  const side = turn === 'red' ? SIDE_RED : SIDE_BLACK;
  if (side === SIDE_BLACK) {
    hashLo = (hashLo ^ ZOBRIST.sideLo) >>> 0;
    hashHi = (hashHi ^ ZOBRIST.sideHi) >>> 0;
  }

  return { cells, redKingSq, blackKingSq, hashLo, hashHi, side };
}

export function fastBoardHashKey(b: FastBoard): string {
  return `${b.hashLo.toString(16)}_${b.hashHi.toString(16)}`;
}

export function makeMoveFast(b: FastBoard, mv: number): void {
  const from = mv & 0x7f;
  const to = (mv >> 7) & 0x7f;
  const moving = b.cells[from];
  const captured = b.cells[to];

  // XOR out moving piece at from
  const zFrom = (moving + 7) * 90 + from;
  b.hashLo = (b.hashLo ^ ZOBRIST.pieceLo[zFrom]) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.pieceHi[zFrom]) >>> 0;

  // XOR out captured piece at to (if any)
  if (captured !== 0) {
    const zCap = (captured + 7) * 90 + to;
    b.hashLo = (b.hashLo ^ ZOBRIST.pieceLo[zCap]) >>> 0;
    b.hashHi = (b.hashHi ^ ZOBRIST.pieceHi[zCap]) >>> 0;
  }

  // XOR in moving piece at to
  const zTo = (moving + 7) * 90 + to;
  b.hashLo = (b.hashLo ^ ZOBRIST.pieceLo[zTo]) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.pieceHi[zTo]) >>> 0;

  // Flip side hash
  b.hashLo = (b.hashLo ^ ZOBRIST.sideLo) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.sideHi) >>> 0;

  b.cells[from] = 0;
  b.cells[to] = moving;

  if (moving === P_KING) b.redKingSq = to;
  else if (moving === -P_KING) b.blackKingSq = to;
  if (captured === P_KING) b.redKingSq = -1;
  else if (captured === -P_KING) b.blackKingSq = -1;

  b.side = -b.side;
}

export function unmakeMoveFast(b: FastBoard, mv: number): void {
  const from = mv & 0x7f;
  const to = (mv >> 7) & 0x7f;
  const captured = ((mv >> 14) & 0x1f) - 8;
  const moving = b.cells[to];

  b.side = -b.side;

  // Flip side hash back
  b.hashLo = (b.hashLo ^ ZOBRIST.sideLo) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.sideHi) >>> 0;

  // XOR out moving piece at to
  const zTo = (moving + 7) * 90 + to;
  b.hashLo = (b.hashLo ^ ZOBRIST.pieceLo[zTo]) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.pieceHi[zTo]) >>> 0;

  // XOR in captured piece at to (if any)
  if (captured !== 0) {
    const zCap = (captured + 7) * 90 + to;
    b.hashLo = (b.hashLo ^ ZOBRIST.pieceLo[zCap]) >>> 0;
    b.hashHi = (b.hashHi ^ ZOBRIST.pieceHi[zCap]) >>> 0;
  }

  // XOR in moving piece back at from
  const zFrom = (moving + 7) * 90 + from;
  b.hashLo = (b.hashLo ^ ZOBRIST.pieceLo[zFrom]) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.pieceHi[zFrom]) >>> 0;

  b.cells[from] = moving;
  b.cells[to] = captured;

  if (moving === P_KING) b.redKingSq = from;
  else if (moving === -P_KING) b.blackKingSq = from;
  if (captured === P_KING) b.redKingSq = to;
  else if (captured === -P_KING) b.blackKingSq = to;
}

export function makeNullMoveFast(b: FastBoard): void {
  b.side = -b.side;
  b.hashLo = (b.hashLo ^ ZOBRIST.sideLo) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.sideHi) >>> 0;
}

export function unmakeNullMoveFast(b: FastBoard): void {
  b.side = -b.side;
  b.hashLo = (b.hashLo ^ ZOBRIST.sideLo) >>> 0;
  b.hashHi = (b.hashHi ^ ZOBRIST.sideHi) >>> 0;
}

// Horse reverse-check offsets: from King (kr, kc), enemy horse is at (kr + dr, kc + dc),
// and the horse's blocking leg is at (kr + lr, kc + lc) — diagonally adjacent to King!
const HORSE_REV_OFFSETS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-2, -1, -1, -1],
  [-2, 1, -1, 1],
  [2, -1, 1, -1],
  [2, 1, 1, 1],
  [-1, -2, -1, -1],
  [1, -2, 1, -1],
  [-1, 2, -1, 1],
  [1, 2, 1, 1],
];

/**
 * O(1) King-Centric Check & Flying General Detector (~25 array lookups total!).
 * Checks if `side`'s king is currently under attack by `-side` OR facing the enemy king.
 */
export function isSideInCheckFast(b: FastBoard, side: number): boolean {
  const kingSq = side === SIDE_RED ? b.redKingSq : b.blackKingSq;
  if (kingSq < 0) return true;

  const cells = b.cells;
  const kr = (kingSq / 9) | 0;
  const kc = kingSq - kr * 9;

  const enemyRook = -side * P_CHARIOT;
  const enemyCannon = -side * P_CANNON;
  const enemyKing = -side * P_KING;
  const enemyHorse = -side * P_HORSE;
  const enemySoldier = -side * P_SOLDIER;

  // 1. Scan UP (decreasing row)
  let screen = false;
  for (let r = kr - 1; r >= 0; r--) {
    const p = cells[r * 9 + kc];
    if (p === 0) continue;
    if (!screen) {
      if (p === enemyRook || p === enemyKing) return true;
      screen = true;
    } else {
      if (p === enemyCannon) return true;
      break;
    }
  }

  // 2. Scan DOWN (increasing row)
  screen = false;
  for (let r = kr + 1; r < 10; r++) {
    const p = cells[r * 9 + kc];
    if (p === 0) continue;
    if (!screen) {
      if (p === enemyRook || p === enemyKing) return true;
      screen = true;
    } else {
      if (p === enemyCannon) return true;
      break;
    }
  }

  // 3. Scan LEFT (decreasing col)
  screen = false;
  const rowBase = kr * 9;
  for (let c = kc - 1; c >= 0; c--) {
    const p = cells[rowBase + c];
    if (p === 0) continue;
    if (!screen) {
      if (p === enemyRook) return true;
      screen = true;
    } else {
      if (p === enemyCannon) return true;
      break;
    }
  }

  // 4. Scan RIGHT (increasing col)
  screen = false;
  for (let c = kc + 1; c < 9; c++) {
    const p = cells[rowBase + c];
    if (p === 0) continue;
    if (!screen) {
      if (p === enemyRook) return true;
      screen = true;
    } else {
      if (p === enemyCannon) return true;
      break;
    }
  }

  // 5. Enemy Soldier checks (forward relative to enemy, plus left/right)
  if (side === SIDE_RED) {
    // Black soldier attacks downward (from kr - 1) or sideways (kc +- 1)
    if (kr > 0 && cells[(kr - 1) * 9 + kc] === enemySoldier) return true;
  } else {
    // Red soldier attacks upward (from kr + 1) or sideways (kc +- 1)
    if (kr < 9 && cells[(kr + 1) * 9 + kc] === enemySoldier) return true;
  }
  if (kc > 0 && cells[rowBase + kc - 1] === enemySoldier) return true;
  if (kc < 8 && cells[rowBase + kc + 1] === enemySoldier) return true;

  // 6. Enemy Horse checks (8 positions + leg-clear verification)
  for (let i = 0; i < 8; i++) {
    const off = HORSE_REV_OFFSETS[i];
    const hr = kr + off[0];
    const hc = kc + off[1];
    if (hr < 0 || hr > 9 || hc < 0 || hc > 8) continue;
    if (cells[hr * 9 + hc] === enemyHorse) {
      // Leg square of horse at (hr, hc) jumping to (kr, kc) is (kr + off[2], kc + off[3])
      if (cells[(kr + off[2]) * 9 + (kc + off[3])] === 0) {
        return true;
      }
    }
  }

  return false;
}

const HORSE_STEPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-2, -1, -1, 0],
  [-2, 1, -1, 0],
  [2, -1, 1, 0],
  [2, 1, 1, 0],
  [-1, -2, 0, -1],
  [1, -2, 0, -1],
  [-1, 2, 0, 1],
  [1, 2, 0, 1],
];

const ELEPHANT_STEPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-2, -2, -1, -1],
  [-2, 2, -1, 1],
  [2, -2, 1, -1],
  [2, 2, 1, 1],
];

const ADVISOR_STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ORTHO_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Generates pseudo-legal moves into a reusable Int32Array buffer (zero GC!).
 * If `capturesOnly` is true, pushes only captures.
 */
export function generatePseudoMovesFast(
  b: FastBoard,
  outBuf: Int32Array,
  startIdx: number,
  capturesOnly: boolean,
): number {
  const cells = b.cells;
  const side = b.side;
  let count = startIdx;

  for (let sq = 0; sq < 90; sq++) {
    const p = cells[sq];
    if (p === 0 || (side > 0 ? p < 0 : p > 0)) continue;

    const r = (sq / 9) | 0;
    const c = sq - r * 9;
    const absType = p > 0 ? p : -p;

    switch (absType) {
      case P_CHARIOT: {
        for (let d = 0; d < 4; d++) {
          const dr = ORTHO_DIRS[d][0];
          const dc = ORTHO_DIRS[d][1];
          let nr = r + dr;
          let nc = c + dc;
          while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
            const toSq = nr * 9 + nc;
            const target = cells[toSq];
            if (target === 0) {
              if (!capturesOnly) {
                outBuf[count++] = sq | (toSq << 7) | (8 << 14);
              }
            } else {
              if (side > 0 ? target < 0 : target > 0) {
                outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
              }
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
        break;
      }

      case P_CANNON: {
        for (let d = 0; d < 4; d++) {
          const dr = ORTHO_DIRS[d][0];
          const dc = ORTHO_DIRS[d][1];
          let nr = r + dr;
          let nc = c + dc;
          let jumped = false;
          while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
            const toSq = nr * 9 + nc;
            const target = cells[toSq];
            if (!jumped) {
              if (target === 0) {
                if (!capturesOnly) {
                  outBuf[count++] = sq | (toSq << 7) | (8 << 14);
                }
              } else {
                jumped = true;
              }
            } else if (target !== 0) {
              if (side > 0 ? target < 0 : target > 0) {
                outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
              }
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
        break;
      }

      case P_HORSE: {
        for (let i = 0; i < 8; i++) {
          const st = HORSE_STEPS[i];
          const nr = r + st[0];
          const nc = c + st[1];
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (cells[(r + st[2]) * 9 + (c + st[3])] !== 0) continue;
          const toSq = nr * 9 + nc;
          const target = cells[toSq];
          if (target === 0) {
            if (!capturesOnly) {
              outBuf[count++] = sq | (toSq << 7) | (8 << 14);
            }
          } else if (side > 0 ? target < 0 : target > 0) {
            outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
          }
        }
        break;
      }

      case P_SOLDIER: {
        const nr = side > 0 ? r - 1 : r + 1;
        if (nr >= 0 && nr < 10) {
          const toSq = nr * 9 + c;
          const target = cells[toSq];
          if (target === 0) {
            if (!capturesOnly) outBuf[count++] = sq | (toSq << 7) | (8 << 14);
          } else if (side > 0 ? target < 0 : target > 0) {
            outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
          }
        }
        const crossed = side > 0 ? r <= 4 : r >= 5;
        if (crossed) {
          if (c > 0) {
            const toSq = sq - 1;
            const target = cells[toSq];
            if (target === 0) {
              if (!capturesOnly) outBuf[count++] = sq | (toSq << 7) | (8 << 14);
            } else if (side > 0 ? target < 0 : target > 0) {
              outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
            }
          }
          if (c < 8) {
            const toSq = sq + 1;
            const target = cells[toSq];
            if (target === 0) {
              if (!capturesOnly) outBuf[count++] = sq | (toSq << 7) | (8 << 14);
            } else if (side > 0 ? target < 0 : target > 0) {
              outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
            }
          }
        }
        break;
      }

      case P_ELEPHANT: {
        for (let i = 0; i < 4; i++) {
          const st = ELEPHANT_STEPS[i];
          const nr = r + st[0];
          const nc = c + st[1];
          if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
          if (side > 0 ? nr < 5 : nr > 4) continue;
          if (cells[(r + st[2]) * 9 + (c + st[3])] !== 0) continue;
          const toSq = nr * 9 + nc;
          const target = cells[toSq];
          if (target === 0) {
            if (!capturesOnly) outBuf[count++] = sq | (toSq << 7) | (8 << 14);
          } else if (side > 0 ? target < 0 : target > 0) {
            outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
          }
        }
        break;
      }

      case P_ADVISOR: {
        const minR = side > 0 ? 7 : 0;
        const maxR = side > 0 ? 9 : 2;
        for (let i = 0; i < 4; i++) {
          const nr = r + ADVISOR_STEPS[i][0];
          const nc = c + ADVISOR_STEPS[i][1];
          if (nr < minR || nr > maxR || nc < 3 || nc > 5) continue;
          const toSq = nr * 9 + nc;
          const target = cells[toSq];
          if (target === 0) {
            if (!capturesOnly) outBuf[count++] = sq | (toSq << 7) | (8 << 14);
          } else if (side > 0 ? target < 0 : target > 0) {
            outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
          }
        }
        break;
      }

      case P_KING: {
        const minR = side > 0 ? 7 : 0;
        const maxR = side > 0 ? 9 : 2;
        for (let d = 0; d < 4; d++) {
          const nr = r + ORTHO_DIRS[d][0];
          const nc = c + ORTHO_DIRS[d][1];
          if (nr < minR || nr > maxR || nc < 3 || nc > 5) continue;
          const toSq = nr * 9 + nc;
          const target = cells[toSq];
          if (target === 0) {
            if (!capturesOnly) outBuf[count++] = sq | (toSq << 7) | (8 << 14);
          } else if (side > 0 ? target < 0 : target > 0) {
            outBuf[count++] = sq | (toSq << 7) | ((target + 8) << 14);
          }
        }
        break;
      }
    }
  }

  return count;
}

/** Check if side has at least one heavy piece (Chariot, Cannon, or Horse) — safe for Null-Move Pruning */
export function hasHeavyMaterial(b: FastBoard, side: number): boolean {
  const cells = b.cells;
  for (let sq = 0; sq < 90; sq++) {
    const p = cells[sq];
    if (side > 0) {
      if (p === P_CHARIOT || p === P_CANNON || p === P_HORSE) return true;
    } else {
      if (p === -P_CHARIOT || p === -P_CANNON || p === -P_HORSE) return true;
    }
  }
  return false;
}

// ============================================================================
// GRANDMASTER TAPERED XIANGQI EVALUATION (Midgame + Endgame + Tactical Terms)
// ============================================================================

// Material values indexed by absType (1..7): K, A, E, H, R, C, P
export const MG_VAL = [0, 10000, 225, 225, 435, 960, 485, 105];
export const EG_VAL = [0, 10000, 240, 240, 480, 1020, 445, 155];

// Oriented for Red (row 0 = Black back rank, row 9 = Red back rank)
const SOLDIER_MG_PST = [
  10, 14, 18, 24, 28, 24, 18, 14, 10,
  40, 56, 76, 92, 98, 92, 76, 56, 40,
  36, 50, 68, 82, 86, 82, 68, 50, 36,
  30, 42, 56, 66, 70, 66, 56, 42, 30,
  20, 30, 40, 50, 56, 50, 40, 30, 20,
   6,  0, 14,  0, 18,  0, 14,  0,  6,
   4,  0,  8,  0, 12,  0,  8,  0,  4,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
];

const SOLDIER_EG_PST = [
  14, 20, 26, 36, 42, 36, 26, 20, 14,
  58, 78, 104, 124, 132, 124, 104, 78, 58,
  52, 70, 94, 112, 118, 112, 94, 70, 52,
  44, 58, 78, 92, 98, 92, 78, 58, 44,
  30, 42, 56, 68, 76, 68, 56, 42, 30,
   8,  0, 18,  0, 22,  0, 18,  0,  8,
   4,  0, 10,  0, 14,  0, 10,  0,  4,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
];

const HORSE_PST = [
   2, 10, 18, 14,  4, 14, 18, 10,  2,
   6, 16, 36, 26, 12, 26, 36, 16,  6,
  14, 22, 34, 42, 26, 42, 34, 22, 14, // col 2/6 row 2 = Điếu Ngư Mã (钓鱼马) post!
  10, 26, 28, 34, 28, 34, 28, 26, 10,
   8, 20, 24, 28, 26, 28, 24, 20,  8,
   4, 14, 22, 20, 18, 20, 22, 14,  4,
   2,  8, 16, 14, 16, 14, 16,  8,  2,
   2,  6, 20, 16,  8, 16, 20,  6,  2,
  -2,  2,  6,  6, -8,  6,  6,  2, -2,
  -8, -6,  0,  0,  0,  0,  0, -6, -8,
];

const CANNON_PST = [
   6,  4,  0, -6, -12, -6,  0,  4,  6,
   4,  4,  0, -2, -10, -2,  0,  4,  4,
   4,  4,  2, -4,  -6, -4,  2,  4,  4,
   2,  2,  4,  8,  16,  8,  4,  2,  2,
   0,  4,  6,  8,  14,  8,  6,  4,  0,
  -2,  2,  8,  8,  12,  8,  8,  2, -2,
   0,  2,  6,  8,  12,  8,  6,  2,  0,
   6,  4, 12, 12,  32, 12, 12,  4,  6, // Central Cannon (Pháo Đầu)
   0,  4,  6,  8,  10,  8,  6,  4,  0,
   0,  0,  4,  8,   8,  8,  4,  0,  0,
];

const CHARIOT_PST = [
  16, 16, 14, 22, 18, 22, 14, 16, 16,
  22, 26, 24, 34, 34, 34, 24, 26, 22, // Enemy back/palace rank domination
  16, 18, 18, 26, 24, 26, 18, 18, 16,
  16, 24, 22, 30, 28, 30, 22, 24, 16, // Enemy river bank (kỵ hà)
  14, 18, 18, 26, 24, 26, 18, 18, 14,
  12, 20, 18, 26, 24, 26, 18, 20, 12, // Own river bank (tuần hà)
   6, 14, 12, 20, 18, 20, 12, 14,  6,
   4, 12, 10, 18, 16, 18, 10, 12,  4,
   8,  8, 12, 20, 12, 20, 12,  8,  8,
 -10, 14,  6, 18, 12, 18,  6, 14, -10,
];

/**
 * Evaluates position in centipawns from **Red's POV** (+ favors Red, - favors Black).
 * Fast, deterministic, tapered between Midgame and Endgame with authentic Xiangqi patterns.
 */
export function evaluateFast(b: FastBoard): number {
  const cells = b.cells;

  let mgScore = 0;
  let egScore = 0;
  let phase = 0; // max ~24 (4R*3 + 4C*2 + 4H*1 = 24)

  let redAdvisors = 0;
  let blackAdvisors = 0;
  let redElephants = 0;
  let blackElephants = 0;
  let redChariots = 0;
  let blackChariots = 0;
  let redAttackBlackPalace = 0;
  let blackAttackRedPalace = 0;

  for (let sq = 0; sq < 90; sq++) {
    const p = cells[sq];
    if (p === 0) continue;

    const r = (sq / 9) | 0;
    const c = sq - r * 9;
    const isRed = p > 0;
    const absType = isRed ? p : -p;
    const pstSq = isRed ? sq : (9 - r) * 9 + c;

    let mg = MG_VAL[absType];
    let eg = EG_VAL[absType];

    switch (absType) {
      case P_CHARIOT: {
        phase += 3;
        if (isRed) redChariots++;
        else blackChariots++;
        mg += CHARIOT_PST[pstSq];
        eg += CHARIOT_PST[pstSq];

        // Vertical mobility & open-file pressure
        let mob = 0;
        for (let rr = r - 1; rr >= 0; rr--) {
          mob++;
          if (cells[rr * 9 + c] !== 0) break;
        }
        for (let rr = r + 1; rr < 10; rr++) {
          mob++;
          if (cells[rr * 9 + c] !== 0) break;
        }
        // Horizontal mobility
        for (let cc = c - 1; cc >= 0; cc--) {
          mob++;
          if (cells[r * 9 + cc] !== 0) break;
        }
        for (let cc = c + 1; cc < 9; cc++) {
          mob++;
          if (cells[r * 9 + cc] !== 0) break;
        }
        mg += mob * 3;
        eg += mob * 4;

        // Palace invasion pressure
        if (isRed && r <= 3 && c >= 2 && c <= 6) redAttackBlackPalace += 24;
        else if (!isRed && r >= 6 && c >= 2 && c <= 6) blackAttackRedPalace += 24;
        break;
      }

      case P_CANNON: {
        phase += 2;
        mg += CANNON_PST[pstSq];
        eg += CANNON_PST[pstSq];

        // Central Cannon (Pháo Đầu) & Hollow Cannon (Không Đầu Pháo) bonus!
        if (c === 4) {
          const enemyKingSq = isRed ? b.blackKingSq : b.redKingSq;
          if (enemyKingSq >= 0 && enemyKingSq % 9 === 4) {
            const kRow = (enemyKingSq / 9) | 0;
            const lo = Math.min(r, kRow) + 1;
            const hi = Math.max(r, kRow);
            let between = 0;
            for (let rr = lo; rr < hi; rr++) {
              if (cells[rr * 9 + 4] !== 0) between++;
            }
            if (between === 0) {
              // Không Đầu Pháo (Hollow Cannon) — devastating attack!
              mg += 58;
              eg += 40;
              if (isRed) redAttackBlackPalace += 30;
              else blackAttackRedPalace += 30;
            } else if (between === 1) {
              // Direct Pin / Active Cannon battery on enemy King!
              mg += 26;
              eg += 16;
              if (isRed) redAttackBlackPalace += 18;
              else blackAttackRedPalace += 18;
            }
          }
        }
        if (isRed && r <= 3 && c >= 2 && c <= 6) redAttackBlackPalace += 14;
        else if (!isRed && r >= 6 && c >= 2 && c <= 6) blackAttackRedPalace += 14;
        break;
      }

      case P_HORSE: {
        phase += 1;
        mg += HORSE_PST[pstSq];
        eg += HORSE_PST[pstSq] + 8;

        // Penalize severely cramped / leg-blocked horse
        let openLegs = 0;
        if (r > 1 && cells[sq - 9] === 0) openLegs++;
        if (r < 8 && cells[sq + 9] === 0) openLegs++;
        if (c > 1 && cells[sq - 1] === 0) openLegs++;
        if (c < 7 && cells[sq + 1] === 0) openLegs++;
        if (openLegs === 0) {
          mg -= 42;
          eg -= 42;
        } else if (openLegs === 1) {
          mg -= 18;
          eg -= 18;
        }

        if (isRed && r <= 3 && c >= 2 && c <= 6) redAttackBlackPalace += 20;
        else if (!isRed && r >= 6 && c >= 2 && c <= 6) blackAttackRedPalace += 20;
        break;
      }

      case P_SOLDIER: {
        mg += SOLDIER_MG_PST[pstSq];
        eg += SOLDIER_EG_PST[pstSq];
        const crossed = isRed ? r <= 4 : r >= 5;
        if (crossed) {
          // Bonus for connected crossed-river soldiers
          const allySoldier = isRed ? P_SOLDIER : -P_SOLDIER;
          if (c < 8 && cells[sq + 1] === allySoldier) {
            mg += 22;
            eg += 34;
          }
          if (isRed && r <= 2 && c >= 3 && c <= 5) redAttackBlackPalace += 14;
          else if (!isRed && r >= 7 && c >= 3 && c <= 5) blackAttackRedPalace += 14;
        }
        break;
      }

      case P_ADVISOR: {
        if (isRed) redAdvisors++;
        else blackAdvisors++;
        const centerBonus = (isRed ? r === 8 : r === 1) && c === 4 ? 18 : 8;
        mg += centerBonus;
        eg += centerBonus;
        break;
      }

      case P_ELEPHANT: {
        if (isRed) redElephants++;
        else blackElephants++;
        const centerBonus = (isRed ? r === 7 : r === 2) && c === 4 ? 16 : 6;
        mg += centerBonus;
        eg += centerBonus;
        break;
      }

      case P_KING: {
        const homeBonus = (isRed ? r === 9 : r === 0) && c === 4 ? 16 : 0;
        mg += homeBonus;
        break;
      }
    }

    if (isRed) {
      mgScore += mg;
      egScore += eg;
    } else {
      mgScore -= mg;
      egScore -= eg;
    }
  }

  // Full guard synergy (Sĩ Tượng toàn)
  if (redAdvisors === 2) {
    mgScore += 20;
    egScore += 24;
  }
  if (blackAdvisors === 2) {
    mgScore -= 20;
    egScore -= 24;
  }
  if (redElephants === 2) {
    mgScore += 18;
    egScore += 22;
  }
  if (blackElephants === 2) {
    mgScore -= 18;
    egScore -= 22;
  }

  // King safety penalty when guards are broken while enemy still has chariots!
  if (blackChariots > 0 && redAdvisors < 2) {
    const deficit = (2 - redAdvisors) * 28 + (redElephants < 2 ? 16 : 0);
    mgScore -= deficit;
    egScore -= deficit;
  }
  if (redChariots > 0 && blackAdvisors < 2) {
    const deficit = (2 - blackAdvisors) * 28 + (blackElephants < 2 ? 16 : 0);
    mgScore += deficit;
    egScore += deficit;
  }

  // Coordinated attack multiplier when >=2 enemy pieces converge on the palace
  if (redAttackBlackPalace >= 36) {
    mgScore += Math.min(95, (redAttackBlackPalace - 20) * 1.4) | 0;
  }
  if (blackAttackRedPalace >= 36) {
    mgScore -= Math.min(95, (blackAttackRedPalace - 20) * 1.4) | 0;
  }

  // Small tempo bonus for side to move
  const tempo = b.side === SIDE_RED ? 10 : -10;
  mgScore += tempo;
  egScore += tempo;

  const clampedPhase = phase > 24 ? 24 : phase;
  return (((mgScore * clampedPhase + egScore * (24 - clampedPhase)) / 24) | 0);
}

/** Convert packed fast move back to full Move object using the live React grid */
export function unpackMoveToBoardMove(grid: BoardState['grid'], packed: number): Move | null {
  const from = moveFrom(packed);
  const to = moveTo(packed);
  const fr = (from / 9) | 0;
  const fc = from - fr * 9;
  const tr = (to / 9) | 0;
  const tc = to - tr * 9;
  const piece: Piece | null = grid[fr]?.[fc] ?? null;
  if (!piece) return null;
  return {
    from: { row: fr, col: fc },
    to: { row: tr, col: tc },
    piece,
    captured: grid[tr]?.[tc] ?? null,
  };
}
