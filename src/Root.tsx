import React from 'react';
import { Composition } from 'remotion';
import {
  Persis,
  PERSIS_DEFAULT_PROPS,
  calculatePersisMetadata,
} from './persis/Persis';
import {
  PERSIS_DURATION_IN_FRAMES,
  PERSIS_FPS,
  PERSIS_HEIGHT,
  PERSIS_WIDTH,
} from './persis/story';

export const RemotionRoot: React.FC = () => (
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
);
