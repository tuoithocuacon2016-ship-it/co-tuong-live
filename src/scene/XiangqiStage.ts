import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BOARD_COLS,
  BOARD_ROWS,
  BoardState,
  Coord,
  Move,
  Piece,
  PieceType,
  Side,
  findKing,
} from '../engine/xiangqi';
import { DeepAnalysisResult } from '../engine/ai';
import { WuxiaCharacterProfile } from '../data/characters';
import {
  createContactShadowTexture,
  createPieceFaceTexture,
  createStoneTerraceTextures,
  createXiangqiBoardTextures,
} from './textures';
import {
  DEFAULT_PIECE_STYLE,
  PIECE_THEMES,
  PieceVisualConfig,
} from './pieceStyle';
import { computeResponsiveBoardCamera } from './boardCamera';
import {
  AnimatedWuxiaRig,
  CharacterMood,
  createBotMaster3D,
  createGuestCharacter3D,
  updateCharacterAnimation,
} from './characters3d';
import { WuxiaEffectsController } from './wuxiaEffects';

export type CameraPreset = 'liveBot' | 'duel' | 'board' | 'guest';
export type ZoomFocus = 'bot' | 'guest';

interface PieceVisual {
  piece: Piece;
  group: THREE.Group;
  row: number;
  col: number;
}

interface PieceMoveAnim {
  pieceId: string;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  elapsed: number;
  duration: number;
}

export interface StageCallbacks {
  onSquareClick?: (row: number, col: number) => void;
}

const BOARD_WORLD_W = 4.2;
const BOARD_WORLD_D = 4.725;
const TABLE_TOP_Y = 0.86;
const BOARD_TOP_Y = TABLE_TOP_Y + 0.08;

// Matches canvas pad ratios in textures.ts (padX=112/1024, padY=126/1152)
const GRID_WORLD_W = BOARD_WORLD_W * (1 - (2 * 112) / 1024);
const GRID_WORLD_D = BOARD_WORLD_D * (1 - (2 * 126) / 1152);
const CELL_W = GRID_WORLD_W / 8;
const CELL_D = GRID_WORLD_D / 9;

// Pre-allocated scratch objects for zero-GC render loop
const _desiredCamPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _desiredZoomPos = new THREE.Vector3();
const _desiredZoomTarget = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _shakeOffset = new THREE.Vector3();

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

export class XiangqiStage {
  private readonly container: HTMLElement;
  private readonly callbacks: StageCallbacks;
  private readonly isSoftwareGl: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly zoomCamera: THREE.PerspectiveCamera;
  private readonly zoomTarget = new THREE.Vector3(0, 1.66, -3.14);
  private readonly controls: OrbitControls;

  private readonly boardGroup = new THREE.Group();
  private readonly piecesGroup = new THREE.Group();
  private readonly lanterns: THREE.Group[] = [];
  private readonly squareHitMeshes: THREE.Mesh[] = [];

  private readonly effects: WuxiaEffectsController;
  private readonly botRig: AnimatedWuxiaRig;
  private guestRig: AnimatedWuxiaRig | null = null;

  private readonly pieceVisuals = new Map<string, PieceVisual>();
  private readonly pieceFaceTextures = new Map<string, THREE.CanvasTexture>();
  private pieceStyle: PieceVisualConfig = { ...DEFAULT_PIECE_STYLE };
  private readonly pieceBodyGeo: THREE.LatheGeometry;
  private readonly pieceTopGeo: THREE.CircleGeometry;
  private readonly pieceShadowGeo: THREE.CircleGeometry;
  private readonly pieceShadowMat: THREE.MeshBasicMaterial;
  private readonly redBodyMat: THREE.MeshStandardMaterial;
  private readonly blackBodyMat: THREE.MeshStandardMaterial;
  private readonly selectedRing: THREE.Mesh;
  private readonly legalDotsGroup = new THREE.Group();

  private activeMoveAnim: PieceMoveAnim | null = null;
  private botGestureProgress = 1;
  private guestGestureProgress = 1;
  private botMood: CharacterMood = 'calm';
  private botSpeaking = false;
  private showAnalysis = true;
  private hitstopTimer = 0;
  private trauma = 0;

  private isTitleMode = true;
  private splitScreen = true;
  private tiktokMode = false;
  private zoomFocus: ZoomFocus = 'bot';
  private snapZoomCamera = true;
  private cameraPreset: CameraPreset = 'liveBot';
  private userControllingCamera = false;
  private transitionCamera = true;
  private viewportWidth = 320;
  private viewportHeight = 240;

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private elapsed = 0;

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    initialBoard: BoardState,
    initialGuest: WuxiaCharacterProfile,
    callbacks: StageCallbacks = {},
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);
    this.viewportWidth = width;
    this.viewportHeight = height;

    // 1. Renderer with ACESFilmic & Software-WebGL guard
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Horizon-Matched Twilight Mist Fog, & RoomEnvironment PBR reflections
    this.scene = new THREE.Scene();
    const bgHex = 0x11131d;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.032);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex);
    pmrem.dispose();

    // 3. Cameras & OrbitControls (start directly on dramatic carved 3D Xiangqi board framing)
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.15, 110);
    this.camera.position.set(1.55, 4.35, 3.85);

    this.zoomCamera = new THREE.PerspectiveCamera(33, (width * 0.4) / height, 0.1, 90);
    this.zoomCamera.position.set(0.14, 2.08, -0.22);
    this.zoomCamera.lookAt(this.zoomTarget);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minPolarAngle = 0.2;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 12.5;
    this.controls.target.set(0.35, 0.9, -0.1);
    this.camera.lookAt(this.controls.target);

    this.controls.addEventListener('start', () => {
      if (!this.isTitleMode) {
        this.userControllingCamera = true;
        this.transitionCamera = false;
      }
    });

    // 4. Balanced Warm/Cool Three-Point + Temple Lantern Lighting Rig
    const hemi = new THREE.HemisphereLight(0x7d96c8, 0x2a1d17, 0.82);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe1b5, 1.85);
    keyLight.position.set(4.5, 8.5, 5.2);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5.5;
    keyLight.shadow.camera.right = 5.5;
    keyLight.shadow.camera.top = 5.5;
    keyLight.shadow.camera.bottom = -5.5;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 24;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Cool moonlight rim separating Bot Master's silhouette from twilight mountains
    const rimLight = new THREE.DirectionalLight(0x88b4f0, 1.05);
    rimLight.position.set(-4.5, 5.5, -6.5);
    this.scene.add(rimLight);

    // Sculptural 3/4 warm-peach beauty key light + soft rose-gold rim for Kỳ Ma Điêu Nguyệt
    const botFaceLight = new THREE.PointLight(0xffe1cb, 0.85, 8.5, 1.65);
    botFaceLight.position.set(0.95, 2.35, -1.25);
    this.scene.add(botFaceLight);

    const botRimLight = new THREE.PointLight(0xff8da6, 0.72, 7, 1.65);
    botRimLight.position.set(-0.9, 2.38, -3.72);
    this.scene.add(botRimLight);

    // Warm portrait fill light for the Guest Challenger face when zoomed in
    const guestFaceLight = new THREE.PointLight(0xffcfa0, 1.65, 8.5, 1.6);
    guestFaceLight.position.set(-0.55, 2.6, 1.95);
    this.scene.add(guestFaceLight);

    const boardFillLight = new THREE.PointLight(0xffb86b, 1.15, 8, 1.8);
    boardFillLight.position.set(-0.6, 2.4, 1.45);
    this.scene.add(boardFillLight);

    // 5. Build Environment: Mountain-Cliff Wuxia Pavilion ("Kỳ Đài Vân Đỉnh")
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.buildPavilionEnvironment(maxAniso);

    // 6. Build Carved Rosewood Xiangqi Table & Board
    this.buildXiangqiTable(maxAniso);
    this.scene.add(this.boardGroup);
    this.scene.add(this.piecesGroup);
    this.scene.add(this.legalDotsGroup);

    // 7. Shared LatheGeometry, Grounded Contact Shadow & Zero-Glare PBR Materials for 32 Xiangqi Pieces
    const pieceRadius = Math.min(CELL_W, CELL_D) * 0.468;
    const lathePts = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(pieceRadius * 0.94, 0),
      new THREE.Vector2(pieceRadius, 0.03),
      new THREE.Vector2(pieceRadius, 0.118),
      new THREE.Vector2(pieceRadius * 0.945, 0.155),
      new THREE.Vector2(0.001, 0.155),
    ];
    this.pieceBodyGeo = new THREE.LatheGeometry(lathePts, 28);
    this.pieceTopGeo = new THREE.CircleGeometry(pieceRadius * 0.942, 28);
    this.pieceShadowGeo = new THREE.CircleGeometry(pieceRadius * 1.14, 24);
    const pieceShadowTex = createContactShadowTexture();
    this.pieceShadowMat = new THREE.MeshBasicMaterial({
      map: pieceShadowTex,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const initTheme = PIECE_THEMES[this.pieceStyle.theme];
    this.redBodyMat = new THREE.MeshStandardMaterial({
      color: initTheme.red.bodyColorHex,
      roughness: 0.34,
      metalness: 0.08,
    });
    this.blackBodyMat = new THREE.MeshStandardMaterial({
      color: initTheme.black.bodyColorHex,
      roughness: 0.36,
      metalness: 0.14,
    });
    this.disposables.push(
      this.pieceBodyGeo,
      this.pieceTopGeo,
      this.pieceShadowGeo,
      pieceShadowTex,
      this.pieceShadowMat,
      this.redBodyMat,
      this.blackBodyMat,
    );

    // Selected piece golden ring
    const selGeo = new THREE.RingGeometry(pieceRadius * 1.05, pieceRadius * 1.24, 28);
    const selMat = new THREE.MeshBasicMaterial({
      color: 0xffe07d,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.selectedRing = new THREE.Mesh(selGeo, selMat);
    this.selectedRing.rotation.x = -Math.PI / 2;
    this.selectedRing.visible = false;
    this.scene.add(this.selectedRing);
    this.disposables.push(selGeo, selMat);

    // 8. Primitive doll rigs kept hidden — broadcast host portrait uses AAA 3ds Max / UE5 CGI Studio Pane
    this.botRig = createBotMaster3D();
    this.botRig.root.position.set(0, 0.01, -3.15);
    this.botRig.root.visible = false;
    this.scene.add(this.botRig.root);

    // 9. Store guest profile without cluttering the carved 3D board table
    this.setGuestCharacter(initialGuest);

    // 10. Wuxia 3D Analysis & Battle Effects Controller
    this.effects = new WuxiaEffectsController(
      (r, c, yOff = 0) => this.coordToWorld(r, c, yOff),
      maxAniso,
    );
    this.scene.add(this.effects.group);

    // 11. Populate Initial 32 Pieces
    this.syncBoard(initialBoard, null, false);

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Events
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Start frame-paced loop
    this.tick();
  }

  public coordToWorld(row: number, col: number, yOffset = 0): THREE.Vector3 {
    const x = (col - 4) * CELL_W;
    const z = (row - 4.5) * CELL_D;
    return new THREE.Vector3(x, BOARD_TOP_Y + yOffset, z);
  }

  private buildPavilionEnvironment(maxAniso: number) {
    const stoneTex = createStoneTerraceTextures(maxAniso);
    const shadowTex = createContactShadowTexture();
    this.disposables.push(stoneTex.map, stoneTex.bumpMap, shadowTex);

    // Octagonal stone mountain terrace grounded at y = 0
    const terraceGeo = new THREE.CylinderGeometry(8.2, 8.9, 0.6, 8);
    const terraceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stoneTex.map,
      bumpMap: stoneTex.bumpMap,
      bumpScale: 0.04,
      roughness: 0.86,
      metalness: 0.06,
    });
    const terrace = new THREE.Mesh(terraceGeo, terraceMat);
    terrace.position.y = -0.3;
    terrace.receiveShadow = true;
    this.scene.add(terrace);
    this.disposables.push(terraceGeo, terraceMat);

    // Outer bronze-trimmed stone rim step
    const rimGeo = new THREE.TorusGeometry(8.15, 0.14, 8, 8);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x3b3642,
      roughness: 0.72,
      metalness: 0.22,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = Math.PI / 8;
    rim.position.y = 0.02;
    this.scene.add(rim);
    this.disposables.push(rimGeo, rimMat);

    // Radial contact shadow beneath table & characters
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const tableShadowGeo = new THREE.CircleGeometry(3.4, 24);
    const tableShadow = new THREE.Mesh(tableShadowGeo, shadowMat);
    tableShadow.rotation.x = -Math.PI / 2;
    tableShadow.position.y = 0.015;
    this.scene.add(tableShadow);
    this.disposables.push(tableShadowGeo, shadowMat);

    // 4 Composite Pavilion Pillars with Stone Plinths, Bronze Collars & Hanging Paper Lanterns
    const pillarWoodMat = new THREE.MeshStandardMaterial({
      color: 0x5c1816,
      roughness: 0.42,
      metalness: 0.1,
    });
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xb88b44,
      roughness: 0.28,
      metalness: 0.84,
    });
    const lanternPaperMat = new THREE.MeshStandardMaterial({
      color: 0xffc36b,
      emissive: 0xff8b36,
      emissiveIntensity: 1.55,
      roughness: 0.55,
      metalness: 0.0,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x1d222e,
      roughness: 0.65,
      metalness: 0.22,
    });
    this.disposables.push(pillarWoodMat, bronzeMat, lanternPaperMat, roofMat);

    const pillarPositions: Array<[number, number]> = [
      [-5.2, -5.2],
      [5.2, -5.2],
      [-5.2, 5.2],
      [5.2, 5.2],
    ];

    const plinthGeo = new THREE.CylinderGeometry(0.36, 0.44, 0.34, 8);
    const shaftGeo = new THREE.CylinderGeometry(0.2, 0.22, 5.4, 16);
    const collarRingGeo = new THREE.TorusGeometry(0.22, 0.032, 8, 16);
    const lanternBodyGeo = new THREE.SphereGeometry(0.24, 14, 12);
    const lanternCapGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12);
    this.disposables.push(plinthGeo, shaftGeo, collarRingGeo, lanternBodyGeo, lanternCapGeo);

    pillarPositions.forEach(([px, pz]) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(px, 0, pz);

      const plinth = new THREE.Mesh(plinthGeo, rimMat);
      plinth.position.y = 0.17;
      pGroup.add(plinth);

      const shaft = new THREE.Mesh(shaftGeo, pillarWoodMat);
      shaft.position.y = 3.04;
      shaft.castShadow = true;
      pGroup.add(shaft);

      const collar = new THREE.Mesh(collarRingGeo, bronzeMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.38;
      pGroup.add(collar);

      // Horizontal bracket arm toward center holding a swaying glowing paper lantern
      const dirX = px < 0 ? 1 : -1;
      const dirZ = pz < 0 ? 1 : -1;
      const bracketGeo = new THREE.BoxGeometry(0.95, 0.08, 0.08);
      const bracket = new THREE.Mesh(bracketGeo, pillarWoodMat);
      bracket.position.set(dirX * 0.45, 4.45, dirZ * 0.45);
      bracket.rotation.y = Math.atan2(dirX, dirZ) + Math.PI / 2;
      pGroup.add(bracket);
      this.disposables.push(bracketGeo);

      const lanternGroup = new THREE.Group();
      lanternGroup.position.set(dirX * 0.78, 4.42, dirZ * 0.78);

      const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6);
      const cord = new THREE.Mesh(cordGeo, bronzeMat);
      cord.position.y = -0.21;
      lanternGroup.add(cord);
      this.disposables.push(cordGeo);

      const lBody = new THREE.Mesh(lanternBodyGeo, lanternPaperMat);
      lBody.scale.set(1, 1.32, 1);
      lBody.position.y = -0.68;
      lanternGroup.add(lBody);

      const topCap = new THREE.Mesh(lanternCapGeo, bronzeMat);
      topCap.position.y = -0.38;
      lanternGroup.add(topCap);

      const botCap = new THREE.Mesh(lanternCapGeo, bronzeMat);
      botCap.position.y = -0.98;
      lanternGroup.add(botCap);

      pGroup.add(lanternGroup);
      this.lanterns.push(lanternGroup);
      this.scene.add(pGroup);
    });

    // Overhead pagoda eaves beam frame (tall silhouette landmark framing the background)
    const beamGeo = new THREE.BoxGeometry(10.8, 0.24, 0.32);
    const beamN = new THREE.Mesh(beamGeo, roofMat);
    beamN.position.set(0, 5.65, -5.2);
    this.scene.add(beamN);

    const beamS = new THREE.Mesh(beamGeo, roofMat);
    beamS.position.set(0, 5.65, 5.2);
    this.scene.add(beamS);

    const sideBeamGeo = new THREE.BoxGeometry(0.32, 0.24, 10.8);
    const beamW = new THREE.Mesh(sideBeamGeo, roofMat);
    beamW.position.set(-5.2, 5.65, 0);
    this.scene.add(beamW);

    const beamE = new THREE.Mesh(sideBeamGeo, roofMat);
    beamE.position.set(5.2, 5.65, 0);
    this.scene.add(beamE);
    this.disposables.push(beamGeo, sideBeamGeo);

    // Distant Encircling Wuxia Ink-Wash Mountain Silhouette Peaks (natural outdoor perimeter!)
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x181c2b,
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    const distantRidgeMat = new THREE.MeshStandardMaterial({
      color: 0x131724,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: true,
    });
    this.disposables.push(mountainMat, distantRidgeMat);

    const peakCount = 14;
    for (let i = 0; i < peakCount; i++) {
      const angle = (i / peakCount) * Math.PI * 2;
      const dist = 24 + (i % 3) * 8;
      const height = 10 + ((i * 7) % 13);
      const radius = 5.5 + ((i * 5) % 6);
      const coneGeo = new THREE.ConeGeometry(radius, height, 6);
      const peak = new THREE.Mesh(coneGeo, i % 2 === 0 ? mountainMat : distantRidgeMat);
      peak.position.set(
        Math.cos(angle) * dist,
        height * 0.42 - 3.6,
        Math.sin(angle) * dist,
      );
      peak.rotation.y = i * 0.7;
      this.scene.add(peak);
      this.disposables.push(coneGeo);
    }

    // Moon disc glowing faintly behind the Bot Master's mountain peaks
    const moonGeo = new THREE.CircleGeometry(3.2, 32);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xf4dfb4,
      transparent: true,
      opacity: 0.28,
      fog: false,
    });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(6.5, 11.5, -36);
    this.scene.add(moon);
    this.disposables.push(moonGeo, moonMat);
  }

  private buildXiangqiTable(maxAniso: number) {
    const boardTex = createXiangqiBoardTextures(maxAniso);
    this.disposables.push(boardTex.map, boardTex.bumpMap);

    const rosewoodMat = new THREE.MeshStandardMaterial({
      color: 0x3b1f14,
      roughness: 0.44,
      metalness: 0.08,
    });
    const bronzeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xc99c4c,
      roughness: 0.25,
      metalness: 0.88,
    });
    const boardSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: boardTex.map,
      bumpMap: boardTex.bumpMap,
      bumpScale: 0.015,
      roughness: 0.42,
      metalness: 0.05,
    });
    this.disposables.push(rosewoodMat, bronzeTrimMat, boardSurfaceMat);

    // Table chassis slab
    const tableSlabGeo = new THREE.BoxGeometry(BOARD_WORLD_W + 0.56, 0.18, BOARD_WORLD_D + 0.56);
    const tableSlab = new THREE.Mesh(tableSlabGeo, rosewoodMat);
    tableSlab.position.y = TABLE_TOP_Y - 0.09;
    tableSlab.castShadow = true;
    tableSlab.receiveShadow = true;
    this.boardGroup.add(tableSlab);

    // Raised inlaid board slab
    const boardSlabGeo = new THREE.BoxGeometry(BOARD_WORLD_W, 0.08, BOARD_WORLD_D);
    const boardSlab = new THREE.Mesh(boardSlabGeo, [
      rosewoodMat,
      rosewoodMat,
      boardSurfaceMat, // Top face (+Y)
      rosewoodMat,
      rosewoodMat,
      rosewoodMat,
    ]);
    boardSlab.position.y = TABLE_TOP_Y + 0.04;
    boardSlab.receiveShadow = true;
    this.boardGroup.add(boardSlab);

    // 4 Carved table legs grounded flush on stone terrace (y = 0)
    const legGeo = new THREE.BoxGeometry(0.22, TABLE_TOP_Y - 0.16, 0.22);
    const footGeo = new THREE.BoxGeometry(0.28, 0.09, 0.28);
    const legX = (BOARD_WORLD_W + 0.1) / 2;
    const legZ = (BOARD_WORLD_D + 0.1) / 2;

    [
      [-legX, -legZ],
      [legX, -legZ],
      [-legX, legZ],
      [legX, legZ],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, rosewoodMat);
      leg.position.set(lx, (TABLE_TOP_Y - 0.16) / 2, lz);
      leg.castShadow = true;
      this.boardGroup.add(leg);

      const foot = new THREE.Mesh(footGeo, bronzeTrimMat);
      foot.position.set(lx, 0.045, lz);
      this.boardGroup.add(foot);
    });

    // Small sculpted celadon tea-pot accent on table corner (multi-part composite prop)
    const jadeMat = new THREE.MeshStandardMaterial({
      color: 0x5c8b79,
      roughness: 0.22,
      metalness: 0.12,
    });
    const potGroup = new THREE.Group();
    potGroup.position.set(BOARD_WORLD_W * 0.5 + 0.14, TABLE_TOP_Y, -BOARD_WORLD_D * 0.34);
    const potBody = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), jadeMat);
    potBody.scale.set(1.1, 0.82, 1.1);
    potBody.position.y = 0.09;
    potGroup.add(potBody);
    const potLid = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.03, 12), jadeMat);
    potLid.position.y = 0.175;
    potGroup.add(potLid);
    const potKnob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), bronzeTrimMat);
    potKnob.position.y = 0.2;
    potGroup.add(potKnob);
    this.boardGroup.add(potGroup);
    this.disposables.push(
      tableSlabGeo,
      boardSlabGeo,
      legGeo,
      footGeo,
      jadeMat,
      potBody.geometry,
      potLid.geometry,
      potKnob.geometry,
    );

    // Invisible intersection hit planes for clean raycast clicking on the 9x10 grid
    const hitGeo = new THREE.PlaneGeometry(CELL_W * 0.92, CELL_D * 0.92);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.disposables.push(hitGeo, hitMat);

    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.rotation.x = -Math.PI / 2;
        hit.position.copy(this.coordToWorld(r, c, 0.02));
        hit.userData = { row: r, col: c };
        hit.layers.set(1);
        this.boardGroup.add(hit);
        this.squareHitMeshes.push(hit);
      }
    }
  }

  private getPieceFaceTexture(side: Side, type: PieceType): THREE.CanvasTexture {
    const key = `${this.pieceStyle.theme}_${this.pieceStyle.labelMode}_${side}_${type}`;
    let tex = this.pieceFaceTextures.get(key);
    if (!tex) {
      tex = createPieceFaceTexture(
        side,
        type,
        this.renderer.capabilities.getMaxAnisotropy(),
        this.pieceStyle,
      );
      this.pieceFaceTextures.set(key, tex);
    }
    return tex;
  }

  /**
   * Live hot-swap for piece colorway (Ngà Đỏ / Đỏ-Trắng / Sứ Trắng) & label mode (Hán / H+V / Việt).
   * Disposes old texture cache cleanly to keep GPU memory flat.
   */
  public setPieceStyle(nextStyle: PieceVisualConfig) {
    if (
      nextStyle.theme === this.pieceStyle.theme &&
      nextStyle.labelMode === this.pieceStyle.labelMode
    ) {
      return;
    }
    this.pieceStyle = { ...nextStyle };

    const themeSpec = PIECE_THEMES[this.pieceStyle.theme] ?? PIECE_THEMES.ivory_crimson;
    this.redBodyMat.color.setHex(themeSpec.red.bodyColorHex);
    this.blackBodyMat.color.setHex(themeSpec.black.bodyColorHex);

    const oldTextures = Array.from(this.pieceFaceTextures.values());
    this.pieceFaceTextures.clear();

    for (const vis of this.pieceVisuals.values()) {
      const faceMat = vis.group.userData?.faceMat as THREE.MeshStandardMaterial | undefined;
      if (faceMat) {
        faceMat.map = this.getPieceFaceTexture(vis.piece.side, vis.piece.type);
        faceMat.needsUpdate = true;
      }
    }

    for (const tex of oldTextures) {
      tex.dispose();
    }
  }

  private createPieceMesh(piece: Piece): THREE.Group {
    const g = new THREE.Group();

    // Soft radial contact shadow directly beneath piece for unmistakable figure-ground separation
    const shadow = new THREE.Mesh(this.pieceShadowGeo, this.pieceShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    g.add(shadow);

    const body = new THREE.Mesh(
      this.pieceBodyGeo,
      piece.side === 'red' ? this.redBodyMat : this.blackBodyMat,
    );
    body.castShadow = !this.isSoftwareGl;
    body.receiveShadow = true;
    g.add(body);

    const faceTex = this.getPieceFaceTexture(piece.side, piece.type);
    // Matte-ceramic zero-glare PBR top face: prevents ACESFilmic specular washout on mobile screens!
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: faceTex,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.16,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const face = new THREE.Mesh(this.pieceTopGeo, faceMat);
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.16;
    g.add(face);
    g.userData = { faceMat };
    return g;
  }

  public setGuestCharacter(profile: WuxiaCharacterProfile) {
    if (this.guestRig) {
      this.scene.remove(this.guestRig.root);
      this.guestRig.dispose();
      this.guestRig = null;
    }
    // Keep 3D table pristine; Guest Challenger renders in AAA CGI Studio Portrait Pane
    void profile;
  }

  public syncBoard(
    board: BoardState,
    animatedMove: Move | null = null,
    triggerEffects = true,
  ) {
    const aliveIds = new Set<string>();

    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const piece = board.grid[r][c];
        if (!piece) continue;
        aliveIds.add(piece.id);

        let visual = this.pieceVisuals.get(piece.id);
        if (!visual) {
          const group = this.createPieceMesh(piece);
          group.position.copy(this.coordToWorld(r, c, 0));
          this.piecesGroup.add(group);
          visual = { piece, group, row: r, col: c };
          this.pieceVisuals.set(piece.id, visual);
        } else {
          if (animatedMove && animatedMove.piece.id === piece.id) {
            const startPos = this.coordToWorld(animatedMove.from.row, animatedMove.from.col, 0);
            const endPos = this.coordToWorld(r, c, 0);
            this.activeMoveAnim = {
              pieceId: piece.id,
              startPos,
              endPos,
              elapsed: 0,
              duration: 0.34,
            };
          } else {
            visual.group.position.copy(this.coordToWorld(r, c, 0));
          }
          visual.row = r;
          visual.col = c;
        }
      }
    }

    // Remove captured pieces cleanly
    for (const [id, vis] of this.pieceVisuals.entries()) {
      if (!aliveIds.has(id)) {
        this.piecesGroup.remove(vis.group);
        const faceMat = vis.group.userData?.faceMat as THREE.Material | undefined;
        faceMat?.dispose();
        this.pieceVisuals.delete(id);
      }
    }

    // Trigger character reach gesture, hitstop, camera shake & sword-qi spark burst
    if (animatedMove && triggerEffects) {
      if (animatedMove.piece.side === 'black') {
        this.botGestureProgress = 0;
      } else {
        this.guestGestureProgress = 0;
      }
      const isHeavy = Boolean(animatedMove.captured) || board.inCheck !== null;
      this.effects.triggerImpactBurst(
        animatedMove.to.row,
        animatedMove.to.col,
        isHeavy,
        animatedMove.piece.side,
      );
      if (isHeavy) {
        this.hitstopTimer = 0.045;
        this.trauma = Math.min(1, this.trauma + (board.inCheck ? 0.55 : 0.35));
      }
    }
  }

  public setSelectionOverlay(selected: Coord | null, legalTargets: Coord[]) {
    if (selected) {
      this.selectedRing.position.copy(this.coordToWorld(selected.row, selected.col, 0.024));
      this.selectedRing.visible = true;
    } else {
      this.selectedRing.visible = false;
    }

    while (this.legalDotsGroup.children.length > 0) {
      const ch = this.legalDotsGroup.children[0] as THREE.Mesh;
      this.legalDotsGroup.remove(ch);
      ch.geometry.dispose();
      (ch.material as THREE.Material).dispose();
    }

    if (legalTargets.length > 0) {
      const dotGeo = new THREE.CircleGeometry(0.085, 16);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0x72e8cf,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      });
      legalTargets.forEach((sq) => {
        const dot = new THREE.Mesh(dotGeo.clone(), dotMat.clone());
        dot.rotation.x = -Math.PI / 2;
        dot.position.copy(this.coordToWorld(sq.row, sq.col, 0.025));
        this.legalDotsGroup.add(dot);
      });
      dotGeo.dispose();
      dotMat.dispose();
    }
  }

  public updateAnalysisVisuals(
    board: BoardState,
    analysis: DeepAnalysisResult | null,
    showAnalysis: boolean,
    previewVariationIdx: number | null = null,
  ) {
    this.showAnalysis = showAnalysis;
    const checkedKingCoord = board.inCheck ? findKing(board.grid, board.inCheck) : null;
    this.effects.setVisualState({
      lastMove: board.lastMove
        ? {
            from: board.lastMove.from,
            to: board.lastMove.to,
            side: board.lastMove.piece.side,
          }
        : null,
      checkedKingCoord,
      showAnalysis,
      variations: analysis?.variations ?? [],
      previewVariationIdx,
      threats: analysis?.threats ?? [],
    });
  }

  public setBotState(mood: CharacterMood, speaking: boolean) {
    this.botMood = mood;
    this.botSpeaking = speaking;
  }

  public snapCameraToPreset() {
    if (this.isTitleMode) return;
    const { pos, target } = this.getPresetCameraVectors(this.cameraPreset);
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
    this.transitionCamera = false;
  }

  public setTitleMode(titleMode: boolean, snap = false) {
    this.isTitleMode = titleMode;
    this.controls.enabled = !titleMode;
    if (!titleMode) {
      this.userControllingCamera = false;
      this.transitionCamera = true;
      if (snap) this.snapCameraToPreset();
    }
  }

  public setCameraPreset(preset: CameraPreset) {
    this.cameraPreset = preset;
    this.userControllingCamera = false;
    this.transitionCamera = true;
  }

  public setSplitScreen(enabled: boolean) {
    if (this.splitScreen === enabled) return;
    this.splitScreen = enabled;
    this.userControllingCamera = false;
    this.transitionCamera = true;
  }

  public setTikTokMode(enabled: boolean) {
    if (this.tiktokMode === enabled) return;
    this.tiktokMode = enabled;
    this.userControllingCamera = false;
    this.snapZoomCamera = true;
    this.snapCameraToPreset();
  }

  public setZoomFocus(focus: ZoomFocus) {
    if (this.zoomFocus !== focus) {
      this.zoomFocus = focus;
      this.snapZoomCamera = true;
    }
  }

  private getTikTokVerticalLayout(w: number, h: number) {
    const stageW = Math.min(w, Math.round((h * 9) / 16));
    const stageX = Math.floor((w - stageW) / 2);
    // Top 42% = Zoomed Character Portrait, Bottom 58% = Full 3D Xiangqi Board
    const zoomH = Math.floor(h * 0.42);
    const boardH = h - zoomH;
    return {
      stageX,
      stageW,
      // WebGL bottom-left origin
      zoomGl: { x: stageX, y: boardH, w: stageW, h: zoomH },
      boardGl: { x: stageX, y: 0, w: stageW, h: boardH },
      // DOM top-left origin for board raycasting
      boardDom: { left: stageX, top: zoomH, width: stageW, height: boardH },
    };
  }

  private getSplitLayout(w: number, h: number) {
    const isNarrow = w < 820;
    if (!isNarrow) {
      const boardW = Math.floor(w * 0.6);
      const zoomW = w - boardW;
      return {
        isNarrow,
        // WebGL bottom-left origin viewports
        boardGl: { x: 0, y: 0, w: boardW, h },
        zoomGl: { x: boardW, y: 0, w: zoomW, h },
        // DOM top-left origin hit-test bounds for Board
        boardDom: { left: 0, top: 0, width: boardW, height: h },
      };
    }
    const boardH = Math.floor(h * 0.56);
    const zoomH = h - boardH;
    return {
      isNarrow,
      boardGl: { x: 0, y: zoomH, w, h: boardH },
      zoomGl: { x: 0, y: 0, w, h: zoomH },
      boardDom: { left: 0, top: 0, width: w, height: boardH },
    };
  }

  private getPresetCameraVectors(preset: CameraPreset): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const w = this.viewportWidth;
    const h = this.viewportHeight;

    let paneW = w;
    let paneH = h;
    let layoutMode: 'tiktok' | 'split_desktop' | 'split_mobile' | 'single' = 'single';

    if (this.tiktokMode) {
      const { boardGl } = this.getTikTokVerticalLayout(w, h);
      paneW = boardGl.w;
      paneH = boardGl.h;
      layoutMode = 'tiktok';
    } else if (this.splitScreen) {
      const split = this.getSplitLayout(w, h);
      paneW = split.boardGl.w;
      paneH = split.boardGl.h;
      layoutMode = split.isNarrow ? 'split_mobile' : 'split_desktop';
    }

    const pose = computeResponsiveBoardCamera({
      paneWidth: paneW,
      paneHeight: paneH,
      fovDeg: this.camera.fov,
      layoutMode,
      preset,
      boardWorldW: BOARD_WORLD_W,
      boardWorldD: BOARD_WORLD_D,
      boardTopY: BOARD_TOP_Y,
    });

    return {
      pos: _desiredCamPos.set(pose.posX, pose.posY, pose.posZ),
      target: _desiredTarget.set(pose.targetX, pose.targetY, pose.targetZ),
    };
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (this.isTitleMode || !this.callbacks.onSquareClick) return;
    if (e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    if (this.tiktokMode) {
      const { boardDom } = this.getTikTokVerticalLayout(rect.width, rect.height);
      if (
        localX < boardDom.left ||
        localX > boardDom.left + boardDom.width ||
        localY < boardDom.top ||
        localY > boardDom.top + boardDom.height
      ) {
        return;
      }
      _pointerNdc.x = ((localX - boardDom.left) / boardDom.width) * 2 - 1;
      _pointerNdc.y = -((localY - boardDom.top) / boardDom.height) * 2 + 1;
      this.camera.aspect = boardDom.width / Math.max(boardDom.height, 1);
      this.camera.updateProjectionMatrix();
    } else if (this.splitScreen) {
      const { boardDom } = this.getSplitLayout(rect.width, rect.height);
      if (
        localX < boardDom.left ||
        localX > boardDom.left + boardDom.width ||
        localY < boardDom.top ||
        localY > boardDom.top + boardDom.height
      ) {
        return;
      }
      _pointerNdc.x = ((localX - boardDom.left) / boardDom.width) * 2 - 1;
      _pointerNdc.y = -((localY - boardDom.top) / boardDom.height) * 2 + 1;
      this.camera.aspect = boardDom.width / Math.max(boardDom.height, 1);
      this.camera.updateProjectionMatrix();
    } else {
      _pointerNdc.x = (localX / rect.width) * 2 - 1;
      _pointerNdc.y = -(localY / rect.height) * 2 + 1;
      this.camera.aspect = rect.width / Math.max(rect.height, 1);
      this.camera.updateProjectionMatrix();
    }

    _raycaster.setFromCamera(_pointerNdc, this.camera);
    _raycaster.layers.set(1);
    const hits = _raycaster.intersectObjects(this.squareHitMeshes, false);
    if (hits.length > 0) {
      const { row, col } = hits[0].object.userData as { row: number; col: number };
      this.callbacks.onSquareClick(row, col);
    }
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
  };

  private handleResize() {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 320);
    const h = Math.max(this.container.clientHeight, 240);
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (!this.isTitleMode && !this.userControllingCamera) {
      this.transitionCamera = true;
    }
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
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    // Sim-level hitstop ticks in real dt while motion pauses momentarily
    const simDt = this.hitstopTimer > 0 ? 0 : dt;
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
    }
    this.elapsed += simDt;

    // 1. Parabolic lift-and-slam piece animation
    if (this.activeMoveAnim) {
      this.activeMoveAnim.elapsed += simDt;
      const t = Math.min(1, this.activeMoveAnim.elapsed / this.activeMoveAnim.duration);
      const vis = this.pieceVisuals.get(this.activeMoveAnim.pieceId);
      if (vis) {
        const eased = 1 - Math.pow(1 - t, 3);
        vis.group.position.lerpVectors(
          this.activeMoveAnim.startPos,
          this.activeMoveAnim.endPos,
          eased,
        );
        vis.group.position.y += Math.sin(t * Math.PI) * 0.62;
      }
      if (t >= 1) {
        this.activeMoveAnim = null;
      }
    }

    // 2. Character animations (Bot Master + Guest Challenger)
    if (this.botGestureProgress < 1) {
      this.botGestureProgress = Math.min(1, this.botGestureProgress + simDt * 1.65);
    }
    if (this.guestGestureProgress < 1) {
      this.guestGestureProgress = Math.min(1, this.guestGestureProgress + simDt * 1.65);
    }

    updateCharacterAnimation(this.botRig, this.elapsed, dt, {
      mood: this.botMood,
      speaking: this.botSpeaking,
      gestureProgress: this.botGestureProgress,
      lookTargetYaw: this.cameraPreset === 'liveBot' ? 0 : 0.08,
      lookTargetPitch: this.cameraPreset === 'liveBot' ? 0.09 : 0.16,
      analysisIntensity: this.showAnalysis ? 1 : 0.25,
    });

    if (this.guestRig) {
      updateCharacterAnimation(this.guestRig, this.elapsed + 1.7, dt, {
        mood: 'calm',
        speaking: false,
        gestureProgress: this.guestGestureProgress,
        lookTargetYaw: 0,
        lookTargetPitch: 0.14,
        analysisIntensity: 0,
      });
    }

    // 3. Gentle pendulum sway on hanging temple lanterns
    for (let i = 0; i < this.lanterns.length; i++) {
      this.lanterns[i].rotation.z = Math.sin(this.elapsed * 1.25 + i * 1.3) * 0.045;
      this.lanterns[i].rotation.x = Math.cos(this.elapsed * 0.95 + i * 0.8) * 0.03;
    }

    // 4. Wuxia Sword-Qi & Bagua FX update
    this.effects.update(this.elapsed, dt);

    // 5. Camera Choreography with exponential damping & trauma shake
    if (this.isTitleMode) {
      // Unobstructed twilight showcase gently orbiting the carved rosewood Xiangqi board & pavilion lanterns
      const sway = Math.sin(this.elapsed * 0.24) * 0.45;
      _desiredCamPos.set(1.45 + sway, 4.25 + Math.sin(this.elapsed * 0.32) * 0.1, 3.85);
      _desiredTarget.set(0.35, 0.9, -0.1);
      const damp = 1 - Math.exp(-4.5 * dt);
      this.camera.position.lerp(_desiredCamPos, damp);
      this.controls.target.lerp(_desiredTarget, damp);
      this.camera.lookAt(this.controls.target);
    } else if (this.transitionCamera && !this.userControllingCamera) {
      const { pos, target } = this.getPresetCameraVectors(this.cameraPreset);
      const damp = 1 - Math.exp(-9.0 * dt);
      this.camera.position.lerp(pos, damp);
      this.controls.target.lerp(target, damp);
      if (
        this.camera.position.distanceTo(pos) < 0.015 &&
        this.controls.target.distanceTo(target) < 0.015
      ) {
        this.transitionCamera = false;
      }
      this.controls.update();
    } else {
      this.controls.update();
    }

    // 6. Render Pass: Pure Luxury 3D Xiangqi Board Viewport
    // (Right 40% Widescreen & Top 42% TikTok 9:16 are rendered by AAA CGI LiveHostPortraitPane!)
    const w = this.viewportWidth;
    const h = this.viewportHeight;
    const hasShake = this.trauma > 0.001;
    if (hasShake) {
      const shake = this.trauma * this.trauma * 0.14;
      _shakeOffset.set(
        Math.sin(now * 0.047) * shake,
        Math.cos(now * 0.053) * shake * 0.7,
        0,
      );
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
    }

    if (!this.isTitleMode && (this.tiktokMode || this.splitScreen)) {
      const isTikTok = this.tiktokMode;
      const { boardGl } = isTikTok
        ? this.getTikTokVerticalLayout(w, h)
        : this.getSplitLayout(w, h);

      // Clear full canvas to deep studio obsidian before rendering clipped 3D board pane
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.setClearColor(0x0b080e, 1);
      this.renderer.clear(true, true, true);

      this.renderer.setScissorTest(true);
      this.renderer.setViewport(boardGl.x, boardGl.y, boardGl.w, boardGl.h);
      this.renderer.setScissor(boardGl.x, boardGl.y, boardGl.w, boardGl.h);
      const boardAspect = boardGl.w / Math.max(boardGl.h, 1);
      if (Math.abs(this.camera.aspect - boardAspect) > 0.001) {
        this.camera.aspect = boardAspect;
        this.camera.updateProjectionMatrix();
      }
      if (hasShake) {
        this.camera.position.add(_shakeOffset);
        this.renderer.render(this.scene, this.camera);
        this.camera.position.sub(_shakeOffset);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this.renderer.setScissorTest(false);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      const fullAspect = w / Math.max(h, 1);
      if (Math.abs(this.camera.aspect - fullAspect) > 0.001) {
        this.camera.aspect = fullAspect;
        this.camera.updateProjectionMatrix();
      }
      if (hasShake) {
        this.camera.position.add(_shakeOffset);
        this.renderer.render(this.scene, this.camera);
        this.camera.position.sub(_shakeOffset);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }

    // Pace next frame safely on software WebGL via afterDraw
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    this.controls.dispose();
    this.botRig.dispose();
    this.guestRig?.dispose();
    this.effects.dispose();

    for (const vis of this.pieceVisuals.values()) {
      const faceMat = vis.group.userData?.faceMat as THREE.Material | undefined;
      faceMat?.dispose();
    }
    for (const tex of this.pieceFaceTextures.values()) {
      tex.dispose();
    }
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
