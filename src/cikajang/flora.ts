import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type WorldKit, mulberry32 } from '../persis/worlds';
import type { Vec3 } from './story';

/**
 * Hero flora and "life" props for the Cikajang worlds. Everything is a pure function of its
 * seed (no Math.random), merged into one vertex-coloured BufferGeometry per prefab and
 * placed with InstancedMesh so ~500 cabbages cost a handful of draw calls.
 */

const col = (hex: string): THREE.Color => new THREE.Color(hex);

/** Give a geometry position+normal+colour only (so `mergeGeometries` accepts mixed primitives). */
function paintGeo(geo: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = color(pos.getX(i), pos.getY(i), pos.getZ(i));
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Cupped, wavy-rimmed broad leaf lying in XZ with its base at the origin, opening along +X. */
function leafGeometry(r: number, cup: number, rings: number, segs: number, dark: string, light: string, seed: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const rnd = mulberry32(seed);
  const wob = rnd() * 6;
  pos.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const rho = i / rings;
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const rim = 1 + 0.08 * Math.sin(th * 5 + wob) * rho; // lobed edge
      const x = r * (1 + rho * Math.cos(th) * rim);
      const z = r * rho * Math.sin(th) * 0.92 * rim;
      const y = cup * r * rho * rho + 0.02 * r * Math.sin(th * 6 + wob) * rho;
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + (i - 1) * segs + j;
      const b = 1 + (i - 1) * segs + ((j + 1) % segs);
      const c = 1 + i * segs + j;
      const d = 1 + i * segs + ((j + 1) % segs);
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const cd = col(dark);
  const cl = col(light);
  const tmp = new THREE.Color();
  return paintGeo(geo, (x, _y, z) => {
    const u = (x - r) / r; // −1..1 across the leaf
    const midrib = Math.exp(-Math.pow(z / (r * 0.09), 2)) * 0.9;
    const side = Math.pow(Math.max(0, Math.sin(x * (13 / r) - Math.abs(z) * (20 / r))), 10) * 0.4;
    const edge = Math.max(0, Math.hypot(u, z / r) - 0.7) * 0.9; // paler, thinner rim
    return tmp.copy(cd).lerp(cl, Math.min(1, midrib + side + edge * 0.5));
  });
}

/**
 * Cabbage (kol): a pale-green veined round heart wrapped by six broad, cupped, darker outer
 * leaves opening around it at staggered azimuths and tilts. ~0.42 m across, origin on the soil.
 * `lod` 'low' keeps the silhouette (heart + 4 leaves) for far terraces.
 */
export function cabbageGeometry(lod: 'high' | 'low' = 'high'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const heart = lod === 'high' ? new THREE.SphereGeometry(0.115, 12, 9) : new THREE.IcosahedronGeometry(0.115, 0);
  heart.scale(1, 0.92, 1);
  heart.translate(0, 0.1, 0);
  const pale = col('#c4e08e');
  const vein = col('#8dbb5a');
  const tmp = new THREE.Color();
  parts.push(
    paintGeo(heart.toNonIndexed(), (x, y, z) => {
      const v = Math.pow(Math.abs(Math.sin(Math.atan2(z, x) * 4 + (y - 0.1) * 16)), 7);
      const shade = Math.max(0, 0.5 - y * 2.4) * 0.35;
      return tmp.copy(pale).lerp(vein, v * 0.75 + shade);
    }),
  );
  const n = lod === 'high' ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const high = lod === 'high';
    const r = (i % 2 === 0 ? 0.16 : 0.135) * (0.95 + 0.08 * ((i * 7) % 3));
    const leaf = leafGeometry(r, 0.7, high ? 3 : 2, high ? 10 : 6, i % 2 === 0 ? '#3f7a2c' : '#4e8f36', '#9ccb62', 11 + i);
    // Tilt up from the base (outer leaves lie flatter, inner ones hug the heart), then spin.
    const tilt = i % 2 === 0 ? 0.42 : 0.78;
    leaf.rotateZ(tilt);
    leaf.rotateY((i / n) * Math.PI * 2 + (i % 2) * 0.35);
    leaf.translate(0, 0.012 + (i % 2) * 0.03, 0);
    parts.push(leaf.toNonIndexed());
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged ?? new THREE.BufferGeometry();
}

/** Leek / spring onion (daun bawang): white-to-green blades fanning from a pale bulb. */
export function leekGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const c0 = col('#f0f2d8');
  const c1 = col('#4f9a3a');
  const tmp = new THREE.Color();
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const h = 0.3 + (i % 3) * 0.05;
    const g = new THREE.ConeGeometry(0.016, h, 5, 1, true);
    g.translate(0, h / 2, 0);
    g.rotateZ(0.12 + (i % 3) * 0.1);
    g.rotateY((i / blades) * Math.PI * 2);
    parts.push(paintGeo(g.toNonIndexed(), (_x, y) => tmp.copy(c0).lerp(c1, Math.min(1, Math.max(0, (y - 0.06) / 0.14)))));
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged ?? new THREE.BufferGeometry();
}

/** Carrot tops: a feathery fan of fine green fronds with the orange shoulder just showing. */
export function carrotTopGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const green = col('#6cae48');
  const light = col('#9fd070');
  const tmp = new THREE.Color();
  for (let i = 0; i < 9; i++) {
    const h = 0.2 + (i % 3) * 0.04;
    const g = new THREE.ConeGeometry(0.012, h, 4, 1, true);
    g.translate(0, h / 2, 0);
    g.rotateZ(0.35 + (i % 3) * 0.2);
    g.rotateY((i / 9) * Math.PI * 2 + 0.2);
    parts.push(paintGeo(g.toNonIndexed(), (_x, y) => tmp.copy(green).lerp(light, Math.min(1, y / 0.2))));
  }
  const shoulder = new THREE.SphereGeometry(0.03, 7, 5);
  shoulder.scale(1, 0.5, 1);
  shoulder.translate(0, 0.005, 0);
  parts.push(paintGeo(shoulder.toNonIndexed(), () => col('#e8782a')));
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged ?? new THREE.BufferGeometry();
}

/** Loose-soil ridge (guludan) along +X: wavy crest, soft scallops, darker flanks. Origin at the base centre. */
export function ridgeGeometry(len: number, width: number, height: number, seed: number): THREE.BufferGeometry {
  const nx = Math.max(8, Math.round(len / 0.22));
  const na = 6;
  const pos: number[] = [];
  const idx: number[] = [];
  const r = mulberry32(seed);
  const ph = r() * 6;
  for (let i = 0; i <= nx; i++) {
    const x = -len / 2 + (len * i) / nx;
    const crest = height * (0.86 + 0.14 * Math.sin(x * 4.1 + ph) + 0.06 * Math.sin(x * 9.3));
    for (let j = 0; j <= na; j++) {
      const a = -Math.PI / 2 + (Math.PI * j) / na;
      pos.push(x, Math.max(0, crest * Math.pow(Math.cos(a), 0.9)) - (j === 0 || j === na ? 0.02 : 0), (width / 2) * Math.sin(a) * (1 + 0.05 * Math.sin(x * 5 + ph)));
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < na; j++) {
      const a = i * (na + 1) + j;
      const b = a + 1;
      const c = a + (na + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const top = col('#8a6a48');
  const flank = col('#5a4228');
  const tmp = new THREE.Color();
  return paintGeo(geo, (x, y, z) => {
    const n = 0.5 + 0.5 * Math.sin(x * 23 + z * 17) * Math.sin(x * 11 - z * 7);
    return tmp.copy(flank).lerp(top, Math.min(1, y / (height * 0.9)) * 0.8 + n * 0.2);
  });
}

/** Vertex-coloured toon material shared by the prefabs. */
export function floraMaterial(kit: WorldKit, side: THREE.Side = THREE.DoubleSide): THREE.MeshToonMaterial {
  return kit.toon('#ffffff', { vertexColors: true, side });
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Uniform scale. */
  s?: number;
  /** Yaw (rad). */
  r?: number;
}

/** Instance a prefab with per-instance yaw/scale and a seeded tint. */
export function instancePrefab(kit: WorldKit, parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, places: readonly Placement[], opts: { tint?: readonly [string, string]; seed?: number; shadow?: boolean } = {}): THREE.InstancedMesh {
  kit.track(geo);
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, places.length));
  inst.count = places.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const rnd = mulberry32(opts.seed ?? 1);
  const a = opts.tint ? col(opts.tint[0]) : null;
  const b = opts.tint ? col(opts.tint[1]) : null;
  const tmp = new THREE.Color();
  places.forEach((pl, i) => {
    const k = pl.s ?? 1;
    q.setFromAxisAngle(up, pl.r ?? rnd() * Math.PI * 2);
    p.set(pl.x, pl.y, pl.z);
    s.set(k, k * (0.92 + rnd() * 0.16), k);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
    if (a && b) inst.setColorAt(i, tmp.copy(a).lerp(b, rnd()));
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = opts.shadow ?? false;
  inst.receiveShadow = true;
  parent.add(inst);
  return inst;
}

/** Dark leaf-cluster silhouettes for out-of-focus foreground framing (always > 2 m from camera). */
export function foregroundLeaves(kit: WorldKit, parent: THREE.Object3D, o: { base: Vec3; dir: Vec3; count: number; size: number; spread: number; seed: number; color?: string }): void {
  const geo = kit.track(new THREE.PlaneGeometry(1, 1));
  geo.translate(0, 0.5, 0);
  const mat = kit.track(new THREE.MeshToonMaterial({ map: kit.leafTexture(), gradientMap: kit.gradient, alphaTest: 0.5, side: THREE.DoubleSide, color: o.color ?? '#6f9a5e' }));
  const rnd = mulberry32(o.seed);
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3(...o.dir).normalize();
  const base = new THREE.Vector3(...o.base);
  const inst = new THREE.InstancedMesh(geo, mat, o.count);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const pt = new THREE.Vector3();
  for (let i = 0; i < o.count; i++) {
    // Leaf axis fans around `dir`; positions jitter near the stem.
    const ang = (rnd() - 0.5) * o.spread;
    const roll = (rnd() - 0.5) * o.spread * 0.8;
    q.setFromUnitVectors(up, d.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), ang).applyAxisAngle(new THREE.Vector3(1, 0, 0), roll).normalize());
    e.set(0, rnd() * Math.PI, 0);
    q.multiply(new THREE.Quaternion().setFromEuler(e));
    const k = o.size * (0.7 + rnd() * 0.6);
    s.set(k * 0.55, k, k);
    pt.copy(base).addScaledVector(d, rnd() * 0.15).add(new THREE.Vector3((rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.2));
    m.compose(pt, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = false;
  inst.receiveShadow = false;
  parent.add(inst);
}

/** Classic wooden telegraph line: poles with crossarms + insulators and sagging wires. Axis 'x' or 'z'. */
export function telegraphLine(kit: WorldKit, parent: THREE.Object3D, o: { axis: 'x' | 'z'; from: number; to: number; at: number; spacing: number; height?: number }): void {
  const h = o.height ?? 5.4;
  const n = Math.max(2, Math.floor(Math.abs(o.to - o.from) / o.spacing) + 1);
  const dir = Math.sign(o.to - o.from) || 1;
  const along = (a: number, across: number, y: number): THREE.Vector3 => (o.axis === 'x' ? new THREE.Vector3(a, y, o.at + across) : new THREE.Vector3(o.at + across, y, a));
  const pole = kit.toon('#5a4430');
  const iron = kit.toon('#2a2a2e');
  const glass = kit.toon('#7fb8a0');
  const poleGeo = kit.track(new THREE.CylinderGeometry(0.06, 0.09, h, 7));
  const armGeo = kit.track(new THREE.BoxGeometry(...(o.axis === 'x' ? [0.08, 0.08, 1.5] : [1.5, 0.08, 0.08]) as [number, number, number]));
  const insGeo = kit.track(new THREE.CylinderGeometry(0.025, 0.035, 0.1, 6));
  const poles = new THREE.InstancedMesh(poleGeo, pole, n);
  const arms = new THREE.InstancedMesh(armGeo, pole, n * 2);
  const ins = new THREE.InstancedMesh(insGeo, glass, n * 8);
  const m = new THREE.Matrix4();
  const wires: THREE.BufferGeometry[] = [];
  const offs = [-0.62, -0.2, 0.2, 0.62];
  for (let i = 0; i < n; i++) {
    const a = o.from + dir * i * o.spacing;
    const p = along(a, 0, h / 2);
    m.makeTranslation(p.x, p.y, p.z);
    poles.setMatrixAt(i, m);
    for (let k = 0; k < 2; k++) {
      const ap = along(a, 0, h - 0.3 - k * 0.55);
      m.makeTranslation(ap.x, ap.y, ap.z);
      arms.setMatrixAt(i * 2 + k, m);
      for (let w = 0; w < 4; w += 1) {
        if (k === 1 && w % 2 === 1) continue;
        const ip = along(a, offs[w] ?? 0, h - 0.3 - k * 0.55 + 0.08);
        m.makeTranslation(ip.x, ip.y, ip.z);
        ins.setMatrixAt(i * 8 + k * 4 + w, m);
      }
    }
    if (i < n - 1) {
      for (let k = 0; k < 2; k++) {
        for (let w = 0; w < 4; w++) {
          if (k === 1 && w % 2 === 1) continue;
          const y0 = h - 0.3 - k * 0.55 + 0.14;
          const pts: THREE.Vector3[] = [];
          for (let s = 0; s <= 10; s++) {
            const t = s / 10;
            pts.push(along(a + dir * o.spacing * t, offs[w] ?? 0, y0 - 4 * 0.55 * t * (1 - t)));
          }
          wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.01, 4, false));
        }
      }
    }
  }
  ins.count = n * 8;
  for (const mesh of [poles, arms, ins]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
  }
  const merged = mergeGeometries(wires.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  for (const g of wires) g.dispose();
  if (merged) {
    merged.deleteAttribute('uv');
    parent.add(new THREE.Mesh(kit.track(merged), iron));
  }
}

/** Distant birds / swallows: tiny V silhouettes flapping on a circular drift. Returns the per-frame updater. */
export function birdFlock(kit: WorldKit, parent: THREE.Object3D, o: { center: Vec3; radius: number; count: number; seed: number; size?: number; color?: string; speed?: number }): (frame: number) => void {
  const size = o.size ?? 0.22;
  const wing = kit.track(new THREE.BufferGeometry());
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, 0.12, 0.25, -0.85, 0.05, -0.15], 3));
  wing.setIndex([0, 1, 2]);
  wing.computeVertexNormals();
  const mat = kit.track(new THREE.MeshBasicMaterial({ color: o.color ?? '#2a2a34', side: THREE.DoubleSide, fog: true }));
  const rnd = mulberry32(o.seed);
  const birds = Array.from({ length: o.count }, () => {
    const g = new THREE.Group();
    const l = new THREE.Mesh(wing, mat);
    const r = new THREE.Mesh(wing, mat);
    r.scale.x = -1;
    g.add(l, r);
    g.scale.setScalar(size * (0.8 + rnd() * 0.5));
    parent.add(g);
    return { g, l, r, ph: rnd() * 6.28, rad: o.radius * (0.4 + rnd() * 0.6), sp: (o.speed ?? 0.012) * (0.8 + rnd() * 0.5), dy: (rnd() - 0.5) * 1.6, fl: 0.45 + rnd() * 0.2 };
  });
  return (frame) => {
    for (const b of birds) {
      const a = b.ph + frame * b.sp;
      const x = o.center[0] + Math.cos(a) * b.rad;
      const z = o.center[2] + Math.sin(a) * b.rad * 0.55;
      b.g.position.set(x, o.center[1] + b.dy + Math.sin(a * 2.3) * 0.25, z);
      b.g.rotation.y = -a + Math.PI;
      const flap = Math.sin(frame * b.fl + b.ph * 3) * 0.6;
      b.l.rotation.z = flap;
      b.r.rotation.z = -flap;
    }
  };
}
