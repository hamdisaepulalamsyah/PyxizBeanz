import React from 'react';
import { Composition } from 'remotion';
import { DEMO_DURATION_IN_FRAMES, DEMO_FPS, DEMO_HEIGHT, DEMO_WIDTH, Demo } from './demo/Demo';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    durationInFrames={DEMO_DURATION_IN_FRAMES}
    fps={DEMO_FPS}
    width={DEMO_WIDTH}
    height={DEMO_HEIGHT}
  />
);
