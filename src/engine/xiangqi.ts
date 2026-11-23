export type Side = 'red' | 'black';

export type PieceType =
  | 'king'     // Tướng / Soái (帥 / 將)
  | 'advisor'  // Sĩ (仕 / 士)
  | 'elephant' // Tượng / Tịnh (相 / 象)
  | 'horse'    // Mã (傌 / 馬)
  | 'chariot'  // Xe (俥 / 車)
  | 'cannon'   // Pháo (炮 / 砲)
  | 'soldier'; // Tốt / Binh (兵 / 卒)

export interface Piece {
  id: string;
  side: Side;
  type: PieceType;
}

export interface Coord {
  row: number; // 0 (Black back rank) .. 9 (Red back rank)
  col: number; // 0 (Left from Red POV, Black file 1 / Red file 9) .. 8 (Right from Red POV, Red file 1 / Black file 9)
}

export interface Move {
  from: Coord;
  to: Coord;
  piece: Piece;
  captured?: Piece | null;
}

export interface BoardState {
  grid: (Piece | null)[][]; // 10 rows x 9 cols
  turn: Side;
  moveCount: number;
  lastMove: Move | null;
  status: 'playing' | 'red_win' | 'black_win' | 'draw';
  inCheck: Side | null;
}

export const BOARD_ROWS = 10;
export const BOARD_COLS = 9;

export const PIECE_CHAR: Record<Side, Record<PieceType, string>> = {
  red: {
    king: '帥',
    advisor: '仕',
    elephant: '相',
    horse: '傌',
    chariot: '俥',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    king: '將',
    advisor: '士',
    elephant: '象',
    horse: '馬',
    chariot: '車',
    cannon: '砲',
    soldier: '卒',
  },
};

export const PIECE_NAME_VI: Record<Side, Record<PieceType, string>> = {
  red: {
    king: 'Tướng',
    advisor: 'Sĩ',
    elephant: 'Tượng',
    horse: 'Mã',
    chariot: 'Xe',
    cannon: 'Pháo',
    soldier: 'Binh',
  },
  black: {
    king: 'Tướng',
    advisor: 'Sĩ',
    elephant: 'Tượng',
    horse: 'Mã',
    chariot: 'Xe',
    cannon: 'Pháo',
    soldier: 'Tốt',
  },
};

export const PIECE_SHORT_VI: Record<PieceType, string> = {
  king: 'Tg',
  advisor: 'S',
  elephant: 'T',
  horse: 'M',
  chariot: 'X',
  cannon: 'P',
  soldier: 'B',
};

export function oppositeSide(side: Side): Side {
  return side === 'red' ? 'black' : 'red';
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

export function inPalace(row: number, col: number, side: Side): boolean {
  if (col < 3 || col > 5) return false;
  if (side === 'black') return row >= 0 && row <= 2;
  return row >= 7 && row <= 9;
}

export function createEmptyGrid(): (Piece | null)[][] {
  return Array.from({ length: BOARD_ROWS }, () => Array<Piece | null>(BOARD_COLS).fill(null));
}

export function cloneGrid(grid: (Piece | null)[][]): (Piece | null)[][] {
  return grid.map((row) => row.slice());
}

export function createInitialBoard(): BoardState {
  const grid = createEmptyGrid();
  const put = (row: number, col: number, side: Side, type: PieceType, idx: number) => {
    grid[row][col] = { id: `${side}_${type}_${idx}`, side, type };
  };

  // Black pieces (top, rows 0..3)
  put(0, 0, 'black', 'chariot', 1);
  put(0, 1, 'black', 'horse', 1);
  put(0, 2, 'black', 'elephant', 1);
  put(0, 3, 'black', 'advisor', 1);
  put(0, 4, 'black', 'king', 1);
  put(0, 5, 'black', 'advisor', 2);
  put(0, 6, 'black', 'elephant', 2);
  put(0, 7, 'black', 'horse', 2);
  put(0, 8, 'black', 'chariot', 2);
  put(2, 1, 'black', 'cannon', 1);
  put(2, 7, 'black', 'cannon', 2);
  put(3, 0, 'black', 'soldier', 1);
  put(3, 2, 'black', 'soldier', 2);
  put(3, 4, 'black', 'soldier', 3);
  put(3, 6, 'black', 'soldier', 4);
  put(3, 8, 'black', 'soldier', 5);

  // Red pieces (bottom, rows 6..9)
  put(9, 0, 'red', 'chariot', 1);
  put(9, 1, 'red', 'horse', 1);
  put(9, 2, 'red', 'elephant', 1);
  put(9, 3, 'red', 'advisor', 1);
  put(9, 4, 'red', 'king', 1);
  put(9, 5, 'red', 'advisor', 2);
  put(9, 6, 'red', 'elephant', 2);
  put(9, 7, 'red', 'horse', 2);
  put(9, 8, 'red', 'chariot', 2);
  put(7, 1, 'red', 'cannon', 1);
  put(7, 7, 'red', 'cannon', 2);
  put(6, 0, 'red', 'soldier', 1);
  put(6, 2, 'red', 'soldier', 2);
  put(6, 4, 'red', 'soldier', 3);
  put(6, 6, 'red', 'soldier', 4);
  put(6, 8, 'red', 'soldier', 5);

  return {
    grid,
    turn: 'red',
    moveCount: 0,
    lastMove: null,
    status: 'playing',
    inCheck: null,
  };
}

export function findKing(grid: (Piece | null)[][], side: Side): Coord | null {
  const rowStart = side === 'black' ? 0 : 7;
  const rowEnd = side === 'black' ? 2 : 9;
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = 3; c <= 5; c++) {
      const p = grid[r][c];
      if (p && p.side === side && p.type === 'king') {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function areKingsFacing(grid: (Piece | null)[][]): boolean {
  const redKing = findKing(grid, 'red');
  const blackKing = findKing(grid, 'black');
  if (!redKing || !blackKing) return false;
  if (redKing.col !== blackKing.col) return false;
  const col = redKing.col;
  for (let r = blackKing.row + 1; r < redKing.row; r++) {
    if (grid[r][col] !== null) return false;
  }
  return true;
}

export function generatePseudoMovesForPiece(
  grid: (Piece | null)[][],
  row: number,
  col: number,
): Move[] {
  const piece = grid[row][col];
  if (!piece) return [];
  const moves: Move[] = [];
  const side = piece.side;

  const tryPush = (tr: number, tc: number) => {
    if (!inBounds(tr, tc)) return;
    const target = grid[tr][tc];
    if (target && target.side === side) return;
    moves.push({
      from: { row, col },
      to: { row: tr, col: tc },
      piece,
      captured: target,
    });
  };

  switch (piece.type) {
    case 'king': {
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (inPalace(nr, nc, side)) tryPush(nr, nc);
      }
      // Flying general direct capture (rare, handles check checks)
      const oppKing = findKing(grid, oppositeSide(side));
      if (oppKing && oppKing.col === col) {
        const step = oppKing.row > row ? 1 : -1;
        let blocked = false;
        for (let r = row + step; r !== oppKing.row; r += step) {
          if (grid[r][col] !== null) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          tryPush(oppKing.row, oppKing.col);
        }
      }
      break;
    }

    case 'advisor': {
      const dirs = [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];
      for (const [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (inPalace(nr, nc, side)) tryPush(nr, nc);
      }
      break;
    }

    case 'elephant': {
      const dirs = [
        [-2, -2, -1, -1],
        [-2, 2, -1, 1],
        [2, -2, 1, -1],
        [2, 2, 1, 1],
      ];
      for (const [dr, dc, er, ec] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (!inBounds(nr, nc)) continue;
        // Cannot cross river
        if (side === 'red' && nr < 5) continue;
        if (side === 'black' && nr > 4) continue;
        // Elephant eye check
        if (grid[row + er][col + ec] !== null) continue;
        tryPush(nr, nc);
      }
      break;
    }

    case 'horse': {
      const steps = [
        [-2, -1, -1, 0],
        [-2, 1, -1, 0],
        [2, -1, 1, 0],
        [2, 1, 1, 0],
        [-1, -2, 0, -1],
        [1, -2, 0, -1],
        [-1, 2, 0, 1],
        [1, 2, 0, 1],
      ];
      for (const [dr, dc, lr, lc] of steps) {
        const nr = row + dr;
        const nc = col + dc;
        if (!inBounds(nr, nc)) continue;
        // Horse leg check (cản chân mã)
        if (grid[row + lr][col + lc] !== null) continue;
        tryPush(nr, nc);
      }
      break;
    }

    case 'chariot': {
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        let nr = row + dr;
        let nc = col + dc;
        while (inBounds(nr, nc)) {
          const target = grid[nr][nc];
          if (target === null) {
            moves.push({ from: { row, col }, to: { row: nr, col: nc }, piece, captured: null });
          } else {
            if (target.side !== side) {
              moves.push({ from: { row, col }, to: { row: nr, col: nc }, piece, captured: target });
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }

    case 'cannon': {
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        let nr = row + dr;
        let nc = col + dc;
        let jumped = false;
        while (inBounds(nr, nc)) {
          const target = grid[nr][nc];
          if (!jumped) {
            if (target === null) {
              moves.push({ from: { row, col }, to: { row: nr, col: nc }, piece, captured: null });
            } else {
              jumped = true; // Found screen (ngòi pháo)
            }
          } else {
            if (target !== null) {
              if (target.side !== side) {
                moves.push({
                  from: { row, col },
                  to: { row: nr, col: nc },
                  piece,
                  captured: target,
                });
              }
              break;
            }
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }

    case 'soldier': {
      const forward = side === 'red' ? -1 : 1;
      tryPush(row + forward, col);
      const crossedRiver = side === 'red' ? row <= 4 : row >= 5;
      if (crossedRiver) {
        tryPush(row, col - 1);
        tryPush(row, col + 1);
      }
      break;
    }
  }

  return moves;
}

export function isSquareAttackedBy(
  grid: (Piece | null)[][],
  targetRow: number,
  targetCol: number,
  attackerSide: Side,
): boolean {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = grid[r][c];
      if (!p || p.side !== attackerSide) continue;
      const pseudo = generatePseudoMovesForPiece(grid, r, c);
      for (let i = 0; i < pseudo.length; i++) {
        if (pseudo[i].to.row === targetRow && pseudo[i].to.col === targetCol) {
          return true;
        }
      }
    }
  }
  return false;
}

export function isInCheck(grid: (Piece | null)[][], side: Side): boolean {
  const king = findKing(grid, side);
  if (!king) return true;
  if (areKingsFacing(grid)) return true;
  return isSquareAttackedBy(grid, king.row, king.col, oppositeSide(side));
}

export function applyMoveOnGrid(grid: (Piece | null)[][], move: Move): (Piece | null)[][] {
  const next = cloneGrid(grid);
  const moving = next[move.from.row][move.from.col];
  next[move.from.row][move.from.col] = null;
  next[move.to.row][move.to.col] = moving;
  return next;
}

export function generateLegalMoves(grid: (Piece | null)[][], side: Side): Move[] {
  const legal: Move[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const p = grid[r][c];
      if (!p || p.side !== side) continue;
      const pseudo = generatePseudoMovesForPiece(grid, r, c);
      for (const mv of pseudo) {
        const nextGrid = applyMoveOnGrid(grid, mv);
        if (!areKingsFacing(nextGrid) && !isInCheck(nextGrid, side)) {
          legal.push(mv);
        }
      }
    }
  }
  return legal;
}

export function generateLegalMovesForSquare(
  grid: (Piece | null)[][],
  row: number,
  col: number,
): Move[] {
  const p = grid[row][col];
  if (!p) return [];
  const pseudo = generatePseudoMovesForPiece(grid, row, col);
  const legal: Move[] = [];
  for (const mv of pseudo) {
    const nextGrid = applyMoveOnGrid(grid, mv);
    if (!areKingsFacing(nextGrid) && !isInCheck(nextGrid, p.side)) {
      legal.push(mv);
    }
  }
  return legal;
}

export function makeMove(state: BoardState, move: Move): BoardState {
  const nextGrid = applyMoveOnGrid(state.grid, move);
  const nextTurn = oppositeSide(state.turn);
  const nextInCheck = isInCheck(nextGrid, nextTurn) ? nextTurn : null;
  const nextLegal = generateLegalMoves(nextGrid, nextTurn);

  let status: BoardState['status'] = 'playing';
  if (nextLegal.length === 0) {
    // In Xiangqi, both checkmate and stalemate are a win for the side who just moved!
    status = state.turn === 'red' ? 'red_win' : 'black_win';
  } else if (state.moveCount + 1 >= 180) {
    status = 'draw';
  }

  return {
    grid: nextGrid,
    turn: nextTurn,
    moveCount: state.moveCount + 1,
    lastMove: move,
    status,
    inCheck: nextInCheck,
  };
}

export function boardToCompactAscii(grid: (Piece | null)[][]): string {
  const map: Record<PieceType, string> = {
    king: 'K',
    advisor: 'A',
    elephant: 'E',
    horse: 'H',
    chariot: 'R',
    cannon: 'C',
    soldier: 'P',
  };
  return grid
    .map((row, rIdx) => {
      const cells = row
        .map((p) => {
          if (!p) return '.';
          const ch = map[p.type];
          return p.side === 'red' ? ch : ch.toLowerCase();
        })
        .join('');
      return `${rIdx}:${cells}`;
    })
    .join('\n');
}
