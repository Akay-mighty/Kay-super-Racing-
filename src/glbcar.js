// Kay Super Racing — loads a real 3D model (.glb) as a drop-in car body.
// The model is merged into ONE geometry (so the rest of the game — shadows, tattoos
// guard, garage preview — treats it like any other car body), fitted to the same size
// and ground line as the built-in cars, and cached. Heavy models must be pre-decimated.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map(); /* url -> {geo, mat} | Promise */
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
          for (const nm of ['position', 'normal', 'uv', 'color']) { /* quantized (int16) models: convert to float before transforming */
            const at = g.attributes[nm]; if (!at || at.array instanceof Float32Array) continue;
            const f = new Float32Array(at.count * at.itemSize);
            for (let i = 0; i < at.count; i++) { f[i * at.itemSize] = at.getX(i); if (at.itemSize > 1) f[i * at.itemSize + 1] = at.getY(i); if (at.itemSize > 2) f[i * at.itemSize + 2] = at.getZ(i); }
            g.setAttribute(nm, new THREE.BufferAttribute(f, at.itemSize));
          }
          g.applyMatrix4(o.matrixWorld);
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
          if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); } /* keep indexed: 3x less memory on phones */
          geos.push(g);
          if (!mat) mat = o.material;
        });
        const geo = mergeGeometries(geos); if (!geo) throw new Error('empty model');
        geo.rotateY(def.rotY || 0);
        geo.computeBoundingBox(); const b = geo.boundingBox;
        const k = (def.len || 4.5) / (b.max.z - b.min.z);
        geo.scale(k, k, k);
        geo.computeBoundingBox(); const b2 = geo.boundingBox;
        geo.translate(-(b2.min.x + b2.max.x) / 2, -b2.min.y + (def.lift || 0), -(b2.min.z + b2.max.z) / 2);
        geo.setAttribute('partId', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1)); /* all body */
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        const m = new THREE.MeshStandardMaterial({ map: mat && mat.map || null, vertexColors: !(mat && mat.map), side: THREE.DoubleSide, color: 0xffffff, roughness: def.rough ?? 0.4, metalness: def.metal ?? 0.25, envMapIntensity: 1.0 });
        if (m.map && def.nearest) { m.map.magFilter = m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; }
        if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }
        const out = { geo, mat: m }; cache.set(def.url, out); resolve(out);
      } catch (e) { cache.delete(def.url); reject(e); }
    }, undefined, e => { cache.delete(def.url); reject(e); });
  });
  cache.set(def.url, p);
  return p;
}
