import {
  BoardState,
  Move,
  PIECE_SHORT_VI,
  PieceType,
  Side,
  generateLegalMoves,
} from './xiangqi';

export type MoveDirection = 'tien' | 'thoai' | 'binh';

/**
 * Xiangqi file numbering (1..9):
 * - For RED (bottom, rows 9->0): Rightmost col (8) is file 1, Leftmost col (0) is file 9.
 *   file = 9 - col
 * - For BLACK (top, rows 0->9): Rightmost from Black's perspective is col (0) = file 1, col (8) = file 9.
 *   file = col + 1
 */
export function colToFile(col: number, side: Side): number {
  return side === 'red' ? 9 - col : col + 1;
}

export function fileToCol(file: number, side: Side): number {
  return side === 'red' ? 9 - file : file - 1;
}

/**
 * Format a Xiangqi move into standard Vietnamese chess notation.
 * Examples: "P2 bình 5", "M8 tiến 7", "X7 bình 3", "B7 tiến 1", "X1 thoái 2".
 */
export function formatMoveVietnamese(grid: BoardState['grid'], move: Move): string {
  const { piece, from, to } = move;
  const side = piece.side;
  const short = PIECE_SHORT_VI[piece.type];
  const fromFile = colToFile(from.col, side);
  const toFile = colToFile(to.col, side);

  // Check if another friendly piece of the same type is on the same file
  const sameFileRows: number[] = [];
  for (let r = 0; r < 10; r++) {
    const p = grid[r][from.col];
    if (p && p.side === side && p.type === piece.type) {
      sameFileRows.push(r);
    }
  }

  let prefix = `${short}${fromFile}`;
  if (sameFileRows.length >= 2) {
    // "Tiền" (front) is closer to opponent's side
    sameFileRows.sort((a, b) => (side === 'red' ? a - b : b - a));
    if (sameFileRows[0] === from.row) {
      prefix = `${short} trước`;
    } else if (sameFileRows[sameFileRows.length - 1] === from.row) {
      prefix = `${short} sau`;
    }
  }

  let action: string;
  let targetNum: number;

  if (from.row === to.row) {
    action = 'bình';
    targetNum = toFile;
  } else {
    const isForward = side === 'red' ? to.row < from.row : to.row > from.row;
    action = isForward ? 'tiến' : 'thoái';
    // Straight-moving pieces (chariot, cannon, king, soldier) use step count;
    // diagonal/L-moving pieces (horse, advisor, elephant) use destination file.
    if (
      piece.type === 'horse' ||
      piece.type === 'advisor' ||
      piece.type === 'elephant'
    ) {
      targetNum = toFile;
    } else {
      targetNum = Math.abs(to.row - from.row);
    }
  }

  return `${prefix} ${action} ${targetNum}`;
}

export function normalizeVietnamese(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9.+\-=\s!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PIECE_ALIASES: Array<[RegExp, PieceType]> = [
  [/^(tuong|soai|tg|k)\b/, 'king'],
  [/^(si|sy|s|a)\b/, 'advisor'],
  [/^(tuongj|tinh|voi|tuo|t|e)\b/, 'elephant'],
  [/^(ma|ngua|m|h|n)\b/, 'horse'],
  [/^(xe|xa|x|r)\b/, 'chariot'],
  [/^(phao|p|c)\b/, 'cannon'],
  [/^(tot|binh|chot|b|z)\b/, 'soldier'],
];

function parsePieceToken(token: string): PieceType | null {
  const t = token.trim();
  if (!t) return null;
  if (t === 'tg' || t === 'tuong' || t === 'soai') return 'king';
  if (t === 't' || t === 'tinh' || t === 'voi') return 'elephant';
  if (t === 's' || t === 'si' || t === 'sy') return 'advisor';
  if (t === 'm' || t === 'ma' || t === 'ngua') return 'horse';
  if (t === 'x' || t === 'xe' || t === 'xa') return 'chariot';
  if (t === 'p' || t === 'phao') return 'cannon';
  if (t === 'b' || t === 'tot' || t === 'binh' || t === 'chot') return 'soldier';
  for (const [re, pt] of PIECE_ALIASES) {
    if (re.test(t)) return pt;
  }
  return null;
}

function parseActionToken(token: string): MoveDirection | null {
  const t = token.trim();
  if (t === 'tien' || t === 'tan' || t === 'len' || t === 't' || t === '.' || t === '+') {
    return 'tien';
  }
  if (t === 'thoai' || t === 'lui' || t === 've' || t === 'th' || t === '/') {
    return 'thoai';
  }
  if (t === 'binh' || t === 'ngang' || t === 'b' || t === '-' || t === '=') {
    return 'binh';
  }
  return null;
}

export interface ParsedMoveResult {
  move: Move | null;
  notation?: string;
  error?: string;
  ambiguous?: boolean;
}

function matchesMoveDirectionAndValue(
  move: Move,
  side: Side,
  dir: MoveDirection,
  val: number,
): boolean {
  const { from, to, piece } = move;
  if (dir === 'binh') {
    if (from.row !== to.row) return false;
    return colToFile(to.col, side) === val;
  }
  const isForward = side === 'red' ? to.row < from.row : to.row > from.row;
  if (dir === 'tien' && !isForward) return false;
  if (dir === 'thoai' && (isForward || from.row === to.row)) return false;

  if (
    piece.type === 'horse' ||
    piece.type === 'advisor' ||
    piece.type === 'elephant'
  ) {
    return colToFile(to.col, side) === val;
  }
  return Math.abs(to.row - from.row) === val;
}

/**
 * Parse a Vietnamese chat move command such as:
 * - "x7 bình 3" / "xe 7 binh 3" / "x7-3" / "x7=3"
 * - "p2 bình 5" / "pháo 2 bình 5"
 * - "m8 tiến 7" / "mã 8 tấn 7" / "m8.7"
 * - "x1 thoái 2" / "b7 tiến 1"
 * - Contextual shorthand: "tiến 5", "thoái 1", "bình 4" (uses preferredPieceId or unique legal move)
 */
export function parseVietnameseChatMove(
  state: BoardState,
  rawInput: string,
  preferredPieceId?: string | null,
): ParsedMoveResult {
  const norm = normalizeVietnamese(rawInput);
  if (!norm || norm.startsWith('!')) {
    return { move: null };
  }

  const side = state.turn;
  const legalMoves = generateLegalMoves(state.grid, side);

  // Pattern 1: Full move with piece + file + action + target
  // Examples: "x7 binh 3", "xe 7 binh 3", "p2=5", "m8.7", "x1-2", "phao 2 tan 4"
  const fullWordRe =
    /\b(tuong|soai|tg|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot|x|p|m|b|s|t)\s*([1-9])\s*(tien|tan|len|thoai|lui|ve|binh|ngang|[.+\-=])\s*([1-9])\b/;
  const fullMatch = norm.match(fullWordRe);

  if (fullMatch) {
    const [, pieceRaw, fileRaw, actRaw, valRaw] = fullMatch;
    const file = Number(fileRaw);
    const val = Number(valRaw);
    const dir = parseActionToken(actRaw);

    // Handle ambiguity of "tuong" (can mean king or elephant in Vietnamese without accents)
    const candidateTypes: PieceType[] = [];
    if (pieceRaw === 'tuong') {
      candidateTypes.push('elephant', 'king');
    } else {
      const pt = parsePieceToken(pieceRaw);
      if (pt) candidateTypes.push(pt);
    }

    if (dir && candidateTypes.length > 0) {
      const targetCol = fileToCol(file, side);
      const matches = legalMoves.filter(
        (mv) =>
          candidateTypes.includes(mv.piece.type) &&
          mv.from.col === targetCol &&
          matchesMoveDirectionAndValue(mv, side, dir, val),
      );

      if (matches.length === 1) {
        return {
          move: matches[0],
          notation: formatMoveVietnamese(state.grid, matches[0]),
        };
      }
      if (matches.length > 1) {
        // Prefer front piece if user didn't specify trước/sau
        matches.sort((a, b) =>
          side === 'red' ? a.from.row - b.from.row : b.from.row - a.from.row,
        );
        return {
          move: matches[0],
          notation: formatMoveVietnamese(state.grid, matches[0]),
        };
      }
      return {
        move: null,
        error: `Nước đi "${rawInput.trim()}" không hợp lệ hoặc bị cản/lộ mặt tướng.`,
      };
    }
  }

  // Pattern 2: Front/Back disambiguated move ("x truoc tien 2", "b sau binh 5")
  const posRe =
    /\b(tuong|soai|tg|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot|x|p|m|b|s|t)\s*(truoc|tien|sau|hau)\s*(tien|tan|len|thoai|lui|ve|binh|ngang)\s*([1-9])\b/;
  const posMatch = norm.match(posRe);
  if (posMatch) {
    const [, pieceRaw, whichRaw, actRaw, valRaw] = posMatch;
    const pt = parsePieceToken(pieceRaw);
    const dir = parseActionToken(actRaw);
    const val = Number(valRaw);
    if (pt && dir) {
      const candidates = legalMoves.filter(
        (mv) => mv.piece.type === pt && matchesMoveDirectionAndValue(mv, side, dir, val),
      );
      if (candidates.length > 0) {
        const wantFront = whichRaw === 'truoc' || whichRaw === 'tien';
        candidates.sort((a, b) =>
          side === 'red'
            ? wantFront
              ? a.from.row - b.from.row
              : b.from.row - a.from.row
            : wantFront
              ? b.from.row - a.from.row
              : a.from.row - b.from.row,
        );
        return {
          move: candidates[0],
          notation: formatMoveVietnamese(state.grid, candidates[0]),
        };
      }
    }
  }

  // Pattern 3: Shorthand contextual move directly matching prompt: "tiến 5", "thoái 1", "bình 3"
  const shortRe = /^(tien|tan|len|thoai|lui|ve|binh|ngang)\s*([1-9])$/;
  const shortMatch = norm.match(shortRe);
  if (shortMatch) {
    const [, actRaw, valRaw] = shortMatch;
    const dir = parseActionToken(actRaw);
    const val = Number(valRaw);
    if (dir) {
      const allMatches = legalMoves.filter((mv) =>
        matchesMoveDirectionAndValue(mv, side, dir, val),
      );
      if (allMatches.length === 0) {
        return {
          move: null,
          error: `Không có quân nào đi được "${rawInput.trim()}" ở thế cờ hiện tại.`,
        };
      }
      // 1. Prefer the selected or last-moved piece of the current player
      if (preferredPieceId) {
        const prefMatches = allMatches.filter((mv) => mv.piece.id === preferredPieceId);
        if (prefMatches.length >= 1) {
          return {
            move: prefMatches[0],
            notation: formatMoveVietnamese(state.grid, prefMatches[0]),
          };
        }
      }
      // 2. If unique match across board, play it directly
      if (allMatches.length === 1) {
        return {
          move: allMatches[0],
          notation: formatMoveVietnamese(state.grid, allMatches[0]),
        };
      }
      // 3. Prioritize major attacking pieces (chariot > cannon > horse > soldier) for natural shorthand flow
      const priority: Record<PieceType, number> = {
        chariot: 6,
        cannon: 5,
        horse: 4,
        soldier: 3,
        elephant: 2,
        advisor: 1,
        king: 0,
      };
      allMatches.sort((a, b) => priority[b.piece.type] - priority[a.piece.type]);
      return {
        move: allMatches[0],
        notation: formatMoveVietnamese(state.grid, allMatches[0]),
      };
    }
  }

  return { move: null };
}

export interface ChatCommandIntent {
  type: 'challenge' | 'guest_profile' | 'move_candidate' | 'chat';
  gender?: 'nam' | 'nu';
  age?: number;
}

export function classifyChatMessage(raw: string): ChatCommandIntent {
  const norm = normalizeVietnamese(raw);
  if (
    /^(!choi|!thachdau|!dau|!lendai|xin danh|len dai|choi voi bot|thach dau)/.test(norm)
  ) {
    return { type: 'challenge' };
  }

  const profileMatch = norm.match(/^!(nam|nu)\s*(\d{1,2})\b/);
  if (profileMatch) {
    const gender = profileMatch[1] as 'nam' | 'nu';
    const age = Math.max(12, Math.min(90, Number(profileMatch[2])));
    return { type: 'guest_profile', gender, age };
  }

  if (
    /\b(tien|tan|len|thoai|lui|ve|binh|ngang)\s*[1-9]\b/.test(norm) ||
    /\b[xpmbst]\s*[1-9]\s*[.+\-=]\s*[1-9]\b/.test(norm)
  ) {
    return { type: 'move_candidate' };
  }

  return { type: 'chat' };
}
