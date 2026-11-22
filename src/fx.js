import * as THREE from 'three';

// Hiệu ứng hình ảnh: hạt dùng texture Kenney Particle Pack (CC0) vẽ bằng shader (1 draw call / lớp),
// vệt chém dạng shader, sóng xung kích, tia sét dạng ống, vết cháy trên sàn, đèn chớp khi nổ.

// ---------- Rung màn hình ----------
export const shake = { trauma: 0 };
export function addShake(amount) {
  shake.trauma = Math.min(1, shake.trauma + amount);
}

// ---------- Hit stop (đóng băng game trong tích tắc khi đánh trúng) ----------
export const hitStop = { time: 0 };
export function addHitStop(sec) {
  hitStop.time = Math.max(hitStop.time, sec);
}

// ---------- Chất lượng hiệu ứng ----------
export const fxQuality = { high: localStorage.getItem('lorenh_fx') !== 'low' };
export function setFxQuality(high) {
  fxQuality.high = high;
  localStorage.setItem('lorenh_fx', high ? 'high' : 'low');
}
const density = () => (fxQuality.high ? 1 : 0.5);

// ---------- Texture ----------
const loader = new THREE.TextureLoader();
function tex(url) {
  const t = loader.load(url);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
const TEX = {
  atlas: tex('/fx/atlas.png'),
  ring: tex('/fx/ring.png'),
  scorch: tex('/fx/scorch.png'),
  rune: tex('/fx/rune.png'),
};
// Các ô trong atlas 4×4
export const F = { glow: 0, sparkle: 1, streak: 2, smoke: 3, flame: 4, tongue: 5, elec: 6, cross: 7, dust: 8, impact: 9, flare: 10, puff: 11, star: 12, jet: 13, fire: 14, halo: 15 };

// ---------- Hệ hạt (THREE.Points + shader) ----------
const VERT = /* glsl */`
attribute vec3 aColor;
attribute float aAlpha, aSize, aFrame, aRot, aStretch;
varying vec3 vColor; varying float vAlpha, vFrame, vRot, vStretch;
uniform float uViewH;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uViewH * projectionMatrix[1][1] * 0.5 / -mv.z;
  vColor = aColor; vAlpha = aAlpha; vFrame = aFrame; vRot = aRot; vStretch = aStretch;
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor; varying float vAlpha, vFrame, vRot, vStretch;
void main() {
  vec2 p = gl_PointCoord - 0.5; p.y = -p.y;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  p.x *= vStretch;
  vec2 uv = p + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  float col = mod(vFrame, 4.0), row = floor(vFrame / 4.0);
  vec2 auv = (vec2(col, 3.0 - row) + uv * 0.96 + 0.02) / 4.0;
  float a = texture2D(uMap, auv).r * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(clamp(vColor, 0.0, 8.0), clamp(a, 0.0, 1.0));
}`;

class ParticlePool {
  constructor(max, blending, order) {
    this.max = max;
    this.items = [];
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    const attr = (name, n) => { const a = new THREE.BufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    this.aPos = attr('position', 3);
    this.aColor = attr('aColor', 3);
    this.aAlpha = attr('aAlpha', 1);
    this.aSize = attr('aSize', 1);
    this.aFrame = attr('aFrame', 1);
    this.aRot = attr('aRot', 1);
    this.aStretch = attr('aStretch', 1);
    this.uniforms = { uMap: { value: TEX.atlas }, uViewH: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = order;
    for (let i = 0; i < max; i++) {
      this.items.push({ live: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), c0: new THREE.Color(), c1: new THREE.Color(),
        life: 0, maxLife: 1, s0: 0, s1: 0, a0: 1, frame: 0, rot: 0, rotV: 0, grav: 0, drag: 0, bounce: false, streak: false, fadeIn: 0 });
    }
  }

  // Lấy một hạt trống (nếu hết thì ghi đè hạt cũ nhất theo vòng)
  take() {
    for (let k = 0; k < this.max; k++) {
      const p = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      if (!p.live) return p;
    }
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    return p;
  }

  update(dt, camera, viewH) {
    this.uniforms.uViewH.value = viewH;
    const P = this.aPos.array, C = this.aColor.array, A = this.aAlpha.array, S = this.aSize.array,
      Fr = this.aFrame.array, R = this.aRot.array, St = this.aStretch.array;
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (!p.live) { if (A[i] !== 0) { A[i] = 0; S[i] = 0; } continue; }
      p.life -= dt;
      if (p.life <= 0) { p.live = false; A[i] = 0; S[i] = 0; continue; }
      const t = 1 - p.life / p.maxLife;
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.bounce && p.pos.y < 0.05) { p.pos.y = 0.05; p.vel.y *= -0.35; p.vel.x *= 0.6; p.vel.z *= 0.6; }
      p.rot += p.rotV * dt;
      let stretch = 1, rot = p.rot, size = p.s0 + (p.s1 - p.s0) * t;
      if (p.streak) {
        // Xoay vệt theo hướng bay trên màn hình
        tA.copy(p.pos).project(camera);
        tB.copy(p.pos).addScaledVector(p.vel, 0.02).project(camera);
        const dx = (tB.x - tA.x) * camera.aspect, dy = tB.y - tA.y;
        rot = Math.atan2(dy, dx) - Math.PI / 2;
        const sp = p.vel.length();
        size *= Math.min(2.2, 0.6 + sp * 0.08);
        stretch = 1;
      }
      const j = i * 3;
      P[j] = p.pos.x; P[j + 1] = p.pos.y; P[j + 2] = p.pos.z;
      C[j] = p.c0.r + (p.c1.r - p.c0.r) * t;
      C[j + 1] = p.c0.g + (p.c1.g - p.c0.g) * t;
      C[j + 2] = p.c0.b + (p.c1.b - p.c0.b) * t;
      const fadeIn = p.fadeIn > 0 ? Math.min(1, t / p.fadeIn) : 1;
      A[i] = p.a0 * Math.min(1, (1 - t) * 2.2) * fadeIn;
      S[i] = size;
      Fr[i] = p.frame;
      R[i] = rot;
      St[i] = stretch;
    }
    for (const a of [this.aPos, this.aColor, this.aAlpha, this.aSize, this.aFrame, this.aRot, this.aStretch]) a.needsUpdate = true;
  }

  clear() { for (const p of this.items) p.live = false; }
}

const tA = new THREE.Vector3(), tB = new THREE.Vector3();
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
const hsl = {};
let addPool = null, smokePool = null, fxScene = null, fxRenderer = null;

// Phát một hạt. o: { frame, color, color2, size, size2, life, vel, grav, drag, alpha, rotV, bounce, streak, smoke, hdr, fadeIn }
export function emit(pos, o) {
  if (!addPool) return;
  const p = (o.smoke ? smokePool : addPool).take();
  const hdr = o.smoke ? 1 : (o.hdr ?? 1.6);
  p.live = true;
  p.pos.copy(pos);
  if (o.vel) p.vel.copy(o.vel); else p.vel.set(0, 0, 0);
  p.c0.set(o.color ?? 0xffffff).multiplyScalar(hdr);
  p.c1.set(o.color2 ?? o.color ?? 0xffffff).multiplyScalar(hdr);
  p.life = p.maxLife = o.life ?? 0.5;
  p.s0 = o.size ?? 0.4;
  p.s1 = o.size2 ?? p.s0 * 0.3;
  p.a0 = o.alpha ?? 1;
  p.frame = o.frame ?? F.glow;
  p.rot = o.rot ?? Math.random() * Math.PI * 2;
  p.rotV = o.rotV ?? 0;
  p.grav = o.grav ?? 0;
  p.drag = o.drag ?? 0;
  p.bounce = !!o.bounce;
  p.streak = !!o.streak;
  p.fadeIn = o.fadeIn ?? 0;
  return p;
}

const rv = (s) => (Math.random() * 2 - 1) * s;
function randDir(speed, up, out) {
  const a = Math.random() * Math.PI * 2;
  const s = speed * (0.4 + Math.random() * 0.8);
  return out.set(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s);
}
const tmpV = new THREE.Vector3();

// Nổ hạt — API cũ, giờ tự chọn kiểu: màu xám/đất → bụi khói, màu tươi → tia lửa phát sáng
export function burst(pos, color, count = 10, opts = {}) {
  const { speed = 6, size = 0.14, life = 0.5, up = 4, gravity = 18 } = opts;
  tmpC.set(color).getHSL(hsl);
  const style = opts.style || (hsl.s < 0.3 && hsl.l < 0.85 ? 'dust' : 'spark');
  const n = Math.max(1, Math.round(count * density()));
  if (style === 'dust') {
    for (let i = 0; i < n; i++) {
      emit(pos, { smoke: true, frame: Math.random() < 0.5 ? F.dust : F.puff, color, size: size * 4, size2: size * 9,
        life: life * (1 + Math.random()), vel: randDir(speed * 0.45, up * 0.25, tmpV), grav: -0.6, drag: 3.5, alpha: 0.55, rotV: rv(2) });
    }
    return;
  }
  tmpC2.copy(tmpC).lerp(WHITE, 0.55);
  const hot = tmpC2.getHex();
  for (let i = 0; i < n; i++) {
    emit(pos, { frame: Math.random() < 0.15 ? F.sparkle : F.glow, color: hot, color2: color, size: size * (2.4 + Math.random() * 2), size2: size * 0.6,
      life: life * (0.6 + Math.random() * 0.6), vel: randDir(speed, up, tmpV), grav: gravity, drag: 1.2, bounce: true });
  }
  // Tia lửa vệt dài
  const m = n >= 4 ? Math.ceil(n * 0.45) : 0;
  for (let i = 0; i < m; i++) {
    emit(pos, { frame: F.streak, color: hot, color2: color, size: size * 6, size2: size * 3, life: life * (0.35 + Math.random() * 0.3),
      vel: randDir(speed * 1.6, up * 0.8, tmpV), grav: gravity * 0.6, drag: 2, streak: true, hdr: 2.2 });
  }
  // Chớp sáng ở tâm
  if (count >= 8) emit(pos, { frame: F.flare, color: hot, size: size * (10 + Math.min(count, 40) * 0.35), size2: size * 4, life: 0.14, hdr: 1.8, alpha: 0.9 });
}

// Khói (blend thường, bay lên, nở to)
export function smoke(pos, o = {}) {
  const { count = 6, color = 0x3a3430, size = 0.8, life = 1.2, speed = 1.5, rise = 1.2, alpha = 0.6 } = o;
  const n = Math.max(1, Math.round(count * density()));
  const base = pos.clone();
  for (let i = 0; i < n; i++) {
    emit(tmpV.copy(base).add(new THREE.Vector3(rv(0.3), rv(0.2), rv(0.3))), {
      smoke: true, frame: Math.random() < 0.6 ? F.smoke : F.puff, color, size: size * (0.6 + Math.random() * 0.5), size2: size * 2,
      life: life * (0.7 + Math.random() * 0.6), vel: randDir(speed, rise, new THREE.Vector3()), grav: -0.4, drag: 2, alpha, rotV: rv(1.5), fadeIn: 0.12,
    });
  }
}

// Lửa (cháy trên quái, thùng, vùng lửa)
export function flame(pos, o = {}) {
  const { count = 1, size = 0.6, life = 0.5, spread = 0.3, rise = 2.2 } = o;
  const base = pos.clone();
  for (let i = 0; i < count; i++) {
    emit(tmpV.copy(base).add(new THREE.Vector3(rv(spread), 0, rv(spread))), {
      frame: Math.random() < 0.5 ? F.flame : F.fire, color: o.color ?? 0xffa040, color2: o.color2 ?? 0xb02000, size: size * (0.7 + Math.random() * 0.6), size2: size * 0.2,
      life: life * (0.7 + Math.random() * 0.6), vel: new THREE.Vector3(rv(0.4), rise * (0.7 + Math.random() * 0.6), rv(0.4)), grav: -1, drag: 1, rotV: rv(3), fadeIn: 0.15, hdr: o.hdr ?? 1.1, alpha: o.alpha ?? 0.75,
    });
  }
}

// Chớp sáng (sprite + đèn)
export function flash(pos, color = 0xffffff, size = 3, life = 0.16, light = true) {
  emit(pos, { frame: F.flare, color, size, size2: size * 0.5, life, hdr: 2.2 });
  emit(pos, { frame: F.glow, color, size: size * 1.4, size2: size * 1.8, life: life * 1.3, alpha: 0.5, hdr: 1.4 });
  if (light) lightPulse(pos, color, 40 * Math.min(2, size / 3), size * 3.5, life * 2.5);
}

// Tia lửa khi đánh trúng
export function hitSpark(pos, color, big = false) {
  const s = big ? 1.6 : 1;
  emit(pos, { frame: F.impact, color: 0xfff4d8, color2: color, size: 1.5 * s, size2: 2.4 * s, life: 0.12, hdr: 2, alpha: 0.9 });
  emit(pos, { frame: F.star, color: 0xffffff, color2: color, size: 1.6 * s, size2: 0.6 * s, life: 0.1, hdr: 2.4 });
  const n = big ? 7 : 4;
  for (let i = 0; i < n; i++) emit(pos, { frame: F.streak, color: 0xfff0c0, color2: color, size: 0.8 * s, size2: 0.3, life: 0.18 + Math.random() * 0.12, vel: randDir(14 * s, 5, new THREE.Vector3()), grav: 20, drag: 3, streak: true, hdr: 2.4 });
}

// Vụ nổ hoàn chỉnh: chớp + cầu lửa + khói + tia lửa + vòng sóng + vết cháy
export function explosion(pos, radius = 3, color = 0xff7a2a, o = {}) {
  const p = tmpV.copy(pos).setY(Math.max(0.5, pos.y));
  const c = p.clone();
  const core = o.core ?? 0xffe08a;
  flash(c, core, radius * 1.6, 0.2);
  const n = Math.round(radius * 7 * density());
  for (let i = 0; i < n; i++) {
    emit(c, { frame: Math.random() < 0.5 ? F.fire : F.flame, color: core, color2: color, size: radius * (0.35 + Math.random() * 0.35), size2: radius * 0.15,
      life: 0.35 + Math.random() * 0.35, vel: randDir(radius * 3.2, 3, new THREE.Vector3()), drag: 4, grav: -2, rotV: rv(3), hdr: 2.2 });
  }
  burst(c, color, Math.round(radius * 6), { speed: radius * 4, size: 0.14, life: 0.7 });
  if (o.smoke !== false) smoke(c, { count: Math.round(radius * 2.5), size: radius * 0.55, life: 1.4, speed: radius * 0.9, rise: 1.5, color: o.smokeColor ?? 0x2a2420 });
  spawnRing(fxScene, pos, radius * 1.1, color, 0.4);
  if (o.scorch !== false) scorch(pos, radius * 0.8);
}

// ---------- Đèn chớp (pool cố định để không phải biên dịch lại shader) ----------
const lights = [];
export function lightPulse(pos, color, intensity = 40, distance = 8, life = 0.3) {
  if (!lights.length) return;
  let L = lights.find((l) => l.t <= 0) || lights.reduce((a, b) => (a.t < b.t ? a : b));
  L.light.color.set(color);
  L.light.position.set(pos.x, Math.max(1.2, pos.y + 0.6), pos.z);
  L.light.distance = distance;
  L.peak = intensity;
  L.t = L.max = life;
}
function updateLights(dt) {
  for (const L of lights) {
    if (L.t <= 0) { L.light.intensity = 0; continue; }
    L.t -= dt;
    const k = Math.max(0, L.t / L.max);
    L.light.intensity = L.peak * k * k;
  }
}

// ---------- Hình dán trên sàn: vết cháy, vòng phép ----------
const decals = [];
const planeGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
export function scorch(pos, radius = 1.5, life = 7) {
  if (!fxScene) return;
  const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: TEX.scorch, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(pos.x, 0.03 + decals.length * 0.0005, pos.z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.scale.setScalar(radius);
  fxScene.add(m);
  decals.push({ mesh: m, t: life, max: life, kind: 'scorch', base: 0.75 });
  while (decals.filter((d) => d.kind === 'scorch').length > 24) removeDecal(decals.findIndex((d) => d.kind === 'scorch'));
}
export function groundRune(pos, radius = 3, color = 0xffcf4a, life = 1, spin = 1.2) {
  if (!fxScene) return;
  const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: TEX.rune, color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(pos.x, 0.06, pos.z);
  m.scale.setScalar(radius);
  fxScene.add(m);
  decals.push({ mesh: m, t: life, max: life, kind: 'rune', spin, base: 1, follow: pos.isVector3 ? pos : null });
  return m;
}
// Vòng phép cố định (không tự biến mất) – dùng cho bệ phần thưởng
export function runeDecal(color, radius = 1.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: TEX.rune, color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.scale.setScalar(radius);
  return m;
}
function removeDecal(i) {
  const d = decals[i];
  d.mesh.parent?.remove(d.mesh);
  d.mesh.material.dispose();
  decals.splice(i, 1);
}
function updateDecals(dt) {
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i];
    d.t -= dt;
    const k = Math.max(0, d.t / d.max);
    if (d.kind === 'rune') {
      d.mesh.rotation.y += dt * d.spin;
      const grow = Math.min(1, (1 - k) * 6);
      d.mesh.material.opacity = Math.min(1, k * 3) * grow;
    } else d.mesh.material.opacity = d.base * Math.min(1, k * 2.5);
    if (d.t <= 0) removeDecal(i);
  }
}

// Sprite phát sáng gắn vào vật thể (đạn, cầu phép)
const glowMats = new Map();
export function glowSprite(color, size = 1, frame = F.glow) {
  const key = color + ':' + frame;
  if (!glowMats.has(key)) {
    const t = TEX.atlas.clone();
    t.repeat.set(0.24, 0.24);
    t.offset.set((frame % 4) / 4 + 0.005, (3 - Math.floor(frame / 4)) / 4 + 0.005);
    t.needsUpdate = true;
    glowMats.set(key, new THREE.SpriteMaterial({ map: t, color: new THREE.Color(color).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  }
  const s = new THREE.Sprite(glowMats.get(key));
  s.scale.setScalar(size);
  return s;
}

// ---------- Khởi tạo ----------
export function initFx(scene, renderer) {
  fxScene = scene;
  fxRenderer = renderer;
  addPool = new ParticlePool(2400, THREE.AdditiveBlending, 10);
  smokePool = new ParticlePool(600, THREE.NormalBlending, 9);
  scene.add(smokePool.points, addPool.points);
  for (let i = 0; i < 3; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 8, 1.6);
    scene.add(light);
    lights.push({ light, t: 0, max: 1, peak: 0 });
  }
}

// ---------- Vệt chém (shader: sáng ở mép ngoài, quét từ đầu đến cuối cung) ----------
const SLASH_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SLASH_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uHead, uFade;
varying vec2 vUv;
void main() {
  float behind = uHead - vUv.x;
  if (behind < 0.0) discard;
  float trail = exp(-behind * 2.6);
  float y = clamp(vUv.y, 0.001, 1.0);
  float edge = y * y * sqrt(y);
  float core = smoothstep(0.78, 0.97, y) * (1.0 - smoothstep(0.97, 1.0, y) * 0.6);
  float a = trail * (edge * 0.75 + core) * uFade;
  vec3 col = mix(uColor, vec3(1.0), core * 0.75 * trail) * (1.4 + core * 1.6);
  gl_FragColor = vec4(clamp(col, 0.0, 8.0), clamp(a, 0.0, 1.0));
}`;
function arcGeometry(r0, r1, start, arc, seg = 32) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, th = start + arc * u;
    for (let j = 0; j < 2; j++) {
      const r = j ? r1 : r0;
      pos.push(Math.cos(th) * r, Math.sin(th) * r, 0);
      uv.push(u, j);
    }
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.rotateX(-Math.PI / 2);
  return g;
}
const slashes = [];
export function spawnSlash(scene, pos, facing, arc, radius, color, flip) {
  const geo = arcGeometry(radius * 0.3, radius * 1.02, -Math.PI / 2 - arc / 2, arc);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uHead: { value: 0 }, uFade: { value: 1 } },
    vertexShader: SLASH_VERT, fragmentShader: SLASH_FRAG,
    transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos.x, 0.85, pos.z);
  mesh.rotation.y = facing;
  if (flip) mesh.scale.x = -1;
  mesh.renderOrder = 11;
  scene.add(mesh);
  slashes.push({ mesh, life: 0.22, maxLife: 0.22, color, radius, arc, facing, flip, sparked: false });
}

function updateSlashes(dt) {
  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i];
    s.life -= dt;
    const t = 1 - Math.max(0, s.life / s.maxLife);
    const u = s.mesh.material.uniforms;
    u.uHead.value = Math.min(1.6, t * 3.2);                  // quét nhanh trong ~1/3 đầu
    u.uFade.value = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
    const sc = 1 + t * 0.12;
    s.mesh.scale.set(Math.sign(s.mesh.scale.x) * sc, 1, sc);
    // Tia lửa văng ra ở đầu lưỡi chém khi quét xong
    if (!s.sparked && t > 0.3) {
      s.sparked = true;
      const side = s.flip ? -1 : 1;
      const th = s.facing + side * s.arc / 2;
      const p = new THREE.Vector3(s.mesh.position.x + Math.sin(th) * s.radius, 0.85, s.mesh.position.z + Math.cos(th) * s.radius);
      for (let k = 0; k < 3; k++) emit(p, { frame: F.streak, color: 0xffffff, color2: s.color, size: 0.5, size2: 0.2, life: 0.15, vel: randDir(8, 2, new THREE.Vector3()), drag: 4, streak: true, hdr: 2 });
    }
    if (s.life <= 0) {
      s.mesh.parent?.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      slashes.splice(i, 1);
    }
  }
}

// ---------- Sóng xung kích (texture vòng tròn) ----------
const rings = [];
export function spawnRing(scene, pos, radius, color, life = 0.35) {
  scene = scene || fxScene;
  if (!scene) return;
  const mat = new THREE.MeshBasicMaterial({ map: TEX.ring, color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(planeGeo, mat);
  mesh.position.set(pos.x, 0.08, pos.z);
  mesh.renderOrder = 8;
  scene.add(mesh);
  // Quầng sáng dưới sàn
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(color).multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(planeGeo, glowMat);
  glow.position.set(pos.x, 0.07, pos.z);
  scene.add(glow);
  rings.push({ mesh, glow, radius: radius / 0.86, life, maxLife: life });
}
let _glowTex = null;
function glowTex() {
  if (!_glowTex) { _glowTex = TEX.atlas.clone(); _glowTex.repeat.set(0.24, 0.24); _glowTex.offset.set(0.005, 0.755); _glowTex.needsUpdate = true; }
  return _glowTex;
}

// ---------- Tia sét (ống phát sáng gấp khúc + nhánh) ----------
const bolts = [];
function jagged(a, b, seg, jitter) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const p = new THREE.Vector3().lerpVectors(a, b, i / seg);
    if (i > 0 && i < seg) p.add(new THREE.Vector3(rv(jitter), rv(jitter * 0.5), rv(jitter)));
    pts.push(p);
  }
  return pts;
}
function tubeFrom(pts, radius) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  return new THREE.TubeGeometry(path, pts.length * 2, radius, 5, false);
}
export function spawnBolt(scene, a, b, color) {
  scene = scene || fxScene;
  const len = a.distanceTo(b);
  const pts = jagged(a, b, Math.max(5, Math.round(len * 1.2)), Math.min(0.9, 0.25 + len * 0.05));
  const group = new THREE.Group();
  const mk = (geo, c, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(mk(tubeFrom(pts, 0.045), 0xffffff, 1));
  group.add(mk(tubeFrom(pts, 0.16), color, 0.45));
  // Nhánh phụ
  if (len > 2) {
    const k = 1 + Math.floor(Math.random() * (pts.length - 2));
    const end = pts[k].clone().add(new THREE.Vector3(rv(len * 0.25), -len * 0.1, rv(len * 0.25)));
    group.add(mk(tubeFrom(jagged(pts[k], end, 3, 0.25), 0.03), color, 0.8));
  }
  scene.add(group);
  bolts.push({ group, life: 0.22, max: 0.22 });
  emit(b, { frame: F.elec, color, size: 1.8, size2: 2.4, life: 0.18, hdr: 2 });
  emit(b, { frame: F.flare, color: 0xffffff, color2: color, size: 2.2, life: 0.12, hdr: 2 });
  lightPulse(b, color, 30, 7, 0.2);
}

function updateRingsAndBolts(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    const t = Math.max(0, r.life / r.maxLife);
    const e = 1 - Math.pow(t, 2.2);                           // nở nhanh rồi chậm lại
    r.mesh.scale.setScalar(r.radius * (0.15 + e * 0.95));
    r.mesh.material.opacity = Math.min(1, t * 1.6);
    r.glow.scale.setScalar(r.radius * 0.9 * (0.3 + e * 0.7));
    r.glow.material.opacity = t * t * 0.8;
    if (r.life <= 0) {
      r.mesh.parent?.remove(r.mesh); r.mesh.material.dispose();
      r.glow.parent?.remove(r.glow); r.glow.material.dispose();
      rings.splice(i, 1);
    }
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    const k = Math.max(0, b.life / b.max);
    const flick = 0.6 + Math.random() * 0.4;
    b.group.children.forEach((m, j) => { m.material.opacity = (j === 1 ? 0.45 : 1) * k * flick; });
    if (b.life <= 0) {
      b.group.parent?.remove(b.group);
      b.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      bolts.splice(i, 1);
    }
  }
}

// ---------- Hiệu ứng trạng thái trên quái (gọi mỗi khung) ----------
export function statusFx(e, dt) {
  const h = (e.isBoss ? 2 : 1) * (e.giant || 1);
  const d = density();
  if (e.burnT > 0 && Math.random() < dt * 9 * d) flame(tmpV.set(e.pos.x, 0.4 + Math.random() * 0.5 * h, e.pos.z), { size: 0.4 * h, spread: 0.3 * h, life: 0.4, alpha: 0.6 });
  if (e.frozenT > 0 && Math.random() < dt * 10 * d) {
    emit(tmpV.set(e.pos.x + rv(0.5 * h), 0.3 + Math.random() * h, e.pos.z + rv(0.5 * h)), { frame: Math.random() < 0.5 ? F.cross : F.sparkle, color: 0xdff8ff, color2: 0x6fc3ff, size: 0.5, size2: 0.1, life: 0.5, vel: new THREE.Vector3(0, 0.3, 0), rotV: rv(3) });
    if (Math.random() < 0.4) emit(tmpV.set(e.pos.x, 0.2, e.pos.z), { smoke: true, frame: F.puff, color: 0xbfe8ff, size: 0.8 * h, size2: 1.6 * h, life: 0.8, alpha: 0.25, vel: new THREE.Vector3(rv(0.4), 0.2, rv(0.4)), rotV: rv(1) });
  } else if (e.slowT > 0 && Math.random() < dt * 4 * d) {
    emit(tmpV.set(e.pos.x + rv(0.4), 0.4 + Math.random() * h, e.pos.z + rv(0.4)), { frame: F.sparkle, color: 0xaeeaff, size: 0.35, life: 0.4, vel: new THREE.Vector3(0, -0.4, 0) });
  }
  if (e.poisonStacks > 0 && Math.random() < dt * (4 + e.poisonStacks * 2) * d) {
    emit(tmpV.set(e.pos.x + rv(0.4 * h), 0.4 + Math.random() * 0.8 * h, e.pos.z + rv(0.4 * h)), { frame: F.glow, color: 0xbfff7a, color2: 0x3a8a10, size: 0.35, size2: 0.05, life: 0.7, vel: new THREE.Vector3(0, 0.9, 0) });
  }
  // Boss nổi giận: hào quang đỏ bốc lên
  if (e.phase > 0 && Math.random() < dt * 14 * d) {
    emit(tmpV.set(e.pos.x + rv(0.8), 0.2, e.pos.z + rv(0.8)), { frame: F.flame, color: 0xff6a4a, color2: 0x8a0010, size: 1.1, size2: 0.2, life: 0.6, vel: new THREE.Vector3(0, 2.5, 0), alpha: 0.6, hdr: 1.3, fadeIn: 0.2 });
  }
  if (e.shockT > 0 && Math.random() < dt * 9 * d) {
    emit(tmpV.set(e.pos.x + rv(0.3), 0.5 + Math.random() * 0.8 * h, e.pos.z + rv(0.3)), { frame: F.elec, color: 0xfff07a, color2: 0x7ab8ff, size: 1.1 * h, size2: 0.9 * h, life: 0.12, hdr: 2.2 });
  }
}

// ---------- Vùng cảnh báo đòn đánh của quái (phân màu theo Tam Giác Phản Phá) ----------
// shape: 'circle' (radius) | 'sector' (radius, arc, facing) | 'rect' (width, length, facing)
// kind: 'normal' (đỏ cam) | 'pierce' (đỏ-trắng: Lướt VÀO để Phản Xuyên) | 'interrupt' (tím: Kỹ năng/Đòn nặng để Cắt Chiêu)
const telegraphs = [];
export function spawnTelegraph(scene, opts) {
  const { shape = 'circle', pos, radius = 2, arc = 1.6, facing = 0, width = 1.5, length = 8, duration = 0.8, kind = 'normal' } = opts;
  const color = opts.color ?? (kind === 'pierce' ? 0xff2850 : kind === 'interrupt' ? 0xc050ff : 0xff3020);
  const group = new THREE.Group();
  const mk = (geo, opacity, col = color) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  let base, fill, edge;
  if (shape === 'rect') {
    const g = new THREE.PlaneGeometry(width, length).translate(0, length / 2, 0);
    g.rotateX(-Math.PI / 2);
    g.scale(1, 1, -1);                               // kéo dài theo +Z
    base = mk(g, 0.16); fill = mk(g.clone(), 0.34);
    edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: kind === 'pierce' ? 0xffffff : color, transparent: true, opacity: 0.9 }));
  } else {
    const start = shape === 'sector' ? -Math.PI / 2 - arc / 2 : 0;
    const len = shape === 'sector' ? arc : Math.PI * 2;
    const g = new THREE.CircleGeometry(radius, 40, start, len);
    g.rotateX(-Math.PI / 2);
    base = mk(g, 0.16); fill = mk(g.clone(), 0.34);
    const ring = new THREE.RingGeometry(radius * 0.93, radius, 48, 1, start, len);
    ring.rotateX(-Math.PI / 2);
    edge = mk(ring, 0.9, kind === 'pierce' ? 0xffeef2 : kind === 'interrupt' ? 0xe8a8ff : color);
  }
  group.add(base, fill, edge);
  // Dấu hiệu phụ trực quan cho đòn Phản Xuyên (viền trắng chói) và Cắt Chiêu (vòng cổ ngữ tím xoay)
  if (kind === 'interrupt') {
    const r = shape === 'rect' ? Math.max(1.2, width * 0.8) : Math.min(radius, 3.2);
    const rune = mk(new THREE.RingGeometry(r * 0.55, r * 0.68, 6).rotateX(-Math.PI / 2), 0.75, 0xf0c0ff);
    rune.position.y = 0.02;
    group.add(rune);
    group.userData.spin = rune;
  } else if (kind === 'pierce') {
    const chev = mk(new THREE.RingGeometry(0.45, 0.7, 3).rotateX(-Math.PI / 2), 0.9, 0xffffff);
    chev.position.set(0, 0.02, shape === 'rect' ? Math.min(2.2, length * 0.3) : 0);
    group.add(chev);
    group.userData.pulse = chev;
  }
  group.position.set(pos.x, 0.06, pos.z);
  group.rotation.y = facing;
  fill.scale.setScalar(0.01);
  scene.add(group);
  const t = { group, fill, edge, shape, kind, t: 0, duration, done: false };
  telegraphs.push(t);
  return t;
}

export function removeTelegraph(t) { t.done = true; }

function updateTelegraphs(dt) {
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const t = telegraphs[i];
    t.t += dt;
    const k = Math.min(1, t.t / t.duration);
    if (t.shape === 'rect') t.fill.scale.set(1, 1, Math.max(0.01, k));
    else t.fill.scale.setScalar(Math.max(0.01, k));
    if (t.group.userData.spin) t.group.userData.spin.rotation.y += dt * 4.5;
    if (t.group.userData.pulse) t.group.userData.pulse.scale.setScalar(0.9 + Math.sin(t.t * 28) * 0.25);
    // Nhấp nháy mép khi sắp đánh
    if (k > 0.65 || t.kind !== 'normal') t.edge.material.opacity = 0.55 + Math.sin(t.t * 42) * 0.45;
    if (k >= 1 || t.done) {
      t.group.parent?.remove(t.group);
      t.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      telegraphs.splice(i, 1);
    }
  }
}

// ---------- Số sát thương bay lên ----------
const dmgLayer = document.getElementById('dmg-layer');
const dmgNums = [];
const tmpP = new THREE.Vector3();

export const dmgScale = { player: 1 };
export function damageNumber(pos, value, kind = '') {
  if (kind === 'player' && typeof value === 'number') value = Math.max(1, Math.round(value * dmgScale.player));
  const el = document.createElement('div');
  el.className = 'dmg ' + kind;
  el.textContent = value;
  dmgLayer.appendChild(el);
  dmgNums.push({
    el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.2, 0)),
    vy: 2.5, life: 0.8,
  });
}

function updateDamageNumbers(dt, camera) {
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i];
    d.life -= dt;
    d.vy -= 5 * dt;
    d.pos.y += d.vy * dt;
    tmpP.copy(d.pos).project(camera);
    const x = (tmpP.x * 0.5 + 0.5) * innerWidth;
    const y = (-tmpP.y * 0.5 + 0.5) * innerHeight;
    const pop = d.life > 0.65 ? 1 + (d.life - 0.65) * 4 : 1;
    d.el.style.left = x + 'px';
    d.el.style.top = y + 'px';
    d.el.style.opacity = Math.min(1, d.life * 3);
    d.el.style.transform = `translate(-50%,-50%) scale(${pop})`;
    if (d.life <= 0) { d.el.remove(); dmgNums.splice(i, 1); }
  }
}

export function clearFx() {
  for (const t of telegraphs) t.done = true;
  updateTelegraphs(0);
  for (const d of dmgNums) d.el.remove();
  dmgNums.length = 0;
  addPool?.clear();
  smokePool?.clear();
  while (decals.length) removeDecal(decals.length - 1);
  for (const L of lights) L.t = 0;
}

// Cập nhật toàn bộ hiệu ứng. `dt` là thời gian game (bị đóng băng khi hit stop),
// `realDt` là thời gian thật (để số sát thương vẫn bay khi hit stop).
export function updateFx(dt, realDt, camera) {
  const viewH = fxRenderer ? fxRenderer.domElement.height : innerHeight;
  addPool?.update(dt, camera, viewH);
  smokePool?.update(dt, camera, viewH);
  updateTelegraphs(dt);
  updateSlashes(realDt);
  updateRingsAndBolts(realDt);
  updateLights(realDt);
  updateDecals(dt);
  updateLiquids(realDt);
  updateDamageNumbers(realDt, camera);
}

// ---------- Chất lỏng / mặt sàn đặc biệt: nham thạch chảy, băng nứt, vực tối ----------
const NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
// vân nứt kiểu Voronoi (khoảng cách tới cạnh ô)
float cracks(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); vec2 o = vec2(h21(i + g), h21(i + g + 7.7));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }`;
const liquidMats = [];
const LIQUID = {
  lava: { a: [0.045, 0.014, 0.008], b: [0.85, 0.16, 0.02], c: [1.0, 0.55, 0.12], glow: 0.9, flow: 0.05 },
  ice: { a: [0.16, 0.34, 0.5], b: [0.36, 0.62, 0.82], c: [0.9, 1.0, 1.0], glow: 0.8, flow: 0 },
  water: { a: [0.02, 0.08, 0.16], b: [0.08, 0.32, 0.56], c: [0.45, 0.85, 1.0], glow: 0.85, flow: 0.04 },
  elec: { a: [0.04, 0.08, 0.18], b: [0.3, 0.55, 0.9], c: [1.0, 0.95, 0.45], glow: 1.5, flow: 0.12 },
  obsidian: { a: [0.04, 0.03, 0.05], b: [0.14, 0.12, 0.18], c: [0.5, 0.32, 0.75], glow: 0.45, flow: 0 },
  void: { a: [0.0, 0.0, 0.0], b: [0.03, 0.025, 0.02], c: [0.12, 0.1, 0.08], glow: 0.4, flow: 0.01 },
  mist: { a: [0.0, 0.01, 0.005], b: [0.02, 0.09, 0.04], c: [0.15, 0.5, 0.25], glow: 0.6, flow: 0.015 },
};
export function liquidMaterial(kind = 'lava', opts = {}) {
  const L = LIQUID[kind];
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: Math.random() * 100 }, uA: { value: new THREE.Vector3(...L.a) }, uB: { value: new THREE.Vector3(...L.b) }, uC: { value: new THREE.Vector3(...L.c) },
      uGlow: { value: L.glow }, uFlow: { value: L.flow }, uIce: { value: kind === 'ice' ? 1 : 0 }, uScale: { value: opts.scale ?? 0.45 } },
    vertexShader: `attribute float aEdge; varying float vEdge; varying vec2 vW;
      void main(){ vEdge = aEdge; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: NOISE + `
      uniform float uTime, uGlow, uFlow, uIce, uScale; uniform vec3 uA, uB, uC; varying float vEdge; varying vec2 vW;
      void main(){
        vec2 p = vW * uScale;
        float t = uTime;
        float n = fbm(p + vec2(t * uFlow * 2.0, t * uFlow) + fbm(p * 1.7 - t * uFlow * 3.0) * 1.2);
        float k = cracks(p * 1.4 + n * 0.6);
        vec3 col;
        float a = 1.0;
        if (uIce > 0.5) {
          // băng: nền xanh nhạt, vết nứt trắng, vệt phản chiếu
          float line = 1.0 - smoothstep(0.0, 0.06, k);
          float streak = smoothstep(0.6, 0.9, fbm(vec2(p.x + p.y * 0.6, p.y) * 0.8));
          col = mix(uA, uB, n) + uC * line * 0.6 + streak * 0.15;
          col *= uGlow;
          a = 0.62 * (1.0 - smoothstep(0.7, 1.0, vEdge));
        } else {
          // nham/vực: các mảng vỏ nguội trôi trên dòng nóng, khe nứt phát sáng
          float hot = smoothstep(0.3, 0.66, n) + (1.0 - smoothstep(0.0, 0.12, k)) * 0.8;
          hot *= 1.0 - smoothstep(0.55, 1.0, vEdge) * 0.85;
          hot = clamp(hot, 0.0, 1.0);
          col = mix(uA, uB, hot);
          col = mix(col, uC, smoothstep(0.75, 1.0, hot));
          col *= 1.0 + hot * uGlow;
          a = 1.0 - smoothstep(0.88, 1.0, vEdge);
        }
        gl_FragColor = vec4(clamp(col, 0.0, 8.0), a);
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  liquidMats.push(m);
  return m;
}
// Hình vũng méo tự nhiên: các vòng đồng tâm có thuộc tính aEdge (0 tâm → 1 mép)
export function blobGeometry(r, rand = Math.random, seg = 48) {
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28], am = [0.14 + rand() * 0.1, 0.08 + rand() * 0.06, 0.04];
  const R = (th) => r * (1 + am[0] * Math.sin(3 * th + ph[0]) + am[1] * Math.sin(5 * th + ph[1]) + am[2] * Math.sin(9 * th + ph[2]));
  const rings = [0, 0.45, 0.75, 0.92, 1.0];
  const pos = [0, 0, 0], edge = [0], idx = [];
  for (let k = 1; k < rings.length; k++) for (let i = 0; i < seg; i++) {
    const th = (i / seg) * Math.PI * 2, rr = R(th) * rings[k];
    pos.push(Math.cos(th) * rr, 0, Math.sin(th) * rr); edge.push(rings[k]);
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let k = 1; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) {
    const a = 1 + (k - 1) * seg + i, b = 1 + (k - 1) * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.userData.radiusAt = R;
  return g;
}
// Mặt phẳng chữ nhật có mép mờ (đáy vực)
export function rectLiquid(w, h, kind) {
  const g = new THREE.PlaneGeometry(w, h, 1, 1).rotateX(-Math.PI / 2);
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute([0, 0, 0, 0], 1));
  return new THREE.Mesh(g, liquidMaterial(kind, { scale: 0.35 }));
}
export function updateLiquids(dt) {
  for (let i = liquidMats.length - 1; i >= 0; i--) {
    const m = liquidMats[i];
    if (m.userData.disposed) { liquidMats.splice(i, 1); continue; }
    m.uniforms.uTime.value += dt;
  }
}
export function disposeLiquids() { for (const m of liquidMats) { m.dispose(); m.userData.disposed = true; } liquidMats.length = 0; }
