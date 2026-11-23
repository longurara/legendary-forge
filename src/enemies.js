import * as THREE from 'three';
import { collide } from './world.js';
import { burst, damageNumber, spawnRing, addShake, statusFx, hitSpark, explosion, smoke, flame, emit, F } from './fx.js';
import { models, fitModel, Animator } from './models.js';
import { ctx, enemyShot } from './combat.js';
import { play } from './audio.js';

const WHITE = new THREE.Color(0xffffff);
const ICE = new THREE.Color(0x7fdcff);
const FIRE = new THREE.Color(0xff5a1a);
const SHOCK = new THREE.Color(0xfff07a);
const STUN = new THREE.Color(0xffd040);
const INVULN = new THREE.Color(0xb070ff);
const shadowGeo = new THREE.CircleGeometry(0.6, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const eyeGeo = new THREE.SphereGeometry(0.085, 8, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

// ---------- Lớp chung: máu, trạng thái nguyên tố, tinh anh, thanh choáng ----------
export class Enemy {
  constructor(scene, x, z) {
    this.scene = scene;
    this.pos = new THREE.Vector3(x, 0, z);
    this.knock = new THREE.Vector3();
    this.dead = false;
    this.dying = false;
    this.spawning = true;
    this.spawnT = 0;
    this.height = 0;
    this.flash = 0;
    this.burnT = 0; this.burnDps = 0; this.burnTick = 0;
    this.slowT = 0; this.frozenT = 0; this.iceStacks = 0;
    this.shockT = 0;
    this.wetT = 0; this.blindT = 0;
    this.teleKind = null;
    this.parts = null;
    // Tinh anh (elites.js gán): tốc độ, khiên, gai, hồi máu
    this.elite = null;
    this.eliteSpeed = 1;
    this.shieldHp = 0;
    this.thorns = 0;
    this.regenPct = 0;
    // Thanh choáng (boss, tinh anh): đầy thì choáng, nhận thêm 50% sát thương
    this.poiseMax = 0;
    this.poise = 0;
    this.stunT = 0;
    this.mats = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
  }

  // Nhân bản vật liệu để mỗi con quái nháy màu riêng
  setupMaterials(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      if (o.material === eyeMat) return;
      const one = (m) => {
        const c = m.clone();
        c.userData.baseEmissive = c.emissive ? c.emissive.clone() : null;
        c.userData.baseEI = c.emissiveIntensity ?? 1;
        this.mats.push(c);
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
  }

  get alive() { return !this.dead && !this.dying; }
  get speedMul() {
    if (this.frozenT > 0 || this.stunT > 0) return 0;
    return (this.slowT > 0 ? 0.5 : 1) * this.eliteSpeed * (ctx.enemySpeed || 1) * (this.totemBuff > 0 ? 1.3 : 1);
  }
  get grounded() { return false; }
  get stunned() { return this.stunT > 0; }

  takeHit(dmg, dir, kb, crit, kind = '') {
    if (!this.alive) return 0;
    // Boss đang chuyển giai đoạn: miễn nhiễm
    if (this.invulnT > 0) { if (Math.random() < 0.3) damageNumber(this.pos, 'Miễn nhiễm', 'burn'); return 0; }
    if (this.stunT > 0) dmg = Math.round(dmg * 1.5);
    if (this.totemBuff > 0) dmg = Math.max(1, Math.round(dmg * 0.7));
    // Khiên phép hấp thụ trước
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, dmg);
      this.shieldHp -= absorbed;
      dmg -= absorbed;
      burst(this.pos.clone().setY(1), 0x6fc3ff, 6, { speed: 4, size: 0.12 });
      if (this.shieldHp <= 0 && this.shieldMesh) {
        this.group.remove(this.shieldMesh);
        this.shieldMesh.geometry?.dispose();
        this.shieldMesh.material?.dispose();
        this.shieldMesh = null;
        play('freeze', { at: this.pos, rate: 1.5 });
      }
      if (dmg <= 0) { damageNumber(this.pos, 'Chặn', 'burn'); return 0; }
    }
    this.hp -= dmg;
    if (dir && (this.flashCd || 0) <= 0) { this.flash = 0.06; this.flashCd = 0.18; }
    if (dir) {
      this.knock.copy(dir).multiplyScalar(kb / this.mass);
      if (this.stunT <= 0) this.onStagger();
      play(this.hurtSound, { at: this.pos });
      // Gai: phản lại một phần sát thương cận chiến
      if (this.thorns && ctx.player && !ctx.player.dead && this.pos.distanceTo(ctx.player.pos) < 5) {
        const back = Math.max(1, Math.round(dmg * this.thorns));
        ctx.player.hp = Math.max(1, ctx.player.hp - back);
        damageNumber(ctx.player.pos, back, 'player');
      }
    }
    // Thanh choáng
    if (this.poiseMax && this.stunT <= 0) {
      this.poise += dmg;
      if (this.poise >= this.poiseMax) {
        this.poise = 0;
        this.stunT = this.isBoss ? 3 : 2;
        this.stunId = (this.stunId || 0) + 1;
        damageNumber(this.pos, 'Choáng!', 'react stun');
        play('hitHeavy', { at: this.pos, rate: 0.7 });
        addShake(0.4);
      }
    }
    // Giai đoạn boss: tụt qua ngưỡng máu thì nổi giận
    if (this.isBoss && this.phases) {
      const max = this.maxHp || this.maxHpEff;
      const ph = this.phase || 0;
      if (ph < this.phases.length && this.hp <= max * this.phases[ph]) {
        this.phase = ph + 1;
        this.hp = Math.max(this.hp, Math.round(max * this.phases[ph]));
        this.invulnT = 1.8;
        this.timeMul = (this.timeMul || 1) + 0.18;
        this.stunT = 0; this.poise = 0;
        ctx.onBossPhase?.(this);
      }
    }
    damageNumber(this.pos, dmg, crit ? 'big' : kind);
    burst(this.pos.clone().setY(0.6), this.color, crit ? 14 : 7, { speed: 6 });
    if (dir) hitSpark(this.pos.clone().setY(0.8 * (this.giant || 1) * (this.isBoss ? 1.6 : 1)), this.color, crit);
    if (this.hp <= 0) this.kill();
    return dmg;
  }

  onStagger() {}
  kill() { this.die(); }

  // Hủy chiêu hiện tại (khi bị Cắt Chiêu hoặc Phản Xuyên — cơ chế #5)
  interruptAttack(doStun = true) {
    if (this.tele) { this.tele.done = true; this.tele = null; }
    this.teleKind = null;
    if (this.casting > 0) this.casting = 0;
    if (this.state && this.state !== 'intro') {
      if (this.isBoss) { this.state = this.state === 'wait' || this.state === 'jump' ? 'wait' : this.state === 'idle' ? 'idle' : 'recover'; this.timer = 1.2; }
      else { this.state = 'recover'; this.timer = 1.0; }
    }
    if (doStun) {
      this.stunT = Math.max(this.stunT, this.isBoss ? 2.6 : 2.2);
      this.stunId = (this.stunId || 0) + 1;
    }
  }

  // Phá bộ phận Boss (cơ chế #5)
  initBossParts(defs) {
    const baseMax = this.maxHp || this.hp || 400;
    this.parts = defs.map((d) => ({
      ...d,
      hp: Math.round(baseMax * (d.pct || 0.24)),
      maxHp: Math.round(baseMax * (d.pct || 0.24)),
      broken: false,
    }));
  }

  onPartHit(dmg, info = {}) {
    if (!this.parts || !this.parts.length || this.dead) return;
    for (const pt of this.parts) {
      if (pt.broken) continue;
      if (pt.cond && !pt.cond(info)) continue;
      pt.hp -= dmg;
      if (pt.hp <= 0) {
        pt.broken = true;
        if (pt.mesh) pt.mesh.visible = false;
        burst(this.pos.clone().setY(1.8), 0xffcf4a, 34, { speed: 11, size: 0.22, life: 0.8 });
        spawnRing(this.scene, this.pos, 4.5, 0xffcf4a, 0.5);
        addShake(0.6);
        play('explode', { at: this.pos, rate: 1.15 });
        damageNumber(this.pos, `Phá ${pt.name}!`, 'react ult');
        this.stunT = Math.max(this.stunT, 1.8);
        this.stunId = (this.stunId || 0) + 1;
        pt.onBreak?.(this);
        ctx.onPartBreak?.(this, pt);
      }
      break;
    }
  }

  isPartBroken(id) {
    return !!this.parts?.some((p) => p.id === id && p.broken);
  }

  die() {
    if (!this.dead) play(this.dieSound, { at: this.pos });
    this.dead = true;
    this.dying = false;
    burst(this.pos.clone().setY(0.6), this.color, Math.round(24 * this.mass), { speed: 9, size: 0.2 * this.mass, life: 0.7 });
    burst(this.pos.clone().setY(0.6), 0xffffff, 6, { speed: 4, size: 0.1 });
    smoke(this.pos.clone().setY(0.4), { count: 3, size: 0.7 * this.mass, color: 0x5a5048, life: 0.9, speed: 1.2, rise: 0.8, alpha: 0.45 });
    this.scene.remove(this.group);
    this.scene.remove(this.shadow);
    if (this.eliteRing) {
      this.scene.remove(this.eliteRing);
      this.eliteRing.material?.dispose();
    }
    if (this.shieldMesh) {
      this.group.remove(this.shieldMesh);
      this.shieldMesh.geometry?.dispose();
      this.shieldMesh.material?.dispose();
      this.shieldMesh = null;
    }
    if (this.label) this.label.remove();
    for (const m of this.mats) m.dispose();
  }

  updateStatus(dt) {
    statusFx(this, dt);
    this.flashCd = Math.max(0, (this.flashCd || 0) - dt);
    if (this.invulnT > 0) {
      this.invulnT -= dt;
    }
    if (this.poisonT > 0) {
      this.poisonT -= dt;
      this.poisonTick = (this.poisonTick || 0) - dt;
      if (this.poisonTick <= 0) {
        this.poisonTick = 0.5;
        const pMul = ctx.player?.stats?.permaFrost && (this.frozenT > 0 || this.slowT > 0) ? 2 : 1;
        this.takeHit(Math.max(1, Math.round((this.poisonDps || 2) * this.poisonStacks * 0.5 * pMul)), null, 0, false, 'poison');
      }
      if (this.poisonT <= 0) this.poisonStacks = 0;
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        this.takeHit(Math.max(1, Math.round(this.burnDps * 0.5)), null, 0, false, 'burn');
      }
      if (this.burnT <= 0) this.burnDps = 0;
    }
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.iceStacks = 0; }
    if (this.frozenT > 0) this.frozenT -= dt;
    if (this.shockT > 0) {
      this.shockT -= dt;
    }
    if (this.wetT > 0) {
      this.wetT -= dt;
      if (Math.random() < dt * 5) emit(this.pos.clone().setY(0.5 + Math.random() * 0.8), { frame: F.glow, color: 0x7fdcff, color2: 0x2080d0, size: 0.28, size2: 0.04, life: 0.45, vel: new THREE.Vector3(0, -0.7, 0) });
    }
    if (this.blindT > 0) {
      this.blindT -= dt;
      if (Math.random() < dt * 4) emit(this.pos.clone().setY(1.4), { smoke: true, frame: F.puff, color: 0xd8eef8, size: 0.55, size2: 0.9, life: 0.5, alpha: 0.35, vel: new THREE.Vector3(0, 0.3, 0) });
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (Math.random() < dt * 10) burst(this.pos.clone().setY(1.6 * (this.isBoss ? 2 : 1)), 0xffe060, 1, { speed: 1.5, up: 0.5, gravity: 0, life: 0.3, size: 0.12 });
    }
    if (this.eliteTick) this.eliteTick(dt);
    if (this.totemBuff > 0) { this.totemBuff -= dt; if (Math.random() < dt * 5) emit(this.pos.clone().setY(1.6), { frame: F.glow, color: 0xff6a4a, size: 0.3, size2: 0, life: 0.4, vel: new THREE.Vector3(0, 1, 0) }); }
    if (this.regenPct && this.hp < this.maxHpEff) this.hp = Math.min(this.maxHpEff, this.hp + this.maxHpEff * this.regenPct * dt);
    if (this.eliteRing) {
      this.eliteRing.position.set(this.pos.x, 0.05, this.pos.z);
      this.eliteRing.rotation.z += dt * 1.5;
    }
  }

  applyTint(time) {
    this.flash = Math.max(0, this.flash - 1 / 60);
    let col = null, ei = 0;
    if (this.flash > 0) { col = WHITE; ei = 0.48; }
    else if (this.invulnT > 0) { col = INVULN; ei = 0.35 + Math.sin(time * 12) * 0.15; }
    else if (this.stunT > 0) { col = STUN; ei = 0.5 + Math.sin(time * 16) * 0.2; }
    else if (this.frozenT > 0) { col = ICE; ei = 0.9; }
    else if (this.slowT > 0) { col = ICE; ei = 0.3; }
    else if (this.burnT > 0) { col = FIRE; ei = 0.4 + Math.sin(time * 20) * 0.2; }
    else if (this.shockT > 0) { col = SHOCK; ei = 0.3 + Math.random() * 0.3; }
    else if (this.elite) { col = this.eliteColor; ei = 0.25 + Math.sin(time * 4) * 0.1; }
    for (const m of this.mats) {
      if (!m.emissive) continue;
      if (col) { m.emissive.copy(col); m.emissiveIntensity = ei; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
    }
  }
}

// ---------- Slime ----------
const SLIME_TYPES = {
  small: { scale: 0.62, hp: 12, color: 0x8be36a, dmg: 6, hop: 2.4, wait: [0.25, 0.6], drop: 0.05, xp: 1 },
  normal: { scale: 1, hp: 30, color: 0x4fc36a, dmg: 10, hop: 2.8, wait: [0.4, 1.0], drop: 0.1, xp: 2 },
  big: { scale: 1.55, hp: 75, color: 0x2e9e78, dmg: 18, hop: 3.2, wait: [0.7, 1.3], drop: 0.3, xp: 5 },
  lava: { scale: 1.1, hp: 36, color: 0xff6a2a, dmg: 12, hop: 2.6, wait: [0.5, 1.1], drop: 0.22, xp: 3 },
  mother: { scale: 1.8, hp: 90, color: 0xa070e0, dmg: 16, hop: 2.4, wait: [0.9, 1.5], drop: 0.35, xp: 6 },
};
const slimeGeo = new THREE.SphereGeometry(0.6, 22, 16);

export class Slime extends Enemy {
  constructor(scene, x, z, type = 'normal') {
    super(scene, x, z);
    this.type = type;
    this.cfg = SLIME_TYPES[type];
    this.slimy = true;
    this.hp = this.cfg.hp;
    this.color = this.cfg.color;
    this.mass = this.cfg.scale;
    this.contactDmg = this.cfg.dmg;
    this.hurtSound = 'slimeHit';
    this.dieSound = 'slimeDie';
    this.dropChance = this.cfg.drop;
    this.xp = this.cfg.xp;
    this.height = 8;
    this.state = 'wait';
    this.timer = 0.3 + Math.random() * 0.5;
    this.hopFrom = new THREE.Vector3();
    this.hopTo = new THREE.Vector3();
    this.hopT = 0;
    this.hopDur = 0.5;
    this.squash = 0;
    this.wobble = Math.random() * 10;

    const custom = type === 'lava' ? (models.slime_lava || models.slime) : models.slime;
    this.body = new THREE.Group();
    this.anim = null;
    if (custom) {
      const fitted = fitModel(custom, 1.25, 'ground');
      this.body.add(fitted);
      this.anim = new Animator(fitted);
      this.anim.play('Slime_Idle');
      this.anim.mixer.setTime(Math.random() * 2);
      this.tintBody = !(type === 'lava' && models.slime_lava);
    } else {
      const lava = type === 'lava';
      const mat = new THREE.MeshStandardMaterial({
        color: this.color, roughness: lava ? 0.6 : 0.25, metalness: 0.05,
        transparent: !lava, opacity: 0.92, emissive: lava ? 0xff3a00 : this.color, emissiveIntensity: lava ? 0.45 : 0.12,
      });
      const ball = new THREE.Mesh(slimeGeo, mat);
      ball.position.y = 0.6;
      this.body.add(ball);
      if (lava) {
        // vỏ đá nứt trên lưng
        const crustMat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 1 });
        for (let i = 0; i < 6; i++) {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.08), crustMat);
          const a = (i / 6) * Math.PI * 2;
          rock.position.set(Math.cos(a) * 0.32, 1.0 + Math.random() * 0.08, Math.sin(a) * 0.32 - 0.05);
          this.body.add(rock);
        }
      }
      const eL = new THREE.Mesh(eyeGeo, eyeMat), eR = new THREE.Mesh(eyeGeo, eyeMat);
      eL.position.set(-0.2, 0.72, 0.52); eR.position.set(0.2, 0.72, 0.52);
      this.body.add(eL, eR);
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
    if (type === 'lava' && !this.tintBody) {
      // Model slime_lava từ Blender: giảm độ phát sáng cho hợp ánh sáng phòng
      for (const m of this.mats) {
        if (!m.emissive || m.emissiveIntensity <= 0) continue;
        const isEmber = m.name.startsWith('Ember');
        m.emissiveIntensity = isEmber ? 1.5 : 0.35;
        if (!isEmber) m.color.setHex(0xd8401a);
        m.userData.baseEI = m.emissiveIntensity;
      }
    }
    if (this.tintBody) {
      // Dùng chung một model slime, tô màu theo loại
      for (const m of this.mats) {
        if (m.name !== 'Body') continue;
        m.color.setHex(this.color);
        if (type === 'lava') { m.emissive.setHex(0xff3a00); m.emissiveIntensity = 0.55; }
        else { m.emissive.setHex(this.color); m.emissiveIntensity = 0.08; }
        m.userData.baseEmissive = m.emissive.clone();
        m.userData.baseEI = m.emissiveIntensity;
      }
    }
  }

  get radius() { return 0.6 * this.cfg.scale; }
  get grounded() { return !this.spawning && this.height < 0.5 * this.cfg.scale; }

  onStagger() {
    this.state = 'stun';
    this.timer = 0.3;
  }

  kill() {
    if (this.type !== 'lava') return this.die();
    // Slime dung nham: phồng lên rồi nổ
    this.dying = true;
    this.dyingT = 0.55;
    play('ignite', { at: this.pos });
    spawnRing(this.scene, this.pos, 2.4, 0xff5a1a, 0.55);
  }

  explode() {
    const R = 2.4;
    spawnRing(this.scene, this.pos, R, 0xffa040, 0.4);
    play('explode', { at: this.pos });
    explosion(this.pos, R, 0xff6a1a);
    addShake(0.45);
    const p = ctx.player;
    if (!p.dead && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < R + p.radius) {
      if (p.hurt(14)) damageNumber(p.pos, 14, 'player');
    }
    for (const e of ctx.enemies) {
      if (e === this || !e.alive || e.spawning) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < R + e.radius) {
        const dir = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
        e.takeHit(20, dir, 8, false, 'burn');
        e.burnT = 2; e.burnDps = Math.max(e.burnDps, 6);
      }
    }
    this.die();
  }

  update(dt, player, time) {
    if (this.dead) return false;
    let landed = false;
    const s = this.cfg.scale;

    if (this.dying) {
      this.dyingT -= dt;
      const pulse = 1 + (0.55 - this.dyingT) * 0.8 + Math.sin(time * 40) * 0.05;
      this.group.scale.set(s * pulse, s * pulse * 0.9, s * pulse);
      this.flash = Math.sin(time * 30) > 0 ? 0.05 : 0;
      this.applyTint(time);
      if (this.dyingT <= 0) this.explode();
      return false;
    }

    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    this.wobble += bdt * 6;
    // Slime mẹ: cứ 4 giây đẻ 1 slime con
    if (this.type === 'mother' && !this.spawning) {
      this.birthT = (this.birthT ?? 3) - bdt;
      if (this.birthT <= 0) {
        this.birthT = 4;
        const kid = new Slime(this.scene, this.pos.x + (Math.random() - 0.5) * 2, this.pos.z + (Math.random() - 0.5) * 2, 'small');
        kid.spawning = false; kid.height = 0; kid.timer = 0.4;
        if (ctx.spawnEnemy) ctx.spawnEnemy(kid);
        this.squash = 0.6;
        play('slimeLand', { at: this.pos, rate: 0.8 });
      }
    }
    if (this.anim) {
      this.anim.play(this.state === 'hop' ? 'Slime_Walk' : 'Slime_Idle', { speed: this.state === 'hop' ? 1.6 : 1 });
      this.anim.update(bdt);
    }

    if (this.spawning) {
      this.spawnT += dt;
      this.height = Math.max(0, 8 - Math.max(0, this.spawnT) ** 2 * 30);
      if (this.height <= 0) {
        this.spawning = false; landed = true; this.squash = 0.5;
        play(this.type === 'big' ? 'bigLand' : 'slimeLand', { at: this.pos });
      }
    } else if (this.state === 'wait' || this.state === 'stun') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.state = 'hop';
        this.hopT = 0;
        this.hopFrom.copy(this.pos);
        const dir = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
        const d = dir.length();
        dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.6);
        this.hopTo.copy(this.pos).addScaledVector(dir, Math.min(d + 0.3, this.cfg.hop));
        this.hopDur = 0.45 + s * 0.12;
      }
    } else if (this.state === 'hop') {
      this.hopT += bdt / this.hopDur;
      const k = Math.min(1, this.hopT);
      this.pos.x = this.hopFrom.x + (this.hopTo.x - this.hopFrom.x) * k;
      this.pos.z = this.hopFrom.z + (this.hopTo.z - this.hopFrom.z) * k;
      this.height = Math.sin(k * Math.PI) * 1.3 * s;
      if (k >= 1) {
        this.state = 'wait';
        const [a, b] = this.cfg.wait;
        this.timer = a + Math.random() * (b - a);
        this.height = 0;
        landed = true;
        this.squash = 0.45;
        if (this.type === 'big') play('bigLand', { at: this.pos, vol: 0.6 });
        if (this.type === 'lava') { burst(this.pos.clone().setY(0.1), 0xff7a2a, 5, { speed: 3, up: 2, size: 0.1 }); flame(this.pos.clone().setY(0.2), { count: 3, size: 0.6, spread: 0.6 }); }
      }
    }

    if (this.knock.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.knock, dt);
      if (this.state === 'hop') { this.hopFrom.addScaledVector(this.knock, dt); this.hopTo.addScaledVector(this.knock, dt); }
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 9));
    }
    collide(this.pos, this.radius);

    this.squash = Math.max(0, this.squash - bdt * 2.5);
    let sy = 1, sxz = 1;
    if (this.state === 'hop') { sy = 1.2; sxz = 0.88; }
    else if (this.state === 'wait' && this.timer < 0.18) { sy = 0.75; sxz = 1.18; }
    else { const w = Math.sin(this.wobble) * 0.04; sy = 1 + w; sxz = 1 - w; }
    sy -= this.squash; sxz += this.squash * 0.8;

    this.group.position.set(this.pos.x, this.height, this.pos.z);
    this.group.scale.set(s * sxz, s * sy, s * sxz);
    if (this.speedMul > 0) this.group.rotation.y = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.shadow.scale.setScalar(s * Math.max(0.3, 1 - this.height * 0.08));
    this.applyTint(time);
    return landed;
  }
}

// ---------- Pháp sư xương: giữ khoảng cách, niệm phép bắn cầu tím ----------
// (không có model thì hiện thành hồn ma bay dựng bằng code)
export class Mage extends Enemy {
  constructor(scene, x, z) {
    super(scene, x, z);
    this.hp = 28;
    this.color = 0xb98aff;
    this.mass = 0.9;
    this.contactDmg = 0;
    this.dropChance = 0.28;
    this.hurtSound = 'mageHurt';
    this.dieSound = 'mageDie';
    this.xp = 4;
    this.shootT = 1.8 + Math.random();
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 2;
    this.bob = Math.random() * 10;
    this.casting = false;
    this.animBusy = 0;

    this.body = new THREE.Group();
    this.anim = null;
    this.walker = !!models.enemy_mage;
    if (this.walker) {
      const fitted = fitModel(models.enemy_mage, 2.0, 'ground');
      this.body.add(fitted);
      this.anim = new Animator(fitted);
      this.anim.play('Spawn_Ground_Skeletons', { once: true, fade: 0 });
      this.animBusy = 1.0;
      this.hand = fitted.getObjectByName('handslotr');
    } else {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd9c8ff, emissive: 0x8a5aff, emissiveIntensity: 0.35, transparent: true, opacity: 0.88, roughness: 0.4,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 14), mat);
      head.position.y = 0.2;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 14, 1, true), mat);
      tail.rotation.x = Math.PI;
      tail.position.y = -0.4;
      const eL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat);
      const eR = eL.clone();
      eL.position.set(-0.16, 0.28, 0.38); eR.position.set(0.16, 0.28, 0.38);
      this.body.add(head, tail, eL, eR);
    }
    // quả cầu phép tụ lại trước khi bắn
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc06bff }));
    this.core.position.set(0, this.walker ? 1.25 : 0.05, 0.55);
    this.core.scale.setScalar(this.walker ? 0.001 : 1);
    this.group.add(this.body, this.core);
    this.setupMaterials(this.body);
    if (!this.walker) this.group.scale.setScalar(0.01);
  }

  get radius() { return 0.5; }

  onStagger() {
    if (this.anim) { this.anim.play('Hit_A', { once: true, fade: 0.05, speed: 1.4 }); this.animBusy = 0.35; }
  }

  update(dt, player, time) {
    if (this.dead) return false;
    this.updateStatus(dt);
    if (this.dead) return false;
    const bdt = dt * this.speedMul;
    this.bob += bdt * 3;

    let scale = 1, moving = false;
    if (this.spawning) {
      if (this.spawnT <= 0 && this.spawnT + dt > 0) play('mageSpawn', { at: this.pos });
      this.spawnT += dt;
      const dur = this.walker ? 1.0 : 0.7;
      scale = this.walker ? 1 : Math.min(1, Math.max(0, this.spawnT) / dur);
      if (this.spawnT >= dur) this.spawning = false;
      if (this.spawnT > 0 && Math.random() < dt * 20) burst(this.pos.clone().setY(0.1), 0x6a5a4a, 1, { speed: 2, up: 3, size: 0.15 });
    } else {
      // Giữ khoảng cách ~6m, đi vòng quanh người chơi; đứng yên khi đang niệm phép
      const to = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
      const d = to.length();
      to.normalize();
      if (!this.casting) {
        const radial = d > 6.8 ? 1 : d < 5.2 ? -1 : 0;
        const perp = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafe);
        this.pos.addScaledVector(to, radial * 2.4 * bdt).addScaledVector(perp, 1.4 * bdt);
        moving = bdt > 0;
      }
      this.strafeT -= bdt;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 1.5 + Math.random() * 2; }

      // Niệm phép 0.6s rồi bắn (nếu bị Mù bởi Màn Sương thì bắn lệch hoặc tạm dừng)
      this.shootT -= bdt;
      if (this.shootT < 0.6 && !this.casting) {
        this.casting = true;
        this.teleKind = 'interrupt';
        play('mageCast', { at: this.pos });
        if (this.anim) { this.anim.play('Spellcast_Shoot', { once: true, fade: 0.1, speed: 1.2 }); this.animBusy = 0.9; }
      }
      if (this.casting) {
        const k = Math.min(1, (0.6 - this.shootT) / 0.6);
        this.core.scale.setScalar(0.2 + k * 1.6);
        if (!this.walker) scale = 1 + k * 0.25;
      }
      if (this.shootT <= 0 && !player.dead) {
        const origin = this.pos.clone().setY(1.1).addScaledVector(to, 0.7);
        // Bắn đón đầu: nhắm vào chỗ người chơi sắp tới (bị Mù trong Sương sẽ bắn lệch mạnh)
        const tLead = Math.min(1.6, d / 7) * ((ctx.floor || 1) >= 2 ? 0.85 : 0.5);
        const aimAt = player.pos.clone().addScaledVector(player.vel || new THREE.Vector3(), tLead);
        const lead = new THREE.Vector3(aimAt.x - this.pos.x, 0, aimAt.z - this.pos.z).normalize();
        if (this.blindT > 0) {
          const miss = (Math.random() - 0.5) * 1.4;
          const a = Math.atan2(lead.x, lead.z) + miss;
          lead.set(Math.sin(a), 0, Math.cos(a));
        }
        enemyShot(origin, lead, 8);
        this.shootT = 2.3 + Math.random() * 0.9;
        this.casting = false;
        this.teleKind = null;
        this.core.scale.setScalar(this.walker ? 0.001 : 1);
      }
    }

    if (this.anim) {
      this.animBusy = Math.max(0, this.animBusy - bdt);
      if (this.animBusy <= 0) this.anim.play(moving ? 'Walking_D_Skeletons' : 'Idle_Combat', { speed: moving ? 1.3 : 1 });
      this.anim.update(bdt);
    }

    if (this.knock.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    }
    collide(this.pos, this.radius);

    this.height = this.walker ? 0 : 1.0 + Math.sin(this.bob) * 0.15;
    this.group.position.set(this.pos.x, this.height, this.pos.z);
    this.group.scale.setScalar(scale);
    if (this.speedMul > 0) this.group.rotation.y = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.shadow.position.set(this.pos.x, 0.015, this.pos.z);
    this.shadow.scale.setScalar(0.8);
    this.applyTint(time);
    return false;
  }
}
