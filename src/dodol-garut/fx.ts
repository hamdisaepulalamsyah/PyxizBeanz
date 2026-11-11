import * as THREE from 'three';
import { clamp01, smoothstep } from '../persis/story';
import { INK, Pen } from './toon';

/**
 * Hand-Inked Comic 2D FX Engine v3 for "Fakta Unik Dodol Garut".
 *
 * Replaces raw font glyphs ('!', '?') with hand-drawn Pen vector comic art:
 *  - `steam`: curling warm translucent steam wisps rising from the copper kancah / hawu,
 *  - `bubblePop`: golden caramel/santan splash crown & droplets,
 *  - `sweat`: curved anime sweat drop + two motion beads (plum ink),
 *  - `strainTicks`: jittering comic exertion/heat lines (replaces emoji '!'/'?'),
 *  - `spark`: 10-ray hand-inked impact star burst (`fxBurst`),
 *  - `aroma`: golden-amber swirling scent ribbons rising from fresh dodol,
 *  - `sugarLock`: crisp schematic 2D inset (water droplets evaporating + sugar crystal lattice locking microbes),
 *  - `speedLines`: screen-space radial comic focus lines on punch beats only.
 */

export type FxKind =
  | 'steam'
  | 'bubblePop'
  | 'sweat'
  | 'strainTicks'
  | 'spark'
  | 'aroma'
  | 'sugarLock'
  | 'speedLines';

export interface FxCue {
  shot: string;
  at: number;
  frames: number;
  kind: FxKind;
  /** World-space anchor [x, y, z] or cast actor index + offset. */
  actor?: number;
  side?: -1 | 1;
  offset?: readonly [number, number, number];
  scale?: number;
}

function envelope(age: number, frames: number): { scale: number; alpha: number; t: number } {
  if (age < 0 || age >= frames) return { scale: 0, alpha: 0, t: 0 };
  const t = clamp01(age / Math.max(1, frames - 1));
  const enter = clamp01(age / 6);
  const scale = enter < 1 ? 1.14 * Math.sin((enter * Math.PI) / 2) + (enter > 0.7 ? -0.14 * smoothstep(0.7, 1, enter) : 0) : 1;
  const alpha = 1 - smoothstep(frames - 7, frames, age);
  return { scale: Math.max(0, scale), alpha, t };
}

const rad = (d: number): number => (d * Math.PI) / 180;

function drawFxFrame(kind: Exclude<FxKind, 'speedLines'>, cv: HTMLCanvasElement, phase: number): void {
  const g = cv.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  const p = new Pen(g);

  switch (kind) {
    case 'spark': {
      // Bright golden-amber 8-ray comic shine burst with wide golden rays & crisp thin plum rim
      const c = 128;
      const e = 1 - (1 - Math.min(1, phase * 1.4)) ** 3;
      const r0 = 32;
      const r1 = 106;
      for (let i = 0; i < 8; i++) {
        const a = rad((i * 360) / 8 + 12 * (i % 2));
        const ra = r0 + (r1 - r0) * e * (i % 2 === 0 ? 1.0 : 0.68);
        p.poly(
          [
            [c + r0 * 0.88 * Math.cos(a + 0.36), c + r0 * 0.88 * Math.sin(a + 0.36)],
            [c + ra * Math.cos(a), c + ra * Math.sin(a)],
            [c + r0 * 0.88 * Math.cos(a - 0.36), c + r0 * 0.88 * Math.sin(a - 0.36)],
          ],
          '#ffe680',
          2.0,
        );
      }
      if (phase < 0.78) p.ell(c, c, r0 * 0.92, r0 * 0.92, '#fffbe6', 2.0);
      break;
    }

    case 'sweat': {
      // Classic hand-drawn curved sweat drop + two small flick beads
      g.save();
      g.translate(128, 134);
      g.rotate(0.18);
      g.beginPath();
      g.moveTo(0, -74);
      g.bezierCurveTo(18, -28, 46, 2, 46, 36);
      g.arc(0, 36, 46, 0, Math.PI, false);
      g.bezierCurveTo(-46, 2, -18, -28, 0, -74);
      g.closePath();
      g.fillStyle = '#a8dcff';
      g.fill();
      g.lineWidth = 9;
      g.strokeStyle = INK;
      g.lineJoin = 'round';
      g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(-15, 28, 8, 18, -0.35, 0, Math.PI * 2);
      g.fill();
      // Motion flick beads
      p.ell(58, -32, 10, 14, '#a8dcff', 6, 0, 360, -25);
      p.ell(-54, -44, 8, 11, '#a8dcff', 5, 0, 360, 20);
      g.restore();
      break;
    }

    case 'strainTicks': {
      // Three hand-inked comic exertion / heat-stress ticks (replaces emoji '!' / '?')
      const j = 5 * Math.sin(phase * 36);
      for (const [ang, col] of [
        [-34, '#ff7a45'],
        [0, '#ffd452'],
        [34, '#ff7a45'],
      ] as const) {
        const b = rad(ang - 90);
        const pts: [number, number][] = [
          [128 + 38 * Math.cos(b) + j, 196 + 38 * Math.sin(b)],
          [128 + 72 * Math.cos(b) + 7 + j, 196 + 72 * Math.sin(b)],
          [128 + 106 * Math.cos(b) + j, 196 + 106 * Math.sin(b)],
        ];
        p.stroke(pts, 15, INK);
        p.stroke(pts, 7.5, col);
      }
      break;
    }

    case 'steam': {
      // Three curling translucent steam ribbons rising upward
      g.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) {
        const x0 = 72 + i * 56;
        const rise = ((phase + i * 0.33) % 1) * 44;
        const pts: [number, number][] = [];
        for (let s = 0; s <= 12; s++) {
          const u = s / 12;
          const x = x0 + Math.sin(u * Math.PI * 2.4 + phase * 8 + i * 1.7) * (10 + u * 8);
          const y = 224 - u * 164 - rise * 0.4;
          pts.push([x, y]);
        }
        p.stroke(pts, 14 - i * 1.5, 'rgba(255, 248, 236, 0.88)');
        p.stroke(pts, 5.5, 'rgba(36, 23, 38, 0.25)');
      }
      g.globalAlpha = 1;
      break;
    }

    case 'bubblePop': {
      // Caramel/santan bubble burst crown & warm golden droplets
      const rise = Math.sin(Math.min(1, phase * 1.25) * Math.PI);
      if (rise > 0.02) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 12; i++) {
          const h = (i % 2 ? 78 : 36) * rise * (0.8 + 0.2 * Math.sin(i * 1.9));
          pts.push([38 + (180 * i) / 12, 210 - h]);
        }
        p.poly([...pts, [218, 224], [38, 224]], '#d98a3c', 7);
      }
      for (let i = 0; i < 6; i++) {
        const a = rad(205 + i * 26);
        const d = 32 + 115 * phase;
        const y = 195 + d * Math.sin(a) + 145 * phase * phase;
        if (y < 236) p.ell(128 + d * Math.cos(a), y, 9 * (1 - phase * 0.5), 11 * (1 - phase * 0.5), '#f5b85c', 5);
      }
      break;
    }

    case 'aroma': {
      // Warm golden-amber swirling scent wisps
      for (let i = 0; i < 3; i++) {
        const x0 = 76 + i * 52;
        const pts: [number, number][] = [];
        for (let s = 0; s <= 14; s++) {
          const u = s / 14;
          pts.push([x0 + Math.sin(u * Math.PI * 3 + phase * 6 + i) * 14, 218 - u * 165]);
        }
        p.stroke(pts, 12, INK);
        p.stroke(pts, 6, i === 1 ? '#ffd06b' : '#f7a84b');
      }
      break;
    }

    case 'sugarLock': {
      // Clean 2D comic science diagram: water drops escaping UP + sugar hexagons trapping tiny microbe!
      // Water vapor arrows rising at top
      for (const x of [68, 128, 188]) {
        const yOff = (phase * 36) % 28;
        p.ell(x, 62 - yOff, 11, 14, '#7fd4ff', 5);
        p.stroke(
          [
            [x, 38 - yOff],
            [x - 7, 46 - yOff],
            [x, 38 - yOff],
            [x + 7, 46 - yOff],
          ],
          4.5,
          '#3898d8',
        );
      }
      // Sugar crystal ring locking a tiny grumpy green microbe inside
      p.ell(128, 158, 36, 32, '#7bc96f', 7);
      p.stroke(
        [
          [112, 149],
          [124, 154],
        ],
        5,
        INK,
      );
      p.stroke(
        [
          [144, 149],
          [132, 154],
        ],
        5,
        INK,
      );
      p.arc(128, 174, 12, 6, 200, 340, 4.5, INK);
      // Golden sugar crystal bars surrounding it
      for (let i = 0; i < 6; i++) {
        const a = rad(i * 60 + phase * 25);
        const cx = 128 + Math.cos(a) * 62;
        const cy = 158 + Math.sin(a) * 56;
        p.poly(
          [
            [cx - 14, cy - 10],
            [cx + 14, cy - 10],
            [cx + 18, cy + 10],
            [cx - 18, cy + 10],
          ],
          '#ffe082',
          5,
        );
      }
      break;
    }
  }
}

export interface FxTarget {
  position: THREE.Vector3;
  scale: number;
  visible: boolean;
}

interface FxSlot {
  cue: FxCue;
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  start: number;
  lastQuant: number;
}

const right = new THREE.Vector3();
const up = new THREE.Vector3();

export class FxLayer {
  private readonly slots: FxSlot[] = [];

  constructor(shotId: string, shotFrom: number, shotTo: number, cues: readonly FxCue[], group: THREE.Group) {
    const len = Math.max(1, shotTo - shotFrom - 1);
    for (const cue of cues) {
      if (cue.shot !== shotId || cue.kind === 'speedLines') continue;
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 256;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.userData.noInk = true;
      sprite.visible = false;
      sprite.renderOrder = 6;
      group.add(sprite);
      this.slots.push({
        cue,
        sprite,
        canvas: cv,
        tex,
        start: shotFrom + Math.round(cue.at * len),
        lastQuant: -1,
      });
    }
  }

  update(frame: number, camera: THREE.Camera, cast: readonly FxTarget[]): void {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const s of this.slots) {
      const { cue, sprite, start } = s;
      const age = frame - start;
      const { scale, alpha, t } = envelope(age, cue.frames);
      if (alpha <= 0.01) {
        sprite.visible = false;
        continue;
      }
      const quant = Math.round(t * 24);
      if (quant !== s.lastQuant) {
        s.lastQuant = quant;
        drawFxFrame(cue.kind as Exclude<FxKind, 'speedLines'>, s.canvas, quant / 24);
        s.tex.needsUpdate = true;
      }

      if (cue.actor !== undefined) {
        const tgt = cast[cue.actor];
        if (!tgt || !tgt.visible) {
          sprite.visible = false;
          continue;
        }
        const side = cue.side ?? 1;
        const headH = 1.62 * tgt.scale;
        sprite.position
          .copy(tgt.position)
          .addScaledVector(up, headH + 0.14 * tgt.scale)
          .addScaledVector(right, side * 0.28 * tgt.scale);
        if (cue.offset) {
          sprite.position.x += cue.offset[0];
          sprite.position.y += cue.offset[1];
          sprite.position.z += cue.offset[2];
        }
      } else if (cue.offset) {
        sprite.position.set(cue.offset[0], cue.offset[1], cue.offset[2]);
      }

      const base = cue.scale ?? 0.36;
      sprite.scale.setScalar(base * scale);
      (sprite.material as THREE.SpriteMaterial).opacity = alpha;
      sprite.visible = true;
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      s.tex.dispose();
      (s.sprite.material as THREE.Material).dispose();
    }
  }
}

export function speedLinesAt(frame: number, shotId: string, shotFrom: number, shotTo: number, cues: readonly FxCue[]): number {
  const len = Math.max(1, shotTo - shotFrom - 1);
  let alpha = 0;
  for (const cue of cues) {
    if (cue.shot !== shotId || cue.kind !== 'speedLines') continue;
    const start = shotFrom + Math.round(cue.at * len);
    const { alpha: a } = envelope(frame - start, cue.frames);
    if (a > alpha) alpha = a;
  }
  return alpha;
}
