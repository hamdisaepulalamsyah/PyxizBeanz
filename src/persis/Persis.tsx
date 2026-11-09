import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import {
  CAPTION_FRAMING,
  type CaptionPage,
  type CastMember,
  PERSIS_DURATION_IN_FRAMES,
  PERSIS_FPS,
  SHOTS,
  type SentenceTiming,
  type WordTiming,
  activeWordIndex,
  buildCaptionPages,
  captionPageAt,
  cutDipAt,
  expressionAt,
  getShotAt,
  isCastVisible,
  keyed,
  parseSentences,
  parseWords,
  sampleCamera,
  smoothstep,
} from './story';
import { type ToonActor, createToonActor, visemeAt } from './toon';
import { FilmPipeline, WorldKit, type WorldScene, buildWorld } from './worlds';

export type PersisProps = {
  words: WordTiming[];
  sentences: SentenceTiming[];
};

export const PERSIS_DEFAULT_PROPS: PersisProps = { words: [], sentences: [] };

const FONT_FAMILY = '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=block';

async function fetchJson(name: string, signal: AbortSignal, optional: boolean): Promise<unknown> {
  const res = await fetch(staticFile(name), { signal });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`Could not load public/${name} (${res.status})`);
  }
  return (await res.json()) as unknown;
}

/** Loads ElevenLabs timings from public/ before rendering so props stay serialisable. */
export const calculatePersisMetadata: CalculateMetadataFunction<PersisProps> = async ({ props, abortSignal }) => {
  if (props.words.length > 0) return { props, durationInFrames: PERSIS_DURATION_IN_FRAMES };
  const [rawWords, rawSentences] = await Promise.all([fetchJson('words.json', abortSignal, false), fetchJson('sentences.json', abortSignal, true)]);
  const words = parseWords(rawWords, PERSIS_FPS);
  const sentences = parseSentences(rawSentences, PERSIS_FPS, words);
  return { props: { words, sentences }, durationInFrames: PERSIS_DURATION_IN_FRAMES };
};

// ── 3D stage ────────────────────────────────────────────────────────────────

interface CastSlot {
  member: CastMember;
  actor: ToonActor;
}

interface Stage {
  world: WorldScene;
  cast: CastSlot[];
}

/** Builds each shot's world + cast on first use and keeps only the active one visible. */
class StageManager {
  readonly root = new THREE.Group();
  private readonly kit = new WorldKit();
  private readonly stages = new Map<number, Stage>();
  private actors: ToonActor[] = [];

  get(index: number): Stage {
    const hit = this.stages.get(index);
    if (hit) return hit;
    const shot = SHOTS[index];
    if (!shot) throw new Error(`Unknown shot ${index}`);
    const world = buildWorld(shot.world, this.kit);
    const cast = shot.cast.map((member, i): CastSlot => {
      const anchor = world.anchors[member.anchor];
      if (!anchor) throw new Error(`World "${shot.world}" has no anchor "${member.anchor}"`);
      const actor = createToonActor(member.actor, { gradientMap: this.kit.gradient, seed: index * 13 + i * 5 + 1 });
      actor.mesh.position.copy(anchor);
      actor.mesh.scale.setScalar(member.scale);
      world.group.add(actor.mesh);
      this.actors.push(actor);
      return { member, actor };
    });
    world.group.visible = false;
    this.root.add(world.group);
    const stage = { world, cast };
    this.stages.set(index, stage);
    return stage;
  }

  show(index: number): void {
    for (const [i, s] of this.stages) s.world.group.visible = i === index;
  }

  dispose(): void {
    for (const a of this.actors) a.dispose();
    this.actors = [];
    this.kit.dispose();
    this.stages.clear();
  }
}

const PersisScene: React.FC<{ words: readonly WordTiming[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const manager = useMemo(() => new StageManager(), []);
  const film = useMemo(() => new FilmPipeline(width, height), [width, height]);
  const sample = useMemo(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 35 }), []);
  const filmParams = useRef({ focusDistance: 5, aperture: 0.5, frame: 0, dip: 0 });

  useLayoutEffect(() => {
    scene.add(manager.root);
    return () => {
      scene.remove(manager.root);
    };
  }, [scene, manager]);

  useEffect(
    () => () => {
      manager.dispose();
      film.dispose();
    },
    [manager, film],
  );

  // Layout effect: runs before <ThreeCanvas>' frame renderer calls advance().
  useLayoutEffect(() => {
    const { shot, index, localFrame, progress } = getShotAt(frame);
    const stage = manager.get(index);
    manager.show(index);
    scene.background = stage.world.background;
    scene.fog = stage.world.fog;

    sampleCamera(frame, sample);
    camera.position.copy(sample.position);
    camera.lookAt(sample.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = sample.fov;
      camera.near = 0.05;
      camera.far = 260;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();

    stage.world.update({ frame, localFrame, progress, fps });
    for (const { member, actor } of stage.cast) {
      actor.mesh.visible = isCastVisible(member, progress);
      if (!actor.mesh.visible) continue;
      const speaking = member.speaking.some(([a, b]) => progress >= a && progress <= b);
      actor.update(
        {
          frame,
          expression: expressionAt(member, progress),
          viseme: visemeAt(words, frame, speaking),
          turn: keyed(member.turn ?? [[0, 0]], progress),
          nod: keyed(member.nod ?? [[0, 0]], progress),
          gesture: keyed(member.gesture ?? [[0, 0]], progress),
        },
        camera.position,
      );
    }

    filmParams.current = {
      focusDistance: camera.position.distanceTo(sample.target),
      aperture: shot.aperture,
      frame,
      dip: cutDipAt(frame),
    };
  }, [frame, fps, camera, scene, manager, sample, words]);

  // Priority 1 takes over rendering from R3F so the film pass runs last.
  useFrame(({ gl, scene: s, camera: c }) => {
    if (!(c instanceof THREE.PerspectiveCamera)) return;
    film.setSize(width, height);
    film.render(gl, s, c, filmParams.current);
  }, 1);

  return null;
};

// ── 2D overlays ─────────────────────────────────────────────────────────────

/** Loads Plus Jakarta Sans from Google Fonts; falls back to system sans offline. */
function useCaptionFont(): void {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading caption font'));
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_CSS;
    const done = (): void => continueRender(handle);
    link.onload = () => {
      Promise.all([document.fonts.load(`800 ${CAPTION_FRAMING.fontSize}px "Plus Jakarta Sans"`), document.fonts.load('600 40px "Plus Jakarta Sans"')]).then(done, done);
    };
    link.onerror = done;
    document.head.appendChild(link);
  }, [handle, continueRender]);
}

const Word: React.FC<{ word: WordTiming; active: boolean; spoken: boolean; frame: number }> = ({ word, active, spoken, frame }) => {
  const pop = active ? 1 + 0.09 * (1 - smoothstep(0, 6, frame - word.startFrame)) : 1;
  return (
    <span
      style={{
        display: 'inline-block',
        margin: '0 0.14em',
        color: active ? CAPTION_FRAMING.highlight : spoken ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
        transform: `scale(${pop}) translateY(${active ? -4 : 0}px)`,
        textShadow: active ? '0 0 26px rgba(251,191,36,0.55), 0 6px 0 rgba(23,12,25,0.9)' : '0 6px 0 rgba(23,12,25,0.9)',
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
  const activeIdx = activeWordIndex(words, frame);
  const active = words[activeIdx];
  const enter = smoothstep(page.startFrame - 1, page.startFrame + 5, frame);
  const exit = 1 - smoothstep(page.endFrame - 4, page.endFrame, frame);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: CAPTION_FRAMING.bottom, pointerEvents: 'none' }}>
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
          transform: `translateY(${(1 - enter) * 24}px)`,
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
  const { shot, localFrame } = getShotAt(frame);
  const len = shot.to - shot.from;
  const o = interpolate(localFrame, [10, 22, len - 22, len - 10], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        top: 150,
        left: 80,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '14px 26px',
        borderRadius: 999,
        background: 'rgba(15, 13, 38, 0.62)',
        border: '2px solid rgba(251, 191, 36, 0.55)',
        fontFamily: FONT_FAMILY,
        fontWeight: 800,
        fontSize: 34,
        letterSpacing: '0.12em',
        color: '#F8EBD0',
        opacity: o,
        transform: `translateX(${(1 - o) * -30}px)`,
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 7, background: CAPTION_FRAMING.highlight, boxShadow: '0 0 16px #FBBF24' }} />
      {shot.chip.place}
      <span style={{ color: CAPTION_FRAMING.highlight }}>{shot.chip.year}</span>
    </div>
  );
};

const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [14, 30, 120, 140], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 330, fontFamily: FONT_FAMILY, opacity: o, pointerEvents: 'none' }}>
      <div style={{ fontWeight: 800, fontSize: 40, letterSpacing: '0.42em', color: CAPTION_FRAMING.highlight, textShadow: '0 4px 0 #170c19' }}>SEJARAH PERSIS</div>
      <div
        style={{
          marginTop: 14,
          fontWeight: 800,
          fontSize: 108,
          lineHeight: 1,
          color: '#FFF6E2',
          WebkitTextStroke: '12px #170c19',
          paintOrder: 'stroke fill',
          transform: `scale(${1 + (1 - smoothstep(14, 34, frame)) * 0.08})`,
        }}
      >
        Dalilnya Mana?
      </div>
    </AbsoluteFill>
  );
};

export const Persis: React.FC<PersisProps> = ({ words, sentences }) => {
  const { width, height } = useVideoConfig();
  useCaptionFont();
  const pages = useMemo(() => buildCaptionPages(words, sentences), [words, sentences]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#0f0d26' }}>
      <ThreeCanvas width={width} height={height} shadows="percentage" flat dpr={1} camera={{ fov: 40, near: 0.05, far: 260, position: [0, 7, 15] }} gl={{ antialias: false, preserveDrawingBuffer: true }}>
        <PersisScene words={words} />
      </ThreeCanvas>
      {/* Bottom scrim keeps captions legible over bright scenes. */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,8,28,0.72) 0%, rgba(10,8,28,0) 34%)', pointerEvents: 'none' }} />
      <TitleCard />
      <ShotChip />
      <Captions pages={pages} words={words} />
      <Audio src={staticFile('voice.wav')} />
      <Audio src={staticFile('sfx.wav')} volume={0.85} />
    </AbsoluteFill>
  );
};
