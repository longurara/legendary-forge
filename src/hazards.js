// Bẫy và vật thể trong phòng: thùng thuốc nổ, bẫy gai, mưa lửa
import * as THREE from 'three';
import { models } from './models.js';
import { ctx, aoe, scheduleBomb, spawnFirePatch } from './combat.js';
import { spawnRing, burst, addShake, spawnTelegraph, damageNumber, explosion, flame } from './fx.js';
import { play } from './audio.js';
import { isBlocked, ROOM_HALF, DS, pillars, currentBiome } from './world.js';
import { emit, F, smoke as fxSmoke, liquidMaterial, blobGeometry } from './fx.js';

let group = null;
const spikes = [];
const icePatches = [];
const lavaPools = [];
const graves = [];
export let waveActive = { on: false };
let rainT = 0;

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

// Đặt bẫy cho tầng mới (gọi sau buildWorld)
export function buildHazards(scene, floor, rand = Math.random) {
  if (group) scene.remove(group);
  group = new THREE.Group();
  scene.add(group);
  ctx.barrels.length = 0;
  spikes.length = 0;
  const free = (r) => {
    for (let k = 0; k < 60; k++) {
      const x = (rand() * 2 - 1) * (ROOM_HALF - 3), z = (rand() * 2 - 1) * (ROOM_HALF - 3);
      if (Math.hypot(x, z - (ROOM_HALF - 4)) < 5 || Math.hypot(x, z) < 3) continue;   // tránh chỗ xuất phát và giữa phòng
      if (!isBlocked(x, z, r)) return [x, z];
    }
    return null;
  };
  const nBarrels = 4 + Math.min(3, floor);
  for (let i = 0; i < nBarrels; i++) { const p = free(1.5); if (p) ctx.barrels.push(new Barrel(scene, p[0], p[1])); }
  icePatches.length = 0; lavaPools.length = 0; graves.length = 0;
  const biome = currentBiome.id;
  const nSpikes = biome === 'stone' || biome === 'crypt' ? 2 + Math.min(3, floor) : 1;
  for (let i = 0; i < nSpikes; i++) { const p = free(2.2); if (p) spikes.push(new Spike(p[0], p[1], rand() * 3.2)); }
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
    for (let i = 0; i < 5; i++) {
      const r = 2.2 + rand() * 1.6;
      const p = freePool(r); if (!p) continue;
      const geo = blobGeometry(r, rand);
      const m = new THREE.Mesh(geo, liquidMaterial('ice'));
      m.position.set(p[0], 0.035, p[1]);
      m.renderOrder = 1;
      group.add(m);
      icePatches.push({ x: p[0], z: p[1], r: r * 0.9 });
    }
    // Cụm pha lê băng (vật cản), mặt phẳng góc cạnh
    const crystal = new THREE.MeshStandardMaterial({ color: 0xa8e4ff, emissive: 0x2a7acf, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 6; i++) {
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
    for (let i = 0; i < 4; i++) {
      const r = 1.6 + rand() * 1.3;
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
      lavaPools.push({ x: p[0], z: p[1], r: r * 0.85, light: L, tick: 0, seed: rand() * 10 });
    }
    // Vết nứt nóng trên sàn (texture tia điện Kenney tô màu cam)
    for (let i = 0; i < 10; i++) {
      const p = free(1); if (!p) continue;
      crackDecal(p[0], p[1], 1.5 + rand() * 1.8, rand);
    }
  } else if (biome === 'crypt') {
    // Mộ thật (KayKit Halloween): khi đang có quái, thỉnh thoảng sống dậy một bộ xương
    const graveModels = ['crypt/grave_A', 'crypt/grave_B', 'crypt/gravestone', 'crypt/grave_A_destroyed'];
    for (let i = 0; i < 5; i++) {
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

// Người chơi đang đứng trên băng không (player.js dùng để trượt)
export function onIce(x, z) { return icePatches.some((p) => Math.hypot(x - p.x, z - p.z) < p.r); }

export function updateHazards(dt, rain) {
  for (const b of ctx.barrels) b.update(dt);
  for (const s of spikes) s.update(dt);
  const pl = ctx.player;
  // Vũng nham thạch
  for (const L of lavaPools) {
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
  // Biến cố "Mưa Lửa"
  if (rain) {
    rainT -= dt;
    if (rainT <= 0) {
      rainT = 1.3;
      const p = ctx.player.pos;
      const at = new THREE.Vector3(p.x + (Math.random() - 0.5) * 14, 0, p.z + (Math.random() - 0.5) * 14);
      scheduleBomb(at, 1.1, 1.9, 22, 12, 0xff6a1a);
    }
  }
}
