import * as THREE from 'three';
import { PIECE_CHAR, PieceType, Side } from '../engine/xiangqi';

export interface BoardTexturePair {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Generates a high-resolution rosewood / aged sandalwood Xiangqi board texture
 * with authentic 9x10 grid, palace diagonals, star markers, 楚河 漢界 river calligraphy,
 * and subtle Red (1-9) / Black (1-9) file coordinates along the margins for chat players.
 */
export function createXiangqiBoardTextures(maxAnisotropy: number): BoardTexturePair {
  const width = 1024;
  const height = 1152;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base rich amber-walnut wood gradient so BOTH Red and Black pieces pop with crisp contrast
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#b3834e');
  grad.addColorStop(0.5, '#9d6e3c');
  grad.addColorStop(1, '#84572c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Procedural fine wood grain streaks
  for (let i = 0; i < 240; i++) {
    const x = (i / 240) * width + (Math.sin(i * 1.7) * 6);
    const alpha = 0.03 + (i % 5) * 0.014;
    ctx.strokeStyle = i % 2 === 0 ? `rgba(62, 34, 14, ${alpha})` : `rgba(242, 210, 155, ${alpha * 0.8})`;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + Math.sin(i) * 14,
      height * 0.33,
      x - Math.cos(i) * 14,
      height * 0.66,
      x + Math.sin(i * 0.5) * 8,
      height,
    );
    ctx.stroke();

    bCtx.strokeStyle = i % 2 === 0 ? 'rgba(105,105,105,0.22)' : 'rgba(150,150,150,0.18)';
    bCtx.lineWidth = 1.5;
    bCtx.beginPath();
    bCtx.moveTo(x, 0);
    bCtx.lineTo(x + Math.sin(i * 0.5) * 8, height);
    bCtx.stroke();
  }

  // Board geometry mapping: pad matches 3D coordinate grid cleanly
  const padX = 112;
  const padY = 126;
  const gridW = width - padX * 2;
  const gridH = height - padY * 2;
  const cellX = gridW / 8;
  const cellY = gridH / 9;

  // Outer carved lacquer frame border
  ctx.strokeStyle = '#331a0d';
  ctx.lineWidth = 14;
  ctx.strokeRect(padX - 38, padY - 38, gridW + 76, gridH + 76);

  ctx.strokeStyle = '#d4a656';
  ctx.lineWidth = 3;
  ctx.strokeRect(padX - 26, padY - 26, gridW + 52, gridH + 52);

  // Subtle carved groove on bump map for grid lines
  const drawCarvedLine = (x1: number, y1: number, x2: number, y2: number, lw = 3.5) => {
    ctx.strokeStyle = '#2b160c';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    bCtx.strokeStyle = '#404040';
    bCtx.lineWidth = lw + 1;
    bCtx.beginPath();
    bCtx.moveTo(x1, y1);
    bCtx.lineTo(x2, y2);
    bCtx.stroke();
  };

  // Horizontal lines (10 ranks)
  for (let r = 0; r < 10; r++) {
    const y = padY + r * cellY;
    drawCarvedLine(padX, y, padX + gridW, y, r === 0 || r === 9 ? 5 : 3.2);
  }

  // Vertical lines (9 files, split across the river for interior files)
  for (let c = 0; c < 9; c++) {
    const x = padX + c * cellX;
    if (c === 0 || c === 8) {
      drawCarvedLine(x, padY, x, padY + gridH, 5);
    } else {
      drawCarvedLine(x, padY, x, padY + 4 * cellY, 3.2);
      drawCarvedLine(x, padY + 5 * cellY, x, padY + 9 * cellY, 3.2);
    }
  }

  // Palace diagonals (Black: rows 0..2, cols 3..5; Red: rows 7..9, cols 3..5)
  drawCarvedLine(padX + 3 * cellX, padY, padX + 5 * cellX, padY + 2 * cellY, 3);
  drawCarvedLine(padX + 5 * cellX, padY, padX + 3 * cellX, padY + 2 * cellY, 3);
  drawCarvedLine(padX + 3 * cellX, padY + 7 * cellY, padX + 5 * cellX, padY + 9 * cellY, 3);
  drawCarvedLine(padX + 5 * cellX, padY + 7 * cellY, padX + 3 * cellX, padY + 9 * cellY, 3);

  // Cannon & Soldier star corner ticks
  const drawStarMark = (r: number, c: number) => {
    const cx = padX + c * cellX;
    const cy = padY + r * cellY;
    const g = 9;
    const len = 18;
    ctx.strokeStyle = '#2b160c';
    ctx.lineWidth = 2.6;

    const drawCorner = (dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * g, cy + dy * (g + len));
      ctx.lineTo(cx + dx * g, cy + dy * g);
      ctx.lineTo(cx + dx * (g + len), cy + dy * g);
      ctx.stroke();
    };

    if (c > 0) {
      drawCorner(-1, -1);
      drawCorner(-1, 1);
    }
    if (c < 8) {
      drawCorner(1, -1);
      drawCorner(1, 1);
    }
  };

  [
    [2, 1], [2, 7], [7, 1], [7, 7],
    [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
    [6, 0], [6, 2], [6, 4], [6, 6], [6, 8],
  ].forEach(([r, c]) => drawStarMark(r, c));

  // River calligraphy: 楚河  漢界
  const riverY = padY + 4.5 * cellY;
  ctx.fillStyle = 'rgba(46, 22, 11, 0.85)';
  ctx.font = 'bold 54px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚   河', padX + gridW * 0.27, riverY);
  ctx.fillText('漢   界', padX + gridW * 0.73, riverY);

  // Subtle decorative lotus divider at river center
  ctx.strokeStyle = 'rgba(130, 48, 28, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(padX + gridW * 0.5, riverY, 18, 0, Math.PI * 2);
  ctx.stroke();

  // File numbers along bottom (Red 9..1 left->right) and top (Black 1..9 left->right)
  ctx.font = 'bold 30px "JetBrains Mono", monospace';
  for (let c = 0; c < 9; c++) {
    const x = padX + c * cellX;
    // Red files (bottom edge: 9 down to 1) — bold crimson with crisp cream outline
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 245, 230, 0.72)';
    ctx.strokeText(String(9 - c), x, padY + gridH + 56);
    ctx.fillStyle = '#a80c12';
    ctx.fillText(String(9 - c), x, padY + gridH + 56);
    // Black files (top edge: 1 up to 9)
    ctx.fillStyle = '#18141c';
    ctx.fillText(String(c + 1), x, padY - 56);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

/**
 * Generates crisp carved top-face texture for each Xiangqi piece (cached by side+type).
 */
export function createPieceFaceTexture(
  side: Side,
  type: PieceType,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  // Background disc surface — High-Contrast Imperial Crimson Lacquer vs Deep Obsidian-Jade
  const bg = ctx.createRadialGradient(cx - 22, cy - 26, 10, cx, cy, 128);
  if (side === 'red') {
    // Rich crimson outer bevel framing a bright porcelain-ivory center so Red pieces pop vividly!
    bg.addColorStop(0, '#fff9ee');
    bg.addColorStop(0.68, '#f9ebd2');
    bg.addColorStop(0.84, '#b8171c');
    bg.addColorStop(1, '#7a0a0e');
  } else {
    bg.addColorStop(0, '#262b38');
    bg.addColorStop(0.74, '#131620');
    bg.addColorStop(1, '#090b11');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Subtle concentric lathe rings
  ctx.strokeStyle = side === 'red' ? 'rgba(175, 28, 32, 0.14)' : 'rgba(244, 208, 120, 0.1)';
  ctx.lineWidth = 2;
  for (let r = 36; r < 96; r += 18) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Double engraved decorative border ring
  const inkColor = side === 'red' ? '#c80e16' : '#f7d883';
  const rimSecondary = side === 'red' ? '#d99b3c' : '#58b89f';

  ctx.strokeStyle = side === 'red' ? '#9c0b11' : '#e8be62';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 106, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = rimSecondary;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 94, 0, Math.PI * 2);
  ctx.stroke();

  // Traditional carved Hanzi glyph — extra bold & stroked for razor-sharp readability in 9:16 Live!
  const glyph = PIECE_CHAR[side][type];
  ctx.font = '900 132px "Songti SC", "Noto Serif TC", "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (side === 'red') {
    ctx.shadowColor = 'rgba(255, 250, 240, 0.8)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#78070c';
    ctx.strokeText(glyph, cx, cy + 5);
    ctx.fillStyle = inkColor;
    ctx.fillText(glyph, cx, cy + 5);
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#5c4214';
    ctx.strokeText(glyph, cx, cy + 5);
    ctx.fillStyle = inkColor;
    ctx.fillText(glyph, cx, cy + 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an intricate Bagua / Wuxia Qi Formation ring texture for deep analysis & Check FX.
 */
export function createBaguaFormationTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Outer radiant ring
  ctx.strokeStyle = 'rgba(232, 186, 98, 0.92)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 232, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(232, 186, 98, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 214, 0, Math.PI * 2);
  ctx.stroke();

  // Octagonal martial formation frame
  ctx.strokeStyle = 'rgba(235, 198, 122, 0.78)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * 192;
    const y = cy + Math.sin(a) * 192;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Eight Trigrams (Bagua bars) around perimeter
  const trigrams = [
    [1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1],
    [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0],
  ];
  ctx.strokeStyle = 'rgba(245, 212, 136, 0.95)';
  ctx.lineWidth = 5;
  trigrams.forEach((bars, idx) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((idx / 8) * Math.PI * 2);
    bars.forEach((solid, bIdx) => {
      const y = -152 - bIdx * 12;
      if (solid) {
        ctx.beginPath();
        ctx.moveTo(-24, y);
        ctx.lineTo(24, y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-24, y);
        ctx.lineTo(-5, y);
        ctx.moveTo(5, y);
        ctx.lineTo(24, y);
        ctx.stroke();
      }
    });
    ctx.restore();
  });

  // Inner circle
  ctx.strokeStyle = 'rgba(222, 92, 68, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates carved stone courtyard tile texture + bump map for the mountain pavilion terrace.
 */
export function createStoneTerraceTextures(maxAnisotropy: number): BoardTexturePair {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext('2d')!;

  ctx.fillStyle = '#25232b';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#787878';
  bCtx.fillRect(0, 0, size, size);

  // Stone grain noise
  for (let i = 0; i < 2400; i++) {
    const x = (i * 97) % size;
    const y = (i * 193) % size;
    const s = 1 + (i % 3);
    const v = 32 + (i % 24);
    ctx.fillStyle = `rgb(${v}, ${v - 2}, ${v + 5})`;
    ctx.fillRect(x, y, s, s);
    const bv = 100 + (i % 50);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, s, s);
  }

  // Flagstone joints
  ctx.strokeStyle = '#141219';
  ctx.lineWidth = 4;
  bCtx.strokeStyle = '#242424';
  bCtx.lineWidth = 5;
  const step = 128;
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(size, y);
    bCtx.stroke();
  }
  for (let row = 0; row < 4; row++) {
    const offset = (row % 2) * 64;
    for (let x = offset; x <= size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, row * step);
      ctx.lineTo(x, (row + 1) * step);
      ctx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(x, row * step);
      bCtx.lineTo(x, (row + 1) * step);
      bCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 5);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(5, 5);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/** Soft radial contact shadow disc texture for grounding props & characters */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  g.addColorStop(0.55, 'rgba(0, 0, 0, 0.32)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
