import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { DIEGETIC_FONT_CSS, FONT_GUARD_MS } from '../cikajang/fonts';
import {
  HOTELLING_DURATION_IN_FRAMES,
  HOTELLING_FPS,
  HOTELLING_HEIGHT,
  HOTELLING_WIDTH,
  HOOK,
  type WordTiming,
  activeWordIndex,
  hookShakeAt,
  parseWords,
  sampleCamera,
  shotAt,
} from './story';
import { ToonActor } from './toon';
import { createBeachWorld, createCityWorld, createTheoryWorld, type WorldScene } from './worlds';

export type HotellingLawProps = {
  words?: WordTiming[];
};

export const hotellingCalculateMetadata: CalculateMetadataFunction<HotellingLawProps> = async () => {
  return {
    fps: HOTELLING_FPS,
    durationInFrames: HOTELLING_DURATION_IN_FRAMES,
    width: HOTELLING_WIDTH,
    height: HOTELLING_HEIGHT,
  };
};

function ThreeStage({
  frame,
  words,
}: {
  frame: number;
  words: readonly WordTiming[];
}) {
  const { camera, scene } = useThree();
  const currentShot = shotAt(frame);

  // Build worlds
  const cityWorld = useMemo(() => createCityWorld('nightCityNeon'), []);
  const theoryWorld = useMemo(() => createTheoryWorld(), []);
  const beachWorld = useMemo(() => createBeachWorld('tropicalBeach'), []);

  // Actors pool
  const actors = useMemo(() => {
    return {
      pedagangBiru: new ToonActor('pedagangBiru'),
      pedagangMerah: new ToonActor('pedagangMerah'),
      profesor: new ToonActor('profesor'),
      pembeli: new ToonActor('pembeli'),
      kucing: new ToonActor('kucing'),
    };
  }, []);

  // Active scene selection
  const activeWorld: WorldScene = useMemo(() => {
    if (currentShot.world === 'theoryRoom') return theoryWorld;
    if (currentShot.world === 'beachSim' || currentShot.world === 'beachEquilibrium') return beachWorld;
    return cityWorld;
  }, [currentShot.world, cityWorld, theoryWorld, beachWorld]);

  useLayoutEffect(() => {
    scene.clear();
    scene.add(activeWorld.group);

    // Add ambient and key lights
    const ambient = new THREE.AmbientLight('#ffffff', 0.85);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight('#fffbeb', 1.8);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);

    // Attach cast actors
    for (const c of currentShot.cast) {
      const actor = actors[c.id as keyof typeof actors];
      if (actor) {
        actor.mesh.position.set(c.pos[0], c.pos[1], c.pos[2]);
        if (c.yaw) actor.mesh.rotation.y = c.yaw;
        scene.add(actor.mesh);
      }
    }
  }, [scene, activeWorld, currentShot, actors]);

  useFrame(() => {
    const cam = sampleCamera(frame);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.target);
    camera.rotation.z = cam.roll;

    activeWorld.update({
      frame,
      localFrame: frame - currentShot.from,
      progress: (frame - currentShot.from) / Math.max(1, currentShot.to - currentShot.from - 1),
      fps: 30,
      camera: camera as THREE.PerspectiveCamera,
    });

    for (const c of currentShot.cast) {
      const actor = actors[c.id as keyof typeof actors];
      if (actor) {
        actor.update(
          {
            frame,
            expression: c.expression,
            armL: c.armL,
            armR: c.armR,
            body: c.body,
            speaking: c.id === 'profesor' || c.id === 'pembeli' || c.id === 'pedagangBiru',
          },
          words
        );
      }
    }
  });

  return null;
}

export function HotellingLaw({ words: wordsProp }: HotellingLawProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Load words and sentences
  const [words, setWords] = useState<WordTiming[]>(wordsProp ?? []);
  const [fontsReady, setFontsReady] = useState(false);
  const { delayRender, continueRender } = useDelayRender();

  useEffect(() => {
    let handle = delayRender();
    const abort = new AbortController();

    Promise.all([
      fetch(staticFile('hotelling-law/words.json'), { signal: abort.signal })
        .then((r) => r.json())
        .then((data) => setWords(parseWords(data, 30)))
        .catch(() => {}),
      Promise.race([
        document.fonts?.ready ?? Promise.resolve(),
        new Promise((res) => setTimeout(res, FONT_GUARD_MS)),
      ]).then(() => setFontsReady(true)),
    ]).finally(() => {
      continueRender(handle);
    });

    return () => abort.abort();
  }, [delayRender, continueRender]);

  const shot = shotAt(frame);
  const activeWordIdx = useMemo(() => activeWordIndex(words, frame), [words, frame]);
  const activeWord = words[activeWordIdx];

  // Hook Title banner in first 3s
  const showHook = frame >= HOOK.badgeIn && frame <= HOOK.outEnd;
  const shake = hookShakeAt(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: '#020617' }}>
      <style>{DIEGETIC_FONT_CSS}</style>

      {/* 3D Scene */}
      {fontsReady && (
        <ThreeCanvas
          width={width}
          height={height}
          style={{ width: '100%', height: '100%' }}
        >
          <ThreeStage frame={frame} words={words} />
        </ThreeCanvas>
      )}

      {/* Shot Location Chip */}
      {shot.chip && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: 54,
            padding: '8px 18px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: '2px solid rgba(251, 191, 36, 0.9)',
            borderRadius: 24,
            color: '#fbbf24',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 2,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {shot.chip}
        </div>
      )}

      {/* Opening Hook Title Slam */}
      {showHook && (
        <div
          style={{
            position: 'absolute',
            top: 140,
            left: 0,
            right: 0,
            textAlign: 'center',
            transform: `translateY(${shake * 12}px) scale(${1 + shake * 0.08})`,
            padding: '0 40px',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              backgroundColor: '#fbbf24',
              color: '#0f172a',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 900,
              fontSize: 24,
              padding: '6px 20px',
              borderRadius: 6,
              letterSpacing: 2,
              marginBottom: 12,
            }}
          >
            {HOOK.teaser}
          </div>
          <h1
            style={{
              margin: 0,
              color: '#ffffff',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 68,
              fontWeight: 900,
              lineHeight: 1.1,
              textShadow: '0 6px 24px rgba(0,0,0,0.8), 0 0 40px rgba(56, 189, 248, 0.4)',
            }}
          >
            {HOOK.title[0]}
            <br />
            <span style={{ color: '#38bdf8' }}>{HOOK.title[1]}</span>
          </h1>
        </div>
      )}

      {/* Kinetic Subtitles (2-lines, high contrast, active yellow highlight) */}
      {activeWord && (
        <div
          style={{
            position: 'absolute',
            bottom: 180,
            left: 60,
            right: 60,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '14px 28px',
              backgroundColor: 'rgba(15, 23, 42, 0.88)',
              borderRadius: 18,
              border: '2px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            }}
          >
            <span
              style={{
                color: '#ffffff',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 44,
                fontWeight: 900,
                lineHeight: 1.25,
                textShadow: '0 2px 8px #000000',
              }}
            >
              <span
                style={{
                  color: '#fbbf24',
                  textShadow: '0 0 16px rgba(251, 191, 36, 0.8)',
                  display: 'inline-block',
                  transform: 'scale(1.08)',
                }}
              >
                {activeWord.text}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Audio narration */}
      <Audio src={staticFile('hotelling-law/voice.wav')} />
    </AbsoluteFill>
  );
}
