// Kay Super Racing: Drift Arena world (open lot, painted bays, cones, containers, trees).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function createArena(canvasTex) {
  const R = 290, group = new THREE.Group(), dummy = new THREE.Object3D();
  group.visible = false;

  /* ground: asphalt lot inside a dry field */
  const asphalt = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#7b7f86'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) { const v = (110 + Math.random() * 60) | 0; c.fillStyle = `rgba(${v},${v},${v + 4},.45)`; c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
    c.strokeStyle = 'rgba(40,42,48,.32)'; c.lineWidth = 1;
    for (let i = 0; i < 9; i++) { c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping; asphalt.repeat.set(220, 220);
  const lot = new THREE.Mesh(new THREE.CircleGeometry(R + 12, 96), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 }));
  lot.rotation.x = -Math.PI / 2; lot.receiveShadow = true; group.add(lot);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x8d7f52, roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.y = -0.1; field.receiveShadow = true; group.add(field);

  /* painted markings */
  const T = (cx, cz, rot, x, z) => [cx + x * Math.cos(rot) + z * Math.sin(rot), cz - x * Math.sin(rot) + z * Math.cos(rot)];
  const paint = col => new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const boxes = (w, d, col, list) => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.02, d), paint(col), list.length);
    list.forEach(([x, z, r], i) => { dummy.position.set(x, 0.02, z); dummy.rotation.set(0, r, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.receiveShadow = true; group.add(m);
  };
  const bays = [], zebra = [], shaft = [], head = [], hatch = [];
  [[-170, -120, 0], [-170, 40, 0], [-170, 170, 0], [170, -150, 0], [170, 0, 0], [170, 150, 0], [0, -205, Math.PI / 2], [0, 210, Math.PI / 2]].forEach(([cx, cz, rot]) => {
    for (const row of [-1, 1]) for (let c = 0; c <= 18; c++) { const [x, z] = T(cx, cz, rot, (c - 9) * 2.8, row * 2.75); bays.push([x, z, rot]); }
  });
  [[0, -95, 0], [0, 95, 0], [-95, 0, Math.PI / 2], [95, 0, Math.PI / 2]].forEach(([cx, cz, rot]) => {
    for (let i = 0; i < 12; i++) { const [x, z] = T(cx, cz, rot, (i - 5.5) * 1.15, 0); zebra.push([x, z, rot]); }
  });
  [[-40, -60, 0], [40, 60, Math.PI], [-60, 40, Math.PI / 2], [60, -40, -Math.PI / 2], [-215, -30, 0], [215, 60, Math.PI]].forEach(([cx, cz, rot]) => {
    shaft.push([cx, cz, rot]);
    const [lx, lz] = T(cx, cz, rot, -0.5, 1.2), [rx, rz] = T(cx, cz, rot, 0.5, 1.2);
    head.push([lx, lz, rot + 0.7], [rx, rz, rot - 0.7]);
  });
  [[-70, -175], [80, 175], [-215, 90], [215, -70]].forEach(([cx, cz]) => { for (let i = 0; i < 9; i++) hatch.push([cx + (i - 4) * 1.5, cz, 0.7]); });
  boxes(0.16, 5.4, '#e8e8e2', bays); boxes(0.55, 3.4, '#e8e8e2', zebra); boxes(0.3, 3.2, '#e8e8e2', shaft); boxes(0.3, 1.5, '#e8e8e2', head); boxes(0.4, 6, '#e8b800', hatch);
  for (const [r1, r2, col] of [[39.8, 40.3, '#e8b800'], [11.8, 12.2, '#e8e8e2']]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 96), paint(col)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.021; ring.receiveShadow = true; group.add(ring);
  }

  /* barrier ring */
  {
    const n = 150, m = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 0.9, 1.1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2; dummy.position.set(Math.cos(a) * (R + 3), 0.45, Math.sin(a) * (R + 3)); dummy.rotation.set(0, -(a + Math.PI / 2), 0); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, new THREE.Color(i % 2 ? '#d6d9de' : '#c9392f'));
    }
    m.castShadow = m.receiveShadow = true; group.add(m);
  }

  /* trees outside the lot */
  {
    const parts = [], add = (geo, col) => { const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(col), arr = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); parts.push(g); };
    add(new THREE.CylinderGeometry(0.35, 0.65, 7, 6).translate(0, 3.5, 0), '#4a3b2c');
    const cols = ['#59582f', '#6a5c35', '#4a5230', '#5d4f33'];
    for (let i = 0; i < 5; i++) add(new THREE.IcosahedronGeometry(rand(2.1, 3.3), 0).translate(rand(-2.2, 2.2), rand(7.5, 11.5), rand(-2.2, 2.2)), cols[i % 4]);
    const n = 280, m = new THREE.InstancedMesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), n);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = R + rand(30, 340), s = rand(0.9, 1.7); dummy.position.set(Math.cos(a) * r, -0.1, Math.sin(a) * r); dummy.rotation.set(0, rand(0, 6.28), 0); dummy.scale.set(s, s * rand(0.9, 1.3), s); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, new THREE.Color().setHSL(rand(0.08, 0.14), 0.25, rand(0.55, 0.9)));
    }
    dummy.scale.set(1, 1, 1); m.castShadow = true; group.add(m);
  }

  /* light poles */
  {
    const n = 14, pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.25, 14, 6), new THREE.MeshStandardMaterial({ color: 0x8a919b }), n);
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.2, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2), toneMapped: false }), n);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.cos(a) * (R - 18), z = Math.sin(a) * (R - 18);
      dummy.position.set(x, 7, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pole.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - Math.cos(a) * 1.3, 14.1, z - Math.sin(a) * 1.3); dummy.rotation.set(0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0); dummy.updateMatrix(); lamp.setMatrixAt(i, dummy.matrix);
    }
    dummy.rotation.set(0, 0, 0); pole.castShadow = true; group.add(pole, lamp);
  }

  /* containers (solid obstacles) */
  const containers = [];
  [[-60, -235, 0, '#c0392b'], [40, -240, 0.3, '#2b6cb0'], [232, -85, 1.2, '#e08a1e'], [-242, 60, 0.5, '#2f9e5b'], [212, 200, 2.1, '#7d3c98'], [-140, 232, -0.4, '#c0392b']].forEach(([x, z, rot, col]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 6.1), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.3 }));
    mesh.position.set(x, 1.3, z); mesh.rotation.y = rot; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    containers.push({ x, z, cos: Math.cos(rot), sin: Math.sin(rot) });
  });

  /* cones */
  const cones = [];
  {
    const geo = mergeGeometries([new THREE.ConeGeometry(0.26, 0.7, 12).translate(0, 0.4, 0), new THREE.BoxGeometry(0.62, 0.05, 0.62).translate(0, 0.025, 0)]);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.5 }), spots = [];
    for (let i = 0; i < 20; i++) spots.push([Math.cos(i / 20 * 6.283) * 40, Math.sin(i / 20 * 6.283) * 40]);
    for (let i = 0; i < 12; i++) spots.push([Math.cos(i / 12 * 6.283) * 14, Math.sin(i / 12 * 6.283) * 14]);
    for (let i = 0; i < 10; i++) spots.push([-90 + i * 20, 130 + (i % 2 ? 4 : -4)]);
    spots.forEach(([x, z]) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.castShadow = true; group.add(m);
      cones.push({ m, x, z, x0: x, z0: z, vx: 0, vz: 0, k: false });
    });
  }
  const knock = (c, vx, vz) => { c.k = true; c.vx = vx; c.vz = vz; c.m.rotation.set(1.45, Math.atan2(vx, vz), 0); c.m.position.y = 0.26; };
  const update = dt => {
    for (const c of cones) if (c.k && (c.vx * c.vx + c.vz * c.vz) > 0.01) {
      c.x += c.vx * dt; c.z += c.vz * dt; const f = Math.exp(-2.2 * dt); c.vx *= f; c.vz *= f; c.m.position.x = c.x; c.m.position.z = c.z;
    }
  };
  const reset = () => { for (const c of cones) { c.k = false; c.x = c.x0; c.z = c.z0; c.vx = c.vz = 0; c.m.rotation.set(0, 0, 0); c.m.position.set(c.x0, 0, c.z0); } };

  return { group, R, cones, containers, knock, update, reset };
}
