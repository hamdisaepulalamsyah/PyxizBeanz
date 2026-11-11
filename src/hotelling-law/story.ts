import * as THREE from 'three';
import { clamp01, lerp, smoothstep } from '../persis/story';
import type { ArmPose, BodyPose, Expression, HandProp, BodyProp, Vec3 } from '../cikajang/story';

export {
  CAPTION_FRAMING,
  activeWordIndex,
  buildCaptionPages,
  captionPageAt,
  clamp01,
  easeInCubic,
  easeInOutSine,
  easeOutCubic,
  hash01,
  keyed,
  lerp,
  parseSentences,
  parseWords,
  smoothstep,
  windowEnvelope,
} from '../persis/story';
export type { CaptionPage, SentenceTiming, Vec3, WordTiming } from '../persis/story';

export const HOTELLING_FPS = 30;
export const HOTELLING_DURATION_IN_FRAMES = 1800;
export const HOTELLING_WIDTH = 1080;
export const HOTELLING_HEIGHT = 1920;
export const SHOT_DIP_FRAMES = 7;

/** Opening hook overlay */
export const HOOK = {
  badgeIn: 2,
  impactFrame: 16,
  holdUntil: 80,
  outEnd: 96,
  teaser: 'TEORI GAME & MATEMATIKA BISNIS',
  title: ['Kenapa Minimarket', 'Selalu Nempel?'],
  kicker: 'HUKUM HOTELLING (1929)',
} as const;

export function hookShakeAt(frame: number): number {
  const d = frame - HOOK.impactFrame;
  return d < 0 ? 0 : Math.exp(-d / 6);
}

// ── Cast vocabulary ─────────────────────────────────────────────────────────

export type WorldId =
  | 'cityNight'
  | 'theoryRoom'
  | 'beachSim'
  | 'beachEquilibrium'
  | 'cityPayoff';

export type LookId =
  | 'pedagangBiru'
  | 'pedagangMerah'
  | 'profesor'
  | 'pembeli'
  | 'turis'
  | 'kucing';

export interface CastMember {
  id: LookId;
  pos: Vec3;
  yaw?: number;
  scale?: number;
  expression: Expression;
  armL?: ArmPose;
  armR?: ArmPose;
  body?: BodyPose;
  handPropL?: HandProp;
  handPropR?: HandProp;
  bodyProp?: BodyProp;
  lookAt?: Vec3 | null;
  walkTo?: { from: Vec3; to: Vec3 };
}

// ── Color script ────────────────────────────────────────────────────────────

export type ColorPhase =
  | 'nightCityNeon'
  | 'theorySlate'
  | 'tropicalBeach'
  | 'beachGolden'
  | 'nightCityWarm';

export interface ColorGrading {
  keyColor: string;
  keyIntensity: number;
  skyColor: string;
  groundColor: string;
  shadowColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  rimColor: string;
  rimStrength: number;
  haze: number;
}

export const COLOR_SCRIPT: Record<ColorPhase, ColorGrading> = {
  nightCityNeon: {
    keyColor: '#38bdf8',
    keyIntensity: 1.4,
    skyColor: '#1e1b4b',
    groundColor: '#0f172a',
    shadowColor: '#020617',
    fogColor: '#0f172a',
    fogNear: 8,
    fogFar: 28,
    rimColor: '#f43f5e',
    rimStrength: 0.9,
    haze: 0.15,
  },
  theorySlate: {
    keyColor: '#fef3c7',
    keyIntensity: 1.6,
    skyColor: '#1e293b',
    groundColor: '#0f172a',
    shadowColor: '#090d16',
    fogColor: '#1e293b',
    fogNear: 10,
    fogFar: 30,
    rimColor: '#fbbf24',
    rimStrength: 0.7,
    haze: 0.12,
  },
  tropicalBeach: {
    keyColor: '#fef08a',
    keyIntensity: 2.1,
    skyColor: '#38bdf8',
    groundColor: '#fde68a',
    shadowColor: '#1e3a8a',
    fogColor: '#bae6fd',
    fogNear: 14,
    fogFar: 45,
    rimColor: '#ffffff',
    rimStrength: 0.8,
    haze: 0.08,
  },
  beachGolden: {
    keyColor: '#fb923c',
    keyIntensity: 2.3,
    skyColor: '#f43f5e',
    groundColor: '#d97706',
    shadowColor: '#431407',
    fogColor: '#f97316',
    fogNear: 12,
    fogFar: 38,
    rimColor: '#fef08a',
    rimStrength: 1.2,
    haze: 0.22,
  },
  nightCityWarm: {
    keyColor: '#facc15',
    keyIntensity: 1.6,
    skyColor: '#1e1b4b',
    groundColor: '#0f172a',
    shadowColor: '#020617',
    fogColor: '#111827',
    fogNear: 8,
    fogFar: 30,
    rimColor: '#38bdf8',
    rimStrength: 1.0,
    haze: 0.16,
  },
};

// ── Cinematic Shots ─────────────────────────────────────────────────────────

export type CutType = 'cut' | 'xfade' | 'dip' | 'flash';

export interface Shot {
  id: string;
  from: number;
  to: number;
  world: WorldId;
  phase: ColorPhase;
  cut: CutType;
  camStart: { pos: Vec3; look: Vec3; roll?: number };
  camEnd: { pos: Vec3; look: Vec3; roll?: number };
  cast: CastMember[];
  title?: string;
  subtitle?: string;
  chip?: string;
}

export const SHOTS: Shot[] = [
  // Shot 1: Street Hook (f0 - f270, 0.0s - 9.0s)
  {
    id: 'street-hook',
    from: 0,
    to: 270,
    world: 'cityNight',
    phase: 'nightCityNeon',
    cut: 'cut',
    chip: 'KOTA · MALAM',
    title: 'Dua Toko Berdampingan',
    subtitle: 'Persaingan Raksasa Minimarket',
    camStart: { pos: [0, 1.45, 4.6], look: [0, 1.25, 0], roll: -0.012 },
    camEnd: { pos: [0, 1.55, 5.2], look: [0, 1.3, 0], roll: 0.01 },
    cast: [
      {
        id: 'pedagangBiru',
        pos: [-0.9, 0, 0.7],
        yaw: 0.25,
        expression: 'serious',
        armL: 'hip',
        armR: 'pocket',
      },
      {
        id: 'pedagangMerah',
        pos: [0.9, 0, 0.7],
        yaw: -0.25,
        expression: 'serious',
        armL: 'pocket',
        armR: 'hip',
      },
      {
        id: 'kucing',
        pos: [-0.05, 0, 1.3],
        yaw: 0.1,
        expression: 'neutral',
      },
    ],
  },
  // Shot 2: Classroom Theory (f270 - f510, 9.0s - 17.0s)
  {
    id: 'classroom-theory',
    from: 270,
    to: 510,
    world: 'theoryRoom',
    phase: 'theorySlate',
    cut: 'xfade',
    chip: 'TEORI · 1929',
    title: 'Hukum Hotelling',
    subtitle: 'Prinsip Diferensiasi Minimum',
    camStart: { pos: [0, 1.35, 3.2], look: [0, 1.25, 0], roll: 0.015 },
    camEnd: { pos: [-0.05, 1.38, 2.8], look: [0, 1.28, 0], roll: -0.01 },
    cast: [
      {
        id: 'profesor',
        pos: [0.65, 0, 0.4],
        yaw: -0.25,
        expression: 'thinking',
        armL: 'side',
        armR: 'pointHigh',
      },
    ],
  },
  // Shot 3: Beach Setup (f510 - f910, 17.0s - 30.3s)
  {
    id: 'beach-setup',
    from: 510,
    to: 910,
    world: 'beachSim',
    phase: 'tropicalBeach',
    cut: 'xfade',
    chip: 'SIMULASI · PANTAI',
    title: '100 Turis yang Haus',
    subtitle: 'Dua Pedagang di Ujung Pantai',
    camStart: { pos: [0, 1.8, 6.8], look: [0, 0.95, 0], roll: -0.01 },
    camEnd: { pos: [0, 1.6, 6.0], look: [0, 0.9, 0], roll: 0.01 },
    cast: [
      {
        id: 'pedagangBiru',
        pos: [-2.4, 0, 0.3],
        yaw: 0.45,
        expression: 'warm',
        armL: 'side',
        armR: 'wave',
      },
      {
        id: 'pedagangMerah',
        pos: [2.4, 0, 0.3],
        yaw: -0.45,
        expression: 'warm',
        armL: 'wave',
        armR: 'side',
      },
    ],
  },
  // Shot 4: Blue Advances (f910 - f1125, 30.3s - 37.5s)
  {
    id: 'blue-advances',
    from: 910,
    to: 1125,
    world: 'beachSim',
    phase: 'beachGolden',
    cut: 'cut',
    chip: 'STRATEGI · MONOPOLI',
    title: 'Gerobak Biru Menggeser',
    subtitle: 'Merebut 70% Pasar Lawan',
    camStart: { pos: [-0.6, 1.6, 5.0], look: [-0.3, 0.95, 0], roll: -0.015 },
    camEnd: { pos: [0, 1.5, 4.6], look: [0, 0.95, 0], roll: 0.01 },
    cast: [
      {
        id: 'pedagangBiru',
        pos: [-0.8, 0, 0.3],
        yaw: 0.3,
        expression: 'smirk',
        armL: 'hip',
        armR: 'point',
      },
      {
        id: 'pedagangMerah',
        pos: [2.4, 0, 0.3],
        yaw: -0.45,
        expression: 'shock',
        armL: 'side',
        armR: 'headScratch' as ArmPose,
      },
    ],
  },
  // Shot 5: Red Reaction & Nash Equilibrium (f1125 - f1475, 37.5s - 49.2s)
  {
    id: 'red-equilibrium',
    from: 1125,
    to: 1475,
    world: 'beachEquilibrium',
    phase: 'beachGolden',
    cut: 'flash',
    chip: 'KESEIMBANGAN NASH',
    title: 'Nempel di Garis Tengah!',
    subtitle: 'Titik Temu Terbaik yang Tak Terelakkan',
    camStart: { pos: [0, 1.45, 4.2], look: [0, 1.0, 0], roll: 0.02 },
    camEnd: { pos: [0, 1.65, 4.8], look: [0, 1.05, 0], roll: -0.01 },
    cast: [
      {
        id: 'pedagangBiru',
        pos: [-0.85, 0, 0.4],
        yaw: 0.2,
        expression: 'warm',
        armL: 'hip',
        armR: 'side',
      },
      {
        id: 'pedagangMerah',
        pos: [0.85, 0, 0.4],
        yaw: -0.2,
        expression: 'warm',
        armL: 'side',
        armR: 'hip',
      },
    ],
  },
  // Shot 6: City Loop Payoff (f1475 - f1800, 49.2s - 60.0s)
  {
    id: 'city-loop-payoff',
    from: 1475,
    to: 1800,
    world: 'cityPayoff',
    phase: 'nightCityWarm',
    cut: 'xfade',
    chip: 'KOTA · KINI',
    title: 'Dua Raksasa Tetap Nempel',
    subtitle: 'Siklus Abadi di Jalanan Kita',
    camStart: { pos: [0, 1.3, 3.6], look: [0, 1.2, 0], roll: -0.01 },
    camEnd: { pos: [0, 1.45, 4.2], look: [0, 1.22, 0], roll: 0.015 },
    cast: [
      {
        id: 'pembeli',
        pos: [0, 0, 0.5],
        yaw: 0,
        expression: 'warm',
        armL: 'side',
        armR: 'wave',
      },
      {
        id: 'pedagangBiru',
        pos: [-1.4, 0, 0.3],
        yaw: 0.35,
        expression: 'warm',
        armL: 'side',
        armR: 'hip',
      },
      {
        id: 'pedagangMerah',
        pos: [1.4, 0, 0.3],
        yaw: -0.35,
        expression: 'warm',
        armL: 'hip',
        armR: 'side',
      },
    ],
  },
];

export function shotAt(frame: number): Shot {
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (s && frame >= s.from && frame < s.to) return s;
  }
  return (SHOTS[SHOTS.length - 1] ?? SHOTS[0]) as Shot;
}

export function sampleCamera(
  frame: number,
  aspect = 9 / 16
): { pos: THREE.Vector3; target: THREE.Vector3; roll: number; fov: number } {
  const s = shotAt(frame);
  const p = clamp01((frame - s.from) / Math.max(1, s.to - s.from - 1));
  const t = smoothstep(0, 1, p);

  const pos = new THREE.Vector3(
    lerp(s.camStart.pos[0], s.camEnd.pos[0], t),
    lerp(s.camStart.pos[1], s.camEnd.pos[1], t),
    lerp(s.camStart.pos[2], s.camEnd.pos[2], t)
  );

  const target = new THREE.Vector3(
    lerp(s.camStart.look[0], s.camEnd.look[0], t),
    lerp(s.camStart.look[1], s.camEnd.look[1], t),
    lerp(s.camStart.look[2], s.camEnd.look[2], t)
  );

  const rollStart = s.camStart.roll ?? 0;
  const rollEnd = s.camEnd.roll ?? 0;
  const roll = lerp(rollStart, rollEnd, t) + (s.id === 'street-hook' ? hookShakeAt(frame) * 0.02 : 0);

  const fov = aspect < 1 ? 48 : 38;
  return { pos, target, roll, fov };
}
