import React from 'react';
import { Composition } from 'remotion';
import { Cikajang, CIKAJANG_DEFAULT_PROPS, calculateCikajangMetadata } from './cikajang/Cikajang';
import { CIKAJANG_DURATION_IN_FRAMES, CIKAJANG_FPS, CIKAJANG_HEIGHT, CIKAJANG_WIDTH } from './cikajang/story';
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
  <>
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
    <Composition
      id="Cikajang"
      component={Cikajang}
      durationInFrames={CIKAJANG_DURATION_IN_FRAMES}
      fps={CIKAJANG_FPS}
      width={CIKAJANG_WIDTH}
      height={CIKAJANG_HEIGHT}
      defaultProps={CIKAJANG_DEFAULT_PROPS}
      calculateMetadata={calculateCikajangMetadata}
    />
  </>
);
