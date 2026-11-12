import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AbsoluteFill,
  Audio,
  type CalculateMetadataFunction,
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
  HOTELLING_DURATION_IN_FRAMES,
  HOTELLING_FPS,
  HOTELLING_HEIGHT,
  HOTELLING_WIDTH,
  KEYWORDS,
  buildCaptionPages,
  captionPageAt,
  castPoseAt,
  clamp01,
  gradingAt,
  hookShakeAt,
  parseSentences,
  parseWords,
  sampleCamera,
  shareAt,
  shotStateAt,
  smoothKeys,
  snapKeys,
  transitionAt,
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

// ── Overlays ────────────────────────────────────────────────────────────────

const outlined = (px: number): CSSProperties => ({
  WebkitTextStroke: `${px}px #000`,
  paintOrder: 'stroke fill',
});

function HookTitle({ frame }: { frame: number }) {
  if (frame < HOOK.badgeIn || frame > HOOK.outEnd) return null;
  const shake = hookShakeAt(frame);
  const inT = clamp01((frame - HOOK.impactFrame + 6) / 6);
  const out = clamp01((frame - HOOK.holdUntil) / (HOOK.outEnd - HOOK.holdUntil));
  const badge = clamp01((frame - HOOK.badgeIn) / 6);
  return (
    <div
      style={{
        position: 'absolute',
        top: 220,
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: '0 50px',
        opacity: 1 - out,
        transform: `translateY(${shake * 14 - out * 40}px)`,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          backgroundColor: '#FBBF24',
          color: '#0f0a1e',
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 30,
          padding: '8px 22px',
          borderRadius: 8,
          letterSpacing: 2,
          marginBottom: 18,
          border: '4px solid #000',
          transform: `scale(${0.6 + 0.4 * badge})`,
          opacity: badge,
        }}
      >
        {HOOK.teaser}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 96,
          lineHeight: 1.02,
          color: '#ffffff',
          transform: `scale(${1.6 - 0.6 * inT + shake * 0.06})`,
          opacity: inT,
          textShadow: '0 10px 30px rgba(0,0,0,0.6)',
          ...outlined(16),
        }}
      >
        {HOOK.title[0]}
        <br />
        <span style={{ color: '#FBBF24' }}>{HOOK.title[1]}</span>
      </div>
      <div style={{ marginTop: 16, fontFamily: FONT, fontWeight: 900, fontSize: 38, color: '#7dd3fc', opacity: inT, ...outlined(8) }}>{HOOK.kicker}</div>
    </div>
  );
}

function KeywordSlam({ frame }: { frame: number }) {
  const kw = KEYWORDS.find((k) => frame >= k.from && frame < k.to);
  if (!kw) return null;
  const t = frame - kw.from;
  const pop = t < 6 ? 1.5 - 0.5 * (t / 6) : 1 + Math.sin(t * 0.25) * 0.015;
  const fade = clamp01((kw.to - frame) / 6) * clamp01(t / 3);
  return (
    <div style={{ position: 'absolute', top: 330, left: 0, right: 0, textAlign: 'center', opacity: fade }}>
      <span
        style={{
          display: 'inline-block',
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 104,
          color: kw.accent,
          transform: `scale(${pop}) rotate(-3deg)`,
          ...outlined(18),
          textShadow: '0 12px 30px rgba(0,0,0,0.55)',
        }}
      >
        {kw.text}
      </span>
    </div>
  );
}

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

function Captions({ frame, words, sentences }: { frame: number; words: readonly WordTiming[]; sentences: readonly SentenceTiming[] }) {
  const pages = useMemo(() => buildCaptionPages(words, sentences), [words, sentences]);
  const page = captionPageAt(pages, frame);
  if (!page) return null;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: CAPTION_FRAMING.bottom,
        left: CAPTION_FRAMING.sidePadding,
        right: CAPTION_FRAMING.sidePadding,
        textAlign: 'center',
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: CAPTION_FRAMING.fontSize,
        lineHeight: CAPTION_FRAMING.lineHeight,
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
                  margin: '0 10px',
                  color: active ? CAPTION_FRAMING.highlight : said ? '#ffffff' : 'rgba(255,255,255,0.82)',
                  transform: active ? 'scale(1.1) translateY(-4px)' : 'none',
                  ...outlined(14),
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
      const faces = [`900 ${CAPTION_FRAMING.fontSize}px "Plus Jakarta Sans"`, ...DIEGETIC_FONT_FACES];
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

export function HotellingLaw({ words: wordsProp, sentences: sentencesProp }: HotellingLawProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const fontsReady = useFontGuard();
  const { words, sentences } = useNarration(wordsProp, sentencesProp);
  const { shot } = shotStateAt(frame);
  const dip = transitionAt(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: '#07040d' }}>
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

      {/* Painterly vignette + warm grain, then a bottom scrim for captions. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(20,8,24,0.55) 100%)', pointerEvents: 'none' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,6,20,0.72) 0%, rgba(10,6,20,0.4) 16%, rgba(10,6,20,0) 34%)', pointerEvents: 'none' }} />

      {shot.chip ? (
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: 60,
            padding: '10px 22px',
            backgroundColor: 'rgba(15, 10, 30, 0.85)',
            border: '3px solid #FBBF24',
            borderRadius: 26,
            color: '#FBBF24',
            fontFamily: FONT,
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: 2,
          }}
        >
          {shot.chip}
        </div>
      ) : null}

      <ShareBar frame={frame} />
      <HookTitle frame={frame} />
      <KeywordSlam frame={frame} />
      <Captions frame={frame} words={words} sentences={sentences} />

      {dip.alpha > 0.001 ? <AbsoluteFill style={{ backgroundColor: dip.color, opacity: dip.alpha, pointerEvents: 'none' }} /> : null}

      <Audio src={staticFile('hotelling-law/voice.wav')} />
      <Audio src={staticFile('hotelling-law/sfx.wav')} volume={0.55} />
    </AbsoluteFill>
  );
}
