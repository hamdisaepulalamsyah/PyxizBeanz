import * as THREE from 'three';
import type { Carry, CharacterId, Expression, HandRest, Stance, WordTiming } from './story';
import { activeWordIndex, clamp01, hash01, lerp, nodPulseAt } from './story';

/**
 * Procedural Canvas2D bean-head cast for "Sejarah Persis". Each character is
 * painted onto a lit, alpha-tested billboard (MeshToonMaterial + normal map) so
 * the 3D world's warm key / cool fill lights and shadows fall on them.
 * Everything is a pure function of the frame for deterministic rendering.
 */

/** Logical drawing space; the backing canvas is scaled down by the actor's texture scale. */
const LW = 768;
const LH = 1024;
/** Full-figure canvas height: the bust space plus hips, legs and shoes. */
const FULL_H = 1600;
const TEXTURE_SCALE = 0.75;
export const ACTOR_PLANE_WIDTH = 0.9;
export const ACTOR_PLANE_HEIGHT = 1.2;

const PLUM = '#241726';
const HEAD_CX = LW / 2;
const HEAD_CY = 380;
const HEAD_HALF_W = 240;
/** Head bounding box height/width = 0.94 (pointed-crown superellipse). */
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2;
const OUTLINE = 11;
const TORSO_TOP = HEAD_CY + 190;
/** Waist line of full figures (upper-body coordinates). */
const HIP_Y = 1010;
/** Shoe soles touch the canvas bottom so billboards stand exactly on their anchor. */
const SOLE_Y = FULL_H - 4;
/** How far the upper body sinks for each stance (seated figures fold their legs). */
const STANCE_DROP: Record<Stance, number> = { bust: 0, stand: 0, bench: 300, bersila: 520 };

const stanceHeight = (stance: Stance): number => (stance === 'bust' ? LH : FULL_H);
export const actorPlaneHeight = (stance: Stance): number => (ACTOR_PLANE_WIDTH * stanceHeight(stance)) / LW;

export type Headwear =
  | { kind: 'peci'; tilt: number; color?: string }
  | { kind: 'turban' }
  | { kind: 'caping' }
  | { kind: 'kerudung'; color: string }
  | { kind: 'bare' };
export type Outfit = 'koko' | 'safari' | 'jas';
type Beard = 'none' | 'neat' | 'full' | 'goatee';

export interface CharacterLook {
  name: string;
  skin: string;
  skinShade: string;
  headwear: Headwear;
  outfit: Outfit;
  cloth: string;
  clothShade: string;
  beard: Beard;
  beardColor: string;
  mustache: boolean;
  glasses: boolean;
  /** Draped shoulder sorban colour, or null. */
  shoulderScarf: string | null;
  browColor: string;
  /** Sarung / trouser colour (defaults from the outfit). */
  lower?: string;
  lowerKind?: 'sarung' | 'trousers';
  shoe?: string;
  hair?: string;
}

const lowerKindOf = (l: CharacterLook): 'sarung' | 'trousers' => l.lowerKind ?? (l.outfit === 'koko' ? 'sarung' : 'trousers');
const lowerColorOf = (l: CharacterLook): string => l.lower ?? (l.outfit === 'koko' ? '#4b3d63' : l.outfit === 'jas' ? l.clothShade : l.cloth);

export const CHARACTERS: Record<CharacterId, CharacterLook> = {
  zamzam: {
    name: 'Haji Zamzam',
    skin: '#d9a77c',
    skinShade: '#b9805e',
    headwear: { kind: 'peci', tilt: 0 },
    outfit: 'koko',
    cloth: '#f4f0e6',
    clothShade: '#d8d0c0',
    beard: 'neat',
    beardColor: '#3a2e2a',
    mustache: true,
    glasses: false,
    shoulderScarf: null,
    browColor: '#2a1d1c',
  },
  yunus: {
    name: 'H. M. Yunus',
    skin: '#cf9a70',
    skinShade: '#ae7652',
    headwear: { kind: 'turban' },
    outfit: 'koko',
    cloth: '#f6f2ea',
    clothShade: '#d9d1c2',
    beard: 'full',
    beardColor: '#e7e1d6',
    mustache: true,
    glasses: false,
    shoulderScarf: null,
    browColor: '#8b8178',
  },
  hassan: {
    name: 'Ahmad Hassan',
    skin: '#c99068',
    skinShade: '#a66e4c',
    headwear: { kind: 'peci', tilt: 0 },
    outfit: 'koko',
    cloth: '#efe9dc',
    clothShade: '#d2c9b6',
    beard: 'goatee',
    beardColor: '#231918',
    mustache: true,
    glasses: true,
    shoulderScarf: '#e9dfc8',
    browColor: '#1f1615',
  },
  soekarno: {
    name: 'Soekarno',
    skin: '#d6a074',
    skinShade: '#b47c55',
    headwear: { kind: 'peci', tilt: 0.09 },
    outfit: 'safari',
    cloth: '#eadcbc',
    clothShade: '#cdbb94',
    beard: 'none',
    beardColor: '#231918',
    mustache: false,
    glasses: false,
    shoulderScarf: null,
    browColor: '#1f1615',
  },
  natsir: {
    name: 'Mohammad Natsir',
    skin: '#dcae84',
    skinShade: '#bb8962',
    headwear: { kind: 'peci', tilt: 0 },
    outfit: 'jas',
    cloth: '#3b4256',
    clothShade: '#2a3042',
    beard: 'none',
    beardColor: '#231918',
    mustache: false,
    glasses: false,
    shoulderScarf: null,
    browColor: '#1f1615',
  },
};

// ── Expressions & lip-sync ──────────────────────────────────────────────────

interface FacePreset {
  lid: number;
  browRaise: number;
  /** + raises inner brow ends (worry/respect), − pulls them down (serious). */
  browInner: number;
  /** Right brow raised extra, left lowered (skeptical/thinking). */
  browAsym: number;
  smile: number;
  bow: number;
  lookY: number;
}

const PRESETS: Record<Expression, FacePreset> = {
  neutral: { lid: 0.28, browRaise: 0.1, browInner: 0, browAsym: 0, smile: 0.12, bow: 0, lookY: 0 },
  respect: { lid: 0.48, browRaise: 0.15, browInner: 0.3, browAsym: 0, smile: 0.35, bow: 0.3, lookY: 0.35 },
  serious: { lid: 0.36, browRaise: 0, browInner: -0.85, browAsym: 0, smile: -0.2, bow: 0.05, lookY: 0 },
  thinking: { lid: 0.3, browRaise: 0.35, browInner: 0.1, browAsym: 0.7, smile: -0.06, bow: 0, lookY: -0.6 },
  warm: { lid: 0.2, browRaise: 0.35, browInner: 0.1, browAsym: 0, smile: 0.65, bow: 0, lookY: 0 },
};

export interface Viseme {
  open: number;
  width: number;
  round: number;
}

const REST: Viseme = { open: 0, width: 1, round: 0 };
const VOWELS: Record<string, Viseme> = {
  a: { open: 1, width: 1.05, round: 0 },
  e: { open: 0.6, width: 1.2, round: 0 },
  i: { open: 0.42, width: 1.3, round: 0 },
  o: { open: 0.78, width: 0.72, round: 0.65 },
  u: { open: 0.55, width: 0.58, round: 0.9 },
};

function rawViseme(words: readonly WordTiming[], frame: number): Viseme {
  const i = activeWordIndex(words, frame);
  const w = words[i];
  if (!w) return REST;
  const p = clamp01((frame + 0.5 - w.startFrame) / Math.max(1, w.endFrame - w.startFrame));
  // Indonesian is phonetic: one mouth beat per written vowel.
  const vowels = w.text.toLowerCase().match(/[aiueo]/g) ?? ['a'];
  const seg = p * vowels.length;
  const k = Math.min(vowels.length - 1, Math.floor(seg));
  const env = Math.pow(Math.sin(Math.PI * (seg - k)), 0.7);
  const v = VOWELS[vowels[k] ?? 'a'] ?? REST;
  return { open: v.open * (0.3 + 0.7 * env), width: v.width, round: v.round };
}

/** Lip-sync shape for `frame`, smoothed over neighbouring frames to avoid popping. */
export function visemeAt(words: readonly WordTiming[], frame: number, speaking: boolean): Viseme {
  if (!speaking || words.length === 0) return REST;
  const a = rawViseme(words, frame - 1);
  const b = rawViseme(words, frame);
  const c = rawViseme(words, frame + 1);
  return {
    open: a.open * 0.25 + b.open * 0.5 + c.open * 0.25,
    width: a.width * 0.25 + b.width * 0.5 + c.width * 0.25,
    round: a.round * 0.25 + b.round * 0.5 + c.round * 0.25,
  };
}

const hash = (seed: number, k: number): number => {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function blinkShape(d: number): number {
  let v = 0;
  if (d >= -2 && d < 0) v = (d + 2) / 2;
  else if (d >= 0 && d <= 1) v = 1;
  else if (d > 1 && d <= 5) v = 1 - (d - 1) / 4;
  return v * v * (3 - 2 * v);
}

/** Seeded irregular blink rhythm (~every 3–5 s) with occasional double blinks. */
export function blinkAt(frame: number, seed: number): number {
  const period = 104;
  const k0 = Math.floor(frame / period);
  let amount = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const t0 = k * period + 12 + hash(seed, k) * 64;
    amount = Math.max(amount, blinkShape(frame - t0));
    if (hash(seed + 7, k) > 0.78) amount = Math.max(amount, blinkShape(frame - t0 - 9));
  }
  return amount;
}

/** Main breathing rate (Hz): natural resting breath (~13 breaths/min), visible in short shots. */
export const BREATH_HZ = 0.22;
/** Side-to-side weight transfer rate (Hz). */
const WEIGHT_SHIFT_HZ = 0.11;

export interface ToonDrive {
  frame: number;
  expression: { from: Expression; to: Expression; mix: number };
  viseme: Viseme;
  turn: number;
  nod: number;
  gesture: number;
  /** 0..1 expressive forward lean (speaking / raised dalil finger). */
  lean: number;
  /** 0..1 how much the character is listening to someone else (soft nods). */
  listening: number;
  /** Hand rest, held prop and hand actions; both arms are always drawn. */
  arms?: ArmDrive;
  /** Back view hides the face (figures seen from behind). */
  facing?: 'front' | 'back';
  /** 0..1 walk blend and the gait phase in radians. */
  walk?: number;
  walkPhase?: number;
}

export interface ArmDrive {
  rest: HandRest;
  carry: Carry;
  /** 0..1 writing blend for the right hand. */
  write: number;
  /** 0..1 open-palm explaining blend for the left hand. */
  explain: number;
  gestureHand: 'point' | 'open';
}

const DEFAULT_ARMS: ArmDrive = { rest: 'side', carry: 'none', write: 0, explain: 0, gestureHand: 'point' };

interface Pose extends FacePreset {
  turn: number;
  tilt: number;
  lookX: number;
  blink: number;
  viseme: Viseme;
  gesture: number;
  /** Chest offset in px (negative = raised on inhale). */
  breath: number;
  /** 0..1 inhale amount (shoulders widen). */
  breathOpen: number;
  breathHead: number;
  lean: number;
  /** Whole-body weight shift pivoting at the feet. */
  shiftX: number;
  shiftRot: number;
  frame: number;
  arms: ArmDrive;
  back: boolean;
  walk: number;
  walkPhase: number;
}

function poseFor(drive: ToonDrive, seed: number): Pose {
  const a = PRESETS[drive.expression.from];
  const b = PRESETS[drive.expression.to];
  const m = drive.expression.mix;
  const mixKey = (k: keyof FacePreset): number => lerp(a[k], b[k], m);
  const f = drive.frame;
  const s = f / 30;
  const talking = drive.viseme.open > 0.05 ? 1 : 0;
  const lean = clamp01(drive.lean);
  const listenNod = clamp01(drive.listening) * nodPulseAt(f, seed);
  // Idle micro-motion; slightly livelier while talking.
  const sway = Math.sin(s * 0.8 + seed) * 0.04 + Math.sin(s * 2.1 + seed * 2) * 0.015 * (1 + talking);
  const turn = drive.turn + sway;
  const bow = clamp01(mixKey('bow') + drive.nod * 0.6 + listenNod * 0.45 + lean * 0.12 + Math.max(0, Math.sin(s * 5.2 + seed)) * 0.05 * talking);
  // Inhale slightly quicker than exhale for a natural rhythm.
  const bp = 2 * Math.PI * BREATH_HZ * s + seed;
  const inhale = (p: number): number => 0.5 - 0.5 * Math.cos(p + 0.35 * Math.sin(p));
  const breathOpen = inhale(bp);
  const weight = Math.sin(2 * Math.PI * WEIGHT_SHIFT_HZ * s + seed * 1.7) + 0.35 * Math.sin(2 * Math.PI * WEIGHT_SHIFT_HZ * 2.3 * s + seed);
  const shiftRot = weight * 0.011;
  // Small seeded saccades keep the eyes alive between bigger looks.
  const saccade = (hash01(seed + 53, Math.floor((f + seed * 7) / 38)) - 0.5) * 0.3;
  return {
    lid: mixKey('lid') + bow * 0.15,
    browRaise: mixKey('browRaise') + drive.viseme.open * 0.12 + lean * 0.15,
    browInner: mixKey('browInner'),
    browAsym: mixKey('browAsym'),
    smile: mixKey('smile'),
    bow,
    lookY: clamp01(mixKey('lookY') * 0.5 + 0.5 + bow * 0.25) * 2 - 1,
    turn,
    // Head counter-balances the body shift so the eyes stay level.
    tilt: turn * 0.07 + Math.sin(s * 0.6 + seed) * 0.02 - shiftRot * 0.6,
    lookX: Math.max(-1, Math.min(1, turn * 1.7 + saccade)),
    blink: blinkAt(f, seed),
    viseme: drive.viseme,
    gesture: clamp01(drive.gesture),
    breath: -(breathOpen - 0.5) * 7,
    breathOpen,
    breathHead: -(inhale(bp - 0.5) - 0.5) * 5,
    lean,
    shiftX: weight * 6,
    shiftRot,
    frame: f,
    arms: drive.arms ?? DEFAULT_ARMS,
    back: drive.facing === 'back',
    walk: clamp01(drive.walk ?? 0),
    walkPhase: drive.walkPhase ?? 0,
  };
}

// ── Painting ────────────────────────────────────────────────────────────────

function traceBeanHead(ctx: CanvasRenderingContext2D): void {
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
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function traceTorso(ctx: CanvasRenderingContext2D, cx: number, top: number, breathScale: number, full: boolean): void {
  const sw = 172 * breathScale;
  // Busts run off the canvas bottom; full figures taper to the waist.
  const bw = full ? 205 : 250;
  const bottom = full ? HIP_Y + 24 : LH + 20;
  ctx.beginPath();
  ctx.moveTo(cx - bw, bottom);
  ctx.lineTo(cx - sw - 12, top + 95);
  ctx.quadraticCurveTo(cx - sw, top, cx - sw + 72, top - 6);
  ctx.lineTo(cx + sw - 72, top - 6);
  ctx.quadraticCurveTo(cx + sw, top, cx + sw + 12, top + 95);
  ctx.lineTo(cx + bw, bottom);
  ctx.closePath();
}

function strokeOutline(ctx: CanvasRenderingContext2D, width = OUTLINE): void {
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawBody(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose, full: boolean): void {
  const cx = HEAD_CX + pose.turn * 5;
  const top = TORSO_TOP + pose.breath + pose.bow * 6;
  const breathScale = 1 + pose.breathOpen * 0.016;

  ctx.fillStyle = look.skinShade;
  ctx.fillRect(cx - 40, HEAD_CY + 150, 80, 80);

  ctx.save();
  traceTorso(ctx, cx, top, breathScale, full);
  ctx.fillStyle = look.cloth;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = look.clothShade;
  ctx.beginPath();
  ctx.ellipse(cx + 260, top + 270, 150, 330, 0, 0, Math.PI * 2);
  ctx.fill();

  if (pose.back) {
    // Back seam only: no placket, lapels or pockets from behind.
    ctx.strokeStyle = look.clothShade;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, top + 30);
    ctx.lineTo(cx, top + 460);
    ctx.stroke();
  } else if (look.outfit === 'koko') {
    ctx.fillStyle = look.clothShade;
    ctx.fillRect(cx - 4, top + 10, 8, 420);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + 12, top + 70 + i * 70, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const shirt = '#fbf8f1';
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(cx - 72, top - 8);
    ctx.lineTo(cx, top + 170);
    ctx.lineTo(cx + 72, top - 8);
    ctx.closePath();
    ctx.fill();
    if (look.outfit === 'jas') {
      ctx.fillStyle = '#6b2232';
      ctx.beginPath();
      ctx.moveTo(cx - 16, top + 18);
      ctx.lineTo(cx + 16, top + 18);
      ctx.lineTo(cx + 22, top + 150);
      ctx.lineTo(cx, top + 172);
      ctx.lineTo(cx - 22, top + 150);
      ctx.closePath();
      ctx.fill();
    }
    // Lapels
    ctx.fillStyle = look.clothShade;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 72, top - 8);
      ctx.lineTo(cx + side * 8, top + 176);
      ctx.lineTo(cx + side * 120, top + 90);
      ctx.closePath();
      ctx.fill();
    }
    if (look.outfit === 'safari') {
      ctx.strokeStyle = look.clothShade;
      ctx.lineWidth = 6;
      for (const side of [-1, 1] as const) {
        ctx.strokeRect(cx + side * 120 - 50, top + 200, 100, 90);
        ctx.fillStyle = look.clothShade;
        ctx.fillRect(cx + side * 120 - 54, top + 196, 108, 26);
      }
    }
  }
  if (look.shoulderScarf) {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = 92;
    ctx.beginPath();
    ctx.moveTo(cx - 175, top - 30);
    ctx.quadraticCurveTo(cx - 40, top + 220, cx + 150, full ? HIP_Y + 30 : LH + 40);
    ctx.stroke();
    ctx.strokeStyle = look.shoulderScarf;
    ctx.lineWidth = 80;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150, 110, 60, 0.55)';
    ctx.lineWidth = 6;
    ctx.setLineDash([2, 14]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  traceTorso(ctx, cx, top, breathScale, full);
  strokeOutline(ctx);
  if (look.outfit === 'koko' || pose.back) {
    ctx.fillStyle = look.cloth;
    ctx.beginPath();
    ctx.roundRect(cx - 66, top - 18, 132, 34, 12);
    ctx.fill();
    strokeOutline(ctx, 7);
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 72, top - 8);
    ctx.lineTo(cx, top + 172);
    ctx.lineTo(cx + 72, top - 8);
    strokeOutline(ctx, 7);
  }
}

type Pt = { x: number; y: number };
type HandShape = 'fist' | 'point' | 'open' | 'pen';

const mixPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** Resting wrist position per side (upper-body coordinates). */
function restWrist(rest: HandRest, side: -1 | 1, cx: number, top: number): Pt {
  switch (rest) {
    case 'lap':
      return { x: cx + side * 95, y: top + 405 };
    case 'desk':
      return { x: cx + side * 145, y: top + 250 };
    case 'lectern':
      return { x: cx + side * 190, y: top + 215 };
    case 'side':
      return { x: cx + side * 222, y: top + 425 };
  }
}

/** Wrist position while holding a prop, or null when that hand is free. */
function carryWrist(carry: Carry, side: -1 | 1, cx: number, top: number): Pt | null {
  switch (carry) {
    case 'papers':
      return { x: cx + side * 150, y: top + 300 };
    case 'magazine':
      return { x: cx + side * 125, y: top + 300 };
    case 'kitab':
      return { x: cx + side * 85, y: top + 395 };
    case 'pikulan':
      return side === 1 ? { x: cx + 205, y: top + 8 } : null;
    case 'none':
      return null;
  }
}

function drawHand(ctx: CanvasRenderingContext2D, skin: string, at: Pt, side: -1 | 1, shape: HandShape, rot: number): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(rot);
  ctx.fillStyle = skin;
  if (shape === 'point') {
    ctx.beginPath();
    ctx.roundRect(-11, -92, 24, 70, 12);
    ctx.fill();
    strokeOutline(ctx, 7);
  } else if (shape === 'open') {
    // Open palm with a thumb, fingers suggested by two creases.
    ctx.beginPath();
    ctx.ellipse(-side * 34, 6, 13, 24, -side * 0.6, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx, 7);
    ctx.beginPath();
    ctx.roundRect(-30, -62, 60, 82, 26);
    ctx.fill();
    strokeOutline(ctx, 8);
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const x of [-10, 10]) {
      ctx.moveTo(x, -58);
      ctx.lineTo(x, -34);
    }
    ctx.stroke();
    ctx.restore();
    return;
  } else if (shape === 'pen') {
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-26, 26);
    ctx.lineTo(34, -64);
    ctx.stroke();
    ctx.strokeStyle = '#d9a63a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-26, 26);
    ctx.lineTo(-16, 12);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  strokeOutline(ctx, 8);
  ctx.restore();
}

/** Two-segment sleeve from shoulder to wrist with the elbow bending outward. */
function drawLimb(ctx: CanvasRenderingContext2D, look: CharacterLook, shoulder: Pt, wrist: Pt, side: -1 | 1): void {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const half = 235;
  const bend = Math.sqrt(Math.max(0, half * half - (d / 2) * (d / 2))) * 0.7;
  let px = -dy / d;
  let py = dx / d;
  if (px * side < 0) {
    px = -px;
    py = -py;
  }
  const elbow = { x: (shoulder.x + wrist.x) / 2 + px * bend, y: (shoulder.y + wrist.y) / 2 + py * bend };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(wrist.x, wrist.y);
  };
  trace();
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = 84;
  ctx.stroke();
  trace();
  ctx.strokeStyle = look.cloth;
  ctx.lineWidth = 70;
  ctx.stroke();
}

/**
 * Both arms are always present. Each wrist blends from its rest / carry
 * position toward the active action, so hands never pop in or vanish.
 */
function drawArms(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose): void {
  const cx = HEAD_CX + pose.turn * 5;
  const top = TORSO_TOP + pose.breath;
  const a = pose.arms;
  const f = pose.frame;
  const g = pose.gesture;
  const swing = Math.sin(pose.walkPhase) * pose.walk;
  for (const side of [-1, 1] as const) {
    const carried = carryWrist(a.carry, side, cx, top);
    let w = carried ?? restWrist(a.rest, side, cx, top);
    if (!carried && a.rest === 'side') w = { x: w.x, y: w.y - side * swing * 30 };
    let hand: HandShape = 'fist';
    let rot = 0;
    if (side === 1) {
      if (a.write > 0) {
        w = mixPt(w, { x: cx + 70 + Math.sin(f * 0.55) * 26, y: top + 255 + Math.sin(f * 1.3) * 7 }, a.write);
        if (a.write > 0.5) hand = 'pen';
      }
      if (g > 0) {
        const wiggle = Math.sin(f * 0.35) * 6 * g;
        const target = a.gestureHand === 'open' ? { x: cx + 255, y: top - 70 } : { x: cx + 292 + wiggle, y: top - 120 };
        w = mixPt(w, target, g);
        if (g > 0.5) hand = a.gestureHand;
        rot = (-0.12 + wiggle * 0.01) * g;
      }
    } else {
      if (a.write > 0) w = mixPt(w, { x: cx - 135, y: top + 262 }, a.write);
      if (a.explain > 0) {
        w = mixPt(w, { x: cx - 240 + Math.sin(f * 0.12) * 18, y: top + 160 + Math.sin(f * 0.21) * 14 }, a.explain);
        if (a.explain > 0.5) hand = 'open';
        rot = 0.25 * a.explain;
      }
    }
    drawLimb(ctx, look, { x: cx + side * 175, y: top + 70 }, w, side);
    drawHand(ctx, look.skin, w, side, pose.back ? 'fist' : hand, rot);
  }
}

/** Props held in front of the chest / lap (drawn under the hands). */
function drawCarry(ctx: CanvasRenderingContext2D, pose: Pose): void {
  const cx = HEAD_CX + pose.turn * 5;
  const top = TORSO_TOP + pose.breath;
  const box = (x: number, y: number, w: number, h: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    strokeOutline(ctx, 8);
  };
  switch (pose.arms.carry) {
    case 'papers': {
      box(cx - 160, top + 205, 320, 120, '#efe6cf');
      ctx.strokeStyle = 'rgba(120, 100, 70, 0.6)';
      ctx.lineWidth = 3;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 150, top + 205 + i * 20);
        ctx.lineTo(cx + 150, top + 205 + i * 20);
        ctx.stroke();
      }
      break;
    }
    case 'magazine': {
      box(cx - 120, top + 140, 240, 200, '#efe2c2');
      ctx.fillStyle = '#7a2c20';
      ctx.fillRect(cx - 108, top + 152, 216, 58);
      ctx.fillStyle = '#f6e2b0';
      ctx.font = '800 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PEMBELA', cx, top + 168);
      ctx.fillText('ISLAM', cx, top + 196);
      ctx.fillStyle = 'rgba(42, 26, 16, 0.55)';
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 90, top + 238 + i * 22, 180, 6);
      break;
    }
    case 'kitab':
      box(cx - 115, top + 355, 230, 64, '#6b2a1e');
      ctx.fillStyle = '#e9cf8a';
      ctx.fillRect(cx - 104, top + 362, 208, 10);
      break;
    case 'pikulan':
    case 'none':
      break;
  }
}

/** Shoulder pole (pikulan) with two swinging baskets, drawn behind the head. */
function drawPikulan(ctx: CanvasRenderingContext2D, pose: Pose): void {
  const cx = HEAD_CX + pose.turn * 5;
  const top = TORSO_TOP + pose.breath;
  ctx.lineCap = 'round';
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(cx - 305, top + 4);
  ctx.lineTo(cx + 305, top + 4);
  ctx.stroke();
  ctx.strokeStyle = '#a07a44';
  ctx.lineWidth = 16;
  ctx.stroke();
  for (const side of [-1, 1] as const) {
    const sway = Math.sin(pose.walkPhase + (side > 0 ? Math.PI : 0)) * 14 * pose.walk + Math.sin(pose.frame * 0.09 + side) * 4;
    const ex = cx + side * 290;
    const bx = ex + sway;
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ex, top + 6);
    ctx.lineTo(bx - 50, top + 240);
    ctx.moveTo(ex, top + 6);
    ctx.lineTo(bx + 50, top + 240);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k % 2 ? '#d9822b' : '#6f9a3a';
      ctx.beginPath();
      ctx.arc(bx - 34 + k * 34, top + 238, 26, 0, Math.PI * 2);
      ctx.fill();
      strokeOutline(ctx, 6);
    }
    ctx.fillStyle = '#9a7040';
    ctx.beginPath();
    ctx.moveTo(bx - 72, top + 245);
    ctx.lineTo(bx + 72, top + 245);
    ctx.lineTo(bx + 52, top + 345);
    ctx.lineTo(bx - 52, top + 345);
    ctx.closePath();
    ctx.fill();
    strokeOutline(ctx, 8);
    ctx.strokeStyle = 'rgba(60, 35, 15, 0.5)';
    ctx.lineWidth = 4;
    for (let y = top + 270; y < top + 340; y += 22) {
      ctx.beginPath();
      ctx.moveTo(bx - 66, y);
      ctx.lineTo(bx + 66, y);
      ctx.stroke();
    }
  }
}

function drawShoe(ctx: CanvasRenderingContext2D, x: number, sole: number, w: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, sole - 46, w, 46, [22, 22, 8, 8]);
  ctx.fill();
  strokeOutline(ctx, 8);
}

/** Legs, sarung / trousers and shoes behind the torso (absolute canvas coordinates). */
function drawLegs(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose, stance: Stance): void {
  if (stance === 'bust' || stance === 'bersila') return;
  const cx = HEAD_CX + pose.turn * 5;
  const hip = HIP_Y + STANCE_DROP[stance];
  const kind = lowerKindOf(look);
  const col = lowerColorOf(look);
  const shoe = look.shoe ?? (kind === 'sarung' ? '#5a3a24' : '#1d1820');
  const lift = (i: number): number => Math.max(0, Math.sin(pose.walkPhase + i * Math.PI)) * 38 * pose.walk;
  const stride = (i: number): number => Math.sin(pose.walkPhase + i * Math.PI) * 10 * pose.walk;

  if (stance === 'bench') {
    // Seated front view: shins straight down from the knees to the floor.
    const knee = hip + 70;
    [-1, 1].forEach((side) => {
      const x = cx + side * 95;
      ctx.fillStyle = kind === 'sarung' ? look.skin : col;
      ctx.beginPath();
      ctx.roundRect(x - (kind === 'sarung' ? 34 : 62), knee, kind === 'sarung' ? 68 : 124, SOLE_Y - 40 - knee, 18);
      ctx.fill();
      strokeOutline(ctx, 8);
      drawShoe(ctx, x, SOLE_Y, 140, shoe);
    });
    if (kind === 'sarung') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(cx - 200, knee - 10, 400, 150, 30);
      ctx.fill();
      strokeOutline(ctx, 9);
    }
    return;
  }

  if (kind === 'sarung') {
    const hem = SOLE_Y - 150;
    const sway = Math.sin(pose.walkPhase) * 12 * pose.walk;
    [0, 1].forEach((i) => {
      const x = cx + (i === 0 ? -62 : 62) + stride(i);
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.roundRect(x - 26, hem - 30, 52, SOLE_Y - 30 - lift(i) - (hem - 30), 16);
      ctx.fill();
      strokeOutline(ctx, 7);
      drawShoe(ctx, x, SOLE_Y - lift(i), 112, shoe);
    });
    const trace = (): void => {
      ctx.beginPath();
      ctx.moveTo(cx - 205, hip - 10);
      ctx.lineTo(cx - 230 + sway, hem);
      ctx.quadraticCurveTo(cx + sway, hem + 22, cx + 230 + sway, hem);
      ctx.lineTo(cx + 205, hip - 10);
      ctx.closePath();
    };
    trace();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Woven plaid (kotak-kotak) sarung.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 10;
    for (let x = cx - 240; x < cx + 260; x += 70) {
      ctx.beginPath();
      ctx.moveTo(x, hip);
      ctx.lineTo(x + sway, hem + 30);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = hip + 40; y < hem + 30; y += 64) {
      ctx.beginPath();
      ctx.moveTo(cx - 260, y);
      ctx.lineTo(cx + 260, y);
      ctx.stroke();
    }
    ctx.restore();
    trace();
    strokeOutline(ctx, 9);
    return;
  }

  [0, 1].forEach((i) => {
    const side = i === 0 ? -1 : 1;
    const s = stride(i);
    const ankle = SOLE_Y - 40 - lift(i);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx + side * 10, hip - 10);
    ctx.lineTo(cx + side * 200, hip - 10);
    ctx.lineTo(cx + side * 165 + s, ankle);
    ctx.lineTo(cx + side * 42 + s, ankle);
    ctx.closePath();
    ctx.fill();
    strokeOutline(ctx, 9);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + side * 105, hip + 20);
    ctx.lineTo(cx + side * 104 + s, ankle - 10);
    ctx.stroke();
    drawShoe(ctx, cx + side * 104 + s, SOLE_Y - lift(i), 150, shoe);
  });
}

/** Lap in front of the torso: seated thighs (bench) or crossed legs (bersila). */
function drawLap(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose, stance: Stance): void {
  const cx = HEAD_CX + pose.turn * 5;
  const col = lowerColorOf(look);
  if (stance === 'bench') {
    const hip = HIP_Y + STANCE_DROP.bench;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(cx - 210, hip - 24, 420, 110, 46);
    ctx.fill();
    strokeOutline(ctx, 9);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, hip - 10);
    ctx.lineTo(cx, hip + 76);
    ctx.stroke();
  } else if (stance === 'bersila') {
    for (const side of [-1, 1] as const) {
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.ellipse(cx + side * 150, SOLE_Y - 36, 54, 30, side * 0.3, 0, Math.PI * 2);
      ctx.fill();
      strokeOutline(ctx, 7);
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, SOLE_Y - 64, 300, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeOutline(ctx, 9);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 170, SOLE_Y - 92);
    ctx.quadraticCurveTo(cx, SOLE_Y - 40, cx + 170, SOLE_Y - 92);
    ctx.stroke();
  }
}

function drawEye(ctx: CanvasRenderingContext2D, ex: number, ey: number, scaleX: number, pose: Pose, skin: string): void {
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
  ctx.fillStyle = '#2b1b17';
  ctx.beginPath();
  ctx.ellipse(px, py, 18 * scaleX, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - 6 * scaleX, py - 8, 5, 0, Math.PI * 2);
  ctx.fill();
  // Upper/lower lids meet at closeY on a full blink.
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
  strokeOutline(ctx, 7.5);
}

function drawBrow(ctx: CanvasRenderingContext2D, look: CharacterLook, ex: number, ey: number, side: -1 | 1, pose: Pose, scaleX: number): void {
  const raise = pose.browRaise + pose.browAsym * 0.5 * side;
  const baseY = ey - 47 - 32 - raise * 24;
  const half = 36 * scaleX;
  const innerX = ex - side * half;
  const outerX = ex + side * half;
  const innerY = baseY - pose.browInner * 14 + 2;
  const outerY = baseY + Math.max(0, pose.browInner) * 6 - 2;
  ctx.strokeStyle = look.browColor;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(outerX, outerY);
  ctx.quadraticCurveTo(ex, Math.min(innerY, outerY) - 8, innerX, innerY);
  ctx.stroke();
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, pose: Pose): void {
  const v = pose.viseme;
  const hw = 40 * lerp(1, v.width, clamp01(v.open * 3));
  const curve = pose.smile * 22 * (1 - v.open * 0.6);
  if (v.open < 0.05) {
    ctx.beginPath();
    ctx.moveTo(x - hw, y - curve * 0.3);
    ctx.quadraticCurveTo(x, y + curve, x + hw, y - curve * 0.3);
    strokeOutline(ctx, 8);
    return;
  }
  const h = v.open * 46;
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.quadraticCurveTo(x, y + curve * 0.5 - h * (0.25 + 0.55 * v.round), x + hw, y);
    ctx.quadraticCurveTo(x, y + h + curve, x - hw, y);
    ctx.closePath();
  };
  ctx.save();
  trace();
  ctx.fillStyle = '#4e1a2c';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#f5efe6';
  ctx.fillRect(x - hw, y - h, hw * 2, h * 0.32 + 4);
  ctx.fillStyle = '#d9606f';
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.8 + curve * 0.4, hw * 0.6, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  trace();
  strokeOutline(ctx, 8);
}

function drawBeard(ctx: CanvasRenderingContext2D, look: CharacterLook, fx: number, mouthY: number, seed: number): void {
  if (look.beard === 'none') return;
  const W = HEAD_HALF_W;
  ctx.save();
  traceBeanHead(ctx);
  ctx.clip();
  ctx.fillStyle = look.beardColor;
  ctx.beginPath();
  if (look.beard === 'goatee') {
    ctx.moveTo(fx - 60, mouthY + 26);
    ctx.quadraticCurveTo(fx, mouthY + 44, fx + 60, mouthY + 26);
    ctx.quadraticCurveTo(fx + 50, HEAD_HALF_H + 30, fx, HEAD_HALF_H + 40);
    ctx.quadraticCurveTo(fx - 50, HEAD_HALF_H + 30, fx - 60, mouthY + 26);
  } else {
    const cheekY = look.beard === 'full' ? mouthY - 70 : mouthY - 40;
    ctx.moveTo(-W, cheekY);
    ctx.quadraticCurveTo(-W * 0.9, HEAD_HALF_H + 60, fx, HEAD_HALF_H + 60);
    ctx.quadraticCurveTo(W * 0.9, HEAD_HALF_H + 60, W, cheekY);
    ctx.lineTo(W * 0.72, cheekY);
    ctx.quadraticCurveTo(fx + 90, mouthY - 10, fx + 62, mouthY + 30);
    ctx.quadraticCurveTo(fx, mouthY + 52, fx - 62, mouthY + 30);
    ctx.quadraticCurveTo(fx - 90, mouthY - 10, -W * 0.72, cheekY);
    ctx.closePath();
  }
  ctx.fill();
  // Hair texture strokes.
  ctx.strokeStyle = look.beard === 'full' ? 'rgba(160, 150, 140, 0.5)' : 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    const x = fx + (hash(seed, i) - 0.5) * W * 1.6;
    const y = mouthY + 20 + hash(seed + 3, i) * (HEAD_HALF_H - mouthY + 20);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (x - fx) * 0.05, y + 14);
    ctx.stroke();
  }
  ctx.restore();
  // Chin tuft that breaks the head silhouette.
  ctx.fillStyle = look.beardColor;
  ctx.beginPath();
  const tuft = look.beard === 'full' ? 44 : look.beard === 'goatee' ? 30 : 20;
  ctx.moveTo(fx - 70, HEAD_HALF_H - 12);
  ctx.quadraticCurveTo(fx, HEAD_HALF_H + tuft * 2.2, fx + 70, HEAD_HALF_H - 12);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx, 7);
}

function drawMustache(ctx: CanvasRenderingContext2D, look: CharacterLook, x: number, y: number): void {
  if (!look.mustache) return;
  ctx.fillStyle = look.beardColor;
  ctx.beginPath();
  ctx.moveTo(x - 64, y - 4);
  ctx.quadraticCurveTo(x - 34, y - 34, x, y - 20);
  ctx.quadraticCurveTo(x + 34, y - 34, x + 64, y - 4);
  ctx.quadraticCurveTo(x, y - 12, x - 64, y - 4);
  ctx.fill();
  strokeOutline(ctx, 5);
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
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - 24 * s, y - 26);
    ctx.lineTo(x - 6 * s, y - 40);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(lx + 54 * sL, y);
  ctx.quadraticCurveTo((lx + rx) / 2, y - 18, rx - 54 * sR, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lx - 54 * sL, y - 4);
  ctx.lineTo(-HEAD_HALF_W + 6, y - 14);
  ctx.moveTo(rx + 54 * sR, y - 4);
  ctx.lineTo(HEAD_HALF_W - 6, y - 14);
  ctx.stroke();
}

function drawHeadwear(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose): void {
  const hx = pose.turn * 22;
  if (look.headwear.kind === 'peci') {
    const bottom = -HEAD_HALF_H * 0.42;
    const topY = -HEAD_HALF_H - 22;
    ctx.save();
    ctx.translate(hx, bottom);
    ctx.rotate(look.headwear.tilt);
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
    ctx.fillStyle = look.headwear.color ?? '#18131c';
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Velvet sheen and the stitched band.
    ctx.fillStyle = 'rgba(120, 100, 150, 0.28)';
    ctx.fillRect(-190, topY - bottom + 10, 380, 22);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-200, -26);
    ctx.quadraticCurveTo(0, -6, 200, -26);
    ctx.stroke();
    ctx.restore();
    trace();
    strokeOutline(ctx, 9);
    ctx.restore();
    return;
  }
  if (look.headwear.kind === 'caping') {
    // Conical woven farmer's hat, wider than the head.
    ctx.save();
    ctx.translate(hx, -HEAD_HALF_H * 0.4);
    const trace = (): void => {
      ctx.beginPath();
      ctx.moveTo(-335, 0);
      ctx.lineTo(0, -HEAD_HALF_H * 0.62 - 120);
      ctx.lineTo(335, 0);
      ctx.quadraticCurveTo(0, 34, -335, 0);
      ctx.closePath();
    };
    trace();
    ctx.fillStyle = '#c9a25a';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(110, 75, 30, 0.45)';
    ctx.lineWidth = 5;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -HEAD_HALF_H * 0.62 - 120);
      ctx.lineTo(i * 56, 30);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(80, 50, 20, 0.25)';
    ctx.fillRect(-340, -26, 680, 40);
    ctx.restore();
    trace();
    strokeOutline(ctx, 9);
    ctx.restore();
    return;
  }
  if (look.headwear.kind === 'kerudung') {
    // Cloth ring framing the face (front) or covering the whole head (back).
    ctx.save();
    ctx.translate(hx * 0.5, 0);
    ctx.beginPath();
    ctx.ellipse(0, -14, HEAD_HALF_W + 30, HEAD_HALF_H + 34, 0, 0, Math.PI * 2);
    if (!pose.back) ctx.ellipse(pose.turn * 40, 40, 182, 196, 0, 0, Math.PI * 2);
    ctx.fillStyle = look.headwear.color;
    ctx.fill('evenodd');
    strokeOutline(ctx, 9);
    ctx.restore();
    return;
  }
  if (look.headwear.kind === 'bare') {
    if (pose.back) return;
    ctx.save();
    traceBeanHead(ctx);
    ctx.clip();
    ctx.fillStyle = look.hair ?? '#1d1616';
    ctx.beginPath();
    ctx.moveTo(-HEAD_HALF_W - 10, -HEAD_HALF_H * 0.15);
    ctx.quadraticCurveTo(-HEAD_HALF_W * 0.4 + hx, -HEAD_HALF_H * 0.72, HEAD_HALF_W * 0.2 + hx, -HEAD_HALF_H * 0.5);
    ctx.quadraticCurveTo(HEAD_HALF_W * 0.7, -HEAD_HALF_H * 0.62, HEAD_HALF_W + 10, -HEAD_HALF_H * 0.15);
    ctx.lineTo(HEAD_HALF_W + 10, -HEAD_HALF_H - 20);
    ctx.lineTo(-HEAD_HALF_W - 10, -HEAD_HALF_H - 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    traceBeanHead(ctx);
    strokeOutline(ctx);
    return;
  }
  // White turban (sorban): wrapped band + dome.
  ctx.save();
  ctx.translate(hx, 0);
  const dome = (): void => {
    ctx.beginPath();
    ctx.ellipse(0, -HEAD_HALF_H * 0.7, 222, 150, 0, Math.PI, 0);
    ctx.lineTo(236, -HEAD_HALF_H * 0.38);
    ctx.quadraticCurveTo(0, -HEAD_HALF_H * 0.22, -236, -HEAD_HALF_H * 0.38);
    ctx.closePath();
  };
  dome();
  ctx.fillStyle = '#f4f1ea';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#cfc6b6';
  ctx.lineWidth = 7;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-240, -HEAD_HALF_H * 0.42 - i * 34);
    ctx.quadraticCurveTo(0, -HEAD_HALF_H * 0.62 - i * 46, 240, -HEAD_HALF_H * 0.7 - i * 30);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(150, 140, 180, 0.22)';
  ctx.beginPath();
  ctx.ellipse(170, -HEAD_HALF_H * 0.55, 110, 170, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  dome();
  strokeOutline(ctx, 9);
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose, seed: number): void {
  const cx = HEAD_CX + pose.turn * 12;
  const cy = HEAD_CY + pose.breathHead + pose.bow * 22 + pose.lean * 8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(pose.tilt);

  if (look.headwear.kind === 'kerudung') {
    // Drape falling over the shoulders, behind the head.
    ctx.fillStyle = look.headwear.color;
    ctx.beginPath();
    ctx.moveTo(-HEAD_HALF_W - 20, -40);
    ctx.quadraticCurveTo(-HEAD_HALF_W - 70, 200, -HEAD_HALF_W + 10, 330);
    ctx.lineTo(HEAD_HALF_W - 10, 330);
    ctx.quadraticCurveTo(HEAD_HALF_W + 70, 200, HEAD_HALF_W + 20, -40);
    ctx.closePath();
    ctx.fill();
    strokeOutline(ctx, 9);
  }

  if (pose.back) {
    // Back of the head: ears, hair and headwear, no face.
    for (const s of [-1, 1] as const) {
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.ellipse(s * HEAD_HALF_W * 0.97, 24, 30, 46, 0, 0, Math.PI * 2);
      ctx.fill();
      strokeOutline(ctx, 8);
    }
    traceBeanHead(ctx);
    ctx.fillStyle = look.skin;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = look.hair ?? '#1d1616';
    ctx.beginPath();
    ctx.moveTo(-HEAD_HALF_W - 10, 70);
    ctx.quadraticCurveTo(0, 150, HEAD_HALF_W + 10, 70);
    ctx.lineTo(HEAD_HALF_W + 10, -HEAD_HALF_H - 30);
    ctx.lineTo(-HEAD_HALF_W - 10, -HEAD_HALF_H - 30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    traceBeanHead(ctx);
    strokeOutline(ctx);
    drawHeadwear(ctx, look, pose);
    ctx.restore();
    return;
  }

  traceBeanHead(ctx);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(150, 80, 70, 0.2)';
  ctx.beginPath();
  ctx.ellipse(HEAD_HALF_W * 1.05 - pose.turn * 40, 30, HEAD_HALF_W * 0.55, HEAD_HALF_H * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();

  const fx = pose.turn * 72;
  const fy = pose.lookY * 8 + pose.bow * 16;
  const spacing = 72 * (1 - 0.12 * Math.abs(pose.turn));
  const sL = 1 - 0.18 * Math.max(-pose.turn, 0);
  const sR = 1 - 0.18 * Math.max(pose.turn, 0);
  const eyeY = fy - 4;
  const lx = fx - spacing;
  const rx = fx + spacing;
  const mouthY = eyeY + 118;

  ctx.fillStyle = 'rgba(214, 100, 100, 0.28)';
  ctx.beginPath();
  ctx.ellipse(lx - 12, eyeY + 76, 30 * sL, 13, 0, 0, Math.PI * 2);
  ctx.ellipse(rx + 12, eyeY + 76, 30 * sR, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose: a simple warm hook.
  ctx.beginPath();
  ctx.moveTo(fx * 1.15 + 4, eyeY + 40);
  ctx.quadraticCurveTo(fx * 1.15 + 22, eyeY + 72, fx * 1.15 - 6, eyeY + 78);
  ctx.strokeStyle = look.skinShade;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();

  drawEye(ctx, lx, eyeY, sL, pose, look.skin);
  drawEye(ctx, rx, eyeY, sR, pose, look.skin);
  ctx.restore();

  drawBeard(ctx, look, fx * 1.1, mouthY, seed);
  drawMustache(ctx, look, fx * 1.1, mouthY);
  drawMouth(ctx, fx * 1.1, mouthY, pose);

  traceBeanHead(ctx);
  strokeOutline(ctx);

  if (look.glasses) drawGlasses(ctx, lx, rx, eyeY, sL, sR);
  drawBrow(ctx, look, lx, eyeY, -1, pose, sL);
  drawBrow(ctx, look, rx, eyeY, 1, pose, sR);
  drawHeadwear(ctx, look, pose);
  ctx.restore();
}

let grainCanvas: HTMLCanvasElement | null = null;

/** Seeded paper grain (black with varying alpha) for a printed-paint feel. */
function grain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas2D context unavailable');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    img.data[i * 4 + 3] = Math.floor(hash(91, i) * hash(17, i) * 60);
  }
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

export function paintCharacter(ctx: CanvasRenderingContext2D, look: CharacterLook, drive: ToonDrive, seed: number, stance: Stance = 'bust', scale = TEXTURE_SCALE): void {
  const pose = poseFor(drive, seed);
  const H = stanceHeight(stance);
  const full = stance !== 'bust';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  // Weight shift + forward lean, pivoting at the feet (bottom centre).
  const leanScale = 1 + pose.lean * 0.045;
  ctx.translate(LW / 2 + pose.shiftX, H);
  ctx.rotate(pose.shiftRot);
  ctx.scale(leanScale, leanScale);
  ctx.translate(-LW / 2, -H);
  // Upper body sinks for seated stances and bobs with each step.
  const upper = STANCE_DROP[stance] - Math.abs(Math.sin(pose.walkPhase)) * 10 * pose.walk;
  drawLegs(ctx, look, pose, stance);
  ctx.save();
  ctx.translate(0, upper);
  drawBody(ctx, look, pose, full);
  if (pose.arms.carry === 'pikulan') drawPikulan(ctx, pose);
  drawHead(ctx, look, pose, seed);
  ctx.restore();
  drawLap(ctx, look, pose, stance);
  ctx.save();
  ctx.translate(0, upper);
  if (!pose.back) drawCarry(ctx, pose);
  drawArms(ctx, look, pose);
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // source-atop keeps the grain inside painted pixels so the alpha cut-out survives.
  ctx.globalCompositeOperation = 'source-atop';
  const pattern = ctx.createPattern(grain(), 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ── Lit billboard actor ─────────────────────────────────────────────────────

const normalMaps = new Map<Stance, THREE.CanvasTexture>();

/** Ellipsoid head + cylindrical torso / leg normals so the billboard reacts to 3D lights. */
function normalMap(stance: Stance): THREE.CanvasTexture {
  const hit = normalMaps.get(stance);
  if (hit) return hit;
  const drop = STANCE_DROP[stance];
  const bodyBottom = stance === 'bust' ? LH : HIP_Y + drop;
  const s = 2;
  const w = LW / s;
  const h = stanceHeight(stance) / s;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D context unavailable');
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px * s + s / 2;
      const y = py * s + s / 2;
      let nx = 0;
      let ny = 0;
      const hx = (x - HEAD_CX) / HEAD_HALF_W;
      const hy = (y - HEAD_CY - drop) / HEAD_HALF_H;
      const r2 = hx * hx + hy * hy;
      if (r2 < 1.1) {
        const r = Math.sqrt(r2);
        const k = Math.min(r, 0.95) / Math.max(r, 1e-5);
        nx = hx * k * 0.9;
        ny = -hy * k * 0.9;
      } else if (y > TORSO_TOP + drop && y <= bodyBottom) {
        const halfW = lerp(185, 250, clamp01((y - TORSO_TOP - drop) / (bodyBottom - TORSO_TOP - drop)));
        nx = Math.max(-0.95, Math.min(0.95, ((x - HEAD_CX) / halfW) * 0.8));
        ny = (1 - clamp01((y - TORSO_TOP - drop) / 120)) * 0.5;
      } else if (y > bodyBottom) {
        // Legs: each leg reads as its own cylinder.
        const lx = (Math.abs(x - HEAD_CX) - 100) / 110;
        nx = Math.max(-0.8, Math.min(0.8, lx * 0.7)) * Math.sign(x - HEAD_CX);
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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  normalMaps.set(stance, tex);
  return tex;
}

export interface ToonActor {
  id: string;
  stance: Stance;
  /** Origin at the bottom-centre of the billboard (the feet for full figures). */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  update: (drive: ToonDrive, cameraWorldPosition: THREE.Vector3) => void;
  dispose: () => void;
}

export interface ToonActorOptions {
  gradientMap: THREE.Texture | null;
  seed: number;
  stance?: Stance;
  /** Backing canvas resolution relative to the logical 768-px space (figuran use less). */
  textureScale?: number;
}

/** Same pen rig for leads (by id) and figuran (custom look). */
export function createToonActor(character: CharacterId | CharacterLook, options: ToonActorOptions): ToonActor {
  const look = typeof character === 'string' ? CHARACTERS[character] : character;
  const stance = options.stance ?? 'bust';
  const scale = options.textureScale ?? TEXTURE_SCALE;
  const planeH = actorPlaneHeight(stance);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(LW * scale);
  canvas.height = Math.round(stanceHeight(stance) * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D context unavailable');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const geometry = new THREE.PlaneGeometry(ACTOR_PLANE_WIDTH, planeH);
  geometry.translate(0, planeH / 2, 0);
  const material = new THREE.MeshToonMaterial({
    map: texture,
    normalMap: normalMap(stance),
    normalScale: new THREE.Vector2(0.8, 0.8),
    gradientMap: options.gradientMap,
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `actor-${look.name}`;
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });

  const world = new THREE.Vector3();
  let lastKey = '';

  const update = (drive: ToonDrive, cam: THREE.Vector3): void => {
    const key = `${drive.frame}|${drive.viseme.open.toFixed(3)}|${drive.turn.toFixed(3)}|${drive.gesture.toFixed(3)}|${drive.facing ?? 'front'}`;
    if (key !== lastKey) {
      paintCharacter(ctx, look, drive, options.seed, stance, scale);
      texture.needsUpdate = true;
      lastKey = key;
    }
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

  return { id: look.name, stance, mesh, update, dispose };
}
