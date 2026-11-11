import * as THREE from 'three';
import type { ArmPose, BodyPose, Expression, HandProp, BodyProp } from '../cikajang/story';
import { hash01, type WordTiming } from '../persis/story';
import type { LookId } from './story';

/**
 * Full-figure bean-head cast for "Hukum Hotelling", built to the
 * `pyxis-beanhead-style` v2.3 master standard:
 *  - Persis bean head with warm facial charm & eye saccades,
 *  - Chibi proportions with shoes grounded at SOLE = 975 (y = 0),
 *  - Z-order arm layering (side arms behind torso, front poses in front),
 *  - Lip-sync visemes for Indonesian vowels A-I-U-E-O from words.json,
 *  - Lit MeshToonMaterial + normal map, paper grain, NOINK billboard card.
 */

const LW = 768;
const LH = 1024;
const TEXTURE_SCALE = 0.75;
const SOLE = 975;
export const ACTOR_PLANE_HEIGHT = 1.7;
export const ACTOR_PLANE_WIDTH = (ACTOR_PLANE_HEIGHT * LW) / LH;
const PX = LH / ACTOR_PLANE_HEIGHT;

const PLUM = '#241726';
const HEAD_CX = LW / 2;
const HEAD_HALF_W = 240;
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2;
const HEAD_SCALE = 118 / HEAD_HALF_W;
const HEAD_H_PX = HEAD_HALF_H * 2 * HEAD_SCALE;
const OUTLINE = 11;
const HIP_Y = SOLE - HEAD_H_PX * 1.35;
const TORSO_TOP = HIP_Y - HEAD_H_PX * 1.1;
const HEAD_CY = TORSO_TOP - HEAD_HALF_H * HEAD_SCALE + 8;

export const HEAD_CENTER_M = (SOLE - HEAD_CY) / PX;
export const HEAD_HALF_H_M = (HEAD_HALF_H * HEAD_SCALE) / PX;
export const HEAD_HALF_W_M = (HEAD_HALF_W * HEAD_SCALE) / PX;

type Headwear =
  | { kind: 'cap'; color: string }
  | { kind: 'hair'; style: 'short' | 'bun' | 'prof' };
type Outfit = 'polo' | 'jacket' | 'kaos';

interface HumanLook {
  kind: 'human';
  skin: string;
  skinShade: string;
  hair: string;
  headwear: Headwear;
  outfit: Outfit;
  cloth: string;
  clothShade: string;
  accent: string;
  apron?: string;
  mustache: boolean;
  glasses: boolean;
  lashes: boolean;
  browColor: string;
  bottomColor: string;
  shoeUpper: string;
  shoeSole: string;
}

interface AnimalLook {
  kind: 'animal';
  animal: 'kucing' | 'turis';
  fur: string;
  furShade: string;
}

type CharacterLook = HumanLook | AnimalLook;

export const LOOKS: Record<LookId, CharacterLook> = {
  pedagangBiru: {
    kind: 'human',
    skin: '#d9a77c',
    skinShade: '#b9805e',
    hair: '#1f1b24',
    headwear: { kind: 'cap', color: '#0284c7' },
    outfit: 'polo',
    cloth: '#f8fafc',
    clothShade: '#cbd5e1',
    accent: '#0284c7',
    apron: '#0284c7',
    mustache: false,
    glasses: false,
    lashes: false,
    browColor: '#1f1615',
    bottomColor: '#1e293b',
    shoeUpper: '#0284c7',
    shoeSole: '#ffffff',
  },
  pedagangMerah: {
    kind: 'human',
    skin: '#cf9a70',
    skinShade: '#ae7652',
    hair: '#231918',
    headwear: { kind: 'cap', color: '#e11d48' },
    outfit: 'polo',
    cloth: '#f8fafc',
    clothShade: '#cbd5e1',
    accent: '#e11d48',
    apron: '#e11d48',
    mustache: false,
    glasses: false,
    lashes: false,
    browColor: '#1f1615',
    bottomColor: '#1e293b',
    shoeUpper: '#e11d48',
    shoeSole: '#ffffff',
  },
  profesor: {
    kind: 'human',
    skin: '#dcae84',
    skinShade: '#bb8962',
    hair: '#64748b',
    headwear: { kind: 'hair', style: 'prof' },
    outfit: 'jacket',
    cloth: '#334155',
    clothShade: '#1e293b',
    accent: '#e11d48', // bowtie
    mustache: true,
    glasses: true,
    lashes: false,
    browColor: '#475569',
    bottomColor: '#1e293b',
    shoeUpper: '#3b2f2f',
    shoeSole: '#1a1414',
  },
  pembeli: {
    kind: 'human',
    skin: '#d6a074',
    skinShade: '#b47c55',
    hair: '#1f1b24',
    headwear: { kind: 'hair', style: 'short' },
    outfit: 'kaos',
    cloth: '#f59e0b',
    clothShade: '#d97706',
    accent: '#ffffff',
    mustache: false,
    glasses: false,
    lashes: false,
    browColor: '#1f1615',
    bottomColor: '#0284c7',
    shoeUpper: '#ffffff',
    shoeSole: '#1e293b',
  },
  turis: {
    kind: 'animal',
    animal: 'turis',
    fur: '#e2e8f0',
    furShade: '#94a3b8',
  },
  kucing: {
    kind: 'animal',
    animal: 'kucing',
    fur: '#f59e0b',
    furShade: '#b45309',
  },
};

// ── Expressions & Lip-Sync (AIUEO phonetics) ────────────────────────────────

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

export function visemeAt(words: readonly WordTiming[], frame: number, speaking: boolean): Viseme {
  if (!speaking || words.length === 0) return REST;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w && frame >= w.startFrame && frame <= w.endFrame) {
      const p = (frame - w.startFrame) / Math.max(1, w.endFrame - w.startFrame);
      const vowels = w.text.toLowerCase().match(/[aiueo]/g) ?? ['a'];
      const seg = p * vowels.length;
      const k = Math.min(vowels.length - 1, Math.floor(seg));
      const env = Math.pow(Math.sin(Math.PI * (seg - k)), 0.7);
      const v = VOWELS[vowels[k] ?? 'a'] ?? REST;
      return { open: v.open * (0.3 + 0.7 * env), width: v.width, round: v.round };
    }
  }
  return REST;
}

export function blinkAt(frame: number, seed: number): number {
  const period = 105;
  const k0 = Math.floor(frame / period);
  let amount = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const t0 = k * period + 14 + (hash01(seed, k) * 60);
    const d = frame - t0;
    if (d >= -2 && d <= 5) {
      const v = d < 0 ? (d + 2) / 2 : d <= 1 ? 1 : 1 - (d - 1) / 4;
      amount = Math.max(amount, v * v * (3 - 2 * v));
    }
  }
  return amount;
}

// ── Toon Actor Mesh ─────────────────────────────────────────────────────────

export interface ToonDrive {
  frame: number;
  expression: Expression;
  armL?: ArmPose;
  armR?: ArmPose;
  body?: BodyPose;
  handPropL?: HandProp;
  handPropR?: HandProp;
  bodyProp?: BodyProp;
  speaking?: boolean;
}

export class ToonActor {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly look: CharacterLook;
  private lastRendered = -1;

  constructor(lookId: LookId) {
    this.look = LOOKS[lookId] ?? LOOKS.pedagangBiru;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(LW * TEXTURE_SCALE);
    this.canvas.height = Math.round(LH * TEXTURE_SCALE);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context failed');
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const geo = new THREE.PlaneGeometry(ACTOR_PLANE_WIDTH, ACTOR_PLANE_HEIGHT);
    // Pivot at feet (sole = 975 -> y = 0)
    geo.translate(0, ACTOR_PLANE_HEIGHT / 2 - ((LH - SOLE) / PX), 0);

    const mat = new THREE.MeshToonMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
  }

  update(drive: ToonDrive, words: readonly WordTiming[], seed = 1): void {
    if (this.lastRendered === drive.frame) return;
    this.lastRendered = drive.frame;

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
    ctx.clearRect(0, 0, LW, LH);

    if (this.look.kind === 'animal') {
      this.drawAnimal(ctx, drive);
    } else {
      this.drawHuman(ctx, drive, words, seed);
    }

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  private drawHuman(
    ctx: CanvasRenderingContext2D,
    drive: ToonDrive,
    words: readonly WordTiming[],
    seed: number
  ): void {
    const l = this.look as HumanLook;
    const f = drive.frame;
    const s = f / 30;
    const blink = blinkAt(f, seed);
    const viseme = visemeAt(words, f, drive.speaking ?? false);

    // Natural breathing (0.22 Hz)
    const bp = 2 * Math.PI * 0.22 * s + seed;
    const breath = Math.sin(bp) * 4;

    // Head position
    const hx = HEAD_CX;
    const hy = HEAD_CY + breath * 0.4;

    // Body weight shift
    const weightShift = Math.sin(2 * Math.PI * 0.11 * s + seed) * 4;

    // 1. LEGS & SHOES (Grounded at SOLE = 975)
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = OUTLINE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const legLX = HEAD_CX - 36 + weightShift * 0.5;
    const legRX = HEAD_CX + 36 + weightShift * 0.5;

    // Trousers
    ctx.fillStyle = l.bottomColor;
    ctx.beginPath();
    ctx.roundRect(legLX - 22, HIP_Y, 44, SOLE - HIP_Y - 24, 12);
    ctx.roundRect(legRX - 22, HIP_Y, 44, SOLE - HIP_Y - 24, 12);
    ctx.fill();
    ctx.stroke();

    // Shoes
    ctx.fillStyle = l.shoeUpper;
    ctx.beginPath();
    ctx.ellipse(legLX - 8, SOLE - 14, 34, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(legRX + 8, SOLE - 14, 34, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Sole line
    ctx.fillStyle = l.shoeSole;
    ctx.beginPath();
    ctx.roundRect(legLX - 42, SOLE - 8, 70, 8, 4);
    ctx.roundRect(legRX - 28, SOLE - 8, 70, 8, 4);
    ctx.fill();
    ctx.stroke();

    // 2. ARMS BEHIND TORSO (Z-Order: Side arms drawn before torso)
    const armL = drive.armL ?? 'side';
    const armR = drive.armR ?? 'side';

    const shoulderLX = HEAD_CX - 72 + weightShift;
    const shoulderRX = HEAD_CX + 72 + weightShift;
    const shoulderY = TORSO_TOP + 38 + breath;

    ctx.lineWidth = 26;
    ctx.strokeStyle = l.cloth;

    // Left Arm (Behind)
    if (armL === 'side' || armL === 'hip' || armL === 'pocket') {
      ctx.beginPath();
      ctx.moveTo(shoulderLX, shoulderY);
      const handLX = armL === 'hip' ? shoulderLX - 38 : armL === 'pocket' ? shoulderLX + 12 : shoulderLX - 18;
      const handLY = armL === 'hip' ? HIP_Y - 20 : HIP_Y + 40;
      ctx.quadraticCurveTo(shoulderLX - 35, shoulderY + 80, handLX, handLY);
      ctx.stroke();
    }

    // Right Arm (Behind)
    if (armR === 'side' || armR === 'hip' || armR === 'pocket') {
      ctx.beginPath();
      ctx.moveTo(shoulderRX, shoulderY);
      const handRX = armR === 'hip' ? shoulderRX + 38 : armR === 'pocket' ? shoulderRX - 12 : shoulderRX + 18;
      const handRY = armR === 'hip' ? HIP_Y - 20 : HIP_Y + 40;
      ctx.quadraticCurveTo(shoulderRX + 35, shoulderY + 80, handRX, handRY);
      ctx.stroke();
    }

    // 3. TORSO & OUTFIT
    ctx.lineWidth = OUTLINE;
    ctx.fillStyle = l.cloth;
    ctx.beginPath();
    ctx.roundRect(HEAD_CX - 76 + weightShift, TORSO_TOP + breath, 152, HIP_Y - TORSO_TOP + 12, [24, 24, 18, 18]);
    ctx.fill();
    ctx.stroke();

    // Apron or jacket detail
    if (l.apron) {
      ctx.fillStyle = l.apron;
      ctx.beginPath();
      ctx.roundRect(HEAD_CX - 54 + weightShift, TORSO_TOP + 40 + breath, 108, HIP_Y - TORSO_TOP - 20, [12, 12, 6, 6]);
      ctx.fill();
      ctx.stroke();

      // Pocket on apron
      ctx.fillStyle = l.accent;
      ctx.fillRect(HEAD_CX - 32 + weightShift, HIP_Y - 50 + breath, 64, 38);
      ctx.strokeRect(HEAD_CX - 32 + weightShift, HIP_Y - 50 + breath, 64, 38);
    } else if (l.outfit === 'jacket') {
      // Lapel & Bowtie
      ctx.fillStyle = l.clothShade;
      ctx.beginPath();
      ctx.moveTo(HEAD_CX - 30 + weightShift, TORSO_TOP + breath);
      ctx.lineTo(HEAD_CX + weightShift, TORSO_TOP + 70 + breath);
      ctx.lineTo(HEAD_CX + 30 + weightShift, TORSO_TOP + breath);
      ctx.fill();
      ctx.stroke();

      // Red Bowtie
      ctx.fillStyle = l.accent;
      ctx.beginPath();
      ctx.ellipse(HEAD_CX - 14 + weightShift, TORSO_TOP + 28 + breath, 14, 8, -0.2, 0, Math.PI * 2);
      ctx.ellipse(HEAD_CX + 14 + weightShift, TORSO_TOP + 28 + breath, 14, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 4. ARMS IN FRONT (Front poses: point, wave, pointHigh)
    if (armL === 'point' || armL === 'wave' || armL === 'pointHigh') {
      ctx.lineWidth = 26;
      ctx.strokeStyle = l.cloth;
      ctx.beginPath();
      ctx.moveTo(shoulderLX, shoulderY);
      const hY = armL === 'pointHigh' ? shoulderY - 80 : shoulderY + 20;
      ctx.quadraticCurveTo(shoulderLX - 50, shoulderY - 20, shoulderLX - 80, hY);
      ctx.stroke();
      // Mitten
      ctx.fillStyle = l.skin;
      ctx.beginPath();
      ctx.arc(shoulderLX - 80, hY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (armR === 'point' || armR === 'wave' || armR === 'pointHigh') {
      ctx.lineWidth = 26;
      ctx.strokeStyle = l.cloth;
      ctx.beginPath();
      ctx.moveTo(shoulderRX, shoulderY);
      const hY = armR === 'pointHigh' ? shoulderY - 80 : armR === 'wave' ? shoulderY - 60 : shoulderY + 20;
      const hX = armR === 'wave' ? shoulderRX + 70 : shoulderRX + 80;
      ctx.quadraticCurveTo(shoulderRX + 50, shoulderY - 20, hX, hY);
      ctx.stroke();
      // Mitten
      ctx.fillStyle = l.skin;
      ctx.beginPath();
      ctx.arc(hX, hY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 5. HEAD (Persis Superellipse Bean-Head)
    ctx.lineWidth = OUTLINE;
    ctx.fillStyle = l.skin;

    ctx.beginPath();
    // Superellipse pointed-crown Persis head
    const rx = HEAD_HALF_W * HEAD_SCALE;
    const ry = HEAD_HALF_H * HEAD_SCALE;
    ctx.ellipse(hx + weightShift * 0.3, hy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cheek blush
    ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
    ctx.beginPath();
    ctx.ellipse(hx - 58 + weightShift * 0.3, hy + 26, 20, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + 58 + weightShift * 0.3, hy + 26, 20, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Headwear
    if (l.headwear.kind === 'cap') {
      ctx.fillStyle = l.headwear.color;
      ctx.beginPath();
      ctx.arc(hx + weightShift * 0.3, hy - 40, rx + 4, Math.PI, 0);
      ctx.fill();
      ctx.stroke();

      // Visor
      ctx.beginPath();
      ctx.ellipse(hx + 28 + weightShift * 0.3, hy - 36, 48, 12, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (l.headwear.kind === 'hair' && l.headwear.style === 'prof') {
      // Professor gray hair sides
      ctx.fillStyle = l.hair;
      ctx.beginPath();
      ctx.ellipse(hx - rx - 2 + weightShift * 0.3, hy - 10, 18, 36, 0.1, 0, Math.PI * 2);
      ctx.ellipse(hx + rx + 2 + weightShift * 0.3, hy - 10, 18, 36, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Eyes with micro saccades
    const saccade = (hash01(seed + 12, Math.floor((f + seed * 5) / 36)) - 0.5) * 4;
    const eyeLX = hx - 34 + weightShift * 0.3 + saccade;
    const eyeRX = hx + 34 + weightShift * 0.3 + saccade;
    const eyeY = hy + 8;

    if (blink > 0.7) {
      // Closed eye slit
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(eyeLX - 14, eyeY);
      ctx.lineTo(eyeLX + 14, eyeY);
      ctx.moveTo(eyeRX - 14, eyeY);
      ctx.lineTo(eyeRX + 14, eyeY);
      ctx.stroke();
    } else {
      // Big friendly cartoon eyes
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(eyeLX, eyeY, 18, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(eyeRX, eyeY, 18, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pupils
      ctx.fillStyle = PLUM;
      ctx.beginPath();
      ctx.arc(eyeLX + 2, eyeY, 8, 0, Math.PI * 2);
      ctx.arc(eyeRX + 2, eyeY, 8, 0, Math.PI * 2);
      ctx.fill();

      // Eye catchlight sparkle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeLX, eyeY - 4, 3, 0, Math.PI * 2);
      ctx.arc(eyeRX, eyeY - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glasses for professor
    if (l.glasses) {
      ctx.strokeStyle = PLUM;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(eyeLX, eyeY, 26, 0, Math.PI * 2);
      ctx.arc(eyeRX, eyeY, 26, 0, Math.PI * 2);
      ctx.moveTo(eyeLX + 26, eyeY);
      ctx.lineTo(eyeRX - 26, eyeY);
      ctx.stroke();
    }

    // Eyebrows
    ctx.strokeStyle = l.browColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    const browTilt = drive.expression === 'shock' ? -12 : drive.expression === 'smirk' ? 6 : -3;
    ctx.moveTo(eyeLX - 18, eyeY - 30 + browTilt);
    ctx.lineTo(eyeLX + 18, eyeY - 30 - browTilt);
    ctx.moveTo(eyeRX - 18, eyeY - 30 - browTilt);
    ctx.lineTo(eyeRX + 18, eyeY - 30 + browTilt);
    ctx.stroke();

    // Mouth with AIUEO lip-sync
    const mouthY = hy + 48;
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = 6;

    if (viseme.open > 0.08) {
      const mw = 22 * viseme.width;
      const mh = 18 * viseme.open;
      ctx.beginPath();
      ctx.ellipse(hx + weightShift * 0.3, mouthY, mw, mh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tongue
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(hx + weightShift * 0.3, mouthY + mh * 0.4, mw * 0.6, 0, Math.PI);
      ctx.fill();
    } else {
      // Smile / smirk curve
      ctx.beginPath();
      if (drive.expression === 'smirk') {
        ctx.moveTo(hx - 14 + weightShift * 0.3, mouthY);
        ctx.quadraticCurveTo(hx + 4 + weightShift * 0.3, mouthY + 12, hx + 22 + weightShift * 0.3, mouthY - 4);
      } else {
        ctx.moveTo(hx - 18 + weightShift * 0.3, mouthY - 2);
        ctx.quadraticCurveTo(hx + weightShift * 0.3, mouthY + 10, hx + 18 + weightShift * 0.3, mouthY - 2);
      }
      ctx.stroke();
    }
  }

  private drawAnimal(ctx: CanvasRenderingContext2D, drive: ToonDrive): void {
    const s = drive.frame / 30;
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    // Cute curling cat on ground
    const cx = HEAD_CX;
    const cy = SOLE - 35;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 55, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cat head
    ctx.beginPath();
    ctx.arc(cx - 38, cy - 14, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears
    ctx.beginPath();
    ctx.moveTo(cx - 52, cy - 30);
    ctx.lineTo(cx - 42, cy - 48);
    ctx.lineTo(cx - 32, cy - 32);
    ctx.fill();
    ctx.stroke();

    // Tail swish
    const tailSwish = Math.sin(s * 2.2) * 12;
    ctx.beginPath();
    ctx.moveTo(cx + 45, cy);
    ctx.quadraticCurveTo(cx + 80, cy - 25 + tailSwish, cx + 70, cy - 50);
    ctx.stroke();
  }
}
