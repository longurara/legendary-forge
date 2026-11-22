// Quái tinh anh: 1–2 thuộc tính ngẫu nhiên, hào quang + nhãn tên, rơi nhiều đồ hơn
import * as THREE from 'three';
import { scheduleBomb } from './combat.js';

export const AFFIX_DEFS = {
  thorns: { name: 'Gai', color: 0xc0c0c0, apply: (e) => { e.thorns = 0.15; } },
  swift: { name: 'Cuồng Phong', color: 0x7fe0ff, apply: (e) => { e.eliteSpeed = 1.5; } },
  giant: { name: 'Khổng Lồ', color: 0xff9a4a, apply: (e) => { e.hp *= 1.6; e.giant = 1.35; e.mass *= 1.5; } },
  regen: { name: 'Tái Sinh', color: 0x6fe38a, apply: (e) => { e.regenPct = 0.03; } },
  explode: { name: 'Nổ Khi Chết', color: 0xff5a3a, apply: (e) => { e.explodeOnDeath = true; } },
  shield: { name: 'Khiên Phép', color: 0x5aa8ff, apply: (e) => { e.wantShield = true; } },
};
const KEYS = Object.keys(AFFIX_DEFS);
const labelLayer = () => document.getElementById('dmg-layer');
const ringGeo = new THREE.RingGeometry(0.85, 1.05, 32);

export function makeElite(e, count = null, r = Math.random) {
  if (e.isBoss) return e;
  if (count == null) count = 1 + (r() < 0.35 ? 1 : 0);
  const pool = [...KEYS];
  const affixes = [];
  while (affixes.length < count && pool.length) affixes.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  e.elite = affixes;
  e.hp = Math.round(e.hp * 2.2);
  e.xp = (e.xp || 1) * 2;
  e.dropChance = Math.min(1, (e.dropChance || 0.1) * 3);
  e.poiseMax = Math.round(e.hp * 0.6);
  for (const a of affixes) AFFIX_DEFS[a].apply(e);
  e.maxHpEff = e.hp;
  e.eliteColor = new THREE.Color(AFFIX_DEFS[affixes[0]].color);
  if (e.giant) e.group.scale.multiplyScalar(e.giant);
  if (e.wantShield) {
    e.shieldHp = Math.round(e.hp * 0.35);
    e.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    e.shieldMesh.position.y = 0.9;
    e.group.add(e.shieldMesh);
  }
  // Hào quang dưới chân
  e.eliteRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: e.eliteColor, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  e.eliteRing.rotation.x = -Math.PI / 2;
  e.scene.add(e.eliteRing);
  // Nhãn tên trên đầu
  e.label = document.createElement('div');
  e.label.className = 'label elite';
  e.label.textContent = affixes.map((a) => AFFIX_DEFS[a].name).join(' · ');
  labelLayer().appendChild(e.label);
  // Nổ khi chết: bọc hàm die
  if (e.explodeOnDeath) {
    const die = e.die.bind(e);
    e.die = () => { if (!e.dead) scheduleBomb(e.pos, 0.8, 2.6, 0, 16); die(); };
  }
  return e;
}

const tmp = new THREE.Vector3();
export function updateEliteLabels(enemies, camera) {
  for (const e of enemies) {
    if (!e.label || e.dead) continue;
    tmp.set(e.pos.x, 2.4 * (e.giant || 1) + (e.height || 0), e.pos.z).project(camera);
    const off = Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1;
    e.label.style.display = off ? 'none' : '';
    e.label.style.left = (tmp.x * 0.5 + 0.5) * innerWidth + 'px';
    e.label.style.top = (-tmp.y * 0.5 + 0.5) * innerHeight + 'px';
  }
}
