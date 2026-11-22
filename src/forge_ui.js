// Xưởng Đe Rèn Tương Tác (Cơ chế #2 & #3 & #6):
// 1. Rèn 3 Khuôn (Hợp Nhất / Ghép Chiêu / Biến Hình) + Rèn Lõi Boss + Rèn Hắc Ám (+Tha Hóa)
// 2. Tôi Quá Tải (Minigame căn nhịp búa đánh cược -> Kiệt Tác hoặc Hắc Hóa)
// 3. Mạch Cổ Ngữ Lập Trình (Sắp xếp thứ tự Trigger -> Modifier -> Payload)
// 4. Cường Hóa, Bồi Lửa & Thanh Tẩy Lời Nguyền
import {
  forgeWeapons, graftWeapons, twinForgeWeapons, makeBossWeapon, applyRecipe,
  weaponName, weaponIcons, socketsOf, RARITY, TYPES, MAX_PLUS, enhanceCost,
  MASTERWORKS, MASTERWORK_KEYS, CORRUPT_TRAITS, CORRUPT_KEYS,
} from './weapons.js';
import { RUNES, BOSS_CORES, describeCircuit, attachAwakening } from './runes.js';
import { flameState, addFlame, addCorruption, purgeCurse, hasDynCurse } from './corruption.js';
import { weaponIcon, $, show } from './ui.js';
import { SPECIALS } from './player.js';
import { play } from './audio.js';

let api = null;
let darkForgeOn = false;
let temperState = null; // { running, pos, dir, speed, sweetStart, sweetEnd, raf }
let activeTab = 'forge';

export function initForgeUI(hooks) {
  api = hooks;
  const closeBtn = $('btn-anvil-close');
  if (closeBtn) closeBtn.onclick = closeAnvilModal;
  addEventListener('keydown', (e) => {
    if (!isAnvilOpen()) return;
    if (e.code === 'Space' && temperState?.running) {
      e.preventDefault();
      strikeTemperHammer();
    }
  });
}

export function isAnvilOpen() {
  const el = $('anvil-modal');
  return !!el && !el.classList.contains('hidden');
}

export function openAnvilModal(defaultTab = null) {
  if (!api) return;
  darkForgeOn = false;
  stopTemper();
  if (defaultTab) activeTab = defaultTab;
  else {
    const canCombine = api.canForge() && api.player.weapons.length >= 2;
    activeTab = canCombine || api.getBossCores().length ? 'forge' : 'runes';
  }
  renderAnvilModal();
  show('anvil-modal', true);
  api.setMode('menu');
  play('uiOpen');
}

export function closeAnvilModal() {
  stopTemper();
  show('anvil-modal', false);
  api?.setMode('playing');
  api?.refreshHud();
  play('uiClose');
}

function stopTemper() {
  if (temperState?.raf) cancelAnimationFrame(temperState.raf);
  temperState = null;
}

function renderAnvilModal() {
  if (!api) return;
  const { player } = api;
  const w = player.weapon;
  const w2 = player.weapons.length > 1 ? player.weapons[1 - player.slot] : null;
  const scrap = api.getScrap();
  const cores = api.getBossCores();
  const runeBag = api.getRuneBag();

  $('anvil-scrap').textContent = scrap;
  $('anvil-flame').textContent = Math.round(flameState.flame);
  $('anvil-corr').textContent = Math.round(flameState.corruption);

  // Thanh tab
  const tabs = [
    { id: 'forge', label: 'Rèn 3 Khuôn', badge: (api.canForge() && w2) || cores.length ? '!' : '' },
    { id: 'temper', label: 'Tôi Quá Tải', badge: '' },
    { id: 'runes', label: 'Mạch Cổ Ngữ', badge: runeBag.length ? String(runeBag.length) : '' },
    { id: 'flame', label: 'Cường Hóa & Lửa', badge: flameState.curses.length ? String(flameState.curses.length) : '' },
  ];
  const swapBtn = w2 ? `<button class="anvil-tab swap-slot" id="btn-anvil-swap" title="Đổi vũ khí đang chọn để tôi/khảm cổ ngữ">⇄ Đang chọn: ${weaponName(w)}</button>` : '';
  $('anvil-tabs').innerHTML = tabs.map((t) =>
    `<button class="anvil-tab${activeTab === t.id ? ' on' : ''}" data-tab="${t.id}">${t.label}${t.badge && activeTab !== t.id ? ` <em>${t.badge}</em>` : ''}</button>`
  ).join('') + swapBtn;
  for (const b of $('anvil-tabs').querySelectorAll('[data-tab]')) {
    b.onclick = () => { stopTemper(); activeTab = b.dataset.tab; play('uiClick'); renderAnvilModal(); };
  }
  const sb = $('btn-anvil-swap');
  if (sb) sb.onclick = () => { stopTemper(); player.equip(1 - player.slot); play('swap'); renderAnvilModal(); };

  const body = $('anvil-body');
  if (activeTab === 'forge') renderForgeTab(body, w, w2, cores);
  else if (activeTab === 'temper') renderTemperTab(body, w, scrap);
  else if (activeTab === 'runes') renderRunesTab(body, w, runeBag);
  else renderFlameTab(body, w, w2, scrap);
}

// ---------- TAB 1: Rèn 3 Khuôn + Lõi Boss ----------
function renderForgeTab(body, w, w2, cores) {
  const { player } = api;
  const canForge = api.canForge();
  const extraAff = (player.hasRelic('gauntlet') ? 1 : 0) + (hasDynCurse('dark_forge') ? 1 : 0) + (darkForgeOn ? 1 : 0);

  let html = '';
  // Rèn Lõi Boss dạng thanh ngang gọn để không đẩy 3 Khuôn Rèn xuống dưới
  if (cores.length) {
    html += `<div class="anvil-sec core-sec"><h4><i class="ico" style="--i:url('/ui/icons/x_sword-stone.svg');color:#ffcf4a"></i> Rèn Lõi Boss Độc Quyền</h4><div class="core-list">`;
    cores.forEach((coreId, idx) => {
      const c = BOSS_CORES[coreId];
      if (!c) return;
      const preview = makeBossWeapon(w, c);
      html += `<div class="boss-core-row">
        <img src="${weaponIcon(preview)}" alt="">
        <div class="bcr-info"><h5 style="color:${c.color}">${c.title} <small class="muted">· ${c.name} (${c.boss})</small></h5><p>${c.text}</p></div>
        <button class="btn primary small-btn" data-core="${idx}">Rèn Vũ Khí Boss</button>
      </div>`;
    });
    html += `</div></div>`;
  }

  // Rèn 2 vũ khí với 3 Khuôn
  html += `<div class="anvil-sec"><h4><i class="ico ico-anvil"></i> Chọn Khuôn Rèn (2 Vũ Khí)</h4>`;
  if (!w2) {
    html += `<p class="muted small">Cần cầm <b>2 vũ khí</b> để rèn ghép. Bạn vẫn có thể dùng tab <b>Tôi Quá Tải</b>, <b>Mạch Cổ Ngữ</b> hoặc <b>Cường Hóa</b> ngay bây giờ.</p>`;
  } else if (!canForge && !darkForgeOn) {
    html += `<p class="muted small">Đe đã dùng hết lượt rèn thường. Bạn có thể bật <b>Rèn Hắc Ám (+30 Tha Hóa)</b> bên dưới để ép rèn thêm 1 lần!</p>`;
  }

  if (w2) {
    const pStd = forgeWeapons(w, w2, extraAff);
    const rec = applyRecipe(pStd, w, w2);
    const pGraft = graftWeapons(w, w2, extraAff);
    const pTwin = twinForgeWeapons(w, w2, extraAff);
    const spB = SPECIALS[pGraft.specialType || w2.type];
    const disabled = !canForge && !darkForgeOn ? 'disabled' : '';

    html += `<label class="dark-toggle"><input type="checkbox" id="chk-darkforge" ${darkForgeOn ? 'checked' : ''}>
      <span><b style="color:#c88aff">Rèn Bằng Bóng Đêm (+30 Tha Hóa)</b> · Thêm +1 phụ tố và không tiêu tốn lượt dùng đe</span></label>`;

    html += `<div class="mold-grid">
      <div class="mold-card${rec ? ' legend' : ''}">
        <div class="mc-head"><img src="${weaponIcon(pStd)}" alt=""><div>
          <span class="mc-tag">Khuôn 1 · Hợp Nhất</span>
          <h5 style="color:${RARITY[pStd.rarity].css}">${weaponName(pStd)} ${weaponIcons(pStd)}</h5>
        </div></div>
        <p>${rec ? `<b style="color:#ffcf4a">★ Công thức: ${rec.title}</b> — ${rec.text}` : `Tăng bậc thành <b>${RARITY[pStd.rarity].name}</b>, gộp nguyên tố, phụ tố và cổ ngữ của cả hai vũ khí.`}</p>
        <button class="btn primary small-btn" data-mold="std" ${disabled}>Rèn Hợp Nhất</button>
      </div>
      <div class="mold-card">
        <div class="mc-head"><img src="${weaponIcon(pGraft)}" alt=""><div>
          <span class="mc-tag graft">Khuôn 2 · Ghép Chiêu</span>
          <h5 style="color:${RARITY[pGraft.rarity].css}">${weaponName(pGraft)} ${weaponIcons(pGraft)}</h5>
        </div></div>
        <p>Giữ đòn đánh thường của <b>${TYPES[w.type].name}</b>, nhưng chuột phải đổi thành <b>${spB.name}</b> (${TYPES[pGraft.specialType].name}) +15% sát thương kỹ năng!</p>
        <button class="btn primary small-btn" data-mold="graft" ${disabled}>Rèn Ghép Chiêu</button>
      </div>
      <div class="mold-card">
        <div class="mc-head"><img src="${weaponIcon(pTwin)}" alt=""><div>
          <span class="mc-tag twin">Khuôn 3 · Biến Hình</span>
          <h5 style="color:${RARITY[pTwin.rarity].css}">${weaponName(pTwin)} ${weaponIcons(pTwin)}</h5>
        </div></div>
        <p>Vũ khí Song Dạng (<b>${TYPES[w.type].name} ⇄ ${TYPES[w2.type].name}</b>). Nhấn <b>Q</b> biến hình tức thì giữa combo, tung <b>Đòn Biến Hình</b> kích phản ứng 2 dạng!</p>
        <button class="btn primary small-btn" data-mold="twin" ${disabled}>Rèn Biến Hình</button>
      </div>
    </div>`;
  }
  html += `</div>`;
  body.innerHTML = html;

  const chk = $('chk-darkforge');
  if (chk) chk.onchange = () => { darkForgeOn = chk.checked; play('uiClick'); renderAnvilModal(); };

  for (const b of body.querySelectorAll('[data-mold]')) {
    b.onclick = () => {
      const mode = b.dataset.mold;
      const useDark = darkForgeOn;
      if (useDark) addCorruption(30, player.pos, api.scene);
      const ex = (player.hasRelic('gauntlet') ? 1 : 0) + (hasDynCurse('dark_forge') ? 1 : 0) + (useDark ? 1 : 0);
      const res = mode === 'graft' ? graftWeapons(w, w2, ex) : mode === 'twin' ? twinForgeWeapons(w, w2, ex) : forgeWeapons(w, w2, ex);
      const rec = mode === 'std' ? applyRecipe(res, w, w2) : null;
      attachAwakening(res);
      closeAnvilModal();
      api.performAnvilForge(res, { consumeUse: !useDark, recipe: rec, mode });
    };
  }
  for (const b of body.querySelectorAll('[data-core]')) {
    b.onclick = () => {
      const idx = Number(b.dataset.core);
      const coreId = api.consumeBossCore(idx);
      const core = BOSS_CORES[coreId];
      if (!core) return;
      const res = makeBossWeapon(w, core);
      attachAwakening(res);
      closeAnvilModal();
      api.performAnvilForge(res, { consumeUse: false, bossCore: core, mode: 'core' });
    };
  }
}

// ---------- TAB 2: Tôi Quá Tải (Push-Your-Luck Hammer Rhythm) ----------
function renderTemperTab(body, w, scrap) {
  const count = w.temperCount || 0;
  const cost = 3 + count * 2;
  const risk = [15, 35, 60][count] ?? 60;
  const sweetW = [26, 20, 14][count] ?? 14;
  const canTry = !w.corrupted && count < 3;
  const mwList = (w.masterworks || []).map((id) => `<span class="mw-pill">✦ ${MASTERWORKS[id]?.name}: ${MASTERWORKS[id]?.text}</span>`).join('');
  const corrBox = w.corrupted ? `<div class="corr-pill">☠ ${CORRUPT_TRAITS[w.corrupted]?.name} — ${CORRUPT_TRAITS[w.corrupted]?.text} (đã khóa cường hóa/tôi)</div>` : '';

  body.innerHTML = `<div class="anvil-sec temper-wrap">
    <div class="mc-head" style="justify-content:center"><img src="${weaponIcon(w)}" alt=""><div>
      <h5 style="color:${RARITY[w.rarity].css}">${weaponName(w)} ${weaponIcons(w)}</h5>
      <small>Đã Tôi Quá Tải: <b>${count} / 3</b> · Vùng Vàng: <b>${sweetW}%</b> · Rủi ro Hắc Hóa nếu hụt: <b style="color:#ff7a6a">${risk}%</b></small>
    </div></div>
    ${mwList ? `<div class="mw-list">${mwList}</div>` : ''}
    ${corrBox}
    <p class="muted small">Đập búa đúng lúc con trỏ nằm trong <b>vùng vàng</b> để rèn thêm <b>Ẩn Tính Kiệt Tác</b>. Đập trượt có thể làm nứt lưỡi thành <b>Vũ Khí Hắc Hóa</b> (+35% sát thương nhưng gánh ám khí!).</p>
    <div class="temper-bar-wrap">
      <div class="temper-bar" id="temper-bar">
        <div class="temper-sweet" id="temper-sweet" style="left:${50 - sweetW / 2}%;width:${sweetW}%"></div>
        <div class="temper-cursor" id="temper-cursor" style="left:5%"></div>
      </div>
    </div>
    <div id="temper-msg" class="temper-msg"></div>
    <div class="btn-row center" style="margin-top:8px">
      ${canTry
        ? `<button id="btn-temper-scrap" class="btn primary small-btn" ${scrap < cost ? 'disabled' : ''}>Nung &amp; Tôi (${cost} <i class="ico ico-scrap"></i>)</button>
           <button id="btn-temper-dark" class="btn small-btn dark-btn">Tôi Hắc Ám (+20 Tha Hóa)</button>
           <button id="btn-temper-hit" class="btn primary small-btn hidden">ĐẬP BÚA! (Space)</button>`
        : `<span class="muted">${w.corrupted ? 'Vũ khí đã Hắc Hóa — không thể tôi tiếp.' : 'Đã đạt giới hạn 3 lần Tôi Quá Tải.'}</span>`}
    </div>
  </div>`;

  const startMinigame = (useDark) => {
    if (!canTry) return;
    if (useDark) addCorruption(20, api.player.pos, api.scene);
    else api.addScrap(-cost);
    $('anvil-scrap').textContent = api.getScrap();
    $('anvil-corr').textContent = Math.round(flameState.corruption);
    $('btn-temper-scrap').classList.add('hidden');
    $('btn-temper-dark').classList.add('hidden');
    $('btn-temper-hit').classList.remove('hidden');
    $('temper-msg').textContent = 'Căn đúng vùng vàng và nhấn ĐẬP BÚA hoặc Space!';
    play('anvil', { rate: 1.1 });

    const sweetStart = 50 - sweetW / 2;
    const sweetEnd = 50 + sweetW / 2;
    temperState = {
      running: true, pos: 6, dir: 1, speed: 95 + count * 38,
      sweetStart, sweetEnd, last: performance.now(), risk,
    };
    const step = (now) => {
      if (!temperState?.running) return;
      const dt = Math.min(0.05, (now - temperState.last) / 1000);
      temperState.last = now;
      temperState.pos += temperState.dir * temperState.speed * dt;
      if (temperState.pos >= 96) { temperState.pos = 96; temperState.dir = -1; }
      if (temperState.pos <= 4) { temperState.pos = 4; temperState.dir = 1; }
      const cur = $('temper-cursor');
      if (cur) cur.style.left = temperState.pos + '%';
      temperState.raf = requestAnimationFrame(step);
    };
    temperState.raf = requestAnimationFrame(step);
  };

  if ($('btn-temper-scrap')) $('btn-temper-scrap').onclick = () => startMinigame(false);
  if ($('btn-temper-dark')) $('btn-temper-dark').onclick = () => startMinigame(true);
  if ($('btn-temper-hit')) $('btn-temper-hit').onclick = strikeTemperHammer;
}

function strikeTemperHammer() {
  if (!temperState?.running || !api) return;
  const st = temperState;
  stopTemper();
  const w = api.player.weapon;
  w.temperCount = (w.temperCount || 0) + 1;
  const perfect = st.pos >= st.sweetStart && st.pos <= st.sweetEnd;
  play('hammer', { rate: perfect ? 1.25 : 0.7 });

  if (perfect) {
    const avail = MASTERWORK_KEYS.filter((k) => !(w.masterworks || []).includes(k));
    const pick = avail[Math.floor(Math.random() * avail.length)] || MASTERWORK_KEYS[0];
    w.masterworks = [...(w.masterworks || []), pick];
    api.player.recalc();
    api.refreshHud();
    play('forged');
    api.toast('anvil', 'Đập Hoàn Hảo! ' + MASTERWORKS[pick].name, MASTERWORKS[pick].text);
  } else {
    // Hụt vùng vàng: tỷ lệ nứt thành Hắc Hóa (nếu thoát nứt thì vẫn +4% dmg nhẹ bằng tăng +1 nếu chưa max)
    const cracked = Math.random() * 100 < st.risk + 35;
    if (cracked) {
      const trait = CORRUPT_KEYS[Math.floor(Math.random() * CORRUPT_KEYS.length)];
      w.corrupted = trait;
      api.player.recalc();
      api.player.equip(api.player.slot);
      api.refreshHud();
      play('explode', { vol: 0.6, rate: 0.8 });
      api.toast('x_cursed', CORRUPT_TRAITS[trait].name, CORRUPT_TRAITS[trait].text);
    } else {
      api.toast('x_sword-break', 'Đập lệch nhịp!', 'May mắn lưỡi thép không nứt, nhưng mất lượt tôi.');
    }
  }
  renderAnvilModal();
}

// ---------- TAB 3: Mạch Cổ Ngữ Lập Trình ----------
function renderRunesTab(body, w, runeBag) {
  const maxS = socketsOf(w);
  w.runes = w.runes || [];
  const kindLabel = { trigger: 'Kích Hoạt', mod: 'Biến Đổi', payload: 'Hiệu Ứng' };

  const slotsHtml = Array.from({ length: maxS }, (_, i) => {
    const id = w.runes[i];
    const r = id ? RUNES[id] : null;
    const arrow = i < maxS - 1 ? '<span class="rune-arrow">→</span>' : '';
    if (!r) return `<div class="rune-slot empty"><span>Ô ${i + 1}</span><small>Trống</small></div>${arrow}`;
    return `<div class="rune-slot filled k-${r.kind}" style="border-color:${r.color}">
      <div class="rs-top"><span class="rs-kind">${kindLabel[r.kind]}</span>
        <div class="rs-ops">
          ${i > 0 ? `<button data-move="${i}:-1" title="Sang trái">◀</button>` : ''}
          ${i < w.runes.length - 1 ? `<button data-move="${i}:1" title="Sang phải">▶</button>` : ''}
          <button data-remove="${i}" title="Tháo ra túi">×</button>
        </div>
      </div>
      <i class="ico" style="--i:url('/ui/icons/${r.icon}.svg');color:${r.color}"></i>
      <b>${r.name}</b>
      <small>${r.desc}</small>
    </div>${arrow}`;
  }).join('');

  const bagHtml = runeBag.length
    ? runeBag.map((id, idx) => {
      const r = RUNES[id];
      if (!r) return '';
      return `<button class="rune-bag-item k-${r.kind}" data-equip="${idx}" ${w.runes.length >= maxS ? 'disabled' : ''} style="border-color:${r.color}">
        <i class="ico" style="--i:url('/ui/icons/${r.icon}.svg');color:${r.color}"></i>
        <div><b>${r.name}</b> <span class="rb-kind">${kindLabel[r.kind]}</span><small>${r.desc}</small></div>
      </button>`;
    }).join('')
    : '<p class="muted small">Túi Cổ Ngữ đang trống. Hạ quái tinh anh, Thủ Lĩnh, phá Mỏ Neo Boss hoặc cắt chiêu để thu thập Cổ Ngữ!</p>';

  body.innerHTML = `<div class="anvil-sec">
    <h4><i class="ico" style="--i:url('/ui/icons/x_rune.svg');color:#d8b4ff"></i> Mạch Cổ Ngữ trên <span style="color:${RARITY[w.rarity].css}">${weaponName(w)}</span> (${w.runes.length}/${maxS} ô)</h4>
    <div class="circuit-summary"><b>Mạch hoạt động:</b> ${describeCircuit(w.runes)}</div>
    <div class="rune-chain">${slotsHtml}</div>
    <p class="muted small" style="margin:6px 0">Mẹo: Đặt theo thứ tự <b>[Kích Hoạt] → [Biến Đổi] → [Hiệu Ứng]</b> để nối thành chuỗi sức mạnh!</p>
    <h4 style="margin-top:10px">Túi Cổ Ngữ (bấm để lắp vào vũ khí)</h4>
    <div class="rune-bag">${bagHtml}</div>
  </div>`;

  for (const b of body.querySelectorAll('[data-equip]')) {
    b.onclick = () => {
      if (w.runes.length >= maxS) return;
      const idx = Number(b.dataset.equip);
      const id = api.takeRuneFromBag(idx);
      if (id) { w.runes.push(id); play('pickup'); api.refreshHud(); renderAnvilModal(); }
    };
  }
  for (const b of body.querySelectorAll('[data-remove]')) {
    b.onclick = () => {
      const i = Number(b.dataset.remove);
      const [id] = w.runes.splice(i, 1);
      if (id) api.returnRuneToBag(id);
      play('uiBack'); api.refreshHud(); renderAnvilModal();
    };
  }
  for (const b of body.querySelectorAll('[data-move]')) {
    b.onclick = () => {
      const [i, dir] = b.dataset.move.split(':').map(Number);
      const j = i + dir;
      if (j < 0 || j >= w.runes.length) return;
      [w.runes[i], w.runes[j]] = [w.runes[j], w.runes[i]];
      play('uiClick'); api.refreshHud(); renderAnvilModal();
    };
  }
}

// ---------- TAB 4: Cường Hóa, Bồi Lửa & Thanh Tẩy ----------
function renderFlameTab(body, w, w2, scrap) {
  const canPlus = !w.corrupted && (w.plus || 0) < MAX_PLUS;
  const cost = canPlus ? api.getEnhanceCost(w) : 0;
  const cursesHtml = flameState.curses.length
    ? flameState.curses.map((id) => `<span class="curse-chip">☠ ${api.dynCurseName(id)}</span>`).join('')
    : '<span class="muted small">Không có Lời Nguyền Năng Động nào.</span>';

  body.innerHTML = `<div class="anvil-sec flame-grid">
    <div class="mold-card">
      <h5>Cường Hóa Vũ Khí (${w.plus ? '+' + w.plus : '+0'} / +${MAX_PLUS})</h5>
      <p>${w.corrupted ? 'Vũ khí đã Hắc Hóa — không thể cường hóa.' : canPlus ? `Tăng lên <b>+${(w.plus || 0) + 1}</b> (+12% sát thương).` : 'Đã đạt cường hóa tối đa.'}</p>
      <div class="btn-row">
        <button id="btn-enh-scrap" class="btn primary small-btn" ${!canPlus || scrap < cost ? 'disabled' : ''}>Cường hóa (${cost} <i class="ico ico-scrap"></i>)</button>
        <button id="btn-enh-dark" class="btn small-btn dark-btn" ${!canPlus ? 'disabled' : ''}>Bóng Đêm (+25 Tha Hóa)</button>
      </div>
    </div>
    <div class="mold-card">
      <h5>Bồi Ánh Lửa &amp; Thanh Tẩy Lời Nguyền</h5>
      <p>Ánh Lửa: <b style="color:#ffaa4a">${Math.round(flameState.flame)}/100</b> · Tha Hóa: <b style="color:#c080ff">${Math.round(flameState.corruption)}/100</b></p>
      <div class="curse-chips">${cursesHtml}</div>
      <div class="btn-row" style="margin-top:8px">
        <button id="btn-kindle-scrap" class="btn small-btn" ${scrap < 4 ? 'disabled' : ''}>Bồi Lửa +35 (4<i class="ico ico-scrap"></i>)</button>
        <button id="btn-sac-weapon" class="btn primary small-btn" ${!w2 ? 'disabled' : ''}>Hiến Vũ Khí Phụ (+45 Lửa${w2 && w2.rarity >= 1 ? ' · Thanh Tẩy' : ''})</button>
      </div>
    </div>
  </div>`;

  if ($('btn-enh-scrap')) $('btn-enh-scrap').onclick = () => {
    if (!canPlus || scrap < cost) return;
    api.addScrap(-cost);
    w.plus = (w.plus || 0) + 1;
    api.player.recalc(); api.refreshHud();
    play('hammer', { rate: 1.2 }); play('forged', { vol: 0.5 });
    renderAnvilModal();
  };
  if ($('btn-enh-dark')) $('btn-enh-dark').onclick = () => {
    if (!canPlus) return;
    addCorruption(25, api.player.pos, api.scene);
    w.plus = (w.plus || 0) + 1;
    api.player.recalc(); api.refreshHud();
    play('hammer', { rate: 0.9 });
    renderAnvilModal();
  };
  if ($('btn-kindle-scrap')) $('btn-kindle-scrap').onclick = () => {
    if (scrap < 4) return;
    api.addScrap(-4);
    addFlame(35);
    play('ignite');
    api.refreshHud();
    renderAnvilModal();
  };
  if ($('btn-sac-weapon')) $('btn-sac-weapon').onclick = () => {
    if (!w2) return;
    const isRare = w2.rarity >= 1;
    api.player.weapons.splice(1 - api.player.slot, 1);
    api.player.slot = 0;
    addFlame(45);
    if (isRare) purgeCurse(api.player.pos, api.scene);
    api.player.recalc();
    api.refreshHud();
    play('forged');
    renderAnvilModal();
  };
}
