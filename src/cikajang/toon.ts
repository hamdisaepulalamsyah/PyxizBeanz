import * as THREE from 'three';
import type { ArmPose, BodyPose, Expression, HandProp, BodyProp, LookId } from './story';
import { clamp01, hash01, lerp, smoothstep } from './story';
import { ERA_FONT } from './fonts';
import { fitFont } from './signage';

/**
 * Full-figure bean-head cast for "Sejarah Cikajang", built to the
 * `pyxis-beanhead-style` skill (skills/pyxis-beanhead-style/SKILL.md):
 *
 *  - the Persis bean head (`traceBeanHead`, HEAD_HALF_W 240, ratio 0.94, plum
 *    ink) drawn at HEAD_SCALE so it is ≈ 236 px wide on a 768 × 1024 card,
 *  - chibi proportions: torso ≈ 1.1 × head height, legs ≈ 1.35 × head height,
 *    tidy trousers / skirts and cartoon shoes whose soles sit on SOLE = 975,
 *    which is the billboard origin (y = 0, the floor),
 *  - clean mitten hands on smooth rubber-hose arms (one bezier from shoulder to
 *    wrist). Both arms are always painted; a gesture only moves the wrist target,
 *    so hands never pop in or vanish,
 *  - lit MeshToonMaterial + normal map, paper grain, NOINK card (no 3D ink lines).
 *
 * Every value is a pure function of the frame so any frame renders on its own.
 */

// ── Canvas & proportions (pyxis-beanhead-style, full figure) ────────────────

const LW = 768;
const LH = 1024;
const TEXTURE_SCALE = 0.75;
/** Shoe-sole line on the card; it sits exactly on the floor (billboard origin). */
const SOLE = 975;
export const ACTOR_PLANE_HEIGHT = 1.7;
export const ACTOR_PLANE_WIDTH = (ACTOR_PLANE_HEIGHT * LW) / LH;
const PX = LH / ACTOR_PLANE_HEIGHT;

const PLUM = '#241726';
const HEAD_CX = LW / 2;
/** Persis head units (the head is authored at Persis size and scaled down). */
const HEAD_HALF_W = 240;
/** Head bounding box height/width = 0.94 (pointed-crown superellipse). */
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2;
/** Card head half-width ≈ 118 px → head width ≈ 236 px. */
const HEAD_SCALE = 118 / HEAD_HALF_W;
const HEAD_H_PX = HEAD_HALF_H * 2 * HEAD_SCALE;
const OUTLINE = 11;
/** Legs ≈ 1.35 × head height down to the sole; torso ≈ 1.1 × head height above the hips. */
const HIP_Y = SOLE - HEAD_H_PX * 1.35;
const TORSO_TOP = HIP_Y - HEAD_H_PX * 1.1;
const HEAD_CY = TORSO_TOP - HEAD_HALF_H * HEAD_SCALE + 8;
/** Head centre height above the sole and head half-height, in metres at scale 1 (FX anchors). */
export const HEAD_CENTER_M = (SOLE - HEAD_CY) / PX;
export const HEAD_HALF_H_M = (HEAD_HALF_H * HEAD_SCALE) / PX;
export const HEAD_HALF_W_M = (HEAD_HALF_W * HEAD_SCALE) / PX;
/** Seated hip line (thighs foreshortened toward camera). */
const SEAT_Y = HIP_Y + 40;
/** Desk line on the card for seated writing poses. */
const DESK_Y = SEAT_Y - 115;
/** Seat / desk heights in metres at scale 1 (multiply by the character scale in worlds). */
export const SEAT_HEIGHT = (SOLE - SEAT_Y) / PX;
export const DESK_HEIGHT = (SOLE - DESK_Y) / PX;
/** Hand centres stay this far inside the card so mittens and props never clip. */
const HAND_MARGIN = 44;
/** Mittens and hand props are authored at Persis size and drawn at this scale. */
const HAND_SCALE = 0.55;


// ── Looks ───────────────────────────────────────────────────────────────────

type Headwear =
  | { kind: 'hijab'; color: string }
  | { kind: 'peci'; tilt: number }
  | { kind: 'caping'; color: string }
  | { kind: 'kepi'; color: string; band: string }
  | { kind: 'stationCap'; color: string }
  | { kind: 'cap'; color: string }
  | { kind: 'hair'; style: 'short' | 'bun' | 'kid' };
type Outfit = 'jacket' | 'kemeja' | 'uniform' | 'kebaya' | 'koko' | 'kaos' | 'lurik' | 'polo';
type Beard = 'none' | 'neat' | 'goatee';

interface HumanLook {
  kind: 'human';
  skin: string;
  skinShade: string;
  hair: string;
  headwear: Headwear;
  outfit: Outfit;
  cloth: string;
  clothShade: string;
  /** Inner shirt / trim colour. */
  accent: string;
  beard: Beard;
  mustache: boolean;
  glasses: boolean;
  lashes: boolean;
  browColor: string;
  /** Backpack colour (straps over the shoulders), or null. */
  pack: string | null;
  bottom: 'pants' | 'skirt' | 'sarung';
  bottomColor: string;
  shoes: 'sneakers' | 'boots' | 'shoes' | 'sandals';
  shoeUpper: string;
  shoeAccent: string;
}

interface CritterLook {
  kind: 'critter';
  species: 'ayam' | 'kucing';
  color: string;
  accent: string;
}

type Look = HumanLook | CritterLook;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
}

const human = (l: Partial<HumanLook> & Pick<HumanLook, 'skin' | 'headwear' | 'outfit' | 'cloth'>): HumanLook => ({
  kind: 'human',
  skinShade: shade(l.skin, -0.16),
  hair: '#231918',
  clothShade: shade(l.cloth, -0.14),
  accent: '#fbf8f1',
  beard: 'none',
  mustache: false,
  glasses: false,
  lashes: l.headwear.kind === 'hijab' || (l.headwear.kind === 'hair' && l.headwear.style === 'bun'),
  browColor: '#1f1615',
  pack: null,
  bottom: 'pants',
  bottomColor: '#3a3440',
  shoes: 'shoes',
  shoeUpper: '#1d1a1a',
  shoeAccent: '#d9a441',
  ...l,
});

export const LOOKS: Record<LookId, Look> = {
  dinda: human({ skin: '#e2b088', headwear: { kind: 'hijab', color: '#d9a441' }, outfit: 'jacket', cloth: '#5b7fb5', accent: '#fbf8f1', browColor: '#3a2620', pack: '#c4553d', bottomColor: '#2e3346', shoes: 'sneakers', shoeUpper: '#d2493f', shoeAccent: '#fbf7ee' }),
  petani: human({ skin: '#b97f57', headwear: { kind: 'caping', color: '#d8b878' }, outfit: 'lurik', cloth: '#6b5a44', mustache: true, bottomColor: '#3d3a35', shoes: 'boots', shoeUpper: '#2b2b2b' }),
  kepalaStasiun: human({ skin: '#d6a074', headwear: { kind: 'stationCap', color: '#f1ece0' }, outfit: 'uniform', cloth: '#ece5d3', accent: '#c9a14a', mustache: true, glasses: true, bottomColor: '#e2dac6' }),
  stafKoran: human({ skin: '#c99068', headwear: { kind: 'peci', tilt: 0.04 }, outfit: 'kemeja', cloth: '#d9cfb8', bottomColor: '#5a4a3a', shoeUpper: '#2a201a' }),
  kondektur: human({ skin: '#cf9a70', headwear: { kind: 'kepi', color: '#2d3550', band: '#d9b45a' }, outfit: 'uniform', cloth: '#34405e', accent: '#d9b45a', mustache: true, bottomColor: '#2c3550' }),
  penumpangPria: human({ skin: '#c99068', headwear: { kind: 'hair', style: 'short' }, outfit: 'kemeja', cloth: '#e8e2d2', bottom: 'sarung', bottomColor: '#6a3b2e', shoes: 'sandals', shoeUpper: '#5a3a24' }),
  penumpangWanita: human({ skin: '#d9a77c', headwear: { kind: 'hair', style: 'bun' }, outfit: 'kebaya', cloth: '#d98c7a', bottom: 'skirt', bottomColor: '#5b3a2a', shoes: 'sandals', shoeUpper: '#6a4128' }),
  ibuBakul: human({ skin: '#c48a62', headwear: { kind: 'hijab', color: '#7a8f6a' }, outfit: 'kebaya', cloth: '#c9b48a', bottom: 'skirt', bottomColor: '#4a3426', shoes: 'sandals', shoeUpper: '#5a3a24' }),
  bapakPeci: human({ skin: '#b98058', headwear: { kind: 'peci', tilt: 0 }, outfit: 'koko', cloth: '#f0ebe0', beard: 'goatee', mustache: true, bottom: 'sarung', bottomColor: '#3e4a6a', shoes: 'sandals', shoeUpper: '#4a3020' }),
  petugas1935: human({ skin: '#d0986e', headwear: { kind: 'stationCap', color: '#ece6d6' }, outfit: 'uniform', cloth: '#e8e0cc', accent: '#c9a14a', bottomColor: '#e0d8c4' }),
  pekerjaRel: human({ skin: '#a87250', headwear: { kind: 'caping', color: '#cfae6e' }, outfit: 'kaos', cloth: '#8a6e4e', bottomColor: '#3a3a3a', shoes: 'boots', shoeUpper: '#2a2624' }),
  pekerjaRel2: human({ skin: '#b37a54', headwear: { kind: 'hair', style: 'short' }, outfit: 'lurik', cloth: '#5c4c3c', mustache: true, bottomColor: '#45403a', shoes: 'boots', shoeUpper: '#262220' }),
  petugas1980: human({ skin: '#cf9a70', headwear: { kind: 'kepi', color: '#3c4636', band: '#d8c070' }, outfit: 'uniform', cloth: '#8f9a7a', accent: '#d8c070', mustache: true, glasses: true, bottomColor: '#3a3f36' }),
  petugas1982: human({ skin: '#c58f66', headwear: { kind: 'stationCap', color: '#d9d3c0' }, outfit: 'uniform', cloth: '#a19a7c', accent: '#d8c070', bottomColor: '#4a4a40' }),
  anak: human({ skin: '#d6a074', headwear: { kind: 'hair', style: 'kid' }, outfit: 'kaos', cloth: '#d65a4a', bottomColor: '#3a4a6a', shoes: 'sandals', shoeUpper: '#3a5a8a' }),
  anakModern: human({ skin: '#d8a478', headwear: { kind: 'hair', style: 'kid' }, outfit: 'kaos', cloth: '#f2c230', bottomColor: '#2e5c8a', shoes: 'sneakers', shoeUpper: '#3d8ad0', shoeAccent: '#fbf7ee' }),
  warga: human({ skin: '#be855d', headwear: { kind: 'caping', color: '#d2b072' }, outfit: 'kebaya', cloth: '#8a7a5a', bottom: 'skirt', bottomColor: '#4f3b2c', shoes: 'sandals', shoeUpper: '#4a3020' }),
  penumpangModern: human({ skin: '#cf9a70', headwear: { kind: 'cap', color: '#2e2e36' }, outfit: 'polo', cloth: '#3d8a8a', bottomColor: '#2a2a3a', shoes: 'sneakers', shoeUpper: '#2e2e36', shoeAccent: '#f2c230' }),
  penumpangModern2: human({ skin: '#dcab80', headwear: { kind: 'hijab', color: '#c25a7a' }, outfit: 'kemeja', cloth: '#ece3d4', pack: '#3f5f8a', bottom: 'skirt', bottomColor: '#3a3a50', shoes: 'sneakers', shoeUpper: '#f0ece4', shoeAccent: '#c25a7a' }),
  ayam: { kind: 'critter', species: 'ayam', color: '#f3ead8', accent: '#d8402e' },
  kucing: { kind: 'critter', species: 'kucing', color: '#e39a4b', accent: '#b8672a' },
};

// ── Expressions & idle life ─────────────────────────────────────────────────

interface FacePreset {
  lid: number;
  browRaise: number;
  /** + raises inner brow ends (worry), − pulls them down (serious). */
  browInner: number;
  browAsym: number;
  smile: number;
  bow: number;
  lookY: number;
  /** Small "o" mouth (wonder). */
  open: number;
}

const PRESETS: Record<Expression, FacePreset> = {
  neutral: { lid: 0.28, browRaise: 0.1, browInner: 0, browAsym: 0, smile: 0.15, bow: 0, lookY: 0, open: 0 },
  warm: { lid: 0.2, browRaise: 0.35, browInner: 0.1, browAsym: 0, smile: 0.7, bow: 0, lookY: 0, open: 0 },
  serious: { lid: 0.36, browRaise: 0, browInner: -0.85, browAsym: 0, smile: -0.2, bow: 0.05, lookY: 0, open: 0 },
  thinking: { lid: 0.3, browRaise: 0.35, browInner: 0.1, browAsym: 0.7, smile: -0.06, bow: 0, lookY: -0.6, open: 0 },
  sad: { lid: 0.46, browRaise: 0.12, browInner: 0.85, browAsym: 0, smile: -0.45, bow: 0.25, lookY: 0.5, open: 0 },
  wonder: { lid: 0.06, browRaise: 0.8, browInner: 0.3, browAsym: 0, smile: 0.25, bow: 0, lookY: -0.3, open: 0.32 },
};

function blinkShape(d: number): number {
  let v = 0;
  if (d >= -2 && d < 0) v = (d + 2) / 2;
  else if (d >= 0 && d <= 1) v = 1;
  else if (d > 1 && d <= 5) v = 1 - (d - 1) / 4;
  return v * v * (3 - 2 * v);
}

/** Seeded irregular blink rhythm (~every 3–5 s) with occasional double blinks. */
function blinkAt(frame: number, seed: number): number {
  const period = 104;
  const k0 = Math.floor(frame / period);
  let amount = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const t0 = k * period + 12 + hash01(seed, k) * 64;
    amount = Math.max(amount, blinkShape(frame - t0));
    if (hash01(seed + 7, k) > 0.78) amount = Math.max(amount, blinkShape(frame - t0 - 9));
  }
  return amount;
}

const BREATH_HZ = 0.22;
const WEIGHT_SHIFT_HZ = 0.11;

export interface ArmBlend {
  from: ArmPose;
  to: ArmPose;
  mix: number;
}

export interface ToonDrive {
  frame: number;
  /** Shot progress 0..1 (drives the handwriting). */
  progress: number;
  expression: { from: Expression; to: Expression; mix: number };
  turn: number;
  nod: number;
  armRight: ArmBlend;
  armLeft: ArmBlend;
  /** Walk phase in radians (gentle bob), or null when still. */
  walkPhase: number | null;
  /** +1 walking toward +x, −1 toward −x (critters mirror). */
  walkDir: number;
  /** 0..1 progress of the chalk line on the lap board. */
  drawProgress: number;
  /** Frames since the current expression key began (snappy swap + blink); large = settled. */
  expressionAge?: number;
  /**
   * Scene light for the card (color script): rim tint + strength, and which
   * screen side the key light comes from (−1 = left, +1 = right).
   */
  light?: { rim: string; rimStrength: number; side: number };
}

export interface ActorSetup {
  pose: BodyPose;
  leftProp: HandProp;
  rightProp: HandProp;
  bodyProp: BodyProp;
}

interface Pose extends FacePreset {
  turn: number;
  tilt: number;
  lookX: number;
  blink: number;
  breath: number;
  breathOpen: number;
  breathHead: number;
  shiftX: number;
  shiftRot: number;
  bob: number;
  frame: number;
}

function poseFor(d: ToonDrive, seed: number): Pose {
  const a = PRESETS[d.expression.from];
  const b = PRESETS[d.expression.to];
  const mk = (k: keyof FacePreset): number => lerp(a[k], b[k], d.expression.mix);
  const f = d.frame;
  const s = f / 30;
  const sway = Math.sin(s * 0.8 + seed) * 0.04 + Math.sin(s * 2.1 + seed * 2) * 0.015;
  const turn = d.turn + sway;
  const bow = clamp01(mk('bow') + d.nod * 0.6);
  const bp = 2 * Math.PI * BREATH_HZ * s + seed;
  const inhale = (p: number): number => 0.5 - 0.5 * Math.cos(p + 0.35 * Math.sin(p));
  const breathOpen = inhale(bp);
  const weight = Math.sin(2 * Math.PI * WEIGHT_SHIFT_HZ * s + seed * 1.7) + 0.35 * Math.sin(2 * Math.PI * WEIGHT_SHIFT_HZ * 2.3 * s + seed);
  const shiftRot = weight * 0.011;
  const saccade = (hash01(seed + 53, Math.floor((f + seed * 7) / 38)) - 0.5) * 0.3;
  return {
    lid: mk('lid') + bow * 0.15,
    browRaise: mk('browRaise'),
    browInner: mk('browInner'),
    browAsym: mk('browAsym'),
    smile: mk('smile'),
    open: mk('open'),
    bow,
    lookY: clamp01(mk('lookY') * 0.5 + 0.5 + bow * 0.25) * 2 - 1,
    turn,
    tilt: turn * 0.07 + Math.sin(s * 0.6 + seed) * 0.02 - shiftRot * 0.6,
    lookX: Math.max(-1, Math.min(1, turn * 1.7 + saccade)),
    blink: blinkAt(f, seed),
    breath: -(breathOpen - 0.5) * 7,
    breathOpen,
    breathHead: -(inhale(bp - 0.5) - 0.5) * 5,
    shiftX: weight * 6,
    shiftRot,
    bob: d.walkPhase === null ? 0 : Math.cos(d.walkPhase * 2) * 3.5,
    frame: f,
  };
}

// ── Shared paint helpers ────────────────────────────────────────────────────

type Pt = readonly [number, number];
/** [0] = character's right arm (screen left), [1] = character's left arm (screen right). */
const SIGN = [-1, 1] as const;

/** Ink multiplier so scaled-down head/hand art keeps the same on-card line weight. */
let inkMul = 1;

function strokeOutline(ctx: CanvasRenderingContext2D, width = OUTLINE): void {
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width * inkMul;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function filled(ctx: CanvasRenderingContext2D, path: () => void, fill: string, line = 8): void {
  ctx.beginPath();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  strokeOutline(ctx, line);
}

/** The Persis bean head: superellipse with a softly pointed crown, centred on (0, 0). */
function traceBeanHead(ctx: CanvasRenderingContext2D, scale = 1): void {
  const segments = 120;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const top = s < 0;
    const n = top ? 2.3 : 2.9;
    const x = HEAD_HALF_W * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    let y = HEAD_HALF_H * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (top) {
      const k = 1 - Math.abs(x) / HEAD_HALF_W;
      y *= (1 + 0.22 * k * k * k) / 1.22;
    }
    if (i === 0) ctx.moveTo(x * scale, y * scale);
    else ctx.lineTo(x * scale, y * scale);
  }
  ctx.closePath();
}

// ── Body + legs ─────────────────────────────────────────────────────────────

interface Frame {
  pose: BodyPose;
  cx: number;
  /** Torso top (collar line). */
  top: number;
  hipY: number;
  breathScale: number;
  headX: number;
  headY: number;
  /** Walking: per-leg shoe lift in px (swing phase only, ≤ 20). */
  lift: readonly [number, number];
  /** Walking: per-leg fore-aft ankle offset in px (screen x, already multiplied by walkDir). */
  stride: readonly [number, number];
  /** Walking: per-leg shoe pitch in rad, + = toe up (heel strike), − = heel up (push-off). */
  pitch: readonly [number, number];
  /** Walking: normalised foot position −1 (back) … +1 (front) per leg, used for the opposite arm swing. */
  footN: readonly [number, number];
  walking: boolean;
  walkDir: number;
}

const STRIDE_AMP = 44;
/**
 * Walk phase (radians) per metre travelled at scale 1. The stance foot slides
 * back 2·STRIDE_AMP card px over π radians, so phase = metres · PX / (2·STRIDE_AMP/π)
 * keeps the planted shoe still on the ground (no skating). Short chibi legs
 * therefore take quick, small steps — which reads as natural for the proportions.
 */
export const WALK_PHASE_PER_METRE = PX / ((2 * STRIDE_AMP) / Math.PI);
const SWING_LIFT = 20;
const ARM_SWING = 28;
const WALK_LEAN = 0.07;

/**
 * One bipedal foot cycle. θ ∈ [0, π) is the swing (foot flies from back to front on a
 * sine lift arc), θ ∈ [π, 2π) is the stance (foot flat on the floor, sliding back linearly).
 */
function footCycle(theta: number): { x: number; lift: number; pitch: number } {
  const t = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (t < Math.PI) {
    const u = t / Math.PI;
    return { x: -Math.cos(t), lift: Math.sin(t), pitch: -0.42 * (1 - smoothstep(0, 0.4, u)) + 0.3 * smoothstep(0.65, 1, u) };
  }
  const v = (t - Math.PI) / Math.PI;
  return { x: 1 - 2 * v, lift: 0, pitch: 0.3 * (1 - smoothstep(0, 0.25, v)) - 0.42 * smoothstep(0.7, 1, v) };
}

function frameFor(pose: Pose, body: BodyPose, walkPhase: number | null, walkDir = 1): Frame {
  const cx = HEAD_CX + pose.turn * 3;
  const seat = body === 'sit' ? SEAT_Y - HIP_Y : 0;
  const walking = walkPhase !== null && body !== 'sit';
  const dir = walkDir < 0 ? -1 : 1;
  // Double-support contact (φ = 0, π) is the lowest point: a soft 3.5 px double-frequency bob.
  const bob = walking ? Math.cos((walkPhase ?? 0) * 2) * 3.5 : 0;
  const cyc = [0, 1].map((i) => (walking ? footCycle((walkPhase ?? 0) + i * Math.PI) : { x: 0, lift: 0, pitch: 0 }));
  const at = <K extends 'x' | 'lift' | 'pitch'>(i: number, k: K): number => cyc[i]?.[k] ?? 0;
  return {
    pose: body,
    cx,
    top: TORSO_TOP + seat + bob + pose.breath * 0.5 + pose.bow * 3,
    hipY: HIP_Y + seat + bob,
    breathScale: 1 + pose.breathOpen * 0.02,
    headX: HEAD_CX + pose.turn * 6,
    headY: HEAD_CY + seat + bob + pose.breathHead * 0.6 + pose.bow * 10,
    lift: [at(0, 'lift') * SWING_LIFT, at(1, 'lift') * SWING_LIFT],
    stride: [at(0, 'x') * STRIDE_AMP * dir, at(1, 'x') * STRIDE_AMP * dir],
    pitch: [at(0, 'pitch'), at(1, 'pitch')],
    footN: [at(0, 'x'), at(1, 'x')],
    walking,
    walkDir: dir,
  };
}

function traceTorso(ctx: CanvasRenderingContext2D, fr: Frame): void {
  const sw = 90 * fr.breathScale;
  const hem = fr.hipY + 22;
  const top = fr.top;
  const cx = fr.cx;
  ctx.beginPath();
  ctx.moveTo(cx - 100, hem);
  ctx.lineTo(cx - sw - 6, top + 58);
  ctx.quadraticCurveTo(cx - sw, top, cx - sw + 40, top - 4);
  ctx.lineTo(cx + sw - 40, top - 4);
  ctx.quadraticCurveTo(cx + sw, top, cx + sw + 6, top + 58);
  ctx.lineTo(cx + 100, hem);
  ctx.quadraticCurveTo(cx, hem + 12, cx - 100, hem);
  ctx.closePath();
}

function drawPackBehind(ctx: CanvasRenderingContext2D, look: HumanLook, fr: Frame): void {
  if (!look.pack) return;
  const x = fr.cx - 116;
  const y = fr.top - 26;
  filled(ctx, () => ctx.roundRect(fr.cx - 30, y - 22, 60, 30, 14), shade(look.pack, -0.25), 7);
  filled(ctx, () => ctx.roundRect(x, y, 232, fr.hipY - y - 30, 44), look.pack, 8);
  const g = ctx.createLinearGradient(x, 0, x + 232, 0);
  g.addColorStop(0, 'rgba(255,230,200,0.28)');
  g.addColorStop(0.4, 'rgba(255,230,200,0)');
  g.addColorStop(1, 'rgba(30,10,20,0.38)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, 224, fr.hipY - y - 38, 40);
  ctx.fill();
}

/** Trousers / skirt / sarung and cartoon shoes planted on SOLE. */
function drawLegs(ctx: CanvasRenderingContext2D, look: HumanLook, fr: Frame): void {
  const sit = fr.pose === 'sit';
  const legs = SIGN.map((s, i) => {
    const lift = fr.lift[i] ?? 0;
    const pitch = fr.pitch[i] ?? 0;
    const hip: Pt = [fr.cx + s * 36, fr.hipY];
    // Heel rises with the push-off pitch, so the ankle follows it.
    const ankle: Pt = [fr.cx + s * (sit ? 46 : 40) + (fr.stride[i] ?? 0), SOLE - 28 - lift - Math.max(0, -pitch) * 30];
    let knee: Pt = sit ? [fr.cx + s * 42, fr.hipY + 30] : [fr.cx + s * 38, lerp(fr.hipY, SOLE, 0.5) - lift * 0.5];
    if (fr.walking && !sit) {
      // Two-bone IK: thigh = shin, the knee always bends forward (toward walkDir).
      const half = (SOLE - 28 - HIP_Y) / 2 * 1.004;
      const dx = ankle[0] - hip[0];
      const dy = ankle[1] - hip[1];
      const d = Math.max(1, Math.hypot(dx, dy));
      const h = Math.sqrt(Math.max(0, half * half - (d / 2) * (d / 2)));
      knee = [(hip[0] + ankle[0]) / 2 + (dy / d) * h * fr.walkDir, (hip[1] + ankle[1]) / 2 - (dx / d) * h * fr.walkDir];
    }
    return { s, hip, knee, ankle, lift, pitch };
  });
  const pants = look.bottom === 'pants' || look.bottom === 'sarung';
  const legColor = pants ? look.bottomColor : look.skin;
  const leg = (pts: readonly Pt[], width: number, color: string): void => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = width + 12;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    // Soft form shade on the far side of each leg.
    ctx.save();
    ctx.translate(width * 0.2, 0);
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = 'rgba(30, 16, 40, 0.18)';
    ctx.lineWidth = width * 0.38;
    ctx.stroke();
    ctx.restore();
  };
  for (const l of legs) leg([l.hip, l.knee, l.ankle], pants ? 50 : 30, legColor);
  // Shoes (drawn after both legs so the near shoe overlaps cleanly).
  for (const l of legs) {
    // Pitch about the toe (heel up) or the heel (toe up) so a planted shoe never sinks below SOLE.
    const sx = l.ankle[0] + l.s * 12;
    const px = sx + (l.pitch < 0 ? 1 : -1) * fr.walkDir * 48;
    const py = SOLE - l.lift;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-l.pitch * fr.walkDir);
    ctx.translate(-px, -py);
    drawShoe(ctx, look, sx, SOLE - l.lift, l.s);
    ctx.restore();
  }
  // Hip block / garment over the top of the legs.
  if (look.bottom === 'pants') {
    filled(ctx, () => ctx.roundRect(fr.cx - 76, fr.hipY - 34, 152, sit ? 64 : 70, 26), look.bottomColor, 9);
    ctx.strokeStyle = shade(look.bottomColor, 0.2);
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    for (const l of legs) {
      ctx.moveTo(l.hip[0] + l.s * 6, l.hip[1] + 26);
      ctx.lineTo(l.knee[0] + l.s * 8, l.knee[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const hem = look.bottom === 'sarung' ? SOLE - 70 : sit ? fr.hipY + 150 : SOLE - 80;
    const flare = sit ? 112 : look.bottom === 'sarung' ? 84 : 92;
    const tube = (): void => {
      ctx.moveTo(fr.cx - 78, fr.hipY - 34);
      ctx.lineTo(fr.cx + 78, fr.hipY - 34);
      ctx.lineTo(fr.cx + flare, hem);
      ctx.quadraticCurveTo(fr.cx, hem + 12, fr.cx - flare, hem);
      ctx.closePath();
    };
    filled(ctx, tube, look.bottomColor, 9);
    ctx.save();
    ctx.beginPath();
    tube();
    ctx.clip();
    if (look.bottom === 'sarung') {
      ctx.strokeStyle = shade(look.bottomColor, 0.25);
      ctx.lineWidth = 6;
      for (let x = fr.cx - 120; x < fr.cx + 120; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, fr.hipY - 40);
        ctx.lineTo(x, hem + 20);
        ctx.stroke();
      }
      ctx.strokeStyle = shade(look.bottomColor, -0.3);
      for (let y = fr.hipY - 30; y < hem + 20; y += 26) {
        ctx.beginPath();
        ctx.moveTo(fr.cx - 130, y);
        ctx.lineTo(fr.cx + 130, y);
        ctx.stroke();
      }
    } else {
      // Batik kain dots.
      ctx.fillStyle = shade(look.bottomColor, 0.3);
      for (let y = fr.hipY - 20; y < hem + 10; y += 30) {
        for (let x = fr.cx - 120 + ((y / 30) % 2 ? 15 : 0); x < fr.cx + 120; x += 30) {
          ctx.beginPath();
          ctx.ellipse(x, y, 5, 8, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}

function drawShoe(ctx: CanvasRenderingContext2D, look: HumanLook, x: number, sole: number, s: number): void {
  switch (look.shoes) {
    case 'sneakers': {
      // Rounded upper, thick white sole, plum-inked, laces + accent swoosh.
      filled(ctx, () => ctx.ellipse(x, sole - 26, 46, 26, 0, 0, Math.PI * 2), look.shoeUpper, 8);
      filled(ctx, () => ctx.roundRect(x - 52, sole - 18, 104, 18, 9), '#fbf7ee', 7);
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 46, sole - 9);
      ctx.lineTo(x + 46, sole - 9);
      ctx.stroke();
      ctx.strokeStyle = '#fbf7ee';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(x - 14 + k * 10, sole - 46);
        ctx.lineTo(x - 6 + k * 10, sole - 36);
      }
      ctx.stroke();
      ctx.strokeStyle = look.shoeAccent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x - s * 30, sole - 22);
      ctx.quadraticCurveTo(x, sole - 30, x + s * 30, sole - 36);
      ctx.stroke();
      return;
    }
    case 'boots':
      filled(ctx, () => ctx.roundRect(x - s * 12 - 30, sole - 120, 60, 112, 16), look.shoeUpper, 8);
      filled(ctx, () => ctx.ellipse(x, sole - 18, 46, 20, 0, 0, Math.PI * 2), look.shoeUpper, 8);
      filled(ctx, () => ctx.roundRect(x - 50, sole - 10, 100, 10, 5), shade(look.shoeUpper, -0.4), 6);
      return;
    case 'shoes':
      filled(ctx, () => ctx.ellipse(x, sole - 20, 44, 21, 0, 0, Math.PI * 2), look.shoeUpper, 8);
      filled(ctx, () => ctx.roundRect(x - 48, sole - 9, 96, 9, 4), '#1a1416', 5);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(x - s * 14, sole - 30, 12, 5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'sandals':
      filled(ctx, () => ctx.ellipse(x, sole - 16, 36, 15, 0, 0, Math.PI * 2), look.skin, 7);
      filled(ctx, () => ctx.roundRect(x - 44, sole - 8, 88, 8, 4), look.shoeUpper, 6);
      ctx.fillStyle = look.shoeUpper;
      ctx.fillRect(x - 26, sole - 26, 52, 9);
      return;
  }
}

function drawBody(ctx: CanvasRenderingContext2D, look: HumanLook, fr: Frame): void {
  const { cx, top } = fr;
  const hem = fr.hipY + 22;
  ctx.fillStyle = look.skinShade;
  ctx.fillRect(cx - 20, fr.headY + 70, 40, top - fr.headY - 60);

  ctx.save();
  traceTorso(ctx, fr);
  ctx.fillStyle = look.cloth;
  ctx.fill();
  ctx.clip();
  // Persis form shade on the far side + warm light from the upper left.
  ctx.fillStyle = look.clothShade;
  ctx.beginPath();
  ctx.ellipse(cx + 118, top + 130, 62, 170, 0, 0, Math.PI * 2);
  ctx.fill();
  const lit = ctx.createLinearGradient(cx - 110, top, cx + 20, top + 160);
  lit.addColorStop(0, 'rgba(255, 238, 205, 0.2)');
  lit.addColorStop(1, 'rgba(255, 238, 205, 0)');
  ctx.fillStyle = lit;
  ctx.fillRect(cx - 120, top - 10, 140, hem - top + 20);
  const v = (w: number, depth: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx - w, top - 6);
    ctx.lineTo(cx, top + depth);
    ctx.lineTo(cx + w, top - 6);
    ctx.closePath();
  };
  switch (look.outfit) {
    case 'jacket': {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 2;
      for (let k = -260; k < 260; k += 6) {
        ctx.beginPath();
        ctx.moveTo(cx + k, top - 10);
        ctx.lineTo(cx + k + 150, hem + 10);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(220, 235, 255, 0.16)';
      ctx.beginPath();
      ctx.ellipse(cx - 56, top + 140, 30, 80, -0.1, 0, Math.PI * 2);
      ctx.fill();
      // White tee under the open jacket.
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.moveTo(cx - 34, top - 6);
      ctx.lineTo(cx - 28, hem + 10);
      ctx.lineTo(cx + 28, hem + 10);
      ctx.lineTo(cx + 34, top - 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = look.clothShade;
      for (const s of SIGN) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 34, top - 6);
        ctx.lineTo(cx + s * 30, top + 96);
        ctx.lineTo(cx + s * 70, top + 34);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 4;
      for (const s of SIGN) {
        ctx.strokeRect(cx + s * 66 - 20, top + 74, 40, 30);
        ctx.fillStyle = '#c98a3a';
        ctx.beginPath();
        ctx.arc(cx + s * 66 - s * 15, top + 80, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#e8c27a';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      for (const s of SIGN) {
        ctx.moveTo(cx + s * 40, top + 8);
        ctx.lineTo(cx + s * 36, hem);
        ctx.moveTo(cx + s * 108, top + 58);
        ctx.quadraticCurveTo(cx + s * 76, top + 66, cx + s * 46, top + 62);
      }
      ctx.moveTo(cx - 98, hem - 16);
      ctx.lineTo(cx + 98, hem - 16);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (const s of SIGN) {
        ctx.moveTo(cx + s * 34, top - 6);
        ctx.lineTo(cx + s * 29, hem + 10);
      }
      ctx.stroke();
      break;
    }
    case 'uniform': {
      ctx.fillStyle = look.accent;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, top + 36 + i * 50, 6, 0, Math.PI * 2);
        ctx.fill();
        strokeOutline(ctx, 3);
      }
      ctx.strokeStyle = look.clothShade;
      ctx.lineWidth = 4;
      for (const s of SIGN) {
        ctx.strokeRect(cx + s * 56 - 24, top + 72, 48, 42);
        ctx.fillStyle = look.clothShade;
        ctx.fillRect(cx + s * 56 - 26, top + 70, 52, 12);
      }
      ctx.fillStyle = '#2a2220';
      ctx.fillRect(cx - 110, fr.hipY - 18, 220, 14);
      ctx.fillStyle = look.accent;
      ctx.fillRect(cx - 10, fr.hipY - 20, 20, 18);
      break;
    }
    case 'kebaya': {
      v(40, 104);
      ctx.fillStyle = look.skinShade;
      ctx.fill();
      ctx.fillStyle = '#f7efe2';
      for (const s of SIGN) {
        for (let i = 0; i < 8; i++) {
          const t = i / 7;
          ctx.beginPath();
          ctx.arc(cx + s * lerp(42, 3, t), lerp(top - 3, top + 104, t), 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#d9b45a';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, top + 122 + i * 34, 6, 0, Math.PI * 2);
        ctx.fill();
        strokeOutline(ctx, 3);
      }
      break;
    }
    case 'koko': {
      ctx.fillStyle = look.clothShade;
      ctx.fillRect(cx - 2, top + 6, 5, 200);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx + 7, top + 36 + i * 36, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lurik': {
      ctx.strokeStyle = shade(look.cloth, -0.35);
      ctx.lineWidth = 5;
      for (let x = cx - 120; x < cx + 120; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, top - 10);
        ctx.lineTo(x, hem + 10);
        ctx.stroke();
      }
      v(30, 60);
      ctx.fillStyle = look.skinShade;
      ctx.fill();
      break;
    }
    case 'kemeja':
    case 'polo': {
      ctx.fillStyle = PLUM;
      for (let i = 0; i < (look.outfit === 'polo' ? 2 : 4); i++) {
        ctx.beginPath();
        ctx.arc(cx + 6, top + 30 + i * 44, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = look.clothShade;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, top + 10);
      ctx.lineTo(cx, look.outfit === 'polo' ? top + 100 : hem);
      ctx.stroke();
      break;
    }
    case 'kaos': {
      ctx.fillStyle = look.skinShade;
      ctx.beginPath();
      ctx.ellipse(cx, top - 4, 34, 18, 0, 0, Math.PI);
      ctx.fill();
      break;
    }
  }
  ctx.restore();

  traceTorso(ctx, fr);
  strokeOutline(ctx, 9);
  if (look.outfit === 'kemeja' || look.outfit === 'polo' || look.outfit === 'uniform') {
    for (const s of SIGN) {
      filled(ctx, () => {
        ctx.moveTo(cx + s * 4, top - 8);
        ctx.lineTo(cx + s * 48, top - 10);
        ctx.lineTo(cx + s * 22, top + 34);
        ctx.closePath();
      }, shade(look.cloth, 0.12), 5);
    }
  } else if (look.outfit === 'koko') {
    filled(ctx, () => ctx.roundRect(cx - 34, top - 10, 68, 18, 7), look.cloth, 5);
  }
  if (look.pack) {
    for (const s of SIGN) {
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + s * 60, top - 2);
      ctx.quadraticCurveTo(cx + s * 72, top + 110, cx + s * 66, fr.hipY - 6);
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 24;
      ctx.stroke();
      ctx.strokeStyle = shade(look.pack, -0.18);
      ctx.lineWidth = 15;
      ctx.stroke();
      filled(ctx, () => ctx.roundRect(cx + s * 71 - 11, top + 112, 22, 14, 3), '#cfcac0', 4);
    }
  }
}

function drawEye(ctx: CanvasRenderingContext2D, ex: number, ey: number, scaleX: number, pose: Pose, skin: string, lashes: boolean, side: -1 | 1): void {
  const rx = 40 * scaleX;
  const ry = 47;
  const closeY = ey + ry * 0.45;
  const coverage = clamp01(pose.lid + (1 - pose.lid) * pose.blink);
  const lidY = lerp(ey - ry, closeY, coverage);
  const lowerY = lerp(ey + ry, closeY, pose.blink);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fbf5ea';
  ctx.fill();
  ctx.clip();
  const px = ex + pose.lookX * 15 * scaleX;
  const py = ey + 6 + pose.lookY * 14;
  ctx.fillStyle = '#4a2a1c';
  ctx.beginPath();
  ctx.ellipse(px, py, 21 * scaleX, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1f120e';
  ctx.beginPath();
  ctx.ellipse(px, py + 2, 12 * scaleX, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - 7 * scaleX, py - 9, 6.5, 0, Math.PI * 2);
  ctx.arc(px + 7 * scaleX, py + 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.fillRect(ex - rx - 4, ey - ry - 4, rx * 2 + 8, lidY - (ey - ry - 4));
  ctx.fillRect(ex - rx - 4, lowerY, rx * 2 + 8, ey + ry + 4 - lowerY);
  ctx.restore();
  if (lowerY - lidY > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex - rx - 10, lidY, rx * 2 + 20, lowerY - lidY);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
    strokeOutline(ctx, 6);
    ctx.restore();
  }
  const dy = (lidY - ey) / ry;
  const hw = rx * Math.sqrt(Math.max(0, 1 - dy * dy)) + 5;
  ctx.beginPath();
  ctx.moveTo(ex - hw, lidY);
  ctx.quadraticCurveTo(ex, lidY + 3 + pose.blink * 12, ex + hw, lidY);
  strokeOutline(ctx, lashes ? 9 : 7.5);
  if (lashes) {
    // Curled outer lashes.
    const ox = ex + side * hw;
    ctx.beginPath();
    ctx.moveTo(ox - side * 6, lidY + 2);
    ctx.quadraticCurveTo(ox + side * 10, lidY - 4, ox + side * 18, lidY - 16);
    ctx.moveTo(ox - side * 16, lidY - 2);
    ctx.quadraticCurveTo(ox - side * 2, lidY - 12, ox + side * 4, lidY - 24);
    strokeOutline(ctx, 6);
  }
}

function drawBrow(ctx: CanvasRenderingContext2D, color: string, ex: number, ey: number, side: -1 | 1, pose: Pose, scaleX: number, thin: boolean): void {
  const raise = pose.browRaise + pose.browAsym * 0.5 * side;
  const baseY = ey - 47 - 32 - raise * 24;
  const half = 36 * scaleX;
  const innerX = ex - side * half;
  const outerX = ex + side * half;
  const innerY = baseY - pose.browInner * 14 + 2;
  const outerY = baseY + Math.max(0, pose.browInner) * 6 - 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = thin ? 10 : 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(outerX, outerY);
  ctx.quadraticCurveTo(ex, Math.min(innerY, outerY) - 8, innerX, innerY);
  ctx.stroke();
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, pose: Pose): void {
  const hw = 40;
  const curve = pose.smile * 22;
  if (pose.open < 0.05) {
    ctx.beginPath();
    ctx.moveTo(x - hw, y - curve * 0.3);
    ctx.quadraticCurveTo(x, y + curve, x + hw, y - curve * 0.3);
    strokeOutline(ctx, 8);
    return;
  }
  const r = 10 + pose.open * 30;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.4, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4e1a2c';
  ctx.fill();
  strokeOutline(ctx, 7);
}

function drawMustache(ctx: CanvasRenderingContext2D, color: string, x: number, y: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 64, y - 4);
  ctx.quadraticCurveTo(x - 34, y - 34, x, y - 20);
  ctx.quadraticCurveTo(x + 34, y - 34, x + 64, y - 4);
  ctx.quadraticCurveTo(x, y - 12, x - 64, y - 4);
  ctx.fill();
  strokeOutline(ctx, 5);
}

function drawGoatee(ctx: CanvasRenderingContext2D, color: string, fx: number, mouthY: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(fx - 50, mouthY + 30);
  ctx.quadraticCurveTo(fx, mouthY + 46, fx + 50, mouthY + 30);
  ctx.quadraticCurveTo(fx + 36, HEAD_HALF_H + 34, fx, HEAD_HALF_H + 44);
  ctx.quadraticCurveTo(fx - 36, HEAD_HALF_H + 34, fx - 50, mouthY + 30);
  ctx.fill();
  strokeOutline(ctx, 6);
}

function drawGlasses(ctx: CanvasRenderingContext2D, lx: number, rx: number, y: number, sL: number, sR: number): void {
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#2a1e14';
  for (const [x, s] of [[lx, sL], [rx, sR]] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 54 * s, 54, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 225, 255, 0.12)';
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(lx + 54 * sL, y);
  ctx.quadraticCurveTo((lx + rx) / 2, y - 18, rx - 54 * sR, y);
  ctx.moveTo(lx - 54 * sL, y - 4);
  ctx.lineTo(-HEAD_HALF_W + 6, y - 14);
  ctx.moveTo(rx + 54 * sR, y - 4);
  ctx.lineTo(HEAD_HALF_W - 6, y - 14);
  ctx.stroke();
}

/** Inner face window of the hijab, in head-local coords. */
function traceHijabFace(ctx: CanvasRenderingContext2D, fx: number): void {
  ctx.ellipse(fx * 0.45, 34, HEAD_HALF_W * 0.8, HEAD_HALF_H * 0.98, 0, 0, Math.PI * 2);
}

/** Hijab back layer: hood that hugs the bean contour + soft drape that falls to `drapeY` (head-local units). */
function drawHijabBack(ctx: CanvasRenderingContext2D, color: string, drapeY: number): void {
  const w = HEAD_HALF_W;
  ctx.beginPath();
  ctx.moveTo(-w * 1.06, 0);
  ctx.bezierCurveTo(-w * 1.16, drapeY * 0.45, -w * 1.08, drapeY * 0.8, -w * 0.74, drapeY * 0.93);
  ctx.quadraticCurveTo(0, drapeY * 1.06, w * 0.74, drapeY * 0.93);
  ctx.bezierCurveTo(w * 1.08, drapeY * 0.8, w * 1.16, drapeY * 0.45, w * 1.06, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w, 0, w, drapeY);
  g.addColorStop(0, shade(color, 0.14));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.24));
  ctx.fillStyle = g;
  ctx.fill();
  strokeOutline(ctx);
  // Soft drape folds.
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.78, drapeY * 0.5);
  ctx.quadraticCurveTo(-w * 0.6, drapeY * 0.72, -w * 0.7, drapeY * 0.9);
  ctx.moveTo(w * 0.8, drapeY * 0.48);
  ctx.quadraticCurveTo(w * 0.56, drapeY * 0.72, w * 0.66, drapeY * 0.9);
  ctx.moveTo(-w * 0.3, drapeY * 0.92);
  ctx.quadraticCurveTo(0, drapeY * 1.0, w * 0.3, drapeY * 0.92);
  ctx.stroke();
}

/** Hijab front frame: the band around the face, following the bean silhouette. */
function drawHijabFront(ctx: CanvasRenderingContext2D, color: string, fx: number): void {
  // Band between the (slightly enlarged) bean silhouette and the oval face window.
  ctx.beginPath();
  traceBeanHead(ctx, 1.07);
  traceHijabFace(ctx, fx);
  const g = ctx.createRadialGradient(-HEAD_HALF_W * 0.4, -HEAD_HALF_H * 0.6, 20, 0, 0, HEAD_HALF_W * 1.3);
  g.addColorStop(0, shade(color, 0.24));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.2));
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  // Outer silhouette and the face opening, both inked.
  traceBeanHead(ctx, 1.07);
  strokeOutline(ctx);
  ctx.beginPath();
  traceHijabFace(ctx, fx);
  strokeOutline(ctx, 8);
  // Crown fold highlights + a darker fold over the temple.
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(color, 0.32);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-HEAD_HALF_W * 0.7, -HEAD_HALF_H * 0.78);
  ctx.quadraticCurveTo(-HEAD_HALF_W * 0.96, -HEAD_HALF_H * 0.35, -HEAD_HALF_W * 0.98, 20);
  ctx.stroke();
  ctx.strokeStyle = shade(color, -0.28);
  ctx.beginPath();
  ctx.moveTo(HEAD_HALF_W * 0.62, -HEAD_HALF_H * 0.86);
  ctx.quadraticCurveTo(HEAD_HALF_W * 0.95, -HEAD_HALF_H * 0.4, HEAD_HALF_W * 0.97, 40);
  ctx.stroke();
  // Little pin under the chin.
  ctx.beginPath();
  ctx.arc(fx * 0.4, HEAD_HALF_H + 36, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#f6ecd2';
  ctx.fill();
  strokeOutline(ctx, 5);
  ctx.beginPath();
  ctx.arc(fx * 0.4, HEAD_HALF_H + 36, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#c25a5a';
  ctx.fill();
}

function drawHair(ctx: CanvasRenderingContext2D, look: HumanLook, style: 'short' | 'bun' | 'kid'): void {
  ctx.save();
  traceBeanHead(ctx);
  ctx.clip();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.moveTo(-HEAD_HALF_W - 10, -HEAD_HALF_H * 0.1);
  const fringe = style === 'kid' ? 7 : 4;
  for (let i = 0; i <= fringe; i++) {
    const x = lerp(-HEAD_HALF_W, HEAD_HALF_W, i / fringe);
    const y = -HEAD_HALF_H * (style === 'bun' ? 0.5 : 0.42) + (i % 2 ? 26 : -6) * (style === 'kid' ? 1.6 : 1);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(HEAD_HALF_W + 10, -HEAD_HALF_H * 0.1);
  ctx.lineTo(HEAD_HALF_W + 10, -HEAD_HALF_H - 40);
  ctx.lineTo(-HEAD_HALF_W - 10, -HEAD_HALF_H - 40);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-HEAD_HALF_W * 0.5, -HEAD_HALF_H * 0.8);
  ctx.quadraticCurveTo(-HEAD_HALF_W * 0.1, -HEAD_HALF_H * 0.95, HEAD_HALF_W * 0.3, -HEAD_HALF_H * 0.85);
  ctx.stroke();
  ctx.restore();
}

function drawHatwear(ctx: CanvasRenderingContext2D, hw: Headwear, pose: Pose): void {
  const hx = pose.turn * 22;
  ctx.save();
  ctx.translate(hx, 0);
  switch (hw.kind) {
    case 'peci': {
      const bottom = -HEAD_HALF_H * 0.42;
      const topY = -HEAD_HALF_H - 22;
      ctx.translate(0, bottom);
      ctx.rotate(hw.tilt);
      const trace = (): void => {
        ctx.beginPath();
        ctx.moveTo(-200, 0);
        ctx.lineTo(-184, topY - bottom + 24);
        ctx.quadraticCurveTo(-182, topY - bottom, -150, topY - bottom);
        ctx.lineTo(150, topY - bottom);
        ctx.quadraticCurveTo(182, topY - bottom, 184, topY - bottom + 24);
        ctx.lineTo(200, 0);
        ctx.quadraticCurveTo(0, 22, -200, 0);
        ctx.closePath();
      };
      trace();
      ctx.fillStyle = '#18131c';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(120, 100, 150, 0.28)';
      ctx.fillRect(-190, topY - bottom + 10, 380, 22);
      ctx.restore();
      trace();
      strokeOutline(ctx, 9);
      break;
    }
    case 'caping': {
      const base = -HEAD_HALF_H * 0.45;
      filled(ctx, () => {
        ctx.moveTo(0, -HEAD_HALF_H - 150);
        ctx.lineTo(320, base + 16);
        ctx.quadraticCurveTo(0, base + 60, -320, base + 16);
        ctx.closePath();
      }, hw.color, 9);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -HEAD_HALF_H - 150);
      ctx.lineTo(320, base + 16);
      ctx.quadraticCurveTo(0, base + 60, -320, base + 16);
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = shade(hw.color, -0.28);
      ctx.lineWidth = 4;
      for (let k = -6; k <= 6; k++) {
        ctx.beginPath();
        ctx.moveTo(0, -HEAD_HALF_H - 150);
        ctx.lineTo(k * 56, base + 50);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60, 30, 20, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, -HEAD_HALF_H - 150);
      ctx.lineTo(320, base + 16);
      ctx.lineTo(60, base + 40);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'kepi':
    case 'stationCap': {
      const crown = hw.kind === 'stationCap';
      const bandY = -HEAD_HALF_H * 0.5;
      if (crown) filled(ctx, () => ctx.ellipse(0, bandY - 70, 236, 70, 0, 0, Math.PI * 2), hw.color, 9);
      filled(ctx, () => ctx.roundRect(-196, bandY - (crown ? 70 : 120), 392, crown ? 76 : 126, 22), crown ? '#1d1a22' : hw.color, 9);
      if (!crown) {
        ctx.fillStyle = hw.band;
        ctx.fillRect(-190, bandY - 34, 380, 18);
      }
      filled(ctx, () => ctx.ellipse(0, bandY + 10, 212, 30, 0, 0, Math.PI), '#141218', 8);
      filled(ctx, () => ctx.ellipse(0, bandY - (crown ? 40 : 76), 22, 18, 0, 0, Math.PI * 2), '#d9b45a', 5);
      break;
    }
    case 'cap': {
      filled(ctx, () => {
        ctx.moveTo(-230, -HEAD_HALF_H * 0.3);
        ctx.quadraticCurveTo(-236, -HEAD_HALF_H - 50, 0, -HEAD_HALF_H - 50);
        ctx.quadraticCurveTo(236, -HEAD_HALF_H - 50, 230, -HEAD_HALF_H * 0.3);
        ctx.closePath();
      }, hw.color, 9);
      filled(ctx, () => ctx.ellipse(90, -HEAD_HALF_H * 0.3, 210, 34, -0.06, 0, Math.PI * 2), shade(hw.color, -0.2), 8);
      break;
    }
    case 'hijab':
    case 'hair':
      break;
  }
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, look: HumanLook, pose: Pose, fr: Frame): void {
  ctx.save();
  ctx.translate(fr.headX, fr.headY);
  ctx.scale(HEAD_SCALE, HEAD_SCALE);
  ctx.rotate(pose.tilt);
  // Keep head ink as heavy as the body ink after scaling down.
  inkMul = 0.82 / HEAD_SCALE;
  const hijab = look.headwear.kind === 'hijab' ? look.headwear.color : null;
  const fx = pose.turn * 72;
  if (hijab) drawHijabBack(ctx, hijab, (fr.top + 100 - fr.headY) / HEAD_SCALE);
  if (look.headwear.kind === 'hair' && look.headwear.style === 'bun') filled(ctx, () => ctx.arc(0, -HEAD_HALF_H - 20, 70, 0, Math.PI * 2), look.hair, 9);

  traceBeanHead(ctx);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(150, 80, 70, 0.2)';
  ctx.beginPath();
  ctx.ellipse(HEAD_HALF_W * 1.05 - pose.turn * 40, 30, HEAD_HALF_W * 0.55, HEAD_HALF_H * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const fy = pose.lookY * 8 + pose.bow * 16;
  const spacing = 72 * (1 - 0.12 * Math.abs(pose.turn));
  const sL = 1 - 0.18 * Math.max(-pose.turn, 0);
  const sR = 1 - 0.18 * Math.max(pose.turn, 0);
  const eyeY = fy - 4 + (hijab ? 14 : 0);
  const lx = fx - spacing;
  const rx = fx + spacing;
  const mouthY = eyeY + 118;
  ctx.fillStyle = hijab ? 'rgba(232, 108, 110, 0.36)' : 'rgba(214, 100, 100, 0.28)';
  ctx.beginPath();
  ctx.ellipse(lx - 12, eyeY + 76, 32 * sL, 15, 0, 0, Math.PI * 2);
  ctx.ellipse(rx + 12, eyeY + 76, 32 * sR, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(fx * 1.15 + 4, eyeY + 40);
  ctx.quadraticCurveTo(fx * 1.15 + 22, eyeY + 72, fx * 1.15 - 6, eyeY + 78);
  ctx.strokeStyle = look.skinShade;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.stroke();
  drawEye(ctx, lx, eyeY, sL, pose, look.skin, look.lashes, -1);
  drawEye(ctx, rx, eyeY, sR, pose, look.skin, look.lashes, 1);
  ctx.restore();

  if (look.beard === 'goatee') drawGoatee(ctx, look.hair, fx * 1.1, mouthY);
  if (look.mustache) drawMustache(ctx, look.hair, fx * 1.1, mouthY);
  drawMouth(ctx, fx * 1.1, mouthY, pose);

  if (hijab) {
    drawHijabFront(ctx, hijab, fx);
  } else {
    if (look.headwear.kind === 'hair') drawHair(ctx, look, look.headwear.style);
    traceBeanHead(ctx);
    strokeOutline(ctx);
  }
  if (look.glasses) drawGlasses(ctx, lx, rx, eyeY, sL, sR);
  drawBrow(ctx, look.browColor, lx, eyeY, -1, pose, sL, look.lashes);
  drawBrow(ctx, look.browColor, rx, eyeY, 1, pose, sR, look.lashes);
  drawHatwear(ctx, look.headwear, pose);
  inkMul = 1;
  ctx.restore();
}

// ── Arms: rubber-hose sleeves + cartoon mittens ─────────────────────────────

/** Descending ridership line on the lap board, board-relative 0..1. */
const GRAPH: readonly Pt[] = [[0.08, 0.18], [0.24, 0.24], [0.38, 0.2], [0.52, 0.42], [0.66, 0.5], [0.8, 0.72], [0.93, 0.86]];
const BOARD_W = 190;
const BOARD_H = 130;
const NOTE_LINES = 5;

function boardRect(fr: Frame): { x: number; y: number } {
  return { x: fr.cx - BOARD_W / 2, y: fr.hipY - BOARD_H - 12 };
}

function polylineAt(pts: readonly Pt[], t: number): Pt {
  const n = pts.length - 1;
  const f = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const a = pts[i] ?? [0, 0];
  const b = pts[i + 1] ?? a;
  return [lerp(a[0], b[0], f - i), lerp(a[1], b[1], f - i)];
}

function notebookWritePoint(cx: number, frame: number, progress: number): Pt {
  const p = clamp01(progress) * NOTE_LINES;
  const line = Math.min(NOTE_LINES - 1, Math.floor(p));
  return [cx - 84 + (p - line) * 66 + Math.sin(frame * 1.7) * 2, DESK_Y - 30 + line * 5 + Math.sin(frame * 2.3)];
}

interface ArmCtx {
  fr: Frame;
  frame: number;
  progress: number;
  drawProgress: number;
  mouth: Pt;
  /** Walking counter-swing of the hands in px (screen x), per arm. */
  swing: readonly [number, number];
}

/** Natural idle micro-motion, phase-offset per arm so the two hands never mirror. */
function idle(frame: number, side: 0 | 1, hz: number, amp: number, phase = 0): number {
  return Math.sin(frame * hz + side * 2.3 + phase) * amp;
}

/** Poses whose arm is drawn in front of the torso (everything else is tucked behind it). */
const FRONT_POSES: ReadonlySet<ArmPose> = new Set<ArmPose>(['strap', 'write', 'pressPage', 'chalk', 'holdBoard', 'hug', 'basketLap', 'ticket', 'newspaper', 'whistle']);

/** Presenter gestures: weight 0..1 of how strongly the torso follows the arm. */
const GESTURE_LEAN: Partial<Record<ArmPose, number>> = { point: 1, pointHigh: 0.8, pointSide: 1, trace: 0.8, traceLow: 0.7, palm: 0.7, spread: 0.45, wave: 0.4, reachUp: 0.55 };

/** Extra downward sag of the elbow (gravity) per pose. */
const ELBOW_SAG: Partial<Record<ArmPose, number>> = { spread: 34, palm: 28, pointSide: 30, trace: 14, traceLow: 10, point: 10 };

/** Smootherstep with a soft overshoot/settle near the end, so gestures land organically. */
function gestureEase(m: number): number {
  const c = clamp01(m);
  const e = c * c * c * (c * (c * 6 - 15) + 10);
  return e + 0.05 * Math.sin(Math.PI * clamp01((c - 0.5) / 0.5));
}

function shoulderOf(side: 0 | 1, fr: Frame): Pt {
  return [fr.cx + SIGN[side] * 86, fr.top + 30];
}

/** Wrist target for a named pose (card px). */
function wristTarget(pose: ArmPose, side: 0 | 1, c: ArmCtx): Pt {
  const s = SIGN[side];
  const { fr, frame } = c;
  const { cx, top, hipY } = fr;
  const sy = top + 30;
  const at = (out: number, y: number): Pt => [cx + s * out, y];
  const sit = fr.pose === 'sit';
  switch (pose) {
    case 'side':
      return [cx + s * 112 + idle(frame, side, 0.05, 2.5) + (c.swing[side] ?? 0), hipY - 30 + idle(frame, side, 0.04, 2, 1)];
    case 'lap':
    case 'knee':
      return sit ? at(50, hipY + 8) : at(112, hipY - 30);
    case 'hip':
      return at(100, hipY - 70);
    case 'strap':
      return at(54, top + 112);
    case 'pocket':
      return at(66, hipY - 18);
    case 'point':
      return at(290, sy - 30);
    case 'pointHigh':
      return at(250, sy - 160);
    case 'pointSide':
      return at(262 + idle(frame, side, 0.045, 4), sy + 98 + idle(frame, side, 0.06, 3));
    case 'spread':
      return at(228 + idle(frame, side, 0.05, 5), sy + 92 + idle(frame, side, 0.07, 4, 1.7));
    case 'trace':
      return at(284 + Math.sin(frame * 0.06) * 6, sy + 12 + Math.sin(frame * 0.11) * 4);
    case 'traceLow':
      return at(276 + Math.sin(frame * 0.06) * 6, sy + 100 + Math.sin(frame * 0.1) * 3);
    case 'palm':
      return at(212 + idle(frame, side, 0.07, 5), sy + 96 + idle(frame, side, 0.05, 4, 0.9));
    case 'write': {
      const [wx, wy] = notebookWritePoint(cx, frame, c.progress);
      return [wx - 9, wy - 22];
    }
    case 'pressPage':
      return at(46, DESK_Y - 16);
    case 'chalk': {
      const r = boardRect(fr);
      const [u, v] = polylineAt(GRAPH, c.drawProgress);
      return [r.x + u * BOARD_W - 7, r.y + v * BOARD_H - 12];
    }
    case 'holdBoard': {
      const r = boardRect(fr);
      return [cx + s * (BOARD_W / 2 + 4), r.y + BOARD_H * 0.55];
    }
    case 'whistle':
      return [c.mouth[0] + s * 26, c.mouth[1] + 8];
    case 'lampLow':
      return at(130, hipY - 30);
    case 'hammer': {
      const cyc = ((((frame + side * 7) % 26) + 26) % 26) / 26;
      const raise = cyc < 0.72 ? smoothstep(0, 0.72, cyc) : 1 - smoothstep(0.72, 0.84, cyc);
      const strike = at(150, SOLE - 100);
      const up = at(230, sy - 80);
      return [lerp(strike[0], up[0], raise), lerp(strike[1], up[1], raise)];
    }
    case 'carryShoulder':
      return at(96, top - 30);
    case 'hug':
      return at(58, hipY - 46);
    case 'basketLap':
      return at(84, hipY - 40);
    case 'suitcase':
      return at(124, hipY - 40);
    case 'ticket':
      return at(64, top + 92);
    case 'newspaper':
      return at(118, top + 92);
    case 'reachUp':
      return at(150, sy - 230);
    case 'wave':
      return at(190 + Math.sin(frame * 0.35) * 12, sy - 140);
  }
}

interface ArmShape {
  shoulder: Pt;
  ctrl: Pt;
  wrist: Pt;
}

/** One smooth quadratic curve; the closer the wrist, the more the elbow bows outward. */
function shapeArm(side: 0 | 1, raw: Pt, fr: Frame, sag = 0): ArmShape {
  const s = SIGN[side];
  const shoulder = shoulderOf(side, fr);
  const wrist: Pt = [Math.min(LW - HAND_MARGIN, Math.max(HAND_MARGIN, raw[0])), Math.max(HAND_MARGIN, raw[1])];
  const dx = wrist[0] - shoulder[0];
  const dy = wrist[1] - shoulder[1];
  const d = Math.max(1, Math.hypot(dx, dy));
  const bow = Math.max(0, Math.min(80, (230 - d) * 0.5)) + 8;
  let px = -dy / d;
  let py = dx / d;
  if (px * s < 0 || (Math.abs(px) < 0.2 && py > 0)) {
    px = -px;
    py = -py;
  }
  const mid: Pt = [(shoulder[0] + wrist[0]) / 2, (shoulder[1] + wrist[1]) / 2];
  return { shoulder, wrist, ctrl: [mid[0] + px * bow, mid[1] + py * bow + sag] };
}

function splitQuad(a: Pt, c: Pt, b: Pt, t: number): { first: [Pt, Pt, Pt]; second: [Pt, Pt, Pt] } {
  const ac: Pt = [lerp(a[0], c[0], t), lerp(a[1], c[1], t)];
  const cb: Pt = [lerp(c[0], b[0], t), lerp(c[1], b[1], t)];
  const m: Pt = [lerp(ac[0], cb[0], t), lerp(ac[1], cb[1], t)];
  return { first: [a, ac, m], second: [m, cb, b] };
}

function hose(ctx: CanvasRenderingContext2D, q: readonly [Pt, Pt, Pt], width: number, color: string): void {
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    ctx.quadraticCurveTo(q[1][0], q[1][1], q[2][0], q[2][1]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width + 14;
  ctx.stroke();
  path();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  // Soft form shade along the lower edge.
  ctx.save();
  ctx.translate(width * 0.16, width * 0.12);
  path();
  ctx.strokeStyle = 'rgba(40, 20, 50, 0.2)';
  ctx.lineWidth = width * 0.4;
  ctx.stroke();
  ctx.restore();
}

type HandShape = 'fist' | 'point' | 'palm';

function handShapeFor(b: ArmBlend): HandShape {
  const p = b.mix < 0.5 ? b.from : b.to;
  if (p === 'point' || p === 'pointHigh' || p === 'pointSide') return 'point';
  if (p === 'palm' || p === 'spread' || p === 'wave' || p === 'trace' || p === 'traceLow' || p === 'reachUp') return 'palm';
  return 'fist';
}

function drawMitten(ctx: CanvasRenderingContext2D, look: HumanLook, arm: ArmShape, shape: HandShape, s: number): void {
  const ang = Math.atan2(arm.wrist[1] - arm.ctrl[1], arm.wrist[0] - arm.ctrl[0]);
  ctx.save();
  ctx.translate(arm.wrist[0], arm.wrist[1]);
  ctx.rotate(ang);
  ctx.fillStyle = look.skin;
  if (shape === 'point') {
    ctx.beginPath();
    ctx.roundRect(16, -12, 64, 24, 12);
    ctx.fill();
    strokeOutline(ctx, 7);
    ctx.beginPath();
    ctx.ellipse(6, 0, 38, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx, 8);
    ctx.beginPath();
    ctx.ellipse(10, s * -26, 16, 11, s * -0.5, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx, 6);
  } else if (shape === 'palm') {
    // Open mitten: rounded paddle + thumb, two soft finger creases.
    ctx.beginPath();
    ctx.ellipse(20, 0, 46, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx, 8);
    ctx.beginPath();
    ctx.ellipse(4, s * -36, 20, 12, s * -0.8, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx, 6);
    ctx.strokeStyle = look.skinShade;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(44, -12);
    ctx.lineTo(62, -12);
    ctx.moveTo(44, 10);
    ctx.lineTo(62, 10);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(4, 0, 38, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx, 8);
    ctx.strokeStyle = look.skinShade;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const k of [-12, 4, 18]) {
      ctx.moveTo(24, k - 4);
      ctx.lineTo(34, k - 4);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Mittens and hand props are authored at Persis size; draw them scaled around the wrist. */
function atHandScale(ctx: CanvasRenderingContext2D, wrist: Pt, draw: () => void): void {
  ctx.save();
  ctx.translate(wrist[0], wrist[1]);
  ctx.scale(HAND_SCALE, HAND_SCALE);
  ctx.translate(-wrist[0], -wrist[1]);
  inkMul = 0.8 / HAND_SCALE;
  draw();
  inkMul = 1;
  ctx.restore();
}

/**
 * Hose for an arm drawn in FRONT of the torso: the shoulder root is fill-only (sleeve colour,
 * no plum cap) so no thick outlined capsule cuts across the collar, buttons or hijab. The ink
 * outline only starts once the sleeve has left the shoulder socket.
 */
function hoseFront(ctx: CanvasRenderingContext2D, q: readonly [Pt, Pt, Pt], width: number, color: string, socket: Pt): void {
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    ctx.quadraticCurveTo(q[1][0], q[1][1], q[2][0], q[2][1]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.beginPath();
  ctx.rect(-2000, -2000, 4000, 4000);
  ctx.arc(socket[0], socket[1], 46, 0, Math.PI * 2);
  ctx.clip('evenodd');
  path();
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width + 14;
  ctx.stroke();
  ctx.restore();
  path();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.save();
  ctx.translate(width * 0.16, width * 0.12);
  path();
  ctx.strokeStyle = 'rgba(40, 20, 50, 0.2)';
  ctx.lineWidth = width * 0.4;
  ctx.stroke();
  ctx.restore();
}

/** The sleeve / forearm hose. `front` arms cross the torso; back arms are painted before the body. */
function drawArmHose(ctx: CanvasRenderingContext2D, look: HumanLook, arm: ArmShape, front: boolean): void {
  const q: [Pt, Pt, Pt] = [arm.shoulder, arm.ctrl, arm.wrist];
  const short = look.outfit === 'kaos' || look.outfit === 'polo';
  const run = front ? (qq: readonly [Pt, Pt, Pt], w: number, c: string): void => hoseFront(ctx, qq, w, c, arm.shoulder) : (qq: readonly [Pt, Pt, Pt], w: number, c: string): void => hose(ctx, qq, w, c);
  run(q, 36, short ? look.skin : look.cloth);
  if (short) run(splitQuad(arm.shoulder, arm.ctrl, arm.wrist, 0.42).first, 44, look.cloth);
  else {
    const cuff = splitQuad(arm.shoulder, arm.ctrl, arm.wrist, 0.86).second;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cuff[0][0], cuff[0][1]);
    ctx.quadraticCurveTo(cuff[1][0], cuff[1][1], cuff[2][0], cuff[2][1]);
    ctx.strokeStyle = look.clothShade;
    ctx.lineWidth = 36;
    ctx.stroke();
  }
  if (front) {
    // Soft socket shade so the sleeve melts into the chest instead of ending in a seam.
    const g = ctx.createRadialGradient(arm.shoulder[0], arm.shoulder[1], 4, arm.shoulder[0], arm.shoulder[1], 40);
    g.addColorStop(0, 'rgba(40, 20, 50, 0.16)');
    g.addColorStop(1, 'rgba(40, 20, 50, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(arm.shoulder[0], arm.shoulder[1], 40, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawArmHand(ctx: CanvasRenderingContext2D, look: HumanLook, arm: ArmShape, shape: HandShape, s: number, pocket: boolean): void {
  atHandScale(ctx, arm.wrist, () => drawMitten(ctx, look, arm, pocket ? 'fist' : shape, s));
  if (pocket) filled(ctx, () => ctx.roundRect(arm.wrist[0] - 28, arm.wrist[1] - 4, 56, 30, 7), look.cloth, 6);
}

function drawHandProp(ctx: CanvasRenderingContext2D, prop: HandProp, arm: ArmShape, s: number, frame: number): void {
  const [hx, hy] = arm.wrist;
  const ang = Math.atan2(arm.wrist[1] - arm.ctrl[1], arm.wrist[0] - arm.ctrl[0]);
  const stick = (from: Pt, to: Pt, width: number, color: string): void => {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = width + 10;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  switch (prop) {
    case 'none':
      return;
    case 'pen':
      stick([hx - 8, hy - 20], [hx + 16, hy + 40], 9, '#2a2a3a');
      ctx.fillStyle = '#c9a14a';
      ctx.beginPath();
      ctx.arc(hx + 16, hy + 40, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'chalk':
      stick([hx - 2, hy - 4], [hx + 12, hy + 22], 11, '#f4f1ea');
      return;
    case 'whistle':
      filled(ctx, () => ctx.roundRect(hx - s * 30 - 24, hy - 18, 48, 28, 12), '#c8ccd6', 6);
      return;
    case 'signalLamp': {
      ctx.beginPath();
      ctx.arc(hx, hy + 22, 24, Math.PI, 0);
      strokeOutline(ctx, 8);
      filled(ctx, () => ctx.roundRect(hx - 36, hy + 24, 72, 96, 12), '#3a3430', 8);
      const glow = 0.75 + 0.25 * Math.sin(frame * 0.3);
      ctx.fillStyle = `rgba(255, ${Math.round(90 + 60 * glow)}, 60, 1)`;
      ctx.beginPath();
      ctx.ellipse(hx, hy + 70, 22, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'hammer': {
      const a = ang - s * 1.2;
      const ex = hx + Math.cos(a) * 110;
      const ey = hy + Math.sin(a) * 110;
      stick([hx - Math.cos(a) * 18, hy - Math.sin(a) * 18], [ex, ey], 14, '#8a5a32');
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a + Math.PI / 2);
      filled(ctx, () => ctx.roundRect(-40, -16, 80, 32, 6), '#4a4c56', 7);
      ctx.restore();
      return;
    }
    case 'ticket':
      ctx.save();
      ctx.translate(hx + s * 14, hy - 28);
      ctx.rotate(-s * 0.25);
      filled(ctx, () => ctx.roundRect(-34, -22, 68, 44, 6), '#f3ead2', 5);
      ctx.fillStyle = '#d2493f';
      ctx.fillRect(-28, -6, 56, 9);
      ctx.restore();
      return;
    case 'suitcase':
      filled(ctx, () => ctx.roundRect(hx - 76, hy + 22, 152, 110, 12), '#7a4a2a', 8);
      ctx.strokeStyle = '#4a2a18';
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (const k of [-36, 36]) {
        ctx.moveTo(hx + k, hy + 24);
        ctx.lineTo(hx + k, hy + 130);
      }
      ctx.stroke();
      return;
    case 'phone':
      filled(ctx, () => ctx.roundRect(hx - 18 + s * 8, hy - 62, 36, 64, 7), '#1c1c24', 5);
      ctx.fillStyle = '#7ab8d8';
      ctx.fillRect(hx - 12 + s * 8, hy - 56, 24, 46);
      return;
  }
}

// ── Body props (drawn on the bust, gripped by the mittens) ──────────────────

function weave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(90, 60, 30, 0.5)';
  ctx.lineWidth = 4;
  for (let k = -h; k < w; k += 20) {
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + k + h, y + h);
    ctx.moveTo(x + k + h, y);
    ctx.lineTo(x + k, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Body props (painted on the figure, gripped by the mittens) ──────────────

function drawBodyProp(ctx: CanvasRenderingContext2D, prop: BodyProp, fr: Frame, progress: number, drawProgress: number): void {
  const { cx, top, hipY } = fr;
  switch (prop) {
    case 'none':
    case 'backpack':
      return;
    case 'shoulderBasket': {
      const bx = cx - 118;
      const by = top - 40;
      for (let k = 0; k < 5; k++) filled(ctx, () => ctx.ellipse(bx - 36 + k * 18, by - 30 - (k % 2) * 8, 17, 15, 0, 0, Math.PI * 2), k % 2 ? '#5f9a3a' : '#7cb446', 5);
      filled(ctx, () => ctx.ellipse(bx + 28, by - 34, 8, 22, 0.5, 0, Math.PI * 2), '#e07a2a', 4);
      const basket = (): void => {
        ctx.moveTo(bx - 62, by - 24);
        ctx.lineTo(bx + 62, by - 24);
        ctx.lineTo(bx + 46, by + 46);
        ctx.quadraticCurveTo(bx, by + 56, bx - 46, by + 46);
        ctx.closePath();
      };
      filled(ctx, basket, '#b88a4a', 7);
      weave(ctx, bx - 56, by - 22, 112, 66);
      return;
    }
    case 'lapSack': {
      const y = hipY - 40;
      for (let k = 0; k < 3; k++) filled(ctx, () => ctx.ellipse(cx - 24 + k * 24, y - 76 - (k % 2) * 7, 16, 19, 0, 0, Math.PI * 2), '#6fa844', 5);
      filled(ctx, () => {
        ctx.moveTo(cx - 36, y - 66);
        ctx.quadraticCurveTo(cx, y - 54, cx + 36, y - 66);
        ctx.quadraticCurveTo(cx + 88, y - 18, cx + 78, y + 46);
        ctx.quadraticCurveTo(cx, y + 64, cx - 78, y + 46);
        ctx.quadraticCurveTo(cx - 88, y - 18, cx - 36, y - 66);
        ctx.closePath();
      }, '#c8a66e', 7);
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 32, y - 56);
      ctx.lineTo(cx + 32, y - 56);
      ctx.stroke();
      return;
    }
    case 'lapBakul': {
      const y = hipY - 34;
      ['#e0742a', '#6fa844', '#d8c24a', '#9a3a2a'].forEach((c, k) => filled(ctx, () => ctx.ellipse(cx - 50 + k * 33, y - 36, 20, 16, 0, 0, Math.PI * 2), c, 5));
      filled(ctx, () => {
        ctx.moveTo(cx - 96, y - 30);
        ctx.lineTo(cx + 96, y - 30);
        ctx.lineTo(cx + 74, y + 38);
        ctx.quadraticCurveTo(cx, y + 48, cx - 74, y + 38);
        ctx.closePath();
      }, '#c09656', 7);
      weave(ctx, cx - 90, y - 28, 180, 64);
      return;
    }
    case 'lapBoard': {
      const r = boardRect(fr);
      filled(ctx, () => ctx.roundRect(r.x - 10, r.y - 10, BOARD_W + 20, BOARD_H + 20, 8), '#7a5030', 7);
      ctx.fillStyle = '#2c3a32';
      ctx.fillRect(r.x, r.y, BOARD_W, BOARD_H);
      ctx.strokeStyle = 'rgba(240,240,230,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r.x + 12, r.y + 8);
      ctx.lineTo(r.x + 12, r.y + BOARD_H - 9);
      ctx.lineTo(r.x + BOARD_W - 8, r.y + BOARD_H - 9);
      ctx.stroke();
      ctx.strokeStyle = '#f4f1ea';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const [u, v] = polylineAt(GRAPH, (k / 40) * drawProgress);
        if (k === 0) ctx.moveTo(r.x + u * BOARD_W, r.y + v * BOARD_H);
        else ctx.lineTo(r.x + u * BOARD_W, r.y + v * BOARD_H);
      }
      ctx.stroke();
      return;
    }
    case 'newspaper': {
      const x = cx - 124;
      const y = top + 40;
      filled(ctx, () => {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 248, y - 6);
        ctx.lineTo(x + 244, y + 180);
        ctx.lineTo(x + 4, y + 186);
        ctx.closePath();
      }, '#ece2c8', 7);
      // 1930 broadsheet: Playfair Display masthead, hairline column rules, auto-fit to the page.
      const maxW = 248 * 0.86;
      ctx.fillStyle = '#2a2420';
      ctx.textAlign = 'center';
      fitFont(ctx, 'DE KOERIER', '900', ERA_FONT.editorial, 31, maxW, 1);
      ctx.fillText('DE KOERIER', cx, y + 34);
      ctx.letterSpacing = '0px';
      ctx.fillRect(x + 14, y + 42, 220, 2);
      ctx.fillRect(x + 14, y + 61, 220, 1);
      fitFont(ctx, '31 JULI 1930', 'italic 700', ERA_FONT.editorial, 14, maxW, 2);
      ctx.fillText('31 JULI 1930', cx, y + 56);
      fitFont(ctx, 'LIJN GAROET–TJIKADJANG', '700', ERA_FONT.colonial, 16, maxW, 0.5);
      ctx.fillText('LIJN GAROET–TJIKADJANG', cx, y + 80);
      fitFont(ctx, 'GEOPEND', '800', ERA_FONT.colonial, 18, maxW, 3);
      ctx.fillText('GEOPEND', cx, y + 100);
      ctx.letterSpacing = '0px';
      ctx.fillRect(cx - 1, y + 112, 1.5, 64);
      ctx.fillStyle = 'rgba(42,36,32,0.45)';
      for (let k = 0; k < 6; k++) {
        ctx.fillRect(x + 18, y + 116 + k * 10, 98, 5);
        ctx.fillRect(x + 132, y + 116 + k * 10, 98, 5);
      }
      return;
    }
    case 'deskNotebook': {
      // Open ledger lying on the desk line (entirely above DESK_Y so the desk never hides it).
      filled(ctx, () => {
        ctx.moveTo(cx - 96, DESK_Y - 40);
        ctx.lineTo(cx + 96, DESK_Y - 40);
        ctx.lineTo(cx + 108, DESK_Y - 2);
        ctx.lineTo(cx - 108, DESK_Y - 2);
        ctx.closePath();
      }, '#f2ead6', 6);
      ctx.strokeStyle = 'rgba(60,40,30,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, DESK_Y - 40);
      ctx.lineTo(cx, DESK_Y - 2);
      ctx.stroke();
      const p = clamp01(progress) * NOTE_LINES;
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = 2.5;
      for (let line = 0; line < NOTE_LINES; line++) {
        const done = clamp01(p - line);
        if (done <= 0) break;
        ctx.beginPath();
        const y0 = DESK_Y - 30 + line * 5;
        for (let k = 0; k <= 24 * done; k++) {
          const x = cx - 84 + (k / 24) * 66;
          const y = y0 + Math.sin(k * 1.9 + line) * 1.3;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      return;
    }
  }
}

// ── Critters (same plum ink + toon billboard) ───────────────────────────────


function paintCritter(ctx: CanvasRenderingContext2D, look: CritterLook, frame: number, walkPhase: number | null, dir: number, blink: number): void {
  const CX = HEAD_CX;
  ctx.save();
  if (dir < 0) {
    ctx.translate(LW, 0);
    ctx.scale(-1, 1);
  }
  const limb = (pts: readonly Pt[], width: number, color: string): void => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = width + 10;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  if (look.species === 'ayam') {
    const step = walkPhase ?? 0;
    const bob = walkPhase === null ? 0 : Math.abs(Math.sin(step)) * 6;
    const peck = walkPhase === null ? Math.max(0, Math.sin(frame * 0.08)) * 10 : 0;
    for (const k of [0, 1]) {
      const lift = walkPhase === null ? 0 : Math.max(0, Math.sin(step + k * Math.PI)) * 12;
      const lx = CX - 12 + k * 24 + (walkPhase === null ? 0 : Math.sin(step + k * Math.PI) * 8);
      limb([[CX - 8 + k * 16, SOLE - 70], [lx, SOLE - 4 - lift]], 6, '#e2a33a');
      limb([[lx - 12, SOLE - 3 - lift], [lx + 14, SOLE - 3 - lift]], 4, '#e2a33a');
    }
    const by = SOLE - 104 - bob;
    for (let k = 0; k < 3; k++) filled(ctx, () => ctx.ellipse(CX - 56 - k * 6, by - 30 - k * 14, 14, 36, -0.5 - k * 0.2, 0, Math.PI * 2), k === 1 ? '#3a3a2a' : '#5a4a2a', 5);
    filled(ctx, () => ctx.ellipse(CX, by, 62, 46, 0, 0, Math.PI * 2), look.color);
    const hx = CX + 48;
    const hy = by - 56 + peck;
    filled(ctx, () => {
      ctx.moveTo(hx - 12, hy - 24);
      ctx.quadraticCurveTo(hx - 4, hy - 46, hx + 4, hy - 26);
      ctx.quadraticCurveTo(hx + 12, hy - 44, hx + 18, hy - 22);
      ctx.closePath();
    }, look.accent, 4);
    filled(ctx, () => ctx.ellipse(hx, hy, 26, 26, 0, 0, Math.PI * 2), look.color);
    filled(ctx, () => {
      ctx.moveTo(hx + 22, hy - 6);
      ctx.lineTo(hx + 44, hy + 2);
      ctx.lineTo(hx + 22, hy + 8);
      ctx.closePath();
    }, '#f0b43a', 4);
    filled(ctx, () => ctx.ellipse(hx + 18, hy + 20, 7, 11, 0, 0, Math.PI * 2), look.accent, 3);
    ctx.fillStyle = PLUM;
    ctx.beginPath();
    ctx.ellipse(hx + 8, hy - 4, 4, Math.max(0.3, 4 * (1 - blink)), 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(CX + 50, SOLE - 30);
    ctx.rotate(Math.sin(frame * 0.06) * 0.35);
    limb([[0, 0], [40, -10], [60, -50], [50, -86]], 18, look.color);
    ctx.restore();
    filled(ctx, () => {
      ctx.moveTo(CX - 54, SOLE - 6);
      ctx.quadraticCurveTo(CX - 70, SOLE - 120, CX - 30, SOLE - 150);
      ctx.lineTo(CX + 30, SOLE - 150);
      ctx.quadraticCurveTo(CX + 70, SOLE - 120, CX + 54, SOLE - 6);
      ctx.closePath();
    }, look.color);
    for (const k of [-1, 1]) filled(ctx, () => ctx.ellipse(CX + k * 20, SOLE - 10, 18, 10, 0, 0, Math.PI * 2), shade(look.color, 0.25), 5);
    const hy = SOLE - 184;
    for (const k of [-1, 1]) {
      filled(ctx, () => {
        ctx.moveTo(CX + k * 22, hy - 30);
        ctx.lineTo(CX + k * 44, hy - 66);
        ctx.lineTo(CX + k * 50, hy - 20);
        ctx.closePath();
      }, look.color, 5);
    }
    filled(ctx, () => ctx.ellipse(CX, hy, 52, 44, 0, 0, Math.PI * 2), look.color);
    for (const k of [-1, 1]) {
      ctx.fillStyle = '#9ac83a';
      ctx.beginPath();
      ctx.ellipse(CX + k * 20, hy - 4, 9, Math.max(0.3, 11 * (1 - blink)), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CX + k * 24, hy + 14);
      ctx.lineTo(CX + k * 64, hy + 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ── Grain + normals (identical to Persis) ───────────────────────────────────

let grainCanvas: HTMLCanvasElement | null = null;

function grain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas2D context unavailable');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) img.data[i * 4 + 3] = Math.floor(hash01(91, i) * hash01(17, i) * 60);
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

let sharedNormalMap: THREE.CanvasTexture | null = null;

/** Ellipsoid head + cylindrical torso/leg normals so the card reacts to 3D lights. */
function normalMap(): THREE.CanvasTexture {
  if (sharedNormalMap) return sharedNormalMap;
  const s = 2;
  const w = LW / s;
  const h = LH / s;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D context unavailable');
  const img = ctx.createImageData(w, h);
  const hw = HEAD_HALF_W * HEAD_SCALE;
  const hh = HEAD_HALF_H * HEAD_SCALE;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px * s + s / 2;
      const y = py * s + s / 2;
      let nx = 0;
      let ny = 0;
      const hx = (x - HEAD_CX) / hw;
      const hy = (y - HEAD_CY) / hh;
      const r2 = hx * hx + hy * hy;
      if (r2 < 1.1) {
        const r = Math.sqrt(r2);
        const k = Math.min(r, 0.95) / Math.max(r, 1e-5);
        nx = hx * k * 0.9;
        ny = -hy * k * 0.9;
      } else if (y > TORSO_TOP && y < HIP_Y + 30) {
        nx = Math.max(-0.95, Math.min(0.95, ((x - HEAD_CX) / 100) * 0.8));
        ny = (1 - clamp01((y - TORSO_TOP) / 60)) * 0.5;
      } else if (y >= HIP_Y + 30 && y < SOLE - 40) {
        const lx = Math.abs(x - HEAD_CX) - 38;
        nx = Math.sign(x - HEAD_CX) * Math.max(-0.9, Math.min(0.9, (lx / 30) * 0.8));
      }
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      const len = Math.hypot(nx, ny, nz);
      const i = (py * w + px) * 4;
      img.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  sharedNormalMap = new THREE.CanvasTexture(canvas);
  sharedNormalMap.colorSpace = THREE.NoColorSpace;
  return sharedNormalMap;
}

// ── Character assembly ──────────────────────────────────────────────────────

interface Solved {
  pose: Pose;
  fr: Frame;
  right: ArmShape;
  left: ArmShape;
  /** Upper-body lean (rad, + = clockwise / head toward +x) and shift (px) about the hips. */
  lean: number;
  shiftX: number;
}

function solve(body: BodyPose, d: ToonDrive, seed: number): Solved {
  const pose = poseFor(d, seed);
  const fr = frameFor(pose, body, d.walkPhase, d.walkDir);
  const mouth: Pt = [fr.headX + pose.turn * 72 * 1.1 * HEAD_SCALE, fr.headY + (pose.lookY * 8 + pose.bow * 16 + 128) * HEAD_SCALE];
  // Hands counter-swing against the leg on the same side (opposite phase).
  const swing: [number, number] = fr.walking ? [-(fr.footN[0] ?? 0) * ARM_SWING * fr.walkDir, -(fr.footN[1] ?? 0) * ARM_SWING * fr.walkDir] : [0, 0];
  const c: ArmCtx = { fr, frame: d.frame, progress: d.progress, drawProgress: d.drawProgress, mouth, swing };
  const arm = (side: 0 | 1, b: ArmBlend): ArmShape => {
    const m = gestureEase(b.mix);
    const a = wristTarget(b.from, side, c);
    const z = wristTarget(b.to, side, c);
    const sag = lerp(ELBOW_SAG[b.from] ?? 0, ELBOW_SAG[b.to] ?? 0, m);
    return shapeArm(side, [lerp(a[0], z[0], m), lerp(a[1], z[1], m)], fr, sag);
  };
  // The torso follows the presenting arm: a couple of degrees and a few px toward the gesture side.
  let gesture = 0;
  for (const [side, b] of [[0, d.armRight], [1, d.armLeft]] as const) {
    const m = gestureEase(b.mix);
    gesture += SIGN[side] * lerp(GESTURE_LEAN[b.from] ?? 0, GESTURE_LEAN[b.to] ?? 0, m);
  }
  const lean = gesture * 0.028 + (fr.walking ? WALK_LEAN * fr.walkDir : 0);
  return { pose, fr, right: arm(0, d.armRight), left: arm(1, d.armLeft), lean, shiftX: gesture * 5 };
}

/** Head, chest, shoulder and wrist positions in card-local metres at scale 1 (x right, y up from the soles). Pure. */
export function poseLayout(body: BodyPose, d: ToonDrive, seed = 1): { head: Pt; chest: Pt; shoulders: readonly [Pt, Pt]; hands: readonly [Pt, Pt] } {
  const { fr, right, left } = solve(body, d, seed);
  const w = (p: Pt): Pt => [(p[0] - HEAD_CX) / PX, (SOLE - p[1]) / PX];
  return { head: w([fr.headX, fr.headY]), chest: w([fr.cx, fr.top + 70]), shoulders: [w(right.shoulder), w(left.shoulder)], hands: [w(right.wrist), w(left.wrist)] };
}

function paintHuman(ctx: CanvasRenderingContext2D, look: HumanLook, setup: ActorSetup, d: ToonDrive, seed: number): void {
  const { pose, fr, right, left, lean, shiftX } = solve(setup.pose, d, seed);
  // Weight shift pivoting at the soles (feet stay planted).
  ctx.translate(LW / 2 + pose.shiftX * 0.4, SOLE);
  ctx.rotate(pose.shiftRot * 0.6);
  ctx.translate(-LW / 2, -SOLE);
  // Upper body (pack, torso, head, arms) leans about the hips; the legs stay planted.
  const upper = (fn: () => void): void => {
    ctx.save();
    ctx.translate(fr.cx + shiftX, fr.hipY);
    ctx.rotate(lean);
    ctx.translate(-fr.cx, -fr.hipY);
    fn();
    ctx.restore();
  };
  const sides = [0, 1] as const;
  const arms = [right, left] as const;
  const blends = [d.armRight, d.armLeft] as const;
  const props = [setup.rightProp, setup.leftProp] as const;
  const shapes = [handShapeFor(d.armRight), handShapeFor(d.armLeft)] as const;
  const pockets = blends.map((b) => (b.mix < 0.5 ? b.from : b.to) === 'pocket');
  const front = blends.map((b) => FRONT_POSES.has(b.mix < 0.5 ? b.from : b.to));
  const below = (p: HandProp): boolean => p === 'suitcase' || p === 'signalLamp';
  // Back arms start inside the torso silhouette so the chest outline hides the shoulder root.
  const root = (side: 0 | 1): ArmShape => {
    const a = arms[side];
    return { ...a, shoulder: [a.shoulder[0] - SIGN[side] * 30, a.shoulder[1] + 4] };
  };

  upper(() => drawPackBehind(ctx, look, fr));
  drawLegs(ctx, look, fr);
  upper(() => {
    for (const side of sides) if (!front[side]) drawArmHose(ctx, look, root(side), false);
    drawBody(ctx, look, fr);
    if (setup.bodyProp === 'shoulderBasket') drawBodyProp(ctx, setup.bodyProp, fr, d.progress, d.drawProgress);
    drawHead(ctx, look, pose, fr);
    if (setup.bodyProp !== 'shoulderBasket') drawBodyProp(ctx, setup.bodyProp, fr, d.progress, d.drawProgress);
    for (const side of sides) {
      const arm = arms[side];
      const prop = props[side];
      const propAt = (): void => atHandScale(ctx, arm.wrist, () => drawHandProp(ctx, prop, arm, SIGN[side], d.frame));
      if (front[side]) drawArmHose(ctx, look, arm, true);
      // Hands and held props always sit on top of the body (a hand in a pocket must stay visible).
      if (below(prop)) propAt();
      drawArmHand(ctx, look, arm, prop === 'none' ? shapes[side] : 'fist', SIGN[side], pockets[side] ?? false);
      if (!below(prop)) propAt();
    }
  });
}

// ── Lit card actor ──────────────────────────────────────────────────────────

export interface ToonActor {
  id: LookId;
  /** Origin at the soles (bottom-centre); y = 0 is the floor. */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  update: (drive: ToonDrive, cameraWorldPosition: THREE.Vector3) => void;
  dispose: () => void;
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
  // Shoe soles exactly on y = 0.
  geometry.translate(0, ACTOR_PLANE_HEIGHT / 2 - (LH - SOLE) / PX, 0);
  const material = new THREE.MeshToonMaterial({
    map: texture,
    normalMap: look.kind === 'human' ? normalMap() : null,
    normalScale: new THREE.Vector2(0.8, 0.8),
    gradientMap: options.gradientMap,
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `actor-${id}`;
  // NOINK contract: character cards carry their own 2D plum ink; never add 3D edge lines to them.
  mesh.userData.noInk = true;
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });

  const world = new THREE.Vector3();
  const update = (drive: ToonDrive, cam: THREE.Vector3): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(TEXTURE_SCALE, 0, 0, TEXTURE_SCALE, 0, 0);
    if (look.kind === 'critter') paintCritter(ctx, look, drive.frame, drive.walkPhase, drive.walkDir, blinkAt(drive.frame, options.seed));
    else paintHuman(ctx, look, setup, drive, options.seed);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // source-atop keeps the grain inside painted pixels so the alpha cut-out survives.
    ctx.globalCompositeOperation = 'source-atop';
    const pattern = ctx.createPattern(grain(), 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.globalCompositeOperation = 'source-over';
    texture.needsUpdate = true;
    mesh.getWorldPosition(world);
    const parentYaw = mesh.parent ? new THREE.Euler().setFromQuaternion(mesh.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
    mesh.rotation.y = Math.atan2(cam.x - world.x, cam.z - world.z) - parentYaw;
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    mesh.customDepthMaterial?.dispose();
    texture.dispose();
  };
  return { id, mesh, update, dispose };
}
