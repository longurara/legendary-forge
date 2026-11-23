// Hệ thống Đồng Hành: 4 Thú Cưng Lò Rèn (Pets), Xương Đồng Minh (Chiêu Hồn Sư) & Bẫy Kẹp Thép (Thợ Săn)
import * as THREE from 'three';
import { models, fitModel, Animator } from './models.js';
import { collide } from './world.js';
import { ctx, dealDamage, spawnOrb, aoe } from './combat.js';
import { burst, spawnRing, damageNumber, emit, F, flash, flame } from './fx.js';
import { play } from './audio.js';

const COMP_RING_GEO = new THREE.RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2);
const PET_RING_MAT = new THREE.MeshBasicMaterial({ color: 0x7fffb0, transparent: true, opacity: 0.55, depthWrite: false });
const ALLY_RING_MAT = new THREE.MeshBasicMaterial({ color: 0x50ff9a, transparent: true, opacity: 0.6, depthWrite: false });
const TRAP_BASE_GEO = new THREE.CylinderGeometry(0.65, 0.72, 0.1, 10);
const TRAP_BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.8, roughness: 0.35 });
const TRAP_RING_GEO = new THREE.RingGeometry(0.75, 0.88, 18).rotateX(-Math.PI / 2);
const TRAP_RING_MAT = new THREE.MeshBasicMaterial({ color: 0x7fff9a, transparent: true, opacity: 0.55, depthWrite: false });

export class CompanionManager {
  constructor(scene) {
    this.scene = scene;
    this.pet = null;
    this.allies = [];
    this.traps = [];
  }

  _disposeEntry(entry) {
    if (!entry?.owned) return;
    for (const r of entry.owned) r?.dispose?.();
    entry.owned.length = 0;
  }

  clear() {
    if (this.pet) {
      this.scene.remove(this.pet.group);
      this._disposeEntry(this.pet);
      this.pet = null;
    }
    for (const a of this.allies) { this.scene.remove(a.group); this._disposeEntry(a); }
    this.allies.length = 0;
    for (const t of this.traps) this.scene.remove(t.mesh);
    this.traps.length = 0;
  }

  setPet(petId, pos) {
    if (this.pet) { this.scene.remove(this.pet.group); this._disposeEntry(this.pet); this.pet = null; }
    if (!petId || petId === 'none') return null;
    const cfg = {
      slime: { model: 'slime', size: 0.65, hoverY: 0, anim: 'Slime_Walk', col: 0xffcf4a, em: 0xd88810 },
      drake: { model: 'mon_drake', size: 0.95, hoverY: 1.05, anim: 'Flying_Idle', col: 0xff7a2a, em: 0xff3a00 },
      crab: { model: 'mon_crab', size: 0.8, hoverY: 0, anim: 'Walk', col: 0x6fc3ff, em: 0x2080d0 },
      imp: { model: 'mon_imp', size: 0.85, hoverY: 0.95, anim: 'Flying_Idle', col: 0xff9a40, em: 0xff4a10 },
    }[petId];
    if (!cfg) return null;

    const group = new THREE.Group();
    const owned = [];
    let anim = null;
    if (models[cfg.model]) {
      const fitted = fitModel(models[cfg.model], cfg.size, 'ground');
      fitted.traverse((o) => {
        if (o.isMesh && o.material?.color) {
          o.material = o.material.clone();
          o.material.color.lerp(new THREE.Color(cfg.col), 0.45);
          if (o.material.emissive) { o.material.emissive.setHex(cfg.em); o.material.emissiveIntensity = 0.25; }
          owned.push(o.material);
        }
      });
      group.add(fitted);
      anim = new Animator(fitted);
      anim.play(cfg.anim, { fade: 0 });
    } else {
      const geo = new THREE.SphereGeometry(0.32, 12, 8);
      const mat = new THREE.MeshStandardMaterial({ color: cfg.col, emissive: cfg.em, emissiveIntensity: 0.35 });
      owned.push(geo, mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = 0.35;
      group.add(m);
    }
    const ring = new THREE.Mesh(COMP_RING_GEO, PET_RING_MAT);
    ring.position.y = 0.03;
    group.add(ring);

    const start = pos ? pos.clone().add(new THREE.Vector3(1.6, 0, 1.2)) : new THREE.Vector3(1.6, 0, 4);
    group.position.set(start.x, cfg.hoverY, start.z);
    this.scene.add(group);
    this.pet = { id: petId, cfg, group, anim, pos: start, cd: 1.5, facing: 0, owned };
    return this.pet;
  }

  spawnAllySkeleton(pos, dmgMul = 1) {
    if (this.allies.length >= 3) {
      const old = this.allies.shift();
      this.scene.remove(old.group);
      this._disposeEntry(old);
    }
    const group = new THREE.Group();
    const owned = [];
    let anim = null;
    if (models.enemy_minion) {
      const fitted = fitModel(models.enemy_minion, 1.6, 'ground');
      fitted.traverse((o) => {
        if (o.isMesh && o.material?.color) {
          o.material = o.material.clone();
          o.material.color.lerp(new THREE.Color(0x50ff9a), 0.5);
          if (o.material.emissive) { o.material.emissive.setHex(0x20d86a); o.material.emissiveIntensity = 0.45; }
          owned.push(o.material);
        }
      });
      group.add(fitted);
      anim = new Animator(fitted);
      anim.play('Running_C', { fade: 0 });
    } else {
      const geo = new THREE.CapsuleGeometry(0.28, 0.7, 4, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0x50ff9a, emissive: 0x20a850, emissiveIntensity: 0.5 });
      owned.push(geo, mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.y = 0.65;
      group.add(m);
    }
    const ring = new THREE.Mesh(COMP_RING_GEO, ALLY_RING_MAT);
    ring.position.y = 0.03;
    group.add(ring);
    const p = pos.clone();
    group.position.copy(p);
    this.scene.add(group);
    burst(p.clone().setY(0.8), 0x50ff9a, 14, { speed: 6, size: 0.15 });
    const ally = { group, anim, pos: p, life: 24, cd: 0.4, facing: 0, dmgMul, owned };
    this.allies.push(ally);
    return ally;
  }

  spawnBearTrap(pos, dmg = 26) {
    if (this.traps.length >= 4) {
      const old = this.traps.shift();
      this.scene.remove(old.mesh);
    }
    const mesh = new THREE.Group();
    const base = new THREE.Mesh(TRAP_BASE_GEO, TRAP_BASE_MAT);
    base.position.y = 0.05;
    const ring = new THREE.Mesh(TRAP_RING_GEO, TRAP_RING_MAT);
    ring.position.y = 0.04;
    mesh.add(base, ring);
    mesh.position.set(pos.x, 0, pos.z);
    this.scene.add(mesh);
    const trap = { mesh, pos: pos.clone().setY(0), dmg, life: 16 };
    this.traps.push(trap);
    return trap;
  }

  update(dt, player, enemies, loot, time) {
    if (!player || player.dead) return;
    const bellMul = player.hasRelic?.('petbell') ? 1.45 : 1;
    const prevTag = ctx.dmgTag;
    ctx.dmgTag = 'pet';
    try {
      this._updatePet(dt, player, enemies, loot, time, bellMul);
      this._updateAllies(dt, player, enemies, bellMul);
      this._updateTraps(dt, player, enemies);
    } finally {
      ctx.dmgTag = prevTag;
    }
  }

  _updatePet(dt, player, enemies, loot, time, bellMul) {
    const p = this.pet;
    if (!p) return;
    if (p.anim) p.anim.update(dt);
    p.cd = Math.max(0, p.cd - dt * bellMul);

    // Mục tiêu di chuyển: Slime Kho Báu ưu tiên chạy nhặt pickup gần đó; các pet khác bay/bò sát quanh người chơi
    let tx = player.pos.x + Math.cos(time * 1.4) * 2.1;
    let tz = player.pos.z + Math.sin(time * 1.4) * 2.1;
    if (p.id === 'slime' && loot?.pickups?.length) {
      const nearPick = loot.pickups
        .filter((pk) => pk.kind === 'gold' || pk.kind === 'scrap' || pk.kind === 'soul')
        .sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
      if (nearPick && nearPick.pos.distanceTo(player.pos) < 15) {
        tx = nearPick.pos.x; tz = nearPick.pos.z;
        if (nearPick.pos.distanceTo(p.pos) < 1.3) nearPick.pos.lerp(player.pos, Math.min(1, dt * 14));
      }
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.3) {
      const spd = Math.min(12, Math.max(4.5, d * 2.6));
      p.pos.x += (dx / d) * spd * dt;
      p.pos.z += (dz / d) * spd * dt;
      p.facing = Math.atan2(dx, dz);
    }
    collide(p.pos, 0.35);
    const bob = p.cfg.hoverY > 0 ? Math.sin(time * 4.5) * 0.16 : Math.abs(Math.sin(time * 8)) * (d > 0.4 ? 0.18 : 0.04);
    p.group.position.set(p.pos.x, p.cfg.hoverY + bob, p.pos.z);
    p.group.rotation.y = p.facing;

    // Kỹ năng riêng từng loại Thú Đồng Hành
    if (p.cd > 0) return;
    const nearest = enemies
      .filter((e) => e.alive && !e.spawning && e.pos.distanceTo(p.pos) < 14)
      .sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];

    if (p.id === 'drake' && nearest) {
      p.cd = 2.2;
      const dir = new THREE.Vector3(nearest.pos.x - p.pos.x, 0, nearest.pos.z - p.pos.z).normalize();
      p.facing = Math.atan2(dir.x, dir.z);
      spawnOrb(p.pos.clone().setY(1.1), dir, { element: 'fire', element2: null }, Math.round(16 * player.stats.dmg * bellMul), 1.4, 18, {});
      flame(p.pos.clone().setY(1.1), { count: 2, size: 0.45, spread: 0.25 });
      play('ignite', { at: p.pos, rate: 1.5, vol: 0.3 });
    } else if (p.id === 'slime' && nearest && nearest.pos.distanceTo(p.pos) < 5) {
      p.cd = 2.8;
      nearest.slowT = Math.max(nearest.slowT, 2.5);
      dealDamage(nearest, Math.round(12 * player.stats.dmg * bellMul), { element: 'none', element2: null }, null, 4, false, false);
      burst(nearest.pos.clone().setY(0.5), 0xffcf4a, 8, { speed: 4, size: 0.12 });
    } else if (p.id === 'crab') {
      p.cd = 6.0;
      player.shieldHp = Math.max(player.shieldHp, Math.round(16 * bellMul));
      spawnRing(this.scene, player.pos, 2.4, 0x7fdcff, 0.35);
      if (nearest && nearest.pos.distanceTo(player.pos) < 4.5) {
        const dir = new THREE.Vector3(nearest.pos.x - player.pos.x, 0, nearest.pos.z - player.pos.z).normalize();
        dealDamage(nearest, Math.round(14 * player.stats.dmg * bellMul), { element: 'none', element2: null }, dir, 14, false, false);
      }
      play('freeze', { at: player.pos, rate: 1.6, vol: 0.35 });
    } else if (p.id === 'imp') {
      p.cd = 3.0;
      const w = player.weapon;
      if (w) {
        w.dur = Math.min(100, (w.dur ?? 100) + 2.5 * bellMul);
        if (w.overheatT > 0) w.overheatT = Math.max(0, w.overheatT - 1.2);
      }
      if (nearest) {
        const dir = new THREE.Vector3(nearest.pos.x - p.pos.x, 0, nearest.pos.z - p.pos.z).normalize();
        spawnOrb(p.pos.clone().setY(1.0), dir, { element: 'fire', element2: null }, Math.round(11 * player.stats.dmg * bellMul), 0, 22, { bolt: true, pierce: 1 });
      }
    }
  }

  _updateAllies(dt, player, enemies, bellMul) {
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const a = this.allies[i];
      a.life -= dt;
      a.cd = Math.max(0, a.cd - dt * bellMul);
      if (a.anim) a.anim.update(dt);
      if (a.life <= 0) {
        burst(a.pos.clone().setY(0.7), 0x50ff9a, 10, { speed: 4, size: 0.14 });
        this.scene.remove(a.group);
        this.allies.splice(i, 1);
        continue;
      }
      const target = enemies
        .filter((e) => e.alive && !e.spawning)
        .sort((x, y) => x.pos.distanceTo(a.pos) - y.pos.distanceTo(a.pos))[0];
      const tx = target ? target.pos.x : player.pos.x + Math.cos(i * 2.1) * 2.6;
      const tz = target ? target.pos.z : player.pos.z + Math.sin(i * 2.1) * 2.6;
      const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz) || 0.001;
      a.facing = Math.atan2(dx, dz);
      if (d > (target ? 1.5 : 0.8)) {
        a.pos.x += (dx / d) * 5.2 * dt;
        a.pos.z += (dz / d) * 5.2 * dt;
        a.anim?.play('Running_C');
      } else if (target && a.cd <= 0) {
        a.cd = 0.85;
        a.anim?.play('1H_Melee_Attack_Chop', { once: true, fade: 0.05, speed: 1.5 });
        const dir = new THREE.Vector3(dx / d, 0, dz / d);
        dealDamage(target, Math.round(15 * player.stats.dmg * a.dmgMul * bellMul), { element: 'poison', element2: null }, dir, 5, false, false);
        play('swing', { at: a.pos, rate: 1.3, vol: 0.35 });
      }
      collide(a.pos, 0.45);
      a.group.position.set(a.pos.x, 0, a.pos.z);
      a.group.rotation.y = a.facing;
    }
  }

  _updateTraps(dt, player, enemies) {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const tr = this.traps[i];
      tr.life -= dt;
      const hit = enemies.find((e) => e.alive && !e.spawning && e.pos.distanceTo(tr.pos) < 1.15 + e.radius);
      if (hit || tr.life <= 0) {
        if (hit) {
          spawnRing(this.scene, tr.pos, 2.4, 0x7fff9a, 0.35);
          flash(tr.pos.clone().setY(0.5), 0xffe080, 2.2, 0.16, false);
          damageNumber(hit.pos, 'Sập Bẫy!', 'react stun');
          play('hitHeavy', { at: tr.pos, rate: 1.4, vol: 0.65 });
          dealDamage(hit, Math.round(tr.dmg * player.stats.dmg), { element: 'blood', element2: null }, null, 2, true, false);
          if (!hit.isBoss) hit.stunT = Math.max(hit.stunT, 2.4);
          else if (hit.poiseMax) hit.poise += tr.dmg * 1.6;
          aoe(tr.pos, 2.2, Math.round(tr.dmg * 0.5 * player.stats.dmg), { element: 'blood', element2: null }, 4, { exclude: hit });
        }
        this.scene.remove(tr.mesh);
        this.traps.splice(i, 1);
      }
    }
  }
}
