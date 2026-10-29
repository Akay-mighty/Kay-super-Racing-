// Touch input, using the pointer-capture pattern from mrdoob/slop-newyork (MIT) js/touch-controls.js.
// Each finger is tracked by pointerId so steering and buttons work at the same time.
export const touch = { active: false, steer: 0, down: 0, boost: 0, drift: 0, fly: 0, item: 0, mode: 'stick' };

const root = document.getElementById('touch');
const stick = document.getElementById('stick');
const knob = document.getElementById('knob');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function setActive(v) {
  if (v === touch.active) return;
  touch.active = v; document.body.classList.toggle('touch', v); root.hidden = !v;
}
const mq = matchMedia('(any-pointer: coarse)');
setActive(mq.matches);
mq.addEventListener('change', () => setActive(mq.matches));
addEventListener('pointerdown', e => { if (e.pointerType === 'touch') setActive(true); }, { capture: true, passive: true });

let sid = null, cx = 0, cy = 0, R = 50;
function move(e) {
  const dx = clamp(e.clientX - cx, -R, R), dy = clamp(e.clientY - cy, -R, R);
  const v = dx / R, a = Math.abs(v);
  touch.steer = a < 0.1 ? 0 : -Math.sign(v) * Math.pow((a - 0.1) / 0.9, 1.15);
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy * 0.5}px))`;
}
stick.addEventListener('pointerdown', e => {
  if (sid !== null) return; e.preventDefault(); sid = e.pointerId; stick.setPointerCapture(sid);
  const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * 0.36;
  stick.classList.add('on'); move(e);
});
stick.addEventListener('pointermove', e => { if (e.pointerId === sid) { e.preventDefault(); move(e); } });
const endStick = e => {
  if (e.pointerId !== sid) return; sid = null; touch.steer = 0; stick.classList.remove('on');
  knob.style.transform = 'translate(-50%,-50%)';
};
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => stick.addEventListener(t, endStick));

const held = new Map();
for (const b of root.querySelectorAll('[data-a]')) {
  const a = b.dataset.a;
  b.addEventListener('pointerdown', e => { e.preventDefault(); held.set(e.pointerId, b); b.setPointerCapture(e.pointerId); touch[a] = 1; b.classList.add('on'); });
  const up = e => { if (held.get(e.pointerId) !== b) return; held.delete(e.pointerId); touch[a] = 0; b.classList.remove('on'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, up));
}
const reset = () => { touch.steer = touch.down = touch.boost = touch.drift = touch.fly = touch.item = 0; sid = null; held.clear(); root.querySelectorAll('.on').forEach(n => n.classList.remove('on')); knob.style.transform = 'translate(-50%,-50%)'; };
addEventListener('blur', reset);
document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
document.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- CONTROL TYPE: joystick or phone tilt ----------
   Tilt = lean the phone left / right like a steering wheel. Works in portrait and landscape:
   portrait uses the left-right roll (gamma); landscape uses the matching axis (beta).
   iPhones need a one-time permission, which has to come from a tap (the Settings button). */
const tiltHud = document.getElementById('tiltHud'), tiltDot = tiltHud && tiltHud.firstElementChild;
const TILT_DEAD = 4, TILT_FULL = 26; /* degrees: ignore wobble under 4, full lock at 26 */
let tiltOn = false, tiltAsked = false, tiltSeen = 0, tiltSm = 0;
function screenAngle() { return (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : 0); }
function onTilt(e) {
  if (e.gamma == null && e.beta == null) return;
  tiltSeen++;
  const a = screenAngle(), g = e.gamma || 0, b = e.beta || 0;
  let lean = a === 90 ? b : a === 270 ? -b : a === 180 ? -g : g; /* + = right edge of the screen dips */
  lean = clamp(lean, -60, 60);
  const m = Math.abs(lean), v = m < TILT_DEAD ? 0 : Math.pow(clamp((m - TILT_DEAD) / (TILT_FULL - TILT_DEAD), 0, 1), 1.1);
  tiltSm += (Math.sign(lean) * v - tiltSm) * 0.45; /* light smoothing, no lag you can feel */
  touch.steer = Math.abs(tiltSm) < 0.02 ? 0 : -tiltSm; /* same sign convention as the stick: left = + */
  if (tiltDot) tiltDot.style.transform = `translateX(${(tiltSm * 46).toFixed(1)}px)`;
}
function tiltListen(on) {
  if (on === tiltOn) return; tiltOn = on;
  if (on) addEventListener('deviceorientation', onTilt, true); else { removeEventListener('deviceorientation', onTilt, true); tiltSm = 0; if (tiltDot) tiltDot.style.transform = ''; }
}
async function tiltStart(cb, gesture) {
  const D = window.DeviceOrientationEvent;
  if (!D) { cb && cb(false); return; }
  if (typeof D.requestPermission === 'function') { /* iOS: the prompt only works from a tap */
    if (!gesture) return; /* wait for the next tap instead of failing */
    tiltAsked = true;
    try { if ((await D.requestPermission()) !== 'granted') { cb && cb(false); return; } } catch (e) { cb && cb(false); return; }
  }
  tiltSeen = 0; tiltListen(true);
  if (!cb) return;
  setTimeout(() => cb(tiltSeen > 0 || !touch.active), 1600); /* no sensor data on a touch device = unsupported */
}
export function setControl(mode, cb, gesture) {
  touch.mode = mode === 'tilt' ? 'tilt' : 'stick';
  document.body.classList.toggle('tilt', touch.mode === 'tilt');
  if (tiltHud) tiltHud.hidden = touch.mode !== 'tilt';
  touch.steer = 0;
  if (touch.mode === 'tilt') tiltStart(cb, gesture);
  else { tiltListen(false); cb && cb(true); }
}
/* iPhone: if tilt was saved from last time, the permission prompt needs a fresh tap */
addEventListener('click', () => {
  if (touch.mode === 'tilt' && !tiltOn && !tiltAsked) tiltStart(undefined, true);
}, { capture: true, passive: true });
