import {
  BoardState,
  Move,
  PIECE_NAME_VI,
  PIECE_SHORT_VI,
  PieceType,
  Side,
  generateLegalMoves,
  isInCheck,
  applyMoveOnGrid,
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
    .replace(/[^a-z0-9.+\-=/\s!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert spoken Vietnamese number words into digits when used in chess commands.
 * Example: "pháo hai bình năm" -> "phao 2 binh 5", "mã tám tiến bảy" -> "ma 8 tien 7".
 * Carefully avoids converting "sau" (rear/back) when it means piece position ("xe sau tien 2").
 */
export function normalizeSpokenMoveNumbers(raw: string): string {
  let s = normalizeVietnamese(raw);
  // Protect "sau" as position disambiguator when followed by an action verb
  s = s.replace(
    /\b(sau)\s+(tien|tan|len|thoai|lui|ve|binh|ngang|vo|vao|sang|qua|ra|rut|keo)\b/g,
    '__REAR__ $2',
  );

  const numMap: Array<[RegExp, string]> = [
    [/\bmot\b/g, '1'],
    [/\bhai\b/g, '2'],
    [/\bba\b/g, '3'],
    [/\b(bon|tu)\b/g, '4'],
    [/\b(nam|lam)\b/g, '5'],
    [/\bsau\b/g, '6'],
    [/\bbay\b/g, '7'],
    [/\btam\b/g, '8'],
    [/\bchin\b/g, '9'],
  ];

  // Only convert spoken numbers when a chess piece or action word is present in the phrase
  const hasChessCue =
    /\b(tuong|soai|tg|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot|tien|tan|len|thoai|lui|ve|ngang|vo|vao|sang|qua|ra|chieu|an|dap|bat|day|rut|keo)\b/.test(
      s,
    );

  if (hasChessCue) {
    for (const [re, digit] of numMap) {
      s = s.replace(re, digit);
    }
  }

  return s.replace(/__REAR__/g, 'sau').replace(/\s+/g, ' ').trim();
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

function getCandidatePieceTypes(rawToken: string): PieceType[] {
  const t = rawToken.trim();
  if (t === 'tuong') {
    // Without accents, "tuong" can mean either Tượng (elephant) or Tướng (king)
    return ['elephant', 'king'];
  }
  const pt = parsePieceToken(t);
  return pt ? [pt] : [];
}

function parseActionToken(token: string): MoveDirection | null {
  const t = token.trim();
  if (
    t === 'tien' ||
    t === 'tan' ||
    t === 'len' ||
    t === 'day' ||
    t === 'phong' ||
    t === 't' ||
    t === '.' ||
    t === '+'
  ) {
    return 'tien';
  }
  if (
    t === 'thoai' ||
    t === 'lui' ||
    t === 've' ||
    t === 'rut' ||
    t === 'keo' ||
    t === 'giat' ||
    t === 'th' ||
    t === '/'
  ) {
    return 'thoai';
  }
  if (
    t === 'binh' ||
    t === 'ngang' ||
    t === 'vo' ||
    t === 'vao' ||
    t === 'sang' ||
    t === 'qua' ||
    t === 'ra' ||
    t === 'b' ||
    t === '-' ||
    t === '='
  ) {
    return 'binh';
  }
  return null;
}

export interface ParsedMoveResult {
  move: Move | null;
  notation?: string;
  error?: string;
  ambiguous?: boolean;
  /** Multiple matching legal moves when the command is ambiguous (e.g., "xe tiến 2") */
  candidates?: Move[];
  /** True when the message sounds like a natural-language move that can benefit from AI NLU fallback */
  needsAiFallback?: boolean;
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
 * Parse a Vietnamese chat or voice move command such as:
 * - Standard: "x7 bình 3", "xe 7 binh 3", "p2=5", "m8.7", "x1-2", "phao 2 tan 4"
 * - Spoken Vietnamese: "pháo hai bình năm", "mã tám tiến bảy", "tốt bảy tiến một"
 * - Ultra-compact live shorthand: "p25", "m87", "b71", "x12", "p2b5", "m8t7", "x1th2"
 * - Natural phrases inside sentences: "anh đi pháo 2 vô 5 nha", "ra xe 9 sang 8", "kéo xe 1 về 2"
 * - Direct capture / opening phrases: "pháo đầu", "xe ăn pháo", "pháo đập mã", "chiếu tướng"
 * - Contextual shorthand: "tiến 5", "thoái 1", "bình 4"
 */
export function parseVietnameseChatMove(
  state: BoardState,
  rawInput: string,
  preferredPieceId?: string | null,
): ParsedMoveResult {
  const norm = normalizeSpokenMoveNumbers(rawInput);
  if (!norm || norm.startsWith('!')) {
    return { move: null };
  }

  const side = state.turn;
  const legalMoves = generateLegalMoves(state.grid, side);

  // Pattern 1: Full move with piece + file + action + target
  // Supports natural verbs too: "pháo 2 vô 5", "xe 9 sang 8", "mã 8 lên 7", "xe 1 về 2", "p2b5", "m8t7", "x1th2"
  const fullWordRe =
    /\b(tuong|soai|tg|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot|x|p|m|b|s|t)\s*([1-9])\s*(tien|tan|len|day|phong|thoai|lui|ve|rut|keo|giat|th|binh|ngang|vo|vao|sang|qua|ra|t|b|[.+\-=/])\s*([1-9])\b/;
  const fullMatch = norm.match(fullWordRe);

  if (fullMatch) {
    const [, pieceRaw, fileRaw, actRaw, valRaw] = fullMatch;
    const file = Number(fileRaw);
    const val = Number(valRaw);
    const dir = parseActionToken(actRaw);
    const candidateTypes = getCandidatePieceTypes(pieceRaw);

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
        return {
          move: null,
          ambiguous: true,
          candidates: matches.slice(0, 3),
          error: `Nước đi "${rawInput.trim()}" có ${matches.length} cách đi (${matches
            .slice(0, 2)
            .map((m) => formatMoveVietnamese(state.grid, m))
            .join(' hoặc ')}), nói rõ trước/sau giúp thiếp nhé!`,
        };
      }
      return {
        move: null,
        error: `Nước đi "${rawInput.trim()}" không hợp lệ hoặc đang bị cản/lộ mặt tướng.`,
      };
    }
  }

  // Pattern 1B: Ultra-compact 2-digit shorthand used by TikTok live players!
  // Examples: "p25" (P2 bình 5), "m87" (M8 tiến 7), "b71" (B7 tiến 1), "x98" (X9 bình 8), "s45", "t35"
  const compactRe = /\b(tg|x|p|m|b|s|t)\s*([1-9])([1-9])\b/;
  const compactMatch = norm.match(compactRe);
  if (compactMatch) {
    const [, pieceRaw, fileRaw, valRaw] = compactMatch;
    const file = Number(fileRaw);
    const val = Number(valRaw);
    const candidateTypes = getCandidatePieceTypes(pieceRaw);
    const targetCol = fileToCol(file, side);

    if (candidateTypes.length > 0) {
      const pieceMoves = legalMoves.filter(
        (mv) => candidateTypes.includes(mv.piece.type) && mv.from.col === targetCol,
      );

      // Prefer natural direction by piece type:
      // - horse/advisor/elephant: forward (tien) first, then retreat (thoai)
      // - cannon/chariot: binh if moving to file val, or tien val steps
      // - soldier: tien val first, then binh val
      const orderedDirs: MoveDirection[] =
        candidateTypes[0] === 'cannon'
          ? ['binh', 'tien', 'thoai']
          : candidateTypes[0] === 'chariot'
            ? ['binh', 'tien', 'thoai']
            : ['tien', 'binh', 'thoai'];

      const matchedAcrossDirs: Move[] = [];
      for (const dir of orderedDirs) {
        const sub = pieceMoves.filter((mv) =>
          matchesMoveDirectionAndValue(mv, side, dir, val),
        );
        for (const m of sub) {
          if (!matchedAcrossDirs.includes(m)) matchedAcrossDirs.push(m);
        }
      }

      if (matchedAcrossDirs.length === 1) {
        return {
          move: matchedAcrossDirs[0],
          notation: formatMoveVietnamese(state.grid, matchedAcrossDirs[0]),
        };
      }
      if (matchedAcrossDirs.length > 1) {
        // For Cannon/Chariot opening like "p25" (P2 bình 5 vs P2 tiến 5), check if binh exists uniquely
        const binhMatches = matchedAcrossDirs.filter((m) => m.from.row === m.to.row);
        if (binhMatches.length === 1 && (pieceRaw === 'p' || pieceRaw === 'x') && val !== 1) {
          return {
            move: binhMatches[0],
            notation: formatMoveVietnamese(state.grid, binhMatches[0]),
          };
        }
        const tienMatches = matchedAcrossDirs.filter((m) =>
          side === 'red' ? m.to.row < m.from.row : m.to.row > m.from.row,
        );
        if (tienMatches.length === 1 && (pieceRaw === 'm' || pieceRaw === 'b' || pieceRaw === 's' || pieceRaw === 't')) {
          return {
            move: tienMatches[0],
            notation: formatMoveVietnamese(state.grid, tienMatches[0]),
          };
        }
        return {
          move: null,
          ambiguous: true,
          candidates: matchedAcrossDirs.slice(0, 3),
          error: `Viết tắt "${compactMatch[0]}" có ${matchedAcrossDirs.length} cách đi (${matchedAcrossDirs
            .slice(0, 2)
            .map((m) => formatMoveVietnamese(state.grid, m))
            .join(' hoặc ')}), nói rõ giúp thiếp nhé!`,
        };
      }
      return {
        move: null,
        error: `Không thể đi "${rawInput.trim()}" ở thế cờ hiện tại.`,
      };
    }
  }

  // Pattern 2: Front/Back disambiguated move ("x truoc tien 2", "b sau binh 5")
  const posRe =
    /\b(tuong|soai|tg|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot|x|p|m|b|s|t)\s*(truoc|tien|sau|hau)\s*(tien|tan|len|thoai|lui|ve|rut|binh|ngang|vo|vao|sang|qua|ra)\s*([1-9])\b/;
  const posMatch = norm.match(posRe);
  if (posMatch) {
    const [, pieceRaw, whichRaw, actRaw, valRaw] = posMatch;
    const candidateTypes = getCandidatePieceTypes(pieceRaw);
    const dir = parseActionToken(actRaw);
    const val = Number(valRaw);
    if (candidateTypes.length > 0 && dir) {
      const candidates = legalMoves.filter(
        (mv) =>
          candidateTypes.includes(mv.piece.type) &&
          matchesMoveDirectionAndValue(mv, side, dir, val),
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

  // Pattern 2B: Natural action-first phrasing ("lên mã 8", "ra xe 9", "đẩy tốt 7", "vào pháo 2", "pháo đầu")
  if (/\bphao dau\b/.test(norm)) {
    const centralFileCol = fileToCol(5, side);
    const cannonCentral = legalMoves.filter(
      (mv) =>
        mv.piece.type === 'cannon' &&
        mv.from.row === mv.to.row &&
        mv.to.col === centralFileCol,
    );
    if (cannonCentral.length >= 1) {
      // Classic Pháo Đầu prefers P2 bình 5 (right-side file 2) if available
      const p2 = cannonCentral.find((m) => colToFile(m.from.col, side) === 2);
      const chosen = p2 ?? cannonCentral[0];
      return {
        move: chosen,
        notation: formatMoveVietnamese(state.grid, chosen),
      };
    }
  }

  // Natural verb + piece + file ("đẩy tốt 7", "lên mã 8", "nhảy mã 2", "phi tượng 3", "lên sĩ 4")
  const verbPieceFileRe =
    /\b(len|nhay|phi|day|tien|ra|chay)\s+(tuong|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot)\s*([1-9])\b/;
  const vpfMatch = norm.match(verbPieceFileRe);
  if (vpfMatch) {
    const [, verbRaw, pieceRaw, fileRaw] = vpfMatch;
    const file = Number(fileRaw);
    const candidateTypes = getCandidatePieceTypes(pieceRaw);
    const fromCol = fileToCol(file, side);
    const forwardMatches = legalMoves.filter((mv) => {
      if (!candidateTypes.includes(mv.piece.type) || mv.from.col !== fromCol) return false;
      const isForward = side === 'red' ? mv.to.row < mv.from.row : mv.to.row > mv.from.row;
      if (verbRaw === 'ra') return mv.from.row === mv.to.row || isForward;
      return isForward;
    });
    if (forwardMatches.length === 1) {
      return {
        move: forwardMatches[0],
        notation: formatMoveVietnamese(state.grid, forwardMatches[0]),
      };
    }
    // For "lên mã 8" -> prefer central development (to file 7 or 3, i.e., Chính Mã) over edge (file 9/1)
    if (forwardMatches.length > 1 && candidateTypes.includes('horse')) {
      const chinhMa = forwardMatches.find((m) => {
        const tf = colToFile(m.to.col, side);
        return tf === 7 || tf === 3;
      });
      if (chinhMa) {
        return {
          move: chinhMa,
          notation: formatMoveVietnamese(state.grid, chinhMa),
        };
      }
    }
    if (forwardMatches.length > 1 && candidateTypes.includes('elephant')) {
      const centralEle = forwardMatches.find((m) => colToFile(m.to.col, side) === 5);
      if (centralEle) {
        return {
          move: centralEle,
          notation: formatMoveVietnamese(state.grid, centralEle),
        };
      }
    }
    if (forwardMatches.length > 1) {
      return {
        move: null,
        ambiguous: true,
        candidates: forwardMatches.slice(0, 3),
        error: `Quân ở lộ ${file} đi được nhiều ô (${forwardMatches
          .slice(0, 2)
          .map((m) => formatMoveVietnamese(state.grid, m))
          .join(' hay ')}), nói rõ số bước nhé!`,
      };
    }
  }

  // Pattern 2C: Direct capture command ("xe ăn pháo", "pháo đập mã", "mã ăn tốt", "ăn xe")
  const capturePairRe =
    /\b(tuong|soai|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot)\s*(?:([1-9])\s*)?(an|dap|chem|bat|xoi|hit)\s+(?:con\s+)?(tuong|soai|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot)\b/;
  const capMatch = norm.match(capturePairRe);
  if (capMatch) {
    const [, attRaw, attFileRaw, , vicRaw] = capMatch;
    const attTypes = getCandidatePieceTypes(attRaw);
    const vicTypes = getCandidatePieceTypes(vicRaw);
    const attCol = attFileRaw ? fileToCol(Number(attFileRaw), side) : null;

    const capMatches = legalMoves.filter(
      (mv) =>
        mv.captured &&
        attTypes.includes(mv.piece.type) &&
        vicTypes.includes(mv.captured.type) &&
        (attCol === null || mv.from.col === attCol),
    );
    if (capMatches.length === 1) {
      return {
        move: capMatches[0],
        notation: formatMoveVietnamese(state.grid, capMatches[0]),
      };
    }
    if (capMatches.length > 1) {
      return {
        move: null,
        ambiguous: true,
        candidates: capMatches.slice(0, 3),
        error: `Có ${capMatches.length} cách ăn quân (${capMatches
          .slice(0, 2)
          .map((m) => formatMoveVietnamese(state.grid, m))
          .join(' hoặc ')}), chọn rõ lộ nhé!`,
      };
    }
    return {
      move: null,
      error: `Chưa có nước ăn hợp lệ "${rawInput.trim()}" ở thế cờ hiện tại.`,
    };
  }

  // Short capture ("ăn xe", "ăn pháo", "ăn mã")
  const shortCapRe = /^(an|dap|chem|xoi)\s+(?:con\s+)?(tuong|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot)$/;
  const shortCapMatch = norm.match(shortCapRe);
  if (shortCapMatch) {
    const vicTypes = getCandidatePieceTypes(shortCapMatch[2]);
    const capMatches = legalMoves.filter(
      (mv) => mv.captured && vicTypes.includes(mv.captured.type),
    );
    if (capMatches.length === 1) {
      return {
        move: capMatches[0],
        notation: formatMoveVietnamese(state.grid, capMatches[0]),
      };
    }
    if (capMatches.length > 1) {
      return {
        move: null,
        ambiguous: true,
        candidates: capMatches.slice(0, 3),
        error: `Có ${capMatches.length} quân ăn được (${capMatches
          .slice(0, 2)
          .map((m) => formatMoveVietnamese(state.grid, m))
          .join(' hay ')}), nói rõ quân nào nhé!`,
      };
    }
  }

  // Direct "chiếu tướng" if there is a unique checking move!
  if (/^(chieu|chieu tuong)$/.test(norm)) {
    const opp: Side = side === 'red' ? 'black' : 'red';
    const checkMoves = legalMoves.filter((mv) => {
      const next = applyMoveOnGrid(state.grid, mv);
      return isInCheck(next, opp);
    });
    if (checkMoves.length === 1) {
      return {
        move: checkMoves[0],
        notation: formatMoveVietnamese(state.grid, checkMoves[0]),
      };
    }
    if (checkMoves.length > 1) {
      return {
        move: null,
        ambiguous: true,
        candidates: checkMoves.slice(0, 3),
        error: `Có tới ${checkMoves.length} đòn chiếu (${checkMoves
          .slice(0, 2)
          .map((m) => formatMoveVietnamese(state.grid, m))
          .join(' hoặc ')}), chọn đòn nào chàng ơi?`,
      };
    }
  }

  // Pattern 2D: Piece + Action + Target without file ("xe tiến 2", "mã lên 7", "pháo bình 5")
  const pieceActRe =
    /\b(tuong|soai|tinh|voi|si|sy|ma|ngua|xe|xa|phao|tot|binh|chot)\s+(tien|tan|len|day|thoai|lui|ve|rut|binh|ngang|vo|vao|sang|qua|ra)\s*([1-9])\b/;
  const paMatch = norm.match(pieceActRe);
  if (paMatch) {
    const [, pieceRaw, actRaw, valRaw] = paMatch;
    const candidateTypes = getCandidatePieceTypes(pieceRaw);
    const dir = parseActionToken(actRaw);
    const val = Number(valRaw);
    if (candidateTypes.length > 0 && dir) {
      const matches = legalMoves.filter(
        (mv) =>
          candidateTypes.includes(mv.piece.type) &&
          matchesMoveDirectionAndValue(mv, side, dir, val),
      );
      if (matches.length === 1) {
        return {
          move: matches[0],
          notation: formatMoveVietnamese(state.grid, matches[0]),
        };
      }
      if (matches.length > 1) {
        if (preferredPieceId) {
          const pref = matches.filter((m) => m.piece.id === preferredPieceId);
          if (pref.length === 1) {
            return {
              move: pref[0],
              notation: formatMoveVietnamese(state.grid, pref[0]),
            };
          }
        }
        return {
          move: null,
          ambiguous: true,
          candidates: matches.slice(0, 3),
          error: `Có ${matches.length} quân ${PIECE_NAME_VI[side][matches[0].piece.type]} đều đi được (${matches
            .slice(0, 2)
            .map((m) => formatMoveVietnamese(state.grid, m))
            .join(' hoặc ')}), nói rõ cột giúp thiếp nhé!`,
        };
      }
    }
  }

  // Pattern 3: Shorthand contextual move directly matching prompt: "tiến 5", "thoái 1", "bình 3"
  const shortRe = /^(tien|tan|len|thoai|lui|ve|binh|ngang|vo|vao|sang|qua)\s*([1-9])$/;
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

  // Detect natural-language move intent that warrants server-side Gemini NLU fallback
  const hasNaturalPiece =
    /\b(xe|xa|phao|ma|ngua|tot|chot|tuong|voi|tinh|si|soai)\b/.test(norm);
  const hasNaturalMotion =
    /\b(di|day|len|xuong|qua|sang|ve|lui|rut|keo|an|dap|chem|chieu|chay|nhay|phi|giu|chan|mo|trai|phai|giua|bien|goc|song)\b/.test(
      norm,
    );
  if (hasNaturalPiece && hasNaturalMotion && norm.length <= 95) {
    return { move: null, needsAiFallback: true };
  }

  return { move: null };
}

export interface ChatCommandIntent {
  type:
    | 'challenge'
    | 'guest_profile'
    | 'ready_check'
    | 'resign'
    | 'draw_offer'
    | 'undo_request'
    | 'hint_request'
    | 'move_candidate'
    | 'chat';
  gender?: 'nam' | 'nu';
  age?: number;
}

export function classifyChatMessage(raw: string): ChatCommandIntent {
  const norm = normalizeSpokenMoveNumbers(raw);
  if (
    /^(!choi|!thachdau|!dau|!lendai|xin danh|len dai|choi voi bot|thach dau|dang ky choi)/.test(
      norm,
    )
  ) {
    return { type: 'challenge' };
  }

  const profileMatch = norm.match(/^!(nam|nu)\s*(\d{1,2})\b/);
  if (profileMatch) {
    const gender = profileMatch[1] as 'nam' | 'nu';
    const age = Math.max(12, Math.min(90, Number(profileMatch[2])));
    return { type: 'guest_profile', gender, age };
  }

  if (/^(!xinthua|!thua|xin thua|nhan thua|chiu thua|dau hang)\b/.test(norm)) {
    return { type: 'resign' };
  }

  if (/^(!hoaco|!hoa|xin hoa|cau hoa|danh hoa)\b/.test(norm)) {
    return { type: 'draw_offer' };
  }

  if (/^(!dilai|!hoanuoc|xin di lai|cho di lai|di lai di)\b/.test(norm)) {
    return { type: 'undo_request' };
  }

  if (/^(!goiy|!hint|xin goi y|goi y giup|mach nuoc)\b/.test(norm)) {
    return { type: 'hint_request' };
  }

  if (/^(!sansang|san sang|co mat|ok em|ok thi?ep|bat dau|len luon|chot keo)$/.test(norm)) {
    return { type: 'ready_check' };
  }

  if (
    /\b(tien|tan|len|thoai|lui|ve|binh|ngang|vo|vao|sang|qua|ra)\s*[1-9]\b/.test(norm) ||
    /\b(tg|[xpmbst])\s*[1-9]\s*(?:[.+\-=/tb]|th)\s*[1-9]\b/.test(norm) ||
    /\b(tg|[xpmbst])[1-9]{2}\b/.test(norm) ||
    /\bphao dau\b/.test(norm) ||
    /\b(xe|phao|ma|tot|chot|tuong|si)\s*(an|dap|chem|bat|xoi)\s+(xe|phao|ma|tot|chot|tuong|si)\b/.test(
      norm,
    ) ||
    /^(an|dap|chem)\s+(xe|phao|ma|tot|chot|tuong|si)$/.test(norm) ||
    /^(chieu|chieu tuong)$/.test(norm)
  ) {
    return { type: 'move_candidate' };
  }

  return { type: 'chat' };
}
