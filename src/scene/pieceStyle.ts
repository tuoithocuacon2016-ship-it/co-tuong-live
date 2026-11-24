import { PIECE_CHAR, PieceType, Side } from '../engine/xiangqi';

export type PieceThemeId = 'ivory_crimson' | 'classic_red_white' | 'tournament_white';
export type PieceLabelMode = 'han' | 'han_viet' | 'viet';

export interface PieceVisualConfig {
  theme: PieceThemeId;
  labelMode: PieceLabelMode;
}

export interface PieceSidePalette {
  /** Lathe 3D piece body color (hex number for Three.js MeshStandardMaterial) */
  bodyColorHex: number;
  /** Center disc background fill (sRGB hex, matte ceramic — zero glare washout) */
  faceBgCenter: string;
  /** Outer disc subtle shading before rim */
  faceBgEdge: string;
  /** Crisp single outer rim ring color */
  rimOuter: string;
  /** Thin inner accent ring color */
  rimInner: string;
  /** Primary glyph fill color (ACES-calibrated for high contrast on mobile!) */
  inkColor: string;
  /** Crisp thin stroke around glyph to lock edges at small mobile sizes */
  inkStroke: string;
  /** Secondary Vietnamese sub-label color (for han_viet mode) */
  subLabelColor: string;
}

export interface PieceThemeSpec {
  id: PieceThemeId;
  label: string;
  shortLabel: string;
  description: string;
  red: PieceSidePalette;
  black: PieceSidePalette;
}

export const DEFAULT_PIECE_STYLE: PieceVisualConfig = {
  theme: 'ivory_crimson',
  labelMode: 'han',
};

/** Short, unmistakable Vietnamese piece names optimized for mobile 375px legibility */
export const PIECE_SHORT_VI: Record<Side, Record<PieceType, string>> = {
  red: {
    king: 'TƯỚNG',
    advisor: 'SĨ',
    elephant: 'TƯỢNG',
    horse: 'MÃ',
    chariot: 'XE',
    cannon: 'PHÁO',
    soldier: 'BINH',
  },
  black: {
    king: 'TƯỚNG',
    advisor: 'SĨ',
    elephant: 'TƯỢNG',
    horse: 'MÃ',
    chariot: 'XE',
    cannon: 'PHÁO',
    soldier: 'TỐT',
  },
};

export const PIECE_LABEL_MODES: Array<{
  id: PieceLabelMode;
  label: string;
  shortLabel: string;
}> = [
  { id: 'han', label: 'Chữ Hán Lớn', shortLabel: 'Hán' },
  { id: 'han_viet', label: 'Song Ngữ Hán+Việt', shortLabel: 'H+V' },
  { id: 'viet', label: 'Chữ Việt Siêu Rõ', shortLabel: 'Việt' },
];

/**
 * ACES-Filmic-calibrated high-contrast Xiangqi piece themes.
 * All inks are intentionally deepened on light ceramic faces and brightened on
 * obsidian/crimson faces so that AFTER Three.js ACESFilmic tone-mapping + warm
 * key light, mobile phones (375px) still preserve >= 7:1 contrast ratio!
 */
export const PIECE_THEMES: Record<PieceThemeId, PieceThemeSpec> = {
  ivory_crimson: {
    id: 'ivory_crimson',
    label: 'Ngà Đỏ / Đen Trắng (Siêu Nét)',
    shortLabel: 'Ngà Đỏ',
    description: 'Quân Đỏ mặt trắng ngà chữ đỏ đậm, Quân Đen mặt đen tuyền chữ trắng tinh — rõ nhất trên điện thoại.',
    red: {
      bodyColorHex: 0x8f0a10,
      faceBgCenter: '#fffefb',
      faceBgEdge: '#f5eedc',
      rimOuter: '#9b0910',
      rimInner: '#c82026',
      inkColor: '#980309',
      inkStroke: '#630104',
      subLabelColor: '#8c060c',
    },
    black: {
      bodyColorHex: 0x0b1119,
      faceBgCenter: '#101823',
      faceBgEdge: '#090e16',
      rimOuter: '#e3cc92',
      rimInner: '#63c2b0',
      inkColor: '#ffffff',
      inkStroke: '#e6f2ff',
      subLabelColor: '#f5dc99',
    },
  },
  classic_red_white: {
    id: 'classic_red_white',
    label: 'Đỏ Son / Bạch Ngọc (Đỏ-Trắng)',
    shortLabel: 'Đỏ-Trắng',
    description: 'Quân Đỏ nền đỏ son chữ trắng tinh siêu đậm, Quân Trắng nền bạch ngọc chữ đen tuyền.',
    red: {
      bodyColorHex: 0x5c0408,
      faceBgCenter: '#6e0308',
      faceBgEdge: '#490205',
      rimOuter: '#fff4de',
      rimInner: '#f0c67a',
      inkColor: '#ffffff',
      inkStroke: '#ffffff',
      subLabelColor: '#ffe7b3',
    },
    black: {
      bodyColorHex: 0x1b2430,
      faceBgCenter: '#fcfdff',
      faceBgEdge: '#e6edf4',
      rimOuter: '#0e1722',
      rimInner: '#2e4156',
      inkColor: '#050910',
      inkStroke: '#000000',
      subLabelColor: '#101a28',
    },
  },
  tournament_white: {
    id: 'tournament_white',
    label: 'Trắng Sứ Giải Đấu',
    shortLabel: 'Sứ Trắng',
    description: 'Chuẩn cờ tướng thi đấu quốc tế: cả 2 phe mặt trắng sứ chống chói, chữ Đỏ Huyết vs Đen Tuyền.',
    red: {
      bodyColorHex: 0x990b12,
      faceBgCenter: '#fffefa',
      faceBgEdge: '#f4ecdc',
      rimOuter: '#a00910',
      rimInner: '#d43131',
      inkColor: '#990309',
      inkStroke: '#630105',
      subLabelColor: '#8a050a',
    },
    black: {
      bodyColorHex: 0x13222b,
      faceBgCenter: '#f4f8fa',
      faceBgEdge: '#e1ebf0',
      rimOuter: '#0c1c26',
      rimInner: '#245863',
      inkColor: '#060c12',
      inkStroke: '#000000',
      subLabelColor: '#0b222c',
    },
  },
};

export const PIECE_THEME_LIST: PieceThemeSpec[] = [
  PIECE_THEMES.ivory_crimson,
  PIECE_THEMES.classic_red_white,
  PIECE_THEMES.tournament_white,
];

export function nextPieceTheme(current: PieceThemeId): PieceThemeId {
  const order: PieceThemeId[] = ['ivory_crimson', 'classic_red_white', 'tournament_white'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

export function nextPieceLabelMode(current: PieceLabelMode): PieceLabelMode {
  const order: PieceLabelMode[] = ['han', 'han_viet', 'viet'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

export function getPieceLabels(
  side: Side,
  type: PieceType,
  labelMode: PieceLabelMode,
): { primary: string; secondary?: string } {
  const han = PIECE_CHAR[side][type];
  const vi = PIECE_SHORT_VI[side][type];
  if (labelMode === 'viet') {
    return { primary: vi };
  }
  if (labelMode === 'han_viet') {
    return { primary: han, secondary: vi };
  }
  return { primary: han };
}

/** WCAG 2.1 relative luminance for verifying piece face readability in unit tests */
export function hexToRelativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio between two hex colors (1..21) */
export function computeContrastRatio(hexA: string, hexB: string): number {
  const l1 = hexToRelativeLuminance(hexA);
  const l2 = hexToRelativeLuminance(hexB);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}
