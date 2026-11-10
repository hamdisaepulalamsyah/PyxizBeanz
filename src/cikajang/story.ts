import * as THREE from 'three';
import { clamp01, keyed, lerp, smoothstep } from '../persis/story';

/**
 * "Sejarah Cikajang, Garut: Dua Angka di Pintu Stasiun" — shot list (13 shots
 * from the director's storyboard), camera splines, cast blocking, colour grade
 * and narration helpers. Pure data + pure functions of the frame so any frame
 * renders independently.
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
import type { Vec3 } from '../persis/story';

export const CIKAJANG_FPS = 30;
export const CIKAJANG_DURATION_IN_FRAMES = 3640;
export const CIKAJANG_WIDTH = 1080;
export const CIKAJANG_HEIGHT = 1920;
/** Frames of the dip-to-dark on each side of a `dip` cut. */
export const SHOT_DIP_FRAMES = 7;

/** Opening hook overlay (first ~3 s) over the close-up of the carved years. */
export const HOOK = {
  badgeIn: 2,
  impactFrame: 16,
  holdUntil: 84,
  outEnd: 98,
  teaser: 'STASIUN TERTINGGI DI ASIA TENGGARA',
  title: ['Dua Angka', 'di Pintu Stasiun'],
  kicker: 'SEJARAH CIKAJANG, GARUT',
} as const;

export function hookShakeAt(frame: number): number {
  const d = frame - HOOK.impactFrame;
  return d < 0 ? 0 : Math.exp(-d / 6);
}

// ── Cast vocabulary ─────────────────────────────────────────────────────────

export type WorldId =
  | 'stationRear'
  | 'platformMist'
  | 'ladang'
  | 'office1930'
  | 'cibatu'
  | 'carriage'
  | 'garut1935'
  | 'office1980'
  | 'garut1982'
  | 'cikajangToday'
  | 'garut2022';

/** Every on-screen figure (lead, extras and animals) uses the same billboard toon system. */
export type LookId =
  | 'dinda'
  | 'petani'
  | 'kepalaStasiun'
  | 'stafKoran'
  | 'kondektur'
  | 'penumpangPria'
  | 'penumpangWanita'
  | 'ibuBakul'
  | 'bapakPeci'
  | 'petugas1935'
  | 'pekerjaRel'
  | 'pekerjaRel2'
  | 'petugas1980'
  | 'petugas1982'
  | 'anak'
  | 'anakModern'
  | 'warga'
  | 'penumpangModern'
  | 'penumpangModern2'
  | 'ayam'
  | 'kucing';

export type BodyPose = 'stand' | 'sit';

/**
 * Named hand targets. Arms are always drawn (2-bone IK from the shoulder), so a
 * change of pose blends the hand target smoothly — hands never pop in or vanish.
 */
export type ArmPose =
  | 'side'
  | 'hip'
  | 'strap'
  | 'pocket'
  | 'point'
  | 'pointHigh'
  | 'pointSide'
  | 'spread'
  | 'trace'
  | 'traceLow'
  | 'knee'
  | 'lap'
  | 'write'
  | 'pressPage'
  | 'chalk'
  | 'holdBoard'
  | 'whistle'
  | 'lampLow'
  | 'hammer'
  | 'carryShoulder'
  | 'hug'
  | 'basketLap'
  | 'suitcase'
  | 'ticket'
  | 'newspaper'
  | 'reachUp'
  | 'wave'
  /** Open palm, presenter "explaining" gesture. */
  | 'palm';

/** Exactly one object per hand, attached for the whole shot (never a second pen). */
export type HandProp = 'none' | 'pen' | 'chalk' | 'whistle' | 'signalLamp' | 'hammer' | 'ticket' | 'suitcase' | 'phone';

/** Larger props carried by the body and gripped by the hands. */
export type BodyProp = 'none' | 'backpack' | 'shoulderBasket' | 'lapSack' | 'lapBakul' | 'lapBoard' | 'newspaper' | 'deskNotebook';

export type Expression = 'neutral' | 'warm' | 'serious' | 'thinking' | 'sad' | 'wonder' | 'smirk' | 'shock' | 'laugh';

/** Frames an expression swap takes: snappy, never a slow morph (skill v2.2 §3). */
export const EXPRESSION_SNAP_FRAMES = 2;

// ── Color script (skill v2.2 §5.4): lighting narrates the story ─────────────

export type ColorPhase = 'goldenDusk' | 'mountainMorning' | 'colonialWarm' | 'crisisCold' | 'closureGrey' | 'todayBright' | 'climaxGold';

export interface ColorScriptEntry {
  /** What the phase means in the story. */
  mood: string;
  /** Key light colour (sun / lamp). */
  key: string;
  /** Shadow colour — indigo / lavender / amber, never dead grey. */
  shadow: string;
  /** Rim-light tint painted on character cards (follows the key). */
  rim: string;
  /** Rim strength 0..1 on the character cards. */
  rimStrength: number;
  /** Emissive glow tint for hero props (lanterns, carved letters). */
  glow: string;
  /** Atmosphere: fog / haze tint. */
  haze: string;
}

export const COLOR_SCRIPT: Readonly<Record<ColorPhase, ColorScriptEntry>> = {
  goldenDusk: { mood: 'Pembuka / harapan — senja emas di pintu tua', key: '#ffa550', shadow: '#2c1f4a', rim: '#ffc27a', rimStrength: 0.85, glow: '#ffd27a', haze: '#e8a070' },
  mountainMorning: { mood: 'Pagi pegunungan berkicau, embun & kabut berlapis', key: '#fff1d6', shadow: '#4a5a8a', rim: '#fff4e0', rimStrength: 0.55, glow: '#fff0c8', haze: '#c8d8e4' },
  colonialWarm: { mood: 'Kejayaan 1930-an — amber hangat, debu berkilau', key: '#ffcf8a', shadow: '#4a2f3a', rim: '#ffd59a', rimStrength: 0.7, glow: '#ffc060', haze: '#d8b080' },
  crisisCold: { mood: 'Krisis 1980-an — neon dingin, sorot sempit', key: '#d8e4d0', shadow: '#2a3050', rim: '#a8c4e0', rimStrength: 0.5, glow: '#e4ecd4', haze: '#7a8478' },
  closureGrey: { mood: 'Penutupan 1982 — kelabu biru-ungu', key: '#c8cce0', shadow: '#3a3458', rim: '#9aa4d0', rimStrength: 0.45, glow: '#b8b0d8', haze: '#8a8aa0' },
  todayBright: { mood: 'Masa kini — cerah segar, langit biru', key: '#fff6e4', shadow: '#3c4a7a', rim: '#ffffff', rimStrength: 0.6, glow: '#fff4d8', haze: '#cfe2f0' },
  climaxGold: { mood: 'Klimaks — twilight emas kontras tinggi, ukiran menyala', key: '#ff9a40', shadow: '#24183e', rim: '#ffb860', rimStrength: 1, glow: '#ffcc66', haze: '#d88a60' },
};

// ── Cartoon FX cues (skill v2.2 §4.3) ───────────────────────────────────────

export type FxKind = 'sweat' | 'speedLines' | 'spark' | 'question' | 'exclaim' | 'zzz';

export interface FxCue {
  kind: FxKind;
  /** Shot progress (0..1) at which the effect pops in. */
  at: number;
  /** Lifetime in frames. */
  frames: number;
  /** Cast index the effect sticks to (head-relative); omit for screen FX / `pos`. */
  cast?: number;
  /** Fixed world position when not attached to a cast member. */
  pos?: Vec3;
  /** Size multiplier (default 1). */
  size?: number;
}

export interface CameraKey {
  t: number;
  pos: Vec3;
  target: Vec3;
  fov: number;
}

type Keys<T> = readonly (readonly [number, T])[];

export interface CastMember {
  actor: LookId;
  /** Named anchor exported by the world builder (bottom-centre, on the floor). */
  anchor: string;
  scale: number;
  pose: BodyPose;
  /** Visible only inside this progress window (default whole shot). */
  visible?: readonly [number, number];
  expression: Keys<Expression>;
  left?: Keys<ArmPose>;
  right?: Keys<ArmPose>;
  leftProp?: HandProp;
  rightProp?: HandProp;
  bodyProp?: BodyProp;
  /** Face turn −1..1 (screen left..right). */
  turn?: Keys<number>;
  /** Head bow 0..1. */
  nod?: Keys<number>;
  /** Keyed world offset from the anchor; legs walk while it moves. */
  move?: Keys<Vec3>;
}

export interface Grade {
  /** 0 = full colour, 1 = full sepia. */
  sepia: Keys<number>;
  /** Extra desaturation towards cold grey (0..1). */
  grey?: Keys<number>;
  /** Persis-style split tone strength (indigo shadows / amber highlights), default 0.4. */
  tone?: number;
}

export interface Shot {
  id: string;
  from: number;
  /** Exclusive end frame. */
  to: number;
  world: WorldId;
  /** Transition into this shot. `xfade` = XFADE_FRAMES soft cross-dissolve. */
  cut: 'dip' | 'hard' | 'flash' | 'xfade';
  /** Color-script phase (COLOR_SCRIPT) — drives rim light on the cast. */
  phase: ColorPhase;
  /** Cartoon 2D FX on key story beats only. */
  fx?: readonly FxCue[];
  chip: Keys<{ place: string; year: string }>;
  camera: readonly CameraKey[];
  /** Bokeh strength keys (0 = sharp, 1 = very shallow). */
  aperture: Keys<number>;
  /** Optional rack-focus point keys; default focus is the camera target. */
  focus?: Keys<Vec3>;
  grade: Grade;
  cast: readonly CastMember[];
  /** Impact kicks (shot progress): 7-frame flip-shake on story impacts. */
  kicks?: readonly number[];
  /** Dramatic camera roll in degrees (3–5° on beats). */
  roll?: Keys<number>;
  /** Extra 6-frame white flashes inside the shot (era jumps, progress). */
  flashes?: readonly number[];
}

const COLOUR: Grade = { sepia: [[0, 0]] };
const SEPIA: Grade = { sepia: [[0, 0.92]] };

/** Present-day lead: denim jacket, hijab, backpack, sneakers. */
const dinda = (m: Omit<CastMember, 'actor' | 'scale'> & { scale?: number }): CastMember => ({ actor: 'dinda', scale: 1.25, bodyProp: 'backpack', ...m });

export const SHOTS: readonly Shot[] = [
  // 1 — Rear door at golden dusk: Dinda traces the carved "1930 – 1982".
  {
    id: 'pintu-senja',
    from: 0,
    to: 240,
    world: 'stationRear',
    cut: 'hard',
    phase: 'goldenDusk',
    chip: [[0, { place: 'STASIUN CIKAJANG', year: 'KINI' }]],
    aperture: [[0, 0.6], [0.5, 0.5], [1, 0.45]],
    // 3/4 medium shot from the right: Dinda's head, hijab, backpack and the arm reaching
    // from her shoulder to the carving all stay in frame, then a slow dolly-out.
    camera: [
      { t: 0, pos: [0.42, 1.3, 2.4], target: [-0.02, 1.1, -0.8], fov: 38 },
      { t: 0.45, pos: [0.55, 1.38, 3.1], target: [0.06, 1.1, -0.8], fov: 38 },
      { t: 1, pos: [0.62, 1.5, 4.8], target: [0.2, 1.08, -0.8], fov: 38 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.6 },
    cast: [
      dinda({
        anchor: 'dindaTrace',
        pose: 'stand',
        expression: [[0, 'thinking'], [0.6, 'wonder']],
        right: [[0, 'trace']],
        left: [[0, 'strap'], [0.72, 'strap'], [0.82, 'palm']],
        turn: [[0, -0.55], [0.55, -0.45], [0.85, 0]],
      }),
    ],
  },
  // 2 — Misty platform: Dinda turns to camera, points at the 1.246 mdpl sign; crane up to the slopes.
  {
    id: 'peron-kabut',
    from: 240,
    to: 540,
    world: 'platformMist',
    cut: 'dip',
    phase: 'mountainMorning',
    chip: [[0, { place: 'PERON CIKAJANG', year: '1.246 MDPL' }]],
    aperture: [[0, 0.55], [0.7, 0.4], [1, 0.25]],
    camera: [
      { t: 0, pos: [0.5, 1.45, 3.6], target: [-0.3, 1.45, -1.6], fov: 40 },
      { t: 0.45, pos: [0.2, 1.6, 3.9], target: [-0.6, 1.6, -1.6], fov: 40 },
      { t: 0.75, pos: [0.0, 3.4, 5.2], target: [-0.4, 3.6, -12], fov: 42 },
      { t: 1, pos: [0.0, 6.6, 6.2], target: [0, 9.5, -60], fov: 44 },
    ],
    grade: COLOUR,
    cast: [
      dinda({
        anchor: 'dinda',
        pose: 'stand',
        expression: [[0, 'neutral'], [0.15, 'warm']],
        right: [[0, 'side'], [0.16, 'pointHigh'], [0.52, 'pointHigh'], [0.62, 'palm'], [0.8, 'palm'], [0.9, 'side']],
        left: [[0, 'strap']],
        turn: [[0, -0.6], [0.12, 0]],
      }),
      { actor: 'ayam', anchor: 'ayam', scale: 1, pose: 'stand', expression: [[0, 'neutral']], move: [[0, [-1.6, 0, 0]], [1, [2.6, 0, 0.2]]] },
      { actor: 'anak', anchor: 'anak', scale: 0.85, pose: 'stand', expression: [[0, 'warm']], right: [[0, 'wave']], left: [[0, 'side']] },
    ],
  },
  // 3 — 1930s vegetable slopes at misty dawn (sepia); pan to the empty rails.
  {
    id: 'ladang-1930',
    from: 540,
    to: 840,
    world: 'ladang',
    cut: 'flash',
    phase: 'mountainMorning',
    chip: [[0, { place: 'LERENG CIKAJANG', year: '1930-AN' }]],
    aperture: [[0, 0.5]],
    camera: [
      { t: 0, pos: [-3.7, 1.45, 3.2], target: [-4.1, 1.05, 0.35], fov: 38 },
      { t: 0.3, pos: [-3.3, 1.45, 3.3], target: [-3.6, 1.0, 0.3], fov: 38 },
      { t: 0.58, pos: [-1.0, 1.6, 3.1], target: [-1.0, 0.95, -1.45], fov: 38 },
      { t: 1, pos: [6.4, 1.7, 3.8], target: [9.4, 0.4, -6], fov: 40 },
    ],
    grade: SEPIA,
    cast: [
      {
        actor: 'petani',
        anchor: 'petani',
        scale: 1.15,
        pose: 'stand',
        expression: [[0, 'neutral'], [0.4, 'warm']],
        right: [[0, 'carryShoulder']],
        left: [[0, 'side']],
        bodyProp: 'shoulderBasket',
        turn: [[0, 0.3]],
        move: [[0, [0, 0, 0]], [0.6, [1.1, 0, 0.1]]],
      },
      {
        actor: 'warga',
        anchor: 'petani2',
        scale: 1.1,
        pose: 'stand',
        expression: [[0, 'neutral']],
        right: [[0, 'knee'], [0.52, 'traceLow'], [0.62, 'traceLow'], [0.68, 'knee']],
        left: [[0, 'knee']],
        turn: [[0, -0.4]],
      },
    ],
  },
  // 4 — Station office, 31 July 1930: one pen, De Koerier in the corner; dolly-in to the date.
  {
    id: 'kantor-1930',
    from: 840,
    to: 1140,
    world: 'office1930',
    cut: 'dip',
    phase: 'colonialWarm',
    chip: [[0, { place: 'KANTOR STASIUN', year: '31 JULI 1930' }]],
    aperture: [[0, 0.55], [0.7, 0.7], [1, 0.9]],
    camera: [
      { t: 0, pos: [0.35, 1.5, 2.4], target: [0.05, 1.0, -1.2], fov: 40 },
      { t: 0.32, pos: [1.75, 1.3, 0.75], target: [2.4, 0.95, -2.5], fov: 38 },
      { t: 0.62, pos: [0.25, 1.25, 1.0], target: [-0.05, 0.95, -1.1], fov: 38 },
      { t: 0.82, pos: [-0.62, 1.07, 1.7], target: [-0.66, 0.9, -0.5], fov: 30 },
      { t: 1, pos: [-0.64, 1.06, 1.62], target: [-0.66, 0.9, -0.5], fov: 30 },
    ],
    grade: SEPIA,
    cast: [
      {
        actor: 'kepalaStasiun',
        anchor: 'desk',
        scale: 1.15,
        pose: 'sit',
        expression: [[0, 'serious'], [0.5, 'thinking']],
        right: [[0, 'write']],
        left: [[0, 'pressPage']],
        rightProp: 'pen',
        bodyProp: 'deskNotebook',
        nod: [[0, 0.35]],
      },
      {
        actor: 'stafKoran',
        anchor: 'corner',
        scale: 1.15,
        pose: 'sit',
        expression: [[0, 'thinking'], [0.5, 'wonder']],
        right: [[0, 'newspaper']],
        left: [[0, 'newspaper']],
        bodyProp: 'newspaper',
      },
    ],
  },
  // 5 — Cibatu platform at 06.04: whistle + signal lamp, queue with suitcases, steam loco.
  {
    id: 'cibatu-0604',
    from: 1140,
    to: 1410,
    world: 'cibatu',
    cut: 'dip',
    phase: 'colonialWarm',
    kicks: [0.2],
    chip: [[0, { place: 'STASIUN CIBATU', year: '06.04' }]],
    aperture: [[0, 0.5], [0.5, 0.35], [1, 0.4]],
    camera: [
      { t: 0, pos: [0.5, 3.0, 0.7], target: [0.5, 3.25, -2.0], fov: 48 },
      { t: 0.45, pos: [0.55, 1.85, 6.2], target: [0.5, 2.1, -1.8], fov: 24 },
      { t: 0.7, pos: [1.6, 1.7, 5.4], target: [2.6, 1.4, -1.0], fov: 34 },
      { t: 1, pos: [4.0, 1.8, 5.4], target: [9.0, 1.4, 0.8], fov: 38 },
    ],
    grade: SEPIA,
    cast: [
      {
        actor: 'kondektur',
        anchor: 'kondektur',
        scale: 1.15,
        pose: 'stand',
        expression: [[0, 'serious']],
        right: [[0, 'side'], [0.18, 'whistle'], [0.62, 'whistle'], [0.72, 'side']],
        left: [[0, 'lampLow']],
        rightProp: 'whistle',
        leftProp: 'signalLamp',
        turn: [[0, 0.3]],
      },
      { actor: 'penumpangPria', anchor: 'queue1', scale: 1.15, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'suitcase']], left: [[0, 'side']], rightProp: 'suitcase', turn: [[0, -0.5]], move: [[0, [0, 0, 0]], [0.6, [-0.35, 0, 0]]] },
      { actor: 'penumpangWanita', anchor: 'queue2', scale: 1.1, pose: 'stand', expression: [[0, 'warm']], right: [[0, 'side']], left: [[0, 'suitcase']], leftProp: 'suitcase', turn: [[0, -0.5]], move: [[0, [0, 0, 0]], [0.6, [-0.35, 0, 0]]] },
      { actor: 'bapakPeci', anchor: 'queue3', scale: 1.15, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'suitcase']], left: [[0, 'side']], rightProp: 'suitcase', turn: [[0, -0.5]], move: [[0, [0, 0, 0]], [0.6, [-0.35, 0, 0]]] },
    ],
  },
  // 6 — Inside the 3rd-class carriage climbing at 08.25: longitudinal benches, sacks on laps.
  {
    id: 'gerbong-kelas3',
    from: 1410,
    to: 1680,
    world: 'carriage',
    cut: 'dip',
    phase: 'colonialWarm',
    chip: [[0, { place: 'GERBONG KELAS III', year: '08.25' }]],
    aperture: [[0, 0.45]],
    camera: [
      { t: 0, pos: [-4.4, 1.2, 1.15], target: [-4.1, 0.95, -1.0], fov: 50 },
      { t: 1, pos: [3.0, 1.25, 1.15], target: [3.3, 0.95, -1.0], fov: 50 },
    ],
    grade: SEPIA,
    cast: [
      { actor: 'bapakPeci', anchor: 'seat1', scale: 1.15, pose: 'sit', expression: [[0, 'thinking']], right: [[0, 'lap']], left: [[0, 'lap']], turn: [[0, 0.5]] },
      { actor: 'petani', anchor: 'seat2', scale: 1.15, pose: 'sit', expression: [[0, 'neutral']], right: [[0, 'hug']], left: [[0, 'hug']], bodyProp: 'lapSack', turn: [[0, -0.2]] },
      { actor: 'ibuBakul', anchor: 'seat3', scale: 1.1, pose: 'sit', expression: [[0, 'warm']], right: [[0, 'basketLap']], left: [[0, 'basketLap']], bodyProp: 'lapBakul', turn: [[0, 0.4]] },
      { actor: 'anak', anchor: 'seat4', scale: 0.85, pose: 'stand', expression: [[0, 'wonder']], right: [[0, 'side']], left: [[0, 'hip']], turn: [[0, 0.8]] },
      { actor: 'penumpangWanita', anchor: 'seat5', scale: 1.1, pose: 'sit', expression: [[0, 'neutral']], right: [[0, 'hug']], left: [[0, 'hug']], bodyProp: 'lapSack', turn: [[0, -0.3]] },
      { actor: 'penumpangPria', anchor: 'seat6', scale: 1.15, pose: 'sit', expression: [[0, 'thinking']], right: [[0, 'lap']], left: [[0, 'lap']], turn: [[0, 0.6]] },
    ],
  },
  // 7 — Garut 1935 timetable "5x", whip-pan to 1947 rail repairs.
  {
    id: 'garut-1935-1947',
    from: 1680,
    to: 1980,
    world: 'garut1935',
    cut: 'dip',
    phase: 'colonialWarm',
    flashes: [0.51],
    chip: [
      [0, { place: 'STASIUN GARUT', year: '1935' }],
      [0.53, { place: 'JALUR CIKAJANG–GARUT', year: '1947' }],
    ],
    aperture: [[0, 0.5]],
    camera: [
      { t: 0, pos: [0.1, 1.7, 3.6], target: [-0.8, 1.95, -2.2], fov: 38 },
      { t: 0.49, pos: [0.0, 1.7, 3.4], target: [-0.9, 2.0, -2.2], fov: 38 },
      { t: 0.535, pos: [7.4, 1.6, 4.8], target: [9.3, 1.4, 0.3], fov: 40 },
      { t: 1, pos: [8.5, 1.6, 4.6], target: [9.35, 1.4, 0.3], fov: 40 },
    ],
    grade: SEPIA,
    cast: [
      {
        actor: 'petugas1935',
        anchor: 'petugas',
        scale: 1.15,
        pose: 'stand',
        expression: [[0, 'warm'], [0.25, 'serious']],
        right: [[0, 'side'], [0.1, 'point'], [0.45, 'point']],
        left: [[0, 'hip']],
        turn: [[0, -0.4], [0.25, 0]],
      },
      { actor: 'pekerjaRel', anchor: 'pekerja1', scale: 1.15, pose: 'stand', expression: [[0, 'serious']], right: [[0, 'hammer']], left: [[0, 'knee']], rightProp: 'hammer', turn: [[0, -0.3]] },
      { actor: 'pekerjaRel2', anchor: 'pekerja2', scale: 1.15, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'hammer']], left: [[0, 'hip']], rightProp: 'hammer', turn: [[0, 0.4]] },
    ],
  },
  // 8 — Dim early-1980s office: one chalk draws the falling line; rack focus to the old loco.
  {
    id: 'kantor-1980',
    from: 1980,
    to: 2280,
    world: 'office1980',
    cut: 'dip',
    phase: 'crisisCold',
    roll: [[0, 0], [0.55, 0], [1, -3]],
    chip: [[0, { place: 'KANTOR STASIUN', year: 'AWAL 1980-AN' }]],
    aperture: [[0, 0.5], [0.55, 0.75], [1, 0.95]],
    camera: [
      { t: 0, pos: [0.7, 1.35, 2.9], target: [0.05, 0.9, -1.0], fov: 38 },
      // Hold on the PJKA plate long enough to read it, then push in: the plate
      // leaves frame during the fast middle of the smootherstep, not a slow crawl.
      { t: 0.16, pos: [0.62, 1.32, 2.62], target: [0.05, 0.92, -1.0], fov: 38 },
      { t: 0.55, pos: [0.12, 0.98, 0.45], target: [0.02, 0.82, -1.0], fov: 34 },
      { t: 1, pos: [0.3, 1.05, 0.55], target: [1.2, 1.25, -3.2], fov: 34 },
    ],
    focus: [[0, [0.05, 0.9, -1.0]], [0.62, [0.02, 0.82, -1.0]], [0.85, [2.4, 1.2, -7.5]]],
    grade: { sepia: [[0, 0.75]] },
    cast: [
      {
        actor: 'petugas1980',
        anchor: 'chair',
        scale: 1.15,
        pose: 'sit',
        expression: [[0, 'serious'], [0.5, 'sad']],
        right: [[0, 'chalk']],
        left: [[0, 'holdBoard']],
        rightProp: 'chalk',
        bodyProp: 'lapBoard',
        nod: [[0, 0.4]],
      },
    ],
  },
  // 9 — Garut 1982, overcast: "DITUTUP" goes up, the train shrinks to the horizon, fade to grey.
  {
    id: 'garut-1982',
    from: 2280,
    to: 2580,
    world: 'garut1982',
    cut: 'dip',
    phase: 'closureGrey',
    kicks: [0.73],
    roll: [[0, 0], [0.62, 0], [0.85, -3.5], [1, -4]],
    chip: [[0, { place: 'STASIUN GARUT', year: '1982' }]],
    aperture: [[0, 0.45]],
    camera: [
      { t: 0, pos: [-0.15, 1.7, 3.6], target: [-0.25, 1.45, -1.8], fov: 44 },
      { t: 0.4, pos: [0.3, 1.65, 3.6], target: [0.1, 1.5, -1.4], fov: 38 },
      { t: 0.7, pos: [0.8, 1.75, 4.1], target: [1.2, 1.3, -8], fov: 36 },
      { t: 1, pos: [0.9, 1.75, 4.4], target: [1.6, 1.15, -40], fov: 34 },
    ],
    grade: { sepia: [[0, 0.7]], grey: [[0, 0.1], [0.6, 0.45], [1, 1]] },
    cast: [
      {
        actor: 'petugas1982',
        anchor: 'petugas',
        scale: 1.15,
        pose: 'stand',
        expression: [[0, 'serious'], [0.4, 'sad']],
        left: [[0, 'reachUp'], [0.42, 'reachUp'], [0.52, 'side']],
        right: [[0, 'side']],
        turn: [[0, 0.3], [0.5, 0]],
      },
      { actor: 'penumpangPria', anchor: 'diam1', scale: 1.15, pose: 'stand', expression: [[0, 'sad']], right: [[0, 'suitcase']], left: [[0, 'side']], rightProp: 'suitcase', turn: [[0, 0.5]] },
      { actor: 'ibuBakul', anchor: 'diam2', scale: 1.1, pose: 'stand', expression: [[0, 'sad']], right: [[0, 'side']], left: [[0, 'pocket']], turn: [[0, 0.6]] },
      { actor: 'bapakPeci', anchor: 'diam3', scale: 1.15, pose: 'stand', expression: [[0, 'sad']], right: [[0, 'side']], left: [[0, 'hip']], turn: [[0, 0.4]], nod: [[0, 0.5]] },
    ],
  },
  // 10 — Today, bright noon: sepia match-cut to colour; ±50 m building, wild grass and murals; crane down.
  {
    id: 'cikajang-kini',
    from: 2580,
    to: 2850,
    world: 'cikajangToday',
    cut: 'flash',
    phase: 'todayBright',
    chip: [[0, { place: 'STASIUN CIKAJANG', year: 'KINI' }]],
    aperture: [[0, 0.3], [1, 0.45]],
    camera: [
      { t: 0, pos: [0.0, 6.2, 9.5], target: [0.0, 2.0, -4], fov: 46 },
      { t: 0.6, pos: [0.3, 2.4, 5.8], target: [0.0, 1.65, -3.5], fov: 42 },
      { t: 1, pos: [0.4, 1.55, 4.3], target: [0.0, 1.75, -3], fov: 38 },
    ],
    grade: { sepia: [[0, 0.92], [0.04, 0.92], [0.22, 0]] },
    cast: [
      dinda({
        anchor: 'dindaCenter',
        pose: 'stand',
        expression: [[0, 'wonder'], [0.5, 'warm']],
        // Natural asymmetric gesture (open palm + hand on the backpack strap): never a T-pose.
        right: [[0, 'side'], [0.2, 'palm'], [0.62, 'palm'], [0.74, 'hip']],
        left: [[0, 'side'], [0.24, 'strap']],
        turn: [[0, 0.2], [0.5, 0]],
      }),
    ],
  },
  // 11 — Right side: Dinda leans in and traces "Station Tjikadjang"; a cat on the threshold; rack focus.
  {
    id: 'ukiran-tjikadjang',
    from: 2850,
    to: 3120,
    world: 'cikajangToday',
    cut: 'dip',
    phase: 'todayBright',
    chip: [[0, { place: 'UKIRAN', year: '“STATION TJIKADJANG”' }]],
    aperture: [[0, 0.7], [1, 0.75]],
    // Wide-enough medium shot: the WHOLE "Station Tjikadjang" carving stays inside 82 % of the frame width
    // (even after the creeping push-in) with Dinda's hand on it and her shoulder/head, then rack focus to her face.
    camera: [
      { t: 0, pos: [17.62, 1.4, 3.7], target: [17.62, 1.35, -3.6], fov: 38 },
      { t: 0.5, pos: [17.64, 1.45, 3.5], target: [17.65, 1.4, -3.55], fov: 38 },
      { t: 1, pos: [17.68, 1.55, 3.3], target: [17.7, 1.5, -3.5], fov: 38 },
    ],
    focus: [[0, [17.75, 1.18, -3.68]], [0.45, [17.75, 1.18, -3.68]], [0.72, [18.3, 1.62, -3.45]]],
    grade: COLOUR,
    cast: [
      dinda({
        anchor: 'dindaTrace',
        pose: 'stand',
        expression: [[0, 'thinking'], [0.6, 'warm']],
        right: [[0, 'traceLow']],
        left: [[0, 'strap']],
        turn: [[0, -0.55], [0.65, -0.1]],
      }),
      { actor: 'kucing', anchor: 'kucing', scale: 1.15, pose: 'sit', expression: [[0, 'neutral']] },
    ],
  },
  // 12 — Garut 2022, bright: route map, ticket in hand, modern train arrives.
  {
    id: 'garut-2022',
    from: 3120,
    to: 3390,
    world: 'garut2022',
    cut: 'flash',
    phase: 'todayBright',
    chip: [[0, { place: 'STASIUN GARUT', year: '2022' }]],
    aperture: [[0, 0.4]],
    camera: [
      { t: 0, pos: [-0.55, 1.6, 2.9], target: [-0.9, 1.6, -2.0], fov: 40 },
      { t: 0.45, pos: [-1.4, 1.78, 2.2], target: [-1.5, 1.75, -2.5], fov: 34 },
      { t: 0.7, pos: [0.2, 1.8, 3.6], target: [2.5, 1.5, 0.9], fov: 40 },
      { t: 1, pos: [2.2, 1.7, 4.4], target: [5.5, 1.4, 0.9], fov: 40 },
    ],
    grade: COLOUR,
    cast: [
      dinda({
        anchor: 'dinda',
        pose: 'stand',
        expression: [[0, 'warm'], [0.35, 'neutral'], [0.6, 'warm']],
        // Points only while the wide frame holds her shoulder; arm rests during the push-in to the map.
        right: [[0, 'side'], [0.05, 'point'], [0.13, 'point'], [0.2, 'side'], [0.55, 'side'], [0.62, 'palm'], [0.76, 'palm'], [0.85, 'side']],
        left: [[0, 'ticket']],
        leftProp: 'ticket',
        bodyProp: 'backpack',
        turn: [[0, -0.4], [0.3, 0]],
      }),
      { actor: 'penumpangModern', anchor: 'p1', scale: 1.15, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'ticket']], left: [[0, 'side']], rightProp: 'phone', turn: [[0, 0.6]] },
      { actor: 'penumpangModern2', anchor: 'p2', scale: 1.1, pose: 'stand', expression: [[0, 'warm']], right: [[0, 'side']], left: [[0, 'strap']], bodyProp: 'backpack', turn: [[0, 0.5]] },
      { actor: 'anakModern', anchor: 'p3', scale: 0.85, pose: 'stand', expression: [[0, 'wonder']], right: [[0, 'wave']], left: [[0, 'side']], turn: [[0, 0.7]] },
    ],
  },
  // 13 — Back to the rear door at dusk: hands in jacket pockets, years glow, "?" appears; dolly zoom.
  {
    id: 'angka-ketiga',
    from: 3390,
    to: 3640,
    world: 'stationRear',
    cut: 'dip',
    phase: 'climaxGold',
    kicks: [0.56],
    roll: [[0, 0], [0.5, 0], [1, 3]],
    chip: [[0, { place: 'STASIUN CIKAJANG', year: '20??' }]],
    aperture: [[0, 0.45], [1, 0.6]],
    camera: [
      { t: 0, pos: [0.3, 1.6, 6.0], target: [0.22, 1.65, -0.8], fov: 26 },
      { t: 1, pos: [0.28, 1.8, 2.1], target: [0.22, 1.95, -0.8], fov: 56 },
    ],
    grade: { sepia: [[0, 0]], tone: 0.6 },
    cast: [
      dinda({
        anchor: 'dindaCenter',
        pose: 'stand',
        expression: [[0, 'thinking'], [0.55, 'wonder']],
        right: [[0, 'pocket']],
        left: [[0, 'pocket']],
        turn: [[0, -0.3], [0.5, 0], [0.75, 0.05]],
      }),
    ],
  },
];

// ── Shot lookup ─────────────────────────────────────────────────────────────

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

/** Step-keyed value (latest key whose time ≤ t). */
export function stepped<T>(keys: Keys<T>, t: number): T {
  const first = keys[0];
  if (!first) throw new Error('stepped(): empty keys');
  let v = first[1];
  for (const k of keys) if (t >= k[0]) v = k[1];
  return v;
}

/** 0 → 1 → 0 darkening around `dip` cuts, plus the hook reveal and the final fade-out. */
export function cutDipAt(frame: number): number {
  let dip = 0;
  for (let i = 1; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (!s || s.cut !== 'dip') continue;
    const d = Math.abs(frame + 0.5 - s.from) / SHOT_DIP_FRAMES;
    dip = Math.max(dip, 1 - smoothstep(0, 1, d));
  }
  const hit = HOOK.impactFrame;
  const head = frame < hit ? lerp(0.85, 0.35, smoothstep(0, hit, frame)) : 0.35 * (1 - smoothstep(hit, hit + 10, frame));
  return Math.max(dip, head, smoothstep(CIKAJANG_DURATION_IN_FRAMES - 24, CIKAJANG_DURATION_IN_FRAMES - 1, frame));
}

/** 6-frame white flash on era jumps: `flash` cuts plus in-shot `flashes`. */
export const FLASH_FRAMES = 6;

/** 0.5 s cross-dissolve after the cut for `xfade` shots. */
export const XFADE_FRAMES = 15;

/**
 * Cross-dissolve state at `frame`: for XFADE_FRAMES after an `xfade` cut the
 * outgoing shot's last frame (`prevFrame`) is blended over the incoming shot,
 * weight 1 → 0 with smoothstep. Otherwise null. Pure function of frame.
 */
export function crossfadeAt(frame: number): { prevIndex: number; prevFrame: number; weight: number } | null {
  for (let i = 1; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (!s || s.cut !== 'xfade') continue;
    const d = frame - s.from;
    if (d >= 0 && d < XFADE_FRAMES) return { prevIndex: i - 1, prevFrame: s.from - 1, weight: 1 - smoothstep(0, XFADE_FRAMES, d + 0.5) };
  }
  return null;
}

/** Index of the expression key active at `progress` and frames since it began (blink on swap). */
export function snapKeys<T>(keys: Keys<T> | undefined, fallback: T, progress: number, shotLen: number): { from: T; to: T; mix: number; age: number } {
  const first = keys?.[0];
  if (!keys || !first) return { from: fallback, to: fallback, mix: 0, age: 1e6 };
  let prev = first[1];
  let cur = first;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (!k || progress < k[0]) break;
    prev = cur[1];
    cur = k;
  }
  const age = cur === first ? 1e6 : (progress - cur[0]) * shotLen;
  return { from: prev, to: cur[1], mix: clamp01(age / EXPRESSION_SNAP_FRAMES), age };
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

export function gradeAt(frame: number): { sepia: number; grey: number; tone: number } {
  const { shot, progress } = getShotAt(frame);
  return { sepia: keyed(shot.grade.sepia, progress), grey: shot.grade.grey ? keyed(shot.grade.grey, progress) : 0, tone: shot.grade.tone ?? 0.4 };
}

export function isCastVisible(member: CastMember, progress: number): boolean {
  const [a, b] = member.visible ?? [0, 1];
  return progress >= a && progress <= b;
}

/** Cross-fade between consecutive keys over `ramp` progress before each new key. */
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

/** Linear keyed Vec3 with smoothstep per segment. */
export function keyedVec3(keys: Keys<Vec3> | undefined, t: number, out: THREE.Vector3): THREE.Vector3 {
  if (!keys || keys.length === 0) return out.set(0, 0, 0);
  const xs = keys.map(([k, v]) => [k, v[0]] as const);
  const ys = keys.map(([k, v]) => [k, v[1]] as const);
  const zs = keys.map(([k, v]) => [k, v[2]] as const);
  return out.set(keyed(xs, t), keyed(ys, t), keyed(zs, t));
}

// ── Camera ──────────────────────────────────────────────────────────────────

export interface CameraSample {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
  /** Distance from the camera to the in-focus point. */
  focus: number;
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
    pos: new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal'),
    target: new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.target)), false, 'centripetal'),
    times: keys.map((k) => k.t),
  };
  rigCache.set(shot.id, rig);
  return rig;
}

/** Smootherstep (Perlin): zero velocity AND acceleration at both ends — glides, never jerks. */
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

/**
 * Creeping holds: wherever the spline settles (a hold), the camera keeps pushing in
 * 0.2 % of its distance per frame, so it never freezes for more than a few frames.
 * Integrated per shot once and cached (pure function of the frame).
 */
const creepCache = new Map<string, Float32Array>();
const CREEP_PER_FRAME = 0.002;

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
    const p0 = clamp01((i - 1) / (len - 1));
    const p1 = clamp01(i / (len - 1));
    rig.pos.getPoint(curveParam(rig.times, p0), a);
    rig.pos.getPoint(curveParam(rig.times, p1), b);
    // Holding when the glide moves < ~4 mm per frame.
    const hold = 1 - smoothstep(0.002, 0.006, a.distanceTo(b));
    acc = Math.min(0.12, acc + hold * CREEP_PER_FRAME);
    out[i] = acc;
  }
  creepCache.set(shot.id, out);
  return out;
}

/** 7-frame flip-shake: alternating, decaying kick after each impact frame. */
export const KICK_FRAMES = 7;

function kickAt(shot: Shot, localFrame: number): number {
  let k = 0;
  const len = shot.to - shot.from - 1;
  for (const p of shot.kicks ?? []) {
    const d = localFrame - Math.round(p * len);
    if (d >= 0 && d < KICK_FRAMES) k += (d % 2 === 0 ? 1 : -1) * (1 - d / KICK_FRAMES);
  }
  return k;
}

const focusPoint = new THREE.Vector3();

export function sampleCamera(frame: number, out?: CameraSample): CameraSample {
  const { shot, progress, localFrame } = getShotAt(frame);
  const rig = rigFor(shot);
  const u = curveParam(rig.times, progress);
  const sample = out ?? { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 35, roll: 0, focus: 5 };
  rig.pos.getPoint(u, sample.position);
  rig.target.getPoint(u, sample.target);
  // Creeping hold: ease toward the target while the glide is settled.
  const creep = creepFor(shot)[Math.min(localFrame, shot.to - shot.from - 1)] ?? 0;
  sample.position.lerp(sample.target, creep);
  sample.fov = keyed(shot.camera.map((k) => [k.t, k.fov] as const), progress);
  // Tiny deterministic handheld drift.
  const s = frame / CIKAJANG_FPS;
  sample.position.x += Math.sin(s * 0.9) * 0.008 + Math.sin(s * 2.3) * 0.003;
  sample.position.y += Math.sin(s * 1.3 + 1) * 0.006;
  sample.target.x += Math.sin(s * 0.7 + 2) * 0.006;
  // Hook slam shake + story impact kicks.
  const k = hookShakeAt(frame);
  const kick = kickAt(shot, localFrame);
  sample.position.x += k * 0.02 * Math.sin(frame * 2.9) + kick * 0.025;
  sample.position.y += k * 0.016 * Math.sin(frame * 3.7 + 1) - Math.abs(kick) * 0.012;
  sample.roll = k * 0.02 * Math.sin(frame * 2.6 + 1.3) + kick * 0.006 + (shot.roll ? (keyed(shot.roll, progress) * Math.PI) / 180 : 0);
  if (shot.focus) keyedVec3(shot.focus, progress, focusPoint);
  else focusPoint.copy(sample.target);
  sample.focus = sample.position.distanceTo(focusPoint);
  return sample;
}

export function apertureAt(frame: number): number {
  const { shot, progress } = getShotAt(frame);
  return keyed(shot.aperture, progress);
}
