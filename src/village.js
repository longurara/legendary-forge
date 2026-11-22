// Làng Thợ Rèn (xây dựng bằng Hồn Thép), cốt truyện 12 chương, bảng xếp hạng & Xuất/Nhập mã Save

export const BUILDINGS = [
  { id: 'inn', name: 'Quán Trọ', icon: 'x_price', max: 3, cost: (lv) => 60 + lv * 60, desc: (lv) => `Bắt đầu mỗi lượt với ${lv * 30} vàng`, next: (lv) => `Bắt đầu với ${(lv + 1) * 30} vàng` },
  { id: 'shrine', name: 'Đền Thần', icon: 'x_sunbeams', max: 2, cost: (lv) => 120 + lv * 120, desc: (lv) => ['Chưa xây', 'Tầng 1: chọn thần nhận thêm 1 thẻ', 'Mỗi tầng: chọn thần nhận thêm 1 thẻ'][lv], next: (lv) => ['Tầng 1: chọn thần nhận thêm 1 thẻ', 'Mỗi tầng: chọn thần nhận thêm 1 thẻ'][lv] },
  { id: 'gem', name: 'Xưởng Ngọc', icon: 'x_crystal-ball', max: 2, cost: (lv) => 100 + lv * 100, desc: (lv) => ['Chưa xây', 'Vũ khí khởi đầu có sẵn 1 viên ngọc', 'Vũ khí khởi đầu có 1 ngọc, khởi đầu Hiếm'][lv], next: (lv) => ['Vũ khí khởi đầu có sẵn 1 viên ngọc', 'Vũ khí khởi đầu luôn là Hiếm'][lv] },
  { id: 'smith', name: 'Lò Luyện Thép', icon: 'anvil', max: 3, cost: (lv) => 80 + lv * 80, desc: (lv) => `Bắt đầu với ${lv * 6} Mảnh Thép, cường hóa rẻ hơn ${lv * 10}%`, next: (lv) => `${(lv + 1) * 6} Mảnh Thép, rẻ hơn ${(lv + 1) * 10}%` },
  { id: 'library', name: 'Thư Viện', icon: 'x_book', max: 1, cost: () => 90, desc: (lv) => (lv ? 'Mở Nhật Ký: đọc lại mọi chương truyện' : 'Chưa xây'), next: () => 'Mở Nhật Ký: đọc lại mọi chương truyện' },
  { id: 'tower', name: 'Tháp Canh', icon: 'x_eagle', max: 1, cost: () => 150, desc: (lv) => (lv ? 'Mỗi bệ phần thưởng có thêm 1 lựa chọn bất ngờ' : 'Chưa xây'), next: () => 'Mỗi bệ phần thưởng có thêm 1 lựa chọn bất ngờ' },
];

// ---------- Cốt truyện 12 chương mở theo cột mốc ----------
export const STORY = [
  { id: 's1', title: 'Lò Tắt', who: 'Thợ Cả Hàn', cond: () => true,
    lines: ['Ngươi tỉnh rồi à? Lò Rèn Huyền Thoại đã tắt lửa từ đêm Thợ Rèn Sa Ngã kéo quân xuống.', 'Hắn cướp Ngọn Lửa Đầu Tiên và giấu nó ở Tầng 5. Không có lửa, làng này sẽ chết dần.', 'Cầm lấy vũ khí này. Xuống hầm, nhặt mọi thứ kim loại ngươi thấy, rồi rèn chúng thành thần binh.'] },
  { id: 's2', title: 'Kẻ Ngã Xuống', who: 'Thợ Cả Hàn', cond: (m, i) => i.deaths >= 1,
    lines: ['Lại ngã rồi sao. Đừng xấu hổ, ta cũng từng ngã cả trăm lần dưới đó.', 'Hồn Thép ngươi mang về không mất đi đâu cả. Đem nó vào lò, ta sẽ tôi luyện cho ngươi.', 'Nhưng cẩn thận — linh hồn cũ của ngươi vẫn còn vương dưới tầng hầm, mang theo chính vũ khí năm xưa!'] },
  { id: 's3', title: 'Hiệp Sĩ Xương', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.bossKills || 0) >= 1,
    lines: ['Ngươi hạ được Boss đầu tiên rồi sao? Dưới hầm này có tới mười một quái vương canh giữ.', 'Phá vỡ bộ phận phát sáng trên người chúng để đoạt Lõi Boss — đem về Đe sẽ rèn ra vũ khí độc nhất vô nhị!'] },
  { id: 's4', title: 'Hang Băng', who: 'Lữ Khách', cond: (m) => (m.stats.maxFloor || 1) >= 2,
    lines: ['Ngươi cũng xuống tới Hang Băng à? Đừng xem thường mặt băng trơn dưới chân.', 'Đánh Lửa lên băng sẽ làm tan thành nước, rồi gọi Sét vào nước sẽ phóng Điện Trường quét sạch cả bầy!'] },
  { id: 's5', title: 'Lò Nham & Đầm Lầy', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.maxFloor || 1) >= 3,
    lines: ['Tầng sâu có cả Lò Nham Thạch lẫn Đầm Lầy Độc của Vua Nấm Dịch Hạch.', 'Băng có thể đông cứng nham thạch thành Đá Obsidian đi qua được, còn Lửa sẽ kích nổ dây chuyền toàn bộ đầm độc!'] },
  { id: 's6', title: 'Song Long & Quỷ Lò', who: 'Giọng Nói Trong Lửa', cond: (m) => (m.stats.bossKills || 0) >= 3,
    lines: ['…Thợ rèn… ngươi đã chạm trán Băng Long, Hỏa Long hay Chúa Quỷ Lò Rèn chưa?', 'Khi thấy đòn đỏ-trắng lao tới, đừng chạy trốn — hãy lướt THẲNG VÀO để Phản Xuyên!'] },
  { id: 's7', title: 'Hầm Mộ & Song Tử', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.maxFloor || 1) >= 4,
    lines: ['Hầm Mộ là nơi chôn những thợ rèn đời trước. Cả Song Tử Tử Thần cũng ẩn nấp dưới đó.', 'Nếu gặp hai anh em Hỏa Ảnh và Lôi Ảnh, hãy cẩn thận: khi một tên ngã xuống, kẻ còn lại sẽ Hấp Thụ sức mạnh của cả hai!'] },
  { id: 's8', title: 'Thợ Rèn Sa Ngã', who: 'Ngọn Lửa Đầu Tiên', cond: (m) => (m.stats.maxFloor || 1) >= 5,
    lines: ['Ngươi đã tới Tầng 5! Trước mặt ngươi chính là sư phụ cũ của làng — Hắc Hỏa Tôn.', 'Hắn đã dùng Tha Hóa để rèn chính linh hồn mình vào chiếc búa. Hãy đánh bại hắn để đoạt lại ta!'] },
  { id: 's9', title: 'Đoạt Lại Ngọn Lửa', who: 'Ngọn Lửa Đầu Tiên', cond: (m) => (m.stats.trueBossKills || 0) >= 1,
    lines: ['Xiềng xích đã tan vỡ! Ngọn Lửa Đầu Tiên đã trở về với Lò Rèn Huyền Thoại.', 'Nhưng vực sâu phía dưới Tầng 5 vẫn còn vô tận. Bậc Hầm Sâu và Chế Độ Vô Tận đã mở đón bước chân ngươi!'] },
  { id: 's10', title: 'Vũ Khí Thức Tỉnh', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.awakens || 0) >= 1,
    lines: ['Ánh sáng đó… vũ khí của ngươi vừa Thức Tỉnh bản năng thật sự của nó!', 'Chỉ những thợ rèn rèn bằng cả máu và lửa mới đánh thức được Tuyệt Kỹ ẩn bên trong thần binh.'] },
  { id: 's11', title: 'Vệ Binh Lò Lửa', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.defenseWins || 0) >= 1,
    lines: ['Ngươi đã giữ vững Lò Lửa Trung Tâm qua cả 10 đợt công thành! Cả ngôi làng đều nợ ngươi một lời cảm ơn.'] },
  { id: 's12', title: 'Bước Vào Vô Tận', who: 'Giọng Nói Trong Lửa', cond: (m) => (m.stats.maxFloor || 1) >= 6,
    lines: ['Không còn giới hạn nào nữa. Từ Tầng 6 trở đi, mọi vị thần và quái vương đều hội tụ để thử thách huyền thoại mới của Lò Rèn!'] },
];

export function unlockedStory(meta, info) { return STORY.filter((s) => s.cond(meta, info)); }

// ---------- Bảng xếp hạng (lưu trên máy) ----------
const LB_KEY = 'lorenh_leaderboard';
export function loadBoard() { try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return []; } }
export function runScore(r) { return r.floor * 1000 + r.wave * 100 + r.kills + (r.depth || 0) * 800 + (r.boss ? 500 : 0) + (r.victory ? 1500 : 0); }
export function submitRun(r) {
  const board = loadBoard();
  r.score = runScore(r);
  board.push(r);
  board.sort((a, b) => b.score - a.score);
  const top = board.slice(0, 10);
  localStorage.setItem(LB_KEY, JSON.stringify(top));
  const rank = top.indexOf(r) + 1;
  return rank;
}

// ---------- Xuất / Nhập Mã Save (chuyển dữ liệu PC <-> Điện thoại) ----------
export function exportSaveCode() {
  const payload = {
    v: 2,
    meta: JSON.parse(localStorage.getItem('lorenh_meta') || '{}'),
    best: Number(localStorage.getItem('lorenh_best') || 0),
    board: JSON.parse(localStorage.getItem(LB_KEY) || '[]'),
    touch: JSON.parse(localStorage.getItem('lorenh_touch_cfg') || '{}'),
  };
  const json = JSON.stringify(payload);
  // Hỗ trợ Unicode tiếng Việt khi mã hóa Base64
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'LRHT2:' + btoa(bin);
}

export function importSaveCode(code) {
  const clean = String(code || '').trim();
  if (!clean.startsWith('LRHT2:')) return { ok: false, err: 'Mã lưu không hợp lệ (phải bắt đầu bằng LRHT2:)' };
  try {
    const bin = atob(clean.slice(6));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || typeof data.meta !== 'object') {
      return { ok: false, err: 'Dữ liệu bên trong mã lưu bị hỏng.' };
    }
    localStorage.setItem('lorenh_meta', JSON.stringify(data.meta));
    if (typeof data.best === 'number') localStorage.setItem('lorenh_best', String(data.best));
    if (Array.isArray(data.board)) localStorage.setItem(LB_KEY, JSON.stringify(data.board.slice(0, 10)));
    if (data.touch && typeof data.touch === 'object') localStorage.setItem('lorenh_touch_cfg', JSON.stringify(data.touch));
    return { ok: true, data };
  } catch {
    return { ok: false, err: 'Không giải mã được chuỗi lưu — hãy kiểm tra xem đã copy đủ mã chưa.' };
  }
}
