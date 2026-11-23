// Cơ chế #8a: Bóng Ma Thợ Rèn Kế Thừa (Fallen Echo / Revenant)
// Lưu lại bản sao vũ khí & build khi bạn gục ngã; ở lượt sau gặp lại Bia Mộ Thợ Rèn để quyết đấu & đoạt di sản!
import * as THREE from 'three';
import { Walker, tintMats, hurtPlayer } from './enemies_new.js';
import { models, fitModel, Animator } from './models.js';
import { buildHeldWeapon, makeWeapon, weaponName, ELEMENTS, TYPES, RARITY } from './weapons.js';
import { charById } from './content.js';
import { ctx, enemyShot, scheduleBomb } from './combat.js';
import { burst, smoke, flash, spawnRing, spawnTelegraph, spawnBolt, damageNumber, addShake, glowSprite, emit, F } from './fx.js';
import { play } from './audio.js';

const labelLayer = () => document.getElementById('dmg-layer');
const tmpV = new THREE.Vector3();

export function serializeWeapon(w) {
  if (!w) return null;
  return {
    type: w.type, element: w.element || 'none', element2: w.element2 || null,
    rarity: w.rarity || 0, affixes: [...(w.affixes || [])], plus: w.plus || 0,
    specialType: w.specialType || null, grafted: !!w.grafted,
    title: w.title || null, legend: w.legend || null, legendText: w.legendText || null,
    masterworks: [...(w.masterworks || [])], runes: [...(w.runes || [])],
  };
}

export function hydrateEchoWeapon(snap) {
  const w = makeWeapon(snap.type, snap.element, snap.rarity, snap.element2, [...(snap.affixes || [])]);
  w.plus = snap.plus || 0;
  w.specialType = snap.specialType || null;
  w.grafted = !!snap.grafted;
  w.title = snap.title || `Hồn Khí · ${weaponName(w)}`;
  w.legend = snap.legend || null;
  w.legendText = snap.legendText || null;
  w.masterworks = [...(snap.masterworks || [])];
  w.runes = [...(snap.runes || [])];
  return w;
}

export function recordEcho(meta, floor, charId, weapon, godId = null) {
  if (!meta || !weapon) return;
  // Chỉ lưu khi người chơi đã có chút tiến độ (vũ khí >= Hiếm hoặc >= +1 hoặc tầng >= 2 hoặc có phụ tố)
  if (floor < 2 && weapon.rarity < 1 && !(weapon.plus > 0) && !(weapon.affixes?.length > 0)) return;
  meta.echoes = meta.echoes || [];
  const snap = {
    id: 'echo_' + Date.now(),
    floor,
    charId: charId || 'knight',
    godId: godId || null,
    weapon: serializeWeapon(weapon),
    wName: weaponName(weapon),
    date: new Date().toISOString().slice(0, 10),
  };
  // Giữ tối đa 3 bóng ma gần nhất, không trùng lặp tầng
  meta.echoes = [snap, ...meta.echoes.filter((e) => e.floor !== floor)].slice(0, 3);
}

export function findEchoForFloor(meta, floor) {
  const list = meta?.echoes || [];
  return list.find((e) => e.floor === floor) || (floor >= 2 ? list[0] : null) || null;
}

export function removeEcho(meta, echoId) {
  if (!meta?.echoes) return;
  meta.echoes = meta.echoes.filter((e) => e.id !== echoId);
}

// ---------- Kẻ địch: Bóng Ma Thợ Rèn ----------
export class FallenEcho extends Walker {
  constructor(scene, x, z, echo, floor = 1) {
    super(scene, x, z);
    this.echo = echo;
    this.isEcho = true;
    this.miniBoss = true;
    this.name = `Bóng Ma · ${echo.wName || 'Thợ Rèn'}`;
    this.hp = Math.round(160 + floor * 95 + (echo.weapon?.rarity || 0) * 45);
    this.maxHpEff = this.hp;
    this.poiseMax = Math.round(this.hp * 0.45);
    this.color = 0x70e0ff;
    this.mass = 2.2;
    this.contactDmg = 0;
    this.dropChance = 0;
    this.xp = 22;
    this.hurtSound = 'hitHeavy';
    this.dieSound = 'mageDie';
    this.state = 'chase';
    this.timer = 0.8;
    this.cd = 1.4;
    this.nextAtk = 0;
    this.shadowScale = 1.1;

    const ch = charById(echo.charId);
    this.body = new THREE.Group();
    this.anim = null;
    this.facing = 0;
    const entry = models[ch.model] || models.player;
    if (entry) {
      const fitted = fitModel(entry, 2.2, 'ground');
      for (const n of ch.gear || []) { const o = fitted.getObjectByName(n); if (o) o.visible = false; }
      if (ch.shield) { const sh = fitted.getObjectByName(ch.shield); if (sh) sh.visible = false; }
      const hand = fitted.getObjectByName('handslotr');
      if (hand && echo.weapon) {
        const hw = buildHeldWeapon(echo.weapon);
        if (hw) hand.add(hw);
      }
      this.body.add(fitted);
      this.anim = new Animator(fitted);
      this.anim.play('Idle', { fade: 0 });
    }
    this.group.add(this.body);
    this.setupMaterials(this.body);
    tintMats(this, 0x58d8ff, 0.55, 0x3a8aff, 0.55);

    // Nhãn tên bóng ma
    this.label = document.createElement('div');
    this.label.className = 'label elite echo-lbl';
    this.label.textContent = this.name;
    labelLayer()?.appendChild(this.label);
  }

  get radius() { return 0.65; }

  think(bdt, player, d, dx, dz) {
    const w = this.echo.weapon || { type: 'sword', element: 'none' };
    const ranged = !!TYPES[w.type]?.ranged;
    const el = w.element || 'none';
    const elCol = ELEMENTS[el]?.color || 0x70e0ff;
    this.cd -= bdt;

    if (Math.random() < bdt * 6) {
      emit(this.pos.clone().setY(0.8 + Math.random()), { frame: F.glow, color: 0x9fe8ff, color2: elCol, size: 0.4, size2: 0.05, life: 0.55, vel: new THREE.Vector3(0, 1.2, 0) });
    }

    if (this.state === 'chase') {
      this.facing = Math.atan2(dx, dz);
      const wantDist = ranged ? 7.5 : 2.8;
      if (d > wantDist) this.move(dx / d, dz / d, 4.4, bdt);
      else if (ranged && d < 4.5) this.move(-dx / d, -dz / d, 3.2, bdt);
      if (this.cd <= 0 && !player.dead && d < 12) {
        const pick = this.nextAtk++ % 3;
        if (pick === 0) {
          // Đòn Xuyên Phá (Phản Xuyên được bằng Clash Dash!)
          this.state = 'dashWind'; this.timer = 0.65;
          this.teleKind = 'pierce';
          this.tele = spawnTelegraph(this.scene, { shape: 'rect', pos: this.pos, width: 1.6, length: 9.5, facing: this.facing, duration: 0.65, kind: 'pierce' });
          if (this.anim) this.anim.play('1H_Melee_Attack_Stab', { once: true, fade: 0.08, speed: 0.7 });
          return null;
        }
        if (pick === 1 && ranged) {
          this.state = 'shootWind'; this.timer = 0.65;
          this.teleKind = 'interrupt';
          this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 2.5, duration: 0.65, kind: 'interrupt' });
          if (this.anim) this.anim.play('Spellcast_Shoot', { once: true, fade: 0.08 });
          return null;
        }
        // Đòn Chém Nguyên Tố / Tích Lực (Cắt Chiêu được!)
        this.state = 'slamWind'; this.timer = 0.75;
        this.teleKind = 'interrupt';
        this.tele = spawnTelegraph(this.scene, { shape: 'circle', pos: this.pos, radius: 3.6, duration: 0.75, kind: 'interrupt' });
        if (this.anim) this.anim.play('2H_Melee_Attack_Spin', { once: true, fade: 0.08, speed: 0.7 });
        return null;
      }
      return { name: d > wantDist ? 'Running_A' : 'Idle', opts: { speed: 1.2 } };
    }

    if (this.state === 'dashWind') {
      this.timer -= bdt;
      if (this.timer <= 0) { this.state = 'dash'; this.left = 9.5; this.hit = false; this.teleKind = 'pierce'; play('dash', { at: this.pos, rate: 0.85 }); }
      return null;
    }
    if (this.state === 'dash') {
      const step = 22 * bdt;
      this.move(Math.sin(this.facing), Math.cos(this.facing), 22, bdt);
      this.left -= step;
      if (!this.hit && !player.dead && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.3) {
        this.hit = true;
        hurtPlayer(player, 18);
      }
      if (this.left <= 0) { this.teleKind = null; this.state = 'recover'; this.timer = 0.65; }
      return { name: 'Dodge_Forward', opts: { speed: 1.4 } };
    }
    if (this.state === 'shootWind') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        for (const off of [-0.22, 0, 0.22]) {
          const a = this.facing + off;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          enemyShot(this.pos.clone().setY(1.2).addScaledVector(dir, 0.8), dir, 12, w.type === 'crossbow' ? 'arrow' : 'orb');
        }
        play('cast', { at: this.pos, rate: 0.9 });
        this.state = 'recover'; this.timer = 0.75;
      }
      return null;
    }
    if (this.state === 'slamWind') {
      this.timer -= bdt;
      if (this.timer <= 0) {
        this.teleKind = null;
        spawnRing(this.scene, this.pos, 3.6, elCol, 0.45);
        play('hitHeavy', { at: this.pos });
        addShake(0.4);
        if (!player.dead && d < 3.6 + player.radius) hurtPlayer(player, 20);
        // Phản ánh nguyên tố của vũ khí cũ!
        if (el === 'fire') scheduleBomb(player.pos.clone(), 0.75, 2.2, 0, 14, 0xff6a1a);
        else if (el === 'lightning') {
          const at = player.pos.clone();
          spawnBolt(this.scene, at.clone().setY(9), at.clone().setY(0.4), 0xffe14a);
          if (!player.dead && player.pos.distanceTo(at) < 1.8) hurtPlayer(player, 14);
        } else if (el === 'ice' && !player.dead && d < 4.5) {
          player.slowT = 2.5;
        }
        this.state = 'recover'; this.timer = 0.8;
      }
      return null;
    }
    if (this.state === 'recover') {
      this.teleKind = null;
      this.timer -= bdt;
      if (this.timer <= 0) { this.state = 'chase'; this.cd = 1.6; }
      return 'Idle';
    }
    return 'Idle';
  }

  die() {
    if (this.tele) this.tele.done = true;
    super.die();
  }
}

// ---------- Quản lý Bia Mộ Thợ Rèn & Quả Cầu Hồn Khí trong phòng ----------
export class EchoManager {
  constructor(scene) {
    this.scene = scene;
    this.grave = null;
    this.orb = null;
  }

  clear() {
    if (this.grave) { this.scene.remove(this.grave.group); this.grave.label.remove(); this.grave = null; }
    if (this.orb) { this.scene.remove(this.orb.group); this.orb.label.remove(); this.orb = null; }
  }

  spawnGrave(echo, x = -6, z = -3) {
    this.clear();
    const g = new THREE.Group();
    const m = models['crypt/gravestone'] || models['crypt/grave_A'];
    if (m) {
      const o = m.scene.clone(true);
      o.scale.setScalar(1.0);
      g.add(o);
    } else {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a6a7a }));
      s.position.y = 0.75; g.add(s);
    }
    const halo = glowSprite(0x70e0ff, 2.2);
    halo.position.y = 1.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.28, 32), new THREE.MeshBasicMaterial({ color: 0x70e0ff, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    g.add(halo, ring);
    g.position.set(x, 0, z);
    this.scene.add(g);

    const label = document.createElement('div');
    label.className = 'label reward echo-lbl';
    label.innerHTML = `<i class="ico" style="--i:url('/ui/icons/x_ghost2.svg');color:#70e0ff"></i>Bia Mộ Thợ Rèn<small>${echo.wName}</small>`;
    labelLayer()?.appendChild(label);

    this.grave = { echo, group: g, ring, label, pos: new THREE.Vector3(x, 0, z) };
    spawnRing(this.scene, this.grave.pos, 2.8, 0x70e0ff, 0.55);
  }

  nearGrave(pos) {
    return this.grave && Math.hypot(this.grave.pos.x - pos.x, this.grave.pos.z - pos.z) < 2.2 ? this.grave : null;
  }

  awakenGrave() {
    if (!this.grave) return null;
    const { echo, pos } = this.grave;
    this.scene.remove(this.grave.group);
    this.grave.label.remove();
    this.grave = null;
    smoke(pos.clone().setY(1), { count: 10, color: 0x306080, size: 1.4, life: 1.0, alpha: 0.6 });
    flash(pos.clone().setY(1.4), 0x70e0ff, 4.5, 0.25);
    play('anvil', { rate: 0.8 });
    return { echo, pos };
  }

  spawnSoulOrb(echo, pos) {
    if (this.orb) { this.scene.remove(this.orb.group); this.orb.label.remove(); }
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({ color: 0xbff4ff }),
    );
    core.position.y = 1.2;
    const halo = glowSprite(0x70e0ff, 2.4);
    halo.position.y = 1.2;
    g.add(core, halo);
    g.position.set(pos.x, 0, pos.z);
    this.scene.add(g);

    const label = document.createElement('div');
    label.className = 'label reward echo-lbl';
    label.innerHTML = `<i class="ico" style="--i:url('/ui/icons/x_sword-stone.svg');color:#9fe8ff"></i>Di Sản Hồn Khí<small>${echo.wName}</small>`;
    labelLayer()?.appendChild(label);

    this.orb = { echo, group: g, core, label, pos: new THREE.Vector3(pos.x, 0, pos.z) };
    spawnRing(this.scene, pos, 3.2, 0x9fe8ff, 0.5);
    play('forged');
  }

  nearOrb(pos) {
    return this.orb && Math.hypot(this.orb.pos.x - pos.x, this.orb.pos.z - pos.z) < 2.2 ? this.orb : null;
  }

  consumeOrb() {
    if (!this.orb) return null;
    const echo = this.orb.echo;
    this.scene.remove(this.orb.group);
    this.orb.label.remove();
    this.orb = null;
    return echo;
  }

  update(dt, camera, time, playerPos) {
    const place = (el, pos, y) => {
      tmpV.set(pos.x, y, pos.z).project(camera);
      const off = Math.abs(tmpV.x) > 1 || Math.abs(tmpV.y) > 1;
      el.style.display = off ? 'none' : '';
      if (!off) {
        const x = (tmpV.x * 0.5 + 0.5) * innerWidth;
        const y2 = (-tmpV.y * 0.5 + 0.5) * innerHeight;
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y2.toFixed(1)}px,0) translate(-50%,-50%)`;
      }
    };
    if (this.grave) {
      this.grave.ring.rotation.z += dt * 0.8;
      this.grave.label.classList.toggle('hot', !!this.nearGrave(playerPos));
      place(this.grave.label, this.grave.pos, 2.4);
    }
    if (this.orb) {
      this.orb.core.rotation.y += dt * 2.2;
      this.orb.core.position.y = 1.2 + Math.sin(time * 3) * 0.14;
      this.orb.label.classList.toggle('hot', !!this.nearOrb(playerPos));
      place(this.orb.label, this.orb.pos, 2.2);
    }
  }
}
