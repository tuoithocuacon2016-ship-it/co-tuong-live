/**
 * Pure Responsive Perspective-Frustum Camera Framing Calculator for the 3D Xiangqi Board.
 *
 * Ensures that on narrow mobile screens (e.g. 390x844 portrait) and TikTok 9:16 Live,
 * the 9x10 Xiangqi board fills ~92-96% of the available pane width at a steep overhead
 * readability angle so every circular piece stays large, round, and razor-sharp.
 */

export interface BoardCameraInputs {
  /** Width of the WebGL board viewport pane in CSS pixels */
  paneWidth: number;
  /** Height of the WebGL board viewport pane in CSS pixels */
  paneHeight: number;
  /** Vertical field of view of the Three.js PerspectiveCamera in degrees */
  fovDeg: number;
  /** Layout mode currently active */
  layoutMode: 'tiktok' | 'split_desktop' | 'split_mobile' | 'single';
  /** Active camera preset */
  preset: 'liveBot' | 'duel' | 'board' | 'guest';
  /** World width of the board slab (default 4.2) */
  boardWorldW?: number;
  /** World depth of the board slab (default 4.725) */
  boardWorldD?: number;
  /** World Y height of the board top surface (default 0.94) */
  boardTopY?: number;
}

export interface BoardCameraPose {
  posX: number;
  posY: number;
  posZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

/**
 * Computes the optimal camera distance & elevation angle so the entire Xiangqi board
 * (including Red 9..1 and Black 1..9 file numbers) fits inside the viewport with
 * maximal piece size on phones and crisp margins above/below HUD overlays.
 */
export function computeResponsiveBoardCamera(input: BoardCameraInputs): BoardCameraPose {
  const boardW = input.boardWorldW ?? 4.2;
  const boardD = input.boardWorldD ?? 4.725;
  const boardY = input.boardTopY ?? 0.94;

  // Non-tactical cinematic angles stay stylized across desktop/mobile
  if (input.preset === 'duel') {
    return { posX: 5.2, posY: 3.55, posZ: 2.15, targetX: 0, targetY: boardY + 0.02, targetZ: 0 };
  }
  if (input.preset === 'guest') {
    return { posX: 0, posY: 3.75, posZ: 5.05, targetX: 0, targetY: boardY, targetZ: -0.32 };
  }

  const w = Math.max(input.paneWidth, 240);
  const h = Math.max(input.paneHeight, 240);
  const aspect = w / h;
  const vFovRad = (input.fovDeg * Math.PI) / 180;
  const tanHalfV = Math.tan(vFovRad / 2);
  const tanHalfH = tanHalfV * aspect;

  // Choose steep overhead tilt on narrow mobile/TikTok screens so pieces look round (less foreshortening!)
  let tiltDeg = 27;
  let marginW = 1.07; // 93% horizontal fill
  let marginD = 1.15;
  let targetZBias = 0.22;

  if (input.layoutMode === 'tiktok') {
    // Bottom 58% of 9:16 phone frame — board must sit cleanly ABOVE the 2-line commentary strip
    tiltDeg = 22; // Steep 68° elevation -> round, ultra-readable pieces!
    marginW = 1.055; // ~95% width fill on 9:16 phones!
    marginD = 1.38; // Leaves room at bottom for 2-line chat/commentary box
    targetZBias = 0.62;
  } else if (input.layoutMode === 'split_mobile') {
    // Top 56% of mobile portrait screen (e.g. 390x472) — top bar sits above, pavilion below
    tiltDeg = 21; // Steep 69° elevation -> maximum piece legibility on phones!
    marginW = 1.045; // ~96% horizontal fill!
    marginD = 1.24; // Leaves room for compact mobile TopBroadcastBar
    targetZBias = -0.18;
  } else if (input.layoutMode === 'split_desktop') {
    // Left 60% of desktop widescreen (e.g. 864x900) — sits between TopBar and BottomControlDock
    tiltDeg = 26;
    marginW = 1.16;
    marginD = 1.48; // Generous breathing room for BottomControlDock (~192px)
    targetZBias = 0.68;
  } else {
    // Single full-viewport mode
    tiltDeg = input.preset === 'board' ? 21 : 31;
    marginW = aspect < 1 ? 1.05 : 1.14;
    marginD = 1.32;
    targetZBias = input.preset === 'board' ? 0.14 : 0.42;
  }

  const tiltRad = (tiltDeg * Math.PI) / 180;
  const cosTilt = Math.cos(tiltRad);
  const sinTilt = Math.sin(tiltRad);

  // Required camera distance along view ray to fit both full board width & projected board depth
  const halfW = (boardW * marginW) / 2;
  const halfD = (boardD * marginD) / 2;

  // Perspective foreshortening correction: closest rank is closer to camera by halfD * sin(tilt)
  const distForWidth = halfW / tanHalfH + halfD * sinTilt * 0.55;
  const distForDepth = (halfD * cosTilt) / tanHalfV + halfD * sinTilt * 0.45;
  const dist = Math.max(distForWidth, distForDepth);

  const targetY = boardY - 0.04;
  const targetZ = targetZBias;

  return {
    posX: 0,
    posY: targetY + dist * cosTilt,
    posZ: targetZ + dist * sinTilt,
    targetX: 0,
    targetY,
    targetZ,
  };
}
