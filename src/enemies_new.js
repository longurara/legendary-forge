// Quái mới: Pháp Sư Hồi Máu, Khiên Binh, Slime Bom, Bóng Ma + boss Chúa Tể Bóng Đêm
import * as THREE from 'three';
import { collide } from './world.js';
import { burst, damageNumber, spawnRing, addShake, spawnTelegraph, smoke, flash, emit, F, explosion, hitSpark } from './fx.js';
import { models, fitModel, Animator } from './models.js';
import { ctx, enemyShot, aoe } from './combat.js';
import { play } from './audio.js';
import { Enemy } from './enemies.js';

function attachProp(fitted, propName, bone = 'handslotr') {
  const hand = fitted.getObjectByName(bone);
  const entry = models[propName];
  if (!hand || !entry) return null;
  const m = entry.scene.clone(true);
  m.position.set(0, 0.0333, 0);
  m.rotation.set(0, bone === 'handslotr' ? Math.PI : 0, 0);
  m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  hand.add(m);
  return m;
}
const inSector = (from, facing, target, range, arc) => {
  const dx = target.x - from.x, dz = target.z - from.z;
  if (Math.hypot(dx, dz) > range) return false;
  let diff = Math.atan2(dx, dz) - facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= arc / 2;
};
const hurtPlayer = (player, dmg) => { if (player.hurt(dmg)) damageNumber(player.pos, dmg, 'player'); };

// Nhuộm màu vật liệu (sau setupMaterials)
function tintMats(e, color, amount, emissive = null, ei = 0) {
  const c = new THREE.Color(color);
  for (const m of e.mats) {
    if (m.color) m.color.lerp(c, amount);
    if (emissive != null && m.emissive) { m.emissive.set(emissive); m.emissiveIntensity = ei; m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = ei; }
  }
}

// ---------- Khung chung cho quái người (model KayKit có animation) ----------
class Walker extends Enemy {
  build(modelName, size, props = []) {
    this.body = new THREE.Group();
    this.anim = null;
    this.facing = 0;
    if (models[modelName]) {
      const fitted = fitModel(models[modelName], size, 'ground');
      this.body.add(fitted);
      for (const [p, bone] of props) attachProp(fitted, p, bone);
      this.anim = new Animator(fitted);
      this.anim.play('Spawn_Ground_Skeletons', { once: true, fade: 0 });
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
  }
  get radius() { return 0.5; }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    let anim = null;
    if (this.spawning) {
      if (this.spawnT <= 0 && this.spawnT + dt > 0) play('mageSpawn', { at: this.pos });
      this.spawnT += dt;
      if (this.spawnT >= 1) this.spawning = false;
    } else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.001;
      anim = this.think(bdt, player, d, dx, dz, time);
    }
    if (this.anim) { if (anim) this.anim.play(anim.name || anim, anim.opts || {}); this.anim.update(bdt); }
    if (this.knock.lengthSq() > 0.001) { this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.max(0, 1 - dt * 9)); }
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.shadow.scale.setScalar(this.shadowScale || 0.8);
    this.applyTint(time);
    this.after?.(dt, time);
    return false;
  }
  move(dirX, dirZ, speed, bdt) { this.pos.x += dirX * speed * bdt; this.pos.z += dirZ * speed * bdt; }
}

// ---------- Pháp Sư Hồi Máu: giữ khoảng cách, hồi máu cho quái xung quanh ----------
export class Healer extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 28; this.color = 0x7fe39a; this.mass = 0.9; this.contactDmg = 0; this.dropChance = 0.25; this.xp = 5;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this.healT = 2.5; this.strafe = Math.random() < 0.5 ? 1 : -1; this.casting = 0;
    this.build('enemy_mage', 2.0);
    tintMats(this, 0x6fe38a, 0.45, 0x1a8a3a, 0.25);
  }
  think(bdt, player, d, dx, dz) {
    this.facing = Math.atan2(dx, dz);
    if (this.casting > 0) {
      this.casting -= bdt;
      if (Math.random() < 0.5) emit(this.pos.clone().setY(1.5), { frame: F.cross, color: 0xbfffcf, color2: 0x3ad36a, size: 0.6, size2: 0, life: 0.5, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2) });
      if (this.casting <= 0) this.castHeal();
      return null;
    }
    const radial = d > 10 ? 1 : d < 7.5 ? -1 : 0;
    this.move((dx / d) * radial * 2.6 + (-dz / d) * this.strafe * 1.2, (dz / d) * radial * 2.6 + (dx / d) * this.strafe * 1.2, 1, bdt);
    this.healT -= bdt;
    const hurt = ctx.enemies.some((e) => e !== this && e.alive && !e.spawning && e.hp < (e.maxHpEff || e.maxHp || e.hp) * 0.9 && e.pos.distanceTo(this.pos) < 7.5);
    if (this.healT <= 0 && hurt) {
      this.casting = 0.8; this.healT = 4.5;
      spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 7.5, duration: 0.8, color: 0x3ad36a });
      play('mageCast', { at: this.pos, rate: 1.4 });
      if (this.anim) this.anim.play('Spellcast_Raise', { once: true, fade: 0.1 });
    }
    return { name: 'Walking_D_Skeletons', opts: { speed: 1.2 } };
  }
  castHeal() {
    spawnRing(this.scene, this.pos, 7.5, 0x3ad36a, 0.6);
    play('heal', { at: this.pos });
    for (const e of ctx.enemies) {
      if (!e.alive || e === this || e.pos.distanceTo(this.pos) > 7.5) continue;
      const max = e.maxHpEff || e.maxHp || e.hp;
      const amt = Math.round(max * (e.isBoss ? 0.06 : 0.3));
      e.hp = Math.min(max, e.hp + amt);
      damageNumber(e.pos, '+' + amt, 'heal');
      burst(e.pos.clone().setY(1), 0x6fe38a, 8, { speed: 3, size: 0.12, up: 3, gravity: -2 });
    }
  }
}

// ---------- Khiên Binh: chặn đòn phía trước, đập khiên hất văng ----------
export class ShieldBearer extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 60; this.color = 0xc8c0b0; this.mass = 1.6; this.contactDmg = 0; this.dropChance = 0.2; this.xp = 5;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'mageDie';
    this.state = 'chase'; this.timer = 0; this.cd = 1.5;
    this.poiseMax = 45;
    this.shadowScale = 0.95;
    this.build('enemy_minion', 2.05, [['prop_skel_blade', 'handslotr'], ['prop_skel_shield', 'handslotl']]);
  }
  get radius() { return 0.6; }
  takeHit(dmg, dir, kb, crit, kind) {
    // Bị đánh từ phía trước khi đang giơ khiên: giảm 80% sát thương
    if (dir && this.stunT <= 0 && !this.spawning && this.state !== 'bash') {
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      if (-(dir.x * fx + dir.z * fz) > 0.35) {
        hitSpark(this.pos.clone().set(this.pos.x + fx * 0.6, 1, this.pos.z + fz * 0.6), 0xbfd8ff, false);
        if (Math.random() < 0.4) damageNumber(this.pos, 'Chặn', 'burn');
        play('hammer', { at: this.pos, rate: 1.4, vol: 0.5 });
        this.poise += dmg * 0.6;                       // vẫn làm đầy thanh choáng để phá thủ
        return super.takeHit(Math.max(1, Math.round(dmg * 0.2)), dir, kb * 0.2, false, kind);
      }
    }
    return super.takeHit(dmg, dir, kb, crit, kind);
  }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'chase') {
      // Xoay chậm về phía người chơi (đánh vòng ra sau được)
      const want = Math.atan2(dx, dz);
      let diff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      this.facing += Math.sign(diff) * Math.min(Math.abs(diff), 2.2 * bdt);
      if (d < 2.6 && this.cd <= 0 && !player.dead) {
        this.state = 'wind'; this.timer = 0.6;
        this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2, length: 3, facing: this.facing, duration: 0.6 });
        if (this.anim) this.anim.play('Block_Attack', { once: true, fade: 0.1, speed: 0.8 });
        return null;
      }
      if (d > 1.6) { this.move(Math.sin(this.facing), Math.cos(this.facing), 2.3, bdt); return { name: 'Blocking', opts: {} }; }
      return 'Blocking';
    }
    if (this.state === 'wind') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.state = 'bash'; this.timer = 0.4;
        this.move(Math.sin(this.facing), Math.cos(this.facing), 6, 0.15);
        play('hitHeavy', { at: this.pos });
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        const rx = player.pos.x - this.pos.x, rz = player.pos.z - this.pos.z;
        const along = rx * fx + rz * fz, side = Math.abs(-rx * fz + rz * fx);
        if (!player.dead && along > -0.5 && along < 3.2 && side < 1.3) {
          hurtPlayer(player, 14);
          player.pos.x += fx * 2.2; player.pos.z += fz * 2.2;
        }
      }
      return null;
    }
    if (this.state === 'bash') {
      this.timer -= bdt;
      if (this.timer <= 0) { this.state = 'chase'; this.cd = 2 + Math.random(); }
      return 'Idle_Combat';
    }
    return null;
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- Slime Bom: lao tới, châm ngòi rồi nổ (nổ cả quái khác) ----------
export class Bomber extends Enemy {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 14; this.color = 0xff5a2a; this.mass = 0.7; this.contactDmg = 0; this.dropChance = 0.08; this.xp = 2;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this.fuse = -1; this.bob = Math.random() * 6;
    this.body = new THREE.Group();
    const m = models.slime_lava || models.slime;
    if (m) {
      const f = fitModel(m, 0.75, 'ground');
      this.body.add(f);
    } else this.body.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshStandardMaterial({ color: this.color })));
    this.group.add(this.body);
    this.setupMaterials(this.body);
    tintMats(this, 0x302020, 0.55, 0xff3a00, 0.6);
  }
  get radius() { return 0.4; }
  get grounded() { return false; }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    if (this.spawning) { this.spawnT += dt; if (this.spawnT >= 0.6) this.spawning = false; }
    else if (this.fuse >= 0) {
      this.fuse -= dt;                                   // ngòi cháy cả khi bị đóng băng
      this.flash = Math.sin(time * 40) > 0 ? 0.05 : 0;
      this.body.scale.setScalar(1 + (0.7 - this.fuse) * 0.6);
      if (Math.random() < 0.6) emit(this.pos.clone().setY(0.9), { frame: F.sparkle, color: 0xffe08a, color2: 0xff4a10, size: 0.5, size2: 0, life: 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3) });
      if (this.fuse <= 0) this.blow();
    } else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.001;
      this.pos.x += (dx / d) * 5.2 * bdt; this.pos.z += (dz / d) * 5.2 * bdt;
      this.bob += bdt * 14;
      if (Math.random() < 0.3) emit(this.pos.clone().setY(0.8), { frame: F.glow, color: 0xffa040, size: 0.3, size2: 0, life: 0.25 });
      if (d < 1.8 && !player.dead) this.light();
    }
    if (this.knock.lengthSq() > 0.001) { this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.max(0, 1 - dt * 9)); }
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, Math.abs(Math.sin(this.bob)) * 0.25, this.pos.z);
    this.group.rotation.y = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z); this.shadow.scale.setScalar(0.6);
    this.applyTint(time);
    return false;
  }
  light() {
    if (this.fuse >= 0) return;
    this.fuse = 0.7;
    this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 2.6, duration: 0.7 });
    play('ignite', { at: this.pos, rate: 1.4 });
  }
  takeHit(dmg, dir, kb, crit, kind) {
    const r = super.takeHit(dmg, dir, kb, crit, kind);
    return r;
  }
  kill() { if (!this.exploded) { this.blow(); } }
  blow() {
    if (this.exploded) return;
    this.exploded = true;
    if (this.tele) this.tele.done = true;
    explosion(this.pos, 2.6, 0xff5a1a, { smoke: true });
    addShake(0.35);
    play('explode', { at: this.pos, vol: 0.7 });
    const p = ctx.player;
    if (!p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 2.6 + p.radius) hurtPlayer(p, 18);
    aoe(this.pos, 2.6, 20, { element: 'fire', element2: null }, 10, { exclude: this });
    this.die();
  }
}

// ---------- Bóng Ma: gần như tàng hình khi ở xa, dịch chuyển ra sau lưng rồi chém ----------
export class Wraith extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 30; this.color = 0x9a8aff; this.mass = 0.8; this.contactDmg = 0; this.dropChance = 0.2; this.xp = 5;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this.state = 'stalk'; this.timer = 0; this.cd = 2 + Math.random() * 2; this.vis = 0.15; this.revealT = 0;
    this.build('enemy_rogue', 1.85, [['prop_skel_blade', 'handslotr']]);
    for (const m of this.mats) { m.transparent = true; m.opacity = 0.2; m.depthWrite = false; }
    tintMats(this, 0x6a5aff, 0.5, 0x3a2aaa, 0.4);
  }
  get radius() { return 0.45; }
  takeHit(dmg, dir, kb, crit, kind) { this.revealT = 1.5; return super.takeHit(dmg, dir, kb, crit, kind); }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'stalk') {
      this.facing = Math.atan2(dx, dz);
      if (d > 3) this.move(dx / d, dz / d, 3.4, bdt);
      if (this.cd <= 0 && !player.dead) {
        // Biến mất rồi hiện ra sau lưng người chơi
        this.state = 'vanish'; this.timer = 0.45;
        smoke(this.pos.clone().setY(0.8), { count: 6, color: 0x2a2040, size: 0.9, life: 0.8, alpha: 0.6 });
        play('dash', { at: this.pos, rate: 0.6 });
      }
      return { name: 'Walking_D_Skeletons', opts: { speed: 1.3 } };
    }
    if (this.state === 'vanish') {
      this.timer -= bdt;
      this.vis = 0;
      if (this.timer <= 0) {
        const back = player.aimDir ? player.aimDir() : new THREE.Vector3(0, 0, 1);
        this.pos.set(player.pos.x - back.x * 2.2, 0, player.pos.z - back.z * 2.2);
        collide(this.pos, this.radius);
        this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        smoke(this.pos.clone().setY(0.8), { count: 6, color: 0x2a2040, size: 0.9, life: 0.8, alpha: 0.6 });
        this.state = 'strike'; this.timer = 0.5; this.revealT = 1.2;
        this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 2.6, arc: 1.8, facing: this.facing, duration: 0.5, color: 0x9a5aff });
        if (this.anim) this.anim.play('1H_Melee_Attack_Slice_Diagonal', { once: true, fade: 0.05, speed: 0.9 });
      }
      return null;
    }
    if (this.state === 'strike') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        if (!player.dead && inSector(this.pos, this.facing, player.pos, 2.6 + player.radius, 1.8)) hurtPlayer(player, 15);
        play('swing', { at: this.pos, rate: 0.8 });
        this.state = 'stalk'; this.cd = 3 + Math.random() * 2;
      }
      return null;
    }
    return null;
  }
  after(dt) {
    this.revealT = Math.max(0, this.revealT - dt);
    const d = ctx.player ? this.pos.distanceTo(ctx.player.pos) : 99;
    const target = this.state === 'vanish' ? 0 : this.revealT > 0 || this.state === 'strike' || this.stunT > 0 || this.frozenT > 0 ? 0.9 : d < 3.5 ? 0.6 : 0.12;
    this.vis += (target - this.vis) * Math.min(1, dt * 6);
    for (const m of this.mats) m.opacity = this.vis;
    this.shadow.visible = this.vis > 0.3;
    if (this.label) this.label.style.opacity = this.vis;
  }
  die() { if (this.tele) this.tele.done = true; for (const m of this.mats) m.opacity = 1; super.die(); }
}

// ---------- Boss: Chúa Tể Bóng Đêm ----------
export class ShadowLord extends Walker {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true;
    this.name = 'Chúa Tể Bóng Đêm';
    this.maxHp = this.hp = 480 + (level - 1) * 280;
    this.poiseMax = 130 * level;
    this.color = 0x8a6aff; this.mass = 4; this.contactDmg = 8; this.dropChance = 0; this.xp = 45;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'mageDie';
    this.state = 'intro'; this.timer = 1.6; this.next = 0; this.shadowScale = 1.7;
    this.build('enemy_rogue', 3.4, [['prop_skel_blade', 'handslotr'], ['prop_skel_blade', 'handslotl']]);
    tintMats(this, 0x3a2a5a, 0.6, 0x5a2aff, 0.35);
    this.spawning = true; this.spawnT = -0.4;
  }
  get radius() { return 1.0; }
  get grounded() { return !this.spawning && this.state !== 'intro' && this.state !== 'vanish'; }
  onStagger() { this.knock.multiplyScalar(0.3); }
  think(bdt, player, d, dx, dz) {
    const fast = this.phase >= 1 ? 1.25 : 1;
    switch (this.state) {
      case 'intro':
        this.timer -= bdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = 1.2; }
        return 'Idle_Combat';
      case 'chase':
        this.facing = Math.atan2(dx, dz);
        this.timer -= bdt;
        if (d > 3) this.move(dx / d, dz / d, 3.6 * fast, bdt);
        if (this.timer <= 0 && !player.dead) this.choose(player, d);
        return d > 3 ? { name: 'Running_C', opts: { speed: 0.9 } } : 'Idle_Combat';
      case 'vanish':
        this.timer -= bdt;
        if (this.timer <= 0) {
          const back = player.aimDir();
          this.pos.set(player.pos.x - back.x * 3, 0, player.pos.z - back.z * 3);
          collide(this.pos, this.radius);
          this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
          this.group.visible = true;
          smoke(this.pos.clone().setY(1), { count: 10, color: 0x1a1030, size: 1.5, life: 1, alpha: 0.7 });
          flash(this.pos.clone().setY(1.5), 0x8a5aff, 3, 0.2);
          this.state = 'slashWind'; this.timer = 0.65 / fast;
          this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 4.2, arc: 2.4, facing: this.facing, duration: this.timer, color: 0xa040ff });
          if (this.anim) this.anim.play('2H_Melee_Attack_Spin', { once: true, fade: 0.05, speed: 0.8 });
        }
        return null;
      case 'slashWind':
        this.timer -= bdt;
        if (this.timer <= 0) {
          if (!player.dead && inSector(this.pos, this.facing, player.pos, 4.2 + player.radius, 2.4)) hurtPlayer(player, 26);
          play('swing', { at: this.pos, rate: 0.6 }); addShake(0.4);
          this.state = 'recover'; this.timer = 0.8;
        }
        return null;
      case 'fanWind':
        this.timer -= bdt;
        if (this.timer <= 0) {
          const n = this.phase >= 1 ? 11 : 7;
          for (let i = 0; i < n; i++) {
            const a = this.facing + (i - (n - 1) / 2) * 0.16;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            enemyShot(this.pos.clone().setY(1.6).addScaledVector(dir, 1), dir, 11, 'arrow');
          }
          play('swing', { at: this.pos, rate: 1.4 });
          if (this.anim) this.anim.play('Throw', { once: true, fade: 0.05 });
          this.fans = (this.fans || 0) + 1;
          if (this.fans < (this.phase >= 1 ? 3 : 2)) { this.state = 'fanAim'; this.timer = 0.35; }
          else { this.fans = 0; this.state = 'recover'; this.timer = 0.9; }
        }
        return null;
      case 'fanAim':
        this.timer -= bdt;
        this.facing = Math.atan2(dx, dz);
        if (this.timer <= 0) this.fanStart();
        return null;
      case 'dashAim':
        this.timer -= bdt;
        if (this.timer <= 0) { this.state = 'dash'; this.left = 13; this.hit = false; play('dash', { at: this.pos, rate: 0.7 }); }
        return null;
      case 'dash': {
        const step = 26 * bdt;
        this.move(Math.sin(this.facing), Math.cos(this.facing), 26, bdt);
        this.left -= step;
        emit(this.pos.clone().setY(1.4), { smoke: true, frame: F.puff, color: 0x2a1a40, size: 1.6, size2: 2.4, life: 0.5, alpha: 0.5 });
        if (!this.hit && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.7) { this.hit = true; hurtPlayer(player, 20); }
        const before = this.pos.clone(); collide(this.pos, this.radius);
        if (this.left <= 0 || before.distanceTo(this.pos) > 0.01) {
          this.dashes = (this.dashes || 0) + 1;
          if (this.dashes < (this.phase >= 1 ? 3 : 2)) { this.state = 'dashAim'; this.timer = 0.45; this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z); spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.2, length: 13, facing: this.facing, duration: 0.45, color: 0xa040ff }); }
          else { this.dashes = 0; this.state = 'recover'; this.timer = 1.0; }
        }
        return { name: 'Running_C', opts: { speed: 2 } };
      }
      case 'summon':
        this.timer -= bdt;
        if (this.timer <= 0) {
          for (const side of [-1, 1]) {
            const w = new Wraith(this.scene, this.pos.x + side * 3, this.pos.z);
            w.spawnT = 0.3;
            ctx.spawnEnemy?.(w);
          }
          this.state = 'recover'; this.timer = 0.6;
        }
        return null;
      case 'recover':
        this.timer -= bdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = this.phase >= 1 ? 0.6 : 1.2; }
        return 'Idle_Combat';
    }
    return null;
  }
  fanStart() {
    this.state = 'fanWind'; this.timer = 0.5;
    const n = this.phase >= 1 ? 11 : 7;
    for (let i = 0; i < n; i += 2) spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 0.3, length: 14, facing: this.facing + (i - (n - 1) / 2) * 0.16, duration: 0.5, color: 0xa040ff });
  }
  choose(player, d) {
    const wraiths = ctx.enemies.filter((e) => e instanceof Wraith && !e.dead).length;
    const opts = ['blink', 'fan', 'dash'];
    if (wraiths < 2) opts.push('summon');
    const pick = opts[this.next++ % opts.length];
    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (pick === 'blink') {
      this.state = 'vanish'; this.timer = 0.6;
      smoke(this.pos.clone().setY(1), { count: 10, color: 0x1a1030, size: 1.5, life: 1, alpha: 0.7 });
      this.group.visible = false;
      play('dash', { at: this.pos, rate: 0.5 });
    } else if (pick === 'fan') { this.fanStart(); if (this.anim) this.anim.play('Taunt', { once: true, fade: 0.1, speed: 1.5 }); }
    else if (pick === 'dash') {
      this.state = 'dashAim'; this.timer = 0.7;
      spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.2, length: 13, facing: this.facing, duration: 0.7, color: 0xa040ff });
    } else {
      this.state = 'summon'; this.timer = 1.0;
      if (this.anim) this.anim.play('Spellcast_Summon', { once: true, fade: 0.1 });
      play('mageCast', { at: this.pos, rate: 0.6 });
    }
  }
  die() { if (this.tele) this.tele.done = true; this.group.visible = true; super.die(); }
}
