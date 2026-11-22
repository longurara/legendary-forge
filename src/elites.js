// Quái tinh anh: 1–2 thuộc tính ngẫu nhiên, hào quang + nhãn tên, rơi nhiều đồ hơn
import * as THREE from 'three';
import { scheduleBomb, ctx, enemyShot } from './combat.js';
import { smoke, spawnRing, spawnTelegraph, damageNumber, emit, F } from './fx.js';
import { play } from './audio.js';
import { isBlocked } from './world.js';

export const AFFIX_DEFS = {
  thorns: { name: 'Gai', color: 0xc0c0c0, apply: (e) => { e.thorns = 0.15; } },
  swift: { name: 'Cuồng Phong', color: 0x7fe0ff, apply: (e) => { e.eliteSpeed = 1.5; } },
  giant: { name: 'Khổng Lồ', color: 0xff9a4a, apply: (e) => { e.hp *= 1.6; e.giant = 1.35; e.mass *= 1.5; } },
  regen: { name: 'Tái Sinh', color: 0x6fe38a, apply: (e) => { e.regenPct = 0.03; } },
  explode: { name: 'Nổ Khi Chết', color: 0xff5a3a, apply: (e) => { e.explodeOnDeath = true; } },
  shield: { name: 'Khiên Phép', color: 0x5aa8ff, apply: (e) => { e.wantShield = true; } },
  clone: { name: 'Phân Thân', color: 0xd08aff, apply: (e) => { e.wantClone = true; } },
  blink: { name: 'Dịch Chuyển', color: 0xb070ff, apply: (e) => { e.blinkT = 3 + Math.random() * 2; } },
  frost: { name: 'Băng Giá', color: 0x9fe8ff, apply: (e) => { e.frostT = 3 + Math.random() * 2; } },
  mender: { name: 'Hồi Sinh Lực', color: 0x6fe38a, apply: (e) => { e.mender = true; } },
  orbs: { name: 'Phản Cầu', color: 0xc06bff, apply: (e) => { e.orbCd = 0; } },
};

// Hành vi theo khung hình của các thuộc tính chủ động
function eliteTick(e, dt) {
  const p = ctx.player;
  if (!p || p.dead || e.spawning) return;
  const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  if (e.blinkT != null) {
    e.blinkT -= dt;
    if (e.blinkT <= 0 && d > 3) {
      e.blinkT = 4.5 + Math.random() * 2;
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 1.5;
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      if (!isBlocked(x, z, 0.8)) {
        smoke(e.pos.clone().setY(0.8), { count: 5, color: 0x3a2050, size: 0.9, life: 0.7, alpha: 0.6 });
        e.pos.set(x, 0, z);
        smoke(e.pos.clone().setY(0.8), { count: 5, color: 0x3a2050, size: 0.9, life: 0.7, alpha: 0.6 });
        play('dash', { at: e.pos, rate: 0.7 });
      }
    }
  }
  if (e.frostT != null) {
    e.frostT -= dt;
    if (e.frostT <= 0 && d < 7) {
      e.frostT = 5 + Math.random() * 2;
      const at = e.pos.clone();
      spawnTelegraph(e.scene, { shape: 'circle', pos: at, radius: 3, duration: 0.9, color: 0x6fc3ff });
      setTimeout(() => {
        if (e.dead) return;
        spawnRing(e.scene, at, 3, 0x9fe8ff, 0.5);
        play('freeze', { at });
        for (let i = 0; i < 14; i++) emit(at.clone().setY(0.4), { frame: F.cross, color: 0xdff8ff, color2: 0x6fc3ff, size: 0.6, size2: 0, life: 0.6, vel: new THREE.Vector3((Math.random() - 0.5) * 9, 1, (Math.random() - 0.5) * 9) });
        if (!p.dead && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 3 + p.radius && p.hurt(12)) damageNumber(p.pos, 12, 'player');
      }, 900);
    }
  }
  if (e.mender) {
    e.menderT = (e.menderT || 0) - dt;
    if (e.menderT <= 0) {
      e.menderT = 1;
      let healed = false;
      for (const o of ctx.enemies) {
        if (o === e || !o.alive || o.pos.distanceTo(e.pos) > 6) continue;
        const max = o.maxHpEff || o.maxHp || o.hp;
        if (o.hp < max) { o.hp = Math.min(max, o.hp + max * (o.isBoss ? 0.01 : 0.05)); healed = true; }
      }
      if (healed) spawnRing(e.scene, e.pos, 6, 0x3ad36a, 0.5);
    }
  }
  if (e.orbCd != null) e.orbCd = Math.max(0, e.orbCd - dt);
}
const KEYS = Object.keys(AFFIX_DEFS);
const labelLayer = () => document.getElementById('dmg-layer');
const ringGeo = new THREE.RingGeometry(0.85, 1.05, 32);

export function makeElite(e, count = null, r = Math.random) {
  if (e.isBoss) return e;
  if (count == null) count = 1 + (r() < 0.35 ? 1 : 0);
  const pool = [...KEYS];
  const affixes = [];
  while (affixes.length < count && pool.length) affixes.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  e.elite = affixes;
  e.hp = Math.round(e.hp * 2.2);
  e.xp = (e.xp || 1) * 2;
  e.dropChance = Math.min(1, (e.dropChance || 0.1) * 3);
  e.poiseMax = Math.round(e.hp * 0.6);
  for (const a of affixes) AFFIX_DEFS[a].apply(e);
  e.eliteTick = (dt) => eliteTick(e, dt);
  // Phản Cầu / Phân Thân: bọc hàm nhận đòn
  if (e.orbCd != null || e.wantClone) {
    const take = e.takeHit.bind(e);
    e.takeHit = (dmg, dir, kb, crit, kind) => {
      const r = take(dmg, dir, kb, crit, kind);
      const p = ctx.player;
      if (e.orbCd === 0 && r > 0 && p && !p.dead && !e.dead) {
        e.orbCd = 1.2;
        const to = new THREE.Vector3(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z).normalize();
        enemyShot(e.pos.clone().setY(1.1).addScaledVector(to, 0.6), to, 8);
      }
      if (e.wantClone && !e.cloned && !e.dead && e.hp < e.maxHpEff * 0.5) {
        e.cloned = true;
        for (const side of [-1, 1]) {
          const c = new e.constructor(e.scene, e.pos.x + side * 1.4, e.pos.z, e.type);
          c.hp = Math.round(e.maxHpEff * 0.3); c.maxHpEff = c.hp; c.spawnT = 0.4; c.xp = 1; c.dropChance = 0;
          if (c.mats) for (const m of c.mats) if (m.color) m.color.lerp(new THREE.Color(0xd08aff), 0.4);
          ctx.spawnEnemy?.(c);
        }
        smoke(e.pos.clone().setY(0.8), { count: 8, color: 0x4a2a60, size: 1, life: 0.8, alpha: 0.6 });
        play('mageCast', { at: e.pos, rate: 1.3 });
      }
      return r;
    };
  }
  e.maxHpEff = e.hp;
  e.eliteColor = new THREE.Color(AFFIX_DEFS[affixes[0]].color);
  if (e.giant) e.group.scale.multiplyScalar(e.giant);
  if (e.wantShield) {
    e.shieldHp = Math.round(e.hp * 0.35);
    e.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    e.shieldMesh.position.y = 0.9;
    e.group.add(e.shieldMesh);
  }
  // Hào quang dưới chân
  e.eliteRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: e.eliteColor, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  e.eliteRing.rotation.x = -Math.PI / 2;
  e.scene.add(e.eliteRing);
  // Nhãn tên trên đầu
  e.label = document.createElement('div');
  e.label.className = 'label elite';
  e.label.textContent = affixes.map((a) => AFFIX_DEFS[a].name).join(' · ');
  labelLayer().appendChild(e.label);
  // Nổ khi chết: bọc hàm die
  if (e.explodeOnDeath) {
    const die = e.die.bind(e);
    e.die = () => { if (!e.dead) scheduleBomb(e.pos, 0.8, 2.6, 0, 16); die(); };
  }
  return e;
}

const tmp = new THREE.Vector3();
export function updateEliteLabels(enemies, camera) {
  for (const e of enemies) {
    if (!e.label || e.dead) continue;
    tmp.set(e.pos.x, 2.4 * (e.giant || 1) + (e.height || 0), e.pos.z).project(camera);
    const off = Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1;
    e.label.style.display = off ? 'none' : '';
    e.label.style.left = (tmp.x * 0.5 + 0.5) * innerWidth + 'px';
    e.label.style.top = (-tmp.y * 0.5 + 0.5) * innerHeight + 'px';
  }
}
