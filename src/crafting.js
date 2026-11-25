// Quặng theo Vùng Đất, Đơn Hàng Rèn & Chế Tạo Khởi Đầu tại Làng Thợ Rèn
import { ELEMENTS, TYPES, RARITY, makeWeapon, rollAffixes, weaponName } from './weapons.js';

export const ORES = [
  { id: 'iron', name: 'Quặng Thiết Cổ', biome: 'stone', floorHint: 'Tầng 1 · Hầm Đá', color: '#c8d0dc', hex: 0xc8d0dc, icon: 'x_sword-stone', element: 'none' },
  { id: 'frost', name: 'Băng Tinh', biome: 'ice', floorHint: 'Tầng 2 · Hang Băng', color: '#7fdcff', hex: 0x7fdcff, icon: 'x_snowflake2', element: 'ice' },
  { id: 'magma', name: 'Than Hắc Nham', biome: 'lava', floorHint: 'Tầng 3 · Lò Nham', color: '#ff7a3a', hex: 0xff7a3a, icon: 'x_flame-tunnel', element: 'fire' },
  { id: 'bone', name: 'Cốt Thạch', biome: 'crypt', floorHint: 'Tầng 4 · Hầm Mộ', color: '#8fe89a', hex: 0x8fe89a, icon: 'x_skull-signet', element: 'blood' },
  { id: 'venom', name: 'Ngọc Độc Lầy', biome: 'swamp', floorHint: 'Tầng 5 · Đầm Lầy', color: '#9fe83a', hex: 0x9fe83a, icon: 'x_poison-gas', element: 'poison' },
  { id: 'thunder', name: 'Lôi Tinh Thạch', biome: 'sanctum', floorHint: 'Tầng 6+ & Boss', color: '#ffe14a', hex: 0xffe14a, icon: 'x_lightning-storm', element: 'lightning' },
];

export const ORE_BY_ID = Object.fromEntries(ORES.map((o) => [o.id, o]));

export function oreForBiome(biomeId) {
  return ORES.find((o) => o.biome === biomeId) || ORES[0];
}

export function addOre(meta, oreId, amount = 1) {
  if (!meta || !ORE_BY_ID[oreId] || amount <= 0) return 0;
  meta.ores = meta.ores || {};
  meta.ores[oreId] = (meta.ores[oreId] || 0) + amount;
  return meta.ores[oreId];
}

export function hasOres(meta, cost = {}) {
  const bag = meta?.ores || {};
  return Object.entries(cost).every(([id, n]) => (bag[id] || 0) >= n);
}

export function spendOres(meta, cost = {}) {
  if (!hasOres(meta, cost)) return false;
  meta.ores = meta.ores || {};
  for (const [id, n] of Object.entries(cost)) {
    meta.ores[id] = Math.max(0, (meta.ores[id] || 0) - n);
  }
  return true;
}

export function formatOreCost(cost = {}, meta = null) {
  return Object.entries(cost).map(([id, n]) => {
    const o = ORE_BY_ID[id];
    const have = meta?.ores?.[id] ?? null;
    const ok = have === null || have >= n;
    return `<span class="ore-cost-pill${ok ? '' : ' lack'}" style="--oc:${o?.color || '#fff'}"><i class="ico" style="--i:url('/ui/icons/${o?.icon || 'x_sword-stone'}.svg')"></i>${n} ${o?.name || id}${have !== null ? ` <small>(${have})</small>` : ''}</span>`;
  }).join(' ');
}

// ---------- Bùa Chuẩn Bị (rèn từ Quặng, dùng cho lượt xuống hầm kế tiếp) ----------
export const HUB_BUFFS = [
  { id: 'iron_aegis', name: 'Giáp Tôi Thép', icon: 'x_shield', color: '#c8d0dc', cost: { iron: 2 }, desc: 'Bắt đầu lượt kế với +35 Khiên ảo ngay từ Đợt 1.' },
  { id: 'frost_stride', name: 'Tinh Chất Băng Hàn', icon: 'x_boots', color: '#7fdcff', cost: { frost: 2 }, desc: 'Giảm 15% thời gian hồi chiêu Lướt suốt cả lượt kế.' },
  { id: 'magma_heart', name: 'Hỏa Tâm Bất Diệt', icon: 'x_fire-zone', color: '#ff7a3a', cost: { magma: 2 }, desc: 'Bắt đầu với 100 Ánh Lửa · Vùng Nóng Đỏ tăng thêm +15% sát thương.' },
  { id: 'ancient_relic', name: 'Hồn Khí Cổ Đại', icon: 'x_locked-chest', color: '#c77dff', cost: { bone: 2 }, desc: 'Khởi đầu lượt kế kèm ngay 1 Di Vật ngẫu nhiên.' },
];

export const buffById = (id) => HUB_BUFFS.find((b) => b.id === id) || null;

// ---------- Rèn Vũ Khí Khởi Đầu bằng Quặng ----------
export const CRAFT_ELEM_COST = {
  none: { iron: 2 },
  ice: { frost: 2 },
  fire: { magma: 2 },
  blood: { bone: 2 },
  poison: { venom: 2 },
  lightning: { thunder: 2 },
  wind: { iron: 1, frost: 1 },
  holy: { iron: 1, bone: 1 },
};

export function canDualCraft(meta) {
  const doneCount = meta?.orders?.done?.length || 0;
  const distinctOres = Object.values(meta?.ores || {}).filter((v) => v > 0).length;
  return doneCount >= 2 || distinctOres >= 2;
}

export function craftCostFor(el1 = 'none', el2 = null) {
  const c1 = CRAFT_ELEM_COST[el1] || CRAFT_ELEM_COST.none;
  const out = { ...c1 };
  if (el2 && el2 !== 'none' && el2 !== el1) {
    const c2 = CRAFT_ELEM_COST[el2] || {};
    for (const [k, v] of Object.entries(c2)) out[k] = (out[k] || 0) + v;
    out.iron = (out.iron || 0) + 1;
  }
  return out;
}

export function buildCraftPreview(weaponType = 'sword', el1 = 'none', el2 = null) {
  const safeType = TYPES[weaponType] ? weaponType : 'sword';
  const clean1 = ELEMENTS[el1] ? el1 : 'none';
  const clean2 = el2 && el2 !== 'none' && el2 !== clean1 && ELEMENTS[el2] ? el2 : null;
  const rarity = clean2 ? 2 : 1;
  const w = makeWeapon(safeType, clean1, rarity, clean2, []);
  w.plus = 1;
  w.crafted = true;
  return w;
}

export function craftStarterWeapon(meta, weaponType = 'sword', el1 = 'none', el2 = null) {
  const clean2 = el2 && el2 !== 'none' && el2 !== el1 ? el2 : null;
  if (clean2 && !canDualCraft(meta)) return { ok: false, reason: 'locked' };
  const cost = craftCostFor(el1, clean2);
  if (!spendOres(meta, cost)) return { ok: false, reason: 'ore', cost };
  const rarity = clean2 ? 2 : 1;
  const w = makeWeapon(TYPES[weaponType] ? weaponType : 'sword', ELEMENTS[el1] ? el1 : 'none', rarity, clean2, rollAffixes(1));
  w.plus = 1;
  w.crafted = true;
  meta.craftedWeapon = w;
  return { ok: true, weapon: w, name: weaponName(w), cost };
}

// ---------- Đơn Hàng Rèn của Thợ Cả Hàn ----------
export const FORGE_ORDERS = [
  { id: 'ord_mine1', kind: 'field', metric: 'mine', goal: 2, title: 'Khởi Động Lò Than', who: 'Thợ Cả Hàn', desc: 'Đập vỡ 2 Mỏ Quặng trong hầm ngục (đánh hoặc bấm E).', reward: { souls: 30, ores: { iron: 1 } } },
  { id: 'ord_del_iron', kind: 'deliver', cost: { iron: 3 }, title: 'Lô Thiết Đầu Tiên', who: 'Thợ Cả Hàn', desc: 'Giao 3 Quặng Thiết Cổ để đúc lại giá búa làng.', reward: { souls: 40 } },
  { id: 'ord_react1', kind: 'field', metric: 'react', goal: 8, title: 'Thử Nghiệm Nguyên Tố', who: 'Học Giả Làng', desc: 'Kích hoạt 8 Phản Ứng Nguyên Tố trong chiến đấu.', reward: { souls: 35, ores: { frost: 1 } } },
  { id: 'ord_forge1', kind: 'field', metric: 'forge', goal: 1, title: 'Rèn Tại Đe Hầm', who: 'Thợ Cả Hàn', desc: 'Rèn ghép hoặc rèn khuôn 1 vũ khí tại Đe Rèn.', reward: { souls: 45, ores: { iron: 2 } } },
  { id: 'ord_elite1', kind: 'field', metric: 'elite', goal: 4, title: 'Săn Tinh Anh', who: 'Lữ Khách', desc: 'Hạ gục 4 quái Tinh Anh dưới hầm ngục.', reward: { souls: 45, ores: { magma: 1 } } },
  { id: 'ord_del_frost', kind: 'deliver', cost: { frost: 3, iron: 1 }, title: 'Lưỡi Hàn Băng', who: 'Thợ Cả Hàn', desc: 'Giao 3 Băng Tinh + 1 Quặng Thiết Cổ từ Hang Băng.', reward: { souls: 65 } },
  { id: 'ord_temper1', kind: 'field', metric: 'temper', goal: 2, title: 'Nghệ Nhân Tôi Lửa', who: 'Thợ Cả Hàn', desc: 'Thực hiện 2 lần Tôi Quá Tải hoặc Cường Hóa vũ khí ở Đe.', reward: { souls: 55, ores: { magma: 2 } } },
  { id: 'ord_del_magma', kind: 'deliver', cost: { magma: 3, iron: 2 }, title: 'Nhóm Lửa Vĩnh Cửu', who: 'Thợ Cả Hàn', desc: 'Giao 3 Than Hắc Nham + 2 Quặng Thiết Cổ từ Lò Nham.', reward: { souls: 85 } },
  { id: 'ord_boss1', kind: 'field', metric: 'boss', goal: 2, title: 'Thử Thách Quái Vương', who: 'Lữ Khách', desc: 'Hạ gục 2 Boss tầng trong các lượt xuống hầm.', reward: { souls: 95, ores: { bone: 2 } } },
  { id: 'ord_del_bone', kind: 'deliver', cost: { bone: 3, frost: 2 }, title: 'Cốt Thép Hắc Ám', who: 'Học Giả Làng', desc: 'Giao 3 Cốt Thạch + 2 Băng Tinh từ Hầm Mộ.', reward: { souls: 110 } },
  { id: 'ord_del_venom', kind: 'deliver', cost: { venom: 3, magma: 2 }, title: 'Độc Dược Tôi Thép', who: 'Thợ Cả Hàn', desc: 'Giao 3 Ngọc Độc Lầy + 2 Than Hắc Nham.', reward: { souls: 130 } },
  { id: 'ord_mine_adv', kind: 'field', metric: 'mine', goal: 8, title: 'Mỏ Sâu Bất Tận', who: 'Thương Nhân', desc: 'Khai thác tổng cộng 8 Mỏ Quặng trong các chuyến đi.', reward: { souls: 90, ores: { thunder: 2 } } },
];

function makeProceduralOrder(meta, seq) {
  const maxFloor = meta?.stats?.maxFloor || 1;
  const roll = seq % 5;
  if (roll === 0) {
    const goal = 3 + Math.min(4, Math.floor(seq / 6));
    return {
      id: `proc_${seq}`, kind: 'field', metric: 'mine', goal, prog: 0,
      title: `Khai Thác Quặng #${seq}`, who: 'Thương Nhân',
      desc: `Đập vỡ ${goal} Mỏ Quặng trong hầm ngục.`,
      reward: { souls: 35 + goal * 6, ores: { iron: 1 } },
    };
  }
  if (roll === 1) {
    const maxIdx = Math.min(ORES.length - 1, maxFloor);
    const ore = ORES[Math.min(maxIdx, (seq + 1) % (maxIdx + 1))];
    return {
      id: `proc_${seq}`, kind: 'deliver', cost: { [ore.id]: 3, iron: 1 },
      title: `Thu Mua ${ore.name} #${seq}`, who: 'Thợ Cả Hàn',
      desc: `Giao 3 ${ore.name} và 1 Quặng Thiết Cổ cho xưởng rèn.`,
      reward: { souls: 55 + ORES.indexOf(ore) * 18 },
    };
  }
  if (roll === 2) {
    const goal = 10 + Math.min(10, seq);
    return {
      id: `proc_${seq}`, kind: 'field', metric: 'react', goal, prog: 0,
      title: `Cộng Hưởng Nguyên Tố #${seq}`, who: 'Học Giả Làng',
      desc: `Gây ${goal} Phản Ứng Nguyên Tố dưới hầm.`,
      reward: { souls: 45 + goal * 2, ores: { [ORES[Math.min(maxFloor - 1, 2)].id]: 1 } },
    };
  }
  if (roll === 3) {
    const goal = 4 + Math.min(4, Math.floor(seq / 5));
    return {
      id: `proc_${seq}`, kind: 'field', metric: 'elite', goal, prog: 0,
      title: `Truy Quét Tinh Anh #${seq}`, who: 'Lữ Khách',
      desc: `Hạ ${goal} quái Tinh Anh trong hầm ngục.`,
      reward: { souls: 50 + goal * 7, ores: { [ORES[Math.min(maxFloor, 4)].id]: 1 } },
    };
  }
  return {
    id: `proc_${seq}`, kind: 'field', metric: 'boss', goal: 1 + (maxFloor >= 3 ? 1 : 0), prog: 0,
    title: `Săn Lõi Quái Vương #${seq}`, who: 'Thợ Cả Hàn',
    desc: `Hạ ${maxFloor >= 3 ? 2 : 1} Boss tầng để giữ yên ngôi làng.`,
    reward: { souls: 85 + maxFloor * 12, ores: { thunder: 1 } },
  };
}

export function ensureOrders(meta) {
  if (!meta) return [];
  if (!meta.orders || typeof meta.orders !== 'object') {
    meta.orders = { active: [], done: [], seq: 0 };
  }
  meta.orders.active = Array.isArray(meta.orders.active) ? meta.orders.active : [];
  meta.orders.done = Array.isArray(meta.orders.done) ? meta.orders.done : [];
  meta.orders.seq = Number(meta.orders.seq || 0);

  while (meta.orders.active.length < 3) {
    const used = new Set([...meta.orders.done, ...meta.orders.active.map((o) => o.id)]);
    const nextCurated = FORGE_ORDERS.find((o) => !used.has(o.id));
    if (nextCurated) {
      meta.orders.active.push({ ...nextCurated, prog: 0 });
    } else {
      meta.orders.seq += 1;
      meta.orders.active.push(makeProceduralOrder(meta, meta.orders.seq));
    }
  }
  return meta.orders.active;
}

export function canClaimOrder(order, meta) {
  if (!order || !meta) return false;
  if (order.kind === 'deliver') return hasOres(meta, order.cost);
  return (order.prog || 0) >= (order.goal || 1);
}

export function countReadyOrders(meta) {
  const list = ensureOrders(meta);
  return list.filter((o) => canClaimOrder(o, meta)).length;
}

export function recordOrderProgress(meta, metric, amount = 1) {
  const list = ensureOrders(meta);
  const newlyReady = [];
  for (const o of list) {
    if (o.kind !== 'field' || o.metric !== metric) continue;
    const prev = o.prog || 0;
    if (prev >= o.goal) continue;
    o.prog = Math.min(o.goal, prev + amount);
    if (o.prog >= o.goal) newlyReady.push(o);
  }
  return newlyReady;
}

export function claimOrder(meta, orderId) {
  const list = ensureOrders(meta);
  const idx = list.findIndex((o) => o.id === orderId);
  if (idx < 0) return { ok: false };
  const o = list[idx];
  if (!canClaimOrder(o, meta)) return { ok: false };
  if (o.kind === 'deliver' && !spendOres(meta, o.cost)) return { ok: false };

  const rw = o.reward || {};
  const souls = rw.souls || 0;
  if (souls) meta.souls = (meta.souls || 0) + souls;
  const bonusOres = {};
  if (rw.ores) {
    for (const [k, v] of Object.entries(rw.ores)) {
      addOre(meta, k, v);
      bonusOres[k] = v;
    }
  }
  list.splice(idx, 1);
  if (!meta.orders.done.includes(o.id)) meta.orders.done.push(o.id);
  ensureOrders(meta);
  return { ok: true, order: o, souls, ores: bonusOres };
}
