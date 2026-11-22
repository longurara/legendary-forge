// Làng Thợ Rèn (xây dựng bằng Hồn Thép), cốt truyện mở dần, bảng xếp hạng trên máy

export const BUILDINGS = [
  { id: 'inn', name: 'Quán Trọ', icon: 'x_price', max: 3, cost: (lv) => 60 + lv * 60, desc: (lv) => `Bắt đầu mỗi lượt với ${lv * 30} vàng`, next: (lv) => `Bắt đầu với ${(lv + 1) * 30} vàng` },
  { id: 'shrine', name: 'Đền Thần', icon: 'x_sunbeams', max: 2, cost: (lv) => 120 + lv * 120, desc: (lv) => ['Chưa xây', 'Tầng 1: chọn thần nhận thêm 1 thẻ', 'Mỗi tầng: chọn thần nhận thêm 1 thẻ'][lv], next: (lv) => ['Tầng 1: chọn thần nhận thêm 1 thẻ', 'Mỗi tầng: chọn thần nhận thêm 1 thẻ'][lv] },
  { id: 'gem', name: 'Xưởng Ngọc', icon: 'x_crystal-ball', max: 2, cost: (lv) => 100 + lv * 100, desc: (lv) => ['Chưa xây', 'Vũ khí khởi đầu có sẵn 1 viên ngọc', 'Vũ khí khởi đầu có 1 ngọc, khởi đầu Hiếm'][lv], next: (lv) => ['Vũ khí khởi đầu có sẵn 1 viên ngọc', 'Vũ khí khởi đầu luôn là Hiếm'][lv] },
  { id: 'smith', name: 'Lò Luyện Thép', icon: 'anvil', max: 3, cost: (lv) => 80 + lv * 80, desc: (lv) => `Bắt đầu với ${lv * 6} Mảnh Thép, cường hóa rẻ hơn ${lv * 10}%`, next: (lv) => `${(lv + 1) * 6} Mảnh Thép, rẻ hơn ${(lv + 1) * 10}%` },
  { id: 'library', name: 'Thư Viện', icon: 'x_book', max: 1, cost: () => 90, desc: (lv) => (lv ? 'Mở Nhật Ký: đọc lại mọi chương truyện' : 'Chưa xây'), next: () => 'Mở Nhật Ký: đọc lại mọi chương truyện' },
  { id: 'tower', name: 'Tháp Canh', icon: 'x_eagle', max: 1, cost: () => 150, desc: (lv) => (lv ? 'Mỗi bệ phần thưởng có thêm 1 lựa chọn bất ngờ' : 'Chưa xây'), next: () => 'Mỗi bệ phần thưởng có thêm 1 lựa chọn bất ngờ' },
];

// ---------- Cốt truyện: mở theo cột mốc ----------
// cond(meta, info): info = { runs, floor, bossKilled, deaths }
export const STORY = [
  { id: 's1', title: 'Lò Tắt', who: 'Thợ Cả Hàn', cond: () => true,
    lines: ['Ngươi tỉnh rồi à? Lò Rèn Huyền Thoại đã tắt lửa từ đêm Chúa Tể Bóng Đêm kéo xuống.', 'Hắn cướp Ngọn Lửa Đầu Tiên và giấu nó dưới đáy hầm. Không có lửa, làng này sẽ chết dần.', 'Cầm lấy thanh kiếm cùn này. Xuống hầm, nhặt mọi thứ kim loại ngươi thấy, rồi rèn chúng thành thứ mạnh hơn.'] },
  { id: 's2', title: 'Kẻ Ngã Xuống', who: 'Thợ Cả Hàn', cond: (m, i) => i.deaths >= 1,
    lines: ['Lại ngã rồi sao. Đừng xấu hổ, ta cũng từng ngã cả trăm lần dưới đó.', 'Hồn Thép ngươi mang về không mất đi đâu cả. Đem nó vào lò, ta sẽ tôi luyện cho ngươi.', 'Mỗi lần ngươi trở lại, ngươi sẽ mạnh hơn. Bọn quái thì không.'] },
  { id: 's3', title: 'Hiệp Sĩ Xương', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.bossKills || 0) >= 1,
    lines: ['Ngươi hạ được Hiệp Sĩ Xương? Hắn từng là đội trưởng đội cận vệ của làng này.', 'Bóng Đêm đã biến hắn thành con rối. Ngươi đã giải thoát cho hắn rồi đấy.', 'Nhưng nhớ lấy: cái rìu của hắn vẫn còn hơi ấm. Ngọn Lửa đang ở rất gần.'] },
  { id: 's4', title: 'Hang Băng', who: 'Lữ Khách', cond: (m) => (m.stats.maxFloor || 1) >= 2,
    lines: ['Ngươi cũng xuống tới tầng băng à? Ta tưởng chỉ có kẻ điên mới làm thế.', 'Băng ở đây không phải băng thường. Nó được đông lại từ hơi thở của những thợ rèn bị bắt.', 'Dùng lửa đi. Bọn quái ở đây sợ lửa hơn sợ chết.'] },
  { id: 's5', title: 'Vua Slime', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.bossKills || 0) >= 2,
    lines: ['Vua Slime… hắn nuốt cả kho sắt của làng năm xưa. Ngươi có thấy gì trong bụng hắn không?', 'Mảnh thép, mảnh ngọc, cả những thanh kiếm cũ của tổ tiên ta.', 'Ngươi đang đi đúng đường. Lửa đang gọi ngươi.'] },
  { id: 's6', title: 'Lò Nham Thạch', who: 'Giọng Nói Trong Lửa', cond: (m) => (m.stats.maxFloor || 1) >= 3,
    lines: ['…Thợ rèn… ngươi nghe thấy ta không?', 'Ta là Ngọn Lửa Đầu Tiên. Hắn xích ta dưới đáy Hầm Mộ.', 'Mỗi vũ khí ngươi rèn dưới này đều mang một tia của ta. Hãy rèn tiếp… và tìm đến ta.'] },
  { id: 's7', title: 'Hầm Mộ', who: 'Thợ Cả Hàn', cond: (m) => (m.stats.maxFloor || 1) >= 4,
    lines: ['Hầm Mộ là nơi chôn những thợ rèn đời trước. Cả cha ta cũng nằm đó.', 'Nếu ngươi thấy bộ xương nào cầm búa… đừng nương tay. Đó không còn là họ nữa.', 'Chúa Tể Bóng Đêm đang đợi ở cuối Hầm Mộ. Hắn nhanh hơn bất kỳ thứ gì ngươi từng gặp.'] },
  { id: 's8', title: 'Ngọn Lửa Trở Về', who: 'Ngọn Lửa Đầu Tiên', cond: (m) => (m.stats.maxFloor || 1) >= 5,
    lines: ['Xiềng xích đã đứt. Ta trở về lò rồi, thợ rèn.', 'Nhưng bóng tối chưa chết. Nó chỉ lùi sâu hơn xuống những tầng hầm chưa ai đặt chân tới.', 'Bậc Hầm Sâu đã mở. Mỗi bậc là một tầng địa ngục sâu hơn. Ta sẽ cháy cùng ngươi đến tận cùng.'] },
];

export function unlockedStory(meta, info) { return STORY.filter((s) => s.cond(meta, info)); }

// ---------- Bảng xếp hạng (lưu trên máy) ----------
const LB_KEY = 'lorenh_leaderboard';
export function loadBoard() { try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return []; } }
export function runScore(r) { return r.floor * 1000 + r.wave * 100 + r.kills + (r.depth || 0) * 800 + (r.boss ? 500 : 0); }
// Thêm một lượt; trả về hạng (1..10) hoặc 0 nếu không lọt top
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
