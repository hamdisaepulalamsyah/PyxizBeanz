import * as THREE from 'three';
import { type FxCue, type FxKind, SHOTS, clamp01, hash01, smoothstep } from './story';
import { HEAD_CENTER_M, HEAD_HALF_H_M, HEAD_HALF_W_M } from './toon';

/**
 * Cartoon 2D FX (skill v2.2 §4.3): short-lived comic cards on story beats only.
 *
 *  - Head-attached / world cards (`sweat`, `question`, `exclaim`, `zzz`, `spark`)
 *    are camera-facing THREE.Sprites in the shot's world, NOINK, drawn with the
 *    same plum ink as the cast.
 *  - `speedLines` is a screen-space overlay (see `speedLinesAt` + the SVG in
 *    Cikajang.tsx) whose clear centre keeps faces and signs readable.
 *
 * Everything is a pure function of the frame.
 */

const INK = '#241726';

/** Pop-in / settle / fade envelope: scale overshoot over 6 frames, fade the last 6. */
function envelope(age: number, frames: number): { scale: number; alpha: number } {
  if (age < 0 || age >= frames) return { scale: 0, alpha: 0 };
  const t = clamp01(age / 6);
  const scale = t < 1 ? 1.18 * Math.sin((t * Math.PI) / 2) + (t > 0.7 ? -0.18 * smoothstep(0.7, 1, t) : 0) : 1;
  const alpha = 1 - smoothstep(frames - 6, frames, age);
  return { scale: Math.max(0, scale), alpha };
}

// ── Card painters ───────────────────────────────────────────────────────────

function paintCard(kind: Exclude<FxKind, 'speedLines'>): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas2D context unavailable');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const glyph = (text: string, size: number, fill: string, x = 128, y = 140, rot = 0): void => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.font = `900 ${size}px 'Plus Jakarta Sans', 'Arial Black', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = size * 0.16;
    g.strokeStyle = INK;
    g.strokeText(text, 0, 0);
    g.fillStyle = fill;
    g.fillText(text, 0, 0);
    g.restore();
  };
  switch (kind) {
    case 'sweat': {
      // Classic anime sweat drop: pale blue teardrop, thick plum ink, white glint.
      g.beginPath();
      g.moveTo(128, 34);
      g.bezierCurveTo(150, 92, 188, 128, 188, 168);
      g.arc(128, 168, 60, 0, Math.PI, false);
      g.bezierCurveTo(68, 128, 106, 92, 128, 34);
      g.closePath();
      g.fillStyle = '#9fd6f5';
      g.fill();
      g.lineWidth = 12;
      g.strokeStyle = INK;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.ellipse(108, 160, 10, 22, -0.35, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'question':
      glyph('?', 200, '#fbbf24');
      break;
    case 'exclaim':
      glyph('!', 210, '#ff6b4a');
      break;
    case 'zzz':
      glyph('Z', 96, '#e8e2ff', 84, 190, -0.2);
      glyph('Z', 76, '#e8e2ff', 150, 118, -0.15);
      glyph('Z', 58, '#e8e2ff', 204, 58, -0.1);
      break;
    case 'spark': {
      // Four-point star with two satellites.
      const star = (x: number, y: number, r: number): void => {
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 - Math.PI / 2;
          const rr = i % 2 === 0 ? r : r * 0.28;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.closePath();
        g.fillStyle = '#fff3b0';
        g.fill();
        g.lineWidth = r * 0.12;
        g.strokeStyle = INK;
        g.stroke();
      };
      star(118, 132, 92);
      star(206, 60, 32);
      star(208, 200, 22);
      break;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Sprite layer per stage ──────────────────────────────────────────────────

interface FxSlot {
  cue: FxCue;
  sprite: THREE.Sprite;
  /** Absolute start frame. */
  start: number;
  seed: number;
}

export interface FxTarget {
  /** World position of the actor's sole (mesh origin). */
  position: THREE.Vector3;
  scale: number;
  visible: boolean;
}

const textures = new Map<string, THREE.CanvasTexture>();

function textureFor(kind: Exclude<FxKind, 'speedLines'>): THREE.CanvasTexture {
  let t = textures.get(kind);
  if (!t) {
    t = paintCard(kind);
    textures.set(kind, t);
  }
  return t;
}

const right = new THREE.Vector3();
const up = new THREE.Vector3();

export class FxLayer {
  readonly group = new THREE.Group();
  private readonly slots: FxSlot[] = [];

  constructor(shotIndex: number) {
    const shot = SHOTS[shotIndex];
    if (!shot) return;
    const len = Math.max(1, shot.to - shot.from - 1);
    (shot.fx ?? []).forEach((cue, i) => {
      if (cue.kind === 'speedLines') return;
      const mat = new THREE.SpriteMaterial({ map: textureFor(cue.kind), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false });
      const sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 20;
      sprite.visible = false;
      sprite.userData.noInk = true;
      this.group.add(sprite);
      this.slots.push({ cue, sprite, start: shot.from + Math.round(cue.at * len), seed: shotIndex * 31 + i * 7 });
    });
  }

  /** Places and animates every cue for `frame`; `targets[i]` is cast member i. */
  update(frame: number, camera: THREE.Camera, targets: readonly FxTarget[]): void {
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    for (const s of this.slots) {
      const age = frame - s.start;
      const env = envelope(age, s.cue.frames);
      const target = s.cue.cast !== undefined ? targets[s.cue.cast] : undefined;
      if (env.alpha <= 0 || (target && !target.visible) || (!target && !s.cue.pos)) {
        s.sprite.visible = false;
        continue;
      }
      const k = s.cue.size ?? 1;
      const p = s.sprite.position;
      let size: number;
      if (target) {
        const sc = target.scale;
        const headY = target.position.y + HEAD_CENTER_M * sc;
        p.copy(target.position);
        p.y = headY;
        if (s.cue.kind === 'sweat') {
          // Temple, on the side away from the camera's right so it frames the face; drips down.
          p.addScaledVector(right, HEAD_HALF_W_M * 0.92 * sc);
          p.addScaledVector(up, HEAD_HALF_H_M * (0.35 - 0.35 * smoothstep(0, s.cue.frames, age)) * sc);
          size = HEAD_HALF_H_M * 0.55 * sc;
        } else {
          // Above-and-beside the head, bobbing gently.
          p.addScaledVector(right, HEAD_HALF_W_M * 0.95 * sc);
          p.addScaledVector(up, HEAD_HALF_H_M * (1.25 + 0.06 * Math.sin(age * 0.35 + s.seed)) * sc);
          size = HEAD_HALF_H_M * 0.85 * sc;
        }
      } else {
        const [x, y, z] = s.cue.pos ?? [0, 0, 0];
        p.set(x, y, z);
        size = 0.32;
      }
      if (s.cue.kind === 'zzz') p.addScaledVector(up, 0.12 * clamp01(age / s.cue.frames));
      const twinkle = s.cue.kind === 'spark' ? 0.85 + 0.15 * Math.sin(age * 0.9 + s.seed) : 1;
      s.sprite.scale.setScalar(size * k * env.scale * twinkle);
      const mat = s.sprite.material;
      mat.opacity = env.alpha;
      mat.rotation = s.cue.kind === 'spark' ? age * 0.04 : s.cue.kind === 'question' ? 0.12 * Math.sin(age * 0.3) : 0;
      s.sprite.visible = true;
    }
  }

  dispose(): void {
    for (const s of this.slots) s.sprite.material.dispose();
  }
}

export function disposeFxTextures(): void {
  for (const t of textures.values()) t.dispose();
  textures.clear();
}

// ── Screen-space speed lines ────────────────────────────────────────────────

/** 0..1 strength of the radial speed lines at `frame` (fast in, 1-frame hold, ease out). */
export function speedLinesAt(frame: number): number {
  let v = 0;
  for (const shot of SHOTS) {
    const len = Math.max(1, shot.to - shot.from - 1);
    for (const cue of shot.fx ?? []) {
      if (cue.kind !== 'speedLines') continue;
      const age = frame - (shot.from + Math.round(cue.at * len));
      if (age < 0 || age >= cue.frames) continue;
      v = Math.max(v, smoothstep(0, 2, age + 1) * (1 - smoothstep(cue.frames * 0.35, cue.frames, age)));
    }
  }
  return v;
}

export interface SpeedLine {
  angle: number;
  /** Inner radius as a fraction of the half-diagonal (≥ 0.55 keeps the centre clear). */
  inner: number;
  width: number;
}

/** Deterministic line set; re-jittered every 2 frames so the lines feel alive. */
export function speedLineSet(frame: number, count = 56): SpeedLine[] {
  const tick = Math.floor(frame / 2);
  const out: SpeedLine[] = [];
  for (let i = 0; i < count; i++) {
    const h = hash01(i * 13 + 7, tick);
    out.push({
      angle: ((i + h * 0.6) / count) * Math.PI * 2,
      inner: 0.58 + hash01(i * 7 + 101, tick) * 0.3,
      width: 3 + hash01(i * 5 + 211, tick) * 9,
    });
  }
  return out;
}
