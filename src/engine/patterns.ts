import {
  Coord,
  Move,
  Piece,
  PieceType,
  Side,
  findKing,
  generatePseudoMovesForPiece,
  isSquareAttackedBy,
  isInCheck,
  oppositeSide,
} from './xiangqi';

export type KillPatternId =
  | 'dai_dao_hoach_tam'
  | 'ma_hau_phao'
  | 'trong_phao'
  | 'be_cung'
  | 'bach_kiem_tuong'
  | 'bat_hoang_ma'
  | 'thiet_mon_thuyen'
  | 'thien_dia_phao'
  | 'hai_de_lao_nguyet'
  | 'giap_xa_phao'
  | 'song_xa_thac'
  | 'ngo_tao_ma'
  | 'qua_giac_ma'
  | 'dieu_ngu_ma'
  | 'phao_nan_dan_sa'
  | 'tam_tu_quy_bien'
  | 'khong_dau_phao';

export interface KillPatternHit {
  id: KillPatternId;
  nameVi: string;
  nameZh: string;
  /** The move gives check. Never implies mate has been proven. */
  forcing: boolean;
  priority: number;
}

type Grid = (Piece | null)[][];

interface Frame {
  attacker: Side;
  defender: Side;
  back: number;
  second: number;
  third: number;
  kingHome: Coord;
  palaceCenter: Coord;
}

const HEAVY_TYPES: PieceType[] = ['chariot', 'cannon', 'horse'];

const PATTERN_META: Record<KillPatternId, { nameVi: string; nameZh: string; priority: number }> = {
  dai_dao_hoach_tam: { nameVi: 'Đại Đao Hoạch Tâm', nameZh: '大胆穿心', priority: 96 },
  ma_hau_phao: { nameVi: 'Mã Hậu Pháo', nameZh: '马后炮', priority: 94 },
  trong_phao: { nameVi: 'Trùng Pháo', nameZh: '重炮', priority: 92 },
  be_cung: { nameVi: 'Bế Cung', nameZh: '闷宫', priority: 90 },
  bach_kiem_tuong: { nameVi: 'Bạch Kiểm Tướng', nameZh: '白脸将', priority: 88 },
  bat_hoang_ma: { nameVi: 'Bát Hoàng Mã', nameZh: '拔簧马', priority: 86 },
  thiet_mon_thuyen: { nameVi: 'Thiết Môn Thuyên', nameZh: '铁门栓', priority: 84 },
  thien_dia_phao: { nameVi: 'Thiên Địa Pháo', nameZh: '天地炮', priority: 82 },
  hai_de_lao_nguyet: { nameVi: 'Hải Để Lao Nguyệt', nameZh: '海底捞月', priority: 80 },
  giap_xa_phao: { nameVi: 'Giáp Xa Pháo', nameZh: '夹车炮', priority: 78 },
  song_xa_thac: { nameVi: 'Song Xa Thác', nameZh: '双车错', priority: 76 },
  ngo_tao_ma: { nameVi: 'Ngọa Tào Mã', nameZh: '卧槽马', priority: 74 },
  qua_giac_ma: { nameVi: 'Quải Giác Mã', nameZh: '挂角马', priority: 72 },
  dieu_ngu_ma: { nameVi: 'Điếu Ngư Mã', nameZh: '钓鱼马', priority: 70 },
  phao_nan_dan_sa: { nameVi: 'Pháo Niễn Đan Sa', nameZh: '炮碾丹砂', priority: 68 },
  tam_tu_quy_bien: { nameVi: 'Tam Tử Quy Biên', nameZh: '三子归边', priority: 60 },
  khong_dau_phao: { nameVi: 'Không Đầu Pháo', nameZh: '空头炮', priority: 52 },
};

/** Display name for copy that must name the tactic without duplicating the table. */
export function patternNameVi(id: KillPatternId): string {
  return PATTERN_META[id].nameVi;
}

function frameOf(attacker: Side): Frame {
  const defender = oppositeSide(attacker);
  const back = attacker === 'black' ? 9 : 0;
  const second = attacker === 'black' ? 8 : 1;
  const third = attacker === 'black' ? 7 : 2;
  return {
    attacker,
    defender,
    back,
    second,
    third,
    kingHome: { row: back, col: 4 },
    palaceCenter: { row: second, col: 4 },
  };
}

function isSameSquare(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

function isAdjacent(a: Coord, b: Coord): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function betweenCount(a: Coord, b: Coord, grid: Grid): number | null {
  if (a.row === b.row) {
    const lo = Math.min(a.col, b.col);
    const hi = Math.max(a.col, b.col);
    let n = 0;
    for (let c = lo + 1; c < hi; c++) if (grid[a.row][c]) n++;
    return n;
  }
  if (a.col === b.col) {
    const lo = Math.min(a.row, b.row);
    const hi = Math.max(a.row, b.row);
    let n = 0;
    for (let r = lo + 1; r < hi; r++) if (grid[r][a.col]) n++;
    return n;
  }
  return null;
}

function screenBetween(from: Coord, to: Coord, grid: Grid): { piece: Piece; at: Coord } | null {
  const gap = betweenCount(from, to, grid);
  if (gap === null || gap !== 1) return null;
  if (from.row === to.row) {
    const lo = Math.min(from.col, to.col);
    const hi = Math.max(from.col, to.col);
    for (let c = lo + 1; c < hi; c++) {
      const p = grid[from.row][c];
      if (p) return { piece: p, at: { row: from.row, col: c } };
    }
    return null;
  }
  const lo = Math.min(from.row, to.row);
  const hi = Math.max(from.row, to.row);
  for (let r = lo + 1; r < hi; r++) {
    const p = grid[r][from.col];
    if (p) return { piece: p, at: { row: r, col: from.col } };
  }
  return null;
}

function forEachPiece(grid: Grid, side: Side, fn: (p: Piece, at: Coord) => boolean): boolean {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = grid[r][c];
      if (!p || p.side !== side) continue;
      if (fn(p, { row: r, col: c })) return true;
    }
  }
  return false;
}

function countWhere(grid: Grid, side: Side, test: (p: Piece, at: Coord) => boolean): number {
  let n = 0;
  forEachPiece(grid, side, (p, at) => {
    if (test(p, at)) n++;
    return false;
  });
  return n;
}

function attacksSquare(grid: Grid, at: Coord, target: Coord): boolean {
  const moves = generatePseudoMovesForPiece(grid, at.row, at.col);
  for (let i = 0; i < moves.length; i++) {
    if (moves[i].to.row === target.row && moves[i].to.col === target.col) return true;
  }
  return false;
}

function checkersOf(grid: Grid, attacker: Side, king: Coord): Coord[] {
  const found: Coord[] = [];
  forEachPiece(grid, attacker, (p, at) => {
    if (p.type !== 'king' && attacksSquare(grid, at, king)) found.push(at);
    return false;
  });
  return found;
}

/** Orthogonal in-palace squares the defender king could step to. */
function palaceSteps(king: Coord): Coord[] {
  const lowPalace = king.row <= 2;
  const out: Coord[] = [];
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of deltas) {
    const r = king.row + dr;
    const c = king.col + dc;
    if (c < 3 || c > 5) continue;
    if (lowPalace ? r < 0 || r > 2 : r < 7 || r > 9) continue;
    out.push({ row: r, col: c });
  }
  return out;
}

function horseLeg(from: Coord, to: Coord): Coord {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  return Math.abs(dr) === 2
    ? { row: from.row + dr / 2, col: from.col }
    : { row: from.row, col: from.col + dc / 2 };
}

function detectDaiDaoHoachTam(grid: Grid, move: Move, f: Frame): boolean {
  if (move.piece.type !== 'chariot' || !move.captured) return false;
  if (move.captured.type !== 'advisor') return false;
  if (!isSameSquare(move.to, f.palaceCenter)) return false;
  return (
    isSquareAttackedBy(grid, move.to.row, move.to.col, f.attacker) ||
    attacksSquare(grid, move.to, f.kingHome)
  );
}

function detectMaHauPhao(grid: Grid, f: Frame, king: Coord, checkers: Coord[]): boolean {
  for (const c of checkers) {
    const piece = grid[c.row][c.col];
    if (!piece || piece.type !== 'cannon') continue;
    const screen = screenBetween(c, king, grid);
    if (!screen || screen.piece.side !== f.attacker) continue;
    if (screen.piece.type === 'horse' && isAdjacent(screen.at, king)) return true;
  }
  return false;
}

function detectTrongPhao(grid: Grid, f: Frame, king: Coord, checkers: Coord[]): boolean {
  for (const c of checkers) {
    const piece = grid[c.row][c.col];
    if (!piece || piece.type !== 'cannon') continue;
    const screen = screenBetween(c, king, grid);
    if (screen && screen.piece.side === f.attacker && screen.piece.type === 'cannon') return true;
  }
  return false;
}

function detectBeCung(grid: Grid, f: Frame, king: Coord, checkers: Coord[]): boolean {
  if (!isSameSquare(king, f.kingHome)) return false;
  if (checkers.length !== 1) return false;
  const checker = grid[checkers[0].row][checkers[0].col];
  if (!checker || checker.type !== 'cannon') return false;
  let ownBlocked = 0;
  for (const step of palaceSteps(king)) {
    const occupant = grid[step.row][step.col];
    if (occupant && occupant.side === f.defender) {
      ownBlocked++;
      continue;
    }
    if (!occupant && !isSquareAttackedBy(grid, step.row, step.col, f.attacker)) return false;
  }
  return ownBlocked >= 2;
}

function detectBachKiemTuong(grid: Grid, f: Frame, king: Coord): boolean {
  const attackerKing = findKing(grid, f.attacker);
  if (!attackerKing) return false;
  let gazeDenied = false;
  for (const step of palaceSteps(king)) {
    const occupied = grid[step.row][step.col] !== null;
    const attacked = isSquareAttackedBy(grid, step.row, step.col, f.attacker);
    if (occupied || attacked) continue;
    // Reachable by force, so the king could only be kept off this square by the
    // no-facing rule - and only if every other flight is covered, that rule is
    // what actually kills. Otherwise it is just a background shape.
    const gazed = step.col === attackerKing.col && betweenCount(attackerKing, step, grid) === 0;
    if (gazed) gazeDenied = true;
    else return false;
  }
  return gazeDenied;
}

function detectBatHoangMa(prevGrid: Grid, grid: Grid, move: Move, f: Frame, king: Coord): boolean {
  if (move.piece.type === 'horse') return false;
  let hit = false;
  forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'horse' || hit) return false;
    if (!attacksSquare(grid, at, king)) return false;
    const leg = horseLeg(at, king);
    if (!isSameSquare(leg, move.from)) return false;
    hit = prevGrid[leg.row][leg.col] !== null && grid[leg.row][leg.col] === null;
    return hit;
  });
  return hit;
}

function detectThietMonThuyen(grid: Grid, f: Frame, king: Coord): boolean {
  if (king.col !== 4) return false;
  let pinsMiddle = false;
  forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'cannon' || at.col !== 4) return false;
    const gap = betweenCount(at, king, grid);
    if (gap === 1) pinsMiddle = true;
    return false;
  });
  if (!pinsMiddle) return false;
  return forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'chariot' && p.type !== 'soldier') return false;
    return (at.row === f.back || at.row === f.second) && (at.col === 3 || at.col === 5);
  });
}

function detectThienDiaPhao(grid: Grid, f: Frame, king: Coord): boolean {
  if (king.col !== 4) return false;
  let sky: Coord | null = null;
  forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'cannon' || at.col !== 4) return false;
    sky = at;
    return true;
  });
  if (!sky) return false;

  const defenderBack = f.defender === 'black' ? 0 : 9;
  return forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'cannon' || at.row !== defenderBack) return false;
    return !isSameSquare(at, sky!);
  });
}

function detectHaiDeLaoNguyet(grid: Grid, f: Frame, king: Coord, checkers: Coord[]): boolean {
  if (king.row !== f.back) return false;
  let chariotCol = -1;
  for (const c of checkers) {
    if (c.row === f.back && grid[c.row][c.col]?.type === 'chariot') chariotCol = c.col;
  }
  if (chariotCol < 0) return false;
  return forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'cannon' || at.row !== f.back) return false;
    return (at.col - king.col) * (chariotCol - king.col) < 0;
  });
}

function detectGiapXaPhao(grid: Grid, f: Frame, king: Coord): boolean {
  const cannons = countWhere(grid, f.attacker, (p, at) =>
    p.type === 'cannon' && (at.row === king.row || at.col === king.col),
  );
  const chariots = countWhere(grid, f.attacker, (p, at) =>
    p.type === 'chariot' && (at.row === king.row || at.col === king.col),
  );
  return cannons >= 2 && chariots >= 1;
}

function detectSongXaThac(grid: Grid, f: Frame, king: Coord, checkers: Coord[]): boolean {
  let checkingChariot: Coord | null = null;
  for (const c of checkers) {
    if (grid[c.row][c.col]?.type === 'chariot') checkingChariot = c;
  }
  if (!checkingChariot) return false;
  const steps = palaceSteps(king);
  if (steps.length === 0) return false;
  return forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'chariot' || isSameSquare(at, checkingChariot!)) return false;
    for (const s of steps) {
      if (attacksSquare(grid, at, s)) return true;
    }
    return false;
  });
}

function detectPostHorse(
  grid: Grid,
  f: Frame,
  king: Coord,
  rows: number[],
  cols: number[],
  forcing: boolean,
): boolean {
  const steps = palaceSteps(king);
  for (const r of rows) {
    for (const c of cols) {
      const p = grid[r][c];
      if (!p || p.side !== f.attacker || p.type !== 'horse') continue;
      const at = { row: r, col: c };
      if (forcing && attacksSquare(grid, at, king)) return true;
      for (const s of steps) {
        if (attacksSquare(grid, at, s)) return true;
      }
    }
  }
  return false;
}

function detectPhaoNanDanSa(grid: Grid, move: Move, f: Frame): boolean {
  if (move.piece.type !== 'cannon') return false;
  if (move.to.row !== f.back) return false;
  if (!move.captured) return false;
  if (move.captured.type !== 'advisor' && move.captured.type !== 'elephant') return false;
  return countWhere(grid, f.attacker, (p) => p.type === 'chariot') >= 1;
}

function detectTamTuQuyBien(grid: Grid, f: Frame, king: Coord): boolean {
  const onLeftWing = king.col <= 3;
  const onRightWing = king.col >= 5;
  if (!onLeftWing && !onRightWing) return false;
  const wingCols = onLeftWing ? [0, 1, 2] : [6, 7, 8];
  const deepRows = [f.back, f.second, f.third];
  return (
    countWhere(grid, f.attacker, (p, at) => {
      if (!HEAVY_TYPES.includes(p.type)) return false;
      return wingCols.includes(at.col) && deepRows.includes(at.row);
    }) >= 3
  );
}

function detectKhongDauPhao(grid: Grid, f: Frame, king: Coord): boolean {
  if (countWhere(grid, f.attacker, (p) => p.type === 'chariot') < 1) return false;
  return forEachPiece(grid, f.attacker, (p, at) => {
    if (p.type !== 'cannon') return false;
    const gap = betweenCount(at, king, grid);
    return gap === 0;
  });
}

/**
 * `focus` is the pattern tonight advertised, and it outranks the table only when its own detector
 * fired too: a night may prefer a quieter name over a louder one, never invent a tactic.
 */
export function detectKillPattern(
  prevGrid: Grid,
  afterGrid: Grid,
  move: Move,
  focus?: KillPatternId | null,
): KillPatternHit | null {
  const f = frameOf(move.piece.side);
  const king = findKing(afterGrid, f.defender);
  if (!king) return null;

  const forcing = isInCheck(afterGrid, f.defender);
  const checkers = forcing ? checkersOf(afterGrid, f.attacker, king) : [];

  const candidates: Array<{ id: KillPatternId; on: boolean }> = [
    { id: 'dai_dao_hoach_tam', on: detectDaiDaoHoachTam(afterGrid, move, f) },
    { id: 'ma_hau_phao', on: forcing && detectMaHauPhao(afterGrid, f, king, checkers) },
    { id: 'trong_phao', on: forcing && detectTrongPhao(afterGrid, f, king, checkers) },
    { id: 'be_cung', on: forcing && detectBeCung(afterGrid, f, king, checkers) },
    { id: 'bach_kiem_tuong', on: forcing && detectBachKiemTuong(afterGrid, f, king) },
    { id: 'bat_hoang_ma', on: forcing && detectBatHoangMa(prevGrid, afterGrid, move, f, king) },
    { id: 'thiet_mon_thuyen', on: detectThietMonThuyen(afterGrid, f, king) },
    { id: 'thien_dia_phao', on: detectThienDiaPhao(afterGrid, f, king) },
    { id: 'hai_de_lao_nguyet', on: forcing && detectHaiDeLaoNguyet(afterGrid, f, king, checkers) },
    { id: 'giap_xa_phao', on: detectGiapXaPhao(afterGrid, f, king) },
    { id: 'song_xa_thac', on: forcing && detectSongXaThac(afterGrid, f, king, checkers) },
    { id: 'ngo_tao_ma', on: detectPostHorse(afterGrid, f, king, [f.second], [2, 6], forcing) },
    {
      id: 'qua_giac_ma',
      on: detectPostHorse(afterGrid, f, king, [f.back, f.third], [3, 5], forcing),
    },
    { id: 'dieu_ngu_ma', on: detectPostHorse(afterGrid, f, king, [f.third], [2, 6], forcing) },
    { id: 'phao_nan_dan_sa', on: detectPhaoNanDanSa(afterGrid, move, f) },
    { id: 'tam_tu_quy_bien', on: detectTamTuQuyBien(afterGrid, f, king) },
    { id: 'khong_dau_phao', on: detectKhongDauPhao(afterGrid, f, king) },
  ];

  let best: KillPatternHit | null = null;
  let bestRank = Number.NEGATIVE_INFINITY;
  for (const cand of candidates) {
    if (!cand.on) continue;
    const meta = PATTERN_META[cand.id];
    const rank = cand.id === focus ? Number.POSITIVE_INFINITY : meta.priority;
    if (rank > bestRank) {
      bestRank = rank;
      best = { id: cand.id, nameVi: meta.nameVi, nameZh: meta.nameZh, forcing, priority: meta.priority };
    }
  }
  return best;
}
