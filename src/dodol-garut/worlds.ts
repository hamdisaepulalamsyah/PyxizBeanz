import * as THREE from 'three';
import { WorldKit, mulberry32 } from '../persis/worlds';
import { ERA_FONT } from '../cikajang/fonts';
import { fitFont, platePaint } from '../cikajang/signage';
import { type ColorPhase, COLOR_SCRIPT, type Vec3, type WorldId, lerp, smoothstep } from './story';

/**
 * Three.js 3D Toon Worlds for "Fakta Unik Dodol Garut" (6 bespoke sets).
 *
 * Every world is self-contained, oversized against camera bounds, and features
 * animated hero props synced deterministically to `frame` / `progress`:
 *  - Hammered copper cauldron (*kancah*) with rotating caramel surface & wooden *pangaduk*,
 *  - Brick *hawu* stove with glowing pulsing embers & burning firewood,
 *  - Macro banana-leaf dodol platter & 5-month calendar,
 *  - 3D Physics cutaway: evaporating H2O spheres & hexagonal sugar-crystal cages,
 *  - 1959 PICNIC display counter stacked with iconic beet-red/gold boxes,
 *  - Export crates ("JEPANG", "TIMUR TENGAH") overlooking Gunung Cikuray at dusk.
 */

export interface WorldScene {
  id: WorldId;
  group: THREE.Group;
  anchors: Record<string, THREE.Vector3>;
  background: THREE.Color;
  fog: THREE.Fog;
  sunDir: THREE.Vector3;
  update: (f: { frame: number; localFrame: number; progress: number; fps: number }) => void;
}

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function groundPlane(
  kit: WorldKit,
  g: THREE.Object3D,
  color: string,
  opts: { size?: number; y?: number; paint?: Paint; repeat?: number } = {},
): THREE.Mesh {
  const size = opts.size ?? 320;
  const mat = opts.paint
    ? kit.toon('#ffffff', { map: kit.canvas(512, 512, opts.paint, { repeat: [opts.repeat ?? 48, opts.repeat ?? 48] }) })
    : color;
  return kit.mesh(g, new THREE.PlaneGeometry(size, size), mat, [0, opts.y ?? 0, 0], {
    rot: [-Math.PI / 2, 0, 0],
    ink: false,
    shadow: false,
  });
}

function woodPaint(seed: number, base = '#7c4c2a', grain = '#593319'): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    c.strokeStyle = grain;
    c.lineWidth = 3;
    for (let y = 0; y < h; y += 64) {
      c.globalAlpha = 0.45;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    for (let i = 0; i < 42; i++) {
      c.globalAlpha = 0.14 + r() * 0.2;
      c.beginPath();
      const y0 = r() * h;
      c.moveTo(0, y0);
      c.bezierCurveTo(w * 0.33, y0 + (r() - 0.5) * 18, w * 0.66, y0 + (r() - 0.5) * 18, w, y0);
      c.stroke();
    }
    c.globalAlpha = 1;
  };
}

function tileFloorPaint(seed: number, a = '#cfc2ad', b = '#bfb099'): Paint {
  return (c, w, h) => {
    c.fillStyle = a;
    c.fillRect(0, 0, w, h);
    const step = 128;
    const r = mulberry32(seed);
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (((x / step + y / step) & 1) === 0) {
          c.fillStyle = b;
          c.fillRect(x, y, step, step);
        }
        c.fillStyle = `rgba(60,40,28,${0.03 + r() * 0.05})`;
        c.fillRect(x + 4, y + 4, step - 8, step - 8);
      }
    }
    c.strokeStyle = 'rgba(70,52,40,0.35)';
    c.lineWidth = 3;
    for (let k = 0; k <= w; k += step) {
      c.beginPath();
      c.moveTo(k, 0);
      c.lineTo(k, h);
      c.stroke();
      c.beginPath();
      c.moveTo(0, k);
      c.lineTo(w, k);
      c.stroke();
    }
  };
}

function brickPaint(seed: number, mortar = '#c2b29b', brick = '#a04d34'): Paint {
  return (c, w, h) => {
    c.fillStyle = mortar;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    const rows = 8;
    const cols = 4;
    const bh = h / rows;
    const bw = w / cols;
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * (bw * 0.5);
      for (let col = -1; col <= cols; col++) {
        c.fillStyle = r() > 0.35 ? brick : '#8a3e28';
        c.fillRect(col * bw + off + 4, row * bh + 4, bw - 8, bh - 8);
      }
    }
  };
}

function bambooWallPaint(seed: number): Paint {
  return (c, w, h) => {
    c.fillStyle = '#c9a66b';
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    const strip = 48;
    for (let y = 0; y < h; y += strip) {
      for (let x = 0; x < w; x += strip) {
        const horiz = ((x / strip + y / strip) & 1) === 0;
        c.fillStyle = horiz ? '#cfa96e' : '#b88f52';
        c.fillRect(x + 2, y + 2, strip - 4, strip - 4);
        c.fillStyle = `rgba(40,24,10,${0.06 + r() * 0.08})`;
        c.fillRect(x + 2, y + 2, strip - 4, strip - 4);
      }
    }
  };
}

function skyBackdrop(
  stops: readonly (readonly [number, string])[],
  ridges: readonly { pts: readonly (readonly [number, number])[]; color: string }[],
  seed: number,
  sun?: { x: number; y: number; r: number; color: string },
): Paint {
  return (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    for (const [t, col] of stops) g.addColorStop(t, col);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (sun) {
      const rg = c.createRadialGradient(sun.x * w, sun.y * h, 0, sun.x * w, sun.y * h, sun.r * w * 4);
      rg.addColorStop(0, sun.color);
      rg.addColorStop(0.22, sun.color);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, w, h);
    }
    const r = mulberry32(seed);
    c.fillStyle = 'rgba(255,250,240,0.68)';
    for (let i = 0; i < 16; i++) {
      const x = r() * w;
      const y = (0.2 + r() * 0.18) * h;
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        c.ellipse(x + (k - 1.5) * w * 0.02, y + Math.sin(k) * 8, w * 0.03, h * 0.015, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    for (const rd of ridges) {
      c.fillStyle = rd.color;
      c.beginPath();
      c.moveTo(0, h);
      for (const [x, y] of rd.pts) c.lineTo(x * w, y * h);
      c.lineTo(w, h);
      c.closePath();
      c.fill();
    }
  };
}

function lightRig(
  kit: WorldKit,
  g: THREE.Group,
  phase: ColorPhase,
  keyPos: Vec3,
  keyTarget: Vec3,
  hemiIntensity = 1.45,
  keyIntensity = 2.4,
): { sunDir: THREE.Vector3; keyLight: THREE.DirectionalLight } {
  const pal = COLOR_SCRIPT[phase];
  const hemi = new THREE.HemisphereLight(pal.rim, pal.shadow, hemiIntensity);
  g.add(hemi);
  const dir = new THREE.DirectionalLight(pal.key, keyIntensity);
  dir.position.set(keyPos[0], keyPos[1], keyPos[2]);
  dir.target.position.set(keyTarget[0], keyTarget[1], keyTarget[2]);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 35;
  const e = 8;
  dir.shadow.camera.left = -e;
  dir.shadow.camera.right = e;
  dir.shadow.camera.top = e;
  dir.shadow.camera.bottom = -e;
  dir.shadow.bias = -0.0005;
  g.add(dir);
  g.add(dir.target);
  const rim = new THREE.DirectionalLight(pal.rim, 0.7);
  rim.position.set(-keyPos[0] * 0.8, keyPos[1] * 0.7, -Math.abs(keyPos[2]));
  g.add(rim);
  void kit;
  return {
    sunDir: v3(keyPos[0] - keyTarget[0], keyPos[1] - keyTarget[1], keyPos[2] - keyTarget[2]).normalize(),
    keyLight: dir,
  };
}

/** Build a hero hammered copper cauldron (*kancah*) seated on a brick *hawu* wood stove. */
function buildKancahAndHawu(
  kit: WorldKit,
  parent: THREE.Group,
  pos: Vec3,
  scale = 1.0,
): {
  root: THREE.Group;
  swirlDisc: THREE.Mesh;
  paddlePivot: THREE.Group;
  embers: THREE.Mesh[];
  flameGlow: THREE.Sprite;
} {
  const root = new THREE.Group();
  root.position.set(pos[0], pos[1], pos[2]);
  root.scale.setScalar(scale);
  parent.add(root);

  const brickMat = kit.toon('#ffffff', { map: kit.canvas(256, 256, brickPaint(41), { repeat: [2, 1] }) });
  // Brick hawu stove base
  kit.cyl(root, 0.78, 0.84, 0.62, [0, 0.31, 0], brickMat, { seg: 18, ink: 32 });
  // Open firebox mouth on +Z front
  kit.box(root, [0.46, 0.34, 0.35], [0, 0.2, 0.65], '#231618', { ink: 25 });
  // Firewood logs sticking slightly out
  for (const [lx, rotY] of [
    [-0.08, 0.15],
    [0.08, -0.18],
    [0.0, 0.05],
  ] as const) {
    kit.cyl(root, 0.045, 0.05, 0.56, [lx, 0.14, 0.78], '#6e4226', { rot: [Math.PI / 2, rotY, 0], seg: 8 });
  }
  const embers: THREE.Mesh[] = [];
  for (const [ex, ey, ez, r] of [
    [-0.1, 0.18, 0.64, 0.09],
    [0.08, 0.16, 0.62, 0.08],
    [0.0, 0.24, 0.58, 0.11],
  ] as const) {
    const em = kit.mesh(root, new THREE.SphereGeometry(r, 10, 8), kit.lit('#ff7722'), [ex, ey, ez], { ink: false, shadow: false });
    embers.push(em);
  }
  const flameGlow = kit.glow(root, '#ff8833', 1.25, [0, 0.25, 0.85], 0.72);

  // Giant hammered copper cauldron (kancah) seated in the hawu ring
  const copperMat = kit.toon('#c8763e');
  kit.cyl(root, 0.78, 0.56, 0.36, [0, 0.74, 0], copperMat, { seg: 24, ink: 36 });
  // Thick rolled brass rim
  kit.mesh(root, new THREE.TorusGeometry(0.77, 0.042, 10, 28), '#a65c2e', [0, 0.92, 0], { rot: [Math.PI / 2, 0, 0], ink: 35 });

  // Swirling glossy caramel dodol surface inside the cauldron
  const swirlTex = kit.canvas(512, 512, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#6a3316');
    gr.addColorStop(0.55, '#4c220d');
    gr.addColorStop(1, '#361608');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    // Spiral glossy caramel ridges
    for (let s = 0; s < 5; s++) {
      c.strokeStyle = s % 2 === 0 ? 'rgba(196, 122, 62, 0.45)' : 'rgba(255, 205, 130, 0.25)';
      c.lineWidth = 14 - s * 2;
      c.lineCap = 'round';
      c.beginPath();
      for (let t = 0; t <= 48; t++) {
        const u = t / 48;
        const a = u * Math.PI * 3.4 + s * 1.25;
        const rr = 34 + u * 188;
        const x = w / 2 + Math.cos(a) * rr;
        const y = h / 2 + Math.sin(a) * rr;
        if (t === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  });
  const swirlDisc = kit.mesh(
    root,
    new THREE.CircleGeometry(0.72, 28),
    kit.toon('#ffffff', { map: swirlTex }),
    [0, 0.87, 0],
    { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false },
  );

  // Wooden pangaduk paddle pivoting from inside the dodol upward toward the artisan's hands on the -X side!
  const paddlePivot = new THREE.Group();
  paddlePivot.position.set(0, 0.86, 0);
  root.add(paddlePivot);
  const blade = new THREE.Group();
  blade.position.set(0.14, 0.0, 0);
  blade.rotation.z = 0.44;
  paddlePivot.add(blade);
  kit.box(blade, [0.16, 0.36, 0.032], [0, 0.14, 0], '#7a4924', { ink: 20 });
  kit.cyl(blade, 0.026, 0.03, 1.05, [0, 0.72, 0], '#965d32', { seg: 10, ink: 30 });

  return { root, swirlDisc, paddlePivot, embers, flameGlow };
}

/** Build an iconic beet-red/pink & gold Picnic Dodol Garut box. */
function buildPicnicBox(kit: WorldKit, parent: THREE.Object3D, pos: Vec3, scale = 1.0, rotY = 0, labelText = 'PICNIC'): THREE.Group {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);
  parent.add(g);

  const boxTex = kit.canvas(512, 256, (c, w, h) => {
    c.fillStyle = '#c8284e';
    c.fillRect(0, 0, w, h);
    // Gold ornamental border
    c.strokeStyle = '#f2c652';
    c.lineWidth = 10;
    c.strokeRect(14, 14, w - 28, h - 28);
    // Cream badge oval
    c.fillStyle = '#fff5dc';
    c.beginPath();
    c.ellipse(w / 2, h / 2, w * 0.32, h * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#241726';
    c.stroke();
    c.fillStyle = '#a41838';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, labelText, '800', ERA_FONT.editorial, 66, w * 0.52, 2);
    c.fillText(labelText, w / 2, h / 2 - 8);
    c.fillStyle = '#4a2614';
    fitFont(c, 'DODOL GARUT', '700', ERA_FONT.transit, 24, w * 0.5, 2);
    c.fillText('DODOL GARUT', w / 2, h / 2 + 34);
  });

  kit.box(g, [0.42, 0.14, 0.24], [0, 0.07, 0], '#c8284e', { ink: 25 });
  kit.mesh(g, new THREE.PlaneGeometry(0.41, 0.13), kit.toon('#ffffff', { map: boxTex }), [0, 0.072, 0.121], { ink: false, shadow: false });
  kit.mesh(g, new THREE.PlaneGeometry(0.41, 0.23), kit.toon('#ffffff', { map: boxTex }), [0, 0.141, 0], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  return g;
}

// ── World 1: Macro Dodol Kitchen (Hook 0–5.6 s) ─────────────────────────────

function buildDapurMacro(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#7a5234', { paint: tileFloorPaint(11, '#d8cab4', '#c5b49b'), repeat: 24 });

  // Closed kitchen walls
  kit.box(g, [14, 5.5, 0.2], [0, 2.75, -2.5], '#efe2ca', { ink: false });
  kit.box(g, [0.2, 5.5, 12], [-5.2, 2.75, 1], '#e6d7bd', { ink: false });
  kit.box(g, [0.2, 5.5, 12], [5.2, 2.75, 1], '#e6d7bd', { ink: false });

  // Warm wooden table centered at z = 0, top at y = 0.88
  const woodMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, woodPaint(7), { repeat: [2, 2] }) });
  kit.box(g, [2.8, 0.08, 1.4], [0, 0.84, 0], woodMat, { ink: 20 });
  for (const lx of [-1.2, 1.2]) {
    for (const lz of [-0.55, 0.55]) {
      kit.box(g, [0.1, 0.84, 0.1], [lx, 0.42, lz], '#593319', { ink: 20 });
    }
  }

  // Fresh green banana leaf mat on the table
  kit.box(g, [0.95, 0.014, 0.65], [0, 0.888, 0.05], '#588c3a', { rot: [0, 0.08, 0], ink: 20 });

  // Hero sliced glossy Dodol Garut blocks (deep caramel brown + paper wrap sleeve)
  const dodolMat = kit.toon('#4c220d');
  const dodolHiMat = new THREE.MeshPhongMaterial({ color: '#5c2a12', specular: '#ffcf88', shininess: 65 });
  kit.track(dodolHiMat);
  kit.box(g, [0.34, 0.16, 0.18], [-0.08, 0.97, 0.02], dodolHiMat, { rot: [0, 0.18, 0], ink: 20 });
  // Paper sleeve around the block
  kit.box(g, [0.18, 0.166, 0.188], [-0.14, 0.97, 0.03], '#f4ebd4', { rot: [0, 0.18, 0], ink: 20 });
  // Cut slice resting next to it at a jaunty angle
  kit.box(g, [0.11, 0.15, 0.16], [0.22, 0.96, 0.12], dodolHiMat, { rot: [0, -0.35, 0], ink: 20 });
  // Wooden serving knife / bamboo spatula
  kit.box(g, [0.36, 0.015, 0.055], [0.28, 0.896, -0.18], '#c89b62', { rot: [0, -0.5, 0], ink: 20 });
  void dodolMat;

  // Vintage Calendar / Wall Sign ("5 BULAN · 0% PENGAWET") clearly framed during pull-back!
  const calTex = kit.canvas(
    640,
    512,
    platePaint(
      [
        { t: 'TAHAN SUHU RUANG', k: 0.45, color: '#5c3c24' },
        { t: '5 BULAN', k: 1.35, color: '#b82838' },
        { t: '0% PENGAWET KIMIA', k: 0.6, color: '#2b5e3b' },
      ],
      { bg: '#fbf3de', fg: '#241726', rim: '#8a5a34', family: ERA_FONT.editorial, border: 'double', rule: true, seed: 12 },
    ),
  );
  kit.box(g, [1.55, 1.24, 0.06], [0.55, 1.85, -2.36], '#5e3820', { ink: 22 });
  kit.mesh(g, new THREE.PlaneGeometry(1.42, 1.12), kit.toon('#ffffff', { map: calTex, emissive: '#ffffff', emissiveMap: calTex, emissiveIntensity: 0.25 }), [0.55, 1.85, -2.32], {
    ink: false,
    shadow: false,
  });

  // Clay sugar jars & Picnic box in background shelf
  kit.cyl(g, 0.16, 0.13, 0.36, [-0.85, 1.06, -0.32], '#9e5332', { seg: 14 });
  buildPicnicBox(kit, g, [-0.72, 0.88, 0.28], 0.9, 0.32);

  const dust = kit.dust(g, [-1.5, 0.9, -1.5], [1.5, 2.5, 1.5], 28, '#ffe7aa', 0.025, 21);
  const { sunDir } = lightRig(kit, g, 'goldenHook', [-3.5, 4.5, 3.2], [0, 1.0, 0], 1.35, 2.6);

  return {
    id: 'dapurMacro',
    group: g,
    anchors: {},
    background: new THREE.Color('#422a24'),
    fog: new THREE.Fog('#422a24', 12, 40),
    sunDir,
    update: ({ frame }) => dust(frame),
  };
}

// ── World 2: Ibu Karsinah 1926 Kitchen (Shot 2) ─────────────────────────────

function buildGarut1926(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#8c7658', { size: 320, paint: tileFloorPaint(21, '#a8906e', '#98805e'), repeat: 48 });

  // Mountain horizon (Gunung Cikuray)
  kit.backdrop(
    g,
    [240, 84],
    [0, 24, -75],
    skyBackdrop(
      [
        [0, '#6298cc'],
        [0.55, '#b8d6ea'],
        [0.85, '#f2dfc0'],
        [1, '#b8c4a8'],
      ],
      [
        { pts: [[0, 0.68], [0.22, 0.58], [0.42, 0.36], [0.52, 0.27], [0.64, 0.44], [0.85, 0.6], [1, 0.56]], color: '#587868' },
        { pts: [[0, 0.8], [0.18, 0.72], [0.45, 0.76], [0.72, 0.7], [1, 0.78]], color: '#46664e' },
      ],
      19,
      { x: 0.25, y: 0.32, r: 0.08, color: '#fff4d0' },
    ),
    2,
  );

  // Open-air wooden pavilion posts & woven bamboo rear wall (bilik) — no center pillar blocking the sign!
  const bilikMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, bambooWallPaint(31), { repeat: [4, 2] }) });
  kit.box(g, [6.4, 2.9, 0.14], [0, 1.45, -1.95], bilikMat, { ink: 20 });
  for (const px of [-2.8, 2.8]) {
    kit.box(g, [0.18, 3.2, 0.18], [px, 1.6, -1.85], '#5e3820', { ink: 20 });
  }
  kit.box(g, [6.8, 0.18, 2.8], [0, 3.05, -0.7], '#6e4226', { rot: [0.12, 0, 0], ink: 20 });

  // Diegetic 1926 Wooden Plaque: "DAPUR IBU KARSINAH · GARUT 1926"
  const signTex = kit.canvas(
    768,
    256,
    platePaint(
      [
        { t: 'DAPUR IBU KARSINAH', k: 0.95 },
        { t: 'GARUT · 1926', k: 0.7, color: '#f3d48a' },
      ],
      { bg: '#4a2b18', fg: '#f8eed8', rim: '#d4a656', family: ERA_FONT.editorial, border: 'double', seed: 44 },
    ),
  );
  kit.box(g, [1.85, 0.62, 0.08], [0, 2.28, -1.83], '#382012', { ink: 20 });
  kit.mesh(g, new THREE.PlaneGeometry(1.74, 0.54), kit.toon('#ffffff', { map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.22 }), [0, 2.28, -1.78], {
    ink: false,
    shadow: false,
  });

  // Left: Wooden prep table for Ibu Karsinah with ketan bowl, santan pitcher, gula aren cylinders
  const woodMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, woodPaint(9), { repeat: [2, 1] }) });
  kit.box(g, [1.3, 0.08, 0.85], [-0.58, 0.82, -0.35], woodMat, { ink: 20 });
  for (const lx of [-1.15, 0.0]) {
    for (const lz of [-0.7, 0.0]) kit.box(g, [0.09, 0.82, 0.09], [lx, 0.41, lz], '#593319', { ink: 20 });
  }
  // White glutinous rice flour bowl (tepung ketan)
  kit.cyl(g, 0.22, 0.14, 0.14, [-0.82, 0.93, -0.32], '#c48f58', { seg: 16 });
  kit.mesh(g, new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), '#fbf7ee', [-0.82, 0.97, -0.32], { ink: false });
  // Ceramic santan pitcher + coconut halves
  kit.cyl(g, 0.08, 0.13, 0.28, [-0.42, 1.0, -0.45], '#e8e0cf', { seg: 14 });
  kit.mesh(g, new THREE.SphereGeometry(0.11, 12, 8), '#5a3a22', [-0.24, 0.92, -0.2], { ink: 30 });
  // Gula aren brown palm sugar blocks stacked cleanly
  for (let i = 0; i < 3; i++) {
    kit.cyl(g, 0.08, 0.08, 0.09, [-0.52 + (i % 2) * 0.14, 0.9 + Math.floor(i / 2) * 0.09, -0.15], '#6b3214', { seg: 12 });
  }

  // Right: Giant copper kancah & hawu stove at x = 0.82, z = -0.15
  const kancah = buildKancahAndHawu(kit, g, [0.82, 0, -0.15], 0.86);
  const { sunDir } = lightRig(kit, g, 'heritageMorning', [-5, 7, 5], [0, 1.0, 0], 1.45, 2.35);

  return {
    id: 'garut1926',
    group: g,
    anchors: {
      karsinah: v3(-1.32, 0, -0.32),
      stirHelper: v3(1.52, 0, -0.15),
    },
    background: new THREE.Color('#c6daea'),
    fog: new THREE.Fog('#d9d2bc', 22, 95),
    sunDir,
    update: ({ frame, progress }) => {
      const ang = progress * Math.PI * 11;
      kancah.swirlDisc.rotation.z = -ang;
      kancah.paddlePivot.rotation.y = ang;
      const flicker = 0.88 + 0.14 * Math.sin(frame * 0.45);
      kancah.flameGlow.scale.setScalar(1.2 * flicker);
      kancah.embers.forEach((m, i) => m.scale.setScalar(0.92 + 0.14 * Math.sin(frame * 0.5 + i * 2)));
    },
  };
}

// ── World 3: Close-up 7–8 Hour Stirring & Hawu Stove (Shot 3) ───────────────

function buildKancahClose(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#7a634b', { paint: tileFloorPaint(37, '#9c866e', '#8c765e'), repeat: 32 });

  const bilikMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, bambooWallPaint(39), { repeat: [4, 2] }) });
  kit.box(g, [10, 3.6, 0.16], [0, 1.8, -2.0], bilikMat, { ink: 20 });
  kit.box(g, [0.18, 3.6, 0.18], [-1.5, 1.8, -1.85], '#5e3820', { ink: 20 });
  kit.box(g, [0.18, 3.6, 0.18], [1.5, 1.8, -1.85], '#5e3820', { ink: 20 });

  // Hero central kancah + hawu stove at [0, 0, 0]
  const kancah = buildKancahAndHawu(kit, g, [0, 0, 0], 1.05);

  // Stacked firewood bundle near the stoker on the right
  for (let i = 0; i < 4; i++) {
    kit.cyl(g, 0.055, 0.06, 0.55, [1.52 + (i % 2) * 0.11, 0.06 + Math.floor(i / 2) * 0.1, 0.55], '#6b4024', { rot: [0, 0.25, Math.PI / 2], seg: 8 });
  }

  // Wall clock on rear post visually showing 7-hour marathon!
  const clockGroup = new THREE.Group();
  clockGroup.position.set(0.0, 2.05, -1.82);
  g.add(clockGroup);
  kit.cyl(clockGroup, 0.34, 0.34, 0.06, [0, 0, 0], '#4a2b18', { rot: [Math.PI / 2, 0, 0], seg: 24 });
  kit.mesh(clockGroup, new THREE.CircleGeometry(0.29, 24), kit.lit('#fbf4e0'), [0, 0, 0.035], { ink: false, shadow: false });
  const hourPivot = new THREE.Group();
  hourPivot.position.set(0, 0, 0.042);
  clockGroup.add(hourPivot);
  kit.box(hourPivot, [0.025, 0.16, 0.01], [0, 0.07, 0], '#241726', { ink: false });
  const minPivot = new THREE.Group();
  minPivot.position.set(0, 0, 0.046);
  clockGroup.add(minPivot);
  kit.box(minPivot, [0.018, 0.22, 0.01], [0, 0.1, 0], '#b82838', { ink: false });

  kit.label(g, ['7–8 JAM NONSTOP'], [1.5, 0.32], [0, 2.55, -1.8], {
    bg: '#382014',
    fg: '#ffd884',
    font: `700 {size}px ${ERA_FONT.industrial}`,
    border: '#d49a48',
    glow: 0.25,
  });

  const dust = kit.dust(g, [-1.8, 0.2, -1.2], [1.8, 2.4, 1.2], 32, '#ffae52', 0.026, 51);
  const { sunDir } = lightRig(kit, g, 'emberHeat', [-2.5, 4.2, 2.8], [0, 0.9, 0], 1.25, 2.4);

  return {
    id: 'kancahClose',
    group: g,
    anchors: {
      stirMain: v3(-0.98, 0, 0.16),
      stoker: v3(1.14, 0, 0.42),
    },
    background: new THREE.Color('#2c1c24'),
    fog: new THREE.Fog('#2c1c24', 10, 35),
    sunDir,
    update: ({ frame, progress }) => {
      const ang = progress * Math.PI * 14;
      kancah.swirlDisc.rotation.z = -ang;
      // Oscillate paddle naturally from the artisan's -X side inside the cauldron
      kancah.paddlePivot.rotation.y = Math.sin(ang) * 0.34;
      kancah.paddlePivot.rotation.x = Math.cos(ang) * 0.12;
      const heatPulse = 0.85 + 0.2 * Math.sin(frame * 0.42);
      kancah.flameGlow.scale.setScalar(1.4 * heatPulse);
      kancah.embers.forEach((m, i) => m.scale.setScalar(0.9 + 0.18 * Math.sin(frame * 0.5 + i * 1.7)));
      // Spin clock 7 hours forward across the shot!
      hourPivot.rotation.z = -progress * (Math.PI * 2 * (7 / 12));
      minPivot.rotation.z = -progress * (Math.PI * 2 * 7);
      dust(frame);
    },
  };
}

// ── World 4: Science Cutaway — Water Evaporation & Sugar Lock (Shot 4) ──────

function buildSainsCutaway(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#1a2042', { size: 220 });

  // Clean dark-indigo studio cyclorama backdrop
  kit.mesh(g, new THREE.PlaneGeometry(40, 24), kit.lit('#1b2248'), [0, 6, -12], { ink: false, shadow: false });

  // Hero 3D Caramel Dodol Cross-Section slab at [0, 0.9, 0]
  const slabMat = new THREE.MeshPhongMaterial({ color: '#5c2a12', specular: '#ffcf88', shininess: 58 });
  kit.track(slabMat);
  kit.box(g, [1.55, 0.56, 0.95], [0, 0.88, 0], slabMat, { ink: 20 });
  // Wooden display plinth under it
  kit.box(g, [1.8, 0.6, 1.15], [0, 0.3, 0], '#3e2920', { ink: 20 });

  // Rising evaporating water droplets (H2O)
  const drops: { mesh: THREE.Mesh; x: number; z: number; seed: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const x = -0.58 + (i % 5) * 0.29;
    const z = -0.2 + Math.floor(i / 5) * 0.35;
    const dm = kit.mesh(g, new THREE.SphereGeometry(0.065, 12, 10), kit.lit('#6ad0ff', { transparent: true, opacity: 0.88 }), [x, 1.25, z], {
      ink: false,
      shadow: false,
    });
    drops.push({ mesh: dm, x, z, seed: i * 0.27 });
  }

  // Trapped green microbe sphere + locking golden hexagonal sugar crystals!
  const microbe = kit.mesh(g, new THREE.SphereGeometry(0.16, 16, 12), kit.toon('#6cc45e'), [-0.15, 1.38, 0.1], { ink: 35 });
  const crystals: { mesh: THREE.Mesh; angle: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const cm = kit.mesh(g, new THREE.OctahedronGeometry(0.11, 0), kit.toon('#ffd85c'), [-0.15 + Math.cos(a) * 0.55, 1.38 + Math.sin(a) * 0.35, 0.22], {
      ink: 25,
    });
    crystals.push({ mesh: cm, angle: a });
  }

  const labelTex = kit.canvas(
    768,
    240,
    platePaint(
      [
        { t: 'AIR MENGUAP · GULA PEKAT', k: 0.85, color: '#fff3d0' },
        { t: 'BAKTERI TERKUNCI ALAMI', k: 0.65, color: '#7ee0ff' },
      ],
      { bg: '#202a56', fg: '#ffffff', rim: '#78b8ff', family: ERA_FONT.transit, border: 'double', seed: 63 },
    ),
  );
  kit.mesh(g, new THREE.PlaneGeometry(1.26, 0.4), kit.toon('#ffffff', { map: labelTex, emissive: '#ffffff', emissiveMap: labelTex, emissiveIntensity: 0.32 }), [0, 1.88, -0.45], {
    ink: false,
    shadow: false,
  });

  const { sunDir } = lightRig(kit, g, 'scienceIndigo', [-2, 5, 3], [0, 1.1, 0], 1.35, 2.2);

  return {
    id: 'sainsCutaway',
    group: g,
    anchors: {},
    background: new THREE.Color('#181f42'),
    fog: new THREE.Fog('#181f42', 14, 42),
    sunDir,
    update: ({ progress }) => {
      drops.forEach((d) => {
        const u = (progress * 1.8 + d.seed) % 1;
        d.mesh.position.set(d.x + Math.sin(u * 6) * 0.04, 1.2 + u * 1.15, d.z);
        d.mesh.scale.setScalar(Math.max(0.05, 1.0 - u * 0.75));
      });
      // Sugar crystals close in tightly around the microbe in second half
      const lock = smoothstep(0.35, 0.8, progress);
      const rad = lerp(0.55, 0.25, lock);
      crystals.forEach((c, idx) => {
        const a = c.angle + progress * 1.4;
        c.mesh.position.set(-0.15 + Math.cos(a) * rad, 1.38 + Math.sin(a) * rad * 0.78, 0.22);
        c.mesh.rotation.set(progress * 3 + idx, progress * 2, 0);
      });
      microbe.scale.setScalar(lerp(1.0, 0.72, lock));
    },
  };
}

// ── World 5: 1950s Stigma -> PICNIC 1959 Counter (Shot 5) ───────────────────

function buildTokoPicnic1959(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  groundPlane(kit, g, '#cfc2ad', { paint: tileFloorPaint(71, '#dad0be', '#c6b8a2'), repeat: 32 });

  // Long retro 1959 shop back wall
  kit.box(g, [14, 4.2, 0.2], [0, 2.1, -1.85], '#efe4cc', { ink: false });
  kit.box(g, [14, 0.9, 0.22], [0, 0.45, -1.82], '#5e7a68', { ink: false });

  // Left zone: rustic woven bamboo basket (besek) on wooden stool ("makanan kampung")
  kit.box(g, [0.55, 0.45, 0.55], [-2.05, 0.225, 0.05], '#7a5230', { ink: 25 });
  kit.cyl(g, 0.24, 0.18, 0.22, [-2.05, 0.56, 0.05], '#c9a66b', { seg: 12 });

  // Right zone: gleaming teak & glass PICNIC counter stacked with red-gold boxes!
  const woodMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, woodPaint(79, '#7a4726', '#563016'), { repeat: [2, 1] }) });
  kit.box(g, [2.3, 0.92, 0.8], [1.25, 0.46, -0.58], woodMat, { ink: 22 });
  kit.box(g, [2.38, 0.06, 0.88], [1.25, 0.94, -0.58], '#e8d9be', { ink: 20 });

  // Pyramid stack of iconic beet-red PICNIC boxes on the counter!
  buildPicnicBox(kit, g, [0.85, 0.97, -0.55], 0.95, 0.12);
  buildPicnicBox(kit, g, [1.32, 0.97, -0.58], 0.95, -0.05);
  buildPicnicBox(kit, g, [1.78, 0.97, -0.52], 0.95, -0.15);
  buildPicnicBox(kit, g, [1.08, 1.11, -0.56], 0.95, 0.04);
  buildPicnicBox(kit, g, [1.56, 1.11, -0.56], 0.95, -0.08);
  buildPicnicBox(kit, g, [1.32, 1.25, -0.56], 0.95, 0.02);

  // Retro 1959 PICNIC signboard on rear wall (safely below top ShotChip)
  const shopTex = kit.canvas(
    840,
    260,
    platePaint(
      [
        { t: 'PICNIC · GARUT', k: 1.0, color: '#fff3dc' },
        { t: 'PATEN RESMI 1959 · BANDUNG STYLE', k: 0.55, color: '#f5cd5e' },
      ],
      { bg: '#a81e3f', fg: '#ffffff', rim: '#f5cd5e', family: ERA_FONT.editorial, border: 'double', rule: true, seed: 83 },
    ),
  );
  kit.box(g, [1.85, 0.6, 0.08], [1.25, 2.05, -1.72], '#661428', { ink: 22 });
  kit.mesh(g, new THREE.PlaneGeometry(1.74, 0.52), kit.toon('#ffffff', { map: shopTex, emissive: '#ffffff', emissiveMap: shopTex, emissiveIntensity: 0.25 }), [1.25, 2.05, -1.67], {
    ink: false,
    shadow: false,
  });

  const { sunDir } = lightRig(kit, g, 'retroShop', [-4, 6, 4], [0.5, 1.1, -0.3], 1.45, 2.3);

  return {
    id: 'tokoPicnic1959',
    group: g,
    anchors: {
      kritikus: v3(-1.3, 0, 0.05),
      iton: v3(0.72, 0, 0.02),
      aam: v3(1.82, 0, -0.05),
    },
    background: new THREE.Color('#d8cdb8'),
    fog: new THREE.Fog('#d8cdb8', 18, 60),
    sunDir,
    update: () => {},
  };
}

// ── World 6: Export Gallery & Warm Dusk Finale (Shot 6) ─────────────────────

function buildGaleriEkspor(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  // Tiled terrace deck ending cleanly at z = -3.15 so the sunset valley & Cikuray mountains are wide open behind!
  const floorMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, tileFloorPaint(91, '#d4c6ae', '#c2b298'), { repeat: [6, 4] }) });
  kit.box(g, [18, 0.3, 12], [0, -0.15, 2.85], floorMat, { ink: false, shadow: false });

  // Warm sunset Priangan mountains backdrop positioned cleanly above the terrace balustrade!
  kit.backdrop(
    g,
    [76, 20],
    [0, 6.8, -22],
    skyBackdrop(
      [
        [0, '#3e3368'],
        [0.42, '#b86258'],
        [0.72, '#ffbe70'],
        [1, '#583444'],
      ],
      [
        { pts: [[0, 0.78], [0.22, 0.68], [0.46, 0.42], [0.55, 0.36], [0.68, 0.54], [0.88, 0.68], [1, 0.64]], color: '#4c3456' },
        { pts: [[0, 0.9], [0.2, 0.82], [0.5, 0.84], [0.78, 0.8], [1, 0.86]], color: '#3b2844' },
      ],
      93,
      { x: 0.72, y: 0.52, r: 0.11, color: '#ffe49e' },
    ),
    2,
  );

  // Wooden terrace balustrade framing the Garut valley behind the gallery
  kit.box(g, [10.0, 0.1, 0.14], [0, 0.92, -3.1], '#5e3820', { ink: 20 });
  kit.box(g, [10.0, 0.28, 0.22], [0, 0.14, -3.1], '#8a7a68', { ink: 20 });
  for (let x = -4.4; x <= 4.4; x += 0.8) {
    kit.box(g, [0.08, 0.78, 0.08], [x, 0.53, -3.1], '#6e4226', { ink: 18 });
  }

  // Foreground export & tasting counter at [0.58, 0, -0.58]
  const woodMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, woodPaint(97), { repeat: [2, 1] }) });
  kit.box(g, [1.7, 0.88, 0.82], [0.58, 0.44, -0.58], woodMat, { ink: 22 });
  buildPicnicBox(kit, g, [0.02, 0.89, -0.48], 0.84, 0.14);

  // Export cargo crates stenciled JEPANG & TIMUR TENGAH clearly visible above anak's head
  const makeCrate = (label: string, pos: Vec3, rotY: number): void => {
    kit.box(g, [0.46, 0.36, 0.36], pos, '#b88854', { rot: [0, rotY, 0], ink: 24 });
    const tex = kit.canvas(
      384,
      256,
      platePaint(
        [
          { t: 'EKSPOR GARUT', k: 0.48, color: '#5c3c1e' },
          { t: label, k: 0.82, color: '#241726' },
        ],
        { bg: '#c49660', fg: '#241726', rim: '#6e4926', family: ERA_FONT.stencil, border: 'single', seed: 101 },
      ),
    );
    const plane = kit.mesh(g, new THREE.PlaneGeometry(0.42, 0.28), kit.toon('#ffffff', { map: tex }), [pos[0], pos[1], pos[2] + 0.185], {
      rot: [0, rotY, 0],
      ink: false,
      shadow: false,
    });
    plane.position.x = pos[0] + Math.sin(rotY) * 0.185;
    plane.position.z = pos[2] + Math.cos(rotY) * 0.185;
  };
  makeCrate('JEPANG', [0.52, 1.06, -0.6], -0.1);
  makeCrate('TIMUR TENGAH', [1.06, 1.06, -0.56], 0.08);

  // Background traditional copper kancah & hawu reminding viewer of the 7-hour human patience!
  const kancah = buildKancahAndHawu(kit, g, [-0.92, 0, -1.35], 0.82);
  const { sunDir } = lightRig(kit, g, 'triumphDusk', [5, 4.5, 4], [0, 1.1, -0.5], 1.35, 2.5);

  return {
    id: 'galeriEkspor',
    group: g,
    anchors: {
      pembeli: v3(-0.18, 0, 0.18),
      anak: v3(0.45, 0, 0.26),
      stirBack: v3(-1.55, 0, -1.35),
    },
    background: new THREE.Color('#6a455a'),
    fog: new THREE.Fog('#c88a72', 18, 85),
    sunDir,
    update: ({ frame, progress }) => {
      const ang = progress * Math.PI * 9;
      kancah.swirlDisc.rotation.z = -ang;
      kancah.paddlePivot.rotation.y = ang;
      kancah.flameGlow.scale.setScalar(1.18 + 0.14 * Math.sin(frame * 0.4));
    },
  };
}

// ── World Registry ──────────────────────────────────────────────────────────

const BUILDERS: Record<WorldId, (kit: WorldKit) => WorldScene> = {
  dapurMacro: buildDapurMacro,
  garut1926: buildGarut1926,
  kancahClose: buildKancahClose,
  sainsCutaway: buildSainsCutaway,
  tokoPicnic1959: buildTokoPicnic1959,
  galeriEkspor: buildGaleriEkspor,
};

export function buildWorld(id: WorldId, kit: WorldKit): WorldScene {
  const w = BUILDERS[id](kit);
  w.group.name = `world-dodol-${id}`;
  return w;
}
