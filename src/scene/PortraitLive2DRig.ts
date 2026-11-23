import { PortraitKinematicsState } from './portraitKinematics';

export type PortraitId = 'botCalm' | 'guestMale' | 'guestFemale';

export interface PortraitRigConfig {
  src: string;
  leftEye: [number, number];
  rightEye: [number, number];
  eyeRadius: [number, number];
  mouthCenter: [number, number];
  mouthRadius: [number, number];
  faceCenter: [number, number];
  anchorYDesktop: number;
  anchorYTikTok: number;
  zoomDesktop: number;
  zoomTikTok: number;
}

/**
 * ONE 100% Consistent Master Identity for Kỳ Ma Điêu Nguyệt (`botCalm`),
 * plus Guest Male & Guest Female portraits. Emotional states (calm, amused,
 * surprised, thinking, fierce, check, victory) are morphed smoothly in real-time
 * GLSL on the SAME consistent face — NEVER hard-swapping photos!
 */
export const PORTRAIT_CONFIGS: Record<PortraitId, PortraitRigConfig> = {
  botCalm: {
    src: '/src/assets/images/ky_ma_dieu_nguyet_calm_1795418022711.jpg',
    leftEye: [0.435, 0.326],
    rightEye: [0.562, 0.326],
    eyeRadius: [0.038, 0.016],
    mouthCenter: [0.498, 0.413],
    mouthRadius: [0.045, 0.017],
    faceCenter: [0.498, 0.34],
    anchorYDesktop: 0.1,
    anchorYTikTok: 0.02,
    zoomDesktop: 1.05,
    zoomTikTok: 1.03,
  },
  guestMale: {
    src: '/src/assets/images/guest_nam_challenger_1795418021799.jpg',
    leftEye: [0.46, 0.236],
    rightEye: [0.546, 0.236],
    eyeRadius: [0.03, 0.013],
    mouthCenter: [0.502, 0.3],
    mouthRadius: [0.035, 0.013],
    faceCenter: [0.502, 0.248],
    anchorYDesktop: 0.14,
    anchorYTikTok: 0.1,
    zoomDesktop: 1.08,
    zoomTikTok: 1.08,
  },
  guestFemale: {
    src: '/src/assets/images/guest_nu_challenger_1795418024765.jpg',
    leftEye: [0.44, 0.258],
    rightEye: [0.525, 0.256],
    eyeRadius: [0.031, 0.014],
    mouthCenter: [0.484, 0.321],
    mouthRadius: [0.034, 0.013],
    faceCenter: [0.486, 0.268],
    anchorYDesktop: 0.08,
    anchorYTikTok: 0.06,
    zoomDesktop: 1.24,
    zoomTikTok: 1.26,
  },
};

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vScreenUv;
void main() {
  vScreenUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
varying vec2 vScreenUv;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uBlend; // 0 = full A, 1 = full B (smooth studio crossfade!)

uniform vec2 uCanvasSize;
uniform vec2 uImageSizeA;
uniform vec2 uImageSizeB;
uniform float uAnchorYA;
uniform float uAnchorYB;
uniform float uZoomA;
uniform float uZoomB;

uniform vec2 uFaceCenter;
uniform vec2 uLeftEye;
uniform vec2 uRightEye;
uniform vec2 uEyeRadius;
uniform vec2 uMouthCenter;
uniform vec2 uMouthRadius;

uniform float uTime;
uniform float uHeadYaw;
uniform float uHeadPitch;
uniform float uHeadRoll;
uniform vec2 uEyeGaze;
uniform float uMouthOpen;
uniform float uMouthWidth;
uniform float uBrowFurrow;
uniform float uBrowRaise;
uniform float uSmile;
uniform float uEyeNarrow;
uniform float uDramaLight;
uniform float uBlink;
uniform float uBreath;
uniform float uLeanZoom;
uniform float uImpact;
uniform float uVoiceEnergy;

vec2 coverUv(vec2 screenUv, vec2 imgSize, float anchorY, float zoom) {
  float canvasAspect = uCanvasSize.x / max(uCanvasSize.y, 1.0);
  float imgAspect = imgSize.x / max(imgSize.y, 1.0);

  vec2 uv = screenUv;
  if (canvasAspect > imgAspect) {
    float scaleY = imgAspect / canvasAspect;
    uv.y = anchorY * (1.0 - scaleY) + screenUv.y * scaleY;
  } else {
    float scaleX = canvasAspect / imgAspect;
    uv.x = 0.5 + (screenUv.x - 0.5) * scaleX;
  }

  vec2 pivot = vec2(0.5, anchorY * 0.4 + 0.28);
  uv = pivot + (uv - pivot) / max(zoom, 0.5);
  return uv;
}

vec3 sampleAnimatedRig(sampler2D tex, vec2 baseUv) {
  // 1. Soft 2.5D Depth Masks (head+crown vs torso vs studio backdrop)
  vec2 relHead = (baseUv - uFaceCenter) / vec2(0.24, 0.26);
  float headMask = exp(-dot(relHead, relHead) * 1.12);

  vec2 relBody = (baseUv - vec2(uFaceCenter.x, uFaceCenter.y + 0.34)) / vec2(0.42, 0.36);
  float bodyMask = exp(-dot(relBody, relBody) * 0.88);
  float fgMask = clamp(headMask + bodyMask * 0.85, 0.0, 1.0);

  vec2 uv = baseUv;

  // 2. Silky Head Roll around neck pivot + 2.5D Studio Parallax Turn & Pitch
  vec2 neckPivot = vec2(uFaceCenter.x, uFaceCenter.y + 0.165);
  float angle = uHeadRoll * 0.052 * headMask;
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 pNeck = uv - neckPivot;
  uv = neckPivot + vec2(pNeck.x * ca - pNeck.y * sa, pNeck.x * sa + pNeck.y * ca);

  // Foreground head/body shifts smoothly in 2.5D; studio lanterns shift opposite for real depth
  vec2 headShift = vec2(-uHeadYaw * 0.032, -uHeadPitch * 0.024);
  vec2 bgShift = vec2(uHeadYaw * 0.012, uHeadPitch * 0.009);
  uv += mix(bgShift, headShift, fgMask);

  // 3. Organic Breathing (torso & shoulders rise gently, head follows subtly)
  float breathLift = (uBreath - 0.5) * 0.008;
  uv.y += breathLift * (bodyMask * 0.95 + headMask * 0.32);

  // 4. Flowing Silk Ribbons & Golden Phoenix Crown Tassels Breeze Sway
  float sideDist = smoothstep(0.11, 0.34, abs(baseUv.x - uFaceCenter.x));
  float tasselBand = smoothstep(0.14, 0.45, baseUv.y) * sideDist;
  float ribbonBand = smoothstep(0.45, 0.82, baseUv.y);
  float windAmp = 1.0 + uDramaLight * 0.65 + uImpact * 1.1 + uVoiceEnergy * 0.3;
  float sway = sin(uTime * 1.95 + baseUv.y * 8.2 + baseUv.x * 3.8) * 0.0038 * windAmp;
  uv.x += sway * (tasselBand * 0.85 + ribbonBand * 0.72);
  uv.y += cos(uTime * 1.45 + baseUv.x * 5.6) * 0.002 * ribbonBand * windAmp;

  // 5. Real-Time Eyebrow Morphing (Furrow for fierce/check/thinking, Arch for amused/surprised)
  for (int i = 0; i < 2; i++) {
    vec2 eyeC = (i == 0) ? uLeftEye : uRightEye;
    float sideSign = (i == 0) ? -1.0 : 1.0; // -1 = left brow, +1 = right brow
    vec2 browC = eyeC + vec2(0.0, -uEyeRadius.y * 1.85);
    vec2 bRel = (uv - browC) / vec2(uEyeRadius.x * 1.32, uEyeRadius.y * 1.05);
    float bDist2 = dot(bRel, bRel);
    if (bDist2 < 2.6) {
      float bMask = exp(-bDist2 * 1.15);
      // Inner side of brow (near glabella) furrows down & slightly inward
      float innerWeight = smoothstep(0.6, -0.6, bRel.x * sideSign);
      float raiseDelta = uBrowRaise * 0.0085 * bMask;
      float furrowDelta = uBrowFurrow * 0.0072 * bMask * (0.45 + 0.55 * innerWeight);
      // Sample lower y -> lifts brow UP on screen; sample higher y -> pulls brow DOWN
      uv.y += (raiseDelta - furrowDelta);
      uv.x += sideSign * uBrowFurrow * 0.0028 * bMask * innerWeight;
    }
  }

  // 6. Real-Time Board-Tracking Eye Gaze, Subtle Expressive Narrowing & Natural Blink
  float lashDarken = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 eyeC = (i == 0) ? uLeftEye : uRightEye;
    vec2 eRel = (uv - eyeC) / uEyeRadius;
    float eDist2 = dot(eRel, eRel);

    if (eDist2 < 2.2) {
      // Iris / pupil smooth gaze shift toward active board square
      float irisMask = exp(-eDist2 * 2.45) * (1.0 - uBlink * 0.95);
      uv -= vec2(uEyeGaze.x * 0.0044, uEyeGaze.y * 0.0028) * irisMask;

      // Expressive subtle squint / intense gaze (lifts lower lid slightly when smiling or fierce)
      if (uEyeNarrow > 0.01 && uBlink < 0.3) {
        float lowerLid = smoothstep(-0.1, 0.85, eRel.y) * exp(-eRel.x * eRel.x * 1.25) * exp(-eRel.y * eRel.y * 1.3);
        uv.y += uEyeNarrow * uEyeRadius.y * 0.34 * lowerLid * (1.0 - uBlink);
      }

      // Smooth upper-eyelid blink closure
      if (uBlink > 0.01) {
        float lidMask = exp(-eRel.x * eRel.x * 1.15) * exp(-eRel.y * eRel.y * 1.4);
        uv.y -= uBlink * uEyeRadius.y * 1.15 * lidMask;
        float crease = exp(-pow((eRel.y - 0.14) * 4.2, 2.0)) * exp(-eRel.x * eRel.x * 1.3);
        lashDarken = max(lashDarken, crease * uBlink * 0.38);
      }
    }
  }

  // 7. Real-Time Smile Corners + Audio-Reactive Lip-Sync Deformation
  float mouthDarken = 0.0;
  float teethGlint = 0.0;
  vec2 mRel = (uv - uMouthCenter) / uMouthRadius;
  float mDist2 = dot(mRel, mRel);

  if (mDist2 < 6.5) {
    // Graceful smile / confident smirk lifting outer mouth corners
    if (uSmile > 0.02) {
      float cornerMask = smoothstep(0.32, 1.05, abs(mRel.x)) * exp(-mRel.y * mRel.y * 1.25) * exp(-max(0.0, abs(mRel.x) - 1.05) * 1.8);
      uv.y += uSmile * uMouthRadius.y * 0.42 * cornerMask;
      uv.x -= sign(mRel.x) * uSmile * uMouthRadius.x * 0.06 * cornerMask;
    }

    if (uMouthOpen > 0.005) {
      float openAmt = uMouthOpen;
      float horizEnv = exp(-mRel.x * mRel.x * 0.95);

      // Gentle jaw & lower-lip downward pull
      float lowerZone = smoothstep(-0.18, 0.32, mRel.y) * exp(-max(0.0, mRel.y - 0.45) * 0.65);
      uv.y -= openAmt * uMouthRadius.y * 0.86 * lowerZone * horizEnv;

      // Subtle upper-lip lift
      float upperZone = smoothstep(0.15, -0.45, mRel.y) * exp(-max(0.0, -mRel.y - 0.35) * 1.25);
      uv.y += openAmt * uMouthRadius.y * 0.15 * upperZone * horizEnv;

      // Subtle lip-width rounding per syllable
      uv.x -= mRel.x * uMouthRadius.x * uMouthWidth * 0.15 * exp(-mDist2 * 0.75);

      // Soft dark oral interior aperture strictly centered in the parted lip gap
      float apertureH = max(0.08, openAmt * 0.46);
      vec2 apRel = vec2(mRel.x / 0.58, (mRel.y - openAmt * 0.14) / apertureH);
      float apDist = dot(apRel, apRel);
      mouthDarken = smoothstep(1.0, 0.22, apDist) * smoothstep(0.08, 0.35, openAmt);

      // Delicate warm-ivory upper-teeth hint tucked strictly inside upper cavity
      vec2 tRel = vec2(mRel.x / 0.34, (mRel.y - openAmt * 0.05) / (apertureH * 0.34));
      teethGlint = smoothstep(1.0, 0.30, dot(tRel, tRel)) * smoothstep(0.45, 0.90, openAmt) * 0.18;
    }
  }

  vec2 clampedUv = clamp(uv, vec2(0.001), vec2(0.999));
  vec3 col = texture2D(tex, clampedUv).rgb;

  // Apply natural closed-eyelash crease shading
  col *= (1.0 - lashDarken);

  // Apply warm natural oral interior & delicate upper-teeth highlight strictly inside cavity
  vec3 oralInterior = vec3(0.13, 0.032, 0.045);
  col = mix(col, oralInterior, mouthDarken * 0.84);
  col = mix(col, vec3(0.84, 0.74, 0.70), teethGlint * mouthDarken * mouthDarken);

  // 8. Studio 3-Point Dynamic Key & Rim Lighting (smoothly reflects emotion without swapping faces!)
  float rim = smoothstep(0.16, 0.46, length(baseUv - uFaceCenter)) * fgMask;
  // Warm golden studio beauty rim during calm/speaking
  col += vec3(0.96, 0.72, 0.34) * rim * (0.04 + uVoiceEnergy * 0.12 + uSmile * 0.05);
  // Dramatic crimson-gold battle rim during fierce/check/captures
  float battleRim = clamp(uDramaLight * 0.75 + uImpact * 0.5, 0.0, 1.0);
  col += vec3(0.95, 0.25, 0.16) * rim * battleRim * 0.24;
  // Subtle cinematic contrast lift in intense battle moments (keeps skin luminous & natural!)
  col = mix(col, clamp((col - 0.5) * 1.07 + 0.5, 0.0, 1.0), uDramaLight * 0.45);

  return col;
}

void main() {
  float dynamicZoom = 1.0 + uLeanZoom * 0.052 + uImpact * 0.022;
  vec2 baseUvA = coverUv(vScreenUv, uImageSizeA, uAnchorYA, uZoomA * dynamicZoom);
  vec3 colA = sampleAnimatedRig(uTexA, baseUvA);

  if (uBlend > 0.002) {
    vec2 baseUvB = coverUv(vScreenUv, uImageSizeB, uAnchorYB, uZoomB * dynamicZoom);
    vec3 colB = sampleAnimatedRig(uTexB, baseUvB);
    // Smooth cosine studio dissolve between Bot <-> Guest when manually switched
    float smoothT = uBlend * uBlend * (3.0 - 2.0 * uBlend);
    gl_FragColor = vec4(mix(colA, colB, smoothT), 1.0);
  } else {
    gl_FragColor = vec4(colA, 1.0);
  }
}
`;

/**
 * Studio-Grade WebGL Live2D Portrait Engine:
 * Single consistent master character identity with real-time GLSL facial morphs,
 * lip-sync, board-tracking gaze, 3-point dynamic lighting, and silky dual-texture
 * studio crossfade when switching Bot <-> Guest.
 */
export class PortraitLive2DRig {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private vertexBuf: WebGLBuffer | null = null;
  private readonly textures = new Map<PortraitId, { tex: WebGLTexture; w: number; h: number }>();
  private readonly loadingIds = new Set<PortraitId>();
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  private activeId: PortraitId = 'botCalm';
  private prevId: PortraitId = 'botCalm';
  private crossfade = 1.0; // 1.0 = fully showing activeId

  public ready = false;
  public supported = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.gl = gl;
    if (!gl) return;

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return;
    }

    this.program = prog;
    this.supported = true;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.vertexBuf = buf;

    const uniformNames = [
      'uTexA',
      'uTexB',
      'uBlend',
      'uCanvasSize',
      'uImageSizeA',
      'uImageSizeB',
      'uAnchorYA',
      'uAnchorYB',
      'uZoomA',
      'uZoomB',
      'uFaceCenter',
      'uLeftEye',
      'uRightEye',
      'uEyeRadius',
      'uMouthCenter',
      'uMouthRadius',
      'uTime',
      'uHeadYaw',
      'uHeadPitch',
      'uHeadRoll',
      'uEyeGaze',
      'uMouthOpen',
      'uMouthWidth',
      'uBrowFurrow',
      'uBrowRaise',
      'uSmile',
      'uEyeNarrow',
      'uDramaLight',
      'uBlink',
      'uBreath',
      'uLeanZoom',
      'uImpact',
      'uVoiceEnergy',
    ];
    uniformNames.forEach((name) => {
      this.uniforms.set(name, gl.getUniformLocation(prog, name));
    });

    // Preload master host & guest portraits immediately so transitions never pop
    this.ensurePortraitLoaded('botCalm');
    this.ensurePortraitLoaded('guestMale');
    this.ensurePortraitLoaded('guestFemale');
  }

  private compileShader(
    gl: WebGLRenderingContext,
    type: number,
    src: string,
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  public ensurePortraitLoaded(id: PortraitId, onLoad?: () => void) {
    if (!this.gl || this.textures.has(id) || this.loadingIds.has(id)) return;
    this.loadingIds.add(id);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.loadingIds.delete(id);
      const gl = this.gl;
      if (!gl || !this.program) return;
      const tex = gl.createTexture();
      if (!tex) return;

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      this.textures.set(id, {
        tex,
        w: img.naturalWidth || 896,
        h: img.naturalHeight || 1200,
      });
      this.ready = true;
      onLoad?.();
    };
    img.onerror = () => {
      this.loadingIds.delete(id);
    };
    img.src = PORTRAIT_CONFIGS[id].src;
  }

  public resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(64, Math.floor(width * dpr));
    const ph = Math.max(64, Math.floor(height * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
  }

  public render(
    targetId: PortraitId,
    variant: 'widescreen' | 'tiktok',
    elapsed: number,
    dt: number,
    k: PortraitKinematicsState,
  ): boolean {
    const gl = this.gl;
    if (!gl || !this.program || !this.vertexBuf) return false;

    this.ensurePortraitLoaded(targetId);

    // Trigger smooth 420ms studio crossfade ONLY when switching Bot <-> Guest
    if (targetId !== this.activeId && this.textures.has(targetId)) {
      this.prevId = this.activeId;
      this.activeId = targetId;
      this.crossfade = 0.0;
    }

    if (this.crossfade < 1.0) {
      this.crossfade = Math.min(1.0, this.crossfade + dt / 0.42);
    }

    const entryB = this.textures.get(this.activeId) ?? this.textures.get('botCalm');
    const entryA = this.textures.get(this.prevId) ?? entryB;
    if (!entryA || !entryB) return false;

    const cfgA = PORTRAIT_CONFIGS[this.prevId] ?? PORTRAIT_CONFIGS.botCalm;
    const cfgB = PORTRAIT_CONFIGS[this.activeId] ?? PORTRAIT_CONFIGS.botCalm;
    const isBlending = this.crossfade < 0.998 && this.prevId !== this.activeId;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    const aPos = gl.getAttribLocation(this.program, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // When fully settled, bind activeId to uTexA with uBlend = 0 for single-sample speed
    const texPrimary = isBlending ? entryA : entryB;
    const cfgPrimary = isBlending ? cfgA : cfgB;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texPrimary.tex);
    gl.uniform1i(this.uniforms.get('uTexA') ?? null, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, entryB.tex);
    gl.uniform1i(this.uniforms.get('uTexB') ?? null, 1);

    gl.uniform1f(this.uniforms.get('uBlend') ?? null, isBlending ? this.crossfade : 0.0);

    gl.uniform2f(this.uniforms.get('uCanvasSize') ?? null, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.get('uImageSizeA') ?? null, texPrimary.w, texPrimary.h);
    gl.uniform2f(this.uniforms.get('uImageSizeB') ?? null, entryB.w, entryB.h);

    gl.uniform1f(
      this.uniforms.get('uAnchorYA') ?? null,
      variant === 'tiktok' ? cfgPrimary.anchorYTikTok : cfgPrimary.anchorYDesktop,
    );
    gl.uniform1f(
      this.uniforms.get('uAnchorYB') ?? null,
      variant === 'tiktok' ? cfgB.anchorYTikTok : cfgB.anchorYDesktop,
    );
    gl.uniform1f(
      this.uniforms.get('uZoomA') ?? null,
      variant === 'tiktok' ? cfgPrimary.zoomTikTok : cfgPrimary.zoomDesktop,
    );
    gl.uniform1f(
      this.uniforms.get('uZoomB') ?? null,
      variant === 'tiktok' ? cfgB.zoomTikTok : cfgB.zoomDesktop,
    );

    // Facial landmarks always track the target portrait
    gl.uniform2f(this.uniforms.get('uFaceCenter') ?? null, cfgB.faceCenter[0], cfgB.faceCenter[1]);
    gl.uniform2f(this.uniforms.get('uLeftEye') ?? null, cfgB.leftEye[0], cfgB.leftEye[1]);
    gl.uniform2f(this.uniforms.get('uRightEye') ?? null, cfgB.rightEye[0], cfgB.rightEye[1]);
    gl.uniform2f(this.uniforms.get('uEyeRadius') ?? null, cfgB.eyeRadius[0], cfgB.eyeRadius[1]);
    gl.uniform2f(this.uniforms.get('uMouthCenter') ?? null, cfgB.mouthCenter[0], cfgB.mouthCenter[1]);
    gl.uniform2f(this.uniforms.get('uMouthRadius') ?? null, cfgB.mouthRadius[0], cfgB.mouthRadius[1]);

    gl.uniform1f(this.uniforms.get('uTime') ?? null, elapsed);
    gl.uniform1f(this.uniforms.get('uHeadYaw') ?? null, k.headYaw);
    gl.uniform1f(this.uniforms.get('uHeadPitch') ?? null, k.headPitch);
    gl.uniform1f(this.uniforms.get('uHeadRoll') ?? null, k.headRoll);
    gl.uniform2f(this.uniforms.get('uEyeGaze') ?? null, k.eyeGazeX, k.eyeGazeY);
    gl.uniform1f(this.uniforms.get('uMouthOpen') ?? null, k.mouthOpen);
    gl.uniform1f(this.uniforms.get('uMouthWidth') ?? null, k.mouthWidth);
    gl.uniform1f(this.uniforms.get('uBrowFurrow') ?? null, k.browFurrow);
    gl.uniform1f(this.uniforms.get('uBrowRaise') ?? null, k.browRaise);
    gl.uniform1f(this.uniforms.get('uSmile') ?? null, k.smile);
    gl.uniform1f(this.uniforms.get('uEyeNarrow') ?? null, k.eyeNarrow);
    gl.uniform1f(this.uniforms.get('uDramaLight') ?? null, k.dramaLight);
    gl.uniform1f(this.uniforms.get('uBlink') ?? null, k.blink);
    gl.uniform1f(this.uniforms.get('uBreath') ?? null, k.breath);
    gl.uniform1f(this.uniforms.get('uLeanZoom') ?? null, k.leanZoom);
    gl.uniform1f(this.uniforms.get('uImpact') ?? null, k.impactPulse);
    gl.uniform1f(this.uniforms.get('uVoiceEnergy') ?? null, k.voiceEnergy);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }

  public dispose() {
    const gl = this.gl;
    if (!gl) return;
    for (const entry of this.textures.values()) {
      gl.deleteTexture(entry.tex);
    }
    this.textures.clear();
    if (this.vertexBuf) gl.deleteBuffer(this.vertexBuf);
    if (this.program) gl.deleteProgram(this.program);
    this.program = null;
    this.vertexBuf = null;
  }
}
