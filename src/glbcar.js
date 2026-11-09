// Kay Super Racing — loads a real 3D model (.glb) as a drop-in car body.
// FIXED: splitWheels syntax bug, missing normals, material preservation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
let loader = null;

export function glbCarReady(url) { const v = cache.get(url); return v && !(v instanceof Promise) ? v : null; }

export function loadGlbCar(def, maxAniso = 8) {
  const hit = cache.get(def.url);
  if (hit) return hit instanceof Promise ? hit : Promise.resolve(hit);
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  const p = new Promise((resolve, reject) => {
    loader.load(def.url, gltf => {
      try {
        gltf.scene.updateMatrixWorld(true);
        const geos = []; let mat = null;
        gltf.scene.traverse(o => {
          if (!o.isMesh) return;
          const g = o.geometry.clone();
          // Convert quantized (int16) attributes to float
          for (const nm of ['position', 'normal', 'uv', 'color']) {
            const at = g.attributes[nm]; if (!at || at.array instanceof Float32Array) continue;
            const f = new Float32Array(at.count * at.itemSize);
            for (let i = 0; i < at.count; i++) { f[i * at.itemSize] = at.getX(i); if (at.itemSize > 1) f[i * at.itemSize + 1] = at.getY(i); if (at.itemSize > 2) f[i * at.itemSize + 2] = at.getZ(i); }
            g.setAttribute(nm, new THREE.BufferAttribute(f, at.itemSize));
          }
          // CRITICAL FIX: compute normals BEFORE merge if missing (prevents black blobs)
          if (!g.attributes.normal) g.computeVertexNormals();
          g.applyMatrix4(o.matrixWorld);
          // Strip non-standard attributes
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
          // Ensure color attribute exists (for paint system)
          if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
          // Ensure UV exists
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          // Ensure indexed
          if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
          geos.push(g);
          // Keep the FIRST mesh's material (most models have one material)
          if (!mat) mat = o.material;
        });
        const geo = mergeGeometries(geos); if (!geo) throw new Error('empty model');
        // Safety: compute normals after merge if still missing
        if (!geo.attributes.normal || geo.attributes.normal.count !== geo.attributes.position.count) geo.computeVertexNormals();
        geo.rotateY(def.rotY || 0);
        // Scale to target length
        geo.computeBoundingBox(); const b = geo.boundingBox;
        const zLen = b.max.z - b.min.z;
        if (zLen < 0.001) throw new Error('zero-length model');
        const k = (def.len || 4.5) / zLen;
        geo.scale(k, k, k);
        // Center on XZ, lift Y to ground
        geo.computeBoundingBox(); const b2 = geo.boundingBox;
        geo.translate(-(b2.min.x + b2.max.x) / 2, -b2.min.y + (def.lift || 0), -(b2.min.z + b2.max.z) / 2);

        // Create material — preserve GLB texture, fallback to vertex colors
        const hasMap = !!(mat && mat.map);
        const m = new THREE.MeshStandardMaterial({
          map: hasMap ? mat.map : null,
          vertexColors: !hasMap,
          side: THREE.DoubleSide,
          color: 0xffffff,
          roughness: def.rough ?? (mat ? (mat.roughness ?? 0.4) : 0.4),
          metalness: def.metal ?? (mat ? (mat.metalness ?? 0.2) : 0.2),
          envMapIntensity: 1.0
        });
        // Copy emissive if source has it
        if (mat && mat.emissive) { m.emissive.copy(mat.emissive); m.emissiveIntensity = mat.emissiveIntensity ?? 1.0; }
        if (m.map && def.nearest) { m.map.magFilter = m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; }
        if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }

        const wm = m.clone();
        let bodyGeo = geo, wheels = [];
        if (def.wheels) {
          try { const r = splitWheels(geo, def.wheels); bodyGeo = r.body; wheels = r.wheels; }
          catch(e) { console.warn('KSR: splitWheels failed, keeping wheels in body', e); }
        }
        bodyGeo.setAttribute('partId', new THREE.BufferAttribute(new Float32Array(bodyGeo.attributes.position.count), 1));
        bodyGeo.computeBoundingBox(); bodyGeo.computeBoundingSphere();

        // Paint system
        const paint = { value: new THREE.Color(0xffffff) }, on = { value: 0 };
        const from = def.paintFrom ? new THREE.Color().setRGB(def.paintFrom[0], def.paintFrom[1], def.paintFrom[2], THREE.LinearSRGBColorSpace) : null;
        if (from) m.onBeforeCompile = sh => {
          sh.uniforms.uPaint = paint; sh.uniforms.uOn = on; sh.uniforms.uFrom = { value: from };
          sh.fragmentShader = 'uniform vec3 uPaint; uniform float uOn; uniform vec3 uFrom;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            if (uOn > 0.5) { vec3 c0 = diffuseColor.rgb; float l0 = dot(c0, vec3(.3,.59,.11)); float fl = dot(uFrom, vec3(.3,.59,.11));
              float d = length(c0 / max(l0, 1e-3) - uFrom / fl);
              float mk = (1. - smoothstep(.12, .35, d)) * smoothstep(.04, .14, l0);
              diffuseColor.rgb = mix(c0, uPaint * min(l0 / fl, 1.6), mk); }`);
        };
        m.customProgramCacheKey = () => 'ksrpaint' + (from ? 1 : 0);
        const out = { geo: bodyGeo, mat: m, wheels, wmat: wm, paint, on };
        cache.set(def.url, out); resolve(out);
      } catch (e) { cache.delete(def.url); reject(e); }
    }, undefined, e => { cache.delete(def.url); reject(e); });
  });
  cache.set(def.url, p);
  return p;
}

// FIXED: splitWheels — the [hit, l] destructuring was broken (missing [ and wrong variable name)
function splitWheels(geo, w) {
  const pos = geo.attributes.position, ix = geo.index.array, R = w.r * 1.06;
  const centres = [[w.zf, true], [w.zr, false]];
  const bodyIx = [], lists = new Map();
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    let hit = -1;
    if (Math.abs(cx) > w.xin) for (let k = 0; k < 2; k++) {
      const zc = centres[k][0];
      if (Math.hypot(cy - w.y, cz - zc) < R &&
          Math.hypot(pos.getY(a) - w.y, pos.getZ(a) - zc) < R * 1.3 &&
          Math.hypot(pos.getY(b) - w.y, pos.getZ(b) - zc) < R * 1.3 &&
          Math.hypot(pos.getY(c) - w.y, pos.getZ(c) - zc) < R * 1.3) {
        hit = (cx > 0 ? 1 : 0) * 2 + k; break;
      }
    }
    if (hit < 0) bodyIx.push(a, b, c);
    else { let l = lists.get(hit); if (!l) lists.set(hit, l = []); l.push(a, b, c); }
  }
  const body = geo.clone(); body.setIndex(bodyIx);
  const wheels = [];
  // FIXED: proper destructuring [hit, l] — was broken as "it, l]" before
  for (const [hit, l] of lists) {
    const k = hit % 2, side = hit >> 1 ? 1 : -1, remap = new Map(), verts = [];
    for (const v of l) if (!remap.has(v)) { remap.set(v, verts.length); verts.push(v); }
    let x0 = 1e9, x1 = -1e9;
    for (const v of verts) { const x = pos.getX(v); if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const cx = (x0 + x1) / 2, cy = w.y, cz = centres[k][0];
    const g = new THREE.BufferGeometry();
    for (const nm of ['position', 'normal', 'uv', 'color']) {
      const at = geo.attributes[nm]; if (!at) continue;
      const arr = new Float32Array(verts.length * at.itemSize);
      verts.forEach((v, i) => {
        for (let d = 0; d < at.itemSize; d++) arr[i * at.itemSize + d] = at.array[v * at.itemSize + d];
        if (nm === 'position') { arr[i * 3] -= cx; arr[i * 3 + 1] -= cy; arr[i * 3 + 2] -= cz; }
      });
      g.setAttribute(nm, new THREE.BufferAttribute(arr, at.itemSize));
    }
    g.setIndex(l.map(v => remap.get(v)));
    g.setAttribute('partId', new THREE.BufferAttribute(new Float32Array(verts.length).fill(2), 1));
    g.computeBoundingSphere();
    wheels.push({ geo: g, x: cx, y: cy, z: cz, front: k === 0, r: w.r, glb: true });
  }
  return { body, wheels };
}
