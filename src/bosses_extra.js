// 6 Boss mới nâng tổng số lên 10 Boss độc đáo (mỗi Boss có Bộ Phận Phá Được + Lõi Boss riêng):
// 4. ForgeOgre (Chúa Quỷ Lò Rèn - mon_ogre.glb)
// 5. FrostDragon (Băng Long Vương - mon_dragon.glb)
// 6. EmberDragon (Hỏa Long Cổ Đại - mon_dragon.glb)
// 7. PlagueKing (Vua Nấm Dịch Hạch - mon_mushroom_king.glb)
// 8. FrostWarden (Băng Vương Giáp Sĩ - enemy_boss + Vương Miện Băng)
// 9. TwinReapers (Song Tử Tử Thần: Hỏa Ảnh & Lôi Ảnh - Dual-Boss cầm Lưỡi Hái 3D prop_scythe.glb)
import * as THREE from 'three';
import { collide, isBlocked } from './world.js';
import { burst, damageNumber, spawnRing, addShake, spawnTelegraph, smoke, flash, emit, F, explosion, flame, spawnBolt } from './fx.js';
import { models } from './models.js';
import { ctx, enemyShot, scheduleBomb, spawnFirePatch, spawnToxic, getToxics, removeToxic } from './combat.js';
import { damagePillars } from './hazards.js';
import { play } from './audio.js';
import { Walker, tintMats, hurtPlayer } from './enemies_new.js';
import { Creature, FireImp, FrostDrake, AcidGlub, VenomSpider, GoblinRaider, FrostGuard, StoneCrab } from './enemies_pack.js';

const inSector = (from, facing, target, range, arc) => {
  const dx = target.x - from.x, dz = target.z - from.z;
  if (Math.hypot(dx, dz) > range) return false;
  let diff = Math.atan2(dx, dz) - facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= arc / 2;
};

// Khoảng cách từ điểm P đến đoạn thẳng AB (cho Tia Liên Kết Song Sinh)
function distPointToSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const lenSq = abx * abx + abz * abz || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

// =========================================================================
// BOSS #4: CHÚA QUỶ LÒ RÈN (ForgeOgre — mon_ogre.glb)
// =========================================================================
export class ForgeOgre extends Creature {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true;
    this.name = 'Chúa Quỷ Lò Rèn';
    this.maxHp = this.hp = 560 + (level - 1) * 320;
    this.poiseMax = 160 * level;
    this.color = 0xff6a2a; this.mass = 6; this.contactDmg = 12; this.dropChance = 0; this.xp = 48;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'explode';
    this._radius = 1.25; this.shadowScale = 2.2;
    this.state = 'intro'; this.timer = 1.5; this.next = 0;
    this.buildCreature('mon_ogre', 4.3, { idleAnim: 'Idle', spawnDur: 0.7 });
    tintMats(this, 0x3a1c18, 0.55, 0xff4410, 0.35);
    // Lõi lò nung xoay sau lưng (bộ phận phá được)
    this.coreMesh = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.18, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff4a00, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.7 }),
    );
    const ember = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: 0xffe080 }));
    this.coreMesh.add(torus, ember);
    this.coreMesh.position.set(0, 2.35, -0.78);
    this.group.add(this.coreMesh);
    this.initBossParts([
      { id: 'core', name: 'Lõi Lò Quỷ', icon: 'x_fire-bowl', pct: 0.24, mesh: this.coreMesh, core: 'core_golem', cond: (i) => i.big || i.crit || i.back },
      { id: 'horns', name: 'Sừng Quỷ Thép', icon: 'x_horned-helm', pct: 0.25, mesh: null, core: null, cond: (i) => !i.back || this.stunT > 0 },
    ]);
  }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  onStagger() { this.knock.multiplyScalar(0.2); }
  takeHit(dmg, dir, kb, crit, kind) {
    if (this.isPartBroken('horns')) dmg = Math.round(dmg * 1.22);
    return super.takeHit(dmg, dir, kb, crit, kind);
  }
  think(bdt, player, d, dx, dz) {
    const fast = this.enraged ? 1.28 : 1;
    const fdt = bdt * fast;
    switch (this.state) {
      case 'intro':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = 1.2; }
        return 'Idle';
      case 'chase':
        this.facing = Math.atan2(dx, dz);
        this.timer -= fdt;
        if (d > 2.8) { this.move(dx / d, dz / d, 2.9 * fast, bdt); return { name: 'Walk', opts: { speed: 1.0 * fast } }; }
        if (this.timer <= 0 && !player.dead) this.choose(player, d);
        return 'Idle';
      case 'crossWind':
        this.timer -= fdt;
        if (Math.random() < 0.5) flame(this.pos.clone().setY(2.2), { count: 1, size: 0.8, spread: 0.6 });
        if (this.timer <= 0) {
          this.teleKind = null;
          const rings = this.isPartBroken('core') ? 2 : (this.enraged ? 4 : 3);
          const dirs = this.enraged ? 8 : 4;
          for (let k = 0; k < dirs; k++) {
            const a = this.facing + (k / dirs) * Math.PI * 2;
            for (let s = 1; s <= rings; s++) {
              const at = new THREE.Vector3(this.pos.x + Math.sin(a) * s * 3.8, 0, this.pos.z + Math.cos(a) * s * 3.8);
              if (isBlocked(at.x, at.z, 0.5)) break;
              scheduleBomb(at, 0.65 + s * 0.18, 2.2, 0, 18, 0xff5a1a);
              spawnFirePatch(at, 1.8, 4.2, 14, true);
            }
          }
          addShake(0.8); play('explode', { at: this.pos, rate: 0.7 });
          this.state = 'recover'; this.timer = 1.0;
        }
        return null;
      case 'pullWind':
        this.timer -= fdt;
        // Hút nhẹ người chơi về phía lò nung trước khi nổ!
        if (!player.dead && d < 12 && d > 2.2) {
          player.pos.x -= (dx / d) * 3.8 * bdt;
          player.pos.z -= (dz / d) * 3.8 * bdt;
          collide(player.pos, player.radius);
        }
        if (this.timer <= 0) {
          this.teleKind = null;
          const R = this.isPartBroken('core') ? 4.0 : 5.4;
          spawnRing(this.scene, this.pos, R, 0xff6a1a, 0.55);
          explosion(this.pos, R, 0xff5a1a, { smoke: true, scorch: true });
          addShake(0.95); play('explode', { at: this.pos, rate: 0.65 });
          if (!player.dead && d < R + player.radius) hurtPlayer(player, 26);
          spawnFirePatch(this.pos.clone(), R * 0.6, 4.5, 14, true);
          this.state = 'recover'; this.timer = 1.1;
        }
        return null;
      case 'chargeAim':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.state = 'charge'; this.left = 16; this.hitDone = false; this.teleKind = 'pierce';
          play('dash', { at: this.pos, rate: 0.55 });
        }
        return null;
      case 'charge': {
        const step = 20 * fdt;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        this.move(fx, fz, 20 * fast, bdt);
        this.left -= step;
        if (Math.random() < 0.35) spawnFirePatch(this.pos.clone(), 1.5, 3.2, 12, true);
        // Quỷ lao húc sập luôn cột đá trên đường đi!
        damagePillars(this.pos, 2.2, new THREE.Vector3(fx, 0, fz), true);
        if (!this.hitDone && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.95) {
          this.hitDone = true; hurtPlayer(player, 24);
          player.pos.x += fx * 2.2; player.pos.z += fz * 2.2;
        }
        const before = this.pos.clone(); collide(this.pos, this.radius);
        if (this.left <= 0 || before.distanceTo(this.pos) > 0.02) {
          this.teleKind = null;
          addShake(0.6); play('hitHeavy', { at: this.pos, rate: 0.65 });
          this.state = 'recover'; this.timer = 1.05;
        }
        return { name: 'Run2', opts: { speed: 1.5 } };
      }
      case 'summon':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.anchorHorde ? 3 : 2;
          for (let i = 0; i < cnt; i++) {
            const a = (i / cnt) * Math.PI * 2 + Math.random();
            const sx = this.pos.x + Math.cos(a) * 3.5, sz = this.pos.z + Math.sin(a) * 3.5;
            if (isBlocked(sx, sz, 0.7)) continue;
            const imp = new FireImp(this.scene, sx, sz);
            imp.spawnT = 0.2; ctx.spawnEnemy?.(imp);
          }
          this.state = 'recover'; this.timer = 0.7;
        }
        return null;
      case 'recover':
        this.teleKind = null;
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = this.enraged ? 0.65 : 1.15; }
        return 'Idle';
    }
    return 'Idle';
  }
  choose(player, d) {
    const imps = ctx.enemies.filter((e) => e instanceof FireImp && !e.dead).length;
    const opts = ['cross', 'charge', 'pull'];
    if (imps < 2) opts.push('summon');
    let pick = opts[this.next++ % opts.length];
    if (pick === 'pull' && d > 11) pick = 'charge';
    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const sp = this.enraged ? 1.28 : 1;
    if (pick === 'cross') {
      this.state = 'crossWind'; this.timer = 1.05; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 4.5, duration: 1.05 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Punch', { once: true, fade: 0.1, speed: 0.7 });
      play('ignite', { at: this.pos, rate: 0.7 });
    } else if (pick === 'pull') {
      this.state = 'pullWind'; this.timer = 1.25; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: this.isPartBroken('core') ? 4.0 : 5.4, duration: 1.25 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Weapon', { once: true, fade: 0.1, speed: 0.65 });
      play('anvil', { rate: 0.7 });
    } else if (pick === 'charge') {
      this.state = 'chargeAim'; this.timer = 0.78; this.teleKind = 'pierce';
      this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.6, length: 16, facing: this.facing, duration: 0.78 / sp, kind: 'pierce' });
      if (this.anim) this.anim.play('Wave', { once: true, fade: 0.1, speed: 1.4 });
    } else {
      this.state = 'summon'; this.timer = 1.0; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.2, duration: 1.0 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Yes', { once: true, fade: 0.1 });
      play('mageCast', { at: this.pos, rate: 0.6 });
    }
  }
  after(dt) { if (this.coreMesh?.visible) { this.coreMesh.rotation.z += dt * 2.8; this.coreMesh.rotation.y += dt * 1.4; } }
}

// =========================================================================
// BOSS #5: BĂNG LONG VƯƠNG (FrostDragon — mon_dragon.glb)
// =========================================================================
export class FrostDragon extends Creature {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true;
    this.name = 'Băng Long Vương';
    this.maxHp = this.hp = 540 + (level - 1) * 300;
    this.poiseMax = 145 * level;
    this.color = 0x7fdcff; this.mass = 5.5; this.contactDmg = 10; this.dropChance = 0; this.xp = 48;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'freeze';
    this._radius = 1.3; this.shadowScale = 2.4;
    this.state = 'intro'; this.timer = 1.5; this.next = 0;
    this.buildCreature('mon_dragon', 4.4, { hoverY: 0.9, bobAmp: 0.25, bobSpd: 3.2, idleAnim: 'Flying_Idle', spawnDur: 0.7 });
    tintMats(this, 0x7fdcff, 0.55, 0x2090e8, 0.38);
    // Sừng băng phát sáng trên đầu rồng (bộ phận phá được)
    this.crestGroup = new THREE.Group();
    const cMat = new THREE.MeshStandardMaterial({ color: 0xc8f4ff, emissive: 0x40c8ff, emissiveIntensity: 1.1, flatShading: true });
    for (const sx of [-0.55, 0, 0.55]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, sx === 0 ? 1.1 : 0.85, 5), cMat);
      sp.position.set(sx, 3.65, 0.6);
      sp.rotation.z = -sx * 0.4;
      this.crestGroup.add(sp);
    }
    this.group.add(this.crestGroup);
    this.initBossParts([
      { id: 'crest', name: 'Sừng Băng Long', icon: 'x_snowflake2', pct: 0.24, mesh: this.crestGroup, core: 'core_dragon_ice', cond: (i) => i.crit || i.big || i.clash },
    ]);
  }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  onStagger() { this.knock.multiplyScalar(0.2); }
  think(bdt, player, d, dx, dz) {
    const fast = this.enraged ? 1.28 : 1;
    const fdt = bdt * fast;
    switch (this.state) {
      case 'intro':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'hover'; this.timer = 1.1; }
        return 'Flying_Idle';
      case 'hover':
        this.facing = Math.atan2(dx, dz);
        this.timer -= fdt;
        if (d > 8) this.move(dx / d, dz / d, 4.2 * fast, bdt);
        else if (d < 4.5) this.move(-dx / d, -dz / d, 3.0 * fast, bdt);
        if (this.timer <= 0 && !player.dead) this.choose(player, d);
        return 'Flying_Idle';
      case 'breathWind':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const n = this.isPartBroken('crest') ? 5 : (this.enraged ? 11 : 7);
          for (let i = 0; i < n; i++) {
            const a = this.facing + (i - (n - 1) / 2) * 0.15;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            enemyShot(this.pos.clone().setY(1.8).addScaledVector(dir, 1.2), dir, 12, 'arrow');
          }
          if (!player.dead && inSector(this.pos, this.facing, player.pos, 10.5, 1.35)) {
            hurtPlayer(player, 20);
            player.slowT = Math.max(player.slowT, 3.2);
          }
          ctx.reactSurface?.(this.pos.clone().add(new THREE.Vector3(Math.sin(this.facing) * 5, 0, Math.cos(this.facing) * 5)), 5.5, 'ice', null, 18);
          play('freeze', { at: this.pos, rate: 0.7 });
          addShake(0.45);
          this.state = 'recover'; this.timer = 0.85;
        }
        return null;
      case 'swoopAim':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'swoop'; this.left = 18; this.hitDone = false; this.teleKind = 'pierce'; play('dash', { at: this.pos, rate: 0.65 }); }
        return null;
      case 'swoop': {
        const step = 26 * fdt;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        this.move(fx, fz, 26 * fast, bdt);
        this.left -= step;
        if (Math.random() < 0.7) emit(this.pos.clone().setY(1.6), { frame: F.sparkle, color: 0xc8f4ff, color2: 0x3090e0, size: 0.7, size2: 0.1, life: 0.35 });
        if (!this.hitDone && !player.dead && d < 2.0) {
          this.hitDone = true; hurtPlayer(player, 22); player.slowT = Math.max(player.slowT, 3.0);
        }
        const before = this.pos.clone(); collide(this.pos, this.radius);
        if (this.left <= 0 || before.distanceTo(this.pos) > 0.02) {
          this.teleKind = null;
          spawnRing(this.scene, this.pos, 4.2, 0x7fdcff, 0.45);
          this.state = 'recover'; this.timer = 0.9;
        }
        return { name: 'Fast_Flying', opts: { speed: 1.6 } };
      }
      case 'hail':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.isPartBroken('crest') ? 3 : (this.enraged ? 7 : 5);
          for (let i = 0; i < cnt; i++) {
            const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9));
            scheduleBomb(at, 0.9 + i * 0.18, 2.3, 0, 16, 0x7fdcff);
          }
          play('freeze', { at: this.pos, rate: 0.9 });
          this.state = 'recover'; this.timer = 0.8;
        }
        return null;
      case 'summon':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.anchorHorde ? 2 : 1;
          for (let i = 0; i < cnt; i++) {
            const sx = this.pos.x + (i ? 3.5 : -3.5), sz = this.pos.z + 2;
            if (isBlocked(sx, sz, 0.7)) continue;
            const dr = new FrostDrake(this.scene, sx, sz);
            dr.spawnT = 0.2; ctx.spawnEnemy?.(dr);
          }
          this.state = 'recover'; this.timer = 0.7;
        }
        return null;
      case 'recover':
        this.teleKind = null;
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'hover'; this.timer = this.enraged ? 0.65 : 1.1; }
        return 'Flying_Idle';
    }
    return 'Flying_Idle';
  }
  choose(player, d) {
    const drakes = ctx.enemies.filter((e) => e instanceof FrostDrake && !e.dead).length;
    const opts = ['breath', 'swoop', 'hail'];
    if (drakes < 2) opts.push('summon');
    const pick = opts[this.next++ % opts.length];
    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const sp = this.enraged ? 1.28 : 1;
    if (pick === 'breath') {
      this.state = 'breathWind'; this.timer = 0.9; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 10.5, arc: 1.35, facing: this.facing, duration: 0.9 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Headbutt', { once: true, fade: 0.1, speed: 0.8 });
    } else if (pick === 'swoop') {
      this.state = 'swoopAim'; this.timer = 0.72; this.teleKind = 'pierce';
      this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.5, length: 18, facing: this.facing, duration: 0.72 / sp, kind: 'pierce' });
    } else if (pick === 'hail') {
      this.state = 'hail'; this.timer = 0.85; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.5, duration: 0.85 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Punch', { once: true, fade: 0.1 });
    } else {
      this.state = 'summon'; this.timer = 1.0; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.2, duration: 1.0 / sp, kind: 'interrupt' });
      play('mageCast', { at: this.pos, rate: 0.7 });
    }
  }
}

// =========================================================================
// BOSS #6: HỎA LONG CỔ ĐẠI (EmberDragon — mon_dragon.glb phiên bản Lửa Cổ)
// =========================================================================
export class EmberDragon extends Creature {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true;
    this.name = 'Hỏa Long Cổ Đại';
    this.maxHp = this.hp = 550 + (level - 1) * 310;
    this.poiseMax = 150 * level;
    this.color = 0xff4a1a; this.mass = 5.5; this.contactDmg = 11; this.dropChance = 0; this.xp = 50;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'explode';
    this._radius = 1.3; this.shadowScale = 2.4;
    this.state = 'intro'; this.timer = 1.5; this.next = 0;
    this.buildCreature('mon_dragon', 4.6, { hoverY: 0.95, bobAmp: 0.25, bobSpd: 3.5, idleAnim: 'Flying_Idle', spawnDur: 0.7 });
    tintMats(this, 0xd82810, 0.68, 0xff5a00, 0.5);
    // Long Châu Lửa xoay quanh thân rồng (bộ phận phá được)
    this.haloGroup = new THREE.Group();
    const oMat = new THREE.MeshBasicMaterial({ color: 0xffd060 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), oMat);
      orb.position.set(Math.cos(a) * 1.9, 2.5, Math.sin(a) * 1.9);
      this.haloGroup.add(orb);
    }
    this.group.add(this.haloGroup);
    this.initBossParts([
      { id: 'halo', name: 'Long Châu Lửa', icon: 'x_meteor', pct: 0.24, mesh: this.haloGroup, core: 'core_dragon_fire', cond: (i) => i.crit || i.big },
    ]);
  }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  onStagger() { this.knock.multiplyScalar(0.2); }
  think(bdt, player, d, dx, dz) {
    const fast = this.enraged ? 1.3 : 1;
    const fdt = bdt * fast;
    switch (this.state) {
      case 'intro':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'hover'; this.timer = 1.1; }
        return 'Flying_Idle';
      case 'hover':
        this.facing = Math.atan2(dx, dz);
        this.timer -= fdt;
        if (d > 8.5) this.move(dx / d, dz / d, 4.3 * fast, bdt);
        if (this.timer <= 0 && !player.dead) this.choose(player, d);
        return 'Flying_Idle';
      case 'flamefan':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const n = this.enraged ? 11 : 7;
          for (let i = 0; i < n; i++) {
            const a = this.facing + (i - (n - 1) / 2) * 0.16;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            enemyShot(this.pos.clone().setY(1.8).addScaledVector(dir, 1.2), dir, 12, 'orb');
            if (i % 2 === 0) spawnFirePatch(this.pos.clone().addScaledVector(dir, 5.5), 1.6, 3.8, 12, true);
          }
          play('ignite', { at: this.pos, rate: 0.7 }); addShake(0.45);
          this.state = 'recover'; this.timer = 0.85;
        }
        return null;
      case 'meteor':
        this.timer -= fdt;
        if (Math.random() < 0.6) flame(this.pos.clone().setY(2.5), { count: 2, size: 0.8, spread: 0.8 });
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.isPartBroken('halo') ? 3 : (this.enraged ? 9 : 6);
          for (let i = 0; i < cnt; i++) {
            const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 11, 0, (Math.random() - 0.5) * 11));
            scheduleBomb(at, 0.85 + i * 0.16, 2.3, 0, 18, 0xff5a1a);
            spawnFirePatch(at, 1.6, 3.8, 12, true);
          }
          play('explode', { at: this.pos, rate: 0.75 });
          this.state = 'recover'; this.timer = 0.9;
        }
        return null;
      case 'rushAim':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'rush'; this.left = 18; this.hitDone = false; this.teleKind = 'pierce'; play('dash', { at: this.pos, rate: 0.6 }); }
        return null;
      case 'rush': {
        const step = 25 * fdt;
        this.move(Math.sin(this.facing), Math.cos(this.facing), 25 * fast, bdt);
        this.left -= step;
        if (Math.random() < 0.4) spawnFirePatch(this.pos.clone(), 1.5, 3.5, 12, true);
        if (!this.hitDone && !player.dead && d < 2.0) { this.hitDone = true; hurtPlayer(player, 24); }
        const before = this.pos.clone(); collide(this.pos, this.radius);
        if (this.left <= 0 || before.distanceTo(this.pos) > 0.02) {
          this.teleKind = null;
          explosion(this.pos, 3.8, 0xff5a1a, { smoke: true, scorch: true });
          this.state = 'recover'; this.timer = 0.9;
        }
        return { name: 'Fast_Flying', opts: { speed: 1.7 } };
      }
      case 'summon':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.anchorHorde ? 3 : 2;
          for (let i = 0; i < cnt; i++) {
            const a = (i / cnt) * Math.PI * 2;
            const sx = this.pos.x + Math.cos(a) * 3.5, sz = this.pos.z + Math.sin(a) * 3.5;
            if (isBlocked(sx, sz, 0.7)) continue;
            const m = i % 2 === 0 ? new FireImp(this.scene, sx, sz) : new GoblinRaider(this.scene, sx, sz);
            m.spawnT = 0.2; ctx.spawnEnemy?.(m);
          }
          this.state = 'recover'; this.timer = 0.7;
        }
        return null;
      case 'recover':
        this.teleKind = null;
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'hover'; this.timer = this.enraged ? 0.6 : 1.05; }
        return 'Flying_Idle';
    }
    return 'Flying_Idle';
  }
  choose(player) {
    const adds = ctx.enemies.filter((e) => (e instanceof FireImp || e instanceof GoblinRaider) && !e.dead).length;
    const opts = ['flamefan', 'rush', 'meteor'];
    if (adds < 2) opts.push('summon');
    const pick = opts[this.next++ % opts.length];
    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const sp = this.enraged ? 1.3 : 1;
    if (pick === 'flamefan') {
      this.state = 'flamefan'; this.timer = 0.85; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 9.5, arc: 1.6, facing: this.facing, duration: 0.85 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Headbutt', { once: true, fade: 0.1 });
    } else if (pick === 'meteor') {
      this.state = 'meteor'; this.timer = 1.0; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 4.0, duration: 1.0 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Punch', { once: true, fade: 0.1 });
    } else if (pick === 'rush') {
      this.state = 'rushAim'; this.timer = 0.72; this.teleKind = 'pierce';
      this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.6, length: 18, facing: this.facing, duration: 0.72 / sp, kind: 'pierce' });
    } else {
      this.state = 'summon'; this.timer = 1.0; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.2, duration: 1.0 / sp, kind: 'interrupt' });
    }
  }
  after(dt) { if (this.haloGroup?.visible) this.haloGroup.rotation.y += dt * 2.4; }
}

// =========================================================================
// BOSS #7: VUA NẤM DỊCH HẠCH (PlagueKing — mon_mushroom_king.glb)
// =========================================================================
export class PlagueKing extends Creature {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true;
    this.name = 'Vua Nấm Dịch Hạch';
    this.maxHp = this.hp = 520 + (level - 1) * 290;
    this.poiseMax = 140 * level;
    this.color = 0x70e84a; this.mass = 5.5; this.contactDmg = 10; this.dropChance = 0; this.xp = 48;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this._radius = 1.2; this.shadowScale = 2.1;
    this.state = 'intro'; this.timer = 1.5; this.next = 0;
    this.buildCreature('mon_mushroom_king', 4.1, { idleAnim: 'Idle', spawnDur: 0.7 });
    tintMats(this, 0x4ad840, 0.35, 0x208018, 0.3);
    // 3 Bình bào tử độc xoay quanh Vua Nấm (bộ phận phá được)
    this.sporeGroup = new THREE.Group();
    const sMat = new THREE.MeshStandardMaterial({ color: 0x9fff5a, emissive: 0x4ad820, emissiveIntensity: 0.9, roughness: 0.3 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const g = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), sMat);
      g.position.set(Math.cos(a) * 1.75, 2.3, Math.sin(a) * 1.75);
      this.sporeGroup.add(g);
    }
    this.group.add(this.sporeGroup);
    this.initBossParts([
      { id: 'spores', name: 'Bình Bào Tử Cổ', icon: 'x_poison-bottle', pct: 0.24, mesh: this.sporeGroup, core: 'core_plague' },
    ]);
  }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  onStagger() { this.knock.multiplyScalar(0.2); }
  think(bdt, player, d, dx, dz) {
    const fast = this.enraged ? 1.26 : 1;
    const fdt = bdt * fast;
    switch (this.state) {
      case 'intro':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = 1.1; }
        return 'Idle';
      case 'chase':
        this.facing = Math.atan2(dx, dz);
        this.timer -= fdt;
        if (d > 4.5) { this.move(dx / d, dz / d, 2.8 * fast, bdt); return { name: 'Walk', opts: { speed: 1.1 * fast } }; }
        if (this.timer <= 0 && !player.dead) this.choose(player, d);
        return 'Idle';
      case 'barrage':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.isPartBroken('spores') ? 3 : (this.enraged ? 7 : 5);
          for (let i = 0; i < cnt; i++) {
            const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 11, 0, (Math.random() - 0.5) * 11));
            if (isBlocked(at.x, at.z, 0.8)) continue;
            spawnToxic(at, 2.1, 8.5);
            burst(at.clone().setY(0.3), 0x8fe83a, 10, { speed: 4, size: 0.16 });
          }
          play('slimeLand', { at: this.pos, rate: 0.7 });
          this.state = 'recover'; this.timer = 0.8;
        }
        return null;
      case 'detonate':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          // Kích nổ mọi vũng độc hiện có trong phòng!
          const tox = getToxics();
          const dmg = this.isPartBroken('spores') ? 10 : 18;
          for (let i = tox.length - 1; i >= 0; i--) {
            const p = tox[i].pos.clone();
            const r = Math.max(2.6, tox[i].radius * 1.45);
            removeToxic(i);
            explosion(p, r, 0x8fe83a, { smoke: true, scorch: false, core: 0xe8ffb0 });
            if (!player.dead && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < r + player.radius) {
              hurtPlayer(player, dmg); player.poisonT = Math.max(player.poisonT || 0, 3.5);
            }
          }
          addShake(0.65); play('explode', { at: this.pos, rate: 0.8 });
          this.state = 'recover'; this.timer = 0.95;
        }
        return null;
      case 'leapWind':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.state = 'leap'; this.t = 0; this.dur = 0.95;
          this.from = this.pos.clone(); this.to = player.pos.clone();
          this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.to, radius: 4.2, duration: this.dur / fast, color: 0x70e84a });
          if (this.anim) this.anim.play('Jump', { once: true, fade: 0.05 });
          play('slimeLand', { at: this.pos, rate: 0.65 });
        }
        return null;
      case 'leap': {
        this.t += fdt / this.dur;
        const k = Math.min(1, this.t);
        this.pos.lerpVectors(this.from, this.to, k);
        this.height = Math.sin(k * Math.PI) * 5.8;
        if (k >= 1) {
          this.height = 0; this.teleKind = null;
          spawnRing(this.scene, this.pos, 4.2, 0x70e84a, 0.5);
          spawnToxic(this.pos.clone(), 2.8, 7.0);
          addShake(0.75); play('explode', { at: this.pos, rate: 0.75 });
          if (!player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 4.2 + player.radius) {
            hurtPlayer(player, 22); player.poisonT = Math.max(player.poisonT || 0, 3.5);
          }
          this.state = 'recover'; this.timer = 0.9;
        }
        return null;
      }
      case 'summon':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.anchorHorde ? 3 : 2;
          for (let i = 0; i < cnt; i++) {
            const a = (i / cnt) * Math.PI * 2;
            const sx = this.pos.x + Math.cos(a) * 3.2, sz = this.pos.z + Math.sin(a) * 3.2;
            if (isBlocked(sx, sz, 0.7)) continue;
            const m = i % 2 === 0 ? new VenomSpider(this.scene, sx, sz) : new AcidGlub(this.scene, sx, sz);
            m.spawnT = 0.2; ctx.spawnEnemy?.(m);
          }
          this.state = 'recover'; this.timer = 0.7;
        }
        return null;
      case 'recover':
        this.teleKind = null;
        this.height = 0;
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = this.enraged ? 0.6 : 1.1; }
        return 'Idle';
    }
    return 'Idle';
  }
  choose(player) {
    const adds = ctx.enemies.filter((e) => (e instanceof VenomSpider || e instanceof AcidGlub) && !e.dead).length;
    const tox = getToxics();
    const opts = ['barrage', 'leap'];
    if (tox.length >= 2) opts.push('detonate');
    if (adds < 2) opts.push('summon');
    const pick = opts[this.next++ % opts.length];
    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const sp = this.enraged ? 1.26 : 1;
    if (pick === 'barrage') {
      this.state = 'barrage'; this.timer = 0.75; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.4, duration: 0.75 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Weapon', { once: true, fade: 0.1 });
    } else if (pick === 'detonate') {
      this.state = 'detonate'; this.timer = 1.2; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 4.8, duration: 1.2 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Wave', { once: true, fade: 0.1 });
      play('mageCast', { at: this.pos, rate: 0.65 });
    } else if (pick === 'leap') {
      this.state = 'leapWind'; this.timer = 0.55; this.teleKind = 'pierce';
    } else {
      this.state = 'summon'; this.timer = 1.0; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.2, duration: 1.0 / sp, kind: 'interrupt' });
    }
  }
  after(dt) { if (this.sporeGroup?.visible) this.sporeGroup.rotation.y += dt * 2.2; }
}

// =========================================================================
// BOSS #8: BĂNG VƯƠNG GIÁP SĨ (FrostWarden — Giáp sĩ Băng + Vương Miện Pha Lê)
// =========================================================================
export class FrostWarden extends Walker {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true;
    this.name = 'Băng Vương Giáp Sĩ';
    this.maxHp = this.hp = 530 + (level - 1) * 290;
    this.poiseMax = 145 * level;
    this.color = 0x7fdcff; this.mass = 5; this.contactDmg = 10; this.dropChance = 0; this.xp = 48;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'freeze';
    this.state = 'intro'; this.timer = 1.5; this.next = 0; this.shadowScale = 1.9;
    this.build('enemy_boss', 3.75, [['weapon_greatsword', 'handslotr']]);
    tintMats(this, 0x5ab8ff, 0.62, 0x2080e0, 0.42);
    // Vương miện tinh thể băng 3D (bộ phận phá được)
    this.crownGroup = new THREE.Group();
    const cMat = new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x38b8ff, emissiveIntensity: 1.1, flatShading: true });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.68, 4), cMat);
      shard.position.set(Math.cos(a) * 0.45, 3.65, Math.sin(a) * 0.45);
      this.crownGroup.add(shard);
    }
    this.group.add(this.crownGroup);
    this.spawning = true; this.spawnT = -0.4;
    this.initBossParts([
      { id: 'crown', name: 'Vương Miện Băng', icon: 'x_frozen', pct: 0.24, mesh: this.crownGroup, core: 'core_frost', cond: (i) => i.crit || i.big || i.clash },
    ]);
  }
  get radius() { return 1.05; }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  get grounded() { return !this.spawning && this.state !== 'intro'; }
  onStagger() { this.knock.multiplyScalar(0.25); }
  think(bdt, player, d, dx, dz) {
    const fast = this.enraged ? 1.28 : 1;
    const fdt = bdt * fast;
    switch (this.state) {
      case 'intro':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = 1.1; }
        return 'Idle_Combat';
      case 'chase':
        this.facing = Math.atan2(dx, dz);
        this.timer -= fdt;
        if (d > 3.2) { this.move(dx / d, dz / d, 3.1 * fast, bdt); return 'Walking_D_Skeletons'; }
        if (this.timer <= 0 && !player.dead) this.choose(player, d);
        return 'Idle_Combat';
      case 'nova':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const R = this.enraged ? 6.0 : 5.2;
          spawnRing(this.scene, this.pos, R, 0x7fdcff, 0.55);
          burst(this.pos.clone().setY(0.6), 0xbff4ff, 44, { speed: 12, size: 0.22 });
          addShake(0.8); play('freeze', { at: this.pos, rate: 0.7 });
          if (!player.dead && d < R + player.radius) { hurtPlayer(player, 24); player.slowT = Math.max(player.slowT, 3.5); }
          const n = this.isPartBroken('crown') ? 6 : 12;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            enemyShot(this.pos.clone().setY(1.6), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 11, 'arrow');
          }
          ctx.reactSurface?.(this.pos, R, 'ice', null, 20);
          this.state = 'recover'; this.timer = 0.95;
        }
        return null;
      case 'lance':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const n = this.isPartBroken('crown') ? 3 : 5;
          for (let i = 0; i < n; i++) {
            const a = this.facing + (i - (n - 1) / 2) * 0.16;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            enemyShot(this.pos.clone().setY(1.6).addScaledVector(dir, 1), dir, 12, 'arrow');
          }
          play('freeze', { at: this.pos, rate: 1.35 });
          this.bursts = (this.bursts || 0) + 1;
          if (this.bursts < (this.enraged ? 3 : 2)) {
            this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
            this.timer = 0.42;
          } else { this.bursts = 0; this.state = 'recover'; this.timer = 0.85; }
        }
        return null;
      case 'dashAim':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'dash'; this.left = 14; this.hitDone = false; this.teleKind = 'pierce'; play('dash', { at: this.pos, rate: 0.75 }); }
        return null;
      case 'dash': {
        const step = 25 * fdt;
        this.move(Math.sin(this.facing), Math.cos(this.facing), 25 * fast, bdt);
        this.left -= step;
        if (Math.random() < 0.7) emit(this.pos.clone().setY(1.0), { frame: F.sparkle, color: 0xbff4ff, color2: 0x3080ff, size: 0.6, size2: 0.1, life: 0.3 });
        if (!this.hitDone && !player.dead && d < 1.85) { this.hitDone = true; hurtPlayer(player, 22); player.slowT = Math.max(player.slowT, 2.8); }
        const before = this.pos.clone(); collide(this.pos, this.radius);
        if (this.left <= 0 || before.distanceTo(this.pos) > 0.02) {
          this.dashes = (this.dashes || 0) + 1;
          const maxD = this.isPartBroken('crown') ? 1 : (this.enraged ? 3 : 2);
          if (this.dashes < maxD) {
            this.state = 'dashAim'; this.timer = 0.48; this.teleKind = 'pierce';
            this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
            this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.2, length: 14, facing: this.facing, duration: 0.48 / fast, kind: 'pierce' });
          } else { this.dashes = 0; this.teleKind = null; this.state = 'recover'; this.timer = 0.95; }
        }
        return { name: 'Running_C', opts: { speed: 1.8 } };
      }
      case 'summon':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.anchorHorde ? 2 : 1;
          for (let i = 0; i < cnt; i++) {
            const sx = this.pos.x + (i ? 3.5 : -3.5), sz = this.pos.z + 1.5;
            if (isBlocked(sx, sz, 0.8)) continue;
            const m = i % 2 === 0 ? new FrostGuard(this.scene, sx, sz) : new StoneCrab(this.scene, sx, sz);
            m.spawnT = 0.2; ctx.spawnEnemy?.(m);
          }
          this.state = 'recover'; this.timer = 0.7;
        }
        return null;
      case 'recover':
        this.teleKind = null;
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = this.enraged ? 0.65 : 1.15; }
        return 'Idle_Combat';
    }
    return null;
  }
  choose(player, d) {
    const guards = ctx.enemies.filter((e) => (e instanceof FrostGuard || e instanceof StoneCrab) && !e.dead).length;
    const opts = ['nova', 'dash', 'lance'];
    if (guards < 2) opts.push('summon');
    let pick = opts[this.next++ % opts.length];
    if (pick === 'nova' && d > 8) pick = 'dash';
    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const sp = this.enraged ? 1.28 : 1;
    if (pick === 'nova') {
      this.state = 'nova'; this.timer = 1.05; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: this.enraged ? 6.0 : 5.2, duration: 1.05 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('2H_Melee_Attack_Chop', { once: true, fade: 0.1, speed: 0.75 });
    } else if (pick === 'dash') {
      this.state = 'dashAim'; this.timer = 0.72; this.teleKind = 'pierce';
      this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.2, length: 14, facing: this.facing, duration: 0.72 / sp, kind: 'pierce' });
    } else if (pick === 'lance') {
      this.state = 'lance'; this.timer = 0.6; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 10, arc: 0.9, facing: this.facing, duration: 0.6 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Throw', { once: true, fade: 0.1 });
    } else {
      this.state = 'summon'; this.timer = 1.0; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.0, duration: 1.0 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Spellcast_Summon', { once: true, fade: 0.1 });
    }
  }
  after(dt) { if (this.crownGroup?.visible) this.crownGroup.rotation.y += dt * 1.8; }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// =========================================================================
// BOSS #9: SONG TỬ TỬ THẦN (TwinReapers — Dual-Boss Hỏa Ảnh & Lôi Ảnh)
// Cầm Lưỡi Hái 3D prop_scythe.glb, Tia Liên Kết Song Sinh, Hấp Thụ khi 1 bên chết!
// =========================================================================
class ReaperTwin extends Walker {
  constructor(scene, x, z, level = 1, role = 'flame') {
    super(scene, x, z);
    this.isBoss = true;
    this.twinGroup = 'twins';
    this.role = role;
    this.name = role === 'flame' ? 'Hỏa Ảnh Tử Thần' : 'Lôi Ảnh Tử Thần';
    this.maxHp = this.hp = 310 + (level - 1) * 185;
    this.poiseMax = 95 * level;
    this.color = role === 'flame' ? 0xff5a2a : 0x70d8ff;
    this.mass = 3.8; this.contactDmg = 9; this.dropChance = 0; this.xp = 30;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'mageDie';
    this.state = 'intro'; this.timer = 1.4; this.next = 0; this.shadowScale = 1.5;
    this.absorbed = false; this.sibling = null;
    this.beamCd = 6.5; this.beamT = 0; this.beamTick = 0; this.beamMesh = null;

    const scythe = models.prop_scythe ? ['prop_scythe', 'handslotr', 0.33] : ['weapon_axe', 'handslotr', 1];
    this.build(role === 'flame' ? 'enemy_rogue' : 'enemy_mage', 3.15, [scythe]);
    if (role === 'flame') tintMats(this, 0xd83218, 0.58, 0xff4a10, 0.45);
    else tintMats(this, 0x3888ff, 0.58, 0x70d8ff, 0.48);
    this.spawning = true; this.spawnT = -0.4;

    if (role === 'flame') {
      // Ấn Song Sinh xoay quanh Hỏa Ảnh (bộ phận phá được)
      this.sealMesh = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.08, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.85 }),
      );
      this.sealMesh.rotation.x = Math.PI / 2;
      this.sealMesh.position.y = 1.85;
      this.group.add(this.sealMesh);
      this.initBossParts([
        { id: 'seal', name: 'Ấn Song Sinh', icon: 'x_swords-emblem', pct: 0.34, mesh: this.sealMesh, core: 'core_twins', cond: (i) => i.crit || i.big || i.clash },
      ]);
    }
  }
  get radius() { return 0.9; }
  get enraged() { return this.absorbed || this.hp < this.maxHp * 0.45; }
  get grounded() { return !this.spawning && this.state !== 'intro'; }
  onStagger() { this.knock.multiplyScalar(0.25); }

  absorbSibling() {
    if (this.dead || this.absorbed) return;
    this.absorbed = true;
    const heal = Math.round(this.maxHp * 0.22);
    this.hp = Math.min(this.maxHp, this.hp + heal);
    this.timeMul = (this.timeMul || 1) * 1.28;
    this.group.scale.multiplyScalar(1.18);
    tintMats(this, 0xffcf4a, 0.35, 0xc860ff, 0.55);
    spawnRing(this.scene, this.pos, 6, 0xffcf4a, 0.65);
    burst(this.pos.clone().setY(1.8), 0xffcf4a, 45, { speed: 12, size: 0.22 });
    flash(this.pos.clone().setY(1.8), 0xffcf4a, 6, 0.35);
    damageNumber(this.pos, 'Hấp Thụ Song Sinh!', 'react ult');
    play('anvil'); play('forged');
  }

  updateTwinBeam(dt, player) {
    if (this.role !== 'flame') return;
    const sib = this.sibling;
    if (!sib || sib.dead || this.dead || this.spawning) {
      if (this.beamMesh) { this.scene.remove(this.beamMesh); this.beamMesh.geometry.dispose(); this.beamMesh.material.dispose(); this.beamMesh = null; }
      return;
    }
    if (this.beamT > 0) {
      this.beamT -= dt; this.beamTick -= dt;
      const a = this.pos.clone().setY(1.5), b = sib.pos.clone().setY(1.5);
      const mid = a.clone().lerp(b, 0.5), len = a.distanceTo(b);
      if (!this.beamMesh) {
        this.beamMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 1, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        this.scene.add(this.beamMesh);
      }
      this.beamMesh.position.copy(mid);
      this.beamMesh.scale.set(1, Math.max(0.1, len), 1);
      this.beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      if (Math.random() < dt * 16) spawnBolt(this.scene, a, b, 0xffe080);
      if (this.beamTick <= 0 && !player.dead) {
        const dist = distPointToSeg(player.pos.x, player.pos.z, this.pos.x, this.pos.z, sib.pos.x, sib.pos.z);
        if (dist < 0.85 + player.radius) {
          this.beamTick = 0.55;
          hurtPlayer(player, 14);
        }
      }
      if (this.beamT <= 0 && this.beamMesh) {
        this.scene.remove(this.beamMesh); this.beamMesh.geometry.dispose(); this.beamMesh.material.dispose(); this.beamMesh = null;
        this.beamCd = 7.5;
      }
    } else {
      this.beamCd -= dt;
      if (this.beamCd <= 0) {
        this.beamT = this.isPartBroken('seal') ? 1.6 : 3.2;
        play('zap', { at: this.pos, rate: 0.8 });
        damageNumber(this.pos, 'Liên Kết Song Sinh!', 'react overload');
      }
    }
  }

  think(bdt, player, d, dx, dz) {
    const fast = this.enraged ? 1.25 : 1;
    const fdt = bdt * fast;
    switch (this.state) {
      case 'intro':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = this.role === 'flame' ? 0.9 : 1.4; }
        return 'Idle_Combat';
      case 'chase':
        this.facing = Math.atan2(dx, dz);
        this.timer -= fdt;
        if (this.role === 'flame') {
          if (d > 3) { this.move(dx / d, dz / d, 4.1 * fast, bdt); return { name: 'Running_C', opts: { speed: 1.15 } }; }
        } else {
          const rad = d > 11 ? 1 : d < 6.5 ? -0.8 : 0;
          this.move((dx / d) * rad * 3.2 + (-dz / d) * 2.0, (dz / d) * rad * 3.2 + (dx / d) * 2.0, 1, bdt);
        }
        if (this.timer <= 0 && !player.dead) this.choose(player, d);
        return 'Walking_D_Skeletons';
      case 'dashAim':
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'dash'; this.left = 14; this.hitDone = false; this.teleKind = 'pierce'; play('dash', { at: this.pos, rate: 0.8 }); }
        return null;
      case 'dash': {
        const step = 25 * fdt;
        this.move(Math.sin(this.facing), Math.cos(this.facing), 25 * fast, bdt);
        this.left -= step;
        if (Math.random() < 0.5) flame(this.pos.clone().setY(1.0), { count: 1, size: 0.5, spread: 0.3 });
        if (!this.hitDone && !player.dead && d < 1.8) { this.hitDone = true; hurtPlayer(player, 19); }
        const before = this.pos.clone(); collide(this.pos, this.radius);
        if (this.left <= 0 || before.distanceTo(this.pos) > 0.02) {
          this.teleKind = null;
          spawnFirePatch(this.pos.clone(), 1.8, 3.5, 12, true);
          this.state = 'recover'; this.timer = 0.85;
        }
        return { name: 'Running_C', opts: { speed: 1.8 } };
      }
      case 'cleave':
        this.timer -= fdt;
        if (this.timer <= 0) {
          if (!player.dead && inSector(this.pos, this.facing, player.pos, 4.4 + player.radius, 2.5)) hurtPlayer(player, 21);
          play('swing', { at: this.pos, rate: 0.65 }); addShake(0.4);
          this.state = 'recover'; this.timer = 0.8;
        }
        return null;
      case 'lightning':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.absorbed ? 6 : 4;
          for (let i = 0; i < cnt; i++) {
            const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
            scheduleBomb(at, 0.85 + i * 0.16, 2.0, 0, 16, 0xffe14a);
          }
          play('zap', { at: this.pos });
          this.state = 'recover'; this.timer = 0.85;
        }
        return null;
      case 'fan':
        this.timer -= fdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const n = this.absorbed ? 9 : 5;
          for (let i = 0; i < n; i++) {
            const a = this.facing + (i - (n - 1) / 2) * 0.18;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            enemyShot(this.pos.clone().setY(1.6).addScaledVector(dir, 1), dir, 11, 'orb');
          }
          play('mageCast', { at: this.pos, rate: 1.2 });
          this.state = 'recover'; this.timer = 0.85;
        }
        return null;
      case 'recover':
        this.teleKind = null;
        this.timer -= fdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = this.enraged ? 0.65 : 1.15; }
        return 'Idle_Combat';
    }
    return null;
  }

  choose(player, d) {
    const opts = this.role === 'flame'
      ? (this.absorbed ? ['dash', 'cleave', 'lightning', 'fan'] : ['dash', 'cleave'])
      : (this.absorbed ? ['lightning', 'fan', 'dash', 'cleave'] : ['lightning', 'fan']);
    let pick = opts[this.next++ % opts.length];
    if (pick === 'cleave' && d > 5.5) pick = 'dash';
    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const sp = this.enraged ? 1.25 : 1;
    if (pick === 'dash') {
      this.state = 'dashAim'; this.timer = 0.7; this.teleKind = 'pierce';
      this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 2.1, length: 14, facing: this.facing, duration: 0.7 / sp, kind: 'pierce' });
    } else if (pick === 'cleave') {
      this.state = 'cleave'; this.timer = 0.68;
      this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 4.4, arc: 2.5, facing: this.facing, duration: 0.68 / sp, color: 0xff6a2a });
      if (this.anim) this.anim.play('2H_Melee_Attack_Spin', { once: true, fade: 0.08, speed: 0.8 });
    } else if (pick === 'lightning') {
      this.state = 'lightning'; this.timer = 0.9; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.2, duration: 0.9 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Spellcast_Raise', { once: true, fade: 0.1 });
      play('zap', { at: this.pos, rate: 1.3, vol: 0.5 });
    } else {
      this.state = 'fan'; this.timer = 0.65; this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 9, arc: 1.2, facing: this.facing, duration: 0.65 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Spellcast_Shoot', { once: true, fade: 0.1 });
    }
  }

  after(dt) {
    if (this.sealMesh?.visible) this.sealMesh.rotation.z += dt * 3.0;
    this.updateTwinBeam(dt, ctx.player);
  }

  die() {
    if (this.tele) this.tele.done = true;
    if (this.beamMesh) { this.scene.remove(this.beamMesh); this.beamMesh.geometry.dispose(); this.beamMesh.material.dispose(); this.beamMesh = null; }
    const sib = this.sibling;
    super.die();
    if (sib && !sib.dead) sib.absorbSibling();
  }
}

export function spawnTwinReapers(scene, level = 1) {
  const flameR = new ReaperTwin(scene, -6, -9, level, 'flame');
  const stormR = new ReaperTwin(scene, 6, -9, level, 'storm');
  flameR.sibling = stormR;
  stormR.sibling = flameR;
  return [flameR, stormR];
}
