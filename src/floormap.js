// Bản đồ tầng tương tác (Cơ chế #7: Mỏ Neo Boss, Lan Truyền Nhiệt Nút & Song Tượng Thần)
import { REWARDS } from './rewards.js';

const POOL = ['weapon', 'perk', 'souls', 'gold', 'potion', 'relic', 'event', 'challenge', 'treasure', 'shop', 'trial'];
const WEIGHT = { weapon: 3, perk: 3, souls: 2, gold: 2, potion: 2, relic: 1, event: 2, challenge: 1, treasure: 1, shop: 1, trial: 1 };

export const ANCHOR_TYPES = {
  aegis: { id: 'aegis', name: 'Đài Khiên Sắt', desc: 'Boss thêm Khiên Phép +35% máu' },
  frenzy: { id: 'frenzy', name: 'Lò Gia Tốc', desc: 'Boss nhanh hơn 22%' },
  horde: { id: 'horde', name: 'Tế Đàn Triệu Hồi', desc: 'Boss triệu hồi gấp đôi quân' },
};
const ANCHOR_KEYS = Object.keys(ANCHOR_TYPES);

function pickKind(rand, avoid) {
  const pool = POOL.filter((k) => !avoid.includes(k));
  const total = pool.reduce((s, k) => s + WEIGHT[k], 0);
  let r = rand() * total;
  for (const k of pool) { r -= WEIGHT[k]; if (r <= 0) return k; }
  return pool[0];
}

export function genFloorMap(rand = Math.random) {
  const layers = [];
  for (let L = 0; L < 4; L++) {
    const n = L === 0 ? 3 : 2 + (rand() < 0.65 ? 1 : 0);
    const nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ kind: pickKind(rand, nodes.map((x) => x.kind)), next: [], boosted: false, cooled: false, anchorType: null, anchorBroken: false });
    // lớp cuối trước boss: đảm bảo có chỗ hồi máu hoặc mua sắm
    if (L === 3 && !nodes.some((x) => x.kind === 'potion' || x.kind === 'shop')) nodes[0].kind = rand() < 0.5 ? 'potion' : 'shop';
    layers.push(nodes);
  }
  // Đảm bảo mỗi tầng có 1–2 Mỏ Neo Boss ở lớp 1 hoặc 2
  const anchorLayers = rand() < 0.45 ? [1, 2] : [rand() < 0.5 ? 1 : 2];
  const usedAnchors = [];
  for (const L of anchorLayers) {
    const idx = Math.floor(rand() * layers[L].length);
    const aPool = ANCHOR_KEYS.filter((k) => !usedAnchors.includes(k));
    const aType = aPool[Math.floor(rand() * aPool.length)] || ANCHOR_KEYS[0];
    usedAnchors.push(aType);
    layers[L][idx].kind = 'anchor';
    layers[L][idx].anchorType = aType;
  }
  // Đảm bảo có ít nhất 1 phòng Song Tượng Thần (Trial of the Gods) trên bản đồ tầng
  if (!layers.some((ly) => ly.some((n) => n.kind === 'trial'))) {
    const tL = rand() < 0.5 ? 1 : 2;
    const cand = layers[tL].find((n) => n.kind !== 'anchor');
    if (cand) cand.kind = 'trial';
  }
  // Nối các lớp: mỗi nút nối tới nút "gần" ở lớp sau, đảm bảo nút nào cũng có đường vào
  for (let L = 0; L < 3; L++) {
    const A = layers[L], B = layers[L + 1];
    A.forEach((node, i) => {
      const j = Math.round((i / Math.max(1, A.length - 1)) * (B.length - 1));
      node.next.push(j);
      const k = j + (rand() < 0.5 ? -1 : 1);
      if (k >= 0 && k < B.length && rand() < 0.65) node.next.push(k);
    });
    B.forEach((_, j) => { if (!A.some((n) => n.next.includes(j))) A[Math.min(A.length - 1, j)].next.push(j); });
    A.forEach((n) => { n.next = [...new Set(n.next)].sort(); });
  }
  return { layers, path: [], brokenAnchors: [] };
}

// Các nút được phép chọn ở bước `step` (0..3)
export function choicesAt(map, step) {
  if (!map || step < 0 || step > 3) return null;
  const layer = map.layers[step];
  if (step === 0 || map.path[step - 1] == null) return layer.map((_, i) => i);
  return map.layers[step - 1][map.path[step - 1]].next;
}

// Lan truyền hiệu ứng sang các nút nối liền ở lớp sau khi người chơi chọn 1 phòng
export function propagateChoice(map, step, idx) {
  if (!map || step < 0 || step > 3) return null;
  const node = map.layers[step]?.[idx];
  if (!node) return null;
  map.path[step] = idx;
  if (node.kind === 'anchor' && node.anchorType) {
    node.anchorBroken = true;
    if (!map.brokenAnchors.includes(node.anchorType)) map.brokenAnchors.push(node.anchorType);
  }
  if (step < 3) {
    const nextLayer = map.layers[step + 1];
    for (const j of node.next) {
      const target = nextLayer[j];
      if (!target) continue;
      if (node.kind === 'challenge' || node.kind === 'anchor' || node.kind === 'trial') {
        target.boosted = true;
        target.cooled = false;
      } else if (node.kind === 'potion' && !target.boosted) {
        target.cooled = true;
      }
    }
  }
  return node;
}

// Danh sách Mỏ Neo mà người chơi BỎ QUA -> Boss hấp thụ chúng!
export function activeBossAnchors(map) {
  if (!map) return [];
  const all = [];
  for (const layer of map.layers) {
    for (const n of layer) {
      if (n.kind === 'anchor' && n.anchorType && !n.anchorBroken) all.push(n.anchorType);
    }
  }
  return [...new Set(all)];
}

// Vẽ bản đồ bằng SVG (có xích đỏ Mỏ Neo Boss và huy hiệu Lan Truyền)
export function renderMap(map, step) {
  const W = 640, H = 370, lx = (L) => 70 + L * 150, ly = (i, n) => H / 2 + (i - (n - 1) / 2) * 96;
  const bx = lx(4) - 10;
  const allowed = choicesAt(map, step) || [];
  let lines = '', chains = '', nodes = '';
  map.layers.forEach((layer, L) => {
    layer.forEach((node, i) => {
      for (const j of node.next) {
        const onPath = map.path[L] === i && map.path[L + 1] === j;
        lines += `<line x1="${lx(L)}" y1="${ly(i, layer.length)}" x2="${lx(L + 1)}" y2="${ly(j, map.layers[L + 1].length)}" class="${onPath ? 'on' : ''}"/>`;
      }
      if (node.kind === 'anchor') {
        chains += `<line x1="${lx(L)}" y1="${ly(i, layer.length)}" x2="${bx}" y2="${H / 2}" class="anchor-chain${node.anchorBroken ? ' broken' : ''}"/>`;
      }
    });
  });
  map.layers.forEach((layer, L) => {
    layer.forEach((node, i) => {
      const r = REWARDS[node.kind] || REWARDS.weapon;
      const cls = (map.path[L] === i ? 'done' : L === step && allowed.includes(i) ? 'avail' : L < step ? 'past' : '')
        + (node.boosted ? ' boosted' : '') + (node.cooled ? ' cooled' : '') + (node.kind === 'anchor' ? ' anchor' : '');
      const col = '#' + r.color.toString(16).padStart(6, '0');
      const sub = node.kind === 'anchor' ? (ANCHOR_TYPES[node.anchorType]?.name || r.name) : r.name;
      const badge = node.boosted ? '<text x="20" y="-18" class="fm-badge up">★</text>' : node.cooled ? '<text x="20" y="-18" class="fm-badge dn">❄</text>' : '';
      nodes += `<g class="node ${cls}" transform="translate(${lx(L)},${ly(i, layer.length)})">
        <circle r="26" style="stroke:${col}"/>
        <foreignObject x="-14" y="-14" width="28" height="28"><i xmlns="http://www.w3.org/1999/xhtml" class="ico" style="--i:url('/ui/icons/${r.icon}.svg');color:${col};width:28px;height:28px"></i></foreignObject>
        ${badge}
        <text y="43">${sub}</text></g>`;
    });
  });
  // boss cuối tầng + trạng thái Mỏ Neo
  const intact = activeBossAnchors(map);
  lines += map.layers[3].map((_, i) => `<line x1="${lx(3)}" y1="${ly(i, map.layers[3].length)}" x2="${bx}" y2="${H / 2}" class="${map.path[3] === i ? 'on' : ''}"/>`).join('');
  nodes += `<g class="node boss${intact.length ? ' empowered' : ''}" transform="translate(${bx},${H / 2})">
    <circle r="32"/>
    <foreignObject x="-17" y="-17" width="34" height="34"><i xmlns="http://www.w3.org/1999/xhtml" class="ico" style="--i:url('/ui/icons/boss.svg');color:#ff6a4a;width:34px;height:34px"></i></foreignObject>
    <text y="48">Boss</text>
    <text y="64" class="fm-sub">${intact.length ? `♦ ${intact.length} Mỏ Neo (+Thưởng ×2)` : '✔ Đã phá Mỏ Neo'}</text></g>`;
  return `<svg viewBox="0 0 ${W + 80} ${H + 10}" class="floormap">${chains}${lines}${nodes}</svg>`;
}
