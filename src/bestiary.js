// Sổ Quái Vật (Bestiary: 24 chủng quái + 11 Boss) & Thống Kê Chi Tiết Lượt Chơi (Run Summary & DPS Breakdown)
import { RELIC_SETS, activeRelicSets, petById, charById } from './content.js';
import { RARITY, weaponName, weaponIcons } from './weapons.js';

export const BESTIARY_MOBS = [
  { id: 'slime', name: 'Slime Độc / Dung Nham', icon: 'x_slime', role: 'Cận chiến nhảy vồ', weak: 'Sét · Băng', tip: 'Slime lớn tách thành 2 Slime nhỏ khi chết; Slime Mẹ gọi thêm đàn.' },
  { id: 'minion', name: 'Lính Xương', icon: 'x_skull-signet', role: 'Cận chiến cơ bản', weak: 'Thánh (+50%)', tip: 'Áp sát theo bầy; dễ đẩy văng xuống vực hoặc đập tường.' },
  { id: 'mage', name: 'Pháp Sư Xương', icon: 'x_wizard', role: 'Đánh xa bắn cầu', weak: 'Thánh (+50%)', tip: 'Giữ khoảng cách để bắn cầu phép; áp sát để phá đội hình.' },
  { id: 'assassin', name: 'Sát Thủ Bóng', icon: 'x_hood', role: 'Lao Xuyên nhanh', weak: 'Thánh · Băng', tip: 'Đòn lao cảnh báo Đỏ-Trắng: lướt thẳng vào để Phản Xuyên!' },
  { id: 'archer', name: 'Cung Thủ Xương', icon: 'x_arrows', role: 'Bắn tỉa tầm xa', weak: 'Thánh (+50%)', tip: 'Hay núp sau Khiên Binh; chú ý tia ngắm trước khi bắn.' },
  { id: 'healer', name: 'Tu Sĩ Hồi Máu', icon: 'x_heart-bottle', role: 'Hỗ trợ hồi máu', weak: 'Thánh · Lửa', tip: 'Hồi máu cho đồng minh xung quanh — ưu tiên hạ trước!' },
  { id: 'shield', name: 'Khiên Binh Xương', icon: 'x_shield', role: 'Chặn đòn phía trước', weak: 'Đánh sau lưng · Lửa', tip: 'Khiên chặn phần lớn sát thương mặt trước; lướt vòng ra sau lưng.' },
  { id: 'bomber', name: 'Kẻ Đánh Bom', icon: 'x_explosion', role: 'Cảm tử phát nổ', weak: 'Đánh xa · Đẩy lùi', tip: 'Chết hoặc áp sát sẽ phát nổ — đẩy lùi vào đám quái để nổ dây chuyền!' },
  { id: 'wraith', name: 'Bóng Ma Tím', icon: 'x_ghost2', role: 'Dịch chuyển đột kích', weak: 'Thánh · Sét', tip: 'Tàng hình rồi hiện sau lưng bạn; giữ lại 1 nhịp lướt để né.' },
  { id: 'armored', name: 'Hiệp Sĩ Giáp Sắt', icon: 'x_horned-helm', role: 'Giáp nặng chống đánh', weak: 'Chí mạng · Đâm Lướt', tip: 'Chỉ vỡ giáp bằng đòn Chí Mạng, Đâm Lướt hoặc Chiến Chùy.' },
  { id: 'burrower', name: 'Kẻ Đào Đất', icon: 'x_spikepit', role: 'Độn thổ trồi lên', weak: 'Băng · Sét', tip: 'Chui xuống lòng đất rồi hất tung tại vị trí bạn đứng.' },
  { id: 'pyro', name: 'Hỏa Sư Xương', icon: 'x_fire-bowl', role: 'Gọi thiên thạch lửa', weak: 'Băng · Cắt Chiêu', tip: 'Phép cảnh báo Tím: dùng Kỹ năng/Đòn nặng để Cắt Chiêu lấy Cổ Ngữ!' },
  { id: 'frostguard', name: 'Vệ Binh Băng', icon: 'x_snowflake2', role: 'Đấu sĩ làm chậm', weak: 'Lửa (Tan Chảy)', tip: 'Đập sóng băng diện rộng làm chậm; dùng Lửa để Tan Chảy ×2.' },
  { id: 'lancer', name: 'Kỵ Binh Xương', icon: 'x_sword-stone', role: 'Thương lao tầm xa', weak: 'Phản Xuyên · Thánh', tip: 'Đâm thương siêu xa cảnh báo Đỏ-Trắng — mồi ngon cho Phản Xuyên!' },
  { id: 'necro', name: 'Chiêu Hồn Sư', icon: 'x_death-zone', role: 'Triệu hồi quân xương', weak: 'Cắt Chiêu · Thánh', tip: 'Liên tục dựng Lính Xương; Cắt Chiêu ngay khi hắn giơ trượng tím.' },
  { id: 'berserker', name: 'Cuồng Chiến Xương', icon: 'x_barbarian', role: 'Xoay rìu cuồng nộ', weak: 'Băng · Choáng', tip: 'Máu càng thấp đánh càng nhanh; đóng băng hoặc làm choáng để khóa.' },
  { id: 'orc', name: 'Chiến Binh Orc', icon: 'x_mailed-fist', role: 'Cận chiến siêu trâu', weak: 'Độc · Băng', tip: 'Máu cao, có thanh Choáng và đập diện rộng mạnh.' },
  { id: 'goblin', name: 'Yêu Tinh Đột Kích', icon: 'x_daggers', role: 'Cơ động theo bầy', weak: 'Đánh lan · Gió', tip: 'Di chuyển nhanh thành từng tốp; Lưỡi Hái hoặc Búa dọn cực gọn.' },
  { id: 'imp', name: 'Tiểu Quỷ Lửa', icon: 'x_flame-tunnel', role: 'Bay bắn cầu lửa', weak: 'Băng · Sét', tip: 'Bay lơ lửng bắn cầu lửa và để lại tàn tro nóng.' },
  { id: 'drake', name: 'Ấu Long Băng', icon: 'x_dragon', role: 'Bay phun sương giá', weak: 'Lửa · Sét', tip: 'Phun tia băng hình nón làm chậm; dễ vỡ khi dính Lửa.' },
  { id: 'glub', name: 'Quái Nhầy Axit', icon: 'x_poison-bottle', role: 'Phun vũng độc', weak: 'Lửa (Khí Nổ)', tip: 'Để lại vũng axit ăn mòn — bắn Lửa vào vũng độc để kích Khí Nổ!' },
  { id: 'spider', name: 'Nhện Độc Hang Sâu', icon: 'x_poison-gas', role: 'Vồ cắn tiêm độc', weak: 'Lửa · Gió', tip: 'Nhảy vồ bất ngờ và bắn tơ làm chậm.' },
  { id: 'wasp', name: 'Ong Khổng Lồ', icon: 'x_winged-leg', role: 'Lao chích tốc độ', weak: 'Băng · Lửa', tip: 'Bay cực nhanh, hay tấn công từ sườn.' },
  { id: 'viper', name: 'Mãng Xà Độc', icon: 'x_vampire', role: 'Phun nọc tầm xa', weak: 'Băng · Lửa', tip: 'Phun 3 tia nọc độc hình quạt; di chuyển ngang để né.' },
  { id: 'crab', name: 'Cua Đá Giáp Cứng', icon: 'x_shield', role: 'Phòng thủ cứng', weak: 'Sét · Chiến Chùy', tip: 'Vỏ đá giảm sát thương; Chiến Chùy hoặc đòn Chí Mạng phá giáp nhanh.' },
];

export const BESTIARY_BOSSES = [
  { id: 'boss_iron', name: 'Kỵ Sĩ Thép (Thiết Ma)', icon: 'boss', core: 'Lõi Thiết Ma → Chiến Phủ Đập Đất', parts: 'Mũ Thiết Ma · Khiên Vai', tip: 'Đòn lao có thể Phản Xuyên; phá Mũ Thiết Ma để đoạt Lõi Boss.' },
  { id: 'boss_slime', name: 'Vua Slime', icon: 'x_slime', core: 'Lõi Vua Nhầy → Song Đao Độc', parts: 'Vương Miện Nhầy', tip: 'Nhảy nghiền toàn sân và gọi đàn Slime; đánh phá Vương Miện khi nó đáp xuống.' },
  { id: 'boss_mage', name: 'Đại Pháp Sư', icon: 'x_crystal-ball', core: 'Lõi Đại Pháp Sư → Trượng Sao Băng', parts: 'Pha Lê Pháp Thuật', tip: 'Chuyên tung bão cầu và vòng phép Tím — Cắt Chiêu để tạo khoảng trống!' },
  { id: 'boss_shadow', name: 'Chúa Tể Bóng Tối', icon: 'x_evil-moon', core: 'Lõi Bóng Tối → Kiếm Ảnh Chém', parts: 'Áo Choàng Hư Không', tip: 'Biến mất gọi phân thân và lao Xuyên liên tiếp; giữ nhịp né để Phản Xuyên.' },
  { id: 'boss_ogre', name: 'Chúa Quỷ Lò Rèn', icon: 'x_fire-bowl', core: 'Lõi Lò Quỷ → Búa Nham Thạch', parts: 'Lõi Lò Quỷ · Sừng Quỷ Thép', tip: 'Hút người chơi vào lò nung trước khi nổ; phá Lõi Lò sau lưng để thu nhỏ vùng nổ.' },
  { id: 'boss_frost_dragon', name: 'Băng Long Vương', icon: 'x_snowflake2', core: 'Lõi Băng Long → Nỏ Long Tiễn', parts: 'Sừng Băng Long', tip: 'Bay phun hơi băng và lao bổ Đỏ-Trắng; dùng Lửa để Tan Chảy và phá Sừng Băng.' },
  { id: 'boss_ember_dragon', name: 'Hỏa Long Cổ Đại', icon: 'x_meteor', core: 'Lõi Hỏa Long → Đại Kiếm Long Viêm', parts: 'Long Châu Lửa', tip: 'Gọi mưa thiên thạch phủ nham khắp sân; phá Long Châu xoay quanh thân để giảm số thiên thạch.' },
  { id: 'boss_plague', name: 'Vua Nấm Dịch Hạch', icon: 'x_poison-gas', core: 'Lõi Vua Nấm → Trượng Dịch Hạch', parts: 'Mũ Nấm Độc', tip: 'Hấp thụ vũng độc để hồi máu — dùng Lửa đốt sạch vũng độc xung quanh!' },
  { id: 'boss_frost_warden', name: 'Băng Vương Giáp Sĩ', icon: 'x_horned-helm', core: 'Lõi Băng Vương → Kiếm Sương Vương', parts: 'Vương Miện Băng', tip: 'Lao Xuyên 3 lần liên tiếp; phá Vương Miện Băng để giới hạn còn 1 lần lao!' },
  { id: 'boss_twins', name: 'Song Tử Tử Thần', icon: 'x_swords-emblem', core: 'Lõi Song Tử → Lưỡi Hái Song Tử', parts: 'Ấn Song Sinh (Hỏa Ảnh)', tip: 'Hỏa Ảnh & Lôi Ảnh bắn Tia Liên Kết; kẻ sống sót sau sẽ Hấp Thụ đồng đội và cuồng nộ!' },
  { id: 'boss_smith', name: 'TRÙM CUỐI · Thợ Rèn Sa Ngã', icon: 'anvil', core: 'Lõi Thợ Rèn Sa Ngã → Thần Chùy Khởi Nguyên', parts: 'Búa Hắc Hỏa · Giáp Ngọn Lửa', tip: 'Trùm Cuối Tầng 5 với 3 giai đoạn! Phá Giáp Ngọn Lửa (+25% sát thương nhận vào) và Búa Hắc Hỏa (rơi Lõi Thần Chùy).' },
];

// Ánh xạ bất kỳ thực thể Enemy nào sang mã Bestiary tương ứng
export function enemyBestiaryId(e) {
  if (!e || e.isDummy || e.isEcho) return null;
  const cn = e.constructor?.name || '';
  if (e.isBoss) {
    return {
      Boss: 'boss_iron',
      KingSlime: 'boss_slime',
      ArchMage: 'boss_mage',
      ShadowLord: 'boss_shadow',
      ForgeOgre: 'boss_ogre',
      FrostDragon: 'boss_frost_dragon',
      EmberDragon: 'boss_ember_dragon',
      PlagueKing: 'boss_plague',
      FrostWarden: 'boss_frost_warden',
      ReaperTwin: 'boss_twins',
      FallenSmith: 'boss_smith',
    }[cn] || null;
  }
  return {
    Slime: 'slime', Minion: 'minion', Mage: 'mage', Assassin: 'assassin', Archer: 'archer',
    Healer: 'healer', ShieldBearer: 'shield', Bomber: 'bomber', Wraith: 'wraith',
    Armored: 'armored', Burrower: 'burrower', PyroMage: 'pyro', FrostGuard: 'frostguard',
    Lancer: 'lancer', Necromancer: 'necro', Berserker: 'berserker', OrcBrute: 'orc',
    GoblinRaider: 'goblin', FireImp: 'imp', FrostDrake: 'drake', AcidGlub: 'glub',
    VenomSpider: 'spider', GiantWasp: 'wasp', Viper: 'viper', StoneCrab: 'crab',
  }[cn] || null;
}

export function renderBestiaryHtml(meta, tab = 'mobs') {
  const b = meta.bestiary || {};
  const list = tab === 'bosses' ? BESTIARY_BOSSES : BESTIARY_MOBS;
  const seenAll = [...BESTIARY_MOBS, ...BESTIARY_BOSSES].filter((x) => b[x.id]?.seen).length;
  const totalAll = BESTIARY_MOBS.length + BESTIARY_BOSSES.length;
  const cards = list.map((it) => {
    const rec = b[it.id];
    const known = !!rec?.seen;
    const kills = rec?.kills || 0;
    return `<div class="best-card${known ? '' : ' locked'}${tab === 'bosses' ? ' boss' : ''}">
      <div class="bc-head">
        <i class="ico" style="--i:url('/ui/icons/${it.icon}.svg')"></i>
        <div>
          <h4>${known ? it.name : '???'}</h4>
          <span class="bc-meta">${known ? (tab === 'bosses' ? `Bộ phận: ${it.parts}` : `${it.role} · Yếu: ${it.weak}`) : 'Chưa chạm trán'}</span>
        </div>
        ${known ? `<span class="bc-kills" title="Số lần đã hạ">${kills}✕</span>` : ''}
      </div>
      <p class="bc-tip">${known ? it.tip : 'Khám phá sâu hơn trong hầm ngục để ghi chép thông tin kẻ địch này.'}</p>
      ${known && it.core ? `<div class="bc-core">✦ ${it.core}</div>` : ''}
    </div>`;
  }).join('');
  return { html: cards, countText: `${seenAll} / ${totalAll} đã gặp` };
}

const DMG_CATS = [
  { key: 'basic', name: 'Đòn Thường', color: '#f0b860' },
  { key: 'special', name: 'Kỹ Năng (Chuột Phải)', color: '#70c8ff' },
  { key: 'react', name: 'Phản Ứng & Nguyên Tố', color: '#ff6a3a' },
  { key: 'rune', name: 'Mạch Cổ Ngữ', color: '#c480ff' },
  { key: 'ult', name: 'Tuyệt Kỹ (Nộ)', color: '#ffe14a' },
  { key: 'pet', name: 'Bạn Đồng Hành / Trụ', color: '#7fff9a' },
];

export function renderRunSummaryHtml(runDmg, player, run) {
  const total = DMG_CATS.reduce((s, c) => s + (runDmg[c.key] || 0), 0);
  const bars = DMG_CATS.map((c) => {
    const val = Math.round(runDmg[c.key] || 0);
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    return `<div class="rs-row">
      <span class="rs-lbl">${c.name}</span>
      <div class="rs-bar"><div class="rs-fill" style="width:${pct}%;background:${c.color}"></div></div>
      <span class="rs-val">${val.toLocaleString('vi-VN')} <small>(${pct}%)</small></span>
    </div>`;
  }).join('');

  const sets = activeRelicSets(player?.relics || []);
  const setBadges = sets.length
    ? `<div class="rs-tags">${sets.map((s) => `<span class="rs-set" style="border-color:${s.color};color:${s.color}">${s.name} (${s.count}/3)</span>`).join('')}</div>`
    : '';
  const ch = charById(run?.char || 'knight');
  const pet = petById(run?.pet || 'none');
  const wList = (player?.weapons || []).map((w) => `<span style="color:${RARITY[w.rarity].css}">${weaponName(w)}</span> ${weaponIcons(w)}`).join(' · ');

  return `<div class="run-summary-box">
    <div class="rs-head">
      <span><b>${ch.name}</b>${pet.id !== 'none' ? ` · Bạn đồng hành: <b>${pet.name}</b>` : ''}</span>
      <span class="rs-total">Tổng sát thương: <b>${Math.round(total).toLocaleString('vi-VN')}</b></span>
    </div>
    <div class="rs-weapons">${wList || 'Không có vũ khí'}</div>
    ${setBadges}
    <div class="rs-bars">${bars}</div>
  </div>`;
}
