// Bản đồ tầng phân nhánh (kiểu Slay the Spire): 4 lớp lựa chọn giữa các đợt, mỗi nút nối tới 1–2 nút lớp sau.
// Bệ phần thưởng sau mỗi đợt chỉ đưa ra các nút nối với nút đã chọn trước đó.
import { REWARDS } from './rewards.js';

const POOL = ['weapon', 'perk', 'souls', 'gold', 'potion', 'relic', 'event', 'challenge', 'treasure', 'shop'];
const WEIGHT = { weapon: 3, perk: 3, souls: 2, gold: 2, potion: 2, relic: 1, event: 2, challenge: 1, treasure: 1, shop: 1 };

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
    const n = L === 0 ? 3 : 2 + (rand() < 0.6 ? 1 : 0);
    const nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ kind: pickKind(rand, nodes.map((x) => x.kind)), next: [] });
    // lớp cuối trước boss: đảm bảo có chỗ hồi máu hoặc mua sắm
    if (L === 3 && !nodes.some((x) => x.kind === 'potion' || x.kind === 'shop')) nodes[0].kind = rand() < 0.5 ? 'potion' : 'shop';
    layers.push(nodes);
  }
  // nối các lớp: mỗi nút nối tới nút "gần" ở lớp sau, đảm bảo nút nào cũng có đường vào
  for (let L = 0; L < 3; L++) {
    const A = layers[L], B = layers[L + 1];
    A.forEach((node, i) => {
      const j = Math.round((i / Math.max(1, A.length - 1)) * (B.length - 1));
      node.next.push(j);
      const k = j + (rand() < 0.5 ? -1 : 1);
      if (k >= 0 && k < B.length && rand() < 0.6) node.next.push(k);
    });
    B.forEach((_, j) => { if (!A.some((n) => n.next.includes(j))) A[Math.min(A.length - 1, j)].next.push(j); });
    A.forEach((n) => { n.next = [...new Set(n.next)].sort(); });
  }
  return { layers, path: [] };
}

// Các nút được phép chọn ở bước `step` (0..3)
export function choicesAt(map, step) {
  if (!map || step < 0 || step > 3) return null;
  const layer = map.layers[step];
  if (step === 0 || map.path[step - 1] == null) return layer.map((_, i) => i);
  return map.layers[step - 1][map.path[step - 1]].next;
}

// Vẽ bản đồ bằng SVG
export function renderMap(map, step) {
  const W = 640, H = 360, lx = (L) => 70 + L * 150, ly = (i, n) => H / 2 + (i - (n - 1) / 2) * 95;
  const allowed = choicesAt(map, step) || [];
  let lines = '', nodes = '';
  map.layers.forEach((layer, L) => {
    layer.forEach((node, i) => {
      for (const j of node.next) {
        const onPath = map.path[L] === i && map.path[L + 1] === j;
        lines += `<line x1="${lx(L)}" y1="${ly(i, layer.length)}" x2="${lx(L + 1)}" y2="${ly(j, map.layers[L + 1].length)}" class="${onPath ? 'on' : ''}"/>`;
      }
    });
  });
  map.layers.forEach((layer, L) => {
    layer.forEach((node, i) => {
      const r = REWARDS[node.kind];
      const cls = map.path[L] === i ? 'done' : L === step && allowed.includes(i) ? 'avail' : L < step ? 'past' : '';
      const col = '#' + r.color.toString(16).padStart(6, '0');
      nodes += `<g class="node ${cls}" transform="translate(${lx(L)},${ly(i, layer.length)})">
        <circle r="26" style="stroke:${col}"/>
        <foreignObject x="-14" y="-14" width="28" height="28"><i xmlns="http://www.w3.org/1999/xhtml" class="ico" style="--i:url('/ui/icons/${r.icon}.svg');color:${col};width:28px;height:28px"></i></foreignObject>
        <text y="44">${r.name}</text></g>`;
    });
  });
  // boss cuối tầng
  const bx = lx(4) - 10;
  lines += map.layers[3].map((_, i) => `<line x1="${lx(3)}" y1="${ly(i, map.layers[3].length)}" x2="${bx}" y2="${H / 2}" class="${map.path[3] === i ? 'on' : ''}"/>`).join('');
  nodes += `<g class="node boss" transform="translate(${bx},${H / 2})"><circle r="32"/><foreignObject x="-17" y="-17" width="34" height="34"><i xmlns="http://www.w3.org/1999/xhtml" class="ico" style="--i:url('/ui/icons/boss.svg');color:#ff6a4a;width:34px;height:34px"></i></foreignObject><text y="50">Boss</text></g>`;
  return `<svg viewBox="0 0 ${W + 60} ${H}" class="floormap">${lines}${nodes}</svg>`;
}
