// Quái mới đợt 2: Hiệp Sĩ Giáp, Slime Chui Đất, Cột Tế (và pha lê hộ thể của boss)
import * as THREE from 'three';
import { collide } from './world.js';
import { burst, damageNumber, addShake, spawnTelegraph, emit, F, explosion, hitSpark } from './fx.js';
import { models, fitModel } from './models.js';
import { ctx } from './combat.js';
import { play } from './audio.js';
import { Enemy } from './enemies.js';
import { Walker, tintMats, hurtPlayer } from './enemies_new.js';
import { steerMove, leadPos, canStartMelee, claimMeleeToken } from './ai.js';

// ---------- Hiệp Sĩ Giáp: phải phá giáp bằng chí mạng / đòn nặng / đâm lướt ----------
export class Armored extends Walker {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 46; this.color = 0xb8c4d8; this.mass = 1.8; this.contactDmg = 0; this.dropChance = 0.2; this.xp = 6;
    this.hurtSound = 'hitHeavy'; this.dieSound = 'mageDie';
    this.armor = 70;
    this.state = 'chase'; this.timer = 0; this.cd = 1.2; this.shadowScale = 1;
    this.build('enemy_minion', 2.2, [['prop_skel_axe', 'handslotr']]);
    tintMats(this, 0x8a9ab8, 0.5);
    for (const m of this.mats) if (m.metalness != null) { m.metalness = 0.7; m.roughness = 0.35; }
  }
  get radius() { return 0.6; }
  takeHit(dmg, dir, kb, crit, kind) {
    if (this.armor > 0 && kind !== 'burn' && kind !== 'poison') {
      this.armor -= crit ? dmg * 2 : dmg * 0.6;
      hitSpark(this.pos.clone().setY(1.2), 0xd8e4ff, crit);
      if (this.armor <= 0) {
        damageNumber(this.pos, 'Vỡ Giáp!', 'react shatter');
        play('freeze', { at: this.pos, rate: 0.6 });
        burst(this.pos.clone().setY(1.2), 0xb8c4d8, 24, { speed: 8, size: 0.2 });
        for (const m of this.mats) if (m.metalness != null) { m.metalness = 0.1; m.roughness = 0.8; }
        this.stunT = 1.5; this.stunId = (this.stunId || 0) + 1;
      } else if (Math.random() < 0.3) damageNumber(this.pos, 'Giáp', 'burn');
      return super.takeHit(Math.max(1, Math.round(dmg * 0.3)), dir, kb * 0.3, false, kind);
    }
    return super.takeHit(dmg, dir, kb, crit, kind);
  }
  think(bdt, player, d, dx, dz) {
    this.cd -= bdt;
    if (this.state === 'chase') {
      this.facing = Math.atan2(dx, dz);
      if (d < 3 && this.cd <= 0 && !player.dead && canStartMelee(this)) {
        claimMeleeToken(this);
        this.state = 'wind'; this.timer = 0.65;
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3, duration: 0.65 });
        if (this.anim) this.anim.play('2H_Melee_Attack_Spin', { once: true, fade: 0.1, speed: 0.85 });
        return null;
      }
      if (d > 1.6) { this.move(dx / d, dz / d, 2.75, bdt); return 'Walking_D_Skeletons'; }
      return 'Idle_Combat';
    }
    if (this.state === 'wind') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        if (!player.dead && d < 3 + player.radius) hurtPlayer(player, 18);
        play('swing', { at: this.pos, rate: 0.6 }); addShake(0.25);
        this.state = 'recover'; this.timer = 0.6;
      }
      return null;
    }
    this.timer -= bdt;
    if (this.timer <= 0) { this.state = 'chase'; this.cd = 1.4 + Math.random(); }
    return 'Idle_Combat';
  }
  die() { if (this.tele) this.tele.done = true; super.die(); }
}

// ---------- Slime Chui Đất: lặn xuống, bò tới dưới chân rồi trồi lên ----------
export class Burrower extends Enemy {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.slimy = true;
    this.hp = 32; this.color = 0x9a7a4a; this.mass = 1; this.contactDmg = 0; this.dropChance = 0.12; this.xp = 4;
    this.hurtSound = 'slimeHit'; this.dieSound = 'slimeDie';
    this.state = 'up'; this.timer = 1.5 + Math.random(); this.under = 0;
    this.body = new THREE.Group();
    if (models.slime) this.body.add(fitModel(models.slime, 1.0, 'ground'));
    else this.body.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: this.color })));
    this.group.add(this.body);
    this.setupMaterials(this.body);
    tintMats(this, 0x8a6a3a, 0.7);
  }
  get radius() { return 0.5; }
  get alive() { return !this.dead && !this.dying && this.state !== 'under'; }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    if (this.spawning) { this.spawnT += dt; if (this.spawnT >= 0.6) this.spawning = false; }
    else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.001;
      this.timer -= bdt;
      if (this.state === 'up') {
        steerMove(this, dx, dz, 2.2, bdt);
        if (this.timer <= 0) { this.state = 'dive'; this.timer = 0.4; burst(this.pos.clone().setY(0.2), 0x6a5a4a, 10, { speed: 3, up: 3, size: 0.2 }); play('slimeLand', { at: this.pos }); }
      } else if (this.state === 'dive') {
        this.under = Math.min(1, this.under + bdt * 3);
        if (this.timer <= 0) { this.state = 'under'; this.timer = 1.3; }
      } else if (this.state === 'under') {
        const spd = Math.min(7.5, d / Math.max(bdt, 0.001));
        steerMove(this, dx, dz, spd, bdt, { ignoreHazards: true });
        if (Math.random() < 0.6) emit(this.pos.clone().setY(0.1), { smoke: true, frame: F.dust, color: 0x6a5a4a, size: 0.6, size2: 1, life: 0.6, alpha: 0.5 });
        if (this.timer <= 0 || d < 0.8) {
          this.state = 'rise'; this.timer = 0.55;
          const lp = leadPos(this.pos, player, 12, 0.55);
          this.pos.set(lp.x, 0, lp.z);
          collide(this.pos, this.radius);
          this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos.clone(), radius: 1.8, duration: 0.55 });
        }
      } else if (this.state === 'rise') {
        if (this.timer <= 0) {
          this.under = 0;
          burst(this.pos.clone().setY(0.3), 0x6a5a4a, 24, { speed: 8, size: 0.22 });
          addShake(0.3); play('bigLand', { at: this.pos });
          if (!player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.8 + player.radius) hurtPlayer(player, 14);
          this.state = 'up'; this.timer = 2.5 + Math.random() * 1.5;
        }
      }
    }
    if (this.state === 'under' || this.state === 'rise') this.under = 1;
    else if (this.state === 'up') this.under = Math.max(0, this.under - dt * 4);
    if (this.knock.lengthSq() > 0.001) { this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.max(0, 1 - dt * 9)); }
    collide(this.pos, this.radius);
    this.group.position.set(this.pos.x, -this.under * 1.2, this.pos.z);
    this.group.visible = this.under < 0.95;
    this.shadow.visible = this.under < 0.5;
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.applyTint(time);
    return false;
  }
  die() { if (this.tele) this.tele.done = true; this.group.visible = true; super.die(); }
}

// ---------- Cột Tế / Pha lê hộ thể ----------
// Cột Tế: cường hóa quái trong 9m (nhanh hơn 30%, chịu ít sát thương hơn 30%).
// Pha lê hộ thể (opts.ward = boss): giữ boss bất tử cho tới khi bị phá.
export class Totem extends Enemy {
  constructor(scene, x, z, opts = {}) {
    super(scene, x, z);
    this.ward = opts.ward || null;
    this.hp = opts.hp || 60; this.color = this.ward ? 0x9a6aff : 0xc04a4a; this.mass = 99; this.contactDmg = 0; this.dropChance = 0; this.xp = 3;
    this.hurtSound = 'hammer'; this.dieSound = 'explode';
    this.slimy = true;                                     // không phải quái xương
    this.body = new THREE.Group();
    if (this.ward) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xc8a0ff, emissive: 0x7a3aff, emissiveIntensity: 0.9, flatShading: true, transparent: true, opacity: 0.9 });
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), mat);
      c.scale.set(0.8, 1.6, 0.8); c.position.y = 1.4; this.body.add(c); this.crystal = c;
    } else {
      const p = models['dungeon/pillar_decorated'];
      if (p) { const o = p.scene.clone(true); o.scale.setScalar(0.45); this.body.add(o); }
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a3a).multiplyScalar(2) }));
      orb.position.y = 2.2; this.body.add(orb); this.crystal = orb;
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
    const R = this.ward ? 1.3 : 9;
    this.aura = new THREE.Mesh(new THREE.RingGeometry(R - 0.25, R, 48), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.35, depthWrite: false }));
    this.aura.rotation.x = -Math.PI / 2; this.aura.position.set(x, 0.05, z);
    scene.add(this.aura);
  }
  get radius() { return 0.7; }
  get grounded() { return false; }
  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    if (this.spawning) { this.spawnT += dt; if (this.spawnT >= 0.5) this.spawning = false; }
    this.knock.set(0, 0, 0);
    this.crystal.rotation.y += dt * 2;
    this.crystal.position.y = (this.ward ? 1.4 : 2.2) + Math.sin(time * 3) * 0.1;
    if (this.ward) {
      if (!this.ward.dead) {
        this.ward.invulnT = Math.max(this.ward.invulnT || 0, 0.3);
        if (Math.random() < 0.5) emit(this.pos.clone().setY(1.4).lerp(this.ward.pos.clone().setY(2), Math.random()), { frame: F.glow, color: 0xc8a0ff, size: 0.35, size2: 0, life: 0.3 });
      }
    } else {
      for (const e of ctx.enemies) if (e !== this && e.alive && !(e instanceof Totem) && e.pos.distanceTo(this.pos) < 9) e.totemBuff = 0.3;
      if (Math.random() < 0.3) emit(this.pos.clone().setY(2.2), { frame: F.glow, color: 0xff6a4a, size: 0.6, size2: 0, life: 0.5, vel: new THREE.Vector3(0, 1, 0) });
    }
    this.aura.material.opacity = 0.25 + Math.sin(time * 4) * 0.1;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.applyTint(time);
    return false;
  }
  die() {
    this.scene.remove(this.aura);
    if (!this.dead) {
      explosion(this.pos, 2.2, this.ward ? 0xb070ff : 0xff5a3a, { smoke: false, scorch: false });
      if (this.ward) damageNumber(this.pos, 'Pha lê vỡ!', 'react shatter');
    }
    super.die();
  }
}
