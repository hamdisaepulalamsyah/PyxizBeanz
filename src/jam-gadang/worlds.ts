import * as THREE from 'three';
import { type WorldFrame, WorldKit, mulberry32 } from '../persis/worlds';
import { ERA_FONT } from '../cikajang/fonts';
import { birdFlock, foregroundLeaves } from '../cikajang/flora';
import { carvedStonePaint, plateBacking, platePaint, platePlane } from '../cikajang/signage';
import type { ColorPhase, Vec3, WorldId } from './story';
import { COLOR_SCRIPT } from './story';

export interface WorldScene {
  id: WorldId;
  group: THREE.Group;
  anchors: Record<string, THREE.Vector3>;
  background: THREE.Color;
  fog: THREE.Fog;
  update: (f: WorldFrame) => void;
}

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function mixHex(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

function speckle(base: string, dots: readonly string[], seed: number, n = 900): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      c.fillStyle = dots[i % dots.length] ?? base;
      c.globalAlpha = 0.22 + r() * 0.35;
      c.beginPath();
      c.ellipse(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}

/** Weathered Bukittinggi limestone plaster with horizontal masonry courses and moss patina. */
function limestonePaint(base: string, seed: number): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    for (let i = 0; i < 65; i++) {
      c.fillStyle = `rgba(${105 + r() * 35}, ${90 + r() * 28}, ${65 + r() * 20}, ${0.06 + r() * 0.1})`;
      c.beginPath();
      c.ellipse(r() * w, r() * h, 18 + r() * 75, 24 + r() * 90, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(72, 58, 42, 0.22)';
    c.lineWidth = 2;
    const rows = 12;
    for (let row = 0; row < rows; row++) {
      const y = (row / rows) * h;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      const cols = 4;
      const offset = row % 2 === 0 ? 0 : w / (cols * 2);
      for (let col = 0; col <= cols; col++) {
        const x = (col / cols) * w + offset;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + h / rows);
        c.stroke();
      }
    }
  };
}

function woodPlanks(base: string, seed: number): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    for (let y = 0; y < h; y += 32) {
      c.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`;
      c.fillRect(0, y, w, 30);
      c.fillStyle = 'rgba(20,12,6,0.35)';
      c.fillRect(0, y + 30, w, 2);
    }
  };
}

function cobblePaint(seed: number, base = '#8c8378'): Paint {
  return (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    const cols = 8;
    const rows = 12;
    for (let row = 0; row < rows; row++) {
      const shift = row % 2 ? w / (cols * 2) : 0;
      for (let col = -1; col <= cols; col++) {
        const bw = w / cols - 4;
        const bh = h / rows - 4;
        const x = col * (w / cols) + shift + 2;
        const y = row * (h / rows) + 2;
        c.fillStyle = mixHex(base, r() > 0.5 ? '#c8bfae' : '#5e564c', 0.14 + r() * 0.24);
        c.beginPath();
        c.roundRect(x, y, bw, bh, 6);
        c.fill();
      }
    }
  };
}

interface SkySpec {
  stops: readonly [number, string][];
  sun?: { x: number; y: number; r: number; color: string };
  clouds?: { color: string; count: number; y: number };
  ridges: readonly { y: number; amp: number; freq: number; color: string; spire?: { x: number; w: number; h: number } }[];
  seed: number;
}

const BUKIT_BARISAN = (far: string, near: string): SkySpec['ridges'] => [
  { y: 0.72, amp: 0.12, freq: 2.3, color: far, spire: { x: 0.26, w: 0.22, h: 0.21 } },
  { y: 0.84, amp: 0.08, freq: 3.1, color: near },
];

function skyPaint(s: SkySpec): Paint {
  return (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    for (const [at, col] of s.stops) gr.addColorStop(at, col);
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(s.seed);
    if (s.sun) {
      const sx = s.sun.x * w;
      const sy = s.sun.y * h;
      const halo = c.createRadialGradient(sx, sy, 0, sx, sy, s.sun.r * w * 4.5);
      halo.addColorStop(0, s.sun.color);
      halo.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = halo;
      c.fillRect(0, 0, w, h);
    }
    if (s.clouds) {
      c.fillStyle = s.clouds.color;
      for (let i = 0; i < s.clouds.count; i++) {
        const cx = r() * w;
        const cy = (s.clouds.y + (r() - 0.5) * 0.22) * h;
        c.beginPath();
        c.ellipse(cx, cy, (0.05 + r() * 0.08) * w, (0.014 + r() * 0.024) * h, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    for (const rg of s.ridges) {
      c.fillStyle = rg.color;
      c.beginPath();
      c.moveTo(0, h);
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        let y = rg.y - Math.sin(u * Math.PI * rg.freq + s.seed) * rg.amp - Math.sin(u * 13 + 1.4) * rg.amp * 0.28;
        if (rg.spire) {
          const d = Math.abs(u - rg.spire.x) / rg.spire.w;
          if (d < 1) y -= (1 - d * d) * (1 - d * d) * rg.spire.h;
        }
        c.lineTo(u * w, y * h);
      }
      c.lineTo(w, h);
      c.closePath();
      c.fill();
    }
  };
}

function lightRig(
  kit: WorldKit,
  g: THREE.Group,
  o: {
    sky: string;
    ground: string;
    hemi: number;
    key: string;
    keyIntensity: number;
    keyPos: Vec3;
    keyTarget: Vec3;
    extent: number;
    phase: ColorPhase;
  },
): THREE.DirectionalLight {
  const cs = COLOR_SCRIPT[o.phase];
  const hemi = new THREE.HemisphereLight(mixHex(o.sky, cs.shadow, 0.35), o.ground, o.hemi * 0.72);
  g.add(hemi);
  const key = new THREE.DirectionalLight(mixHex(o.key, cs.key, 0.4), o.keyIntensity);
  key.position.set(...o.keyPos);
  key.target.position.set(...o.keyTarget);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  const c = key.shadow.camera;
  c.left = -o.extent;
  c.right = o.extent;
  c.top = o.extent;
  c.bottom = -o.extent;
  c.near = 0.5;
  c.far = 140;
  g.add(key, key.target);
  void kit;
  return key;
}

// ── Shared Bukittinggi Props & Scenic Dressing ──────────────────────────────

function plazaLamp(kit: WorldKit, parent: THREE.Object3D, x: number, z: number, side: 1 | -1): void {
  kit.cyl(parent, 0.06, 0.09, 2.8, [x, 1.4, z], '#223238', { seg: 10 });
  kit.cyl(parent, 0.13, 0.16, 0.35, [x, 0.175, z], '#2c3d44', { seg: 10 });
  kit.box(parent, [0.42, 0.06, 0.06], [x - side * 0.18, 2.75, z], '#223238', { ink: false });
  const lx = x - side * 0.36;
  kit.box(parent, [0.24, 0.32, 0.24], [lx, 2.52, z], kit.lit('#ffcb74'), { ink: 20 });
  kit.hipRoof(parent, 0.34, 0.34, 0.18, [lx, 2.68, z], '#223238');
  kit.glow(parent, '#ffbe60', 1.75, [lx, 2.52, z], 0.92);
  kit.point(parent, '#ffb452', 1.8, 7, [lx, 2.45, z]);
  // Cobble glare streak
  const streak = kit.track(
    new THREE.MeshBasicMaterial({
      map: kit.canvas(32, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,195,110,0)');
        g.addColorStop(0.35, 'rgba(255,195,110,0.48)');
        g.addColorStop(1, 'rgba(255,195,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  kit.mesh(parent, new THREE.PlaneGeometry(0.45, 3.8), streak, [lx, 0.02, z + 1.8], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
}

function parkTree(kit: WorldKit, parent: THREE.Object3D, pos: Vec3, scale = 1, seed = 10): void {
  const r = mulberry32(seed);
  const g = new THREE.Group();
  g.position.set(...pos);
  g.scale.setScalar(scale);
  parent.add(g);
  kit.cyl(g, 0.14, 0.24, 2.4, [0, 1.2, 0], '#4e3726', { seg: 9 });
  const greens = ['#2f5d38', '#3c7244', '#264d2e', '#4b824d'];
  const puffs: Vec3[] = [
    [0, 3.0, 0],
    [-0.75, 2.55, 0.25],
    [0.78, 2.6, -0.2],
    [0.15, 2.7, 0.72],
    [-0.2, 3.6, -0.15],
  ];
  puffs.forEach((p, idx) => {
    const rad = 0.78 + r() * 0.34;
    kit.mesh(g, new THREE.SphereGeometry(rad, 12, 10), greens[idx % greens.length] ?? '#2f5d38', p, { ink: 22 });
  });
}

function shophouse(kit: WorldKit, parent: THREE.Object3D, pos: Vec3, w: number, h: number, d: number, rotY: number, seed: number): void {
  const r = mulberry32(seed);
  const g = new THREE.Group();
  g.position.set(...pos);
  g.rotation.y = rotY;
  parent.add(g);
  kit.box(g, [w, h, d], [0, h / 2, 0], '#e8dcc2', { ink: 20 });
  kit.box(g, [w + 0.15, 0.35, d + 0.15], [0, 0.175, 0], '#686058', { ink: 18 });
  kit.box(g, [w + 0.35, 0.14, d + 0.35], [0, h + 0.07, 0], '#d4c4a2', { ink: 18 });
  kit.hipRoof(g, w + 0.7, d + 0.7, h * 0.45, [0, h + 0.14, 0], '#8b3224');
  const cols = Math.max(2, Math.floor(w / 1.7));
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (w / cols) * (i + 0.5);
    const lit = r() < 0.75;
    kit.box(g, [0.68, 1.25, 0.05], [x, h * 0.58, d / 2 + 0.03], lit ? kit.lit('#ffc972') : '#293042', { ink: 18, shadow: false });
    for (const s of [-1, 1] as const) {
      kit.box(g, [0.28, 1.3, 0.05], [x + s * 0.48, h * 0.58, d / 2 + 0.04], '#2c5442', { ink: 16 });
    }
    if (lit) kit.glow(g, '#ffb85a', 1.4, [x, h * 0.58, d / 2 + 0.25], 0.3);
  }
}

// ── Clock Dial Builder (with authentic Watchmaker's Four "IIII") ────────────

const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'] as const;

function dialPaint(opts: { highlightIIII?: boolean; highlightVIII?: boolean; symmetryBeam?: boolean }): Paint {
  return (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.45;
    c.fillStyle = '#f5ecd4';
    c.fillRect(0, 0, w, h);

    const rim = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.05);
    rim.addColorStop(0, '#fcf6e4');
    rim.addColorStop(0.84, '#ece0c0');
    rim.addColorStop(1, '#cfbd92');
    c.fillStyle = rim;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = '#241c18';
    c.lineWidth = w * 0.02;
    c.beginPath();
    c.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = w * 0.007;
    c.beginPath();
    c.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    c.stroke();

    if (opts.symmetryBeam) {
      const a4 = ((4 / 12) * Math.PI * 2) - Math.PI / 2;
      const a8 = ((8 / 12) * Math.PI * 2) - Math.PI / 2;
      const p4x = cx + Math.cos(a4) * r * 0.74;
      const p4y = cy + Math.sin(a4) * r * 0.74;
      const p8x = cx + Math.cos(a8) * r * 0.74;
      const p8y = cy + Math.sin(a8) * r * 0.74;
      c.strokeStyle = 'rgba(217, 136, 20, 0.92)';
      c.lineWidth = w * 0.014;
      c.setLineDash([14, 10]);
      c.beginPath();
      c.moveTo(p8x, p8y);
      c.lineTo(p4x, p4y);
      c.stroke();
      c.setLineDash([]);
    }

    for (let m = 0; m < 60; m++) {
      const a = (m / 60) * Math.PI * 2 - Math.PI / 2;
      const major = m % 5 === 0;
      const r0 = r * (major ? 0.875 : 0.91);
      const r1 = r * 0.94;
      c.strokeStyle = '#241c18';
      c.lineWidth = major ? w * 0.011 : w * 0.004;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
    }

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ROMAN.forEach((glyph, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const nr = r * 0.75;
      const x = cx + Math.cos(a) * nr;
      const y = cy + Math.sin(a) * nr;
      const glow = (i === 4 && opts.highlightIIII) || (i === 8 && opts.highlightVIII);
      if (glow) {
        const gg = c.createRadialGradient(x, y, 4, x, y, r * 0.23);
        gg.addColorStop(0, 'rgba(255, 204, 64, 0.95)');
        gg.addColorStop(0.58, 'rgba(251, 175, 24, 0.5)');
        gg.addColorStop(1, 'rgba(251, 175, 24, 0)');
        c.fillStyle = gg;
        c.beginPath();
        c.arc(x, y, r * 0.23, 0, Math.PI * 2);
        c.fill();
      }
      c.save();
      c.translate(x, y);
      c.font = `900 ${Math.round(w * (i === 4 || i === 8 ? 0.088 : 0.078))}px ${ERA_FONT.editorial}`;
      c.fillStyle = glow ? '#9a2410' : '#241c18';
      c.fillText(glyph, 0, 0);
      if (glow) {
        c.strokeStyle = '#d97706';
        c.lineWidth = w * 0.006;
        c.strokeRect(-r * 0.145, -r * 0.095, r * 0.29, r * 0.19);
      }
      c.restore();
    });

    c.fillStyle = '#c89b3c';
    c.beginPath();
    c.arc(cx, cy, r * 0.06, 0, Math.PI * 2);
    c.fill();
  };
}

function buildClockFace(
  kit: WorldKit,
  parent: THREE.Object3D,
  radius: number,
  pos: Vec3,
  opts: { highlightIIII?: boolean; highlightVIII?: boolean; symmetryBeam?: boolean; rotY?: number } = {},
): (frame: number) => void {
  const grp = new THREE.Group();
  grp.position.set(...pos);
  if (opts.rotY) grp.rotation.y = opts.rotY;
  parent.add(grp);

  const dialMat = new THREE.MeshBasicMaterial({ map: kit.canvas(1024, 1024, dialPaint(opts)), toneMapped: false });
  kit.track(dialMat);
  kit.mesh(grp, new THREE.CircleGeometry(radius, 48), dialMat, [0, 0, 0.02], { ink: false, shadow: false });
  const brass = kit.track(new THREE.MeshToonMaterial({ color: '#d8a63c', gradientMap: kit.gradient }));
  kit.mesh(grp, new THREE.TorusGeometry(radius, radius * 0.068, 12, 48), brass, [0, 0, 0.02], { ink: 24, shadow: false });

  const hourPivot = new THREE.Group();
  hourPivot.position.set(0, 0, 0.05);
  grp.add(hourPivot);
  kit.box(hourPivot, [radius * 0.075, radius * 0.5, 0.02], [0, radius * 0.22, 0], '#1e1918', { ink: false });

  const minPivot = new THREE.Group();
  minPivot.position.set(0, 0, 0.065);
  grp.add(minPivot);
  kit.box(minPivot, [radius * 0.045, radius * 0.76, 0.02], [0, radius * 0.34, 0], '#241e1c', { ink: false });

  return (frame: number) => {
    const tick = frame * 0.012;
    hourPivot.rotation.z = 2.05 - tick * 0.08;
    minPivot.rotation.z = -1.1 - tick;
  };
}

/** Sleek tapered 4-gonjong Minangkabau Bagonjong roof silhouette. */
function buildGonjongRoof(kit: WorldKit, parent: THREE.Object3D, yBase: number): void {
  const roof = new THREE.Group();
  roof.position.set(0, yBase, 0);
  parent.add(roof);

  const roofMat = kit.toon('#8e261c');
  const darkRoof = kit.toon('#6e1a12');
  const trimGold = kit.toon('#d8a638');

  // Tier 1: Wide overhanging eaves with carved golden Minangkabau listplank trim
  kit.box(roof, [4.65, 0.16, 4.65], [0, 0.08, 0], '#c99938', { ink: 22 });
  kit.hipRoof(roof, 4.75, 4.75, 1.05, [0, 0.16, 0], '#7a1f16');

  // Tier 2: Pinched, tapering central pitched core + smaller upper hipped terrace
  kit.mesh(roof, new THREE.CylinderGeometry(1.15, 2.25, 1.05, 4), darkRoof, [0, 1.25, 0], { rot: [0, Math.PI / 4, 0], ink: 22 });
  kit.box(roof, [2.75, 0.14, 2.75], [0, 1.78, 0], '#c99938', { ink: 20 });

  // Tier 3: Sleek curved crescent-ridge Gonjong horn blade (thin front-to-back, wide curving horn sweep!)
  const ridgeShape = new THREE.Shape();
  ridgeShape.moveTo(-1.35, 0);
  ridgeShape.quadraticCurveTo(0, 0.45, 1.35, 0);
  ridgeShape.quadraticCurveTo(1.8, 0.95, 2.38, 2.15); // graceful upturned right tip
  ridgeShape.lineTo(1.96, 2.2);
  ridgeShape.quadraticCurveTo(0.9, 0.85, 0, 1.15);  // concave saddle swoop to center
  ridgeShape.quadraticCurveTo(-0.9, 0.85, -1.96, 2.2);
  ridgeShape.lineTo(-2.38, 2.15); // graceful upturned left tip
  ridgeShape.quadraticCurveTo(-1.8, 0.95, -1.35, 0);

  const bladeGeo = kit.track(new THREE.ExtrudeGeometry(ridgeShape, { depth: 0.46, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }));
  bladeGeo.translate(0, 0, -0.23);

  // Two thin intersecting curved saddle blades -> authentic pointed Minang 4-horn silhouette!
  kit.mesh(roof, bladeGeo, roofMat, [0, 1.82, 0], { ink: 24 });
  const bladeCross = bladeGeo.clone();
  kit.track(bladeCross);
  kit.mesh(roof, bladeCross, roofMat, [0, 1.82, 0], { rot: [0, Math.PI / 2, 0], ink: 24 });

  // Ornate golden tips on all 4 gonjong peaks + central stepped finial spire
  for (const [gx, gz] of [[-2.18, 0], [2.18, 0], [0, -2.18], [0, 2.18]] as const) {
    kit.cyl(roof, 0.03, 0.12, 0.42, [gx, 4.18, gz], trimGold, { seg: 8 });
    kit.mesh(roof, new THREE.SphereGeometry(0.1, 10, 8), trimGold, [gx, 4.44, gz], { ink: 18 });
  }
  kit.cyl(roof, 0.1, 0.24, 1.05, [0, 3.25, 0], trimGold, { seg: 10 });
  kit.mesh(roof, new THREE.SphereGeometry(0.19, 12, 10), trimGold, [0, 3.85, 0], { ink: 20 });
}

/** Architectural 26m Jam Gadang monument with stepped base stairs, arched shutter windows, observation balcony & curved Bagonjong roof. */
function buildJamGadangMonument(kit: WorldKit, g: THREE.Object3D, highlightIIII = true): (frame: number) => void {
  const tower = new THREE.Group();
  g.add(tower);

  const stucco = kit.toon('#ffffff', { map: kit.canvas(512, 1024, limestonePaint('#efe5cf', 201), { repeat: [1, 3] }) });
  const stoneTrim = '#8f867a';
  const cornice = '#cfc1a6';

  // Stepped masonry plaza terrace + 3 front approach steps + corner stone bollards
  kit.box(tower, [6.2, 0.36, 6.2], [0, 0.18, 0], stoneTrim, { ink: 22 });
  kit.box(tower, [5.1, 0.42, 5.1], [0, 0.57, 0], '#a89e90', { ink: 22 });
  for (const s of [-1, 1]) {
    kit.cyl(tower, 0.16, 0.2, 0.85, [s * 2.4, 0.8, 2.65], cornice, { seg: 10 });
    kit.mesh(tower, new THREE.SphereGeometry(0.19, 10, 8), cornice, [s * 2.4, 1.28, 2.65], { ink: 18 });
  }

  // Base portal chamber (`y = 0.78..4.8`)
  kit.box(tower, [3.75, 4.0, 3.75], [0, 2.78, 0], stucco, { ink: 22 });
  kit.box(tower, [4.15, 0.28, 4.15], [0, 4.85, 0], cornice, { ink: 22 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box(tower, [0.42, 4.05, 0.42], [sx * 1.72, 2.78, sz * 1.72], stoneTrim, { ink: 20 });
    }
  }
  // Teak arched colonial entrance doors + carved keystone + "1926 · FORT DE KOCK" chiselled plaque
  kit.box(tower, [1.55, 2.35, 0.12], [0, 1.98, 1.85], '#5a3a22', { ink: 20 });
  kit.box(tower, [1.75, 0.24, 0.18], [0, 3.22, 1.86], cornice, { ink: 20 });
  kit.box(tower, [0.06, 2.2, 0.06], [0, 1.95, 1.9], '#2c1e14', { ink: false });
  const plaque = carvedStonePaint('1926 · FORT DE KOCK', { seed: 5 });
  platePlane(kit, tower, plaque, [1.65, 0.36], [0, 4.02, 1.9], { glow: 0.28 });

  // Tiered limestone shaft (`y = 5.0..11.8`) with waist cornices & shuttered louvered windows
  kit.box(tower, [3.15, 6.8, 3.15], [0, 8.4, 0], stucco, { ink: 22 });
  for (const wy of [7.2, 9.6]) {
    kit.box(tower, [3.42, 0.18, 3.42], [0, wy, 0], cornice, { ink: 20 });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box(tower, [0.36, 6.9, 0.36], [sx * 1.5, 8.4, sz * 1.5], stoneTrim, { ink: 18 });
    }
  }
  // Louvered colonial windows with dark timber frames, green wooden shutters & projecting stone sills
  for (const wy of [6.0, 8.4, 10.6]) {
    kit.box(tower, [0.68, 1.25, 0.1], [0, wy, 1.58], '#262b3d', { ink: 20 });
    kit.box(tower, [0.84, 0.12, 0.18], [0, wy - 0.65, 1.62], cornice, { ink: 18 });
    kit.box(tower, [0.86, 0.14, 0.16], [0, wy + 0.66, 1.61], cornice, { ink: 18 });
    for (const s of [-1, 1] as const) {
      kit.box(tower, [0.24, 1.18, 0.06], [s * 0.46, wy, 1.6], '#2e5842', { ink: 18 });
    }
  }

  // Iconic cantilevered Observation Balcony (`y = 11.8..12.55`) with corbels, balustrade & 4 warm lanterns!
  kit.box(tower, [4.2, 0.24, 4.2], [0, 11.9, 0], cornice, { ink: 22 });
  for (const c of [-1.4, -0.5, 0.5, 1.4]) {
    kit.box(tower, [0.22, 0.36, 0.45], [c, 11.65, 1.85], stoneTrim, { ink: 18 });
  }
  kit.box(tower, [4.1, 0.12, 0.12], [0, 12.52, 2.02], stoneTrim, { ink: 20 });
  for (const bx of [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8]) {
    kit.cyl(tower, 0.055, 0.065, 0.55, [bx, 12.24, 2.02], cornice, { seg: 8 });
  }
  for (const sx of [-1, 1]) {
    kit.box(tower, [0.16, 0.22, 0.16], [sx * 2.0, 12.7, 2.0], kit.lit('#ffd47a'), { ink: 18 });
    kit.glow(tower, '#ffc25c', 1.5, [sx * 2.0, 12.75, 2.05], 0.85);
  }

  // Belfry Clock Chamber (`y = 12.3..15.8`)
  kit.box(tower, [3.55, 3.5, 3.55], [0, 14.0, 0], '#f6eedb', { ink: 24 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box(tower, [0.36, 3.55, 0.36], [sx * 1.68, 14.0, sz * 1.68], cornice, { ink: 20 });
    }
  }

  // 3 visible Clock Dials (front + left/right) for sculptural 3/4 views
  const updateFront = buildClockFace(kit, tower, 1.24, [0, 14.0, 1.8], { highlightIIII });
  const updateRight = buildClockFace(kit, tower, 1.18, [1.8, 14.0, 0], { highlightIIII, rotY: Math.PI / 2 });
  const updateLeft = buildClockFace(kit, tower, 1.18, [-1.8, 14.0, 0], { highlightIIII, rotY: -Math.PI / 2 });

  // Multi-tiered Curved Bagonjong Horn Roof (`y = 15.75..19.4`)
  buildGonjongRoof(kit, tower, 15.75);

  return (frame: number) => {
    updateFront(frame);
    updateRight(frame);
    updateLeft(frame);
  };
}

/** Open-frame spoked 3D brass gear wheel so light passes right between the spokes! */
function spokedBrassGear(
  kit: WorldKit,
  parent: THREE.Object3D,
  radius: number,
  teeth: number,
  thickness: number,
  color: string,
  pos: Vec3,
): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(...pos);
  parent.add(grp);

  const mat = kit.track(new THREE.MeshToonMaterial({ color, gradientMap: kit.gradient }));
  const bronze = kit.track(new THREE.MeshToonMaterial({ color: '#8a5d1c', gradientMap: kit.gradient }));

  // Hollow annular rim ring using Shape with hole
  const rim = new THREE.Shape();
  rim.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, radius * 0.72, 0, Math.PI * 2, true);
  rim.holes.push(inner);
  const rimGeo = kit.track(new THREE.ExtrudeGeometry(rim, { depth: thickness, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 32 }));
  rimGeo.translate(0, 0, -thickness / 2);
  kit.mesh(grp, rimGeo, mat, [0, 0, 0], { ink: 22 });

  // 6 radial brass spokes + central hub + steel axle
  for (let s = 0; s < 6; s++) {
    const a = (s / 6) * Math.PI * 2;
    const len = radius * 0.74;
    kit.box(grp, [radius * 0.11, len, thickness * 0.65], [Math.cos(a) * len * 0.48, Math.sin(a) * len * 0.48, 0], bronze, { rot: [0, 0, a - Math.PI / 2], ink: 18 });
  }
  kit.mesh(grp, new THREE.CylinderGeometry(radius * 0.24, radius * 0.24, thickness * 1.25, 18), bronze, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ink: 20 });
  kit.mesh(grp, new THREE.CylinderGeometry(radius * 0.09, radius * 0.09, thickness * 2.1, 14), '#2d2520', [0, 0, 0], { rot: [Math.PI / 2, 0, 0], ink: 18 });

  // Precision milled gear teeth around outer circumference
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tW = (2 * Math.PI * radius) / (teeth * 2.05);
    kit.mesh(grp, new THREE.BoxGeometry(tW, radius * 0.2, thickness * 0.92), mat, [Math.cos(a) * (radius + radius * 0.08), Math.sin(a) * (radius + radius * 0.08), 0], { rot: [0, 0, a - Math.PI / 2], ink: 18 });
  }
  return grp;
}

// ── Worlds ──────────────────────────────────────────────────────────────────

function buildPlazaGadang(kit: WorldKit, phase: ColorPhase): WorldScene {
  const g = new THREE.Group();
  const cobble = kit.toon('#ffffff', { map: kit.canvas(512, 512, cobblePaint(31, '#8c847a'), { repeat: [60, 60] }) });
  kit.mesh(g, new THREE.PlaneGeometry(360, 360), cobble, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  kit.cyl(g, 6.8, 7.1, 0.14, [0, 0.07, 0], '#b6ad9d', { seg: 32 });

  const updateDial = buildJamGadangMonument(kit, g, true);

  // Bukittinggi colonial shophouses framing plaza left & right + lush park trees & lamps
  shophouse(kit, g, [-8.5, 0, -5.5], 5.2, 4.4, 4.0, 0.35, 101);
  shophouse(kit, g, [8.8, 0, -5.0], 5.6, 4.6, 4.2, -0.38, 102);
  parkTree(kit, g, [-5.6, 0, 3.2], 1.15, 201);
  parkTree(kit, g, [5.8, 0, 3.6], 1.22, 202);
  parkTree(kit, g, [-7.2, 0, -0.8], 1.35, 203);
  parkTree(kit, g, [7.6, 0, -0.5], 1.3, 204);

  // Ornamental plaza iron fence + raised flowerbeds
  for (const s of [-1, 1] as const) {
    kit.box(g, [3.6, 0.48, 0.55], [s * 5.0, 0.24, 5.2], '#7f776b', { ink: 20 });
    kit.box(g, [3.3, 0.25, 0.35], [s * 5.0, 0.52, 5.2], '#2d5836', { ink: 18 });
    plazaLamp(kit, g, s * 3.5, 5.2, s);
  }

  foregroundLeaves(kit, g, { base: [-9.2, 5.2, 13.5], dir: [0.65, -0.3, 0.05], count: 7, size: 1.2, spread: 0.9, seed: 11, color: '#27442a' });
  const updateBirds = birdFlock(kit, g, { center: [-1.2, 16.5, -16], radius: 8, count: 7, seed: 44, size: 0.45, speed: 0.016 });
  const dust = kit.dust(g, [-4, 0.5, 1], [8, 16, 8], 160, '#ffd8a0', 0.032, 19);

  const cs = COLOR_SCRIPT[phase];
  const sunsetSky = skyPaint({
    stops: [[0, '#1f1642'], [0.3, '#583068'], [0.54, '#b85b6a'], [0.76, '#f49a52'], [1, '#6a4854']],
    sun: { x: 0.24, y: 0.65, r: 0.045, color: 'rgba(255,222,148,0.95)' },
    clouds: { color: 'rgba(255,175,120,0.52)', count: 16, y: 0.42 },
    ridges: BUKIT_BARISAN('#4a2d4e', '#2c1e38'),
    seed: 12,
  });
  kit.backdrop(g, [340, 130], [0, 44, -95], sunsetSky, 3);
  lightRig(kit, g, { sky: '#362658', ground: '#241a36', hemi: 1.85, key: '#ffa855', keyIntensity: 3.1, keyPos: [-12, 16, 14], keyTarget: [0, 8, 1.5], extent: 22, phase });

  return {
    id: 'plazaGadang',
    group: g,
    anchors: { dindaPlaza: v3(0.45, 0.14, 5.4) },
    background: new THREE.Color(cs.haze),
    fog: new THREE.Fog(cs.haze, 24, 135),
    update: ({ frame }) => {
      updateDial(frame);
      updateBirds(frame);
      dust(frame);
    },
  };
}

function buildKonstruksi1926(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const dirt = kit.toon('#ffffff', { map: kit.canvas(512, 512, speckle('#7a654a', ['#64523b', '#8e7758', '#524230'], 71), { repeat: [70, 70] }) });
  kit.mesh(g, new THREE.PlaneGeometry(320, 320), dirt, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });

  // Lower stone tower masonry under construction with real limestone plaster & arched opening
  const stucco = kit.toon('#ffffff', { map: kit.canvas(512, 512, limestonePaint('#ddd0b4', 202), { repeat: [2, 2] }) });
  kit.box(g, [4.6, 5.4, 4.0], [0, 2.7, -3.2], stucco, { ink: 22 });
  kit.box(g, [5.0, 0.7, 4.4], [0, 0.35, -3.2], '#8e8270', { ink: 22 });
  kit.box(g, [1.5, 2.1, 0.15], [0, 1.4, -1.16], '#4a3220', { ink: 20 });

  // Timber scaffolding poles + diagonal cross-braces + wooden construction ladder
  const beamMat = kit.toon('#ffffff', { map: kit.canvas(256, 256, woodPlanks('#7a5434', 18)) });
  for (const x of [-2.4, -1.15, 1.15, 2.4]) {
    kit.box(g, [0.16, 5.2, 0.16], [x, 2.6, -1.05], beamMat, { ink: 20 });
  }
  for (const y of [1.6, 3.2, 4.6]) {
    kit.box(g, [5.4, 0.14, 0.42], [0, y, -1.12], beamMat, { ink: 20 });
  }
  kit.box(g, [0.1, 3.8, 0.1], [-1.75, 2.4, -1.02], beamMat, { rot: [0, 0, 0.55], ink: 16 });
  kit.box(g, [0.1, 3.8, 0.1], [1.75, 2.4, -1.02], beamMat, { rot: [0, 0, -0.55], ink: 16 });

  // Stacked cut limestone blocks + timber crates + hanging pulley lantern
  kit.box(g, [0.85, 0.52, 0.55], [-1.55, 0.26, -0.45], '#afa28c', { ink: 20 });
  kit.box(g, [0.65, 0.42, 0.48], [-1.5, 0.73, -0.48], '#c4b8a0', { ink: 20 });
  kit.box(g, [0.9, 0.55, 0.6], [1.55, 0.275, -0.55], '#9b7444', { ink: 20 });
  kit.box(g, [0.55, 0.42, 0.45], [1.45, 0.76, -0.55], '#b88c52', { ink: 18 });

  // Colonial Board — crisp serif typography safely below ShotChip
  const boardStyle = {
    bg: '#1c2420',
    fg: '#f4ead0',
    rim: '#b68a3a',
    family: ERA_FONT.colonial,
    border: 'double' as const,
    rivets: true,
    rule: true,
    spacing: 0.08,
  };
  plateBacking(kit, g, [1.95, 0.9], [0, 2.38, -0.98], '#4a321e');
  platePlane(kit, g, platePaint([{ t: 'FORT DE KOCK', k: 0.9 }, { t: 'JAM GADANG · 1926', k: 1.15, color: '#f6cf6e' }], boardStyle), [1.85, 0.82], [0, 2.38, -0.94], { glow: 0.3 });

  const dust = kit.dust(g, [-3, 0.2, -1], [6, 4, 4], 130, '#f2deb4', 0.025, 29);
  kit.backdrop(g, [300, 110], [0, 38, -90], skyPaint({ stops: [[0, '#8ba0b4'], [0.6, '#e2d4b8'], [1, '#c0ae90']], ridges: BUKIT_BARISAN('#707c74', '#5c665a'), seed: 22 }), 3);
  lightRig(kit, g, { sky: '#e2dac8', ground: '#5a4a34', hemi: 1.45, key: '#ffdfaa', keyIntensity: 2.2, keyPos: [10, 12, 8], keyTarget: [0, 1.4, -1], extent: 14, phase: 'colonialSepia' });

  return {
    id: 'konstruksi1926',
    group: g,
    anchors: { yazid: v3(-0.28, 0, 0.25), tukang: v3(0.68, 0, 0.05) },
    background: new THREE.Color('#c8baa0'),
    fog: new THREE.Fog('#d8ccb8', 14, 100),
    update: ({ frame }) => dust(frame),
  };
}

function buildTamanRumor(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const cobble = kit.toon('#ffffff', { map: kit.canvas(512, 512, cobblePaint(51, '#706c78'), { repeat: [60, 60] }) });
  kit.mesh(g, new THREE.PlaneGeometry(300, 300), cobble, [0, 0, 0], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });

  // Towering Jam Gadang glowing in twilight mist right behind the park bench!
  const bgTower = new THREE.Group();
  bgTower.position.set(0.1, 0, -14.5);
  bgTower.scale.setScalar(0.75);
  g.add(bgTower);
  const updateBgDial = buildJamGadangMonument(kit, bgTower, true);

  // Flanking trees & cozy park bench + glowing wrought-iron lamp
  parkTree(kit, g, [-2.4, 0, -3.2], 0.95, 301);
  parkTree(kit, g, [2.5, 0, -3.5], 1.05, 302);
  kit.box(g, [1.85, 0.14, 0.55], [0, 0.45, -1.6], '#624430', { ink: 20 });
  kit.box(g, [1.85, 0.42, 0.1], [0, 0.72, -1.84], '#624430', { ink: 18 });
  for (const s of [-0.72, 0.72]) kit.box(g, [0.1, 0.42, 0.45], [s, 0.21, -1.6], '#2e2b36', { ink: 16 });
  plazaLamp(kit, g, -1.35, -1.5, -1);

  foregroundLeaves(kit, g, { base: [-2.1, 2.2, 2.2], dir: [0.85, -0.25, 0], count: 7, size: 0.75, spread: 0.65, seed: 63, color: '#273a42' });

  kit.backdrop(g, [280, 110], [0, 36, -85], skyPaint({ stops: [[0, '#1c2444'], [0.55, '#46527c'], [1, '#686e8c']], clouds: { color: 'rgba(180,196,230,0.35)', count: 14, y: 0.35 }, ridges: BUKIT_BARISAN('#3a4262', '#262b46'), seed: 33 }), 3);
  lightRig(kit, g, { sky: '#4e5d8c', ground: '#24223a', hemi: 1.45, key: '#b8c8f0', keyIntensity: 2.05, keyPos: [-8, 12, 8], keyTarget: [0, 1.0, 0], extent: 14, phase: 'twilightRumor' });

  return {
    id: 'tamanRumor',
    group: g,
    anchors: { warga1: v3(-0.62, 0, -0.45), warga2: v3(-0.08, 0, -0.5), dindaWalk: v3(0.45, 0, 0.2) },
    background: new THREE.Color('#343c5c'),
    fog: new THREE.Fog('#444c6e', 18, 95),
    update: ({ frame }) => updateBgDial(frame),
  };
}

function buildChamberCutaway(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  const floorMat = kit.toon('#ffffff', { map: kit.canvas(512, 512, woodPlanks('#5c3e26', 81), { repeat: [4, 4] }) });
  kit.mesh(g, new THREE.PlaneGeometry(10, 10), floorMat, [0, 0, -1], { rot: [-Math.PI / 2, 0, 0], ink: false, shadow: false });
  kit.box(g, [9, 6, 0.3], [0, 3, -3.2], '#4b3b30', { ink: 20 });
  kit.box(g, [0.3, 6, 9], [-3.8, 3, -1], '#3d3028', { ink: 20 });
  kit.box(g, [0.3, 6, 9], [3.8, 3, -1], '#3d3028', { ink: 20 });
  kit.box(g, [9, 0.3, 9], [0, 5.8, -1], '#2d221c', { ink: false });

  // Heavy oak structural rafters + hanging iron clockwork weight cylinders
  kit.box(g, [6.5, 0.22, 0.22], [0, 3.65, -1.75], '#3d2817', { ink: 18 });
  for (const wx of [-1.25, -0.85]) {
    kit.cyl(g, 0.015, 0.015, 2.2, [wx, 2.55, -2.0], '#222024', { seg: 6 });
    kit.cyl(g, 0.11, 0.11, 0.65, [wx, 1.35, -2.0], '#3c3c44', { seg: 12 });
  }

  // Open-spoked interlocking 3D brass gears!
  const g1 = spokedBrassGear(kit, g, 0.72, 16, 0.14, '#dca638', [-0.45, 1.9, -1.38]);
  const g2 = spokedBrassGear(kit, g, 0.48, 12, 0.14, '#c8922c', [0.58, 1.56, -1.42]);
  const g3 = spokedBrassGear(kit, g, 0.38, 10, 0.12, '#e6b852', [-0.26, 0.94, -1.32]);
  const g4 = spokedBrassGear(kit, g, 0.54, 12, 0.12, '#b8822a', [-1.25, 1.08, -1.48]);

  // Swinging Giant Brass Pendulum Rod & Disc visible behind the spoked gears!
  const pendPivot = new THREE.Group();
  pendPivot.position.set(0.12, 3.65, -1.75);
  g.add(pendPivot);
  kit.cyl(pendPivot, 0.035, 0.035, 2.8, [0, -1.4, 0], '#2a221c', { seg: 8 });
  const bobMat = kit.track(new THREE.MeshToonMaterial({ color: '#f2c456', gradientMap: kit.gradient }));
  kit.mesh(pendPivot, new THREE.CylinderGeometry(0.36, 0.36, 0.12, 24), bobMat, [0, -2.82, 0], { rot: [Math.PI / 2, 0, 0], ink: 24 });

  // Rotterdam brass maker plaque safely clear above the cogwheel teeth and right of pendulum rod
  plateBacking(kit, g, [1.52, 0.36], [0.58, 3.16, -2.98], '#2c1e14');
  platePlane(
    kit,
    g,
    platePaint([{ t: 'VORTMANN · ROTTERDAM', k: 0.9 }, { t: 'ANNO 1926', k: 1.0, color: '#f6cf6e' }], {
      bg: '#2b2016',
      fg: '#f3e5c0',
      rim: '#cfa042',
      family: ERA_FONT.editorial,
      border: 'double',
      rivets: true,
    }),
    [1.44, 0.3],
    [0.58, 3.16, -2.93],
    { glow: 0.3 },
  );

  const shaft = kit.shaft(g, [-2.4, 4.2, -2.4], [0.2, 0.3, -0.8], 1.35, '#ffcf76', 0.24);
  const motes = kit.motes(g, { from: [-2.4, 4.2, -2.4], to: [0.2, 0.3, -0.8], radius: 1.35, count: 190, color: '#ffe49e', seed: 91 });
  kit.point(g, '#ffb850', 2.5, 8, [0, 2.3, -0.3]);
  lightRig(kit, g, { sky: '#ffd48a', ground: '#302028', hemi: 1.18, key: '#ffbe66', keyIntensity: 2.35, keyPos: [-5, 6, 4], keyTarget: [0, 1.5, -1.2], extent: 8, phase: 'brassChamber' });

  return {
    id: 'chamberCutaway',
    group: g,
    anchors: { tukangJam: v3(0.75, 0, -0.25) },
    background: new THREE.Color('#1f1618'),
    fog: new THREE.Fog('#2d2022', 8, 28),
    update: ({ frame }) => {
      g1.rotation.z = frame * 0.022;
      g2.rotation.z = -frame * 0.03 + 0.16;
      g3.rotation.z = frame * 0.036 + 0.1;
      g4.rotation.z = -frame * 0.025 + 0.2;
      pendPivot.rotation.z = Math.sin(frame * 0.12) * 0.28;
      shaft.material.opacity = 0.18 + 0.04 * Math.sin(frame * 0.08);
      motes(frame);
    },
  };
}

function buildDialClose(kit: WorldKit): WorldScene {
  const g = new THREE.Group();
  // Carved belfry housing & golden roof cornice right behind the sunlit clock face!
  kit.box(g, [5.6, 5.4, 1.4], [0, 1.8, -0.75], '#f5ecd4', { ink: 24 });
  kit.box(g, [6.2, 0.45, 1.8], [0, 4.5, -0.6], '#8e261c', { ink: 22 });
  kit.box(g, [6.0, 0.22, 1.7], [0, 4.2, -0.58], '#d4a33a', { ink: 20 });
  const updateDial = buildClockFace(kit, g, 1.68, [0, 1.82, 0], { highlightIIII: true, highlightVIII: true, symmetryBeam: true });

  const daySky = skyPaint({
    stops: [[0, '#5094d8'], [0.58, '#a6d2ee'], [1, '#dcebf2']],
    clouds: { color: 'rgba(255,255,255,0.88)', count: 22, y: 0.3 },
    ridges: BUKIT_BARISAN('#789890', '#60846e'),
    seed: 99,
  });
  kit.backdrop(g, [190, 80], [0, 16, -65], daySky, 2);
  lightRig(kit, g, { sky: '#cce2f6', ground: '#5e6d74', hemi: 1.65, key: '#fff2d8', keyIntensity: 2.3, keyPos: [-6, 10, 12], keyTarget: [0, 1.8, 0], extent: 10, phase: 'daylightSymmetry' });

  return {
    id: 'dialClose',
    group: g,
    anchors: {},
    background: new THREE.Color('#a6d2ee'),
    fog: new THREE.Fog('#c6dfee', 20, 100),
    update: ({ frame }) => updateDial(frame),
  };
}

const BUILDERS: Record<WorldId, (kit: WorldKit) => WorldScene> = {
  plazaGadang: (kit) => buildPlazaGadang(kit, 'triumphDusk'),
  konstruksi1926: buildKonstruksi1926,
  tamanRumor: buildTamanRumor,
  chamberCutaway: buildChamberCutaway,
  dialClose: buildDialClose,
};

export function buildWorld(id: WorldId, kit: WorldKit): WorldScene {
  return BUILDERS[id](kit);
}
