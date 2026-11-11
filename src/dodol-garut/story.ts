import * as THREE from 'three';
import { clamp01, keyed, smoothstep } from '../persis/story';
import type { ActionMode, Expr, LookId } from './toon';
import type { FxCue } from './fx';

/**
 * "Kenapa Dodol Garut Awet 5 Bulan Tanpa Pengawet?" (60.00 s / 1800 frames @ 30 fps)
 * Built on the upgraded v3 Bean-Head engine:
 *  - No forced recurring mascot (no Dinda); cast strictly serves the story,
 *  - True front/side view switching with 2-bone IK & target-anchored poses,
 *  - Hand-inked vector comic FX (zero emoji '!'/'?'),
 *  - Nuanced expressions & ironic/warm payoff (no repetitive shock ending).
 */

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
export type { CaptionPage, SentenceTiming, WordTiming } from '../persis/story';

export const DG_FPS = 30;
export const DG_DURATION_IN_FRAMES = 1800;
export const DG_WIDTH = 1080;
export const DG_HEIGHT = 1920;
export const SHOT_DIP_FRAMES = 6;
export const FLASH_FRAMES = 6;
export const XFADE_FRAMES = 14;

export const HOOK = {
  badgeIn: 2,
  impactFrame: 12,
  holdUntil: 96,
  outEnd: 112,
  teaser: '0% PENGAWET · AWET 5 BULAN',
  title: ['Kenapa Dodol', 'Nggak Basi?'],
  kicker: 'RAHASIA DAPUR GARUT',
} as const;

export function hookShakeAt(frame: number): number {
  const d = frame - HOOK.impactFrame;
  return d < 0 ? 0 : Math.exp(-d / 5);
}

// ── Color Script (6 narrative lighting phases) ──────────────────────────────

export type ColorPhase =
  | 'goldenHook'
  | 'heritageMorning'
  | 'emberHeat'
  | 'scienceIndigo'
  | 'retroShop'
  | 'triumphDusk';

export interface PhasePalette {
  key: string;
  shadow: string;
  rim: string;
  tone: number;
}

export const COLOR_SCRIPT: Record<ColorPhase, PhasePalette> = {
  goldenHook: { key: '#ffbb66', shadow: '#2d1e48', rim: '#ffd999', tone: 0.52 },
  heritageMorning: { key: '#ffdf9e', shadow: '#44352a', rim: '#ffe8bc', tone: 0.44 },
  emberHeat: { key: '#ff944d', shadow: '#2b192e', rim: '#ffc478', tone: 0.58 },
  scienceIndigo: { key: '#88c4ff', shadow: '#1c2044', rim: '#bfe6ff', tone: 0.46 },
  retroShop: { key: '#ffe2ad', shadow: '#3d334c', rim: '#ffd18a', tone: 0.42 },
  triumphDusk: { key: '#ffb266', shadow: '#2a1d48', rim: '#ffe0a3', tone: 0.55 },
};

export type WorldId = 'dapurMacro' | 'garut1926' | 'kancahClose' | 'sainsCutaway' | 'tokoPicnic1959' | 'galeriEkspor';

export type Vec3 = readonly [number, number, number];
type Keys<T> = readonly (readonly [number, T])[];

export interface CameraKey {
  t: number;
  pos: Vec3;
  target: Vec3;
  fov: number;
}

export interface CastMember {
  look: LookId;
  anchor: string;
  scale: number;
  view?: Keys<'front' | 'side'>;
  mirror?: Keys<boolean>;
  facing?: -1 | 0 | 1;
  visible?: readonly [number, number];
  expression: Keys<Expr>;
  mode: Keys<ActionMode>;
  /** Continuous cycle speed (cycles per shot) for walk/stir/stoke, or keyed phase. */
  cycleRate?: number;
  lookDir?: Keys<number>;
  tilt?: Keys<number>;
  headTilt?: Keys<number>;
  move?: Keys<Vec3>;
  /** Optional 2D design-canvas grip target [x, y] so hands lock onto 3D tools. */
  handTarget?: readonly [number, number];
}

export interface Grade {
  sepia: Keys<number>;
  grey?: Keys<number>;
  tone?: number;
}

export interface Shot {
  id: string;
  from: number;
  to: number;
  world: WorldId;
  phase: ColorPhase;
  cut: 'dip' | 'hard' | 'flash' | 'xfade';
  chip: Keys<{ place: string; year: string }>;
  camera: readonly CameraKey[];
  aperture: Keys<number>;
  focus?: Keys<Vec3>;
  grade: Grade;
  cast: readonly CastMember[];
  kicks?: readonly number[];
  roll?: Keys<number>;
}

export const SHOTS: readonly Shot[] = [
  // 1 — Macro Hook (0.00–5.60 s | f0–168): Gleaming caramel dodol slice on banana leaf -> pulls back to calendar "5 BULAN"
  {
    id: 'hook-dodol',
    from: 0,
    to: 168,
    world: 'dapurMacro',
    phase: 'goldenHook',
    cut: 'hard',
    kicks: [0.07, 0.78],
    chip: [[0, { place: 'DODOL GARUT', year: '0% PENGAWET' }]],
    aperture: [[0, 0.72], [0.38, 0.42], [0.8, 0.22]],
    camera: [
      { t: 0, pos: [0.35, 1.38, 1.38], target: [0.0, 1.0, 0.0], fov: 32 },
      { t: 0.3, pos: [0.22, 1.44, 1.85], target: [0.0, 1.12, -0.2], fov: 35 },
      { t: 0.72, pos: [-0.35, 1.72, 3.25], target: [0.15, 1.48, -1.2], fov: 43 },
      { t: 1, pos: [-0.45, 1.8, 3.65], target: [0.2, 1.56, -1.4], fov: 45 },
    ],
    focus: [[0, [0, 1.0, 0]], [0.55, [0, 1.18, -0.3]], [0.85, [0.45, 1.75, -1.8]]],
    grade: { sepia: [[0, 0]], tone: 0.52 },
    cast: [],
  },

  // 2 — Ibu Karsinah 1926 (5.60–18.07 s | f168–542): Flash back to Garut 1926 kitchen; Ibu Karsinah prepares ketan/santan/gula aren
  {
    id: 'karsinah-1926',
    from: 168,
    to: 542,
    world: 'garut1926',
    phase: 'heritageMorning',
    cut: 'flash',
    kicks: [0.36],
    chip: [[0, { place: 'KAMPUNG CIBELENEUNG', year: 'GARUT 1926' }]],
    aperture: [[0, 0.34], [0.65, 0.4]],
    camera: [
      { t: 0, pos: [-0.2, 1.78, 7.1], target: [0.05, 1.25, -0.25], fov: 49 },
      { t: 0.45, pos: [0.05, 1.66, 6.6], target: [0.05, 1.22, -0.2], fov: 47 },
      { t: 1, pos: [0.25, 1.6, 6.0], target: [0.1, 1.18, -0.15], fov: 45 },
    ],
    grade: { sepia: [[0, 0.62], [0.5, 0.52]], tone: 0.44 },
    cast: [
      {
        look: 'ibuKarsinah',
        anchor: 'karsinah',
        scale: 1.0,
        view: [[0, 'front'], [0.45, 'side']],
        mirror: [[0, false]],
        facing: 1,
        expression: [[0, 'smile_closed'], [0.35, 'neutral'], [0.68, 'smile']],
        mode: [[0, 'pack'], [0.55, 'point'], [0.82, 'pack']],
        cycleRate: 2.5,
        lookDir: [[0, 0.5], [0.6, 0.2]],
        tilt: [[0, 5], [0.5, 8]],
        handTarget: [430, 585],
      },
      {
        look: 'pengaduk1',
        anchor: 'stirHelper',
        scale: 1.0,
        view: [[0, 'side']],
        mirror: [[0, true]],
        expression: [[0, 'neutral'], [0.7, 'stern']],
        mode: [[0, 'stir']],
        cycleRate: 5.5,
        handTarget: [438, 560],
      },
    ],
  },

  // 3 — 7–8 Hours Continuous Stirring & Hawu Stove (18.07–30.17 s | f542–905): Target-anchored stirring + crouching stoker
  {
    id: 'kancah-7jam',
    from: 542,
    to: 905,
    world: 'kancahClose',
    phase: 'emberHeat',
    cut: 'hard',
    kicks: [0.46],
    roll: [[0, 0], [0.42, 0], [0.5, 3.0], [0.68, 0]],
    chip: [[0, { place: 'KUJANG & HAWU', year: '7–8 JAM NONSTOP' }]],
    aperture: [[0, 0.36], [0.5, 0.32], [1, 0.38]],
    camera: [
      { t: 0, pos: [-0.1, 1.75, 6.2], target: [0.0, 1.15, 0.0], fov: 48 },
      { t: 0.46, pos: [0.15, 1.66, 5.8], target: [0.0, 1.08, 0.0], fov: 47 },
      { t: 0.78, pos: [0.38, 1.7, 5.35], target: [0.0, 1.05, 0.0], fov: 46 },
      { t: 1, pos: [0.25, 1.66, 5.55], target: [0.0, 1.08, 0.0], fov: 46 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.58 },
    cast: [
      {
        look: 'pengaduk1',
        anchor: 'stirMain',
        scale: 1.02,
        view: [[0, 'side']],
        mirror: [[0, false]],
        expression: [[0, 'stern'], [0.44, 'pained'], [0.76, 'relief']],
        mode: [[0, 'stir']],
        cycleRate: 7.5,
        handTarget: [435, 560],
      },
      {
        look: 'pengaduk2',
        anchor: 'stoker',
        scale: 0.98,
        view: [[0, 'side']],
        mirror: [[0, true]],
        expression: [[0, 'neutral'], [0.46, 'nervous'], [0.8, 'smile_closed']],
        mode: [[0, 'stoke']],
        cycleRate: 4.0,
        handTarget: [430, 745],
      },
    ],
  },

  // 4 — Science Pivot: Why It Doesn't Spoil (30.17–38.93 s | f905–1168): Cross-dissolve into macro dodol physics cutaway
  {
    id: 'sains-gula',
    from: 905,
    to: 1168,
    world: 'sainsCutaway',
    phase: 'scienceIndigo',
    cut: 'xfade',
    kicks: [0.7],
    chip: [[0, { place: 'FISIKA PANGAN', year: 'OSMOSIS GULA' }]],
    aperture: [[0, 0.3], [0.55, 0.24]],
    camera: [
      { t: 0, pos: [0.0, 1.56, 4.7], target: [0.0, 1.24, 0.0], fov: 44 },
      { t: 0.45, pos: [0.24, 1.52, 4.2], target: [0.0, 1.2, 0.0], fov: 43 },
      { t: 1, pos: [-0.2, 1.48, 4.0], target: [0.0, 1.18, 0.0], fov: 42 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.48 },
    cast: [],
  },

  // 5 — "Makanan Kampung" to Iconic Picnic 1957–1959 (38.93–50.87 s | f1168–1526)
  {
    id: 'picnic-1959',
    from: 1168,
    to: 1526,
    world: 'tokoPicnic1959',
    phase: 'retroShop',
    cut: 'flash',
    kicks: [0.65],
    chip: [
      [0, { place: 'ERA 1950-AN', year: 'STIGMA KAMPUNG' }],
      [0.34, { place: 'GARUT · BANDUNG', year: 'PICNIC 1959' }],
    ],
    aperture: [[0, 0.34], [0.5, 0.36]],
    camera: [
      { t: 0, pos: [-1.45, 1.48, 4.35], target: [-1.45, 1.22, 0.0], fov: 43 },
      { t: 0.32, pos: [-1.35, 1.48, 4.2], target: [-1.35, 1.22, 0.0], fov: 42 },
      { t: 0.46, pos: [1.18, 1.52, 4.65], target: [1.25, 1.24, -0.15], fov: 44 },
      { t: 1, pos: [1.3, 1.5, 4.25], target: [1.25, 1.24, -0.15], fov: 43 },
    ],
    grade: { sepia: [[0, 0.35], [0.38, 0.08], [1, 0]], tone: 0.42 },
    cast: [
      {
        look: 'kritikusKota',
        anchor: 'kritikus',
        scale: 1.0,
        view: [[0, 'front']],
        facing: 1,
        visible: [0, 0.42],
        expression: [[0, 'smile'], [0.18, 'stern']],
        mode: [[0, 'point']],
        lookDir: [[0, -0.8]],
      },
      {
        look: 'pendiriPicnic',
        anchor: 'iton',
        scale: 1.0,
        view: [[0, 'front'], [0.6, 'side']],
        mirror: [[0, false]],
        facing: -1,
        expression: [[0, 'neutral'], [0.45, 'smile'], [0.66, 'grin']],
        mode: [[0, 'stand'], [0.52, 'present']],
        lookDir: [[0, 0.3]],
      },
      {
        look: 'aamMawardi',
        anchor: 'aam',
        scale: 0.98,
        view: [[0, 'front']],
        facing: -1,
        expression: [[0, 'smile_closed'], [0.68, 'relief_open']],
        mode: [[0, 'stand'], [0.58, 'point']],
      },
    ],
  },

  // 6 — Export & Warm Finale (50.87–60.00 s | f1526–1800): Tokyo & Middle East crates + tasting + calm patient stirring
  {
    id: 'ekspor-payoff',
    from: 1526,
    to: 1800,
    world: 'galeriEkspor',
    phase: 'triumphDusk',
    cut: 'dip',
    roll: [[0, 0], [0.6, 0], [1, 1.6]],
    chip: [[0, { place: 'GARUT -> DUNIA', year: 'JEPANG & TIMUR TENGAH' }]],
    aperture: [[0, 0.3], [0.55, 0.22], [1, 0.12]],
    camera: [
      { t: 0, pos: [0.05, 1.56, 4.95], target: [0.15, 1.2, -0.3], fov: 45 },
      { t: 0.48, pos: [0.15, 1.66, 5.55], target: [-0.05, 1.24, -0.5], fov: 47 },
      { t: 1, pos: [0.35, 1.95, 6.8], target: [-0.15, 1.38, -1.0], fov: 49 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.55 },
    cast: [
      {
        look: 'pembeliModern',
        anchor: 'pembeli',
        scale: 1.0,
        view: [[0, 'front']],
        facing: -1,
        expression: [[0, 'lick'], [0.36, 'smile_closed'], [0.65, 'grin']],
        mode: [[0, 'taste'], [0.52, 'present']],
      },
      {
        look: 'pembeliAnak',
        anchor: 'anak',
        scale: 0.95,
        view: [[0, 'front']],
        facing: 1,
        expression: [[0, 'grin'], [0.55, 'laugh']],
        mode: [[0, 'stand'], [0.45, 'point']],
      },
      {
        look: 'pengaduk1',
        anchor: 'stirBack',
        scale: 0.98,
        view: [[0, 'side']],
        mirror: [[0, false]],
        expression: [[0, 'smile_closed'], [0.72, 'relief']],
        mode: [[0, 'stir']],
        cycleRate: 4.5,
        handTarget: [435, 560],
      },
    ],
  },
];

export const FX_CUES: readonly FxCue[] = [
  { shot: 'hook-dodol', at: 0.08, frames: 26, kind: 'spark', offset: [0.22, 1.05, 0.14], scale: 0.26 },
  { shot: 'hook-dodol', at: 0.06, frames: 18, kind: 'speedLines' },
  { shot: 'karsinah-1926', at: 0.32, frames: 42, kind: 'steam', offset: [0.82, 1.38, -0.15], scale: 0.52 },
  { shot: 'karsinah-1926', at: 0.65, frames: 36, kind: 'aroma', actor: 0, side: 1, scale: 0.38 },
  { shot: 'kancah-7jam', at: 0.14, frames: 44, kind: 'steam', offset: [0.0, 1.36, 0.0], scale: 0.58 },
  { shot: 'kancah-7jam', at: 0.44, frames: 20, kind: 'speedLines' },
  { shot: 'kancah-7jam', at: 0.45, frames: 32, kind: 'strainTicks', actor: 0, side: -1, scale: 0.34 },
  { shot: 'kancah-7jam', at: 0.52, frames: 28, kind: 'sweat', actor: 0, side: -1, scale: 0.28 },
  { shot: 'kancah-7jam', at: 0.72, frames: 34, kind: 'bubblePop', offset: [0.0, 1.18, 0.1], scale: 0.46 },
  { shot: 'sains-gula', at: 0.22, frames: 96, kind: 'sugarLock', offset: [0.62, 1.38, 0.25], scale: 0.48 },
  { shot: 'sains-gula', at: 0.68, frames: 24, kind: 'spark', offset: [-0.15, 1.38, 0.25], scale: 0.32 },
  { shot: 'picnic-1959', at: 0.64, frames: 20, kind: 'speedLines' },
  { shot: 'picnic-1959', at: 0.65, frames: 32, kind: 'spark', actor: 1, side: 1, scale: 0.34 },
  { shot: 'ekspor-payoff', at: 0.22, frames: 44, kind: 'aroma', actor: 0, side: -1, scale: 0.34 },
  { shot: 'ekspor-payoff', at: 0.62, frames: 48, kind: 'steam', offset: [-0.95, 1.4, -1.35], scale: 0.52 },
];

// ── Playback & Camera Kinematics ────────────────────────────────────────────

export interface ShotState {
  shot: Shot;
  index: number;
  localFrame: number;
  progress: number;
}

export function getShotIndexAt(frame: number): number {
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    const s = SHOTS[i];
    if (s && frame >= s.from) return i;
  }
  return 0;
}

export function getShotAt(frame: number): ShotState {
  const index = getShotIndexAt(frame);
  const shot = SHOTS[index];
  if (!shot) throw new Error(`No shot at frame ${frame}`);
  const localFrame = Math.max(0, frame - shot.from);
  const progress = clamp01(localFrame / Math.max(1, shot.to - shot.from - 1));
  return { shot, index, localFrame, progress };
}

export function stepped<T>(keys: Keys<T>, t: number): T {
  const first = keys[0];
  if (!first) throw new Error('stepped(): empty keys');
  let v = first[1];
  for (const k of keys) if (t >= k[0]) v = k[1];
  return v;
}

export function cutDipAt(frame: number): number {
  let dip = 0;
  for (let i = 1; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (!s || s.cut !== 'dip') continue;
    const d = Math.abs(frame + 0.5 - s.from) / SHOT_DIP_FRAMES;
    dip = Math.max(dip, 1 - smoothstep(0, 1, d));
  }
  return Math.max(dip, smoothstep(DG_DURATION_IN_FRAMES - 18, DG_DURATION_IN_FRAMES - 1, frame));
}

export function cutFlashAt(frame: number): number {
  let f = 0;
  for (const s of SHOTS) {
    if (s.cut !== 'flash') continue;
    const d = frame - s.from;
    if (d >= 0 && d < FLASH_FRAMES) f = Math.max(f, Math.pow(1 - d / FLASH_FRAMES, 1.5));
  }
  return f;
}

export function xfadeAt(frame: number): { active: boolean; blend: number; outgoingShot: number; outgoingFrame: number } {
  for (let i = 1; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (!s || s.cut !== 'xfade') continue;
    const d = frame - s.from;
    if (d >= 0 && d < XFADE_FRAMES) {
      return { active: true, blend: 1 - smoothstep(0, XFADE_FRAMES, d), outgoingShot: i - 1, outgoingFrame: s.from - 1 };
    }
  }
  return { active: false, blend: 0, outgoingShot: 0, outgoingFrame: 0 };
}

export function gradeAt(frame: number): { sepia: number; grey: number; tone: number } {
  const { shot, progress } = getShotAt(frame);
  return {
    sepia: keyed(shot.grade.sepia, progress),
    grey: shot.grade.grey ? keyed(shot.grade.grey, progress) : 0,
    tone: shot.grade.tone ?? 0.45,
  };
}

export function isCastVisible(member: CastMember, progress: number): boolean {
  const [a, b] = member.visible ?? [0, 1];
  return progress >= a && progress <= b;
}

export function expressionAt(keys: Keys<Expr>, shot: Shot, localFrame: number): Expr {
  const len = Math.max(1, shot.to - shot.from - 1);
  let active = keys[0]?.[1] ?? 'neutral';
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (!k) continue;
    const kf = Math.round(k[0] * len);
    if (localFrame >= kf) active = k[1];
    else break;
  }
  return active;
}

/** Auto 4-frame blink right over an expression swap so swaps feel crisp & alive. */
export function swapBlinkAt(keys: Keys<Expr>, shot: Shot, localFrame: number): number {
  const len = Math.max(1, shot.to - shot.from - 1);
  const seq = [0.5, 1, 1, 0.5];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (!k) continue;
    const kf = Math.round(k[0] * len);
    const d = localFrame - (kf - 1);
    if (d >= 0 && d < 4) return seq[d] ?? 0;
  }
  return 0;
}

export function keyedVec3(keys: Keys<Vec3> | undefined, t: number, out: THREE.Vector3): THREE.Vector3 {
  if (!keys || keys.length === 0) return out.set(0, 0, 0);
  const xs = keys.map(([k, v]) => [k, v[0]] as const);
  const ys = keys.map(([k, v]) => [k, v[1]] as const);
  const zs = keys.map(([k, v]) => [k, v[2]] as const);
  return out.set(keyed(xs, t), keyed(ys, t), keyed(zs, t));
}

export interface CameraSample {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
  focus: number;
}

interface CameraRig {
  pos: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  times: number[];
}

const rigCache = new Map<string, CameraRig>();

function rigFor(shot: Shot): CameraRig {
  const hit = rigCache.get(shot.id);
  if (hit) return hit;
  const keys = shot.camera.length >= 2 ? shot.camera : [...shot.camera, ...shot.camera];
  const rig: CameraRig = {
    pos: new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal'),
    target: new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.target)), false, 'centripetal'),
    times: keys.map((k) => k.t),
  };
  rigCache.set(shot.id, rig);
  return rig;
}

export const smootherstep = (x: number): number => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

function curveParam(times: readonly number[], t: number): number {
  const n = times.length - 1;
  for (let i = 1; i <= n; i++) {
    const a = times[i - 1] ?? 0;
    const b = times[i] ?? 1;
    if (t <= b || i === n) {
      const local = b > a ? clamp01((t - a) / (b - a)) : 1;
      return (i - 1 + smootherstep(local)) / n;
    }
  }
  return 1;
}

const creepCache = new Map<string, Float32Array>();

function creepFor(shot: Shot): Float32Array {
  const hit = creepCache.get(shot.id);
  if (hit) return hit;
  const rig = rigFor(shot);
  const len = Math.max(2, shot.to - shot.from);
  const out = new Float32Array(len);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let acc = 0;
  for (let i = 0; i < len; i++) {
    rig.pos.getPoint(curveParam(rig.times, clamp01((i - 1) / (len - 1))), a);
    rig.pos.getPoint(curveParam(rig.times, clamp01(i / (len - 1))), b);
    const hold = 1 - smoothstep(0.002, 0.006, a.distanceTo(b));
    acc = Math.min(0.11, acc + hold * 0.0018);
    out[i] = acc;
  }
  creepCache.set(shot.id, out);
  return out;
}

function kickAt(shot: Shot, localFrame: number): number {
  let k = 0;
  const len = shot.to - shot.from - 1;
  for (const p of shot.kicks ?? []) {
    const d = localFrame - Math.round(p * len);
    if (d >= 0 && d < 7) k += (d % 2 === 0 ? 1 : -1) * (1 - d / 7);
  }
  return k;
}

const focusPoint = new THREE.Vector3();

export function sampleCamera(frame: number, out?: CameraSample): CameraSample {
  const { shot, progress, localFrame } = getShotAt(frame);
  const rig = rigFor(shot);
  const u = curveParam(rig.times, progress);
  const sample = out ?? { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40, roll: 0, focus: 5 };
  rig.pos.getPoint(u, sample.position);
  rig.target.getPoint(u, sample.target);
  const creep = creepFor(shot)[Math.min(localFrame, shot.to - shot.from - 1)] ?? 0;
  sample.position.lerp(sample.target, creep);
  sample.fov = keyed(shot.camera.map((k) => [k.t, k.fov] as const), progress);
  const s = frame / DG_FPS;
  sample.position.x += Math.sin(s * 0.9) * 0.005;
  sample.position.y += Math.sin(s * 1.3 + 1) * 0.004;
  const k = hookShakeAt(frame);
  const kick = kickAt(shot, localFrame);
  sample.position.x += k * 0.015 * Math.sin(frame * 2.9) + kick * 0.018;
  sample.position.y += k * 0.012 * Math.sin(frame * 3.7 + 1) - Math.abs(kick) * 0.009;
  sample.roll =
    k * 0.014 * Math.sin(frame * 2.6 + 1.3) +
    kick * 0.004 +
    (shot.roll ? (keyed(shot.roll, progress) * Math.PI) / 180 : 0);
  if (shot.focus) keyedVec3(shot.focus, progress, focusPoint);
  else focusPoint.copy(sample.target);
  sample.focus = sample.position.distanceTo(focusPoint);
  return sample;
}

export function apertureAt(frame: number): number {
  const { shot, progress } = getShotAt(frame);
  return keyed(shot.aperture, progress);
}
