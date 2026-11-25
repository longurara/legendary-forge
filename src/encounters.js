// Đội hình quái theo chủ đề (Themed Squads) & Mục tiêu phòng động (Giữ Vòng Lò Lửa, Vòng Lửa Bó Hẹp, Trụ Neo)
import * as THREE from 'three';
import { isBlocked, ROOM_HALF } from './world.js';
import { aoe } from './combat.js';
import { spawnRing, burst, damageNumber } from './fx.js';
import { play } from './audio.js';

export const SQUADS = [
  {
    id: 'phalanx_crossbow',
    name: 'Phalanx Khiên & Nỏ',
    minWave: 1,
    biomes: ['stone', 'sanctum'],
    escort: true,
    members: ['shield', 'archer', 'archer', 'minion', 'minion'],
  },
  {
    id: 'slime_pack',
    name: 'Bầy Slime Cảm Tử',
    minWave: 1,
    biomes: ['swamp', 'lava', 'ice'],
    members: ['big', 'normal', 'normal', 'bomber', 'bomber'],
  },
  {
    id: 'goblin_ambush',
    name: 'Toán Cướp Goblin',
    minWave: 1,
    biomes: ['stone', 'crypt', 'swamp'],
    members: ['goblin', 'goblin', 'goblin', 'viper', 'orc'],
  },
  {
    id: 'pyro_cult',
    name: 'Giáo Phái Hỏa Ngục',
    minWave: 2,
    biomes: ['lava', 'stone'],
    escort: true,
    members: ['pyro', 'imp', 'imp', 'shield', 'berserker'],
  },
  {
    id: 'frost_legion',
    name: 'Quân Đoàn Hàn Băng',
    minWave: 2,
    biomes: ['ice', 'sanctum'],
    members: ['frostguard', 'drake', 'drake', 'crab', 'archer'],
  },
  {
    id: 'swamp_blight',
    name: 'Ổ Độc Đầm Lầy',
    minWave: 2,
    biomes: ['swamp', 'crypt'],
    members: ['glub', 'glub', 'spider', 'spider', 'viper'],
  },
  {
    id: 'necro_coven',
    name: 'Hội Chiêu Hồn Hắc Ám',
    minWave: 3,
    biomes: ['crypt', 'sanctum'],
    escort: true,
    members: ['necro', 'healer', 'shield', 'armored', 'wraith'],
  },
  {
    id: 'cavalry_blitz',
    name: 'Kỵ Binh Thương Đột Kích',
    minWave: 3,
    biomes: ['stone', 'sanctum', 'ice'],
    members: ['lancer', 'lancer', 'wasp', 'wasp', 'archer'],
  },
  {
    id: 'shadow_hunters',
    name: 'Biệt Đội Sát Thủ',
    minWave: 4,
    biomes: ['sanctum', 'crypt'],
    members: ['assassin', 'assassin', 'wraith', 'mage', 'mage'],
  },
  {
    id: 'armored_vanguard',
    name: 'Thiết Giáp Công Thành',
    minWave: 4,
    biomes: ['lava', 'stone', 'ice'],
    escort: true,
    members: ['armored', 'orc', 'burrower', 'burrower', 'healer'],
  },
];

const RANGED_SET = new Set(['archer', 'healer', 'mage', 'pyro', 'necro', 'viper', 'imp', 'drake', 'glub']);

function pickWeighted(pool, biome, rng) {
  let total = 0;
  const weights = pool.map((s) => {
    const w = s.biomes.includes(biome) ? 3 : 1;
    total += w;
    return w;
  });
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[0];
}

function squadAnchor(ang, dist, rng, playerPos = null) {
  const lim = ROOM_HALF - 3.5;
  for (let attempt = 0; attempt < 24; attempt++) {
    const a = ang + attempt * 0.38;
    const r = dist + (attempt % 3) * 2.0;
    const x = Math.max(-lim, Math.min(lim, Math.cos(a) * r));
    const z = Math.max(-lim, Math.min(lim, Math.sin(a) * r));
    if (playerPos && Math.hypot(x - playerPos.x, z - playerPos.z) < 8.5) continue;
    if (!isBlocked(x, z, 1.2)) return [x, z];
  }
  if (playerPos && Math.hypot(-playerPos.x, -12 - playerPos.z) < 8.5) {
    return [playerPos.x >= 0 ? -12 : 12, playerPos.z >= 0 ? -12 : 12];
  }
  return [0, -12];
}

function memberPos(ax, az, idx, rng, playerPos = null) {
  const lim = ROOM_HALF - 2.2;
  for (let k = 0; k < 16; k++) {
    const a = (idx * 1.9 + k * 0.7) % (Math.PI * 2);
    const r = 1.4 + (k % 3) * 1.4 + rng() * 1.4;
    const x = Math.max(-lim, Math.min(lim, ax + Math.cos(a) * r));
    const z = Math.max(-lim, Math.min(lim, az + Math.sin(a) * r));
    if (playerPos && Math.hypot(x - playerPos.x, z - playerPos.z) < 6.0) continue;
    if (!isBlocked(x, z, 0.85)) return [x, z];
  }
  if (playerPos && Math.hypot(ax - playerPos.x, az - playerPos.z) < 6.0) {
    const dx = ax - playerPos.x, dz = az - playerPos.z;
    const d = Math.hypot(dx, dz);
    const ux = d > 1e-4 ? dx / d : Math.cos(idx * 1.7);
    const uz = d > 1e-4 ? dz / d : Math.sin(idx * 1.7);
    const px = Math.max(-lim, Math.min(lim, playerPos.x + ux * 6.5));
    const pz = Math.max(-lim, Math.min(lim, playerPos.z + uz * 6.5));
    if (Math.hypot(px - playerPos.x, pz - playerPos.z) >= 6.0 && !isBlocked(px, pz, 0.85)) return [px, pz];
    return [playerPos.x >= 0 ? -10 : 10, playerPos.z >= 0 ? -10 : 10];
  }
  return [ax, az];
}

export function composeWaveSquads({ wave = 1, floor = 1, biome = 'stone', mult = 1, arenaWave = false, rng = Math.random, playerPos = null, minCount = 16, maxCap = 36 } = {}) {
  const avail = SQUADS.filter((s) => s.minWave <= wave);
  const pool = avail.length ? avail : SQUADS.slice(0, 3);
  const wantSquads = arenaWave ? 2 : (wave >= 4 ? 3 : 2);

  const chosen = [];
  const escortPool = pool.filter((s) => s.escort || s.members.includes('shield'));
  if (escortPool.length) chosen.push(pickWeighted(escortPool, biome, rng));
  while (chosen.length < wantSquads) {
    const rest = pool.filter((s) => !chosen.includes(s));
    chosen.push(pickWeighted(rest.length ? rest : pool, biome, rng));
  }

  const cap = arenaWave ? Math.max(12, Math.round(18 * Math.min(1.2, mult))) : Math.min(maxCap, Math.round((16 + floor * 4 + Math.min(8, wave)) * mult));
  const targetCount = Math.min(cap, Math.max(minCount, Math.round((14 + floor * 3 + wave * 1.3) * mult)));

  const units = [];
  const escortPairs = [];
  const baseA = rng() * Math.PI * 2;
  const anchors = chosen.map((_, i) => squadAnchor(baseA + (i / chosen.length) * Math.PI * 2, 13 + rng() * 6, rng, playerPos));

  chosen.forEach((sq, sIdx) => {
    const [ax, az] = anchors[sIdx];
    const startIdx = units.length;
    for (let i = 0; i < sq.members.length && units.length < cap; i++) {
      const kind = sq.members[i];
      const [x, z] = memberPos(ax, az, i, rng, playerPos);
      units.push({ kind, x, z, squadId: sq.id, sIdx });
    }
    const guards = [];
    const ranged = [];
    for (let i = startIdx; i < units.length; i++) {
      if (units[i].kind === 'shield') guards.push(i);
      else if (RANGED_SET.has(units[i].kind)) ranged.push(i);
    }
    for (let g = 0; g < guards.length && ranged.length; g++) {
      escortPairs.push({ guardIndex: guards[g], targetIndex: ranged[g % ranged.length] });
    }
  });

  // Bổ sung thêm lính từ các đội hình đã chọn để đạt đủ mật độ chiến thuật (16..36)
  let padI = 0;
  while (units.length < targetCount) {
    const sIdx = padI % chosen.length;
    const sq = chosen[sIdx];
    const [ax, az] = anchors[sIdx];
    const fillers = sq.members.filter((k) => k !== 'healer' && k !== 'necro' && k !== 'mother');
    const kind = fillers[padI % fillers.length] || sq.members[0];
    const [x, z] = memberPos(ax, az, units.length, rng, playerPos);
    units.push({ kind, x, z, squadId: sq.id, sIdx });
    padI++;
  }

  return {
    units,
    squadNames: chosen.map((s) => s.name),
    escortPairs,
  };
}

function disposeOwned(list) {
  if (!list) return;
  for (const r of list) r?.dispose?.();
}

export class RoomObjectiveManager {
  constructor(scene) {
    this.scene = scene;
    this.koth = null;
    this.fireRing = null;
    this.anchors = null;
  }

  startKoth(pos, onComplete, dur = 12) {
    this.clearKoth();
    const radius = 4.5;
    const group = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(radius - 0.18, radius, 48).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.04;

    const fillGeo = new THREE.CircleGeometry(radius - 0.2, 48).rotateX(-Math.PI / 2);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffa830, transparent: true, opacity: 0.22, depthWrite: false });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.y = 0.03;
    fill.scale.setScalar(0.02);

    const beamGeo = new THREE.CylinderGeometry(0.14, 0.36, 4.5, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beacon = new THREE.Mesh(beamGeo, beamMat);
    beacon.position.y = 2.25;

    group.add(ring, fill, beacon);
    group.position.set(pos.x, 0, pos.z);
    this.scene.add(group);
    this.koth = {
      group, ring, fill, beacon,
      pos: new THREE.Vector3(pos.x, 0, pos.z),
      radius,
      progress: 0,
      dur,
      done: false,
      onComplete,
      owned: [ringGeo, ringMat, fillGeo, fillMat, beamGeo, beamMat],
    };
    return this.koth;
  }

  clearKoth() {
    if (!this.koth) return;
    this.scene.remove(this.koth.group);
    disposeOwned(this.koth.owned);
    this.koth = null;
  }

  setFireRing(radius) {
    if (!radius || radius <= 0) {
      if (this.fireRing) {
        this.scene.remove(this.fireRing.mesh);
        disposeOwned(this.fireRing.owned);
        this.fireRing = null;
      }
      return;
    }
    if (!this.fireRing) {
      const geo = new THREE.RingGeometry(0.96, 1.0, 64).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.06;
      this.scene.add(mesh);
      this.fireRing = { mesh, radius, tickT: 0.8, owned: [geo, mat] };
    }
    this.fireRing.radius = radius;
    this.fireRing.mesh.scale.setScalar(radius);
  }

  startAnchors(totems, onTrickle) {
    this.anchors = { totems: [...totems], spawnT: 7.5, onTrickle, done: false };
  }

  update(dt, player, enemies, time = 0) {
    if (this.koth && !this.koth.done) {
      const k = this.koth;
      k.beacon.material.opacity = 0.18 + Math.sin(time * 4) * 0.08;
      const inside = player && !player.dead && Math.hypot(player.pos.x - k.pos.x, player.pos.z - k.pos.z) <= k.radius;
      if (inside) {
        k.progress = Math.min(1, k.progress + dt / k.dur);
        k.fill.scale.setScalar(Math.max(0.05, k.progress));
        k.ring.material.color.setHex(0xffe880);
      } else {
        k.ring.material.color.setHex(0xffb840);
      }
      if (k.progress >= 1) {
        k.done = true;
        spawnRing(this.scene, k.pos, 9.0, 0xffe060, 0.65);
        burst(k.pos.clone().setY(0.8), 0xffe060, 32, { speed: 10, size: 0.2 });
        aoe(k.pos, 9.0, 45, { element: 'holy', element2: null }, 14);
        for (const e of enemies || []) {
          if (e.alive && !e.isBoss && e.pos.distanceTo(k.pos) < 9.0) {
            e.stunT = Math.max(e.stunT || 0, 2.0);
          }
        }
        play('forged');
        const cb = k.onComplete;
        this.clearKoth();
        cb?.();
      }
    }

    if (this.fireRing) {
      this.fireRing.mesh.material.opacity = 0.52 + Math.sin(time * 5) * 0.18;
      if (player && !player.dead && Math.hypot(player.pos.x, player.pos.z) > this.fireRing.radius) {
        this.fireRing.tickT -= dt;
        if (this.fireRing.tickT <= 0) {
          this.fireRing.tickT = 0.8;
          if (player.hurt(8)) damageNumber(player.pos, 8, 'player');
          damageNumber(player.pos, 'Vào trong vòng lửa!', 'burn');
        }
      } else {
        this.fireRing.tickT = Math.min(this.fireRing.tickT, 0.35);
      }
    }

    if (this.anchors && !this.anchors.done) {
      const alive = this.anchors.totems.filter((t) => t && !t.dead && t.alive);
      if (alive.length === 0) {
        this.anchors.done = true;
        play('explode', { rate: 1.2 });
        for (const e of enemies || []) {
          if (e.alive && !e.isBoss) e.stunT = Math.max(e.stunT || 0, 2.0);
        }
        if (player) {
          spawnRing(this.scene, player.pos, 8, 0xff60a0, 0.55);
          damageNumber(player.pos, 'Phá Hết Mỏ Neo!', 'react ult');
        }
      } else {
        this.anchors.spawnT -= dt;
        if (this.anchors.spawnT <= 0) {
          this.anchors.spawnT = 7.5;
          this.anchors.onTrickle?.(alive.length);
        }
      }
    }
  }

  hudText() {
    const parts = [];
    if (this.koth && !this.koth.done) {
      parts.push(`<b style="color:#ffcf4a">Vòng Lò Lửa: ${Math.round(this.koth.progress * 100)}%</b>`);
    }
    if (this.anchors && !this.anchors.done) {
      const left = this.anchors.totems.filter((t) => t && !t.dead && t.alive).length;
      parts.push(`<b style="color:#ff60a0">Mỏ Neo: còn ${left} trụ</b>`);
    }
    return parts.join(' · ');
  }

  clear() {
    this.clearKoth();
    this.setFireRing(0);
    this.anchors = null;
  }
}
