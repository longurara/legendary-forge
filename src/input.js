// Bàn phím + chuột + tay cầm. `pressed` chứa phím vừa bấm trong frame này (xóa cuối mỗi frame).
export const keys = new Set();
export const pressed = new Set();
export const mouse = { x: 0, y: 0, down: false, clicked: false, rdown: false, rclicked: false, rreleased: false };
// Tay cầm: move/aim là vector (x, z) trên mặt sàn; attack/special là giữ nút
export const pad = { active: false, move: { x: 0, z: 0 }, aim: null, attack: false, special: false };

addEventListener('keydown', (e) => {
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  pad.active = false;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = mouse.rdown = false; });
addEventListener('mousemove', (e) => {
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
  if (any) pad.active = true;
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
