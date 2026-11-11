import * as THREE from 'three';
import type { ArmPose, BodyPose, Expression, HandProp, BodyProp, LookId, Vec3 } from '../cikajang/story';
import { clamp01, keyed, smoothstep } from '../cikajang/story';

/**
 * "Jam Gadang: Kenapa Angka 4 Tertulis IIII?" (30 s / 900 frames @ 30 fps)
 * Original PyxisLab episode built strictly to `pyxis-beanhead-style` v2.2
 * without modifying any Cikajang/Persis core modules.
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
export type { CaptionPage, SentenceTiming, Vec3, WordTiming } from '../persis/story';
export type { ArmPose, BodyPose, Expression, HandProp, BodyProp, LookId };

export const JG_FPS = 30;
export const JG_DURATION_IN_FRAMES = 900;
export const JG_WIDTH = 1080;
export const JG_HEIGHT = 1920;
export const SHOT_DIP_FRAMES = 6;
export const FLASH_FRAMES = 6;
export const XFADE_FRAMES = 14;

/** Opening hook (0–3 s): upper frame layout keeps macro dial IIII centered & unobstructed. */
export const HOOK = {
  badgeIn: 2,
  impactFrame: 12,
  holdUntil: 74,
  outEnd: 88,
  teaser: 'BUKITTINGGI · 1926',
  title: ['Angkanya', 'Salah Tulis?'],
  kicker: 'MISTERI JAM GADANG',
} as const;

export function hookShakeAt(frame: number): number {
  const d = frame - HOOK.impactFrame;
  return d < 0 ? 0 : Math.exp(-d / 5);
}

// ── Colour Script Table (v2.2 §5.4) ─────────────────────────────────────────

export type ColorPhase =
  | 'goldenHook'
  | 'colonialSepia'
  | 'twilightRumor'
  | 'brassChamber'
  | 'daylightSymmetry'
  | 'triumphDusk';

export interface PhasePalette {
  key: string;
  shadow: string;
  rim: string;
  rimStrength: number;
  lightSide: number;
  haze: string;
}

export const COLOR_SCRIPT: Record<ColorPhase, PhasePalette> = {
  goldenHook: { key: '#ffa64d', shadow: '#281d48', rim: '#ffcf78', rimStrength: 0.9, lightSide: -1, haze: '#54345a' },
  colonialSepia: { key: '#ffdc9e', shadow: '#443528', rim: '#f5d29a', rimStrength: 0.65, lightSide: 1, haze: '#d8c8a8' },
  twilightRumor: { key: '#90a4d4', shadow: '#262244', rim: '#b8caff', rimStrength: 0.72, lightSide: -1, haze: '#4c5474' },
  brassChamber: { key: '#ffbe66', shadow: '#231932', rim: '#ffd98a', rimStrength: 0.95, lightSide: -1, haze: '#2d2022' },
  daylightSymmetry: { key: '#fff2d8', shadow: '#465878', rim: '#ffffff', rimStrength: 0.55, lightSide: -1, haze: '#b8d4e8' },
  triumphDusk: { key: '#ffb060', shadow: '#2b1e4a', rim: '#ffd98e', rimStrength: 0.92, lightSide: -1, haze: '#6a4462' },
};

export type WorldId = 'plazaGadang' | 'konstruksi1926' | 'tamanRumor' | 'chamberCutaway' | 'dialClose';

export interface CameraKey {
  t: number;
  pos: Vec3;
  target: Vec3;
  fov: number;
}

type Keys<T> = readonly (readonly [number, T])[];

export interface CastMember {
  actor: LookId;
  anchor: string;
  scale: number;
  pose: BodyPose;
  visible?: readonly [number, number];
  expression: Keys<Expression>;
  left?: Keys<ArmPose>;
  right?: Keys<ArmPose>;
  leftProp?: HandProp;
  rightProp?: HandProp;
  bodyProp?: BodyProp;
  turn?: Keys<number>;
  nod?: Keys<number>;
  move?: Keys<Vec3>;
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
  flashes?: readonly number[];
}

export type FxKind = 'sweat' | 'question' | 'exclaim' | 'zzz' | 'spark' | 'speedLines';

export interface FxCue {
  shot: string;
  at: number;
  frames: number;
  kind: FxKind;
  actor?: number;
  side?: -1 | 1;
  offset?: Vec3;
  scale?: number;
}

const dinda = (m: Omit<CastMember, 'actor' | 'scale'> & { scale?: number }): CastMember => ({
  actor: 'dinda',
  scale: 1.25,
  bodyProp: 'backpack',
  ...m,
});

export const SHOTS: readonly Shot[] = [
  // 1 — Macro Hook (0–4.60 s): macro punch onto gleaming IIII dial glyph, 3/4 sweeping pull-back revealing full Bagonjong Jam Gadang!
  {
    id: 'hook-dial',
    from: 0,
    to: 138,
    world: 'plazaGadang',
    phase: 'goldenHook',
    cut: 'hard',
    kicks: [0.08, 0.82],
    chip: [[0, { place: 'JAM GADANG', year: 'BUKITTINGGI' }]],
    aperture: [[0, 0.72], [0.32, 0.42], [0.7, 0.16]],
    camera: [
      { t: 0, pos: [0.8, 13.54, 4.05], target: [0.8, 13.54, 1.82], fov: 29 },
      { t: 0.24, pos: [0.8, 13.54, 3.65], target: [0.8, 13.54, 1.82], fov: 27 },
      { t: 0.56, pos: [2.6, 6.2, 15.0], target: [0, 9.8, 0.6], fov: 49 },
      { t: 1, pos: [5.0, 2.8, 27.5], target: [0, 9.8, 0.8], fov: 53 },
    ],
    focus: [[0, [0.8, 13.54, 1.82]], [0.45, [0.8, 13.54, 1.82]], [0.85, [0, 2.0, 4.2]]],
    grade: { sepia: [[0, 0]], tone: 0.56 },
    cast: [
      dinda({
        anchor: 'dindaPlaza',
        pose: 'stand',
        expression: [[0, 'wonder'], [0.78, 'thinking']],
        right: [[0, 'pointHigh'], [0.75, 'pointHigh'], [0.9, 'palm']],
        left: [[0, 'strap']],
        turn: [[0, -0.25], [0.75, 0.15]],
      }),
    ],
  },
  // 2 — 1926 Construction (4.60–11.07 s): Colonial Fort de Kock signboard + Architect Yazid Rajo Mangkuto.
  {
    id: 'bangun-1926',
    from: 138,
    to: 332,
    world: 'konstruksi1926',
    phase: 'colonialSepia',
    cut: 'flash',
    roll: [[0, 0], [0.78, 0], [0.95, 3.0]],
    chip: [[0, { place: 'FORT DE KOCK', year: '1926' }]],
    aperture: [[0, 0.38], [0.65, 0.48]],
    camera: [
      { t: 0, pos: [-0.25, 1.65, 5.45], target: [0.08, 1.48, -0.8], fov: 42 },
      { t: 0.45, pos: [0.1, 1.5, 4.9], target: [0.12, 1.38, -0.7], fov: 40 },
      { t: 1, pos: [0.32, 1.4, 4.25], target: [0.18, 1.3, -0.6], fov: 39 },
    ],
    grade: { sepia: [[0, 0.85]], tone: 0.45 },
    cast: [
      {
        actor: 'bapakPeci',
        anchor: 'yazid',
        scale: 1.18,
        pose: 'stand',
        expression: [[0, 'serious'], [0.45, 'thinking'], [0.82, 'shock']],
        right: [[0, 'pointHigh'], [0.62, 'palm'], [0.85, 'hip']],
        left: [[0, 'hip']],
        turn: [[0, 0.35], [0.6, 0.15]],
      },
      {
        actor: 'pekerjaRel',
        anchor: 'tukang',
        scale: 1.12,
        pose: 'stand',
        expression: [[0, 'neutral'], [0.76, 'wonder']],
        right: [[0, 'hammer'], [0.5, 'side']],
        left: [[0, 'hip']],
        rightProp: 'hammer',
        turn: [[0, -0.45]],
      },
    ],
  },
  // 3 — Rumor & Reveal Pivot (11.07–14.73 s): Townspeople whisper before glowing Jam Gadang; Dinda steps in calmly!
  {
    id: 'rumor-iv',
    from: 332,
    to: 442,
    world: 'tamanRumor',
    phase: 'twilightRumor',
    cut: 'dip',
    kicks: [0.58],
    roll: [[0, 0], [0.5, -2.5], [0.65, 0]],
    chip: [[0, { place: 'BUKITTINGGI', year: 'RUMOR' }]],
    aperture: [[0, 0.36], [0.6, 0.42]],
    camera: [
      { t: 0, pos: [-0.25, 1.42, 5.15], target: [-0.08, 1.25, -0.8], fov: 44 },
      { t: 0.45, pos: [0.05, 1.38, 4.8], target: [0.0, 1.22, -0.7], fov: 44 },
      { t: 1, pos: [0.15, 1.35, 4.5], target: [0.05, 1.2, -0.6], fov: 43 },
    ],
    grade: { sepia: [[0, 0]], grey: [[0, 0.08]], tone: 0.5 },
    cast: [
      {
        actor: 'warga',
        anchor: 'warga1',
        scale: 1.1,
        pose: 'stand',
        expression: [[0, 'thinking'], [0.35, 'wonder'], [0.62, 'shock']],
        right: [[0, 'palm'], [0.45, 'hip']],
        left: [[0, 'side']],
        turn: [[0, 0.55]],
      },
      {
        actor: 'penumpangPria',
        anchor: 'warga2',
        scale: 1.14,
        pose: 'stand',
        expression: [[0, 'smirk'], [0.62, 'wonder']],
        right: [[0, 'hip']],
        left: [[0, 'pointSide']],
        turn: [[0, -0.55]],
      },
      dinda({
        anchor: 'dindaWalk',
        pose: 'stand',
        expression: [[0, 'neutral'], [0.52, 'smirk'], [0.78, 'warm']],
        right: [[0, 'side'], [0.54, 'palm'], [0.85, 'pointHigh']],
        left: [[0, 'side'], [0.52, 'strap']],
        turn: [[0, -0.35], [0.45, 0]],
        move: [[0, [0.9, 0, 0.15]], [0.48, [0, 0, 0]]],
      }),
    ],
  },
  // 4 — Cut-Away Inside Rotterdam Mechanism (14.73–19.27 s): Orbit open-spoked brass cogwheels & giant pendulum!
  {
    id: 'mesin-cutaway',
    from: 442,
    to: 578,
    world: 'chamberCutaway',
    phase: 'brassChamber',
    cut: 'xfade',
    chip: [[0, { place: 'MESIN ROTTERDAM', year: '1926' }]],
    aperture: [[0, 0.45], [0.5, 0.38], [1, 0.42]],
    camera: [
      { t: 0, pos: [-0.45, 1.65, 3.85], target: [0.05, 1.48, -1.2], fov: 45 },
      { t: 0.55, pos: [0.42, 1.68, 3.58], target: [0.1, 1.45, -1.2], fov: 44 },
      { t: 1, pos: [0.18, 1.48, 3.92], target: [0.1, 1.38, -1.2], fov: 45 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.58 },
    cast: [
      {
        actor: 'kepalaStasiun',
        anchor: 'tukangJam',
        scale: 1.08,
        pose: 'stand',
        expression: [[0, 'serious'], [0.48, 'warm']],
        right: [[0, 'pointHigh'], [0.65, 'palm']],
        left: [[0, 'hip']],
        turn: [[0, -0.3]],
      },
    ],
  },
  // 5 — Daylight Symmetry Proof (19.27–23.40 s): Hero dial glowing comparison between IIII and VIII!
  {
    id: 'simetri-viii',
    from: 578,
    to: 702,
    world: 'dialClose',
    phase: 'daylightSymmetry',
    cut: 'hard',
    kicks: [0.48],
    chip: [[0, { place: 'SIMETRI HOROLOGI', year: 'IIII = VIII' }]],
    aperture: [[0, 0.25]],
    camera: [
      { t: 0, pos: [0, 1.92, 8.15], target: [0, 1.9, 0], fov: 46 },
      { t: 0.48, pos: [0.06, 1.9, 7.5], target: [0, 1.88, 0], fov: 45 },
      { t: 1, pos: [0, 1.92, 8.05], target: [0, 1.9, 0], fov: 46 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.36 },
    cast: [],
  },
  // 6 — Golden Dusk Finale (23.40–30.00 s): Crane pull-back from smiling Dinda to majestic 3/4 view of illuminated Jam Gadang square!
  {
    id: 'seimbang-senja',
    from: 702,
    to: 900,
    world: 'plazaGadang',
    phase: 'triumphDusk',
    cut: 'dip',
    roll: [[0, 0], [0.55, 0], [1, 2.2]],
    chip: [[0, { place: 'JAM GADANG', year: 'KINI' }]],
    aperture: [[0, 0.38], [0.6, 0.22], [1, 0.12]],
    camera: [
      { t: 0, pos: [0.6, 1.4, 8.8], target: [0.45, 1.15, 5.4], fov: 42 },
      { t: 0.45, pos: [-2.8, 2.8, 18.2], target: [0, 7.8, 0.8], fov: 51 },
      { t: 1, pos: [-5.8, 3.8, 29.0], target: [0, 9.8, 0.8], fov: 54 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.58 },
    cast: [
      dinda({
        anchor: 'dindaPlaza',
        pose: 'stand',
        expression: [[0, 'warm'], [0.45, 'laugh']],
        right: [[0, 'palm'], [0.65, 'wave']],
        left: [[0, 'strap']],
        turn: [[0, 0.1], [0.4, -0.15]],
      }),
    ],
  },
];

export const FX_CUES: readonly FxCue[] = [
  { shot: 'hook-dial', at: 0.08, frames: 28, kind: 'spark', offset: [0.8, 13.54, 1.85], scale: 0.34 },
  { shot: 'hook-dial', at: 0.06, frames: 18, kind: 'speedLines' },
  { shot: 'bangun-1926', at: 0.78, frames: 26, kind: 'sweat', actor: 1, side: 1, scale: 0.22 },
  { shot: 'rumor-iv', at: 0.14, frames: 32, kind: 'question', actor: 0, side: 1, scale: 0.3 },
  { shot: 'rumor-iv', at: 0.56, frames: 20, kind: 'speedLines' },
  { shot: 'rumor-iv', at: 0.58, frames: 28, kind: 'exclaim', actor: 2, side: 1, scale: 0.28 },
  { shot: 'mesin-cutaway', at: 0.48, frames: 32, kind: 'spark', actor: 0, side: -1, scale: 0.28 },
  { shot: 'simetri-viii', at: 0.5, frames: 18, kind: 'speedLines' },
  { shot: 'seimbang-senja', at: 0.55, frames: 38, kind: 'spark', offset: [0.8, 13.54, 1.85], scale: 0.65 },
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
  return Math.max(dip, smoothstep(JG_DURATION_IN_FRAMES - 18, JG_DURATION_IN_FRAMES - 1, frame));
}

export function cutFlashAt(frame: number): number {
  let f = 0;
  const pulse = (start: number): void => {
    const d = frame - start;
    if (d >= 0 && d < FLASH_FRAMES) f = Math.max(f, Math.pow(1 - d / FLASH_FRAMES, 1.5));
  };
  for (const s of SHOTS) {
    if (s.cut === 'flash') pulse(s.from);
    for (const p of s.flashes ?? []) pulse(Math.round(s.from + p * (s.to - s.from - 1)));
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

export function blendKeys<T>(keys: Keys<T> | undefined, fallback: T, progress: number, ramp = 0.06): { from: T; to: T; mix: number } {
  const first = keys?.[0];
  if (!keys || !first) return { from: fallback, to: fallback, mix: 0 };
  let prev = first;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (!k) continue;
    if (progress < k[0]) return { from: prev[1], to: k[1], mix: smoothstep(k[0] - ramp, k[0], progress) };
    prev = k;
  }
  return { from: prev[1], to: prev[1], mix: 0 };
}

export function expressionKeyAt(keys: Keys<Expression>, shot: Shot, localFrame: number, progress: number): { value: { from: Expression; to: Expression; mix: number }; age: number } {
  const len = Math.max(1, shot.to - shot.from - 1);
  let active = keys[0]?.[1] ?? 'neutral';
  let start = 0;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (!k) continue;
    const kf = Math.round(k[0] * len);
    if (localFrame >= kf) {
      active = k[1];
      start = kf;
    } else if (kf - localFrame <= 2) {
      return { value: { from: active, to: k[1], mix: smoothstep(kf - 2, kf, localFrame) }, age: 99 };
    } else break;
  }
  void progress;
  return { value: { from: active, to: active, mix: 0 }, age: localFrame - start };
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
    acc = Math.min(0.12, acc + hold * 0.002);
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
  const sample = out ?? { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38, roll: 0, focus: 5 };
  rig.pos.getPoint(u, sample.position);
  rig.target.getPoint(u, sample.target);
  const creep = creepFor(shot)[Math.min(localFrame, shot.to - shot.from - 1)] ?? 0;
  sample.position.lerp(sample.target, creep);
  sample.fov = keyed(shot.camera.map((k) => [k.t, k.fov] as const), progress);
  const s = frame / JG_FPS;
  sample.position.x += Math.sin(s * 0.9) * 0.006;
  sample.position.y += Math.sin(s * 1.3 + 1) * 0.004;
  const k = hookShakeAt(frame);
  const kick = kickAt(shot, localFrame);
  sample.position.x += k * 0.015 * Math.sin(frame * 2.9) + kick * 0.02;
  sample.position.y += k * 0.012 * Math.sin(frame * 3.7 + 1) - Math.abs(kick) * 0.01;
  sample.roll = k * 0.016 * Math.sin(frame * 2.6 + 1.3) + kick * 0.005 + (shot.roll ? (keyed(shot.roll, progress) * Math.PI) / 180 : 0);
  if (shot.focus) keyedVec3(shot.focus, progress, focusPoint);
  else focusPoint.copy(sample.target);
  sample.focus = sample.position.distanceTo(focusPoint);
  return sample;
}

export function apertureAt(frame: number): number {
  const { shot, progress } = getShotAt(frame);
  return keyed(shot.aperture, progress);
}
