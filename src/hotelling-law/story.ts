/**
 * Hukum Hotelling — story, timing, colour script and cinematic camera.
 *
 * Everything here is a pure function of `frame` (Pyxis v2.3: deterministic).
 * The timeline is a seamless 60 s loop: f1799 lands on exactly the same camera,
 * grade and cast pose as f0, so the platform loop never shows a seam.
 */
import * as THREE from 'three';
import { clamp01, easeInOutSine, lerp, smoothstep } from '../persis/story';
import type { Vec3 } from '../persis/story';

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
/** Half-length of a dip-to-black between worlds. */
export const SHOT_DIP_FRAMES = 7;
const LOOP = HOTELLING_DURATION_IN_FRAMES;

/** Opening hook overlay. */
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

/**
 * A sine that completes an integer number of `cycles` per 60 s loop, so any
 * idle motion built from it is identical at f0 and f1800.
 */
export function loopWave(frame: number, cycles: number, phase = 0): number {
  return Math.sin((2 * Math.PI * cycles * frame) / LOOP + phase);
}

/** Wraps a linear drift so it repeats `cycles` times per loop (0..1 sawtooth). */
export function loopSaw(frame: number, cycles: number, offset = 0): number {
  const v = (cycles * frame) / LOOP + offset;
  return v - Math.floor(v);
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

export type WorldId = 'city' | 'classroom' | 'beach';

export type LookId = 'pedagangBiru' | 'pedagangMerah' | 'profesor' | 'pembeli' | 'turis' | 'kucing';

export type Expression = 'neutral' | 'warm' | 'serious' | 'thinking' | 'wonder' | 'smirk' | 'shock' | 'laugh';

/**
 * Hand targets. `side` and `hip` are resting poses drawn behind the torso;
 * every other pose reaches forward and is drawn in front of it (Pyxis layer order).
 */
export type ArmPose = 'side' | 'hip' | 'point' | 'pointHigh' | 'wave' | 'open' | 'push' | 'think' | 'chalk' | 'bag';

export const RESTING_ARMS: readonly ArmPose[] = ['side', 'hip'];

export type CutType = 'cut' | 'dip' | 'flash';

type Keys<T> = readonly (readonly [number, T])[];

export interface CameraKey {
  /** Shot progress 0..1 at which this key is hit exactly. */
  t: number;
  pos: Vec3;
  target: Vec3;
  fov: number;
  /** Screen roll in radians (π/2 turns a long beach into a vertical map). */
  roll?: number;
}

export interface CastMember {
  id: LookId;
  /** Keyed ground path `[progress, x, y, z]` in world metres; y is the floor height under the soles. */
  path: readonly (readonly [number, number, number, number])[];
  /** Pin the x coordinate to a cart (path x then acts as an offset). */
  follow?: 'blueCart' | 'redCart';
  expr: Keys<Expression>;
  armL?: Keys<ArmPose>;
  armR?: Keys<ArmPose>;
  /** Lip-syncs the narration while true. */
  speak?: boolean;
  /** Eye/head bias, −1 (screen left) … +1 (screen right). */
  look?: Keys<number>;
  scale?: number;
}

// ── Colour script ───────────────────────────────────────────────────────────

export type ColorPhase = 'nightCityNeon' | 'theoryLamp' | 'beachNoon' | 'beachGolden' | 'beachSunset' | 'nightCityWarm';

export interface ColorGrading {
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  fogDensity: number;
  keyColor: string;
  keyIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  rimColor: string;
  rimStrength: number;
  /** Self-illumination of the toon cards so faces stay readable in low light. */
  actorGlow: number;
  /** 0..1 how wet / reflective the ground reads. */
  wetness: number;
}

export const COLOR_SCRIPT: Record<ColorPhase, ColorGrading> = {
  nightCityNeon: {
    skyTop: '#0b0a24',
    skyHorizon: '#3b1d5c',
    fogColor: '#1d1636',
    fogDensity: 0.034,
    keyColor: '#9fb8ff',
    keyIntensity: 0.55,
    hemiSky: '#4a4f9c',
    hemiGround: '#2a1530',
    hemiIntensity: 0.55,
    rimColor: '#ff5d8f',
    rimStrength: 0.85,
    actorGlow: 0.32,
    wetness: 1,
  },
  theoryLamp: {
    skyTop: '#1a1210',
    skyHorizon: '#2c1d16',
    fogColor: '#20160f',
    fogDensity: 0.03,
    keyColor: '#ffcf8a',
    keyIntensity: 0.25,
    hemiSky: '#6a5040',
    hemiGround: '#1c120c',
    hemiIntensity: 0.38,
    rimColor: '#9cc4ff',
    rimStrength: 0.7,
    actorGlow: 0.18,
    wetness: 0,
  },
  beachNoon: {
    skyTop: '#2f8fe0',
    skyHorizon: '#bfe9ff',
    fogColor: '#cdeefc',
    fogDensity: 0.012,
    keyColor: '#fff2cc',
    keyIntensity: 2.0,
    hemiSky: '#9fd8ff',
    hemiGround: '#e7c98f',
    hemiIntensity: 0.9,
    rimColor: '#ffffff',
    rimStrength: 0.55,
    actorGlow: 0.06,
    wetness: 0.2,
  },
  beachGolden: {
    skyTop: '#3a6fc4',
    skyHorizon: '#ffc58a',
    fogColor: '#ffd9a8',
    fogDensity: 0.014,
    keyColor: '#ffbe6b',
    keyIntensity: 1.9,
    hemiSky: '#a9b8e8',
    hemiGround: '#e0a86a',
    hemiIntensity: 0.8,
    rimColor: '#ffe08a',
    rimStrength: 0.95,
    actorGlow: 0.08,
    wetness: 0.3,
  },
  beachSunset: {
    skyTop: '#3b2a6e',
    skyHorizon: '#ff8a5c',
    fogColor: '#f59a78',
    fogDensity: 0.018,
    keyColor: '#ff9a4d',
    keyIntensity: 1.7,
    hemiSky: '#8c6bb8',
    hemiGround: '#c47a52',
    hemiIntensity: 0.75,
    rimColor: '#ffd36b',
    rimStrength: 1.15,
    actorGlow: 0.12,
    wetness: 0.45,
  },
  nightCityWarm: {
    skyTop: '#120c26',
    skyHorizon: '#53254f',
    fogColor: '#2a1a33',
    fogDensity: 0.03,
    keyColor: '#ffc27a',
    keyIntensity: 0.6,
    hemiSky: '#5a4a8c',
    hemiGround: '#38202c',
    hemiIntensity: 0.6,
    rimColor: '#5fd3ff',
    rimStrength: 0.9,
    actorGlow: 0.32,
    wetness: 1,
  },
};

// ── Beach simulation (shared by worlds, story and overlay) ──────────────────

/** Beach extent along x on which the 100 tourists are spread. */
export const BEACH_HALF = 6;
export const CART_Z = 0.15;

/** 100 tourist x positions, evenly spread with a tiny seeded jitter (sorted). */
export const TOURIST_X: readonly number[] = Array.from({ length: 100 }, (_, i) => {
  const j = Math.sin(i * 91.7 + 3.1) * 0.035;
  return -BEACH_HALF + (2 * BEACH_HALF * (i + 0.5)) / 100 + j;
});

const ease = (f: number, a: number, b: number): number => easeInOutSine(clamp01((f - a) / (b - a)));

/** Cart x positions: blue grabs the middle first, red follows, both settle at the centre line. */
export function cartsAt(frame: number): { blue: number; red: number } {
  const blue = lerp(lerp(-4.5, -0.15, ease(frame, 915, 1060)), -0.75, ease(frame, 1185, 1240));
  const red = lerp(4.5, 0.75, ease(frame, 1125, 1240));
  return { blue, red };
}

/** Market boundary: every tourist walks to the nearer cart. */
export function boundaryAt(frame: number): number {
  const { blue, red } = cartsAt(frame);
  return (blue + red) / 2;
}

/** Tourists buying from blue / red, plus overlay visibility. */
export function shareAt(frame: number): { blue: number; red: number; visible: number } {
  const b = boundaryAt(frame);
  const blue = TOURIST_X.filter((x) => x < b).length;
  const visible = smoothstep(650, 668, frame) * (1 - smoothstep(1458, 1470, frame));
  return { blue, red: 100 - blue, visible };
}

// ── Shots ───────────────────────────────────────────────────────────────────

export interface Shot {
  id: string;
  from: number;
  to: number;
  world: WorldId;
  phase: ColorPhase;
  /** Optional grade the shot drifts into by its last frame. */
  phaseTo?: ColorPhase;
  /** How this shot is entered. */
  cut: CutType;
  camera: readonly CameraKey[];
  cast: readonly CastMember[];
  chip?: string;
}

const HALF_PI = Math.PI / 2;
/** City sidewalk height (store fronts sit on it). */
export const CURB_H = 0.16;

/** Shared macro key: f0 and f1799 both sit on it, closing the loop. */
const LOOP_KEY: Omit<CameraKey, 't'> = { pos: [0.45, 0.5, 2.6], target: [0.05, 0.8, -2.2], fov: 40, roll: 0 };
const BEACH_MAP: Omit<CameraKey, 't'> = { pos: [0, 14.2, 6.2], target: [0, 0, 0.55], fov: 50, roll: HALF_PI };

const PEMBELI_HOME: readonly [number, number, number, number] = [0, -0.05, CURB_H, -1.75];

export const SHOTS: readonly Shot[] = [
  {
    // 0.0–9.0 s — "Pernah kepikiran nggak, kenapa Indomaret dan Alfamart selalu buka toko nempel…"
    id: 'street-hook',
    from: 0,
    to: 270,
    world: 'city',
    phase: 'nightCityNeon',
    cut: 'cut',
    chip: 'JALANAN KOTA • 22:47',
    camera: [
      { t: 0, ...LOOP_KEY },
      { t: 0.24, pos: [0.15, 0.75, 3.6], target: [0, 1.5, -3], fov: 40 },
      { t: 0.55, pos: [-1.1, 1.45, 6.6], target: [0, 2.35, -3], fov: 46, roll: -0.03 },
      { t: 1, pos: [0.2, 1.75, 10.4], target: [0, 3.0, -3], fov: 50, roll: 0.012 },
    ],
    cast: [
      {
        id: 'pembeli',
        path: [PEMBELI_HOME],
        expr: [
          [0, 'thinking'],
          [0.42, 'wonder'],
          [0.78, 'smirk'],
        ],
        armR: [
          [0, 'think'],
          [0.4, 'point'],
          [0.62, 'side'],
        ],
        armL: [
          [0, 'bag'],
          [0.4, 'side'],
          [0.62, 'point'],
          [0.82, 'bag'],
        ],
        look: [
          [0, 0],
          [0.4, 0.8],
          [0.62, -0.8],
          [0.82, 0],
        ],
        speak: true,
      },
      { id: 'kucing', path: [[0, 2.55, CURB_H, -1.45]], expr: [[0, 'neutral']] },
    ],
  },
  {
    // 9.0–16.5 s — "Ini bukan kebetulan… trik matematika jenius bernama Hukum Hotelling!"
    id: 'classroom-theory',
    from: 270,
    to: 495,
    world: 'classroom',
    phase: 'theoryLamp',
    cut: 'dip',
    chip: 'COLUMBIA, 1929',
    camera: [
      { t: 0, pos: [-1.3, 2.62, 1.15], target: [-0.75, 2.92, 0.15], fov: 36, roll: 0.04 },
      { t: 0.28, pos: [0.25, 1.95, 3.0], target: [0.2, 1.8, -2.2], fov: 46 },
      { t: 0.68, pos: [0.1, 1.8, 3.5], target: [0.2, 1.75, -2.2], fov: 50, roll: -0.015 },
      { t: 1, pos: [0.55, 1.62, 2.15], target: [0.35, 1.55, -2.0], fov: 40, roll: 0.01 },
    ],
    cast: [
      {
        id: 'profesor',
        path: [
          [0, 1.25, 0, -0.85],
          [0.18, 1.25, 0, -0.85],
          [0.4, 0.95, 0, -0.95],
        ],
        expr: [
          [0, 'serious'],
          [0.3, 'thinking'],
          [0.62, 'warm'],
          [0.86, 'smirk'],
        ],
        armL: [
          [0, 'side'],
          [0.36, 'chalk'],
          [0.7, 'pointHigh'],
        ],
        armR: [
          [0, 'hip'],
          [0.56, 'open'],
          [0.84, 'hip'],
        ],
        look: [
          [0, 0],
          [0.36, -0.7],
          [0.62, 0.1],
        ],
        speak: true,
      },
    ],
  },
  {
    // 16.5–21.3 s — "Bayangkan ada pantai panjang berisi seratus turis yang haus."
    id: 'beach-intro',
    from: 495,
    to: 640,
    world: 'beach',
    phase: 'beachNoon',
    cut: 'flash',
    chip: 'SIMULASI PANTAI',
    camera: [
      { t: 0, pos: [-3.85, 1.72, 1.55], target: [-4.5, 1.68, 0.15], fov: 32, roll: -0.03 },
      { t: 0.32, pos: [-2.6, 2.9, 5.6], target: [-1.6, 0.7, 0], fov: 44 },
      { t: 1, ...BEACH_MAP },
    ],
    cast: [
      {
        id: 'turis',
        path: [[0, -2.75, 0, 1.55]],
        expr: [
          [0, 'wonder'],
          [0.5, 'shock'],
        ],
        armR: [[0, 'wave']],
        armL: [[0, 'side']],
        look: [[0, -0.6]],
      },
      { id: 'pedagangBiru', follow: 'blueCart', path: [[0, -0.85, 0, CART_Z + 0.1]], expr: [[0, 'warm']], armL: [[0, 'side']], armR: [[0, 'wave']] },
      { id: 'pedagangMerah', follow: 'redCart', path: [[0, 0.85, 0, CART_Z + 0.1]], expr: [[0, 'warm']], armL: [[0, 'wave']], armR: [[0, 'side']] },
    ],
  },
  {
    // 21.3–25.7 s — "Dua pedagang es krim awalnya jualan di ujung kiri dan kanan…"
    id: 'beach-map-split',
    from: 640,
    to: 770,
    world: 'beach',
    phase: 'beachNoon',
    cut: 'cut',
    chip: 'BAGI RATA 50 : 50',
    camera: [
      { t: 0, ...BEACH_MAP },
      { t: 1, pos: [0.25, 11.6, 5.6], target: [0, 0, 0.5], fov: 48, roll: HALF_PI + 0.03 },
    ],
    cast: [
      { id: 'pedagangBiru', follow: 'blueCart', path: [[0, -0.85, 0, CART_Z + 0.1]], expr: [[0, 'warm']], armL: [[0, 'side']], armR: [[0, 'hip']] },
      { id: 'pedagangMerah', follow: 'redCart', path: [[0, 0.85, 0, CART_Z + 0.1]], expr: [[0, 'warm']], armL: [[0, 'hip']], armR: [[0, 'side']] },
    ],
  },
  {
    // 25.7–30.0 s — "…Masing-masing dapat lima puluh pembeli."
    id: 'beach-pole-pan',
    from: 770,
    to: 900,
    world: 'beach',
    phase: 'beachNoon',
    phaseTo: 'beachGolden',
    cut: 'cut',
    chip: 'GARIS TENGAH',
    camera: [
      { t: 0, pos: [-2.2, 1.35, 4.2], target: [-4.5, 1.05, 0.1], fov: 42, roll: -0.02 },
      { t: 0.5, pos: [0, 1.5, 4.4], target: [0, 1.3, -0.4], fov: 44 },
      { t: 1, pos: [2.2, 1.35, 4.2], target: [4.5, 1.05, 0.1], fov: 42, roll: 0.02 },
    ],
    cast: [
      { id: 'pedagangBiru', follow: 'blueCart', path: [[0, -0.85, 0, CART_Z + 0.1]], expr: [[0, 'laugh']], armL: [[0, 'side']], armR: [[0, 'open']], look: [[0, 0.5]] },
      { id: 'pedagangMerah', follow: 'redCart', path: [[0, 0.85, 0, CART_Z + 0.1]], expr: [[0, 'warm']], armL: [[0, 'open']], armR: [[0, 'side']], look: [[0, -0.5]] },
    ],
  },
  {
    // 30.0–37.2 s — "Tapi si pedagang biru ingin untung lebih, jadi ia geser gerobaknya ke tengah…"
    id: 'blue-advances',
    from: 900,
    to: 1115,
    world: 'beach',
    phase: 'beachGolden',
    cut: 'cut',
    chip: 'BIRU MAJU KE TENGAH',
    camera: [
      { t: 0, pos: [-3.1, 1.45, 4.5], target: [-4.5, 0.95, 0.15], fov: 40, roll: -0.02 },
      { t: 0.32, pos: [-2.5, 1.5, 4.6], target: [-3.0, 0.95, 0.15], fov: 42 },
      { t: 0.7, pos: [0.7, 1.6, 4.8], target: [-0.4, 0.95, 0.15], fov: 44, roll: 0.02 },
      { t: 1, pos: [0.1, 12.2, 5.6], target: [0, 0, 0.5], fov: 48, roll: HALF_PI },
    ],
    cast: [
      {
        id: 'pedagangBiru',
        follow: 'blueCart',
        path: [[0, -0.85, 0, CART_Z + 0.1]],
        expr: [
          [0, 'smirk'],
          [0.75, 'laugh'],
        ],
        armL: [[0, 'push']],
        armR: [
          [0, 'push'],
          [0.75, 'wave'],
        ],
      },
      {
        id: 'pedagangMerah',
        follow: 'redCart',
        path: [[0, 0.85, 0, CART_Z + 0.1]],
        expr: [
          [0, 'neutral'],
          [0.62, 'shock'],
        ],
        armL: [[0, 'side']],
        armR: [[0, 'side']],
        look: [[0, -0.8]],
      },
    ],
  },
  {
    // 37.2–42.1 s — "Melihat itu, pedagang merah tidak tinggal diam dan ikut geser ke tengah."
    id: 'red-follows',
    from: 1115,
    to: 1262,
    world: 'beach',
    phase: 'beachGolden',
    phaseTo: 'beachSunset',
    cut: 'flash',
    chip: 'MERAH MEMBALAS',
    camera: [
      { t: 0, pos: [5.8, 1.5, 4.3], target: [3.9, 0.95, 0.15], fov: 42, roll: 0.025 },
      { t: 0.55, pos: [3.5, 1.55, 4.6], target: [1.7, 0.95, 0.15], fov: 44 },
      { t: 1, pos: [1.3, 1.6, 5.0], target: [0, 0.95, 0.1], fov: 46, roll: -0.01 },
    ],
    cast: [
      {
        id: 'pedagangMerah',
        follow: 'redCart',
        path: [[0, 0.85, 0, CART_Z + 0.1]],
        expr: [
          [0, 'serious'],
          [0.85, 'smirk'],
        ],
        armL: [[0, 'push']],
        armR: [[0, 'push']],
      },
      {
        id: 'pedagangBiru',
        follow: 'blueCart',
        path: [[0, -0.85, 0, CART_Z + 0.1]],
        expr: [
          [0, 'laugh'],
          [0.4, 'shock'],
          [0.8, 'thinking'],
        ],
        armL: [
          [0, 'side'],
          [0.45, 'push'],
        ],
        armR: [
          [0, 'wave'],
          [0.45, 'push'],
        ],
        look: [[0, 0.7]],
      },
    ],
  },
  {
    // 42.1–49.0 s — "Akhirnya, titik keseimbangan terbaik mereka adalah berdiri berdampingan…"
    id: 'equilibrium',
    from: 1262,
    to: 1470,
    world: 'beach',
    phase: 'beachSunset',
    cut: 'cut',
    chip: 'KESEIMBANGAN NASH',
    camera: [
      { t: 0, pos: [0, 1.35, 4.8], target: [0, 1.0, 0], fov: 44 },
      { t: 0.36, pos: [3.4, 1.9, 3.9], target: [0, 0.95, 0], fov: 44, roll: 0.02 },
      { t: 0.7, pos: [0.4, 6.2, 5.6], target: [0, 0.4, 0.2], fov: 46, roll: 0.6 },
      { t: 1, pos: [0, 12.4, 5.3], target: [0, 0, 0.5], fov: 48, roll: HALF_PI },
    ],
    cast: [
      { id: 'pedagangBiru', follow: 'blueCart', path: [[0, -0.85, 0, CART_Z + 0.1]], expr: [[0, 'warm'], [0.3, 'laugh']], armL: [[0, 'side']], armR: [[0, 'wave']], look: [[0, 0.6]] },
      { id: 'pedagangMerah', follow: 'redCart', path: [[0, 0.85, 0, CART_Z + 0.1]], expr: [[0, 'warm'], [0.35, 'laugh']], armL: [[0, 'wave']], armR: [[0, 'side']], look: [[0, -0.6]] },
    ],
  },
  {
    // 49.0–53.7 s — "Itulah alasan kenapa dua minimarket raksasa ini selalu nempel."
    id: 'city-payoff',
    from: 1470,
    to: 1610,
    world: 'city',
    phase: 'nightCityWarm',
    cut: 'dip',
    chip: 'BUKAN KEBETULAN',
    camera: [
      { t: 0, pos: [0, 7.4, 6.4], target: [0, 3.6, -3], fov: 46, roll: 0.02 },
      { t: 0.55, pos: [-0.5, 3.6, 7.6], target: [0, 2.8, -3], fov: 48 },
      { t: 1, pos: [0.1, 2.0, 8.6], target: [0, 2.3, -3], fov: 48, roll: -0.01 },
    ],
    cast: [
      {
        id: 'pembeli',
        path: [
          [0, -2.0, CURB_H, -1.65],
          [1, 0.9, CURB_H, -1.7],
        ],
        expr: [
          [0, 'warm'],
          [0.6, 'smirk'],
        ],
        armL: [[0, 'bag']],
        armR: [[0, 'side']],
        look: [[0, 0.4]],
        speak: true,
      },
      { id: 'kucing', path: [[0, 2.55, CURB_H, -1.45]], expr: [[0, 'neutral']] },
    ],
  },
  {
    // 53.7–60.0 s — "Dan kalau kamu perhatikan di jalanan…" → loops into f0.
    id: 'city-loop',
    from: 1610,
    to: 1800,
    world: 'city',
    phase: 'nightCityWarm',
    phaseTo: 'nightCityNeon',
    cut: 'cut',
    chip: 'JALANAN KOTA • 22:47',
    camera: [
      { t: 0, pos: [0.1, 2.0, 8.6], target: [0, 2.3, -3], fov: 48, roll: -0.01 },
      { t: 0.5, pos: [0.3, 0.95, 4.6], target: [0, 1.3, -2.6], fov: 42, roll: 0.015 },
      { t: 1, ...LOOP_KEY },
    ],
    cast: [
      {
        id: 'pembeli',
        path: [
          [0, 0.9, CURB_H, -1.7],
          [0.55, PEMBELI_HOME[1], PEMBELI_HOME[2], PEMBELI_HOME[3]],
          [1, PEMBELI_HOME[1], PEMBELI_HOME[2], PEMBELI_HOME[3]],
        ],
        expr: [
          [0, 'smirk'],
          [0.62, 'thinking'],
        ],
        armL: [[0, 'bag']],
        armR: [
          [0, 'side'],
          [0.25, 'point'],
          [0.62, 'think'],
        ],
        look: [
          [0, -0.3],
          [0.25, 0.9],
          [0.62, 0],
        ],
        speak: true,
      },
      { id: 'kucing', path: [[0, 2.55, CURB_H, -1.45]], expr: [[0, 'neutral']] },
    ],
  },
];

/** Kinetic keyword slams (visual change every ~2 s on top of the camera beats). */
export const KEYWORDS: readonly { from: number; to: number; text: string; accent: string }[] = [
  { from: 112, to: 170, text: 'NEMPEL TERUS?!', accent: '#FBBF24' },
  { from: 196, to: 258, text: 'MUSUHAN?', accent: '#ff5d8f' },
  { from: 300, to: 372, text: 'BUKAN KEBETULAN', accent: '#FBBF24' },
  { from: 410, to: 490, text: 'HUKUM HOTELLING', accent: '#FBBF24' },
  { from: 560, to: 630, text: '100 TURIS HAUS', accent: '#7dd3fc' },
  { from: 840, to: 898, text: '50 : 50', accent: '#FBBF24' },
  { from: 1010, to: 1100, text: 'REBUT PASAR!', accent: '#60a5fa' },
  { from: 1170, to: 1250, text: 'IKUT GESER!', accent: '#f87171' },
  { from: 1330, to: 1410, text: 'BERDAMPINGAN', accent: '#FBBF24' },
  { from: 1520, to: 1600, text: 'SELALU NEMPEL', accent: '#FBBF24' },
];

// ── Shot lookup ─────────────────────────────────────────────────────────────

export interface ShotState {
  shot: Shot;
  index: number;
  local: number;
  /** 0 at the first frame, exactly 1 at the last frame of the shot. */
  progress: number;
}

export function shotIndexAt(frame: number): number {
  const f = Math.min(LOOP - 1, Math.max(0, frame));
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (s && f >= s.from && f < s.to) return i;
  }
  return SHOTS.length - 1;
}

export function shotStateAt(frame: number): ShotState {
  const index = shotIndexAt(frame);
  const shot = SHOTS[index] ?? (SHOTS[0] as Shot);
  const f = Math.min(LOOP - 1, Math.max(0, frame));
  const local = f - shot.from;
  return { shot, index, local, progress: clamp01(local / Math.max(1, shot.to - shot.from - 1)) };
}

export function shotAt(frame: number): Shot {
  return shotStateAt(frame).shot;
}

// ── Keys ────────────────────────────────────────────────────────────────────

/** Snappy key switch: holds each value, blends to the next over `blendFrames`. */
export function snapKeys<T>(keys: Keys<T> | undefined, fallback: T, progress: number, shotLen: number, blendFrames: number): { from: T; to: T; mix: number } {
  if (!keys || keys.length === 0) return { from: fallback, to: fallback, mix: 0 };
  let prev: T = keys[0]?.[1] ?? fallback;
  for (const [t, v] of keys) {
    if (progress < t) break;
    const age = (progress - t) * shotLen;
    const mix = t === 0 ? 1 : clamp01(age / Math.max(1, blendFrames));
    if (mix < 1) return { from: prev, to: v, mix: mix * mix * (3 - 2 * mix) };
    prev = v;
  }
  return { from: prev, to: prev, mix: 0 };
}

/** Smooth numeric keys (eased between keys). */
export function smoothKeys(keys: Keys<number> | undefined, progress: number): number {
  if (!keys || keys.length === 0) return 0;
  let prev = keys[0];
  if (!prev || progress <= prev[0]) return prev?.[1] ?? 0;
  for (const k of keys) {
    if (progress <= k[0]) {
      const u = (progress - prev[0]) / Math.max(1e-6, k[0] - prev[0]);
      return lerp(prev[1], k[1], easeInOutSine(u));
    }
    prev = k;
  }
  return prev[1];
}

const pathPoint = (member: CastMember, progress: number, frame: number, out: THREE.Vector3): THREE.Vector3 => {
  const keys = member.path;
  let a = keys[0] ?? [0, 0, 0, 0];
  let b = a;
  for (const k of keys) {
    b = k;
    if (progress <= k[0]) break;
    a = k;
  }
  const u = b[0] > a[0] ? easeInOutSine(clamp01((progress - a[0]) / (b[0] - a[0]))) : 1;
  out.set(lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u));
  if (member.follow) {
    const carts = cartsAt(frame);
    out.x += member.follow === 'blueCart' ? carts.blue : carts.red;
  }
  return out;
};

export interface CastPose {
  position: THREE.Vector3;
  /** Walk phase in radians (distance-driven so planted feet never skate), or null when standing. */
  walkPhase: number | null;
  walkDir: number;
  /** Ground speed in m/frame. */
  speed: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/**
 * Cast pose for `frame`. Distance travelled is integrated frame by frame from
 * the shot start, so the walk cycle advances only while the actor really moves.
 */
export function castPoseAt(member: CastMember, frame: number, walkPhasePerMetre: number): CastPose {
  const { shot } = shotStateAt(frame);
  const len = Math.max(1, shot.to - shot.from - 1);
  const pAt = (f: number): number => clamp01((f - shot.from) / len);
  const position = pathPoint(member, pAt(frame), frame, new THREE.Vector3());
  let travelled = 0;
  pathPoint(member, pAt(shot.from), shot.from, tmpA);
  for (let f = shot.from + 1; f <= frame; f++) {
    pathPoint(member, pAt(f), f, tmpB);
    travelled += Math.hypot(tmpB.x - tmpA.x, tmpB.z - tmpA.z);
    tmpA.copy(tmpB);
  }
  pathPoint(member, pAt(frame - 1), frame - 1, tmpA);
  const dx = position.x - tmpA.x;
  const speed = Math.hypot(dx, position.z - tmpA.z);
  const scale = member.scale ?? 1;
  return {
    position,
    walkPhase: speed > 0.0012 ? (travelled / scale) * walkPhasePerMetre : null,
    walkDir: dx >= 0 ? 1 : -1,
    speed,
  };
}

// ── Grade ───────────────────────────────────────────────────────────────────

const cA = new THREE.Color();
const cB = new THREE.Color();
const mixHex = (a: string, b: string, t: number): string => cA.set(a).lerp(cB.set(b), t).getStyle();

export function mixGrading(a: ColorGrading, b: ColorGrading, t: number): ColorGrading {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyHorizon: mixHex(a.skyHorizon, b.skyHorizon, t),
    fogColor: mixHex(a.fogColor, b.fogColor, t),
    fogDensity: lerp(a.fogDensity, b.fogDensity, t),
    keyColor: mixHex(a.keyColor, b.keyColor, t),
    keyIntensity: lerp(a.keyIntensity, b.keyIntensity, t),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    rimColor: mixHex(a.rimColor, b.rimColor, t),
    rimStrength: lerp(a.rimStrength, b.rimStrength, t),
    actorGlow: lerp(a.actorGlow, b.actorGlow, t),
    wetness: lerp(a.wetness, b.wetness, t),
  };
}

export function gradingAt(frame: number): ColorGrading {
  const { shot, progress } = shotStateAt(frame);
  const a = COLOR_SCRIPT[shot.phase];
  if (!shot.phaseTo) return a;
  return mixGrading(a, COLOR_SCRIPT[shot.phaseTo], smoothstep(0.15, 1, progress));
}

// ── Transitions ─────────────────────────────────────────────────────────────

/** Full-frame overlay used for dips and flashes at shot boundaries. */
export function transitionAt(frame: number): { color: string; alpha: number } {
  for (const s of SHOTS) {
    const d = frame - s.from;
    if (s.cut === 'dip' && Math.abs(d) <= SHOT_DIP_FRAMES) {
      const a = 1 - Math.abs(d) / (SHOT_DIP_FRAMES + 1);
      return { color: '#07040d', alpha: a * a * (3 - 2 * a) };
    }
    if (s.cut === 'flash' && d >= -2 && d < 12) {
      const a = d < 0 ? (d + 3) / 3 : Math.exp(-d / 3.5);
      return { color: '#fff7e0', alpha: clamp01(a) * 0.85 };
    }
  }
  return { color: '#000', alpha: 0 };
}

// ── Camera ──────────────────────────────────────────────────────────────────

export interface CameraSample {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
}

interface CameraRig {
  pos: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  times: number[];
}

const rigCache = new Map<string, CameraRig>();

function rigFor(shot: Shot): CameraRig {
  const cached = rigCache.get(shot.id);
  if (cached) return cached;
  const keys = shot.camera.length >= 2 ? shot.camera : [...shot.camera, ...shot.camera];
  const rig: CameraRig = {
    pos: new THREE.CatmullRomCurve3(
      keys.map((k) => new THREE.Vector3(...k.pos)),
      false,
      'centripetal',
    ),
    target: new THREE.CatmullRomCurve3(
      keys.map((k) => new THREE.Vector3(...k.target)),
      false,
      'centripetal',
    ),
    times: keys.map((k) => k.t),
  };
  rigCache.set(shot.id, rig);
  return rig;
}

/** Maps shot progress onto the curve so every key is hit exactly at its own `t`, easing in and out of it. */
function segmentOf(times: readonly number[], t: number): { index: number; local: number; u: number } {
  const n = times.length - 1;
  for (let i = 1; i <= n; i++) {
    const a = times[i - 1] ?? 0;
    const b = times[i] ?? 1;
    if (t <= b || i === n) {
      const local = b > a ? easeInOutSine(clamp01((t - a) / (b - a))) : 1;
      return { index: i - 1, local, u: (i - 1 + local) / n };
    }
  }
  return { index: n - 1, local: 1, u: 1 };
}

/**
 * Catmull-Rom (centripetal) glide through the shot's keys, with a loop-periodic
 * handheld breath and the hook's decaying impact shake.
 */
export function sampleCamera(frame: number, out?: CameraSample): CameraSample {
  const { shot, progress } = shotStateAt(frame);
  const rig = rigFor(shot);
  const seg = segmentOf(rig.times, progress);
  const sample = out ?? { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, roll: 0 };
  rig.pos.getPoint(seg.u, sample.position);
  rig.target.getPoint(seg.u, sample.target);
  const a = shot.camera[seg.index] ?? shot.camera[0];
  const b = shot.camera[seg.index + 1] ?? a;
  sample.fov = lerp(a?.fov ?? 45, b?.fov ?? 45, seg.local);
  sample.roll = lerp(a?.roll ?? 0, b?.roll ?? 0, seg.local);

  // Handheld breath: integer cycles per loop, so f0 ≡ f1800.
  sample.position.x += loopWave(frame, 23, 0.4) * 0.012 + loopWave(frame, 67, 1.1) * 0.004;
  sample.position.y += loopWave(frame, 31, 2.0) * 0.009;
  sample.target.x += loopWave(frame, 19, 2.6) * 0.01;
  sample.roll += loopWave(frame, 13, 0.7) * 0.004;

  const k = hookShakeAt(frame);
  if (k > 0.001) {
    sample.position.x += k * 0.08 * Math.sin(frame * 2.9);
    sample.position.y += k * 0.06 * Math.sin(frame * 3.7 + 1);
    sample.target.x += k * 0.12 * Math.sin(frame * 2.3 + 2);
    sample.target.y += k * 0.09 * Math.sin(frame * 3.1 + 0.5);
    sample.roll += k * 0.025 * Math.sin(frame * 2.6 + 1.3);
  }
  return sample;
}
