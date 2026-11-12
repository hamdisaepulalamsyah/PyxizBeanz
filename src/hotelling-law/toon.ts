/**
 * Hukum Hotelling — Persis bean-head toon actors (Pyxis v2.3).
 *
 * Full-body editorial cartoon painted on a 768×1024 card that billboards to
 * the camera. Proportions follow the Cikajang rig (shoe soles on SOLE = 975,
 * chibi 1 : 3.4 head ratio) and the face is the Persis bean head: warm skin,
 * plum ink, blush, irregular blinks, saccades, breathing and AIUEO lip-sync
 * driven by `public/hotelling-law/words.json`.
 *
 * Layer order (skill §Character): back arm → legs → torso/clothes → head →
 * front arm → hand → prop. Resting arms (`side`, `hip`) sit behind the torso;
 * reaching / holding arms are drawn in front of it.
 */
import * as THREE from 'three';
import {
  RESTING_ARMS,
  activeWordIndex,
  clamp01,
  hash01,
  lerp,
  loopWave,
  smoothstep,
  type ArmPose,
  type Expression,
  type LookId,
  type WordTiming,
} from './story';

// ── Card geometry ───────────────────────────────────────────────────────────

const LW = 768;
const LH = 1024;
const TEXTURE_SCALE = 0.75;
/** Shoe soles touch the floor on this card row. */
export const SOLE = 975;
export const ACTOR_PLANE_HEIGHT = 1.7;
export const ACTOR_PLANE_WIDTH = (ACTOR_PLANE_HEIGHT * LW) / LH;
/** Card pixels per world metre. */
const PX = LH / ACTOR_PLANE_HEIGHT;
/** World offset that puts card row SOLE exactly on the floor. */
const SOLE_LIFT = ((LH - SOLE) / LH) * ACTOR_PLANE_HEIGHT;

const PLUM = '#241726';
const HEAD_CX = LW / 2;
const HEAD_HALF_W = 240;
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2;
/** Persis face is authored at 240 px half-width; the full-body rig draws it smaller. */
const HEAD_SCALE = 118 / HEAD_HALF_W;
const HEAD_H_PX = HEAD_HALF_H * 2 * HEAD_SCALE;
const OUTLINE = 8;
/** Outline width in head space so it matches the body ink on the card. */
const HEAD_INK = 8.5 / HEAD_SCALE;

const HIP_Y = SOLE - HEAD_H_PX * 1.35;
const TORSO_TOP = HIP_Y - HEAD_H_PX * 1.1;
const HEAD_CY = TORSO_TOP - HEAD_HALF_H * HEAD_SCALE + 8;
const ANKLE_Y = SOLE - 28;

const UPPER_ARM = 98;
const FOREARM = 92;

type Pt = readonly [number, number];
const SIGN = [-1, 1] as const;

// ── Looks ───────────────────────────────────────────────────────────────────

type Hair = 'cap' | 'short' | 'professor' | 'sunhat';
type Top = 'polo' | 'suit' | 'hoodie' | 'hawaiian';

interface HumanLook {
  kind: 'human';
  skin: string;
  skinShade: string;
  hair: Hair;
  hairColor: string;
  browColor: string;
  hatColor: string;
  top: Top;
  topColor: string;
  topAccent: string;
  shortSleeve: boolean;
  apron: boolean;
  bottomColor: string;
  shoeUpper: string;
  shoeAccent: string;
  glasses: boolean;
  mustache: boolean;
}

interface CatLook {
  kind: 'cat';
  fur: string;
  furShade: string;
  belly: string;
}

type Look = HumanLook | CatLook;

export const LOOKS: Record<LookId, Look> = {
  pedagangBiru: {
    kind: 'human',
    skin: '#e9b48a',
    skinShade: '#c98f6a',
    hair: 'cap',
    hairColor: '#2a1b17',
    browColor: '#2a1b17',
    hatColor: '#2563eb',
    top: 'polo',
    topColor: '#3b82f6',
    topAccent: '#1d4ed8',
    shortSleeve: true,
    apron: true,
    bottomColor: '#334155',
    shoeUpper: '#1e3a8a',
    shoeAccent: '#facc15',
    glasses: false,
    mustache: false,
  },
  pedagangMerah: {
    kind: 'human',
    skin: '#d9a07a',
    skinShade: '#b47b58',
    hair: 'cap',
    hairColor: '#21140f',
    browColor: '#21140f',
    hatColor: '#dc2626',
    top: 'polo',
    topColor: '#ef4444',
    topAccent: '#b91c1c',
    shortSleeve: true,
    apron: true,
    bottomColor: '#3f3f46',
    shoeUpper: '#7f1d1d',
    shoeAccent: '#fde047',
    glasses: false,
    mustache: true,
  },
  profesor: {
    kind: 'human',
    skin: '#f0c4a0',
    skinShade: '#d39f7c',
    hair: 'professor',
    hairColor: '#d8d4cc',
    browColor: '#8f8a82',
    hatColor: '#000000',
    top: 'suit',
    topColor: '#7a5a3c',
    topAccent: '#5b3f27',
    shortSleeve: false,
    apron: false,
    bottomColor: '#4a3828',
    shoeUpper: '#2b1a12',
    shoeAccent: '#2b1a12',
    glasses: true,
    mustache: true,
  },
  pembeli: {
    kind: 'human',
    skin: '#eab896',
    skinShade: '#cc9574',
    hair: 'short',
    hairColor: '#231713',
    browColor: '#231713',
    hatColor: '#000000',
    top: 'hoodie',
    topColor: '#14b8a6',
    topAccent: '#0f766e',
    shortSleeve: false,
    apron: false,
    bottomColor: '#1e293b',
    shoeUpper: '#f8fafc',
    shoeAccent: '#f97316',
    glasses: false,
    mustache: false,
  },
  turis: {
    kind: 'human',
    skin: '#f6cfb2',
    skinShade: '#dba98a',
    hair: 'sunhat',
    hairColor: '#b7793f',
    browColor: '#9a5f2f',
    hatColor: '#e9c77b',
    top: 'hawaiian',
    topColor: '#fb923c',
    topAccent: '#fef3c7',
    shortSleeve: true,
    apron: false,
    bottomColor: '#0ea5e9',
    shoeUpper: '#a16207',
    shoeAccent: '#fde68a',
    glasses: false,
    mustache: false,
  },
  kucing: { kind: 'cat', fur: '#f59e42', furShade: '#c46d1c', belly: '#fde7c8' },
};

// ── Expressions & lip-sync ──────────────────────────────────────────────────

interface FacePreset {
  lid: number;
  browRaise: number;
  browInner: number;
  browAsym: number;
  smile: number;
  /** One-sided mouth pull (smirk). */
  pull: number;
  lookY: number;
  /** Eye white scale bonus (surprise). */
  wide: number;
  /** Resting jaw drop independent of speech. */
  gape: number;
  /** Happy closed-eye arcs. */
  happy: number;
}

const PRESETS: Record<Expression, FacePreset> = {
  neutral: { lid: 0.26, browRaise: 0.1, browInner: 0, browAsym: 0, smile: 0.12, pull: 0, lookY: 0, wide: 0, gape: 0, happy: 0 },
  warm: { lid: 0.2, browRaise: 0.35, browInner: 0.1, browAsym: 0, smile: 0.65, pull: 0, lookY: 0, wide: 0, gape: 0, happy: 0 },
  serious: { lid: 0.38, browRaise: 0, browInner: -0.85, browAsym: 0, smile: -0.2, pull: 0, lookY: 0, wide: 0, gape: 0, happy: 0 },
  thinking: { lid: 0.32, browRaise: 0.3, browInner: 0.1, browAsym: 0.75, smile: -0.05, pull: 0.25, lookY: -0.6, wide: 0, gape: 0, happy: 0 },
  wonder: { lid: 0.04, browRaise: 0.75, browInner: 0.35, browAsym: 0, smile: 0.15, pull: 0, lookY: -0.15, wide: 0.16, gape: 0.22, happy: 0 },
  smirk: { lid: 0.32, browRaise: 0.15, browInner: -0.15, browAsym: 0.6, smile: 0.4, pull: 0.85, lookY: 0, wide: 0, gape: 0, happy: 0 },
  shock: { lid: 0, browRaise: 1, browInner: 0.55, browAsym: 0, smile: -0.15, pull: 0, lookY: 0, wide: 0.3, gape: 0.62, happy: 0 },
  laugh: { lid: 0.3, browRaise: 0.55, browInner: 0.2, browAsym: 0, smile: 0.95, pull: 0, lookY: 0, wide: 0, gape: 0.42, happy: 1 },
};

interface Viseme {
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
  const w = words[activeWordIndex(words, frame)];
  if (!w) return REST;
  const p = clamp01((frame + 0.5 - w.startFrame) / Math.max(1, w.endFrame - w.startFrame));
  // Indonesian is phonetic: one mouth beat per written vowel (A-I-U-E-O).
  const vowels = w.text.toLowerCase().match(/[aiueo]/g) ?? ['a'];
  const seg = p * vowels.length;
  const k = Math.min(vowels.length - 1, Math.floor(seg));
  const env = Math.pow(Math.sin(Math.PI * (seg - k)), 0.7);
  const v = VOWELS[vowels[k] ?? 'a'] ?? REST;
  return { open: v.open * (0.3 + 0.7 * env), width: v.width, round: v.round };
}

/** Lip-sync shape smoothed over neighbouring frames so the mouth never pops. */
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

function blinkShape(d: number): number {
  let v = 0;
  if (d >= -2 && d < 0) v = (d + 2) / 2;
  else if (d >= 0 && d <= 1) v = 1;
  else if (d > 1 && d <= 5) v = 1 - (d - 1) / 4;
  return v * v * (3 - 2 * v);
}

/** Seeded irregular blink rhythm (~every 3–5 s) with occasional double blinks. */
function blinkAt(frame: number, seed: number): number {
  const period = 100;
  const k0 = Math.floor(frame / period);
  let amount = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const t0 = k * period + 12 + hash01(seed, k) * 62;
    amount = Math.max(amount, blinkShape(frame - t0));
    if (hash01(seed + 7, k) > 0.78) amount = Math.max(amount, blinkShape(frame - t0 - 9));
  }
  return amount;
}

// ── Drive & pose ────────────────────────────────────────────────────────────

export interface Blend<T> {
  from: T;
  to: T;
  mix: number;
}

export interface ToonDrive {
  frame: number;
  expression: Blend<Expression>;
  /** Screen-left arm. */
  armL: Blend<ArmPose>;
  /** Screen-right arm. */
  armR: Blend<ArmPose>;
  speaking: boolean;
  /** Eye / head bias −1 … +1. */
  look: number;
  walkPhase: number | null;
  walkDir: number;
  light: { side: 1 | -1; rim: string; rimStrength: number };
  /** Lip-sync mouth shape for this frame. */
  viseme: Viseme;
}

interface Pose extends FacePreset {
  frame: number;
  turn: number;
  tilt: number;
  lookX: number;
  blink: number;
  viseme: Viseme;
  breath: number;
  breathOpen: number;
  breathHead: number;
  shiftX: number;
  shiftRot: number;
  bow: number;
}

/** Breaths and weight shifts complete whole cycles per 60 s loop (≈ 0.22 Hz / 0.1 Hz). */
const BREATH_CYCLES = 13;
const WEIGHT_CYCLES = 6;

function poseFor(d: ToonDrive, seed: number): Pose {
  const a = PRESETS[d.expression.from];
  const b = PRESETS[d.expression.to];
  const m = d.expression.mix;
  const mk = (k: keyof FacePreset): number => lerp(a[k], b[k], m);
  const f = d.frame;
  const talking = d.viseme.open > 0.05 ? 1 : 0;
  const sway = loopWave(f, 7, seed) * 0.04 + loopWave(f, 19, seed * 2) * 0.015 * (1 + talking);
  const turn = clamp01((d.look + 1) / 2) * 2 - 1;
  const bp = (2 * Math.PI * BREATH_CYCLES * f) / 1800 + seed;
  const inhale = (p: number): number => 0.5 - 0.5 * Math.cos(p + 0.35 * Math.sin(p));
  const breathOpen = inhale(bp);
  const weight = loopWave(f, WEIGHT_CYCLES, seed * 1.7) + 0.35 * loopWave(f, WEIGHT_CYCLES * 2 + 1, seed);
  const walking = d.walkPhase !== null;
  const shiftRot = walking ? 0 : weight * 0.011;
  // Small seeded saccades keep the eyes alive between bigger looks.
  const saccade = (hash01(seed + 53, Math.floor((f + seed * 7) / 38)) - 0.5) * 0.32;
  const nodTalk = Math.max(0, Math.sin(f * 0.55 + seed)) * 0.05 * talking;
  const viseme = d.viseme;
  return {
    lid: mk('lid'),
    browRaise: mk('browRaise') + viseme.open * 0.12,
    browInner: mk('browInner'),
    browAsym: mk('browAsym'),
    smile: mk('smile'),
    pull: mk('pull'),
    lookY: mk('lookY'),
    wide: mk('wide'),
    gape: mk('gape'),
    happy: mk('happy'),
    frame: f,
    turn: turn * 0.55 + sway,
    tilt: (turn * 0.55 + sway) * 0.07 + loopWave(f, 5, seed) * 0.025 - shiftRot * 0.6 + mk('browAsym') * 0.04,
    lookX: Math.max(-1, Math.min(1, turn * 0.9 + saccade)),
    blink: mk('happy') > 0.5 ? 0 : blinkAt(f, seed),
    viseme,
    breath: -(breathOpen - 0.5) * 6,
    breathOpen,
    breathHead: -(inhale(bp - 0.5) - 0.5) * 4,
    shiftX: walking ? 0 : weight * 5,
    shiftRot,
    bow: nodTalk,
  };
}

// ── Ink helpers ─────────────────────────────────────────────────────────────

function ink(ctx: CanvasRenderingContext2D, width = OUTLINE): void {
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function filled(ctx: CanvasRenderingContext2D, path: () => void, fill: string, line = OUTLINE): void {
  ctx.beginPath();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) ink(ctx, line);
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  if (amount >= 0) c.lerp(new THREE.Color('#fff4e0'), amount);
  else c.lerp(new THREE.Color('#2a1530'), -amount);
  return `#${c.getHexString()}`;
}

function hexA(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${clamp01(a).toFixed(3)})`;
}

/** Warm form shading + scene-tinted rim inside the current clip region. */
function formShade(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, drive: ToonDrive): void {
  const side = drive.light.side;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const dark = 'rgba(58, 22, 52, 0.34)';
  const clear = 'rgba(58, 22, 52, 0)';
  if (side > 0) {
    g.addColorStop(0, dark);
    g.addColorStop(0.45, clear);
  } else {
    g.addColorStop(0.55, clear);
    g.addColorStop(1, dark);
  }
  ctx.fillStyle = g;
  ctx.fillRect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
  const r = ctx.createLinearGradient(x0, 0, x1, 0);
  const rim = hexA(drive.light.rim, 0.55 * drive.light.rimStrength);
  if (side > 0) {
    r.addColorStop(0.9, hexA(drive.light.rim, 0));
    r.addColorStop(1, rim);
  } else {
    r.addColorStop(0, rim);
    r.addColorStop(0.1, hexA(drive.light.rim, 0));
  }
  ctx.fillStyle = r;
  ctx.fillRect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
}

// ── Body frame (walk cycle) ─────────────────────────────────────────────────

interface Frame {
  cx: number;
  top: number;
  hipY: number;
  breathScale: number;
  headX: number;
  headY: number;
  lift: readonly [number, number];
  stride: readonly [number, number];
  pitch: readonly [number, number];
  footN: readonly [number, number];
  walking: boolean;
  walkDir: number;
}

const STRIDE_AMP = 44;
/**
 * Walk phase (rad) per metre: the stance foot slides back 2·STRIDE_AMP card px
 * over π rad, so phase = metres · PX / (2·STRIDE_AMP/π) keeps it planted.
 */
export const WALK_PHASE_PER_METRE = PX / ((2 * STRIDE_AMP) / Math.PI);
const SWING_LIFT = 20;
const ARM_SWING = 30;

/** θ ∈ [0, π): swing arc; θ ∈ [π, 2π): stance (flat, sliding back linearly). */
function footCycle(theta: number): { x: number; lift: number; pitch: number } {
  const t = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (t < Math.PI) {
    const u = t / Math.PI;
    return { x: -Math.cos(t), lift: Math.sin(t), pitch: -0.42 * (1 - smoothstep(0, 0.4, u)) + 0.3 * smoothstep(0.65, 1, u) };
  }
  const v = (t - Math.PI) / Math.PI;
  return { x: 1 - 2 * v, lift: 0, pitch: 0.3 * (1 - smoothstep(0, 0.25, v)) - 0.42 * smoothstep(0.7, 1, v) };
}

function frameFor(pose: Pose, drive: ToonDrive): Frame {
  const walking = drive.walkPhase !== null;
  const phase = drive.walkPhase ?? 0;
  const dir = drive.walkDir < 0 ? -1 : 1;
  const bob = walking ? Math.cos(phase * 2) * 3.5 : 0;
  const cyc = [0, 1].map((i) => (walking ? footCycle(phase + i * Math.PI) : { x: 0, lift: 0, pitch: 0 }));
  const at = (i: number, k: 'x' | 'lift' | 'pitch'): number => cyc[i]?.[k] ?? 0;
  const cx = HEAD_CX + pose.turn * 3;
  return {
    cx,
    top: TORSO_TOP + bob + pose.breath * 0.5,
    hipY: HIP_Y + bob,
    breathScale: 1 + pose.breathOpen * 0.02,
    headX: HEAD_CX + pose.turn * 9 + (walking ? dir * 4 : 0),
    headY: HEAD_CY + bob + pose.breathHead * 0.6 + pose.bow * 10,
    lift: [at(0, 'lift') * SWING_LIFT, at(1, 'lift') * SWING_LIFT],
    stride: [at(0, 'x') * STRIDE_AMP * dir, at(1, 'x') * STRIDE_AMP * dir],
    pitch: [at(0, 'pitch'), at(1, 'pitch')],
    footN: [at(0, 'x'), at(1, 'x')],
    walking,
    walkDir: dir,
  };
}

// ── Legs & shoes ────────────────────────────────────────────────────────────

function drawShoe(ctx: CanvasRenderingContext2D, look: HumanLook, x: number, sole: number, s: number): void {
  if (look.top === 'suit') {
    // Polished 1920s oxford.
    filled(ctx, () => ctx.ellipse(x + s * 4, sole - 19, 44, 20, 0, 0, Math.PI * 2), look.shoeUpper, 7);
    filled(ctx, () => ctx.roundRect(x - 46, sole - 9, 96, 9, 4), '#140c08', 5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(x - s * 12, sole - 28, 12, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (look.hair === 'sunhat') {
    // Sandals on bare feet.
    filled(ctx, () => ctx.ellipse(x, sole - 15, 36, 15, 0, 0, Math.PI * 2), look.skin, 6);
    filled(ctx, () => ctx.roundRect(x - 44, sole - 8, 88, 8, 4), look.shoeUpper, 5);
    ctx.fillStyle = look.shoeUpper;
    ctx.fillRect(x - 24, sole - 25, 48, 9);
    return;
  }
  // Sneakers: rounded upper, thick white sole, laces, accent swoosh.
  filled(ctx, () => ctx.ellipse(x, sole - 25, 46, 25, 0, 0, Math.PI * 2), look.shoeUpper, 7);
  filled(ctx, () => ctx.roundRect(x - 52, sole - 17, 104, 17, 8), '#fbf7ee', 6);
  ctx.strokeStyle = look.shoeAccent;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 28, sole - 22);
  ctx.quadraticCurveTo(x, sole - 30, x + s * 30, sole - 36);
  ctx.stroke();
  ctx.strokeStyle = shade(look.shoeUpper, -0.4);
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    ctx.moveTo(x - 12 + k * 10, sole - 44);
    ctx.lineTo(x - 5 + k * 10, sole - 35);
  }
  ctx.stroke();
}

function drawLegs(ctx: CanvasRenderingContext2D, look: HumanLook, fr: Frame, drive: ToonDrive): void {
  const legs = SIGN.map((s, i) => {
    const lift = fr.lift[i] ?? 0;
    const pitch = fr.pitch[i] ?? 0;
    const hip: Pt = [fr.cx + s * 34, fr.hipY];
    const ankle: Pt = [fr.cx + s * 38 + (fr.stride[i] ?? 0), ANKLE_Y - lift - Math.max(0, -pitch) * 30];
    let knee: Pt = [fr.cx + s * 37, lerp(fr.hipY, ANKLE_Y, 0.5) - lift * 0.5];
    if (fr.walking) {
      // Two-bone IK, knee bends toward the walk direction.
      const half = ((ANKLE_Y - HIP_Y) / 2) * 1.004;
      const dx = ankle[0] - hip[0];
      const dy = ankle[1] - hip[1];
      const dd = Math.max(1, Math.hypot(dx, dy));
      const h = Math.sqrt(Math.max(0, half * half - (dd / 2) * (dd / 2)));
      knee = [(hip[0] + ankle[0]) / 2 + (dy / dd) * h * fr.walkDir, (hip[1] + ankle[1]) / 2 - (dx / dd) * h * fr.walkDir];
    }
    return { s, hip, knee, ankle, lift, pitch };
  });
  const width = look.hair === 'sunhat' ? 30 : 48;
  for (const l of legs) {
    const trace = (): void => {
      ctx.beginPath();
      ctx.moveTo(l.hip[0], l.hip[1]);
      ctx.lineTo(l.knee[0], l.knee[1]);
      ctx.lineTo(l.ankle[0], l.ankle[1]);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    trace();
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = width + 9;
    ctx.stroke();
    ctx.strokeStyle = look.hair === 'sunhat' ? look.skin : look.bottomColor;
    ctx.lineWidth = width;
    ctx.stroke();
    // Far-side form shade.
    ctx.save();
    ctx.translate(-drive.light.side * width * 0.22, 0);
    trace();
    ctx.strokeStyle = 'rgba(40, 16, 46, 0.2)';
    ctx.lineWidth = width * 0.36;
    ctx.stroke();
    ctx.restore();
  }
  for (const l of legs) {
    // Pitch about toe (heel up) or heel (toe up) so a planted shoe never sinks below SOLE.
    const sx = l.ankle[0] + l.s * 10;
    const px = sx + (l.pitch < 0 ? 1 : -1) * fr.walkDir * 48;
    const py = SOLE - l.lift;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-l.pitch * fr.walkDir);
    ctx.translate(-px, -py);
    drawShoe(ctx, look, sx, SOLE - l.lift, l.s);
    ctx.restore();
  }
  // Shorts / trouser seat over the leg tops.
  const seatH = look.hair === 'sunhat' ? 96 : 64;
  filled(ctx, () => ctx.roundRect(fr.cx - 74, fr.hipY - 34, 148, seatH, 24), look.bottomColor, OUTLINE);
  if (look.hair === 'sunhat') {
    // Board-short hems with a stripe.
    ctx.fillStyle = shade(look.bottomColor, 0.45);
    ctx.fillRect(fr.cx - 72, fr.hipY + seatH - 52, 144, 8);
  }
}

// ── Torso & outfits ─────────────────────────────────────────────────────────

function traceTorso(ctx: CanvasRenderingContext2D, fr: Frame): void {
  const sw = 90 * fr.breathScale;
  const hem = fr.hipY + 22;
  const { top, cx } = fr;
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

function drawTorso(ctx: CanvasRenderingContext2D, look: HumanLook, fr: Frame, drive: ToonDrive, seed: number): void {
  const { cx, top } = fr;
  const hem = fr.hipY + 22;
  ctx.fillStyle = look.skinShade;
  ctx.fillRect(cx - 20, fr.headY + 60, 40, Math.max(10, top - fr.headY - 50));

  if (look.top === 'hoodie') {
    // Hood bunched behind the neck.
    filled(ctx, () => ctx.ellipse(cx, top + 2, 84, 34, 0, 0, Math.PI * 2), look.topAccent, OUTLINE);
  }

  traceTorso(ctx, fr);
  ctx.fillStyle = look.topColor;
  ctx.fill();
  ctx.save();
  traceTorso(ctx, fr);
  ctx.clip();

  switch (look.top) {
    case 'polo': {
      // Placket, buttons and a woven chest patch.
      ctx.fillStyle = look.topAccent;
      ctx.fillRect(cx - 10, top, 20, 62);
      ctx.fillStyle = '#f8fafc';
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.arc(cx, top + 22 + k * 22, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'suit': {
      // Tweed weave (seeded dashes), white shirt V, vest and lapels.
      ctx.strokeStyle = 'rgba(40, 24, 12, 0.28)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 160; k++) {
        const x = cx - 110 + hash01(seed, k) * 220;
        const y = top - 10 + hash01(seed + 3, k) * (hem - top + 20);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 5, y + 4);
        ctx.stroke();
      }
      ctx.fillStyle = '#f5efe2';
      ctx.beginPath();
      ctx.moveTo(cx - 40, top - 4);
      ctx.lineTo(cx + 40, top - 4);
      ctx.lineTo(cx, top + 120);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5c4630';
      ctx.beginPath();
      ctx.moveTo(cx - 30, top + 46);
      ctx.lineTo(cx + 30, top + 46);
      ctx.lineTo(cx + 22, top + 150);
      ctx.lineTo(cx - 22, top + 150);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8dcc0';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(cx, top + 70 + k * 26, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const s of SIGN) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 44, top - 4);
        ctx.lineTo(cx + s * 12, top + 140);
        ctx.lineTo(cx + s * 64, top + 70);
        ctx.closePath();
        ctx.fillStyle = look.topAccent;
        ctx.fill();
        ink(ctx, 4);
      }
      break;
    }
    case 'hoodie': {
      // Kangaroo pocket and drawstrings.
      ctx.beginPath();
      ctx.moveTo(cx - 62, hem - 10);
      ctx.lineTo(cx - 48, hem - 78);
      ctx.lineTo(cx + 48, hem - 78);
      ctx.lineTo(cx + 62, hem - 10);
      ctx.fillStyle = shade(look.topColor, -0.12);
      ctx.fill();
      ink(ctx, 4);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 5;
      for (const s of SIGN) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 22, top + 4);
        ctx.lineTo(cx + s * 26, top + 66);
        ctx.stroke();
      }
      break;
    }
    case 'hawaiian': {
      // Hibiscus print.
      for (let k = 0; k < 22; k++) {
        const x = cx - 105 + hash01(seed + 11, k) * 210;
        const y = top + hash01(seed + 12, k) * (hem - top);
        ctx.fillStyle = k % 3 === 0 ? '#fde047' : look.topAccent;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2 + k;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 7, 4.5, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#be123c';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = shade(look.topColor, -0.15);
      ctx.beginPath();
      ctx.moveTo(cx - 30, top - 4);
      ctx.lineTo(cx, top + 50);
      ctx.lineTo(cx + 30, top - 4);
      ctx.fill();
      break;
    }
  }

  if (look.apron) {
    // White vendor apron with brand stripe and a scoop pocket.
    filled(ctx, () => ctx.roundRect(cx - 66, top + 62, 132, hem - top - 50, 18), '#fbf7ee', 5);
    ctx.fillStyle = look.topAccent;
    ctx.fillRect(cx - 66, top + 62, 132, 14);
    filled(ctx, () => ctx.roundRect(cx - 34, top + 120, 68, 46, 10), '#f1ebe0', 4);
    ctx.fillStyle = '#f9a8d4';
    ctx.beginPath();
    ctx.arc(cx, top + 132, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6a15c';
    ctx.beginPath();
    ctx.moveTo(cx - 9, top + 138);
    ctx.lineTo(cx + 9, top + 138);
    ctx.lineTo(cx, top + 160);
    ctx.fill();
    ctx.strokeStyle = '#fbf7ee';
    ctx.lineWidth = 7;
    for (const s of SIGN) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 58, top + 64);
      ctx.lineTo(cx + s * 30, top - 2);
      ctx.stroke();
    }
  }

  formShade(ctx, cx - 110, cx + 110, top, hem, drive);
  ctx.restore();
  traceTorso(ctx, fr);
  ink(ctx);

  // Collars sit over the outline.
  if (look.top === 'polo') {
    for (const s of SIGN) {
      filled(
        ctx,
        () => {
          ctx.moveTo(cx, top + 6);
          ctx.lineTo(cx + s * 52, top - 10);
          ctx.lineTo(cx + s * 40, top + 30);
          ctx.closePath();
        },
        shade(look.topColor, 0.12),
        5,
      );
    }
  }
  if (look.top === 'suit') {
    // Bowtie.
    filled(
      ctx,
      () => {
        ctx.moveTo(cx, top + 10);
        ctx.lineTo(cx - 24, top);
        ctx.lineTo(cx - 24, top + 22);
        ctx.closePath();
        ctx.moveTo(cx, top + 10);
        ctx.lineTo(cx + 24, top);
        ctx.lineTo(cx + 24, top + 22);
        ctx.closePath();
      },
      '#7f1d1d',
      4,
    );
  }
}

// ── Arms, hands, props ──────────────────────────────────────────────────────

function shoulderOf(s: number, fr: Frame): Pt {
  return [fr.cx + s * 80 * fr.breathScale, fr.top + 30];
}

function wristTarget(pose: ArmPose, s: number, i: number, fr: Frame, frame: number, seed: number): Pt {
  const { cx, top, hipY } = fr;
  const idle = loopWave(frame, 11, seed + i * 2.1) * 4;
  switch (pose) {
    case 'side': {
      // Opposite-arm swing while walking.
      const swing = fr.walking ? -(fr.footN[1 - i] ?? 0) * ARM_SWING * fr.walkDir : 0;
      return [cx + s * 108 + swing, hipY + 34 + idle];
    }
    case 'hip':
      return [cx + s * 92, hipY - 8 + idle * 0.5];
    case 'point':
      return [cx + s * 262, top + 34 + idle];
    case 'pointHigh':
      return [cx + s * 186, top - 118 + idle];
    case 'wave':
      return [cx + s * (178 + Math.sin(frame * 0.42 + seed) * 24), top - 112 + Math.cos(frame * 0.42 + seed) * 8];
    case 'open':
      return [cx + s * 176, top + 138 + idle];
    case 'push':
      return [cx + s * 52, top + 172 + idle * 0.5];
    case 'think':
      return [fr.headX + s * 34, fr.headY + 104];
    case 'chalk':
      return [cx + s * 232, top - 64 + Math.sin(frame * 0.3) * 10];
    case 'bag': {
      const swing = fr.walking ? -(fr.footN[1 - i] ?? 0) * ARM_SWING * 0.6 * fr.walkDir : 0;
      return [cx + s * 112 + swing, hipY + 26 + idle];
    }
  }
}

/** Two-bone IK; picks the elbow that hangs lower and further from the body. */
function solveArm(sh: Pt, target: Pt, s: number): { elbow: Pt; wrist: Pt } {
  let dx = target[0] - sh[0];
  let dy = target[1] - sh[1];
  let d = Math.hypot(dx, dy);
  const reach = UPPER_ARM + FOREARM - 0.5;
  if (d > reach) {
    dx *= reach / d;
    dy *= reach / d;
    d = reach;
  }
  d = Math.max(d, Math.abs(UPPER_ARM - FOREARM) + 1);
  const wrist: Pt = [sh[0] + dx, sh[1] + dy];
  const a = (UPPER_ARM * UPPER_ARM - FOREARM * FOREARM + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const mx = sh[0] + ux * a;
  const my = sh[1] + uy * a;
  const e1: Pt = [mx - uy * h, my + ux * h];
  const e2: Pt = [mx + uy * h, my - ux * h];
  const score = (e: Pt): number => e[1] * 0.6 + s * e[0];
  return { elbow: score(e1) >= score(e2) ? e1 : e2, wrist };
}

interface ArmSolve {
  s: number;
  pose: ArmPose;
  shoulder: Pt;
  elbow: Pt;
  wrist: Pt;
  front: boolean;
}

function armsFor(drive: ToonDrive, fr: Frame, seed: number): ArmSolve[] {
  return SIGN.map((s, i) => {
    const blend = i === 0 ? drive.armL : drive.armR;
    const a = wristTarget(blend.from, s, i, fr, drive.frame, seed);
    const b = wristTarget(blend.to, s, i, fr, drive.frame, seed);
    const target: Pt = [lerp(a[0], b[0], blend.mix), lerp(a[1], b[1], blend.mix)];
    const pose = blend.mix > 0.5 ? blend.to : blend.from;
    const shoulder = shoulderOf(s, fr);
    const { elbow, wrist } = solveArm(shoulder, target, s);
    return { s, pose, shoulder, elbow, wrist, front: !RESTING_ARMS.includes(pose) };
  });
}

function drawArm(ctx: CanvasRenderingContext2D, look: HumanLook, arm: ArmSolve, drive: ToonDrive): void {
  const { shoulder, elbow, wrist } = arm;
  const sleeveW = 40;
  const skinW = 27;
  const stroke = (pts: readonly Pt[], w: number, color: string): void => {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = w + 9;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  if (look.shortSleeve) {
    const cuff: Pt = [lerp(shoulder[0], elbow[0], 0.58), lerp(shoulder[1], elbow[1], 0.58)];
    stroke([cuff, elbow, wrist], skinW, look.skin);
    stroke([shoulder, cuff], sleeveW + 6, look.topColor);
  } else {
    stroke([shoulder, elbow, wrist], sleeveW - 4, look.topColor);
    if (look.top === 'suit') {
      // White shirt cuff peeking out.
      const cuff: Pt = [lerp(elbow[0], wrist[0], 0.86), lerp(elbow[1], wrist[1], 0.86)];
      stroke([cuff, wrist], 24, '#f5efe2');
    }
  }
  // Fold shade on the far side.
  ctx.save();
  ctx.translate(-drive.light.side * 6, 2);
  ctx.beginPath();
  ctx.moveTo(shoulder[0], shoulder[1]);
  ctx.lineTo(elbow[0], elbow[1]);
  ctx.lineTo(wrist[0], wrist[1]);
  ctx.strokeStyle = 'rgba(40, 16, 46, 0.16)';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, look: HumanLook, arm: ArmSolve): void {
  const { elbow, wrist, pose } = arm;
  const ang = Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]);
  const hx = wrist[0] + Math.cos(ang) * 12;
  const hy = wrist[1] + Math.sin(ang) * 12;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  const pointing = pose === 'point' || pose === 'pointHigh' || pose === 'chalk';
  if (pointing) {
    filled(ctx, () => ctx.roundRect(8, -7, 40, 14, 7), look.skin, 5);
  }
  if (pose === 'chalk') {
    filled(ctx, () => ctx.roundRect(36, -5, 26, 10, 3), '#fbfaf5', 3);
  }
  const open = pose === 'open' || pose === 'wave';
  filled(ctx, () => ctx.ellipse(4, 0, open ? 26 : 22, open ? 22 : 19, 0, 0, Math.PI * 2), look.skin, 6);
  // Keep the thumb on the screen-up side whichever way the forearm points.
  const up = Math.abs(ang) > Math.PI / 2 ? 1 : -1;
  filled(ctx, () => ctx.ellipse(2, 17 * up, 9, 7, -0.4, 0, Math.PI * 2), look.skin, 4);
  if (open) {
    ctx.strokeStyle = shade(look.skinShade, -0.1);
    ctx.lineWidth = 3;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(14, k * 8);
      ctx.lineTo(26, k * 9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Plastic minimarket bag hanging from the hand (prop layer). */
function drawBag(ctx: CanvasRenderingContext2D, arm: ArmSolve, frame: number): void {
  const [x, y] = arm.wrist;
  const sway = Math.sin(frame * 0.12) * 0.06;
  ctx.save();
  ctx.translate(x, y + 10);
  ctx.rotate(sway);
  ctx.strokeStyle = 'rgba(235, 240, 250, 0.95)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-26, 34);
  ctx.quadraticCurveTo(-14, -8, 0, 0);
  ctx.quadraticCurveTo(14, -8, 26, 34);
  ctx.stroke();
  const body = (): void => {
    ctx.moveTo(-44, 32);
    ctx.lineTo(44, 32);
    ctx.quadraticCurveTo(54, 120, 36, 132);
    ctx.lineTo(-36, 132);
    ctx.quadraticCurveTo(-54, 120, -44, 32);
    ctx.closePath();
  };
  // Silhouettes of groceries through the thin plastic.
  ctx.fillStyle = 'rgba(120, 70, 60, 0.55)';
  ctx.fillRect(-30, 56, 26, 70);
  ctx.fillStyle = 'rgba(40, 90, 160, 0.5)';
  ctx.fillRect(2, 70, 30, 56);
  filled(ctx, body, 'rgba(244, 247, 252, 0.72)', 5);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(-40, 78, 82, 9);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-40, 87, 82, 6);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-40, 93, 82, 5);
  ctx.restore();
}

// ── Head ────────────────────────────────────────────────────────────────────

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

function drawEye(ctx: CanvasRenderingContext2D, ex: number, ey: number, scaleX: number, pose: Pose, skin: string): void {
  if (pose.happy > 0.5) {
    // Laughing: closed upward arcs.
    ctx.beginPath();
    ctx.moveTo(ex - 36 * scaleX, ey + 10);
    ctx.quadraticCurveTo(ex, ey - 34, ex + 36 * scaleX, ey + 10);
    ink(ctx, 13);
    return;
  }
  const w = 1 + pose.wide;
  const rx = 40 * scaleX * w;
  const ry = 47 * w;
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
  const pr = 1 - pose.wide * 0.9;
  ctx.fillStyle = '#2b1b17';
  ctx.beginPath();
  ctx.ellipse(px, py, 18 * scaleX * pr, 20 * pr, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - 6 * scaleX, py - 8, 5, 0, Math.PI * 2);
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
    ink(ctx, 6);
    ctx.restore();
  }
  const dy = (lidY - ey) / ry;
  const hw = rx * Math.sqrt(Math.max(0, 1 - dy * dy)) + 5;
  ctx.beginPath();
  ctx.moveTo(ex - hw, lidY);
  ctx.quadraticCurveTo(ex, lidY + 3 + pose.blink * 12, ex + hw, lidY);
  ink(ctx, 7.5);
}

function drawBrow(ctx: CanvasRenderingContext2D, color: string, ex: number, ey: number, side: -1 | 1, pose: Pose, scaleX: number): void {
  const raise = pose.browRaise + pose.browAsym * 0.5 * side;
  const baseY = ey - 47 * (1 + pose.wide) - 32 - raise * 24;
  const half = 36 * scaleX;
  const innerX = ex - side * half;
  const outerX = ex + side * half;
  const innerY = baseY - pose.browInner * 14 + 2;
  const outerY = baseY + Math.max(0, pose.browInner) * 6 - 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(outerX, outerY);
  ctx.quadraticCurveTo(ex, Math.min(innerY, outerY) - 8, innerX, innerY);
  ctx.stroke();
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, pose: Pose): void {
  const v = pose.viseme;
  const open = Math.max(v.open, pose.gape * (1 - v.open));
  const width = v.open > 0.05 ? v.width : lerp(1, 0.8, pose.gape);
  const hw = 40 * lerp(1, width, clamp01(open * 3));
  const curve = pose.smile * 22 * (1 - open * 0.5);
  const pull = pose.pull * 14;
  if (open < 0.05) {
    ctx.beginPath();
    ctx.moveTo(x - hw, y - curve * 0.3 + pull * 0.4);
    ctx.quadraticCurveTo(x, y + curve, x + hw, y - curve * 0.3 - pull);
    ink(ctx, 8);
    return;
  }
  const h = open * 46;
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(x - hw, y + pull * 0.3);
    ctx.quadraticCurveTo(x, y + curve * 0.5 - h * (0.25 + 0.55 * v.round), x + hw, y - pull);
    ctx.quadraticCurveTo(x, y + h + curve, x - hw, y + pull * 0.3);
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
  ink(ctx, 8);
}

function drawHairBack(ctx: CanvasRenderingContext2D, look: HumanLook): void {
  if (look.hair !== 'professor') return;
  // Grey side tufts peeking past the bean outline.
  for (const s of SIGN) {
    filled(
      ctx,
      () => {
        ctx.ellipse(s * HEAD_HALF_W * 0.93, -HEAD_HALF_H * 0.12, 70, 105, s * 0.25, 0, Math.PI * 2);
      },
      look.hairColor,
      HEAD_INK,
    );
  }
}

function drawHairFront(ctx: CanvasRenderingContext2D, look: HumanLook, pose: Pose): void {
  const W = HEAD_HALF_W;
  const H = HEAD_HALF_H;
  if (look.hair === 'short') {
    ctx.save();
    traceBeanHead(ctx);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(-W - 30, -H * 0.05);
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const x = -W + (2 * W * i) / n + pose.turn * 20;
      const y = i % 2 === 0 ? -H * 0.46 : -H * 0.3;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 30, -H * 0.05);
    ctx.lineTo(W + 30, -H - 60);
    ctx.lineTo(-W - 30, -H - 60);
    ctx.closePath();
    ctx.fillStyle = look.hairColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 230, 210, 0.22)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(-W * 0.2, -H * 0.2, W * 0.75, Math.PI * 1.15, Math.PI * 1.45);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (look.hair === 'professor') {
    // Thin combed-over strands on the crown.
    ctx.save();
    traceBeanHead(ctx);
    ctx.clip();
    ctx.strokeStyle = look.hairColor;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(-W * 0.6, -H * (0.62 + k * 0.08));
      ctx.quadraticCurveTo(0, -H * (0.86 + k * 0.05), W * 0.65, -H * (0.6 + k * 0.07));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHat(ctx: CanvasRenderingContext2D, look: HumanLook, pose: Pose): void {
  const W = HEAD_HALF_W;
  const H = HEAD_HALF_H;
  if (look.hair === 'cap') {
    const by = -H * 0.36;
    filled(
      ctx,
      () => {
        ctx.moveTo(-W * 1.0, by);
        ctx.bezierCurveTo(-W * 1.02, -H * 1.18, W * 1.02, -H * 1.18, W * 1.0, by);
        ctx.quadraticCurveTo(0, by + 22, -W * 1.0, by);
        ctx.closePath();
      },
      look.hatColor,
      HEAD_INK,
    );
    // Panel seams + button + white badge.
    ctx.strokeStyle = shade(look.hatColor, -0.3);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pose.turn * 30, -H * 0.94);
    ctx.lineTo(pose.turn * 40, by + 10);
    ctx.stroke();
    filled(ctx, () => ctx.ellipse(pose.turn * 30, -H * 0.96, 22, 12, 0, 0, Math.PI * 2), shade(look.hatColor, -0.2), 6);
    filled(ctx, () => ctx.arc(pose.turn * 40, -H * 0.62, 34, 0, Math.PI * 2), '#fbf7ee', 6);
    ctx.fillStyle = '#f9a8d4';
    ctx.beginPath();
    ctx.arc(pose.turn * 40, -H * 0.66, 13, 0, Math.PI * 2);
    ctx.fill();
    // Curved bill.
    filled(
      ctx,
      () => {
        ctx.moveTo(-W * 0.95 + pose.turn * 40, by + 4);
        ctx.quadraticCurveTo(pose.turn * 60, by + 92, W * 0.95 + pose.turn * 40, by + 4);
        ctx.quadraticCurveTo(pose.turn * 50, by + 34, -W * 0.95 + pose.turn * 40, by + 4);
        ctx.closePath();
      },
      shade(look.hatColor, -0.22),
      HEAD_INK,
    );
    return;
  }
  if (look.hair === 'sunhat') {
    const by = -H * 0.6;
    filled(ctx, () => ctx.roundRect(-W * 0.72, -H * 1.3, W * 1.44, H * 0.8, [90, 90, 20, 20]), look.hatColor, HEAD_INK);
    ctx.fillStyle = '#e11d48';
    ctx.fillRect(-W * 0.72, by - 64, W * 1.44, 34);
    filled(ctx, () => ctx.ellipse(pose.turn * 20, by, W * 1.55, H * 0.2, 0, 0, Math.PI * 2), shade(look.hatColor, 0.08), HEAD_INK);
    // Woven straw ticks.
    ctx.strokeStyle = shade(look.hatColor, -0.25);
    ctx.lineWidth = 5;
    for (let k = -8; k <= 8; k++) {
      const x = pose.turn * 20 + k * W * 0.17;
      ctx.beginPath();
      ctx.moveTo(x, by - 12);
      ctx.lineTo(x + 10, by + 12);
      ctx.stroke();
    }
  }
}

function drawGlasses(ctx: CanvasRenderingContext2D, lx: number, rx: number, y: number): void {
  ctx.strokeStyle = '#3a2a20';
  ctx.lineWidth = 9;
  for (const x of [lx, rx]) {
    ctx.beginPath();
    ctx.arc(x, y, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220, 235, 255, 0.12)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(lx + 58, y - 6);
  ctx.quadraticCurveTo((lx + rx) / 2, y - 22, rx - 58, y - 6);
  ctx.stroke();
}

function drawMustache(ctx: CanvasRenderingContext2D, color: string, x: number, y: number): void {
  filled(
    ctx,
    () => {
      ctx.moveTo(x, y - 24);
      ctx.bezierCurveTo(x - 30, y - 42, x - 74, y - 26, x - 70, y - 4);
      ctx.bezierCurveTo(x - 46, y - 14, x - 18, y - 12, x, y - 14);
      ctx.bezierCurveTo(x + 18, y - 12, x + 46, y - 14, x + 70, y - 4);
      ctx.bezierCurveTo(x + 74, y - 26, x + 30, y - 42, x, y - 24);
      ctx.closePath();
    },
    color,
    6,
  );
}

function drawHead(ctx: CanvasRenderingContext2D, look: HumanLook, pose: Pose, fr: Frame, drive: ToonDrive): void {
  ctx.save();
  ctx.translate(fr.headX, fr.headY);
  ctx.scale(HEAD_SCALE, HEAD_SCALE);
  ctx.rotate(pose.tilt);

  drawHairBack(ctx, look);
  traceBeanHead(ctx);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Warm form shade on the shadow cheek + scene rim on the lit edge.
  formShade(ctx, -HEAD_HALF_W, HEAD_HALF_W, -HEAD_HALF_H, HEAD_HALF_H, drive);

  const fx = pose.turn * 72;
  const fy = pose.lookY * 8;
  const spacing = 72 * (1 - 0.12 * Math.abs(pose.turn));
  const sL = 1 - 0.18 * Math.max(-pose.turn, 0);
  const sR = 1 - 0.18 * Math.max(pose.turn, 0);
  const eyeY = fy - 4;
  const lx = fx - spacing;
  const rx = fx + spacing;
  const mouthY = eyeY + 118;

  // Blush.
  ctx.fillStyle = `rgba(222, 104, 108, ${0.26 + pose.smile * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(lx - 14, eyeY + 76, 32 * sL, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(rx + 14, eyeY + 76, 32 * sR, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose: a simple warm hook.
  ctx.beginPath();
  ctx.moveTo(fx * 1.15 + 4, eyeY + 40);
  ctx.quadraticCurveTo(fx * 1.15 + 22, eyeY + 72, fx * 1.15 - 6, eyeY + 78);
  ctx.strokeStyle = look.skinShade;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();

  drawEye(ctx, lx, eyeY, sL, pose, look.skin);
  drawEye(ctx, rx, eyeY, sR, pose, look.skin);
  drawHairFront(ctx, look, pose);
  ctx.restore();

  if (look.mustache) drawMustache(ctx, look.hair === 'professor' ? '#bdb6aa' : look.hairColor, fx * 1.1, mouthY);
  drawMouth(ctx, fx * 1.1, mouthY, pose);
  traceBeanHead(ctx);
  ink(ctx, HEAD_INK);
  if (look.glasses) drawGlasses(ctx, lx, rx, eyeY);
  drawBrow(ctx, look.browColor, lx, eyeY, -1, pose, sL);
  drawBrow(ctx, look.browColor, rx, eyeY, 1, pose, sR);
  drawHat(ctx, look, pose);
  if (look.hair === 'short') {
    // Cowlick.
    ctx.beginPath();
    ctx.moveTo(10, -HEAD_HALF_H * 0.98);
    ctx.quadraticCurveTo(40, -HEAD_HALF_H * 1.25, 70, -HEAD_HALF_H * 1.12);
    ctx.strokeStyle = look.hairColor;
    ctx.lineWidth = 22;
    ctx.stroke();
  }
  ctx.restore();
}

// ── Cat ─────────────────────────────────────────────────────────────────────

function drawCat(ctx: CanvasRenderingContext2D, look: CatLook, frame: number, seed: number, drive: ToonDrive): void {
  const cx = LW / 2;
  const tail = loopWave(frame, 37, seed) * 0.5 + loopWave(frame, 11, seed) * 0.3;
  // Tail (behind body).
  ctx.beginPath();
  ctx.moveTo(cx + 60, SOLE - 30);
  ctx.bezierCurveTo(cx + 160, SOLE - 40, cx + 150 + tail * 40, SOLE - 170, cx + 110 + tail * 70, SOLE - 230);
  ctx.lineCap = 'round';
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = 34;
  ctx.stroke();
  ctx.strokeStyle = look.fur;
  ctx.lineWidth = 24;
  ctx.stroke();
  // Body.
  filled(ctx, () => ctx.ellipse(cx + 10, SOLE - 92, 92, 96, 0, 0, Math.PI * 2), look.fur, OUTLINE);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + 10, SOLE - 92, 92, 96, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = look.furShade;
  ctx.lineWidth = 10;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(cx + 40 + k * 14, SOLE - 170 + k * 10);
    ctx.quadraticCurveTo(cx + 80, SOLE - 140 + k * 12, cx + 100, SOLE - 110 + k * 16);
    ctx.stroke();
  }
  filled(ctx, () => ctx.ellipse(cx - 6, SOLE - 70, 46, 64, 0, 0, Math.PI * 2), look.belly, 0);
  formShade(ctx, cx - 90, cx + 100, SOLE - 190, SOLE, drive);
  ctx.restore();
  // Front paws planted on SOLE.
  for (const dx of [-34, 14]) filled(ctx, () => ctx.roundRect(cx + dx, SOLE - 70, 30, 70, 14), look.fur, 6);
  // Head.
  const hx = cx - 4 + loopWave(frame, 9, seed) * 4;
  const hy = SOLE - 214;
  for (const s of SIGN) {
    filled(
      ctx,
      () => {
        ctx.moveTo(hx + s * 30, hy - 40);
        ctx.lineTo(hx + s * 62, hy - 100);
        ctx.lineTo(hx + s * 70, hy - 24);
        ctx.closePath();
      },
      look.fur,
      6,
    );
  }
  filled(ctx, () => ctx.ellipse(hx, hy, 74, 62, 0, 0, Math.PI * 2), look.fur, OUTLINE);
  const blink = blinkAt(frame, seed + 2);
  for (const s of SIGN) {
    const ex = hx + s * 28;
    const ey = hy - 6;
    if (blink > 0.6) {
      ctx.beginPath();
      ctx.moveTo(ex - 13, ey);
      ctx.quadraticCurveTo(ex, ey + 8, ex + 13, ey);
      ink(ctx, 5);
    } else {
      filled(ctx, () => ctx.ellipse(ex, ey, 14, 17 * (1 - blink), 0, 0, Math.PI * 2), '#d9f99d', 5);
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.ellipse(ex + loopWave(frame, 17, seed) * 3, ey, 4, 13 * (1 - blink), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.moveTo(hx - 8, hy + 16);
  ctx.lineTo(hx + 8, hy + 16);
  ctx.lineTo(hx, hy + 25);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 14, hy + 32);
  ctx.quadraticCurveTo(hx - 7, hy + 40, hx, hy + 30);
  ctx.quadraticCurveTo(hx + 7, hy + 40, hx + 14, hy + 32);
  ink(ctx, 4);
  ctx.strokeStyle = 'rgba(36, 23, 38, 0.7)';
  ctx.lineWidth = 2.5;
  for (const s of SIGN) {
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(hx + s * 22, hy + 24 + k * 6);
      ctx.lineTo(hx + s * 78, hy + 18 + k * 14);
      ctx.stroke();
    }
  }
}

// ── Painting entry ──────────────────────────────────────────────────────────

let grainCanvas: HTMLCanvasElement | null = null;

/** Seeded paper grain for the printed-paint "living painting" feel. */
function grain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas2D context unavailable');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) img.data[i * 4 + 3] = Math.floor(hash01(91, i) * hash01(17, i) * 58);
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

export function paintCharacter(ctx: CanvasRenderingContext2D, look: Look, drive: ToonDrive, seed: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(TEXTURE_SCALE, 0, 0, TEXTURE_SCALE, 0, 0);
  if (look.kind === 'cat') {
    drawCat(ctx, look, drive.frame, seed, drive);
  } else {
    const pose = poseFor(drive, seed);
    const fr = frameFor(pose, drive);
    // Weight shift pivots at the soles so the feet stay planted.
    ctx.translate(LW / 2 + pose.shiftX, SOLE);
    ctx.rotate(pose.shiftRot + (fr.walking ? fr.walkDir * 0.05 : 0));
    ctx.translate(-LW / 2, -SOLE);
    const arms = armsFor(drive, fr, seed);
    for (const arm of arms) {
      if (!arm.front) {
        drawArm(ctx, look, arm, drive);
        drawHand(ctx, look, arm);
      }
    }
    drawLegs(ctx, look, fr, drive);
    drawTorso(ctx, look, fr, drive, seed);
    drawHead(ctx, look, pose, fr, drive);
    for (const arm of arms) {
      if (arm.front) {
        drawArm(ctx, look, arm, drive);
        drawHand(ctx, look, arm);
        if (arm.pose === 'bag') drawBag(ctx, arm, drive.frame);
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // source-atop keeps grain inside painted pixels so the alpha cut-out survives.
  ctx.globalCompositeOperation = 'source-atop';
  const pattern = ctx.createPattern(grain(), 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ── Lit billboard actor ─────────────────────────────────────────────────────

/** 4-step toon ramp shared by actors and sets. */
export function createToonGradient(): THREE.DataTexture {
  const tones = [92, 160, 220, 255];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((t, i) => {
    data.set([t, t, t, 255], i * 4);
  });
  const tex = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let sharedNormalMap: THREE.CanvasTexture | null = null;

/** Ellipsoid head + cylindrical torso/limb normals so the card responds to 3D lights. */
function normalMap(): THREE.CanvasTexture {
  if (sharedNormalMap) return sharedNormalMap;
  const s = 4;
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
      if (r2 < 1.15) {
        const r = Math.sqrt(r2);
        const k = Math.min(r, 0.95) / Math.max(r, 1e-5);
        nx = hx * k * 0.85;
        ny = -hy * k * 0.85;
      } else if (y > TORSO_TOP - 10) {
        const halfW = y < HIP_Y + 22 ? 110 : 90;
        nx = Math.max(-0.9, Math.min(0.9, ((x - HEAD_CX) / halfW) * 0.75));
        ny = (1 - clamp01((y - TORSO_TOP) / 120)) * 0.45;
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

let blobTexture: THREE.CanvasTexture | null = null;

function contactShadowTexture(): THREE.CanvasTexture {
  if (blobTexture) return blobTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas2D context unavailable');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(24, 10, 28, 0.75)');
  r.addColorStop(0.55, 'rgba(24, 10, 28, 0.35)');
  r.addColorStop(1, 'rgba(24, 10, 28, 0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  blobTexture = new THREE.CanvasTexture(c);
  return blobTexture;
}

export interface ActorUpdate {
  frame: number;
  expression: Blend<Expression>;
  armL: Blend<ArmPose>;
  armR: Blend<ArmPose>;
  speaking: boolean;
  look: number;
  walkPhase: number | null;
  walkDir: number;
  light: ToonDrive['light'];
  /** Self-illumination (from the colour script) so faces read at night. */
  glow: number;
}

/**
 * A painted card that turns to face the camera around Y. `mesh` is the
 * placement group: its origin is the floor point under the soles.
 */
export class ToonActor {
  readonly mesh = new THREE.Group();
  readonly look: Look;
  private readonly card: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  private readonly blob: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private lastKey = '';
  private readonly world = new THREE.Vector3();

  constructor(
    readonly id: LookId,
    private readonly seed: number,
    gradientMap: THREE.Texture,
  ) {
    this.look = LOOKS[id];
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(LW * TEXTURE_SCALE);
    canvas.height = Math.round(LH * TEXTURE_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D context unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const geometry = new THREE.PlaneGeometry(ACTOR_PLANE_WIDTH, ACTOR_PLANE_HEIGHT);
    // Card row SOLE lands exactly on the group origin (the floor).
    geometry.translate(0, ACTOR_PLANE_HEIGHT / 2 - SOLE_LIFT, 0);
    const material = new THREE.MeshToonMaterial({
      map: this.texture,
      normalMap: normalMap(),
      normalScale: new THREE.Vector2(0.75, 0.75),
      gradientMap,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: this.texture,
      emissiveIntensity: 0.15,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.card = new THREE.Mesh(geometry, material);
    this.card.name = `actor-${id}`;
    this.card.castShadow = true;
    this.card.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.texture, alphaTest: 0.5 });
    this.mesh.add(this.card);

    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    this.blob = new THREE.Mesh(
      blobGeo,
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, fog: true }),
    );
    this.blob.position.y = 0.012;
    this.blob.renderOrder = 1;
    const cat = this.look.kind === 'cat';
    this.blob.scale.set(cat ? 0.5 : 0.78, 1, cat ? 0.32 : 0.42);
    this.mesh.add(this.blob);
  }

  update(u: ActorUpdate, words: readonly WordTiming[], camera: THREE.Vector3): void {
    const viseme = visemeAt(words, u.frame, u.speaking);
    const drive: ToonDrive = { ...u, viseme };
    const key = `${u.frame}|${u.light.side}|${u.light.rim}`;
    if (key !== this.lastKey) {
      paintCharacter(this.ctx, this.look, drive, this.seed);
      this.texture.needsUpdate = true;
      this.lastKey = key;
    }
    this.card.material.emissiveIntensity = u.glow;
    this.mesh.getWorldPosition(this.world);
    this.card.rotation.y = Math.atan2(camera.x - this.world.x, camera.z - this.world.z) - this.mesh.rotation.y;
  }

  dispose(): void {
    this.card.geometry.dispose();
    this.card.material.dispose();
    this.card.customDepthMaterial?.dispose();
    this.blob.geometry.dispose();
    this.blob.material.dispose();
    this.texture.dispose();
  }
}
