// Quái xương cận chiến + boss. Tách file riêng cho gọn.
import * as THREE from 'three';
import { collide, isBlocked } from './world.js';
import { burst, damageNumber, spawnRing, addShake, spawnTelegraph } from './fx.js';
import { models, fitModel, Animator } from './models.js';
import { ctx, enemyShot, scheduleBomb } from './combat.js';
import { play } from './audio.js';
import { Enemy, Slime } from './enemies.js';

// Vũ khí gắn tay cho quái xương (đúng vị trí bản gốc KayKit)
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

// ---------- Lính xương: đuổi theo, vung kiếm có cảnh báo trên sàn ----------
export class Minion extends Enemy {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 34;
    this.color = 0xe8e0cc;
    this.mass = 1;
    this.contactDmg = 0;
    this.dropChance = 0.15;
    this.xp = 3;
    this.hurtSound = 'mageHurt';
    this.dieSound = 'mageDie';
    this.state = 'chase';
    this.timer = 0;
    this.cd = 0.8 + Math.random() * 0.6;
    this.facing = 0;
    this.busy = 0;
    this.body = new THREE.Group();
    this.anim = null;
    if (models.enemy_minion) {
      const fitted = fitModel(models.enemy_minion, 1.85, 'ground');
      this.body.add(fitted);
      attachProp(fitted, 'prop_skel_blade');
      this.anim = new Animator(fitted);
      this.anim.play('Spawn_Ground_Skeletons', { once: true, fade: 0 });
    } else {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 10), new THREE.MeshStandardMaterial({ color: this.color }));
      m.position.y = 0.8;
      this.body.add(m);
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
  }

  get radius() { return 0.5; }

  onStagger() {
    if (this.state === 'chase' && this.anim) { this.anim.play('Hit_A', { once: true, fade: 0.05, speed: 1.6 }); this.busy = 0.25; }
  }

  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    this.busy = Math.max(0, this.busy - bdt);
    let anim = null;

    if (this.spawning) {
      if (this.spawnT <= 0 && this.spawnT + dt > 0) play('mageSpawn', { at: this.pos });
      this.spawnT += dt;
      if (this.spawnT >= 1.0) this.spawning = false;
    } else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.001;
      this.cd -= bdt;
      if (this.state === 'chase') {
        this.facing = Math.atan2(dx, dz);
        if (d < 2.0 && this.cd <= 0 && !player.dead) {
          // Vung kiếm: khóa hướng, hiện vùng cảnh báo hình quạt
          this.state = 'windup';
          this.timer = 0.55;
          this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 2.4, arc: 1.9, facing: this.facing, duration: 0.55 });
          if (this.anim) this.anim.play('1H_Melee_Attack_Chop', { once: true, fade: 0.05, speed: 1.25 });
        } else if (d > 1.3 && this.busy <= 0) {
          // Bao vây: mỗi con nhắm một góc quanh người chơi rồi mới áp sát
          if (this.flankA == null) this.flankA = Math.random() * Math.PI * 2;
          let tx = dx, tz = dz;
          if (d > 3.2) { tx = player.pos.x + Math.cos(this.flankA) * 2.4 - this.pos.x; tz = player.pos.z + Math.sin(this.flankA) * 2.4 - this.pos.z; }
          const td = Math.hypot(tx, tz) || 1;
          this.pos.x += (tx / td) * 3.1 * bdt;
          this.pos.z += (tz / td) * 3.1 * bdt;
          anim = 'Running_C';
        } else if (this.busy <= 0) anim = 'Idle_Combat';
      } else if (this.state === 'windup') {
        this.timer -= bdt;
        if (this.timer <= 0) {
          if (!player.dead && inSector(this.pos, this.facing, player.pos, 2.4 + player.radius, 1.9)) {
            if (player.hurt(12)) damageNumber(player.pos, 12, 'player');
          }
          play('swing', { at: this.pos, rate: 0.85 });
          this.state = 'recover';
          this.timer = 0.45;
        }
      } else if (this.state === 'recover') {
        this.timer -= bdt;
        if (this.timer <= 0) {
          // Tầng 3 trở đi: 50% đánh thêm một nhát nhanh
          if ((ctx.floor || 1) >= 3 && !this.comboed && Math.random() < 0.5 && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 3) {
            this.comboed = true;
            this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
            this.state = 'windup'; this.timer = 0.38;
            this.tele = spawnTelegraph(this.scene, { shape: 'sector', pos: this.pos, radius: 2.4, arc: 1.9, facing: this.facing, duration: 0.38 });
            if (this.anim) this.anim.play('1H_Melee_Attack_Slice_Horizontal', { once: true, fade: 0.05, speed: 1.6 });
          } else { this.comboed = false; this.state = 'chase'; this.cd = 1.0 + Math.random() * 0.6; }
        }
      }
    }

    if (this.anim) {
      if (anim && this.busy <= 0) this.anim.play(anim, { speed: anim === 'Running_C' ? 1.1 : 1 });
      this.anim.update(bdt);
    }
    if (this.knock.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 9));
    }
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.shadow.scale.setScalar(0.8);
    this.applyTint(time);
    return false;
  }

  die() {
    if (this.tele) this.tele.done = true;
    super.die();
  }
}

// ---------- Boss: Hiệp Sĩ Xương ----------
export class Boss extends Enemy {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true;
    this.name = 'Hiệp Sĩ Xương';
    this.maxHp = this.hp = 420 + (level - 1) * 260;
    this.poiseMax = 130 * level;
    this.color = 0xd8ccb0;
    this.mass = 5;
    this.contactDmg = 10;
    this.dropChance = 0;
    this.xp = 40;
    this.hurtSound = 'hitHeavy';
    this.dieSound = 'mageDie';
    this.state = 'intro';
    this.timer = 1.6;
    this.facing = 0;
    this.next = 0;
    this.body = new THREE.Group();
    this.anim = null;
    if (models.enemy_boss) {
      const fitted = fitModel(models.enemy_boss, 3.6, 'ground');
      this.body.add(fitted);
      this.axeMesh = attachProp(fitted, 'prop_skel_axe');
      this.shieldMesh = attachProp(fitted, 'prop_skel_shield', 'handslotl');
      this.anim = new Animator(fitted);
      this.anim.play('Spawn_Ground_Skeletons', { once: true, fade: 0 });
    } else {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 1.8, 4, 10), new THREE.MeshStandardMaterial({ color: this.color }));
      m.position.y = 1.7;
      this.body.add(m);
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
    this.initBossParts([
      { id: 'shield', name: 'Khiên Xương', icon: 'x_shield', pct: 0.22, mesh: this.shieldMesh, core: 'core_knight', cond: (i) => i.big || !i.back },
      { id: 'axe', name: 'Rìu Cổ', icon: 'axe', pct: 0.26, mesh: null, core: null, cond: (i) => this.state === 'recover' || this.stunT > 0 || i.crit },
    ]);
  }

  get radius() { return 1.0; }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  get grounded() { return !this.spawning && this.state !== 'intro'; }

  onStagger() { this.knock.multiplyScalar(0.3); }

  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const speed = this.enraged ? 1.3 : 1;
    const bdt = dt * this.speedMul * speed;
    let anim = null;
    if (this.spawning) {
      this.spawnT += dt;
      if (this.spawnT >= 0) { this.spawning = false; play('anvil'); addShake(0.6); }
    }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;

    switch (this.state) {
      case 'intro':
        this.timer -= bdt;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = 1.4; }
        break;
      case 'chase':
        this.facing = Math.atan2(dx, dz);
        this.timer -= bdt;
        if (d > 2.2) { this.pos.x += (dx / d) * 2.5 * bdt; this.pos.z += (dz / d) * 2.5 * bdt; anim = 'Walking_D_Skeletons'; }
        else anim = 'Idle_Combat';
        if (this.timer <= 0 && !player.dead) this.chooseAttack(player, d);
        break;
      case 'slam':
        this.timer -= bdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const R = this.slamR;
          spawnRing(this.scene, this.pos, R, 0xffa040, 0.45);
          burst(this.pos.clone().setY(0.3), 0x8a7a6a, 40, { speed: 10, size: 0.22, life: 0.8 });
          addShake(0.8);
          play('explode', { at: this.pos });
          if (!player.dead && d < R + player.radius) { if (player.hurt(24)) damageNumber(player.pos, 24, 'player'); }
          this.state = 'recover'; this.timer = 0.9;
        }
        break;
      case 'chargeWind':
        this.timer -= bdt;
        if (this.timer <= 0) {
          this.state = 'charging'; this.chargeLeft = 11; this.chargeHit = false;
          this.teleKind = 'pierce';
          if (this.anim) this.anim.play('Running_C', { speed: 1.6 });
          play('dash', { at: this.pos, rate: 0.7 });
        }
        break;
      case 'charging': {
        const step = 19 * bdt;
        const dirX = Math.sin(this.facing), dirZ = Math.cos(this.facing);
        this.pos.x += dirX * step; this.pos.z += dirZ * step;
        this.chargeLeft -= step;
        if (Math.random() < 0.6) burst(this.pos.clone().setY(0.2), 0x8a7a6a, 2, { speed: 2, up: 1, size: 0.2 });
        const hitR = this.isPartBroken('shield') ? 1.2 : 1.6;
        if (!this.chargeHit && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < hitR) {
          this.chargeHit = true;
          if (player.hurt(20)) { damageNumber(player.pos, 20, 'player'); player.lunge = 0; player.pos.x += dirX * 1.2; player.pos.z += dirZ * 1.2; }
        }
        const before = this.pos.clone();
        collide(this.pos, this.radius);
        if (this.chargeLeft <= 0 || before.distanceTo(this.pos) > 0.01) {
          this.teleKind = null;
          addShake(0.4); play('hitHeavy', { at: this.pos });
          this.state = 'recover'; this.timer = 1.0;
        }
        break;
      }
      case 'summon':
        this.timer -= bdt;
        if (this.timer <= 0) {
          this.teleKind = null;
          const cnt = this.anchorHorde ? 2 : 1;
          for (let k = 0; k < cnt; k++) {
            for (const side of [-1, 1]) {
              const m = new Minion(this.scene, this.pos.x + Math.cos(this.facing) * side * (2.5 + k), this.pos.z - Math.sin(this.facing) * side * (2.5 + k));
              m.spawnT = 0;
              if (ctx.spawnEnemy) ctx.spawnEnemy(m);
            }
          }
          this.state = 'recover'; this.timer = 0.6;
        }
        break;
      case 'recover':
        this.teleKind = null;
        this.timer -= bdt;
        anim = 'Idle_Combat';
        if (this.timer <= 0) { this.state = 'chase'; this.timer = this.enraged ? 0.8 : 1.5; }
        break;
    }

    if (this.anim) {
      if (anim && (this.state === 'chase' || this.state === 'recover')) this.anim.play(anim);
      this.anim.update(bdt);
    }
    if (this.knock.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 9));
    }
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.shadow.scale.setScalar(1.8);
    this.applyTint(time);
    return false;
  }

  chooseAttack(player, d) {
    const minions = ctx.enemies.filter((e) => e instanceof Minion && !e.dead).length;
    const options = ['slam', 'charge'];
    if (minions < 3) options.push('summon');
    let pick = options[this.next++ % options.length];
    if (pick === 'slam' && d > 6) pick = 'charge';       // ở xa thì lao tới
    const sp = this.enraged ? 1.3 : 1;
    if (pick === 'slam') {
      this.slamR = (this.enraged ? 4.2 : 3.6) * (this.isPartBroken('axe') ? 0.65 : 1);
      this.state = 'slam'; this.timer = 1.0;
      this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: this.slamR, duration: 1.0 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('2H_Melee_Attack_Chop', { once: true, fade: 0.1, speed: 0.9 });
    } else if (pick === 'charge') {
      this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this.state = 'chargeWind'; this.timer = 0.8;
      this.teleKind = 'pierce';
      this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: this.isPartBroken('shield') ? 1.6 : 2.4, length: 11, facing: this.facing, duration: 0.8 / sp, kind: 'pierce' });
      if (this.anim) this.anim.play('Taunt', { once: true, fade: 0.1, speed: 1.6 });
    } else {
      this.state = 'summon'; this.timer = 1.1;
      this.teleKind = 'interrupt';
      this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 2.8, duration: 1.1 / sp, kind: 'interrupt' });
      if (this.anim) this.anim.play('Spellcast_Summon', { once: true, fade: 0.1 });
      play('mageCast', { at: this.pos, rate: 0.7 });
    }
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- Sát thủ xương: áp sát rồi lướt chém xuyên qua ----------
export class Assassin extends Enemy {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 26; this.color = 0xd8d0c0; this.mass = 0.8; this.contactDmg = 0; this.dropChance = 0.15; this.xp = 3;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this.state = 'chase'; this.timer = 0; this.cd = 1 + Math.random(); this.facing = 0;
    this.body = new THREE.Group();
    if (models.enemy_rogue) {
      const fitted = fitModel(models.enemy_rogue, 1.8, 'ground');
      this.body.add(fitted);
      attachProp(fitted, 'prop_skel_blade');
      this.anim = new Animator(fitted);
      this.anim.play('Spawn_Ground_Skeletons', { once: true, fade: 0 });
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
  }
  get radius() { return 0.45; }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    let anim = null;
    if (this.spawning) {
      if (this.spawnT <= 0 && this.spawnT + dt > 0) play('mageSpawn', { at: this.pos });
      this.spawnT += dt; if (this.spawnT >= 1) this.spawning = false;
    } else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.001;
      this.cd -= bdt;
      if (this.state === 'chase') {
        this.facing = Math.atan2(dx, dz);
        if ((player.charging || (player.attack && d < 3)) && d < 6) {
          this.pos.x -= (dx / d) * 5 * bdt; this.pos.z -= (dz / d) * 5 * bdt; anim = 'Running_C';
        } else if (d < 7.5 && this.cd <= 0 && !player.dead) {
          this.state = 'aim'; this.timer = 0.6;
          this.teleKind = 'pierce';
          this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.2, length: 9, facing: this.facing, duration: 0.6, kind: 'pierce' });
          if (this.anim) this.anim.play('1H_Melee_Attack_Stab', { once: true, fade: 0.1, speed: 0.6 });
        } else if (d > 4) { this.pos.x += (dx / d) * 4.2 * bdt; this.pos.z += (dz / d) * 4.2 * bdt; anim = 'Running_C'; }
        else { const sx = -dz / d, sz = dx / d; this.pos.x += sx * 3 * bdt; this.pos.z += sz * 3 * bdt; anim = 'Running_C'; }
      } else if (this.state === 'aim') {
        this.timer -= bdt;
        if (this.timer <= 0) { this.state = 'dash'; this.left = 9; this.hitDone = false; this.teleKind = 'pierce'; play('dash', { at: this.pos }); }
      } else if (this.state === 'dash') {
        const step = 24 * bdt;
        this.pos.x += Math.sin(this.facing) * step; this.pos.z += Math.cos(this.facing) * step; this.left -= step;
        if (Math.random() < 0.7) burst(this.pos.clone().setY(0.8), 0xd8d0c0, 2, { speed: 1, up: 0.5, gravity: 0, life: 0.25, size: 0.2 });
        if (!this.hitDone && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.1) {
          this.hitDone = true; if (player.hurt(14)) damageNumber(player.pos, 14, 'player');
        }
        const before = this.pos.clone(); collide(this.pos, this.radius);
        if (this.left <= 0 || before.distanceTo(this.pos) > 0.01) { this.teleKind = null; this.state = 'recover'; this.timer = 0.6; }
      } else if (this.state === 'recover') {
        this.teleKind = null;
        this.timer -= bdt; anim = 'Idle_Combat';
        if (this.timer <= 0) { this.state = 'chase'; this.cd = 2 + Math.random(); }
      }
    }
    if (this.anim) { if (anim && this.state !== 'aim') this.anim.play(anim, { speed: 1.2 }); this.anim.update(bdt); }
    if (this.knock.lengthSq() > 0.001) { this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.max(0, 1 - dt * 9)); }
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z); this.shadow.scale.setScalar(0.75);
    this.applyTint(time);
    return false;
  }
}

// ---------- Cung thủ xương: giữ khoảng cách, nhắm rồi bắn nỏ ----------
export class Archer extends Enemy {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 22; this.color = 0xd8d0c0; this.mass = 0.8; this.contactDmg = 0; this.dropChance = 0.18; this.xp = 3;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this.state = 'move'; this.timer = 0; this.cd = 1.5 + Math.random(); this.facing = 0; this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.body = new THREE.Group();
    if (models.enemy_rogue) {
      const fitted = fitModel(models.enemy_rogue, 1.8, 'ground');
      this.body.add(fitted);
      attachProp(fitted, 'prop_skel_crossbow');
      this.anim = new Animator(fitted);
      this.anim.play('Spawn_Ground_Skeletons', { once: true, fade: 0 });
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
  }
  get radius() { return 0.45; }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    let anim = null;
    if (this.spawning) {
      if (this.spawnT <= 0 && this.spawnT + dt > 0) play('mageSpawn', { at: this.pos });
      this.spawnT += dt; if (this.spawnT >= 1) this.spawning = false;
    } else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.001;
      this.cd -= bdt;
      if (this.state === 'move') {
        this.facing = Math.atan2(dx, dz);
        const radial = d > 11 ? 1 : d < 7 ? -1 : 0;
        this.pos.x += ((dx / d) * radial * 3 + (-dz / d) * this.strafe * 1.6) * bdt;
        this.pos.z += ((dz / d) * radial * 3 + (dx / d) * this.strafe * 1.6) * bdt;
        anim = 'Walking_D_Skeletons';
        if (this.cd <= 0 && d < 16 && !player.dead) {
          this.state = 'aim'; this.timer = 0.85;
          this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 0.35, length: 16, facing: this.facing, duration: 0.85, color: 0xffb040 });
          if (this.anim) this.anim.play('2H_Ranged_Aiming', { fade: 0.1 });
        }
      } else if (this.state === 'aim') {
        this.timer -= bdt;
        if (this.timer <= 0) {
          const ang = this.facing + (this.blindT > 0 ? (Math.random() - 0.5) * 1.3 : 0);
          const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
          enemyShot(this.pos.clone().setY(1.1).addScaledVector(dir, 0.6), dir, 10, 'arrow');
          play('swing', { at: this.pos, rate: 1.6 });
          if (this.anim) this.anim.play('2H_Ranged_Shoot', { once: true, fade: 0.05 });
          this.state = 'move'; this.cd = 2.4 + Math.random(); this.strafe *= -1;
        }
      }
    }
    if (this.anim) { if (anim) this.anim.play(anim); this.anim.update(bdt); }
    if (this.knock.lengthSq() > 0.001) { this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.max(0, 1 - dt * 9)); }
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z); this.shadow.scale.setScalar(0.75);
    this.applyTint(time);
    return false;
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- Boss tầng 2: Vua Slime ----------
export class KingSlime extends Enemy {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.slimy = true;
    this.isBoss = true; this.name = 'Vua Slime';
    this.maxHp = this.hp = 520 + (level - 1) * 300;
    this.color = 0xb070ff; this.mass = 6; this.contactDmg = 14; this.xp = 40; this.dropChance = 0;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this.poiseMax = 140 * level;
    this.state = 'wait'; this.timer = 1.5; this.height = 0; this.splits = 0; this.scale = 3.0;
    this.body = new THREE.Group();
    if (models.slime) {
      const fitted = fitModel(models.slime, 1.25, 'ground');
      this.body.add(fitted);
      this.anim = new Animator(fitted); this.anim.play('Slime_Idle');
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
    for (const m of this.mats) if (m.name === 'Body') { m.color.setHex(0xa060ff); m.emissive.setHex(0x6020c0); m.emissiveIntensity = 0.35; m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = 0.35; }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xffcf4a, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide, emissive: 0x804000, emissiveIntensity: 0.4 }));
    crown.position.y = 1.28;
    this.body.add(crown);
    this.crownMesh = crown;
    this.group.scale.setScalar(this.scale);
    this.initBossParts([
      { id: 'crown', name: 'Lõi Kiếm Cổ', icon: 'x_sword-stone', pct: 0.24, mesh: crown, core: 'core_slime', cond: (i) => i.crit || i.big },
    ]);
  }
  get radius() { return 1.7; }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  get grounded() { return !this.spawning && this.height < 0.6; }
  onStagger() { this.knock.multiplyScalar(0.15); }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul * (this.enraged ? 1.25 : 1);
    if (this.spawning) { this.spawnT += dt; if (this.spawnT >= 0) { this.spawning = false; play('anvil'); } }
    const thresholds = [0.66, 0.33];
    if (this.splits < 2 && this.hp < this.maxHp * thresholds[this.splits]) {
      this.splits++;
      for (const side of [-1, 1]) {
        const s = new Slime(this.scene, this.pos.x + side * 2.5, this.pos.z, 'big');
        s.spawning = false; s.height = 0; s.knock.set(side * 8, 0, 0); s.timer = 0.6;
        if (ctx.spawnEnemy) ctx.spawnEnemy(s);
      }
      burst(this.pos.clone().setY(1.5), 0xb070ff, 40, { speed: 10, size: 0.25 });
      play('slimeDie', { rate: 0.6 });
    }
    if (this.state === 'wait') {
      this.timer -= bdt;
      this.teleKind = this.timer < 0.65 ? 'interrupt' : null;
      if (this.timer <= 0 && !player.dead) {
        this.teleKind = null;
        this.state = 'jump'; this.t = 0; this.dur = this.enraged ? 1.0 : 1.25;
        this.from = this.pos.clone(); this.to = player.pos.clone();
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.to, radius: 3.6, duration: this.dur / (this.enraged ? 1.25 : 1) });
        if (this.anim) this.anim.play('Slime_Walk', { speed: 0.8 });
      }
    } else if (this.state === 'jump') {
      this.t += bdt / this.dur;
      const k = Math.min(1, this.t);
      this.pos.lerpVectors(this.from, this.to, k);
      this.height = Math.sin(k * Math.PI) * 7;
      if (k >= 1) {
        this.height = 0; this.state = 'wait'; this.timer = this.enraged ? 0.7 : 1.2;
        spawnRing(this.scene, this.pos, 3.6, 0xb070ff, 0.45);
        burst(this.pos.clone().setY(0.3), 0xb070ff, 40, { speed: 11, size: 0.22 });
        addShake(0.8); play('explode', { at: this.pos, rate: 0.7 });
        if (!player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 3.6 + player.radius) { if (player.hurt(22)) damageNumber(player.pos, 22, 'player'); }
        const spawnN = this.isPartBroken('crown') ? 0 : (this.enraged ? 2 : 1) * (this.anchorHorde ? 2 : 1);
        for (let i = 0; i < spawnN; i++) {
          const s = new Slime(this.scene, this.pos.x + (Math.random() - 0.5) * 3, this.pos.z + (Math.random() - 0.5) * 3, 'small');
          s.spawning = false; s.height = 0; s.timer = 0.5;
          if (ctx.spawnEnemy) ctx.spawnEnemy(s);
        }
      }
    }
    if (this.anim) this.anim.update(bdt);
    collide(this.pos, this.radius);
    const sq = this.state === 'wait' && this.timer < 0.3 ? 0.85 : 1;
    this.group.position.set(this.pos.x, this.height, this.pos.z);
    this.group.scale.set(this.scale / Math.sqrt(sq), this.scale * sq, this.scale / Math.sqrt(sq));
    this.group.rotation.y = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z); this.shadow.scale.setScalar(3 * Math.max(0.4, 1 - this.height * 0.08));
    this.applyTint(time);
    return false;
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- Boss tầng 3: Pháp Sư Tối Thượng ----------
export class ArchMage extends Enemy {
  constructor(scene, x, z, level = 1) {
    super(scene, x, z);
    this.isBoss = true; this.name = 'Pháp Sư Tối Thượng';
    this.maxHp = this.hp = 460 + (level - 1) * 260;
    this.color = 0xc06bff; this.mass = 4; this.contactDmg = 0; this.xp = 40; this.dropChance = 0;
    this.hurtSound = 'mageHurt'; this.dieSound = 'mageDie';
    this.poiseMax = 120 * level;
    this.state = 'idle'; this.timer = 1.5; this.next = 0; this.facing = 0;
    this.body = new THREE.Group();
    if (models.enemy_mage) {
      const fitted = fitModel(models.enemy_mage, 3.4, 'ground');
      this.body.add(fitted);
      attachProp(fitted, 'prop_spellbook', 'handslotl');
      this.anim = new Animator(fitted);
      this.anim.play('Spawn_Ground_Skeletons', { once: true, fade: 0 });
    }
    this.group.add(this.body);
    // 3 viên pha lê quay quanh (bộ phận có thể phá của Pháp Sư Tối Thượng)
    this.crystalsGroup = new THREE.Group();
    const cMat = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, emissive: 0x8a4aff, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.3, flatShading: true });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), cMat);
      c.position.set(Math.cos(a) * 1.45, 2.2, Math.sin(a) * 1.45);
      c.scale.y = 1.6;
      this.crystalsGroup.add(c);
    }
    this.group.add(this.crystalsGroup);
    this.setupMaterials(this.body);
    this.initBossParts([
      { id: 'crystals', name: 'Vòng Pha Lê', icon: 'x_crystal-ball', pct: 0.24, mesh: this.crystalsGroup, core: 'core_mage' },
    ]);
  }
  get radius() { return 0.9; }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  onStagger() { this.knock.multiplyScalar(0.3); }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul * (this.enraged ? 1.3 : 1);
    if (this.spawning) { this.spawnT += dt; if (this.spawnT >= 0) { this.spawning = false; play('anvil'); } }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    this.facing = Math.atan2(dx, dz);
    this.timer -= bdt;
    if (this.state === 'idle' && this.timer <= 0 && !player.dead) {
      const pattern = ['ring', 'teleport', 'spiral', 'storm', 'teleport', 'summon'][this.next++ % 6];
      this.state = pattern;
      if (pattern === 'ring') {
        this.timer = 0.7; this.teleKind = 'interrupt';
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.0, duration: 0.7, kind: 'interrupt' });
        if (this.anim) this.anim.play('Spellcast_Shoot', { once: true, fade: 0.1 });
      } else if (pattern === 'spiral') {
        this.timer = 1.6; this.spiralA = 0; this.spiralT = 0; this.teleKind = 'interrupt';
        if (this.anim) this.anim.play('Spellcasting', { fade: 0.1 });
      } else if (pattern === 'storm') {
        this.timer = 0.4; if (this.anim) this.anim.play('Spellcast_Raise', { once: true, fade: 0.1 });
        for (let i = 0; i < (this.enraged ? 5 : 3); i++) {
          const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
          scheduleBomb(at, 1.0 + i * 0.15, 1.8, 0, 14, 0xc06bff);
        }
      } else if (pattern === 'teleport') {
        this.timer = 0.3;
        burst(this.pos.clone().setY(1.5), 0xc06bff, 30, { speed: 8, size: 0.2 });
        for (let k = 0; k < 20; k++) {
          const a = Math.random() * Math.PI * 2, r = 7 + Math.random() * 3;
          const nx = player.pos.x + Math.cos(a) * r, nz = player.pos.z + Math.sin(a) * r;
          if (!isBlocked(nx, nz, 1.2)) { this.pos.set(nx, 0, nz); break; }
        }
        burst(this.pos.clone().setY(1.5), 0xc06bff, 30, { speed: 8, size: 0.2 });
        play('mageCast', { at: this.pos, rate: 1.4 });
      } else {
        this.timer = 1.0; this.teleKind = 'interrupt';
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 2.8, duration: 1.0, kind: 'interrupt' });
        if (this.anim) this.anim.play('Spellcast_Summon', { once: true, fade: 0.1 });
        const cnt = this.anchorHorde ? 3 : 2;
        for (let i = 0; i < cnt; i++) {
          const m = Math.random() < 0.5 ? new Archer(this.scene, this.pos.x + (i ? 2 : -2), this.pos.z + 1) : new Minion(this.scene, this.pos.x + (i ? 2 : -2), this.pos.z + 1);
          m.spawnT = 0; if (ctx.spawnEnemy) ctx.spawnEnemy(m);
        }
      }
    }
    if (this.crystalsGroup && this.crystalsGroup.visible) this.crystalsGroup.rotation.y += dt * 2.2;
    if (this.state === 'spiral') {
      this.spiralT -= bdt;
      if (this.spiralT <= 0) {
        this.spiralT = this.isPartBroken('crystals') ? 0.16 : 0.09;
        this.spiralA += 0.5;
        const offs = this.isPartBroken('crystals') ? [0] : [0, Math.PI];
        for (const off of offs) {
          const a = this.spiralA + off;
          enemyShot(this.pos.clone().setY(1.6), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 9);
        }
      }
    }
    if (this.state !== 'idle' && this.timer <= 0) {
      if (this.state === 'ring') {
        const baseN = this.enraged ? 18 : 14;
        const n = this.isPartBroken('crystals') ? Math.round(baseN * 0.5) : baseN;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; enemyShot(this.pos.clone().setY(1.6), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 9); }
        play('mageCast', { at: this.pos, rate: 0.7 });
      }
      this.teleKind = null;
      this.state = 'idle'; this.timer = this.enraged ? 1.0 : 1.6;
      if (this.anim) this.anim.play('Idle_Combat', { fade: 0.2 });
    }
    if (this.anim) this.anim.update(bdt);
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z); this.shadow.scale.setScalar(1.6);
    this.applyTint(time);
    return false;
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}
