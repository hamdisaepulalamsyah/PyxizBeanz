import * as THREE from 'three';
import { FX_CUES, type FxCue, type FxKind, SHOTS, clamp01, hash01, smoothstep } from './story';
import { HEAD_CENTER_M, HEAD_HALF_H_M, HEAD_HALF_W_M } from '../cikajang/toon';

/** Cartoon 2D FX layer for Jam Gadang (isolated from Cikajang). */

const INK = '#241726';

function envelope(age: number, frames: number): { scale: number; alpha: number } {
  if (age < 0 || age >= frames) return { scale: 0, alpha: 0 };
  const t = clamp01(age / 6);
  const scale = t < 1 ? 1.18 * Math.sin((t * Math.PI) / 2) + (t > 0.7 ? -0.18 * smoothstep(0.7, 1, t) : 0) : 1;
  const alpha = 1 - smoothstep(frames - 6, frames, age);
  return { scale: Math.max(0, scale), alpha };
}

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
      break;
    case 'spark': {
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

const textures = new Map<string, THREE.CanvasTexture>();
function textureFor(kind: Exclude<FxKind, 'speedLines'>): THREE.CanvasTexture {
  let t = textures.get(kind);
  if (!t) {
    t = paintCard(kind);
    textures.set(kind, t);
  }
  return t;
}

export function disposeFxTextures(): void {
  for (const t of textures.values()) t.dispose();
  textures.clear();
}

interface FxSlot {
  cue: FxCue;
  sprite: THREE.Sprite;
  start: number;
  seed: number;
}

export interface FxTarget {
  position: THREE.Vector3;
  scale: number;
  visible: boolean;
}

const right = new THREE.Vector3();
const up = new THREE.Vector3();

export class FxLayer {
  private readonly slots: FxSlot[] = [];

  constructor(shotId: string, cues: readonly FxCue[], group: THREE.Group) {
    const shot = SHOTS.find((s) => s.id === shotId);
    if (!shot) return;
    const len = Math.max(1, shot.to - shot.from - 1);
    cues.forEach((cue, i) => {
      if (cue.shot !== shotId || cue.kind === 'speedLines') return;
      const mat = new THREE.SpriteMaterial({
        map: textureFor(cue.kind),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.userData.noInk = true;
      sprite.visible = false;
      sprite.renderOrder = 4;
      group.add(sprite);
      this.slots.push({ cue, sprite, start: shot.from + Math.round(cue.at * len), seed: i * 17 + 3 });
    });
  }

  update(frame: number, camera: THREE.Camera, cast: readonly FxTarget[]): void {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const s of this.slots) {
      const { cue, sprite, start } = s;
      const age = frame - start;
      const { scale, alpha } = envelope(age, cue.frames);
      if (alpha <= 0.01) {
        sprite.visible = false;
        continue;
      }
      const base = cue.scale ?? 0.3;
      const u = clamp01(age / Math.max(1, cue.frames));
      if (cue.offset) {
        sprite.position.set(cue.offset[0], cue.offset[1] + Math.sin(frame * 0.2) * 0.02, cue.offset[2]);
      } else if (cue.actor !== undefined) {
        const target = cast[cue.actor];
        if (!target || !target.visible) {
          sprite.visible = false;
          continue;
        }
        const side = cue.side ?? 1;
        const sc = target.scale;
        const ox = side * (HEAD_HALF_W_M * sc + base * 0.42);
        const oy = HEAD_CENTER_M * sc + HEAD_HALF_H_M * sc * (cue.kind === 'sweat' ? 0.15 : 0.72) + (cue.kind === 'sweat' ? -u * u * 0.16 * sc : Math.sin(frame * 0.18) * 0.02);
        sprite.position.copy(target.position).addScaledVector(right, ox).addScaledVector(up, oy).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -0.05);
      }
      sprite.visible = true;
      sprite.material.opacity = alpha * (0.9 + 0.1 * Math.sin(frame * 0.5));
      const sz = base * scale;
      sprite.scale.set(sz, sz, 1);
    }
  }

  dispose(): void {
    for (const s of this.slots) s.sprite.material.dispose();
  }
}

export function speedLinesAt(frame: number): number {
  let e = 0;
  for (const c of FX_CUES) {
    if (c.kind !== 'speedLines') continue;
    const shot = SHOTS.find((s) => s.id === c.shot);
    if (!shot) continue;
    const start = shot.from + Math.round(c.at * Math.max(1, shot.to - shot.from - 1));
    const age = frame - start;
    if (age >= 0 && age < c.frames) {
      e = Math.max(e, Math.min(smoothstep(0, 3, age), 1 - smoothstep(c.frames - 6, c.frames, age)));
    }
  }
  return e;
}

export interface SpeedLine {
  angle: number;
  inner: number;
  outer: number;
  width: number;
}

export function speedLineSet(frame: number, count = 48): SpeedLine[] {
  const step = Math.floor(frame / 2);
  const out: SpeedLine[] = [];
  for (let i = 0; i < count; i++) {
    const h0 = hash01(step * 19 + i, i * 7 + 1);
    const h1 = hash01(step * 31 + i, i * 11 + 3);
    out.push({ angle: (i / count) * Math.PI * 2 + (h0 - 0.5) * 0.08, inner: 32 + h1 * 14, outer: 72 + h0 * 16, width: 1.5 + h1 * 3.0 });
  }
  return out;
}
