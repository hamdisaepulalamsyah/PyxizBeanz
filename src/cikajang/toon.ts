import * as THREE from 'three';
import type { ArmPose, BodyPose, BodyProp, Expression, HandProp, LookId } from './story';
import { clamp01, hash01, lerp, smoothstep } from './story';

/**
 * Full-body Canvas2D cartoon billboards for "Sejarah Cikajang". The lead, every
 * extra and the animals share this one system so the visual style is uniform.
 *
 * Guarantees enforced by construction:
 *  - Both arms are always painted as continuous 2-bone limbs solved by IK from
 *    the shoulder; gesture changes blend the hand *target*, so hands never
 *    vanish or pop in.
 *  - Each hand carries at most one prop for the whole shot (one pen, one chalk).
 *  - Legs and shoes are always painted down to the sole line, which sits on the
 *    billboard origin, so planted figures stand exactly on the floor.
 */

const LW = 512;
const LH = 1024;
const TEXTURE_SCALE = 0.75;
const CX = LW / 2;
/** Canvas y of the shoe soles. */
const SOLE = LH - 8;

export const ACTOR_PLANE_HEIGHT = 1.7;
export const ACTOR_PLANE_WIDTH = (ACTOR_PLANE_HEIGHT * LW) / LH;
const PX = LH / ACTOR_PLANE_HEIGHT;
/** Seat and desk heights (world units at scale 1) the seated poses are drawn for. */
export const SEAT_HEIGHT = 0.46;
export const DESK_HEIGHT = 0.76;
const DESK_Y = SOLE - DESK_HEIGHT * PX;

const INK = '#22161f';
const OUTLINE = 8;

type Pt = readonly [number, number];

// ── Looks ───────────────────────────────────────────────────────────────────

type Headwear = 'hijab' | 'peci' | 'caping' | 'kepi' | 'stationCap' | 'hairShort' | 'hairBun' | 'hairKid' | 'cap';
type Top = 'jacket' | 'kemeja' | 'uniform' | 'kebaya' | 'koko' | 'kaos' | 'lurik' | 'polo';
type Bottom = 'pants' | 'sarung' | 'skirt' | 'shorts';
type Shoes = 'sneakers' | 'boots' | 'shoes' | 'sandals';

interface HumanLook {
  kind: 'human';
  skin: string;
  skinShade: string;
  hair: string;
  headwear: Headwear;
  headwearColor: string;
  top: Top;
  topColor: string;
  topShade: string;
  accent: string;
  bottom: Bottom;
  bottomColor: string;
  shoes: Shoes;
  shoeColor: string;
  mustache: boolean;
  glasses: boolean;
  packColor: string;
}

interface CritterLook {
  kind: 'critter';
  species: 'ayam' | 'kucing';
  color: string;
  accent: string;
}

type Look = HumanLook | CritterLook;

const human = (l: Partial<HumanLook> & Pick<HumanLook, 'skin' | 'headwear' | 'top' | 'topColor' | 'bottom' | 'bottomColor' | 'shoes'>): HumanLook => ({
  kind: 'human',
  skinShade: shade(l.skin, -0.14),
  hair: '#1f1716',
  headwearColor: '#1d1a22',
  topShade: shade(l.topColor, -0.16),
  accent: '#f4efe6',
  shoeColor: '#1d1a1a',
  mustache: false,
  glasses: false,
  packColor: '#c4553d',
  ...l,
});

export const LOOKS: Record<LookId, Look> = {
  dinda: human({ skin: '#dcab80', headwear: 'hijab', headwearColor: '#d9a441', top: 'jacket', topColor: '#5b7fb5', accent: '#f6f1e7', bottom: 'pants', bottomColor: '#2e3346', shoes: 'sneakers', shoeColor: '#f1ece4', packColor: '#c4553d' }),
  petani: human({ skin: '#b97f57', headwear: 'caping', headwearColor: '#d8b878', top: 'lurik', topColor: '#6b5a44', bottom: 'pants', bottomColor: '#3d3a35', shoes: 'boots', shoeColor: '#2b2b2b', mustache: true }),
  kepalaStasiun: human({ skin: '#d6a074', headwear: 'stationCap', headwearColor: '#f1ece0', top: 'uniform', topColor: '#ece5d3', accent: '#c9a14a', bottom: 'pants', bottomColor: '#e2dac6', shoes: 'shoes', mustache: true, glasses: true }),
  stafKoran: human({ skin: '#c99068', headwear: 'peci', top: 'kemeja', topColor: '#d9cfb8', bottom: 'pants', bottomColor: '#5a4a3a', shoes: 'shoes', shoeColor: '#2a201a' }),
  kondektur: human({ skin: '#cf9a70', headwear: 'kepi', headwearColor: '#2d3550', top: 'uniform', topColor: '#34405e', accent: '#d9b45a', bottom: 'pants', bottomColor: '#2c3550', shoes: 'shoes', mustache: true }),
  penumpangPria: human({ skin: '#c99068', headwear: 'hairShort', top: 'kemeja', topColor: '#e8e2d2', bottom: 'sarung', bottomColor: '#6a3b2e', shoes: 'sandals', shoeColor: '#5a3a24' }),
  penumpangWanita: human({ skin: '#d9a77c', headwear: 'hairBun', top: 'kebaya', topColor: '#d98c7a', bottom: 'skirt', bottomColor: '#5b3a2a', shoes: 'sandals', shoeColor: '#6a4128' }),
  ibuBakul: human({ skin: '#c48a62', headwear: 'hijab', headwearColor: '#7a8f6a', top: 'kebaya', topColor: '#c9b48a', bottom: 'skirt', bottomColor: '#4a3426', shoes: 'sandals', shoeColor: '#5a3a24' }),
  bapakPeci: human({ skin: '#b98058', headwear: 'peci', top: 'koko', topColor: '#f0ebe0', accent: '#b9a77a', bottom: 'sarung', bottomColor: '#3e4a6a', shoes: 'sandals', shoeColor: '#4a3020', mustache: true }),
  petugas1935: human({ skin: '#d0986e', headwear: 'stationCap', headwearColor: '#ece6d6', top: 'uniform', topColor: '#e8e0cc', accent: '#c9a14a', bottom: 'pants', bottomColor: '#e0d8c4', shoes: 'shoes' }),
  pekerjaRel: human({ skin: '#a87250', headwear: 'caping', headwearColor: '#cfae6e', top: 'kaos', topColor: '#8a6e4e', bottom: 'pants', bottomColor: '#3a3a3a', shoes: 'boots', shoeColor: '#2a2624' }),
  pekerjaRel2: human({ skin: '#b37a54', headwear: 'hairShort', top: 'lurik', topColor: '#5c4c3c', bottom: 'pants', bottomColor: '#45403a', shoes: 'boots', shoeColor: '#262220', mustache: true }),
  petugas1980: human({ skin: '#cf9a70', headwear: 'kepi', headwearColor: '#3c4636', top: 'uniform', topColor: '#8f9a7a', accent: '#d8c070', bottom: 'pants', bottomColor: '#3a3f36', shoes: 'shoes', mustache: true, glasses: true }),
  petugas1982: human({ skin: '#c58f66', headwear: 'stationCap', headwearColor: '#d9d3c0', top: 'uniform', topColor: '#a19a7c', accent: '#d8c070', bottom: 'pants', bottomColor: '#4a4a40', shoes: 'shoes' }),
  anak: human({ skin: '#d6a074', headwear: 'hairKid', top: 'kaos', topColor: '#d65a4a', bottom: 'shorts', bottomColor: '#3a4a6a', shoes: 'sandals', shoeColor: '#3a5a8a' }),
  anakModern: human({ skin: '#d8a478', headwear: 'hairKid', top: 'kaos', topColor: '#f2c230', bottom: 'shorts', bottomColor: '#2e5c8a', shoes: 'sneakers', shoeColor: '#e8e4dc' }),
  warga: human({ skin: '#be855d', headwear: 'caping', headwearColor: '#d2b072', top: 'kebaya', topColor: '#8a7a5a', bottom: 'skirt', bottomColor: '#4f3b2c', shoes: 'sandals', shoeColor: '#4a3020' }),
  penumpangModern: human({ skin: '#cf9a70', headwear: 'cap', headwearColor: '#2e2e36', top: 'polo', topColor: '#3d8a8a', bottom: 'pants', bottomColor: '#2a2a3a', shoes: 'sneakers', shoeColor: '#f0ece4' }),
  penumpangModern2: human({ skin: '#dcab80', headwear: 'hijab', headwearColor: '#c25a7a', top: 'kemeja', topColor: '#ece3d4', bottom: 'skirt', bottomColor: '#3a3a50', shoes: 'sneakers', shoeColor: '#f0ece4', packColor: '#3f5f8a' }),
  ayam: { kind: 'critter', species: 'ayam', color: '#f3ead8', accent: '#d8402e' },
  kucing: { kind: 'critter', species: 'kucing', color: '#e39a4b', accent: '#b8672a' },
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ── Expressions ─────────────────────────────────────────────────────────────

interface Face {
  lid: number;
  browRaise: number;
  browInner: number;
  browAsym: number;
  smile: number;
  open: number;
  lookY: number;
}

const FACES: Record<Expression, Face> = {
  neutral: { lid: 0.18, browRaise: 0.1, browInner: 0, browAsym: 0, smile: 0.15, open: 0, lookY: 0 },
  warm: { lid: 0.12, browRaise: 0.3, browInner: 0.1, browAsym: 0, smile: 0.7, open: 0.1, lookY: 0 },
  serious: { lid: 0.3, browRaise: 0, browInner: -0.8, browAsym: 0, smile: -0.15, open: 0, lookY: 0.1 },
  thinking: { lid: 0.24, browRaise: 0.3, browInner: 0.1, browAsym: 0.7, smile: -0.05, open: 0, lookY: -0.5 },
  sad: { lid: 0.4, browRaise: 0.15, browInner: 0.85, browAsym: 0, smile: -0.5, open: 0, lookY: 0.6 },
  wonder: { lid: 0, browRaise: 0.8, browInner: 0.3, browAsym: 0, smile: 0.2, open: 0.55, lookY: -0.2 },
};

function mixFace(a: Face, b: Face, t: number): Face {
  return {
    lid: lerp(a.lid, b.lid, t),
    browRaise: lerp(a.browRaise, b.browRaise, t),
    browInner: lerp(a.browInner, b.browInner, t),
    browAsym: lerp(a.browAsym, b.browAsym, t),
    smile: lerp(a.smile, b.smile, t),
    open: lerp(a.open, b.open, t),
    lookY: lerp(a.lookY, b.lookY, t),
  };
}

function blinkAt(frame: number, seed: number): number {
  const period = 110;
  const k = Math.floor(frame / period);
  const t0 = k * period + 20 + hash01(seed, k) * 70;
  const d = frame - t0;
  return d >= 0 && d < 7 ? Math.sin((d / 7) * Math.PI) : 0;
}

// ── Skeleton ────────────────────────────────────────────────────────────────

interface Leg {
  hip: Pt;
  knee: Pt;
  ankle: Pt;
  /** Shoe lift above the sole line (walking). */
  lift: number;
}

interface Skeleton {
  pose: BodyPose;
  headX: number;
  headY: number;
  shY: number;
  shHalf: number;
  hipY: number;
  hipHalf: number;
  /** [0] = character's right (screen left), [1] = character's left. */
  legs: readonly [Leg, Leg];
}

const SIGN = [-1, 1] as const;

function skeleton(pose: BodyPose, frame: number, seed: number, walkPhase: number | null, nod: number): Skeleton {
  const breath = Math.sin((frame / 30) * Math.PI * 2 * 0.22 + seed) * 2.5;
  const bob = walkPhase === null ? 0 : Math.abs(Math.sin(walkPhase)) * -6;
  const shift = pose === 'sit' ? SOLE - SEAT_HEIGHT * PX - 600 : pose === 'crouch' ? 250 : 0;
  const hipY = 600 + shift + bob;
  const shY = 344 + shift + bob - breath;
  const legs = SIGN.map((s, i): Leg => {
    if (pose === 'sit') return { hip: [CX + s * 42, hipY], knee: [CX + s * 50, hipY + 34], ankle: [CX + s * 52, 972], lift: 0 };
    if (pose === 'crouch') return { hip: [CX + s * 40, hipY], knee: [CX + s * 84, 790], ankle: [CX + s * 66, 974], lift: 0 };
    const lift = walkPhase === null ? 0 : Math.max(0, Math.sin(walkPhase + i * Math.PI)) * 24;
    const swing = walkPhase === null ? 0 : Math.sin(walkPhase + i * Math.PI) * 6;
    return { hip: [CX + s * 34, hipY], knee: [CX + s * 38 + swing, 800 - lift * 0.5], ankle: [CX + s * 40 + swing * 1.4, 972 - lift], lift };
  }) as unknown as readonly [Leg, Leg];
  return { pose, headX: CX, headY: 200 + shift + bob - breath * 0.6 + nod * 12, shY, shHalf: 70, hipY, hipHalf: 52, legs };
}

// ── Arms (2-bone IK) ────────────────────────────────────────────────────────

const UPPER = 112;
const FORE = 104;

interface ArmCtx {
  frame: number;
  progress: number;
  drawProgress: number;
  turn: number;
  sk: Skeleton;
}

/** Descending ridership line on the lap board, in board-relative 0..1 coords. */
const GRAPH: readonly Pt[] = [[0.08, 0.18], [0.24, 0.24], [0.38, 0.2], [0.52, 0.42], [0.66, 0.5], [0.8, 0.72], [0.93, 0.86]];
const BOARD_W = 210;
const BOARD_H = 150;

function boardRect(sk: Skeleton): { x: number; y: number } {
  return { x: CX - BOARD_W / 2, y: sk.hipY - BOARD_H - 6 };
}

function polylineAt(pts: readonly Pt[], t: number): Pt {
  const n = pts.length - 1;
  const f = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const a = pts[i] ?? [0, 0];
  const b = pts[i + 1] ?? a;
  const u = f - i;
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
}

function chalkTip(sk: Skeleton, p: number): Pt {
  const r = boardRect(sk);
  const [u, v] = polylineAt(GRAPH, p);
  return [r.x + u * BOARD_W, r.y + v * BOARD_H];
}

const NOTE_LINES = 5;

function notebookWritePoint(frame: number, progress: number): Pt {
  const p = clamp01(progress) * NOTE_LINES;
  const line = Math.min(NOTE_LINES - 1, Math.floor(p));
  const f = p - line;
  return [CX - 86 + f * 70 + Math.sin(frame * 1.7) * 2, DESK_Y - 34 + line * 6 + Math.sin(frame * 2.3) * 1.2];
}

function handTarget(pose: ArmPose, side: 0 | 1, c: ArmCtx): Pt {
  const s = SIGN[side];
  const { sk, frame } = c;
  const sx = CX + s * sk.shHalf;
  const sy = sk.shY + 14;
  const rel = (out: number, down: number): Pt => [sx + s * out, sy + down];
  const leg = sk.legs[side];
  switch (pose) {
    case 'side':
      return rel(20 + Math.sin(frame * 0.05 + side) * 2, 204);
    case 'hip':
      return rel(30, 164);
    case 'strap':
      return rel(-22, 52);
    case 'pocket':
      return rel(-4, 200);
    case 'point':
      return rel(206, -14);
    case 'pointHigh':
      return rel(152, -150);
    case 'pointSide':
      return rel(196, 52);
    case 'spread':
      return rel(184, -40);
    case 'trace':
      return rel(194 + Math.sin(frame * 0.06) * 10, 36 + Math.sin(frame * 0.11) * 6);
    case 'traceLow':
      return rel(184 + Math.sin(frame * 0.06) * 8, 66 + Math.sin(frame * 0.1) * 4);
    case 'knee':
      return [leg.knee[0] + s * 4, leg.knee[1] - 14];
    case 'lap':
      return sk.pose === 'stand' ? rel(20, 204) : [CX + s * 40, sk.hipY + 22];
    case 'write': {
      const [wx, wy] = notebookWritePoint(frame, c.progress);
      return [wx - 12, wy - 28];
    }
    case 'pressPage':
      return [CX + s * 58, DESK_Y - 22];
    case 'chalk': {
      const [tx, ty] = chalkTip(sk, c.drawProgress);
      return [tx - 8, ty - 16];
    }
    case 'holdBoard': {
      const r = boardRect(sk);
      return [CX + s * (BOARD_W / 2 + 4), r.y + BOARD_H * 0.5];
    }
    case 'whistle':
      return [sk.headX + c.turn * 26 + s * 14, sk.headY + 64];
    case 'lampLow':
      return rel(40, 184);
    case 'hammer': {
      const cyc = (((frame + side * 7) % 26) + 26) % 26 / 26;
      const raise = cyc < 0.72 ? smoothstep(0, 0.72, cyc) : 1 - smoothstep(0.72, 0.84, cyc);
      const strike: Pt = sk.pose === 'crouch' ? rel(70, 150) : rel(60, 196);
      const up = rel(96, -40);
      return [lerp(strike[0], up[0], raise), lerp(strike[1], up[1], raise)];
    }
    case 'carryShoulder':
      return rel(-4, -52);
    case 'hug':
      return [CX + s * 62, sk.hipY - 46];
    case 'basketLap':
      return [CX + s * 82, sk.hipY - 34];
    case 'suitcase':
      return rel(28, 206);
    case 'ticket':
      return rel(-6, 122);
    case 'newspaper':
      return [CX + s * 120, sk.shY + 104];
    case 'reachUp':
      return rel(66, -168);
    case 'wave':
      return rel(120 + Math.sin(frame * 0.35) * 16, -118);
  }
}

interface ArmSolve {
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
}

function solveArm(side: 0 | 1, target: Pt, sk: Skeleton): ArmSolve {
  const s = SIGN[side];
  const shoulder: Pt = [CX + s * sk.shHalf, sk.shY + 14];
  let dx = target[0] - shoulder[0];
  let dy = target[1] - shoulder[1];
  let d = Math.hypot(dx, dy);
  const maxD = UPPER + FORE - 0.5;
  const minD = Math.abs(UPPER - FORE) + 8;
  if (d < 1e-3) {
    dx = 0;
    dy = 1;
    d = 1;
  }
  const dc = Math.min(maxD, Math.max(minD, d));
  const ux = dx / d;
  const uy = dy / d;
  const hand: Pt = [shoulder[0] + ux * dc, shoulder[1] + uy * dc];
  const a = Math.atan2(uy, ux);
  const alpha = Math.acos(clamp01((UPPER * UPPER + dc * dc - FORE * FORE) / (2 * UPPER * dc)));
  const e1: Pt = [shoulder[0] + Math.cos(a + alpha) * UPPER, shoulder[1] + Math.sin(a + alpha) * UPPER];
  const e2: Pt = [shoulder[0] + Math.cos(a - alpha) * UPPER, shoulder[1] + Math.sin(a - alpha) * UPPER];
  // Elbows bend outward (away from the body centre), the natural frontal read.
  const out = (e: Pt): number => s * (e[0] - CX) + e[1] * 0.15;
  return { shoulder, elbow: out(e1) >= out(e2) ? e1 : e2, hand };
}

// ── Paint helpers ───────────────────────────────────────────────────────────

function outlined(ctx: CanvasRenderingContext2D, path: () => void, fill: string, line = OUTLINE): void {
  ctx.beginPath();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function limb(ctx: CanvasRenderingContext2D, pts: readonly Pt[], width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = (): void => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  };
  trace();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + OUTLINE * 2;
  ctx.stroke();
  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.roundRect(x, y, w, h, r);
}

// ── Body painting ───────────────────────────────────────────────────────────

function paintShoe(ctx: CanvasRenderingContext2D, look: HumanLook, leg: Leg, s: number): void {
  const x = leg.ankle[0] + s * 8;
  const base = SOLE - leg.lift;
  if (look.shoes === 'boots') {
    outlined(ctx, () => roundRect(ctx, leg.ankle[0] - 26, leg.ankle[1] - 96, 52, 100, 14), look.shoeColor);
    outlined(ctx, () => ellipse(ctx, x, base - 16, 36, 18), look.shoeColor);
    return;
  }
  if (look.shoes === 'sandals') {
    outlined(ctx, () => ellipse(ctx, x, base - 14, 30, 14), look.skin);
    outlined(ctx, () => ellipse(ctx, x, base - 5, 36, 7), look.shoeColor, 6);
    ctx.fillStyle = look.shoeColor;
    ctx.fillRect(x - 22, base - 22, 44, 8);
    return;
  }
  outlined(ctx, () => ellipse(ctx, x, base - 18, 36, 20), look.shoes === 'sneakers' ? look.accent === '#f6f1e7' ? '#d2493f' : shade(look.shoeColor, -0.35) : look.shoeColor);
  if (look.shoes === 'sneakers') {
    outlined(ctx, () => roundRect(ctx, x - 38, base - 12, 76, 12, 6), look.shoeColor, 6);
    ctx.strokeStyle = '#f7f3ea';
    ctx.lineWidth = 4;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x - 12 + k * 8, base - 32);
      ctx.lineTo(x - 6 + k * 8, base - 24);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ellipse(ctx, x - s * 10, base - 26, 10, 4, -0.3);
    ctx.fill();
  }
}

function paintLegs(ctx: CanvasRenderingContext2D, look: HumanLook, sk: Skeleton): void {
  const legColor = look.bottom === 'shorts' || look.bottom === 'skirt' ? look.skin : look.bottomColor;
  const width = look.bottom === 'sarung' ? 58 : 46;
  sk.legs.forEach((leg, i) => {
    const s = SIGN[i as 0 | 1];
    limb(ctx, [leg.hip, leg.knee, [leg.ankle[0], leg.ankle[1] - 10]], look.bottom === 'skirt' ? 30 : width, legColor);
    if (look.bottom === 'shorts') limb(ctx, [leg.hip, [lerp(leg.hip[0], leg.knee[0], 0.75), lerp(leg.hip[1], leg.knee[1], 0.75)]], 54, look.bottomColor);
    paintShoe(ctx, look, leg, s);
  });
  // Pelvis block joins both legs under the top.
  if (look.bottom !== 'skirt') {
    outlined(ctx, () => roundRect(ctx, CX - sk.hipHalf - 6, sk.hipY - 40, (sk.hipHalf + 6) * 2, sk.pose === 'stand' ? 90 : 60, 22), look.bottomColor);
  }
  if (look.bottom === 'sarung' && sk.pose === 'stand') {
    outlined(ctx, () => {
      ctx.moveTo(CX - 62, sk.hipY - 30);
      ctx.lineTo(CX + 62, sk.hipY - 30);
      ctx.lineTo(CX + 70, 930);
      ctx.lineTo(CX - 70, 930);
      ctx.closePath();
    }, look.bottomColor);
    plaid(ctx, CX - 66, sk.hipY - 28, 132, 930 - sk.hipY + 28, look.bottomColor);
  }
  if (look.bottom === 'skirt') {
    const hem = sk.pose === 'stand' ? 930 : sk.pose === 'sit' ? sk.hipY + 120 : sk.hipY + 40;
    const flare = sk.pose === 'crouch' ? 110 : sk.pose === 'sit' ? 84 : 76;
    outlined(ctx, () => {
      ctx.moveTo(CX - 56, sk.hipY - 34);
      ctx.lineTo(CX + 56, sk.hipY - 34);
      ctx.lineTo(CX + flare, hem);
      ctx.quadraticCurveTo(CX, hem + 10, CX - flare, hem);
      ctx.closePath();
    }, look.bottomColor);
    batik(ctx, CX - flare + 6, sk.hipY - 30, flare * 2 - 12, hem - sk.hipY + 24, look.bottomColor);
  }
  if (look.bottom === 'sarung' && sk.pose !== 'stand') plaid(ctx, CX - 70, sk.hipY - 30, 140, 70, look.bottomColor);
}

function plaid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = shade(base, 0.25);
  ctx.lineWidth = 5;
  for (let k = x; k < x + w; k += 22) {
    ctx.beginPath();
    ctx.moveTo(k, y);
    ctx.lineTo(k, y + h);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(base, -0.3);
  for (let k = y; k < y + h; k += 22) {
    ctx.beginPath();
    ctx.moveTo(x, k);
    ctx.lineTo(x + w, k);
    ctx.stroke();
  }
  ctx.restore();
}

function batik(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string): void {
  ctx.save();
  ctx.fillStyle = shade(base, 0.3);
  for (let yy = y + 14; yy < y + h; yy += 28) {
    for (let xx = x + ((yy / 28) % 2 ? 14 : 0); xx < x + w; xx += 28) {
      ctx.beginPath();
      ellipse(ctx, xx, yy, 5, 8, 0.6);
      ctx.fill();
    }
  }
  ctx.restore();
}

function torsoPath(ctx: CanvasRenderingContext2D, sk: Skeleton): void {
  const top = sk.shY - 6;
  const bottom = sk.hipY + (sk.pose === 'stand' ? 14 : 6);
  ctx.moveTo(CX - sk.shHalf - 16, top + 26);
  ctx.quadraticCurveTo(CX - sk.shHalf - 12, top, CX - 30, top - 4);
  ctx.lineTo(CX + 30, top - 4);
  ctx.quadraticCurveTo(CX + sk.shHalf + 12, top, CX + sk.shHalf + 16, top + 26);
  ctx.lineTo(CX + sk.hipHalf + 14, bottom);
  ctx.quadraticCurveTo(CX, bottom + 12, CX - sk.hipHalf - 14, bottom);
  ctx.closePath();
}

function paintTorso(ctx: CanvasRenderingContext2D, look: HumanLook, sk: Skeleton): void {
  outlined(ctx, () => torsoPath(ctx, sk), look.topColor);
  ctx.save();
  ctx.beginPath();
  torsoPath(ctx, sk);
  ctx.clip();
  const top = sk.shY - 10;
  const bottom = sk.hipY + 20;
  // Soft side shading.
  ctx.fillStyle = look.topShade;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(CX + 40, top, 80, bottom - top);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  switch (look.top) {
    case 'jacket': {
      ctx.fillStyle = look.accent;
      ctx.fillRect(CX - 26, top, 52, bottom - top);
      ctx.lineWidth = 5;
      for (const s of SIGN) {
        ctx.beginPath();
        ctx.moveTo(CX + s * 26, top);
        ctx.lineTo(CX + s * 30, bottom);
        ctx.stroke();
        ctx.strokeRect(CX + s * 58 - 20, sk.shY + 50, 40, 30);
        ctx.strokeRect(CX + s * 62 - 22, sk.hipY - 50, 44, 34);
      }
      ctx.strokeStyle = '#e8c27a';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(CX - 110, sk.hipY - 4);
      ctx.lineTo(CX + 110, sk.hipY - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'uniform': {
      ctx.fillStyle = look.accent;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ellipse(ctx, CX, sk.shY + 30 + k * ((sk.hipY - sk.shY - 50) / 5), 7, 7);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(CX, top);
      ctx.lineTo(CX, bottom);
      ctx.stroke();
      for (const s of SIGN) ctx.strokeRect(CX + s * 52 - 22, sk.shY + 40, 44, 34);
      ctx.fillStyle = '#2a2220';
      ctx.fillRect(CX - 130, sk.hipY - 40, 260, 18);
      ctx.fillStyle = look.accent;
      ctx.fillRect(CX - 12, sk.hipY - 42, 24, 22);
      break;
    }
    case 'kemeja':
    case 'polo': {
      ctx.beginPath();
      ctx.moveTo(CX, top + 20);
      ctx.lineTo(CX, look.top === 'polo' ? sk.shY + 70 : bottom);
      ctx.stroke();
      ctx.fillStyle = INK;
      for (let k = 0; k < (look.top === 'polo' ? 2 : 5); k++) {
        ctx.beginPath();
        ellipse(ctx, CX + 8, sk.shY + 34 + k * 36, 4, 4);
        ctx.fill();
      }
      break;
    }
    case 'kebaya': {
      ctx.fillStyle = '#f7efe2';
      for (let k = 0; k < 9; k++) {
        const y = top + 16 + k * ((bottom - top) / 9);
        ctx.beginPath();
        ellipse(ctx, CX - 10 + (k % 2) * 4, y, 7, 9);
        ctx.fill();
      }
      ctx.fillStyle = '#d9b45a';
      ctx.beginPath();
      ellipse(ctx, CX, sk.shY + 46, 9, 9);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'koko': {
      ctx.strokeStyle = look.accent;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(CX, top + 10);
      ctx.lineTo(CX, sk.shY + 130);
      ctx.stroke();
      break;
    }
    case 'lurik': {
      ctx.strokeStyle = shade(look.topColor, -0.35);
      ctx.lineWidth = 6;
      for (let x = CX - 140; x < CX + 140; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
      break;
    }
    case 'kaos':
      break;
  }
  ctx.restore();
  // Collars.
  if (look.top === 'kemeja' || look.top === 'polo' || look.top === 'jacket' || look.top === 'uniform') {
    for (const s of SIGN) {
      outlined(ctx, () => {
        ctx.moveTo(CX + s * 4, sk.shY - 8);
        ctx.lineTo(CX + s * 44, sk.shY - 10);
        ctx.lineTo(CX + s * 20, sk.shY + 30);
        ctx.closePath();
      }, look.top === 'jacket' ? look.topShade : shade(look.topColor, 0.15), 5);
    }
  }
}

function paintHead(ctx: CanvasRenderingContext2D, look: HumanLook, sk: Skeleton, face: Face, turn: number, blink: number, nod: number): void {
  const hx = sk.headX + turn * 6;
  const hy = sk.headY;
  const fx = hx + turn * 26;
  const hijab = look.headwear === 'hijab';

  // Neck.
  outlined(ctx, () => roundRect(ctx, CX - 26, hy + 70, 52, sk.shY - hy - 60, 12), look.skinShade);

  if (hijab) {
    // Hood and drape over the shoulders (drawn before the face oval).
    outlined(ctx, () => {
      ellipse(ctx, hx, hy - 2, 122, 128);
    }, look.headwearColor);
    outlined(ctx, () => {
      ctx.moveTo(hx - 104, hy + 40);
      ctx.quadraticCurveTo(CX - 128, sk.shY + 20, CX - 112, sk.shY + 86);
      ctx.quadraticCurveTo(CX, sk.shY + 120, CX + 112, sk.shY + 86);
      ctx.quadraticCurveTo(CX + 128, sk.shY + 20, hx + 104, hy + 40);
      ctx.closePath();
    }, look.headwearColor);
    ctx.strokeStyle = shade(look.headwearColor, -0.25);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(CX - 60, sk.shY + 60);
    ctx.quadraticCurveTo(CX, sk.shY + 86, CX + 60, sk.shY + 60);
    ctx.stroke();
    outlined(ctx, () => ellipse(ctx, fx * 0.4 + hx * 0.6, hy + 14, 86, 94), look.skin, 6);
  } else {
    // Ears then head.
    for (const s of SIGN) outlined(ctx, () => ellipse(ctx, hx + s * 102, hy + 14, 18, 26), look.skin, 6);
    outlined(ctx, () => ellipse(ctx, hx, hy, 106, 114), look.skin);
    paintHair(ctx, look, hx, hy);
  }

  // Cheeks.
  ctx.fillStyle = 'rgba(230, 110, 100, 0.28)';
  for (const s of SIGN) {
    ctx.beginPath();
    ellipse(ctx, fx + s * 56, hy + 44, 18, 10);
    ctx.fill();
  }

  // Eyes.
  const lid = clamp01(face.lid + blink);
  const look2 = face.lookY * 6 + nod * 5;
  for (const s of SIGN) {
    const ex = fx + s * 38;
    const ey = hy + 10;
    const open = 1 - lid;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ellipse(ctx, ex, ey, 16, 19 * Math.max(0.08, open));
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (open > 0.2) {
      ctx.fillStyle = '#2a1a16';
      ctx.beginPath();
      ellipse(ctx, ex + turn * 6, ey + look2, 9, 10 * open);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ellipse(ctx, ex + turn * 6 - 3, ey + look2 - 4, 3, 3);
      ctx.fill();
    }
    // Brows.
    const raise = face.browRaise * 10 + (s === 1 ? face.browAsym * 8 : -face.browAsym * 4);
    const inner = face.browInner * 8;
    ctx.strokeStyle = hijab ? '#2a1d1c' : look.hair;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - s * 14, ey - 32 - raise - inner);
    ctx.lineTo(ex + s * 16, ey - 34 - raise + inner * 0.3);
    ctx.stroke();
  }
  if (look.glasses) {
    ctx.strokeStyle = '#3a2a22';
    ctx.lineWidth = 4;
    for (const s of SIGN) {
      ctx.beginPath();
      ellipse(ctx, fx + s * 38, hy + 10, 24, 22);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(fx - 14, hy + 8);
    ctx.lineTo(fx + 14, hy + 8);
    ctx.stroke();
  }

  // Nose and mouth.
  ctx.strokeStyle = look.skinShade;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(fx, hy + 34, 6, 0.2, Math.PI - 0.2);
  ctx.stroke();
  if (look.mustache) {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ellipse(ctx, fx - 13, hy + 46, 14, 5, 0.2);
    ellipse(ctx, fx + 13, hy + 46, 14, 5, -0.2);
    ctx.fill();
  }
  const my = hy + 60;
  if (face.open > 0.15) {
    ctx.fillStyle = '#6a2a2a';
    ctx.beginPath();
    ellipse(ctx, fx, my + 2, 8 + face.open * 6, 6 + face.open * 10);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
  } else {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(fx - 20, my - face.smile * 4);
    ctx.quadraticCurveTo(fx, my + face.smile * 16, fx + 20, my - face.smile * 4);
    ctx.stroke();
  }

  paintHeadwear(ctx, look, hx, hy);
}

function paintHair(ctx: CanvasRenderingContext2D, look: HumanLook, hx: number, hy: number): void {
  const hw = look.headwear;
  if (hw === 'hairShort' || hw === 'peci' || hw === 'kepi' || hw === 'stationCap' || hw === 'cap' || hw === 'caping') {
    outlined(ctx, () => {
      ctx.moveTo(hx - 104, hy - 6);
      ctx.quadraticCurveTo(hx - 110, hy - 116, hx, hy - 118);
      ctx.quadraticCurveTo(hx + 110, hy - 116, hx + 104, hy - 6);
      ctx.quadraticCurveTo(hx + 70, hy - 66, hx, hy - 70);
      ctx.quadraticCurveTo(hx - 70, hy - 66, hx - 104, hy - 6);
      ctx.closePath();
    }, look.hair, 6);
  } else if (hw === 'hairBun') {
    outlined(ctx, () => ellipse(ctx, hx, hy - 118, 40, 34), look.hair, 6);
    outlined(ctx, () => {
      ctx.moveTo(hx - 106, hy + 10);
      ctx.quadraticCurveTo(hx - 112, hy - 118, hx, hy - 116);
      ctx.quadraticCurveTo(hx + 112, hy - 118, hx + 106, hy + 10);
      ctx.quadraticCurveTo(hx + 60, hy - 70, hx, hy - 64);
      ctx.quadraticCurveTo(hx - 60, hy - 70, hx - 106, hy + 10);
      ctx.closePath();
    }, look.hair, 6);
  } else if (hw === 'hairKid') {
    outlined(ctx, () => {
      ctx.moveTo(hx - 104, hy - 10);
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI + (k / 8) * Math.PI;
        const r = k % 2 ? 128 : 112;
        ctx.lineTo(hx + Math.cos(a) * r, hy - 20 + Math.sin(a) * r);
      }
      ctx.lineTo(hx + 104, hy - 10);
      ctx.quadraticCurveTo(hx, hy - 76, hx - 104, hy - 10);
      ctx.closePath();
    }, look.hair, 6);
  }
}

function paintHeadwear(ctx: CanvasRenderingContext2D, look: HumanLook, hx: number, hy: number): void {
  const c = look.headwearColor;
  switch (look.headwear) {
    case 'peci':
      outlined(ctx, () => roundRect(ctx, hx - 80, hy - 128, 160, 58, 14), c);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(hx - 70, hy - 118, 140, 8);
      break;
    case 'caping':
      outlined(ctx, () => {
        ctx.moveTo(hx, hy - 178);
        ctx.lineTo(hx + 206, hy - 62);
        ctx.quadraticCurveTo(hx, hy - 40, hx - 206, hy - 62);
        ctx.closePath();
      }, c);
      ctx.strokeStyle = shade(c, -0.3);
      ctx.lineWidth = 3;
      for (let k = -4; k <= 4; k++) {
        ctx.beginPath();
        ctx.moveTo(hx, hy - 172);
        ctx.lineTo(hx + k * 46, hy - 54);
        ctx.stroke();
      }
      break;
    case 'kepi':
      outlined(ctx, () => roundRect(ctx, hx - 86, hy - 136, 172, 68, 12), c);
      ctx.fillStyle = look.accent;
      ctx.fillRect(hx - 86, hy - 90, 172, 12);
      outlined(ctx, () => ellipse(ctx, hx, hy - 66, 96, 16), '#141218', 6);
      outlined(ctx, () => ellipse(ctx, hx, hy - 112, 12, 12), look.accent, 4);
      break;
    case 'stationCap':
      outlined(ctx, () => ellipse(ctx, hx, hy - 116, 118, 34), c);
      outlined(ctx, () => roundRect(ctx, hx - 88, hy - 112, 176, 40, 10), '#1d1a22');
      outlined(ctx, () => ellipse(ctx, hx, hy - 66, 98, 16), '#141218', 6);
      outlined(ctx, () => ellipse(ctx, hx, hy - 96, 14, 11), look.accent === '#f4efe6' ? '#c9a14a' : look.accent, 4);
      break;
    case 'cap':
      outlined(ctx, () => {
        ctx.moveTo(hx - 102, hy - 50);
        ctx.quadraticCurveTo(hx - 104, hy - 140, hx, hy - 140);
        ctx.quadraticCurveTo(hx + 104, hy - 140, hx + 102, hy - 50);
        ctx.closePath();
      }, c);
      outlined(ctx, () => ellipse(ctx, hx + 40, hy - 52, 92, 16, -0.08), shade(c, -0.2), 6);
      break;
    default:
      break;
  }
}

function paintArm(ctx: CanvasRenderingContext2D, look: HumanLook, arm: ArmSolve, pocket: boolean): void {
  const sleeve = look.top === 'kaos' || look.top === 'polo' ? 'short' : 'long';
  const elbowMid: Pt = [lerp(arm.shoulder[0], arm.elbow[0], 0.55), lerp(arm.shoulder[1], arm.elbow[1], 0.55)];
  if (sleeve === 'long') {
    limb(ctx, [arm.shoulder, arm.elbow, arm.hand], 38, look.topColor);
    // Cuff.
    const cx = lerp(arm.elbow[0], arm.hand[0], 0.82);
    const cy = lerp(arm.elbow[1], arm.hand[1], 0.82);
    ctx.fillStyle = look.topShade;
    ctx.beginPath();
    ellipse(ctx, cx, cy, 19, 19);
    ctx.fill();
  } else {
    limb(ctx, [arm.shoulder, arm.elbow, arm.hand], 32, look.skin);
    limb(ctx, [arm.shoulder, elbowMid], 44, look.topColor);
  }
  outlined(ctx, () => ellipse(ctx, arm.hand[0], arm.hand[1], 21, 21), look.skin, 6);
  if (pocket) {
    // Hand tucked in the jacket pocket: the pocket welt covers the fingers.
    outlined(ctx, () => roundRect(ctx, arm.hand[0] - 26, arm.hand[1] - 2, 52, 26, 6), look.topColor, 5);
  }
}

function paintHandProp(ctx: CanvasRenderingContext2D, prop: HandProp, arm: ArmSolve, s: number, frame: number): void {
  const [hx, hy] = arm.hand;
  const ang = Math.atan2(arm.hand[1] - arm.elbow[1], arm.hand[0] - arm.elbow[0]);
  switch (prop) {
    case 'none':
      return;
    case 'pen':
      limb(ctx, [[hx - 6, hy - 16], [hx + 12, hy + 28]], 6, '#2a2a3a');
      ctx.fillStyle = '#c9a14a';
      ctx.beginPath();
      ellipse(ctx, hx + 12, hy + 28, 3, 3);
      ctx.fill();
      return;
    case 'chalk':
      limb(ctx, [[hx - 2, hy - 4], [hx + 8, hy + 16]], 7, '#f4f1ea');
      return;
    case 'whistle': {
      const wx = hx - s * 16;
      outlined(ctx, () => roundRect(ctx, wx - 16, hy - 12, 32, 18, 8), '#c8ccd6', 5);
      return;
    }
    case 'signalLamp': {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(hx, hy + 14, 16, Math.PI, 0);
      ctx.stroke();
      outlined(ctx, () => roundRect(ctx, hx - 24, hy + 16, 48, 62, 8), '#3a3430', 6);
      const glow = 0.75 + 0.25 * Math.sin(frame * 0.3);
      ctx.fillStyle = `rgba(255, ${Math.round(90 + 60 * glow)}, 60, 1)`;
      ctx.beginPath();
      ellipse(ctx, hx, hy + 46, 15, 17);
      ctx.fill();
      return;
    }
    case 'hammer': {
      const a = ang - s * 1.25;
      const ex = hx + Math.cos(a) * 74;
      const ey = hy + Math.sin(a) * 74;
      limb(ctx, [[hx - Math.cos(a) * 12, hy - Math.sin(a) * 12], [ex, ey]], 9, '#8a5a32');
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a + Math.PI / 2);
      outlined(ctx, () => roundRect(ctx, -26, -11, 52, 22, 4), '#4a4c56', 5);
      ctx.restore();
      return;
    }
    case 'ticket':
      ctx.save();
      ctx.translate(hx + s * 10, hy - 18);
      ctx.rotate(-s * 0.25);
      outlined(ctx, () => roundRect(ctx, -22, -14, 44, 28, 4), '#f3ead2', 4);
      ctx.fillStyle = '#d2493f';
      ctx.fillRect(-18, -4, 36, 6);
      ctx.restore();
      return;
    case 'suitcase':
      outlined(ctx, () => roundRect(ctx, hx - 50, hy + 14, 100, 74, 8), '#7a4a2a', 6);
      ctx.strokeStyle = '#4a2a18';
      ctx.lineWidth = 5;
      for (const k of [-24, 24]) {
        ctx.beginPath();
        ctx.moveTo(hx + k, hy + 16);
        ctx.lineTo(hx + k, hy + 86);
        ctx.stroke();
      }
      return;
    case 'phone':
      outlined(ctx, () => roundRect(ctx, hx - 12 + s * 6, hy - 40, 24, 42, 5), '#1c1c24', 4);
      ctx.fillStyle = '#7ab8d8';
      ctx.fillRect(hx - 8 + s * 6, hy - 36, 16, 30);
      return;
  }
}

function paintBackpackBack(ctx: CanvasRenderingContext2D, look: HumanLook, sk: Skeleton): void {
  outlined(ctx, () => roundRect(ctx, CX - 104, sk.shY - 20, 208, sk.hipY - sk.shY - 10, 30), look.packColor);
}

function paintBackpackStraps(ctx: CanvasRenderingContext2D, look: HumanLook, sk: Skeleton): void {
  for (const s of SIGN) limb(ctx, [[CX + s * 44, sk.shY - 4], [CX + s * 50, sk.shY + 70], [CX + s * 54, sk.shY + 160]], 16, shade(look.packColor, -0.2));
}

function paintBodyProp(ctx: CanvasRenderingContext2D, prop: BodyProp, sk: Skeleton, frame: number, progress: number, drawProgress: number): void {
  switch (prop) {
    case 'shoulderBasket': {
      const bx = CX - 92;
      const by = sk.shY - 54;
      for (let k = 0; k < 5; k++) outlined(ctx, () => ellipse(ctx, bx - 40 + k * 20, by - 36 - (k % 2) * 10, 20, 18), k % 2 ? '#5f9a3a' : '#7cb446', 5);
      outlined(ctx, () => ellipse(ctx, bx + 30, by - 40, 10, 26, 0.5), '#e07a2a', 4);
      outlined(ctx, () => {
        ctx.moveTo(bx - 70, by - 30);
        ctx.lineTo(bx + 70, by - 30);
        ctx.lineTo(bx + 52, by + 52);
        ctx.quadraticCurveTo(bx, by + 64, bx - 52, by + 52);
        ctx.closePath();
      }, '#b88a4a');
      weave(ctx, bx - 64, by - 26, 128, 76);
      return;
    }
    case 'lapSack': {
      const y = sk.hipY - 50;
      for (let k = 0; k < 3; k++) outlined(ctx, () => ellipse(ctx, CX - 26 + k * 26, y - 82 - (k % 2) * 8, 18, 22), '#6fa844', 5);
      outlined(ctx, () => {
        ctx.moveTo(CX - 40, y - 74);
        ctx.quadraticCurveTo(CX, y - 60, CX + 40, y - 74);
        ctx.quadraticCurveTo(CX + 96, y - 20, CX + 84, y + 50);
        ctx.quadraticCurveTo(CX, y + 72, CX - 84, y + 50);
        ctx.quadraticCurveTo(CX - 96, y - 20, CX - 40, y - 74);
        ctx.closePath();
      }, '#c8a66e');
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(CX - 36, y - 62);
      ctx.lineTo(CX + 36, y - 62);
      ctx.stroke();
      return;
    }
    case 'lapBakul': {
      const y = sk.hipY - 34;
      for (let k = 0; k < 4; k++) outlined(ctx, () => ellipse(ctx, CX - 54 + k * 36, y - 40, 22, 18), ['#e0742a', '#6fa844', '#d8c24a', '#9a3a2a'][k] ?? '#6fa844', 5);
      outlined(ctx, () => {
        ctx.moveTo(CX - 100, y - 34);
        ctx.lineTo(CX + 100, y - 34);
        ctx.lineTo(CX + 80, y + 40);
        ctx.quadraticCurveTo(CX, y + 52, CX - 80, y + 40);
        ctx.closePath();
      }, '#c09656');
      weave(ctx, CX - 94, y - 30, 188, 68);
      return;
    }
    case 'lapBoard': {
      const r = boardRect(sk);
      outlined(ctx, () => roundRect(ctx, r.x - 10, r.y - 10, BOARD_W + 20, BOARD_H + 20, 8), '#7a5030');
      ctx.fillStyle = '#2c3a32';
      ctx.fillRect(r.x, r.y, BOARD_W, BOARD_H);
      ctx.strokeStyle = 'rgba(240,240,230,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r.x + 12, r.y + 8);
      ctx.lineTo(r.x + 12, r.y + BOARD_H - 10);
      ctx.lineTo(r.x + BOARD_W - 8, r.y + BOARD_H - 10);
      ctx.stroke();
      // Chalk line drawn up to the hand.
      ctx.strokeStyle = '#f4f1ea';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const steps = 40;
      for (let k = 0; k <= steps; k++) {
        const t = (k / steps) * drawProgress;
        const [u, v] = polylineAt(GRAPH, t);
        const x = r.x + u * BOARD_W;
        const y = r.y + v * BOARD_H;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }
    case 'newspaper': {
      const x = CX - 128;
      const y = sk.shY + 40;
      outlined(ctx, () => {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 256, y - 6);
        ctx.lineTo(x + 252, y + 190);
        ctx.lineTo(x + 4, y + 196);
        ctx.closePath();
      }, '#ece2c8');
      ctx.fillStyle = '#2a2420';
      ctx.font = '800 30px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('DE KOERIER', CX, y + 34);
      ctx.font = '700 15px Georgia, serif';
      ctx.fillText('31 JULI 1930', CX, y + 56);
      ctx.font = '800 17px Georgia, serif';
      ctx.fillText('LIJN GAROET–TJIKADJANG', CX, y + 82);
      ctx.fillText('GEOPEND', CX, y + 102);
      ctx.fillStyle = 'rgba(42,36,32,0.45)';
      for (let k = 0; k < 6; k++) {
        ctx.fillRect(x + 18, y + 118 + k * 11, 100, 5);
        ctx.fillRect(x + 138, y + 118 + k * 11, 100, 5);
      }
      return;
    }
    case 'deskNotebook': {
      // Open ledger lying on the desk edge (entirely above DESK_Y so the desk never hides it).
      outlined(ctx, () => {
        ctx.moveTo(CX - 96, DESK_Y - 42);
        ctx.lineTo(CX + 96, DESK_Y - 42);
        ctx.lineTo(CX + 108, DESK_Y - 2);
        ctx.lineTo(CX - 108, DESK_Y - 2);
        ctx.closePath();
      }, '#f2ead6', 6);
      ctx.strokeStyle = 'rgba(60,40,30,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(CX, DESK_Y - 42);
      ctx.lineTo(CX, DESK_Y - 2);
      ctx.stroke();
      // Handwriting appears behind the single pen nib.
      const p = clamp01(progress) * NOTE_LINES;
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = 2.5;
      for (let line = 0; line < NOTE_LINES; line++) {
        const done = clamp01(p - line);
        if (done <= 0) break;
        ctx.beginPath();
        const y0 = DESK_Y - 34 + line * 6;
        for (let k = 0; k <= 24 * done; k++) {
          const x = CX - 86 + (k / 24) * 70;
          const y = y0 + Math.sin(k * 1.9 + line) * 1.6;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      void frame;
      return;
    }
    case 'backpack':
    case 'none':
      return;
  }
}

function weave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(90, 60, 30, 0.55)';
  ctx.lineWidth = 3;
  for (let k = -h; k < w; k += 14) {
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + k + h, y + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + k + h, y);
    ctx.lineTo(x + k, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Critters (same toon style, same billboard) ──────────────────────────────

function paintCritter(ctx: CanvasRenderingContext2D, look: CritterLook, frame: number, walkPhase: number | null, dir: number, blink: number): void {
  ctx.save();
  if (dir < 0) {
    ctx.translate(LW, 0);
    ctx.scale(-1, 1);
  }
  if (look.species === 'ayam') {
    const step = walkPhase ?? 0;
    const bob = walkPhase === null ? 0 : Math.abs(Math.sin(step)) * 6;
    const peck = walkPhase === null ? Math.max(0, Math.sin(frame * 0.08)) * 10 : 0;
    // Legs (always planted on the sole line).
    for (const k of [0, 1]) {
      const lift = walkPhase === null ? 0 : Math.max(0, Math.sin(step + k * Math.PI)) * 12;
      const lx = CX - 12 + k * 24 + (walkPhase === null ? 0 : Math.sin(step + k * Math.PI) * 8);
      limb(ctx, [[CX - 8 + k * 16, SOLE - 70], [lx, SOLE - 4 - lift]], 6, '#e2a33a');
      limb(ctx, [[lx - 12, SOLE - 3 - lift], [lx + 14, SOLE - 3 - lift]], 4, '#e2a33a');
    }
    const by = SOLE - 104 - bob;
    for (let k = 0; k < 3; k++) outlined(ctx, () => ellipse(ctx, CX - 56 - k * 6, by - 30 - k * 14, 14, 36, -0.5 - k * 0.2), k === 1 ? '#3a3a2a' : '#5a4a2a', 5);
    outlined(ctx, () => ellipse(ctx, CX, by, 62, 46), look.color);
    ctx.strokeStyle = shade(look.color, -0.2);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(CX - 4, by, 30, 0.3, 2.2);
    ctx.stroke();
    const hx = CX + 48;
    const hy = by - 56 + peck;
    outlined(ctx, () => {
      ctx.moveTo(hx - 12, hy - 24);
      ctx.quadraticCurveTo(hx - 4, hy - 46, hx + 4, hy - 26);
      ctx.quadraticCurveTo(hx + 12, hy - 44, hx + 18, hy - 22);
      ctx.closePath();
    }, look.accent, 4);
    outlined(ctx, () => ellipse(ctx, hx, hy, 26, 26), look.color);
    outlined(ctx, () => {
      ctx.moveTo(hx + 22, hy - 6);
      ctx.lineTo(hx + 44, hy + 2);
      ctx.lineTo(hx + 22, hy + 8);
      ctx.closePath();
    }, '#f0b43a', 4);
    outlined(ctx, () => ellipse(ctx, hx + 18, hy + 20, 7, 11), look.accent, 3);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ellipse(ctx, hx + 8, hy - 4, 4, 4 * (1 - blink));
    ctx.fill();
  } else {
    const swish = Math.sin(frame * 0.06) * 0.35;
    // Tail curls around the paws.
    ctx.save();
    ctx.translate(CX + 50, SOLE - 30);
    ctx.rotate(swish);
    limb(ctx, [[0, 0], [40, -10], [60, -50], [50, -86]], 18, look.color);
    ctx.restore();
    outlined(ctx, () => {
      ctx.moveTo(CX - 54, SOLE - 6);
      ctx.quadraticCurveTo(CX - 70, SOLE - 120, CX - 30, SOLE - 150);
      ctx.lineTo(CX + 30, SOLE - 150);
      ctx.quadraticCurveTo(CX + 70, SOLE - 120, CX + 54, SOLE - 6);
      ctx.closePath();
    }, look.color);
    for (const k of [-1, 1]) outlined(ctx, () => ellipse(ctx, CX + k * 20, SOLE - 10, 18, 10), shade(look.color, 0.25), 5);
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 6;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(CX - 50, SOLE - 100 + k * 26);
      ctx.lineTo(CX - 24, SOLE - 96 + k * 26);
      ctx.stroke();
    }
    const hy = SOLE - 184;
    for (const k of [-1, 1]) {
      outlined(ctx, () => {
        ctx.moveTo(CX + k * 22, hy - 30);
        ctx.lineTo(CX + k * 44, hy - 66);
        ctx.lineTo(CX + k * 50, hy - 20);
        ctx.closePath();
      }, look.color, 5);
    }
    outlined(ctx, () => ellipse(ctx, CX, hy, 52, 44), look.color);
    for (const k of [-1, 1]) {
      ctx.fillStyle = '#9ac83a';
      ctx.beginPath();
      ellipse(ctx, CX + k * 20, hy - 4, 9, 11 * (1 - blink));
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ellipse(ctx, CX + k * 20, hy - 4, 3, 9 * (1 - blink));
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (const w of [-6, 4]) {
        ctx.beginPath();
        ctx.moveTo(CX + k * 24, hy + 14 + w * 0.3);
        ctx.lineTo(CX + k * 64, hy + 10 + w);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#d0706a';
    ctx.beginPath();
    ellipse(ctx, CX, hy + 10, 6, 4);
    ctx.fill();
  }
  ctx.restore();
}

// ── Actor ───────────────────────────────────────────────────────────────────

export interface ArmBlend {
  from: ArmPose;
  to: ArmPose;
  mix: number;
}

export interface ToonDrive {
  frame: number;
  /** Shot progress 0..1 (drives writing progress). */
  progress: number;
  expression: { from: Expression; to: Expression; mix: number };
  turn: number;
  nod: number;
  armRight: ArmBlend;
  armLeft: ArmBlend;
  /** Walk-cycle phase in radians, or null when standing still. */
  walkPhase: number | null;
  /** +1 walking toward +x, −1 toward −x (critters mirror). */
  walkDir: number;
  /** 0..1 progress of the chalk line on the lap board. */
  drawProgress: number;
}

export interface ActorSetup {
  pose: BodyPose;
  leftProp: HandProp;
  rightProp: HandProp;
  bodyProp: BodyProp;
}

export interface ToonActor {
  id: LookId;
  /** Origin at the soles (bottom-centre); y = 0 is the floor. */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  update: (drive: ToonDrive, cameraWorldPosition: THREE.Vector3) => void;
  dispose: () => void;
}

function paintHuman(ctx: CanvasRenderingContext2D, look: HumanLook, setup: ActorSetup, d: ToonDrive, seed: number): void {
  const sk = skeleton(setup.pose, d.frame, seed, setup.pose === 'stand' ? d.walkPhase : null, d.nod);
  const face = mixFace(FACES[d.expression.from], FACES[d.expression.to], d.expression.mix);
  const blink = blinkAt(d.frame, seed);
  const actx: ArmCtx = { frame: d.frame, progress: d.progress, drawProgress: d.drawProgress, turn: d.turn, sk };
  const arm = (side: 0 | 1, b: ArmBlend): ArmSolve => {
    const a = handTarget(b.from, side, actx);
    const c = handTarget(b.to, side, actx);
    return solveArm(side, [lerp(a[0], c[0], b.mix), lerp(a[1], c[1], b.mix)], sk);
  };
  const right = arm(0, d.armRight);
  const left = arm(1, d.armLeft);

  if (setup.bodyProp === 'backpack') paintBackpackBack(ctx, look, sk);
  paintLegs(ctx, look, sk);
  paintTorso(ctx, look, sk);
  if (setup.bodyProp === 'backpack') paintBackpackStraps(ctx, look, sk);
  const lapProp = setup.bodyProp === 'lapSack' || setup.bodyProp === 'lapBakul' || setup.bodyProp === 'lapBoard' || setup.bodyProp === 'deskNotebook';
  if (setup.bodyProp === 'shoulderBasket') paintBodyProp(ctx, setup.bodyProp, sk, d.frame, d.progress, d.drawProgress);
  paintHead(ctx, look, sk, face, d.turn, blink, d.nod);
  if (lapProp || setup.bodyProp === 'newspaper') paintBodyProp(ctx, setup.bodyProp, sk, d.frame, d.progress, d.drawProgress);

  const pocketR = d.armRight.mix < 0.5 ? d.armRight.from === 'pocket' : d.armRight.to === 'pocket';
  const pocketL = d.armLeft.mix < 0.5 ? d.armLeft.from === 'pocket' : d.armLeft.to === 'pocket';
  // Props that hang below the hand are painted before the hand that grips them.
  const below = (p: HandProp): boolean => p === 'suitcase' || p === 'signalLamp';
  for (const [a, prop, side, pocket] of [[right, setup.rightProp, 0, pocketR], [left, setup.leftProp, 1, pocketL]] as const) {
    if (below(prop)) paintHandProp(ctx, prop, a, SIGN[side], d.frame);
    paintArm(ctx, look, a, pocket);
    if (!below(prop)) paintHandProp(ctx, prop, a, SIGN[side], d.frame);
  }
}

export function createToonActor(id: LookId, setup: ActorSetup, options: { gradientMap: THREE.Texture | null; seed: number }): ToonActor {
  const look = LOOKS[id];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(LW * TEXTURE_SCALE);
  canvas.height = Math.round(LH * TEXTURE_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D context unavailable');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const geometry = new THREE.PlaneGeometry(ACTOR_PLANE_WIDTH, ACTOR_PLANE_HEIGHT);
  // Put the sole line exactly on y = 0 so figures stand on the floor.
  geometry.translate(0, ACTOR_PLANE_HEIGHT / 2 - (LH - SOLE) / PX, 0);
  const material = new THREE.MeshToonMaterial({ map: texture, gradientMap: options.gradientMap, alphaTest: 0.5, alphaToCoverage: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `actor-${id}`;
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });

  const world = new THREE.Vector3();
  const update = (drive: ToonDrive, cam: THREE.Vector3): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(TEXTURE_SCALE, 0, 0, TEXTURE_SCALE, 0, 0);
    if (look.kind === 'critter') paintCritter(ctx, look, drive.frame, drive.walkPhase, drive.walkDir, blinkAt(drive.frame, options.seed));
    else paintHuman(ctx, look, setup, drive, options.seed);
    texture.needsUpdate = true;
    mesh.getWorldPosition(world);
    mesh.rotation.y = Math.atan2(cam.x - world.x, cam.z - world.z);
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    mesh.customDepthMaterial?.dispose();
    texture.dispose();
  };

  return { id, mesh, update, dispose };
}
