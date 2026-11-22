import * as THREE from 'three';
import { keys, pressed, mouse, pad, touch, haptic } from './input.js';
import { collide } from './world.js';
import { spawnSlash, burst, addShake, addHitStop, damageNumber, spawnRing, spawnBolt, smoke, flash, hitSpark, emit, F } from './fx.js';
import { TYPES, RARITY, makeWeapon, buildWeaponMesh, buildHeldWeapon, slashColor, applyAffixes, rollAffixes, swapWeaponForm, updateWeaponHeatVisual } from './weapons.js';
import { onIce, onWater, spawnSteamCloud, reactSurface, damagePillars } from './hazards.js';
import { ctx, dealDamage, spawnOrb, spawnBoomerang, spawnSwordWave, spawnFirePatch, spawnToxic, scheduleBomb, aoe } from './combat.js';
import { fireRunes, progressAwakening } from './runes.js';
import { flameState, flameTier, hasDynCurse, addFlame } from './corruption.js';
import { models, fitModel, Animator } from './models.js';
import { play } from './audio.js';
import { baseStats } from './perks.js';
import { charById, activeRelicSets } from './content.js';
import { castUltimate } from './abilities.js';

const SPEED = 6.5;
const DASH_SPEED = 22;
const DASH_TIME = 0.14;
export const DASH_COOLDOWN = 0.7;
const COMBO_WINDOW = 0.45;
const ELS = ['fire', 'ice', 'lightning', 'blood', 'poison', 'wind', 'holy'];

// Hồi chiêu kỹ năng chuột phải theo loại vũ khí
export const SPECIALS = {
  sword: { name: 'Đỡ Đòn', icon: 'x_shield-bash', cd: 2.5 },
  axe: { name: 'Ném Rìu', icon: 'x_boomerang', cd: 3.5 },
  greatsword: { name: 'Tích Lực', icon: 'x_charged', cd: 1.4 },
  staff: { name: 'Cầu Phép Lớn', icon: 'x_crystal-ball', cd: 3.0 },
  daggers: { name: 'Phi Dao', icon: 'x_daggers', cd: 2.2 },
  crossbow: { name: 'Tên Nổ', icon: 'x_crossbow', cd: 3.2 },
  spear: { name: 'Ném Thương', icon: 'x_arrows', cd: 2.8 },
  scythe: { name: 'Gặt Hồn', icon: 'x_death-zone', cd: 3.4 },
  hammer: { name: 'Chấn Động', icon: 'anvil', cd: 3.6 },
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
      this.handL = fitted.getObjectByName('handslotl');
      this.shield = this.char.shield ? fitted.getObjectByName(this.char.shield) : null;
      for (const n of this.char.gear) { const o = fitted.getObjectByName(n); if (o) o.visible = false; }
      if (this.shield) this.shield.visible = false;
      if (this.char.tint) {
        const tc = new THREE.Color(this.char.tint);
        fitted.traverse((o) => {
          if (o.isMesh && o.material?.color) {
            o.material = o.material.clone();
            o.material.color.lerp(tc, 0.42);
          }
        });
      }
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3d6fa8 }));
      body.position.y = 0.72;
      this.model.add(body);
    }
  }

  reset() {
    this.nextCrits = 0; this.thirdCount = 0; this.fourthCount = 0; this.sparkCount = 0;
    this.stamina = 100; this.stamDelay = 0; this.stamWarn = 0; this.postDash = 0; this.slowT = 0; this.poisonT = 0;
    this.temperedT = 0; this.idleHeatT = 0; this.runeCd = {}; this.clashSet = new Set(); this.quenchedThisDash = false;
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
    this.bonusMaxHp = 0;
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
    this.relicT = { frost: 0, quiver: 0, ember: 0, iceArmor: 0, tornado: 0 };
    const startLv = up.start || 0;
    const wType = this.char.weapon;
    // Vũ khí khởi đầu tối đa là Hiếm (cấp 2: thêm 1 phụ tố)
    this.weapons = [startLv ? makeWeapon(wType, ELS[Math.floor(Math.random() * 4)], 1, null, startLv >= 2 ? rollAffixes(1) : []) : makeWeapon(wType)];
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
    s.range += m.range || 0; s.leech += m.leech || 0;
    if (m.parryCd) s.parryCd *= m.parryCd;
    if (m.wideHeat) s.wideHeat = true;
    if (m.poiseMul) s.poiseMul = (s.poiseMul || 1) * m.poiseMul;
    if (m.smithAutoPlus) s.smithAutoPlus = true;
    if (m.necroRaise) s.necroRaise = true;
    if (m.rangerTrap) s.rangerTrap = true;
    const has = (id) => this.relics && this.relics.includes(id);
    if (has('boots')) s.dashCharges += 1;
    if (has('eagle')) { s.crit += 0.05; s.critMult = 2.5; }
    if (has('rune')) s.rageGain += 0.5;
    if (has('fang')) s.leech += 0.04;
    if (has('pact')) s.dmg += 0.4;
    if (has('glass')) { s.crit += 0.15; s.critMult = Math.max(s.critMult, 3); }
    if (has('tongs')) s.poiseMul = (s.poiseMul || 1) + 0.55;
    if (has('voidlens') && flameState.curses?.length) s.dmg += 0.18 * flameState.curses.length;
    if (has('bellows') && this.weapon && (this.heatZone(this.weapon) === 'hot' || this.heatZone(this.weapon) === 'critical')) { s.dmg += 0.2; s.atk += 0.15; }
    // Bộ Hiệu Ứng Di Vật (Set Bonuses — 2 & 3 món)
    const sets = activeRelicSets(this.relics || []);
    this.activeSets = sets;
    for (const st of sets) {
      if (st.id === 'forge') { s.forgeSet2 = true; if (st.tier >= 3) s.forgeSet3 = true; }
      if (st.id === 'storm') { s.stormSet2 = true; if (st.tier >= 3) s.stormSet3 = true; }
      if (st.id === 'blood') { s.bloodSet2 = true; if (st.tier >= 3) { s.bloodSet3 = true; s.critMult = (s.critMult || 2) + 0.5; } }
      if (st.id === 'void') { s.voidSet2 = true; if (st.tier >= 3) s.voidSet3 = true; }
    }
    if (this.weapon) applyAffixes(s, this.weapon);
    if (this.weapon && this.masteryOf) s.dmg *= 1 + 0.04 * this.masteryOf(this.weapon.type);   // độ thuần thục
    if (this.temperedT > 0) { s.atk += 0.2; s.crit += 0.15; }
    if (flameTier() === 'ember') s.critMult = (s.critMult || 2) + 0.4;
    if (hasDynCurse('glass_wrath') && flameState.flame < 40) s.dmg += 0.3;
    if (hasDynCurse('abyss_hunger')) s.dmg *= 1.8;
    // Cập nhật máu tối đa hiệu lực khi bị Cơn Đói Vực Sâu
    const rawMax = this.char.hp + ((this.meta && this.meta.up && this.meta.up.hp) || 0) * 10 - ((this.curses || []).includes('fragile') ? 30 : 0) + (this.perkLv?.hp || 0) * 20 + (this.bonusMaxHp || 0);
    const effMax = hasDynCurse('abyss_hunger') ? Math.max(30, Math.round(rawMax * 0.4)) : rawMax;
    if (effMax !== this.maxHp) {
      this.maxHp = effMax;
      if (this.hp > this.maxHp) this.hp = this.maxHp;
    }
    this.stats = s;
    for (const o of this.orbs) o.visible = has('orbit');
  }

  hasRelic(id) { return this.relics.includes(id); }
  addRelic(id) { if (!this.relics.includes(id)) { this.relics.push(id); this.recalc(); } }

  get radius() { return 0.45; }
  get dashCdMax() { return DASH_COOLDOWN * this.stats.dashCd; }
  get weapon() { return this.weapons && this.weapons[this.slot]; }
  get activeSpecialType() { return (this.weapon && (this.weapon.specialType || this.weapon.type)) || 'sword'; }
  get specialCdMax() {
    const spType = this.activeSpecialType;
    const sp = SPECIALS[spType] || SPECIALS.sword;
    return sp.cd * (spType === 'sword' ? this.stats.parryCd : 1);
  }

  // Vùng nhiệt hiện tại của vũ khí
  heatZone(w = this.weapon) {
    if (!w) return 'cold';
    if (w.overheatT > 0) return 'overheat';
    const wide = (w.masterworks || []).includes('mw_heat') || this.stats?.wideHeat;
    const lo = wide ? 40 : 50;
    const hi = wide ? 92 : 85;
    const h = w.heat || 0;
    if (h > hi) return 'critical';
    if (h >= lo) return 'hot';
    return 'cold';
  }

  addHeat(amount) {
    const w = this.weapon;
    if (!w || w.overheatT > 0) return;
    const mul = (hasDynCurse('overheat_pact') ? 1.6 : 1) * (w.corrupted === 'c_overheat' ? 1.5 : 1);
    const cap = this.stats?.forgeSet3 ? 90 : 100; // Bộ Lò Rèn 3 món miễn nhiễm Quá Nhiệt
    w.heat = Math.min(cap, (w.heat || 0) + amount * mul);
    this.idleHeatT = 1.25;
    if (w.heat >= 100) {
      // Quá Nhiệt / Chảy Lưỡi!
      w.heat = 100;
      w.overheatT = 2.0;
      w.dur = Math.max(0, (w.dur ?? 100) - 5);
      addShake(0.35);
      spawnRing(this.scene, this.pos, 2.8, 0xff5a1a, 0.35);
      smoke(this.pos.clone().setY(1.0), { count: 8, color: 0xffe0c0, size: 1.0, life: 0.9, alpha: 0.65 });
      damageNumber(this.pos, 'Quá Nhiệt!', 'burn');
      play('explode', { at: this.pos, vol: 0.5, rate: 1.5 });
      if (hasDynCurse('overheat_pact') && !this.god) {
        this.hp = Math.max(1, this.hp - 10);
        damageNumber(this.pos, 10, 'player');
      }
      if (this.onWeaponsChanged) this.onWeaponsChanged();
    }
  }

  equip(slot) {
    this.slot = slot;
    this.attack = null;
    this.comboIdx = 0;
    this.charging = false;
    const T = TYPES[this.weapon.type];
    this.pivot.clear();
    if (this.held) { this.held.parent?.remove(this.held); this.held = null; }
    if (this.heldL) { this.heldL.parent?.remove(this.heldL); this.heldL = null; }
    if (this.animated && this.hand) {
      this.held = buildHeldWeapon(this.weapon);
      if (this.held) this.hand.add(this.held);
      // Song Dao: thêm dao tay trái
      if (T.dual && this.handL) { this.heldL = buildHeldWeapon(this.weapon); if (this.heldL) { this.heldL.rotation.set(0, 0, 0); this.handL.add(this.heldL); } }
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
    dmg = Math.max(1, Math.round(dmg * (ctx.enemyDmgMul || 1) * (this.relics.includes('glass') ? 1.4 : 1) * (hasDynCurse('glass_wrath') ? 1.2 : 1)));
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
    ctx.onPlayerHurt?.(dmg);
    this.iframes = 0.55;
    this.gainRage(8);
    if (hasDynCurse('blood_gold') && ctx.onBloodGoldHit) ctx.onBloodGoldHit(this.pos);
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
    if (this.stats.shadowcrit) this.nextCrits = 3;
    if (this.stats.thunderstep) for (const e of ctx.enemies) if (e.alive && e.pos.distanceTo(this.pos) < 6) { spawnBolt(this.scene, e.pos.clone().setY(9), e.pos.clone().setY(0.5), 0xd8c0ff); dealDamage(e, Math.round(30 * this.stats.dmg), { element: 'lightning', element2: null }, null, 0, true, false); }
    damageNumber(this.pos, 'Né Hoàn Hảo!', 'react perfect');
    flash(this.pos.clone().setY(1), 0x9fd4ff, 4, 0.25);
    spawnRing(this.scene, this.pos, 4, 0x9fd4ff, 0.5);
    play('freeze', { rate: 1.7, vol: 0.7 });
    haptic(24);
    if (this.hasRelic('windcharm')) {
      spawnRing(this.scene, this.pos, 4.5, 0xa8f0d8, 0.4);
      aoe(this.pos, 4.5, Math.round(18 * this.stats.dmg), { element: 'wind', element2: null }, 18);
    }
    this.gainRage(15);
    fireRunes(this, 'dodge', this.pos, this.aimDir(), Math.round(24 * this.dmgMul()));
    progressAwakening(this, 'dodge');
    if (ctx.onPerfect) ctx.onPerfect();
  }

  onParry() {
    this.parryT = 0;
    const hot = !!this.hotParry;
    this.hotParry = false;
    if (this.stats.shadowcrit) this.nextCrits = 3;
    this.specialCd = Math.min(this.specialCd, 0.3);
    this.slowmoT = Math.max(this.slowmoT, 0.4);
    this.iframes = 0.4;
    this.playOnce('Block_Attack', 0.45);
    spawnRing(this.scene, this.pos, hot ? 4.8 : 3, hot ? 0xff7a2a : 0xffe2a0, 0.4);
    burst(this.pos.clone().setY(1.1), hot ? 0xff8a3a : 0xffe2a0, hot ? 30 : 20, { speed: 8, size: 0.14 });
    hitSpark(this.pos.clone().setY(1.1).addScaledVector(this.aimDir(), 0.7), 0xffd060, true);
    play('hammer', { rate: 1.3 });
    haptic(22);
    addShake(0.35);
    damageNumber(this.pos, hot ? 'Đỡ Phóng Nhiệt!' : 'Đỡ Đòn!', 'react perfect');
    const mul = RARITY[this.weapon.rarity].mul * this.stats.dmg * (hot ? 1.5 : 1);
    aoe(this.pos, hot ? 4.8 : 3, Math.round(25 * mul), hot ? { element: 'fire', element2: this.weapon.element } : this.weapon, hot ? 16 : 12, { barrels: true });
    if (hot) spawnFirePatch(this.pos, 2.8, 3.0, Math.round(14 * this.stats.dmg));
    if (this.hasRelic('mirror')) this.specialCd *= 0.6;
    if (this.stats.parryHeal) this.heal(this.stats.parryHeal);
    this.gainRage(12);
    fireRunes(this, 'dodge', this.pos, this.aimDir(), Math.round(26 * mul));
    progressAwakening(this, 'dodge');
    if (ctx.onParry) ctx.onParry();
  }

  aimDir() {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  rollCrit() {
    if (this.nextCrit) { this.nextCrit = false; return true; }
    if (this.nextCrits > 0) { this.nextCrits--; return true; }
    return Math.random() < this.stats.crit;
  }

  dmgMul() {
    let mul = RARITY[this.weapon.rarity].mul * this.stats.dmg;
    if (this.hasRelic('horn')) mul *= 1 + 0.5 * (1 - this.hp / this.maxHp);
    if (this.hasRelic('fury')) mul *= 1 + 0.6 * (1 - this.hp / this.maxHp);
    const hz = this.heatZone(this.weapon);
    const bellowBonus = this.hasRelic('bellows') ? 0.2 : 0;
    if (hz === 'hot') mul *= (hasDynCurse('overheat_pact') ? 1.4 : 1.25) + bellowBonus;
    else if (hz === 'critical') mul *= 1.45 + bellowBonus;
    else if (hz === 'overheat') mul *= 0.75;
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
    let c = T.combo[this.comboIdx % T.combo.length];
    if (this.postDash > 0) {
      // Đâm Lướt: đòn đâm xa, sát thương cao, hất văng mạnh
      this.postDash = 0;
      c = { ...c, anim: '1H_Melee_Attack_Stab', arc: 1.0, range: c.range * 1.25, dmg: c.dmg * 1.7, kb: c.kb * 1.8 + 6, lunge: 9, thrust: true, big: true, dur: c.dur * 0.9, dashAtk: true };
      damageNumber(this.pos, 'Đâm Lướt!', 'react perfect');
    }
    const dur = c.dur / spd;
    this.attack = { ...c, dur, range: c.range * this.stats.range, t: 0, hitAt: this.animated ? dur * 0.45 : 0, hit: false, big: !!c.big };
    this.playOnce(c.anim, dur * 1.35);
    this.comboIdx = (this.comboIdx + 1) % T.combo.length;
  }

  // Áp sát thương cho 1 quái từ đòn của người chơi (dùng chung cho đòn thường và kỹ năng)
  strike(e, baseDmg, dir, kb, big, opts = {}) {
    const st = this.stats;
    const extraCrit = st.darkBlight && e.poisonStacks ? e.poisonStacks * 0.06 : 0;
    const crit = this.rollCrit() || (extraCrit > 0 && Math.random() < extraCrit);
    const w0 = this.weapon;
    const hz = this.heatZone(w0);
    // Đánh lén (Dạ Thần): mục tiêu quay lưng về phía mình
    let back = false;
    if (st.backstab && e.facing != null) {
      const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
      const tx = this.pos.x - e.pos.x, tz = this.pos.z - e.pos.z, tl = Math.hypot(tx, tz) || 1;
      back = (fx * tx + fz * tz) / tl < -0.2;
    }
    let mulX = back ? (st.shadowflame ? 1.9 : 1.6) : 1;
    if (w0.legend === 'bloodfire' && e.burnT > 0) mulX *= 1.25;
    if (st.frostShatter && (e.frozenT > 0 || e.slowT > 0)) mulX *= st.frostShadow && e.frozenT > 0 ? 1.7 : 1.45;
    let dmg = Math.round(baseDmg * mulX * (0.9 + Math.random() * 0.2) * (crit ? st.critMult : 1));
    if (back) damageNumber(e.pos, 'Đánh Lén!', 'react perfect');
    // Cắt Chiêu (Spell-Break Interrupt — cơ chế #5): đòn nặng/kỹ năng đánh trúng địch đang niệm đòn Tím
    if ((big || opts.canInterrupt) && e.teleKind === 'interrupt' && e.alive) {
      e.interruptAttack?.(true);
      dmg = Math.round(dmg * 1.45 + 15);
      damageNumber(e.pos, 'Cắt Chiêu!', 'react ult');
      spawnRing(this.scene, e.pos, 3.6, 0xd070ff, 0.45);
      flash(e.pos.clone().setY(1.2), 0xe8a8ff, 4, 0.22);
      addShake(0.45);
      addHitStop(0.09);
      play('hammer', { at: e.pos, rate: 1.4 });
      haptic(24);
      if (this.hasRelic('mirror')) this.specialCd *= 0.6;
      progressAwakening(this, 'stun');
      if (ctx.onSpellBreak) ctx.onSpellBreak(e);
    }
    // Độ bền & Nhiệt Lưỡi (cơ chế #1)
    if (w0.dur == null) w0.dur = 100;
    const durMult = this.temperedT > 0 || st.forgeSet3 ? 0 : (hz === 'critical' ? 4 : 1) * (hasDynCurse('dark_forge') ? 2 : 1) * (w0.corrupted === 'c_brittle' ? 2 : 1);
    w0.dur = Math.max(0, w0.dur - 0.22 * durMult);
    if (w0.dur <= 0) { dmg = Math.round(dmg * 0.7); if (!w0.warnedBroken) { w0.warnedBroken = true; damageNumber(this.pos, 'Vũ khí đã mẻ!', 'burn'); } }
    if (!opts.noHeat) this.addHeat((big ? 10 : 6) / Math.sqrt(Math.max(1, st.atk || 1)));

    // Sát thương thanh Choáng (Poise)
    const poiseExtra = (hz === 'hot' || hz === 'critical' ? 0.5 : 0) + ((st.poiseMul || 1) - 1) + (w0.legend === 'boss_knight' ? 0.6 : 0) + (w0.legend === 'boss_smith' ? 1.5 : 0) + ((opts.poiseMul || 1) - 1);
    if (poiseExtra > 0 && e.poiseMax && e.stunT <= 0) e.poise += dmg * poiseExtra;

    const dealt = dealDamage(e, dmg, w0, dir, kb * (st.gust ? 1.7 : 1), big || crit);

    if ((st.ignite || (back && st.shadowflame) || (hz === 'hot' && big)) && e.alive) {
      e.burnT = Math.max(e.burnT, 3);
      e.burnDps = Math.max(e.burnDps, dmg * (back && st.shadowflame ? 0.5 : 0.25));
    }
    if (st.venomHit && e.alive) {
      e.poisonStacks = Math.min(8, (e.poisonStacks || 0) + 1);
      e.poisonT = 4.5;
      e.poisonDps = Math.max(e.poisonDps || 0, dmg * 0.14);
    }
    if (st.frostShadow && crit && e.alive) { e.frozenT = Math.max(e.frozenT, 1.2); e.slowT = Math.max(e.slowT, 2.5); }
    if (st.hellGas && (e.poisonStacks || 0) >= 3 && e.alive) {
      e.poisonStacks = 0;
      spawnRing(this.scene, e.pos, 3.2, 0x9fff5a, 0.4);
      aoe(e.pos, 3.2, Math.round(dmg * 0.85), { element: 'fire', element2: null }, 10, { exclude: e });
      play('explode', { at: e.pos, vol: 0.55, rate: 1.25 });
    }
    if (st.stormSet2 && (this.fourthCount + 1) % 5 === 0 && e.alive) {
      dealDamage(e, Math.round(dmg * 0.45), { element: 'lightning', element2: null }, null, 0, false, true);
    }
    if (st.voidSet3 && crit && Math.random() < 0.3 && e.alive) {
      smoke(e.pos.clone().setY(0.9), { count: 4, color: 0x3a1060, size: 0.9, life: 0.45, alpha: 0.6 });
      dealDamage(e, Math.round(dmg * 0.6), { element: 'blood', element2: null }, dir, 4, true, false);
    }
    if (st.third && ++this.thirdCount % 3 === 0 && e.alive) {
      spawnBolt(this.scene, e.pos.clone().setY(9), e.pos.clone().setY(0.5), 0xfff07a); play('zap', { at: e.pos });
      dealDamage(e, Math.round(dmg * 0.6 + 6), { element: 'lightning', element2: null }, null, 0, true, false);
    }
    if (crit && st.critchain) dealDamage(e, Math.max(1, Math.round(dmg * 0.25)), { element: 'lightning', element2: null }, null, 0, true, true);
    if (st.plasma && e.burnT > 0 && Math.random() < 0.3) { spawnRing(this.scene, e.pos, 2.2, 0xffb040, 0.3); aoe(e.pos, 2.2, Math.round(dmg * 0.5), { element: 'none', element2: null }, 10, { exclude: e }); }
    // Kiệt tác Tàn Hỏa: mỗi đòn thứ 2 bắn tia lửa xuyên giáp
    if (st.mwSpark && ++this.sparkCount % 2 === 0) {
      const sd = dir || this.aimDir();
      spawnOrb(this.pos.clone().addScaledVector(sd, 0.8).setY(1.0), sd, { element: 'fire', element2: null }, Math.round(dmg * 0.45), 0, 24, { bolt: true, pierce: 2 });
    }
    // Vũ khí huyền thoại (công thức rèn & Lõi Boss)
    const lg = w0.legend;
    if (lg === 'blizzard' && Math.random() < 0.2) { spawnRing(this.scene, e.pos, 2.5, 0xbff0ff, 0.4); for (const o of ctx.enemies) if (o.alive && o.pos.distanceTo(e.pos) < 2.5) { o.frozenT = 1.4; o.slowT = 2.5; } }
    if (lg === 'judgement' && crit) { spawnBolt(this.scene, e.pos.clone().setY(9), e.pos.clone().setY(0.5), 0xfff6d0); dealDamage(e, Math.round(dmg * 0.5), { element: 'holy', element2: null }, null, 0, true, false); }
    if (lg === 'plague') for (const o of ctx.enemies) if (o !== e && o.alive && o.pos.distanceTo(e.pos) < 3) { o.poisonStacks = Math.min(8, (o.poisonStacks || 0) + 1); o.poisonT = 4; o.poisonDps = Math.max(o.poisonDps || 0, dmg * 0.1); }
    if (lg === 'boss_slime' && !opts.noBossProc) {
      for (const side of [-0.5, 0.5]) {
        const a = Math.atan2((dir || this.aimDir()).x, (dir || this.aimDir()).z) + side;
        const d2 = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        spawnOrb(e.pos.clone().setY(0.9), d2, { element: 'poison', element2: 'blood' }, Math.round(dmg * 0.35), 1.4, 13, {});
      }
    }
    if (lg === 'boss_shadow' && (crit || back) && e.alive && !opts.noBossProc) {
      const target = e, snapDmg = Math.round(dmg * 0.55), snapDir = (dir || this.aimDir()).clone();
      setTimeout(() => {
        if (!target.alive || this.dead) return;
        smoke(target.pos.clone().setY(0.9), { count: 4, color: 0x3a2060, size: 0.9, life: 0.5, alpha: 0.6 });
        flash(target.pos.clone().setY(1.0), 0xb89aff, 2.0, 0.14, false);
        dealDamage(target, snapDmg, { element: 'blood', element2: 'wind' }, snapDir, 5, true, false);
      }, 240);
    }
    if (lg === 'boss_golem' && (big || crit) && !opts.noBossProc) {
      spawnRing(this.scene, e.pos, 3.2, 0xff6a1a, 0.4);
      aoe(e.pos, 3.2, Math.round(dmg * 0.65), { element: 'fire', element2: null }, 12, { exclude: e });
      spawnFirePatch(e.pos.clone(), 2.0, 3.2, Math.round(dmg * 0.35), false);
    }
    if (lg === 'boss_dragon_fire' && !opts.noBossProc && (this.dragonHit = (this.dragonHit || 0) + 1) % 3 === 0) {
      spawnRing(this.scene, e.pos, 2.8, 0xff5a1a, 0.45);
      aoe(e.pos, 2.8, Math.round(dmg * 0.85), { element: 'fire', element2: 'wind' }, 10, {});
      spawnFirePatch(e.pos.clone(), 2.0, 3.5, Math.round(dmg * 0.35), false);
      play('explode', { at: e.pos, rate: 1.25, vol: 0.5 });
    }
    if (lg === 'boss_plague' && !opts.noBossProc) {
      for (const o of ctx.enemies) if (o !== e && o.alive && o.pos.distanceTo(e.pos) < 3.4) {
        o.poisonStacks = Math.min(8, (o.poisonStacks || 0) + 1);
        o.poisonT = 4.5;
        o.poisonDps = Math.max(o.poisonDps || 0, dmg * 0.14);
      }
      if ((e.poisonStacks || 0) >= 5) {
        e.poisonStacks = 0;
        spawnRing(this.scene, e.pos, 3.0, 0x8fe83a, 0.4);
        aoe(e.pos, 3.0, Math.round(dmg * 0.9), { element: 'poison', element2: null }, 8, {});
        play('explode', { at: e.pos, rate: 1.3, vol: 0.5 });
      }
    }
    if (lg === 'boss_frost' && big && !opts.noBossProc) {
      spawnRing(this.scene, e.pos, 3.5, 0x7fdcff, 0.45);
      for (const o of ctx.enemies) if (o.alive && o.pos.distanceTo(e.pos) < 3.5) { o.slowT = Math.max(o.slowT, 3); o.frozenT = Math.max(o.frozenT, 1.5); }
      reactSurface(e.pos, 3.5, 'ice', dir || this.aimDir(), dmg);
    }
    if (lg === 'boss_smith' && !opts.noBossProc) {
      spawnRing(this.scene, e.pos, 3.2, 0xffe070, 0.35);
      aoe(e.pos, 3.2, Math.round(dmg * 0.45), { element: 'fire', element2: 'holy' }, 10, { exclude: e });
      addFlame(4);
    }
    // Mạch Cổ Ngữ (cơ chế #3) & Thức Tỉnh (cơ chế #8)
    this.fourthCount++;
    if (crit) {
      fireRunes(this, 'crit', e.pos, dir || this.aimDir(), dmg);
      progressAwakening(this, 'crit');
    }
    if (this.fourthCount % 4 === 0) fireRunes(this, 'fourth', e.pos, dir || this.aimDir(), dmg);
    if (this.fourthCount % 6 === 0) fireRunes(this, 'sixth', e.pos, dir || this.aimDir(), dmg);

    this.gainRage(dealt * 0.35);
    if (this.stats.leech) {
      this.leechAcc += dealt * this.stats.leech;
      // Hút máu có giới hạn: tối đa ~3% máu tối đa mỗi giây
      if (this.leechAcc >= 1) { const h = Math.min(Math.floor(this.leechAcc), Math.floor(this.leechBudget || 0)); this.leechAcc = Math.min(this.leechAcc - h, 3); this.leechBudget -= h; if (h > 0) this.heal(h); }
    }
    if (this.stats.chainChance && Math.random() < this.stats.chainChance) {
      dealDamage(e, Math.max(1, Math.round(dmg * 0.3)), { ...w0, element: 'lightning', element2: null }, null, 0, false);
    }
    if (this.stats.execute && e.alive && !e.isBoss && e.hp < (e.maxHpEff || e.hp) * this.stats.execute) {
      damageNumber(e.pos, 'Kết Liễu', 'react ult');
      e.takeHit(e.hp + 1, dir, kb, true);
    }
    if (crit && this.stats.storm) spawnSwordWave(this.pos.clone().addScaledVector(dir, 0.8), this.aimDir(), w0, Math.round(dmg * 0.5));
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
      const shotDmg = Math.round(s.dmg * mul * (crit ? this.stats.critMult : 1));
      spawnOrb(origin, dir, w, shotDmg, s.splash, s.speed * this.stats.range, T.bolt ? { bolt: true, pierce: s.pierce } : { bounces: this.stats.bounce });
      if (w.legend === 'boss_mage') {
        for (const off of [-0.25, 0.25]) {
          const ang = Math.atan2(dir.x, dir.z) + off;
          spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), w, Math.round(shotDmg * 0.55), 0.8, s.speed * this.stats.range, { bounces: 2 });
        }
      }
      if (w.legend === 'boss_dragon_ice') {
        for (const off of [-0.18, 0.18]) {
          const ang = Math.atan2(dir.x, dir.z) + off;
          spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), { element: 'ice', element2: 'wind' }, Math.round(shotDmg * 0.55), 0, s.speed * this.stats.range, { bolt: true, pierce: 2 });
        }
      }
      if (w.legend === 'boss_plague') {
        for (const off of [-0.2, 0.2]) {
          const ang = Math.atan2(dir.x, dir.z) + off;
          spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), { element: 'poison', element2: 'blood' }, Math.round(shotDmg * 0.45), 1.6, s.speed * 0.9 * this.stats.range, {});
        }
      }
      this.addHeat(3.2 / Math.sqrt(Math.max(1, this.stats.atk || 1)));
      if (crit) { fireRunes(this, 'crit', origin, dir, shotDmg); progressAwakening(this, 'crit'); }
      this.gainRage(3);
      play('cast');
      addShake(0.05);
      return;
    }
    this.lunge = a.lunge;
    play('swing', { rate: w.type === 'sword' ? 1 : 0.8 });
    spawnSlash(this.scene, this.pos, this.facing, a.arc, a.range, slashColor(w), !a.thrust && a.from < a.to);
    const aimD = this.aimDir();
    // Hóa học bề mặt & Phá cột đá bằng đòn nặng (Chiến Chùy phá cột ngay cả bằng đòn thường!)
    const surfPos = this.pos.clone().addScaledVector(aimD, a.range * 0.65);
    for (const el of [w.element, w.element2]) if (el && el !== 'none') reactSurface(surfPos, a.range * 0.55, el, aimD, a.dmg * mul);
    if (a.big || w.type === 'greatsword' || T.heavy) damagePillars(surfPos, a.range * 0.55, aimD, a.big || T.heavy);

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
      if (a.dashAtk) e.lastDashHit = performance.now();
      const hitDir = new THREE.Vector3(dx, 0, dz).normalize();
      this.strike(e, a.dmg * mul, a.pull ? hitDir.clone().negate() : hitDir, Math.abs(a.kb), a.big, { canInterrupt: a.big || T.heavy, poiseMul: a.poiseMul || 1 });
      hitAny = true;
    }
    this.hitBarrels(a.range, a.arc);
    if (a.big) {
      if (this.stats.swordWave) spawnSwordWave(this.pos.clone().addScaledVector(aimD, 0.8), aimD, w, Math.round(a.dmg * mul * 0.6));
      if (this.stats.titan) {
        spawnRing(this.scene, this.pos, 3.2, 0xffcf4a, 0.35);
        aoe(this.pos, 3.2, Math.round(a.dmg * mul * 0.4), { element: 'none', element2: null }, 10);
      }
      if (this.stats.frostNova) {
        spawnRing(this.scene, this.pos, 4.2, 0x7fdcff, 0.45);
        play('freeze', { at: this.pos, rate: 1.15, vol: 0.55 });
        for (const e of enemies) if (e.alive && e.pos.distanceTo(this.pos) < 4.2 + e.radius) { e.slowT = Math.max(e.slowT, 3); e.iceStacks = (e.iceStacks || 0) + 1; if (e.iceStacks >= 2) { e.iceStacks = 0; e.frozenT = Math.max(e.frozenT, 1.4); } }
      }
    }
    if (!hitAny && w.corrupted === 'c_whiff' && !this.god && this.hp > 2) {
      this.hp = Math.max(1, this.hp - 2);
      damageNumber(this.pos, 'Khát Máu -2', 'player');
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

  // ---------- Tôi Đổi Vũ Khí / Đòn Biến Hình (phím Q — cơ chế #1 & #2) ----------
  quenchSwap(enemies) {
    const w = this.weapon;
    if (!w) return;
    const isTwin = !!w.altForm;
    if (!isTwin && this.weapons.length < 2) return;
    const oldEl = w.element;
    const hz = this.heatZone(w);
    const hot = hz === 'hot' || hz === 'critical';
    // Hủy hoạt ảnh tấn công, đổi dạng hoặc đổi ô vũ khí
    this.attack = null;
    this.attackCd = 0;
    this.charging = false;
    if (isTwin) {
      swapWeaponForm(w);
      this.equip(this.slot);
    } else {
      this.equip(1 - this.slot);
    }
    play('swap');
    burst(this.pos.clone().setY(1), hot ? 0xffa040 : 0xffcf6b, hot ? 18 : 8, { speed: hot ? 7 : 3, size: 0.14 });

    // Nếu đang ở vùng Nóng Đỏ HOẶC Biến Hình vũ khí: Tôi Vũ Khí + Đòn Biến Hình!
    if (hot || isTwin) {
      const mul = this.dmgMul();
      if (hot) {
        w.heat = 0;
        w.overheatT = 0;
        this.temperedT = this.hasRelic('quencher') ? 6.2 : 4.2;
        if (this.hasRelic('quencher')) this.heal(10);
        this.recalc();
        this.stamina = Math.min(100, this.stamina + 22);
        addFlame(8);
        smoke(this.pos.clone().setY(0.9), { count: 9, color: 0xe6f4ff, size: 1.2, life: 0.95, alpha: 0.55 });
        spawnRing(this.scene, this.pos, 3.8, 0xbfe8ff, 0.4);
        play('freeze', { at: this.pos, rate: 0.7, vol: 0.7 });
        if (this.stats.forgeSet2) {
          spawnRing(this.scene, this.pos, 4.6, 0xff7a2a, 0.45);
          aoe(this.pos, 4.6, Math.round(24 * mul), { element: 'fire', element2: null }, 12);
        }
      }
      if (isTwin) {
        const comboW = { ...this.weapon, element: this.weapon.element !== 'none' ? this.weapon.element : oldEl, element2: oldEl !== 'none' && oldEl !== this.weapon.element ? oldEl : this.weapon.element2 };
        spawnSlash(this.scene, this.pos, this.facing, Math.PI * 2, 3.6, slashColor(comboW), false);
        spawnRing(this.scene, this.pos, 3.6, slashColor(comboW), 0.38);
        play('hitHeavy', { at: this.pos, rate: 1.15 });
        addShake(0.3);
        this.iframes = Math.max(this.iframes, 0.25);
        for (const e of enemies) {
          if (!e.alive || e.spawning) continue;
          const dist = e.pos.distanceTo(this.pos);
          if (dist < 3.6 + e.radius) {
            const d = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
            dealDamage(e, Math.round(22 * mul * (hot ? 1.35 : 1)), comboW, d, 11, true, true);
            if (hot) e.slowT = Math.max(e.slowT, 2.5);
          }
        }
        if (this.weapon.legend === 'boss_twins') {
          const targets = enemies.filter((e) => e.alive && !e.spawning && e.pos.distanceTo(this.pos) < 8.5).slice(0, 4);
          for (const t of targets) {
            spawnBolt(this.scene, this.pos.clone().setY(1.2), t.pos.clone().setY(1.0), 0xffe080);
            dealDamage(t, Math.round(26 * mul), { element: 'lightning', element2: 'fire' }, null, 8, true, true);
          }
          if (targets.length) play('zap', { at: this.pos });
        }
      } else if (hot) {
        for (const e of enemies) {
          if (!e.alive || e.spawning) continue;
          if (e.pos.distanceTo(this.pos) < 3.8 + e.radius) {
            const d = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
            dealDamage(e, Math.round(16 * mul), this.weapon, d, 12, false, false);
            e.slowT = Math.max(e.slowT, 2.5);
          }
        }
      }
      damageNumber(this.pos, isTwin && hot ? 'Tôi Biến Hình!' : isTwin ? 'Đòn Biến Hình!' : 'Tôi Vũ Khí!', 'react perfect');
      fireRunes(this, 'quench', this.pos, this.aimDir(), Math.round(24 * mul));
      progressAwakening(this, 'quench');
      if (this.onWeaponsChanged) this.onWeaponsChanged();
    }
  }

  // ---------- Kỹ năng chuột phải (hỗ trợ 9 vũ khí + Ghép Chiêu & Phóng Nhiệt) ----------
  useSpecial(enemies) {
    const prevTag = ctx.dmgTag;
    ctx.dmgTag = 'special';
    try { this._useSpecial(enemies); } finally { ctx.dmgTag = prevTag; }
  }
  _useSpecial(enemies) {
    const w = this.weapon;
    const spType = this.activeSpecialType;
    if (spType === 'axe' && this.boomerangOut) return;
    const hz = this.heatZone(w);
    const hot = hz === 'hot' || hz === 'critical';
    let mul = this.dmgMul() * (this.stats.specialPower || 1);
    if (hot) {
      w.heat = 0; w.overheatT = 0;
      mul *= 1.45;
      addFlame(6);
      damageNumber(this.pos, 'Phóng Nhiệt!', 'react melt');
      spawnRing(this.scene, this.pos, 3.2, 0xff8a3a, 0.35);
      if (this.stats.forgeSet2) aoe(this.pos, 4.6, Math.round(24 * mul), { element: 'fire', element2: null }, 12);
      fireRunes(this, 'quench', this.pos, this.aimDir(), Math.round(26 * mul));
      progressAwakening(this, 'quench');
    }
    const fireW = hot ? { ...w, element: w.element !== 'none' ? w.element : 'fire', element2: w.element !== 'none' && w.element !== 'fire' ? 'fire' : w.element2 } : w;
    // Khả năng Cắt Chiêu của kỹ năng Chuột Phải lên quái đang niệm đòn Tím trong tầm gần
    for (const e of enemies) {
      if (e.alive && e.teleKind === 'interrupt' && e.pos.distanceTo(this.pos) < 5.5) {
        e.interruptAttack?.(true);
        damageNumber(e.pos, 'Cắt Chiêu!', 'react ult');
        spawnRing(this.scene, e.pos, 3.6, 0xd070ff, 0.45);
        play('hammer', { at: e.pos, rate: 1.4 });
        dealDamage(e, Math.round(24 * mul), fireW, new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize(), 12, true, false);
        progressAwakening(this, 'stun');
        if (ctx.onSpellBreak) ctx.onSpellBreak(e);
      }
    }
    if (w.legend === 'boss_knight') {
      spawnRing(this.scene, this.pos, 4.2, 0xffcf6b, 0.4);
      aoe(this.pos, 4.2, Math.round(20 * mul), { element: 'holy', element2: 'fire' }, 14);
    }

    if (spType === 'sword') {
      this.parryT = hot ? 0.55 : 0.38;
      this.hotParry = hot;
      this.specialCd = this.specialCdMax;
      this.playOnce('Block', 0.4, 2);
      play('swap', { rate: 1.3 });
    } else if (spType === 'axe') {
      if (this.boomerangOut) return;
      this.boomerangOut = true;
      spawnBoomerang(this, this.aimDir(), fireW, Math.round(18 * mul));
      if (hot) spawnFirePatch(this.pos.clone().addScaledVector(this.aimDir(), 2.5), 2.2, 3.2, Math.round(14 * this.stats.dmg));
      this.specialCd = this.specialCdMax;
      this.playOnce('Throw', 0.35);
      play('swing', { rate: 0.7 });
    } else if (spType === 'staff') {
      const dir = this.aimDir();
      spawnOrb(this.pos.clone().addScaledVector(dir, 1.3).setY(1.1), dir, fireW, Math.round(32 * mul), 0, 10, { big: true });
      if (hot) {
        // Phóng Nhiệt Trượng: hút quái về trước mặt
        const center = this.pos.clone().addScaledVector(dir, 5);
        for (const e of enemies) if (e.alive && !e.isBoss && e.pos.distanceTo(center) < 5) e.knock.set(center.x - e.pos.x, 0, center.z - e.pos.z).normalize().multiplyScalar(10);
      }
      this.specialCd = this.specialCdMax;
      this.playOnce('Spellcast_Long', 0.5, 2.5);
      play('cast', { rate: 0.7 });
    } else if (spType === 'daggers') {
      // Phi Dao: 5 con dao (Phóng Nhiệt: 9 con dao xuyên giáp!)
      const base = Math.atan2(this.aimDir().x, this.aimDir().z);
      const half = hot ? 4 : 2;
      for (let k = -half; k <= half; k++) {
        const a = base + k * (hot ? 0.13 : 0.16), dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        spawnOrb(this.pos.clone().addScaledVector(dir, 0.8).setY(1.1), dir, fireW, Math.round(9 * mul), 0, 26, { bolt: true, pierce: hot ? 2 : 1, knife: true });
      }
      this.specialCd = this.specialCdMax;
      this.playOnce('Throw', 0.3, 1.4);
      play('swing', { rate: 1.5 });
    } else if (spType === 'crossbow') {
      const dir = this.aimDir();
      spawnOrb(this.pos.clone().addScaledVector(dir, 1).setY(1.1), dir, fireW, Math.round(30 * mul), 0, 24, { bolt: true, pierce: 0, explode: true });
      if (hot) spawnFirePatch(this.pos.clone().addScaledVector(dir, 4.5), 2.5, 3.2, Math.round(14 * this.stats.dmg));
      this.specialCd = this.specialCdMax;
      this.playOnce('2H_Ranged_Shoot', 0.4, 0.8);
      play('swing', { rate: 0.6 });
    } else if (spType === 'greatsword') {
      this.charging = true;
      this.chargeT = hot ? 0.6 : 0; // Phóng Nhiệt rút ngắn nửa thời gian tích lực!
      this.hotCharge = hot;
    } else if (spType === 'spear') {
      // Ném Thương Xuyên Thấu: xuyên toàn hàng quái + nổ vòng năng lượng
      const dir = this.aimDir();
      spawnOrb(this.pos.clone().addScaledVector(dir, 1.1).setY(1.1), dir, fireW, Math.round(28 * mul), 0, 32, { bolt: true, pierce: hot ? 8 : 5, explode: hot });
      if (hot) spawnSwordWave(this.pos.clone().addScaledVector(dir, 1.2), dir, fireW, Math.round(24 * mul), 1.3);
      this.specialCd = this.specialCdMax;
      this.playOnce('Throw', 0.35, 1.2);
      play('swing', { rate: 1.35 });
    } else if (spType === 'scythe') {
      // Gặt Hồn: chém 360° rộng 4.4m, gây +80% ST lên quái dưới 45% máu & hồi +12 Ánh Lửa
      const R = hot ? 5.2 : 4.4;
      spawnSlash(this.scene, this.pos, this.facing, Math.PI * 2, R, hot ? 0xff7a2a : 0xd080ff, false);
      spawnRing(this.scene, this.pos, R, hot ? 0xff7a2a : 0xc070ff, 0.45);
      addFlame(12);
      let hitC = 0;
      for (const e of enemies) {
        if (!e.alive || e.spawning || e.pos.distanceTo(this.pos) > R + e.radius) continue;
        const low = e.hp < (e.maxHpEff || e.maxHp || e.hp) * 0.45;
        const d = new THREE.Vector3(this.pos.x - e.pos.x, 0, this.pos.z - e.pos.z).normalize();
        this.strike(e, (low ? 42 : 24) * mul, d, 8, true, { canInterrupt: true, noHeat: hot });
        hitC++;
      }
      if (hitC > 0) this.heal(Math.min(14, hitC * 3));
      this.specialCd = this.specialCdMax;
      this.playOnce('2H_Melee_Attack_Spin', 0.42);
      play('hitHeavy', { rate: 0.9 }); addShake(0.42);
    } else if (spType === 'hammer') {
      // Chấn Động Lò Rèn: đập đất tạo sóng chấn động 4.8m choáng & đập sập cột đá!
      const R = hot ? 5.6 : 4.8;
      const aimD = this.aimDir();
      const center = this.pos.clone().addScaledVector(aimD, 1.4);
      spawnRing(this.scene, center, R, hot ? 0xff8a2a : 0xffcf4a, 0.5);
      burst(center.clone().setY(0.4), 0xffcf4a, 34, { speed: 11, size: 0.2 });
      damagePillars(center, R, aimD, true);
      if (hot) spawnFirePatch(center, 2.8, 3.8, Math.round(18 * this.stats.dmg));
      for (const e of enemies) {
        if (!e.alive || e.spawning || e.pos.distanceTo(center) > R + e.radius) continue;
        const d = new THREE.Vector3(e.pos.x - center.x, 0, e.pos.z - center.z).normalize();
        this.strike(e, 34 * mul, d, 16, true, { canInterrupt: true, poiseMul: 2.6, noHeat: hot });
        if (!e.isBoss) e.stunT = Math.max(e.stunT, 1.4);
      }
      this.hitBarrels(R, Math.PI * 2);
      this.specialCd = this.specialCdMax;
      this.playOnce('2H_Melee_Attack_Chop', 0.45);
      play('explode', { at: center, rate: 0.8, vol: 0.75 }); addShake(0.6);
    }
  }

  releaseCharge(enemies) {
    this.charging = false;
    const hot = !!this.hotCharge;
    this.hotCharge = false;
    const k = Math.min(1, this.chargeT / 1.2);
    const mul = this.dmgMul() * (this.stats.specialPower || 1) * (hot ? 1.35 : 1);
    const range = 4.6 * this.stats.range, arc = 2.4;
    this.specialCd = this.specialCdMax;
    this.playOnce('2H_Melee_Attack_Slice', 0.45);
    spawnSlash(this.scene, this.pos, this.facing, arc, range, hot ? 0xff7a2a : slashColor(this.weapon), false);
    play(k > 0.8 ? 'hitHeavy' : 'swing', { rate: 0.7 });
    addShake(0.2 + k * 0.5);
    this.lunge = 6 + k * 6;
    const aimD = this.aimDir();
    const hitCenter = this.pos.clone().addScaledVector(aimD, range * 0.6);
    damagePillars(hitCenter, range * 0.65, aimD, k > 0.5);
    for (const el of [this.weapon.element, this.weapon.element2]) if (el && el !== 'none') reactSurface(hitCenter, range * 0.6, el, aimD, (20 + 45 * k) * mul);
    if (hot) spawnFirePatch(hitCenter, 2.6, 3.5, Math.round(18 * this.stats.dmg));
    for (const e of enemies) {
      if (!e.alive || e.spawning) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      let diff = Math.atan2(dx, dz) - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > arc / 2 + 0.2) continue;
      this.strike(e, (20 + 45 * k) * mul, new THREE.Vector3(dx, 0, dz).normalize(), 8 + 14 * k, k > 0.5, { canInterrupt: true });
    }
    this.hitBarrels(range, arc);
    if (k > 0.95) { addHitStop(0.1); spawnSwordWave(this.pos.clone().addScaledVector(aimD, 1), aimD, this.weapon, Math.round(30 * mul), 1.4); }
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
    // Giáp Tuyết (Băng Thần): tạo khiên băng 22 mỗi 12s
    if (this.stats.iceArmor && this.relicT.iceArmor <= 0) {
      this.relicT.iceArmor = 12;
      this.shieldHp = Math.max(this.shieldHp, 22);
      spawnRing(this.scene, this.pos, 2.2, 0x8fe8ff, 0.35);
      play('freeze', { at: this.pos, rate: 1.4, vol: 0.4 });
    }
    // Mắt Bão (Phong Thần) + các thẻ Song Thần của Gió (stormcall, firestorm, blizzWind, plagueWind)
    if (this.stats.tornado && this.relicT.tornado <= 0 && enemies.some((e) => e.alive)) {
      this.relicT.tornado = 5.0;
      const R = 5.2;
      spawnRing(this.scene, this.pos, R, this.stats.blizzWind ? 0x8fe8ff : this.stats.plagueWind ? 0x8fe83a : 0xa8f0d8, 0.45);
      play('dash', { at: this.pos, rate: 0.65, vol: 0.55 });
      if (this.stats.firestorm) spawnFirePatch(this.pos.clone(), 3.2, 3.5, Math.round(14 * this.stats.dmg));
      const near = enemies.filter((e) => e.alive && !e.spawning && e.pos.distanceTo(this.pos) < R + e.radius);
      for (const e of near) {
        const dir = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
        dealDamage(e, Math.round(18 * this.stats.dmg), { element: 'wind', element2: null }, this.stats.plagueWind ? dir.negate() : dir, 14, false, false);
        if (this.stats.blizzWind) { e.frozenT = Math.max(e.frozenT, 1.8); e.slowT = Math.max(e.slowT, 3.0); }
        if (this.stats.plagueWind) { e.poisonStacks = Math.min(8, (e.poisonStacks || 0) + 2); e.poisonT = 4.5; e.poisonDps = Math.max(e.poisonDps || 0, 6 * this.stats.dmg); }
      }
      if (this.stats.stormcall) {
        for (const t of near.slice(0, 3)) {
          spawnBolt(this.scene, t.pos.clone().setY(9), t.pos.clone().setY(0.5), 0xffe14a);
          dealDamage(t, Math.round(22 * this.stats.dmg), { element: 'lightning', element2: null }, null, 0, true, false);
        }
      }
    }
  }

  update(dt, aim, enemies, time = 0) {
    if (this.anim) this.anim.update(dt);
    if (this.dead) return;
    this.iframes = Math.max(0, this.iframes - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    // Buff Thép Tôi & làm nguội Nhiệt Lưỡi (cơ chế #1)
    if (this.temperedT > 0) {
      this.temperedT = Math.max(0, this.temperedT - dt);
      if (this.temperedT <= 0) this.recalc();
    }
    const cw = this.weapon;
    if (cw) {
      if (cw.overheatT > 0) {
        cw.overheatT = Math.max(0, cw.overheatT - dt);
        cw.heat = Math.max(0, (cw.overheatT / 2.0) * 100);
      } else if (this.idleHeatT > 0) {
        this.idleHeatT -= dt;
      } else if ((cw.heat || 0) > 0) {
        cw.heat = Math.max(0, cw.heat - 14 * dt);
      }
      updateWeaponHeatVisual(this.held, cw, time);
      if ((cw.heat || 0) >= 50 && Math.random() < dt * 10) {
        emit(this.pos.clone().setY(1.1).addScaledVector(this.aimDir(), 0.7), {
          frame: F.glow, color: (cw.heat || 0) >= 85 ? 0xfff0c0 : 0xff7a2a, color2: 0xff3a00,
          size: 0.28, size2: 0.04, life: 0.35, vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5),
        });
      }
    }
    // Thể lực: lướt và kỹ năng tốn thể lực, hồi lại sau 0.5 giây (+25% khi Ánh Lửa Rực)
    const stamRate = flameTier() === 'bright' ? 48 : 38;
    if (this.stamDelay > 0) this.stamDelay -= dt; else this.stamina = Math.min(100, this.stamina + stamRate * dt);
    this.stamWarn = Math.max(0, this.stamWarn - dt);
    this.postDash = Math.max(0, this.postDash - dt);
    // Hiệu ứng xấu: chậm (băng), trúng độc (Bộ Hư Không 2 món miễn nhiễm!)
    if (this.stats.voidSet2) { this.slowT = 0; this.poisonT = 0; }
    if (this.slowT > 0) { this.slowT -= dt; if (Math.random() < dt * 6) emit(this.pos.clone().setY(0.4 + Math.random()), { frame: F.cross, color: 0xdff8ff, color2: 0x6fc3ff, size: 0.4, size2: 0, life: 0.5, vel: new THREE.Vector3(0, -0.3, 0) }); }
    if (this.poisonT > 0) {
      this.poisonT -= dt; this.poisonTick = (this.poisonTick || 0) - dt;
      if (this.poisonTick <= 0 && !this.god) { this.poisonTick = 0.6; const d = Math.max(1, Math.round(2 * (ctx.enemyDmgMul || 1))); this.hp = Math.max(1, this.hp - d); damageNumber(this.pos, d, 'poison'); }
      if (Math.random() < dt * 6) emit(this.pos.clone().setY(0.5 + Math.random() * 0.8), { frame: F.glow, color: 0xbfff7a, color2: 0x3a8a10, size: 0.35, size2: 0, life: 0.6, vel: new THREE.Vector3(0, 0.8, 0) });
    }
    this.leechBudget = Math.min(this.maxHp * 0.03, (this.leechBudget || 0) + this.maxHp * 0.03 * dt);
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
      if (touch.active) {
        let dx = touch.move.x, dz = touch.move.z;
        if (touch.aim) {
          dx = touch.aim.x;
          dz = touch.aim.z;
        } else if (touch.attack || touch.special || mouse.clicked || mouse.rclicked) {
          let nearest = Infinity;
          for (const enemy of enemies) {
            if (!enemy.alive || enemy.spawning) continue;
            const distance = enemy.pos.distanceToSquared(this.pos);
            if (distance < nearest) {
              nearest = distance;
              dx = enemy.pos.x - this.pos.x;
              dz = enemy.pos.z - this.pos.z;
            }
          }
        }
        if (Math.hypot(dx, dz) > 0.05) this.facing = Math.atan2(dx, dz);
      } else if (pad.active && pad.aim) this.facing = Math.atan2(pad.aim.x, pad.aim.z);
      else {
        const ax = aim.x - this.pos.x, az = aim.z - this.pos.z;
        if (Math.hypot(ax, az) > 0.2) this.facing = Math.atan2(ax, az);
      }
    }

    const input = new THREE.Vector3(
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), 0,
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
    );
    if (touch.active) input.set(touch.move.x, 0, touch.move.z);
    else if (pad.active && Math.hypot(pad.move.x, pad.move.z) > 0) input.set(pad.move.x, 0, pad.move.z);
    if (input.lengthSq() > 1) input.normalize();

    if (pressed.has('KeyQ') && (this.weapons.length > 1 || this.weapon?.altForm)) {
      this.quenchSwap(enemies);
    }

    // Lướt (Bước Bóng Đêm: +8 thể lực, xa hơn 35%, đốt kẻ bị xuyên qua)
    const dashCost = hasDynCurse('shadow_step') ? 30 : 22;
    if (pressed.has('Space') && this.dashStock > 0 && this.stamina < dashCost) { this.stamWarn = 0.4; play('uiBack', { vol: 0.4 }); }
    if (pressed.has('Space') && this.dashStock > 0 && this.stamina >= dashCost) {
      this.stamina -= dashCost; this.stamDelay = 0.5;
      if (this.stats.dashshock) { spawnRing(this.scene, this.pos, 3, 0xfff07a, 0.3); play('zap', { at: this.pos }); for (const e of ctx.enemies) if (e.alive && !e.spawning && e.pos.distanceTo(this.pos) < 3) dealDamage(e, Math.round(10 * this.stats.dmg), { element: 'lightning', element2: null }, null, 0, false, false); }
      if (this.dashStock === this.stats.dashCharges) this.dashCd = this.dashCdMax;
      this.dashStock--;
      this.dashDir.copy(input.lengthSq() > 0.01 ? input.clone().normalize() : this.aimDir());
      this.dashTime = DASH_TIME;
      this.dodgeWindow = DASH_TIME + 0.12;
      this.perfectUsed = false;
      this.dashHit = new Set();
      this.clashSet = new Set();
      this.quenchedThisDash = false;
      this.dashStart = this.pos.clone();
      this.attack = null;
      if (this.charging) this.charging = false;
      this.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
      this.playOnce('Dodge_Forward', 0.35);
      play('dash');
      burst(this.pos.clone().setY(0.2), 0x9fb6d8, 8, { speed: 3, up: 1, size: 0.18, life: 0.35 });
      smoke(this.pos.clone().setY(0.15), { count: 4, color: 0x6a5e52, size: 0.6, life: 0.7, speed: 2, rise: 0.3, alpha: 0.4 });
      // Thợ Săn: lướt đặt Bẫy Kẹp Thép + tự bắn 2 tên xuyên giáp
      if (this.stats.rangerTrap) {
        ctx.onRangerDash?.(this.pos.clone());
        const nearest = enemies.filter((e) => e.alive && !e.spawning).sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos))[0];
        const baseA = nearest ? Math.atan2(nearest.pos.x - this.pos.x, nearest.pos.z - this.pos.z) : this.facing;
        for (const off of [-0.14, 0.14]) {
          const d = new THREE.Vector3(Math.sin(baseA + off), 0, Math.cos(baseA + off));
          spawnOrb(this.pos.clone().setY(1.1), d, this.weapon, Math.round(14 * this.dmgMul()), 0, 28, { bolt: true, pierce: 2 });
        }
      }
      // Độc Thần: Bước Dịch Hạch để lại vũng độc bào tử hại quái
      if (this.stats.toxicStep) {
        spawnRing(this.scene, this.pos, 2.8, 0x8fe83a, 0.4);
        aoe(this.pos, 2.8, Math.round(12 * this.stats.dmg), { element: 'poison', element2: null }, 2);
      }
      if (ctx.onDash) ctx.onDash();
    }

    // Tuyệt kỹ
    if (pressed.has('KeyR') && this.rage >= 100) {
      this.rage = 0;
      this.playOnce('Spellcast_Raise', 0.6, 1.6);
      castUltimate(this);
    }

    // Kỹ năng chuột phải
    const rightDown = mouse.rdown || touch.special || pad.special;
    if (mouse.rclicked && this.specialCd <= 0 && this.stamina < 18) { this.stamWarn = 0.4; }
    if (mouse.rclicked && this.specialCd <= 0 && this.stamina >= 18 && !this.attack && this.dashTime <= 0 && !this.charging) { this.stamina -= 18; this.stamDelay = 0.5; this.useSpecial(enemies); }
    if (this.charging) {
      this.chargeT += dt;
      if (Math.random() < 0.5) burst(this.pos.clone().setY(1.2), this.chargeT >= 1.2 ? 0xffe2a0 : 0xffa040, 1, { speed: 2, up: 1, gravity: 0, life: 0.3, size: 0.12 });
      if (this.anim && this.animLock <= 0) this.anim.play('2H_Melee_Idle', { fade: 0.1 });
      if (!rightDown || mouse.rreleased) this.releaseCharge(enemies);
    }

    // Tấn công
    const attackHeld = mouse.down || touch.attack || pad.attack;
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
      if (this.dashTime <= 0) { this.postDash = 0.3; if (this.stats.phantomstep) this.iframes = Math.max(this.iframes, 0.4); }   // cửa sổ đòn lướt
      const dashSpd = hasDynCurse('shadow_step') ? DASH_SPEED * 1.35 : DASH_SPEED;
      this.vel.copy(this.dashDir).multiplyScalar(dashSpd);
      // Tôi Địa Hình (cơ chế #1): lướt qua Băng/Nước khi lưỡi đang Nóng Đỏ -> hồi độ bền + Sương Mù che đạn
      if (!this.quenchedThisDash && (this.weapon?.heat || 0) >= 45 && (onIce(this.pos.x, this.pos.z) || onWater(this.pos.x, this.pos.z))) {
        this.quenchedThisDash = true;
        this.weapon.heat = 0; this.weapon.overheatT = 0;
        this.weapon.dur = Math.min(100, (this.weapon.dur ?? 100) + 12);
        this.temperedT = Math.max(this.temperedT, 3.8);
        this.recalc();
        spawnSteamCloud(this.pos, 3.6, 4.8);
        damageNumber(this.pos, 'Tôi Địa Hình!', 'react shatter');
        fireRunes(this, 'quench', this.pos, this.dashDir, Math.round(22 * this.dmgMul()));
        progressAwakening(this, 'quench');
        if (this.onWeaponsChanged) this.onWeaponsChanged();
      }
      // Phản Xuyên (Clash Dash — cơ chế #5): lướt thẳng VÀO đòn Xuyên Phá Đỏ-Trắng (teleKind === 'pierce')
      for (const e of enemies) {
        if (!e.alive || e.spawning || e.teleKind !== 'pierce' || this.clashSet.has(e)) continue;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < e.radius + 2.4) {
          const dot = (dx * this.dashDir.x + dz * this.dashDir.z) / (dist || 1);
          if (dot > 0.25) {
            this.clashSet.add(e);
            this.iframes = Math.max(this.iframes, 0.55);
            this.slowmoT = Math.max(this.slowmoT, 0.55);
            this.stamina = Math.min(100, this.stamina + 50);
            this.gainRage(20);
            e.interruptAttack?.(false);
            if (e.poiseMax) e.poise += e.poiseMax * 0.42;
            const cDmg = Math.round(32 * this.dmgMul());
            dealDamage(e, cDmg, this.weapon, this.dashDir.clone(), 14, true, true);
            if (e.isBoss && e.onPartHit) e.onPartHit(cDmg * 1.5, { dir: this.dashDir, crit: true, big: true, clash: true, player: this });
            damageNumber(e.pos, 'Phản Xuyên!', 'react ult');
            spawnRing(this.scene, e.pos, 4.0, 0xff5a8a, 0.45);
            flash(e.pos.clone().setY(1.2), 0xffffff, 4.5, 0.22);
            addShake(0.5); addHitStop(0.1);
            haptic(28);
            play('hammer', { at: e.pos, rate: 1.5 });
            if (this.hasRelic('windcharm')) aoe(this.pos, 4.5, Math.round(18 * this.stats.dmg), { element: 'wind', element2: null }, 18);
            ctx.onClash?.(e);
            fireRunes(this, 'dodge', e.pos, this.dashDir, cDmg);
            progressAwakening(this, 'dodge');
            progressAwakening(this, 'stun');
          }
        }
      }
      if (this.stats.dashStrike || hasDynCurse('shadow_step')) {
        for (const e of enemies) {
          if (!e.alive || e.spawning || this.dashHit.has(e)) continue;
          if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < e.radius + 0.9) {
            this.dashHit.add(e);
            const dVal = (this.stats.dashStrike || 12) * this.stats.dmg;
            dealDamage(e, Math.round(dVal), this.weapon, this.dashDir.clone(), 5, false);
            if (hasDynCurse('shadow_step')) { e.burnT = Math.max(e.burnT, 3); e.burnDps = Math.max(e.burnDps, 8); }
          }
        }
      }
      if (this.hasRelic('ember') || this.stats.firetrail) {
        this.relicT.ember -= dt;
        if (this.relicT.ember <= 0) { this.relicT.ember = 0.05; spawnFirePatch(this.pos, this.stats.firestorm ? 2 : 1.0, 2.5, Math.round(16 * this.stats.dmg)); }
      }
      if (this.dashTime <= 0 && this.stats.phantom && this.dashStart) {
        scheduleBomb(this.dashStart, 0.5, 2.2, Math.round(25 * this.stats.dmg), 0, 0x9fb6ff);
      }
      // Vệt lướt: dải sáng theo thân + bóng mờ
      emit(this.pos.clone().setY(0.9), { frame: F.glow, color: 0x6fc3ff, size: 1.5, size2: 0.4, life: 0.25, alpha: 0.45 });
      if (Math.random() < 0.6) burst(this.pos.clone().setY(0.6), 0x6fc3ff, 2, { speed: 0.5, up: 0.5, gravity: 0, life: 0.25, size: 0.25 });
    } else {
      let slow = this.charging ? 0.4 : this.attack && !this.attack.ranged ? 0.35 : (T.ranged && attackHeld ? 0.75 : 1);
      if (this.slowT > 0) slow *= 0.6;                      // bị làm chậm (băng)
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
