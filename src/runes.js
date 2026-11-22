// Mạch Cổ Ngữ Lập Trình (Trigger -> Modifier -> Payload), Lõi Boss, và Vũ Khí Thức Tỉnh
import * as THREE from 'three';
import { ctx, dealDamage, aoe, spawnSwordWave, spawnOrb, scheduleBomb } from './combat.js';
import { spawnRing, spawnBolt, burst, flash, damageNumber, emit, F, addShake } from './fx.js';
import { play } from './audio.js';

// ---------- Danh mục Cổ Ngữ ----------
// kind: 'trigger' (Kích hoạt) | 'mod' (Biến đổi) | 'payload' (Hiệu ứng)
export const RUNES = {
  // Triggers
  t_crit: { id: 't_crit', kind: 'trigger', event: 'crit', cd: 0.6, name: 'Ấn Chí Mạng', short: 'Chí mạng', color: '#ffcf4a', icon: 'p_crit', desc: 'Kích hoạt mạch khi gây chí mạng' },
  t_dodge: { id: 't_dodge', kind: 'trigger', event: 'dodge', cd: 0.5, name: 'Ấn Né Đòn', short: 'Né / Đỡ', color: '#7fdcff', icon: 'dash', desc: 'Kích hoạt mạch khi Né Hoàn Hảo, Đỡ Đòn hoặc Phản Xuyên' },
  t_kill: { id: 't_kill', kind: 'trigger', event: 'kill', cd: 0.45, name: 'Ấn Kết Liễu', short: 'Hạ quái', color: '#ff6a6a', icon: 'x_skull-signet', desc: 'Kích hoạt mạch khi hạ gục hoặc Kết Liễu quái' },
  t_react: { id: 't_react', kind: 'trigger', event: 'react', cd: 0.65, name: 'Ấn Phản Ứng', short: 'Phản ứng', color: '#ffa84a', icon: 'x_fire-bowl', desc: 'Kích hoạt mạch khi gây phản ứng nguyên tố' },
  t_fourth: { id: 't_fourth', kind: 'trigger', event: 'fourth', cd: 0.4, name: 'Ấn Nhịp Bốn', short: 'Đòn thứ 4', color: '#d8b4ff', icon: 'x_rune', desc: 'Kích hoạt mạch mỗi đòn trúng thứ 4' },
  t_quench: { id: 't_quench', kind: 'trigger', event: 'quench', cd: 0.5, name: 'Ấn Tôi Lửa', short: 'Tôi / Đổi', color: '#ff8a3a', icon: 'anvil', desc: 'Kích hoạt mạch khi Tôi Vũ Khí hoặc Đòn Biến Hình' },

  // Modifiers
  m_split: { id: 'm_split', kind: 'mod', name: 'Mạch Tam Phân', short: '×3 Hướng', color: '#9fe8d0', icon: 'x_arrows', desc: 'Nhân 3 hướng (mỗi tia 65% sát thương)' },
  m_wide: { id: 'm_wide', kind: 'mod', name: 'Mạch Khuếch Đại', short: '+65% Tầm', color: '#8fe0ff', icon: 'p_range', desc: 'Tăng 65% bán kính & độ lớn hiệu ứng' },
  m_delay: { id: 'm_delay', kind: 'mod', name: 'Mạch Tích Nổ', short: 'Trễ +85%', color: '#ff9050', icon: 'x_stopwatch', desc: 'Trễ 0.85s nhưng tăng +85% sát thương' },
  m_pull: { id: 'm_pull', kind: 'mod', name: 'Mạch Hút Tâm', short: 'Hút quái', color: '#c77dff', icon: 'p_magnet', desc: 'Kéo quái xung quanh tụ về tâm hiệu ứng' },
  m_trap: { id: 'm_trap', kind: 'mod', name: 'Mạch Bẫy Sàn', short: 'Bẫy 4s', color: '#9fff5a', icon: 'x_spikes', desc: 'Tạo bẫy cổ ngữ trên sàn kích nổ thêm lần nữa sau 1.4s' },

  // Payloads
  p_wave: { id: 'p_wave', kind: 'payload', name: 'Cổ Ngữ Sóng Kiếm', short: 'Sóng Kiếm', color: '#ffe8a0', icon: 'x_energy-sword', desc: 'Phóng sóng kiếm xuyên quái theo hướng ngắm' },
  p_bolt: { id: 'p_bolt', kind: 'payload', name: 'Cổ Ngữ Thiên Lôi', short: 'Thiên Lôi', color: '#ffe14a', icon: 'x_lightning-storm', desc: 'Gọi sét giáng xuống mục tiêu và lan xung quanh' },
  p_frost: { id: 'p_frost', kind: 'payload', name: 'Cổ Ngữ Băng Nổ', short: 'Băng Nổ', color: '#7fdcff', icon: 'x_ice-cast', desc: 'Tạo vụ nổ băng làm chậm & đóng băng quái gần đó' },
  p_cyclone: { id: 'p_cyclone', kind: 'payload', name: 'Cổ Ngữ Cuồng Phong', short: 'Lốc Xoáy', color: '#a8f0d8', icon: 'x_tornado', desc: 'Luồng lốc hất văng quái và đẩy văng đạn gần' },
  p_blades: { id: 'p_blades', kind: 'payload', name: 'Cổ Ngữ Kiếm Bay', short: 'Kiếm Bay', color: '#ff8aa8', icon: 'x_daggers', desc: 'Phóng 3 lưỡi kiếm phép tự tìm quái gần nhất' },
};

export const RUNE_KEYS = Object.keys(RUNES);
export const RUNE_BY_KIND = {
  trigger: RUNE_KEYS.filter((k) => RUNES[k].kind === 'trigger'),
  mod: RUNE_KEYS.filter((k) => RUNES[k].kind === 'mod'),
  payload: RUNE_KEYS.filter((k) => RUNES[k].kind === 'payload'),
};

export function randomRune(rand = Math.random, preferKind = null) {
  if (preferKind && RUNE_BY_KIND[preferKind]?.length) {
    const arr = RUNE_BY_KIND[preferKind];
    return arr[Math.floor(rand() * arr.length)];
  }
  const r = rand();
  const kind = r < 0.36 ? 'trigger' : r < 0.66 ? 'payload' : 'mod';
  const arr = RUNE_BY_KIND[kind];
  return arr[Math.floor(rand() * arr.length)];
}

// Đọc tóm tắt mạch cổ ngữ trên vũ khí để hiển thị trong Xưởng Đe & HUD
export function describeCircuit(runes = []) {
  if (!runes || !runes.length) return 'Chưa lắp cổ ngữ';
  const parts = [];
  let curTrig = null;
  let mods = [];
  let hasPair = false;
  for (const id of runes) {
    const r = RUNES[id];
    if (!r) continue;
    if (r.kind === 'trigger') { curTrig = r; mods = []; }
    else if (r.kind === 'mod') mods.push(r);
    else if (r.kind === 'payload') {
      hasPair = true;
      const tName = curTrig ? curTrig.short : 'Mỗi 6 đòn';
      const mText = mods.length ? ` → [${mods.map((m) => m.short).join(' + ')}]` : '';
      parts.push(`${tName}${mText} → ${r.short}`);
    }
  }
  if (!hasPair && curTrig) {
    const mText = mods.length ? ` → [${mods.map((m) => m.short).join(' + ')}]` : '';
    parts.push(`${curTrig.short}${mText} → Sóng Lò Rèn`);
  }
  return parts.join('  |  ') || runes.map((id) => RUNES[id]?.short).filter(Boolean).join(' → ');
}

// Bẫy cổ ngữ tồn tại tạm thời trên sàn
const runeTimers = [];
export function updateRunes(dt) {
  for (let i = runeTimers.length - 1; i >= 0; i--) {
    runeTimers[i].t -= dt;
    if (runeTimers[i].t <= 0) {
      const fn = runeTimers[i].fn;
      runeTimers.splice(i, 1);
      fn();
    }
  }
}
export function clearRunes() { runeTimers.length = 0; }
const after = (t, fn) => runeTimers.push({ t, fn });

function executePayload(payloadId, player, pos, dir, baseDmg, weapon, mods) {
  const split = mods.includes('m_split');
  const wide = mods.includes('m_wide');
  const delay = mods.includes('m_delay');
  const pull = mods.includes('m_pull');
  const trap = mods.includes('m_trap');

  const stormBoost = player?.stats?.stormSet3 ? 1.45 : 1;
  const dmgScale = (split ? 0.65 : 1) * (delay ? 1.85 : 1) * stormBoost;
  const radScale = wide ? 1.65 : 1;
  const dmg = Math.max(4, Math.round(baseDmg * dmgScale));
  const at = pos.clone();
  const aim = dir ? dir.clone().setY(0).normalize() : player.aimDir();

  const runOnce = (origin, isTrapEcho = false) => {
    if (!ctx.scene || player.dead) return;
    const prevTag = ctx.dmgTag;
    ctx.dmgTag = 'rune';
    try {
    if (pull) {
      const pr = 4.6 * radScale;
      spawnRing(ctx.scene, origin, pr, 0xc77dff, 0.35);
      for (const e of ctx.enemies) {
        if (!e.alive || e.spawning || e.isBoss) continue;
        const d = e.pos.distanceTo(origin);
        if (d < pr && d > 0.4) {
          e.knock.set(origin.x - e.pos.x, 0, origin.z - e.pos.z).normalize().multiplyScalar(11);
        }
      }
    }

    const dirs = split
      ? [-0.35, 0, 0.35].map((off) => {
        const a = Math.atan2(aim.x, aim.z) + off;
        return new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      })
      : [aim];

    if (payloadId === 'p_wave') {
      for (const d of dirs) {
        spawnSwordWave(origin.clone().addScaledVector(d, 0.6), d, weapon, Math.round(dmg * 0.85), wide ? 1.45 : 1.05);
      }
      play('swing', { at: origin, rate: 1.3, vol: 0.45 });
    } else if (payloadId === 'p_bolt') {
      const targets = ctx.enemies
        .filter((e) => e.alive && !e.spawning && e.pos.distanceTo(origin) < 9 * radScale)
        .sort((a, b) => a.pos.distanceTo(origin) - b.pos.distanceTo(origin))
        .slice(0, split ? 3 : 1);
      const pts = targets.length ? targets.map((t) => t.pos.clone()) : [origin.clone()];
      for (const p of pts) {
        spawnBolt(ctx.scene, p.clone().setY(9), p.clone().setY(0.5), 0xffe14a);
        aoe(p, 2.2 * radScale, Math.round(dmg * 1.1), { element: 'lightning', element2: null }, 6);
      }
      play('zap', { at: origin, vol: 0.55 });
    } else if (payloadId === 'p_frost') {
      const r = 2.8 * radScale;
      spawnRing(ctx.scene, origin, r, 0x7fdcff, 0.45);
      burst(origin.clone().setY(0.6), 0xaeeaff, 16, { speed: 7, size: 0.14 });
      play('freeze', { at: origin, rate: 1.15, vol: 0.55 });
      aoe(origin, r, Math.round(dmg * 0.9), { element: 'ice', element2: null }, 5);
      for (const e of ctx.enemies) {
        if (e.alive && !e.spawning && e.pos.distanceTo(origin) < r + e.radius) {
          e.slowT = Math.max(e.slowT, 3);
          e.iceStacks = (e.iceStacks || 0) + (wide ? 2 : 1);
          if (e.iceStacks >= 3) { e.iceStacks = 0; e.frozenT = Math.max(e.frozenT, 1.5); }
        }
      }
      if (ctx.reactSurface) ctx.reactSurface(origin, r, 'ice', aim, dmg);
    } else if (payloadId === 'p_cyclone') {
      const r = 3.2 * radScale;
      spawnRing(ctx.scene, origin, r, 0xa8f0d8, 0.4);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        emit(origin.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.5, 0.5, Math.sin(a) * r * 0.5)), {
          frame: F.streak, color: 0xd8fff0, color2: 0x6fd8b8, size: 0.7, size2: 0.2, life: 0.35,
          vel: new THREE.Vector3(-Math.sin(a) * 9, 1.5, Math.cos(a) * 9), streak: true,
        });
      }
      play('dash', { at: origin, rate: 0.75, vol: 0.55 });
      aoe(origin, r, Math.round(dmg * 0.85), { element: 'wind', element2: null }, 15);
      if (ctx.reactSurface) ctx.reactSurface(origin, r, 'wind', aim, dmg);
    } else if (payloadId === 'p_blades') {
      const count = split ? 5 : 3;
      const targets = ctx.enemies
        .filter((e) => e.alive && !e.spawning && e.pos.distanceTo(origin) < 12 * radScale)
        .sort((a, b) => a.pos.distanceTo(origin) - b.pos.distanceTo(origin));
      for (let i = 0; i < count; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const d = t
          ? new THREE.Vector3(t.pos.x - origin.x, 0, t.pos.z - origin.z).normalize()
          : dirs[i % dirs.length];
        spawnOrb(origin.clone().setY(1.1), d, weapon, Math.round(dmg * 0.55), 0, 25, { bolt: true, knife: true, pierce: wide ? 2 : 1 });
      }
      play('swing', { at: origin, rate: 1.5, vol: 0.45 });
    } else {
      // Fallback: Sóng Lò Rèn khi có Trigger nhưng chưa lắp Payload
      const r = 2.6 * radScale;
      spawnRing(ctx.scene, origin, r, 0xffcf4a, 0.35);
      aoe(origin, r, Math.round(dmg * 0.8), weapon, 8);
      play('hammer', { at: origin, rate: 1.4, vol: 0.4 });
    }

    if (trap && !isTrapEcho) {
      flash(origin.clone().setY(0.3), 0x9fff5a, 1.6, 0.2, false);
      after(1.35, () => runOnce(origin, true));
    }
    } finally { ctx.dmgTag = prevTag; }
  };

  if (delay) {
    scheduleBomb(at, 0.85, 2.0 * radScale, 0, 0, 0xff9050);
    after(0.85, () => runOnce(at));
  } else {
    runOnce(at);
  }
}

// Chạy Mạch Cổ Ngữ trên vũ khí khi có sự kiện xảy ra (có chống đệ quy & cooldown)
export function fireRunes(player, eventType, pos, dir, baseDmg, weapon = player.weapon) {
  if (!weapon || !weapon.runes || !weapon.runes.length) return false;
  if ((ctx._runeDepth || 0) >= 1) return false;
  const now = performance.now() / 1000;
  player.runeCd = player.runeCd || {};

  let fired = false;
  let activeTrigger = null;
  let mods = [];
  let hasAnyTrigger = weapon.runes.some((id) => RUNES[id]?.kind === 'trigger');

  ctx._runeDepth = (ctx._runeDepth || 0) + 1;
  try {
    // Nếu chỉ lắp Payload/Mod mà chưa có Trigger -> fallback kích hoạt ở sự kiện 'sixth'
    if (!hasAnyTrigger) {
      if (eventType !== 'sixth') return false;
      if ((player.runeCd._fallback || 0) > now) return false;
      const payloads = [];
      for (const id of weapon.runes) {
        const r = RUNES[id];
        if (!r) continue;
        if (r.kind === 'mod') mods.push(id);
        else if (r.kind === 'payload') payloads.push(id);
      }
      if (!payloads.length) return false;
      player.runeCd._fallback = now + 0.7;
      for (const pid of payloads) executePayload(pid, player, pos, dir, baseDmg, weapon, mods);
      return true;
    }

    // Quét mạch từ trái sang phải: Trigger -> Mod* -> Payload+
    let pendingTriggerFired = false;
    let triggerHadPayload = false;
    for (let i = 0; i < weapon.runes.length; i++) {
      const r = RUNES[weapon.runes[i]];
      if (!r) continue;
      if (r.kind === 'trigger') {
        if (pendingTriggerFired && !triggerHadPayload) {
          executePayload(null, player, pos, dir, baseDmg, weapon, mods);
          fired = true;
        }
        activeTrigger = r;
        mods = [];
        triggerHadPayload = false;
        if (r.event === eventType && (player.runeCd[r.id] || 0) <= now) {
          pendingTriggerFired = true;
          const cdMul = player?.hasRelic?.('capacitor') ? 0.65 : 1;
          player.runeCd[r.id] = now + r.cd * cdMul;
        } else {
          pendingTriggerFired = false;
        }
      } else if (r.kind === 'mod') {
        if (pendingTriggerFired) mods.push(r.id);
      } else if (r.kind === 'payload') {
        if (pendingTriggerFired) {
          triggerHadPayload = true;
          executePayload(r.id, player, pos, dir, baseDmg, weapon, mods);
          fired = true;
        }
      }
    }
    if (pendingTriggerFired && !triggerHadPayload) {
      executePayload(null, player, pos, dir, baseDmg, weapon, mods);
      fired = true;
    }
  } finally {
    ctx._runeDepth = Math.max(0, (ctx._runeDepth || 1) - 1);
  }
  return fired;
}

// ---------- Lõi Boss (rơi ra khi phá bộ phận Boss) ----------
export const BOSS_CORES = {
  core_knight: {
    id: 'core_knight', boss: 'Hiệp Sĩ Xương', name: 'Lõi Khiên Cận Vệ', icon: 'x_shield-reflect', color: '#ffcf6b',
    weaponType: 'axe', element: 'fire', element2: 'holy',
    title: 'Rìu Hộ Vệ Xương', legend: 'boss_knight',
    text: 'Đòn đánh gây +60% sát thương thanh Choáng; kỹ năng chuột phải tạo sóng khiên vàng',
  },
  core_slime: {
    id: 'core_slime', boss: 'Vua Slime', name: 'Lõi Kiếm Nuốt Chửng', icon: 'x_slime', color: '#c77dff',
    weaponType: 'sword', element: 'poison', element2: 'blood',
    title: 'Thần Kiếm Nhầy Cổ', legend: 'boss_slime',
    text: 'Mỗi đòn trúng tách 2 giọt cầu nhầy nổ độc & hút máu xung quanh',
  },
  core_mage: {
    id: 'core_mage', boss: 'Pháp Sư Tối Thượng', name: 'Lõi Pha Lê Tối Thượng', icon: 'x_crystal-ball', color: '#9fd4ff',
    weaponType: 'staff', element: 'lightning', element2: 'ice',
    title: 'Trượng Thiên Khải', legend: 'boss_mage',
    text: 'Bắn kèm 2 cầu pha lê phụ nảy giữa các mục tiêu gần đó',
  },
  core_shadow: {
    id: 'core_shadow', boss: 'Chúa Tể Bóng Đêm', name: 'Lõi Hắc Ảnh', icon: 'x_hood', color: '#b89aff',
    weaponType: 'daggers', element: 'blood', element2: 'wind',
    title: 'Song Ảnh Đoạt Hồn', legend: 'boss_shadow',
    text: 'Đánh lén hoặc chí mạng triệu hồi bóng ma chém lại mục tiêu sau 0.25s',
  },
  core_golem: {
    id: 'core_golem', boss: 'Chúa Quỷ Lò Rèn', name: 'Lõi Lò Quỷ', icon: 'x_fire-bowl', color: '#ff7a3a',
    weaponType: 'greatsword', element: 'fire', element2: 'holy',
    title: 'Đại Kiếm Lò Quỷ', legend: 'boss_golem',
    text: 'Đòn nặng hoặc chí mạng tạo vụ nổ nham thạch lan rộng và để lại vũng lửa',
  },
  core_dragon_ice: {
    id: 'core_dragon_ice', boss: 'Băng Long Vương', name: 'Lõi Sừng Băng Long', icon: 'x_snowflake2', color: '#8fe8ff',
    weaponType: 'crossbow', element: 'ice', element2: 'wind',
    title: 'Long Nha Băng Kích', legend: 'boss_dragon_ice',
    text: 'Mỗi phát bắn phóng kèm 2 mảnh băng long xuyên giáp làm chậm & đóng băng',
  },
  core_dragon_fire: {
    id: 'core_dragon_fire', boss: 'Hỏa Long Cổ Đại', name: 'Lõi Long Châu Lửa', icon: 'x_meteor', color: '#ff5a2a',
    weaponType: 'axe', element: 'fire', element2: 'wind',
    title: 'Long Hỏa Cuồng Đao', legend: 'boss_dragon_fire',
    text: 'Mỗi đòn trúng thứ 3 gọi thiên thạch rồng giáng xuống mục tiêu kèm vũng lửa',
  },
  core_plague: {
    id: 'core_plague', boss: 'Vua Nấm Dịch Hạch', name: 'Lõi Bào Tử Cổ', icon: 'x_poison-bottle', color: '#8fe83a',
    weaponType: 'staff', element: 'poison', element2: 'blood',
    title: 'Trượng Dịch Hạch Vương', legend: 'boss_plague',
    text: 'Đòn đánh lây bào tử độc lan rộng và nổ khí độc khi quái tích đủ độc',
  },
  core_frost: {
    id: 'core_frost', boss: 'Băng Vương Giáp Sĩ', name: 'Lõi Vương Miện Băng', icon: 'x_frozen', color: '#7fdcff',
    weaponType: 'sword', element: 'ice', element2: 'holy',
    title: 'Băng Vương Kích', legend: 'boss_frost',
    text: 'Đòn nặng tung sóng băng đóng băng quái xung quanh và kích phản ứng Băng',
  },
  core_twins: {
    id: 'core_twins', boss: 'Song Tử Tử Thần', name: 'Lõi Ấn Song Sinh', icon: 'x_swords-emblem', color: '#ffcf6b',
    weaponType: 'axe', element: 'fire', element2: 'lightning',
    altForm: { type: 'daggers', element: 'lightning', element2: 'fire', specialType: null, title: 'Song Ảnh Lưỡi Hái (Lôi)' },
    title: 'Song Ảnh Lưỡi Hái', legend: 'boss_twins',
    text: 'Vũ khí Song Dạng (Rìu Hỏa ⇄ Song Dao Lôi): bấm Q biến hình gọi sét Quá Tải quanh thân',
  },
  core_smith: {
    id: 'core_smith', boss: 'Thợ Rèn Sa Ngã', name: 'Lõi Hắc Hỏa Tôn', icon: 'anvil', color: '#ffe070',
    weaponType: 'hammer', element: 'fire', element2: 'holy',
    title: 'Thần Chùy Khởi Nguyên', legend: 'boss_smith',
    text: 'Mọi đòn đánh giải phóng sóng Lò Rèn vàng, đập choáng ×2.5 và tự hồi +4 Ánh Lửa',
  },
};

// ---------- Thức Tỉnh Vũ Khí (Awakening Trials cho Huyền Thoại / Công Thức / Vũ Khí Boss) ----------
const AWAKEN_DEFS = {
  blizzard: { event: 'react', goal: 8, text: 'Gây 8 phản ứng nguyên tố', ultId: 'aw_blizzard', ultName: 'Kỷ Băng Hà Tuyệt Đối' },
  bloodfire: { event: 'kill', goal: 18, text: 'Hạ 18 quái bằng vũ khí này', ultId: 'aw_bloodfire', ultName: 'Luyện Ngục Huyết Hỏa' },
  judgement: { event: 'crit', goal: 16, text: 'Gây 16 đòn chí mạng', ultId: 'aw_judgement', ultName: 'Thánh Kiếm Thiên Phạt' },
  plague: { event: 'react', goal: 8, text: 'Gây 8 phản ứng nguyên tố', ultId: 'aw_plague', ultName: 'Đại Dịch Tận Thế' },
  boss_knight: { event: 'stun', goal: 5, text: 'Làm choáng hoặc Phản Phá 5 lần', ultId: 'aw_forge', ultName: 'Phán Quyết Thợ Rèn' },
  boss_slime: { event: 'kill', goal: 16, text: 'Hạ 16 quái bằng vũ khí này', ultId: 'aw_plague', ultName: 'Thủy Triều Nhầy Cổ' },
  boss_mage: { event: 'crit', goal: 15, text: 'Gây 15 đòn chí mạng', ultId: 'aw_judgement', ultName: 'Tinh Vân Thiên Khải' },
  boss_shadow: { event: 'dodge', goal: 6, text: 'Né Hoàn Hảo / Phản Xuyên 6 lần', ultId: 'aw_shadow', ultName: 'Vũ Điệu Hắc Ảnh' },
  boss_golem: { event: 'stun', goal: 5, text: 'Làm choáng hoặc Phản Phá 5 lần', ultId: 'aw_forge', ultName: 'Ngọn Lửa Quỷ Lò' },
  boss_dragon_ice: { event: 'react', goal: 8, text: 'Gây 8 phản ứng nguyên tố', ultId: 'aw_blizzard', ultName: 'Hơi Thở Băng Long' },
  boss_dragon_fire: { event: 'kill', goal: 18, text: 'Hạ 18 quái bằng vũ khí này', ultId: 'aw_bloodfire', ultName: 'Thiên Thạch Long Vương' },
  boss_plague: { event: 'react', goal: 8, text: 'Gây 8 phản ứng nguyên tố', ultId: 'aw_plague', ultName: 'Bào Tử Tận Thế' },
  boss_frost: { event: 'crit', goal: 15, text: 'Gây 15 đòn chí mạng', ultId: 'aw_blizzard', ultName: 'Phong Ấn Băng Vương' },
  boss_twins: { event: 'quench', goal: 5, text: 'Đòn Biến Hình / Tôi Vũ Khí 5 lần', ultId: 'aw_shadow', ultName: 'Liên Kết Tử Thần' },
  boss_smith: { event: 'stun', goal: 5, text: 'Làm choáng hoặc Phản Phá 5 lần', ultId: 'aw_forge', ultName: 'Khởi Nguyên Lò Rèn' },
  default: { event: 'quench', goal: 5, text: 'Tôi Vũ Khí hoặc Phóng Nhiệt 5 lần', ultId: 'aw_forge', ultName: 'Ngọn Lửa Đầu Tiên' },
};

export function attachAwakening(w) {
  if (!w || w.awakening || (w.rarity < 3 && !w.legend)) return;
  const def = AWAKEN_DEFS[w.legend] || AWAKEN_DEFS.default;
  w.awakening = { ...def, progress: 0, done: false };
}

export function progressAwakening(player, eventType, amount = 1) {
  const w = player?.weapon;
  if (!w || !w.awakening || w.awakening.done) return false;
  if (w.awakening.event !== eventType) return false;
  w.awakening.progress = Math.min(w.awakening.goal, w.awakening.progress + amount);
  if (w.awakening.progress >= w.awakening.goal) {
    w.awakening.done = true;
    w.awakened = true;
    player.recalc();
    if (ctx.scene) {
      spawnRing(ctx.scene, player.pos, 7, 0xffe8a0, 0.7);
      burst(player.pos.clone().setY(1.2), 0xffdf70, 50, { speed: 12, size: 0.2, life: 0.9 });
      flash(player.pos.clone().setY(1.4), 0xfff4c0, 6, 0.35);
      addShake(0.6);
      damageNumber(player.pos, '✦ THỨC TỈNH!', 'react ult');
    }
    play('forged', { rate: 1.15 });
    play('anvil');
    if (ctx.onAwaken) ctx.onAwaken(w);
    return true;
  }
  return false;
}
