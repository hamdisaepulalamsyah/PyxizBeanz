import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  type CalculateMetadataFunction,
  interpolate,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import * as THREE from 'three';
import { DIEGETIC_FONT_CSS, DIEGETIC_FONT_FACES, ERA_FONT, FONT_GUARD_MS } from '../cikajang/fonts';
import { FilmPipeline } from '../cikajang/worlds';
import { WorldKit } from '../persis/worlds';
import { FxLayer, type FxTarget, speedLinesAt } from './fx';
import {
  CAPTION_FRAMING,
  COLOR_SCRIPT,
  type CaptionPage,
  type CastMember,
  DG_DURATION_IN_FRAMES,
  DG_FPS,
  FX_CUES,
  HOOK,
  SHOTS,
  type SentenceTiming,
  type WordTiming,
  activeWordIndex,
  apertureAt,
  buildCaptionPages,
  captionPageAt,
  cutDipAt,
  cutFlashAt,
  easeInCubic,
  easeOutCubic,
  expressionAt,
  getShotAt,
  gradeAt,
  hash01,
  hookShakeAt,
  isCastVisible,
  keyed,
  keyedVec3,
  lerp,
  parseSentences,
  parseWords,
  sampleCamera,
  smoothstep,
  stepped,
  swapBlinkAt,
  xfadeAt,
} from './story';
import { CARD_SHADER_UNIFORMS, type V3Actor, blinkAt, createV3Actor } from './toon';
import { type WorldScene, buildWorld } from './worlds';

export type DodolGarutProps = {
  words: WordTiming[];
  sentences: SentenceTiming[];
};

export const DODOL_GARUT_DEFAULT_PROPS: DodolGarutProps = { words: [], sentences: [] };
const FONT_FAMILY = ERA_FONT.transit;

async function fetchJson(name: string, signal: AbortSignal, optional: boolean): Promise<unknown> {
  const res = await fetch(staticFile(name), { signal });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`Could not load public/${name} (${res.status})`);
  }
  return (await res.json()) as unknown;
}

export const calculateDodolGarutMetadata: CalculateMetadataFunction<DodolGarutProps> = async ({ props, abortSignal }) => {
  if (props.words.length > 0) return { props, durationInFrames: DG_DURATION_IN_FRAMES };
  const [rawWords, rawSentences] = await Promise.all([
    fetchJson('dodol-garut/words.json', abortSignal, false),
    fetchJson('dodol-garut/sentences.json', abortSignal, true),
  ]);
  const words = parseWords(rawWords, DG_FPS);
  const sentences = parseSentences(rawSentences, DG_FPS, words);
  return { props: { words, sentences }, durationInFrames: DG_DURATION_IN_FRAMES };
};

// ── 3D Stage & Cast Manager ─────────────────────────────────────────────────

interface CastSlot {
  member: CastMember;
  actor: V3Actor;
  anchor: THREE.Vector3;
}

interface Stage {
  world: WorldScene;
  cast: CastSlot[];
  fx: FxLayer;
}

const tmpMove = new THREE.Vector3();
const tmpWorld = new THREE.Vector3();
const tmpCamRight = new THREE.Vector3();
const tmpKeyColor = new THREE.Color();
const tmpRimColor = new THREE.Color();

class StageManager {
  readonly root = new THREE.Group();
  private readonly kit = new WorldKit();
  private readonly stages: Stage[];

  constructor() {
    this.stages = SHOTS.map((shot, idx) => {
      const world = buildWorld(shot.world, this.kit);
      const cast: CastSlot[] = shot.cast.map((member, ci) => {
        const actor = createV3Actor(member.look, idx * 17 + ci * 13 + 5);
        const anchor = (world.anchors[member.anchor] ?? new THREE.Vector3()).clone();
        world.group.add(actor.group);
        return { member, actor, anchor };
      });
      const fx = new FxLayer(shot.id, shot.from, shot.to, FX_CUES, world.group);
      world.group.visible = false;
      this.root.add(world.group);
      return { world, cast, fx };
    });
  }

  poseAt(
    frame: number,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    camPos: THREE.Vector3,
    camTarget: THREE.Vector3,
  ): void {
    const { shot, index, localFrame, progress } = getShotAt(frame);
    const stage = this.stages[index];
    if (!stage) return;

    for (let i = 0; i < this.stages.length; i++) {
      this.stages[i]!.world.group.visible = i === index;
    }

    scene.background = stage.world.background;
    scene.fog = stage.world.fog;

    // Update lit card shader palette to match this shot's narrative phase
    const pal = COLOR_SCRIPT[shot.phase];
    tmpKeyColor.set(pal.key);
    tmpRimColor.set(pal.shadow);
    CARD_SHADER_UNIFORMS.uCharTint.value.copy(tmpKeyColor);
    CARD_SHADER_UNIFORMS.uSideTint.value.lerpColors(new THREE.Color(1, 1, 1), tmpRimColor, 0.35);

    stage.world.update({ frame, localFrame, progress, fps: DG_FPS });

    tmpCamRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    void camTarget;

    const fxTargets: FxTarget[] = [];
    stage.cast.forEach((slot, ci) => {
      const { member, actor, anchor } = slot;
      const visible = isCastVisible(member, progress);
      actor.group.visible = visible;
      if (visible) {
        if (member.move) keyedVec3(member.move, progress, tmpMove);
        else tmpMove.set(0, 0, 0);
        tmpWorld.copy(anchor).add(tmpMove);

        const view = stepped<'front' | 'side'>(member.view ?? [[0, 'front']], progress);
        const mirror = stepped<boolean>(member.mirror ?? [[0, false]], progress);
        const expr = expressionAt(member.expression, shot, localFrame);
        const mode = stepped(member.mode, progress);
        const blink = Math.max(blinkAt(frame, index * 19 + ci * 7 + 3), swapBlinkAt(member.expression, shot, localFrame));
        const look = member.lookDir ? keyed(member.lookDir, progress) : 0;
        const tilt = member.tilt ? keyed(member.tilt, progress) : 0;
        const headTilt = member.headTilt ? keyed(member.headTilt, progress) : 0;
        const phase = progress * (member.cycleRate ?? 2.0);

        actor.update({
          view,
          mirror,
          expr,
          mode,
          phase,
          look,
          blink,
          tilt,
          headTilt,
          facing: member.facing ?? 0,
          handTarget: member.handTarget,
          worldPos: tmpWorld,
          camPos,
          camRight: tmpCamRight,
          sunPos: stage.world.sunDir,
          scale: member.scale,
        });
      }
      fxTargets.push({ position: actor.group.position.clone(), scale: member.scale, visible });
    });

    stage.fx.update(frame, camera, fxTargets);
  }

  dispose(): void {
    for (const s of this.stages) {
      for (const c of s.cast) c.actor.dispose();
      s.fx.dispose();
    }
    this.kit.dispose();
  }
}

const DodolGarutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { gl, scene, camera, size } = useThree();
  const manager = useMemo(() => new StageManager(), []);
  const pipeline = useMemo(() => new FilmPipeline(size.width, size.height), []);
  const camSample = useMemo(
    () => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40, roll: 0, focus: 4 }),
    [],
  );

  useEffect(() => () => {
    manager.dispose();
    pipeline.dispose();
  }, [manager, pipeline]);

  useEffect(() => {
    pipeline.setSize(size.width, size.height);
  }, [pipeline, size.width, size.height]);

  useLayoutEffect(() => {
    scene.add(manager.root);
    return () => {
      scene.remove(manager.root);
    };
  }, [scene, manager]);

  const applyCamera = (f: number): void => {
    const cam = camera as THREE.PerspectiveCamera;
    sampleCamera(f, camSample);
    cam.position.copy(camSample.position);
    cam.fov = camSample.fov;
    cam.near = 0.05;
    cam.far = 400;
    cam.lookAt(camSample.target);
    cam.rotateZ(camSample.roll);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  };

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const xfade = xfadeAt(frame);
    const dip = cutDipAt(frame);
    const flash = cutFlashAt(frame);

    if (xfade.active) {
      applyCamera(xfade.outgoingFrame);
      manager.poseAt(xfade.outgoingFrame, scene, cam, camSample.position, camSample.target);
      const og = gradeAt(xfade.outgoingFrame);
      pipeline.renderPrev(gl, scene, cam, {
        focusDistance: camSample.focus,
        aperture: apertureAt(xfade.outgoingFrame),
        frame: xfade.outgoingFrame,
        dip: 0,
        sepia: og.sepia,
        grey: og.grey,
        tone: og.tone,
        flash: 0,
      });
    }

    applyCamera(frame);
    manager.poseAt(frame, scene, cam, camSample.position, camSample.target);
    const g = gradeAt(frame);
    pipeline.render(gl, scene, cam, {
      focusDistance: camSample.focus,
      aperture: apertureAt(frame),
      frame,
      dip,
      sepia: g.sepia,
      grey: g.grey,
      tone: g.tone,
      flash,
      xfade: xfade.active ? xfade.blend : 0,
    });
  }, 1);

  return null;
};

// ── Fonts, Overlays & Subtitles ─────────────────────────────────────────────

function useDiegeticFonts(): boolean {
  const [ready, setReady] = useState(false);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading diegetic typography'));

  useEffect(() => {
    let resolved = false;
    const done = (): void => {
      if (!resolved) {
        resolved = true;
        setReady(true);
        continueRender(handle);
      }
    };
    const timer = setTimeout(done, FONT_GUARD_MS);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = DIEGETIC_FONT_CSS;
    link.onload = () => {
      if (document.fonts && document.fonts.load) {
        Promise.all(DIEGETIC_FONT_FACES.map((f) => document.fonts.load(f))).then(done, done);
      } else done();
    };
    link.onerror = done;
    document.head.appendChild(link);
    return () => clearTimeout(timer);
  }, [handle, continueRender]);

  return ready;
}

const SpeedLinesOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { shot } = getShotAt(frame);
  const strength = speedLinesAt(frame, shot.id, shot.from, shot.to, FX_CUES);
  if (strength <= 0.01) return null;
  const bucket = Math.floor(frame / 2);
  const lines = Array.from({ length: 24 }, (_, i) => ({
    angle: (i / 24) * Math.PI * 2 + (hash01(bucket, i) - 0.5) * 0.14,
    inner: 34 + hash01(bucket + 11, i) * 14,
    outer: 72 + hash01(bucket + 29, i) * 12,
    width: 1.4 + hash01(bucket + 47, i) * 1.8,
  }));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: strength * 0.65 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        {lines.map((l, i) => (
          <line
            key={i}
            x1={50 + Math.cos(l.angle) * l.inner}
            y1={50 + Math.sin(l.angle) * l.inner}
            x2={50 + Math.cos(l.angle) * l.outer}
            y2={50 + Math.sin(l.angle) * l.outer}
            stroke="#fff7e2"
            strokeWidth={l.width * 0.15}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

const Word: React.FC<{ word: WordTiming; active: boolean; spoken: boolean; frame: number }> = ({ word, active, spoken, frame }) => {
  const pop = active ? 1 + 0.1 * (1 - smoothstep(0, 5, frame - word.startFrame)) : 1;
  return (
    <span
      style={{
        display: 'inline-block',
        margin: '0 0.14em',
        color: active ? CAPTION_FRAMING.highlight : spoken ? '#FFFFFF' : 'rgba(255,255,255,0.78)',
        transform: `scale(${pop}) translateY(${active ? -4 : 0}px)`,
        textShadow: active ? '0 0 26px rgba(251,191,36,0.55), 0 6px 0 rgba(23,12,25,0.92)' : '0 6px 0 rgba(23,12,25,0.92)',
        WebkitTextStroke: '10px #170c19',
        paintOrder: 'stroke fill',
      }}
    >
      {word.text}
    </span>
  );
};

const Captions: React.FC<{ pages: readonly CaptionPage[]; words: readonly WordTiming[] }> = ({ pages, words }) => {
  const frame = useCurrentFrame();
  const page = captionPageAt(pages, frame);
  if (!page) return null;
  const active = words[activeWordIndex(words, frame)];
  const enter = smoothstep(page.startFrame - 1, page.startFrame + 1, frame);
  const exit = 1 - smoothstep(page.endFrame - 2, page.endFrame, frame);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 340, pointerEvents: 'none' }}>
      <div
        style={{
          width: '100%',
          padding: `0 ${CAPTION_FRAMING.sidePadding}px`,
          textAlign: 'center',
          fontFamily: FONT_FAMILY,
          fontWeight: 800,
          fontSize: CAPTION_FRAMING.fontSize,
          lineHeight: CAPTION_FRAMING.lineHeight,
          letterSpacing: '-0.01em',
          opacity: Math.min(enter, exit),
          transform: `translateY(${(1 - enter) * 16}px)`,
        }}
      >
        {page.lines.map((line, li) => (
          <div key={li}>
            {line.map((w) => (
              <Word key={`${w.startFrame}-${w.text}`} word={w} active={w === active} spoken={frame >= w.endFrame} frame={frame} />
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const ShotChip: React.FC = () => {
  const frame = useCurrentFrame();
  const { shot, index, localFrame, progress } = getShotAt(frame);
  const len = shot.to - shot.from;
  const start = index === 0 ? HOOK.outEnd - shot.from : 8;
  const o = interpolate(localFrame, [start, start + 10, len - 16, len - 6], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (o <= 0.01) return null;
  const chip = stepped(shot.chip, progress);
  return (
    <div
      style={{
        position: 'absolute',
        top: 148,
        left: 72,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '13px 24px',
        borderRadius: 999,
        background: 'rgba(20, 16, 30, 0.68)',
        border: '2px solid rgba(251, 191, 36, 0.6)',
        fontFamily: FONT_FAMILY,
        fontWeight: 800,
        fontSize: 28,
        letterSpacing: '0.1em',
        color: '#F8EBD0',
        opacity: o,
        transform: `translateX(${(1 - o) * -28}px)`,
      }}
    >
      <span style={{ width: 13, height: 13, borderRadius: 7, background: CAPTION_FRAMING.highlight, boxShadow: '0 0 14px #FBBF24' }} />
      {chip.place}
      <span style={{ color: CAPTION_FRAMING.highlight }}>{chip.year}</span>
    </div>
  );
};

const HookTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { badgeIn, impactFrame: hit, holdUntil, outEnd } = HOOK;
  if (frame >= outEnd) return null;
  const d = frame - hit;
  const out = smoothstep(holdUntil, outEnd, frame);
  const shake = hookShakeAt(frame);
  const sx = shake * 12 * Math.sin(frame * 2.9);
  const sy = shake * 8 * Math.sin(frame * 3.7 + 1);
  const rot = shake * 1.1 * Math.sin(frame * 2.6 + 1.3);
  const fall = smoothstep(hit - 7, hit, frame);
  const titleScale = d < 0 ? lerp(2.1, 1, easeInCubic(fall)) : 1 - 0.12 * Math.exp(-d / 4.5) * Math.cos(d * 0.9);
  const squashY = d >= 0 ? 1 + 0.09 * Math.exp(-d / 3) * Math.cos(d * 1.2 + Math.PI) : 1;
  const badgeT = easeOutCubic(smoothstep(badgeIn, badgeIn + 8, frame));

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        paddingTop: 146,
        fontFamily: FONT_FAMILY,
        pointerEvents: 'none',
        opacity: 1 - out,
        transform: `translate(${sx}px, ${sy - out * 36}px) rotate(${rot}deg)`,
      }}
    >
      <div
        style={{
          padding: '10px 24px',
          borderRadius: 16,
          fontWeight: 800,
          fontSize: 27,
          letterSpacing: `${lerp(0.24, 0.09, badgeT)}em`,
          color: '#FFF3D6',
          background: 'linear-gradient(180deg, rgba(176,34,62,0.94), rgba(112,20,42,0.94))',
          border: `3px solid ${CAPTION_FRAMING.highlight}`,
          opacity: badgeT,
          transform: `translateY(${(1 - badgeT) * -50}px)`,
        }}
      >
        {HOOK.teaser}
      </div>
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        {HOOK.title.map((line) => (
          <div
            key={line}
            style={{
              fontWeight: 800,
              fontSize: 88,
              lineHeight: 1.04,
              color: '#FFF6E2',
              WebkitTextStroke: '10px #170c19',
              paintOrder: 'stroke fill',
              textShadow: '0 8px 0 rgba(23,12,25,0.9)',
              opacity: d < 0 ? fall : 1,
              transform: `scale(${titleScale}, ${titleScale * squashY})`,
              whiteSpace: 'nowrap',
            }}
          >
            {line}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontWeight: 800, fontSize: 26, letterSpacing: '0.24em', color: CAPTION_FRAMING.highlight, textShadow: '0 4px 0 #170c19' }}>
        {HOOK.kicker}
      </div>
    </AbsoluteFill>
  );
};

export const DodolGarut: React.FC<DodolGarutProps> = ({ words, sentences }) => {
  const { width, height } = useVideoConfig();
  const fontsReady = useDiegeticFonts();
  const pages = useMemo(() => buildCaptionPages(words, sentences), [words, sentences]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#1a121b' }}>
      {fontsReady ? (
        <ThreeCanvas
          width={width}
          height={height}
          shadows="percentage"
          flat
          dpr={1}
          camera={{ fov: 40, near: 0.05, far: 400, position: [0, 2, 10] }}
          gl={{ antialias: false, preserveDrawingBuffer: true }}
        >
          <DodolGarutScene />
        </ThreeCanvas>
      ) : null}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,8,20,0.82) 0%, rgba(10,8,20,0) 34%)', pointerEvents: 'none' }} />
      <SpeedLinesOverlay />
      <HookTitle />
      <ShotChip />
      <Captions pages={pages} words={words} />
      <Audio src={staticFile('dodol-garut/voice.wav')} />
      <Audio src={staticFile('dodol-garut/sfx.wav')} />
    </AbsoluteFill>
  );
};
