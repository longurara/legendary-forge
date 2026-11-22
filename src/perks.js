// ---------- Thẻ năng lực chọn khi lên cấp (trong một lượt chơi) ----------
// apply(stats, lv): lv là cấp sau khi chọn (1, 2, 3...)
export const PERKS = [
  { id: 'dmg', name: 'Sức Mạnh', icon: 'p_dmg', max: 5, desc: (lv) => `+15% sát thương (tổng +${lv * 15}%)`, apply: (s) => { s.dmg += 0.15; } },
  { id: 'hp', name: 'Thân Thép', icon: 'p_hp', max: 5, desc: () => '+20 máu tối đa và hồi 20 máu', apply: (s, lv, p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: 'atk', name: 'Cuồng Nộ', icon: 'p_atk', max: 4, desc: (lv) => `+15% tốc độ đánh (tổng +${lv * 15}%)`, apply: (s) => { s.atk += 0.15; } },
  { id: 'move', name: 'Bước Gió', icon: 'p_move', max: 3, desc: () => '+10% tốc chạy, lướt hồi nhanh hơn 20%', apply: (s) => { s.move += 0.1; s.dashCd *= 0.8; } },
  { id: 'crit', name: 'Chí Mạng', icon: 'p_crit', max: 4, desc: (lv) => `${lv * 10}% cơ hội gây sát thương gấp đôi`, apply: (s) => { s.crit += 0.1; } },
  { id: 'vamp', name: 'Hút Hồn', icon: 'p_vamp', max: 3, desc: (lv) => `Hồi ${lv * 2} máu mỗi khi hạ quái`, apply: (s) => { s.killHeal += 2; } },
  { id: 'range', name: 'Tầm Xa', icon: 'p_range', max: 3, desc: () => '+15% tầm đánh cận chiến và tốc độ cầu phép', apply: (s) => { s.range += 0.15; } },
  { id: 'regen', name: 'Hồi Phục', icon: 'p_regen', max: 3, desc: (lv) => `Hồi ${lv} máu mỗi 2 giây`, apply: (s) => { s.regen += 1; } },
  { id: 'luck', name: 'May Mắn', icon: 'p_luck', max: 3, desc: () => 'Quái rơi vũ khí, bình máu nhiều hơn và đồ hiếm hơn', apply: (s) => { s.luck += 0.35; } },
  { id: 'magnet', name: 'Nam Châm', icon: 'p_magnet', max: 2, desc: () => 'Hút Hồn Thép và bình máu từ xa hơn', apply: (s) => { s.magnet += 2.5; } },
  { id: 'fireburst', name: 'Lửa Lan', icon: 'p_fireburst', max: 1, desc: () => 'Quái chết khi đang cháy sẽ nổ, đốt quái xung quanh', apply: (s) => { s.fireBurst = true; } },
  { id: 'dashstrike', name: 'Lướt Chém', icon: 'p_dashstrike', max: 1, desc: () => 'Lướt xuyên qua quái gây 20 sát thương', apply: (s) => { s.dashStrike = 20; } },
  { id: 'chain', name: 'Sấm Truyền', icon: 'p_chain', max: 1, desc: () => '20% đòn đánh phóng sét sang 2 quái gần đó', apply: (s) => { s.chainChance = 0.2; } },
];

export function baseStats() {
  return {
    dmg: 1, atk: 1, move: 1, dashCd: 1, crit: 0.05, killHeal: 0, range: 1, regen: 0, luck: 0, magnet: 0,
    fireBurst: false, dashStrike: 0, chainChance: 0,
    // từ phụ tố vũ khí, nhân vật, di vật
    leech: 0, swordWave: false, execute: 0, rageGain: 1, ultPower: 1, bounce: 0, dashCharges: 1,
    parryCd: 1, parryHeal: 0, critMult: 2,
    // từ thẻ tiến hóa
    storm: false, revive: 0, phantom: false, titan: false, hoard: false,
  };
}

// ---------- Thẻ tiến hóa: xuất hiện khi 2 thẻ cần thiết đều đạt cấp tối đa ----------
export const EVOLUTIONS = [
  { id: 'e_storm', name: 'Bão Kiếm', icon: 'x_energy-sword', need: ['crit', 'atk'], max: 1, evo: true,
    desc: () => 'Mỗi đòn chí mạng bắn ra sóng kiếm xuyên quái', apply: (s) => { s.storm = true; } },
  { id: 'e_undying', name: 'Bất Tử', icon: 'x_heart-wings', need: ['vamp', 'regen'], max: 1, evo: true,
    desc: () => 'Hồi sinh 1 lần với 50% máu khi gục ngã', apply: (s) => { s.revive = 1; } },
  { id: 'e_phantom', name: 'Bóng Ma', icon: 'x_ghost2', need: ['move', 'dashstrike'], max: 1, evo: true,
    desc: () => 'Thêm 1 lần lướt; lướt để lại ảo ảnh phát nổ', apply: (s) => { s.phantom = true; s.dashCharges += 1; } },
  { id: 'e_titan', name: 'Người Khổng Lồ', icon: 'x_mailed-fist', need: ['dmg', 'hp'], max: 1, evo: true,
    desc: () => '+30% sát thương; đòn cuối combo tạo sóng chấn', apply: (s) => { s.dmg += 0.3; s.titan = true; } },
  { id: 'e_hoard', name: 'Vua Kho Báu', icon: 'x_gold', need: ['luck', 'magnet'], max: 1, evo: true,
    desc: () => 'Vàng và Hồn Thép gấp đôi; tinh anh rơi rương di vật', apply: (s) => { s.hoard = true; } },
];

// Chọn ngẫu nhiên n thẻ chưa đạt cấp tối đa
export function rollPerks(levels, n = 3) {
  const maxed = (id) => { const p = PERKS.find((x) => x.id === id); return p && (levels[id] || 0) >= p.max; };
  // Thẻ tiến hóa đủ điều kiện luôn được ưu tiên hiện ra
  const evos = EVOLUTIONS.filter((e) => !levels[e.id] && e.need.every(maxed));
  const out = evos.slice(0, Math.min(evos.length, n - 1));
  const pool = PERKS.filter((p) => (levels[p.id] || 0) < p.max);
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

// Lên cấp chậm dần ở cấp cao (tầng 3 khoảng cấp 10–12)
export function xpForLevel(level) { return Math.round(8 + level * 7 + Math.pow(level, 1.7)); }

// ---------- Lò Rèn: nâng cấp vĩnh viễn bằng Hồn Thép (lưu giữa các lượt chơi) ----------
export const META = [
  { id: 'hp', name: 'Giáp Rèn', icon: 'p_hp', max: 5, cost: (lv) => 15 + lv * 15, desc: (lv) => `Bắt đầu với +${lv * 10} máu tối đa` },
  { id: 'dmg', name: 'Lưỡi Tôi Luyện', icon: 'p_dmg', max: 5, cost: (lv) => 20 + lv * 20, desc: (lv) => `+${lv * 6}% sát thương vĩnh viễn` },
  { id: 'regen', name: 'Bánh Mì Thợ Rèn', icon: 'potion', max: 3, cost: (lv) => 25 + lv * 25, desc: (lv) => `Hồi thêm ${lv * 6} máu sau mỗi đợt` },
  { id: 'start', name: 'Vũ Khí Gia Truyền', icon: 'anvil', max: 2, cost: (lv) => (lv === 0 ? 60 : 160), desc: (lv) => ['Bắt đầu với vũ khí Thường', 'Bắt đầu với vũ khí Hiếm có nguyên tố', 'Bắt đầu với vũ khí Hiếm có nguyên tố + 1 phụ tố'][lv] },
  { id: 'cards', name: 'Trí Tuệ Thợ Cả', icon: 'level', max: 1, cost: () => 120, desc: (lv) => (lv ? 'Lên cấp được chọn trong 4 thẻ' : 'Lên cấp chỉ chọn trong 3 thẻ') },
  { id: 'souls', name: 'Bình Linh Hồn', icon: 'soul', max: 3, cost: (lv) => 40 + lv * 40, desc: (lv) => `+${lv * 20}% Hồn Thép nhặt được` },
];

const KEY = 'lorenh_meta';
export function loadMeta() {
  const base = () => ({ souls: 0, up: {}, stats: {}, ach: {}, codex: {}, relicsSeen: {}, daily: {}, char: 'knight', curses: [] });
  try {
    const m = { ...base(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    for (const k of ['stats', 'ach', 'codex', 'relicsSeen', 'daily', 'up']) m[k] = m[k] || {};
    m.curses = m.curses || [];
    return m;
  } catch { return base(); }
}
export function saveMeta(m) { localStorage.setItem(KEY, JSON.stringify(m)); }
