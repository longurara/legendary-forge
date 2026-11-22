// Nhạc nền đổi theo trạng thái: 'calm' (nghỉ), 'battle' (đánh nhau), 'boss'
// Nhạc CC0 từ OpenGameArt (xem public/music/CREDITS.txt)
import { getVolume, isMuted } from './audio.js';

const TRACKS = { calm: '/music/calm.ogg', battle: '/music/battle.ogg', boss: '/music/boss.ogg' };
const BASE = { calm: 0.5, battle: 0.32, boss: 0.38 };
const els = {};
let current = null;
let unlocked = false;

function el(name) {
  if (!els[name]) {
    const a = new Audio(TRACKS[name]);
    a.loop = true;
    a.volume = 0;
    a.preload = 'auto';
    els[name] = { a, vol: 0 };
  }
  return els[name];
}

export function unlockMusic() {
  if (unlocked) return;
  unlocked = true;
  if (current) el(current).a.play().catch(() => {});
}

export function setMusic(name) {
  if (current === name) return;
  current = name;
  if (name && unlocked) el(name).a.play().catch(() => {});
}

// Chuyển nhạc mượt (gọi mỗi khung hình)
export function updateMusic(dt) {
  const master = isMuted() ? 0 : getVolume();
  for (const [name, t] of Object.entries(els)) {
    const target = name === current ? BASE[name] * master : 0;
    t.vol += (target - t.vol) * Math.min(1, dt * 1.5);
    if (Math.abs(t.vol - target) < 0.002) t.vol = target;
    t.a.volume = Math.max(0, Math.min(1, t.vol));
    if (t.vol === 0 && name !== current && !t.a.paused) t.a.pause();
  }
}
