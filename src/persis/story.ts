import * as THREE from 'three';

/**
 * "Sejarah Persis: Dalilnya Mana?" — shot list, camera splines, cast blocking
 * and caption data. Everything here is pure data + pure functions of the frame
 * number so any frame can be rendered independently.
 */

export const PERSIS_FPS = 30;
export const PERSIS_DURATION_IN_FRAMES = 2368;
export const PERSIS_WIDTH = 1080;
export const PERSIS_HEIGHT = 1920;
/** Frames of the dip-to-indigo on each side of a shot cut. */
export const SHOT_DIP_FRAMES = 9;

/** Opening hook (frames 0–90): teaser badge, title slam at `impactFrame`, camera shake. */
export const HOOK = {
  badgeIn: 2,
  impactFrame: 16,
  holdUntil: 80,
  outEnd: 94,
  teaser: 'SATU PERTANYAAN MENGGUNCANG HINDIA BELANDA',
  title: 'Dalilnya Mana?',
  kicker: 'SEJARAH PERSIS',
} as const;

/** 0..1 decaying impact energy after the title slam (drives camera + title shake). */
export function hookShakeAt(frame: number): number {
  const d = frame - HOOK.impactFrame;
  return d < 0 ? 0 : Math.exp(-d / 6);
}

// ── Math helpers shared by every module ─────────────────────────────────────

export type Vec3 = readonly [number, number, number];

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number): number => Math.pow(clamp01(t), 3);

/** Deterministic 0..1 hash for seeded per-character variation. */
export const hash01 = (seed: number, k: number): number => {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Seeded soft listening nods (single or double) roughly every 2.5–4 s; 0..1. */
export function nodPulseAt(frame: number, seed: number): number {
  const period = 96;
  const k0 = Math.floor(frame / period);
  let v = 0;
  for (let k = k0 - 1; k <= k0; k++) {
    const t0 = k * period + 10 + hash01(seed + 31, k) * 50;
    const beats = hash01(seed + 41, k) > 0.55 ? 2 : 1;
    for (let b = 0; b < beats; b++) {
      const d = frame - t0 - b * 11;
      if (d >= 0 && d <= 12) v = Math.max(v, Math.sin((d / 12) * Math.PI));
    }
  }
  return v;
}

/** 0..1 envelope over progress windows, ramping smoothly in and out at each edge. */
export function windowEnvelope(windows: readonly (readonly [number, number])[], progress: number, ramp = 0.03): number {
  let v = 0;
  for (const [a, b] of windows) v = Math.max(v, Math.min(smoothstep(a - ramp, a + ramp, progress), 1 - smoothstep(b - ramp, b + ramp, progress)));
  return v;
}

/** Linear interpolation through `[t, value]` keys with smoothstep easing per segment. */
export function keyed(keys: readonly (readonly [number, number])[], t: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return 0;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (a && b && t <= b[0]) return lerp(a[1], b[1], smoothstep(a[0], b[0], t));
  }
  return last[1];
}

// ── Shot list ───────────────────────────────────────────────────────────────

export type WorldId =
  | 'bandung1923'
  | 'langgar'
  | 'hassanStudy'
  | 'pressRoom'
  | 'endeCoast'
  | 'pesantren1936'
  | 'parliament1950'
  | 'gedungSate';

export type CharacterId = 'zamzam' | 'yunus' | 'hassan' | 'soekarno' | 'natsir';
export type Expression = 'neutral' | 'respect' | 'serious' | 'thinking' | 'warm';

/** A camera pose at local shot progress `t` (0..1). Positions are splined, fov is eased. */
export interface CameraKey {
  t: number;
  pos: Vec3;
  target: Vec3;
  fov: number;
}

export interface CastMember {
  actor: CharacterId;
  /** Named anchor exported by the world builder. */
  anchor: string;
  scale: number;
  /** Visible only inside this progress window (default whole shot). */
  visible?: readonly [number, number];
  /** Progress windows where the mouth lip-syncs to the narration. */
  speaking: readonly (readonly [number, number])[];
  expression: readonly (readonly [number, Expression])[];
  /** Head turn -1..1 (screen left..right). */
  turn?: readonly (readonly [number, number])[];
  /** Raised index-finger gesture 0..1 ("dalil" gesture). */
  gesture?: readonly (readonly [number, number])[];
  /** Respectful head bow 0..1. */
  nod?: readonly (readonly [number, number])[];
}

export interface Shot {
  id: string;
  from: number;
  /** Exclusive end frame. */
  to: number;
  world: WorldId;
  chip: { place: string; year: string };
  camera: readonly CameraKey[];
  /** Bokeh strength (0 = pin-sharp, 1 = very shallow focus). */
  aperture: number;
  cast: readonly CastMember[];
}

export const SHOTS: readonly Shot[] = [
  {
    id: 'bandung-1923',
    from: 0,
    to: 295,
    world: 'bandung1923',
    chip: { place: 'BANDUNG', year: '1923' },
    aperture: 0.55,
    camera: [
      { t: 0, pos: [0.6, 7.6, 15], target: [0, 4.2, -30], fov: 42 },
      { t: 0.35, pos: [1.4, 4.4, 4], target: [0.2, 3, -24], fov: 38 },
      { t: 0.75, pos: [0.5, 2.7, -13], target: [0, 2.45, -24.4], fov: 33 },
      { t: 1, pos: [0.05, 2.5, -19.6], target: [0, 2.4, -24.6], fov: 30 },
    ],
    cast: [
      { actor: 'zamzam', anchor: 'windowLeft', scale: 0.85, speaking: [], expression: [[0, 'respect']], turn: [[0, 0.25]] },
      { actor: 'yunus', anchor: 'windowRight', scale: 0.85, speaking: [], expression: [[0, 'warm']], turn: [[0, -0.25]] },
    ],
  },
  {
    id: 'langgar',
    from: 295,
    to: 735,
    world: 'langgar',
    chip: { place: 'LANGGAR, BANDUNG', year: '1923' },
    aperture: 0.75,
    camera: [
      { t: 0, pos: [0, 1.55, 4.4], target: [0, 1.0, -1.2], fov: 38 },
      { t: 0.4, pos: [0.45, 1.3, 2.3], target: [0, 0.9, -0.7], fov: 34 },
      { t: 0.7, pos: [-1.2, 1.3, 1.5], target: [-0.4, 1.05, -1.4], fov: 33 },
      { t: 1, pos: [1.3, 1.35, 1.7], target: [0.3, 1.05, -1.45], fov: 34 },
    ],
    cast: [
      {
        actor: 'zamzam',
        anchor: 'seatLeft',
        scale: 1.15,
        speaking: [[0.05, 0.5]],
        expression: [[0, 'respect'], [0.3, 'serious'], [0.55, 'respect']],
        turn: [[0, 0.15], [0.45, 0.35], [0.6, 0.45]],
        gesture: [[0, 0], [0.18, 0], [0.24, 1], [0.38, 1], [0.45, 0]],
      },
      {
        actor: 'yunus',
        anchor: 'seatRight',
        scale: 1.15,
        speaking: [[0.55, 0.98]],
        expression: [[0, 'warm'], [0.5, 'thinking'], [0.62, 'serious'], [0.9, 'respect']],
        turn: [[0, -0.35], [0.5, -0.2], [0.65, -0.1]],
        nod: [[0, 0], [0.08, 0.6], [0.14, 0], [0.92, 0], [0.97, 0.7]],
      },
    ],
  },
  {
    id: 'hassan-study-debate',
    from: 735,
    to: 990,
    world: 'hassanStudy',
    chip: { place: 'A. HASSAN', year: '1926' },
    aperture: 0.7,
    camera: [
      { t: 0, pos: [-3.3, 1.55, 1.6], target: [-4, 1.05, -1.4], fov: 34 },
      { t: 0.45, pos: [-2.7, 1.75, 2.1], target: [-3.9, 1.15, -1.5], fov: 33 },
      { t: 0.6, pos: [2.0, 2.3, 4.6], target: [4, 1.75, -1.2], fov: 34 },
      { t: 1, pos: [3.2, 2.15, 3.7], target: [4, 1.85, -1.2], fov: 28 },
    ],
    cast: [
      {
        actor: 'hassan',
        anchor: 'desk',
        scale: 1.1,
        visible: [0, 0.55],
        speaking: [],
        expression: [[0, 'thinking'], [0.3, 'serious']],
        turn: [[0, 0.3], [0.25, 0.1], [0.4, -0.2]],
      },
      {
        actor: 'hassan',
        anchor: 'podium',
        scale: 1.15,
        visible: [0.55, 1],
        speaking: [[0.6, 1]],
        expression: [[0.55, 'serious'], [0.85, 'warm']],
        turn: [[0.55, -0.15], [0.8, 0.1]],
        gesture: [[0.6, 0], [0.7, 1], [0.95, 1]],
      },
    ],
  },
  {
    id: 'pembela-islam',
    from: 990,
    to: 1230,
    world: 'pressRoom',
    chip: { place: 'PEMBELA ISLAM', year: '1929' },
    aperture: 0.6,
    camera: [
      { t: 0, pos: [0.2, 1.9, 4.8], target: [0, 1.2, -1], fov: 38 },
      { t: 0.45, pos: [-1.9, 1.55, 2.3], target: [-2.3, 0.95, 0], fov: 34 },
      { t: 1, pos: [2.2, 2.35, 2.1], target: [2.6, 0.85, 0.15], fov: 34 },
    ],
    cast: [
      {
        actor: 'hassan',
        anchor: 'operator',
        scale: 1.1,
        speaking: [[0.1, 0.55]],
        expression: [[0, 'serious'], [0.5, 'warm']],
        turn: [[0, 0.4], [0.5, 0.2], [0.8, 0.5]],
      },
    ],
  },
  {
    id: 'ende-flores',
    from: 1230,
    to: 1662,
    world: 'endeCoast',
    chip: { place: 'ENDE, FLORES', year: '1934' },
    aperture: 0.65,
    camera: [
      { t: 0, pos: [1.7, 5.2, 3.3], target: [-0.6, 4.9, -0.6], fov: 34 },
      { t: 0.38, pos: [1.4, 5.3, 2.2], target: [-0.5, 5.0, -0.8], fov: 30 },
      { t: 0.62, pos: [2.6, 5.7, 2.3], target: [1.2, 5.6, -6], fov: 36 },
      { t: 1, pos: [1.8, 6.3, 1.2], target: [5.5, 7, -36], fov: 40 },
    ],
    cast: [
      {
        actor: 'soekarno',
        anchor: 'underTree',
        scale: 1.2,
        speaking: [[0.04, 0.36]],
        expression: [[0, 'thinking'], [0.2, 'serious'], [0.42, 'warm']],
        turn: [[0, -0.3], [0.3, -0.1], [0.45, 0.45], [1, 0.55]],
        gesture: [[0.3, 0], [0.36, 1], [0.44, 0]],
      },
    ],
  },
  {
    id: 'pesantren-1936',
    from: 1662,
    to: 1800,
    world: 'pesantren1936',
    chip: { place: 'PESANTREN PERSIS', year: '1936' },
    aperture: 0.5,
    camera: [
      { t: 0, pos: [6, 2.5, 11], target: [0, 2.3, -3], fov: 40 },
      { t: 1, pos: [-2.4, 2.1, 9.8], target: [-3.3, 1.8, -1.8], fov: 34 },
    ],
    cast: [
      {
        actor: 'hassan',
        anchor: 'platform',
        scale: 1.05,
        speaking: [],
        expression: [[0, 'warm']],
        turn: [[0, 0.5], [0.6, 0.2]],
        gesture: [[0.2, 0], [0.4, 1], [0.9, 1]],
      },
    ],
  },
  {
    id: 'mosi-integral',
    from: 1800,
    to: 2100,
    world: 'parliament1950',
    chip: { place: 'PARLEMEN RIS', year: '1950' },
    aperture: 0.6,
    camera: [
      { t: 0, pos: [0, 3.3, 9.5], target: [0, 2.5, -4], fov: 42 },
      { t: 0.45, pos: [0.55, 2.2, 0.6], target: [0, 2.15, -3.7], fov: 30 },
      { t: 0.6, pos: [0.3, 2.4, 2.6], target: [0, 3.6, -6], fov: 38 },
      { t: 1, pos: [0, 2.9, 5.6], target: [0, 4.6, -8], fov: 42 },
    ],
    cast: [
      {
        actor: 'natsir',
        anchor: 'podium',
        scale: 1.15,
        speaking: [[0.05, 0.6]],
        expression: [[0, 'serious'], [0.45, 'respect'], [0.75, 'warm']],
        turn: [[0, 0], [0.3, 0.2], [0.5, -0.1]],
        gesture: [[0.15, 0], [0.22, 1], [0.4, 1], [0.48, 0]],
      },
    ],
  },
  {
    id: 'dalilnya-mana',
    from: 2100,
    to: 2368,
    world: 'gedungSate',
    chip: { place: 'BANDUNG', year: 'KINI' },
    aperture: 0.45,
    camera: [
      { t: 0, pos: [0, 6.1, 1.6], target: [0, 6.3, -4], fov: 34 },
      { t: 0.35, pos: [0, 5.6, 5], target: [0, 6.6, -6], fov: 36 },
      { t: 1, pos: [0, 3.6, 17], target: [0, 7.2, -12], fov: 40 },
    ],
    cast: [],
  },
];

export interface ShotState {
  shot: Shot;
  index: number;
  /** Frames since the shot started. */
  localFrame: number;
  /** Linear 0..1 progress through the shot. */
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

/** 0 → 1 → 0 dip around each cut, used for the fade-through-indigo. */
export function cutDipAt(frame: number): number {
  let dip = 0;
  for (let i = 1; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (!s) continue;
    const d = Math.abs(frame + 0.5 - s.from) / SHOT_DIP_FRAMES;
    dip = Math.max(dip, 1 - smoothstep(0, 1, d));
  }
  // Hook: hold the world half-dark under the teaser, then reveal on the title slam.
  const hit = HOOK.impactFrame;
  const head = frame < hit ? lerp(1, 0.5, smoothstep(0, hit, frame)) : 0.5 * (1 - smoothstep(hit, hit + 8, frame));
  dip = Math.max(dip, head, smoothstep(PERSIS_DURATION_IN_FRAMES - 20, PERSIS_DURATION_IN_FRAMES - 1, frame));
  return dip;
}

export function isCastVisible(member: CastMember, progress: number): boolean {
  const [a, b] = member.visible ?? [0, 1];
  return progress >= a && progress <= b;
}

export function expressionAt(member: CastMember, progress: number): { from: Expression; to: Expression; mix: number } {
  const keys = member.expression;
  const first = keys[0];
  if (!first) return { from: 'neutral', to: 'neutral', mix: 0 };
  let prev = first;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (!k) continue;
    if (progress < k[0]) {
      // ~0.04 progress crossfade before each new expression.
      const mix = smoothstep(k[0] - 0.04, k[0], progress);
      return { from: prev[1], to: k[1], mix };
    }
    prev = k;
  }
  return { from: prev[1], to: prev[1], mix: 0 };
}

// ── Camera ──────────────────────────────────────────────────────────────────

export interface CameraSample {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  /** Camera roll in radians (impact shake). */
  roll: number;
}

interface CameraRig {
  pos: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  /** Key times re-mapped to curve parameters (uniform per segment). */
  times: number[];
}

const rigCache = new Map<string, CameraRig>();

function rigFor(shot: Shot): CameraRig {
  const cached = rigCache.get(shot.id);
  if (cached) return cached;
  const keys = shot.camera.length >= 2 ? shot.camera : [...shot.camera, ...shot.camera];
  const pts = keys.map((k) => new THREE.Vector3(...k.pos));
  const tgs = keys.map((k) => new THREE.Vector3(...k.target));
  const rig: CameraRig = {
    pos: new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
    target: new THREE.CatmullRomCurve3(tgs, false, 'centripetal'),
    times: keys.map((k) => k.t),
  };
  rigCache.set(shot.id, rig);
  return rig;
}

/** Converts shot progress to a curve parameter so each key is hit at its own `t`. */
function curveParam(times: readonly number[], t: number): number {
  const n = times.length - 1;
  for (let i = 1; i <= n; i++) {
    const a = times[i - 1] ?? 0;
    const b = times[i] ?? 1;
    if (t <= b || i === n) {
      const local = b > a ? clamp01((t - a) / (b - a)) : 1;
      // Ease inside each segment so the camera settles on every key.
      return (i - 1 + easeInOutSine(local)) / n;
    }
  }
  return 1;
}

/** Cinematic glide with a tiny deterministic handheld drift. */
export function sampleCamera(frame: number, out?: CameraSample): CameraSample {
  const { shot, progress } = getShotAt(frame);
  const rig = rigFor(shot);
  const u = curveParam(rig.times, progress);
  const sample = out ?? { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 35, roll: 0 };
  rig.pos.getPoint(u, sample.position);
  rig.target.getPoint(u, sample.target);
  const fovKeys = shot.camera.map((k) => [k.t, k.fov] as const);
  sample.fov = keyed(fovKeys, progress);
  const s = frame / PERSIS_FPS;
  sample.position.x += Math.sin(s * 0.9) * 0.012 + Math.sin(s * 2.3) * 0.004;
  sample.position.y += Math.sin(s * 1.3 + 1) * 0.009;
  sample.target.x += Math.sin(s * 0.7 + 2) * 0.01;
  // High-frequency decaying shake when the hook title slams in.
  const k = hookShakeAt(frame);
  sample.position.x += k * 0.09 * Math.sin(frame * 2.9);
  sample.position.y += k * 0.07 * Math.sin(frame * 3.7 + 1);
  sample.target.x += k * 0.14 * Math.sin(frame * 2.3 + 2);
  sample.target.y += k * 0.1 * Math.sin(frame * 3.1 + 0.5);
  sample.roll = k * 0.025 * Math.sin(frame * 2.6 + 1.3);
  return sample;
}

// ── Narration timing & captions ─────────────────────────────────────────────

export interface WordTiming {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface SentenceTiming {
  text: string;
  startFrame: number;
  endFrame: number;
}

type Unit = 'frames' | 'seconds' | 'ms';

const TEXT_KEYS = ['word', 'text', 'token', 'sentence', 'value'] as const;
const TIME_KEYS: readonly { start: string; end: string; unit: Unit }[] = [
  { start: 'startFrame', end: 'endFrame', unit: 'frames' },
  { start: 'start_frame', end: 'end_frame', unit: 'frames' },
  { start: 'startMs', end: 'endMs', unit: 'ms' },
  { start: 'start_ms', end: 'end_ms', unit: 'ms' },
  { start: 'start', end: 'end', unit: 'seconds' },
  { start: 'start_time', end: 'end_time', unit: 'seconds' },
  { start: 'startTime', end: 'endTime', unit: 'seconds' },
  { start: 'start_s', end: 'end_s', unit: 'seconds' },
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function toFrames(value: number, unit: Unit, fps: number): number {
  if (unit === 'frames') return value;
  if (unit === 'ms') return (value / 1000) * fps;
  return value * fps;
}

function parseTimedItem(item: unknown, fps: number): WordTiming | null {
  if (!isRecord(item)) return null;
  let text: string | null = null;
  for (const k of TEXT_KEYS) {
    const v = item[k];
    if (typeof v === 'string') {
      text = v;
      break;
    }
  }
  if (text === null) return null;
  for (const { start, end, unit } of TIME_KEYS) {
    const a = item[start];
    const b = item[end];
    if (typeof a === 'number' && typeof b === 'number') {
      return { text: text.trim(), startFrame: Math.round(toFrames(a, unit, fps)), endFrame: Math.round(toFrames(b, unit, fps)) };
    }
  }
  return null;
}

/** ElevenLabs `with-timestamps` character alignment → words. */
function wordsFromAlignment(a: Record<string, unknown>, fps: number): WordTiming[] | null {
  const chars = a.characters;
  const starts = a.character_start_times_seconds;
  const ends = a.character_end_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends)) return null;
  const words: WordTiming[] = [];
  let text = '';
  let s = 0;
  let e = 0;
  const flush = (): void => {
    if (text.trim()) words.push({ text: text.trim(), startFrame: Math.round(s * fps), endFrame: Math.round(e * fps) });
    text = '';
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const cs = starts[i];
    const ce = ends[i];
    if (typeof c !== 'string' || typeof cs !== 'number' || typeof ce !== 'number') continue;
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    if (!text) s = cs;
    text += c;
    e = ce;
  }
  flush();
  return words;
}

function unwrapList(raw: unknown, keys: readonly string[]): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    for (const k of keys) {
      const v = raw[k];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

/**
 * Accepts `[{word|text, start, end}]` (seconds), `{startFrame,endFrame}`,
 * `{startMs,endMs}`, a `{words: [...]}` wrapper, or raw ElevenLabs character
 * alignment (optionally under `alignment` / `normalized_alignment`).
 */
export function parseWords(raw: unknown, fps: number): WordTiming[] {
  if (isRecord(raw)) {
    for (const key of ['alignment', 'normalized_alignment'] as const) {
      const nested = raw[key];
      if (isRecord(nested)) {
        const w = wordsFromAlignment(nested, fps);
        if (w) return w;
      }
    }
    const direct = wordsFromAlignment(raw, fps);
    if (direct) return direct;
  }
  const list = unwrapList(raw, ['words', 'items', 'segments']);
  if (!list) throw new Error('words.json: expected an array of timed words or ElevenLabs alignment');
  const out: WordTiming[] = [];
  list.forEach((item, i) => {
    const w = parseTimedItem(item, fps);
    if (!w) throw new Error(`words.json: entry ${i} has no recognisable text/start/end fields`);
    if (w.text) out.push(w);
  });
  return out.sort((a, b) => a.startFrame - b.startFrame);
}

/** Same shapes as words; falls back to splitting `words` on sentence punctuation. */
export function parseSentences(raw: unknown, fps: number, words: readonly WordTiming[]): SentenceTiming[] {
  const list = raw === null || raw === undefined ? null : unwrapList(raw, ['sentences', 'items', 'segments']);
  if (list && list.length > 0) {
    const out: SentenceTiming[] = [];
    list.forEach((item, i) => {
      const s = parseTimedItem(item, fps);
      if (!s) throw new Error(`sentences.json: entry ${i} has no recognisable text/start/end fields`);
      out.push(s);
    });
    return out.sort((a, b) => a.startFrame - b.startFrame);
  }
  const out: SentenceTiming[] = [];
  let bucket: WordTiming[] = [];
  const flush = (): void => {
    const f = bucket[0];
    const l = bucket[bucket.length - 1];
    if (f && l) out.push({ text: bucket.map((w) => w.text).join(' '), startFrame: f.startFrame, endFrame: l.endFrame });
    bucket = [];
  };
  for (const w of words) {
    bucket.push(w);
    if (/[.!?…]["”')]*$/.test(w.text)) flush();
  }
  flush();
  return out;
}

/** Index of the word being spoken at `frame`, or -1 in a pause. */
export function activeWordIndex(words: readonly WordTiming[], frame: number): number {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (!w) break;
    if (frame < w.startFrame) hi = mid - 1;
    else if (frame >= w.endFrame) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export const CAPTION_FRAMING = {
  /** Distance from the bottom edge to the caption block (clears platform UI). */
  bottom: 360,
  sidePadding: 80,
  maxCharsPerLine: 20,
  maxLines: 2,
  fontSize: 76,
  lineHeight: 1.12,
  /** Extra frames a page lingers after its last word. */
  hold: 12,
  highlight: '#FBBF24',
} as const;

export interface CaptionPage {
  startFrame: number;
  endFrame: number;
  lines: WordTiming[][];
}

/** Groups words into 1–2 line pages that never cross a sentence boundary. */
export function buildCaptionPages(words: readonly WordTiming[], sentences: readonly SentenceTiming[]): CaptionPage[] {
  const { maxCharsPerLine, maxLines, hold } = CAPTION_FRAMING;
  const sentenceOf = (w: WordTiming): number => {
    const mid = (w.startFrame + w.endFrame) / 2;
    for (let i = sentences.length - 1; i >= 0; i--) {
      const s = sentences[i];
      if (s && mid >= s.startFrame - 1) return i;
    }
    return 0;
  };

  const pages: CaptionPage[] = [];
  let lines: WordTiming[][] = [[]];
  let lineLen = 0;
  let currentSentence = -1;

  const pushPage = (): void => {
    const filled = lines.filter((l) => l.length > 0);
    const first = filled[0]?.[0];
    const lastLine = filled[filled.length - 1];
    const last = lastLine?.[lastLine.length - 1];
    if (first && last) pages.push({ startFrame: first.startFrame, endFrame: last.endFrame + hold, lines: filled });
    lines = [[]];
    lineLen = 0;
  };

  for (const w of words) {
    const si = sentenceOf(w);
    if (si !== currentSentence) {
      pushPage();
      currentSentence = si;
    }
    const len = w.text.length + (lineLen > 0 ? 1 : 0);
    if (lineLen > 0 && lineLen + len > maxCharsPerLine) {
      if (lines.length >= maxLines) pushPage();
      else {
        lines.push([]);
        lineLen = 0;
      }
    }
    const line = lines[lines.length - 1];
    if (line) line.push(w);
    lineLen += w.text.length + (lineLen > 0 ? 1 : 0);
  }
  pushPage();

  // A page ends when the next one starts so captions never overlap.
  for (let i = 0; i < pages.length - 1; i++) {
    const p = pages[i];
    const n = pages[i + 1];
    if (p && n) p.endFrame = Math.min(p.endFrame, n.startFrame);
  }
  return pages;
}

export function captionPageAt(pages: readonly CaptionPage[], frame: number): CaptionPage | null {
  for (const p of pages) if (frame >= p.startFrame && frame < p.endFrame) return p;
  return null;
}

/** Sentences whose midpoint falls inside the shot (for per-shot narration lookups). */
export function sentencesInShot(shot: Shot, sentences: readonly SentenceTiming[]): SentenceTiming[] {
  return sentences.filter((s) => {
    const mid = (s.startFrame + s.endFrame) / 2;
    return mid >= shot.from && mid < shot.to;
  });
}
