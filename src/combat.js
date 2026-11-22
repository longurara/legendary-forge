import * as THREE from 'three';
import { burst, spawnBolt, damageNumber, spawnRing, spawnTelegraph, addShake, explosion, flame, emit, F, glowSprite, flash, hitSpark } from './fx.js';
import { isBlocked } from './world.js';
import { ELEMENTS, buildWeaponMesh } from './weapons.js';
import { play } from './audio.js';

// Ngữ cảnh dùng chung, main.js gán vào. barrels: thùng nổ (hazards.js)
export const ctx = { scene: null, player: null, enemies: [], barrels: [], onHit: null, onReaction: null };
const NONE = { element: 'none', element2: null };

function react(enemy, text, color, dmg = 16) {
  damageNumber(enemy.pos, text, 'react ' + color);
  if (ctx.onReaction) ctx.onReaction(text, enemy, dmg);
}

// ---------- Gây sát thương + hiệu ứng / phản ứng nguyên tố ----------
// Trả về sát thương thực gây ra
export function dealDamage(enemy, dmg, weapon, dir, kb, crit, allowChain = true) {
  if (!enemy.alive) return 0;
  const els = [weapon.element, weapon.element2].filter((e) => e && e !== 'none');
  let mult = 1;
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
  for (const el of els) {
    if (el === 'fire' && (enemy.frozenT > 0 || enemy.slowT > 0)) {
      mult *= 2; enemy.frozenT = 0; enemy.slowT = 0; enemy.iceStacks = 0;
      react(enemy, 'Tan Chảy!', 'melt', dmg); play('freeze', { at: enemy.pos, rate: 0.7 });
    } else if (el === 'ice' && enemy.burnT > 0) {
      mult *= 2; enemy.burnT = 0;
      react(enemy, 'Tan Chảy!', 'melt', dmg); play('freeze', { at: enemy.pos, rate: 0.7 });
    } else if (el === 'lightning' && enemy.frozenT > 0 && allowChain) {
      enemy.frozenT = 0;
      react(enemy, 'Vỡ Băng!', 'shatter', dmg);
      burst(enemy.pos.clone().setY(0.8), 0xaeeaff, 26, { speed: 9, size: 0.18 });
      play('freeze', { at: enemy.pos, rate: 1.3 });
      aoe(enemy.pos, 2.8, Math.round(dmg * 1.2 + 10), NONE, 6, { exclude: enemy });
    } else if (((el === 'fire' && enemy.shockT > 0) || (el === 'lightning' && enemy.burnT > 0)) && allowChain) {
      enemy.shockT = 0;
      react(enemy, 'Quá Tải!', 'overload', dmg);
      spawnRing(ctx.scene, enemy.pos, 2.6, 0xffb040, 0.35);
      burst(enemy.pos.clone().setY(0.6), 0xffd060, 24, { speed: 9, size: 0.16 });
      play('explode', { at: enemy.pos, vol: 0.6, rate: 1.2 });
      aoe(enemy.pos, 2.6, Math.round(dmg * 0.8 + 8), NONE, 12, { exclude: enemy });
    } else if (el === 'blood' && (enemy.burnT > 0 || enemy.frozenT > 0 || enemy.shockT > 0)) {
      mult *= 1.3;
      react(enemy, 'Huyết Tế!', 'blood', dmg);
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
      aoe(enemy.pos, 2.8, Math.round(dmg * 0.6 + st * 7), NONE, 10, { exclude: enemy });
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
      aoe(enemy.pos, 2.4, Math.round(dmg + 12), NONE, 6, {});
    }
    if (el === 'holy' && !enemy.slimy) mult *= 1.5;              // Thánh khắc chế quái xương
    if (allowChain && ctx.reactSurface) ctx.reactSurface(enemy.pos, 2.2, el, dir, dmg);
  }
  if (enemy.isBoss && ctx.bossBane) mult *= 1 + ctx.bossBane;
  // Kháng / yếu theo vùng
  for (const el of els) {
    if (enemy.resist === el) { mult *= 0.3; if (!enemy.resistShown) { enemy.resistShown = true; damageNumber(enemy.pos, 'Kháng ' + ELEMENTS[el].name, 'burn'); } }
    else if (enemy.weak === el) { mult *= 1.6; if (!enemy.weakShown) { enemy.weakShown = true; damageNumber(enemy.pos, 'Yếu ' + ELEMENTS[el].name + '!', 'react melt'); } }
  }
  dmg = Math.max(1, Math.round(dmg * mult));
  const dealt = enemy.takeHit(dmg, dir, kb * (els.includes('wind') ? 1.9 : 1), crit || mult > 1) ?? dmg;
  // Phá bộ phận Boss (hỗ trợ cả cận chiến, tầm xa, kỹ năng và phản ứng)
  if (enemy.isBoss && enemy.onPartHit && dealt > 0 && ctx.player) {
    let back = false;
    if (enemy.facing != null) {
      const fx = Math.sin(enemy.facing), fz = Math.cos(enemy.facing);
      const tx = ctx.player.pos.x - enemy.pos.x, tz = ctx.player.pos.z - enemy.pos.z, tl = Math.hypot(tx, tz) || 1;
      back = (fx * tx + fz * tz) / tl < -0.2;
    }
    enemy.onPartHit(dealt, { dir, crit: !!crit, big: !!crit || kb >= 10 || dealt >= 26, back, player: ctx.player });
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
      if (enemy.iceStacks >= 3) {
        enemy.iceStacks = 0;
        enemy.frozenT = 1.4;
        play('freeze', { at: enemy.pos });
        burst(enemy.pos.clone().setY(0.6), 0xaeeaff, 12, { speed: 4, size: 0.16 });
      }
    } else if (el === 'lightning') {
      enemy.shockT = 2;
      if (allowChain) {
        const targets = ctx.enemies
          .filter((e) => e !== enemy && e.alive && !e.spawning && e.pos.distanceTo(enemy.pos) < 4)
          .sort((a, b) => a.pos.distanceTo(enemy.pos) - b.pos.distanceTo(enemy.pos))
          .slice(0, 2);
        if (targets.length) play('zap', { at: enemy.pos });
        let from = enemy.pos.clone().setY(0.7);
        for (const t of targets) {
          const to = t.pos.clone().setY(0.7);
          spawnBolt(ctx.scene, from, to, ELEMENTS.lightning.glow);
          dealDamage(t, Math.max(1, Math.round(dmg * 0.5)), weapon, null, 0, false, false);
          from = to;
        }
      }
    } else if (el === 'blood') {
      ctx.player.heal(Math.max(1, Math.round(dmg * 0.12)));
    }
  }
  if (ctx.onHit) ctx.onHit(enemy, dmg, weapon);
  return dealt;
}

// ---------- Sát thương vùng ----------
// opts: exclude (quái bỏ qua), player (sát thương lên người chơi), barrels (có làm nổ thùng không)
export function aoe(pos, radius, dmg, weapon = NONE, kb = 6, opts = {}) {
  for (const e of ctx.enemies) {
    if (e === opts.exclude || !e.alive || e.spawning) continue;
    const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
    if (Math.hypot(dx, dz) < radius + e.radius) {
      dealDamage(e, dmg, weapon, new THREE.Vector3(dx, 0, dz).normalize(), kb, false, false);
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
export function scheduleBomb(pos, delay, radius, dmgEnemies, dmgPlayer, color = 0xff5a1a) {
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
const patchGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export function spawnFirePatch(pos, radius, dur, dps, hurtsPlayer = false) {
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
    if (Math.random() < dt * 14) flame(f.pos.clone().setY(0.1), { spread: f.radius * 0.6, size: 0.7, life: 0.55 });
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
export function spawnToxic(pos, radius = 1.3, dur = 4) {
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
    if (Math.random() < dt * 3) emit(f.pos.clone().setY(0.1), { frame: F.glow, color: 0xbfff7a, color2: 0x3a8a10, size: 0.4, size2: 0, life: 0.8, vel: new THREE.Vector3(0, 0.8, 0) });
    if (p && !p.dead && p.dashTime <= 0 && Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) < f.radius + 0.2) p.poisonT = 3;
    if (f.t <= 0) { ctx.scene.remove(f.mesh); f.mesh.material.dispose(); toxics.splice(i, 1); }
  }
}

// ---------- Đạn ----------
const projectiles = [];
const orbGeo = new THREE.SphereGeometry(0.2, 12, 8);
const arrowGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6).rotateX(Math.PI / 2);

const blocked = (pos) => isBlocked(pos.x, pos.z, -0.6);
const colorOf = (w) => (w.element === 'none' ? 0xc9b6ff : ELEMENTS[w.element].glow);

// Cầu phép thường của trượng
export function spawnOrb(origin, dir, weapon, dmg, splash, speed, extra = {}) {
  const color = colorOf(weapon);
  if (extra.bolt) {
    // Tên nỏ / dao ném: xuyên qua quái, bay thẳng
    const mesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(extra.knife ? 0xe0e8f0 : color).multiplyScalar(1.8) }));
    mesh.add(glowSprite(color, extra.explode ? 1.6 : 0.9));
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    if (extra.knife) mesh.scale.set(1, 1, 0.55);
    if (extra.explode) mesh.scale.setScalar(1.6);
    mesh.position.copy(origin);
    ctx.scene.add(mesh);
    projectiles.push({ kind: 'pbolt', friendly: true, mesh, vel: dir.clone().multiplyScalar(speed), life: 0.9, weapon, dmg, splash: 0, color, pierce: extra.pierce || 0, explode: !!extra.explode, hitSet: new Set() });
    return;
  }
  const mesh = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(2) }));
  mesh.add(glowSprite(color, 1.7));
  mesh.position.copy(origin);
  if (extra.big) mesh.scale.setScalar(2.4);
  flash(origin, color, extra.big ? 2.2 : 1.1, 0.1, false);
  ctx.scene.add(mesh);
  projectiles.push({ kind: extra.big ? 'bigorb' : 'orb', friendly: true, mesh, vel: dir.clone().multiplyScalar(speed), life: extra.big ? 1.4 : 1.3, weapon, dmg, splash, color, bounces: extra.bounces || 0, hitSet: new Set() });
}

// Rìu ném bay ra rồi quay về
export function spawnBoomerang(owner, dir, weapon, dmg) {
  const mesh = new THREE.Group();
  const w = buildWeaponMesh(weapon);
  w.rotation.x = Math.PI / 2;
  mesh.add(w);
  mesh.position.copy(owner.pos).setY(1);
  ctx.scene.add(mesh);
  projectiles.push({ kind: 'boomerang', friendly: true, mesh, vel: dir.clone().multiplyScalar(16), life: 4, weapon, dmg, color: colorOf(weapon), out: 0.55, hitSet: new Set(), owner });
}

// Sóng kiếm: hình lưỡi liềm bay thẳng, xuyên qua quái
const waveGeo = new THREE.RingGeometry(0.7, 1.0, 20, 1, -Math.PI / 2 - 0.9, 1.8).rotateX(-Math.PI / 2);
export function spawnSwordWave(origin, dir, weapon, dmg, scale = 1) {
  const color = weapon.element === 'none' ? 0xfff1c4 : ELEMENTS[weapon.element].glow;
  const mesh = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.position.copy(origin).setY(0.9);
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
  mesh.scale.setScalar(scale);
  ctx.scene.add(mesh);
  projectiles.push({ kind: 'wave', friendly: true, mesh, vel: dir.clone().multiplyScalar(15), life: 0.55, weapon, dmg, color, hitSet: new Set(), scale });
}

// Đạn của quái: 'orb' (cầu tím của pháp sư) hoặc 'arrow' (mũi tên nỏ)
export function enemyShot(origin, dir, dmg = 8, kind = 'orb') {
  let mesh;
  if (kind === 'arrow') {
    mesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(1.6) }));
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
  } else {
    mesh = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe0b0ff).multiplyScalar(1.8) }));
    mesh.add(glowSprite(0xc06bff, 2));
    mesh.scale.setScalar(1.2);
  }
  mesh.position.copy(origin);
  ctx.scene.add(mesh);
  projectiles.push({ kind, friendly: false, mesh, vel: dir.clone().multiplyScalar(kind === 'arrow' ? 19 : 7), life: 3.5, dmg, color: kind === 'arrow' ? 0xffe0a0 : 0xc06bff });
}

function removeProjectile(i) {
  const p = projectiles[i];
  p.mesh.parent?.remove(p.mesh);
  if (p.mesh.material) p.mesh.material.dispose();
  if (p.kind === 'boomerang' && p.owner) p.owner.boomerangOut = false;
  projectiles.splice(i, 1);
}

function explodeBig(p) {
  explosion(p.mesh.position, 3.2, p.color, { core: 0xffffff, smoke: false, scorch: p.weapon?.element === 'fire' });
  addShake(0.3);
  play('explode', { at: p.mesh.position, vol: 0.6, rate: 1.3 });
  aoe(p.mesh.position, 3.2, p.dmg, p.weapon, 10);
}

export function updateProjectiles(dt) {
  const player = ctx.player;
  updateBombs(dt);
  updatePatches(dt);
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    const pos = p.mesh.position;

    if (p.kind === 'boomerang') {
      p.out -= dt;
      if (p.out <= 0) {
        // quay về tay người chơi
        if (!p.returning) { p.returning = true; p.hitSet.clear(); }
        const to = new THREE.Vector3(p.owner.pos.x - pos.x, 0, p.owner.pos.z - pos.z);
        const d = to.length();
        p.vel.copy(to.normalize().multiplyScalar(18));
        if (d < 0.9 || p.life <= 0) { removeProjectile(i); continue; }
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
    // Vệt sáng phía sau đạn
    if (p.kind === 'orb' || p.kind === 'bigorb') {
      const big = p.kind === 'bigorb';
      emit(pos, { frame: F.glow, color: p.color, size: big ? 1.4 : 0.6, size2: 0.05, life: big ? 0.35 : 0.22, alpha: 0.8 });
      if (Math.random() < (big ? 0.8 : 0.3)) emit(pos, { frame: F.sparkle, color: 0xffffff, color2: p.color, size: big ? 0.7 : 0.35, size2: 0, life: 0.4, vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2) });
    } else if (p.kind === 'wave') {
      if (Math.random() < 0.7) emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6 * p.scale, 0, (Math.random() - 0.5) * 1.6 * p.scale)), { frame: F.sparkle, color: 0xffffff, color2: p.color, size: 0.5, size2: 0, life: 0.3 });
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
          dealDamage(hit, p.dmg, p.weapon, p.vel.clone().setY(0).normalize(), p.explode ? 4 : 6, false);
          hitSpark(pos.clone(), p.color, false);
          play('hit', { at: pos, vol: 0.5, rate: 1.3 });
          if (p.explode) { explosion(pos, 2.8, p.color, { smoke: true, scorch: true }); aoe(pos, 2.8, Math.round(p.dmg * 0.7), p.weapon, 12, { exclude: hit }); play('explode', { at: pos, vol: 0.6 }); removeProjectile(i); continue; }
          p.hitSet.add(hit);
          if (p.pierce-- <= 0) removeProjectile(i);
          continue;
        }
        const dir = p.vel.clone().setY(0).normalize();
        dealDamage(hit, p.dmg, p.weapon, dir, 5, p.crit);
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
        // Nảy sang quái khác (nội tại Pháp Sư)
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
      const player = (ctx.players || [ctx.player]).find((pl) => !pl.dead && Math.hypot(pl.pos.x - pos.x, pl.pos.z - pos.z) < pl.radius + 0.25);
      if (player) {
        // Đỡ đòn: phản đạn ngược lại
        if (player.parryT > 0) {
          player.onParry(null);
          p.friendly = true;
          p.weapon = player.weapon;
          p.dmg = p.dmg * 3;
          p.splash = 1;
          p.hitSet = new Set();
          p.vel.multiplyScalar(-1.6);
          p.life = 2;
          continue;
        }
        if (player.hurt(p.dmg)) damageNumber(player.pos, p.dmg, 'player');
        burst(pos, p.color, 10, { speed: 4 });
        removeProjectile(i);
      }
    }
  }
}

// Thẻ "Lửa Lan": nổ lửa đốt quái xung quanh
export function fireBurst(pos, dmg) {
  explosion(pos, 2.4, 0xff7a2a, { smoke: false, scorch: false });
  play('ignite', { at: pos });
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
  for (let i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);
  bombs.length = 0;
  for (const f of patches) { ctx.scene.remove(f.mesh); f.mesh.material?.dispose(); }
  patches.length = 0;
  for (const f of toxics) { ctx.scene.remove(f.mesh); f.mesh.material?.dispose(); }
  toxics.length = 0;
}
