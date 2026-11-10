import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, Audio, type CalculateMetadataFunction, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import {
  CAPTION_FRAMING,
  COLOR_SCRIPT,
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
  crossfadeAt,
  cutDipAt,
  cutFlashAt,
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
  snapKeys,
  stepped,
} from './story';
import { type ToonActor, WALK_PHASE_PER_METRE, createToonActor } from './toon';
import { DIEGETIC_FONT_CSS, DIEGETIC_FONT_FACES, FONT_GUARD_MS } from './fonts';
import { FxLayer, disposeFxTextures, speedLineSet, speedLinesAt } from './fx';
import { type FilmParams, FilmPipeline, WorldKit, type WorldScene, buildWorld } from './worlds';

export type CikajangProps = {
  words: WordTiming[];
  sentences: SentenceTiming[];
};

export const CIKAJANG_DEFAULT_PROPS: CikajangProps = { words: [], sentences: [] };

const FONT_FAMILY = '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';

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
  blob: THREE.Mesh;
}

/** Contact shadow sits 1.5 cm above the floor to avoid z-fighting. */
const BLOB_LIFT = new THREE.Vector3(0, 0.015, 0);

/**
 * Camera-relative frozen sun: every shadow-casting directional light is re-aimed
 * once per shot at the mean camera target (keeping its original direction), with a
 * tight shadow frustum around the action, so directional shadows are crisp and
 * never shimmer as the camera moves.
 */
function freezeSun(group: THREE.Group, shot: (typeof SHOTS)[number]): void {
  const centre = new THREE.Vector3();
  for (const k of shot.camera) centre.add(new THREE.Vector3(...k.target));
  centre.divideScalar(Math.max(1, shot.camera.length));
  let spread = 0;
  for (const k of shot.camera) spread = Math.max(spread, centre.distanceTo(new THREE.Vector3(...k.target)));
  // Long-range targets (crane-ups to distant slopes) are clamped so the frustum stays tight.
  const extent = Math.min(14, 4 + spread * 0.6);
  const focus = centre.clone();
  if (spread > 12) focus.lerp(new THREE.Vector3(...(shot.camera[0]?.target ?? [0, 0, 0])), 0.8);
  group.traverse((o) => {
    if (!(o instanceof THREE.DirectionalLight) || !o.castShadow) return;
    const dir = o.position.clone().sub(o.target.position).normalize();
    o.target.position.copy(focus);
    o.position.copy(focus).addScaledVector(dir, 30);
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
  /** Unit vector from the scene toward the key (shadow-casting) light. */
  keyDir: THREE.Vector3;
}

/** Direction toward the brightest shadow-casting directional light (the key). */
function keyLightDir(group: THREE.Group): THREE.Vector3 {
  let best: THREE.DirectionalLight | null = null;
  group.traverse((o) => {
    if (o instanceof THREE.DirectionalLight && (!best || (o.castShadow && !best.castShadow) || (o.castShadow === best.castShadow && o.intensity > best.intensity))) best = o;
  });
  const key = best as THREE.DirectionalLight | null;
  return key ? key.position.clone().sub(key.target.position).normalize() : new THREE.Vector3(1, 1, 1).normalize();
}

/** Builds each shot's world + cast on first use and keeps only the active one visible. */
class StageManager {
  readonly root = new THREE.Group();
  private readonly kit = new WorldKit();
  private readonly stages = new Map<number, Stage>();
  private actors: ToonActor[] = [];
  private fxLayers: FxLayer[] = [];
  private blobGeo: THREE.CircleGeometry | null = null;
  private blobMat: THREE.MeshBasicMaterial | null = null;

  /** Soft-edged ellipse (radial alpha) shared by every contact shadow. */
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
      const tex = new THREE.CanvasTexture(c);
      this.blobMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    }
    return this.blobMat;
  }

  get(index: number): Stage {
    const hit = this.stages.get(index);
    if (hit) return hit;
    const shot = SHOTS[index];
    if (!shot) throw new Error(`Unknown shot ${index}`);
    const world = buildWorld(shot.world, this.kit, shot.id);
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
      // Contact shadow blob under the feet: figures never float.
      const blob = new THREE.Mesh(this.blobGeometry(), this.blobMaterial());
      blob.rotation.x = -Math.PI / 2;
      blob.scale.set(0.9 * member.scale, 0.55 * member.scale, 1);
      blob.position.copy(anchor).add(BLOB_LIFT);
      blob.renderOrder = 1;
      world.group.add(blob);
      return { member, actor, anchor: anchor.clone(), blob };
    });
    world.group.visible = false;
    const fx = new FxLayer(index);
    world.group.add(fx.group);
    this.fxLayers.push(fx);
    this.root.add(world.group);
    const stage = { world, cast, fx, keyDir: keyLightDir(world.group) };
    this.stages.set(index, stage);
    return stage;
  }

  show(index: number): void {
    for (const [i, s] of this.stages) s.world.group.visible = i === index;
  }

  dispose(): void {
    for (const a of this.actors) a.dispose();
    this.actors = [];
    for (const f of this.fxLayers) f.dispose();
    this.fxLayers = [];
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
const camRight = new THREE.Vector3();

const CikajangScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const manager = useMemo(() => new StageManager(), []);
  const film = useMemo(() => new FilmPipeline(width, height), [width, height]);
  const sample = useMemo(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 35, roll: 0, focus: 5 }), []);
  const filmParams = useRef<FilmParams>({ focusDistance: 5, aperture: 0.5, frame: 0, dip: 0, sepia: 0, grey: 0, tone: 0.4, flash: 0 });

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

  // Poses world, camera, cast and FX for `frame` and returns its film params.
  // Pure in `frame`, so it can run twice per frame during a cross-dissolve.
  const poseAt = useMemo(
    () =>
      (f: number, cam: THREE.PerspectiveCamera): FilmParams => {
        const { shot, index, localFrame, progress } = getShotAt(f);
        const stage = manager.get(index);
        manager.show(index);
        scene.background = stage.world.background;
        scene.fog = stage.world.fog;

        sampleCamera(f, sample);
        cam.position.copy(sample.position);
        cam.lookAt(sample.target);
        cam.rotateZ(sample.roll);
        cam.fov = sample.fov;
        cam.near = 0.05;
        cam.far = 400;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();

        stage.world.update({ frame: f, localFrame, progress, fps, camera: cam });
        const len = Math.max(1, shot.to - shot.from - 1);
        const palette = COLOR_SCRIPT[shot.phase];
        // Which screen side the key light comes from, for crescent shade / rim / ink weight.
        camRight.setFromMatrixColumn(cam.matrixWorld, 0);
        const light = { rim: palette.rim, rimStrength: palette.rimStrength, side: stage.keyDir.dot(camRight) >= 0 ? 1 : -1 };
        for (const slot of stage.cast) {
          const { member, actor, anchor, blob } = slot;
          actor.mesh.visible = isCastVisible(member, progress);
          blob.visible = actor.mesh.visible;
          if (!actor.mesh.visible) continue;
          // Keyed walk path: legs cycle with distance travelled, so feet never skate.
          keyedVec3(member.move, progress, offsetNow);
          keyedVec3(member.move, Math.max(0, progress - 1 / len), offsetPrev);
          keyedVec3(member.move, 0, offsetStart);
          actor.mesh.position.copy(anchor).add(offsetNow);
          blob.position.copy(actor.mesh.position).add(BLOB_LIFT);
          const moving = member.move ? offsetNow.distanceTo(offsetPrev) > 0.0015 : false;
          const travelled = offsetNow.distanceTo(offsetStart);
          // Snappy expression swap: 2-frame change exactly on the beat, with a blink.
          const expr = snapKeys(member.expression, 'neutral', progress, len);
          actor.update(
            {
              frame: f,
              progress,
              expression: { from: expr.from, to: expr.to, mix: expr.mix },
              expressionAge: expr.age,
              light,
              turn: keyed(member.turn ?? [[0, 0]], progress),
              nod: keyed(member.nod ?? [[0, 0]], progress),
              armRight: blendKeys(member.right, 'side', progress),
              armLeft: blendKeys(member.left, 'side', progress),
              walkPhase: moving ? (travelled / member.scale) * WALK_PHASE_PER_METRE : null,
              walkDir: offsetNow.x >= offsetPrev.x ? 1 : -1,
              drawProgress: smoothstep(0.06, 0.62, progress),
            },
            cam.position,
          );
        }
        stage.fx.update(
          f,
          cam,
          stage.cast.map(({ member, actor }) => ({ position: actor.mesh.position, scale: member.scale, visible: actor.mesh.visible })),
        );

        const grade = gradeAt(f);
        return { focusDistance: sample.focus, aperture: apertureAt(f), frame: f, dip: cutDipAt(f), sepia: grade.sepia, grey: grade.grey, tone: grade.tone, flash: cutFlashAt(f) };
      },
    [fps, scene, manager, sample],
  );

  // Layout effect: runs before <ThreeCanvas>' frame renderer calls advance().
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    filmParams.current = poseAt(frame, camera);
  }, [frame, camera, poseAt]);

  // Priority 1 takes over rendering from R3F so the film pass runs last.
  useFrame(({ gl, scene: s, camera: c }) => {
    if (!(c instanceof THREE.PerspectiveCamera)) return;
    film.setSize(width, height);
    const xf = crossfadeAt(frame);
    if (xf) {
      // Cross-dissolve: finish the outgoing shot's last frame first, then re-pose the current one.
      film.renderPrev(gl, s, c, poseAt(xf.prevFrame, c));
      filmParams.current = { ...poseAt(frame, c), xfade: xf.weight };
    }
    film.render(gl, s, c, filmParams.current);
  }, 1);

  return null;
};

// ── 2D overlays ─────────────────────────────────────────────────────────────

/**
 * Font guard: loads the caption face plus every diegetic era face (fonts.ts)
 * and reports ready once they resolve or after FONT_GUARD_MS, whichever comes
 * first. World canvases (signs, plaques, mural) are painted when the 3D stage
 * mounts, so the stage waits for `ready`; offline renders fall back to the
 * same-character system stacks instead of hanging.
 */
function useFontGuard(): boolean {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading caption + diegetic fonts', { timeoutInMilliseconds: 10000 }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let resolved = false;
    const done = (): void => {
      if (!resolved) {
        resolved = true;
        setReady(true);
      }
    };
    const timer = setTimeout(done, FONT_GUARD_MS);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = DIEGETIC_FONT_CSS;
    link.onload = () => {
      if (document.fonts && document.fonts.load) {
        const faces = [`800 ${CAPTION_FRAMING.fontSize}px "Plus Jakarta Sans"`, ...DIEGETIC_FONT_FACES];
        Promise.all(faces.map((f) => document.fonts.load(f))).then(done, done);
      } else {
        done();
      }
    };
    link.onerror = done;
    document.head.appendChild(link);
    return () => clearTimeout(timer);
  }, []);
  // Release the render only after the stage has mounted with the fonts in place.
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle, continueRender]);
  return ready;
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
  // Crisp 2-frame in/out: long fades read as a translucent, blurry caption mid-sentence.
  const enter = smoothstep(page.startFrame - 1, page.startFrame + 1, frame);
  const exit = 1 - smoothstep(page.endFrame - 2, page.endFrame, frame);
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
          transform: `translateY(${(1 - enter) * 10}px)`,
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
      <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse 70% 22% at 50% 14%, rgba(255,236,170,${flash * 0.6}) 0%, rgba(251,191,36,${flash * 0.25}) 40%, rgba(0,0,0,0) 75%)` }} />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          // Kept in the top ~30 % so the macro punch-in on the carved years stays clear.
          paddingTop: 130,
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
        <div style={{ position: 'relative', marginTop: 24, textAlign: 'center' }}>
          <div
            style={{
              position: 'absolute',
              inset: '-40px -60px',
              borderRadius: '50%',
              background: `radial-gradient(ellipse at center, rgba(251,191,36,${aura * 0.22}) 0%, rgba(251,191,36,0) 70%)`,
              filter: 'blur(8px)',
            }}
          />
          {HOOK.title.map((line) => (
            <div
              key={line}
              style={{
                position: 'relative',
                fontWeight: 800,
                fontSize: 92,
                lineHeight: 1.02,
                color: '#FFF6E2',
                WebkitTextStroke: '10px #170c19',
                paintOrder: 'stroke fill',
                textShadow: `0 0 ${14 + aura * 30}px rgba(251,191,36,${0.25 + aura * 0.35}), 0 8px 0 rgba(23,12,25,0.9)`,
                opacity: d < 0 ? fall : 1,
                transform: `scale(${titleScale}, ${titleScale * squashY})`,
                whiteSpace: 'nowrap',
              }}
            >
              {line}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 22, opacity: rule }}>
          <div style={{ width: ruleWidth, height: 5, borderRadius: 3, background: `linear-gradient(90deg, rgba(251,191,36,0), ${CAPTION_FRAMING.highlight})` }} />
          <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: '0.3em', color: CAPTION_FRAMING.highlight, textShadow: '0 4px 0 #170c19', whiteSpace: 'nowrap' }}>{HOOK.kicker}</div>
          <div style={{ width: ruleWidth, height: 5, borderRadius: 3, background: `linear-gradient(90deg, ${CAPTION_FRAMING.highlight}, rgba(251,191,36,0))` }} />
        </div>
      </AbsoluteFill>
    </>
  );
};

/**
 * Comic radial speed lines on impact beats (`speedLines` FX cues). Thin white
 * wedges from the frame edge inward; the centre ellipse stays clear so faces
 * and signs are never covered.
 */
const SpeedLines: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const k = speedLinesAt(frame);
  if (k <= 0) return null;
  const cx = width / 2;
  const cy = height * 0.46;
  const reach = Math.hypot(width, height) * 0.62;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: k }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {speedLineSet(frame).map((l, i) => {
          const ca = Math.cos(l.angle);
          const sa = Math.sin(l.angle);
          // Shrink toward the centre as the effect fades, so lines retreat to the edges.
          const inner = reach * (l.inner + (1 - k) * 0.25);
          const nx = -sa * l.width;
          const ny = ca * l.width;
          const x0 = cx + ca * inner;
          const y0 = cy + sa * inner;
          const x1 = cx + ca * reach;
          const y1 = cy + sa * reach;
          return <polygon key={i} points={`${x0},${y0} ${x1 + nx},${y1 + ny} ${x1 - nx},${y1 - ny}`} fill="rgba(255,252,240,0.82)" />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

export const Cikajang: React.FC<CikajangProps> = ({ words, sentences }) => {
  const { width, height } = useVideoConfig();
  const fontsReady = useFontGuard();
  const pages = useMemo(() => buildCaptionPages(words, sentences), [words, sentences]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#14101e' }}>
      {fontsReady ? (
        <ThreeCanvas width={width} height={height} shadows="percentage" flat dpr={1} camera={{ fov: 40, near: 0.05, far: 400, position: [0, 1.5, 5] }} gl={{ antialias: false, preserveDrawingBuffer: true }}>
          <CikajangScene />
        </ThreeCanvas>
      ) : null}
      {/* Bottom scrim keeps captions legible over bright scenes. */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,8,20,0.82) 0%, rgba(10,8,20,0.55) 14%, rgba(10,8,20,0) 36%)', pointerEvents: 'none' }} />
      <SpeedLines />
      <HookTitle />
      <ShotChip />
      <Captions pages={pages} words={words} />
      <Audio src={staticFile('cikajang/voice.wav')} />
    </AbsoluteFill>
  );
};
