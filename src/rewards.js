// Bệ chọn phần thưởng (kiểu cửa phòng của Hades), thương nhân, rương di vật
import * as THREE from 'three';
import { models, fitModel, Animator } from './models.js';
import { burst, spawnRing, emit, F, glowSprite, runeDecal } from './fx.js';
import { play } from './audio.js';

export const REWARDS = {
  weapon: { name: 'Vũ khí', icon: 'x_swords-emblem', desc: 'Vũ khí mới hiếm hơn', color: 0xffcf4a },
  perk: { name: 'Thẻ năng lực', icon: 'level', desc: 'Thêm 1 lần chọn thẻ', color: 0x9fd4ff },
  souls: { name: 'Hồn Thép', icon: 'soul', desc: '+25 Hồn Thép', color: 0x7fe0ff },
  gold: { name: 'Vàng', icon: 'x_coins', desc: '+40 vàng', color: 0xffd060 },
  potion: { name: 'Hồi phục', icon: 'potion', desc: 'Hồi đầy máu', color: 0x6fe38a },
  relic: { name: 'Di vật', icon: 'x_locked-chest', desc: 'Rương di vật', color: 0xc77dff },
  treasure: { name: 'Kho báu', icon: 'x_gold', desc: 'Phòng kho báu: 2 rương di vật + vàng, không có quái', color: 0xffd060 },
  shop: { name: 'Thương nhân', icon: 'x_shop', desc: 'Đợt sau là cửa hàng, không phải đánh', color: 0xffa040 },
  challenge: { name: 'Thử thách', icon: 'x_skull-signet', desc: 'Đợt sau toàn tinh anh, thưởng di vật', color: 0xff5a4a },
};

const labelLayer = () => document.getElementById('dmg-layer');
const tmp = new THREE.Vector3();

function placeLabel(el, pos, camera, y) {
  tmp.set(pos.x, y, pos.z).project(camera);
  el.style.display = Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1 ? 'none' : '';
  el.style.left = (tmp.x * 0.5 + 0.5) * innerWidth + 'px';
  el.style.top = (-tmp.y * 0.5 + 0.5) * innerHeight + 'px';
}

export class Rewards {
  constructor(scene) {
    this.scene = scene;
    this.pedestals = [];
    this.merchant = null;
    this.chests = [];
  }

  // ---------- Bệ phần thưởng ----------
  offer(kinds, z = -6) {
    this.clearPedestals();
    const gap = 5;
    kinds.forEach((kind, i) => {
      const r = REWARDS[kind];
      const x = (i - (kinds.length - 1) / 2) * gap;
      const g = new THREE.Group();
      // Bệ đá 2 tầng + viền phát sáng theo màu phần thưởng
      const stone = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.85 });
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.3, 8), stone);
      b1.position.y = 0.15;
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.35, 8), stone);
      b2.position.y = 0.47;
      b1.castShadow = b2.castShadow = true; b1.receiveShadow = b2.receiveShadow = true;
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color).multiplyScalar(1.1) }));
      trim.rotation.x = Math.PI / 2; trim.position.y = 0.66;
      // Cột sáng mờ dần lên trên
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.2, 24, 1, true), beamMaterial(r.color));
      beam.position.y = 0.65 + 1.6;
      // Vật phẩm lơ lửng + quầng sáng
      const item = new THREE.Group();
      item.add(makeItem(kind, r.color));
      const halo = glowSprite(r.color, 1.8);
      halo.material = halo.material.clone(); halo.material.opacity = 0.55;
      halo.position.y = 0.5;
      item.add(halo);
      item.position.y = 1.1;
      // Vòng phép xoay dưới sàn
      const rune = runeDecal(r.color, 1.7);
      g.add(b1, b2, trim, beam, item, rune);
      g.position.set(x, 0, z);
      this.scene.add(g);
      const label = document.createElement('div');
      label.className = 'label reward';
      label.innerHTML = `<i class="ico" style="--i:url('/ui/icons/${r.icon}.svg');color:#${r.color.toString(16).padStart(6, '0')}"></i>${r.name}<small>${r.desc}</small>`;
      labelLayer().appendChild(label);
      this.pedestals.push({ kind, group: g, gem: item, rune, beam, color: r.color, label, pos: new THREE.Vector3(x, 0, z), near: 0 });
      spawnRing(this.scene, new THREE.Vector3(x, 0, z), 2, r.color, 0.5);
    });
  }

  nearestPedestal(pos) {
    return this.pedestals.find((p) => Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 1.8);
  }

  clearPedestals() {
    for (const p of this.pedestals) { this.scene.remove(p.group); p.label.remove(); }
    this.pedestals = [];
  }

  // ---------- Thương nhân ----------
  spawnMerchant(x = 0, z = -6) {
    this.removeMerchant();
    const g = new THREE.Group();
    const table = models['dungeon/shop_table'];
    if (table) { const t = table.scene.clone(true); t.scale.setScalar(0.8); t.position.set(0, 0, 1.2); g.add(t); }
    let anim = null;
    if (models.npc_merchant) {
      const npc = fitModel(models.npc_merchant, 1.9, 'ground');
      for (const n of ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable']) { const o = npc.getObjectByName(n); if (o) o.visible = false; }
      g.add(npc);
      anim = new Animator(npc);
      anim.play('Idle');
    }
    const light = new THREE.PointLight(0xffc070, 10, 8, 1.6);
    light.position.set(0, 2.5, 1.5);
    g.add(light);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const label = document.createElement('div');
    label.className = 'label reward';
    label.innerHTML = '<i class="ico" style="--i:url(\'/ui/icons/x_shop.svg\');color:#ffa040"></i>Thương nhân';
    labelLayer().appendChild(label);
    this.merchant = { group: g, anim, label, pos: new THREE.Vector3(x, 0, z + 1.2) };
    spawnRing(this.scene, this.merchant.pos, 2.5, 0xffa040, 0.5);
  }

  removeMerchant() {
    if (!this.merchant) return;
    this.scene.remove(this.merchant.group);
    this.merchant.label.remove();
    this.merchant = null;
  }

  nearMerchant(pos) {
    return this.merchant && Math.hypot(this.merchant.pos.x - pos.x, this.merchant.pos.z - pos.z) < 2.4;
  }

  // ---------- Rương di vật ----------
  spawnChest(x, z) {
    const g = new THREE.Group();
    let lid = null;
    const m = models['dungeon/chest'];
    if (m) { const c = m.scene.clone(true); c.scale.setScalar(0.75); g.add(c); lid = c.getObjectByName('chest_lid'); }
    else g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0x8a5a2a })));
    const light = new THREE.PointLight(0xc77dff, 8, 5, 1.6);
    light.position.y = 1.4;
    g.add(light);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    const label = document.createElement('div');
    label.className = 'label reward';
    label.innerHTML = '<i class="ico" style="--i:url(\'/ui/icons/x_locked-chest.svg\');color:#c77dff"></i>Rương di vật';
    labelLayer().appendChild(label);
    this.chests.push({ group: g, lid, label, pos: new THREE.Vector3(x, 0, z), opened: false, t: 0 });
    burst(new THREE.Vector3(x, 1, z), 0xc77dff, 24, { speed: 6, size: 0.14 });
    play('dropRare', { at: { x, z } });
  }

  nearestChest(pos) {
    return this.chests.find((c) => !c.opened && Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < 1.9);
  }

  openChest(c) {
    c.opened = true;
    c.label.remove();
    burst(c.pos.clone().setY(1), 0xc77dff, 40, { speed: 8, size: 0.16 });
    play('forged');
  }

  update(dt, camera, time, playerPos) {
    const nearP = playerPos ? this.nearestPedestal(playerPos) : null;
    for (const p of this.pedestals) {
      if (p.gem.children[0].userData.noSpin) p.gem.rotation.y = Math.sin(time * 1.5 + p.pos.x) * 0.5;
      else p.gem.rotation.y += dt * 1.4;
      p.gem.position.y = 1.15 + Math.sin(time * 2.5 + p.pos.x) * 0.1;
      p.rune.rotation.z += dt * 0.5;
      // Sáng lên khi người chơi đứng gần
      const want = p === nearP ? 1 : 0;
      p.near += (want - p.near) * Math.min(1, dt * 8);
      p.beam.material.uniforms.uBoost.value = 1 + p.near * 1.2;
      p.rune.material.opacity = 0.45 + p.near * 0.5;
      p.label.classList.toggle('hot', want === 1);
      if (Math.random() < dt * (6 + p.near * 10)) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.6;
        emit(new THREE.Vector3(p.pos.x + Math.cos(a) * rr, 0.7, p.pos.z + Math.sin(a) * rr), { frame: F.sparkle, color: 0xffffff, color2: p.color, size: 0.3, size2: 0.05, life: 1.2, vel: new THREE.Vector3(0, 1.2 + Math.random(), 0), rotV: 2 });
      }
      placeLabel(p.label, p.pos, camera, 3.1);
    }
    if (this.merchant) {
      this.merchant.anim?.update(dt);
      placeLabel(this.merchant.label, this.merchant.pos, camera, 2.8);
    }
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      if (!c.opened) { placeLabel(c.label, c.pos, camera, 1.8); continue; }
      c.t += dt;
      if (c.lid) c.lid.rotation.x = -Math.min(1.9, c.t * 6);
      if (c.t > 2.5) { this.scene.remove(c.group); this.chests.splice(i, 1); }
    }
  }

  clear() {
    this.clearPedestals();
    this.removeMerchant();
    for (const c of this.chests) { this.scene.remove(c.group); c.label.remove(); }
    this.chests = [];
  }
}

// Shader cột sáng: đậm ở chân, mờ dần lên trên, sáng hơn ở viền (fresnel giả)
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uBoost: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uBoost; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float fade = pow(1.0 - clamp(vUv.y, 0.0, 1.0), 1.8);
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = fade * (0.05 + rim * 0.22) * uBoost;
        gl_FragColor = vec4(uColor * 1.4, clamp(a, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

// Mô hình vật phẩm trên bệ theo loại phần thưởng
function makeItem(kind, color) {
  const g = new THREE.Group();
  const fit = (name, size, mode = 'ground') => (models[name] ? fitModel(models[name], size, mode) : null);
  let o = null;
  if (kind === 'weapon') {
    o = fit('weapon_sword', 1.7, 'weapon');
    // Nghiêng về phía camera để không bị ngắn lại khi nhìn từ trên xuống
    if (o) { const h = new THREE.Group(); o.rotation.x = -Math.PI / 2; o.position.y = -0.1; h.add(o); h.rotation.x = -0.95; g.userData.noSpin = true; o = h; }
  } else if (kind === 'perk') { o = fit('prop_spellbook', 0.95); if (o) o.rotation.x = 0.5; }
  else if (kind === 'potion') o = fit('prop_potion', 1.15);
  else if (kind === 'gold') o = fit('dungeon/coin_stack', 0.8);
  else if (kind === 'relic') o = fit('dungeon/chest', 0.9);
  else if (kind === 'treasure') o = fit('dungeon/chest', 1.0);
  else if (kind === 'shop') o = fit('dungeon/trunk_large_A', 0.85);
  else if (kind === 'challenge') { o = fit('prop_skel_shield', 1.1); if (o) o.rotation.x = 0.6; }
  if (!o) {
    // Hồn Thép (hoặc thiếu model): quả cầu năng lượng
    o = new THREE.Group();
    o.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), 0.4).multiplyScalar(1.6) })));
    o.add(glowSprite(color, 1.4));
    o.position.y = 0.4;
  }
  g.add(o);
  return g;
}
