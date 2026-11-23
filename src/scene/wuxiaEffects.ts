import * as THREE from 'three';
import { Coord, Side } from '../engine/xiangqi';
import { TacticalThreat, TacticalVariation } from '../engine/ai';
import { createBaguaFormationTexture } from './textures';

interface ParticleSlot {
  active: boolean;
  ambient: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  scale: number;
  color: THREE.Color;
}

const PARTICLE_COUNT = 140;
const _dummy = new THREE.Object3D();
const _tempColor = new THREE.Color();

export type CoordToWorldFn = (row: number, col: number, yOffset?: number) => THREE.Vector3;

/**
 * Wuxia Deep Analysis & Martial Battle 3D FX Controller:
 * - Curved Sword-Qi Move & Variation Arcs (TubeGeometry)
 * - Rotating Bagua Formation Rings (last move + check warning)
 * - Threat Vector Beams
 * - Zero-GC InstancedMesh Pooled Qi Sparks & Temple Embers
 * - Expanding Capture/Check Shockwave Ring
 */
export class WuxiaEffectsController {
  public readonly group = new THREE.Group();

  private readonly coordToWorld: CoordToWorldFn;
  private readonly arcsGroup = new THREE.Group();
  private readonly threatsGroup = new THREE.Group();

  private readonly activeBagua: THREE.Mesh;
  private readonly checkBagua: THREE.Mesh;
  private readonly shockwaveRing: THREE.Mesh;
  private shockwaveAge = 99;

  private readonly particlesMesh: THREE.InstancedMesh;
  private readonly particles: ParticleSlot[] = [];

  private readonly baguaTex: THREE.CanvasTexture;
  private readonly sharedSparkGeo: THREE.BufferGeometry;
  private readonly sharedSparkMat: THREE.MeshBasicMaterial;
  private readonly shockMat: THREE.MeshBasicMaterial;

  private arcDisposables: Array<{ dispose: () => void }> = [];
  private threatDisposables: Array<{ dispose: () => void }> = [];

  private orbMesh: THREE.Mesh;
  private activeArcCurve: THREE.CatmullRomCurve3 | null = null;
  private orbProgress = 0;

  constructor(coordToWorld: CoordToWorldFn, maxAnisotropy: number) {
    this.coordToWorld = coordToWorld;
    this.group.add(this.arcsGroup);
    this.group.add(this.threatsGroup);

    this.baguaTex = createBaguaFormationTexture(maxAnisotropy);

    // 1. Active Piece / Move Destination Bagua Formation Ring
    const baguaGeo = new THREE.PlaneGeometry(0.95, 0.95);
    const activeBaguaMat = new THREE.MeshBasicMaterial({
      map: this.baguaTex,
      color: 0xf4c978,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.activeBagua = new THREE.Mesh(baguaGeo, activeBaguaMat);
    this.activeBagua.rotation.x = -Math.PI / 2;
    this.activeBagua.visible = false;
    this.group.add(this.activeBagua);

    // 2. Check Warning Crimson Bagua Ring under Threatened King
    const checkBaguaMat = new THREE.MeshBasicMaterial({
      map: this.baguaTex,
      color: 0xff3b2f,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.checkBagua = new THREE.Mesh(baguaGeo, checkBaguaMat);
    this.checkBagua.rotation.x = -Math.PI / 2;
    this.checkBagua.scale.setScalar(1.35);
    this.checkBagua.visible = false;
    this.group.add(this.checkBagua);

    // 3. Expanding Capture / Check Shockwave Ring
    const shockGeo = new THREE.RingGeometry(0.24, 0.34, 32);
    this.shockMat = new THREE.MeshBasicMaterial({
      color: 0xffc66d,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shockwaveRing = new THREE.Mesh(shockGeo, this.shockMat);
    this.shockwaveRing.rotation.x = -Math.PI / 2;
    this.shockwaveRing.visible = false;
    this.group.add(this.shockwaveRing);

    // 4. Traveling Sword-Qi Energy Orb along latest move arc
    const orbGeo = new THREE.SphereGeometry(0.065, 12, 10);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xffe8a3,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.orbMesh = new THREE.Mesh(orbGeo, orbMat);
    this.orbMesh.visible = false;
    this.group.add(this.orbMesh);

    // 5. Zero-GC Pooled InstancedMesh Qi Sparks & Ambient Floating Embers
    this.sharedSparkGeo = new THREE.OctahedronGeometry(0.022, 0);
    this.sharedSparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particlesMesh = new THREE.InstancedMesh(
      this.sharedSparkGeo,
      this.sharedSparkMat,
      PARTICLE_COUNT,
    );
    this.particlesMesh.frustumCulled = false;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const isAmbient = i < 42;
      const slot: ParticleSlot = {
        active: isAmbient,
        ambient: isAmbient,
        pos: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          0.4 + Math.random() * 4.2,
          (Math.random() - 0.5) * 9,
        ),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.18,
          0.14 + Math.random() * 0.24,
          (Math.random() - 0.5) * 0.18,
        ),
        age: Math.random() * 6,
        life: 5 + Math.random() * 4,
        scale: isAmbient ? 0.45 + Math.random() * 0.55 : 0,
        color: new THREE.Color(i % 3 === 0 ? 0xf2c26b : i % 3 === 1 ? 0xe05d44 : 0x76d6c2),
      };
      this.particles.push(slot);
      this.particlesMesh.setColorAt(i, slot.color);
    }
    if (this.particlesMesh.instanceColor) {
      this.particlesMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.particlesMesh);
  }

  private clearArcs() {
    while (this.arcsGroup.children.length > 0) {
      this.arcsGroup.remove(this.arcsGroup.children[0]);
    }
    this.arcDisposables.forEach((d) => d.dispose());
    this.arcDisposables = [];
    this.activeArcCurve = null;
    this.orbMesh.visible = false;
  }

  private clearThreats() {
    while (this.threatsGroup.children.length > 0) {
      this.threatsGroup.remove(this.threatsGroup.children[0]);
    }
    this.threatDisposables.forEach((d) => d.dispose());
    this.threatDisposables = [];
  }

  private buildArc(
    from: Coord,
    to: Coord,
    colorHex: number,
    radius: number,
    arcHeight: number,
    opacity: number,
  ): THREE.CatmullRomCurve3 {
    const start = this.coordToWorld(from.row, from.col, 0.12);
    const end = this.coordToWorld(to.row, to.col, 0.12);
    const mid = start.clone().lerp(end, 0.5);
    const dist = start.distanceTo(end);
    mid.y += Math.max(0.32, Math.min(1.45, dist * 0.28 + arcHeight));

    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, radius, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.arcsGroup.add(mesh);
    this.arcDisposables.push(tubeGeo, tubeMat);
    return curve;
  }

  public setVisualState(params: {
    lastMove: { from: Coord; to: Coord; side: Side } | null;
    checkedKingCoord: Coord | null;
    showAnalysis: boolean;
    variations: TacticalVariation[];
    previewVariationIdx: number | null;
    threats: TacticalThreat[];
  }) {
    this.clearArcs();
    this.clearThreats();

    // 1. Last Move Sword-Qi Arc + Bagua Ring
    if (params.lastMove) {
      const color = params.lastMove.side === 'red' ? 0xf5b95b : 0x52d1c6;
      this.activeArcCurve = this.buildArc(
        params.lastMove.from,
        params.lastMove.to,
        color,
        0.022,
        0.16,
        0.78,
      );
      this.orbProgress = 0;
      this.orbMesh.visible = true;

      const destPos = this.coordToWorld(params.lastMove.to.row, params.lastMove.to.col, 0.028);
      this.activeBagua.position.copy(destPos);
      this.activeBagua.visible = true;
    } else {
      this.activeBagua.visible = false;
    }

    // 2. Check warning Bagua ring
    if (params.checkedKingCoord) {
      const kPos = this.coordToWorld(
        params.checkedKingCoord.row,
        params.checkedKingCoord.col,
        0.032,
      );
      this.checkBagua.position.copy(kPos);
      this.checkBagua.visible = true;
    } else {
      this.checkBagua.visible = false;
    }

    // 3. Deep Wuxia Analysis Mode: Show crisp variation Sword-Qi arc on hover/select (never clutter opening board!)
    if (params.showAnalysis) {
      if (
        params.previewVariationIdx !== null &&
        params.variations[params.previewVariationIdx]
      ) {
        const v = params.variations[params.previewVariationIdx];
        this.buildArc(v.move.from, v.move.to, 0xffe484, 0.028, 0.28, 0.92);
      }

      // Draw tactical threat beams only once combat is underway (never on untouched opening board)
      if (params.lastMove) {
        params.threats.slice(0, 3).forEach((t) => {
          const start = this.coordToWorld(t.from.row, t.from.col, 0.16);
          const end = this.coordToWorld(t.to.row, t.to.col, 0.16);
          const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
          const mat = new THREE.LineBasicMaterial({
            color: t.attackerSide === 'red' ? 0xf26444 : 0xe84868,
            transparent: true,
            opacity: 0.62,
          });
          const line = new THREE.Line(geo, mat);
          this.threatsGroup.add(line);
          this.threatDisposables.push(geo, mat);
        });
      }
    }
  }

  /** Trigger dramatic pooled burst of Sword-Qi sparks & expanding shockwave */
  public triggerImpactBurst(row: number, col: number, heavy: boolean, side: Side) {
    const origin = this.coordToWorld(row, col, 0.18);
    const count = heavy ? 34 : 14;
    const baseHex = heavy
      ? 0xff6e42
      : side === 'red'
        ? 0xf5c469
        : 0x56d8cb;

    let spawned = 0;
    for (let i = 42; i < PARTICLE_COUNT && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active || p.age > p.life * 0.7) {
        const angle = (spawned / count) * Math.PI * 2 + Math.random() * 0.35;
        const speed = (heavy ? 1.8 : 0.9) + Math.random() * (heavy ? 2.4 : 1.1);
        p.active = true;
        p.age = 0;
        p.life = (heavy ? 0.75 : 0.45) + Math.random() * 0.35;
        p.pos.copy(origin);
        p.vel.set(
          Math.cos(angle) * speed,
          (heavy ? 1.4 : 0.7) + Math.random() * (heavy ? 1.8 : 0.9),
          Math.sin(angle) * speed,
        );
        p.scale = heavy ? 1.15 + Math.random() * 0.75 : 0.65 + Math.random() * 0.4;
        _tempColor.setHex(baseHex);
        if (spawned % 3 === 0) _tempColor.offsetHSL(0.05, 0, 0.14);
        p.color.copy(_tempColor);
        this.particlesMesh.setColorAt(i, p.color);
        spawned++;
      }
    }
    if (this.particlesMesh.instanceColor) {
      this.particlesMesh.instanceColor.needsUpdate = true;
    }

    // Shockwave ring
    this.shockwaveRing.position.set(origin.x, origin.y - 0.14, origin.z);
    this.shockwaveRing.scale.setScalar(0.4);
    this.shockMat.color.setHex(heavy ? 0xff5a3d : 0xf4ca78);
    this.shockMat.opacity = heavy ? 0.92 : 0.62;
    this.shockwaveRing.visible = true;
    this.shockwaveAge = 0;
  }

  public update(elapsed: number, dt: number) {
    // Rotate Bagua formation rings
    if (this.activeBagua.visible) {
      this.activeBagua.rotation.z = elapsed * 0.55;
    }
    if (this.checkBagua.visible) {
      this.checkBagua.rotation.z = -elapsed * 1.45;
      const pulse = 1.25 + Math.sin(elapsed * 6.5) * 0.12;
      this.checkBagua.scale.setScalar(pulse);
    }

    // Traveling Sword-Qi orb along latest move arc
    if (this.activeArcCurve && this.orbMesh.visible) {
      this.orbProgress = (this.orbProgress + dt * 0.62) % 1;
      this.activeArcCurve.getPointAt(this.orbProgress, this.orbMesh.position);
    }

    // Shockwave ring expansion
    if (this.shockwaveRing.visible) {
      this.shockwaveAge += dt;
      const t = this.shockwaveAge / 0.55;
      if (t >= 1) {
        this.shockwaveRing.visible = false;
      } else {
        const eased = 1 - Math.pow(1 - t, 3);
        this.shockwaveRing.scale.setScalar(0.5 + eased * 3.2);
        this.shockMat.opacity = (1 - t) * 0.8;
      }
    }

    // Update pooled InstancedMesh particles with zero allocations
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      if (!p.active) {
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particlesMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.age += dt;
      if (p.ambient) {
        p.pos.x += (p.vel.x + Math.sin(elapsed * 0.7 + i) * 0.08) * dt;
        p.pos.y += p.vel.y * dt;
        p.pos.z += (p.vel.z + Math.cos(elapsed * 0.6 + i) * 0.08) * dt;
        if (p.pos.y > 5.2 || p.age > p.life) {
          p.pos.set(
            (Math.random() - 0.5) * 9.5,
            0.25 + Math.random() * 0.5,
            (Math.random() - 0.5) * 9.5,
          );
          p.age = 0;
        }
        const fade = Math.sin((p.age / p.life) * Math.PI);
        _dummy.position.copy(p.pos);
        _dummy.rotation.set(elapsed + i, elapsed * 0.7, 0);
        _dummy.scale.setScalar(Math.max(0.01, p.scale * fade));
      } else {
        if (p.age >= p.life) {
          p.active = false;
          _dummy.position.set(0, -50, 0);
          _dummy.scale.setScalar(0.001);
        } else {
          p.vel.y -= 4.2 * dt; // Gravity on sword sparks
          p.pos.addScaledVector(p.vel, dt);
          const remain = 1 - p.age / p.life;
          _dummy.position.copy(p.pos);
          _dummy.rotation.set(p.age * 8, p.age * 6, 0);
          _dummy.scale.setScalar(Math.max(0.01, p.scale * remain));
        }
      }
      _dummy.updateMatrix();
      this.particlesMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particlesMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose() {
    this.clearArcs();
    this.clearThreats();
    this.baguaTex.dispose();
    this.sharedSparkGeo.dispose();
    this.sharedSparkMat.dispose();
    this.shockMat.dispose();
    this.activeBagua.geometry.dispose();
    (this.activeBagua.material as THREE.Material).dispose();
    (this.checkBagua.material as THREE.Material).dispose();
    this.shockwaveRing.geometry.dispose();
    this.orbMesh.geometry.dispose();
    (this.orbMesh.material as THREE.Material).dispose();
  }
}
