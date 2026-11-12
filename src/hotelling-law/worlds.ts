/**
 * Hukum Hotelling — three hand-built "living painting" sets (Pyxis v2.3).
 *
 *  • Kota malam: two minimarkets wall to wall in a 3-storey ruko — moulded
 *    pilasters & cornices, lit glass storefronts with shelf silhouettes,
 *    striped awnings, glowing fascia signs with neon, wet asphalt with light
 *    streak reflections, sodium street lamps, mist, drizzle and passing traffic.
 *  • Ruang kelas 1929: wainscoted classroom, framed chalkboard whose Hotelling
 *    derivation is written on in chalk, an enamel pendant lamp (Rembrandt key)
 *    and a moonlit window shaft with dust motes.
 *  • Pantai: painterly sand, toon-banded rolling sea with foam, palms, a centre
 *    pole with rope line, 100 tourists with live market pins and two
 *    arched-canopy ice-cream carts on spoked wooden wheels.
 *
 * Every animated element is a pure function of frame and loops cleanly over
 * the 60 s timeline.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ERA_FONT } from '../cikajang/fonts';
import {
  BEACH_HALF,
  CART_Z,
  CURB_H,
  TOURIST_X,
  boundaryAt,
  cartsAt,
  clamp01,
  hash01,
  lerp,
  loopSaw,
  loopWave,
  shareAt,
  smoothstep,
  type ArmPose,
  type ColorGrading,
  type Expression,
  type Vec3,
  type WorldId,
} from './story';
import { EXTRA_CARD_PX, beachExtraLook, billboardPitch, createExtraCardGeometry, createToonGradient, paintExtra, type ExtraPosture, type ExtraSpec } from './toon';

const PLUM = '#241726';

export interface WorldUpdate {
  frame: number;
  grading: ColorGrading;
  camera: THREE.PerspectiveCamera;
}

export interface WorldScene {
  id: WorldId;
  group: THREE.Group;
  background: THREE.Texture;
  fog: THREE.FogExp2;
  /** World-space direction toward the key light (drives toon rim / shade side). */
  keyDir: THREE.Vector3;
  update: (u: WorldUpdate) => void;
}

// ── Kit: materials, textures, ink ───────────────────────────────────────────

type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

interface MeshOpts {
  ink?: number | false;
  shadow?: boolean;
  receive?: boolean;
  rot?: Vec3;
}

export class Kit {
  readonly gradient = createToonGradient();
  private readonly owned: { dispose: () => void }[] = [this.gradient];
  private readonly inkMat = this.track(new THREE.MeshBasicMaterial({ color: PLUM, side: THREE.BackSide }));
  private glowTex: THREE.CanvasTexture | null = null;

  track<T extends { dispose: () => void }>(o: T): T {
    this.owned.push(o);
    return o;
  }

  canvas(w: number, h: number, paint: Paint, opts: { repeat?: readonly [number, number]; srgb?: boolean } = {}): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) throw new Error('Canvas2D context unavailable');
    paint(g, w, h);
    const tex = this.track(new THREE.CanvasTexture(c));
    if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    tex.anisotropy = 4;
    return tex;
  }

  toon(color: THREE.ColorRepresentation, map: THREE.Texture | null = null, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
    return this.track(new THREE.MeshToonMaterial({ color, map, gradientMap: this.gradient, ...extra }));
  }

  basic(params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
    return this.track(new THREE.MeshBasicMaterial(params));
  }

  /** Additive, depth-safe glow material. */
  additive(color: THREE.ColorRepresentation, map: THREE.Texture, opacity: number): THREE.MeshBasicMaterial {
    return this.basic({ color, map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }

  mesh<G extends THREE.BufferGeometry>(parent: THREE.Object3D, geo: G, mat: THREE.Material, pos: Vec3 = [0, 0, 0], opts: MeshOpts = {}): THREE.Mesh<G, THREE.Material> {
    this.track(geo);
    const m = new THREE.Mesh<G, THREE.Material>(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    m.castShadow = opts.shadow ?? false;
    m.receiveShadow = opts.receive ?? true;
    const t = opts.ink === undefined ? 0.012 : opts.ink;
    if (t) {
      // Inverted-hull plum ink line with a constant world thickness per axis.
      geo.computeBoundingBox();
      const size = new THREE.Vector3();
      geo.boundingBox?.getSize(size);
      const hull = new THREE.Mesh(geo, this.inkMat);
      hull.scale.set(size.x > 1e-4 ? (size.x + 2 * t) / size.x : 1, size.y > 1e-4 ? (size.y + 2 * t) / size.y : 1, size.z > 1e-4 ? (size.z + 2 * t) / size.z : 1);
      hull.raycast = () => undefined;
      m.add(hull);
    }
    parent.add(m);
    return m;
  }

  box(parent: THREE.Object3D, size: Vec3, mat: THREE.Material, pos: Vec3, opts: MeshOpts = {}): THREE.Mesh<THREE.BoxGeometry, THREE.Material> {
    return this.mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), mat, pos, opts);
  }

  glowTexture(): THREE.CanvasTexture {
    if (this.glowTex) return this.glowTex;
    this.glowTex = this.canvas(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.18, 'rgba(255,255,255,0.55)');
      r.addColorStop(0.5, 'rgba(255,255,255,0.14)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    return this.glowTex;
  }

  glow(parent: THREE.Object3D, color: THREE.ColorRepresentation, size: number, pos: Vec3, opacity = 0.8): THREE.Sprite {
    const mat = this.track(
      new THREE.SpriteMaterial({ map: this.glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const s = new THREE.Sprite(mat);
    s.scale.set(size, size, 1);
    s.position.set(pos[0], pos[1], pos[2]);
    s.renderOrder = 5;
    parent.add(s);
    return s;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
  }
}

// ── Painterly canvas helpers ────────────────────────────────────────────────

const rnd = (seed: number, i: number): number => hash01(seed, i);

/** Short semi-transparent brush dabs: the "living painting" surface. */
function brush(g: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number, colors: readonly string[], alpha = 0.18, len = 26, width = 5): void {
  g.save();
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd(seed, i) * w;
    const y = rnd(seed + 1, i) * h;
    const a = rnd(seed + 2, i) * Math.PI;
    const l = len * (0.4 + rnd(seed + 3, i));
    g.strokeStyle = colors[i % colors.length] ?? '#fff';
    g.globalAlpha = alpha * (0.4 + rnd(seed + 4, i) * 0.6);
    g.lineWidth = width * (0.5 + rnd(seed + 5, i));
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5 - 3, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.restore();
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number, color: string, maxR = 1.6, alpha = 0.5): void {
  g.save();
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    g.globalAlpha = alpha * rnd(seed + 9, i);
    g.beginPath();
    g.arc(rnd(seed, i) * w, rnd(seed + 1, i) * h, 0.4 + rnd(seed + 2, i) * maxR, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function vGradient(g: CanvasRenderingContext2D, w: number, h: number, stops: readonly (readonly [number, string])[]): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  for (const [t, c] of stops) gr.addColorStop(t, c);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

const SIGN_FONT = ERA_FONT.transit;
const CHALK_FONT = ERA_FONT.mural;

/** Vertical light-streak used for wet-ground reflections (bright end at the top). */
function streakPaint(seed: number): Paint {
  // Opaque black → white intensity: additive blending adds nothing where it is black,
  // so the streak never depends on texture alpha (which mip-filters away at grazing angles).
  return (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const fall = Math.pow(1 - t, 1.3);
      // Broken horizontal ripples, like rain-dimpled asphalt.
      const ripple = 0.6 + 0.4 * Math.sin(y * 0.55 + rnd(seed, Math.floor(y / 3)) * 6);
      const gap = rnd(seed + 3, Math.floor(y / 5)) > 0.82 ? 0.3 : 1;
      const v = Math.round(255 * fall * ripple * gap);
      const hw = (w / 2) * (0.35 + 0.65 * (1 - t * 0.5)) * (0.75 + 0.25 * rnd(seed + 5, y));
      const gr = g.createLinearGradient(w / 2 - hw, 0, w / 2 + hw, 0);
      gr.addColorStop(0, '#000');
      gr.addColorStop(0.5, `rgb(${v},${v},${v})`);
      gr.addColorStop(1, '#000');
      g.fillStyle = gr;
      g.fillRect(0, y, w, 1);
    }
  };
}

function skyPaint(top: string, horizon: string, seed: number, stars: boolean): Paint {
  return (g, w, h) => {
    vGradient(g, w, h, [
      [0, top],
      [0.62, horizon],
      [1, horizon],
    ]);
    if (stars) speckle(g, w, h * 0.55, seed, 260, '#fff7e6', 1.1, 0.8);
    brush(g, w, h, seed + 4, 70, ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], 0.05, 90, 26);
  };
}

// ── Shared pieces ───────────────────────────────────────────────────────────

/** Particles that drift on loop-periodic paths (drizzle, dust, embers). */
function driftParticles(
  kit: Kit,
  parent: THREE.Object3D,
  count: number,
  box: { min: Vec3; max: Vec3 },
  color: THREE.ColorRepresentation,
  size: number,
  opacity: number,
  seed: number,
): (frame: number, fall: number, sway: number) => void {
  const geo = kit.track(new THREE.BufferGeometry());
  const pos = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = kit.track(
    new THREE.PointsMaterial({ color, size, map: kit.glowTexture(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
  );
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;
  return (frame, fall, sway) => {
    for (let i = 0; i < count; i++) {
      const fx = rnd(seed, i);
      const fz = rnd(seed + 1, i);
      // Integer cycles per loop keep f0 ≡ f1800.
      const cycles = Math.round(fall * (0.6 + rnd(seed + 2, i) * 0.8));
      const v = cycles === 0 ? rnd(seed + 3, i) : 1 - loopSaw(frame, cycles, rnd(seed + 3, i));
      pos[i * 3] = lerp(x0, x1, fx) + loopWave(frame, 3 + (i % 5), i) * sway;
      pos[i * 3 + 1] = lerp(y0, y1, v);
      pos[i * 3 + 2] = lerp(z0, z1, fz) + loopWave(frame, 2 + (i % 3), i * 1.7) * sway * 0.6;
    }
    geo.attributes.position!.needsUpdate = true;
  };
}

/** Additive light cone (volumetric beam read through fog). */
function beamCone(kit: Kit, parent: THREE.Object3D, color: THREE.ColorRepresentation, radius: number, height: number, pos: Vec3, opacity: number): THREE.Mesh {
  const tex = kit.canvas(8, 128, (g, w, h) => {
    vGradient(g, w, h, [
      [0, 'rgba(255,255,255,0.0)'],
      [0.25, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,1)'],
    ]);
  });
  const geo = new THREE.ConeGeometry(radius, height, 32, 1, true);
  geo.translate(0, -height / 2, 0);
  const mat = kit.basic({ color, alphaMap: tex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const m = kit.mesh(parent, geo, mat, pos, { ink: false, receive: false });
  m.renderOrder = 4;
  return m;
}

/** Largest font size ≤ `size` at which `text` fits inside `maxW` (signage never clips). */
function fitFont(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: string, font: string): number {
  let s = size;
  g.font = `${weight} ${s}px ${font}`;
  const w = g.measureText(text).width;
  if (w > maxW) s = Math.floor(size * (maxW / w));
  g.font = `${weight} ${s}px ${font}`;
  return s;
}

function textCanvas(text: string, opts: { w: number; h: number; bg: string; fg: string; font: string; size: number; stroke?: string; border?: string }): Paint {
  return (g, w, h) => {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
    brush(g, w, h, text.length * 13, 120, ['#ffffff', '#000000'], 0.05, 40, 8);
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = h * 0.06;
      g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    }
    const size = fitFont(g, text, w - h * 0.5, opts.size, '900', opts.font);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (opts.stroke) {
      g.strokeStyle = opts.stroke;
      g.lineWidth = size * 0.12;
      g.lineJoin = 'round';
      g.strokeText(text, w / 2, h / 2 + size * 0.04);
    }
    g.fillStyle = opts.fg;
    g.fillText(text, w / 2, h / 2 + size * 0.04);
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. KOTA MALAM — Indomaret & Alfamart nempel
// ═══════════════════════════════════════════════════════════════════════════

const FACADE_Z = -3.2;
const STORE_W = 3.05;
const GROUND_FLOOR = 3.25;

interface Brand {
  name: string;
  kind: 'indomaret' | 'alfamart';
  x: number;
  primary: string;
  secondary: string;
  stripeA: string;
  stripeB: string;
  awning: string;
  neon: string;
  seed: number;
}

// Real-world palettes: Indomaret = navy blue / yellow / red bands with a white
// logo box; Alfamart = bold red fascia with yellow accent and white wordmark.
const INDOMARET: Brand = { name: 'Indomaret', kind: 'indomaret', x: -(STORE_W / 2 + 0.1), primary: '#0b3d91', secondary: '#f4f1ea', stripeA: '#e3162b', stripeB: '#ffd21f', awning: '#1d5fd1', neon: '#62b6ff', seed: 11 };
const ALFAMART: Brand = { name: 'alfamart', kind: 'alfamart', x: STORE_W / 2 + 0.1, primary: '#d6121b', secondary: '#f7efe6', stripeA: '#1f4fb0', stripeB: '#ffd21f', awning: '#d81e26', neon: '#ff5d6c', seed: 23 };

/** Brand logo drawn inside (x, y, w, h): Indomaret white box wordmark, Alfamart mark + white wordmark. */
function drawLogo(g: CanvasRenderingContext2D, b: Brand, x: number, y: number, w: number, h: number, onRed = true): void {
  g.save();
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (b.kind === 'indomaret') {
    // White rounded logo box, navy italic wordmark, red + yellow underline bars.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(x, y, w, h, h * 0.12);
    g.fill();
    g.strokeStyle = '#0a2a66';
    g.lineWidth = Math.max(2, h * 0.04);
    g.stroke();
    g.textAlign = 'center';
    const size = fitFont(g, 'Indomaret', w * 0.86, h * 0.56, 'italic 900', SIGN_FONT);
    g.fillStyle = '#0b3d91';
    g.fillText('Indomaret', x + w / 2, y + h * 0.42);
    const barW = Math.min(w * 0.8, g.measureText('Indomaret').width);
    g.fillStyle = '#e3162b';
    g.fillRect(x + w / 2 - barW / 2, y + h * 0.42 + size * 0.42, barW, h * 0.08);
    g.fillStyle = '#ffd21f';
    g.fillRect(x + w / 2 - barW / 2, y + h * 0.42 + size * 0.42 + h * 0.08, barW, h * 0.07);
  } else {
    // Logomark: rounded tile with a red "a" and yellow/blue swoosh, then the wordmark.
    const t = h * 0.86;
    const tx = x + h * 0.07;
    const ty = y + (h - t) / 2;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(tx, ty, t, t, t * 0.22);
    g.fill();
    g.fillStyle = '#ffd21f';
    g.beginPath();
    g.ellipse(tx + t * 0.5, ty + t * 0.78, t * 0.4, t * 0.12, -0.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f4fb0';
    g.beginPath();
    g.ellipse(tx + t * 0.62, ty + t * 0.84, t * 0.26, t * 0.06, -0.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d6121b';
    g.textAlign = 'center';
    fitFont(g, 'a', t * 0.8, t * 0.82, '900', SIGN_FONT);
    g.fillText('a', tx + t * 0.5, ty + t * 0.44);
    g.textAlign = 'left';
    const tw = w - t - h * 0.3;
    fitFont(g, 'alfamart', tw, h * 0.72, 'italic 900', SIGN_FONT);
    if (onRed) {
      g.strokeStyle = '#8f0b12';
      g.lineWidth = h * 0.06;
      g.strokeText('alfamart', tx + t + h * 0.14, y + h * 0.5);
    }
    g.fillStyle = onRed ? '#ffffff' : '#d6121b';
    g.fillText('alfamart', tx + t + h * 0.14, y + h * 0.5);
  }
  g.restore();
}

function signPaint(b: Brand): Paint {
  return (g, w, h) => {
    if (b.kind === 'indomaret') {
      // Signature lisplang: navy blue, yellow and red bands.
      g.fillStyle = '#0b3d91';
      g.fillRect(0, 0, w, h * 0.56);
      g.fillStyle = '#ffd21f';
      g.fillRect(0, h * 0.56, w, h * 0.2);
      g.fillStyle = '#e3162b';
      g.fillRect(0, h * 0.76, w, h * 0.24);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, h * 0.03, w, h * 0.02);
      brush(g, w, h, b.seed, 220, ['#ffffff', '#000000'], 0.04, 60, 10);
      drawLogo(g, b, w * 0.2, h * 0.1, w * 0.6, h * 0.8);
    } else {
      // Thick glowing red panel with yellow accent band.
      vGradient(g, w, h, [
        [0, '#ef2b2f'],
        [0.7, '#d6121b'],
        [1, '#a50d14'],
      ]);
      g.fillStyle = '#ffd21f';
      g.fillRect(0, h * 0.82, w, h * 0.12);
      g.fillStyle = '#1f4fb0';
      g.fillRect(0, h * 0.94, w, h * 0.06);
      brush(g, w, h, b.seed, 220, ['#ffffff', '#000000'], 0.04, 60, 10);
      drawLogo(g, b, w * 0.16, h * 0.1, w * 0.68, h * 0.66);
    }
    // Soft bloom inside the lightbox.
    const r = g.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, w * 0.5);
    r.addColorStop(0, 'rgba(255,255,255,0.16)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  };
}

/** Pylon / blade lightbox face: logo on top, "BUKA 24 JAM" below. */
function pylonPaint(b: Brand): Paint {
  return (g, w, h) => {
    g.fillStyle = b.kind === 'indomaret' ? '#ffffff' : '#d6121b';
    g.fillRect(0, 0, w, h);
    if (b.kind === 'indomaret') {
      g.fillStyle = '#0b3d91';
      g.fillRect(0, 0, w, h * 0.62);
      drawLogo(g, b, w * 0.06, h * 0.1, w * 0.88, h * 0.42);
      g.fillStyle = '#ffd21f';
      g.fillRect(0, h * 0.62, w, h * 0.08);
      g.fillStyle = '#e3162b';
      g.fillRect(0, h * 0.7, w, h * 0.3);
    } else {
      drawLogo(g, b, w * 0.04, h * 0.14, w * 0.92, h * 0.34);
      g.fillStyle = '#ffd21f';
      g.fillRect(0, h * 0.62, w, h * 0.08);
      g.fillStyle = '#a50d14';
      g.fillRect(0, h * 0.7, w, h * 0.3);
    }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitFont(g, 'BUKA 24 JAM', w * 0.84, h * 0.17, '900', SIGN_FONT);
    g.fillText('BUKA 24 JAM', w / 2, h * 0.85);
    g.strokeStyle = PLUM;
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  };
}

function shadeHex(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  if (amount >= 0) c.lerp(new THREE.Color('#ffffff'), amount);
  else c.lerp(new THREE.Color('#000000'), -amount);
  return `#${c.getHexString()}`;
}

function shelfPaint(seed: number, tint: string): Paint {
  return (g, w, h) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    const rows = 5;
    const palette = ['#e2453c', '#f2b134', '#3c7fd6', '#43a35a', '#f07c2a', '#b04fc4', '#f2e3c4', '#2bb3b1'];
    for (let r = 0; r < rows; r++) {
      const y1 = ((r + 1) / rows) * h;
      let x = 4;
      let i = 0;
      while (x < w - 6) {
        const bw = 10 + rnd(seed + r, i) * 26;
        const bh = (h / rows) * (0.45 + rnd(seed + 40 + r, i) * 0.45);
        g.fillStyle = palette[Math.floor(rnd(seed + 80 + r, i) * palette.length)] ?? '#fff';
        g.fillRect(x, y1 - 8 - bh, bw - 3, bh);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x + 2, y1 - 8 - bh + 3, 3, bh - 6);
        x += bw;
        i++;
      }
      g.fillStyle = '#d9d4cc';
      g.fillRect(0, y1 - 8, w, 8);
      g.fillStyle = '#e8473c';
      for (let k = 0; k < 6; k++) g.fillRect(rnd(seed + 7 + r, k) * w, y1 - 7, 14, 6);
    }
  };
}

function fridgePaint(seed: number): Paint {
  return (g, w, h) => {
    vGradient(g, w, h, [
      [0, '#f2fbff'],
      [1, '#bfe4f7'],
    ]);
    const doors = 6;
    for (let d = 0; d < doors; d++) {
      const x0 = (d / doors) * w;
      g.fillStyle = 'rgba(40, 60, 80, 0.75)';
      g.fillRect(x0, 0, 5, h);
      for (let r = 0; r < 4; r++) {
        const y1 = ((r + 1) / 4) * h - 6;
        for (let k = 0; k < 5; k++) {
          const bx = x0 + 12 + k * ((w / doors - 18) / 5);
          const c = ['#2a8f4a', '#d6342c', '#f0a52a', '#2f6bd1', '#7a3fb8'][(k + r + d) % 5] ?? '#fff';
          g.fillStyle = c;
          g.fillRect(bx, y1 - 34, 9, 34);
          g.fillRect(bx + 2, y1 - 44, 5, 10);
        }
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillRect(x0, y1, w / doors, 4);
      }
    }
    brush(g, w, h, seed, 80, ['#ffffff'], 0.12, 50, 12);
  };
}

/**
 * Window poster: kicker band, auto-fitted headline (wrapped to two lines if
 * needed), auto-fitted sub line and a price burst — nothing ever clips.
 */
function posterPaint(text: string, sub: string, bg: string, fg: string): Paint {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    brush(g, w, h, text.length * 7 + sub.length, 60, ['#ffffff', '#000000'], 0.05, 30, 6);
    const pad = w * 0.1;
    const maxW = w - pad * 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Headline: one line if it fits at a readable size, else split on the space.
    const words = text.split(' ');
    const lines = words.length > 1 && fitFont(g, text, maxW, h * 0.26, '900', SIGN_FONT) < h * 0.15 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text];
    const size = Math.min(...lines.map((l) => fitFont(g, l, maxW, lines.length > 1 ? h * 0.17 : h * 0.26, '900', SIGN_FONT)));
    g.font = `900 ${size}px ${SIGN_FONT}`;
    g.fillStyle = fg;
    const top = lines.length > 1 ? h * 0.24 : h * 0.34;
    lines.forEach((l, i) => g.fillText(l, w / 2, top + i * size * 1.08));
    // Sub line on a contrasting ribbon.
    const subSize = fitFont(g, sub, maxW * 0.92, h * 0.12, '800', SIGN_FONT);
    const ry = h * 0.66;
    g.fillStyle = fg;
    g.fillRect(pad * 0.5, ry - subSize * 0.75, w - pad, subSize * 1.5);
    g.fillStyle = bg;
    g.font = `800 ${subSize}px ${SIGN_FONT}`;
    g.fillText(sub, w / 2, ry + subSize * 0.04);
    // Price burst.
    g.fillStyle = fg;
    g.beginPath();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = k % 2 ? w * 0.1 : w * 0.13;
      g.lineTo(w * 0.78 + Math.cos(a) * r, h * 0.86 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.fillStyle = bg;
    fitFont(g, '-30%', w * 0.17, h * 0.06, '900', SIGN_FONT);
    g.fillText('-30%', w * 0.78, h * 0.86);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
  };
}

interface StoreRig {
  neon: THREE.MeshBasicMaterial[];
  sign: THREE.MeshBasicMaterial;
  signLight: THREE.PointLight;
  glows: THREE.Sprite[];
  streaks: THREE.MeshBasicMaterial[];
  /** Self-lit faces of the roadside pylon sign. */
  pylon: THREE.MeshBasicMaterial;
}

function buildStore(kit: Kit, parent: THREE.Object3D, b: Brand, streak: THREE.Texture): StoreRig {
  const g = new THREE.Group();
  g.position.set(b.x, CURB_H, FACADE_Z);
  parent.add(g);
  const W = STORE_W;
  const glassBottom = 0.38;
  const glassTop = 2.45;

  // Interior (unlit painted cards so it glows warm through the glass).
  const warm = '#ffe7c2';
  const interior = new THREE.Group();
  g.add(interior);
  const D = 2.9;
  kit.mesh(interior, new THREE.PlaneGeometry(W - 0.1, 2.9), kit.basic({ map: kit.canvas(512, 256, fridgePaint(b.seed)), color: '#f4fbff' }), [0, 1.45, -D], { ink: false });
  kit.mesh(
    interior,
    new THREE.PlaneGeometry(W - 0.1, D),
    kit.basic({
      map: kit.canvas(
        256,
        256,
        (c, w, h) => {
          c.fillStyle = '#efe6d6';
          c.fillRect(0, 0, w, h);
          c.strokeStyle = 'rgba(120,100,80,0.35)';
          c.lineWidth = 2;
          for (let i = 0; i <= 8; i++) {
            c.beginPath();
            c.moveTo((i / 8) * w, 0);
            c.lineTo((i / 8) * w, h);
            c.moveTo(0, (i / 8) * h);
            c.lineTo(w, (i / 8) * h);
            c.stroke();
          }
        },
        { repeat: [2, 2] },
      ),
    }),
    [0, 0.005, -D / 2],
    { ink: false, rot: [-Math.PI / 2, 0, 0] },
  );
  kit.mesh(interior, new THREE.PlaneGeometry(W - 0.1, D), kit.basic({ color: '#fff3dc' }), [0, 2.95, -D / 2], { ink: false, rot: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) {
    kit.mesh(interior, new THREE.PlaneGeometry(D, 2.95), kit.basic({ color: '#f1dfc0', side: THREE.DoubleSide }), [s * (W / 2 - 0.05), 1.47, -D / 2], { ink: false, rot: [0, Math.PI / 2, 0] });
  }
  // Fluorescent strips.
  for (let k = 0; k < 3; k++) kit.box(interior, [W * 0.7, 0.04, 0.12], kit.basic({ color: '#ffffff' }), [0, 2.9, -0.6 - k * 0.9], { ink: false });
  // Gondola shelves — read as soft silhouettes through the glass.
  const shelfZ = [-1.0, -1.7, -2.35];
  shelfZ.forEach((z, i) => {
    const tint = new THREE.Color(warm).lerp(new THREE.Color('#ffffff'), i * 0.15);
    const mat = kit.basic({ map: kit.canvas(512, 256, shelfPaint(b.seed * 7 + i, '#cfc6b8')), color: tint });
    kit.mesh(interior, new THREE.PlaneGeometry(W * 0.62, 1.45), mat, [(i % 2 ? 0.25 : -0.2) + (i === 2 ? 0.1 : 0), 0.73, z], { ink: false });
    kit.box(interior, [W * 0.62, 0.06, 0.4], kit.basic({ color: '#bdb3a4' }), [(i % 2 ? 0.25 : -0.2) + (i === 2 ? 0.1 : 0), 1.48, z - 0.2], { ink: false });
  });
  // Cashier counter + a Bean-Head cashier in the brand polo (unified extras).
  const cashierX = b.x < 0 ? 1.0 : -1.0;
  kit.box(interior, [0.9, 0.95, 0.5], kit.basic({ color: b.primary }), [cashierX, 0.48, -0.55], { ink: false });
  kit.box(interior, [0.92, 0.05, 0.54], kit.basic({ color: '#e9e2d4' }), [cashierX, 0.97, -0.55], { ink: false });
  kit.box(interior, [0.3, 0.2, 0.06], kit.basic({ color: '#1f2937' }), [cashierX + 0.15, 1.1, -0.6], { ink: false });
  const cashierSpec: ExtraSpec = {
    look: {
      kind: 'human',
      skin: b.kind === 'indomaret' ? '#e7b48e' : '#d9a07a',
      skinShade: b.kind === 'indomaret' ? '#c99070' : '#b47b58',
      hair: 'short',
      hairColor: '#1f1410',
      browColor: '#1f1410',
      hatColor: '#000000',
      top: 'polo',
      topColor: b.kind === 'indomaret' ? '#1d4ed8' : '#dc2626',
      topAccent: b.stripeB,
      shortSleeve: true,
      apron: false,
      bottomColor: '#1f2937',
      shoeUpper: '#111827',
      shoeAccent: '#f8fafc',
      glasses: b.kind === 'alfamart',
      mustache: false,
    },
    posture: 'stand',
    expression: 'warm',
    armL: 'side',
    armR: 'side',
    look3: b.x < 0 ? -0.35 : 0.35,
    frame: 4,
    seed: b.seed * 3,
  };
  const cashierTex = kit.canvas(EXTRA_CARD_PX.w, EXTRA_CARD_PX.h, (c) => paintExtra(c, cashierSpec, { side: 1, rim: '#ffe2b0', rimStrength: 0.5 }));
  const cashierCard = kit.mesh(interior, createExtraCardGeometry(), kit.basic({ map: cashierTex, alphaTest: 0.5, color: '#fff1dc' }), [cashierX, 0.02, -0.95], { ink: false });
  cashierCard.scale.setScalar(0.95);

  // Glass + mullions + door.
  const glassMat = kit.basic({ color: '#cfe3ff', transparent: true, opacity: 0.2, depthWrite: false });
  kit.mesh(g, new THREE.PlaneGeometry(W - 0.2, glassTop - glassBottom), glassMat, [0, (glassTop + glassBottom) / 2, 0.02], { ink: false });
  const sheen = kit.canvas(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k < 6; k++) {
      c.lineWidth = 6 + rnd(b.seed, k) * 20;
      c.beginPath();
      const x = rnd(b.seed + 1, k) * w * 1.4 - w * 0.2;
      c.moveTo(x, h);
      c.lineTo(x + w * 0.45, 0);
      c.stroke();
    }
  });
  kit.mesh(g, new THREE.PlaneGeometry(W - 0.2, glassTop - glassBottom), kit.additive('#9ec2ff', sheen, 0.16), [0, (glassTop + glassBottom) / 2, 0.03], { ink: false });
  const alu = kit.toon('#aeb6bf');
  for (const x of [-W / 2 + 0.1, -0.5, 0.5, W / 2 - 0.1]) kit.box(g, [0.07, glassTop - glassBottom, 0.08], alu, [x, (glassTop + glassBottom) / 2, 0.04]);
  kit.box(g, [W - 0.1, 0.08, 0.09], alu, [0, glassTop, 0.04]);
  kit.box(g, [W - 0.1, 0.06, 0.09], alu, [0, glassBottom, 0.04]);
  // Automatic sliding door (no handles): sensor box above, meeting-line rubber
  // strips, operational stickers and a frosted brand safety band across the glass.
  kit.box(g, [0.36, 0.1, 0.12], kit.toon('#2a2632'), [0, glassTop - 0.1, 0.1], { ink: 0.006 });
  kit.mesh(g, new THREE.CircleGeometry(0.018, 12), kit.basic({ color: '#ff3b3b' }), [0.12, glassTop - 0.1, 0.165], { ink: false });
  kit.box(g, [0.025, glassTop - glassBottom - 0.12, 0.03], kit.toon('#1c1a22'), [0, (glassTop + glassBottom) / 2, 0.05], { ink: false });
  const doorSticker = kit.canvas(256, 200, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect(4, 4, w - 8, h - 8, 18);
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = b.primary;
    c.stroke();
    drawLogo(c, b, w * 0.1, h * 0.06, w * 0.8, h * 0.28, false);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#1f2937';
    fitFont(c, 'PINTU OTOMATIS', w * 0.84, h * 0.13, '900', SIGN_FONT);
    c.fillText('PINTU OTOMATIS', w / 2, h * 0.5);
    c.fillStyle = b.primary;
    fitFont(c, 'BUKA 24 JAM', w * 0.84, h * 0.14, '900', SIGN_FONT);
    c.fillText('BUKA 24 JAM', w / 2, h * 0.68);
    c.fillStyle = '#6b7280';
    fitFont(c, 'QRIS • DEBIT • TUNAI', w * 0.84, h * 0.09, '800', SIGN_FONT);
    c.fillText('QRIS • DEBIT • TUNAI', w / 2, h * 0.85);
  });
  for (const x of [-0.25, 0.25]) kit.mesh(g, new THREE.PlaneGeometry(0.3, 0.23), kit.basic({ map: doorSticker }), [x, 1.5, 0.045], { ink: 0.004 });
  const band = kit.canvas(1024, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(0, 0, w, h);
    c.fillStyle = b.primary;
    c.fillRect(0, h * 0.84, w, h * 0.16);
    for (let k = 0; k < 4; k++) drawLogo(c, b, 20 + k * (w / 4), h * 0.1, w / 4 - 40, h * 0.66, false);
  });
  kit.mesh(g, new THREE.PlaneGeometry(W - 0.24, 0.12), kit.basic({ map: band, transparent: true, depthWrite: false }), [0, 1.2, 0.035], { ink: false });
  // Promo posters and the 24h sticker on the glass.
  kit.mesh(g, new THREE.PlaneGeometry(0.62, 0.84), kit.basic({ map: kit.canvas(256, 340, posterPaint('PROMO', 'HEMAT!', b.stripeB, b.primary)) }), [-1.05, 1.0, 0.05], { ink: 0.008 });
  kit.mesh(g, new THREE.PlaneGeometry(0.62, 0.84), kit.basic({ map: kit.canvas(256, 340, posterPaint('2+1', 'MINUMAN', b.primary, '#ffffff')) }), [1.05, 1.0, 0.05], { ink: 0.008 });
  kit.mesh(g, new THREE.CircleGeometry(0.17, 32), kit.basic({ map: kit.canvas(128, 128, (c, w, h) => {
    c.fillStyle = b.stripeA;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = `900 30px ${SIGN_FONT}`;
    c.textAlign = 'center';
    c.fillText('BUKA', w / 2, h * 0.45);
    c.fillText('24 JAM', w / 2, h * 0.72);
  }) }), [0, 1.85, 0.05], { ink: false });

  // Facade cladding: plinth, pilasters with base/capital, transom band.
  const clad = kit.toon(b.secondary, kit.canvas(128, 128, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    brush(c, w, h, b.seed, 90, ['#d8d0c4', '#ffffff', '#c9bfb2'], 0.25, 30, 6);
  }, { repeat: [2, 2] }));
  const granite = kit.toon('#5b5560', kit.canvas(128, 64, (c, w, h) => {
    c.fillStyle = '#7b7480';
    c.fillRect(0, 0, w, h);
    speckle(c, w, h, b.seed + 5, 500, '#2a2530', 1.4, 0.8);
    speckle(c, w, h, b.seed + 6, 200, '#d6d0dc', 1, 0.6);
    c.strokeStyle = 'rgba(20,10,20,0.6)';
    c.lineWidth = 2;
    c.strokeRect(0, 0, w, h);
  }, { repeat: [6, 1] }));
  kit.box(g, [W, glassBottom, 0.16], granite, [0, glassBottom / 2, 0.06], { receive: true });
  const brandMat = kit.toon(b.primary);
  for (const s of [-1, 1]) {
    const px = s * (W / 2 + 0.02);
    kit.box(g, [0.2, GROUND_FLOOR, 0.24], clad, [px, GROUND_FLOOR / 2, 0.06]);
    kit.box(g, [0.26, 0.16, 0.3], granite, [px, 0.08, 0.07]);
    kit.box(g, [0.28, 0.08, 0.32], clad, [px, glassTop + 0.06, 0.07]);
    // Brand colour inlay strip on each pilaster.
    kit.box(g, [0.06, glassTop - glassBottom - 0.2, 0.02], brandMat, [px, (glassTop + glassBottom) / 2, 0.19], { ink: 0.006 });
  }

  // Striped awning: sloped slab + scalloped valance.
  const stripes = kit.canvas(512, 64, (c, w, h) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? '#fbf6ec' : b.awning;
      c.fillRect((i / n) * w, 0, w / n + 1, h);
    }
    brush(c, w, h, b.seed + 3, 160, ['#000000', '#ffffff'], 0.06, 30, 5);
  });
  const awningMat = kit.toon('#ffffff', stripes);
  const awn = kit.box(g, [W - 0.05, 0.04, 0.95], awningMat, [0, glassTop + 0.02, 0.46], { shadow: true });
  awn.rotation.x = 0.36;
  const scallop = kit.canvas(512, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const n = 14;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? '#fbf6ec' : b.awning;
      c.beginPath();
      const x0 = (i / n) * w;
      c.moveTo(x0, 0);
      c.lineTo(x0 + w / n, 0);
      c.lineTo(x0 + w / n, h * 0.55);
      c.quadraticCurveTo(x0 + w / n / 2, h * 1.05, x0, h * 0.55);
      c.closePath();
      c.fill();
      c.strokeStyle = PLUM;
      c.lineWidth = 3;
      c.stroke();
    }
  });
  kit.mesh(g, new THREE.PlaneGeometry(W - 0.05, 0.2), kit.toon('#ffffff', scallop, { transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), [0, glassTop - 0.24, 0.92], { ink: false });

  // Fascia sign box with neon outline.
  const signY = 2.98;
  const signMat = kit.basic({ map: kit.canvas(1024, 240, signPaint(b)), color: '#ffffff' });
  kit.box(g, [W - 0.04, 0.72, 0.22], kit.toon(shadeHex(b.primary, -0.4)), [0, signY, 0.12]);
  kit.mesh(g, new THREE.PlaneGeometry(W - 0.14, 0.64), signMat, [0, signY, 0.235], { ink: false });
  const neon: THREE.MeshBasicMaterial[] = [];
  const neonMat = kit.basic({ color: b.neon });
  neon.push(neonMat);
  for (const y of [signY + 0.37, signY - 0.37]) kit.box(g, [W - 0.02, 0.025, 0.025], neonMat, [0, y, 0.25], { ink: false });
  for (const x of [-W / 2 + 0.01, W / 2 - 0.01]) kit.box(g, [0.025, 0.76, 0.025], neonMat, [x, signY, 0.25], { ink: false });
  const glows = [kit.glow(g, b.neon, 4.2, [0, signY, 0.5], 0.45), kit.glow(g, '#ffd9a0', 3.4, [0, 1.4, 0.4], 0.28)];

  // Cornice: moulded lis with dentils above the sign.
  kit.box(g, [W + 0.3, 0.1, 0.42], clad, [0, GROUND_FLOOR + 0.02, 0.12], { shadow: true });
  kit.box(g, [W + 0.2, 0.06, 0.34], clad, [0, GROUND_FLOOR - 0.06, 0.1]);
  for (let k = 0; k < 16; k++) kit.box(g, [0.07, 0.06, 0.07], clad, [-W / 2 + 0.1 + (k * (W - 0.2)) / 15, GROUND_FLOOR - 0.13, 0.22], { ink: 0.006 });

  // Light: warm interior spill + coloured sign wash.
  const interiorLight = new THREE.PointLight('#ffd7a1', 9, 9, 1.4);
  interiorLight.position.set(0, 2.0, 0.9);
  g.add(interiorLight);
  const signLight = new THREE.PointLight(b.neon, 6, 8, 1.5);
  signLight.position.set(0, signY - 0.2, 1.2);
  g.add(signLight);
  // Light pool on the wet sidewalk.
  const pool = kit.canvas(256, 256, (c, w, h) => {
    const r = c.createRadialGradient(w / 2, 0, 4, w / 2, 0, h);
    r.addColorStop(0, '#e6e6e6');
    r.addColorStop(0.5, '#4d4d4d');
    r.addColorStop(1, '#000');
    c.fillStyle = r;
    c.fillRect(0, 0, w, h);
  });
  kit.mesh(g, new THREE.PlaneGeometry(W * 1.1, 2.2), kit.additive('#ffcf8f', pool, 0.32), [0, 0.006, 1.1], { ink: false, rot: [-Math.PI / 2, 0, 0] });

  // Wet-road reflection streaks of the sign and the bright window.
  const streaks: THREE.MeshBasicMaterial[] = [];
  const addStreak = (x: number, w: number, len: number, color: string, opacity: number): void => {
    const m = kit.additive(color, streak, opacity);
    streaks.push(m);
    const mesh = kit.mesh(parent, new THREE.PlaneGeometry(w, len), m, [b.x + x, 0.008, -0.98 + len / 2], { ink: false, rot: [-Math.PI / 2, 0, 0] });
    mesh.renderOrder = 3;
  };
  addStreak(0, W * 0.8, 6.5, b.neon, 0.8);
  addStreak(-0.6, 0.9, 4.5, '#ffd9a0', 0.32);
  addStreak(0.7, 0.9, 4.2, '#ffd9a0', 0.3);

  // Roadside pylon sign (plang tiang tinggi) at the curb in front of the store.
  const pylonX = b.kind === 'indomaret' ? -3.0 : 2.95;
  const pylon = new THREE.Group();
  pylon.position.set(pylonX, CURB_H, -1.08);
  parent.add(pylon);
  const steel = kit.toon('#4b4f5c');
  kit.box(pylon, [0.62, 0.3, 0.34], kit.toon('#6b6570'), [0, 0.15, 0], { shadow: true });
  for (const x of [-0.2, 0.2]) kit.box(pylon, [0.1, 4.3, 0.1], steel, [x, 0.3 + 2.15, 0], { shadow: true });
  const boxY = 4.6 + 0.62;
  kit.box(pylon, [1.0, 1.36, 0.24], kit.toon(shadeHex(b.primary, -0.45)), [0, boxY, 0], { shadow: true, ink: 0.014 });
  const pylonMat = kit.basic({ map: kit.canvas(320, 440, pylonPaint(b)) });
  for (const s of [-1, 1]) {
    kit.mesh(pylon, new THREE.PlaneGeometry(0.92, 1.28), pylonMat, [0, boxY, s * 0.125], { ink: false, rot: [0, s > 0 ? 0 : Math.PI, 0] });
  }
  kit.glow(pylon, b.neon, 3.2, [0, boxY, 0.4], 0.35);
  const pylonLight = new THREE.PointLight(b.neon, 2.5, 6, 1.6);
  pylonLight.position.set(0, boxY - 0.9, 0.8);
  pylon.add(pylonLight);
  // Its wet-road reflection.
  const pm = kit.additive(b.neon, streak, 0.5);
  streaks.push(pm);
  kit.mesh(parent, new THREE.PlaneGeometry(0.9, 5.5), pm, [pylonX, 0.009, -0.9 + 2.75], { ink: false, rot: [-Math.PI / 2, 0, 0] }).renderOrder = 3;

  return { neon, sign: signMat, signLight, glows, streaks, pylon: pylonMat };
}

function windowPaint(seed: number, lit: boolean): Paint {
  return (g, w, h) => {
    if (lit) {
      vGradient(g, w, h, [
        [0, '#ffd89a'],
        [1, '#f3a65a'],
      ]);
      // Curtain folds + a room silhouette.
      g.fillStyle = 'rgba(160, 60, 70, 0.75)';
      for (let k = 0; k < 7; k++) g.fillRect((k / 7) * w * 0.35, 0, w * 0.04, h);
      g.fillStyle = 'rgba(70, 30, 40, 0.5)';
      if (rnd(seed, 1) > 0.4) {
        g.beginPath();
        g.ellipse(w * 0.66, h * 0.52, w * 0.1, h * 0.09, 0, 0, Math.PI * 2);
        g.fill();
        g.fillRect(w * 0.54, h * 0.6, w * 0.24, h * 0.4);
      }
    } else {
      vGradient(g, w, h, [
        [0, '#2a2847'],
        [1, '#14122a'],
      ]);
      g.strokeStyle = 'rgba(160, 170, 255, 0.25)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(w * 0.1, h);
      g.lineTo(w * 0.6, 0);
      g.stroke();
    }
    g.strokeStyle = '#3a2a2a';
    g.lineWidth = 8;
    g.strokeRect(0, 0, w, h);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.moveTo(0, h * 0.45);
    g.lineTo(w, h * 0.45);
    g.stroke();
  };
}

function plasterPaint(seed: number, base: string): Paint {
  return (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    brush(g, w, h, seed, 520, ['#ffffff', '#6b5a4a', '#a89070'], 0.12, 40, 9);
    // Rain stains dripping from sills.
    for (let k = 0; k < 22; k++) {
      const x = rnd(seed + 3, k) * w;
      const y = rnd(seed + 4, k) * h * 0.7;
      const gr = g.createLinearGradient(0, y, 0, y + 140);
      gr.addColorStop(0, 'rgba(60, 45, 40, 0.28)');
      gr.addColorStop(1, 'rgba(60, 45, 40, 0)');
      g.fillStyle = gr;
      g.fillRect(x, y, 8 + rnd(seed + 5, k) * 16, 140);
    }
    g.strokeStyle = 'rgba(50, 35, 30, 0.35)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 8; k++) {
      let x = rnd(seed + 6, k) * w;
      let y = rnd(seed + 7, k) * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (rnd(seed + 8, k * 9 + s) - 0.5) * 30;
        y += 10 + rnd(seed + 9, k * 9 + s) * 16;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  };
}

function asphaltPaint(seed: number): Paint {
  return (g, w, h) => {
    g.fillStyle = '#2a2733';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, seed, 9000, '#5e5a6c', 1.3, 0.55);
    speckle(g, w, h, seed + 1, 5000, '#0e0c14', 1.5, 0.6);
    brush(g, w, h, seed + 2, 300, ['#1a1822', '#3a3646'], 0.25, 80, 22);
    // Tar seams.
    g.strokeStyle = 'rgba(10, 8, 14, 0.7)';
    g.lineWidth = 4;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      let x = rnd(seed + 3, k) * w;
      g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 40) {
        x += (rnd(seed + 4, k * 40 + y) - 0.5) * 24;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  };
}

function roughnessPaint(seed: number): Paint {
  return (g, w, h) => {
    g.fillStyle = 'rgb(120,120,120)';
    g.fillRect(0, 0, w, h);
    // Puddles: very smooth (dark in the roughness channel).
    for (let k = 0; k < 18; k++) {
      const x = rnd(seed, k) * w;
      const y = rnd(seed + 1, k) * h;
      const r = 20 + rnd(seed + 2, k) * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgb(14,14,14)');
      gr.addColorStop(0.7, 'rgb(30,30,30)');
      gr.addColorStop(1, 'rgba(120,120,120,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, r * 1.6, r, rnd(seed + 3, k), 0, Math.PI * 2);
      g.fill();
    }
    speckle(g, w, h, seed + 4, 3000, 'rgb(200,200,200)', 1.5, 0.5);
  };
}

function buildStreetLamp(kit: Kit, parent: THREE.Object3D, x: number, z: number, armDir: number, target: THREE.Object3D): { glow: THREE.Sprite; light: THREE.SpotLight } {
  const g = new THREE.Group();
  g.position.set(x, CURB_H, z);
  parent.add(g);
  const pole = kit.toon('#3b3a4a');
  kit.mesh(g, new THREE.CylinderGeometry(0.06, 0.09, 6.0, 12), pole, [0, 3.0, 0], { shadow: true });
  kit.mesh(g, new THREE.CylinderGeometry(0.14, 0.18, 0.5, 12), pole, [0, 0.25, 0]);
  const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 5.6, 0), new THREE.Vector3(0, 6.05, armDir * 0.4), new THREE.Vector3(0, 6.0, armDir * 1.4)]);
  kit.mesh(g, new THREE.TubeGeometry(arm, 20, 0.04, 8, false), pole, [0, 0, 0], { ink: false });
  const headZ = armDir * 1.5;
  kit.mesh(g, new RoundedBoxGeometry(0.34, 0.12, 0.6, 3, 0.04), pole, [0, 5.95, headZ]);
  kit.box(g, [0.26, 0.03, 0.48], kit.basic({ color: '#ffe0a8' }), [0, 5.88, headZ], { ink: false });
  const glow = kit.glow(g, '#ffb85c', 2.6, [0, 5.78, headZ], 0.8);
  const light = new THREE.SpotLight('#ffb35c', 26, 16, 0.75, 0.65, 1.3);
  light.position.set(0, 5.8, headZ);
  light.target = target;
  g.add(light);
  beamCone(kit, g, '#ffb35c', 1.9, 5.6, [0, 5.85, headZ], 0.08);
  beamCone(kit, g, '#ffd28a', 0.9, 5.4, [0, 5.85, headZ], 0.07);
  return { glow, light };
}

function buildScooter(kit: Kit, parent: THREE.Object3D, pos: Vec3, yaw: number, color: string): void {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.y = yaw;
  parent.add(g);
  const tire = kit.toon('#1d1b22');
  for (const x of [-0.42, 0.42]) {
    kit.mesh(g, new THREE.TorusGeometry(0.17, 0.06, 10, 24), tire, [x, 0.23, 0]);
    kit.mesh(g, new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), kit.toon('#c0c4cc'), [x, 0.23, 0], { rot: [Math.PI / 2, 0, 0] });
  }
  const body = kit.toon(color);
  kit.mesh(g, new RoundedBoxGeometry(0.7, 0.3, 0.3, 3, 0.1), body, [-0.05, 0.45, 0], { shadow: true });
  kit.mesh(g, new RoundedBoxGeometry(0.5, 0.1, 0.28, 3, 0.04), kit.toon('#2a2230'), [-0.15, 0.66, 0]);
  kit.mesh(g, new RoundedBoxGeometry(0.16, 0.6, 0.22, 3, 0.06), body, [0.38, 0.62, 0], { rot: [0, 0, -0.3] });
  kit.box(g, [0.04, 0.04, 0.5], tire, [0.48, 0.95, 0]);
  kit.glow(g, '#fff4d0', 0.5, [0.52, 0.8, 0], 0.5);
}

/** A stylised car with lit headlights that drives along the road. */
function buildCar(kit: Kit, parent: THREE.Object3D, streak: THREE.Texture): { group: THREE.Group; wheels: THREE.Object3D[]; streakMat: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  parent.add(g);
  const paint = kit.toon('#e8e2d0');
  kit.mesh(g, new RoundedBoxGeometry(3.6, 0.62, 1.6, 4, 0.18), paint, [0, 0.62, 0], { shadow: true });
  kit.mesh(g, new RoundedBoxGeometry(2.0, 0.55, 1.45, 4, 0.2), paint, [-0.2, 1.15, 0]);
  kit.mesh(g, new RoundedBoxGeometry(1.86, 0.4, 1.47, 3, 0.15), kit.basic({ color: '#2a3550' }), [-0.2, 1.17, 0], { ink: false });
  kit.box(g, [3.62, 0.08, 1.62], kit.toon('#c2410c'), [0, 0.6, 0], { ink: false });
  const wheels: THREE.Object3D[] = [];
  for (const x of [-1.15, 1.15]) {
    for (const z of [-0.78, 0.78]) {
      const w = kit.mesh(g, new THREE.CylinderGeometry(0.33, 0.33, 0.22, 18), kit.toon('#18161c'), [x, 0.33, z], { rot: [Math.PI / 2, 0, 0] });
      kit.box(w, [0.4, 0.23, 0.08], kit.toon('#a1a1aa'), [0, 0, 0], { ink: false });
      wheels.push(w);
    }
  }
  const head = kit.basic({ color: '#fffbe6' });
  const tail = kit.basic({ color: '#ff3048' });
  for (const z of [-0.55, 0.55]) {
    kit.box(g, [0.05, 0.14, 0.3], head, [1.81, 0.72, z], { ink: false });
    kit.glow(g, '#fff4c8', 1.4, [1.95, 0.72, z], 0.75);
    kit.box(g, [0.05, 0.12, 0.26], tail, [-1.81, 0.72, z], { ink: false });
    kit.glow(g, '#ff3048', 0.7, [-1.9, 0.72, z], 0.6);
  }
  beamCone(kit, g, '#fff1c4', 1.2, 5, [1.9, 0.72, 0], 0.05).rotation.z = Math.PI / 2;
  const streakMat = kit.additive('#fff1c4', streak, 0.4);
  kit.mesh(g, new THREE.PlaneGeometry(1.4, 4), streakMat, [3.6, 0.01, 0.6], { ink: false, rot: [-Math.PI / 2, 0, -Math.PI / 2] });
  return { group: g, wheels, streakMat };
}

function backgroundBuildings(kit: Kit, parent: THREE.Object3D): THREE.MeshBasicMaterial[] {
  const blink: THREE.MeshBasicMaterial[] = [];
  const winTex = (seed: number): THREE.CanvasTexture =>
    kit.canvas(128, 256, (g, w, h) => {
      g.fillStyle = '#1a1530';
      g.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 8; y += 18) {
        for (let x = 8; x < w - 8; x += 16) {
          const r = rnd(seed, x * 31 + y);
          if (r > 0.62) {
            g.fillStyle = r > 0.9 ? '#9fd4ff' : '#ffcf7a';
            g.globalAlpha = 0.5 + r * 0.5;
            g.fillRect(x, y, 9, 11);
          }
        }
      }
      g.globalAlpha = 1;
    });
  const spec: [number, number, number, number, number][] = [
    [-15, -16, 6, 15, 1],
    [-9, -20, 5, 22, 2],
    [-3.5, -24, 6, 28, 3],
    [3, -19, 5, 18, 4],
    [8.5, -22, 6, 25, 5],
    [14, -15, 5, 13, 6],
    [-12, -30, 7, 32, 7],
    [11, -32, 7, 30, 8],
    [0, -36, 8, 36, 9],
  ];
  for (const [x, z, w, h, seed] of spec) {
    const mat = kit.basic({ map: winTex(seed), color: '#b9a7d9' });
    const tex = mat.map;
    if (tex) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w / 4, h / 8);
    }
    kit.box(parent, [w, h, 3], mat, [x, h / 2, z], { ink: 0.05 });
    // Rooftop silhouettes: water tank + antenna.
    kit.mesh(parent, new THREE.CylinderGeometry(0.6, 0.6, 1.1, 10), kit.basic({ color: '#241c3c' }), [x + w * 0.2, h + 0.55, z], { ink: 0.04 });
    kit.box(parent, [0.08, 2.4, 0.08], kit.basic({ color: '#241c3c' }), [x - w * 0.25, h + 1.2, z], { ink: false });
  }
  // Cell tower with a blinking aviation light.
  kit.box(parent, [0.25, 14, 0.25], kit.basic({ color: '#2a2244' }), [-6, 25, -26], { ink: false });
  const red = kit.basic({ color: '#ff2a3c', transparent: true, opacity: 1 });
  blink.push(red);
  kit.mesh(parent, new THREE.SphereGeometry(0.25, 10, 8), red, [-6, 32.2, -26], { ink: false });
  return blink;
}

export function createCityWorld(kit: Kit): WorldScene {
  const group = new THREE.Group();
  group.name = 'world-city';
  const streak = kit.canvas(64, 256, streakPaint(5));
  const fog = new THREE.FogExp2('#1d1636', 0.034);

  // Sky (9:16 canvas so stars stay round) repainted when the grade changes.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 270;
  skyCanvas.height = 480;
  const skyCtx = skyCanvas.getContext('2d');
  if (!skyCtx) throw new Error('Canvas2D context unavailable');
  const background = kit.track(new THREE.CanvasTexture(skyCanvas));
  background.colorSpace = THREE.SRGBColorSpace;
  let skyKey = '';
  kit.glow(group, '#fff1d6', 9, [-16, 26, -48], 0.55).material.fog = false;
  const moon = kit.mesh(group, new THREE.CircleGeometry(1.1, 32), kit.basic({ color: '#fff4dc', fog: false }), [-16, 26, -48.5], { ink: false });
  moon.lookAt(0, 2, 10);

  // Lights.
  const hemi = new THREE.HemisphereLight('#4a4f9c', '#2a1530', 0.55);
  group.add(hemi);
  const key = new THREE.DirectionalLight('#9fb8ff', 0.55);
  key.position.set(-7, 10, 9);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0008;
  group.add(key, key.target);
  const rim = new THREE.DirectionalLight('#ff5d8f', 0.6);
  rim.position.set(6, 4, -10);
  group.add(rim);

  // Road: wet asphalt (glossy puddles via roughness map) + markings.
  const asphalt = kit.canvas(1024, 1024, asphaltPaint(3), { repeat: [5, 3] });
  const rough = kit.canvas(512, 512, roughnessPaint(4), { repeat: [5, 3], srgb: false });
  const roadMat = kit.track(new THREE.MeshStandardMaterial({ color: '#8f8aa0', map: asphalt, roughnessMap: rough, roughness: 0.55, metalness: 0.15 }));
  kit.mesh(group, new THREE.PlaneGeometry(70, 34), roadMat, [0, 0, 7], { ink: false, rot: [-Math.PI / 2, 0, 0] });
  const lineMat = kit.toon('#e9e4d6', null, { transparent: true, opacity: 0.85 });
  for (let k = -9; k <= 9; k++) kit.box(group, [1.4, 0.004, 0.12], lineMat, [k * 2.6, 0.003, 2.8], { ink: false });
  for (let k = 0; k < 7; k++) kit.box(group, [0.45, 0.004, 2.6], lineMat, [-7.5 + k * 0.8, 0.003, 0.6], { ink: false });
  // Puddles: mirror-smooth dark patches tinted by the sky.
  const puddleMat = kit.track(new THREE.MeshStandardMaterial({ color: '#0d0b16', roughness: 0.04, metalness: 0.6, emissive: '#3b1d5c', emissiveIntensity: 0.35, transparent: true, opacity: 0.85 }));
  const puddles: Vec3[] = [
    [0.4, 0.004, 0.6],
    [-2.4, 0.004, 1.9],
    [2.8, 0.004, 3.4],
    [-0.9, 0.004, 4.6],
  ];
  for (const [x, y, z] of puddles) {
    const p = kit.mesh(group, new THREE.CircleGeometry(1, 40), puddleMat, [x, y, z], { ink: false, rot: [-Math.PI / 2, 0, 0] });
    p.scale.set(1.3 + rnd(7, x * 10) * 0.8, 0.55 + rnd(8, z * 10) * 0.3, 1);
  }

  // Sidewalk with paving + painted yellow/black curb stones.
  const paving = kit.toon('#8c8496', kit.canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#9b93a6';
    g.fillRect(0, 0, w, h);
    brush(g, w, h, 31, 160, ['#6f6880', '#b8b0c4'], 0.25, 30, 7);
    g.strokeStyle = 'rgba(30,20,40,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i / 4) * w, 0);
      g.lineTo((i / 4) * w, h);
      g.moveTo(0, (i / 4) * h);
      g.lineTo(w, (i / 4) * h);
      g.stroke();
    }
  }, { repeat: [24, 2] }));
  kit.box(group, [48, CURB_H, 2.3], paving, [0, CURB_H / 2, -2.15], { ink: false, receive: true });
  const curbY = kit.toon('#f2c230');
  const curbK = kit.toon('#26222c');
  for (let k = -24; k < 24; k++) kit.box(group, [0.5, CURB_H + 0.02, 0.16], k % 2 ? curbY : curbK, [k * 0.5 + 0.25, (CURB_H + 0.02) / 2, -1.0], { ink: 0.006 });

  // The ruko block: two minimarkets wall to wall.
  const idm = buildStore(kit, group, INDOMARET, streak);
  const alf = buildStore(kit, group, ALFAMART, streak);
  // Shared party-wall pilaster between them (the "nempel" seam).
  const plaster = kit.toon('#d8c4a4', kit.canvas(512, 512, plasterPaint(9, '#d9c6a6'), { repeat: [3, 2] }));
  kit.box(group, [0.22, GROUND_FLOOR, 0.3], plaster, [0, CURB_H + GROUND_FLOOR / 2, FACADE_Z + 0.08]);

  // Upper storeys: plaster, string courses, windows, balconies, AC units.
  const upperY0 = CURB_H + GROUND_FLOOR + 0.06;
  const upperH = 5.8;
  kit.box(group, [14, upperH, 0.5], plaster, [0, upperY0 + upperH / 2, FACADE_Z - 0.2], { ink: 0.02 });
  const trim = kit.toon('#efe2c8');
  for (const y of [upperY0 + 2.85, upperY0 + upperH - 0.1]) kit.box(group, [14.3, 0.14, 0.7], trim, [0, y, FACADE_Z - 0.1], { shadow: true });
  kit.box(group, [14.5, 0.3, 0.85], trim, [0, upperY0 + upperH + 0.15, FACADE_Z - 0.1], { shadow: true });
  const frame = kit.toon('#4a3530');
  for (let floor = 0; floor < 2; floor++) {
    const wy = upperY0 + 1.45 + floor * 2.85;
    for (let k = 0; k < 6; k++) {
      const wx = -5.5 + k * 2.2;
      const lit = rnd(17, floor * 10 + k) > 0.42;
      kit.box(group, [1.16, 1.5, 0.1], frame, [wx, wy, FACADE_Z + 0.08]);
      kit.mesh(group, new THREE.PlaneGeometry(1.0, 1.34), kit.basic({ map: kit.canvas(128, 170, windowPaint(floor * 10 + k, lit)) }), [wx, wy, FACADE_Z + 0.14], { ink: false });
      kit.box(group, [1.4, 0.08, 0.3], trim, [wx, wy - 0.8, FACADE_Z + 0.15]);
      if (lit) kit.glow(group, '#ffc67a', 1.6, [wx, wy, FACADE_Z + 0.4], 0.22);
      if ((floor + k) % 3 === 0) {
        // Balcony railing.
        kit.box(group, [1.5, 0.05, 0.5], frame, [wx, wy - 0.72, FACADE_Z + 0.4]);
        for (let r = 0; r < 7; r++) kit.box(group, [0.025, 0.55, 0.025], frame, [wx - 0.7 + r * 0.233, wy - 0.45, FACADE_Z + 0.64], { ink: false });
        kit.box(group, [1.5, 0.04, 0.04], frame, [wx, wy - 0.17, FACADE_Z + 0.64], { ink: false });
      } else if (k % 2 === 1) {
        // AC outdoor unit with a fan grille.
        kit.box(group, [0.7, 0.5, 0.28], kit.toon('#dedbd2'), [wx + 0.95, wy - 0.4, FACADE_Z + 0.26], { shadow: true });
        kit.mesh(group, new THREE.CircleGeometry(0.17, 20), kit.toon('#3a3640'), [wx + 0.88, wy - 0.4, FACADE_Z + 0.41], { ink: 0.006 });
      }
    }
  }
  // Side neighbours: a closed shutter (fotokopi) and a warm warung.
  const shutter = kit.toon('#8d8a95', kit.canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#9a97a3';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = y % 16 ? '#7b7885' : '#b4b1bc';
      g.fillRect(0, y, w, 4);
    }
    g.font = `40px ${ERA_FONT.mural}`;
    g.fillStyle = 'rgba(240, 80, 160, 0.8)';
    g.fillText('ZAQ', 40, 150);
    brush(g, w, h, 41, 90, ['#4a3a40'], 0.18, 40, 8);
  }));
  kit.box(group, [3.3, 2.8, 0.1], shutter, [-5.15, CURB_H + 1.4, FACADE_Z + 0.02]);
  kit.mesh(group, new THREE.PlaneGeometry(3.0, 0.5), kit.basic({ map: kit.canvas(512, 90, textCanvas('FOTOKOPI', { w: 512, h: 90, bg: '#f2e8c8', fg: '#1e3a8a', font: SIGN_FONT, size: 60, border: '#1e3a8a' })) }), [-5.15, CURB_H + 3.05, FACADE_Z + 0.08], { ink: 0.01 });
  kit.mesh(group, new THREE.PlaneGeometry(3.1, 2.7), kit.basic({ color: '#ffbf73' }), [5.15, CURB_H + 1.4, FACADE_Z - 0.4], { ink: false });
  kit.mesh(group, new THREE.PlaneGeometry(3.0, 0.5), kit.basic({ map: kit.canvas(512, 90, textCanvas('WARUNG MAKAN', { w: 512, h: 90, bg: '#7f1d1d', fg: '#fde68a', font: SIGN_FONT, size: 54 })) }), [5.15, CURB_H + 3.05, FACADE_Z + 0.08], { ink: 0.01 });
  kit.glow(group, '#ffb35c', 3, [5.15, CURB_H + 2.2, FACADE_Z + 0.3], 0.4);
  const warungLight = new THREE.PointLight('#ffae5c', 5, 7, 1.4);
  warungLight.position.set(5.15, CURB_H + 2.3, FACADE_Z + 1.0);
  group.add(warungLight);
  for (const s of [-1, 1]) kit.box(group, [0.25, GROUND_FLOOR, 0.3], plaster, [s * (STORE_W + 0.32), CURB_H + GROUND_FLOOR / 2, FACADE_Z + 0.08]);

  // Street furniture.
  buildScooter(kit, group, [-2.4, CURB_H, -1.45], 0.2, '#e11d48');
  buildScooter(kit, group, [3.6, CURB_H, -1.45], -0.15, '#f8fafc');
  kit.mesh(group, new THREE.CylinderGeometry(0.2, 0.17, 0.62, 14), kit.toon('#15803d'), [-3.6, CURB_H + 0.31, -1.35], { shadow: true });
  const aframe = kit.canvas(256, 320, posterPaint('PROMO', 'MINGGU INI', '#ffd21f', '#0b4fb5'));
  kit.mesh(group, new THREE.PlaneGeometry(0.5, 0.65), kit.toon('#ffffff', aframe, { side: THREE.DoubleSide }), [-0.8, CURB_H + 0.34, -1.6], { rot: [-0.2, 0.18, 0], shadow: true, ink: 0.01 });
  kit.box(group, [0.6, 1.5, 0.5], kit.toon('#1e40af'), [-3.0, CURB_H + 0.75, FACADE_Z + 0.55], { shadow: true });
  kit.mesh(group, new THREE.PlaneGeometry(0.4, 0.3), kit.basic({ color: '#7dd3fc' }), [-3.0, CURB_H + 1.05, FACADE_Z + 0.81], { ink: false });

  // Street lamps + power lines.
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, 0, 0.5);
  group.add(lampTarget);
  const lampL = buildStreetLamp(kit, group, -4.6, -1.3, 1, lampTarget);
  const lampR = buildStreetLamp(kit, group, 4.6, -1.3, 1, lampTarget);
  const cableMat = kit.basic({ color: '#120e18' });
  const cable = (a: Vec3, b: Vec3, sag: number): void => {
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), mid, new THREE.Vector3(...b));
    kit.mesh(group, new THREE.TubeGeometry(curve, 24, 0.012, 5, false), cableMat, [0, 0, 0], { ink: false });
  };
  for (let k = 0; k < 3; k++) {
    cable([-14, 5.5 + k * 0.18, -1.3], [-4.6, 5.7 + k * 0.18, -1.3], 0.5);
    cable([-4.6, 5.7 + k * 0.18, -1.3], [4.6, 5.7 + k * 0.18, -1.3], 0.65 + k * 0.08);
    cable([4.6, 5.7 + k * 0.18, -1.3], [14, 5.5 + k * 0.18, -1.3], 0.5);
  }
  cable([-4.6, 5.4, -1.3], [-1.6, CURB_H + 6.9, FACADE_Z], 0.4);
  cable([4.6, 5.4, -1.3], [1.6, CURB_H + 6.9, FACADE_Z], 0.4);
  // Road reflections of the lamps.
  const lampStreaks = [-4.6, 4.6].map((x) => {
    const m = kit.additive('#ffb35c', streak, 0.45);
    kit.mesh(group, new THREE.PlaneGeometry(1.0, 7), m, [x, 0.008, -0.6 + 3.5], { ink: false, rot: [-Math.PI / 2, 0, 0] }).renderOrder = 3;
    return m;
  });

  const blinkers = backgroundBuildings(kit, group);
  const car = buildCar(kit, group, streak);

  // Atmosphere: drizzle, ground mist, moths near the lamps.
  const drizzle = driftParticles(kit, group, 520, { min: [-7, 0, -3], max: [7, 7.5, 6] }, '#cfd8ff', 0.035, 0.55, 61);
  // Gerimis: thin slanted rain streaks catching the neon and sodium light.
  const RAIN = 420;
  const rainPos = new Float32Array(RAIN * 6);
  const rainGeo = kit.track(new THREE.BufferGeometry());
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = kit.track(new THREE.LineBasicMaterial({ color: '#c9d4ff', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  group.add(rain);
  const rainAt = (frame: number): void => {
    for (let i = 0; i < RAIN; i++) {
      const cycles = 70 + Math.floor(rnd(141, i) * 40);
      const y = lerp(7.5, -0.2, loopSaw(frame, cycles, rnd(142, i)));
      const x = lerp(-8, 8, rnd(143, i)) - (7.5 - y) * 0.06;
      const z = lerp(-2.6, 7, rnd(144, i));
      const len = 0.16 + rnd(145, i) * 0.14;
      rainPos.set([x, y, z, x + len * 0.06, y + len, z], i * 6);
    }
    rainGeo.attributes.position!.needsUpdate = true;
  };
  // Rain rings spreading on the puddles.
  const ringTex = kit.canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
    g.stroke();
  });
  const ripples: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number; cycles: number }[] = [];
  for (let k = 0; k < 18; k++) {
    const pud = puddles[k % puddles.length] ?? [0, 0, 0];
    const mat = kit.additive('#b9c6ff', ringTex, 0.4);
    const mesh = kit.mesh(group, new THREE.PlaneGeometry(1, 1), mat, [pud[0] + (rnd(151, k) - 0.5) * 1.6, 0.007, pud[2] + (rnd(152, k) - 0.5) * 0.6], { ink: false, rot: [-Math.PI / 2, 0, 0] });
    ripples.push({ mesh, mat, phase: rnd(153, k), cycles: 40 + (k % 5) * 7 });
  }
  // Warm sodium light pools on the wet road beneath each lamp.
  const lampPool = kit.canvas(256, 256, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, '#ffffff');
    r.addColorStop(0.45, '#6a6a6a');
    r.addColorStop(1, '#000000');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
  for (const x of [-4.6, 4.6]) kit.mesh(group, new THREE.PlaneGeometry(4.2, 3.4), kit.additive('#ffb35c', lampPool, 0.28), [x, 0.006, 0.4], { ink: false, rot: [-Math.PI / 2, 0, 0] }).renderOrder = 2;
  const moths = driftParticles(kit, group, 40, { min: [-5.1, 5.1, -0.4], max: [-4.1, 5.9, 0.6] }, '#ffd9a0', 0.05, 0.8, 71);
  const mistTex = kit.canvas(256, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
    brush(g, w, h, 81, 40, ['rgba(255,255,255,0.4)'], 0.12, 60, 24);
  });
  const mists: { sprite: THREE.Sprite; x: number; cycles: number }[] = [];
  for (let k = 0; k < 9; k++) {
    const mat = kit.track(new THREE.SpriteMaterial({ map: mistTex, color: '#8e7fb8', transparent: true, opacity: 0.22, depthWrite: false }));
    const s = new THREE.Sprite(mat);
    s.scale.set(7, 2.2, 1);
    s.position.set(0, 0.6 + rnd(91, k) * 0.9, -2.5 + rnd(92, k) * 9);
    group.add(s);
    mists.push({ sprite: s, x: rnd(93, k), cycles: 1 + (k % 2) });
  }

  const tmp = new THREE.Color();
  const update = ({ frame, grading }: WorldUpdate): void => {
    const sk = `${grading.skyTop}|${grading.skyHorizon}`;
    if (sk !== skyKey) {
      skyPaint(grading.skyTop, grading.skyHorizon, 3, true)(skyCtx, skyCanvas.width, skyCanvas.height);
      background.needsUpdate = true;
      skyKey = sk;
    }
    fog.color.set(grading.fogColor);
    fog.density = grading.fogDensity;
    hemi.color.set(grading.hemiSky);
    hemi.groundColor.set(grading.hemiGround);
    hemi.intensity = grading.hemiIntensity;
    key.color.set(grading.keyColor);
    key.intensity = grading.keyIntensity;
    rim.color.set(grading.rimColor);
    rim.intensity = grading.rimStrength * 0.7;
    puddleMat.emissive.set(grading.skyHorizon);

    // Neon: steady hum, Alfamart's tube stutters twice per loop.
    const hum = 0.92 + 0.08 * loopWave(frame, 90);
    const stutterPhase = loopSaw(frame, 2, 0.3);
    const stutter = stutterPhase > 0.5 && stutterPhase < 0.53 && Math.sin(frame * 3.1) > 0 ? 0.25 : 1;
    const rigs: [StoreRig, number][] = [
      [idm, hum],
      [alf, hum * stutter],
    ];
    for (const [rig, k] of rigs) {
      for (const m of rig.neon) m.color.set(rig === idm ? INDOMARET.neon : ALFAMART.neon).multiplyScalar(k);
      rig.sign.color.setScalar(0.85 + 0.15 * k);
      rig.pylon.color.setScalar(0.88 + 0.12 * k);
      rig.signLight.intensity = 6 * k;
      const g0 = rig.glows[0];
      if (g0) g0.material.opacity = 0.45 * k;
      rig.streaks.forEach((s, i) => {
        s.opacity = (i === 0 ? 0.8 * k : 0.45) * (0.85 + 0.15 * loopWave(frame, 47, i)) * grading.wetness;
      });
    }
    for (const [i, s] of lampStreaks.entries()) s.opacity = 0.7 * grading.wetness * (0.85 + 0.15 * loopWave(frame, 41, i * 2));
    for (const l of [lampL, lampR]) l.glow.material.opacity = 0.75 + 0.05 * loopWave(frame, 120);
    for (const b of blinkers) b.opacity = loopSaw(frame, 30) < 0.5 ? 1 : 0.1;

    // Passing traffic (absent at the loop seam): left→right in the hook, right→left in the payoff.
    const passA = clamp01((frame - 150) / 70);
    const passB = clamp01((frame - 1525) / 75);
    const active = (passA > 0 && passA < 1) || (passB > 0 && passB < 1);
    car.group.visible = active;
    if (active) {
      const forward = passA > 0 && passA < 1;
      const t = forward ? passA : passB;
      const x = forward ? lerp(-16, 16, t) : lerp(16, -16, t);
      car.group.position.set(x, 0, forward ? 4.1 : 1.6);
      car.group.rotation.y = forward ? 0 : Math.PI;
      for (const w of car.wheels) w.rotation.y = -x / 0.33;
      car.streakMat.opacity = 0.4 * grading.wetness;
    }

    drizzle(frame, 60, 0.05);
    rainAt(frame);
    rainMat.opacity = 0.32 * grading.wetness;
    for (const r of ripples) {
      const u = loopSaw(frame, r.cycles, r.phase);
      r.mesh.scale.setScalar(0.05 + u * 0.45);
      r.mat.opacity = (1 - u) * 0.45 * grading.wetness;
    }
    moths(frame, 0, 0.35);
    for (const m of mists) {
      m.sprite.position.x = lerp(-10, 10, loopSaw(frame, m.cycles, m.x));
      m.sprite.material.color.copy(tmp.set(grading.fogColor).lerp(new THREE.Color('#ffffff'), 0.25));
    }
  };

  return { id: 'city', group, background, fog, keyDir: new THREE.Vector3(-7, 10, 9).normalize(), update };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. RUANG KELAS 1929 — teori Hotelling di papan tulis
// ═══════════════════════════════════════════════════════════════════════════

const BOARD_W = 2.3;
const BOARD_H = 1.75;
const BOARD_X = -0.25;
const BOARD_Y = 1.78;
const BACK_Z = -2.3;

interface ChalkItem {
  /** Frames over which the stroke is written on (left → right reveal). */
  from: number;
  to: number;
  draw: (g: CanvasRenderingContext2D) => { x: number; w: number; y: number; h: number };
}

function chalkText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): { x: number; w: number; y: number; h: number } {
  g.font = `${size}px ${CHALK_FONT}`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  // Several jittered low-alpha passes read as dry chalk.
  for (let k = 0; k < 3; k++) {
    g.globalAlpha = 0.5;
    g.fillText(text, x + (k - 1) * 1.2, y + (k % 2) * 1.2);
  }
  g.globalAlpha = 1;
  const w = g.measureText(text).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  return { x: x0, w, y: y - size, h: size * 1.25 };
}

function chalkLine(g: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], color: string, width: number): { x: number; w: number; y: number; h: number } {
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let k = 0; k < 2; k++) {
    g.globalAlpha = 0.6;
    g.lineWidth = width - k * 2;
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x + k, y - k) : g.lineTo(x + k, y - k)));
    g.stroke();
  }
  g.globalAlpha = 1;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs) - width, w: Math.max(...xs) - Math.min(...xs) + width * 2, y: Math.min(...ys) - width, h: Math.max(...ys) - Math.min(...ys) + width * 2 };
}

const CHALK = '#f4f1e6';
const CHALK_YELLOW = '#ffe27a';
const CHALK_BLUE = '#8cc8ff';
const CHALK_PINK = '#ff9aa8';

/** The derivation, written on progressively during the classroom shot. */
const BOARD_ITEMS: readonly ChalkItem[] = [
  { from: 286, to: 318, draw: (g) => chalkText(g, 'HUKUM HOTELLING', 512, 96, 80, CHALK, 'center') },
  { from: 318, to: 328, draw: (g) => chalkText(g, '(1929)', 512, 150, 44, CHALK_YELLOW, 'center') },
  { from: 330, to: 352, draw: (g) => chalkLine(g, [[90, 262], [934, 262]], CHALK, 7) },
  {
    from: 352,
    to: 360,
    draw: (g) => {
      chalkLine(g, [[90, 244], [90, 280]], CHALK, 6);
      chalkLine(g, [[934, 244], [934, 280]], CHALK, 6);
      chalkText(g, '0', 90, 320, 40, CHALK, 'center');
      return chalkText(g, 'L', 934, 320, 40, CHALK, 'center');
    },
  },
  {
    from: 360,
    to: 376,
    draw: (g) => {
      g.setLineDash([12, 12]);
      const r = chalkLine(g, [[512, 210], [512, 300]], CHALK_YELLOW, 5);
      g.setLineDash([]);
      chalkText(g, 'L/2', 512, 196, 38, CHALK_YELLOW, 'center');
      return r;
    },
  },
  {
    from: 376,
    to: 394,
    draw: (g) => {
      g.fillStyle = CHALK_BLUE;
      g.beginPath();
      g.arc(300, 262, 16, 0, Math.PI * 2);
      g.fill();
      chalkText(g, 'A', 300, 232, 40, CHALK_BLUE, 'center');
      chalkLine(g, [[330, 300], [450, 300], [430, 288], [450, 300], [430, 312]], CHALK_BLUE, 5);
      g.fillStyle = CHALK_PINK;
      g.beginPath();
      g.arc(724, 262, 16, 0, Math.PI * 2);
      g.fill();
      chalkText(g, 'B', 724, 232, 40, CHALK_PINK, 'center');
      return chalkLine(g, [[694, 300], [574, 300], [594, 288], [574, 300], [594, 312]], CHALK_PINK, 5);
    },
  },
  { from: 398, to: 422, draw: (g) => chalkText(g, 'Laba A = p·( a + (b−a)/2 )', 80, 420, 50, CHALK) },
  { from: 422, to: 444, draw: (g) => chalkText(g, 'Laba B = p·( L−b + (b−a)/2 )', 80, 494, 50, CHALK) },
  { from: 446, to: 462, draw: (g) => chalkText(g, 'a → b   dan   b → a', 80, 568, 50, CHALK_BLUE) },
  {
    from: 462,
    to: 476,
    draw: (g) => {
      const r = chalkText(g, 'a* = b* = L/2', 512, 664, 66, CHALK_YELLOW, 'center');
      chalkLine(g, [[r.x - 24, r.y - 6], [r.x + r.w + 24, r.y - 6], [r.x + r.w + 24, r.y + r.h + 4], [r.x - 24, r.y + r.h + 4], [r.x - 24, r.y - 6]], CHALK_YELLOW, 5);
      return { x: r.x - 30, w: r.w + 60, y: r.y - 12, h: r.h + 22 };
    },
  },
  { from: 476, to: 492, draw: (g) => chalkText(g, '“Diferensiasi Minimum”', 512, 742, 42, CHALK, 'center') },
];

function slatePaint(g: CanvasRenderingContext2D, w: number, h: number): void {
  vGradient(g, w, h, [
    [0, '#2c3d34'],
    [1, '#22312a'],
  ]);
  // Ghosts of erased lessons + eraser swipes.
  g.save();
  g.globalAlpha = 0.07;
  g.fillStyle = CHALK;
  g.font = `52px ${CHALK_FONT}`;
  g.fillText('∫ f(x) dx   Σ   q = a − bp', 120, 230);
  g.fillText('MC = MR', 640, 560);
  g.restore();
  g.strokeStyle = 'rgba(230, 230, 210, 0.06)';
  for (let k = 0; k < 14; k++) {
    g.lineWidth = 40 + rnd(201, k) * 50;
    g.beginPath();
    const x = rnd(202, k) * w;
    const y = rnd(203, k) * h;
    g.arc(x, y, 80 + rnd(204, k) * 120, 0.2, 1.6);
    g.stroke();
  }
  speckle(g, w, h, 205, 1600, '#e8e6d8', 1.2, 0.18);
}

function buildClassroomBoard(kit: Kit, parent: THREE.Object3D): (frame: number) => void {
  const W = 1024;
  const H = Math.round((W * BOARD_H) / BOARD_W);
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const bctx = base.getContext('2d');
  if (!bctx) throw new Error('Canvas2D context unavailable');
  slatePaint(bctx, W, H);
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext('2d');
  if (!lctx) throw new Error('Canvas2D context unavailable');
  // Chalk breakup mask (punched through the text layer).
  const holes = document.createElement('canvas');
  holes.width = 256;
  holes.height = 256;
  const hctx = holes.getContext('2d');
  if (!hctx) throw new Error('Canvas2D context unavailable');
  speckle(hctx, 256, 256, 207, 2600, '#000', 1.3, 0.85);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas2D context unavailable');
  const tex = kit.track(new THREE.CanvasTexture(out));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  kit.mesh(parent, new THREE.PlaneGeometry(BOARD_W, BOARD_H), kit.toon('#ffffff', tex, { emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.35 }), [BOARD_X, BOARD_Y, BACK_Z + 0.045], { ink: false, receive: true });

  let lastKey = -1;
  return (frame: number) => {
    // Before the shot the board is complete (it is never seen then); keeps repaint count low.
    const f = frame < 270 || frame >= 495 ? 9999 : frame;
    const key = Math.min(f, 500);
    if (key === lastKey) return;
    lastKey = key;
    lctx.clearRect(0, 0, W, H);
    for (const item of BOARD_ITEMS) {
      const r = clamp01((f - item.from) / Math.max(1, item.to - item.from));
      if (r <= 0) continue;
      lctx.save();
      if (r < 1) {
        // Measure, then clip to the written-so-far portion.
        lctx.save();
        lctx.globalAlpha = 0;
        const box = item.draw(lctx);
        lctx.restore();
        lctx.beginPath();
        lctx.rect(box.x - 4, box.y - 30, (box.w + 8) * r, box.h + 60);
        lctx.clip();
      }
      item.draw(lctx);
      lctx.restore();
    }
    lctx.globalCompositeOperation = 'destination-out';
    const pat = lctx.createPattern(holes, 'repeat');
    if (pat) {
      lctx.fillStyle = pat;
      lctx.fillRect(0, 0, W, H);
    }
    lctx.globalCompositeOperation = 'source-over';
    octx.drawImage(base, 0, 0);
    octx.drawImage(layer, 0, 0);
    tex.needsUpdate = true;
  };
}

function woodPaint(seed: number, base: string, dark: string, planks: number, vertical = false): Paint {
  return (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = planks;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * (vertical ? w : h);
      const span = (vertical ? w : h) / n;
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
      if (vertical) g.fillRect(a, 0, span, h);
      else g.fillRect(0, a, w, span);
      // Grain lines.
      g.strokeStyle = dark;
      g.globalAlpha = 0.25;
      g.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const o = a + rnd(seed + i, k) * span;
        for (let t = 0; t <= 1.001; t += 0.05) {
          const wob = Math.sin(t * 12 + k + i) * 2.5;
          if (vertical) g.lineTo(o + wob, t * h);
          else g.lineTo(t * w, o + wob);
        }
        g.stroke();
      }
      g.globalAlpha = 0.7;
      g.lineWidth = 3;
      g.beginPath();
      if (vertical) {
        g.moveTo(a, 0);
        g.lineTo(a, h);
      } else {
        g.moveTo(0, a);
        g.lineTo(w, a);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    brush(g, w, h, seed + 50, 260, [dark, '#fff2d8'], 0.08, 30, 6);
  };
}

export function createClassroomWorld(kit: Kit): WorldScene {
  const group = new THREE.Group();
  group.name = 'world-classroom';
  const fog = new THREE.FogExp2('#20160f', 0.03);
  const background = kit.canvas(270, 480, skyPaint('#120c09', '#22160f', 9, false));

  const hemi = new THREE.HemisphereLight('#6a5040', '#1c120c', 0.38);
  group.add(hemi);

  // Room shell.
  const floorMat = kit.toon('#8a5a36', kit.canvas(512, 512, woodPaint(301, '#9a6a42', '#4a2a18', 8), { repeat: [3, 3] }));
  kit.mesh(group, new THREE.PlaneGeometry(10, 9), floorMat, [0, 0, 1.5], { ink: false, rot: [-Math.PI / 2, 0, 0] });
  const wallMat = kit.toon('#cdb48a', kit.canvas(512, 512, plasterPaint(303, '#d6bf93'), { repeat: [2, 1] }));
  kit.mesh(group, new THREE.PlaneGeometry(10, 4.4), wallMat, [0, 2.2, BACK_Z], { ink: false });
  for (const s of [-1, 1]) kit.mesh(group, new THREE.PlaneGeometry(9, 4.4), wallMat, [s * 3.4, 2.2, 2.2], { ink: false, rot: [0, -s * Math.PI / 2, 0] });
  kit.mesh(group, new THREE.PlaneGeometry(10, 9), kit.toon('#3a2a20'), [0, 3.8, 1.5], { ink: false, rot: [Math.PI / 2, 0, 0] });

  // Wainscot panels, chair rail, baseboard and crown moulding.
  const panelWood = kit.toon('#6b3f22', kit.canvas(256, 256, woodPaint(305, '#7a4a2a', '#3a1e10', 1, true)));
  const trimWood = kit.toon('#5a331b');
  kit.box(group, [10, 1.0, 0.05], panelWood, [0, 0.5, BACK_Z + 0.03], { ink: false });
  for (let k = -6; k <= 6; k++) kit.box(group, [0.62, 0.62, 0.03], panelWood, [k * 0.78, 0.52, BACK_Z + 0.07], { ink: 0.008 });
  kit.box(group, [10, 0.07, 0.09], trimWood, [0, 1.02, BACK_Z + 0.07]);
  kit.box(group, [10, 0.14, 0.06], trimWood, [0, 0.07, BACK_Z + 0.06], { ink: false });
  kit.box(group, [10, 0.16, 0.14], trimWood, [0, 3.62, BACK_Z + 0.07]);
  kit.box(group, [10, 0.05, 0.2], trimWood, [0, 3.52, BACK_Z + 0.1], { ink: false });

  // Chalkboard: chalk-textured slate in a moulded oak frame with a tray.
  const updateBoard = buildClassroomBoard(kit, group);
  const oak = kit.toon('#8b5a2b', kit.canvas(256, 64, woodPaint(307, '#946036', '#4a2a14', 2)));
  const fw = 0.1;
  kit.box(group, [BOARD_W + 2 * fw, fw, 0.08], oak, [BOARD_X, BOARD_Y + BOARD_H / 2 + fw / 2, BACK_Z + 0.06], { shadow: true });
  kit.box(group, [BOARD_W + 2 * fw, fw, 0.08], oak, [BOARD_X, BOARD_Y - BOARD_H / 2 - fw / 2, BACK_Z + 0.06]);
  for (const s of [-1, 1]) kit.box(group, [fw, BOARD_H, 0.08], oak, [BOARD_X + s * (BOARD_W / 2 + fw / 2), BOARD_Y, BACK_Z + 0.06]);
  kit.box(group, [BOARD_W + 0.1, 0.04, 0.14], oak, [BOARD_X, BOARD_Y - BOARD_H / 2 - 0.1, BACK_Z + 0.12], { shadow: true });
  const chalkMat = kit.toon('#f6f3ea');
  for (let k = 0; k < 4; k++) kit.box(group, [0.08, 0.018, 0.018], k === 2 ? kit.toon('#ffe27a') : chalkMat, [BOARD_X - 0.8 + k * 0.14, BOARD_Y - BOARD_H / 2 - 0.07, BACK_Z + 0.13], { ink: 0.003, rot: [0, k * 0.4, 0] });
  kit.box(group, [0.2, 0.05, 0.07], kit.toon('#3a2a20'), [BOARD_X + 0.7, BOARD_Y - BOARD_H / 2 - 0.055, BACK_Z + 0.13], { ink: 0.004 });
  kit.box(group, [0.2, 0.02, 0.07], kit.toon('#cfc7b8'), [BOARD_X + 0.7, BOARD_Y - BOARD_H / 2 - 0.09, BACK_Z + 0.13], { ink: false });

  // Wall dressing: 1929 calendar, the 1929 paper pinned up, a framed portrait.
  kit.mesh(group, new THREE.PlaneGeometry(0.42, 0.58), kit.toon('#ffffff', kit.canvas(200, 276, (g, w, h) => {
    g.fillStyle = '#efe4c8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#8b1a1a';
    g.fillRect(0, 0, w, 60);
    g.fillStyle = '#efe4c8';
    g.font = `700 34px ${ERA_FONT.editorial}`;
    g.textAlign = 'center';
    g.fillText('MARET', w / 2, 44);
    g.fillStyle = '#2a1a10';
    g.font = `900 64px ${ERA_FONT.editorial}`;
    g.fillText('1929', w / 2, 130);
    g.font = `20px ${ERA_FONT.editorial}`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) g.fillText(String(r * 7 + c + 1), 22 + c * 26, 170 + r * 26);
  })), [-2.05, 2.25, BACK_Z + 0.03], { ink: 0.008, rot: [0, 0, 0.03] });
  kit.mesh(group, new THREE.PlaneGeometry(0.5, 0.66), kit.toon('#ffffff', kit.canvas(220, 290, (g, w, h) => {
    g.fillStyle = '#f2ead6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1a10';
    g.textAlign = 'center';
    g.font = `700 18px ${ERA_FONT.editorial}`;
    g.fillText('THE ECONOMIC', w / 2, 34);
    g.fillText('JOURNAL', w / 2, 56);
    g.font = `italic 700 24px ${ERA_FONT.editorial}`;
    g.fillText('Stability in', w / 2, 112);
    g.fillText('Competition', w / 2, 140);
    g.font = `16px ${ERA_FONT.editorial}`;
    g.fillText('HAROLD HOTELLING', w / 2, 180);
    g.fillText('— 1929 —', w / 2, 204);
    g.fillStyle = 'rgba(42,26,16,0.35)';
    for (let k = 0; k < 4; k++) g.fillRect(30, 222 + k * 14, w - 60, 4);
  })), [1.62, 2.3, BACK_Z + 0.03], { ink: 0.008, rot: [0, 0, -0.04] });
  kit.box(group, [0.03, 0.03, 0.03], kit.toon('#b91c1c'), [1.62, 2.6, BACK_Z + 0.05], { ink: false });

  // Arched window on the right wall: cool moonlight rim + volumetric shaft.
  const winGroup = new THREE.Group();
  winGroup.position.set(3.38, 2.1, -0.6);
  winGroup.rotation.y = -Math.PI / 2;
  group.add(winGroup);
  kit.mesh(winGroup, new THREE.PlaneGeometry(1.1, 1.8), kit.basic({ map: kit.canvas(128, 210, (g, w, h) => {
    vGradient(g, w, h, [
      [0, '#3a4c7a'],
      [1, '#7d93c4'],
    ]);
    g.fillStyle = '#e8eeff';
    g.beginPath();
    g.arc(w * 0.7, h * 0.22, 12, 0, Math.PI * 2);
    g.fill();
  }) }), [0, 0, 0], { ink: false });
  for (const x of [-0.55, 0, 0.55]) kit.box(winGroup, [0.06, 1.85, 0.08], trimWood, [x, 0, 0.03]);
  for (const y of [-0.9, 0, 0.9]) kit.box(winGroup, [1.16, 0.06, 0.08], trimWood, [0, y, 0.03]);
  const moon = new THREE.DirectionalLight('#9cc4ff', 0.6);
  moon.position.set(6, 3.5, -1.2);
  moon.target.position.set(0.5, 0.8, -1.2);
  group.add(moon, moon.target);
  const shaftTex = kit.canvas(64, 256, (g, w, h) => {
    vGradient(g, w, h, [
      [0, 'rgba(255,255,255,0.9)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  });
  const shaft = kit.mesh(group, new THREE.PlaneGeometry(1.2, 4.2), kit.additive('#9cc4ff', shaftTex, 0.1), [2.0, 1.3, -0.6], { ink: false, rot: [0, -Math.PI / 2, 1.05] });
  shaft.renderOrder = 4;

  // Vintage enamel pendant lamp — the Rembrandt key light.
  const lampPivot = new THREE.Group();
  lampPivot.position.set(-0.75, 3.8, 0.15);
  group.add(lampPivot);
  kit.mesh(lampPivot, new THREE.CylinderGeometry(0.008, 0.008, 0.82, 6), kit.basic({ color: '#120c08' }), [0, -0.41, 0], { ink: false });
  kit.mesh(lampPivot, new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16), kit.toon('#7a5a2a'), [0, -0.84, 0]);
  const shadeGeo = new THREE.ConeGeometry(0.34, 0.26, 40, 1, true);
  kit.mesh(lampPivot, shadeGeo, kit.toon('#2f5a3e', null, { side: THREE.FrontSide }), [0, -0.98, 0], { ink: 0.01 });
  kit.mesh(lampPivot, new THREE.ConeGeometry(0.335, 0.255, 40, 1, true), kit.basic({ color: '#fff1d0', side: THREE.BackSide }), [0, -0.98, 0], { ink: false });
  kit.mesh(lampPivot, new THREE.TorusGeometry(0.34, 0.012, 6, 40), kit.toon('#d8c48a'), [0, -1.11, 0], { ink: false, rot: [Math.PI / 2, 0, 0] });
  kit.mesh(lampPivot, new THREE.SphereGeometry(0.075, 16, 12), kit.basic({ color: '#fff6dc' }), [0, -1.06, 0], { ink: false });
  const bulbGlow = kit.glow(lampPivot, '#ffcf8a', 1.5, [0, -1.08, 0], 0.85);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0.7, 0.9, -1.6);
  group.add(lampTarget);
  const key = new THREE.SpotLight('#ffcf8a', 30, 9, 0.85, 0.55, 1.2);
  key.position.set(0, -1.06, 0);
  key.target = lampTarget;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  lampPivot.add(key);
  const beam = beamCone(kit, lampPivot, '#ffcf8a', 1.25, 2.6, [0, -1.08, 0], 0.07);

  // Props: teacher desk with books & globe, foreground student desks, coat rack.
  const deskWood = kit.toon('#6b3f22', kit.canvas(256, 128, woodPaint(311, '#7a4a2a', '#3a1e10', 3)));
  const desk = new THREE.Group();
  desk.position.set(-1.85, 0, -1.1);
  group.add(desk);
  kit.box(desk, [1.3, 0.06, 0.66], deskWood, [0, 0.78, 0], { shadow: true });
  for (const [x, z] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]] as const) kit.box(desk, [0.07, 0.76, 0.07], deskWood, [x, 0.38, z]);
  kit.box(desk, [1.2, 0.28, 0.04], deskWood, [0, 0.6, 0.3]);
  const bookCols = ['#7f1d1d', '#1e3a8a', '#14532d', '#78350f'];
  bookCols.forEach((c, i) => kit.box(desk, [0.36, 0.06, 0.26], kit.toon(c), [-0.35, 0.84 + i * 0.062, 0], { shadow: true, rot: [0, i * 0.15, 0], ink: 0.006 }));
  kit.mesh(desk, new THREE.SphereGeometry(0.16, 24, 16), kit.toon('#4c8ac9', kit.canvas(256, 128, (g, w, h) => {
    g.fillStyle = '#4c8ac9';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9a85a';
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      g.ellipse(rnd(313, k) * w, 20 + rnd(314, k) * (h - 40), 12 + rnd(315, k) * 26, 8 + rnd(316, k) * 18, rnd(317, k) * 3, 0, Math.PI * 2);
      g.fill();
    }
  })), [0.35, 1.11, 0], { shadow: true });
  kit.mesh(desk, new THREE.TorusGeometry(0.18, 0.01, 6, 32, Math.PI), kit.toon('#c9a85a'), [0.35, 1.11, 0], { ink: false, rot: [0, 0, 0.4] });
  kit.mesh(desk, new THREE.CylinderGeometry(0.02, 0.06, 0.15, 10), kit.toon('#c9a85a'), [0.35, 0.89, 0]);
  kit.mesh(desk, new THREE.CylinderGeometry(0.035, 0.04, 0.06, 10), kit.toon('#111827'), [0.05, 0.84, 0.1]);
  for (let k = -1; k <= 1; k++) {
    const sd = new THREE.Group();
    sd.position.set(k * 1.25, 0, 1.65);
    group.add(sd);
    kit.box(sd, [0.95, 0.05, 0.5], deskWood, [0, 0.74, 0], { shadow: true });
    kit.box(sd, [0.9, 0.3, 0.04], deskWood, [0, 0.58, -0.23]);
    for (const x of [-0.42, 0.42]) kit.box(sd, [0.05, 0.72, 0.05], kit.toon('#2a1a10'), [x, 0.36, 0]);
    kit.mesh(sd, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), kit.toon('#111827'), [0.3, 0.79, -0.1]);
  }
  kit.mesh(group, new THREE.CylinderGeometry(0.025, 0.04, 1.8, 10), trimWood, [2.6, 0.9, -1.7], { shadow: true });
  kit.mesh(group, new THREE.CylinderGeometry(0.16, 0.2, 0.1, 16), kit.toon('#3f2a1a'), [2.6, 1.84, -1.7]);
  kit.mesh(group, new THREE.CylinderGeometry(0.11, 0.12, 0.1, 16), kit.toon('#3f2a1a'), [2.6, 1.92, -1.7]);

  // Chalk dust drifting through the lamp beam.
  const dust = driftParticles(kit, group, 260, { min: [-1.6, 0.4, -1.8], max: [1.2, 2.8, 0.8] }, '#ffe2b0', 0.025, 0.7, 401);

  const update = ({ frame, grading }: WorldUpdate): void => {
    fog.color.set(grading.fogColor);
    fog.density = grading.fogDensity;
    hemi.color.set(grading.hemiSky);
    hemi.groundColor.set(grading.hemiGround);
    hemi.intensity = grading.hemiIntensity;
    moon.intensity = grading.rimStrength * 0.9;
    // Gentle pendulum sway (integer cycles per loop) makes the light breathe.
    lampPivot.rotation.z = loopWave(frame, 18) * 0.035;
    lampPivot.rotation.x = loopWave(frame, 11, 1.3) * 0.02;
    const flicker = 0.96 + 0.04 * loopWave(frame, 210) * loopWave(frame, 77);
    key.intensity = 30 * flicker;
    bulbGlow.material.opacity = 0.85 * flicker;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.07 * flicker;
    updateBoard(frame);
    dust(frame, 0, 0.25);
  };

  return { id: 'classroom', group, background, fog, keyDir: new THREE.Vector3(-0.6, 0.75, 0.3).normalize(), update };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PANTAI — simulasi dua gerobak es krim
// ═══════════════════════════════════════════════════════════════════════════

const SHORE_Z = -2.1;

function sandPaint(seed: number): Paint {
  return (g, w, h) => {
    g.fillStyle = '#e8c88e';
    g.fillRect(0, 0, w, h);
    brush(g, w, h, seed, 900, ['#f4dcaa', '#d6b075', '#efd29c', '#c99e62'], 0.28, 34, 9);
    // Wind ripples.
    g.strokeStyle = 'rgba(160, 110, 60, 0.22)';
    g.lineWidth = 2;
    for (let k = 0; k < 40; k++) {
      const y = rnd(seed + 7, k) * h;
      const x = rnd(seed + 8, k) * w;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + 30, y - 6, x + 60, y + 6, x + 100, y);
      g.stroke();
    }
    speckle(g, w, h, seed + 9, 1800, '#8a6a44', 1.1, 0.4);
    speckle(g, w, h, seed + 10, 900, '#fff6e0', 1.0, 0.6);
  };
}

function stripedPaint(a: string, b: string, n: number, horizontal: boolean, seed: number): Paint {
  return (g, w, h) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? b : a;
      if (horizontal) g.fillRect(0, (i / n) * h, w, h / n + 1);
      else g.fillRect((i / n) * w, 0, w / n + 1, h);
    }
    brush(g, w, h, seed, 140, ['#000000', '#ffffff'], 0.05, 30, 6);
  };
}

interface CartRig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  hero: THREE.Object3D;
}

function buildCart(kit: Kit, parent: THREE.Object3D, color: string, accent: string, handleSide: number, seed: number): CartRig {
  const g = new THREE.Group();
  parent.add(g);
  const body = kit.toon(color);
  const cream = kit.toon('#fbf4e4');
  const wood = kit.toon('#9a6234', kit.canvas(128, 128, woodPaint(seed, '#a86b3a', '#4a2a14', 3)));
  const iron = kit.toon('#3a3640');
  const WHEEL_R = 0.3;

  // Body with rounded edges, cream trim and a painted side panel.
  kit.mesh(g, new RoundedBoxGeometry(1.15, 0.72, 0.66, 4, 0.07), body, [0, 0.72, 0], { shadow: true, ink: 0.014 });
  kit.box(g, [1.19, 0.07, 0.7], cream, [0, 1.1, 0], { shadow: true });
  kit.box(g, [1.19, 0.06, 0.7], cream, [0, 0.38, 0]);
  const panel = kit.canvas(512, 300, (c, w, h) => {
    c.fillStyle = '#fbf4e4';
    c.beginPath();
    c.roundRect(10, 10, w - 20, h - 20, 40);
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 12;
    c.stroke();
    // Ice-cream cone emblem.
    c.fillStyle = '#d99a52';
    c.beginPath();
    c.moveTo(90, 150);
    c.lineTo(150, 150);
    c.lineTo(120, 260);
    c.closePath();
    c.fill();
    c.strokeStyle = '#a8662a';
    c.lineWidth = 4;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.moveTo(92 + k * 15, 150);
      c.lineTo(120 + k * 6, 250);
      c.stroke();
    }
    c.fillStyle = accent;
    c.beginPath();
    c.arc(120, 125, 42, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(106, 110, 12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.font = `italic 900 92px ${SIGN_FONT}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('ES', 190, 110);
    c.fillText('KRIM', 190, 200);
    brush(c, w, h, seed, 120, ['#000000', '#ffffff'], 0.05, 30, 6);
  });
  kit.mesh(g, new THREE.PlaneGeometry(0.86, 0.5), kit.toon('#ffffff', panel), [0, 0.74, 0.335], { ink: false });
  kit.mesh(g, new THREE.PlaneGeometry(0.86, 0.5), kit.toon('#ffffff', panel), [0, 0.74, -0.335], { ink: false, rot: [0, Math.PI, 0] });
  // Freezer lids.
  for (const x of [-0.27, 0.27]) {
    kit.mesh(g, new RoundedBoxGeometry(0.48, 0.06, 0.52, 3, 0.02), kit.toon('#d6dde6'), [x, 1.17, 0]);
    kit.box(g, [0.14, 0.03, 0.04], iron, [x, 1.21, 0.18], { ink: 0.004 });
  }

  // Spoked wooden wheels with iron rims (axle along z, they roll along x).
  const wheels: THREE.Object3D[] = [];
  for (const z of [-0.4, 0.4]) {
    const w = new THREE.Group();
    w.position.set(handleSide * -0.22, WHEEL_R, z);
    g.add(w);
    kit.mesh(w, new THREE.TorusGeometry(WHEEL_R - 0.02, 0.032, 10, 32), iron, [0, 0, 0], { shadow: true, ink: 0.008 });
    kit.mesh(w, new THREE.TorusGeometry(WHEEL_R - 0.065, 0.03, 8, 28), wood, [0, 0, 0], { ink: false });
    for (let k = 0; k < 8; k++) {
      const spoke = kit.box(w, [0.035, WHEEL_R * 1.75, 0.03], wood, [0, 0, 0], { ink: 0.004 });
      spoke.rotation.z = (k / 8) * Math.PI;
    }
    kit.mesh(w, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 14), wood, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ink: 0.006 });
    kit.mesh(w, new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), iron, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ink: false });
    wheels.push(w);
  }
  kit.mesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), iron, [handleSide * -0.22, WHEEL_R, 0], { rot: [Math.PI / 2, 0, 0], ink: false });
  // Stand legs on the far end; push handle on the vendor's end (−handleSide · x),
  // grip at hand height of the bean-head rig (0.8 m) so both palms rest on it.
  kit.box(g, [0.05, 0.4, 0.05], iron, [handleSide * 0.48, 0.2, 0.22]);
  kit.box(g, [0.05, 0.4, 0.05], iron, [handleSide * 0.48, 0.2, -0.22]);
  const gripX = handleSide * -1.0;
  const gripY = 0.8;
  const barFrom: readonly [number, number] = [handleSide * -0.55, 0.96];
  const barLen = Math.hypot(gripX - barFrom[0], gripY - barFrom[1]);
  const barAng = Math.atan2(gripY - barFrom[1], gripX - barFrom[0]);
  for (const z of [-0.26, 0.26]) {
    kit.box(g, [barLen, 0.04, 0.04], iron, [(barFrom[0] + gripX) / 2, (barFrom[1] + gripY) / 2, z], { rot: [0, 0, barAng] });
  }
  kit.mesh(g, new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10), kit.toon('#1c1917'), [gripX, gripY, 0], { rot: [Math.PI / 2, 0, 0] });
  // Rubber hand grips.
  for (const z of [-0.2, 0.2]) kit.mesh(g, new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10), kit.toon(accent), [gripX, gripY, z], { rot: [Math.PI / 2, 0, 0], ink: 0.006 });

  // Arched striped canopy on four poles, scalloped valances front and back.
  for (const x of [-0.52, 0.52]) for (const z of [-0.3, 0.3]) kit.mesh(g, new THREE.CylinderGeometry(0.018, 0.018, 0.82, 8), cream, [x, 1.55, z], { ink: 0.005 });
  const stripes = kit.canvas(256, 512, stripedPaint(color, '#fbf4e4', 10, true, seed + 1));
  const arch = new THREE.CylinderGeometry(0.46, 0.46, 1.36, 32, 1, true, 0, Math.PI);
  arch.rotateZ(Math.PI / 2);
  arch.scale(1, 0.55, 1);
  kit.mesh(g, arch, kit.toon('#ffffff', stripes, { side: THREE.DoubleSide }), [0, 1.94, 0], { shadow: true, ink: 0.014 });
  const scallop = kit.canvas(512, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const n = 10;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? '#fbf4e4' : color;
      const x0 = (i / n) * w;
      c.beginPath();
      c.moveTo(x0, 0);
      c.lineTo(x0 + w / n, 0);
      c.lineTo(x0 + w / n, h * 0.45);
      c.quadraticCurveTo(x0 + w / n / 2, h * 1.05, x0, h * 0.45);
      c.closePath();
      c.fill();
      c.strokeStyle = PLUM;
      c.lineWidth = 4;
      c.stroke();
    }
  });
  for (const z of [-0.46, 0.46]) kit.mesh(g, new THREE.PlaneGeometry(1.36, 0.14), kit.toon('#ffffff', scallop, { transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), [0, 1.88, z], { ink: false });

  // Hero prop: a giant double-scoop cone on the canopy crest.
  const hero = new THREE.Group();
  hero.position.set(0, 2.2, 0);
  g.add(hero);
  const waffle = kit.canvas(128, 128, (c, w, h) => {
    c.fillStyle = '#d99a52';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#9a5f26';
    c.lineWidth = 5;
    for (let k = -8; k < 16; k++) {
      c.beginPath();
      c.moveTo(k * 16, 0);
      c.lineTo(k * 16 + h, h);
      c.moveTo(k * 16, h);
      c.lineTo(k * 16 + h, 0);
      c.stroke();
    }
  });
  kit.mesh(hero, new THREE.ConeGeometry(0.13, 0.36, 24), kit.toon('#ffffff', waffle), [0, 0.0, 0], { rot: [Math.PI, 0, 0], ink: 0.01 });
  kit.mesh(hero, new THREE.SphereGeometry(0.15, 24, 18), kit.toon(accent), [0, 0.22, 0], { ink: 0.01, shadow: true });
  kit.mesh(hero, new THREE.SphereGeometry(0.13, 24, 18), kit.toon('#fff1d6'), [0, 0.42, 0], { ink: 0.01 });
  kit.mesh(hero, new THREE.SphereGeometry(0.035, 12, 10), kit.toon('#e11d48'), [0.03, 0.56, 0], { ink: 0.006 });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    kit.mesh(hero, new THREE.CapsuleGeometry(0.022, 0.06, 4, 8), kit.toon(accent), [Math.cos(a) * 0.12, 0.13, Math.sin(a) * 0.12], { ink: 0.004 });
  }
  return { group: g, wheels, hero };
}

function buildPalm(kit: Kit, parent: THREE.Object3D, pos: Vec3, height: number, lean: number, seed: number, leafTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  parent.add(g);
  const top = new THREE.Vector3(lean * height * 0.35, height, 0);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * height * 0.05, height * 0.55, 0), top);
  const trunkTex = kit.canvas(64, 256, (c, w, h) => {
    c.fillStyle = '#8a6440';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 14) {
      c.fillStyle = '#5e4028';
      c.fillRect(0, y, w, 4);
    }
    brush(c, w, h, seed, 60, ['#a88058', '#4a3020'], 0.3, 14, 4);
  }, { repeat: [1, 4] });
  kit.mesh(g, new THREE.TubeGeometry(curve, 24, 0.13, 10, false), kit.toon('#ffffff', trunkTex), [0, 0, 0], { shadow: true, ink: false });
  const crown = new THREE.Group();
  crown.position.copy(top);
  g.add(crown);
  const leafMat = kit.toon('#3f8a3a', leafTex, { side: THREE.DoubleSide, alphaTest: 0.5, transparent: false });
  for (let k = 0; k < 8; k++) {
    const geo = new THREE.PlaneGeometry(2.0, 0.55, 12, 1);
    const p = geo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 1.0;
      p.setX(i, x);
      p.setZ(i, -0.28 * x * x);
    }
    geo.computeVertexNormals();
    const leaf = kit.mesh(crown, geo, leafMat, [0, 0, 0], { ink: false, shadow: true });
    leaf.rotation.set(-Math.PI / 2 + 0.25, (k / 8) * Math.PI * 2 + rnd(seed, k) * 0.4, 0, 'YXZ');
  }
  for (let k = 0; k < 3; k++) kit.mesh(crown, new THREE.SphereGeometry(0.09, 12, 10), kit.toon('#5a3a1e'), [Math.cos(k * 2.1) * 0.12, -0.12, Math.sin(k * 2.1) * 0.12], { ink: 0.006 });
  crown.userData.seed = seed;
  return crown;
}

/** Tourist card scale (bean-head chibi on a towel reads ~0.55 m seated, ~0.8 m standing). */
const TOURIST_SCALE = 0.56;
const CROWD_VARIANTS = 18;

interface CrowdRig {
  /** Billboards every card to the camera (with drone-view lean), breath and decision hops. */
  update: (frame: number, camera: THREE.Vector3, place: (i: number, out: THREE.Vector3) => void, hop: (i: number) => number) => void;
}

function buildBeachCrowd(kit: Kit, parent: THREE.Object3D, tz: readonly number[]): CrowdRig {
  const n = tz.length;
  const geo = kit.track(createExtraCardGeometry());
  const light = { side: -1 as const, rim: '#ffd36b', rimStrength: 0.7 };
  const expressions: readonly Expression[] = ['warm', 'laugh', 'wonder', 'smirk', 'neutral', 'warm'];
  const postureOf = (vi: number): ExtraPosture => (vi % 5 === 0 ? 'stand' : vi % 3 === 0 ? 'lounge' : 'sit');
  const seated = Array.from({ length: CROWD_VARIANTS }, (_, vi) => vi).filter((vi) => postureOf(vi) !== 'stand');
  // Neighbours never share a variant; the rows nearest the lens (z > 0) stay
  // seated so they frame the carts instead of blocking them.
  const variantOf: number[] = [];
  for (let i = 0; i < n; i++) {
    const front = (tz[i] ?? 0) > 0;
    const pool = front ? seated : Array.from({ length: CROWD_VARIANTS }, (_, vi) => vi);
    let vi = pool[Math.floor(rnd(810, i) * pool.length)] ?? 1;
    for (let tries = 0; tries < 4 && (vi === variantOf[i - 1] || vi === variantOf[i - 2]); tries++) vi = pool[(pool.indexOf(vi) + 1 + tries) % pool.length] ?? vi;
    variantOf.push(vi);
  }
  const meshes: { mesh: THREE.InstancedMesh; members: number[] }[] = [];
  for (let vi = 0; vi < CROWD_VARIANTS; vi++) {
    const members = variantOf.map((x, i) => (x === vi ? i : -1)).filter((i) => i >= 0);
    if (members.length === 0) continue;
    const posture = postureOf(vi);
    const armRoll = rnd(811, vi);
    const armR: ArmPose = posture === 'stand' ? (armRoll < 0.4 ? 'wave' : armRoll < 0.7 ? 'hip' : 'side') : armRoll < 0.25 ? 'wave' : armRoll < 0.45 ? 'open' : 'side';
    const armL: ArmPose = posture === 'stand' && armRoll > 0.7 ? 'hip' : 'side';
    const spec: ExtraSpec = {
      look: beachExtraLook(vi),
      posture,
      expression: expressions[vi % expressions.length] ?? 'warm',
      armL,
      armR,
      look3: (rnd(812, vi) - 0.5) * 1.4,
      // Mid-blink-free moments (blinks sit at k·100 + 12…74 + 9).
      frame: 4 + vi * 100,
      seed: 300 + vi * 17,
    };
    const tex = kit.canvas(EXTRA_CARD_PX.w, EXTRA_CARD_PX.h, (g) => paintExtra(g, spec, light));
    const mat = kit.toon('#ffffff', tex, { alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.14 });
    const mesh = new THREE.InstancedMesh(geo, mat, members.length);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = kit.track(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 }));
    mesh.frustumCulled = false;
    mesh.name = `crowd-${vi}`;
    parent.add(mesh);
    meshes.push({ mesh, members });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  return {
    update(frame, camera, place, hop) {
      for (const { mesh, members } of meshes) {
        members.forEach((i, k) => {
          place(i, p);
          const yaw = Math.atan2(camera.x - p.x, camera.z - p.z);
          const pitch = billboardPitch(camera, p, TOURIST_SCALE);
          // Tiny per-tourist sway so the crowd breathes.
          e.set(-pitch, yaw, loopWave(frame, 7 + (i % 4), i) * 0.025);
          q.setFromEuler(e);
          const breath = 1 + loopWave(frame, 13, i * 0.7) * 0.012;
          s.set(TOURIST_SCALE, TOURIST_SCALE * breath, TOURIST_SCALE);
          p.y += hop(i) * 0.09;
          mesh.setMatrixAt(k, m4.compose(p, q, s));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

export function createBeachWorld(kit: Kit): WorldScene {
  const group = new THREE.Group();
  group.name = 'world-beach';
  const fog = new THREE.FogExp2('#cdeefc', 0.012);
  const background = kit.canvas(270, 480, skyPaint('#2f8fe0', '#bfe9ff', 21, false));

  // Sky dome with vertex-colour gradient, repainted when the grade changes.
  const skyGeo = new THREE.SphereGeometry(90, 32, 18);
  const skyCol = new Float32Array(skyGeo.attributes.position!.count * 3);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  kit.mesh(group, skyGeo, kit.basic({ vertexColors: true, side: THREE.BackSide, fog: false }), [0, 0, 0], { ink: false, receive: false });
  let skyKey = '';
  const sun = kit.glow(group, '#fff3c4', 26, [-30, 22, -70], 0.9);
  sun.material.fog = false;
  const sunDisk = kit.mesh(group, new THREE.CircleGeometry(3.2, 32), kit.basic({ color: '#fff6da', fog: false }), [-30, 22, -71], { ink: false });
  sunDisk.lookAt(0, 0, 0);
  const cloudTex = kit.canvas(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) {
      const x = w * 0.15 + rnd(501, k) * w * 0.7;
      const y = h * 0.45 + rnd(502, k) * h * 0.25;
      const r = 40 + rnd(503, k) * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    brush(g, w, h, 504, 80, ['rgba(255,255,255,0.6)'], 0.2, 50, 18);
  });
  const clouds: { s: THREE.Sprite; x: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const mat = kit.track(new THREE.SpriteMaterial({ map: cloudTex, color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    const s = new THREE.Sprite(mat);
    s.scale.set(26 + rnd(511, k) * 14, 10, 1);
    s.position.set(0, 14 + rnd(512, k) * 12, -60 - rnd(513, k) * 15);
    group.add(s);
    clouds.push({ s, x: rnd(514, k) });
  }

  // Lights.
  const hemi = new THREE.HemisphereLight('#9fd8ff', '#e7c98f', 0.9);
  group.add(hemi);
  const key = new THREE.DirectionalLight('#fff2cc', 2.0);
  key.position.set(-8, 12, 7);
  key.target.position.set(0, 0, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 1024);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.0006;
  group.add(key, key.target);
  const rim = new THREE.DirectionalLight('#ffffff', 0.6);
  rim.position.set(6, 4, -10);
  group.add(rim);

  // Sand: gently duned living-painting surface.
  const sandCenter = SHORE_Z + 17;
  const sandGeo = new THREE.PlaneGeometry(80, 34, 80, 34);
  const sp = sandGeo.attributes.position!;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    // Plane local +y maps to world −z once laid flat.
    const zWorld = sandCenter - sp.getY(i);
    const dune = Math.sin(x * 0.35) * 0.12 + Math.sin(x * 0.11 + 1) * 0.25;
    sp.setZ(i, dune * smoothstep(5, 12, zWorld));
  }
  sandGeo.computeVertexNormals();
  const sandMat = kit.toon('#ffffff', kit.canvas(1024, 1024, sandPaint(601), { repeat: [10, 4] }));
  kit.mesh(group, sandGeo, sandMat, [0, 0, sandCenter], { ink: false, rot: [-Math.PI / 2, 0, 0] });
  // Wet sand band at the waterline.
  const wetMat = kit.toon('#b88c5a', null, { transparent: true, opacity: 0.55 });
  kit.mesh(group, new THREE.PlaneGeometry(80, 1.6), wetMat, [0, 0.004, SHORE_Z + 0.55], { ink: false, rot: [-Math.PI / 2, 0, 0] });

  // Sea: CPU-displaced rolling swell, toon banded, deep → turquoise.
  const seaGeo = new THREE.PlaneGeometry(120, 46, 120, 46);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(0, -0.04, SHORE_Z - 23);
  const seaPos = seaGeo.attributes.position!;
  const seaBase = Float32Array.from(seaPos.array as ArrayLike<number>);
  const seaCol = new Float32Array(seaPos.count * 3);
  const deep = new THREE.Color('#0d4f86');
  const shallow = new THREE.Color('#33c6c2');
  const c = new THREE.Color();
  for (let i = 0; i < seaPos.count; i++) {
    const z = seaBase[i * 3 + 2] ?? 0;
    c.copy(shallow).lerp(deep, smoothstep(SHORE_Z, SHORE_Z - 16, z));
    seaCol.set([c.r, c.g, c.b], i * 3);
  }
  seaGeo.setAttribute('color', new THREE.BufferAttribute(seaCol, 3));
  const seaMat = kit.toon('#ffffff', null, { vertexColors: true });
  kit.mesh(group, seaGeo, seaMat, [0, 0, 0], { ink: false, receive: false });
  // Foam lace rolling in and out.
  const foamTex = kit.canvas(1024, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(0, 0);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.35 + 0.3 * rnd(611, x)));
    g.lineTo(w, 0);
    g.closePath();
    g.fill();
    speckle(g, w, h * 0.8, 612, 700, '#ffffff', 2.2, 0.9);
  }, { repeat: [4, 1] });
  const foams: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const mat = kit.basic({ map: foamTex, transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = kit.mesh(group, new THREE.PlaneGeometry(80, 0.6), mat, [0, 0.02 + k * 0.004, SHORE_Z], { ink: false, rot: [-Math.PI / 2, 0, 0] });
    foams.push({ mesh, mat, phase: k / 3 });
  }
  // Sun glitter on the water.
  const glitter = driftParticles(kit, group, 160, { min: [-14, 0.04, SHORE_Z - 16], max: [10, 0.06, SHORE_Z - 2] }, '#fff6d0', 0.12, 0.8, 621);
  // Distant islands and a sailboat.
  const islandMat = kit.basic({ color: '#5f8fa8' });
  for (const [x, w, h] of [[18, 14, 2.6], [-24, 10, 1.8], [34, 8, 1.2]] as const) {
    const geo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = kit.mesh(group, geo, islandMat, [x, -0.05, -62], { ink: false, receive: false });
    m.scale.set(w, h, 3);
  }
  const boat = new THREE.Group();
  group.add(boat);
  kit.box(boat, [1.6, 0.3, 0.5], kit.toon('#7a4a2a'), [0, 0.15, 0]);
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.3, 0, 0, 2.2, 0, 1.2, 0.3, 0], 3));
  sail.computeVertexNormals();
  kit.mesh(boat, sail, kit.toon('#fbf4e4', null, { side: THREE.DoubleSide }), [-0.4, 0, 0], { ink: false });

  // Palms framing the beach.
  const leafTex = kit.canvas(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#3f8a3a';
    g.fillRect(0, h * 0.46, w, h * 0.08);
    for (let x = 4; x < w; x += 7) {
      const l = h * 0.48 * (1 - x / w) + 4;
      g.fillStyle = x % 14 ? '#4f9d42' : '#2f6e2c';
      g.beginPath();
      g.moveTo(x, h / 2);
      g.lineTo(x + 10, h / 2 - l);
      g.lineTo(x + 5, h / 2);
      g.lineTo(x + 10, h / 2 + l);
      g.closePath();
      g.fill();
    }
  });
  const crowns = [
    buildPalm(kit, group, [-8.2, 0, -1.2], 5.2, 0.5, 701, leafTex),
    buildPalm(kit, group, [-9.6, 0, 1.5], 4.2, 0.8, 702, leafTex),
    buildPalm(kit, group, [8.4, 0, -1.0], 5.6, -0.45, 703, leafTex),
    buildPalm(kit, group, [9.8, 0, 2.0], 4.4, -0.7, 704, leafTex),
  ];

  // Centre pole + rope line — the "garis tengah".
  const pole = new THREE.Group();
  pole.position.set(0, 0, -0.85);
  group.add(pole);
  const poleTex = kit.canvas(32, 256, stripedPaint('#dc2626', '#fbf4e4', 12, true, 721));
  kit.mesh(pole, new THREE.CylinderGeometry(0.05, 0.06, 2.6, 12), kit.toon('#ffffff', poleTex), [0, 1.3, 0], { shadow: true });
  kit.mesh(pole, new THREE.SphereGeometry(0.08, 12, 10), kit.toon('#facc15'), [0, 2.65, 0], { ink: 0.008 });
  kit.mesh(pole, new THREE.PlaneGeometry(0.95, 0.3), kit.toon('#ffffff', kit.canvas(380, 120, textCanvas('GARIS TENGAH', { w: 380, h: 120, bg: '#fbf4e4', fg: '#7f1d1d', font: SIGN_FONT, size: 46, border: '#7f1d1d' }))), [0, 2.05, 0.07], { ink: 0.012 });
  const flagGeo = new THREE.PlaneGeometry(0.5, 0.3, 10, 2);
  flagGeo.translate(0.25, 0, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position!.array as ArrayLike<number>);
  kit.mesh(pole, flagGeo, kit.toon('#facc15', null, { side: THREE.DoubleSide }), [0.05, 2.45, 0], { ink: false, shadow: true });
  const stakeMat = kit.toon('#8a5a2b');
  const ropePts: THREE.Vector3[] = [];
  for (let k = 0; k < 9; k++) {
    const z = -1.8 + k * 0.7;
    kit.box(group, [0.05, 0.4, 0.05], stakeMat, [0, 0.2, z], { shadow: true });
    ropePts.push(new THREE.Vector3(0, 0.36, z));
  }
  kit.mesh(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 60, 0.012, 5, false), kit.toon('#e8d7b0'), [0, 0, 0], { ink: false });

  // Market territories (tinted sand) and the moving boundary line.
  const territory = (color: string): THREE.Mesh => {
    const m = kit.mesh(group, new THREE.PlaneGeometry(1, 6.2), kit.basic({ color, transparent: true, opacity: 0, depthWrite: false }), [0, 0.008, 0.95], { ink: false, rot: [-Math.PI / 2, 0, 0] });
    m.renderOrder = 2;
    return m;
  };
  const terBlue = territory('#3b82f6');
  const terRed = territory('#ef4444');
  const boundaryMat = kit.basic({ color: '#fff3b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const boundary = kit.mesh(group, new THREE.PlaneGeometry(0.06, 6.2), boundaryMat, [0, 0.012, 0.95], { ink: false, rot: [-Math.PI / 2, 0, 0] });
  boundary.renderOrder = 3;

  // Carts.
  // Handles face each vendor: blue pushes from the left (−x), red from the right (+x).
  const blueCart = buildCart(kit, group, '#2563eb', '#f9a8d4', 1, 731);
  const redCart = buildCart(kit, group, '#dc2626', '#fde68a', -1, 741);

  // 100 tourists on towels, each with a floating "buys from" pin.
  const N = TOURIST_X.length;
  const tz: number[] = [];
  const rows = [-1.8, -1.35, -0.9, 1.05, 1.45, 1.85];
  for (let i = 0; i < N; i++) {
    let z = rows[Math.floor(rnd(801, i) * rows.length)] ?? 2;
    const x = TOURIST_X[i] ?? 0;
    if (Math.abs(x + 2.75) < 0.55 && z > 0) z = -1.35;
    tz.push(z + (rnd(802, i) - 0.5) * 0.25);
  }
  const towelM = new THREE.InstancedMesh(kit.track(new THREE.BoxGeometry(0.42, 0.02, 0.78)), kit.toon('#ffffff'), N);
  const pinM = new THREE.InstancedMesh(kit.track(new THREE.SphereGeometry(0.06, 12, 10)), kit.basic({ color: '#ffffff' }), N);
  const pinTipM = new THREE.InstancedMesh(kit.track(new THREE.ConeGeometry(0.04, 0.1, 10)), kit.basic({ color: '#ffffff' }), N);
  const umbN = 8;
  const umbTopM = new THREE.InstancedMesh(kit.track(new THREE.ConeGeometry(0.42, 0.2, 12)), kit.toon('#ffffff', kit.canvas(256, 64, stripedPaint('#ffffff', '#ffffff', 2, false, 1))), umbN);
  const umbPoleM = new THREE.InstancedMesh(kit.track(new THREE.CylinderGeometry(0.016, 0.016, 1.2, 6)), kit.toon('#f5f5f4'), umbN);
  for (const m of [towelM, umbTopM, umbPoleM]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  group.add(pinM, pinTipM);
  const towelCols = ['#f472b6', '#38bdf8', '#facc15', '#a3e635', '#fb923c', '#c084fc', '#f87171'];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < N; i++) {
    const x = TOURIST_X[i] ?? 0;
    const z = tz[i] ?? 0;
    const yaw = (rnd(803, i) - 0.5) * 0.8;
    q.setFromEuler(e.set(0, yaw, 0));
    towelM.setMatrixAt(i, m4.compose(v.set(x, 0.012, z), q, one));
    towelM.setColorAt(i, c.set(towelCols[i % towelCols.length] ?? '#fff'));
  }

  // Unified Bean-Head crowd: every tourist is a painted Persis bean-head card
  // (same rig, ink, grain and SOLE line as the hero cast) — sunhats, caps,
  // sunglasses, Hawaiian shirts, board shorts; sitting, lounging or standing.
  const crowd = buildBeachCrowd(kit, group, tz);

  const umbCols = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f97316', '#a855f7'];
  for (let k = 0; k < umbN; k++) {
    const behind = tz.map((z, j) => (z < 0 ? j : -1)).filter((j) => j >= 0);
    const i = behind[Math.floor((k + 0.5) * (behind.length / umbN))] ?? 0;
    const x = (TOURIST_X[i] ?? 0) + 0.3;
    const z = (tz[i] ?? 0) - 0.25;
    q.setFromEuler(e.set(0.12, 0, 0.08 * (k % 2 ? 1 : -1)));
    umbPoleM.setMatrixAt(k, m4.compose(v.set(x, 0.6, z), q, one));
    umbTopM.setMatrixAt(k, m4.compose(v.set(x, 1.22, z), q, one));
    umbTopM.setColorAt(k, c.set(umbCols[k % umbCols.length] ?? '#fff'));
  }
  for (const m of [towelM, umbTopM, umbPoleM]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  const pinBlue = new THREE.Color('#3b82f6');
  const pinRed = new THREE.Color('#ef4444');

  // Seagulls.
  const gullMat = kit.basic({ color: '#2a2230', side: THREE.DoubleSide });
  const gulls: { g: THREE.Group; wings: THREE.Mesh[]; k: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group();
    group.add(g);
    const wings = [-1, 1].map((s) => {
      const geo = new THREE.PlaneGeometry(0.5, 0.09);
      geo.translate(s * 0.25, 0, 0);
      return kit.mesh(g, geo, gullMat, [0, 0, 0], { ink: false, receive: false });
    });
    gulls.push({ g, wings, k });
  }

  const skyA = new THREE.Color();
  const skyB = new THREE.Color();
  const update = ({ frame, grading, camera }: WorldUpdate): void => {
    // Pins only read from the drone map; at ground level they would float in the lens.
    const mapView = smoothstep(3.5, 7, camera.position.y);
    const sk = `${grading.skyTop}|${grading.skyHorizon}`;
    if (sk !== skyKey) {
      skyA.set(grading.skyTop);
      skyB.set(grading.skyHorizon);
      const p = skyGeo.attributes.position!;
      for (let i = 0; i < p.count; i++) {
        const t = smoothstep(-0.05, 0.55, p.getY(i) / 90);
        c.copy(skyB).lerp(skyA, t);
        skyCol.set([c.r, c.g, c.b], i * 3);
      }
      skyGeo.attributes.color!.needsUpdate = true;
      skyKey = sk;
    }
    fog.color.set(grading.fogColor);
    fog.density = grading.fogDensity;
    hemi.color.set(grading.hemiSky);
    hemi.groundColor.set(grading.hemiGround);
    hemi.intensity = grading.hemiIntensity;
    key.color.set(grading.keyColor);
    key.intensity = grading.keyIntensity;
    rim.color.set(grading.rimColor);
    rim.intensity = grading.rimStrength * 0.8;
    sun.material.color.set(grading.keyColor);
    // Sun sinks toward the horizon as the grade warms.
    const sunset = clamp01((grading.rimStrength - 0.55) / 0.6);
    sun.position.y = lerp(22, 7, sunset);
    sunDisk.position.y = sun.position.y;
    (sunDisk.material as THREE.MeshBasicMaterial).color.set(grading.keyColor).lerp(new THREE.Color('#ffffff'), 0.5);
    for (const cl of clouds) {
      cl.s.position.x = lerp(-70, 70, loopSaw(frame, 1, cl.x));
      cl.s.material.color.set(grading.skyHorizon).lerp(new THREE.Color('#ffffff'), 0.55);
    }

    // Swell (integer cycles per loop).
    const arr = seaPos.array as Float32Array;
    for (let i = 0; i < seaPos.count; i++) {
      const x = seaBase[i * 3] ?? 0;
      const z = seaBase[i * 3 + 2] ?? 0;
      const ph = (2 * Math.PI * frame) / 1800;
      const near = smoothstep(SHORE_Z - 14, SHORE_Z, z);
      arr[i * 3 + 1] = -0.04 + Math.sin(z * 0.9 + ph * 15 + x * 0.05) * 0.07 * (0.4 + near) + Math.sin(x * 0.45 + ph * 11) * 0.04 + Math.sin((x + z) * 1.3 + ph * 23) * 0.015;
    }
    seaPos.needsUpdate = true;
    seaGeo.computeVertexNormals();
    for (const f of foams) {
      const u = loopSaw(frame, 15, f.phase);
      f.mesh.position.z = SHORE_Z - 0.6 + Math.sin(u * Math.PI) * 0.9;
      f.mat.opacity = Math.sin(u * Math.PI) * 0.85;
    }
    wetMat.opacity = 0.35 + 0.25 * grading.wetness;
    glitter(frame, 0, 0.6);
    boat.position.set(lerp(-26, 26, loopSaw(frame, 1, 0.2)), 0, -34);

    // Palms sway, flag ripples.
    for (const cr of crowns) {
      const s = (cr.userData.seed as number) ?? 0;
      cr.rotation.z = loopWave(frame, 12, s) * 0.05;
      cr.rotation.x = loopWave(frame, 9, s * 2) * 0.03;
    }
    const fp = flagGeo.attributes.position!;
    for (let i = 0; i < fp.count; i++) {
      const x = flagBase[i * 3] ?? 0;
      fp.setZ(i, Math.sin(x * 9 - (frame * 2 * Math.PI * 60) / 1800) * 0.05 * x * 2);
    }
    fp.needsUpdate = true;

    // Carts roll; wheels turn by distance (no skidding).
    const carts = cartsAt(frame);
    blueCart.group.position.set(carts.blue, 0, CART_Z);
    redCart.group.position.set(carts.red, 0, CART_Z);
    for (const w of blueCart.wheels) w.rotation.z = -carts.blue / 0.3;
    for (const w of redCart.wheels) w.rotation.z = -carts.red / 0.3;
    blueCart.hero.rotation.y = loopWave(frame, 10) * 0.25;
    redCart.hero.rotation.y = loopWave(frame, 10, 2) * 0.25;
    blueCart.hero.position.y = 2.2 + loopWave(frame, 30) * 0.02;
    redCart.hero.position.y = 2.2 + loopWave(frame, 30, 1.5) * 0.02;

    // Territories, boundary and the tourists' pins.
    const share = shareAt(frame);
    const b = boundaryAt(frame);
    const left = -BEACH_HALF - 0.4;
    const right = BEACH_HALF + 0.4;
    terBlue.scale.x = Math.max(0.01, b - left);
    terBlue.position.x = (left + b) / 2;
    terRed.scale.x = Math.max(0.01, right - b);
    terRed.position.x = (b + right) / 2;
    (terBlue.material as THREE.MeshBasicMaterial).opacity = 0.2 * share.visible;
    (terRed.material as THREE.MeshBasicMaterial).opacity = 0.2 * share.visible;
    boundary.position.x = b;
    boundaryMat.opacity = 0.9 * share.visible;
    for (let i = 0; i < N; i++) {
      const x = TOURIST_X[i] ?? 0;
      const z = tz[i] ?? 0;
      // Each tourist reacts a few frames after the boundary passes (a ripple of decisions).
      const delay = 3 + Math.floor(rnd(809, i) * 9);
      const blueNow = x < boundaryAt(frame - delay);
      const blueBefore = x < boundaryAt(frame - delay - 7);
      const pop = blueNow !== blueBefore ? 1.45 : 1;
      const s = share.visible * pop * mapView;
      const bob = loopWave(frame, 40, i) * 0.03;
      q.identity();
      v.set(s, s, s);
      pinM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.98 + bob, z), q, v));
      q.setFromEuler(e.set(Math.PI, 0, 0));
      pinTipM.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.9 + bob, z), q, v));
      const col = blueNow ? pinBlue : pinRed;
      pinM.setColorAt(i, col);
      pinTipM.setColorAt(i, col);
    }
    pinM.instanceMatrix.needsUpdate = true;
    pinTipM.instanceMatrix.needsUpdate = true;
    if (pinM.instanceColor) pinM.instanceColor.needsUpdate = true;
    if (pinTipM.instanceColor) pinTipM.instanceColor.needsUpdate = true;
    pinM.visible = share.visible * mapView > 0.001;
    pinTipM.visible = pinM.visible;

    // Bean-head crowd: face the lens, lean back for the drone map, and give a
    // little hop the moment each tourist switches vendor.
    crowd.update(
      frame,
      camera.position,
      (i, out) => out.set(TOURIST_X[i] ?? 0, 0.02, (tz[i] ?? 0) + 0.12),
      (i) => {
        const delay = 3 + Math.floor(rnd(809, i) * 9);
        for (let d = 0; d < 8; d++) {
          if (TOURIST_X[i]! < boundaryAt(frame - delay - d) !== TOURIST_X[i]! < boundaryAt(frame - delay - d - 1)) return Math.sin(((d + 1) / 9) * Math.PI);
        }
        return 0;
      },
    );

    for (const gl of gulls) {
      const u = loopSaw(frame, 2, gl.k * 0.27);
      gl.g.position.set(lerp(-14, 14, u), 5 + gl.k * 0.7 + loopWave(frame, 6, gl.k) * 0.4, -4 - gl.k * 2);
      const flap = Math.sin(frame * 0.5 + gl.k) * 0.5;
      gl.wings.forEach((w, s) => {
        w.rotation.z = (s === 0 ? -1 : 1) * flap;
      });
    }
  };

  return { id: 'beach', group, background, fog, keyDir: new THREE.Vector3(-8, 12, 7).normalize(), update };
}
