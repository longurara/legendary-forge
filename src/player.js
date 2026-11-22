import * as THREE from 'three';
import { keys, pressed, mouse, pad } from './input.js';
import { collide } from './world.js';
import { spawnSlash, burst, addShake, addHitStop, damageNumber, spawnRing, spawnBolt, smoke, flash, hitSpark, emit, F } from './fx.js';
import { TYPES, RARITY, makeWeapon, buildWeaponMesh, buildHeldWeapon, slashColor, applyAffixes } from './weapons.js';
import { onIce } from './hazards.js';
import { ctx, dealDamage, spawnOrb, spawnBoomerang, spawnSwordWave, spawnFirePatch, scheduleBomb, aoe } from './combat.js';
import { models, fitModel, Animator } from './models.js';
import { play } from './audio.js';
import { baseStats } from './perks.js';
import { charById } from './content.js';
import { castUltimate } from './abilities.js';

const SPEED = 6.5;
const DASH_SPEED = 22;
const DASH_TIME = 0.14;
export const DASH_COOLDOWN = 0.7;
const COMBO_WINDOW = 0.45;
const ELS = ['fire', 'ice', 'lightning', 'blood'];

// Hồi chiêu kỹ năng chuột phải theo loại vũ khí
export const SPECIALS = {
  sword: { name: 'Đỡ Đòn', icon: 'x_shield-bash', cd: 2.5 },
  axe: { name: 'Ném Rìu', icon: 'x_boomerang', cd: 3.5 },
  greatsword: { name: 'Tích Lực', icon: 'x_charged', cd: 1.4 },
  staff: { name: 'Cầu Phép Lớn', icon: 'x_crystal-ball', cd: 3.0 },
};

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.charId = null;

    // Trục xoay vũ khí cho chế độ không có animation
    this.pivot = new THREE.Group();
    this.pivot.position.y = 0.9;
    this.root.add(this.pivot);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.65, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcf6b, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.3, 3),
      new THREE.MeshBasicMaterial({ color: 0xffcf6b, transparent: true, opacity: 0.6 }),
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.03, 0.85);
    this.root.add(ring, arrow);

    // Quả cầu hộ mệnh (di vật)
    this.orbs = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
      m.visible = false;
      scene.add(m);
      return m;
    });
    this.orbHit = new Map();

    this.setCharacter('knight');
    this.reset();
  }

  // ---------- Nhân vật ----------
  setCharacter(id) {
    if (this.charId === id) return;
    this.charId = id;
    this.char = charById(id);
    this.model.clear();
    this.anim = null; this.hand = null; this.shield = null; this.held = null;
    const entry = models[this.char.model] || models.player;
    this.animated = !!entry;
    if (entry) {
      const fitted = fitModel(entry, 1.9, 'ground');
      this.model.add(fitted);
      this.anim = new Animator(fitted);
      this.hand = fitted.getObjectByName('handslotr');
      this.shield = this.char.shield ? fitted.getObjectByName(this.char.shield) : null;
      for (const n of this.char.gear) { const o = fitted.getObjectByName(n); if (o) o.visible = false; }
      if (this.shield) this.shield.visible = false;
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3d6fa8 }));
      body.position.y = 0.72;
      this.model.add(body);
    }
  }

  reset() {
    this.pos = new THREE.Vector3(0, 0, 3);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI;
    const up = (this.meta && this.meta.up) || {};
    const curses = this.curses || [];
    // base: chỉ số gốc + thẻ năng lực trong lượt. stats: base + nhân vật + di vật + phụ tố vũ khí (recalc)
    this.base = baseStats();
    this.base.dmg += (up.dmg || 0) * 0.06;
    this.perkLv = {};
    this.relics = [];
    this.level = 1;
    this.xp = 0;
    this.regenT = 0;
    this.maxHp = this.char.hp + (up.hp || 0) * 10 - (curses.includes('fragile') ? 30 : 0);
    this.hp = this.maxHp;
    this.dead = false;
    this.revived = false;
    this.iframes = 0;
    this.shieldHp = 0;
    this.dashTime = 0;
    this.dashCd = 0;
    this.dashDir = new THREE.Vector3();
    this.dodgeWindow = 0;
    this.attack = null;
    this.attackCd = 0;
    this.comboIdx = 0;
    this.comboTimer = 0;
    this.queued = false;
    this.lunge = 0;
    this.walkT = 0;
    this.animLock = 0;
    this.rage = 0;
    this.specialCd = 0;
    this.parryT = 0;
    this.charging = false;
    this.chargeT = 0;
    this.boomerangOut = false;
    this.slowmoT = 0;
    this.nextCrit = false;
    this.hitCount = 0;
    this.leechAcc = 0;
    this.relicT = { frost: 0, quiver: 0, ember: 0 };
    const startLv = up.start || 0;
    const wType = this.char.weapon;
    this.weapons = [startLv ? makeWeapon(wType, ELS[Math.floor(Math.random() * 4)], startLv) : makeWeapon(wType)];
    this.slot = 0;
    this.onWeaponsChanged = null;
    this.recalc();
    this.dashStock = this.stats.dashCharges;
    this.equip(0);
    this.root.visible = true;
    this.model.visible = true;
    if (this.anim) this.anim.play('Idle', { fade: 0 });
    this.root.position.copy(this.pos);
  }

  // Tính lại chỉ số thực tế
  recalc() {
    const s = { ...this.base };
    const m = this.char.mods || {};
    s.dmg += m.dmg || 0; s.rageGain += m.rageGain || 0; s.ultPower += m.ultPower || 0; s.bounce += m.bounce || 0;
    s.dashCharges += m.dashCharges || 0; s.crit += m.crit || 0; s.move += m.move || 0; s.parryHeal += m.parryHeal || 0;
    if (m.parryCd) s.parryCd *= m.parryCd;
    const has = (id) => this.relics && this.relics.includes(id);
    if (has('boots')) s.dashCharges += 1;
    if (has('eagle')) { s.crit += 0.05; s.critMult = 2.5; }
    if (has('rune')) s.rageGain += 0.5;
    if (has('fang')) s.leech += 0.04;
    if (this.weapon) applyAffixes(s, this.weapon);
    this.stats = s;
    for (const o of this.orbs) o.visible = has('orbit');
  }

  hasRelic(id) { return this.relics.includes(id); }
  addRelic(id) { if (!this.relics.includes(id)) { this.relics.push(id); this.recalc(); } }

  get radius() { return 0.45; }
  get dashCdMax() { return DASH_COOLDOWN * this.stats.dashCd; }
  get weapon() { return this.weapons && this.weapons[this.slot]; }
  get specialCdMax() {
    const sp = SPECIALS[this.weapon.type];
    return sp.cd * (this.weapon.type === 'sword' ? this.stats.parryCd : 1);
  }

  equip(slot) {
    this.slot = slot;
    this.attack = null;
    this.comboIdx = 0;
    this.charging = false;
    const T = TYPES[this.weapon.type];
    this.pivot.clear();
    if (this.held) { this.held.parent?.remove(this.held); this.held = null; }
    if (this.animated && this.hand) {
      this.held = buildHeldWeapon(this.weapon);
      if (this.held) this.hand.add(this.held);
      if (this.shield) this.shield.visible = !!T.shield;
    }
    if (!this.held) {
      this.pivot.add(buildWeaponMesh(this.weapon));
      this.pivot.rotation.y = T.rest;
      this.pivot.position.z = 0;
    }
    this.recalc();
    if (this.onWeaponsChanged) this.onWeaponsChanged();
  }

  pickUp(w) {
    if (this.weapons.length < 2) {
      this.weapons.push(w);
      this.equip(this.weapons.length - 1);
      return null;
    }
    const old = this.weapons[this.slot];
    this.weapons[this.slot] = w;
    this.equip(this.slot);
    return old;
  }

  setWeapons(list, slot = 0) {
    this.weapons = list;
    this.equip(slot);
  }

  heal(n) {
    if (this.dead || this.hp >= this.maxHp || n <= 0) return;
    if (ctx.noHeal) return;                     // lời nguyền / chế độ không hồi máu
    this.hp = Math.min(this.maxHp, this.hp + n);
    damageNumber(this.pos, '+' + n, 'heal');
    if (n >= 5) play('heal');
  }

  gainRage(n) { this.rage = Math.min(100, this.rage + n * this.stats.rageGain); }

  playOnce(name, duration, speed) {
    if (!this.anim) return;
    const a = this.anim.action(name);
    if (!a) return;
    const s = speed ?? a.getClip().duration / duration;
    this.anim.play(name, { once: true, fade: 0.06, speed: s });
    this.animLock = duration;
  }

  // ---------- Bị đánh: đỡ đòn, né hoàn hảo, khiên ảo, hồi sinh ----------
  hurt(dmg) {
    if (this.dead || this.god) return false;
    dmg = Math.max(1, Math.round(dmg * (ctx.enemyDmgMul || 1)));
    if (this.parryT > 0) { this.onParry(); return false; }
    if (this.dashTime > 0 || this.dodgeWindow > 0) {
      if (!this.perfectUsed) this.onPerfectDodge();
      return false;
    }
    if (this.iframes > 0) return false;
    if (this.shieldHp > 0) {
      const a = Math.min(this.shieldHp, dmg);
      this.shieldHp -= a; dmg -= a;
      burst(this.pos.clone().setY(1), 0xffd060, 8, { speed: 4, size: 0.12 });
      if (dmg <= 0) { this.iframes = 0.4; damageNumber(this.pos, 'Chặn', 'burn'); return false; }
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = 0.8;
    this.gainRage(8);
    addShake(0.5);
    addHitStop(0.08);
    burst(this.pos.clone().setY(1), 0xff4a3a, 12, { speed: 5 });
    hitSpark(this.pos.clone().setY(1), 0xff3a2a, true);
    if (this.hasRelic('frostheart') && this.relicT.frost <= 0) {
      this.relicT.frost = 6;
      spawnRing(this.scene, this.pos, 5, 0x8fe0ff, 0.45);
      play('freeze', { at: this.pos });
      for (const e of ctx.enemies) if (e.alive && e.pos.distanceTo(this.pos) < 5) { e.frozenT = 2; }
    }
    if (this.hp <= 0 && this.stats.revive && !this.revived) {
      this.revived = true;
      this.base.revive = 0; this.recalc();
      this.hp = Math.round(this.maxHp * 0.5);
      this.iframes = 2;
      spawnRing(this.scene, this.pos, 6, 0xffe2a0, 0.7);
      burst(this.pos.clone().setY(1), 0xffe2a0, 40, { speed: 8, size: 0.2 });
      damageNumber(this.pos, 'Bất Tử!', 'react ult');
      play('forged');
      aoe(this.pos, 6, 30, { element: 'none', element2: null }, 18);
      return true;
    }
    play(this.hp <= 0 ? 'playerDie' : 'playerHurt');
    if (this.hp <= 0) {
      this.dead = true;
      this.attack = null;
      if (this.anim) { this.model.visible = true; this.anim.play('Death_A', { once: true, fade: 0.1 }); }
      else this.root.visible = false;
      burst(this.pos.clone().setY(0.8), 0x9fb6d8, 30, { speed: 8, size: 0.2 });
    } else if (!this.attack) {
      this.playOnce('Hit_A', 0.3);
    }
    return true;
  }

  onPerfectDodge() {
    this.perfectUsed = true;
    this.slowmoT = 1.1;
    this.nextCrit = true;
    damageNumber(this.pos, 'Né Hoàn Hảo!', 'react perfect');
    flash(this.pos.clone().setY(1), 0x9fd4ff, 4, 0.25);
    spawnRing(this.scene, this.pos, 4, 0x9fd4ff, 0.5);
    play('freeze', { rate: 1.7, vol: 0.7 });
    this.gainRage(15);
    if (ctx.onPerfect) ctx.onPerfect();
  }

  onParry() {
    this.parryT = 0;
    this.specialCd = Math.min(this.specialCd, 0.3);
    this.slowmoT = Math.max(this.slowmoT, 0.4);
    this.iframes = 0.4;
    this.playOnce('Block_Attack', 0.45);
    spawnRing(this.scene, this.pos, 3, 0xffe2a0, 0.35);
    burst(this.pos.clone().setY(1.1), 0xffe2a0, 20, { speed: 8, size: 0.14 });
    hitSpark(this.pos.clone().setY(1.1).addScaledVector(this.aimDir(), 0.7), 0xffd060, true);
    play('hammer', { rate: 1.3 });
    addShake(0.35);
    damageNumber(this.pos, 'Đỡ Đòn!', 'react perfect');
    const mul = RARITY[this.weapon.rarity].mul * this.stats.dmg;
    aoe(this.pos, 3, Math.round(25 * mul), this.weapon, 12, { barrels: true });
    if (this.stats.parryHeal) this.heal(this.stats.parryHeal);
    this.gainRage(12);
    if (ctx.onParry) ctx.onParry();
  }

  aimDir() {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  rollCrit() {
    if (this.nextCrit) { this.nextCrit = false; return true; }
    return Math.random() < this.stats.crit;
  }

  dmgMul() {
    let mul = RARITY[this.weapon.rarity].mul * this.stats.dmg;
    if (this.hasRelic('horn')) mul *= 1 + 0.5 * (1 - this.hp / this.maxHp);
    return mul;
  }

  startAttack() {
    const w = this.weapon;
    const T = TYPES[w.type];
    const spd = this.stats.atk;
    if (T.ranged) {
      this.attack = { t: 0, dur: 0.22 / spd, hitAt: 0.12 / spd, ranged: true };
      this.attackCd = T.shot.cooldown / spd;
      this.playOnce(T.anim, 0.38 / spd);
      return;
    }
    const c = T.combo[this.comboIdx % T.combo.length];
    const dur = c.dur / spd;
    this.attack = { ...c, dur, range: c.range * this.stats.range, t: 0, hitAt: this.animated ? dur * 0.45 : 0, hit: false, big: !!c.big };
    this.playOnce(c.anim, dur * 1.35);
    this.comboIdx = (this.comboIdx + 1) % T.combo.length;
  }

  // Áp sát thương cho 1 quái từ đòn của người chơi (dùng chung cho đòn thường và kỹ năng)
  strike(e, baseDmg, dir, kb, big) {
    const crit = this.rollCrit();
    let dmg = Math.round(baseDmg * (0.9 + Math.random() * 0.2) * (crit ? this.stats.critMult : 1));
    const dealt = dealDamage(e, dmg, this.weapon, dir, kb, big || crit);
    this.gainRage(dealt * 0.35);
    if (this.stats.leech) {
      this.leechAcc += dealt * this.stats.leech;
      if (this.leechAcc >= 1) { const h = Math.floor(this.leechAcc); this.leechAcc -= h; this.heal(h); }
    }
    if (this.stats.chainChance && Math.random() < this.stats.chainChance) {
      dealDamage(e, Math.max(1, Math.round(dmg * 0.3)), { ...this.weapon, element: 'lightning', element2: null }, null, 0, false);
    }
    if (this.stats.execute && e.alive && !e.isBoss && e.hp < (e.maxHpEff || e.hp) * this.stats.execute) {
      damageNumber(e.pos, 'Kết Liễu', 'react ult');
      e.takeHit(e.hp + 1, dir, kb, true);
    }
    if (crit && this.stats.storm) spawnSwordWave(this.pos.clone().addScaledVector(dir, 0.8), this.aimDir(), this.weapon, Math.round(dmg * 0.5));
    // Chuông Bạc: mỗi đòn trúng thứ 10 gọi sét
    if (this.hasRelic('bell') && ++this.hitCount % 10 === 0 && e.alive) {
      spawnBolt(this.scene, e.pos.clone().setY(9), e.pos.clone().setY(0.5), 0xfff07a);
      play('zap', { at: e.pos });
      dealDamage(e, Math.round(40 * this.stats.dmg), { element: 'lightning', element2: null }, null, 0, true, false);
    }
    return dealt;
  }

  resolveHit(enemies) {
    const a = this.attack;
    const w = this.weapon;
    const T = TYPES[w.type];
    const mul = this.dmgMul();
    if (a.ranged) {
      const s = T.shot;
      const dir = this.aimDir();
      const origin = this.pos.clone().addScaledVector(dir, 1.2).setY(1.0);
      const crit = this.rollCrit();
      spawnOrb(origin, dir, w, Math.round(s.dmg * mul * (crit ? this.stats.critMult : 1)), s.splash, s.speed * this.stats.range, { bounces: this.stats.bounce });
      this.gainRage(3);
      play('cast');
      addShake(0.05);
      return;
    }
    this.lunge = a.lunge;
    play('swing', { rate: w.type === 'sword' ? 1 : 0.8 });
    spawnSlash(this.scene, this.pos, this.facing, a.arc, a.range, slashColor(w), !a.thrust && a.from < a.to);
    let hitAny = false;
    for (const e of enemies) {
      if (!e.alive || e.spawning) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > a.range + e.radius) continue;
      if (a.arc < Math.PI * 2) {
        let diff = Math.atan2(dx, dz) - this.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const tol = Math.atan2(e.radius, Math.max(dist, 0.1));
        if (Math.abs(diff) > a.arc / 2 + tol) continue;
      }
      this.strike(e, a.dmg * mul, new THREE.Vector3(dx, 0, dz).normalize(), a.kb, a.big);
      hitAny = true;
    }
    this.hitBarrels(a.range, a.arc);
    if (a.big) {
      if (this.stats.swordWave) spawnSwordWave(this.pos.clone().addScaledVector(this.aimDir(), 0.8), this.aimDir(), w, Math.round(a.dmg * mul * 0.6));
      if (this.stats.titan) {
        spawnRing(this.scene, this.pos, 3.2, 0xffcf4a, 0.35);
        aoe(this.pos, 3.2, Math.round(a.dmg * mul * 0.4), { element: 'none', element2: null }, 10);
      }
    }
    if (hitAny) { addShake(a.shake); addHitStop(a.stop); play(a.big ? 'hitHeavy' : 'hit'); } else addShake(0.04);
  }

  hitBarrels(range, arc) {
    for (const b of ctx.barrels) {
      if (!b.alive) continue;
      const dx = b.pos.x - this.pos.x, dz = b.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) > range + 0.6) continue;
      let diff = Math.atan2(dx, dz) - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (arc >= Math.PI * 2 || Math.abs(diff) <= arc / 2 + 0.3) b.hit(10);
    }
  }

  // ---------- Kỹ năng chuột phải ----------
  useSpecial(enemies) {
    const w = this.weapon;
    const mul = this.dmgMul();
    if (w.type === 'sword') {
      this.parryT = 0.38;
      this.specialCd = this.specialCdMax;
      this.playOnce('Block', 0.4, 2);
      play('swap', { rate: 1.3 });
    } else if (w.type === 'axe') {
      if (this.boomerangOut) return;
      this.boomerangOut = true;
      spawnBoomerang(this, this.aimDir(), w, Math.round(18 * mul));
      this.specialCd = this.specialCdMax;
      this.playOnce('Throw', 0.35);
      play('swing', { rate: 0.7 });
    } else if (w.type === 'staff') {
      const dir = this.aimDir();
      spawnOrb(this.pos.clone().addScaledVector(dir, 1.3).setY(1.1), dir, w, Math.round(32 * mul), 0, 10, { big: true });
      this.specialCd = this.specialCdMax;
      this.playOnce('Spellcast_Long', 0.5, 2.5);
      play('cast', { rate: 0.7 });
    } else if (w.type === 'greatsword') {
      this.charging = true;
      this.chargeT = 0;
    }
    void enemies;
  }

  releaseCharge(enemies) {
    this.charging = false;
    const k = Math.min(1, this.chargeT / 1.2);
    const mul = this.dmgMul();
    const range = 4.6 * this.stats.range, arc = 2.4;
    this.specialCd = this.specialCdMax;
    this.playOnce('2H_Melee_Attack_Slice', 0.45);
    spawnSlash(this.scene, this.pos, this.facing, arc, range, slashColor(this.weapon), false);
    play(k > 0.8 ? 'hitHeavy' : 'swing', { rate: 0.7 });
    addShake(0.2 + k * 0.5);
    this.lunge = 6 + k * 6;
    for (const e of enemies) {
      if (!e.alive || e.spawning) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      let diff = Math.atan2(dx, dz) - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > arc / 2 + 0.2) continue;
      this.strike(e, (20 + 45 * k) * mul, new THREE.Vector3(dx, 0, dz).normalize(), 8 + 14 * k, k > 0.8);
    }
    this.hitBarrels(range, arc);
    if (k > 0.95) { addHitStop(0.1); spawnSwordWave(this.pos.clone().addScaledVector(this.aimDir(), 1), this.aimDir(), this.weapon, Math.round(30 * mul), 1.4); }
  }

  // ---------- Di vật chạy theo thời gian ----------
  updateRelics(dt, enemies, time) {
    for (const k in this.relicT) this.relicT[k] = Math.max(0, this.relicT[k] - dt);
    if (this.hasRelic('orbit')) {
      this.orbs.forEach((o, i) => {
        const a = time * 3 + i * Math.PI;
        o.position.set(this.pos.x + Math.cos(a) * 1.7, 1.0, this.pos.z + Math.sin(a) * 1.7);
        for (const e of enemies) {
          if (!e.alive || e.spawning) continue;
          if (Math.hypot(e.pos.x - o.position.x, e.pos.z - o.position.z) < e.radius + 0.35) {
            const last = this.orbHit.get(e) || 0;
            if (time - last > 0.5) { this.orbHit.set(e, time); dealDamage(e, Math.round(12 * this.stats.dmg), { element: 'none', element2: null }, null, 0, false, false); }
          }
        }
      });
    }
    if (this.hasRelic('quiver') && this.relicT.quiver <= 0) {
      const t = enemies.filter((e) => e.alive && !e.spawning && e.pos.distanceTo(this.pos) < 12).sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos))[0];
      if (t) {
        this.relicT.quiver = 2.5;
        const dir = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
        spawnOrb(this.pos.clone().setY(1.2), dir, { element: 'none', element2: null, type: 'staff' }, Math.round(14 * this.stats.dmg), 0, 20);
      }
    }
  }

  update(dt, aim, enemies, time = 0) {
    if (this.anim) this.anim.update(dt);
    if (this.dead) return;
    this.iframes = Math.max(0, this.iframes - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.dodgeWindow = Math.max(0, this.dodgeWindow - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    // Lướt: tích nhiều lần (Giày Gió, Sát Thủ, Bóng Ma)
    if (this.dashStock < this.stats.dashCharges) {
      this.dashCd = Math.max(0, this.dashCd - dt);
      if (this.dashCd <= 0) { this.dashStock++; if (this.dashStock < this.stats.dashCharges) this.dashCd = this.dashCdMax; }
    } else { this.dashStock = this.stats.dashCharges; this.dashCd = 0; }
    if (this.stats.regen) {
      this.regenT += dt;
      if (this.regenT >= 2) { this.regenT = 0; if (this.hp < this.maxHp && !ctx.noHeal) this.hp = Math.min(this.maxHp, this.hp + this.stats.regen); }
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.animLock = Math.max(0, this.animLock - dt);
    this.updateRelics(dt, enemies, time);
    const T = TYPES[this.weapon.type];

    // Hướng ngắm: chuột hoặc cần phải tay cầm
    const canTurn = !this.attack || this.attack.ranged || this.attack.t < (this.attack.hitAt || 0);
    if (canTurn) {
      if (pad.active && pad.aim) this.facing = Math.atan2(pad.aim.x, pad.aim.z);
      else {
        const ax = aim.x - this.pos.x, az = aim.z - this.pos.z;
        if (Math.hypot(ax, az) > 0.2) this.facing = Math.atan2(ax, az);
      }
    }

    const input = new THREE.Vector3(
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), 0,
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
    );
    if (pad.active && Math.hypot(pad.move.x, pad.move.z) > 0) input.set(pad.move.x, 0, pad.move.z);
    if (input.lengthSq() > 1) input.normalize();

    if (pressed.has('KeyQ') && this.weapons.length > 1) {
      this.equip(1 - this.slot);
      play('swap');
      burst(this.pos.clone().setY(1), 0xffcf6b, 8, { speed: 3, size: 0.1 });
    }

    // Lướt
    if (pressed.has('Space') && this.dashStock > 0) {
      if (this.dashStock === this.stats.dashCharges) this.dashCd = this.dashCdMax;
      this.dashStock--;
      this.dashDir.copy(input.lengthSq() > 0.01 ? input.clone().normalize() : this.aimDir());
      this.dashTime = DASH_TIME;
      this.dodgeWindow = DASH_TIME + 0.12;
      this.perfectUsed = false;
      this.dashHit = new Set();
      this.dashStart = this.pos.clone();
      this.attack = null;
      if (this.charging) this.charging = false;
      this.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
      this.playOnce('Dodge_Forward', 0.35);
      play('dash');
      burst(this.pos.clone().setY(0.2), 0x9fb6d8, 8, { speed: 3, up: 1, size: 0.18, life: 0.35 });
      smoke(this.pos.clone().setY(0.15), { count: 4, color: 0x6a5e52, size: 0.6, life: 0.7, speed: 2, rise: 0.3, alpha: 0.4 });
      if (ctx.onDash) ctx.onDash();
    }

    // Tuyệt kỹ
    if (pressed.has('KeyR') && this.rage >= 100) {
      this.rage = 0;
      this.playOnce('Spellcast_Raise', 0.6, 1.6);
      castUltimate(this);
    }

    // Kỹ năng chuột phải
    const rightDown = mouse.rdown || pad.special;
    if (mouse.rclicked && this.specialCd <= 0 && !this.attack && this.dashTime <= 0 && !this.charging) this.useSpecial(enemies);
    if (this.charging) {
      this.chargeT += dt;
      if (Math.random() < 0.5) burst(this.pos.clone().setY(1.2), this.chargeT >= 1.2 ? 0xffe2a0 : 0xffa040, 1, { speed: 2, up: 1, gravity: 0, life: 0.3, size: 0.12 });
      if (this.anim && this.animLock <= 0) this.anim.play('2H_Melee_Idle', { fade: 0.1 });
      if (!rightDown || mouse.rreleased) this.releaseCharge(enemies);
    }

    // Tấn công
    const attackHeld = mouse.down || pad.attack;
    if (mouse.clicked && this.attack && !this.attack.ranged) this.queued = true;
    if ((mouse.clicked || attackHeld || this.queued) && !this.attack && this.dashTime <= 0 && this.attackCd <= 0 && !this.charging) {
      this.queued = false;
      if (this.comboTimer <= 0) this.comboIdx = 0;
      this.startAttack();
    }

    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      if (!a.hit && a.t >= a.hitAt) { a.hit = true; this.resolveHit(enemies); }
      const k = Math.min(1, a.t / a.dur);
      if (!this.held) {
        if (a.ranged) this.pivot.position.z = -0.25 * (1 - k);
        else if (a.thrust) { this.pivot.rotation.y = 0; this.pivot.position.z = Math.sin(k * Math.PI) * 1.0; }
        else this.pivot.rotation.y = a.from + (a.to - a.from) * (1 - Math.pow(1 - k, 3));
      }
      if (k >= 1) {
        this.attack = null;
        this.comboTimer = COMBO_WINDOW;
        this.pivot.position.z = 0;
      }
    } else if (!this.held) {
      let r = this.pivot.rotation.y;
      r = Math.atan2(Math.sin(r), Math.cos(r));
      this.pivot.rotation.y = r + (T.rest - r) * Math.min(1, dt * 10);
    }
    if (!this.attack && this.comboTimer <= 0) this.comboIdx = 0;
    if (this.held) this.held.visible = !this.boomerangOut;

    // Di chuyển
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vel.copy(this.dashDir).multiplyScalar(DASH_SPEED);
      if (this.stats.dashStrike) {
        for (const e of enemies) {
          if (!e.alive || e.spawning || this.dashHit.has(e)) continue;
          if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < e.radius + 0.9) {
            this.dashHit.add(e);
            dealDamage(e, Math.round(this.stats.dashStrike * this.stats.dmg), this.weapon, this.dashDir.clone(), 5, false);
          }
        }
      }
      if (this.hasRelic('ember')) {
        this.relicT.ember -= dt;
        if (this.relicT.ember <= 0) { this.relicT.ember = 0.05; spawnFirePatch(this.pos, 1.0, 2.5, 16); }
      }
      if (this.dashTime <= 0 && this.stats.phantom && this.dashStart) {
        scheduleBomb(this.dashStart, 0.5, 2.2, Math.round(25 * this.stats.dmg), 0, 0x9fb6ff);
      }
      // Vệt lướt: dải sáng theo thân + bóng mờ
      emit(this.pos.clone().setY(0.9), { frame: F.glow, color: 0x6fc3ff, size: 1.5, size2: 0.4, life: 0.25, alpha: 0.45 });
      if (Math.random() < 0.6) burst(this.pos.clone().setY(0.6), 0x6fc3ff, 2, { speed: 0.5, up: 0.5, gravity: 0, life: 0.25, size: 0.25 });
    } else {
      const slow = this.charging ? 0.4 : this.attack && !this.attack.ranged ? 0.35 : (T.ranged && attackHeld ? 0.75 : 1);
      const want = input.clone().multiplyScalar(SPEED * this.stats.move * slow);
      if (onIce(this.pos.x, this.pos.z)) this.vel.lerp(want, Math.min(1, dt * 2.2));   // trượt trên băng
      else this.vel.copy(want);
    }
    if (this.lunge > 0) {
      this.vel.x += Math.sin(this.facing) * this.lunge;
      this.vel.z += Math.cos(this.facing) * this.lunge;
      this.lunge = Math.max(0, this.lunge - dt * 30);
    }
    this.pos.addScaledVector(this.vel, dt);
    collide(this.pos, this.radius);

    const moving = input.lengthSq() > 0.01;
    this.stepT = moving && this.dashTime <= 0 ? (this.stepT || 0) + dt : 0.22;
    if (this.stepT > 0.3) {
      this.stepT = 0; play('step');
      smoke(this.pos.clone().setY(0.08), { count: 1, color: 0x6a5e52, size: 0.35, life: 0.6, speed: 0.4, rise: 0.25, alpha: 0.3 });
    }
    if (this.anim) {
      if (this.animLock <= 0 && !this.attack && !this.charging) this.anim.play(moving ? 'Running_A' : T.idle, { fade: 0.15, speed: moving ? 1.15 : 1 });
      this.model.position.y = 0;
      this.model.rotation.x = 0;
    } else {
      this.walkT += dt * (moving ? 14 : 0);
      this.model.position.y = moving ? Math.abs(Math.sin(this.walkT)) * 0.12 : 0;
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.model.visible = this.iframes > 0 && this.parryT <= 0 ? Math.floor(this.iframes * 20) % 2 === 0 : true;
  }
}
