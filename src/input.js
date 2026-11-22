// Bàn phím + chuột + tay cầm. `pressed` chứa phím vừa bấm trong frame này (xóa cuối mỗi frame).
export const keys = new Set();
export const pressed = new Set();
export const mouse = { x: 0, y: 0, down: false, clicked: false, rdown: false, rclicked: false, rreleased: false };
// Tay cầm: move/aim là vector (x, z) trên mặt sàn; attack/special là giữ nút
export const pad = { active: false, move: { x: 0, z: 0 }, aim: null, attack: false, special: false };

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
  if (!gp) return;
  const b = gp.buttons.map((x) => x.pressed);
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
  mouse.clicked = false;
  mouse.rclicked = false;
  mouse.rreleased = false;
}

// Each thumb owns its pointer until release, even when dragged outside its button.
export const touch = { active: false, move: { x: 0, z: 0 }, aim: null, attack: false, special: false };
const controls = document.getElementById('touch-controls');
const pointers = new Map();

function updateStick(pointer, event) {
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  const length = Math.hypot(dx, dy);
  if (pointer.action === 'move') {
    const radius = pointer.button.clientWidth * 0.34;
    const scale = length < 4 ? 0 : 1 / Math.max(radius, length);
    touch.move.x = dx * scale;
    touch.move.z = dy * scale;
    pointer.button.firstElementChild.style.transform = `translate(${touch.move.x * radius}px,${touch.move.z * radius}px)`;
  } else if (pointer.action === 'attack') {
    touch.aim = length > 9 ? { x: dx / length, z: dy / length } : null;
  }
}

controls.addEventListener('pointerdown', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.classList.contains('held')) return;
  event.preventDefault();
  const action = button.dataset.action;
  const rect = button.getBoundingClientRect();
  const pointer = { button, action, x: event.clientX, y: event.clientY };
  if (action === 'move') {
    pointer.x = rect.left + rect.width / 2;
    pointer.y = rect.top + rect.height / 2;
  }
  touch.active = true;
  pad.active = false;
  button.setPointerCapture(event.pointerId);
  button.classList.add('held');
  pointers.set(event.pointerId, pointer);
  if (action === 'attack') touch.attack = mouse.clicked = true;
  else if (action === 'special') touch.special = mouse.rclicked = true;
  else if (action !== 'move') pressed.add(action);
  updateStick(pointer, event);
});
controls.addEventListener('pointermove', event => {
  const pointer = pointers.get(event.pointerId);
  if (pointer) updateStick(pointer, event);
});
function releaseTouch(id) {
  const pointer = pointers.get(id);
  if (!pointer) return;
  pointers.delete(id);
  pointer.button.classList.remove('held');
  if (pointer.action === 'move') {
    touch.move.x = touch.move.z = 0;
    pointer.button.firstElementChild.style.transform = '';
  } else if (pointer.action === 'attack') {
    touch.attack = false;
    touch.aim = null;
  } else if (pointer.action === 'special') {
    touch.special = false;
    mouse.rreleased = true;
  }
  if (pointer.button.hasPointerCapture(id)) pointer.button.releasePointerCapture(id);
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  controls.addEventListener(name, event => releaseTouch(event.pointerId));
}
export function resetTouch() {
  for (const id of pointers.keys()) releaseTouch(id);
  touch.active = false;
}
addEventListener('blur', resetTouch);
