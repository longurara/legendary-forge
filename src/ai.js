// Hệ thống trí tuệ chiến thuật dùng chung: lái tránh vật cản/bẫy, kiểm tra tầm nhìn (LOS),
// bắn đón đầu vận tốc, chọn chiêu Boss theo tình huống & điều phối đội hình quái.
import * as THREE from 'three';
import { isBlocked, pillars, boxes, ROOM_HALF } from './world.js';
import { ctx, getFirePatches, getToxics } from './combat.js';

const _v = { x: 0, z: 0 };

/**
 * Kiểm tra đường ngắm thẳng từ (ax, az) tới (bx, bz) có bị cột hoặc tường thấp chắn không.
 */
export function hasLineOfSight(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.8) return true;
  const steps = Math.max(1, Math.floor(dist / 0.85));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + dx * t, z = az + dz * t;
    for (const p of pillars) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + 0.15) return false;
    }
    for (const b of boxes) {
      if (!b.pit && Math.abs(x - b.x) < b.hx + 0.15 && Math.abs(z - b.z) < b.hz + 0.15) return false;
    }
  }
  return true;
}

/**
 * Dự đoán vị trí tương lai của mục tiêu dựa trên vận tốc (giảm tốc độ lướt để tránh đoán lố).
 */
export function leadPos(origin, target, projSpeed, leadScale = 0.65, maxLead = 4.2) {
  const tx = target?.pos?.x ?? 0, tz = target?.pos?.z ?? 0;
  if (!target?.vel) { _v.x = tx; _v.z = tz; return { x: tx, z: tz }; }
  const dist = Math.hypot(tx - origin.x, tz - origin.z);
  const vMul = target.dashTime > 0 ? 0.25 : 1;
  const t = Math.min(0.85, dist / Math.max(4, projSpeed)) * leadScale;
  let lx = (target.vel.x || 0) * vMul * t;
  let lz = (target.vel.z || 0) * vMul * t;
  const lm = Math.hypot(lx, lz);
  if (lm > maxLead) {
    lx = (lx / lm) * maxLead;
    lz = (lz / lm) * maxLead;
  }
  const lim = ROOM_HALF - 1.5;
  return {
    x: Math.max(-lim, Math.min(lim, tx + lx)),
    z: Math.max(-lim, Math.min(lim, tz + lz)),
  };
}

export function leadAngle(origin, target, projSpeed, leadScale = 0.65, maxLead = 4.2) {
  const p = leadPos(origin, target, projSpeed, leadScale, maxLead);
  return Math.atan2(p.x - origin.x, p.z - origin.z);
}

/**
 * Di chuyển có né cột, tường thấp, hố và vũng nguy hiểm phía trước.
 */
export function steerMove(e, dirX, dirZ, speed, bdt, opts = {}) {
  const len = Math.hypot(dirX, dirZ);
  if (len < 1e-4 || bdt <= 0 || speed <= 0) return;
  const nx = dirX / len, nz = dirZ / len;
  if (opts.ignoreObstacles && opts.ignoreHazards) {
    e.pos.x += nx * speed * bdt;
    e.pos.z += nz * speed * bdt;
    return;
  }

  const s = e._steerSide || 1;
  const angles = [0, 0.45 * s, -0.45 * s, 0.95 * s, -0.95 * s, 1.48 * s, -1.48 * s, 2.1 * s, -2.1 * s];
  const rCheck = (e.radius || 0.5) * 0.85;
  const probe = Math.max(1.15, (e.radius || 0.5) + 0.85);
  const checkObs = !opts.ignoreObstacles;
  const checkHaz = !opts.ignoreHazards;
  const fires = checkHaz ? getFirePatches() : null;
  const tox = checkHaz && !e.slimy ? getToxics() : null;
  const armed = [];
  if (checkHaz && ctx.enemies) {
    for (const o of ctx.enemies) if (o !== e && o.alive && o.fuse >= 0) armed.push(o);
  }

  let bestScore = -1e9, bestX = nx, bestZ = nz, bestAng = 0;
  for (const ang of angles) {
    const c = ang === 0 ? 1 : Math.cos(ang), sn = ang === 0 ? 0 : Math.sin(ang);
    const cx = nx * c - nz * sn, cz = nx * sn + nz * c;
    let score = cx * nx + cz * nz;
    const px = e.pos.x + cx * probe, pz = e.pos.z + cz * probe;
    if (checkObs && isBlocked(px, pz, rCheck)) score -= 10;
    if (checkHaz) {
      for (const f of fires) {
        if (!f.hurtsPlayer && Math.hypot(px - f.pos.x, pz - f.pos.z) < f.radius + rCheck) { score -= 3.5; break; }
      }
      if (tox) {
        for (const t of tox) {
          if (Math.hypot(px - t.pos.x, pz - t.pos.z) < t.radius + rCheck) { score -= 2.5; break; }
        }
      }
      for (const b of armed) {
        if (Math.hypot(px - b.pos.x, pz - b.pos.z) < 2.8) { score -= 3.5; break; }
      }
    }
    if (score > bestScore) {
      bestScore = score; bestX = cx; bestZ = cz; bestAng = ang;
    }
  }
  if (Math.abs(bestAng) > 0.05) e._steerSide = bestAng > 0 ? 1 : -1;
  e.pos.x += bestX * speed * bdt;
  e.pos.z += bestZ * speed * bdt;
}

/**
 * Di chuyển cho quái tầm xa: né góc kẹt, nghiêng góc khi mất tầm nhìn sau cột đá.
 */
export function rangedStrafeVec(e, player, d, dx, dz, minDist, maxDist, moveSpd, strafeSpd, bdt) {
  const toX = dx / (d || 1), toZ = dz / (d || 1);
  const st = e.strafe || 1;
  const perpX = -toZ * st, perpZ = toX * st;
  let vx, vz;
  if (!hasLineOfSight(e.pos.x, e.pos.z, player.pos.x, player.pos.z)) {
    vx = perpX * strafeSpd * 1.45 + toX * moveSpd * 0.45;
    vz = perpZ * strafeSpd * 1.45 + toZ * moveSpd * 0.45;
  } else {
    const nearEdge = Math.abs(e.pos.x) > ROOM_HALF - 4.5 || Math.abs(e.pos.z) > ROOM_HALF - 4.5;
    if (nearEdge && d < minDist + 2) {
      const inLen = Math.hypot(e.pos.x, e.pos.z) || 1;
      vx = (-e.pos.x / inLen) * moveSpd * 0.85 + perpX * strafeSpd * 1.35;
      vz = (-e.pos.z / inLen) * moveSpd * 0.85 + perpZ * strafeSpd * 1.35;
    } else {
      const radial = d > maxDist ? 1 : d < minDist ? -1 : 0;
      vx = toX * radial * moveSpd + perpX * strafeSpd;
      vz = toZ * radial * moveSpd + perpZ * strafeSpd;
    }
  }
  steerMove(e, vx, vz, Math.hypot(vx, vz), bdt);
}

/**
 * Chọn chiêu cho Boss theo trọng số tình huống, giảm lặp lại đòn vừa dùng.
 */
export function pickBossMove(boss, scoredOptions) {
  const valid = scoredOptions.filter((o) => o && o.weight > 0);
  if (!valid.length) return scoredOptions[0]?.id;
  let best = valid[0], bestVal = -1;
  for (const opt of valid) {
    const rep = opt.id === boss._lastMove ? 0.25 : 1;
    const val = opt.weight * rep * (0.85 + Math.random() * 0.3);
    if (val > bestVal) { bestVal = val; best = opt; }
  }
  boss._lastMove = best.id;
  return best.id;
}

// ---------- Điều phối chiến thuật nhóm quái ----------
let _tacticsActive = false;
let _activeTokens = 0;
let _maxTokens = 4;

export function resetTactics() {
  _tacticsActive = false;
  _activeTokens = 0;
}

export function updateTactics(enemies, player, dt) {
  if (!enemies || !player) return;
  _tacticsActive = true;
  _maxTokens = Math.min(6, 3 + (ctx.floor || 1));
  _activeTokens = 0;
  const melee = [];
  for (const e of enemies) {
    if (!e.alive || e.dead || e.spawning) continue;
    if (e._atkTokenT > 0) {
      e._atkTokenT = Math.max(0, e._atkTokenT - dt);
      if (e._atkTokenT > 0) _activeTokens++;
    }
    if (!e.isBoss && e.mass < 50 && e._isRanged !== true) {
      melee.push(e);
    }
  }
  if (melee.length > 1) {
    melee.sort((a, b) => Math.atan2(a.pos.z - player.pos.z, a.pos.x - player.pos.x) - Math.atan2(b.pos.z - player.pos.z, b.pos.x - player.pos.x));
    const baseA = Math.atan2(melee[0].pos.z - player.pos.z, melee[0].pos.x - player.pos.x);
    for (let i = 0; i < melee.length; i++) {
      melee[i]._slotA = baseA + (i / melee.length) * Math.PI * 2;
    }
  } else if (melee.length === 1 && melee[0]._slotA == null) {
    melee[0]._slotA = Math.atan2(melee[0].pos.z - player.pos.z, melee[0].pos.x - player.pos.x);
  }
}

export function canStartMelee(e) {
  if (!_tacticsActive || e?.isBoss || e?.miniBoss || e?.nemesis) return true;
  if (e?._atkTokenT > 0) return true;
  return _activeTokens < _maxTokens;
}

export function claimMeleeToken(e) {
  if (!e) return;
  if (!(e._atkTokenT > 0)) _activeTokens++;
  e._atkTokenT = 0.7;
}

export function findWoundedAlly(healer, maxRange = 18) {
  let best = null, bestRatio = 0.92;
  for (const e of ctx.enemies || []) {
    if (!e.alive || e.dead || e.spawning || e === healer || e.mass >= 50 || e.ward) continue;
    const max = e.maxHpEff || e.maxHp || e.hp;
    if (!max) continue;
    const ratio = e.hp / max;
    if (ratio < bestRatio && e.pos.distanceTo(healer.pos) <= maxRange) {
      bestRatio = ratio;
      best = e;
    }
  }
  return best;
}
