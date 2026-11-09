import React from 'react';
import { Composition } from 'remotion';
import { DEMO_DURATION_IN_FRAMES, DEMO_FPS, DEMO_HEIGHT, DEMO_WIDTH, Demo } from './demo/Demo';
import { PERSIS_DEFAULT_PROPS, Persis, calculatePersisMetadata } from './persis/Persis';
import { PERSIS_DURATION_IN_FRAMES, PERSIS_FPS, PERSIS_HEIGHT, PERSIS_WIDTH } from './persis/story';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={DEMO_DURATION_IN_FRAMES}
      fps={DEMO_FPS}
      width={DEMO_WIDTH}
      height={DEMO_HEIGHT}
    />
    <Composition
      id="Persis"
      component={Persis}
      durationInFrames={PERSIS_DURATION_IN_FRAMES}
      fps={PERSIS_FPS}
      width={PERSIS_WIDTH}
      height={PERSIS_HEIGHT}
      defaultProps={PERSIS_DEFAULT_PROPS}
      calculateMetadata={calculatePersisMetadata}
    />
  </>
);
