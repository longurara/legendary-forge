// Bàn phím + chuột + tay cầm. `pressed` chứa phím vừa bấm trong frame này (xóa cuối mỗi frame).
export const keys = new Set();
export const pressed = new Set();
export const mouse = { x: 0, y: 0, down: false, clicked: false, rdown: false, rclicked: false, rreleased: false };
// Tay cầm: move/aim là vector (x, z) trên mặt sàn; attack/special là giữ nút
export const pad = { active: false, move: { x: 0, z: 0 }, aim: null, attack: false, special: false };
// Chơi 2 người: tay cầm ghi vào p2 thay vì pad/pressed/mouse của người chơi 1
export const coop = { on: false, p2: { move: { x: 0, z: 0 }, aim: null, attack: false, special: false, clicked: false, rclicked: false, rreleased: false, pressed: new Set(), connected: false } };

addEventListener('keydown', (e) => {
  touch.active = false;
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  pad.active = false;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = mouse.rdown = false; });
addEventListener('mousemove', (e) => {
  if (e.sourceCapabilities?.firesTouchEvents) return;
  touch.active = false;
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  pad.active = false;
});
addEventListener('mousedown', (e) => {
  if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
  if (e.button === 2) { mouse.rdown = true; mouse.rclicked = true; }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.down = false;
  if (e.button === 2) { mouse.rdown = false; mouse.rreleased = true; }
});
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Tay cầm (Gamepad API, sơ đồ nút kiểu Xbox) ----------
const prevBtn = [];
const BTN_TO_KEY = { 0: 'Space', 2: 'KeyE', 3: 'KeyQ', 4: 'KeyR', 5: 'KeyR', 9: 'Escape', 8: 'KeyM' };
const dead = (v) => (Math.abs(v) < 0.2 ? 0 : v);
export function pollGamepad() {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  coop.p2.connected = !!gp;
  if (!gp) return;
  const b = gp.buttons.map((x) => x.pressed);
  if (coop.on) {
    const q = coop.p2;
    q.move.x = dead(gp.axes[0] || 0); q.move.z = dead(gp.axes[1] || 0);
    const ax = dead(gp.axes[2] || 0), az = dead(gp.axes[3] || 0);
    q.aim = Math.hypot(ax, az) > 0.3 ? { x: ax, z: az } : (Math.hypot(q.move.x, q.move.z) > 0.3 ? { x: q.move.x, z: q.move.z } : q.aim);
    const wa = q.attack, ws = q.special;
    q.attack = !!b[7] || !!b[2];
    q.special = !!b[6] || !!b[1];
    if (q.attack && !wa) q.clicked = true;
    if (q.special && !ws) q.rclicked = true;
    if (!q.special && ws) q.rreleased = true;
    for (const [i, code] of Object.entries({ 0: 'Space', 3: 'KeyQ', 4: 'KeyR', 5: 'KeyR' })) if (b[i] && !prevBtn[i]) q.pressed.add(code);
    if (b[9] && !prevBtn[9]) pressed.add('Escape');
    b.forEach((v, i) => { prevBtn[i] = v; });
    return;
  }
  const any = b.some(Boolean) || gp.axes.some((a) => Math.abs(a) > 0.3);
  if (any) { pad.active = true; touch.active = false; }
  if (!pad.active) return;
  pad.move.x = dead(gp.axes[0] || 0);
  pad.move.z = dead(gp.axes[1] || 0);
  const ax = dead(gp.axes[2] || 0), az = dead(gp.axes[3] || 0);
  pad.aim = Math.hypot(ax, az) > 0.3 ? { x: ax, z: az } : (Math.hypot(pad.move.x, pad.move.z) > 0.3 ? { x: pad.move.x, z: pad.move.z } : pad.aim);
  const wasAttack = pad.attack, wasSpecial = pad.special;
  pad.attack = !!b[7] || !!b[1] && false;
  pad.special = !!b[6] || !!b[1];
  if (pad.attack && !wasAttack) mouse.clicked = true;
  if (pad.special && !wasSpecial) mouse.rclicked = true;
  if (!pad.special && wasSpecial) mouse.rreleased = true;
  for (const [i, code] of Object.entries(BTN_TO_KEY)) if (b[i] && !prevBtn[i]) pressed.add(code);
  // D-pad trong menu lên cấp: 1-4
  for (const [i, code] of [[12, 'Digit1'], [15, 'Digit2'], [13, 'Digit3'], [14, 'Digit4']]) if (b[i] && !prevBtn[i]) pressed.add(code);
  b.forEach((v, i) => { prevBtn[i] = v; });
}

export function endFrame() {
  pressed.clear();
  coop.p2.pressed.clear(); coop.p2.clicked = coop.p2.rclicked = coop.p2.rreleased = false;
  mouse.clicked = false;
  mouse.rclicked = false;
  mouse.rreleased = false;
}

// ---------- Cảm ứng di động: Floating Joystick + Kéo Ngắm (Attack & Special) + Haptic ----------
export const touch = { active: false, move: { x: 0, z: 0 }, aim: null, attack: false, special: false };
const TOUCH_KEY = 'lorenh_touch_cfg';
const touchCfg = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(TOUCH_KEY) || '{}');
    return { floating: raw.floating !== false, haptic: raw.haptic !== false, alpha: Number(raw.alpha) || 0.9 };
  } catch { return { floating: true, haptic: true, alpha: 0.9 }; }
})();
export const getTouchCfg = () => ({ ...touchCfg });
export function setTouchCfg(patch = {}) {
  Object.assign(touchCfg, patch);
  try { localStorage.setItem(TOUCH_KEY, JSON.stringify(touchCfg)); } catch {}
  if (controls?.style?.setProperty) controls.style.setProperty('--touch-alpha', String(touchCfg.alpha));
}
export function haptic(ms = 12) {
  if (!touch.active || !touchCfg.haptic || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch {}
}

const controls = document.getElementById('touch-controls');
const moveZone = document.getElementById('move-zone');
const moveStick = document.getElementById('move-stick');
const stickKnob = moveStick?.querySelector?.('span') || null;
const stickArrow = moveStick?.querySelector?.('.stick-arrow') || null;
const fsBtn = document.getElementById('touch-fs');
if (controls?.style?.setProperty) controls.style.setProperty('--touch-alpha', String(touchCfg.alpha));

// Nút Toàn màn hình (Fullscreen) trên điện thoại Android / trình duyệt hỗ trợ
if (fsBtn && fsBtn.addEventListener) {
  const canFs = !!(document.documentElement?.requestFullscreen || document.documentElement?.webkitRequestFullscreen);
  if (!canFs) fsBtn.hidden = true;
  else {
    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fsEl) (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
        else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } catch {}
    });
  }
}

const pointers = new Map();

function updateAimVisual(button, dx, dy, length) {
  const ind = button?.querySelector?.('.aim-ind');
  if (!ind) return;
  if (length > 10) {
    const deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    ind.style.opacity = '1';
    ind.style.transform = `rotate(${deg}deg)`;
  } else {
    ind.style.opacity = '0';
  }
}

function updateStick(pointer, event) {
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  const length = Math.hypot(dx, dy);
  if (pointer.action === 'move') {
    const radius = ((moveStick?.clientWidth || 104) * 0.36);
    const scale = length < 5 ? 0 : 1 / Math.max(radius, length);
    touch.move.x = dx * scale;
    touch.move.z = dy * scale;
    if (stickKnob) stickKnob.style.transform = `translate(${touch.move.x * radius}px,${touch.move.z * radius}px)`;
    if (stickArrow) {
      if (length > 8) {
        const deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        stickArrow.style.opacity = '1';
        stickArrow.style.transform = `rotate(${deg}deg)`;
      } else stickArrow.style.opacity = '0';
    }
  } else if (pointer.action === 'attack' || pointer.action === 'special') {
    touch.aim = length > 10 ? { x: dx / length, z: dy / length } : null;
    updateAimVisual(pointer.button, dx, dy, length);
  }
}

if (controls && controls.addEventListener) {
  controls.addEventListener('pointerdown', (event) => {
    const target = event.target?.closest?.('[data-action]');
    if (!target || target.classList.contains('held')) return;
    event.preventDefault();
    const action = target.dataset.action;
    const pointer = { button: target, action, x: event.clientX, y: event.clientY };

    if (action === 'move' && moveStick && moveZone) {
      const zRect = moveZone.getBoundingClientRect();
      const sW = moveStick.clientWidth || 104;
      const half = sW / 2;
      if (touchCfg.floating) {
        // Đặt tâm Floating Joystick ngay tại vị trí chạm ngón cái (kẹp an toàn trong vùng chạm)
        const relX = Math.max(half + 6, Math.min(zRect.width - half - 6, event.clientX - zRect.left));
        const relY = Math.max(half + 6, Math.min(zRect.height - half - 6, event.clientY - zRect.top));
        moveStick.style.left = `${relX - half}px`;
        moveStick.style.top = `${relY - half}px`;
        moveStick.style.bottom = 'auto';
        pointer.x = zRect.left + relX;
        pointer.y = zRect.top + relY;
      } else {
        const sRect = moveStick.getBoundingClientRect();
        pointer.x = sRect.left + sRect.width / 2;
        pointer.y = sRect.top + sRect.height / 2;
      }
      moveStick.classList.add('active');
    }

    touch.active = true;
    pad.active = false;
    try { target.setPointerCapture(event.pointerId); } catch {}
    target.classList.add('held');
    pointers.set(event.pointerId, pointer);

    if (action === 'attack') {
      touch.attack = mouse.clicked = true;
    } else if (action === 'special') {
      touch.special = mouse.rclicked = mouse.rdown = true;
      haptic(10);
    } else if (action !== 'move') {
      pressed.add(action);
      if (action === 'Space' || action === 'KeyQ' || action === 'KeyE' || action === 'KeyR') haptic(action === 'KeyR' ? 20 : 10);
    }
    updateStick(pointer, event);
  });

  controls.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (pointer) updateStick(pointer, event);
  });
}

function releaseTouch(id) {
  const pointer = pointers.get(id);
  if (!pointer) return;
  pointers.delete(id);
  pointer.button.classList.remove('held');
  if (pointer.action === 'move') {
    touch.move.x = touch.move.z = 0;
    if (stickKnob) stickKnob.style.transform = '';
    if (stickArrow) stickArrow.style.opacity = '0';
    if (moveStick) {
      moveStick.classList.remove('active');
      moveStick.style.left = '';
      moveStick.style.top = '';
      moveStick.style.bottom = '';
    }
  } else if (pointer.action === 'attack') {
    touch.attack = false;
    updateAimVisual(pointer.button, 0, 0, 0);
    if (!touch.special) touch.aim = null;
  } else if (pointer.action === 'special') {
    touch.special = false;
    mouse.rdown = false;
    mouse.rreleased = true;
    updateAimVisual(pointer.button, 0, 0, 0);
    if (!touch.attack) touch.aim = null;
  }
  try { if (pointer.button.hasPointerCapture?.(id)) pointer.button.releasePointerCapture(id); } catch {}
}

if (controls && controls.addEventListener) {
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    controls.addEventListener(name, (event) => releaseTouch(event.pointerId));
  }
}
export function resetTouch() {
  for (const id of [...pointers.keys()]) releaseTouch(id);
  touch.active = false;
}
addEventListener('blur', resetTouch);
