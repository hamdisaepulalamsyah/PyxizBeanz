import React from 'react';
import { Composition } from 'remotion';
import { Cikajang, CIKAJANG_DEFAULT_PROPS, calculateCikajangMetadata } from './cikajang/Cikajang';
import { CIKAJANG_DURATION_IN_FRAMES, CIKAJANG_FPS, CIKAJANG_HEIGHT, CIKAJANG_WIDTH } from './cikajang/story';
import { DodolGarut, DODOL_GARUT_DEFAULT_PROPS, calculateDodolGarutMetadata } from './dodol-garut/DodolGarut';
import { DG_DURATION_IN_FRAMES, DG_FPS, DG_HEIGHT, DG_WIDTH } from './dodol-garut/story';
import { JamGadang, JAM_GADANG_DEFAULT_PROPS, calculateJamGadangMetadata } from './jam-gadang/JamGadang';
import { JG_DURATION_IN_FRAMES, JG_FPS, JG_HEIGHT, JG_WIDTH } from './jam-gadang/story';
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
    <Composition
      id="JamGadang"
      component={JamGadang}
      durationInFrames={JG_DURATION_IN_FRAMES}
      fps={JG_FPS}
      width={JG_WIDTH}
      height={JG_HEIGHT}
      defaultProps={JAM_GADANG_DEFAULT_PROPS}
      calculateMetadata={calculateJamGadangMetadata}
    />
    <Composition
      id="DodolGarut"
      component={DodolGarut}
      durationInFrames={DG_DURATION_IN_FRAMES}
      fps={DG_FPS}
      width={DG_WIDTH}
      height={DG_HEIGHT}
      defaultProps={DODOL_GARUT_DEFAULT_PROPS}
      calculateMetadata={calculateDodolGarutMetadata}
    />
  </>
);
