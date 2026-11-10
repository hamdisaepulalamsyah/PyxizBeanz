import * as THREE from 'three';
import { clamp01, easeInOutSine, keyed, lerp, smoothstep } from '../persis/story';

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

export type BodyPose = 'stand' | 'sit' | 'crouch';

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

export type Expression = 'neutral' | 'warm' | 'serious' | 'thinking' | 'sad' | 'wonder';

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
  /** Transition into this shot. */
  cut: 'dip' | 'hard' | 'flash';
  chip: Keys<{ place: string; year: string }>;
  camera: readonly CameraKey[];
  /** Bokeh strength keys (0 = sharp, 1 = very shallow). */
  aperture: Keys<number>;
  /** Optional rack-focus point keys; default focus is the camera target. */
  focus?: Keys<Vec3>;
  grade: Grade;
  cast: readonly CastMember[];
}

const COLOUR: Grade = { sepia: [[0, 0]] };
const SEPIA: Grade = { sepia: [[0, 0.92]] };

/** Present-day lead: denim jacket, hijab, backpack, sneakers. */
const dinda = (m: Omit<CastMember, 'actor' | 'scale'> & { scale?: number }): CastMember => ({ actor: 'dinda', scale: 1, bodyProp: 'backpack', ...m });

export const SHOTS: readonly Shot[] = [
  // 1 — Rear door at golden dusk: Dinda traces the carved "1930 – 1982".
  {
    id: 'pintu-senja',
    from: 0,
    to: 240,
    world: 'stationRear',
    cut: 'hard',
    chip: [[0, { place: 'STASIUN CIKAJANG', year: 'KINI' }]],
    aperture: [[0, 0.6], [0.5, 0.5], [1, 0.45]],
    // 3/4 medium shot from the right: Dinda's head, hijab, backpack and the arm reaching
    // from her shoulder to the carving all stay in frame, then a slow dolly-out.
    camera: [
      { t: 0, pos: [0.62, 1.32, 1.95], target: [0.04, 1.12, -0.8], fov: 38 },
      { t: 0.45, pos: [0.7, 1.38, 2.8], target: [0.12, 1.1, -0.8], fov: 38 },
      { t: 1, pos: [0.75, 1.5, 4.8], target: [0.3, 1.08, -0.8], fov: 38 },
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
      { actor: 'anak', anchor: 'anak', scale: 0.68, pose: 'stand', expression: [[0, 'warm']], right: [[0, 'wave']], left: [[0, 'side']] },
    ],
  },
  // 3 — 1930s vegetable slopes at misty dawn (sepia); pan to the empty rails.
  {
    id: 'ladang-1930',
    from: 540,
    to: 840,
    world: 'ladang',
    cut: 'dip',
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
        scale: 1.02,
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
        scale: 0.98,
        pose: 'crouch',
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
    chip: [[0, { place: 'KANTOR STASIUN', year: '31 JULI 1930' }]],
    aperture: [[0, 0.55], [0.7, 0.7], [1, 0.9]],
    camera: [
      { t: 0, pos: [0.35, 1.5, 2.4], target: [0.05, 1.0, -1.2], fov: 40 },
      { t: 0.32, pos: [1.75, 1.3, 0.75], target: [2.4, 0.95, -2.5], fov: 38 },
      { t: 0.62, pos: [0.25, 1.25, 1.0], target: [-0.05, 0.95, -1.1], fov: 38 },
      { t: 1, pos: [-0.62, 1.0, 0.02], target: [-0.66, 0.93, -0.5], fov: 30 },
    ],
    grade: SEPIA,
    cast: [
      {
        actor: 'kepalaStasiun',
        anchor: 'desk',
        scale: 1.05,
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
        scale: 1,
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
        scale: 1.04,
        pose: 'stand',
        expression: [[0, 'serious']],
        right: [[0, 'side'], [0.18, 'whistle'], [0.62, 'whistle'], [0.72, 'side']],
        left: [[0, 'lampLow']],
        rightProp: 'whistle',
        leftProp: 'signalLamp',
        turn: [[0, 0.3]],
      },
      { actor: 'penumpangPria', anchor: 'queue1', scale: 1.02, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'suitcase']], left: [[0, 'side']], rightProp: 'suitcase', turn: [[0, -0.5]], move: [[0, [0, 0, 0]], [0.6, [-0.35, 0, 0]]] },
      { actor: 'penumpangWanita', anchor: 'queue2', scale: 0.96, pose: 'stand', expression: [[0, 'warm']], right: [[0, 'side']], left: [[0, 'suitcase']], leftProp: 'suitcase', turn: [[0, -0.5]], move: [[0, [0, 0, 0]], [0.6, [-0.35, 0, 0]]] },
      { actor: 'bapakPeci', anchor: 'queue3', scale: 1.0, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'suitcase']], left: [[0, 'side']], rightProp: 'suitcase', turn: [[0, -0.5]], move: [[0, [0, 0, 0]], [0.6, [-0.35, 0, 0]]] },
    ],
  },
  // 6 — Inside the 3rd-class carriage climbing at 08.25: longitudinal benches, sacks on laps.
  {
    id: 'gerbong-kelas3',
    from: 1410,
    to: 1680,
    world: 'carriage',
    cut: 'dip',
    chip: [[0, { place: 'GERBONG KELAS III', year: '08.25' }]],
    aperture: [[0, 0.45]],
    camera: [
      { t: 0, pos: [-4.4, 1.2, 1.15], target: [-4.1, 0.95, -1.0], fov: 50 },
      { t: 1, pos: [3.0, 1.25, 1.15], target: [3.3, 0.95, -1.0], fov: 50 },
    ],
    grade: SEPIA,
    cast: [
      { actor: 'bapakPeci', anchor: 'seat1', scale: 1.0, pose: 'sit', expression: [[0, 'thinking']], right: [[0, 'lap']], left: [[0, 'lap']], turn: [[0, 0.5]] },
      { actor: 'petani', anchor: 'seat2', scale: 1.0, pose: 'sit', expression: [[0, 'neutral']], right: [[0, 'hug']], left: [[0, 'hug']], bodyProp: 'lapSack', turn: [[0, -0.2]] },
      { actor: 'ibuBakul', anchor: 'seat3', scale: 0.97, pose: 'sit', expression: [[0, 'warm']], right: [[0, 'basketLap']], left: [[0, 'basketLap']], bodyProp: 'lapBakul', turn: [[0, 0.4]] },
      { actor: 'anak', anchor: 'seat4', scale: 0.7, pose: 'stand', expression: [[0, 'wonder']], right: [[0, 'side']], left: [[0, 'hip']], turn: [[0, 0.8]] },
      { actor: 'penumpangWanita', anchor: 'seat5', scale: 0.96, pose: 'sit', expression: [[0, 'neutral']], right: [[0, 'hug']], left: [[0, 'hug']], bodyProp: 'lapSack', turn: [[0, -0.3]] },
      { actor: 'penumpangPria', anchor: 'seat6', scale: 1.02, pose: 'sit', expression: [[0, 'thinking']], right: [[0, 'lap']], left: [[0, 'lap']], turn: [[0, 0.6]] },
    ],
  },
  // 7 — Garut 1935 timetable "5x", whip-pan to 1947 rail repairs.
  {
    id: 'garut-1935-1947',
    from: 1680,
    to: 1980,
    world: 'garut1935',
    cut: 'dip',
    chip: [
      [0, { place: 'STASIUN GARUT', year: '1935' }],
      [0.53, { place: 'JALUR CIKAJANG–GARUT', year: '1947' }],
    ],
    aperture: [[0, 0.5]],
    camera: [
      { t: 0, pos: [0.1, 1.6, 3.6], target: [-0.8, 1.65, -2.2], fov: 38 },
      { t: 0.49, pos: [0.0, 1.6, 3.0], target: [-0.9, 1.75, -2.2], fov: 36 },
      { t: 0.535, pos: [6.6, 1.5, 3.6], target: [9.0, 0.7, 0.5], fov: 38 },
      { t: 1, pos: [8.0, 1.2, 2.5], target: [9.1, 0.55, 0.4], fov: 36 },
    ],
    grade: SEPIA,
    cast: [
      {
        actor: 'petugas1935',
        anchor: 'petugas',
        scale: 1.04,
        pose: 'stand',
        expression: [[0, 'warm'], [0.25, 'serious']],
        right: [[0, 'side'], [0.1, 'point'], [0.45, 'point']],
        left: [[0, 'hip']],
        turn: [[0, -0.4], [0.25, 0]],
      },
      { actor: 'pekerjaRel', anchor: 'pekerja1', scale: 1.02, pose: 'crouch', expression: [[0, 'serious']], right: [[0, 'hammer']], left: [[0, 'knee']], rightProp: 'hammer', turn: [[0, -0.3]] },
      { actor: 'pekerjaRel2', anchor: 'pekerja2', scale: 1.04, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'hammer']], left: [[0, 'hip']], rightProp: 'hammer', turn: [[0, 0.4]] },
    ],
  },
  // 8 — Dim early-1980s office: one chalk draws the falling line; rack focus to the old loco.
  {
    id: 'kantor-1980',
    from: 1980,
    to: 2280,
    world: 'office1980',
    cut: 'dip',
    chip: [[0, { place: 'KANTOR STASIUN', year: 'AWAL 1980-AN' }]],
    aperture: [[0, 0.5], [0.55, 0.75], [1, 0.95]],
    camera: [
      { t: 0, pos: [0.7, 1.35, 2.9], target: [0.05, 0.9, -1.0], fov: 38 },
      { t: 0.55, pos: [0.12, 0.98, 0.45], target: [0.02, 0.82, -1.0], fov: 34 },
      { t: 1, pos: [0.3, 1.05, 0.55], target: [1.2, 1.25, -3.2], fov: 34 },
    ],
    focus: [[0, [0.05, 0.9, -1.0]], [0.62, [0.02, 0.82, -1.0]], [0.85, [2.4, 1.2, -7.5]]],
    grade: { sepia: [[0, 0.75]] },
    cast: [
      {
        actor: 'petugas1980',
        anchor: 'chair',
        scale: 1.02,
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
    chip: [[0, { place: 'STASIUN GARUT', year: '1982' }]],
    aperture: [[0, 0.45]],
    camera: [
      { t: 0, pos: [-0.55, 1.7, 3.6], target: [-0.75, 1.45, -1.8], fov: 44 },
      { t: 0.4, pos: [0.3, 1.65, 3.6], target: [0.1, 1.5, -1.4], fov: 38 },
      { t: 0.7, pos: [0.8, 1.75, 4.1], target: [1.2, 1.3, -8], fov: 36 },
      { t: 1, pos: [0.9, 1.75, 4.4], target: [1.6, 1.15, -40], fov: 34 },
    ],
    grade: { sepia: [[0, 0.7]], grey: [[0, 0.1], [0.6, 0.45], [1, 1]] },
    cast: [
      {
        actor: 'petugas1982',
        anchor: 'petugas',
        scale: 1.03,
        pose: 'stand',
        expression: [[0, 'serious'], [0.4, 'sad']],
        left: [[0, 'reachUp'], [0.42, 'reachUp'], [0.52, 'side']],
        right: [[0, 'side']],
        turn: [[0, 0.3], [0.5, 0]],
      },
      { actor: 'penumpangPria', anchor: 'diam1', scale: 1.02, pose: 'stand', expression: [[0, 'sad']], right: [[0, 'suitcase']], left: [[0, 'side']], rightProp: 'suitcase', turn: [[0, 0.5]] },
      { actor: 'ibuBakul', anchor: 'diam2', scale: 0.97, pose: 'stand', expression: [[0, 'sad']], right: [[0, 'side']], left: [[0, 'side']], turn: [[0, 0.6]] },
      { actor: 'bapakPeci', anchor: 'diam3', scale: 1.0, pose: 'stand', expression: [[0, 'sad']], right: [[0, 'side']], left: [[0, 'hip']], turn: [[0, 0.4]], nod: [[0, 0.5]] },
    ],
  },
  // 10 — Today, bright noon: sepia match-cut to colour; ±50 m building, wild grass and murals; crane down.
  {
    id: 'cikajang-kini',
    from: 2580,
    to: 2850,
    world: 'cikajangToday',
    cut: 'hard',
    chip: [[0, { place: 'STASIUN CIKAJANG', year: 'KINI' }]],
    aperture: [[0, 0.3], [1, 0.45]],
    camera: [
      { t: 0, pos: [0.0, 6.2, 9.5], target: [0.0, 2.0, -4], fov: 46 },
      { t: 0.6, pos: [0.3, 2.4, 5.6], target: [0.0, 1.6, -3.5], fov: 42 },
      { t: 1, pos: [0.4, 1.45, 3.7], target: [0.0, 1.35, -3], fov: 38 },
    ],
    grade: { sepia: [[0, 0.92], [0.04, 0.92], [0.22, 0]] },
    cast: [
      dinda({
        anchor: 'dindaCenter',
        pose: 'stand',
        expression: [[0, 'wonder'], [0.5, 'warm']],
        right: [[0, 'side'], [0.2, 'pointSide'], [0.62, 'pointSide'], [0.72, 'palm']],
        left: [[0, 'side'], [0.24, 'spread'], [0.66, 'spread'], [0.76, 'strap']],
        turn: [[0, 0.2], [0.5, 0]],
      }),
    ],
  },
  // 11 — Right side: Dinda crouches and touches "Station Tjikadjang"; a cat on the threshold; rack focus.
  {
    id: 'ukiran-tjikadjang',
    from: 2850,
    to: 3120,
    world: 'cikajangToday',
    cut: 'dip',
    chip: [[0, { place: 'UKIRAN', year: '“STATION TJIKADJANG”' }]],
    aperture: [[0, 0.7], [1, 0.75]],
    // Medium shot: the tail of the carving ("…djang"), Dinda's hand on it AND her shoulder/head,
    // then push in and rack focus from the stone to her face.
    camera: [
      { t: 0, pos: [18.1, 0.95, -0.9], target: [18.08, 0.86, -3.6], fov: 36 },
      { t: 0.5, pos: [18.12, 1.0, -1.15], target: [18.12, 0.95, -3.55], fov: 35 },
      { t: 1, pos: [18.2, 1.1, -1.6], target: [18.25, 1.2, -3.45], fov: 34 },
    ],
    focus: [[0, [17.95, 0.92, -3.68]], [0.45, [17.95, 0.92, -3.68]], [0.72, [18.3, 1.25, -3.45]]],
    grade: COLOUR,
    cast: [
      dinda({
        anchor: 'dindaCrouch',
        pose: 'crouch',
        expression: [[0, 'thinking'], [0.6, 'warm']],
        right: [[0, 'traceLow']],
        left: [[0, 'knee']],
        turn: [[0, -0.55], [0.65, -0.1]],
      }),
      { actor: 'kucing', anchor: 'kucing', scale: 1, pose: 'sit', expression: [[0, 'neutral']] },
    ],
  },
  // 12 — Garut 2022, bright: route map, ticket in hand, modern train arrives.
  {
    id: 'garut-2022',
    from: 3120,
    to: 3390,
    world: 'garut2022',
    cut: 'dip',
    chip: [[0, { place: 'STASIUN GARUT', year: '2022' }]],
    aperture: [[0, 0.4]],
    camera: [
      { t: 0, pos: [-0.55, 1.6, 2.9], target: [-0.9, 1.6, -2.0], fov: 40 },
      { t: 0.45, pos: [-1.35, 1.8, 0.4], target: [-1.55, 1.8, -2.5], fov: 34 },
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
      { actor: 'penumpangModern', anchor: 'p1', scale: 1.03, pose: 'stand', expression: [[0, 'neutral']], right: [[0, 'ticket']], left: [[0, 'side']], rightProp: 'phone', turn: [[0, 0.6]] },
      { actor: 'penumpangModern2', anchor: 'p2', scale: 0.97, pose: 'stand', expression: [[0, 'warm']], right: [[0, 'side']], left: [[0, 'strap']], bodyProp: 'backpack', turn: [[0, 0.5]] },
      { actor: 'anakModern', anchor: 'p3', scale: 0.7, pose: 'stand', expression: [[0, 'wonder']], right: [[0, 'wave']], left: [[0, 'side']], turn: [[0, 0.7]] },
    ],
  },
  // 13 — Back to the rear door at dusk: hands in jacket pockets, years glow, "?" appears; dolly zoom.
  {
    id: 'angka-ketiga',
    from: 3390,
    to: 3640,
    world: 'stationRear',
    cut: 'dip',
    chip: [[0, { place: 'STASIUN CIKAJANG', year: '20??' }]],
    aperture: [[0, 0.45], [1, 0.6]],
    camera: [
      { t: 0, pos: [0.55, 1.4, 6.0], target: [0.5, 1.45, -0.8], fov: 26 },
      { t: 1, pos: [0.52, 2.0, 2.1], target: [0.5, 2.25, -0.8], fov: 56 },
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

/** Brief white flash for `flash` cuts (unused by default, kept for whip transitions). */
export function cutFlashAt(frame: number): number {
  let f = 0;
  for (const s of SHOTS) {
    if (s.cut !== 'flash') continue;
    const d = frame - s.from;
    if (d >= 0 && d < 8) f = Math.max(f, 1 - d / 8);
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

function curveParam(times: readonly number[], t: number): number {
  const n = times.length - 1;
  for (let i = 1; i <= n; i++) {
    const a = times[i - 1] ?? 0;
    const b = times[i] ?? 1;
    if (t <= b || i === n) {
      const local = b > a ? clamp01((t - a) / (b - a)) : 1;
      return (i - 1 + easeInOutSine(local)) / n;
    }
  }
  return 1;
}

const focusPoint = new THREE.Vector3();

export function sampleCamera(frame: number, out?: CameraSample): CameraSample {
  const { shot, progress } = getShotAt(frame);
  const rig = rigFor(shot);
  const u = curveParam(rig.times, progress);
  const sample = out ?? { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 35, roll: 0, focus: 5 };
  rig.pos.getPoint(u, sample.position);
  rig.target.getPoint(u, sample.target);
  sample.fov = keyed(shot.camera.map((k) => [k.t, k.fov] as const), progress);
  // Tiny deterministic handheld drift.
  const s = frame / CIKAJANG_FPS;
  sample.position.x += Math.sin(s * 0.9) * 0.008 + Math.sin(s * 2.3) * 0.003;
  sample.position.y += Math.sin(s * 1.3 + 1) * 0.006;
  sample.target.x += Math.sin(s * 0.7 + 2) * 0.006;
  const k = hookShakeAt(frame);
  sample.position.x += k * 0.02 * Math.sin(frame * 2.9);
  sample.position.y += k * 0.016 * Math.sin(frame * 3.7 + 1);
  sample.roll = k * 0.02 * Math.sin(frame * 2.6 + 1.3);
  if (shot.focus) keyedVec3(shot.focus, progress, focusPoint);
  else focusPoint.copy(sample.target);
  sample.focus = sample.position.distanceTo(focusPoint);
  return sample;
}

export function apertureAt(frame: number): number {
  const { shot, progress } = getShotAt(frame);
  return keyed(shot.aperture, progress);
}
