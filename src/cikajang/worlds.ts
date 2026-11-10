import * as THREE from 'three';
import { PALETTE, type WorldFrame, WorldKit, mulberry32 } from '../persis/worlds';
import type { Vec3, WorldId } from './story';
import { clamp01, easeInCubic, easeOutCubic, keyed, lerp, smoothstep } from './story';
import { ERA_FONT } from './fonts';
import { birdFlock, cabbageGeometry, carrotTopGeometry, floraMaterial, foregroundLeaves, instancePrefab, leekGeometry, ridgeGeometry, telegraphLine, type Placement } from './flora';
import { carvedStonePaint, fitFont, inkStampPaint, muralLetteringPaint, platePaint, platePlane, plateBacking, stencilPaint } from './signage';
import { DESK_HEIGHT, SEAT_HEIGHT } from './toon';

/**
 * Three.js worlds for "Sejarah Cikajang, Garut" (11 sets for 13 shots) plus the
 * film pass (DoF, sepia/grey grade, grain). Reuses the Persis WorldKit so the
 * toon materials, ink lines and lighting language match. Every animated value is
 * a pure function of the frame.
 *
 * Floors and grounds are deliberately oversized (≥ 400 m outdoors, closed rooms
 * indoors) so no camera move ever reveals empty space.
 */

export { WorldKit };
export type { WorldFrame };

export interface WorldScene {
  id: WorldId;
  group: THREE.Group;
  /** Named floor positions where cast billboards are planted. */
  anchors: Record<string, THREE.Vector3>;
  background: THREE.Color;
  fog: THREE.Fog;
  update: (f: WorldFrame) => void;
}

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

// ── Shared set pieces ───────────────────────────────────────────────────────

function groundPlane(kit: WorldKit, g: THREE.Object3D, color: string, opts: { size?: number; y?: number; paint?: Paint; repeat?: number; center?: Vec3 } = {}): THREE.Mesh {
  const size = opts.size ?? 400;
  const c = opts.center ?? [0, 0, 0];
  const mat = opts.paint ? kit.toon('#ffffff', { map: kit.canvas(512, 512, opts.paint, { repeat: [opts.repeat ?? 60, opts.repeat ?? 60] }) }) : color;
  return kit.mesh(g, new THREE.PlaneGeometry(size, size), mat, [c[0], opts.y ?? 0, c[2]], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
}

function speckle(base: string, dots: readonly string[], seed: number, n = 900): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      c.fillStyle = dots[i % dots.length] ?? base;
      c.globalAlpha = 0.25 + r() * 0.4;
      c.beginPath();
      c.ellipse(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}

function cementPaint(seed: number, base = '#a8a196'): Paint {
  return (c, w, h) => {
    speckle(base, ['#8e877c', '#bcb5a8', '#7a746a'], seed, 1400)(c, w, h);
    c.strokeStyle = 'rgba(60,55,50,0.35)';
    c.lineWidth = 2;
    c.strokeRect(1, 1, w - 2, h - 2);
    const r = mulberry32(seed + 9);
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      let x = r() * w;
      let y = r() * h;
      c.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (r() - 0.5) * 80;
        y += (r() - 0.5) * 80;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  };
}

interface SkyOpts {
  stops: readonly (readonly [number, string])[];
  ridges?: readonly { pts: readonly (readonly [number, number])[]; color: string }[];
  clouds?: { color: string; count: number; y: number };
  sun?: { x: number; y: number; r: number; color: string };
  seed: number;
}

function sky(opts: SkyOpts): Paint {
  return (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    for (const [t, col] of opts.stops) g.addColorStop(t, col);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (opts.sun) {
      const s = opts.sun;
      const rg = c.createRadialGradient(s.x * w, s.y * h, 0, s.x * w, s.y * h, s.r * w * 4);
      rg.addColorStop(0, s.color);
      rg.addColorStop(0.2, s.color);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, w, h);
    }
    const r = mulberry32(opts.seed);
    if (opts.clouds) {
      c.fillStyle = opts.clouds.color;
      for (let i = 0; i < opts.clouds.count; i++) {
        const x = r() * w;
        const y = (opts.clouds.y + (r() - 0.5) * 0.18) * h;
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          c.ellipse(x + (k - 2) * w * 0.02, y + Math.sin(k) * h * 0.008, w * (0.025 + r() * 0.02), h * (0.012 + r() * 0.01), 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    for (const rd of opts.ridges ?? []) {
      c.fillStyle = rd.color;
      c.beginPath();
      c.moveTo(0, h);
      for (const [x, y] of rd.pts) c.lineTo(x * w, y * h);
      c.lineTo(w, h);
      c.closePath();
      c.fill();
    }
  };
}

/** Cikuray-like volcano silhouettes plus rolling hills. */
const CIKURAY_RIDGES = (far: string, near: string): SkyOpts['ridges'] => [
  { pts: [[0, 0.72], [0.18, 0.66], [0.34, 0.5], [0.42, 0.42], [0.5, 0.4], [0.58, 0.44], [0.7, 0.58], [0.86, 0.64], [1, 0.62]], color: far },
  { pts: [[0, 0.8], [0.14, 0.74], [0.3, 0.78], [0.5, 0.72], [0.66, 0.77], [0.82, 0.71], [1, 0.76]], color: near },
];

function lightRig(kit: WorldKit, g: THREE.Object3D, o: { sky: string; ground: string; hemi: number; key: string; keyIntensity: number; keyPos: Vec3; keyTarget: Vec3; extent: number }): THREE.DirectionalLight {
  g.add(new THREE.HemisphereLight(o.sky, o.ground, o.hemi));
  const key = new THREE.DirectionalLight(o.key, o.keyIntensity);
  key.position.set(...o.keyPos);
  key.target.position.set(...o.keyTarget);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  const c = key.shadow.camera;
  c.left = -o.extent;
  c.right = o.extent;
  c.top = o.extent;
  c.bottom = -o.extent;
  c.near = 0.5;
  c.far = 120;
  g.add(key, key.target);
  void kit;
  return key;
}

function mountains(kit: WorldKit, g: THREE.Object3D, specs: readonly { x: number; z: number; r: number; h: number; color: string }[]): void {
  for (const m of specs) kit.mesh(g, new THREE.ConeGeometry(m.r, m.h, 9, 1), kit.facet(m.color), [m.x, m.h / 2 - 0.5, m.z], { ink: false, shadow: false });
}

/** Railway along x (axis 'x') or z (axis 'z'). */
function railway(kit: WorldKit, g: THREE.Object3D, o: { axis: 'x' | 'z'; from: number; to: number; at: number; y?: number; rust?: boolean }): void {
  const y = o.y ?? 0;
  const len = o.to - o.from;
  const mid = (o.from + o.to) / 2;
  const along = (a: number, across: number): Vec3 => (o.axis === 'x' ? [a, y, o.at + across] : [o.at + across, y, a]);
  const sz = (l: number, h: number, w: number): Vec3 => (o.axis === 'x' ? [l, h, w] : [w, h, l]);
  const ballast = along(mid, 0);
  const gravel = kit.toon('#ffffff', { map: kit.canvas(256, 256, speckle('#6a635a', ['#4a443d', '#8a8378', '#a39d90', '#5a534a'], 17, 1500), { repeat: o.axis === 'x' ? [Math.abs(len) / 1.6, 1.5] : [1.5, Math.abs(len) / 1.6] }) });
  kit.box(g, sz(len, 0.16, 2.4), [ballast[0], y + 0.08, ballast[2]], gravel, { ink: false, shadow: false });
  // Weathered timber sleepers (paint.js 'beam' texture).
  const sleeper = kit.toon(o.rust ? '#b8a890' : '#ffffff', { map: kit.canvas(256, 64, beamPaint(o.rust ? '#5a4632' : '#4a3424', o.rust ? 7 : 5)) });
  const n = Math.floor(Math.abs(len) / 0.6);
  const geo = new THREE.BoxGeometry(...sz(0.22, 0.08, 2.0));
  const inst = new THREE.InstancedMesh(kit.track(geo), sleeper, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const p = along(o.from + i * 0.6 * Math.sign(len), 0);
    m.makeTranslation(p[0], y + 0.2, p[2]);
    inst.setMatrixAt(i, m);
  }
  inst.receiveShadow = true;
  g.add(inst);
  for (const s of [-0.6, 0.6]) {
    const p = along(mid, s);
    kit.box(g, sz(len, 0.1, 0.08), [p[0], y + 0.29, p[2]], o.rust ? '#7a4a2e' : '#9aa0b8', { ink: false });
  }
}

function platformSlab(kit: WorldKit, g: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, top: number, paint: Paint, edge = '#e8dcb8'): void {
  const w = x1 - x0;
  const d = z1 - z0;
  const mat = kit.toon('#ffffff', { map: kit.canvas(512, 512, paint, { repeat: [w / 2, d / 2] }) });
  kit.mesh(g, new THREE.BoxGeometry(w, top, d), mat, [(x0 + x1) / 2, top / 2, (z0 + z1) / 2], { ink: 20 });
  kit.box(g, [w, 0.03, 0.2], [(x0 + x1) / 2, top + 0.016, z1 - 0.1], edge, { ink: false, shadow: false });
}

function windowPane(kit: WorldKit, g: THREE.Object3D, pos: Vec3, w: number, h: number, glass: string, frame: string): void {
  kit.box(g, [w + 0.16, h + 0.16, 0.08], pos, frame, { ink: 20 });
  kit.box(g, [w, h, 0.04], [pos[0], pos[1], pos[2] + 0.04], kit.lit(glass), { ink: false, shadow: false });
  kit.box(g, [0.05, h, 0.06], [pos[0], pos[1], pos[2] + 0.07], frame, { ink: false });
  kit.box(g, [w, 0.05, 0.06], [pos[0], pos[1] + h * 0.15, pos[2] + 0.07], frame, { ink: false });
}

/** Colonial station facade along x, front face at z = `face`. */
function facade(kit: WorldKit, g: THREE.Object3D, o: { x0: number; x1: number; face: number; h: number; wall: THREE.Material | string; roof: string; plinth?: string; depth?: number }): void {
  const depth = o.depth ?? 6;
  const w = o.x1 - o.x0;
  const cx = (o.x0 + o.x1) / 2;
  kit.box(g, [w, o.h, depth], [cx, o.h / 2, o.face - depth / 2], o.wall, { ink: 20 });
  kit.box(g, [w + 0.02, 0.5, 0.06], [cx, 0.25, o.face + 0.02], o.plinth ? o.plinth : kit.toon('#ffffff', { map: kit.canvas(512, 128, stonePaint('#6a6058', 9), { repeat: [w / 2, 1] }) }), { ink: false, shadow: false });
  kit.box(g, [w + 1.2, 0.18, depth + 2.6], [cx, o.h + 0.09, o.face - depth / 2 + 0.7], '#e8dcc0', { ink: 20 });
  kit.hipRoof(g, w + 1.6, depth + 3, 2.2, [cx, o.h + 0.18, o.face - depth / 2 + 0.7], o.roof);
}

function door(kit: WorldKit, g: THREE.Object3D, x: number, face: number, w: number, h: number, wood: string, y0 = 0): void {
  kit.box(g, [w + 0.24, h + 0.14, 0.1], [x, y0 + (h + 0.14) / 2, face + 0.04], '#3e2a1c', { ink: 20 });
  for (const s of [-1, 1]) {
    const lx = x + (s * w) / 4;
    kit.box(g, [w / 2 - 0.03, h, 0.06], [lx, y0 + h / 2, face + 0.1], wood, { ink: 20 });
    kit.box(g, [w / 2 - 0.2, h * 0.36, 0.02], [lx, y0 + h * 0.7, face + 0.14], kit.toon(shadeHex(wood, -0.18)), { ink: 10 });
    kit.box(g, [w / 2 - 0.2, h * 0.36, 0.02], [lx, y0 + h * 0.27, face + 0.14], kit.toon(shadeHex(wood, -0.18)), { ink: 10 });
  }
}

function shadeHex(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount * 0.5);
  return `#${c.getHexString()}`;
}

/** Transparent painted mountain silhouette layer with a mist band at its foot. */
function ridgeLayer(kit: WorldKit, g: THREE.Object3D, o: { z: number; y: number; w: number; h: number; color: string; mist: string; seed: number; pts: readonly (readonly [number, number])[] }): void {
  const tex = kit.canvas(1536, Math.round((1536 * o.h) / o.w), (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, shadeHex(o.color, 0.12));
    grad.addColorStop(1, o.color);
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(0, h);
    const r = mulberry32(o.seed);
    o.pts.forEach(([x, y], i) => {
      const next = o.pts[i + 1];
      c.lineTo(x * w, y * h);
      if (next) for (let k = 1; k < 6; k++) c.lineTo(lerp(x, next[0], k / 6) * w, (lerp(y, next[1], k / 6) + (r() - 0.5) * 0.02) * h);
    });
    c.lineTo(w, h);
    c.closePath();
    c.fill();
    // Ridge-line highlight and soft mist pooling at the base.
    c.globalCompositeOperation = 'source-atop';
    const mist = c.createLinearGradient(0, h * 0.45, 0, h);
    mist.addColorStop(0, 'rgba(255,255,255,0)');
    mist.addColorStop(1, o.mist);
    c.fillStyle = mist;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  });
  const mat = kit.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, toneMapped: false, depthWrite: false }));
  kit.mesh(g, new THREE.PlaneGeometry(o.w, o.h), mat, [0, o.y, o.z], { ink: false, shadow: false });
}

/** Chunky aged wooden sign with carved letters, iron frame + rivets and thick inked posts. */
function carvedSign(kit: WorldKit, g: THREE.Object3D, lines: readonly string[], size: readonly [number, number], center: Vec3, yaw: number): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(...center);
  grp.rotation.y = yaw;
  g.add(grp);
  const [w, h] = size;
  const tex = kit.canvas(1024, Math.round((1024 * h) / w), (c, cw, ch) => {
    planksPaint('#8a5a34', 17)(c, cw, ch);
    const r = mulberry32(19);
    c.strokeStyle = 'rgba(50,28,14,0.35)';
    c.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const y = r() * ch;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(cw * 0.3, y + (r() - 0.5) * 20, cw * 0.7, y + (r() - 0.5) * 20, cw, y + (r() - 0.5) * 10);
      c.stroke();
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const lh = ch / (lines.length + 0.5);
    lines.forEach((line, i) => {
      const y = lh * (i + 0.78);
      fitFont(c, line, '900', ERA_FONT.editorial, Math.round(lh * (i === 0 ? 0.66 : 0.56)), cw * 0.86, 3);
      // Carved: dark recess, light lower lip, painted cream face.
      c.fillStyle = 'rgba(30,16,8,0.85)';
      c.fillText(line, cw / 2 - 3, y - 3);
      c.fillStyle = 'rgba(255,220,170,0.45)';
      c.fillText(line, cw / 2 + 3, y + 3);
      c.fillStyle = '#f3e6c4';
      c.fillText(line, cw / 2, y);
    });
    c.letterSpacing = '0px';
    c.fillStyle = 'rgba(30,20,10,0.25)';
    for (let i = 0; i < 70; i++) c.fillRect(r() * cw, r() * ch, 2 + r() * 8, 2 + r() * 4);
  });
  kit.box(grp, [w + 0.04, h + 0.04, 0.12], [0, 0, -0.06], '#5a3a20', { ink: 30 });
  kit.mesh(grp, new THREE.PlaneGeometry(w, h), kit.toon('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.3 }), [0, 0, 0.002], { ink: false, shadow: false });
  const iron = kit.toon('#2c2a2e');
  for (const sy of [-1, 1]) kit.box(grp, [w + 0.14, 0.06, 0.15], [0, sy * (h / 2 + 0.03), -0.04], iron, { ink: 30 });
  for (const sx of [-1, 1]) kit.box(grp, [0.06, h + 0.18, 0.15], [sx * (w / 2 + 0.03), 0, -0.04], iron, { ink: 30 });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) kit.mesh(grp, new THREE.SphereGeometry(0.025, 8, 6), '#8a8478', [sx * (w / 2 + 0.03), sy * (h / 2 + 0.03), 0.04], { ink: false });
  for (const sx of [-1, 1]) kit.cyl(grp, 0.07, 0.08, center[1] + 0.1, [sx * w * 0.36, -center[1] / 2 - 0.05, -0.12], '#4a3220', { seg: 10, ink: 40 });
  return grp;
}

function puffs(kit: WorldKit, g: THREE.Object3D, n: number, color: string): THREE.Sprite[] {
  const out: THREE.Sprite[] = [];
  for (let i = 0; i < n; i++) out.push(kit.puff(g, color));
  return out;
}

/** Rising steam from a moving or fixed source; `source(birthProgress)` gives the emitter position. */
function steamUpdate(list: readonly THREE.Sprite[], localFrame: number, every: number, life: number, source: (birthFrame: number) => THREE.Vector3, opts: { rise: number; drift: number; grow: number; opacity: number }): void {
  list.forEach((s, i) => {
    const birth = Math.floor(localFrame / every) * every - i * every;
    const age = localFrame - birth;
    s.visible = birth >= -life && age >= 0 && age < life;
    if (!s.visible) return;
    const p = source(birth);
    s.position.set(p.x + age * opts.drift, p.y + Math.sqrt(age) * opts.rise, p.z);
    s.scale.setScalar(0.3 + age * opts.grow);
    s.material.opacity = opts.opacity * (1 - age / life) * smoothstep(0, 4, age);
  });
}

function fogBank(kit: WorldKit, g: THREE.Object3D, n: number, box: { min: Vec3; max: Vec3 }, color: string, seed: number): (frame: number) => void {
  const r = mulberry32(seed);
  const items = Array.from({ length: n }, () => ({ s: kit.puff(g, color), x: lerp(box.min[0], box.max[0], r()), y: lerp(box.min[1], box.max[1], r()), z: lerp(box.min[2], box.max[2], r()), size: 2 + r() * 4, sp: 0.004 + r() * 0.01, ph: r() * 6 }));
  const span = box.max[0] - box.min[0];
  return (frame) => {
    for (const it of items) {
      const x = box.min[0] + ((((it.x - box.min[0] + frame * it.sp) % span) + span) % span);
      it.s.position.set(x, it.y + Math.sin(frame * 0.01 + it.ph) * 0.15, it.z);
      it.s.scale.set(it.size * 1.8, it.size, 1);
      const edge = Math.min(smoothstep(box.min[0], box.min[0] + 3, x), 1 - smoothstep(box.max[0] - 3, box.max[0], x));
      it.s.material.opacity = 0.22 * edge;
    }
  };
}

function grassTexture(kit: WorldKit, seed: number, colors: readonly string[]): THREE.CanvasTexture {
  return kit.canvas(128, 128, (c, w, h) => {
    const r = mulberry32(seed);
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = colors[i % colors.length] ?? '#5a8a3a';
      c.lineWidth = 3 + r() * 3;
      c.lineCap = 'round';
      const x = w * (0.15 + r() * 0.7);
      c.beginPath();
      c.moveTo(x, h);
      c.quadraticCurveTo(x + (r() - 0.5) * 30, h * 0.5, x + (r() - 0.5) * 50, h * (0.05 + r() * 0.35));
      c.stroke();
    }
  });
}

/** Instanced crossed-quad grass tufts scattered in a rectangle. */
function grass(kit: WorldKit, g: THREE.Object3D, o: { min: Vec3; max: Vec3; count: number; size: number; seed: number; colors: readonly string[]; y?: (x: number, z: number) => number }): void {
  const tex = grassTexture(kit, o.seed, o.colors);
  const mat = kit.track(new THREE.MeshToonMaterial({ map: tex, gradientMap: kit.gradient, alphaTest: 0.5, side: THREE.DoubleSide }));
  const geo = kit.track(new THREE.PlaneGeometry(1, 1));
  geo.translate(0, 0.5, 0);
  const r = mulberry32(o.seed + 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const yaw0 of [0, Math.PI / 2]) {
    const inst = new THREE.InstancedMesh(geo, mat, o.count);
    const rr = mulberry32(o.seed + 7);
    for (let i = 0; i < o.count; i++) {
      const x = lerp(o.min[0], o.max[0], rr());
      const z = lerp(o.min[2], o.max[2], rr());
      const k = o.size * (0.6 + rr() * 0.8);
      p.set(x, o.y ? o.y(x, z) : o.min[1], z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw0 + rr() * 0.6);
      s.set(k * 1.2, k, k);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = false;
    inst.receiveShadow = true;
    g.add(inst);
  }
  void r;
}

function room(kit: WorldKit, g: THREE.Object3D, o: { x0: number; x1: number; z0: number; z1: number; h: number; floor: Paint; wall: string; wainscot: string; ceiling: string; skipBack?: boolean }): void {
  const w = o.x1 - o.x0;
  const d = o.z1 - o.z0;
  const cx = (o.x0 + o.x1) / 2;
  const cz = (o.z0 + o.z1) / 2;
  // Oversized floor slab runs well beyond the walls.
  kit.mesh(g, new THREE.PlaneGeometry(w + 12, d + 12), kit.toon('#ffffff', { map: kit.canvas(512, 512, o.floor, { repeat: [(w + 12) / 2, (d + 12) / 2] }) }), [cx, 0, cz], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  kit.box(g, [w + 0.4, 0.2, d + 0.4], [cx, o.h + 0.1, cz], o.ceiling, { ink: false, shadow: false });
  const walls: [Vec3, Vec3][] = [
    [[0.2, o.h, d], [o.x0 - 0.1, o.h / 2, cz]],
    [[0.2, o.h, d], [o.x1 + 0.1, o.h / 2, cz]],
    [[w, o.h, 0.2], [cx, o.h / 2, o.z1 + 0.1]],
  ];
  if (!o.skipBack) walls.push([[w, o.h, 0.2], [cx, o.h / 2, o.z0 - 0.1]]);
  for (const [size, pos] of walls) kit.box(g, size, pos, o.wall, { ink: false });
  // Wainscot band.
  kit.box(g, [w, 0.9, 0.04], [cx, 0.45, o.z0 + 0.02], o.wainscot, { ink: 10, shadow: false });
  kit.box(g, [0.04, 0.9, d], [o.x0 + 0.02, 0.45, cz], o.wainscot, { ink: 10, shadow: false });
  kit.box(g, [0.04, 0.9, d], [o.x1 - 0.02, 0.45, cz], o.wainscot, { ink: 10, shadow: false });
}

/** Old mossy planks ('rotten'): grain, split ends, dark rot patches and green moss along the seams. */
function rottenPlanksPaint(base: string, seed: number): Paint {
  return (c, w, h) => {
    planksPaint(base, seed)(c, w, h);
    const r = mulberry32(seed + 3);
    c.strokeStyle = 'rgba(40,24,12,0.35)';
    c.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      const y = r() * h;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 10, w * 0.7, y + (r() - 0.5) * 10, w, y + (r() - 0.5) * 6);
      c.stroke();
    }
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(30,20,12,${0.2 + r() * 0.25})`;
      c.beginPath();
      c.ellipse(r() * w, r() * h, 8 + r() * 30, 4 + r() * 10, 0, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 160; i++) {
      c.fillStyle = r() > 0.5 ? 'rgba(92,128,58,0.55)' : 'rgba(120,150,70,0.45)';
      const y = (Math.floor(r() * 6) / 6) * h + (r() - 0.5) * 6;
      c.beginPath();
      c.arc(r() * w, y, 1.5 + r() * 4, 0, Math.PI * 2);
      c.fill();
    }
  };
}

/** Weathered timber beam / sleeper: end-grain bands, cracks and bolt holes ('beam'). */
function beamPaint(base: string, seed: number): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    for (let i = 0; i < 18; i++) {
      c.strokeStyle = `rgba(${r() > 0.5 ? '255,230,200' : '20,10,5'},${0.08 + r() * 0.12})`;
      c.lineWidth = 1 + r() * 2;
      const y = r() * h;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y + (r() - 0.5) * 8);
      c.stroke();
    }
    c.strokeStyle = 'rgba(15,8,4,0.6)';
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const x = r() * w;
      c.beginPath();
      c.moveTo(x, h * 0.2);
      c.lineTo(x + 20 + r() * 30, h * (0.4 + r() * 0.4));
      c.stroke();
    }
    c.fillStyle = 'rgba(40,40,44,0.9)';
    for (const x of [w * 0.2, w * 0.8]) {
      c.beginPath();
      c.arc(x, h / 2, 4, 0, Math.PI * 2);
      c.fill();
    }
  };
}

/** Dressed andesite blocks with mortar joints and lichen (plinths, carved stones). */
function stonePaint(base: string, seed: number): Paint {
  return (c, w, h) => {
    c.fillStyle = '#4a4440';
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    const rows = 2;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 ? -w * 0.12 : 0;
      while (x < w) {
        const bw = w * (0.18 + r() * 0.12);
        c.fillStyle = shadeHex(base, (r() - 0.5) * 0.25);
        c.fillRect(x + 3, (row * h) / rows + 3, bw - 6, h / rows - 6);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(x + 3, (row * h) / rows + 3, bw - 6, 4);
        x += bw;
      }
    }
    for (let i = 0; i < 90; i++) {
      c.fillStyle = r() > 0.6 ? 'rgba(150,170,110,0.4)' : 'rgba(20,18,16,0.25)';
      c.beginPath();
      c.arc(r() * w, r() * h, 1 + r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  };
}

/** Platform bench: rotten mossy slats on weathered beams. */
function peronBench(kit: WorldKit, g: THREE.Object3D, center: Vec3, len: number, yaw = 0): void {
  const grp = new THREE.Group();
  grp.position.set(...center);
  grp.rotation.y = yaw;
  g.add(grp);
  const slat = kit.toon('#ffffff', { map: kit.canvas(512, 128, rottenPlanksPaint('#7a5a3a', 91), { repeat: [len / 1.2, 1] }) });
  const beam = kit.toon('#ffffff', { map: kit.canvas(256, 64, beamPaint('#4a3424', 93)) });
  for (const z of [-0.12, 0.0, 0.12]) kit.box(grp, [len, 0.04, 0.1], [0, 0.48, z], slat, { ink: 20 });
  for (const y of [0.66, 0.8]) kit.box(grp, [len, 0.1, 0.03], [0, y, -0.2], slat, { ink: 20 });
  for (const x of [-len / 2 + 0.12, len / 2 - 0.12]) {
    kit.box(grp, [0.08, 0.46, 0.34], [x, 0.23, 0], beam, { ink: 20 });
    kit.box(grp, [0.06, 0.4, 0.05], [x, 0.66, -0.2], beam, { ink: 20 });
  }
}

function planksPaint(base: string, seed: number): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const y = (i / n) * h;
      c.fillStyle = shadeHex(base, (r() - 0.5) * 0.25);
      c.fillRect(0, y + 2, w, h / n - 4);
      c.strokeStyle = 'rgba(30,18,10,0.55)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      c.beginPath();
      const x = r() * w;
      c.moveTo(x, y);
      c.lineTo(x, y + h / n);
      c.stroke();
    }
  };
}

function table(kit: WorldKit, g: THREE.Object3D, center: Vec3, size: Vec3, wood: string): void {
  const [x, , z] = center;
  const [w, h, d] = size;
  kit.box(g, [w, 0.05, d], [x, h - 0.025, z], wood, { ink: 20 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(g, [0.06, h - 0.05, 0.06], [x + sx * (w / 2 - 0.06), (h - 0.05) / 2, z + sz * (d / 2 - 0.06)], shadeHex(wood, -0.2), { ink: 20 });
  kit.box(g, [w - 0.1, 0.08, 0.03], [x, h - 0.09, z - d / 2 + 0.05], shadeHex(wood, -0.2), { ink: 10 });
}

function chair(kit: WorldKit, g: THREE.Object3D, center: Vec3, seat: number, wood: string): void {
  const [x, , z] = center;
  kit.box(g, [0.5, 0.05, 0.46], [x, seat - 0.025, z], wood, { ink: 20 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(g, [0.05, seat - 0.05, 0.05], [x + sx * 0.21, (seat - 0.05) / 2, z + sz * 0.19], shadeHex(wood, -0.2), { ink: 20 });
  kit.box(g, [0.5, 0.5, 0.05], [x, seat + 0.28, z - 0.21], wood, { ink: 20 });
}

function bench(kit: WorldKit, g: THREE.Object3D, center: Vec3, len: number, seat: number, wood: string, back = true): void {
  const [x, , z] = center;
  kit.box(g, [len, 0.06, 0.42], [x, seat - 0.03, z], wood, { ink: 20 });
  for (const sx of [-1, 1]) kit.box(g, [0.06, seat - 0.06, 0.36], [x + sx * (len / 2 - 0.1), (seat - 0.06) / 2, z], shadeHex(wood, -0.2), { ink: 20 });
  if (back) kit.box(g, [len, 0.44, 0.05], [x, seat + 0.3, z - 0.2], wood, { ink: 20 });
}

function steamCup(kit: WorldKit, parent: THREE.Object3D, pos: Vec3, seed: number): (frame: number) => void {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  const porcelain = kit.toonDouble('#f1ece2');
  kit.cyl(g, 0.075, 0.06, 0.012, [0, 0.006, 0], porcelain, { seg: 24, ink: 40 });
  kit.cyl(g, 0.048, 0.034, 0.06, [0, 0.042, 0], porcelain, { seg: 24, ink: 40 });
  kit.mesh(g, new THREE.CircleGeometry(0.044, 20), '#3c200e', [0, 0.066, 0], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  const list = puffs(kit, g, 8, '#fff4e6');
  const period = 70;
  return (frame) => {
    list.forEach((s, i) => {
      const c = (((frame + (i * period) / list.length + seed * 9) % period) + period) % period / period;
      s.position.set(Math.sin(c * 5 + i * 1.7) * 0.02 * (1 + 2 * c), 0.08 + c * 0.34, Math.cos(c * 4 + i) * 0.012);
      s.scale.setScalar(0.04 + c * 0.13);
      s.material.opacity = Math.pow(Math.sin(Math.PI * c), 1.2) * 0.34;
    });
  };
}

function lantern(kit: WorldKit, parent: THREE.Object3D, hook: Vec3, drop: number, seed: number, intensity = 3): (frame: number) => void {
  const pivot = new THREE.Group();
  pivot.position.set(...hook);
  parent.add(pivot);
  kit.cyl(pivot, 0.006, 0.006, drop - 0.12, [0, -(drop - 0.12) / 2, 0], PALETTE.ink, { seg: 4, ink: false, shadow: false });
  const body = new THREE.Group();
  body.position.y = -drop;
  pivot.add(body);
  kit.hipRoof(body, 0.24, 0.24, 0.12, [0, 0.12, 0], '#2c2a2a');
  kit.cyl(body, 0.08, 0.09, 0.22, [0, 0, 0], kit.lit('#ffd28a', { transparent: true, opacity: 0.8 }), { seg: 12, ink: false, shadow: false });
  kit.cyl(body, 0.11, 0.12, 0.05, [0, -0.13, 0], '#2c2a2a', { seg: 12 });
  const flame = kit.glow(body, '#ffcf7a', 0.9, [0, 0, 0], 0.9);
  const light = new THREE.PointLight('#ffae52', intensity, 7, 1.3);
  body.add(light);
  return (frame) => {
    const t = frame / 30;
    pivot.rotation.z = 0.1 * Math.sin(t * 1.15 + seed) + 0.035 * Math.sin(t * 2.7 + seed * 2);
    pivot.rotation.x = 0.05 * Math.sin(t * 0.8 + seed + 1);
    const flick = 1 + Math.sin(frame * 0.9 + seed) * 0.07 + Math.sin(frame * 2.3) * 0.04;
    light.intensity = intensity * flick;
    flame.material.opacity = Math.min(1, 0.82 + (flick - 1) * 1.5);
  };
}

/** Analogue platform/wall clock showing a fixed time; the second hand sweeps. */
function clock(kit: WorldKit, g: THREE.Object3D, pos: Vec3, radius: number, hh: number, mm: number, caption?: string): (frame: number) => void {
  const grp = new THREE.Group();
  grp.position.set(...pos);
  g.add(grp);
  const face = kit.canvas(512, 512, (c, w) => {
    c.fillStyle = '#f6f0e0';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#1b1b1b';
    c.lineWidth = 18;
    c.stroke();
    c.fillStyle = '#1b1b1b';
    c.font = `700 54px ${ERA_FONT.colonial}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      c.fillText(String(i), w / 2 + Math.cos(a) * w * 0.37, w / 2 + Math.sin(a) * w * 0.37);
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      c.fillRect(w / 2 + Math.cos(a) * w * 0.45 - 2, w / 2 + Math.sin(a) * w * 0.45 - 2, 4, 4);
    }
    if (caption) {
      c.font = `700 34px ${ERA_FONT.colonial}`;
      c.fillText(caption, w / 2, w * 0.66);
    }
  });
  kit.cyl(grp, radius + 0.04, radius + 0.04, 0.08, [0, 0, -0.04], '#2a2a2e', { rot: [Math.PI / 2, 0, 0], seg: 32 });
  kit.mesh(grp, new THREE.CircleGeometry(radius, 40), kit.toon('#ffffff', { map: face }), [0, 0, 0.002], { ink: false, shadow: false });
  const hand = (len: number, width: number, angle: number, z: number, color: string): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    pivot.rotation.z = -angle;
    grp.add(pivot);
    kit.box(pivot, [width, len, 0.01], [0, len / 2 - radius * 0.08, 0], color, { ink: false, shadow: false });
    return pivot;
  };
  const minuteA = (mm / 60) * Math.PI * 2;
  const hourA = ((hh % 12) / 12 + mm / 720) * Math.PI * 2;
  hand(radius * 0.55, radius * 0.08, hourA, 0.01, '#1b1b1b');
  hand(radius * 0.82, radius * 0.05, minuteA, 0.02, '#1b1b1b');
  const sec = hand(radius * 0.85, radius * 0.02, 0, 0.03, '#b02a2a');
  return (frame) => {
    sec.rotation.z = -((Math.floor(frame / 30) % 60) / 60) * Math.PI * 2;
  };
}

interface Loco {
  group: THREE.Group;
  /** Chimney position in loco-local space. */
  chimney: THREE.Vector3;
  roll: (travelled: number) => void;
}

/** Cartoon steam locomotive; front faces +x. */
function steamLoco(kit: WorldKit, parent: THREE.Object3D, body = '#17151f', trim = '#9b2c2c'): Loco {
  const loco = new THREE.Group();
  parent.add(loco);
  const black = kit.toon(body);
  const red = kit.toon(trim);
  kit.box(loco, [5.4, 0.3, 1.3], [-0.2, 0.75, 0], black);
  kit.cyl(loco, 0.58, 0.58, 3.0, [0.7, 1.55, 0], black, { rot: [0, 0, Math.PI / 2], seg: 24 });
  kit.cyl(loco, 0.62, 0.62, 0.5, [2.3, 1.55, 0], '#24212e', { rot: [0, 0, Math.PI / 2], seg: 24 });
  for (const x of [1.4, 0.4, -0.4]) kit.mesh(loco, new THREE.TorusGeometry(0.59, 0.025, 6, 32), PALETTE.brass, [x, 1.55, 0], { rot: [0, Math.PI / 2, 0], ink: false });
  kit.cyl(loco, 0.2, 0.16, 0.8, [1.9, 2.4, 0], black, { seg: 16 });
  kit.cyl(loco, 0.18, 0.2, 0.36, [0.4, 2.2, 0], PALETTE.brass, { seg: 16 });
  kit.box(loco, [1.5, 1.7, 1.45], [-1.5, 1.9, 0], black);
  kit.box(loco, [1.8, 0.1, 1.65], [-1.5, 2.8, 0], '#24212e');
  for (const s of [-1, 1] as const) kit.box(loco, [0.6, 0.5, 0.02], [-1.5, 2.2, s * 0.73], kit.lit('#ffc56b'), { ink: 10, shadow: false });
  kit.box(loco, [2.0, 1.2, 1.35], [-3.3, 1.35, 0], black);
  kit.mesh(loco, new THREE.ConeGeometry(0.72, 0.6, 4), red, [2.7, 0.55, 0], { rot: [0, Math.PI / 4, -Math.PI / 2], ink: 20 });
  kit.box(loco, [0.22, 0.22, 0.22], [2.5, 2.15, 0], kit.lit('#fff0c0'), { ink: 10 });
  kit.glow(loco, '#ffe7a8', 1.8, [2.65, 2.15, 0], 0.7);
  const wheels: { w: THREE.Group; r: number }[] = [];
  for (const [x, r] of [[1.0, 0.46], [0.0, 0.46], [-1.0, 0.46], [1.9, 0.27], [-2.8, 0.3], [-3.8, 0.3]] as const) {
    for (const z of [-0.64, 0.64]) {
      const w = new THREE.Group();
      w.position.set(x, r + 0.3, z);
      loco.add(w);
      kit.cyl(w, r, r, 0.08, [0, 0, 0], red, { rot: [Math.PI / 2, 0, 0], seg: 24 });
      for (let k = 0; k < 4; k++) kit.box(w, [0.04, r * 1.9, 0.09], [0, 0, 0], '#5a1a1a', { rot: [0, 0, (k / 4) * Math.PI], ink: false });
      wheels.push({ w, r });
    }
  }
  return {
    group: loco,
    chimney: new THREE.Vector3(1.9, 2.85, 0),
    roll: (travelled) => {
      for (const { w, r } of wheels) w.rotation.z = -travelled / r;
    },
  };
}

/** Wooden 3rd-class carriage; length along x, centred on its group. */
function carriage(kit: WorldKit, parent: THREE.Object3D, color: string, len = 8): THREE.Group {
  const c = new THREE.Group();
  parent.add(c);
  kit.box(c, [len, 0.25, 1.4], [0, 0.7, 0], '#1d1b22');
  kit.box(c, [len, 1.7, 1.5], [0, 1.7, 0], color, { ink: 20 });
  kit.mesh(c, new THREE.CylinderGeometry(0.9, 0.9, len + 0.1, 24, 1, false, -Math.PI / 2.6, Math.PI / 1.3), '#3a3236', [0, 2.15, 0], { rot: [0, 0, Math.PI / 2], ink: 30 });
  for (let i = 0; i < Math.floor(len / 1.1); i++) for (const s of [-1, 1]) kit.box(c, [0.6, 0.55, 0.02], [-len / 2 + 0.7 + i * 1.1, 1.95, s * 0.76], kit.lit('#d9c08a'), { ink: 10, shadow: false });
  kit.label(c, ['III'], [0.4, 0.3], [0, 1.2, 0.77], { bg: shadeHex(color, -0.1), fg: '#f0d890', font: `800 {size}px ${ERA_FONT.colonial}`, glow: 0.2, letterSpacing: 4 });
  for (const x of [-len / 2 + 1, len / 2 - 1]) for (const z of [-0.62, 0.62]) kit.cyl(c, 0.36, 0.36, 0.08, [x, 0.5, z], '#2a2228', { rot: [Math.PI / 2, 0, 0], seg: 18 });
  return c;
}

// ── Shots 1 & 13: rear door of Stasiun Cikajang at golden dusk ──────────────

function buildStationRear(kit: WorldKit, variant: string): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#7a6a52', { paint: speckle('#7d6c52', ['#5f513e', '#988466', '#6c5a44'], 11), repeat: 80 });
  kit.mesh(g, new THREE.PlaneGeometry(34, 5), kit.toon('#ffffff', { map: kit.canvas(512, 512, cementPaint(12), { repeat: [17, 2.5] }) }), [0, 0.006, 0.8], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });

  const plaster = kit.toon('#ffffff', {
    map: kit.canvas(1024, 512, (c, w, h) => {
      c.fillStyle = '#e6d6b4';
      c.fillRect(0, 0, w, h);
      const r = mulberry32(21);
      for (let i = 0; i < 70; i++) {
        c.fillStyle = `rgba(${90 + r() * 40}, ${80 + r() * 30}, ${60 + r() * 20}, ${0.06 + r() * 0.12})`;
        c.beginPath();
        c.ellipse(r() * w, h * (0.5 + r() * 0.5), 20 + r() * 90, 30 + r() * 120, 0, 0, Math.PI * 2);
        c.fill();
      }
    }, { repeat: [6, 1] }),
  });
  facade(kit, g, { x0: -25, x1: 25, face: -0.9, h: 4.2, wall: plaster, roof: '#8a3a2a', depth: 8 });
  door(kit, g, 1.2, -0.9, 1.5, 2.6, '#7a4a2a');
  // 1930s Staatsspoorwegen enamel plate: wide-tracked Cinzel, double border, brass rivets.
  plateBacking(kit, g, [1.6, 0.34], [1.2, 3.0, -0.84], '#3a2a1c');
  platePlane(kit, g, platePaint([{ t: 'TJIKADJANG' }], { bg: '#efe3c4', fg: '#1d2a4a', rim: '#1d2a4a', family: ERA_FONT.colonial, spacing: 0.16, rivets: true, seed: 4 }), [1.6, 0.34], [1.2, 3.0, -0.84]);
  peronBench(kit, g, [-2.6, 0, -0.5], 1.6);
  for (const x of [-7.5, -4.2, 4.6, 7.8]) {
    windowPane(kit, g, [x, 1.9, -0.86], 1.0, 1.4, '#3a3048', '#5a3a24');
    for (const s of [-1, 1]) kit.box(g, [0.5, 1.5, 0.05], [x + s * 0.8, 1.9, -0.8], '#4f6b4a', { ink: 20, rot: [0, s * 0.5, 0] });
  }

  // Carved stone plaque "1930 – 1982" beside the door, at Dinda's hand height.
  const plaquePos: Vec3 = [-0.12, 1.08, -0.88];
  kit.box(g, [0.78, 0.36, 0.05], [plaquePos[0], plaquePos[1], plaquePos[2] - 0.01], '#8a7a62', { ink: 20 });
  // Chiselled stone (editorial serif): recess shadow, lower rim highlight, moss at the edges.
  platePlane(kit, g, carvedStonePaint('1930 – 1982', { seed: 5 }), [0.7, 0.28], [plaquePos[0], plaquePos[1], plaquePos[2] + 0.02], { glow: 0.3 });
  const glowMat = kit.track(new THREE.MeshBasicMaterial({ map: kit.canvas(1024, 410, carvedStonePaint('1930 – 1982', { glow: true })), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  kit.mesh(g, new THREE.PlaneGeometry(0.7, 0.28), glowMat, [plaquePos[0], plaquePos[1], plaquePos[2] + 0.025], { ink: false, shadow: false });
  const plaqueGlow = kit.glow(g, '#ffc860', 1.4, [plaquePos[0], plaquePos[1], plaquePos[2] + 0.1], 0);

  // The third number: a glowing "?".
  const qTex = kit.canvas(512, 512, (c, w, h) => {
    c.font = `900 ${h * 0.86}px ${ERA_FONT.editorial}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#ffb84a';
    c.shadowBlur = 40;
    c.fillStyle = '#fff1c4';
    c.fillText('?', w / 2, h / 2 + h * 0.04);
  });
  const qMat = kit.track(new THREE.MeshBasicMaterial({ map: qTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  const question = kit.mesh(g, new THREE.PlaneGeometry(0.75, 0.75), qMat, [0.5, 2.32, -0.7], { ink: false, shadow: false });
  const qGlow = kit.glow(g, '#ffb84a', 2.2, [0.5, 2.32, -0.66], 0);

  const swing = lantern(kit, g, [-1.1, 4.0, -0.35], 0.75, 3, 4.5);
  // Dry leaves: some flat on the cement, some tumbling through the foreground.
  const leafMat = kit.track(new THREE.MeshToonMaterial({ color: '#b8742e', gradientMap: kit.gradient, side: THREE.DoubleSide, map: kit.leafTexture(), alphaTest: 0.5 }));
  const leafGeo = kit.track(new THREE.PlaneGeometry(0.09, 0.16));
  const r = mulberry32(31);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(leafGeo, leafMat);
    m.position.set(-1.6 + r() * 4, 0.012, 0.2 + r() * 4.6);
    m.rotation.set(-Math.PI / 2, 0, r() * 6);
    g.add(m);
  }
  const falling = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(leafGeo, leafMat);
    g.add(m);
    return { m, x: -0.6 + r() * 2.4, z: 1.2 + r() * 2.6, ph: r() * 6, sp: 0.006 + r() * 0.004, i };
  });
  const dust = kit.dust(g, [-2, 0.2, -0.8], [3, 3.2, 3], 220, '#ffd9a0', 0.03, 33);
  // Low golden sun raking across the facade: a fake-volumetric beam with motes glowing in it.
  const sunFrom: Vec3 = [-7, 3.6, 5];
  const sunTo: Vec3 = [0.6, 0.6, -0.8];
  const beam = kit.shaft(g, sunFrom, sunTo, 2.2, '#ffb466', 0.14);
  const motes = kit.motes(g, { from: sunFrom, to: sunTo, radius: 2.2, count: 260, color: '#ffd9a0', size: 0.028, seed: 34 });
  // Warm bounce off the cement onto the lower wall.
  kit.point(g, '#ff9a4a', 1.4, 5, [0.4, 0.3, 0.8]);

  kit.backdrop(g, [180, 60], [0, 18, -40], sky({ stops: [[0, '#1b1840'], [0.32, '#4a2e6a'], [0.5, '#a2507a'], [0.66, '#f08a4a'], [0.8, '#ffc070'], [1, '#5a3a3a']], sun: { x: 0.24, y: 0.72, r: 0.035, color: 'rgba(255,214,140,0.95)' }, clouds: { color: 'rgba(255,160,110,0.6)', count: 16, y: 0.5 }, ridges: CIKURAY_RIDGES('#4a2e4e', '#2c1f3a'), seed: 3 }), 3);
  // Golden-dusk rig: warm low key with crisp shadows, twilight-violet ambient fill.
  const key = lightRig(kit, g, { sky: '#2c1f4a', ground: '#1b1840', hemi: 3.2, key: '#ffa550', keyIntensity: 3.6, keyPos: [-12, 4.2, 9], keyTarget: [0.3, 1, -0.8], extent: 7 });
  key.shadow.radius = 1.5;
  g.add(new THREE.HemisphereLight('#6a4a9a', '#2a1a20', 0.5));

  const finale = variant === 'angka-ketiga';
  return {
    id: 'stationRear',
    group: g,
    anchors: { dindaTrace: v3(0.3, 0, -0.62), dindaCenter: v3(0.56, 0, -0.55) },
    background: new THREE.Color('#1b1840'),
    fog: new THREE.Fog('#4a2e52', 18, 85),
    update: ({ frame, progress }) => {
      swing(frame);
      dust(frame);
      motes(frame);
      beam.material.opacity = 0.12 + 0.03 * Math.sin(frame * 0.05);
      for (const l of falling) {
        const c = (((frame * l.sp + l.ph / 6) % 1) + 1) % 1;
        l.m.position.set(l.x + Math.sin(frame * 0.05 + l.ph) * 0.3, 3.2 - c * 3.2, l.z);
        l.m.rotation.set(frame * 0.07 + l.ph, frame * 0.05, frame * 0.03 + l.i);
      }
      const glow = finale ? smoothstep(0.12, 0.35, progress) * (0.85 + 0.15 * Math.sin(frame * 0.12)) : 0;
      glowMat.opacity = glow;
      plaqueGlow.material.opacity = glow * 0.8;
      const q = finale ? smoothstep(0.5, 0.62, progress) : 0;
      const pop = finale ? 1 + 0.25 * Math.exp(-Math.max(0, progress - 0.56) * 30) * Math.sin(Math.max(0, progress - 0.5) * 60) : 1;
      qMat.opacity = q;
      question.scale.setScalar(Math.max(0.01, q * pop));
      question.position.y = 2.32 + Math.sin(frame * 0.06) * 0.03;
      qGlow.material.opacity = q * (0.6 + 0.2 * Math.sin(frame * 0.1));
    },
  };
}

// ── Shot 2: misty platform, 1.246 mdpl sign ─────────────────────────────────

function buildPlatformMist(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#5a6a48', { paint: speckle('#5d6c4a', ['#4a5a3a', '#73835a', '#3e4c30'], 41), repeat: 90 });
  platformSlab(kit, g, -16, 16, -4.9, -0.5, 0.4, cementPaint(42, '#a29c90'));
  railway(kit, g, { axis: 'x', from: -80, to: 80, at: 1.3, rust: true });
  facade(kit, g, { x0: -12, x1: 12, face: -4.9, h: 3.8, wall: '#e8dcc0', roof: '#7a3a2a', depth: 6 });
  door(kit, g, -2.5, -4.9, 1.4, 2.5, '#6a4a2a');
  door(kit, g, 3.5, -4.9, 1.4, 2.5, '#6a4a2a');
  for (const x of [-8, -5.5, 0.5, 6.5, 9]) windowPane(kit, g, [x, 1.9, -4.86], 0.9, 1.3, '#3a4458', '#4a3a2a');
  plateBacking(kit, g, [2.6, 0.45], [0.5, 3.2, -4.84], '#1d2a4a');
  platePlane(kit, g, platePaint([{ t: 'CIKAJANG' }], { bg: '#f2ead6', fg: '#1d2a4a', rim: '#1d2a4a', family: ERA_FONT.colonial, spacing: 0.2, rivets: true, seed: 6 }), [2.6, 0.45], [0.5, 3.2, -4.84]);
  // Canopy over the platform.
  for (let x = -10; x <= 10; x += 4) kit.cyl(g, 0.07, 0.08, 3.3, [x, 0.4 + 1.65, -1.2], '#3a4a5a', { seg: 10 });
  kit.box(g, [22, 0.1, 3.9], [0, 3.75, -2.9], '#6a5a4a', { ink: 20, rot: [0.05, 0, 0] });

  // The elevation sign, chunky 3D cartoon board.
  carvedSign(kit, g, ['CIKAJANG', '1.246 MDPL'], [1.4, 0.68], [-1.35, 2.08, -1.75], 0.18);

  mountains(kit, g, [
    { x: -6, z: -80, r: 40, h: 34, color: '#56705a' },
    { x: 30, z: -95, r: 34, h: 26, color: '#4e6a58' },
    { x: -40, z: -70, r: 28, h: 18, color: '#5c7a5c' },
    { x: 14, z: -55, r: 22, h: 12, color: '#638460' },
  ]);
  grass(kit, g, { min: [-40, 0, 2.6], max: [40, 0, 40], count: 1600, size: 0.5, seed: 43, colors: ['#5a7a3a', '#6e8e48', '#4a6a30'] });
  grass(kit, g, { min: [-16, 0.4, -4.8], max: [16, 0.4, -4.4], count: 120, size: 0.25, seed: 44, colors: ['#5a7a3a', '#6e8e48'] });
  peronBench(kit, g, [2.8, 0.4, -4.3], 1.8);
  peronBench(kit, g, [-4.4, 0.4, -4.3], 1.8);
  const fog = fogBank(kit, g, 26, { min: [-18, 0.6, -14], max: [18, 3.5, 0.5] }, '#e8ecf0', 45);
  const fog2 = fogBank(kit, g, 18, { min: [-60, 5, -70], max: [60, 18, -30] }, '#f0f2f4', 46);
  // Layered mountain silhouettes (near ridge → Cikuray → distant Papandayan), mist between layers.
  ridgeLayer(kit, g, { z: -150, y: 26, w: 520, h: 90, color: '#a9b6bc', mist: 'rgba(232,236,240,0.9)', seed: 1, pts: [[0, 0.62], [0.12, 0.5], [0.2, 0.44], [0.26, 0.47], [0.32, 0.4], [0.4, 0.46], [0.55, 0.58], [0.7, 0.55], [0.85, 0.6], [1, 0.58]] });
  ridgeLayer(kit, g, { z: -110, y: 20, w: 420, h: 80, color: '#8a9ea2', mist: 'rgba(226,232,236,0.85)', seed: 2, pts: [[0, 0.8], [0.3, 0.66], [0.44, 0.34], [0.5, 0.26], [0.56, 0.34], [0.7, 0.62], [0.9, 0.72], [1, 0.74]] });
  ridgeLayer(kit, g, { z: -70, y: 10, w: 300, h: 44, color: '#6c8478', mist: 'rgba(220,228,230,0.8)', seed: 3, pts: [[0, 0.5], [0.15, 0.4], [0.3, 0.52], [0.45, 0.36], [0.6, 0.5], [0.78, 0.38], [1, 0.5]] });
  ridgeLayer(kit, g, { z: -40, y: 4, w: 220, h: 18, color: '#4f6a52', mist: 'rgba(214,222,222,0.75)', seed: 4, pts: [[0, 0.5], [0.2, 0.3], [0.4, 0.46], [0.6, 0.28], [0.8, 0.44], [1, 0.32]] });
  const fog3 = fogBank(kit, g, 20, { min: [-80, 2, -105], max: [80, 14, -45] }, '#eef0f2', 47);
  kit.backdrop(g, [700, 220], [0, 60, -190], sky({ stops: [[0, '#9eb0c2'], [0.45, '#c8d2dc'], [0.75, '#e2e6e8'], [1, '#d8dcdc']], clouds: { color: 'rgba(255,255,255,0.6)', count: 30, y: 0.3 }, seed: 4 }), 4);
  lightRig(kit, g, { sky: '#dfe6f0', ground: '#5a6450', hemi: 1.5, key: '#fff0d6', keyIntensity: 1.8, keyPos: [-6, 12, 8], keyTarget: [0, 0, -2], extent: 12 });
  return {
    id: 'platformMist',
    group: g,
    anchors: { dinda: v3(0, 0.4, -1.5), ayam: v3(0, 0.4, -0.85), anak: v3(-5.6, 0.4, -3.7) },
    background: new THREE.Color('#c8d0d6'),
    fog: new THREE.Fog('#d4dadc', 9, 110),
    update: ({ frame }) => {
      fog(frame);
      fog2(frame);
      fog3(frame);
    },
  };
}

// ── Shot 3: 1930s vegetable terraces at dawn ───────────────────────────────

function buildLadang(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#5a4632', { paint: speckle('#5e4a34', ['#4a3826', '#6e5840', '#3c2c1e'], 51), repeat: 90 });
  const soil = kit.toon('#6a5038');
  // Hero flora: composite cabbages (veined pale heart + six cupped outer leaves) on wavy soil ridges,
  // leek and carrot-top rows, bamboo terrace stakes. All instanced from merged, vertex-coloured prefabs.
  const flora = floraMaterial(kit);
  const rnd = mulberry32(55);
  const cabHigh: Placement[] = [];
  const cabLow: Placement[] = [];
  const leeks: Placement[] = [];
  const carrots: Placement[] = [];
  const stakes: Placement[] = [];
  const terraces = 7;
  const rowKind = (k: number, front: boolean): 'cab' | 'leek' | 'carrot' => {
    if (front) return k % 3 === 2 ? 'carrot' : 'cab';
    return k % 3 === 0 ? 'leek' : 'cab';
  };
  const X0 = -13.7;
  const X1 = 6.9;
  for (let k = 0; k < terraces; k++) {
    const h = 0.4 * (k + 1);
    const z = -1.5 - k * 2.2;
    kit.box(g, [37, h, 2.2], [-11.5, h / 2, z], soil, { ink: 20 });
    for (const front of [false, true]) {
      const rz = z + (front ? 0.4 : -0.5);
      kit.mesh(g, ridgeGeometry(X1 - X0 + 1, 0.64, 0.15, 60 + k * 2 + (front ? 1 : 0)), flora, [(X0 + X1) / 2, h - 0.01, rz], { ink: false, shadow: false });
      const kind = rowKind(k, front);
      for (let x = X0 + (front ? 0.26 : 0); x <= X1; x += 0.52) {
        const px = x + (rnd() - 0.5) * 0.1;
        const pz = rz + (rnd() - 0.5) * 0.06;
        const hero = k === 0 && front ? 1.2 : 0.85 + rnd() * 0.3;
        if (kind === 'cab') (k <= 2 ? cabHigh : cabLow).push({ x: px, y: h + 0.1, z: pz, s: hero });
        else if (kind === 'leek') leeks.push({ x: px, y: h + 0.1, z: pz, s: 1 + rnd() * 0.3 });
        else carrots.push({ x: px, y: h + 0.12, z: pz, s: 0.9 + rnd() * 0.3 });
      }
    }
    // Bamboo ajir along the terrace lip with a horizontal rail.
    for (let x = X0 + 0.4; x <= X1; x += 2.4) stakes.push({ x, y: h, z: z + 1.06, s: 1, r: 0 });
    kit.mesh(g, new THREE.CylinderGeometry(0.014, 0.014, X1 - X0, 5), '#b2a258', [(X0 + X1) / 2, h + 0.36, z + 1.06], { rot: [0, 0, Math.PI / 2], ink: false, shadow: false });
  }
  instancePrefab(kit, g, cabbageGeometry('high'), flora, cabHigh, { tint: ['#d6e6c6', '#ffffff'], seed: 56, shadow: true });
  instancePrefab(kit, g, cabbageGeometry('low'), flora, cabLow, { tint: ['#cfe0bd', '#ffffff'], seed: 57 });
  instancePrefab(kit, g, leekGeometry(), flora, leeks, { seed: 58 });
  instancePrefab(kit, g, carrotTopGeometry(), flora, carrots, { seed: 59 });
  const stakeGeo = new THREE.CylinderGeometry(0.016, 0.022, 0.62, 5);
  stakeGeo.translate(0, 0.31, 0);
  instancePrefab(kit, g, stakeGeo, kit.toon('#b2a258'), stakes, { seed: 60 });

  // Mountain shrubs and trees: tea-like clumps at the east end of the terraces, round trees on the far slope.
  const shrubGeo = new THREE.IcosahedronGeometry(0.34, 1);
  shrubGeo.scale(1.3, 0.8, 1);
  shrubGeo.translate(0, 0.25, 0);
  const shrubs: Placement[] = [];
  for (let i = 0; i < 46; i++) {
    const k = i % terraces;
    shrubs.push({ x: 3.5 + rnd() * 3.6, y: 0.4 * (k + 1) - 0.02, z: -1.5 - k * 2.2 + (rnd() - 0.5) * 1.6, s: 0.7 + rnd() * 0.8 });
  }
  for (let i = 0; i < 30; i++) shrubs.push({ x: 7.6 + rnd() * 1.4, y: 0, z: -14 + rnd() * 15, s: 0.9 + rnd() * 1.1 });
  instancePrefab(kit, g, shrubGeo, kit.facet('#4f8a46'), shrubs, { seed: 61 });
  const trunk = new THREE.CylinderGeometry(0.1, 0.16, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  const crown = new THREE.IcosahedronGeometry(1.3, 1);
  crown.translate(0, 3.1, 0);
  const trees: Placement[] = [];
  for (let i = 0; i < 16; i++) trees.push({ x: 14 + rnd() * 20, y: 0, z: -8 - rnd() * 40, s: 1.2 + rnd() * 1.4 });
  for (let i = 0; i < 10; i++) trees.push({ x: -34 + rnd() * 18, y: 0, z: -30 - rnd() * 40, s: 1.6 + rnd() * 1.6 });
  instancePrefab(kit, g, trunk, kit.toon('#4a3626'), trees, { seed: 62 });
  instancePrefab(kit, g, crown, kit.facet('#3f7c48'), trees, { seed: 62 });

  // Dirt path + stencilled crate and rice sacks.
  kit.mesh(g, new THREE.PlaneGeometry(60, 1.6), '#8a7458', [-6, 0.005, 0.4], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  for (const [x, z, ry] of [[-2.9, 0.85, 0.2], [-1.75, 1.0, -0.3]] as const) {
    const s = kit.mesh(g, new THREE.SphereGeometry(0.28, 12, 8), '#d8c8a0', [x, 0.26, z], { ink: 30, rot: [0, ry, 0] });
    s.scale.set(1, 0.9, 0.75);
  }
  const crateWood = kit.toon('#ffffff', { map: kit.canvas(256, 256, planksPaint('#9a7a4c', 52)) });
  kit.box(g, [0.78, 0.44, 0.5], [-2.3, 0.22, 0.9], crateWood, { ink: 20 });
  // BERAS: charcoal stencil with bridges, painted on the crate front.
  platePlane(kit, g, stencilPaint('BERAS', planksPaint('#a07e50', 53)), [0.7, 0.34], [-2.3, 0.22, 1.156], { glow: 0.2 });

  // Harvest basket (bakul): woven wall, heaped cabbages, carrots and tomatoes.
  const bx = -1.2;
  const bz = 1.0;
  const weave = kit.toon('#ffffff', { map: kit.canvas(256, 128, (c, w, h) => {
    c.fillStyle = '#b88a4a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#7a5428';
    c.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.moveTo(0, (i + 0.5) * (h / 8));
      c.lineTo(w, (i + 0.5) * (h / 8));
      c.stroke();
    }
    for (let i = 0; i < 24; i++) {
      c.beginPath();
      c.moveTo(i * (w / 24), 0);
      c.lineTo(i * (w / 24), h);
      c.stroke();
    }
  }, { repeat: [2, 1] }), side: THREE.DoubleSide });
  kit.mesh(g, new THREE.CylinderGeometry(0.36, 0.26, 0.36, 18, 1, true), weave, [bx, 0.18, bz], { ink: false });
  kit.mesh(g, new THREE.TorusGeometry(0.36, 0.022, 6, 24), '#7a5428', [bx, 0.36, bz], { rot: [Math.PI / 2, 0, 0], ink: false });
  kit.mesh(g, new THREE.TorusGeometry(0.34, 0.02, 6, 16, Math.PI), '#7a5428', [bx, 0.36, bz], { ink: false, rot: [0, 0, 0] });
  const basketCabbages: Placement[] = [
    { x: bx - 0.13, y: 0.3, z: bz + 0.05, s: 0.72, r: 0.4 },
    { x: bx + 0.14, y: 0.3, z: bz - 0.06, s: 0.7, r: 1.7 },
    { x: bx - 0.02, y: 0.36, z: bz - 0.2, s: 0.62, r: 2.9 },
  ];
  instancePrefab(kit, g, cabbageGeometry('high'), flora, basketCabbages, { seed: 63 });
  const carrotGeo = new THREE.ConeGeometry(0.032, 0.24, 7);
  carrotGeo.rotateX(Math.PI);
  carrotGeo.translate(0, -0.12, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = kit.mesh(g, carrotGeo, '#e8782a', [bx + Math.cos(a) * 0.2, 0.46, bz + Math.sin(a) * 0.2 + 0.1], { ink: false, shadow: false, rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
    kit.mesh(c, new THREE.ConeGeometry(0.03, 0.12, 5), '#5a9a3a', [0, 0.06, 0], { ink: false, shadow: false });
  }
  for (let i = 0; i < 5; i++) kit.mesh(g, new THREE.SphereGeometry(0.065, 10, 8), '#d83a2a', [bx - 0.2 + (i % 3) * 0.17, 0.4 + (i > 2 ? 0.05 : 0), bz + 0.2 + Math.floor(i / 3) * 0.1], { ink: 30 });
  // The empty railway beyond the fields, with its telegraph line.
  railway(kit, g, { axis: 'z', from: 10, to: -90, at: 9.6 });
  telegraphLine(kit, g, { axis: 'z', from: 4, to: -92, at: 11.6, spacing: 16 });
  grass(kit, g, { min: [7.4, 0, -60], max: [30, 0, 8], count: 900, size: 0.45, seed: 52, colors: ['#5a7a3a', '#6e8e48'] });
  // Bamboo clump with leaf plumes.
  for (let i = 0; i < 9; i++) kit.cyl(g, 0.05, 0.06, 5 + (i % 3), [12 + (i % 3) * 0.3, 2.6, -4 - Math.floor(i / 3) * 0.3], '#6a8a3a', { seg: 8, rot: [0, 0, (i - 4) * 0.04] });
  foregroundLeaves(kit, g, { base: [12.4, 4.8, -4.4], dir: [0.4, 0.5, 0], count: 34, size: 1.1, spread: 2.6, seed: 64, color: '#7ea84a' });
  const birds = birdFlock(kit, g, { center: [-6, 7.5, -26], radius: 9, count: 7, seed: 65, size: 0.55 });
  const dew = kit.dust(g, [-10, 0.3, -6], [6, 1.6, 1], 200, '#ffffff', 0.02, 53);
  const breath = puffs(kit, g, 10, '#ffffff');
  const fog = fogBank(kit, g, 24, { min: [-30, 1, -22], max: [20, 4, -4] }, '#f2eadc', 54);
  mountains(kit, g, [
    { x: -10, z: -70, r: 38, h: 30, color: '#5e6e58' },
    { x: 24, z: -80, r: 30, h: 22, color: '#56685a' },
  ]);
  kit.backdrop(g, [400, 140], [0, 40, -120], sky({ stops: [[0, '#9ab0c4'], [0.5, '#e8d8c0'], [0.75, '#f6e2c2'], [1, '#c8b89a']], sun: { x: 0.7, y: 0.66, r: 0.02, color: 'rgba(255,240,200,0.9)' }, ridges: CIKURAY_RIDGES('#7a8a80', '#6a7a68'), seed: 5 }), 4);
  lightRig(kit, g, { sky: '#dce4ea', ground: '#5a4a36', hemi: 1.4, key: '#ffe0b0', keyIntensity: 2.0, keyPos: [16, 6, 6], keyTarget: [0, 0, -2], extent: 18 });
  // Walk path of the farmer in story.ts (0 → 1.1 m along x by 60 %).
  const farmerX = (p: number): number => keyed([[0, 0], [0.6, 1.1]], p);
  return {
    id: 'ladang',
    group: g,
    anchors: { petani: v3(-4.3, 0, 0.35), petani2: v3(-1.0, 0.4, -1.45) },
    background: new THREE.Color('#d8ccb4'),
    fog: new THREE.Fog('#e6dcc8', 10, 100),
    update: ({ frame, localFrame, progress }) => {
      dew(frame);
      fog(frame);
      birds(frame);
      steamUpdate(breath, localFrame, 9, 40, (birth) => {
        const alt = Math.floor(birth / 9) % 2 === 0;
        return alt ? v3(-4.3 + farmerX(clamp01(birth / 299)) + 0.1, 1.12, 0.45) : v3(-0.95, 1.46, -1.3);
      }, { rise: 0.05, drift: 0.008, grow: 0.012, opacity: 0.35 });
      void progress;
    },
  };
}

// ── Shot 4: station office, 31 July 1930 ────────────────────────────────────

function buildOffice1930(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  room(kit, g, { x0: -3.5, x1: 3.5, z0: -3.2, z1: 3.6, h: 3.2, floor: planksPaint('#7a5234', 61), wall: '#e6d8b8', wainscot: '#6a4a2e', ceiling: '#d8cbb0' });
  // Window on the back wall + sunbeam.
  windowPane(kit, g, [-1.9, 1.8, -3.08], 1.1, 1.3, '#fff2cc', '#5a3a24');
  kit.shaft(g, [-1.9, 1.9, -3.0], [-0.4, 0.3, -0.6], 0.9, '#ffe6b0', 0.22);
  const motes = kit.motes(g, { from: [-1.9, 1.9, -3.0], to: [-0.4, 0.3, -0.6], radius: 0.9, count: 160, color: '#fff0c8', seed: 62 });

  const s = 1.15;
  const deskTop = DESK_HEIGHT * s;
  // Open-frame desk (legs visible underneath) whose back edge sits just in front of the seated billboard.
  table(kit, g, [0, 0, -0.8], [1.6, deskTop, 0.8], '#6a4228');
  chair(kit, g, [0, 0, -1.5], SEAT_HEIGHT * s, '#5a3820');
  // Desk-top props (no pens here: the only pen is in the station master's hand).
  const cal = new THREE.Group();
  cal.position.set(-0.66, deskTop, -0.48);
  cal.rotation.x = -0.28;
  g.add(cal);
  kit.box(cal, [0.3, 0.34, 0.03], [0, 0.17, -0.02], '#3a2a1c', { ink: 20 });
  kit.label(cal, ['31', 'JULI 1930'], [0.26, 0.3], [0, 0.17, 0.0], { bg: '#f6efdc', fg: '#8a1f1f', font: `900 {size}px ${ERA_FONT.editorial}`, glow: 0.3 });
  const cup = steamCup(kit, g, [0.48, deskTop, -0.62], 3);
  kit.box(g, [0.2, 0.06, 0.12], [0.62, deskTop + 0.03, -0.95], '#2a2a2e', { ink: 20 });
  kit.cyl(g, 0.015, 0.015, 0.08, [0.66, deskTop + 0.1, -0.95], PALETTE.brass, { seg: 6 });
  for (let i = 0; i < 3; i++) kit.box(g, [0.26, 0.05, 0.34], [-0.62, deskTop + 0.025 + i * 0.05, -1.0], ['#5a2a22', '#2a3a5a', '#3a4a2a'][i] ?? '#5a2a22', { ink: 10 });

  // Corner bench for the newspaper reader.
  bench(kit, g, [2.4, 0, -2.75], 1.3, SEAT_HEIGHT * 1.15, '#5a3820');
  // Wall dressing.
  plateBacking(kit, g, [1.5, 0.5], [1.3, 2.25, -3.08], '#3a2a1c');
  platePlane(kit, g, platePaint([{ t: 'STAATSSPOORWEGEN', k: 1.15 }, { t: 'IN NEDERLANDSCH-INDIË', k: 0.75 }], { bg: '#efe3c4', fg: '#3a2412', rim: '#7a2c20', family: ERA_FONT.colonial, spacing: 0.1, rivets: true, seed: 7 }), [1.5, 0.5], [1.3, 2.25, -3.08]);
  plateBacking(kit, g, [1.6, 0.36], [-2.0, 2.75, -3.08], '#3a2a1c');
  platePlane(kit, g, platePaint([{ t: 'LIJN GAROET – TJIKADJANG' }], { bg: '#e8dcbc', fg: '#2a2a3a', rim: '#2a2a3a', family: ERA_FONT.colonial, spacing: 0.06, border: 'single', seed: 8 }), [1.6, 0.36], [-2.0, 2.75, -3.08]);
  const tick = clock(kit, g, [0.2, 2.5, -3.06], 0.24, 10, 15);
  for (let i = 0; i < 4; i++) kit.box(g, [0.22, 0.3, 0.2], [-3.2, 0.95 + Math.floor(i / 2) * 0.4, -1.6 + (i % 2) * 0.3], '#4a3a2a', { ink: 10 });
  kit.box(g, [0.3, 1.8, 1.2], [-3.3, 0.9, -1.4], '#5a3a24', { ink: 20 });
  const bulb = kit.glow(g, '#ffd08a', 0.7, [0.2, 2.75, -0.9], 0.8);
  kit.cyl(g, 0.01, 0.01, 0.4, [0.2, 3.0, -0.9], PALETTE.ink, { seg: 4, ink: false });
  kit.point(g, '#ffcf8a', 2.2, 8, [0.2, 2.7, -0.9]);
  lightRig(kit, g, { sky: '#f0e2c8', ground: '#5a4030', hemi: 1.0, key: '#ffe2b0', keyIntensity: 1.8, keyPos: [-4, 6, -7], keyTarget: [0, 0.6, -0.8], extent: 6 });
  return {
    id: 'office1930',
    group: g,
    anchors: { desk: v3(0, 0, -1.24), corner: v3(2.4, 0, -2.5) },
    background: new THREE.Color('#2a2018'),
    fog: new THREE.Fog('#3a2c20', 12, 40),
    update: ({ frame }) => {
      motes(frame);
      cup(frame);
      tick(frame);
      bulb.material.opacity = 0.75 + Math.sin(frame * 0.4) * 0.03;
    },
  };
}

// ── Shot 5: Cibatu platform, 06.04 ──────────────────────────────────────────

function buildCibatu(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#6a6050', { paint: speckle('#6a6050', ['#585044', '#7a7060'], 71), repeat: 90 });
  platformSlab(kit, g, -16, 18, -4.6, -0.3, 0.45, cementPaint(72, '#b0a898'));
  railway(kit, g, { axis: 'x', from: -90, to: 90, at: 0.9 });
  railway(kit, g, { axis: 'x', from: -90, to: 90, at: 4.4 });
  facade(kit, g, { x0: -14, x1: 16, face: -4.8, h: 4.2, wall: '#ece0c4', roof: '#7a3a2a', depth: 6 });
  for (const x of [-9, -6, -1.5, 3, 7, 11]) door(kit, g, x, -4.8, 1.2, 2.6, '#5a4028', 0.45);
  plateBacking(kit, g, [2.4, 0.42], [1.5, 3.6, -4.74], '#1d2a4a');
  platePlane(kit, g, platePaint([{ t: 'TJIBATOE' }], { bg: '#efe3c4', fg: '#1d2a4a', rim: '#1d2a4a', family: ERA_FONT.colonial, spacing: 0.2, rivets: true, seed: 9 }), [2.4, 0.42], [1.5, 3.6, -4.74]);
  peronBench(kit, g, [-3.6, 0.45, -4.15], 2.0);
  peronBench(kit, g, [5.6, 0.45, -4.15], 2.0);
  for (let x = -12; x <= 16; x += 4) for (const z of [-0.9, -4.0]) kit.cyl(g, 0.07, 0.08, 3.2, [x, 0.45 + 1.6, z], '#2c3440', { seg: 10 });
  kit.box(g, [30, 0.1, 4.0], [2, 3.7, -2.45], '#5a4a3a', { ink: 20 });
  kit.cyl(g, 0.012, 0.012, 0.22, [0.5, 3.55, -2.0], PALETTE.ink, { seg: 4, ink: false });
  const tick = clock(kit, g, [0.5, 3.2, -2.0], 0.3, 6, 4, '06.04');
  platePlane(kit, g, platePaint([{ t: '06.04 – GAROET' }], { bg: '#1d2a3a', fg: '#f6e6b0', rim: '#c9992e', family: ERA_FONT.colonial, spacing: 0.08, border: 'single', seed: 10 }), [0.92, 0.2], [0.5, 2.78, -2.0]);

  const loco = steamLoco(kit, g);
  const coach1 = carriage(kit, g, '#5a3a2a');
  const coach2 = carriage(kit, g, '#4a3a30');
  const steam = puffs(kit, g, 46, '#e6e2dc');
  const fgSteam = puffs(kit, g, 14, '#f2eee8');
  const xAt = (p: number): number => -2.4 + 18 * easeInCubic(smoothstep(0.58, 1, p));
  mountains(kit, g, [{ x: 10, z: -90, r: 36, h: 24, color: '#6a7a6a' }]);
  kit.backdrop(g, [400, 140], [0, 40, -120], sky({ stops: [[0, '#8aa0b8'], [0.55, '#e8d0b0'], [0.8, '#f4dcb8'], [1, '#b8a888']], ridges: CIKURAY_RIDGES('#7a8a80', '#6a7a6a'), seed: 7 }), 4);
  lightRig(kit, g, { sky: '#e0e4ea', ground: '#5a5044', hemi: 1.3, key: '#ffd8a0', keyIntensity: 2.1, keyPos: [12, 7, 9], keyTarget: [0, 0.5, -1.5], extent: 16 });
  const chimney = new THREE.Vector3();
  return {
    id: 'cibatu',
    group: g,
    anchors: { kondektur: v3(0.5, 0.45, -1.55), queue1: v3(2.3, 0.45, -2.4), queue2: v3(2.95, 0.45, -2.62), queue3: v3(3.6, 0.45, -2.42) },
    background: new THREE.Color('#c8b8a0'),
    fog: new THREE.Fog('#d8ccb8', 14, 110),
    update: ({ frame, localFrame, progress }) => {
      tick(frame);
      const x = xAt(progress);
      loco.group.position.set(x, 0, 0.9);
      coach1.position.set(x - 8.8, 0, 0.9);
      coach2.position.set(x - 17.3, 0, 0.9);
      loco.roll(x + 2.4);
      const span = Math.max(1, (SHOT_LEN_CIBATU - 1));
      steamUpdate(steam, localFrame, 3, 120, (birth) => chimney.copy(loco.chimney).add(v3(xAt(clamp01(birth / span)), 0, 0.9)), { rise: 0.3, drift: -0.01, grow: 0.04, opacity: 0.75 });
      // Low drifting steam right in front of the lens.
      fgSteam.forEach((s, i) => {
        const c = (((frame * 0.004 + i / fgSteam.length) % 1) + 1) % 1;
        s.position.set(-3 + c * 7, 0.9 + Math.sin(i * 2.1) * 0.5, 2.2 + (i % 3) * 0.4);
        s.scale.set(2.4, 1.4, 1);
        s.material.opacity = 0.28 * Math.sin(Math.PI * c);
      });
    },
  };
}
const SHOT_LEN_CIBATU = 270;

// ── Shot 6: inside the 3rd-class carriage ───────────────────────────────────

function buildCarriage(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const wood = '#7a5032';
  room(kit, g, { x0: -9, x1: 9, z0: -1.3, z1: 1.45, h: 2.5, floor: planksPaint('#5a3a24', 81), wall: '#8a5a38', wainscot: '#5a3a22', ceiling: '#c8b898', skipBack: true });
  // Back wall with a strip of window openings.
  const wall = kit.toon('#8a5a38');
  kit.box(g, [18, 1.08, 0.12], [0, 0.54, -1.36], wall, { ink: 10 });
  kit.box(g, [18, 0.6, 0.12], [0, 2.2, -1.36], wall, { ink: 10 });
  for (let x = -8.5; x <= 8.5; x += 1.4) kit.box(g, [0.24, 0.82, 0.14], [x, 1.49, -1.36], wall, { ink: 10 });
  // Longitudinal bench along the back wall.
  kit.box(g, [18, 0.06, 0.44], [0, SEAT_HEIGHT * 1.15 - 0.03, -1.05], kit.toon('#ffffff', { map: kit.canvas(512, 128, rottenPlanksPaint('#7a5032', 81), { repeat: [12, 1] }) }), { ink: 20 });
  kit.box(g, [18, SEAT_HEIGHT * 1.15 - 0.06, 0.06], [0, (SEAT_HEIGHT * 1.15 - 0.06) / 2, -0.86], shadeHex(wood, -0.2), { ink: 20 });
  kit.box(g, [18, 0.06, 0.1], [0, 0.95, -1.27], wood, { ink: 10 });
  // Luggage rack + straps.
  kit.box(g, [18, 0.03, 0.36], [0, 2.1, -1.1], '#4a3a2a', { ink: 10 });
  for (let x = -8; x <= 8; x += 1.2) kit.cyl(g, 0.01, 0.01, 0.3, [x, 2.32, 0.3], '#3a2a1a', { seg: 4, ink: false });
  // Hung from the luggage rack so the plate stays inside the frame while the camera tracks along the bench.
  for (const dx of [-0.2, 0.2]) kit.cyl(g, 0.004, 0.004, 0.1, [-0.7 + dx, 2.04, -0.915], PALETTE.ink, { seg: 4, ink: false, shadow: false });
  platePlane(kit, g, platePaint([{ t: 'KELAS III' }], { bg: '#efe3c4', fg: '#3a2412', rim: '#3a2412', family: ERA_FONT.colonial, spacing: 0.14, border: 'single', seed: 11 }), [0.46, 0.14], [-0.7, 1.97, -0.915]);
  const tick = clock(kit, g, [0.75, 2.2, -1.28], 0.12, 8, 25);
  // Moving mountainside outside (scrolling painted strip).
  const slope = kit.canvas(2048, 512, (c, w, h) => {
    sky({ stops: [[0, '#bcd0e0'], [0.5, '#e6e0d0'], [1, '#c8b8a0']], seed: 8 })(c, w, h);
    const r = mulberry32(83);
    c.fillStyle = '#6a8a5a';
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 32) c.lineTo(x, h * (0.35 + 0.12 * Math.sin(x * 0.004) + r() * 0.03));
    c.lineTo(w, h);
    c.fill();
    for (let i = 0; i < 160; i++) {
      c.fillStyle = i % 2 ? '#4f7040' : '#7a9a5a';
      c.beginPath();
      c.arc(r() * w, h * (0.5 + r() * 0.5), 10 + r() * 26, 0, Math.PI * 2);
      c.fill();
    }
  }, { repeat: [1, 1] });
  slope.wrapS = THREE.RepeatWrapping;
  kit.mesh(g, new THREE.PlaneGeometry(40, 10), kit.track(new THREE.MeshBasicMaterial({ map: slope, toneMapped: false, fog: false })), [0, 2.5, -6], { ink: false, shadow: false });
  const beams = [-5.6, -2.8, 0, 2.8, 5.6].map((x) => kit.shaft(g, [x + 0.6, 1.9, -1.4], [x - 0.3, 0.2, 0.4], 0.5, '#ffe6b0', 0.16));
  const motes = kit.motes(g, { from: [0, 1.9, -1.4], to: [-0.3, 0.2, 0.4], radius: 3, count: 200, color: '#fff0c8', seed: 84 });
  lightRig(kit, g, { sky: '#f0e4cc', ground: '#4a3424', hemi: 1.15, key: '#ffe0b0', keyIntensity: 1.8, keyPos: [3, 6, -8], keyTarget: [0, 0.6, 0], extent: 12 });
  return {
    id: 'carriage',
    group: g,
    anchors: { seat1: v3(-4.3, 0, -0.78), seat2: v3(-3.0, 0, -0.78), seat3: v3(-1.6, 0, -0.78), seat4: v3(-0.35, 0, -0.62), seat5: v3(1.4, 0, -0.78), seat6: v3(2.9, 0, -0.78) },
    background: new THREE.Color('#3a2a1e'),
    fog: new THREE.Fog('#6a5440', 10, 40),
    update: ({ frame }) => {
      slope.offset.x = frame * 0.0016;
      // Gentle rail sway.
      g.position.y = Math.sin(frame * 0.5) * 0.004;
      g.rotation.z = Math.sin(frame * 0.13) * 0.003;
      beams.forEach((b, i) => (b.material.opacity = 0.12 + 0.06 * Math.sin(frame * 0.07 + i)));
      motes(frame);
      tick(frame);
    },
  };
}

// ── Shot 7: Garut 1935 timetable → 1947 rail repair ─────────────────────────

function buildGarut1935(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#6e6250', { paint: speckle('#6e6250', ['#5a5040', '#80745e'], 91), repeat: 90 });
  platformSlab(kit, g, -14, 4.2, -4.4, -0.4, 0.45, cementPaint(92, '#b0a898'));
  railway(kit, g, { axis: 'x', from: -90, to: 90, at: 0.9 });
  facade(kit, g, { x0: -14, x1: 4, face: -4.6, h: 4.0, wall: '#eadcbe', roof: '#7a3a2a', depth: 6 });
  for (const x of [-10, -6.5, 1.5]) door(kit, g, x, -4.6, 1.2, 2.6, '#5a4028', 0.45);
  plateBacking(kit, g, [2.0, 0.42], [-4.5, 3.4, -4.54], '#1d2a4a');
  platePlane(kit, g, platePaint([{ t: 'GAROET' }], { bg: '#efe3c4', fg: '#1d2a4a', rim: '#1d2a4a', family: ERA_FONT.colonial, spacing: 0.2, rivets: true, seed: 12 }), [2.0, 0.42], [-4.5, 3.4, -4.54]);
  // Timetable board "DIENSTREGELING 1935": enamel plate on tall posts, raised clear of the official's head.
  // The "5x" badge is a separate tab hung beneath it on chains, so it covers no lettering and sits away from his hand.
  const BOARD: Vec3 = [-0.95, 3.0, -2.75];
  plateBacking(kit, g, [1.6, 1.1], BOARD, '#5a3a24');
  platePlane(kit, g, platePaint([{ t: 'DIENSTREGELING', k: 1 }, { t: '1935', k: 1.9, color: '#f6c453' }, { t: 'TJIBATOE – GAROET', k: 0.8 }, { t: 'SETIAP HARI', k: 0.7 }], { bg: '#1f2a24', fg: '#f2ead0', rim: '#c9b27a', family: ERA_FONT.colonial, spacing: 0.08, rivets: true, rule: true, seed: 13 }), [1.6, 1.1], BOARD, { glow: 0.35 });
  for (const sx of [-1, 1]) kit.cyl(g, 0.04, 0.05, BOARD[1] + 0.4, [BOARD[0] + sx * 0.72, (BOARD[1] + 0.4) / 2, BOARD[2] - 0.06], '#3a3430', { seg: 8 });
  const BADGE: Vec3 = [BOARD[0] - 0.3, 2.1, BOARD[2] - 0.02];
  for (const sx of [-1, 1]) kit.cyl(g, 0.005, 0.005, 0.2, [BADGE[0] + sx * 0.15, 2.36, BADGE[2]], PALETTE.ink, { seg: 4, ink: false, shadow: false });
  plateBacking(kit, g, [0.5, 0.36], BADGE, '#7a4a10');
  platePlane(kit, g, platePaint([{ t: '5x', k: 1.5 }, { t: 'SEHARI', k: 0.7 }], { bg: '#f6c453', fg: '#2a1a10', rim: '#7a4a10', family: ERA_FONT.colonial, spacing: 0.08, border: 'single', seed: 14 }), [0.5, 0.36], BADGE, { glow: 0.3 });
  // 1947 repair site further down the line.
  for (let i = 0; i < 6; i++) kit.box(g, [0.22, 0.12, 2.0], [10.6 + (i % 2) * 0.1, 0.06 + Math.floor(i / 2) * 0.12, -1.0 - (i % 2) * 0.05], '#5a3e28', { ink: 20, rot: [0, Math.PI / 2, 0] });
  kit.box(g, [0.22, 0.08, 2.0], [8.0, 0.25, 0.7], '#3b2a20', { ink: 20, rot: [0, 0.5, 0.15] });
  kit.box(g, [1.6, 0.08, 0.08], [7.6, 0.33, 1.6], '#7a5a40', { rot: [0, 0.3, 0.1] });
  for (let i = 0; i < 4; i++) kit.mesh(g, new THREE.DodecahedronGeometry(0.25, 0), kit.facet('#7a6a58'), [11.6 + i * 0.3, 0.12, 1.9 + (i % 2) * 0.3], { ink: 30 });
  // Repair-site board on a tall pole behind the workers, high enough that nobody stands in front of it.
  kit.cyl(g, 0.04, 0.05, 2.5, [9.35, 1.25, -1.0], '#5a4030', { seg: 6 });
  plateBacking(kit, g, [1.2, 0.46], [9.35, 2.5, -1.0], '#3a2a1c');
  platePlane(kit, g, platePaint([{ t: 'PERBAIKAN JALUR', k: 1 }, { t: '1947', k: 1.1, color: '#7a1f1f' }], { bg: '#efe3c4', fg: '#2a2a2a', rim: '#7a1f1f', family: ERA_FONT.industrial, spacing: 0.06, border: 'single', seed: 15 }), [1.2, 0.46], [9.35, 2.5, -1.0], { glow: 0.3 });
  grass(kit, g, { min: [4.5, 0, -12], max: [40, 0, -2], count: 700, size: 0.45, seed: 93, colors: ['#5a7a3a', '#6e8e48'] });
  const dust = kit.dust(g, [7.5, 0.1, -0.5], [10.5, 1.2, 1.2], 90, '#e8d8b0', 0.03, 94);
  mountains(kit, g, [{ x: 20, z: -80, r: 36, h: 26, color: '#5e7060' }, { x: -20, z: -90, r: 30, h: 20, color: '#64786a' }]);
  kit.backdrop(g, [400, 140], [0, 40, -120], sky({ stops: [[0, '#9ab0c8'], [0.55, '#e4dcc8'], [1, '#c0b090']], clouds: { color: 'rgba(255,255,255,0.6)', count: 18, y: 0.3 }, ridges: CIKURAY_RIDGES('#7a8a84', '#6a7a6c'), seed: 9 }), 4);
  lightRig(kit, g, { sky: '#e2e6ea', ground: '#5a5044', hemi: 1.35, key: '#fff0d0', keyIntensity: 2.2, keyPos: [10, 12, 9], keyTarget: [3, 0, -1], extent: 18 });
  return {
    id: 'garut1935',
    group: g,
    anchors: { petugas: v3(-0.25, 0.45, -1.9), pekerja1: v3(8.75, 0, 0.2), pekerja2: v3(9.95, 0, 0.05) },
    background: new THREE.Color('#c8c0b0'),
    fog: new THREE.Fog('#d8d0c0', 14, 110),
    update: ({ frame }) => dust(frame),
  };
}

// ── Shot 8: dim office, early 1980s ─────────────────────────────────────────

function buildOffice1980(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  room(kit, g, { x0: -3, x1: 3, z0: -2.6, z1: 3.4, h: 3.0, floor: speckle('#6a6a5e', ['#5a5a50', '#7a7a6c'], 101, 600), wall: '#9aa28a', wainscot: '#5a6450', ceiling: '#a8ac98', skipBack: true });
  // Back wall with a window opening to the yard.
  const wall = kit.toon('#9aa28a');
  kit.box(g, [6, 0.95, 0.2], [0, 0.475, -2.7], wall, { ink: 10 });
  kit.box(g, [6, 0.8, 0.2], [0, 2.6, -2.7], wall, { ink: 10 });
  kit.box(g, [3.6, 1.25, 0.2], [-1.2, 1.575, -2.7], wall, { ink: 10 });
  kit.box(g, [0.8, 1.25, 0.2], [2.6, 1.575, -2.7], wall, { ink: 10 });
  kit.box(g, [1.6, 0.06, 0.3], [1.4, 0.95, -2.62], '#5a4a3a', { ink: 10 });
  kit.box(g, [0.05, 1.25, 0.06], [1.4, 1.575, -2.62], '#5a4a3a', { ink: false });
  // Outside: yard and the old locomotive.
  groundPlane(kit, g, '#5a5446', { size: 300, y: -0.01, center: [0, 0, -40] });
  railway(kit, g, { axis: 'x', from: -40, to: 40, at: -7.6, rust: true });
  const loco = steamLoco(kit, g, '#3a3430', '#6a3a2a');
  loco.group.position.set(2.6, 0, -7.6);
  loco.group.rotation.y = 0.15;
  kit.backdrop(g, [200, 70], [0, 20, -60], sky({ stops: [[0, '#5a5a6a'], [0.6, '#9a9488'], [1, '#6a6458']], ridges: CIKURAY_RIDGES('#4a5048', '#3e443c'), seed: 10 }), 4);
  // Furniture.
  chair(kit, g, [0, 0, -1.2], SEAT_HEIGHT * 1.15, '#4a3a2a');
  table(kit, g, [-1.4, 0, -1.6], [1.0, 0.76, 0.6], '#5a4a36');
  for (let i = 0; i < 4; i++) kit.box(g, [0.3, 0.04, 0.22], [-1.5 + (i % 2) * 0.1, 0.78 + i * 0.04, -1.6], '#d8d0b8', { ink: 10 });
  plateBacking(kit, g, [1.2, 0.5], [-1.5, 2.1, -2.58], '#2a3a5a');
  platePlane(kit, g, platePaint([{ t: 'PJKA', k: 1.5 }, { t: 'PERUSAHAAN JAWATAN KERETA API', k: 0.6 }], { bg: '#e6dcc0', fg: '#2a3a5a', rim: '#2a3a5a', family: ERA_FONT.industrial, spacing: 0.1, border: 'single', rule: true, seed: 16 }), [1.2, 0.5], [-1.5, 2.1, -2.58]);
  // Wall chart with falling bars.
  const chart = kit.canvas(512, 384, (c, w, h) => {
    c.fillStyle = '#efe8d4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a2a2a';
    fitFont(c, 'PENUMPANG / BARANG', '700', ERA_FONT.industrial, 34, w - 48, 1);
    c.fillText('PENUMPANG / BARANG', 24, 44);
    c.letterSpacing = '0px';
    const vals = [0.9, 0.82, 0.7, 0.6, 0.46, 0.34, 0.22];
    vals.forEach((v, i) => {
      c.fillStyle = i < 4 ? '#5a7a9a' : '#b04a3a';
      c.fillRect(40 + i * 64, h - 30 - v * (h - 90), 44, v * (h - 90));
    });
  });
  kit.mesh(g, new THREE.PlaneGeometry(0.9, 0.68), kit.toon('#ffffff', { map: chart }), [-2.94, 1.75, -0.6], { rot: [0, Math.PI / 2, 0], ink: false, shadow: false });
  const tick = clock(kit, g, [0.3, 2.45, -2.58], 0.2, 16, 40);
  const flicker = kit.glow(g, '#e8f0d8', 1.0, [0, 2.9, -0.6], 0.5);
  kit.point(g, '#e4ecd4', 1.2, 7, [0, 2.8, -0.6]);
  kit.shaft(g, [1.4, 1.6, -2.7], [0.5, 0.2, -0.6], 0.7, '#d8dcc8', 0.12);
  lightRig(kit, g, { sky: '#a8b0a0', ground: '#3a3a32', hemi: 0.65, key: '#e0e4d4', keyIntensity: 1.2, keyPos: [3, 5, -9], keyTarget: [0, 0.6, -1], extent: 10 });
  return {
    id: 'office1980',
    group: g,
    anchors: { chair: v3(0, 0, -0.92) },
    background: new THREE.Color('#2a2c26'),
    fog: new THREE.Fog('#3a3c34', 14, 60),
    update: ({ frame }) => {
      tick(frame);
      flicker.material.opacity = 0.45 + (Math.sin(frame * 1.7) > 0.96 ? -0.2 : 0) + Math.sin(frame * 0.3) * 0.03;
    },
  };
}

// ── Shot 9: Garut 1982, overcast — the line closes ──────────────────────────

function buildGarut1982(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#5a5a50', { paint: speckle('#5a5a50', ['#4a4a42', '#6a6a5e'], 111), repeat: 120, size: 600 });
  // Long platform along z, track to the horizon.
  const slab = cementPaint(112, '#9a968c');
  const mat = kit.toon('#ffffff', { map: kit.canvas(512, 512, slab, { repeat: [3.5, 70] }) });
  kit.mesh(g, new THREE.BoxGeometry(7, 0.45, 140), mat, [-2.6, 0.225, -60], { ink: 20 });
  kit.box(g, [0.2, 0.03, 140], [0.8, 0.46, -60], '#d8d0b0', { ink: false, shadow: false });
  railway(kit, g, { axis: 'z', from: 12, to: -260, at: 1.95 });
  facade(kit, g, { x0: -12, x1: -6, face: -2, h: 3.8, wall: '#d8d0bc', roof: '#6a3a2a', depth: 14 });
  for (let z = 2; z >= -20; z -= 4) kit.cyl(g, 0.07, 0.08, 3.1, [-4.8, 0.45 + 1.55, z], '#3a3a3a', { seg: 10 });
  kit.box(g, [3, 0.1, 24], [-5, 3.6, -9], '#5a5048', { ink: 20 });
  // Pole + the "DITUTUP" sign, just hung and still swinging.
  kit.cyl(g, 0.05, 0.06, 1.9, [0.42, 0.45 + 0.95, -1.25], '#3a3a3a', { seg: 8 });
  kit.box(g, [0.5, 0.05, 0.05], [0.3, 0.45 + 1.78, -1.25], '#3a3a3a');
  const pivot = new THREE.Group();
  pivot.position.set(0.3, 0.45 + 1.75, -1.22);
  g.add(pivot);
  kit.cyl(pivot, 0.004, 0.004, 0.2, [-0.22, -0.1, 0], PALETTE.ink, { seg: 4, ink: false });
  kit.cyl(pivot, 0.004, 0.004, 0.2, [0.22, -0.1, 0], PALETTE.ink, { seg: 4, ink: false });
  const sign = new THREE.Group();
  sign.position.y = -0.36;
  pivot.add(sign);
  kit.box(sign, [0.66, 0.34, 0.04], [0, 0, -0.02], '#7a1a1a', { ink: 20 });
  platePlane(kit, sign, inkStampPaint('DITUTUP'), [0.6, 0.28], [0, 0, 0.005], { glow: 0.25 });
  // Departing train shrinking toward the horizon (front faces −z).
  const train = new THREE.Group();
  g.add(train);
  const loco = steamLoco(kit, train, '#2a2830', '#6a2a2a');
  loco.group.rotation.y = Math.PI / 2;
  const c1 = carriage(kit, train, '#4a3a30');
  c1.rotation.y = Math.PI / 2;
  c1.position.z = 7.2;
  const c2 = carriage(kit, train, '#3e342e');
  c2.rotation.y = Math.PI / 2;
  c2.position.z = 15.8;
  const smoke = puffs(kit, g, 40, '#8a8a8a');
  const zAt = (p: number): number => -9 - 170 * easeInCubic(clamp01(p * 1.05));
  grass(kit, g, { min: [3.4, 0, -80], max: [30, 0, 8], count: 900, size: 0.4, seed: 113, colors: ['#4a5a3a', '#5a6a48'] });
  // Telegraph line receding beside the track toward the horizon.
  telegraphLine(kit, g, { axis: 'z', from: -14, to: -230, at: 4.6, spacing: 14 });
  kit.backdrop(g, [500, 180], [0, 50, -230], sky({ stops: [[0, '#5a5e66'], [0.5, '#8a8c8e'], [0.8, '#a2a2a0'], [1, '#7a7a74']], clouds: { color: 'rgba(70,72,78,0.5)', count: 40, y: 0.25 }, ridges: CIKURAY_RIDGES('#6a6e6c', '#5e625e'), seed: 11 }), 5);
  lightRig(kit, g, { sky: '#b8bcc0', ground: '#4a4a44', hemi: 1.4, key: '#d8dce0', keyIntensity: 0.9, keyPos: [6, 14, 6], keyTarget: [0, 0, -2], extent: 14 });
  const chimney = new THREE.Vector3();
  return {
    id: 'garut1982',
    group: g,
    anchors: { petugas: v3(-0.25, 0.45, -1.2), diam1: v3(-1.3, 0.45, -2.2), diam2: v3(-1.75, 0.45, -1.5), diam3: v3(-0.85, 0.45, -3.0) },
    background: new THREE.Color('#8a8c8e'),
    fog: new THREE.Fog('#9a9c9c', 16, 170),
    update: ({ frame, localFrame, progress }) => {
      pivot.rotation.x = 0.16 * Math.exp(-progress * 5) * Math.sin(frame * 0.22);
      pivot.rotation.z = 0.05 * Math.exp(-progress * 4) * Math.sin(frame * 0.17 + 1);
      const z = zAt(progress);
      train.position.set(1.95, 0, z);
      loco.roll(-z);
      steamUpdate(smoke, localFrame, 4, 140, (birth) => chimney.set(1.95, 2.85, zAt(clamp01(birth / 299)) - 1.9), { rise: 0.3, drift: 0.01, grow: 0.05, opacity: 0.6 });
    },
  };
}

// ── Shots 10 & 11: Stasiun Cikajang today ───────────────────────────────────

function muralTexture(kit: WorldKit, seed: number): THREE.CanvasTexture {
  return kit.canvas(1024, 512, (c, w, h) => {
    const r = mulberry32(seed);
    const pal = ['#f2c230', '#e0533a', '#3d8ac8', '#5ab06a', '#c25aa8', '#f08a3a', '#2ab0b0'];
    c.fillStyle = pal[seed % pal.length] ?? '#f2c230';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = pal[Math.floor(r() * pal.length)] ?? '#fff';
      c.beginPath();
      c.arc(r() * w, r() * h, 60 + r() * 160, 0, Math.PI * 2);
      c.fill();
    }
    // Flowers, birds and a little train — friendly street-art motifs.
    for (let i = 0; i < 6; i++) {
      const x = r() * w;
      const y = h * (0.4 + r() * 0.5);
      c.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) {
        c.beginPath();
        c.ellipse(x + Math.cos(k) * 22, y + Math.sin(k) * 22, 16, 9, k, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#f2c230';
      c.beginPath();
      c.arc(x, y, 12, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#1b1b2b';
    c.lineWidth = 8;
    for (let i = 0; i < 4; i++) {
      const x = r() * w;
      const y = h * (0.1 + r() * 0.3);
      c.beginPath();
      c.moveTo(x - 30, y);
      c.quadraticCurveTo(x - 15, y - 20, x, y);
      c.quadraticCurveTo(x + 15, y - 20, x + 30, y);
      c.stroke();
    }
    if (seed % 2 === 0) {
      c.fillStyle = '#1b1b2b';
      c.fillRect(w * 0.2, h * 0.55, w * 0.5, h * 0.18);
      c.fillStyle = '#e0533a';
      c.fillRect(w * 0.22, h * 0.57, w * 0.46, h * 0.14);
      c.fillStyle = '#1b1b2b';
      for (let k = 0; k < 5; k++) {
        c.beginPath();
        c.arc(w * 0.26 + k * w * 0.095, h * 0.75, 18, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      c.font = '900 120px Arial, sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 14;
      c.strokeText('CIKAJANG', w / 2, h * 0.62);
      c.fillStyle = '#ffffff';
      c.fillText('CIKAJANG', w / 2, h * 0.62);
    }
    // Weathering.
    for (let i = 0; i < 80; i++) {
      c.fillStyle = `rgba(60,50,40,${r() * 0.12})`;
      c.fillRect(r() * w, r() * h, 20 + r() * 60, 4 + r() * 30);
    }
  });
}

function buildCikajangToday(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#5e7a3e', { paint: speckle('#5e7a3e', ['#4e6a30', '#72904a', '#6a5a3a'], 121), repeat: 120 });
  platformSlab(kit, g, -27, 27, -3.7, -0.5, 0.35, cementPaint(122, '#a8a296'));
  railway(kit, g, { axis: 'x', from: -90, to: 90, at: 0.9, rust: true });
  // ±50 m long building, colourful murals on the plaster.
  facade(kit, g, { x0: -25, x1: 25, face: -3.7, h: 4.0, wall: '#e2d6bc', roof: '#7a4030', depth: 7 });
  for (let i = 0; i < 10; i++) {
    const x = -22.5 + i * 5;
    if (Math.abs(x - 17.5) < 1.5) continue;
    kit.mesh(g, new THREE.PlaneGeometry(4.6, 2.8), kit.toon('#ffffff', { map: muralTexture(kit, 130 + i) }), [x, 2.0, -3.68], { ink: false, shadow: false });
  }
  door(kit, g, 0, -3.7, 1.6, 2.6, '#5a6a3a', 0.35);
  door(kit, g, -11, -3.7, 1.3, 2.5, '#6a4a2a', 0.35);
  door(kit, g, 19.4, -3.7, 1.2, 2.4, '#6a4a2a', 0.35);
  kit.box(g, [1.3, 0.06, 0.4], [19.4, 0.38, -3.5], '#8a8478', { ink: 10 });
  kit.label(g, ['STASIUN CIKAJANG', '+1246 M'], [2.8, 0.6], [0, 3.35, -3.66], { bg: '#f2ead6', fg: '#1d2a4a', font: '800 {size}px Georgia, serif', border: '#1d2a4a' });
  // Carved "Station Tjikadjang" on the plinth stone near the right end.
  const carve = kit.canvas(1024, 240, (c, w, h) => {
    c.fillStyle = '#b4a486';
    c.fillRect(0, 0, w, h);
    const r = mulberry32(7);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(70,60,45,${r() * 0.2})`;
      c.fillRect(r() * w, r() * h, 4, 4);
    }
    c.font = `italic 800 ${h * 0.56}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,248,230,0.55)';
    c.fillText('Station Tjikadjang', w / 2 + 3, h / 2 + 4);
    c.fillStyle = '#463826';
    c.fillText('Station Tjikadjang', w / 2, h / 2);
    c.fillStyle = 'rgba(60,90,40,0.55)';
    for (let i = 0; i < 18; i++) c.fillRect(r() * w, h * (0.8 + r() * 0.2), 30 + r() * 50, 12);
  });
  kit.box(g, [1.32, 0.38, 0.06], [17.4, 1.18, -3.7], '#7a6a52', { ink: 20 });
  kit.mesh(g, new THREE.PlaneGeometry(1.24, 0.3), kit.toon('#ffffff', { map: carve }), [17.4, 1.18, -3.665], { ink: false, shadow: false });
  // Wild grass everywhere: field, platform cracks, against the wall.
  const grassCols = ['#5a8a3a', '#72a048', '#4a7430', '#8aa850'];
  grass(kit, g, { min: [-40, 0, 2.3], max: [40, 0, 30], count: 2600, size: 0.55, seed: 123, colors: grassCols });
  grass(kit, g, { min: [-27, 0.35, -3.7], max: [27, 0.35, -2.9], count: 700, size: 0.42, seed: 124, colors: grassCols });
  grass(kit, g, { min: [-27, 0.35, -2.9], max: [27, 0.35, -0.6], count: 380, size: 0.3, seed: 125, colors: grassCols });
  grass(kit, g, { min: [-40, 0, -0.4], max: [40, 0, 2.2], count: 900, size: 0.4, seed: 126, colors: grassCols });
  // Creepers on the wall.
  for (let i = 0; i < 14; i++) {
    const x = -24 + i * 3.6;
    kit.mesh(g, new THREE.PlaneGeometry(0.8, 1.6), kit.track(new THREE.MeshToonMaterial({ map: grassTexture(kit, 140 + i, grassCols), gradientMap: kit.gradient, alphaTest: 0.5, side: THREE.DoubleSide })), [x, 1.15, -3.66], { ink: false, shadow: false });
  }
  peronBench(kit, g, [-6, 0.35, -3.25], 2.0);
  peronBench(kit, g, [7, 0.35, -3.25], 2.0);
  const butterflies = Array.from({ length: 5 }, (_, i) => ({ s: kit.glow(g, ['#ffffff', '#f2c230', '#f08a3a'][i % 3] ?? '#ffffff', 0.12, [0, 0, 0], 0.9), i }));
  mountains(kit, g, [{ x: -8, z: -85, r: 40, h: 34, color: '#4e7a5a' }, { x: 30, z: -95, r: 32, h: 24, color: '#4a7258' }]);
  kit.backdrop(g, [400, 140], [0, 40, -120], sky({ stops: [[0, '#4a8ad0'], [0.55, '#9cc8ec'], [0.8, '#d4e8f4'], [1, '#a8c8b0']], clouds: { color: 'rgba(255,255,255,0.9)', count: 26, y: 0.3 }, ridges: CIKURAY_RIDGES('#5a8a72', '#4e7e5e'), seed: 12 }), 3);
  lightRig(kit, g, { sky: '#c4dcff', ground: '#6a7a4a', hemi: 1.6, key: '#fff4e0', keyIntensity: 2.6, keyPos: [8, 14, 10], keyTarget: [5, 0, -2], extent: 26 });
  return {
    id: 'cikajangToday',
    group: g,
    anchors: { dindaCenter: v3(0, 0.35, -2.4), dindaTrace: v3(18.3, 0.35, -3.42), kucing: v3(19.42, 0.35, -3.52) },
    background: new THREE.Color('#9cc8ec'),
    fog: new THREE.Fog('#b8d4e4', 30, 140),
    update: ({ frame }) => {
      for (const b of butterflies) {
        const t = frame * 0.02 + b.i * 1.3;
        const baseX = b.i < 3 ? -2 + b.i * 2 : 16.5 + (b.i - 3) * 1.6;
        b.s.position.set(baseX + Math.sin(t) * 1.2, 0.8 + Math.abs(Math.sin(t * 3.1)) * 0.5, -2.2 + Math.cos(t * 0.7) * 0.8);
      }
    },
  };
}

// ── Shot 12: Garut 2022, the line lives again ───────────────────────────────

function modernTrain(kit: WorldKit, parent: THREE.Object3D): THREE.Group {
  const t = new THREE.Group();
  parent.add(t);
  const body = kit.toon('#e8ecf0');
  for (let k = 0; k < 3; k++) {
    const x = k * 10.2;
    kit.box(t, [10, 2.3, 1.6], [x, 1.95, 0], body, { ink: 20 });
    kit.box(t, [10, 0.18, 1.62], [x, 1.25, 0], '#2a5ab0', { ink: false });
    kit.box(t, [10, 0.08, 1.62], [x, 1.45, 0], '#f08a2a', { ink: false });
    for (let i = 0; i < 7; i++) kit.box(t, [0.9, 0.6, 1.64], [x - 4 + i * 1.33, 2.3, 0], kit.lit('#2a3a4a'), { ink: 10, shadow: false });
    for (const sx of [-3.6, 3.6]) for (const z of [-0.6, 0.6]) kit.cyl(t, 0.36, 0.36, 0.1, [x + sx, 0.62, z], '#2a2a30', { rot: [Math.PI / 2, 0, 0], seg: 18 });
  }
  // Rounded nose at −x (arriving toward −x).
  kit.mesh(t, new THREE.SphereGeometry(1.15, 18, 12, 0, Math.PI), body, [-5.0, 1.95, 0], { rot: [0, -Math.PI / 2, 0], ink: 30 }).scale.set(1, 1, 0.6);
  kit.box(t, [0.05, 0.7, 1.2], [-5.62, 2.3, 0], kit.lit('#2a3a4a'), { ink: false, shadow: false });
  kit.glow(t, '#ffffff', 0.7, [-5.68, 1.5, 0.45], 0.9);
  kit.glow(t, '#ffffff', 0.7, [-5.68, 1.5, -0.45], 0.9);
  return t;
}

function buildGarut2022(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#6a6a62', { paint: speckle('#6a6a62', ['#5a5a54', '#7a7a70'], 151), repeat: 90 });
  platformSlab(kit, g, -16, 20, -4.4, -0.45, 0.45, cementPaint(152, '#c8c4bc'), '#f2c230');
  kit.box(g, [36, 0.012, 0.3], [2, 0.457, -0.95], '#f2c230', { ink: false, shadow: false });
  railway(kit, g, { axis: 'x', from: -90, to: 120, at: 0.9 });
  facade(kit, g, { x0: -14, x1: 18, face: -4.6, h: 4.2, wall: '#f0ece4', roof: '#5a6a7a', depth: 6 });
  for (const x of [-9, -4, 6, 11]) windowPane(kit, g, [x, 2.0, -4.56], 1.6, 1.4, '#9ac8e8', '#3a4a5a');
  door(kit, g, 1, -4.6, 1.8, 2.6, '#3a4a5a', 0.45);
  kit.label(g, ['GARUT', '+717 M'], [2.4, 0.6], [1, 3.5, -4.54], { bg: '#ffffff', fg: '#1d3a7a', font: '800 {size}px Arial, sans-serif', border: '#1d3a7a' });
  // Steel canopy with translucent roof.
  for (let x = -12; x <= 18; x += 5) for (const z of [-1.0, -4.0]) kit.cyl(g, 0.08, 0.08, 3.4, [x, 0.45 + 1.7, z], '#4a5a6a', { seg: 10 });
  kit.box(g, [32, 0.06, 3.9], [3, 3.85, -2.5], kit.toon('#c8dce8', { transparent: true, opacity: 0.8 }), { ink: 20 });
  // Route map: Cibatu–Garut active, Garut–Cikajang planned.
  const map = kit.canvas(1024, 576, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d3a7a';
    c.fillRect(0, 0, w, 96);
    c.fillStyle = '#ffffff';
    c.font = '800 54px Arial, sans-serif';
    c.textAlign = 'center';
    c.fillText('PETA RUTE', w / 2, 66);
    const pts: [number, number, string][] = [[160, 260, 'CIBATU'], [520, 330, 'GARUT'], [860, 470, 'CIKAJANG']];
    c.lineCap = 'round';
    c.strokeStyle = '#d2302a';
    c.lineWidth = 22;
    c.beginPath();
    c.moveTo(160, 260);
    c.lineTo(520, 330);
    c.stroke();
    c.strokeStyle = '#9aa0a8';
    c.setLineDash([26, 22]);
    c.beginPath();
    c.moveTo(520, 330);
    c.lineTo(860, 470);
    c.stroke();
    c.setLineDash([]);
    for (const [x, y, n] of pts) {
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#1d3a7a';
      c.lineWidth = 10;
      c.beginPath();
      c.arc(x, y, 26, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#1d1d2a';
      c.font = '800 44px Arial, sans-serif';
      c.fillText(n, x, y - 46);
    }
    c.font = '700 30px Arial, sans-serif';
    c.fillStyle = '#d2302a';
    c.fillText('AKTIF 2022', 340, 380);
    c.fillStyle = '#6a7078';
    c.fillText('rencana reaktivasi', 700, 470);
  });
  const mapG = new THREE.Group();
  mapG.position.set(-1.55, 1.85, -2.5);
  mapG.rotation.y = 0.12;
  g.add(mapG);
  kit.box(mapG, [1.72, 1.0, 0.06], [0, 0, -0.035], '#3a4a5a', { ink: 20 });
  kit.mesh(mapG, new THREE.PlaneGeometry(1.6, 0.9), kit.toon('#ffffff', { map }), [0, 0, 0.0], { ink: false, shadow: false });
  for (const s of [-1, 1]) kit.cyl(g, 0.04, 0.04, 1.4, [-1.55 + s * 0.7, 0.45 + 0.7, -2.6], '#3a4a5a', { seg: 8 });
  const train = modernTrain(kit, g);
  const xAt = (p: number): number => lerp(40, 1.2, easeOutCubic(smoothstep(0.35, 0.95, p)));
  kit.backdrop(g, [400, 140], [0, 40, -120], sky({ stops: [[0, '#3a7ad0'], [0.55, '#8cc0ec'], [0.8, '#d0e6f4'], [1, '#a8c0b0']], clouds: { color: 'rgba(255,255,255,0.9)', count: 24, y: 0.3 }, ridges: CIKURAY_RIDGES('#5a8a72', '#4e7e5e'), seed: 13 }), 3);
  mountains(kit, g, [{ x: 30, z: -90, r: 38, h: 30, color: '#4e7a5a' }]);
  lightRig(kit, g, { sky: '#c4dcff', ground: '#6a6a5a', hemi: 1.6, key: '#fff6e6', keyIntensity: 2.5, keyPos: [10, 14, 10], keyTarget: [2, 0, -2], extent: 20 });
  return {
    id: 'garut2022',
    group: g,
    anchors: { dinda: v3(-0.55, 0.45, -1.7), p1: v3(1.55, 0.45, -2.65), p2: v3(2.45, 0.45, -2.25), p3: v3(-3.1, 0.45, -3.0) },
    background: new THREE.Color('#8cc0ec'),
    fog: new THREE.Fog('#c0d8e8', 30, 150),
    update: ({ progress }) => {
      train.position.set(xAt(progress), 0, 0.9);
    },
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

const BUILDERS: Record<WorldId, (kit: WorldKit, variant: string) => WorldScene> = {
  stationRear: buildStationRear,
  platformMist: buildPlatformMist,
  ladang: buildLadang,
  office1930: buildOffice1930,
  cibatu: buildCibatu,
  carriage: buildCarriage,
  garut1935: buildGarut1935,
  office1980: buildOffice1980,
  garut1982: buildGarut1982,
  cikajangToday: buildCikajangToday,
  garut2022: buildGarut2022,
};

/** `variant` is the shot id, so a set reused by two shots can differ (e.g. the glowing "?"). */
export function buildWorld(id: WorldId, kit: WorldKit, variant: string): WorldScene {
  const w = BUILDERS[id](kit, variant);
  w.group.name = `world-${id}-${variant}`;
  return w;
}

// ── Film pass: DoF + sepia / grey grade + grain ─────────────────────────────

const FILM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FILM_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float focus;
uniform float aperture;
uniform float maxBlur;
uniform float frame;
uniform float dip;
uniform float sepia;
uniform float grey;
uniform float tone;
uniform float flash;

float linearDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}
float coc(float z) {
  return clamp(abs(z - focus) / max(z, 0.001) * aperture, 0.0, 1.0) * maxBlur;
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  float zc = linearDepth(vUv);
  float c = coc(zc);
  vec3 acc = texture2D(tColor, vUv).rgb;
  float wsum = 1.0;
  const int N = 48;
  for (int i = 1; i <= N; i++) {
    float r = sqrt(float(i) / float(N));
    float th = float(i) * 2.39996323;
    vec2 off = vec2(cos(th), sin(th)) * r * c;
    vec2 uv = vUv + off / resolution;
    float zs = linearDepth(uv);
    float w = zs >= zc - 0.05 ? 1.0 : clamp(coc(zs) / max(r * c, 0.5), 0.0, 1.0);
    acc += texture2D(tColor, uv).rgb * w;
    wsum += w;
  }
  vec3 col = acc / wsum;

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Persis-style dual tone: indigo shadows, amber highlights (strength per shot).
  col = mix(col, col * vec3(0.72, 0.8, 1.35) + vec3(0.004, 0.006, 0.02), (1.0 - smoothstep(0.0, 0.3, l)) * tone);
  col += vec3(1.0, 0.72, 0.38) * smoothstep(0.45, 1.3, l) * (0.03 + tone * 0.1);
  // Archival sepia for the 1930s–1980s shots.
  vec3 sep = vec3(l) * vec3(1.12, 0.92, 0.66) + vec3(0.018, 0.01, 0.0);
  col = mix(col, sep, sepia);
  // Cold grey fade (1982 closure).
  col = mix(col, vec3(l) * vec3(0.9, 0.94, 1.0) * 0.92, grey);

  vec2 vq = (vUv - 0.5) * vec2(0.95, 1.15);
  // Soft vignette (strength 0.22).
  col *= 1.0 - 0.22 * smoothstep(0.3, 0.85, length(vq));
  col = mix(col, vec3(0.012, 0.01, 0.02), dip);
  // 6-frame white flash on era jumps.
  col = mix(col, vec3(1.0, 0.98, 0.94), flash);

  col = toSRGB(clamp(col, 0.0, 1.0));
  float grain = 0.035 + sepia * 0.03;
  col += (hash(gl_FragCoord.xy + mod(frame, 64.0) * 17.31) - 0.5) * grain;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface FilmParams {
  focusDistance: number;
  aperture: number;
  frame: number;
  dip: number;
  sepia: number;
  grey: number;
  tone: number;
  flash: number;
}

export class FilmPipeline {
  private target: THREE.WebGLRenderTarget;
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(width: number, height: number) {
    this.target = this.makeTarget(width, height);
    const material = new THREE.ShaderMaterial({
      vertexShader: FILM_VERTEX,
      fragmentShader: FILM_FRAGMENT,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        resolution: { value: new THREE.Vector2(width, height) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 200 },
        focus: { value: 5 },
        aperture: { value: 0.5 },
        maxBlur: { value: 18 },
        frame: { value: 0 },
        dip: { value: 0 },
        sepia: { value: 0 },
        grey: { value: 0 },
        tone: { value: 0.4 },
        flash: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
  }

  setSize(width: number, height: number): void {
    if (this.target.width === width && this.target.height === height) return;
    this.target.dispose();
    this.target.depthTexture?.dispose();
    this.target = this.makeTarget(width, height);
    const u = this.quad.material.uniforms;
    if (u.tColor) u.tColor.value = this.target.texture;
    if (u.tDepth) u.tDepth.value = this.target.depthTexture;
    u.resolution?.value.set(width, height);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, params: FilmParams): void {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const u = this.quad.material.uniforms;
    const set = (k: string, v: number): void => {
      const uniform = u[k];
      if (uniform) uniform.value = v;
    };
    set('cameraNear', camera.near);
    set('cameraFar', camera.far);
    set('focus', params.focusDistance);
    set('aperture', params.aperture);
    set('maxBlur', 6 + params.aperture * 20);
    set('frame', params.frame);
    set('dip', params.dip);
    set('sepia', params.sepia);
    set('grey', params.grey);
    set('tone', params.tone);
    set('flash', params.flash);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
