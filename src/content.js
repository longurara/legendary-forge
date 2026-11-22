// Dữ liệu nội dung: di vật, nhân vật, lời nguyền, thành tựu, biến cố đợt.
// Icon nằm trong public/ui/icons (tên file không có đuôi .svg).

// ---------- Di vật (vật phẩm bị động trong một lượt) ----------
export const RELICS = [
  { id: 'ember', name: 'Nhẫn Than Hồng', icon: 'x_ring', desc: 'Lướt để lại vệt lửa đốt quái' },
  { id: 'horn', name: 'Sừng Quỷ', icon: 'x_devil', desc: 'Càng ít máu càng mạnh: tối đa +50% sát thương' },
  { id: 'bell', name: 'Chuông Bạc', icon: 'x_bell', desc: 'Mỗi đòn trúng thứ 10 gọi sét đánh 40 sát thương' },
  { id: 'boots', name: 'Giày Gió', icon: 'x_boots', desc: 'Thêm 1 lần lướt' },
  { id: 'frostheart', name: 'Tim Băng', icon: 'x_frozen', desc: 'Khi bị đánh, đóng băng quái xung quanh (hồi 6 giây)' },
  { id: 'fang', name: 'Nanh Ma Cà Rồng', icon: 'x_vampire', desc: 'Hồi máu bằng 4% sát thương gây ra' },
  { id: 'orbit', name: 'Quả Cầu Hộ Mệnh', icon: 'x_orbital', desc: '2 quả cầu xoay quanh, gây 12 sát thương khi chạm' },
  { id: 'eagle', name: 'Mắt Đại Bàng', icon: 'x_eagle', desc: '+5% chí mạng, chí mạng gây x2.5 thay vì x2' },
  { id: 'gauntlet', name: 'Găng Thợ Rèn', icon: 'x_gauntlet', desc: 'Rèn ở đe thêm 1 phụ tố; mỗi đe rèn được 2 lần' },
  { id: 'goldbag', name: 'Túi Vàng', icon: 'x_coins', desc: '+50% vàng nhặt được' },
  { id: 'badge', name: 'Huy Hiệu Can Đảm', icon: 'x_medal', desc: 'Đầu mỗi đợt nhận khiên 25 máu ảo' },
  { id: 'rune', name: 'Cổ Ngữ Nộ', icon: 'x_rune', desc: 'Thanh Nộ tích nhanh hơn 50%' },
  { id: 'quiver', name: 'Ống Tên Xương', icon: 'x_quiver', desc: 'Mỗi 2.5 giây tự bắn tên vào quái gần nhất' },
  { id: 'skull', name: 'Ấn Đầu Lâu', icon: 'x_skull-signet', desc: 'Hạ tinh anh hồi 15 máu; mỗi quái +1 Hồn Thép' },
  // Di vật bị nguyền: rất mạnh nhưng có cái giá
  { id: 'pact', name: 'Khế Ước Máu', icon: 'x_dripping-blade', cursed: true, desc: '+40% sát thương, nhưng mất 1 máu mỗi giây (không chết vì nó)' },
  { id: 'glass', name: 'Tim Thủy Tinh', icon: 'x_broken-heart', cursed: true, desc: '+15% chí mạng, chí mạng x3, nhưng nhận thêm 40% sát thương' },
  { id: 'greed', name: 'Túi Tham Lam', icon: 'x_heart-bottle', cursed: true, desc: 'Gấp đôi vàng và Mảnh Thép, nhưng quái thêm 25% máu' },
  { id: 'fury', name: 'Mặt Nạ Cuồng Nộ', icon: 'x_poison-gas', cursed: true, desc: 'Mỗi 10% máu đã mất: +6% sát thương; bình máu không còn tác dụng' },
];
export const relicById = (id) => RELICS.find((r) => r.id === id);

// ---------- Nhân vật ----------
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
    id: 'rogue', name: 'Sát Thủ', model: 'char_rogue', icon: 'x_hood', weapon: 'sword', hp: 95,
    passive: 'Lướt 2 lần liên tiếp. +15% chí mạng, chạy nhanh hơn 10%.',
    unlock: 'floor3', mods: { dashCharges: 1, crit: 0.15, move: 0.1 },
    gear: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], shield: null,
  },
];
export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// ---------- Lời nguyền (tự chọn trước lượt chơi, đổi lấy thêm Hồn Thép) ----------
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

// ---------- Thành tựu ----------
// check(stats, run): stats là thống kê lâu dài (meta.stats), run là thông tin lượt chơi hiện tại
export const ACHIEVEMENTS = [
  { id: 'kill100', name: 'Diệt Trừ', desc: 'Hạ tổng cộng 100 quái', reward: { souls: 30 }, check: (s) => s.kills >= 100 },
  { id: 'slime300', name: 'Vua Diệt Slime', desc: 'Hạ 300 slime', reward: { souls: 60 }, check: (s) => s.slimes >= 300 },
  { id: 'boss1', name: 'Hạ Gục Boss', desc: 'Hạ boss đầu tiên', reward: { unlock: 'barbarian', souls: 20 }, check: (s) => s.bossKills >= 1 },
  { id: 'floor3', name: 'Thám Hiểm Sâu', desc: 'Xuống tới tầng 3', reward: { unlock: 'rogue', souls: 30 }, check: (s) => s.maxFloor >= 3 },
  { id: 'legend', name: 'Thợ Rèn Huyền Thoại', desc: 'Rèn ra vũ khí Huyền thoại', reward: { unlock: 'mage', souls: 30 }, check: (s) => s.legendary >= 1 },
  { id: 'react50', name: 'Bậc Thầy Nguyên Tố', desc: 'Gây 50 phản ứng nguyên tố', reward: { souls: 50 }, check: (s) => s.reactions >= 50 },
  { id: 'perfect20', name: 'Né Như Gió', desc: '20 lần né hoàn hảo', reward: { souls: 40 }, check: (s) => s.perfect >= 20 },
  { id: 'elite25', name: 'Thợ Săn Tinh Anh', desc: 'Hạ 25 quái tinh anh', reward: { souls: 50 }, check: (s) => s.elites >= 25 },
  { id: 'wave15', name: 'Kẻ Sống Sót', desc: 'Sống tới đợt 15', reward: { souls: 80 }, check: (s) => s.maxWave >= 15 },
  { id: 'relic5', name: 'Nhà Sưu Tầm', desc: 'Có 5 di vật trong một lượt', reward: { souls: 40 }, check: (s, r) => r && r.relics >= 5 },
  { id: 'curse3', name: 'Kẻ Liều Lĩnh', desc: 'Hạ boss khi mang 3 lời nguyền', reward: { souls: 100 }, check: (s, r) => r && r.curses >= 3 && r.bossKilled },
  { id: 'daily', name: 'Thử Thách Hằng Ngày', desc: 'Qua đợt 5 trong thử thách hằng ngày', reward: { souls: 40 }, check: (s, r) => r && r.daily && r.wave >= 6 },
];
