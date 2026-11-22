import * as THREE from 'three';
import { models, fitModel } from './models.js';

// ---------- Nguyên tố ----------
export const ELEMENTS = {
  none: { name: '', icon: '', color: 0xd8dde6, glow: 0xfff1c4 },
  fire: { name: 'Lửa', icon: '🔥', color: 0xff6a2a, glow: 0xffa040 },
  ice: { name: 'Băng', icon: '❄️', color: 0x7fdcff, glow: 0xaeeaff },
  lightning: { name: 'Sét', icon: '⚡', color: 0xffe14a, glow: 0xfff07a },
  blood: { name: 'Huyết', icon: '🩸', color: 0xd8203a, glow: 0xff4a5a },
  poison: { name: 'Độc', icon: '☠', color: 0x6fd83a, glow: 0x9fff5a },
  wind: { name: 'Gió', icon: '🌀', color: 0x9fe8d0, glow: 0xd8fff0 },
  holy: { name: 'Thánh', icon: '✦', color: 0xffe8a0, glow: 0xfff6d0 },
};
export const ELEMENT_KEYS = ['fire', 'ice', 'lightning', 'blood', 'poison', 'wind', 'holy'];

// ---------- Độ hiếm ----------
export const RARITY = [
  { name: 'Thường', css: '#c9c9c9', mul: 1.0, glow: 0.1 },
  { name: 'Hiếm', css: '#5aa8ff', mul: 1.3, glow: 0.35 },
  { name: 'Sử thi', css: '#c77dff', mul: 1.7, glow: 0.7 },
  { name: 'Huyền thoại', css: '#ffcf4a', mul: 2.3, glow: 1.2 },  // chỉ có từ đe rèn
];

// ---------- Loại vũ khí ----------
// from/to: góc quay của vũ khí khi vung. thrust: đâm thẳng.
const TAU = Math.PI * 2;
// anim: tên animation của hiệp sĩ cho đòn đó; idle: tư thế đứng khi cầm loại này
export const TYPES = {
  sword: {
    name: 'Kiếm', rest: 1.15, idle: 'Idle', shield: true,
    combo: [
      { anim: '1H_Melee_Attack_Slice_Diagonal', arc: 2.3, range: 2.6, dmg: 10, kb: 7, dur: 0.28, lunge: 3.5, from: 1.15, to: -1.15, shake: 0.18, stop: 0.05 },
      { anim: '1H_Melee_Attack_Slice_Horizontal', arc: 2.3, range: 2.6, dmg: 12, kb: 7, dur: 0.28, lunge: 3.5, from: -1.15, to: 1.15, shake: 0.2, stop: 0.05 },
      { anim: '2H_Melee_Attack_Spin', arc: TAU, range: 3.1, dmg: 22, kb: 14, dur: 0.4, lunge: 5, from: 1.15, to: 1.15 - TAU, shake: 0.45, stop: 0.1, big: true },
    ],
  },
  axe: {
    name: 'Rìu', rest: 1.3, idle: '2H_Melee_Idle',
    combo: [
      { anim: '2H_Melee_Attack_Spin', arc: TAU, range: 3.2, dmg: 12, kb: 9, dur: 0.4, lunge: 1, from: 1.3, to: 1.3 - TAU, shake: 0.22, stop: 0.05 },
      { anim: '2H_Melee_Attack_Spin', arc: TAU, range: 3.4, dmg: 16, kb: 12, dur: 0.42, lunge: 1.5, from: 1.3 - TAU, to: 1.3, shake: 0.3, stop: 0.07, big: true },
    ],
  },
  greatsword: {
    name: 'Đại Kiếm', rest: 0.6, idle: '2H_Melee_Idle',
    combo: [
      { anim: '2H_Melee_Attack_Slice', arc: 2.6, range: 3.4, dmg: 15, kb: 10, dur: 0.38, lunge: 3, from: 1.3, to: -1.3, shake: 0.25, stop: 0.06 },
      { anim: '2H_Melee_Attack_Chop', arc: 1.1, range: 3.8, dmg: 20, kb: 12, dur: 0.4, lunge: 4, from: 0.55, to: -0.55, shake: 0.3, stop: 0.07 },
      { anim: '2H_Melee_Attack_Stab', arc: 0.6, range: 4.8, dmg: 28, kb: 18, dur: 0.4, lunge: 9, thrust: true, shake: 0.45, stop: 0.1, big: true },
    ],
  },
  staff: {
    name: 'Trượng', rest: 0.5, idle: 'Idle', ranged: true, anim: 'Spellcast_Shoot',
    shot: { dmg: 9, cooldown: 0.3, speed: 17, splash: 1.4 },
  },
  // Song Dao: đánh rất nhanh, sát thương thấp mỗi nhát, đòn cuối đâm chí mạng cao
  daggers: {
    name: 'Song Dao', rest: 1.0, idle: 'Idle', dual: true,
    combo: [
      { anim: 'Dualwield_Melee_Attack_Slice', arc: 2.2, range: 2.3, dmg: 6, kb: 4, dur: 0.17, lunge: 3, from: 1.0, to: -1.0, shake: 0.1, stop: 0.03 },
      { anim: 'Dualwield_Melee_Attack_Chop', arc: 2.0, range: 2.3, dmg: 7, kb: 4, dur: 0.17, lunge: 3, from: -1.0, to: 1.0, shake: 0.1, stop: 0.03 },
      { anim: 'Dualwield_Melee_Attack_Slice', arc: 2.2, range: 2.3, dmg: 6, kb: 4, dur: 0.17, lunge: 3, from: 1.0, to: -1.0, shake: 0.1, stop: 0.03 },
      { anim: 'Dualwield_Melee_Attack_Stab', arc: 0.9, range: 3.0, dmg: 15, kb: 9, dur: 0.28, lunge: 6, thrust: true, shake: 0.25, stop: 0.06, big: true },
    ],
  },
  // Nỏ: bắn chậm, tên xuyên qua quái
  crossbow: {
    name: 'Nỏ', rest: 0.5, idle: '2H_Ranged_Aiming', ranged: true, anim: '2H_Ranged_Shoot', bolt: true,
    shot: { dmg: 17, cooldown: 0.55, speed: 30, splash: 0, pierce: 2 },
  },
};
// Model dùng cho từng loại vũ khí
export const modelFor = (type) => ({ daggers: 'weapon_dagger', crossbow: 'prop_skel_crossbow' }[type] || 'weapon_' + type);
const TYPE_KEYS = Object.keys(TYPES);

// ---------- Phụ tố vũ khí ----------
export const AFFIXES = [
  { id: 'atk', name: '+20% tốc đánh', apply: (s) => { s.atk += 0.2; } },
  { id: 'dmg', name: '+25% sát thương', apply: (s) => { s.dmg += 0.25; } },
  { id: 'crit', name: '+12% chí mạng', apply: (s) => { s.crit += 0.12; } },
  { id: 'range', name: '+25% tầm đánh', apply: (s) => { s.range += 0.25; } },
  { id: 'leech', name: 'Hút máu 3% sát thương', apply: (s) => { s.leech += 0.03; } },
  { id: 'wave', name: 'Đòn cuối combo bắn sóng kiếm', apply: (s) => { s.swordWave = true; } },
  { id: 'execute', name: 'Kết liễu quái dưới 15% máu', apply: (s) => { s.execute = 0.15; } },
  { id: 'rage', name: '+30% tích Nộ', apply: (s) => { s.rageGain += 0.3; } },
];
export const affixById = (id) => AFFIXES.find((a) => a.id === id);

export function rollAffixes(n, exclude = [], r = Math.random) {
  const pool = AFFIXES.filter((a) => !exclude.includes(a.id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
  return out;
}

export function applyAffixes(stats, w) {
  for (const id of w.affixes || []) affixById(id)?.apply(stats);
  if (w.plus) stats.dmg *= 1 + 0.12 * w.plus;          // cường hóa: +12% sát thương mỗi cấp
  for (const g of w.gems || []) GEMS[g]?.apply(stats);
}

// Khóa trong Sổ Rèn: loại + các nguyên tố (không phân biệt thứ tự)
export function codexKey(w) {
  const els = [w.element, w.element2].filter((e) => e && e !== 'none').sort();
  return w.type + ':' + (els.join('+') || 'none');
}

// ---------- Tạo vũ khí ----------
let nextId = 1;
export function makeWeapon(type, element = 'none', rarity = 0, element2 = null, affixes = null) {
  return { id: nextId++, type, element, rarity, element2, affixes: affixes ?? rollAffixes(Math.min(rarity, 3)) };
}

export function weaponName(w) {
  let n = TYPES[w.type].name;
  if (w.element !== 'none') n += ' ' + ELEMENTS[w.element].name;
  if (w.element2) n += '-' + ELEMENTS[w.element2].name;
  if (w.title) n = w.title;
  return (w.rarity === 3 ? '★ ' : '') + n + (w.plus ? ` +${w.plus}` : '');
}

// ---------- Ngọc khảm: rơi từ tinh anh, tự khảm vào ô trống ----------
export const GEMS = {
  ruby: { name: 'Hồng Ngọc', color: '#ff5a6a', text: '+10% sát thương', apply: (s) => { s.dmg += 0.1; } },
  sapphire: { name: 'Lam Ngọc', color: '#5aa8ff', text: '+6% chí mạng', apply: (s) => { s.crit += 0.06; } },
  emerald: { name: 'Lục Ngọc', color: '#6fe38a', text: '+2% hút máu', apply: (s) => { s.leech += 0.02; } },
  topaz: { name: 'Hoàng Ngọc', color: '#ffcf4a', text: '+8% tốc đánh', apply: (s) => { s.atk += 0.08; } },
};
export const socketsOf = (w) => [1, 1, 2, 3][w.rarity] || 1;

// ---------- Công thức rèn đặc biệt: đúng cặp nguyên tố → vũ khí huyền thoại có hiệu ứng riêng ----------
export const RECIPES = [
  { els: ['ice', 'lightning'], title: 'Búa Bão Tuyết', legend: 'blizzard', text: '20% đòn đánh tạo vụ nổ băng đóng băng quái xung quanh' },
  { els: ['blood', 'fire'], title: 'Huyết Hỏa Thần Binh', legend: 'bloodfire', text: 'Hạ quái hồi 3 máu, quái đang cháy chịu thêm 25% sát thương' },
  { els: ['holy', 'lightning'], title: 'Thánh Khí Phán Xét', legend: 'judgement', text: 'Chí mạng gọi thánh lôi giáng xuống mục tiêu' },
  { els: ['poison', 'wind'], title: 'Dịch Hạch Phong Ba', legend: 'plague', text: 'Đòn đánh lây độc sang quái trong 3m' },
];
export function applyRecipe(result, a, b) {
  const els = [...new Set([a.element, a.element2, b.element, b.element2].filter((e) => e && e !== 'none'))].sort();
  const r = RECIPES.find((x) => x.els.length === els.length && x.els.every((e, i) => e === els[i]));
  if (!r) return null;
  result.rarity = 3; result.title = TYPES[result.type].name + ' · ' + r.title; result.legend = r.legend; result.legendText = r.text;
  return r;
}

// Giá trị phân rã (Mảnh Thép) và giá cường hóa
export const scrapValue = (w) => [1, 3, 6, 12][w.rarity] + (w.affixes?.length || 0) + (w.plus || 0) * 2;
export const MAX_PLUS = 5;
export const enhanceCost = (w) => [4, 7, 11, 16, 22][w.plus || 0];
// Điểm so sánh vũ khí (độ hiếm, cường hóa, số phụ tố)
export const weaponScore = (w) => (RARITY[w.rarity]?.mul || 1) * (1 + 0.12 * (w.plus || 0)) * (1 + 0.08 * (w.affixes?.length || 0));

// Icon nguyên tố dạng HTML (SVG game-icons.net tô màu bằng CSS)
export function weaponIcons(w) {
  const one = (e) => (e && e !== 'none' ? `<i class="ico el-${e}"></i>` : '');
  return one(w.element) + one(w.element2);
}

export function randomWeapon(wave, rand = Math.random) {
  const type = TYPE_KEYS[Math.floor(rand() * TYPE_KEYS.length)];
  const element = rand() < 0.2 ? 'none' : ELEMENT_KEYS[Math.floor(rand() * ELEMENT_KEYS.length)];
  const r = rand();
  const epic = Math.min(0.04 + wave * 0.02, 0.25);
  const rare = Math.min(0.25 + wave * 0.04, 0.55);
  const rarity = r < epic ? 2 : r < epic + rare ? 1 : 0;
  return makeWeapon(type, element, rarity, null, rollAffixes(Math.min(rarity, 3), [], rand));
}

// Rèn: giữ loại của vũ khí đang cầm, độ hiếm +1, gộp nguyên tố và phụ tố của cả hai
export function forgeWeapons(a, b, extraAffix = 0) {
  const rarity = Math.min(3, Math.max(a.rarity, b.rarity) + 1);
  const pool = [a.element, a.element2, b.element, b.element2].filter((e) => e && e !== 'none');
  const unique = [...new Set(pool)];
  const element = unique[0] || 'none';
  const element2 = unique[1] || null;
  const cap = Math.min(4, rarity + extraAffix);
  let affixes = [...new Set([...(a.affixes || []), ...(b.affixes || [])])].slice(0, cap);
  if (affixes.length < Math.min(rarity, cap)) affixes = affixes.concat(rollAffixes(Math.min(rarity, cap) - affixes.length, affixes));
  if (extraAffix && affixes.length < cap) affixes = affixes.concat(rollAffixes(1, affixes));
  return makeWeapon(a.type, element, rarity, element2, affixes);
}

// ---------- Model vũ khí (hướng theo +Z, chuôi ở gốc) ----------
export function buildWeaponMesh(w) {
  const el = ELEMENTS[w.element];
  const el2 = w.element2 ? ELEMENTS[w.element2] : el;
  const rar = RARITY[w.rarity];
  const g = new THREE.Group();

  const custom = models[modelFor(w.type)];
  if (custom) {
    const len = { sword: 1.75, axe: 1.9, greatsword: 2.3, staff: 1.9, daggers: 1.0, crossbow: 1.3 }[w.type];
    const m = fitModel(custom, len, 'weapon');
    tintWeapon(m, w);
    g.add(m);
    return g;
  }

  const metal = new THREE.MeshStandardMaterial({
    color: w.element === 'none' ? 0xd8dde6 : el.color, metalness: 0.75, roughness: 0.3,
    emissive: el.glow, emissiveIntensity: w.element === 'none' ? 0.05 + rar.glow * 0.2 : 0.25 + rar.glow * 0.5,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({
    color: w.rarity >= 2 ? 0xffcf4a : 0xb08a3a, metalness: 0.85, roughness: 0.3,
    emissive: w.rarity === 3 ? 0xffaa20 : 0x000000, emissiveIntensity: 0.4,
  });
  const accent = new THREE.MeshStandardMaterial({ color: el2.color, emissive: el2.glow, emissiveIntensity: 0.6 + rar.glow * 0.5 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };

  if (w.type === 'sword') {
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 6), wood, 0, 0, 0.16, Math.PI / 2);
    add(new THREE.BoxGeometry(0.46 + w.rarity * 0.06, 0.08, 0.09), gold, 0, 0, 0.36);
    add(new THREE.BoxGeometry(0.13 + w.rarity * 0.015, 0.045, 1.3), metal, 0, 0, 1.06);
    add(new THREE.ConeGeometry(0.075, 0.18, 4), metal, 0, 0, 1.79, Math.PI / 2, 0, Math.PI / 4);
    if (w.element2 || w.rarity >= 2) add(new THREE.OctahedronGeometry(0.07), accent, 0, 0.0, 0.36);
  } else if (w.type === 'axe') {
    add(new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6), wood, 0, 0, 0.75, Math.PI / 2);
    const blade = add(new THREE.TorusGeometry(0.55, 0.06, 4, 16, 2.0), metal, 0.5, 0, 1.6, Math.PI / 2, 0, 0.4);
    blade.scale.set(1, 1, 0.4);
    add(new THREE.SphereGeometry(0.08, 8, 6), accent, 0, 0, 1.68);
  } else if (w.type === 'greatsword') {
    add(new THREE.CylinderGeometry(0.035, 0.04, 2.2, 6), wood, 0, 0, 0.9, Math.PI / 2);
    add(new THREE.ConeGeometry(0.11, 0.48, 4), metal, 0, 0, 2.2, Math.PI / 2);
    add(new THREE.TorusGeometry(0.07, 0.025, 6, 12), gold, 0, 0, 1.95);
  } else if (w.type === 'staff') {
    add(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), wood, 0, 0, 0.7, Math.PI / 2);
    add(new THREE.TorusGeometry(0.16, 0.03, 6, 16), gold, 0, 0, 1.55);
    add(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshBasicMaterial({ color: w.element === 'none' ? 0xc9b6ff : el.glow }), 0, 0, 1.6);
    if (w.element2) add(new THREE.SphereGeometry(0.07, 8, 6), accent, 0, 0.18, 1.6);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Nhuộm vũ khí theo nguyên tố, phát sáng theo độ hiếm (model KayKit dùng chung 1 texture)
function tintWeapon(m, w) {
  const el = ELEMENTS[w.element];
  const rar = RARITY[w.rarity];
  const glow = w.element2 ? ELEMENTS[w.element2].glow : el.glow;
  m.traverse((o) => {
    if (!o.isMesh || !o.material.emissive) return;
    o.material = o.material.clone();
    if (w.element !== 'none') {
      o.material.color.lerp(new THREE.Color(el.color), 0.3);
      o.material.emissive.setHex(w.element2 ? new THREE.Color(el.glow).lerp(new THREE.Color(glow), 0.5).getHex() : el.glow);
      o.material.emissiveIntensity = 0.3 + rar.glow * 0.35;
    } else if (w.rarity > 0) {
      o.material.emissive.set(rar.css);
      o.material.emissiveIntensity = rar.glow * 0.3;
    }
  });
}

// Vũ khí cầm trên tay hiệp sĩ: gắn vào xương handslot.r đúng như bản gốc KayKit
export function buildHeldWeapon(w) {
  const custom = models[modelFor(w.type)];
  if (!custom) return null;
  const m = custom.scene.clone(true);
  tintWeapon(m, w);
  m.position.set(0, 0.0333, 0);
  m.rotation.set(0, Math.PI, 0);
  m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return m;
}

export function slashColor(w) {
  if (w.rarity === 3) return 0xffc84a;
  return w.element === 'none' ? 0xfff1c4 : ELEMENTS[w.element].glow;
}
