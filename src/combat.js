import * as THREE from 'three';
import { burst, spawnBolt, damageNumber, spawnRing, spawnTelegraph, addShake, explosion, flame, emit, F, glowSprite, flash, hitSpark } from './fx.js';
import { isBlocked } from './world.js';
import { ELEMENTS, buildWeaponMesh } from './weapons.js';
import { play } from './audio.js';

// Ngữ cảnh dùng chung, main.js gán vào. barrels: thùng nổ (hazards.js)
export const ctx = { scene: null, player: null, enemies: [], barrels: [], onHit: null, onReaction: null };
const NONE = { element: 'none', element2: null };
const _tmpP = new THREE.Vector3();
const _tmpV = new THREE.Vector3();
const _tmpD = new THREE.Vector3();
let _dmgDepth = 0;
const frameCombat = { aoeChains: 0, fireBursts: 0, surfaces: 0, surfaceSet: new Set() };
export function resetCombatFrame() {
  frameCombat.aoeChains = 0;
  frameCombat.fireBursts = 0;
  frameCombat.surfaces = 0;
  frameCombat.surfaceSet.clear();
}

function react(enemy, text, color, dmg = 16) {
  damageNumber(enemy.pos, text, 'react ' + color);
  if (ctx.onReaction) ctx.onReaction(text, enemy, dmg);
  ctx.recordDmg?.('react', Math.round(dmg * 0.5));
}

// ---------- Gây sát thương + hiệu ứng / phản ứng nguyên tố ----------
// Trả về sát thương thực gây ra
export function dealDamage(enemy, dmg, weapon, dir, kb, crit, allowChain = true) {
  if (!enemy || !enemy.alive) return 0;
  _dmgDepth++;
  if (_dmgDepth >= 3) allowChain = false;
  try {
  const els = [weapon.element, weapon.element2].filter((e) => e && e !== 'none');
  let mult = enemy.shredT > 0 ? 1.2 : 1;
  // Tương tác với trạng thái Ướt (từ Vũng Nước / Băng tan trong Hóa Học Bề Mặt)
  if (enemy.wetT > 0) {
    for (const el of els) {
      if (el === 'lightning') {
        mult *= 1.8;
        enemy.wetT = Math.max(0, enemy.wetT - 1.5);
        react(enemy, 'Điện Dẫn!', 'overload', dmg);
        play('zap', { at: enemy.pos, rate: 1.25 });
      } else if (el === 'ice') {
        enemy.wetT = 0;
        enemy.frozenT = Math.max(enemy.frozenT, 1.8);
        enemy.slowT = Math.max(enemy.slowT, 3.2);
        react(enemy, 'Đóng Băng!', 'shatter', dmg);
        play('freeze', { at: enemy.pos });
      }
    }
  }
  // Phản ứng giữa nguyên tố mới và trạng thái đang có trên quái
  const stP = ctx.player?.stats || {};
  const reactBoost = stP.stormSet3 ? 1.45 : 1;
  for (const el of els) {
    if (el === 'fire' && (enemy.frozenT > 0 || enemy.slowT > 0)) {
      mult *= (stP.thermalShock ? 2.6 : 2) * (stP.stormSet3 ? 1.25 : 1);
      enemy.frozenT = 0; enemy.slowT = 0; enemy.iceStacks = 0;
      react(enemy, 'Tan Chảy!', 'melt', dmg * reactBoost); play('freeze', { at: enemy.pos, rate: 0.7 });
      if (stP.thermalShock && allowChain && frameCombat.aoeChains < 10) {
        frameCombat.aoeChains++;
        spawnRing(ctx.scene, enemy.pos, 3.2, 0xd8f4ff, 0.4);
        aoe(enemy.pos, 3.2, Math.round(dmg * 0.75 * reactBoost), NONE, 8, { exclude: enemy });
      }
    } else if (el === 'ice' && enemy.burnT > 0) {
      mult *= (stP.thermalShock ? 2.6 : 2) * (stP.stormSet3 ? 1.25 : 1);
      enemy.burnT = 0;
      react(enemy, 'Tan Chảy!', 'melt', dmg * reactBoost); play('freeze', { at: enemy.pos, rate: 0.7 });
    } else if (el === 'lightning' && (enemy.frozenT > 0 || (stP.magStorm && enemy.slowT > 0)) && allowChain) {
      enemy.frozenT = stP.magStorm ? Math.max(enemy.frozenT, 1.2) : 0;
      react(enemy, 'Vỡ Băng!', 'shatter', dmg * reactBoost);
      burst(enemy.pos.clone().setY(0.8), 0xaeeaff, 20, { speed: 9, size: 0.18 });
      play('freeze', { at: enemy.pos, rate: 1.3 });
      if (frameCombat.aoeChains < 10) {
        frameCombat.aoeChains++;
        aoe(enemy.pos, 2.8, Math.round((dmg * 1.2 + 10) * reactBoost), NONE, 6, { exclude: enemy });
      }
    } else if (((el === 'fire' && enemy.shockT > 0) || (el === 'lightning' && enemy.burnT > 0)) && allowChain) {
      enemy.shockT = 0;
      react(enemy, 'Quá Tải!', 'overload', dmg * reactBoost);
      spawnRing(ctx.scene, enemy.pos, 2.6, 0xffb040, 0.35);
      burst(enemy.pos.clone().setY(0.6), 0xffd060, 18, { speed: 9, size: 0.16 });
      play('explode', { at: enemy.pos, vol: 0.6, rate: 1.2 });
      if (frameCombat.aoeChains < 10) {
        frameCombat.aoeChains++;
        aoe(enemy.pos, 2.6, Math.round((dmg * 0.8 + 8) * reactBoost), NONE, 12, { exclude: enemy });
      }
    } else if (el === 'blood' && (enemy.burnT > 0 || enemy.frozenT > 0 || enemy.shockT > 0)) {
      mult *= 1.3;
      react(enemy, 'Huyết Tế!', 'blood', dmg * reactBoost);
      ctx.player.heal(Math.max(2, Math.round(dmg * 0.3)));
    }
  }
  // Phản ứng của nguyên tố mới
  for (const el of els) {
    if (allowChain && ((el === 'fire' && enemy.poisonStacks > 0) || (el === 'poison' && enemy.burnT > 0))) {
      const st = Math.max(1, enemy.poisonStacks || 1);
      enemy.poisonStacks = 0; enemy.poisonT = 0;
      react(enemy, 'Khí Nổ!', 'overload', dmg);
      explosion(enemy.pos, 2.8, 0x9fff5a, { smoke: true, scorch: false, core: 0xe0ffb0 });
      play('explode', { at: enemy.pos, vol: 0.7 });
      if (frameCombat.aoeChains < 10) {
        frameCombat.aoeChains++;
        aoe(enemy.pos, 2.8, Math.round(dmg * 0.6 + st * 7), NONE, 10, { exclude: enemy });
      }
    } else if (allowChain && ((el === 'wind' && enemy.burnT > 0) || (el === 'fire' && enemy.gustT > 0))) {
      enemy.gustT = 0;
      react(enemy, 'Lốc Lửa!', 'melt', dmg);
      spawnFirePatch(enemy.pos, 2.6, 3.5, Math.round(dmg * 0.25 + 6));
      play('ignite', { at: enemy.pos });
    } else if (allowChain && el === 'wind' && (enemy.slowT > 0 || enemy.frozenT > 0)) {
      react(enemy, 'Bão Tuyết!', 'shatter', dmg);
      spawnRing(ctx.scene, enemy.pos, 3.4, 0xbff0ff, 0.45);
      play('freeze', { at: enemy.pos, rate: 0.8 });
      for (const o of ctx.enemies) if (o.alive && o.pos.distanceTo(enemy.pos) < 3.4) { o.frozenT = 1.6; o.slowT = 3; }
    } else if (allowChain && el === 'holy' && enemy.shockT > 0) {
      enemy.shockT = 0;
      react(enemy, 'Phán Xét!', 'ult', dmg);
      spawnBolt(ctx.scene, enemy.pos.clone().setY(9), enemy.pos.clone().setY(0.5), 0xfff6d0);
      play('zap', { at: enemy.pos, rate: 0.7 });
      if (frameCombat.aoeChains < 10) {
        frameCombat.aoeChains++;
        aoe(enemy.pos, 2.4, Math.round(dmg + 12), NONE, 6, {});
      }
    }
    if (el === 'holy' && !enemy.slimy) mult *= 1.5;              // Thánh khắc chế quái xương
    if (allowChain && ctx.reactSurface && frameCombat.surfaces < 8) {
      const sk = `${Math.round(enemy.pos.x * 0.5)},${Math.round(enemy.pos.z * 0.5)},${el}`;
      if (!frameCombat.surfaceSet.has(sk)) {
        frameCombat.surfaceSet.add(sk);
        frameCombat.surfaces++;
        ctx.reactSurface(enemy.pos, 2.2, el, dir, dmg);
      }
    }
  }
  if (enemy.isBoss && ctx.bossBane) mult *= 1 + ctx.bossBane;
  // Kháng / yếu theo vùng
  for (const el of els) {
    if (enemy.resist === el) { mult *= 0.3; if (!enemy.resistShown) { enemy.resistShown = true; damageNumber(enemy.pos, 'Kháng ' + ELEMENTS[el].name, 'burn'); } }
    else if (enemy.weak === el) { mult *= 1.6; if (!enemy.weakShown) { enemy.weakShown = true; damageNumber(enemy.pos, 'Yếu ' + ELEMENTS[el].name + '!', 'react melt'); } }
  }
  dmg = Math.max(1, Math.round(dmg * mult));
  const dealt = enemy.takeHit(dmg, dir, kb * (els.includes('wind') ? 1.9 : 1), crit || mult > 1) ?? dmg;
  if (dealt > 0) ctx.recordDmg?.(ctx.dmgTag || 'basic', dealt);
  // Phá bộ phận Boss (hỗ trợ cả cận chiến, tầm xa, kỹ năng và phản ứng)
  if (enemy.isBoss && enemy.onPartHit && dealt > 0 && ctx.player) {
    let back = false;
    if (enemy.facing != null) {
      const fx = Math.sin(enemy.facing), fz = Math.cos(enemy.facing);
      const tx = ctx.player.pos.x - enemy.pos.x, tz = ctx.player.pos.z - enemy.pos.z, tl = Math.hypot(tx, tz) || 1;
      back = (fx * tx + fz * tz) / tl < -0.2;
    }
    const partDmg = ctx.player.hasRelic?.('tongs') ? Math.round(dealt * 1.55) : dealt;
    enemy.onPartHit(partDmg, { dir, crit: !!crit, big: !!crit || kb >= 10 || dealt >= 26, back, player: ctx.player });
  }

  for (const el of els) {
    if (el === 'poison') {
      enemy.poisonStacks = Math.min(8, (enemy.poisonStacks || 0) + 1);
      enemy.poisonT = 4;
      enemy.poisonDps = Math.max(enemy.poisonDps || 0, dmg * 0.12);
    } else if (el === 'wind') {
      enemy.gustT = 2;
      // gió đẩy luôn quái đứng sát bên
      if (allowChain && dir) for (const o of ctx.enemies) if (o !== enemy && o.alive && !o.isBoss && o.pos.distanceTo(enemy.pos) < 2) o.knock.copy(dir).multiplyScalar(8 / (o.mass || 1));
    } else if (el === 'holy') {
      if (Math.random() < 0.15) ctx.player.heal(2);
    }
    if (el === 'fire') {
      if (enemy.burnT <= 0) play('ignite', { at: enemy.pos, vol: 0.6 });
      enemy.burnT = 3;
      enemy.burnDps = Math.max(enemy.burnDps, dmg * 0.35);
    } else if (el === 'ice') {
      enemy.slowT = 2.2;
      enemy.iceStacks++;
      const needIce = ctx.player?.hasRelic?.('icecore') ? 2 : 3;
      if (enemy.iceStacks >= needIce) {
        enemy.iceStacks = 0;
        enemy.frozenT = stP.permaFrost && enemy.poisonStacks > 0 ? 2.4 : 1.4;
        play('freeze', { at: enemy.pos });
        burst(enemy.pos.clone().setY(0.6), 0xaeeaff, 12, { speed: 4, size: 0.16 });
      }
    } else if (el === 'lightning') {
      enemy.shockT = 2;
      if (allowChain) {
        let b1 = null, d1 = 4, b2 = null, d2 = 4;
        for (const e of ctx.enemies) {
          if (e === enemy || !e.alive || e.spawning) continue;
          const dist = Math.hypot(e.pos.x - enemy.pos.x, e.pos.z - enemy.pos.z);
          if (dist >= 4) continue;
          if (dist < d1) { b2 = b1; d2 = d1; b1 = e; d1 = dist; }
          else if (dist < d2) { b2 = e; d2 = dist; }
        }
        if (b1) {
          play('zap', { at: enemy.pos });
          const from = _tmpP.copy(enemy.pos).setY(0.7);
          for (const t of b2 ? [b1, b2] : [b1]) {
            const to = _tmpD.copy(t.pos).setY(0.7);
            spawnBolt(ctx.scene, from, to, ELEMENTS.lightning.glow);
            if (stP.voltVenom) { t.poisonStacks = Math.min(8, (t.poisonStacks || 0) + 2); t.poisonT = 4.5; t.poisonDps = Math.max(t.poisonDps || 0, dmg * 0.14); }
            dealDamage(t, Math.max(1, Math.round(dmg * 0.5)), weapon, null, 0, false, false);
            from.copy(to);
          }
        }
      }
    } else if (el === 'blood') {
      ctx.player.heal(Math.max(1, Math.round(dmg * 0.12)));
    }
  }
  if (ctx.onHit) ctx.onHit(enemy, dmg, weapon);
  return dealt;
  } finally {
    _dmgDepth--;
  }
}

// ---------- Sát thương vùng ----------
// opts: exclude (quái bỏ qua), player (sát thương lên người chơi), barrels (có làm nổ thùng không)
export function aoe(pos, radius, dmg, weapon = NONE, kb = 6, opts = {}) {
  for (const e of ctx.enemies) {
    if (e === opts.exclude || !e.alive || e.spawning) continue;
    const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
    if (Math.hypot(dx, dz) < radius + e.radius) {
      _tmpV.set(dx, 0, dz).normalize();
      dealDamage(e, dmg, weapon, _tmpV, kb, false, false);
    }
  }
  if (opts.barrels !== false) {
    for (const b of ctx.barrels) if (b.alive && Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < radius + 0.6) b.hit(dmg);
  }
  if (opts.surface !== false && ctx.reactSurface && weapon) {
    for (const el of [weapon.element, weapon.element2]) if (el && el !== 'none') ctx.reactSurface(pos, radius, el, null, dmg);
  }
  const p = ctx.player;
  if (opts.player && !p.dead && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < radius + p.radius) {
    if (p.hurt(opts.player)) damageNumber(p.pos, opts.player, 'player');
  }
}

// ---------- Bom hẹn giờ (tinh anh "Nổ Khi Chết", mưa lửa...) ----------
const bombs = [];
const MAX_BOMBS = 18;
export function scheduleBomb(pos, delay, radius, dmgEnemies, dmgPlayer, color = 0xff5a1a) {
  if (bombs.length >= MAX_BOMBS) return;
  spawnTelegraph(ctx.scene, { shape: 'circle', pos, radius, duration: delay, color: 0xff3020 });
  bombs.push({ pos: pos.clone(), t: delay, radius, dmgEnemies, dmgPlayer, color });
}
function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.t -= dt;
    if (b.t > 0) continue;
    bombs.splice(i, 1);
    explosion(b.pos, b.radius, b.color, { core: b.color === 0x9fb6ff ? 0xe0e8ff : undefined, scorch: b.color !== 0x9fb6ff });
    addShake(0.35);
    play('explode', { at: b.pos, vol: 0.8 });
    aoe(b.pos, b.radius, b.dmgEnemies, { element: 'fire', element2: null }, 10, { player: b.dmgPlayer });
  }
}

// ---------- Vùng lửa (di vật Nhẫn Than Hồng, mưa lửa) ----------
const patches = [];
const MAX_PATCHES = 14;
const patchGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export function spawnFirePatch(pos, radius, dur, dps, hurtsPlayer = false) {
  for (const f of patches) {
    if (f.hurtsPlayer === hurtsPlayer && Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z) < 1.1) {
      f.t = Math.max(f.t, dur);
      f.dur = Math.max(f.dur, dur);
      f.radius = Math.max(f.radius, radius);
      f.mesh.scale.setScalar(f.radius);
      f.dps = Math.max(f.dps, dps);
      return;
    }
  }
  if (patches.length >= MAX_PATCHES) removeFirePatch(0);
  const mesh = new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.scale.setScalar(radius);
  mesh.position.set(pos.x, 0.07, pos.z);
  ctx.scene.add(mesh);
  patches.push({ mesh, pos: mesh.position, radius, t: dur, dur, dps, hurtsPlayer, tick: 0 });
}
function updatePatches(dt) {
  updateToxics(dt);
  for (let i = patches.length - 1; i >= 0; i--) {
    const f = patches[i];
    f.t -= dt; f.tick -= dt;
    f.mesh.material.opacity = 0.45 * Math.min(1, f.t / 0.4);
    if (Math.random() < dt * 14) flame(_tmpP.set(f.pos.x, 0.1, f.pos.z), { spread: f.radius * 0.6, size: 0.7, life: 0.55 });
    if (f.tick <= 0) {
      f.tick = 0.5;
      for (const e of ctx.enemies) {
        if (e.alive && !e.spawning && Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z) < f.radius + e.radius) {
          e.takeHit(Math.round(f.dps * 0.5), null, 0, false, 'burn');
          e.burnT = Math.max(e.burnT, 1.5); e.burnDps = Math.max(e.burnDps, 4);
        }
      }
      const p = ctx.player;
      if (f.hurtsPlayer && !p.dead && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < f.radius + 0.3) {
        if (p.hurt(Math.round(f.dps * 0.5))) damageNumber(p.pos, Math.round(f.dps * 0.5), 'player');
      }
    }
    if (f.t <= 0) { ctx.scene.remove(f.mesh); f.mesh.material.dispose(); patches.splice(i, 1); }
  }
}

// ---------- Vũng độc (tinh anh "Rỉ Độc"): chỉ hại người chơi, gây trúng độc ----------
const toxics = [];
const MAX_TOXICS = 14;
export function spawnToxic(pos, radius = 1.3, dur = 4) {
  for (const f of toxics) {
    if (Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z) < 1.1) {
      f.t = Math.max(f.t, dur);
      f.dur = Math.max(f.dur, dur);
      f.radius = Math.max(f.radius, radius);
      f.mesh.scale.setScalar(f.radius);
      return;
    }
  }
  if (toxics.length >= MAX_TOXICS) removeToxic(0);
  const mesh = new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({ color: 0x6fd83a, transparent: true, opacity: 0.35, depthWrite: false }));
  mesh.scale.setScalar(radius);
  mesh.position.set(pos.x, 0.06, pos.z);
  ctx.scene.add(mesh);
  toxics.push({ mesh, pos: mesh.position, radius, t: dur, dur });
}
function updateToxics(dt) {
  const p = ctx.player;
  for (let i = toxics.length - 1; i >= 0; i--) {
    const f = toxics[i];
    f.t -= dt;
    f.mesh.material.opacity = 0.35 * Math.min(1, f.t / 0.5);
    if (Math.random() < dt * 3) emit(_tmpP.set(f.pos.x, 0.1, f.pos.z), { frame: F.glow, color: 0xbfff7a, color2: 0x3a8a10, size: 0.4, size2: 0, life: 0.8, vel: _tmpV.set(0, 0.8, 0) });
    if (p && !p.dead && p.dashTime <= 0 && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < f.radius + 0.2) p.poisonT = 3;
    if (f.t <= 0) { ctx.scene.remove(f.mesh); f.mesh.material.dispose(); toxics.splice(i, 1); }
  }
}

// ---------- Đạn ----------
const projectiles = [];
const MAX_SIDE_PROJ = 70;
const MAX_TOTAL_PROJ = 140;
const orbGeo = new THREE.SphereGeometry(0.2, 12, 8);
const arrowGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6).rotateX(Math.PI / 2);
const projMats = new Map();
function getProjMat(key, make) {
  if (!projMats.has(key)) {
    const m = make();
    m.userData.shared = true;
    projMats.set(key, m);
  }
  return projMats.get(key);
}
const KEEP_PROJ = new Set(['boomerang', 'spear_fly', 'spear_lodged', 'spear_return', 'chakram', 'orbit_disc']);
function capProjectiles(friendly) {
  let sideCount = 0;
  let oldestSide = -1;
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (KEEP_PROJ.has(p.kind)) continue;
    if (p.friendly === friendly) {
      sideCount++;
      if (oldestSide === -1) oldestSide = i;
    }
  }
  if (sideCount >= MAX_SIDE_PROJ && oldestSide >= 0) removeProjectile(oldestSide);
  while (projectiles.length >= MAX_TOTAL_PROJ) {
    const idx = projectiles.findIndex((p) => !KEEP_PROJ.has(p.kind));
    if (idx < 0) break;
    removeProjectile(idx);
  }
}

const blocked = (pos) => isBlocked(pos.x, pos.z, -0.6);
const colorOf = (w) => (w.element === 'none' ? 0xc9b6ff : ELEMENTS[w.element].glow);

// ---------- Dư chấn trễ theo dt (Đại Kiếm Trảm Tuyệt Đỉnh, Chiến Chùy Dư Chấn) ----------
const aftershocks = [];
const MAX_AFTERSHOCKS = 16;
export function scheduleAftershock(pos, delay, radius, dmg, weapon, opts = {}) {
  if (aftershocks.length >= MAX_AFTERSHOCKS) aftershocks.shift();
  aftershocks.push({
    pos: pos.clone(), t: delay, radius, dmg, weapon: weapon || NONE,
    kb: opts.kb ?? 10, color: opts.color ?? 0xffaa40, stun: opts.stun ?? 0, poiseMul: opts.poiseMul ?? 1.4,
  });
}
function updateAftershocks(dt) {
  for (let i = aftershocks.length - 1; i >= 0; i--) {
    const a = aftershocks[i];
    a.t -= dt;
    if (a.t > 0) continue;
    aftershocks.splice(i, 1);
    spawnRing(ctx.scene, a.pos, a.radius, a.color, 0.42);
    burst(a.pos.clone().setY(0.3), a.color, 18, { speed: 8, size: 0.16 });
    addShake(0.32);
    play('explode', { at: a.pos, vol: 0.55, rate: 1.3 });
    for (const e of ctx.enemies) {
      if (!e.alive || e.spawning) continue;
      const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
      if (Math.hypot(dx, dz) < a.radius + e.radius) {
        _tmpV.set(dx, 0, dz).normalize();
        dealDamage(e, a.dmg, a.weapon, _tmpV, a.kb, true, false);
        if (a.poiseMul > 1 && e.poiseMax && e.stunT <= 0) e.poise += a.dmg * (a.poiseMul - 1);
        if (a.stun && !e.isBoss) e.stunT = Math.max(e.stunT, a.stun);
      }
    }
  }
}

function tickEnemyMarks(dt) {
  const list = ctx.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.alive) continue;
    if (e.shredT > 0) e.shredT = Math.max(0, e.shredT - dt);
    if (e.arcaneMarkT > 0) {
      e.arcaneMarkT = Math.max(0, e.arcaneMarkT - dt);
      if (e.arcaneMarkT <= 0) e.arcaneMark = 0;
    }
    if (e.daggerMarkT > 0) {
      e.daggerMarkT = Math.max(0, e.daggerMarkT - dt);
      if (e.daggerMarkT <= 0) e.daggerMarks = 0;
    }
    if (e.slamWatchT > 0) {
      e.slamWatchT = Math.max(0, e.slamWatchT - dt);
      const kx = e.knock?.x || 0, kz = e.knock?.z || 0;
      const hitWall = Math.hypot(kx, kz) > 2 && isBlocked(e.pos.x + kx * 0.04, e.pos.z + kz * 0.04, e.radius + 0.15);
      let hitMob = false;
      if (!hitWall && Math.hypot(kx, kz) > 2) {
        for (let j = 0; j < list.length; j++) {
          if (j === i) continue;
          const o = list[j];
          if (!o || !o.alive || o.spawning) continue;
          if (Math.hypot(e.pos.x - o.pos.x, e.pos.z - o.pos.z) < e.radius + o.radius + 0.35) { hitMob = true; break; }
        }
      }
      if (hitWall || hitMob) {
        e.slamWatchT = 0;
        const dVal = Math.max(12, Math.round(18 * (ctx.player?.stats?.dmg || 1)));
        damageNumber(e.pos, 'Đập Dội!', 'react stun');
        spawnRing(ctx.scene, e.pos, 2.8, 0xffcf4a, 0.35);
        burst(e.pos.clone().setY(0.7), 0xffaa40, 14, { speed: 7, size: 0.15 });
        play('hammer', { at: e.pos, rate: 1.15, vol: 0.6 });
        if (!e.isBoss) e.stunT = Math.max(e.stunT, 1.0);
        aoe(e.pos, 2.8, dVal, ctx.player?.weapon || NONE, 8);
      }
    }
  }
}

// Cầu phép thường / mũi tên / phi dao
export function spawnOrb(origin, dir, weapon, dmg, splash, speed, extra = {}) {
  capProjectiles(true);
  const color = colorOf(weapon);
  if (extra.bolt) {
    const baseCol = extra.knife ? 0xe0e8f0 : color;
    const mat = getProjMat('pbolt:' + baseCol, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(baseCol).multiplyScalar(1.8) }));
    const mesh = new THREE.Mesh(arrowGeo, mat);
    mesh.add(glowSprite(color, extra.explode ? 1.6 : 0.9));
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    if (extra.knife) mesh.scale.set(1, 1, 0.55);
    if (extra.explode) mesh.scale.setScalar(1.6);
    mesh.position.copy(origin);
    ctx.scene.add(mesh);
    projectiles.push({
      kind: 'pbolt', friendly: true, mesh, vel: dir.clone().multiplyScalar(speed), life: 0.9,
      weapon, dmg, splash: 0, color, pierce: extra.pierce || 0, explode: !!extra.explode,
      explodeRadius: extra.explodeRadius || 0, crit: !!extra.crit, big: !!extra.big,
      noProc: !!extra.noProc, detonateMarks: !!extra.detonateMarks, hitSet: new Set(),
    });
    return;
  }
  const mat = getProjMat('orb:' + color, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(2) }));
  const mesh = new THREE.Mesh(orbGeo, mat);
  mesh.add(glowSprite(color, 1.7));
  mesh.position.copy(origin);
  if (extra.big) mesh.scale.setScalar(2.4);
  flash(origin, color, extra.big ? 2.2 : 1.1, 0.1, false);
  ctx.scene.add(mesh);
  projectiles.push({
    kind: extra.big ? 'bigorb' : 'orb', friendly: true, mesh, vel: dir.clone().multiplyScalar(speed),
    life: extra.big ? 1.4 : 1.3, weapon, dmg, splash, color, bounces: extra.bounces || 0,
    crit: !!extra.crit, big: !!extra.big, noProc: !!extra.noProc,
    markArcane: !!extra.markArcane, detonateT: 0, hitSet: new Set(),
  });
}

// Rìu ném bay ra rồi quay về + Bắt Rìu Hoàn Hảo
export function spawnBoomerang(owner, dir, weapon, dmg) {
  const mesh = new THREE.Group();
  const w = buildWeaponMesh(weapon);
  w.rotation.x = Math.PI / 2;
  mesh.add(w);
  mesh.position.copy(owner.pos).setY(1);
  ctx.scene.add(mesh);
  projectiles.push({ kind: 'boomerang', friendly: true, disposeGroupMat: true, mesh, vel: dir.clone().multiplyScalar(16), life: 4, weapon, dmg, color: colorOf(weapon), out: 0.55, hitSet: new Set(), owner });
}

export function tryCatchBoomerang(owner) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.kind !== 'boomerang' || p.owner !== owner || !p.returning) continue;
    if (Math.hypot(p.mesh.position.x - owner.pos.x, p.mesh.position.z - owner.pos.z) <= 3.8) {
      spawnRing(ctx.scene, owner.pos, 3.0, 0xffaa40, 0.35);
      burst(owner.pos.clone().setY(1), 0xffaa40, 20, { speed: 7, size: 0.14 });
      removeProjectile(i);
      return true;
    }
  }
  return false;
}

// Thương: ném cắm sàn & thu thương xuyên ngược
export const hasLodgedSpear = (owner) => projectiles.some((p) => p.owner === owner && (p.kind === 'spear_fly' || p.kind === 'spear_lodged'));
export function spawnLodgedSpear(owner, origin, dir, weapon, dmg, opts = {}) {
  const mesh = new THREE.Group();
  const w = buildWeaponMesh({ ...weapon, type: 'spear' });
  mesh.add(w);
  mesh.position.copy(origin).setY(0.95);
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.92, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  ring.visible = false;
  mesh.add(ring);
  ctx.scene.add(mesh);
  owner.lodgedSpear = true;
  projectiles.push({
    kind: 'spear_fly', friendly: true, disposeGroupMat: true, mesh, ring, wGroup: w,
    vel: dir.clone().multiplyScalar(34), flyT: 0.42, life: 6.5,
    weapon, dmg, color: colorOf(weapon), owner, hitSet: new Set(),
    thunderAspect: !!opts.thunderAspect, noProc: false, crit: false, big: true,
  });
}
export function recallLodgedSpear(owner) {
  let found = false;
  for (const p of projectiles) {
    if (p.owner !== owner || (p.kind !== 'spear_fly' && p.kind !== 'spear_lodged')) continue;
    p.kind = 'spear_return';
    p.ring.visible = false;
    p.wGroup.rotation.set(0, Math.PI, 0);
    p.wGroup.position.set(0, 0, 0);
    p.hitSet.clear();
    p.life = 2.0;
    found = true;
  }
  return found;
}

// Luân Kiếm (Chakram): ném bật nảy qua nhiều mục tiêu rồi bay về + Luân Quỹ Đạo
export function spawnChakram(owner, origin, dir, weapon, dmg, opts = {}) {
  const mesh = new THREE.Group();
  const w = buildWeaponMesh({ ...weapon, type: 'chakram' });
  w.position.z = -0.55;
  mesh.add(w);
  mesh.position.copy(origin).setY(0.95);
  mesh.add(glowSprite(colorOf(weapon), 1.4));
  ctx.scene.add(mesh);
  projectiles.push({
    kind: 'chakram', friendly: true, disposeGroupMat: true, mesh, owner,
    vel: dir.clone().multiplyScalar(opts.speed || 22), life: 3.8,
    weapon, dmg, color: colorOf(weapon), bounces: opts.bounces ?? 3,
    crit: !!opts.crit, big: !!opts.big, noProc: !!opts.noProc,
    returning: false, hitSet: new Set(),
  });
}

export function spawnOrbitDiscs(owner, weapon, dmg, count = 2, radius = 2.8, dur = 4.2) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (projectiles[i].kind === 'orbit_disc' && projectiles[i].owner === owner) removeProjectile(i);
  }
  for (let k = 0; k < count; k++) {
    const mesh = new THREE.Group();
    const w = buildWeaponMesh({ ...weapon, type: 'chakram' });
    w.scale.setScalar(0.85);
    w.position.z = -0.45;
    mesh.add(w);
    mesh.add(glowSprite(colorOf(weapon), 1.3));
    const angle = (k / count) * Math.PI * 2;
    mesh.position.set(owner.pos.x + Math.cos(angle) * radius, 0.95, owner.pos.z + Math.sin(angle) * radius);
    ctx.scene.add(mesh);
    projectiles.push({
      kind: 'orbit_disc', friendly: true, disposeGroupMat: true, mesh, owner,
      angle, radius, life: dur, elapsed: 0, weapon, dmg, color: colorOf(weapon),
      hitCd: new Map(), noProc: false, crit: false, big: false,
    });
  }
}

// Sóng kiếm: hình lưỡi liềm bay thẳng, xuyên qua quái
const waveGeo = new THREE.RingGeometry(0.7, 1.0, 20, 1, -Math.PI / 2 - 0.9, 1.8).rotateX(-Math.PI / 2);
export function spawnSwordWave(origin, dir, weapon, dmg, scale = 1) {
  capProjectiles(true);
  const color = weapon.element === 'none' ? 0xfff1c4 : ELEMENTS[weapon.element].glow;
  const mesh = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.position.copy(origin).setY(0.9);
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
  mesh.scale.setScalar(scale);
  ctx.scene.add(mesh);
  projectiles.push({ kind: 'wave', friendly: true, mesh, vel: dir.clone().multiplyScalar(15), life: 0.55, weapon, dmg, color, hitSet: new Set(), scale });
}

// Đạn của quái: 'orb' (cầu tím của pháp sư) hoặc 'arrow' (mũi tên nỏ)
export function enemyShot(origin, dir, dmg = 8, kind = 'orb', speed = null) {
  capProjectiles(false);
  let mesh;
  if (kind === 'arrow') {
    const mat = getProjMat('earrow', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(1.6) }));
    mesh = new THREE.Mesh(arrowGeo, mat);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
  } else {
    const mat = getProjMat('eorb', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe0b0ff).multiplyScalar(1.8) }));
    mesh = new THREE.Mesh(orbGeo, mat);
    mesh.add(glowSprite(0xc06bff, 2));
    mesh.scale.setScalar(1.2);
  }
  mesh.position.copy(origin);
  ctx.scene.add(mesh);
  const spd = speed ?? (kind === 'arrow' ? 20 : 10.5);
  projectiles.push({ kind, friendly: false, mesh, vel: dir.clone().multiplyScalar(spd), life: 3.5, dmg, color: kind === 'arrow' ? 0xffe0a0 : 0xc06bff });
}

function removeProjectile(i) {
  const p = projectiles[i];
  if (!p) return;
  p.mesh.parent?.remove(p.mesh);
  if (p.mesh.material && !p.mesh.material.userData?.shared) p.mesh.material.dispose();
  if (p.disposeGroupMat && p.mesh.isGroup) {
    p.mesh.traverse((o) => { if (o.isMesh && o.material && !o.material.userData?.shared && !o.material.map) o.material.dispose(); });
  }
  if (p.kind === 'boomerang' && p.owner) p.owner.boomerangOut = false;
  const owner = p.owner;
  const wasSpear = p.kind === 'spear_fly' || p.kind === 'spear_lodged' || p.kind === 'spear_return';
  projectiles.splice(i, 1);
  if (wasSpear && owner) owner.lodgedSpear = hasLodgedSpear(owner);
}

function explodeBig(p) {
  explosion(p.mesh.position, 3.2, p.color, { core: 0xffffff, smoke: false, scorch: p.weapon?.element === 'fire' });
  addShake(0.3);
  play('explode', { at: p.mesh.position, vol: 0.6, rate: 1.3 });
  aoe(p.mesh.position, 3.2, p.dmg, p.weapon, 10);
}

export function updateProjectiles(dt) {
  resetCombatFrame();
  const player = ctx.player;
  tickEnemyMarks(dt);
  updateAftershocks(dt);
  updateBombs(dt);
  updatePatches(dt);
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    const pos = p.mesh.position;

    if (p.kind === 'boomerang') {
      p.out -= dt;
      if (p.out <= 0) {
        if (!p.returning) { p.returning = true; p.hitSet.clear(); }
        if (!p.owner || p.life <= 0) { removeProjectile(i); continue; }
        const to = new THREE.Vector3(p.owner.pos.x - pos.x, 0, p.owner.pos.z - pos.z);
        const d = to.length();
        p.vel.copy(to.normalize().multiplyScalar(18));
        if (d < 0.9) { removeProjectile(i); continue; }
      }
      pos.addScaledVector(p.vel, dt);
      p.mesh.rotation.y += dt * 22;
      if (!p.returning && blocked(pos)) p.out = 0;
      for (const e of ctx.enemies) {
        if (!e.alive || e.spawning || p.hitSet.has(e)) continue;
        if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 0.7) {
          p.hitSet.add(e);
          dealDamage(e, p.dmg, p.weapon, p.vel.clone().normalize(), 6, false);
          play('hit', { at: pos, vol: 0.5 });
        }
      }
      for (const b of ctx.barrels) if (b.alive && Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < 1.2) b.hit(p.dmg);
      continue;
    }

    if (p.kind === 'spear_fly') {
      p.flyT -= dt;
      const stepX = p.vel.x * dt, stepZ = p.vel.z * dt;
      pos.x += stepX; pos.z += stepZ;
      for (const e of ctx.enemies) {
        if (!e.alive || e.spawning || p.hitSet.has(e)) continue;
        if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 0.65) {
          p.hitSet.add(e);
          const dealt = dealDamage(e, p.dmg, p.weapon, p.vel.clone().setY(0).normalize(), 8, p.crit);
          if (dealt > 0 && !p.noProc) ctx.onRangedHit?.(e, dealt, p);
          hitSpark(pos, p.color, false);
        }
      }
      for (const b of ctx.barrels) if (b.alive && Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < 1.0) b.hit(p.dmg);
      if (p.flyT <= 0 || blocked(pos)) {
        if (blocked(pos)) { pos.x -= stepX; pos.z -= stepZ; }
        p.kind = 'spear_lodged';
        pos.y = 0.05;
        p.wGroup.rotation.set(-Math.PI / 2.2, 0, 0);
        p.wGroup.position.y = 0.25;
        p.ring.visible = true;
        p.hitSet.clear();
        play('hit', { at: pos, vol: 0.55, rate: 0.75 });
        spawnRing(ctx.scene, pos, 2.2, p.color, 0.35);
      }
      continue;
    }

    if (p.kind === 'spear_lodged') {
      p.ring.scale.setScalar(1 + 0.1 * Math.sin(p.life * 6));
      if (p.life <= 0 || (p.owner && Math.hypot(p.owner.pos.x - pos.x, p.owner.pos.z - pos.z) < 1.25)) {
        if (p.owner && p.life > 0) play('swap', { at: pos, rate: 1.3, vol: 0.45 });
        removeProjectile(i);
      }
      continue;
    }

    if (p.kind === 'spear_return') {
      if (!p.owner || p.life <= 0) { removeProjectile(i); continue; }
      const to = _tmpD.set(p.owner.pos.x - pos.x, 0, p.owner.pos.z - pos.z);
      const d = to.length();
      if (d < 1.15) { play('swap', { at: pos, rate: 1.35, vol: 0.5 }); removeProjectile(i); continue; }
      to.multiplyScalar(1 / d);
      p.mesh.rotation.y = Math.atan2(to.x, to.z);
      pos.addScaledVector(to, 38 * dt);
      for (const e of ctx.enemies) {
        if (!e.alive || e.spawning || p.hitSet.has(e)) continue;
        if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 0.8) {
          p.hitSet.add(e);
          if (!e.isBoss && e.knock) e.knock.addScaledVector(to, 10);
          const dealt = dealDamage(e, Math.round(p.dmg * 1.25), p.weapon, to.clone(), 6, true);
          if (dealt > 0 && !p.noProc) ctx.onRangedHit?.(e, dealt, p);
          if (p.thunderAspect && e.alive) {
            spawnBolt(ctx.scene, e.pos.clone().setY(8), e.pos.clone().setY(0.5), 0xffe14a);
            play('zap', { at: e.pos, vol: 0.5 });
            dealDamage(e, Math.round(p.dmg * 0.55), { element: 'lightning', element2: null }, null, 0, true, false);
          }
        }
      }
      continue;
    }

    if (p.kind === 'chakram') {
      p.mesh.rotation.y += dt * 18;
      if (!p.returning) {
        pos.addScaledVector(p.vel, dt);
        let hit = null;
        for (const e of ctx.enemies) {
          if (e.alive && !e.spawning && !p.hitSet.has(e) && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 0.7) { hit = e; break; }
        }
        if (hit) {
          p.hitSet.add(hit);
          const dir = p.vel.clone().setY(0).normalize();
          const dealt = dealDamage(hit, p.dmg, p.weapon, dir, 5, p.crit);
          if (dealt > 0 && !p.noProc) ctx.onRangedHit?.(hit, dealt, p);
          hitSpark(pos, p.color, false);
          play('hit', { at: pos, vol: 0.5, rate: 1.4 });
          if (--p.bounces > 0) {
            let next = null, bestD = 8.5;
            for (const e of ctx.enemies) {
              if (!e.alive || e.spawning || p.hitSet.has(e)) continue;
              const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
              if (d < bestD) { bestD = d; next = e; }
            }
            if (next) {
              const spd = p.vel.length();
              p.vel.set(next.pos.x - pos.x, 0, next.pos.z - pos.z).normalize().multiplyScalar(spd);
            } else { p.returning = true; p.hitSet.clear(); }
          } else { p.returning = true; p.hitSet.clear(); }
        } else if (blocked(pos) || p.life <= 1.2) {
          p.returning = true;
          p.hitSet.clear();
        }
      } else {
        if (!p.owner || p.life <= 0) { removeProjectile(i); continue; }
        const to = _tmpD.set(p.owner.pos.x - pos.x, 0, p.owner.pos.z - pos.z);
        const d = to.length();
        if (d < 1.2) { p.owner.onCatchChakram?.(p); removeProjectile(i); continue; }
        to.multiplyScalar(1 / d);
        pos.addScaledVector(to, 24 * dt);
        for (const e of ctx.enemies) {
          if (!e.alive || e.spawning || p.hitSet.has(e)) continue;
          if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 0.7) {
            p.hitSet.add(e);
            const dealt = dealDamage(e, Math.round(p.dmg * 0.9), p.weapon, to.clone(), 4, p.crit);
            if (dealt > 0 && !p.noProc) ctx.onRangedHit?.(e, dealt, p);
          }
        }
      }
      for (const b of ctx.barrels) if (b.alive && Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < 1.1) b.hit(p.dmg);
      continue;
    }

    if (p.kind === 'orbit_disc') {
      if (!p.owner || p.owner.dead || p.life <= 0) { removeProjectile(i); continue; }
      p.elapsed += dt;
      p.angle += dt * 5.2;
      p.mesh.rotation.y += dt * 20;
      pos.set(p.owner.pos.x + Math.cos(p.angle) * p.radius, 0.95, p.owner.pos.z + Math.sin(p.angle) * p.radius);
      for (const e of ctx.enemies) {
        if (!e.alive || e.spawning) continue;
        const last = p.hitCd.get(e) ?? -1;
        if (p.elapsed - last < 0.35) continue;
        if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 0.65) {
          p.hitCd.set(e, p.elapsed);
          const dealt = dealDamage(e, p.dmg, p.weapon, null, 5, false);
          if (dealt > 0 && !p.noProc) ctx.onRangedHit?.(e, dealt, p);
          hitSpark(pos, p.color, false);
          play('hit', { at: pos, vol: 0.4, rate: 1.5 });
        }
      }
      for (const b of ctx.barrels) if (b.alive && Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < 0.9) b.hit(p.dmg);
      continue;
    }

    if (p.kind === 'wave') {
      pos.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = Math.min(0.85, p.life * 3);
      if (p.life <= 0 || blocked(pos)) { removeProjectile(i); continue; }
      for (const e of ctx.enemies) {
        if (!e.alive || e.spawning || p.hitSet.has(e)) continue;
        if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + 1.0 * p.scale) {
          p.hitSet.add(e);
          dealDamage(e, p.dmg, p.weapon, p.vel.clone().normalize(), 5, false, false);
        }
      }
      continue;
    }

    pos.addScaledVector(p.vel, dt);
    if (p.kind === 'orb' || p.kind === 'bigorb') {
      const big = p.kind === 'bigorb';
      emit(pos, { frame: F.glow, color: p.color, size: big ? 1.4 : 0.6, size2: 0.05, life: big ? 0.35 : 0.22, alpha: 0.8 });
      if (Math.random() < (big ? 0.8 : 0.3)) emit(pos, { frame: F.sparkle, color: 0xffffff, color2: p.color, size: big ? 0.7 : 0.35, size2: 0, life: 0.4, vel: _tmpV.set((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2) });
      // Cầu Phép Lớn bay ngang qua mục tiêu mang Ấn Phép -> kích nổ chuỗi năng lượng!
      if (big && !p.noProc) {
        p.detonateT -= dt;
        if (p.detonateT <= 0) {
          p.detonateT = 0.22;
          for (const e of ctx.enemies) {
            if (!e.alive || e.spawning || !(e.arcaneMark > 0)) continue;
            if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 3.2 + e.radius) {
              const stacks = e.arcaneMark;
              e.arcaneMark = 0; e.arcaneMarkT = 0;
              spawnBolt(ctx.scene, pos.clone(), e.pos.clone().setY(0.8), 0x8fe0ff);
              damageNumber(e.pos, 'Nổ Ấn Phép!', 'react overload');
              play('zap', { at: e.pos, rate: 1.2 });
              aoe(e.pos, 2.6, Math.round(p.dmg * 0.55 * stacks), p.weapon, 8);
            }
          }
        }
      }
    } else if (p.kind === 'arrow' || p.kind === 'pbolt') {
      emit(pos, { frame: F.glow, color: 0xffe0a0, size: 0.35, size2: 0, life: 0.15, alpha: 0.6 });
    }

    if (p.life <= 0 || blocked(pos)) {
      if (p.kind === 'bigorb') explodeBig(p);
      else burst(pos, p.color, 6, { speed: 3, size: 0.1 });
      removeProjectile(i);
      continue;
    }

    if (p.friendly) {
      const barrel = ctx.barrels.find((b) => b.alive && Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) < 0.8);
      if (barrel) { barrel.hit(p.dmg); if (p.kind === 'bigorb') explodeBig(p); removeProjectile(i); continue; }
      const hit = ctx.enemies.find((e) => e.alive && !e.spawning && !p.hitSet.has(e) && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < e.radius + (p.kind === 'bigorb' ? 0.5 : 0.25));
      if (hit) {
        if (p.kind === 'bigorb') { explodeBig(p); removeProjectile(i); continue; }
        if (p.kind === 'pbolt') {
          const dir = p.vel.clone().setY(0).normalize();
          const dealt = dealDamage(hit, p.dmg, p.weapon, dir, p.explode ? 4 : 6, p.crit);
          if (dealt > 0 && !p.noProc) ctx.onRangedHit?.(hit, dealt, p);
          if (p.detonateMarks && hit.alive && hit.daggerMarks > 0 && ctx.player?.detonateDaggerMarks) {
            ctx.player.detonateDaggerMarks(hit, ctx.player.dmgMul());
          }
          hitSpark(pos.clone(), p.color, false);
          play('hit', { at: pos, vol: 0.5, rate: 1.3 });
          if (p.explode) { explosion(pos, 2.8, p.color, { smoke: true, scorch: true }); aoe(pos, 2.8, Math.round(p.dmg * 0.7), p.weapon, 12, { exclude: hit }); play('explode', { at: pos, vol: 0.6 }); removeProjectile(i); continue; }
          if (p.explodeRadius > 0) {
            explosion(pos, p.explodeRadius, p.color, { smoke: false, scorch: false });
            aoe(pos, p.explodeRadius, Math.round(p.dmg * 0.5), p.weapon, 8, { exclude: hit });
          }
          p.hitSet.add(hit);
          if (p.pierce-- <= 0) removeProjectile(i);
          continue;
        }
        const dir = p.vel.clone().setY(0).normalize();
        const dealt = dealDamage(hit, p.dmg, p.weapon, dir, 5, p.crit);
        if (dealt > 0 && !p.noProc) ctx.onRangedHit?.(hit, dealt, p);
        if (p.markArcane && hit.alive) {
          hit.arcaneMark = Math.min(3, (hit.arcaneMark || 0) + 1);
          hit.arcaneMarkT = 6;
        }
        for (const e of ctx.enemies) {
          if (e === hit || !e.alive || e.spawning) continue;
          const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
          if (d < p.splash + e.radius) {
            const sd = new THREE.Vector3(e.pos.x - pos.x, 0, e.pos.z - pos.z).normalize();
            dealDamage(e, Math.max(1, Math.round(p.dmg * 0.5)), p.weapon, sd, 3, false, false);
          }
        }
        burst(pos, p.color, 14, { speed: 6, size: 0.14 });
        play('hit', { at: pos, vol: 0.6 });
        if (p.bounces > 0) {
          p.hitSet.add(hit);
          const next = ctx.enemies.filter((e) => e.alive && !e.spawning && !p.hitSet.has(e)).sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos))[0];
          if (next && next.pos.distanceTo(pos) < 8) {
            p.bounces--;
            p.life = 1.0;
            const sp = p.vel.length();
            p.vel.set(next.pos.x - pos.x, 0, next.pos.z - pos.z).normalize().multiplyScalar(sp);
            continue;
          }
        }
        removeProjectile(i);
      }
    } else {
      const pl = (ctx.players || [ctx.player]).find((x) => !x.dead && Math.hypot(x.pos.x - pos.x, x.pos.z - pos.z) < x.radius + 0.25);
      if (pl) {
        if (pl.parryT > 0) {
          pl.onParry(null);
          p.friendly = true;
          p.weapon = pl.weapon;
          p.dmg = p.dmg * 3;
          p.splash = 1;
          p.hitSet = new Set();
          p.vel.multiplyScalar(-1.6);
          p.life = 2;
          continue;
        }
        if (pl.hurt(p.dmg)) damageNumber(pl.pos, p.dmg, 'player');
        burst(pos, p.color, 10, { speed: 4 });
        removeProjectile(i);
      }
    }
  }
}

// Thẻ "Lửa Lan": nổ lửa đốt quái xung quanh
export function fireBurst(pos, dmg) {
  if (frameCombat.fireBursts >= 10) return;
  const idx = frameCombat.fireBursts++;
  if (idx < 6) {
    explosion(pos, 2.4, 0xff7a2a, { smoke: false, scorch: false });
    play('ignite', { at: pos });
  }
  aoe(pos, 2.4, dmg, { element: 'fire', element2: null }, 4);
}

export const getFirePatches = () => patches;
export const getToxics = () => toxics;
export function removeFirePatch(i) {
  const f = patches[i];
  if (!f) return;
  ctx.scene?.remove(f.mesh);
  f.mesh.material?.dispose();
  patches.splice(i, 1);
}
export function removeToxic(i) {
  const f = toxics[i];
  if (!f) return;
  ctx.scene?.remove(f.mesh);
  f.mesh.material?.dispose();
  toxics.splice(i, 1);
}

export const debugProjectiles = () => projectiles.length;

export function clearProjectiles() {
  resetCombatFrame();
  aftershocks.length = 0;
  for (let i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);
  bombs.length = 0;
  for (const f of patches) { ctx.scene.remove(f.mesh); f.mesh.material?.dispose(); }
  patches.length = 0;
  for (const f of toxics) { ctx.scene.remove(f.mesh); f.mesh.material?.dispose(); }
  toxics.length = 0;
}
