// Bẫy, vật thể trong phòng và Ma Trận Hóa Học Bề Mặt (Cơ chế #4)
import * as THREE from 'three';
import { models } from './models.js';
import { ctx, aoe, scheduleBomb, spawnFirePatch, spawnToxic, getFirePatches, getToxics, removeFirePatch, removeToxic, dealDamage } from './combat.js';
import { spawnRing, burst, addShake, spawnTelegraph, damageNumber, explosion, flame, flash, spawnBolt } from './fx.js';
import { play } from './audio.js';
import { isBlocked, ROOM_HALF, DS, pillars, currentBiome } from './world.js';
import { emit, F, smoke as fxSmoke, liquidMaterial, blobGeometry } from './fx.js';

let group = null;
const spikes = [];
const icePatches = [];
const lavaPools = [];
const graves = [];
const waterPatches = [];
const elecPatches = [];
const steamClouds = [];
const cyclones = [];
const fallingPillars = [];
const swampBogs = [];
const teslaPairs = [];
export let waveActive = { on: false };
let rainT = 0;
let surfaceDepth = 0;

class Barrel {
  constructor(scene, x, z) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.alive = true;
    this.fuse = -1;
    this.mesh = new THREE.Group();
    const m = models['dungeon/barrel_explosive'] || models['dungeon/barrel_large'];
    if (m) {
      const b = m.scene.clone(true);
      b.scale.setScalar(DS * 0.6);
      b.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(1.3, 0.55, 0.45)); } });
      this.mesh.add(b);
    }
    // Dấu hiệu nguy hiểm: vòng đỏ dưới chân
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.88, 24), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this.mesh.add(ring);
    this.mesh.position.copy(this.pos);
    group.add(this.mesh);
    this.collider = { x, z, r: 0.6 };
    pillars.push(this.collider);
  }

  hit() {
    if (!this.alive || this.fuse >= 0) return;
    this.fuse = 0.18;                                // nổ chậm một nhịp để nổ dây chuyền đẹp mắt
  }

  update(dt) {
    if (!this.alive || this.fuse < 0) return;
    this.fuse -= dt;
    this.mesh.scale.setScalar(1 + (0.18 - this.fuse) * 1.5);
    flame(this.pos.clone().setY(1.1), { count: 2, size: 0.6, spread: 0.3 });
    if (this.fuse > 0) return;
    this.alive = false;
    group.remove(this.mesh);
    const i = pillars.indexOf(this.collider);
    if (i >= 0) pillars.splice(i, 1);
    explosion(this.pos, 3.4, 0xff6a1a);
    burst(this.pos.clone().setY(0.6), 0x3a2a20, 14, { speed: 8, size: 0.25 });
    addShake(0.5);
    play('explode', { at: this.pos });
    aoe(this.pos, 3.4, 38, { element: 'fire', element2: null }, 14, { player: 15 });
    spawnFirePatch(this.pos, 1.6, 3, 10);
  }
}

class Spike {
  constructor(x, z, phase) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.t = phase;
    this.size = 4 * DS * 0.75;
    this.mesh = null;
    const m = models['dungeon/floor_tile_big_spikes'];
    if (m) {
      this.mesh = m.scene.clone(true);
      this.mesh.scale.setScalar(DS * 0.75);
      this.mesh.position.set(x, 0.01, z);
      this.spikesNode = this.mesh.getObjectByName('spikes');
      group.add(this.mesh);
    }
    this.hitDone = false;
  }

  // Chu kỳ 3.2s: nằm im 2s, rung cảnh báo 0.6s, đâm lên 0.6s
  update(dt) {
    this.t = (this.t + dt) % 3.2;
    const warn = this.t >= 2.0 && this.t < 2.6;
    const up = this.t >= 2.6;
    if (this.t < 0.05) this.hitDone = false;
    if (warn && !this.warned) {
      this.warned = true;
      spawnTelegraph(ctx.scene, { shape: 'rect', pos: new THREE.Vector3(this.pos.x, 0, this.pos.z - this.size / 2), width: this.size, length: this.size, duration: 0.6 });
    }
    if (!warn) this.warned = false;
    if (this.spikesNode) this.spikesNode.position.y = up ? 0 : warn ? -0.75 + Math.sin(this.t * 60) * 0.05 : -1.2;
    if (up && !this.hitDone) {
      this.hitDone = true;
      play('slimeLand', { at: this.pos, rate: 1.6, vol: 2 });
      const h = this.size / 2;
      const inside = (p) => Math.abs(p.x - this.pos.x) < h && Math.abs(p.z - this.pos.z) < h;
      const pl = ctx.player;
      if (!pl.dead && inside(pl.pos) && pl.hurt(12)) damageNumber(pl.pos, 12, 'player');
      for (const e of ctx.enemies) if (e.alive && !e.spawning && !e.isBoss && (e.height || 0) < 0.5 && inside(e.pos)) e.takeHit(25, null, 0, false, 'burn');
    }
  }
}

function disposeLiquidMat(m) {
  if (!m) return;
  if (m.userData) m.userData.disposed = true;
  m.dispose?.();
}
function disposeGroupLiquids(g) {
  if (!g) return;
  g.traverse((o) => {
    if (o.material?.uniforms?.uTime) disposeLiquidMat(o.material);
  });
  for (const L of lavaPools) {
    disposeLiquidMat(L.obsMat);
    disposeLiquidMat(L.lavaMat);
  }
}

// Dọn sạch bẫy khi vào Phòng Tập Lò Rèn
export function clearHazards(scene) {
  if (group) { disposeGroupLiquids(group); scene?.remove(group); group = null; }
  ctx.barrels.length = 0;
  spikes.length = 0;
  icePatches.length = 0; lavaPools.length = 0; graves.length = 0;
  waterPatches.length = 0; elecPatches.length = 0; steamClouds.length = 0;
  cyclones.length = 0; fallingPillars.length = 0;
  swampBogs.length = 0; teslaPairs.length = 0;
}

// Đặt bẫy cho tầng mới (gọi sau buildWorld)
export function buildHazards(scene, floor, rand = Math.random) {
  if (group) { disposeGroupLiquids(group); scene.remove(group); }
  group = new THREE.Group();
  scene.add(group);
  ctx.barrels.length = 0;
  spikes.length = 0;
  const free = (r) => {
    for (let k = 0; k < 60; k++) {
      const x = (rand() * 2 - 1) * (ROOM_HALF - 3), z = (rand() * 2 - 1) * (ROOM_HALF - 3);
      if (Math.hypot(x, z - (ROOM_HALF - 4)) < 5 || Math.hypot(x, z) < 6.8) continue;   // tránh chỗ xuất phát và Ấn Trung Tâm
      if (!isBlocked(x, z, r)) return [x, z];
    }
    return null;
  };
  const nBarrels = 7 + Math.min(5, floor);
  for (let i = 0; i < nBarrels; i++) { const p = free(1.6); if (p) ctx.barrels.push(new Barrel(scene, p[0], p[1])); }
  icePatches.length = 0; lavaPools.length = 0; graves.length = 0;
  waterPatches.length = 0; elecPatches.length = 0; steamClouds.length = 0; cyclones.length = 0; fallingPillars.length = 0;
  swampBogs.length = 0; teslaPairs.length = 0;
  const biome = currentBiome.id;
  const nSpikes = biome === 'stone' || biome === 'crypt' ? 4 + Math.min(4, floor) : 2;
  for (let i = 0; i < nSpikes; i++) { const p = free(2.4); if (p) spikes.push(new Spike(p[0], p[1], rand() * 3.2)); }
  // Đặt vũng không chồng lên nhau và không đè vật cản
  const pools = [];
  const freePool = (r) => {
    for (let k = 0; k < 40; k++) {
      const p = free(r * 0.9); if (!p) return null;
      if (pools.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > q[2] + r + 1.5)) { pools.push([p[0], p[1], r]); return p; }
    }
    return null;
  };
  const rock = (x, z, s) => {
    const m = models['dungeon/rubble_large'];
    if (!m) return;
    const o = m.scene.clone(true);
    o.scale.setScalar(DS * s); o.position.set(x, -0.05, z); o.rotation.y = rand() * Math.PI * 2;
    o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.material = c.material.clone(); c.material.color.multiply(new THREE.Color(currentBiome.tint)); } });
    group.add(o);
  };
  if (biome === 'ice') {
    // Mặt băng trơn (hình méo tự nhiên, có vết nứt): đi vào sẽ bị trượt
    for (let i = 0; i < 8; i++) {
      const r = 2.6 + rand() * 1.9;
      const p = freePool(r); if (!p) continue;
      const geo = blobGeometry(r, rand);
      const m = new THREE.Mesh(geo, liquidMaterial('ice'));
      m.position.set(p[0], 0.035, p[1]);
      m.renderOrder = 1;
      group.add(m);
      icePatches.push({ x: p[0], z: p[1], r: r * 0.9, mesh: m, melted: false });
    }
    // Cụm pha lê băng (vật cản), mặt phẳng góc cạnh
    const crystal = new THREE.MeshStandardMaterial({ color: 0xa8e4ff, emissive: 0x2a7acf, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 10; i++) {
      const p = free(1.4); if (!p) continue;
      const g = new THREE.Group();
      const n = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const h = (k === 0 ? 1.8 : 0.6) + rand() * 1.3;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.18 + rand() * 0.22, h, 5 + Math.floor(rand() * 2)), crystal);
        const a = rand() * Math.PI * 2, d = k === 0 ? 0 : 0.25 + rand() * 0.45;
        c.position.set(Math.cos(a) * d, h / 2 - 0.1, Math.sin(a) * d);
        c.rotation.set(Math.cos(a) * d * 0.7, rand() * 3, -Math.sin(a) * d * 0.7);
        c.castShadow = true; g.add(c);
      }
      g.position.set(p[0], 0, p[1]); group.add(g);
      if (rand() < 0.6) rock(p[0] + 0.6, p[1] + 0.4, 0.22);
      pillars.push({ x: p[0], z: p[1], r: 0.75 });
    }
  } else if (biome === 'lava') {
    // Vũng nham thạch chảy (shader), viền đá nguội, đứng lên bị bỏng
    for (let i = 0; i < 7; i++) {
      const r = 2.0 + rand() * 1.6;
      const p = freePool(r); if (!p) continue;
      const geo = blobGeometry(r, rand);
      const m = new THREE.Mesh(geo, liquidMaterial('lava'));
      m.position.set(p[0], 0.04, p[1]);
      m.renderOrder = 1;
      group.add(m);
      const L = new THREE.PointLight(0xff5a1a, 6, r * 3.5, 1.8); L.position.set(p[0], 0.8, p[1]); group.add(L);
      // vài tảng đá quanh mép
      const R = geo.userData.radiusAt;
      for (let k = 0; k < 3; k++) { const th = rand() * Math.PI * 2; rock(p[0] + Math.cos(th) * R(th) * 1.05, p[1] + Math.sin(th) * R(th) * 1.05, 0.14 + rand() * 0.12); }
      lavaPools.push({ x: p[0], z: p[1], r: r * 0.85, light: L, tick: 0, seed: rand() * 10, mesh: m, lavaMat: m.material, obsidianT: 0 });
    }
    // Vết nứt nóng trên sàn (texture tia điện Kenney tô màu cam)
    for (let i = 0; i < 10; i++) {
      const p = free(1); if (!p) continue;
      crackDecal(p[0], p[1], 1.5 + rand() * 1.8, rand);
    }
  } else if (biome === 'crypt') {
    // Mộ thật (KayKit Halloween): khi đang có quái, thỉnh thoảng sống dậy một bộ xương
    const graveModels = ['crypt/grave_A', 'crypt/grave_B', 'crypt/gravestone', 'crypt/grave_A_destroyed'];
    for (let i = 0; i < 8; i++) {
      const p = free(2); if (!p) continue;
      const g = new THREE.Group();
      const rot = Math.floor(rand() * 4) * Math.PI / 2 + (rand() - 0.5) * 0.3;
      const dirt = models['crypt/floor_dirt_grave'];
      if (dirt) { const d = dirt.scene.clone(true); d.scale.setScalar(0.9); d.position.y = 0.01; g.add(d); }
      const gm = models[graveModels[Math.floor(rand() * graveModels.length)]];
      if (gm) { const o = gm.scene.clone(true); o.scale.setScalar(0.9); o.position.z = -0.9; g.add(o); }
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), new THREE.MeshBasicMaterial({ color: 0x3aff7a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.12;
      g.add(glow);
      g.traverse((o) => { if (o.isMesh && o !== glow) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(p[0], 0, p[1]); g.rotation.y = rot;
      group.add(g);
      pillars.push({ x: p[0] - Math.sin(rot) * 0.9, z: p[1] - Math.cos(rot) * 0.9, r: 0.6 });
      graves.push({ x: p[0], z: p[1], t: 6 + rand() * 6, glow, warn: 0, alive: 0 });
    }
    // Quan tài, đầu lâu, xương, nến rải rác
    const deco = [['crypt/coffin', 0.9, 0.7], ['crypt/coffin_decorated', 0.9, 0.7], ['crypt/skull', 0.8, 0], ['crypt/skull_candle', 0.8, 0], ['crypt/bone_A', 0.8, 0],
      ['crypt/ribcage', 0.8, 0], ['crypt/candle_melted', 0.9, 0], ['crypt/post_skull', 0.9, 0.35], ['crypt/gravemarker_A', 0.9, 0.3]];
    for (let i = 0; i < 16; i++) {
      const [name, sc, col] = deco[Math.floor(rand() * deco.length)];
      const m = models[name]; if (!m) continue;
      const p = free(col ? col + 0.6 : 0.6); if (!p) continue;
      const o = m.scene.clone(true);
      o.scale.setScalar(sc); o.position.set(p[0], 0, p[1]); o.rotation.y = rand() * Math.PI * 2;
      o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      group.add(o);
      if (col) pillars.push({ x: p[0], z: p[1], r: col });
      if (name.includes('candle')) { const l = new THREE.PointLight(0x9fffb0, 3, 4, 1.8); l.position.set(p[0], 0.8, p[1]); group.add(l); }
    }
  } else if (biome === 'swamp') {
    // Đầm Lầy Độc: vũng độc tự nhiên + nấm phát sáng (gặp Lửa sẽ nổ dây chuyền cả đầm!)
    for (let i = 0; i < 7; i++) {
      const r = 2.1 + rand() * 1.3;
      const p = freePool(r); if (!p) continue;
      swampBogs.push({ x: p[0], z: p[1], r, refillT: 0 });
      spawnToxic(new THREE.Vector3(p[0], 0, p[1]), r, 999);
    }
    const capMat = new THREE.MeshStandardMaterial({ color: 0x70e84a, emissive: 0x3ad820, emissiveIntensity: 0.7, flatShading: true });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xc8c0a0, roughness: 0.9 });
    for (let i = 0; i < 10; i++) {
      const p = free(1.3); if (!p) continue;
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const h = 0.6 + rand() * 0.9;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), stemMat);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.45 + rand() * 0.25, 0.4, 7), capMat);
        const ox = k === 0 ? 0 : (rand() - 0.5) * 0.9, oz = k === 0 ? 0 : (rand() - 0.5) * 0.9;
        stem.position.set(ox, h / 2, oz); cap.position.set(ox, h + 0.1, oz);
        g.add(stem, cap);
      }
      g.position.set(p[0], 0, p[1]); group.add(g);
      const l = new THREE.PointLight(0x8fe83a, 3.5, 6, 1.8); l.position.set(p[0], 1.2, p[1]); group.add(l);
      pillars.push({ x: p[0], z: p[1], r: 0.65 });
    }
  } else if (biome === 'sanctum') {
    // Thánh Điện Lôi: các cặp Cột Thu Lôi phóng tia sét nối nhau định kỳ (hất quái vào đường sét!)
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xd8c890, metalness: 0.7, roughness: 0.3 });
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xffe880, emissive: 0xffe14a, emissiveIntensity: 1.0 });
    const makePylon = (x, z) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.6, 8), pylonMat);
      body.position.y = 1.3; body.castShadow = true;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), orbMat.clone());
      orb.position.y = 2.85;
      g.add(body, orb);
      g.position.set(x, 0, z);
      group.add(g);
      pillars.push({ x, z, r: 0.55 });
      return { x, z, orb };
    };
    const anchors = [[-10, -10, 10, -10], [-10, 10, 10, 10], [-15, -4, -15, 10], [15, -10, 15, 4]];
    for (let i = 0; i < anchors.length; i++) {
      const [ax, az, bx, bz] = anchors[i];
      if (isBlocked(ax, az, 0.8) || isBlocked(bx, bz, 0.8)) continue;
      const a = makePylon(ax, az), b = makePylon(bx, bz);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, Math.hypot(bx - ax, bz - az), 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      beam.position.set((ax + bx) / 2, 1.5, (az + bz) / 2);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, 0, bz - az).normalize());
      group.add(beam);
      teslaPairs.push({ a, b, beam, t: i * 1.4, tick: 0 });
    }
  }
}

// Vết nứt phát sáng trên sàn
let crackTex = null;
function crackDecal(x, z, size, rand) {
  if (!crackTex) crackTex = new THREE.TextureLoader().load('/fx/scorch.png');
  // vết cháy xém tối trên sàn
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0a0402, alphaMap: crackTex, transparent: true, opacity: 0.6, depthWrite: false }));
  m.position.set(x, 0.03, z);
  m.rotation.y = rand() * Math.PI * 2;
  group.add(m);
}

// ---------- Tường nứt: đánh vỡ để mở phòng bí mật ----------
class SecretWall {
  constructor(x, z, rotY, onBreak) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.alive = true; this.hits = 0; this.onBreak = onBreak; this.t = 0;
    this.mesh = new THREE.Group();
    const m = models['dungeon/wall_cracked'];
    if (m) { const o = m.scene.clone(true); o.scale.set(DS * 0.55, DS * 0.7, DS * 0.6); o.rotation.y = rotY; this.mesh.add(o); }
    this.mesh.position.copy(this.pos);
    group.add(this.mesh);
    this.collider = { x, z, r: 0.9 };
    pillars.push(this.collider);
  }
  hit() {
    if (!this.alive) return;
    this.hits++;
    burst(this.pos.clone().setY(1), 0x8a7a6a, 10, { speed: 5, size: 0.18 });
    addShake(0.15);
    play('hitHeavy', { at: this.pos, rate: 1.3, vol: 0.6 });
    if (this.hits >= 3) {
      this.alive = false;
      group.remove(this.mesh);
      const i = pillars.indexOf(this.collider); if (i >= 0) pillars.splice(i, 1);
      burst(this.pos.clone().setY(1), 0x8a7a6a, 40, { speed: 9, size: 0.25 });
      fxSmoke(this.pos.clone().setY(0.8), { count: 8, color: 0x3a3430, size: 1.4, life: 1.2, alpha: 0.6 });
      play('explode', { at: this.pos, vol: 0.6 });
      this.onBreak?.(this.pos);
    }
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    // gợi ý: thỉnh thoảng có gió lùa và bụi rơi qua khe nứt
    if (Math.random() < dt * 1.2) emit(this.pos.clone().setY(1.6 + Math.random()), { smoke: true, frame: F.dust, color: 0x8a7a6a, size: 0.4, size2: 0.8, life: 1.2, vel: new THREE.Vector3(0, -0.6, 0), alpha: 0.5 });
  }
}
export function placeSecretWall(rand, onBreak) {
  const H = ROOM_HALF - 0.9;
  const side = Math.floor(rand() * 3);
  const t = (rand() * 2 - 1) * (ROOM_HALF - 5);
  const [x, z, rot] = side === 0 ? [t, -H, 0] : side === 1 ? [-H, t, Math.PI / 2] : [H, t, -Math.PI / 2];
  if (isBlocked(x * 0.97, z * 0.97, 1)) return null;
  const w = new SecretWall(x, z, rot, onBreak);
  ctx.barrels.push(w);
  return w;
}

// Người chơi đang đứng trên băng / nước / sương mù không
export function onIce(x, z) { return icePatches.some((p) => !p.melted && Math.hypot(x - p.x, z - p.z) < p.r); }
export function onWater(x, z) { return waterPatches.some((p) => Math.hypot(x - p.x, z - p.z) < p.r); }
export function inSteam(x, z) { return steamClouds.some((s) => Math.hypot(x - s.x, z - s.z) < s.r); }

// Tạo màn sương hơi nước (từ Tôi Địa Hình hoặc Lửa + Băng): làm mù quái đánh xa
export function spawnSteamCloud(pos, radius = 3.2, dur = 4.5) {
  if (!group) return;
  if (steamClouds.length >= 10) steamClouds.shift();
  steamClouds.push({ x: pos.x, z: pos.z, r: radius, t: dur, dur });
  fxSmoke(pos.clone().setY(0.6), { count: 10, color: 0xd8ecf4, size: radius * 0.6, life: 1.5, speed: 2.2, rise: 0.9, alpha: 0.45 });
  play('freeze', { at: pos, rate: 0.6, vol: 0.5 });
}

// Tạo vũng nước (khi băng tan hoặc kỹ năng)
export function spawnWaterPatch(x, z, r = 2.2, dur = 12, sourceIce = null) {
  if (!group) return null;
  if (waterPatches.length >= 12) {
    const old = waterPatches.shift();
    if (old) {
      if (old.sourceIce) { old.sourceIce.melted = false; if (old.sourceIce.mesh) old.sourceIce.mesh.visible = true; }
      group.remove(old.mesh);
      old.mesh.geometry?.dispose();
      disposeLiquidMat(old.mesh.material);
    }
  }
  const geo = blobGeometry(r, Math.random);
  const mesh = new THREE.Mesh(geo, liquidMaterial('water'));
  mesh.position.set(x, 0.042, z);
  mesh.renderOrder = 2;
  group.add(mesh);
  const w = { x, z, r: r * 0.9, t: dur, dur, mesh, sourceIce };
  waterPatches.push(w);
  return w;
}

// Tạo lốc nguyên tố di động (Gió cuốn qua Lửa / Độc / Sương)
function spawnCyclone(pos, dir, kind, dmg) {
  if (!group || cyclones.length >= 4) return;
  const d = dir && dir.lengthSq() > 0.01 ? dir.clone().setY(0).normalize() : new THREE.Vector3(0, 0, -1);
  const color = kind === 'fire' ? 0xff7a2a : kind === 'poison' ? 0x8fe83a : 0xd0f0ff;
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.8, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  mesh.rotation.x = Math.PI;
  mesh.position.set(pos.x, 1.4, pos.z);
  group.add(mesh);
  cyclones.push({ pos: pos.clone().setY(0), vel: d.multiplyScalar(5.5), kind, dmg: Math.max(8, Math.round(dmg)), t: 3.4, tick: 0, mesh, color });
  play('dash', { at: pos, rate: 0.55, vol: 0.7 });
  damageNumber(pos, kind === 'fire' ? 'Lốc Lửa!' : kind === 'poison' ? 'Bão Độc!' : 'Lốc Sương!', 'react melt');
}

// ---------- Ma Trận Hóa Học Bề Mặt (gọi từ combat.js / player.js khi đòn nguyên tố chạm đất/quái) ----------
export function reactSurface(pos, radius, element, dir = null, baseDmg = 18) {
  if (!group || !pos || !element || element === 'none' || surfaceDepth >= 2) return false;
  surfaceDepth++;
  let reacted = false;
  try {
    // 1. LỬA lên BĂNG -> Tan thành Vũng Nước + Màn Sương
    if (element === 'fire') {
      for (const ice of icePatches) {
        if (!ice || ice.melted) continue;
        if (Math.hypot(ice.x - pos.x, ice.z - pos.z) < ice.r + radius) {
          ice.melted = true;
          if (ice.mesh) ice.mesh.visible = false;
          spawnWaterPatch(ice.x, ice.z, ice.r * 1.1, 12, ice);
          spawnSteamCloud(new THREE.Vector3(ice.x, 0, ice.z), ice.r * 0.9, 3.5);
          damageNumber(new THREE.Vector3(ice.x, 0.4, ice.z), 'Tan Băng!', 'react shatter');
          reacted = true;
        }
      }
      // 2. LỬA lên VŨNG ĐỘC -> Kích nổ khí độc dây chuyền (thu thập batch & xóa trước để tránh sửa mảng khi đang lặp)!
      const toxics = getToxics();
      const hitIdx = [];
      for (let i = 0; i < toxics.length; i++) {
        const ti = toxics[i];
        if (ti && ti.pos && Math.hypot(ti.pos.x - pos.x, ti.pos.z - pos.z) < ti.radius + radius) hitIdx.push(i);
      }
      if (hitIdx.length) {
        const chain = new Set(hitIdx);
        let grew = true;
        while (grew) {
          grew = false;
          for (let i = 0; i < toxics.length; i++) {
            const ti = toxics[i];
            if (!ti || !ti.pos || chain.has(i)) continue;
            for (const j of chain) {
              const tj = toxics[j];
              if (tj && tj.pos && Math.hypot(ti.pos.x - tj.pos.x, ti.pos.z - tj.pos.z) < ti.radius + tj.radius + 1.8) {
                chain.add(i); grew = true; break;
              }
            }
          }
        }
        const batch = [];
        const sorted = [...chain].sort((a, b) => b - a);
        for (const i of sorted) {
          const t = toxics[i];
          if (!t || !t.pos) continue;
          batch.push({ pos: t.pos.clone(), r: Math.max(2.6, t.radius * 1.9) });
          removeToxic(i);
        }
        for (const b of batch) {
          explosion(b.pos, b.r, 0x9fff5a, { smoke: true, scorch: true, core: 0xe8ffb0 });
          damageNumber(b.pos, 'Khí Độc Nổ!', 'react overload');
          play('explode', { at: b.pos, vol: 0.75 });
          aoe(b.pos, b.r, Math.round(baseDmg * 1.1 + 18), { element: 'fire', element2: null }, 12, { surface: false });
          spawnFirePatch(b.pos, b.r * 0.7, 3.2, 12);
        }
        if (batch.length) reacted = true;
      }
    }

    // 3. SÉT lên VŨNG NƯỚC -> Điện Trường diện rộng (4s)
    if (element === 'lightning') {
      for (const w of waterPatches) {
        if (!w || w.electrified) continue;
        if (Math.hypot(w.x - pos.x, w.z - pos.z) < w.r + radius) {
          w.electrified = true;
          if (elecPatches.length >= 8) {
            const old = elecPatches.shift();
            if (old) {
              if (old.water) old.water.electrified = false;
              group.remove(old.mesh);
              old.mesh.geometry?.dispose();
              disposeLiquidMat(old.mesh.material);
            }
          }
          const mesh = new THREE.Mesh(blobGeometry(w.r * 1.05, Math.random), liquidMaterial('elec'));
          mesh.position.set(w.x, 0.055, w.z);
          mesh.renderOrder = 3;
          group.add(mesh);
          elecPatches.push({ x: w.x, z: w.z, r: w.r * 1.1, t: 4.2, tick: 0, dmg: Math.max(10, Math.round(baseDmg * 0.55)), mesh, water: w });
          spawnRing(ctx.scene, new THREE.Vector3(w.x, 0, w.z), w.r * 1.15, 0xffe14a, 0.45);
          damageNumber(new THREE.Vector3(w.x, 0.4, w.z), 'Điện Trường!', 'react overload');
          play('zap', { at: { x: w.x, z: w.z }, vol: 0.75 });
          reacted = true;
        }
      }
    }

    // 4. BĂNG lên VŨNG NHAM THẠCH -> Đông cứng thành vỏ Đá Obsidian đi qua được (8s)
    if (element === 'ice') {
      for (const L of lavaPools) {
        if (!L || L.obsidianT > 0) continue;
        if (Math.hypot(L.x - pos.x, L.z - pos.z) < L.r + radius) {
          L.obsidianT = 8.5;
          if (!L.obsMat) L.obsMat = liquidMaterial('obsidian');
          if (L.mesh) L.mesh.material = L.obsMat;
          L.light.intensity = 1.2;
          spawnRing(ctx.scene, new THREE.Vector3(L.x, 0, L.z), L.r, 0xa080ff, 0.45);
          spawnSteamCloud(new THREE.Vector3(L.x, 0, L.z), L.r * 0.85, 2.5);
          damageNumber(new THREE.Vector3(L.x, 0.4, L.z), 'Đá Obsidian!', 'react shatter');
          play('freeze', { at: { x: L.x, z: L.z }, rate: 0.7 });
          reacted = true;
        }
      }
      // Băng lên Vũng Nước -> Đóng băng trở lại
      for (let i = waterPatches.length - 1; i >= 0; i--) {
        const w = waterPatches[i];
        if (!w) continue;
        if (Math.hypot(w.x - pos.x, w.z - pos.z) < w.r + radius && w.sourceIce) {
          w.sourceIce.melted = false;
          if (w.sourceIce.mesh) w.sourceIce.mesh.visible = true;
          group.remove(w.mesh); w.mesh.geometry?.dispose(); disposeLiquidMat(w.mesh.material);
          waterPatches.splice(i, 1);
          damageNumber(new THREE.Vector3(w.x, 0.4, w.z), 'Đóng Băng Lại!', 'react shatter');
          play('freeze', { at: { x: w.x, z: w.z } });
          reacted = true;
        }
      }
    }

    // 5. GIÓ lên VÙNG LỬA / VŨNG ĐỘC / SƯƠNG -> Cuốn thành Lốc Nguyên Tố Di Động!
    if (element === 'wind') {
      const fires = getFirePatches();
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        if (!f || !f.pos) continue;
        if (Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z) < f.radius + radius) {
          const p0 = f.pos.clone();
          const idx = fires.indexOf(f);
          if (idx >= 0) removeFirePatch(idx);
          spawnCyclone(p0, dir, 'fire', baseDmg * 0.65);
          reacted = true;
          break;
        }
      }
      if (!reacted) {
        const tox = getToxics();
        for (let i = tox.length - 1; i >= 0; i--) {
          const f = tox[i];
          if (!f || !f.pos) continue;
          if (Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z) < f.radius + radius) {
            const p0 = f.pos.clone();
            const idx = tox.indexOf(f);
            if (idx >= 0) removeToxic(idx);
            spawnCyclone(p0, dir, 'poison', baseDmg * 0.6);
            reacted = true;
            break;
          }
        }
      }
    }
  } finally {
    surfaceDepth--;
  }
  return reacted;
}

// ---------- Đập vỡ Đá Obsidian & Phá Đổ Cột Đá bằng Đòn Nặng / Tích Lực ----------
export function damagePillars(pos, radius, dir, heavy = false) {
  if (!heavy) return false;
  let hit = false;
  const d = dir && dir.lengthSq() > 0.01 ? dir.clone().setY(0).normalize() : new THREE.Vector3(0, 0, -1);

  // Vỡ vỏ Đá Obsidian -> nổ mảnh đá sắc
  for (const L of lavaPools) {
    if (L.obsidianT > 0 && Math.hypot(L.x - pos.x, L.z - pos.z) < L.r + radius) {
      L.obsidianT = 0;
      if (L.mesh && L.lavaMat) L.mesh.material = L.lavaMat;
      const p0 = new THREE.Vector3(L.x, 0.2, L.z);
      burst(p0, 0x9a70ff, 28, { speed: 12, size: 0.22 });
      spawnRing(ctx.scene, p0, L.r * 1.9, 0xb090ff, 0.45);
      damageNumber(p0, 'Vỡ Obsidian!', 'react stun');
      addShake(0.45);
      play('explode', { at: p0, rate: 1.25 });
      aoe(p0, L.r * 1.9, 45, { element: 'none', element2: null }, 14, { surface: false });
      hit = true;
    }
  }

  // Phá đổ Cột Đá trong phòng (pillars[].destructible)
  for (let i = pillars.length - 1; i >= 0; i--) {
    const p = pillars[i];
    if (!p.destructible) continue;
    if (Math.hypot(p.x - pos.x, p.z - pos.z) < p.r + radius + 0.5) {
      p.hp = (p.hp ?? 2) - 1;
      const p0 = new THREE.Vector3(p.x, 1, p.z);
      burst(p0, 0x8a7a6a, 14, { speed: 6, size: 0.22 });
      play('hitHeavy', { at: p0, rate: 0.9 });
      if (p.hp <= 0) {
        pillars.splice(i, 1);
        ctx.onPillarCollapse?.();
        damageNumber(p0, 'Sập Cột Đá!', 'react stun');
        addShake(0.65);
        play('explode', { at: p0, rate: 0.75 });
        fxSmoke(p0, { count: 10, color: 0x5a5048, size: 1.5, life: 1.3, alpha: 0.65 });
        // Animation đổ cột theo hướng đánh
        if (p.mesh) {
          fallingPillars.push({ mesh: p.mesh, dir: d.clone(), t: 0, dur: 0.55 });
        }
        // Đè bẹp toàn bộ quái dọc theo đường cột đổ (4.8m)
        for (const e of ctx.enemies) {
          if (!e.alive || e.spawning) continue;
          const rx = e.pos.x - p.x, rz = e.pos.z - p.z;
          const proj = rx * d.x + rz * d.z;
          const perp = Math.abs(rx * -d.z + rz * d.x);
          if (proj > -0.5 && proj < 5.0 && perp < 1.6 + e.radius) {
            const crushDmg = Math.round((e.maxHpEff || e.maxHp || e.hp) * (e.isBoss ? 0.08 : 0.65) + 35);
            dealDamage(e, crushDmg, { element: 'none', element2: null }, d, 14, true, false);
            e.stunT = Math.max(e.stunT, e.isBoss ? 2.5 : 3.0);
            if (e.poiseMax) e.poise += e.poiseMax * 0.5;
            damageNumber(e.pos, 'Đè Bẹp!', 'react stun');
          }
        }
        hit = true;
      } else {
        damageNumber(p0, 'Nứt Cột!', 'burn');
      }
    }
  }
  return hit;
}

export function updateHazards(dt, rain) {
  for (const b of ctx.barrels) b.update(dt);
  for (const s of spikes) s.update(dt);
  const pl = ctx.player;

  // Cột đang đổ
  for (let i = fallingPillars.length - 1; i >= 0; i--) {
    const fp = fallingPillars[i];
    fp.t += dt;
    const k = Math.min(1, fp.t / fp.dur);
    const ang = k * k * (Math.PI / 2);
    fp.mesh.rotation.x = fp.dir.z * ang;
    fp.mesh.rotation.z = -fp.dir.x * ang;
    fp.mesh.position.y = -k * 0.35;
    if (fp.t > fp.dur + 1.8) {
      fp.mesh.parent?.remove(fp.mesh);
      fallingPillars.splice(i, 1);
    }
  }

  // Vũng nước: gắn trạng thái Ướt (wetT) lên quái đứng trong vũng
  for (let i = waterPatches.length - 1; i >= 0; i--) {
    const w = waterPatches[i];
    w.t -= dt;
    for (const e of ctx.enemies) {
      if (e.alive && !e.spawning && (e.height || 0) < 0.5 && Math.hypot(e.pos.x - w.x, e.pos.z - w.z) < w.r + e.radius) {
        e.wetT = Math.max(e.wetT || 0, 2.5);
      }
    }
    if (w.t <= 0) {
      if (w.sourceIce) { w.sourceIce.melted = false; if (w.sourceIce.mesh) w.sourceIce.mesh.visible = true; }
      group.remove(w.mesh); w.mesh.geometry?.dispose(); disposeLiquidMat(w.mesh.material);
      waterPatches.splice(i, 1);
    }
  }

  // Vùng Điện Trường (Sét + Vũng Nước)
  for (let i = elecPatches.length - 1; i >= 0; i--) {
    const ep = elecPatches[i];
    ep.t -= dt; ep.tick -= dt;
    if (Math.random() < dt * 10) emit({ x: ep.x + (Math.random() - 0.5) * ep.r * 1.4, y: 0.25, z: ep.z + (Math.random() - 0.5) * ep.r * 1.4 }, { frame: F.elec, color: 0xffe14a, color2: 0x7fdcff, size: 0.9, size2: 0.2, life: 0.16, hdr: 2 });
    if (ep.tick <= 0) {
      ep.tick = 0.45;
      for (const e of ctx.enemies) {
        if (e.alive && !e.spawning && Math.hypot(e.pos.x - ep.x, e.pos.z - ep.z) < ep.r + e.radius) {
          dealDamage(e, ep.dmg, { element: 'lightning', element2: null }, null, 2, false, false);
          if (e.poiseMax) e.poise += ep.dmg * 0.9;
          spawnBolt(ctx.scene, new THREE.Vector3(ep.x, 0.2, ep.z), e.pos.clone().setY(0.8), 0xffe14a);
        }
      }
    }
    if (ep.t <= 0) {
      if (ep.water) ep.water.electrified = false;
      group.remove(ep.mesh); ep.mesh.geometry?.dispose(); disposeLiquidMat(ep.mesh.material);
      elecPatches.splice(i, 1);
    }
  }

  // Màn Sương Hơi Nước: làm mù quái đánh xa
  for (let i = steamClouds.length - 1; i >= 0; i--) {
    const sc = steamClouds[i];
    sc.t -= dt;
    if (Math.random() < dt * 6) fxSmoke(new THREE.Vector3(sc.x + (Math.random() - 0.5) * sc.r, 0.5, sc.z + (Math.random() - 0.5) * sc.r), { count: 1, color: 0xd8eef8, size: 1.5, life: 0.9, speed: 0.5, rise: 0.7, alpha: 0.28 });
    for (const e of ctx.enemies) {
      if (e.alive && Math.hypot(e.pos.x - sc.x, e.pos.z - sc.z) < sc.r + e.radius) e.blindT = Math.max(e.blindT || 0, 0.8);
    }
    if (sc.t <= 0) steamClouds.splice(i, 1);
  }

  // Lốc Nguyên Tố Di Động (Gió + Lửa/Độc)
  for (let i = cyclones.length - 1; i >= 0; i--) {
    const c = cyclones[i];
    c.t -= dt; c.tick -= dt;
    c.pos.addScaledVector(c.vel, dt);
    if (isBlocked(c.pos.x, c.pos.z, 0.6)) c.vel.negate();
    c.mesh.position.set(c.pos.x, 1.4, c.pos.z);
    c.mesh.rotation.y += dt * 11;
    if (Math.random() < dt * 18) {
      const a = Math.random() * Math.PI * 2;
      emit(new THREE.Vector3(c.pos.x + Math.cos(a) * 1.1, 0.4 + Math.random() * 1.6, c.pos.z + Math.sin(a) * 1.1), {
        frame: c.kind === 'fire' ? F.flame : F.glow, color: c.color, size: 0.7, size2: 0.1, life: 0.4, vel: new THREE.Vector3(-Math.sin(a) * 5, 2.5, Math.cos(a) * 5),
      });
    }
    if (c.tick <= 0) {
      c.tick = 0.35;
      for (const e of ctx.enemies) {
        if (!e.alive || e.spawning) continue;
        const d = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z);
        if (d < 2.5 + e.radius) {
          if (!e.isBoss) e.knock.set(c.pos.x - e.pos.x, 0, c.pos.z - e.pos.z).normalize().multiplyScalar(5.5);
          dealDamage(e, c.dmg, { element: c.kind === 'fire' ? 'fire' : 'poison', element2: null }, null, 0, false, false);
        }
      }
    }
    if (c.t <= 0) {
      group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose();
      cyclones.splice(i, 1);
    }
  }

  // Vũng nham thạch (và vỏ Đá Obsidian tạm thời)
  for (const L of lavaPools) {
    if (L.obsidianT > 0) {
      L.obsidianT -= dt;
      if (L.obsidianT <= 0) {
        if (L.mesh && L.lavaMat) L.mesh.material = L.lavaMat;
        L.light.intensity = 6;
      }
      continue;
    }
    L.light.intensity = 6 + Math.sin(performance.now() / 260 + L.seed) * 1.5;
    if (Math.random() < dt * 3) emit(new THREE.Vector3(L.x + (Math.random() - 0.5) * L.r, 0.1, L.z + (Math.random() - 0.5) * L.r), { frame: F.glow, color: 0xffc060, color2: 0xff3a00, size: 0.3, size2: 0, life: 0.8, vel: new THREE.Vector3(0, 2, 0), hdr: 2 });
    L.tick -= dt;
    if (L.tick > 0) continue;
    L.tick = 0.5;
    if (pl && !pl.dead && pl.dashTime <= 0 && Math.hypot(pl.pos.x - L.x, pl.pos.z - L.z) < L.r) {
      if (pl.hurt(6)) damageNumber(pl.pos, 6, 'player');
      flame(pl.pos.clone().setY(0.3), { count: 3, size: 0.6 });
    }
    for (const e of ctx.enemies) if (e.alive && !e.isBoss && (e.height || 0) < 0.5 && Math.hypot(e.pos.x - L.x, e.pos.z - L.z) < L.r) { e.burnT = 2; e.burnDps = Math.max(e.burnDps, 5); }
  }
  // Mộ sống dậy
  const fighting = ctx.enemies.some((e) => e.alive && !e.isGrave);
  for (const g of graves) {
    if (!fighting || !pl || pl.dead) { g.glow.material.opacity = 0; continue; }
    g.t -= dt;
    g.glow.material.opacity = g.t < 1.2 ? 0.5 + Math.sin(g.t * 20) * 0.3 : 0;
    if (g.t < 1.2 && Math.random() < dt * 10) emit(new THREE.Vector3(g.x + (Math.random() - 0.5), 0.3, g.z + (Math.random() - 0.5)), { frame: F.glow, color: 0x9fffbf, color2: 0x2a8a4a, size: 0.4, size2: 0, life: 0.7, vel: new THREE.Vector3(0, 1.5, 0) });
    if (g.t <= 0) {
      g.t = 9 + Math.random() * 5;
      const alive = ctx.enemies.filter((e) => e.isGrave && e.alive).length;
      if (alive < 3 && ctx.spawnGrave) {
        fxSmoke(new THREE.Vector3(g.x, 0.3, g.z), { count: 5, color: 0x2a4a30, size: 1, life: 1, alpha: 0.5 });
        play('mageSpawn', { at: { x: g.x, z: g.z } });
        ctx.spawnGrave(g.x + 1.4, g.z);
      }
    }
  }
  // Đầm Lầy Độc: tự tái tạo vũng độc sau 9s nếu bị đốt nổ sạch
  if (swampBogs.length) {
    const tox = getToxics();
    for (const bog of swampBogs) {
      const has = tox.some((t) => Math.hypot(t.pos.x - bog.x, t.pos.z - bog.z) < bog.r);
      if (!has) {
        bog.refillT += dt;
        if (bog.refillT >= 9) { bog.refillT = 0; spawnToxic(new THREE.Vector3(bog.x, 0, bog.z), bog.r, 999); }
      } else bog.refillT = 0;
    }
  }

  // Thánh Điện Lôi: chu kỳ 6s (3.2s nghỉ -> 0.8s nạp điện -> 2.0s phóng tia sét giữa cặp cột!)
  for (const tp of teslaPairs) {
    tp.t = (tp.t + dt) % 6.0;
    const warn = tp.t >= 3.2 && tp.t < 4.0;
    const active = tp.t >= 4.0;
    tp.a.orb.rotation.y += dt * (active ? 8 : warn ? 4 : 1.5);
    tp.b.orb.rotation.y += dt * (active ? 8 : warn ? 4 : 1.5);
    tp.beam.material.opacity = active ? 0.72 : warn ? 0.22 + Math.sin(tp.t * 35) * 0.12 : 0;
    if (active) {
      if (Math.random() < dt * 12) spawnBolt(ctx.scene, new THREE.Vector3(tp.a.x, 2.2, tp.a.z), new THREE.Vector3(tp.b.x, 2.2, tp.b.z), 0xffe860);
      tp.tick -= dt;
      if (tp.tick <= 0) {
        tp.tick = 0.4;
        const ax = tp.a.x, az = tp.a.z, bx = tp.b.x, bz = tp.b.z;
        const abx = bx - ax, abz = bz - az, lenSq = abx * abx + abz * abz || 1;
        const distSeg = (px, pz) => {
          const u = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
          return Math.hypot(px - (ax + abx * u), pz - (az + abz * u));
        };
        if (pl && !pl.dead && pl.dashTime <= 0 && distSeg(pl.pos.x, pl.pos.z) < 0.75 + pl.radius) {
          if (pl.hurt(10)) damageNumber(pl.pos, 10, 'player');
          play('zap', { at: pl.pos, vol: 0.5 });
        }
        for (const e of ctx.enemies) {
          if (!e.alive || e.spawning) continue;
          if (distSeg(e.pos.x, e.pos.z) < 0.85 + e.radius) {
            dealDamage(e, 34, { element: 'lightning', element2: null }, null, 4, true, false);
            if (!e.isBoss) e.stunT = Math.max(e.stunT, 0.8);
            play('zap', { at: e.pos, vol: 0.4 });
          }
        }
      }
    }
  }

  // Biến cố "Mưa Lửa"
  if (rain) {
    rainT -= dt;
    if (rainT <= 0) {
      rainT = 1.3;
      const p = ctx.player.pos;
      const at = new THREE.Vector3(p.x + (Math.random() - 0.5) * 22, 0, p.z + (Math.random() - 0.5) * 22);
      scheduleBomb(at, 1.1, 1.9, 22, 12, 0xff6a1a);
    }
  }
}
