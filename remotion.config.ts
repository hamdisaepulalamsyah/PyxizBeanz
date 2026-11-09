import { Config } from '@remotion/cli/config';

// WebGL needs a GPU-backed (or ANGLE) renderer in headless Chromium.
Config.setChromiumOpenGlRenderer('angle');
