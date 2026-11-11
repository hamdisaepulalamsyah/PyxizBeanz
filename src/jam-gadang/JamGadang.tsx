import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, Audio, type CalculateMetadataFunction, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { DIEGETIC_FONT_CSS, DIEGETIC_FONT_FACES, ERA_FONT, FONT_GUARD_MS } from '../cikajang/fonts';
import { type ToonActor, WALK_PHASE_PER_METRE, createToonActor } from '../cikajang/toon';
import { FilmPipeline, WorldKit } from '../cikajang/worlds';
import { FxLayer, disposeFxTextures, speedLineSet, speedLinesAt } from './fx';
import {
  CAPTION_FRAMING,
  type CaptionPage,
  COLOR_SCRIPT,
  type CastMember,
  FX_CUES,
  HOOK,
  JG_DURATION_IN_FRAMES,
  JG_FPS,
  SHOTS,
  type SentenceTiming,
  type WordTiming,
  activeWordIndex,
  apertureAt,
  blendKeys,
  buildCaptionPages,
  captionPageAt,
  cutDipAt,
  cutFlashAt,
  easeInCubic,
  easeOutCubic,
  expressionKeyAt,
  getShotAt,
  gradeAt,
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
  xfadeAt,
} from './story';
import { type WorldScene, buildWorld } from './worlds';

export type JamGadangProps = {
  words: WordTiming[];
  sentences: SentenceTiming[];
};

export const JAM_GADANG_DEFAULT_PROPS: JamGadangProps = { words: [], sentences: [] };

const FONT_FAMILY = ERA_FONT.transit;

async function fetchJson(name: string, signal: AbortSignal, optional: boolean): Promise<unknown> {
  const res = await fetch(staticFile(name), { signal });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`Could not load public/${name} (${res.status})`);
  }
  return (await res.json()) as unknown;
}

export const calculateJamGadangMetadata: CalculateMetadataFunction<JamGadangProps> = async ({ props, abortSignal }) => {
  if (props.words.length > 0) return { props, durationInFrames: JG_DURATION_IN_FRAMES };
  const [rawWords, rawSentences] = await Promise.all([
    fetchJson('jam-gadang/words.json', abortSignal, false),
    fetchJson('jam-gadang/sentences.json', abortSignal, true),
  ]);
  const words = parseWords(rawWords, JG_FPS);
  const sentences = parseSentences(rawSentences, JG_FPS, words);
  return { props: { words, sentences }, durationInFrames: JG_DURATION_IN_FRAMES };
};

// ── 3D Stage & Cast ─────────────────────────────────────────────────────────

interface CastSlot {
  member: CastMember;
  actor: ToonActor;
  anchor: THREE.Vector3;
  blob: THREE.Mesh;
}

const BLOB_LIFT = new THREE.Vector3(0, 0.015, 0);

function freezeSun(group: THREE.Group, shot: (typeof SHOTS)[number]): void {
  const centre = new THREE.Vector3();
  for (const k of shot.camera) centre.add(new THREE.Vector3(...k.target));
  centre.divideScalar(Math.max(1, shot.camera.length));
  let spread = 0;
  for (const k of shot.camera) spread = Math.max(spread, centre.distanceTo(new THREE.Vector3(...k.target)));
  const extent = Math.min(18, 4 + spread * 0.65);
  const focus = centre.clone();
  group.traverse((o) => {
    if (!(o instanceof THREE.DirectionalLight) || !o.castShadow) return;
    const dir = o.position.clone().sub(o.target.position).normalize();
    o.target.position.copy(focus);
    o.position.copy(focus).addScaledVector(dir, 32);
    const c = o.shadow.camera;
    c.left = -extent;
    c.right = extent;
    c.top = extent;
    c.bottom = -extent;
    c.near = 1;
    c.far = 70;
    c.updateProjectionMatrix();
  });
}

interface Stage {
  world: WorldScene;
  cast: CastSlot[];
  fx: FxLayer;
}

class StageManager {
  readonly root = new THREE.Group();
  private readonly kit = new WorldKit();
  private readonly stages = new Map<number, Stage>();
  private actors: ToonActor[] = [];
  private blobGeo: THREE.CircleGeometry | null = null;
  private blobMat: THREE.MeshBasicMaterial | null = null;

  private blobGeometry(): THREE.CircleGeometry {
    if (!this.blobGeo) this.blobGeo = new THREE.CircleGeometry(0.5, 40);
    return this.blobGeo;
  }

  private blobMaterial(): THREE.MeshBasicMaterial {
    if (!this.blobMat) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      if (!g) throw new Error('Canvas2D context unavailable');
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(20, 10, 25, 0.45)');
      grad.addColorStop(0.6, 'rgba(20, 10, 25, 0.32)');
      grad.addColorStop(1, 'rgba(20, 10, 25, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      this.blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    }
    return this.blobMat;
  }

  get(index: number): Stage {
    const hit = this.stages.get(index);
    if (hit) return hit;
    const shot = SHOTS[index];
    if (!shot) throw new Error(`Unknown shot ${index}`);
    const world = buildWorld(shot.world, this.kit);
    freezeSun(world.group, shot);
    const cast = shot.cast.map((member, i): CastSlot => {
      const anchor = world.anchors[member.anchor];
      if (!anchor) throw new Error(`World "${shot.world}" has no anchor "${member.anchor}"`);
      const actor = createToonActor(
        member.actor,
        { pose: member.pose, leftProp: member.leftProp ?? 'none', rightProp: member.rightProp ?? 'none', bodyProp: member.bodyProp ?? 'none' },
        { gradientMap: this.kit.gradient, seed: index * 13 + i * 5 + 1 },
      );
      actor.mesh.position.copy(anchor);
      actor.mesh.scale.setScalar(member.scale);
      world.group.add(actor.mesh);
      this.actors.push(actor);
      const blob = new THREE.Mesh(this.blobGeometry(), this.blobMaterial());
      blob.rotation.x = -Math.PI / 2;
      blob.scale.set(0.9 * member.scale, 0.55 * member.scale, 1);
      blob.position.copy(anchor).add(BLOB_LIFT);
      blob.renderOrder = 1;
      world.group.add(blob);
      return { member, actor, anchor: anchor.clone(), blob };
    });
    const fx = new FxLayer(shot.id, FX_CUES, world.group);
    world.group.visible = false;
    this.root.add(world.group);
    const stage = { world, cast, fx };
    this.stages.set(index, stage);
    return stage;
  }

  show(index: number): void {
    for (const [i, s] of this.stages) s.world.group.visible = i === index;
  }

  dispose(): void {
    for (const a of this.actors) a.dispose();
    this.actors = [];
    for (const s of this.stages.values()) s.fx.dispose();
    disposeFxTextures();
    this.blobGeo?.dispose();
    this.blobMat?.map?.dispose();
    this.blobMat?.dispose();
    this.kit.dispose();
    this.stages.clear();
  }
}

const offsetNow = new THREE.Vector3();
const offsetPrev = new THREE.Vector3();
const offsetStart = new THREE.Vector3();
const prevSample = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38, roll: 0, focus: 5 };

const JamGadangScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const manager = useMemo(() => new StageManager(), []);
  const film = useMemo(() => new FilmPipeline(width, height), [width, height]);
  const sample = useMemo(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38, roll: 0, focus: 5 }), []);
  const filmParams = useRef({ focusDistance: 5, aperture: 0.4, frame: 0, dip: 0, sepia: 0, grey: 0, tone: 0.45, flash: 0, xfade: 0 });
  const prevRef = useRef<{ shot: number; frame: number; captured: boolean }>({ shot: -1, frame: -1, captured: false });

  useLayoutEffect(() => {
    scene.add(manager.root);
    return () => {
      scene.remove(manager.root);
    };
  }, [scene, manager]);

  useEffect(() => () => {
    manager.dispose();
    film.dispose();
  }, [manager, film]);

  const poseAt = (shotIndex: number, f: number): void => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const { shot, localFrame, progress } = getShotAt(f);
    const stage = manager.get(shotIndex);
    manager.show(shotIndex);
    scene.background = stage.world.background;
    scene.fog = stage.world.fog;

    sampleCamera(f, sample);
    camera.position.copy(sample.position);
    camera.lookAt(sample.target);
    camera.rotateZ(sample.roll);
    camera.fov = sample.fov;
    camera.near = 0.05;
    camera.far = 400;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    stage.world.update({ frame: f, localFrame, progress, fps, camera });
    const len = Math.max(1, shot.to - shot.from - 1);
    const phase = COLOR_SCRIPT[shot.phase];
    const light = { rim: phase.rim, rimStrength: phase.rimStrength, side: phase.lightSide };
    for (const { member, actor, anchor, blob } of stage.cast) {
      actor.mesh.visible = isCastVisible(member, progress);
      blob.visible = actor.mesh.visible;
      if (!actor.mesh.visible) continue;
      keyedVec3(member.move, progress, offsetNow);
      keyedVec3(member.move, Math.max(0, progress - 1 / len), offsetPrev);
      keyedVec3(member.move, 0, offsetStart);
      actor.mesh.position.copy(anchor).add(offsetNow);
      blob.position.copy(actor.mesh.position).add(BLOB_LIFT);
      const moving = member.move ? offsetNow.distanceTo(offsetPrev) > 0.0015 : false;
      const travelled = offsetNow.distanceTo(offsetStart);
      const expr = expressionKeyAt(member.expression, shot, localFrame, progress);
      actor.update(
        {
          frame: f,
          progress,
          expression: expr.value,
          expressionAge: expr.age,
          light,
          turn: keyed(member.turn ?? [[0, 0]], progress),
          nod: keyed(member.nod ?? [[0, 0]], progress),
          armRight: blendKeys(member.right, 'side', progress),
          armLeft: blendKeys(member.left, 'side', progress),
          walkPhase: moving ? (travelled / member.scale) * WALK_PHASE_PER_METRE : null,
          walkDir: offsetNow.x >= offsetPrev.x ? 1 : -1,
          drawProgress: smoothstep(0.08, 0.65, progress),
        },
        camera.position,
      );
    }
    stage.fx.update(f, camera, stage.cast.map((c) => ({ position: c.actor.mesh.position, scale: c.member.scale, visible: c.actor.mesh.visible })));
  };

  useLayoutEffect(() => {
    const { index } = getShotAt(frame);
    const xf = xfadeAt(frame);
    prevRef.current = { shot: xf.active ? xf.outgoingShot : -1, frame: xf.outgoingFrame, captured: false };
    poseAt(index, frame);
    const grade = gradeAt(frame);
    filmParams.current = {
      focusDistance: sample.focus,
      aperture: apertureAt(frame),
      frame,
      dip: cutDipAt(frame),
      sepia: grade.sepia,
      grey: grade.grey,
      tone: grade.tone,
      flash: cutFlashAt(frame),
      xfade: xf.blend,
    };
  }, [frame, fps, camera, scene, manager, sample]);

  useFrame(({ gl, scene: s, camera: c }) => {
    if (!(c instanceof THREE.PerspectiveCamera)) return;
    film.setSize(width, height);
    if (prevRef.current.shot >= 0 && !prevRef.current.captured && filmParams.current.xfade > 0) {
      prevRef.current.captured = true;
      const outF = prevRef.current.frame;
      poseAt(prevRef.current.shot, outF);
      sampleCamera(outF, prevSample);
      const og = gradeAt(outF);
      film.renderPrev(gl, s, c, {
        focusDistance: prevSample.focus,
        aperture: apertureAt(outF),
        frame: outF,
        dip: cutDipAt(outF),
        sepia: og.sepia,
        grey: og.grey,
        tone: og.tone,
        flash: cutFlashAt(outF),
      });
      const { index } = getShotAt(frame);
      poseAt(index, frame);
    }
    film.render(gl, s, c, filmParams.current);
  }, 1);

  return null;
};

// ── Overlays & Typography Guard ─────────────────────────────────────────────

function useDiegeticFonts(): boolean {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading Jam Gadang fonts', { timeoutInMilliseconds: 10000 }));
  const [ready, setReady] = useState(false);

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
  const strength = speedLinesAt(frame);
  if (strength <= 0.01) return null;
  const lines = speedLineSet(frame);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: strength * 0.72 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        {lines.map((l, i) => {
          const x1 = 50 + Math.cos(l.angle) * l.inner;
          const y1 = 50 + Math.sin(l.angle) * l.inner;
          const x2 = 50 + Math.cos(l.angle) * l.outer;
          const y2 = 50 + Math.sin(l.angle) * l.outer;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff7e2" strokeWidth={l.width * 0.16} strokeLinecap="round" />;
        })}
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
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 350, pointerEvents: 'none' }}>
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
  const o = interpolate(localFrame, [start, start + 10, len - 16, len - 6], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0.01) return null;
  const chip = stepped(shot.chip, progress);
  return (
    <div
      style={{
        position: 'absolute',
        top: 148,
        left: 76,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '13px 24px',
        borderRadius: 999,
        background: 'rgba(20, 16, 30, 0.65)',
        border: '2px solid rgba(251, 191, 36, 0.58)',
        fontFamily: FONT_FAMILY,
        fontWeight: 800,
        fontSize: 30,
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
        paddingTop: 150,
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
          fontSize: 28,
          letterSpacing: `${lerp(0.28, 0.1, badgeT)}em`,
          color: '#FFF3D6',
          background: 'linear-gradient(180deg, rgba(150,32,32,0.92), rgba(98,18,28,0.92))',
          border: `3px solid ${CAPTION_FRAMING.highlight}`,
          opacity: badgeT,
          transform: `translateY(${(1 - badgeT) * -50}px)`,
        }}
      >
        {HOOK.teaser}
      </div>
      <div style={{ marginTop: 22, textAlign: 'center' }}>
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
      <div style={{ marginTop: 16, fontWeight: 800, fontSize: 26, letterSpacing: '0.26em', color: CAPTION_FRAMING.highlight, textShadow: '0 4px 0 #170c19' }}>
        {HOOK.kicker}
      </div>
    </AbsoluteFill>
  );
};

export const JamGadang: React.FC<JamGadangProps> = ({ words, sentences }) => {
  const { width, height } = useVideoConfig();
  const fontsReady = useDiegeticFonts();
  const pages = useMemo(() => buildCaptionPages(words, sentences), [words, sentences]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#14101e' }}>
      {fontsReady ? (
        <ThreeCanvas width={width} height={height} shadows="percentage" flat dpr={1} camera={{ fov: 40, near: 0.05, far: 400, position: [0, 2, 10] }} gl={{ antialias: false, preserveDrawingBuffer: true }}>
          <JamGadangScene />
        </ThreeCanvas>
      ) : null}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,8,20,0.82) 0%, rgba(10,8,20,0) 34%)', pointerEvents: 'none' }} />
      <SpeedLinesOverlay />
      <HookTitle />
      <ShotChip />
      <Captions pages={pages} words={words} />
      <Audio src={staticFile('jam-gadang/voice.wav')} />
      <Audio src={staticFile('jam-gadang/sfx.wav')} />
    </AbsoluteFill>
  );
};
