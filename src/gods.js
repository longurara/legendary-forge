import * as THREE from 'three';
import { scheduleBomb, dealDamage, spawnToxic } from './combat.js';
import { spawnTelegraph, spawnBolt, spawnRing, damageNumber, smoke, burst } from './fx.js';
import { play } from './audio.js';

// 6 Thần Hộ Mệnh + 18 Thẻ Thần + 15 Thẻ Song Thần (đủ mọi cặp 6C2 = 15!)
export const GODS = [
  { id: 'fire', name: 'Hỏa Thần', icon: 'x_fire-bowl', color: '#ff8a3a', desc: 'Thiêu đốt: lướt để lại lửa, đòn đánh gây cháy, quái chết phát nổ' },
  { id: 'storm', name: 'Lôi Thần', icon: 'x_lightning-storm', color: '#ffe14a', desc: 'Sấm sét: đòn thứ 3 gọi sét, lướt phóng điện, chí mạng lan sét' },
  { id: 'shadow', name: 'Dạ Thần', icon: 'x_hood', color: '#b89aff', desc: 'Bóng đêm: đánh lén, né hoàn hảo cho chuỗi chí mạng, hạ quái được tàng hình' },
  { id: 'wind', name: 'Phong Thần', icon: 'x_tornado', color: '#a8f0d8', desc: 'Gió lốc: hất văng mạnh, thêm lướt, lốc xoáy quanh người' },
  { id: 'frost', name: 'Băng Thần', icon: 'x_snowflake2', color: '#7fdcff', desc: 'Hàn khí: tỏa vòng băng đóng băng, đập vỡ băng nổ lan, tạo khiên băng định kỳ' },
  { id: 'plague', name: 'Độc Thần', icon: 'x_poison-bottle', color: '#8fe83a', desc: 'Dịch hạch: chồng độc mọi đòn, lướt rải vũng độc, quái chết truyền độc lan rộng' },
];

export const BOONS = [
  // Hỏa Thần
  { id: 'b_trail', god: 'fire', name: 'Bước Chân Lửa', icon: 'x_flame-tunnel', max: 1, desc: () => 'Lướt để lại vệt lửa đốt quái', apply: (s) => { s.firetrail = true; } },
  { id: 'b_ignite', god: 'fire', name: 'Lưỡi Rực', icon: 'x_fire-zone', max: 1, desc: () => 'Mọi đòn đánh đều gây cháy', apply: (s) => { s.ignite = true; } },
  { id: 'b_killboom', god: 'fire', name: 'Tro Tàn', icon: 'x_explosion', max: 1, desc: () => 'Quái chết phát nổ, đốt quái xung quanh', apply: (s) => { s.killboom = true; } },
  // Lôi Thần
  { id: 'b_third', god: 'storm', name: 'Nhịp Sấm', icon: 'x_lightning-storm', max: 1, desc: () => 'Mỗi đòn trúng thứ 3 gọi sét giáng xuống', apply: (s) => { s.third = true; } },
  { id: 'b_dashshock', god: 'storm', name: 'Lướt Điện', icon: 'x_charged', max: 1, desc: () => 'Lướt phóng điện vào quái xung quanh', apply: (s) => { s.dashshock = true; } },
  { id: 'b_critchain', god: 'storm', name: 'Sét Lan', icon: 'p_chain', max: 1, desc: () => 'Chí mạng lan sét sang 2 quái gần đó', apply: (s) => { s.critchain = true; } },
  // Dạ Thần
  { id: 'b_backstab', god: 'shadow', name: 'Đâm Sau Lưng', icon: 'x_daggers', max: 1, desc: () => 'Đánh từ phía sau gây thêm 60% sát thương', apply: (s) => { s.backstab = true; } },
  { id: 'b_shadowcrit', god: 'shadow', name: 'Chuỗi Bóng', icon: 'x_ghost2', max: 1, desc: () => 'Né hoàn hảo / đỡ đòn: 3 đòn sau chắc chắn chí mạng', apply: (s) => { s.shadowcrit = true; } },
  { id: 'b_killinvis', god: 'shadow', name: 'Tan Vào Bóng', icon: 'x_night', max: 1, desc: () => 'Hạ quái được bất tử 0.6 giây', apply: (s) => { s.killinvis = true; } },
  // Phong Thần
  { id: 'b_gust', god: 'wind', name: 'Cuồng Phong', icon: 'x_tornado', max: 1, desc: () => 'Đòn đánh hất văng mạnh hơn 70% (dễ hất xuống vực, đập tường)', apply: (s) => { s.gust = true; } },
  { id: 'b_dashext', god: 'wind', name: 'Cánh Gió', icon: 'x_winged-leg', max: 1, desc: () => 'Thêm 1 lần lướt, lướt hồi nhanh hơn 30%', apply: (s) => { s.dashCharges += 1; s.dashCd *= 0.7; } },
  { id: 'b_tornado', god: 'wind', name: 'Mắt Bão', icon: 'x_arrows', max: 1, desc: () => 'Mỗi 5 giây một luồng lốc quanh người hất văng quái', apply: (s) => { s.tornado = true; } },
  // Băng Thần
  { id: 'b_frostnova', god: 'frost', name: 'Hàn Vòng', icon: 'x_ice-cast', max: 1, desc: () => 'Đòn cuối combo tỏa vòng băng 4m làm chậm & tích đóng băng', apply: (s) => { s.frostNova = true; } },
  { id: 'b_shatter', god: 'frost', name: 'Phá Băng', icon: 'x_frozen', max: 1, desc: () => 'Đánh trúng quái đang chậm hoặc đóng băng gây thêm +45% sát thương', apply: (s) => { s.frostShatter = true; } },
  { id: 'b_icearmor', god: 'frost', name: 'Giáp Tuyết', icon: 'x_snowflake2', max: 1, desc: () => 'Mỗi 12 giây tạo Khiên Băng hấp thụ 22 sát thương', apply: (s) => { s.iceArmor = true; } },
  // Độc Thần
  { id: 'b_venom', god: 'plague', name: 'Nọc Cổ', icon: 'x_poison-bottle', max: 1, desc: () => 'Mọi đòn đánh chồng thêm 1 tầng Độc ăn mòn mục tiêu', apply: (s) => { s.venomHit = true; } },
  { id: 'b_toxicstep', god: 'plague', name: 'Bước Dịch Hạch', icon: 'x_poison-gas', max: 1, desc: () => 'Lướt để lại vũng độc bào tử gây hại & tích độc cho quái', apply: (s) => { s.toxicStep = true; } },
  { id: 'b_contagion', god: 'plague', name: 'Lây Lan', icon: 'x_death-zone', max: 1, desc: () => 'Quái chết truyền toàn bộ tầng Độc sang quái trong 4.5m', apply: (s) => { s.contagion = true; } },
];

// 15 Thẻ Song Thần (đủ mọi cặp giữa 6 vị thần!)
export const DUOS = [
  { id: 'd_plasma', gods: ['fire', 'storm'], name: 'Plasma', icon: 'x_explosion', max: 1, duo: true, desc: () => 'Đánh trúng quái đang cháy: 30% gây nổ Quá Tải', apply: (s) => { s.plasma = true; } },
  { id: 'd_stormcall', gods: ['storm', 'wind'], name: 'Gọi Bão', icon: 'x_lightning-storm', max: 1, duo: true, desc: () => 'Mỗi luồng lốc gọi thêm 3 tia sét', apply: (s) => { s.stormcall = true; s.tornado = true; } },
  { id: 'd_shadowflame', gods: ['shadow', 'fire'], name: 'Hắc Hỏa', icon: 'x_fire-bowl', max: 1, duo: true, desc: () => 'Đánh lén gây cháy dữ dội và thêm 30% sát thương', apply: (s) => { s.shadowflame = true; s.backstab = true; } },
  { id: 'd_phantomstep', gods: ['wind', 'shadow'], name: 'Bước Ảo', icon: 'x_ghost2', max: 1, duo: true, desc: () => 'Sau khi lướt được bất tử thêm 0.4 giây', apply: (s) => { s.phantomstep = true; } },
  { id: 'd_firestorm', gods: ['fire', 'wind'], name: 'Lốc Lửa', icon: 'x_flame-tunnel', max: 1, duo: true, desc: () => 'Luồng lốc để lại vòng lửa; vệt lửa rộng gấp đôi', apply: (s) => { s.firestorm = true; s.tornado = true; } },
  { id: 'd_thunderstep', gods: ['shadow', 'storm'], name: 'Sấm Bóng', icon: 'x_charged', max: 1, duo: true, desc: () => 'Né hoàn hảo gọi sét lên mọi quái trong 6m', apply: (s) => { s.thunderstep = true; } },
  // 9 Cặp Song Thần mới với Băng Thần & Độc Thần
  { id: 'd_thermal', gods: ['fire', 'frost'], name: 'Nhiệt Sốc', icon: 'x_ice-cast', max: 1, duo: true, desc: () => 'Phản ứng Tan Chảy tăng sát thương lên ×2.6 và tạo sóng nổ hơi nước', apply: (s) => { s.thermalShock = true; s.ignite = true; } },
  { id: 'd_magstorm', gods: ['storm', 'frost'], name: 'Bão Từ Hàn', icon: 'x_frozen', max: 1, duo: true, desc: () => 'Sét đánh vào quái đang chậm lập tức đóng băng và nổ lan', apply: (s) => { s.magStorm = true; s.third = true; } },
  { id: 'd_frostshadow', gods: ['shadow', 'frost'], name: 'Hàn Ảnh', icon: 'x_snowflake2', max: 1, duo: true, desc: () => 'Chí mạng luôn đóng băng mục tiêu 1.2s và +35% sát thương lên quái đóng băng', apply: (s) => { s.frostShadow = true; s.frostShatter = true; } },
  { id: 'd_blizzwind', gods: ['wind', 'frost'], name: 'Tuyết Lốc', icon: 'x_tornado', max: 1, duo: true, desc: () => 'Luồng lốc Mắt Bão đóng băng toàn bộ quái trong 5.5m', apply: (s) => { s.blizzWind = true; s.tornado = true; } },
  { id: 'd_hellgas', gods: ['fire', 'plague'], name: 'Khí Hỏa Ngục', icon: 'x_explosion', max: 1, duo: true, desc: () => 'Đánh quái có ≥ 3 tầng Độc tự kích nổ Khí Lửa diện rộng!', apply: (s) => { s.hellGas = true; s.venomHit = true; } },
  { id: 'd_voltvenom', gods: ['storm', 'plague'], name: 'Lôi Độc', icon: 'x_poison-gas', max: 1, duo: true, desc: () => 'Sét lan truyền đồng thời chồng 2 tầng Độc lên mọi mục tiêu trúng', apply: (s) => { s.voltVenom = true; s.critchain = true; } },
  { id: 'd_darkblight', gods: ['shadow', 'plague'], name: 'Ám Độc', icon: 'x_death-zone', max: 1, duo: true, desc: () => 'Mỗi tầng Độc trên mục tiêu tăng +6% tỉ lệ chí mạng lên mục tiêu đó', apply: (s) => { s.darkBlight = true; s.venomHit = true; } },
  { id: 'd_plaguewind', gods: ['wind', 'plague'], name: 'Bão Dịch Hạch', icon: 'x_poison-bottle', max: 1, duo: true, desc: () => 'Luồng lốc Mắt Bão rải độc và hút quái về tâm vụ nổ', apply: (s) => { s.plagueWind = true; s.tornado = true; s.contagion = true; } },
  { id: 'd_permafrost', gods: ['frost', 'plague'], name: 'Băng Hủ', icon: 'x_frozen', max: 1, duo: true, desc: () => 'Quái đang bị Độc không thể tan băng sớm & chịu sát thương độc gấp đôi!', apply: (s) => { s.permaFrost = true; s.venomHit = true; } },
];

export const godsOf = (levels) => new Set(BOONS.filter((b) => levels[b.id]).map((b) => b.god));

export function godCards(levels, patron, boostDuo = false) {
  const owned = godsOf(levels);
  const duos = DUOS.filter((d) => !levels[d.id] && d.gods.every((g) => owned.has(g)));
  const mine = BOONS.filter((b) => b.god === patron && !levels[b.id]);
  const out = [];
  if (duos.length) out.push(duos[Math.floor(Math.random() * duos.length)]);
  if (boostDuo && duos.length > 1) {
    const rest = duos.filter((d) => !out.includes(d));
    if (rest.length) out.push(rest[Math.floor(Math.random() * rest.length)]);
  }
  while (out.length < 2 && mine.length) out.push(mine.splice(Math.floor(Math.random() * mine.length), 1)[0]);
  return out;
}

// ---------- Tranh Chấp Thần Linh (Trial of the Gods — 6 Vị Thần) ----------
export const GOD_WRATH = {
  fire: { name: 'Cơn Giận Hỏa Thần', desc: 'Cột nham thạch phun trào liên tục khắp đấu trường' },
  storm: { name: 'Cơn Giận Lôi Thần', desc: 'Lưới sét giáng xuống quanh bạn định kỳ' },
  shadow: { name: 'Cơn Giận Dạ Thần', desc: 'Bóng đêm bùng nổ xung kích làm chậm & sát thương quanh bạn' },
  wind: { name: 'Cơn Giận Phong Thần', desc: 'Cuồng phong giật mạnh xô đẩy bạn khắp phòng' },
  frost: { name: 'Cơn Giận Băng Thần', desc: 'Mưa tinh thể băng rơi làm chậm & đóng băng quanh bạn' },
  plague: { name: 'Cơn Giận Độc Thần', desc: 'Bùn độc bào tử liên tục trào lên quanh chân bạn' },
};

export function pickTrialPair(rand = Math.random) {
  const pool = [...GODS].sort(() => rand() - 0.5);
  return [pool[0], pool[1]];
}

export function tickGodWrath(godId, dt, state, scene, player, enemies) {
  if (!godId || !player || player.dead) return;
  state.t = (state.t || 2.2) - dt;
  if (state.t > 0) return;

  if (godId === 'fire') {
    state.t = 2.6;
    for (let i = 0; i < 2; i++) {
      const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
      scheduleBomb(at, 1.05, 2.2, 10, 14, 0xff5a1a);
    }
  } else if (godId === 'storm') {
    state.t = 2.4;
    const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
    spawnTelegraph(scene, { shape: 'circle', pos: at, radius: 2.1, duration: 0.9, color: 0xffe14a });
    setTimeout(() => {
      if (player.dead) return;
      spawnBolt(scene, at.clone().setY(10), at.clone().setY(0.3), 0xffe14a);
      spawnRing(scene, at, 2.1, 0xffe14a, 0.35);
      play('zap', { at });
      if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 2.1 + player.radius) {
        if (player.hurt(15)) damageNumber(player.pos, 15, 'player');
      }
    }, 900);
  } else if (godId === 'shadow') {
    state.t = 3.0;
    const at = player.pos.clone();
    spawnTelegraph(scene, { shape: 'circle', pos: at, radius: 3.0, duration: 0.95, color: 0xb89aff });
    setTimeout(() => {
      if (player.dead) return;
      smoke(at.clone().setY(0.8), { count: 8, color: 0x2a1040, size: 1.5, life: 0.9, alpha: 0.65 });
      spawnRing(scene, at, 3.0, 0xb89aff, 0.4);
      play('dash', { at, rate: 0.5 });
      if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 3.0 + player.radius) {
        player.slowT = Math.max(player.slowT, 2.2);
        if (player.hurt(14)) damageNumber(player.pos, 14, 'player');
      }
    }, 950);
  } else if (godId === 'wind') {
    state.t = 2.8;
    const a = Math.random() * Math.PI * 2;
    const gx = Math.cos(a), gz = Math.sin(a);
    spawnRing(scene, player.pos, 5, 0xa8f0d8, 0.45);
    play('dash', { at: player.pos, rate: 0.6 });
    damageNumber(player.pos, 'Gió Quật!', 'react shatter');
    player.pos.x += gx * 2.4;
    player.pos.z += gz * 2.4;
    for (const e of enemies) {
      if (e.alive && !e.isBoss) { e.knock.x += gx * 7; e.knock.z += gz * 7; }
    }
  } else if (godId === 'frost') {
    state.t = 2.6;
    for (let i = 0; i < 2; i++) {
      const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
      spawnTelegraph(scene, { shape: 'circle', pos: at, radius: 2.3, duration: 0.95, color: 0x7fdcff });
      setTimeout(() => {
        if (player.dead) return;
        spawnRing(scene, at, 2.3, 0x7fdcff, 0.4);
        burst(at.clone().setY(0.5), 0xbff4ff, 14, { speed: 6, size: 0.16 });
        play('freeze', { at, rate: 1.0 });
        if (Math.hypot(player.pos.x - at.x, player.pos.z - at.z) < 2.3 + player.radius) {
          player.slowT = Math.max(player.slowT, 2.8);
          if (player.hurt(13)) damageNumber(player.pos, 13, 'player');
        }
      }, 950);
    }
  } else if (godId === 'plague') {
    state.t = 2.7;
    for (let i = 0; i < 2; i++) {
      const at = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
      spawnToxic(at, 1.9, 6.0);
      burst(at.clone().setY(0.2), 0x8fe83a, 8, { speed: 4, size: 0.14 });
    }
    play('slimeLand', { at: player.pos, rate: 0.85, vol: 0.5 });
  }
}
