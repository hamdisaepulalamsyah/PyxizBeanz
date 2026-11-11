import * as THREE from 'three';

/**
 * Upgraded v3 Bean-Head 2D-in-3D Character Engine for "Fakta Unik Dodol Garut".
 *
 * Incorporates the measured reference proportions and drawing architecture:
 *  - 3.5 head-height adult proportions (torso 1.1 HH, legs 1.4 HH),
 *  - Asymmetric superellipse head (pointed crown, fuller jaw, chin taper, side bulge),
 *  - True variable-weight plum ink ring (3:1 thick-thin following scene light direction),
 *  - Soft crescent head shading & broad torso gradient,
 *  - 14 nuanced expressions with closer lidded eyes (0.26 W) and 4-frame micro-blinks,
 *  - Sleek single-stroke limbs with ink-dot hands + true side profile (2-bone leg IK),
 *  - Target-anchored action poses (stirring cauldron, stoking hawu stove, packing blocks,
 *    tasting dodol, presenting Picnic box) so props always connect to real 3D geometry,
 *  - Lit card shading (`cardShade`) instead of flat emissive stickers.
 */

export const INK = '#241726';
export const WHITE = '#ffffff';
const MOUTH_INT = '#5a1e28';
const TONGUE = '#e86e78';

type P2 = [number, number];
type C3 = [number, number, number];

const SH_SKIN: C3 = [0.95, 0.85, 0.82];
const SH_CLOTH: C3 = [0.64, 0.66, 0.74];
const SH_FELT: C3 = [0.62, 0.62, 0.7];

const rad = (d: number): number => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

export function mulColor(c: string, m: C3): string {
  const n = parseInt(c.slice(1), 16);
  const ch = (v: number, k: number): string =>
    Math.min(255, Math.max(0, Math.round(v * k)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255, m[0])}${ch((n >> 8) & 255, m[1])}${ch(n & 255, m[2])}`;
}

export function shadeColor(c: string, k: number): string {
  return mulColor(c, [k, k, k]);
}

export function mixColor(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const ch = (s: number): string =>
    Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

const rnd = (seed: number, k: number): number => {
  const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const rotPts = (pts: P2[], a: number, cx: number, cy: number): P2[] => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

const rotAbout = (q: P2, a: number, c: P2): P2 => rotPts([q], a, c[0], c[1])[0] ?? q;

const curvePts = (a: P2, k: P2, b: P2, n = 10): P2[] => {
  const c: P2 = [2 * k[0] - (a[0] + b[0]) / 2, 2 * k[1] - (a[1] + b[1]) / 2];
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
  }
  return out;
};

const ellPts = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0, n = 48): P2[] => {
  const r = rad(rot);
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
};

const rrect = (x0: number, y0: number, x1: number, y1: number, r: number, n = 8): P2[] => {
  const pts: P2[] = [];
  const corners: readonly [number, number, number][] = [
    [x1 - r, y0 + r, -90],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, 90],
    [x0 + r, y0 + r, 180],
  ];
  for (const [cx, cy, a] of corners) {
    for (let i = 0; i <= n; i++) {
      pts.push([cx + r * Math.cos(rad(a + (90 * i) / n)), cy + r * Math.sin(rad(a + (90 * i) / n))]);
    }
  }
  return pts;
};

// ── Vector Pen API ──────────────────────────────────────────────────────────

export class Pen {
  readonly g: CanvasRenderingContext2D;
  ol = 11;
  rot: number[] | null = null;

  constructor(g: CanvasRenderingContext2D) {
    this.g = g;
  }

  P(x: number, y: number): P2 {
    if (!this.rot) return [x, y];
    const [a = 0, cx = 0, cy = 0, dx = 0, dy = 0] = this.rot;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [cx + (x - cx) * c - (y - cy) * s + dx, cy + (x - cx) * s + (y - cy) * c + dy];
  }

  path(pts: readonly P2[], close: boolean): void {
    const g = this.g;
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = this.P(p[0], p[1]);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    if (close) g.closePath();
  }

  poly(pts: readonly P2[], fill: string | null, ol?: number): void {
    const g = this.g;
    const w = ol ?? this.ol;
    this.path(pts, true);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (w) {
      g.lineWidth = w;
      g.strokeStyle = INK;
      g.lineJoin = 'round';
      g.stroke();
    }
  }

  ell(cx: number, cy: number, rx: number, ry: number, fill: string | null, ol?: number, a0 = 0, a1 = 360, rot = 0): void {
    this.poly(ellPts(cx, cy, rx, ry, a0, a1, rot), fill, ol);
  }

  stroke(pts: readonly P2[], w: number, fill = INK): void {
    const g = this.g;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    this.path(pts, false);
    g.strokeStyle = fill;
    g.lineWidth = w;
    g.stroke();
  }

  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, fill = INK): void {
    const pts: P2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = rad(a0 + ((a1 - a0) * i) / 24);
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    this.stroke(pts, w, fill);
  }

  dot(cx: number, cy: number, r: number, fill = INK): void {
    const [x, y] = this.P(cx, cy);
    this.g.beginPath();
    this.g.arc(x, y, r, 0, Math.PI * 2);
    this.g.fillStyle = fill;
    this.g.fill();
  }

  clip(pts: readonly P2[], fn: () => void): void {
    const g = this.g;
    g.save();
    this.path(pts, true);
    g.clip();
    fn();
    g.restore();
  }

  shadedFill(pts: readonly P2[], base: string, shadow: string, light: number, R: number, shift = 0.45, r0 = 1.05, r1 = 1.25): void {
    const g = this.g;
    const n = pts.length || 1;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of pts) {
      cx += x / n;
      cy += y / n;
    }
    const [gx, gy] = this.P(cx + Math.cos(light) * shift * R, cy + Math.sin(light) * shift * R);
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r1 * R);
    gr.addColorStop(0, base);
    gr.addColorStop(r0 / r1, base);
    gr.addColorStop(1, shadow);
    this.path(pts, true);
    g.fillStyle = gr;
    g.fill();
  }

  gradFill(pts: readonly P2[], base: string, shadow: string, light: number, flat = 0.22): void {
    const g = this.g;
    const dx = Math.cos(light);
    const dy = Math.sin(light);
    const n = pts.length || 1;
    let cx = 0;
    let cy = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, y] of pts) {
      cx += x / n;
      cy += y / n;
      const d = x * dx + y * dy;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    const dc = cx * dx + cy * dy;
    const [ax, ay] = this.P(cx + dx * (hi - dc), cy + dy * (hi - dc));
    const [bx, by] = this.P(cx + dx * (lo - dc), cy + dy * (lo - dc));
    const gr = g.createLinearGradient(ax, ay, bx, by);
    gr.addColorStop(0, base);
    gr.addColorStop(flat, base);
    gr.addColorStop(1, shadow);
    this.path(pts, true);
    g.fillStyle = gr;
    g.fill();
  }

  /** Variable-weight thick-thin ink outline weighted toward bottom & shadow side. */
  inkRing(pts: readonly P2[], w0: number, thick: number, k = 0.48, col = INK): void {
    const n = pts.length;
    if (n < 3) return;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of pts) {
      cx += x / n;
      cy += y / n;
    }
    const out: P2[] = [];
    const inn: P2[] = [];
    for (let i = 0; i < n; i++) {
      const q = pts[i]!;
      const a = pts[(i + n - 1) % n]!;
      const b = pts[(i + 1) % n]!;
      let nx = b[1] - a[1];
      let ny = a[0] - b[0];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const h = 0.5 * w0 * (1 + k * Math.cos(Math.atan2(q[1] - cy, q[0] - cx) - thick));
      out.push([q[0] + nx * h, q[1] + ny * h]);
      inn.push([q[0] - nx * h, q[1] - ny * h]);
    }
    const g = this.g;
    const trace = (r: readonly P2[]): void => {
      r.forEach(([x0, y0], idx) => {
        const [x, y] = this.P(x0, y0);
        if (idx) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
    };
    g.beginPath();
    trace(out);
    trace(inn.reverse());
    g.fillStyle = col;
    g.fill('evenodd');
  }

  band(pts: readonly P2[], fill: string, w: number, rim: number, cap: CanvasLineCap = 'butt'): void {
    const g = this.g;
    g.lineCap = cap;
    g.lineJoin = 'round';
    this.path(pts, false);
    g.strokeStyle = INK;
    g.lineWidth = w + 2 * rim;
    g.stroke();
    this.path(pts, false);
    g.strokeStyle = fill;
    g.lineWidth = w;
    g.stroke();
    g.lineCap = 'round';
  }
}

const taper = (p: Pen, a: P2, b: P2, wa: number, wb: number, col = INK): void => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  p.poly(
    [
      [a[0] + (nx * wa) / 2, a[1] + (ny * wa) / 2],
      [b[0] + (nx * wb) / 2, b[1] + (ny * wb) / 2],
      [b[0] - (nx * wb) / 2, b[1] - (ny * wb) / 2],
      [a[0] - (nx * wa) / 2, a[1] - (ny * wa) / 2],
    ],
    col,
    0,
  );
  p.dot(a[0], a[1], wa / 2, col);
  p.dot(b[0], b[1], wb / 2, col);
};

// ── Head Contours & Expressions ─────────────────────────────────────────────

export interface BlobSpec {
  a: number;
  b: number;
  nTop: number;
  nBot: number;
  egg: number;
  asym: number;
  rot: number;
  noise: number;
  seed: number;
}

export function blobPts(cx: number, cy: number, B: BlobSpec, n = 72): P2[] {
  const ph = [rnd(B.seed, 11), rnd(B.seed, 12), rnd(B.seed, 13)].map((v) => v * Math.PI * 2);
  const pts: P2[] = [];
  const cr = Math.cos(B.rot);
  const sr = Math.sin(B.rot);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const e = 2 / (s < 0 ? B.nTop : B.nBot);
    let X = Math.sign(c) * Math.abs(c) ** e;
    const Y = Math.sign(s) * Math.abs(s) ** e;
    X *= (1 + B.egg * Y) * (1 + B.asym * Math.sign(X));
    const r = 1 + B.noise * (Math.cos(2 * t + ph[0]!) + 0.7 * Math.cos(3 * t + ph[1]!) + 0.5 * Math.cos(4 * t + ph[2]!));
    const x = B.a * X * r;
    const y = B.b * Y * r;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

export function headBlob(seed: number, a = 114, facing = 0): BlobSpec {
  return {
    a,
    b: a * (0.94 + 0.06 * (rnd(seed, 1) - 0.5)),
    nTop: 1.75 + 0.24 * (rnd(seed, 2) - 0.5),
    nBot: 2.3 + 0.24 * (rnd(seed, 3) - 0.5),
    egg: -0.12 + 0.04 * (rnd(seed, 4) - 0.5),
    asym: (0.06 + 0.04 * rnd(seed, 5)) * (facing || (rnd(seed, 6) < 0.5 ? -1 : 1)),
    rot: rad(6 * (rnd(seed, 7) - 0.5)),
    noise: 0.008,
    seed,
  };
}

export const thickAngle = (light: number): number => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light));
const DEF_LIGHT = rad(-120);

export type Expr =
  | 'neutral'
  | 'stern'
  | 'grin'
  | 'laugh'
  | 'whistle'
  | 'nervous'
  | 'shock'
  | 'relief'
  | 'relief_open'
  | 'dazed'
  | 'pained'
  | 'smile'
  | 'smile_closed'
  | 'lick';

type EyeK = 'dot' | 'small' | 'lid' | 'slit' | 'happy' | 'dash' | 'squeeze' | 'shock' | 'shockHalf' | 'spiral';
type MouthK = 'dash' | 'frown' | 'smirk' | 'smile' | 'smileWide' | 'grin' | 'laugh' | 'o' | 'O' | 'wave' | 'teeth' | 'lick';

const FACE: Record<Expr, { eye: [EyeK, EyeK]; brow: [number, number]; mouth: MouthK }> = {
  neutral: { eye: ['lid', 'lid'], brow: [0, -1], mouth: 'dash' },
  stern: { eye: ['lid', 'lid'], brow: [3.5, -2.5], mouth: 'frown' },
  grin: { eye: ['happy', 'happy'], brow: [-3, -3], mouth: 'grin' },
  laugh: { eye: ['squeeze', 'squeeze'], brow: [-4, -4], mouth: 'laugh' },
  whistle: { eye: ['dash', 'dash'], brow: [-2, -4], mouth: 'o' },
  nervous: { eye: ['small', 'small'], brow: [-3, 2.5], mouth: 'wave' },
  shock: { eye: ['shock', 'shock'], brow: [-7, -6], mouth: 'O' },
  relief: { eye: ['happy', 'happy'], brow: [-2, 1], mouth: 'smileWide' },
  relief_open: { eye: ['happy', 'happy'], brow: [-2, 1], mouth: 'grin' },
  dazed: { eye: ['spiral', 'spiral'], brow: [-3, 2], mouth: 'wave' },
  pained: { eye: ['squeeze', 'lid'], brow: [-3, 2.5], mouth: 'teeth' },
  smile: { eye: ['lid', 'lid'], brow: [-1, -1.5], mouth: 'smirk' },
  smile_closed: { eye: ['happy', 'happy'], brow: [-1, -1.5], mouth: 'smile' },
  lick: { eye: ['lid', 'lid'], brow: [-2, -1], mouth: 'lick' },
};

const halfLid = (k: EyeK): EyeK => (k === 'dot' || k === 'small' ? 'lid' : k === 'lid' ? 'slit' : k === 'shock' ? 'shockHalf' : k);
const eyeKind = (k: EyeK, lid: number): EyeK =>
  lid >= 1 && k !== 'happy' && k !== 'squeeze' && k !== 'spiral' ? 'dash' : lid > 0 ? halfLid(k) : k;

const drawEye = (p: Pen, kind: EyeK, x: number, ey: number, u: number, side: number, look: number, skin: string): void => {
  const lx = x + look * 3 * u;
  const lw = 3.8 * u;
  switch (kind) {
    case 'dot':
      p.ell(lx, ey, 3.8 * u, 5.4 * u, INK, 0);
      break;
    case 'small':
      p.ell(lx, ey, 3.1 * u, 4.4 * u, INK, 0);
      break;
    case 'lid':
      p.ell(lx, ey - u, 7.2 * u, 6.2 * u, INK, 0, 0, 180);
      p.stroke(
        [
          [x - 9 * u, ey - u],
          [x + 9 * u, ey - u],
        ],
        lw,
      );
      break;
    case 'slit':
      p.ell(lx, ey, 7.2 * u, 2.7 * u, INK, 0, 0, 180);
      p.stroke(
        [
          [x - 9 * u, ey],
          [x + 9 * u, ey],
        ],
        lw,
      );
      break;
    case 'happy':
      p.arc(x, ey + 3 * u, 8 * u, 6 * u, 200, 340, lw);
      break;
    case 'dash':
      p.stroke(
        [
          [x - 8.5 * u, ey],
          [x + 8.5 * u, ey],
        ],
        lw,
      );
      break;
    case 'squeeze':
      p.stroke(
        [
          [x + 6 * u * side, ey - 5 * u],
          [x - 6 * u * side, ey],
          [x + 6 * u * side, ey + 5 * u],
        ],
        lw,
      );
      break;
    case 'shock':
    case 'shockHalf':
      p.ell(x, ey, 11 * u, 11 * u, WHITE, 2.6 * u);
      p.dot(lx - side * 1.5 * u, ey + 1.5 * u, 3 * u);
      if (kind === 'shockHalf') {
        p.ell(x, ey, 11 * u, 11 * u, skin, 0, 180, 360);
        p.stroke(
          [
            [x - 11 * u, ey],
            [x + 11 * u, ey],
          ],
          2.6 * u,
        );
      }
      break;
    default: {
      const s: P2[] = [];
      for (let t = 1; t < 15; t++) s.push([x + Math.cos(t * 0.9) * t * 0.55 * u, ey + Math.sin(t * 0.9) * t * 0.55 * u]);
      p.stroke(s, 2.4 * u);
      break;
    }
  }
};

const dmouth = (p: Pen, mx: number, y: number, rx: number, ry: number, u: number, tongue = false): void => {
  p.ell(mx, y, rx, ry, MOUTH_INT, 0, 0, 180);
  p.clip(
    [
      [mx - rx, y],
      [mx + rx, y],
      [mx + rx, y + 3 * u],
      [mx - rx, y + 3 * u],
    ],
    () => p.ell(mx, y, rx, ry, WHITE, 0, 0, 180),
  );
  if (tongue) p.ell(mx + 2 * u, y + 0.62 * ry, 0.4 * rx, 0.28 * ry, TONGUE, 0);
  p.ell(mx, y, rx, ry, null, 3 * u, 0, 180);
};

const drawMouth = (p: Pen, kind: MouthK, mx: number, my: number, u: number, k = 1): void => {
  const mw = 4 * u;
  switch (kind) {
    case 'dash':
      p.stroke(
        [
          [mx - 5.5 * u * k, my],
          [mx + 5.5 * u * k, my - 0.8 * u],
        ],
        mw,
      );
      break;
    case 'frown':
      p.arc(mx, my + 3 * u, 6.5 * u * k, 3.5 * u, 200, 340, mw);
      break;
    case 'smirk':
      p.arc(mx + u, my - 3 * u, 7 * u * k, 4 * u, 10, 150, mw);
      break;
    case 'smile':
      p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw);
      break;
    case 'smileWide':
      p.arc(mx, my - 4 * u, 11 * u * k, 6 * u, 15, 165, mw);
      break;
    case 'grin':
      dmouth(p, mx, my - u, 12 * u * k, 8 * u, u);
      break;
    case 'laugh':
      dmouth(p, mx, my, 15 * u * k, 10.5 * u, u, true);
      break;
    case 'o':
      p.ell(mx + 4 * u, my, 3.5 * u, 4 * u, MOUTH_INT, 2.8 * u);
      break;
    case 'O':
      p.ell(mx, my + 2 * u, 8.5 * u * k, 10.5 * u, MOUTH_INT, 3.2 * u);
      break;
    case 'wave': {
      const s: P2[] = [];
      for (let i = 0; i <= 12; i++) s.push([mx - 9 * u * k + i * 1.5 * u * k, my + 1.5 * u * Math.sin(i * 1.3)]);
      p.stroke(s, 3 * u);
      break;
    }
    case 'teeth':
      p.poly(
        [
          [mx - 12 * u * k, my - 4 * u],
          [mx + 12 * u * k, my - 4 * u],
          [mx + 11 * u * k, my + 4 * u],
          [mx - 11 * u * k, my + 4 * u],
        ],
        WHITE,
        3 * u,
      );
      for (const j of [-1, 0, 1]) {
        p.stroke(
          [
            [mx + j * 6 * u * k, my - 4 * u],
            [mx + j * 6 * u * k, my + 4 * u],
          ],
          1.5 * u,
        );
      }
      break;
    case 'lick':
      p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw);
      p.ell(mx + 6 * u * k, my + 3 * u, 3.6 * u, 4.6 * u, TONGUE, 2.4 * u);
      break;
  }
};

const drawFaceFront = (
  p: Pen,
  cx: number,
  cy: number,
  W: number,
  expr: Expr,
  facing: number,
  look: number,
  lid: number,
  brim: boolean,
  skin: string,
  mustache?: string,
  stout = false,
): void => {
  const u = W / 100;
  const F = FACE[expr];
  const fx = cx + 7 * u * facing;
  const ex = (F.eye[0] === 'shock' ? 12 : 13) * u; // 26u eye spacing
  const ey = cy;
  for (const side of [-1, 1] as const) {
    const x = fx + side * ex;
    const kind = eyeKind(F.eye[(facing ? side === facing : side > 0) ? 1 : 0], lid);
    drawEye(p, kind, x, ey, u, side, look, skin);
    const [dI, dO] = F.brow;
    const by = ey - (brim ? 17 : 20) * u;
    if (kind === 'shock' || kind === 'shockHalf') p.arc(x, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
    else taper(p, [x - side * 8.5 * u, by + dI * u], [x + side * 8.5 * u, by + dO * u], 5 * u, 2.5 * u);
  }
  const mx = cx + 8 * u * facing;
  const my = cy + 20 * u;
  drawMouth(p, F.mouth, mx, my, u);
  if (mustache) {
    for (const s of [-1, 1] as const) {
      taper(
        p,
        [mx + s * 1.5 * u, cy + 12.5 * u],
        [mx + s * (stout ? 18 : 14) * u, cy + (stout ? 10.5 : 14.5) * u],
        stout ? 5.2 * u : 4.2 * u,
        1.5 * u,
        mustache,
      );
    }
  }
};

const drawFaceSide = (
  p: Pen,
  hx: number,
  hy: number,
  W: number,
  expr: Expr,
  lid: number,
  brim: boolean,
  skin: string,
  mustache?: string,
  stout = false,
): void => {
  const u = W / 100;
  const F = FACE[expr];
  const ex = hx + 27 * u;
  const ey = hy;
  const kind = eyeKind(F.eye[1], lid);
  drawEye(p, kind, ex, ey, u, 1, 0.55, skin);
  const by = ey - (brim ? 17 : 20) * u;
  const [dI, dO] = F.brow;
  if (kind === 'shock' || kind === 'shockHalf') p.arc(ex, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
  else taper(p, [ex + 8 * u, by + dI * u], [ex - 7 * u, by - u + dO * u], 5 * u, 2.5 * u);
  // Crisp anime profile nose tick (no potato bump!)
  p.stroke(
    [
      [hx + 44 * u, hy + 4 * u],
      [hx + 47.5 * u, hy + 9 * u],
      [hx + 43 * u, hy + 10 * u],
    ],
    3 * u,
  );
  drawMouth(p, F.mouth, hx + 33 * u, hy + 21 * u, u, 0.64);
  if (mustache) {
    taper(
      p,
      [hx + 41 * u, hy + 13.5 * u],
      [hx + 25 * u, hy + (stout ? 11.5 : 15.5) * u],
      stout ? 5.2 * u : 4.2 * u,
      1.5 * u,
      mustache,
    );
  }
};

// ── Nusantara Outfits & Headwear ────────────────────────────────────────────

export type Build = 'adult' | 'stout' | 'kid';
export type HatKind = 'none' | 'kerudung' | 'sanggul' | 'peci' | 'totopong' | 'hair' | 'cap';

export interface CharacterLook {
  build?: Build;
  skin: string;
  jacket: string;
  pants: string;
  boots: string;
  hat: HatKind;
  hatColor?: string;
  hairColor?: string;
  mustache?: string;
  apron?: string;
  sash?: string;
  buttons?: string;
  dress?: string;
  glasses?: boolean;
}

export const LOOKS = {
  /** Ibu Karsinah (1926): kebaya krem-terakota hangat + kerudung selendang & sanggul klasik Garut. */
  ibuKarsinah: {
    build: 'adult',
    skin: '#e0af87',
    jacket: '#b85a42',
    dress: '#4b3328',
    pants: '#4b3328',
    boots: '#3b261c',
    hat: 'kerudung',
    hatColor: '#ebd9b8',
    hairColor: '#231918',
    buttons: '#e6c37a',
  },
  /** Pengaduk kuali (1926/tradisional): baju pangsi/kaos kerja + totopong ikat Sunda + celemek kulit. */
  pengaduk1: {
    build: 'adult',
    skin: '#c99068',
    jacket: '#3b4a5e',
    pants: '#2c3038',
    boots: '#241d1b',
    hat: 'totopong',
    hatColor: '#6b482e',
    mustache: '#2a1f1c',
    apron: '#c7a474',
  },
  /** Penjaga tungku hawu: baju lurik hangat + peci usang. */
  pengaduk2: {
    build: 'stout',
    skin: '#bd835b',
    jacket: '#7c6244',
    pants: '#36332e',
    boots: '#241d1b',
    hat: 'peci',
    hatColor: '#2a262c',
    mustache: '#36261e',
  },
  /** Warga era 1950-an meremehkan dodol sebagai makanan kampung. */
  kritikusKota: {
    build: 'stout',
    skin: '#e6be98',
    jacket: '#5f6f8a',
    pants: '#323846',
    boots: '#1f1b20',
    hat: 'hair',
    hairColor: '#2a2220',
    mustache: '#3b2d26',
    buttons: '#d8d2c4',
    glasses: true,
  },
  /** H. Iton Damiri & Aam Mawardi (1957–1959): kemeja putih/krem rapi + peci hitam. */
  pendiriPicnic: {
    build: 'adult',
    skin: '#d9a47c',
    jacket: '#e8dfc9',
    pants: '#343b4a',
    boots: '#221c1a',
    hat: 'peci',
    hatColor: '#201d24',
    sash: '#b8324a',
    buttons: '#c9a452',
    glasses: true,
  },
  /** Mitra/adik Aam Mawardi (1957–1959). */
  aamMawardi: {
    build: 'adult',
    skin: '#cfa078',
    jacket: '#4f6d8a',
    pants: '#2d3340',
    boots: '#221c1a',
    hat: 'peci',
    hatColor: '#201d24',
    buttons: '#e4dac4',
  },
  /** Wisatawan / pembeli modern di toko oleh-oleh. */
  pembeliModern: {
    build: 'adult',
    skin: '#e4b892',
    jacket: '#d67a44',
    pants: '#2f4562',
    boots: '#f2ede2',
    hat: 'hair',
    hairColor: '#29201c',
  },
  pembeliAnak: {
    build: 'kid',
    skin: '#eabfa0',
    jacket: '#f0b63a',
    pants: '#395a8e',
    boots: '#f5f2eb',
    hat: 'cap',
    hatColor: '#c93a4a',
  },
} as const satisfies Record<string, CharacterLook>;

export type LookId = keyof typeof LOOKS;

const hatBehind = (
  p: Pen,
  o: CharacterLook,
  H: BlobSpec,
  cx: number,
  hc: number,
  light: number,
  thick: number,
  ow: number,
  side: boolean,
): void => {
  if (o.hat === 'kerudung') {
    const col = o.hatColor ?? '#ebd9b8';
    const hb: BlobSpec = {
      ...H,
      a: H.a * 1.15,
      b: H.b * 1.16,
      asym: 0,
      egg: 0.06,
      seed: H.seed + 3,
    };
    const pts = blobPts(cx - (side ? 14 : 0) * (H.a / 50), hc + 0.08 * H.b, hb);
    p.shadedFill(pts, col, mulColor(col, SH_CLOTH), light, hb.a);
    p.inkRing(pts, ow * 0.88, thick);
  } else if (o.hat === 'sanggul' && side) {
    const col = o.hairColor ?? '#231918';
    p.ell(cx - H.a * 0.96, hc + H.b * 0.25, H.a * 0.34, H.b * 0.32, col, ow * 0.8);
  }
};

const hatOn = (
  p: Pen,
  o: CharacterLook,
  hp: P2[],
  H: BlobSpec,
  cx: number,
  hc: number,
  light: number,
  seed: number,
  facing: number,
  side: boolean,
): void => {
  const W = 2 * H.a;
  const HH = 2 * H.b;
  const u = W / 100;
  const crown = hc - H.b;
  const ow = 0.86 * 5 * u;
  const a = H.rot + rad(3 * (rnd(seed, 20) - 0.5));
  const R = (pts: P2[]) => rotPts(pts, a, cx, hc);

  if (o.hat === 'peci') {
    const col = o.hatColor ?? '#232028';
    const yb = crown + 0.28 * HH;
    const ht = 0.44 * HH;
    const wb = 46 * u;
    const wt = 42 * u;
    const sag: P2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      sag.push([cx + wb * (2 * t - 1), yb + 3.2 * u * (1 - (2 * t - 1) ** 2)]);
    }
    const body = R([...sag.reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, col, mulColor(col, SH_FELT), light, wt, 0.4);
    p.poly(body, null, ow);
  } else if (o.hat === 'totopong') {
    // Sundanese traditional headband / iket
    const col = o.hatColor ?? '#6b482e';
    const yb = crown + 0.32 * HH;
    const ht = 0.36 * HH;
    const body = R([
      [cx - 48 * u, yb + 2 * u],
      [cx + 48 * u, yb + 2 * u],
      [cx + 44 * u, yb - ht],
      [cx + 12 * u, yb - ht * 1.15],
      [cx - 18 * u, yb - ht * 0.9],
      [cx - 46 * u, yb - ht],
    ]);
    p.shadedFill(body, col, mulColor(col, SH_CLOTH), light, 48 * u, 0.4);
    p.poly(body, null, ow);
    // Knot tail on side/back
    if (side) {
      p.poly(
        R([
          [cx - 42 * u, yb - 4 * u],
          [cx - 64 * u, yb + 12 * u],
          [cx - 48 * u, yb + 18 * u],
        ]),
        shadeColor(col, 0.85),
        ow * 0.8,
      );
    }
  } else if (o.hat === 'kerudung') {
    const col = o.hatColor ?? '#ebd9b8';
    const cut = crown + 0.28 * HH;
    const keep = (_x: number, y: number): boolean => y < cut;
    const n = hp.length;
    const startIdx = Math.max(0, hp.findIndex((pt, i) => keep(pt[0], pt[1]) && !keep(hp[(i + n - 1) % n]![0], hp[(i + n - 1) % n]![1])));
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)]
      .filter(([x, y]) => keep(x, y))
      .map(([x, y]): P2 => [cx + (x - cx) * 1.04, hc + (y - hc) * 1.04]);
    if (arc.length >= 3) {
      p.shadedFill(arc, col, mulColor(col, SH_CLOTH), light, H.a, 0.35);
      p.poly(arc, null, ow);
    }
  } else if (o.hat === 'hair' || o.hat === 'cap') {
    const cut = crown + (o.hat === 'cap' ? 0.3 : 0.42) * HH;
    const keep = (x: number, y: number): boolean =>
      y < cut || (side && o.hat === 'hair' && x < cx - 6 * u && y < hc + 0.42 * H.b);
    const n = hp.length;
    const startIdx = Math.max(0, hp.findIndex((pt, i) => keep(pt[0], pt[1]) && !keep(hp[(i + n - 1) % n]![0], hp[(i + n - 1) % n]![1])));
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)]
      .filter(([x, y]) => keep(x, y))
      .map(([x, y]): P2 => [cx + (x - cx) * 1.03, hc + (y - hc) * 1.03]);
    if (arc.length < 3) return;
    if (o.hat === 'hair') {
      const [x0, y0] = arc[arc.length - 1]!;
      const [x1, y1] = arc[0]!;
      for (let i = 1; i < 6; i++) {
        arc.push([x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6 + (i % 2 ? 4 * u : 0)]);
      }
    }
    const col = o.hat === 'cap' ? (o.hatColor ?? '#c93a4a') : (o.hairColor ?? '#29201c');
    p.shadedFill(arc, col, mulColor(col, SH_FELT), light, H.a, 0.35);
    p.poly(arc, null, ow);
    if (o.hat === 'cap') {
      const deg = (a * 180) / Math.PI;
      if (side) {
        p.poly(
          R([
            [cx + 40 * u, cut - 2 * u],
            [cx + 74 * u, cut + 4 * u],
            [cx + 40 * u, cut + 6 * u],
          ]),
          shadeColor(col, 0.8),
          ow,
        );
      } else {
        const s = facing || 1;
        const [px, py] = R([[cx + s * 4 * u, cut + 1.5 * u]])[0]!;
        p.ell(px, py, 32 * u, 0.06 * HH, shadeColor(col, 0.8), ow, 0, 180, deg);
      }
    }
  }
};

// ── Bodies: Front/3-4 & True Side IK + Target-Anchored Actions ──────────────

const BUILD: Record<Build, { a: number; torso: number; legs: number; tw: number }> = {
  adult: { a: 114, torso: 1.1, legs: 1.4, tw: 0.78 },
  stout: { a: 114, torso: 1.15, legs: 1.32, tw: 0.92 },
  kid: { a: 108, torso: 0.85, legs: 1.0, tw: 0.72 },
};

export type ActionMode =
  | 'stand'
  | 'walk'
  | 'sit'
  | 'stir' // both hands gripping long wooden paddle into kancah cauldron
  | 'stoke' // crouching/kneeling by hawu stove stoking embers
  | 'pack' // leaning over table wrapping/cutting dodol blocks
  | 'taste' // holding slice of dodol up near mouth
  | 'present' // holding iconic red Picnic box
  | 'point'; // pointing naturally toward prop/subject

export interface ActorPoseOpts {
  view?: 'front' | 'side';
  mirror?: boolean;
  expr?: Expr;
  mode?: ActionMode;
  /** Walk / stir / stoke / action phase (0..1 or continuous). */
  phase?: number;
  /** Eye look offset -1..1. */
  look?: number;
  /** Blink 0..1. */
  blink?: number;
  /** Torso lean degrees (+ = forward/right). */
  tilt?: number;
  /** Head tilt degrees. */
  headTilt?: number;
  /** Key light angle on 2D canvas (radians). */
  light?: number;
  /** Facing bias for front/3-4 view (-1, 0, 1). */
  facing?: -1 | 0 | 1;
  seed?: number;
  /** Optional target anchor in canvas units for stir/stoke/pack contact. */
  handTarget?: readonly [number, number];
}

const footStroke = (p: Pen, a: P2, b: P2, w: number, col: string): void => {
  if (col !== INK) p.stroke([a, b], w + 3, INK);
  p.stroke([a, b], w, col);
};

const ik2 = (hip: P2, ank: P2, l1: number, l2: number): P2 => {
  const dx = ank[0] - hip[0];
  const dy = ank[1] - hip[1];
  const d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const k = Math.atan2(dy, dx) - A;
  return [hip[0] + l1 * Math.cos(k), hip[1] + l1 * Math.sin(k)];
};

function drawHandProp(p: Pen, kind: 'dodolSlice' | 'picnicBox' | 'songsong', hx: number, hy: number, u: number, ang = 0): void {
  const R = (pts: P2[]) => rotPts(pts, ang, hx, hy);
  if (kind === 'dodolSlice') {
    p.poly(
      R([
        [hx - 9 * u, hy - 14 * u],
        [hx + 9 * u, hy - 16 * u],
        [hx + 11 * u, hy + 4 * u],
        [hx - 7 * u, hy + 6 * u],
      ]),
      '#4a2514',
      2.4 * u,
    );
    // Glossy caramel highlight
    p.stroke(
      R([
        [hx - 4 * u, hy - 10 * u],
        [hx + 4 * u, hy - 11 * u],
      ]),
      2 * u,
      '#9b5a2e',
    );
  } else if (kind === 'picnicBox') {
    // Iconic beet-red/pink Picnic box with gold ribbon band
    p.poly(
      R([
        [hx - 20 * u, hy - 18 * u],
        [hx + 22 * u, hy - 18 * u],
        [hx + 22 * u, hy + 10 * u],
        [hx - 20 * u, hy + 10 * u],
      ]),
      '#c8284e',
      2.6 * u,
    );
    p.band(
      R([
        [hx - 20 * u, hy - 4 * u],
        [hx + 22 * u, hy - 4 * u],
      ]),
      '#f0c24b',
      5 * u,
      1 * u,
    );
  } else if (kind === 'songsong') {
    // Bamboo blowpipe aimed toward stove embers
    p.band(
      R([
        [hx - 8 * u, hy - 2 * u],
        [hx + 56 * u, hy + 16 * u],
      ]),
      '#c49b56',
      4.5 * u,
      1.5 * u,
      'round',
    );
  }
}

export function drawActorFront(p: Pen, o: CharacterLook, opts: ActorPoseOpts): void {
  const {
    phase = 0,
    expr = 'neutral',
    mode = 'stand',
    look = 0,
    blink = 0,
    tilt = 0,
    headTilt = 0,
    light = DEF_LIGHT,
    facing = 0,
    seed = 1,
  } = opts;
  const Bd = BUILD[o.build ?? 'adult'];
  const skin = o.skin;
  const two = Math.PI * 2;
  const H = headBlob(seed, Bd.a, facing);
  const W = 2 * H.a;
  const HH = 2 * H.b;
  const u = W / 100;
  const tall = (1 + Bd.torso + Bd.legs) * HH;
  const sole = 975;
  const bob = mode === 'walk' ? 0.018 * tall * Math.cos(2 * two * phase) : mode === 'stir' ? 0.012 * tall * Math.sin(two * phase) : 0;
  const torsoBot = mode === 'sit' ? sole - 0.22 * HH : sole - Bd.legs * HH + bob;
  const chin = torsoBot - Bd.torso * HH;
  const hc = chin - H.b;
  const hipY = torsoBot - 0.12 * HH;
  const thick = thickAngle(light);
  const ow = 5 * u;
  const legCol = mixColor(o.pants, INK, 0.52);
  const armCol = mixColor(o.jacket, INK, 0.45);
  const footCol = o.boots;
  const legW = 5.6 * u;
  const footW = 7.4 * u;

  // Legs
  p.rot = null;
  if (mode === 'sit') {
    for (const side of [-1, 1] as const) {
      const h: P2 = [300 + side * 15 * u, hipY];
      const k: P2 = [300 + side * 34 * u, hipY + 0.2 * HH];
      const f: P2 = [300 + side * 42 * u, sole - 8 * u];
      p.stroke(curvePts(h, k, f), legW, legCol);
      footStroke(p, [f[0] - side * 2 * u, f[1]], [f[0] + side * 12 * u, f[1] - 4 * u], footW, footCol);
    }
  } else if (o.dress) {
    for (const side of [-1, 1] as const) {
      const fx = 300 + side * 12 * u;
      const fy = sole - 4 * u;
      p.stroke(
        [
          [fx, sole - 0.4 * HH],
          [fx + side * u, fy],
        ],
        legW,
        legCol,
      );
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 12 * u, fy + u], footW, footCol);
    }
  } else {
    const L = mode === 'walk' ? 38 : 0;
    for (const [side, ph] of [
      [-1, 0],
      [1, 0.5],
    ] as const) {
      const up = Math.max(0, Math.sin(two * (phase + ph))) * L;
      const hx = 300 + side * 14 * u;
      const fx = 300 + side * 20 * u;
      const fy = sole - 4 * u - up;
      const k: P2 = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16), (hipY + fy) / 2 - up * 0.08];
      p.stroke(curvePts([hx, hipY], k, [fx, fy]), legW, legCol);
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 13 * u, fy + 0.5 * u], footW, footCol);
    }
  }

  // Torso
  const sway = mode === 'walk' ? 1.4 * Math.sin(two * phase) : mode === 'stir' ? 3.5 * Math.sin(two * phase) : 0;
  const A = tilt + sway;
  p.rot = A ? [rad(A), 300, hipY] : null;
  const T: BlobSpec = {
    a: ((Bd.tw / 2) * W) / 1.06,
    b: 0.5 * (torsoBot - (chin - 0.25 * HH)),
    nTop: 2.2,
    nBot: 2.6,
    egg: o.build === 'stout' ? 0.17 : 0.12,
    asym: 0.04 * facing,
    rot: 0,
    noise: 0.006,
    seed: seed + 7,
  };
  const tcx = 300 + 3 * u * facing;
  const tcy = torsoBot - T.b;
  const tp = blobPts(tcx, tcy, T);

  const sh = (side: number): P2 => [tcx + side * 0.85 * T.a, chin + 0.12 * HH];
  const hang = (side: number, fwd: number): [P2, P2, P2] => {
    const S = sh(side);
    const ex = tcx + side * (1.12 * T.a + 4 * u);
    const hx = ex + side * 3 * u - side * 6 * u * Math.max(0, fwd) + side * 4 * u * Math.max(0, -fwd);
    return [S, [ex, S[1] + 0.48 * HH], [hx, chin + 1.04 * HH - Math.abs(fwd) * 9 * u]];
  };

  const sw = mode === 'walk' ? Math.sin(two * phase) : 0;
  interface Arm {
    pts: [P2, P2, P2];
    front: boolean;
  }
  const arms: Arm[] = [];
  if (mode === 'sit') {
    for (const side of [-1, 1] as const) {
      const S = sh(side);
      arms.push({
        pts: [S, [tcx + side * (1.1 * T.a + 6 * u), S[1] + 0.4 * HH], [tcx + side * (1.15 * T.a + 8 * u), torsoBot + 0.02 * HH]],
        front: false,
      });
    }
  } else if (mode === 'stir') {
    const sx = Math.cos(two * phase) * 14 * u;
    const sy = Math.sin(two * phase) * 5 * u;
    const grip: P2 = [tcx + sx, chin + 0.72 * HH + sy];
    arms.push({ pts: [sh(-1), [tcx - 0.9 * T.a, chin + 0.56 * HH], [grip[0] - 8 * u, grip[1] - 4 * u]], front: true });
    arms.push({ pts: [sh(1), [tcx + 0.9 * T.a, chin + 0.56 * HH], [grip[0] + 8 * u, grip[1] + 4 * u]], front: true });
  } else if (mode === 'present') {
    arms.push({ pts: hang(-1, 0), front: false });
    const S = sh(1);
    arms.push({ pts: [S, [tcx + 0.95 * T.a, S[1] + 0.42 * HH], [tcx + 0.35 * T.a, S[1] + 0.44 * HH]], front: true });
  } else if (mode === 'taste') {
    arms.push({ pts: hang(-1, 0), front: false });
    const S = sh(1);
    arms.push({ pts: [S, [tcx + 1.05 * T.a, S[1] + 0.35 * HH], [tcx + 0.3 * T.a, chin + 0.02 * HH]], front: true });
  } else if (mode === 'point') {
    arms.push({ pts: hang(-1, 0), front: false });
    const S = sh(1);
    arms.push({ pts: [S, [tcx + 1.25 * T.a, S[1] + 0.1 * HH], [tcx + 1.65 * T.a, S[1] - 0.25 * HH]], front: false });
  } else {
    arms.push({ pts: hang(-1, -sw), front: false });
    arms.push({ pts: hang(1, sw), front: false });
  }

  const drawArm = (ar: Arm): void => {
    p.stroke(curvePts(ar.pts[0], ar.pts[1], ar.pts[2]), 5.2 * u, armCol);
    p.dot(ar.pts[2][0], ar.pts[2][1], 5.4 * u);
  };

  for (const ar of arms) if (!ar.front) drawArm(ar);

  if (o.dress) {
    const D: BlobSpec = {
      a: 0.5 * W * 0.98,
      b: 0.5 * (sole - 0.34 * HH - (chin - 0.2 * HH)),
      nTop: 2.0,
      nBot: 3.0,
      egg: 0.35,
      asym: 0.03 * facing,
      rot: 0,
      noise: 0.006,
      seed: seed + 9,
    };
    const dp = blobPts(300, sole - 0.34 * HH - D.b, D);
    p.gradFill(dp, o.dress, mulColor(o.dress, SH_CLOTH), light);
    p.inkRing(dp, ow, thick);
    const Sw: BlobSpec = { a: 0.37 * W, b: 0.3 * HH, nTop: 2.2, nBot: 2.4, egg: 0.1, asym: 0, rot: 0, noise: 0.006, seed: seed + 8 };
    const sp = blobPts(300, chin + 0.12 * HH, Sw);
    p.gradFill(sp, o.jacket, mulColor(o.jacket, SH_CLOTH), light);
    p.inkRing(sp, ow * 0.9, thick);
  } else {
    p.gradFill(tp, o.jacket, mulColor(o.jacket, SH_CLOTH), light);
    p.clip(tp, () => {
      if (o.apron) {
        p.poly(rrect(tcx - 0.68 * T.a, chin + 0.18 * HH, tcx + 0.68 * T.a, torsoBot + 0.1 * HH, 10 * u), o.apron, 2.2 * u);
      }
      if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
      for (let i = 0; i < 4; i++) {
        const y = chin + 0.14 * HH + i * 0.2 * HH;
        p.dot(tcx + 2 * u * facing, y, 2.6 * u, INK);
        p.dot(tcx + 2 * u * facing, y, 2.0 * u, o.buttons ?? shadeColor(o.jacket, 0.7));
      }
    });
    p.inkRing(tp, ow, thick);
  }

  for (const ar of arms) {
    if (!ar.front) continue;
    drawArm(ar);
    const [hx, hy] = ar.pts[2];
    if (mode === 'present') drawHandProp(p, 'picnicBox', hx, hy, u);
    else if (mode === 'taste') drawHandProp(p, 'dodolSlice', hx, hy, u, -0.2);
  }

  // Head
  const Ah = A + headTilt;
  const [cpx, cpy] = rotAbout([300, chin], rad(A), [300, hipY]);
  p.rot = Ah ? [rad(Ah), 300, chin, cpx - 300, cpy - chin] : null;
  hatBehind(p, o, H, 300, hc, light, thick, ow, false);
  const hp = blobPts(300, hc, H);
  p.shadedFill(hp, skin, mulColor(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  hatOn(p, o, hp, H, 300, hc, light, seed, facing, false);
  const brim = o.hat === 'peci' || o.hat === 'totopong' || o.hat === 'cap';
  drawFaceFront(p, 300, hc, W, expr, facing, look, blink, brim, skin, o.mustache, o.build === 'stout');
  p.rot = null;
}

/** True side profile (facing +X on canvas; flip mesh scale.x for -X) with 2-bone leg IK and real prop targets. */
export function drawActorSide(p: Pen, o: CharacterLook, opts: ActorPoseOpts): void {
  const {
    phase = 0,
    expr = 'neutral',
    mode = 'stand',
    blink = 0,
    tilt = 0,
    headTilt = 0,
    light = DEF_LIGHT,
    seed = 1,
    handTarget,
  } = opts;
  const Bd = BUILD[o.build ?? 'adult'];
  const skin = o.skin;
  const two = Math.PI * 2;
  const H: BlobSpec = { ...headBlob(seed, Bd.a, 1), asym: 0.12, rot: rad(3 + 3 * (rnd(seed, 7) - 0.5)) };
  const W = 2 * H.a;
  const HH = 2 * H.b;
  const u = W / 100;
  const sole = 975;
  const ankY = sole - 4 * u;
  const thick = thickAngle(light);
  const ow = 5 * u;
  const legLen = (Bd.legs + 0.12) * HH - 4 * u;
  const l1 = legLen / 2;
  const l2 = legLen / 2;
  const nearCol = mixColor(o.pants, INK, 0.52);
  const farCol = mixColor(o.pants, INK, 0.74);
  const footCol = o.boots;

  interface LegS {
    ank: P2;
    pitch: number;
    near: boolean;
    kneeOverride?: P2;
  }
  const legs: LegS[] = [];
  let hipY = ankY - legLen * 0.99;
  let hipX = 300;
  let lean = tilt;
  let nearFwd = 0;

  if (mode === 'walk') {
    const S = 320;
    const liftH = 38;
    const st = (ph: number) => {
      const c = (((phase + ph) % 1) + 1) % 1;
      if (c < 0.5) {
        const s = c / 0.5;
        return { x: S / 2 - S * s, h: 0, stance: true, s };
      }
      const s = (c - 0.5) / 0.5;
      return {
        x: -S / 2 + S * s - (S / Math.PI) * Math.sin(two * s * 0.5),
        h: liftH * Math.sin(Math.PI * s),
        stance: false,
        s,
      };
    };
    const nL = st(0);
    const fL = st(0.5);
    const stance = nL.stance ? nL : fL;
    const Leff = legLen * (1 - 0.03 * Math.sin(Math.PI * stance.s));
    hipY = ankY - Math.sqrt(Math.max(1, Leff * Leff - stance.x * stance.x));
    for (const [L, near] of [
      [fL, false],
      [nL, true],
    ] as const) {
      legs.push({
        ank: [300 + L.x, ankY - L.h],
        pitch: L.stance ? 0 : rad(30 * Math.sin(Math.PI * L.s) * (1 - 1.5 * L.s)),
        near,
      });
    }
    lean += 4 + 2.5 * Math.cos(2 * two * phase);
    nearFwd = nL.x / (S / 2);
  } else if (mode === 'stoke') {
    // Low crouch/squat beside the wood-fired hawu stove
    hipX = 276;
    hipY = ankY - 0.54 * legLen;
    legs.push({ ank: [262, ankY], pitch: rad(-10), near: false, kneeOverride: [322, hipY + 0.16 * legLen] });
    legs.push({ ank: [306, ankY], pitch: 0, near: true, kneeOverride: [348, hipY + 0.14 * legLen] });
    lean += 22;
  } else if (mode === 'stir' || mode === 'pack') {
    // Braced athletic stance leaning toward cauldron or worktable
    hipY = ankY - 0.91 * legLen;
    legs.push({ ank: [266, ankY], pitch: rad(-4), near: false });
    legs.push({ ank: [330, ankY], pitch: 0, near: true });
    lean += mode === 'stir' ? 14 + 4 * Math.sin(two * phase) : 16;
  } else if (mode === 'sit') {
    hipX = 278;
    hipY = sole - 0.56 * legLen;
    for (const near of [false, true]) {
      const dx = near ? 6 * u : -6 * u;
      const knee: P2 = [hipX + l1 * 0.92 + dx, hipY + 6 * u];
      legs.push({ ank: [knee[0] + 10 * u, ankY], pitch: 0, near, kneeOverride: knee });
    }
    lean += 6;
  } else {
    legs.push({ ank: [294, ankY], pitch: 0, near: false }, { ank: [308, ankY], pitch: 0, near: true });
  }

  const torsoBot = hipY + 0.12 * HH;
  const chin = torsoBot - Bd.torso * HH;
  const hc = chin - H.b;
  const hip: P2 = [hipX, hipY];

  p.rot = null;
  for (const L of legs) {
    const knee = L.kneeOverride ?? ik2(hip, L.ank, l1, l2);
    const hp0: P2 = [hipX + (L.near ? 0 : -5 * u), hipY];
    p.stroke([hp0, knee, L.ank], 5.6 * u, L.near ? nearCol : farCol);
    const c = Math.cos(L.pitch);
    const s = Math.sin(L.pitch);
    footStroke(
      p,
      [L.ank[0] - 3 * u * c, L.ank[1] - 3 * u * s],
      [L.ank[0] + 13 * u * c, L.ank[1] + 13 * u * s + 0.5 * u],
      7.4 * u,
      L.near ? footCol : shadeColor(footCol, 0.82),
    );
  }

  p.rot = lean ? [rad(lean), hipX, hipY] : null;
  const T: BlobSpec = {
    a: (o.build === 'stout' ? 0.36 : 0.31) * W,
    b: 0.5 * (torsoBot - (chin - 0.25 * HH)),
    nTop: 2.2,
    nBot: 2.5,
    egg: 0.1,
    asym: 0.06,
    rot: 0,
    noise: 0.006,
    seed: seed + 7,
  };
  const tcx = hipX + 2 * u;
  const tcy = torsoBot - T.b;
  const tp = blobPts(tcx, tcy, T);
  const armCol = mixColor(o.jacket, INK, 0.45);
  const farArm = mixColor(o.jacket, INK, 0.68);
  const S: P2 = [tcx + 0.05 * T.a, chin + 0.14 * HH];
  const aLen = 0.96 * HH;

  const swingArm = (ang: number): [P2, P2, P2] => {
    const e: P2 = [S[0] + Math.sin(ang) * aLen * 0.5, S[1] + Math.cos(ang) * aLen * 0.5];
    const a2 = ang + rad(16) * Math.sign(ang || 1);
    return [S, e, [e[0] + Math.sin(a2) * aLen * 0.5, e[1] + Math.cos(a2) * aLen * 0.5]];
  };

  // Convert final-canvas handTarget into torso-local coordinates (undoing lean)
  const localGoal = (gx: number, gy: number): P2 => {
    if (!lean) return [gx, gy];
    const th = -rad(lean);
    const dx = gx - hipX;
    const dy = gy - hipY;
    return [hipX + dx * Math.cos(th) - dy * Math.sin(th), hipY + dx * Math.sin(th) + dy * Math.cos(th)];
  };

  let near: [P2, P2, P2];
  let far: [P2, P2, P2] | null = null;
  let heldProp: 'dodolSlice' | 'picnicBox' | 'songsong' | null = null;

  if (mode === 'stir') {
    // Both hands drive the wooden paddle in an elliptical stir inside the cauldron!
    const sx = Math.cos(two * phase) * 20 * u;
    const sy = Math.sin(two * phase) * 10 * u;
    const target = handTarget ? localGoal(handTarget[0] + sx, handTarget[1] + sy) : ([S[0] + 0.85 * HH + sx, S[1] + 0.42 * HH + sy] as P2);
    near = [S, [(S[0] + target[0]) * 0.5 - 6 * u, (S[1] + target[1]) * 0.5 + 12 * u], target];
    const topHand: P2 = [target[0] - 12 * u, target[1] - 28 * u];
    far = [S, [(S[0] + topHand[0]) * 0.5 + 4 * u, (S[1] + topHand[1]) * 0.5 + 8 * u], topHand];
  } else if (mode === 'stoke') {
    const push = Math.sin(two * phase) * 10 * u;
    const g = handTarget ? localGoal(handTarget[0] + push, handTarget[1]) : ([S[0] + 0.75 * HH + push, S[1] + 0.35 * HH] as P2);
    near = [S, [(S[0] + g[0]) * 0.5 - 8 * u, (S[1] + g[1]) * 0.5 + 14 * u], g];
    far = [S, [S[0] + 0.25 * HH, S[1] + 0.25 * HH], [g[0] - 10 * u, g[1] - 10 * u]];
    heldProp = 'songsong';
  } else if (mode === 'pack') {
    const work = Math.sin(two * phase) * 8 * u;
    const g = handTarget ? localGoal(handTarget[0] + work, handTarget[1]) : ([S[0] + 0.7 * HH + work, S[1] + 0.42 * HH] as P2);
    near = [S, [(S[0] + g[0]) * 0.5, (S[1] + g[1]) * 0.5 + 10 * u], g];
    far = [S, [(S[0] + g[0]) * 0.5 + 4 * u, (S[1] + g[1]) * 0.5 + 4 * u], [g[0] + 10 * u, g[1] - 6 * u]];
  } else if (mode === 'taste') {
    const g: P2 = [S[0] + 0.42 * HH, chin + 0.05 * HH];
    near = [S, [S[0] + 0.38 * HH, S[1] + 0.25 * HH], g];
    heldProp = 'dodolSlice';
  } else if (mode === 'present') {
    const g: P2 = [S[0] + 0.72 * HH, S[1] + 0.28 * HH];
    near = [S, [S[0] + 0.36 * HH, S[1] + 0.38 * HH], g];
    far = [S, [S[0] + 0.42 * HH, S[1] + 0.3 * HH], [g[0] + 8 * u, g[1] - 4 * u]];
    heldProp = 'picnicBox';
  } else if (mode === 'point') {
    const g: P2 = [S[0] + 0.85 * HH, S[1] - 0.06 * HH];
    near = [S, [S[0] + 0.42 * HH, S[1] + 0.04 * HH], g];
  } else {
    near = swingArm(rad(-30) * nearFwd);
    far = mode === 'walk' ? swingArm(rad(30) * nearFwd) : null;
  }

  if (far) {
    p.stroke(curvePts(far[0], far[1], far[2]), 5.2 * u, farArm);
    p.dot(far[2][0], far[2][1], 5.4 * u);
  }

  p.gradFill(tp, o.jacket, mulColor(o.jacket, SH_CLOTH), light);
  p.clip(tp, () => {
    if (o.apron) p.poly(rrect(tcx, chin + 0.16 * HH, tcx + 1.1 * T.a, torsoBot + 0.1 * HH, 8 * u), o.apron, 2.2 * u);
    if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
    for (let i = 0; i < 3; i++) {
      const y = chin + 0.16 * HH + i * 0.24 * HH;
      p.dot(tcx + 0.78 * T.a, y, 2.8 * u, INK);
      p.dot(tcx + 0.78 * T.a, y, 2.1 * u, o.buttons ?? shadeColor(o.jacket, 0.7));
    }
  });
  p.inkRing(tp, ow, thick);

  p.stroke(curvePts(near[0], near[1], near[2]), 5.2 * u, armCol);
  p.dot(near[2][0], near[2][1], 5.4 * u);
  if (heldProp) drawHandProp(p, heldProp, near[2][0], near[2][1], u);

  // Head
  const hx = hipX + 4 * u;
  p.rot = lean || headTilt ? [rad(lean + headTilt), hipX, hipY] : null;
  hatBehind(p, o, H, hx, hc, light, thick, ow, true);
  const hp = blobPts(hx, hc, H);
  p.shadedFill(hp, skin, mulColor(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  hatOn(p, o, hp, H, hx, hc, light, seed, 1, true);
  const brim = o.hat === 'peci' || o.hat === 'totopong' || o.hat === 'cap';
  drawFaceSide(p, hx, hc, W, expr, blink, brim, skin, o.mustache, o.build === 'stout');
  p.rot = null;
}

// ── Lit Card Shader (`cardShade`) & Canvas Pool ─────────────────────────────

export const CARD_SHADER_UNIFORMS = {
  uCharTint: { value: new THREE.Color(1, 0.96, 0.92) },
  uCharShade: { value: 0.86 },
  uGrad: { value: 0.06 },
  uBodyGrad: { value: 0.08 },
  uSideTint: { value: new THREE.Color(0.84, 0.82, 0.96) },
  uGradK: { value: 4.0 },
  uGradKB: { value: 1.5 },
  uTintK: { value: 0.5 },
  uNorm: { value: 0.7 },
  uGain: { value: 1.04 },
};

const CARD_DECL = /* glsl */ `
#include <common>
uniform vec3 uCharTint;
uniform float uCharShade;
uniform float uGrad;
uniform float uBodyGrad;
uniform vec3 uSideTint;
uniform float uGradK;
uniform float uGradKB;
uniform float uTintK;
uniform float uNorm;
uniform float uGain;
`;

const CARD_OUTGOING = /* glsl */ `
vec3 tintK = mix( vec3( 1.0 ), uCharTint, uTintK );
tintK /= pow( max( dot( tintK, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.2 ), uNorm );
vec3 outgoingLight = diffuseColor.rgb * tintK;
#if NUM_DIR_LIGHTS > 0
{
  vec3 sunV = directionalLights[ 0 ].direction;
  float side = sign( sunV.x ) * smoothstep( 0.0, 0.35, abs( sunV.x ) );
  float head = smoothstep( 0.565, 0.6, vMapUv.y );
  float hw = mix( 0.15, 0.2, head );
  float uu = clamp( ( vMapUv.x - 0.5 ) / hw, -1.0, 1.0 ) * sign( dFdx( vMapUv.x ) + 1e-7 );
  float t = uu * side;
  float g = mix( uBodyGrad * uGradKB, min( uGrad * uGradK, 0.36 ), head );
  float dark = smoothstep( -0.15, 0.9, -t );
  vec3 sideK = mix( vec3( 1.0 ), uSideTint, dark * 0.45 );
  float lift = 1.0 + 0.04 * smoothstep( 0.0, 0.9, t );
  outgoingLight *= mix( uCharShade, 1.0, 0.85 ) * ( 1.0 - g * dark ) * sideK * lift * uGain;
}
#endif
`;

export function makeCardMaterial(map: THREE.Texture): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    map,
    alphaTest: 0.48,
    side: THREE.DoubleSide,
  });
  m.emissive.set(0x000000);
  m.emissiveIntensity = 0;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CARD_SHADER_UNIFORMS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', CARD_DECL)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        CARD_OUTGOING,
      );
  };
  m.customProgramCacheKey = () => 'dodol_card_v3';
  return m;
}

// ── Actor Billboard Wrapper ─────────────────────────────────────────────────

export const SU = 0.00216;
export const ACTOR_W_M = 600 * SU; // 1.296 m
export const ACTOR_H_M = 1000 * SU; // 2.16 m
export const SOLE_Y = 975;
export const HEAD_TOP_M = 1.68;

const BODY_GEO = (() => {
  const g = new THREE.PlaneGeometry(ACTOR_W_M, ACTOR_H_M);
  g.translate(0, (SOLE_Y - 500) * SU, 0);
  return g;
})();

export interface V3Actor {
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly blob: THREE.Mesh;
  update: (opts: ActorPoseOpts & { worldPos: THREE.Vector3; camPos: THREE.Vector3; camRight: THREE.Vector3; sunPos: THREE.Vector3; scale?: number }) => void;
  dispose: () => void;
}

const tmpV = new THREE.Vector3();

/** Deterministic 4-frame micro-blink every 1.4–3.2 s. */
export function blinkAt(frame: number, seed: number): number {
  const f = Math.round(frame);
  let s = Math.round(-45 * rnd(seed, 9));
  const seq = [0.5, 1, 1, 0.5];
  for (let n = 0; s <= f && n < 200; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return seq[k] ?? 0;
    s += Math.round(42 + 54 * rnd(seed * 31 + n, 13));
  }
  return 0;
}

export function createV3Actor(lookId: LookId, seed = 1): V3Actor {
  const look = LOOKS[lookId];
  const group = new THREE.Group();
  group.userData.noInk = true;

  const cw = 720;
  const ch = 1200;
  const k = 1.2;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const mat = makeCardMaterial(tex);
  const dmat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: tex,
    alphaTest: 0.48,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(BODY_GEO, mat);
  mesh.customDepthMaterial = dmat;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.noInk = true;
  group.add(mesh);

  // Soft contact shadow blob directly under soles
  const bcv = document.createElement('canvas');
  bcv.width = 128;
  bcv.height = 128;
  const bg = bcv.getContext('2d')!;
  const gr = bg.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(32, 22, 46, 0.48)');
  gr.addColorStop(0.55, 'rgba(32, 22, 46, 0.24)');
  gr.addColorStop(1, 'rgba(32, 22, 46, 0.0)');
  bg.fillStyle = gr;
  bg.fillRect(0, 0, 128, 128);
  const btex = new THREE.CanvasTexture(bcv);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.44),
    new THREE.MeshBasicMaterial({ map: btex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.015;
  blob.userData.noInk = true;
  group.add(blob);

  let lastKey = '';

  const update = (
    opts: ActorPoseOpts & { worldPos: THREE.Vector3; camPos: THREE.Vector3; camRight: THREE.Vector3; sunPos: THREE.Vector3; scale?: number },
  ): void => {
    const scale = opts.scale ?? 1.0;
    group.position.copy(opts.worldPos);
    mesh.scale.set(opts.mirror ? -scale : scale, scale, scale);
    blob.scale.setScalar(scale);

    // Yaw billboard toward camera
    const dx = opts.camPos.x - opts.worldPos.x;
    const dz = opts.camPos.z - opts.worldPos.z;
    mesh.rotation.y = Math.atan2(dx, dz);

    // Compute 2D canvas angle of sun from camera perspective
    tmpV.copy(opts.sunPos).normalize();
    const sx = tmpV.dot(opts.camRight) * (opts.mirror ? -1 : 1);
    const sy = -tmpV.y;
    const light2d = Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);

    const q = (v: number | undefined, n = 40): number => Math.round((v ?? 0) * n) / n;
    const key = [
      opts.view ?? 'front',
      opts.expr ?? 'neutral',
      opts.mode ?? 'stand',
      q(opts.phase, 30),
      q(opts.blink, 4),
      q(opts.look, 10),
      q(opts.tilt, 10),
      q(opts.headTilt, 10),
      q(light2d, 10),
      opts.facing ?? 0,
      opts.handTarget ? `${q(opts.handTarget[0], 5)}:${q(opts.handTarget[1], 5)}` : '',
    ].join('|');

    if (key !== lastKey) {
      lastKey = key;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      g.setTransform(k, 0, 0, k, 0, 0);
      const pen = new Pen(g);
      const drawOpts: ActorPoseOpts = { ...opts, light: light2d, seed };
      if (opts.view === 'side') drawActorSide(pen, look, drawOpts);
      else drawActorFront(pen, look, drawOpts);
      tex.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    tex.dispose();
    mat.dispose();
    dmat.dispose();
    btex.dispose();
    (blob.material as THREE.Material).dispose();
    blob.geometry.dispose();
  };

  return { group, mesh, blob, update, dispose };
}
