// Âm thanh: Web Audio API. Âm lấy từ các gói CC0 (xem public/sfx/CREDITS.txt).
// play('swing') chọn ngẫu nhiên 1 biến thể, đổi cao độ nhẹ, xoay trái/phải theo vị trí.

const SOUNDS = {
  // chiến đấu
  swing: { files: ['blade_01', 'blade_02', 'blade_03'], vol: 0.55, vary: 0.1 },
  hit: { files: ['hit_01', 'hit_02'], vol: 0.6, vary: 0.12, gap: 0.03 },
  hitHeavy: { files: ['slam_04', 'slam_05'], vol: 0.75, vary: 0.08 },
  slimeHit: { files: ['creature_slime_01', 'creature_slime_03'], vol: 0.45, vary: 0.15, gap: 0.05 },
  slimeDie: { files: ['plop_01', 'plop_02'], vol: 0.7, vary: 0.15 },
  slimeLand: { files: ['plop_02'], vol: 0.18, vary: 0.2, gap: 0.08 },
  bigLand: { files: ['slam_03'], vol: 0.28, vary: 0.1, gap: 0.35 },
  mageHurt: { files: ['creature_monster_01', 'creature_monster_02'], vol: 0.5, vary: 0.1, gap: 0.08 },
  mageDie: { files: ['creature_roar_01'], vol: 0.55, vary: 0.08 },
  mageCast: { files: ['spell_01'], vol: 0.4, vary: 0.08 },
  mageSpawn: { files: ['stones_04'], vol: 0.45, vary: 0.1 },
  cast: { files: ['spell_02'], vol: 0.4, vary: 0.12, gap: 0.05 },
  zap: { files: ['other_06'], vol: 0.45, vary: 0.15, gap: 0.06 },
  freeze: { files: ['glass_01'], vol: 0.55, vary: 0.1 },
  ignite: { files: ['spell_fire_07'], vol: 1.6, vary: 0.1, gap: 0.15 },
  explode: { files: ['explosion'], vol: 0.85, vary: 0.08 },
  playerHurt: { prio: true, files: ['hit_03'], vol: 0.8, vary: 0.06 },
  playerDie: { prio: true, files: ['gong_02'], vol: 0.7, rate: 0.6, vary: 0 },
  dash: { files: ['rpg_cloth2', 'rpg_cloth1'], vol: 0.7, vary: 0.1 },
  step: { files: ['rpg_footstep00', 'rpg_footstep01', 'rpg_footstep02', 'rpg_footstep03'], vol: 0.22, vary: 0.1 },
  // đồ đạc
  swap: { files: ['rpg_beltHandle1'], vol: 0.55, vary: 0.05 },
  pickup: { files: ['rpg_metalLatch'], vol: 0.55, vary: 0.05 },
  drop: { files: ['item_gem_01'], vol: 0.45, vary: 0.08 },
  dropRare: { files: ['item_gem_04'], vol: 0.55, vary: 0.04 },
  heal: { files: ['item_gem_02'], vol: 0.4, vary: 0.05 },
  hammer: { prio: true, files: ['metal_07', 'metal_08', 'metal_09'], vol: 0.7, vary: 0.05 },
  forged: { prio: true, files: ['bell_02'], vol: 0.7, vary: 0 },
  anvil: { prio: true, files: ['gong_02'], vol: 0.6, vary: 0 },
  waveStart: { prio: true, files: ['gong_01'], vol: 0.45, vary: 0 },
  waveClear: { prio: true, files: ['bell_01'], vol: 0.4, vary: 0 },
  // giao diện
  uiHover: { files: ['ui_select_002'], vol: 0.25, vary: 0.03, gap: 0.04 },
  uiClick: { prio: true, files: ['ui_click_001'], vol: 0.5, vary: 0.03 },
  uiConfirm: { prio: true, files: ['ui_confirmation_001'], vol: 0.5, vary: 0 },
  uiOpen: { prio: true, files: ['ui_open_001'], vol: 0.45, vary: 0 },
  uiClose: { prio: true, files: ['ui_close_001'], vol: 0.45, vary: 0 },
  uiBack: { prio: true, files: ['ui_back_001'], vol: 0.45, vary: 0 },
};

let ctx = null;
let master = null;
const buffers = {};
const lastPlayed = {};
const listener = { x: 0, z: 0 };
let volume = Number(localStorage.getItem('lorenh_volume') ?? 0.8);
let muted = localStorage.getItem('lorenh_muted') === '1';
let active = 0;
export const sfxStats = {};          // đếm số lần phát (để kiểm tra)
window.__sfx = { stats: sfxStats, buffers, get state() { return ctx && ctx.state; } };
const MAX_VOICES = 32;

function ensureContext() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.connect(ctx.destination);
  applyVolume();
}

function applyVolume() {
  if (master) master.gain.value = muted ? 0 : volume;
}

export async function loadSounds() {
  ensureContext();
  const files = new Set(Object.values(SOUNDS).flatMap((s) => s.files));
  await Promise.all([...files].map(async (f) => {
    try {
      const res = await fetch(`/sfx/${f}.ogg`);
      buffers[f] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      console.warn('[audio] không nạp được', f, err);
    }
  }));
}

// Trình duyệt chỉ cho phát âm sau khi người chơi bấm/gõ phím
export function unlockAudio() {
  ensureContext();
  if (ctx.state === 'suspended') ctx.resume();
}

export function setListener(pos) { listener.x = pos.x; listener.z = pos.z; }

export function play(name, opts = {}) {
  const s = SOUNDS[name];
  if (!s || !ctx || muted || ctx.state !== 'running') return;
  if (active >= MAX_VOICES && !s.prio) return;            // âm quan trọng luôn được phát
  const now = ctx.currentTime;
  if (s.gap && lastPlayed[name] && now - lastPlayed[name] < s.gap) return;   // tránh chồng âm
  lastPlayed[name] = now;
  const buf = buffers[s.files[Math.floor(Math.random() * s.files.length)]];
  if (!buf) return;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (opts.rate ?? s.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (s.vary ?? 0));
  const gain = ctx.createGain();
  let vol = s.vol * (opts.vol ?? 1);
  let node = src;
  if (opts.at) {
    // Âm ở xa nhỏ hơn và lệch trái/phải theo vị trí so với nhân vật
    const dx = opts.at.x - listener.x, dz = opts.at.z - listener.z;
    vol *= Math.max(0.25, 1 - Math.hypot(dx, dz) / 26);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-0.8, Math.min(0.8, dx / 12));
      node.connect(pan);
      node = pan;
    }
  }
  gain.gain.value = vol;
  node.connect(gain).connect(master);
  active++;
  src.onended = () => { active--; };
  src.start();
  sfxStats[name] = (sfxStats[name] || 0) + 1;
}

export function getVolume() { return volume; }
export function isMuted() { return muted; }
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  localStorage.setItem('lorenh_volume', String(volume));
  applyVolume();
}
export function setMuted(m) {
  muted = m;
  localStorage.setItem('lorenh_muted', m ? '1' : '0');
  applyVolume();
}
