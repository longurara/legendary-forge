// Dữ liệu nội dung: di vật (30 món + 4 Bộ Set Bonus), 7 nhân vật, 4 thú đồng hành, lời nguyền, 27 thành tựu, biến cố đợt.
// Icon nằm trong public/ui/icons (tên file không có đuôi .svg).

// ---------- 4 Bộ Hiệu Ứng Di Vật (Set Bonuses) ----------
export const RELIC_SETS = {
  forge: {
    id: 'forge', name: 'Bộ Lò Rèn', color: '#ff9a3a', icon: 'anvil',
    b2: 'Tôi Vũ Khí / Phóng Nhiệt phóng thêm sóng lửa 4.5m đốt quái',
    b3: 'Vũ khí không bao giờ mất độ bền và miễn nhiễm Quá Nhiệt!',
  },
  storm: {
    id: 'storm', name: 'Bộ Bão Tố', color: '#7fdcff', icon: 'x_lightning-storm',
    b2: 'Mỗi đòn đánh trúng thứ 5 phóng tia sét lan sang 2 quái',
    b3: '+45% sát thương Phản Ứng Nguyên Tố & Mạch Cổ Ngữ!',
  },
  blood: {
    id: 'blood', name: 'Bộ Huyết Sát', color: '#ff5a6a', icon: 'x_bleed-heart',
    b2: 'Kết Liễu tạo vụ nổ huyết hồi thêm 8% máu tối đa',
    b3: '+50% sát thương chí mạng · Kết Liễu nạp ngay +30% Nộ!',
  },
  void: {
    id: 'void', name: 'Bộ Hư Không', color: '#c77dff', icon: 'x_cursed',
    b2: 'Miễn nhiễm làm chậm & trúng độc từ bẫy mặt sàn',
    b3: 'Chí mạng có 30% gọi Bóng Ma chém bồi gây +60% sát thương!',
  },
};

// ---------- Di vật (30 vật phẩm bị động trong một lượt) ----------
export const RELICS = [
  { id: 'ember', name: 'Nhẫn Than Hồng', icon: 'x_ring', set: 'forge', desc: 'Lướt để lại vệt lửa đốt quái' },
  { id: 'horn', name: 'Sừng Quỷ', icon: 'x_devil', set: 'blood', desc: 'Càng ít máu càng mạnh: tối đa +50% sát thương' },
  { id: 'bell', name: 'Chuông Bạc', icon: 'x_bell', set: 'storm', desc: 'Mỗi đòn trúng thứ 10 gọi sét đánh 40 sát thương' },
  { id: 'boots', name: 'Giày Gió', icon: 'x_boots', set: 'storm', desc: 'Thêm 1 lần lướt' },
  { id: 'frostheart', name: 'Tim Băng', icon: 'x_frozen', set: 'storm', desc: 'Khi bị đánh, đóng băng quái xung quanh (hồi 6 giây)' },
  { id: 'fang', name: 'Nanh Ma Cà Rồng', icon: 'x_vampire', set: 'blood', desc: 'Hồi máu bằng 4% sát thương gây ra' },
  { id: 'orbit', name: 'Quả Cầu Hộ Mệnh', icon: 'x_orbital', desc: '2 quả cầu xoay quanh, gây 12 sát thương khi chạm' },
  { id: 'eagle', name: 'Mắt Đại Bàng', icon: 'x_eagle', desc: '+5% chí mạng, chí mạng gây x2.5 thay vì x2' },
  { id: 'gauntlet', name: 'Găng Thợ Rèn', icon: 'x_gauntlet', set: 'forge', desc: 'Rèn ở đe thêm 1 phụ tố; mỗi đe rèn được 2 lần' },
  { id: 'goldbag', name: 'Túi Vàng', icon: 'x_coins', desc: '+50% vàng nhặt được' },
  { id: 'badge', name: 'Huy Hiệu Can Đảm', icon: 'x_medal', desc: 'Đầu mỗi đợt nhận khiên 25 máu ảo' },
  { id: 'rune', name: 'Cổ Ngữ Nộ', icon: 'x_rune', desc: 'Thanh Nộ tích nhanh hơn 50%' },
  { id: 'quiver', name: 'Ống Tên Xương', icon: 'x_quiver', desc: 'Mỗi 2.5 giây tự bắn tên vào quái gần nhất' },
  { id: 'skull', name: 'Ấn Đầu Lâu', icon: 'x_skull-signet', set: 'blood', desc: 'Hạ tinh anh hồi 15 máu; mỗi quái +1 Hồn Thép' },
  // 12 Di vật mới tương tác với 8 cơ chế nâng cao
  { id: 'bellows', name: 'Ống Bễ Lò Cổ', icon: 'x_fire-bowl', set: 'forge', desc: 'Vùng Nóng Đỏ tăng thêm +20% sát thương & +15% tốc đánh' },
  { id: 'tongs', name: 'Kìm Phá Giáp', icon: 'x_sword-break', set: 'forge', desc: '+55% sát thương vào Bộ Phận Boss & thanh Choáng' },
  { id: 'quencher', name: 'Bể Tôi Thép', icon: 'anvil', set: 'forge', desc: 'Tôi Vũ Khí / Đòn Biến Hình hồi 10 máu & kéo dài Thép Tôi +2 giây' },
  { id: 'capacitor', name: 'Tụ Điện Cổ Ngữ', icon: 'x_charged', set: 'storm', desc: 'Giảm 35% hồi chiêu Mạch Cổ Ngữ trên vũ khí' },
  { id: 'windcharm', name: 'Chuông Gió Phản Phá', icon: 'x_tornado', set: 'storm', desc: 'Né Hoàn Hảo & Phản Xuyên tạo lốc hất văng quái quanh thân' },
  { id: 'icecore', name: 'Nhân Băng Giá', icon: 'x_snowflake2', set: 'storm', desc: 'Đòn nguyên tố Băng chỉ cần 2 hit để đóng băng mục tiêu' },
  { id: 'chalice', name: 'Chén Huyết Lửa', icon: 'x_fire-zone', set: 'blood', desc: 'Ánh Lửa tụt chậm hơn 35%; Kết Liễu hồi +25 Ánh Lửa' },
  { id: 'executioner', name: 'Ấn Đao Phủ', icon: 'x_axe-swing', set: 'blood', desc: 'Ngưỡng Kết Liễu quái thường tăng lên 24% máu' },
  { id: 'voidlens', name: 'Thấu Kính Hư Không', icon: 'x_crystal-ball', set: 'void', desc: 'Mỗi Lời Nguyền Động đang mang tăng +18% sát thương' },
  { id: 'runestone', name: 'Đá Cổ Ngữ Cổ', icon: 'x_scroll', set: 'void', desc: 'Mỗi khi xuống tầng mới tự động nhận 1 Cổ Ngữ ngẫu nhiên' },
  { id: 'petbell', name: 'Chuông Triệu Hồn', icon: 'x_wolf', desc: 'Thú Đồng Hành & Xương Đồng Minh đánh nhanh và mạnh hơn 45%' },
  { id: 'mirror', name: 'Gương Phản Đạn', icon: 'x_shield-reflect', desc: 'Đỡ đòn & Cắt Chiêu hồi ngay 40% hồi chiêu Kỹ năng' },
  // Di vật bị nguyền: rất mạnh nhưng có cái giá
  { id: 'pact', name: 'Khế Ước Máu', icon: 'x_dripping-blade', set: 'void', cursed: true, desc: '+40% sát thương, nhưng mất 1 máu mỗi giây (không chết vì nó)' },
  { id: 'glass', name: 'Tim Thủy Tinh', icon: 'x_broken-heart', set: 'void', cursed: true, desc: '+15% chí mạng, chí mạng x3, nhưng nhận thêm 40% sát thương' },
  { id: 'greed', name: 'Túi Tham Lam', icon: 'x_heart-bottle', cursed: true, desc: 'Gấp đôi vàng và Mảnh Thép, nhưng quái thêm 25% máu' },
  { id: 'fury', name: 'Mặt Nạ Cuồng Nộ', icon: 'x_poison-gas', set: 'void', cursed: true, desc: 'Mỗi 10% máu đã mất: +6% sát thương; bình máu không còn tác dụng' },
];
export const relicById = (id) => RELICS.find((r) => r.id === id);

export function activeRelicSets(relicIds = []) {
  const counts = {};
  for (const id of relicIds) {
    const r = relicById(id);
    if (r?.set) counts[r.set] = (counts[r.set] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .map(([id, n]) => ({ ...RELIC_SETS[id], count: n, tier: n >= 3 ? 3 : 2 }));
}

// ---------- 4 Thú Đồng Hành Lò Rèn (Forge Pets) ----------
export const PETS = [
  { id: 'none', name: 'Không mang', icon: 'x_shield', model: null, unlock: null, desc: 'Chiến đấu một mình không mang thú đồng hành.' },
  { id: 'slime', name: 'Slime Kho Báu', icon: 'x_slime', model: 'slime', unlock: null, color: '#ffcf4a', desc: 'Tự chạy hút Vàng, Mảnh Thép, Hồn Thép quanh phòng và húc làm chậm quái.' },
  { id: 'drake', name: 'Ấu Long Lửa', icon: 'x_dragon', model: 'mon_drake', unlock: 'boss1', color: '#ff7a3a', desc: 'Bay theo bạn khạc cầu lửa mỗi 2.2s, kích hoạt phản ứng Lửa & nổ vũng độc!' },
  { id: 'crab', name: 'Cua Giáp Khiên', icon: 'x_shield-reflect', model: 'mon_crab', unlock: 'floor3', color: '#7fdcff', desc: 'Chắn hộ 1 đòn đánh / viên đạn mỗi 6 giây và hất văng quái áp sát.' },
  { id: 'imp', name: 'Tiểu Quỷ Lò Rèn', icon: 'x_fire-bowl', model: 'mon_imp', unlock: 'legend', color: '#ff9040', desc: 'Tự sửa +2% độ bền vũ khí mỗi 3s, giảm 40% thời gian Quá Nhiệt & phóng tia lửa.' },
];
export const petById = (id) => PETS.find((p) => p.id === id) || PETS[0];

// ---------- 7 Nhân vật chơi được ----------
// gear: các bộ phận vũ khí có sẵn trong model cần ẩn; shield: khiên hiện khi cầm kiếm
export const CHARACTERS = [
  {
    id: 'knight', name: 'Hiệp Sĩ', model: 'player', icon: 'x_shield', weapon: 'sword', hp: 120,
    passive: '+20 máu. Đỡ đòn hồi nhanh hơn 40%, đỡ thành công hồi 5 máu.',
    unlock: null, mods: { parryCd: 0.6, parryHeal: 5 },
    gear: ['1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield'], shield: 'Round_Shield',
  },
  {
    id: 'barbarian', name: 'Man Rợ', model: 'char_barbarian', icon: 'x_horned-helm', weapon: 'axe', hp: 110,
    passive: '+15% sát thương. Nộ tích nhanh hơn 30%.',
    unlock: 'boss1', mods: { dmg: 0.15, rageGain: 0.3 },
    gear: ['1H_Axe_Offhand', '1H_Axe', '2H_Axe', 'Mug'], shield: 'Barbarian_Round_Shield',
  },
  {
    id: 'mage', name: 'Pháp Sư', model: 'char_mage', icon: 'x_wizard', weapon: 'staff', hp: 85,
    passive: 'Cầu phép nảy sang 1 quái khác. Tuyệt kỹ mạnh hơn 30%.',
    unlock: 'legend', mods: { bounce: 1, ultPower: 0.3 },
    gear: ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff'], shield: null,
  },
  {
    id: 'rogue', name: 'Sát Thủ', model: 'char_rogue', icon: 'x_hood', weapon: 'daggers', hp: 95,
    passive: 'Khởi đầu Song Dao · Lướt 2 lần liên tiếp · +15% chí mạng · chạy nhanh +10%.',
    unlock: 'floor3', mods: { dashCharges: 1, crit: 0.15, move: 0.1 },
    gear: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], shield: null,
  },
  {
    id: 'blacksmith', name: 'Thợ Rèn Cổ', model: 'char_barbarian', icon: 'anvil', weapon: 'hammer', hp: 120,
    tint: 0xd89040,
    passive: 'Khởi đầu Chiến Chùy · Vùng Nóng Đỏ mở rộng (40°–92°) · Tự +1 cường hóa mỗi tầng mới & hồi 100% độ bền giữa đợt.',
    unlock: 'kill100', mods: { wideHeat: true, poiseMul: 1.35, smithAutoPlus: true },
    gear: ['1H_Axe_Offhand', '1H_Axe', '2H_Axe', 'Mug'], shield: null,
  },
  {
    id: 'necromancer', name: 'Chiêu Hồn Sư', model: 'char_mage', icon: 'x_skull-signet', weapon: 'scythe', hp: 92,
    tint: 0x3ad870,
    passive: 'Khởi đầu Lưỡi Hái · Hạ quái có 30% hồi sinh Xương Đồng Minh (tối đa 3) tự động chiến đấu hộ.',
    unlock: 'boss1', mods: { necroRaise: true, leech: 0.02 },
    gear: ['Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff'], shield: null,
  },
  {
    id: 'ranger', name: 'Thợ Săn', model: 'char_rogue', icon: 'x_crossbow', weapon: 'crossbow', hp: 95,
    tint: 0x5aa85a,
    passive: 'Khởi đầu Nỏ · Lướt đặt Bẫy Kẹp Thép trói quái & tự bắn bồi 2 mũi tên xuyên giáp.',
    unlock: 'react50', mods: { rangerTrap: true, range: 0.15, crit: 0.08 },
    gear: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], shield: null,
  },
];
export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// ---------- Bậc Hầm Sâu: mỗi bậc cộng dồn một luật khó hơn ----------
export const DEPTHS = [
  { n: 1, text: 'Quái thường +20% máu' },
  { n: 2, text: 'Quái gây thêm 15% sát thương' },
  { n: 3, text: 'Tinh anh xuất hiện từ đợt 1, nhiều gấp đôi' },
  { n: 4, text: 'Tinh anh luôn có ít nhất 2 thuộc tính' },
  { n: 5, text: 'Quái nhanh hơn 10%' },
  { n: 6, text: 'Boss có thêm một giai đoạn' },
  { n: 7, text: 'Không có bình máu rơi' },
  { n: 8, text: 'Đợt nào cũng có biến cố' },
  { n: 9, text: 'Boss thêm 30% máu' },
  { n: 10, text: 'Bóng Tối Lan sớm hơn (40 giây), quái nhanh thêm 10%' },
];
export const CURSES = [
  { id: 'tough', name: 'Quái Trâu', icon: 'x_mailed-fist', desc: 'Quái có thêm 50% máu', bonus: 0.25 },
  { id: 'fast', name: 'Quái Cuồng', icon: 'x_winged-leg', desc: 'Quái nhanh hơn 20%', bonus: 0.2 },
  { id: 'nopot', name: 'Khát Máu', icon: 'x_bleed-heart', desc: 'Không có bình máu, không hồi máu giữa đợt', bonus: 0.3 },
  { id: 'bossrage', name: 'Boss Tàn Bạo', icon: 'x_enrage', desc: 'Boss thêm 50% máu và nổi giận ngay từ đầu', bonus: 0.25 },
  { id: 'fragile', name: 'Mỏng Manh', icon: 'x_sword-break', desc: 'Giảm 30 máu tối đa', bonus: 0.3 },
  { id: 'swarm', name: 'Bầy Đàn', icon: 'x_wolf', desc: 'Thêm 40% quái mỗi đợt', bonus: 0.25 },
];

// ---------- Biến cố của đợt ----------
export const EVENTS = [
  { id: 'bloodmoon', name: 'Trăng Máu', icon: 'x_evil-moon', desc: 'Quái nhanh hơn 25%, đồ rơi gấp đôi', color: '#ff5a4a' },
  { id: 'dark', name: 'Bóng Tối', icon: 'x_night', desc: 'Chỉ thấy được quanh đuốc và quanh bạn', color: '#9fa8ff' },
  { id: 'firerain', name: 'Mưa Lửa', icon: 'x_meteor', desc: 'Lửa rơi ngẫu nhiên, đốt cả bạn lẫn quái', color: '#ff8a3a' },
  { id: 'horde', name: 'Bầy Đàn', icon: 'x_wolf', desc: 'Gấp đôi số quái nhưng mỗi con yếu hơn', color: '#c9b6ff' },
  { id: 'elites', name: 'Đêm Tinh Anh', icon: 'x_skull-signet', desc: 'Mọi quái đều là tinh anh, rơi nhiều đồ', color: '#ffcf4a' },
  { id: 'arena', name: 'Đấu Trường', icon: 'x_trophy', desc: 'Sống sót 30 giây, quái kéo tới liên tục · thưởng lớn', color: '#ffb040' },
];

// ---------- 25 Thành tựu ----------
export const ACHIEVEMENTS = [
  { id: 'kill100', name: 'Diệt Trừ', desc: 'Hạ tổng cộng 100 quái', reward: { souls: 30, unlock: 'blacksmith' }, check: (s) => s.kills >= 100 },
  { id: 'kill500', name: 'Đồ Tể Hầm Ngục', desc: 'Hạ tổng cộng 500 quái', reward: { souls: 90 }, check: (s) => s.kills >= 500 },
  { id: 'slime300', name: 'Vua Diệt Slime', desc: 'Hạ 300 slime', reward: { souls: 60 }, check: (s) => s.slimes >= 300 },
  { id: 'boss1', name: 'Hạ Gục Boss', desc: 'Hạ boss đầu tiên', reward: { unlock: 'barbarian', souls: 20 }, check: (s) => s.bossKills >= 1 },
  { id: 'boss10', name: 'Thợ Săn Quái Vương', desc: 'Hạ tổng cộng 10 Boss', reward: { souls: 100 }, check: (s) => s.bossKills >= 10 },
  { id: 'trueboss', name: 'Ngọn Lửa Trở Về', desc: 'Đánh bại Trùm Cuối Tầng 5 (Thợ Rèn Sa Ngã)', reward: { souls: 200 }, check: (s) => (s.trueBossKills || 0) >= 1 },
  { id: 'floor3', name: 'Thám Hiểm Sâu', desc: 'Xuống tới tầng 3', reward: { unlock: 'rogue', souls: 30 }, check: (s) => s.maxFloor >= 3 },
  { id: 'floor6', name: 'Kẻ Bước Vào Vô Tận', desc: 'Chạm tới Tầng 6 (Chế độ Vô Tận)', reward: { souls: 120 }, check: (s) => s.maxFloor >= 6 },
  { id: 'legend', name: 'Thợ Rèn Huyền Thoại', desc: 'Rèn ra vũ khí Huyền thoại', reward: { unlock: 'mage', souls: 30 }, check: (s) => s.legendary >= 1 },
  { id: 'react50', name: 'Bậc Thầy Nguyên Tố', desc: 'Gây 50 phản ứng nguyên tố', reward: { unlock: 'ranger', souls: 50 }, check: (s) => s.reactions >= 50 },
  { id: 'perfect20', name: 'Né Như Gió', desc: '20 lần né hoàn hảo', reward: { souls: 40 }, check: (s) => s.perfect >= 20 },
  { id: 'clash10', name: 'Phản Xuyên Thần Tốc', desc: 'Thực hiện 10 lần Phản Xuyên (Clash Dash)', reward: { souls: 60 }, check: (s) => (s.clashes || 0) >= 10 },
  { id: 'spellbreak10', name: 'Kẻ Ngắt Phép', desc: 'Cắt Chiêu địch đang niệm phép 10 lần', reward: { souls: 60 }, check: (s) => (s.spellBreaks || 0) >= 10 },
  { id: 'partbreak5', name: 'Thợ Phá Giáp Boss', desc: 'Phá vỡ 5 Bộ Phận Boss để đoạt Lõi Boss', reward: { souls: 80 }, check: (s) => (s.partBreaks || 0) >= 5 },
  { id: 'awaken1', name: 'Thức Tỉnh Thần Binh', desc: 'Hoàn thành thử thách Thức Tỉnh 1 vũ khí Huyền thoại', reward: { souls: 90 }, check: (s) => (s.awakens || 0) >= 1 },
  { id: 'twinforge', name: 'Nghệ Nhân Biến Hình', desc: 'Rèn thành công 1 Vũ Khí Song Dạng hoặc Ghép Chiêu', reward: { souls: 50 }, check: (s) => (s.specialForges || 0) >= 1 },
  { id: 'twins', name: 'Chém Đôi Song Tử', desc: 'Hạ gục Boss đôi Song Tử Tử Thần', reward: { souls: 90 }, check: (s) => (s.twinsKilled || 0) >= 1 },
  { id: 'pillar5', name: 'Sập Đổ Hầm Ngục', desc: 'Đánh sập 5 Cột Đá trong hầm ngục', reward: { souls: 50 }, check: (s) => (s.pillarsCollapsed || 0) >= 5 },
  { id: 'purge3', name: 'Thanh Tẩy Hắc Ám', desc: 'Thanh Tẩy 3 Lời Nguyền Động', reward: { souls: 60 }, check: (s) => (s.purges || 0) >= 3 },
  { id: 'defense', name: 'Vệ Binh Lò Lửa', desc: 'Chiến thắng chế độ Thủ Thành Lò Lửa (10 đợt)', reward: { souls: 120 }, check: (s) => (s.defenseWins || 0) >= 1 },
  { id: 'elite25', name: 'Thợ Săn Tinh Anh', desc: 'Hạ 25 quái tinh anh', reward: { souls: 50 }, check: (s) => s.elites >= 25 },
  { id: 'wave15', name: 'Kẻ Sống Sót', desc: 'Sống tới đợt 15', reward: { souls: 80 }, check: (s) => s.maxWave >= 15 },
  { id: 'relic5', name: 'Nhà Sưu Tầm', desc: 'Có 5 di vật trong một lượt', reward: { souls: 40 }, check: (s, r) => r && r.relics >= 5 },
  { id: 'setbonus', name: 'Cộng Hưởng Cổ Vật', desc: 'Kích hoạt 1 Bộ Hiệu Ứng Di Vật (2+ món cùng bộ)', reward: { souls: 55 }, check: (s, r) => r && (r.sets || 0) >= 1 },
  { id: 'curse3', name: 'Kẻ Liều Lĩnh', desc: 'Hạ boss khi mang 3 lời nguyền', reward: { souls: 100 }, check: (s, r) => r && r.curses >= 3 && r.bossKilled },
  { id: 'daily', name: 'Thử Thách Hằng Ngày', desc: 'Qua đợt 5 trong thử thách hằng ngày', reward: { souls: 40 }, check: (s, r) => r && r.daily && r.wave >= 6 },
];
