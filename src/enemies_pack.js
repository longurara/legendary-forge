// Gói 14 quái mới mở rộng đội hình cho bản đồ 18x18:
// - 5 Quái Xương tinh nhuệ (KayKit): PyroMage, FrostGuard, Lancer (Thương 3D), Necromancer, Berserker
// - 9 Quái Vật 3D mới (CC0 Quaternius): OrcBrute, GoblinRaider, FireImp, FrostDrake, AcidGlub,
//   VenomSpider, GiantWasp, Viper, StoneCrab
import * as THREE from 'three';
import { collide, isBlocked } from './world.js';
import { burst, damageNumber, spawnRing, addShake, spawnTelegraph, smoke, flash, emit, F, flame, hitSpark } from './fx.js';
import { models, fitModel, Animator } from './models.js';
import { ctx, enemyShot, scheduleBomb, spawnFirePatch, spawnToxic } from './combat.js';
import { play } from './audio.js';
import { Enemy } from './enemies.js';
import { Walker, tintMats, hurtPlayer } from './enemies_new.js';
import { Minion } from './enemies_extra.js';

const inSector = (from, facing, target, range, arc) => {
  const dx = target.x - from.x, dz = target.z - from.z;
  if (Math.hypot(dx, dz) > range) return false;
  let diff = Math.atan2(dx, dz) - facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= arc / 2;
};

// ---------- Khung chung cho Quái Vật 3D Quaternius (mon_*.glb) ----------
export class Creature extends Enemy {
  buildCreature(modelName, size, opts = {}) {
    this.slimy = true; // quái vật tự nhiên (không phải xương)
    this.body = new THREE.Group();
    this.anim = null;
    this.facing = 0;
    this.hoverY = opts.hoverY || 0;
    this.bobAmp = opts.bobAmp ?? (this.hoverY > 0 ? 0.16 : 0);
    this.bobSpd = opts.bobSpd || 4.2;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.spawnDur = opts.spawnDur || 0.7;
    if (models[modelName]) {
      const fitted = fitModel(models[modelName], size, 'ground');
      this.body.add(fitted);
      this.anim = new Animator(fitted);
      if (opts.idleAnim) this.anim.play(opts.idleAnim, { fade: 0 });
    } else {
      const m = new THREE.Mesh(
        new THREE.CapsuleGeometry(size * 0.25, size * 0.45, 4, 10),
        new THREE.MeshStandardMaterial({ color: this.color || 0x80a080 }),
      );
      m.position.y = size * 0.5;
      this.body.add(m);
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
  }
  get radius() { return this._radius || 0.55; }
  get grounded() { return !this.spawning && this.hoverY <= 0.1 && (this.height || 0) < 0.5; }
  move(dirX, dirZ, speed, bdt) { this.pos.x += dirX * speed * bdt; this.pos.z += dirZ * speed * bdt; }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    let anim = null;
    if (this.spawning) {
      if (this.spawnT <= 0 && this.spawnT + dt > 0) play('mageSpawn', { at: this.pos, rate: 1.2 });
      this.spawnT += dt;
      const sc = Math.min(1, Math.max(0.05, this.spawnT / this.spawnDur));
      this.body.scale.setScalar(sc);
      if (this.spawnT >= this.spawnDur) { this.spawning = false; this.body.scale.setScalar(1); }
    } else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.001;
      anim = this.think(bdt, player, d, dx, dz, time);
    }
    if (this.anim) {
      if (anim) this.anim.play(anim.name || anim, anim.opts || {});
      this.anim.update(bdt);
    }
    if (this.knock.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 9));
    }
    collide(this.pos, this.radius);
    const yOff = (this.height || 0) + this.hoverY + (this.bobAmp ? Math.sin(time * this.bobSpd + this.bobPhase) * this.bobAmp : 0);
    this.group.position.set(this.pos.x, yOff, this.pos.z);
    this.group.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.shadow.scale.setScalar((this.shadowScale || 0.85) * Math.max(0.45, 1 - yOff * 0.08));
    this.applyTint(time);
    this.after?.(dt, time);
    return false;
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// =========================================================================
// PHẦN 1: 5 QUÁI XƯƠNG TINH NHUỆ (KayKit + Vũ khí mới)
// =========================================================================

// ---------- 1. Hỏa Sư: gọi thiên thạch & để lại vũng lửa trên sàn ----------
export class PyroMage extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 36; this.color = 0xff6a2a; this.mass = 0.9; this.contactDmg = 0; this.dropChance = 0.24; this.xp = 5;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this.state = 'move'; this.timer = 0; this.cd = 1.8 + Math.random() * 1.2;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.alt = 0; this.shadowScale = 0.85;
    this.build('enemy_mage', 2.05, [['weapon_staff', 'handslotr']]);
    tintMats(this, 0xff5a22, 0.55, 0xff3a00, 0.42);
  }
  think(bdt, player, d, dx, dz) {
    this.facing = Math.atan2(dx, dz);
    this.cd -= bdt;
    if (this.state === 'move') {
      const radial = d > 11.5 ? 1 : d < 7 ? -1 : 0;
      this.move((dx / d) * radial * 2.5 + (-dz / d) * this.strafe * 1.5, (dz / d) * radial * 2.5 + (dx / d) * this.strafe * 1.5, 1, bdt);
      if (this.cd <= 0 && d < 18 && !player.dead) {
        if (this.alt++ % 2 === 0) {
          this.state = 'meteor'; this.timer = 0.95;
          this.teleKind = 'interrupt';
          this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 2.2, duration: 0.95, kind: 'interrupt' });
          play('mageCast', { at: this.pos, rate: 0.85 });
          if (this.anim) this.anim.play('Spellcast_Raise', { once: true, fade: 0.1 });
        } else {
          this.state = 'volley'; this.timer = 0.6;
          this.teleKind = 'interrupt';
          play('mageCast', { at: this.pos, rate: 1.2 });
          if (this.anim) this.anim.play('Spellcast_Shoot', { once: true, fade: 0.1 });
        }
        return null;
      }
      return { name: 'Walking_D_Skeletons', opts: { speed: 1.2 } };
    }
    if (this.state === 'meteor') {
      this.timer -= bdt;
      if (Math.random() < 0.5) flame(this.pos.clone().setY(1.6), { count: 1, size: 0.5, spread: 0.3 });
      if (this.timer <= 0) {
        this.teleKind = null;
        const count = (ctx.floor || 1) >= 2 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const scatter = this.blindT > 0 ? 7.5 : 3.2;
          const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * scatter * 2, 0, (Math.random() - 0.5) * scatter * 2));
          scheduleBomb(at, 0.9 + i * 0.2, 2.0, 0, 14, 0xff5a1a);
          spawnFirePatch(at, 1.6, 3.8, 12, true);
        }
        this.state = 'move'; this.cd = 3.2 + Math.random() * 1.2; this.strafe *= -1;
      }
      return null;
    }
    if (this.state === 'volley') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        const base = this.facing + (this.blindT > 0 ? (Math.random() - 0.5) * 1.4 : 0);
        for (const off of [-0.24, 0, 0.24]) {
          const a = base + off;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          enemyShot(this.pos.clone().setY(1.25).addScaledVector(dir, 0.7), dir, 9, 'orb');
        }
        this.state = 'move'; this.cd = 2.4 + Math.random(); this.strafe *= -1;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'move'; this.cd = 2.0; }
    return 'Idle_Combat';
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- 2. Vệ Binh Băng: đấu sĩ hạng nặng, chém làm chậm & đập sóng băng ----------
export class FrostGuard extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 72; this.color = 0x7fdcff; this.mass = 2.0; this.contactDmg = 0; this.dropChance = 0.22; this.xp = 6;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'mageDie';
    this.poiseMax = 58;
    this.state = 'chase'; this.timer = 0; this.cd = 1.4 + Math.random() * 0.8; this.alt = 0;
    this.shadowScale = 1.05;
    this.build('enemy_minion', 2.3, [['weapon_greatsword', 'handslotr']]);
    tintMats(this, 0x6ec8ff, 0.58, 0x2080d0, 0.38);
  }
  get radius() { return 0.65; }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'chase') {
      this.facing = Math.atan2(dx, dz);
      if (d < 3.4 && this.cd <= 0 && !player.dead) {
        if (this.alt++ % 2 === 0) {
          this.state = 'cleave'; this.timer = 0.72;
          this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 3.5, arc: 2.3, facing: this.facing, duration: 0.72, color: 0x7fdcff });
          if (this.anim) this.anim.play('2H_Melee_Attack_Slice', { once: true, fade: 0.1, speed: 0.85 });
        } else {
          this.state = 'slam'; this.timer = 0.95;
          this.teleKind = 'interrupt';
          this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 4.3, duration: 0.95, kind: 'interrupt' });
          if (this.anim) this.anim.play('2H_Melee_Attack_Chop', { once: true, fade: 0.1, speed: 0.75 });
          play('freeze', { at: this.pos, rate: 0.7, vol: 0.5 });
        }
        return null;
      }
      if (d > 1.8) { this.move(dx / d, dz / d, 2.25, bdt); return { name: 'Walking_D_Skeletons', opts: { speed: 0.95 } }; }
      return 'Idle_Combat';
    }
    if (this.state === 'cleave') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        play('swing', { at: this.pos, rate: 0.65 });
        burst(this.pos.clone().setY(0.9), 0xaeeaff, 14, { speed: 6, size: 0.16 });
        if (!player.dead && inSector(this.pos, this.facing, player.pos, 3.5 + player.radius, 2.3)) {
          hurtPlayer(player, 16);
          player.slowT = Math.max(player.slowT, 2.5);
        }
        this.state = 'recover'; this.timer = 0.65;
      }
      return null;
    }
    if (this.state === 'slam') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        spawnRing(this.scene, this.pos, 4.3, 0x7fdcff, 0.5);
        burst(this.pos.clone().setY(0.4), 0xbfefff, 28, { speed: 9, size: 0.2 });
        addShake(0.4);
        play('freeze', { at: this.pos, rate: 0.85 });
        if (!player.dead && d < 4.3 + player.radius) {
          hurtPlayer(player, 18);
          player.slowT = Math.max(player.slowT, 3.2);
        }
        ctx.reactSurface?.(this.pos, 4.3, 'ice', null, 15);
        this.state = 'recover'; this.timer = 0.85;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'chase'; this.cd = 1.6 + Math.random(); }
    return 'Idle_Combat';
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- 3. Kỵ Binh Xương: cầm Thương 3D lao xuyên tầm xa (đòn Xuyên) ----------
export class Lancer extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 44; this.color = 0xe85a3a; this.mass = 1.25; this.contactDmg = 0; this.dropChance = 0.2; this.xp = 5;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'mageDie';
    this.poiseMax = 42;
    this.state = 'stalk'; this.timer = 0; this.cd = 1.2 + Math.random() * 1.1;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.shadowScale = 0.9;
    const spear = models.prop_spear ? ['prop_spear', 'handslotr', 0.24] : ['weapon_greatsword', 'handslotr', 1];
    this.build('enemy_rogue', 2.05, [spear]);
    tintMats(this, 0xd8422a, 0.52, 0x901810, 0.35);
  }
  get radius() { return 0.55; }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'stalk') {
      this.facing = Math.atan2(dx, dz);
      const radial = d > 11 ? 1 : d < 6 ? -0.6 : 0;
      this.move((dx / d) * radial * 3.8 + (-dz / d) * this.strafe * 2.6, (dz / d) * radial * 3.8 + (dx / d) * this.strafe * 2.6, 1, bdt);
      if (this.cd <= 0 && d < 13.5 && !player.dead) {
        this.state = 'aim'; this.timer = 0.68;
        this.teleKind = 'pierce';
        this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.5, length: 13.5, facing: this.facing, duration: 0.68, kind: 'pierce' });
        if (this.anim) this.anim.play('2H_Melee_Attack_Stab', { once: true, fade: 0.08, speed: 0.65 });
        return null;
      }
      return { name: 'Running_C', opts: { speed: 1.15 } };
    }
    if (this.state === 'aim') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.state = 'charge'; this.left = 13.5; this.hitDone = false; this.teleKind = 'pierce';
        play('dash', { at: this.pos, rate: 0.85 });
      }
      return null;
    }
    if (this.state === 'charge') {
      const step = 25 * bdt;
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      this.pos.x += fx * step; this.pos.z += fz * step;
      this.left -= step;
      if (Math.random() < 0.75) emit(this.pos.clone().setY(0.8), { frame: F.sparkle, color: 0xffc060, color2: 0xff3a20, size: 0.45, size2: 0.05, life: 0.25 });
      if (!this.hitDone && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.25) {
        this.hitDone = true;
        hurtPlayer(player, 17);
        player.pos.x += fx * 1.6; player.pos.z += fz * 1.6;
      }
      const before = this.pos.clone();
      collide(this.pos, this.radius);
      const hitWall = before.distanceTo(this.pos) > 0.02;
      if (this.left <= 0 || hitWall) {
        this.teleKind = null;
        if (hitWall) {
          addShake(0.25); play('hitHeavy', { at: this.pos, rate: 1.1 });
          burst(this.pos.clone().setY(0.9), 0xc8b89a, 12, { speed: 6, size: 0.16 });
          this.stunT = Math.max(this.stunT, 0.85);
        }
        this.state = 'recover'; this.timer = 0.75;
      }
      return { name: 'Running_C', opts: { speed: 1.9 } };
    }
    this.teleKind = null;
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'stalk'; this.cd = 2.0 + Math.random() * 1.2; this.strafe *= -1; }
    return 'Idle_Combat';
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- 4. Chiêu Hồn Sư: giữ tầm xa, triệu hồi lính xương & bắn đạn linh hồn ----------
export class Necromancer extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 44; this.color = 0x5ae88a; this.mass = 1.0; this.contactDmg = 0; this.dropChance = 0.28; this.xp = 7;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this.poiseMax = 45;
    this.state = 'move'; this.timer = 0; this.cd = 2.0 + Math.random(); this.summonCd = 2.8;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.minions = []; this.shadowScale = 0.9;
    this.build('enemy_mage', 2.15, [['weapon_staff', 'handslotr'], ['prop_spellbook', 'handslotl']]);
    tintMats(this, 0x2a6a44, 0.58, 0x3aff7a, 0.38);
    this.skullPivot = new THREE.Group();
    const sk = models['crypt/skull'];
    const orb = sk ? sk.scene.clone(true) : new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshStandardMaterial({ color: 0x9fffbf, emissive: 0x3aff7a, emissiveIntensity: 0.8 }));
    if (sk) orb.scale.setScalar(0.65);
    orb.position.set(1.0, 1.9, 0);
    this.skullPivot.add(orb);
    this.group.add(this.skullPivot);
  }
  think(bdt, player, d, dx, dz) {
    this.facing = Math.atan2(dx, dz);
    this.cd -= bdt;
    this.summonCd -= bdt;
    this.minions = this.minions.filter((m) => !m.dead);
    if (this.state === 'move') {
      const radial = d > 13.5 ? 1 : d < 8.5 ? -1 : 0;
      this.move((dx / d) * radial * 2.4 + (-dz / d) * this.strafe * 1.4, (dz / d) * radial * 2.4 + (dx / d) * this.strafe * 1.4, 1, bdt);
      if (this.summonCd <= 0 && this.minions.length < 3 && (ctx.enemies?.length || 0) < 48 && !player.dead) {
        this.state = 'summon'; this.timer = 1.15;
        this.teleKind = 'interrupt';
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.4, duration: 1.15, kind: 'interrupt' });
        play('mageCast', { at: this.pos, rate: 0.65 });
        if (this.anim) this.anim.play('Spellcast_Summon', { once: true, fade: 0.1 });
        return null;
      }
      if (this.cd <= 0 && d < 20 && !player.dead) {
        this.state = 'bolt'; this.timer = 0.6;
        this.teleKind = 'interrupt';
        play('mageCast', { at: this.pos, rate: 1.1 });
        if (this.anim) this.anim.play('Spellcast_Shoot', { once: true, fade: 0.1 });
        return null;
      }
      return { name: 'Walking_D_Skeletons', opts: { speed: 1.1 } };
    }
    if (this.state === 'summon') {
      this.timer -= bdt;
      if (Math.random() < 0.5) emit(this.pos.clone().setY(1.3), { frame: F.glow, color: 0x9fffbf, color2: 0x208a40, size: 0.45, size2: 0, life: 0.45, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3) });
      if (this.timer <= 0) {
        this.teleKind = null;
        spawnRing(this.scene, this.pos, 3.4, 0x3aff7a, 0.5);
        for (const side of [-1, 1]) {
          const sx = this.pos.x + Math.cos(this.facing) * side * 2.2;
          const sz = this.pos.z - Math.sin(this.facing) * side * 2.2;
          if (isBlocked(sx, sz, 0.6)) continue;
          const m = new Minion(this.scene, sx, sz);
          m.hp = Math.round(m.hp * 0.7); m.xp = 1; m.dropChance = 0.04; m.spawnT = 0.2;
          this.minions.push(m);
          ctx.spawnEnemy?.(m);
        }
        this.state = 'move'; this.summonCd = 7.5 + Math.random() * 2; this.cd = 1.5;
      }
      return null;
    }
    if (this.state === 'bolt') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        const base = this.facing + (this.blindT > 0 ? (Math.random() - 0.5) * 1.4 : 0);
        for (const off of [-0.12, 0.12]) {
          const a = base + off;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          enemyShot(this.pos.clone().setY(1.3).addScaledVector(dir, 0.7), dir, 10, 'orb');
        }
        this.state = 'move'; this.cd = 2.4 + Math.random(); this.strafe *= -1;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'move'; this.cd = 1.6; this.summonCd = Math.max(this.summonCd, 3.0); }
    return 'Idle_Combat';
  }
  after(dt) { if (this.skullPivot) this.skullPivot.rotation.y += dt * 3.2; }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- 5. Cuồng Chiến Xương: song rìu xoay cuồng phong ----------
export class Berserker extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 54; this.color = 0xe03030; this.mass = 1.35; this.contactDmg = 0; this.dropChance = 0.22; this.xp = 6;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'mageDie';
    this.poiseMax = 45;
    this.state = 'chase'; this.timer = 0; this.cd = 1.2 + Math.random(); this.spinTick = 0;
    this.shadowScale = 0.95;
    this.build('enemy_minion', 2.05, [['prop_skel_axe', 'handslotr'], ['prop_skel_axe', 'handslotl']]);
    tintMats(this, 0xc82424, 0.58, 0xff2210, 0.36);
  }
  get radius() { return 0.55; }
  get frenzied() { return this.hp < (this.maxHpEff || this.hp) * 0.55; }
  think(bdt, player, d, dx, dz) {
    const rageMul = this.frenzied ? 1.4 : 1;
    const fdt = bdt * rageMul;
    this.cd -= fdt;
    if (this.state === 'chase') {
      this.facing = Math.atan2(dx, dz);
      if (d < 4.2 && this.cd <= 0 && !player.dead) {
        this.state = 'wind'; this.timer = 0.52 / rageMul;
        this.teleKind = 'pierce';
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 2.5, duration: this.timer, kind: 'pierce' });
        if (this.anim) this.anim.play('Taunt', { once: true, fade: 0.08, speed: 1.8 });
        return null;
      }
      if (d > 1.4) { this.move(dx / d, dz / d, 3.7 * rageMul, bdt); return { name: 'Running_C', opts: { speed: 1.35 * rageMul } }; }
      return 'Idle_Combat';
    }
    if (this.state === 'wind') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.state = 'spin'; this.timer = 1.45; this.spinTick = 0; this.teleKind = 'pierce';
        play('swing', { at: this.pos, rate: 0.7 });
      }
      return null;
    }
    if (this.state === 'spin') {
      this.timer -= bdt;
      this.spinTick -= bdt;
      this.facing += bdt * 14 * rageMul;
      this.move(dx / d, dz / d, 4.3 * rageMul, bdt);
      if (Math.random() < 0.6) emit(this.pos.clone().setY(0.9), { frame: F.streak, color: 0xff6a4a, color2: 0xa01010, size: 0.7, size2: 0.1, life: 0.25, streak: true, vel: new THREE.Vector3(-Math.sin(this.facing) * 6, 0.5, -Math.cos(this.facing) * 6) });
      if (this.spinTick <= 0) {
        this.spinTick = 0.32;
        play('swing', { at: this.pos, rate: 1.2, vol: 0.45 });
        if (!player.dead && d < 2.35 + player.radius) hurtPlayer(player, 9);
      }
      if (this.timer <= 0) { this.teleKind = null; this.state = 'recover'; this.timer = 0.85; }
      return { name: '2H_Melee_Attack_Spin', opts: { speed: 1.6 * rageMul } };
    }
    this.teleKind = null;
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'chase'; this.cd = 1.8 + Math.random(); }
    return 'Idle_Combat';
  }
  after(dt) {
    if (this.frenzied && Math.random() < dt * 7) {
      emit(this.pos.clone().setY(1.3), { frame: F.glow, color: 0xff4a2a, color2: 0x800000, size: 0.35, size2: 0.05, life: 0.4, vel: new THREE.Vector3(0, 1.4, 0) });
    }
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// =========================================================================
// PHẦN 2: 9 QUÁI VẬT 3D MỚI (CC0 Quaternius Ultimate Monsters & Easy Enemies)
// =========================================================================

// ---------- 6. Chiến Binh Orc (mon_orc.glb): đấu sĩ khổng lồ vung chùy & đập đất ----------
export class OrcBrute extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 78; this.color = 0x5ea844; this.mass = 2.1; this.contactDmg = 0; this.dropChance = 0.24; this.xp = 7;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'bigLand';
    this.poiseMax = 62; this._radius = 0.72; this.shadowScale = 1.15;
    this.state = 'chase'; this.timer = 0; this.cd = 1.2 + Math.random(); this.alt = 0;
    this.buildCreature('mon_orc', 2.35, { idleAnim: 'Idle' });
  }
  onStagger() { if (this.state === 'chase' && this.anim) this.anim.play('HitReact', { once: true, fade: 0.05, speed: 1.4 }); }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'chase') {
      this.facing = Math.atan2(dx, dz);
      if (d < 3.4 && this.cd <= 0 && !player.dead) {
        if (this.alt++ % 2 === 0) {
          this.state = 'swing'; this.timer = 0.65;
          this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 3.4, arc: 2.2, facing: this.facing, duration: 0.65, color: 0xff9040 });
          if (this.anim) this.anim.play('Weapon', { once: true, fade: 0.08, speed: 0.9 });
        } else {
          this.state = 'smash'; this.timer = 0.9;
          this.teleKind = 'interrupt';
          this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 4.0, duration: 0.9, kind: 'interrupt' });
          if (this.anim) this.anim.play('Punch', { once: true, fade: 0.08, speed: 0.75 });
        }
        return null;
      }
      if (d > 1.8) { this.move(dx / d, dz / d, 2.75, bdt); return { name: 'Run', opts: { speed: 1.0 } }; }
      return 'Idle';
    }
    if (this.state === 'swing') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        play('hitHeavy', { at: this.pos, rate: 0.85 });
        if (!player.dead && inSector(this.pos, this.facing, player.pos, 3.4 + player.radius, 2.2)) hurtPlayer(player, 18);
        this.state = 'recover'; this.timer = 0.65;
      }
      return null;
    }
    if (this.state === 'smash') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        spawnRing(this.scene, this.pos, 4.0, 0xff9a40, 0.45);
        burst(this.pos.clone().setY(0.3), 0x8a7a5a, 24, { speed: 9, size: 0.2 });
        addShake(0.45); play('explode', { at: this.pos, rate: 0.8, vol: 0.7 });
        if (!player.dead && d < 4.0 + player.radius) hurtPlayer(player, 20);
        this.state = 'recover'; this.timer = 0.85;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'chase'; this.cd = 1.4 + Math.random(); }
    return 'Idle';
  }
}

// ---------- 7. Yêu Tinh Đạo Tặc (mon_goblin.glb): đánh bầy nhanh nhẹn, nhảy cắn ----------
export class GoblinRaider extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 26; this.color = 0x76c84a; this.mass = 0.75; this.contactDmg = 0; this.dropChance = 0.14; this.xp = 3;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this._radius = 0.45; this.shadowScale = 0.7;
    this.state = 'chase'; this.timer = 0; this.cd = 0.6 + Math.random() * 0.8;
    this.flankA = Math.random() * Math.PI * 2;
    this.buildCreature('mon_goblin', 1.35, { idleAnim: 'Idle', spawnDur: 0.55 });
  }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'chase') {
      this.facing = Math.atan2(dx, dz);
      if (d < 3.6 && this.cd <= 0 && !player.dead) {
        this.state = 'leap'; this.timer = 0.42; this.hitDone = false;
        this.lungeDir = new THREE.Vector3(dx / d, 0, dz / d);
        this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.0, length: 3.6, facing: this.facing, duration: 0.42, color: 0x90e84a });
        if (this.anim) this.anim.play('Jump', { once: true, fade: 0.05, speed: 1.4 });
        return null;
      }
      let tx = dx, tz = dz;
      if (d > 3.5) { tx = player.pos.x + Math.cos(this.flankA) * 2.5 - this.pos.x; tz = player.pos.z + Math.sin(this.flankA) * 2.5 - this.pos.z; }
      const td = Math.hypot(tx, tz) || 1;
      this.move(tx / td, tz / td, 4.6, bdt);
      return { name: 'Walk', opts: { speed: 1.8 } };
    }
    if (this.state === 'leap') {
      this.timer -= bdt;
      this.height = Math.sin(Math.max(0, this.timer / 0.42) * Math.PI) * 1.1;
      this.move(this.lungeDir.x, this.lungeDir.z, 8.8, bdt);
      if (!this.hitDone && !player.dead && d < 1.3) {
        this.hitDone = true;
        if (this.anim) this.anim.play('Bite_Front', { once: true, fade: 0.04, speed: 1.5 });
        hurtPlayer(player, 11);
        play('swing', { at: this.pos, rate: 1.5 });
      }
      if (this.timer <= 0) { this.height = 0; this.state = 'recover'; this.timer = 0.45; }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'chase'; this.cd = 1.1 + Math.random() * 0.7; this.flankA += 1.2; }
    return 'Idle';
  }
}

// ---------- 8. Tiểu Quỷ Lửa (mon_imp.glb): ác quỷ bay bắn cầu lửa & đốt mặt sàn ----------
export class FireImp extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 32; this.color = 0xff4a2a; this.mass = 0.8; this.contactDmg = 0; this.dropChance = 0.2; this.xp = 4;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this._radius = 0.5; this.shadowScale = 0.72;
    this.state = 'fly'; this.timer = 0; this.cd = 1.6 + Math.random() * 1.2;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.buildCreature('mon_imp', 1.65, { hoverY: 0.75, idleAnim: 'Flying_Idle' });
  }
  think(bdt, player, d, dx, dz) {
    this.facing = Math.atan2(dx, dz);
    this.cd -= bdt;
    if (this.state === 'fly') {
      const radial = d > 10 ? 1 : d < 6 ? -1 : 0;
      this.move((dx / d) * radial * 3.8 + (-dz / d) * this.strafe * 2.5, (dz / d) * radial * 3.8 + (dx / d) * this.strafe * 2.5, 1, bdt);
      if (this.cd <= 0 && d < 16 && !player.dead) {
        this.state = 'cast'; this.timer = 0.58;
        this.teleKind = 'interrupt';
        play('ignite', { at: this.pos, rate: 1.4, vol: 0.5 });
        if (this.anim) this.anim.play('Headbutt', { once: true, fade: 0.08, speed: 1.2 });
        return null;
      }
      return { name: d > 9 ? 'Fast_Flying' : 'Flying_Idle', opts: { speed: 1.2 } };
    }
    if (this.state === 'cast') {
      this.timer -= bdt;
      if (Math.random() < 0.5) flame(this.pos.clone().setY(1.3), { count: 1, size: 0.45, spread: 0.25 });
      if (this.timer <= 0) {
        this.teleKind = null;
        const ang = this.facing + (this.blindT > 0 ? (Math.random() - 0.5) * 1.4 : 0);
        const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
        enemyShot(this.pos.clone().setY(1.25).addScaledVector(dir, 0.7), dir, 10, 'orb');
        if (Math.random() < 0.55) spawnFirePatch(player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)), 1.35, 3.2, 10, true);
        this.state = 'fly'; this.cd = 2.0 + Math.random(); this.strafe *= -1;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'fly'; this.cd = 1.5; }
    return 'Flying_Idle';
  }
}

// ---------- 9. Ấu Long Băng (mon_drake.glb): rồng con bay phóng mảnh băng & sà cánh ----------
export class FrostDrake extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 46; this.color = 0x7fdcff; this.mass = 1.1; this.contactDmg = 0; this.dropChance = 0.22; this.xp = 6;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this._radius = 0.6; this.shadowScale = 0.85;
    this.state = 'fly'; this.timer = 0; this.cd = 1.6 + Math.random(); this.alt = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.buildCreature('mon_drake', 1.85, { hoverY: 0.85, idleAnim: 'Flying_Idle' });
    tintMats(this, 0x7fdcff, 0.48, 0x2080d0, 0.3);
  }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'fly') {
      this.facing = Math.atan2(dx, dz);
      const radial = d > 11 ? 1 : d < 6.5 ? -0.7 : 0;
      this.move((dx / d) * radial * 3.6 + (-dz / d) * this.strafe * 2.4, (dz / d) * radial * 3.6 + (dx / d) * this.strafe * 2.4, 1, bdt);
      if (this.cd <= 0 && d < 15 && !player.dead) {
        if (this.alt++ % 2 === 0) {
          this.state = 'spit'; this.timer = 0.65; this.teleKind = 'interrupt';
          if (this.anim) this.anim.play('Headbutt', { once: true, fade: 0.08 });
          play('freeze', { at: this.pos, rate: 1.2, vol: 0.5 });
        } else {
          this.state = 'swoopAim'; this.timer = 0.6; this.teleKind = 'pierce';
          this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.5, length: 11, facing: this.facing, duration: 0.6, kind: 'pierce' });
        }
        return null;
      }
      return 'Flying_Idle';
    }
    if (this.state === 'spit') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        const base = this.facing + (this.blindT > 0 ? (Math.random() - 0.5) * 1.4 : 0);
        for (const off of [-0.18, 0.18]) {
          const a = base + off;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          enemyShot(this.pos.clone().setY(1.3).addScaledVector(dir, 0.7), dir, 10, 'orb');
        }
        this.state = 'fly'; this.cd = 2.2 + Math.random(); this.strafe *= -1;
      }
      return null;
    }
    if (this.state === 'swoopAim') {
      this.timer -= bdt;
      if (this.timer <= 0) { this.state = 'swoop'; this.left = 11; this.hitDone = false; play('dash', { at: this.pos, rate: 1.1 }); }
      return null;
    }
    if (this.state === 'swoop') {
      const step = 21 * bdt;
      this.move(Math.sin(this.facing), Math.cos(this.facing), 21, bdt);
      this.left -= step;
      if (!this.hitDone && !player.dead && d < 1.35) {
        this.hitDone = true; hurtPlayer(player, 15); player.slowT = Math.max(player.slowT, 2.2);
      }
      const before = this.pos.clone(); collide(this.pos, this.radius);
      if (this.left <= 0 || before.distanceTo(this.pos) > 0.02) { this.teleKind = null; this.state = 'recover'; this.timer = 0.7; }
      return { name: 'Fast_Flying', opts: { speed: 1.6 } };
    }
    this.teleKind = null;
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'fly'; this.cd = 1.8 + Math.random(); }
    return 'Flying_Idle';
  }
}

// ---------- 10. Quái Axit Đầm Lầy (mon_glub.glb): thả vũng độc diện rộng ----------
export class AcidGlub extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 40; this.color = 0x70e84a; this.mass = 1.0; this.contactDmg = 0; this.dropChance = 0.18; this.xp = 5;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this._radius = 0.55; this.shadowScale = 0.85;
    this.state = 'float'; this.timer = 0; this.cd = 1.8 + Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.buildCreature('mon_glub', 1.65, { hoverY: 0.65, idleAnim: 'Flying_Idle' });
    tintMats(this, 0x62d83a, 0.45, 0x2a9010, 0.3);
  }
  think(bdt, player, d, dx, dz) {
    this.facing = Math.atan2(dx, dz);
    this.cd -= bdt;
    if (this.state === 'float') {
      const radial = d > 9.5 ? 1 : d < 5.5 ? -1 : 0;
      this.move((dx / d) * radial * 2.6 + (-dz / d) * this.strafe * 1.8, (dz / d) * radial * 2.6 + (dx / d) * this.strafe * 1.8, 1, bdt);
      if (this.cd <= 0 && d < 14 && !player.dead) {
        this.state = 'glob'; this.timer = 0.75; this.teleKind = 'interrupt';
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: player.pos.clone(), radius: 2.0, duration: 0.75, color: 0x6fd83a });
        this.targetPos = player.pos.clone();
        if (this.anim) this.anim.play('Punch', { once: true, fade: 0.08 });
        play('slimeLand', { at: this.pos, rate: 0.9 });
        return null;
      }
      return 'Flying_Idle';
    }
    if (this.state === 'glob') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        const at = this.targetPos || player.pos.clone();
        if (this.blindT > 0) at.add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
        spawnToxic(at, 1.9, 5.5);
        burst(at.clone().setY(0.3), 0x8fe83a, 14, { speed: 5, size: 0.16 });
        if (!player.dead && Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 2.0) hurtPlayer(player, 12);
        this.state = 'float'; this.cd = 2.8 + Math.random(); this.strafe *= -1;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'float'; this.cd = 1.8; }
    return 'Flying_Idle';
  }
}

// ---------- 11. Nhện Độc Hầm Ngục (mon_spider.glb): bò nhanh & nhảy vồ độc (đòn Xuyên) ----------
export class VenomSpider extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 34; this.color = 0x8a48c8; this.mass = 0.9; this.contactDmg = 0; this.dropChance = 0.16; this.xp = 4;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this._radius = 0.55; this.shadowScale = 0.85;
    this.state = 'stalk'; this.timer = 0; this.cd = 1.1 + Math.random() * 1.1;
    this.buildCreature('mon_spider', 1.15, { idleAnim: 'Spider_Idle' });
  }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'stalk') {
      this.facing = Math.atan2(dx, dz);
      if (d < 7.2 && this.cd <= 0 && !player.dead) {
        this.state = 'aim'; this.timer = 0.55;
        this.teleKind = 'pierce';
        this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.3, length: 7.5, facing: this.facing, duration: 0.55, kind: 'pierce' });
        if (this.anim) this.anim.play('Spider_Attack', { once: true, fade: 0.06, speed: 0.8 });
        return null;
      }
      this.move(dx / d, dz / d, 4.1, bdt);
      return { name: 'Spider_Walk', opts: { speed: 1.7 } };
    }
    if (this.state === 'aim') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.state = 'pounce'; this.timer = 0.42; this.hitDone = false; this.teleKind = 'pierce';
        if (this.anim) this.anim.play('Spider_Jump', { once: true, fade: 0.04, speed: 1.4 });
        play('dash', { at: this.pos, rate: 1.3 });
      }
      return null;
    }
    if (this.state === 'pounce') {
      this.timer -= bdt;
      this.height = Math.sin(Math.max(0, this.timer / 0.42) * Math.PI) * 1.5;
      this.move(Math.sin(this.facing), Math.cos(this.facing), 17.5, bdt);
      if (!this.hitDone && !player.dead && d < 1.3) {
        this.hitDone = true;
        hurtPlayer(player, 13);
        player.poisonT = Math.max(player.poisonT || 0, 3.0);
      }
      if (this.timer <= 0) {
        this.height = 0; this.teleKind = null;
        spawnToxic(this.pos.clone(), 1.4, 4.0);
        this.state = 'recover'; this.timer = 0.65;
      }
      return null;
    }
    this.teleKind = null;
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'stalk'; this.cd = 1.8 + Math.random(); }
    return 'Spider_Idle';
  }
}

// ---------- 12. Ong Độc Khổng Lồ (mon_wasp.glb): bay lượn chích thẳng (đòn Xuyên) ----------
export class GiantWasp extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 28; this.color = 0xffe04a; this.mass = 0.7; this.contactDmg = 0; this.dropChance = 0.18; this.xp = 4;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this._radius = 0.48; this.shadowScale = 0.65;
    this.state = 'buzz'; this.timer = 0; this.cd = 1.2 + Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.buildCreature('mon_wasp', 1.45, { hoverY: 0.85, bobAmp: 0.2, bobSpd: 7, idleAnim: 'Wasp_Flying' });
  }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'buzz') {
      this.facing = Math.atan2(dx, dz);
      const radial = d > 9.5 ? 1 : d < 5.5 ? -0.8 : 0;
      this.move((dx / d) * radial * 4.2 + (-dz / d) * this.strafe * 3.2, (dz / d) * radial * 4.2 + (dx / d) * this.strafe * 3.2, 1, bdt);
      if (this.cd <= 0 && d < 10.5 && !player.dead) {
        this.state = 'aim'; this.timer = 0.52; this.teleKind = 'pierce';
        this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.1, length: 10.5, facing: this.facing, duration: 0.52, kind: 'pierce' });
        if (this.anim) this.anim.play('Wasp_Attack', { once: true, fade: 0.05 });
        return null;
      }
      return { name: 'Wasp_Flying', opts: { speed: 1.4 } };
    }
    if (this.state === 'aim') {
      this.timer -= bdt;
      if (this.timer <= 0) { this.state = 'sting'; this.left = 10.5; this.hitDone = false; play('dash', { at: this.pos, rate: 1.6 }); }
      return null;
    }
    if (this.state === 'sting') {
      const step = 24 * bdt;
      this.move(Math.sin(this.facing), Math.cos(this.facing), 24, bdt);
      this.left -= step;
      if (!this.hitDone && !player.dead && d < 1.15) {
        this.hitDone = true; hurtPlayer(player, 14); player.poisonT = Math.max(player.poisonT || 0, 3.2);
      }
      const before = this.pos.clone(); collide(this.pos, this.radius);
      if (this.left <= 0 || before.distanceTo(this.pos) > 0.02) { this.teleKind = null; this.state = 'recover'; this.timer = 0.55; }
      return { name: 'Wasp_Flying', opts: { speed: 2.2 } };
    }
    this.teleKind = null;
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'buzz'; this.cd = 1.6 + Math.random(); this.strafe *= -1; }
    return 'Wasp_Flying';
  }
}

// ---------- 13. Mãng Xà Độc (mon_snake.glb): phun độc 3 tia & để lại vũng độc ----------
export class Viper extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 36; this.color = 0x4ad860; this.mass = 0.85; this.contactDmg = 0; this.dropChance = 0.18; this.xp = 4;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this._radius = 0.5; this.shadowScale = 0.78;
    this.state = 'slither'; this.timer = 0; this.cd = 1.5 + Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.buildCreature('mon_snake', 1.25, { idleAnim: 'Snake_Idle' });
  }
  think(bdt, player, d, dx, dz) {
    this.facing = Math.atan2(dx, dz);
    this.cd -= bdt;
    if (this.state === 'slither') {
      const radial = d > 9.5 ? 1 : d < 5.5 ? -1 : 0;
      this.move((dx / d) * radial * 3.1 + (-dz / d) * this.strafe * 2.1, (dz / d) * radial * 3.1 + (dx / d) * this.strafe * 2.1, 1, bdt);
      if (this.cd <= 0 && d < 14 && !player.dead) {
        this.state = 'spit'; this.timer = 0.65; this.teleKind = 'interrupt';
        this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 6, arc: 0.8, facing: this.facing, duration: 0.65, kind: 'interrupt' });
        if (this.anim) this.anim.play('Snake_Attack', { once: true, fade: 0.08 });
        play('ignite', { at: this.pos, rate: 1.5, vol: 0.4 });
        return null;
      }
      return { name: 'Snake_Walk', opts: { speed: 1.4 } };
    }
    if (this.state === 'spit') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        const base = this.facing + (this.blindT > 0 ? (Math.random() - 0.5) * 1.4 : 0);
        for (const off of [-0.22, 0, 0.22]) {
          const a = base + off;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          enemyShot(this.pos.clone().setY(0.85).addScaledVector(dir, 0.6), dir, 9, 'orb');
        }
        spawnToxic(this.pos.clone().add(new THREE.Vector3(Math.sin(base) * 3, 0, Math.cos(base) * 3)), 1.4, 4.5);
        this.state = 'slither'; this.cd = 2.4 + Math.random(); this.strafe *= -1;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'slither'; this.cd = 1.6; }
    return 'Snake_Idle';
  }
}

// ---------- 14. Cự Giải Thiết Giáp (mon_crab.glb): mai giáp cứng mặt trước, kẹp càng ----------
export class StoneCrab extends Creature {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 68; this.color = 0xd86a4a; this.mass = 1.9; this.contactDmg = 0; this.dropChance = 0.22; this.xp = 6;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'bigLand';
    this.poiseMax = 55; this._radius = 0.65; this.shadowScale = 1.0;
    this.state = 'scuttle'; this.timer = 0; this.cd = 1.4 + Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.buildCreature('mon_crab', 1.4, { idleAnim: 'Idle' });
  }
  takeHit(dmg, dir, kb, crit, kind) {
    // Mai cứng giảm 55% sát thương đánh từ chính diện (trừ chí mạng / đốt / độc / đang choáng)
    if (dir && !crit && this.stunT <= 0 && !this.spawning && kind !== 'burn' && kind !== 'poison') {
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      if (-(dir.x * fx + dir.z * fz) > 0.4) {
        hitSpark(this.pos.clone().setY(0.8), 0xffe0a0, false);
        play('hammer', { at: this.pos, rate: 1.5, vol: 0.45 });
        this.poise += dmg * 0.7;
        return super.takeHit(Math.max(1, Math.round(dmg * 0.45)), dir, kb * 0.35, false, kind);
      }
    }
    return super.takeHit(dmg, dir, kb, crit, kind);
  }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'scuttle') {
      const want = Math.atan2(dx, dz);
      let diff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      this.facing += Math.sign(diff) * Math.min(Math.abs(diff), 2.8 * bdt);
      if (d < 3.6 && this.cd <= 0 && !player.dead) {
        this.state = 'clamp'; this.timer = 0.58; this.teleKind = 'pierce';
        this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.8, length: 4.2, facing: this.facing, duration: 0.58, kind: 'pierce' });
        if (this.anim) this.anim.play('Bite_Front', { once: true, fade: 0.08, speed: 0.9 });
        return null;
      }
      this.move((dx / d) * 2.1 + (-dz / d) * this.strafe * 1.6, (dz / d) * 2.1 + (dx / d) * this.strafe * 1.6, 1, bdt);
      return { name: 'Walk', opts: { speed: 1.3 } };
    }
    if (this.state === 'clamp') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        this.move(fx, fz, 10, 0.25);
        play('hitHeavy', { at: this.pos, rate: 1.1 });
        if (!player.dead && inSector(this.pos, this.facing, player.pos, 3.6 + player.radius, 1.8)) {
          hurtPlayer(player, 16);
          player.pos.x += fx * 1.8; player.pos.z += fz * 1.8;
        }
        this.state = 'recover'; this.timer = 0.7; this.strafe *= -1;
      }
      return null;
    }
    this.teleKind = null;
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'scuttle'; this.cd = 1.8 + Math.random(); }
    return 'Idle';
  }
}
