// Thần Hộ Mệnh: mỗi tầng chọn một vị thần; thẻ của thần thay đổi lối chơi (không chỉ cộng chỉ số).
// Có thẻ của 2 thần sẽ mở thẻ Song Thần.
export const GODS = [
  { id: 'fire', name: 'Hỏa Thần', icon: 'x_fire-bowl', color: '#ff8a3a', desc: 'Thiêu đốt: lướt để lại lửa, đòn đánh gây cháy, quái chết phát nổ' },
  { id: 'storm', name: 'Lôi Thần', icon: 'x_lightning-storm', color: '#ffe14a', desc: 'Sấm sét: đòn thứ 3 gọi sét, lướt phóng điện, chí mạng lan sét' },
  { id: 'shadow', name: 'Dạ Thần', icon: 'x_hood', color: '#b89aff', desc: 'Bóng đêm: đánh lén, né hoàn hảo cho chuỗi chí mạng, hạ quái được tàng hình' },
  { id: 'wind', name: 'Phong Thần', icon: 'x_tornado', color: '#a8f0d8', desc: 'Gió lốc: hất văng mạnh, thêm lướt, lốc xoáy quanh người' },
];

export const BOONS = [
  // Hỏa Thần
  { id: 'b_trail', god: 'fire', name: 'Bước Chân Lửa', icon: 'x_flame-tunnel', max: 1, desc: () => 'Lướt để lại vệt lửa đốt quái', apply: (s) => { s.firetrail = true; } },
  { id: 'b_ignite', god: 'fire', name: 'Lưỡi Rực', icon: 'x_fire-zone', max: 1, desc: () => 'Mọi đòn đánh đều gây cháy', apply: (s) => { s.ignite = true; } },
  { id: 'b_killboom', god: 'fire', name: 'Tro Tàn', icon: 'x_explosion', max: 1, desc: () => 'Quái chết phát nổ, đốt quái xung quanh', apply: (s) => { s.killboom = true; } },
  // Lôi Thần
  { id: 'b_third', god: 'storm', name: 'Nhịp Sấm', icon: 'x_lightning-storm', max: 1, desc: () => 'Mỗi đòn trúng thứ 3 gọi sét giáng xuống', apply: (s) => { s.third = true; } },
  { id: 'b_dashshock', god: 'storm', name: 'Lướt Điện', icon: 'x_charged', max: 1, desc: () => 'Lướt phóng điện vào quái xung quanh', apply: (s) => { s.dashshock = true; } },
  { id: 'b_critchain', god: 'storm', name: 'Sét Lan', icon: 'p_chain', max: 1, desc: () => 'Chí mạng lan sét sang 2 quái gần đó', apply: (s) => { s.critchain = true; } },
  // Dạ Thần
  { id: 'b_backstab', god: 'shadow', name: 'Đâm Sau Lưng', icon: 'x_daggers', max: 1, desc: () => 'Đánh từ phía sau gây thêm 60% sát thương', apply: (s) => { s.backstab = true; } },
  { id: 'b_shadowcrit', god: 'shadow', name: 'Chuỗi Bóng', icon: 'x_ghost2', max: 1, desc: () => 'Né hoàn hảo / đỡ đòn: 3 đòn sau chắc chắn chí mạng', apply: (s) => { s.shadowcrit = true; } },
  { id: 'b_killinvis', god: 'shadow', name: 'Tan Vào Bóng', icon: 'x_night', max: 1, desc: () => 'Hạ quái được bất tử 0.6 giây', apply: (s) => { s.killinvis = true; } },
  // Phong Thần
  { id: 'b_gust', god: 'wind', name: 'Cuồng Phong', icon: 'x_tornado', max: 1, desc: () => 'Đòn đánh hất văng mạnh hơn 70% (dễ hất xuống vực, đập tường)', apply: (s) => { s.gust = true; } },
  { id: 'b_dashext', god: 'wind', name: 'Cánh Gió', icon: 'x_winged-leg', max: 1, desc: () => 'Thêm 1 lần lướt, lướt hồi nhanh hơn 30%', apply: (s) => { s.dashCharges += 1; s.dashCd *= 0.7; } },
  { id: 'b_tornado', god: 'wind', name: 'Mắt Bão', icon: 'x_arrows', max: 1, desc: () => 'Mỗi 5 giây một luồng lốc quanh người hất văng quái', apply: (s) => { s.tornado = true; } },
];

// Thẻ Song Thần: cần ít nhất 1 thẻ của mỗi thần
export const DUOS = [
  { id: 'd_plasma', gods: ['fire', 'storm'], name: 'Plasma', icon: 'x_explosion', max: 1, duo: true, desc: () => 'Đánh trúng quái đang cháy: 30% gây nổ Quá Tải', apply: (s) => { s.plasma = true; } },
  { id: 'd_stormcall', gods: ['storm', 'wind'], name: 'Gọi Bão', icon: 'x_lightning-storm', max: 1, duo: true, desc: () => 'Mỗi luồng lốc gọi thêm 3 tia sét', apply: (s) => { s.stormcall = true; s.tornado = true; } },
  { id: 'd_shadowflame', gods: ['shadow', 'fire'], name: 'Hắc Hỏa', icon: 'x_fire-bowl', max: 1, duo: true, desc: () => 'Đánh lén gây cháy dữ dội và thêm 30% sát thương', apply: (s) => { s.shadowflame = true; s.backstab = true; } },
  { id: 'd_phantomstep', gods: ['wind', 'shadow'], name: 'Bước Ảo', icon: 'x_ghost2', max: 1, duo: true, desc: () => 'Sau khi lướt được bất tử thêm 0.4 giây', apply: (s) => { s.phantomstep = true; } },
  { id: 'd_firestorm', gods: ['fire', 'wind'], name: 'Lốc Lửa', icon: 'x_flame-tunnel', max: 1, duo: true, desc: () => 'Luồng lốc để lại vòng lửa; vệt lửa rộng gấp đôi', apply: (s) => { s.firestorm = true; s.tornado = true; } },
  { id: 'd_thunderstep', gods: ['shadow', 'storm'], name: 'Sấm Bóng', icon: 'x_charged', max: 1, duo: true, desc: () => 'Né hoàn hảo gọi sét lên mọi quái trong 6m', apply: (s) => { s.thunderstep = true; } },
];

export const godsOf = (levels) => new Set(BOONS.filter((b) => levels[b.id]).map((b) => b.god));

// Thẻ thần đưa vào lần lên cấp: 1–2 thẻ của thần đang thờ + thẻ Song Thần đủ điều kiện
export function godCards(levels, patron) {
  const owned = godsOf(levels);
  const duos = DUOS.filter((d) => !levels[d.id] && d.gods.every((g) => owned.has(g)));
  const mine = BOONS.filter((b) => b.god === patron && !levels[b.id]);
  const out = [];
  if (duos.length) out.push(duos[Math.floor(Math.random() * duos.length)]);
  while (out.length < 2 && mine.length) out.push(mine.splice(Math.floor(Math.random() * mine.length), 1)[0]);
  return out;
}
