/* Kay Super Racing — CAR TATTOOS: racing liveries & stickers for the body.
   · each tattoo is canvas art drawn once, shared as a texture
   · decals are thin overlay planes on the HOOD + BOTH DOORS (alpha-tested,
     depth-write off, polygon-offset) so they sit on any car body cleanly
   · bought with race cash in GARAGE → TATTOO, equipped per car (ksr.tat) */

import * as THREE from 'three';

const ART_W = 256;

/* ---------- the art: every draw(g) paints on a 256×256 transparent canvas ---------- */
const shadowed = (g, fn) => { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 10; fn(); g.shadowBlur = 0; };

const drawStripes = g => {
  g.fillStyle = '#f4f6fa';
  g.fillRect(96, 8, 30, 240); g.fillRect(134, 8, 30, 240);
  g.fillStyle = '#d42a2a';
  g.fillRect(92, 8, 4, 240); g.fillRect(126, 8, 4, 240); g.fillRect(164, 8, 4, 240);
};

const drawFlames = g => {
  shadowed(g, () => {
    const grad = g.createLinearGradient(0, 40, 0, 220);
    grad.addColorStop(0, '#ff5a1f'); grad.addColorStop(0.55, '#ffb200'); grad.addColorStop(1, '#ffe97a');
    for (const dir of [1, -1]) {
      g.save(); g.translate(128, 0); g.scale(dir, 1); g.translate(-128, 0);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(128, 214);
      g.bezierCurveTo(84, 190, 60, 150, 74, 104);
      g.bezierCurveTo(82, 118, 96, 122, 100, 110);
      g.bezierCurveTo(88, 84, 104, 56, 128, 44);
      g.bezierCurveTo(152, 56, 168, 84, 156, 110);
      g.bezierCurveTo(160, 122, 174, 118, 182, 104);
      g.bezierCurveTo(196, 150, 172, 190, 128, 214);
      g.closePath(); g.fill();
      g.strokeStyle = '#101418'; g.lineWidth = 7; g.stroke();
      g.fillStyle = '#fff3c4';
      g.beginPath();
      g.moveTo(128, 196); g.bezierCurveTo(104, 178, 96, 156, 108, 132);
      g.bezierCurveTo(116, 146, 128, 148, 128, 130);
      g.bezierCurveTo(128, 148, 140, 146, 148, 132);
      g.bezierCurveTo(160, 156, 152, 178, 128, 196);
      g.closePath(); g.fill();
      g.restore();
    }
  });
};

const drawRoundel = g => {
  shadowed(g, () => {
    g.beginPath(); g.arc(128, 128, 92, 0, 7); g.fillStyle = '#f4f6fa'; g.fill();
    g.lineWidth = 12; g.strokeStyle = '#0a3a94'; g.stroke();
    g.fillStyle = '#101418'; g.font = 'italic 900 118px Arial Black,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('7', 128, 136);
  });
};

const drawBolt = g => {
  shadowed(g, () => {
    g.beginPath();
    g.moveTo(150, 12); g.lineTo(66, 138); g.lineTo(118, 138); g.lineTo(96, 244);
    g.lineTo(196, 104); g.lineTo(140, 104); g.lineTo(178, 12);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#9ff3ff'); grad.addColorStop(1, '#18b6ff');
    g.fillStyle = grad; g.fill();
    g.lineWidth = 9; g.strokeStyle = '#062a44'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.moveTo(140, 40); g.lineTo(94, 128); g.lineTo(120, 122); g.lineTo(108, 196); g.lineTo(162, 108); g.lineTo(136, 110); g.closePath(); g.fill();
  });
};

const drawKay = g => {
  shadowed(g, () => {
    g.font = 'italic 900 92px Arial Black,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 20; g.strokeStyle = '#0a3a94'; g.strokeText('KAY', 128, 118);
    const grad = g.createLinearGradient(0, 70, 0, 160);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#9fd4ff');
    g.fillStyle = grad; g.fillText('KAY', 128, 118);
    g.fillStyle = '#d42a2a';
    g.beginPath(); g.moveTo(30, 178); g.lineTo(214, 156); g.lineTo(226, 170); g.lineTo(42, 192); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.moveTo(48, 202); g.lineTo(200, 184); g.lineTo(206, 192); g.lineTo(54, 210); g.closePath(); g.fill();
  });
};

const drawChecker = g => {
  g.save();
  g.translate(128, 128); g.rotate(-0.5); g.translate(-128, -128);
  shadowed(g, () => {
    g.fillStyle = '#f4f6fa'; g.fillRect(28, 92, 200, 72);
    g.fillStyle = '#101418';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) if ((r + c) % 2 === 0) g.fillRect(28 + c * (200 / 7), 92 + r * 24, 200 / 7, 24);
    g.lineWidth = 8; g.strokeStyle = '#0a3a94'; g.strokeRect(28, 92, 200, 72);
  });
  g.restore();
};

const drawClaw = g => {
  shadowed(g, () => {
    for (const [x0, w] of [[52, 34], [112, 34], [172, 34]]) {
      g.save();
      g.translate(x0 + w / 2, 128); g.rotate(-0.16);
      const grad = g.createLinearGradient(0, -110, 0, 110);
      grad.addColorStop(0, '#ff3b3b'); grad.addColorStop(1, '#a80f0f');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-w / 2, -108); g.quadraticCurveTo(w / 2 - 4, -40, w / 2, 108);
      g.quadraticCurveTo(0, 96, -w / 2, 108);
      g.quadraticCurveTo(-w / 2 + 6, -40, -w / 2, -108);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,236,236,.9)';
      g.beginPath();
      g.moveTo(-w / 2 + 8, -96); g.quadraticCurveTo(w / 2 - 16, -30, w / 2 - 12, 92);
      g.quadraticCurveTo(2, 80, -w / 2 + 10, 92);
      g.quadraticCurveTo(-w / 2 + 12, -30, -w / 2 + 8, -96);
      g.closePath(); g.fill();
      g.restore();
    }
  });
};

const drawNaija = g => {
  shadowed(g, () => {
    g.fillStyle = '#f4f6fa';
    g.beginPath(); g.arc(128, 108, 74, 0, 7); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#0a7a3c'; g.stroke();
    const star = (cx, cy, R, r, n, rot) => {
      g.beginPath();
      for (let i = 0; i < n * 2; i++) { const rad = i % 2 ? r : R, a = rot + i * Math.PI / n; g[i ? 'lineTo' : 'moveTo'](cx + Math.sin(a) * rad, cy - Math.cos(a) * rad); }
      g.closePath();
    };
    star(128, 108, 54, 22, 5, 0); g.fillStyle = '#0a9a44'; g.fill();
    g.fillStyle = '#f4f6fa'; g.font = 'italic 900 34px Arial Black,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('NAIJA', 128, 200);
    g.lineWidth = 6; g.strokeStyle = '#06331a'; g.strokeText('NAIJA', 128, 200);
  });
};

export const TATTOOS = [
  { id: 'none',    name: 'CLEAN',       desc: 'NO STICKERS · FACTORY LOOK', price: 0 },
  { id: 'stripes', name: 'RALLY STRIPES', desc: 'CLASSIC DUAL STRIPES',      price: 0, draw: drawStripes },
  { id: 'flames',  name: 'HOOD FLAMES', desc: 'FIRE LICKS ON THE BONNET',   price: 2500, draw: drawFlames },
  { id: 'roundel', name: 'RACE No.7',   desc: 'OLD-SCHOOL RACING ROUNDEL',  price: 2500, draw: drawRoundel },
  { id: 'bolt',    name: 'THUNDER BOLT', desc: 'SHOCK THE PACK',            price: 4000, draw: drawBolt },
  { id: 'kay',     name: 'KAY SIGNATURE', desc: 'THE OFFICIAL KSR TAG',     price: 4000, draw: drawKay },
  { id: 'checker', name: 'CHECKER SLASH', desc: 'FINISH-FLAG SASH',         price: 6000, draw: drawChecker },
  { id: 'claw',    name: 'CLAW MARKS',  desc: 'BEAST OF THE GRID',          price: 6000, draw: drawClaw },
  { id: 'naija',   name: 'NAIJA STAR',  desc: '9JA PRIDE · GREEN & WHITE',  price: 8000, draw: drawNaija }
];

export const tatById = id => TATTOOS.find(t => t.id === id) || TATTOOS[0];

/* ---------- texture + thumbnail caches ---------- */
const texCache = new Map(), thumbCache = new Map();

export function tatTexture(id) {
  const t = tatById(id); if (!t.draw) return null;
  let tex = texCache.get(t.id);
  if (!tex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = ART_W;
    const g = cv.getContext('2d');
    t.draw(g);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    texCache.set(t.id, tex);
  }
  return tex;
}

export function tatThumb(id) {
  const t = tatById(id);
  let url = thumbCache.get(t.id);
  if (!url) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = '#13253f'; g.beginPath(); g.roundRect(0, 0, 96, 96, 12); g.fill();
    if (t.draw) {
      const small = document.createElement('canvas'); small.width = small.height = ART_W;
      t.draw(small.getContext('2d'));
      g.drawImage(small, 10, 10, 76, 76);
    } else { g.fillStyle = '#5d7392'; g.font = '900 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('\u00d8', 48, 50); }
    url = cv.toDataURL();
    thumbCache.set(t.id, url);
  }
  return url;
}

/* ---------- decal builder: hood plane + both door planes, sized off the body ---------- */
const decalMat = tex => new THREE.MeshBasicMaterial({
  map: tex, transparent: true, alphaTest: 0.06, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false
});

/* hood deck height: the tallest BODY vertex (partId 0) in the front half —
   the raw bbox max would catch the cabin roof and float the decal */
function hoodDeckY(geo) {
  const pid = geo.attributes.partId.array, pos = geo.attributes.position.array;
  let m = 0.72;
  for (let i = 0; i < pid.length; i++) if (pid[i] === 0 && pos[i * 3 + 2] > 0.45) m = Math.max(m, pos[i * 3 + 1]);
  return m;
}

export function buildDecals(bb, id, geo) {
  const tex = tatTexture(id); if (!tex) return null;
  /* mirrored copy so the LEFT door reads correctly instead of showing flipped art */
  const texL = tex.clone(); texL.needsUpdate = true; texL.wrapS = THREE.RepeatWrapping; texL.repeat.x = -1;
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
  const grp = new THREE.Group();

  /* hood: sits ON the deck, art pointing to the nose */
  const hood = new THREE.Mesh(new THREE.PlaneGeometry(sx * 0.6, sz * 0.3), decalMat(tex));
  hood.rotation.x = -Math.PI / 2; hood.rotation.z = Math.PI;
  hood.position.set(0, (geo ? hoodDeckY(geo) : bb.max.y * 0.68) + 0.02, bb.max.z * 0.52);
  hood.renderOrder = 2; grp.add(hood);

  /* doors: one plate per side, vertically centred, both reading left-to-right */
  for (const side of [1, -1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(sz * 0.3, sy * 0.32), decalMat(side > 0 ? tex : texL));
    d.rotation.y = side * Math.PI / 2;
    d.position.set(side * (bb.max.x + 0.02), bb.min.y + sy * 0.52, bb.min.z + sz * 0.52);
    d.renderOrder = 2; grp.add(d);
  }
  return grp;
}
