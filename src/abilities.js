// Tuyệt kỹ (phím R khi thanh Nộ đầy) – theo nguyên tố của vũ khí đang cầm
import * as THREE from 'three';
import { ctx, aoe, scheduleBomb, dealDamage } from './combat.js';
import { spawnRing, burst, addShake, spawnBolt, damageNumber, addHitStop, groundRune, flash, emit, F, smoke } from './fx.js';
import { play } from './audio.js';

export const ULTIMATES = {
  fire: { name: 'Mưa Thiên Thạch', color: '#ff8a3a' },
  ice: { name: 'Bão Băng', color: '#8fe0ff' },
  lightning: { name: 'Thiên Lôi', color: '#ffe14a' },
  blood: { name: 'Xoáy Máu', color: '#ff4a5a' },
  poison: { name: 'Mây Độc', color: '#9fff5a' },
  wind: { name: 'Cuồng Phong', color: '#a8f0d8' },
  holy: { name: 'Thánh Quang', color: '#fff0b0' },
  none: { name: 'Sóng Lò Rèn', color: '#ffcf4a' },
};

const timers = [];
const later = (t, fn) => timers.push({ t, fn });
export function updateAbilities(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  }
}
export function clearAbilities() { timers.length = 0; }

const nearby = (pos, r) => ctx.enemies.filter((e) => e.alive && !e.spawning && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < r);

export function castUltimate(player) {
  const w = player.weapon;
  const el = w.element && w.element !== 'none' ? w.element : 'none';
  const pw = player.stats.dmg * player.stats.ultPower;
  const P = player.pos.clone();
  addShake(0.6);
  addHitStop(0.12);
  spawnRing(ctx.scene, P, 4, 0xffffff, 0.4);

  // Tuyệt kỹ biến thể độc quyền của Vũ Khí Thức Tỉnh
  if (w.awakened && w.awakening?.ultId) {
    const uid = w.awakening.ultId;
    groundRune(player.pos, 11, 0xffe8a0, 1.6, 2.2);
    flash(P.clone().setY(1.5), 0xfff4c0, 6.5, 0.3);
    play('anvil');
    play('forged', { rate: 1.15 });
    damageNumber(P, '✦ ' + w.awakening.ultName + '!', 'react ult');
    if (uid === 'aw_blizzard') {
      spawnRing(ctx.scene, P, 14, 0x9fe8ff, 0.8);
      for (const e of nearby(P, 14)) { e.frozenT = 3.5; e.slowT = 5; }
      for (let i = 0; i < 12; i++) {
        later(i * 0.12, () => {
          const pool = nearby(player.pos, 15);
          const t = pool[i % Math.max(1, pool.length)];
          if (!t) return;
          spawnBolt(ctx.scene, t.pos.clone().setY(10), t.pos.clone().setY(0.5), 0xaeeaff);
          dealDamage(t, Math.round(48 * pw), { element: 'lightning', element2: 'ice' }, null, 0, true, true);
          play('freeze', { at: t.pos, rate: 1.3 });
        });
      }
      return;
    }
    if (uid === 'aw_bloodfire') {
      player.heal(Math.round(player.maxHp * 0.4));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const at = P.clone().add(new THREE.Vector3(Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5));
        later(i * 0.08, () => scheduleBomb(at, 0.4, 3.0, Math.round(44 * pw), 0, 0xff3a2a));
      }
      aoe(P, 9, Math.round(40 * pw), { element: 'blood', element2: 'fire' }, 14);
      return;
    }
    if (uid === 'aw_judgement') {
      player.heal(Math.round(player.maxHp * 0.25));
      player.iframes = Math.max(player.iframes, 1.5);
      for (let i = 0; i < 10; i++) {
        later(i * 0.11, () => {
          const pool = nearby(player.pos, 16);
          const t = pool[Math.floor(Math.random() * pool.length)];
          if (!t) return;
          spawnBolt(ctx.scene, t.pos.clone().setY(11), t.pos.clone().setY(0.5), 0xfff6d0);
          spawnRing(ctx.scene, t.pos, 3.2, 0xffe8a0, 0.4);
          play('zap', { at: t.pos, rate: 0.85 });
          aoe(t.pos, 3.2, Math.round(45 * pw), { element: 'holy', element2: 'lightning' }, 8);
        });
      }
      return;
    }
    if (uid === 'aw_plague') {
      for (let k = 0; k < 6; k++) {
        later(k * 0.35, () => {
          smoke(player.pos.clone().setY(0.5), { count: 8, color: 0x6fd83a, size: 2.8, life: 1.2, speed: 7, rise: 0.4, alpha: 0.4 });
          for (const e of nearby(player.pos, 11)) {
            dealDamage(e, Math.round(24 * pw), { element: 'poison', element2: k === 5 ? 'fire' : 'wind' }, null, 10, k === 5, true);
          }
        });
      }
      return;
    }
    if (uid === 'aw_shadow') {
      player.iframes = Math.max(player.iframes, 1.8);
      const targets = nearby(P, 15);
      for (let i = 0; i < Math.min(10, Math.max(4, targets.length * 2)); i++) {
        later(i * 0.1, () => {
          const pool = nearby(player.pos, 15);
          const t = pool[i % Math.max(1, pool.length)];
          if (!t) return;
          smoke(t.pos.clone().setY(0.9), { count: 4, color: 0x3a2060, size: 1.1, life: 0.6, alpha: 0.65 });
          flash(t.pos.clone().setY(1.1), 0xb89aff, 2.5, 0.16, false);
          dealDamage(t, Math.round(46 * pw), { element: 'blood', element2: 'wind' }, null, 8, true, false);
          play('swing', { at: t.pos, rate: 1.5 });
        });
      }
      return;
    }
    // aw_forge — Ngọn Lửa Đầu Tiên: phục hồi độ bền, xả nhiệt, bồi Ánh Lửa và sóng nổ vàng khổng lồ
    w.dur = 100;
    w.heat = 0;
    w.overheatT = 0;
    ctx.addFlame?.(35);
    spawnRing(ctx.scene, P, 13, 0xffcf4a, 0.8);
    burst(P.clone().setY(0.8), 0xffe080, 80, { speed: 18, size: 0.24, life: 1.0 });
    play('explode');
    aoe(P, 13, Math.round(80 * pw), { element: 'fire', element2: 'holy' }, 26);
    for (const e of nearby(P, 13)) if (e.poiseMax) e.poise += e.poiseMax * 0.65;
    return;
  }

  const runeCol = { fire: 0xff7a2a, ice: 0x8fe0ff, lightning: 0xffe14a, blood: 0xff3a4a, poison: 0x9fff5a, wind: 0xa8f0d8, holy: 0xfff0b0, none: 0xffcf4a }[el];
  groundRune(player.pos, el === 'ice' ? 11 : el === 'none' ? 9 : 7, runeCol, 1.4, 1.6);
  flash(P.clone().setY(1.2), runeCol, 5, 0.25);
  play('anvil');

  if (el === 'fire') {
    const targets = nearby(P, 14);
    for (let i = 0; i < 10; i++) {
      const t = targets[i % Math.max(1, targets.length)];
      const at = t ? t.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5))
        : P.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12));
      later(i * 0.15, () => {
        scheduleBomb(at, 0.45, 2.3, Math.round(34 * pw), 0, 0xff6a1a);
        // Thiên thạch rơi từ trời xuống
        const from = at.clone().add(new THREE.Vector3(3, 13, -2));
        const vel = at.clone().sub(from).divideScalar(0.45);
        emit(from, { frame: F.fire, color: 0xffe08a, color2: 0xff5a1a, size: 2.2, size2: 1.6, life: 0.45, vel, rotV: 6, hdr: 2.2 });
        emit(from, { frame: F.streak, color: 0xffd080, color2: 0xff5a1a, size: 6, size2: 4, life: 0.45, vel, streak: true, hdr: 2 });
      });
    }
  } else if (el === 'ice') {
    spawnRing(ctx.scene, P, 11, 0x8fe0ff, 0.7);
    burst(P.clone().setY(1), 0xaeeaff, 60, { speed: 16, size: 0.2, life: 0.9 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      smoke(P.clone().add(new THREE.Vector3(Math.cos(a) * 5, 0.3, Math.sin(a) * 5)), { count: 1, color: 0xd8f4ff, size: 1.6, life: 1.6, speed: 2, rise: 0.4, alpha: 0.35 });
    }
    play('freeze', { rate: 0.7 });
    for (const e of nearby(P, 11)) {
      dealDamage(e, Math.round(25 * pw), { element: 'none', element2: null }, null, 0, false, false);
      e.frozenT = 3; e.slowT = 4;
    }
  } else if (el === 'lightning') {
    for (let i = 0; i < 14; i++) {
      later(i * 0.1, () => {
        const pool = nearby(player.pos, 15);
        const t = pool[Math.floor(Math.random() * pool.length)];
        if (!t) return;
        spawnBolt(ctx.scene, t.pos.clone().setY(9), t.pos.clone().setY(0.5), 0xfff07a);
        burst(t.pos.clone().setY(0.5), 0xfff07a, 10, { speed: 6, size: 0.12 });
        play('zap', { at: t.pos });
        dealDamage(t, Math.round(40 * pw), { element: 'lightning', element2: null }, null, 0, true, false);
      });
    }
  } else if (el === 'poison') {
    // Mây độc: 4 giây liên tục chồng độc lên mọi quái trong vùng
    for (let k = 0; k < 8; k++) later(k * 0.5, () => {
      smoke(player.pos.clone().setY(0.5), { count: 6, color: 0x5aa82a, size: 2.4, life: 1.2, speed: 6, rise: 0.3, alpha: 0.35 });
      for (const e of nearby(player.pos, 8)) dealDamage(e, Math.round(6 * pw), { element: 'poison', element2: null }, null, 0, false, false);
    });
    play('ignite', { rate: 0.6 });
  } else if (el === 'wind') {
    // Cuồng phong: hút mọi quái lại gần rồi thổi văng
    for (const e of nearby(P, 13)) { if (!e.isBoss) e.knock.set(P.x - e.pos.x, 0, P.z - e.pos.z).multiplyScalar(2.2); }
    play('dash', { rate: 0.5 });
    later(0.55, () => {
      spawnRing(ctx.scene, player.pos, 7, 0xd8fff0, 0.5);
      for (const e of nearby(player.pos, 7)) {
        const dir = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z).normalize();
        dealDamage(e, Math.round(35 * pw), { element: 'wind', element2: null }, dir, 26, true, false);
      }
      addShake(0.5);
    });
  } else if (el === 'holy') {
    // Thánh quang: hồi máu, gây sát thương lớn lên quái xương
    player.heal(Math.round(player.maxHp * 0.2));
    for (const e of nearby(P, 9)) {
      spawnBolt(ctx.scene, e.pos.clone().setY(9), e.pos.clone().setY(0.5), 0xfff6d0);
      dealDamage(e, Math.round(30 * pw), { element: 'holy', element2: null }, null, 0, true, false);
    }
    play('forged');
  } else if (el === 'blood') {
    spawnRing(ctx.scene, P, 7, 0xff4a5a, 0.6);
    burst(P.clone().setY(1), 0xd8203a, 50, { speed: 12, size: 0.18 });
    // Xoáy máu hút vào người chơi
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4;
      const from = P.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.5 + Math.random(), Math.sin(a) * r));
      const vel = P.clone().setY(1).sub(from).multiplyScalar(1.8).add(new THREE.Vector3(-Math.sin(a) * 6, 0, Math.cos(a) * 6));
      emit(from, { frame: F.glow, color: 0xff6a7a, color2: 0xa0102a, size: 0.8, size2: 0.1, life: 0.55, vel, drag: 1 });
    }
    aoe(P, 7, Math.round(30 * pw), { element: 'blood', element2: null }, 8, { barrels: true });
    player.heal(Math.round(player.maxHp * 0.35));
  } else {
    spawnRing(ctx.scene, P, 9, 0xffcf4a, 0.6);
    burst(P.clone().setY(0.6), 0xffcf4a, 60, { speed: 16, size: 0.2 });
    play('explode');
    aoe(P, 9, Math.round(50 * pw), { element: 'none', element2: null }, 22);
  }
  damageNumber(P, ULTIMATES[el].name + '!', 'react ult');
}
