// Nghệ thuật mặt sàn Hầm Ngục PBR (Procedural Flagstone Albedo/Bump/Roughness/Emissive, InstancedMesh,
// Khắc Ấn Trung Tâm, Thảm Lễ Nghi 4 hướng, Song Sắt Phát Sáng, Bóng Chân Tường & Mảnh Rêu/Nứt Đất).
import * as THREE from 'three';

const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
UNIT_PLANE.rotateX(-Math.PI / 2);

const slabGeoCache = new Map();
function getSlabGeo(tileSize) {
  const k = tileSize.toFixed(3);
  if (!slabGeoCache.has(k)) {
    const g = new THREE.BoxGeometry(tileSize, 0.36, tileSize);
    g.translate(0, -0.18, 0); // Mặt trên nằm đúng tại y = 0.0
    slabGeoCache.set(k, g);
  }
  return slabGeoCache.get(k);
}

function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas');
  if (!cv || typeof cv.getContext !== 'function') return null;
  const g = cv.getContext('2d');
  if (!g) return null;
  cv.width = w;
  cv.height = h;
  return { cv, g };
}

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shiftHex(hex, delta) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + delta);
  const g = clamp(((n >> 8) & 255) + delta);
  const b = clamp((n & 255) + delta);
  return `rgb(${r},${g},${b})`;
}

// ---------- Bảng màu & PBR cho 6 Vùng Đất ----------
export const BIOME_PALETTES = {
  stone: {
    stones: ['#5e544b', '#524942', '#6a5f54', '#4a423b'],
    mortar: '#221d18',
    roughness: 0.84,
    metalness: 0.08,
    bumpScale: 0.14,
    emissive: null,
    emissiveIntensity: 0,
    carpetMain: '#6e1d1c',
    carpetDark: '#471010',
    carpetTrim: '#d8a648',
    medallionOuter: '#352b24',
    medallionRing: '#cfa04c',
    medallionGlow: '#ff9038',
    grateGlow: '#ff6a22',
    decalType: 'stone',
    mossChance: 0.12,
  },
  ice: {
    stones: ['#55718b', '#49637b', '#6685a3', '#3f576d'],
    mortar: '#1a2c3e',
    roughness: 0.42,
    metalness: 0.14,
    bumpScale: 0.12,
    emissive: '#58c4ff',
    emissiveIntensity: 0.28,
    carpetMain: '#28456c',
    carpetDark: '#192d4a',
    carpetTrim: '#98d8f8',
    medallionOuter: '#21364c',
    medallionRing: '#88d4ff',
    medallionGlow: '#70dcff',
    grateGlow: '#4fc3ff',
    decalType: 'ice',
    mossChance: 0.0,
  },
  lava: {
    stones: ['#403432', '#352a28', '#4c3e3a', '#2c2220'],
    mortar: '#180c08',
    roughness: 0.78,
    metalness: 0.12,
    bumpScale: 0.16,
    emissive: '#ff5a14',
    emissiveIntensity: 0.65,
    carpetMain: '#38221e',
    carpetDark: '#231311',
    carpetTrim: '#ff8a34',
    medallionOuter: '#281814',
    medallionRing: '#e87028',
    medallionGlow: '#ff6218',
    grateGlow: '#ff5210',
    decalType: 'lava',
    mossChance: 0.0,
  },
  crypt: {
    stones: ['#4c554b', '#414940', '#586256', '#384038'],
    mortar: '#181e18',
    roughness: 0.80,
    metalness: 0.06,
    bumpScale: 0.14,
    emissive: '#40b870',
    emissiveIntensity: 0.18,
    carpetMain: '#1e4632',
    carpetDark: '#122b1e',
    carpetTrim: '#a8a05a',
    medallionOuter: '#222b23',
    medallionRing: '#88b074',
    medallionGlow: '#52d688',
    grateGlow: '#3ec478',
    decalType: 'crypt',
    mossChance: 0.25,
  },
  swamp: {
    stones: ['#3e4e3a', '#344230', '#4a5c44', '#2b3828'],
    mortar: '#151e12',
    roughness: 0.48,
    metalness: 0.08,
    bumpScale: 0.15,
    emissive: '#7ee038',
    emissiveIntensity: 0.28,
    carpetMain: '#2a4222',
    carpetDark: '#1b2b16',
    carpetTrim: '#88c848',
    medallionOuter: '#212e1d',
    medallionRing: '#78b848',
    medallionGlow: '#8fe83a',
    grateGlow: '#7ad832',
    decalType: 'swamp',
    mossChance: 0.42,
  },
  sanctum: {
    stones: ['#48485a', '#3d3d4e', '#56556b', '#333344'],
    mortar: '#1d1a26',
    roughness: 0.38,
    metalness: 0.25,
    bumpScale: 0.11,
    emissive: '#f0c858',
    emissiveIntensity: 0.32,
    carpetMain: '#24356a',
    carpetDark: '#172148',
    carpetTrim: '#ebc45a',
    medallionOuter: '#262536',
    medallionRing: '#ecc65c',
    medallionGlow: '#ffe070',
    grateGlow: '#ffd450',
    decalType: 'sanctum',
    mossChance: 0.0,
  },
};

const biomeCache = new Map();
let aoEdgeTexCache = null;
const decalTexCache = new Map();
const grateTexCache = new Map();

function getGrateGlowMat(hexColor) {
  if (grateTexCache.has(hexColor)) return grateTexCache.get(hexColor);
  const S = 128;
  const c = makeCanvas(S, S);
  let tex = null;
  if (c) {
    const { g } = c;
    const cx = S / 2, cy = S / 2;
    const grd = g.createRadialGradient(cx, cy, 4, cx, cy, 58);
    grd.addColorStop(0, hexColor);
    grd.addColorStop(0.65, hexColor);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.globalAlpha = 0.72;
    g.fillRect(0, 0, S, S);
    // Song sắt rèn đan chéo chắn ngang miệng lò
    g.globalAlpha = 0.92;
    g.fillStyle = '#181412';
    for (let i = 18; i <= S - 18; i += 22) {
      g.fillRect(i - 4, 8, 8, S - 16);
      g.fillRect(8, i - 3, S - 16, 6);
    }
    g.strokeStyle = '#38302b';
    g.lineWidth = 8;
    g.strokeRect(4, 4, S - 8, S - 8);
    g.globalAlpha = 1;
    tex = configureTex(c.cv, true);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: tex ? 0xffffff : hexColor,
    transparent: true,
    opacity: tex ? 0.92 : 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  grateTexCache.set(hexColor, mat);
  return mat;
}

function configureTex(cv, isColor = true) {
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sinh 4 map PBR đồng bộ (Albedo + Bump + Roughness + Emissive) trên lưới đá cắt 512x512
function buildStoneTextures(biomeId, pal) {
  const S = 512;
  const cMap = makeCanvas(S, S);
  if (!cMap) return null;
  const cBump = makeCanvas(S, S);
  const cRough = makeCanvas(S, S);
  const cEmit = pal.emissive ? makeCanvas(S, S) : null;

  const { g: gm } = cMap;
  const { g: gb } = cBump;
  const { g: gr } = cRough;
  const ge = cEmit ? cEmit.g : null;
  const R = makeRng(biomeId.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));

  // Nền vữa tối
  gm.fillStyle = pal.mortar;
  gm.fillRect(0, 0, S, S);
  gb.fillStyle = 'rgb(28,28,28)';
  gb.fillRect(0, 0, S, S);
  gr.fillStyle = 'rgb(236,236,236)';
  gr.fillRect(0, 0, S, S);
  if (ge) {
    ge.fillStyle = '#000000';
    ge.fillRect(0, 0, S, S);
  }

  // Xây các hàng đá so le (4 hàng × độ rộng xen kẽ) sao cho mép 0..512 luôn có vữa
  const rows = 4;
  const rowH = S / rows;
  const mortarPad = 6;
  const blocks = [];

  for (let row = 0; row < rows; row++) {
    const y = row * rowH;
    const widths = row % 2 === 0 ? [128, 160, 96, 128] : [96, 160, 128, 128];
    let x = 0;
    for (let col = 0; col < widths.length; col++) {
      const w = widths[col];
      const split = R() < 0.24 && rowH > 100;
      if (split) {
        const h1 = Math.round(rowH * 0.5);
        blocks.push({ x, y, w, h: h1, col: pal.stones[Math.floor(R() * pal.stones.length)], dv: (R() - 0.5) * 18 });
        blocks.push({ x, y: y + h1, w, h: rowH - h1, col: pal.stones[Math.floor(R() * pal.stones.length)], dv: (R() - 0.5) * 18 });
      } else {
        blocks.push({ x, y, w, h: rowH, col: pal.stones[Math.floor(R() * pal.stones.length)], dv: (R() - 0.5) * 20 });
      }
      x += w;
    }
  }

  // Vẽ từng phiến đá trên Albedo, Bump, Roughness & mạch phát sáng
  for (const b of blocks) {
    const bx = b.x + mortarPad * 0.5;
    const by = b.y + mortarPad * 0.5;
    const bw = b.w - mortarPad;
    const bh = b.h - mortarPad;
    const fill = shiftHex(b.col, b.dv);

    // Albedo phiến đá
    gm.fillStyle = fill;
    gm.fillRect(bx, by, bw, bh);

    // Viền vát sáng cạnh trên-trái & bóng cạnh dưới-phải tạo cảm giác khối đá 3D rõ nét
    gm.fillStyle = 'rgba(255,255,255,0.09)';
    gm.fillRect(bx, by, bw, 4);
    gm.fillRect(bx, by, 4, bh);
    gm.fillStyle = 'rgba(0,0,0,0.22)';
    gm.fillRect(bx, by + bh - 5, bw, 5);
    gm.fillRect(bx + bw - 5, by, 5, bh);

    // Bump phiến đá: viền chuyển tiếp 155 -> mặt đá 222..242
    const bumpVal = Math.round(214 + R() * 26);
    gb.fillStyle = 'rgb(150,150,150)';
    gb.fillRect(bx, by, bw, bh);
    gb.fillStyle = `rgb(${bumpVal},${bumpVal},${bumpVal})`;
    gb.fillRect(bx + 4, by + 4, bw - 8, bh - 8);

    // Roughness phiến đá
    const baseR = pal.roughness < 0.5 ? 115 : 175;
    const rv = Math.round(baseR + (R() - 0.5) * 42);
    gr.fillStyle = `rgb(${rv},${rv},${rv})`;
    gr.fillRect(bx + 2, by + 2, bw - 4, bh - 4);

    // Hạt đá li ti (speckle grain) trên Albedo + Bump
    const grainCount = Math.round((bw * bh) / 115);
    for (let k = 0; k < grainCount; k++) {
      const gx = bx + 4 + R() * (bw - 8);
      const gy = by + 4 + R() * (bh - 8);
      const gs = 1.5 + R() * 3.5;
      const dark = R() < 0.52;
      gm.fillStyle = dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,245,230,0.08)';
      gm.fillRect(gx, gy, gs, gs * (0.7 + R() * 0.6));
      gb.fillStyle = dark ? 'rgba(130,130,130,0.5)' : 'rgba(255,255,255,0.4)';
      gb.fillRect(gx, gy, gs, gs);
    }

    // Vết nứt phong hóa mảnh
    if (R() < 0.48) {
      let cx = bx + 14 + R() * (bw - 28);
      let cy = by + 14 + R() * (bh - 28);
      const segs = 2 + Math.floor(R() * 3);
      gm.strokeStyle = 'rgba(0,0,0,0.34)';
      gm.lineWidth = 1.4;
      gb.strokeStyle = 'rgb(60,60,60)';
      gb.lineWidth = 2.0;
      gm.beginPath(); gm.moveTo(cx, cy);
      gb.beginPath(); gb.moveTo(cx, cy);
      for (let s = 0; s < segs; s++) {
        cx += (R() - 0.5) * 28;
        cy += (R() - 0.5) * 26;
        cx = Math.max(bx + 4, Math.min(bx + bw - 4, cx));
        cy = Math.max(by + 4, Math.min(by + bh - 4, cy));
        gm.lineTo(cx, cy);
        gb.lineTo(cx, cy);
      }
      gm.stroke();
      gb.stroke();
    }

    // Chi tiết đặc trưng từng Vùng Đất
    if (pal.mossChance > 0 && R() < pal.mossChance) {
      const mx = bx + 8 + R() * (bw - 16);
      const my = by + (R() < 0.5 ? 5 : bh - 9);
      gm.fillStyle = biomeId === 'swamp' ? 'rgba(84,132,52,0.55)' : 'rgba(64,98,54,0.45)';
      gm.beginPath();
      gm.ellipse(mx, my, 8 + R() * 10, 4 + R() * 4, R() * Math.PI, 0, Math.PI * 2);
      gm.fill();
    }
    if (biomeId === 'ice' && R() < 0.55) {
      gm.strokeStyle = 'rgba(210,242,255,0.22)';
      gm.lineWidth = 1.2;
      gm.beginPath();
      const fx = bx + 12 + R() * (bw - 24), fy = by + 12 + R() * (bh - 24);
      gm.moveTo(fx - 10, fy - 4); gm.lineTo(fx + 10, fy + 4);
      gm.moveTo(fx - 4, fy + 8); gm.lineTo(fx + 5, fy - 8);
      gm.stroke();
    }
    if (biomeId === 'sanctum') {
      // Khảm chỉ vàng nhẹ trong lòng phiến đá Đền Lôi
      gm.strokeStyle = 'rgba(232,192,88,0.26)';
      gm.lineWidth = 1.5;
      gm.strokeRect(bx + 7, by + 7, bw - 14, bh - 14);
      if (ge && R() < 0.65) {
        ge.strokeStyle = 'rgba(240,200,88,0.42)';
        ge.lineWidth = 1.5;
        ge.strokeRect(bx + 7, by + 7, bw - 14, bh - 14);
      }
    }
  }

  // Mạch phát sáng mảnh nằm dọc rãnh vữa cho Lửa / Băng / Đầm Lầy / Hầm Mộ / Thánh Điện
  if (ge) {
    ge.strokeStyle = pal.emissive;
    ge.lineWidth = biomeId === 'lava' ? 2.4 : 1.6;
    for (let row = 0; row < rows; row++) {
      if (biomeId === 'lava' || R() < 0.55) {
        const y = row * rowH;
        ge.globalAlpha = biomeId === 'lava' ? 0.85 : 0.45;
        ge.beginPath();
        ge.moveTo(0, y);
        ge.lineTo(S, y);
        ge.stroke();
      }
    }
    for (const b of blocks) {
      if (R() < (biomeId === 'lava' ? 0.6 : 0.3)) {
        ge.globalAlpha = biomeId === 'lava' ? 0.72 : 0.35;
        ge.beginPath();
        ge.moveTo(b.x, b.y);
        ge.lineTo(b.x, b.y + b.h);
        ge.stroke();
      }
    }
    ge.globalAlpha = 1;
  }

  return {
    map: configureTex(cMap.cv, true),
    bumpMap: configureTex(cBump.cv, false),
    roughnessMap: configureTex(cRough.cv, false),
    emissiveMap: cEmit ? configureTex(cEmit.cv, true) : null,
  };
}

// Ấn Rèn Lớn giữa đấu trường (512x512 trong suốt)
function buildMedallionTexture(biomeId, pal) {
  const S = 512;
  const cMap = makeCanvas(S, S);
  if (!cMap) return null;
  const cEmit = makeCanvas(S, S);
  const { g: gm } = cMap;
  const { g: ge } = cEmit;
  const cx = S / 2, cy = S / 2;

  // Vòng đá khảm ngoài
  gm.beginPath();
  gm.arc(cx, cy, 240, 0, Math.PI * 2);
  gm.fillStyle = pal.medallionOuter;
  gm.globalAlpha = 0.88;
  gm.fill();
  gm.globalAlpha = 1;

  // Viền tròn đôi + các tia hướng tâm
  gm.strokeStyle = pal.medallionRing;
  gm.lineWidth = 8;
  gm.beginPath(); gm.arc(cx, cy, 232, 0, Math.PI * 2); gm.stroke();
  gm.lineWidth = 4;
  gm.beginPath(); gm.arc(cx, cy, 206, 0, Math.PI * 2); gm.stroke();
  gm.beginPath(); gm.arc(cx, cy, 138, 0, Math.PI * 2); gm.stroke();
  gm.beginPath(); gm.arc(cx, cy, 66, 0, Math.PI * 2); gm.stroke();

  // Mảng tối lồng bên trong
  gm.fillStyle = 'rgba(0,0,0,0.28)';
  gm.beginPath();
  gm.arc(cx, cy, 138, 0, Math.PI * 2);
  gm.fill();

  // 8 vạch chia la bàn
  gm.lineWidth = 4;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    gm.beginPath();
    gm.moveTo(cx + Math.cos(a) * 68, cy + Math.sin(a) * 68);
    gm.lineTo(cx + Math.cos(a) * 204, cy + Math.sin(a) * 204);
    gm.stroke();
  }

  // 12 Cổ Ngữ Lò Rèn quanh vành ngoài
  gm.strokeStyle = pal.medallionRing;
  ge.strokeStyle = pal.medallionGlow;
  gm.lineWidth = 3.2;
  ge.lineWidth = 3.0;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rx = cx + Math.cos(a) * 172;
    const ry = cy + Math.sin(a) * 172;
    for (const ctx2d of [gm, ge]) {
      ctx2d.save();
      ctx2d.translate(rx, ry);
      ctx2d.rotate(a + Math.PI / 2);
      ctx2d.beginPath();
      ctx2d.moveTo(-7, 10); ctx2d.lineTo(0, -10); ctx2d.lineTo(7, 10);
      ctx2d.moveTo(-5, 2); ctx2d.lineTo(5, 2);
      ctx2d.stroke();
      ctx2d.restore();
    }
  }

  // Biểu tượng Đe & Ngọn Lửa Lò Rèn tại tâm
  for (const ctx2d of [gm, ge]) {
    ctx2d.strokeStyle = ctx2d === ge ? pal.medallionGlow : pal.medallionRing;
    ctx2d.lineWidth = 5;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, 66, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.fillStyle = ctx2d === ge ? pal.medallionGlow : pal.medallionRing;
    ctx2d.beginPath();
    ctx2d.moveTo(cx - 28, cy + 4);
    ctx2d.lineTo(cx + 28, cy + 4);
    ctx2d.lineTo(cx + 38, cy - 10);
    ctx2d.lineTo(cx - 18, cy - 10);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.fillRect(cx - 14, cy + 4, 28, 12);
    ctx2d.fillRect(cx - 24, cy + 16, 48, 8);
  }

  // Vết sờn phong hóa tự nhiên để ấn hòa lẫn vào nền đá
  const R = makeRng(biomeId.length * 113 + 9);
  gm.strokeStyle = 'rgba(0,0,0,0.45)';
  gm.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    const r0 = 70 + R() * 80;
    gm.beginPath();
    gm.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    gm.lineTo(cx + Math.cos(a + 0.2) * (r0 + 75), cy + Math.sin(a + 0.2) * (r0 + 75));
    gm.stroke();
  }

  const map = configureTex(cMap.cv, true);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const emissiveMap = configureTex(cEmit.cv, true);
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, emissiveMap };
}

// Thảm / Đường Đá Nghi Lễ 4 hướng (256x256 lặp theo chiều dọc)
function buildCarpetTexture(biomeId, pal) {
  const S = 256;
  const cMap = makeCanvas(S, S);
  if (!cMap) return null;
  const { g } = cMap;

  // Mép tối trong suốt nhẹ tạo bóng thảm
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(10, 0, S - 20, S);

  // Thân thảm chính (trục X của texture = bề rộng thảm; trục Y = chiều dài lặp)
  g.fillStyle = pal.carpetMain;
  g.fillRect(16, 0, S - 32, S);

  // Dải viền trong sẫm + chỉ vàng kim loại hai bên
  g.fillStyle = pal.carpetDark;
  g.fillRect(38, 0, S - 76, S);
  g.fillStyle = pal.carpetTrim;
  g.fillRect(22, 0, 7, S);
  g.fillRect(S - 29, 0, 7, S);
  g.fillRect(36, 0, 3, S);
  g.fillRect(S - 39, 0, 3, S);

  // Hoa văn hình thoi lặp dọc giữa thảm
  g.strokeStyle = pal.carpetTrim;
  g.lineWidth = 3;
  for (let y = 32; y < S; y += 64) {
    g.beginPath();
    g.moveTo(S / 2, y - 22);
    g.lineTo(S / 2 + 26, y);
    g.lineTo(S / 2, y + 22);
    g.lineTo(S / 2 - 26, y);
    g.closePath();
    g.stroke();
  }

  // Sợi dệt & vết bụi mòn tự nhiên để thảm hòa hợp hầm ngục
  const R = makeRng(biomeId.charCodeAt(0) * 57);
  for (let i = 0; i < 420; i++) {
    const x = 16 + R() * (S - 32);
    const y = R() * S;
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,240,210,0.06)';
    g.fillRect(x, y, 3 + R() * 8, 2);
  }

  const tex = configureTex(cMap.cv, true);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function getBiomeMaterials(biomeId) {
  if (biomeCache.has(biomeId)) return biomeCache.get(biomeId);
  const pal = BIOME_PALETTES[biomeId] || BIOME_PALETTES.stone;
  const st = buildStoneTextures(biomeId, pal);

  const slabMat = st
    ? new THREE.MeshStandardMaterial({
        map: st.map,
        bumpMap: st.bumpMap,
        bumpScale: pal.bumpScale,
        roughnessMap: st.roughnessMap,
        roughness: 1.0,
        metalness: pal.metalness,
        emissive: pal.emissive ? new THREE.Color(pal.emissive) : new THREE.Color(0x000000),
        emissiveMap: st.emissiveMap || null,
        emissiveIntensity: pal.emissiveIntensity || 0,
      })
    : new THREE.MeshStandardMaterial({ color: pal.stones[0], roughness: pal.roughness, metalness: pal.metalness });

  const medTex = buildMedallionTexture(biomeId, pal);
  const medallionMat = new THREE.MeshStandardMaterial({
    map: medTex ? medTex.map : null,
    color: medTex ? 0xffffff : pal.medallionRing,
    emissive: new THREE.Color(pal.medallionGlow),
    emissiveMap: medTex ? medTex.emissiveMap : null,
    emissiveIntensity: medTex ? 0.28 : 0.1,
    roughness: 0.7,
    metalness: 0.2,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  const cTex = buildCarpetTexture(biomeId, pal);
  const carpetMat = new THREE.MeshStandardMaterial({
    map: cTex,
    color: cTex ? 0xffffff : pal.carpetMain,
    roughness: 0.88,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const entry = { pal, slabMat, medallionMat, carpetMat };
  biomeCache.set(biomeId, entry);
  return entry;
}

// Dải bóng Ambient Occlusion chân tường (trong suốt mờ dần từ mép tường vào trong)
function getWallAoMat() {
  if (aoEdgeTexCache) return aoEdgeTexCache;
  const c = makeCanvas(64, 64);
  let tex = null;
  if (c) {
    const { g } = c;
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.68)');
    grd.addColorStop(0.45, 'rgba(0,0,0,0.28)');
    grd.addColorStop(1, 'rgba(0,0,0,0.0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    tex = configureTex(c.cv, true);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  aoEdgeTexCache = new THREE.MeshBasicMaterial({
    map: tex,
    color: tex ? 0xffffff : 0x000000,
    transparent: true,
    opacity: tex ? 0.9 : 0.25,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  });
  return aoEdgeTexCache;
}

// Mảnh chi tiết mặt sàn (vệt cháy / vết nứt / mảng rêu / tuyết)
function getDecalMat(kind) {
  if (decalTexCache.has(kind)) return decalTexCache.get(kind);
  const S = 128;
  const c = makeCanvas(S, S);
  let tex = null;
  if (c) {
    const { g } = c;
    const R = makeRng(kind.charCodeAt(0) * 97 + kind.length * 13);
    const cx = S / 2, cy = S / 2;
    const grd = g.createRadialGradient(cx, cy, 4, cx, cy, 56);
    if (kind === 'moss') {
      grd.addColorStop(0, 'rgba(56,96,38,0.62)');
      grd.addColorStop(0.6, 'rgba(38,68,26,0.34)');
      grd.addColorStop(1, 'rgba(20,40,14,0)');
    } else if (kind === 'frost') {
      grd.addColorStop(0, 'rgba(180,232,255,0.48)');
      grd.addColorStop(0.65, 'rgba(110,180,230,0.22)');
      grd.addColorStop(1, 'rgba(90,150,210,0)');
    } else {
      grd.addColorStop(0, 'rgba(12,8,6,0.62)');
      grd.addColorStop(0.55, 'rgba(18,12,10,0.28)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    if (kind === 'crack') {
      g.strokeStyle = 'rgba(0,0,0,0.68)';
      g.lineWidth = 2.2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + R() * 0.6;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28);
        g.lineTo(cx + Math.cos(a + 0.25) * 52, cy + Math.sin(a + 0.25) * 52);
        g.stroke();
      }
    }
    tex = configureTex(c.cv, true);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: tex ? 0xffffff : 0x1a1410,
    transparent: true,
    opacity: tex ? 0.72 : 0.25,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  decalTexCache.set(kind, mat);
  return mat;
}

// =========================================================================
// Dựng toàn bộ mặt sàn Hầm Ngục cho buildWorld()
// =========================================================================
export function buildDungeonFloor(worldGroup, { N, TILE, ROOM_HALF, DS, biome, inPit, rand, models, tintObject }) {
  const { pal, slabMat, medallionMat, carpetMat } = getBiomeMaterials(biome.id);
  const at = (i) => -ROOM_HALF + TILE / 2 + i * TILE;

  // 1. Sàn đá PBR 18x18 bằng 1 InstancedMesh duy nhất (chỉ tốn 1 draw call, có AO sát tường!)
  const coords = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = at(i), z = at(j);
      if (inPit(x, z)) continue;
      coords.push({ i, j, x, z });
    }
  }
  if (coords.length > 0) {
    const inst = new THREE.InstancedMesh(getSlabGeo(TILE), slabMat, coords.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    coords.forEach((cell, idx) => {
      dummy.position.set(cell.x, 0, cell.z);
      dummy.rotation.set(0, Math.floor(rand() * 4) * (Math.PI / 2), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);

      // Giảm nhẹ độ sáng sát 4 mép tường để tạo chiều sâu Ambient Occlusion + biến thiên tự nhiên từng ô
      const edgeDist = Math.min(cell.i, N - 1 - cell.i, cell.j, N - 1 - cell.j);
      const edgeAo = edgeDist === 0 ? 0.80 : edgeDist === 1 ? 0.92 : 1.0;
      const v = (0.93 + rand() * 0.12) * edgeAo;
      col.setRGB(v, v * (0.98 + rand() * 0.04), v * (0.97 + rand() * 0.05));
      inst.setColorAt(idx, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    worldGroup.add(inst);
  }

  // 2. Ấn Rèn Lớn trung tâm đấu trường (nếu tâm không phải hố)
  if (!inPit(0, 0, 5.2)) {
    const med = new THREE.Mesh(UNIT_PLANE, medallionMat);
    med.scale.set(13.2, 1, 13.2);
    med.position.set(0, 0.008, 0);
    med.receiveShadow = true;
    worldGroup.add(med);
  }

  // 3. 4 Dải Thảm Nghi Lễ / Đường Đá tỏa ra 4 hướng chính (tự né hố!)
  const dirs = [
    { dx: 0, dz: 1, rot: 0 },
    { dx: 0, dz: -1, rot: Math.PI },
    { dx: 1, dz: 0, rot: Math.PI / 2 },
    { dx: -1, dz: 0, rot: -Math.PI / 2 },
  ];
  for (const d of dirs) {
    for (let dist = 8.4; dist <= ROOM_HALF - 1.6; dist += TILE) {
      const cx = d.dx * dist, cz = d.dz * dist;
      if (inPit(cx, cz, 1.5)) continue;
      const seg = new THREE.Mesh(UNIT_PLANE, carpetMat);
      seg.scale.set(3.4, 1, TILE);
      seg.rotation.y = d.rot;
      seg.position.set(cx, 0.006, cz);
      seg.receiveShadow = true;
      worldGroup.add(seg);
    }
  }

  // 4. 4 Ô Song Sắt Lò Rèn phát sáng âm dưới đất tại 4 góc phần tư
  const grateModel = models['dungeon/floor_tile_big_grate'];
  const grateMat = getGrateGlowMat(pal.grateGlow);
  for (const [gx, gz] of [[-9.6, -9.6], [9.6, -9.6], [-9.6, 9.6], [9.6, 9.6]]) {
    if (inPit(gx, gz, 1.8)) continue;
    const vent = new THREE.Mesh(UNIT_PLANE, grateMat);
    vent.scale.set(2.3, 1, 2.3);
    vent.position.set(gx, 0.005, gz);
    worldGroup.add(vent);

    if (grateModel) {
      const g = grateModel.scene.clone(true);
      g.scale.setScalar(DS * 0.72);
      g.traverse((c) => { if (c.isMesh) c.receiveShadow = true; });
      tintObject(g, biome.tint);
      // Căn sát mặt sàn y = 0.014 dựa theo bounding box của model
      const box = new THREE.Box3().setFromObject(g);
      g.position.set(gx, 0.014 - box.max.y, gz);
      worldGroup.add(g);
    }
  }

  // 5. 4 Dải bóng AO bám chân tường Bắc / Nam / Tây / Đông
  const aoMat = getWallAoMat();
  const wallSpan = ROOM_HALF * 2;
  const aoDefs = [
    { x: 0, z: -ROOM_HALF + 1.3, sx: wallSpan, sz: 2.6, rot: 0 },
    { x: 0, z: ROOM_HALF - 1.3, sx: wallSpan, sz: 2.6, rot: Math.PI },
    { x: -ROOM_HALF + 1.3, z: 0, sx: wallSpan, sz: 2.6, rot: Math.PI / 2 },
    { x: ROOM_HALF - 1.3, z: 0, sx: wallSpan, sz: 2.6, rot: -Math.PI / 2 },
  ];
  for (const a of aoDefs) {
    const m = new THREE.Mesh(UNIT_PLANE, aoMat);
    m.scale.set(a.sx, 1, a.sz);
    m.rotation.y = a.rot;
    m.position.set(a.x, 0.009, a.z);
    worldGroup.add(m);
  }

  // 6. Rải 22 mảng vết cháy/nứt/rêu/tuyết mờ tự nhiên để không 2 vùng nào giống nhau
  const decalKind = pal.decalType === 'swamp' || pal.decalType === 'crypt'
    ? 'moss'
    : pal.decalType === 'ice'
      ? 'frost'
      : 'crack';
  const dMatA = getDecalMat(decalKind);
  const dMatB = getDecalMat('scorch');
  for (let k = 0; k < 22; k++) {
    const x = (rand() * 2 - 1) * (ROOM_HALF - 2.5);
    const z = (rand() * 2 - 1) * (ROOM_HALF - 2.5);
    if (inPit(x, z, 1.8) || Math.hypot(x, z) < 5.5) continue;
    const m = new THREE.Mesh(UNIT_PLANE, k % 2 === 0 ? dMatA : dMatB);
    const sz = 2.0 + rand() * 2.4;
    m.scale.set(sz, 1, sz * (0.8 + rand() * 0.4));
    m.rotation.y = rand() * Math.PI * 2;
    m.position.set(x, 0.010, z);
    worldGroup.add(m);
  }
}
