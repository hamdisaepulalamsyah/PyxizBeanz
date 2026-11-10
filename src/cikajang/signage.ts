import * as THREE from 'three';
import { type WorldKit, mulberry32 } from '../persis/worlds';
import { ERA_FONT } from './fonts';

/**
 * Era-appropriate diegetic lettering for Cikajang (everything painted on walls, boards,
 * crates and stamps — never the subtitles). Every painter measures its text with
 * `ctx.measureText` and shrinks the font so the widest line stays inside `FIT` of the
 * canvas width, so a long word can never spill past its plate.
 *
 *  1930s colonial  → ERA_FONT.colonial   enamel plate, double border, brass rivets
 *  stone carvings  → ERA_FONT.editorial  recess shadow + lower rim highlight + moss
 *  BERAS crates    → ERA_FONT.stencil    stencil bridges, faded charcoal paint
 *  1980s PJKA      → ERA_FONT.industrial plain plate; DITUTUP = faded red ink stamp
 *  today's mural   → ERA_FONT.mural      tilted marker lettering, layered shadow, drips
 *  KAI 2022        → ERA_FONT.transit    white board, blue-orange stripe
 */

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Widest text run, as a fraction of the plate width. */
export const FIT = 0.86;

/** Set `ctx.font` for `family` at the largest size ≤ `px` that keeps `text` within `maxW`; returns the size used. */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, px: number, maxW: number, spacing = 0): number {
  ctx.letterSpacing = `${spacing}px`;
  ctx.font = `${weight} ${px}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    const orig = px;
    px = Math.max(8, Math.floor((px * maxW) / w));
    ctx.letterSpacing = `${(spacing * px) / orig}px`;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

export interface PlateLine {
  t: string;
  /** Relative height share (default 1). */
  k?: number;
  color?: string;
}

export interface PlateStyle {
  bg: string;
  fg: string;
  rim: string;
  family: string;
  weight?: string;
  /** Letter spacing as a fraction of the font size. */
  spacing?: number;
  border?: 'double' | 'single' | 'none';
  rivets?: boolean;
  /** Thin rule drawn under the first line. */
  rule?: boolean;
  /** Blue-orange KAI stripe along the top edge. */
  stripe?: readonly [string, string];
  seed?: number;
}

/** Enamel/painted plate: sheen, double border, brass rivets, lettering fitted to the plate. */
export function platePaint(lines: readonly PlateLine[], s: PlateStyle): Paint {
  return (c, w, h) => {
    c.fillStyle = s.bg;
    c.fillRect(0, 0, w, h);
    const sheen = c.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.1)');
    c.fillStyle = sheen;
    c.fillRect(0, 0, w, h);
    const r = mulberry32(s.seed ?? 3);
    const unit = Math.min(h, w * 0.5);
    const stripeH = s.stripe ? h * 0.085 : 0;
    if (s.stripe) {
      c.fillStyle = s.stripe[0];
      c.fillRect(0, 0, w, stripeH * 0.62);
      c.fillStyle = s.stripe[1];
      c.fillRect(0, stripeH * 0.62, w, stripeH * 0.38);
    }
    const border = s.border ?? 'double';
    if (border !== 'none') {
      c.strokeStyle = s.rim;
      c.lineWidth = unit * 0.05;
      c.strokeRect(unit * 0.05 + stripeH, unit * 0.05 + stripeH, w - unit * 0.1 - stripeH * 0, h - unit * 0.1 - stripeH);
      if (border === 'double') {
        c.lineWidth = unit * 0.014;
        c.strokeRect(unit * 0.13 + stripeH, unit * 0.13 + stripeH, w - unit * 0.26, h - unit * 0.26 - stripeH);
      }
    }
    // Text block.
    const top = unit * 0.2 + stripeH;
    const bottom = h - unit * 0.2;
    const total = lines.reduce((a, l) => a + (l.k ?? 1), 0);
    let y = top;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const share = ((bottom - top) * (l.k ?? 1)) / total;
      const spacing = (s.spacing ?? 0) * share * 0.8;
      const px = fitFont(c, l.t, s.weight ?? '800', s.family, share * 0.8, w * FIT * (border === 'none' ? 1 : 0.92), spacing);
      c.fillStyle = l.color ?? s.fg;
      c.fillText(l.t, w / 2 + spacing / 2, y + share / 2);
      if (s.rule && i === 0 && lines.length > 1) {
        c.fillStyle = s.rim;
        c.fillRect(w * 0.14, y + share + px * 0.02, w * 0.72, Math.max(2, unit * 0.012));
      }
      y += share;
    });
    c.letterSpacing = '0px';
    if (s.rivets) {
      const inset = unit * 0.09 + stripeH * 0.5;
      for (const [x, yy] of [[inset, inset + stripeH * 0.6], [w - inset, inset + stripeH * 0.6], [inset, h - inset], [w - inset, h - inset]] as const) {
        const g = c.createRadialGradient(x - 2, yy - 2, 1, x, yy, unit * 0.04);
        g.addColorStop(0, '#fff2b0');
        g.addColorStop(0.5, '#c9992e');
        g.addColorStop(1, '#6a4a14');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, yy, unit * 0.036, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Chipped enamel + weathering.
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(40,30,22,${0.1 + r() * 0.2})`;
      c.beginPath();
      c.arc(r() * w, r() * h, 1 + r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  };
}

export interface CarvedOpts {
  family?: string;
  weight?: string;
  italic?: boolean;
  /** Bright additive glow lettering on a transparent canvas (the finale). */
  glow?: boolean;
  seed?: number;
  spacing?: number;
}

/** Chiselled stone: recess shadow (top-left), lower rim highlight (bottom-right), moss at the edges. */
export function carvedStonePaint(text: string, o: CarvedOpts = {}): Paint {
  return (c, w, h) => {
    const seed = o.seed ?? 5;
    const r = mulberry32(seed);
    if (!o.glow) {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#c2b294');
      g.addColorStop(1, '#a89878');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 320; i++) {
        c.fillStyle = `rgba(80,70,55,${r() * 0.18})`;
        c.fillRect(r() * w, r() * h, 3, 3);
      }
      // Bevelled edge.
      c.strokeStyle = 'rgba(255,248,230,0.45)';
      c.lineWidth = h * 0.03;
      c.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06);
      c.strokeStyle = 'rgba(50,40,30,0.4)';
      c.lineWidth = h * 0.02;
      c.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    }
    const family = o.family ?? ERA_FONT.editorial;
    const weight = `${o.italic ? 'italic ' : ''}${o.weight ?? '900'}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const spacing = (o.spacing ?? 0.02) * h * 0.5;
    const px = fitFont(c, text, weight, family, h * 0.56, w * FIT, spacing);
    const cx = w / 2 + spacing / 2;
    const cy = h / 2;
    if (o.glow) {
      c.shadowColor = '#ffcf6a';
      c.shadowBlur = 24;
      c.fillStyle = '#ffe9a8';
      c.fillText(text, cx, cy);
    } else {
      const d = Math.max(2, px * 0.035);
      c.fillStyle = 'rgba(255,246,226,0.6)'; // lower rim catches the light
      c.fillText(text, cx + d, cy + d * 1.2);
      c.fillStyle = 'rgba(22,14,8,0.9)'; // recess shadow
      c.fillText(text, cx - d, cy - d * 1.2);
      c.fillStyle = '#4a3c2c';
      c.fillText(text, cx, cy);
      // Moss creeping up from the lower edge and corners.
      for (let i = 0; i < 44; i++) {
        const corner = i % 3;
        const mx = corner === 0 ? r() * w * 0.16 : corner === 1 ? w - r() * w * 0.16 : r() * w;
        const my = h * (0.86 + r() * 0.14);
        c.fillStyle = `rgba(${52 + r() * 24},${96 + r() * 36},${38 + r() * 20},${0.35 + r() * 0.3})`;
        c.beginPath();
        c.ellipse(mx, my, 6 + r() * 16, 3 + r() * 6, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.letterSpacing = '0px';
  };
}

/** Stencilled crate/sack lettering: letters interrupted by stencil bridges, in faded charcoal paint. */
export function stencilPaint(text: string, base: Paint, ink = '#2a2622'): Paint {
  return (c, w, h) => {
    base(c, w, h);
    const t = document.createElement('canvas');
    t.width = w;
    t.height = h;
    const x = t.getContext('2d');
    if (!x) return;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const spacing = h * 0.1;
    const px = fitFont(x, text, '700', ERA_FONT.stencil, h * 0.62, w * FIT, spacing);
    x.fillStyle = ink;
    x.fillText(text, w / 2 + spacing / 2, h / 2);
    // Stencil bridges: thin cuts across the letters.
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = '#000';
    const tw = x.measureText(text).width;
    x.fillRect(w / 2 - tw / 2 - 4, h / 2 - px * 0.04, tw + 8, Math.max(3, px * 0.07));
    for (let i = 1; i < text.length; i++) x.fillRect(w / 2 - tw / 2 + (tw * i) / text.length - px * 0.02, h / 2 - px * 0.4, Math.max(3, px * 0.05), px * 0.8);
    // Faded, scuffed paint.
    const r = mulberry32(text.length * 17 + 3);
    for (let i = 0; i < 160; i++) {
      x.globalAlpha = 0.25 + r() * 0.4;
      x.fillRect(r() * w, h * 0.2 + r() * h * 0.6, 2 + r() * 6, 1 + r() * 3);
    }
    c.globalAlpha = 0.88;
    c.drawImage(t, 0, 0);
    c.globalAlpha = 1;
  };
}

/** Faded red ink stamp (rough double frame, bleed, worn speckles) on weathered card. */
export function inkStampPaint(text: string, o: { paper?: string; ink?: string; tilt?: number } = {}): Paint {
  return (c, w, h) => {
    c.fillStyle = o.paper ?? '#efe6cf';
    c.fillRect(0, 0, w, h);
    const r = mulberry32(88);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `rgba(110,90,60,${r() * 0.1})`;
      c.fillRect(r() * w, r() * h, 3 + r() * 14, 2 + r() * 5);
    }
    const t = document.createElement('canvas');
    t.width = w;
    t.height = h;
    const x = t.getContext('2d');
    if (!x) return;
    const ink = o.ink ?? '#a01c1c';
    x.translate(w / 2, h / 2);
    x.rotate(o.tilt ?? -0.05);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const spacing = h * 0.06;
    const px = fitFont(x, text, '700', ERA_FONT.industrial, h * 0.5, w * 0.7, spacing);
    const tw = x.measureText(text).width;
    x.strokeStyle = ink;
    x.lineWidth = Math.max(4, px * 0.07);
    x.strokeRect(-tw / 2 - px * 0.3, -px * 0.62, tw + px * 0.6, px * 1.24);
    x.lineWidth = Math.max(2, px * 0.025);
    x.strokeRect(-tw / 2 - px * 0.38, -px * 0.7, tw + px * 0.76, px * 1.4);
    x.fillStyle = ink;
    x.fillText(text, spacing / 2, px * 0.03);
    // Ink bleed, then wear: speckle the paint away.
    x.globalAlpha = 0.35;
    x.fillText(text, spacing / 2 + 2, px * 0.03 + 2);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 360; i++) {
      x.globalAlpha = 0.3 + r() * 0.6;
      x.fillRect((r() - 0.5) * w, (r() - 0.5) * h * 0.8, 1 + r() * 7, 1 + r() * 3);
    }
    c.globalAlpha = 0.92;
    c.drawImage(t, 0, 0);
    c.globalAlpha = 1;
    c.letterSpacing = '0px';
  };
}

/** Street-art lettering: tilted marker caps, thick dark outline, layered colour offsets, paint drips. */
export function muralLetteringPaint(text: string, o: { tilt?: number; palette?: readonly string[]; seed?: number } = {}): Paint {
  return (c, w, h) => {
    const r = mulberry32(o.seed ?? 77);
    c.save();
    c.translate(w / 2, h * 0.5);
    c.rotate(o.tilt ?? -0.045);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    const spacing = h * 0.02;
    const px = fitFont(c, text, '400', ERA_FONT.mural, h * 0.62, w * 0.78, spacing);
    const pal = o.palette ?? ['#ff4f9a', '#26c6da', '#ffd23f'];
    const step = px * 0.045;
    // Layered colour offsets (back to front), each with its own dark edge.
    pal.forEach((col, i) => {
      const k = pal.length - i;
      c.lineWidth = px * 0.15;
      c.strokeStyle = '#14101e';
      c.strokeText(text, step * k * 1.3, step * k * 1.5);
      c.fillStyle = col;
      c.fillText(text, step * k * 1.3, step * k * 1.5);
    });
    c.lineWidth = px * 0.17;
    c.strokeStyle = '#14101e';
    c.strokeText(text, 0, 0);
    c.fillStyle = '#fffdf2';
    c.fillText(text, 0, 0);
    // Drips below the baseline.
    const tw = c.measureText(text).width;
    for (let i = 0; i < 6; i++) {
      const dx = -tw / 2 + tw * (0.08 + r() * 0.84);
      const len = px * (0.12 + r() * 0.3);
      const y0 = px * 0.34;
      c.strokeStyle = pal[i % pal.length] ?? '#ff4f9a';
      c.lineCap = 'round';
      c.lineWidth = px * 0.035;
      c.beginPath();
      c.moveTo(dx, y0);
      c.lineTo(dx, y0 + len);
      c.stroke();
      c.fillStyle = c.strokeStyle;
      c.beginPath();
      c.arc(dx, y0 + len + px * 0.01, px * 0.034, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.letterSpacing = '0px';
  };
}

export interface PlaneOpts {
  /** Emissive share of the map (keeps years legible in side-lit shadow). */
  glow?: number;
  yaw?: number;
  transparent?: boolean;
}

/** Flat text plane with a clean, mostly self-lit material (0.3 emissive by default). */
export function platePlane(kit: WorldKit, parent: THREE.Object3D, paint: Paint, size: readonly [number, number], pos: readonly [number, number, number], o: PlaneOpts = {}): THREE.Mesh {
  const pxW = 1024;
  const tex = kit.canvas(pxW, Math.round((pxW * size[1]) / size[0]), paint);
  const glow = o.glow ?? 0.3;
  const mat = kit.toon('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: glow, transparent: o.transparent ?? false });
  const m = kit.mesh(parent, new THREE.PlaneGeometry(size[0], size[1]), mat, [pos[0], pos[1], pos[2]], { ink: false, shadow: false });
  if (o.yaw) m.rotation.y = o.yaw;
  return m;
}

/** Brass-riveted frame behind a plate (call before `platePlane`). */
export function plateBacking(kit: WorldKit, parent: THREE.Object3D, size: readonly [number, number], pos: readonly [number, number, number], color = '#3a2a1c'): THREE.Mesh {
  return kit.box(parent, [size[0] + 0.06, size[1] + 0.06, 0.05], [pos[0], pos[1], pos[2] - 0.03], color, { ink: 20 });
}
