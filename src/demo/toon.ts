import * as THREE from 'three';

/**
 * Procedural Canvas2D bean-head character, rendered onto a lit billboard.
 *
 * Every pose value is a pure function of the frame number, so Remotion can
 * render frames in any order (or in parallel tabs) and get identical results.
 */

export const TOON_CANVAS_WIDTH = 768;
export const TOON_CANVAS_HEIGHT = 1024;
/** World-space size of the billboard plane (metres). */
export const TOON_PLANE_WIDTH = 0.9;
export const TOON_PLANE_HEIGHT = 1.2;

export const BLINK_FRAMES: readonly number[] = [45, 135];

export const TOON_PALETTE = {
  plum: '#241726',
  skin: '#f6c49b',
  skinShade: '#d99a7a',
  blush: 'rgba(233, 112, 118, 0.34)',
  eyeWhite: '#fbf5ea',
  mouth: '#5a2036',
  tongue: '#e0677a',
  sweater: '#2f8c86',
  sweaterShade: '#22686a',
  sweaterStripe: '#f2b84b',
  collar: '#f4ead8',
} as const;

const HEAD_CENTER_X = TOON_CANVAS_WIDTH / 2;
const HEAD_CENTER_Y = 380;
const HEAD_WIDTH = 480;
/** Bounding-box height / width of the superellipse head. */
const HEAD_ASPECT = 0.94;
const HEAD_HALF_W = HEAD_WIDTH / 2;
const HEAD_HALF_H = (HEAD_WIDTH * HEAD_ASPECT) / 2;
const OUTLINE = 11;
const BREATH_PERIOD_FRAMES = 75;
const BREATH_AMPLITUDE_PX = 2;

export interface ToonPose {
  /** -1 (towards screen left) .. 1 (towards screen right). */
  turn: number;
  /** Head roll in radians, positive = clockwise. */
  tilt: number;
  lookX: number;
  /** -1 up .. 1 down. */
  lookY: number;
  /** Resting upper-lid coverage, 0 = wide open, ~0.42 = deadpan. */
  lid: number;
  /** 0 open .. 1 fully closed. */
  blink: number;
  browRaiseL: number;
  browRaiseR: number;
  /** Raises the inner ends of both brows. */
  browWorry: number;
  mouthSmile: number;
  mouthOpen: number;
  mouthWidth: number;
  mouthShift: number;
  /** Hair tuft lag (follow-through of the head turn). */
  tuftSway: number;
  /** Vertical breathing offsets in canvas pixels. */
  breathBody: number;
  breathHead: number;
}

type Keyframe = readonly [frame: number, value: number];
type Ease = (t: number) => number;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const easeOutBack: Ease = (t) => {
  const s = 1.25;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

function track(keys: readonly Keyframe[], frame: number, ease: Ease = easeInOutCubic): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return 0;
  if (frame <= first[0]) return first[1];
  if (frame >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b) continue;
    if (frame <= b[0]) {
      const t = b[0] === a[0] ? 1 : (frame - a[0]) / (b[0] - a[0]);
      return lerp(a[1], b[1], ease(clamp01(t)));
    }
  }
  return last[1];
}

/*
 * Acting beats (30 fps):
 *   0–18   deadpan at camera
 *   18–72  glance at the coffee cup (screen right, down), small content smile
 *   72–124 snap to the wall clock (screen left, up): brows up, mouth "o"
 *   124–180 back to camera, one brow cocked, flat mouth (the deadpan punchline)
 * Eyes lead the head by a few frames; brows and turn overshoot slightly.
 */
const TRACKS = {
  turn: [[0, 0], [18, 0], [36, 0.55], [72, 0.55], [92, -0.6], [124, -0.6], [148, 0.04], [180, 0]],
  tilt: [[0, 0], [20, 0], [38, 0.06], [72, 0.06], [92, -0.08], [124, -0.08], [148, 0.03], [180, 0.03]],
  lookX: [[0, 0], [15, 0], [29, 1], [72, 1], [85, -1], [124, -1], [141, 0], [180, 0]],
  lookY: [[0, 0], [15, 0], [29, 0.8], [72, 0.8], [85, -0.9], [124, -0.9], [141, 0], [180, 0]],
  lid: [[0, 0.42], [20, 0.42], [34, 0.3], [72, 0.3], [88, 0.1], [124, 0.12], [146, 0.48], [180, 0.48]],
  browRaiseL: [[0, 0], [30, 0.2], [72, 0.2], [88, 0.9], [124, 0.9], [146, 0.05], [180, 0.05]],
  browRaiseR: [[0, 0], [30, 0.25], [72, 0.25], [88, 0.95], [124, 0.95], [146, 0.75], [180, 0.75]],
  browWorry: [[0, 0], [74, 0], [90, 0.8], [124, 0.8], [146, 0], [180, 0]],
  mouthSmile: [[0, 0], [30, 0], [42, 0.55], [70, 0.55], [86, -0.3], [124, -0.35], [146, -0.06], [180, -0.06]],
  mouthOpen: [[0, 0], [84, 0], [94, 0.7], [108, 0.52], [124, 0.6], [140, 0], [180, 0]],
  mouthWidth: [[0, 1], [40, 1.1], [70, 1.1], [94, 0.55], [124, 0.62], [146, 0.88], [180, 0.84]],
  mouthShift: [[0, 0], [140, 0], [152, 9], [180, 9]],
} as const satisfies Record<string, readonly Keyframe[]>;

/** Fast close (2 frames), hold 2 frames, slower open (4 frames). */
export function blinkAmount(frame: number): number {
  let amount = 0;
  for (const b of BLINK_FRAMES) {
    let v = 0;
    if (frame >= b - 2 && frame < b) v = (frame - (b - 2)) / 2;
    else if (frame >= b && frame <= b + 1) v = 1;
    else if (frame > b + 1 && frame <= b + 5) v = 1 - (frame - (b + 1)) / 4;
    amount = Math.max(amount, easeInOutCubic(clamp01(v)));
  }
  return amount;
}

export function toonPoseAt(frame: number): ToonPose {
  const turn = track(TRACKS.turn, frame, easeOutBack);
  const turnLagged = track(TRACKS.turn, frame - 5, easeOutBack);
  const phase = (frame / BREATH_PERIOD_FRAMES) * Math.PI * 2;
  return {
    turn,
    tilt: track(TRACKS.tilt, frame),
    lookX: track(TRACKS.lookX, frame),
    lookY: track(TRACKS.lookY, frame),
    lid: track(TRACKS.lid, frame),
    blink: blinkAmount(frame),
    browRaiseL: track(TRACKS.browRaiseL, frame, easeOutBack),
    browRaiseR: track(TRACKS.browRaiseR, frame, easeOutBack),
    browWorry: track(TRACKS.browWorry, frame),
    mouthSmile: track(TRACKS.mouthSmile, frame),
    mouthOpen: track(TRACKS.mouthOpen, frame),
    mouthWidth: track(TRACKS.mouthWidth, frame),
    mouthShift: track(TRACKS.mouthShift, frame),
    tuftSway: (turnLagged - turn) * 2.2,
    breathBody: Math.sin(phase) * BREATH_AMPLITUDE_PX,
    // Head follows the chest slightly late (overlapping action).
    breathHead: Math.sin(phase - 0.45) * BREATH_AMPLITUDE_PX,
  };
}

/** Superellipse bean outline centred at the origin, with a softly pointed crown. */
function traceBeanHead(ctx: CanvasRenderingContext2D, halfW: number, halfH: number): void {
  const segments = 120;
  const nTop = 2.3;
  const nBottom = 2.9;
  const crown = 0.22;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const isTop = s < 0;
    const n = isTop ? nTop : nBottom;
    const x = halfW * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    let y = halfH * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (isTop) {
      // Peak stays at -halfH; the temples drop, giving the pointed crown.
      const k = 1 - Math.abs(x) / halfW;
      y *= (1 + crown * k * k * k) / (1 + crown);
    }
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function traceTorso(ctx: CanvasRenderingContext2D, cx: number, top: number, breathScale: number): void {
  const sw = 168 * breathScale;
  const bw = 240;
  const h = TOON_CANVAS_HEIGHT;
  ctx.beginPath();
  ctx.moveTo(cx - bw, h + 20);
  ctx.lineTo(cx - sw - 12, top + 95);
  ctx.quadraticCurveTo(cx - sw, top, cx - sw + 72, top - 6);
  ctx.lineTo(cx + sw - 72, top - 6);
  ctx.quadraticCurveTo(cx + sw, top, cx + sw + 12, top + 95);
  ctx.lineTo(cx + bw, h + 20);
  ctx.closePath();
}

function drawBody(ctx: CanvasRenderingContext2D, pose: ToonPose): void {
  const p = TOON_PALETTE;
  const cx = HEAD_CENTER_X + pose.turn * 4;
  const top = HEAD_CENTER_Y + 190 + pose.breathBody;
  const breathScale = 1 + (pose.breathBody / BREATH_AMPLITUDE_PX) * 0.006;

  // Neck
  ctx.fillStyle = p.skinShade;
  ctx.fillRect(cx - 38, HEAD_CENTER_Y + 150, 76, 80);

  ctx.save();
  traceTorso(ctx, cx, top, breathScale);
  ctx.fillStyle = p.sweater;
  ctx.fill();
  ctx.clip();
  // Form shadow on the side away from the desk lamp (screen right).
  ctx.fillStyle = p.sweaterShade;
  ctx.beginPath();
  ctx.ellipse(cx + 250, top + 260, 150, 320, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.sweaterStripe;
  ctx.fillRect(cx - 300, top + 150, 600, 34);
  // Shirt collar peeking out
  ctx.fillStyle = p.collar;
  ctx.beginPath();
  ctx.moveTo(cx - 70, top - 8);
  ctx.lineTo(cx, top + 62);
  ctx.lineTo(cx + 70, top - 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = p.plum;
  ctx.lineWidth = OUTLINE;
  ctx.lineJoin = 'round';
  traceTorso(ctx, cx, top, breathScale);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - 70, top - 8);
  ctx.lineTo(cx, top + 62);
  ctx.lineTo(cx + 70, top - 8);
  ctx.stroke();
}

function drawEye(ctx: CanvasRenderingContext2D, ex: number, ey: number, scaleX: number, pose: ToonPose): void {
  const p = TOON_PALETTE;
  const rx = 44 * scaleX;
  const ry = 52;
  const closeY = ey + ry * 0.45;
  const coverage = clamp01(pose.lid + (1 - pose.lid) * pose.blink);
  const lidY = lerp(ey - ry, closeY, coverage);
  const lowerY = lerp(ey + ry, closeY, pose.blink);

  const traceEye = (): void => {
    ctx.beginPath();
    ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
  };

  ctx.save();
  traceEye();
  ctx.fillStyle = p.eyeWhite;
  ctx.fill();
  ctx.clip();
  const px = ex + pose.lookX * 17 * scaleX;
  const py = ey + 6 + pose.lookY * 15;
  ctx.fillStyle = p.plum;
  ctx.beginPath();
  ctx.ellipse(px, py, 19 * scaleX, 21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - 6 * scaleX, py - 8, 5.5, 0, Math.PI * 2);
  ctx.fill();
  // Upper and lower lids (skin), meeting at closeY on a full blink.
  ctx.fillStyle = p.skin;
  ctx.fillRect(ex - rx - 4, ey - ry - 4, rx * 2 + 8, lidY - (ey - ry - 4));
  ctx.fillRect(ex - rx - 4, lowerY, rx * 2 + 8, ey + ry + 4 - lowerY);
  ctx.restore();

  // Eye outline only where the eye is still open.
  if (lowerY - lidY > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex - rx - 10, lidY, rx * 2 + 20, lowerY - lidY);
    ctx.clip();
    ctx.strokeStyle = p.plum;
    ctx.lineWidth = 6;
    traceEye();
    ctx.stroke();
    ctx.restore();
  }

  // Lid crease: flat (deadpan) when open, curved lash line when closed.
  const dy = (lidY - ey) / ry;
  const hw = rx * Math.sqrt(Math.max(0, 1 - dy * dy)) + 5;
  ctx.strokeStyle = p.plum;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(ex - hw, lidY);
  ctx.quadraticCurveTo(ex, lidY + 3 + pose.blink * 12, ex + hw, lidY);
  ctx.stroke();
}

function drawBrow(ctx: CanvasRenderingContext2D, ex: number, ey: number, side: -1 | 1, raise: number, worry: number, scaleX: number): void {
  const baseY = ey - 52 - 30 - raise * 24;
  const half = 36 * scaleX;
  const innerX = ex - side * half;
  const outerX = ex + side * half;
  const innerY = baseY - worry * 14 + (1 - worry) * 3;
  const outerY = baseY + worry * 7 - 2;
  ctx.strokeStyle = TOON_PALETTE.plum;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(outerX, outerY);
  ctx.quadraticCurveTo(ex, Math.min(innerY, outerY) - 8, innerX, innerY);
  ctx.stroke();
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, pose: ToonPose): void {
  const p = TOON_PALETTE;
  const hw = 42 * pose.mouthWidth;
  const curve = pose.mouthSmile * 22;
  ctx.strokeStyle = p.plum;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;

  if (pose.mouthOpen < 0.06) {
    ctx.beginPath();
    ctx.moveTo(x - hw, y - curve * 0.3);
    ctx.quadraticCurveTo(x, y + curve, x + hw, y - curve * 0.3);
    ctx.stroke();
    return;
  }

  const h = pose.mouthOpen * 50;
  const traceMouth = (): void => {
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.quadraticCurveTo(x, y + curve * 0.6 - h * 0.3, x + hw, y);
    ctx.quadraticCurveTo(x, y + h + curve, x - hw, y);
    ctx.closePath();
  };
  ctx.save();
  traceMouth();
  ctx.fillStyle = p.mouth;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = p.tongue;
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.75 + curve * 0.5, hw * 0.6, h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  traceMouth();
  ctx.stroke();
}

function drawHead(ctx: CanvasRenderingContext2D, pose: ToonPose): void {
  const p = TOON_PALETTE;
  const cx = HEAD_CENTER_X + pose.turn * 12;
  const cy = HEAD_CENTER_Y + pose.breathHead;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(pose.tilt);

  // Hair tuft (drawn first so the crown outline covers its root).
  ctx.strokeStyle = p.plum;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  const sway = pose.tuftSway * 30;
  ctx.beginPath();
  ctx.moveTo(-6, -HEAD_HALF_H + 10);
  ctx.bezierCurveTo(-4 + sway, -HEAD_HALF_H - 30, 22 + sway, -HEAD_HALF_H - 46, 30 + sway * 1.4, -HEAD_HALF_H - 26);
  ctx.stroke();

  traceBeanHead(ctx, HEAD_HALF_W, HEAD_HALF_H);
  ctx.fillStyle = p.skin;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Flat Kurzgesagt-style core shadow; follows the turn so the head reads as round.
  ctx.fillStyle = 'rgba(176, 98, 92, 0.22)';
  ctx.beginPath();
  ctx.ellipse(HEAD_HALF_W * 1.05 - pose.turn * 40, 30, HEAD_HALF_W * 0.55, HEAD_HALF_H * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();

  const fx = pose.turn * 72;
  const fy = pose.lookY * 9;
  const spacing = 70 * (1 - 0.12 * Math.abs(pose.turn));
  // The eye on the side the head turns towards foreshortens.
  const scaleL = 1 - 0.18 * Math.max(-pose.turn, 0);
  const scaleR = 1 - 0.18 * Math.max(pose.turn, 0);
  const eyeY = fy - 12;
  const leftX = fx - spacing;
  const rightX = fx + spacing;

  ctx.fillStyle = p.blush;
  ctx.beginPath();
  ctx.ellipse(leftX - 10, eyeY + 78, 32 * scaleL, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(rightX + 10, eyeY + 78, 32 * scaleR, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  drawEye(ctx, leftX, eyeY, scaleL, pose);
  drawEye(ctx, rightX, eyeY, scaleR, pose);
  drawBrow(ctx, leftX, eyeY, -1, pose.browRaiseL, pose.browWorry, scaleL);
  drawBrow(ctx, rightX, eyeY, 1, pose.browRaiseR, pose.browWorry, scaleR);
  drawMouth(ctx, fx * 1.1 + pose.mouthShift, eyeY + 112, pose);
  ctx.restore();

  traceBeanHead(ctx, HEAD_HALF_W, HEAD_HALF_H);
  ctx.strokeStyle = p.plum;
  ctx.lineWidth = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Draws the full character for one pose onto a TOON_CANVAS_WIDTH × TOON_CANVAS_HEIGHT canvas. */
export function drawToon(ctx: CanvasRenderingContext2D, pose: ToonPose): void {
  ctx.clearRect(0, 0, TOON_CANVAS_WIDTH, TOON_CANVAS_HEIGHT);
  drawBody(ctx, pose);
  drawHead(ctx, pose);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D context unavailable');
  return ctx;
}

/**
 * Tangent-space normal map (head ≈ ellipsoid, torso ≈ cylinder) so the flat
 * billboard picks up directional shading from the room's 3D lights.
 */
function createNormalMap(): THREE.CanvasTexture {
  const scale = 2;
  const w = TOON_CANVAS_WIDTH / scale;
  const h = TOON_CANVAS_HEIGHT / scale;
  const canvas = createCanvas(w, h);
  const ctx = get2d(canvas);
  const img = ctx.createImageData(w, h);
  const torsoTop = HEAD_CENTER_Y + 190;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px * scale + scale / 2;
      const y = py * scale + scale / 2;
      let nx = 0;
      let ny = 0;
      const hx = (x - HEAD_CENTER_X) / HEAD_HALF_W;
      const hy = (y - HEAD_CENTER_Y) / HEAD_HALF_H;
      const headR2 = hx * hx + hy * hy;
      if (headR2 < 1.08) {
        const r = Math.min(Math.sqrt(headR2), 0.97) / Math.max(Math.sqrt(headR2), 1e-5);
        nx = hx * r * 0.9;
        ny = -hy * r * 0.9;
      } else if (y > torsoTop) {
        const t = clamp01((y - torsoTop) / (TOON_CANVAS_HEIGHT - torsoTop));
        const halfW = lerp(180, 240, t);
        nx = Math.max(-0.95, Math.min(0.95, ((x - HEAD_CENTER_X) / halfW) * 0.8));
        ny = (1 - clamp01((y - torsoTop) / 120)) * 0.5;
      }
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      const len = Math.hypot(nx, ny, nz);
      const i = (py * w + px) * 4;
      img.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export interface ToonCharacter {
  /** Billboard mesh; its origin sits at the bottom-centre of the plane. */
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  canvas: HTMLCanvasElement;
  /** Redraws the face for `frame` and yaws the billboard towards the camera. */
  update: (frame: number, cameraWorldPosition: THREE.Vector3) => void;
  dispose: () => void;
}

export interface ToonCharacterOptions {
  gradientMap?: THREE.Texture | null;
}

export function createToonCharacter(options: ToonCharacterOptions = {}): ToonCharacter {
  const canvas = createCanvas(TOON_CANVAS_WIDTH, TOON_CANVAS_HEIGHT);
  const ctx = get2d(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const normalMap = createNormalMap();

  const geometry = new THREE.PlaneGeometry(TOON_PLANE_WIDTH, TOON_PLANE_HEIGHT);
  geometry.translate(0, TOON_PLANE_HEIGHT / 2, 0);

  // Lit toon material (not emissive) so lamp/moon light and shadows land on the character.
  const material = new THREE.MeshToonMaterial({
    map: texture,
    normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    gradientMap: options.gradientMap ?? null,
    transparent: true,
    alphaTest: 0.08,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'bean-head';
  mesh.castShadow = true;
  // Alpha-tested depth so the shadow is the character silhouette, not a rectangle.
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: texture,
    alphaTest: 0.5,
  });

  const meshWorld = new THREE.Vector3();
  let lastFrame = Number.NaN;

  const update = (frame: number, cameraWorldPosition: THREE.Vector3): void => {
    if (frame !== lastFrame) {
      drawToon(ctx, toonPoseAt(frame));
      texture.needsUpdate = true;
      lastFrame = frame;
    }
    mesh.getWorldPosition(meshWorld);
    mesh.rotation.y = Math.atan2(cameraWorldPosition.x - meshWorld.x, cameraWorldPosition.z - meshWorld.z);
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    mesh.customDepthMaterial?.dispose();
    texture.dispose();
    normalMap.dispose();
  };

  drawToon(ctx, toonPoseAt(0));
  texture.needsUpdate = true;
  lastFrame = 0;

  return { mesh, canvas, update, dispose };
}
