// Phòng sự kiện có lựa chọn + nhiệm vụ trong tầng
// Mỗi lựa chọn: { text, sub, can(g), run(g) } với g là API từ main.js:
// { player, gold, addGold, addSouls, addScrap, grantRelic, levelUp, heal, banner, rand, curseDmg }

export const EVENTS_ROOM = [
  {
    id: 'shrine', title: 'Tượng Thần Máu', icon: 'x_bleed-heart',
    text: 'Một bức tượng đẫm máu thì thầm: "Hiến dâng sinh lực, ta ban cho sức mạnh."',
    choices: [
      { text: 'Hiến 25% máu tối đa', sub: 'Nhận một di vật', can: (g) => g.player.hp > g.player.maxHp * 0.3, run: (g) => { g.player.hp -= Math.round(g.player.maxHp * 0.25); g.grantRelic(); } },
      { text: 'Thề Với Bóng Đêm', sub: '+35 Tha Hóa · nhận di vật + 1 Cổ Ngữ', run: (g) => { g.addCorruption?.(35); g.grantRelic(); g.grantRune?.(); } },
      { text: 'Cầu nguyện', sub: 'Hồi 30% máu · +25 Ánh Lửa', run: (g) => { g.heal(0.3); g.addFlame?.(25); g.banner('Được ban phước', 'Hồi 30% máu · +25 Ánh Lửa'); } },
      { text: 'Bỏ đi', sub: '', run: () => {} },
    ],
  },
  {
    id: 'gambler', title: 'Kẻ Đánh Bạc', icon: 'x_dice',
    text: 'Một gã đội mũ trùm xóc bộ xúc xắc xương: "Chơi một ván chứ, thợ rèn?"',
    choices: [
      { text: 'Cược 30 vàng', sub: '50%: nhận 90 vàng', can: (g) => g.gold() >= 30, run: (g) => { g.addGold(-30); if (g.rand() < 0.5) { g.addGold(90); g.banner('Thắng!', '+90 vàng'); } else g.banner('Thua rồi…', '-30 vàng'); } },
      { text: 'Cược 30% máu', sub: '50%: nhận di vật', can: (g) => g.player.hp > g.player.maxHp * 0.35, run: (g) => { g.player.hp -= Math.round(g.player.maxHp * 0.3); if (g.rand() < 0.5) g.grantRelic(); else g.banner('Thua rồi…', 'Mất 30% máu'); } },
      { text: 'Bỏ đi', sub: '', run: () => {} },
    ],
  },
  {
    id: 'traveler', title: 'Lữ Khách Bị Thương', icon: 'x_hood',
    text: 'Một lữ khách nằm thoi thóp bên vách đá, ôm chặt chiếc túi nặng trĩu.',
    choices: [
      { text: 'Cứu giúp', sub: 'Mất 20 máu · nhận 30 Hồn Thép và 1 thẻ', can: (g) => g.player.hp > 25, run: (g) => { g.player.hp -= 20; g.addSouls(30); g.levelUp(); } },
      { text: 'Cướp túi', sub: '+70 vàng · quái gây thêm 10% sát thương tới hết lượt', run: (g) => { g.addGold(70); g.curseDmg(0.1); g.banner('Kẻ cướp', 'Quái gây thêm 10% sát thương'); } },
      { text: 'Bỏ đi', sub: '', run: () => {} },
    ],
  },
  {
    id: 'well', title: 'Giếng Ước', icon: 'x_crystal-ball',
    text: 'Đáy giếng lấp lánh những đồng xu của bao kẻ đi trước.',
    choices: [
      { text: 'Ném 25 vàng', sub: 'Cường hóa vũ khí đang cầm +1', can: (g) => g.gold() >= 25 && (g.player.weapon.plus || 0) < 5, run: (g) => { g.addGold(-25); g.player.weapon.plus = (g.player.weapon.plus || 0) + 1; g.player.recalc(); g.refresh(); g.banner('Điều ước thành sự thật', 'Vũ khí +1'); } },
      { text: 'Mò đáy giếng', sub: '+12 Mảnh Thép, có thể bị thương', run: (g) => { g.addScrap(12); if (g.rand() < 0.5) { g.player.hp = Math.max(1, g.player.hp - 15); g.banner('Đứt tay!', '-15 máu · +12 Mảnh Thép'); } } },
      { text: 'Bỏ đi', sub: '', run: () => {} },
    ],
  },
  {
    id: 'seer', title: 'Thầy Bói Mù', icon: 'x_wizard',
    text: 'Bà lão chạm vào trán bạn: "Ta thấy kẻ đang chờ ngươi dưới đáy tầng này…"',
    choices: [
      { text: 'Trả 25 vàng', sub: '+20% sát thương lên boss tầng này', can: (g) => g.gold() >= 25, run: (g) => { g.addGold(-25); g.bossBane(); g.banner('Đã thấy điểm yếu', '+20% sát thương lên boss tầng này'); } },
      { text: 'Xin lời khuyên', sub: 'Hồi đầy thể lực, +15 Nộ', run: (g) => { g.player.stamina = 100; g.player.gainRage(15); } },
      { text: 'Bỏ đi', sub: '', run: () => {} },
    ],
  },
  {
    id: 'forge', title: 'Lò Rèn Bỏ Hoang', icon: 'anvil',
    text: 'Lò vẫn còn hơi ấm. Trên đe là một khuôn đúc nứt vỡ.',
    choices: [
      { text: 'Rèn lại vũ khí', sub: 'Thêm 1 phụ tố ngẫu nhiên, mất 15% máu', can: (g) => (g.player.weapon.affixes?.length || 0) < 3, run: (g) => { g.addAffix(); g.player.hp = Math.max(1, g.player.hp - Math.round(g.player.maxHp * 0.15)); } },
      { text: 'Nung Bằng Hắc Hỏa', sub: '+30 Tha Hóa · vũ khí +1 & nhận 1 Cổ Ngữ', can: (g) => (g.player.weapon.plus || 0) < 5, run: (g) => { g.addCorruption?.(30); g.player.weapon.plus = (g.player.weapon.plus || 0) + 1; g.player.recalc(); g.refresh(); g.grantRune?.(); g.banner('Hắc Hỏa Tôi Luyện', 'Vũ khí +1 · +1 Cổ Ngữ'); } },
      { text: 'Nung chảy đồ thừa', sub: '+20 Mảnh Thép · +20 Ánh Lửa', run: (g) => { g.addScrap(20); g.addFlame?.(20); } },
      { text: 'Bỏ đi', sub: '', run: () => {} },
    ],
  },
  {
    id: 'flame_altar', title: 'Đài Lửa Cổ', icon: 'x_fire-bowl',
    text: 'Ngọn lửa xanh leo lét giữa màn sương đen. Có thể dùng để thanh tẩy bóng tối hoặc hấp thu sức mạnh cấm.',
    choices: [
      { text: 'Thanh Tẩy Bóng Đêm', sub: 'Trả 30 vàng · xóa 1 Lời Nguyền & hồi đầy Ánh Lửa', can: (g) => g.gold() >= 30, run: (g) => { g.addGold(-30); g.purgeCurse?.(); g.addFlame?.(60); } },
      { text: 'Dập Tắt Ngọn Lửa', sub: '-45 Ánh Lửa · nhận 2 Cổ Ngữ & +60 vàng', run: (g) => { g.addFlame?.(-45); g.addGold(60); g.grantRune?.(); g.grantRune?.(); g.banner('Bóng Tối Ùa Về', '+60 vàng · +2 Cổ Ngữ'); } },
      { text: 'Sưởi Ấm', sub: '+35 Ánh Lửa · hồi 20% máu', run: (g) => { g.addFlame?.(35); g.heal(0.2); } },
    ],
  },
];

// ---------- Nhiệm vụ trong tầng ----------
export const QUESTS = [
  { id: 'elites', text: 'Hạ 3 tinh anh', goal: 3 },
  { id: 'finish', text: 'Kết liễu 5 quái (phím E)', goal: 5 },
  { id: 'env', text: 'Hất 3 quái xuống vực hoặc đập tường', goal: 3 },
  { id: 'react', text: 'Gây 8 phản ứng nguyên tố', goal: 8 },
  { id: 'nohit', text: 'Dọn 2 đợt không trúng đòn', goal: 2 },
  { id: 'dashkill', text: 'Hạ 4 quái bằng Đâm Lướt', goal: 4 },
];
