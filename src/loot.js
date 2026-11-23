import * as THREE from 'three';
import { buildWeaponMesh, weaponName, weaponIcons, RARITY } from './weapons.js';
import { burst, addShake, addHitStop, spawnRing } from './fx.js';
import { models, fitModel } from './models.js';
import { play } from './audio.js';

const labelLayer = document.getElementById('dmg-layer');
const SOUL_GEO = new THREE.OctahedronGeometry(1, 0);
const GOLD_GEO = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14);
const GOLD_MAT = new THREE.MeshStandardMaterial({ color: 0xffcf4a, emissive: 0x8a5a00, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.25 });
const SOUL_MAT = new THREE.MeshStandardMaterial({ color: 0x7fe0ff, emissive: 0x2fb0ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.3 });
const SCRAP_GEO = new THREE.TetrahedronGeometry(0.22, 0);
const SCRAP_MAT = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, emissive: 0x404858, emissiveIntensity: 0.6, metalness: 0.95, roughness: 0.3, flatShading: true });
const POTION_RING_GEO = new THREE.RingGeometry(0.35, 0.45, 24).rotateX(-Math.PI / 2);
const POTION_RING_MAT = new THREE.MeshBasicMaterial({ color: 0x6fe38a, transparent: true, opacity: 0.6, depthWrite: false });
const POTION_FALLBACK_GEO = new THREE.SphereGeometry(0.25, 12, 8);
const POTION_FALLBACK_MAT = new THREE.MeshStandardMaterial({ color: 0x40d060 });
const GEM_GEO = new THREE.OctahedronGeometry(0.22, 0);
const RUNE_GEO = new THREE.DodecahedronGeometry(0.24, 0);
const CORE_GEO = new THREE.OctahedronGeometry(0.34, 1);
const CORE_HALO_GEO = new THREE.TorusGeometry(0.42, 0.04, 6, 20);
const CORE_HALO_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
const pickupMatCache = new Map();
function getPickupMat(key, col, emi, metal = 0.4, rough = 0.2, flat = true) {
  if (!pickupMatCache.has(key)) {
    pickupMatCache.set(key, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: emi, metalness: metal, roughness: rough, flatShading: flat }));
  }
  return pickupMatCache.get(key);
}
// Thời gian vũ khí nằm trên sàn trước khi biến mất (theo độ hiếm)
const DROP_LIFE = [28, 40, 65, 95];
const tmp = new THREE.Vector3();

function makeLabel(html, cls) {
  const el = document.createElement('div');
  el.className = 'label ' + cls;
  el.innerHTML = html;
  labelLayer.appendChild(el);
  return el;
}

function overlapsSandbox(x, y) {
  const sb = document.getElementById('sandbox-bar');
  if (!sb || sb.classList.contains('hidden') || !sb.getBoundingClientRect) return false;
  const r = sb.getBoundingClientRect();
  return r.width > 0 && x >= r.left - 40 && x <= r.right + 40 && y >= r.top - 20 && y <= r.bottom + 20;
}

function placeLabel(el, pos, camera, yOff) {
  tmp.copy(pos).setY(yOff).project(camera);
  const px = (tmp.x * 0.5 + 0.5) * innerWidth;
  const py = (-tmp.y * 0.5 + 0.5) * innerHeight;
  const off = Math.abs(tmp.x) > 0.95 || tmp.y < -0.75 || tmp.y > 0.95 || overlapsSandbox(px, py);
  el.style.display = off ? 'none' : '';
  if (!off) el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-50%)`;
}

// ---------- Vũ khí rơi trên sàn ----------
export class Loot {
  constructor(scene) {
    this.scene = scene;
    this.drops = [];
    this.anvil = null;
    this.pickups = [];
  }

  // ---------- Bình máu / Hồn Thép ----------
  spawnPickup(kind, x, z, value = 1) {
    const group = new THREE.Group();
    if (kind === 'potion') {
      if (models.prop_potion) group.add(fitModel(models.prop_potion, 0.75, 'ground'));
      else group.add(new THREE.Mesh(POTION_FALLBACK_GEO, POTION_FALLBACK_MAT));
      const glow = new THREE.Mesh(POTION_RING_GEO, POTION_RING_MAT);
      glow.position.y = -0.45;
      group.add(glow);
    } else if (kind === 'gold') {
      const m = new THREE.Mesh(GOLD_GEO, GOLD_MAT);
      m.rotation.x = Math.PI / 2;
      m.scale.setScalar(1 + Math.min(value, 8) * 0.06);
      group.add(m);
    } else if (kind === 'gem') {
      const col = { ruby: 0xff3a4a, sapphire: 0x3a8aff, emerald: 0x3ad36a, topaz: 0xffc03a }[value] || 0xffffff;
      const m = new THREE.Mesh(GEM_GEO, getPickupMat('gem:' + col, col, 0.8, 0.4, 0.15, true));
      m.scale.y = 1.4;
      group.add(m);
    } else if (kind === 'rune') {
      const col = value?.color ? new THREE.Color(value.color).getHex() : 0xd8a8ff;
      const m = new THREE.Mesh(RUNE_GEO, getPickupMat('rune:' + col, col, 1.1, 0.35, 0.2, true));
      group.add(m);
    } else if (kind === 'core') {
      const col = value?.color ? new THREE.Color(value.color).getHex() : 0xffcf4a;
      const m = new THREE.Mesh(CORE_GEO, getPickupMat('core:' + col, col, 1.5, 0.7, 0.15, false));
      const halo = new THREE.Mesh(CORE_HALO_GEO, CORE_HALO_MAT);
      halo.rotation.x = Math.PI / 2;
      group.add(m, halo);
    } else if (kind === 'scrap') {
      for (let k = 0; k < Math.min(3, 1 + Math.floor(value / 4)); k++) {
        const m = new THREE.Mesh(SCRAP_GEO, SCRAP_MAT);
        m.position.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.25);
        m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        group.add(m);
      }
    } else {
      const m = new THREE.Mesh(SOUL_GEO, SOUL_MAT);
      m.scale.setScalar(0.16 + Math.min(value, 10) * 0.02);
      group.add(m);
    }
    group.position.set(x, 0.5, z);
    this.scene.add(group);
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3;
    this.pickups.push({ kind, value, group, pos: group.position, vel: new THREE.Vector3(Math.cos(a) * sp, 0, Math.sin(a) * sp), t: 0, flying: false });
  }

  // Hút toàn bộ vật phẩm trên sàn về phía người chơi khi dọn xong đợt
  vacuumAll() {
    for (const p of this.pickups) {
      if (p.kind !== 'potion') {
        p.flying = true;
        p.t = Math.max(p.t, 1.0);
      }
    }
  }

  // Trả về danh sách vật phẩm người chơi vừa nhặt
  updatePickups(dt, player, magnet = 0) {
    const got = [];
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      if (p.vel.lengthSq() > 0.01) { p.pos.addScaledVector(p.vel, dt); p.vel.multiplyScalar(Math.max(0, 1 - dt * 5)); }
      const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const wants = p.kind !== 'potion' || player.hp < player.maxHp;
      const reach = (p.kind !== 'potion' ? 2.2 : 1.4) + magnet;
      if (!player.dead && wants && p.t > 0.35 && (p.flying || d < reach)) {
        p.flying = true;
        const sp = 9 + p.t * 6;
        p.pos.x += (dx / (d || 1)) * Math.min(d, sp * dt);
        p.pos.z += (dz / (d || 1)) * Math.min(d, sp * dt);
      }
      p.pos.y = 0.55 + Math.sin(p.t * 4) * 0.1;
      p.group.rotation.y += dt * 2.5;
      if (!player.dead && wants && d < 0.6) {
        got.push({ kind: p.kind, value: p.value });
        this.scene.remove(p.group);
        this.pickups.splice(i, 1);
      }
    }
    return got;
  }

  drop(weapon, x, z) {
    const group = new THREE.Group();
    const mesh = buildWeaponMesh(weapon);
    mesh.rotation.x = -Math.PI / 2;        // dựng đứng
    mesh.position.y = -0.8;
    const spinner = new THREE.Group();
    spinner.add(mesh);
    group.add(spinner);

    const rc = new THREE.Color(RARITY[weapon.rarity].css);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.4, 5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: rc, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 2.5;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 32),
      new THREE.MeshBasicMaterial({ color: rc, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(beam, ring);
    group.position.set(x, 0, z);
    this.scene.add(group);

    const label = makeLabel(
      `${weaponIcons(weapon)}<span style="color:${RARITY[weapon.rarity].css}">${weaponName(weapon)}</span>`,
      'drop',
    );
    const d = { weapon, group, spinner, label, pos: new THREE.Vector3(x, 0, z), t: Math.random() * 10, spawnAge: 0, age: 0, life: DROP_LIFE[weapon.rarity] };
    this.drops.push(d);
    burst(new THREE.Vector3(x, 1, z), rc.getHex(), 14, { speed: 4, size: 0.12 });
    play(weapon.rarity >= 2 ? 'dropRare' : 'drop', { at: d.pos });
    return d;
  }

  remove(d) {
    this.scene.remove(d.group);
    d.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    d.label.remove();
    this.drops.splice(this.drops.indexOf(d), 1);
  }

  nearest(pos, maxDist = 1.6) {
    let best = null, bd = maxDist;
    for (const d of this.drops) {
      if (d.spawnAge < 0.3) continue;
      const dist = Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // ---------- Đe rèn ----------
  spawnAnvil(x, z) {
    const g = new THREE.Group();
    const owned = [];
    if (models.anvil) {
      g.add(fitModel(models.anvil, 1.15, 'ground'));   // đe rèn dựng bằng Blender
    } else {
      const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.8, roughness: 0.4 });
      const hot = new THREE.MeshStandardMaterial({ color: 0x6a4a3a, emissive: 0xff5a1a, emissiveIntensity: 0.6 });
      const add = (geo, mat, px, py, pz) => { owned.push(geo); const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
      owned.push(iron, hot);
      add(new THREE.BoxGeometry(0.9, 0.3, 0.7), iron, 0, 0.15, 0);
      add(new THREE.BoxGeometry(0.45, 0.45, 0.4), iron, 0, 0.5, 0);
      add(new THREE.BoxGeometry(1.4, 0.3, 0.55), iron, 0.1, 0.85, 0);
      const horn = add(new THREE.ConeGeometry(0.22, 0.6, 8), iron, -0.85, 0.85, 0);
      horn.rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(1.0, 0.04, 0.4), hot, 0.15, 1.01, 0);
    }
    const light = new THREE.PointLight(0xff7a2a, 14, 7, 1.6);
    light.position.set(0, 1.8, 0);
    g.add(light);
    const ringGeo = new THREE.RingGeometry(1.3, 1.45, 40).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.6, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.03;
    owned.push(ringGeo, ringMat);
    g.add(ring);
    g.position.set(x, -1.2, z);
    this.scene.add(g);
    const label = makeLabel('<i class="ico ico-anvil"></i> Đe Rèn', 'anvil');
    this.anvil = { group: g, light, ring, label, pos: new THREE.Vector3(x, 0, z), rise: 0, used: false, forging: null, owned };
    spawnRing(this.scene, this.anvil.pos, 2.5, 0xffa040, 0.6);
    play('anvil');
    burst(new THREE.Vector3(x, 0.5, z), 0xffa040, 30, { speed: 7, size: 0.15 });
  }

  removeAnvil() {
    if (!this.anvil) return;
    this.scene.remove(this.anvil.group);
    if (this.anvil.owned) for (const r of this.anvil.owned) r?.dispose?.();
    this.anvil.label.remove();
    this.anvil = null;
  }

  nearAnvil(pos) {
    const a = this.anvil;
    return a && !a.used && !a.forging && Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) < 2.0;
  }

  // Ba nhát búa rồi trả kết quả qua callback
  startForge(onDone) {
    this.anvil.forging = { t: 0, hits: 0, onDone };
  }

  update(dt, camera, player, time, combatActive = true) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.spawnAge = (d.spawnAge || 0) + dt;
      // Bảo vệ vũ khí Hiếm+ khỏi hết hạn trong lúc nghỉ giữa đợt
      if (combatActive || (d.weapon?.rarity || 0) === 0) d.age += dt;
      // Sắp hết hạn: nhấp nháy nhanh dần; hết hạn thì tan biến
      const left = d.life - d.age;
      if (left <= 0) {
        burst(d.pos.clone().setY(1), RARITY[d.weapon.rarity].css === '#c9c9c9' ? 0xb0b0b0 : new THREE.Color(RARITY[d.weapon.rarity].css).getHex(), 10, { speed: 3, size: 0.1, up: 2 });
        this.remove(d);
        continue;
      }
      const blink = left < 6 ? Math.sin(d.t * (left < 2.5 ? 30 : 14)) > 0 : true;
      d.group.visible = blink;
      d.label.style.opacity = left < 6 ? (blink ? 1 : 0.35) : '';
      d.spinner.rotation.y += dt * 1.6;
      d.spinner.position.y = 1.3 + Math.sin(d.t * 2.5) * 0.12;
      const near = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z) < 1.6;
      d.label.classList.toggle('near', near);
      placeLabel(d.label, d.pos, camera, 2.6);
    }

    const a = this.anvil;
    if (a) {
      a.rise = Math.min(1, a.rise + dt * 2);
      a.group.position.y = -1.2 * (1 - a.rise) * (1 - a.rise);
      a.light.intensity = 12 + Math.sin(time * 9) * 3;
      a.ring.material.opacity = a.used ? 0.1 : 0.45 + Math.sin(time * 4) * 0.2;
      a.label.classList.toggle('near', this.nearAnvil(player.pos));
      placeLabel(a.label, a.pos, camera, 2.2);

      const f = a.forging;
      if (f) {
        f.t += dt;
        const hitTimes = [0.05, 0.3, 0.55];
        while (f.hits < 3 && f.t >= hitTimes[f.hits]) {
          f.hits++;
          burst(a.pos.clone().setY(1.1), 0xffc04a, 18 + f.hits * 6, { speed: 7, size: 0.1, life: 0.5 });
          addShake(0.25 + f.hits * 0.1);
          play('hammer', { rate: 1 + f.hits * 0.06 });
          addHitStop(0.05);
        }
        if (f.t > 0.85) {
          a.forging = null;
          a.used = true;
          play('forged');
          spawnRing(this.scene, a.pos, 3, 0xffcf4a, 0.5);
          burst(a.pos.clone().setY(1.2), 0xffcf4a, 40, { speed: 9, size: 0.16, life: 0.9 });
          f.onDone();
        }
      }
    }
  }

  clear() {
    for (const p of this.pickups) this.scene.remove(p.group);
    this.pickups = [];
    while (this.drops.length) this.remove(this.drops[0]);
    this.removeAnvil();
  }
}
