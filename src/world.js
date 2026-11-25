import * as THREE from 'three';
import { models } from './models.js';
import { emit, F, rectLiquid, disposeLiquids, setFxBiome, glowSprite } from './fx.js';
import { buildDungeonFloor } from './floor_art.js';

// ================== Kích thước phòng (mở rộng 18x18: diện tích gấp 2.25 lần!) ==================
export const DS = 0.8;                       // tỉ lệ thu nhỏ bộ hầm ngục KayKit cho khớp nhân vật
const TILE = 4 * DS;                         // mỗi mảnh sàn/tường KayKit rộng 4m -> 3.2m
const N = 18;                                // phòng 18 x 18 mảnh (57.6m x 57.6m)
export let ROOM_HALF = (TILE * N) / 2;       // = 28.8
export let WALK_LIMIT = ROOM_HALF - 0.9;

// Vật cản: hình tròn (cột, thùng) và hình chữ nhật (tường thấp)
export const pillars = [];
export const boxes = [];

// Mỗi tầng một kiểu bố cục + màu đuốc (8 bố cục rộng rãi, nhiều góc chiến thuật)
const THEMES = [
  { name: 'Đại Sảnh Cột', torch: 0xff9a4a, layout: 'hall' },
  { name: 'Tường Đổ', torch: 0x7fb0ff, layout: 'ruins' },
  { name: 'Kho Hàng Cổ', torch: 0x8fe08a, layout: 'storage' },
  { name: 'Hầm Ngầm Chữ Thập', torch: 0xc08aff, layout: 'cross' },
  { name: 'Thánh Đường Vòng', torch: 0xff5a4a, layout: 'ring' },
  { name: 'Thánh Điện Đôi', torch: 0xffe070, layout: 'sanctuary' },
  { name: 'Mê Cung Tường Thấp', torch: 0x7fe8c8, layout: 'labyrinth' },
  { name: 'Lò Đúc Cổ Đại', torch: 0xff7030, layout: 'foundry' },
];
// Vùng chủ đề theo tầng: màu sàn/tường, ánh sáng, sương, hạt bay, đáy hố, bẫy riêng
export const BIOMES = [
  { id: 'stone', name: 'Hầm Đá', tint: 0xffffff, fog: 0x0b0908, sky: 0xa8b8e0, ground: 0x3a2a20, moon: 0xc8d4ff, torch: null, pit: 0x040303, pitGlow: 0 },
  { id: 'ice', name: 'Hang Băng', tint: 0xb4d4ff, fog: 0x081420, sky: 0xc8ecff, ground: 0x203850, moon: 0xd8f0ff, torch: 0x7fd0ff, pit: 0x0a3050, pitGlow: 0.5 },
  { id: 'lava', name: 'Lò Nham Thạch', tint: 0xa89088, fog: 0x140504, sky: 0xc8a090, ground: 0x2a0c06, moon: 0xffd0b0, torch: 0xff6a2a, pit: 0xff4a10, pitGlow: 2.2 },
  { id: 'crypt', name: 'Hầm Mộ', tint: 0xaab4a6, fog: 0x060a07, sky: 0xa8bcb0, ground: 0x1a201a, moon: 0xb0e0c0, torch: 0x6fe08a, pit: 0x0a1a0e, pitGlow: 0.3 },
  { id: 'swamp', name: 'Đầm Lầy Độc', tint: 0x8ec492, fog: 0x07120a, sky: 0x96d4a0, ground: 0x162414, moon: 0xaef0b0, torch: 0x8fe83a, pit: 0x1a3812, pitGlow: 0.7 },
  { id: 'sanctum', name: 'Thánh Điện Lôi', tint: 0xdcd4b8, fog: 0x0c0e18, sky: 0xd8e4ff, ground: 0x2a2838, moon: 0xffe8a0, torch: 0xffe14a, pit: 0x181c38, pitGlow: 0.9 },
];
// Hình dạng phòng cho lưới 18x18: các ô sàn [i0, i1, j0, j1] bị khoét thành hố/vực
const SHAPES = {
  square: [],
  L: [[12, 17, 0, 4]],
  bridge: [[0, 4, 6, 11], [13, 17, 6, 11]],
  twin: [[3, 5, 2, 4], [12, 14, 2, 4], [3, 5, 13, 15], [12, 14, 13, 15]],
  cross: [[0, 2, 0, 2], [15, 17, 0, 2], [0, 2, 15, 17], [15, 17, 15, 17]],
  island: [[3, 6, 3, 6], [11, 14, 3, 6], [3, 6, 11, 14], [11, 14, 11, 14]],
  chasm: [[5, 12, 5, 6], [5, 12, 11, 12]],
  arena8: [[0, 1, 0, 3], [0, 3, 0, 1], [16, 17, 0, 3], [14, 17, 0, 1], [0, 1, 14, 17], [16, 17, 14, 17]],
};
const SHAPE_NAMES = { square: '', L: 'Vực Gãy', bridge: 'Cầu Đá', twin: 'Bốn Hố', cross: 'Góc Sụp', island: 'Tứ Hải Đảo', chasm: 'Hẻm Vực Đôi', arena8: 'Đấu Trường Bát Giác' };
export function floorTheme(floor) {
  const t = THEMES[(floor - 1) % THEMES.length];
  const biome = BIOMES[(floor - 1) % BIOMES.length];
  const shapes = Object.keys(SHAPES);
  const shape = floor === 1 ? 'square' : shapes[(floor * 7 + 3) % shapes.length];
  return { ...t, biome, shape, torch: biome.torch ?? t.torch, name: `${biome.name} · ${t.name}${SHAPE_NAMES[shape] ? ' · ' + SHAPE_NAMES[shape] : ''}` };
}
export let currentBiome = BIOMES[0];
export const pits = [];       // hố: chặn người và quái, không chặn đạn
let pitRects = [];
const pitFx = [];
const inPit = (x, z, pad = 0) => pitRects.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
export function isPit(x, z, pad = 0) { return inPit(x, z, pad); }
const tintCache = new Map();
function tintObject(o, tint) {
  if (tint === 0xffffff) return;
  o.traverse((c) => {
    if (!c.isMesh) return;
    const key = c.material.uuid + ':' + tint;
    if (!tintCache.has(key)) { const m = c.material.clone(); m.color.multiply(new THREE.Color(tint)); tintCache.set(key, m); }
    c.material = tintCache.get(key);
  });
}

let worldGroup = null;
let ownedWorld = [];
let moon = null;
let hemi = null;
let darkHook = null;
let isDark = false;
const torches = [];
let staticLights = 0;
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function piece(name, x, z, rotY = 0, y = 0, s = DS) {
  const entry = models['dungeon/' + name];
  if (!entry) return null;
  if (!/^(floor_tile|wall|column|torch|banner)/.test(name) && inPit(x, z, 0.8)) return null;
  const o = entry.scene.clone(true);
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(...s);
  o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  if (!name.startsWith('torch') && !name.startsWith('banner')) tintObject(o, currentBiome.tint);
  worldGroup.add(o);
  return o;
}

function wallTorch(x, z, rotY, color, y = 2.1, light = true) {
  piece('torch_mounted', x, z, rotY, y);
  const out = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
  const flamePos = new THREE.Vector3(x + out.x * 0.42, y + 0.55, z + out.z * 0.42);
  let l = null;
  if (light && staticLights < 6) {
    staticLights++;
    l = new THREE.PointLight(color, 10, 11, 1.8);
    l.position.set(x + out.x * 0.6, y + 0.7, z + out.z * 0.6);
    worldGroup.add(l);
  } else {
    const g = glowSprite(color, 1.35);
    g.position.copy(flamePos);
    worldGroup.add(g);
  }
  torches.push({ light: l, base: 10, seed: rand() * 100, color, flame: flamePos });
}

// Đồ vật có va chạm tròn
function prop(name, x, z, r, rot = rand() * Math.PI * 2) {
  if (inPit(x, z, (r || 0) + 0.3)) return;
  piece(name, x, z, rot);
  if (r) pillars.push({ x, z, r });
}

// Tường thấp dài `len` mảnh, nằm ngang (theo x) hoặc dọc (theo z)
function lowWall(cx, cz, len, vertical) {
  if (inPit(cx, cz, 1)) return;
  for (let i = 0; i < len; i++) {
    const off = (i - (len - 1) / 2) * TILE;
    const x = vertical ? cx : cx + off, z = vertical ? cz + off : cz;
    piece(rand() < 0.3 ? 'wall_cracked' : 'wall', x, z, vertical ? Math.PI / 2 : 0, 0, [DS, DS * 0.3, DS]);
  }
  const half = (len * TILE) / 2;
  boxes.push(vertical ? { x: cx, z: cz, hx: 0.45, hz: half } : { x: cx, z: cz, hx: half, hz: 0.45 });
}

function bigPillar(x, z) {
  if (inPit(x, z, 1.2)) return;
  const mesh = piece('pillar_decorated', x, z, 0);
  pillars.push({ x, z, r: 1.0, destructible: true, hp: 2, mesh });
}

// ================== Bố cục bên trong phòng (tối ưu cho bản đồ rộng 57.6m x 57.6m) ==================
function buildLayout(layout) {
  if (layout === 'hall') {
    for (const x of [-12, 12]) for (const z of [-19, -7, 7, 19]) bigPillar(x, z);
    lowWall(0, -22, 3, false); lowWall(0, 22, 2, false);
    prop('barrel_large', -23, -23, 0.75); prop('barrel_small_stack', -21, -24, 0.5);
    prop('crates_stacked', 23, -23, 0.9); prop('box_stacked', 21, -24, 0.6);
    prop('keg_decorated', -24, 8, 0.6, Math.PI / 2); prop('trunk_large_A', 24, 6, 0.6, -Math.PI / 2);
  } else if (layout === 'ruins') {
    lowWall(-14, -12, 3, false); lowWall(14, 12, 3, false);
    lowWall(-13, 13, 3, true); lowWall(13, -13, 3, true);
    for (const [x, z] of [[0, -20], [0, 20], [-21, 0], [21, 0], [-6, -6], [6, 6]]) bigPillar(x, z);
    prop('rubble_large', -5, 7, 1.3); prop('rubble_large', 7, -5, 1.3);
    prop('barrel_large', -23, 22, 0.75); prop('crates_stacked', 23, -22, 0.9);
  } else if (layout === 'storage') {
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, -17], [0, 17]]) {
      prop('crates_stacked', x, z, 0.9); prop('box_large', x + 2.0, z + 0.5, 0.7); prop('barrel_small', x - 0.8, z + 2.0, 0.45);
    }
    for (const [x, z] of [[-9, 0], [9, 0], [0, -9], [0, 9]]) bigPillar(x, z);
    lowWall(-22, 0, 3, true); lowWall(22, 0, 3, true);
  } else if (layout === 'cross') {
    lowWall(0, -15, 3, true); lowWall(0, 15, 3, true);
    lowWall(-15, 0, 3, false); lowWall(15, 0, 3, false);
    for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10], [-20, -18], [20, 18]]) bigPillar(x, z);
    prop('rubble_large', -22, -21, 1.0); prop('barrel_large', 22, 21, 0.75);
  } else if (layout === 'sanctuary') {
    // Thánh Điện Đôi: hai hành lang cột dài + bệ trung tâm thoáng để đánh boss rộng
    for (const x of [-17, -9, 9, 17]) for (const z of [-15, 0, 15]) bigPillar(x, z);
    lowWall(0, -23, 4, false);
    prop('candle_triple', -4, -3, 0); prop('candle_triple', 4, -3, 0);
    prop('candle_triple', -4, 3, 0); prop('candle_triple', 4, 3, 0);
  } else if (layout === 'labyrinth') {
    // Mê Cung Tường Thấp: nhiều góc khuất để né đạn & đập quái vào tường
    lowWall(-14, -14, 3, false); lowWall(14, -14, 3, true);
    lowWall(-14, 14, 3, true); lowWall(14, 14, 3, false);
    lowWall(-6, -4, 2, true); lowWall(6, 4, 2, true);
    for (const [x, z] of [[0, -19], [0, 19], [-20, 0], [20, 0]]) bigPillar(x, z);
  } else if (layout === 'foundry') {
    // Lò Đúc Cổ Đại: vòng cột vuông rộng + nhiều vật cản phá được ở rìa
    for (const [x, z] of [[-14, -14], [0, -14], [14, -14], [-14, 0], [14, 0], [-14, 14], [0, 14], [14, 14]]) bigPillar(x, z);
    prop('crates_stacked', -23, -10, 0.9); prop('crates_stacked', 23, 10, 0.9);
    prop('keg_decorated', -23, 12, 0.6); prop('keg_decorated', 23, -12, 0.6);
  } else {
    // 'ring': vòng cột lớn quanh đấu trường rộng
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
      bigPillar(Math.cos(a) * 15.5, Math.sin(a) * 15.5);
    }
    prop('candle_triple', 0, -4, 0); prop('candle_triple', 0, 4, 0);
    prop('rubble_large', -22, 22, 1.0); prop('crates_stacked', 22, -22, 0.9);
  }
}

// ================== Dựng tầng & Chuẩn bị Không gian Làng ==================
function ensureLightsAndResetWorld(scene) {
  if (!moon) {
    scene.background = new THREE.Color(0x0b0908);
    scene.fog = new THREE.Fog(0x0b0908, 34, 72);
    hemi = new THREE.HemisphereLight(0xa8b8e0, 0x3a2a20, 1.1);
    scene.add(hemi);
    moon = new THREE.DirectionalLight(0xc8d4ff, 1.3);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera;
    sc.left = sc.bottom = -26; sc.right = sc.top = 26; sc.near = 1; sc.far = 70;
    moon.shadow.bias = -0.0005;
    scene.add(moon, moon.target);
  }
  if (worldGroup) {
    worldGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    for (const r of ownedWorld) r?.dispose?.();
    ownedWorld.length = 0;
    scene.remove(worldGroup);
  }
  disposeLiquids();
  removeExit();
  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  pillars.length = 0;
  boxes.length = 0;
  pits.length = 0;
  pitFx.length = 0;
  torches.length = 0;
  staticLights = 0;
}

export function prepareCustomWorld(scene, opts = {}) {
  const half = opts.half ?? 18.5;
  ROOM_HALF = half;
  WALK_LIMIT = half - 1.1;
  ensureLightsAndResetWorld(scene);
  isDark = false;
  flameDarkness = 0;
  const B = opts.biome || {
    id: 'village', name: 'Làng Thợ Rèn', tint: 0xffffff,
    fog: 0x16110d, sky: 0xffd9a8, ground: 0x4a3424, moon: 0xffe2b8, torch: 0xff9a3c,
  };
  currentBiome = B;
  setFxBiome(B.id);
  scene.background.set(B.fog);
  scene.fog.color.set(B.fog);
  hemi.color.set(B.sky);
  hemi.groundColor.set(B.ground);
  hemi.intensity = 1.25;
  moon.color.set(B.moon);
  moon.intensity = 1.35;
  return {
    group: worldGroup,
    owned: ownedWorld,
    addTorch: (x, z, rotY, color = B.torch || 0xff9a3c, y = 2.1, light = true) => wallTorch(x, z, rotY, color, y, light),
    addPiece: (name, x, z, rotY = 0, y = 0, s = DS) => piece(name, x, z, rotY, y, s),
  };
}

export function buildWorld(scene, floor = 1) {
  ROOM_HALF = (TILE * N) / 2;
  WALK_LIMIT = ROOM_HALF - 0.9;
  ensureLightsAndResetWorld(scene);
  seed = floor * 7919 + 17;
  const theme = floorTheme(floor);
  const B = theme.biome;
  currentBiome = B;
  setFxBiome(B.id);
  scene.background.set(B.fog);
  scene.fog.color.set(B.fog);
  hemi.color.set(B.sky); hemi.groundColor.set(B.ground);
  moon.color.set(B.moon);
  const H0 = ROOM_HALF;
  pitRects = SHAPES[theme.shape].map(([i0, i1, j0, j1]) => ({ x0: -H0 + i0 * TILE, x1: -H0 + (i1 + 1) * TILE, z0: -H0 + j0 * TILE, z1: -H0 + (j1 + 1) * TILE }));
  for (const r of pitRects) {
    const b = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2 - 0.15, hz: (r.z1 - r.z0) / 2 - 0.15, pit: true };
    boxes.push(b); pits.push(b);
    // Đáy hố: nham thạch phát sáng / nước băng / bóng tối
    // Đáy hố: dòng nham chảy / nước băng tối / sương mộ / vực sâu (shader)
    const bottom = rectLiquid(r.x1 - r.x0, r.z1 - r.z0, { lava: 'lava', ice: 'water', crypt: 'mist', swamp: 'mist', sanctum: 'elec', stone: 'void' }[B.id] || 'void');
    bottom.material.transparent = false;
    bottom.position.set(b.x, -1.1, b.z);
    ownedWorld.push(bottom.geometry);
    worldGroup.add(bottom);
    // Thành đá bên trong miệng hố
    const rimGeo = new THREE.BoxGeometry(r.x1 - r.x0, 1.2, r.z1 - r.z0);
    const rimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2420).multiply(new THREE.Color(B.tint)), roughness: 0.9, side: THREE.BackSide });
    ownedWorld.push(rimGeo, rimMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(b.x, -0.6, b.z);
    worldGroup.add(rim);
    pitFx.push(r);
    // Đá vỡ lởm chởm dọc mép hố (che cạnh thẳng tắp)
    const rub = models['dungeon/rubble_large'];
    if (rub) {
      const edgeRock = (x, z) => {
        if (Math.abs(x) > H0 - 0.5 || Math.abs(z) > H0 - 0.5 || rand() < 0.3) return;
        const o = rub.scene.clone(true);
        o.scale.set(DS * (0.12 + rand() * 0.16), DS * (0.08 + rand() * 0.12), DS * (0.12 + rand() * 0.16));
        o.position.set(x, -0.05, z); o.rotation.y = rand() * Math.PI * 2;
        o.traverse((c) => { if (c.isMesh) { c.receiveShadow = true; c.castShadow = false; } });
        tintObject(o, B.tint);
        worldGroup.add(o);
      };
      for (let x = r.x0; x <= r.x1; x += 1.6 + rand()) { edgeRock(x, r.z0 - 0.1); edgeRock(x, r.z1 + 0.1); }
      for (let z = r.z0; z <= r.z1; z += 1.6 + rand()) { edgeRock(r.x0 - 0.1, z); edgeRock(r.x1 + 0.1, z); }
    }
  }

  const H = ROOM_HALF;
  const at = (i) => -H + TILE / 2 + i * TILE;
  const W = H + 0.4;

  // Mặt sàn Hầm Ngục PBR (Phiến đá 18x18 InstancedMesh + Ấn Trung Tâm + Thảm 4 hướng + Song Sắt + AO)
  buildDungeonFloor(worldGroup, { N, TILE, ROOM_HALF, DS, biome: B, inPit, rand, models, tintObject });

  if (!models['dungeon/wall']) {
    return theme;
  }

  // Tường bắc, tây, đông (phía nam để trống cho camera)
  for (let i = 0; i < N; i++) {
    const v = () => (rand() < 0.25 ? 'wall_cracked' : 'wall');
    piece(v(), at(i), -W, 0);
    piece(v(), -W, at(i), Math.PI / 2);
    piece(v(), W, at(i), -Math.PI / 2);
  }
  const wallMesh = models['dungeon/wall'].scene.getObjectByProperty('isMesh', true);
  for (const sx of [-1, 1]) {
    const cg = new THREE.BoxGeometry(0.8, 4 * DS, 0.8);
    ownedWorld.push(cg);
    const c = new THREE.Mesh(cg, wallMesh.material);
    c.position.set(sx * W, 2 * DS, -W);
    worldGroup.add(c);
  }
  for (let i = 0; i <= N; i += 2) piece('column', -H + i * TILE, H + 0.4, 0);

  // Đuốc (tối đa 6 đèn PointLight trải đều 3 vách tường + glow sprite cho các đuốc còn lại)
  for (const x of [-21, -11, 0, 11, 21]) wallTorch(x, -H, 0, theme.torch, 2.1, x === -11 || x === 11);
  for (const z of [-18, -5, 8, 20]) {
    const lit = z === -18 || z === 8;
    wallTorch(-H, z, Math.PI / 2, theme.torch, 2.1, lit);
    wallTorch(H, z, -Math.PI / 2, theme.torch, 2.1, lit);
  }
  for (const x of [-16, -6, 6, 16]) piece('banner_patternA_red', x, -W, 0);
  for (const x of [-25, 25]) piece('banner_shield_red', x, -W, 0);
  piece('banner_patternA_red', -W, -11, Math.PI / 2);
  piece('banner_patternA_red', -W, 14, Math.PI / 2);
  piece('banner_patternA_red', W, -11, -Math.PI / 2);
  piece('banner_patternA_red', W, 14, -Math.PI / 2);

  buildLayout(theme.layout);
  return theme;
}

// Biến cố "Bóng Tối" và Ánh Lửa liên tục (cơ chế #6): khi Ánh Lửa tụt dưới 45, phòng tối dần
let flameDarkness = 0; // 0 = sáng rõ, 1 = tối như biến cố Bóng Tối
function syncLighting() {
  const k = isDark ? 0.82 : flameDarkness;
  if (hemi) hemi.intensity = 1.1 - k * 0.82;
  if (moon) moon.intensity = 1.3 - k * 0.98;
  if (darkHook) darkHook(k > 0.05 ? k : 0);
}
export function setDarkHook(fn) { darkHook = fn; }
export function setDark(on) {
  if (isDark === on) return;
  isDark = on;
  syncLighting();
}
export function setFlameLevel(flame) {
  const target = flame >= 40 ? 0 : Math.min(0.42, ((40 - flame) / 40) * 0.42);
  if (Math.abs(target - flameDarkness) < 0.01) return;
  flameDarkness = target;
  syncLighting();
}

// Nắp hầm dẫn xuống tầng sau
let exitObj = null;
export function spawnExit(x, z) {
  removeExit();
  exitObj = new THREE.Group();
  const grate = models['dungeon/floor_tile_big_grate_open'];
  if (grate) { const g = grate.scene.clone(true); g.scale.setScalar(DS * 0.75); g.position.y = 0.02; exitObj.add(g); }
  const beamGeo = new THREE.CylinderGeometry(1.0, 1.3, 6, 24, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 3;
  const halo = glowSprite(0x7fd8ff, 2.8);
  halo.position.y = 1.4;
  exitObj.add(beam, halo);
  exitObj.position.set(x, 0, z);
  exitObj.userData = { beam, halo, light: null, pos: new THREE.Vector3(x, 0, z), owned: [beamGeo, beamMat] };
  worldGroup.add(exitObj);
  return exitObj.userData.pos;
}
export function removeExit() {
  if (exitObj) {
    exitObj.parent?.remove(exitObj);
    if (exitObj.userData?.owned) for (const r of exitObj.userData.owned) r?.dispose?.();
    exitObj = null;
  }
}
export function exitPos() { return exitObj ? exitObj.userData.pos : null; }

const flameVel = new THREE.Vector3();
const amb = new THREE.Vector3();
// Hạt môi trường theo vùng: tuyết, tàn lửa, ma trơi, bụi
function ambientFx(focus) {
  if (!focus) return;
  const B = currentBiome;
  const rx = () => focus.x + (Math.random() - 0.5) * 30, rz = () => focus.z + (Math.random() - 0.5) * 22;
  if (B.id === 'ice' && Math.random() < 0.5) emit(amb.set(rx(), 7, rz()), { frame: F.sparkle, color: 0xffffff, color2: 0xbfe8ff, size: 0.25, size2: 0.2, life: 4, vel: flameVel.set((Math.random() - 0.5) * 0.6, -1.6, (Math.random() - 0.5) * 0.6), alpha: 0.8, hdr: 1, rotV: 2 });
  if (B.id === 'lava' && Math.random() < 0.45) emit(amb.set(rx(), 0.2, rz()), { frame: F.glow, color: 0xffb060, color2: 0xff3a00, size: 0.18, size2: 0.02, life: 2.5, vel: flameVel.set((Math.random() - 0.5) * 0.8, 1.2 + Math.random(), (Math.random() - 0.5) * 0.8), hdr: 2.2 });
  if (B.id === 'crypt' && Math.random() < 0.12) emit(amb.set(rx(), 0.4, rz()), { frame: F.glow, color: 0x9fffbf, color2: 0x2a8a4a, size: 0.5, size2: 0.1, life: 4, vel: flameVel.set((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4), alpha: 0.7, fadeIn: 0.3 });
  if (B.id === 'crypt' && Math.random() < 0.08) emit(amb.set(rx(), 0.2, rz()), { smoke: true, frame: F.smoke, color: 0x3a5a40, size: 3, size2: 5, life: 5, vel: flameVel.set(0.2, 0.05, 0), alpha: 0.18, fadeIn: 0.3 });
  if (B.id === 'swamp' && Math.random() < 0.28) emit(amb.set(rx(), 0.4, rz()), { frame: F.glow, color: 0xbfff60, color2: 0x3a9020, size: 0.38, size2: 0.08, life: 3.5, vel: flameVel.set((Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5), alpha: 0.75 });
  if (B.id === 'sanctum' && Math.random() < 0.22) emit(amb.set(rx(), 1 + Math.random() * 4, rz()), { frame: F.elec, color: 0xffe880, color2: 0x7fdcff, size: 0.35, size2: 0.05, life: 0.3, vel: flameVel.set(0, -0.5, 0), hdr: 2 });
  if (B.id === 'stone' && Math.random() < 0.15) emit(amb.set(rx(), 1 + Math.random() * 3, rz()), { frame: F.glow, color: 0xffe0b0, size: 0.06, size2: 0.06, life: 4, vel: flameVel.set((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3), alpha: 0.6, hdr: 1, fadeIn: 0.3 });
  if (B.id === 'village' && Math.random() < 0.28) emit(amb.set(rx(), 0.4 + Math.random() * 2.2, rz()), { frame: F.glow, color: Math.random() < 0.5 ? 0xffcf70 : 0xff8a30, size: 0.12, size2: 0.02, life: 2.8, vel: flameVel.set((Math.random() - 0.5) * 0.4, 0.55 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4), alpha: 0.75, hdr: 1.6, fadeIn: 0.2 });
  for (const p of pitFx) {
    if (B.id === 'lava' && Math.random() < 0.35) emit(amb.set(p.x0 + Math.random() * (p.x1 - p.x0), -0.6, p.z0 + Math.random() * (p.z1 - p.z0)), { frame: F.flame, color: 0xffa040, color2: 0xa01a00, size: 1.2, size2: 0.3, life: 0.9, vel: flameVel.set(0, 1.8, 0), alpha: 0.6, hdr: 1.4, fadeIn: 0.2, rotV: 1 });
    if (B.id !== 'lava' && Math.random() < 0.05) emit(amb.set(p.x0 + Math.random() * (p.x1 - p.x0), -0.8, p.z0 + Math.random() * (p.z1 - p.z0)), { smoke: true, frame: F.smoke, color: B.id === 'ice' ? 0x8ac0e0 : 0x101010, size: 2, size2: 3, life: 3, vel: flameVel.set(0, 0.4, 0), alpha: 0.25, fadeIn: 0.3 });
  }
}
export function updateWorld(time, focus) {
  for (const t of torches) {
    const f = Math.sin(time * 11 + t.seed) * 0.5 + Math.sin(time * 23 + t.seed * 2) * 0.3;
    if (t.light) t.light.intensity = t.base + f * 3;
    // Lửa đuốc
    if (t.flame && Math.random() < 0.55) {
      emit(t.flame, { frame: Math.random() < 0.5 ? F.flame : F.tongue, color: 0xffe8a0, color2: t.color, size: 0.42 + Math.random() * 0.2, size2: 0.08,
        life: 0.35 + Math.random() * 0.2, vel: flameVel.set((Math.random() - 0.5) * 0.2, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.2), rotV: (Math.random() - 0.5) * 2, hdr: 2, fadeIn: 0.15 });
      if (Math.random() < 0.04) emit(t.flame, { frame: F.glow, color: 0xffd080, size: 0.12, size2: 0, life: 0.9, vel: flameVel.set((Math.random() - 0.5) * 0.6, 1.4, (Math.random() - 0.5) * 0.6), hdr: 2.5 });
    }
  }
  ambientFx(focus);
  if (exitObj) {
    exitObj.userData.beam.material.opacity = 0.18 + Math.sin(time * 3) * 0.08;
    if (exitObj.userData.light) exitObj.userData.light.intensity = 12 + Math.sin(time * 5) * 3;
    else if (exitObj.userData.halo) exitObj.userData.halo.scale.setScalar(2.6 + Math.sin(time * 5) * 0.25);
  }
  // Vùng bóng đổ đi theo nhân vật (phòng lớn hơn vùng bóng)
  if (moon && focus) {
    moon.position.set(focus.x - 8, 18, focus.z + 8);
    moon.target.position.set(focus.x, 0, focus.z);
  }
}

// Có bị vật cản chắn tại điểm này không (dùng khi sinh quái, đạn bay)
export function isBlocked(x, z, r = 0) {
  if (Math.abs(x) > WALK_LIMIT - r || Math.abs(z) > WALK_LIMIT - r) return true;
  if (pillars.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + r)) return true;
  return boxes.some((b) => (!b.pit || r >= 0) && Math.abs(x - b.x) < b.hx + r && Math.abs(z - b.z) < b.hz + r);
}

// Đẩy một vật hình tròn ra khỏi tường, cột và tường thấp
export function collide(pos, radius) {
  const lim = WALK_LIMIT;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
  for (const p of pillars) {
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const d = Math.hypot(dx, dz), min = p.r + radius;
    if (d < min && d > 0.0001) {
      pos.x = p.x + (dx / d) * min;
      pos.z = p.z + (dz / d) * min;
    }
  }
  for (const b of boxes) {
    const cx = Math.max(b.x - b.hx, Math.min(b.x + b.hx, pos.x));
    const cz = Math.max(b.z - b.hz, Math.min(b.z + b.hz, pos.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < radius) {
      if (d > 0.0001) { pos.x = cx + (dx / d) * radius; pos.z = cz + (dz / d) * radius; }
      else {
        // tâm nằm trong hộp: đẩy ra theo cạnh gần nhất
        const ox = b.hx - Math.abs(pos.x - b.x), oz = b.hz - Math.abs(pos.z - b.z);
        if (ox < oz) pos.x = b.x + Math.sign(pos.x - b.x || 1) * (b.hx + radius);
        else pos.z = b.z + Math.sign(pos.z - b.z || 1) * (b.hz + radius);
      }
    }
  }
}
