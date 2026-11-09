import * as THREE from 'three';
import { mulberry32, PALETTE } from './worlds';

/**
 * Procedural stylized crowd and extras generator for "Sejarah Persis".
 * Provides lightweight 3D bean-head background characters with natural
 * breathing, idle swaying, listening nods, and walking locomotion.
 */

export type CrowdRole =
  | 'pedestrian_caping'
  | 'pedestrian_peci'
  | 'santri_listening'
  | 'debate_listener'
  | 'press_worker'
  | 'parliament_delegate';

const CW = 256;
const CH = 384;
const PLANE_W = 0.72;
const PLANE_H = 1.08;
const PLUM = '#241726';

function paintCrowdTexture(ctx: CanvasRenderingContext2D, role: CrowdRole, seed: number): void {
  const rand = mulberry32(seed);
  ctx.clearRect(0, 0, CW, CH);

  const cx = CW / 2;
  const headY = 135;
  const headR = 56;
  const skin = rand() < 0.5 ? '#d9a77c' : '#c9956d';
  const skinShade = '#a87352';

  // ── Body & Clothing ───────────────────────────────────────────────────────
  const bodyTop = headY + 45;
  const bodyBottom = CH - 25;

  ctx.lineWidth = 6;
  ctx.strokeStyle = PLUM;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (role === 'santri_listening') {
    // Cross-legged seated pose
    ctx.fillStyle = rand() < 0.5 ? '#3d5a46' : '#8a4b26'; // sarung
    ctx.beginPath();
    ctx.ellipse(cx, bodyBottom - 35, 95, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Torso koko
    ctx.fillStyle = rand() < 0.5 ? '#f4f0e6' : '#d8d0c0';
    ctx.beginPath();
    ctx.moveTo(cx - 52, bodyTop);
    ctx.lineTo(cx + 52, bodyTop);
    ctx.lineTo(cx + 65, bodyBottom - 45);
    ctx.lineTo(cx - 65, bodyBottom - 45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (role === 'parliament_delegate') {
    // Formal dark colonial suit
    ctx.fillStyle = '#1c1f2e';
    ctx.beginPath();
    ctx.moveTo(cx - 58, bodyTop);
    ctx.lineTo(cx + 58, bodyTop);
    ctx.lineTo(cx + 68, bodyBottom);
    ctx.lineTo(cx - 68, bodyBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // White shirt collar & tie
    ctx.fillStyle = '#f0f0f5';
    ctx.beginPath();
    ctx.moveTo(cx - 16, bodyTop);
    ctx.lineTo(cx + 16, bodyTop);
    ctx.lineTo(cx, bodyTop + 35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a2a22';
    ctx.fillRect(cx - 4, bodyTop + 20, 8, 38);
  } else {
    // Standing pedestrian / worker / listener
    const clothColor =
      role === 'press_worker'
        ? '#4a536b'
        : role === 'pedestrian_caping'
        ? '#5c4838'
        : rand() < 0.5
        ? '#e6dec8'
        : '#2d3b36';

    // Lower sarung / pants
    ctx.fillStyle = role === 'pedestrian_caping' ? '#2e261f' : '#6e3f22';
    ctx.beginPath();
    ctx.moveTo(cx - 48, bodyTop + 70);
    ctx.lineTo(cx + 48, bodyTop + 70);
    ctx.lineTo(cx + 54, bodyBottom);
    ctx.lineTo(cx - 54, bodyBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Torso jacket/koko
    ctx.fillStyle = clothColor;
    ctx.beginPath();
    ctx.moveTo(cx - 52, bodyTop);
    ctx.lineTo(cx + 52, bodyTop);
    ctx.lineTo(cx + 58, bodyTop + 90);
    ctx.lineTo(cx - 58, bodyTop + 90);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ── Head ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR, headR * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cheek blush
  ctx.fillStyle = 'rgba(210, 100, 80, 0.22)';
  ctx.beginPath();
  ctx.arc(cx - 32, headY + 15, 12, 0, Math.PI * 2);
  ctx.arc(cx + 32, headY + 15, 12, 0, Math.PI * 2);
  ctx.fill();

  // Gentle eyes (peaceful listening curves ^ ^)
  ctx.lineWidth = 4;
  ctx.strokeStyle = PLUM;
  ctx.beginPath();
  ctx.arc(cx - 24, headY + 4, 9, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 24, headY + 4, 9, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();

  // ── Headwear ──────────────────────────────────────────────────────────────
  if (role === 'pedestrian_caping') {
    // Conical straw hat (caping)
    ctx.fillStyle = '#cfb076';
    ctx.lineWidth = 6;
    ctx.strokeStyle = PLUM;
    ctx.beginPath();
    ctx.moveTo(cx, headY - 85);
    ctx.lineTo(cx + 95, headY - 10);
    ctx.lineTo(cx - 95, headY - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Woven straw pattern
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(100, 70, 30, 0.4)';
    for (let r = -70; r < 90; r += 28) {
      ctx.beginPath();
      ctx.moveTo(cx, headY - 85);
      ctx.lineTo(cx + r, headY - 10);
      ctx.stroke();
    }
  } else if (role === 'santri_listening' && rand() < 0.4) {
    // White/cream turban/peci haji
    ctx.fillStyle = '#f6f2e9';
    ctx.lineWidth = 5;
    ctx.strokeStyle = PLUM;
    ctx.beginPath();
    ctx.roundRect(cx - 48, headY - 60, 96, 42, 10);
    ctx.fill();
    ctx.stroke();
  } else {
    // Black Peci / Songkok
    ctx.fillStyle = '#171422';
    ctx.lineWidth = 5;
    ctx.strokeStyle = PLUM;
    ctx.beginPath();
    ctx.roundRect(cx - 46, headY - 62, 92, 44, 8);
    ctx.fill();
    ctx.stroke();

    // Velvet highlight sheen
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.ellipse(cx - 12, headY - 44, 24, 7, -0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface CrowdMember {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  update: (frame: number, camPos: THREE.Vector3) => void;
  dispose: () => void;
}

export function createCrowdMember(
  role: CrowdRole,
  seed: number,
  options: {
    pos: [number, number, number];
    scale?: number;
    gradientMap?: THREE.Texture | null;
    walk?: { axis: 'x' | 'z'; speed: number; range: number; dir: 1 | -1 };
  }
): CrowdMember {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Crowd Canvas2D unavailable');

  paintCrowdTexture(ctx, role, seed);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H);
  geo.translate(0, PLANE_H / 2, 0);

  const mat = new THREE.MeshToonMaterial({
    map: texture,
    gradientMap: options.gradientMap ?? null,
    alphaTest: 0.5,
    alphaToCoverage: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `crowd-${role}-${seed}`;
  mesh.position.set(...options.pos);
  const baseScale = options.scale ?? 1.0;
  mesh.scale.set(baseScale, baseScale, baseScale);
  mesh.castShadow = true;

  const baseX = options.pos[0];
  const baseY = options.pos[1];
  const baseZ = options.pos[2];
  const phase = (seed * 17.31) % 100;
  const worldPos = new THREE.Vector3();

  const update = (frame: number, camPos: THREE.Vector3): void => {
    // 1. Natural breathing & gentle weight shifting
    const breath = Math.sin(frame * 0.08 + phase) * 0.014;
    const sway = Math.sin(frame * 0.035 + phase * 2) * 0.008;

    // 2. Listening nod for seated audiences
    const nod =
      role === 'santri_listening' || role === 'debate_listener' || role === 'parliament_delegate'
        ? Math.max(0, Math.sin(frame * 0.045 + phase)) * 0.025
        : 0;

    // 3. Walking locomotion if configured
    let walkOffset = 0;
    let walkBob = 0;
    if (options.walk) {
      const { axis, speed, range, dir } = options.walk;
      const t = (frame * speed * dir) % range;
      walkOffset = t;
      walkBob = Math.abs(Math.sin(frame * 0.22 + phase)) * 0.018;
      if (axis === 'x') mesh.position.x = baseX + walkOffset;
      else mesh.position.z = baseZ + walkOffset;
    } else {
      mesh.position.x = baseX + sway;
    }

    mesh.position.y = baseY + Math.abs(breath) * 0.004 + walkBob;
    mesh.scale.set(baseScale * (1 - breath * 0.4), baseScale * (1 + breath), baseScale);
    mesh.rotation.x = nod;

    // 4. Billboard facing camera
    mesh.getWorldPosition(worldPos);
    const parentYaw = mesh.parent
      ? new THREE.Euler().setFromQuaternion(mesh.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y
      : 0;
    mesh.rotation.y = Math.atan2(camPos.x - worldPos.x, camPos.z - worldPos.z) - parentYaw;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
    texture.dispose();
  };

  return { mesh, update, dispose };
}
