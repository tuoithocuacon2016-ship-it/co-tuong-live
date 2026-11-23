import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BOARD_COLS,
  BOARD_ROWS,
  BoardState,
  Piece,
  PieceType,
  Side,
} from '../engine/xiangqi';
import { BOT_MASTER_PROFILE, GuestGender, WuxiaCharacterProfile } from '../data/characters';
import { createPieceFaceTexture, createXiangqiBoardTextures } from './textures';
import { HostEmotion } from './portraitKinematics';
import {
  ActionCuePayload,
  CINEMA_BOARD_TOP_Y,
  CINEMA_CELL_D,
  CINEMA_CELL_W,
  CINEMA_TABLE_Y,
  CameraShotSample,
  CharacterPoseSample,
  CinemaCameraAngle,
  CinemaDirectorState,
  MoveChoreoPayload,
  boardCoordToCinemaWorld,
  createInitialCinemaDirector,
  stepCinemaDirector,
} from './cinemaDirector';
import { wuxiaAudio } from '../utils/wuxiaAudio';

export interface PavilionCinemaTelemetry {
  shot: string;
  shotLabelVi: string;
  actionLabelVi: string;
  brideAction: string;
  groomAction: string;
}

interface CinemaActorRig {
  root: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftKneeGroup: THREE.Group;
  rightKneeGroup: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  rightHandTip: THREE.Object3D;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  leftHandTip: THREE.Object3D;
  fanGroup?: THREE.Group;
  mouth: THREE.Mesh;
  leftEyelid: THREE.Mesh;
  rightEyelid: THREE.Mesh;
  tassels: THREE.Object3D[];
  teacupGroup: THREE.Group;
  cupHomePos: THREE.Vector3;
  isBride: boolean;
  dispose: () => void;
}

interface CinemaPieceVisual {
  id: string;
  group: THREE.Group;
  row: number;
  col: number;
}

// Pre-allocated zero-GC scratch vectors
const _vDesiredCam = new THREE.Vector3();
const _vDesiredTarget = new THREE.Vector3();
const _vShoulderWorld = new THREE.Vector3();
const _vTargetLocal = new THREE.Vector3();
const _vHandWorld = new THREE.Vector3();
const _vMouthWorld = new THREE.Vector3();
const _vCupLerp = new THREE.Vector3();
const _vDummyMatrix = new THREE.Matrix4();
const _vDummyPos = new THREE.Vector3();
const _vDummyQuat = new THREE.Quaternion();
const _vDummyScale = new THREE.Vector3();
const _vEuler = new THREE.Euler();

const WATER_Y = -0.52;
const BRIDE_SEAT_Z = -1.78;
const GROOM_SEAT_Z = 1.78;

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function hexToRgbStr(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

/** Painted soft moonlight water shimmer texture */
function createWaterRippleTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#071426');
  grad.addColorStop(0.5, '#0b2238');
  grad.addColorStop(1, '#08182b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Delicate horizontal moonlight ripple bands
  for (let i = 0; i < 160; i++) {
    const x = (i * 73) % size;
    const y = (i * 37) % size;
    const w = 24 + (i % 48);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(170, 210, 255, 0.08)' : 'rgba(255, 224, 158, 0.05)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  return tex;
}

/** Soft radial glow texture for moon halo & candle flames */
function createRadialGlowTexture(innerHex: string, midHex: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, innerHex);
  g.addColorStop(0.32, midHex);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Painted ancient silk brocade robe texture */
function createBrocadeCanvasTexture(primaryHex: number, trimHex: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hexToRgbStr(primaryHex);
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = hexToRgbStr(trimHex, 0.4);
  ctx.lineWidth = 1.6;
  for (let y = 16; y < size; y += 32) {
    for (let x = 16; x < size; x += 32) {
      const px = (x + ((y / 32) % 2) * 16) % size;
      ctx.beginPath();
      ctx.arc(px, y, 10, Math.PI * 0.15, Math.PI * 1.15);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/** High-resolution Donghua / Wuxia painted face texture (u = 0.5 aligned to +Z) */
function createActorFaceTexture(skinColor: number, isFemale: boolean, isBride: boolean): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size * 0.5;

  // Luminous warm porcelain skin base + delicate sculpted facial shading
  ctx.fillStyle = hexToRgbStr(skinColor);
  ctx.fillRect(0, 0, size, size);

  const shade = ctx.createRadialGradient(cx, 505, 50, cx, 520, 320);
  shade.addColorStop(0, 'rgba(255,248,242,0.34)');
  shade.addColorStop(0.65, 'rgba(252,226,210,0.06)');
  shade.addColorStop(1, 'rgba(135,72,58,0.28)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  // Soft rose peach bridal blush on cheekbones
  [-1, 1].forEach((s) => {
    const blush = ctx.createRadialGradient(cx + s * 86, 548, 8, cx + s * 86, 548, 62);
    blush.addColorStop(0, isFemale ? 'rgba(242, 92, 112, 0.36)' : 'rgba(176, 102, 78, 0.14)');
    blush.addColorStop(1, 'rgba(242, 92, 112, 0)');
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.arc(cx + s * 86, 548, 62, 0, Math.PI * 2);
    ctx.fill();
  });

  // Delicate nose bridge highlight & soft tip shadow
  const noseGrad = ctx.createLinearGradient(cx, 485, cx, 575);
  noseGrad.addColorStop(0, 'rgba(255,255,255,0.28)');
  noseGrad.addColorStop(1, 'rgba(182,118,98,0.22)');
  ctx.fillStyle = noseGrad;
  ctx.beginPath();
  ctx.ellipse(cx, 535, 11, 44, 0, 0, Math.PI * 2);
  ctx.fill();

  // Expressive Classical Phoenix Eyes (Mắt Phượng) with rose eyeshadow & double catchlights
  const eyeY = isFemale ? 496 : 490;
  const eyeX = 68;
  [-1, 1].forEach((s) => {
    const ex = cx + s * eyeX;

    if (isFemale) {
      const shadow = ctx.createRadialGradient(ex + s * 8, eyeY - 4, 6, ex + s * 8, eyeY - 4, 48);
      shadow.addColorStop(0, 'rgba(218, 66, 92, 0.32)');
      shadow.addColorStop(1, 'rgba(218, 66, 92, 0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(ex + s * 8, eyeY - 4, 48, 28, s * -0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sclera
    ctx.fillStyle = '#fff9f6';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, isFemale ? 38 : 31, isFemale ? 22 : 15, s * -0.07, 0, Math.PI * 2);
    ctx.fill();

    // Rich layered amber-crimson / dark-jade iris
    const irisR = isFemale ? 20 : 14;
    const irisGrad = ctx.createRadialGradient(ex, eyeY - 3, 2, ex, eyeY, irisR);
    irisGrad.addColorStop(0, isBride ? '#c43e4c' : '#58443e');
    irisGrad.addColorStop(0.65, isBride ? '#591620' : '#231816');
    irisGrad.addColorStop(1, '#12080d');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#090408';
    ctx.beginPath();
    ctx.arc(ex, eyeY, isFemale ? 9.5 : 7, 0, Math.PI * 2);
    ctx.fill();

    // Double studio catchlights (makes eyes sparkle on camera!)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - 6, eyeY - 6, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 6, eyeY + 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Winged calligraphic upper eyeliner & eyelashes
    ctx.strokeStyle = '#12070c';
    ctx.lineWidth = isFemale ? 6.5 : 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - s * 36, eyeY + 4);
    ctx.quadraticCurveTo(ex, eyeY - (isFemale ? 28 : 18), ex + s * (isFemale ? 48 : 34), eyeY - (isFemale ? 12 : 3));
    ctx.stroke();

    // Willow-leaf arched eyebrows (Lông Mày Lá Liễu)
    ctx.strokeStyle = '#1a1015';
    ctx.lineWidth = isFemale ? 5.2 : 8.5;
    ctx.beginPath();
    ctx.moveTo(cx + s * 24, eyeY - 40);
    ctx.quadraticCurveTo(ex + s * 4, eyeY - (isFemale ? 58 : 50), cx + s * 116, eyeY - 42);
    ctx.stroke();
  });

  // Crimson-Gold Lotus Forehead Mark (Hoa Điền Tân Nương)
  if (isBride) {
    ctx.fillStyle = '#d91632';
    for (const ang of [-0.42, 0, 0.42]) {
      ctx.save();
      ctx.translate(cx, 422);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.quadraticCurveTo(9, -15, 0, 0);
      ctx.quadraticCurveTo(-9, -15, 0, -34);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffe588';
    ctx.beginPath();
    ctx.arc(cx, 412, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Plump Vermilion Cupid's-Bow Bridal Lips
  const lipY = 610;
  ctx.fillStyle = isBride ? '#d61c3a' : isFemale ? '#c84b5e' : '#a86458';
  ctx.beginPath();
  ctx.moveTo(cx - 38, lipY);
  ctx.quadraticCurveTo(cx - 14, lipY - 15, cx, lipY - 6);
  ctx.quadraticCurveTo(cx + 14, lipY - 15, cx + 38, lipY);
  ctx.quadraticCurveTo(cx, lipY + 22, cx - 38, lipY);
  ctx.fill();

  // Subtle lip gloss highlight
  ctx.fillStyle = 'rgba(255, 224, 228, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, lipY + 6, 13, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Builds a full-body seated ancient Chinese character with articulated 2-bone arms, seated legs/boots, fan & teacup! */
function buildFullBodyCinemaActor(params: {
  isBride: boolean;
  gender: GuestGender;
  skinColor: number;
  robePrimary: number;
  robeSecondary: number;
  trimColor: number;
  hairColor: number;
  accentGlow: number;
  cupHomePos: THREE.Vector3;
}): CinemaActorRig {
  const {
    isBride,
    gender,
    skinColor,
    robePrimary,
    robeSecondary,
    trimColor,
    hairColor,
    accentGlow,
    cupHomePos,
  } = params;
  const isFemale = isBride || gender === 'nu';
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  const faceTex = track(createActorFaceTexture(skinColor, isFemale, isBride));
  const robeTex = track(createBrocadeCanvasTexture(robePrimary, trimColor));

  const skinMat = track(
    new THREE.MeshPhysicalMaterial({
      color: skinColor,
      roughness: 0.56,
      metalness: 0.0,
      envMapIntensity: 0.35,
    }),
  );
  const faceMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: faceTex,
      roughness: 0.54,
      metalness: 0.0,
      envMapIntensity: 0.34,
    }),
  );
  const robeMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: robeTex,
      roughness: 0.44,
      metalness: 0.08,
      sheen: 0.7,
      sheenColor: new THREE.Color(isBride ? 0xff9a8a : trimColor),
    }),
  );
  const secMat = track(
    new THREE.MeshStandardMaterial({
      color: robeSecondary,
      roughness: 0.52,
      metalness: 0.1,
    }),
  );
  const goldMat = track(
    new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.22,
      metalness: 0.88,
    }),
  );
  const hairMat = track(
    new THREE.MeshPhysicalMaterial({
      color: hairColor,
      roughness: 0.32,
      metalness: 0.1,
      clearcoat: 0.25,
    }),
  );
  const rubyMat = track(
    new THREE.MeshStandardMaterial({
      color: accentGlow,
      emissive: accentGlow,
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.25,
    }),
  );
  const woodStoolMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b1c12,
      roughness: 0.46,
      metalness: 0.1,
    }),
  );
  const bootMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0x8f1a24 : 0x1b1922,
      roughness: 0.48,
      metalness: 0.08,
    }),
  );

  // 1. Carved Rosewood Drum Stool + Embroidered Cushion (grounded flush at y = 0)
  const stoolBody = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.32, 0.36, 0.44, 18)),
    woodStoolMat,
  );
  stoolBody.position.y = 0.22;
  stoolBody.castShadow = true;
  stoolBody.receiveShadow = true;
  root.add(stoolBody);

  const stoolTrim = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.33, 0.018, 8, 22)),
    goldMat,
  );
  stoolTrim.rotation.x = Math.PI / 2;
  stoolTrim.position.y = 0.42;
  root.add(stoolTrim);

  const cushion = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.33, 0.34, 0.08, 20)),
    isBride ? robeMat : secMat,
  );
  cushion.position.y = 0.46;
  root.add(cushion);

  // 2. Full-Body Seated Lower Robe, Articulated Knees, Shins & Boots/Embroidered Shoes!
  const hipBase = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.28, 18, 14)),
    robeMat,
  );
  hipBase.scale.set(1.12, 0.68, 0.96);
  hipBase.position.set(0, 0.56, 0.02);
  root.add(hipBase);

  const makeSeatedLeg = (sideSign: 1 | -1) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(sideSign * 0.16, 0.54, 0.12);

    // Thigh extending forward toward table
    const thigh = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.115, 0.095, 0.44, 14)),
      robeMat,
    );
    thigh.rotation.x = Math.PI * 0.48;
    thigh.rotation.z = -sideSign * 0.16;
    thigh.position.set(sideSign * 0.04, -0.02, 0.2);
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Lower shin & flowing robe trouser/skirt drape down to pavilion deck
    const shin = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.095, isFemale ? 0.135 : 0.082, 0.46, 14)),
      isFemale ? robeMat : secMat,
    );
    shin.position.set(sideSign * 0.08, -0.26, 0.41);
    shin.rotation.x = -0.08;
    shin.castShadow = true;
    legGroup.add(shin);

    // Embroidered Silk Slipper / Wuxia Boot resting cleanly on pavilion deck (y ~ 0.04)
    const shoe = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.072, 12, 10)),
      bootMat,
    );
    shoe.scale.set(0.85, 0.58, 1.55);
    shoe.position.set(sideSign * 0.09, -0.49, 0.47);
    legGroup.add(shoe);

    root.add(legGroup);
    return legGroup;
  };

  const leftKneeGroup = makeSeatedLeg(-1);
  const rightKneeGroup = makeSeatedLeg(1);

  // Flowing draped bridal/scholar skirt apron cascading between knees to the wooden floor
  const skirtDrape = new THREE.Mesh(
    track(new THREE.ConeGeometry(isFemale ? 0.48 : 0.42, 0.56, 20, 1, true)),
    robeMat,
  );
  skirtDrape.position.set(0, 0.3, 0.12);
  root.add(skirtDrape);

  // 3. Articulated Upper Torso (leans forward to move pieces / sip tea / tease!)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.62, 0);
  root.add(torsoGroup);

  const torsoPts = isFemale
    ? [
        new THREE.Vector2(0.18, 0.0),
        new THREE.Vector2(0.155, 0.16),
        new THREE.Vector2(0.21, 0.42),
        new THREE.Vector2(0.24, 0.58),
        new THREE.Vector2(0.09, 0.68),
      ]
    : [
        new THREE.Vector2(0.23, 0.0),
        new THREE.Vector2(0.25, 0.24),
        new THREE.Vector2(0.30, 0.54),
        new THREE.Vector2(0.24, 0.66),
        new THREE.Vector2(0.11, 0.72),
      ];
  const torsoMesh = new THREE.Mesh(track(new THREE.LatheGeometry(torsoPts, 22)), robeMat);
  torsoMesh.scale.set(1.04, 1.0, 0.68);
  torsoMesh.castShadow = true;
  torsoGroup.add(torsoMesh);

  // Waist gold sash & jade/ruby clasp
  const sash = new THREE.Mesh(
    track(new THREE.TorusGeometry(isFemale ? 0.168 : 0.235, 0.032, 8, 22)),
    secMat,
  );
  sash.rotation.x = Math.PI / 2;
  sash.scale.set(1.05, 0.74, 1);
  sash.position.y = 0.14;
  torsoGroup.add(sash);

  const beltGold = new THREE.Mesh(
    track(new THREE.OctahedronGeometry(0.044, 0)),
    goldMat,
  );
  beltGold.scale.set(1, 1.3, 0.42);
  beltGold.position.set(0, 0.14, isFemale ? 0.15 : 0.19);
  torsoGroup.add(beltGold);

  // Bridal off-shoulder collarbone & gold necklace for female / crossed lapel for male
  const tassels: THREE.Object3D[] = [];
  if (isFemale) {
    const chestSkin = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.11, 0.22, 0.2, 18)),
      skinMat,
    );
    chestSkin.scale.set(1.06, 1, 0.64);
    chestSkin.position.set(0, 0.58, 0.02);
    torsoGroup.add(chestSkin);

    const necklace = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.115, 0.008, 8, 20, Math.PI)),
      goldMat,
    );
    necklace.position.set(0, 0.61, 0.075);
    necklace.rotation.set(1.2, 0, Math.PI);
    torsoGroup.add(necklace);

    // Floating red-gold bridal silk Pibo scarf behind shoulders
    const piboCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.34, 0.12, 0.1),
      new THREE.Vector3(-0.42, 0.56, -0.08),
      new THREE.Vector3(0, 0.86, -0.22),
      new THREE.Vector3(0.42, 0.56, -0.08),
      new THREE.Vector3(0.34, 0.12, 0.1),
    ]);
    const piboMat = track(
      new THREE.MeshStandardMaterial({
        color: isBride ? 0x9c1022 : robePrimary,
        emissive: isBride ? 0x33040a : 0x000000,
        roughness: 0.42,
        transparent: true,
        opacity: 0.86,
      }),
    );
    const pibo = new THREE.Mesh(track(new THREE.TubeGeometry(piboCurve, 28, 0.026, 7, false)), piboMat);
    torsoGroup.add(pibo);
    tassels.push(pibo);
  } else {
    const lapelGeo = track(new THREE.BoxGeometry(0.08, 0.5, 0.04));
    [-1, 1].forEach((s) => {
      const lap = new THREE.Mesh(lapelGeo, secMat);
      lap.position.set(s * 0.055, 0.39, 0.175);
      lap.rotation.set(-0.15, -s * 0.12, s * 0.3);
      torsoGroup.add(lap);
    });
  }

  // 4. Two-Segment Articulated Arms (Shoulder -> Upper Arm -> Elbow -> Forearm + Wide Sleeve -> Hand)
  const makeArticulatedArm = (sideSign: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideSign * (isFemale ? 0.245 : 0.305), 0.56, 0.01);
    torsoGroup.add(shoulder);

    // Upper arm pointing along -Y in local space (length = 0.34)
    const upperArm = new THREE.Mesh(
      track(new THREE.CylinderGeometry(isFemale ? 0.056 : 0.078, isFemale ? 0.05 : 0.072, 0.34, 12)),
      robeMat,
    );
    upperArm.position.y = -0.17;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);

    // Forearm + flared flowing Hanfu silk sleeve (length = 0.34 along -Y)
    const forearm = new THREE.Mesh(
      track(new THREE.CylinderGeometry(isFemale ? 0.045 : 0.064, isFemale ? 0.036 : 0.052, 0.32, 12)),
      isFemale ? skinMat : robeMat,
    );
    forearm.position.y = -0.16;
    elbow.add(forearm);

    const wideSleeve = new THREE.Mesh(
      track(new THREE.CylinderGeometry(isFemale ? 0.055 : 0.078, isFemale ? 0.145 : 0.14, 0.28, 14, 1, true)),
      robeMat,
    );
    wideSleeve.position.set(0, -0.14, -0.02);
    elbow.add(wideSleeve);

    const wristGold = new THREE.Mesh(
      track(new THREE.TorusGeometry(isFemale ? 0.04 : 0.056, 0.008, 8, 14)),
      goldMat,
    );
    wristGold.rotation.x = Math.PI / 2;
    wristGold.position.y = -0.31;
    elbow.add(wristGold);

    const hand = new THREE.Mesh(
      track(new THREE.SphereGeometry(isFemale ? 0.04 : 0.052, 12, 10)),
      skinMat,
    );
    hand.scale.set(0.82, 1.25, 0.62);
    hand.position.y = -0.355;
    elbow.add(hand);

    const handTip = new THREE.Object3D();
    handTip.position.set(0, -0.38, 0.02);
    elbow.add(handTip);

    return { shoulder, elbow, handTip };
  };

  // NOTE: In character local space facing +Z, character's RIGHT side is -X and LEFT side is +X!
  const rightArm = makeArticulatedArm(-1);
  const leftArm = makeArticulatedArm(1);

  // Ornate Crimson-Gold Silk Folding Fan (Quạt Lụa Hoa Chúc) held in Bride's Left Hand!
  let fanGroup: THREE.Group | undefined;
  if (isBride) {
    fanGroup = new THREE.Group();
    fanGroup.position.set(0.01, -0.36, 0.04);
    const fanMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xc2162b,
        emissive: 0x45060e,
        roughness: 0.36,
        side: THREE.DoubleSide,
      }),
    );
    const fanBlade = new THREE.Mesh(
      track(new THREE.CircleGeometry(0.31, 18, Math.PI * 0.14, Math.PI * 0.72)),
      fanMat,
    );
    fanBlade.position.set(0, 0.02, 0);
    fanGroup.add(fanBlade);

    const fanRim = new THREE.Mesh(
      track(new THREE.RingGeometry(0.285, 0.314, 18, 1, Math.PI * 0.14, Math.PI * 0.72)),
      goldMat,
    );
    fanRim.position.set(0, 0.02, 0.003);
    fanGroup.add(fanRim);

    const fanInnerArc = new THREE.Mesh(
      track(new THREE.RingGeometry(0.15, 0.165, 16, 1, Math.PI * 0.16, Math.PI * 0.68)),
      goldMat,
    );
    fanInnerArc.position.set(0, 0.02, 0.003);
    fanGroup.add(fanInnerArc);

    const fanHandle = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.01, 0.013, 0.19, 8)),
      goldMat,
    );
    fanHandle.position.set(0, 0.04, 0);
    fanGroup.add(fanHandle);

    leftArm.elbow.add(fanGroup);
  }

  // 5. Sculpted Head, Hair, Phoenix Bridal Crown / Scholar Guan, Blink & Lip-Sync Mouth
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.72, 0.01);
  torsoGroup.add(headGroup);

  const neck = new THREE.Mesh(
    track(new THREE.CylinderGeometry(isFemale ? 0.055 : 0.072, isFemale ? 0.07 : 0.086, 0.14, 14)),
    skinMat,
  );
  neck.position.y = 0.02;
  headGroup.add(neck);

  const headGeo = track(new THREE.SphereGeometry(0.182, 32, 24, -Math.PI / 2, Math.PI * 2));
  const headMesh = new THREE.Mesh(headGeo, faceMat);
  headMesh.scale.set(isFemale ? 0.87 : 0.93, isFemale ? 1.07 : 1.09, 0.95);
  headMesh.position.y = 0.22;
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Subtle sculpted nose bridge & ears for 3D film depth
  const noseMesh = new THREE.Mesh(track(new THREE.ConeGeometry(0.016, 0.036, 8)), skinMat);
  noseMesh.rotation.x = Math.PI * 0.42;
  noseMesh.position.set(0, 0.205, 0.172);
  headGroup.add(noseMesh);

  // Eyelids & Speaking Mouth
  const lidGeo = track(new THREE.SphereGeometry(0.034, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const leftEyelid = new THREE.Mesh(lidGeo, skinMat);
  leftEyelid.position.set(-0.058, 0.232, 0.155);
  leftEyelid.visible = false;
  headGroup.add(leftEyelid);

  const rightEyelid = new THREE.Mesh(lidGeo, skinMat);
  rightEyelid.position.set(0.058, 0.232, 0.155);
  rightEyelid.visible = false;
  headGroup.add(rightEyelid);

  const mouth = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.018, 10, 8)),
    track(new THREE.MeshStandardMaterial({ color: 0x841426, roughness: 0.35 })),
  );
  mouth.scale.set(1.15, 0.12, 0.35);
  mouth.position.set(0, 0.15, 0.165);
  mouth.visible = false;
  headGroup.add(mouth);

  // Sculpted Silky Hair Cap, Flowing Cheek-Framing Side Locks & Cascading Back Hair
  const hairCap = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.188, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56)),
    hairMat,
  );
  hairCap.scale.set(0.92, 1.06, 0.98);
  hairCap.position.set(0, 0.242, -0.025);
  hairCap.rotation.x = -0.32;
  headGroup.add(hairCap);

  // Flowing side-bang locks framing the cheekbones (eliminates doll-head look!)
  [-1, 1].forEach((s) => {
    const lockCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.04, 0.37, 0.14),
      new THREE.Vector3(s * 0.155, 0.27, 0.11),
      new THREE.Vector3(s * 0.165, 0.12, 0.08),
      new THREE.Vector3(s * 0.145, isFemale ? -0.08 : 0.02, 0.06),
    ]);
    const lockMesh = new THREE.Mesh(
      track(new THREE.TubeGeometry(lockCurve, 14, isFemale ? 0.026 : 0.02, 8, false)),
      hairMat,
    );
    headGroup.add(lockMesh);
  });

  const backHair = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.14, isFemale ? 0.25 : 0.18, isFemale ? 0.62 : 0.44, 16, 1, true, Math.PI * 0.45, Math.PI * 1.1)),
    hairMat,
  );
  backHair.position.set(0, -0.02, -0.065);
  headGroup.add(backHair);

  if (isBride) {
    // Ornate Multi-Tiered Golden Phoenix Bridal Crown (Phượng Quan Hoa Chúc) + Ruby Pearls
    const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.095, 16, 12)), hairMat);
    bun.position.set(0, 0.425, -0.02);
    headGroup.add(bun);

    const crownArch = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.122, 0.017, 8, 22, Math.PI * 1.15)),
      goldMat,
    );
    crownArch.position.set(0, 0.405, 0.052);
    crownArch.rotation.z = -Math.PI * 0.08;
    headGroup.add(crownArch);

    const crownInner = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.085, 0.012, 8, 18, Math.PI * 1.1)),
      goldMat,
    );
    crownInner.position.set(0, 0.455, 0.056);
    crownInner.rotation.z = -Math.PI * 0.05;
    headGroup.add(crownInner);

    const crownRuby = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.034, 0)), rubyMat);
    crownRuby.scale.set(0.85, 1.35, 0.52);
    crownRuby.position.set(0, 0.51, 0.065);
    headGroup.add(crownRuby);

    [-1, 1].forEach((s) => {
      const pin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.006, 0.01, 0.31, 6)), goldMat);
      pin.position.set(s * 0.085, 0.43, -0.01);
      pin.rotation.z = s * 1.12;
      headGroup.add(pin);

      const tassel = new THREE.Group();
      tassel.position.set(s * 0.215, 0.46, 0.02);
      const chain = new THREE.Mesh(track(new THREE.CylinderGeometry(0.0045, 0.0045, 0.16, 6)), goldMat);
      chain.position.y = -0.08;
      tassel.add(chain);
      const drop = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.018, 0)), rubyMat);
      drop.position.y = -0.17;
      tassel.add(drop);
      headGroup.add(tassel);
      tassels.push(tassel);
    });
  } else {
    // Groom Topknot + Golden Scholar Guan Crown
    const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.068, 12, 10)), hairMat);
    bun.position.set(0, 0.43, -0.015);
    headGroup.add(bun);
    const guan = new THREE.Mesh(track(new THREE.CylinderGeometry(0.064, 0.056, 0.095, 12)), goldMat);
    guan.position.set(0, 0.43, -0.015);
    headGroup.add(guan);
    const pin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.007, 0.007, 0.25, 6)), goldMat);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0, 0.44, -0.015);
    headGroup.add(pin);
  }

  // 6. Personal Porcelain Teacup (lives in world space, attaches to actor's hand during sip_tea!)
  const teacupGroup = new THREE.Group();
  const porcelainMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xeaf4ee,
      roughness: 0.16,
      metalness: 0.05,
      clearcoat: 0.9,
    }),
  );
  const teaLiquidMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xb67b2a,
      roughness: 0.15,
      metalness: 0.1,
    }),
  );
  const cupPts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.032, 0),
    new THREE.Vector2(0.048, 0.035),
    new THREE.Vector2(0.052, 0.065),
    new THREE.Vector2(0.046, 0.065),
    new THREE.Vector2(0.04, 0.02),
    new THREE.Vector2(0.001, 0.012),
  ];
  const cupMesh = new THREE.Mesh(track(new THREE.LatheGeometry(cupPts, 16)), porcelainMat);
  teacupGroup.add(cupMesh);

  const teaDisc = new THREE.Mesh(track(new THREE.CircleGeometry(0.044, 14)), teaLiquidMat);
  teaDisc.rotation.x = -Math.PI / 2;
  teaDisc.position.y = 0.052;
  teacupGroup.add(teaDisc);

  const cupRim = new THREE.Mesh(track(new THREE.TorusGeometry(0.05, 0.004, 6, 16)), goldMat);
  cupRim.rotation.x = Math.PI / 2;
  cupRim.position.y = 0.064;
  teacupGroup.add(cupRim);
  teacupGroup.position.copy(cupHomePos);

  return {
    root,
    torsoGroup,
    headGroup,
    leftKneeGroup,
    rightKneeGroup,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    rightHandTip: rightArm.handTip,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    leftHandTip: leftArm.handTip,
    fanGroup,
    mouth,
    leftEyelid,
    rightEyelid,
    tassels,
    teacupGroup,
    cupHomePos: cupHomePos.clone(),
    isBride,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export class PavilionCinemaStage {
  private readonly container: HTMLElement;
  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly currentCamPos = new THREE.Vector3(3.45, 1.98, 2.75);
  private readonly currentCamTarget = new THREE.Vector3(-0.25, 1.24, -0.35);

  private readonly director: CinemaDirectorState = createInitialCinemaDirector();
  private readonly brideRig: CinemaActorRig;
  private groomRig: CinemaActorRig;

  private readonly piecesGroup = new THREE.Group();
  private readonly pieceVisuals = new Map<string, CinemaPieceVisual>();
  private readonly pieceFaceTextures = new Map<string, THREE.CanvasTexture>();
  private readonly pieceBodyGeo: THREE.LatheGeometry;
  private readonly pieceTopGeo: THREE.CircleGeometry;
  private readonly redPieceMat: THREE.MeshStandardMaterial;
  private readonly blackPieceMat: THREE.MeshStandardMaterial;

  private readonly lanterns: THREE.Group[] = [];
  private readonly waterLanterns: Array<{ group: THREE.Group; baseAngle: number; radius: number; speed: number }> = [];
  private readonly candleFlames: THREE.Mesh[] = [];
  private readonly steamWisps: Array<{ mesh: THREE.Mesh; baseX: number; baseZ: number; phase: number }> = [];
  private waterTex!: THREE.CanvasTexture;
  private fireflyInstanced!: THREE.InstancedMesh;
  private readonly fireflySeeds: Array<{ angle: number; radius: number; y: number; speed: number }> = [];

  private requestedAngle: CinemaCameraAngle = 'auto';
  private hostEmotion: HostEmotion = 'amused';
  private isSpeaking = false;
  private botThinking = false;
  private inCheck = false;
  private latestMoveEvent: MoveChoreoPayload | null = null;
  private latestActionCue: ActionCuePayload | null = null;
  private onTelemetry?: (t: PavilionCinemaTelemetry) => void;
  private lastTelemetryKey = '';

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly resizeObserver: ResizeObserver;
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();

  constructor(
    container: HTMLElement,
    initialBoard: BoardState,
    initialGuest: WuxiaCharacterProfile,
    onTelemetry?: (t: PavilionCinemaTelemetry) => void,
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    // 1. Renderer with Software-WebGL guard & ACESFilmic cinematic tone mapping
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Moonlit Twilight Sky & RoomEnvironment PBR Reflections
    this.scene = new THREE.Scene();
    const skyColor = 0x0d1830;
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.FogExp2(skyColor, 0.022);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex);
    pmrem.dispose();

    // 3. Cinema Camera
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.12, 110);
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentCamTarget);

    // 4. Warm Bridal Lanterns vs Cool Silvery Moonlight 3-Point Cinema Rig
    const hemi = new THREE.HemisphereLight(0x98c0ff, 0x30181c, 1.05);
    this.scene.add(hemi);

    const moonKey = new THREE.DirectionalLight(0xb2d2ff, 1.45);
    moonKey.position.set(-5.0, 8.5, -11.0);
    moonKey.castShadow = !this.isSoftwareGl;
    moonKey.shadow.mapSize.set(1024, 1024);
    moonKey.shadow.camera.left = -5;
    moonKey.shadow.camera.right = 5;
    moonKey.shadow.camera.top = 5;
    moonKey.shadow.camera.bottom = -5;
    moonKey.shadow.bias = -0.0005;
    moonKey.shadow.normalBias = 0.02;
    this.scene.add(moonKey);

    // Warm golden bridal lantern illumination inside the pavilion
    const pavilionWarm = new THREE.PointLight(0xffb866, 2.7, 12.5, 1.35);
    pavilionWarm.position.set(0, 3.05, 0);
    this.scene.add(pavilionWarm);

    // Warm rose-gold key light directly illuminating Tân Nương Áo Đỏ & teacup!
    const brideBeautyKey = new THREE.PointLight(0xffc99e, 1.85, 7.2, 1.4);
    brideBeautyKey.position.set(0.75, 1.85, -0.45);
    this.scene.add(brideBeautyKey);

    const groomFill = new THREE.PointLight(0xffd2a8, 1.45, 7.2, 1.5);
    groomFill.position.set(-0.75, 1.8, 1.05);
    this.scene.add(groomFill);

    // 5. Build Moonlit Lotus Lake + Ancient Octagonal Pavilion + Rosewood Chess Table & Tea Set
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.buildMoonlitLotusLake();
    this.buildAncientPavilion(maxAniso);

    // 6. Shared Chess Piece Geometries & Materials (synced live with real game!)
    const pRadius = CINEMA_CELL_W * 0.42;
    const lathePts = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(pRadius * 0.94, 0),
      new THREE.Vector2(pRadius, 0.015),
      new THREE.Vector2(pRadius, 0.048),
      new THREE.Vector2(pRadius * 0.9, 0.062),
      new THREE.Vector2(0.001, 0.062),
    ];
    this.pieceBodyGeo = new THREE.LatheGeometry(lathePts, 18);
    this.pieceTopGeo = new THREE.CircleGeometry(pRadius * 0.88, 18);
    this.redPieceMat = new THREE.MeshStandardMaterial({
      color: 0xa8161c,
      roughness: 0.24,
      metalness: 0.14,
    });
    this.blackPieceMat = new THREE.MeshStandardMaterial({
      color: 0x16141e,
      roughness: 0.28,
      metalness: 0.26,
    });
    this.disposables.push(
      this.pieceBodyGeo,
      this.pieceTopGeo,
      this.redPieceMat,
      this.blackPieceMat,
    );
    this.scene.add(this.piecesGroup);

    // 7. Build Full-Body Articulated Seated Couple (Tân Nương Áo Đỏ & Tân Lang)
    this.brideRig = buildFullBodyCinemaActor({
      isBride: true,
      gender: 'nu',
      skinColor: BOT_MASTER_PROFILE.skinColor,
      robePrimary: 0x9b1222,
      robeSecondary: 0x260c14,
      trimColor: 0xefc96e,
      hairColor: 0x141016,
      accentGlow: 0xff4b66,
      cupHomePos: new THREE.Vector3(-0.92, CINEMA_TABLE_Y + 0.01, -0.62),
    });
    this.brideRig.root.position.set(0, 0, BRIDE_SEAT_Z);
    this.scene.add(this.brideRig.root);
    this.scene.add(this.brideRig.teacupGroup);

    this.groomRig = this.createGroomRig(initialGuest);
    this.scene.add(this.groomRig.root);
    this.scene.add(this.groomRig.teacupGroup);

    // 8. Populate initial 32 chess pieces on the pavilion table
    this.syncBoard(initialBoard);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Immediate first frame draw so pane is NEVER blank on initial paint!
    this.renderer.render(this.scene, this.camera);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.tick();
  }

  private createGroomRig(profile: WuxiaCharacterProfile): CinemaActorRig {
    const rig = buildFullBodyCinemaActor({
      isBride: false,
      gender: profile.gender,
      skinColor: profile.skinColor,
      robePrimary: profile.robePrimary,
      robeSecondary: profile.robeSecondary,
      trimColor: profile.trimColor,
      hairColor: profile.hairColor,
      accentGlow: profile.accentGlow,
      cupHomePos: new THREE.Vector3(0.92, CINEMA_TABLE_Y + 0.01, 0.62),
    });
    rig.root.position.set(0, 0, GROOM_SEAT_Z);
    rig.root.rotation.y = Math.PI; // Faces -Z directly across the chess board toward Tân Nương!
    return rig;
  }

  private buildMoonlitLotusLake() {
    // 0. Twilight Starry Moonlit Sky Dome (rich midnight-indigo to silver-mist horizon!)
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const sctx = skyCanvas.getContext('2d')!;
    const sgrad = sctx.createLinearGradient(0, 0, 0, 512);
    sgrad.addColorStop(0.0, '#050b1c');
    sgrad.addColorStop(0.35, '#0d1d3b');
    sgrad.addColorStop(0.54, '#1b355c');
    sgrad.addColorStop(0.62, '#2d4b70');
    sgrad.addColorStop(1.0, '#0a162b');
    sctx.fillStyle = sgrad;
    sctx.fillRect(0, 0, 512, 512);
    // Subtle silver stars in upper sky hemisphere
    for (let i = 0; i < 140; i++) {
      const sx = (i * 97) % 512;
      const sy = (i * 41) % 245;
      const sr = i % 5 === 0 ? 1.8 : 1.0;
      sctx.fillStyle = i % 4 === 0 ? 'rgba(255, 240, 200, 0.78)' : 'rgba(215, 232, 255, 0.65)';
      sctx.beginPath();
      sctx.arc(sx, sy, sr, 0, Math.PI * 2);
      sctx.fill();
    }
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyDomeGeo = new THREE.SphereGeometry(54, 24, 16);
    const skyDomeMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
    const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
    this.scene.add(skyDome);
    this.disposables.push(skyTex, skyDomeGeo, skyDomeMat);

    // 1. Vast Shimmering Moonlit Lotus Pond Water Plane
    this.waterTex = createWaterRippleTexture();
    const waterGeo = new THREE.CircleGeometry(46, 48);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x163658,
      map: this.waterTex,
      roughness: 0.14,
      metalness: 0.62,
      envMapIntensity: 0.95,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    this.scene.add(water);
    this.disposables.push(this.waterTex, waterGeo, waterMat);

    // 2. Huge Luminous Harvest Full Moon positioned RIGHT in the Hero Skyline + Shimmering Lake Reflection!
    const moonGlowTex = createRadialGlowTexture(
      'rgba(255, 248, 222, 0.98)',
      'rgba(218, 232, 255, 0.42)',
    );
    const moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(2.75, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff5da, fog: false }),
    );
    moonDisc.position.set(-2.9, 3.65, -21.5);
    this.scene.add(moonDisc);

    const moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonGlowTex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        fog: false,
      }),
    );
    moonHalo.position.set(-2.9, 3.65, -21.8);
    moonHalo.scale.set(14.5, 14.5, 1);
    this.scene.add(moonHalo);

    // Bright Shimmering Moonbeam Reflection Ribbon stretching across the Lotus Pond!
    const moonReflGeo = new THREE.PlaneGeometry(4.2, 18);
    const moonReflMat = new THREE.MeshBasicMaterial({
      map: moonGlowTex,
      color: 0xfff0c4,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const moonRefl = new THREE.Mesh(moonReflGeo, moonReflMat);
    moonRefl.rotation.x = -Math.PI / 2;
    moonRefl.rotation.z = 0.16;
    moonRefl.position.set(-1.9, WATER_Y + 0.015, -10.8);
    this.scene.add(moonRefl);
    this.disposables.push(
      moonGlowTex,
      moonDisc.geometry,
      moonDisc.material as THREE.Material,
      moonHalo.material,
      moonReflGeo,
      moonReflMat,
    );

    // 3. Soft Misty Layered Ink-Wash Lakeside Hills (graceful rounded silhouettes, leaving Moon skyline clear!)
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x13223c,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.disposables.push(hillMat);
    const hillSpecs: Array<[number, number, number, number]> = [
      [-15, -22, 11, 5.2],
      [9, -23, 12, 6.2],
      [-22, -8, 10, 4.8],
      [21, -9, 11, 5.5],
      [-16, 17, 11, 5.0],
      [15, 18, 12, 5.4],
    ];
    for (const [hx, hz, hr, hh] of hillSpecs) {
      const geo = new THREE.SphereGeometry(hr, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const m = new THREE.Mesh(geo, hillMat);
      m.scale.set(1.2, hh / hr, 0.85);
      m.position.set(hx, WATER_Y - 0.3, hz);
      this.scene.add(m);
      this.disposables.push(geo);
    }

    // 4. Instanced Lush Emerald Floating Lotus Pads (68 pads framing the pavilion pond!)
    const padCount = 68;
    const padGeo = new THREE.CylinderGeometry(0.46, 0.44, 0.028, 16, 1, false, 0, Math.PI * 1.88);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x2f7d52,
      roughness: 0.56,
      metalness: 0.05,
    });
    const padInst = new THREE.InstancedMesh(padGeo, padMat, padCount);
    const padColor = new THREE.Color();
    for (let i = 0; i < padCount; i++) {
      const ring = 4.5 + (i % 10) * 0.72 + Math.sin(i * 2.1) * 0.3;
      const angle = (i / padCount) * Math.PI * 2 + (i % 3) * 0.14;
      const sc = 0.72 + ((i * 19) % 10) * 0.085;
      _vDummyPos.set(Math.cos(angle) * ring, WATER_Y + 0.022, Math.sin(angle) * ring);
      _vEuler.set(0, angle + i, 0);
      _vDummyQuat.setFromEuler(_vEuler);
      _vDummyScale.set(sc, 1, sc);
      _vDummyMatrix.compose(_vDummyPos, _vDummyQuat, _vDummyScale);
      padInst.setMatrixAt(i, _vDummyMatrix);
      padColor.setHSL(0.39 + (i % 5) * 0.014, 0.52, 0.28 + (i % 4) * 0.04);
      padInst.setColorAt(i, padColor);
    }
    padInst.instanceMatrix.needsUpdate = true;
    if (padInst.instanceColor) padInst.instanceColor.needsUpdate = true;
    padInst.computeBoundingSphere();
    this.scene.add(padInst);
    this.disposables.push(padGeo, padMat);

    // 5. Instanced Luminous Blooming Pink & Ivory Lotus Flowers (28 rich blossoms with golden hearts!)
    const flowerCount = 28;
    const petalOuterGeo = new THREE.ConeGeometry(0.24, 0.2, 8);
    petalOuterGeo.rotateX(Math.PI);
    const petalOuterMat = new THREE.MeshStandardMaterial({
      color: 0xffadc4,
      emissive: 0x6b1e36,
      emissiveIntensity: 0.45,
      roughness: 0.38,
    });
    const heartGeo = new THREE.SphereGeometry(0.085, 8, 6);
    const heartMat = new THREE.MeshStandardMaterial({
      color: 0xffe07d,
      emissive: 0xc27b19,
      emissiveIntensity: 0.65,
      roughness: 0.34,
    });
    const flowerInst = new THREE.InstancedMesh(petalOuterGeo, petalOuterMat, flowerCount);
    const heartInst = new THREE.InstancedMesh(heartGeo, heartMat, flowerCount);
    const fCol = new THREE.Color();
    for (let i = 0; i < flowerCount; i++) {
      const ring = 4.65 + (i % 6) * 0.95;
      const angle = (i / flowerCount) * Math.PI * 2 + 0.18;
      const sc = 0.88 + (i % 4) * 0.15;
      const fx = Math.cos(angle) * ring;
      const fz = Math.sin(angle) * ring;
      _vDummyPos.set(fx, WATER_Y + 0.14, fz);
      _vEuler.set(0, i * 0.9, 0);
      _vDummyQuat.setFromEuler(_vEuler);
      _vDummyScale.set(sc, sc, sc);
      _vDummyMatrix.compose(_vDummyPos, _vDummyQuat, _vDummyScale);
      flowerInst.setMatrixAt(i, _vDummyMatrix);
      fCol.setHex(i % 3 === 0 ? 0xfff0f6 : 0xff9eba);
      flowerInst.setColorAt(i, fCol);

      _vDummyPos.set(fx, WATER_Y + 0.18, fz);
      _vDummyMatrix.compose(_vDummyPos, _vDummyQuat, _vDummyScale);
      heartInst.setMatrixAt(i, _vDummyMatrix);
    }
    flowerInst.instanceMatrix.needsUpdate = true;
    if (flowerInst.instanceColor) flowerInst.instanceColor.needsUpdate = true;
    heartInst.instanceMatrix.needsUpdate = true;
    flowerInst.computeBoundingSphere();
    heartInst.computeBoundingSphere();
    this.scene.add(flowerInst, heartInst);
    this.disposables.push(petalOuterGeo, petalOuterMat, heartGeo, heartMat);

    // 6. Floating Bridal Water Lanterns (Hoa Đăng) drifting slowly around the lotus lake!
    const wlPetalMat = new THREE.MeshStandardMaterial({
      color: 0xff9b70,
      emissive: 0xff6230,
      emissiveIntensity: 1.45,
      roughness: 0.36,
    });
    const wlCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff2ba });
    const wlBaseGeo = new THREE.CylinderGeometry(0.17, 0.12, 0.05, 8);
    const wlFlameGeo = new THREE.SphereGeometry(0.072, 8, 6);
    this.disposables.push(wlPetalMat, wlCoreMat, wlBaseGeo, wlFlameGeo);

    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(wlBaseGeo, wlPetalMat);
      base.position.y = 0.028;
      g.add(base);
      const flame = new THREE.Mesh(wlFlameGeo, wlCoreMat);
      flame.position.y = 0.09;
      g.add(flame);
      const baseAngle = (i / 12) * Math.PI * 2 + 0.35;
      const radius = 5.1 + (i % 4) * 1.35;
      g.position.set(Math.cos(baseAngle) * radius, WATER_Y + 0.025, Math.sin(baseAngle) * radius);
      this.scene.add(g);
      this.waterLanterns.push({ group: g, baseAngle, radius, speed: 0.04 + (i % 3) * 0.015 });
    }

    // 7. Ambient Moonlight Fireflies / Golden Petals
    const ffCount = 42;
    const ffGeo = new THREE.SphereGeometry(0.024, 6, 6);
    const ffMat = new THREE.MeshBasicMaterial({ color: 0xffe89e });
    this.fireflyInstanced = new THREE.InstancedMesh(ffGeo, ffMat, ffCount);
    this.fireflyInstanced.frustumCulled = false;
    for (let i = 0; i < ffCount; i++) {
      this.fireflySeeds.push({
        angle: (i / ffCount) * Math.PI * 2,
        radius: 1.8 + (i % 8) * 0.72,
        y: 0.4 + ((i * 13) % 24) * 0.12,
        speed: 0.12 + (i % 5) * 0.04,
      });
    }
    this.scene.add(this.fireflyInstanced);
    this.disposables.push(ffGeo, ffMat);
  }

  private buildAncientPavilion(maxAniso: number) {
    const deckWoodMat = new THREE.MeshStandardMaterial({
      color: 0x3b261d,
      roughness: 0.74,
      metalness: 0.05,
    });
    const stoneTrimMat = new THREE.MeshStandardMaterial({
      color: 0x4b4c57,
      roughness: 0.82,
      metalness: 0.08,
    });
    const crimsonWoodMat = new THREE.MeshStandardMaterial({
      color: 0x7a1a18,
      roughness: 0.38,
      metalness: 0.12,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd9ad58,
      roughness: 0.24,
      metalness: 0.88,
    });
    const roofTileMat = new THREE.MeshStandardMaterial({
      color: 0x1a2232,
      roughness: 0.56,
      metalness: 0.24,
    });
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xff9f52,
      emissive: 0xff5a26,
      emissiveIntensity: 1.65,
      roughness: 0.45,
    });
    this.disposables.push(
      deckWoodMat,
      stoneTrimMat,
      crimsonWoodMat,
      goldMat,
      roofTileMat,
      lanternMat,
    );

    // 1. Wide Octagonal Ancient Pavilion Timber Deck over Water Pilings (top flush at y = 0)
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(4.05, 4.28, 0.26, 8),
      deckWoodMat,
    );
    deck.position.y = -0.13;
    deck.receiveShadow = true;
    this.scene.add(deck);

    const deckRim = new THREE.Mesh(
      new THREE.TorusGeometry(4.06, 0.09, 8, 8),
      stoneTrimMat,
    );
    deckRim.rotation.x = Math.PI / 2;
    deckRim.rotation.z = Math.PI / 8;
    deckRim.position.y = 0.01;
    this.scene.add(deckRim);
    this.disposables.push(deck.geometry, deckRim.geometry);

    // Water pilings beneath the octagonal deck
    const pilingGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.9, 10);
    this.disposables.push(pilingGeo);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pil = new THREE.Mesh(pilingGeo, deckWoodMat);
      pil.position.set(Math.cos(a) * 3.7, -0.58, Math.sin(a) * 3.7);
      this.scene.add(pil);
    }

    // Background Arched Moon Bridge curving across the lotus lake!
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 6.4), deckWoodMat);
    bridgeDeck.position.set(-5.8, -0.1, -5.8);
    bridgeDeck.rotation.y = Math.PI * 0.25;
    this.scene.add(bridgeDeck);
    const bridgeRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 6.4), crimsonWoodMat);
    bridgeRail.position.set(-5.25, 0.14, -6.35);
    bridgeRail.rotation.y = Math.PI * 0.25;
    this.scene.add(bridgeRail);
    this.disposables.push(bridgeDeck.geometry, bridgeRail.geometry);

    // 2. Four Wide-Set Vermilion Lacquer Pillars (ZERO camera obstruction!) + Swaying Wedding Lanterns
    const pillarPos: Array<[number, number]> = [
      [-3.05, -3.05],
      [3.05, -3.05],
      [-3.05, 3.05],
      [3.05, 3.05],
    ];
    const plinthGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.24, 8);
    const shaftGeo = new THREE.CylinderGeometry(0.11, 0.125, 4.35, 14);
    const collarGeo = new THREE.TorusGeometry(0.13, 0.022, 8, 14);
    const lBodyGeo = new THREE.SphereGeometry(0.21, 14, 12);
    const lCapGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.042, 10);
    this.disposables.push(plinthGeo, shaftGeo, collarGeo, lBodyGeo, lCapGeo);

    pillarPos.forEach(([px, pz]) => {
      const g = new THREE.Group();
      g.position.set(px, 0, pz);

      const pl = new THREE.Mesh(plinthGeo, stoneTrimMat);
      pl.position.y = 0.12;
      g.add(pl);

      const sh = new THREE.Mesh(shaftGeo, crimsonWoodMat);
      sh.position.y = 2.36;
      sh.castShadow = true;
      g.add(sh);

      const col = new THREE.Mesh(collarGeo, goldMat);
      col.rotation.x = Math.PI / 2;
      col.position.y = 0.26;
      g.add(col);

      // Swaying Red Bridal Silk Lantern suspended gracefully inside eave corner
      const dirX = px < 0 ? 1 : -1;
      const dirZ = pz < 0 ? 1 : -1;
      const lGroup = new THREE.Group();
      lGroup.position.set(dirX * 0.52, 3.55, dirZ * 0.52);

      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), goldMat);
      cord.position.y = -0.18;
      lGroup.add(cord);

      const body = new THREE.Mesh(lBodyGeo, lanternMat);
      body.scale.set(1, 1.32, 1);
      body.position.y = -0.56;
      lGroup.add(body);

      const topC = new THREE.Mesh(lCapGeo, goldMat);
      topC.position.y = -0.32;
      lGroup.add(topC);

      const botC = new THREE.Mesh(lCapGeo, goldMat);
      botC.position.y = -0.8;
      lGroup.add(botC);

      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.035, 0.28, 8), crimsonWoodMat);
      tassel.position.y = -0.96;
      lGroup.add(tassel);

      this.disposables.push(cord.geometry, tassel.geometry);
      g.add(lGroup);
      this.lanterns.push(lGroup);
      this.scene.add(g);
    });

    // Low carved vermilion lattice railing along the back/left edge (frames the moonlit lotus lake!)
    const railBeamGeo = new THREE.BoxGeometry(5.9, 0.07, 0.09);
    const railBackTop = new THREE.Mesh(railBeamGeo, crimsonWoodMat);
    railBackTop.position.set(0, 0.58, -3.22);
    this.scene.add(railBackTop);
    const railBackMid = new THREE.Mesh(railBeamGeo, crimsonWoodMat);
    railBackMid.position.set(0, 0.28, -3.22);
    this.scene.add(railBackMid);

    const railLeftTop = new THREE.Mesh(railBeamGeo, crimsonWoodMat);
    railLeftTop.rotation.y = Math.PI / 2;
    railLeftTop.position.set(-3.22, 0.58, 0);
    this.scene.add(railLeftTop);
    const railLeftMid = new THREE.Mesh(railBeamGeo, crimsonWoodMat);
    railLeftMid.rotation.y = Math.PI / 2;
    railLeftMid.position.set(-3.22, 0.28, 0);
    this.scene.add(railLeftMid);
    this.disposables.push(railBeamGeo);

    // High Sweeping Curved Pagoda Roof Eaves Overhead (never blocks skyline or characters!)
    const lowerEave = new THREE.Mesh(
      new THREE.ConeGeometry(5.15, 1.15, 8, 1, true),
      roofTileMat,
    );
    lowerEave.position.y = 4.92;
    lowerEave.rotation.y = Math.PI / 8;
    this.scene.add(lowerEave);

    const upperEave = new THREE.Mesh(
      new THREE.ConeGeometry(3.1, 1.05, 8, 1, false),
      roofTileMat,
    );
    upperEave.position.y = 5.88;
    upperEave.rotation.y = Math.PI / 8;
    this.scene.add(upperEave);

    const roofFinial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), goldMat);
    roofFinial.position.y = 6.48;
    this.scene.add(roofFinial);
    this.disposables.push(lowerEave.geometry, upperEave.geometry, roofFinial.geometry);

    // 3. Carved Rosewood Xiangqi Table + Inlaid Board + Celadon Teapot + Red Wedding Candles!
    const boardTex = createXiangqiBoardTextures(maxAniso);
    this.disposables.push(boardTex.map, boardTex.bumpMap);

    const rosewoodMat = new THREE.MeshStandardMaterial({
      color: 0x3b1c12,
      roughness: 0.42,
      metalness: 0.08,
    });
    const boardFaceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: boardTex.map,
      bumpMap: boardTex.bumpMap,
      bumpScale: 0.01,
      roughness: 0.44,
    });
    const boardW = CINEMA_CELL_W * 8 / (1 - (2 * 112) / 1024);
    const boardD = CINEMA_CELL_D * 9 / (1 - (2 * 126) / 1152);
    const tableW = boardW + 0.72;
    const tableD = boardD + 0.56;

    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(tableW, 0.1, tableD),
      rosewoodMat,
    );
    tableTop.position.y = CINEMA_TABLE_Y - 0.05;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    this.scene.add(tableTop);

    const inlaidBoard = new THREE.Mesh(new THREE.BoxGeometry(boardW, 0.055, boardD), [
      rosewoodMat,
      rosewoodMat,
      boardFaceMat,
      rosewoodMat,
      rosewoodMat,
      rosewoodMat,
    ]);
    inlaidBoard.position.y = CINEMA_TABLE_Y + 0.0275;
    inlaidBoard.receiveShadow = true;
    this.scene.add(inlaidBoard);

    const legGeo = new THREE.BoxGeometry(0.13, CINEMA_TABLE_Y - 0.1, 0.13);
    const lx = tableW * 0.44;
    const lz = tableD * 0.44;
    [
      [-lx, -lz],
      [lx, -lz],
      [-lx, lz],
      [lx, lz],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, rosewoodMat);
      leg.position.set(x, (CINEMA_TABLE_Y - 0.1) / 2, z);
      leg.castShadow = true;
      this.scene.add(leg);
    });

    // Celadon Porcelain Teapot + Saucers on Table Corners
    const celadonMat = new THREE.MeshPhysicalMaterial({
      color: 0x7eb5a0,
      roughness: 0.18,
      metalness: 0.06,
      clearcoat: 0.85,
    });
    const potGroup = new THREE.Group();
    potGroup.position.set(-0.96, CINEMA_TABLE_Y, -0.32);
    const potBody = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), celadonMat);
    potBody.scale.set(1.12, 0.84, 1.12);
    potBody.position.y = 0.082;
    potGroup.add(potBody);
    const potLid = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.062, 0.025, 12), celadonMat);
    potLid.position.y = 0.16;
    potGroup.add(potLid);
    const potSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.11, 8), celadonMat);
    potSpout.position.set(0.095, 0.1, 0);
    potSpout.rotation.z = -0.85;
    potGroup.add(potSpout);
    const potHandle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 8, 14, Math.PI * 1.2), celadonMat);
    potHandle.position.set(-0.088, 0.095, 0);
    potHandle.rotation.z = Math.PI * 0.4;
    potGroup.add(potHandle);
    this.scene.add(potGroup);

    // 2 Porcelain Saucers under Bride's and Groom's teacups
    const saucerGeo = new THREE.CylinderGeometry(0.072, 0.056, 0.012, 16);
    [
      [-0.92, -0.62],
      [0.92, 0.62],
    ].forEach(([sx, sz]) => {
      const saucer = new THREE.Mesh(saucerGeo, celadonMat);
      saucer.position.set(sx, CINEMA_TABLE_Y + 0.006, sz);
      this.scene.add(saucer);
    });

    // 2 Red Dragon-Phoenix Wedding Candles (Nến Hoa Chúc) with flickering flames!
    const candleWaxMat = new THREE.MeshStandardMaterial({
      color: 0xc21a20,
      emissive: 0x3b0406,
      roughness: 0.35,
    });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffdf7a });
    const candleGeo = new THREE.CylinderGeometry(0.032, 0.036, 0.24, 12);
    const holderGeo = new THREE.CylinderGeometry(0.052, 0.068, 0.04, 12);
    const flameGeo = new THREE.ConeGeometry(0.018, 0.065, 8);
    [
      [0.96, -0.78],
      [-0.96, 0.78],
    ].forEach(([cx, cz]) => {
      const holder = new THREE.Mesh(holderGeo, goldMat);
      holder.position.set(cx, CINEMA_TABLE_Y + 0.02, cz);
      this.scene.add(holder);
      const wax = new THREE.Mesh(candleGeo, candleWaxMat);
      wax.position.set(cx, CINEMA_TABLE_Y + 0.16, cz);
      this.scene.add(wax);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(cx, CINEMA_TABLE_Y + 0.31, cz);
      this.scene.add(flame);
      this.candleFlames.push(flame);
    });

    // Animated Curling Tea Steam Wisps rising from teapot & teacups!
    const steamMat = new THREE.MeshBasicMaterial({
      color: 0xf4f8ff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const steamGeo = new THREE.SphereGeometry(0.032, 8, 6);
    const steamSources: Array<[number, number]> = [
      [-0.96, -0.32],
      [-0.92, -0.62],
      [0.92, 0.62],
    ];
    steamSources.forEach(([sx, sz], sIdx) => {
      for (let k = 0; k < 3; k++) {
        const wisp = new THREE.Mesh(steamGeo, steamMat.clone());
        wisp.position.set(sx, CINEMA_TABLE_Y + 0.15, sz);
        this.scene.add(wisp);
        this.steamWisps.push({
          mesh: wisp,
          baseX: sx,
          baseZ: sz,
          phase: sIdx * 1.1 + k * 0.33,
        });
      }
    });

    this.disposables.push(
      rosewoodMat,
      boardFaceMat,
      tableTop.geometry,
      inlaidBoard.geometry,
      legGeo,
      celadonMat,
      potBody.geometry,
      potLid.geometry,
      potSpout.geometry,
      potHandle.geometry,
      saucerGeo,
      candleWaxMat,
      flameMat,
      candleGeo,
      holderGeo,
      flameGeo,
      steamGeo,
      steamMat,
    );
  }

  private getPieceFaceTexture(side: Side, type: PieceType): THREE.CanvasTexture {
    const key = `${side}_${type}`;
    let tex = this.pieceFaceTextures.get(key);
    if (!tex) {
      tex = createPieceFaceTexture(side, type, this.renderer.capabilities.getMaxAnisotropy());
      this.pieceFaceTextures.set(key, tex);
    }
    return tex;
  }

  private createPieceMesh(piece: Piece): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      this.pieceBodyGeo,
      piece.side === 'red' ? this.redPieceMat : this.blackPieceMat,
    );
    g.add(body);
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.getPieceFaceTexture(piece.side, piece.type),
      roughness: 0.36,
      metalness: 0.08,
    });
    const top = new THREE.Mesh(this.pieceTopGeo, faceMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.064;
    g.add(top);
    g.userData = { faceMat };
    return g;
  }

  public syncBoard(board: BoardState) {
    const alive = new Set<string>();
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const piece = board.grid[r][c];
        if (!piece) continue;
        alive.add(piece.id);
        let vis = this.pieceVisuals.get(piece.id);
        const [wx, wy, wz] = boardCoordToCinemaWorld({ row: r, col: c });
        if (!vis) {
          const group = this.createPieceMesh(piece);
          group.position.set(wx, wy, wz);
          this.piecesGroup.add(group);
          vis = { id: piece.id, group, row: r, col: c };
          this.pieceVisuals.set(piece.id, vis);
        } else {
          vis.row = r;
          vis.col = c;
          vis.group.position.set(wx, wy, wz);
        }
      }
    }
    for (const [id, vis] of this.pieceVisuals.entries()) {
      if (!alive.has(id)) {
        this.piecesGroup.remove(vis.group);
        const faceMat = vis.group.userData?.faceMat as THREE.Material | undefined;
        faceMat?.dispose();
        this.pieceVisuals.delete(id);
      }
    }
  }

  public setGuestProfile(profile: WuxiaCharacterProfile) {
    this.scene.remove(this.groomRig.root);
    this.scene.remove(this.groomRig.teacupGroup);
    this.groomRig.dispose();
    this.groomRig = this.createGroomRig(profile);
    this.scene.add(this.groomRig.root);
    this.scene.add(this.groomRig.teacupGroup);
  }

  public setState(params: {
    requestedAngle: CinemaCameraAngle;
    emotion: HostEmotion;
    isSpeaking: boolean;
    botThinking: boolean;
    inCheck: boolean;
    moveEvent: MoveChoreoPayload | null;
    actionCue: ActionCuePayload | null;
  }) {
    this.requestedAngle = params.requestedAngle;
    this.hostEmotion = params.emotion;
    this.isSpeaking = params.isSpeaking;
    this.botThinking = params.botThinking;
    this.inCheck = params.inCheck;
    this.latestMoveEvent = params.moveEvent;
    this.latestActionCue = params.actionCue;
  }

  /** Applies full-body pose + analytical 2-bone arm IK for piece pickup, tea sipping, and fan teasing! */
  private applyActorPose(
    rig: CinemaActorRig,
    pose: CharacterPoseSample,
    elapsed: number,
    dt: number,
    voiceLevel: number,
  ) {
    const damp = 1 - Math.exp(-9.5 * dt);

    // 1. Torso breathing, forward lean & expressive twist
    rig.torsoGroup.position.y = 0.62 + Math.sin(elapsed * 1.85 + (rig.isBride ? 0 : 1.9)) * 0.01;
    rig.torsoGroup.rotation.x += (pose.torsoLeanForward - rig.torsoGroup.rotation.x) * damp;
    rig.torsoGroup.rotation.y += (pose.torsoTwistY - rig.torsoGroup.rotation.y) * damp;

    // 2. Seated knees subtle alive shift
    rig.leftKneeGroup.rotation.y = pose.legSway;
    rig.rightKneeGroup.rotation.y = -pose.legSway * 0.85;

    // 3. Head expressive tracking, blink & live audio RMS lip-sync
    rig.headGroup.rotation.y += (pose.headYaw - rig.headGroup.rotation.y) * damp;
    rig.headGroup.rotation.x += (pose.headPitch - rig.headGroup.rotation.x) * damp;
    rig.headGroup.rotation.z += (pose.headRoll - rig.headGroup.rotation.z) * damp;

    const blinkPhase = (elapsed + (rig.isBride ? 0 : 1.6)) % 4.3;
    const blinking = blinkPhase > 4.18;
    rig.leftEyelid.visible = blinking;
    rig.rightEyelid.visible = blinking;

    const speakLevel = rig.isBride && this.isSpeaking ? Math.max(0.18, voiceLevel) : 0;
    rig.mouth.visible = speakLevel > 0.05;
    if (rig.mouth.visible) {
      const targetScaleY = 0.22 + speakLevel * 0.85;
      rig.mouth.scale.y += (targetScaleY - rig.mouth.scale.y) * (1 - Math.exp(-24 * dt));
    }

    // 4. Right Arm Kinematics (Idle poised / Piece-Move Reach / Porcelain Tea Sip / Playful Beckon!)
    let targetRShoulderX = -0.34;
    let targetRShoulderZ = -0.14;
    let targetRElbowX = -0.92;

    if (pose.rightReachWeight > 0.02) {
      // Compute direction from shoulder to exact board world square!
      rig.root.updateMatrixWorld(true);
      rig.rightShoulder.getWorldPosition(_vShoulderWorld);
      _vTargetLocal.set(pose.rightReachTargetX, pose.rightReachTargetY, pose.rightReachTargetZ);
      // Transform world target delta into character local space (facing +Z for Bride, -Z for Groom)
      const dxWorld = _vTargetLocal.x - _vShoulderWorld.x;
      const dyWorld = _vTargetLocal.y - _vShoulderWorld.y;
      const dzWorld = _vTargetLocal.z - _vShoulderWorld.z;
      const facing = rig.isBride ? 1 : -1;
      const localX = dxWorld * facing;
      const localZ = dzWorld * facing;

      const reachDist = Math.min(0.68, Math.sqrt(localX * localX + dyWorld * dyWorld + localZ * localZ));
      const pitchToTarget = -Math.atan2(localZ, Math.max(0.08, -dyWorld));
      const sideAngle = Math.atan2(localX, Math.max(0.25, localZ)) * 0.72;
      const elbowBend = -Math.max(0.12, (0.68 - reachDist) * 1.65);

      const w = pose.rightReachWeight;
      targetRShoulderX = targetRShoulderX * (1 - w) + (pitchToTarget - 0.16) * w;
      targetRShoulderZ = targetRShoulderZ * (1 - w) + sideAngle * w;
      targetRElbowX = targetRElbowX * (1 - w) + elbowBend * w;
    } else if (pose.teaSipPhase > 0.01) {
      // Unmistakable film gesture: smoothly reach to saucer -> lift porcelain teacup right to lips -> savor -> return!
      const s = pose.teaSipPhase;
      targetRShoulderX = -0.68 - s * 0.62;
      targetRShoulderZ = -0.34 * (1 - s) + 0.34 * s;
      targetRElbowX = -0.45 - s * 1.48;
    } else if (pose.teaseFanPhase > 0.05 && rig.isBride) {
      // Playful teasing right-hand beckon toward Tân Lang across the board!
      const t = pose.teaseFanPhase;
      targetRShoulderX = -1.16 * t + Math.sin(elapsed * 7.5) * 0.09 * t;
      targetRShoulderZ = 0.22 * t;
      targetRElbowX = -0.52 - Math.sin(elapsed * 7.5) * 0.22 * t;
    }

    rig.rightShoulder.rotation.x += (targetRShoulderX - rig.rightShoulder.rotation.x) * damp;
    rig.rightShoulder.rotation.z += (targetRShoulderZ - rig.rightShoulder.rotation.z) * damp;
    rig.rightElbow.rotation.x += (targetRElbowX - rig.rightElbow.rotation.x) * damp;

    // 5. Left Arm + Crimson Bridal Silk Fan (raises coyly to half-hide smile when teasing or gently fans while thinking!)
    let targetLShoulderX = -0.32;
    let targetLShoulderZ = 0.14;
    let targetLElbowX = -0.88;
    if (rig.isBride && pose.teaseFanPhase > 0.02) {
      const t = pose.teaseFanPhase;
      targetLShoulderX = -0.55 - t * 0.78;
      targetLShoulderZ = 0.08 - t * 0.42;
      targetLElbowX = -0.92 - t * 1.05;
    } else if (rig.isBride && this.isSpeaking) {
      targetLShoulderX = -0.42 + Math.sin(elapsed * 2.8) * 0.06;
      targetLElbowX = -1.05 + Math.cos(elapsed * 2.8) * 0.08;
    }

    rig.leftShoulder.rotation.x += (targetLShoulderX - rig.leftShoulder.rotation.x) * damp;
    rig.leftShoulder.rotation.z += (targetLShoulderZ - rig.leftShoulder.rotation.z) * damp;
    rig.leftElbow.rotation.x += (targetLElbowX - rig.leftElbow.rotation.x) * damp;

    if (rig.fanGroup) {
      const fanScale = 0.42 + pose.fanOpenAmount * 0.72;
      rig.fanGroup.scale.set(fanScale, 1, 1);
      rig.fanGroup.rotation.z =
        0.18 + Math.sin(elapsed * (pose.action === 'think_fan' ? 7.2 : 3.4)) * (0.14 + pose.teaseFanPhase * 0.16);
      rig.fanGroup.rotation.y = 0.28 + pose.teaseFanPhase * 0.42;
    }

    // 6. Porcelain Teacup Handoff (attached cleanly between hand & lips during sip_tea, back on saucer otherwise!)
    if (pose.cupAttachedToHand) {
      rig.root.updateMatrixWorld(true);
      rig.rightHandTip.getWorldPosition(_vHandWorld);
      rig.headGroup.getWorldPosition(_vMouthWorld);
      _vMouthWorld.y += 0.12;
      _vMouthWorld.z += rig.isBride ? 0.22 : -0.22;

      const liftBlend = Math.min(1, Math.max(0, (pose.teaSipPhase - 0.22) / 0.72));
      _vCupLerp.lerpVectors(_vHandWorld, _vMouthWorld, liftBlend * 0.85);
      rig.teacupGroup.position.lerp(_vCupLerp, 1 - Math.exp(-20 * dt));
      rig.teacupGroup.rotation.x = (rig.isBride ? -0.36 : 0.36) * liftBlend;
    } else {
      rig.teacupGroup.position.lerp(rig.cupHomePos, 1 - Math.exp(-16 * dt));
      rig.teacupGroup.rotation.x *= 1 - damp;
    }

    // 7. Crown Tassels & Bridal Silk Ribbon gentle breeze sway
    rig.tassels.forEach((t, idx) => {
      t.rotation.z = Math.sin(elapsed * 2.1 + idx * 1.2) * 0.045;
    });

    // 8. If currently carrying a real chess piece mid-move, lift that piece smoothly with the actor's hand!
    const activePieceId = rig.isBride
      ? this.director.brideAction.pieceId
      : this.director.groomAction.pieceId;
    if (activePieceId && pose.pieceLiftedProgress >= 0) {
      const pieceVis = this.pieceVisuals.get(activePieceId);
      if (pieceVis) {
        pieceVis.group.position.set(
          pose.rightReachTargetX,
          pose.rightReachTargetY - 0.045,
          pose.rightReachTargetZ,
        );
      }
    }
  }

  private handleResize() {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 240);
    const h = Math.max(this.container.clientHeight, 180);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.render(this.scene, this.camera);
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 85);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 70);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    // Allow true real-time wall-clock animation progress (even under CPU software-WebGL!) via safe fixed substeps
    const totalDt = Math.min(0.45, Math.max(0.008, (now - this.lastTime) / 1000));
    this.lastTime = now;

    // 1. Substep pure Film Director & Choreography State Machine so 1s wall clock == 1s animation
    let remaining = totalDt;
    let step = stepCinemaDirector(this.director, {
      dt: Math.min(0.05, remaining),
      requestedAngle: this.requestedAngle,
      emotion: this.hostEmotion,
      isSpeaking: this.isSpeaking,
      botThinking: this.botThinking,
      inCheck: this.inCheck,
      moveEvent: this.latestMoveEvent,
      actionCue: this.latestActionCue,
    });
    let anySharpCut = step.camera.cutSharp;
    remaining -= Math.min(0.05, remaining);
    while (remaining > 0.002) {
      const sub = Math.min(0.05, remaining);
      step = stepCinemaDirector(this.director, {
        dt: sub,
        requestedAngle: this.requestedAngle,
        emotion: this.hostEmotion,
        isSpeaking: this.isSpeaking,
        botThinking: this.botThinking,
        inCheck: this.inCheck,
        moveEvent: this.latestMoveEvent,
        actionCue: this.latestActionCue,
      });
      if (step.camera.cutSharp) anySharpCut = true;
      remaining -= sub;
    }
    if (anySharpCut) step.camera.cutSharp = true;

    const elapsed = this.director.elapsed;

    // Emit lightweight HUD telemetry ONLY when shot/action label changes
    const tKey = `${step.camera.shot}|${step.camera.actionLabelVi}|${step.bridePose.action}|${step.groomPose.action}`;
    if (tKey !== this.lastTelemetryKey) {
      this.lastTelemetryKey = tKey;
      this.onTelemetry?.({
        shot: step.camera.shot,
        shotLabelVi: step.camera.shotLabelVi,
        actionLabelVi: step.camera.actionLabelVi,
        brideAction: step.bridePose.action,
        groomAction: step.groomPose.action,
      });
    }

    // 2. Smooth Film Camera Tracking (or crisp cinema cut when director switches angle!)
    this.updateCamera(step.camera, totalDt);

    // 3. Animate Full-Body Couple (arms, elbows, hands, silk fan, teacups, knees, lip-sync!)
    const voiceLevel = this.isSpeaking ? wuxiaAudio.getVoiceLevel() : 0;
    this.applyActorPose(this.brideRig, step.bridePose, elapsed, totalDt, voiceLevel);
    this.applyActorPose(this.groomRig, step.groomPose, elapsed, totalDt, 0);

    // 4. Animate Moonlit Lotus Lake Environment (ripples, lanterns, water hoa đăng, candle flames, tea steam, fireflies)
    this.waterTex.offset.x = (elapsed * 0.014) % 1;
    this.waterTex.offset.y = Math.sin(elapsed * 0.25) * 0.04;

    for (let i = 0; i < this.lanterns.length; i++) {
      this.lanterns[i].rotation.z = Math.sin(elapsed * 1.2 + i * 1.4) * 0.055;
      this.lanterns[i].rotation.x = Math.cos(elapsed * 0.9 + i) * 0.035;
    }

    for (let i = 0; i < this.waterLanterns.length; i++) {
      const wl = this.waterLanterns[i];
      const a = wl.baseAngle + elapsed * wl.speed;
      wl.group.position.set(
        Math.cos(a) * wl.radius,
        WATER_Y + 0.025 + Math.sin(elapsed * 1.6 + i) * 0.018,
        Math.sin(a) * wl.radius,
      );
      wl.group.rotation.y = a;
    }

    for (let i = 0; i < this.candleFlames.length; i++) {
      const flicker = 0.88 + Math.sin(elapsed * 15 + i * 2.1) * 0.14;
      this.candleFlames[i].scale.set(1, flicker, 1);
    }

    for (let i = 0; i < this.steamWisps.length; i++) {
      const sw = this.steamWisps[i];
      const cycle = (elapsed * 0.42 + sw.phase) % 1;
      sw.mesh.position.set(
        sw.baseX + Math.sin(cycle * Math.PI * 2 + i) * 0.035,
        CINEMA_TABLE_Y + 0.12 + cycle * 0.34,
        sw.baseZ + Math.cos(cycle * Math.PI * 2) * 0.02,
      );
      const sc = 0.65 + cycle * 1.35;
      sw.mesh.scale.setScalar(sc);
      const mat = sw.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(cycle * Math.PI) * 0.24;
    }

    for (let i = 0; i < this.fireflySeeds.length; i++) {
      const f = this.fireflySeeds[i];
      const a = f.angle + elapsed * f.speed;
      _vDummyPos.set(
        Math.cos(a) * f.radius,
        f.y + Math.sin(elapsed * 1.3 + i) * 0.22,
        Math.sin(a) * f.radius,
      );
      _vDummyQuat.identity();
      const pulse = 0.55 + 0.45 * Math.sin(elapsed * 3.1 + i * 1.7);
      _vDummyScale.setScalar(pulse);
      _vDummyMatrix.compose(_vDummyPos, _vDummyQuat, _vDummyScale);
      this.fireflyInstanced.setMatrixAt(i, _vDummyMatrix);
    }
    this.fireflyInstanced.instanceMatrix.needsUpdate = true;

    // 5. Render Frame
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateCamera(cam: CameraShotSample, dt: number) {
    _vDesiredCam.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    _vDesiredTarget.set(cam.target[0], cam.target[1], cam.target[2]);

    // Crisp cinema cut when switching angle, smooth dolly tracking within a shot!
    const damp = cam.cutSharp ? 0.92 : 1 - Math.exp(-5.2 * dt);
    this.currentCamPos.lerp(_vDesiredCam, damp);
    this.currentCamTarget.lerp(_vDesiredTarget, damp);

    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentCamTarget);

    if (Math.abs(this.camera.fov - cam.fov) > 0.05) {
      this.camera.fov += (cam.fov - this.camera.fov) * damp;
      this.camera.updateProjectionMatrix();
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.brideRig.dispose();
    this.groomRig.dispose();
    for (const vis of this.pieceVisuals.values()) {
      const fm = vis.group.userData?.faceMat as THREE.Material | undefined;
      fm?.dispose();
    }
    for (const tex of this.pieceFaceTextures.values()) {
      tex.dispose();
    }
    for (const sw of this.steamWisps) {
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
