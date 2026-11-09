import * as THREE from 'three';
import type { CharacterId, Expression, WordTiming } from './story';
import { activeWordIndex, clamp01, hash01, lerp, nodPulseAt } from './story';

/**
 * Procedural Canvas2D bean-head cast for "Sejarah Persis". Each character is
 * painted onto a lit, alpha-tested billboard (MeshToonMaterial + normal map) so
 * the 3D world's warm key / cool fill lights and shadows fall on them.
 * Everything is a pure function of the frame for deterministic rendering.
 */

/** Logical drawing space; the backing canvas is scaled down by TEXTURE_SCALE. */
const LW = 768;
const LH = 1024;
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

type Headwear = { kind: 'peci'; tilt: number } | { kind: 'turban' };
type Outfit = 'koko' | 'safari' | 'jas';
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
}

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

/** Main breathing rate (Hz): slow, calm documentary breathing. */
export const BREATH_HZ = 0.08;
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
}

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

function traceTorso(ctx: CanvasRenderingContext2D, cx: number, top: number, breathScale: number): void {
  const sw = 172 * breathScale;
  const bw = 250;
  ctx.beginPath();
  ctx.moveTo(cx - bw, LH + 20);
  ctx.lineTo(cx - sw - 12, top + 95);
  ctx.quadraticCurveTo(cx - sw, top, cx - sw + 72, top - 6);
  ctx.lineTo(cx + sw - 72, top - 6);
  ctx.quadraticCurveTo(cx + sw, top, cx + sw + 12, top + 95);
  ctx.lineTo(cx + bw, LH + 20);
  ctx.closePath();
}

function strokeOutline(ctx: CanvasRenderingContext2D, width = OUTLINE): void {
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawBody(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose): void {
  const cx = HEAD_CX + pose.turn * 5;
  const top = TORSO_TOP + pose.breath + pose.bow * 6;
  const breathScale = 1 + pose.breathOpen * 0.016;

  ctx.fillStyle = look.skinShade;
  ctx.fillRect(cx - 40, HEAD_CY + 150, 80, 80);

  ctx.save();
  traceTorso(ctx, cx, top, breathScale);
  ctx.fillStyle = look.cloth;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = look.clothShade;
  ctx.beginPath();
  ctx.ellipse(cx + 260, top + 270, 150, 330, 0, 0, Math.PI * 2);
  ctx.fill();

  if (look.outfit === 'koko') {
    // Mandarin collar band + button placket.
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
    ctx.quadraticCurveTo(cx - 40, top + 220, cx + 150, LH + 40);
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

  traceTorso(ctx, cx, top, breathScale);
  strokeOutline(ctx);
  if (look.outfit === 'koko') {
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

function drawArm(ctx: CanvasRenderingContext2D, look: CharacterLook, pose: Pose): void {
  const g = pose.gesture;
  if (g < 0.02) return;
  const cx = HEAD_CX + pose.turn * 5;
  const top = TORSO_TOP + pose.breath;
  const wiggle = Math.sin(pose.frame * 0.35) * 6 * g;
  const shoulder = { x: cx + 175, y: top + 70 };
  const elbow = { x: lerp(cx + 250, cx + 300, g), y: lerp(LH + 120, top + 170, g) };
  const wrist = { x: lerp(cx + 260, cx + 292, g) + wiggle, y: lerp(LH + 260, HEAD_CY + 70, g) };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const limb = (): void => {
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(wrist.x, wrist.y + 30);
  };
  limb();
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = 84;
  ctx.stroke();
  limb();
  ctx.strokeStyle = look.cloth;
  ctx.lineWidth = 70;
  ctx.stroke();

  // Hand with raised index finger: the "dalilnya mana?" gesture.
  ctx.save();
  ctx.translate(wrist.x, wrist.y);
  ctx.rotate(-0.12 + wiggle * 0.01);
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.roundRect(-11, -92, 24, 70, 12);
  ctx.fill();
  strokeOutline(ctx, 7);
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  strokeOutline(ctx, 8);
  ctx.restore();
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
    ctx.fillStyle = '#18131c';
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

export function paintCharacter(ctx: CanvasRenderingContext2D, look: CharacterLook, drive: ToonDrive, seed: number): void {
  const pose = poseFor(drive, seed);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(TEXTURE_SCALE, 0, 0, TEXTURE_SCALE, 0, 0);
  // Weight shift + forward lean, pivoting at the feet (bottom centre).
  const leanScale = 1 + pose.lean * 0.045;
  ctx.translate(LW / 2 + pose.shiftX, LH);
  ctx.rotate(pose.shiftRot);
  ctx.scale(leanScale, leanScale);
  ctx.translate(-LW / 2, -LH);
  drawBody(ctx, look, pose);
  drawHead(ctx, look, pose, seed);
  drawArm(ctx, look, pose);

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

let sharedNormalMap: THREE.CanvasTexture | null = null;

/** Ellipsoid head + cylindrical torso normals so the billboard reacts to 3D lights. */
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
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px * s + s / 2;
      const y = py * s + s / 2;
      let nx = 0;
      let ny = 0;
      const hx = (x - HEAD_CX) / HEAD_HALF_W;
      const hy = (y - HEAD_CY) / HEAD_HALF_H;
      const r2 = hx * hx + hy * hy;
      if (r2 < 1.1) {
        const r = Math.sqrt(r2);
        const k = Math.min(r, 0.95) / Math.max(r, 1e-5);
        nx = hx * k * 0.9;
        ny = -hy * k * 0.9;
      } else if (y > TORSO_TOP) {
        const halfW = lerp(185, 250, clamp01((y - TORSO_TOP) / (LH - TORSO_TOP)));
        nx = Math.max(-0.95, Math.min(0.95, ((x - HEAD_CX) / halfW) * 0.8));
        ny = (1 - clamp01((y - TORSO_TOP) / 120)) * 0.5;
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

export interface ToonActor {
  id: CharacterId;
  /** Origin at the bottom-centre of the billboard. */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  update: (drive: ToonDrive, cameraWorldPosition: THREE.Vector3) => void;
  dispose: () => void;
}

export function createToonActor(id: CharacterId, options: { gradientMap: THREE.Texture | null; seed: number }): ToonActor {
  const look = CHARACTERS[id];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(LW * TEXTURE_SCALE);
  canvas.height = Math.round(LH * TEXTURE_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D context unavailable');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const geometry = new THREE.PlaneGeometry(ACTOR_PLANE_WIDTH, ACTOR_PLANE_HEIGHT);
  geometry.translate(0, ACTOR_PLANE_HEIGHT / 2, 0);
  const material = new THREE.MeshToonMaterial({
    map: texture,
    normalMap: normalMap(),
    normalScale: new THREE.Vector2(0.8, 0.8),
    gradientMap: options.gradientMap,
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `actor-${id}`;
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });

  const world = new THREE.Vector3();
  let lastKey = '';

  const update = (drive: ToonDrive, cam: THREE.Vector3): void => {
    const key = `${drive.frame}|${drive.viseme.open.toFixed(3)}|${drive.turn.toFixed(3)}|${drive.gesture.toFixed(3)}`;
    if (key !== lastKey) {
      paintCharacter(ctx, look, drive, options.seed);
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

  return { id, mesh, update, dispose };
}
