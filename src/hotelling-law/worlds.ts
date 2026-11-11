import * as THREE from 'three';
import { type WorldFrame, WorldKit } from '../persis/worlds';
import { platePlane } from '../cikajang/signage';
import type { ColorPhase, WorldId } from './story';
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

function neonSignPaint(title: string, sub: string, bg: string, border: string): Paint {
  return (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = border;
    c.lineWidth = 14;
    c.strokeRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.font = '900 68px sans-serif';
    c.textAlign = 'center';
    c.fillText(title, w / 2, h / 2 + 10);
    c.font = 'bold 30px sans-serif';
    c.fillStyle = border;
    c.fillText(sub, w / 2, h - 26);
  };
}

function roadPaint(): Paint {
  return (c, w, h) => {
    c.fillStyle = '#1e293b';
    c.fillRect(0, 0, w, h);
    // Road texture specks
    c.fillStyle = '#334155';
    for (let i = 0; i < 400; i++) {
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Sidewalk curb line
    c.fillStyle = '#64748b';
    c.fillRect(0, 0, w, 28);
    c.fillStyle = '#94a3b8';
    c.fillRect(0, 24, w, 4);
  };
}

function sandPaint(): Paint {
  return (c, w, h) => {
    c.fillStyle = '#fef08a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fde047';
    for (let i = 0; i < 600; i++) {
      c.beginPath();
      c.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, Math.PI * 2);
      c.fill();
    }
  };
}

function chalkboardPaint(): Paint {
  return (c, w, h) => {
    c.fillStyle = '#0f291e'; // deep chalkboard green
    c.fillRect(0, 0, w, h);

    // Chalk smudges
    c.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let i = 0; i < 20; i++) {
      c.beginPath();
      c.ellipse(Math.random() * w, Math.random() * h, 60, 20, Math.random(), 0, Math.PI * 2);
      c.fill();
    }

    // Wooden frame border
    c.strokeStyle = '#78350f';
    c.lineWidth = 24;
    c.strokeRect(0, 0, w, h);

    // Chalk writings
    c.fillStyle = '#f8fafc';
    c.font = 'bold 36px sans-serif';
    c.textAlign = 'center';
    c.fillText("HOTELLING'S LAW (1929)", w / 2, 70);

    c.font = '22px sans-serif';
    c.fillStyle = '#93c5fd';
    c.fillText('Principle of Minimum Differentiation', w / 2, 110);

    // Coordinate line
    c.strokeStyle = '#fbbf24';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(80, 240);
    c.lineTo(w - 80, 240);
    c.stroke();

    // Endpoints [0, 1]
    c.fillStyle = '#ffffff';
    c.font = 'bold 22px monospace';
    c.fillText('0 (Ujung Kiri)', 180, 280);
    c.fillText('1 (Ujung Kanan)', w - 180, 280);
    c.fillText('Center (1/2)', w / 2, 280);

    // Store A and Store B labels
    c.fillStyle = '#38bdf8';
    c.font = 'bold 24px monospace';
    c.fillText('Toko A [Blue]', 220, 205);
    c.fillStyle = '#f43f5e';
    c.fillText('Toko B [Red]', w - 220, 205);

    // Equilibrium arrow towards center
    c.strokeStyle = '#facc15';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(340, 200);
    c.lineTo(w / 2 - 40, 200);
    c.moveTo(w - 340, 200);
    c.lineTo(w / 2 + 40, 200);
    c.stroke();
  };
}

// ── World Scenes ────────────────────────────────────────────────────────────

export function createCityWorld(phase: ColorPhase): WorldScene {
  const g = new THREE.Group();
  const kit = new WorldKit();
  const cfg = COLOR_SCRIPT[phase];

  const background = new THREE.Color(cfg.skyColor);
  const fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);

  // 1. Street Asphalt Floor
  const roadTex = kit.canvas(768, 512, roadPaint());
  const roadMat = new THREE.MeshToonMaterial({ map: roadTex });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 0);
  road.receiveShadow = true;
  g.add(road);

  // 2. Left Store (Indomaret - Blue Theme)
  const storeL = new THREE.Group();
  const storeMatL = new THREE.MeshToonMaterial({ color: '#0284c7' });
  const wallMat = new THREE.MeshToonMaterial({ color: '#f8fafc' });
  const glassMat = new THREE.MeshToonMaterial({ color: '#38bdf8', transparent: true, opacity: 0.85 });

  const bldgL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.0), wallMat);
  bldgL.position.set(0, 1.3, 0);
  storeL.add(bldgL);

  const glassL = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), glassMat);
  glassL.position.set(0, 1.0, 1.01);
  storeL.add(glassL);

  // Striped Awning (Blue & Red stripes)
  const canopyL = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.6), storeMatL);
  canopyL.position.set(0, 1.85, 1.25);
  canopyL.rotation.x = 0.2;
  storeL.add(canopyL);

  // Neon Sign
  platePlane(
    kit,
    storeL,
    neonSignPaint('INDOMARET', 'Buka 24 Jam', '#0284c7', '#facc15'),
    [1.6, 0.5],
    [0, 2.25, 1.02]
  );

  storeL.position.set(-1.8, 0, -0.6);
  g.add(storeL);

  // 3. Right Store (Alfamart - Red Theme)
  const storeR = new THREE.Group();
  const storeMatR = new THREE.MeshToonMaterial({ color: '#e11d48' });

  const bldgR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.0), wallMat);
  bldgR.position.set(0, 1.3, 0);
  storeR.add(bldgR);

  const glassR = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), glassMat);
  glassR.position.set(0, 1.0, 1.01);
  storeR.add(glassR);

  const canopyR = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.6), storeMatR);
  canopyR.position.set(0, 1.85, 1.25);
  canopyR.rotation.x = 0.2;
  storeR.add(canopyR);

  platePlane(
    kit,
    storeR,
    neonSignPaint('ALFAMART', 'Belanja Puas', '#e11d48', '#38bdf8'),
    [1.6, 0.5],
    [0, 2.25, 1.02]
  );

  storeR.position.set(1.8, 0, -0.6);
  g.add(storeR);

  // 4. Streetlamp in between
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 8), new THREE.MeshToonMaterial({ color: '#475569' }));
  lampPole.position.set(0, 1.6, -0.1);
  g.add(lampPole);

  const lampLight = new THREE.PointLight('#fef08a', 2.0, 6);
  lampLight.position.set(0, 3.1, 0.2);
  g.add(lampLight);

  return {
    id: 'cityNight',
    group: g,
    anchors: {
      leftStore: v3(-1.6, 0, 0),
      rightStore: v3(1.6, 0, 0),
      center: v3(0, 0, 0),
    },
    background,
    fog,
    update: () => {},
  };
}

export function createTheoryWorld(): WorldScene {
  const g = new THREE.Group();
  const kit = new WorldKit();
  const cfg = COLOR_SCRIPT.theorySlate;

  const background = new THREE.Color(cfg.skyColor);
  const fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);

  // Wooden Floor
  const floorMat = new THREE.MeshToonMaterial({ color: '#78350f' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), floorMat);
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);

  // Chalkboard
  const boardTex = kit.canvas(1024, 512, chalkboardPaint());
  const boardMat = new THREE.MeshToonMaterial({ map: boardTex });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), boardMat);
  board.position.set(0, 1.7, -0.8);
  g.add(board);

  // Warm Overhead Lamp
  const light = new THREE.PointLight('#fef3c7', 2.2, 7);
  light.position.set(0, 2.8, 0.5);
  g.add(light);

  return {
    id: 'theoryRoom',
    group: g,
    anchors: {
      board: v3(0, 1.7, -0.8),
      prof: v3(0.75, 0, 0.2),
    },
    background,
    fog,
    update: () => {},
  };
}

export function createBeachWorld(phase: ColorPhase): WorldScene {
  const g = new THREE.Group();
  const kit = new WorldKit();
  const cfg = COLOR_SCRIPT[phase];

  const background = new THREE.Color(cfg.skyColor);
  const fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);

  // 1. Sand Ground
  const sandTex = kit.canvas(512, 512, sandPaint());
  const sandMat = new THREE.MeshToonMaterial({ map: sandTex });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, 1.5);
  sand.receiveShadow = true;
  g.add(sand);

  // 2. Ocean Water at background
  const oceanMat = new THREE.MeshToonMaterial({ color: '#0284c7', transparent: true, opacity: 0.88 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(24, 10), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.05, -5.0);
  g.add(ocean);

  // 3. Center boundary post (Garis Tengah Pantai)
  const centerPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8),
    new THREE.MeshToonMaterial({ color: '#facc15' })
  );
  centerPole.position.set(0, 0.7, 0);
  g.add(centerPole);

  platePlane(
    kit,
    g,
    neonSignPaint('GARIS TENGAH', '50% | 50%', '#facc15', '#1e293b'),
    [0.9, 0.35],
    [0, 1.25, 0.05]
  );

  // 4. Blue Ice Cream Cart
  const cartBlue = new THREE.Group();
  const cartBodyB = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshToonMaterial({ color: '#0284c7' }));
  cartBodyB.position.set(0, 0.45, 0);
  cartBlue.add(cartBodyB);

  const wheelB1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), new THREE.MeshToonMaterial({ color: '#1e293b' }));
  wheelB1.rotation.z = Math.PI / 2;
  wheelB1.position.set(-0.35, 0.2, 0.32);
  cartBlue.add(wheelB1);

  const wheelB2 = wheelB1.clone();
  wheelB2.position.set(0.35, 0.2, 0.32);
  cartBlue.add(wheelB2);

  const umbrellaB = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.25, 12), new THREE.MeshToonMaterial({ color: '#38bdf8' }));
  umbrellaB.position.set(0, 1.15, 0);
  cartBlue.add(umbrellaB);

  cartBlue.position.set(-3.2, 0, 0.1);
  g.add(cartBlue);

  // 5. Red Ice Cream Cart
  const cartRed = new THREE.Group();
  const cartBodyR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshToonMaterial({ color: '#e11d48' }));
  cartBodyR.position.set(0, 0.45, 0);
  cartRed.add(cartBodyR);

  const wheelR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), new THREE.MeshToonMaterial({ color: '#1e293b' }));
  wheelR1.rotation.z = Math.PI / 2;
  wheelR1.position.set(-0.35, 0.2, 0.32);
  cartRed.add(wheelR1);

  const wheelR2 = wheelR1.clone();
  wheelR2.position.set(0.35, 0.2, 0.32);
  cartRed.add(wheelR2);

  const umbrellaR = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.25, 12), new THREE.MeshToonMaterial({ color: '#f43f5e' }));
  umbrellaR.position.set(0, 1.15, 0);
  cartRed.add(umbrellaR);

  cartRed.position.set(3.2, 0, 0.1);
  g.add(cartRed);

  return {
    id: 'beachSim',
    group: g,
    anchors: {
      leftCart: v3(-3.2, 0, 0.1),
      rightCart: v3(3.2, 0, 0.1),
      center: v3(0, 0, 0),
    },
    background,
    fog,
    update: (f: WorldFrame) => {
      // Animate blue cart advance during Shot 4 (f910 - f1125)
      if (f.frame >= 910 && f.frame < 1125) {
        const p = Math.min(1, Math.max(0, (f.frame - 910) / 140));
        cartBlue.position.x = -3.2 + p * 2.4; // move to -0.8
      } else if (f.frame >= 1125) {
        // In equilibrium shot (Shot 5), both carts stand at center line!
        cartBlue.position.x = -0.55;
        cartRed.position.x = 0.55;
      }
    },
  };
}
