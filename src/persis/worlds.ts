import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { Vec3, WorldId } from './story';
import { clamp01, easeOutCubic, lerp, smoothstep } from './story';

/**
 * Three.js worlds for "Sejarah Persis: Dalilnya Mana?" plus the film pipeline
 * (depth-of-field, dual-tone grade, grain and dither). Every animated value is
 * a pure function of the frame so Remotion can render frames out of order.
 */

export const PALETTE = {
  ink: '#170c19',
  night: '#0f0d26',
  indigo: '#1b1840',
  navy: '#26306a',
  coolSky: '#4c56a8',
  coolGround: '#120c22',
  moon: '#8f9cff',
  amber: '#ffb24d',
  gold: '#f6c453',
  lampGlow: '#ffc979',
  windowLit: '#ffc56b',
  windowDark: '#1c2140',
  plaster: '#ece2cc',
  roofTile: '#8a3a2a',
  teak: '#8a4b26',
  teakDark: '#5a2f18',
  iron: '#2c2f3d',
  brass: '#c9a14a',
  brick: '#9a4a32',
} as const;

export interface WorldFrame {
  frame: number;
  localFrame: number;
  progress: number;
  fps: number;
}

export interface WorldScene {
  id: WorldId;
  group: THREE.Group;
  /** Named positions where cast billboards are planted (bottom-centre). */
  anchors: Record<string, THREE.Vector3>;
  background: THREE.Color;
  fog: THREE.Fog;
  update: (f: WorldFrame) => void;
}

// ── Shared toolkit ──────────────────────────────────────────────────────────

/** Seeded PRNG so procedural layouts are identical in every render tab. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
type MatLike = THREE.Material | string;

interface Disposable {
  dispose: () => void;
}

export class WorldKit {
  readonly gradient: THREE.DataTexture;
  readonly inkMaterial: LineMaterial;
  private readonly toonCache = new Map<string, THREE.MeshToonMaterial>();
  private readonly owned: Disposable[] = [];
  private glowTexture: THREE.CanvasTexture | null = null;
  private softTexture: THREE.CanvasTexture | null = null;

  constructor() {
    // Three-band ramp: lit / mid / cool core shadow.
    const data = new Uint8Array([64, 150, 255]);
    this.gradient = this.track(new THREE.DataTexture(data, 3, 1, THREE.RedFormat, THREE.UnsignedByteType));
    this.gradient.minFilter = THREE.NearestFilter;
    this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.generateMipmaps = false;
    this.gradient.needsUpdate = true;
    this.inkMaterial = this.track(new LineMaterial({ color: PALETTE.ink, linewidth: 2.4, worldUnits: false }));
  }

  track<T extends Disposable>(d: T): T {
    this.owned.push(d);
    return d;
  }

  toon(color: string, extra?: THREE.MeshToonMaterialParameters): THREE.MeshToonMaterial {
    if (!extra) {
      const hit = this.toonCache.get(color);
      if (hit) return hit;
    }
    const m = this.track(new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, ...extra }));
    if (!extra) this.toonCache.set(color, m);
    return m;
  }

  /** Faceted low-poly surface (sea, rocks, foliage); toon has no flat shading. */
  facet(color: string): THREE.MeshLambertMaterial {
    return this.track(new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }

  /** Unlit emissive-looking surface (windows, flames, labels). */
  lit(color: string, extra?: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
    return this.track(new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra }));
  }

  mat(m: MatLike): THREE.Material {
    return typeof m === 'string' ? this.toon(m) : m;
  }

  ink(mesh: THREE.Mesh, thresholdDeg = 30): void {
    const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdDeg);
    const geo = this.track(new LineSegmentsGeometry().fromEdgesGeometry(edges));
    edges.dispose();
    mesh.add(new LineSegments2(geo, this.inkMaterial));
  }

  mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: MatLike, pos: Vec3, opts: { rot?: Vec3; ink?: number | false; shadow?: boolean } = {}): THREE.Mesh {
    const mesh = new THREE.Mesh(this.track(geo), this.mat(m));
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (opts.rot) mesh.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    const shadow = opts.shadow ?? true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (opts.ink !== false) this.ink(mesh, opts.ink ?? 30);
    parent.add(mesh);
    return mesh;
  }

  box(parent: THREE.Object3D, size: Vec3, pos: Vec3, m: MatLike, opts: { rot?: Vec3; ink?: number | false; shadow?: boolean } = {}): THREE.Mesh {
    return this.mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), m, pos, opts);
  }

  cyl(parent: THREE.Object3D, rTop: number, rBottom: number, h: number, pos: Vec3, m: MatLike, opts: { rot?: Vec3; ink?: number | false; seg?: number; shadow?: boolean } = {}): THREE.Mesh {
    return this.mesh(parent, new THREE.CylinderGeometry(rTop, rBottom, h, opts.seg ?? 20), m, pos, { ink: 50, ...opts });
  }

  /** 4-sided hip roof (pyramid) sized w × d × h, base at `pos`. */
  hipRoof(parent: THREE.Object3D, w: number, d: number, h: number, pos: Vec3, m: MatLike): THREE.Mesh {
    const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.translate(0, 0.5, 0);
    const mesh = this.mesh(parent, geo, m, pos, { ink: 20 });
    mesh.scale.set(w, h, d);
    return mesh;
  }

  canvas(w: number, h: number, paint: Paint, opts: { repeat?: readonly [number, number]; color?: boolean } = {}): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas2D context unavailable');
    paint(ctx, w, h);
    const tex = this.track(new THREE.CanvasTexture(c));
    tex.colorSpace = opts.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (opts.repeat) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    return tex;
  }

  private radial(): THREE.CanvasTexture {
    if (!this.glowTexture) {
      this.glowTexture = this.canvas(128, 128, (ctx, w) => {
        const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, w);
      });
    }
    return this.glowTexture;
  }

  /** Lumpy soft puff for smoke, mist and spray. */
  private soft(): THREE.CanvasTexture {
    if (!this.softTexture) {
      this.softTexture = this.canvas(128, 128, (ctx, w) => {
        const rand = mulberry32(5);
        for (let i = 0; i < 9; i++) {
          const x = w * (0.3 + rand() * 0.4);
          const y = w * (0.3 + rand() * 0.4);
          const r = w * (0.18 + rand() * 0.16);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(255,255,255,0.55)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, w);
        }
      });
    }
    return this.softTexture;
  }

  glow(parent: THREE.Object3D, color: string, size: number, pos: Vec3, opacity = 0.85): THREE.Sprite {
    const s = new THREE.Sprite(
      this.track(new THREE.SpriteMaterial({ map: this.radial(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })),
    );
    s.position.set(pos[0], pos[1], pos[2]);
    s.scale.set(size, size, 1);
    parent.add(s);
    return s;
  }

  puff(parent: THREE.Object3D, color: string): THREE.Sprite {
    const s = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: this.soft(), color, transparent: true, opacity: 0, depthWrite: false })));
    parent.add(s);
    return s;
  }

  /** Text label painted on a plane (signs, map captions, book spines). */
  label(parent: THREE.Object3D, text: readonly string[], size: readonly [number, number], pos: Vec3, style: { bg: string; fg: string; font: string; border?: string }): THREE.Mesh {
    const pxW = 1024;
    const pxH = Math.round((pxW * size[1]) / size[0]);
    const tex = this.canvas(pxW, pxH, (ctx, w, h) => {
      ctx.fillStyle = style.bg;
      ctx.fillRect(0, 0, w, h);
      if (style.border) {
        ctx.strokeStyle = style.border;
        ctx.lineWidth = h * 0.06;
        ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
      }
      ctx.fillStyle = style.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lineH = h / (text.length + 0.6);
      text.forEach((line, i) => {
        ctx.font = style.font.replace('{size}', String(Math.round(lineH * (i === 0 ? 0.62 : 0.42))));
        ctx.fillText(line, w / 2, lineH * (i + 0.8));
      });
    });
    return this.mesh(parent, new THREE.PlaneGeometry(size[0], size[1]), this.toon('#ffffff', { map: tex }), pos, { ink: false, shadow: false });
  }

  /** Painted far backdrop, blurred to sit behind the depth-of-field. */
  backdrop(parent: THREE.Object3D, size: readonly [number, number], pos: Vec3, paint: Paint, blurPx = 2): THREE.Mesh {
    const w = 1536;
    const h = Math.round((w * size[1]) / size[0]);
    const tex = this.canvas(w, h, (ctx) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const s = c.getContext('2d');
      if (!s) throw new Error('Canvas2D context unavailable');
      paint(s, w, h);
      ctx.filter = `blur(${blurPx}px)`;
      ctx.drawImage(c, 0, 0);
      ctx.filter = 'none';
    });
    const m = this.track(new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false, depthWrite: true }));
    return this.mesh(parent, new THREE.PlaneGeometry(size[0], size[1]), m, pos, { ink: false, shadow: false });
  }

  /** Floating dust motes inside a box; returns the per-frame updater. */
  dust(parent: THREE.Object3D, min: Vec3, max: Vec3, count: number, color: string, size = 0.03, seed = 3): (frame: number) => void {
    const rand = mulberry32(seed);
    const base = new Float32Array(count * 3);
    const params = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = lerp(min[0], max[0], rand());
      base[i * 3 + 1] = rand();
      base[i * 3 + 2] = lerp(min[2], max[2], rand());
      params[i * 3] = 0.004 + rand() * 0.006;
      params[i * 3 + 1] = rand() * Math.PI * 2;
      params[i * 3 + 2] = 0.2 + rand() * 0.3;
    }
    const pos = new Float32Array(count * 3);
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = this.track(
      new THREE.PointsMaterial({ color, size, map: this.radial(), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    );
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    parent.add(points);
    const height = max[1] - min[1];
    return (frame: number) => {
      for (let i = 0; i < count; i++) {
        const sp = params[i * 3] ?? 0;
        const ph = params[i * 3 + 1] ?? 0;
        const amp = params[i * 3 + 2] ?? 0;
        const y0 = base[i * 3 + 1] ?? 0;
        const rise = (((y0 + frame * sp * 0.25) % 1) + 1) % 1;
        pos[i * 3] = (base[i * 3] ?? 0) + Math.sin(frame * sp + ph) * amp;
        pos[i * 3 + 1] = min[1] + rise * height;
        pos[i * 3 + 2] = (base[i * 3 + 2] ?? 0) + Math.cos(frame * sp * 0.8 + ph) * amp;
      }
      geo.attributes.position!.needsUpdate = true;
    };
  }

  /** Dual-tone base rig: cool hemisphere fill + warm shadow-casting key. */
  dualTone(parent: THREE.Object3D, opts: { hemi?: number; key: string; keyIntensity: number; keyPos: Vec3; keyTarget: Vec3; extent: number }): THREE.DirectionalLight {
    parent.add(new THREE.HemisphereLight(PALETTE.coolSky, PALETTE.coolGround, opts.hemi ?? 1.3));
    const key = new THREE.DirectionalLight(opts.key, opts.keyIntensity);
    key.position.set(...opts.keyPos);
    key.target.position.set(...opts.keyTarget);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    const c = key.shadow.camera;
    c.left = -opts.extent;
    c.right = opts.extent;
    c.top = opts.extent;
    c.bottom = -opts.extent;
    c.near = 0.5;
    c.far = 80;
    parent.add(key, key.target);
    return key;
  }

  point(parent: THREE.Object3D, color: string, intensity: number, distance: number, pos: Vec3): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, distance, 1.3);
    l.position.set(...pos);
    parent.add(l);
    return l;
  }

  spot(parent: THREE.Object3D, color: string, intensity: number, pos: Vec3, target: Vec3, angle: number, shadow = true): THREE.SpotLight {
    const l = new THREE.SpotLight(color, intensity, 30, angle, 0.6, 1.2);
    l.position.set(...pos);
    l.target.position.set(...target);
    l.castShadow = shadow;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.03;
    parent.add(l, l.target);
    return l;
  }

  dispose(): void {
    for (const d of this.owned) d.dispose();
    this.owned.length = 0;
    this.toonCache.clear();
  }
}

// ── Painting helpers ────────────────────────────────────────────────────────

function nightSky(ctx: CanvasRenderingContext2D, w: number, h: number, stops: readonly (readonly [number, string])[], stars: number, seed: number, starBand = 0.6): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rand = mulberry32(seed);
  for (let i = 0; i < stars; i++) {
    const r = 0.8 + rand() * rand() * 3;
    ctx.fillStyle = `rgba(255, ${232 + Math.floor(rand() * 23)}, 214, ${0.35 + rand() * 0.65})`;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h * starBand, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function moonDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4.5);
  halo.addColorStop(0, 'rgba(255, 240, 200, 0.5)');
  halo.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  ctx.fillStyle = '#fff3cf';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.45, y - r * 0.25, r * 0.86, 0, Math.PI * 2);
  ctx.fill('evenodd');
}

function ridge(ctx: CanvasRenderingContext2D, w: number, h: number, pts: readonly (readonly [number, number])[], color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (const [x, y] of pts) ctx.lineTo(x * w, y * h);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function mist(ctx: CanvasRenderingContext2D, w: number, h: number, y: number, band: number, color: string): void {
  const g = ctx.createLinearGradient(0, (y - band) * h, 0, (y + band) * h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, (y - band) * h, w, band * 2 * h);
}

function skylineLights(ctx: CanvasRenderingContext2D, w: number, h: number, baseY: number, seed: number, color: string, lit: number): void {
  const rand = mulberry32(seed);
  let x = -10;
  while (x < w) {
    const bw = 30 + rand() * 70;
    const bh = 30 + rand() * 140;
    ctx.fillStyle = color;
    ctx.fillRect(x, baseY * h - bh, bw, h - baseY * h + bh);
    for (let wy = baseY * h - bh + 10; wy < baseY * h + 30; wy += 16) {
      for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
        if (rand() < lit) {
          ctx.fillStyle = rand() < 0.8 ? 'rgba(255, 196, 100, 0.95)' : 'rgba(160, 205, 255, 0.85)';
          ctx.fillRect(wx, wy, 5, 7);
        }
      }
    }
    x += bw + 3;
  }
}

function planks(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number, vertical: boolean, count: number): void {
  const rand = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const step = (vertical ? w : h) / count;
  for (let i = 0; i < count; i++) {
    const shade = rand() * 0.18;
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,220,170' : '40,15,5'}, ${shade})`;
    if (vertical) ctx.fillRect(i * step, 0, step, h);
    else ctx.fillRect(0, i * step, w, step);
    ctx.strokeStyle = 'rgba(30, 12, 4, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, h);
    } else {
      ctx.moveTo(0, i * step);
      ctx.lineTo(w, i * step);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60, 25, 10, 0.18)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      const o = i * step + rand() * step;
      if (vertical) {
        ctx.moveTo(o, 0);
        for (let y = 0; y <= h; y += 24) ctx.lineTo(o + Math.sin(y * 0.03 + k) * 2, y);
      } else {
        ctx.moveTo(0, o);
        for (let x = 0; x <= w; x += 24) ctx.lineTo(x, o + Math.sin(x * 0.03 + k) * 2);
      }
      ctx.stroke();
    }
  }
}

function bricks(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const rand = mulberry32(seed);
  ctx.fillStyle = '#d8c8b0';
  ctx.fillRect(0, 0, w, h);
  const bh = h / 16;
  const bw = w / 8;
  for (let r = 0; r < 16; r++) {
    for (let c = -1; c < 9; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0);
      const v = rand();
      ctx.fillStyle = v < 0.2 ? '#7f3826' : v < 0.6 ? PALETTE.brick : '#a8573b';
      ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
}

function cobbles(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const rand = mulberry32(seed);
  ctx.fillStyle = '#16152a';
  ctx.fillRect(0, 0, w, h);
  const s = w / 12;
  for (let r = 0; r < 12; r++) {
    for (let c = -1; c < 13; c++) {
      const x = c * s + (r % 2 ? s / 2 : 0) + (rand() - 0.5) * 6;
      const y = r * s + (rand() - 0.5) * 6;
      const l = 38 + rand() * 26;
      ctx.fillStyle = `hsl(${238 + rand() * 20}, 16%, ${l}%)`;
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 4, s - 8, s - 8, s * 0.3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 230, 190, 0.12)';
      ctx.beginPath();
      ctx.ellipse(x + s * 0.4, y + s * 0.35, s * 0.18, s * 0.08, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── Geography (map + relief) ───────────────────────────────────────────────

type Poly = readonly (readonly [number, number])[];

function ellipsePoly(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 14): Poly {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

/** Simplified lon/lat outlines; RIS-era colours before they merge into NKRI. */
const ISLANDS: readonly { name: string; poly: Poly; color: string }[] = [
  { name: 'Sumatra', color: '#5b7fa6', poly: [[95.3, 5.6], [97.5, 5.2], [100.4, 2.2], [104.0, -1.0], [106.0, -3.2], [105.8, -5.8], [104.5, -5.9], [102.3, -4.0], [100.4, -1.0], [98.7, 1.7], [95.9, 3.5]] },
  { name: 'Jawa', color: '#b08a4f', poly: [[105.2, -6.8], [106.0, -6.0], [108.3, -6.3], [110.4, -6.9], [112.6, -6.9], [114.4, -7.7], [114.6, -8.6], [112.0, -8.3], [110.0, -8.1], [108.0, -7.8], [106.4, -7.4]] },
  { name: 'Kalimantan', color: '#5f9c8a', poly: [[109.0, 1.6], [109.6, -1.0], [110.4, -3.0], [114.4, -3.6], [116.5, -2.2], [117.6, 0.8], [118.9, 1.0], [117.8, 4.2], [115.6, 4.1], [113.0, 3.0], [111.0, 1.4]] },
  { name: 'Sulawesi', color: '#8f6fa8', poly: [[119.4, -5.5], [119.5, -3.5], [118.8, -2.6], [119.8, 0.1], [120.9, 1.3], [123.0, 0.9], [124.9, 1.5], [124.3, 0.4], [121.5, 0.5], [120.6, -1.0], [121.6, -1.2], [123.4, -0.9], [121.3, -1.9], [122.4, -3.2], [123.2, -4.6], [122.0, -4.6], [121.0, -2.8], [120.4, -3.0], [120.5, -5.6]] },
  { name: 'Papua', color: '#7a8f4a', poly: [[131.0, -1.3], [132.5, -0.4], [134.1, -0.9], [135.0, -3.3], [137.5, -1.5], [141.0, -2.6], [141.0, -9.1], [139.0, -8.1], [137.6, -8.4], [138.0, -6.0], [135.0, -4.4], [133.0, -4.0], [132.0, -2.9], [133.5, -2.4]] },
  { name: 'Bali', color: '#a3606a', poly: ellipsePoly(115.15, -8.4, 0.55, 0.25) },
  { name: 'Lombok', color: '#a3606a', poly: ellipsePoly(116.35, -8.6, 0.4, 0.3) },
  { name: 'Sumbawa', color: '#a3606a', poly: ellipsePoly(117.9, -8.6, 1.1, 0.3, 0.05) },
  { name: 'Flores', color: '#c07a50', poly: ellipsePoly(121.1, -8.6, 1.6, 0.28, 0.05) },
  { name: 'Sumba', color: '#c07a50', poly: ellipsePoly(120.0, -9.7, 0.8, 0.3, -0.1) },
  { name: 'Timor', color: '#c07a50', poly: ellipsePoly(125.0, -9.4, 1.6, 0.4, 0.45) },
  { name: 'Halmahera', color: '#6f86b8', poly: ellipsePoly(128.0, 0.8, 0.5, 1.1, 0.2) },
  { name: 'Seram', color: '#6f86b8', poly: ellipsePoly(129.5, -3.1, 1.3, 0.35) },
  { name: 'Buru', color: '#6f86b8', poly: ellipsePoly(126.6, -3.4, 0.6, 0.4) },
];

const JAVA = ISLANDS[1]?.poly ?? [];

function insidePoly(poly: Poly, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function distToPoly(poly: Poly, x: number, y: number): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy));
    d = Math.min(d, Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)));
  }
  return d;
}

// ── Shared props ────────────────────────────────────────────────────────────

function gasLamp(kit: WorldKit, parent: THREE.Object3D, x: number, z: number, side: 1 | -1): THREE.Sprite {
  const post = PALETTE.ink;
  kit.cyl(parent, 0.05, 0.08, 3.3, [x, 1.65, z], '#1f3a33', { seg: 10 });
  kit.box(parent, [0.46, 0.05, 0.05], [x - side * 0.2, 3.25, z], post, { ink: false });
  const lx = x - side * 0.4;
  kit.box(parent, [0.26, 0.36, 0.26], [lx, 3.0, z], kit.lit(PALETTE.lampGlow), { ink: 20 });
  kit.hipRoof(parent, 0.36, 0.36, 0.2, [lx, 3.18, z], '#1f3a33');
  // Wet-cobble reflection streak towards the camera.
  const streak = kit.track(
    new THREE.MeshBasicMaterial({
      map: kit.canvas(32, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,190,110,0)');
        g.addColorStop(0.3, 'rgba(255,190,110,0.55)');
        g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  kit.mesh(parent, new THREE.PlaneGeometry(0.5, 4.5), streak, [lx, 0.02, z + 2.2], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  return kit.glow(parent, PALETTE.lampGlow, 1.8, [lx, 3.0, z]);
}

function colonialHouse(kit: WorldKit, parent: THREE.Object3D, opts: { x: number; z: number; w: number; d: number; h: number; face: 1 | -1; rand: () => number; veranda: boolean }): void {
  const g = new THREE.Group();
  g.position.set(opts.x, 0, opts.z);
  g.rotation.y = (opts.face * Math.PI) / 2;
  parent.add(g);
  const { w, d, h } = opts;
  kit.box(g, [w, h, d], [0, h / 2, 0], PALETTE.plaster);
  kit.box(g, [w + 0.06, 0.4, d + 0.06], [0, 0.2, 0], '#5a5468', { ink: 20 });
  kit.box(g, [w + 0.4, 0.14, d + 0.4], [0, h + 0.07, 0], '#d9cdb4');
  kit.hipRoof(g, w + 0.8, d + 0.8, h * 0.62, [0, h + 0.14, 0], PALETTE.roofTile);
  const n = Math.max(2, Math.floor(w / 1.5));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    const lit = opts.rand() < 0.6;
    kit.box(g, [0.7, 1.4, 0.04], [x, h * 0.52, d / 2 + 0.02], kit.lit(lit ? PALETTE.windowLit : PALETTE.windowDark), { ink: 20, shadow: false });
    for (const s of [-1, 1] as const) kit.box(g, [0.34, 1.45, 0.05], [x + s * 0.55, h * 0.52, d / 2 + 0.04], '#2f5d50', { ink: 20 });
    kit.box(g, [0.86, 0.1, 0.12], [x, h * 0.52 + 0.78, d / 2 + 0.06], '#d9cdb4', { ink: 20 });
    if (lit) kit.glow(g, PALETTE.windowLit, 1.6, [x, h * 0.52, d / 2 + 0.3], 0.35);
  }
  if (opts.veranda) {
    kit.box(g, [w * 0.7, 0.1, 1.4], [0, h * 0.68, d / 2 + 0.7], '#d9cdb4');
    for (const s of [-1, 1] as const) kit.cyl(g, 0.09, 0.11, h * 0.68, [s * w * 0.3, h * 0.34, d / 2 + 1.3], PALETTE.plaster, { seg: 12 });
  }
}

function bookStack(kit: WorldKit, parent: THREE.Object3D, pos: Vec3, n: number, seed: number, pages = '#e7c66a'): void {
  const rand = mulberry32(seed);
  const covers = ['#7a2e24', '#2f4a3a', '#5a3b22', '#283a5a', '#6b4a2a'];
  let y = pos[1];
  for (let i = 0; i < n; i++) {
    const w = 0.3 + rand() * 0.1;
    const h = 0.05 + rand() * 0.04;
    const d = 0.22 + rand() * 0.06;
    const cover = kit.toon(covers[Math.floor(rand() * covers.length)] ?? '#5a3b22');
    const page = kit.toon(pages);
    const mesh = kit.box(parent, [w, h, d], [pos[0] + (rand() - 0.5) * 0.04, y + h / 2, pos[2] + (rand() - 0.5) * 0.04], cover, { rot: [0, (rand() - 0.5) * 0.4, 0], ink: 20 });
    mesh.material = [page, page, cover, cover, page, cover];
    y += h;
  }
}

function silhouetteCrowd(kit: WorldKit, parent: THREE.Object3D, spots: readonly Vec3[], seed: number): void {
  const rand = mulberry32(seed);
  const body = kit.toon('#232045');
  const cap = kit.toon('#120f1c');
  for (const [x, y, z] of spots) {
    const s = 0.9 + rand() * 0.2;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    parent.add(g);
    kit.mesh(g, new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), body, [0, 0.42, 0], { ink: false });
    kit.mesh(g, new THREE.SphereGeometry(0.17, 14, 10), body, [0, 0.9, 0], { ink: false });
    if (rand() < 0.7) kit.cyl(g, 0.14, 0.15, 0.1, [0, 1.03, 0], cap, { seg: 12, ink: false });
  }
}

// ── Shot 1: Bandung 1923 at night ──────────────────────────────────────────

function buildBandung1923(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const rand = mulberry32(1923);
  const cobble = kit.canvas(512, 512, (c, w, h) => cobbles(c, w, h, 11), { repeat: [6, 14] });
  const street = kit.track(new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.28, metalness: 0.05 }));
  kit.mesh(g, new THREE.PlaneGeometry(7.4, 70), street, [0, 0, -18], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  for (const s of [-1, 1] as const) {
    kit.box(g, [1.4, 0.16, 70], [s * 4.4, 0.08, -18], '#3b3756', { ink: 20 });
    kit.mesh(g, new THREE.PlaneGeometry(14, 70), '#1d2a24', [s * 13.5, 0.01, -18], { rot: [-Math.PI / 2, 0, 0], ink: false });
  }
  const houseZ = [3, -5, -13, -21, -29];
  houseZ.forEach((z, i) => {
    for (const s of [-1, 1] as const) {
      colonialHouse(kit, g, { x: s * 7.3, z, w: 6.2, d: 4.4, h: 3.4 + rand() * 0.8, face: s === -1 ? 1 : -1, rand, veranda: (i + (s > 0 ? 1 : 0)) % 2 === 0 });
    }
  });
  const glows: THREE.Sprite[] = [];
  [4, -4, -12, -20].forEach((z, i) => {
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    glows.push(gasLamp(kit, g, side * 4.05, z, side));
  });
  const lampLights = [kit.point(g, PALETTE.amber, 6, 11, [3.65, 3, -4]), kit.point(g, PALETTE.amber, 6, 11, [-3.65, 3, -12]), kit.point(g, PALETTE.amber, 5, 11, [3.65, 3, -20])];

  // Langgar panggung (wooden prayer house on stilts) with a tiered tajug roof.
  const lg = new THREE.Group();
  lg.position.set(0, 0, -26);
  g.add(lg);
  const wood = kit.toon('#7a4a2a');
  const woodDark = kit.toon(PALETTE.teakDark);
  for (const x of [-2, 0, 2]) for (const z of [-1.6, 0, 1.6]) kit.cyl(lg, 0.1, 0.12, 1.2, [x, 0.6, z], woodDark, { seg: 8 });
  kit.box(lg, [4.6, 0.16, 3.8], [0, 1.25, 0], woodDark);
  const plankTex = kit.canvas(512, 512, (c, w, h) => planks(c, w, h, '#86522d', 4, true, 10));
  const plank = kit.toon('#ffffff', { map: plankTex });
  kit.box(lg, [4.4, 2.4, 0.12], [0, 2.5, -1.8], plank);
  for (const s of [-1, 1] as const) kit.box(lg, [0.12, 2.4, 3.6], [s * 2.2, 2.5, 0], plank);
  // Front wall around the window hole (x ±0.95, y 1.9–2.95).
  kit.box(lg, [4.4, 0.6, 0.12], [0, 1.6, 1.8], plank);
  kit.box(lg, [4.4, 0.7, 0.12], [0, 3.3, 1.8], plank);
  for (const s of [-1, 1] as const) kit.box(lg, [1.25, 1.05, 0.12], [s * 1.575, 2.425, 1.8], plank);
  kit.box(lg, [2.1, 0.1, 0.24], [0, 1.88, 1.86], wood);
  kit.box(lg, [0.08, 1.05, 0.06], [0, 2.425, 1.8], woodDark, { shadow: false });
  for (const s of [-1, 1] as const) kit.box(lg, [0.5, 1.1, 0.05], [s * 1.25, 2.43, 2.0], '#3d5a46', { rot: [0, s * 0.5, 0] });
  kit.hipRoof(lg, 5.6, 4.8, 1.0, [0, 3.65, 0], '#4a2c22');
  kit.hipRoof(lg, 2.6, 2.2, 0.9, [0, 4.25, 0], '#4a2c22');
  kit.cyl(lg, 0.02, 0.09, 0.5, [0, 5.3, 0], PALETTE.brass, { seg: 8 });
  for (let i = 0; i < 4; i++) kit.box(lg, [1.2, 0.08, 0.32], [0, 0.3 * (i + 1) - 0.04, 2.2 + (3 - i) * 0.3], woodDark);
  const lantern = kit.point(lg, '#ffb35a', 5, 6, [0, 2.9, 0.6]);
  const lanternGlow = kit.glow(lg, PALETTE.lampGlow, 1.4, [0.7, 2.75, 0.9], 0.9);
  kit.glow(lg, PALETTE.windowLit, 3.2, [0, 2.4, 2.2], 0.25);

  kit.backdrop(g, [220, 80], [0, 22, -95], (c, w, h) => {
    nightSky(c, w, h, [[0, '#070922'], [0.45, '#1a1f5c'], [0.68, '#3c3a86'], [0.8, '#5a4a8a'], [1, '#1a1640']], 380, 3, 0.55);
    moonDisc(c, w * 0.72, h * 0.18, h * 0.035);
    // Tangkuban Parahu: the long "overturned boat" ridge.
    ridge(c, w, h, [[0, 0.74], [0.12, 0.64], [0.26, 0.52], [0.34, 0.45], [0.42, 0.43], [0.5, 0.44], [0.56, 0.425], [0.62, 0.5], [0.7, 0.58], [0.82, 0.64], [1, 0.7]], '#141640');
    mist(c, w, h, 0.66, 0.06, 'rgba(120, 120, 200, 0.35)');
    ridge(c, w, h, [[0, 0.78], [0.2, 0.74], [0.4, 0.77], [0.6, 0.73], [0.8, 0.76], [1, 0.74]], '#15163a');
  });

  kit.dualTone(g, { hemi: 1.1, key: PALETTE.moon, keyIntensity: 0.9, keyPos: [-12, 18, -30], keyTarget: [0, 0, -10], extent: 30 });
  const dust = kit.dust(g, [-4, 0.3, -26], [4, 5, 6], 380, '#ffd9a0', 0.05, 19);

  return {
    id: 'bandung1923',
    group: g,
    anchors: { windowLeft: new THREE.Vector3(-0.42, 1.55, -25.15), windowRight: new THREE.Vector3(0.42, 1.55, -25.15) },
    background: new THREE.Color('#0d0d2a'),
    fog: new THREE.Fog('#14143a', 18, 95),
    update: ({ frame }) => {
      const flick = 1 + Math.sin(frame * 0.7) * 0.05 + Math.sin(frame * 1.9 + 1) * 0.03;
      lampLights.forEach((l, i) => (l.intensity = (i === 2 ? 5 : 6) * (flick + i * 0.01)));
      glows.forEach((s, i) => (s.material.opacity = 0.8 + Math.sin(frame * 0.5 + i) * 0.05));
      lantern.intensity = 5 * (1 + Math.sin(frame * 0.9) * 0.08 + Math.sin(frame * 2.7) * 0.05);
      lanternGlow.material.opacity = 0.85 + Math.sin(frame * 0.9) * 0.08;
      dust(frame);
    },
  };
}

// ── Shot 2: inside the langgar — kitab kuning and the scale of dalil ─────────

function buildLanggar(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const floorTex = kit.canvas(512, 512, (c, w, h) => planks(c, w, h, '#6e3f22', 8, false, 8), { repeat: [3, 3] });
  kit.mesh(g, new THREE.PlaneGeometry(10, 8.6), kit.toon('#ffffff', { map: floorTex }), [0, 0, -0.3], { rot: [-Math.PI / 2, 0, 0], ink: false });
  const gedek = kit.canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#a9824f';
    c.fillRect(0, 0, w, h);
    const s = w / 16;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        c.fillStyle = (x + y) % 2 ? 'rgba(90, 55, 25, 0.14)' : 'rgba(255, 225, 170, 0.07)';
        c.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
  }, { repeat: [3, 1.2] });
  const wall = kit.toon('#ffffff', { map: gedek });
  // Back wall with a window hole (x 1.4–3.2, y 1.2–2.5).
  kit.box(g, [6.4, 3.6, 0.12], [-1.8, 1.8, -4.6], wall, { ink: false });
  kit.box(g, [1.8, 1.2, 0.12], [2.3, 0.6, -4.6], wall, { ink: false });
  kit.box(g, [1.8, 1.1, 0.12], [2.3, 3.05, -4.6], wall, { ink: false });
  kit.box(g, [1.8, 3.6, 0.12], [4.1, 1.8, -4.6], wall, { ink: false });
  for (const s of [-1, 1] as const) kit.box(g, [0.12, 3.6, 8.6], [s * 5, 1.8, -0.3], wall, { ink: false });
  for (const [x, z] of [[-4.7, -4.4], [4.7, -4.4], [-1.6, -4.4]] as const) kit.box(g, [0.24, 3.6, 0.24], [x, 1.8, z], PALETTE.teakDark, { ink: 20 });
  kit.box(g, [10, 0.24, 0.3], [0, 3.5, -4.4], PALETTE.teakDark, { ink: 20 });
  for (const [x, w] of [[2.3, 1.95]] as const) {
    kit.box(g, [w, 0.08, 0.3], [x, 1.18, -4.5], PALETTE.teak);
    kit.box(g, [w, 0.08, 0.2], [x, 2.52, -4.55], PALETTE.teak);
    for (const s of [-1, 1] as const) kit.box(g, [0.08, 1.4, 0.2], [x + s * 0.94, 1.85, -4.55], PALETTE.teak);
    kit.box(g, [0.05, 1.3, 0.05], [x, 1.85, -4.58], PALETTE.teakDark, { shadow: false });
  }
  kit.backdrop(g, [16, 9], [2.3, 2.2, -9], (c, w, h) => {
    nightSky(c, w, h, [[0, '#090b2a'], [0.6, '#232a6a'], [1, '#141433']], 180, 21, 0.6);
    moonDisc(c, w * 0.6, h * 0.24, h * 0.05);
    ridge(c, w, h, [[0, 0.72], [0.3, 0.62], [0.55, 0.6], [0.8, 0.66], [1, 0.7]], '#1a1b47');
    ridge(c, w, h, [[0, 0.82], [0.25, 0.78], [0.5, 0.8], [0.75, 0.76], [1, 0.8]], '#0f1030');
  }, 6);

  // Tikar (woven mat) and the low teak table.
  const tikar = kit.canvas(256, 256, (c, w, h) => {
    c.fillStyle = '#b38f55';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) {
      c.fillStyle = i % 4 === 0 ? 'rgba(120, 40, 30, 0.6)' : i % 2 ? 'rgba(80, 50, 20, 0.2)' : 'rgba(255, 230, 180, 0.15)';
      c.fillRect(0, i * 8, w, 8);
    }
  });
  kit.mesh(g, new THREE.PlaneGeometry(4.6, 3.2), kit.toon('#ffffff', { map: tikar }), [0, 0.006, -0.9], { rot: [-Math.PI / 2, 0, 0], ink: false });
  const teakTex = kit.canvas(512, 256, (c, w, h) => planks(c, w, h, PALETTE.teak, 12, false, 3));
  const teak = kit.toon('#ffffff', { map: teakTex });
  kit.box(g, [2.7, 0.08, 1.15], [0, 0.42, -0.62], teak);
  for (const x of [-1.2, 1.2]) for (const z of [-1.1, -0.15]) kit.box(g, [0.1, 0.38, 0.1], [x, 0.19, z], PALETTE.teakDark);

  bookStack(kit, g, [-1.0, 0.46, -0.5], 6, 31);
  bookStack(kit, g, [1.0, 0.46, -0.42], 4, 32);
  bookStack(kit, g, [-2.6, 0, -2.2], 10, 33);
  bookStack(kit, g, [-2.15, 0, -2.6], 7, 34);
  bookStack(kit, g, [2.8, 0, -2.4], 8, 35);
  // Open kitab with hand-written lines.
  const script = kit.canvas(512, 256, (c, w, h) => {
    c.fillStyle = '#efd99a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(40, 20, 10, 0.75)';
    c.lineWidth = 3;
    const rand = mulberry32(77);
    for (let page = 0; page < 2; page++)
      for (let l = 0; l < 9; l++) {
        const y = 30 + l * 24;
        c.beginPath();
        let x = page * (w / 2) + w / 2 - 24;
        c.moveTo(x, y);
        while (x > page * (w / 2) + 24) {
          x -= 6 + rand() * 10;
          c.quadraticCurveTo(x + 4, y - 6 - rand() * 8, x, y + (rand() - 0.5) * 3);
        }
        c.stroke();
      }
  });
  const pageMat = kit.toon('#ffffff', { map: script });
  const open = new THREE.Group();
  open.position.set(0.55, 0.47, -0.05);
  open.rotation.y = -0.35;
  g.add(open);
  kit.mesh(open, new THREE.PlaneGeometry(0.5, 0.32), pageMat, [0, 0.012, 0], { rot: [-Math.PI / 2 + 0.08, 0, 0], ink: 10 });

  // The scale (timbangan): Al-Qur'an & As-Sunnah weighed as one standard.
  const brass = kit.toon(PALETTE.brass);
  const scale = new THREE.Group();
  scale.position.set(-0.1, 0.46, -0.45);
  g.add(scale);
  kit.cyl(scale, 0.13, 0.17, 0.05, [0, 0.025, 0], brass, { seg: 24 });
  kit.cyl(scale, 0.02, 0.025, 0.66, [0, 0.36, 0], brass, { seg: 10 });
  kit.mesh(scale, new THREE.SphereGeometry(0.04, 12, 10), brass, [0, 0.71, 0], { ink: false });
  const beam = new THREE.Group();
  beam.position.set(0, 0.66, 0);
  scale.add(beam);
  kit.box(beam, [0.92, 0.03, 0.03], [0, 0, 0], brass, { ink: 20 });
  const pans: { group: THREE.Group; strings: THREE.Mesh[] }[] = [];
  const books: readonly [string, string][] = [
    ['#1f5a3c', "AL-QUR'AN"],
    ['#6b2a1e', 'AS-SUNNAH'],
  ];
  books.forEach(([cover, title]) => {
    const pan = new THREE.Group();
    scale.add(pan);
    kit.cyl(pan, 0.15, 0.11, 0.025, [0, 0, 0], brass, { seg: 24 });
    const book = kit.box(pan, [0.2, 0.06, 0.15], [0, 0.045, 0], cover, { ink: 20 });
    const gold = kit.toon(PALETTE.gold);
    book.material = [kit.toon('#e9cf8a'), kit.toon('#e9cf8a'), gold, kit.toon(cover), kit.toon('#e9cf8a'), kit.toon(cover)];
    kit.label(pan, [title], [0.34, 0.08], [0, -0.09, 0.16], { bg: '#f1e2b8', fg: '#3a2412', font: '800 {size}px Georgia, serif', border: '#8a6a2a' });
    const strings: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const s = kit.cyl(pan, 0.004, 0.004, 0.3, [Math.cos((k / 3) * Math.PI * 2) * 0.12, 0.15, Math.sin((k / 3) * Math.PI * 2) * 0.12], brass, { seg: 4, ink: false, shadow: false });
      s.rotation.z = Math.cos((k / 3) * Math.PI * 2) * -0.38;
      s.rotation.x = Math.sin((k / 3) * Math.PI * 2) * 0.38;
      strings.push(s);
    }
    pans.push({ group: pan, strings });
  });

  // Hanging oil lantern (lentera minyak) — the warm key.
  const lantern = new THREE.Group();
  lantern.position.set(-1.5, 2.25, -1.3);
  g.add(lantern);
  kit.cyl(lantern, 0.005, 0.005, 1.2, [0, 0.75, 0], PALETTE.ink, { seg: 4, ink: false });
  kit.hipRoof(lantern, 0.24, 0.24, 0.12, [0, 0.12, 0], PALETTE.brass);
  kit.cyl(lantern, 0.07, 0.09, 0.22, [0, 0, 0], kit.lit('#ffd28a', { transparent: true, opacity: 0.7 }), { seg: 16, ink: false, shadow: false });
  kit.cyl(lantern, 0.1, 0.12, 0.06, [0, -0.13, 0], PALETTE.brass, { seg: 16 });
  const flame = kit.glow(lantern, '#ffcf7a', 0.9, [0, 0, 0], 0.95);
  const lanternLight = kit.point(g, '#ffae52', 5, 9, [-1.5, 2.2, -1.3]);
  const key = kit.spot(g, '#ffbe6a', 9, [-1.4, 2.6, -0.8], [0.2, 0.4, -0.6], 0.9);
  const pelita = kit.point(g, '#ffb24d', 1.6, 3, [1.15, 0.65, -0.75]);
  kit.cyl(g, 0.05, 0.06, 0.08, [1.15, 0.5, -0.75], PALETTE.brass, { seg: 12 });
  const pelitaGlow = kit.glow(g, '#ffcf7a', 0.35, [1.15, 0.6, -0.75], 0.9);

  g.add(new THREE.HemisphereLight(PALETTE.coolSky, PALETTE.coolGround, 0.9));
  const moon = new THREE.DirectionalLight(PALETTE.moon, 0.7);
  moon.position.set(4, 4, -9);
  moon.target.position.set(0, 0.5, 0);
  g.add(moon, moon.target);
  const dust = kit.dust(g, [-2.5, 0.4, -3], [2.5, 3.2, 2.5], 260, '#ffd8a0', 0.022, 23);

  const pivot = new THREE.Vector3();
  return {
    id: 'langgar',
    group: g,
    anchors: { seatLeft: new THREE.Vector3(-0.72, -0.02, -1.5), seatRight: new THREE.Vector3(0.72, -0.02, -1.5) },
    background: new THREE.Color('#120d22'),
    fog: new THREE.Fog('#160f26', 7, 22),
    update: ({ frame, progress }) => {
      // Damped swing that settles level: both sources carry equal weight.
      const angle = 0.3 * Math.cos(progress * Math.PI * 2 * 3.2) * Math.exp(-progress * 5) + 0.02 * Math.sin(frame * 0.05) * (1 - smoothstep(0.5, 0.7, progress));
      beam.rotation.z = angle;
      pans.forEach((p, i) => {
        const side = i === 0 ? -1 : 1;
        pivot.set(side * 0.43 * Math.cos(angle), 0.66 + side * 0.43 * Math.sin(angle) - 0.3, 0);
        p.group.position.copy(pivot);
      });
      const flick = 1 + Math.sin(frame * 0.9) * 0.07 + Math.sin(frame * 2.3 + 1) * 0.05 + Math.sin(frame * 5.1) * 0.02;
      lanternLight.intensity = 5 * flick;
      key.intensity = 9 * flick;
      flame.material.opacity = 0.85 + (flick - 1) * 1.5;
      lantern.rotation.z = Math.sin(frame * 0.04) * 0.03;
      pelita.intensity = 1.6 * (1 + Math.sin(frame * 1.3 + 2) * 0.1);
      pelitaGlow.scale.setScalar(0.35 * (1 + Math.sin(frame * 1.7) * 0.08));
      dust(frame);
    },
  };
}

// ── Shot 3: A. Hassan's study → open debate podium ──────────────────────────

function buildHassanStudy(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const floorTex = kit.canvas(512, 512, (c, w, h) => planks(c, w, h, '#5a3420', 41, false, 8), { repeat: [5, 3] });
  kit.mesh(g, new THREE.PlaneGeometry(22, 12), kit.toon('#ffffff', { map: floorTex }), [0, 0, 1], { rot: [-Math.PI / 2, 0, 0], ink: false });
  const panelTex = kit.canvas(512, 512, (c, w, h) => planks(c, w, h, '#6a4028', 42, true, 6), { repeat: [6, 1] });
  kit.box(g, [22, 5, 0.2], [0, 2.5, -3.6], kit.toon('#ffffff', { map: panelTex }), { ink: false });
  kit.box(g, [22, 0.14, 0.26], [0, 1.1, -3.45], PALETTE.teakDark, { ink: 20 });

  // Study corner.
  const desk = new THREE.Group();
  desk.position.set(-4, 0, -1.4);
  g.add(desk);
  kit.box(desk, [1.6, 0.06, 0.8], [0, 0.75, 0], PALETTE.teak);
  for (const x of [-0.72, 0.72]) kit.box(desk, [0.12, 0.72, 0.7], [x, 0.36, 0], PALETTE.teakDark);
  const paperRand = mulberry32(51);
  for (let i = 0; i < 9; i++) kit.box(desk, [0.42, 0.012, 0.3], [-0.1 + (paperRand() - 0.5) * 0.04, 0.786 + i * 0.012, 0.12], '#f1e6cc', { rot: [0, (paperRand() - 0.5) * 0.2, 0], ink: i === 8 ? 10 : false });
  const writing = kit.canvas(256, 192, (c, w, h) => {
    c.fillStyle = '#f4ead2';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(30, 20, 60, 0.8)';
    c.lineWidth = 2;
    const r = mulberry32(52);
    for (let l = 0; l < 10; l++) {
      c.beginPath();
      let x = 18;
      c.moveTo(x, 16 + l * 17);
      while (x < w - 40 + r() * 20) {
        x += 5 + r() * 7;
        c.lineTo(x, 16 + l * 17 + (r() - 0.5) * 5);
      }
      c.stroke();
    }
  });
  kit.mesh(desk, new THREE.PlaneGeometry(0.4, 0.28), kit.toon('#ffffff', { map: writing }), [0.4, 0.784, 0.15], { rot: [-Math.PI / 2, 0, 0.12], ink: 10 });
  const pen = new THREE.Group();
  desk.add(pen);
  kit.cyl(pen, 0.009, 0.011, 0.16, [0, 0.08, 0], '#151018', { seg: 8, ink: false });
  kit.cyl(pen, 0.0, 0.009, 0.03, [0, -0.015, 0], PALETTE.gold, { seg: 8, ink: false });
  kit.box(desk, [0.07, 0.06, 0.07], [0.72, 0.81, -0.15], kit.lit('#1a1630'), { ink: 20 });
  kit.cyl(desk, 0.06, 0.08, 0.04, [-0.55, 0.8, -0.15], PALETTE.brass, { seg: 16 });
  kit.cyl(desk, 0.05, 0.07, 0.2, [-0.55, 0.92, -0.15], kit.lit('#ffd28a', { transparent: true, opacity: 0.65 }), { seg: 16, ink: false, shadow: false });
  const lampGlow = kit.glow(desk, '#ffcf7a', 0.8, [-0.55, 0.95, -0.15], 0.9);
  const deskLamp = kit.point(g, '#ffae52', 4, 6, [-4.55, 1.05, -1.4]);
  // Bookshelf.
  kit.box(g, [1.8, 2.4, 0.4], [-4.6, 1.2, -3.3], PALETTE.teakDark);
  for (let r = 0; r < 4; r++) {
    const rr = mulberry32(60 + r);
    let x = -5.4;
    while (x < -3.85) {
      const bw = 0.05 + rr() * 0.05;
      const bh = 0.32 + rr() * 0.12;
      kit.box(g, [bw, bh, 0.26], [x + bw / 2, 0.22 + r * 0.56 + bh / 2, -3.12], ['#6b2a1e', '#1f5a3c', '#5a3b22', '#2a3a6a', '#8a6a2a'][Math.floor(rr() * 5)] ?? '#5a3b22', { ink: false });
      x += bw + 0.008;
    }
  }

  // Debate stage.
  kit.box(g, [4.6, 0.5, 3.0], [4, 0.25, -1.9], PALETTE.teak);
  for (let i = 0; i < 3; i++) kit.box(g, [1.0, 0.16, 0.3], [2.3, 0.08 + i * 0.16, -0.25 - i * 0.3], PALETTE.teakDark);
  kit.box(g, [0.95, 0.9, 0.5], [4, 0.95, -0.85], PALETTE.teak);
  kit.box(g, [1.1, 0.06, 0.62], [4, 1.43, -0.88], PALETTE.teakDark, { rot: [0.12, 0, 0] });
  kit.label(g, ['PERSATOEAN ISLAM'], [0.8, 0.16], [4, 1.05, -0.59], { bg: '#5a2f18', fg: PALETTE.gold, font: '800 {size}px Georgia, serif' });
  kit.label(g, ['DEBAT TERBOEKA', 'Bandoeng'], [3.6, 0.95], [4, 3.2, -3.45], { bg: '#7a2c20', fg: '#f6e2b0', font: '800 {size}px Georgia, serif', border: '#f6c453' });
  const stageSpot = kit.spot(g, '#ffc06a', 14, [4, 5.2, 1.2], [4, 1.2, -1.2], 0.42);
  const cone = kit.mesh(
    g,
    new THREE.ConeGeometry(1.3, 5, 32, 1, true),
    kit.track(
      new THREE.MeshBasicMaterial({
        map: kit.canvas(8, 256, (c, w, h) => {
          const gr = c.createLinearGradient(0, 0, 0, h);
          gr.addColorStop(0, 'rgba(255, 200, 120, 0.0)');
          gr.addColorStop(0.5, 'rgba(255, 200, 120, 0.12)');
          gr.addColorStop(1, 'rgba(255, 200, 120, 0.22)');
          c.fillStyle = gr;
          c.fillRect(0, 0, w, h);
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    ),
    [4, 3.2, -0.6],
    { ink: false, shadow: false, rot: [0.33, 0, 0] },
  );
  cone.castShadow = false;
  const spots: Vec3[] = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) spots.push([2.3 + i * 0.6 + (r % 2) * 0.3, 0, 1.3 + r * 0.75]);
  silhouetteCrowd(kit, g, spots, 71);

  kit.dualTone(g, { hemi: 1.7, key: '#ffcf8a', keyIntensity: 0.9, keyPos: [-6, 7, 5], keyTarget: [0, 0, -1], extent: 9 });
  const dust = kit.dust(g, [-6, 0.4, -3], [6, 4, 3], 360, '#ffd8a0', 0.025, 29);

  return {
    id: 'hassanStudy',
    group: g,
    anchors: { desk: new THREE.Vector3(-4, 0.22, -2.0), podium: new THREE.Vector3(4, 0.98, -1.3) },
    background: new THREE.Color('#120d22'),
    fog: new THREE.Fog('#170f28', 9, 26),
    update: ({ frame, progress }) => {
      const w = frame * 0.25;
      pen.position.set(0.32 + Math.sin(w) * 0.05 + progress * 0.08, 0.9 + Math.abs(Math.sin(w * 2)) * 0.01, 0.12 + Math.cos(w * 0.7) * 0.03);
      pen.rotation.set(0.5, 0, -0.5);
      const flick = 1 + Math.sin(frame * 1.1) * 0.06 + Math.sin(frame * 2.9) * 0.04;
      deskLamp.intensity = 4 * flick;
      lampGlow.material.opacity = 0.8 * flick;
      stageSpot.intensity = 14 * smoothstep(0.35, 0.6, progress);
      (cone.material as THREE.MeshBasicMaterial).opacity = smoothstep(0.35, 0.6, progress);
      dust(frame);
    },
  };
}

// ── Shot 4: Pembela Islam printing room ─────────────────────────────────────

function gearGeometry(teeth: number, radius: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const inner = radius * 0.86;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.25) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a3 = ((i + 0.75) / teeth) * Math.PI * 2;
    const p = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
    if (i === 0) shape.moveTo(...p(inner, a0));
    shape.lineTo(...p(radius, a1));
    shape.lineTo(...p(radius, a2));
    shape.lineTo(...p(inner, a3));
    shape.lineTo(...p(inner, ((i + 1) / teeth) * Math.PI * 2));
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.18, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

function buildPressRoom(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  kit.mesh(g, new THREE.PlaneGeometry(14, 10), '#2a2638', [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], ink: false });
  const brickTex = kit.canvas(512, 512, (c, w, h) => bricks(c, w, h, 81), { repeat: [5, 2] });
  kit.box(g, [14, 5, 0.2], [0, 2.5, -3.6], kit.toon('#ffffff', { map: brickTex }), { ink: false });
  kit.box(g, [2.2, 1.4, 0.1], [-3.4, 3.2, -3.48], kit.lit('#2b3a7a'), { ink: 20, shadow: false });
  for (const s of [-1, 0, 1]) kit.box(g, [0.05, 1.4, 0.06], [-3.4 + s * 0.73, 3.2, -3.44], PALETTE.iron, { ink: false });

  // Platen letterpress.
  const press = new THREE.Group();
  press.position.set(0, 0, -1.1);
  g.add(press);
  const iron = kit.toon(PALETTE.iron);
  kit.box(press, [1.3, 0.2, 1.1], [0, 0.1, 0], iron);
  for (const s of [-1, 1] as const) kit.box(press, [0.12, 1.6, 1.0], [s * 0.45, 0.9, 0], iron);
  kit.box(press, [0.8, 0.9, 0.1], [0, 1.1, -0.3], '#3a3d4e');
  const platenPivot = new THREE.Group();
  platenPivot.position.set(0, 0.65, 0.25);
  press.add(platenPivot);
  kit.box(platenPivot, [0.78, 0.86, 0.08], [0, 0.45, 0], '#3a3d4e');
  kit.box(platenPivot, [0.6, 0.7, 0.01], [0, 0.45, -0.045], '#f1e6cc', { ink: false });
  const inkDisc = kit.cyl(press, 0.36, 0.36, 0.03, [0, 1.76, -0.36], '#141218', { seg: 32 });
  inkDisc.rotation.x = -0.35;
  const rollers = new THREE.Group();
  press.add(rollers);
  for (const dz of [0, 0.12]) kit.cyl(rollers, 0.045, 0.045, 0.82, [0, 0, dz], '#0e0d12', { rot: [0, 0, Math.PI / 2], seg: 12 });
  const fly = new THREE.Group();
  fly.position.set(0.68, 0.85, 0);
  press.add(fly);
  kit.mesh(fly, new THREE.TorusGeometry(0.62, 0.05, 10, 48), iron, [0, 0, 0], { rot: [0, Math.PI / 2, 0], ink: 60 });
  for (let i = 0; i < 6; i++) kit.box(fly, [0.04, 1.2, 0.05], [0, 0, 0], iron, { rot: [(i / 6) * Math.PI, 0, 0], ink: false });
  kit.cyl(fly, 0.08, 0.08, 0.12, [0, 0, 0], PALETTE.brass, { rot: [0, 0, Math.PI / 2], seg: 16 });
  const bigGear = kit.mesh(press, gearGeometry(24, 0.42, 0.06), PALETTE.brass, [-0.6, 0.75, 0.05], { ink: 40 });
  const smallGear = kit.mesh(press, gearGeometry(12, 0.22, 0.06), PALETTE.brass, [-0.6, 0.75 + 0.6, 0.05 + 0.12], { ink: 40 });
  const sheets: THREE.Mesh[] = [];
  for (let i = 0; i < 24; i++) sheets.push(kit.box(g, [0.5, 0.006, 0.36], [0.95, 0.83 + i * 0.006, 0.05], '#f1e6cc', { rot: [0, (mulberry32(i)() - 0.5) * 0.2, 0], ink: false }));
  kit.box(g, [0.7, 0.8, 0.6], [0.95, 0.4, 0.05], PALETTE.teakDark);

  // Pembela Islam magazines.
  const cover = kit.canvas(384, 512, (c, w, h) => {
    c.fillStyle = '#efe2c2';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#7a2c20';
    c.lineWidth = 10;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = '#7a2c20';
    c.fillRect(30, 40, w - 60, 120);
    c.fillStyle = '#f6e2b0';
    c.textAlign = 'center';
    c.font = '800 54px Georgia, serif';
    c.fillText('PEMBELA', w / 2, 96);
    c.fillText('ISLAM', w / 2, 146);
    c.fillStyle = '#2a1a10';
    c.font = 'italic 26px Georgia, serif';
    c.fillText('Diterbitkan oleh', w / 2, 220);
    c.font = '700 30px Georgia, serif';
    c.fillText('PERSATOEAN ISLAM', w / 2, 258);
    c.fillText('BANDOENG', w / 2, 296);
    c.font = '700 34px Georgia, serif';
    c.fillText('No. 1 · 1929', w / 2, 440);
    c.strokeStyle = '#2a1a10';
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(70, 330 + i * 20);
      c.lineTo(w - 70, 330 + i * 20);
      c.stroke();
    }
  });
  const coverMat = kit.toon('#ffffff', { map: cover });
  const edge = kit.toon('#e7dcc0');
  kit.box(g, [1.8, 0.06, 1.0], [-2.4, 0.8, 0.1], PALETTE.teak);
  for (const x of [-3.2, -1.6]) for (const z of [-0.3, 0.5]) kit.box(g, [0.08, 0.77, 0.08], [x, 0.385, z], PALETTE.teakDark);
  const rand = mulberry32(91);
  [[-2.9, 14], [-2.4, 9], [-1.9, 12]].forEach(([x, n]) => {
    for (let i = 0; i < (n ?? 0); i++) {
      const m = kit.box(g, [0.36, 0.014, 0.48], [(x ?? 0) + (rand() - 0.5) * 0.02, 0.837 + i * 0.014, 0.1 + (rand() - 0.5) * 0.02], coverMat, { rot: [0, (rand() - 0.5) * 0.1, 0], ink: i === (n ?? 0) - 1 ? 10 : false });
      m.material = [edge, edge, coverMat, edge, edge, edge];
    }
  });
  for (let i = 0; i < 3; i++) {
    const m = kit.box(g, [0.36, 0.01, 0.48], [-2.4 + i * 0.12, 0.98 + i * 0.012, 0.35], coverMat, { rot: [0, 0.4 - i * 0.35, 0], ink: 10 });
    m.material = [edge, edge, coverMat, edge, edge, edge];
  }

  // Relief map of Java (hand-built plaster model on a table).
  kit.box(g, [2.6, 0.06, 1.3], [2.6, 0.8, 0.15], PALETTE.teak);
  for (const x of [1.4, 3.8]) for (const z of [-0.4, 0.7]) kit.box(g, [0.08, 0.77, 0.08], [x, 0.385, z], PALETTE.teakDark);
  const [lon0, lon1, lat0, lat1] = [104.9, 114.9, -5.6, -9.0];
  const mapTex = kit.canvas(1024, 400, (c, w, h) => {
    c.fillStyle = '#9fb3c4';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(40, 60, 90, 0.25)';
    c.lineWidth = 2;
    for (let i = 1; i < 10; i++) {
      c.beginPath();
      c.moveTo((i / 10) * w, 0);
      c.lineTo((i / 10) * w, h);
      c.moveTo(0, (i / 10) * h);
      c.lineTo(w, (i / 10) * h);
      c.stroke();
    }
    const toPx = (lon: number, lat: number): [number, number] => [((lon - lon0) / (lon1 - lon0)) * w, ((lat - lat0) / (lat1 - lat0)) * h];
    c.beginPath();
    JAVA.forEach(([lon, lat], i) => (i === 0 ? c.moveTo(...toPx(lon, lat)) : c.lineTo(...toPx(lon, lat))));
    c.closePath();
    const land = c.createLinearGradient(0, 0, w, 0);
    land.addColorStop(0, '#b9b06a');
    land.addColorStop(1, '#c79a5a');
    c.fillStyle = land;
    c.fill();
    c.strokeStyle = '#3b2a1a';
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = '#7a2c20';
    c.font = '700 22px Georgia, serif';
    for (const [name, lon, lat] of [['BATAVIA', 106.8, -6.2], ['BANDOENG', 107.6, -6.9], ['SEMARANG', 110.4, -7.0], ['SOERABAJA', 112.7, -7.25]] as const) {
      const [x, y] = toPx(lon, lat);
      c.beginPath();
      c.arc(x, y, 7, 0, Math.PI * 2);
      c.fill();
      c.fillText(name, x + 10, y - 8);
    }
  });
  const relief = new THREE.PlaneGeometry(2.4, 1.1, 200, 90);
  relief.rotateX(-Math.PI / 2);
  const rp = relief.attributes.position!;
  const volcanoes: readonly [number, number, number][] = [[107.6, -6.77, 1], [106.98, -6.79, 0.9], [110.44, -7.54, 1.1], [112.92, -8.11, 1.2], [109.2, -7.24, 0.9], [111.4, -7.6, 0.8]];
  for (let i = 0; i < rp.count; i++) {
    const lon = lerp(lon0, lon1, rp.getX(i) / 2.4 + 0.5);
    const lat = lerp(lat0, lat1, rp.getZ(i) / 1.1 + 0.5);
    let y = 0;
    if (insidePoly(JAVA, lon, lat)) {
      y = smoothstep(0, 0.35, distToPoly(JAVA, lon, lat)) * 0.025;
      for (const [vl, vt, hgt] of volcanoes) y += Math.exp(-((lon - vl) ** 2 + (lat - vt) ** 2) / 0.05) * 0.09 * hgt;
    }
    rp.setY(i, y);
  }
  relief.computeVertexNormals();
  kit.mesh(g, relief, kit.toon('#ffffff', { map: mapTex }), [2.6, 0.84, 0.15], { ink: false });

  const bulbs = [kit.point(g, '#ffb35a', 7, 7, [0, 2.6, -0.6]), kit.point(g, '#ffb35a', 5, 6, [2.6, 2.3, 0.2])];
  for (const [x, z] of [[0, -0.6], [2.6, 0.2]] as const) {
    kit.cyl(g, 0.004, 0.004, 1.4, [x, 3.3, z], PALETTE.ink, { seg: 4, ink: false });
    kit.cyl(g, 0.3, 0.06, 0.18, [x, 2.55, z], '#2a3a2e', { seg: 20 });
    kit.glow(g, '#ffd08a', 0.9, [x, 2.42, z], 0.9);
  }
  const key = kit.spot(g, '#ffbd70', 14, [-0.4, 2.5, 0.4], [0, 0.9, -1.0], 0.85);
  g.add(new THREE.HemisphereLight(PALETTE.coolSky, PALETTE.coolGround, 1.0));
  const cool = new THREE.DirectionalLight('#7f8cff', 0.7);
  cool.position.set(-4, 4, -6);
  g.add(cool, cool.target);
  const dust = kit.dust(g, [-3.5, 0.5, -2.5], [3.5, 3, 2], 360, '#ffe0b0', 0.022, 37);

  return {
    id: 'pressRoom',
    group: g,
    anchors: { operator: new THREE.Vector3(-1.15, 0, -0.55) },
    background: new THREE.Color('#120d22'),
    fog: new THREE.Fog('#160f28', 8, 22),
    update: ({ frame, localFrame }) => {
      const cycle = (localFrame % 40) / 40;
      const a = frame * 0.16;
      fly.rotation.x = a;
      bigGear.rotation.x = a * 0.5;
      smallGear.rotation.x = -a + Math.PI / 12;
      inkDisc.rotation.y = frame * 0.05;
      platenPivot.rotation.x = -0.5 * (0.5 + 0.5 * Math.cos(cycle * Math.PI * 2));
      rollers.position.set(0, 1.1 + Math.cos(cycle * Math.PI * 2) * 0.45, -0.22);
      const printed = Math.floor(localFrame / 40);
      sheets.forEach((s, i) => (s.visible = i < 10 + printed));
      const flick = 1 + Math.sin(frame * 0.6) * 0.03;
      bulbs.forEach((b, i) => (b.intensity = (i === 0 ? 7 : 5) * flick));
      key.intensity = 14 * flick;
      dust(frame);
    },
  };
}

// ── Shot 5: Ende, Flores — exile cliff, breadfruit tree, letter over the sea ──

function rock(kit: WorldKit, parent: THREE.Object3D, pos: Vec3, scale: Vec3, seed: number, color: string): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const p = geo.attributes.position!;
  const rand = mulberry32(seed);
  const cache = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) {
      k = 0.8 + rand() * 0.35;
      cache.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = kit.mesh(parent, geo, kit.facet(color), pos, { ink: 35 });
  m.scale.set(...scale);
  return m;
}

function buildEndeCoast(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const seaGeo = new THREE.PlaneGeometry(170, 120, 150, 110);
  seaGeo.rotateX(-Math.PI / 2);
  const seaBase = Float32Array.from(seaGeo.attributes.position!.array as ArrayLike<number>);
  const sea = kit.mesh(g, seaGeo, kit.facet('#1d3a72'), [0, 0, -58], { ink: false, shadow: false });
  sea.receiveShadow = false;
  kit.mesh(
    g,
    new THREE.PlaneGeometry(5, 70),
    kit.track(
      new THREE.MeshBasicMaterial({
        map: kit.canvas(64, 512, (c, w, h) => {
          const moonRand = mulberry32(44);
          for (let i = 0; i < 140; i++) {
            const y = (i / 140) * h;
            c.fillStyle = `rgba(255, 236, 190, ${0.15 + 0.5 * (i / 140) ** 2})`;
            c.fillRect(w / 2 - (4 + (i / 140) * 26) * moonRand(), y, (8 + (i / 140) * 40) * (0.5 + 0.5 * Math.sin(i * 1.7)), 2);
          }
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    ),
    [9, 0.25, -60],
    { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false },
  );

  // Cliff and plateau.
  const stone = '#3b3657';
  rock(kit, g, [-1, 2, 0.5], [4.6, 2.4, 3.4], 1, stone);
  rock(kit, g, [-3.6, 1.8, -1.2], [3.2, 2.6, 2.6], 2, '#332f4d');
  rock(kit, g, [1.8, 1.4, -0.4], [2.4, 1.8, 2.2], 3, stone);
  rock(kit, g, [0.6, 0.6, -3.0], [1.6, 1.0, 1.2], 4, '#2b2844');
  rock(kit, g, [-2.4, 0.4, -3.6], [1.2, 0.8, 1.0], 5, '#2b2844');
  rock(kit, g, [3.2, 0.3, -2.6], [0.9, 0.6, 0.8], 6, '#2b2844');
  const plateau = new THREE.CylinderGeometry(4.6, 4.9, 0.5, 11, 1);
  const pp = plateau.attributes.position!;
  const pr = mulberry32(8);
  for (let i = 0; i < pp.count; i++) {
    const r = Math.hypot(pp.getX(i), pp.getZ(i));
    if (r > 1) {
      const k = 0.85 + pr() * 0.25;
      pp.setX(i, pp.getX(i) * k);
      pp.setZ(i, pp.getZ(i) * k);
    }
  }
  plateau.computeVertexNormals();
  kit.mesh(g, plateau, kit.facet('#2f4a3a'), [-0.9, 4.0, 0.9], { ink: 40 });
  const grassRand = mulberry32(9);
  for (let i = 0; i < 60; i++) {
    const a = grassRand() * Math.PI * 2;
    const r = grassRand() * 3.8;
    kit.mesh(g, new THREE.ConeGeometry(0.04, 0.25 + grassRand() * 0.2, 4), '#3c5e44', [-0.9 + Math.cos(a) * r, 4.35, 0.9 + Math.sin(a) * r], { ink: false });
  }

  // Pohon sukun (breadfruit tree).
  const tree = new THREE.Group();
  tree.position.set(-1.8, 4.2, 0.4);
  g.add(tree);
  const bark = kit.toon('#4a3326');
  const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, 1.2, 0), new THREE.Vector3(-0.05, 2.4, 0.1), new THREE.Vector3(0.1, 3.3, 0)]);
  kit.mesh(tree, new THREE.TubeGeometry(trunkCurve, 16, 0.18, 10, false), bark, [0, 0, 0], { ink: 50 });
  const leafTex = kit.canvas(256, 256, (c, w, h) => {
    // Deeply lobed breadfruit leaf.
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(w / 2, h * 0.98);
    const lobes = 4;
    for (const side of [-1, 1] as const) {
      for (let i = 0; i <= lobes; i++) {
        const t = i / lobes;
        const y = h * (0.85 - t * 0.8);
        const reach = w * 0.45 * Math.sin(Math.PI * (0.25 + t * 0.6));
        c.lineTo(w / 2 + side * reach, y - h * 0.06);
        c.lineTo(w / 2 + side * w * 0.07, y - h * 0.1);
      }
    }
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = '#356f43';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#a7d08a';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(w / 2, h);
    c.lineTo(w / 2, h * 0.05);
    c.stroke();
  });
  const leafMat = kit.toon('#ffffff', { map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const leafDepth = kit.track(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5 }));
  const leaves: THREE.Mesh[] = [];
  const lr = mulberry32(10);
  const branchTips: Vec3[] = [[1.4, 3.4, 0.4], [-1.3, 3.6, 0.2], [0.3, 4.2, -0.5], [0.6, 3.5, 1.2], [-0.6, 3.1, -1.1]];
  for (const tip of branchTips) {
    const branch = new THREE.CatmullRomCurve3([new THREE.Vector3(0.05, 2.6, 0.05), new THREE.Vector3(tip[0] * 0.5, tip[1] - 0.3, tip[2] * 0.5), new THREE.Vector3(...tip)]);
    kit.mesh(tree, new THREE.TubeGeometry(branch, 8, 0.06, 6, false), bark, [0, 0, 0], { ink: false });
    for (let i = 0; i < 26; i++) {
      const leaf = kit.mesh(tree, new THREE.PlaneGeometry(0.75, 0.85), leafMat, [tip[0] + (lr() - 0.5) * 1.5, tip[1] + (lr() - 0.5) * 0.9, tip[2] + (lr() - 0.5) * 1.5], {
        rot: [lr() * Math.PI, lr() * Math.PI, lr() * Math.PI],
        ink: false,
      });
      leaf.customDepthMaterial = leafDepth;
      leaves.push(leaf);
    }
    for (let i = 0; i < 3; i++) kit.mesh(tree, new THREE.SphereGeometry(0.1, 10, 8), '#9cbf4a', [tip[0] + (lr() - 0.5) * 0.6, tip[1] - 0.35, tip[2] + (lr() - 0.5) * 0.6], { ink: false });
  }
  const leafRest = leaves.map((l) => l.rotation.clone());

  // Storm lantern hanging from the tree: the warm key on Soekarno.
  kit.cyl(tree, 0.004, 0.004, 0.5, [1.0, 2.95, 0.35], PALETTE.ink, { seg: 4, ink: false });
  kit.cyl(tree, 0.06, 0.08, 0.18, [1.0, 2.62, 0.35], kit.lit('#ffd28a', { transparent: true, opacity: 0.75 }), { seg: 12, ink: false });
  const lanternGlow = kit.glow(tree, '#ffc677', 1.1, [1.0, 2.62, 0.35], 0.9);
  const lantern = kit.point(g, '#ffae52', 6, 8, [-0.8, 6.8, 0.75]);
  kit.spot(g, '#ffb766', 10, [-0.5, 7.2, 1.4], [-0.6, 4.4, -0.6], 0.7);

  kit.backdrop(g, [260, 90], [0, 20, -120], (c, w, h) => {
    nightSky(c, w, h, [[0, '#060820'], [0.5, '#162060'], [0.75, '#2f3c88'], [0.86, '#3d3a7a'], [1, '#121238']], 520, 41, 0.62);
    moonDisc(c, w * 0.57, h * 0.25, h * 0.045);
    // Gunung Meja's flat top and the island of Ende.
    ridge(c, w, h, [[0, 0.8], [0.06, 0.74], [0.12, 0.66], [0.2, 0.655], [0.26, 0.7], [0.34, 0.79], [1, 0.8]], '#1d2052');
    ridge(c, w, h, [[0.5, 0.81], [0.62, 0.76], [0.7, 0.765], [0.8, 0.81]], '#1a1c4a');
    for (let i = 0; i < 26; i++) {
      c.fillStyle = 'rgba(255, 200, 110, 0.85)';
      c.fillRect(w * 0.02 + i * w * 0.012, h * 0.795 + Math.sin(i) * 3, 4, 3);
    }
    mist(c, w, h, 0.8, 0.03, 'rgba(140, 150, 230, 0.35)');
  }, 2);

  // Waves breaking on the rocks.
  const sprays: { s: THREE.Sprite; x: number; z: number; phase: number }[] = [];
  const sr = mulberry32(12);
  for (let i = 0; i < 14; i++) sprays.push({ s: kit.puff(g, '#dfe6ff'), x: -4 + sr() * 8, z: -2.6 - sr() * 2.2, phase: sr() });

  // The glowing envelope crossing the sea towards Bandung.
  const envTex = kit.canvas(512, 320, (c, w, h) => {
    c.fillStyle = '#f6ead0';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#b89a6a';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w / 2, h * 0.55);
    c.lineTo(w, 0);
    c.stroke();
    c.fillStyle = '#b8332a';
    c.fillRect(w - 110, 26, 80, 96);
    c.fillStyle = '#3a2412';
    c.font = 'italic 34px Georgia, serif';
    c.textAlign = 'center';
    c.fillText('Kepada Toean A. Hassan', w / 2, h * 0.76);
    c.font = '700 30px Georgia, serif';
    c.fillText('BANDOENG', w / 2, h * 0.9);
  });
  const envelope = new THREE.Group();
  g.add(envelope);
  kit.box(envelope, [0.42, 0.26, 0.012], [0, 0, 0], kit.toon('#ffffff', { map: envTex, emissive: '#5a3a10', emissiveIntensity: 0.6 }), { ink: 20 });
  const envGlow = kit.glow(envelope, '#ffd27a', 0.75, [0, 0, 0], 0.6);
  const envLight = kit.point(g, '#ffc46a', 3, 5, [0, 0, 0]);
  const trail: THREE.Sprite[] = [];
  for (let i = 0; i < 36; i++) trail.push(kit.glow(g, '#ffd98a', 0.18, [0, 0, 0], 0));
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.15, 5.35, -0.45), new THREE.Vector3(0.5, 5.9, -2.6), new THREE.Vector3(2.2, 6.5, -9), new THREE.Vector3(4.3, 7.1, -22), new THREE.Vector3(6.2, 7.6, -42)]);

  g.add(new THREE.HemisphereLight('#5560b8', '#0c0a1e', 1.1));
  const moon = new THREE.DirectionalLight('#9fb0ff', 1.1);
  moon.position.set(12, 16, -30);
  moon.target.position.set(-1, 4, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 80 });
  g.add(moon, moon.target);
  const dust = kit.dust(g, [-4, 4.2, -3], [3, 7.5, 3], 220, '#ffe3b0', 0.03, 43);
  const tmp = new THREE.Vector3();

  return {
    id: 'endeCoast',
    group: g,
    anchors: { underTree: new THREE.Vector3(-0.6, 4.22, -0.55) },
    background: new THREE.Color('#0c0c26'),
    fog: new THREE.Fog('#141a46', 30, 140),
    update: ({ frame, progress }) => {
      const t = frame / 30;
      const pos = seaGeo.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const x = seaBase[i * 3] ?? 0;
        const z = seaBase[i * 3 + 2] ?? 0;
        pos.setY(i, Math.sin(x * 0.35 + t * 1.1) * 0.16 + Math.sin(z * 0.5 - t * 1.6) * 0.12 + Math.sin((x + z) * 0.9 + t * 2.3) * 0.05);
      }
      pos.needsUpdate = true;
      leaves.forEach((l, i) => {
        const r = leafRest[i];
        if (r) l.rotation.set(r.x + Math.sin(t * 1.4 + i) * 0.06, r.y, r.z + Math.sin(t * 1.1 + i * 0.7) * 0.05);
      });
      sprays.forEach(({ s, x, z, phase }) => {
        const c = (t / 2.6 + phase) % 1;
        const burst = c < 0.45 ? Math.sin((c / 0.45) * Math.PI) : 0;
        s.position.set(x, 0.3 + c * 1.4, z);
        s.scale.setScalar(0.6 + c * 2.2);
        s.material.opacity = burst * 0.75;
      });
      const flick = 1 + Math.sin(frame * 0.8) * 0.06 + Math.sin(frame * 2.1) * 0.04;
      lantern.intensity = 6 * flick;
      lanternGlow.material.opacity = 0.85 * flick;

      // Letter: rises from Soekarno's hand, then flies out over the sea.
      const appear = smoothstep(0.36, 0.42, progress);
      const u = smoothstep(0.42, 0.98, progress) * 0.98 + 0.01 * appear;
      envelope.visible = appear > 0.001;
      envelope.position.copy(path.getPoint(Math.min(1, u)));
      envelope.position.y += (1 - appear) * -0.3 + Math.sin(t * 3) * 0.04;
      envelope.rotation.set(Math.sin(t * 2.2) * 0.25, -0.5 + Math.sin(t * 1.3) * 0.3, Math.sin(t * 2.7) * 0.2);
      envelope.scale.setScalar(appear);
      envGlow.material.opacity = 0.6 * appear;
      envLight.position.copy(envelope.position);
      envLight.intensity = 3 * appear;
      trail.forEach((s, i) => {
        const back = u - (i + 1) * 0.006;
        s.visible = envelope.visible && back > 0;
        if (!s.visible) return;
        path.getPoint(Math.max(0, back), tmp);
        s.position.copy(tmp).add(new THREE.Vector3(Math.sin(i * 2.1 + t * 3) * 0.06, Math.cos(i * 1.7 + t * 2) * 0.06, 0));
        s.material.opacity = appear * (1 - i / trail.length) * 0.8;
      });
      dust(frame);
    },
  };
}

// ── Shot 6: Pesantren Persis 1936 and the locomotive to Bangil ──────────────

function buildPesantren(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  kit.mesh(g, new THREE.PlaneGeometry(60, 40), '#2f3a2c', [0, 0, -5], { rot: [-Math.PI / 2, 0, 0], ink: false });
  const brickTex = kit.canvas(512, 512, (c, w, h) => bricks(c, w, h, 61), { repeat: [7, 3] });
  const brick = kit.toon('#ffffff', { map: brickTex });
  const facade = new THREE.Group();
  facade.position.set(0, 0, -6.5);
  g.add(facade);
  kit.box(facade, [14, 5.6, 3], [0, 2.8, 0], brick);
  kit.box(facade, [14.4, 0.25, 3.3], [0, 2.85, 0], '#e6dcc6', { ink: 20 });
  kit.box(facade, [14.6, 0.3, 3.5], [0, 5.7, 0], '#e6dcc6', { ink: 20 });
  kit.hipRoof(facade, 15.2, 4.2, 2.1, [0, 5.85, 0], PALETTE.roofTile);
  const arch = (w: number, h: number): THREE.ShapeGeometry => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
    s.lineTo(w / 2, 0);
    s.closePath();
    return new THREE.ShapeGeometry(s, 16);
  };
  const lit = kit.lit(PALETTE.windowLit);
  const dark = kit.lit('#26244a');
  for (const floor of [0, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = -6 + i * 2.4 + (i >= 3 ? 0 : 0);
      if (floor === 0 && (i === 2 || i === 3)) continue;
      const win = kit.mesh(facade, arch(0.9, 1.6), (i + floor) % 3 === 0 ? dark : lit, [x, 0.9 + floor * 2.9, 1.52], { ink: 10, shadow: false });
      win.castShadow = false;
      kit.box(facade, [1.1, 0.12, 0.2], [x, 0.84 + floor * 2.9, 1.56], '#e6dcc6', { ink: 20 });
      if ((i + floor) % 3 !== 0) kit.glow(facade, PALETTE.windowLit, 1.8, [x, 1.6 + floor * 2.9, 1.8], 0.3);
    }
  }
  kit.mesh(facade, arch(1.8, 2.6), kit.lit('#ffb95a'), [0, 0, 1.52], { ink: 10, shadow: false });
  kit.label(facade, ['PESANTREN PERSATOEAN ISLAM', 'BANDOENG · 1936'], [4.2, 0.8], [0, 3.15, 1.56], { bg: '#efe3c4', fg: '#3a2412', font: '800 {size}px Georgia, serif', border: '#7a2c20' });
  for (const x of [-9.5, 9.5]) {
    kit.cyl(g, 0.12, 0.16, 2.2, [x, 1.1, -3], '#3a2a20', { seg: 8 });
    for (let k = 0; k < 4; k++) kit.mesh(g, new THREE.IcosahedronGeometry(1.1 - k * 0.15, 0), kit.facet('#2b4a33'), [x + (k % 2 ? 0.5 : -0.5), 2.6 + k * 0.5, -3 + (k % 3) * 0.3], { ink: 40 });
  }

  // Platform, signpost and the line to Bangil.
  kit.box(g, [10, 0.3, 1.8], [-3.5, 0.15, -1.9], '#6b6578');
  kit.cyl(g, 0.05, 0.05, 2, [-7, 1, -1.3], '#e6dcc6', { seg: 8 });
  kit.label(g, ['← BANGIL'], [1.3, 0.38], [-7, 1.8, -1.24], { bg: '#efe3c4', fg: '#1b1b2b', font: '800 {size}px Georgia, serif', border: '#1b1b2b' });
  kit.box(g, [60, 0.18, 2.2], [0, 0.09, 0.8], '#3a3448', { ink: false });
  for (let i = 0; i < 90; i++) kit.box(g, [0.22, 0.08, 2.0], [-27 + i * 0.6, 0.22, 0.8], '#3b2a20', { ink: false });
  for (const z of [0.2, 1.4]) kit.box(g, [60, 0.1, 0.08], [0, 0.31, z], '#9aa0b8', { ink: false });

  // Steam locomotive (front faces −x, heading for Bangil).
  const loco = new THREE.Group();
  g.add(loco);
  const black = kit.toon('#17151f');
  const red = kit.toon('#9b2c2c');
  kit.box(loco, [5.2, 0.3, 1.2], [0.4, 0.75, 0], black);
  kit.cyl(loco, 0.55, 0.55, 2.8, [-0.6, 1.5, 0], black, { rot: [0, 0, Math.PI / 2], seg: 24 });
  kit.cyl(loco, 0.6, 0.6, 0.5, [-2.15, 1.5, 0], '#24212e', { rot: [0, 0, Math.PI / 2], seg: 24 });
  kit.cyl(loco, 0.45, 0.45, 0.04, [-2.42, 1.5, 0], '#2f2b3a', { rot: [0, 0, Math.PI / 2], seg: 24 });
  for (const x of [-1.4, -0.4, 0.4]) kit.mesh(loco, new THREE.TorusGeometry(0.56, 0.025, 6, 32), PALETTE.brass, [x, 1.5, 0], { rot: [0, Math.PI / 2, 0], ink: false });
  kit.cyl(loco, 0.2, 0.15, 0.7, [-1.9, 2.3, 0], black, { seg: 16 });
  kit.cyl(loco, 0.18, 0.2, 0.35, [-0.4, 2.15, 0], PALETTE.brass, { seg: 16 });
  kit.box(loco, [1.4, 1.6, 1.4], [1.5, 1.85, 0], black);
  kit.box(loco, [1.7, 0.1, 1.6], [1.5, 2.7, 0], '#24212e');
  for (const s of [-1, 1] as const) kit.box(loco, [0.6, 0.5, 0.02], [1.5, 2.15, s * 0.71], kit.lit(PALETTE.windowLit), { ink: 10, shadow: false });
  kit.box(loco, [2.1, 1.2, 1.3], [3.3, 1.35, 0], black);
  kit.box(loco, [2.0, 0.3, 1.2], [3.3, 2.05, 0], '#0f0e14', { ink: false });
  kit.mesh(loco, new THREE.ConeGeometry(0.7, 0.6, 4), red, [-2.55, 0.55, 0], { rot: [0, Math.PI / 4, Math.PI / 2], ink: 20 });
  kit.box(loco, [0.22, 0.22, 0.22], [-2.35, 2.1, 0], kit.lit('#fff0c0'), { ink: 10 });
  kit.glow(loco, '#ffe7a8', 2.4, [-2.5, 2.1, 0], 0.9);
  const headlight = kit.spot(loco, '#ffe1a0', 18, [-2.45, 2.1, 0], [-8, 0.3, 0], 0.4, false);
  const wheels: THREE.Group[] = [];
  const wheelSpecs: readonly [number, number][] = [[-1.0, 0.45], [0.0, 0.45], [1.0, 0.45], [-1.9, 0.26], [2.8, 0.3], [3.8, 0.3]];
  for (const [x, r] of wheelSpecs) {
    for (const z of [-0.62, 0.62]) {
      const w = new THREE.Group();
      w.position.set(x, r + 0.32, z);
      loco.add(w);
      kit.cyl(w, r, r, 0.08, [0, 0, 0], red, { rot: [Math.PI / 2, 0, 0], seg: 24 });
      for (let k = 0; k < 4; k++) kit.box(w, [0.04, r * 1.9, 0.09], [0, 0, 0], '#5a1a1a', { rot: [0, 0, (k / 4) * Math.PI], ink: false });
      wheels.push(w);
    }
  }
  const rods: THREE.Mesh[] = [];
  for (const z of [-0.7, 0.7]) rods.push(kit.box(loco, [2.1, 0.06, 0.04], [0, 0.77, z], '#c9ccd8', { ink: false }));
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < 40; i++) puffs.push(kit.puff(g, '#c9c6dc'));

  kit.backdrop(g, [200, 70], [0, 14, -70], (c, w, h) => {
    nightSky(c, w, h, [[0, '#0b0d2c'], [0.45, '#25286a'], [0.7, '#6a3f6e'], [0.82, '#c0704e'], [0.9, '#f0a052'], [1, '#2a1e3a']], 160, 61, 0.4);
    ridge(c, w, h, [[0, 0.84], [0.2, 0.8], [0.4, 0.82], [0.6, 0.78], [0.8, 0.82], [1, 0.8]], '#2a2240');
    mist(c, w, h, 0.84, 0.03, 'rgba(255, 170, 110, 0.35)');
  }, 3);

  kit.dualTone(g, { hemi: 1.1, key: '#ffb26a', keyIntensity: 2.0, keyPos: [14, 6, 10], keyTarget: [0, 1, -3], extent: 16 });
  const dust = kit.dust(g, [-8, 0.3, -4], [8, 4, 4], 260, '#ffd9a8', 0.035, 63);
  const chimney = new THREE.Vector3();

  return {
    id: 'pesantren1936',
    group: g,
    anchors: { platform: new THREE.Vector3(-3.2, 0.3, -2.2) },
    background: new THREE.Color('#141234'),
    fog: new THREE.Fog('#2a2148', 22, 80),
    update: ({ frame, localFrame, progress }) => {
      const xAt = (p: number): number => lerp(15, -16, p);
      const x = xAt(progress);
      loco.position.set(x, 0, 0.8);
      const travelled = 15 - x;
      wheels.forEach((w, i) => {
        const spec = wheelSpecs[Math.floor(i / 2)];
        w.rotation.z = travelled / (spec?.[1] ?? 0.45);
      });
      const crank = travelled / 0.45;
      rods.forEach((r) => r.position.set(Math.cos(crank) * 0.18, 0.77 + Math.sin(crank) * 0.18, r.position.z));
      headlight.intensity = 18;
      // Puff i is emitted at local frame i*3 from where the chimney was then.
      puffs.forEach((s, i) => {
        const birth = i * 3;
        const age = localFrame - birth;
        s.visible = age >= 0 && age < 110;
        if (!s.visible) return;
        const bornAt = clamp01(birth / 137);
        chimney.set(xAt(bornAt) - 1.9, 2.75, 0.8);
        s.position.set(chimney.x + age * 0.03, chimney.y + Math.sqrt(age) * 0.32, chimney.z - age * 0.012);
        s.scale.setScalar(0.5 + age * 0.035);
        s.material.opacity = 0.8 * (1 - age / 110) * smoothstep(0, 4, age);
      });
      dust(frame);
    },
  };
}

// ── Shot 7: Parliament 1950 — Mosi Integral, RIS merges into NKRI ───────────

function buildParliament(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const marble = kit.canvas(512, 512, (c, w) => {
    const s = w / 8;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        c.fillStyle = (x + y) % 2 ? '#d9cfbb' : '#3a3550';
        c.fillRect(x * s, y * s, s, s);
      }
  }, { repeat: [8, 8] });
  const floor = kit.track(new THREE.MeshStandardMaterial({ map: marble, roughness: 0.35 }));
  kit.mesh(g, new THREE.PlaneGeometry(24, 24), floor, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], ink: false });
  kit.box(g, [24, 9, 0.3], [0, 4.5, -8.6], '#e3d6bc', { ink: false });
  for (const x of [-9, -3.6, 3.6, 9]) kit.box(g, [0.7, 9, 0.4], [x, 4.5, -8.35], '#efe4cc', { ink: 20 });
  kit.box(g, [24, 0.5, 0.6], [0, 8.6, -8.2], '#d2c4a6', { ink: 20 });
  const flute = kit.canvas(256, 64, (c, w, h) => {
    c.fillStyle = '#efe6d2';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      c.fillStyle = 'rgba(120, 100, 80, 0.25)';
      c.fillRect((i / 16) * w + 4, 0, 5, h);
    }
  }, { repeat: [1, 1] });
  const col = kit.toon('#ffffff', { map: flute });
  for (const s of [-1, 1] as const)
    for (const z of [-5.5, -1.5, 2.5]) {
      for (const x of [4.6, 7.2]) {
        kit.cyl(g, 0.36, 0.4, 8, [s * x, 4, z], col, { seg: 24, ink: 60 });
        kit.box(g, [1.0, 0.3, 1.0], [s * x, 0.15, z], '#d2c4a6');
        kit.box(g, [1.0, 0.35, 1.0], [s * x, 8.1, z], '#d2c4a6');
      }
    }
  // Dais, lectern and microphone.
  kit.box(g, [4.4, 0.6, 2.4], [0, 0.3, -3.4], PALETTE.teakDark);
  kit.box(g, [1.0, 1.15, 0.55], [0, 1.18, -2.95], PALETTE.teak);
  kit.box(g, [1.15, 0.06, 0.7], [0, 1.78, -2.98], PALETTE.teakDark, { rot: [0.15, 0, 0] });
  kit.cyl(g, 0.012, 0.012, 0.35, [0.25, 1.95, -2.85], '#1a1a22', { seg: 6, ink: false });
  kit.mesh(g, new THREE.CapsuleGeometry(0.04, 0.08, 4, 8), '#c9ccd8', [0.25, 2.14, -2.85], { ink: false });
  for (const s of [-1, 1] as const) {
    kit.cyl(g, 0.03, 0.03, 3.6, [s * 2.6, 1.8, -4.2], PALETTE.brass, { seg: 8 });
    const flag = kit.mesh(g, new THREE.PlaneGeometry(1.2, 0.8, 12, 1), kit.track(new THREE.MeshToonMaterial({ gradientMap: kit.gradient, side: THREE.DoubleSide, map: kit.canvas(64, 64, (c, w, h) => {
      c.fillStyle = '#d22630';
      c.fillRect(0, 0, w, h / 2);
      c.fillStyle = '#f6f2ea';
      c.fillRect(0, h / 2, w, h / 2);
    }) })), [s * 2.6 + s * 0.6, 3.15, -4.2], { ink: false });
    flag.userData.side = s;
  }
  // Curved desks with members.
  const crowd: Vec3[] = [];
  for (const [r, n] of [[4.2, 7], [5.6, 9], [7.0, 11]] as const) {
    for (let i = 0; i < n; i++) {
      const a = lerp(-0.85, 0.85, i / (n - 1));
      const x = Math.sin(a) * r;
      const z = -3 + Math.cos(a) * r;
      if (Math.abs(x) < 1.0 && r < 6) continue;
      kit.box(g, [0.9, 0.75, 0.45], [x, 0.375, z - 0.35 * Math.cos(a)], PALETTE.teakDark, { rot: [0, a, 0], ink: 20 });
      crowd.push([x + Math.sin(a) * 0.3, 0, z + Math.cos(a) * 0.3]);
    }
  }
  silhouetteCrowd(kit, g, crowd, 77);

  // The map of Indonesia on the back wall.
  const map = new THREE.Group();
  map.position.set(0, 4.7, -8.35);
  g.add(map);
  kit.box(map, [5.9, 2.6, 0.08], [0, 0, 0], '#1a2550', { ink: false });
  kit.box(map, [6.1, 2.8, 0.04], [0, 0, -0.03], PALETTE.gold, { ink: false });
  const center = new THREE.Vector2(118, -2.5);
  const k = 0.118;
  const pieces = ISLANDS.map((isl, i) => {
    const shape = new THREE.Shape(isl.poly.map(([lon, lat]) => new THREE.Vector2((lon - center.x) * k, (lat - center.y) * k)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    const mat = kit.toon(isl.color, {});
    const mesh = kit.mesh(map, geo, mat, [0, 0, 0.06], { ink: 40 });
    const c = isl.poly.reduce((acc, [lon, lat]) => acc.add(new THREE.Vector2(lon, lat)), new THREE.Vector2()).multiplyScalar(1 / isl.poly.length);
    const dir = new THREE.Vector2(c.x - center.x, c.y - center.y).normalize();
    const r = mulberry32(100 + i);
    return { mesh, mat, from: new THREE.Color(isl.color), scatter: new THREE.Vector3(dir.x * (0.3 + r() * 0.25), dir.y * (0.22 + r() * 0.2), 0.12 + r() * 0.18), spin: (r() - 0.5) * 0.4 };
  });
  const unified = new THREE.Color('#d3323d');
  const risLabel = kit.label(map, ['REPUBLIK INDONESIA SERIKAT · 1949'], [3.6, 0.28], [0, 1.08, 0.07], { bg: '#1a2550', fg: '#cfd6ff', font: '700 {size}px Georgia, serif' });
  const nkriLabel = kit.label(map, ['NEGARA KESATUAN REPUBLIK INDONESIA'], [4.4, 0.32], [0, -1.08, 0.07], { bg: '#1a2550', fg: PALETTE.gold, font: '800 {size}px Georgia, serif' });
  const moseLabel = kit.label(g, ['MOSI INTEGRAL', '3 April 1950'], [2.6, 0.9], [0, 6.75, -8.4], { bg: '#7a2c20', fg: '#f6e2b0', font: '800 {size}px Georgia, serif', border: PALETTE.gold });
  for (const l of [risLabel, nkriLabel, moseLabel]) (l.material as THREE.MeshToonMaterial).transparent = true;
  const mapGlow = kit.glow(map, '#ffd27a', 5.5, [0, 0, 0.3], 0);

  const podiumSpot = kit.spot(g, '#ffc47a', 30, [0, 7, 1.5], [0, 1.6, -3.3], 0.32);
  kit.spot(g, '#ffd08a', 22, [0, 8, -1], [0, 4.6, -8.3], 0.55, false);
  const chandeliers = [kit.point(g, '#ffbf6a', 6, 12, [-3, 7.2, 0]), kit.point(g, '#ffbf6a', 6, 12, [3, 7.2, 0])];
  for (const x of [-3, 3]) kit.glow(g, '#ffd08a', 2.2, [x, 7.2, 0], 0.8);
  kit.dualTone(g, { hemi: 1.2, key: '#8b96ff', keyIntensity: 0.8, keyPos: [-8, 12, 8], keyTarget: [0, 0, -3], extent: 14 });
  const dust = kit.dust(g, [-5, 0.5, -7], [5, 7, 6], 420, '#ffe2b0', 0.035, 79);
  const flags = g.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && typeof c.userData.side === 'number');
  const flagBase = flags.map((f) => Float32Array.from(f.geometry.attributes.position!.array as ArrayLike<number>));

  return {
    id: 'parliament1950',
    group: g,
    anchors: { podium: new THREE.Vector3(0, 1.22, -3.45) },
    background: new THREE.Color('#141026'),
    fog: new THREE.Fog('#1a1430', 14, 40),
    update: ({ frame, progress }) => {
      const m = easeOutCubic(smoothstep(0.55, 0.88, progress));
      for (const p of pieces) {
        p.mesh.position.set(p.scatter.x * (1 - m), p.scatter.y * (1 - m), 0.06 + p.scatter.z * (1 - m));
        p.mesh.rotation.z = p.spin * (1 - m);
        p.mat.color.copy(p.from).lerp(unified, smoothstep(0.75, 0.95, progress));
      }
      (risLabel.material as THREE.MeshToonMaterial).opacity = 1 - smoothstep(0.55, 0.7, progress);
      (nkriLabel.material as THREE.MeshToonMaterial).opacity = smoothstep(0.85, 0.95, progress);
      (moseLabel.material as THREE.MeshToonMaterial).opacity = smoothstep(0.1, 0.25, progress);
      mapGlow.material.opacity = smoothstep(0.85, 0.95, progress) * (0.35 + Math.sin(frame * 0.12) * 0.08);
      podiumSpot.intensity = 30 * (1 - smoothstep(0.6, 0.8, progress) * 0.5);
      chandeliers.forEach((c, i) => (c.intensity = 6 * (1 + Math.sin(frame * 0.3 + i) * 0.02)));
      flags.forEach((f, fi) => {
        const base = flagBase[fi];
        const pos = f.geometry.attributes.position!;
        if (!base) return;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3] ?? 0;
          pos.setZ(i, Math.sin(x * 4 + frame * 0.12 + fi) * 0.06 * (x + 0.6));
        }
        pos.needsUpdate = true;
      });
      dust(frame);
    },
  };
}

// ── Shot 8: Gedung Sate, Bandung today — the golden "Dalilnya Mana?" seal ───

function buildGedungSate(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  kit.mesh(g, new THREE.PlaneGeometry(80, 60), '#1b1a30', [0, 0, -5], { rot: [-Math.PI / 2, 0, 0], ink: false });
  for (const s of [-1, 1] as const) kit.mesh(g, new THREE.PlaneGeometry(9, 12), '#1f3326', [s * 7, 0.01, -2], { rot: [-Math.PI / 2, 0, 0], ink: false });
  kit.mesh(g, new THREE.PlaneGeometry(4, 20), '#3a3550', [0, 0.012, 0], { rot: [-Math.PI / 2, 0, 0], ink: false });

  const b = new THREE.Group();
  b.position.set(0, 0, -12);
  g.add(b);
  const wall = kit.toon('#efe7d6');
  const roof = kit.toon('#3e3a4c');
  const lit = kit.lit(PALETTE.windowLit);
  for (const s of [-1, 1] as const) {
    kit.box(b, [9, 4.6, 3.2], [s * 7.5, 2.3, 0], wall);
    kit.hipRoof(b, 9.6, 3.8, 1.6, [s * 7.5, 4.6, 0], roof);
    for (const fl of [0, 1])
      for (let i = 0; i < 6; i++) {
        const x = s * (3.6 + i * 1.4);
        kit.box(b, [0.6, 1.1, 0.04], [x, 1.1 + fl * 2.0, 1.62], i % 4 === 1 && fl === 1 ? kit.lit('#2a2850') : lit, { ink: 10, shadow: false });
        kit.box(b, [0.8, 0.12, 0.12], [x, 1.72 + fl * 2.0, 1.66], '#d9cfba', { ink: false });
      }
  }
  kit.box(b, [6.4, 6.4, 4.4], [0, 3.2, 0.3], wall);
  for (const x of [-2.2, -0.75, 0.75, 2.2]) kit.cyl(b, 0.18, 0.2, 3.2, [x, 1.6, 2.6], wall, { seg: 14 });
  kit.box(b, [6.0, 0.35, 0.8], [0, 3.35, 2.6], '#d9cfba');
  for (const x of [-1.5, 0, 1.5]) kit.box(b, [0.8, 1.6, 0.04], [x, 4.6, 2.52], lit, { ink: 10, shadow: false });
  // Tiered meru-style roof and the six-ball "sate" spire.
  kit.hipRoof(b, 7.2, 5.2, 1.2, [0, 6.4, 0.3], roof);
  kit.box(b, [3.2, 1.3, 3.2], [0, 7.4, 0.3], wall);
  kit.hipRoof(b, 4.4, 4.4, 1.0, [0, 8.05, 0.3], roof);
  kit.box(b, [2.0, 0.9, 2.0], [0, 8.9, 0.3], wall);
  kit.hipRoof(b, 3.0, 3.0, 0.9, [0, 9.35, 0.3], roof);
  kit.box(b, [1.1, 0.6, 1.1], [0, 10.15, 0.3], wall);
  kit.hipRoof(b, 1.8, 1.8, 0.9, [0, 10.45, 0.3], roof);
  kit.cyl(b, 0.035, 0.035, 2.4, [0, 12.4, 0.3], PALETTE.gold, { seg: 8 });
  for (let i = 0; i < 6; i++) kit.mesh(b, new THREE.SphereGeometry(0.12, 14, 10), PALETTE.gold, [0, 11.75 + i * 0.27, 0.3], { ink: 40 });
  for (const s of [-1, 1] as const) kit.spot(g, '#ffc47a', 22, [s * 4, 0.3, -4], [s * 1.5, 7, -12], 0.55, s === 1);
  kit.spot(g, '#ffd08a', 30, [0, 0.3, -6], [0, 11, -11.7], 0.3, false);

  // Street lamps along the plaza.
  for (const z of [-6, -1, 4]) for (const s of [-1, 1] as const) {
    kit.cyl(g, 0.05, 0.07, 3.4, [s * 2.6, 1.7, z], '#1f2030', { seg: 8 });
    kit.glow(g, '#ffd08a', 1.3, [s * 2.6, 3.45, z], 0.9);
  }
  const plazaLights = [kit.point(g, '#ffbd70', 5, 9, [-2.6, 3.3, -1]), kit.point(g, '#ffbd70', 5, 9, [2.6, 3.3, 4])];

  // City bokeh behind the building.
  const br = mulberry32(88);
  for (let i = 0; i < 70; i++) {
    const warm = br() < 0.7;
    kit.glow(g, warm ? '#ffc77a' : '#9fc0ff', 0.4 + br() * 0.6, [(br() - 0.5) * 70, 0.6 + br() * 6, -30 - br() * 25], 0.55);
  }
  kit.backdrop(g, [240, 90], [0, 24, -80], (c, w, h) => {
    nightSky(c, w, h, [[0, '#060820'], [0.5, '#1a1f5e'], [0.72, '#3b3a88'], [0.82, '#5a4290'], [1, '#141236']], 420, 89, 0.55);
    ridge(c, w, h, [[0, 0.74], [0.18, 0.66], [0.3, 0.6], [0.4, 0.585], [0.5, 0.59], [0.58, 0.6], [0.7, 0.67], [1, 0.73]], '#232457');
    skylineLights(c, w, h, 0.8, 7, '#11122e', 0.18);
  }, 2);

  // Golden seal "DALILNYA MANA?".
  const sealTex = kit.canvas(1024, 1024, (c, w) => {
    const r = w / 2;
    const gold = c.createRadialGradient(r * 0.8, r * 0.7, r * 0.1, r, r, r);
    gold.addColorStop(0, '#ffe7a0');
    gold.addColorStop(0.6, '#e2a93a');
    gold.addColorStop(1, '#9a6614');
    c.fillStyle = gold;
    c.beginPath();
    c.arc(r, r, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#6a400c';
    c.lineWidth = 18;
    c.beginPath();
    c.arc(r, r, r * 0.93, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 8;
    c.beginPath();
    c.arc(r, r, r * 0.7, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#5a340a';
    c.font = '800 64px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const ring = 'PERSATUAN ISLAM ✦ BANDUNG ✦ 1923 ✦ ';
    const chars = [...ring];
    chars.forEach((ch, i) => {
      const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
      c.save();
      c.translate(r + Math.cos(a) * r * 0.815, r + Math.sin(a) * r * 0.815);
      c.rotate(a + Math.PI / 2);
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.font = '900 150px Georgia, serif';
    c.fillText('DALILNYA', r, r - 70);
    c.fillText('MANA?', r, r + 90);
  });
  const seal = new THREE.Group();
  seal.position.set(0, 6.3, -4);
  g.add(seal);
  kit.cyl(seal, 0.78, 0.78, 0.12, [0, 0, -0.06], kit.toon('#c48a26', { emissive: '#5a3a00', emissiveIntensity: 0.4 }), { rot: [Math.PI / 2, 0, 0], seg: 48 });
  kit.mesh(seal, new THREE.CircleGeometry(0.78, 64), kit.toon('#ffffff', { map: sealTex, emissive: '#ffffff', emissiveMap: sealTex, emissiveIntensity: 0.35 }), [0, 0, 0.002], { ink: false, shadow: false });
  const sealGlow = kit.glow(seal, '#ffd27a', 3.4, [0, 0, -0.2], 0);
  const ringFx = kit.glow(g, '#ffe2a0', 1, [0, 6.3, -3.9], 0);
  const sparks: { s: THREE.Sprite; dir: THREE.Vector3 }[] = [];
  const sp = mulberry32(90);
  for (let i = 0; i < 28; i++) {
    const a = sp() * Math.PI * 2;
    sparks.push({ s: kit.glow(g, '#ffd98a', 0.14, [0, 6.3, -3.9], 0), dir: new THREE.Vector3(Math.cos(a), Math.sin(a), (sp() - 0.3) * 0.5).multiplyScalar(0.6 + sp() * 1.2) });
  }
  const sealLight = kit.point(g, '#ffc46a', 0, 8, [0, 6.3, -2.6]);

  kit.dualTone(g, { hemi: 1.2, key: '#8a96ff', keyIntensity: 0.9, keyPos: [-14, 20, 10], keyTarget: [0, 4, -12], extent: 20 });
  const dust = kit.dust(g, [-6, 0.5, -10], [6, 9, 10], 420, '#ffe2b0', 0.04, 91);

  return {
    id: 'gedungSate',
    group: g,
    anchors: {},
    background: new THREE.Color('#0c0c24'),
    fog: new THREE.Fog('#151438', 28, 110),
    update: ({ frame, localFrame }) => {
      // Seal slams in at local frame 18, settles with a small bounce.
      const t = clamp01((localFrame - 18) / 12);
      const after = Math.max(0, localFrame - 30);
      const bounce = Math.sin(after * 0.5) * Math.exp(-after * 0.12) * 0.06;
      seal.visible = localFrame >= 18;
      seal.scale.setScalar(lerp(3.2, 1, easeOutCubic(t)) + bounce);
      seal.rotation.z = lerp(-0.55, 0.06, easeOutCubic(t)) + Math.sin(frame * 0.03) * 0.015;
      seal.position.y = 6.3 + Math.sin(frame * 0.05) * 0.04;
      const impact = localFrame >= 30 ? Math.exp(-(localFrame - 30) * 0.12) : 0;
      ringFx.scale.setScalar(1 + (localFrame - 30) * 0.35);
      ringFx.material.opacity = impact * 0.8;
      sealGlow.material.opacity = (seal.visible ? 0.55 : 0) + impact * 0.4 + Math.sin(frame * 0.1) * 0.05;
      sealLight.intensity = (seal.visible ? 2 : 0) + impact * 10;
      sparks.forEach(({ s, dir }) => {
        const age = localFrame - 30;
        s.visible = age >= 0 && age < 45;
        if (!s.visible) return;
        s.position.set(dir.x * age * 0.07, 6.3 + dir.y * age * 0.07 - age * age * 0.0006, -3.9 + dir.z * age * 0.05);
        s.material.opacity = (1 - age / 45) * 0.9;
      });
      plazaLights.forEach((l, i) => (l.intensity = 5 * (1 + Math.sin(frame * 0.2 + i) * 0.02)));
      dust(frame);
    },
  };
}

const BUILDERS: Record<WorldId, (kit: WorldKit) => WorldScene> = {
  bandung1923: buildBandung1923,
  langgar: buildLanggar,
  hassanStudy: buildHassanStudy,
  pressRoom: buildPressRoom,
  endeCoast: buildEndeCoast,
  pesantren1936: buildPesantren,
  parliament1950: buildParliament,
  gedungSate: buildGedungSate,
};

export function buildWorld(id: WorldId, kit: WorldKit): WorldScene {
  const w = BUILDERS[id](kit);
  w.group.name = `world-${id}`;
  return w;
}

// ── Film pipeline: DoF + dual-tone grade + grain + dither ───────────────────

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
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0;
  return 0.0;
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
    // Nearer, sharper samples must not bleed into a blurred background.
    float w = zs >= zc - 0.05 ? 1.0 : clamp(coc(zs) / max(r * c, 0.5), 0.0, 1.0);
    acc += texture2D(tColor, uv).rgb * w;
    wsum += w;
  }
  vec3 col = acc / wsum;

  // Dual-tone split: indigo shadows, amber highlights.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3(0.72, 0.8, 1.35) + vec3(0.004, 0.006, 0.02), (1.0 - smoothstep(0.0, 0.3, l)) * 0.55);
  col += vec3(1.0, 0.72, 0.38) * smoothstep(0.45, 1.3, l) * 0.08;

  vec2 vq = (vUv - 0.5) * vec2(0.95, 1.15);
  col *= mix(0.6, 1.0, smoothstep(0.85, 0.25, length(vq)));
  col = mix(col, vec3(0.012, 0.01, 0.04), dip);

  col = toSRGB(clamp(col, 0.0, 1.0));
  // Film grain + coarse ordered dither (2px cells) for a printed texture.
  col += (hash(gl_FragCoord.xy + mod(frame, 64.0) * 17.31) - 0.5) * 0.045;
  col += (bayer4(gl_FragCoord.xy * 0.5) - 0.47) * 0.022;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface FilmParams {
  focusDistance: number;
  aperture: number;
  frame: number;
  dip: number;
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
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType),
    });
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
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
