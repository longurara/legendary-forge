// Cơ chế #6: Tài nguyên kép Ánh Lửa (0-100) & Sự Tha Hóa (0-100) + Lời Nguyền Năng Động hai mặt
import { damageNumber, flash, spawnRing, burst, addShake } from './fx.js';
import { play } from './audio.js';

export const DYN_CURSES = [
  {
    id: 'dark_forge', name: 'Lò Rèn Hắc Ám', icon: 'anvil',
    desc: 'Rèn ở đe luôn +1 phụ tố, nhưng vũ khí mòn độ bền nhanh gấp đôi.',
  },
  {
    id: 'blood_gold', name: 'Vàng Đổi Máu', icon: 'x_coins',
    desc: 'Nhặt vàng hồi +2 máu, nhưng bị đánh rơi văng 15% vàng xuống sàn.',
  },
  {
    id: 'shadow_step', name: 'Bước Bóng Đêm', icon: 'x_ghost2',
    desc: 'Lướt xa hơn 35% và đốt bóng tối kẻ bị xuyên qua, nhưng lướt tốn thêm +8 thể lực.',
  },
  {
    id: 'glass_wrath', name: 'Cuồng Nộ Bóng Tối', icon: 'x_broken-heart',
    desc: 'Khi Ánh Lửa dưới 40: +30% sát thương, nhưng nhận thêm +20% sát thương.',
  },
  {
    id: 'volatile_soul', name: 'Hồn Nổ', icon: 'x_explosion',
    desc: 'Mọi quái chết nổ bóng tối sát thương cả quái lẫn bạn (nếu đứng dưới 2.2m).',
  },
  {
    id: 'overheat_pact', name: 'Khế Ước Dung Nham', icon: 'x_flame-tunnel',
    desc: 'Nhiệt Lưỡi tích nhanh +60% và Nóng Đỏ thêm +15% sát thương, nhưng Quá Nhiệt mất 10 máu.',
  },
  {
    id: 'cursed_greed', name: 'Kẻ Săn Cổ Ngữ', icon: 'x_rune',
    desc: 'Quái tinh anh thêm +30% máu, nhưng tỷ lệ rơi Cổ Ngữ tăng gấp đôi.',
  },
  {
    id: 'abyss_hunger', name: 'Cơn Đói Vực Sâu', icon: 'x_cursed', final: true,
    desc: 'Lời nguyền thứ 5: Sát thương ×1.8, nhưng máu tối đa giảm còn 40% cho đến khi thanh tẩy!',
  },
];

export const dynCurseById = (id) => DYN_CURSES.find((c) => c.id === id);

export const flameState = {
  flame: 85,          // 0..100
  corruption: 0,      // 0..100
  curses: [],         // mảng id của DYN_CURSES
  onBanner: null,
  onChange: null,
  onCurseAdded: null,
};

export function resetFlameState() {
  flameState.flame = 85;
  flameState.corruption = 0;
  flameState.curses = [];
  flameState.onChange?.();
}

export function hasDynCurse(id) {
  return flameState.curses.includes(id);
}

// Bậc Ánh Lửa: 'bright' (>=70), 'dim' (26..69), 'ember' (<=25: chế độ rủi ro ăn thưởng lớn)
export function flameTier() {
  if (flameState.flame >= 70) return 'bright';
  if (flameState.flame <= 25) return 'ember';
  return 'dim';
}

export function addFlame(delta) {
  const prevTier = flameTier();
  flameState.flame = Math.max(0, Math.min(100, flameState.flame + delta));
  const nextTier = flameTier();
  if (prevTier !== 'ember' && nextTier === 'ember') {
    flameState.onBanner?.('Ánh Lửa Tàn!', 'Bóng tối bao trùm · Quái mạnh hơn nhưng Chí Mạng +40% & Rơi đồ ×2', 2.4, '#b89aff');
    play('anvil', { rate: 0.65, vol: 0.6 });
  } else if (prevTier === 'ember' && nextTier !== 'ember') {
    flameState.onBanner?.('Ngọn Lửa Bùng Sáng', 'Ánh sáng đẩy lùi bóng đêm', 1.6, '#ffcf6b');
  }
  flameState.onChange?.();
}

export function addCorruption(amount, playerPos = null, scene = null) {
  if (amount <= 0) return null;
  flameState.corruption += amount;
  let added = null;
  while (flameState.corruption >= 100) {
    flameState.corruption -= 100;
    const normals = DYN_CURSES.filter((c) => !c.final && !flameState.curses.includes(c.id));
    let pick = null;
    if (flameState.curses.length >= 4 && !flameState.curses.includes('abyss_hunger')) {
      pick = dynCurseById('abyss_hunger');
    } else if (normals.length) {
      pick = normals[Math.floor(Math.random() * normals.length)];
    }
    if (pick) {
      flameState.curses.push(pick.id);
      added = pick;
      if (playerPos && scene) {
        spawnRing(scene, playerPos, 5, 0x9a40ff, 0.6);
        burst(playerPos.clone().setY(1), 0x8a30ff, 30, { speed: 9, size: 0.16 });
        flash(playerPos.clone().setY(1.2), 0x9a40ff, 4, 0.28);
        damageNumber(playerPos, 'Tha Hóa: ' + pick.name, 'react ult');
        addShake(0.45);
      }
      play('anvil', { rate: 0.55 });
      flameState.onBanner?.('Lời Nguyền: ' + pick.name, pick.desc, 3.0, '#c070ff');
      flameState.onCurseAdded?.(pick);
    }
  }
  flameState.onChange?.();
  return added;
}

export function purgeCurse(playerPos = null, scene = null) {
  if (!flameState.curses.length) {
    flameState.corruption = Math.max(0, flameState.corruption - 40);
    flameState.onChange?.();
    return null;
  }
  // Ưu tiên thanh tẩy Cơn Đói Vực Sâu trước nếu có
  const abyssIdx = flameState.curses.indexOf('abyss_hunger');
  const removedId = abyssIdx >= 0 ? flameState.curses.splice(abyssIdx, 1)[0] : flameState.curses.pop();
  const c = dynCurseById(removedId);
  flameState.corruption = Math.max(0, flameState.corruption - 25);
  if (playerPos && scene) {
    spawnRing(scene, playerPos, 5.5, 0xffe8a0, 0.55);
    burst(playerPos.clone().setY(1), 0xffe8a0, 28, { speed: 8, size: 0.15 });
    damageNumber(playerPos, 'Thanh Tẩy!', 'react perfect');
  }
  play('forged', { rate: 1.2 });
  flameState.onBanner?.('Đã Thanh Tẩy!', `Xóa bỏ lời nguyền: ${c?.name || removedId}`, 2.3, '#ffe8a0');
  flameState.onChange?.();
  return c;
}
