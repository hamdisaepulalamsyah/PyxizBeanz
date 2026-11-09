// Shared look for every shot: two-tone toon shading, screen-constant ink outlines (inverted hull, no post pass,
// cheap enough for an i3 + Iris Xe), gradient sky, fog = horizon colour, and small procedural props.
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const W = 1080, H = 1920;
export const INK = "#0b0a0c";

// ---------------- toon material ----------------
const ramp = (() => {
  // 3 steps: shade, mid, lit (nearest filtering gives hard bands)
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toonCache = new Map<string, THREE.MeshToonMaterial>();
export const toon = (color: string, extra: Partial<THREE.MeshToonMaterialParameters> = {}) => {
  const key = color + JSON.stringify(Object.keys(extra).length ? { ...extra, map: extra.map ? (extra.map as THREE.Texture).uuid : 0 } : "");
  let m = toonCache.get(key);
  if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra }); toonCache.set(key, m); }
  return m;
};
export const glow = (color: string, intensity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });

// ---------------- ink outline (inverted hull, constant pixel width) ----------------
const inkMat = (px: number) => new THREE.ShaderMaterial({
  uniforms: { px: { value: px }, res: { value: new THREE.Vector2(W, H) }, col: { value: new THREE.Color(INK) } },
  vertexShader: /* glsl */ `
    uniform float px; uniform vec2 res;
    attribute vec3 hullNormal;
    void main() {
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * hullNormal);
      vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
      float l = length(dir);
      if (l > 1e-5) clip.xy += (dir / l) * px * 2.0 / res * clip.w;
      gl_Position = clip;
    }`,
  fragmentShader: /* glsl */ `uniform vec3 col; void main() { gl_FragColor = vec4(col, 1.0); }`,
  side: THREE.BackSide,
  fog: false,
});
const inkMats = new Map<number, THREE.ShaderMaterial>();
const inkFor = (px: number) => { let m = inkMats.get(px); if (!m) { m = inkMat(px); inkMats.set(px, m); } return m; };
/** smooth "hull" normals so the extruded shell has no cracks at hard box corners */
const hullGeo = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
const withHull = (g: THREE.BufferGeometry) => {
  let h = hullGeo.get(g);
  if (!h) {
    const p = new THREE.BufferGeometry();
    p.setAttribute("position", g.getAttribute("position"));
    if (g.index) p.setIndex(g.index);
    const m = mergeVertices(p, 1e-4);
    m.computeVertexNormals();
    m.setAttribute("hullNormal", m.getAttribute("normal"));
    h = m;
    hullGeo.set(g, h);
  }
  return h;
};

/** mesh + ink shell */
export const solid = (g: THREE.BufferGeometry, mat: THREE.Material, px = 3.2) => {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  grp.add(m);
  if (px > 0) { const o = new THREE.Mesh(withHull(g), inkFor(px)); o.renderOrder = -1; grp.add(o); }
  return grp;
};
export const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0, s = 1) => {
  o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); return o;
};

// ---------------- geometry helpers ----------------
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
export const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0);
/** gable roof prism, ridge along x */
export const gable = (w: number, d: number, h: number, over = 0.4) => {
  const s = new THREE.Shape();
  s.moveTo(-d / 2 - over, 0); s.lineTo(d / 2 + over, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(-(w + over * 2) / 2, 0, 0);
  return g;
};
/** pyramid roof (tajug, the stacked Javanese mosque roof) */
export const pyramid = (w: number, h: number) => new THREE.ConeGeometry(w * 0.7071, h, 4, 1).rotateY(Math.PI / 4).translate(0, h / 2, 0);

// ---------------- painted textures ----------------
export const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
};
export const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/** whitewashed plaster with dark seams, roof tiles, grass */
export const plasterTex = (base: string, seed = 1) => canvasTex(256, 256, (g) => {
  const r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(80,60,40,${0.03 + r() * 0.05})`; g.beginPath(); g.arc(r() * 256, r() * 256, 4 + r() * 18, 0, 7); g.fill(); }
  g.fillStyle = "rgba(60,40,30,0.25)"; g.fillRect(0, 236, 256, 20);
});
export const tileTex = (base: string) => canvasTex(256, 256, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 21) {
    g.fillStyle = "rgba(40,15,10,0.55)"; g.fillRect(0, y, 256, 3);
    for (let x = (y / 21) % 2 ? 0 : 16; x < 256; x += 32) { g.fillRect(x, y, 3, 21); }
  }
}, 2);
export const grassTex = () => canvasTex(256, 256, (g) => {
  const r = rng(7);
  g.fillStyle = "#6aab4f"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? "rgba(60,120,50,0.35)" : "rgba(140,190,90,0.3)"; g.fillRect(r() * 256, r() * 256, 2, 5); }
}, 30);
export const dirtTex = () => canvasTex(256, 256, (g) => {
  const r = rng(3);
  g.fillStyle = "#c9a878"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(110,80,50,${0.08 + r() * 0.12})`; g.beginPath(); g.arc(r() * 256, r() * 256, 1 + r() * 4, 0, 7); g.fill(); }
}, 12);

// ---------------- sky ----------------
export type Sky = { top: string; horizon: string; fogNear: number; fogFar: number };
export const SKIES: Record<string, Sky> = {
  day: { top: "#3e7fd2", horizon: "#b8d0ec", fogNear: 30, fogFar: 260 },
  golden: { top: "#ffb870", horizon: "#f4d3a0", fogNear: 25, fogFar: 220 },
  dusk: { top: "#2b3a78", horizon: "#e9a07a", fogNear: 25, fogFar: 220 },
  night: { top: "#0d1433", horizon: "#3a4a7a", fogNear: 30, fogFar: 260 },
  indoor: { top: "#3a2a22", horizon: "#3a2a22", fogNear: 12, fogFar: 40 },
};
export const skyDome = (s: Sky) => new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(s.top) }, hor: { value: new THREE.Color(s.horizon) } },
    vertexShader: `varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vp; void main(){ float h = clamp(vp.y*1.6, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.7)), 1.0); }`,
  }),
);

// ---------------- camera maths ----------------
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoother = (x: number) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export type V3 = [number, number, number];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** camera key: frame (relative to the shot), position, look target, fov */
export type CamKey = { f: number; pos: V3; look: V3; fov?: number; roll?: number };
/** glide between keys with smootherstep; holds creep forward ~0.25 %/frame so nothing ever freezes */
export const camAt = (keys: CamKey[], f: number) => {
  let i = 0;
  while (i < keys.length - 1 && f >= keys[i + 1].f) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const t = b === a ? 0 : smoother((f - a.f) / (b.f - a.f));
  let pos = lerp3(a.pos, b.pos, t);
  const look = lerp3(a.look, b.look, t);
  const fov = lerp(a.fov ?? 40, b.fov ?? 40, t);
  const roll = lerp(a.roll ?? 0, b.roll ?? 0, t);
  if (f > keys[keys.length - 1].f) {
    const k = Math.min(0.25, (f - keys[keys.length - 1].f) * 0.0025);
    pos = lerp3(pos, look, k);
  }
  return { pos, look, fov, roll };
};
