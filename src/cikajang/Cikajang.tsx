import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, Audio, type CalculateMetadataFunction, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import {
  CAPTION_FRAMING,
  type CaptionPage,
  type CastMember,
  CIKAJANG_DURATION_IN_FRAMES,
  CIKAJANG_FPS,
  HOOK,
  SHOTS,
  type SentenceTiming,
  type WordTiming,
  activeWordIndex,
  apertureAt,
  blendKeys,
  buildCaptionPages,
  captionPageAt,
  cutDipAt,
  easeInCubic,
  easeOutCubic,
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
} from './story';
import { type ToonActor, createToonActor } from './toon';
import { FilmPipeline, WorldKit, type WorldScene, buildWorld } from './worlds';

export type CikajangProps = {
  words: WordTiming[];
  sentences: SentenceTiming[];
};

export const CIKAJANG_DEFAULT_PROPS: CikajangProps = { words: [], sentences: [] };

const FONT_FAMILY = '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=block';
/** Never wait longer than this for Google Fonts; fall back to the system sans. */
const FONT_TIMEOUT_MS = 1200;

async function fetchJson(name: string, signal: AbortSignal, optional: boolean): Promise<unknown> {
  const res = await fetch(staticFile(name), { signal });
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`Could not load public/${name} (${res.status})`);
  }
  return (await res.json()) as unknown;
}

/** Loads narration timings from public/cikajang/ before rendering so props stay serialisable. */
export const calculateCikajangMetadata: CalculateMetadataFunction<CikajangProps> = async ({ props, abortSignal }) => {
  if (props.words.length > 0) return { props, durationInFrames: CIKAJANG_DURATION_IN_FRAMES };
  const [rawWords, rawSentences] = await Promise.all([fetchJson('cikajang/words.json', abortSignal, false), fetchJson('cikajang/sentences.json', abortSignal, true)]);
  const words = parseWords(rawWords, CIKAJANG_FPS);
  const sentences = parseSentences(rawSentences, CIKAJANG_FPS, words);
  return { props: { words, sentences }, durationInFrames: CIKAJANG_DURATION_IN_FRAMES };
};

// ── 3D stage ────────────────────────────────────────────────────────────────

interface CastSlot {
  member: CastMember;
  actor: ToonActor;
  anchor: THREE.Vector3;
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
    const world = buildWorld(shot.world, this.kit, shot.id);
    const cast = shot.cast.map((member, i): CastSlot => {
      const anchor = world.anchors[member.anchor];
      if (!anchor) throw new Error(`World "${shot.world}" has no anchor "${member.anchor}"`);
      const actor = createToonActor(
        member.actor,
        { leftProp: member.leftProp ?? 'none', rightProp: member.rightProp ?? 'none', bodyProp: member.bodyProp ?? 'none' },
        { gradientMap: this.kit.gradient, seed: index * 13 + i * 5 + 1 },
      );
      actor.mesh.position.copy(anchor);
      actor.mesh.scale.setScalar(member.scale);
      world.group.add(actor.mesh);
      this.actors.push(actor);
      return { member, actor, anchor: anchor.clone() };
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

const offsetNow = new THREE.Vector3();
const offsetPrev = new THREE.Vector3();
const offsetStart = new THREE.Vector3();

const CikajangScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const manager = useMemo(() => new StageManager(), []);
  const film = useMemo(() => new FilmPipeline(width, height), [width, height]);
  const sample = useMemo(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 35, roll: 0, focus: 5 }), []);
  const filmParams = useRef({ focusDistance: 5, aperture: 0.5, frame: 0, dip: 0, sepia: 0, grey: 0, tone: 0.4 });

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
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const { shot, index, localFrame, progress } = getShotAt(frame);
    const stage = manager.get(index);
    manager.show(index);
    scene.background = stage.world.background;
    scene.fog = stage.world.fog;

    sampleCamera(frame, sample);
    camera.position.copy(sample.position);
    camera.lookAt(sample.target);
    camera.rotateZ(sample.roll);
    camera.fov = sample.fov;
    camera.near = 0.05;
    camera.far = 400;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    stage.world.update({ frame, localFrame, progress, fps, camera });
    const len = Math.max(1, shot.to - shot.from - 1);
    for (const { member, actor, anchor } of stage.cast) {
      actor.mesh.visible = isCastVisible(member, progress);
      if (!actor.mesh.visible) continue;
      // Keyed walk path: legs cycle with distance travelled, so feet never skate.
      keyedVec3(member.move, progress, offsetNow);
      keyedVec3(member.move, Math.max(0, progress - 1 / len), offsetPrev);
      keyedVec3(member.move, 0, offsetStart);
      actor.mesh.position.copy(anchor).add(offsetNow);
      const moving = member.move ? offsetNow.distanceTo(offsetPrev) > 0.0015 : false;
      const travelled = offsetNow.distanceTo(offsetStart);
      actor.update(
        {
          frame,
          progress,
          expression: blendKeys(member.expression, 'neutral', progress, 0.04),
          turn: keyed(member.turn ?? [[0, 0]], progress),
          nod: keyed(member.nod ?? [[0, 0]], progress),
          armRight: blendKeys(member.right, 'side', progress),
          armLeft: blendKeys(member.left, 'side', progress),
          walkPhase: moving ? (travelled / member.scale) * 11 : null,
          walkDir: offsetNow.x >= offsetPrev.x ? 1 : -1,
          drawProgress: smoothstep(0.06, 0.62, progress),
        },
        camera.position,
      );
    }

    const grade = gradeAt(frame);
    filmParams.current = { focusDistance: sample.focus, aperture: apertureAt(frame), frame, dip: cutDipAt(frame), sepia: grade.sepia, grey: grade.grey, tone: grade.tone };
  }, [frame, fps, camera, scene, manager, sample]);

  // Priority 1 takes over rendering from R3F so the film pass runs last.
  useFrame(({ gl, scene: s, camera: c }) => {
    if (!(c instanceof THREE.PerspectiveCamera)) return;
    film.setSize(width, height);
    film.render(gl, s, c, filmParams.current);
  }, 1);

  return null;
};

// ── 2D overlays ─────────────────────────────────────────────────────────────

/** Loads Plus Jakarta Sans; continues after FONT_TIMEOUT_MS with the system font so renders never time out. */
function useCaptionFont(): void {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading caption font', { timeoutInMilliseconds: 10000 }));
  useEffect(() => {
    let resolved = false;
    const done = (): void => {
      if (!resolved) {
        resolved = true;
        continueRender(handle);
      }
    };
    const timer = setTimeout(done, FONT_TIMEOUT_MS);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_CSS;
    link.onload = () => {
      if (document.fonts && document.fonts.load) {
        Promise.all([document.fonts.load(`800 ${CAPTION_FRAMING.fontSize}px "Plus Jakarta Sans"`), document.fonts.load('600 40px "Plus Jakarta Sans"')]).then(done, done);
      } else {
        done();
      }
    };
    link.onerror = done;
    document.head.appendChild(link);
    return () => clearTimeout(timer);
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
  if (!page || frame < HOOK.outEnd - 6) return null;
  const active = words[activeWordIndex(words, frame)];
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
  const { shot, index, localFrame, progress } = getShotAt(frame);
  const len = shot.to - shot.from;
  const start = index === 0 ? HOOK.outEnd - shot.from : 10;
  const o = interpolate(localFrame, [start, start + 12, len - 22, len - 10], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const chip = stepped(shot.chip, progress);
  // Re-pop when the chip text changes mid-shot (1935 → 1947).
  const changeAt = shot.chip.find(([t]) => t > 0 && progress >= t)?.[0];
  const pop = changeAt === undefined ? 1 : 1 + 0.12 * Math.exp(-(progress - changeAt) * 40);
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
        background: 'rgba(20, 16, 30, 0.62)',
        border: '2px solid rgba(251, 191, 36, 0.55)',
        fontFamily: FONT_FAMILY,
        fontWeight: 800,
        fontSize: 32,
        letterSpacing: '0.1em',
        color: '#F8EBD0',
        opacity: o,
        transform: `translateX(${(1 - o) * -30}px) scale(${pop})`,
        transformOrigin: 'left center',
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 7, background: CAPTION_FRAMING.highlight, boxShadow: '0 0 16px #FBBF24' }} />
      {chip.place}
      <span style={{ color: CAPTION_FRAMING.highlight }}>{chip.year}</span>
    </div>
  );
};

/** 0–3 s hook: teaser badge drops in, the two-line title slams down with a squash and gold aura. */
const HookTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { badgeIn, impactFrame: hit, holdUntil, outEnd } = HOOK;
  if (frame >= outEnd) return null;
  const d = frame - hit;
  const out = smoothstep(holdUntil, outEnd, frame);
  const shake = hookShakeAt(frame);
  const sx = shake * 14 * Math.sin(frame * 2.9);
  const sy = shake * 10 * Math.sin(frame * 3.7 + 1);
  const rot = shake * 1.2 * Math.sin(frame * 2.6 + 1.3);
  const fall = smoothstep(hit - 7, hit, frame);
  const titleScale = d < 0 ? lerp(2.4, 1, easeInCubic(fall)) : 1 - 0.14 * Math.exp(-d / 4.5) * Math.cos(d * 0.9);
  const squashY = d >= 0 ? 1 + 0.1 * Math.exp(-d / 3) * Math.cos(d * 1.2 + Math.PI) : 1;
  const aura = d < 0 ? 0 : 0.5 + 0.5 * Math.exp(-d / 8) + 0.12 * Math.sin(frame * 0.25);
  const flash = d < 0 ? 0 : 0.5 * Math.exp(-d / 3);
  const badgeT = easeOutCubic(smoothstep(badgeIn, badgeIn + 8, frame));
  const rule = easeOutCubic(smoothstep(hit, hit + 16, frame));
  const ruleWidth = rule * (220 + 14 * Math.sin(frame * 0.18));
  return (
    <>
      <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse 80% 40% at 50% 28%, rgba(255,236,170,${flash}) 0%, rgba(251,191,36,${flash * 0.4}) 40%, rgba(0,0,0,0) 75%)` }} />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          paddingTop: 250,
          fontFamily: FONT_FAMILY,
          pointerEvents: 'none',
          opacity: 1 - out,
          transform: `translate(${sx}px, ${sy - out * 40}px) rotate(${rot}deg) scale(${1 + out * 0.08})`,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            padding: '14px 28px',
            borderRadius: 18,
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: `${lerp(0.36, 0.1, badgeT)}em`,
            color: '#FFF3D6',
            background: 'linear-gradient(180deg, rgba(150,32,32,0.92), rgba(98,18,28,0.92))',
            border: `3px solid ${CAPTION_FRAMING.highlight}`,
            boxShadow: `0 0 ${24 + aura * 24}px rgba(251,191,36,${0.25 + aura * 0.3}), 0 8px 0 rgba(23,12,25,0.85)`,
            opacity: badgeT,
            transform: `translateY(${(1 - badgeT) * -60}px)`,
          }}
        >
          {HOOK.teaser}
        </div>
        <div style={{ position: 'relative', marginTop: 36, textAlign: 'center' }}>
          <div
            style={{
              position: 'absolute',
              inset: '-50px -70px',
              borderRadius: '50%',
              background: `radial-gradient(ellipse at center, rgba(251,191,36,${aura * 0.4}) 0%, rgba(251,191,36,0) 70%)`,
              filter: 'blur(8px)',
            }}
          />
          {HOOK.title.map((line) => (
            <div
              key={line}
              style={{
                position: 'relative',
                fontWeight: 800,
                fontSize: 108,
                lineHeight: 1.02,
                color: '#FFF6E2',
                WebkitTextStroke: '12px #170c19',
                paintOrder: 'stroke fill',
                textShadow: `0 0 ${20 + aura * 50}px rgba(251,191,36,${0.35 + aura * 0.5}), 0 10px 0 rgba(23,12,25,0.9)`,
                opacity: d < 0 ? fall : 1,
                transform: `scale(${titleScale}, ${titleScale * squashY})`,
                whiteSpace: 'nowrap',
              }}
            >
              {line}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 30, opacity: rule }}>
          <div style={{ width: ruleWidth, height: 5, borderRadius: 3, background: `linear-gradient(90deg, rgba(251,191,36,0), ${CAPTION_FRAMING.highlight})` }} />
          <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: '0.3em', color: CAPTION_FRAMING.highlight, textShadow: '0 4px 0 #170c19', whiteSpace: 'nowrap' }}>{HOOK.kicker}</div>
          <div style={{ width: ruleWidth, height: 5, borderRadius: 3, background: `linear-gradient(90deg, ${CAPTION_FRAMING.highlight}, rgba(251,191,36,0))` }} />
        </div>
      </AbsoluteFill>
    </>
  );
};

export const Cikajang: React.FC<CikajangProps> = ({ words, sentences }) => {
  const { width, height } = useVideoConfig();
  useCaptionFont();
  const pages = useMemo(() => buildCaptionPages(words, sentences), [words, sentences]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#14101e' }}>
      <ThreeCanvas width={width} height={height} shadows="percentage" flat dpr={1} camera={{ fov: 40, near: 0.05, far: 400, position: [0, 1.5, 5] }} gl={{ antialias: false, preserveDrawingBuffer: true }}>
        <CikajangScene />
      </ThreeCanvas>
      {/* Bottom scrim keeps captions legible over bright scenes. */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,8,20,0.72) 0%, rgba(10,8,20,0) 34%)', pointerEvents: 'none' }} />
      <HookTitle />
      <ShotChip />
      <Captions pages={pages} words={words} />
      <Audio src={staticFile('cikajang/voice.wav')} />
    </AbsoluteFill>
  );
};
