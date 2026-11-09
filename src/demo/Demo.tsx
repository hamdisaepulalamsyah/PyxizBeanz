import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { createToonCharacter } from './toon';
import { WORLD_COLORS, createWorld } from './world';

export const DEMO_FPS = 30;
export const DEMO_DURATION_IN_FRAMES = 180;
export const DEMO_WIDTH = 1080;
export const DEMO_HEIGHT = 1920;

const CAMERA_FOV = 36;
const PUSH_END_FRAME = 160;

/** Medium shot → push-in, with a slight lateral drift so the move glides rather than dollies. */
const CAMERA_PATH = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 1.6, 4.2),
    new THREE.Vector3(0.05, 1.61, 3.82),
    new THREE.Vector3(0.035, 1.6, 3.46),
    new THREE.Vector3(0, 1.6, 3.2),
  ],
  false,
  'centripetal',
);
const LOOK_FROM = new THREE.Vector3(0, 1.4, 0);
const LOOK_TO = new THREE.Vector3(0, 1.43, -0.05);

const lookTarget = new THREE.Vector3();

const DeskScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = useThree((state) => state.camera);

  const { world, toon } = useMemo(() => {
    const w = createWorld();
    const t = createToonCharacter({ gradientMap: w.gradientMap });
    w.characterAnchor.add(t.mesh);
    return { world: w, toon: t };
  }, []);

  useEffect(() => {
    return () => {
      toon.dispose();
      world.dispose();
    };
  }, [world, toon]);

  // Layout effect: runs before <ThreeCanvas>'s frame renderer calls advance().
  useLayoutEffect(() => {
    const t = interpolate(frame, [0, PUSH_END_FRAME], [0, 1], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    // Arc-length parameterisation keeps speed governed purely by the easing curve.
    camera.position.copy(CAMERA_PATH.getPointAt(t));
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== CAMERA_FOV) {
      camera.fov = CAMERA_FOV;
      camera.updateProjectionMatrix();
    }
    lookTarget.lerpVectors(LOOK_FROM, LOOK_TO, t);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld();

    world.update(frame, fps);
    toon.update(frame, camera.position);
  }, [frame, fps, camera, world, toon]);

  return (
    <>
      <color attach="background" args={[WORLD_COLORS.background]} />
      <fog attach="fog" args={[WORLD_COLORS.fog, 7, 16]} />
      <primitive object={world.root} />
    </>
  );
};

export const Demo: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: WORLD_COLORS.background }}>
      <ThreeCanvas
        width={width}
        height={height}
        shadows="percentage"
        flat
        dpr={1}
        camera={{ fov: CAMERA_FOV, position: [0, 1.6, 4.2], near: 0.05, far: 40 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <DeskScene />
      </ThreeCanvas>
      {/* Paint-explainer finish: soft cool vignette over the warm centre. */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 75% 60% at 50% 45%, rgba(0,0,0,0) 55%, rgba(14, 8, 34, 0.55) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
