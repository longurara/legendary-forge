import * as THREE from 'three';
import { endFrame, pressed, mouse, pollGamepad, pad } from './input.js';
import { buildWorld, updateWorld, isBlocked, ROOM_HALF, spawnExit, removeExit, exitPos, floorTheme, setDark, setDarkHook } from './world.js';
import { Player, SPECIALS } from './player.js';
import { Slime, Mage } from './enemies.js';
import { Healer, ShieldBearer, Bomber, Wraith, ShadowLord } from './enemies_new.js';
import { Minion, Boss, Assassin, Archer, KingSlime, ArchMage } from './enemies_extra.js';
import { initFx, updateFx, shake, hitStop, clearFx, damageNumber, fxQuality, setFxQuality, dmgScale, explosion, spawnRing as fxRing, flash as fxFlash } from './fx.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as combat from './combat.js';
import { ctx, updateProjectiles, clearProjectiles } from './combat.js';
import * as weaponsMod from './weapons.js';
import { Loot } from './loot.js';
import { loadModels } from './models.js';
import { randomWeapon, forgeWeapons, weaponName, weaponIcons, makeWeapon, rollAffixes, affixById, codexKey, RARITY, TYPES, ELEMENTS, scrapValue, MAX_PLUS, enhanceCost, weaponScore } from './weapons.js';
import { weaponIcon, $, show } from './ui.js';
import { PERKS, EVOLUTIONS, rollPerks, xpForLevel, META, loadMeta, saveMeta } from './perks.js';
import { RELICS, relicById, CHARACTERS, charById, CURSES, EVENTS, ACHIEVEMENTS } from './content.js';
import { makeElite, updateEliteLabels } from './elites.js';
import { buildHazards, updateHazards } from './hazards.js';
import { Rewards, REWARDS } from './rewards.js';
import { updateAbilities, clearAbilities, ULTIMATES } from './abilities.js';
import { setMusic, updateMusic, unlockMusic } from './music.js';
import { loadSounds, unlockAudio, play, setListener, getVolume, setVolume, isMuted, setMuted } from './audio.js';

// ================= Khởi tạo =================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const CAM_OFFSET = new THREE.Vector3(0, 19, 13.5);
let camZoom = 1;

// Hậu kỳ: bloom làm các hiệu ứng sáng (lửa, phép, tia sét, đuốc) phát quang
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.92);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
function applyFxQuality() {
  bloomPass.enabled = fxQuality.high;
  const b = document.getElementById('btn-fx');
  if (b) b.textContent = 'Hiệu ứng: ' + (fxQuality.high ? 'Cao' : 'Thấp');
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ================= Ngẫu nhiên có hạt giống (thử thách hằng ngày) =================
// Thử thách hằng ngày: đội hình quái, vị trí, biến cố, tinh anh, phần thưởng, cửa hàng, bẫy
// dùng luồng ngẫu nhiên riêng theo (ngày, tầng, đợt) nên mọi lượt trong ngày gặp cùng chuỗi thử thách.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (tag) => (run.daily ? mulberry(daySeed() * 1000 + floor * 100 + wave * 10 + tag) : Math.random);
function setSeed() {}
const todayKey = () => new Date().toISOString().slice(0, 10);
const daySeed = () => Number(todayKey().replace(/-/g, ''));

// ================= HUD =================
const hud = {
  hpFill: $('hp-fill'), hpGhost: $('hp-ghost'), hpText: $('hp-text'), wave: $('wave'), kills: $('kills'), best: $('best'),
  dashRing: $('dash-ring'), banner: $('banner'), sub: $('banner-sub'), bannerWrap: $('banner-wrap'),
  hurt: $('hurt'), lowhp: $('lowhp'), left: $('enemies-left'), timer: $('timer'),
  slots: [$('slot0'), $('slot1')], prompt: $('prompt'), start: $('start'), startBest: $('start-best'),
};
let bannerTimer = 0;
function showBanner(text, sub = '', sec = 1.8, color = '') {
  hud.banner.textContent = text;
  hud.banner.style.color = color;
  hud.sub.textContent = sub;
  hud.bannerWrap.classList.add('show');
  bannerTimer = sec;
}

const toastQueue = [];
let toastT = 0;
function toast(icon, title, text) { toastQueue.push({ icon, title, text }); }
function updateToasts(dt) {
  const el = $('toast');
  toastT -= dt;
  if (toastT <= 0) {
    el.classList.remove('show');
    if (toastQueue.length && toastT < -0.4) {
      const t = toastQueue.shift();
      el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/${t.icon}.svg')"></i><div><b>${t.title}</b><span>${t.text}</span></div>`;
      el.classList.add('show');
      toastT = 3.2;
      play('forged', { vol: 0.6 });
    }
  }
}

const TYPE_LABEL = (w) => (TYPES[w.type].ranged ? 'Đánh xa' : 'Cận chiến');
const affixText = (w) => (w.affixes || []).map((id) => affixById(id)?.name).filter(Boolean);
function renderSlots() {
  for (let i = 0; i < 2; i++) {
    const el = hud.slots[i];
    const w = player.weapons[i];
    el.className = 'slot' + (i === player.slot ? ' active' : '') + (w ? ' r' + w.rarity : ' empty');
    if (!w) {
      el.innerHTML = `<span class="num">${i + 1}</span><div class="icon"></div><div class="info"><div class="name">Trống</div><div class="meta">Nhặt thêm vũ khí bằng phím E</div></div>`;
      continue;
    }
    const r = RARITY[w.rarity];
    const aff = affixText(w);
    el.title = aff.join('\n');
    el.innerHTML = `<span class="num">${i + 1}</span>
      <div class="icon"><img src="${weaponIcon(w)}" alt=""></div>
      <div class="info"><div class="name" style="color:${r.css}">${weaponName(w)}</div>
      <div class="meta">${weaponIcons(w)}<span>${r.name} · ${TYPE_LABEL(w)}</span></div>
      ${aff.length ? `<div class="affixes">${aff.map((a) => `<span>${a}</span>`).join('')}</div>` : ''}</div>`;
  }
  const sp = SPECIALS[player.weapon.type];
  $('special-ico').style.setProperty('--i', `url('/ui/icons/${sp.icon}.svg')`);
  $('special-name').textContent = sp.name;
  const el = player.weapon.element !== 'none' ? player.weapon.element : 'none';
  $('ult-name').textContent = ULTIMATES[el].name;
}

function renderRelics() {
  $('relics').innerHTML = player.relics.map((id) => {
    const r = relicById(id);
    return `<div class="relic" title="${r.name}: ${r.desc}"><i class="ico" style="--i:url('/ui/icons/${r.icon}.svg')"></i></div>`;
  }).join('');
}

// ================= Trạng thái =================
let player, loot, rewards;
let enemies = [];
let wave = 0;
let kills = 0;
let intermission = 1.2;
let started = false;
let floor = 1;
let exitOpen = false;
let fading = 0;
let meta = loadMeta();
let runSouls = 0;
let gold = 0;
let pendingLevels = 0;
let choosing = false;
let perkChoices = [];
let paused = false;
let ghostHp = 100;
let deathShown = false;
let menuT = 0;
let hurtFlash = 0;
let lastHp = 100;
let best = Number(localStorage.getItem('lorenh_best') || 0);
// Lượt chơi
let run = { char: 'knight', curses: [], daily: false };
let choosingReward = false;      // đang chờ người chơi chọn bệ phần thưởng
let nextReward = null;           // phần thưởng nhận khi dọn xong đợt tới
let challengeWave = false;
let scrap = 0;                   // Mảnh Thép (trong lượt chơi): phân rã vũ khí thừa, dùng để cường hóa
let dropsThisWave = 0;
let arenaT = 0, arenaSpawn = 0, arenaWave = false;
let inShop = false;
let shopItems = [];
let event = null;                // biến cố của đợt hiện tại
let darkLight = null;
let slowmoReal = 0;

const hasCurse = (id) => run.curses.includes(id);
const soulMult = () => (1 + run.curses.reduce((s, id) => s + (CURSES.find((c) => c.id === id)?.bonus || 0), 0)) * (player?.stats.hoard ? 2 : 1);

function spawnPos(minDist = 5.5, r = Math.random) {
  let x, z, tries = 0;
  do {
    x = (r() * 2 - 1) * (ROOM_HALF - 2.5);
    z = (r() * 2 - 1) * (ROOM_HALF - 2.5);
    tries++;
  } while (tries < 80 && (
    Math.hypot(x - player.pos.x, z - player.pos.z) < minDist ||
    Math.hypot(x - player.pos.x, z - player.pos.z) > 22 ||
    isBlocked(x, z, 1.3)
  ));
  return [x, z];
}

// Sức mạnh hiện tại của người chơi (sát thương × tốc đánh × độ hiếm × chí mạng × di vật), 1 = lúc mới vào
function playerPower() {
  const s = player.stats, w = player.weapon;
  const rar = RARITY[w?.rarity || 0]?.mul || 1;
  const crit = 1 + Math.min(1, s.crit) * ((s.critMult || 2) - 1);
  const p = (s.dmg * (s.atk || 1) * rar * crit) / 1.05 * (1 + (player.relics?.length || 0) * 0.04);
  return Math.max(1, Math.min(10, p));
}
// Độ khó theo tầng/đợt: sát thương quái, tốc độ quái
function applyDifficulty() {
  ctx.enemyDmgMul = (1 + (floor - 1) * 0.18 + (wave - 1) * 0.012) * (hasCurse('glass') ? 1 : 1);
  dmgScale.player = ctx.enemyDmgMul;
}

function addEnemy(e, opts = {}) {
  if (!e.isBoss) {
    const r = opts.r || Math.random;
    e.hp = Math.round(e.hp * (1 + (wave - 1) * 0.08) * (1 + (floor - 1) * 0.3) * Math.pow(playerPower(), 0.4) * (hasCurse('tough') ? 1.5 : 1) * (opts.hpMul || 1));
    if (floor >= 3) e.eliteSpeed = (e.eliteSpeed || 1) * (1 + Math.min(0.25, (floor - 2) * 0.06));
    const eliteChance = challengeWave || event?.id === 'elites' ? 1 : wave >= 3 ? Math.min(0.3, 0.04 + wave * 0.02) : 0;
    if (r() < eliteChance) makeElite(e, null, r);
  }
  e.maxHpEff = e.hp;
  enemies.push(e);
}

// ================= Đợt quái =================
function spawnBossWave() {
  const level = 1 + Math.floor((floor - 1) / 4);
  const kind = (floor - 1) % 4;
  const boss = kind === 0 ? new Boss(scene, 0, -8, level) : kind === 1 ? new KingSlime(scene, 0, -8, level)
    : kind === 2 ? new ArchMage(scene, 0, -8, level) : new ShadowLord(scene, 0, -8, level);
  boss.spawnT = -0.4;
  applyDifficulty();
  // Máu boss theo tầng và theo sức mạnh hiện tại của người chơi
  const hpMul = (1 + 0.4 * (floor - 1)) * playerPower();
  boss.hp = boss.maxHp = Math.round(boss.maxHp * hpMul);
  boss.poiseMax = Math.round(boss.poiseMax * Math.sqrt(hpMul));
  boss.phases = floor >= 3 ? [0.6, 0.25] : [0.5];
  boss.bossKind = kind;
  if (hasCurse('bossrage')) {
    boss.hp = boss.maxHp = Math.round(boss.maxHp * 1.5);
    Object.defineProperty(boss, 'enraged', { get: () => true });
  }
  addEnemy(boss);
  for (let i = 0; i < level + 1; i++) {
    const [x, z] = spawnPos();
    const m = kind === 1 ? new Slime(scene, x, z, 'normal') : kind === 3 ? new Wraith(scene, x, z) : new Minion(scene, x, z);
    m.spawnT = -1 - i * 0.5;
    addEnemy(m);
  }
  ctx.enemies = enemies;
  showBanner(boss.name, `Boss tầng ${floor} · đợt ${wave}`, 2.6, '#ff6a4a');
  play('anvil');
}

function spawnWave() {
  wave++;
  event = null;
  ctx.enemySpeed = hasCurse('fast') ? 1.2 : 1;
  setDark(false);
  arenaT = 0; arenaWave = false;
  dropsThisWave = 0;
  if (wave % 5 === 0) { spawnBossWave(); return; }
  applyDifficulty();
  const R = rngFor(1);
  // Biến cố đợt
  if (wave >= 4 && !challengeWave && R() < 0.3) {
    event = EVENTS[Math.floor(R() * EVENTS.length)];
    if (event.id === 'bloodmoon') ctx.enemySpeed *= 1.25;
    if (event.id === 'dark') setDark(true);
    if (event.id === 'arena') { arenaT = 30; arenaSpawn = 3; arenaWave = true; }
  }
  let mult = hasCurse('swarm') ? 1.4 : 1;
  let hpMul = 1;
  if (event?.id === 'horde') { mult *= 2; hpMul = 0.6; }
  const n = (k) => Math.round(k * mult);
  const normals = n(Math.min(2 + wave, 9));
  const bigs = n(Math.min(Math.floor((wave - 1) / 2), 3));
  const lavas = wave >= 2 ? n(Math.min(Math.floor(wave / 2), 4)) : 0;
  const mages = wave >= 3 ? n(Math.min(Math.floor((wave - 1) / 2), 4)) : 0;
  const minions = wave >= 2 ? n(Math.min(Math.floor(wave / 2), 5)) : 0;
  const assassins = wave >= 6 ? n(Math.min(Math.floor((wave - 4) / 2), 3)) : 0;
  const archers = wave >= 4 ? n(Math.min(Math.floor((wave - 2) / 3), 3)) : 0;
  const mothers = wave >= 7 ? n(Math.min(Math.floor((wave - 5) / 3), 2)) : 0;
  const deep = floor - 1;                                    // tầng sâu có thêm quái mới
  const shields = wave >= 3 ? n(Math.min(Math.floor(wave / 4) + Math.min(deep, 2), 4)) : 0;
  const healers = wave >= 4 ? n(Math.min(1 + Math.floor((wave - 4) / 6) + (deep >= 2 ? 1 : 0), 3)) : 0;
  const bombers = wave >= 3 ? n(Math.min(Math.floor((wave - 1) / 3) + deep, 5)) : 0;
  const wraiths = wave >= 8 || deep >= 1 ? n(Math.min(Math.floor(wave / 5) + Math.floor(deep / 2), 4)) : 0;
  const list = [
    ...Array(Math.max(1, normals - bigs)).fill('normal'), ...Array(bigs).fill('big'), ...Array(lavas).fill('lava'),
    ...Array(mages).fill('mage'), ...Array(minions).fill('minion'), ...Array(assassins).fill('assassin'),
    ...Array(archers).fill('archer'), ...Array(mothers).fill('mother'),
    ...Array(healers).fill('healer'), ...Array(bombers).fill('bomber'), ...Array(wraiths).fill('wraith'), ...Array(shields).fill('shield'),
  ];
  if (arenaWave) list.splice(Math.ceil(list.length / 2));
  // Giới hạn tổng số quái: bớt slime thường trước
  const cap = 24 + floor * 2;
  while (list.length > cap) { const i = list.indexOf('normal'); list.splice(i >= 0 ? i : 0, 1); }
  const make = { mage: Mage, minion: Minion, assassin: Assassin, archer: Archer, healer: Healer, shield: ShieldBearer, bomber: Bomber, wraith: Wraith };
  // Đội hình: khiên binh đứng chắn trước quái đánh xa
  const ranged = [];
  for (const kind of list) {
    let [x, z] = spawnPos(5.5, R);
    if (kind === 'shield' && ranged.length) {
      const [rx, rz] = ranged.shift();
      const dx = player.pos.x - rx, dz = player.pos.z - rz, d = Math.hypot(dx, dz) || 1;
      const sx = rx + (dx / d) * 2.4, sz = rz + (dz / d) * 2.4;
      if (!isBlocked(sx, sz, 0.8)) { x = sx; z = sz; }
    }
    if (kind === 'archer' || kind === 'healer' || kind === 'mage') ranged.push([x, z]);
    const e = make[kind] ? new make[kind](scene, x, z) : new Slime(scene, x, z, kind);
    if (kind === 'shield') e.facing = Math.atan2(player.pos.x - x, player.pos.z - z);
    e.spawnT = -R() * 0.6;
    addEnemy(e, { hpMul, r: R });
  }
  ctx.enemies = enemies;
  if (player.hasRelic('badge')) player.shieldHp = 25;
  const parts = [minions && `${minions} lính xương`, shields && `${shields} khiên binh`, archers && `${archers} cung thủ`, assassins && `${assassins} sát thủ`, mages && `${mages} pháp sư`,
    healers && `${healers} pháp sư hồi máu`, bombers && `${bombers} slime bom`, wraiths && `${wraiths} bóng ma`].filter(Boolean).slice(0, 4).join(' · ');
  if (challengeWave) showBanner(`Đợt ${wave}: Thử Thách`, 'Toàn quái tinh anh · thưởng di vật', 2.4, '#ff6a4a');
  else if (event) showBanner(event.name, event.desc, 2.6, event.color);
  else showBanner(`Đợt ${wave}`, parts);
  renderEvent();
  play('waveStart');
}

function renderEvent() {
  const el = $('event-chip');
  if (event) { el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/${event.icon}.svg');color:${event.color}"></i>${event.name}`; el.style.display = ''; }
  else if (challengeWave) { el.innerHTML = '<i class="ico" style="--i:url(\'/ui/icons/x_skull-signet.svg\');color:#ff6a4a"></i>Thử thách'; el.style.display = ''; }
  else el.style.display = 'none';
}

function onWaveCleared() {
  play('waveClear');
  meta.stats.maxWave = Math.max(meta.stats.maxWave || 0, wave);
  setDark(false);
  event = null;
  renderEvent();
  if (arenaWave) { arenaWave = false; addGold(50); addSouls(15); showBanner('Chiến thắng Đấu Trường!', '+50 vàng · +15 Hồn Thép', 2.4, '#ffb040'); }
  // Phần thưởng đã chọn từ bệ
  if (nextReward) { grantReward(nextReward); nextReward = null; }
  if (challengeWave) { challengeWave = false; rewards.spawnChest(0, -3); }
  if (wave % 5 === 0) {
    exitOpen = true;
    spawnExit(0, 0);
    intermission = Infinity;
    showBanner('Lối xuống đã mở', `Tới nắp hầm giữa phòng, bấm E để xuống tầng ${floor + 1}`, 3.2, '#7fd8ff');
    checkAchievements();
    return;
  }
  if (wave <= 2 || Math.random() < 0.4) {
    const [x, z] = spawnPos(2);
    loot.drop(randomWeapon(wave), x, z);
  }
  if (wave % 3 === 0) {
    loot.removeAnvil();
    loot.spawnAnvil(6, -2);
    loot.anvilUses = player.hasRelic('gauntlet') ? 2 : 1;
    showBanner('Đe Rèn xuất hiện!', 'Mang 2 vũ khí tới đe, bấm E để rèn', 2.6, '#ffa040');
  }
  if (!hasCurse('nopot')) player.heal(10 + (meta.up.regen || 0) * 6);
  // Bệ phần thưởng cho đợt sau
  offerRewards();
  checkAchievements();
}

function offerRewards() {
  const R = rngFor(2);
  const pool = ['weapon', 'perk', 'souls', 'gold', 'potion'];
  if (R() < 0.18) pool.push('relic');
  if (wave >= 2 && R() < 0.35) pool.push('shop');
  if (wave >= 3 && R() < 0.25) pool.push('challenge');
  if (wave >= 3 && R() < 0.2) pool.push('treasure');
  const pick = [];
  const n = R() < 0.3 ? 3 : 2;
  while (pick.length < n && pool.length) pick.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  if (hasCurse('nopot')) { const i = pick.indexOf('potion'); if (i >= 0) pick[i] = 'gold'; }
  rewards.offer(pick, -7);
  choosingReward = true;
  intermission = Infinity;
}

function chooseReward(kind) {
  rewards.clearPedestals();
  choosingReward = false;
  play('uiConfirm');
  if (kind === 'shop') {
    openShopRoom();
    return;
  }
  if (kind === 'treasure') {
    // Phòng kho báu: 2 rương + vàng rải khắp nơi, không có quái
    rewards.spawnChest(-3, -4); rewards.spawnChest(3, -4);
    for (let i = 0; i < 16; i++) { const [x, z] = spawnPos(1.5); loot.spawnPickup('gold', x, z, 4); }
    showBanner('Phòng Kho Báu', 'Mở rương (E) và nhặt vàng trước khi đợt sau tới', 2.4, '#ffd060');
    intermission = 15;
    return;
  }
  if (kind === 'challenge') challengeWave = true;
  else nextReward = kind;
  const r = REWARDS[kind];
  showBanner(r.name, kind === 'challenge' ? r.desc : 'Nhận khi dọn sạch đợt tới', 1.8, '#' + r.color.toString(16).padStart(6, '0'));
  intermission = 2.5;
  renderNextReward();
}

function renderNextReward() {
  const el = $('next-reward');
  if (nextReward) {
    const r = REWARDS[nextReward];
    el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/${r.icon}.svg');color:#${r.color.toString(16).padStart(6, '0')}"></i>Phần thưởng: ${r.name}`;
    el.style.display = '';
  } else el.style.display = 'none';
}

function grantReward(kind) {
  const at = player.pos.clone().add(new THREE.Vector3(0, 0, -2));
  if (kind === 'weapon') { const w = randomWeapon(wave + 3); w.rarity = Math.min(2, Math.max(1, w.rarity + 1)); w.affixes = rollAffixes(w.rarity); loot.drop(w, at.x, at.z); }
  else if (kind === 'perk') { pendingLevels++; if (!choosing) openLevelUp(); }
  else if (kind === 'souls') addSouls(25);
  else if (kind === 'gold') addGold(40);
  else if (kind === 'potion') player.heal(player.maxHp);
  else if (kind === 'relic') rewards.spawnChest(at.x, at.z);
  nextReward = null;
  renderNextReward();
}

function addSouls(v) {
  v = Math.max(1, Math.round(v * (1 + (meta.up.souls || 0) * 0.2) * soulMult()));
  runSouls += v;
  meta.souls += v;
  saveMeta(meta);
}
function addScrap(v) { scrap += v; $('scrap').textContent = scrap; }
function addGold(v) {
  v = Math.round(v * (player.hasRelic('goldbag') ? 1.5 : 1) * (player.stats.hoard ? 2 : 1));
  gold += v;
}

function grantRelic() {
  const pool = RELICS.filter((r) => !player.hasRelic(r.id));
  if (!pool.length) { addGold(60); return; }
  const r = pool[Math.floor(Math.random() * pool.length)];
  player.addRelic(r.id);
  meta.relicsSeen[r.id] = true;
  saveMeta(meta);
  renderRelics();
  showBanner(r.name, r.desc, 3, '#c77dff');
  checkAchievements();
}

// ================= Thương nhân =================
function openShopRoom() {
  inShop = true;
  rewards.spawnMerchant(0, -7);
  const R = rngFor(3);
  const w1 = randomWeapon(wave + 2, R); w1.rarity = Math.max(1, w1.rarity); w1.affixes = rollAffixes(w1.rarity, [], R);
  const w2 = randomWeapon(wave + 4, R); w2.rarity = 2; w2.affixes = rollAffixes(2, [], R);
  shopItems = [
    { id: 'potion', name: 'Bình máu lớn', icon: 'potion', desc: 'Hồi 50% máu', price: 30 },
    { id: 'perk', name: 'Thẻ năng lực', icon: 'level', desc: 'Lên thêm 1 cấp', price: 60 },
    { id: 'weapon', name: weaponName(w1), icon: null, weapon: w1, desc: RARITY[w1.rarity].name, price: 55 },
    { id: 'weapon', name: weaponName(w2), icon: null, weapon: w2, desc: RARITY[2].name, price: 120 },
    { id: 'relic', name: 'Di vật bí ẩn', icon: 'x_locked-chest', desc: 'Một di vật ngẫu nhiên', price: 110 },
    { id: 'maxhp', name: 'Áo giáp vá', icon: 'p_hp', desc: '+15 máu tối đa', price: 70 },
    { id: 'affix', name: 'Đá phụ tố', icon: 'x_rune', desc: 'Thêm 1 phụ tố cho vũ khí đang cầm', price: 80 },
  ].filter((it) => !(hasCurse('nopot') && it.id === 'potion'));
  showBanner('Thương nhân', 'Lại gần và bấm E để mua đồ', 2.2, '#ffa040');
  intermission = Infinity;
}

function renderShop() {
  $('shop-gold').textContent = gold;
  $('shop-items').innerHTML = shopItems.map((it, i) => {
    const icon = it.weapon ? `<img src="${weaponIcon(it.weapon)}" alt="">` : `<i class="ico" style="--i:url('/ui/icons/${it.icon}.svg')"></i>`;
    const color = it.weapon ? RARITY[it.weapon.rarity].css : '';
    return `<div class="shop-item${it.sold ? ' sold' : ''}">
      <div class="si-icon">${icon}</div>
      <div class="si-info"><h4 style="color:${color}">${it.name} ${it.weapon ? weaponIcons(it.weapon) : ''}</h4><p>${it.desc}${it.weapon && it.weapon.affixes.length ? ' · ' + affixText(it.weapon).join(', ') : ''}</p></div>
      <button class="btn buy" data-i="${i}" ${it.sold || gold < it.price ? 'disabled' : ''}>${it.sold ? 'Đã mua' : `<i class="ico ico-gold"></i>${it.price}`}</button>
    </div>`;
  }).join('');
  for (const b of $('shop-items').querySelectorAll('.buy')) b.onclick = () => buyItem(Number(b.dataset.i));
}

function buyItem(i) {
  const it = shopItems[i];
  if (!it || it.sold || gold < it.price) { play('uiBack'); return; }
  gold -= it.price;
  it.sold = true;
  play('pickup');
  if (it.id === 'potion') player.heal(Math.round(player.maxHp * 0.5));
  else if (it.id === 'perk') { pendingLevels++; }
  else if (it.id === 'weapon') { const old = player.pickUp(it.weapon); recordCodex(it.weapon); if (old) loot.drop(old, player.pos.x, player.pos.z + 1.5); }
  else if (it.id === 'relic') grantRelic();
  else if (it.id === 'maxhp') { player.maxHp += 15; player.hp += 15; }
  else if (it.id === 'affix') { const w = player.weapon; w.affixes = (w.affixes || []).concat(rollAffixes(1, w.affixes || [])); player.equip(player.slot); }
  renderShop();
  renderSlots();
}

function leaveShop() {
  show('shop', false);
  rewards.removeMerchant();
  inShop = false;
  intermission = 2;
  setMode('playing');
  if (pendingLevels > 0) openLevelUp();
}

// ================= Chơi lại / menu =================
function restart() {
  for (const e of enemies) if (!e.dead) e.die();
  enemies = [];
  ctx.enemies = enemies;
  clearFx();
  clearProjectiles();
  clearAbilities();
  loot.clear();
  rewards.clear();
  if (run.daily) setSeed(daySeed());
  player.meta = meta;
  player.curses = run.curses;
  player.setCharacter(run.char);
  player.reset();
  player.onWeaponsChanged = renderSlots;
  recordCodex(player.weapon);
  renderSlots();
  renderRelics();
  runSouls = 0;
  gold = 0;
  scrap = 0; dropsThisWave = 0;
  const se = document.getElementById('scrap'); if (se) se.textContent = 0;
  pendingLevels = 0;
  exitOpen = false;
  removeExit();
  floor = 1;
  buildWorld(scene, 1);
  buildHazards(scene, 1, rngFor(4));
  choosing = false;
  choosingReward = false;
  nextReward = null;
  challengeWave = false;
  inShop = false;
  event = null;
  ctx.enemySpeed = hasCurse('fast') ? 1.2 : 1;
  setDark(false);
  renderEvent();
  renderNextReward();
  for (const id of ['levelup', 'boss-bar', 'gameover', 'pause', 'howto', 'shop']) show(id, false);
  wave = 0;
  kills = 0;
  intermission = 1;
  lastHp = ghostHp = player.hp;
  deathShown = false;
  paused = false;
  setMode(started ? 'playing' : 'menu');
}

function setMode(m) {
  document.body.classList.toggle('menu', m === 'menu');
  document.body.classList.toggle('playing', m === 'playing');
}

function setPaused(p) {
  if (!started || player.dead || inShopOpen()) return;
  paused = p;
  show('pause', p);
  play(p ? 'uiOpen' : 'uiClose');
  if (!p) show('howto', false);
  setMode(p ? 'menu' : 'playing');
}
const inShopOpen = () => !$('shop').classList.contains('hidden');

// ================= Xuống tầng =================
function descend() {
  fading = 1.2;
  play('anvil');
  setTimeout(() => {
    floor++;
    meta.stats.maxFloor = Math.max(meta.stats.maxFloor || 0, floor);
    saveMeta(meta);
    exitOpen = false;
    removeExit();
    loot.clear();
    rewards.clear();
    for (const e of enemies) if (!e.dead) e.die();
    enemies = [];
    ctx.enemies = enemies;
    clearProjectiles();
    const theme = buildWorld(scene, floor);
    buildHazards(scene, floor, rngFor(4));
    player.pos.set(0, 0, ROOM_HALF - 4);
    player.heal(Math.round(player.maxHp * 0.3));
    camera.position.copy(player.pos).add(CAM_OFFSET);
    intermission = 2.5;
    showBanner(`Tầng ${floor}`, theme.name, 2.8, '#ffe2a0');
    play('waveStart');
    checkAchievements();
  }, 550);
}

function updateFade(dt) {
  const el = $('fade');
  if (fading > 0) { fading = Math.max(0, fading - dt); el.style.opacity = fading > 0.6 ? (1.2 - fading) / 0.6 : fading / 0.6; }
  else el.style.opacity = 0;
}

// ================= Mũi tên chỉ quái ngoài màn hình =================
const arrowPool = [];
const tmpV = new THREE.Vector3();
function updateArrows() {
  const layer = $('arrows');
  let used = 0;
  if (started && !player.dead) {
    for (const e of enemies) {
      if (e.dead || used >= 14) continue;
      tmpV.set(e.pos.x, 1, e.pos.z).project(camera);
      if (Math.abs(tmpV.x) < 0.95 && Math.abs(tmpV.y) < 0.92 && tmpV.z < 1) continue;
      let x = tmpV.x, y = tmpV.y;
      if (tmpV.z > 1) { x = -x; y = -y; }
      const ang = Math.atan2(y, x);
      const k = Math.min(0.9 / Math.abs(Math.cos(ang) || 1e-6), 0.82 / Math.abs(Math.sin(ang) || 1e-6));
      const sx = (Math.cos(ang) * k * 0.5 + 0.5) * innerWidth, sy = (-Math.sin(ang) * k * 0.5 + 0.5) * innerHeight;
      let el = arrowPool[used];
      if (!el) { el = document.createElement('div'); layer.appendChild(el); arrowPool.push(el); }
      el.className = 'arrow' + (e.isBoss ? ' boss' : e.elite ? ' elite' : '');
      el.style.display = '';
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) rotate(${-ang}rad)`;
      used++;
    }
  }
  for (let i = used; i < arrowPool.length; i++) arrowPool[i].style.display = 'none';
}

// ================= Khi hạ quái =================
function onKill(e) {
  const st = player.stats;
  meta.stats.kills = (meta.stats.kills || 0) + 1;
  if (e instanceof Slime || e instanceof KingSlime) meta.stats.slimes = (meta.stats.slimes || 0) + 1;
  if (e.elite) meta.stats.elites = (meta.stats.elites || 0) + 1;
  gainXp(e.xp || 1);
  if (st.killHeal) player.heal(st.killHeal);
  const dropMult = event?.id === 'bloodmoon' ? 2 : 1;
  // Hồn Thép & vàng
  if (e.isBoss) { for (let i = 0; i < 8; i++) loot.spawnPickup('soul', e.pos.x, e.pos.z, 5); for (let i = 0; i < 6; i++) loot.spawnPickup('gold', e.pos.x, e.pos.z, 6); }
  else {
    loot.spawnPickup('soul', e.pos.x, e.pos.z, Math.ceil((e.xp || 1) / 2) + (player.hasRelic('skull') ? 1 : 0));
    if (Math.random() < 0.55 * dropMult) loot.spawnPickup('gold', e.pos.x, e.pos.z, (e.elite ? 5 : 1) + Math.floor(Math.random() * 2));
  }
  // Bình máu
  const potionChance = hasCurse('nopot') ? 0 : e.isBoss ? 1 : 0.06 * (1 + st.luck) * dropMult;
  if (Math.random() < potionChance) loot.spawnPickup('potion', e.pos.x, e.pos.z);
  // Vũ khí rơi
  if (e.isBoss) {
    const w = randomWeapon(wave); w.rarity = Math.max(2, w.rarity); w.affixes = rollAffixes(w.rarity);
    loot.drop(w, e.pos.x, e.pos.z);
    rewards.spawnChest(e.pos.x + 2, e.pos.z);
    meta.stats.bossKills = (meta.stats.bossKills || 0) + 1;
    runInfo().bossKilled = true;
    run.bossKilled = true;
    showBanner('Đã hạ Boss!', 'Rơi vũ khí Sử thi và rương di vật', 2.5, '#ffcf4a');
    player.slowmoT = 1.6;
    slowmoReal = 1.6;
  } else if (Math.random() < e.dropChance * 0.35 * (1 + st.luck) * dropMult) {
    const w = randomWeapon(wave);
    if (w.rarity < 2 && Math.random() < st.luck * 0.3) { w.rarity++; w.affixes = rollAffixes(w.rarity); }
    const best = Math.max(...player.weapons.map(weaponScore));
    // Đồ kém hơn hẳn đồ đang cầm, hoặc đã rơi đủ trong đợt / sàn quá nhiều đồ: thành Mảnh Thép
    if (weaponScore(w) < best * 0.8 || dropsThisWave >= 2 + Math.floor(st.luck * 2) || loot.drops.length >= 4) loot.spawnPickup('scrap', e.pos.x, e.pos.z, scrapValue(w));
    else { loot.drop(w, e.pos.x, e.pos.z); dropsThisWave++; }
  } else if (Math.random() < 0.12 * dropMult) loot.spawnPickup('scrap', e.pos.x, e.pos.z, e.elite ? 3 : 1);
  if (e.elite) {
    if (player.hasRelic('skull')) player.heal(15);
    if (st.hoard && Math.random() < 0.35) rewards.spawnChest(e.pos.x, e.pos.z);
  }
  if (st.fireBurst && e.burnT > 0) combat.fireBurst(e.pos, Math.round(12 * st.dmg));
}

const runInfo = () => ({ relics: player.relics.length, curses: run.curses.length, bossKilled: !!run.bossKilled, daily: run.daily, wave });

// ================= Kinh nghiệm & lên cấp =================
function gainXp(n) {
  if (player.dead) return;
  player.xp += n;
  while (player.xp >= xpForLevel(player.level)) {
    player.xp -= xpForLevel(player.level);
    player.level++;
    pendingLevels++;
  }
  if (pendingLevels > 0 && !choosing && !inShop) openLevelUp();
}

function openLevelUp() {
  if (player.dead) return;
  perkChoices = rollPerks(player.perkLv, meta.up.cards ? 4 : 3);
  if (!perkChoices.length) { pendingLevels = 0; return; }
  choosing = true;
  $('lu-level').textContent = player.level - pendingLevels + 1;
  $('lu-cards').innerHTML = perkChoices.map((p, i) => {
    const lv = player.perkLv[p.id] || 0;
    return `<button class="card${p.evo ? ' evo' : ''}" data-i="${i}">
      <span class="keycap">${i + 1}</span>
      <i class="ico card-ico" style="--i:url('/ui/icons/${p.icon}.svg')"></i>
      <h3>${p.name}</h3>
      <div class="lv">${p.evo ? 'Tiến hóa' : lv ? `Cấp ${lv} → ${lv + 1}` : 'Mới'}${!p.evo && p.max > 1 ? ` <span class="muted">/ ${p.max}</span>` : ''}</div>
      <p>${p.desc(lv + 1)}</p></button>`;
  }).join('');
  for (const b of $('lu-cards').querySelectorAll('.card')) {
    b.onclick = () => pickPerk(Number(b.dataset.i));
    b.onmouseenter = () => play('uiHover');
  }
  show('levelup', true);
  setMode('menu');
  play('forged');
}

function pickPerk(i) {
  const p = perkChoices[i];
  if (!p || !choosing) return;
  const lv = (player.perkLv[p.id] || 0) + 1;
  player.perkLv[p.id] = lv;
  p.apply(player.base, lv, player);
  player.recalc();
  if (p.evo) toast(p.icon, 'Tiến hóa: ' + p.name, p.desc(1));
  play('uiConfirm');
  pendingLevels--;
  choosing = false;
  show('levelup', false);
  setMode('playing');
  renderSlots();
  if (pendingLevels > 0) openLevelUp();
}

function handleLevelKeys() {
  for (let i = 0; i < 4; i++) if (pressed.has('Digit' + (i + 1))) { pickPerk(i); break; }
}

// ================= Thành tựu & Sổ Rèn =================
function checkAchievements() {
  const r = runInfo();
  for (const a of ACHIEVEMENTS) {
    if (meta.ach[a.id] || !a.check(meta.stats, r)) continue;
    meta.ach[a.id] = true;
    let text = a.desc;
    if (a.reward.souls) { meta.souls += a.reward.souls; text += ` · +${a.reward.souls} Hồn Thép`; }
    if (a.reward.unlock) text += ` · Mở khóa ${charById(a.reward.unlock).name}`;
    toast('x_achievement', 'Thành tựu: ' + a.name, text);
  }
  saveMeta(meta);
}

function recordCodex(w) {
  if (!w) return;
  const k = codexKey(w);
  if (!meta.codex[k]) { meta.codex[k] = true; saveMeta(meta); }
}

const isUnlocked = (c) => !c.unlock || meta.ach[c.unlock];

// ================= Menu: Lò Rèn, chuẩn bị lượt, thành tựu, Sổ Rèn =================
function updateMenuSouls() {
  const el = $('menu-souls');
  if (el) el.innerHTML = `<i class="ico ico-soul"></i>${meta.souls}`;
}

function renderForge() {
  $('forge-souls').textContent = meta.souls;
  $('forge-list').innerHTML = META.map((m) => {
    const lv = meta.up[m.id] || 0;
    const maxed = lv >= m.max;
    const cost = maxed ? 0 : m.cost(lv);
    const pips = Array.from({ length: m.max }, (_, k) => `<span class="pip${k < lv ? ' on' : ''}"></span>`).join('');
    return `<div class="forge-item${maxed ? ' maxed' : ''}">
      <i class="ico fi-ico" style="--i:url('/ui/icons/${m.icon}.svg')"></i>
      <div class="fi-info"><h4>${m.name} <span class="pips">${pips}</span></h4>
        <p>${maxed ? m.desc(lv) : lv ? `${m.desc(lv)} <span class="next">→ ${m.desc(lv + 1)}</span>` : `<span class="next">${m.desc(1)}</span>`}</p></div>
      <button class="btn buy" data-id="${m.id}" ${maxed || meta.souls < cost ? 'disabled' : ''}>
        ${maxed ? 'Tối đa' : `<i class="ico ico-soul"></i>${cost}`}</button>
    </div>`;
  }).join('');
  for (const b of $('forge-list').querySelectorAll('.buy')) {
    b.onclick = () => {
      const m = META.find((x) => x.id === b.dataset.id);
      const lv = meta.up[m.id] || 0;
      const cost = m.cost(lv);
      if (lv >= m.max || meta.souls < cost) { play('uiBack'); return; }
      meta.souls -= cost;
      meta.up[m.id] = lv + 1;
      saveMeta(meta);
      play('hammer');
      renderForge();
      updateMenuSouls();
    };
  }
}

function renderPrep() {
  if (!isUnlocked(charById(run.char))) run.char = 'knight';
  $('char-list').innerHTML = CHARACTERS.map((c) => {
    const open = isUnlocked(c);
    const req = c.unlock ? ACHIEVEMENTS.find((a) => a.id === c.unlock) : null;
    return `<button class="char-card${run.char === c.id ? ' sel' : ''}${open ? '' : ' locked'}" data-id="${c.id}" ${open ? '' : 'disabled'}>
      <i class="ico" style="--i:url('/ui/icons/${c.icon}.svg')"></i>
      <h4>${c.name}</h4>
      <div class="muted small">${open ? `${c.hp} máu · ${TYPES[c.weapon].name}` : 'Khóa'}</div>
      <p>${open ? c.passive : `Mở khóa: ${req.desc}`}</p></button>`;
  }).join('');
  for (const b of $('char-list').querySelectorAll('.char-card')) b.onclick = () => { run.char = b.dataset.id; meta.char = run.char; saveMeta(meta); play('uiClick'); renderPrep(); };
  $('curse-list').innerHTML = CURSES.map((c) => `<button class="curse${run.curses.includes(c.id) ? ' on' : ''}" data-id="${c.id}">
    <i class="ico" style="--i:url('/ui/icons/${c.icon}.svg')"></i><div><h4>${c.name} <span class="bonus">+${Math.round(c.bonus * 100)}%</span></h4><p>${c.desc}</p></div></button>`).join('');
  for (const b of $('curse-list').querySelectorAll('.curse')) b.onclick = () => {
    const id = b.dataset.id;
    run.curses = run.curses.includes(id) ? run.curses.filter((x) => x !== id) : [...run.curses, id];
    meta.curses = run.curses; saveMeta(meta);
    play('uiClick'); renderPrep();
  };
  const bonus = run.curses.reduce((s, id) => s + CURSES.find((c) => c.id === id).bonus, 0);
  $('curse-bonus').textContent = bonus ? `Hồn Thép nhận được +${Math.round(bonus * 100)}%` : 'Không có lời nguyền';
}

function renderAchievements() {
  const done = ACHIEVEMENTS.filter((a) => meta.ach[a.id]).length;
  $('ach-count').textContent = `${done} / ${ACHIEVEMENTS.length}`;
  const s = meta.stats;
  $('ach-stats').innerHTML = [['Quái đã hạ', s.kills], ['Boss đã hạ', s.bossKills], ['Tầng sâu nhất', s.maxFloor || 1], ['Đợt xa nhất', s.maxWave], ['Phản ứng nguyên tố', s.reactions], ['Né hoàn hảo', s.perfect]]
    .map(([k, v]) => `<div><span>${k}</span><b>${v || 0}</b></div>`).join('');
  $('ach-list').innerHTML = ACHIEVEMENTS.map((a) => {
    const rw = [a.reward.souls && `+${a.reward.souls} Hồn Thép`, a.reward.unlock && `Mở khóa ${charById(a.reward.unlock).name}`].filter(Boolean).join(' · ');
    return `<div class="ach${meta.ach[a.id] ? ' done' : ''}"><i class="ico" style="--i:url('/ui/icons/x_achievement.svg')"></i><div><h4>${a.name}</h4><p>${a.desc}</p><p class="rw">${rw}</p></div></div>`;
  }).join('');
}

function renderCodex() {
  const types = Object.keys(TYPES);
  const els = ['fire', 'ice', 'lightning', 'blood'];
  const combos = [['none'], ...els.map((e) => [e])];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) combos.push([els[i], els[j]]);
  let found = 0, total = 0;
  const rows = types.map((t) => `<div class="codex-row"><h4>${TYPES[t].name}</h4><div class="codex-grid">${combos.map((c) => {
    total++;
    const w = makeWeapon(t, c[0], c[1] ? 2 : c[0] === 'none' ? 0 : 1, c[1] || null, []);
    const known = meta.codex[codexKey(w)];
    if (known) found++;
    return `<div class="codex-cell${known ? '' : ' unknown'}" title="${known ? weaponName(w) : '???'}">${known ? `<img src="${weaponIcon(w)}" alt="">` : '?'}<span>${known ? c.filter((x) => x !== 'none').map((x) => ELEMENTS[x].name).join('-') || 'Thường' : '???'}</span></div>`;
  }).join('')}</div></div>`).join('');
  $('codex-count').textContent = `${found} / ${total}`;
  $('codex-list').innerHTML = rows;
  const relicHtml = RELICS.map((r) => `<div class="relic big${meta.relicsSeen[r.id] ? '' : ' unknown'}" title="${meta.relicsSeen[r.id] ? r.name + ': ' + r.desc : '???'}"><i class="ico" style="--i:url('/ui/icons/${r.icon}.svg')"></i></div>`).join('');
  $('codex-relics').innerHTML = relicHtml;
}

// ================= Ngắm bằng chuột =================
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
const aim = new THREE.Vector3();
function updateAim() {
  raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);
  raycaster.ray.intersectPlane(groundPlane, aim);
}

// ================= Tương tác (phím E) =================
function handleInteract() {
  let drop = loot.nearest(player.pos);
  const atAnvil = loot.nearAnvil(player.pos);
  const ex = exitOpen && exitPos();
  const atExit = ex && Math.hypot(ex.x - player.pos.x, ex.z - player.pos.z) < 2.2;
  const pedestal = choosingReward && rewards.nearestPedestal(player.pos);
  const chest = rewards.nearestChest(player.pos);
  const atMerchant = inShop && rewards.nearMerchant(player.pos);
  const E = pressed.has('KeyE');
  let text = '';
  // Phân rã vũ khí gần nhất (X) – luôn dùng được, kể cả khi đứng cạnh đe
  if (drop && pressed.has('KeyX')) {
    addScrap(scrapValue(drop.weapon));
    fxFlash(drop.pos.clone().setY(1.2), 0xc9d4e0, 1.8, 0.15, false);
    play('hammer', { rate: 1.6, vol: 0.6 });
    loot.remove(drop);
    drop = null;
  }
  if (atExit) {
    text = `<span class="keycap">E</span> Xuống <b>tầng ${floor + 1}</b> · ${floorTheme(floor + 1).name}`;
    if (E && !fading) descend();
  } else if (pedestal) {
    const r = REWARDS[pedestal.kind];
    text = `<span class="keycap">E</span> Chọn <b>${r.name}</b> <span class="muted" style="font-size:13px">${r.desc}</span>`;
    if (E) chooseReward(pedestal.kind);
  } else if (chest) {
    text = '<span class="keycap">E</span> Mở <b>rương di vật</b>';
    if (E) { rewards.openChest(chest); grantRelic(); }
  } else if (atMerchant) {
    text = '<span class="keycap">E</span> Mua bán với <b>thương nhân</b>';
    if (E) { renderShop(); show('shop', true); setMode('menu'); play('uiOpen'); }
  } else if (atAnvil || (loot.anvil && Math.hypot(loot.anvil.pos.x - player.pos.x, loot.anvil.pos.z - player.pos.z) < 2 && !loot.anvil.forging)) {
    // Cường hóa (F): tốn Mảnh Thép, không giới hạn số lần ở đe
    const cw = player.weapon;
    const canPlus = cw && (cw.plus || 0) < MAX_PLUS;
    const cost = canPlus ? enhanceCost(cw) : 0;
    const enh = canPlus ? ` <span class="sep">·</span> <span class="keycap">F</span> Cường hóa <b>+${(cw.plus || 0) + 1}</b> <span class="${scrap >= cost ? '' : 'muted'}">(${cost} <i class="ico ico-scrap"></i>)</span>` : ' <span class="sep">·</span> <span class="muted">Đã cường hóa tối đa</span>';
    if (pressed.has('KeyF') && canPlus) {
      if (scrap >= cost) {
        addScrap(-cost);
        cw.plus = (cw.plus || 0) + 1;
        player.recalc();
        renderSlots();
        play('hammer', { rate: 1.2 }); play('forged', { vol: 0.5 });
        fxRing(scene, loot.anvil.pos, 2.2, 0xffcf4a, 0.4);
        fxFlash(loot.anvil.pos.clone().setY(1.2), 0xffcf4a, 2.5, 0.2);
        showBanner(weaponName(cw), `Cường hóa +${cw.plus} · +${cw.plus * 12}% sát thương`, 1.6, '#ffcf4a');
      } else { play('uiBack'); showBanner('Thiếu Mảnh Thép', `Cần ${cost}, đang có ${scrap}. Phân rã vũ khí thừa bằng phím X`, 1.6, '#c9c9c9'); }
    }
    if (!atAnvil) text = `<i class="ico ico-anvil"></i> Đe đã dùng để rèn${enh}`;
    else if (player.weapons.length < 2) text = `<i class="ico ico-anvil"></i> Cần <b>2 vũ khí</b> để rèn${enh}`;
    else {
      const preview = forgeWeapons(player.weapons[player.slot], player.weapons[1 - player.slot], player.hasRelic('gauntlet') ? 1 : 0);
      text = `<span class="keycap">E</span> Rèn thành <img src="${weaponIcon(preview)}" width="30" height="30" alt=""><span style="color:${RARITY[preview.rarity].css}">${weaponName(preview)}</span>${weaponIcons(preview)}${enh}`;
      if (E) {
        const a = player.weapons[player.slot], b = player.weapons[1 - player.slot];
        const result = forgeWeapons(a, b, player.hasRelic('gauntlet') ? 1 : 0);
        result.plus = Math.floor(((a.plus || 0) + (b.plus || 0)) / 2);   // giữ lại một nửa cấp cường hóa
        loot.anvilUses = (loot.anvilUses || 1) - 1;
        const keep = loot.anvilUses > 0;
        loot.startForge(() => {
          player.setWeapons([result], 0);
          recordCodex(result);
          if (result.rarity === 3) meta.stats.legendary = (meta.stats.legendary || 0) + 1;
          showBanner(weaponName(result), `${RARITY[result.rarity].name} · ${affixText(result).join(' · ') || 'đã rèn xong!'}`, 2.8, RARITY[result.rarity].css);
          if (keep && loot.anvil) { loot.anvil.used = false; }
          checkAchievements();
        });
      }
    }
  } else if (drop) {
    const w = drop.weapon;
    const verb = player.weapons.length < 2 ? 'Nhặt' : 'Đổi lấy';
    const aff = affixText(w);
    const diff = weaponScore(w) / weaponScore(player.weapon) - 1;
    const cmp = Math.abs(diff) < 0.03 ? '<span class="cmp eq">=</span>' : diff > 0 ? `<span class="cmp up">▲ ${Math.round(diff * 100)}%</span>` : `<span class="cmp down">▼ ${Math.round(-diff * 100)}%</span>`;
    const left = Math.ceil(drop.life - drop.age);
    text = `<span class="keycap">E</span> ${verb} <img src="${weaponIcon(w)}" width="30" height="30" alt=""><span style="color:${RARITY[w.rarity].css}">${weaponName(w)}</span>${weaponIcons(w)}${cmp}<span class="muted" style="font-size:13px">${RARITY[w.rarity].name}${aff.length ? ' · ' + aff.join(' · ') : ''}</span>`
      + ` <span class="sep">·</span> <span class="keycap">X</span> Phân rã <b>+${scrapValue(w)}</b> <i class="ico ico-scrap"></i>${left <= 8 ? ` <span class="cmp down">${left}s</span>` : ''}`;

    if (E) {
      const old = player.pickUp(w);
      recordCodex(w);
      play('pickup');
      loot.remove(drop);
      if (old) loot.drop(old, player.pos.x, player.pos.z);
    }
  }
  hud.prompt.innerHTML = text;
  hud.prompt.classList.toggle('show', !!text);
}

// ================= Vòng lặp =================
let lastTime = performance.now();
let time = 0;
const camTarget = new THREE.Vector3();

function update(realDt, render = true) {
  time += realDt;
  pollGamepad();
  let dt = realDt;
  if (hitStop.time > 0) { hitStop.time -= realDt; dt = 0; }
  // Chậm thời gian (né hoàn hảo, hạ boss)
  if (player.slowmoT > 0) { player.slowmoT -= realDt; dt *= 0.3; }
  if (!started || paused || choosing || inShopOpen()) dt = 0;
  if (choosing) handleLevelKeys();

  updateAim();
  setListener(player.pos);
  if (pressed.has('KeyM')) toggleMute();
  if (pressed.has('Escape')) {
    if (inShopOpen()) leaveShopPanel();
    else if (started && !player.dead && !choosing) setPaused(!paused);
  }

  if (started && !paused && !choosing && !inShopOpen()) {
    player.update(dt, aim, enemies, time);
    if (player.dead) {
      if (pressed.has('KeyR')) restart();
    } else {
      handleInteract();
    }

    for (const e of enemies) {
      const landed = e.update(dt * (e.timeMul || 1), player, time);
      if (!e.alive || e.spawning || player.dead || !e.contactDmg || e.stunned) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (e.grounded && d < e.radius + player.radius - 0.1) {
        if (player.hurt(e.contactDmg)) {
          const push = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z).normalize();
          e.knock.copy(push).multiplyScalar(6);
        }
      } else if (landed && d < e.radius + 1.2) {
        e.squash = 0.6;
      }
    }

    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i], b = enemies[j];
        if (!a.alive || !b.alive || a.spawning || b.spawning) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz), min = (a.radius + b.radius) * 0.85;
        if (d < min && d > 0.001) {
          const push = (min - d) * 0.5;
          const wa = a.isBoss ? 0.1 : 1, wb = b.isBoss ? 0.1 : 1;
          a.pos.x -= (dx / d) * push * wa; a.pos.z -= (dz / d) * push * wa;
          b.pos.x += (dx / d) * push * wb; b.pos.z += (dz / d) * push * wb;
        }
      }
    }

    updateProjectiles(dt);
    updateAbilities(dt);
    updateHazards(dt, event?.id === 'firerain');

    const born = [];
    enemies = enemies.filter((e) => {
      if (!e.dead) return true;
      kills++;
      onKill(e);
      if (e.type === 'big') {
        for (const side of [-1, 1]) {
          const s = new Slime(scene, e.pos.x + side * 0.5, e.pos.z, 'small');
          s.spawning = false; s.height = 0;
          s.knock.set(side * 6, 0, (Math.random() - 0.5) * 4);
          s.timer = 0.5;
          born.push(s);
        }
      }
      return false;
    });
    enemies.push(...born);
    ctx.enemies = enemies;
    if (born.length || kills % 10 === 0) checkAchievements();

    // Đấu Trường: quái kéo tới liên tục cho đến hết giờ
    if (arenaT > 0 && !player.dead) {
      arenaT -= dt;
      arenaSpawn -= dt;
      if (arenaSpawn <= 0 && enemies.length < 14) {
        arenaSpawn = 2.2;
        const pool = ['normal', 'big', 'lava', 'minion', 'bomber', 'archer', 'shield', 'wraith', 'assassin'];
        const make = { minion: Minion, bomber: Bomber, archer: Archer, shield: ShieldBearer, wraith: Wraith, assassin: Assassin };
        for (let k = 0; k < 2; k++) {
          const kind = pool[Math.floor(Math.random() * Math.min(pool.length, 4 + wave))];
          const [x, z] = spawnPos(7);
          const e = make[kind] ? new make[kind](scene, x, z) : new Slime(scene, x, z, kind);
          addEnemy(e);
        }
        ctx.enemies = enemies;
      }
      if (arenaT <= 0) showBanner('Hết giờ!', 'Dọn sạch số quái còn lại', 1.6, '#ffb040');
    }
    if (!player.dead && enemies.length === 0 && arenaT <= 0) {
      if (intermission === null) onWaveCleared();
      if (intermission !== null && isFinite(intermission)) {
        intermission -= dt;
        if (intermission <= 0) {
          intermission = null;
          loot.removeAnvil();
          spawnWave();
        }
      }
    }

    loot.update(dt, camera, player, time);
    rewards.update(dt, camera, time, player.pos);
    updateEliteLabels(enemies, camera);
    for (const p of loot.updatePickups(dt, player, player.stats.magnet)) {
      if (p.kind === 'soul') { addSouls(p.value); play('drop', { vol: 0.6, rate: 1.4 }); }
      else if (p.kind === 'gold') { addGold(p.value); play('drop', { vol: 0.5, rate: 1.8 }); }
      else if (p.kind === 'potion') { player.heal(25); play('heal'); }
      else if (p.kind === 'scrap') { addScrap(p.value); play('pickup', { vol: 0.35, rate: 1.6 }); }
    }
  }

  updateWorld(time, player.pos);
  if (darkLight) darkLight.position.set(player.pos.x, 3, player.pos.z);
  updateFade(realDt);
  updateFx(dt, realDt, camera);
  updateToasts(realDt);

  // Nhạc nền theo trạng thái
  const bossAlive = enemies.some((e) => e.isBoss && !e.dead);
  setMusic(!started ? 'calm' : bossAlive ? 'boss' : enemies.length ? 'battle' : 'calm');
  updateMusic(realDt);

  // Camera (zoom gần khi hạ boss)
  slowmoReal = Math.max(0, slowmoReal - realDt);
  camZoom += ((slowmoReal > 0 ? 0.62 : 1) - camZoom) * Math.min(1, realDt * 3);
  if (!started) {
    menuT += realDt * 0.12;
    camTarget.set(Math.sin(menuT) * 9, 13, Math.cos(menuT) * 9 + 4);
    camera.position.lerp(camTarget, 1 - Math.pow(0.2, realDt));
  } else {
    camTarget.copy(player.pos).addScaledVector(CAM_OFFSET, camZoom);
    camera.position.lerp(camTarget, 1 - Math.pow(0.001, realDt));
  }
  shake.trauma = Math.max(0, shake.trauma - realDt * 1.8);
  const s = shake.trauma * shake.trauma * 0.6;
  const base = camera.position.clone();
  camera.position.x += (Math.random() * 2 - 1) * s;
  camera.position.y += (Math.random() * 2 - 1) * s;
  camera.position.z += (Math.random() * 2 - 1) * s;
  if (!started) camera.lookAt(0, 0, -1);
  else camera.lookAt(camera.position.x - CAM_OFFSET.x * camZoom, 0, camera.position.z - CAM_OFFSET.z * camZoom);

  updateHud(realDt);

  if (render) composer.render();
  camera.position.copy(base);
  endFrame();
}

function updateHud(realDt) {
  if (player.hp < lastHp) hurtFlash = 1;
  lastHp = player.hp;
  ghostHp = ghostHp > player.hp ? Math.max(player.hp, ghostHp - realDt * 35) : player.hp;
  hud.hpFill.style.width = (player.hp / player.maxHp) * 100 + '%';
  hud.hpGhost.style.width = (ghostHp / player.maxHp) * 100 + '%';
  hud.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}` + (player.shieldHp > 0 ? ` (+${player.shieldHp})` : '');
  hud.wave.textContent = Math.max(1, wave);
  hud.kills.textContent = kills;
  hud.best.textContent = best;
  const dashP = player.dashStock >= player.stats.dashCharges ? 1 : 1 - player.dashCd / player.dashCdMax;
  hud.dashRing.style.setProperty('--p', dashP.toFixed(3));
  hud.dashRing.classList.toggle('ready', player.dashStock > 0);
  $('dash-stock').textContent = player.stats.dashCharges > 1 ? '×' + player.dashStock : '';
  const spP = 1 - player.specialCd / player.specialCdMax;
  $('special-ring').style.setProperty('--p', Math.max(0, spP).toFixed(3));
  $('special-ring').classList.toggle('ready', spP >= 1 && !player.boomerangOut);
  $('rage-fill').style.width = player.rage + '%';
  $('rage').classList.toggle('full', player.rage >= 100);
  $('gold').textContent = gold;
  const alive = enemies.filter((e) => !e.dead).length;
  hud.left.textContent = alive ? `· còn ${alive} quái` : '';
  $('floor').textContent = floor;
  updateArrows();
  $('lvl').textContent = player.level;
  $('xp-fill').style.width = Math.min(100, (player.xp / xpForLevel(player.level)) * 100) + '%';
  $('souls').textContent = meta.souls;
  const boss = enemies.find((e) => e.isBoss && !e.dead);
  show('boss-bar', !!boss && started);
  if (boss) {
    $('boss-name').textContent = boss.name + (boss.stunned ? ' · Choáng!' : boss.enraged ? ' · Nổi giận!' : '');
    $('boss-fill').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    $('boss-poise').style.width = boss.poiseMax ? Math.min(100, (boss.stunned ? 100 : boss.poise / boss.poiseMax * 100)) + '%' : '0%';
  }
  hurtFlash = Math.max(0, hurtFlash - realDt * 2.5);
  hud.hurt.style.opacity = hurtFlash;
  const low = !player.dead && player.hp / player.maxHp < 0.3;
  hud.lowhp.style.opacity = low ? 0.35 + Math.sin(time * 6) * 0.25 : 0;
  $('slowmo').style.opacity = player.slowmoT > 0 ? 1 : 0;
  const idle = started && !player.dead && enemies.length === 0 && wave > 0;
  hud.timer.innerHTML = arenaT > 0 ? `<i class="ico ico-hourglass"></i> Đấu Trường: còn ${Math.ceil(arenaT)} giây`
    : !idle ? ''
    : exitOpen ? '<i class="ico ico-hourglass"></i> Tới nắp hầm giữa phòng để xuống tầng'
    : choosingReward ? '<i class="ico ico-hourglass"></i> Chọn một bệ phần thưởng để bắt đầu đợt tiếp theo'
    : inShop ? '<i class="ico ico-hourglass"></i> Mua đồ ở thương nhân, bấm "Rời đi" khi xong'
    : intermission !== null && isFinite(intermission) ? `<i class="ico ico-hourglass"></i> Đợt ${wave + 1} sau ${Math.ceil(intermission)} giây` : '';
  if (bannerTimer > 0) { bannerTimer -= realDt; if (bannerTimer <= 0) hud.bannerWrap.classList.remove('show'); }
  if (player.dead && !deathShown) onDeath();
}

function onDeath() {
  deathShown = true;
  const isRecord = wave > best;
  if (isRecord) { best = wave; localStorage.setItem('lorenh_best', String(best)); }
  if (run.daily) {
    const k = todayKey();
    meta.daily[k] = Math.max(meta.daily[k] || 0, wave);
  }
  checkAchievements();
  saveMeta(meta);
  setTimeout(() => {
    $('go-wave').textContent = wave;
    $('go-kills').textContent = kills;
    $('go-best').textContent = best;
    show('new-record', isRecord);
    const w = player.weapon;
    $('go-souls').innerHTML = `<i class="ico ico-soul"></i> Nhận được <b>${runSouls}</b> Hồn Thép · Tầng ${floor} · Cấp ${player.level}${run.daily ? ' · Thử thách hằng ngày' : ''}`;
    $('go-weapon').innerHTML = `Vũ khí cuối cùng: <span style="color:${RARITY[w.rarity].css}">${weaponName(w)}</span> ${weaponIcons(w)}`;
    show('gameover', true);
    setMode('menu');
  }, 1200);
  hud.prompt.classList.remove('show');
}

function tick(now) {
  const realDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(realDt);
  requestAnimationFrame(tick);
}

function startGame(opts = {}) {
  if (started) return;
  unlockAudio();
  unlockMusic();
  play('uiConfirm');
  run = opts.daily
    ? { char: 'knight', curses: [], daily: true }
    : { char: run.char, curses: [...run.curses], daily: false };
  setSeed(run.daily ? daySeed() : null);
  started = true;
  for (const id of ['start', 'howto', 'prep']) show(id, false);
  restart();
  camera.position.copy(player.pos).add(CAM_OFFSET);
  setMode('playing');
}

function toMenu() {
  setSeed(null);
  updateMenuSouls();
  started = false;
  run.daily = false;
  restart();
  hud.startBest.textContent = best ? `Kỷ lục: đợt ${best}` : 'Chưa có kỷ lục';
  renderDaily();
  show('start', true);
  setMode('menu');
}

function renderDaily() {
  const b = meta.daily[todayKey()];
  $('daily-best').textContent = b ? `Hôm nay: đợt ${b}` : 'Chưa chơi hôm nay';
}

function leaveShopPanel() { show('shop', false); setMode('playing'); play('uiClose'); }

// ================= Âm lượng =================
function syncSoundUI() {
  for (const el of document.querySelectorAll('.vol-slider')) el.value = Math.round(getVolume() * 100);
  for (const el of document.querySelectorAll('.mute-btn')) {
    el.classList.toggle('off', isMuted());
    el.title = isMuted() ? 'Bật tiếng (M)' : 'Tắt tiếng (M)';
  }
}
function toggleMute() { setMuted(!isMuted()); syncSoundUI(); if (!isMuted()) play('uiClick'); }

async function init() {
  await Promise.all([loadModels(), loadSounds()]);
  buildWorld(scene);
  initFx(scene, renderer);
  applyFxQuality();
  $('btn-fx').onclick = () => { setFxQuality(!fxQuality.high); applyFxQuality(); play('uiClick'); };
  ctx.scene = scene;
  player = new Player(scene);
  player.meta = meta;
  run.char = meta.char || 'knight';
  run.curses = [...(meta.curses || [])];
  ctx.player = player;
  ctx.spawnEnemy = (e) => { e.maxHpEff = e.hp; enemies.push(e); };
  ctx.spawnGrave = (x, z) => { const m = new Minion(scene, x, z); m.isGrave = true; m.xp = 1; m.dropChance = 0.03; addEnemy(m); ctx.enemies = enemies; };
  // Boss chuyển giai đoạn: sóng xung kích, gọi thêm quân, thông báo
  ctx.onBossPhase = (b) => {
    const last = b.phase >= b.phases.length;
    showBanner(last ? `${b.name}: Liều Chết!` : `${b.name} nổi giận!`, last ? 'Đòn đánh nhanh và mạnh hơn nữa' : 'Nhanh hơn · gọi thêm quân', 2.2, '#ff4a3a');
    explosion(b.pos, 4.5, 0xff3a2a, { smoke: true, scorch: false, core: 0xffb0a0 });
    fxFlash(b.pos.clone().setY(2), 0xff4a3a, 6, 0.3);
    play('anvil'); play('explode', { at: b.pos });
    const dx = player.pos.x - b.pos.x, dz = player.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d < 6) { player.pos.x += (dx / d) * (6 - d); player.pos.z += (dz / d) * (6 - d); }
    const mk = { 0: () => Minion, 1: () => null, 2: () => Healer, 3: () => Wraith }[b.bossKind ?? 0]();
    for (let i = 0; i < 1 + b.phase; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = b.pos.x + Math.cos(a) * 4, z = b.pos.z + Math.sin(a) * 4;
      if (isBlocked(x, z, 0.6)) continue;
      const m = mk ? new mk(scene, x, z) : new Slime(scene, x, z, 'lava');
      m.spawnT = 0;
      addEnemy(m);
    }
    ctx.enemies = enemies;
  };
  ctx.onReaction = () => { meta.stats.reactions = (meta.stats.reactions || 0) + 1; };
  ctx.onPerfect = () => { meta.stats.perfect = (meta.stats.perfect || 0) + 1; };
  loot = new Loot(scene);
  rewards = new Rewards(scene);
  ctx.enemies = enemies;
  player.onWeaponsChanged = renderSlots;
  restart();
  camera.position.set(0, 13, 13);
  camera.lookAt(0, 0, -1);
  darkLight = new THREE.PointLight(0xffd8a0, 0, 12, 1.5);
  scene.add(darkLight);
  setDarkHook((on) => { darkLight.intensity = on ? 22 : 0; });

  hud.startBest.textContent = best ? `Kỷ lục: đợt ${best}` : 'Chưa có kỷ lục';
  renderDaily();
  for (const el of document.querySelectorAll('.overlay')) el.addEventListener('mousedown', (e) => e.stopPropagation());
  $('btn-play').onclick = () => { renderPrep(); show('prep', true); play('uiOpen'); };
  $('btn-go').onclick = () => startGame();
  $('btn-daily').onclick = () => startGame({ daily: true });
  $('btn-howto').onclick = () => { show('howto', true); play('uiOpen'); };
  $('btn-howto2').onclick = () => { show('howto', true); play('uiOpen'); };
  $('btn-ach').onclick = () => { renderAchievements(); show('achievements', true); play('uiOpen'); };
  $('btn-codex').onclick = () => { renderCodex(); show('codex', true); play('uiOpen'); };
  $('btn-shop-leave').onclick = () => { leaveShopPanel(); leaveShop(); };
  $('btn-shop-close').onclick = () => leaveShopPanel();
  for (const btn of document.querySelectorAll('[data-close]')) btn.onclick = () => { show(btn.dataset.close, false); play('uiBack'); };
  for (const btn of document.querySelectorAll('.btn')) {
    btn.addEventListener('mouseenter', () => play('uiHover'));
    btn.addEventListener('click', () => { if (btn.id !== 'btn-go' && btn.id !== 'btn-daily') play('uiClick'); });
  }
  const unlock = () => { unlockAudio(); unlockMusic(); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  for (const s of document.querySelectorAll('.vol-slider')) s.oninput = () => { setVolume(s.value / 100); if (isMuted()) setMuted(false); syncSoundUI(); };
  for (const b of document.querySelectorAll('.mute-btn')) b.onclick = toggleMute;
  syncSoundUI();
  $('btn-resume').onclick = () => setPaused(false);
  $('btn-restart').onclick = () => restart();
  $('btn-again').onclick = () => restart();
  $('btn-menu').onclick = toMenu;
  $('btn-menu2').onclick = () => { setPaused(false); toMenu(); };
  $('btn-forge').onclick = () => { renderForge(); show('forge', true); play('uiOpen'); };
  updateMenuSouls();
  addEventListener('blur', () => { if (started && !player.dead && !choosing && !inShopOpen()) setPaused(true); });
  addEventListener('gamepadconnected', () => toast('x_gamepad', 'Đã kết nối tay cầm', 'Cần trái di chuyển · cần phải ngắm · RT đánh · LT kỹ năng · A lướt'));
  hud.start.classList.remove('loading');
  setMode('menu');

  window.__game = {
    player, scene, camera, renderer, mouse, pad, loot, rewards, startGame, combat, weapons: weaponsMod, setPaused, meta,
    get enemies() { return enemies; },
    get wave() { return wave; },
    get floor() { return floor; },
    get gold() { return gold; },
    get choosingReward() { return choosingReward; },
    spawnBoss(kind = 0) { const C = [Boss, KingSlime, ArchMage, ShadowLord][kind]; const b = new C(scene, 0, -8, 1); b.spawnT = 0; b.phases = [0.5]; b.bossKind = kind; addEnemy(b); ctx.enemies = enemies; return b; },
    spawn(name, x = 0, z = -5) { const C = { Minion, Assassin, Archer, Mage, Healer, ShieldBearer, Bomber, Wraith }[name]; const e = C ? new C(scene, x, z) : new Slime(scene, x, z, name); e.spawnT = 0; addEnemy(e); ctx.enemies = enemies; return e; },
    grantRelic, chooseReward, openShopRoom, descend, addGold,
    step(n = 1, render = false) { for (let i = 0; i < n; i++) update(1 / 60, render || i === n - 1); },
    set god(v) { player.god = v; },
  };
  requestAnimationFrame(tick);
}

init();
