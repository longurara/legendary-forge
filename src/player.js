import * as THREE from 'three';
import { keys, pressed, mouse, pad, touch, haptic } from './input.js';
import { collide } from './world.js';
import { spawnSlash, spawnThrust, burst, addShake, addHitStop, damageNumber, spawnRing, spawnBolt, smoke, flash, hitSpark, emit, F } from './fx.js';
import { TYPES, RARITY, makeWeapon, buildWeaponMesh, buildHeldWeapon, slashColor, applyAffixes, rollAffixes, swapWeaponForm, updateWeaponHeatVisual } from './weapons.js';
import { onIce, onWater, spawnSteamCloud, reactSurface, damagePillars } from './hazards.js';
import { ctx, dealDamage, spawnOrb, spawnBoomerang, spawnSwordWave, spawnFirePatch, spawnToxic, scheduleBomb, aoe, scheduleAftershock, tryCatchBoomerang, spawnLodgedSpear, recallLodgedSpear, hasLodgedSpear, spawnChakram, spawnOrbitDiscs } from './combat.js';
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
  gauntlets: { name: 'Đấm Móc', icon: 'x_mailed-fist', cd: 2.6 },
  whip: { name: 'Xích Kéo', icon: 'x_whip', cd: 3.0 },
  chakram: { name: 'Luân Quỹ Đạo', icon: 'x_chakram', cd: 3.8 },
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
    this.footRing = ring;
    this.footArrow = arrow;
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
    this.riposteT = 0;
    this.axeFury = false;
    this.bowAmmo = 5;
    this.bowMax = 5;
    this.reloadT = 0;
    this.reloadDur = 1.15;
    this.empoweredAmmo = 0;
    this.activeReloadLocked = false;
    this.scytheSouls = 0;
    this.fistFury = 0;
    this.fistFuryT = 0;
    this.momentumStacks = 0;
    this.momentumT = 0;
    this.lodgedSpear = false;
    this.rangedCombo = 0;
    this.novaCount = 0;
    this.eclipsePhase = 0;
    this.phoenixCount = 0;
    this.pendingTimers = [];
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

  aspectOf(type = this.weapon?.type) {
    return (this.meta && this.meta.aspects && this.meta.aspects[type]) || 'default';
  }

  effAtkSpd() {
    let spd = this.stats.atk;
    if (this.weapon?.type === 'gauntlets' && this.fistFury > 0) spd *= 1 + 0.08 * this.fistFury;
    if (this.stats.momentum && this.momentumStacks > 0) spd *= 1 + 0.04 * this.momentumStacks;
    if (this.weapon?.type === 'crossbow' && this.aspectOf('crossbow') === 'repeater') spd *= 1.45;
    return spd;
  }

  later(sec, fn) {
    if (!this.pendingTimers) this.pendingTimers = [];
    this.pendingTimers.push({ t: sec, fn });
  }

  equip(slot) {
    this.slot = slot;
    this.attack = null;
    this.comboIdx = 0;
    this.rangedCombo = 0;
    this.charging = false;
    this.axeFury = false;
    const T = TYPES[this.weapon.type];
    this.reloadDur = T.reloadDur || 1.15;
    if (this.weapon.type === 'crossbow') {
      const aspect = this.aspectOf('crossbow');
      this.bowMax = aspect === 'repeater' ? 8 : (T.mag || 5);
      this.bowAmmo = this.bowMax;
      this.reloadT = 0;
      this.empoweredAmmo = 0;
      this.activeReloadLocked = false;
    } else {
      this.reloadT = 0;
      this.empoweredAmmo = 0;
      this.activeReloadLocked = false;
    }
    this.pivot.clear();
    if (this.held) { this.held.parent?.remove(this.held); this.held = null; }
    if (this.heldL) { this.heldL.parent?.remove(this.heldL); this.heldL = null; }
    if (this.animated && this.hand) {
      this.held = buildHeldWeapon(this.weapon);
      if (this.held) this.hand.add(this.held);
      // Song Dao / Song Quyền: thêm vũ khí tay trái (Song Quyền giữ góc nghiêng model)
      if (T.dual && this.handL) {
        this.heldL = buildHeldWeapon(this.weapon);
        if (this.heldL) {
          if (this.weapon.type === 'gauntlets') this.heldL.rotation.set(-Math.PI / 2, 0, Math.PI);
          else this.heldL.rotation.set(0, 0, 0);
          this.handL.add(this.heldL);
        }
      }
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
    const hyperArmor = this.charging && (this.weapon?.type === 'greatsword' || this.activeSpecialType === 'greatsword');
    if (hyperArmor) dmg = Math.max(1, Math.round(dmg * 0.5));
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
    this.specialCd = 0;
    this.riposteT = 2.5;
    this.stamina = Math.min(100, this.stamina + 30);
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
    if (this.weapon?.type === 'sword' && this.aspectOf('sword') === 'stormblade') {
      const bA = this.facing;
      for (const off of [-0.24, 0, 0.24]) {
        const d = new THREE.Vector3(Math.sin(bA + off), 0, Math.cos(bA + off));
        spawnOrb(this.pos.clone().addScaledVector(d, 0.9).setY(1.05), d, this.weapon, Math.round(16 * mul), 0, 28, { bolt: true, pierce: 2, crit: true });
      }
    }
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

  startAttack(fromClick = false) {
    const w = this.weapon;
    const T = TYPES[w.type];
    const spd = this.effAtkSpd();
    // Bắt Rìu Hoàn Hảo khi rìu đang bay về gần người chơi
    if (w.type === 'axe' && this.boomerangOut && tryCatchBoomerang(this)) {
      this.boomerangOut = false;
      this.axeFury = true;
      this.addHeat(18);
      this.stamina = Math.min(100, this.stamina + 25);
      this.specialCd = Math.min(this.specialCd, 0.5);
      damageNumber(this.pos, 'Bắt Rìu Hoàn Hảo!', 'react perfect');
      play('swap', { rate: 1.45 });
      if (this.aspectOf('axe') === 'berserk_axe') {
        const fDmg = Math.round(18 * this.dmgMul());
        for (let k = 0; k < 4; k++) {
          this.later(k * 0.42, () => {
            if (this.dead) return;
            spawnRing(this.scene, this.pos, 3.6, 0xff7a2a, 0.32);
            aoe(this.pos, 3.6, fDmg, { element: 'fire', element2: null }, 6);
          });
        }
      }
    }
    // Nỏ: nạp tên & Nạp Hoàn Hảo
    if (T.ranged && w.type === 'crossbow') {
      if (this.reloadT > 0) {
        if (fromClick && !this.activeReloadLocked) {
          const prog = 1 - this.reloadT / Math.max(0.1, this.reloadDur);
          if (prog >= 0.42 && prog <= 0.70) {
            this.reloadT = 0;
            this.bowAmmo = this.bowMax;
            this.empoweredAmmo = this.bowMax;
            this.activeReloadLocked = false;
            damageNumber(this.pos, 'Nạp Hoàn Hảo!', 'react perfect');
            spawnRing(this.scene, this.pos, 2.8, 0xffcf4a, 0.3);
            play('swap', { rate: 1.5 });
            haptic(18);
          } else {
            this.activeReloadLocked = true;
            this.reloadT = Math.min(this.reloadDur, this.reloadT + 0.25);
            damageNumber(this.pos, 'Kẹt Cò!', 'burn');
            play('uiBack', { vol: 0.45 });
          }
        }
        return;
      }
      if (this.bowAmmo <= 0) {
        this.reloadDur = Math.max(0.8, (T.reloadDur || 1.15) / Math.sqrt(Math.max(1, spd)));
        this.reloadT = this.reloadDur;
        this.activeReloadLocked = false;
        damageNumber(this.pos, 'Đang nạp tên...', 'ui');
        play('swap', { rate: 0.8 });
        return;
      }
    }
    if (T.ranged) {
      if (this.postDash > 0) {
        this.postDash = 0;
        const dashMap = { staff: 'Sóng Hư Không!', crossbow: 'Trượt Bắn!', chakram: 'Quét Luân!' };
        const dur = 0.24 / spd;
        this.attack = { t: 0, dur, hitAt: 0.08 / spd, ranged: true, dashAtk: true, big: true };
        this.attackCd = (T.shot.cooldown * 0.9) / spd;
        this.playOnce(T.anim, 0.36 / spd);
        damageNumber(this.pos, dashMap[w.type] || 'Lướt Bắn!', 'react perfect');
        return;
      }
      const s = T.shots ? T.shots[this.rangedCombo % T.shots.length] : T.shot;
      if (T.shots) this.rangedCombo = (this.rangedCombo + 1) % T.shots.length;
      this.attack = { t: 0, dur: 0.22 / spd, hitAt: 0.12 / spd, ranged: true, shotSpec: s, big: !!s.big };
      this.attackCd = s.cooldown / spd;
      this.playOnce(T.anim, 0.38 / spd);
      return;
    }
    let c = T.combo[this.comboIdx % T.combo.length];
    if (this.postDash > 0) {
      this.postDash = 0;
      const dashTable = {
        sword: { label: 'Xuyên Kiếm!', anim: '1H_Melee_Attack_Stab', arc: 1.0, range: 3.6, dmg: 18, kb: 12, dur: 0.24, lunge: 11, thrust: true, shake: 0.28, stop: 0.06 },
        axe: { label: 'Bổ Xẻ Lướt!', anim: '2H_Melee_Attack_Chop', arc: 1.6, range: 3.6, dmg: 26, kb: 16, dur: 0.34, lunge: 8, from: 0.9, to: -0.9, poiseMul: 1.8, shake: 0.38, stop: 0.08 },
        greatsword: { label: 'Càn Quét!', anim: '2H_Melee_Attack_Spin', arc: 4.4, range: 4.2, dmg: 30, kb: 18, dur: 0.38, lunge: 8.5, from: 1.4, to: -3.0, poiseMul: 1.6, shake: 0.45, stop: 0.1 },
        daggers: { label: 'Liên Trảm Chéo!', anim: 'Dualwield_Melee_Attack_Slice', arc: 2.4, range: 2.9, dmg: 15, kb: 8, dur: 0.2, lunge: 8, from: 1.1, to: -1.1, doubleCross: true, shake: 0.22, stop: 0.05 },
        spear: { label: 'Thương Phóng Lao!', anim: '2H_Melee_Attack_Stab', arc: 0.75, range: 5.8, dmg: 24, kb: 16, dur: 0.28, lunge: 12, thrust: true, shake: 0.35, stop: 0.08 },
        scythe: { label: 'Vòng Xoáy Tử Thần!', anim: '2H_Melee_Attack_Spin', arc: Math.PI * 2, range: 4.2, dmg: 25, kb: -12, dur: 0.36, lunge: 7, from: 1.2, to: 1.2 - Math.PI * 2, pull: true, shake: 0.4, stop: 0.09 },
        hammer: { label: 'Búa Dộng Đất!', anim: '2H_Melee_Attack_Chop', arc: Math.PI * 2, range: 3.9, dmg: 30, kb: 22, dur: 0.42, lunge: 7.5, from: 1.1, to: -1.1, poiseMul: 2.5, dashSlam: true, shake: 0.55, stop: 0.12 },
        gauntlets: { label: 'Quyền Xung Kích!', anim: 'Dualwield_Melee_Attack_Stab', arc: 2.0, range: 2.8, dmg: 22, kb: 20, dur: 0.22, lunge: 11, thrust: true, poiseMul: 2.0, shake: 0.36, stop: 0.08 },
        whip: { label: 'Roi Quất Ngược!', anim: '1H_Melee_Attack_Slice_Horizontal', arc: 2.6, range: 5.5, dmg: 20, kb: -12, dur: 0.3, lunge: 6, from: -1.3, to: 1.3, pull: true, shake: 0.3, stop: 0.07 },
      };
      const dc = dashTable[w.type] || { label: 'Đâm Lướt!', anim: '1H_Melee_Attack_Stab', arc: 1.0, range: c.range * 1.25, dmg: c.dmg * 1.7, kb: c.kb * 1.8 + 6, dur: c.dur * 0.9, lunge: 9, thrust: true, shake: 0.3, stop: 0.06 };
      c = { ...c, ...dc, big: true, dashAtk: true };
      damageNumber(this.pos, dc.label, 'react perfect');
    } else if (w.type === 'sword' && this.riposteT > 0) {
      this.riposteT = 0;
      this.nextCrit = true;
      c = { ...c, anim: '2H_Melee_Attack_Spin', arc: 3.4, range: 3.8, dmg: 30, kb: 16, dur: 0.3, lunge: 7, from: 1.2, to: -2.2, big: true, riposte: true, shake: 0.45, stop: 0.1 };
      damageNumber(this.pos, 'Phản Kiếm!', 'react perfect');
    } else if (w.type === 'axe' && this.axeFury) {
      this.axeFury = false;
      c = { ...c, anim: '2H_Melee_Attack_Chop', arc: 2.6, range: c.range * 1.2, dmg: Math.round(c.dmg * 1.65), kb: c.kb + 6, big: true, poiseMul: 2.0, axeFury: true, shake: 0.45, stop: 0.1 };
      damageNumber(this.pos, 'Bổ Cuồng Nộ!', 'react melt');
    }
    const dur = c.dur / spd;
    this.attack = { ...c, dur, range: c.range * this.stats.range, t: 0, hitAt: this.animated ? dur * 0.45 : 0, hit: false, big: !!c.big, isLastCombo: !c.dashAtk && !c.riposte && (this.comboIdx % T.combo.length === T.combo.length - 1) };
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
      if (e.interruptAttack?.(true) !== false) {
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
    this.applyOnHitProcs(e, dmg, dealt, dir, kb, big, crit, back, w0, opts);
    return dealt;
  }

  onRangedHit(e, dealt, proj) {
    if (!e || this.dead || proj?.noProc) return;
    const w0 = proj?.weapon || this.weapon;
    const dir = proj?.vel && proj.vel.lengthSq() > 0.01 ? proj.vel.clone().normalize() : this.aimDir();
    this.applyOnHitProcs(e, Math.max(1, dealt || 1), Math.max(1, dealt || 1), dir, 4, !!proj?.big, !!proj?.crit, false, w0, { noBossProc: !!proj?.noBossProc });
  }

  applyOnHitProcs(e, dmg, dealt, dir, kb, big, crit, back, w0, opts = {}) {
    const st = this.stats;
    if ((st.ignite || (back && st.shadowflame) || (this.heatZone(w0) === 'hot' && big)) && e.alive) {
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
    // 6 Phụ tố mới
    if (st.echoHit && !opts.noEcho && e.alive && Math.random() < 0.25) {
      const target = e, eDmg = Math.max(1, Math.round(dmg * 0.45)), eDir = dir ? dir.clone() : this.aimDir();
      this.later(0.18, () => {
        if (this.dead || !target.alive) return;
        flash(target.pos.clone().setY(0.9), 0xb8d8ff, 1.5, 0.12, false);
        dealDamage(target, eDmg, w0, eDir, 2, false, false);
      });
    }
    if (st.shred && e.alive) e.shredT = Math.max(e.shredT || 0, 4.0);
    if (st.momentum) { this.momentumStacks = Math.min(5, (this.momentumStacks || 0) + 1); this.momentumT = 4.0; }
    if (st.elemNova && ++this.novaCount % 5 === 0) {
      const col = slashColor(w0);
      spawnRing(this.scene, e.pos, 3.6, col, 0.38);
      aoe(e.pos, 3.6, Math.max(10, Math.round(dmg * 0.85)), w0, 10, { exclude: e });
      play('explode', { at: e.pos, vol: 0.45, rate: 1.4 });
    }
    // Kiệt tác Tàn Hỏa: mỗi đòn thứ 2 bắn tia lửa xuyên giáp
    if (st.mwSpark && ++this.sparkCount % 2 === 0) {
      const sd = dir || this.aimDir();
      spawnOrb(this.pos.clone().addScaledVector(sd, 0.8).setY(1.0), sd, { element: 'fire', element2: null }, Math.round(dmg * 0.45), 0, 24, { bolt: true, pierce: 2 });
    }
    // Vũ khí huyền thoại (12 công thức rèn & 11 Lõi Boss)
    const lg = w0.legend;
    if (lg === 'blizzard' && Math.random() < 0.2) { spawnRing(this.scene, e.pos, 2.5, 0xbff0ff, 0.4); for (const o of ctx.enemies) if (o.alive && o.pos.distanceTo(e.pos) < 2.5) { o.frozenT = 1.4; o.slowT = 2.5; } }
    if (lg === 'judgement' && crit) { spawnBolt(this.scene, e.pos.clone().setY(9), e.pos.clone().setY(0.5), 0xfff6d0); dealDamage(e, Math.round(dmg * 0.5), { element: 'holy', element2: null }, null, 0, true, false); }
    if (lg === 'plague') for (const o of ctx.enemies) if (o !== e && o.alive && o.pos.distanceTo(e.pos) < 3) { o.poisonStacks = Math.min(8, (o.poisonStacks || 0) + 1); o.poisonT = 4; o.poisonDps = Math.max(o.poisonDps || 0, dmg * 0.1); }
    if (lg === 'phoenix' && ++this.phoenixCount % 4 === 0 && !opts.noBossProc) {
      spawnRing(this.scene, e.pos, 3.2, 0xff7a2a, 0.4);
      aoe(e.pos, 3.2, Math.round(dmg * 0.8), { element: 'fire', element2: 'wind' }, 10);
      for (const o of ctx.enemies) if (o.alive && o.pos.distanceTo(e.pos) < 3.4) { o.burnT = Math.max(o.burnT || 0, 3.5); o.burnDps = Math.max(o.burnDps || 0, dmg * 0.25); }
    }
    if (lg === 'eclipse' && !opts.noBossProc && ++this.eclipsePhase % 2 === 0) {
      const fireTurn = (this.eclipsePhase % 4) === 2;
      spawnRing(this.scene, e.pos, 2.8, fireTurn ? 0xff7a2a : 0x7fdcff, 0.36);
      aoe(e.pos, 2.8, Math.round(dmg * 0.65), { element: fireTurn ? 'fire' : 'ice', element2: null }, 8, { exclude: e });
      if (!fireTurn && e.alive) e.slowT = Math.max(e.slowT || 0, 2.5);
    }
    if (lg === 'supernova' && (big || crit) && !opts.noBossProc) {
      spawnRing(this.scene, e.pos, 2.8, 0xffb84a, 0.38);
      aoe(e.pos, 2.8, Math.round(dmg * 0.75), { element: 'fire', element2: 'lightning' }, 12);
      play('explode', { at: e.pos, vol: 0.45, rate: 1.3 });
    }
    if (lg === 'frostblood' && (e.frozenT > 0 || e.slowT > 0) && !opts.noBossProc) {
      this.heal(3);
      if (e.alive) dealDamage(e, Math.max(1, Math.round(dmg * 0.3)), { element: 'blood', element2: null }, null, 0, false, true);
    }
    if (lg === 'tempest' && !opts.noBossProc && Math.random() < 0.25) {
      let c = 0;
      for (const o of ctx.enemies) {
        if (o === e || !o.alive || o.pos.distanceTo(e.pos) > 6) continue;
        spawnBolt(this.scene, e.pos.clone().setY(1.0), o.pos.clone().setY(1.0), 0xffe14a);
        dealDamage(o, Math.round(dmg * 0.55), { element: 'lightning', element2: 'wind' }, null, 4, true, false);
        if (++c >= 3) break;
      }
    }
    if (lg === 'hemotoxin' && !opts.noBossProc && e.alive && (e.poisonStacks || 0) >= 3) {
      e.poisonStacks = Math.max(0, e.poisonStacks - 3);
      const drain = Math.min(Math.round((e.hp || 0) * 0.18), Math.round(dmg * 2.2 + 40));
      if (drain > 0) {
        dealDamage(e, drain, { element: 'blood', element2: 'poison' }, null, 0, true, false);
        this.heal(2);
      }
    }
    if (lg === 'seraphim' && big && !opts.noBossProc) {
      spawnRing(this.scene, e.pos, 3.0, 0xffe8a0, 0.4);
      aoe(e.pos, 3.0, Math.round(dmg * 0.7), { element: 'fire', element2: 'holy' }, 10);
      addFlame(2);
    }
    if (lg === 'aegis_frost' && crit && !opts.noBossProc) {
      spawnRing(this.scene, e.pos, 2.8, 0x9fe8ff, 0.35);
      for (const o of ctx.enemies) if (o.alive && o.pos.distanceTo(e.pos) < 2.8) { o.slowT = Math.max(o.slowT || 0, 2.5); o.frozenT = Math.max(o.frozenT || 0, 1.0); }
      this.shieldHp = Math.min(24, (this.shieldHp || 0) + 4);
    }
    if (lg === 'boss_slime' && !opts.noBossProc) {
      for (const side of [-0.5, 0.5]) {
        const a = Math.atan2((dir || this.aimDir()).x, (dir || this.aimDir()).z) + side;
        const d2 = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        spawnOrb(e.pos.clone().setY(0.9), d2, { element: 'poison', element2: 'blood' }, Math.round(dmg * 0.35), 1.4, 13, {});
      }
    }
    if (lg === 'boss_shadow' && (crit || back) && e.alive && !opts.noBossProc) {
      const target = e, snapDmg = Math.round(dmg * 0.55), snapDir = (dir || this.aimDir()).clone();
      this.later(0.24, () => {
        if (!target.alive || this.dead) return;
        smoke(target.pos.clone().setY(0.9), { count: 4, color: 0x3a2060, size: 0.9, life: 0.5, alpha: 0.6 });
        flash(target.pos.clone().setY(1.0), 0xb89aff, 2.0, 0.14, false);
        dealDamage(target, snapDmg, { element: 'blood', element2: 'wind' }, snapDir, 5, true, false);
      });
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
    if (w0.awakened && (big || crit) && !opts.noAwakenProc && e.alive && (this.awakenHitCount = (this.awakenHitCount || 0) + 1) % 3 === 0) {
      spawnRing(this.scene, e.pos, 2.8, 0xffe8a0, 0.35);
      aoe(e.pos, 2.8, Math.round(dmg * 0.55), w0, 8, { exclude: e });
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
  }

  detonateDaggerMarks(e, mul) {
    const marks = e.daggerMarks || 0;
    if (marks <= 0) return 0;
    e.daggerMarks = 0;
    e.daggerMarkT = 0;
    const bonusDmg = Math.round((8 + 10 * marks) * mul);
    damageNumber(e.pos, `Nổ ${marks} Sát Ấn!`, 'react ult');
    spawnRing(this.scene, e.pos, 2.4, 0xff5a8a, 0.3);
    burst(e.pos.clone().setY(1.0), 0xff5a8a, 12 + marks * 4, { speed: 6, size: 0.13 });
    play('hitHeavy', { at: e.pos, rate: 1.3 });
    dealDamage(e, bonusDmg, this.weapon, this.aimDir(), 6, true, true);
    if (this.dashStock < this.stats.dashCharges) { this.dashStock++; this.dashCd = this.dashStock < this.stats.dashCharges ? this.dashCdMax : 0; }
    else this.stamina = Math.min(100, this.stamina + 25);
    return marks;
  }

  resolveHit(enemies) {
    const a = this.attack;
    const w = this.weapon;
    const T = TYPES[w.type];
    const mul = this.dmgMul();
    if (a.ranged) {
      const s = a.shotSpec || T.shot;
      const dir = this.aimDir();
      const origin = this.pos.clone().addScaledVector(dir, 1.2).setY(1.0);
      const crit = this.rollCrit();
      if (a.dashAtk) {
        const dashDmg = Math.round(s.dmg * 1.45 * mul * (crit ? this.stats.critMult : 1));
        if (w.type === 'staff') {
          for (const e of enemies) {
            if (!e.alive || e.spawning || e.pos.distanceTo(this.pos) > 3.6 + e.radius) continue;
            const d = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
            e.knock.addScaledVector(d, 10);
          }
          for (const off of [-0.24, 0, 0.24]) {
            const ang = Math.atan2(dir.x, dir.z) + off;
            spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), w, Math.round(dashDmg * 0.7), 1.3, s.speed * this.stats.range, { bounces: this.stats.bounce, markArcane: true, crit });
          }
        } else if (w.type === 'crossbow') {
          const isEmp = (this.empoweredAmmo || 0) > 0;
          if (isEmp) this.empoweredAmmo--;
          this.bowAmmo = Math.max(0, (this.bowAmmo ?? this.bowMax) - 1);
          const rep = this.aspectOf('crossbow') === 'repeater';
          for (const off of [-0.14, 0, 0.14]) {
            const ang = Math.atan2(dir.x, dir.z) + off;
            spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), w, Math.round(dashDmg * (isEmp ? 0.8 : 0.65)), 0, s.speed * this.stats.range, { bolt: true, pierce: s.pierce + (this.stats.ricochet ? 1 : 0), explode: false, explodeRadius: isEmp && rep ? 2.4 : 0, crit, big: isEmp });
          }
          if (this.bowAmmo <= 0) {
            this.reloadDur = Math.max(0.8, (T.reloadDur || 1.15) / Math.sqrt(Math.max(1, this.effAtkSpd())));
            this.reloadT = this.reloadDur;
            this.activeReloadLocked = false;
          }
        } else if (w.type === 'chakram') {
          spawnSlash(this.scene, this.pos, this.facing, Math.PI * 2, 3.2, slashColor(w), false);
          aoe(this.pos, 3.2, Math.round(12 * mul), w, 8);
          const extraB = (this.aspectOf('chakram') === 'infinite_ring' ? 2 : 0) + (this.stats.ricochet ? 1 : 0);
          spawnChakram(this, origin, dir, w, dashDmg, { bounces: 3 + extraB, speed: s.speed * this.stats.range, crit, big: true });
        }
        this.addHeat(4);
        this.gainRage(6);
        play('cast', { rate: 1.15 });
        addShake(0.14);
        return;
      }
      const shotDmg = Math.round(s.dmg * mul * (crit ? this.stats.critMult : 1));
      if (w.type === 'chakram') {
        const extraB = (this.aspectOf('chakram') === 'infinite_ring' ? 2 : 0) + (this.stats.ricochet ? 1 : 0);
        if (s.twinReturn) {
          for (const off of [-0.22, 0.22]) {
            const ang = Math.atan2(dir.x, dir.z) + off;
            spawnChakram(this, origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), w, shotDmg, { bounces: (s.bounces || 3) + extraB, speed: s.speed * this.stats.range, crit, big: true });
          }
        } else {
          spawnChakram(this, origin, dir, w, shotDmg, { bounces: (s.bounces || 3) + extraB, speed: s.speed * this.stats.range, crit });
        }
      } else if (w.type === 'crossbow') {
        this.bowAmmo = Math.max(0, (this.bowAmmo ?? this.bowMax) - 1);
        const isEmp = (this.empoweredAmmo || 0) > 0;
        if (isEmp) this.empoweredAmmo--;
        const rep = this.aspectOf('crossbow') === 'repeater';
        const pierce = s.pierce + (this.stats.ricochet ? 1 : 0) + (isEmp && !rep ? 2 : 0);
        const bDmg = Math.round(shotDmg * (isEmp ? (rep ? 1.35 : 1.45) : 1));
        spawnOrb(origin, dir, w, bDmg, 0, s.speed * this.stats.range, { bolt: true, pierce, explode: false, explodeRadius: isEmp && rep ? 2.5 : 0, crit: crit || isEmp, big: isEmp });
        if (isEmp) burst(origin, 0xffcf4a, 6, { speed: 4, size: 0.1 });
        if (this.bowAmmo <= 0) {
          this.reloadDur = Math.max(0.8, (T.reloadDur || 1.15) / Math.sqrt(Math.max(1, this.effAtkSpd())));
          this.reloadT = this.reloadDur;
          this.activeReloadLocked = false;
        }
      } else if (s.volley) {
        for (const off of [-0.2, 0, 0.2]) {
          const ang = Math.atan2(dir.x, dir.z) + off;
          spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), w, shotDmg, s.splash, s.speed * this.stats.range, { bounces: this.stats.bounce, markArcane: true, crit, big: true });
        }
        if (this.aspectOf('staff') === 'astral_spire') {
          const near = enemies.filter((e) => e.alive && !e.spawning && e.pos.distanceTo(this.pos) < 14).sort((a2, b2) => a2.pos.distanceToSquared(this.pos) - b2.pos.distanceToSquared(this.pos))[0];
          const baseA = near ? Math.atan2(near.pos.x - this.pos.x, near.pos.z - this.pos.z) : Math.atan2(dir.x, dir.z);
          for (const off of [-0.14, 0, 0.14]) {
            const ang = baseA + off;
            spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), w, Math.round(shotDmg * 0.7), 0, 26, { bolt: true, pierce: 1, crit });
          }
        }
      } else {
        spawnOrb(origin, dir, w, shotDmg, s.splash, s.speed * this.stats.range, { bounces: this.stats.bounce, markArcane: true, crit });
      }
      if (w.legend === 'boss_mage') {
        for (const off of [-0.25, 0.25]) {
          const ang = Math.atan2(dir.x, dir.z) + off;
          spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), w, Math.round(shotDmg * 0.55), 0.8, s.speed * this.stats.range, { bounces: 2, noBossProc: true });
        }
      }
      if (w.legend === 'boss_dragon_ice') {
        for (const off of [-0.18, 0.18]) {
          const ang = Math.atan2(dir.x, dir.z) + off;
          spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), { element: 'ice', element2: 'wind' }, Math.round(shotDmg * 0.55), 0, s.speed * this.stats.range, { bolt: true, pierce: 2, noBossProc: true });
        }
      }
      if (w.legend === 'boss_plague') {
        for (const off of [-0.2, 0.2]) {
          const ang = Math.atan2(dir.x, dir.z) + off;
          spawnOrb(origin, new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), { element: 'poison', element2: 'blood' }, Math.round(shotDmg * 0.45), 1.6, s.speed * 0.9 * this.stats.range, { noBossProc: true });
        }
      }
      this.addHeat(3.2 / Math.sqrt(Math.max(1, this.effAtkSpd())));
      this.gainRage(3);
      play('cast');
      addShake(0.05);
      return;
    }
    this.lunge = a.lunge;
    play('swing', { rate: w.type === 'sword' || w.type === 'gauntlets' ? 1.15 : 0.8 });
    const col = slashColor(w);
    if (a.thrust) spawnThrust(this.scene, this.pos, this.facing, a.range, col);
    else if (a.doubleCross) {
      spawnSlash(this.scene, this.pos, this.facing, a.arc, a.range, col, true);
      spawnSlash(this.scene, this.pos, this.facing, a.arc, a.range, col, false);
    } else spawnSlash(this.scene, this.pos, this.facing, a.arc, a.range, col, a.from < a.to);

    const aimD = this.aimDir();
    // Hóa học bề mặt & Phá cột đá bằng đòn nặng (Chiến Chùy phá cột ngay cả bằng đòn thường!)
    const surfPos = this.pos.clone().addScaledVector(aimD, a.range * 0.65);
    for (const el of [w.element, w.element2]) if (el && el !== 'none') reactSurface(surfPos, a.range * 0.55, el, aimD, a.dmg * mul);
    if (a.big || w.type === 'greatsword' || T.heavy) damagePillars(surfPos, a.range * 0.55, aimD, a.big || T.heavy);

    let hitAny = false;
    let maxMarksDetonated = 0;
    let farthestMarked = null;
    let farthestDist = -1;
    let chainCount = 0;
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
      let sweetMul = 1;
      // Điểm Ngọt đầu mũi Thương & Xích Liềm (38% đầu mút tầm đánh)
      if ((w.type === 'spear' || w.type === 'whip') && dist >= a.range * 0.62) {
        sweetMul = 1.35;
        this.nextCrit = true;
        damageNumber(e.pos, w.type === 'spear' ? 'Điểm Ngọt!' : 'Quất Trúng Đỉnh!', 'react perfect');
        if (w.type === 'whip' && this.aspectOf('whip') === 'storm_lash' && chainCount < 2) {
          let c = 0;
          for (const o of enemies) {
            if (o === e || !o.alive || o.pos.distanceTo(e.pos) > 4.5) continue;
            spawnBolt(this.scene, e.pos.clone().setY(0.9), o.pos.clone().setY(0.9), 0xffe14a);
            dealDamage(o, Math.round(a.dmg * mul * 0.7), { element: 'lightning', element2: null }, null, 4, true, false);
            chainCount++;
            if (++c >= 2) break;
          }
        }
      }
      // Song Dao: tích Sát Ấn (tối đa 4) & kích nổ ở đòn cuối / đòn lướt
      if (w.type === 'daggers') {
        if (a.isLastCombo || a.dashAtk) {
          const det = this.detonateDaggerMarks(e, mul);
          if (det > maxMarksDetonated) maxMarksDetonated = det;
          if (det >= 3 && dist > farthestDist) { farthestDist = dist; farthestMarked = e; }
        } else if (e.alive) {
          e.daggerMarks = Math.min(4, (e.daggerMarks || 0) + 1);
          e.daggerMarkT = 6.0;
        }
      }
      const hitDir = new THREE.Vector3(dx, 0, dz).normalize();
      this.strike(e, a.dmg * mul * sweetMul, a.pull ? hitDir.clone().negate() : hitDir, Math.abs(a.kb), a.big, { canInterrupt: a.big || T.heavy, poiseMul: a.poiseMul || 1 });
      if ((w.type === 'hammer' || a.dashSlam) && e.alive) e.slamWatchT = 0.55;
      hitAny = true;
    }
    this.hitBarrels(a.range, a.arc);
    if (hitAny) {
      if (w.type === 'gauntlets') {
        this.fistFury = Math.min(5, (this.fistFury || 0) + 1);
        this.fistFuryT = 3.5;
      }
      if (w.type === 'scythe') {
        this.scytheSouls = Math.min(5, (this.scytheSouls || 0) + 1);
        if (this.scytheSouls >= 5 && this.aspectOf('scythe') === 'void_reaper') {
          const near = enemies.filter((e) => e.alive && !e.spawning).sort((a2, b2) => a2.pos.distanceToSquared(this.pos) - b2.pos.distanceToSquared(this.pos))[0];
          const wDir = near ? new THREE.Vector3(near.pos.x - this.pos.x, 0, near.pos.z - this.pos.z).normalize() : aimD;
          spawnSwordWave(this.pos.clone().addScaledVector(wDir, 0.9), wDir, { ...w, element: 'blood' }, Math.round(a.dmg * mul * 0.7), 1.15);
        }
      }
    }
    if (w.type === 'daggers' && maxMarksDetonated >= 3 && this.aspectOf('daggers') === 'shadow_fang' && farthestMarked?.alive) {
      const fTarget = farthestMarked;
      this.later(0.08, () => {
        if (this.dead || !fTarget.alive) return;
        const backOff = fTarget.facing != null ? new THREE.Vector3(-Math.sin(fTarget.facing), 0, -Math.cos(fTarget.facing)) : aimD.clone().negate();
        const dest = fTarget.pos.clone().addScaledVector(backOff, 1.3);
        collide(dest, this.radius);
        this.pos.copy(dest);
        this.facing = Math.atan2(fTarget.pos.x - this.pos.x, fTarget.pos.z - this.pos.z);
        this.nextCrit = true;
        spawnSlash(this.scene, this.pos, this.facing, 2.2, 2.8, 0xff5a8a, true);
        this.strike(fTarget, 22 * mul, this.aimDir(), 6, true, { noBossProc: true });
      });
    }
    if ((w.type === 'hammer' && a.isLastCombo) || a.dashSlam) {
      const colossus = this.aspectOf('hammer') === 'forge_colossus';
      const aCenter = this.pos.clone().addScaledVector(aimD, a.range * 0.55);
      scheduleAftershock(aCenter, 0.45, 3.4, Math.round(a.dmg * mul * 0.55), w, { stun: 0.7, poiseMul: colossus ? 2.4 : 1.6, color: 0xffcf4a });
      if (colossus) scheduleAftershock(aCenter, 0.85, 4.4, Math.round(a.dmg * mul * 0.65), w, { stun: 0.9, poiseMul: 2.6, color: 0xff8a2a });
    }
    if (a.riposte || (w.type === 'sword' && this.aspectOf('sword') === 'stormblade' && this.comboIdx === 2)) {
      spawnSwordWave(this.pos.clone().addScaledVector(aimD, 0.9), aimD, w, Math.round(a.dmg * mul * (a.riposte ? 0.85 : 0.65)), a.riposte ? 1.35 : 1.15);
    }
    if (a.isLastCombo && this.stats.vortexFinisher) {
      spawnRing(this.scene, surfPos, 4.5, 0x9fe8d0, 0.35);
      for (const e of enemies) {
        if (!e.alive || e.isBoss || e.pos.distanceTo(surfPos) > 5.5) continue;
        e.knock.set(surfPos.x - e.pos.x, 0, surfPos.z - e.pos.z).normalize().multiplyScalar(11);
      }
    }
    if (a.isLastCombo && this.stats.ricochet) {
      const baseA = Math.atan2(aimD.x, aimD.z);
      for (const off of [-0.25, 0.25]) {
        const d = new THREE.Vector3(Math.sin(baseA + off), 0, Math.cos(baseA + off));
        spawnOrb(this.pos.clone().addScaledVector(d, 0.8).setY(1.0), d, w, Math.round(a.dmg * mul * 0.45), 0, 22, { bolt: true, pierce: 1 });
      }
    }
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

  onCatchChakram(p) {
    if (this.dead) return;
    this.attackCd = Math.min(this.attackCd, 0.08);
    this.stamina = Math.min(100, this.stamina + 12);
    this.nextCrit = true;
    this.gainRage(4);
    burst(this.pos.clone().setY(1.0), 0xffe2a0, 8, { speed: 4, size: 0.1 });
    play('swap', { rate: 1.48, vol: 0.45 });
    damageNumber(this.pos, 'Bắt Luân!', 'react perfect');
  }

  // ---------- Kỹ năng chuột phải (hỗ trợ 12 vũ khí + Ghép Chiêu & Phóng Nhiệt) ----------
  useSpecial(enemies) {
    const prevTag = ctx.dmgTag;
    ctx.dmgTag = 'special';
    try { this._useSpecial(enemies); } finally { ctx.dmgTag = prevTag; }
  }
  _useSpecial(enemies) {
    const w = this.weapon;
    const spType = this.activeSpecialType;
    if (spType === 'axe' && this.boomerangOut) return;
    if (spType === 'spear' && hasLodgedSpear(this)) {
      recallLodgedSpear(this);
      this.specialCd = this.specialCdMax;
      play('swap', { rate: 1.4 });
      damageNumber(this.pos, 'Thu Thương!', 'react perfect');
      return;
    }
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
        if (e.interruptAttack?.(true) !== false) {
          damageNumber(e.pos, 'Cắt Chiêu!', 'react ult');
          spawnRing(this.scene, e.pos, 3.6, 0xd070ff, 0.45);
          play('hammer', { at: e.pos, rate: 1.4 });
          dealDamage(e, Math.round(24 * mul), fireW, new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize(), 12, true, false);
          progressAwakening(this, 'stun');
          if (ctx.onSpellBreak) ctx.onSpellBreak(e);
        }
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
      spawnOrb(this.pos.clone().addScaledVector(dir, 1.3).setY(1.1), dir, fireW, Math.round(32 * mul), 0, 10, { big: true, crit: hot });
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
        spawnOrb(this.pos.clone().addScaledVector(dir, 0.8).setY(1.1), dir, fireW, Math.round(9 * mul), 0, 26, { bolt: true, pierce: hot ? 2 : 1, knife: true, detonateMarks: true });
      }
      this.specialCd = this.specialCdMax;
      this.playOnce('Throw', 0.3, 1.4);
      play('swing', { rate: 1.5 });
    } else if (spType === 'crossbow') {
      const dir = this.aimDir();
      spawnOrb(this.pos.clone().addScaledVector(dir, 1).setY(1.1), dir, fireW, Math.round(30 * mul), 0, 24, { bolt: true, pierce: 0, explode: true, explodeRadius: 3.2, crit: hot, big: true });
      if (hot) spawnFirePatch(this.pos.clone().addScaledVector(dir, 4.5), 2.5, 3.2, Math.round(14 * this.stats.dmg));
      this.specialCd = this.specialCdMax;
      this.playOnce('2H_Ranged_Shoot', 0.4, 0.8);
      play('swing', { rate: 0.6 });
    } else if (spType === 'greatsword') {
      this.charging = true;
      this.chargeT = hot ? 0.55 : 0; // Phóng Nhiệt rút ngắn thời gian tích lực
      this.hotCharge = hot;
    } else if (spType === 'spear') {
      // Ném Thương Cắm Sàn (bấm Chuột Phải lần 2 thu thương xuyên ngược!)
      const dir = this.aimDir();
      spawnLodgedSpear(this, this.pos.clone().addScaledVector(dir, 1.0), dir, fireW, Math.round(28 * mul), { thunderAspect: this.aspectOf('spear') === 'thunder_lance' });
      if (hot) spawnSwordWave(this.pos.clone().addScaledVector(dir, 1.2), dir, fireW, Math.round(24 * mul), 1.3);
      this.specialCd = 0.25;
      this.playOnce('Throw', 0.35, 1.2);
      play('swing', { rate: 1.35 });
    } else if (spType === 'scythe') {
      // Gặt Hồn: tiêu thụ Mảnh Hồn tăng tầm & ST; ≥3 Mảnh gọi Chém Bóng Tối trễ
      const souls = this.scytheSouls || 0;
      this.scytheSouls = 0;
      const R = (hot ? 5.2 : 4.4) + souls * 0.22;
      const sMul = 1 + souls * 0.16;
      spawnSlash(this.scene, this.pos, this.facing, Math.PI * 2, R, hot ? 0xff7a2a : 0xd080ff, false);
      spawnRing(this.scene, this.pos, R, hot ? 0xff7a2a : 0xc070ff, 0.45);
      addFlame(12);
      let hitC = 0;
      for (const e of enemies) {
        if (!e.alive || e.spawning || e.pos.distanceTo(this.pos) > R + e.radius) continue;
        const low = e.hp < (e.maxHpEff || e.maxHp || e.hp) * 0.45;
        const d = new THREE.Vector3(this.pos.x - e.pos.x, 0, this.pos.z - e.pos.z).normalize();
        this.strike(e, (low ? 42 : 24) * sMul * mul, d, 8, true, { canInterrupt: true, noHeat: hot });
        hitC++;
      }
      if (souls >= 3) {
        damageNumber(this.pos, `Gặt ${souls} Hồn!`, 'react ult');
        this.later(0.36, () => {
          if (this.dead) return;
          spawnSlash(this.scene, this.pos, this.facing + 1.2, Math.PI * 2, R * 1.1, 0xb870ff, true);
          spawnRing(this.scene, this.pos, R * 1.1, 0xb870ff, 0.4);
          aoe(this.pos, R * 1.1, Math.round(28 * sMul * mul), { ...fireW, element: 'blood' }, 8);
          play('hitHeavy', { at: this.pos, rate: 1.1 });
        });
      }
      if (hitC > 0 || souls > 0) this.heal(Math.min(18, hitC * 3 + souls * 2));
      this.specialCd = this.specialCdMax;
      this.playOnce('2H_Melee_Attack_Spin', 0.42);
      play('hitHeavy', { rate: 0.9 }); addShake(0.42);
    } else if (spType === 'hammer') {
      // Chấn Động Lò Rèn: đập đất tạo sóng chấn động 4.8m + Dư Chấn trễ & đập sập cột đá
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
      const colossus = this.aspectOf('hammer') === 'forge_colossus';
      scheduleAftershock(center, 0.42, R * 0.9, Math.round(24 * mul), fireW, { stun: 1.0, poiseMul: colossus ? 2.8 : 2.0, color: 0xffcf4a });
      if (colossus) scheduleAftershock(center, 0.85, R * 1.15, Math.round(28 * mul), fireW, { stun: 1.2, poiseMul: 3.0, color: 0xff8a2a });
      this.hitBarrels(R, Math.PI * 2);
      this.specialCd = this.specialCdMax;
      this.playOnce('2H_Melee_Attack_Chop', 0.45);
      play('explode', { at: center, rate: 0.8, vol: 0.75 }); addShake(0.6);
    } else if (spType === 'gauntlets') {
      // Đấm Móc: xung kích hất văng kích Đập Dội; cường hóa theo Liên Quyền
      const fury = this.fistFury || 0;
      const fMul = 1 + fury * 0.15;
      const aimD = this.aimDir();
      this.lunge = 10;
      const center = this.pos.clone().addScaledVector(aimD, 1.8);
      spawnThrust(this.scene, this.pos, this.facing, 3.6, hot ? 0xff7a2a : slashColor(w));
      spawnRing(this.scene, center, 3.2, 0xffb84a, 0.38);
      burst(center.clone().setY(0.8), 0xffcf4a, 24, { speed: 9, size: 0.16 });
      damageNumber(this.pos, fury > 0 ? `Đấm Móc ×${fury}!` : 'Đấm Móc!', 'react perfect');
      for (const e of enemies) {
        if (!e.alive || e.spawning || e.pos.distanceTo(center) > 3.2 + e.radius) continue;
        const d = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
        this.strike(e, 30 * fMul * mul, d, 22, true, { canInterrupt: true, poiseMul: 2.4, noHeat: hot });
        if (e.alive) e.slamWatchT = 0.75;
      }
      if (this.aspectOf('gauntlets') === 'meteor_fist') {
        const mCenter = this.pos.clone().addScaledVector(aimD, 3.2);
        scheduleAftershock(mCenter, 0.4, 4.2, Math.round(34 * fMul * mul), { ...fireW, element: 'fire' }, { stun: 1.1, poiseMul: 2.4, color: 0xff5a1a });
        spawnFirePatch(mCenter, 2.5, 3.5, Math.round(14 * this.stats.dmg));
      }
      this.hitBarrels(3.6, 2.2);
      this.specialCd = this.specialCdMax;
      this.playOnce('Dualwield_Melee_Attack_Stab', 0.34);
      play('hitHeavy', { rate: 1.15 }); addShake(0.48);
    } else if (spType === 'whip') {
      // Xích Kéo: quất tầm xa 7.2m kéo gom toàn bộ quái về trước mặt & làm choáng
      const R = (hot ? 8.2 : 7.2) * this.stats.range;
      const aimD = this.aimDir();
      spawnThrust(this.scene, this.pos, this.facing, R, hot ? 0xff7a2a : slashColor(w));
      spawnSlash(this.scene, this.pos, this.facing, 1.5, R * 0.85, hot ? 0xff7a2a : 0xffd080, false);
      damageNumber(this.pos, 'Xích Kéo!', 'react perfect');
      const gather = this.pos.clone().addScaledVector(aimD, 2.0);
      for (const e of enemies) {
        if (!e.alive || e.spawning) continue;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > R + e.radius) continue;
        let diff = Math.atan2(dx, dz) - this.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > 0.82 + Math.atan2(e.radius, Math.max(dist, 0.1))) continue;
        if (!e.isBoss) {
          const dest = gather.clone();
          collide(dest, e.radius);
          e.pos.copy(dest);
          e.stunT = Math.max(e.stunT, 0.9);
        }
        const pullD = new THREE.Vector3(this.pos.x - e.pos.x, 0, this.pos.z - e.pos.z).normalize();
        this.strike(e, 24 * mul, pullD, 4, true, { canInterrupt: true, noHeat: hot });
      }
      this.specialCd = this.specialCdMax;
      this.playOnce('1H_Melee_Attack_Slice_Horizontal', 0.38);
      play('swing', { rate: 1.25 }); addShake(0.32);
    } else if (spType === 'chakram') {
      // Luân Quỹ Đạo: gọi đĩa quay quanh thân cắt địch liên tục
      const inf = this.aspectOf('chakram') === 'infinite_ring';
      spawnOrbitDiscs(this, fireW, Math.round(14 * mul), hot ? 3 : 2, inf ? 3.6 : 2.8, 4.5);
      damageNumber(this.pos, 'Luân Quỹ Đạo!', 'react ult');
      this.specialCd = this.specialCdMax;
      this.playOnce('Spellcast_Long', 0.42, 2.0);
      play('cast', { rate: 1.25 });
    }
  }

  releaseCharge(enemies) {
    this.charging = false;
    const hot = !!this.hotCharge;
    this.hotCharge = false;
    const sweet = this.chargeT >= 0.85 && this.chargeT <= 1.35;
    const k = Math.min(1, this.chargeT / 1.2);
    const mul = this.dmgMul() * (this.stats.specialPower || 1) * (hot ? 1.35 : 1) * (sweet ? 1.5 : 1);
    if (sweet) { this.nextCrit = true; damageNumber(this.pos, 'Trảm Tuyệt Đỉnh!', 'react ult'); }
    const range = 4.6 * this.stats.range, arc = 2.4;
    this.specialCd = this.specialCdMax;
    this.playOnce('2H_Melee_Attack_Slice', 0.45);
    spawnSlash(this.scene, this.pos, this.facing, arc, range, sweet ? 0xffe2a0 : hot ? 0xff7a2a : slashColor(this.weapon), false);
    play(k > 0.8 || sweet ? 'hitHeavy' : 'swing', { rate: 0.7 });
    addShake(0.2 + k * 0.5);
    this.lunge = 6 + k * 6;
    const aimD = this.aimDir();
    const hitCenter = this.pos.clone().addScaledVector(aimD, range * 0.6);
    damagePillars(hitCenter, range * 0.65, aimD, k > 0.5 || sweet);
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
      this.strike(e, (20 + 45 * k) * mul, new THREE.Vector3(dx, 0, dz).normalize(), 8 + 14 * k, k > 0.5 || sweet, { canInterrupt: true });
    }
    this.hitBarrels(range, arc);
    if (sweet) scheduleAftershock(hitCenter, 0.35, 3.8, Math.round(26 * mul), this.weapon, { stun: 0.9, poiseMul: 2.0, color: 0xffe2a0 });
    if (k > 0.88 || sweet) {
      addHitStop(0.1);
      if (this.aspectOf('greatsword') === 'mountain_cleaver') {
        const bA = Math.atan2(aimD.x, aimD.z);
        for (const off of [-0.28, 0, 0.28]) {
          const d = new THREE.Vector3(Math.sin(bA + off), 0, Math.cos(bA + off));
          spawnSwordWave(this.pos.clone().addScaledVector(d, 1), d, this.weapon, Math.round(24 * mul), 1.3);
        }
      } else {
        spawnSwordWave(this.pos.clone().addScaledVector(aimD, 1), aimD, this.weapon, Math.round(30 * mul), 1.4);
      }
    }
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
    if (this.pendingTimers && this.pendingTimers.length) {
      for (let i = this.pendingTimers.length - 1; i >= 0; i--) {
        const pt = this.pendingTimers[i];
        pt.t -= dt;
        if (pt.t <= 0) {
          this.pendingTimers.splice(i, 1);
          pt.fn();
        }
      }
    }
    this.iframes = Math.max(0, this.iframes - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.riposteT = Math.max(0, (this.riposteT || 0) - dt);
    if (this.fistFuryT > 0) {
      this.fistFuryT -= dt;
      if (this.fistFuryT <= 0) this.fistFury = 0;
    }
    if (this.momentumT > 0) {
      this.momentumT -= dt;
      if (this.momentumT <= 0) this.momentumStacks = 0;
    }
    if (this.reloadT > 0) {
      this.reloadT = Math.max(0, this.reloadT - dt);
      if (this.reloadT <= 0) {
        this.bowAmmo = this.bowMax || 5;
        this.empoweredAmmo = 0;
        this.activeReloadLocked = false;
        play('swap', { rate: 1.1, vol: 0.4 });
      }
    }
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

    // Kỹ năng chuột phải (bao gồm Thu Thương không tốn cooldown/thể lực nếu đã cắm thương)
    const rightDown = mouse.rdown || touch.special || pad.special;
    if (mouse.rclicked && this.activeSpecialType === 'spear' && hasLodgedSpear(this) && !this.attack && this.dashTime <= 0 && !this.charging) {
      this.useSpecial(enemies);
    } else {
      if (mouse.rclicked && this.specialCd <= 0 && this.stamina < 18) { this.stamWarn = 0.4; }
      if (mouse.rclicked && this.specialCd <= 0 && this.stamina >= 18 && !this.attack && this.dashTime <= 0 && !this.charging) { this.stamina -= 18; this.stamDelay = 0.5; this.useSpecial(enemies); }
    }
    if (this.charging) {
      const chMul = this.aspectOf('greatsword') === 'mountain_cleaver' ? 1.3 : 1;
      this.chargeT += dt * chMul;
      const inSweet = this.chargeT >= 0.85 && this.chargeT <= 1.35;
      if (Math.random() < 0.55) burst(this.pos.clone().setY(1.2), inSweet ? 0xfff6a0 : this.chargeT >= 1.2 ? 0xffe2a0 : 0xffa040, 1, { speed: 2, up: 1, gravity: 0, life: 0.3, size: inSweet ? 0.17 : 0.12 });
      if (this.anim && this.animLock <= 0) this.anim.play('2H_Melee_Idle', { fade: 0.1 });
      if (!rightDown || mouse.rreleased) this.releaseCharge(enemies);
    }

    // Tấn công
    const attackHeld = mouse.down || touch.attack || pad.attack;
    if (mouse.clicked && this.attack && !this.attack.ranged) this.queued = true;
    if ((mouse.clicked || attackHeld || this.queued) && !this.attack && this.dashTime <= 0 && this.attackCd <= 0 && !this.charging) {
      this.queued = false;
      if (this.comboTimer <= 0) this.comboIdx = 0;
      this.startAttack(!!mouse.clicked);
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
    if (this.held) this.held.visible = !(this.weapon.type === 'axe' && this.boomerangOut) && !(this.weapon.type === 'spear' && this.lodgedSpear);

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
