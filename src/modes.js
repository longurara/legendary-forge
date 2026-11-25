// 2 Chế độ chơi mới:
// 1. Phòng Tập Lò Rèn (SandboxManager + TrainingDummy bất tử đo DPS thời gian thực)
// 2. Thủ Thành Lò Lửa (DefenseManager: 10 đợt bảo vệ Lò Lửa 1000 HP + 4 Bệ Trụ Lửa/Băng/Sét nâng cấp bằng Mảnh Thép)
import * as THREE from 'three';
import { Enemy } from './enemies.js';
import { ctx, dealDamage, aoe } from './combat.js';
import { makeWeapon } from './weapons.js';
import { burst, damageNumber, spawnRing, addShake, flash, spawnBolt, flame, emit, F } from './fx.js';
import { play } from './audio.js';

// =========================================================================
// 1. HÌNH NỘM THÉP BẤT TỬ & PHÒNG TẬP LÒ RÈN (SANDBOX)
// =========================================================================
export class TrainingDummy extends Enemy {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.isDummy = true;
    this.noReward = true;
    this.name = 'Hình Nộm Thép';
    this.maxHp = this.hp = 999999;
    this.maxHpEff = 999999;
    this.poiseMax = 0;
    this.mass = 30;
    this.contactDmg = 0;
    this.dropChance = 0;
    this.xp = 0;
    this.color = 0xd8a860;
    this.hurtSound = 'hitHeavy';
    this.spawning = false;
    this.shadowScale = 1.1;
    this.hits = [];
    this.peakDps = 0;
    this.totalDmg = 0;
    this.wobble = 0;
    this.wobbleAxis = new THREE.Vector3(1, 0, 0);

    this.body = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4728, roughness: 0.8 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x8e9aa8, metalness: 0.72, roughness: 0.32 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe6b85a, metalness: 0.8, roughness: 0.25, emissive: 0x402404, emissiveIntensity: 0.35 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.22, 12), steelMat);
    base.position.y = 0.11;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.9, 8), postMat);
    pole.position.y = 1.05;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.95, 10), steelMat);
    torso.position.y = 1.25;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.05, 8, 18), goldMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.25;
    const arms = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 0.18), postMat);
    arms.position.y = 1.48;
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), steelMat);
    head.position.y = 1.98;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.12, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcf4a, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;

    this.body.add(base, pole, torso, band, arms, head);
    this.group.add(this.body, ring);
    this.setupMaterials(this.body);
    this.group.position.set(x, 0, z);
    this.shadow.position.set(x, 0.015, z);
    this.shadow.scale.setScalar(1.15);
  }
  get radius() { return 0.7; }
  get grounded() { return true; }

  takeHit(dmg, dir, kb, crit, kind = '') {
    const dealt = Math.max(0, Math.round(dmg));
    const now = performance.now() / 1000;
    this.hits.push({ t: now, dmg: dealt });
    this.totalDmg += dealt;
    this.wobble = Math.min(0.45, this.wobble + 0.24);
    if (dir && dir.lengthSq() > 0.001) {
      this.wobbleAxis.set(dir.z, 0, -dir.x).normalize();
    }
    const res = super.takeHit(dealt, dir, 0, crit, kind);
    // Không bao giờ chết
    this.hp = this.maxHp;
    this.dead = false;
    this.dying = false;
    this.knock.set(0, 0, 0);
    return res;
  }

  resetDps() {
    this.hits = [];
    this.peakDps = 0;
    this.totalDmg = 0;
  }

  getDpsStats(nowSec = performance.now() / 1000) {
    const cutoff = nowSec - 5.0;
    while (this.hits.length && this.hits[0].t < cutoff) this.hits.shift();
    if (!this.hits.length) return { dps: 0, peak: Math.round(this.peakDps), total: Math.round(this.totalDmg) };
    const sum = this.hits.reduce((s, h) => s + h.dmg, 0);
    const span = Math.max(1.0, Math.min(5.0, nowSec - this.hits[0].t + 0.25));
    const dps = sum / span;
    if (dps > this.peakDps) this.peakDps = dps;
    return { dps: Math.round(dps), peak: Math.round(this.peakDps), total: Math.round(this.totalDmg) };
  }

  update(dt, player, time) {
    this.updateStatus(dt);
    this.hp = this.maxHp;
    this.dead = false;
    this.dying = false;
    this.knock.set(0, 0, 0);
    if (this.wobble > 0.001) {
      this.wobble = Math.max(0, this.wobble - dt * 1.9);
      const ang = Math.sin(time * 28) * this.wobble;
      this.body.rotation.x = this.wobbleAxis.x * ang;
      this.body.rotation.z = this.wobbleAxis.z * ang;
    } else {
      this.body.rotation.x = 0;
      this.body.rotation.z = 0;
    }
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.applyTint(time);
    return false;
  }
}

export class SandboxManager {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.dummy = null;
  }

  start(player, loot, enemies) {
    this.clear();
    this.active = true;
    this.dummy = new TrainingDummy(this.scene, 0, -6);
    enemies.push(this.dummy);
    loot.removeAnvil();
    loot.spawnAnvil(7, -2);
    loot.anvilUses = 999;
    return this.dummy;
  }

  switchWeapon(player, type, element = 'fire', element2 = null) {
    const rarity = element2 ? 2 : element === 'none' ? 1 : 2;
    const w = makeWeapon(type, element, rarity, element2, []);
    const other = player.weapons[1 - player.slot];
    if (other) {
      player.weapons[player.slot] = w;
      player.equip(player.slot);
    } else {
      player.setWeapons([w], 0);
    }
    player.recalc();
    return w;
  }

  resetDps() {
    this.dummy?.resetDps();
  }

  getDpsStats() {
    return this.dummy ? this.dummy.getDpsStats() : { dps: 0, peak: 0, total: 0 };
  }

  clear() {
    if (this.dummy && !this.dummy.dead) {
      this.scene.remove(this.dummy.group);
      this.scene.remove(this.dummy.shadow);
    }
    this.dummy = null;
    this.active = false;
  }
}

// =========================================================================
// 2. THỦ THÀNH LÒ LỬA (FORGE DEFENSE — 10 ĐỢT · LÒ TRUNG TÂM + 4 BỆ TRỤ)
// =========================================================================
export const TURRET_TYPES = {
  fire: { id: 'fire', name: 'Trụ Hỏa Pháo', color: 0xff6a1a, css: '#ff7a30', cd: 1.05, dmg: [22, 34, 48], splash: 2.2, range: 12.5, desc: 'Bắn đạn lửa nổ lan & thiêu đốt' },
  ice: { id: 'ice', name: 'Trụ Băng Tiễn', color: 0x7fdcff, css: '#7fdcff', cd: 0.72, dmg: [16, 25, 36], splash: 0, range: 13.5, desc: 'Bắn nhanh làm chậm & đóng băng' },
  lightning: { id: 'lightning', name: 'Trụ Lôi Tháp', color: 0xffe14a, css: '#ffe14a', cd: 0.88, dmg: [18, 28, 40], splash: 0, range: 13.0, desc: 'Phóng sét lan sang 2 quái gần kề' },
};
const TURRET_ORDER = ['fire', 'ice', 'lightning'];
export const TURRET_COSTS = [12, 18, 24]; // Xây Lv1, nâng Lv2, nâng Lv3
export const DEFENSE_MAX_WAVES = 10;

export class DefenseManager {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.won = false;
    this.coreHp = 1000;
    this.coreMaxHp = 1000;
    this.corePos = new THREE.Vector3(0, 0, 0);
    this.coreRadius = 1.9;
    this.coreGroup = null;
    this.coreCrystal = null;
    this.coreRing = null;
    this.pedestals = [];
    this.shots = [];
  }

  start() {
    this.clear();
    this.active = true;
    this.won = false;
    this.coreHp = this.coreMaxHp = 1000;
    this._buildCore();
    const spots = [[-7.5, -7.5, 'fire'], [7.5, -7.5, 'ice'], [-7.5, 7.5, 'lightning'], [7.5, 7.5, 'fire']];
    for (let i = 0; i < spots.length; i++) {
      this._buildPedestal(i, spots[i][0], spots[i][1], spots[i][2]);
    }
  }

  _buildCore() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 2.15, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 0.7, metalness: 0.45 }),
    );
    base.position.y = 0.35;
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.0, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: 0x553624, roughness: 0.5, metalness: 0.6, emissive: 0x551800, emissiveIntensity: 0.5 }),
    );
    basin.position.y = 0.95;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd870, emissive: 0xff6a10, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.4 }),
    );
    crystal.position.y = 2.15;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.08, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffb840, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.0;
    const glow = new THREE.PointLight(0xff8a2a, 4.5, 16, 1.5);
    glow.position.y = 2.6;
    g.add(base, basin, crystal, ring, glow);
    this.scene.add(g);
    this.coreGroup = g;
    this.coreCrystal = crystal;
    this.coreRing = ring;
  }

  _buildPedestal(id, x, z, defaultKind) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.22, 0.32, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a403a, roughness: 0.75, metalness: 0.4 }),
    );
    pad.position.y = 0.16;
    const outline = new THREE.Mesh(
      new THREE.RingGeometry(1.18, 1.32, 20),
      new THREE.MeshBasicMaterial({ color: 0xe2b86c, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.03;
    g.add(pad, outline);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.pedestals.push({
      id, pos: new THREE.Vector3(x, 0, z), group: g, outline,
      level: 0, kind: defaultKind, cd: 0, turretMesh: null, crystal: null,
    });
  }

  _refreshTurretVisual(p) {
    if (p.turretMesh) { p.group.remove(p.turretMesh); p.turretMesh = null; p.crystal = null; }
    if (p.level <= 0) return;
    const T = TURRET_TYPES[p.kind];
    const tg = new THREE.Group();
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36 + p.level * 0.05, 0.58, 1.15 + p.level * 0.22, 6),
      new THREE.MeshStandardMaterial({ color: 0x3b3532, metalness: 0.65, roughness: 0.35 }),
    );
    tower.position.y = 0.32 + (1.15 + p.level * 0.22) * 0.5;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32 + p.level * 0.07, 0),
      new THREE.MeshStandardMaterial({ color: T.color, emissive: T.color, emissiveIntensity: 1.5, roughness: 0.2 }),
    );
    crystal.position.y = 1.65 + p.level * 0.25;
    tg.add(tower, crystal);
    for (let k = 0; k < p.level; k++) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.48 - k * 0.04, 0.045, 6, 16),
        new THREE.MeshBasicMaterial({ color: T.color }),
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.7 + k * 0.32;
      tg.add(band);
    }
    p.group.add(tg);
    p.turretMesh = tg;
    p.crystal = crystal;
    p.outline.material.color.setHex(T.color);
    p.outline.material.opacity = 0.82;
  }

  nearestPedestal(pos, maxDist = 2.6) {
    if (!this.active) return null;
    let best = null, bd = maxDist;
    for (const p of this.pedestals) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  upgradeCost(p) {
    return p.level < 3 ? TURRET_COSTS[p.level] : 0;
  }

  buildOrUpgrade(p, getScrap, addScrap) {
    if (!p || p.level >= 3) return { ok: false, reason: 'max' };
    const cost = this.upgradeCost(p);
    if (getScrap() < cost) return { ok: false, reason: 'scrap', cost };
    addScrap(-cost);
    p.level++;
    this._refreshTurretVisual(p);
    const T = TURRET_TYPES[p.kind];
    spawnRing(this.scene, p.pos, 2.4, T.color, 0.45);
    flash(p.pos.clone().setY(1.8), T.color, 3, 0.22);
    play('hammer', { rate: 1.15 });
    play('forged', { vol: 0.55 });
    return { ok: true, level: p.level, turret: T };
  }

  cycleElement(p, getScrap, addScrap) {
    if (!p || p.level <= 0) return { ok: false, reason: 'empty' };
    const cost = 5;
    if (getScrap() < cost) return { ok: false, reason: 'scrap', cost };
    addScrap(-cost);
    const idx = (TURRET_ORDER.indexOf(p.kind) + 1) % TURRET_ORDER.length;
    p.kind = TURRET_ORDER[idx];
    this._refreshTurretVisual(p);
    const T = TURRET_TYPES[p.kind];
    spawnRing(this.scene, p.pos, 2.0, T.color, 0.35);
    play('uiConfirm');
    return { ok: true, turret: T };
  }

  targetFor(enemy, player) {
    if (!this.active) return player;
    const dp = player.dead ? Infinity : enemy.pos.distanceTo(player.pos);
    const dc = enemy.pos.distanceTo(this.corePos);
    if (dp < 6.5 && dp < dc * 0.9) return player;
    return { pos: this.corePos, radius: this.coreRadius, dead: this.coreHp <= 0, hurt: (dmg) => this.damageCore(dmg) };
  }

  damageCore(dmg) {
    if (!this.active || this.coreHp <= 0) return false;
    const d = Math.max(1, Math.round(dmg));
    this.coreHp = Math.max(0, this.coreHp - d);
    damageNumber(this.corePos.clone().setY(2.2), `-${d} Lò!`, 'player');
    burst(this.corePos.clone().setY(1.6), 0xff5a2a, 14, { speed: 7, size: 0.18 });
    addShake(0.35);
    play('hitHeavy', { at: this.corePos, rate: 0.75 });
    return true;
  }

  healCore(amount) {
    if (!this.active || this.coreHp <= 0) return;
    this.coreHp = Math.min(this.coreMaxHp, this.coreHp + Math.round(amount));
  }

  update(dt, enemies, player, time) {
    if (!this.active) return;
    // Hoạt ảnh Lò Trung Tâm
    if (this.coreCrystal) {
      this.coreCrystal.rotation.y += dt * 1.4;
      this.coreCrystal.position.y = 2.15 + Math.sin(time * 3.0) * 0.14;
      if (Math.random() < dt * 9) flame(this.corePos.clone().setY(1.8), { count: 1, size: 0.65, spread: 0.5 });
    }
    if (this.coreRing) this.coreRing.rotation.z -= dt * 1.2;

    // Quái áp sát Lò Lửa Trung Tâm gây sát thương định kỳ
    for (const e of enemies) {
      if (!e.alive || e.spawning || e.stunned) continue;
      e.coreHitCd = Math.max(0, (e.coreHitCd || 0) - dt);
      const d = Math.hypot(e.pos.x - this.corePos.x, e.pos.z - this.corePos.z);
      const reach = this.coreRadius + (e.radius || 0.6) + 0.45;
      if (d < reach && e.coreHitCd <= 0) {
        e.coreHitCd = e.isBoss ? 1.35 : 1.15;
        const baseDmg = e.isBoss ? 36 : e.elite ? 16 : 9;
        const dmg = Math.max(1, Math.round(baseDmg * (ctx.diff?.defenseCoreDmgMul ?? 1)));
        this.damageCore(dmg);
        const away = e.pos.clone().sub(this.corePos).setY(0).normalize();
        if (away.lengthSq() > 0.01) e.knock.addScaledVector(away, e.isBoss ? 2 : 5);
      }
    }

    // Trụ Pháo tự động ngắm bắn quái gần nhất
    for (const p of this.pedestals) {
      if (p.level <= 0) continue;
      if (p.crystal) {
        p.crystal.rotation.y += dt * (2.2 + p.level * 0.6);
        p.crystal.position.y = 1.65 + p.level * 0.25 + Math.sin(time * 4 + p.id) * 0.08;
      }
      p.cd -= dt;
      if (p.cd > 0) continue;
      const T = TURRET_TYPES[p.kind];
      const range = T.range + (p.level - 1) * 1.8;
      let target = null, bestScore = Infinity;
      for (const e of enemies) {
        if (!e.alive || e.spawning) continue;
        const distTurret = p.pos.distanceTo(e.pos);
        if (distTurret > range) continue;
        // Ưu tiên quái gần Lò Trung Tâm nhất!
        const distCore = e.pos.distanceTo(this.corePos);
        if (distCore < bestScore) { bestScore = distCore; target = e; }
      }
      if (!target) continue;
      p.cd = T.cd * (1 - (p.level - 1) * 0.08);
      const dmg = Math.round(T.dmg[p.level - 1] * (1 + (player?.stats?.dmg ? (player.stats.dmg - 1) * 0.35 : 0)));
      const origin = p.pos.clone().setY(1.8 + p.level * 0.25);
      const hitPos = target.pos.clone().setY(1.0);
      const prevTag = ctx.dmgTag;
      ctx.dmgTag = 'pet';
      try {
        const dir = target.pos.clone().sub(p.pos).setY(0).normalize();
        if (p.kind === 'lightning') {
          spawnBolt(this.scene, origin, hitPos, T.color);
          dealDamage(target, dmg, { element: 'lightning', element2: null }, dir, 3, false);
          play('zap', { at: p.pos, vol: 0.45, rate: 1.25 });
        } else if (p.kind === 'fire') {
          spawnBolt(this.scene, origin, hitPos, T.color);
          aoe(target.pos, T.splash + p.level * 0.3, dmg, { element: 'fire', element2: null }, 5, { surface: false });
          spawnRing(this.scene, target.pos, T.splash + p.level * 0.3, T.color, 0.28);
          play('ignite', { at: p.pos, vol: 0.45, rate: 1.15 });
        } else {
          spawnBolt(this.scene, origin, hitPos, T.color);
          dealDamage(target, dmg, { element: 'ice', element2: null }, dir, 3, false);
          emit(hitPos, { frame: F.sparkle, color: 0xc8f4ff, color2: 0x3090ff, size: 0.5, size2: 0.1, life: 0.3 });
          play('freeze', { at: p.pos, vol: 0.4, rate: 1.35 });
        }
      } finally {
        ctx.dmgTag = prevTag;
      }
    }
  }

  clear() {
    if (this.coreGroup) { this.scene.remove(this.coreGroup); this.coreGroup = null; }
    this.coreCrystal = null;
    this.coreRing = null;
    for (const p of this.pedestals) this.scene.remove(p.group);
    this.pedestals = [];
    this.shots = [];
    this.active = false;
    this.won = false;
  }
}
