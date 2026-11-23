import * as THREE from 'three';
import { BOT_MASTER_PROFILE, GuestGender, WuxiaCharacterProfile } from '../data/characters';

export type CharacterMood = 'calm' | 'thinking' | 'fierce' | 'check' | 'victory';

export interface AnimatedWuxiaRig {
  root: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftBrow: THREE.Mesh;
  rightBrow: THREE.Mesh;
  leftEyelid: THREE.Mesh;
  rightEyelid: THREE.Mesh;
  leftPupil: THREE.Mesh;
  rightPupil: THREE.Mesh;
  mouth: THREE.Mesh;
  rightArmGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  qiHalo?: THREE.Mesh;
  hairRibbons: THREE.Object3D[];
  dispose: () => void;
}

interface CharacterVisualSpec {
  gender: GuestGender;
  skinColor: number;
  robePrimary: number;
  robeSecondary: number;
  trimColor: number;
  hairColor: number;
  accentGlow: number;
  hairStyle:
    | 'botMaster'
    | 'topknot'
    | 'bambooHat'
    | 'elderCrown'
    | 'ironBand'
    | 'twinBuns'
    | 'phoenixPin'
    | 'crescentCrown'
    | 'elderBun';
  beardStyle: 'none' | 'goatee' | 'longWhite';
  shoulderScale: number;
  headScale: number;
  isBotMaster?: boolean;
}

function hexToRgbStr(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

/**
 * Generates a high-resolution 1024x1024 studio-painted porcelain face texture
 * aligned with SphereGeometry(phiStart = -PI/2) so u = 0.5 lands dead center on +Z.
 */
function createPortraitFaceTexture(spec: CharacterVisualSpec): THREE.CanvasTexture {
  const w = 1024;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const isFemale = spec.gender === 'nu' || Boolean(spec.isBotMaster);
  const cx = w * 0.5;

  // 1. Base porcelain / warm skin tone with soft radial studio shading
  ctx.fillStyle = hexToRgbStr(spec.skinColor);
  ctx.fillRect(0, 0, w, h);

  // Subtle contour shading on sides of face & under chin
  const faceShade = ctx.createRadialGradient(cx, 505, 60, cx, 520, 320);
  faceShade.addColorStop(0, 'rgba(255, 246, 238, 0.24)');
  faceShade.addColorStop(0.55, 'rgba(255, 235, 222, 0.04)');
  faceShade.addColorStop(1, 'rgba(130, 74, 58, 0.22)');
  ctx.fillStyle = faceShade;
  ctx.fillRect(0, 0, w, h);

  // Rosy cheek blush (peach-coral for female beauties, warm subtle bronze for males)
  [-1, 1].forEach((side) => {
    const bx = cx + side * 88;
    const by = 548;
    const blush = ctx.createRadialGradient(bx, by, 6, bx, by, 62);
    if (isFemale) {
      blush.addColorStop(0, spec.isBotMaster ? 'rgba(232, 92, 108, 0.34)' : 'rgba(238, 126, 134, 0.28)');
      blush.addColorStop(1, 'rgba(238, 126, 134, 0)');
    } else {
      blush.addColorStop(0, 'rgba(176, 102, 78, 0.14)');
      blush.addColorStop(1, 'rgba(176, 102, 78, 0)');
    }
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.arc(bx, by, 62, 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. Enchanting Eyes (Phoenix-almond eyes with winged eyeliner & ruby-gold iris for Three Kingdoms Kỳ Ma)
  const eyeOffsetX = isFemale ? 69 : 70;
  const eyeY = isFemale ? 502 : 492;
  const eyeRx = isFemale ? 44 : 35;
  const eyeRy = isFemale ? 25 : 16;

  [-1, 1].forEach((side) => {
    const ex = cx + side * eyeOffsetX;

    // Soft crimson-coral Three Kingdoms eyeshadow sweep at outer corner (Chu Sa makeup!)
    if (isFemale) {
      const shadowGrad = ctx.createRadialGradient(
        ex + side * 24,
        eyeY - 6,
        4,
        ex + side * 24,
        eyeY - 4,
        50,
      );
      shadowGrad.addColorStop(
        0,
        spec.isBotMaster ? 'rgba(196, 36, 58, 0.48)' : 'rgba(186, 78, 92, 0.34)',
      );
      shadowGrad.addColorStop(1, 'rgba(196, 36, 58, 0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(ex + side * 14, eyeY - 4, 48, 28, side * -0.14, 0, Math.PI * 2);
      ctx.fill();
    }

    // Almond eye path (clipped for iris rendering)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - side * eyeRx, eyeY + 3);
    ctx.bezierCurveTo(
      ex - side * eyeRx * 0.35,
      eyeY - eyeRy * 1.25,
      ex + side * eyeRx * 0.45,
      eyeY - eyeRy * 1.2,
      ex + side * (eyeRx + 4),
      eyeY - (isFemale ? 7 : 3),
    );
    ctx.bezierCurveTo(
      ex + side * eyeRx * 0.45,
      eyeY + eyeRy * 0.95,
      ex - side * eyeRx * 0.4,
      eyeY + eyeRy * 0.95,
      ex - side * eyeRx,
      eyeY + 3,
    );
    ctx.closePath();

    // Soft ivory sclera with gentle top-lid shadow
    const scleraGrad = ctx.createLinearGradient(ex, eyeY - eyeRy, ex, eyeY + eyeRy);
    scleraGrad.addColorStop(0, '#ddd2d4');
    scleraGrad.addColorStop(0.28, '#fff9f5');
    scleraGrad.addColorStop(1, '#f4ebe6');
    ctx.fillStyle = scleraGrad;
    ctx.fill();
    ctx.clip();

    // Rich multi-layered Iris
    const irisR = isFemale ? 22 : 15;
    const irisX = ex + side * 1;
    const irisY = eyeY - 1;
    const irisGrad = ctx.createRadialGradient(irisX, irisY + 5, 2, irisX, irisY, irisR);
    if (spec.isBotMaster) {
      // Captivating Golden-Amber & Crimson-Violet Phoenix Iris
      irisGrad.addColorStop(0, '#ffe894');
      irisGrad.addColorStop(0.42, '#e88b35');
      irisGrad.addColorStop(0.78, '#7a1f32');
      irisGrad.addColorStop(1, '#1d0a12');
    } else if (isFemale) {
      irisGrad.addColorStop(0, '#9e6b4a');
      irisGrad.addColorStop(0.55, '#462622');
      irisGrad.addColorStop(1, '#170d10');
    } else {
      irisGrad.addColorStop(0, '#5a4332');
      irisGrad.addColorStop(0.65, '#251a18');
      irisGrad.addColorStop(1, '#100c0d');
    }
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(irisX, irisY, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Deep glossy pupil
    ctx.fillStyle = '#0d070c';
    ctx.beginPath();
    ctx.arc(irisX, irisY - 1, irisR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Primary & secondary bright studio catchlights (makes eyes sparkle!)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(irisX - 6, irisY - 7, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(irisX + 7, irisY + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Lush winged upper eyelash & eyeliner
    ctx.strokeStyle = '#11080d';
    ctx.lineWidth = isFemale ? 6.4 : 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - side * (eyeRx - 1), eyeY + 2);
    ctx.bezierCurveTo(
      ex - side * eyeRx * 0.35,
      eyeY - eyeRy * 1.28,
      ex + side * eyeRx * 0.48,
      eyeY - eyeRy * 1.22,
      ex + side * (eyeRx + (isFemale ? 16 : 4)),
      eyeY - (isFemale ? 15 : 3),
    );
    ctx.stroke();

    // Subtle double-eyelid crease above eye
    ctx.strokeStyle = 'rgba(135, 76, 66, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex - side * (eyeRx * 0.72), eyeY - eyeRy * 0.9);
    ctx.quadraticCurveTo(ex, eyeY - eyeRy * 1.75, ex + side * (eyeRx * 0.85), eyeY - eyeRy * 1.15);
    ctx.stroke();

    // Delicate lower lash definition
    ctx.strokeStyle = 'rgba(65, 34, 38, 0.42)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(ex - side * (eyeRx * 0.7), eyeY + eyeRy * 0.52);
    ctx.quadraticCurveTo(ex, eyeY + eyeRy * 0.95, ex + side * (eyeRx * 0.85), eyeY + 2);
    ctx.stroke();
  });

  // 3. Delicate Eyebrows (Graceful Willow-Leaf Brows for Female / Sword Brows for Male)
  [-1, 1].forEach((side) => {
    const bx0 = cx + side * 28;
    const by0 = isFemale ? 454 : 448;
    ctx.fillStyle = isFemale ? '#1c1016' : hexToRgbStr(spec.hairColor);
    ctx.beginPath();
    ctx.moveTo(bx0, by0 + 2);
    ctx.quadraticCurveTo(
      cx + side * 74,
      isFemale ? 430 : 430,
      cx + side * (isFemale ? 120 : 114),
      isFemale ? 444 : 434,
    );
    ctx.quadraticCurveTo(
      cx + side * 74,
      isFemale ? 441 : 444,
      bx0,
      by0 + (isFemale ? 8 : 12),
    );
    ctx.closePath();
    ctx.fill();
  });

  // 4. Three Kingdoms Crimson-Gold Lotus Forehead Mark (Hoa Điền) on Female Kỳ Ma
  if (spec.isBotMaster) {
    const hy = 424;
    ctx.fillStyle = '#cf142e';
    // Center lotus petal
    ctx.beginPath();
    ctx.moveTo(cx, hy - 25);
    ctx.quadraticCurveTo(cx + 12, hy - 5, cx, hy + 16);
    ctx.quadraticCurveTo(cx - 12, hy - 5, cx, hy - 25);
    ctx.fill();
    // Side petals
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(cx + s * 4, hy + 7);
      ctx.quadraticCurveTo(cx + s * 20, hy - 11, cx + s * 18, hy - 16);
      ctx.quadraticCurveTo(cx + s * 9, hy - 5, cx + s * 4, hy + 7);
      ctx.fill();
    });
    // Golden center pearl
    ctx.fillStyle = '#ffe182';
    ctx.beginPath();
    ctx.arc(cx, hy - 2, 4.0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Delicate Sculpted Nose Contour & Highlight
  const noseGrad = ctx.createLinearGradient(cx - 14, 522, cx + 14, 522);
  noseGrad.addColorStop(0, 'rgba(138, 76, 60, 0.22)');
  noseGrad.addColorStop(0.5, 'rgba(255, 244, 236, 0.34)');
  noseGrad.addColorStop(1, 'rgba(138, 76, 60, 0.22)');
  ctx.fillStyle = noseGrad;
  ctx.beginPath();
  ctx.ellipse(cx, 542, 11, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft nose tip & tiny nostril shadows
  ctx.fillStyle = 'rgba(125, 66, 52, 0.38)';
  ctx.beginPath();
  ctx.ellipse(cx - 9, 570, 5, 2.5, 0.25, 0, Math.PI * 2);
  ctx.ellipse(cx + 9, 570, 5, 2.5, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // 6. Alluring Glossy Cupid's-Bow Lips (Rose-Vermilion for Three Kingdoms Beauty)
  const lipY = 616;
  const lipW = isFemale ? 41 : 34;

  // Upper Cupid's-bow lip
  const upperGrad = ctx.createLinearGradient(cx, lipY - 12, cx, lipY + 4);
  if (isFemale) {
    upperGrad.addColorStop(0, spec.isBotMaster ? '#c41834' : '#cf4358');
    upperGrad.addColorStop(1, spec.isBotMaster ? '#8e0c22' : '#9c2638');
  } else {
    upperGrad.addColorStop(0, '#b56a5d');
    upperGrad.addColorStop(1, '#8c4b41');
  }
  ctx.fillStyle = upperGrad;
  ctx.beginPath();
  ctx.moveTo(cx - lipW, lipY);
  ctx.bezierCurveTo(cx - lipW * 0.45, lipY - 13, cx - 10, lipY - 12, cx, lipY - 6);
  ctx.bezierCurveTo(cx + 10, lipY - 12, cx + lipW * 0.45, lipY - 13, cx + lipW, lipY);
  ctx.quadraticCurveTo(cx, lipY + 5, cx - lipW, lipY);
  ctx.fill();

  // Full sculpted lower lip
  const lowerGrad = ctx.createLinearGradient(cx, lipY, cx, lipY + 18);
  if (isFemale) {
    lowerGrad.addColorStop(0, spec.isBotMaster ? '#e22a46' : '#df576b');
    lowerGrad.addColorStop(1, spec.isBotMaster ? '#a8132a' : '#b23246');
  } else {
    lowerGrad.addColorStop(0, '#c07668');
    lowerGrad.addColorStop(1, '#985549');
  }
  ctx.fillStyle = lowerGrad;
  ctx.beginPath();
  ctx.moveTo(cx - lipW * 0.88, lipY + 1);
  ctx.bezierCurveTo(cx - lipW * 0.45, lipY + 19, cx + lipW * 0.45, lipY + 19, cx + lipW * 0.88, lipY + 1);
  ctx.quadraticCurveTo(cx, lipY + 5, cx - lipW * 0.88, lipY + 1);
  ctx.fill();

  // Subtle lip parting shadow + glossy pearl highlight
  ctx.strokeStyle = 'rgba(62, 10, 18, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - lipW * 0.88, lipY + 1);
  ctx.quadraticCurveTo(cx, lipY + 4, cx + lipW * 0.88, lipY + 1);
  ctx.stroke();

  if (isFemale) {
    ctx.fillStyle = 'rgba(255, 240, 244, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx - 5, lipY + 9, 10, 2.8, -0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an imperial Three Kingdoms embroidered crimson-gold silk brocade texture.
 */
function createSilkBrocadeTexture(primaryHex: number, trimHex: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, hexToRgbStr(primaryHex));
  grad.addColorStop(0.5, hexToRgbStr(primaryHex));
  grad.addColorStop(1, 'rgba(18, 8, 16, 0.96)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle diagonal silk weave shimmer
  ctx.strokeStyle = 'rgba(255, 232, 190, 0.05)';
  ctx.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  // Ornate golden Three Kingdoms auspicious cloud & lotus embroidery pattern
  ctx.strokeStyle = hexToRgbStr(trimHex, 0.42);
  ctx.lineWidth = 2.2;
  const step = 64;
  for (let y = 32; y < size; y += step) {
    for (let x = 32; x < size; x += step) {
      const ox = ((y / step) % 2) * 32;
      const px = (x + ox) % size;
      ctx.beginPath();
      ctx.arc(px, y, 16, Math.PI * 0.15, Math.PI * 1.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px + 10, y - 6, 9, Math.PI * 0.8, Math.PI * 2.1);
      ctx.stroke();

      ctx.fillStyle = hexToRgbStr(trimHex, 0.35);
      ctx.beginPath();
      ctx.arc(px, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Sculpts a refined V-line oval head geometry (smooth cheeks, delicate chin, subtle nose bridge)
 * with phiStart = -PI/2 so u = 0.5 aligns dead center on +Z!
 */
function createSculptedHeadGeometry(isFemale: boolean): THREE.SphereGeometry {
  const geo = new THREE.SphereGeometry(0.24, 48, 36, -Math.PI / 2, Math.PI * 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x / 0.24;
    const ny = v.y / 0.24;
    const nz = v.z / 0.24;

    // Graceful heart-shaped Three Kingdoms beauty proportions
    let x = v.x * (isFemale ? 0.90 : 0.92);
    let y = v.y * (isFemale ? 1.04 : 1.1);
    let z = v.z * 0.96;

    // Taper lower jawline & chin cleanly into a sculpted V-line beauty contour
    if (ny < 0.05) {
      const t = Math.min(1, (0.05 - ny) / 1.05);
      const jawTaper = isFemale ? 1 - t * 0.36 : 1 - t * 0.22;
      x *= jawTaper;
      z *= 1 - t * 0.12;
      // Subtle forward delicate chin tip
      if (nz > 0.25 && ny < -0.55) {
        z += (1 - Math.abs(nx)) * 0.016 * (isFemale ? 1.0 : 1.15);
      }
    }

    // Subtle sculpted nose bridge extrusion on front centerline
    if (nz > 0.65 && Math.abs(nx) < 0.18 && ny > -0.24 && ny < 0.08) {
      const noseProfile = Math.cos((nx / 0.18) * (Math.PI / 2));
      const vertProfile = Math.sin(((ny + 0.24) / 0.32) * Math.PI);
      z += noseProfile * vertProfile * (isFemale ? 0.022 : 0.028);
    }

    // Gentle cheek fullness under eyes
    if (nz > 0.45 && Math.abs(nx) > 0.25 && Math.abs(nx) < 0.72 && ny > -0.35 && ny < 0.05) {
      z += 0.008;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function buildCompositeWuxiaCharacter(spec: CharacterVisualSpec): AnimatedWuxiaRig {
  const root = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const isFemale = spec.gender === 'nu' || Boolean(spec.isBotMaster);
  const faceTex = track(createPortraitFaceTexture(spec));
  const brocadeTex = track(createSilkBrocadeTexture(spec.robePrimary, spec.trimColor));

  // Studio-grade PBR Materials (balanced envMapIntensity so warm porcelain skin never clips to white!)
  const skinMat = track(
    new THREE.MeshPhysicalMaterial({
      color: spec.skinColor,
      roughness: isFemale ? 0.56 : 0.62,
      metalness: 0.0,
      envMapIntensity: 0.35,
      sheen: isFemale ? 0.22 : 0.1,
      sheenColor: new THREE.Color(0xf2bda8),
      clearcoat: isFemale ? 0.04 : 0.0,
      clearcoatRoughness: 0.65,
    }),
  );

  const headFaceMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: faceTex,
      roughness: isFemale ? 0.55 : 0.62,
      metalness: 0.0,
      envMapIntensity: 0.34,
      sheen: isFemale ? 0.2 : 0.08,
      sheenColor: new THREE.Color(0xf2bda8),
      clearcoat: isFemale ? 0.04 : 0.0,
      clearcoatRoughness: 0.62,
    }),
  );

  const silkPrimaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: brocadeTex,
      roughness: 0.42,
      metalness: 0.08,
      envMapIntensity: 0.65,
      sheen: 0.78,
      sheenColor: new THREE.Color(spec.isBotMaster ? 0xffa69e : 0xe8d4b8),
      sheenRoughness: 0.45,
    }),
  );

  const robeSecondaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: spec.robeSecondary,
      roughness: 0.48,
      metalness: 0.12,
      sheen: 0.55,
      sheenColor: new THREE.Color(spec.trimColor),
    }),
  );

  const sheerRibbonMat = track(
    new THREE.MeshPhysicalMaterial({
      color: spec.isBotMaster ? 0x6b0818 : spec.robePrimary,
      emissive: spec.isBotMaster ? 0x260208 : 0x000000,
      emissiveIntensity: spec.isBotMaster ? 0.28 : 0,
      roughness: 0.45,
      metalness: 0.06,
      envMapIntensity: 0.28,
      sheen: 0.55,
      sheenColor: new THREE.Color(0xd93848),
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
    }),
  );

  const trimGoldMat = track(
    new THREE.MeshStandardMaterial({
      color: spec.trimColor,
      roughness: 0.2,
      metalness: 0.9,
    }),
  );

  const hairMat = track(
    new THREE.MeshPhysicalMaterial({
      color: spec.hairColor,
      roughness: 0.3,
      metalness: 0.12,
      sheen: 0.65,
      sheenColor: new THREE.Color(0x524b68),
      clearcoat: 0.28,
      clearcoatRoughness: 0.35,
    }),
  );

  const rubyGemMat = track(
    new THREE.MeshPhysicalMaterial({
      color: spec.accentGlow,
      emissive: spec.accentGlow,
      emissiveIntensity: 0.65,
      roughness: 0.1,
      metalness: 0.2,
      clearcoat: 1.0,
    }),
  );

  const pearlMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xfff5e8,
      roughness: 0.16,
      metalness: 0.1,
      clearcoat: 0.9,
    }),
  );

  const mouthOpenMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0x8f1628 : 0x6e332e,
      roughness: 0.35,
      metalness: 0.0,
    }),
  );

  const auraMat = track(
    new THREE.MeshStandardMaterial({
      color: spec.trimColor,
      emissive: spec.accentGlow,
      emissiveIntensity: 0.72,
      roughness: 0.2,
      metalness: 0.6,
      transparent: true,
      opacity: 0.72,
    }),
  );

  // 1. Seated Imperial Silk Cushion & Flowing Lower Gown Base (grounded at y = 0)
  const cushionGeo = track(new THREE.CylinderGeometry(0.58, 0.66, 0.16, 28));
  const cushion = new THREE.Mesh(cushionGeo, robeSecondaryMat);
  cushion.position.y = 0.08;
  cushion.receiveShadow = true;
  root.add(cushion);

  const lowerRobePoints = isFemale
    ? [
        new THREE.Vector2(0.01, 0.14),
        new THREE.Vector2(0.64, 0.16),
        new THREE.Vector2(0.54, 0.42),
        new THREE.Vector2(0.36, 0.66),
        new THREE.Vector2(0.24, 0.84),
      ]
    : [
        new THREE.Vector2(0.01, 0.14),
        new THREE.Vector2(0.62, 0.16),
        new THREE.Vector2(0.55, 0.44),
        new THREE.Vector2(0.41, 0.68),
        new THREE.Vector2(0.34, 0.84),
      ];
  const lowerRobeGeo = track(new THREE.LatheGeometry(lowerRobePoints, 28));
  const lowerRobe = new THREE.Mesh(lowerRobeGeo, silkPrimaryMat);
  lowerRobe.castShadow = true;
  lowerRobe.receiveShadow = true;
  root.add(lowerRobe);

  // 2. Torso Group (breathes & sways subtly)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.78, 0);
  root.add(torsoGroup);

  const sScale = spec.shoulderScale;
  const hairRibbons: THREE.Object3D[] = [];

  if (isFemale) {
    // =========================================================================
    // THREE KINGDOMS ALLURING NOBLE HANFU SILHOUETTE
    // Bare Porcelain Collarbone & Shoulders + Sweetheart Brocade Bustier +
    // Cinched Gold Waist Corset + Floating Celestial Pibo Silk Ribbons!
    // =========================================================================

    // Cinched hourglass waist & lower bodice in embroidered crimson-gold brocade
    const corsetPts = [
      new THREE.Vector2(0.25, 0.0),
      new THREE.Vector2(0.21, 0.16),
      new THREE.Vector2(0.23, 0.34),
      new THREE.Vector2(0.295, 0.50),
      new THREE.Vector2(0.24, 0.56),
    ];
    const corsetGeo = track(new THREE.LatheGeometry(corsetPts, 28));
    const corset = new THREE.Mesh(corsetGeo, silkPrimaryMat);
    corset.scale.set(1.02, 1.0, 0.74);
    corset.castShadow = true;
    torsoGroup.add(corset);

    // Sculpted Bare Porcelain Upper Chest, Collarbones & Graceful Sloped Shoulders
    const upperSkinPts = [
      new THREE.Vector2(0.26, 0.46),
      new THREE.Vector2(0.315, 0.62),
      new THREE.Vector2(0.26, 0.72),
      new THREE.Vector2(0.115, 0.79),
      new THREE.Vector2(0.072, 0.90),
    ];
    const upperSkinGeo = track(new THREE.LatheGeometry(upperSkinPts, 28));
    const upperSkin = new THREE.Mesh(upperSkinGeo, skinMat);
    upperSkin.scale.set(1.12, 1.0, 0.62);
    torsoGroup.add(upperSkin);

    // Subtle bare shoulder caps (slender smooth rounded feminine deltoids)
    const shoulderCapGeo = track(new THREE.SphereGeometry(0.082, 18, 14));
    [-1, 1].forEach((side) => {
      const sh = new THREE.Mesh(shoulderCapGeo, skinMat);
      sh.scale.set(1.06, 0.9, 0.86);
      sh.position.set(side * 0.275, 0.635, 0.01);
      torsoGroup.add(sh);
    });

    // Sculpted Contoured Bust dressed in shimmering brocade bustier (Sweetheart neckline!)
    const bustGeo = track(new THREE.SphereGeometry(0.138, 22, 18));
    [-1, 1].forEach((side) => {
      const bustMesh = new THREE.Mesh(bustGeo, silkPrimaryMat);
      bustMesh.scale.set(1.04, 0.94, 0.92);
      bustMesh.position.set(side * 0.115, 0.485, 0.138);
      torsoGroup.add(bustMesh);

      // Golden filigree arched trim along the sweetheart bustier top edge
      const trimArcGeo = track(
        new THREE.TorusGeometry(0.128, 0.011, 8, 20, Math.PI * 0.92),
      );
      const trimArc = new THREE.Mesh(trimArcGeo, trimGoldMat);
      trimArc.position.set(side * 0.112, 0.51, 0.162);
      trimArc.rotation.set(0.24, side * -0.18, side * -0.15);
      torsoGroup.add(trimArc);
    });

    // Central Ruby & Gold Brooch Clasp nestled at the sweetheart bustier center
    const centerBrooch = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(0.036, 0)),
      rubyGemMat,
    );
    centerBrooch.scale.set(0.9, 1.25, 0.45);
    centerBrooch.position.set(0, 0.505, 0.258);
    torsoGroup.add(centerBrooch);

    const broochFrame = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.042, 0.008, 8, 16)),
      trimGoldMat,
    );
    broochFrame.position.set(0, 0.505, 0.256);
    torsoGroup.add(broochFrame);

    // Delicate Golden Collarbone Necklace (Kim Ngọc Liên) + Ruby Drop Pendant on bare décolletage
    const necklaceGeo = track(
      new THREE.TorusGeometry(0.155, 0.009, 8, 26, Math.PI * 1.1),
    );
    const necklace = new THREE.Mesh(necklaceGeo, trimGoldMat);
    necklace.position.set(0, 0.72, 0.095);
    necklace.rotation.set(1.22, 0, Math.PI * 0.95);
    torsoGroup.add(necklace);

    const pendant = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(0.022, 0)),
      rubyGemMat,
    );
    pendant.scale.set(0.75, 1.35, 0.45);
    pendant.position.set(0, 0.655, 0.205);
    torsoGroup.add(pendant);

    // Off-Shoulder Draped Silk Collar / Shawl Mantle sweeping gracefully below bare shoulders
    [-1, 1].forEach((side) => {
      const drapeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.16, 0.54, 0.22),
        new THREE.Vector3(side * 0.35, 0.53, 0.06),
        new THREE.Vector3(side * 0.33, 0.58, -0.14),
        new THREE.Vector3(0, 0.64, -0.2),
      ]);
      const drapeGeo = track(new THREE.TubeGeometry(drapeCurve, 18, 0.042, 8, false));
      const drape = new THREE.Mesh(drapeGeo, robeSecondaryMat);
      torsoGroup.add(drape);

      const goldPipeGeo = track(new THREE.TubeGeometry(drapeCurve, 18, 0.011, 6, false));
      const goldPipe = new THREE.Mesh(goldPipeGeo, trimGoldMat);
      goldPipe.position.y = 0.032;
      torsoGroup.add(goldPipe);
    });

    // Cinched Imperial Gold-Embroidered Waist Belt & Jade-Tassel Clasp
    const sashGeo = track(new THREE.TorusGeometry(0.225, 0.042, 10, 28));
    const sash = new THREE.Mesh(sashGeo, robeSecondaryMat);
    sash.rotation.x = Math.PI / 2;
    sash.scale.set(1.04, 0.76, 1);
    sash.position.set(0, 0.14, 0);
    torsoGroup.add(sash);

    const goldBeltTrim = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.23, 0.011, 8, 28)),
      trimGoldMat,
    );
    goldBeltTrim.rotation.x = Math.PI / 2;
    goldBeltTrim.scale.set(1.04, 0.76, 1);
    goldBeltTrim.position.set(0, 0.18, 0);
    torsoGroup.add(goldBeltTrim);

    const buckle = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(0.055, 0)),
      trimGoldMat,
    );
    buckle.scale.set(1.0, 1.35, 0.4);
    buckle.position.set(0, 0.14, 0.20);
    torsoGroup.add(buckle);

    // Floating Celestial Three Kingdoms Silk Pibo Ribbon (Phi Bạch — slender shimmering crimson-gold scarf!)
    const piboCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.44, 0.18, 0.14),
      new THREE.Vector3(-0.54, 0.66, -0.08),
      new THREE.Vector3(-0.34, 1.02, -0.25),
      new THREE.Vector3(0.0, 1.12, -0.28),
      new THREE.Vector3(0.34, 1.02, -0.25),
      new THREE.Vector3(0.54, 0.66, -0.08),
      new THREE.Vector3(0.44, 0.18, 0.14),
    ]);
    const piboGeo = track(new THREE.TubeGeometry(piboCurve, 44, 0.032, 8, false));
    piboGeo.scale(1, 1, 0.28);
    const piboRibbon = new THREE.Mesh(piboGeo, sheerRibbonMat);
    torsoGroup.add(piboRibbon);
    hairRibbons.push(piboRibbon);
  } else {
    // =========================================================================
    // REFINED MALE HEROIC WUXIA SILHOUETTE (for Male Guest Challengers)
    // =========================================================================
    const chestPoints = [
      new THREE.Vector2(0.30 * sScale, 0.0),
      new THREE.Vector2(0.35 * sScale, 0.24),
      new THREE.Vector2(0.42 * sScale, 0.56),
      new THREE.Vector2(0.34 * sScale, 0.74),
      new THREE.Vector2(0.16 * sScale, 0.82),
    ];
    const chestGeo = track(new THREE.LatheGeometry(chestPoints, 24));
    const chest = new THREE.Mesh(chestGeo, silkPrimaryMat);
    chest.scale.set(1.05, 1.0, 0.70);
    chest.castShadow = true;
    torsoGroup.add(chest);

    const lapelGeo = track(new THREE.BoxGeometry(0.10, 0.64, 0.05));
    const leftLapel = new THREE.Mesh(lapelGeo, robeSecondaryMat);
    leftLapel.position.set(-0.075 * sScale, 0.44, 0.245);
    leftLapel.rotation.set(-0.18, 0.12, -0.32);
    torsoGroup.add(leftLapel);

    const rightLapel = new THREE.Mesh(lapelGeo, robeSecondaryMat);
    rightLapel.position.set(0.075 * sScale, 0.44, 0.252);
    rightLapel.rotation.set(-0.18, -0.12, 0.32);
    torsoGroup.add(rightLapel);

    const trimStripGeo = track(new THREE.BoxGeometry(0.022, 0.62, 0.058));
    [-1, 1].forEach((s) => {
      const t = new THREE.Mesh(trimStripGeo, trimGoldMat);
      t.position.set(s * 0.042 * sScale, 0.44, 0.258);
      t.rotation.set(-0.18, -s * 0.12, s * 0.32);
      torsoGroup.add(t);
    });

    const sashGeo = track(new THREE.TorusGeometry(0.31 * sScale, 0.05, 10, 24));
    const sash = new THREE.Mesh(sashGeo, robeSecondaryMat);
    sash.rotation.x = Math.PI / 2;
    sash.scale.set(1.04, 0.72, 1);
    sash.position.set(0, 0.07, 0);
    torsoGroup.add(sash);

    const buckle = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(0.07, 0)),
      trimGoldMat,
    );
    buckle.scale.set(1.05, 1.25, 0.42);
    buckle.position.set(0, 0.08, 0.25);
    torsoGroup.add(buckle);

    const collarGeo = track(
      new THREE.CylinderGeometry(0.17, 0.21, 0.14, 18, 1, true, Math.PI * 0.68, Math.PI * 1.64),
    );
    const collar = new THREE.Mesh(collarGeo, robeSecondaryMat);
    collar.position.set(0, 0.83, -0.02);
    torsoGroup.add(collar);
  }

  // 3. Articulated Graceful Arms (Bare Upper Arms + Gold Armlets + Flowing Silk Sleeves for Females)
  const makeArm = (sideSign: 1 | -1) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(
      sideSign * (isFemale ? 0.295 : 0.42 * sScale),
      isFemale ? 0.60 : 0.62,
      0.025,
    );

    if (isFemale) {
      // Slender bare porcelain upper arm resting gracefully downward toward the table
      const upperArm = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.054, 0.046, 0.32, 16)),
        skinMat,
      );
      upperArm.position.set(sideSign * 0.02, -0.14, 0.055);
      upperArm.rotation.x = 0.26;
      upperArm.rotation.z = -sideSign * 0.12;
      armGroup.add(upperArm);

      // Ornate Golden Upper-Arm Bracelet (Tý Xuyến)
      const armlet = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.053, 0.009, 8, 18)),
        trimGoldMat,
      );
      armlet.position.set(sideSign * 0.02, -0.14, 0.055);
      armlet.rotation.x = Math.PI / 2 + 0.26;
      armGroup.add(armlet);

      // Open-ended flared imperial crimson-gold brocade Hanfu silk sleeve draping gracefully downward
      const sleeve = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.062, 0.145, 0.36, 18, 1, true)),
        silkPrimaryMat,
      );
      sleeve.position.set(sideSign * 0.015, -0.35, 0.19);
      sleeve.rotation.x = 0.52;
      armGroup.add(sleeve);

      const wristBangle = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.05, 0.009, 8, 16)),
        trimGoldMat,
      );
      wristBangle.position.set(0, -0.45, 0.29);
      wristBangle.rotation.x = 0.45;
      armGroup.add(wristBangle);

      const hand = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.048, 14, 12)),
        skinMat,
      );
      hand.scale.set(0.84, 0.56, 1.32);
      hand.position.set(0, -0.47, 0.34);
      armGroup.add(hand);
    } else {
      const upperArm = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.10, 0.13, 0.42, 14)),
        silkPrimaryMat,
      );
      upperArm.position.set(sideSign * 0.04, -0.17, 0.12);
      upperArm.rotation.x = 0.55;
      upperArm.rotation.z = -sideSign * 0.15;
      armGroup.add(upperArm);

      const sleeve = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.12, 0.19, 0.34, 14)),
        robeSecondaryMat,
      );
      sleeve.position.set(sideSign * 0.02, -0.33, 0.33);
      sleeve.rotation.x = 1.08;
      armGroup.add(sleeve);

      const cuff = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.1, 0.016, 8, 16)),
        trimGoldMat,
      );
      cuff.position.set(0, -0.38, 0.46);
      cuff.rotation.x = 0.35;
      armGroup.add(cuff);

      const hand = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.068, 12, 10)),
        skinMat,
      );
      hand.scale.set(0.92, 0.62, 1.32);
      hand.position.set(0, -0.40, 0.53);
      armGroup.add(hand);
    }

    torsoGroup.add(armGroup);
    return armGroup;
  };

  const leftArmGroup = makeArm(-1);
  const rightArmGroup = makeArm(1);

  // 4. Sculpted Expressive Head & Painted Portrait Face Group
  const headGroup = new THREE.Group();
  headGroup.position.set(0, isFemale ? 0.92 : 0.94, 0.02);
  headGroup.scale.setScalar(spec.headScale);
  torsoGroup.add(headGroup);

  // Slender sculpted neck
  const neck = new THREE.Mesh(
    track(new THREE.CylinderGeometry(isFemale ? 0.068 : 0.092, isFemale ? 0.088 : 0.112, 0.18, 18)),
    skinMat,
  );
  neck.position.y = -0.02;
  headGroup.add(neck);

  // Single Continuous Sculpted V-Line Head Mesh with High-Res Painted Beauty Texture!
  const headGeo = track(createSculptedHeadGeometry(isFemale));
  const headMesh = new THREE.Mesh(headGeo, headFaceMat);
  headMesh.position.y = 0.22;
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Delicate Ears + Dangling Pearl-Ruby Earrings for Female Characters
  const earGeo = track(new THREE.SphereGeometry(0.036, 12, 10));
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.scale.set(0.42, 1.28, 0.78);
    ear.position.set(side * (isFemale ? 0.202 : 0.216), 0.215, -0.01);
    headGroup.add(ear);

    if (isFemale) {
      const earDropGroup = new THREE.Group();
      earDropGroup.position.set(side * 0.206, 0.165, 0.0);

      const hook = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.005, 0.005, 0.055, 6)),
        trimGoldMat,
      );
      hook.position.y = -0.025;
      earDropGroup.add(hook);

      const pearl = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.016, 10, 8)),
        pearlMat,
      );
      pearl.position.y = -0.058;
      earDropGroup.add(pearl);

      if (spec.isBotMaster) {
        const rubyDrop = new THREE.Mesh(
          track(new THREE.OctahedronGeometry(0.017, 0)),
          rubyGemMat,
        );
        rubyDrop.scale.set(0.75, 1.4, 0.75);
        rubyDrop.position.y = -0.092;
        earDropGroup.add(rubyDrop);
      }

      headGroup.add(earDropGroup);
      hairRibbons.push(earDropGroup);
    }
  });

  // Subtle Flush Animated Eyelid Shutters (invisible until blinking!) + Mood Brows & Speaking Mouth
  const eyelidGeo = track(new THREE.SphereGeometry(0.044, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const leftEyelid = new THREE.Mesh(eyelidGeo, skinMat);
  leftEyelid.scale.set(1.15, 0.72, 0.32);
  leftEyelid.position.set(-0.082, 0.238, 0.202);
  leftEyelid.rotation.x = -1.15;
  leftEyelid.visible = false;
  headGroup.add(leftEyelid);

  const rightEyelid = new THREE.Mesh(eyelidGeo, skinMat);
  rightEyelid.scale.set(1.15, 0.72, 0.32);
  rightEyelid.position.set(0.082, 0.238, 0.202);
  rightEyelid.rotation.x = -1.15;
  rightEyelid.visible = false;
  headGroup.add(rightEyelid);

  // Invisible lightweight animation proxies for rig compatibility (eyes are high-res painted on headMesh)
  const dummyGeo = track(new THREE.BufferGeometry());
  const leftPupil = new THREE.Mesh(dummyGeo, skinMat);
  const rightPupil = new THREE.Mesh(dummyGeo, skinMat);
  const leftBrow = new THREE.Mesh(dummyGeo, hairMat);
  const rightBrow = new THREE.Mesh(dummyGeo, hairMat);
  headGroup.add(leftPupil, rightPupil, leftBrow, rightBrow);

  // Subtle parted-lip inner mouth oval (stays flush & hidden when silent, opens smoothly when speaking!)
  const mouthGeo = track(new THREE.SphereGeometry(0.022, 12, 10));
  const mouth = new THREE.Mesh(mouthGeo, mouthOpenMat);
  mouth.scale.set(1.15, 0.12, 0.35);
  mouth.position.set(0, 0.132, 0.214);
  mouth.visible = false;
  headGroup.add(mouth);

  // 5. Lush Sculpted Three Kingdoms Hair & Imperial Phoenix Headdress
  // Main silky crown hair volume tilted BACKWARD (-0.34 rad) so forehead, Hoa Điền & Phoenix eyes stay 100% open!
  const hairCapGeo = track(
    new THREE.SphereGeometry(0.244, 32, 22, 0, Math.PI * 2, 0, Math.PI * 0.52),
  );
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.scale.set(isFemale ? 0.94 : 0.96, 1.12, 1.02);
  hairCap.position.set(0, 0.256, -0.038);
  hairCap.rotation.x = -0.34;
  hairCap.castShadow = true;
  headGroup.add(hairCap);

  // Graceful center-parted Three Kingdoms court hair wings curving softly around upper forehead & cheekbones
  [-1, 1].forEach((side) => {
    const bangCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.018, 0.415, 0.145),
      new THREE.Vector3(side * 0.132, 0.352, 0.176),
      new THREE.Vector3(side * 0.194, 0.228, 0.132),
      new THREE.Vector3(side * 0.184, 0.068, 0.096),
    ]);
    const bangGeo = track(new THREE.TubeGeometry(bangCurve, 16, isFemale ? 0.028 : 0.022, 8, false));
    bangGeo.scale(1, 1, 0.52);
    const bang = new THREE.Mesh(bangGeo, hairMat);
    headGroup.add(bang);
  });

  // Voluminous cascading back hair mane flowing gracefully down the back
  const backHairGeo = track(
    new THREE.CylinderGeometry(
      isFemale ? 0.175 : 0.185,
      isFemale ? 0.32 : 0.27,
      isFemale ? 0.78 : 0.64,
      20,
      1,
      true,
      Math.PI * 0.46,
      Math.PI * 1.08,
    ),
  );
  const backHair = new THREE.Mesh(backHairGeo, hairMat);
  backHair.position.set(0, -0.06, -0.075);
  headGroup.add(backHair);

  // Soft undulating shoulder locks resting gracefully over bare collarbones (for Females)
  [-1, 1].forEach((side) => {
    const lockCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.195, 0.25, 0.04),
      new THREE.Vector3(side * 0.225, 0.06, 0.08),
      new THREE.Vector3(side * 0.205, -0.14, 0.13),
      new THREE.Vector3(side * 0.175, -0.32, 0.155),
    ]);
    const lockGeo = track(new THREE.TubeGeometry(lockCurve, 16, isFemale ? 0.024 : 0.019, 8, false));
    const lockMesh = new THREE.Mesh(lockGeo, hairMat);
    headGroup.add(lockMesh);
    hairRibbons.push(lockMesh);
  });

  // Specific Sculpted Headdresses / Crowns
  if (spec.hairStyle === 'botMaster') {
    // =========================================================================
    // THREE KINGDOMS IMPERIAL PHOENIX CHIGNON (Phi Tiên Kế & Kim Phượng Bộ Diêu)
    // =========================================================================
    // Central high chignon + twin graceful wing-loops (iconic Han/Three Kingdoms court hairstyle!)
    const mainBun = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.11, 20, 16)),
      hairMat,
    );
    mainBun.scale.set(1.15, 0.92, 0.92);
    mainBun.position.set(0, 0.495, -0.025);
    headGroup.add(mainBun);

    [-1, 1].forEach((side) => {
      const wingLoop = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.088, 0.036, 10, 20)),
        hairMat,
      );
      wingLoop.position.set(side * 0.135, 0.465, -0.03);
      wingLoop.rotation.set(0.15, side * 0.35, side * -0.45);
      headGroup.add(wingLoop);
    });

    // Ornate Gilded Phoenix Filigree Diadem Crest (Kim Phượng Quan)
    const crestArch = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.135, 0.016, 10, 24, Math.PI * 1.15)),
      trimGoldMat,
    );
    crestArch.position.set(0, 0.455, 0.065);
    crestArch.rotation.z = -Math.PI * 0.075;
    headGroup.add(crestArch);

    // Sweeping Golden Phoenix Wings rising behind the crown
    [-1, 1].forEach((side) => {
      const wingCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.03, 0.51, 0.06),
        new THREE.Vector3(side * 0.12, 0.58, 0.04),
        new THREE.Vector3(side * 0.21, 0.55, 0.01),
      ]);
      const wingGold = new THREE.Mesh(
        track(new THREE.TubeGeometry(wingCurve, 12, 0.014, 6, false)),
        trimGoldMat,
      );
      headGroup.add(wingGold);

      // Slanted Golden Phoenix Hairpins (Trâm Phượng) with Pearl & Ruby Tassels (Bộ Diêu)
      const pin = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.007, 0.011, 0.36, 8)),
        trimGoldMat,
      );
      pin.position.set(side * 0.09, 0.495, -0.01);
      pin.rotation.z = side * (Math.PI / 2 - 0.38);
      headGroup.add(pin);

      const pinPearl = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.02, 10, 8)),
        pearlMat,
      );
      pinPearl.position.set(side * 0.25, 0.56, 0.01);
      headGroup.add(pinPearl);

      // Swaying Golden Tassel Drop hanging from each hairpin tip
      const tasselGroup = new THREE.Group();
      tasselGroup.position.set(side * 0.25, 0.545, 0.01);
      const chain = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6)),
        trimGoldMat,
      );
      chain.position.y = -0.06;
      tasselGroup.add(chain);
      const dropGem = new THREE.Mesh(
        track(new THREE.OctahedronGeometry(0.018, 0)),
        rubyGemMat,
      );
      dropGem.scale.set(0.75, 1.35, 0.75);
      dropGem.position.y = -0.13;
      tasselGroup.add(dropGem);
      headGroup.add(tasselGroup);
      hairRibbons.push(tasselGroup);
    });

    // Radiant Imperial Ruby Centerpiece on the Phoenix Crown
    const crownGem = new THREE.Mesh(
      track(new THREE.OctahedronGeometry(0.038, 0)),
      rubyGemMat,
    );
    crownGem.scale.set(0.85, 1.3, 0.55);
    crownGem.position.set(0, 0.55, 0.085);
    headGroup.add(crownGem);
  } else if (spec.hairStyle === 'elderCrown' || spec.hairStyle === 'topknot') {
    const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.08, 14, 12)), hairMat);
    bun.position.set(0, 0.51, -0.02);
    headGroup.add(bun);

    const guan = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.078, 0.065, 0.11, 12)),
      trimGoldMat,
    );
    guan.position.set(0, 0.51, -0.02);
    headGroup.add(guan);

    const pin = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.009, 0.009, 0.32, 8)),
      trimGoldMat,
    );
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0, 0.52, -0.02);
    headGroup.add(pin);
  } else if (spec.hairStyle === 'bambooHat') {
    const hatMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x9b7947,
        roughness: 0.82,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
    );
    const hat = new THREE.Mesh(
      track(new THREE.ConeGeometry(0.66, 0.24, 28, 1, true)),
      hatMat,
    );
    hat.position.set(0, 0.48, 0.01);
    hat.rotation.x = 0.08;
    headGroup.add(hat);

    const hatBand = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.23, 0.02, 8, 20)),
      robeSecondaryMat,
    );
    hatBand.rotation.x = Math.PI / 2;
    hatBand.position.set(0, 0.43, 0.01);
    headGroup.add(hatBand);
  } else if (spec.hairStyle === 'ironBand') {
    const band = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.23, 0.022, 8, 24)),
      trimGoldMat,
    );
    band.rotation.x = Math.PI / 2 + 0.14;
    band.position.set(0, 0.34, 0.0);
    headGroup.add(band);

    const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.08, 12, 10)), hairMat);
    bun.position.set(0, 0.5, -0.05);
    headGroup.add(bun);
  } else if (spec.hairStyle === 'twinBuns') {
    [-1, 1].forEach((s) => {
      const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.086, 14, 12)), hairMat);
      bun.position.set(s * 0.19, 0.44, -0.02);
      headGroup.add(bun);

      const ring = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.072, 0.014, 8, 16)),
        trimGoldMat,
      );
      ring.position.set(s * 0.19, 0.42, -0.02);
      ring.rotation.z = s * 0.5;
      headGroup.add(ring);
    });
  } else {
    const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.10, 16, 14)), hairMat);
    bun.position.set(0, 0.49, -0.03);
    headGroup.add(bun);

    const ornament = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.11, 0.015, 8, 18, Math.PI * 1.15)),
      trimGoldMat,
    );
    ornament.position.set(0, 0.47, 0.035);
    ornament.rotation.z = -Math.PI * 0.08;
    headGroup.add(ornament);

    const pin = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.007, 0.011, 0.36, 8)),
      trimGoldMat,
    );
    pin.rotation.z = Math.PI / 2 + 0.22;
    pin.position.set(0.02, 0.51, -0.02);
    headGroup.add(pin);
  }

  // Beard styles for mature / elder male heroes
  if (!isFemale && spec.beardStyle === 'goatee') {
    const beard = new THREE.Mesh(track(new THREE.ConeGeometry(0.05, 0.15, 10)), hairMat);
    beard.rotation.x = Math.PI;
    beard.position.set(0, -0.02, 0.175);
    headGroup.add(beard);
  } else if (!isFemale && spec.beardStyle === 'longWhite') {
    const beard = new THREE.Mesh(track(new THREE.ConeGeometry(0.088, 0.4, 12)), hairMat);
    beard.rotation.x = Math.PI;
    beard.position.set(0, -0.14, 0.185);
    headGroup.add(beard);
  }

  // 6. Radiant Imperial Phoenix-Gold Halo behind Kỳ Ma Điêu Nguyệt
  let qiHalo: THREE.Mesh | undefined;
  if (spec.isBotMaster) {
    const haloGeo = track(new THREE.TorusGeometry(0.62, 0.012, 10, 56));
    qiHalo = new THREE.Mesh(haloGeo, auraMat);
    qiHalo.position.set(0, 0.96, -0.34);
    torsoGroup.add(qiHalo);
  }

  return {
    root,
    torsoGroup,
    headGroup,
    leftBrow,
    rightBrow,
    leftEyelid,
    rightEyelid,
    leftPupil,
    rightPupil,
    mouth,
    rightArmGroup,
    leftArmGroup,
    qiHalo,
    hairRibbons,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function createBotMaster3D(): AnimatedWuxiaRig {
  return buildCompositeWuxiaCharacter({
    gender: 'nu',
    skinColor: BOT_MASTER_PROFILE.skinColor,
    robePrimary: BOT_MASTER_PROFILE.robePrimary,
    robeSecondary: BOT_MASTER_PROFILE.robeSecondary,
    trimColor: BOT_MASTER_PROFILE.trimColor,
    hairColor: BOT_MASTER_PROFILE.hairColor,
    accentGlow: BOT_MASTER_PROFILE.accentGlow,
    hairStyle: 'botMaster',
    beardStyle: 'none',
    shoulderScale: 0.88,
    headScale: 0.98,
    isBotMaster: true,
  });
}

export function createGuestCharacter3D(profile: WuxiaCharacterProfile): AnimatedWuxiaRig {
  return buildCompositeWuxiaCharacter({
    gender: profile.gender,
    skinColor: profile.skinColor,
    robePrimary: profile.robePrimary,
    robeSecondary: profile.robeSecondary,
    trimColor: profile.trimColor,
    hairColor: profile.hairColor,
    accentGlow: profile.accentGlow,
    hairStyle: profile.hairStyle,
    beardStyle: profile.beardStyle,
    shoulderScale: profile.shoulderScale,
    headScale: profile.headScale,
    isBotMaster: false,
  });
}

/**
 * Updates breathing, graceful head tilt, blink, lip-sync, arm reach gesture, and ribbon sway.
 */
export function updateCharacterAnimation(
  rig: AnimatedWuxiaRig,
  elapsed: number,
  dt: number,
  options: {
    mood: CharacterMood;
    speaking: boolean;
    gestureProgress: number;
    lookTargetYaw: number;
    lookTargetPitch: number;
    analysisIntensity: number;
  },
) {
  const damp = 1 - Math.exp(-8 * dt);

  // Graceful breathing lift & subtle feminine poise sway
  rig.torsoGroup.position.y = 0.78 + Math.sin(elapsed * 1.9) * 0.011;
  rig.torsoGroup.rotation.z = Math.sin(elapsed * 0.85) * 0.015;

  // Alluring expressive head tracking & slight conversational tilt
  const targetYaw = options.lookTargetYaw + Math.sin(elapsed * 0.75) * 0.05;
  const targetPitch =
    options.lookTargetPitch +
    (options.speaking ? Math.sin(elapsed * 5.8) * 0.032 : Math.cos(elapsed * 1.05) * 0.014);
  const targetRoll = options.speaking
    ? Math.sin(elapsed * 2.4) * 0.038
    : Math.sin(elapsed * 0.65) * 0.022;

  rig.headGroup.rotation.y += (targetYaw - rig.headGroup.rotation.y) * damp;
  rig.headGroup.rotation.x += (targetPitch - rig.headGroup.rotation.x) * damp;
  rig.headGroup.rotation.z += (targetRoll - rig.headGroup.rotation.z) * damp;

  // Natural brief eye blink shutter (stays hidden between blinks so painted phoenix eyes stay crisp!)
  const blinkPhase = elapsed % 4.4;
  const isBlinking = blinkPhase > 4.26;
  rig.leftEyelid.visible = isBlinking;
  rig.rightEyelid.visible = isBlinking;
  if (isBlinking) {
    rig.leftEyelid.rotation.x = 0.15;
    rig.rightEyelid.rotation.x = 0.15;
  }

  // Speaking parted-lip animation (visible & softly pulsing only while speaking)
  rig.mouth.visible = options.speaking;
  if (options.speaking) {
    const openY = 0.25 + Math.abs(Math.sin(elapsed * 16.5)) * 0.65;
    rig.mouth.scale.y += (openY - rig.mouth.scale.y) * (1 - Math.exp(-22 * dt));
  }

  // Right arm graceful reach gesture when executing a move
  const g = Math.sin(Math.min(1, Math.max(0, options.gestureProgress)) * Math.PI);
  const targetArmPitch = -g * 0.62 + (options.speaking ? Math.sin(elapsed * 3.2) * 0.05 : 0);
  const targetArmYaw = -g * 0.2;
  rig.rightArmGroup.rotation.x += (targetArmPitch - rig.rightArmGroup.rotation.x) * damp;
  rig.rightArmGroup.rotation.y += (targetArmYaw - rig.rightArmGroup.rotation.y) * damp;

  // Flowing hair locks, pearl tassel earrings & celestial silk Pibo ribbon sway
  rig.hairRibbons.forEach((ribbon, idx) => {
    ribbon.rotation.z = Math.sin(elapsed * 2.0 + idx * 1.15) * 0.032;
  });

  // Imperial Golden Qi Halo rotation
  if (rig.qiHalo) {
    rig.qiHalo.rotation.z = elapsed * (0.3 + options.analysisIntensity * 0.7);
    const haloScale = 1 + options.analysisIntensity * 0.12 + Math.sin(elapsed * 2.4) * 0.02;
    rig.qiHalo.scale.setScalar(haloScale);
  }
}
