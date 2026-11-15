import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  type CalculateMetadataFunction,
  spring,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import * as THREE from 'three';
import { DIEGETIC_FONT_CSS, DIEGETIC_FONT_FACES, FONT_GUARD_MS } from '../cikajang/fonts';
import {
  CAPTION_FRAMING,
  HOOK,
  HOTELLING_CAPTION,
  HOTELLING_DURATION_IN_FRAMES,
  HOTELLING_FPS,
  HOTELLING_HEIGHT,
  HOTELLING_WIDTH,
  KEYWORDS,
  MAGNET_SNAP_FRAMES,
  WATERMARK,
  buildCaptionPages,
  captionPageAt,
  castPoseAt,
  clamp01,
  gradingAt,
  hookShakeAt,
  loopWave,
  parseSentences,
  parseWords,
  sampleCamera,
  shareAt,
  shotStateAt,
  smoothKeys,
  smoothstep,
  snapKeys,
  transitionAt,
  transitionFxAt,
  type CameraSample,
  type LookId,
  type SentenceTiming,
  type WordTiming,
  type WorldId,
} from './story';
import { ToonActor, WALK_PHASE_PER_METRE } from './toon';
import { Kit, createBeachWorld, createCityWorld, createClassroomWorld, type WorldScene } from './worlds';

export type HotellingLawProps = {
  words?: WordTiming[];
  sentences?: SentenceTiming[];
};

export const hotellingCalculateMetadata: CalculateMetadataFunction<HotellingLawProps> = async () => ({
  fps: HOTELLING_FPS,
  durationInFrames: HOTELLING_DURATION_IN_FRAMES,
  width: HOTELLING_WIDTH,
  height: HOTELLING_HEIGHT,
});

const LOOK_IDS: readonly LookId[] = ['pembeli', 'kucing', 'profesor', 'pedagangBiru', 'pedagangMerah', 'turis'];
const FONT = "'Plus Jakarta Sans', 'Montserrat', Arial, sans-serif";

// ── 3D stage ────────────────────────────────────────────────────────────────

function ThreeStage({ frame, words }: { frame: number; words: readonly WordTiming[] }) {
  const { camera, scene } = useThree();

  const rig = useMemo(() => {
    const kit = new Kit();
    const worlds: Record<WorldId, WorldScene> = {
      city: createCityWorld(kit),
      classroom: createClassroomWorld(kit),
      beach: createBeachWorld(kit),
    };
    const actors = new Map<LookId, ToonActor>(LOOK_IDS.map((id, i) => [id, new ToonActor(id, i * 13 + 5, kit.gradient)]));
    return { kit, worlds, actors };
  }, []);

  useEffect(
    () => () => {
      for (const a of rig.actors.values()) a.dispose();
      rig.kit.dispose();
    },
    [rig],
  );

  const sample = useMemo<CameraSample>(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, roll: 0 }), []);
  const camRight = useMemo(() => new THREE.Vector3(), []);

  // Layout effect: poses the whole frame before <ThreeCanvas> renders it.
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const { shot, progress } = shotStateAt(frame);
    const world = rig.worlds[shot.world];
    for (const w of Object.values(rig.worlds)) {
      if (w === world && w.group.parent !== scene) scene.add(w.group);
      if (w !== world && w.group.parent) w.group.removeFromParent();
    }
    scene.background = world.background;
    scene.fog = world.fog;

    sampleCamera(frame, sample);
    camera.position.copy(sample.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(sample.target);
    camera.rotateZ(sample.roll);
    camera.fov = sample.fov;
    camera.near = 0.05;
    camera.far = 300;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const grading = gradingAt(frame);
    world.update({ frame, grading, camera });

    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const side: 1 | -1 = world.keyDir.dot(camRight) >= 0 ? 1 : -1;
    const len = Math.max(1, shot.to - shot.from - 1);
    const onStage = new Set(shot.cast.map((c) => c.id));
    for (const [id, actor] of rig.actors) if (!onStage.has(id)) actor.mesh.removeFromParent();
    for (const member of shot.cast) {
      const actor = rig.actors.get(member.id);
      if (!actor) continue;
      if (actor.mesh.parent !== world.group) world.group.add(actor.mesh);
      const pose = castPoseAt(member, frame, WALK_PHASE_PER_METRE);
      actor.mesh.position.copy(pose.position);
      // Placement group never pitches or rolls: characters always stand upright.
      actor.mesh.rotation.set(0, 0, 0);
      actor.mesh.scale.setScalar(member.scale ?? 1);
      actor.update(
        {
          frame,
          expression: snapKeys(member.expr, 'neutral', progress, len, 2),
          armL: snapKeys(member.armL, 'side', progress, len, 8),
          armR: snapKeys(member.armR, 'side', progress, len, 8),
          speaking: member.speak ?? false,
          look: smoothKeys(member.look, progress),
          walkPhase: pose.walkPhase,
          walkDir: pose.walkDir,
          light: { side, rim: grading.rimColor, rimStrength: grading.rimStrength },
          glow: grading.actorGlow,
        },
        words,
        camera.position,
      );
    }
  }, [frame, words, camera, scene, rig, sample, camRight]);

  return null;
}

// ── Shared overlay helpers ──────────────────────────────────────────────────

const outlined = (px: number, color = '#000'): CSSProperties => ({
  WebkitTextStroke: `${px}px ${color}`,
  paintOrder: 'stroke fill',
});

/** Spring with a wobbly overshoot (sticker pop-in). */
function wobble(frame: number, fps: number, damping = 8, stiffness = 210): number {
  if (frame < 0) return 0;
  return spring({ frame, fps, config: { damping, stiffness, mass: 0.7, overshootClamping: false } });
}

/** Comic impact sparks radiating from a point; `t` = frames since impact. */
function ImpactSparks({ t, color, radius = 150, count = 10, seed = 0 }: { t: number; color: string; radius?: number; count?: number; seed?: number }) {
  if (t < 0 || t > 12) return null;
  const u = t / 12;
  const reach = radius * (0.55 + 0.6 * Math.pow(u, 0.6));
  const len = 46 * (1 - u) + 6;
  return (
    <svg width={radius * 3} height={radius * 3} viewBox={`${-radius * 1.5} ${-radius * 1.5} ${radius * 3} ${radius * 3}`} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', overflow: 'visible', pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, k) => {
        const a = (k / count) * Math.PI * 2 + seed + (k % 2 ? 0.18 : 0);
        const r0 = reach * (k % 2 ? 0.82 : 1);
        return (
          <line
            key={k}
            x1={Math.cos(a) * r0}
            y1={Math.sin(a) * r0 * 0.62}
            x2={Math.cos(a) * (r0 + len)}
            y2={Math.sin(a) * (r0 + len) * 0.62}
            stroke={k % 3 === 0 ? '#ffffff' : color}
            strokeWidth={k % 2 ? 7 : 10}
            strokeLinecap="round"
            opacity={1 - u}
          />
        );
      })}
    </svg>
  );
}

// ── Opening hook ────────────────────────────────────────────────────────────

function BulbIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ verticalAlign: '-5px', marginLeft: 10 }}>
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" fill="#FBBF24" stroke="#120a1e" strokeWidth="1.6" />
      <rect x="8.5" y="18" width="7" height="2.4" rx="1" fill="#e5e7eb" stroke="#120a1e" strokeWidth="1.2" />
      <path d="M10 21.5h4" stroke="#120a1e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 6v3M9.5 9.5l1.2 1.2M14.5 9.5l-1.2 1.2" stroke="#fff7d6" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MindBlownIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ verticalAlign: '-9px', marginLeft: 10 }}>
      <circle cx="20" cy="24" r="13" fill="#FBBF24" stroke="#120a1e" strokeWidth="2" />
      <circle cx="15" cy="23" r="2.2" fill="#120a1e" />
      <circle cx="25" cy="23" r="2.2" fill="#120a1e" />
      <ellipse cx="20" cy="30" rx="3.4" ry="2.6" fill="#120a1e" />
      <path d="M9 11 L13 4 L16 10 L20 2 L24 10 L27 4 L31 11 Z" fill="#f97316" stroke="#120a1e" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const brandText = (gradient: string): CSSProperties => ({
  display: 'inline-block',
  backgroundImage: gradient,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextStroke: '3px #ffffff',
  filter: 'drop-shadow(0 0 0 #000) drop-shadow(0 6px 0 rgba(10,6,20,0.85)) drop-shadow(0 12px 22px rgba(0,0,0,0.55))',
  fontStyle: 'italic',
  letterSpacing: 1,
});

function HookTitle({ frame, fps }: { frame: number; fps: number }) {
  if (frame < HOOK.badgeIn || frame > HOOK.outEnd) return null;
  const shake = hookShakeAt(frame);
  const out = clamp01((frame - HOOK.holdUntil) / (HOOK.outEnd - HOOK.holdUntil));
  const kicker = wobble(frame - HOOK.badgeIn, fps);
  const lead = wobble(frame - HOOK.slideFrom, fps, 12);
  // Magnetic attraction: the brands accelerate toward each other (cubic) …
  const pull = clamp01((frame - HOOK.slideFrom) / (HOOK.impactFrame - HOOK.slideFrom));
  const gap = (1 - pull * pull * pull) * 640;
  // … then snap together with a squash and a wobbly recoil.
  const snap = frame >= HOOK.impactFrame ? wobble(frame - HOOK.impactFrame, fps, 7, 260) : 0;
  const squash = frame >= HOOK.impactFrame ? 1 + (1 - snap) * 0.22 : 1;
  const recoil = frame >= HOOK.impactFrame ? Math.sin((frame - HOOK.impactFrame) * 1.6) * 10 * Math.exp(-(frame - HOOK.impactFrame) / 4) : 0;
  const tail = frame >= HOOK.impactFrame ? wobble(frame - HOOK.impactFrame - 2, fps, 9) : 0;
  const sub = wobble(frame - HOOK.subIn, fps, 10);
  const badge = wobble(frame - HOOK.hotellingIn, fps, 7);
  const brandsIn = clamp01((frame - HOOK.slideFrom) / 3);

  return (
    <div
      style={{
        position: 'absolute',
        top: 200,
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: '0 40px',
        opacity: 1 - out,
        transform: `translateY(${shake * 12 - out * 40}px)`,
        fontFamily: FONT,
      }}
    >
      {/* Kicker */}
      <div
        style={{
          display: 'inline-block',
          padding: '10px 26px 10px 28px',
          borderRadius: 999,
          background: 'rgba(16, 10, 30, 0.62)',
          border: '2px solid rgba(251, 191, 36, 0.85)',
          boxShadow: '0 0 22px rgba(251,191,36,0.35)',
          color: '#FBBF24',
          fontWeight: 900,
          fontSize: 30,
          letterSpacing: 4,
          transform: `scale(${kicker}) rotate(${(1 - kicker) * -6}deg)`,
          marginBottom: 14,
        }}
      >
        {HOOK.kicker}
        <BulbIcon />
      </div>
      {/* KENAPA */}
      <div style={{ fontWeight: 900, fontSize: 66, color: '#ffffff', letterSpacing: 3, transform: `scale(${lead})`, ...outlined(10), textShadow: '0 8px 22px rgba(0,0,0,0.55)' }}>{HOOK.lead}</div>
      {/* Brand collision row */}
      <div style={{ position: 'relative', height: 104, marginTop: 4, opacity: brandsIn }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, transform: `translateX(calc(-100% - 40px - ${gap}px + ${recoil}px)) scale(${squash}, ${2 - squash})`, transformOrigin: 'right center', whiteSpace: 'nowrap', fontWeight: 900, fontSize: 74 }}>
          <span style={brandText('linear-gradient(180deg, #3b82f6 0%, #1d4ed8 54%, #e3162b 54%, #b91c1c 100%)')}>{HOOK.brandA}</span>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: 4, transform: `translateX(-50%) scale(${frame >= HOOK.impactFrame ? 0.6 + 0.4 * snap : 0})`, fontWeight: 900, fontSize: 58, color: '#FBBF24', ...outlined(8) }}>&amp;</div>
        <div style={{ position: 'absolute', left: '50%', top: 0, transform: `translateX(calc(40px + ${gap}px - ${recoil}px)) scale(${squash}, ${2 - squash})`, transformOrigin: 'left center', whiteSpace: 'nowrap', fontWeight: 900, fontSize: 74 }}>
          <span style={brandText('linear-gradient(180deg, #ef4444 0%, #d6121b 54%, #ffd21f 54%, #f59e0b 100%)')}>{HOOK.brandB}</span>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: 52, width: 0, height: 0 }}>
          <ImpactSparks t={frame - HOOK.impactFrame} color="#FBBF24" radius={170} count={14} />
        </div>
      </div>
      {/* SELALU NEMPEL? */}
      <div style={{ fontWeight: 900, fontSize: 92, lineHeight: 1.0, color: '#FBBF24', transform: `scale(${tail}) rotate(${(1 - tail) * 4 - 1.5}deg)`, ...outlined(14), textShadow: '0 10px 28px rgba(0,0,0,0.6)' }}>{HOOK.tail}</div>
      {/* Sub-tag */}
      <div style={{ marginTop: 22, transform: `translateY(${(1 - sub) * 30}px) scale(${0.85 + 0.15 * sub})`, opacity: clamp01(sub) }}>
        <span
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.14)',
            border: '1.5px solid rgba(255,255,255,0.35)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 38,
            ...outlined(5, 'rgba(10,6,20,0.9)'),
          }}
        >
          {HOOK.sub}
          <MindBlownIcon />
        </span>
      </div>
      {/* Hukum Hotelling 1929 transition badge */}
      <div style={{ marginTop: 18, transform: `scale(${badge}) rotate(${-3 + (1 - badge) * 10}deg)`, opacity: clamp01(badge * 3) }}>
        <span style={{ display: 'inline-block', padding: '8px 22px', borderRadius: 12, background: '#FBBF24', color: '#120a1e', fontWeight: 900, fontSize: 32, letterSpacing: 2, border: '5px solid #ffffff', boxShadow: '0 8px 0 rgba(10,6,20,0.45)' }}>{HOOK.badge}</span>
      </div>
    </div>
  );
}

// ── Motion-typography stickers ──────────────────────────────────────────────

const stickerStyle = (accent: string): CSSProperties => ({
  display: 'inline-block',
  padding: '12px 32px 14px',
  borderRadius: 22,
  backgroundColor: accent,
  // Paper texture: halftone dots + a soft gloss band.
  backgroundImage:
    'radial-gradient(rgba(255,255,255,0.28) 1.6px, transparent 1.8px), linear-gradient(170deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.08) 100%)',
  backgroundSize: '12px 12px, 100% 100%',
  border: '7px solid #ffffff',
  boxShadow: '0 0 0 4px rgba(18,10,30,0.9), 0 14px 0 rgba(18,10,30,0.45), 0 22px 40px rgba(0,0,0,0.35)',
  color: '#120a1e',
  fontFamily: FONT,
  fontWeight: 900,
  fontSize: 84,
  lineHeight: 1.05,
  letterSpacing: 1,
  whiteSpace: 'nowrap',
  textShadow: '0 3px 0 rgba(255,255,255,0.35)',
});

function KeywordSticker({ frame, fps }: { frame: number; fps: number }) {
  const kw = KEYWORDS.find((k) => frame >= k.from && frame < k.to);
  if (!kw) return null;
  const t = frame - kw.from;
  const fade = clamp01((kw.to - frame) / 6);
  const exitScale = 0.85 + 0.15 * fade;
  const idle = loopWave(frame, 40, kw.from) * 1.2;

  if (kw.magnet) {
    // Two halves slide in and snap together like magnets.
    const pull = clamp01(t / MAGNET_SNAP_FRAMES);
    const gap = (1 - pull * pull * pull) * 520;
    const st = t - MAGNET_SNAP_FRAMES;
    const snapped = st >= 0;
    const s = snapped ? wobble(st, fps, 6, 280) : 1;
    const squash = snapped ? 1 + (1 - s) * 0.25 : 1;
    const jolt = snapped ? Math.sin(st * 1.8) * 9 * Math.exp(-st / 4) : 0;
    const half = (text: string, sideSign: number): ReactNode => (
      <span
        style={{
          ...stickerStyle(kw.accent),
          position: 'absolute',
          top: 0,
          [sideSign < 0 ? 'right' : 'left']: `calc(50% - 3px + ${-gap}px)`,
          borderRadius: sideSign < 0 ? '22px 6px 6px 22px' : '6px 22px 22px 6px',
          transform: `translateX(${sideSign * -jolt}px) scale(${squash}, ${2 - squash})`,
          transformOrigin: sideSign < 0 ? 'right center' : 'left center',
        }}
      >
        {text}
      </span>
    );
    return (
      <div style={{ position: 'absolute', top: 330, left: 0, right: 0, height: 140, opacity: fade * clamp01(t / 2), transform: `rotate(${-3 + idle * 0.5}deg) scale(${exitScale})` }}>
        {half(kw.magnet[0], -1)}
        {half(kw.magnet[1], 1)}
        <div style={{ position: 'absolute', left: '50%', top: 64, width: 0, height: 0 }}>
          <ImpactSparks t={st} color={kw.accent} radius={200} count={12} seed={kw.from} />
        </div>
      </div>
    );
  }

  const pop = wobble(t, fps, 7, 230);
  const rot = -3 + (1 - pop) * 14 + idle;
  return (
    <div style={{ position: 'absolute', top: 330, left: 0, right: 0, textAlign: 'center', opacity: fade * clamp01(t / 2) }}>
      <div style={{ position: 'relative', display: 'inline-block', transform: `scale(${pop * exitScale}) rotate(${rot}deg)` }}>
        <span style={stickerStyle(kw.accent)}>{kw.text}</span>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
          <ImpactSparks t={t - 1} color={kw.accent} radius={230} count={10} seed={kw.from * 0.37} />
        </div>
      </div>
    </div>
  );
}

// ── Data overlays ───────────────────────────────────────────────────────────

function ShareBar({ frame }: { frame: number }) {
  const { blue, red, visible } = shareAt(frame);
  if (visible <= 0.001) return null;
  return (
    <div style={{ position: 'absolute', top: 170, left: 70, right: 70, opacity: visible, transform: `translateY(${(1 - visible) * -30}px)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT, fontWeight: 900, fontSize: 46, ...outlined(9) }}>
        <span style={{ color: '#60a5fa' }}>BIRU {blue}</span>
        <span style={{ color: '#f87171' }}>{red} MERAH</span>
      </div>
      <div style={{ display: 'flex', height: 34, marginTop: 10, borderRadius: 18, overflow: 'hidden', border: '5px solid #000' }}>
        <div style={{ width: `${blue}%`, background: 'linear-gradient(#60a5fa, #2563eb)' }} />
        <div style={{ width: `${red}%`, background: 'linear-gradient(#f87171, #dc2626)' }} />
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" style={{ marginRight: 10 }}>
      <path d="M11 1a8 8 0 0 0-8 8c0 6 8 15 8 15s8-9 8-15a8 8 0 0 0-8-8z" fill="#ff5d8f" />
      <circle cx="11" cy="9" r="3" fill="#ffffff" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" style={{ marginRight: 9 }}>
      <circle cx="11" cy="11" r="9" fill="none" stroke="#7dd3fc" strokeWidth="2.2" />
      <path d="M11 5.5V11l3.6 2.2" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Minimalist frosted-glass location badge with a soft neon edge. */
function LocationBadge({ frame }: { frame: number }) {
  const { shot, local } = shotStateAt(frame);
  if (!shot.chip) return null;
  const inT = clamp01(local / 8);
  const glow = shot.world === 'city' ? 'rgba(98, 182, 255, 0.5)' : shot.world === 'beach' ? 'rgba(125, 211, 252, 0.45)' : 'rgba(255, 207, 138, 0.45)';
  return (
    <div
      style={{
        position: 'absolute',
        top: 84,
        left: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '11px 22px 11px 18px',
        borderRadius: 999,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))',
        backdropFilter: 'blur(14px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.3)',
        border: '1.5px solid rgba(255,255,255,0.38)',
        boxShadow: `0 0 18px ${glow}, 0 0 2px ${glow}, inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 24px rgba(0,0,0,0.25)`,
        color: '#ffffff',
        fontFamily: FONT,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: 2.5,
        opacity: inT,
        transform: `translateX(${(1 - inT) * -20}px)`,
        textShadow: '0 1px 6px rgba(0,0,0,0.45)',
      }}
    >
      <PinIcon />
      <span>{shot.chip}</span>
      {shot.chipTime ? (
        <>
          <span style={{ width: 1.5, height: 26, margin: '0 16px', background: 'rgba(255,255,255,0.4)' }} />
          <ClockIcon />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{shot.chipTime}</span>
        </>
      ) : null}
    </div>
  );
}

function Captions({ frame, words, sentences }: { frame: number; words: readonly WordTiming[]; sentences: readonly SentenceTiming[] }) {
  const pages = useMemo(() => buildCaptionPages(words, sentences), [words, sentences]);
  const page = captionPageAt(pages, frame);
  if (!page) return null;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: HOTELLING_CAPTION.bottom,
        left: HOTELLING_CAPTION.sidePadding,
        right: HOTELLING_CAPTION.sidePadding,
        textAlign: 'center',
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: HOTELLING_CAPTION.fontSize,
        lineHeight: HOTELLING_CAPTION.lineHeight,
        textTransform: 'uppercase',
      }}
    >
      {page.lines.map((line, li) => (
        <div key={li}>
          {line.map((w, wi) => {
            const active = frame >= w.startFrame && frame < w.endFrame;
            const said = frame >= w.startFrame;
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  margin: '0 7px',
                  color: active ? CAPTION_FRAMING.highlight : said ? '#ffffff' : 'rgba(255,255,255,0.85)',
                  transform: active ? 'scale(1.08) translateY(-3px)' : 'none',
                  WebkitTextStroke: `${HOTELLING_CAPTION.stroke}px rgba(12, 6, 20, 0.92)`,
                  paintOrder: 'stroke fill',
                  textShadow: '0 4px 14px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.35)',
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Watermark() {
  return (
    <div
      style={{
        position: 'absolute',
        right: 48,
        bottom: 44,
        fontFamily: "'Plus Jakarta Sans', 'Inter', 'Helvetica Neue', Arial, sans-serif",
        fontWeight: 600,
        fontSize: 26,
        letterSpacing: 1.2,
        color: '#ffffff',
        opacity: WATERMARK.opacity,
        textShadow: '0 1px 4px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}
    >
      {WATERMARK.text}
    </div>
  );
}

// ── Selective foreground depth of field ─────────────────────────────────────

/**
 * Only near-lens foreground elements (palm fronds on the beach, a street-lamp
 * post and bokeh in the city) are blurred; the 3D subject layer stays tack
 * sharp. Elements sit at the frame edges and drift with camera parallax.
 */
function ForegroundDof({ frame }: { frame: number }) {
  const { shot, local } = shotStateAt(frame);
  const cam = useMemo(() => sampleCamera(frame), [frame]);
  const inT = smoothstep(0, 10, local) * (1 - smoothstep(shot.to - shot.from - 10, shot.to - shot.from, local));
  // High drone angles have no near foreground.
  const near = 1 - smoothstep(4, 7, cam.position.y);
  const k = inT * near;
  if (k < 0.01 || shot.world === 'classroom') return null;
  const px = -cam.position.x * 60;
  if (shot.world === 'beach') {
    const sway = loopWave(frame, 12, 0.5) * 4;
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: k }}>
        <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, filter: 'blur(13px)', transform: `translateX(${px * 0.6}px)` }}>
          <g transform={`rotate(${sway} -40 -60)`} fill="#1f4d26" opacity="0.92">
            {Array.from({ length: 7 }, (_, i) => {
              const a = (i / 7) * 80 + 5;
              return <path key={i} d="M0 0 C 120 -30, 260 10, 420 90 C 260 60, 120 40, 0 0 Z" transform={`translate(-60 -40) rotate(${a})`} />;
            })}
          </g>
          <g transform={`translate(1080 0) scale(-1 1) rotate(${-sway * 0.8} -40 -60)`} fill="#24592b" opacity="0.88">
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * 70 + 10;
              return <path key={i} d="M0 0 C 110 -25, 230 10, 360 80 C 230 55, 110 35, 0 0 Z" transform={`translate(-50 -30) rotate(${a})`} />;
            })}
          </g>
        </svg>
      </AbsoluteFill>
    );
  }
  // City: blurred lamp post hugging the left edge + soft neon bokeh.
  const bokeh = [
    [130, 720, 46, '#62b6ff'],
    [980, 560, 38, '#ff5d6c'],
    [1010, 980, 30, '#ffd9a0'],
    [70, 1180, 34, '#ff5d8f'],
  ] as const;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: k }}>
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, filter: 'blur(12px)', transform: `translateX(${px}px)` }}>
        <rect x="-30" y="0" width="74" height="1920" fill="#120c1c" />
        <rect x="34" y="0" width="10" height="1920" fill="#ff8fb0" opacity="0.35" />
      </svg>
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, filter: 'blur(18px)', transform: `translateX(${px * 0.5}px)` }}>
        {bokeh.map(([x, y, r, c], i) => (
          <circle key={i} cx={x} cy={y + loopWave(frame, 3, i) * 8} r={r} fill={c} opacity={0.35 + 0.1 * loopWave(frame, 17, i)} />
        ))}
      </svg>
    </AbsoluteFill>
  );
}

// ── Loading ─────────────────────────────────────────────────────────────────

function useFontGuard(): boolean {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading caption + diegetic fonts', { timeoutInMilliseconds: 10000 }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let resolved = false;
    const done = (): void => {
      if (resolved) return;
      resolved = true;
      setReady(true);
      continueRender(handle);
    };
    const timer = setTimeout(done, FONT_GUARD_MS);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = DIEGETIC_FONT_CSS;
    link.onload = () => {
      const faces = [`900 ${HOTELLING_CAPTION.fontSize}px "Plus Jakarta Sans"`, ...DIEGETIC_FONT_FACES];
      if (document.fonts?.load) Promise.all(faces.map((f) => document.fonts.load(f))).then(done, done);
      else done();
    };
    link.onerror = done;
    document.head.appendChild(link);
    return () => {
      clearTimeout(timer);
      link.remove();
    };
  }, [handle, continueRender]);
  return ready;
}

function useNarration(wordsProp?: WordTiming[], sentencesProp?: SentenceTiming[]): { words: WordTiming[]; sentences: SentenceTiming[] } {
  const { delayRender, continueRender } = useDelayRender();
  const [data, setData] = useState<{ words: WordTiming[]; sentences: SentenceTiming[] }>({ words: wordsProp ?? [], sentences: sentencesProp ?? [] });
  const [handle] = useState(() => (wordsProp ? null : delayRender('Loading hotelling-law word timings')));
  useEffect(() => {
    if (handle === null) return;
    const abort = new AbortController();
    const get = (f: string): Promise<unknown> => fetch(staticFile(`hotelling-law/${f}`), { signal: abort.signal }).then((r) => r.json());
    Promise.all([get('words.json'), get('sentences.json').catch(() => [])])
      .then(([w, s]) => {
        const words = parseWords(w, HOTELLING_FPS);
        setData({ words, sentences: sentencesProp ?? parseSentences(s, HOTELLING_FPS, words) });
      })
      .catch(() => undefined)
      .finally(() => continueRender(handle));
    return () => abort.abort();
  }, [handle, continueRender, sentencesProp]);
  return data;
}

// ── Composition ─────────────────────────────────────────────────────────────

export function HotellingLaw({ words: wordsProp, sentences: sentencesProp }: HotellingLawProps) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const fontsReady = useFontGuard();
  const { words, sentences } = useNarration(wordsProp, sentencesProp);
  const dip = transitionAt(frame);
  const fx = transitionFxAt(frame);
  const lensFilter = fx.blurX > 0.5 ? 'url(#hl-whip-blur)' : fx.blur > 0.3 ? `blur(${fx.blur.toFixed(2)}px)` : 'none';

  return (
    <AbsoluteFill style={{ backgroundColor: '#07040d' }}>
      {/* Horizontal-only blur for the whip-pan. */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="hl-whip-blur" x="-20%" y="0%" width="140%" height="100%">
            <feGaussianBlur stdDeviation={`${fx.blurX.toFixed(2)} 0`} />
          </filter>
        </defs>
      </svg>

      <AbsoluteFill style={{ transform: `translateX(${(fx.shiftX * width).toFixed(1)}px) scale(${fx.zoom.toFixed(4)})`, filter: lensFilter }}>
        {fontsReady ? (
          <ThreeCanvas
            width={width}
            height={height}
            shadows="percentage"
            flat
            dpr={1}
            camera={{ fov: 45, near: 0.05, far: 300, position: [0, 1.6, 8] }}
            gl={{ antialias: true, preserveDrawingBuffer: true }}
          >
            <ThreeStage frame={frame} words={words} />
          </ThreeCanvas>
        ) : null}
        <ForegroundDof frame={frame} />
      </AbsoluteFill>

      {/* Painterly vignette, then a light bottom scrim for captions. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(20,8,24,0.5) 100%)', pointerEvents: 'none' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,6,20,0.55) 0%, rgba(10,6,20,0.25) 14%, rgba(10,6,20,0) 26%)', pointerEvents: 'none' }} />

      <LocationBadge frame={frame} />
      <ShareBar frame={frame} />
      <HookTitle frame={frame} fps={fps} />
      <KeywordSticker frame={frame} fps={fps} />
      <Captions frame={frame} words={words} sentences={sentences} />
      <Watermark />

      {dip.alpha > 0.001 ? <AbsoluteFill style={{ backgroundColor: dip.color, opacity: dip.alpha, pointerEvents: 'none' }} /> : null}

      <Audio src={staticFile('hotelling-law/voice.wav')} />
      <Audio src={staticFile('hotelling-law/sfx.wav')} volume={0.55} />
    </AbsoluteFill>
  );
}
