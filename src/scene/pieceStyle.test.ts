import assert from 'node:assert/strict';
import test from 'node:test';
import { PieceType, Side } from '../engine/xiangqi';
import {
  DEFAULT_PIECE_STYLE,
  PIECE_LABEL_MODES,
  PIECE_THEMES,
  PIECE_THEME_LIST,
  PieceLabelMode,
  PieceThemeId,
  computeContrastRatio,
  getPieceLabels,
  nextPieceLabelMode,
  nextPieceTheme,
} from './pieceStyle';

const ALL_TYPES: PieceType[] = [
  'king',
  'advisor',
  'elephant',
  'horse',
  'chariot',
  'cannon',
  'soldier',
];

const ALL_SIDES: Side[] = ['red', 'black'];

test('All 3 Xiangqi piece themes exceed WCAG AAA-grade (>= 7.5:1) contrast on both Red and Black', () => {
  assert.equal(PIECE_THEME_LIST.length, 3);
  for (const theme of PIECE_THEME_LIST) {
    for (const side of ALL_SIDES) {
      const palette = theme[side];
      const centerContrast = computeContrastRatio(palette.inkColor, palette.faceBgCenter);
      const edgeContrast = computeContrastRatio(palette.inkColor, palette.faceBgEdge);
      assert.ok(
        centerContrast >= 7.5,
        `${theme.id} (${side}) center ink contrast must be >= 7.5:1 for mobile legibility, got ${centerContrast.toFixed(2)}:1`,
      );
      assert.ok(
        edgeContrast >= 6.5,
        `${theme.id} (${side}) edge ink contrast must be >= 6.5:1, got ${edgeContrast.toFixed(2)}:1`,
      );
      const subContrast = computeContrastRatio(palette.subLabelColor, palette.faceBgCenter);
      assert.ok(
        subContrast >= 6.5,
        `${theme.id} (${side}) bilingual sub-label contrast must be >= 6.5:1, got ${subContrast.toFixed(2)}:1`,
      );
    }
  }
});

test('Piece theme and label mode cyclers loop cleanly across all options', () => {
  assert.equal(DEFAULT_PIECE_STYLE.theme, 'ivory_crimson');
  assert.equal(DEFAULT_PIECE_STYLE.labelMode, 'han');

  let t: PieceThemeId = DEFAULT_PIECE_STYLE.theme;
  t = nextPieceTheme(t);
  assert.equal(t, 'classic_red_white');
  t = nextPieceTheme(t);
  assert.equal(t, 'tournament_white');
  t = nextPieceTheme(t);
  assert.equal(t, 'ivory_crimson');

  let m: PieceLabelMode = DEFAULT_PIECE_STYLE.labelMode;
  m = nextPieceLabelMode(m);
  assert.equal(m, 'han_viet');
  m = nextPieceLabelMode(m);
  assert.equal(m, 'viet');
  m = nextPieceLabelMode(m);
  assert.equal(m, 'han');

  assert.equal(PIECE_LABEL_MODES.length, 3);
  assert.ok(PIECE_THEMES.classic_red_white.shortLabel.includes('Đỏ-Trắng'));
});

test('getPieceLabels returns crisp labels for all 14 piece types across han, han_viet, and viet modes', () => {
  for (const side of ALL_SIDES) {
    for (const type of ALL_TYPES) {
      const han = getPieceLabels(side, type, 'han');
      assert.equal(han.primary.length, 1);
      assert.equal(han.secondary, undefined);

      const hv = getPieceLabels(side, type, 'han_viet');
      assert.equal(hv.primary, han.primary);
      assert.ok(hv.secondary && hv.secondary.length >= 2);

      const vi = getPieceLabels(side, type, 'viet');
      assert.equal(vi.primary, hv.secondary);
      assert.equal(vi.secondary, undefined);
    }
  }

  // Distinct soldier labels (Red = BINH, Black = TỐT)
  assert.equal(getPieceLabels('red', 'soldier', 'viet').primary, 'BINH');
  assert.equal(getPieceLabels('black', 'soldier', 'viet').primary, 'TỐT');
});
