import * as THREE from 'three';
import type { ArmPose, Expression, HandProp, BodyProp, LookId } from './story';
import { clamp01, hash01, lerp, smoothstep } from './story';

/**
 * Bean-head cast for "Sejarah Cikajang" — built to the `pyxis-beanhead-style`
 * skill (skills/pyxis-beanhead-style/SKILL.md), i.e. the same construction as
 * the Persis cast (src/persis/toon.ts):
 *
 *  - waist-up bust billboard, 768 × 1024 canvas, 0.9 × 1.2 m plane,
 *  - `traceBeanHead` superellipse head (HEAD_HALF_W 240, ratio 0.94), plum ink,
 *  - lit MeshToonMaterial + ellipsoid/cylinder normal map so 3D lights fall on it,
 *  - clean cartoon mitten hands on smooth rubber-hose arms (one bezier from
 *    shoulder to wrist — no jointed pipes). Both arms are always painted; a
 *    gesture only moves the wrist target, so hands never pop in or vanish.
 *
 * Every value is a pure function of the frame so any frame renders on its own.
 */

// ── Canvas & proportions (pyxis-beanhead-style) ─────────────────────────────

const LW = 768;
const LH = 1024;
const TEXTURE_SCALE = 0.75;
export const ACTOR_PLANE_WIDTH = 0.9;
export const ACTOR_PLANE_HEIGHT = 1.2;
const PX = LH / ACTOR_PLANE_HEIGHT;

const PLUM = '#241726';
const HEAD_CX = LW / 2;
const HEAD_CY = 380;
const HEAD_HALF_W = 240;
/** Head bounding box height/width = 0.94 (pointed-crown superellipse). */
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2;
const OUTLINE = 11;
const TORSO_TOP = HEAD_CY + 190;
/** Hand centres stay this far inside the canvas so mittens and props never clip. */
const HAND_MARGIN = 56;

/** Canvas line where a desk top meets the bust (writing poses). */
const DESK_Y = 760;
/** Height of that desk line above the billboard origin, in metres at scale 1. */
export const DESK_LINE = (LH - DESK_Y) / PX;

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
  ...l,
});

export const LOOKS: Record<LookId, Look> = {
  dinda: human({ skin: '#e2b088', headwear: { kind: 'hijab', color: '#d9a441' }, outfit: 'jacket', cloth: '#5b7fb5', accent: '#fbf8f1', browColor: '#3a2620', pack: '#c4553d' }),
  petani: human({ skin: '#b97f57', headwear: { kind: 'caping', color: '#d8b878' }, outfit: 'lurik', cloth: '#6b5a44', mustache: true }),
  kepalaStasiun: human({ skin: '#d6a074', headwear: { kind: 'stationCap', color: '#f1ece0' }, outfit: 'uniform', cloth: '#ece5d3', accent: '#c9a14a', mustache: true, glasses: true }),
  stafKoran: human({ skin: '#c99068', headwear: { kind: 'peci', tilt: 0.04 }, outfit: 'kemeja', cloth: '#d9cfb8' }),
  kondektur: human({ skin: '#cf9a70', headwear: { kind: 'kepi', color: '#2d3550', band: '#d9b45a' }, outfit: 'uniform', cloth: '#34405e', accent: '#d9b45a', mustache: true }),
  penumpangPria: human({ skin: '#c99068', headwear: { kind: 'hair', style: 'short' }, outfit: 'kemeja', cloth: '#e8e2d2' }),
  penumpangWanita: human({ skin: '#d9a77c', headwear: { kind: 'hair', style: 'bun' }, outfit: 'kebaya', cloth: '#d98c7a' }),
  ibuBakul: human({ skin: '#c48a62', headwear: { kind: 'hijab', color: '#7a8f6a' }, outfit: 'kebaya', cloth: '#c9b48a' }),
  bapakPeci: human({ skin: '#b98058', headwear: { kind: 'peci', tilt: 0 }, outfit: 'koko', cloth: '#f0ebe0', beard: 'goatee', mustache: true }),
  petugas1935: human({ skin: '#d0986e', headwear: { kind: 'stationCap', color: '#ece6d6' }, outfit: 'uniform', cloth: '#e8e0cc', accent: '#c9a14a' }),
  pekerjaRel: human({ skin: '#a87250', headwear: { kind: 'caping', color: '#cfae6e' }, outfit: 'kaos', cloth: '#8a6e4e' }),
  pekerjaRel2: human({ skin: '#b37a54', headwear: { kind: 'hair', style: 'short' }, outfit: 'lurik', cloth: '#5c4c3c', mustache: true }),
  petugas1980: human({ skin: '#cf9a70', headwear: { kind: 'kepi', color: '#3c4636', band: '#d8c070' }, outfit: 'uniform', cloth: '#8f9a7a', accent: '#d8c070', mustache: true, glasses: true }),
  petugas1982: human({ skin: '#c58f66', headwear: { kind: 'stationCap', color: '#d9d3c0' }, outfit: 'uniform', cloth: '#a19a7c', accent: '#d8c070' }),
  anak: human({ skin: '#d6a074', headwear: { kind: 'hair', style: 'kid' }, outfit: 'kaos', cloth: '#d65a4a' }),
  anakModern: human({ skin: '#d8a478', headwear: { kind: 'hair', style: 'kid' }, outfit: 'kaos', cloth: '#f2c230' }),
  warga: human({ skin: '#be855d', headwear: { kind: 'caping', color: '#d2b072' }, outfit: 'kebaya', cloth: '#8a7a5a' }),
  penumpangModern: human({ skin: '#cf9a70', headwear: { kind: 'cap', color: '#2e2e36' }, outfit: 'polo', cloth: '#3d8a8a' }),
  penumpangModern2: human({ skin: '#dcab80', headwear: { kind: 'hijab', color: '#c25a7a' }, outfit: 'kemeja', cloth: '#ece3d4', pack: '#3f5f8a' }),
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
}

export interface ActorSetup {
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
    bob: d.walkPhase === null ? 0 : Math.abs(Math.sin(d.walkPhase)) * -10,
    frame: f,
  };
}

// ── Shared paint helpers ────────────────────────────────────────────────────

type Pt = readonly [number, number];
/** [0] = character's right arm (screen left), [1] = character's left arm (screen right). */
const SIGN = [-1, 1] as const;

function strokeOutline(ctx: CanvasRenderingContext2D, width = OUTLINE): void {
  ctx.strokeStyle = PLUM;
  ctx.lineWidth = width;
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

// ── Body ────────────────────────────────────────────────────────────────────

interface Frame {
  cx: number;
  top: number;
  breathScale: number;
  headX: number;
  headY: number;
}

function frameFor(pose: Pose): Frame {
  const cx = HEAD_CX + pose.turn * 5;
  return {
    cx,
    top: TORSO_TOP + pose.breath + pose.bow * 6,
    breathScale: 1 + pose.breathOpen * 0.016,
    headX: HEAD_CX + pose.turn * 12,
    headY: HEAD_CY + pose.breathHead + pose.bow * 22,
  };
}

function drawPackBehind(ctx: CanvasRenderingContext2D, look: HumanLook, fr: Frame): void {
  if (!look.pack) return;
  // Backpack shoulders peeking out behind the bust.
  filled(ctx, () => ctx.roundRect(fr.cx - 226, fr.top - 46, 452, 380, 70), look.pack, 9);
  const g = ctx.createLinearGradient(fr.cx - 226, 0, fr.cx + 226, 0);
  g.addColorStop(0, 'rgba(255,230,200,0.25)');
  g.addColorStop(0.4, 'rgba(255,230,200,0)');
  g.addColorStop(1, 'rgba(30,10,20,0.35)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(fr.cx - 220, fr.top - 40, 440, 368, 64);
  ctx.fill();
}

function drawBody(ctx: CanvasRenderingContext2D, look: HumanLook, fr: Frame): void {
  const { cx, top, breathScale } = fr;
  ctx.fillStyle = look.skinShade;
  ctx.fillRect(cx - 40, HEAD_CY + 150, 80, 80);

  ctx.save();
  traceTorso(ctx, cx, top, breathScale);
  ctx.fillStyle = look.cloth;
  ctx.fill();
  ctx.clip();
  // Persis form shade on the far side.
  ctx.fillStyle = look.clothShade;
  ctx.beginPath();
  ctx.ellipse(cx + 260, top + 270, 150, 330, 0, 0, Math.PI * 2);
  ctx.fill();
  const lit = ctx.createLinearGradient(cx - 250, top, cx + 40, top + 300);
  lit.addColorStop(0, 'rgba(255, 238, 205, 0.18)');
  lit.addColorStop(1, 'rgba(255, 238, 205, 0)');
  ctx.fillStyle = lit;
  ctx.fillRect(cx - 260, top - 20, 300, LH - top + 40);

  const v = (w: number, depth: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx - w, top - 8);
    ctx.lineTo(cx, top + depth);
    ctx.lineTo(cx + w, top - 8);
    ctx.closePath();
  };
  switch (look.outfit) {
    case 'jacket': {
      // Washed denim: twill + fades, open over a white tee.
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 3;
      for (let k = -500; k < 500; k += 10) {
        ctx.beginPath();
        ctx.moveTo(cx + k, top - 20);
        ctx.lineTo(cx + k + 280, LH + 20);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(220, 235, 255, 0.16)';
      ctx.beginPath();
      ctx.ellipse(cx - 120, top + 260, 70, 160, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.moveTo(cx - 70, top - 8);
      ctx.lineTo(cx - 60, LH + 20);
      ctx.lineTo(cx + 60, LH + 20);
      ctx.lineTo(cx + 70, top - 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,190,175,0.6)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, top - 10, 56, 0.25, Math.PI - 0.25);
      ctx.stroke();
      // Lapels.
      ctx.fillStyle = look.clothShade;
      for (const s of SIGN) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 70, top - 8);
        ctx.lineTo(cx + s * 64, top + 200);
        ctx.lineTo(cx + s * 140, top + 70);
        ctx.closePath();
        ctx.fill();
      }
      // Chest pockets, rivets, stitching.
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 6;
      for (const s of SIGN) {
        ctx.strokeRect(cx + s * 150 - 46, top + 150, 92, 70);
        ctx.fillStyle = '#c98a3a';
        ctx.beginPath();
        ctx.arc(cx + s * 150 - s * 38, top + 160, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#e8c27a';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      for (const s of SIGN) {
        ctx.moveTo(cx + s * 80, top + 10);
        ctx.lineTo(cx + s * 74, LH);
        ctx.moveTo(cx + s * 230, top + 120);
        ctx.quadraticCurveTo(cx + s * 160, top + 135, cx + s * 100, top + 128);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (const s of SIGN) {
        ctx.moveTo(cx + s * 70, top - 8);
        ctx.lineTo(cx + s * 62, LH + 20);
      }
      ctx.stroke();
      break;
    }
    case 'uniform': {
      ctx.fillStyle = look.accent;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, top + 70 + i * 82, 11, 0, Math.PI * 2);
        ctx.fill();
        strokeOutline(ctx, 4);
      }
      ctx.strokeStyle = look.clothShade;
      ctx.lineWidth = 6;
      for (const s of SIGN) {
        ctx.strokeRect(cx + s * 120 - 50, top + 150, 100, 86);
        ctx.fillStyle = look.clothShade;
        ctx.fillRect(cx + s * 120 - 54, top + 146, 108, 24);
      }
      // Stand collar.
      filled(ctx, () => ctx.roundRect(cx - 80, top - 22, 160, 40, 12), look.cloth, 7);
      ctx.fillStyle = look.accent;
      for (const s of SIGN) {
        ctx.beginPath();
        ctx.arc(cx + s * 58, top - 2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'kebaya': {
      v(78, 210);
      ctx.fillStyle = look.skinShade;
      ctx.fill();
      ctx.fillStyle = '#f7efe2';
      for (const s of SIGN) {
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          ctx.beginPath();
          ctx.arc(cx + s * lerp(82, 6, t), lerp(top - 4, top + 210, t), 11, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#d9b45a';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, top + 240 + i * 60, 12, 0, Math.PI * 2);
        ctx.fill();
        strokeOutline(ctx, 4);
      }
      break;
    }
    case 'koko': {
      ctx.fillStyle = look.clothShade;
      ctx.fillRect(cx - 4, top + 10, 8, 420);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx + 12, top + 70 + i * 70, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lurik': {
      ctx.strokeStyle = shade(look.cloth, -0.35);
      ctx.lineWidth = 8;
      for (let x = cx - 260; x < cx + 260; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, top - 20);
        ctx.lineTo(x, LH + 20);
        ctx.stroke();
      }
      v(60, 120);
      ctx.fillStyle = look.skinShade;
      ctx.fill();
      break;
    }
    case 'kemeja':
    case 'polo': {
      ctx.fillStyle = PLUM;
      for (let i = 0; i < (look.outfit === 'polo' ? 2 : 4); i++) {
        ctx.beginPath();
        ctx.arc(cx + 10, top + 60 + i * 76, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = look.clothShade;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, top + 20);
      ctx.lineTo(cx, look.outfit === 'polo' ? top + 200 : LH);
      ctx.stroke();
      break;
    }
    case 'kaos': {
      ctx.fillStyle = look.skinShade;
      ctx.beginPath();
      ctx.ellipse(cx, top - 6, 64, 34, 0, 0, Math.PI);
      ctx.fill();
      break;
    }
  }
  ctx.restore();

  traceTorso(ctx, cx, top, breathScale);
  strokeOutline(ctx);
  // Collars on top of the outline.
  if (look.outfit === 'kemeja' || look.outfit === 'polo') {
    for (const s of SIGN) {
      filled(ctx, () => {
        ctx.moveTo(cx + s * 6, top - 10);
        ctx.lineTo(cx + s * 92, top - 18);
        ctx.lineTo(cx + s * 44, top + 64);
        ctx.closePath();
      }, shade(look.cloth, 0.12), 6);
    }
  } else if (look.outfit === 'koko') {
    filled(ctx, () => ctx.roundRect(cx - 66, top - 18, 132, 34, 12), look.cloth, 7);
  }
  if (look.pack) {
    // Backpack straps with buckles over both shoulders.
    for (const s of SIGN) {
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + s * 128, top - 2);
      ctx.quadraticCurveTo(cx + s * 150, top + 200, cx + s * 140, LH + 10);
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 40;
      ctx.stroke();
      ctx.strokeStyle = shade(look.pack, -0.18);
      ctx.lineWidth = 28;
      ctx.stroke();
      filled(ctx, () => ctx.roundRect(cx + s * 148 - 20, top + 210, 40, 26, 5), '#cfcac0', 5);
    }
  }
}

// ── Head ────────────────────────────────────────────────────────────────────

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

/** Hijab back layer: hood that hugs the bean contour + soft drape over the chest. */
function drawHijabBack(ctx: CanvasRenderingContext2D, color: string): void {
  const torsoTop = TORSO_TOP - HEAD_CY;
  ctx.beginPath();
  ctx.moveTo(-HEAD_HALF_W * 1.06, 0);
  ctx.bezierCurveTo(-HEAD_HALF_W * 1.12, torsoTop + 40, -HEAD_HALF_W * 0.95, torsoTop + 150, -HEAD_HALF_W * 0.62, torsoTop + 210);
  ctx.quadraticCurveTo(0, torsoTop + 270, HEAD_HALF_W * 0.62, torsoTop + 210);
  ctx.bezierCurveTo(HEAD_HALF_W * 0.95, torsoTop + 150, HEAD_HALF_W * 1.12, torsoTop + 40, HEAD_HALF_W * 1.06, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(-HEAD_HALF_W, 0, HEAD_HALF_W, torsoTop + 260);
  g.addColorStop(0, shade(color, 0.14));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.24));
  ctx.fillStyle = g;
  ctx.fill();
  strokeOutline(ctx);
  // Soft drape folds.
  ctx.strokeStyle = shade(color, -0.3);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-HEAD_HALF_W * 0.7, torsoTop + 60);
  ctx.quadraticCurveTo(-HEAD_HALF_W * 0.55, torsoTop + 140, -HEAD_HALF_W * 0.62, torsoTop + 196);
  ctx.moveTo(HEAD_HALF_W * 0.72, torsoTop + 50);
  ctx.quadraticCurveTo(HEAD_HALF_W * 0.5, torsoTop + 140, HEAD_HALF_W * 0.6, torsoTop + 196);
  ctx.moveTo(-HEAD_HALF_W * 0.3, torsoTop + 200);
  ctx.quadraticCurveTo(0, torsoTop + 236, HEAD_HALF_W * 0.3, torsoTop + 200);
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
  ctx.rotate(pose.tilt);
  const hijab = look.headwear.kind === 'hijab' ? look.headwear.color : null;
  const fx = pose.turn * 72;
  if (hijab) drawHijabBack(ctx, hijab);
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
  // Warm blush.
  ctx.fillStyle = hijab ? 'rgba(232, 108, 110, 0.36)' : 'rgba(214, 100, 100, 0.28)';
  ctx.beginPath();
  ctx.ellipse(lx - 12, eyeY + 76, 32 * sL, 15, 0, 0, Math.PI * 2);
  ctx.ellipse(rx + 12, eyeY + 76, 32 * sR, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(fx * 1.15 + 4, eyeY + 40);
  ctx.quadraticCurveTo(fx * 1.15 + 22, eyeY + 72, fx * 1.15 - 6, eyeY + 78);
  ctx.strokeStyle = look.skinShade;
  ctx.lineWidth = 7;
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
  ctx.restore();
}

// ── Arms: rubber-hose sleeves + cartoon mittens ─────────────────────────────

/** Descending ridership line on the lap board, board-relative 0..1. */
const GRAPH: readonly Pt[] = [[0.08, 0.18], [0.24, 0.24], [0.38, 0.2], [0.52, 0.42], [0.66, 0.5], [0.8, 0.72], [0.93, 0.86]];
const BOARD_W = 300;
const BOARD_H = 210;
const NOTE_LINES = 5;

function boardRect(fr: Frame): { x: number; y: number } {
  return { x: fr.cx - BOARD_W / 2, y: fr.top + 150 };
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
  return [cx - 130 + (p - line) * 100 + Math.sin(frame * 1.7) * 3, DESK_Y - 52 + line * 9 + Math.sin(frame * 2.3) * 1.5];
}

interface ArmCtx {
  fr: Frame;
  frame: number;
  progress: number;
  drawProgress: number;
  mouth: Pt;
}

function shoulderOf(side: 0 | 1, fr: Frame): Pt {
  return [fr.cx + SIGN[side] * 168, fr.top + 64];
}

/** Wrist target for a named pose (canvas px). */
function wristTarget(pose: ArmPose, side: 0 | 1, c: ArmCtx): Pt {
  const s = SIGN[side];
  const { fr, frame } = c;
  const { cx, top } = fr;
  const at = (out: number, y: number): Pt => [cx + s * out, y];
  switch (pose) {
    case 'side':
    case 'lap':
    case 'knee':
      return at(196 + Math.sin(frame * 0.05 + side) * 3, LH - 70);
    case 'hip':
      return at(228, top + 220);
    case 'strap':
      return at(112, top + 230);
    case 'pocket':
      return at(140, LH - 96);
    case 'point':
      return at(300, top - 10);
    case 'pointHigh':
      return at(270, HEAD_CY - 30);
    case 'pointSide':
      return at(296, top + 70);
    case 'spread':
      return at(300, top + 10);
    case 'trace':
      return at(296 + Math.sin(frame * 0.06) * 8, top + 40 + Math.sin(frame * 0.11) * 6);
    case 'traceLow':
      return at(290 + Math.sin(frame * 0.06) * 8, top + 150 + Math.sin(frame * 0.1) * 5);
    case 'palm':
      return at(262 + Math.sin(frame * 0.07 + side) * 6, top + 90 + Math.sin(frame * 0.05) * 6);
    case 'write': {
      const [wx, wy] = notebookWritePoint(cx, frame, c.progress);
      return [wx - 16, wy - 40];
    }
    case 'pressPage':
      return at(90, DESK_Y - 34);
    case 'chalk': {
      const r = boardRect(fr);
      const [u, v] = polylineAt(GRAPH, c.drawProgress);
      return [r.x + u * BOARD_W - 12, r.y + v * BOARD_H - 22];
    }
    case 'holdBoard': {
      const r = boardRect(fr);
      return [cx + s * (BOARD_W / 2 + 6), r.y + BOARD_H * 0.55];
    }
    case 'whistle':
      return [c.mouth[0] + s * 46, c.mouth[1] + 16];
    case 'lampLow':
      return at(226, top + 260);
    case 'hammer': {
      const cyc = ((((frame + side * 7) % 26) + 26) % 26) / 26;
      const raise = cyc < 0.72 ? smoothstep(0, 0.72, cyc) : 1 - smoothstep(0.72, 0.84, cyc);
      const strike = at(230, LH - 110);
      const up = at(272, top - 70);
      return [lerp(strike[0], up[0], raise), lerp(strike[1], up[1], raise)];
    }
    case 'carryShoulder':
      return at(196, top - 40);
    case 'hug':
      return at(118, LH - 190);
    case 'basketLap':
      return at(170, LH - 170);
    case 'suitcase':
      return at(232, top + 250);
    case 'ticket':
      return at(130, top + 150);
    case 'newspaper':
      return at(214, top + 150);
    case 'reachUp':
      return at(236, HEAD_CY - 170);
    case 'wave':
      return at(262 + Math.sin(frame * 0.35) * 18, HEAD_CY - 70);
  }
}

interface ArmShape {
  shoulder: Pt;
  ctrl: Pt;
  wrist: Pt;
}

/** One smooth quadratic curve; the closer the wrist, the more the elbow bows outward. */
function shapeArm(side: 0 | 1, raw: Pt, fr: Frame): ArmShape {
  const s = SIGN[side];
  const shoulder = shoulderOf(side, fr);
  const wrist: Pt = [Math.min(LW - HAND_MARGIN, Math.max(HAND_MARGIN, raw[0])), Math.max(HAND_MARGIN, raw[1])];
  const dx = wrist[0] - shoulder[0];
  const dy = wrist[1] - shoulder[1];
  const d = Math.max(1, Math.hypot(dx, dy));
  const bow = Math.max(0, Math.min(150, (360 - d) * 0.55)) + 18;
  // Perpendicular pointing away from the body centre.
  let px = -dy / d;
  let py = dx / d;
  if (px * s < 0 || (Math.abs(px) < 0.2 && py > 0)) {
    px = -px;
    py = -py;
  }
  const mid: Pt = [(shoulder[0] + wrist[0]) / 2, (shoulder[1] + wrist[1]) / 2];
  return { shoulder, wrist, ctrl: [mid[0] + px * bow, mid[1] + py * bow] };
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

function drawArm(ctx: CanvasRenderingContext2D, look: HumanLook, arm: ArmShape, shape: HandShape, s: number, pocket: boolean): void {
  const q: [Pt, Pt, Pt] = [arm.shoulder, arm.ctrl, arm.wrist];
  const short = look.outfit === 'kaos' || look.outfit === 'polo';
  hose(ctx, q, 70, short ? look.skin : look.cloth);
  if (short) hose(ctx, splitQuad(arm.shoulder, arm.ctrl, arm.wrist, 0.42).first, 84, look.cloth);
  else {
    // Cuff band just before the wrist.
    const cuff = splitQuad(arm.shoulder, arm.ctrl, arm.wrist, 0.88).second;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cuff[0][0], cuff[0][1]);
    ctx.quadraticCurveTo(cuff[1][0], cuff[1][1], cuff[2][0], cuff[2][1]);
    ctx.strokeStyle = look.clothShade;
    ctx.lineWidth = 70;
    ctx.stroke();
  }
  drawMitten(ctx, look, arm, pocket ? 'fist' : shape, s);
  if (pocket) filled(ctx, () => ctx.roundRect(arm.wrist[0] - 52, arm.wrist[1] - 6, 104, 54, 12), look.cloth, 7);
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

function drawBodyProp(ctx: CanvasRenderingContext2D, prop: BodyProp, fr: Frame, frame: number, progress: number, drawProgress: number): void {
  const { cx, top } = fr;
  switch (prop) {
    case 'none':
    case 'backpack':
      return;
    case 'shoulderBasket': {
      const bx = cx - 210;
      const by = top - 70;
      for (let k = 0; k < 5; k++) filled(ctx, () => ctx.ellipse(bx - 64 + k * 32, by - 54 - (k % 2) * 14, 30, 26, 0, 0, Math.PI * 2), k % 2 ? '#5f9a3a' : '#7cb446', 6);
      filled(ctx, () => ctx.ellipse(bx + 50, by - 60, 14, 38, 0.5, 0, Math.PI * 2), '#e07a2a', 5);
      const basket = (): void => {
        ctx.moveTo(bx - 110, by - 44);
        ctx.lineTo(bx + 110, by - 44);
        ctx.lineTo(bx + 82, by + 80);
        ctx.quadraticCurveTo(bx, by + 98, bx - 82, by + 80);
        ctx.closePath();
      };
      filled(ctx, basket, '#b88a4a', 9);
      weave(ctx, bx - 100, by - 40, 200, 116);
      return;
    }
    case 'lapSack': {
      const y = LH - 170;
      for (let k = 0; k < 3; k++) filled(ctx, () => ctx.ellipse(cx - 40 + k * 40, y - 130 - (k % 2) * 12, 28, 32, 0, 0, Math.PI * 2), '#6fa844', 6);
      filled(ctx, () => {
        ctx.moveTo(cx - 60, y - 112);
        ctx.quadraticCurveTo(cx, y - 92, cx + 60, y - 112);
        ctx.quadraticCurveTo(cx + 150, y - 30, cx + 130, y + 80);
        ctx.quadraticCurveTo(cx, y + 112, cx - 130, y + 80);
        ctx.quadraticCurveTo(cx - 150, y - 30, cx - 60, y - 112);
        ctx.closePath();
      }, '#c8a66e', 9);
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx - 54, y - 94);
      ctx.lineTo(cx + 54, y - 94);
      ctx.stroke();
      return;
    }
    case 'lapBakul': {
      const y = LH - 160;
      ['#e0742a', '#6fa844', '#d8c24a', '#9a3a2a'].forEach((c, k) => filled(ctx, () => ctx.ellipse(cx - 84 + k * 56, y - 62, 34, 28, 0, 0, Math.PI * 2), c, 6));
      filled(ctx, () => {
        ctx.moveTo(cx - 160, y - 52);
        ctx.lineTo(cx + 160, y - 52);
        ctx.lineTo(cx + 124, y + 64);
        ctx.quadraticCurveTo(cx, y + 82, cx - 124, y + 64);
        ctx.closePath();
      }, '#c09656', 9);
      weave(ctx, cx - 150, y - 48, 300, 108);
      return;
    }
    case 'lapBoard': {
      const r = boardRect(fr);
      filled(ctx, () => ctx.roundRect(r.x - 16, r.y - 16, BOARD_W + 32, BOARD_H + 32, 12), '#7a5030', 9);
      ctx.fillStyle = '#2c3a32';
      ctx.fillRect(r.x, r.y, BOARD_W, BOARD_H);
      ctx.strokeStyle = 'rgba(240,240,230,0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(r.x + 18, r.y + 12);
      ctx.lineTo(r.x + 18, r.y + BOARD_H - 14);
      ctx.lineTo(r.x + BOARD_W - 12, r.y + BOARD_H - 14);
      ctx.stroke();
      ctx.strokeStyle = '#f4f1ea';
      ctx.lineWidth = 7;
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
      const x = cx - 200;
      const y = top + 70;
      filled(ctx, () => {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 400, y - 8);
        ctx.lineTo(x + 394, y + 290);
        ctx.lineTo(x + 6, y + 298);
        ctx.closePath();
      }, '#ece2c8', 9);
      ctx.fillStyle = '#2a2420';
      ctx.textAlign = 'center';
      ctx.font = '800 46px Georgia, serif';
      ctx.fillText('DE KOERIER', cx, y + 54);
      ctx.font = '700 22px Georgia, serif';
      ctx.fillText('31 JULI 1930', cx, y + 86);
      ctx.font = '800 26px Georgia, serif';
      ctx.fillText('LIJN GAROET–TJIKADJANG', cx, y + 126);
      ctx.fillText('GEOPEND', cx, y + 158);
      ctx.fillStyle = 'rgba(42,36,32,0.45)';
      for (let k = 0; k < 7; k++) {
        ctx.fillRect(x + 28, y + 184 + k * 14, 160, 7);
        ctx.fillRect(x + 212, y + 184 + k * 14, 160, 7);
      }
      return;
    }
    case 'deskNotebook': {
      // Open ledger lying on the desk line (entirely above DESK_Y so the desk never hides it).
      filled(ctx, () => {
        ctx.moveTo(cx - 150, DESK_Y - 66);
        ctx.lineTo(cx + 150, DESK_Y - 66);
        ctx.lineTo(cx + 168, DESK_Y - 4);
        ctx.lineTo(cx - 168, DESK_Y - 4);
        ctx.closePath();
      }, '#f2ead6', 8);
      ctx.strokeStyle = 'rgba(60,40,30,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, DESK_Y - 66);
      ctx.lineTo(cx, DESK_Y - 4);
      ctx.stroke();
      const p = clamp01(progress) * NOTE_LINES;
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = 3.5;
      for (let line = 0; line < NOTE_LINES; line++) {
        const done = clamp01(p - line);
        if (done <= 0) break;
        ctx.beginPath();
        const y0 = DESK_Y - 52 + line * 9;
        for (let k = 0; k <= 24 * done; k++) {
          const x = cx - 130 + (k / 24) * 100;
          const y = y0 + Math.sin(k * 1.9 + line + frame * 0) * 2;
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

const SOLE = LH - 8;

function paintCritter(ctx: CanvasRenderingContext2D, look: CritterLook, frame: number, walkPhase: number | null, dir: number, blink: number): void {
  const CX = HEAD_CX;
  ctx.save();
  if (dir < 0) {
    ctx.translate(LW, 0);
    ctx.scale(-1, 1);
  }
  ctx.translate(CX, SOLE);
  ctx.scale(1.6, 1.6);
  ctx.translate(-CX, -SOLE);
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

// ── Character assembly ──────────────────────────────────────────────────────

function solve(d: ToonDrive, seed: number): { pose: Pose; fr: Frame; right: ArmShape; left: ArmShape } {
  const pose = poseFor(d, seed);
  const fr = frameFor(pose);
  const mouth: Pt = [fr.headX + pose.turn * 72 * 1.1, fr.headY + pose.lookY * 8 + pose.bow * 16 + 114];
  const c: ArmCtx = { fr, frame: d.frame, progress: d.progress, drawProgress: d.drawProgress, mouth };
  const arm = (side: 0 | 1, b: ArmBlend): ArmShape => {
    const a = wristTarget(b.from, side, c);
    const z = wristTarget(b.to, side, c);
    return shapeArm(side, [lerp(a[0], z[0], b.mix), lerp(a[1], z[1], b.mix)], fr);
  };
  return { pose, fr, right: arm(0, d.armRight), left: arm(1, d.armLeft) };
}

/** Head, chest, shoulder and wrist positions in billboard-local metres at scale 1 (x right, y up from the base). Pure. */
export function poseLayout(d: ToonDrive, seed = 1): { head: Pt; chest: Pt; shoulders: readonly [Pt, Pt]; hands: readonly [Pt, Pt] } {
  const { fr, right, left } = solve(d, seed);
  const w = (p: Pt): Pt => [(p[0] - HEAD_CX) / PX, (LH - p[1]) / PX];
  return { head: w([fr.headX, fr.headY]), chest: w([fr.cx, fr.top + 120]), shoulders: [w(right.shoulder), w(left.shoulder)], hands: [w(right.wrist), w(left.wrist)] };
}

function paintHuman(ctx: CanvasRenderingContext2D, look: HumanLook, setup: ActorSetup, d: ToonDrive, seed: number): void {
  const { pose, fr, right, left } = solve(d, seed);
  // Weight shift pivoting at the base, plus a gentle walking bob.
  ctx.translate(LW / 2 + pose.shiftX, LH);
  ctx.rotate(pose.shiftRot);
  ctx.translate(-LW / 2, -LH + pose.bob);
  drawPackBehind(ctx, look, fr);
  drawBody(ctx, look, fr);
  if (setup.bodyProp === 'shoulderBasket') drawBodyProp(ctx, setup.bodyProp, fr, d.frame, d.progress, d.drawProgress);
  drawHead(ctx, look, pose, fr);
  if (setup.bodyProp !== 'shoulderBasket') drawBodyProp(ctx, setup.bodyProp, fr, d.frame, d.progress, d.drawProgress);
  const shapes = [handShapeFor(d.armRight), handShapeFor(d.armLeft)] as const;
  const pockets = [d.armRight, d.armLeft].map((b) => (b.mix < 0.5 ? b.from : b.to) === 'pocket');
  const below = (p: HandProp): boolean => p === 'suitcase' || p === 'signalLamp';
  for (const [arm, prop, side] of [[right, setup.rightProp, 0], [left, setup.leftProp, 1]] as const) {
    if (below(prop)) drawHandProp(ctx, prop, arm, SIGN[side], d.frame);
    drawArm(ctx, look, arm, prop === 'none' ? shapes[side] : 'fist', SIGN[side], pockets[side] ?? false);
    if (!below(prop)) drawHandProp(ctx, prop, arm, SIGN[side], d.frame);
  }
}

// ── Lit billboard actor ─────────────────────────────────────────────────────

export interface ToonActor {
  id: LookId;
  /** Origin at the bottom-centre of the billboard (the base of the bust). */
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
  geometry.translate(0, ACTOR_PLANE_HEIGHT / 2, 0);
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
