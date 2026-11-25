// Lưu tự động giữa lượt chơi (Tiếp tục lượt khi F5 / đóng tab) + Bảng xem nhanh Build & Chỉ số trong menu Tạm Dừng
import { charById, diffById } from './content.js';

const RUN_SAVE_KEY = 'lorenh_run_save';

export function saveRunState(snapshot) {
  if (!snapshot || !snapshot.floor || !snapshot.player?.weapons?.length) return false;
  try {
    localStorage.setItem(RUN_SAVE_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), ...snapshot }));
    return true;
  } catch {
    return false;
  }
}

export function loadRunState() {
  try {
    const raw = localStorage.getItem(RUN_SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !(s.floor >= 1) || !Array.isArray(s.player?.weapons) || !s.player.weapons.length) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearRunState() {
  try {
    if (typeof localStorage.removeItem === 'function') localStorage.removeItem(RUN_SAVE_KEY);
    else localStorage.setItem(RUN_SAVE_KEY, '');
  } catch {}
}

export function describeSavedRun(s) {
  if (!s) return '';
  const ch = charById(s.run?.char || 'knight')?.name || 'Hiệp Sĩ';
  const diff = s.run?.difficulty && s.run.difficulty !== 'normal' ? ` · ${diffById(s.run.difficulty).name}` : '';
  const endlessTag = s.run?.endless ? ' · Vô Tận' : s.run?.daily ? ' · Hằng Ngày' : '';
  return `Tầng ${s.floor} · Đợt ${s.wave} · ${ch}${diff}${endlessTag}`;
}

export function renderPauseBuildHtml(player, refs = {}) {
  if (!player || !player.stats) return '';
  const { PERKS = [], EVOLUTIONS = [], BOONS = [], DUOS = [], GODS = [], RELICS = [], activeRelicSets, describeCircuit } = refs;
  const s = player.stats;
  const pct = (v) => Math.round((v || 0) * 100) + '%';
  const statRows = [
    ['Sát thương', '×' + (s.dmg || 1).toFixed(2)],
    ['Tốc đánh', '×' + (s.atk || 1).toFixed(2)],
    ['Chí mạng', `${pct(s.crit)} (×${(s.critMult || 2).toFixed(1)})`],
    ['Tốc chạy', pct(s.move)],
    ['Tầm đánh', pct(s.range)],
    ['Hút máu', pct(s.leech)],
    ['Hồi hạ quái', `+${s.killHeal || 0}`],
    ['Lướt / Hồi', `${s.dashCharges || 1} lần · ×${(s.dashCd || 1).toFixed(2)}`],
  ];

  const god = player.patron && (Array.isArray(GODS) ? GODS.find((g) => g.id === player.patron) : GODS[player.patron]);
  const sets = typeof activeRelicSets === 'function' ? activeRelicSets(player.relics || []) : [];
  const w = player.weapon;
  const circuit = w?.runes?.length && typeof describeCircuit === 'function' ? describeCircuit(w.runes) : '';

  const perkMap = new Map();
  for (const list of [PERKS, EVOLUTIONS, BOONS, DUOS]) {
    for (const item of list) perkMap.set(item.id, item);
  }
  const ownedPerks = Object.entries(player.perkLv || {}).filter(([id, lv]) => lv > 0 && perkMap.has(id));
  const perksHtml = ownedPerks.length
    ? ownedPerks.map(([id, lv]) => {
      const def = perkMap.get(id);
      const label = def ? def.name : id;
      const cls = def?.evo ? ' evo' : def?.duo ? ' duo' : def?.god ? ' god' : '';
      const tip = def?.desc ? (typeof def.desc === 'function' ? def.desc(lv) : def.desc) : '';
      return `<span class="pb-pill${cls}" title="${tip}">${label}${lv > 1 ? ` ×${lv}` : ''}</span>`;
    }).join('')
    : '<span class="muted small">Chưa chọn thẻ năng lực nào</span>';

  const relicsHtml = (player.relics || []).length
    ? (player.relics || []).map((id) => {
      const r = RELICS.find((x) => x.id === id);
      return `<span class="pb-pill pb-relic${r?.cursed ? ' pb-cursed' : ''}" title="${r?.desc || ''}">${r?.name || id}</span>`;
    }).join('')
    : '<span class="muted small">Chưa có di vật</span>';

  const runLine = refs?.runStats
    ? `<div class="pb-line">Hạ gục: <b>${refs.runStats.kills ?? 0}</b> · Kỷ lục: <b>${refs.runStats.best ?? 0}</b> · Hồn Thép: <b>${refs.runStats.souls ?? 0}</b>${refs.runStats.diffName ? ` · Độ khó: <b style="color:${refs.runStats.diffColor || '#ffcf4a'}">${refs.runStats.diffName}</b>` : ''}</div>`
    : '';

  return `
    <div class="pb-stats">${statRows.map(([k, v]) => `<div class="pb-stat"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    ${runLine}
    ${god ? `<div class="pb-line"><b>Thần Hộ Mệnh:</b> <span style="color:${god.color}">${god.name}</span></div>` : ''}
    ${circuit ? `<div class="pb-line"><b>Mạch Cổ Ngữ:</b> <span class="muted">${circuit}</span></div>` : ''}
    ${sets.length ? `<div class="pb-line"><b>Bộ Di Vật:</b> ${sets.map((st) => `<span style="color:${st.color}">${st.name} (${st.count}/3)</span>`).join(' · ')}</div>` : ''}
    <div class="pb-sec">Thẻ &amp; Phước Lành (${ownedPerks.length})</div>
    <div class="pb-pills">${perksHtml}</div>
    <div class="pb-sec">Di Vật (${(player.relics || []).length})</div>
    <div class="pb-pills">${relicsHtml}</div>
  `;
}
