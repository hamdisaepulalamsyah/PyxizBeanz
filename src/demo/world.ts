import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

/**
 * Night-time study desk: wooden desk, warm desk lamp, starry window with a
 * blurred (depth-of-field) backdrop, wall clock and coffee cup.
 * Dual-tone lighting: golden lamp/key light against a cool blue-violet fill.
 */

export const WORLD_COLORS = {
  background: '#120d26',
  fog: '#151030',
  ink: '#170c19',
  wall: '#4a3f7c',
  wallReveal: '#33295e',
  floor: '#2a2147',
  wood: '#c27b3f',
  woodDark: '#7d4628',
  frame: '#5b3a2d',
  lampShade: '#f0b23a',
  lampMetal: '#2d2543',
  bulb: '#fff2bd',
  cup: '#e35a40',
  coffee: '#3b1d12',
  paper: '#f3e7cc',
  pencil: '#f2c544',
  clockFace: '#f6ecd6',
  clockRim: '#241726',
  secondHand: '#e35a40',
  warmLamp: '#ffb54d',
  warmKey: '#ffcf70',
  coolSky: '#5b64c8',
  coolGround: '#1b1234',
  moon: '#8193ff',
} as const;

export const DESK_TOP_Y = 0.93;
export const WALL_Z = -1.2;
export const CHARACTER_POSITION = new THREE.Vector3(0, 0.66, -0.05);
export const CUP_POSITION = new THREE.Vector3(0.36, DESK_TOP_Y, 0.5);
export const CLOCK_POSITION = new THREE.Vector3(-0.55, 2.32, WALL_Z + 0.03);

const WINDOW = { x: 0.28, y: 2.02, w: 0.92, h: 1.08 } as const;
const INK_WIDTH_PX = 2.2;

export interface World {
  root: THREE.Group;
  gradientMap: THREE.DataTexture;
  /** Parent for the character billboard. */
  characterAnchor: THREE.Group;
  lookTargets: { cup: THREE.Vector3; clock: THREE.Vector3 };
  update: (frame: number, fps: number) => void;
  dispose: () => void;
}

/** Seeded PRNG so the procedural sky is identical in every render tab. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D context unavailable');
  return [canvas, ctx];
}

/** Three-band ramp: lit / mid / cool core shadow. */
export function createToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([70, 150, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function radialGlowTexture(inner: string, size = 128): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Night city/sky painted on Canvas2D, then blurred to fake a shallow depth of
 * field behind the window. Uses ctx.filter where available and a progressive
 * down/up-sample blur otherwise.
 */
function paintNightBackdrop(): THREE.CanvasTexture {
  const W = 512;
  const H = 416;
  const rand = mulberry32(1987);
  const [sharp, s] = createCanvas(W, H);

  const sky = s.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#060924');
  sky.addColorStop(0.5, '#141d57');
  sky.addColorStop(0.78, '#363a86');
  sky.addColorStop(1, '#1a1747');
  s.fillStyle = sky;
  s.fillRect(0, 0, W, H);

  for (let i = 0; i < 150; i++) {
    const x = rand() * W;
    const y = H * 0.2 + rand() * H * 0.45;
    const r = 0.6 + rand() * rand() * 2.4;
    s.fillStyle = `rgba(255, ${235 + Math.floor(rand() * 20)}, 220, ${0.45 + rand() * 0.55})`;
    s.beginPath();
    s.arc(x, y, r, 0, Math.PI * 2);
    s.fill();
  }

  const moonX = 222;
  const moonY = 148;
  const halo = s.createRadialGradient(moonX, moonY, 10, moonX, moonY, 110);
  halo.addColorStop(0, 'rgba(255, 243, 200, 0.55)');
  halo.addColorStop(1, 'rgba(255, 243, 200, 0)');
  s.fillStyle = halo;
  s.fillRect(0, 0, W, H);
  // Crescent as an even-odd path so the "bite" shows the real sky behind it.
  s.fillStyle = '#fff4cf';
  s.beginPath();
  s.arc(moonX, moonY, 30, 0, Math.PI * 2);
  s.arc(moonX + 14, moonY - 8, 26, 0, Math.PI * 2);
  s.fill('evenodd');

  // Distant hills, then two layers of skyline with a few lit windows.
  s.fillStyle = '#10123a';
  s.beginPath();
  s.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) s.lineTo(x, H * 0.6 - Math.sin(x * 0.012) * 18 - Math.sin(x * 0.031) * 8);
  s.lineTo(W, H);
  s.fill();

  const skyline = (baseY: number, color: string, minH: number, maxH: number, lit: number): void => {
    let x = -10;
    while (x < W) {
      const bw = 22 + rand() * 46;
      const bh = minH + rand() * (maxH - minH);
      s.fillStyle = color;
      s.fillRect(x, baseY - bh, bw, H - baseY + bh);
      for (let wy = baseY - bh + 8; wy < H - 6; wy += 13) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 10) {
          if (rand() < lit) {
            s.fillStyle = rand() < 0.8 ? 'rgba(255, 196, 92, 0.95)' : 'rgba(150, 200, 255, 0.85)';
            s.fillRect(wx, wy, 4, 6);
          }
        }
      }
      x += bw + 2;
    }
  };
  skyline(H * 0.66, '#0d0f30', 20, 60, 0.08);
  skyline(H * 0.71, '#080a22', 25, 75, 0.12);

  const [out, o] = createCanvas(W, H);
  if (typeof o.filter === 'string') {
    o.filter = 'blur(5px)';
    o.drawImage(sharp, 0, 0);
    o.filter = 'none';
  } else {
    let src: HTMLCanvasElement = sharp;
    for (const div of [2, 4, 8, 4, 2]) {
      const [step, sc] = createCanvas(Math.round(W / div), Math.round(H / div));
      sc.imageSmoothingEnabled = true;
      sc.imageSmoothingQuality = 'high';
      sc.drawImage(src, 0, 0, step.width, step.height);
      src = step;
    }
    o.imageSmoothingQuality = 'high';
    o.drawImage(src, 0, 0, W, H);
  }

  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function woodTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 128);
  const rand = mulberry32(42);
  ctx.fillStyle = WORLD_COLORS.wood;
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 26; i++) {
    const y = rand() * 128;
    ctx.strokeStyle = `rgba(110, 56, 28, ${0.12 + rand() * 0.18})`;
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function clockFaceTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const c = size / 2;
  ctx.fillStyle = WORLD_COLORS.clockFace;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = WORLD_COLORS.clockRim;
  ctx.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    const r0 = major ? c * 0.72 : c * 0.8;
    ctx.lineWidth = major ? 7 : 3;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
    ctx.lineTo(c + Math.sin(a) * c * 0.88, c - Math.cos(a) * c * 0.88);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(): World {
  const root = new THREE.Group();
  root.name = 'desk-world';
  const gradientMap = createToonGradient();
  const ownedTextures: THREE.Texture[] = [gradientMap];

  const inkMaterial = new LineMaterial({
    color: WORLD_COLORS.ink,
    linewidth: INK_WIDTH_PX,
    worldUnits: false,
  });

  const toon = (color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial =>
    new THREE.MeshToonMaterial({ color, gradientMap, ...extra });

  const addInk = (mesh: THREE.Mesh, thresholdDeg = 25): void => {
    const edges = new THREE.EdgesGeometry(mesh.geometry, thresholdDeg);
    const geo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
    edges.dispose();
    const lines = new LineSegments2(geo, inkMaterial);
    lines.name = `${mesh.name || 'mesh'}-ink`;
    mesh.add(lines);
  };

  const box = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.Material,
    ink = true,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (ink) addInk(mesh);
    return mesh;
  };

  const UP = new THREE.Vector3(0, 1, 0);
  const rod = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 12), material);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    mesh.castShadow = true;
    return mesh;
  };

  // ── Room shell ────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), toon(WORLD_COLORS.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const wallShape = new THREE.Shape();
  wallShape.moveTo(-5, 0);
  wallShape.lineTo(5, 0);
  wallShape.lineTo(5, 5);
  wallShape.lineTo(-5, 5);
  wallShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(WINDOW.x - WINDOW.w / 2, WINDOW.y - WINDOW.h / 2);
  hole.lineTo(WINDOW.x + WINDOW.w / 2, WINDOW.y - WINDOW.h / 2);
  hole.lineTo(WINDOW.x + WINDOW.w / 2, WINDOW.y + WINDOW.h / 2);
  hole.lineTo(WINDOW.x - WINDOW.w / 2, WINDOW.y + WINDOW.h / 2);
  hole.closePath();
  wallShape.holes.push(hole);
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), toon(WORLD_COLORS.wall));
  wall.position.z = WALL_Z;
  wall.receiveShadow = true;
  root.add(wall);

  const skirting = box('skirting', [10, 0.12, 0.03], [0, 0.06, WALL_Z + 0.015], toon(WORLD_COLORS.wallReveal), false);
  root.add(skirting);

  // ── Window: reveal, frame, mullions, glass, DoF backdrop, bokeh stars ─────
  const windowGroup = new THREE.Group();
  windowGroup.name = 'window';
  windowGroup.position.set(WINDOW.x, WINDOW.y, WALL_Z);
  root.add(windowGroup);

  const revealMat = toon(WORLD_COLORS.wallReveal);
  const depth = 0.14;
  const hw = WINDOW.w / 2;
  const hh = WINDOW.h / 2;
  windowGroup.add(
    box('reveal-top', [WINDOW.w, 0.02, depth], [0, hh + 0.01, -depth / 2], revealMat, false),
    box('reveal-bottom', [WINDOW.w, 0.02, depth], [0, -hh - 0.01, -depth / 2], revealMat, false),
    box('reveal-left', [0.02, WINDOW.h, depth], [-hw - 0.01, 0, -depth / 2], revealMat, false),
    box('reveal-right', [0.02, WINDOW.h, depth], [hw + 0.01, 0, -depth / 2], revealMat, false),
  );

  const frameMat = toon(WORLD_COLORS.frame);
  const ft = 0.07;
  const fz = 0.02;
  windowGroup.add(
    box('frame-top', [WINDOW.w + ft * 2, ft, 0.06], [0, hh + ft / 2, fz], frameMat),
    box('frame-bottom', [WINDOW.w + ft * 2, ft, 0.06], [0, -hh - ft / 2, fz], frameMat),
    box('frame-left', [ft, WINDOW.h, 0.06], [-hw - ft / 2, 0, fz], frameMat),
    box('frame-right', [ft, WINDOW.h, 0.06], [hw + ft / 2, 0, fz], frameMat),
    box('mullion-v', [0.035, WINDOW.h, 0.04], [0, 0, -0.06], frameMat),
    box('mullion-h', [WINDOW.w, 0.035, 0.04], [0, 0.08, -0.06], frameMat),
    box('sill', [WINDOW.w + 0.3, 0.045, 0.16], [0, -hh - ft - 0.02, 0.07], frameMat),
  );

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW.w, WINDOW.h),
    new THREE.MeshBasicMaterial({ color: '#8fa6ff', transparent: true, opacity: 0.07, depthWrite: false }),
  );
  glass.position.z = -0.07;
  windowGroup.add(glass);
  const streakMat = new THREE.MeshBasicMaterial({
    color: '#cfdcff',
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (const [x, w] of [[-0.12, 0.09], [0.02, 0.035], [0.26, 0.07]] as const) {
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(w, WINDOW.h * 1.3), streakMat);
    streak.position.set(x, 0, -0.065);
    streak.rotation.z = -0.55;
    // Sits behind the wall plane, so the wall hides any overhang past the pane.
    windowGroup.add(streak);
  }

  const backdropTex = paintNightBackdrop();
  ownedTextures.push(backdropTex);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.6),
    new THREE.MeshBasicMaterial({ map: backdropTex, fog: false, toneMapped: false }),
  );
  backdrop.position.set(0, -0.05, -1.3);
  windowGroup.add(backdrop);

  const bokehTex = radialGlowTexture('rgba(255, 244, 214, 1)', 64);
  ownedTextures.push(bokehTex);
  const bokehRand = mulberry32(7);
  const bokeh: { sprite: THREE.Sprite; base: number; phase: number; speed: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.SpriteMaterial({
      map: bokehTex,
      color: bokehRand() < 0.7 ? '#fff1cf' : '#aac4ff',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set((bokehRand() - 0.5) * 1.6, bokehRand() * 0.9 - 0.05, -1.1);
    const s = 0.05 + bokehRand() * 0.07;
    sprite.scale.set(s, s, 1);
    windowGroup.add(sprite);
    bokeh.push({ sprite, base: 0.25 + bokehRand() * 0.35, phase: bokehRand() * Math.PI * 2, speed: 0.08 + bokehRand() * 0.12 });
  }

  // ── Wall clock ────────────────────────────────────────────────────────────
  const clock = new THREE.Group();
  clock.name = 'clock';
  clock.position.copy(CLOCK_POSITION);
  root.add(clock);
  const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 48), toon(WORLD_COLORS.clockRim));
  clockBody.rotation.x = Math.PI / 2;
  clockBody.castShadow = true;
  clock.add(clockBody);
  const faceTex = clockFaceTexture();
  ownedTextures.push(faceTex);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 48), toon('#ffffff', { map: faceTex }));
  face.position.z = 0.021;
  clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.163, 0.014, 10, 48), toon(WORLD_COLORS.clockRim));
  rim.position.z = 0.022;
  clock.add(rim);
  addInk(rim, 80);

  const hand = (length: number, width: number, color: string, z: number): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(width, length, 0.004);
    geo.translate(0, length / 2 - 0.015, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.z = z;
    clock.add(mesh);
    return mesh;
  };
  const hourHand = hand(0.085, 0.016, WORLD_COLORS.clockRim, 0.026);
  const minuteHand = hand(0.125, 0.011, WORLD_COLORS.clockRim, 0.03);
  const secondHand = hand(0.135, 0.004, WORLD_COLORS.secondHand, 0.034);
  const pin = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshBasicMaterial({ color: WORLD_COLORS.secondHand }));
  pin.position.z = 0.037;
  clock.add(pin);

  // ── Desk ──────────────────────────────────────────────────────────────────
  const woodTex = woodTexture();
  ownedTextures.push(woodTex);
  const deskTopMat = toon('#ffffff', { map: woodTex });
  const deskDark = toon(WORLD_COLORS.woodDark);
  const deskZ = 0.42;
  const deskD = 0.8;
  root.add(box('desk-top', [1.9, 0.06, deskD], [0, DESK_TOP_Y - 0.03, deskZ], deskTopMat));
  for (const [x, z] of [[-0.88, deskZ - 0.34], [0.88, deskZ - 0.34], [-0.88, deskZ + 0.34], [0.88, deskZ + 0.34]] as const) {
    root.add(box('desk-leg', [0.06, DESK_TOP_Y - 0.06, 0.06], [x, (DESK_TOP_Y - 0.06) / 2, z], deskDark));
  }
  // Modesty panel + drawers hide the lower half of the billboard.
  const panelY = 0.62;
  root.add(box('desk-panel', [1.7, 0.5, 0.03], [0, panelY, deskZ + deskD / 2 - 0.05], toon(WORLD_COLORS.wood)));
  for (const x of [-0.45, 0.45]) {
    root.add(box('drawer', [0.62, 0.2, 0.02], [x, panelY + 0.08, deskZ + deskD / 2 - 0.025], deskDark));
    root.add(box('drawer-knob', [0.08, 0.025, 0.025], [x, panelY + 0.08, deskZ + deskD / 2 - 0.002], toon(WORLD_COLORS.lampShade)));
  }

  // ── Desk props: notebook, pencil, coffee cup with steam ───────────────────
  const notebook = box('notebook', [0.34, 0.012, 0.24], [-0.02, DESK_TOP_Y + 0.006, 0.5], toon(WORLD_COLORS.paper));
  notebook.rotation.y = 0.14;
  root.add(notebook);
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 8), toon(WORLD_COLORS.pencil));
  pencil.rotation.set(0, 0.5, Math.PI / 2);
  pencil.position.set(0.12, DESK_TOP_Y + 0.02, 0.56);
  pencil.castShadow = true;
  root.add(pencil);

  const cup = new THREE.Group();
  cup.name = 'cup';
  cup.position.copy(CUP_POSITION);
  root.add(cup);
  const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.12, 32), toon(WORLD_COLORS.cup));
  cupBody.position.y = 0.06;
  cupBody.castShadow = true;
  cupBody.receiveShadow = true;
  addInk(cupBody, 40);
  cup.add(cupBody);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), toon(WORLD_COLORS.coffee));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.112;
  cup.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.01, 8, 20, Math.PI * 1.3), toon(WORLD_COLORS.cup));
  handle.rotation.z = -Math.PI * 0.65;
  handle.position.set(0.058, 0.062, 0);
  handle.castShadow = true;
  cup.add(handle);

  const steamTex = radialGlowTexture('rgba(255, 255, 255, 1)', 64);
  ownedTextures.push(steamTex);
  const steam: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: steamTex, color: '#fff3e0', transparent: true, depthWrite: false, opacity: 0 }),
    );
    cup.add(sprite);
    steam.push(sprite);
  }

  // ── Desk lamp ─────────────────────────────────────────────────────────────
  const lamp = new THREE.Group();
  lamp.name = 'desk-lamp';
  root.add(lamp);
  const metal = toon(WORLD_COLORS.lampMetal);
  const lampBase = new THREE.Vector3(-0.62, DESK_TOP_Y, 0.16);
  const lampJoint = new THREE.Vector3(-0.67, DESK_TOP_Y + 0.4, 0.16);
  const shadePos = new THREE.Vector3(-0.45, DESK_TOP_Y + 0.43, 0.22);
  const lampTarget = new THREE.Vector3(-0.08, DESK_TOP_Y + 0.12, 0.2);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.03, 32), metal);
  base.position.copy(lampBase).add(new THREE.Vector3(0, 0.015, 0));
  base.castShadow = true;
  addInk(base, 40);
  lamp.add(base);
  lamp.add(rod(lampBase, lampJoint, 0.012, metal));
  lamp.add(rod(lampJoint, shadePos, 0.012, metal));
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), metal);
  joint.position.copy(lampJoint);
  lamp.add(joint);

  const shadeDir = new THREE.Vector3().subVectors(lampTarget, shadePos).normalize();
  const shadeGeo = new THREE.ConeGeometry(0.11, 0.16, 32, 1, true);
  const shade = new THREE.Mesh(shadeGeo, toon(WORLD_COLORS.lampShade));
  // Inner surface glows instead of being lit, so the bulb can't blow out the outer shell.
  shade.add(
    new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ color: '#ffe3a0', side: THREE.BackSide, toneMapped: false })),
  );
  shade.position.copy(shadePos);
  // Cone opens towards local -Y; aim the opening at the desk.
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), shadeDir);
  shade.castShadow = true;
  addInk(shade, 40);
  lamp.add(shade);

  const bulbPos = shadePos.clone().addScaledVector(shadeDir, 0.06);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 12),
    new THREE.MeshBasicMaterial({ color: WORLD_COLORS.bulb, toneMapped: false }),
  );
  bulb.position.copy(bulbPos);
  lamp.add(bulb);

  const glowTex = radialGlowTexture('rgba(255, 200, 110, 1)', 128);
  ownedTextures.push(glowTex);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: '#ffcf80',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    }),
  );
  glow.position.copy(bulbPos);
  glow.scale.set(0.75, 0.75, 1);
  lamp.add(glow);

  // ── Lighting: warm gold vs. cool blue-violet ──────────────────────────────
  const hemi = new THREE.HemisphereLight(WORLD_COLORS.coolSky, WORLD_COLORS.coolGround, 1.6);
  root.add(hemi);

  // Lamp lights sit just outside the shade opening so they don't light its outer shell.
  const lightPos = shadePos.clone().addScaledVector(shadeDir, 0.1);
  const lampSpot = new THREE.SpotLight(WORLD_COLORS.warmLamp, 1.1, 6, 1.05, 0.65, 1.6);
  lampSpot.position.copy(lightPos);
  lampSpot.target.position.copy(lampTarget).add(new THREE.Vector3(0, 0.25, -0.2));
  lampSpot.castShadow = true;
  lampSpot.shadow.mapSize.set(1024, 1024);
  lampSpot.shadow.bias = -0.0006;
  lampSpot.shadow.normalBias = 0.02;
  lampSpot.shadow.radius = 4;
  lampSpot.shadow.camera.near = 0.05;
  lampSpot.shadow.camera.far = 6;
  root.add(lampSpot, lampSpot.target);

  const lampFill = new THREE.PointLight(WORLD_COLORS.warmLamp, 0.35, 3.5, 1.6);
  lampFill.position.copy(lightPos);
  root.add(lampFill);

  const warmKey = new THREE.DirectionalLight(WORLD_COLORS.warmKey, 1.2);
  warmKey.position.set(-2.4, 3.1, 2.6);
  warmKey.target.position.set(0, 0.9, -0.2);
  warmKey.castShadow = true;
  warmKey.shadow.mapSize.set(2048, 2048);
  warmKey.shadow.bias = -0.0005;
  warmKey.shadow.normalBias = 0.02;
  warmKey.shadow.radius = 3;
  const sc = warmKey.shadow.camera;
  sc.left = -2.5;
  sc.right = 2.5;
  sc.top = 3;
  sc.bottom = -1.5;
  sc.near = 0.5;
  sc.far = 10;
  root.add(warmKey, warmKey.target);

  // Cool moonlight spilling in from the window side.
  const moonLight = new THREE.DirectionalLight(WORLD_COLORS.moon, 0.9);
  moonLight.position.set(1.6, 3.2, -3.5);
  moonLight.target.position.set(0, 0.9, 0.3);
  root.add(moonLight, moonLight.target);

  // ── Character slot ────────────────────────────────────────────────────────
  const characterAnchor = new THREE.Group();
  characterAnchor.name = 'character-anchor';
  characterAnchor.position.copy(CHARACTER_POSITION);
  root.add(characterAnchor);

  const update = (frame: number, fps: number): void => {
    const seconds = frame / fps;

    // Clock reads 11:54:20 at frame 0 and runs in real time.
    const sec = 20 + seconds;
    const min = 54 + sec / 60;
    const hr = 11 + min / 60;
    secondHand.rotation.z = -(sec / 60) * Math.PI * 2;
    minuteHand.rotation.z = -(min / 60) * Math.PI * 2;
    hourHand.rotation.z = -(hr / 12) * Math.PI * 2;

    glow.material.opacity = 0.82 + Math.sin(frame * 0.19) * 0.04 + Math.sin(frame * 0.53) * 0.02;

    steam.forEach((sprite, i) => {
      const t = ((frame + i * 20) % 60) / 60;
      sprite.position.set(Math.sin(t * Math.PI * 2 + i * 2.1) * 0.018, 0.13 + t * 0.22, 0);
      const s = 0.05 + t * 0.07;
      sprite.scale.set(s, s, 1);
      sprite.material.opacity = Math.sin(t * Math.PI) * 0.3;
    });

    for (const b of bokeh) {
      b.sprite.material.opacity = b.base * (0.65 + 0.35 * Math.sin(frame * b.speed + b.phase));
    }
  };

  const dispose = (): void => {
    const materials = new Set<THREE.Material>();
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite || obj instanceof LineSegments2) {
        if (!(obj instanceof THREE.Sprite)) (obj.geometry as THREE.BufferGeometry).dispose();
        const m = obj.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((mat) => materials.add(mat));
      }
      if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight) obj.shadow.dispose();
    });
    materials.forEach((m) => m.dispose());
    ownedTextures.forEach((t) => t.dispose());
  };

  return {
    root,
    gradientMap,
    characterAnchor,
    lookTargets: { cup: CUP_POSITION.clone(), clock: CLOCK_POSITION.clone() },
    update,
    dispose,
  };
}
