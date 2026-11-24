import * as THREE from 'three';
import { endFrame, pressed, mouse, pollGamepad, pad, resetTouch, keys, coop, touch as touchIn, getTouchCfg, setTouchCfg, haptic } from './input.js';
import { buildWorld, updateWorld, isBlocked, isPit, ROOM_HALF, pillars, boxes, pits, spawnExit, removeExit, exitPos, floorTheme, setDark, setDarkHook, setFlameLevel } from './world.js';
import { Player, SPECIALS } from './player.js';
import { Slime, Mage } from './enemies.js';
import { Healer, ShieldBearer, Bomber, Wraith, ShadowLord } from './enemies_new.js';
import { Armored, Burrower, Totem } from './enemies_more.js';
import {
  PyroMage, FrostGuard, Lancer, Necromancer, Berserker,
  OrcBrute, GoblinRaider, FireImp, FrostDrake, AcidGlub, VenomSpider, GiantWasp, Viper, StoneCrab,
} from './enemies_pack.js';
import { ForgeOgre, FrostDragon, EmberDragon, PlagueKing, FrostWarden, spawnTwinReapers, FallenSmith } from './bosses_extra.js';
import { EVENTS_ROOM, QUESTS } from './events.js';
import { GODS, BOONS, DUOS, godCards, GOD_WRATH, pickTrialPair, tickGodWrath } from './gods.js';
import { genFloorMap, choicesAt, renderMap, propagateChoice, activeBossAnchors, ANCHOR_TYPES } from './floormap.js';
import { RUNES, BOSS_CORES, randomRune, describeCircuit, fireRunes, updateRunes, clearRunes, attachAwakening, progressAwakening } from './runes.js';
import { flameState, resetFlameState, hasDynCurse, flameTier, addFlame, addCorruption, purgeCurse, dynCurseById } from './corruption.js';
import { FallenEcho, EchoManager, recordEcho, findEchoForFloor, removeEcho, hydrateEchoWeapon } from './echo.js';
import { initForgeUI, openAnvilModal, closeAnvilModal, isAnvilOpen } from './forge_ui.js';
import { BUILDINGS, STORY, unlockedStory, loadBoard, submitRun, exportSaveCode, importSaveCode } from './village.js';
import { CompanionManager } from './companions.js';
import { SandboxManager, DefenseManager, TURRET_TYPES, DEFENSE_MAX_WAVES } from './modes.js';
import { enemyBestiaryId, renderBestiaryHtml, renderRunSummaryHtml } from './bestiary.js';
import { Minion, Boss, Assassin, Archer, KingSlime, ArchMage } from './enemies_extra.js';
import { initFx, updateFx, shake, camPulse, hitStop, clearFx, damageNumber, fxQuality, setFxQuality, fxSettings, setFxSettings, fxStats, dmgScale, explosion, spawnRing as fxRing, flash as fxFlash, smoke, burst, addShake, liquidMaterial, emit, F, glowSprite } from './fx.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as combat from './combat.js';
import { ctx, updateProjectiles, clearProjectiles } from './combat.js';
import * as weaponsMod from './weapons.js';
import { Loot } from './loot.js';
import { loadModels, models, fitModel } from './models.js';
import { randomWeapon, forgeWeapons, weaponName, weaponIcons, makeWeapon, rollAffixes, affixById, codexKey, RARITY, TYPES, ELEMENTS, WEAPON_ASPECTS, aspectById, scrapValue, MAX_PLUS, enhanceCost, weaponScore } from './weapons.js';
import { weaponIcon, $, show } from './ui.js';
import { PERKS, EVOLUTIONS, baseStats, rollPerks, xpForLevel, META, loadMeta, saveMeta } from './perks.js';
import { RELICS, relicById, activeRelicSets, PETS, petById, CHARACTERS, charById, CURSES, EVENTS, ACHIEVEMENTS, DEPTHS } from './content.js';
import { makeElite, updateEliteLabels } from './elites.js';
import { buildHazards, updateHazards, clearHazards } from './hazards.js';
import * as hazards from './hazards.js';
import { Rewards, REWARDS } from './rewards.js';
import { updateAbilities, clearAbilities, ULTIMATES } from './abilities.js';
import { setMusic, updateMusic, unlockMusic } from './music.js';
import { loadSounds, unlockAudio, play, setListener, getVolume, setVolume, getMusicVolume, setMusicVolume, isMuted, setMuted } from './audio.js';
import { saveRunState, loadRunState, clearRunState, describeSavedRun, renderPauseBuildHtml } from './run_save.js';
import { updateTactics, resetTactics, leadAngle, leadPos } from './ai.js';
import { composeWaveSquads, RoomObjectiveManager } from './encounters.js';

// ================= Khởi tạo =================
const phoneInput = matchMedia("(pointer: coarse)");
const portraitPhone = matchMedia("(pointer: coarse) and (orientation: portrait)");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, phoneInput.matches ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 130);
const CAM_OFFSET = new THREE.Vector3(0, 22.0, 15.8);
let camZoom = 1;

// Hậu kỳ: bloom làm các hiệu ứng sáng (lửa, phép, tia sét, đuốc) phát quang
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: phoneInput.matches ? 0 : 2 }));
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(Math.max(1, Math.floor(innerWidth / 2)), Math.max(1, Math.floor(innerHeight / 2))), 0.55, 0.45, 0.92);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
function syncBloomSize() {
  bloomPass.setSize(Math.max(1, Math.floor(innerWidth / 2)), Math.max(1, Math.floor(innerHeight / 2)));
}
syncBloomSize();
function applyFxQuality() {
  bloomPass.enabled = fxQuality.high;
  const b = document.getElementById('btn-fx');
  if (b) b.textContent = 'Hiệu ứng: ' + (fxQuality.high ? 'Cao' : 'Thấp');
}
function syncExtraSettingsUI() {
  const sh = $('btn-shake');
  if (sh) sh.textContent = 'Rung màn hình: ' + (fxSettings.shakeScale > 0 ? Math.round(fxSettings.shakeScale * 100) + '%' : 'Tắt');
  const dm = $('btn-dmgnum');
  if (dm) dm.textContent = 'Số sát thương: ' + (fxSettings.showDmg ? 'Bật' : 'Tắt');
  const fp = $('btn-fps');
  if (fp) fp.textContent = 'Hiện FPS: ' + (fxSettings.showFps ? 'Bật' : 'Tắt');
  const hm = $('btn-hudmode');
  if (hm) hm.textContent = 'HUD: ' + (fxSettings.compactHud ? 'Gọn (H)' : 'Đầy đủ (H)');
  const meter = $('fps-meter');
  if (meter) meter.classList.toggle('hidden', !fxSettings.showFps);
  document.body?.classList?.toggle('hud-compact', !!fxSettings.compactHud);
  if (document.getElementById('corr-item')) renderFlameHud();
}
let _lastPromptHtml = '';
let _lastBossName = '';
let _lastBossPartsHtml = '';
let _lastDynCursesHtml = '';
let _lastTimerHtml = '';
let _lastFlameInt = -1;
let _lastCorrInt = -1;
let _lastMechHtml = '';
let _fpsFrames = 0;
let _fpsAcc = 0;

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  if (started && !paused && !player?.dead) setPaused(true);
  showBanner('Đồ họa tạm gián đoạn', 'Đang khôi phục WebGL context...', 2.5, '#ffcf4a');
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  syncBloomSize();
  applyFxQuality();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  syncBloomSize();
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
      toastT = fxSettings.compactHud ? 2.2 : 3.0;
      play('forged', { vol: 0.6 });
    }
  }
}

const TYPE_LABEL = (w) => (TYPES[w.type].ranged ? 'Đánh xa' : 'Cận chiến') + (w.altForm ? ` ⇄ ${TYPES[w.altForm.type].name}` : '');
const affixText = (w) => [
  ...(w.legendText ? ['★ ' + w.legendText] : []),
  ...(w.grafted && w.specialType ? [`❖ Chiêu: ${SPECIALS[w.specialType]?.name}`] : []),
  ...(w.masterworks || []).map((id) => '✦ ' + weaponsMod.MASTERWORKS[id]?.name),
  ...(w.corrupted ? ['☠ ' + weaponsMod.CORRUPT_TRAITS[w.corrupted]?.name] : []),
  ...(w.affixes || []).map((id) => affixById(id)?.name).filter(Boolean),
  ...(w.gems || []).map((g) => weaponsMod.GEMS[g]?.name + ' (' + weaponsMod.GEMS[g]?.text + ')'),
];
function renderSlots() {
  for (let i = 0; i < 2; i++) {
    const el = hud.slots[i];
    const w = player.weapons[i];
    el.className = 'slot' + (i === player.slot ? ' active' : '') + (w ? ' r' + w.rarity : ' empty') + (i === player.slot && player.temperedT > 0 ? ' tempered' : '');
    if (!w) {
      el.innerHTML = `<span class="num">${i + 1}</span><div class="icon"></div><div class="info"><div class="name">Trống</div><div class="meta empty-hint">Nhặt thêm vũ khí bằng phím E</div></div>`;
      continue;
    }
    const r = RARITY[w.rarity];
    const aff = affixText(w);
    const runes = w.runes || [];
    const runeDots = runes.length
      ? `<span class="rune-dots" title="${describeCircuit(runes)}">${runes.map((id) => `<i style="background:${RUNES[id]?.color || '#fff'};color:${RUNES[id]?.color || '#fff'}"></i>`).join('')}</span>`
      : '';
    const awTag = w.awakening
      ? `<div class="awaken-tag${w.awakened ? ' done' : ''}">${w.awakened ? `✦ Thức Tỉnh · ${w.awakening.ultName}` : `Thức Tỉnh: ${w.awakening.text} (${w.awakening.progress}/${w.awakening.goal})`}</div>`
      : '';
    el.title = [...aff, ...(runes.length ? ['Mạch Cổ Ngữ: ' + describeCircuit(runes)] : [])].join('\n');
    el.innerHTML = `<span class="num">${i + 1}</span>
      <div class="icon"><img src="${weaponIcon(w)}" alt=""></div>
      <div class="info"><div class="name" style="color:${r.css}">${weaponName(w)}</div>
      <div class="meta">${weaponIcons(w)}<span class="w-kind">${r.name} · ${TYPE_LABEL(w)}</span><span class="dur${(w.dur ?? 100) <= 0 ? ' broken' : (w.dur ?? 100) < 30 ? ' low' : ''}">${Math.ceil(w.dur ?? 100)}%</span>${runeDots}</div>
      <div class="heat-bar" id="heat-bar-${i}"><div class="heat-fill" id="heat-fill-${i}" style="width:${Math.round(w.heat || 0)}%"></div></div>
      ${awTag}
      ${aff.length ? `<div class="affixes">${aff.slice(0, 4).map((a) => `<span>${a}</span>`).join('')}</div>` : ''}</div>
      <div class="slot-tip">
        <div class="st-head" style="color:${r.css}">${weaponName(w)}</div>
        <div class="st-sub">${r.name} · ${TYPE_LABEL(w)} · Độ bền ${Math.ceil(w.dur ?? 100)}%</div>
        ${awTag}
        ${aff.length ? `<div class="affixes">${aff.map((a) => `<span>${a}</span>`).join('')}</div>` : ''}
        ${runes.length ? `<div class="st-runes">Mạch Cổ Ngữ: ${describeCircuit(runes)}</div>` : ''}
      </div>`;
  }
  const sp = SPECIALS[player.activeSpecialType] || SPECIALS.sword;
  $('special-ico').style.setProperty('--i', `url('/ui/icons/${sp.icon}.svg')`);
  $('special-name').textContent = sp.name;
  const el = player.weapon.element !== 'none' ? player.weapon.element : 'none';
  $('ult-name').textContent = player.weapon.awakened && player.weapon.awakening?.ultName ? '✦ ' + player.weapon.awakening.ultName : ULTIMATES[el].name;
  // Đồng bộ icon vũ khí & kỹ năng lên cụm nút vòng cung trên điện thoại
  const atkIco = $('touch-atk-ico');
  if (atkIco) {
    const wtIco = { daggers: 'x_daggers', crossbow: 'x_crossbow', spear: 'x_sword-stone', scythe: 'x_swords-emblem', hammer: 'anvil', gauntlets: 'x_gauntlet', whip: 'x_whip', chakram: 'x_chakram' }[player.weapon.type] || player.weapon.type;
    atkIco.style.setProperty('--i', `url('/ui/icons/${wtIco}.svg')`);
  }
  const spIco = $('touch-sp-ico');
  if (spIco) spIco.style.setProperty('--i', `url('/ui/icons/${sp.icon}.svg')`);
  const spLbl = $('touch-sp-lbl');
  if (spLbl) spLbl.textContent = { sword: 'Đỡ', axe: 'Ném', greatsword: 'Tích', staff: 'Cầu', daggers: 'Dao', crossbow: 'Nổ', spear: 'Phóng', scythe: 'Gặt', hammer: 'Chấn', gauntlets: 'Đấm', whip: 'Kéo', chakram: 'Luân' }[player.activeSpecialType] || 'Chiêu';
}

function renderRelics() {
  const validRelics = player.relics.map((id) => relicById(id)).filter(Boolean);
  $('relics').innerHTML = validRelics.map((r) => `<div class="relic${r.cursed ? ' cursed' : ''}" title="${r.name}: ${r.desc}"><i class="ico" style="--i:url('/ui/icons/${r.icon}.svg')"></i></div>`).join('');
  const sets = activeRelicSets(player.relics);
  const rsEl = $('relic-sets');
  if (rsEl) {
    rsEl.innerHTML = sets.map((s) => {
      const tip = `(2) ${s.b2}${s.count >= 3 ? ` · (3) ${s.b3}` : ''}`;
      return `<span class="set-pill" style="border-color:${s.color};color:${s.color}" title="${tip}">${s.name} ${s.count}/3</span>`;
    }).join('');
  }
  const sumEl = $('relic-summary');
  if (sumEl) {
    if (!validRelics.length) {
      sumEl.classList.add('hidden');
      sumEl.innerHTML = '';
    } else {
      sumEl.classList.remove('hidden');
      const shown = validRelics.slice(-5);
      const extra = validRelics.length - shown.length;
      sumEl.innerHTML = shown.map((r) => `<span class="rs-ico${r.cursed ? ' cursed' : ''}"><i class="ico" style="--i:url('/ui/icons/${r.icon}.svg')"></i></span>`).join('')
        + (extra > 0 ? `<span class="rs-more">+${extra}</span>` : '')
        + (sets.length > 0 ? `<span class="rs-sets">${sets.length} Bộ</span>` : '');
    }
  }
}

// ================= Trạng thái =================
let player, loot, rewards, companions, sandbox, defense, objectives;
let enemies = [];
let wave = 0;
let kills = 0;
let intermission = 1.2;
let started = false;
let floor = 1;
let exitOpen = false;
let fading = 0;
let meta = loadMeta();
meta.bestiary = meta.bestiary || {};
let runSouls = 0;
let gold = 0;
let pendingLevels = 0;
let choosing = false;
let perkChoices = [];
let paused = false;
let ghostHp = 100;
let deathShown = false;
let victoryShown = false;
let bestiaryTab = 'mobs';
let runDmg = { basic: 0, special: 0, react: 0, rune: 0, ult: 0, pet: 0 };
let menuT = 0;
let menuAnvil = null;
let menuEmberT = 0;
let menuTransitionT = 0;
const camLook = new THREE.Vector3(-1.45, 1.05, -0.2);
const camLookTarget = new THREE.Vector3();
const _menuPos = new THREE.Vector3();
const _menuVel = new THREE.Vector3();

function ensureMenuAnvil() {
  if (menuAnvil) return menuAnvil;
  const g = new THREE.Group();
  if (models.anvil) {
    g.add(fitModel(models.anvil, 1.38, 'ground'));
  } else {
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.8, roughness: 0.38 });
    const hot = new THREE.MeshStandardMaterial({ color: 0x7a4a3a, emissive: 0xff6a20, emissiveIntensity: 0.75 });
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true;
      g.add(m); return m;
    };
    add(new THREE.BoxGeometry(1.0, 0.32, 0.78), iron, 0, 0.16, 0);
    add(new THREE.BoxGeometry(0.5, 0.5, 0.44), iron, 0, 0.55, 0);
    add(new THREE.BoxGeometry(1.5, 0.32, 0.62), iron, 0.1, 0.94, 0);
    add(new THREE.BoxGeometry(1.08, 0.045, 0.44), hot, 0.15, 1.12, 0);
  }
  const glow = glowSprite(0xff8a30, 1.95);
  glow.position.set(0, 1.15, 0);
  const glow2 = glowSprite(0xffd070, 0.95);
  glow2.position.set(0, 0.98, 0);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.62, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ring.position.y = 0.03;
  g.add(glow, glow2, ring);
  g.position.set(0.2, 0, -0.35);
  g.rotation.y = 0.35;
  g.userData = { ring, glow, glow2 };
  scene.add(g);
  menuAnvil = g;
  return g;
}

function syncMenuStage() {
  if (!player) return;
  if (started) {
    if (menuAnvil) menuAnvil.visible = false;
    if (player.footRing) player.footRing.visible = true;
    if (player.footArrow) player.footArrow.visible = true;
    if (darkLight) darkLight.color.set(0xffd8a0);
    return;
  }
  ensureMenuAnvil().visible = true;
  const saved = loadRunState();
  const showChar = saved?.run?.char || run.char || meta.char || 'knight';
  player.setCharacter(showChar);
  if (saved?.player?.weapons?.length) {
    player.setWeapons(saved.player.weapons, saved.player.slot || 0);
  } else {
    player.weapons = [makeWeapon(player.char.weapon, 'fire', 2)];
    player.equip(0);
  }
  player.pos.set(1.65, 0, 0.75);
  player.root.visible = true;
  player.model.visible = true;
  player.root.position.copy(player.pos);
  player.root.rotation.y = -0.45;
  if (player.footRing) player.footRing.visible = false;
  if (player.footArrow) player.footArrow.visible = false;
  if (player.sweetArc) player.sweetArc.visible = false;
  player.anim?.play('Idle', { fade: 0 });
}
let hurtFlash = 0;
let lastHp = 100;
let best = Number(localStorage.getItem('lorenh_best') || 0);
// Lượt chơi
let run = { char: 'knight', pet: 'none', curses: [], daily: false, mode: 'normal', endless: false };
let choosingReward = false;      // đang chờ người chơi chọn bệ phần thưởng
let nextReward = null;           // phần thưởng nhận khi dọn xong đợt tới
let challengeWave = false;
let waveTime = 0, creeping = false, creepT = 0, creepSpawn = 6;
let scrap = 0;                   // Mảnh Thép (trong lượt chơi): phân rã vũ khí thừa, dùng để cường hóa
let dropsThisWave = 0;
let arenaT = 0, arenaSpawn = 0, arenaWave = false;
let inShop = false;
let shopItems = [];
let event = null;                // biến cố của đợt hiện tại
let darkLight = null;
let slowmoReal = 0;
const camLookAhead = new THREE.Vector3();
let hitCombo = 0, hitComboT = 0, killStreak = 0, killStreakT = 0;
let retHitT = 0, retCrit = false;
let _pickupChain = 0, _pickupChainT = 0;
let _prevDashReady = true, _prevSpReady = true, _prevSlot = 0;
function pulseHudEl(el, cls = 'res-pop') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
// 8 Cơ chế nâng cao
let runeBag = [];
let bossCores = [];
let echoMgr = null;
let trialState = null;           // { chosenGod, spurnedGod, wrathState }
let anchorWave = null;           // loại Mỏ Neo Boss đang đánh
let boostedNext = false;
let cooledNext = false;
let trialDuoBoost = false;
// Quân tiếp viện giữa đợt (cho bản đồ 18x18 rộng)
let reinforceLeft = 0;
let reinforceTrigger = 0;
let reinforcePool = [];

const hasCurse = (id) => run.curses.includes(id);
const soulMult = () => (1 + run.curses.reduce((s, id) => s + (CURSES.find((c) => c.id === id)?.bonus || 0), 0) + (run.depth || 0) * 0.15) * (player?.stats.hoard ? 2 : 1);
const deep = (n) => (run.depth || 0) >= n;

function spawnPos(minDist = 6.5, r = Math.random) {
  let x, z, tries = 0;
  do {
    x = (r() * 2 - 1) * (ROOM_HALF - 2.5);
    z = (r() * 2 - 1) * (ROOM_HALF - 2.5);
    tries++;
  } while (tries < 90 && (
    Math.hypot(x - player.pos.x, z - player.pos.z) < minDist ||
    Math.hypot(x - player.pos.x, z - player.pos.z) > 32 ||
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
  const ember = flameTier() === 'ember';
  ctx.enemyDmgMul = 1.35 * (1 + (floor - 1) * 0.18 + (wave - 1) * 0.012) * (deep(2) ? 1.15 : 1) * (1 + extraDmgCurse) * (ember ? 1.15 : 1);
  ctx.bossBane = bossBane;
  ctx.floor = floor;
  ctx.depth = run.depth || 0;
  ctx.enemySpeed = (ctx.enemySpeed || 1) * (deep(5) ? 1.1 : 1) * (deep(10) ? 1.1 : 1) * (ember ? 1.18 : 1);
  dmgScale.player = ctx.enemyDmgMul;
}

const BIOME_ELEM = {
  ice: ['ice', 'fire'],
  lava: ['fire', 'ice'],
  crypt: ['blood', 'holy'],
  swamp: ['poison', 'fire'],
  sanctum: ['lightning', 'ice'],
  stone: [null, null],
};
function recordBestiary(e, killed = false) {
  const bid = enemyBestiaryId(e);
  if (!bid) return;
  meta.bestiary = meta.bestiary || {};
  const rec = meta.bestiary[bid] || (meta.bestiary[bid] = { seen: false, kills: 0 });
  rec.seen = true;
  if (killed) rec.kills = (rec.kills || 0) + 1;
}
function addEnemy(e, opts = {}) {
  const be = BIOME_ELEM[floorTheme(floor).biome.id] || [null, null];
  if (be[0] && Math.random() < 0.8) { e.resist = be[0]; e.weak = be[1]; }
  if (!e.isBoss && !e.isDummy) {
    const r = opts.r || Math.random;
    if (player.hasRelic('greed')) e.hp *= 1.25;
    e.hp = Math.round(e.hp * (1 + (wave - 1) * 0.08) * (1 + (floor - 1) * 0.3) * Math.pow(playerPower(), 0.22) * (hasCurse('tough') ? 1.5 : 1) * (deep(1) ? 1.2 : 1) * (opts.hpMul || 1));
    if (floor >= 3) e.eliteSpeed = (e.eliteSpeed || 1) * (1 + Math.min(0.25, (floor - 2) * 0.06));
    const baseChance = wave >= 3 || deep(3) ? Math.min(0.3, 0.04 + wave * 0.02) * (deep(3) ? 2 : 1) : 0;
    const eliteChance = challengeWave || anchorWave || event?.id === 'elites' ? 1 : baseChance;
    if (r() < eliteChance) {
      makeElite(e, deep(4) ? 2 + (r() < 0.3 ? 1 : 0) : null, r);
      if (hasDynCurse('cursed_greed')) e.hp = Math.round(e.hp * 1.3);
    }
  }
  e.maxHpEff = e.hp;
  recordBestiary(e, false);
  enemies.push(e);
}

// Danh sách toàn bộ 24 loại quái (gồm 14 quái mới + 9 quái 3D Quaternius)
const MAKE_ENEMY = {
  mage: Mage, minion: Minion, assassin: Assassin, archer: Archer, healer: Healer,
  shield: ShieldBearer, bomber: Bomber, wraith: Wraith, armored: Armored, burrower: Burrower,
  pyro: PyroMage, frostguard: FrostGuard, lancer: Lancer, necro: Necromancer, berserker: Berserker,
  orc: OrcBrute, goblin: GoblinRaider, imp: FireImp, drake: FrostDrake, glub: AcidGlub,
  spider: VenomSpider, wasp: GiantWasp, viper: Viper, crab: StoneCrab,
};
const BOSS_COUNT = 10; // 10 Boss thường (0..9) + Boss #10 FallenSmith (Trùm Cuối Tầng 5)
function nextBossKind(r = Math.random) {
  if (!run.bossDeck || !run.bossDeck.length) {
    run.bossDeck = Array.from({ length: BOSS_COUNT }, (_, i) => i);
    for (let i = run.bossDeck.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [run.bossDeck[i], run.bossDeck[j]] = [run.bossDeck[j], run.bossDeck[i]];
    }
  }
  return run.bossDeck.shift();
}
function createBosses(kind, level) {
  if (kind === 10) return [new FallenSmith(scene, 0, -10, level)];
  if (kind === 9) return spawnTwinReapers(scene, level);
  const C = [Boss, KingSlime, ArchMage, ShadowLord, ForgeOgre, FrostDragon, EmberDragon, PlagueKing, FrostWarden][kind] || Boss;
  return [new C(scene, 0, -10, level)];
}

// ================= Đợt quái =================
function spawnBossWave() {
  reinforceLeft = 0;
  const level = 1 + Math.floor((floor - 1) / 5);
  // Tầng 5 (đợt 25): đối đầu TRÙM CUỐI Thợ Rèn Sa Ngã · Hắc Hỏa Tôn!
  const isTrueFinal = floor === 5 && !run.bossrush && !run.endless;
  const kind = isTrueFinal ? 10 : nextBossKind(rngFor(6));
  const bosses = createBosses(kind, level);
  applyDifficulty();
  const hpMul = (1 + 0.4 * (floor - 1)) * Math.pow(playerPower(), 0.55) * (deep(9) ? 1.3 : 1);
  const intactAnchors = activeBossAnchors(floorMap);
  for (const boss of bosses) {
    boss.spawnT = -0.4;
    boss.hp = boss.maxHp = Math.round(boss.maxHp * hpMul);
    boss.poiseMax = Math.round(boss.poiseMax * Math.sqrt(hpMul));
    boss.phases = boss.isTrueBoss ? [0.66, 0.33] : bosses.length > 1 ? [0.5] : (floor >= 3 ? [0.6, 0.25] : [0.5]);
    if (deep(6) && !boss.isTrueBoss) boss.phases = bosses.length > 1 ? [0.6, 0.3] : (floor >= 3 ? [0.75, 0.5, 0.25] : [0.6, 0.3]);
    boss.bossKind = kind;
    if (hasCurse('bossrage')) {
      boss.hp = boss.maxHp = Math.round(boss.maxHp * 1.5);
      Object.defineProperty(boss, 'enraged', { get: () => true });
    }
    for (const pt of boss.parts || []) {
      pt.maxHp = pt.hp = Math.round(boss.maxHp * (pt.pct || 0.24));
    }
    if (intactAnchors.length) {
      boss.empoweredAnchors = intactAnchors.length;
      if (intactAnchors.includes('aegis')) boss.shieldHp = Math.round(boss.maxHp * 0.35);
      if (intactAnchors.includes('frenzy')) boss.timeMul = (boss.timeMul || 1) * 1.22;
      if (intactAnchors.includes('horde')) boss.anchorHorde = true;
    }
    addEnemy(boss);
  }
  const escortKind = [Minion, null, Archer, Wraith, FireImp, FrostDrake, GoblinRaider, VenomSpider, FrostGuard, Wraith, OrcBrute][kind];
  for (let i = 0; i < level + 2; i++) {
    const [x, z] = spawnPos(8);
    const m = escortKind ? new escortKind(scene, x, z) : new Slime(scene, x, z, 'normal');
    m.spawnT = -1 - i * 0.45;
    addEnemy(m);
  }
  ctx.enemies = enemies;
  const title = isTrueFinal ? 'TRÙM CUỐI · Thợ Rèn Sa Ngã' : bosses.length > 1 ? 'Song Tử Tử Thần' : bosses[0].name;
  const sub = isTrueFinal
    ? '3 Giai Đoạn · Hạ gục để thanh tẩy Lò Rèn & mở Chế Độ Vô Tận!'
    : intactAnchors.length
      ? `Siêu Tiến Hóa (${intactAnchors.map((a) => ANCHOR_TYPES[a]?.name).join(', ')}) · Thưởng ×2!`
      : bosses.length > 1
        ? `Boss đôi tầng ${floor} · Hỏa Ảnh & Lôi Ảnh`
        : `Boss tầng ${floor} · đợt ${wave}`;
  showBanner(title, sub, 3.0, isTrueFinal ? '#ffe060' : '#ff6a4a');
  play('anvil');
}

// Đợt quái riêng cho Chế Độ Thủ Thành Lò Lửa (10 đợt từ bốn phía tràn vào Lò Trung Tâm)
function spawnDefenseWave() {
  applyDifficulty();
  const count = 8 + wave * 3;
  const pool = ['normal', 'goblin', 'minion', 'spider', 'viper', 'orc', 'archer', 'imp', 'wasp', 'lancer', 'pyro', 'frostguard', 'berserker', 'bomber', 'crab', 'glub', 'wraith'];
  const maxIdx = Math.min(pool.length, 4 + wave * 2);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = 17 + Math.random() * 7;
    const x = Math.max(-(ROOM_HALF - 2.5), Math.min(ROOM_HALF - 2.5, Math.cos(a) * r));
    const z = Math.max(-(ROOM_HALF - 2.5), Math.min(ROOM_HALF - 2.5, Math.sin(a) * r));
    if (isBlocked(x, z, 0.9)) continue;
    const kind = pool[Math.floor(Math.random() * maxIdx)];
    const e = MAKE_ENEMY[kind] ? new MAKE_ENEMY[kind](scene, x, z) : new Slime(scene, x, z, kind);
    e.spawnT = -0.3 - (i % 6) * 0.25;
    addEnemy(e, { hpMul: 0.9 + wave * 0.08 });
  }
  if (wave === 5 || wave === DEFENSE_MAX_WAVES) {
    const boss = wave === DEFENSE_MAX_WAVES ? new FallenSmith(scene, 0, -18, 1) : new ForgeOgre(scene, 0, -18, 1);
    boss.spawnT = -0.5;
    boss.hp = boss.maxHp = Math.round(boss.maxHp * (wave === DEFENSE_MAX_WAVES ? 1.35 : 1.0));
    boss.phases = wave === DEFENSE_MAX_WAVES ? [0.66, 0.33] : [0.5];
    boss.bossKind = wave === DEFENSE_MAX_WAVES ? 10 : 4;
    for (const pt of boss.parts || []) pt.maxHp = pt.hp = Math.round(boss.maxHp * (pt.pct || 0.24));
    addEnemy(boss);
    showBanner(wave === DEFENSE_MAX_WAVES ? 'ĐỢT CUỐI 10/10 · Hắc Hỏa Tôn!' : 'Đợt 5/10 · Boss Công Thành!', 'Bảo vệ Lò Lửa Trung Tâm bằng mọi giá!', 2.8, '#ffcf4a');
    play('anvil');
  } else {
    showBanner(`Thủ Thành · Đợt ${wave} / ${DEFENSE_MAX_WAVES}`, 'Đứng cạnh Bệ Trụ (E) xây/nâng cấp Trụ Pháo bằng Mảnh Thép!', 2.2, '#ffaa40');
    play('waveStart');
  }
  ctx.enemies = enemies;
}

function spawnReinforcements() {
  if (reinforceLeft <= 0 || !reinforcePool.length) return;
  reinforceLeft--;
  const count = Math.min(8, 4 + Math.floor(floor / 2) + Math.floor(wave / 3));
  for (let i = 0; i < count; i++) {
    const kind = reinforcePool[Math.floor(Math.random() * reinforcePool.length)];
    const [x, z] = spawnPos(9);
    const e = MAKE_ENEMY[kind] ? new MAKE_ENEMY[kind](scene, x, z) : new Slime(scene, x, z, kind);
    e.spawnT = -0.35 - i * 0.12;
    addEnemy(e);
  }
  ctx.enemies = enemies;
  showBanner('Quân Tiếp Viện!', `+${count} quái đang tràn vào đấu trường`, 1.9, '#ffb040');
  play('waveStart', { rate: 1.15, vol: 0.7 });
}

function spawnWave() {
  if (run.mode === 'sandbox') return;
  wave++;
  event = null;
  reinforceLeft = 0;
  ctx.enemySpeed = hasCurse('fast') ? 1.2 : 1;
  setDark(false);
  arenaT = 0; arenaWave = false;
  dropsThisWave = 0;
  hitThisWave = false;
  waveTime = 0; creeping = false; creepT = 0; creepSpawn = 6;
  if (run.mode === 'defense') { spawnDefenseWave(); return; }
  if (run.bossrush) { wave = floor * 5; renderEvent(); }
  if (wave % 5 === 0) { spawnBossWave(); return; }
  applyDifficulty();
  const R = rngFor(1);
  // Biến cố đợt
  if (!challengeWave && ((wave >= 4 && R() < 0.3) || (deep(8) && wave >= 2))) {
    event = EVENTS[Math.floor(R() * EVENTS.length)];
    if (event.id === 'bloodmoon') ctx.enemySpeed *= 1.25;
    if (event.id === 'dark') setDark(true);
    if (event.id === 'arena') { arenaT = 30; arenaSpawn = 3; arenaWave = true; }
  }
  let mult = hasCurse('swarm') ? 1.4 : 1;
  let hpMul = 1;
  if (event?.id === 'horde') { mult *= 1.85; hpMul = 0.62; }
  const biome = floorTheme(floor).biome.id;
  const { units, squadNames, escortPairs } = composeWaveSquads({ wave, floor, biome, mult, arenaWave, rng: R, playerPos: player.pos });
  const spawned = [];
  for (const u of units) {
    const e = MAKE_ENEMY[u.kind] ? new MAKE_ENEMY[u.kind](scene, u.x, u.z) : new Slime(scene, u.x, u.z, u.kind);
    if (u.kind === 'shield') e.facing = Math.atan2(player.pos.x - u.x, player.pos.z - u.z);
    e.spawnT = -R() * 0.65;
    addEnemy(e, { hpMul, r: R });
    spawned.push(e);
  }
  for (const pair of escortPairs) {
    const g = spawned[pair.guardIndex], t = spawned[pair.targetIndex];
    if (g instanceof ShieldBearer && t) g.guardTarget = t;
  }
  // Lên lịch Quân Tiếp Viện giữa đợt từ Đợt 2 trở đi (khi hạ ~65% quân ban đầu)
  if (wave >= 2 && !arenaWave) {
    reinforceLeft = floor >= 3 ? 2 : 1;
    reinforceTrigger = Math.max(3, Math.floor(spawned.length * 0.35));
    reinforcePool = [...new Set(units.map((u) => u.kind).filter((k) => k !== 'healer' && k !== 'mother'))];
  }
  // Kẻ Săn Đầu: từ tầng 2, săn bạn qua các tầng; để chạy thoát thì lần sau mạnh hơn
  if (floor >= 2 && !arenaWave && (run.nemesisLv > 0 ? R() < 0.5 : R() < 0.15)) {
    const lv = (run.nemesisLv || 0) + 1;
    const [x, z] = spawnPos(12, R);
    const nm = new Assassin(scene, x, z);
    nm.spawnT = -1.2;
    nm.hp = Math.round(nm.hp * (5 + lv * 2));
    addEnemy(nm, { r: R });
    if (!nm.elite) makeElite(nm, Math.min(3, 1 + lv), R);
    nm.nemesis = true; nm.miniBoss = true; nm.fleeT = 35; nm.dropChance = 0;
    nm.name = `Kẻ Săn Đầu · cấp ${lv}`;
    nm.group.scale.multiplyScalar(1.25);
    nm.maxHpEff = nm.hp;
    nm.poiseMax = Math.round(nm.hp * 0.4);
    for (const m of nm.mats) if (m.color) m.color.lerp(new THREE.Color(0x8a1a3a), 0.5);
    nm._sigT = 4.2;
    nm.miniBossTick = (dt) => {
      if (!nm.alive || nm.spawning || nm.stunned) return;
      const tp = targetFor(nm);
      if (!nm._enraged50 && nm.hp <= nm.maxHpEff * 0.5) {
        nm._enraged50 = true;
        nm.eliteSpeed = (nm.eliteSpeed || 1) * 1.2;
        fxRing(scene, nm.pos, 4.5, 0xff5a8a, 0.45);
        damageNumber(nm.pos, 'Cuồng Nộ!', 'burn');
      }
      nm._sigT -= dt;
      if (nm._sigT <= 0 && tp && !tp.dead) {
        nm._sigT = 5.5;
        const baseA = leadAngle(nm.pos, tp, 20, 0.55);
        for (const off of [-0.22, 0, 0.22]) {
          const a = baseA + off;
          const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          combat.enemyShot(nm.pos.clone().setY(1.1).addScaledVector(dir, 0.9), dir, 10, 'arrow');
        }
        play('bowShoot', { at: nm.pos, rate: 0.9 });
      }
    };
    setTimeout(() => showBanner('Kẻ Săn Đầu đã tới!', 'Hạ hắn trong 35 giây trước khi hắn bỏ chạy', 2.6, '#ff5a8a'), 2800);
  }
  // Cột Tế / Mỏ Neo Boss (3 trụ + mục tiêu phòng)
  if (anchorWave) {
    const anchorTotems = [];
    const spots = [[-10, -8], [0, -11], [10, -8]];
    for (const [ax, az] of spots) {
      let [tx, tz] = [ax, az];
      if (isBlocked(tx, tz, 0.9)) [tx, tz] = spawnPos(7, R);
      const t = new Totem(scene, tx, tz, { hp: Math.round(75 * (1 + (floor - 1) * 0.35)) });
      t.spawnT = 0; t.maxHpEff = t.hp; enemies.push(t); anchorTotems.push(t);
    }
    objectives?.startAnchors(anchorTotems, () => {
      if (enemies.length >= 36 || !reinforcePool.length) return;
      for (let k = 0; k < 2; k++) {
        const kind = reinforcePool[Math.floor(Math.random() * reinforcePool.length)];
        const [rx, rz] = spawnPos(9);
        const re = MAKE_ENEMY[kind] ? new MAKE_ENEMY[kind](scene, rx, rz) : new Slime(scene, rx, rz, kind);
        re.spawnT = -0.3;
        addEnemy(re);
      }
      ctx.enemies = enemies;
    });
  } else if (wave >= 4 && !arenaWave && R() < 0.35) {
    const [x, z] = spawnPos(9, R);
    const t = new Totem(scene, x, z, { hp: Math.round(60 * (1 + (floor - 1) * 0.4)) });
    t.spawnT = 0; t.maxHpEff = t.hp; enemies.push(t);
  }
  // Thủ Lĩnh (mini-boss) ở đợt thứ 3 của mỗi tầng (8 chủng Thủ Lĩnh đa dạng!)
  if (wave % 5 === 3 && !arenaWave) {
    const [x, z] = spawnPos(10, R);
    const miniPool = [
      [ShieldBearer, 'Khiên Binh'], [Minion, 'Lính Xương'], [Assassin, 'Sát Thủ'], [Wraith, 'Bóng Ma'],
      [OrcBrute, 'Chiến Binh Orc'], [FrostGuard, 'Vệ Binh Băng'], [Berserker, 'Cuồng Chiến'], [Lancer, 'Kỵ Binh Xương'],
    ];
    const [C, label] = miniPool[Math.floor(R() * miniPool.length)];
    const mb = new C(scene, x, z);
    mb.spawnT = -0.8;
    mb.hp = Math.round(mb.hp * 4.5);
    addEnemy(mb, { r: R });
    if (!mb.elite) makeElite(mb, 3, R);
    mb.miniBoss = true;
    mb.name = 'Thủ Lĩnh ' + label;
    mb.group.scale.multiplyScalar(1.32);
    mb.maxHpEff = mb.hp;
    mb.poiseMax = Math.round(mb.hp * 0.4);
    mb.dropChance = 0;
    mb._sigT = 4.0;
    mb.miniBossTick = (dt) => {
      if (!mb.alive || mb.spawning || mb.stunned) return;
      const tp = targetFor(mb);
      if (!mb._enraged50 && mb.hp <= mb.maxHpEff * 0.5) {
        mb._enraged50 = true;
        mb.eliteSpeed = (mb.eliteSpeed || 1) * 1.2;
        fxRing(scene, mb.pos, 4.8, 0xff8a4a, 0.45);
        damageNumber(mb.pos, 'Cuồng Nộ!', 'burn');
      }
      mb._sigT -= dt;
      if (mb._sigT <= 0 && tp && !tp.dead) {
        mb._sigT = 5.5;
        const p = leadPos(mb.pos, tp, 12, 0.55);
        combat.scheduleBomb(new THREE.Vector3(p.x, 0, p.z), 0.9, 2.7, 0, 18, 0xff8a30);
        play('mageCast', { at: mb.pos, rate: 0.75 });
      }
    };
  }
  if (wave >= 2 && !anchorWave && !challengeWave && !arenaWave && !trialState && R() < 0.3) {
    objectives?.startKoth(new THREE.Vector3(0, 0, -4), () => {
      showBanner('Vòng Lò Lửa Đầy!', 'Sóng nổ Thánh Quang · Rơi Rương Di Vật!', 2.2, '#ffcf4a');
      rewards.spawnChest(0, -4);
    }, 12);
  }
  if (challengeWave || event?.id === 'bloodmoon') objectives?.setFireRing(18.5);
  ctx.enemies = enemies;
  if (player.hasRelic('badge')) player.shieldHp = 25;
  if (anchorWave) showBanner(`Mỏ Neo: ${ANCHOR_TYPES[anchorWave]?.name || 'Boss'}`, 'Phá hết 3 trụ Mỏ Neo để tước sức mạnh Boss cuối tầng · rơi Cổ Ngữ', 2.6, '#ff4080');
  else if (trialState) showBanner(GOD_WRATH[trialState.spurnedGod.id].name, GOD_WRATH[trialState.spurnedGod.id].desc, 2.8, trialState.spurnedGod.color);
  else if (challengeWave) showBanner(`Đợt ${wave}: Thử Thách`, 'Toàn quái tinh anh · giữ vị trí trong Vòng Lửa!', 2.4, '#ff6a4a');
  else if (event) showBanner(event.name, event.desc, 2.6, event.color);
  else if (enemies.some((e) => e.miniBoss)) showBanner('Thủ Lĩnh xuất hiện!', enemies.find((e) => e.miniBoss).name + ' · hạ để nhận rương di vật', 2.6, '#ff8a4a');
  else showBanner(`Đợt ${wave}`, `${enemies.length} quái · ${squadNames.slice(0, 2).join(' + ')}`);
  renderEvent();
  play('waveStart');
}

function renderEvent() {
  const el = $('event-chip');
  if (trialState) { el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/${trialState.spurnedGod.icon}.svg');color:${trialState.spurnedGod.color}"></i>${GOD_WRATH[trialState.spurnedGod.id].name}`; el.style.display = ''; }
  else if (anchorWave) { el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/x_cursed.svg');color:#ff4080"></i>Mỏ Neo: ${ANCHOR_TYPES[anchorWave]?.name || ''}`; el.style.display = ''; }
  else if (event) { el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/${event.icon}.svg');color:${event.color}"></i>${event.name}`; el.style.display = ''; }
  else if (challengeWave) { el.innerHTML = '<i class="ico" style="--i:url(\'/ui/icons/x_skull-signet.svg\');color:#ff6a4a"></i>Thử thách'; el.style.display = ''; }
  else el.style.display = 'none';
}

function onWaveCleared() {
  if (run.mode === 'sandbox') return;
  objectives?.clear();
  resetTactics();
  loot.vacuumAll();
  if (!hitThisWave && wave % 5 !== 0) questProgress('nohit');
  play('waveClear');
  // Hồi độ bền giữa mỗi đợt (+25%, Thợ Rèn hồi 100%)
  for (const w of player.weapons) {
    w.dur = player.stats.smithAutoPlus ? 100 : Math.min(100, (w.dur ?? 100) + 25);
    if (w.dur > 0) w.warnedBroken = false;
  }
  renderSlots();
  // Chế độ Thủ Thành Lò Lửa (10 đợt)
  if (run.mode === 'defense') {
    defense?.healCore(80);
    addScrap(10);
    if (wave >= DEFENSE_MAX_WAVES) {
      meta.stats.defenseWins = (meta.stats.defenseWins || 0) + 1;
      addSouls(120);
      showVictory('defense');
      return;
    }
    if (wave % 2 === 0) {
      const [x, z] = spawnPos(4);
      loot.drop(randomWeapon(wave + 2), x, z);
    }
    if (wave === 4 || wave === 7) {
      loot.removeAnvil();
      loot.spawnAnvil(0, 6.5);
      loot.anvilUses = 2;
      showBanner('Đợt đã dọn! Đe Rèn xuất hiện', '+10 Mảnh Thép · +80 HP Lò Lửa · Xây Trụ trước đợt sau!', 2.8, '#ffa040');
    } else {
      showBanner(`Dọn sạch Đợt ${wave}/${DEFENSE_MAX_WAVES}!`, '+10 Mảnh Thép · +80 HP Lò Lửa · 5 giây chuẩn bị Trụ Pháo', 2.4, '#7fff9a');
    }
    intermission = 5.0;
    checkAchievements();
    return;
  }
  meta.stats.maxWave = Math.max(meta.stats.maxWave || 0, wave);
  setDark(false);
  event = null;
  if (arenaWave) { arenaWave = false; addGold(50); addSouls(15); showBanner('Chiến thắng Đấu Trường!', '+50 vàng · +15 Hồn Thép', 2.4, '#ffb040'); }
  // Thưởng phòng Song Tượng Thần (Trial of the Gods): nhận nốt thẻ của vị thần bị từ chối + tăng cơ hội Song Thần!
  if (trialState) {
    const sp = trialState.spurnedGod;
    const free = BOONS.filter((b) => b.god === sp.id && !player.perkLv[b.id]);
    const b = free[Math.floor(Math.random() * free.length)];
    if (b) {
      player.perkLv[b.id] = 1;
      b.apply(player.base, 1, player);
      player.recalc();
      toast(b.icon, `Chinh phục ${sp.name}: ${b.name}`, b.desc(1));
    }
    trialDuoBoost = true;
    trialState = null;
    showBanner('Vượt Qua Song Tượng Thần!', 'Nhận phước cả 2 vị thần · mở mạnh thẻ Song Thần', 2.6, '#ffe060');
  }
  // Thưởng phá Mỏ Neo Boss
  if (anchorWave) {
    const aName = ANCHOR_TYPES[anchorWave]?.name || 'Mỏ Neo';
    anchorWave = null;
    const rId = randomRune();
    loot.spawnPickup('rune', 0, -2, RUNES[rId]);
    showBanner(`Đã Phá ${aName}!`, 'Boss cuối tầng đã bị suy yếu · rơi 1 Cổ Ngữ', 2.6, '#ff60a0');
  }
  renderEvent();
  // Phần thưởng đã chọn từ bệ
  if (nextReward) { grantReward(nextReward); nextReward = null; }
  if (challengeWave) { challengeWave = false; rewards.spawnChest(0, -3); }
  boostedNext = false; cooledNext = false;
  if (run.bossrush && wave % 5 === 0) { pendingLevels += 2; player.heal(Math.round(player.maxHp * 0.4)); if (!choosing) openLevelUp(); }
  if (wave % 5 === 0) {
    exitOpen = true;
    spawnExit(0, 0);
    intermission = Infinity;
    // Hạ Trùm Cuối Tầng 5 -> Màn hình Chiến Thắng + lựa chọn Chế Độ Vô Tận (Tầng 6+)!
    if (floor === 5 && !run.endless && !run.bossrush && !victoryShown) {
      addSouls(150);
      clearRunState();
      showVictory('story');
      return;
    }
    showBanner('Lối xuống đã mở', `Tới nắp hầm giữa phòng, bấm E để xuống tầng ${floor + 1}`, 3.2, '#7fd8ff');
    checkAchievements();
    autoSaveRun();
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
  if (!hasCurse('nopot') && meta.up.regen) player.heal(meta.up.regen * 6);
  // Bệ phần thưởng cho đợt sau
  offerRewards();
  checkAchievements();
  autoSaveRun();
}

function offerRewards() {
  const R = rngFor(2);
  const pool = ['weapon', 'perk', 'souls', 'gold', 'potion'];
  if (R() < 0.18) pool.push('relic');
  if (wave >= 2 && R() < 0.35) pool.push('shop');
  if (wave >= 3 && R() < 0.25) pool.push('challenge');
  if (wave >= 3 && R() < 0.2) pool.push('treasure');
  if (wave >= 2 && R() < 0.35) pool.push('event');
  let pick = [];
  const n = R() < 0.3 ? 3 : 2;
  while (pick.length < n && pool.length) pick.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  // Theo bản đồ tầng: chỉ những nút nối với nút đã chọn trước đó
  const step = (wave - 1) % 5;
  const ch = choicesAt(floorMap, step);
  if (ch) pick = [...new Set(ch.map((i) => floorMap.layers[step][i].kind))];
  if (vil('tower')) { const extra = ['relic', 'treasure', 'event', 'perk', 'weapon'].filter((k) => !pick.includes(k)); if (extra.length) pick.push(extra[Math.floor(R() * extra.length)]); }
  if (hasCurse('nopot')) { const i = pick.indexOf('potion'); if (i >= 0) pick[i] = 'gold'; }
  rewards.offer(pick, -7);
  choosingReward = true;
  intermission = Infinity;
}

function chooseReward(kind) {
  // ghi lại đường đi và lan truyền hiệu ứng sang các nút nối tiếp trên bản đồ tầng (cơ chế #7)
  const step = (wave - 1) % 5, ch = choicesAt(floorMap, step);
  let chosenNode = null;
  if (ch) {
    const idx = ch.find((i) => floorMap.layers[step][i].kind === kind);
    if (idx != null) chosenNode = propagateChoice(floorMap, step, idx);
  }
  boostedNext = !!chosenNode?.boosted;
  cooledNext = !!chosenNode?.cooled;
  rewards.clearPedestals();
  choosingReward = false;
  play('uiConfirm');
  if (kind === 'shop') {
    openShopRoom();
    return;
  }
  if (kind === 'event') { openEventRoom(); return; }
  if (kind === 'trial') { openTrialRoom(); return; }
  if (kind === 'treasure') {
    // Phòng kho báu: 2 rương + vàng rải khắp nơi, không có quái
    rewards.spawnChest(-3, -4); rewards.spawnChest(3, -4);
    for (let i = 0; i < (boostedNext ? 22 : 16); i++) { const [x, z] = spawnPos(1.5); loot.spawnPickup('gold', x, z, 4); }
    showBanner('Phòng Kho Báu', 'Mở rương (E) và nhặt vàng trước khi đợt sau tới', 2.4, '#ffd060');
    intermission = 15;
    autoSaveRun();
    return;
  }
  if (kind === 'anchor') {
    anchorWave = chosenNode?.anchorType || 'aegis';
    showBanner('Mỏ Neo Boss: ' + (ANCHOR_TYPES[anchorWave]?.name || ''), 'Đợt sau sẽ phá Mỏ Neo này để làm yếu Boss!', 2.2, '#ff4080');
    intermission = 2.5;
    renderNextReward();
    autoSaveRun();
    return;
  }
  if (kind === 'challenge') challengeWave = true;
  else nextReward = kind;
  const r = REWARDS[kind];
  showBanner(r.name + (boostedNext ? ' ★' : ''), kind === 'challenge' ? r.desc : (boostedNext ? 'Nút cường hóa: phần thưởng tốt hơn!' : 'Nhận khi dọn sạch đợt tới'), 1.8, '#' + r.color.toString(16).padStart(6, '0'));
  intermission = 2.5;
  renderNextReward();
  autoSaveRun();
}

function renderNextReward() {
  const el = $('next-reward');
  if (nextReward) {
    const r = REWARDS[nextReward];
    el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/${r.icon}.svg');color:#${r.color.toString(16).padStart(6, '0')}"></i>Phần thưởng: ${r.name}${boostedNext ? ' ★' : ''}`;
    el.style.display = '';
  } else el.style.display = 'none';
}

function grantReward(kind) {
  const at = player.pos.clone().add(new THREE.Vector3(0, 0, -2));
  const mul = boostedNext ? 1.5 : 1;
  if (kind === 'weapon') {
    const w = randomWeapon(wave + (boostedNext ? 5 : 3));
    w.rarity = Math.min(2, Math.max(cooledNext ? 0 : 1, w.rarity + (boostedNext ? 1 : cooledNext ? 0 : 1)));
    w.affixes = rollAffixes(w.rarity);
    loot.drop(w, at.x, at.z);
  } else if (kind === 'perk') { pendingLevels++; if (!choosing) openLevelUp(); }
  else if (kind === 'souls') addSouls(Math.round(25 * mul));
  else if (kind === 'gold') addGold(Math.round(40 * mul));
  else if (kind === 'potion') { player.heal(player.maxHp); addFlame(25); }
  else if (kind === 'relic') rewards.spawnChest(at.x, at.z);
  nextReward = null;
  renderNextReward();
}

function addSouls(v) {
  const emberMul = flameTier() === 'ember' ? 2 : 1;
  v = Math.max(1, Math.round(v * (1 + (meta.up.souls || 0) * 0.2) * soulMult() * emberMul));
  runSouls += v;
  meta.souls += v;
  saveMeta(meta);
  if (v > 0) pulseHudEl($('souls'));
}
function addScrap(v) {
  if (v > 0 && player.hasRelic('greed')) v *= 2;
  scrap += v;
  $('scrap').textContent = scrap;
  if (v > 0) pulseHudEl($('scrap'));
}
function addGold(v) {
  const emberMul = v > 0 && flameTier() === 'ember' ? 2 : 1;
  v = Math.round(v * (v > 0 && player.hasRelic('goldbag') ? 1.5 : 1) * (v > 0 && player.stats.hoard ? 2 : 1) * emberMul);
  gold = Math.max(0, gold + v);
  if (v > 0) pulseHudEl($('gold'));
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
  const disc = boostedNext ? 0.7 : 1;
  const p = (v) => Math.max(10, Math.round(v * disc));
  const w1 = randomWeapon(wave + 2, R); w1.rarity = Math.max(1, w1.rarity); w1.affixes = rollAffixes(w1.rarity, [], R);
  const w2 = randomWeapon(wave + 4, R); w2.rarity = 2; w2.affixes = rollAffixes(2, [], R);
  const r1 = RUNES[randomRune(R)];
  shopItems = [
    { id: 'potion', name: 'Bình máu lớn', icon: 'potion', desc: 'Hồi 50% máu · +20 Ánh Lửa', price: p(30), dark: 20 },
    { id: 'perk', name: 'Thẻ năng lực', icon: 'level', desc: 'Lên thêm 1 cấp', price: p(60), dark: 30 },
    { id: 'rune', name: r1.name, icon: r1.icon, runeId: r1.id, desc: `Cổ Ngữ: ${r1.desc}`, price: p(45), dark: 25 },
    { id: 'weapon', name: weaponName(w1), icon: null, weapon: w1, desc: RARITY[w1.rarity].name, price: p(55), dark: 30 },
    { id: 'weapon', name: weaponName(w2), icon: null, weapon: w2, desc: RARITY[2].name, price: p(120), dark: 45 },
    { id: 'relic', name: 'Di vật bí ẩn', icon: 'x_locked-chest', desc: 'Một di vật ngẫu nhiên', price: p(110), dark: 40 },
    { id: 'maxhp', name: 'Áo giáp vá', icon: 'p_hp', desc: '+15 máu tối đa', price: p(70), dark: 30 },
    { id: 'affix', name: 'Đá phụ tố', icon: 'x_rune', desc: 'Thêm 1 phụ tố cho vũ khí đang cầm', price: p(80), dark: 35 },
  ].filter((it) => !(hasCurse('nopot') && it.id === 'potion'));
  showBanner('Thương nhân' + (boostedNext ? ' (Giảm giá 30% ★)' : ''), 'Lại gần và bấm E để mua bằng Vàng hoặc Tha Hóa', 2.4, '#ffa040');
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
      <div class="si-btns">
        <button class="btn buy" data-i="${i}" ${it.sold || gold < it.price ? 'disabled' : ''}>${it.sold ? 'Đã mua' : `<i class="ico ico-gold"></i>${it.price}`}</button>
        ${it.sold ? '' : `<button class="btn dark-btn" data-dark="${i}" title="Mua miễn phí nhưng tăng Tha Hóa">+${it.dark || 30} Tha Hóa</button>`}
      </div>
    </div>`;
  }).join('');
  for (const b of $('shop-items').querySelectorAll('.buy')) b.onclick = () => buyItem(Number(b.dataset.i), false);
  for (const b of $('shop-items').querySelectorAll('[data-dark]')) b.onclick = () => buyItem(Number(b.dataset.dark), true);
}

function buyItem(i, useDark = false) {
  const it = shopItems[i];
  if (!it || it.sold || (!useDark && gold < it.price)) { play('uiBack'); return; }
  if (useDark) addCorruption(it.dark || 30, player.pos, scene);
  else gold -= it.price;
  it.sold = true;
  play('pickup');
  if (it.id === 'potion') { player.heal(Math.round(player.maxHp * 0.5)); addFlame(20); }
  else if (it.id === 'perk') { pendingLevels++; }
  else if (it.id === 'rune') { pickRune(it.runeId); }
  else if (it.id === 'weapon') { const old = player.pickUp(it.weapon); recordCodex(it.weapon); if (old) loot.drop(old, player.pos.x, player.pos.z + 1.5); }
  else if (it.id === 'relic') grantRelic();
  else if (it.id === 'maxhp') { player.bonusMaxHp = (player.bonusMaxHp || 0) + 15; player.recalc(); player.hp = Math.min(player.maxHp, player.hp + 15); }
  else if (it.id === 'affix') { const w = player.weapon; w.affixes = (w.affixes || []).concat(rollAffixes(1, w.affixes || [])); player.equip(player.slot); }
  renderShop();
  renderSlots();
}

function autoSaveRun() {
  if (!started || run.mode !== 'normal' || run.coop || !player || player.dead || wave <= 0) return;
  saveRunState({
    floor, wave, kills, gold, scrap, runSouls,
    exitOpen, choosingReward, nextReward, challengeWave, anchorWave, boostedNext, cooledNext,
    trialDuoBoost, extraDmgCurse, bossBane, victoryShown,
    pedestals: choosingReward ? rewards.pedestals.map((p) => p.kind) : null,
    hadAnvil: !!loot?.anvil && !loot.anvil.used,
    anvilUses: loot?.anvilUses ?? 0,
    run: { ...run },
    floorMap,
    flame: { ...flameState, curses: [...(flameState.curses || [])] },
    runDmg: { ...runDmg },
    runeBag: [...runeBag],
    bossCores: [...bossCores],
    player: {
      hp: Math.ceil(player.hp),
      bonusMaxHp: player.bonusMaxHp || 0,
      level: player.level,
      xp: player.xp,
      rage: player.rage || 0,
      patron: player.patron || null,
      weapons: JSON.parse(JSON.stringify(player.weapons || [])),
      slot: player.slot || 0,
      relics: [...(player.relics || [])],
      perkLv: { ...(player.perkLv || {}) },
      base: { ...player.base },
    },
  });
}

function syncContinueBtn() {
  const btn = $('btn-continue');
  const playBtn = $('btn-play');
  const playLbl = $('btn-play-label');
  const s = loadRunState();
  if (!btn) return;
  if (s) {
    btn.classList.remove('hidden');
    const info = $('continue-info');
    if (info) info.textContent = describeSavedRun(s);
    playBtn?.classList.remove('primary');
    if (playLbl) playLbl.textContent = 'Lượt mới';
  } else {
    btn.classList.add('hidden');
    playBtn?.classList.add('primary');
    if (playLbl) playLbl.textContent = 'Bắt đầu';
  }
}

function leaveShop() {
  show('shop', false);
  rewards.removeMerchant();
  inShop = false;
  intermission = 2;
  setMode('playing');
  autoSaveRun();
  if (pendingLevels > 0) openLevelUp();
}

// ================= Chơi lại / menu =================
let patronTimer = null, questTimer = null;
function restart() {
  clearTimeout(patronTimer); clearTimeout(questTimer);
  patronTimer = questTimer = null;
  setupP2();
  floorMap = genFloorMap(Math.random);
  const isSpecialMode = run.mode === 'sandbox' || run.mode === 'defense';
  if (started && !isSpecialMode) patronTimer = setTimeout(openPatron, 2200);
  extraDmgCurse = 0; bossBane = 0; hitThisWave = false;
  if (started && !isSpecialMode) questTimer = setTimeout(newQuest, 50); else { quest = null; renderQuest(); }
  for (const e of enemies) if (!e.dead) e.die();
  enemies = [];
  ctx.enemies = enemies;
  clearFx();
  clearProjectiles();
  clearAbilities();
  clearRunes();
  companions?.clear();
  sandbox?.clear();
  defense?.clear();
  objectives?.clear();
  resetTactics();
  resetFlameState();
  runDmg = { basic: 0, special: 0, react: 0, rune: 0, ult: 0, pet: 0 };
  victoryShown = false;
  run.victory = false;
  run.endless = false;
  runeBag = [];
  bossCores = [];
  trialState = null;
  anchorWave = null;
  boostedNext = false;
  cooledNext = false;
  trialDuoBoost = false;
  reinforceLeft = 0;
  run.bossDeck = null;
  echoMgr?.clear();
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
  gold = (vil('inn')) * 30;
  scrap = run.mode === 'defense' ? 30 + vil('smith') * 6 : run.mode === 'sandbox' ? 999 : vil('smith') * 6;
  dropsThisWave = 0;
  const se = document.getElementById('scrap'); if (se) se.textContent = scrap;
  const ge = document.getElementById('gold'); if (ge) ge.textContent = gold;
  if (vil('gem')) {
    const w0 = player.weapons[0];
    if (vil('gem') >= 2 && w0.rarity < 1) w0.rarity = 1;
    w0.gems = [['ruby', 'sapphire', 'emerald', 'topaz'][Math.floor(Math.random() * 4)]];
    player.equip(0); renderSlots();
  }
  pendingLevels = 0;
  exitOpen = false;
  removeExit();
  floor = 1;
  buildWorld(scene, 1);
  minimapDirty = true;
  if (run.mode !== 'sandbox') buildHazards(scene, 1, rngFor(4));
  else clearHazards(scene);
  try { renderer.compile(scene, camera); } catch {}
  if (!isSpecialMode) { maybeSecret(); maybeSpawnEchoGrave(); }
  // Khởi tạo Bạn Đồng Hành (Pet)
  if (started && run.pet && run.pet !== 'none') companions?.setPet(run.pet, player.pos);
  // Khởi tạo Chế Độ Phòng Tập hoặc Thủ Thành
  show('sandbox-bar', started && run.mode === 'sandbox');
  show('defense-hud', started && run.mode === 'defense');
  if (started && run.mode === 'sandbox') {
    sandbox.start(player, loot, enemies);
    ctx.enemies = enemies;
    player.pos.set(0, 0, 3);
    showBanner('Phòng Tập Lò Rèn', 'Thử nghiệm vũ khí, nguyên tố, Đe Rèn miễn phí & đo DPS thời gian thực!', 2.8, '#ffe080');
  } else if (started && run.mode === 'defense') {
    defense.start();
    player.pos.set(0, 0, 5);
    showBanner('Thủ Thành Lò Lửa (10 Đợt)', 'Bảo vệ Lò Trung Tâm! Đến 4 Bệ Trụ (E) xây Trụ Lửa/Băng/Sét bằng Mảnh Thép', 3.0, '#ffaa40');
  }
  choosing = false;
  choosingReward = false;
  nextReward = null;
  challengeWave = false;
  inShop = false;
  event = null;
  ctx.enemySpeed = hasCurse('fast') ? 1.2 : 1;
  setDark(false);
  setFlameLevel(flameState.flame);
  renderEvent();
  renderNextReward();
  renderFlameHud();
  for (const id of ['levelup', 'boss-bar', 'gameover', 'victory', 'pause', 'howto', 'shop', 'anvil-modal', 'bestiary', 'save-modal']) show(id, false);
  wave = 0;
  kills = 0;
  intermission = run.mode === 'sandbox' ? Infinity : run.mode === 'defense' ? 4.5 : 1;
  lastHp = ghostHp = player.hp;
  deathShown = false;
  paused = false;
  setMode(started ? 'playing' : 'menu');
}

function setMode(m) {
  resetTouch();
  document.body.classList.toggle('menu', m === 'menu');
  document.body.classList.toggle('playing', m === 'playing');
}

function setPaused(p) {
  if (!started || player.dead || inShopOpen()) return;
  paused = p;
  if (p) {
    applyFxQuality();
    syncExtraSettingsUI();
    syncSoundUI();
    const pb = $('pause-build');
    if (pb) pb.innerHTML = renderPauseBuildHtml(player, { PERKS, EVOLUTIONS, BOONS, DUOS, GODS, RELICS, activeRelicSets, RUNES, describeCircuit, runStats: { kills, best, souls: meta.souls } });
  }
  show('pause', p);
  play(p ? 'uiOpen' : 'uiClose');
  if (!p) show('howto', false);
  setMode(p ? 'menu' : 'playing');
}
const inShopOpen = () => !$('shop').classList.contains('hidden') || !$('eventroom').classList.contains('hidden') || !$('floormap').classList.contains('hidden') || !$('victory').classList.contains('hidden') || !$('bestiary').classList.contains('hidden') || !$('save-modal').classList.contains('hidden') || isAnvilOpen();

// ================= Xuống tầng =================
function descend() {
  fading = 1.2;
  play('anvil');
  setTimeout(() => {
    floor++;
    bossBane = 0;
    trialState = null;
    anchorWave = null;
    boostedNext = false;
    cooledNext = false;
    clearRunes();
    echoMgr?.clear();
    meta.stats.maxFloor = Math.max(meta.stats.maxFloor || 0, floor);
    if (floor === 5 && !run.daily && (run.depth || 0) >= (meta.depthMax || 0) && (meta.depthMax || 0) < 10) {
      meta.depthMax = (run.depth || 0) + 1;
      setTimeout(() => toast('x_skull-signet', `Mở khóa Bậc Hầm Sâu ${meta.depthMax}`, 'Chọn ở màn chuẩn bị trước khi vào hầm'), 1500);
    }
    saveMeta(meta);
    exitOpen = false;
    removeExit();
    loot.clear();
    rewards.clear();
    objectives?.clear();
    resetTactics();
    for (const e of enemies) if (!e.dead) e.die();
    enemies = [];
    ctx.enemies = enemies;
    clearProjectiles();
    const theme = buildWorld(scene, floor);
    minimapDirty = true;
    buildHazards(scene, floor, rngFor(4));
    try { renderer.compile(scene, camera); } catch {}
    maybeSecret();
    maybeSpawnEchoGrave();
    addFlame(30);
    player.pos.set(0, 0, ROOM_HALF - 4);
    player.heal(Math.round(player.maxHp * 0.3));
    for (const w of player.weapons) { w.dur = 100; w.warnedBroken = false; }
    renderSlots();
    if (run.pet && run.pet !== 'none') companions?.setPet(run.pet, player.pos);
    // Nội tại Thợ Rèn: tự động cường hóa +1 vũ khí đang cầm khi qua tầng
    if (player.stats.smithAutoPlus && player.weapon && !player.weapon.corrupted && (player.weapon.plus || 0) < MAX_PLUS) {
      player.weapon.plus = (player.weapon.plus || 0) + 1;
      player.recalc(); renderSlots();
      toast('anvil', 'Bàn Tay Thợ Rèn', `${weaponName(player.weapon)} tự động cường hóa lên +${player.weapon.plus}!`);
    }
    // Di vật Cổ Ngữ Đá (runestone): tặng 1 Cổ Ngữ miễn phí mỗi khi xuống tầng
    if (player.hasRelic('runestone')) {
      setTimeout(() => pickRune(randomRune()), 700);
    }
    camera.position.copy(player.pos).add(CAM_OFFSET);
    camLook.set(player.pos.x, 0, player.pos.z);
    menuTransitionT = 0;
    intermission = 2.5;
    showBanner(`Tầng ${floor}`, theme.name, 2.8, '#ffe2a0');
    newQuest();
    floorMap = genFloorMap(run.daily ? rngFor(7) : Math.random);
    setTimeout(openPatron, 1600);
    play('waveStart');
    checkAchievements();
    autoSaveRun();
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
      if (e.dead || used >= 24) continue;
      tmpV.set(e.pos.x, 1, e.pos.z).project(camera);
      if (Math.abs(tmpV.x) < 0.95 && Math.abs(tmpV.y) < 0.92 && tmpV.z < 1) continue;
      let x = tmpV.x, y = tmpV.y;
      if (tmpV.z > 1) { x = -x; y = -y; }
      const ang = Math.atan2(y, x);
      const k = Math.min(0.9 / Math.abs(Math.cos(ang) || 1e-6), 0.82 / Math.abs(Math.sin(ang) || 1e-6));
      const sx = (Math.cos(ang) * k * 0.5 + 0.5) * innerWidth, sy = (-Math.sin(ang) * k * 0.5 + 0.5) * innerHeight;
      let el = arrowPool[used];
      if (!el) { el = document.createElement('div'); layer.appendChild(el); arrowPool.push(el); }
      const rangedDanger = !e.ward && (e.casting > 0 || !!e.tele || e.state === 'aim' || e.state === 'cast' || e.state === 'shoot');
      el.className = 'arrow' + (e.ward ? ' ward' : e.isBoss ? ' boss' : e.elite ? ' elite' : '') + (rangedDanger ? ' danger' : '');
      el.style.display = '';
      el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%, -50%) rotate(${-ang}rad)`;
      used++;
    }
  }
  for (let i = used; i < arrowPool.length; i++) arrowPool[i].style.display = 'none';
}

// ================= Radar Đấu Trường (Minimap góc phải cho bản đồ 18x18) =================
let minimapCtx = null;
let minimapBg = null;
let minimapDirty = true;
let _minimapT = 0;
function rebuildMinimapBg(W, H, pad, span, sc) {
  if (!minimapBg) {
    minimapBg = document.createElement('canvas');
    minimapBg.width = W;
    minimapBg.height = H;
  }
  const g = minimapBg.getContext('2d');
  if (!g) return;
  const toX = (wx) => pad + ((wx + ROOM_HALF) / (ROOM_HALF * 2)) * span;
  const toY = (wz) => pad + ((wz + ROOM_HALF) / (ROOM_HALF * 2)) * span;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#1b130e';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(226, 184, 108, 0.32)';
  g.lineWidth = 1;
  g.strokeRect(pad, pad, span, span);
  g.fillStyle = '#070506';
  for (const b of pits) g.fillRect(toX(b.x - b.hx), toY(b.z - b.hz), b.hx * 2 * sc, b.hz * 2 * sc);
  g.fillStyle = '#6c5a4a';
  for (const b of boxes) {
    if (b.pit) continue;
    g.fillRect(toX(b.x - b.hx), toY(b.z - b.hz), Math.max(2, b.hx * 2 * sc), Math.max(2, b.hz * 2 * sc));
  }
  for (const p of pillars) {
    g.fillStyle = p.destructible ? '#8f7b66' : '#584b3e';
    g.beginPath(); g.arc(toX(p.x), toY(p.z), Math.max(1.8, p.r * sc), 0, Math.PI * 2); g.fill();
  }
  minimapDirty = false;
}
function drawMinimap() {
  const wrap = $('minimap-wrap');
  const cv = $('minimap');
  if (!wrap || !cv) return;
  const visible = started && !player.dead;
  wrap.classList.toggle('hidden', !visible);
  if (!visible) return;
  const nowMs = performance.now();
  if (!minimapDirty && minimapBg && nowMs - _minimapT < 50) return;
  _minimapT = nowMs;
  if (!minimapCtx) minimapCtx = cv.getContext('2d');
  const g = minimapCtx;
  const W = cv.width, H = cv.height;
  const pad = 6, span = W - pad * 2;
  const toX = (wx) => pad + ((wx + ROOM_HALF) / (ROOM_HALF * 2)) * span;
  const toY = (wz) => pad + ((wz + ROOM_HALF) / (ROOM_HALF * 2)) * span;
  const sc = span / (ROOM_HALF * 2);

  if (minimapDirty || !minimapBg) rebuildMinimapBg(W, H, pad, span, sc);
  g.drawImage(minimapBg, 0, 0);
  // Nắp hầm xuống tầng
  const ex = exitOpen && exitPos();
  if (ex) {
    g.fillStyle = '#7fd8ff';
    g.beginPath(); g.arc(toX(ex.x), toY(ex.z), 4.5, 0, Math.PI * 2); g.fill();
  }
  // Đe Rèn
  if (loot?.anvil) {
    g.fillStyle = '#ffaa30';
    g.fillRect(toX(loot.anvil.pos.x) - 3, toY(loot.anvil.pos.z) - 3, 6, 6);
  }
  // Bệ phần thưởng & Rương di vật
  if (rewards?.pedestals?.length) {
    g.fillStyle = '#ffe060';
    for (const p of rewards.pedestals) {
      g.beginPath(); g.arc(toX(p.pos.x), toY(p.pos.z), 3, 0, Math.PI * 2); g.fill();
    }
  }
  if (rewards?.chests?.length) {
    g.fillStyle = '#ffd040';
    for (const c of rewards.chests) {
      if (c.opened) continue;
      g.fillRect(toX(c.pos.x) - 2.5, toY(c.pos.z) - 2.5, 5, 5);
    }
  }
  // Lò Lửa Trung Tâm & 4 Bệ Trụ (Chế độ Thủ Thành)
  if (defense?.active) {
    const cx = toX(defense.corePos.x), cy = toY(defense.corePos.z);
    g.fillStyle = '#ff9a24';
    g.beginPath(); g.arc(cx, cy, 5.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff0a0'; g.lineWidth = 1.5; g.stroke();
    for (const p of defense.pedestals) {
      const tx = toX(p.pos.x), ty = toY(p.pos.z);
      g.fillStyle = p.level > 0 ? (TURRET_TYPES[p.kind]?.css || '#ffe060') : 'rgba(226,184,108,0.45)';
      g.fillRect(tx - 3, ty - 3, 6, 6);
    }
  }
  // Mộ Bóng Ma Thợ Rèn
  if (echoMgr?.grave) {
    g.fillStyle = '#70e8ff';
    g.beginPath(); g.arc(toX(echoMgr.grave.pos.x), toY(echoMgr.grave.pos.z), 3.5, 0, Math.PI * 2); g.fill();
  }
  // Quái (đỏ = thường, cam = tinh anh / Thủ lĩnh, vàng lớn = Boss, tím = Pha Lê Hộ Thể)
  for (const e of enemies) {
    if (e.dead) continue;
    const x = toX(e.pos.x), y = toY(e.pos.z);
    if (e.ward) {
      g.fillStyle = '#d080ff';
      g.fillRect(x - 3.5, y - 3.5, 7, 7);
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.strokeRect(x - 3.5, y - 3.5, 7, 7);
    } else if (e.isBoss) {
      g.fillStyle = '#ffcf4a';
      g.beginPath(); g.arc(x, y, 4.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ff3a2a'; g.lineWidth = 1.4; g.stroke();
    } else if (e.miniBoss || e.elite) {
      g.fillStyle = '#ff9830';
      g.beginPath(); g.arc(x, y, 2.8, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#ff4a3a';
      g.beginPath(); g.arc(x, y, 2.0, 0, Math.PI * 2); g.fill();
    }
  }
  // Người chơi (mũi tên trắng xanh theo hướng ngắm)
  const px = toX(player.pos.x), py = toY(player.pos.z);
  g.save();
  g.translate(px, py);
  g.rotate(-player.facing + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -5); g.lineTo(3.5, 4); g.lineTo(0, 2); g.lineTo(-3.5, 4);
  g.closePath();
  g.fill();
  g.restore();
}

// ================= Khi hạ quái =================
function onKill(e, opts = {}) {
  if (e.noReward) return;
  const st = player.stats;
  recordBestiary(e, true);
  meta.stats.kills = (meta.stats.kills || 0) + 1;
  if (e instanceof Slime || e instanceof KingSlime) meta.stats.slimes = (meta.stats.slimes || 0) + 1;
  if (e.elite) meta.stats.elites = (meta.stats.elites || 0) + 1;
  if (e.isTrueBoss) { meta.stats.trueBossKills = (meta.stats.trueBossKills || 0) + 1; run.victory = true; }
  // Độc Thần (contagion): quái chết lan 2 tầng Độc sang quái xung quanh
  if (st.contagion && e.poisonStacks > 0) {
    for (const o of enemies) {
      if (o === e || !o.alive || o.pos.distanceTo(e.pos) > 4.6) continue;
      o.poisonStacks = Math.min(8, (o.poisonStacks || 0) + 2);
      o.poisonT = 4.5;
      combat.dealDamage(o, Math.round(10 * st.dmg), { element: 'poison', element2: null }, null, 0, false, false);
    }
  }
  // Chiêu Hồn Sư (necroRaise): 30% tỉ lệ gọi Lính Xương Đồng Minh khi hạ quái
  if (st.necroRaise && !e.isBoss && Math.random() < 0.30) {
    companions?.spawnAllySkeleton(e.pos, player.dmgMul());
  }
  gainXp(e.xp || 1);
  if (st.killHeal) player.heal(st.killHeal);
  const dropMult = event?.id === 'bloodmoon' ? 2 : 1;
  // Hồn Thép & vàng
  if (e.isBoss) {
    const multA = e.empoweredAnchors ? 2 : 1;
    for (let i = 0; i < 8 * multA; i++) loot.spawnPickup('soul', e.pos.x, e.pos.z, 5);
    for (let i = 0; i < 6 * multA; i++) loot.spawnPickup('gold', e.pos.x, e.pos.z, 6);
  } else {
    loot.spawnPickup('soul', e.pos.x, e.pos.z, Math.ceil((e.xp || 1) / 2) + (player.hasRelic('skull') ? 1 : 0));
    if (Math.random() < 0.55 * dropMult) loot.spawnPickup('gold', e.pos.x, e.pos.z, (e.elite ? 5 : 1) + Math.floor(Math.random() * 2));
    if (run.mode === 'defense' && Math.random() < 0.42) loot.spawnPickup('scrap', e.pos.x, e.pos.z, e.elite ? 4 : 2);
  }
  // Ánh Lửa hồi nhẹ khi hạ quái; Boss hạ -> Thanh Tẩy 1 lời nguyền & hồi +50 Lửa
  addFlame(e.isBoss ? 50 : e.elite ? 6 : 2.5);
  if (e.isBoss) {
    const beforeC = flameState.curses.length;
    purgeCurse(player.pos, scene);
    if (flameState.curses.length < beforeC) meta.stats.purges = (meta.stats.purges || 0) + 1;
    if (e.empoweredAnchors) rewards.spawnChest(e.pos.x - 2, e.pos.z);
  }
  // Lời nguyền Hồn Nổ (volatile_soul): quái chết nổ bóng tối
  if (opts.allowVolatile !== false && hasDynCurse('volatile_soul') && !e.isBoss) {
    explosion(e.pos, 2.5, 0x9a40ff, { smoke: false, scorch: false, core: 0xe0b0ff });
    combat.aoe(e.pos, 2.5, Math.round(18 * player.stats.dmg), { element: 'none', element2: null }, 8, { player: 10, surface: false });
  }
  // Mạch Cổ Ngữ (Ấn Kết Liễu) & Thức Tỉnh Vũ Khí
  fireRunes(player, 'kill', e.pos, player.aimDir(), Math.round(24 * player.dmgMul()));
  progressAwakening(player, 'kill');
  // Bóng Ma Thợ Rèn bị hạ -> rơi Quả Cầu Hồn Khí để chọn Di Sản!
  if (e.isEcho && e.echo) {
    removeEcho(meta, e.echo.id);
    saveMeta(meta);
    echoMgr?.spawnSoulOrb(e.echo, e.pos);
    showBanner('Hạ Bóng Ma Thợ Rèn!', 'Lại gần Quả Cầu Hồn Khí (E) để đoạt di sản', 2.6, '#9fe8ff');
  }
  // Bình máu
  const potionChance = hasCurse('nopot') || deep(7) ? (e.isBoss && !deep(7) ? 1 : 0) : e.isBoss ? 1 : 0.03 * (1 + st.luck) * dropMult;
  if (Math.random() < potionChance) loot.spawnPickup('potion', e.pos.x, e.pos.z);
  // Vũ khí rơi
  if (e.isBoss) {
    const otherBossAlive = enemies.some((o) => o !== e && o.isBoss && !o.dead);
    if (otherBossAlive) {
      showBanner('Hấp Thụ Song Sinh!', `${e.sibling?.name || 'Kẻ còn lại'} hấp thụ linh hồn đồng đội và cuồng nộ!`, 2.6, '#ff9a3a');
      player.slowmoT = 0.7;
    } else {
      const w = randomWeapon(wave); w.rarity = Math.max(2, w.rarity); w.affixes = rollAffixes(w.rarity);
      loot.drop(w, e.pos.x, e.pos.z);
      rewards.spawnChest(e.pos.x + 2, e.pos.z);
      meta.stats.bossKills = (meta.stats.bossKills || 0) + 1;
      if (e.twinGroup === 'twins') meta.stats.twinsKilled = (meta.stats.twinsKilled || 0) + 1;
      runInfo().bossKilled = true;
      run.bossKilled = true;
      showBanner('Đã hạ Boss!', 'Rơi vũ khí Sử thi và rương di vật', 2.5, '#ffcf4a');
      player.slowmoT = 1.6;
      slowmoReal = 1.6;
    }
  } else if (Math.random() < e.dropChance * 0.35 * (1 + st.luck) * dropMult) {
    const w = randomWeapon(wave);
    if (w.rarity < 2 && Math.random() < st.luck * 0.3) { w.rarity++; w.affixes = rollAffixes(w.rarity); }
    const best = Math.max(...player.weapons.map(weaponScore));
    // Đồ kém hơn hẳn đồ đang cầm, hoặc đã rơi đủ trong đợt / sàn quá nhiều đồ: thành Mảnh Thép
    if (weaponScore(w) < best * 0.8 || dropsThisWave >= 2 + Math.floor(st.luck * 2) || loot.drops.length >= 4) loot.spawnPickup('scrap', e.pos.x, e.pos.z, scrapValue(w));
    else { loot.drop(w, e.pos.x, e.pos.z); dropsThisWave++; }
  } else if (Math.random() < 0.12 * dropMult) loot.spawnPickup('scrap', e.pos.x, e.pos.z, e.elite ? 3 : 1);
  if (e.elite) questProgress('elites');
  if (e.lastDashHit && performance.now() - e.lastDashHit < 400) questProgress('dashkill');
  if (e.nemesis) { run.nemesisLv = 0; addGold(80); addSouls(30); rewards.spawnChest(e.pos.x - 1.5, e.pos.z); showBanner('Đã hạ Kẻ Săn Đầu!', '+80 vàng · +30 Hồn Thép · rương di vật', 2.6, '#ff5a8a'); }
  if (e.miniBoss && !e.nemesis) { rewards.spawnChest(e.pos.x, e.pos.z); for (let i = 0; i < 5; i++) loot.spawnPickup('gold', e.pos.x, e.pos.z, 5); showBanner('Đã hạ Thủ Lĩnh!', 'Rơi rương di vật', 2, '#ff8a4a'); }
  if (e.elite) {
    if (player.hasRelic('skull')) player.heal(15);
    if (st.hoard && Math.random() < 0.35) rewards.spawnChest(e.pos.x, e.pos.z);
  }
  if (st.fireBurst && e.burnT > 0) combat.fireBurst(e.pos, Math.round(12 * st.dmg));
  if (st.killboom && !e.isBoss) combat.fireBurst(e.pos, Math.round(10 * st.dmg));
  if (st.killinvis) player.iframes = Math.max(player.iframes, 0.6);
  if (player.weapon.legend === 'bloodfire') player.heal(3);
  if (player.weapon.type === 'scythe') player.scytheSouls = Math.min(5, (player.scytheSouls || 0) + 2);
  if (!e.isDummy) {
    killStreak = killStreakT > 0 ? killStreak + 1 : 1;
    killStreakT = 2.2;
  }
  // Ngọc & Cổ Ngữ Lập Trình: tinh anh, Thủ Lĩnh và Boss rơi
  const runeChance = (e.elite ? 0.32 : 0) * (hasDynCurse('cursed_greed') ? 2 : 1);
  if (Math.random() < runeChance || e.miniBoss || e.isBoss) {
    const rid = randomRune();
    loot.spawnPickup('rune', e.pos.x, e.pos.z, RUNES[rid]);
  }
  if ((e.elite && Math.random() < 0.25) || e.miniBoss || e.isBoss) {
    const kinds = ['ruby', 'sapphire', 'emerald', 'topaz'];
    loot.spawnPickup('gem', e.pos.x + 0.5, e.pos.z, kinds[Math.floor(Math.random() * kinds.length)]);
  }
  // Độ thuần thục vũ khí (lưu vĩnh viễn)
  const wt = player.weapon.type;
  meta.mastery = meta.mastery || {};
  const before = masteryLv(meta.mastery[wt] || 0);
  meta.mastery[wt] = (meta.mastery[wt] || 0) + 1;
  const after = masteryLv(meta.mastery[wt]);
  if (after > before) { player.recalc(); toast({ daggers: 'x_daggers', crossbow: 'x_crossbow', spear: 'x_sword-stone', scythe: 'x_swords-emblem', hammer: 'anvil', gauntlets: 'x_gauntlet', whip: 'x_whip', chakram: 'x_chakram' }[wt] || wt, `Thuần thục ${TYPES[wt].name}: cấp ${after}`, `+${after * 4}% sát thương khi dùng ${TYPES[wt].name.toLowerCase()}`); }
}

const runInfo = () => ({
  relics: player.relics.length,
  sets: activeRelicSets(player.relics).length,
  godBoons: Object.keys(player.perkLv).filter((id) => BOONS.some((b) => b.id === id)).length,
  curses: run.curses.length,
  bossKilled: !!run.bossKilled,
  daily: run.daily,
  endless: !!run.endless,
  victory: !!run.victory,
  wave,
});

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
  if (luTitle) $('lu-title').innerHTML = luTitle;
  const nCards = meta.up.cards ? 4 : 3;
  const gc = player.patron ? godCards(player.perkLv, player.patron, trialDuoBoost) : [];
  if (trialDuoBoost && gc.some((c) => c.duo)) trialDuoBoost = false;
  perkChoices = [...gc, ...rollPerks(player.perkLv, nCards - gc.length)];
  if (!perkChoices.length) { pendingLevels = 0; return; }
  choosing = true;
  $('lu-level').textContent = player.level - pendingLevels + 1;
  $('lu-cards').innerHTML = perkChoices.map((p, i) => {
    const lv = player.perkLv[p.id] || 0;
    const godOf = p.god ? GODS.find((g) => g.id === p.god) : null;
    return `<button class="card${p.evo ? ' evo' : ''}${p.god || p.godPick ? ' god' : ''}${p.duo ? ' duo' : ''}" data-i="${i}">
      <span class="keycap">${i + 1}</span>
      <i class="ico card-ico" style="--i:url('/ui/icons/${p.icon}.svg')"></i>
      <h3>${p.name}</h3>
      <div class="lv">${p.godPick ? '<span class="godtag" style="color:' + p.color + '">Thần Hộ Mệnh</span>' : p.duo ? '<span class="godtag" style="color:#ff9ad8">Song Thần</span>' : godOf ? `<span class="godtag" style="color:${godOf.color}">${godOf.name}</span>` : p.evo ? 'Tiến hóa' : lv ? `Cấp ${lv} → ${lv + 1}` : 'Mới'}${!p.evo && !p.god && !p.duo && !p.godPick && p.max > 1 ? ` <span class="muted">/ ${p.max}</span>` : ''}</div>
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
  if (player2 && !p.godPick) { p.apply(player2.base, lv, player2); player2.recalc(); }
  player.recalc();
  if (p.evo) toast(p.icon, 'Tiến hóa: ' + p.name, p.desc(1));
  if (p.duo) toast(p.icon, 'Song Thần: ' + p.name, p.desc(1));
  play('uiConfirm');
  if (p.godPick) { $('lu-title').innerHTML = luTitle; } else pendingLevels--;
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
  const html = `<i class="ico ico-soul"></i>${meta.souls}`;
  const el = $('menu-souls');
  if (el) el.innerHTML = html;
  const topEl = $('menu-souls-top');
  if (topEl) topEl.innerHTML = html;
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
  const aspEl = $('aspect-list');
  if (aspEl) {
    meta.aspects = meta.aspects || {};
    meta.aspectsUnlocked = meta.aspectsUnlocked || {};
    const wtIco = { daggers: 'x_daggers', crossbow: 'x_crossbow', spear: 'x_sword-stone', scythe: 'x_swords-emblem', hammer: 'anvil', gauntlets: 'x_gauntlet', whip: 'x_whip', chakram: 'x_chakram' };
    aspEl.innerHTML = Object.entries(WEAPON_ASPECTS).map(([type, list]) => {
      const activeId = meta.aspects[type] || 'default';
      const activeAsp = aspectById(type, activeId);
      return `<div class="aspect-card${activeId !== 'default' ? ' active' : ''}">
        <div class="aspect-top"><i class="ico" style="--i:url('/ui/icons/${wtIco[type] || type}.svg')"></i><b>${TYPES[type].name}</b></div>
        <p>${activeAsp?.desc || ''}</p>
        <div class="aspect-btns">${list.map((a) => {
          const open = a.id === 'default' || !!meta.aspectsUnlocked[a.id];
          const on = activeId === a.id;
          return open
            ? `<button class="btn aspect-btn${on ? ' on' : ''}" data-type="${type}" data-aspect="${a.id}" title="${a.desc}">${a.name}${on ? ' ✓' : ''}</button>`
            : `<button class="btn aspect-btn" data-type="${type}" data-aspect="${a.id}" data-cost="${a.cost}" title="${a.desc}" ${meta.souls < a.cost ? 'disabled' : ''}>${a.name} · <i class="ico ico-soul"></i>${a.cost}</button>`;
        }).join('')}</div>
      </div>`;
    }).join('');
    for (const b of aspEl.querySelectorAll('.aspect-btn')) {
      b.onclick = () => {
        const type = b.dataset.type, id = b.dataset.aspect, cost = Number(b.dataset.cost || 0);
        const open = id === 'default' || !!meta.aspectsUnlocked[id];
        if (!open) {
          if (meta.souls < cost) { play('uiBack'); return; }
          meta.souls -= cost;
          meta.aspectsUnlocked[id] = true;
          play('hammer');
        } else {
          play('uiClick');
        }
        meta.aspects[type] = id;
        saveMeta(meta);
        if (player?.weapon?.type === type) player.equip(player.slot);
        if (!started) syncMenuStage();
        renderForge();
        updateMenuSouls();
      };
    }
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
      <p>${open ? c.passive : `Mở khóa: ${req?.desc || 'Hoàn thành thành tựu'}`}</p></button>`;
  }).join('');
  for (const b of $('char-list').querySelectorAll('.char-card')) b.onclick = () => { run.char = b.dataset.id; meta.char = run.char; saveMeta(meta); if (!started) syncMenuStage(); play('uiClick'); renderPrep(); };
  const petEl = $('pet-list');
  if (petEl) {
    run.pet = run.pet || meta.pet || 'none';
    petEl.innerHTML = PETS.map((p) => `<button class="pet-card${run.pet === p.id ? ' sel' : ''}" data-pet="${p.id}">
      <i class="ico" style="--i:url('/ui/icons/${p.icon}.svg')"></i>
      <h4>${p.name}</h4>
      <p>${p.desc}</p></button>`).join('');
    for (const b of petEl.querySelectorAll('.pet-card')) b.onclick = () => { run.pet = b.dataset.pet; meta.pet = run.pet; saveMeta(meta); play('uiClick'); renderPrep(); };
  }
  $('curse-list').innerHTML = CURSES.map((c) => `<button class="curse${run.curses.includes(c.id) ? ' on' : ''}" data-id="${c.id}">
    <i class="ico" style="--i:url('/ui/icons/${c.icon}.svg')"></i><div><h4>${c.name} <span class="bonus">+${Math.round(c.bonus * 100)}%</span></h4><p>${c.desc}</p></div></button>`).join('');
  for (const b of $('curse-list').querySelectorAll('.curse')) b.onclick = () => {
    const id = b.dataset.id;
    run.curses = run.curses.includes(id) ? run.curses.filter((x) => x !== id) : [...run.curses, id];
    meta.curses = run.curses; saveMeta(meta);
    play('uiClick'); renderPrep();
  };
  const maxD = meta.depthMax || 0;
  run.depth = Math.min(run.depth ?? meta.depth ?? 0, maxD);
  $('depth-val').textContent = run.depth;
  $('depth-max').textContent = maxD ? `(đã mở tới bậc ${maxD})` : '(hạ boss tầng 4 để mở bậc 1)';
  $('depth-minus').disabled = run.depth <= 0;
  $('depth-plus').disabled = run.depth >= maxD;
  $('depth-rules').innerHTML = run.depth ? DEPTHS.filter((d) => d.n <= run.depth).map((d) => `<li><b>${d.n}</b> ${d.text}</li>`).join('') : '<li class="muted">Không có luật thêm</li>';
  $('depth-minus').onclick = () => { run.depth = Math.max(0, run.depth - 1); meta.depth = run.depth; saveMeta(meta); play('uiClick'); renderPrep(); };
  $('depth-plus').onclick = () => { run.depth = Math.min(maxD, run.depth + 1); meta.depth = run.depth; saveMeta(meta); play('uiClick'); renderPrep(); };
  const bonus = run.curses.reduce((s, id) => s + CURSES.find((c) => c.id === id).bonus, 0) + run.depth * 0.15;
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
  const els = ['fire', 'ice', 'lightning', 'blood', 'poison', 'wind', 'holy'];
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
const touchActions = Object.fromEntries([...document.querySelectorAll("[data-action]")].map(button => [button.dataset.action, button]));
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
  let interactLabel = '';
  // Kết liễu: quái đang choáng hoặc còn dưới 15% máu (24% với Di vật Lưỡi Hái Đao Phủ), đứng gần
  const finPct = player.stats.executioner ? 0.24 : 0.15;
  const fin = enemies.find((e) => e.alive && !e.spawning && !e.isBoss && !e.isDummy && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 2.6
    && (e.stunT > 0 || e.hp < (e.maxHpEff || e.hp) * finPct));
  const bossFin = enemies.find((e) => e.isBoss && e.alive && e.stunT > 0 && e.finishedStun !== e.stunId && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 3.5);
  const defPed = defense?.active ? defense.nearestPedestal(player.pos) : null;
  let canEnhance = false;
  // Phân rã vũ khí gần nhất (X) – luôn dùng được, kể cả khi đứng cạnh đe
  if (drop && pressed.has('KeyX')) {
    addScrap(scrapValue(drop.weapon));
    fxFlash(drop.pos.clone().setY(1.2), 0xc9d4e0, 1.8, 0.15, false);
    play('hammer', { rate: 1.6, vol: 0.6 });
    loot.remove(drop);
    drop = null;
  }
  if (bossFin) {
    interactLabel = 'Trọng Kích';
    text = `<span class="keycap">E</span> <b style="color:#ffcf4a">Trọng Kích</b> ${bossFin.name} đang choáng`;
    if (E) {
      bossFin.finishedStun = bossFin.stunId;
      const d = Math.round((bossFin.maxHp || bossFin.maxHpEff) * 0.07);
      bossFin.takeHit(d, new THREE.Vector3(0, 0, 1), 0, true, 'big');
      damageNumber(bossFin.pos, 'Trọng Kích!', 'react ult');
      haptic(30);
      fxFlash(bossFin.pos.clone().setY(2), 0xffcf4a, 5, 0.25); addShake(0.7); play('hitHeavy'); player.slowmoT = 0.4;
    }
  } else if (fin) {
    interactLabel = 'Kết liễu';
    text = `<span class="keycap">E</span> <b style="color:#ff8a6a">Kết liễu</b> · hồi máu`;
    if (E) {
      const dx = fin.pos.x - player.pos.x, dz = fin.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      player.pos.x = fin.pos.x - (dx / d) * 1.1; player.pos.z = fin.pos.z - (dz / d) * 1.1;
      player.facing = Math.atan2(dx, dz);
      player.playOnce?.('2H_Melee_Attack_Chop', 0.35);
      fin.takeHit(fin.hp + 9999, new THREE.Vector3(dx / d, 0, dz / d), 10, true);
      damageNumber(fin.pos, 'Kết Liễu!', 'react ult');
      haptic(26);
      const finHealMul = player.weapon?.corrupted === 'c_finisher' ? 2 : 1;
      if (!player.hasRelic('fury')) player.heal(Math.round(player.maxHp * (0.06 + (player.stats.bloodSet2 ? 0.08 : 0)) * finHealMul));
      addFlame(18 + (player.stats.chalice ? 25 : 0));
      player.gainRage(12 + (player.stats.bloodSet3 ? 30 : 0));
      // Bộ Di Vật Huyết Đạo (2/3 món): Kết Liễu gây vụ nổ Huyết diện rộng
      if (player.stats.bloodSet2) {
        explosion(fin.pos, 4.2, 0xc81838, { smoke: false, scorch: false, core: 0xff6080 });
        combat.aoe(fin.pos, 4.2, Math.round(35 * player.dmgMul()), { element: 'blood', element2: null }, 10, { surface: false });
      }
      player.iframes = Math.max(player.iframes, 0.35);
      player.slowmoT = Math.max(player.slowmoT, 0.25);
      fxFlash(fin.pos.clone().setY(1.2), 0xff6a4a, 3, 0.18); addShake(0.45); play('hitHeavy', { rate: 1.1 });
      meta.stats.finishers = (meta.stats.finishers || 0) + 1;
      questProgress('finish');
    }
  } else if (defPed) {
    const T = TURRET_TYPES[defPed.kind];
    const cost = defense.upgradeCost(defPed);
    if (defPed.level === 0) {
      interactLabel = 'Xây Trụ';
      text = `<span class="keycap">E</span> Xây <b style="color:${T.css}">${T.name}</b> <span class="${scrap >= cost ? '' : 'muted'}">(${cost} <i class="ico ico-scrap"></i>)</span> <span class="muted small">${T.desc}</span>`;
    } else if (defPed.level < 3) {
      interactLabel = 'Nâng Trụ';
      canEnhance = true;
      text = `<span class="keycap">E</span> Nâng <b style="color:${T.css}">${T.name} Cấp ${defPed.level + 1}</b> <span class="${scrap >= cost ? '' : 'muted'}">(${cost} <i class="ico ico-scrap"></i>)</span> <span class="sep">·</span> <span class="keycap">F</span> Đổi Hệ (5 <i class="ico ico-scrap"></i>)`;
    } else {
      interactLabel = 'Đổi Hệ';
      canEnhance = true;
      text = `<b style="color:${T.css}">${T.name} Cấp 3 (Tối Đa)</b> <span class="sep">·</span> <span class="keycap">F</span> Đổi Hệ Lửa/Băng/Sét (5 <i class="ico ico-scrap"></i>)`;
    }
    if (E && defPed.level < 3) {
      const res = defense.buildOrUpgrade(defPed, () => scrap, addScrap);
      if (res.ok) showBanner(`${res.turret.name} · Cấp ${res.level}!`, res.turret.desc, 1.8, res.turret.css);
      else if (res.reason === 'scrap') { play('uiBack'); showBanner('Thiếu Mảnh Thép', `Cần ${res.cost} Mảnh Thép (hiện có ${scrap})`, 1.5, '#c9c9c9'); }
    } else if (pressed.has('KeyF') && defPed.level > 0) {
      const res = defense.cycleElement(defPed, () => scrap, addScrap);
      if (res.ok) showBanner(`Chuyển thành ${res.turret.name}!`, res.turret.desc, 1.6, res.turret.css);
      else if (res.reason === 'scrap') { play('uiBack'); showBanner('Thiếu Mảnh Thép', 'Cần 5 Mảnh Thép để đổi nguyên tố Trụ', 1.4, '#c9c9c9'); }
    }
  } else if (atExit) {
    interactLabel = 'Xuống tầng';
    text = `<span class="keycap">E</span> Xuống <b>tầng ${floor + 1}</b> · ${floorTheme(floor + 1).name}`;
    if (E && !fading) descend();
  } else if (pedestal) {
    interactLabel = 'Chọn';
    const r = REWARDS[pedestal.kind];
    text = `<span class="keycap">E</span> Chọn <b>${r.name}</b> <span class="muted" style="font-size:13px">${r.desc}</span>`;
    if (E) chooseReward(pedestal.kind);
  } else if (chest) {
    interactLabel = 'Mở rương';
    text = '<span class="keycap">E</span> Mở <b>rương di vật</b>';
    if (E) { rewards.openChest(chest); grantRelic(); }
  } else if (atMerchant) {
    interactLabel = 'Mua bán';
    text = '<span class="keycap">E</span> Mua bán với <b>thương nhân</b>';
    if (E) { renderShop(); show('shop', true); setMode('menu'); play('uiOpen'); }
  } else if (echoMgr?.nearOrb(player.pos)) {
    const orb = echoMgr.nearOrb(player.pos);
    interactLabel = 'Di Sản';
    text = `<span class="keycap">E</span> Nhận <b>Di Sản Hồn Khí</b> <span class="muted" style="font-size:13px">${orb.echo.wName}</span>`;
    if (E) { const ec = echoMgr.consumeOrb(); if (ec) openEchoReward(ec); }
  } else if (echoMgr?.nearGrave(player.pos)) {
    const gr = echoMgr.nearGrave(player.pos);
    interactLabel = 'Đánh thức';
    text = `<span class="keycap">E</span> Đánh thức <b>Bóng Ma Thợ Rèn</b> <span class="muted" style="font-size:13px">giữ ${gr.echo.wName}</span>`;
    if (E) {
      const aw = echoMgr.awakenGrave();
      if (aw) {
        const fe = new FallenEcho(scene, aw.pos.x, aw.pos.z, aw.echo, floor);
        fe.spawnT = 0;
        enemies.push(fe);
        ctx.enemies = enemies;
        showBanner('Bóng Ma Thợ Rèn Thức Giấc!', `Đối đầu bản sao cũ cầm ${aw.echo.wName}`, 2.6, '#70e0ff');
      }
    }
  } else if ((atAnvil || (loot.anvil && Math.hypot(loot.anvil.pos.x - player.pos.x, loot.anvil.pos.z - player.pos.z) < 2)) && repairAtAnvil() && false) {
  } else if (atAnvil || (loot.anvil && Math.hypot(loot.anvil.pos.x - player.pos.x, loot.anvil.pos.z - player.pos.z) < 2 && !loot.anvil.forging)) {
    // Cường hóa nhanh (F) + Mở Xưởng Đe Rèn Tương Tác (E)
    const cw = player.weapon;
    const canPlus = cw && !cw.corrupted && (cw.plus || 0) < MAX_PLUS;
    canEnhance = canPlus;
    const cost = canPlus ? Math.max(1, Math.round(enhanceCost(cw) * (1 - 0.1 * vil('smith')))) : 0;
    const enh = cw?.corrupted
      ? ' <span class="sep">·</span> <span class="muted">Đã Hắc Hóa</span>'
      : canPlus
        ? ` <span class="sep">·</span> <span class="keycap">F</span> Cường hóa <b>+${(cw.plus || 0) + 1}</b> <span class="${scrap >= cost ? '' : 'muted'}">(${cost} <i class="ico ico-scrap"></i>)</span>`
        : ' <span class="sep">·</span> <span class="muted">Đã cường hóa tối đa</span>';
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
    interactLabel = 'Xưởng Đe';
    text = `<span class="keycap">E</span> Mở <b>Xưởng Đe Rèn</b> <span class="muted" style="font-size:13px">3 Khuôn · Tôi Quá Tải · Cổ Ngữ (${runeBag.length})${bossCores.length ? ' · Lõi Boss!' : ''}</span>${enh}`;
    if (E) openAnvilModal();
  } else if (drop) {
    const w = drop.weapon;
    const verb = player.weapons.length < 2 ? 'Nhặt' : 'Đổi lấy';
    interactLabel = verb;
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
  const touchInteract = $('touch-interact');
  if (touchInteract) {
    touchInteract.hidden = !interactLabel;
    const isUrgent = !!(bossFin || fin);
    touchInteract.classList.toggle('urgent', isUrgent);
    const lbl = $('touch-interact-lbl');
    if (lbl && interactLabel && lbl.textContent !== interactLabel) lbl.textContent = interactLabel;
    const ico = $('touch-interact-ico');
    if (ico && interactLabel) {
      const iName = isUrgent ? 'x_skull-signet'
        : interactLabel === 'Xưởng Đe' ? 'anvil'
          : interactLabel === 'Mở rương' ? 'x_locked-chest'
            : interactLabel === 'Mua bán' ? 'x_shop'
              : interactLabel === 'Xuống tầng' ? 'upgrade'
                : 'x_sword-stone';
      ico.style.setProperty('--i', `url('/ui/icons/${iName}.svg')`);
    }
    if (touchActions.KeyX) touchActions.KeyX.hidden = !drop;
    if (touchActions.KeyF) touchActions.KeyF.hidden = !canEnhance;
    if (touchActions.KeyQ) touchActions.KeyQ.hidden = player.weapons.length < 2 && !player.weapon?.altForm;
  }
  if (text !== _lastPromptHtml) {
    _lastPromptHtml = text;
    hud.prompt.innerHTML = text;
    hud.prompt.classList.toggle('show', !!text);
  }
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
  if (pressed.has('KeyH') && started && !player.dead && !choosing && !inShopOpen()) {
    setFxSettings({ compactHud: !fxSettings.compactHud });
    syncExtraSettingsUI();
    toast('x_scroll', fxSettings.compactHud ? 'HUD: Gọn' : 'HUD: Đầy đủ', 'Nhấn H để chuyển nhanh');
    play('uiClick');
  }
  if (pressed.has('Tab') && started && !player.dead && !choosing) toggleMap();
  if (pressed.has('Escape')) {
    if (inShopOpen()) leaveShopPanel();
    else if (started && !player.dead && !choosing) setPaused(!paused);
  }

  if (started && !paused && !choosing && !inShopOpen()) {
    combat.resetCombatFrame?.();
    player.update(dt, aim, enemies, time);
    if (player2) updateP2(dt, time);
    if (player.dead) {
      if (pressed.has('KeyR')) restart();
    } else {
      handleInteract();
    }

    updateTactics(enemies, player, dt);
    for (const e of enemies) {
      if (e.nemesis && e.alive && (e.fleeT -= dt) <= 0) {
        e.noReward = true; run.nemesisLv = (run.nemesisLv || 0) + 1;
        smoke(e.pos.clone().setY(0.8), { count: 10, color: 0x2a1020, size: 1.4, life: 1, alpha: 0.7 });
        showBanner('Kẻ Săn Đầu đã bỏ chạy', 'Hắn sẽ quay lại, mạnh hơn', 2.2, '#ff5a8a');
        e.die();
        continue;
      }
      const kSpeed = e.knock.length();
      const tp = targetFor(e);
      const landed = e.update(dt * (e.timeMul || 1), tp, time);
      if (kSpeed > 4.5 && e.alive && !e.spawning) envImpact(e, kSpeed);
      if (!e.alive || e.spawning || tp.dead || !e.contactDmg || e.stunned) continue;
      const d = Math.hypot(e.pos.x - tp.pos.x, e.pos.z - tp.pos.z);
      if (e.grounded && d < e.radius + tp.radius - 0.1) {
        if (tp.hurt(e.contactDmg)) {
          const push = new THREE.Vector3(e.pos.x - tp.pos.x, 0, e.pos.z - tp.pos.z).normalize();
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
    updateRunes(dt);
    companions?.update(dt, player, enemies, loot, time);
    const fBoss = enemies.find((e) => e.isTrueBoss && e.alive);
    if (fBoss) objectives?.setFireRing(fBoss.arenaRadius);
    else if (enemies.some((e) => e.isTrueBoss)) objectives?.setFireRing(0);
    objectives?.update(dt, player, enemies, time);
    if (defense?.active) {
      defense.update(dt, enemies, player, time);
      if (defense.coreHp <= 0 && !deathShown) {
        showBanner('Lò Lửa Trung Tâm Đã Tắt!', 'Đợt công thành đã phá hủy lõi lò', 2.8, '#ff4a3a');
        player.dead = true;
        onDeath();
      }
    }
    if (run.mode !== 'sandbox') updateHazards(dt, event?.id === 'firerain');
    // Cơn Thịnh Nộ của vị thần bị từ chối trong Song Tượng Thần (cơ chế #7)
    if (trialState && enemies.some((e) => e.alive)) {
      tickGodWrath(trialState.spurnedGod.id, dt, trialState.wrathState, scene, player, enemies);
    }
    // Ánh Lửa giảm dần khi giao chiến (cơ chế #6 · Chén Lửa -35%, giảm 55% khi đấu Boss)
    if (run.mode !== 'sandbox' && enemies.some((e) => e.alive && !e.isDummy) && !player.dead) {
      const flameMul = player.stats.chalice ? 0.65 : 1;
      const bossSlow = enemies.some((e) => e.isBoss && e.alive) ? 0.45 : 1;
      addFlame(-dt * (0.95 + (floor - 1) * 0.18) * flameMul * bossSlow);
    }

    const born = [];
    let killBursts = 0;
    enemies = enemies.filter((e) => {
      if (!e.dead) return true;
      kills++;
      onKill(e, { allowVolatile: killBursts < 4 });
      if (hasDynCurse('volatile_soul') && !e.isBoss) killBursts++;
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
    // Quân tiếp viện giữa đợt khi quái ban đầu giảm dưới ngưỡng
    if (reinforceLeft > 0 && !player.dead && enemies.length > 0 && enemies.length <= reinforceTrigger) {
      spawnReinforcements();
    }

    // Khế Ước Máu: mất máu dần nhưng không chết
    if (player.hasRelic('pact') && !player.dead && player.hp > 1) player.hp = Math.max(1, player.hp - dt);
    // Bóng Tối Lan: đợt kéo dài quá lâu thì bóng tối gây sát thương và sinh tinh anh (không áp dụng ở Phòng Tập / Thủ Thành)
    const fighting = run.mode === 'normal' && enemies.some((e) => e.alive && !e.isBoss && !e.isDummy) && !enemies.some((e) => e.isBoss) && arenaT <= 0 && !player.dead;
    if (fighting) {
      waveTime += dt;
      const limit = deep(10) ? 40 : 60;
      if (!creeping && waveTime >= limit) {
        creeping = true;
        showBanner('Bóng Tối Lan!', 'Đánh nhanh lên: bóng tối đang nuốt căn phòng', 2.4, '#9a6aff');
        play('anvil', { rate: 0.6 });
      }
      if (creeping) {
        creepT -= dt; creepSpawn -= dt;
        if (creepT <= 0) {
          creepT = Math.max(1.2, 2.4 - (waveTime - limit) * 0.02);
          const a = Math.random() * Math.PI * 2, rr = Math.random() * 2.5;
          combat.scheduleBomb(new THREE.Vector3(player.pos.x + Math.cos(a) * rr, 0, player.pos.z + Math.sin(a) * rr), 0.9, 2.2, 0, 12, 0x7a3aff);
        }
        if (creepSpawn <= 0 && enemies.length < 30) {
          creepSpawn = 9;
          const [x, z] = spawnPos(9);
          const w = new Wraith(scene, x, z);
          addEnemy(w); if (!w.elite) makeElite(w, 1);
          ctx.enemies = enemies;
        }
      }
    }
    // Đấu Trường: quái kéo tới liên tục cho đến hết giờ
    if (arenaT > 0 && !player.dead) {
      arenaT -= dt;
      arenaSpawn -= dt;
      if (arenaSpawn <= 0 && enemies.length < 22) {
        arenaSpawn = 2.0;
        const pool = ['normal', 'goblin', 'spider', 'viper', 'minion', 'orc', 'imp', 'wasp', 'bomber', 'archer', 'shield', 'lancer', 'pyro', 'frostguard', 'berserker', 'crab', 'drake', 'glub', 'wraith', 'assassin'];
        for (let k = 0; k < 3; k++) {
          const kind = pool[Math.floor(Math.random() * Math.min(pool.length, 6 + wave * 2))];
          const [x, z] = spawnPos(8);
          const e = MAKE_ENEMY[kind] ? new MAKE_ENEMY[kind](scene, x, z) : new Slime(scene, x, z, kind);
          addEnemy(e);
        }
        ctx.enemies = enemies;
      }
      if (arenaT <= 0) showBanner('Hết giờ!', 'Dọn sạch số quái còn lại', 1.6, '#ffb040');
    }
    if (!player.dead && run.mode !== 'sandbox' && enemies.length === 0 && arenaT <= 0) {
      if (intermission === null) onWaveCleared();
      if (intermission !== null && isFinite(intermission)) {
        if (pressed.has('KeyG') && !choosingReward && !inShop && !exitOpen && intermission > 0.3) intermission = 0.25;
        intermission -= dt;
        if (intermission <= 0) {
          intermission = null;
          loot.removeAnvil();
          spawnWave();
        }
      }
    }

    const combatActive = enemies.some((e) => e.alive && !e.isDummy);
    loot.update(dt, camera, player, time, combatActive);
    rewards.update(dt, camera, time, player.pos);
    echoMgr?.update(dt, camera, time, player.pos);
    updateEliteLabels(enemies, camera);
    for (const p of loot.updatePickups(dt, player, player.stats.magnet)) {
      if (p.kind === 'soul' || p.kind === 'gold' || p.kind === 'scrap') {
        _pickupChain = _pickupChainT > 0 ? Math.min(10, _pickupChain + 1) : 0;
        _pickupChainT = 0.35;
      }
      const pRate = 1 + _pickupChain * 0.065;
      if (p.kind === 'soul') { addSouls(p.value); play('drop', { vol: 0.6, rate: 1.2 * pRate }); }
      else if (p.kind === 'gold') {
        addGold(p.value);
        if (hasDynCurse('blood_gold') && !player.hasRelic('fury') && player.weapon?.corrupted !== 'c_finisher') player.heal(2);
        play('drop', { vol: 0.5, rate: 1.45 * pRate });
      } else if (p.kind === 'potion') {
        if (!player.hasRelic('fury') && player.weapon?.corrupted !== 'c_finisher') player.heal(25);
        play('heal');
      } else if (p.kind === 'gem') pickGem(p.value);
      else if (p.kind === 'rune') pickRune(typeof p.value === 'string' ? p.value : p.value?.id);
      else if (p.kind === 'core') pickCore(typeof p.value === 'string' ? p.value : p.value?.id);
      else if (p.kind === 'scrap') { addScrap(p.value); play('pickup', { vol: 0.35, rate: 1.35 * pRate }); }
    }
  }

  updateWorld(time, player.pos);
  if (!started) {
    player?.anim?.update(realDt);
    if (darkLight) {
      darkLight.color.set(0xff9238);
      darkLight.position.set(0.3, 2.6, 0.2);
      darkLight.intensity = 16 + Math.sin(time * 4.2) * 3.0 + Math.sin(time * 10.7) * 1.2;
    }
    if (menuAnvil?.visible) {
      const pulse = 0.85 + Math.sin(time * 3.1) * 0.15;
      menuAnvil.userData.ring.material.opacity = 0.35 + pulse * 0.22;
      menuAnvil.userData.glow.scale.setScalar(1.75 + pulse * 0.28);
      menuAnvil.userData.glow2.scale.setScalar(0.85 + pulse * 0.16);
    }
    menuEmberT -= realDt;
    if (menuEmberT <= 0) {
      menuEmberT = 0.085;
      _menuPos.set(0.2 + (Math.random() - 0.5) * 2.4, 0.85 + Math.random() * 0.35, -0.35 + (Math.random() - 0.5) * 2.0);
      _menuVel.set((Math.random() - 0.5) * 0.65, 1.3 + Math.random() * 1.4, (Math.random() - 0.5) * 0.65);
      emit(_menuPos, {
        frame: F.flame,
        color: Math.random() < 0.35 ? 0xffe08a : 0xff7a2a,
        color2: 0xff3a10,
        size: 0.22 + Math.random() * 0.16,
        size2: 0.04,
        life: 1.1 + Math.random() * 0.8,
        vel: _menuVel,
        drag: 0.5,
        hdr: 1.9,
      });
    }
  } else if (darkLight) {
    darkLight.position.set(player.pos.x, 3, player.pos.z);
  }
  updateFade(realDt);
  updateFx(started ? dt : realDt, realDt, camera);
  updateToasts(realDt);

  // Nhạc nền theo trạng thái
  const bossAlive = enemies.some((e) => e.isBoss && !e.dead);
  setMusic(!started ? 'calm' : bossAlive ? 'boss' : enemies.length ? 'battle' : 'calm');
  updateMusic(realDt);

  // Camera (zoom gần khi hạ boss, tụ lực, phản đòn & look-ahead theo hướng chuột)
  slowmoReal = Math.max(0, slowmoReal - realDt);
  camZoom += ((slowmoReal > 0 ? 0.62 : 1) - camZoom) * Math.min(1, realDt * 3);
  let effZoom = camZoom;
  if (!started) {
    menuT += realDt * 0.16;
    camTarget.set(-1.55 + Math.sin(menuT) * 1.0, 4.45 + Math.sin(menuT * 0.7) * 0.2, 9.0 + Math.cos(menuT) * 0.55);
    camera.position.lerp(camTarget, 1 - Math.pow(0.08, realDt));
  } else {
    if (menuTransitionT > 0) menuTransitionT = Math.max(0, menuTransitionT - realDt);
    // 2 người: camera nhìn vào giữa hai người, lùi xa khi hai người cách xa
    const focus = player2 && !player2.dead && !player.dead ? player.pos.clone().lerp(player2.pos, 0.5) : player2 && player.dead ? player2.pos : player.pos;
    let gx = 0, gz = 0;
    if (!paused && !choosing && !inShopOpen() && !player2 && !touchIn.active) {
      const dx = aim.x - focus.x, dz = aim.z - focus.z;
      const dist = Math.hypot(dx, dz) || 1;
      const shift = Math.min(1.5, dist * 0.11);
      gx = (dx / dist) * shift;
      gz = (dz / dist) * shift;
    }
    const lf = Math.min(1, realDt * 7);
    camLookAhead.x += (gx - camLookAhead.x) * lf;
    camLookAhead.z += (gz - camLookAhead.z) * lf;
    const spread = player2 ? Math.min(0.55, Math.max(0, player.pos.distanceTo(player2.pos) - 8) * 0.03) : 0;
    const chZoom = player.charging ? -0.05 * Math.min(1, player.chargeT / 1.0) : 0;
    effZoom = Math.max(0.52, camZoom + camPulse.zoom + chZoom + spread);
    camTarget.copy(focus).add(camLookAhead).addScaledVector(CAM_OFFSET, effZoom);
    camera.position.lerp(camTarget, 1 - Math.pow(0.001, realDt));
  }
  shake.trauma = Math.max(0, shake.trauma - realDt * 1.8);
  shake.kickX *= Math.max(0, 1 - realDt * 14);
  shake.kickZ *= Math.max(0, 1 - realDt * 14);
  camPulse.zoom *= Math.max(0, 1 - realDt * 9);
  retHitT = Math.max(0, retHitT - realDt);
  if (hitComboT > 0) { hitComboT -= realDt; if (hitComboT <= 0) hitCombo = 0; }
  if (killStreakT > 0) { killStreakT -= realDt; if (killStreakT <= 0) killStreak = 0; }
  if (_pickupChainT > 0) { _pickupChainT -= realDt; if (_pickupChainT <= 0) _pickupChain = 0; }
  const s = shake.trauma * shake.trauma * 0.6;
  const base = camera.position.clone();
  camera.position.x += (Math.random() * 2 - 1) * s + shake.kickX;
  camera.position.y += (Math.random() * 2 - 1) * s;
  camera.position.z += (Math.random() * 2 - 1) * s + shake.kickZ;
  if (!started) {
    camLookTarget.set(-1.45, 1.05, -0.2);
    camLook.lerp(camLookTarget, 1 - Math.pow(0.04, realDt));
    camera.lookAt(camLook);
  } else {
    camLookTarget.set(camera.position.x - CAM_OFFSET.x * effZoom, 0, camera.position.z - CAM_OFFSET.z * effZoom);
    if (menuTransitionT > 0) camLook.lerp(camLookTarget, 1 - Math.pow(0.0005, realDt));
    else camLook.copy(camLookTarget);
    camera.lookAt(camLook);
  }

  updateHud(realDt);
  if (fxSettings.showFps) {
    _fpsFrames++;
    _fpsAcc += realDt;
    if (_fpsAcc >= 0.25) {
      const fps = Math.round(_fpsFrames / _fpsAcc);
      const scale = Math.round((fxStats().loadScale ?? 1) * 100);
      const meter = $('fps-meter');
      if (meter) {
        meter.classList.remove('hidden');
        meter.classList.toggle('warn', fps < 45);
        meter.textContent = scale < 99 ? `${fps} FPS · FX ${scale}%` : `${fps} FPS`;
      }
      _fpsFrames = 0;
      _fpsAcc = 0;
    }
  }

  if (render) {
    if (fxQuality.high && !fxStats().autoLowBloom) composer.render();
    else renderer.render(scene, camera);
  }
  camera.position.copy(base);
  endFrame();
}

function updateHud(realDt) {
  lastHp = player.hp;
  ghostHp = ghostHp > player.hp ? Math.max(player.hp, ghostHp - realDt * 35) : player.hp;
  hud.hpFill.style.width = (player.hp / player.maxHp) * 100 + '%';
  $('stam-fill').style.width = player.stamina + '%';
  $('stam').classList.toggle('warn', player.stamWarn > 0);
  hud.hpGhost.style.width = (ghostHp / player.maxHp) * 100 + '%';
  hud.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}` + (player.shieldHp > 0 ? ` (+${player.shieldHp})` : '');
  hud.wave.textContent = Math.max(1, wave);
  hud.kills.textContent = kills;
  hud.best.textContent = best;
  const dashP = player.dashStock >= player.stats.dashCharges ? 1 : 1 - player.dashCd / player.dashCdMax;
  const dashNow = player.dashStock > 0;
  hud.dashRing.style.setProperty('--p', dashP.toFixed(3));
  hud.dashRing.classList.toggle('ready', dashNow);
  if (dashNow && !_prevDashReady) pulseHudEl(hud.dashRing, 'ready-pop');
  _prevDashReady = dashNow;
  $('dash-stock').textContent = player.stats.dashCharges > 1 ? '×' + player.dashStock : '';
  const spearRecall = player.activeSpecialType === 'spear' && player.lodgedSpear;
  const spP = 1 - player.specialCd / player.specialCdMax;
  const spNow = spearRecall || (spP >= 1 && !player.boomerangOut);
  const spRing = $('special-ring');
  spRing.style.setProperty('--p', spearRecall ? '1' : Math.max(0, spP).toFixed(3));
  spRing.classList.toggle('ready', spNow);
  if (spNow && !_prevSpReady) pulseHudEl(spRing, 'ready-pop');
  _prevSpReady = spNow;
  if (player.slot !== _prevSlot) {
    _prevSlot = player.slot;
    pulseHudEl(hud.slots[player.slot], 'slot-swap');
  }
  const cw = player.weapon;
  const useReticle = started && !paused && !choosing && !inShopOpen() && !touchIn.active && !pad.active;
  document.body?.classList?.toggle('custom-reticle', useReticle);
  const retEl = $('reticle');
  if (retEl) {
    retEl.classList.toggle('hidden', !useReticle);
    if (useReticle) {
      const rx = (mouse.x * 0.5 + 0.5) * innerWidth;
      const ry = (-mouse.y * 0.5 + 0.5) * innerHeight;
      retEl.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0) translate(-50%,-50%)`;
      retEl.classList.toggle('hit', retHitT > 0);
      retEl.classList.toggle('crit', retHitT > 0 && retCrit);
      const ring = retEl.querySelector('.ret-ring');
      if (ring) ring.style.transform = player.attack ? 'scale(1.3)' : 'scale(1)';
      const rBar = $('ret-bar'), rSweet = $('ret-sweet'), rFill = $('ret-fill');
      if (rBar && rSweet && rFill) {
        if (cw?.type === 'crossbow' && player.reloadT > 0) {
          rBar.classList.remove('hidden');
          rSweet.style.left = '42%'; rSweet.style.width = '28%';
          rFill.style.width = `${Math.min(100, Math.max(0, Math.round((1 - player.reloadT / Math.max(0.1, player.reloadDur)) * 100)))}%`;
          rFill.classList.toggle('jam', !!player.activeReloadLocked);
        } else if (player.charging) {
          rBar.classList.remove('hidden');
          rSweet.style.left = '58%'; rSweet.style.width = '35%';
          rFill.style.width = `${Math.min(100, Math.round((player.chargeT / 1.45) * 100))}%`;
          rFill.classList.remove('jam');
        } else {
          rBar.classList.add('hidden');
        }
      }
    }
  }
  const comboEl = $('combo-chip');
  if (comboEl) {
    const showCombo = started && !paused && (hitCombo >= 2 || killStreak >= 3);
    comboEl.classList.toggle('hidden', !showCombo);
    if (showCombo) {
      $('combo-num').textContent = hitCombo >= 2 ? `×${hitCombo}` : `${killStreak}`;
      $('combo-lbl').textContent = killStreak >= 8 ? 'CUỒNG SÁT!' : killStreak >= 5 ? 'NGŨ SÁT!' : killStreak >= 3 ? 'TAM SÁT!' : 'LIÊN KÍCH';
      comboEl.classList.toggle('hot', hitCombo >= 10 || killStreak >= 3);
    }
  }
  $('rage-fill').style.width = player.rage + '%';
  $('rage').classList.toggle('full', player.rage >= 100);
  // Đồng bộ vòng hồi chiêu, Nộ & Nhiệt Lưỡi trực tiếp lên cụm nút cảm ứng
  const tDash = $('touch-dash');
  if (tDash) {
    const dashCost = hasDynCurse('shadow_step') ? 30 : 22;
    tDash.style.setProperty('--p', Math.max(0, dashP).toFixed(3));
    tDash.classList.toggle('ready', player.dashStock > 0 && player.stamina >= dashCost);
    tDash.classList.toggle('no-stam', player.stamina < dashCost);
    const ds = $('touch-dash-stock');
    if (ds) ds.textContent = player.stats.dashCharges > 1 ? '×' + player.dashStock : '';
  }
  const cwHz = cw ? player.heatZone(cw) : 'cold';
  const cwHot = cwHz === 'hot' || cwHz === 'critical';
  const tSp = $('touch-special');
  if (tSp) {
    tSp.style.setProperty('--p', spearRecall ? '1' : Math.max(0, spP).toFixed(3));
    tSp.classList.toggle('ready', spearRecall || (spP >= 1 && !player.boomerangOut && player.stamina >= 18));
    tSp.classList.toggle('hot', cwHot);
    const spL = $('touch-sp-lbl');
    if (spL) spL.textContent = spearRecall ? 'Thu!' : ({ sword: 'Đỡ', axe: 'Ném', greatsword: 'Tích', staff: 'Cầu', daggers: 'Dao', crossbow: 'Nổ', spear: 'Phóng', scythe: 'Gặt', hammer: 'Chấn', gauntlets: 'Đấm', whip: 'Kéo', chakram: 'Luân' }[player.activeSpecialType] || 'Chiêu');
  }
  const tUlt = $('touch-ult');
  if (tUlt) {
    tUlt.style.setProperty('--p', Math.min(1, player.rage / 100).toFixed(3));
    tUlt.classList.toggle('full', player.rage >= 100);
    const pct = $('touch-ult-pct');
    if (pct) pct.textContent = player.rage >= 100 ? 'NỘ!' : Math.floor(player.rage) + '%';
  }
  const tSwap = $('touch-swap');
  if (tSwap) {
    tSwap.classList.toggle('hot', cwHot);
    tSwap.classList.toggle('twin', !!cw?.altForm);
    const sl = $('touch-swap-lbl');
    if (sl) sl.textContent = cwHot ? 'Tôi!' : cw?.altForm ? 'Biến' : 'Đổi';
  }
  $('gold').textContent = gold;
  const alive = enemies.filter((e) => !e.dead && !e.isDummy).length;
  hud.left.textContent = run.mode === 'sandbox' ? '· Phòng Tập' : alive ? `· còn ${alive} quái` : '';
  $('floor').textContent = floor;
  if (sandbox?.active) {
    const st = sandbox.getDpsStats();
    if ($('sb-dps')) $('sb-dps').textContent = st.dps.toLocaleString('vi-VN');
    if ($('sb-peak')) $('sb-peak').textContent = st.peak.toLocaleString('vi-VN');
    if ($('sb-total')) $('sb-total').textContent = st.total.toLocaleString('vi-VN');
  }
  if (defense?.active) {
    if ($('def-fill')) $('def-fill').style.width = Math.max(0, (defense.coreHp / defense.coreMaxHp) * 100) + '%';
    if ($('def-hp')) $('def-hp').textContent = `${Math.ceil(defense.coreHp)} / ${defense.coreMaxHp}`;
    if ($('def-wave')) $('def-wave').textContent = `Đợt ${Math.max(1, wave)} / ${DEFENSE_MAX_WAVES}`;
  }
  updateArrows();
  drawMinimap();
  const mechEl = $('weapon-mech-hud');
  if (mechEl) {
    let mechHtml = '';
    if (started && !paused && cw) {
      if (cw.type === 'crossbow') {
        if (player.reloadT > 0) {
          const pct = Math.min(100, Math.max(0, Math.round((1 - player.reloadT / Math.max(0.1, player.reloadDur)) * 100)));
          mechHtml = `<div class="wm-head"><span>Nạp Tên</span><span class="wm-sub">${player.activeReloadLocked ? 'Kẹt Cò!' : 'Bấm đúng vùng vàng!'}</span></div>`
            + `<div class="wm-bar"><div class="wm-sweet" style="left:42%;width:28%"></div><div class="wm-fill${player.activeReloadLocked ? ' jam' : ''}" style="width:${pct}%"></div></div>`;
        } else {
          const maxB = player.bowMax || 5;
          const emp = player.empoweredAmmo || 0;
          const pips = Array.from({ length: maxB }, (_, k) => `<span class="wm-pip${k < player.bowAmmo ? (k < emp ? ' on emp' : ' on') : ''}"></span>`).join('');
          mechHtml = `<div class="wm-head"><span>Tên Nỏ${emp > 0 ? ' · NẠP HOÀN HẢO!' : ''}</span><span class="wm-sub">${player.bowAmmo} / ${maxB}</span></div><div class="wm-pips">${pips}</div>`;
        }
      } else if (player.charging) {
        const pct = Math.min(100, Math.round((player.chargeT / 1.45) * 100));
        const sweet = player.chargeT >= 0.85 && player.chargeT <= 1.35;
        mechHtml = `<div class="wm-head"><span>${sweet ? '★ TRẢM TUYỆT ĐỈNH!' : 'Tích Lực Đại Kiếm'}</span><span class="wm-sub">${player.chargeT.toFixed(2)}s</span></div>`
          + `<div class="wm-bar"><div class="wm-sweet" style="left:58%;width:35%"></div><div class="wm-fill${sweet ? ' hot' : ''}" style="width:${pct}%"></div></div>`;
      } else if (cw.type === 'scythe') {
        const s = player.scytheSouls || 0;
        const pips = Array.from({ length: 5 }, (_, k) => `<span class="wm-pip soul${k < s ? ' on' : ''}"></span>`).join('');
        mechHtml = `<div class="wm-head"><span>Mảnh Hồn</span><span class="wm-sub">${s >= 3 ? 'Chuột phải Gặt Bóng!' : `${s} / 5`}</span></div><div class="wm-pips">${pips}</div>`;
      } else if (cw.type === 'gauntlets' && player.fistFury > 0) {
        const f = player.fistFury;
        const pips = Array.from({ length: 5 }, (_, k) => `<span class="wm-pip${k < f ? ' on' : ''}"></span>`).join('');
        mechHtml = `<div class="wm-head"><span>Liên Quyền ×${f}</span><span class="wm-sub">+${f * 8}% tốc đánh</span></div><div class="wm-pips">${pips}</div>`;
      } else if (player.riposteT > 0) {
        const pct = Math.min(100, Math.round((player.riposteT / 2.5) * 100));
        mechHtml = `<div class="wm-head"><span>Phản Kiếm Sẵn Sàng!</span><span class="wm-sub">${player.riposteT.toFixed(1)}s</span></div><div class="wm-bar"><div class="wm-fill hot" style="width:${pct}%"></div></div>`;
      } else if (player.boomerangOut || player.axeFury) {
        mechHtml = `<div class="wm-head"><span>${player.axeFury ? 'Bổ Cuồng Nộ!' : 'Rìu Đang Bay'}</span><span class="wm-sub">${player.axeFury ? 'Đòn tới +65% ST' : 'Đánh gần để Bắt Rìu!'}</span></div>`;
      } else if (player.lodgedSpear) {
        mechHtml = `<div class="wm-head"><span>Thương Đã Cắm</span><span class="wm-sub">Chuột phải thu thương</span></div>`;
      }
      if (player.momentumStacks > 0) {
        mechHtml += `<div class="wm-head"><span class="wm-sub">Đà Chiến ×${player.momentumStacks}</span><span class="wm-sub">+${player.momentumStacks * 4}% tốc đánh</span></div>`;
      }
    }
    if (mechHtml !== _lastMechHtml) {
      _lastMechHtml = mechHtml;
      mechEl.innerHTML = mechHtml;
      mechEl.classList.toggle('hidden', !mechHtml);
    }
  }
  $('lvl').textContent = player.level;
  $('xp-fill').style.width = Math.min(100, (player.xp / xpForLevel(player.level)) * 100) + '%';
  $('souls').textContent = meta.souls;
  const activeBosses = enemies.filter((e) => e.isBoss && !e.dead);
  const boss = activeBosses[0] || enemies.find((e) => e.miniBoss && !e.dead);
  const bossBar = $('boss-bar');
  show('boss-bar', !!boss && started);
  if (boss) {
    const wards = enemies.filter((e) => e.ward && !e.dead && (!boss || e.ward === boss)).length;
    bossBar?.classList.toggle('invuln', wards > 0);
    if (activeBosses.length > 1) {
      const hpSum = activeBosses.reduce((s, b) => s + Math.max(0, b.hp), 0);
      const maxSum = activeBosses.reduce((s, b) => s + (b.maxHp || b.maxHpEff || 1), 0);
      const poisePct = Math.max(...activeBosses.map((b) => (b.poiseMax ? (b.stunned ? 100 : (b.poise / b.poiseMax) * 100) : 0)));
      const allParts = activeBosses.flatMap((b) => b.parts || []);
      const bName = 'Song Tử Tử Thần · ' + activeBosses.map((b) => b.role === 'flame' ? 'Hỏa Ảnh' : 'Lôi Ảnh').join(' & ') + (wards > 0 ? ` · BẤT TỬ (Phá ${wards} Pha Lê Tím!)` : '');
      if (bName !== _lastBossName) { _lastBossName = bName; $('boss-name').textContent = bName; }
      $('boss-fill').style.width = Math.max(0, (hpSum / maxSum) * 100) + '%';
      $('boss-poise').style.width = Math.min(100, poisePct) + '%';
      const bp = $('boss-parts');
      if (bp) {
        const bpHtml = allParts.length
          ? allParts.map((pt) => `<span class="bpart${pt.broken ? ' broken' : ''}"><i class="ico" style="--i:url('/ui/icons/${pt.icon}.svg')"></i>${pt.name}${pt.broken ? ' ✕' : ` ${Math.max(0, Math.ceil((pt.hp / pt.maxHp) * 100))}%`}</span>`).join('')
          : '';
        if (bpHtml !== _lastBossPartsHtml) { _lastBossPartsHtml = bpHtml; bp.innerHTML = bpHtml; }
      }
    } else {
      const suffix = wards > 0 ? ` · BẤT TỬ (Phá ${wards} Pha Lê Tím!)` : (boss.stunned ? ' · Choáng!' : boss.absorbed ? ' · Hấp Thụ!' : boss.enraged ? ' · Nổi giận!' : '');
      const bName = boss.name + suffix;
      if (bName !== _lastBossName) { _lastBossName = bName; $('boss-name').textContent = bName; }
      $('boss-fill').style.width = Math.max(0, (boss.hp / (boss.maxHp || boss.maxHpEff)) * 100) + '%';
      $('boss-poise').style.width = boss.poiseMax ? Math.min(100, (boss.stunned ? 100 : boss.poise / boss.poiseMax * 100)) + '%' : '0%';
      const bp = $('boss-parts');
      if (bp) {
        const bpHtml = boss.parts?.length
          ? boss.parts.map((pt) => `<span class="bpart${pt.broken ? ' broken' : ''}"><i class="ico" style="--i:url('/ui/icons/${pt.icon}.svg')"></i>${pt.name}${pt.broken ? ' ✕' : ` ${Math.max(0, Math.ceil((pt.hp / pt.maxHp) * 100))}%`}</span>`).join('')
          : '';
        if (bpHtml !== _lastBossPartsHtml) { _lastBossPartsHtml = bpHtml; bp.innerHTML = bpHtml; }
      }
    }
  } else {
    bossBar?.classList.remove('invuln');
  }
  // Thanh Nhiệt Lưỡi thời gian thực cho từng ô vũ khí & ánh sáng Ánh Lửa
  for (let i = 0; i < 2; i++) {
    const w = player.weapons?.[i];
    const bar = $('heat-bar-' + i), fill = $('heat-fill-' + i);
    if (!w || !bar || !fill) continue;
    fill.style.width = Math.round(w.heat || 0) + '%';
    const hz = player.heatZone(w);
    bar.className = 'heat-bar' + (hz !== 'cold' ? ' ' + hz : '');
    hud.slots[i]?.classList.toggle('tempered', i === player.slot && player.temperedT > 0);
  }
  setFlameLevel(flameState.flame);
  renderFlameHud();
  hurtFlash = Math.max(0, hurtFlash - realDt * 2.5);
  hud.hurt.style.opacity = hurtFlash;
  const low = !player.dead && player.hp / player.maxHp < 0.3;
  hud.lowhp.style.opacity = low ? 0.35 + Math.sin(time * 6) * 0.25 : 0;
  hud.hpFill?.parentElement?.classList?.toggle('low-hp', !player.dead && player.hp / player.maxHp < 0.25);
  $('slowmo').style.opacity = player.slowmoT > 0 ? 1 : 0;
  const idle = started && !player.dead && enemies.length === 0 && wave > 0;
  document.body?.classList?.toggle('hud-idle', idle || inShop || exitOpen);
  $('hint')?.classList?.toggle('hint-auto-hide', !!fxSettings.compactHud && wave >= 2);
  $('quest-chip')?.classList?.toggle('quest-quiet', !!fxSettings.compactHud && (choosingReward || inShop || exitOpen || !!boss));
  const creepLimit = deep(10) ? 40 : 60;
  const objHud = !idle && started ? objectives?.hudText?.() : '';
  const baseT = creeping ? '<i class="ico ico-hourglass"></i> <span style="color:#b89aff">Bóng Tối Lan!</span>'
    : waveTime > creepLimit - 15 && enemies.length ? `<i class="ico ico-hourglass"></i> Bóng Tối Lan sau ${Math.ceil(creepLimit - waveTime)} giây`
    : arenaT > 0 ? `<i class="ico ico-hourglass"></i> Đấu Trường: còn ${Math.ceil(arenaT)} giây`
    : !idle ? ''
    : exitOpen ? '<i class="ico ico-hourglass"></i> Tới nắp hầm giữa phòng để xuống tầng'
    : choosingReward ? '<i class="ico ico-hourglass"></i> Chọn một bệ phần thưởng để bắt đầu đợt tiếp theo'
    : inShop ? '<i class="ico ico-hourglass"></i> Mua đồ ở thương nhân, bấm "Rời đi" khi xong'
    : intermission !== null && isFinite(intermission)
      ? `<i class="ico ico-hourglass"></i> Đợt ${wave + 1} sau ${Math.ceil(intermission)} giây`
        + (intermission > 1.2 ? ' · <span class="keycap">G</span> Sẵn sàng ngay' : '')
      : '';
  const tHtml = [objHud, baseT].filter(Boolean).join(' · ');
  if (tHtml !== _lastTimerHtml) { _lastTimerHtml = tHtml; hud.timer.innerHTML = tHtml; }
  if (bannerTimer > 0) { bannerTimer -= realDt; if (bannerTimer <= 0) hud.bannerWrap.classList.remove('show'); }
  if (player.dead && (!player2 || player2.dead) && !deathShown) onDeath();
}

function showVictory(reason = 'story') {
  victoryShown = true;
  run.victory = true;
  const modeLbl = reason === 'defense' ? 'Thủ Thành' : run.daily ? 'Hằng ngày' : '';
  submitRun({ floor, wave, kills, char: run.char, depth: run.depth || 0, boss: true, victory: true, date: todayKey(), mode: modeLbl });
  checkAchievements();
  saveMeta(meta);
  setTimeout(() => {
    $('vic-sub').textContent = reason === 'defense'
      ? 'Bạn đã giữ vững Lò Lửa Trung Tâm qua trọn vẹn 10 đợt công thành! (+120 Hồn Thép)'
      : 'Bạn đã đánh bại TRÙM CUỐI Thợ Rèn Sa Ngã · Hắc Hỏa Tôn và thanh tẩy Lò Rèn Cổ Đại! (+150 Hồn Thép)';
    $('vic-wave').textContent = reason === 'defense' ? `${wave} / ${DEFENSE_MAX_WAVES}` : `${floor} / ${wave}`;
    $('vic-kills').textContent = kills;
    $('vic-souls').textContent = runSouls;
    $('vic-summary').innerHTML = renderRunSummaryHtml(runDmg, player, run);
    const btnEnd = $('btn-endless');
    if (btnEnd) btnEnd.style.display = reason === 'defense' ? 'none' : '';
    show('victory', true);
    setMode('menu');
    play('forged');
    playStory();
  }, 900);
}

function onDeath() {
  deathShown = true;
  clearRunState();
  syncContinueBtn();
  const isRecord = run.mode === 'normal' && wave > best;
  if (isRecord) { best = wave; localStorage.setItem('lorenh_best', String(best)); }
  if (run.daily) {
    const k = todayKey();
    meta.daily[k] = Math.max(meta.daily[k] || 0, wave);
  }
  meta.stats.deaths = (meta.stats.deaths || 0) + 1;
  meta.stats.runs = (meta.stats.runs || 0) + 1;
  // Ghi lại Bóng Ma Thợ Rèn Kế Thừa (cơ chế #8a) từ vũ khí mạnh nhất của lượt này
  const bestW = [...(player.weapons || [])].sort((a, b) => weaponScore(b) - weaponScore(a))[0];
  if (bestW && run.mode === 'normal') recordEcho(meta, floor, run.char, bestW, player.patron);
  const rank = run.mode !== 'sandbox'
    ? submitRun({ floor, wave, kills, char: run.char, depth: run.depth || 0, boss: !!run.bossKilled, date: todayKey(), mode: run.mode === 'defense' ? 'Thủ Thành' : run.bossrush ? 'Boss Rush' : run.daily ? 'Hằng ngày' : '' })
    : 0;
  checkAchievements();
  saveMeta(meta);
  setTimeout(() => {
    $('go-wave').textContent = wave;
    $('go-kills').textContent = kills;
    $('go-best').textContent = best;
    show('new-record', isRecord);
    const w = player.weapon;
    $('go-souls').innerHTML = `<i class="ico ico-soul"></i> Nhận được <b>${runSouls}</b> Hồn Thép · Tầng ${floor} · Cấp ${player.level}${run.mode === 'defense' ? ' · Thủ Thành' : run.daily ? ' · Thử thách hằng ngày' : ''}${rank ? ` · <b style="color:var(--gold)">Hạng #${rank}</b> bảng xếp hạng` : ''}`;
    $('go-weapon').innerHTML = `Vũ khí cuối cùng: <span style="color:${RARITY[w.rarity].css}">${weaponName(w)}</span> ${weaponIcons(w)}`;
    if ($('go-summary')) $('go-summary').innerHTML = renderRunSummaryHtml(runDmg, player, run);
    show('gameover', true);
    setMode('menu');
    playStory();
  }, 1200);
  hud.prompt.classList.remove('show');
}

function tick(now) {
  requestAnimationFrame(tick);
  const realDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  try {
    update(realDt);
  } catch (err) {
    console.error('[tick]', err);
  }
}

function startGame(opts = {}) {
  if (started) return;
  unlockAudio();
  unlockMusic();
  play('uiConfirm');
  const mode = opts.sandbox ? 'sandbox' : opts.defense ? 'defense' : 'normal';
  const curPet = run.pet || meta.pet || 'none';
  run = opts.daily
    ? { char: 'knight', pet: curPet, curses: [], daily: true, depth: 0, mode: 'normal', endless: false }
    : {
        char: run.char || meta.char || 'knight',
        pet: curPet,
        curses: opts.bossrush || mode !== 'normal' ? [] : [...run.curses],
        daily: false,
        depth: opts.bossrush || mode !== 'normal' ? 0 : run.depth || 0,
        bossrush: !!opts.bossrush,
        coop: !!opts.coop,
        mode,
        endless: false,
      };
  coop.on = !!run.coop;
  if (run.mode === 'normal' && !run.bossrush && !run.coop) { clearRunState(); syncContinueBtn(); }
  setSeed(run.daily ? daySeed() : null);
  started = true;
  menuTransitionT = 0.65;
  if (darkLight) { darkLight.color.set(0xffd8a0); darkLight.intensity = 0; }
  for (const id of ['start', 'howto', 'prep', 'bestiary', 'save-modal', 'victory']) show(id, false);
  restart();
  syncMenuStage();
  setMode('playing');
}

function continueSavedRun() {
  if (started) return;
  const s = loadRunState();
  if (!s) return;
  unlockAudio();
  unlockMusic();
  play('uiConfirm');
  run = { char: 'knight', pet: meta.pet || 'none', curses: [], daily: false, depth: 0, mode: 'normal', endless: false, ...(s.run || {}), coop: false };
  coop.on = false;
  setSeed(run.daily ? daySeed() : null);
  started = true;
  if (darkLight) { darkLight.color.set(0xffd8a0); darkLight.intensity = 0; }
  for (const id of ['start', 'howto', 'prep', 'bestiary', 'save-modal', 'victory']) show(id, false);
  restart();
  clearTimeout(patronTimer);
  patronTimer = null;
  floor = s.floor || 1;
  wave = s.wave || 0;
  kills = s.kills || 0;
  gold = s.gold || 0;
  scrap = s.scrap || 0;
  runSouls = s.runSouls || 0;
  exitOpen = !!s.exitOpen;
  choosingReward = !!s.choosingReward;
  nextReward = s.nextReward || null;
  challengeWave = !!s.challengeWave;
  anchorWave = s.anchorWave || null;
  boostedNext = !!s.boostedNext;
  cooledNext = !!s.cooledNext;
  trialDuoBoost = !!s.trialDuoBoost;
  extraDmgCurse = s.extraDmgCurse || 0;
  bossBane = s.bossBane || 0;
  victoryShown = !!s.victoryShown;
  if (s.floorMap) floorMap = s.floorMap;
  runeBag = Array.isArray(s.runeBag) ? [...s.runeBag] : [];
  bossCores = Array.isArray(s.bossCores) ? [...s.bossCores] : [];
  if (s.runDmg) runDmg = { ...runDmg, ...s.runDmg };
  if (s.flame) {
    flameState.flame = s.flame.flame ?? 100;
    flameState.corruption = s.flame.corruption ?? 0;
    flameState.curses = [...(s.flame.curses || [])];
  }
  if (floor > 1) {
    buildWorld(scene, floor);
    minimapDirty = true;
    buildHazards(scene, floor, rngFor(4));
    try { renderer.compile(scene, camera); } catch {}
    echoMgr?.clear();
    maybeSecret();
    maybeSpawnEchoGrave();
  }
  const sp = s.player || {};
  player.curses = run.curses;
  player.setCharacter(run.char);
  player.bonusMaxHp = sp.bonusMaxHp || 0;
  player.level = sp.level || 1;
  player.xp = sp.xp || 0;
  player.rage = sp.rage || 0;
  player.patron = sp.patron || null;
  player.perkLv = { ...(sp.perkLv || {}) };
  player.base = { ...baseStats(), ...(sp.base || {}) };
  player.relics = [...(sp.relics || [])];
  if (Array.isArray(sp.weapons) && sp.weapons.length) {
    player.setWeapons(sp.weapons, sp.slot || 0);
  }
  player.recalc();
  player.hp = Math.min(player.maxHp, Math.max(1, sp.hp || player.maxHp));
  player.pos.set(0, 0, ROOM_HALF - 4);
  lastHp = ghostHp = player.hp;
  if (run.pet && run.pet !== 'none') companions?.setPet(run.pet, player.pos);
  if (s.hadAnvil) { loot.spawnAnvil(6, -2); loot.anvilUses = s.anvilUses ?? 1; }
  if (exitOpen) { spawnExit(0, 0); intermission = Infinity; }
  else if (choosingReward && s.pedestals?.length) { rewards.offer(s.pedestals, -7); intermission = Infinity; }
  else intermission = 3.0;
  const se = $('scrap'); if (se) se.textContent = scrap;
  const ge = $('gold'); if (ge) ge.textContent = gold;
  renderSlots();
  renderRelics();
  renderNextReward();
  renderFlameHud();
  setFlameLevel(flameState.flame);
  menuTransitionT = 0.65;
  syncMenuStage();
  setMode('playing');
  showBanner(`Tiếp tục: Tầng ${floor}`, `Đợt ${wave}${exitOpen ? ' · Lối xuống đang mở' : choosingReward ? ' · Chọn phần thưởng' : ''}`, 2.6, '#7fd8ff');
}

function toMenu() {
  setSeed(null);
  updateMenuSouls();
  started = false;
  run.daily = false;
  run.coop = false; coop.on = false;
  run.mode = 'normal';
  run.endless = false;
  restart();
  menuT = 0;
  syncMenuStage();
  hud.startBest.textContent = best ? `Kỷ lục: đợt ${best}` : 'Chưa có kỷ lục';
  renderDaily();
  syncContinueBtn();
  show('start', true);
  setMode('menu');
}

function renderBestiary(tab = bestiaryTab) {
  bestiaryTab = tab;
  const res = renderBestiaryHtml(meta, tab);
  if ($('best-count')) $('best-count').textContent = res.countText;
  if ($('best-grid')) $('best-grid').innerHTML = res.html;
  $('best-tab-mobs')?.classList.toggle('active', tab === 'mobs');
  $('best-tab-bosses')?.classList.toggle('active', tab === 'bosses');
}

function openSaveModal() {
  const ta = $('save-code');
  const msg = $('save-msg');
  if (ta) ta.value = exportSaveCode();
  if (msg) { msg.textContent = ''; msg.classList.remove('err'); }
  show('save-modal', true);
  play('uiOpen');
}

function renderDaily() {
  const b = meta.daily[todayKey()];
  $('daily-best').textContent = b ? `Hôm nay: đợt ${b}` : 'Chưa chơi hôm nay';
}

function leaveShopPanel() {
  if (isAnvilOpen()) { closeAnvilModal(); return; }
  show('shop', false); show('floormap', false); show('bestiary', false); show('save-modal', false);
  setMode(started ? 'playing' : 'menu');
  play('uiClose');
}

// ================= Âm lượng =================
function syncSoundUI() {
  for (const el of document.querySelectorAll('.vol-slider')) {
    if (el.id === 'bgm-slider') continue;
    el.value = Math.round(getVolume() * 100);
  }
  const bgm = $('bgm-slider');
  if (bgm) bgm.value = Math.round(getMusicVolume() * 100);
  for (const el of document.querySelectorAll('.mute-btn')) {
    el.classList.toggle('off', isMuted());
    el.title = isMuted() ? 'Bật tiếng (M)' : 'Tắt tiếng (M)';
  }
}
function toggleMute() { setMuted(!isMuted()); syncSoundUI(); if (!isMuted()) play('uiClick'); }

async function init() {
  const fillEl = $('load-fill'), lblEl = $('load-label');
  await Promise.all([
    loadModels((done, total) => {
      const pct = total ? Math.round((done / total) * 100) : 100;
      if (fillEl) fillEl.style.width = pct + '%';
      if (lblEl) lblEl.textContent = `Đang tải mô hình 3D... ${pct}% (${done}/${total})`;
    }),
    loadSounds(),
  ]);
  buildWorld(scene);
  initFx(scene, renderer);
  applyFxQuality();
  for (const k of ['lava', 'ice', 'water', 'elec', 'obsidian', 'void', 'mist']) {
    liquidMaterial(k);
    liquidMaterial(k, { scale: 0.35, opaque: true });
  }
  try { renderer.compile(scene, camera); } catch {}
  $('btn-fx').onclick = () => { setFxQuality(!fxQuality.high); applyFxQuality(); play('uiClick'); };
  syncExtraSettingsUI();
  if ($('btn-shake')) $('btn-shake').onclick = () => {
    const nxt = fxSettings.shakeScale >= 0.9 ? 0.5 : fxSettings.shakeScale >= 0.4 ? 0 : 1;
    setFxSettings({ shakeScale: nxt });
    syncExtraSettingsUI();
    play('uiClick');
  };
  if ($('btn-dmgnum')) $('btn-dmgnum').onclick = () => {
    setFxSettings({ showDmg: !fxSettings.showDmg });
    syncExtraSettingsUI();
    play('uiClick');
  };
  if ($('btn-fps')) $('btn-fps').onclick = () => {
    setFxSettings({ showFps: !fxSettings.showFps });
    syncExtraSettingsUI();
    play('uiClick');
  };
  if ($('btn-hudmode')) $('btn-hudmode').onclick = () => {
    setFxSettings({ compactHud: !fxSettings.compactHud });
    syncExtraSettingsUI();
    play('uiClick');
  };
  // Cài đặt điều khiển cảm ứng trong menu Tạm Dừng
  const syncTouchSettingsUI = () => {
    const cfg = getTouchCfg();
    const sm = $('btn-stick-mode');
    if (sm) sm.textContent = 'Cần di chuyển: ' + (cfg.floating ? 'Thả nổi' : 'Cố định');
    const hp = $('btn-haptic');
    if (hp) hp.textContent = 'Rung phản hồi: ' + (cfg.haptic ? 'Bật' : 'Tắt');
    const sl = $('touch-alpha-slider');
    if (sl) sl.value = String(Math.round(cfg.alpha * 100));
  };
  syncTouchSettingsUI();
  if ($('btn-stick-mode')) $('btn-stick-mode').onclick = () => { setTouchCfg({ floating: !getTouchCfg().floating }); syncTouchSettingsUI(); play('uiClick'); };
  if ($('btn-haptic')) $('btn-haptic').onclick = () => { setTouchCfg({ haptic: !getTouchCfg().haptic }); syncTouchSettingsUI(); play('uiClick'); };
  if ($('touch-alpha-slider')) $('touch-alpha-slider').oninput = (e) => { setTouchCfg({ alpha: Number(e.target.value) / 100 }); };
  ctx.scene = scene;
  player = new Player(scene);
  player.masteryOf = (t) => masteryLv((meta.mastery || {})[t] || 0);
  player.meta = meta;
  run.char = meta.char || 'knight';
  run.pet = meta.pet || 'none';
  run.curses = [...(meta.curses || [])];
  ctx.player = player;
  ctx.onRangedHit = (e, dealt, proj) => (proj?.owner?.onRangedHit ? proj.owner.onRangedHit(e, dealt, proj) : player?.onRangedHit?.(e, dealt, proj));
  ctx.onHitConfirm = (e, dmg, crit) => {
    retHitT = Math.max(retHitT, crit ? 0.14 : 0.09);
    retCrit = !!crit;
    if (e) { hitCombo++; hitComboT = 2.6; }
  };
  ctx.recordDmg = (tag, amt) => {
    const k = runDmg[tag] !== undefined ? tag : 'basic';
    runDmg[k] += Math.max(0, Math.round(amt || 0));
  };
  ctx.onPlayerHurt = (dmg) => {
    hurtFlash = Math.min(0.75, 0.32 + dmg / 45);
    hitThisWave = true;
  };
  ctx.onRangerDash = (pos, dmg) => companions?.spawnBearTrap(pos, dmg);
  ctx.onClash = () => {
    meta.stats.clashes = (meta.stats.clashes || 0) + 1;
    if (enemies.some((x) => x.isBoss && x.alive)) addFlame(2.5);
  };
  ctx.onPillarCollapse = () => { minimapDirty = true; meta.stats.pillarsCollapsed = (meta.stats.pillarsCollapsed || 0) + 1; };
  ctx.spawnEnemy = (e) => { e.maxHpEff = e.hp; recordBestiary(e, false); enemies.push(e); };
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
    // Từ tầng 2: chỉ các Boss pháp thuật / Hắc Hỏa GĐ1 mới dựng pha lê hộ thể; còn lại Bùng Phát Cuồng Nộ
    const arcaneWard = b instanceof ArchMage || b instanceof ShadowLord || b instanceof PlagueKing || (b.isTrueBoss && b.phase === 1);
    if ((floor >= 2 || deep(6)) && arcaneWard) {
      const baseA = Math.random() * Math.PI * 2;
      const wCount = floor >= 4 ? 3 : 2;
      for (let k = 0; k < wCount; k++) {
        let wx = null, wz = null;
        outer: for (const rad of [7, 9, 11]) {
          for (let step = 0; step < 8; step++) {
            const a = baseA + (k / wCount) * Math.PI * 2 + step * (Math.PI / 4);
            const tx = b.pos.x + Math.cos(a) * rad, tz = b.pos.z + Math.sin(a) * rad;
            if (!isBlocked(tx, tz, 0.8)) { wx = tx; wz = tz; break outer; }
          }
        }
        if (wx === null) [wx, wz] = spawnPos(4);
        const w = new Totem(scene, wx, wz, { ward: b, hp: Math.round(40 * (1 + (floor - 1) * 0.35)) });
        w.spawnT = 0; w.maxHpEff = w.hp; enemies.push(w);
      }
      showBanner(`Phá ${wCount} pha lê hộ thể!`, `${b.name} bất tử khi pha lê còn đứng`, 2.4, '#b070ff');
    } else {
      fxRing(scene, b.pos, 6.5, 0xff4a3a, 0.5);
      addShake(0.8);
      b.timeMul = (b.timeMul || 1) + 0.12;
      if (typeof b.timer === 'number') b.timer = Math.min(b.timer, 0.35);
    }
    const mkList = [Minion, null, Healer, Wraith, FireImp, FrostDrake, GoblinRaider, VenomSpider, FrostGuard, Wraith, PyroMage];
    const mk = b.bossKind === 1 ? null : (mkList[b.bossKind ?? 0] || Minion);
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
  ctx.reactSurface = hazards.reactSurface;
  ctx.addFlame = addFlame;
  ctx.onReaction = (text, enemy, dmg) => {
    meta.stats.reactions = (meta.stats.reactions || 0) + 1;
    questProgress('react');
    if (enemy?.isBoss || enemies.some((x) => x.isBoss && x.alive)) addFlame(2.5);
    if (enemy) fireRunes(player, 'react', enemy.pos, player.aimDir(), Math.round((dmg || 18) * 1.1));
    progressAwakening(player, 'react');
  };
  ctx.onPerfect = () => {
    meta.stats.perfect = (meta.stats.perfect || 0) + 1;
    if (enemies.some((x) => x.isBoss && x.alive)) addFlame(2.5);
  };
  ctx.onPartBreak = (boss, part) => {
    meta.stats.partBreaks = (meta.stats.partBreaks || 0) + 1;
    addFlame(15);
    showBanner(`Đã Phá ${part.name}!`, part.core ? `Rơi ${BOSS_CORES[part.core]?.name}! Đem về Đe để rèn vũ khí Boss` : `${boss.name} bị suy yếu vĩnh viễn!`, 2.8, '#ffcf4a');
    if (part.core && BOSS_CORES[part.core]) {
      loot.spawnPickup('core', boss.pos.x + (Math.random() - 0.5) * 2, boss.pos.z + 1.5, BOSS_CORES[part.core]);
    }
    progressAwakening(player, 'stun');
  };
  ctx.onSpellBreak = (enemy) => {
    meta.stats.spellBreaks = (meta.stats.spellBreaks || 0) + 1;
    const rid = randomRune();
    if (Math.random() < 0.55) loot.spawnPickup('rune', enemy.pos.x, enemy.pos.z, RUNES[rid]);
    else loot.spawnPickup('scrap', enemy.pos.x, enemy.pos.z, 4);
  };
  ctx.onBloodGoldHit = (pos) => {
    const loss = Math.min(gold, Math.max(2, Math.floor(gold * 0.15)));
    if (loss <= 0) return;
    gold -= loss;
    const chunks = Math.min(5, Math.max(1, Math.ceil(loss / 4)));
    for (let i = 0; i < chunks; i++) loot.spawnPickup('gold', pos.x + (Math.random() - 0.5) * 2.4, pos.z + (Math.random() - 0.5) * 2.4, Math.ceil(loss / chunks));
    damageNumber(pos, `-${loss} Vàng!`, 'burn');
  };
  ctx.onAwaken = (w) => {
    meta.stats.awakens = (meta.stats.awakens || 0) + 1;
    renderSlots();
    showBanner('✦ Vũ Khí Thức Tỉnh!', `${weaponName(w)} · Mở khóa Tuyệt Kỹ: ${w.awakening?.ultName}`, 3.0, '#ffe8a0');
    toast('x_energy-sword', 'Vũ Khí Thức Tỉnh!', `${weaponName(w)} → ${w.awakening?.ultName}`);
  };
  flameState.onBanner = (a, b, sec, col) => showBanner(a, b, sec, col);
  flameState.onCurseAdded = () => { player.recalc(); renderFlameHud(); };
  flameState.onChange = () => renderFlameHud();

  loot = new Loot(scene);
  rewards = new Rewards(scene);
  objectives = new RoomObjectiveManager(scene);
  echoMgr = new EchoManager(scene);
  companions = new CompanionManager(scene);
  sandbox = new SandboxManager(scene);
  defense = new DefenseManager(scene);
  initForgeUI({
    player, scene, setMode, toast, addScrap,
    getScrap: () => scrap,
    getRuneBag: () => runeBag,
    takeRuneFromBag: (i) => runeBag.splice(i, 1)[0],
    returnRuneToBag: (id) => runeBag.push(id),
    getBossCores: () => bossCores,
    consumeBossCore: (i) => bossCores.splice(i, 1)[0],
    canForge: () => !!loot.anvil && !loot.anvil.used && (loot.anvilUses ?? 1) > 0,
    getEnhanceCost: (w) => Math.max(1, Math.round(enhanceCost(w) * (1 - 0.1 * vil('smith')))),
    dynCurseName: (id) => dynCurseById(id)?.name || id,
    refreshHud: () => { renderSlots(); renderFlameHud(); $('scrap').textContent = scrap; },
    performAnvilForge,
  });
  ctx.enemies = enemies;
  player.onWeaponsChanged = renderSlots;
  restart();
  camera.position.set(-1.55, 4.45, 9.0);
  camLook.set(-1.45, 1.05, -0.2);
  camera.lookAt(camLook);
  darkLight = new THREE.PointLight(0xffd8a0, 0, 18, 1.35);
  scene.add(darkLight);
  setDarkHook((k) => { darkLight.intensity = typeof k === 'number' ? k * 22 : k ? 22 : 0; });
  syncMenuStage();

  hud.startBest.textContent = best ? `Kỷ lục: đợt ${best}` : 'Chưa có kỷ lục';
  renderDaily();
  for (const el of document.querySelectorAll('.overlay')) el.addEventListener('mousedown', (e) => e.stopPropagation());
  if ($('btn-credits')) {
    $('btn-credits').onclick = (e) => {
      e.stopPropagation();
      $('btn-credits').closest('.credits-wrap')?.classList.toggle('open');
    };
    $('start')?.addEventListener('click', (e) => {
      if (!e.target.closest('.credits-wrap')) document.querySelector('.credits-wrap')?.classList.remove('open');
    });
  }
  $('btn-play').onclick = () => { renderPrep(); show('prep', true); play('uiOpen'); };
  if ($('btn-continue')) $('btn-continue').onclick = () => continueSavedRun();
  syncContinueBtn();
  $('btn-go').onclick = () => startGame();
  $('btn-daily').onclick = () => startGame({ daily: true });
  $('btn-bossrush').onclick = () => startGame({ bossrush: true });
  $('btn-defense').onclick = () => startGame({ defense: true });
  $('btn-sandbox').onclick = () => startGame({ sandbox: true });
  $('btn-coop').onclick = () => startGame({ coop: true });
  $('btn-howto').onclick = () => { show('howto', true); play('uiOpen'); };
  $('btn-howto2').onclick = () => { show('howto', true); play('uiOpen'); };
  $('btn-ach').onclick = () => { renderAchievements(); show('achievements', true); play('uiOpen'); };
  $('btn-codex').onclick = () => { renderCodex(); show('codex', true); play('uiOpen'); };
  $('btn-bestiary').onclick = () => { renderBestiary('mobs'); show('bestiary', true); play('uiOpen'); };
  $('best-tab-mobs').onclick = () => { play('uiClick'); renderBestiary('mobs'); };
  $('best-tab-bosses').onclick = () => { play('uiClick'); renderBestiary('bosses'); };
  $('btn-save').onclick = () => openSaveModal();
  $('btn-save-copy').onclick = async () => {
    const ta = $('save-code'), msg = $('save-msg');
    if (!ta) return;
    ta.value = exportSaveCode();
    ta.select();
    try { await navigator.clipboard.writeText(ta.value); } catch {}
    if (msg) { msg.textContent = '✔ Đã sao chép mã lưu vào bộ nhớ tạm!'; msg.classList.remove('err'); }
    play('uiConfirm');
  };
  $('btn-save-import').onclick = () => {
    const ta = $('save-code'), msg = $('save-msg');
    const res = importSaveCode(ta?.value || '');
    if (res.ok) {
      meta = loadMeta();
      meta.bestiary = meta.bestiary || {};
      best = Number(localStorage.getItem('lorenh_best') || 0);
      updateMenuSouls();
      renderDaily();
      hud.startBest.textContent = best ? `Kỷ lục: đợt ${best}` : 'Chưa có kỷ lục';
      if (msg) { msg.textContent = '✔ Nạp dữ liệu thành công! Toàn bộ tiến trình đã được cập nhật.'; msg.classList.remove('err'); }
      play('forged');
    } else {
      if (msg) { msg.textContent = '✕ ' + (res.err || res.error || 'Mã không hợp lệ'); msg.classList.add('err'); }
      play('uiBack');
    }
  };
  $('btn-endless').onclick = () => {
    run.endless = true;
    show('victory', false);
    setMode('playing');
    play('forged');
    autoSaveRun();
    showBanner('Chế Độ Vô Tận Đã Mở!', 'Tới nắp hầm giữa phòng (E) để chinh phục Tầng 6+!', 3.0, '#7fd8ff');
  };
  $('btn-vic-menu').onclick = () => { show('victory', false); toMenu(); };
  // Bảng điều khiển nhanh Phòng Tập Lò Rèn
  if ($('sandbox-bar')) {
    $('sandbox-bar').addEventListener('mousedown', (e) => e.stopPropagation());
    $('sandbox-bar').addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  if ($('sb-wtype')) {
    $('sb-wtype').innerHTML = Object.entries(TYPES).map(([id, t]) => `<option value="${id}">${t.name}</option>`).join('');
  }
  if ($('sb-welem')) {
    $('sb-welem').innerHTML = Object.entries(ELEMENTS).map(([id, el]) => `<option value="${id}">${el.name}</option>`).join('');
    $('sb-welem').value = 'fire';
  }
  if ($('sb-equip')) $('sb-equip').onclick = () => {
    if (!sandbox?.active) return;
    sandbox.switchWeapon(player, $('sb-wtype').value, $('sb-welem').value);
    renderSlots();
    play('pickup');
  };
  if ($('sb-reset')) $('sb-reset').onclick = () => { sandbox?.resetDps(); play('uiClick'); };
  if ($('sb-spawn-lancer')) $('sb-spawn-lancer').onclick = () => {
    if (!sandbox?.active) return;
    const e = new Lancer(scene, -6, -6); e.spawnT = 0; addEnemy(e); ctx.enemies = enemies; play('waveStart', { vol: 0.6 });
  };
  if ($('sb-spawn-pyro')) $('sb-spawn-pyro').onclick = () => {
    if (!sandbox?.active) return;
    const e = new PyroMage(scene, 6, -6); e.spawnT = 0; addEnemy(e); ctx.enemies = enemies; play('waveStart', { vol: 0.6 });
  };
  if ($('sb-rage')) $('sb-rage').onclick = () => { player.rage = 100; play('forged', { vol: 0.5 }); };
  // Đăng ký PWA Service Worker (chỉ bật ở bản build sản phẩm; trong dev tự gỡ SW cũ để tránh kẹt asset)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
  }
  $('btn-shop-leave').onclick = () => { leaveShopPanel(); leaveShop(); };
  $('btn-shop-close').onclick = () => leaveShopPanel();
  for (const btn of document.querySelectorAll('[data-close]')) btn.onclick = () => { show(btn.dataset.close, false); play('uiBack'); if (btn.dataset.close === 'floormap') setMode('playing'); };
  for (const btn of document.querySelectorAll('.btn')) {
    btn.addEventListener('mouseenter', () => play('uiHover'));
    btn.addEventListener('click', () => { if (btn.id !== 'btn-go' && btn.id !== 'btn-daily') play('uiClick'); });
  }
  const unlock = () => { unlockAudio(); unlockMusic(); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  for (const s of document.querySelectorAll('.vol-slider')) {
    if (s.id === 'bgm-slider') continue;
    s.oninput = () => { setVolume(s.value / 100); if (isMuted()) setMuted(false); syncSoundUI(); };
  }
  if ($('bgm-slider')) $('bgm-slider').oninput = (e) => {
    setMusicVolume(Number(e.target.value) / 100);
    if (isMuted()) setMuted(false);
    syncSoundUI();
  };
  for (const b of document.querySelectorAll('.mute-btn')) b.onclick = toggleMute;
  syncSoundUI();
  $('btn-resume').onclick = () => setPaused(false);
  $('btn-restart').onclick = () => restart();
  $('btn-again').onclick = () => restart();
  $('btn-menu').onclick = toMenu;
  $('btn-menu2').onclick = () => { setPaused(false); toMenu(); };
  $('btn-forge').onclick = () => { renderForge(); show('forge', true); play('uiOpen'); };
  updateMenuSouls();
  portraitPhone.addEventListener('change', () => {
    resetTouch();
    if (portraitPhone.matches && started && !paused && !choosing && !player.dead && !inShopOpen()) setPaused(true);
  });
  addEventListener('blur', () => { if (started && !player.dead && !choosing && !inShopOpen()) setPaused(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !player.dead && !choosing && !inShopOpen()) setPaused(true);
  });
  addEventListener('gamepadconnected', () => toast('x_gamepad', 'Đã kết nối tay cầm', 'Cần trái di chuyển · cần phải ngắm · RT đánh · LT kỹ năng · A lướt'));
  hud.start.classList.remove('loading');
  setMode('menu');

  window.__game = {
    player, scene, camera, renderer, mouse, pad, loot, rewards, startGame, continueSavedRun, autoSaveRun, combat, weapons: weaponsMod, setPaused, meta,
    hazards, echoMgr, companions, sandbox, defense, flameState, RUNES, BOSS_CORES,
    addFlame, addCorruption, purgeCurse, openAnvilModal, closeAnvilModal, openTrialRoom, pickRune, pickCore,
    showVictory, exportSaveCode, importSaveCode,
    get runDmg() { return runDmg; },
    get enemies() { return enemies; },
    get wave() { return wave; },
    get floor() { return floor; },
    get gold() { return gold; },
    get scrap() { return scrap; },
    get runeBag() { return runeBag; },
    get bossCores() { return bossCores; },
    get floorMap() { return floorMap; },
    get choosingReward() { return choosingReward; },
    spawnBoss(kind = 0) {
      const list = createBosses(kind, 1);
      for (const b of list) { b.spawnT = 0; b.phases = [0.5]; b.bossKind = kind; addEnemy(b); }
      ctx.enemies = enemies;
      return list.length === 1 ? list[0] : list;
    },
    spawn(name, x = 0, z = -5) {
      const C = {
        Minion, Assassin, Archer, Mage, Healer, ShieldBearer, Bomber, Wraith, Armored, Burrower, Totem,
        PyroMage, FrostGuard, Lancer, Necromancer, Berserker,
        OrcBrute, GoblinRaider, FireImp, FrostDrake, AcidGlub, VenomSpider, GiantWasp, Viper, StoneCrab,
      }[name];
      const e = C ? new C(scene, x, z) : new Slime(scene, x, z, name);
      e.spawnT = 0; addEnemy(e); ctx.enemies = enemies; return e;
    },
    spawnEcho() {
      const snap = { id: 'echo_test', floor, charId: 'knight', weapon: { type: 'greatsword', element: 'fire', element2: 'lightning', rarity: 2, affixes: ['crit'], plus: 2, title: 'Đại Kiếm Hồn Cũ' }, wName: 'Đại Kiếm Hồn Cũ' };
      const fe = new FallenEcho(scene, 0, -5, snap, floor);
      fe.spawnT = 0; enemies.push(fe); ctx.enemies = enemies; return fe;
    },
    grantRelic, chooseReward, openShopRoom, descend, addGold, addScrap,
    step(n = 1, render = false) { for (let i = 0; i < n; i++) update(1 / 60, render || i === n - 1); },
    set god(v) { player.god = v; },
  };
  requestAnimationFrame(tick);
}

init();

// ================= Môi trường thành vũ khí =================
// Quái bị hất văng: rơi xuống vực (chết ngay), đập tường/cột (choáng + sát thương)
function envImpact(e, speed) {
  const dir = e.knock.lengthSq() > 0.0001 ? e.knock.clone().normalize() : null;
  if (!dir) return;
  const probe = (k) => ({ x: e.pos.x + dir.x * (e.radius + k), z: e.pos.z + dir.z * (e.radius + k) });
  const p = probe(0.45);
  if (!e.isBoss && !e.miniBoss && isPit(p.x, p.z, 0.05)) {
    damageNumber(e.pos, 'Rơi xuống vực!', 'react shatter');
    smoke(e.pos.clone().setY(0.3), { count: 6, color: 0x2a2420, size: 1, life: 0.9, alpha: 0.6 });
    play('slimeLand', { at: e.pos, rate: 0.6, vol: 1.5 });
    meta.stats.pitKills = (meta.stats.pitKills || 0) + 1;
    questProgress('env');
    e.takeHit(e.hp + 9999, null, 0, false);
    return;
  }
  if (speed > 7 && !(e.slamCd > performance.now()) && isBlocked(p.x, p.z, 0) && !isPit(p.x, p.z)) {
    e.slamCd = performance.now() + 700;
    e.knock.set(0, 0, 0);
    const dmg = Math.round((e.maxHpEff || e.maxHp || e.hp) * (e.isBoss ? 0.02 : 0.12) + 6);
    damageNumber(e.pos, 'Đập Tường!', 'react stun');
    questProgress('env');
    e.takeHit(dmg, null, 0, true);
    if (!e.isBoss) e.stunT = Math.max(e.stunT, 1.2); else e.poise += dmg * 2;
    addShake(0.3); play('hitHeavy', { at: e.pos, rate: 1.2 });
    burst(new THREE.Vector3(p.x, 1, p.z), 0x8a7a6a, 14, { speed: 6, size: 0.2 });
  }
}

// ================= Phòng sự kiện =================
let hitThisWave = false;
let bossBane = 0;            // +% sát thương lên boss tầng hiện tại (Thầy Bói)
let extraDmgCurse = 0;       // quái gây thêm sát thương (Cướp túi)
function eventApi() {
  return {
    player, gold: () => gold, addGold, addSouls, addScrap, grantRelic, rand: Math.random,
    addFlame, addCorruption: (v) => addCorruption(v, player.pos, scene), purgeCurse: () => purgeCurse(player.pos, scene),
    grantRune: () => pickRune(randomRune()),
    heal: (pct) => player.heal(Math.round(player.maxHp * pct)),
    levelUp: () => { pendingLevels++; },
    banner: (a, b) => showBanner(a, b, 2, '#9fd0ff'),
    curseDmg: (v) => { extraDmgCurse += v; },
    bossBane: () => { bossBane = 0.2; },
    refresh: () => { renderSlots(); },
    addAffix: () => { const w = player.weapon; const add = rollAffixes(1, w.affixes || []); w.affixes = [...(w.affixes || []), ...add]; player.recalc(); renderSlots(); showBanner(weaponName(w), 'Thêm phụ tố: ' + affixText({ affixes: add }).join(', '), 2, '#ffcf4a'); },
  };
}
function openEventRoom() {
  const ev = EVENTS_ROOM[Math.floor(Math.random() * EVENTS_ROOM.length)];
  const g = eventApi();
  $('ev-title').textContent = ev.title;
  $('ev-text').textContent = ev.text;
  $('ev-icon').style.setProperty('--i', `url('/ui/icons/${ev.icon}.svg')`);
  $('ev-choices').innerHTML = ev.choices.map((c, i) => `<button class="btn ev-choice" data-i="${i}" ${c.can && !c.can(g) ? 'disabled' : ''}><b>${c.text}</b><small>${c.sub}</small></button>`).join('');
  for (const b of $('ev-choices').querySelectorAll('button')) b.onclick = () => {
    const c = ev.choices[+b.dataset.i];
    show('eventroom', false); setMode('playing');
    play('uiConfirm');
    c.run(g);
    player.hp = Math.max(1, player.hp);
    if (pendingLevels > 0 && !choosing) openLevelUp();
    intermission = 2.5;
  };
  show('eventroom', true); setMode('menu'); play('uiOpen');
  intermission = Infinity;
}

// ================= Nhiệm vụ trong tầng =================
let quest = null;
function newQuest() {
  const q = QUESTS[Math.floor(Math.random() * QUESTS.length)];
  quest = { ...q, n: 0, done: false };
  renderQuest();
}
function questProgress(id, k = 1) {
  if (!quest || quest.done || quest.id !== id) return;
  quest.n = Math.min(quest.goal, quest.n + k);
  if (quest.n >= quest.goal) {
    quest.done = true;
    addGold(50); addSouls(15);
    rewards.spawnChest(player.pos.x + 1.5, player.pos.z);
    showBanner('Hoàn thành nhiệm vụ!', `${quest.text} · +50 vàng · +15 Hồn Thép · rương di vật`, 2.6, '#7fff9a');
    play('forged');
  }
  renderQuest();
}
function renderQuest() {
  const el = $('quest-chip');
  if (!quest || !started) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.classList.toggle('done', quest.done);
  el.innerHTML = `<i class="ico" style="--i:url('/ui/icons/x_scroll.svg')"></i>${quest.done ? '✔ ' : ''}${quest.text} (${quest.n}/${quest.goal})`;
}

// ================= Thần Hộ Mệnh =================
const luTitle = document.getElementById('lu-title')?.innerHTML || '';
function openPatron() {
  if (!started || player.dead) return;
  if (choosing || inShopOpen()) { setTimeout(openPatron, 800); return; }
  const pool = [...GODS].sort(() => Math.random() - 0.5).slice(0, 3);
  perkChoices = pool.map((g) => ({
    id: 'god_' + g.id, name: g.name, icon: g.icon, color: g.color, max: 99, godPick: true,
    desc: () => g.desc + (player.patron === g.id ? ' (đang thờ)' : ''),
    apply: (s, lv, p) => {
      p.patron = g.id;
      const free = BOONS.filter((b) => b.god === g.id && !p.perkLv[b.id]);
      const b = free[Math.floor(Math.random() * free.length)];
      if (b) { p.perkLv[b.id] = 1; b.apply(p.base, 1, p); toast(b.icon, `${g.name}: ${b.name}`, b.desc(1)); }
      if (vil('shrine') >= 2 || (vil('shrine') >= 1 && floor === 1)) {
        const more = BOONS.filter((x) => x.god === g.id && !p.perkLv[x.id]);
        const b2 = more[Math.floor(Math.random() * more.length)];
        if (b2) { p.perkLv[b2.id] = 1; b2.apply(p.base, 1, p); setTimeout(() => toast(b2.icon, `Đền Thần: ${b2.name}`, b2.desc(1)), 600); }
      }
    },
  }));
  choosing = true;
  $('lu-title').innerHTML = 'Chọn <b>Thần Hộ Mệnh</b>';
  $('lu-cards').innerHTML = perkChoices.map((p, i) => `<button class="card god" data-i="${i}">
      <span class="keycap">${i + 1}</span>
      <i class="ico card-ico" style="--i:url('/ui/icons/${p.icon}.svg');color:${p.color}"></i>
      <h3 style="color:${p.color}">${p.name}</h3>
      <div class="lv"><span class="godtag" style="color:${p.color}">Thần Hộ Mệnh</span></div>
      <p>${p.desc()}</p></button>`).join('');
  for (const b of $('lu-cards').querySelectorAll('.card')) { b.onclick = () => pickPerk(Number(b.dataset.i)); b.onmouseenter = () => play('uiHover'); }
  show('levelup', true); setMode('menu'); play('forged');
}

// ================= Ngọc =================
function pickGem(kind) {
  const G = weaponsMod.GEMS[kind];
  const target = player.weapons.find((w) => (w.gems || []).length < weaponsMod.socketsOf(w));
  play('dropRare', { vol: 0.6 });
  if (!target) { addScrap(6); toast('x_sword-break', 'Không còn ô khảm', `${G.name} đổi thành 6 Mảnh Thép`); return; }
  target.gems = [...(target.gems || []), kind];
  player.recalc(); renderSlots();
  toast('x_crystal-ball', `Khảm ${G.name}`, `${weaponName(target)}: ${G.text}`);
}

// ================= Độ thuần thục =================
function masteryLv(k) { return Math.min(5, Math.floor(Math.sqrt(k / 25))); }

// ================= Độ bền: đứng cạnh đe thì vũ khí được sửa =================
function repairAtAnvil() {
  let fixed = false;
  for (const w of player.weapons) if ((w.dur ?? 100) < 100) { w.dur = 100; w.warnedBroken = false; fixed = true; }
  if (fixed) { renderSlots(); toast('anvil', 'Đã sửa vũ khí', 'Độ bền hồi về 100%'); play('hammer', { rate: 1.1, vol: 0.6 }); }
  return fixed;
}

// ================= Phòng bí mật =================
function maybeSecret() {
  if (Math.random() > 0.45) return;
  hazards.placeSecretWall(Math.random, (pos) => {
    const inward = new THREE.Vector3(-pos.x, 0, -pos.z).normalize().multiplyScalar(2.5);
    const at = pos.clone().add(inward);
    rewards.spawnChest(at.x, at.z);
    for (let i = 0; i < 8; i++) loot.spawnPickup('gold', at.x, at.z, 5);
    if (Math.random() < 0.5) loot.spawnPickup('gem', at.x, at.z, ['ruby', 'sapphire', 'emerald', 'topaz'][Math.floor(Math.random() * 4)]);
    showBanner('Phòng bí mật!', 'Rương di vật và vàng sau bức tường nứt', 2.4, '#ffd060');
    meta.stats.secrets = (meta.stats.secrets || 0) + 1;
  });
}

// ================= Bản đồ tầng (phím Tab) =================
let floorMap = null;
function toggleMap(force) {
  const open = force ?? $('floormap').classList.contains('hidden');
  if (open) {
    const step = enemies.length || !choosingReward ? Math.min(3, (wave - 1) % 5 + (enemies.length ? 0 : 1)) : (wave - 1) % 5;
    $('fm-title').textContent = `Bản đồ tầng ${floor}`;
    $('fm-body').innerHTML = renderMap(floorMap, choosingReward ? (wave - 1) % 5 : step);
    play('uiOpen');
  } else play('uiClose');
  show('floormap', open);
  setMode(open ? 'menu' : 'playing');
}
addEventListener('keydown', (ev) => { if (ev.code === 'Tab') ev.preventDefault(); });

// ================= Làng Thợ Rèn =================
function vil(id) { return (meta.village || {})[id] || 0; }
function renderVillage() {
  $('vil-souls').textContent = meta.souls;
  $('vil-list').innerHTML = BUILDINGS.map((b) => {
    const lv = vil(b.id), maxed = lv >= b.max, cost = maxed ? 0 : b.cost(lv);
    return `<div class="vil${lv ? ' built' : ''}"><div class="top"><i class="ico" style="--i:url('/ui/icons/${b.icon}.svg')"></i><div><h4>${b.name}</h4><div class="lv">${lv ? `Cấp ${lv} / ${b.max}` : 'Đổ nát'}</div></div></div>
      <p>${lv ? b.desc(lv) : 'Xây để: ' + b.next(0)}</p>
      ${maxed ? '<span class="muted small">Đã hoàn thiện</span>' : `<button class="btn" data-b="${b.id}" ${meta.souls < cost ? 'disabled' : ''}>${lv ? 'Nâng cấp' : 'Xây'} · ${cost} <i class="ico ico-soul"></i></button>`}</div>`;
  }).join('');
  for (const btn of $('vil-list').querySelectorAll('button[data-b]')) btn.onclick = () => {
    const b = BUILDINGS.find((x) => x.id === btn.dataset.b), lv = vil(b.id), cost = b.cost(lv);
    if (meta.souls < cost) return;
    meta.souls -= cost;
    meta.village = meta.village || {};
    meta.village[b.id] = lv + 1;
    saveMeta(meta); updateMenuSouls();
    play('forged'); renderVillage();
  };
  $('btn-journal').style.display = vil('library') ? '' : 'none';
}

// ================= Bảng xếp hạng =================
function renderBoard() {
  const list = loadBoard();
  const name = (id) => charById(id)?.name || id;
  $('board-list').innerHTML = list.length ? list.map((r, i) => `<div class="board-row"><b>${i + 1}</b><span>${name(r.char)} · Tầng ${r.floor} · Đợt ${r.wave}${r.depth ? ' · Bậc ' + r.depth : ''}${r.mode ? ' · ' + r.mode : ''}<br><small class="muted">${r.kills} quái · ${r.date || ''}</small></span><span class="muted small">${r.boss ? 'Hạ boss' : ''}</span><span class="sc">${r.score}</span></div>`).join('')
    : '<p class="muted">Chưa có lượt chơi nào.</p>';
}

// ================= Cốt truyện =================
let storyQueue = [], storyLine = 0;
function playStory(all = false) {
  const info = { deaths: meta.stats.deaths || 0 };
  meta.storySeen = meta.storySeen || {};
  storyQueue = all ? unlockedStory(meta, info) : unlockedStory(meta, info).filter((s) => !meta.storySeen[s.id]);
  if (!storyQueue.length) return false;
  storyLine = 0;
  showStoryLine();
  show('story', true);
  return true;
}
function showStoryLine() {
  const s = storyQueue[0];
  $('st-chapter').textContent = 'Chương ' + (STORY.indexOf(s) + 1) + ' · ' + s.title;
  $('st-who').textContent = s.who;
  $('st-line').textContent = s.lines[storyLine];
  $('st-next').textContent = storyLine < s.lines.length - 1 || storyQueue.length > 1 ? 'Tiếp' : 'Đóng';
}
function nextStory() {
  const s = storyQueue[0];
  play('uiClick');
  if (storyLine < s.lines.length - 1) { storyLine++; showStoryLine(); return; }
  meta.storySeen[s.id] = true; saveMeta(meta);
  storyQueue.shift(); storyLine = 0;
  if (storyQueue.length) showStoryLine(); else show('story', false);
}
document.getElementById('st-next').onclick = nextStory;
document.getElementById('btn-village').onclick = () => { renderVillage(); show('village', true); play('uiOpen'); };
document.getElementById('btn-board').onclick = () => { renderBoard(); show('board', true); play('uiOpen'); };
document.getElementById('btn-journal').onclick = () => { show('village', false); playStory(true); };
setTimeout(() => { if (!started) playStory(); }, 2500);

// ================= Chơi 2 người (P2 dùng tay cầm) =================
let player2 = null;
let reviveT = 0;
function setupP2() {
  if (player2) { scene.remove(player2.root); player2 = null; }
  ctx.players = [player];
  show('p2hud', false);
  if (!run.coop) return;
  player2 = new Player(scene);
  player2.setCharacter(run.char === 'barbarian' ? 'knight' : 'barbarian');
  player2.reset();
  player2.masteryOf = player.masteryOf;
  player2.god = player.god;
  ctx.players = [player, player2];
  show('p2hud', true);
  setTimeout(() => { player2.pos.copy(player.pos).add(new THREE.Vector3(2, 0, 0)); }, 0);
  if (!coop.p2.connected) toast('x_gamepad', 'Chơi 2 người', 'Cắm tay cầm cho người chơi 2 (cần trái đi, cần phải ngắm, RT đánh, LT kỹ năng, A lướt)');
}
// Quái nhắm người chơi còn sống gần nhất (hoặc Lò Lửa Trung Tâm trong chế độ Thủ Thành)
function targetFor(e) {
  if (defense?.active) return defense.targetFor(e, player);
  if (!player2 || player2.dead) return player;
  if (player.dead) return player2;
  return e.pos.distanceTo(player.pos) <= e.pos.distanceTo(player2.pos) ? player : player2;
}
// Cập nhật P2: tạm thay trạng thái bàn phím/chuột/tay cầm dùng chung bằng tay cầm của P2
function updateP2(dt, time) {
  const q = coop.p2;
  const sk = [...keys], sp = [...pressed], sm = { ...mouse }, spad = { ...pad, move: { ...pad.move } }, st = { ...touchIn, move: { ...touchIn.move } };
  keys.clear(); pressed.clear();
  for (const k of q.pressed) pressed.add(k);
  Object.assign(mouse, { down: false, clicked: q.clicked, rdown: q.special, rclicked: q.rclicked, rreleased: q.rreleased });
  Object.assign(pad, { active: true, move: { ...q.move }, aim: q.aim, attack: q.attack, special: q.special });
  Object.assign(touchIn, { active: false, attack: false, special: false, aim: null });
  const a2 = player2.pos.clone().add(new THREE.Vector3(q.aim?.x || Math.sin(player2.facing), 0, q.aim?.z || Math.cos(player2.facing)).multiplyScalar(5));
  const ctxP = ctx.player;
  ctx.player = player2;
  try { player2.update(dt, a2, enemies, time); } finally {
    ctx.player = ctxP;
    keys.clear(); for (const k of sk) keys.add(k);
    pressed.clear(); for (const k of sp) pressed.add(k);
    Object.assign(mouse, sm); Object.assign(pad, spad); Object.assign(touchIn, st);
  }
  // Hồi sinh đồng đội: đứng cạnh 2 giây
  const down = player.dead ? player : player2.dead ? player2 : null;
  const up = down === player ? player2 : player;
  if (down && !up.dead && up.pos.distanceTo(down.pos) < 2) {
    reviveT += dt;
    if (reviveT > 2) {
      reviveT = 0;
      down.dead = false; down.hp = Math.round(down.maxHp * 0.35); down.iframes = 2;
      down.anim?.play('Idle', { fade: 0.2 });
      showBanner('Hồi sinh!', 'Đồng đội đã đứng dậy', 1.6, '#7fff9a'); play('forged');
    }
  } else reviveT = 0;
  // HUD P2
  $('p2-fill').style.width = Math.max(0, player2.hp / player2.maxHp * 100) + '%';
  $('p2-text').textContent = player2.dead ? (reviveT > 0 ? `Đang hồi sinh ${Math.round(reviveT / 2 * 100)}%` : 'Gục ngã · đứng cạnh để hồi sinh') : `${Math.ceil(player2.hp)} / ${player2.maxHp}`;
  $('p2hud').classList.toggle('down', player2.dead);
  if (player.dead && !player2.dead) hud.prompt.innerHTML = reviveT > 0 ? `Đang được hồi sinh ${Math.round(reviveT / 2 * 100)}%` : 'Bạn đã gục ngã · chờ đồng đội tới hồi sinh';
}


// ================= 8 Cơ chế phức tạp: Hàm hỗ trợ & Kết nối UI =================
function renderFlameHud() {
  const ff = $('flame-fill'), fv = $('flame-val'), cf = $('corr-fill'), cv = $('corr-val'), dc = $('dyn-curses');
  const fInt = Math.round(flameState.flame);
  if (fInt !== _lastFlameInt) {
    _lastFlameInt = fInt;
    if (ff) ff.style.width = fInt + '%';
    if (fv) fv.textContent = fInt;
    if (ff?.parentElement) ff.parentElement.classList.toggle('ember', flameTier() === 'ember');
  }
  const cInt = Math.round(flameState.corruption);
  if (cInt !== _lastCorrInt) {
    _lastCorrInt = cInt;
    if (cf) cf.style.width = cInt + '%';
    if (cv) cv.textContent = cInt;
  }
  const hideCorr = !!fxSettings.compactHud && cInt <= 0 && flameState.curses.length === 0;
  $('corr-item')?.classList?.toggle('hidden', hideCorr);
  $('fc-row')?.classList?.toggle('single', hideCorr);
  $('flame-item')?.classList?.toggle('calm', !!fxSettings.compactHud && fInt > 50 && flameTier() !== 'ember');
  if (dc) {
    const dcHtml = flameState.curses.map((id) => {
      const c = dynCurseById(id);
      return c ? `<div class="dyn-curse-ico" title="${c.name}: ${c.desc}"><i class="ico" style="--i:url('/ui/icons/${c.icon}.svg')"></i></div>` : '';
    }).join('');
    if (dcHtml !== _lastDynCursesHtml) { _lastDynCursesHtml = dcHtml; dc.innerHTML = dcHtml; }
  }
}

function pickRune(id) {
  const r = RUNES[id];
  if (!r) return;
  play('dropRare', { vol: 0.65 });
  // Tự động gắn vào ô Cổ Ngữ trống trên vũ khí đang cầm (hoặc cất vào Túi Cổ Ngữ để tự sắp xếp tại Đe)
  const w = player.weapon;
  w.runes = w.runes || [];
  if (w.runes.length < weaponsMod.socketsOf(w)) {
    w.runes.push(id);
    renderSlots();
    toast(r.icon, `Khảm ${r.name}`, r.desc);
  } else {
    runeBag.push(id);
    toast(r.icon, `Nhặt ${r.name}`, `Túi Cổ Ngữ (${runeBag.length}) · Đe Rèn`);
  }
}

function pickCore(id) {
  const c = BOSS_CORES[id];
  if (!c) return;
  bossCores.push(id);
  play('forged');
  toast(c.icon, `Thu được ${c.name}!`, `Mang tới Đe Rèn (E) để rèn ${c.title}`);
}

function performAnvilForge(result, opts = {}) {
  if (opts.consumeUse !== false && loot.anvil) {
    loot.anvilUses = (loot.anvilUses || 1) - 1;
  }
  const keep = (loot.anvilUses || 0) > 0;
  const onDone = () => {
    const keepOther = opts.mode === 'core' && player.weapons.length > 1 ? [player.weapons[1 - player.slot]] : [];
    player.setWeapons([result, ...keepOther], 0);
    recordCodex(result);
    if (result.rarity === 3) meta.stats.legendary = (meta.stats.legendary || 0) + 1;
    if (opts.mode === 'graft' || opts.mode === 'twin') meta.stats.specialForges = (meta.stats.specialForges || 0) + 1;
    if (opts.recipe) setTimeout(() => toast('x_sword-stone', 'Công thức huyền thoại!', result.title + ': ' + result.legendText), 500);
    if (opts.bossCore) setTimeout(() => toast(opts.bossCore.icon, 'Rèn Thành Công Vũ Khí Boss!', result.title + ': ' + result.legendText), 500);
    const sub = opts.mode === 'graft' ? `Ghép Chiêu · ${SPECIALS[result.specialType]?.name}`
      : opts.mode === 'twin' ? `Song Dạng (${TYPES[result.type].name} ⇄ ${TYPES[result.altForm.type].name}) · Bấm Q biến hình!`
        : `${RARITY[result.rarity].name} · ${affixText(result).join(' · ') || 'đã rèn xong!'}`;
    showBanner(weaponName(result), sub, 2.8, RARITY[result.rarity].css);
    if (keep && loot.anvil) loot.anvil.used = false;
    checkAchievements();
  };
  if (loot.anvil) loot.startForge(onDone);
  else onDone();
}

// Phòng Song Tượng Thần (Trial of the Gods — cơ chế #7)
function openTrialRoom() {
  const [gA, gB] = pickTrialPair(rngFor(9));
  choosing = true;
  perkChoices = [gA, gB].map((g, idx) => {
    const other = idx === 0 ? gB : gA;
    return {
      id: 'trial_' + g.id, name: g.name, icon: g.icon, color: g.color, max: 99, godPick: true,
      desc: () => `Chọn ${g.name} · ${other.name} sẽ nổi giận (${GOD_WRATH[other.id].name}) trong đợt tới!`,
      apply: (s, lv, p) => {
        p.patron = g.id;
        const free = BOONS.filter((b) => b.god === g.id && !p.perkLv[b.id]);
        const b = free[Math.floor(Math.random() * free.length)];
        if (b) { p.perkLv[b.id] = 1; b.apply(p.base, 1, p); toast(b.icon, `${g.name}: ${b.name}`, b.desc(1)); }
        trialState = { chosenGod: g, spurnedGod: other, wrathState: { t: 2.0 } };
        intermission = 2.0;
      },
    };
  });
  $('lu-title').innerHTML = '<b>Song Tượng Thần</b> · Chọn 1 Thần';
  $('lu-cards').innerHTML = perkChoices.map((p, i) => `<button class="card god" data-i="${i}">
      <span class="keycap">${i + 1}</span>
      <i class="ico card-ico" style="--i:url('/ui/icons/${p.icon}.svg');color:${p.color}"></i>
      <h3 style="color:${p.color}">${p.name}</h3>
      <div class="lv"><span class="godtag" style="color:${p.color}">Tranh Chấp Thần Linh</span></div>
      <p>${p.desc()}</p></button>`).join('');
  for (const b of $('lu-cards').querySelectorAll('.card')) { b.onclick = () => pickPerk(Number(b.dataset.i)); b.onmouseenter = () => play('uiHover'); }
  show('levelup', true); setMode('menu'); play('forged');
  intermission = Infinity;
}

// Hộp thoại chọn Di Sản khi đánh bại Bóng Ma Thợ Rèn (cơ chế #8a)
function openEchoReward(echo) {
  const oldW = hydrateEchoWeapon(echo.weapon);
  $('ev-title').textContent = 'Di Sản Thợ Rèn';
  $('ev-text').textContent = `Linh hồn cũ tan biến, để lại thanh "${echo.wName}" từng đồng hành cùng bạn ở tầng ${echo.floor}. Bạn muốn đoạt lại nó hay hấp thụ tinh hoa vào vũ khí hiện tại?`;
  $('ev-icon').style.setProperty('--i', `url('/ui/icons/x_sword-stone.svg')`);
  const choices = [
    {
      text: `Đoạt Lại Hồn Khí (${weaponName(oldW)})`,
      sub: `${RARITY[oldW.rarity].name} · mang theo nguyên tố & phụ tố cũ`,
      run: () => {
        attachAwakening(oldW);
        const dropOld = player.pickUp(oldW);
        recordCodex(oldW);
        if (dropOld) loot.drop(dropOld, player.pos.x, player.pos.z + 1.4);
        renderSlots();
        showBanner('Đã Đoạt Lại Di Sản!', weaponName(oldW), 2.5, '#9fe8ff');
      },
    },
    {
      text: 'Rèn Nuốt Hồn vào vũ khí đang cầm',
      sub: 'Vũ khí hiện tại +1 cường hóa, thừa hưởng 1 nguyên tố/phụ tố của Bóng Ma',
      run: () => {
        const cur = player.weapon;
        cur.plus = Math.min(MAX_PLUS, (cur.plus || 0) + 1);
        if (oldW.element && oldW.element !== 'none') {
          if (cur.element === 'none') cur.element = oldW.element;
          else if (!cur.element2 && cur.element !== oldW.element) cur.element2 = oldW.element;
        }
        const extra = (oldW.affixes || []).find((a) => !(cur.affixes || []).includes(a));
        if (extra) cur.affixes = [...(cur.affixes || []), extra];
        player.equip(player.slot);
        renderSlots();
        showBanner('Đã Hấp Thụ Hồn Khí!', `${weaponName(cur)} mạnh lên rõ rệt`, 2.5, '#ffe2a0');
      },
    },
  ];
  $('ev-choices').innerHTML = choices.map((c, i) => `<button class="btn ev-choice" data-i="${i}"><b>${c.text}</b><small>${c.sub}</small></button>`).join('');
  for (const b of $('ev-choices').querySelectorAll('button')) {
    b.onclick = () => {
      show('eventroom', false); setMode('playing'); play('forged');
      choices[+b.dataset.i].run();
    };
  }
  show('eventroom', true); setMode('menu'); play('uiOpen');
}

function maybeSpawnEchoGrave() {
  if (!echoMgr || run.bossrush) return;
  const ec = findEchoForFloor(meta, floor);
  if (!ec) return;
  const [x, z] = spawnPos(5);
  echoMgr.spawnGrave(ec, x, z);
}
