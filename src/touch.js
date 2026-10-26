// Touch input, using the pointer-capture pattern from mrdoob/slop-newyork (MIT) js/touch-controls.js.
// Each finger is tracked by pointerId so steering and buttons work at the same time.
export const touch = { active: false, steer: 0, down: 0, boost: 0, drift: 0 };

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
const reset = () => { touch.steer = touch.down = touch.boost = touch.drift = 0; sid = null; held.clear(); root.querySelectorAll('.on').forEach(n => n.classList.remove('on')); knob.style.transform = 'translate(-50%,-50%)'; };
addEventListener('blur', reset);
document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
document.addEventListener('contextmenu', e => e.preventDefault());
